/**
 * DOCUMENT STUDIO — Review Dokumen Deterministik (src/ai-tools/document-ai/review.ts)
 *
 * Pemeriksaan kelengkapan & konsistensi internal TANPA AI (master prompt §F):
 * penanda belum terisi, field wajib, bagian scaffold, inkonsistensi label
 * yang sama, dan struktur dasar. Semua temuan adalah pemeriksaan internal —
 * BUKAN penilaian kepatuhan hukum, keabsahan, atau kelengkapan mutlak.
 *
 * Konservatif: hanya melaporkan yang terbukti dari teks. Tidak menebak.
 */

import type { DocTemplateMeta } from './docTemplates';
import type { ReviewFinding } from './types';

/** Hash sederhana & stabil untuk ID temuan (djb2). */
function stableId(kind: string, key: string): string {
  let h = 5381;
  const s = `${kind}|${key}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `rv_${kind}_${h.toString(36)}`;
}

export function stripHtml(input: string): string {
  return (input || '')
    // Tag blok menjadi pemisah baris agar struktur baris dokumen bertahan.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|table|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ');
}

/** Semua penanda [ISI: ...] yang belum terselesaikan di konten. */
export function scanIsiMarkers(content: string): string[] {
  const out: string[] = [];
  const re = /\[ISI:[^\]]*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || '')) !== null) out.push(m[0]);
  return out;
}

function finding(
  kind: string,
  key: string,
  severity: ReviewFinding['severity'],
  description: string,
  reason: string,
  suggestion: string,
  location?: string,
): ReviewFinding {
  return { id: stableId(kind, key), severity, description, location, reason, suggestion, status: 'open' };
}

/** Pecah scaffold menjadi segmen tingkat atas (koma di luar tanda kurung). */
function scaffoldSegments(scaffold: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of scaffold) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts
    // Awalan label kerangka ("Struktur:", "Khusus serah terima:") bukan isi bagian.
    .map((p) => p.replace(/^[^:]{0,40}:\s*/, '').replace(/\([^)]*\)/g, '').trim())
    .filter((p) => p.length >= 4)
    // Bagian kondisional ("bila relevan/ada/diberikan ...") tidak wajib ada.
    .filter((p) => !/bila (relevan|ada|perlu|diberikan)/i.test(p));
}

/** Kata kunci pembeda dari segmen scaffold: dua kata signifikan pertamanya. */
function segmentKeywords(seg: string): string[] {
  const stop = new Set(['dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'dengan', 'atau', 'pada', 'judul']);
  const words = seg
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  return words.slice(0, 2);
}

const DATE_LIKE = /\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4}|\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}/i;

/**
 * Nilai-nilai yang mengikuti label yang sama (mis. "Nomor:" / "Tanggal:").
 * Nilai diambil dari irisan teks SETELAH label sampai label berikutnya —
 * bukan tangkapan rakus, karena teks dokumen hasil strip tag bisa satu baris.
 */
function labeledValues(text: string, labelSource: string): string[] {
  const re = new RegExp(labelSource, 'gi');
  const matches = [...text.matchAll(re)];
  return matches
    .map((m, i) => {
      const start = (m.index ?? 0) + m[0].length;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : Math.min(text.length, start + 80);
      return text.slice(start, end).trim().replace(/\s+/g, ' ');
    })
    .filter(Boolean);
}

/**
 * Review deterministik atas konten draf (HTML atau teks biasa).
 * Mengembalikan daftar temuan; daftar kosong = tidak ada masalah internal
 * yang terdeteksi oleh pemeriksaan ini (bukan jaminan dokumen sempurna).
 */
export function reviewDocument(content: string, templateMeta?: DocTemplateMeta): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const raw = content || '';
  const text = stripHtml(raw);
  const lower = text.toLowerCase();

  if (!text.trim()) {
    findings.push(
      finding('empty', 'doc', 'high', 'Dokumen kosong — tidak ada isi yang dapat diperiksa.',
        'Konten tidak memiliki teks apa pun.', 'Isi dokumen terlebih dahulu sebelum review.'),
    );
    return findings;
  }

  // (a) Penanda [ISI: ...] belum terselesaikan → high.
  for (const marker of scanIsiMarkers(raw)) {
    findings.push(
      finding('isi', marker, 'high', `Penanda belum dilengkapi: ${marker}`,
        'Bagian ini ditandai AI/pembuat sebagai belum tersedia datanya.',
        'Lengkapi informasi pada penanda ini atau hapus bila tidak relevan.', marker),
    );
  }

  if (templateMeta) {
    // (b) Field wajib template yang labelnya tidak muncul di konten → medium.
    for (const f of templateMeta.fields) {
      if (!f.required || f.subtypeIds) continue;
      if (!lower.includes(f.label.toLowerCase())) {
        findings.push(
          finding('field', f.key, 'medium', `Field wajib "${f.label}" tidak ditemukan dalam dokumen.`,
            'Label field wajib template tidak muncul pada isi dokumen.',
            `Tambahkan bagian "${f.label}" beserta nilainya dari data yang sah.`),
        );
      }
    }

    // (c) Bagian scaffold yang hilang total → medium per bagian.
    for (const seg of scaffoldSegments(templateMeta.scaffold || '')) {
      const keys = segmentKeywords(seg);
      if (!keys.length) continue;
      const present = keys.some((k) => lower.includes(k));
      if (!present) {
        findings.push(
          finding('scaffold', seg, 'medium', `Bagian kerangka "${seg}" tampaknya belum ada dalam dokumen.`,
            'Tidak ditemukan kata kunci bagian ini pada isi dokumen.',
            `Tambahkan bagian "${seg}" sesuai kerangka template, atau abaikan bila memang tidak berlaku.`),
        );
      }
    }

    // (e2) Scaffold menyebut tabel tetapi dokumen tidak memiliki tabel → low.
    if (/tabel/i.test(templateMeta.scaffold) && !/<table[\s>]/i.test(raw) && !/\|[^|\n]+\|/.test(raw)) {
      findings.push(
        finding('table', 'scaffold', 'low', 'Kerangka menyebut tabel, tetapi dokumen tidak memiliki tabel.',
          'Template mengharapkan penyajian berbentuk tabel untuk bagian tertentu.',
          'Sajikan bagian terkait dalam bentuk tabel, atau abaikan bila tidak relevan.'),
      );
    }
  }

  // (d) Inkonsistensi label yang sama dengan nilai berbeda → high.
  // Nomor dibandingkan dari token pertamanya (nomor resmi tidak diawali spasi di tengah).
  const nomorValues = [
    ...new Set(labeledValues(text, '(?:Nomor(?:\\s+Dokumen|\\s+Surat)?|No\\.)\\s*:').map((v) => v.split(' ')[0])),
  ];
  if (nomorValues.length > 1) {
    findings.push(
      finding('nomor', nomorValues.join('¦'), 'high',
        `Nomor dokumen tidak konsisten: ditemukan ${nomorValues.length} nilai berbeda (${nomorValues.join(' vs ')}).`,
        'Label "Nomor" yang sama muncul dengan nilai berbeda di lebih dari satu tempat.',
        'Samakan nomor dokumen di seluruh bagian dengan nomor resmi yang berlaku.',
        nomorValues.join(' | ')),
    );
  }
  const tanggalValues = [
    ...new Set(
      labeledValues(text, 'Tanggal\\s*:')
        .map((v) => (v.match(DATE_LIKE)?.[0] ?? '').trim())
        .filter(Boolean),
    ),
  ];
  if (tanggalValues.length > 1) {
    findings.push(
      finding('tanggal', tanggalValues.join('¦'), 'high',
        `Tanggal dokumen tidak konsisten: ditemukan ${tanggalValues.length} nilai berbeda (${tanggalValues.join(' vs ')}).`,
        'Label "Tanggal" yang sama muncul dengan tanggal berbeda di lebih dari satu tempat.',
        'Samakan tanggal dokumen di seluruh bagian dengan tanggal resmi yang berlaku.',
        tanggalValues.join(' | ')),
    );
  }

  // (e1) Tanpa heading sama sekali → low.
  const hasHeading = /<h[1-6][\s>]/i.test(raw) || /^#{1,6}\s/m.test(raw) || /^[A-Z][A-Z0-9 ()/&.-]{5,}$/m.test(text);
  if (!hasHeading) {
    findings.push(
      finding('heading', 'doc', 'low', 'Dokumen tidak memiliki heading/judul bagian yang terdeteksi.',
        'Struktur dokumen rata tanpa penanda judul atau bagian.',
        'Tambahkan judul dokumen dan heading per bagian agar mudah ditinjau dan diekspor.'),
    );
  }

  return findings;
}

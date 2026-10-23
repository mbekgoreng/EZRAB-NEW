/**
 * DOCUMENT STUDIO — Review Dokumen Deterministik (src/ai-tools/document-ai/review.ts)
 *
 * Pemeriksaan kelengkapan & konsistensi internal TANPA AI (master prompt §F;
 * polish §7 untuk kategori + ringkasan): penanda belum terisi, field wajib,
 * bagian scaffold, inkonsistensi label yang sama, struktur dasar, saran
 * keterbacaan (bahasa), dan — hanya bila pemanggil memberi konteks —
 * nilai/tanggal di dokumen yang tidak ditemukan di data sumber yang diambil.
 * Semua temuan dikelompokkan per kategori (kelengkapan/konsistensi/struktur/
 * bahasa/sumber) dan adalah pemeriksaan internal — BUKAN penilaian kepatuhan
 * hukum, keabsahan, atau kelengkapan mutlak.
 *
 * Konservatif: hanya melaporkan yang terbukti dari teks. Tidak menebak.
 */

import type { DocTemplateMeta } from './docTemplates';
import type { ContextField, ReviewCategory, ReviewFinding, ReviewSeverity } from './types';

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
  category: ReviewCategory,
  description: string,
  reason: string,
  suggestion: string,
  location?: string,
): ReviewFinding {
  return { id: stableId(kind, key), severity, category, description, location, reason, suggestion, status: 'open' };
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
 * `contextFields` opsional: bila diberikan (dan memuat nilai), nilai uang &
 * tanggal eksplisit di konten yang tidak ditemukan pada nilai konteks mana
 * pun dilaporkan sebagai temuan kategori 'sumber' (bukan tuduhan — saran
 * verifikasi). Tanpa parameter ini, perilaku identik dengan versi lama.
 * Mengembalikan daftar temuan; daftar kosong = tidak ada masalah internal
 * yang terdeteksi oleh pemeriksaan ini (bukan jaminan dokumen sempurna).
 */
export function reviewDocument(content: string, templateMeta?: DocTemplateMeta, contextFields?: ContextField[]): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const raw = content || '';
  const text = stripHtml(raw);
  const lower = text.toLowerCase();

  if (!text.trim()) {
    findings.push(
      finding('empty', 'doc', 'high', 'kelengkapan', 'Dokumen kosong — tidak ada isi yang dapat diperiksa.',
        'Konten tidak memiliki teks apa pun.', 'Isi dokumen terlebih dahulu sebelum review.'),
    );
    return findings;
  }

  // (a) Penanda [ISI: ...] belum terselesaikan → high, kelengkapan.
  for (const marker of scanIsiMarkers(raw)) {
    findings.push(
      finding('isi', marker, 'high', 'kelengkapan', `Penanda belum dilengkapi: ${marker}`,
        'Bagian ini ditandai AI/pembuat sebagai belum tersedia datanya.',
        'Lengkapi informasi pada penanda ini atau hapus bila tidak relevan.', marker),
    );
  }

  if (templateMeta) {
    // (b) Field wajib template yang labelnya tidak muncul di konten → medium, kelengkapan.
    for (const f of templateMeta.fields) {
      if (!f.required || f.subtypeIds) continue;
      if (!lower.includes(f.label.toLowerCase())) {
        findings.push(
          finding('field', f.key, 'medium', 'kelengkapan', `Field wajib "${f.label}" tidak ditemukan dalam dokumen.`,
            'Label field wajib template tidak muncul pada isi dokumen.',
            `Tambahkan bagian "${f.label}" beserta nilainya dari data yang sah.`),
        );
      }
    }

    // (c) Bagian scaffold yang hilang total → medium per bagian, struktur.
    for (const seg of scaffoldSegments(templateMeta.scaffold || '')) {
      const keys = segmentKeywords(seg);
      if (!keys.length) continue;
      const present = keys.some((k) => lower.includes(k));
      if (!present) {
        findings.push(
          finding('scaffold', seg, 'medium', 'struktur', `Bagian kerangka "${seg}" tampaknya belum ada dalam dokumen.`,
            'Tidak ditemukan kata kunci bagian ini pada isi dokumen.',
            `Tambahkan bagian "${seg}" sesuai kerangka template, atau abaikan bila memang tidak berlaku.`),
        );
      }
    }

    // (e2) Scaffold menyebut tabel tetapi dokumen tidak memiliki tabel → low, struktur.
    if (/tabel/i.test(templateMeta.scaffold) && !/<table[\s>]/i.test(raw) && !/\|[^|\n]+\|/.test(raw)) {
      findings.push(
        finding('table', 'scaffold', 'low', 'struktur', 'Kerangka menyebut tabel, tetapi dokumen tidak memiliki tabel.',
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
      finding('nomor', nomorValues.join('¦'), 'high', 'konsistensi',
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
      finding('tanggal', tanggalValues.join('¦'), 'high', 'konsistensi',
        `Tanggal dokumen tidak konsisten: ditemukan ${tanggalValues.length} nilai berbeda (${tanggalValues.join(' vs ')}).`,
        'Label "Tanggal" yang sama muncul dengan tanggal berbeda di lebih dari satu tempat.',
        'Samakan tanggal dokumen di seluruh bagian dengan tanggal resmi yang berlaku.',
        tanggalValues.join(' | ')),
    );
  }

  // (e1) Tanpa heading sama sekali → low, struktur.
  const hasHeading = /<h[1-6][\s>]/i.test(raw) || /^#{1,6}\s/m.test(raw) || /^[A-Z][A-Z0-9 ()/&.-]{5,}$/m.test(text);
  if (!hasHeading) {
    findings.push(
      finding('heading', 'doc', 'low', 'struktur', 'Dokumen tidak memiliki heading/judul bagian yang terdeteksi.',
        'Struktur dokumen rata tanpa penanda judul atau bagian.',
        'Tambahkan judul dokumen dan heading per bagian agar mudah ditinjau dan diekspor.'),
    );
  }

  findings.push(...languageFindings(text));
  findings.push(...sourceFindings(text, contextFields));

  return findings;
}

/* ------------------------------------------------------------------ */
/* (f) Bahasa & keterbacaan — saran konservatif (low, kategori bahasa) */
/* ------------------------------------------------------------------ */

const MAX_LONG_SENTENCE_WORDS = 45;

function languageFindings(text: string): ReviewFinding[] {
  const out: ReviewFinding[] = [];

  // Kalimat sangat panjang → sulit dibaca; pecah menjadi dua kalimat.
  const sentences = text.split(/[.!?;\n]+/).map((s) => s.trim()).filter(Boolean);
  let longCount = 0;
  for (const s of sentences) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > MAX_LONG_SENTENCE_WORDS && longCount < 3) {
      longCount++;
      out.push(
        finding('kalimat', s.slice(0, 40), 'low', 'bahasa',
          `Kalimat sangat panjang (${words.length} kata): "${s.slice(0, 80)}${s.length > 80 ? '…' : ''}"`,
          'Kalimat melebihi ±45 kata cenderung sulit dipahami pembaca dokumen resmi.',
          'Pecah menjadi dua kalimat atau susun ulang agar satu kalimat menyampaikan satu gagasan.',
          s.slice(0, 80)),
      );
    }
  }

  // Kata yang sama berurutan ("yang yang") — hampir selalu salah ketik.
  const seenWords = new Set<string>();
  const dupRe = /\b([A-Za-zÀ-ÿ]{2,})\s+\1\b/gi;
  let m: RegExpExecArray | null;
  let dupCount = 0;
  while ((m = dupRe.exec(text)) !== null && dupCount < 3) {
    const w = m[1].toLowerCase();
    if (seenWords.has(w)) continue;
    seenWords.add(w);
    dupCount++;
    out.push(
      finding('kataganda', w, 'low', 'bahasa',
        `Kata berulang berurutan: "${m[0]}".`,
        'Dua kata yang sama berdampingan biasanya merupakan kesalahan ketik.',
        `Hapus salah satu pengulangan "${m[1]}" bila bukan reduplikasi yang disengaja.`,
        m[0]),
    );
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* (g) Sumber & verifikasi — hanya bila konteks diberikan (medium).    */
/* Nilai uang/tanggal eksplisit di konten yang tidak muncul pada nilai */
/* konteks mana pun. Bukan tuduhan data palsu: saran verifikasi.       */
/* ------------------------------------------------------------------ */

const MONTH_ID: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

const MAX_SOURCE_FINDINGS = 5;

function dateKey(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Semua kunci tanggal kanonik (YYYY-MM-DD) yang terbaca dari sebuah teks. */
function extractDateKeys(s: string): Array<{ key: string; literal: string }> {
  const out: Array<{ key: string; literal: string }> = [];
  // ISO (YYYY-MM-DD) dikenali lebih dulu; rentangnya ditandai agar pola
  // numerik DD-MM-YYYY tidak salah membaca "2026-10-12" sebagai 26-10-2012.
  const isoRanges: Array<[number, number]> = [];
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  let im: RegExpExecArray | null;
  while ((im = isoRe.exec(s)) !== null) {
    const key = dateKey(Number(im[1]), Number(im[2]), Number(im[3]));
    if (key) {
      out.push({ key, literal: im[0] });
      isoRanges.push([im.index, im.index + im[0].length]);
    }
  }
  const inIso = (idx: number) => isoRanges.some(([a, b]) => idx >= a && idx < b);
  const named = /(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = named.exec(s)) !== null) {
    const key = dateKey(Number(m[3]), MONTH_ID[m[2].toLowerCase()] ?? 0, Number(m[1]));
    if (key) out.push({ key, literal: m[0] });
  }
  const numeric = /\b(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})\b/g;
  while ((m = numeric.exec(s)) !== null) {
    if (inIso(m.index)) continue;
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const key = dateKey(y, Number(m[2]), Number(m[1]));
    if (key) out.push({ key, literal: m[0] });
  }
  return out;
}

/** Kunci perbandingan nilai uang: digit saja, tanpa nol di depan. */
function moneyKey(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

function sourceFindings(text: string, contextFields?: ContextField[]): ReviewFinding[] {
  if (!contextFields) return [];
  const usable = contextFields.filter((f) => f.value && f.value.trim());
  if (!usable.length) return [];

  const out: ReviewFinding[] = [];

  // Basis perbandingan dari nilai konteks.
  const contextMoneyKeys = new Set<string>();
  const contextDateKeys = new Set<string>();
  for (const f of usable) {
    const digits = moneyKey(f.value);
    if (digits.length >= 3) contextMoneyKeys.add(digits);
    const iso = f.value.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) contextDateKeys.add(`${iso[1]}-${iso[2]}-${iso[3]}`);
    for (const dk of extractDateKeys(f.value)) contextDateKeys.add(dk.key);
  }

  // Nilai uang eksplisit di konten ("Rp 850.000.000" / "Rp 1.500.000,00").
  const moneyRe = /Rp\.?\s*\d[\d.]*(?:,\d{1,2})?/g;
  const seenMoney = new Set<string>();
  let mm: RegExpExecArray | null;
  while ((mm = moneyRe.exec(text)) !== null && out.length < MAX_SOURCE_FINDINGS) {
    const literal = mm[0].trim();
    // Desimal selain ",00" tidak dinormalisasi — lewati agar tidak salah tuduh.
    if (/,\d{1,2}$/.test(literal) && !/,00$/.test(literal)) continue;
    const body = literal.replace(/^Rp\.?\s*/i, '').replace(/,00$/, '');
    const key = moneyKey(body);
    if (!/^\d+$/.test(key) || key.length < 3 || seenMoney.has(key)) continue;
    seenMoney.add(key);
    if (!contextMoneyKeys.has(key)) {
      out.push(
        finding('sumber-uang', key, 'medium', 'sumber',
          `Nilai "${literal}" muncul di dokumen tetapi tidak ditemukan di data sumber yang diambil.`,
          'Pemeriksaan sumber hanya membandingkan dengan nilai konteks proyek/perusahaan yang diambil untuk dokumen ini.',
          'Verifikasi nilai ini terhadap dokumen sumber resminya; bila benar dari sumber lain, abaikan temuan ini.',
          literal),
      );
    }
  }

  // Tanggal eksplisit di konten.
  const seenDates = new Set<string>();
  for (const dk of extractDateKeys(text)) {
    if (out.length >= MAX_SOURCE_FINDINGS) break;
    if (seenDates.has(dk.key)) continue;
    seenDates.add(dk.key);
    if (!contextDateKeys.has(dk.key)) {
      out.push(
        finding('sumber-tanggal', dk.key, 'medium', 'sumber',
          `Tanggal "${dk.literal}" muncul di dokumen tetapi tidak ditemukan di data sumber yang diambil.`,
          'Pemeriksaan sumber hanya membandingkan dengan nilai konteks proyek/perusahaan yang diambil untuk dokumen ini.',
          'Verifikasi tanggal ini terhadap dokumen sumber resminya; tanggal dokumen itu sendiri memang tidak selalu berasal dari data proyek.',
          dk.literal),
      );
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Ringkasan temuan untuk panel review (polish §7)                     */
/* ------------------------------------------------------------------ */

export interface ReviewSummary {
  total: number;
  /** Temuan yang masih berstatus 'open'. */
  open: number;
  bySeverity: Record<ReviewSeverity, number>;
  byCategory: Record<ReviewCategory, number>;
  /** Temuan kelengkapan berjenis field-wajib / penanda [ISI:] yang belum terisi. */
  missingRequired: number;
}

/**
 * Agregasi temuan untuk ringkasan review. missingRequired dihitung dari
 * kategori 'kelengkapan' dengan jenis temuan 'isi' ([ISI: ...]) atau
 * 'field' (field wajib template) — jenis terbaca dari awalan ID temuan
 * yang dibuat modul ini sendiri (rv_<jenis>_<hash>).
 */
export function summarizeFindings(findings: ReviewFinding[]): ReviewSummary {
  const bySeverity: Record<ReviewSeverity, number> = { high: 0, medium: 0, low: 0 };
  const byCategory: Record<ReviewCategory, number> = {
    kelengkapan: 0, konsistensi: 0, struktur: 0, bahasa: 0, sumber: 0,
  };
  let open = 0;
  let missingRequired = 0;
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    if (f.status === 'open') open++;
    const kind = f.id.split('_')[1];
    if (f.category === 'kelengkapan' && (kind === 'isi' || kind === 'field')) missingRequired++;
  }
  return { total: findings.length, open, bySeverity, byCategory, missingRequired };
}

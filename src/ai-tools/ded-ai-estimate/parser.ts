/**
 * DED AI ESTIMATE — Parser (src/ai-tools/ded-ai-estimate/parser.ts)
 * Self-contained PDF parsing for the DED AI Estimate product. Extracts per-page
 * native text (and optionally a preview image) using pdfjs-dist. Does NOT import
 * AHSP, price resolver, HSD, master registry, official price DB, or project price engine.
 */

import { aiToolsError, AIToolsStructuredError } from '../types';
import { loadPdfjs } from '../../lib/pdfjsSetup';

export interface DedParsedPage {
  page: number;
  title: string;
  text: string;
  previewDataUrl?: string;
  pageType: string;
}

export interface DedParsedDocument {
  fileName: string;
  pageCount: number;
  pages: DedParsedPage[];
}

function toUint8Array(buffer: ArrayBuffer | Uint8Array | Buffer | string): Uint8Array {
  if (typeof buffer === 'string') return new TextEncoder().encode(buffer);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }
  if (buffer instanceof Uint8Array) {
    return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }
  return new Uint8Array(buffer);
}

/**
 * Klasifikasi jenis halaman dari teks hasil ekstraksi pdfjs.
 *
 * FASE P0 (2026-10-21): urutan diperbaiki — frasa SPESIFIK pada judul
 * diperiksa SEBELUM kata umum "denah". Cara lama memeriksa 'denah' lebih
 * dulu sehingga DENAH KUSEN, DENAH INSTALASI, DENAH PLAFOND, DENAH KERAMIK,
 * DENAH SLOOF/RINGBALK/PELAT semuanya jatuh ke DENAH (bukti fixture 32
 * halaman: MEP 0, JADWAL_KUSEN 0, 16 halaman DENAH).
 *
 * Jenis baru (kompatibel tambahan, jenis lama tidak dihapus):
 * DETAIL_KUSEN, PLAFOND, LANTAI, MEP_PLUMBING, MEP_ELECTRICAL, SANITAIR.
 *
 * Judul diambil dari frasa judul pertama di teks (pola yang sama dengan
 * ekstraksi `title` di parseDedPdf) — teks CAD mentah menaruh judul di
 * awal/akhir halaman, bukan selalu di karakter pertama.
 */
export function classifyPageTitle(text: string): string {
  const lower = text.toLowerCase();
  const titleMatch = text.match(/(?:denah|tampak|potongan|detail|gambar|lembar|jadwal|daftar|skala)\s+[^,\n]{0,60}/i);
  const t = (titleMatch ? titleMatch[0] : text.slice(0, 200)).toLowerCase().trim();

  // === 1. Judul terjangkar: kata kunci utama di AWAL frasa judul ===
  // Kualifikasi harus menempel pada kata kunci judul ("DENAH KUSEN",
  // "DETAIL ATAP"). Kata yang sama di tengah jendela judul (label di dalam
  // gambar potongan, catatan "Plafond +3.20") TIDAK boleh membajak jenis.
  const instalasiType = (s: string): string => {
    if (
      s.includes('air bersih') || s.includes('air kotor') || s.includes('plambing') ||
      s.includes('plumbing') || s.includes('sanitair') || s.includes('pipa')
    ) return 'MEP_PLUMBING';
    if (s.includes('listrik') || s.includes('elektrikal') || s.includes('penerangan') || s.includes('daya')) {
      return 'MEP_ELECTRICAL';
    }
    return 'MEP';
  };
  if (/^detail\s+kusen/.test(t)) return 'DETAIL_KUSEN';
  if (/^(jadwal|daftar)\s+kusen/.test(t)) return 'JADWAL_KUSEN';
  if (/^denah\s+kusen/.test(t)) return 'JADWAL_KUSEN';
  if (/^denah\s+instalasi/.test(t) || /^instalasi/.test(t)) return instalasiType(t);
  if (/^denah\s+(plafond|plafon)/.test(t) || /^(plafond|plafon)/.test(t)) return 'PLAFOND';
  if (/^denah\s+keramik/.test(t) || /^pola\s+lantai/.test(t)) return 'LANTAI';
  if (/^denah\s+wc\b/.test(t) || /^sanitair/.test(t)) return 'SANITAIR';
  if (
    /^denah\s+(pondasi|sloof|kolom|ringbalk|ring balk|pelat|balok|footplat|pile cap|struktur)/.test(t) ||
    /^(pondasi|sloof|kolom|ringbalk|ring balk|pelat|balok)/.test(t)
  ) return 'STRUKTUR';
  if (/^denah\s+atap/.test(t) || /^detail\s+atap/.test(t) || /^atap/.test(t)) return 'ATAP';
  if (/^denah\s+situasi/.test(t)) return 'SITUASI';
  if (/^gambar/.test(t) && (t.includes('mekanikal') || t.includes('elektrikal'))) return 'MEP';
  if (/^gambar/.test(t) && t.includes('struktur')) return 'STRUKTUR';
  if (/^tampak/.test(t)) return 'TAMPAK';
  if (/^potongan/.test(t)) return 'POTONGAN';
  if (/^denah/.test(t)) return 'DENAH';

  // === 2. Aturan isi dokumen (perilaku lama, dipertahankan) ===
  if (lower.includes('rks') || lower.includes('spesifikasi') || lower.includes('rencana kerja')) return 'SPESIFIKASI';
  if (lower.includes('detail kusen')) return 'DETAIL_KUSEN';
  if (lower.includes('kusen')) return 'DETAIL_KUSEN';
  if (lower.includes('pondasi') || lower.includes('kolom') || lower.includes('balok') || lower.includes('struktur')) return 'STRUKTUR';
  if (lower.includes('potongan') || lower.includes('section')) return 'POTONGAN';
  if (lower.includes('tampak') || lower.includes('elevation')) return 'TAMPAK';
  if (lower.includes('atap') || lower.includes('roof')) return 'ATAP';
  // 'situasi' saja — kata 'site' polos adalah jebakan substring ("arSITEktur").
  if (lower.includes('situasi') || lower.includes('site plan')) return 'SITUASI';
  if (lower.includes('denah') || lower.includes('floor')) return 'DENAH';
  if (lower.includes('jadwal kusen') || lower.includes('schedule')) return 'JADWAL_KUSEN';
  if (lower.includes('instalasi air') || lower.includes('plambing') || lower.includes('plumbing')) return 'MEP_PLUMBING';
  if (lower.includes('instalasi listrik')) return 'MEP_ELECTRICAL';
  if (lower.includes('mep') || lower.includes('instalasi')) return 'MEP';
  if (lower.includes('listrik') || lower.includes('elektrikal')) return 'MEP_ELECTRICAL';
  if (lower.includes('mekanikal')) return 'MEP';
  return 'HALAMAN';
}

export async function parseDedPdf(
  buffer: ArrayBuffer | Uint8Array | Buffer | string,
  fileName: string,
  options: { withImages?: boolean; maxPages?: number } = {}
): Promise<DedParsedDocument | AIToolsStructuredError> {
  const bytes = toUint8Array(buffer);
  if (bytes.length === 0) {
    return aiToolsError('PDF_RENDER_ERROR', 'ded-parse:load', 'Berkas PDF kosong (0 byte).');
  }

  try {
    const pdfjs = await loadPdfjs();
    const isNode = typeof window === 'undefined';

    if (isNode) {
      try {
        const canvasName = '@napi-rs/canvas';
        const canvas = await import(/* @vite-ignore */ canvasName);
        (globalThis as any).Path2D = canvas.Path2D;
        (globalThis as any).ImageData = canvas.ImageData;
        (globalThis as any).Image = canvas.Image;
        (globalThis as any).DOMMatrix = canvas.DOMMatrix;
      } catch {
        /* image preview unavailable; text still works */
      }
    }

    const data = bytes;
    const doc = await (pdfjs.getDocument({ data, useSystemFonts: true }) as any).promise;
    const numPages = doc.numPages;
    if (numPages === 0) {
      return aiToolsError('PDF_RENDER_ERROR', 'ded-parse:load', 'PDF tidak memiliki halaman.');
    }
    const maxP = options.maxPages ? Math.min(options.maxPages, numPages) : numPages;

    const pages: DedParsedPage[] = [];
    for (let p = 1; p <= maxP; p++) {
      const page = await (doc.getPage(p) as any);
      const viewport = page.getViewport({ scale: 1 });

      let text = '';
      try {
        const tc = await page.getTextContent();
        text = tc.items
          .map((it: any) => it.str || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      } catch {
        text = '';
      }

      let previewDataUrl: string | undefined;
      if (options.withImages) {
        try {
          if (isNode) {
            const canvasName = '@napi-rs/canvas';
            const canvasMod = await import(/* @vite-ignore */ canvasName);
            const canvas = canvasMod.createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
            const ctx = canvas.getContext('2d');
            await (page.render({ canvasContext: ctx, viewport } as any) as any).promise;
            previewDataUrl = canvas.toDataURL('image/png');
          } else {
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              await (page.render({ canvasContext: ctx as any, viewport } as any) as any).promise;
              previewDataUrl = canvas.toDataURL('image/png');
            }
          }
        } catch {
          previewDataUrl = undefined;
        }
      }

      const title = (text.match(/(?:denah|tampak|potongan|detail|gambar|lembar|skala)\s+[^,\n]{0,60}/i) || [])[0] || `Page ${p}`;
      pages.push({ page: p, title, text, previewDataUrl, pageType: classifyPageTitle(text) });
    }

    return { fileName, pageCount: pages.length, pages };
  } catch (err: any) {
    return aiToolsError('PDF_RENDER_ERROR', 'ded-parse:load', `Gagal membaca PDF: ${err?.message || 'unknown'}`, {
      retryable: false,
    });
  }
}

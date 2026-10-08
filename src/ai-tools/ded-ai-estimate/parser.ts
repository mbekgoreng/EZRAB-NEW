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

function classifyPageTitle(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('rks') || lower.includes('spesifikasi') || lower.includes('rencana kerja')) return 'SPESIFIKASI';
  if (lower.includes('pondasi') || lower.includes('kolom') || lower.includes('balok') || lower.includes('struktur')) return 'STRUKTUR';
  if (lower.includes('potongan') || lower.includes('section')) return 'POTONGAN';
  if (lower.includes('tampak') || lower.includes('elevation')) return 'TAMPAK';
  if (lower.includes('atap') || lower.includes('roof')) return 'ATAP';
  if (lower.includes('site') || lower.includes('situasi')) return 'SITUASI';
  if (lower.includes('denah') || lower.includes('floor')) return 'DENAH';
  if (lower.includes('detail kusen') || lower.includes('schedule')) return 'JADWAL_KUSEN';
  if (lower.includes('mep') || lower.includes('instalasi') || lower.includes('listrik') || lower.includes('air')) return 'MEP';
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

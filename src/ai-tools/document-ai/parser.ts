/**
 * DOKUMEN AI — Document Parser (src/ai-tools/document-ai/parser.ts)
 * Extracts plain text from PDF, DOCX, and XLSX files. Self-contained; no data
 * from AHSP/price engines. Answers flow only from this extracted text.
 */

export interface ParsedDocument {
  fileName: string;
  kind: 'pdf' | 'docx' | 'xlsx' | 'text' | 'unknown';
  text: string;
  pages?: number;
  tables?: Array<Array<Array<string>>>;
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

export async function parseDocument(
  buffer: ArrayBuffer | Uint8Array | Buffer | string,
  fileName: string,
  mimeType?: string
): Promise<ParsedDocument> {
  const lower = fileName.toLowerCase();
  const isPdf = mimeType?.includes('pdf') || lower.endsWith('.pdf');
  const isDocx = mimeType?.includes('word') || lower.endsWith('.docx') || lower.endsWith('.doc');
  const isXlsx = mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || lower.endsWith('.xlsx') || lower.endsWith('.xls');
  const isTxt = lower.endsWith('.txt') || lower.endsWith('.csv') || mimeType?.startsWith('text/');

  const bytes = toUint8Array(buffer);
  if (bytes.length === 0) return { fileName, kind: 'unknown', text: '' };

  try {
    if (isPdf) {
      const isNode = typeof window === 'undefined';
      const pdfjs = isNode
        ? await import('pdfjs-dist/legacy/build/pdf.mjs')
        : await import('pdfjs-dist');

      const doc = await (pdfjs.getDocument({ data: bytes, useSystemFonts: true }) as any).promise;
      const pages: string[] = [];
      const max = Math.min(doc.numPages, 150);
      for (let p = 1; p <= max; p++) {
        const page = await (doc.getPage(p) as any);
        const tc = await page.getTextContent();
        const t = tc.items
          .map((it: any) => it.str || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        pages.push(t);
      }
      return { fileName, kind: 'pdf', text: pages.join('\n\n'), pages: max };
    }

    if (isDocx) {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(bytes);
      const docEntry = zip.file('word/document.xml');
      if (!docEntry) return { fileName, kind: 'docx', text: '' };
      const xml = await docEntry.async('string');
      const plain = xml
        .replace(/<w:p[ >]/g, '\n')
        .replace(/<w:tab[^>]*>/g, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim()
        .replace(/&amp;/g, '&');
      return { fileName, kind: 'docx', text: plain };
    }

    if (isXlsx) {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheets = wb.SheetNames;
      const rows: string[] = [];
      const tables: Array<Array<Array<string>>> = [];
      for (const name of sheets) {
        const ws = wb.Sheets[name];
        const mat: Array<Array<string>> = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        tables.push(mat);
        rows.push(`/// SHEET: ${name}`);
        for (const r of mat) {
          const clean = r.map((c: any) => String(c ?? '').trim()).join(' | ');
          if (clean.trim()) rows.push(clean);
        }
      }
      return { fileName, kind: 'xlsx', text: rows.join('\n'), tables };
    }

    if (isTxt) {
      const text = new TextDecoder('utf-8').decode(bytes);
      return { fileName, kind: 'text', text };
    }

    return { fileName, kind: 'unknown', text: '' };
  } catch (err: any) {
    throw new Error(`Dokumen AI gagal membaca file: ${err?.message || 'unknown'}`);
  }
}

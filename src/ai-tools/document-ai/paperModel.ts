/**
 * AI DOKUMEN — Paper Model (Fase B3 Paper System).
 *
 * Satu sumber struktur dokumen untuk ekspor: HTML editor (TipTap) diubah
 * menjadi daftar blok netral (PaperBlock) yang dirender identik oleh
 * generator PDF dan DOCX di paperExport.ts. Parser berbasis string (tanpa
 * DOMParser) agar hasil identik di browser dan node (tes), mengikuti pola
 * richText.ts.
 *
 * Keterbatasan yang disadari: sel tabel diratakan menjadi teks (format
 * inline di dalam sel tidak dipertahankan); gambar hanya diteruskan bila
 * src berupa data URL / URL yang dapat diambil generator.
 */

export interface PaperRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export type PaperAlign = 'left' | 'center' | 'right' | 'justify';

export type PaperBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string; align?: PaperAlign }
  | { type: 'paragraph'; runs: PaperRun[]; align?: PaperAlign }
  | { type: 'list'; ordered: boolean; items: PaperRun[][] }
  | { type: 'table'; header: string[] | null; rows: string[][] }
  | { type: 'hr' }
  | { type: 'image'; src: string; alt?: string }
  | { type: 'pageBreak' };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
}

function alignOf(attrs: string): PaperAlign | undefined {
  const m = attrs.match(/text-align\s*:\s*(left|center|right|justify)/i);
  if (m) return m[1].toLowerCase() as PaperAlign;
  if (/text-align-center/.test(attrs)) return 'center';
  if (/text-align-right/.test(attrs)) return 'right';
  if (/text-align-justify/.test(attrs)) return 'justify';
  return undefined;
}

interface InlineFlags { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean }

/** Parser run inline kecil: menangani strong/b/em/i/u/s (+span/a transparan). */
export function parseRuns(innerHtml: string): PaperRun[] {
  const runs: PaperRun[] = [];
  const stack: InlineFlags[] = [];
  const tokenRe = /<(\/?)(strong|b|em|i|u|s|strike|span|a|mark|code)\b[^>]*>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  const current = (): InlineFlags => {
    const f: InlineFlags = {};
    for (const s of stack) Object.assign(f, s);
    return f;
  };
  while ((m = tokenRe.exec(innerHtml)) !== null) {
    if (m[3] !== undefined) {
      const text = decodeEntities(m[3]).replace(/\s+/g, ' ');
      if (text) runs.push({ text, ...current() });
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (closing) {
      stack.pop();
    } else if (tag === 'strong' || tag === 'b') stack.push({ bold: true });
    else if (tag === 'em' || tag === 'i') stack.push({ italic: true });
    else if (tag === 'u') stack.push({ underline: true });
    else if (tag === 's' || tag === 'strike') stack.push({ strike: true });
    else stack.push({});
  }
  // Gabung run bersebelahan dengan flag sama; rapikan spasi tepi.
  const merged: PaperRun[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.bold === r.bold && last.italic === r.italic &&
      last.underline === r.underline && last.strike === r.strike
    ) {
      last.text += r.text;
    } else {
      merged.push({ ...r });
    }
  }
  if (merged.length) {
    merged[0].text = merged[0].text.replace(/^\s+/, '');
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, '');
  }
  return merged.filter((r) => r.text.length > 0);
}

function parseTable(tableHtml: string): PaperBlock {
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let header: string[] | null = null;
  const rows: string[][] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    const kinds: string[] = [];
    let cm: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      kinds.push(cm[1].toLowerCase());
      cells.push(stripTags(cm[2]));
    }
    if (cells.length === 0) continue;
    if (header === null && kinds.every((k) => k === 'th')) header = cells;
    else rows.push(cells);
  }
  return { type: 'table', header, rows };
}

/** Konversi HTML editor → blok kertas netral. */
export function htmlToPaperBlocks(html: string): PaperBlock[] {
  const blocks: PaperBlock[] = [];
  const src = (html || '').replace(/\r\n/g, '\n');
  const blockRe =
    /<(h[1-3]|p|ul|ol|table|blockquote|pre|hr|img)\b([^>]*)>(?:([\s\S]*?)<\/\1>)?/gi;
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  const pushLooseText = (chunk: string) => {
    const text = stripTags(chunk);
    if (text) blocks.push({ type: 'paragraph', runs: [{ text }] });
  };
  while ((m = blockRe.exec(src)) !== null) {
    if (m.index > lastIndex) pushLooseText(src.slice(lastIndex, m.index));
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    const inner = m[3] || '';
    if (tag === 'hr') {
      blocks.push({ type: 'hr' });
    } else if (tag === 'img') {
      const sm = attrs.match(/src="([^"]+)"/i);
      if (sm) blocks.push({ type: 'image', src: sm[1] });
    } else if (tag.startsWith('h')) {
      const text = stripTags(inner);
      if (text) {
        blocks.push({
          type: 'heading',
          level: parseInt(tag[1], 10) as 1 | 2 | 3,
          text,
          align: alignOf(attrs),
        });
      }
    } else if (tag === 'table') {
      blocks.push(parseTable(inner));
    } else if (tag === 'ul' || tag === 'ol') {
      const items: PaperRun[][] = [];
      const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let lm: RegExpExecArray | null;
      while ((lm = liRe.exec(inner)) !== null) {
        const runs = parseRuns(lm[1].replace(/<\/?p\b[^>]*>/gi, ''));
        if (runs.length) items.push(runs);
      }
      if (items.length) blocks.push({ type: 'list', ordered: tag === 'ol', items });
    } else {
      // p / blockquote / pre
      const withBreaks = inner.replace(/<br\s*\/?>/gi, '\n');
      const parts = withBreaks.split('\n');
      for (const part of parts) {
        const runs = parseRuns(part);
        if (runs.length) blocks.push({ type: 'paragraph', runs, align: alignOf(attrs) });
      }
    }
    lastIndex = blockRe.lastIndex;
  }
  if (lastIndex < src.length) pushLooseText(src.slice(lastIndex));
  return blocks;
}

/** Teks polos seluruh blok (untuk pencarian/pratinjau/aksesibilitas). */
export function paperBlocksToText(blocks: PaperBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') out.push(b.text);
    else if (b.type === 'paragraph') out.push(b.runs.map((r) => r.text).join(''));
    else if (b.type === 'list') for (const it of b.items) out.push(`• ${it.map((r) => r.text).join('')}`);
    else if (b.type === 'table') {
      if (b.header) out.push(b.header.join(' | '));
      for (const row of b.rows) out.push(row.join(' | '));
    }
  }
  return out.join('\n');
}

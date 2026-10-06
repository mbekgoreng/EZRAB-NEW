/**
 * SHARED — AHSP 2026 extraction core.
 *
 * The SE DJBK No. 47/SE/Dk/2026 attachments are all text-based PDFs whose AHSP
 * analysis tables must be reconstructed from glyph coordinates, because
 * `getTextContent()` returns a flat stream of fragments and joining them with
 * spaces destroys the table rows (koefisien / satuan / komponen must stay on one
 * visual row).
 *
 * Reconstruction rule:
 *   - y = transform[5]  → baseline. Fragments sharing a baseline are one row.
 *   - x = transform[4]  → horizontal order within the row.
 *   - A visible horizontal gap (> GAP_THRESHOLD) becomes a 2-space column break.
 *
 * Read-only with respect to the source PDFs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const ROW_TOLERANCE = 3.0;
export const GAP_THRESHOLD = 6.0;

export interface SourceSpec {
  /** Short key used in output filenames. */
  key: string;
  /** Attachment label: 'I' | 'II' | 'III' | 'IV' | 'VI'. */
  attachment: string;
  /** Field label used in the master dataset. */
  field: string;
  /** Absolute path to the official PDF. */
  pdfPath: string;
}

/** A reconstructed row from a PDF page. */
export interface RawPage {
  raw_id: string;
  source_file: string;
  source_attachment: string;
  source_page: number;
  chars: number;
  raw_lines: string[];
  /** raw_text = raw_lines joined by '\n' — kept for §7 compliance. */
  raw_text: string;
}

export function reconstructLines(items: any[]): string[] {
  interface Frag { x: number; y: number; str: string; width: number }
  const frags: Frag[] = [];
  for (const it of items) {
    if (typeof it?.str !== 'string') continue;
    const tr = it.transform;
    if (!Array.isArray(tr) || tr.length < 6) continue;
    frags.push({
      x: tr[4],
      y: tr[5],
      str: it.str,
      width: typeof it.width === 'number' ? it.width : 0,
    });
  }
  if (frags.length === 0) return [];

  const rows: { y: number; parts: Frag[] }[] = [];
  for (const f of frags) {
    let target = rows.find((r) => Math.abs(r.y - f.y) <= ROW_TOLERANCE);
    if (!target) { target = { y: f.y, parts: [] }; rows.push(target); }
    target.parts.push(f);
  }
  // Descending y = printed top-to-bottom for these producers (verified on the TOC).
  rows.sort((a, b) => b.y - a.y);

  const out: string[] = [];
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd: number | null = null;
    for (const p of row.parts) {
      if (prevEnd !== null && p.x - prevEnd > GAP_THRESHOLD) line += '  ';
      line += p.str;
      prevEnd = p.x + p.width;
    }
    const cleaned = line.replace(/[ \t]+$/g, '');
    if (cleaned.trim().length > 0) out.push(cleaned);
  }
  return out;
}

export async function loadPdf(pdfPath: string): Promise<any> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  return pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
}

/**
 * Extract every page of `spec` into `outPath` as JSONL of RawPage.
 * Idempotent: a full run truncates the target first.
 */
export async function extractSource(spec: SourceSpec, outPath: string): Promise<void> {
  if (!fs.existsSync(spec.pdfPath)) throw new Error(`NOT FOUND: ${spec.pdfPath}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const doc = await loadPdf(spec.pdfPath);
  const N: number = doc.numPages;
  const fileName = path.basename(spec.pdfPath);

  console.log(`[extract] ${spec.attachment} (${spec.field})  pages=${N}`);
  const stream = fs.createWriteStream(outPath, { flags: 'w' });
  const started = Date.now();
  let empty = 0, thin = 0, totalChars = 0;

  for (let pageNo = 1; pageNo <= N; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const lines = reconstructLines(content.items as any[]);
    const chars = lines.reduce((a, l) => a + l.length, 0);
    totalChars += chars;
    if (chars === 0) empty++; else if (chars < 200) thin++;

    const rec: RawPage = {
      raw_id: `${spec.key}-RAW-${String(pageNo).padStart(5, '0')}`,
      source_file: fileName,
      source_attachment: spec.attachment,
      source_page: pageNo,
      chars,
      raw_lines: lines,
      raw_text: lines.join('\n'),
    };
    stream.write(JSON.stringify(rec) + '\n');
    page.release?.();

    if (pageNo % 250 === 0 || pageNo === N) {
      const el = ((Date.now() - started) / 1000).toFixed(0);
      const pct = ((pageNo / N) * 100).toFixed(1);
      console.log(`  ${String(pageNo).padStart(5)}/${N}  ${pct.padStart(5)}%  ${el}s  empty=${empty} thin=${thin}`);
    }
  }
  await new Promise<void>((res) => stream.end(res));
  await doc.destroy?.();
  console.log(`[extract] done ${spec.attachment}: pages=${N} chars=${totalChars.toLocaleString()} empty=${empty} thin=${thin} -> ${path.relative(process.cwd(), outPath)}`);
}

export function readJsonl<T>(p: string): T[] {
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as T);
}

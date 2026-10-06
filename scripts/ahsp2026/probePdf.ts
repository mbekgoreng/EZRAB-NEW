/**
 * PROBE — SE DJBK No. 47/SE/Dk/2026 attachments.
 *
 * Answers, for each source PDF: is it text-based or scanned, how many pages,
 * and does the AHSP table structure survive text extraction?
 *
 * Read-only. Writes nothing. Prints a report to stdout.
 *
 * Usage: npx tsx scripts/ahsp2026/probePdf.ts <pdf> [<pdf> ...]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROW_TOLERANCE = 3.0;

/** Reconstruct visual rows from pdfjs fragments (baseline grouping + x sort). */
function reconstructLines(items: any[]): string[] {
  interface Frag { x: number; y: number; str: string; width: number }
  const frags: Frag[] = [];
  for (const it of items) {
    if (typeof it?.str !== 'string') continue;
    const tr = it.transform;
    if (!Array.isArray(tr) || tr.length < 6) continue;
    frags.push({ x: tr[4], y: tr[5], str: it.str, width: typeof it.width === 'number' ? it.width : 0 });
  }
  if (frags.length === 0) return [];
  const rows: { y: number; parts: Frag[] }[] = [];
  for (const f of frags) {
    let target = rows.find((r) => Math.abs(r.y - f.y) <= ROW_TOLERANCE);
    if (!target) { target = { y: f.y, parts: [] }; rows.push(target); }
    target.parts.push(f);
  }
  rows.sort((a, b) => b.y - a.y);
  const out: string[] = [];
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd: number | null = null;
    for (const p of row.parts) {
      if (prevEnd !== null) {
        const gap = p.x - prevEnd;
        if (gap > 6) line += '  ';
      }
      line += p.str;
      prevEnd = p.x + p.width;
    }
    const cleaned = line.replace(/[ \t]+$/g, '');
    if (cleaned.trim().length > 0) out.push(cleaned);
  }
  return out;
}

async function probePdf(pdfPath: string) {
  const stat = fs.statSync(pdfPath);
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;

  console.log('='.repeat(78));
  console.log(`FILE : ${path.basename(pdfPath)}`);
  console.log(`SIZE : ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`PAGES: ${doc.numPages}`);
  console.log('='.repeat(78));

  // Sample across the document.
  const N = doc.numPages;
  const probes = [...new Set([
    1, 2, 3, 4, 5,
    Math.round(N * 0.1), Math.round(N * 0.25), Math.round(N * 0.5),
    Math.round(N * 0.75), Math.round(N * 0.9), N - 1, N,
  ].filter((p) => p >= 1 && p <= N))];

  let empty = 0, thin = 0, totalChars = 0;
  for (const p of probes) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = reconstructLines(content.items as any[]);
    const chars = lines.reduce((a, l) => a + l.length, 0);
    totalChars += chars;
    if (chars === 0) empty++; else if (chars < 200) thin++;
    console.log(`  p${String(p).padStart(5)}  chars=${String(chars).padStart(7)}  lines=${String(lines.length).padStart(4)}`);
    page.release?.();
  }

  const avg = Math.round(totalChars / probes.length);
  console.log('');
  console.log(`  sampled=${probes.length}  empty=${empty}  thin(<200)=${thin}  avgChars=${avg}`);
  console.log(`  VERDICT: ${empty === probes.length ? 'SCANNED (needs OCR)' : avg > 800 ? 'TEXT-BASED' : 'MIXED / THIN'}`);

  // Dump a mid-document page so we can see if the AHSP table structure survives.
  const dumpPage = Math.round(N * 0.5);
  const dp = await doc.getPage(dumpPage);
  const dc = await dp.getTextContent();
  const dlines = reconstructLines(dc.items as any[]);
  console.log('');
  console.log(`--- RAW SAMPLE page ${dumpPage} (first 45 rows) ---`);
  for (const l of dlines.slice(0, 45)) console.log('  | ' + l);
  console.log('');
  dp.release?.();
  await doc.destroy?.();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/ahsp2026/probePdf.ts <pdf> [...]');
    process.exit(1);
  }
  for (const a of args) {
    if (!fs.existsSync(a)) { console.log(`NOT FOUND: ${a}`); continue; }
    await probePdf(path.resolve(a));
  }
}

main().catch((e) => { console.error('PROBE FAILED:', e?.message || e); process.exit(1); });

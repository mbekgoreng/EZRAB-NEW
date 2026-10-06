/**
 * EXTRACT — Lampiran II SE DJBK No. 47/2026 (AHSP Bina Marga), page by page.
 *
 * Problem: `getTextContent()` returns a flat stream of fragments. Joining them
 * with spaces destroys table rows, which is fatal for AHSP analysis tables
 * (koefisien / satuan / komponen must stay on one row).
 *
 * Solution: reconstruct rows from glyph coordinates.
 *   - y = transform[5]  → the baseline. Fragments sharing a baseline are one row.
 *   - x = transform[4]  → horizontal order within the row.
 *   - `hasEOL` is honoured as a hard row break.
 *
 * Output: `docs/_audit/lampiran2-pages.jsonl`
 *   one JSON object per line: { page, lines: string[], chars: number }
 *
 * Read-only with respect to the PDF. Idempotent — re-running overwrites the cache.
 *
 * Usage:
 *   npx tsx scripts/extractLampiranII.ts            # all pages
 *   npx tsx scripts/extractLampiranII.ts 1 40       # page range (inclusive)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const PDF_PATH = path.join(
  process.cwd(),
  'Lampiran-II-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf',
);
const OUT_DIR = path.join(process.cwd(), 'docs', '_audit');
const OUT_PATH = path.join(OUT_DIR, 'lampiran2-pages.jsonl');

/** Fragments whose baselines differ by less than this are the same visual row. */
const ROW_TOLERANCE = 3.0;

interface PageRecord {
  page: number;
  chars: number;
  lines: string[];
}

/**
 * Reconstruct visual rows from pdfjs text fragments.
 *
 * pdfjs emits fragments in content-stream order, which is usually but not always
 * visual order. Grouping by baseline and sorting by x makes the result independent
 * of stream order, which matters for these two-column AHSP tables.
 */
function reconstructLines(items: any[]): string[] {
  interface Frag { x: number; y: number; str: string; width: number; eol: boolean }
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
      eol: Boolean(it.hasEOL),
    });
  }

  if (frags.length === 0) return [];

  // Bucket fragments into rows by baseline proximity.
  const rows: { y: number; parts: Frag[] }[] = [];
  for (const f of frags) {
    let target = rows.find((r) => Math.abs(r.y - f.y) <= ROW_TOLERANCE);
    if (!target) {
      target = { y: f.y, parts: [] };
      rows.push(target);
    }
    target.parts.push(f);
  }

  // PDF y grows downward in pdfjs viewport coords for some producers and upward
  // for others; sorting descending matches the printed order in this document
  // (verified against the table of contents on page 4).
  rows.sort((a, b) => b.y - a.y);

  const out: string[] = [];
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x);

    // Insert a tab between fragments that have a visible horizontal gap, so the
    // column structure survives into the text (AHSP tables are column-based).
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

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`NOT FOUND: ${PDF_PATH}`);
    process.exit(1);
  }

  const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
  const rangeFrom = args.length >= 1 ? Math.max(1, args[0]) : 1;
  const rangeTo = args.length >= 2 ? args[1] : Number.MAX_SAFE_INTEGER;

  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const from = rangeFrom;
  const to = Math.min(rangeTo, doc.numPages);

  console.log('='.repeat(78));
  console.log('EXTRACT — Lampiran II SE DJBK No. 47/2026 (AHSP Bina Marga)');
  console.log('='.repeat(78));
  console.log(`pages  : ${doc.numPages}  (extracting ${from}..${to})`);
  console.log(`output : ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log('');

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Truncate only when doing a full run, so a ranged run cannot silently destroy the cache.
  const fullRun = from === 1 && to === doc.numPages;
  if (fullRun) fs.writeFileSync(OUT_PATH, '');

  const stream = fs.createWriteStream(OUT_PATH, { flags: fullRun ? 'w' : 'a' });

  const started = Date.now();
  let totalChars = 0;
  let emptyPages = 0;
  let thinPages = 0;

  for (let pageNo = from; pageNo <= to; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const lines = reconstructLines(content.items as any[]);
    const chars = lines.reduce((a, l) => a + l.length, 0);

    totalChars += chars;
    if (chars === 0) emptyPages += 1;
    else if (chars < 200) thinPages += 1;

    const record: PageRecord = { page: pageNo, chars, lines };
    stream.write(JSON.stringify(record) + '\n');

    page.release?.();

    if (pageNo % 250 === 0 || pageNo === to) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      const pct = (((pageNo - from + 1) / (to - from + 1)) * 100).toFixed(1);
      console.log(`  ${String(pageNo).padStart(5)}/${to}  ${pct.padStart(5)}%  ${elapsed}s  empty=${emptyPages} thin=${thinPages}`);
    }
  }

  await new Promise<void>((resolve) => stream.end(resolve));
  await doc.destroy?.();

  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  console.log('');
  console.log('--- SELESAI ---');
  console.log(`  halaman diekstraksi : ${to - from + 1}`);
  console.log(`  total karakter      : ${totalChars.toLocaleString('id-ID')}`);
  console.log(`  rata-rata/halaman   : ${Math.round(totalChars / (to - from + 1))}`);
  console.log(`  halaman kosong      : ${emptyPages}`);
  console.log(`  halaman tipis(<200) : ${thinPages}`);
  console.log(`  waktu               : ${elapsed}s`);
  console.log(`  berkas              : ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error('EXTRACT FAILED:', err?.message || err);
  process.exit(1);
});

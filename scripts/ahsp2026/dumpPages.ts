/**
 * DUMP — print reconstructed rows for a page range of a source PDF.
 * Read-only helper for parser development.
 *
 * Usage: npx tsx scripts/ahsp2026/dumpPages.ts <key> <from> <to> [maxRows]
 */
import { loadPdf, reconstructLines } from './core';
import { SOURCES } from './sources.config';

async function main() {
  const [key, fromS, toS, maxS] = process.argv.slice(2);
  const spec = SOURCES.find((s) => s.key === key);
  if (!spec) { console.error(`unknown key "${key}". Available: ${SOURCES.map((s) => s.key).join(', ')}`); process.exit(1); }
  const from = Number(fromS), to = Number(toS), max = maxS ? Number(maxS) : 60;
  const doc = await loadPdf(spec.pdfPath);
  for (let p = from; p <= Math.min(to, doc.numPages); p++) {
    const page = await doc.getPage(p);
    const lines = reconstructLines((await page.getTextContent()).items as any[]);
    console.log(`\n########## ${key} page ${p} ##########`);
    for (const l of lines.slice(0, max)) console.log('| ' + l);
    page.release?.();
  }
  await doc.destroy?.();
}
main().catch((e) => { console.error(e); process.exit(1); });

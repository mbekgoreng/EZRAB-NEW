/**
 * PROBE — Lampiran II SE DJBK No. 47/2026 (AHSP Bina Marga)
 *
 * Answers one question before any extraction work is attempted:
 *   Is the PDF text-based (extractable) or a scanned image (needs OCR)?
 *
 * Read-only. Writes nothing except a small sample to stdout.
 *
 * Usage: npx tsx scripts/probeLampiranII.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const PDF_PATH = path.join(
  process.cwd(),
  'Lampiran-II-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf',
);

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`NOT FOUND: ${PDF_PATH}`);
    process.exit(1);
  }

  const stat = fs.statSync(PDF_PATH);
  console.log('='.repeat(78));
  console.log('PROBE — Lampiran II SE DJBK No. 47/2026 (AHSP Bina Marga)');
  console.log('='.repeat(78));
  console.log(`file   : ${path.basename(PDF_PATH)}`);
  console.log(`size   : ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  // pdfjs-dist v6 legacy build works in Node without a DOM.
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  console.log(`pages  : ${doc.numPages}`);
  console.log('');

  // Sample pages spread across the document.
  const probes = [
    1, 2, 3, 4, 5,
    Math.round(doc.numPages * 0.25),
    Math.round(doc.numPages * 0.5),
    Math.round(doc.numPages * 0.75),
    doc.numPages - 1,
    doc.numPages,
  ].filter((p) => p >= 1 && p <= doc.numPages);

  const unique = [...new Set(probes)];

  let totalChars = 0;
  let pagesWithText = 0;
  const pageStats: { page: number; chars: number; lines: number }[] = [];

  for (const pageNo of unique) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const items = content.items as any[];
    const text = items
      .map((i) => (typeof i.str === 'string' ? i.str : ''))
      .join(' ');
    const cleaned = text.replace(/\s+/g, ' ').trim();
    const lines = cleaned.length > 0 ? Math.max(1, Math.round(cleaned.length / 80)) : 0;

    totalChars += cleaned.length;
    if (cleaned.length > 50) pagesWithText += 1;

    pageStats.push({ page: pageNo, chars: cleaned.length, lines });
    page.release?.();
  }

  console.log('--- EXTRAKSI TEKS PER HALAMAN SAMPEL ---');
  console.log('  page    chars   ~lines');
  for (const s of pageStats) {
    console.log(`  ${String(s.page).padStart(5)} ${String(s.chars).padStart(8)} ${String(s.lines).padStart(8)}`);
  }
  console.log('');

  const avgChars = unique.length > 0 ? Math.round(totalChars / unique.length) : 0;
  const verdict =
    pagesWithText === unique.length && avgChars > 800
      ? 'TEXT-BASED (dapat diekstraksi langsung)'
      : pagesWithText === 0
        ? 'SCANNED (perlu OCR)'
        : 'CAMPURAN (sebagian halaman perlu OCR)';

  console.log(`halaman dengan teks : ${pagesWithText}/${unique.length}`);
  console.log(`rata-rata karakter   : ${avgChars} per halaman sampel`);
  console.log(`VERDICT              : ${verdict}`);
  console.log('');

  // Dump a raw sample so we can see whether table structure survives extraction.
  console.log('--- SAMPEL MENTAH HALAMAN 4 (10 baris pertama) ---');
  const samplePage = await doc.getPage(4);
  const sampleContent = await samplePage.getTextContent();
  const sampleText = (sampleContent.items as any[])
    .map((i) => (typeof i.str === 'string' ? i.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  console.log(sampleText.slice(0, 1200));
  console.log('');

  // Cross-check against the TOC file that already exists in the workspace.
  const tocPath = path.join(process.cwd(), 'bina_marga_toc.txt');
  if (fs.existsSync(tocPath)) {
    const toc = fs.readFileSync(tocPath, 'utf8');
    console.log('--- bina_marga_toc.txt (sudah ada) ---');
    console.log(`  baris   : ${toc.split('\n').length}`);
    console.log(`  karakter: ${toc.length}`);
    const codeLike = toc.match(/\b\d+\.\d+(\.\d+)*\b/g) || [];
    console.log(`  pola kode AHSP (x.y.z) ditemukan: ${codeLike.length}`);
    console.log(`  contoh kode: ${[...new Set(codeLike)].slice(0, 12).join(', ')}`);
  } else {
    console.log('--- bina_marga_toc.txt tidak ada ---');
  }

  await doc.destroy?.();
}

main().catch((err) => {
  console.error('PROBE FAILED:', err?.message || err);
  process.exit(1);
});

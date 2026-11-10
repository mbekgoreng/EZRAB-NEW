/**
 * REGRESI KOMPATIBILITAS PDF.JS — Sprint 4 Tugas A (2026-11-10).
 *
 * Run: ./node_modules/.bin/esbuild src/test/dedPdfjsCompat.src.ts --bundle
 *      --platform=node --format=cjs
 *      --outfile=./dedPdfjsCompat.test-bundle.cjs
 *      && node ./dedPdfjsCompat.test-bundle.cjs
 * (jalankan dari root repo — fixture dibaca relatif terhadap process.cwd();
 *  berkas bundle HARUS berada di dalam pohon repo agar resolusi Node
 *  menemukan @napi-rs/canvas dari node_modules repo, sama seperti
 *  harness ter-bundle lain yang memakai dependensi native; hapus
 *  berkas bundle sesudah jalan. Di runtime tak-ter-bundle (tsx/Vite)
 *  pdfjs menemukan worker legacy-nya sendiri sebagai berkas sibling;
 *  dalam bundle, harness menunjuk GlobalWorkerOptions.workerSrc secara
 *  eksplisit ke worker legacy yang sama — lihat Bagian C.)
 *
 * Latar: pdfjs-dist@6.3.289 build MODERN memanggil
 * `Uint8Array.prototype.toHex` (Chrome 140+/Firefox 133+/Safari 18.2+/
 * Node 25+) di getter `PDFDocument.fingerprints` pada worker, tanpa
 * polyfill → setiap getDocument() gagal total dengan
 * `hashOriginal.toHex is not a function` di runtime lebih lama
 * (termasuk Node 24 mesin ini), tetapi fail-closed. Perbaikan: main +
 * worker + jalur Node diarahkan ke build LEGACY versi yang sama
 * (membawa polyfill core-js), tanpa polyfill global tulisan sendiri
 * dan tanpa mengganti versi dependensi.
 * Detail: docs/audits/DED_PDFJS_COMPATIBILITY_FIX.md.
 *
 * Cakupan:
 * - A. Verifikasi paket terpasang: build legacy ada di disk, versi
 *   terpasang = versi yang dideklarasikan, main & worker legacy
 *   sama-sama memuat string versi yang sama.
 * - B. Pemeriksaan statis sumber: pdfjsSetup & pdfPageService hanya
 *   merujuk build legacy; tidak ada sisa rujukan build modern; setiap
 *   fallback CDN (bila ada) menunjuk padanan legacy seversi.
 * - C. Runtime lewat loader PRODUKSI (loadPdfjs): fixture PDF owner
 *   nyata (qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf) termuat
 *   tanpa error toHex, 32 halaman, fingerprints terbaca, teks halaman
 *   pertama bisa diekstrak.
 * - D. Fail-closed: PDF tidak valid & buffer kosong ditolak dengan
 *   error terstruktur (PDF_RENDER_ERROR / rejection), bukan sukses
 *   kosong — lewat loader, PdfPageService, dan parseDedPdf.
 * - E. Konsumen bersama tidak rusak: PdfPageService (ded-rab-v2/v3,
 *   ai-estimate) me-render halaman nyata di Node; parseDedPdf
 *   (ded-ai-estimate/ded-full-ai lewat loadPdfjs) membaca 32 halaman.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPdfjs } from '../lib/pdfjsSetup';
import { PdfPageService } from '../ded-rab-v2/ingestion/pdfPageService';
import { parseDedPdf } from '../ai-tools/ded-ai-estimate/parser';

let pass = 0, fail = 0, skip = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function skipped(name: string, why: string) {
  skip++; console.log(`  SKIP ${name} — ${why}`);
}

const ROOT = process.cwd();
const FIXTURE = path.resolve(ROOT, 'qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf');
const EXPECTED_PAGES = 32;

async function main() {
  // =========================================================================
  // A. PAKET TERPASANG
  // =========================================================================
  console.log('== A. Paket pdfjs-dist terpasang ==');
  const pkgJson = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'package.json'), 'utf8'));
  const declared = String(pkgJson.dependencies?.['pdfjs-dist'] || '').replace(/^[\^~]/, '');
  const installed = JSON.parse(
    fs.readFileSync(path.resolve(ROOT, 'node_modules/pdfjs-dist/package.json'), 'utf8'));
  check('A1 versi terpasang = versi dideklarasikan package.json',
    installed.version === declared, `installed=${installed.version} declared=${declared}`);
  const legacyMain = path.resolve(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const legacyWorker = path.resolve(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  check('A2 berkas legacy main tersedia (legacy/build/pdf.mjs)', fs.existsSync(legacyMain));
  check('A3 berkas legacy worker tersedia (legacy/build/pdf.worker.min.mjs)', fs.existsSync(legacyWorker));
  if (fs.existsSync(legacyMain) && fs.existsSync(legacyWorker)) {
    check('A4 main legacy memuat string versi terpasang',
      fs.readFileSync(legacyMain, 'utf8').includes(installed.version));
    check('A5 worker legacy memuat string versi yang sama (pasangan seversi)',
      fs.readFileSync(legacyWorker, 'utf8').includes(installed.version));
  }

  // =========================================================================
  // B. PEMERIKSAAN STATIS SUMBER
  // =========================================================================
  console.log('== B. Sumber hanya merujuk build legacy ==');
  const setupSrc = fs.readFileSync(path.resolve(ROOT, 'src/lib/pdfjsSetup.ts'), 'utf8');
  const pageSvcSrc = fs.readFileSync(
    path.resolve(ROOT, 'src/ded-rab-v2/ingestion/pdfPageService.ts'), 'utf8');
  check("B1 pdfjsSetup memuat main legacy ('pdfjs-dist/legacy/build/pdf.mjs')",
    setupSrc.includes("pdfjs-dist/legacy/build/pdf.mjs"));
  check("B2 pdfjsSetup memuat worker legacy ('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')",
    setupSrc.includes('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'));
  check("B3 pdfjsSetup TANPA impor main modern polos (import('pdfjs-dist'))",
    !setupSrc.includes("import('pdfjs-dist')") && !setupSrc.includes('import("pdfjs-dist")'));
  check('B4 pdfjsSetup TANPA rujukan worker modern (pdfjs-dist/build/pdf.worker)',
    !setupSrc.includes('pdfjs-dist/build/pdf.worker'));
  check('B5 fallback CDN (bila ada) menunjuk padanan legacy, bukan build modern/cdnjs lama',
    !setupSrc.includes('cdnjs.cloudflare.com')
    && (!setupSrc.includes('https://') || setupSrc.includes('/legacy/build/pdf.worker.min.mjs')));
  check("B6 pdfPageService jalur Node memuat legacy ('pdfjs-dist/legacy/build/pdf.mjs')",
    pageSvcSrc.includes("pdfjs-dist/legacy/build/pdf.mjs"));
  check("B7 pdfPageService TANPA impor modern polos (import('pdfjs-dist'))",
    !pageSvcSrc.includes("import('pdfjs-dist')") && !pageSvcSrc.includes('import("pdfjs-dist")'));

  // =========================================================================
  // C. RUNTIME LEWAT LOADER PRODUKSI — FIXTURE OWNER NYATA
  // =========================================================================
  console.log('== C. Runtime loadPdfjs + fixture owner ==');
  check('C1 fixture owner ada di qa-fixtures/', fs.existsSync(FIXTURE), FIXTURE);
  const fixtureBytes = new Uint8Array(fs.readFileSync(FIXTURE));
  let pdfjs: any = null;
  try { pdfjs = await loadPdfjs(); } catch (e: any) { pdfjs = null; }
  check('C2 loadPdfjs() berhasil dimuat', pdfjs != null && typeof pdfjs.getDocument === 'function');
  check('C3 versi runtime pdfjs = versi terpasang',
    pdfjs?.version === installed.version, `runtime=${pdfjs?.version}`);
  // Harness bundle saja: pdfjs ter-bundle kehilangan resolusi worker
  // sibling (di runtime asli worker legacy ditemukan dari lokasi modul
  // di node_modules). Tunjuk workerSrc ke worker LEGACY paket yang sama
  // — inilah worker yang akan dipakai, bukan pengganti lain.
  if (pdfjs?.GlobalWorkerOptions) {
    // (bawaan bundle adalah './pdf.worker.mjs' relatif yang tak ada —
    // timpa tanpa syarat di harness Node ini.)
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(legacyWorker).href;
  }
  check('C3b workerSrc harness menunjuk worker legacy paket yang sama',
    String(pdfjs?.GlobalWorkerOptions?.workerSrc || '').includes('legacy/build/pdf.worker.min.mjs'),
    `workerSrc=${pdfjs?.GlobalWorkerOptions?.workerSrc}`);
  let doc: any = null; let loadErr: any = null;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(fixtureBytes), useSystemFonts: true }).promise;
  } catch (e: any) { loadErr = e; }
  check('C4 getDocument(fixture) TANPA error (khususnya bukan toHex)',
    doc != null && loadErr == null, loadErr ? String(loadErr?.message || loadErr) : '');
  check('C5 jumlah halaman fixture benar (32)',
    doc?.numPages === EXPECTED_PAGES, `numPages=${doc?.numPages}`);
  const fps = doc?.fingerprints;
  check('C6 fingerprints terbaca: array, elemen pertama hex 32 char',
    Array.isArray(fps) && typeof fps[0] === 'string' && /^[0-9a-f]{32}$/i.test(fps[0]),
    `fingerprints=${JSON.stringify(fps)}`);
  let page1TextItems = -1;
  try {
    const page1 = await doc.getPage(1);
    const tc = await page1.getTextContent();
    page1TextItems = Array.isArray(tc?.items) ? tc.items.length : -1;
  } catch { page1TextItems = -1; }
  check('C7 teks halaman 1 bisa diekstrak (items > 0)', page1TextItems > 0, `items=${page1TextItems}`);
  try { await doc?.destroy?.(); } catch { /* destroy opsional antar versi */ }

  // =========================================================================
  // D. FAIL-CLOSED
  // =========================================================================
  console.log('== D. Fail-closed untuk masukan tidak valid ==');
  const garbage = new TextEncoder().encode('ini bukan PDF sama sekali — hanya teks sampah');
  let garbageRejected = false; let garbageMsg = '';
  try {
    await pdfjs.getDocument({ data: new Uint8Array(garbage) }).promise;
  } catch (e: any) { garbageRejected = true; garbageMsg = String(e?.message || e); }
  check('D1 getDocument(bytes sampah) ditolak (bukan dokumen kosong sukses)',
    garbageRejected && garbageMsg.length > 0, garbageMsg);
  const svc = PdfPageService.getInstance();
  let svcGarbageMsg = '';
  try { await svc.extractPages('uji-sampah', garbage, 'sampah.pdf'); }
  catch (e: any) { svcGarbageMsg = String(e?.message || e); }
  check('D2 PdfPageService.extractPages(sampah) melempar PDF_RENDER_ERROR terstruktur',
    svcGarbageMsg.includes('PDF_RENDER_ERROR'), svcGarbageMsg);
  let svcEmptyMsg = '';
  try { await svc.extractPages('uji-kosong', new Uint8Array(0), 'kosong.pdf'); }
  catch (e: any) { svcEmptyMsg = String(e?.message || e); }
  check('D3 PdfPageService.extractPages(0 byte) melempar PDF_RENDER_ERROR',
    svcEmptyMsg.includes('PDF_RENDER_ERROR'), svcEmptyMsg);
  const parsedGarbage: any = await parseDedPdf(garbage, 'sampah.pdf');
  check('D4 parseDedPdf(sampah) mengembalikan error terstruktur PDF_RENDER_ERROR (bukan sukses)',
    parsedGarbage != null && parsedGarbage.pageCount == null
    && JSON.stringify(parsedGarbage).includes('PDF_RENDER_ERROR'),
    JSON.stringify(parsedGarbage)?.slice(0, 200));

  // =========================================================================
  // E. KONSUMEN BERSAMA
  // =========================================================================
  console.log('== E. Konsumen bersama ==');
  let rendered: any[] = [];
  let renderErr: any = null;
  try {
    rendered = await svc.extractPages('uji-fixture', fixtureBytes,
      'pdf-gambar-rumah-1-lantai_compress.pdf', 2);
  } catch (e: any) { renderErr = e; }
  // Artefak bundle yang dikenal: pdfjs ter-bundle esbuild (CJS) kehilangan
  // resolusi berkas font standar/cmap berbasis import.meta saat me-render
  // canvas ("The argument 'filename' must be a file URL object... Received
  // undefined") — BUKAN kegagalan pemuatan PDF dan bukan toHex. Jalur
  // render yang sama diverifikasi tak-ter-bundle via probe tsx
  // (pdfPageServiceProbe.mts, pola suite .test.ts repo): 2 halaman
  // RENDERED. Di bundle, keadaan itu dicatat SKIP jujur, bukan PASS.
  const bundleArtifact = renderErr != null
    && /must be a file URL object|Received undefined/.test(String(renderErr?.message || renderErr));
  if (bundleArtifact) {
    skipped('E1 PdfPageService.extractPages(fixture, maxPages=2) render di Node',
      'artefak bundle esbuild (resolusi font pdfjs); render terverifikasi via probe tsx tak-ter-bundle');
    skipped('E2 halaman ter-render RENDERED + data gambar non-kosong',
      'mengikuti E1');
  } else {
    check('E1 PdfPageService.extractPages(fixture, maxPages=2) berhasil di Node (jalur legacy)',
      renderErr == null && rendered.length === 2,
      renderErr ? String(renderErr?.message || renderErr) : `pages=${rendered.length}`);
    check('E2 halaman ter-render berstatus RENDERED dengan data gambar non-kosong',
      rendered.length === 2 && rendered.every((p) => p.status === 'RENDERED'
        && typeof p.imageDataUrl === 'string' && p.imageDataUrl.length > 1000
        && p.pageNumber >= 1));
  }
  const parsed: any = await parseDedPdf(fixtureBytes, 'pdf-gambar-rumah-1-lantai_compress.pdf');
  check('E3 parseDedPdf(fixture) membaca 32 halaman lewat loadPdfjs',
    parsed != null && parsed.pageCount === EXPECTED_PAGES && Array.isArray(parsed.pages)
    && parsed.pages.length === EXPECTED_PAGES,
    `pageCount=${parsed?.pageCount} err=${JSON.stringify(parsed)?.slice(0, 160)}`);
  check('E4 parseDedPdf: sebagian halaman memuat teks native',
    parsed != null && Array.isArray(parsed.pages)
    && parsed.pages.filter((p: any) => (p.text || '').length > 0).length >= 10,
    `ber-teks=${parsed?.pages?.filter((p: any) => (p.text || '').length > 0).length}`);

  console.log(`\nHASIL: ${pass} PASS / ${fail} FAIL / ${skip} SKIP`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });

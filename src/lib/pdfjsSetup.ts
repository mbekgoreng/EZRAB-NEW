/**
 * loadPdfjs — shared pdfjs-dist loader dengan worker yang benar.
 *
 * Memperbaiki: "No GlobalWorkerOptions.workerSrc specified"
 * (PDF_RENDER_ERROR ded-parse:load) saat parse PDF di browser.
 *
 * KOMPATIBILITAS (Sprint 4, 2026-11-10): SELALU memakai build LEGACY
 * pdfjs-dist (main + worker, versi identik dari paket yang sama).
 * Build modern memanggil `Uint8Array.prototype.toHex` — API TC39 baru
 * (Chrome 140+/Firefox 133+/Safari 18.2+/Node 25+) — di getter
 * `PDFDocument.fingerprints` pada worker, TANPA polyfill, sehingga
 * setiap getDocument() gagal total (`hashOriginal.toHex is not a
 * function`) di runtime yang lebih lama. Build legacy membawa
 * polyfill core-js untuk API itu (feature-detect) dan terbukti memuat
 * fixture owner 32 halaman di Node 24. Main dan worker WAJIB legacy
 * berpasangan: mencampur build = mismatch versi API/worker.
 * Detail: docs/audits/DED_PDFJS_COMPATIBILITY_FIX.md.
 *
 * Worker lokal di-bundle Vite (?url); fallback terakhir memakai
 * padanan legacy versi yang sama persis dari cermin paket npm
 * (jsDelivr), bukan build modern CDN.
 */

let workerConfigured = false;

/** Muat pdfjs-dist (build legacy); di browser sekalian konfigurasi workerSrc. */
export async function loadPdfjs(): Promise<any> {
  const isNode = typeof window === 'undefined';
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

  if (!isNode && !workerConfigured) {
    try {
      // Worker legacy lokal dari paket yang sama, di-bundle sebagai asset oleh Vite.
      const mod: any = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
      const url = mod?.default || mod;
      if (pdfjs?.GlobalWorkerOptions && url) {
        pdfjs.GlobalWorkerOptions.workerSrc = url;
        workerConfigured = true;
      }
    } catch {
      /* fallback di bawah */
    }
    if (!workerConfigured && pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      // Fallback CDN: padanan LEGACY dengan versi terinstal persis
      // (cermin npm jsDelivr menyajikan berkas paket yang sama), agar
      // worker yang terpaksa dimuat dari jaringan pun tetap legacy dan
      // seversi dengan main thread — bukan build modern cdnjs lama.
      const ver = pdfjs.version || '6.3.289';
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/legacy/build/pdf.worker.min.mjs`;
      workerConfigured = true;
    }
  }
  return pdfjs;
}

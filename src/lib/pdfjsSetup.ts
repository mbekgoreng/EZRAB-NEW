/**
 * loadPdfjs — shared pdfjs-dist loader dengan worker yang benar.
 *
 * Memperbaiki: "No GlobalWorkerOptions.workerSrc specified"
 * (PDF_RENDER_ERROR ded-parse:load) saat parse PDF di browser.
 *
 * Memakai worker lokal yang di-bundle Vite (?url) — tanpa CDN,
 * tanpa mismatch versi.
 */

let workerConfigured = false;

/** Muat pdfjs-dist; di browser sekalian konfigurasi workerSrc. */
export async function loadPdfjs(): Promise<any> {
  const isNode = typeof window === 'undefined';
  const pdfjs: any = isNode
    ? await import('pdfjs-dist/legacy/build/pdf.mjs')
    : await import('pdfjs-dist');

  if (!isNode && !workerConfigured) {
    try {
      // Worker lokal dari node_modules, di-bundle sebagai asset oleh Vite.
      const mod: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      const url = mod?.default || mod;
      if (pdfjs?.GlobalWorkerOptions && url) {
        pdfjs.GlobalWorkerOptions.workerSrc = url;
        workerConfigured = true;
      }
    } catch {
      /* fallback di bawah */
    }
    if (!workerConfigured && pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      // Fallback CDN dengan versi yang terinstal (bukan hardcoded lama).
      const ver = pdfjs.version || '6.3.289';
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/pdf.worker.min.mjs`;
      workerConfigured = true;
    }
  }
  return pdfjs;
}

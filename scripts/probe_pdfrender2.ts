import { readFileSync } from 'node:fs';

if (!(Promise as any).try) {
  (Promise as any).try = (fn: any) => Promise.resolve().then(typeof fn === 'function' ? fn : () => fn);
}

async function main() {
  const buf = readFileSync('./qa-fixtures/DED_K290.pdf');
  const bytes = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  // Legacy build of pdfjs-dist — the modern build breaks under Node 22 hash
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const canvasMod = await import('@napi-rs/canvas');
  (globalThis as any).Path2D = canvasMod.Path2D;
  (globalThis as any).ImageData = canvasMod.ImageData;
  (globalThis as any).Image = canvasMod.Image;
  (globalThis as any).DOMMatrix = canvasMod.DOMMatrix;

  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  console.log('PAGES', pdf.numPages, 'v', pdfjs.version);
  for (let p = 1; p <= Math.min(3, pdf.numPages); p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = canvasMod.createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    await (page.render({ canvasContext: ctx, viewport } as any) as any).promise;
    const url = canvas.toDataURL('image/png');
    console.log(`page ${p} rendered size=${url.length}`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error('ERR', e.message); process.exit(1); });

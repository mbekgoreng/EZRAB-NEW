// Node 22 vs pdfjs-dist 6.x environmental shim (test harness only)
if (!(Promise as any).try) {
  (Promise as any).try = (fn: any) => Promise.resolve().then(typeof fn === 'function' ? fn : () => fn);
}

import { PdfPageService } from '../src/ded-rab-v2/ingestion/pdfPageService';
import { readFileSync } from 'node:fs';

async function main() {
  const bytes = readFileSync('./qa-fixtures/DED_K290.pdf');
  const svc = PdfPageService.getInstance();
  const pages = await svc.extractPages('probe', bytes, 'DED_K290.pdf');
  console.log('PAGES_RENDERED', pages.length);
  for (const p of pages) {
    console.log(`p${p.pageNumber} type=${p.drawingType} title=${p.drawingTitle} txtLen=${(p.nativeText || '').length} imgLen=${p.base64Length}`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error('ERR', e.message); process.exit(1); });

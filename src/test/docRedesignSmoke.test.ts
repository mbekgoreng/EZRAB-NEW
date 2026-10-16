import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TenderDocumentsView } from '../components/document/TenderDocumentsView';

const html = renderToStaticMarkup(
  React.createElement(TenderDocumentsView, {
    currentProject: { id: 'PRJ-TEST', name: 'Test Project', location: 'Jakarta', totalRab: 1000000 } as any,
    projects: [],
  })
);

const checks: Array<[string, boolean]> = [
  ['renders project name', html.includes('Test Project')],
  ['slim context bar (no dark gradient)', !html.includes('linear-gradient(135deg, #1E293B')],
  ['no emoji banner icon', !html.includes('\u{1F3D7}\uFE0F')],
  ['Ganti Proyek button present', html.includes('Ganti Proyek')],
  ['compact stats strip present', html.includes('Total Dokumen')],
  ['no demo fallback text', !html.includes('14 Agu 2026')],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', '-', name);
  if (!ok) fail++;
}
if (fail > 0) { console.log(`${fail} FAILED`); process.exit(1); }
console.log('ALL SMOKE TESTS PASSED');

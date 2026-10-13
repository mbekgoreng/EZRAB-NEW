import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentPackageWizardModal } from '../components/documents/DocumentPackageWizardModal';

const html = renderToStaticMarkup(
  React.createElement(DocumentPackageWizardModal, {
    isOpen: true,
    onClose: () => {},
    currentProject: { id: 'PRJ-TEST', name: 'Test Project', location: 'Jakarta', totalRab: 5000000 } as any,
    rabItems: [],
    scheduleTasks: [],
    kurvaSData: [],
  })
);

const checks: Array<[string, boolean]> = [
  ['renders wizard title', html.includes('AI Document Package Wizard')],
  ['has dialog role', html.includes('role="dialog"')],
  ['has aria-modal', html.includes('aria-modal="true"')],
  ['no emoji category icons', !html.includes('\u{1F4CB}') && !html.includes('\u{1F4D0}')],
  ['stepper present', html.includes('Pilih Dokumen')],
  ['standardized z-index (not 9999)', !html.includes('z-index:9999') && !html.includes('zIndex: 9999')],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', '-', name);
  if (!ok) fail++;
}
if (fail > 0) { console.log(`${fail} FAILED`); process.exit(1); }
console.log('ALL WIZARD SMOKE TESTS PASSED');

/**
 * AI DOKUMEN — regression test (store + page markers + service).
 * localStorage dimock in-memory agar bisa jalan di node via tsx.
 * Jalankan: npx tsx src/test/docAiWorkspace.test.ts
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mock localStorage untuk node
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

import { docStore, historyStore, draftStore, newId, formatBytes } from '../ai-tools/document-ai/store';
import { systemForMode } from '../ai-tools/document-ai/prompt';

console.log('\n[1] docStore:');
const d1 = {
  id: newId('doc'), fileName: 'RKS.pdf', kind: 'pdf' as const, sizeBytes: 1024,
  text: '[Halaman 1]\nIsi', charCount: 20, status: 'ready' as const,
  createdAt: Date.now(), updatedAt: Date.now(),
};
docStore.upsert(d1);
check('upsert + list', docStore.list().length === 1 && docStore.list()[0].fileName === 'RKS.pdf');
check('get by id', docStore.get(d1.id)?.kind === 'pdf');
// Batas 50 dokumen
for (let i = 0; i < 60; i++) {
  docStore.upsert({ ...d1, id: newId('doc'), fileName: `f${i}.pdf`, updatedAt: Date.now() + i });
}
check('dibatasi 50 dokumen', docStore.list().length === 50);
const firstId = docStore.list()[0].id;
docStore.remove(firstId);
check('remove bekerja', docStore.list().length === 49 && !docStore.get(firstId));

console.log('\n[2] historyStore:');
const h = historyStore.add({
  type: 'summary', docIds: ['a'], docNames: ['RKS.pdf'],
  title: 'Ringkasan — RKS.pdf', resultPreview: 'prev', resultFull: 'full',
});
check('add mengembalikan id+at', !!h.id && h.at > 0);
check('list terurut terbaru dulu', historyStore.list()[0].id === h.id);
historyStore.remove(h.id);
check('remove riwayat', historyStore.list().length === 0);

console.log('\n[3] draftStore:');
const dr = {
  id: newId('draft'), templateId: 'surat', templateName: 'Surat Resmi',
  title: 'Surat — Proyek X', content: '[DRAF] isi', status: 'draft' as const,
  createdAt: Date.now(), updatedAt: Date.now(),
};
draftStore.upsert(dr);
check('upsert draf', draftStore.list().length === 1);
draftStore.upsert({ ...dr, status: 'reviewed', updatedAt: Date.now() + 1 });
check('update status draf (tidak duplikat)', draftStore.list().length === 1 && draftStore.list()[0].status === 'reviewed');
draftStore.remove(dr.id);
check('hapus draf', draftStore.list().length === 0);

console.log('\n[4] prompt modes:');
check('CHECKLIST ada aturan jujur', systemForMode('CHECKLIST').includes('TIDAK DITEMUKAN'));
check('DRAFT melarang karangan identitas', systemForMode('DRAFT').includes('jangan mengarang'));
check('SUMMARY/QA/EXTRACT/COMPARE tetap ada',
  !!systemForMode('SUMMARY') && !!systemForMode('QA') && !!systemForMode('EXTRACT') && !!systemForMode('COMPARE'));

console.log('\n[5] util:');
check('formatBytes', formatBytes(1536) === '1.5 KB' && formatBytes(500) === '500 B');
check('newId unik', newId('x') !== newId('x'));

console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
else console.log('SEMUA TEST DOCAI WORKSPACE LOLOS');

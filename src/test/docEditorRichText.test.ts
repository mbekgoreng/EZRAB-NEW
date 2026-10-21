/**
 * AI DOKUMEN — regression test editor Word-like (richText + kompatibilitas draf lama).
 * Jalankan: npx tsx src/test/docEditorRichText.test.ts
 *
 * Kontrak yang dijaga:
 * - Draf LAMA (teks polos, tanpa contentFormat) tetap terbaca & terkonversi aman.
 * - Teks polos TIDAK ditafsirkan sebagai HTML/markdown (escape penuh).
 * - HTML editor -> teks polos untuk ekspor .txt bersih.
 * - draftStore menyimpan field format baru tanpa merusak record lama.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mock localStorage untuk node (sama seperti docAiWorkspace.test.ts)
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};

import { plainToHtml, htmlToPlain, draftFormat, toEditorHtml, toPlainText } from '../ai-tools/document-ai/richText';
import { draftStore, newId } from '../ai-tools/document-ai/store';

console.log('\n[1] plainToHtml:');
const plain = 'BERITA ACARA\n\nPada hari ini [ISI: tanggal] dilakukan opname.\nBaris kedua.\n\nPenutup.';
const html = plainToHtml(plain);
check('paragraf dipisah <p>', (html.match(/<p>/g) || []).length === 3, html);
check('baris tunggal menjadi <br>', html.includes('opname.<br>Baris kedua.'));
check('placeholder [ISI:] utuh', html.includes('[ISI: tanggal]'));
const evil = plainToHtml('teks <script>alert(1)</script> & "kutip"');
check('HTML dari teks polos di-escape penuh', !evil.includes('<script>') && evil.includes('&lt;script&gt;') && evil.includes('&amp;'));
check('teks kosong -> <p></p>', plainToHtml('') === '<p></p>' && plainToHtml('   ') === '<p></p>');

console.log('\n[2] htmlToPlain:');
const rich =
  '<h1>Surat Resmi</h1><p>Isi <strong>tebal</strong> dan <em>miring</em>.</p>' +
  '<ul><li>Item satu</li><li>Item dua</li></ul>' +
  '<table><tr><th>Kolom</th></tr><tr><td>Nilai &amp; data</td></tr></table><hr><p>Akhir.</p>';
const txt = htmlToPlain(rich);
check('tag dibuang, teks dipertahankan', txt.includes('Surat Resmi') && txt.includes('tebal') && !txt.includes('<strong>'));
check('list menjadi poin', txt.includes('• Item satu') && txt.includes('• Item dua'));
check('entitas di-decode', txt.includes('Nilai & data'));
check('blok terpisah baris kosong', txt.includes('Surat Resmi\n\nIsi'));

console.log('\n[3] roundtrip plain -> html -> plain:');
const rt = htmlToPlain(plainToHtml(plain));
check('roundtrip mempertahankan isi', rt === plain, JSON.stringify(rt));

console.log('\n[4] kompatibilitas draf lama:');
const oldDraft = { content: 'isi lama polos' };
check('record tanpa contentFormat = plain', draftFormat(oldDraft as never) === 'plain');
check('record html terdeteksi', draftFormat({ contentFormat: 'html' } as never) === 'html');
check('toEditorHtml draf polos mengkonversi', toEditorHtml('a\n\nb', 'plain') === '<p>a</p><p>b</p>');
check('toEditorHtml draf html apa adanya', toEditorHtml('<p>x</p>', 'html') === '<p>x</p>');
check('toPlainText draf polos apa adanya', toPlainText('teks saja', 'plain') === 'teks saja');
check('toPlainText draf html dibersihkan', toPlainText('<p><strong>Halo</strong></p>', 'html') === 'Halo');

console.log('\n[5] draftStore dengan field format baru:');
const rec = {
  id: newId('draft'), templateId: 'surat', templateName: 'Surat Resmi',
  title: 'Surat — Proyek X', content: '<p>Isi <strong>rich</strong></p>',
  contentFormat: 'html' as const, previousContent: 'isi lama', previousFormat: 'plain' as const,
  status: 'draft' as const, createdAt: Date.now(), updatedAt: Date.now(),
};
draftStore.upsert(rec);
const back = draftStore.get(rec.id);
check('record html tersimpan & terbaca', back?.contentFormat === 'html' && back?.content.includes('<strong>'));
check('previousContent ikut tersimpan', back?.previousContent === 'isi lama' && back?.previousFormat === 'plain');
draftStore.remove(rec.id);
check('hapus bersih', draftStore.list().length === 0);

console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
else console.log('SEMUA TEST EDITOR RICH TEXT LOLOS');

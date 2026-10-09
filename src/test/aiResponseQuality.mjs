/**
 * FASE B — AI response quality regression tests.
 * Memastikan respons AI tampil tepat satu kali (tidak berduplikasi),
 * spasi & paragraf dipertahankan, dan tidak ada deduplikasi agresif.
 *
 * Mekanisme: bundle markdown.tsx via esbuild, render ke HTML statis,
 * lalu hitung kemunculan tiap paragraf.
 *
 * Run: node src/test/aiResponseQuality.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSync } = require('esbuild');
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const P = process.cwd();
const entry = `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '${P}/src/ai-tools/ezrab-ai/markdown.tsx';
export function renderHtml(md) {
  const nodes = renderMarkdown(md);
  return renderToStaticMarkup(React.createElement(React.Fragment, null, ...nodes));
}
import { AiToolsProviderClient } from '${P}/src/ai-tools/providerClient.ts';
export async function execWithMockFetch(status, jsonBody) {
  const origFetch = globalThis.fetch;
  const hadWindow = 'window' in globalThis;
  // Simulasikan browser agar jalur fetch (bukan jalur Node) yang diuji
  if (!hadWindow) globalThis.window = {};
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
  });
  try {
    const client = new AiToolsProviderClient();
    return await client.execute({ productId: 'EZRAB_AI', prompt: 'x', maxTokens: 10, timeoutMs: 5000 });
  } finally {
    globalThis.fetch = origFetch;
    if (!hadWindow) delete globalThis.window;
  }
}
`;
writeFileSync('/tmp/_aiq_entry.jsx', entry);
const { mkdirSync } = await import('node:fs');
mkdirSync(`${P}/.tmp_test`, { recursive: true });
buildSync({
  entryPoints: ['/tmp/_aiq_entry.jsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  outfile: `${P}/.tmp_test/_aiq_bundle.mjs`,
  external: ['react', 'react-dom', 'react-dom/server'],
  absWorkingDir: P,
});
const { renderHtml } = await import(pathToFileURL(`${P}/.tmp_test/_aiq_bundle.mjs`).href);
const { execWithMockFetch } = await import(pathToFileURL(`${P}/.tmp_test/_aiq_bundle.mjs`).href);

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const count = (html, needle) => html.split(needle).length - 1;

// Respons realistis ala jawaban K-225 vs K-300 dari QA
const SAMPLE = `Perbedaan utama antara beton K-225 dan K-300 terletak pada kuat tekan karakteristiknya. Berikut penjelasannya untuk struktur kolom:

- Kuat Tekan:
- Beton K-225: memiliki kuat tekan karakteristik minimum 225 kg/cm2.
- Beton K-300: memiliki kuat tekan karakteristik minimum 300 kg/cm2.

Untuk kepastian mutu, selalu acu pada RKS dan perhitungan struktur resmi.`;

await test('setiap paragraf tampil tepat satu kali (tidak berduplikasi)', () => {
  const html = renderHtml(SAMPLE);
  eq(count(html, 'Perbedaan utama antara beton K-225'), 1, 'intro');
  eq(count(html, 'Beton K-225: memiliki kuat tekan'), 1, 'bullet K-225');
  eq(count(html, 'Beton K-300: memiliki kuat tekan'), 1, 'bullet K-300');
  eq(count(html, 'selalu acu pada RKS'), 1, 'catatan akhir');
});

await test('paragraf mirip tapi beda TIDAK dideduplikasi', () => {
  const html = renderHtml('Harga beton K-225 Rp 800.000.\n\nHarga beton K-300 Rp 950.000.');
  eq(count(html, 'Harga beton K-225'), 1, 'paragraf 1 ada');
  eq(count(html, 'Harga beton K-300'), 1, 'paragraf 2 ada');
});

await test('spasi antarkata dan pemisah paragraf dipertahankan', () => {
  const html = renderHtml('Baris satu.\n\nBaris dua.');
  if (!html.includes('Baris satu.') || !html.includes('Baris dua.')) {
    throw new Error('teks paragraf hilang');
  }
  // dua blok <p> terpisah, bukan digabung
  eq(count(html, '<p'), 2, 'jumlah blok paragraf');
});

await test('respons non-streaming satu blok utuh tetap benar', () => {
  const html = renderHtml('Jawaban singkat satu paragraf.');
  eq(count(html, 'Jawaban singkat satu paragraf.'), 1, 'single paragraph');
  if (!html.includes('<p')) throw new Error('bukan elemen paragraf');
});

await test('list dan heading tidak menggandakan item', () => {
  const html = renderHtml('## Judul\n\n- Item A\n- Item B\n\n1. Langkah 1\n2. Langkah 2');
  eq(count(html, 'Item A'), 1, 'item A');
  eq(count(html, 'Item B'), 1, 'item B');
  eq(count(html, 'Langkah 1'), 1, 'langkah 1');
  eq(count(html, '<li'), 4, 'total li');
});

await test('error provider 403: pesan ramah, tanpa raw JSON', async () => {
  const r = await execWithMockFetch(403, { success: false, error: 'Origin tidak diizinkan', errorCode: 'X', secret: 'kunci-rahasia-123' });
  eq(r.success, false, 'gagal');
  if (r.message.includes('kunci-rahasia-123') || r.message.includes('Origin tidak diizinkan')) {
    throw new Error('raw response bocor ke user: ' + r.message);
  }
  if (!r.message.includes('tidak dapat diakses')) throw new Error('pesan tidak ramah: ' + r.message);
});

await test('error provider 429/500: pesan ramah tanpa detail internal', async () => {
  const r1 = await execWithMockFetch(429, { internal: 'bucket=rl:abc' });
  if (r1.message.includes('bucket')) throw new Error('detail internal bocor (429)');
  const r2 = await execWithMockFetch(500, { stack: 'Error at api/_lib/x.js:42' });
  if (r2.message.includes('api/_lib')) throw new Error('stack trace bocor (500)');
  eq(r1.success, false, 'r1 gagal'); eq(r2.success, false, 'r2 gagal');
});

console.log(failures === 0 ? '\nALL AI RESPONSE QUALITY TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

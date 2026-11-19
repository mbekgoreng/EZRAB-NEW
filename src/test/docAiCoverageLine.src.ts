/**
 * Asersi tsx polos (BUKAN Vitest) untuk helper cakupan Document AI:
 * formatCoverageLine + stripCoverageLine (service.ts).
 *
 * Jalankan: npx --yes tsx src/test/docAiCoverageLine.src.ts
 */
import assert from 'node:assert';
import { formatCoverageLine, stripCoverageLine } from '../ai-tools/document-ai/service';
import type { DocCoverageInfo } from '../ai-tools/document-ai/types';

const full: DocCoverageInfo = {
  totalPages: 18,
  processedPages: 18,
  totalChunks: 36,
  processedChunks: 36,
  okChunks: 36,
  failedChunks: 0,
  failedPageRanges: [],
  partial: false,
};
assert.strictEqual(
  formatCoverageLine(full),
  'Cakupan: 18 dari 18 halaman diproses · 36 potongan (36 berhasil).',
);

const partial: DocCoverageInfo = {
  totalPages: 18,
  processedPages: 18,
  totalChunks: 36,
  processedChunks: 36,
  okChunks: 34,
  failedChunks: 2,
  failedPageRanges: [{ start: 5, end: 5 }],
  partial: true,
};
assert.strictEqual(
  formatCoverageLine(partial),
  'Cakupan: 18 dari 18 halaman diproses · 36 potongan (34 berhasil, 2 gagal) — hasil SEBAGIAN, tidak mencakup seluruh dokumen.',
);

// Baris cakupan yang dilekatkan service di akhir balasan dipotong.
const reply = '# Ringkasan\n\nIsi ringkasan.';
const appended =
  `${reply}\n\n---\nCakupan analisis: 18 dari 18 halaman terbaca diproses dalam 36 potongan (semua berhasil).`;
assert.strictEqual(stripCoverageLine(appended), reply);

// Balasan tanpa lampiran cakupan dibiarkan utuh.
assert.strictEqual(stripCoverageLine(reply), reply);

// Penanda di TENGAH teks (ada paragraf sesudahnya) bukan lampiran service.
const midMarker = `${reply}\n\n---\nCakupan analisis: palsu\n\nParagraf sesudahnya.`;
assert.strictEqual(stripCoverageLine(midMarker), midMarker);

console.log('docAiCoverageLine: 5 asersi lolos.');

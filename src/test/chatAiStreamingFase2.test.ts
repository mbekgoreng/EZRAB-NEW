/**
 * chatAiStreamingFase2.test.ts — Streaming Fase 2 (2026-11-27).
 *
 * Menguji modul MURNI streamingReveal.ts (rencana reveal + ringkasan):
 * tokenisasi, blok tabel, baris total + count-up, reduced-motion.
 * 0 panggilan provider, 0 panggilan berbayar — data lokal/stub saja.
 *
 * Jalankan: npx --yes tsx src/test/chatAiStreamingFase2.test.ts
 * (skrip asersi tsx polos, BUKAN suite vitest — "No test suite found"
 * dari vitest untuk file ini adalah keterbatasan harness, bukan gagal.)
 */
import assert from 'node:assert';
import {
  buildRevealPlan,
  summarizeReveal,
  tokenizeParagraph,
  parseRupiahCell,
  isTotalRow,
  formatRupiah,
  formatElapsedDtk,
  prefersReducedMotion,
} from '../ai-tools/ezrab-ai/streamingReveal.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, extra?: string) => {
  if (cond) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};
const eq = (a: unknown, b: unknown, name: string) =>
  check(name, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// ---------------------------------------------------------------------------
// [1] Util format
// ---------------------------------------------------------------------------
console.log('\n[1] format util');
eq(formatRupiah(120660900), 'Rp120.660.900', 'formatRupiah 120.660.900');
eq(formatRupiah(0), 'Rp0', 'formatRupiah 0');
eq(formatElapsedDtk(600), '0,6 dtk', 'formatElapsedDtk 600ms');
eq(formatElapsedDtk(12340), '12,3 dtk', 'formatElapsedDtk 12340ms');
eq(formatElapsedDtk(-5), '0,0 dtk', 'formatElapsedDtk negatif dijepit 0');
check('prefersReducedMotion boolean (tanpa window)', typeof prefersReducedMotion() === 'boolean');

// ---------------------------------------------------------------------------
// [2] parseRupiahCell + isTotalRow
// ---------------------------------------------------------------------------
console.log('\n[2] parse sel rupiah + baris total');
eq(parseRupiahCell('Rp120.660.900'), 120660900, 'parse Rp120.660.900');
eq(parseRupiahCell('1.850.000'), 1850000, 'parse 1.850.000 tanpa Rp');
eq(parseRupiahCell('1850000'), 1850000, 'parse polos 1850000');
eq(parseRupiahCell('Rp3,35 juta'), null, 'tolak desimal koma (Rp3,35 juta)');
eq(parseRupiahCell('Rp1.850.000,00'), null, 'tolak desimal ,00');
eq(parseRupiahCell('—'), null, 'tolak dash');
eq(parseRupiahCell(''), null, 'tolak string kosong');
check('isTotalRow: Total + Rp', isTotalRow(['**Total Estimasi**', '', '', '', 'Rp120.660.900']));
check('isTotalRow: bukan total', !isTotalRow(['Galian Tanah', '18,40', 'm³', 'Rp98.500', 'Rp1.812.400']));
check('isTotalRow: kata Total tanpa angka Rp', !isTotalRow(['Total Estimasi', '', '', '', '—']));

// ---------------------------------------------------------------------------
// [3] tokenizeParagraph — span atomik
// ---------------------------------------------------------------------------
console.log('\n[3] tokenisasi paragraf');
eq(
  tokenizeParagraph('Totalnya **Rp120.660.900**, atau sekitar `Rp3,35 juta` per m².'),
  ['Totalnya', '**Rp120.660.900**,', 'atau', 'sekitar', '`Rp3,35 juta`', 'per', 'm².'],
  'bold + kode utuh sebagai satu token',
);
eq(
  tokenizeParagraph('Lihat [panduan](https://x.test/a) dulu.'),
  ['Lihat', '[panduan](https://x.test/a)', 'dulu.'],
  'tautan utuh sebagai satu token',
);

// ---------------------------------------------------------------------------
// [4] buildRevealPlan — jawaban mockup (paragraf + tabel RAB + paragraf)
// ---------------------------------------------------------------------------
console.log('\n[4] rencana reveal jawaban RAB');
const REPLY = [
  'Siap! Saya susun draf RAB untuk **Rumah Type 36** — 1 lantai, luas bangunan 36 m².',
  '',
  '| Pekerjaan | Volume | Satuan | Harga Satuan | Jumlah |',
  '|---|---|---|---|---|',
  '| Pekerjaan Persiapan | 1,00 | Ls | Rp1.850.000 | Rp1.850.000 |',
  '| Galian Tanah Pondasi | 18,40 | m³ | Rp98.500 | Rp1.812.400 |',
  '| Pondasi Batu Kali | 12,60 | m³ | Rp685.000 | Rp8.631.000 |',
  '| **Total Estimasi** |  |  |  | **Rp120.660.900** |',
  '',
  'Totalnya **Rp120.660.900**, atau sekitar **Rp3,35 juta per m²**.',
].join('\n');
const plan = buildRevealPlan(REPLY);
eq(plan.blocks.length, 3, 'tiga blok: para, tabel, para');
eq(plan.blocks[0].kind, 'para', 'blok 0 paragraf');
eq(plan.blocks[1].kind, 'table', 'blok 1 tabel');
eq(plan.blocks[2].kind, 'para', 'blok 2 paragraf');
if (plan.blocks[1].kind === 'table') {
  eq(plan.blocks[1].headers, ['Pekerjaan', 'Volume', 'Satuan', 'Harga Satuan', 'Jumlah'], 'header tabel');
  eq(plan.blocks[1].rows.length, 4, 'empat baris isi (termasuk total)');
  eq(plan.blocks[1].totalRowIndex, 3, 'baris total = baris terakhir');
  eq(plan.blocks[1].totalCellIndex, 4, 'sel total = kolom terakhir');
  eq(plan.blocks[1].totalValue, 120660900, 'nilai total persis angka jawaban');
}
const kinds = plan.steps.map((s) => s.kind);
check('langkah diawali kata', kinds[0] === 'word');
check('ada tableHead', kinds.includes('tableHead'));
check('ada langkah row', kinds.filter((k) => k === 'row').length === 4);
eq(kinds.filter((k) => k === 'totalTick').length, 18, '18 tick count-up total');
check('tick terakhir = nilai persis', plan.steps.filter((s) => s.kind === 'totalTick').at(-1)?.kind === 'totalTick' && (plan.steps.filter((s) => s.kind === 'totalTick').at(-1) as { value: number }).value === 120660900);
check('totalSteps = jumlah langkah', plan.totalSteps === plan.steps.length);

// Urutan: semua kata blok 0 -> tableHead -> row -> totalTick -> kata blok 2.
const headIdx = kinds.indexOf('tableHead');
const firstRowIdx = kinds.indexOf('row');
const firstTickIdx = kinds.indexOf('totalTick');
const lastWordIdx = kinds.lastIndexOf('word');
check('urutan: tableHead sesudah kata awal', headIdx > 0 && kinds.slice(0, headIdx).every((k) => k === 'word'));
check('urutan: row sesudah tableHead', firstRowIdx === headIdx + 1);
check('urutan: tick sesudah semua row', firstTickIdx > kinds.lastIndexOf('row'));
check('urutan: kata penutup sesudah tick', lastWordIdx > kinds.lastIndexOf('totalTick'));

// ---------------------------------------------------------------------------
// [5] summarizeReveal — progres per langkah
// ---------------------------------------------------------------------------
console.log('\n[5] ringkasan reveal per langkah');
const s0 = summarizeReveal(plan, 0);
eq(s0[0].words, [], 'langkah 0: belum ada kata');
check('langkah 0: header belum tampil', !s0[1].headerShown);
const s1 = summarizeReveal(plan, 1);
eq(s1[0].words.length, 1, 'langkah 1: satu langkah kata tampil');
const headStep = plan.steps.findIndex((s) => s.kind === 'tableHead');
const sHead = summarizeReveal(plan, headStep + 1);
check('sesudah tableHead: header tampil, baris belum', sHead[1].headerShown && sHead[1].rowsShown === 0);
const firstRowStep = plan.steps.findIndex((s) => s.kind === 'row');
const sRow = summarizeReveal(plan, firstRowStep + 1);
eq(sRow[1].rowsShown, 1, 'sesudah row pertama: 1 baris tampil');
// Baris total tampil, tick belum jalan -> animasi mulai dari 0.
const totalRowStep = plan.steps.findIndex((s) => s.kind === 'row' && s.upto === 4);
const sTotal0 = summarizeReveal(plan, totalRowStep + 1);
eq(sTotal0[1].rowsShown, 4, 'semua 4 baris tampil');
eq(sTotal0[1].totalAnimated, 0, 'total mulai dihitung dari Rp0');
// Di tengah tick: nilai naik, belum nilai akhir.
const midTickStep = plan.steps.findIndex((s) => s.kind === 'totalTick') + 9;
const sMid = summarizeReveal(plan, midTickStep + 1);
check('tengah count-up: 0 < nilai < total', (sMid[1].totalAnimated ?? 0) > 0 && (sMid[1].totalAnimated ?? 0) < 120660900);
// Selesai: totalAnimated null (sel menampilkan nilai asli).
const sDone = summarizeReveal(plan, plan.totalSteps);
eq(sDone[1].totalAnimated, null, 'selesai: animasi total selesai (null)');
eq(sDone[1].rowsShown, 4, 'selesai: semua baris tampil');
check('selesai: semua kata tampil', sDone[0].words.join(' ').includes('Rumah') && sDone[2].words.join(' ').includes('Rp3,35'));
const sBeyond = summarizeReveal(plan, plan.totalSteps + 50);
eq(sBeyond[1].rowsShown, 4, 'langkah berlebih dijepit (tidak crash)');

// ---------------------------------------------------------------------------
// [6] Kasus tepi
// ---------------------------------------------------------------------------
console.log('\n[6] kasus tepi');
eq(buildRevealPlan('').totalSteps, 0, 'jawaban kosong: 0 langkah');
eq(buildRevealPlan('Halo, ada yang bisa dibantu?').blocks[0].kind, 'para', 'jawaban tanpa tabel: satu paragraf');
const noTotal = buildRevealPlan(['| A | B |', '|---|---|', '| x | Rp1.000 |'].join('\n'));
check(
  'tabel tanpa baris total: tanpa tick',
  noTotal.steps.every((s) => s.kind !== 'totalTick') && (noTotal.blocks[0].kind === 'table' ? noTotal.blocks[0].totalValue === null : false),
);
const longPara = buildRevealPlan(Array.from({ length: 300 }, (_, i) => `kata${i}`).join(' '));
check('paragraf 300 kata dibatasi ~140 langkah kata', longPara.steps.filter((s) => s.kind === 'word').length <= 140);

// ---------------------------------------------------------------------------
console.log(`\n${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.error('GAGAL:', failures.join(', '));
  process.exit(1);
}

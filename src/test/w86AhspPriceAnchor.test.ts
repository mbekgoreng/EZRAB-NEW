/**
 * W86 (browser regression 2026-11-14, residual D-86, PARTIAL FAIL) —
 * langkah 5 tutorial AHSP ("Periksa Harga & Sumber") tidak pernah
 * tampil pada tampilan AHSP default: jangkar
 * `[data-tutorial="ahsp-price"]` hanya dirender di cabang harga
 * (`hspPrice !== null && hspPrice > 0`), dan kartu pertama default
 * (Pondasi Tiang Bor ∅ 180 cm, SDA) tidak berharga → player
 * melewati langkah 5 dan tur berakhir setelah langkah 4.
 *
 * Perbaikan: jangkar dipindah ke kontainer baris HSP yang dirender
 * untuk SEMUA kartu pertama, berharga maupun tidak. Isi langkah 5
 * di registry sudah jujur untuk item tak berharga ("Tidak semua
 * item memiliki harga lengkap…"), jadi registry tidak diubah.
 *
 * Tes ini mengunci posisi jangkar secara struktural: anchor harus
 * ada tepat sekali, hanya di kartu pertama, DI LUAR cabang harga,
 * dan fallback "Harga belum tersedia" tetap dirender. Perilaku DOM
 * sesungguhnya (tur 1→5 lengkap) diverifikasi di browser headless
 * pada build lokal — lihat laporan regresi 07 §4.6 (W86).
 *
 * Jalankan: npx tsx src/test/w86AhspPriceAnchor.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import { getTutorial } from '../components/onboarding/tutorials/tutorialRegistry';

let failures = 0;
let passes = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function assertEq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

console.log('w86AhspPriceAnchor (W86, residual D-86):');

const ANCHOR = "data-tutorial={cardIndex === 0 ? 'ahsp-price' : undefined}";
const PRICED_BRANCH = '{hspPrice !== null && hspPrice > 0 ? (';

test('jangkar ahsp-price ada tepat sekali, hanya di kartu pertama', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  const occurrences = src.split(ANCHOR).length - 1;
  assertEq(occurrences, 1, 'ahsp-price anchor must occur exactly once (first card only)');
});

test('jangkar ahsp-price DI LUAR cabang harga (dirender untuk kartu pertama tak berharga)', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  const anchorIdx = src.indexOf(ANCHOR);
  const branchIdx = src.indexOf(PRICED_BRANCH);
  assert(anchorIdx >= 0, 'anchor missing');
  assert(branchIdx >= 0, 'priced branch marker missing');
  // Kontainer baris HSP dibuka SEBELUM kondisional harga — anchor
  // di atasnya dirender terlepas dari ada/tidaknya harga.
  assert(anchorIdx < branchIdx, 'anchor must precede the priced branch (W86 root cause: anchor inside the priced branch)');
  // Anchor tidak boleh muncul di dalam cabang harga maupun cabang else.
  const pricedSlice = src.slice(branchIdx, src.indexOf('Harga belum tersedia', branchIdx));
  assert(!pricedSlice.includes('ahsp-price'), 'anchor must not appear inside the priced branch');
});

test('jangkar menempel pada kontainer baris HSP (bukan elemen lain)', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  const anchorIdx = src.indexOf(ANCHOR);
  const branchIdx = src.indexOf(PRICED_BRANCH);
  const between = src.slice(anchorIdx, branchIdx);
  // Kontainer baris HSP dikenali dari style borderTop + label HSP.
  assert(between.includes('borderTop'), 'anchor must sit on the HSP row container (borderTop style)');
  assert(between.includes('Harga Satuan (HSP):'), 'anchor container must hold the HSP label');
});

test('fallback "Harga belum tersedia" tetap dirender untuk kartu tak berharga', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  const branchIdx = src.indexOf(PRICED_BRANCH);
  const fallbackIdx = src.indexOf('Harga belum tersedia', branchIdx);
  assert(fallbackIdx > branchIdx, 'unpriced fallback must remain in the else branch');
  // Fallback harus berada di cabang else (setelah ") : (").
  const elseIdx = src.indexOf(') : (', branchIdx);
  assert(elseIdx >= 0 && elseIdx < fallbackIdx, 'fallback must be inside the else branch of the priced conditional');
});

test('registry langkah 5 tetap menarget ahsp-price dengan isi jujur untuk item tak berharga', () => {
  const tut = getTutorial('ahsp-2026');
  assert(tut, 'tutorial ahsp-2026 must exist');
  assertEq(tut.steps.length, 5, 'step count');
  const s5 = tut.steps[4];
  assertEq(s5.target, '[data-tutorial="ahsp-price"]', 'step 5 target');
  assertEq(s5.title, 'Periksa Harga & Sumber', 'step 5 title');
  // Isi langkah tidak boleh mengklaim harga ada — item tak berharga
  // adalah kasus normal yang dijelaskan di sini.
  assert(
    s5.body.includes('Tidak semua item memiliki harga lengkap'),
    'step 5 body must stay honest for unpriced items',
  );
});

test('jangkar ahsp-card tidak terganggu (tetap di kartu pertama)', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  assert(
    src.includes("data-tutorial={cardIndex === 0 ? 'ahsp-card' : undefined}"),
    'ahsp-card anchor must remain on the first card',
  );
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

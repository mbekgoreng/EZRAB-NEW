/**
 * D-54 (Batch G2, P3) — pembulatan tampil ±Rp1: HSP yang ditampilkan
 * vs jumlah komponen yang ditampilkan (242 dari 1.037 kartu Bina Marga
 * berkomponen meleset sebelum perbaikan; mis. B.5 tampil 895.936 vs
 * HSP 895.935). Aturan tampilan OD-03(a): largest-remainder.
 *
 * Tes ini mengunci:
 *  (1) fungsi largestRemainderRound / isApportionableTotal (unit),
 *  (2) invarian katalog: untuk SETIAP kartu BM yang lolos guard
 *      tampilan persis seperti di AhspExplorerView, jumlah subtotal
 *      tampil hasil apportion SAMA PERSIS dengan HSP tampilannya,
 *  (3) kabel tampilan (source-level): kartu + dialog AHSP + tabel
 *      rincian QTO (Sloof) memakai helper ini.
 *
 * HANYA tampilan yang diuji di sini: nilai mentah & total tidak
 * berubah oleh apportionment (dijamin oleh desain helper — ia tidak
 * pernah menulis kembali ke data).
 *
 * Jalankan: npx tsx src/test/g2DisplayRounding.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import {
  largestRemainderRound,
  isApportionableTotal,
} from '../engine/displayRounding';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import {
  getAhspDirectPrice,
  getAhspDirectPriceBasis,
} from '../data/priceDatabase2026/ahspDisplayPolicy';

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

console.log('g2DisplayRounding (D-54):');

// --- (1) Unit: largestRemainderRound ---------------------------------------
test('jumlah hasil apportion persis sama dengan total bulat', () => {
  const out = largestRemainderRound([100.4, 200.4, 300.4], 601.2);
  assertEq(out.reduce((a, b) => a + b, 0), 601, 'sum must equal round(total)');
});
test('kasus audit B.5: 895.936 vs HSP 895.935 diperbaiki', () => {
  // Tiga seksi yang bila dibulatkan sendiri jumlahnya 895.936,
  // padahal totalnya 895.935 — apportion mengembalikan 895.935.
  const sections = [400000.6, 300000.6, 195934.2];
  const naive = sections.map((v) => Math.round(v)).reduce((a, b) => a + b, 0);
  assertEq(naive, 895936, 'sanity: round-each memang meleset +1 di sini');
  const out = largestRemainderRound(sections, 895935);
  assertEq(out.reduce((a, b) => a + b, 0), 895935, 'apportioned sum must equal HSP');
  // Tiap nilai tampil beda ≤Rp1 dari pembulatan biasa.
  out.forEach((v, i) => {
    assert(Math.abs(v - Math.round(sections[i])) <= 1, `nilai ${i} bergeser > Rp1`);
  });
});
test('Rp1 tambahan jatuh ke sisa pecahan terbesar', () => {
  // floor: [10, 20, 30] = 60; total 61 → +1 ke 30.9 (pecahan terbesar).
  assertEq(
    JSON.stringify(largestRemainderRound([10.2, 20.4, 30.9], 61.4)),
    JSON.stringify([10, 20, 31]),
    'largest remainder wins',
  );
});
test('seri pecahan → indeks terkecil dulu', () => {
  // floor sum 30, total 32 → +1 ke indeks 0 dan 1 (seri 0.5).
  assertEq(
    JSON.stringify(largestRemainderRound([10.5, 20.5, 0], 32)),
    JSON.stringify([11, 21, 0]),
    'ties go to earliest index',
  );
});
test('nilai nol tidak pernah menerima +Rp1 (pecahan 0)', () => {
  const out = largestRemainderRound([0, 100.6, 200.6], 301.2);
  assertEq(out[0], 0, 'zero stays zero');
  assertEq(out.reduce((a, b) => a + b, 0), 301, 'sum still exact');
});
test('kasus tepi: array kosong, total negatif, nilai non-finite', () => {
  assertEq(JSON.stringify(largestRemainderRound([], 100)), '[]', 'empty → []');
  assertEq(
    JSON.stringify(largestRemainderRound([10.4, 20.4], -5)),
    JSON.stringify([10, 20]),
    'negative total → plain round',
  );
  assertEq(
    JSON.stringify(largestRemainderRound([NaN, 20.4], 20)),
    JSON.stringify([0, 20]),
    'non-finite value → 0',
  );
});
test('total jauh lebih besar dari Σ nilai: jumlah tetap persis (distribusi aritmetik)', () => {
  const out = largestRemainderRound([1.1, 2.1], 1000);
  assertEq(out.reduce((a, b) => a + b, 0), 1000, 'sum exact even for weird input');
  assertEq(out.length, 2, 'length preserved');
});

// --- (1b) Unit: isApportionableTotal ---------------------------------------
test('guard: true bila round(Σ) == round(total)', () => {
  assert(isApportionableTotal([100.4, 200.4], 300.8), 'should be apportionable');
  assert(!isApportionableTotal([100.4, 200.4], 500), 'total bukan jumlah nilai → false');
  assert(!isApportionableTotal([], 100), 'kosong → false');
  assert(!isApportionableTotal([100, NaN], 100), 'non-finite → false');
  assert(!isApportionableTotal([100, 200], -1), 'total negatif → false');
});

// --- (2) Invarian katalog Bina Marga ---------------------------------------
test('katalog BM: setiap kartu yang lolos guard tampil jumlahnya persis', () => {
  const items = officialAhspRepository
    .getActiveOfficialAhsp()
    .filter((i) => (i as unknown as { domain?: string }).domain === 'BINA_MARGA');
  assert(items.length > 1000, `BM active items unexpectedly low: ${items.length}`);
  let checked = 0;
  let naiveMismatches = 0;
  const bad: string[] = [];
  for (const item of items) {
    const comp = priceResolver2026.resolveAhspUnitPrice(item as never) as {
      labor: { subtotalPerUnit?: number; components: unknown[] };
      material: { subtotalPerUnit?: number; components: unknown[] };
      equipment: { subtotalPerUnit?: number; components: unknown[] };
    };
    const hsp = getAhspDirectPrice(comp as never)
      ?? (item as unknown as { unitPrice?: number }).unitPrice;
    const basis =
      getAhspDirectPrice(comp as never) != null && (getAhspDirectPrice(comp as never) as number) > 0
        ? getAhspDirectPriceBasis(comp as never)
        : null;
    const l = comp.labor?.subtotalPerUnit || 0;
    const m = comp.material?.subtotalPerUnit || 0;
    const e = comp.equipment?.subtotalPerUnit || 0;
    // Guard PERSIS seperti di AhspExplorerView (kartu).
    const sectionsNumeric =
      (l > 0 || comp.labor.components.length === 0) &&
      (m > 0 || comp.material.components.length === 0) &&
      (e > 0 || comp.equipment.components.length === 0);
    const sectionTotals = [l, m, e];
    const canApportion =
      sectionsNumeric &&
      hsp != null && hsp > 0 &&
      basis !== 'DHSP' &&
      isApportionableTotal(sectionTotals, hsp);
    if (!canApportion) continue;
    checked++;
    // Bukti bugnya nyata: hitung berapa kartu yang MELeset bila
    // dibulatkan sendiri (pra-perbaikan).
    const naive = sectionTotals.map((v) => Math.round(v)).reduce((a, b) => a + b, 0);
    if (naive !== Math.round(hsp)) naiveMismatches++;
    const out = largestRemainderRound(sectionTotals, hsp);
    const sum = out.reduce((a, b) => a + b, 0);
    if (sum !== Math.round(hsp)) {
      if (bad.length < 5) {
        bad.push(`${(item as unknown as { code?: string }).code}: sum ${sum} vs HSP ${Math.round(hsp)}`);
      }
    }
  }
  assert(checked > 900, `too few guard-passing cards: ${checked}`);
  assert(naiveMismatches > 0, 'sanity: round-each harus meleset di sebagian kartu (bug nyata)');
  assertEq(bad.length, 0, `apportioned sums mismatch: ${bad.join('; ')}`);
  console.log(`    (kartu BM lolos guard: ${checked}; round-each meleset: ${naiveMismatches} — semua diperbaiki apportion)`);
});

// --- (3) Kabel tampilan (source-level) -------------------------------------
test('kartu AHSP memakai largestRemainderRound + guard isApportionableTotal', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  assert(src.includes('largestRemainderRound(sectionTotals, hspPrice'), 'card apportion call missing');
  assert(src.includes('isApportionableTotal(sectionTotals, hspPrice)'), 'card guard missing');
  assert(src.includes("priceBasis !== 'DHSP'"), 'DHSP exclusion missing');
  assert(src.includes('dispLabor'), 'apportioned display values missing');
});
test('dialog AHSP memakai apportion per komponen', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  assert(src.includes('dialogApportionedSubtotals'), 'dialog apportion memo missing');
  assert(src.includes('displaySubtotal'), 'renderCompRow displaySubtotal param missing');
});
test('tabel rincian QTO (Sloof) memakai displayJumlahHarga hasil apportion', () => {
  const src = readSrc('components/qto/QtoCalculatorView.tsx');
  assert(src.includes('displayJumlahHarga'), 'displayJumlahHarga missing');
  assert(
    src.includes('priceBreakdown.displayJumlahHarga?.get(row.key) ?? row.jumlahHarga'),
    'table cell must use apportioned value with raw fallback',
  );
  assert(src.includes('unresolvedRowCount === 0'), 'Sloof guard (all rows priced) missing');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

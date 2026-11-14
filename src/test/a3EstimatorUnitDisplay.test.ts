/**
 * A3 RESIDUAL (2026-11-15) — EstimatorAhspView memakai satuan TAMPIL.
 *
 * Laporan 09 §19-A3: `EstimatorAhspView.tsx:224` masih menampilkan `unit`
 * mentah sesudah perbaikan narrowing D-55 memindahkan satuan tampil ke
 * field display-only `unitDisplay`. Koreksi premis: adopsi harfiah
 * `item.unitDisplay ?? item.unit` TIDAK tersedia di sini — view ini
 * merender baris RAB proyek (`RabItem`, tanpa field `unitDisplay`),
 * bukan item registry (`NationalAHSPItem`). Yang diadopsi adalah
 * `matchOfficial.unitDisplay` — item resmi yang SUDAH di-resolve untuk
 * kartu itu oleh `resolveAhspItemDisplay` — dengan guard kesetaraan
 * satuan (satuan tersimpan baris harus sama dengan satuan mentah item
 * resmi) agar satuan yang sudah diedit user tidak salah label.
 *
 * Tes ini membuktikan:
 *  (1) satuan TAMPIL kartu == `unitDisplay` untuk baris BM yang cocok
 *      (G.166 -> "m'", B.1 -> "m3");
 *  (2) guard: satuan editan / tanpa kecocokan / non-BM -> satuan baris;
 *  (3) kedua situs render kartu (meta + sufiks HSP) memakai nilai tampil
 *      yang sama — tidak ada lagi `{item.unit` telanjang di header kartu;
 *  (4) resolusi harga TIDAK tersentuh: jalur harga (`ahspItemDisplay`)
 *      tidak membaca `unitDisplay` sama sekali, dan `displayUnit` hanya
 *      mengalir ke node teks JSX.
 *
 * Bukti runtime pelengkap (di luar berkas ini): suite pendeteksi regresi
 * D-55 — s2ProvenanceTransfer + costPolicyEngine + g2BinaMargaUnits +
 * d55Narrowing — harus tetap hijau sesudah perubahan ini.
 *
 * Jalankan: npx tsx src/test/a3EstimatorUnitDisplay.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import { displayUnitForRow } from '../components/estimator/EstimatorAhspView';
import { resolveAhspItemDisplay } from '../components/estimator/ahspItemDisplay';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import type { RabItem } from '../types';

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

function rabRow(over: Partial<RabItem>): RabItem {
  return {
    id: 'row-1',
    no: 1,
    code: 'G.166',
    category: 'BINA_MARGA',
    description: 'Baris uji G.166',
    volume: 1,
    unit: 'Meter Panjang',
    unitPrice: null,
    amount: null,
    ...over,
  } as RabItem;
}

console.log('a3EstimatorUnitDisplay (A3 residual — satuan tampil EstimatorAhspView):');

// --- (1) Satuan tampil == unitDisplay untuk baris BM yang cocok ------------
test('G.166: satuan tampil "m\'" bila satuan tersimpan == satuan mentah resmi', () => {
  const official = officialAhspRepository.getOfficialAhsp('G.166');
  assert(official, 'G.166 must exist in the official repository');
  assertEq(official!.unit, 'Meter Panjang', 'G.166 official raw unit');
  assertEq(official!.unitDisplay, "m'", 'G.166 official unitDisplay');
  assertEq(
    displayUnitForRow(rabRow({}), official),
    "m'",
    'displayed unit must equal unitDisplay for a matching BM row',
  );
});
test('B.1: satuan tampil "m3"', () => {
  const official = officialAhspRepository.getOfficialAhsp('B.1');
  assert(official, 'B.1 must exist in the official repository');
  assertEq(official!.unit, 'Meter Kubik', 'B.1 official raw unit');
  assertEq(official!.unitDisplay, 'm3', 'B.1 official unitDisplay');
  assertEq(
    displayUnitForRow(rabRow({ code: 'B.1', unit: 'Meter Kubik' }), official),
    'm3',
    'displayed unit must equal unitDisplay for B.1',
  );
});
test('resolveAhspItemDisplay mengabel matchOfficial ber-unitDisplay untuk baris G.166', () => {
  const d = resolveAhspItemDisplay(rabRow({}));
  assert(d.matchOfficial, 'G.166 row must match an official item');
  assertEq(d.matchOfficial!.unit, 'Meter Panjang', 'matched official raw unit');
  assertEq(d.matchOfficial!.unitDisplay, "m'", 'matched official unitDisplay');
  assertEq(
    displayUnitForRow(rabRow({}), d.matchOfficial),
    "m'",
    'displayed unit from the resolver-wired matchOfficial must be unitDisplay',
  );
});

// --- (2) Guard: tanpa kecocokan satuan -> satuan baris apa adanya -----------
test('guard: satuan baris yang sudah diedit TIDAK tertimpa unitDisplay resmi', () => {
  const official = officialAhspRepository.getOfficialAhsp('G.166');
  assert(official, 'G.166 must exist in the official repository');
  // User mengedit satuan baris menjadi m2 — tampil harus m2, bukan "m'".
  assertEq(
    displayUnitForRow(rabRow({ unit: 'm2' }), official),
    'm2',
    'edited row unit must win over the official display unit',
  );
});
test('tanpa kecocokan resmi -> satuan baris apa adanya', () => {
  assertEq(
    displayUnitForRow(rabRow({ code: 'X.TIDAK-ADA', unit: 'ls' }), undefined),
    'ls',
    'unmatched row must display its own stored unit',
  );
});
test('item resmi non-BM (tanpa unitDisplay) -> satuan baris apa adanya', () => {
  const official = officialAhspRepository.getOfficialAhsp('A.1.01.a.1');
  assert(official, 'A.1.01.a.1 must exist in the official repository');
  assert(!official!.unitDisplay, 'canonical non-BM item must not carry unitDisplay');
  assertEq(
    displayUnitForRow(rabRow({ code: 'A.1.01.a.1', unit: official!.unit }), official),
    official!.unit,
    'non-BM row must display its own stored unit',
  );
});
test('helper murni: tidak memutasi baris maupun item resmi', () => {
  const official = officialAhspRepository.getOfficialAhsp('G.166');
  const row = rabRow({});
  displayUnitForRow(row, official);
  assertEq(row.unit, 'Meter Panjang', 'row unit must be untouched by the helper');
  assertEq(official!.unit, 'Meter Panjang', 'official raw unit must be untouched by the helper');
  assertEq(official!.unitDisplay, "m'", 'official unitDisplay must be untouched by the helper');
});

// --- (3) Kabel tampilan (source-level): kedua situs memakai displayUnit -----
test('view merender displayUnit di baris meta + sufiks HSP; tanpa {item.unit telanjang', () => {
  const src = readSrc('components/estimator/EstimatorAhspView.tsx');
  assert(
    src.includes('const displayUnit = displayUnitForRow(item, matchOfficial);'),
    'view must derive one displayUnit per card from the row + matchOfficial',
  );
  assert(
    src.includes('{displayUnit || "—"}'),
    'meta line must render the display unit',
  );
  assert(src.includes('/ {displayUnit}'), 'HSP suffix must render the same display unit');
  assert(
    !src.includes('{item.unit'),
    'no bare {item.unit render may remain in the card header (component rows use l/m/eq.unit)',
  );
  assert(
    src.includes('matchOfficial.unit === item.unit && matchOfficial.unitDisplay'),
    'helper must guard on stored-unit == official-raw-unit before using unitDisplay',
  );
});

// --- (4) Resolusi harga tidak tersentuh --------------------------------------
test('jalur harga tidak membaca unitDisplay; displayUnit hanya mengalir ke JSX', () => {
  const displaySrc = readSrc('components/estimator/ahspItemDisplay.ts');
  assert(
    !displaySrc.includes('unitDisplay'),
    'ahspItemDisplay (price-resolution path) must never read unitDisplay',
  );
  const viewSrc = readSrc('components/estimator/EstimatorAhspView.tsx');
  const lines = viewSrc.split('\n');
  const displayLines = lines.filter((l) => l.includes('displayUnit'));
  assert(displayLines.length >= 5, `expected >=5 displayUnit lines, got ${displayLines.length}`);
  for (const line of displayLines) {
    const trimmed = line.trim();
    const ok =
      trimmed.startsWith('export function displayUnitForRow') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('const displayUnit = displayUnitForRow') ||
      trimmed.includes('{displayUnit');
    assert(ok, `displayUnit must flow only to JSX text, unexpected line: ${trimmed}`);
  }
  // Tidak ada pemakaian displayUnit sebagai argumen/payload di mana pun.
  assert(!viewSrc.includes('unit: displayUnit'), 'displayUnit must never become a stored unit');
  assert(!viewSrc.includes('displayUnit,'), 'displayUnit must never be passed as an argument');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

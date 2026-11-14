/**
 * D-55 NARROWING (2026-11-14) — regresi Batch G2, laporan 08 §8.
 *
 * G2 menerapkan perbaikan tampilan D-55 di LAPISAN PEMETAAN BERSAMA
 * (`unit` ditimpa hasil-resolver di masterRegistry + adapter), sehingga
 * satuan verbatim "Meter Panjang"/"Meter Kubik" jatuh ke kanonis
 * ("m'"/"m3") di jalur resolusi harga: G.166 ter-resolve OFFICIAL_AHSP
 * (s2 173/186) dan pin "Meter Kubik" costPolicyEngine patah (5/6).
 *
 * Desain yang dipersempit (dipin di sini):
 *  - `unit` di KEDUA lapisan pemetaan kembali VERBATIM master (semantik
 *    pra-G2) — resolusi harga tidak lagi melihat satuan hasil-resolver.
 *  - Satuan TAMPIL tinggal di `unitDisplay` (registry nasional saja;
 *    adapter adalah dataset mesin tanpa konsumen tampilan) dan dibaca
 *    HANYA oleh kartu/dialog AHSP Explorer.
 *  - Jalur fungsional tambah-ke-RAB tetap memakai `unit` mentah.
 *
 * Tes ini TIDAK melemahkan apa pun: s2 + costPolicyEngine + g2 pin
 * resolver/katalog tetap berjalan apa adanya dan harus hijau.
 *
 * Jalankan: npx tsx src/test/d55Narrowing.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import { BINA_MARGA_AHSP_2026_OFFICIAL } from '../data/nationalCostDatabase/binaMarga2026Adapter';
import { BINA_MARGA_2026_MASTER } from '../data/nationalCostDatabase/binaMarga2026Master.generated';
import {
  resolveBinaMargaUnit,
  isKnownBinaMargaUnit,
} from '../data/nationalCostDatabase/binaMargaUnitResolution';

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

function registryBm(code: string) {
  const item = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.domain === 'BINA_MARGA' && i.code === code);
  assert(item, `registry BM item ${code} must exist`);
  return item!;
}
function adapterBm(code: string) {
  const item = BINA_MARGA_AHSP_2026_OFFICIAL.find((i) => i.code === code);
  assert(item, `adapter BM item ${code} must exist`);
  return item!;
}

console.log('d55Narrowing (D-55 narrowing — regresi G2, laporan 08 §8):');

// --- (1) Perilaku resolusi kembali ke pra-G2 (runtime) ----------------------
test('registry G.166: unit mentah "Meter Panjang", unitDisplay "m\'"', () => {
  const item = registryBm('G.166');
  assertEq(item.unit, 'Meter Panjang', 'G.166 mapped unit must be the raw master unit');
  assertEq(item.unitRaw, 'Meter Panjang', 'G.166 unitRaw');
  assertEq(item.unitDisplay, "m'", 'G.166 display unit resolves via canonical');
});
test('registry B.1 (2.1.(1)): unit mentah "Meter Kubik", unitDisplay "m3"', () => {
  const item = registryBm('B.1');
  assertEq(item.unit, 'Meter Kubik', 'B.1 mapped unit must be the raw master unit');
  assertEq(item.standardCode, '2.1.(1)', 'B.1 standardCode');
  assertEq(item.unitDisplay, 'm3', 'B.1 display unit resolves via canonical');
});
test('adapter B.1 + G.166: unit verbatim master (tanpa resolver)', () => {
  assertEq(adapterBm('B.1').unit, 'Meter Kubik', 'adapter B.1 unit verbatim');
  assertEq(adapterBm('G.166').unit, 'Meter Panjang', 'adapter G.166 unit verbatim');
});

// --- (2) Invarian katalog pada lapisan terpeta ------------------------------
test('setiap item BM terpeta: unit === unit mentah master (pemetaan tidak mengubah unit)', () => {
  const rawByCode = new Map(BINA_MARGA_2026_MASTER.map((m) => [m.code, m.unit]));
  let checked = 0;
  const mismatched: string[] = [];
  for (const item of ALL_OFFICIAL_AHSP_ITEMS) {
    if (item.domain !== 'BINA_MARGA') continue;
    checked++;
    const raw = rawByCode.get(item.code);
    assert(raw !== undefined, `master item missing for mapped code ${item.code}`);
    if (item.unit !== raw && mismatched.length < 5) {
      mismatched.push(`${item.code}: mapped ${JSON.stringify(item.unit)} vs master ${JSON.stringify(raw)}`);
    }
  }
  assertEq(checked, BINA_MARGA_2026_MASTER.length, 'mapped BM count must equal master count');
  assertEq(mismatched.length, 0, `mapped unit differs from master raw: ${mismatched.join('; ')}`);
});
test('setiap item BM terpeta: unitDisplay valid + hitungan jalur 294/838/5 (tampilan selamat)', () => {
  let kept = 0;
  let fixed = 0;
  let dashed = 0;
  const dashedCodes: string[] = [];
  const invalid: string[] = [];
  for (const item of ALL_OFFICIAL_AHSP_ITEMS) {
    if (item.domain !== 'BINA_MARGA') continue;
    const raw = item.unitRaw ?? item.unit;
    assertEq(
      item.unitDisplay,
      resolveBinaMargaUnit(raw, item.standardCode),
      `${item.code}: unitDisplay must equal the resolver output`,
    );
    const disp = item.unitDisplay;
    if (disp !== '—' && !isKnownBinaMargaUnit(disp)) {
      if (invalid.length < 5) invalid.push(`${item.code}: ${JSON.stringify(disp)}`);
    }
    if (isKnownBinaMargaUnit(raw)) kept++;
    else if (disp === '—') {
      dashed++;
      dashedCodes.push(item.code);
    } else fixed++;
  }
  assertEq(invalid.length, 0, `unitDisplay invalid: ${invalid.join('; ')}`);
  assertEq(kept, 294, 'kept (already valid) count');
  assertEq(fixed, 838, 'fixed via canonical count');
  assertEq(dashed, 5, 'dash (no canonical) count');
  assertEq(
    JSON.stringify([...dashedCodes].sort()),
    JSON.stringify(['A.2', 'A.7', 'G.51', 'G.52', 'J.14']),
    'the 5 dash items must be exactly these codes',
  );
});

// --- (3) Kabel tampilan (source-level) ---------------------------------------
test('AhspExplorerView merender unitDisplay di kartu + dialog', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  assert(
    src.includes('item.unitDisplay ?? item.unit'),
    'view must define the display-unit helper (unitDisplay ?? unit)',
  );
  const sites = (src.match(/displayUnit\((item|selectedAhsp)\)/g) ?? []).length;
  assert(sites >= 3, `expected >=3 displayUnit render sites (card x2 + dialog), got ${sites}`);
});
test('jalur tambah-ke-RAB tetap memakai unit mentah (bukan unitDisplay)', () => {
  const src = readSrc('components/ahsp/AhspExplorerView.tsx');
  assert(src.includes('unit: addToRabModalItem.unit'), 'RAB item creation must use the raw unit');
  assert(!src.includes('unit: displayUnit('), 'RAB item creation must never use the display unit');
});
test('tidak ada override unit oleh resolver di lapisan pemetaan', () => {
  for (const rel of [
    'data/nationalCostDatabase/masterRegistry.ts',
    'data/nationalCostDatabase/binaMarga2026Adapter.ts',
  ]) {
    const src = readSrc(rel);
    assert(!src.includes('unit: resolveBinaMargaUnit'), `${rel} must not override unit with the resolver`);
  }
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

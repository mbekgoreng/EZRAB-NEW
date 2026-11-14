/**
 * D-55 (Batch G2, P2) — field "Satuan" Bina Marga berisi fragmen
 * deskripsi pembayaran ("Pemadatan Cerdas (IC)" dkk.) dari ekstraksi
 * PDF, bukan satuan. Perbaikan di LAPISAN PEMETAAN (bukan berkas
 * generated — binaMarga2026Master.generated.ts bertanda DO NOT EDIT
 * dan JSON sumbernya tidak ada di repo):
 *   1. unit master sudah dikenal → dipakai verbatim,
 *   2. bukan satuan → satuan kanonis lewat standardCode (838 item),
 *   3. tanpa padanan kanonis → "—" (5 item; TIDAK PERNAH mengarang).
 *
 * Tes ini mengunci:
 *  (1) resolver per-kasus (unit),
 *  (2) invarian katalog: SETIAP item master ter-resolve ke satuan
 *      yang dikenal atau "—", dengan hitungan per jalur yang persis
 *      sama dengan hasil probe (294 dipertahankan / 838 diperbaiki
 *      lewat kanonis / 5 → "—"),
 *  (3) kabel pemetaan (source-level) — DIPERSEMPIT 2026-11-14
 *      (laporan 08 §8): masterRegistry memakai resolver HANYA untuk
 *      `unitDisplay` (tampilan) sementara `unit` kembali verbatim
 *      master; adapter TIDAK memakai resolver sama sekali (dataset
 *      mesin, tanpa konsumen tampilan). Berkas generated TIDAK
 *      disentuh (fragmen masih ada di sana).
 *
 * PENYEMPITAN (D-55 narrowing, 2026-11-14): versi G2 mem-pin resolver
 * yang menimpa `unit` di KEDUA lapisan pemetaan — itu adalah regresi
 * (G.166 "Meter Panjang" → "m'" lalu ter-resolve OFFICIAL_AHSP;
 * s2 173/186 + costPolicyEngine 5/6). Pin (1)–(2) di bawah TIDAK
 * BERUBAH (resolver + katalog tetap); hanya pin kabel (3) yang
 * diperbarui ke desain yang dipersempit. Pin runtime perilaku
 * resolusi ada di d55Narrowing.test.ts.
 *
 * Jalankan: npx tsx src/test/g2BinaMargaUnits.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import {
  resolveBinaMargaUnit,
  isKnownBinaMargaUnit,
  KNOWN_BM_UNITS,
  canonicalBmUnitIndexSize,
} from '../data/nationalCostDatabase/binaMargaUnitResolution';
import { BINA_MARGA_2026_MASTER } from '../data/nationalCostDatabase/binaMarga2026Master.generated';

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

console.log('g2BinaMargaUnits (D-55):');

// --- (1) Unit: resolver ----------------------------------------------------
test('himpunan satuan dikenal = 12 satuan kanonis BM', () => {
  assertEq(KNOWN_BM_UNITS.size, 12, 'KNOWN_BM_UNITS size');
  for (const u of ['buah', 'jam', 'kg', 'km', 'l', 'ls', 'm', "m'", 'm2', 'm3', 'titik', 'ton']) {
    assert(KNOWN_BM_UNITS.has(u), `missing unit ${u}`);
  }
});
test('isKnownBinaMargaUnit: case-insensitive, trim, menolak fragmen', () => {
  assert(isKnownBinaMargaUnit('M3'), 'M3 known');
  assert(isKnownBinaMargaUnit('  Jam '), 'trimmed Jam known');
  assert(isKnownBinaMargaUnit("m'"), "m' known");
  assert(!isKnownBinaMargaUnit('Pemadatan Cerdas (IC)'), 'fragment not a unit');
  assert(!isKnownBinaMargaUnit(''), 'empty not a unit');
  assert(!isKnownBinaMargaUnit(null), 'null not a unit');
  assert(!isKnownBinaMargaUnit(undefined), 'undefined not a unit');
});
test('unit valid dipakai verbatim (ejaan sumber dipertahankan)', () => {
  assertEq(resolveBinaMargaUnit('M3', '3.2.(1b)'), 'M3', 'verbatim M3');
  assertEq(resolveBinaMargaUnit('m', 'H.15'), 'm', 'verbatim m');
});
test('fragmen tanpa padanan kanonis → "—" (tidak mengarang)', () => {
  assertEq(resolveBinaMargaUnit('Pemadatan Cerdas (IC)', 'KODE-TIDAK-ADA'), '—', 'no canonical → dash');
  assertEq(resolveBinaMargaUnit('', null), '—', 'empty + no code → dash');
  assertEq(resolveBinaMargaUnit(null, undefined), '—', 'null → dash');
});
test('fragmen dengan padanan kanonis → satuan kanonis', () => {
  // B.38 (terverifikasi): master membawa fragmen "Meter Panjang",
  // standardCode 2.3.(21a) memetakan ke kanonis "m'".
  const item = BINA_MARGA_2026_MASTER.find((i) => i.code === 'B.38');
  assert(item, 'B.38 must exist in master');
  assert(!isKnownBinaMargaUnit(item.unit), 'sanity: B.38 master unit is a fragment');
  assertEq(resolveBinaMargaUnit(item.unit, item.standardCode), "m'", 'B.38 resolves via canonical');
});
test('konflik sah H.15 / J.60: unit master yang valid MENANG (tidak diam-diam diganti)', () => {
  // H.15: master "m" vs kanonis "buah"; J.60: master "m" vs kanonis
  // "m'". Keduanya valid sehingga aturan (1) menang; konflik dicatat
  // untuk report 09, bukan diselesaikan diam-diam di sini.
  for (const code of ['H.15', 'J.60']) {
    const item = BINA_MARGA_2026_MASTER.find((i) => i.code === code);
    assert(item, `${code} must exist in master`);
    assertEq(resolveBinaMargaUnit(item.unit, item.standardCode), 'm', `${code} keeps master unit`);
  }
});

// --- (2) Invarian katalog --------------------------------------------------
test('semua item master ter-resolve ke satuan dikenal atau "—" (hitungan jalur persis)', () => {
  let kept = 0;
  let fixed = 0;
  let dashed = 0;
  const dashedCodes: string[] = [];
  const invalid: string[] = [];
  for (const item of BINA_MARGA_2026_MASTER) {
    const resolved = resolveBinaMargaUnit(item.unit, item.standardCode);
    if (resolved !== '—' && !isKnownBinaMargaUnit(resolved)) {
      if (invalid.length < 5) invalid.push(`${item.code}: ${JSON.stringify(resolved)}`);
    }
    if (isKnownBinaMargaUnit(item.unit)) kept++;
    else if (resolved === '—') {
      dashed++;
      dashedCodes.push(item.code);
    } else fixed++;
  }
  assertEq(invalid.length, 0, `unresolved to invalid unit: ${invalid.join('; ')}`);
  // Hitungan probe (2026-11-14): 294 dipertahankan, 838 diperbaiki
  // lewat kanonis, 5 tanpa padanan. Data master statis (generated);
  // bila hitungan bergeser, data berubah & tes ini harus mengetahuinya.
  assertEq(kept, 294, 'kept (already valid) count');
  assertEq(fixed, 838, 'fixed via canonical count');
  assertEq(dashed, 5, 'dash (no canonical) count');
  assertEq(
    JSON.stringify([...dashedCodes].sort()),
    JSON.stringify(['A.2', 'A.7', 'G.51', 'G.52', 'J.14']),
    'the 5 dash items must be exactly these codes',
  );
  assert(
    canonicalBmUnitIndexSize() > 800,
    `canonical unit index unexpectedly small: ${canonicalBmUnitIndexSize()}`,
  );
  console.log(`    (master ${BINA_MARGA_2026_MASTER.length} item: ${kept} dipertahankan, ${fixed} diperbaiki, ${dashed} → "—")`);
});

// --- (3) Kabel pemetaan (source-level) — desain dipersempit 2026-11-14 ---
test('masterRegistry: unit mentah dipertahankan, unitDisplay lewat resolver & unitRaw disimpan', () => {
  const src = readSrc('data/nationalCostDatabase/masterRegistry.ts');
  // D-55 narrowing: resolver TIDAK BOLEH lagi menimpa `unit` (regresi
  // laporan 08 §8 — G.166 ter-resolve). `unit` kembali verbatim
  // master; satuan tampil tinggal di `unitDisplay`.
  assert(src.includes('unit: item.unit'), 'mapped unit must stay the raw master unit (pre-G2 semantics)');
  assert(!src.includes('unit: resolveBinaMargaUnit'), 'resolver must NOT override unit');
  assert(src.includes('unitDisplay: resolveBinaMargaUnit(item.unit, item.standardCode)'), 'unitDisplay must come from the resolver');
  assert(src.includes('unitRaw'), 'raw unit must be preserved as unitRaw');
});
test('adapter official TIDAK menimpa unit (verbatim dipertahankan)', () => {
  const src = readSrc('data/nationalCostDatabase/binaMarga2026Adapter.ts');
  // D-55 narrowing: adapter adalah dataset MESIN tanpa konsumen
  // tampilan — override resolver di sini adalah regresi yang
  // mematahkan s2 + costPolicyEngine (laporan 08 §8). `unit` harus
  // tetap verbatim master (dipin runtime di d55Narrowing + pin
  // 'Meter Kubik' di costPolicyEngine).
  assert(!src.includes('unit: resolveBinaMargaUnit'), 'adapter must NOT override unit with the resolver');
  assert(!src.includes('binaMargaUnitResolution'), 'adapter must not import the unit resolver');
  assert(src.includes('...item'), 'spread must remain (raw unit flows through)');
});
test('berkas generated TIDAK disentuh (fragmen masih ada di sana)', () => {
  const src = readSrc('data/nationalCostDatabase/binaMarga2026Master.generated.ts');
  assert(src.includes('Pemadatan Cerdas (IC)'), 'fragment must still be in generated master (fix is at mapping layer)');
  assert(src.includes('DO NOT EDIT'), 'generated marker must remain');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

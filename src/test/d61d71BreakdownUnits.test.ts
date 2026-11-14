/**
 * D-61 + D-71 (P2) — Breakdown unit labels wrong (Bowplank + Sloof).
 * Run: npx tsx src/test/d61d71BreakdownUnits.test.ts
 *
 * Root cause: the breakdown unit was guessed by substring matching on
 * the breakdown KEY, with wrong ordering — the 'm' catch-all ran before
 * 'jumlah' ('jumlah' itself contains 'm'), and 'besi'/'kawat' beat the
 * trailing-'M' meters signal. Fix: explicit per-row mapping in
 * `src/lib/breakdownRowMeta.ts` + a corrected-order fallback heuristic
 * (never a bare-'m' substring). Same module fixes the label transform
 * (D-26 instance: "Volume Kayu Balok57").
 *
 * Also covers the hand-verified Sloof volumes: 0.90 m³ at P=3 (defaults)
 * and 1.80 m³ at P=6 (b=0.20, h=0.30, n=5).
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CONSTRUCTION_CALCULATORS, getCalculatorById } from '../engine/constructionCalculators/registry';
import { getBreakdownRowUnit, guessBreakdownUnit, formatBreakdownLabel } from '../lib/breakdownRowMeta';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

// --- D-61: Bowplank rows -------------------------------------------------------

test('D-61: every Bowplank breakdown row has its correct unit', () => {
  const expected: Record<string, string> = {
    luasLahan: 'm²',
    kelilingBowplank: 'm',
    jumlahPatok: 'bh',
    panjangTotalPatok: 'm',
    panjangTotalPapan: 'm',
    panjangTotalSkur: 'm',
    volumeKayuBalok57: 'm³',
    volumeKayuPapan320: 'm³',
    kebutuhanPakuKg: 'kg',
  };
  for (const [key, unit] of Object.entries(expected)) {
    eq(getBreakdownRowUnit(key), unit, `Bowplank ${key}`);
  }
});

test('D-61: jumlahPatok is a count (bh), not meters — the old bug', () => {
  eq(getBreakdownRowUnit('jumlahPatok'), 'bh', 'jumlahPatok');
  ok(getBreakdownRowUnit('jumlahPatok') !== 'm', 'must not be m');
});

test('D-61: timber volumes are m³, not m — the old bug', () => {
  eq(getBreakdownRowUnit('volumeKayuBalok57'), 'm³', 'balok volume');
  eq(getBreakdownRowUnit('volumeKayuPapan320'), 'm³', 'papan volume');
});

test('D-61/D-26: timber labels read 5/7 and 3/20 (no glued "Balok57")', () => {
  eq(formatBreakdownLabel('volumeKayuBalok57'), 'Volume Kayu Balok 5/7', 'balok label');
  eq(formatBreakdownLabel('volumeKayuPapan320'), 'Volume Kayu Papan 3/20', 'papan label');
  ok(!formatBreakdownLabel('volumeKayuBalok57').includes('Balok57'), 'no glued digits');
});

// --- D-71: Sloof rows ----------------------------------------------------------

test('D-71: every Sloof breakdown row has its correct unit', () => {
  const expected: Record<string, string> = {
    pekerjaanCorSloofM3: 'm³',
    pekerjaanBekistingM2: 'm²',
    pekerjaanPembesianKg: 'kg',
    jumlahKawatBetonKg: 'kg',
    panjangBesiTulangan1M: 'm',
    panjangBesiTulangan2M: 'm',
    panjangBesiSengkangM: 'm',
    panjangKawatBetonM: 'm',
    totalPanjangBesi1M: 'm',
    totalPanjangBesi2M: 'm',
    totalPanjangSengkangM: 'm',
    totalPanjangKawatM: 'm',
  };
  for (const [key, unit] of Object.entries(expected)) {
    eq(getBreakdownRowUnit(key), unit, `Sloof ${key}`);
  }
});

test('D-71: Sloof length rows are meters, weight rows are kg (no cross-contamination)', () => {
  for (const key of ['panjangBesiTulangan1M', 'panjangBesiTulangan2M', 'panjangBesiSengkangM', 'panjangKawatBetonM', 'totalPanjangBesi1M', 'totalPanjangBesi2M', 'totalPanjangSengkangM', 'totalPanjangKawatM']) {
    eq(getBreakdownRowUnit(key), 'm', key);
  }
  eq(getBreakdownRowUnit('pekerjaanPembesianKg'), 'kg', 'pembesian stays kg');
  eq(getBreakdownRowUnit('jumlahKawatBetonKg'), 'kg', 'kawat weight stays kg');
});

test('D-71: Sloof labels separate the bar number ("Tulangan 1", not "Tulangan1")', () => {
  eq(formatBreakdownLabel('panjangBesiTulangan1M'), "Panjang Besi Tulangan 1 (m')", 'tulangan 1 label');
  eq(formatBreakdownLabel('totalPanjangSengkangM'), "Total Panjang Sengkang (m')", 'sengkang label');
  ok(!formatBreakdownLabel('panjangBesiTulangan1M').includes('Tulangan1'), 'no glued digits');
});

test('Sloof hand-verified volumes: 0.90 m³ at P=3 (defaults), 1.80 m³ at P=6', () => {
  const spec = getCalculatorById('SLOOF');
  if (!spec) throw new Error('SLOOF spec not found');
  const defaults: Record<string, number> = {};
  spec.parameters.forEach((p) => { defaults[p.id] = p.defaultValue; });
  eq(spec.calculate(defaults).primaryQuantity, 0.9, 'defaults P=3 -> 0.90 m³');
  eq(spec.calculate({ ...defaults, P: 6 }).primaryQuantity, 1.8, 'P=6 -> 1.80 m³');
});

// --- Same bug family in sibling calculators (shared heuristic) -----------------

test('same family: Foot Plate + Kolom panjangBesi* rows are meters, not kg', () => {
  for (const key of ['panjangBesiD1M', 'panjangBesiD6M', 'panjangBesiD1_M', 'panjangBesiUtamaM', 'panjangBesiSupportM']) {
    eq(getBreakdownRowUnit(key), 'm', key);
  }
  eq(getBreakdownRowUnit('totalBeratBesiTulanganKg'), 'kg', 'weight row stays kg');
});

test('same family: counts and sacks are not meters (jumlah/semen contain "m")', () => {
  eq(getBreakdownRowUnit('jumlahBatang'), 'batang', 'jumlahBatang');
  eq(getBreakdownRowUnit('jumlahBataRinganBuah'), 'bh', 'jumlahBataRinganBuah');
  eq(getBreakdownRowUnit('jumlahPavingPcs'), 'pcs', 'jumlahPavingPcs');
  eq(getBreakdownRowUnit('semenPortlandSak'), 'sak', 'semenPortlandSak');
  eq(getBreakdownRowUnit('kebutuhanMortarSak40kg'), 'sak', 'mortar sak (not kg)');
  eq(getBreakdownRowUnit('totalUnitSanitair'), 'unit', 'totalUnitSanitair (was blank)');
  eq(getBreakdownRowUnit('totalBeratTon'), 'ton', 'totalBeratTon (was kg via "berat")');
  eq(getBreakdownRowUnit('tebalDindingCm'), 'cm', 'tebalDindingCm (was m² via "dinding")');
  eq(getBreakdownRowUnit('kebutuhanLembarGypsumLembar'), 'lembar', 'lembar (was m via "Gypsum")');
  eq(getBreakdownRowUnit('kebutuhanRollKabel50m'), 'roll', 'roll kabel (was m via "50m")');
  eq(getBreakdownRowUnit('beratNominalKgPerM'), 'kg/m', 'kg per meter');
});

// --- Fallback heuristic (unknown future keys) ----------------------------------

test('fallback: corrected ordering, never a bare-"m" catch-all', () => {
  eq(guessBreakdownUnit('jumlahFooBar'), 'unit', 'jumlah* is a count even though it contains m');
  eq(guessBreakdownUnit('panjangBesiFooM'), 'm', 'trailing M (meters) beats besi');
  eq(guessBreakdownUnit('volumeFooBar'), 'm³', 'volume* is m³');
  eq(guessBreakdownUnit('semenFooSak'), 'sak', 'semen*Sak is sak even though semen contains m');
  eq(guessBreakdownUnit('totalBeratFooTon'), 'ton', 'ton suffix beats berat');
  eq(guessBreakdownUnit('totalFooUnit'), 'unit', 'Unit suffix');
  eq(guessBreakdownUnit('kebutuhanFooPcs'), 'pcs', 'Pcs suffix');
  eq(guessBreakdownUnit('totallyUnknownKey'), '', 'unknown key -> blank (honest), never a guessed unit');
});

// --- Registry-wide enumeration (guards future keys) -----------------------------

test('registry-wide: every breakdown key of all 24 calculators resolves to a non-empty unit', () => {
  eq(CONSTRUCTION_CALCULATORS.length, 24, 'calculator count');
  const bad: string[] = [];
  let total = 0;
  for (const spec of CONSTRUCTION_CALCULATORS) {
    const inputs: Record<string, number> = {};
    spec.parameters.forEach((p) => { inputs[p.id] = p.defaultValue; });
    const res = spec.calculate(inputs);
    for (const key of Object.keys(res.breakdown)) {
      total++;
      if (getBreakdownRowUnit(key) === '') bad.push(`${spec.id}.${key}`);
    }
  }
  ok(total > 150, `expected >150 breakdown rows enumerated, got ${total}`);
  ok(bad.length === 0, `keys with no unit: ${bad.join(', ')}`);
});

test('registry-wide: every breakdown label is non-empty, has no underscore and no double space', () => {
  const bad: string[] = [];
  for (const spec of CONSTRUCTION_CALCULATORS) {
    const inputs: Record<string, number> = {};
    spec.parameters.forEach((p) => { inputs[p.id] = p.defaultValue; });
    const res = spec.calculate(inputs);
    for (const key of Object.keys(res.breakdown)) {
      const label = formatBreakdownLabel(key);
      if (!label || label.includes('_') || label.includes('  ')) bad.push(`${spec.id}.${key} -> "${label}"`);
    }
  }
  ok(bad.length === 0, `bad labels: ${bad.join('; ')}`);
});

// --- View wiring (source check) -------------------------------------------------

test('view uses the helpers; the old inline guesser is gone', () => {
  const viewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'components', 'qto', 'QtoCalculatorView.tsx');
  const src = fs.readFileSync(viewPath, 'utf8');
  ok(src.includes('getBreakdownRowUnit(key)'), 'view must use getBreakdownRowUnit');
  ok(src.includes('formatBreakdownLabel(key)'), 'view must use formatBreakdownLabel');
  ok(src.includes("from '../../lib/breakdownRowMeta'"), 'view must import breakdownRowMeta');
  ok(!src.includes("key.toLowerCase().includes('m')"), 'old bare-m catch-all must be gone');
  ok(!src.includes(".replace('M$', ' (m\\')')"), 'old dead M$ string replace must be gone');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-61/D-71: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

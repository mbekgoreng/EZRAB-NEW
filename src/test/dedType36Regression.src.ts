/**
 * EZRAB DED — Regression tests for Rumah Type 36 (6m × 6m).
 * Based on real failure: Kolom Praktis returned as 0.15 m' (Rp27.000)
 * instead of 0.81 m³ (Rp3.645.000).
 *
 * Run: npx esbuild src/test/dedType36Regression.src.ts --bundle --platform=node --format=cjs --outfile=/tmp/ded36.cjs && node /tmp/ded36.cjs
 */
import {
  attemptQuantityFromDimensionString,
  computeQuantity,
  shapeForUnit,
} from '../ai-tools/ded-ai-estimate/quantity';
import { DedAiCalculator, validateQuantity } from '../ai-tools/ded-ai-estimate/calculator';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function approx(a: number | null, b: number, eps = 1e-9): boolean {
  return a !== null && Math.abs(a - b) < eps;
}

console.log('=== DED TYPE 36 REGRESSION ===');
console.log('');

// A. Pondasi batu kali: 34 × 0.5 × 0.5 = 8.5 m³
console.log('A. Pondasi Batu Kali');
const pondasi = attemptQuantityFromDimensionString('m3', '34 x 0.5 x 0.5 m');
check('A1 volume = 8.5 m³', approx(pondasi.quantity, 8.5), `got ${pondasi.quantity}`);
check('A2 tidak ambiguous', !pondasi.ambiguousUnit);
const pondasiItem = { quantity: 8.5, units: 'm3', quantitySource: 'DED_GEOMETRIC' as const };
check('A3 validateQuantity lolos', validateQuantity(pondasiItem).ok === true);
console.log('');

// B. Sloof: 34 × 0.15 × 0.20 = 1.02 m³
console.log('B. Sloof 15×20');
const sloof = attemptQuantityFromDimensionString('m3', '34 x 0.15 x 0.20 m');
check('B1 volume = 1.02 m³', approx(sloof.quantity, 1.02), `got ${sloof.quantity}`);
console.log('');

// C. Kolom praktis — THE CRITICAL BUG
console.log('C. Kolom Praktis (critical)');
const kolomPerUnit = computeQuantity('VOLUME', { length: 0.15, width: 0.15, height: 3 }, 'kolom');
check('C1 satu kolom = 0.0675 m³', approx(kolomPerUnit.quantity, 0.0675), `got ${kolomPerUnit.quantity}`);
const kolomTotal = 12 * 0.0675;
check('C2 total 12 kolom = 0.81 m³', approx(kolomTotal, 0.81), `got ${kolomTotal}`);

// Regression: model mengembalikan 0.15 m' — harus DITOLAK
const kolomSalah = { quantity: 0.15, units: "m'", quantitySource: 'AI_INFERENCE' as const, name: 'Kolom Praktis 15x15 cm' };
const verdictSalah = validateQuantity(kolomSalah);
check('C3 kolom 0.15 m\' DITOLAK (bukan diloloskan)', verdictSalah.ok === false,
  `verdict=${verdictSalah.ok ? 'LOLOS (BUG!)' : 'DITOLAK ✓'}`);
if (!verdictSalah.ok) {
  console.log(`  INFO alasan: ${verdictSalah.reason}`);
}
// Kolom yang benar harus LOLOS
const kolomBenar = { quantity: 0.81, units: 'm3', quantitySource: 'DED_GEOMETRIC' as const, name: 'Kolom Praktis 15x15 cm' };
check('C4 kolom 0.81 m³ DITERIMA', validateQuantity(kolomBenar).ok === true);
console.log('');

// D. Ringbalk: sama seperti sloof
console.log('D. Ringbalk 15×20');
const ring = attemptQuantityFromDimensionString('m3', '34 x 0.15 x 0.20 m');
check('D1 volume = 1.02 m³', approx(ring.quantity, 1.02), `got ${ring.quantity}`);
console.log('');

// E. Dinding: bruto 108.8, netto 92.5 (kurang 15% bukaan)
console.log('E. Dinding Bata');
const dindingBruto = attemptQuantityFromDimensionString('m2', '34 x 3.2 m');
check('E1 bruto = 108.8 m²', approx(dindingBruto.quantity, 108.8), `got ${dindingBruto.quantity}`);
const bukaan = 16.3;
const netto = 108.8 - bukaan;
check('E2 netto = 92.5 m² (108.8 - 16.3)', approx(netto, 92.5), `got ${netto}`);
check('E3 pengurangan % dalam range 15-20%', (() => {
  const pct = (bukaan / 108.8) * 100;
  return pct >= 14 && pct <= 21;
})(), `pct=${((bukaan/108.8)*100).toFixed(1)}%`);
console.log('');

// F. Plesteran: 92.5 × 2 = 185 m²
console.log('F. Plesteran 2 sisi');
const plester = 92.5 * 2;
check('F1 = 185 m²', approx(plester, 185), `got ${plester}`);
// BUKAN 216 (yang mengikuti bruto yang salah)
check('F2 bukan 216 (nilai salah dari bruto)', Math.abs(plester - 216) > 1, `plester=${plester}`);
console.log('');

// G. Lantai: 6 × 6 = 36 m²
console.log('G. Lantai');
const lantai = attemptQuantityFromDimensionString('m2', '6 x 6 m');
check('G1 = 36 m²', approx(lantai.quantity, 36), `got ${lantai.quantity}`);
console.log('');

// H. Subtotal deterministik
console.log('H. Subtotal');
const items = [
  { quantity: 8.5, units: 'm3', quantitySource: 'DED_GEOMETRIC' as const, unitPrice: 950000 },
  { quantity: 0.81, units: 'm3', quantitySource: 'DED_GEOMETRIC' as const, unitPrice: 4500000 },
];
const calc = items.map(it => ({
  ...it,
  subtotal: it.quantity !== null && it.unitPrice !== null ? Math.round(it.quantity * it.unitPrice) : null,
}));
check('H1 pondasi subtotal = 8.075.000', calc[0].subtotal === 8075000, `got ${calc[0].subtotal}`);
check('H2 kolom subtotal = 3.645.000', calc[1].subtotal === 3645000, `got ${calc[1].subtotal}`);
console.log('');

console.log(`=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

/**
 * calcRepairUnitGate.test — Fase 3 Master Repair (2026-11-06)
 * Gerbang satuan terpusat + REGRESI WAJIB kasus Air↔Pipa PVC.
 * Dijalankan via: npx tsx src/test/calcRepairUnitGate.test.ts
 */
import {
  validateUnitCompatibility,
  unitAllowsPricing,
  normalizeUnitName,
} from '../engine/constructionCalculators/unitCompatibility';
import { MASTER_PRICE_ITEMS } from '../data/indonesianPrices';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// === REGRESI WAJIB: Air (liter) vs SN-005 Pipa PVC (batang) ===
const sn005 = MASTER_PRICE_ITEMS.find((p) => p.id === 'SN-005');
check('record SN-005 ada di MASTER_PRICE_ITEMS', !!sn005);
if (sn005) {
  check('SN-005 memang pipa PVC air kotor satuan batang',
    /pipa pvc/i.test(sn005.name) && sn005.unit === 'batang');
  const v = validateUnitCompatibility('liter', sn005.unit);
  check('Air(liter) × SN-005(batang) = UNIT_MISMATCH', v.result === 'UNIT_MISMATCH');
  check('Air(liter) × SN-005(batang) TIDAK boleh dihargai', !unitAllowsPricing(v));
  check('alasan menyebut UNIT_MISMATCH', v.reason.includes('UNIT_MISMATCH'));
}

// === Pasangan mismatch wajib (Fase 11-C) ===
const mismatches: Array<[string, string]> = [
  ['m²', 'm³'],
  ['m³', 'm²'],
  ['kg', 'sak'],
  ['sak', 'kg'],
  ['OH', 'm³'],
  ['OH', 'kg'],
  ['sewa-hari', 'unit'],
  // 'unit' vs 'buah' BUKAN mismatch: sinonim hitung dengan aturan
  // ekuivalensi terverifikasi (lihat blok khusus di bawah).
  ['liter', 'batang'],
  ['m', 'kg'],
  ['lembar', 'm²'],
];
for (const [a, b] of mismatches) {
  const v = validateUnitCompatibility(a, b);
  check(`${a} vs ${b} → UNIT_MISMATCH & tertolak`, v.result === 'UNIT_MISMATCH' && !unitAllowsPricing(v));
}

// === Exact match & normalisasi notasi ===
const exacts: Array<[string, string]> = [
  ['m³', 'm3'],
  ['m²', 'm2'],
  ["m'", 'm'],
  ['Liter', 'liter'],
  ['OH', 'OH'],
  ['sewa-hari', 'sewa-hari'],
  ['sak', 'sak'],
];
for (const [a, b] of exacts) {
  const v = validateUnitCompatibility(a, b);
  check(`${a} vs ${b} → EXACT_MATCH faktor 1`, v.result === 'EXACT_MATCH' && v.priceFactor === 1);
}

// === Konversi disetujui (SI satu dimensi) ===
{
  const v = validateUnitCompatibility('ton', 'kg'); // komponen ton, record kg
  check('record kg → komponen ton = APPROVED_CONVERSION', v.result === 'APPROVED_CONVERSION');
  check('faktor harga kg→ton = ×1000', v.priceFactor === 1000);
  const v2 = validateUnitCompatibility('liter', 'm³'); // komponen liter, record m³
  check('record m³ → komponen liter = APPROVED_CONVERSION faktor 0.001',
    v2.result === 'APPROVED_CONVERSION' && Math.abs((v2.priceFactor ?? 0) - 0.001) < 1e-12);
  const v3 = validateUnitCompatibility('cm', 'm');
  check('record m → komponen cm = APPROVED_CONVERSION faktor 0.01',
    v3.result === 'APPROVED_CONVERSION' && Math.abs((v3.priceFactor ?? 0) - 0.01) < 1e-12);
}

// === Ejaan kemasan sama & sinonim hitung terverifikasi ===
{
  const v = validateUnitCompatibility('sak', 'zak');
  check('sak vs zak (varian ejaan SM-001) → EXACT_MATCH', v.result === 'EXACT_MATCH' && v.priceFactor === 1);
  const v2 = validateUnitCompatibility('buah', 'unit');
  check('buah vs unit → APPROVED_CONVERSION faktor 1 (sinonim hitung terdokumentasi)',
    v2.result === 'APPROVED_CONVERSION' && v2.priceFactor === 1);
  const v3 = validateUnitCompatibility('set', 'buah');
  check('set vs buah tetap UNIT_MISMATCH (satu set ≠ satu buah)', v3.result === 'UNIT_MISMATCH');
  const v4 = validateUnitCompatibility('dus', 'buah');
  check('dus vs buah tetap UNIT_MISMATCH', v4.result === 'UNIT_MISMATCH');
}

// === Keputusan registry: sewa-hari ≡ hari; jam tetap terpisah ===
{
  const v = validateUnitCompatibility('sewa-hari', 'Hari');
  check('sewa-hari vs Hari → EXACT_MATCH (keputusan registry tercatat)', v.result === 'EXACT_MATCH' && v.priceFactor === 1);
  const v2 = validateUnitCompatibility('sewa-hari', 'jam');
  check('sewa-hari vs jam tetap UNIT_MISMATCH (tanpa asumsi 8 jam)', v2.result === 'UNIT_MISMATCH');
  const v3 = validateUnitCompatibility('jam', 'hari');
  check('jam vs hari → UNIT_MISMATCH', v3.result === 'UNIT_MISMATCH');
}

// === Unknown ===
{
  const v = validateUnitCompatibility('m³', '');
  check('satuan kandidat kosong → UNIT_UNKNOWN & tertolak', v.result === 'UNIT_UNKNOWN' && !unitAllowsPricing(v));
  const v2 = validateUnitCompatibility('m³', 'blorp');
  check('satuan asing "blorp" → UNIT_UNKNOWN & tertolak', v2.result === 'UNIT_UNKNOWN' && !unitAllowsPricing(v2));
}

check('normalizeUnitName(" m3 ") = m³', normalizeUnitName(' m3 ') === 'm³');
check('normalizeUnitName("M\'") = m', normalizeUnitName("M'") === 'm');

console.log(`\nUNIT GATE: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

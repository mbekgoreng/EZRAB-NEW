/**
 * PHASE 4C — Regression fixture: Rumah 2 Lantai (SYNTHETIC_TEST_FIXTURE)
 *
 * PENTING: Ini adalah FIXTURE SINTETIS untuk testing, BUKAN dari DED nyata.
 * Jangan gunakan nilai ini sebagai referensi untuk proyek aktual.
 *
 * Spesifikasi fixture:
 * - Rumah 2 lantai, 6m × 8m per lantai
 * - Tinggi lantai 1: 3.5m, lantai 2: 3.2m
 * - Pondasi menerus di sekeliling + sekat
 *
 * Run: npx esbuild src/test/dedRumah2Lantai.src.ts --bundle --platform=node --format=cjs --outfile=/tmp/ded2lt.cjs && node /tmp/ded2lt.cjs
 */
import { deriveKolomVolume, deriveDindingNetto, derivePlester } from '../ai-tools/ded-ai-estimate/derivation';
import { calcSubtotal, validateQuantity } from '../ai-tools/ded-ai-estimate/calculator';
import { attemptQuantityFromDimensionString } from '../ai-tools/ded-ai-estimate/quantity';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function approx(a: number | null, b: number, eps = 1e-6): boolean {
  return a !== null && Math.abs(a - b) < eps;
}

console.log('=== RUMAH 2 LANTAI (SYNTHETIC_TEST_FIXTURE) ===');
console.log('');

// --- INPUT FIXTURE (sintetis, bukan DED nyata) ---
const P = 6, L = 8;                    // dimensi per lantai
const T1 = 3.5, T2 = 3.2;              // tinggi lantai 1 & 2
const KELILING = 2 * (P + L);          // 28m

// 1. Pondasi (hanya lantai 1)
console.log('1. Pondasi');
const pondasi = attemptQuantityFromDimensionString('m3', '28 x 0.5 x 0.6 m');
check('1.1 pondasi = 8.4 m³', approx(pondasi.quantity, 8.4), `got ${pondasi.quantity}`);
console.log('');

// 2. Sloof
console.log('2. Sloof 15×20');
const sloof = attemptQuantityFromDimensionString('m3', '28 x 0.15 x 0.20 m');
check('2.1 sloof = 0.84 m³', approx(sloof.quantity, 0.84), `got ${sloof.quantity}`);
console.log('');

// 3. Kolom lantai 1 & 2 (terpisah, tidak double-count)
console.log('3. Kolom');
const kolomLt1 = deriveKolomVolume(16, 0.15, 0.15, T1, 'ASSUMPTION');
check('3.1 kolom Lt1 = 16×0.0225×3.5 = 1.26 m³', approx(kolomLt1.result, 1.26), `got ${kolomLt1.result}`);
const kolomLt2 = deriveKolomVolume(16, 0.15, 0.15, T2, 'ASSUMPTION');
check('3.2 kolom Lt2 = 16×0.0225×3.2 = 1.152 m³', approx(kolomLt2.result, 1.152), `got ${kolomLt2.result}`);
check('3.3 total kolom = 2.412 m³', approx((kolomLt1.result || 0) + (kolomLt2.result || 0), 2.412));
// Kolom tanpa jumlah → ditolak
const kolomNoCount = deriveKolomVolume(null, 0.15, 0.15, 3.5);
check('3.4 kolom tanpa jumlah → null', kolomNoCount.result === null);
console.log('');

// 4. Balok lantai 2
console.log('4. Balok');
const balok = attemptQuantityFromDimensionString('m3', '28 x 0.15 x 0.30 m');
check('4.1 balok = 1.26 m³', approx(balok.quantity, 1.26), `got ${balok.quantity}`);
console.log('');

// 5. Ring balk (atas lantai 2)
console.log('5. Ring balk');
const ringbalk = attemptQuantityFromDimensionString('m3', '28 x 0.15 x 0.20 m');
check('5.1 ringbalk = 0.84 m³', approx(ringbalk.quantity, 0.84), `got ${ringbalk.quantity}`);
console.log('');

// 6. Dinding per lantai (bruto & netto terpisah)
console.log('6. Dinding');
const dindingLt1Bruto = KELILING * T1;  // 98 m²
const dindingLt2Bruto = KELILING * T2;  // 89.6 m²
check('6.1 dinding Lt1 bruto = 98 m²', approx(dindingLt1Bruto, 98));
check('6.2 dinding Lt2 bruto = 89.6 m²', approx(dindingLt2Bruto, 89.6));

const dindingLt1Netto = deriveDindingNetto(KELILING, T1, 14.7, 'ASSUMPTION'); // 15% bukaan
check('6.3 dinding Lt1 netto = 83.3 m²', approx(dindingLt1Netto.result, 83.3), `got ${dindingLt1Netto.result}`);

// Bukaan tidak diketahui → bruto dengan peringatan
const dindingNoBukaan = deriveDindingNetto(KELILING, T1, null);
check('6.4 tanpa bukaan → bruto 98', approx(dindingNoBukaan.result, 98));
check('6.5 ditandai belum terverifikasi', dindingNoBukaan.validationStatus.includes('bruto'));
console.log('');

// 7. Plester (jangan asumsikan 2 sisi otomatis)
console.log('7. Plester');
const plester2Sisi = derivePlester(83.3, 2, 'ASSUMPTION');
check('7.1 plester 2 sisi = 166.6 m²', approx(plester2Sisi.result, 166.6), `got ${plester2Sisi.result}`);
const plesterNoSisi = derivePlester(83.3, null);
check('7.2 tanpa info sisi → null (jangan asumsikan)', plesterNoSisi.result === null);
console.log('');

// 8. Lantai (2 lantai)
console.log('8. Lantai');
const lantaiPerLt = P * L;  // 48 m²
check('8.1 lantai per lantai = 48 m²', approx(lantaiPerLt, 48));
check('8.2 total 2 lantai = 96 m²', approx(lantaiPerLt * 2, 96));
console.log('');

// 9. Atap (estimasi kasar — butuh data kemiringan)
console.log('9. Atap');
const atapDatar = P * L;  // 48 m² (proyeksi datar)
check('9.1 proyeksi datar = 48 m²', approx(atapDatar, 48));
// Dengan kemiringan 30°: 48 / cos(30°) ≈ 55.4
const atapMiring = 48 / Math.cos(Math.PI / 6);
check('9.2 dengan kemiringan 30° ≈ 55.4 m²', approx(atapMiring, 55.43, 0.1), `got ${atapMiring.toFixed(2)}`);
console.log('');

// 10. Validasi satuan salah
console.log('10. Validasi');
const kolomSalah = { quantity: 0.15, units: "m'", quantitySource: 'AI_INFERENCE' as const, name: 'Kolom Lantai 1' };
check('10.1 kolom m\' DITOLAK', validateQuantity(kolomSalah).ok === false);
const dindingSalah = { quantity: 98, units: 'm3', quantitySource: 'AI_INFERENCE' as const, name: 'Dinding Bata' };
check('10.2 dinding m3 DITOLAK', validateQuantity(dindingSalah).ok === false);
console.log('');

// 11. Dimensi mm/cm/m
console.log('11. Satuan dimensi');
const mmTest = attemptQuantityFromDimensionString('m3', '28000 x 150 x 200 mm');
check('11.1 mm: 28000×150×200mm = 0.84 m³', approx(mmTest.quantity, 0.84), `got ${mmTest.quantity}`);
const cmTest = attemptQuantityFromDimensionString('m3', '2800 x 15 x 20 cm');
check('11.2 cm: 2800×15×20cm = 0.84 m³', approx(cmTest.quantity, 0.84), `got ${cmTest.quantity}`);
console.log('');

// 12. Subtotal & unresolved tidak masuk total
console.log('12. Subtotal');
check('12.1 subtotal normal', calcSubtotal(8.4, 950000) === 7980000);
check('12.2 unresolved → null', calcSubtotal(null, 950000) === null);
const unresolvedItem = { quantity: null, units: 'm3', quantitySource: 'UNRESOLVED' as const, name: 'Test' };
check('12.3 unresolved DITOLAK validasi', validateQuantity(unresolvedItem).ok === false);
console.log('');

console.log(`=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
console.log('CATATAN: Semua nilai adalah SYNTHETIC_TEST_FIXTURE, bukan dari DED nyata.');
if (fail > 0) process.exit(1);

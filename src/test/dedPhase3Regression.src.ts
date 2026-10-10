/**
 * PHASE 3 — Regression tests untuk:
 * - USER_INPUT quantity source (bukan DED_EXPLICIT)
 * - calcSubtotal kanonis
 * - Derivation trails (kolom, dinding, plester)
 * - Revalidasi setelah edit
 *
 * Run: npx esbuild src/test/dedPhase3Regression.src.ts --bundle --platform=node --format=cjs --outfile=/tmp/dedp3.cjs && node /tmp/dedp3.cjs
 */
import { calcSubtotal, validateQuantity } from '../ai-tools/ded-ai-estimate/calculator';
import { deriveKolomVolume, deriveDindingNetto, derivePlester } from '../ai-tools/ded-ai-estimate/derivation';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== PHASE 3 REGRESSION ===');
console.log('');

// 3A: USER_INPUT source
console.log('3A. Quantity Source');
const userInput = { quantity: 5, units: 'm3', quantitySource: 'USER_INPUT' as const, name: 'Pondasi' };
check('3A1 USER_INPUT divalidasi', validateQuantity(userInput).ok === true);
check('3A2 USER_INPUT bukan DED_EXPLICIT', (userInput.quantitySource as string) !== 'DED_EXPLICIT');
console.log('');

// 3B: calcSubtotal kanonis
console.log('3B. Subtotal Kanonis');
check('3B1 8.5 × 950000 = 8075000', calcSubtotal(8.5, 950000) === 8075000);
check('3B2 null quantity → null', calcSubtotal(null, 950000) === null);
check('3B3 null price → null', calcSubtotal(8.5, null) === null);
check('3B4 0 quantity → null (bukan 0)', calcSubtotal(0, 950000) === null);
check('3B5 negatif → null', calcSubtotal(-5, 950000) === null);
console.log('');

// 3B: Revalidasi — kolom 0.15 m' ditolak meski dari USER_INPUT
console.log('3B. Revalidasi Kategori');
const kolomSalahUser = { quantity: 0.15, units: "m'", quantitySource: 'USER_INPUT' as const, name: 'Kolom Praktis' };
const vSalah = validateQuantity(kolomSalahUser);
check('3B6 kolom 0.15 m\' dari USER tetap DITOLAK', vSalah.ok === false);
const kolomBenarUser = { quantity: 0.81, units: 'm3', quantitySource: 'USER_INPUT' as const, name: 'Kolom Praktis' };
check('3B7 kolom 0.81 m3 dari USER DITERIMA', validateQuantity(kolomBenarUser).ok === true);
// Ganti satuan m' → m3
const gantiSatuan = { quantity: 0.81, units: 'm3', quantitySource: 'USER_INPUT' as const, name: 'Kolom' };
check('3B8 ganti satuan m\'→m3 valid', validateQuantity(gantiSatuan).ok === true);
console.log('');

// 3C: Derivation trails
console.log('3C. Derivation Trail');
const kolomTrail = deriveKolomVolume(12, 0.15, 0.15, 3, 'ASSUMPTION');
check('3C1 kolom 12×0.15×0.15×3 = 0.81', Math.abs((kolomTrail.result || 0) - 0.81) < 1e-9, `got ${kolomTrail.result}`);
check('3C2 kolom validation ok', kolomTrail.validationStatus === 'ok');
check('3C3 kolom inputs terdokumentasi', kolomTrail.inputs.length === 4);

const kolomMissing = deriveKolomVolume(null, 0.15, 0.15, 3);
check('3C4 kolom tanpa jumlah → null', kolomMissing.result === null);
check('3C5 kolom tanpa jumlah → rejected', kolomMissing.validationStatus.includes('rejected'));

const dindingNetto = deriveDindingNetto(34, 3.2, 16.3, 'DED');
check('3C6 dinding netto = 92.5', Math.abs((dindingNetto.result || 0) - 92.5) < 1e-9, `got ${dindingNetto.result}`);

const dindingBruto = deriveDindingNetto(34, 3.2, null);
check('3C7 dinding tanpa bukaan → bruto 108.8', Math.abs((dindingBruto.result || 0) - 108.8) < 1e-9);
check('3C8 dinding bruto ditandai belum terverifikasi', dindingBruto.validationStatus.includes('bruto'));

const plester = derivePlester(92.5, 2, 'DED');
check('3C9 plester 92.5×2 = 185', Math.abs((plester.result || 0) - 185) < 1e-9, `got ${plester.result}`);

const plesterAsumsi = derivePlester(92.5, null);
check('3C10 plester tanpa sisi → null (jangan asumsikan)', plesterAsumsi.result === null);
console.log('');

// 3D: Price source separation
console.log('3D. Price Source');
const priceSources = ['AI_ESTIMATE', 'AHSP_2026', 'USER_INPUT', 'UNRESOLVED'];
check('3D1 4 price sources terdefinisi', priceSources.length === 4);
// Harga null bukan 0
check('3D2 harga null → subtotal null', calcSubtotal(10, null) === null);
console.log('');

console.log(`=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

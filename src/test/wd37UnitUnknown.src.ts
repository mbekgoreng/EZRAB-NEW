/**
 * WD-3.7-08 — Satuan tak diketahui dianotasi, BUKAN diam-diam m²
 * (keputusan owner 2026-11-24).
 *
 * Run: npx --yes tsx src/test/wd37UnitUnknown.src.ts
 *
 * Menguji lapisan konversi (convertAiItem) + konsumen anotasi secara
 * deterministik TANPA model live:
 *  - convertAiItem tanpa units/unit → units tetap 'm2' (default
 *    load-bearing dipertahankan) TAPI unitUnknown === true + token
 *    provenance 'unit:assumed-m2'.
 *  - convertAiItem dengan satuan eksplisit (termasuk 'm2' yang DINYATAKAN
 *    dan superskrip 'm²') → unitUnknown absen, tanpa token.
 *  - validateQuantity: advisory (ok tetap true) bila unitUnknown +
 *    kuantitas dari dimensi; tanpa advisory bila satuan dinyatakan atau
 *    kuantitas bukan dari dimensi.
 *  - finalizeItems menempelkan catatan advisory ke quantityNote
 *    (idempotent — jalan berulang tidak menduplikasi).
 *  - applyUnitChange mencabut unitUnknown (satuan kini dinyatakan user);
 *    token provenance lama tetap tinggal sebagai jejak audit.
 *  - mapDedAiItemToRabInput membawa catatan satuan-diasumsikan ke
 *    priceSourceExplanation baris RAB; item bersatuan eksplisit tidak
 *    mendapat catatan itu.
 *  - [Batch 4, 2026-11-25] exportUnitLabel: kolom satuan ekspor Excel
 *    menganotasi 'm2 (satuan diasumsikan)' bila flag set; countUnitUnknown
 *    untuk ringkasan WBS; mapDedAiOutputToContract membawa catatan asumsi
 *    kanonis ke assumptions[] kontrak (item eksplisit: tanpa catatan).
 */
import { convertAiItem } from '../ai-tools/ded-ai-estimate/service';
import { DedAiCalculator, validateQuantity, applyUnitChange } from '../ai-tools/ded-ai-estimate/calculator';
import { mapDedAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { exportUnitLabel, countUnitUnknown, UNIT_UNKNOWN_ASSUMPTION_NOTE } from '../ai-tools/ded-ai-estimate/unitUnknownLabel';
import { mapDedAiOutputToContract, validateDedOutputContract } from '../services/dedOutputContract';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n== 1. convertAiItem: tanpa satuan → default m2 + flag + token ==');
const noUnit = convertAiItem(0, {
  name: 'Pekerjaan Uji Satuan Tak Diketahui',
  category: 'Lain-lain',
  quantity: null,
  dimensions: '2 x 3 m',
  estimatedUnitPrice: 150000,
  unitPriceNote: 'Estimasi uji per m2, pasar 2026',
}, 'FAST', 'FULL_AI');
check('1.1 units tetap default m2 (kompatibilitas)', noUnit.units === 'm2', noUnit.units);
check('1.2 unitUnknown === true', noUnit.unitUnknown === true, String(noUnit.unitUnknown));
check('1.3 provenance memuat unit:assumed-m2', noUnit.provenance.includes('unit:assumed-m2'), noUnit.provenance.join(' '));
check('1.4 kuantitas deterministik tidak berubah (2 x 3 m = 6, DED_GEOMETRIC)',
  noUnit.quantity === 6 && noUnit.quantitySource === 'DED_GEOMETRIC', `${noUnit.quantity}/${noUnit.quantitySource}`);

console.log('\n== 2. convertAiItem: satuan eksplisit → tanpa flag, tanpa token ==');
const explicitM3 = convertAiItem(1, {
  name: 'Kolom Beton Uji', category: 'Struktur', units: 'm3',
  quantity: null, dimensions: '4 x 0.15 x 0.20 m',
}, 'FAST', 'FULL_AI');
check('2.1 units m3 eksplisit → unitUnknown falsy/absen', !explicitM3.unitUnknown, String(explicitM3.unitUnknown));
check('2.2 tanpa token unit:assumed-m2', !explicitM3.provenance.includes('unit:assumed-m2'));
const explicitUnitSingular = convertAiItem(2, {
  name: 'Pipa Uji', category: 'Plumbing', unit: "m'",
  quantity: null, dimensions: '12 m',
}, 'FAST', 'FULL_AI');
check("2.3 alias `unit` (singular) m' → unitUnknown falsy", !explicitUnitSingular.unitUnknown, String(explicitUnitSingular.unitUnknown));
const explicitM2 = convertAiItem(3, {
  name: 'Lantai Uji', category: 'Lantai', units: 'm2',
  quantity: null, dimensions: '2 x 3 m',
}, 'FAST', 'FULL_AI');
check('2.4 m2 yang DINYATAKAN eksplisit → unitUnknown falsy (bukan asumsi)',
  explicitM2.units === 'm2' && !explicitM2.unitUnknown, `${explicitM2.units}/${String(explicitM2.unitUnknown)}`);
const superscriptM2 = convertAiItem(4, {
  name: 'Plester Uji', category: 'Arsitektur', units: 'm²',
  quantity: null, dimensions: '6 x 10 m',
}, 'FAST', 'DATABASE');
check('2.5 superskrip m² (WD-3.7-06) → dinormalisasi m2 + unitUnknown falsy',
  superscriptM2.units === 'm2' && !superscriptM2.unitUnknown, `${superscriptM2.units}/${String(superscriptM2.unitUnknown)}`);

console.log('\n== 3. convertAiItem: flag tidak tergantung policy ==');
const noUnitDb = convertAiItem(5, {
  name: 'Pekerjaan Uji Tanpa Satuan DB', category: 'Lain-lain',
  quantity: null, dimensions: '2 x 3 m',
}, 'FAST', 'DATABASE');
check('3.1 mode DATABASE tanpa satuan → unitUnknown true + token',
  noUnitDb.unitUnknown === true && noUnitDb.provenance.includes('unit:assumed-m2'));

console.log('\n== 4. validateQuantity: advisory, bukan blok ==');
const vAdvisory = validateQuantity({ quantity: 6, units: 'm2', quantitySource: 'DED_GEOMETRIC', unitUnknown: true });
check('4.1 unitUnknown + DED_GEOMETRIC → ok TETAP true (advisory, bukan blok)', vAdvisory.ok === true);
check('4.2 advisory note menyebut satuan diasumsikan',
  vAdvisory.ok === true && typeof vAdvisory.note === 'string' && vAdvisory.note.includes('Satuan diasumsikan m²'),
  vAdvisory.ok === true ? String(vAdvisory.note) : 'not-ok');
const vDerived = validateQuantity({ quantity: 6, units: 'm2', quantitySource: 'DERIVED', unitUnknown: true });
check('4.3 unitUnknown + DERIVED → advisory juga', vDerived.ok === true && typeof (vDerived as { note?: string }).note === 'string');
const vKnown = validateQuantity({ quantity: 6, units: 'm2', quantitySource: 'DED_GEOMETRIC' });
check('4.4 satuan dinyatakan + DED_GEOMETRIC → ok true TANPA note',
  vKnown.ok === true && (vKnown as { note?: string }).note === undefined);
const vInference = validateQuantity({ quantity: 6, units: 'm2', quantitySource: 'AI_INFERENCE', unitUnknown: true });
check('4.5 unitUnknown + AI_INFERENCE (bukan dari dimensi) → ok true TANPA note',
  vInference.ok === true && (vInference as { note?: string }).note === undefined);

console.log('\n== 5. finalizeItems: catatan advisory ke quantityNote, idempotent ==');
const [finOnce] = DedAiCalculator.finalizeItems([noUnit]);
check('5.1 item unitUnknown tetap CALCULATED + subtotal = qty × harga (sumber harga apa pun)',
  finOnce.stage === 'CALCULATED' && finOnce.unitPrice !== null && finOnce.subtotal === 6 * finOnce.unitPrice,
  `${finOnce.stage}/${finOnce.subtotal} (harga ${finOnce.unitPrice})`);
check('5.2 quantityNote memuat catatan satuan diasumsikan',
  typeof finOnce.quantityNote === 'string' && finOnce.quantityNote.includes('Satuan diasumsikan m²'), finOnce.quantityNote);
const [finTwice] = DedAiCalculator.finalizeItems([finOnce]);
const occurrences = (finTwice.quantityNote?.match(/Satuan diasumsikan m²/g) || []).length;
check('5.3 finalizeItems kedua tidak menduplikasi catatan (idempotent)', occurrences === 1, `occurrences=${occurrences}`);
const [finKnown] = DedAiCalculator.finalizeItems([explicitM2]);
check('5.4 item bersatuan eksplisit → quantityNote TANPA catatan asumsi',
  !(finKnown.quantityNote || '').includes('Satuan diasumsikan'));

console.log('\n== 6. applyUnitChange: ganti satuan mencabut flag ==');
const changed = applyUnitChange(noUnit, 'm3');
check('6.1 unit berubah m2→m3 → unitUnknown dicabut', changed.units === 'm3' && changed.unitUnknown === undefined,
  `${changed.units}/${String(changed.unitUnknown)}`);
check('6.2 token provenance lama TETAP tinggal (jejak audit waktu parse)',
  changed.provenance.includes('unit:assumed-m2'));
const unchanged = applyUnitChange(noUnit, 'm2');
check('6.3 satuan sama (m2→m2) → item tidak berubah, flag tetap', unchanged === noUnit && unchanged.unitUnknown === true);

console.log('\n== 7. mapDedAiItemToRabInput: catatan dibawa ke baris RAB ==');
const rabUnknown = mapDedAiItemToRabInput(finOnce, 'FULL_AI');
check('7.1 item unitUnknown → priceSourceExplanation menyebut satuan diasumsikan',
  rabUnknown !== null && rabUnknown.priceSourceExplanation.includes('Satuan diasumsikan m²'),
  rabUnknown ? rabUnknown.priceSourceExplanation : 'null');
check('7.2 unit baris RAB tetap m2 (default dipertahankan, hanya berlabel)',
  rabUnknown !== null && rabUnknown.unit === 'm2', rabUnknown ? rabUnknown.unit : 'null');
const pricedKnown = convertAiItem(6, {
  name: 'Lantai Uji Berharga', category: 'Lantai', units: 'm2',
  quantity: null, dimensions: '2 x 3 m',
  estimatedUnitPrice: 150000, unitPriceNote: 'Estimasi uji per m2, pasar 2026',
}, 'FAST', 'FULL_AI');
const [finKnownPriced] = DedAiCalculator.finalizeItems([pricedKnown]);
const rabKnown = mapDedAiItemToRabInput(finKnownPriced, 'FULL_AI');
check('7.3 item bersatuan eksplisit → penjelasan TANPA catatan asumsi',
  rabKnown !== null && !rabKnown.priceSourceExplanation.includes('Satuan diasumsikan'),
  rabKnown ? rabKnown.priceSourceExplanation : 'null');

console.log('\n== 8. [Batch 4] label ekspor + assumptions kontrak ==');
check('8.1 exportUnitLabel m2 + flag → "m2 (satuan diasumsikan)"',
  exportUnitLabel('m2', true) === 'm2 (satuan diasumsikan)', exportUnitLabel('m2', true));
check('8.2 exportUnitLabel tanpa flag → satuan polos', exportUnitLabel('m2') === 'm2' && exportUnitLabel('m3', false) === 'm3');
check('8.3 exportUnitLabel superskrip m² + flag → sufiks menempel, satuan utuh',
  exportUnitLabel('m²', true) === 'm² (satuan diasumsikan)', exportUnitLabel('m²', true));
check('8.4 countUnitUnknown: 1 dari 3',
  countUnitUnknown([{ unitUnknown: true }, {}, { unitUnknown: false }]) === 1);
const contractOutput: any = {
  jobId: 'job-b4-1', fileName: 'ded-uji-b4.pdf', projectName: 'Proyek Uji WD B4',
  pageCount: 2, partial: false, grandTotal: 1500000,
  items: [
    { id: 'u1', name: 'Pekerjaan Uji Tanpa Satuan', description: 'Pekerjaan Uji Tanpa Satuan',
      category: 'Lain-lain', quantity: 6, units: 'm2', unitUnknown: true,
      quantitySource: 'DED_GEOMETRIC', stage: 'CALCULATED', unitPrice: 150000, subtotal: 900000, sourcePages: [1] },
    { id: 'u2', name: 'Pekerjaan Uji Bersatuan', description: 'Pekerjaan Uji Bersatuan',
      category: 'Lain-lain', quantity: 6, units: 'm3',
      quantitySource: 'DED_EXPLICIT', stage: 'CALCULATED', unitPrice: 100000, subtotal: 600000, sourcePages: [2] },
  ],
};
const contract = mapDedAiOutputToContract(contractOutput);
check('8.5 kontrak: item unitUnknown membawa catatan asumsi kanonis',
  contract.items[0].assumptions.includes(UNIT_UNKNOWN_ASSUMPTION_NOTE),
  JSON.stringify(contract.items[0].assumptions));
check('8.6 kontrak: item bersatuan eksplisit TANPA catatan satuan',
  !contract.items[1].assumptions.some((a) => a.includes('Satuan diasumsikan')),
  JSON.stringify(contract.items[1].assumptions));
check('8.7 kontrak: catatan menyebut token provenance unit:assumed-m2',
  contract.items[0].assumptions.some((a) => a.includes('unit:assumed-m2')));
const contractValidation = validateDedOutputContract(contract);
check('8.8 kontrak dgn catatan asumsi tetap valid (validator fail-closed lolos)',
  contractValidation.ok === true, contractValidation.errors.join('; '));
check('8.9 kontrak: includedTotal tetap Σ subtotal (900.000 + 600.000)',
  contract.includedTotal === 1500000 && contract.pipelineTotal === 1500000,
  `${contract.includedTotal}/${contract.pipelineTotal}`);

console.log(`\n=== HASIL WD-3.7-08: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

/**
 * TANGGA ASUMSI BERLABEL — DED AI Estimate (keputusan owner 2026-11-08).
 *
 * Run: npx esbuild src/test/dedAssumptionTier.src.ts --bundle --platform=node
 *      --format=cjs --outfile=<folder-laporan>/dedAssumptionTier.cjs
 *      && node <folder-laporan>/dedAssumptionTier.cjs
 *
 * Menguji lapisan konversi (convertAiItem) + finalisasi secara deterministik
 * TANPA model live:
 *  - POSITIF (FULL_AI): dasar terstruktur (derivation ber-satuan eksplisit
 *    terjangkar teks / jadwal unit / satuan dimensi dinyatakan sebagai
 *    asumsi) → kuantitas TERISI berlabel ASSUMPTION + derivation + rumus,
 *    terhitung ke subtotal & total; harga AI_ESTIMATE hanya menempel
 *    dengan catatan dasar.
 *  - NEGATIF (FULL_AI): angka telanjang, input tak terjangkar, input tanpa
 *    satuan, jadwal bertentangan, diameter-saja → tetap UNRESOLVED
 *    ("Perlu Input"); harga AI tanpa catatan dasar tidak ditempel.
 *  - DATABASE: perilaku ketat lama TIDAK berubah sama sekali.
 */
import { convertAiItem } from '../ai-tools/ded-ai-estimate/service';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import { countAssumptionItems } from '../ai-tools/ded-ai-estimate/finalizationKey';
import { mapDedAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const SLOOF = {
  name: 'Sloof Beton Bertulang 15x20',
  category: 'Struktur',
  units: 'm3',
  quantity: null,
  dimensions: null,
  specification: 'Beton bertulang, penampang sloof 15x20 cm',
  sourceEvidence: 'Denah sloof: panjang total sloof 32 m; label penampang 15x20 pada denah',
  sourcePages: [3],
  derivation: {
    formulaType: 'sloof_volume',
    inputs: [
      { name: 'lebar', value: 15, unit: 'cm', source: 'DED' },
      { name: 'tinggi', value: 20, unit: 'cm', source: 'DED' },
      { name: 'panjang', value: 32, unit: 'm', source: 'ASSUMPTION' },
    ],
  },
  estimatedUnitPrice: 5850000,
  unitPriceNote: 'Estimasi harga beton bertulang sloof per m3, pasar Jawa Timur 2026',
};

console.log('\n== 1. POSITIF FULL_AI: derivation terstruktur (sloof 15x20) ==');
const sloof = convertAiItem(0, { ...SLOOF }, 'FAST', 'FULL_AI');
check('1.1 kuantitas TERISI dari derivation terstruktur', sloof.quantity === 0.96, `qty=${sloof.quantity}`);
check('1.2 quantitySource = ASSUMPTION (berlabel, tidak naik kelas)', sloof.quantitySource === 'ASSUMPTION', sloof.quantitySource);
check('1.3 derivation trail terisi (rumus + input + hasil)', !!sloof.derivation && sloof.derivation.result === 0.96 && sloof.derivation.inputs.length === 3);
check('1.4 quantityFormula tertulis (nilai masukan + hasil)', typeof sloof.quantityFormula === 'string' && sloof.quantityFormula.includes('32') && sloof.quantityFormula.includes('0,96'), sloof.quantityFormula);
check('1.5 provenans mencatat kanal dasar', sloof.provenance.some((p) => p === 'assumption-basis:DERIVASI_TERSTRUKTUR'));
check('1.6 harga AI_ESTIMATE menempel KARENA ada catatan dasar', sloof.priceSource === 'AI_ESTIMATE' && sloof.unitPrice === 5850000, `${sloof.priceSource}/${sloof.unitPrice}`);
check('1.7 quantityNote menyebut dasar asumsi', typeof sloof.quantityNote === 'string' && sloof.quantityNote.includes('derivation terstruktur'));

console.log('\n== 2. POSITIF FULL_AI: jadwal unit kusen ==');
const kusen = convertAiItem(1, {
  name: 'Kusen Jendela Aluminium (J2, J3)',
  category: 'Kusen & Kaca',
  units: 'unit',
  quantity: null,
  sourceEvidence: 'Jadwal kusen terbaca: J3 = 2 Unit, J2 = 1 Unit',
  specification: 'Kusen aluminium jendela tipe J2 dan J3',
  estimatedUnitPrice: 1450000,
  unitPriceNote: 'Estimasi kusen aluminium per unit terpasang, pasar 2026',
}, 'FAST', 'FULL_AI');
check('2.1 jumlah jadwal dijumlahkan mekanis → 3 unit', kusen.quantity === 3, `qty=${kusen.quantity}`);
check('2.2 berlabel ASSUMPTION + derivation jadwal_unit', kusen.quantitySource === 'ASSUMPTION' && kusen.derivation?.formulaType === 'jadwal_unit');
check('2.3 provenans kanal JADWAL_UNIT', kusen.provenance.some((p) => p === 'assumption-basis:JADWAL_UNIT'));

console.log('\n== 3. POSITIF FULL_AI: satuan dimensi dinyatakan sebagai asumsi ==');
const latei = convertAiItem(2, {
  name: 'Balok Latei Beton 15x20',
  category: 'Struktur',
  units: 'm3',
  quantity: null,
  dimensions: '400 x 15 x 20',
  dimensionUnitAssumption: 'cm',
  estimatedUnitPrice: 5850000,
  unitPriceNote: 'Estimasi beton bertulang per m3, pasar 2026',
}, 'FAST', 'FULL_AI');
check('3.1 dimensi ambigu + asumsi satuan cm → terisi 0,12 m3', latei.quantity === 0.12, `qty=${latei.quantity}`);
check('3.2 berlabel ASSUMPTION; derivation mencatat asumsi satuan (bukan fakta DED)',
  latei.quantitySource === 'ASSUMPTION' && latei.derivation?.formulaType === 'dimensi_satuan_diasumsikan' && (latei.derivation?.notes || '').includes('BUKAN fakta DED'));

console.log('\n== 4. POSITIF FULL_AI: angka telanjang DIGANTI nilai terhitung dari dasar ==');
const lantai = convertAiItem(3, {
  name: 'Lantai Keramik 40x40',
  category: 'Lantai',
  units: 'm2',
  quantity: 5,
  quantitySource: 'AI_INFERENCE',
  sourceEvidence: 'Denah lantai 8 x 8 m; pola keramik 40x40',
  specification: 'Keramik lantai 40x40, ruang utama 8 x 8 m',
  derivation: {
    formulaType: 'luas_dimensi',
    inputs: [
      { name: 'panjang', value: 8, unit: 'm', source: 'ASSUMPTION' },
      { name: 'lebar', value: 8, unit: 'm', source: 'ASSUMPTION' },
    ],
  },
  estimatedUnitPrice: 185000,
  unitPriceNote: 'Estimasi keramik 40x40 terpasang per m2, pasar 2026',
}, 'FAST', 'FULL_AI');
check('4.1 quantity = hasil derivation (64), bukan angka telanjang (5)', lantai.quantity === 64, `qty=${lantai.quantity}`);
check('4.2 naik ke ASSUMPTION berdasar (bukan AI_INFERENCE)', lantai.quantitySource === 'ASSUMPTION');
check('4.3 catatan menyebut penggantian angka telanjang', typeof lantai.quantityNote === 'string' && lantai.quantityNote.includes('digantikan'));

console.log('\n== 5. NEGATIF FULL_AI: pagar anti-karangan ==');
const naked = convertAiItem(4, {
  name: 'Pondasi Batu Gunung',
  category: 'Pondasi',
  units: 'm3',
  quantity: 12,
  quantitySource: 'AI_INFERENCE',
  estimatedUnitPrice: 1250000,
  unitPriceNote: 'Estimasi pondasi batu per m3, pasar 2026',
}, 'FAST', 'FULL_AI');
check('5.1 angka telanjang tanpa dasar → UNRESOLVED (Perlu Input)', naked.quantity === null && naked.quantitySource === 'UNRESOLVED', `${naked.quantity}/${naked.quantitySource}`);
check('5.2 alasan spesifik tampil di quantityNote', typeof naked.quantityNote === 'string' && naked.quantityNote.includes('Perlu Input') && naked.quantityNote.includes('tanpa dasar terstruktur'));

const unanchored = convertAiItem(5, {
  name: 'Ringbalk Beton Bertulang 15x20',
  category: 'Struktur',
  units: 'm3',
  quantity: null,
  specification: 'Ringbalk penampang 15x20',
  derivation: {
    formulaType: 'sloof_volume',
    inputs: [
      { name: 'lebar', value: 15, unit: 'cm', source: 'ASSUMPTION' },
      { name: 'tinggi', value: 20, unit: 'cm', source: 'ASSUMPTION' },
      { name: 'panjang', value: 999, unit: 'm', source: 'ASSUMPTION' },
    ],
  },
}, 'FAST', 'FULL_AI');
check('5.3 input derivation TAK terjangkar pada teks item (999 tidak tertulis) → ditolak, UNRESOLVED',
  unanchored.quantity === null && unanchored.quantitySource === 'UNRESOLVED', `${unanchored.quantity}/${unanchored.quantitySource}`);

const noUnit = convertAiItem(6, {
  name: 'Ringbalk Beton Bertulang 15x20',
  category: 'Struktur',
  units: 'm3',
  quantity: null,
  specification: 'Ringbalk penampang 15x20, panjang total 32 m',
  derivation: {
    formulaType: 'sloof_volume',
    inputs: [
      { name: 'lebar', value: 15, unit: '', source: 'ASSUMPTION' },
      { name: 'tinggi', value: 20, unit: 'cm', source: 'ASSUMPTION' },
      { name: 'panjang', value: 32, unit: 'm', source: 'ASSUMPTION' },
    ],
  },
}, 'FAST', 'FULL_AI');
check('5.4 input derivation tanpa satuan eksplisit → ditolak, UNRESOLVED', noUnit.quantity === null && noUnit.quantitySource === 'UNRESOLVED');

const scheduleConflict = convertAiItem(7, {
  name: 'Kusen Pintu (P1)',
  category: 'Kusen & Kaca',
  units: 'unit',
  quantity: 5,
  quantitySource: 'AI_INFERENCE',
  sourceEvidence: 'Jadwal kusen: P1 = 2 Unit',
}, 'FAST', 'FULL_AI');
check('5.5 quantity model (5) ≠ jumlah jadwal (2) → dasar ditolak, UNRESOLVED',
  scheduleConflict.quantity === null && scheduleConflict.quantitySource === 'UNRESOLVED');

const pipa = convertAiItem(8, {
  name: 'Pipa PVC AW',
  category: 'Plumbing',
  units: "m'",
  quantity: null,
  dimensions: 'ø110',
  dimensionUnitAssumption: 'mm',
}, 'FAST', 'FULL_AI');
check('5.6 diameter-saja + asumsi satuan → TETAP UNRESOLVED (diameter bukan panjang)',
  pipa.quantity === null && pipa.quantitySource === 'UNRESOLVED');

const ambiguTanpaAsumsi = convertAiItem(9, {
  name: 'Balok Latei Beton 15x20',
  category: 'Struktur',
  units: 'm3',
  quantity: null,
  dimensions: '400 x 15 x 20',
}, 'FAST', 'FULL_AI');
check('5.7 dimensi ambigu TANPA pernyataan satuan → tetap UNRESOLVED (perilaku lama)',
  ambiguTanpaAsumsi.quantity === null && ambiguTanpaAsumsi.quantitySource === 'UNRESOLVED');

console.log('\n== 6. HARGA FULL_AI: catatan dasar wajib ==');
const noNote = convertAiItem(10, {
  name: 'Pekerjaan Uji Harga',
  category: 'Lain-lain',
  units: 'm2',
  quantity: null,
  dimensions: '2 x 3 m',
  estimatedUnitPrice: 150000,
}, 'FAST', 'FULL_AI');
check('6.1 kuantitas deterministik tetap terisi (2 x 3 m = 6)', noNote.quantity === 6 && noNote.quantitySource === 'DED_GEOMETRIC');
check('6.2 estimasi harga TANPA catatan dasar → TIDAK ditempel (UNRESOLVED, null)',
  noNote.priceSource === 'UNRESOLVED' && noNote.unitPrice === null, `${noNote.priceSource}/${noNote.unitPrice}`);
check('6.3 alasan harga tampil di priceAssumptionNote',
  typeof noNote.priceAssumptionNote === 'string' && noNote.priceAssumptionNote.includes('catatan dasar'));

console.log('\n== 7. DATABASE: perilaku ketat TIDAK berubah ==');
const sloofDb = convertAiItem(0, { ...SLOOF }, 'FAST', 'DATABASE');
check('7.1 DATABASE: derivation terstruktur TIDAK mengisi (tetap UNRESOLVED)',
  sloofDb.quantity === null && sloofDb.quantitySource === 'UNRESOLVED', `${sloofDb.quantity}/${sloofDb.quantitySource}`);
const nakedDb = convertAiItem(4, {
  name: 'Pondasi Batu Gunung', category: 'Pondasi', units: 'm3',
  quantity: 12, quantitySource: 'AI_INFERENCE',
}, 'FAST', 'DATABASE');
check('7.2 DATABASE: angka inferensi dipertahankan sebagai AI_INFERENCE (perilaku lama)',
  nakedDb.quantity === 12 && nakedDb.quantitySource === 'AI_INFERENCE', `${nakedDb.quantity}/${nakedDb.quantitySource}`);
const noNoteDb = convertAiItem(10, {
  name: 'Pekerjaan Uji Harga', category: 'Lain-lain', units: 'm2',
  quantity: null, dimensions: '2 x 3 m', estimatedUnitPrice: 150000,
}, 'FAST', 'DATABASE');
check('7.3 DATABASE: estimasi tanpa catatan tetap fallback AI_ESTIMATE berlabel (perilaku lama)',
  noNoteDb.priceSource === 'AI_ESTIMATE' && noNoteDb.unitPrice === 150000, `${noNoteDb.priceSource}/${noNoteDb.unitPrice}`);

console.log('\n== 8. Finalisasi & total: asumsi terhitung, label tidak naik kelas ==');
const out = DedAiCalculator.buildOutput({
  jobId: 'job-assumption-tier', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
  projectName: 'Uji Tangga Asumsi', pageCount: 1,
  items: [sloof, kusen, naked],
});
const finSloof = out.items.find((i) => i.id === sloof.id)!;
const finNaked = out.items.find((i) => i.id === naked.id)!;
check('8.1 item asumsi terfinalisasi CALCULATED dengan subtotal', finSloof.stage === 'CALCULATED' && finSloof.subtotal === 5616000, `${finSloof.stage}/${finSloof.subtotal}`);
check('8.2 total Full AI memasukkan item asumsi (0,96 × Rp5.850.000 + kusen 3 × Rp1.450.000)',
  out.grandTotal === 5616000 + 4350000, `total=${out.grandTotal}`);
check('8.3 coverage menghitung item asumsi yang terhitung', out.coverage.itemsWithAssumption >= 1, `itemsWithAssumption=${out.coverage.itemsWithAssumption}`);
check('8.4 countAssumptionItems (pola finalizationKey) menghitung item asumsi bersubtotal',
  countAssumptionItems(out.items as never) >= 1, `count=${countAssumptionItems(out.items as never)}`);
check('8.5 item Perlu Input TIDAK menyumbang total (subtotal null)', finNaked.subtotal === null && finNaked.stage !== 'CALCULATED');
const rab = mapDedAiItemToRabInput(finSloof as never, 'FULL_AI');
check('8.6 simpan-ke-RAB: AI_ESTIMATE → EZRAB_ASSUMPTION + label "Estimasi AI" + NEEDS_VERIFICATION (tidak naik kelas)',
  rab !== null && rab.priceSourceKind === 'EZRAB_ASSUMPTION' && rab.priceSourceLabel === 'Estimasi AI' && rab.verificationStatus === 'NEEDS_VERIFICATION',
  JSON.stringify(rab && { kind: rab.priceSourceKind, label: rab.priceSourceLabel, status: rab.verificationStatus }));

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

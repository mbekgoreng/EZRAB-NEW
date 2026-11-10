/**
 * REGRESI VALIDASI KONFLIK SPESIFIKASI MATERIAL LANJUTAN — DED
 * (Sprint 4, Tugas D).
 *
 * Run: npx esbuild src/test/dedMaterialSpec.src.ts --bundle --platform=node
 *      --format=cjs --outfile=~/workspace/.ded-sprint4-bundles/dedMaterialSpec.cjs
 *      && node ~/workspace/.ded-sprint4-bundles/dedMaterialSpec.cjs
 *
 * Mencakup:
 * - False positive (HARUS tetap cocok): spek sama persis; spek satu
 *   sisi tak lengkap; beda kata non-esensial; "Nok Spandek" dan
 *   "genteng metal" tetap bukan konflik; nilai item tercakup rentang
 *   referensi; tulangan campuran yang memuat nilai referensi.
 * - False negative (HARUS ditolak sebagai konflik keras): baja ringan
 *   0,75 vs 1,0 mm; kaca 5 vs 8 mm; gypsum 9 vs 12 mm; kabel 2,5 vs
 *   4 mm²; beton K-225 vs K-300; besi Ø10 vs Ø13; pipa PVC vs HDPE.
 * - Ambigu → NEEDS_VERIFICATION (bukan keras, bukan cocok diam-diam):
 *   K- vs f'c; diameter pipa inch vs mm; dimensi jendela berbeda;
 *   kelas beton esensial hilang pada item beton.
 * - Penjaga parser: nilai tak andal TIDAK diekstrak (lebar listplank
 *   150 mm bukan ketebalan papan; daun multipleks 18 mm bukan kaca/
 *   aluminium; dimensi perbandingan "lebih besar dari 60x120" bukan
 *   dimensi asumsi; jumlah inti kabel bukan penampang; harga bukan
 *   atribut).
 * - Integrasi: completeDedItem — konflik keras → harga tetap kosong +
 *   NEEDS_VERIFICATION; spek tak lengkap → tetap terisi seperti semula.
 */
import {
  parseMaterialSpec, validateMaterialSpec,
} from '../ai-tools/ded-ai-estimate/materialSpecValidation';
import {
  EXTERNAL_PRICE_REFERENCES, findExternalReference, referenceSpecConflict,
  type ExternalPriceReference,
} from '../ai-tools/ded-ai-estimate/externalPriceReferences';
import { completeDedItem } from '../ai-tools/ded-ai-estimate/priceCompletion';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-11-10T00:00:00Z');
const CTX = { floorAreaM2: 48.5, ceilingAreaM2: 29.5, buildingPerimeterM: 24, doorUnits: 4, roomCount: 4 };
const refById = (id: string): ExternalPriceReference =>
  EXTERNAL_PRICE_REFERENCES.find((r) => r.id === id)!;
const baseItem = (over: Partial<DedAiItem>): DedAiItem => ({
  id: 'ms-1', name: 'Item Uji', category: 'Uji', units: 'm2',
  quantity: 10, quantitySource: 'DERIVED', unitPrice: null,
  priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [], provenance: [],
  stage: 'PARSE', ...over,
} as DedAiItem);
const verdictOf = (item: string, ref: string) => validateMaterialSpec(item, ref).verdict;

// ===========================================================================
// A. FALSE POSITIVE — pasangan yang HARUS tetap cocok
// ===========================================================================
console.log('== A. False positive (tetap cocok) ==');
check('A1 spek sama persis: baja ringan 0,75 vs 0,75 → COMPATIBLE',
  verdictOf('Rangka atap baja ringan kanal C 0,75 mm', 'Rangka atap baja ringan kanal C 0,75 mm + reng') === 'COMPATIBLE');
check('A2 spek sama persis via referensi terkurasi: item 0,75 mm cocok ext-rangka',
  referenceSpecConflict('Rangka Atap Baja Ringan Kanal C 0,75 mm', refById('ext-rangka-baja-ringan')) === null
  && findExternalReference('Rangka Atap Baja Ringan Kanal C 0,75 mm', 'm2')?.id === 'ext-rangka-baja-ringan');
check('A3 satu sisi tak lengkap: item tanpa ketebalan tetap cocok (asumsi referensi berlaku)',
  verdictOf('Rangka Atap Baja Ringan', refById('ext-rangka-baja-ringan').specAssumption) === 'COMPATIBLE_INCOMPLETE'
  && findExternalReference('Rangka Atap Baja Ringan', 'm2')?.recommendedPrice === 165000);
check('A4 satu sisi tak lengkap: referensi tanpa atribut tidak membatasi item ber-atribut',
  verdictOf('Plafon Gypsum 9 mm', 'Plafon polos terpasang termasuk rangka') === 'COMPATIBLE_INCOMPLETE');
check('A5 beda kata non-esensial (premium/warna/merek) TIDAK menolak kecocokan',
  verdictOf('Rangka Atap Baja Ringan Premium Warna Silver Merek Taso', refById('ext-rangka-baja-ringan').specAssumption) !== 'HARD_CONFLICT'
  && findExternalReference('Rangka Atap Baja Ringan Premium Warna Silver', 'm2')?.id === 'ext-rangka-baja-ringan');
check('A6 "Nok Spandek" tetap BUKAN konflik',
  referenceSpecConflict('Nok Spandek', refById('ext-nok-spandek')) === null
  && findExternalReference('Nok Spandek', "m'")?.id === 'ext-nok-spandek');
check('A7 "genteng metal" tetap BUKAN konflik genteng (batas kata dipertahankan)',
  referenceSpecConflict('Penutup Atap Genteng Metal', refById('ext-penutup-spandek')) === null
  && referenceSpecConflict('Nok Genteng Metal', refById('ext-nok-spandek')) === null);
check('A8 jendela fixture persis (kaca bening 5mm) tetap cocok ext-jendela',
  referenceSpecConflict('Jendela J1 Kusen Aluminium Kaca Bening 5mm', refById('ext-jendela-aluminium-kaca5')) === null
  && findExternalReference('Jendela J1 Kusen Aluminium Kaca Bening 5mm', 'unit')?.id === 'ext-jendela-aluminium-kaca5');
check('A9 plafon fixture persis (gypsum 9mm) tetap cocok & terisi 150.000',
  findExternalReference('Plafon Gypsum 9mm Rangka Hollow', 'm2')?.recommendedPrice === 150000);
check('A10 nilai item tercakup rentang referensi (boven 30x50 di dalam "30x50 sampai 40x60")',
  verdictOf('Bovenlicht 30x50', 'Bovenlicht aluminium + kaca ±30×50 sampai 40×60') === 'COMPATIBLE');
check('A11 tulangan campuran yang memuat nilai referensi tetap cocok (Ø10 di dalam Ø10+Ø13)',
  verdictOf('Tulangan Ø10 dan Ø13', 'Pembesian besi Ø10') === 'COMPATIBLE');
check('A12 beton kelas sama K-225 vs K-225 dan f\'c sama tetap cocok',
  verdictOf('Beton K-225 site mix', 'Beton site mix K-225') === 'COMPATIBLE'
  && verdictOf("Beton f'c 25 MPa", "Beton ready mix f'c 25 MPa") === 'COMPATIBLE');
check('A13 pipa material + diameter sama tetap cocok (PVC 3/4")',
  verdictOf('Pipa PVC 3/4"', 'Pipa PVC diameter 3/4 inch terpasang') === 'COMPATIBLE');
check('A14 cat jumlah lapis sama tetap cocok',
  verdictOf('Pengecatan dinding 2 lapis', 'Pengecatan dinding (2 lapis) + cat dasar') === 'COMPATIBLE');
check('A15 item berdimensi tanpa konteks kusen tidak dibandingkan sebagai jendela (keramik 60x60)',
  parseMaterialSpec('Lantai Keramik 60x60').attributes.windowDimension === undefined
  && verdictOf('Lantai Keramik 60x60', 'Jendela aluminium ukuran 80x160') !== 'HARD_CONFLICT');

// ===========================================================================
// B. FALSE NEGATIVE — pasangan yang HARUS ditolak (konflik keras)
// ===========================================================================
console.log('== B. False negative (konflik keras) ==');
check('B1 baja ringan 1,0 mm (item) vs 0,75 mm (referensi) = HARD_CONFLICT',
  verdictOf('Rangka atap baja ringan 1,0 mm', 'Rangka atap baja ringan kanal C 0,75 mm') === 'HARD_CONFLICT');
check('B1b baja ringan 1,0 mm ditolak penjaga referensi terkurasi + findExternalReference null',
  referenceSpecConflict('Rangka Atap Baja Ringan 1,0 mm', refById('ext-rangka-baja-ringan')) !== null
  && findExternalReference('Rangka Atap Baja Ringan 1,0 mm', 'm2') === null);
check('B2 kaca 8 mm vs 5 mm = HARD_CONFLICT (validator + referensi terkurasi)',
  verdictOf('Jendela aluminium kaca 8 mm', 'Jendela aluminium + kaca bening 5 mm') === 'HARD_CONFLICT'
  && referenceSpecConflict('Jendela Aluminium Kaca 8 mm', refById('ext-jendela-aluminium-kaca5')) !== null
  && findExternalReference('Jendela Aluminium Kaca 8 mm', 'unit') === null);
check('B3 gypsum 12 mm vs 9 mm = HARD_CONFLICT (validator + referensi terkurasi)',
  verdictOf('Plafon gypsum 12 mm rangka hollow', 'Plafon gypsum 9 mm polos + rangka hollow') === 'HARD_CONFLICT'
  && referenceSpecConflict('Plafon Gypsum 12 mm Rangka Hollow', refById('ext-plafon-gypsum-hollow')) !== null
  && findExternalReference('Plafon Gypsum 12 mm Rangka Hollow', 'm2') === null);
check('B4 kabel 4 mm² vs 2,5 mm² = HARD_CONFLICT',
  verdictOf('Instalasi kabel NYM 3x4 mm²', 'kabel NYM 3×2,5 mm² + instalasi') === 'HARD_CONFLICT');
check('B4b kabel 4 mm² ditolak untuk referensi titik penerangan (1,5 mm²)',
  referenceSpecConflict('Titik Penerangan Kabel NYM 4 mm2', refById('ext-titik-penerangan')) !== null
  && findExternalReference('Titik Penerangan Kabel NYM 4 mm2', 'titik') === null);
check('B5 beton K-225 vs K-300 = HARD_CONFLICT',
  verdictOf('Beton K-225 site mix', 'Beton K-300 ready mix') === 'HARD_CONFLICT');
check('B6 besi Ø13 vs Ø10 = HARD_CONFLICT; D13 vs D10 juga',
  verdictOf('Pembesian besi Ø13', 'Pembesian besi Ø10') === 'HARD_CONFLICT'
  && verdictOf('Tulangan D13 ulir', 'Tulangan D10 ulir') === 'HARD_CONFLICT');
check('B7 pipa PVC vs HDPE (tertulis eksplisit) = HARD_CONFLICT',
  verdictOf('Pipa HDPE Ø110 mm', 'Pipa PVC Ø110 mm') === 'HARD_CONFLICT');
check('B8 besi polos vs ulir = HARD_CONFLICT; grade BJTP24 vs BJTS40 = HARD_CONFLICT',
  verdictOf('Besi beton polos Ø10', 'Besi beton ulir Ø10') === 'HARD_CONFLICT'
  && verdictOf('Tulangan BJTS 40', 'Tulangan BJTP 24') === 'HARD_CONFLICT');
check('B9 coating atap AZ70 vs AZ150 = HARD_CONFLICT; spandek 0,30 vs 0,40 mm = HARD_CONFLICT',
  verdictOf('Atap spandek AZ70', 'Atap spandek AZ150') === 'HARD_CONFLICT'
  && verdictOf('Penutup spandek 0,30 mm', 'Penutup spandek 0,40 mm') === 'HARD_CONFLICT');
check('B10 cat 3 lapis vs 2 lapis = HARD_CONFLICT; pipa PVC 1" vs 2" = HARD_CONFLICT',
  verdictOf('Pengecatan dinding 3 lapis', 'Pengecatan dinding 2 lapis') === 'HARD_CONFLICT'
  && verdictOf('Pipa PVC 1"', 'Pipa PVC 2"') === 'HARD_CONFLICT');

// ===========================================================================
// C. AMBIGU → NEEDS_VERIFICATION (alasan tercatat, bukan keras)
// ===========================================================================
console.log('== C. Ambigu → NEEDS_VERIFICATION ==');
{
  const v = validateMaterialSpec('Beton K-225', "Beton f'c 25 MPa");
  check('C1 K-225 vs f\'c 25 MPa = NEEDS_VERIFICATION (notasi tak sebanding) + alasan tercatat',
    v.verdict === 'NEEDS_VERIFICATION' && v.reason != null && /notasi berbeda/.test(v.reason));
}
check('C2 diameter pipa inch vs mm = NEEDS_VERIFICATION (nominal vs aktual)',
  verdictOf('Pipa PVC 3/4"', 'Pipa PVC 20 mm') === 'NEEDS_VERIFICATION');
check('C3 dimensi jendela berbeda = NEEDS_VERIFICATION (bukan keras — harga per unit dinyatakan rentang)',
  verdictOf('Jendela aluminium 80x160', 'Jendela aluminium ukuran 60x120') === 'NEEDS_VERIFICATION');
check('C4 kelas beton esensial hilang pada item beton = NEEDS_VERIFICATION',
  verdictOf('Beton bertulang untuk kolom praktis', 'Beton K-300 ready mix terpasang') === 'NEEDS_VERIFICATION');
check('C5 NEEDS_VERIFICATION menahan pengisian diam-diam lewat referenceSpecConflict (alasan "perlu verifikasi")',
  (referenceSpecConflict('Beton K-225', {
    ...refById('ext-rangka-baja-ringan'),
    id: 'uji-fc', matchKeywords: ['beton'], unit: 'm3',
    specAssumption: "Beton f'c 25 MPa ready mix",
  }) || '').startsWith('spesifikasi perlu verifikasi:'));

// ===========================================================================
// D. PENJAGA PARSER — ekstraksi hanya yang andal
// ===========================================================================
console.log('== D. Penjaga parser ==');
check('D1 lebar listplank 150 mm BUKAN ketebalan papan GRC',
  parseMaterialSpec('Listplank Kalsium Silikat 8x150mm').attributes.grcBoardThicknessMm === undefined);
check('D2 daun multipleks 18 mm pada asumsi pintu P1 BUKAN kaca/aluminium',
  (() => { const a = parseMaterialSpec(refById('ext-pintu-p1-double-hpl').specAssumption).attributes;
    return a.glassThicknessMm === undefined && a.aluminiumThicknessMm === undefined; })());
check('D3 asumsi jendela: kaca 5 mm terekstrak; "lebih besar dari 60x120" BUKAN dimensi asumsi',
  (() => { const a = parseMaterialSpec(refById('ext-jendela-aluminium-kaca5').specAssumption).attributes;
    return a.glassThicknessMm?.[0] === '5' && a.windowDimension === undefined; })());
check('D4 jumlah inti kabel bukan penampang: NYM 3×2,5 mm² → 2.5',
  parseMaterialSpec('kabel NYM 3×2,5 mm²').attributes.cableSectionMm2?.[0] === '2.5');
check('D5 angka harga & kata merek/warna tidak menjadi atribut',
  Object.keys(parseMaterialSpec('Cat premium warna putih glossy Rp1.250.000').attributes).length === 0);
check('D6 Ø pada teks pipa = diameter pipa, BUKAN diameter tulangan',
  (() => { const a = parseMaterialSpec('Pipa PVC Ø110 mm').attributes;
    return a.pipeDiameterMm?.[0] === '110' && a.rebarDiameterMm === undefined && a.pipeMaterial?.[0] === 'PVC'; })());
check('D7 pecahan campuran pipa: 1 1/2" → 1.5 inch (bukan 0.5)',
  parseMaterialSpec('Pipa galvanis 1 1/2"').attributes.pipeDiameterInch?.[0] === '1.5');
check('D8 referensi asli terpelihara: blok konflik menyebut id referensi (lewat findConflictingReference di integrasi)',
  referenceSpecConflict('Plafon Gypsum 12 mm Rangka Hollow', refById('ext-plafon-gypsum-hollow')) !== null);

// ===========================================================================
// E. INTEGRASI priceCompletion — perilaku penyelesaian
// ===========================================================================
console.log('== E. Integrasi penyelesaian harga ==');
{
  const { item, outcome } = completeDedItem(
    baseItem({ name: 'Rangka Atap Baja Ringan 1,0 mm', units: 'm2', quantity: 90 }),
    CTX, { policy: 'FULL_AI', now: NOW, referencesExplicit: true });
  check('E1 konflik keras terintegrasi: harga tetap kosong + NEEDS_VERIFICATION + referensi tercatat',
    item.unitPrice == null && outcome !== 'FILLED_MARKET_REFERENCE'
    && item.priceCompletion?.verificationStatus === 'NEEDS_VERIFICATION'
    && item.priceCompletion?.referenceId === 'ext-rangka-baja-ringan',
    JSON.stringify(item.priceCompletion));
}
{
  const { item } = completeDedItem(
    baseItem({ name: 'Rangka Atap Baja Ringan', units: 'm2', quantity: 90 }),
    CTX, { policy: 'FULL_AI', now: NOW, referencesExplicit: true });
  check('E2 spek tak lengkap terintegrasi: harga tetap terisi 165.000 seperti semula',
    item.unitPrice === 165000 && item.priceCompletion?.classification === 'MARKET_REFERENCE');
}
{
  const { item } = completeDedItem(
    baseItem({ name: 'Plafon Gypsum 9mm Rangka Hollow', units: 'm2', quantity: 29.5 }),
    CTX, { policy: 'FULL_AI', now: NOW, referencesExplicit: true });
  check('E3 spek sama persis terintegrasi: plafon tetap terisi 150.000',
    item.unitPrice === 150000);
}

// ===========================================================================
// F. ATURAN KATEGORI BESAR LAMA — tidak berubah
// ===========================================================================
console.log('== F. Penjaga kategori besar (regresi) ==');
check('F1 pintu kayu vs referensi aluminium tetap konflik (alasan lama)',
  referenceSpecConflict('Pintu Double Kayu Kamper P1', refById('ext-pintu-p1-double-hpl'))
    === 'material item (kayu/UPVC/besi) berbeda dari asumsi referensi (aluminium)');
check('F2 genteng tanah liat vs referensi spandek tetap konflik (alasan lama)',
  referenceSpecConflict('Penutup Atap Genteng Tanah Liat', refById('ext-penutup-spandek'))
    === 'penutup atap item (genteng) berbeda dari asumsi referensi (metal/spandek)');
check('F3 plafon GRC vs referensi gypsum tetap konflik (alasan lama)',
  referenceSpecConflict('Plafon GRC Rangka Hollow', refById('ext-plafon-gypsum-hollow'))
    === 'material plafon item (GRC/kalsiboard/PVC) berbeda dari asumsi referensi (gypsum)');

console.log(`\nHASIL: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

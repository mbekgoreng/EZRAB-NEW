/**
 * HARNESS DETERMINISTIK — berkas nyata pdf-gambar-rumah-1-lantai_compress.pdf
 * (fixture qa-fixtures/, md5-identik kiriman owner; kasus "semua item
 * NEEDS_CONFIRMATION, total Rp0" Oktober 2026-10 → diagnosis 2026-11-08).
 *
 * Run: npx esbuild src/test/dedRealFileAssumptionHarness.src.ts --bundle
 *      --platform=node --format=cjs
 *      --outfile=<folder-laporan>/dedRealFileAssumptionHarness.cjs
 *      && node <folder-laporan>/dedRealFileAssumptionHarness.cjs
 *
 * Isi berkas yang SELAMAT dari lapisan teks (diagnosis induk): label ukuran
 * pada nama elemen (Sloof 15x20, Ringbalk 15x20, Keramik 40x40 & 25x25,
 * Kaca Bening 5 mm), jadwal unit kusen (J3 = 2 Unit, J2 = 1 Unit), elevasi
 * potongan. Angka dimensi keseluruhan berupa glif CAD rusak → parser
 * dimensi deterministik memang gagal untuk berkas ini.
 *
 * Harness ini memberi makan lapisan konversi (convertAiItem +
 * DedAiCalculator) dengan keluaran model TERSTRUKTUR yang diturunkan dari
 * label/jadwal yang selamat itu — persis bentuk keluaran yang kini diminta
 * prompt (derivation ber-satuan eksplisit / jadwal tertulis / catatan dasar
 * harga). Ia memvalidasi LAPISAN KONVERSI DETERMINISTIK saja: apakah item
 * berdasar kini TERISI berlabel dan terhitung, dan item tanpa dasar tetap
 * Perlu Input. Bacaan vision live atas gambar TIDAK diukur di sini.
 */
import { convertAiItem } from '../ai-tools/ded-ai-estimate/service';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Keluaran model terstruktur per item — diturunkan dari isi berkas nyata.
const MODEL_ITEMS: any[] = [
  {
    name: 'Sloof Beton Bertulang 15x20',
    category: 'Struktur Bawah',
    units: 'm3',
    quantity: null,
    dimensions: null, // angka dimensi denah rusak di lapisan teks
    specification: 'Beton bertulang, penampang sloof 15x20 cm',
    sourceEvidence: 'Denah sloof: panjang total sloof 32 m (keliling denah 8 x 8 m); label penampang 15x20 terbaca pada denah sloof',
    sourcePages: [5],
    derivation: {
      formulaType: 'sloof_volume',
      inputs: [
        { name: 'lebar', value: 15, unit: 'cm', source: 'DED' },
        { name: 'tinggi', value: 20, unit: 'cm', source: 'DED' },
        { name: 'panjang', value: 32, unit: 'm', source: 'ASSUMPTION' },
      ],
    },
    estimatedUnitPrice: 5850000,
    unitPriceNote: 'Estimasi beton bertulang sloof per m3 (beton + besi + begesting), pasar Jawa Timur 2026',
  },
  {
    name: 'Ringbalk Beton Bertulang 15x20',
    category: 'Struktur Atas',
    units: 'm3',
    quantity: null,
    dimensions: null,
    specification: 'Beton bertulang, penampang ringbalk 15x20 cm, elevasi +4,00 pada potongan',
    sourceEvidence: 'Denah ringbalk mengikuti denah sloof: panjang total 32 m (keliling 8 x 8 m); label penampang 15x20 terbaca',
    sourcePages: [6],
    derivation: {
      formulaType: 'sloof_volume',
      inputs: [
        { name: 'lebar', value: 15, unit: 'cm', source: 'DED' },
        { name: 'tinggi', value: 20, unit: 'cm', source: 'DED' },
        { name: 'panjang', value: 32, unit: 'm', source: 'ASSUMPTION' },
      ],
    },
    estimatedUnitPrice: 5850000,
    unitPriceNote: 'Estimasi beton bertulang ringbalk per m3, pasar Jawa Timur 2026',
  },
  {
    name: 'Lantai Keramik 40x40',
    category: 'Lantai',
    units: 'm2',
    quantity: null,
    dimensions: null,
    specification: 'Keramik lantai 40x40 (pola lantai terbaca pada denah lantai)',
    sourceEvidence: 'Denah lantai rumah 8 x 8 m; notasi keramik 40x40 pada denah pola lantai',
    sourcePages: [7],
    derivation: {
      formulaType: 'luas_dimensi',
      inputs: [
        { name: 'panjang', value: 8, unit: 'm', source: 'ASSUMPTION' },
        { name: 'lebar', value: 8, unit: 'm', source: 'ASSUMPTION' },
      ],
    },
    estimatedUnitPrice: 185000,
    unitPriceNote: 'Estimasi keramik 40x40 terpasang per m2 (material + upah), pasar 2026',
  },
  {
    name: 'Keramik Dinding 25x25',
    category: 'Dinding',
    units: 'm2',
    quantity: null,
    dimensions: null,
    specification: 'Keramik dinding 25x25 kamar mandi (notasi terbaca; keramik dinding 25x60 pada daftar notasi)',
    sourceEvidence: 'Dinding KM: keliling 7 m (ruang 1,5 x 2 m dua sisi); tinggi keramik dinding 1,6 m dibaca dari potongan',
    sourcePages: [7],
    derivation: {
      formulaType: 'luas_dimensi',
      inputs: [
        { name: 'panjang', value: 7, unit: 'm', source: 'ASSUMPTION' },
        { name: 'lebar', value: 1.6, unit: 'm', source: 'ASSUMPTION' },
      ],
    },
    estimatedUnitPrice: 195000,
    unitPriceNote: 'Estimasi keramik dinding 25x25 terpasang per m2, pasar 2026',
  },
  {
    name: 'Kaca Bening 5 mm',
    category: 'Kusen & Kaca',
    units: 'm2',
    quantity: null,
    dimensions: null,
    specification: 'Kaca bening 5 mm untuk daun jendela J2/J3 (ketebalan terbaca pada jadwal kusen)',
    sourceEvidence: 'Jadwal kusen: daun kaca ukuran 1,2 x 1,5 m; total 3 daun kaca (J3 = 2 Unit, J2 = 1 Unit); kaca bening 5 mm',
    sourcePages: [12],
    derivation: {
      formulaType: 'luas_dimensi',
      inputs: [
        { name: 'panjang', value: 1.2, unit: 'm', source: 'ASSUMPTION' },
        { name: 'lebar', value: 1.5, unit: 'm', source: 'ASSUMPTION' },
        { name: 'jumlah', value: 3, unit: 'unit', source: 'ASSUMPTION' },
      ],
    },
    estimatedUnitPrice: 285000,
    unitPriceNote: 'Estimasi kaca bening 5 mm terpasang per m2, pasar 2026',
  },
  {
    name: 'Kusen Jendela Aluminium (J2, J3)',
    category: 'Kusen & Kaca',
    units: 'unit',
    quantity: null,
    dimensions: null,
    specification: 'Kusen aluminium jendela tipe J2 dan J3 sesuai jadwal kusen',
    sourceEvidence: 'Jadwal kusen terbaca: J3 = 2 Unit, J2 = 1 Unit',
    sourcePages: [12],
    estimatedUnitPrice: 1450000,
    unitPriceNote: 'Estimasi kusen aluminium jendela per unit terpasang, pasar 2026',
  },
  {
    name: 'Kusen Pintu Aluminium (P1, P2)',
    category: 'Kusen & Kaca',
    units: 'unit',
    quantity: null,
    dimensions: null,
    specification: 'Kusen aluminium pintu tipe P1 dan P2 sesuai jadwal kusen',
    sourceEvidence: 'Jadwal kusen terbaca: P1 = 1 Unit, P2 = 1 Unit',
    sourcePages: [12],
    estimatedUnitPrice: 1850000,
    unitPriceNote: 'Estimasi kusen aluminium pintu per unit terpasang, pasar 2026',
  },
  {
    // KONTROL NEGATIF 1: label terbaca (Pondasi Batu Gunung) tetapi model
    // tidak menyediakan dasar terstruktur apa pun — hanya angka telanjang.
    name: 'Pondasi Batu Gunung',
    category: 'Pondasi',
    units: 'm3',
    quantity: 12,
    quantitySource: 'AI_INFERENCE',
    dimensions: null,
    specification: 'Pondasi batu gunung (notasi terbaca; dimensi pondasi tidak terbaca)',
    sourceEvidence: 'Notasi pondasi batu gunung pada denah pondasi; angka dimensi rusak',
    sourcePages: [4],
    estimatedUnitPrice: 1250000,
    unitPriceNote: 'Estimasi pondasi batu gunung per m3, pasar 2026',
  },
  {
    // KONTROL NEGATIF 2: atap — notasi bahan terbaca, tanpa dasar terstruktur.
    name: 'Atap Metal Spandek + Rangka Baja Ringan',
    category: 'Atap',
    units: 'm2',
    quantity: 96,
    quantitySource: 'AI_INFERENCE',
    dimensions: null,
    specification: 'Penutup metal spandek, rangka baja ringan (notasi atap terbaca; dimensi atap rusak)',
    sourceEvidence: 'Notasi atap pada denah atap; elevasi atap +5,90 pada potongan',
    sourcePages: [9],
    estimatedUnitPrice: 325000,
    unitPriceNote: 'Estimasi atap spandek + baja ringan per m2, pasar 2026',
  },
  {
    // KONTROL HARGA: kuantitas berdasar TETAPI estimasi harga tanpa catatan
    // dasar → kuantitas terisi, harga TIDAK ditempel (subtotal null).
    name: 'Plafon Gypsum Rangka Hollow',
    category: 'Plafon',
    units: 'm2',
    quantity: null,
    dimensions: null,
    specification: 'Plafon gypsum, elevasi +3,20 pada potongan',
    sourceEvidence: 'Denah plafon 8 x 8 m; elevasi plafon +3,20 terbaca pada potongan',
    sourcePages: [8],
    derivation: {
      formulaType: 'luas_dimensi',
      inputs: [
        { name: 'panjang', value: 8, unit: 'm', source: 'ASSUMPTION' },
        { name: 'lebar', value: 8, unit: 'm', source: 'ASSUMPTION' },
      ],
    },
    estimatedUnitPrice: 145000,
    // unitPriceNote SENGAJA dikosongkan.
  },
];

function rp(n: number | null): string {
  return n === null ? '—' : 'Rp' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function run(policy: 'FULL_AI' | 'DATABASE') {
  const converted = MODEL_ITEMS.map((raw, i) => convertAiItem(i, raw, 'FAST', policy));
  const out = DedAiCalculator.buildOutput({
    jobId: `harness-rumah-1-lantai-${policy}`,
    projectType: 'BANGUNAN',
    mode: 'FAST',
    policy,
    projectName: 'Rumah 1 Lantai (berkas uji nyata)',
    pageCount: 32,
    items: converted,
  });
  return out;
}

console.log('\n================ MODE FULL_AI ================');
const full = run('FULL_AI');
const byName = new Map<string, DedAiItem>(full.items.map((i) => [i.name, i]));
for (const it of full.items) {
  const status = it.quantity === null ? 'PERLU INPUT' : it.subtotal === null ? 'TERISI — harga belum ada' : 'TERISI + SUBTOTAL';
  console.log(
    `- ${it.name}\n    qty=${it.quantity ?? 'null'} ${it.units} [${it.quantitySource}] | harga=${rp(it.unitPrice)} [${it.priceSource}] | subtotal=${rp(it.subtotal)} | ${status}`,
  );
}
console.log(`  TOTAL FULL_AI: ${rp(full.grandTotal)} | asumsi terhitung: ${full.coverage.itemsWithAssumption} item | belum tuntas: ${full.coverage.itemsUnresolved} item`);

console.log('\n== Asersi harness (FULL_AI) ==');
const sloof = byName.get('Sloof Beton Bertulang 15x20')!;
check('Sloof 15x20 TERISI 0,96 m3 ASSUMPTION + subtotal Rp5.616.000', sloof.quantity === 0.96 && sloof.quantitySource === 'ASSUMPTION' && sloof.subtotal === 5616000, `${sloof.quantity}/${sloof.quantitySource}/${sloof.subtotal}`);
const ringbalk = byName.get('Ringbalk Beton Bertulang 15x20')!;
check('Ringbalk 15x20 TERISI 0,96 m3 ASSUMPTION + subtotal', ringbalk.quantity === 0.96 && ringbalk.quantitySource === 'ASSUMPTION' && ringbalk.subtotal === 5616000);
const keramik = byName.get('Lantai Keramik 40x40')!;
check('Keramik 40x40 TERISI 64 m2 ASSUMPTION + subtotal Rp11.840.000', keramik.quantity === 64 && keramik.subtotal === 11840000, `${keramik.quantity}/${keramik.subtotal}`);
const keramikDinding = byName.get('Keramik Dinding 25x25')!;
check('Keramik dinding 25x25 TERISI 11,2 m2 ASSUMPTION + subtotal Rp2.184.000', keramikDinding.quantity === 11.2 && keramikDinding.subtotal === 2184000, `${keramikDinding.quantity}/${keramikDinding.subtotal}`);
const kaca = byName.get('Kaca Bening 5 mm')!;
check('Kaca 5mm TERISI 5,4 m2 ASSUMPTION + subtotal Rp1.539.000', kaca.quantity === 5.4 && kaca.subtotal === 1539000, `${kaca.quantity}/${kaca.subtotal}`);
const kusenJ = byName.get('Kusen Jendela Aluminium (J2, J3)')!;
check('Kusen jendela dari JADWAL: 3 unit ASSUMPTION + subtotal Rp4.350.000', kusenJ.quantity === 3 && kusenJ.quantitySource === 'ASSUMPTION' && kusenJ.subtotal === 4350000, `${kusenJ.quantity}/${kusenJ.subtotal}`);
const kusenP = byName.get('Kusen Pintu Aluminium (P1, P2)')!;
check('Kusen pintu dari JADWAL: 2 unit ASSUMPTION + subtotal Rp3.700.000', kusenP.quantity === 2 && kusenP.subtotal === 3700000, `${kusenP.quantity}/${kusenP.subtotal}`);
const pondasi = byName.get('Pondasi Batu Gunung')!;
check('Pondasi Batu Gunung (angka telanjang) TETAP Perlu Input', pondasi.quantity === null && pondasi.quantitySource === 'UNRESOLVED' && pondasi.subtotal === null);
const atap = byName.get('Atap Metal Spandek + Rangka Baja Ringan')!;
check('Atap Spandek (angka telanjang) TETAP Perlu Input', atap.quantity === null && atap.quantitySource === 'UNRESOLVED' && atap.subtotal === null);
const plafon = byName.get('Plafon Gypsum Rangka Hollow')!;
check('Plafon: kuantitas asumsi TERISI 64 m2, harga tanpa catatan dasar TIDAK ditempel (subtotal null)',
  plafon.quantity === 64 && plafon.quantitySource === 'ASSUMPTION' && plafon.unitPrice === null && plafon.priceSource === 'UNRESOLVED' && plafon.subtotal === null,
  `${plafon.quantity}/${plafon.unitPrice}/${plafon.priceSource}`);
check('TOTAL FULL_AI = Rp34.845.000 (7 item berdasar; plafon & 2 kontrol di luar total)',
  full.grandTotal === 34845000, `total=${full.grandTotal}`);
check('Coverage: 8 item berlabel ASSUMPTION terisi kuantitas (7 bersubtotal + plafon tanpa harga)',
  full.coverage.itemsWithAssumption === 8, `itemsWithAssumption=${full.coverage.itemsWithAssumption}`);

console.log('\n================ MODE DATABASE (perbandingan — perilaku ketat lama) ================');
const db = run('DATABASE');
const dbByName = new Map<string, DedAiItem>(db.items.map((i) => [i.name, i]));
for (const it of db.items) {
  console.log(`- ${it.name}: qty=${it.quantity ?? 'null'} [${it.quantitySource}] subtotal=${rp(it.subtotal)}`);
}
check('DATABASE: Sloof tetap UNRESOLVED (derivation terstruktur tidak mengisi di mode ketat)',
  dbByName.get('Sloof Beton Bertulang 15x20')!.quantity === null);
check('DATABASE: Kusen jadwal tetap UNRESOLVED', dbByName.get('Kusen Jendela Aluminium (J2, J3)')!.quantity === null);
check('DATABASE: Pondasi tetap AI_INFERENCE seperti perilaku lama', dbByName.get('Pondasi Batu Gunung')!.quantitySource === 'AI_INFERENCE');

console.log(`\n=== HASIL HARNESS: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

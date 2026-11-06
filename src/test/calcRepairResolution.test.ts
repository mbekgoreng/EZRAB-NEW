/**
 * Master Repair — regression suite Fase 11 (resolution service, canonical
 * identity, registry coverage, partial persistence, defaultUnitPrice guard).
 * Run: npx tsx src/test/calcRepairResolution.test.ts
 */
import { resolveComponentPrice, PROVENANCE_LABELS_ID } from '../engine/constructionCalculators/componentPriceResolution';
import { resolveCanonicalIdentity } from '../engine/constructionCalculators/canonicalResources';
import { ALL_CONSTRUCTION_CALCULATORS } from '../engine/constructionCalculators/registry';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${extra}`); }
}

console.log('== Service: regresi false positive Air ==');
{
  const r = resolveComponentPrice({ name: 'Air', quantity: 100, unit: 'liter', kind: 'MATERIAL' });
  check('Air (liter) TIDAK berharga', r.unitPrice === null, `got ${r.unitPrice}`);
  check('Air (liter) BUKAN harga pipa SN-005 (115000)', r.unitPrice !== 115000);
  check('Air status UNRESOLVED', r.status === 'UNRESOLVED', r.status);
}

console.log('== Service: alias semen → satu identitas pasar ==');
{
  const a = resolveComponentPrice({ name: 'Semen Portland (PC)', quantity: 10, unit: 'sak', kind: 'MATERIAL' });
  const b = resolveComponentPrice({ name: 'Semen Portland (50 kg)', quantity: 10, unit: 'sak', kind: 'MATERIAL' });
  check('Semen Portland (PC) → MARKET_REFERENCE', a.provenance === 'MARKET_REFERENCE', a.provenance);
  check('Semen Portland (PC) harga = SM-001 (68000)', a.unitPrice === 68000, `${a.unitPrice}`);
  check('Kedua varian nama → identitas & harga sama', a.resourceCode === b.resourceCode && a.unitPrice === b.unitPrice,
    `${a.resourceCode}/${b.resourceCode}`);
  check('Semen TIDAK dilabeli resmi', a.provenance !== 'OFFICIAL_AHSP_2026');
}

console.log('== Service: ready mix & pemisahan spek ==');
{
  const k250 = resolveComponentPrice({ name: 'Beton Struktur K-250 Manhole', quantity: 2, unit: 'm³', kind: 'MATERIAL' });
  check('K-250 Manhole berharga dari jalur resmi ATAU pasar SM-008',
    k250.unitPrice != null && k250.unitPrice > 0 &&
    (k250.provenance === 'OFFICIAL_AHSP_2026' || (k250.provenance === 'MARKET_REFERENCE' && k250.sourceReference === 'SM-008')),
    `${k250.unitPrice} ${k250.provenance} ${k250.sourceReference}`);
  const lean = resolveComponentPrice({ name: "Beton Kurus Lean Concrete Mutu B-0 / f'c 10 MPa (Lantai Kerja 5 cm)", quantity: 2, unit: 'm³', kind: 'MATERIAL' });
  check('Lean concrete B0 TIDAK memakai harga K-225 (900000)', lean.unitPrice !== 900000, `${lean.unitPrice}`);
  const bendrat = resolveComponentPrice({ name: 'Kawat beton: 1.2 mm', quantity: 5, unit: 'kg', kind: 'MATERIAL' });
  const bendrat2 = resolveComponentPrice({ name: 'Kawat Bendrat', quantity: 5, unit: 'kg', kind: 'MATERIAL' });
  check('Varian nama bendrat → identitas sama (WIRE_BENDRAT)',
    bendrat.resourceCode === 'WIRE_BENDRAT' && bendrat2.resourceCode === 'WIRE_BENDRAT',
    `${bendrat.resourceCode}/${bendrat2.resourceCode}`);
  const pasirBeton = resolveComponentPrice({ name: 'Pasir beton', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Pasir beton terklasifikasi dengan identitas SAND_CONCRETE', pasirBeton.resourceCode === 'SAND_CONCRETE', `${pasirBeton.resourceCode} ${pasirBeton.status}`);
  const wt = resolveComponentPrice({ name: 'Beton Kedap Air K-300 / Water Tight', quantity: 2, unit: 'm³', kind: 'MATERIAL' });
  check('Beton kedap air K-300 berharga dari varian WATERPROOF (1.000.000), BUKAN harga K-300 polos (1.001.900)', wt.unitPrice === 1000000 && wt.provenance === 'MARKET_REFERENCE', `${wt.unitPrice} ${wt.provenance}`);
  const k350 = resolveComponentPrice({ name: 'Beton Struktur K-350 / fc 30 MPa', quantity: 2, unit: 'm³', kind: 'MATERIAL' });
  check('K-350 teresolusi RESMI via CK (bukan diganti K-300, bukan pasar)',
    k350.unitPrice != null && k350.unitPrice > 0 && k350.provenance === 'OFFICIAL_AHSP_2026',
    `${k350.unitPrice} ${k350.status} ${k350.provenance}`);
}

console.log('== Service: gerbang satuan peralatan ==');
{
  const ptr = resolveComponentPrice({ name: 'Pneumatic Tire Roller (PTR 10 Ton)', quantity: 1, unit: 'sewa-hari', kind: 'EQUIPMENT' });
  check('PTR: record per JAM (EQ-017) tetap DITOLAK — harga datang dari tarif HARIAN riset putaran 3 (1.800.000), bukan konversi jam', ptr.status === 'RESOLVED' && ptr.unitPrice === 1800000 && ptr.provenance === 'MARKET_REFERENCE' && ptr.sourceReference !== 'EQ-017', `${ptr.status} ${ptr.unitPrice} ${ptr.sourceReference}`);
  const stamper = resolveComponentPrice({ name: 'Stamper Kodok / Plate Compactor (Pemadat Paving)', quantity: 1, unit: 'sewa-hari', kind: 'EQUIPMENT' });
  check('Stamper paving → MARKET_REFERENCE EQ-005 berharga', stamper.provenance === 'MARKET_REFERENCE' && stamper.sourceReference === 'EQ-005' && stamper.unitPrice != null && stamper.unitPrice > 0,
    `${stamper.provenance} ${stamper.sourceReference} ${stamper.unitPrice}`);
}

console.log('== Service: prioritas USER_PROVIDED & CALCULATOR_ESTIMATE ==');
{
  const u = resolveComponentPrice({ name: 'Semen Portland (PC)', quantity: 1, unit: 'sak', kind: 'MATERIAL', userPrice: 71500 });
  check('Harga user menang atas pasar', u.unitPrice === 71500 && u.provenance === 'USER_PROVIDED');
  const e = resolveComponentPrice({ name: 'Komponen Misterius Tanpa Record', quantity: 3, unit: 'unit', kind: 'MATERIAL', declaredEstimate: 12345 });
  check('Estimasi kalkulator dipakai & berlabel CALCULATOR_ESTIMATE', e.unitPrice === 12345 && e.provenance === 'CALCULATOR_ESTIMATE');
  const n = resolveComponentPrice({ name: 'Komponen Misterius Tanpa Record', quantity: 3, unit: 'unit', kind: 'MATERIAL' });
  check('Tanpa sumber apa pun → null UNRESOLVED', n.unitPrice === null && n.status === 'UNRESOLVED');
}

console.log('== Identitas: pasir tetap tiga komoditas ==');
{
  const beton = resolveCanonicalIdentity({ name: 'Pasir beton', unit: 'm³', category: 'MATERIAL' });
  const pasang = resolveCanonicalIdentity({ name: 'Pasir Pasang', unit: 'm³', category: 'MATERIAL' });
  const urug = resolveCanonicalIdentity({ name: 'Pasir uruk', unit: 'm³', category: 'MATERIAL' });
  check('Pasir beton/pasang/urug = 3 identitas berbeda',
    beton.kind === 'FOUND' && pasang.kind === 'FOUND' && urug.kind === 'FOUND' &&
    beton.resource.code !== pasang.resource.code && pasang.resource.code !== urug.resource.code);
  const unknown = resolveCanonicalIdentity({ name: 'Material Gaib 9000', unit: 'm³', category: 'MATERIAL' });
  check('Nama tak dikenal → NONE (bukan kandidat terdekat)', unknown.kind === 'NONE');
  const wrongCat = resolveCanonicalIdentity({ name: 'Pekerja', unit: 'OH', category: 'MATERIAL' });
  check('Kategori salah → NONE', wrongCat.kind === 'NONE');
}

console.log('== Remediasi riset 2026-11-06: provenance HSPK regional lengkap ==');
{
  const u = resolveComponentPrice({ name: 'U-Ditch Precast 40x40 cm (Panjang 1.20 m)', quantity: 1, unit: 'unit', kind: 'MATERIAL' });
  check('U-Ditch 40x40 → OFFICIAL_HSPK_REGIONAL (BUKAN AHSP nasional)', u.provenance === 'OFFICIAL_HSPK_REGIONAL', u.provenance);
  check('U-Ditch harga Perbup Pamekasan 480.000', u.unitPrice === 480000, `${u.unitPrice}`);
  check('U-Ditch regionalSource lengkap (penerbit/dokumen/wilayah/URL)',
    !!u.regionalSource && u.regionalSource.publisher.includes('Pamekasan') &&
    u.regionalSource.documentTitle.includes('25 Tahun 2026') &&
    u.regionalSource.provinceScope === 'Jawa Timur' &&
    u.regionalSource.url.startsWith('https://'),
    JSON.stringify(u.regionalSource?.publisher));
  check('U-Ditch tanpa provinsi proyek → asumsi wilayah DITANDAI', u.regionalPriceAssumption === true);
  check('Penjelasan U-Ditch menyebut HSPK + bukan AHSP nasional',
    /HSPK/.test(u.explanation) && /BUKAN harga resmi AHSP/.test(u.explanation));

  const abu = resolveComponentPrice({ name: 'Abu Batu Pengisi Celah (Joint Filler)', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Abu batu joint filler → HSPK Tegal 195.000', abu.unitPrice === 195000 && abu.provenance === 'OFFICIAL_HSPK_REGIONAL', `${abu.unitPrice} ${abu.provenance}`);
  const acwc = resolveComponentPrice({ name: 'Aspal Hotmix Laston Lapis Aus (AC-WC)', quantity: 1, unit: 'ton', kind: 'MATERIAL' });
  check('AC-WC per ton → MARKET_REFERENCE supplier Semarang 1.710.000', acwc.unitPrice === 1710000 && acwc.provenance === 'MARKET_REFERENCE', `${acwc.unitPrice} ${acwc.provenance}`);
  check('AC-WC atribusi pasar menyebut penerbit + tanggal berlaku',
    !!acwc.regionalSource && acwc.regionalSource.publisher.includes('Semarang') && acwc.regionalSource.documentDate.includes('2025'),
    JSON.stringify(acwc.regionalSource?.publisher));
  const wf = resolveComponentPrice({ name: 'Baja Profil WF 200x100x5.5x8 mm (21.3 kg/m)', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('WF generik HSPK 17.000 mengalahkan tautan pasar persis 15.500 (presedensi resmi-daerah > pasar)',
    wf.unitPrice === 17000 && wf.provenance === 'OFFICIAL_HSPK_REGIONAL', `${wf.unitPrice} ${wf.provenance}`);
  check('WF penjelasan jujur: generik, ukuran tidak dinyatakan sumber',
    /GENERIK/.test(wf.explanation), wf.explanation.slice(0, 120));
  const zin = resolveComponentPrice({ name: 'Cat Primer Antikarat Zinkromate / Epoxy Primer Baja', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Zincromate → HSPK 75.000 dengan batas spek disebut', zin.unitPrice === 75000 && /ZINCROMATE/.test(zin.explanation) && /epoxy/i.test(zin.explanation), `${zin.unitPrice}`);
}

console.log('== Coverage Completion §5: geografi praktis (lintas-wilayah TIDAK ditolak lagi) ==');
{
  // Kebijakan LAMA (putaran 1) menegaskan penolakan keras lintas provinsi;
  // perintah owner 2026-11-06 §5 menggantinya: harga wilayah lain dipakai
  // sebagai MARKET_REFERENCE lintas-wilayah bertanda crossRegion.
  const bali = resolveComponentPrice({ name: 'U-Ditch Precast 40x40 cm (Panjang 1.20 m)', quantity: 1, unit: 'unit', kind: 'MATERIAL', projectProvince: 'Bali' });
  check('U-Ditch untuk proyek Bali → TERESOLUSI lintas-wilayah 480.000 sebagai MARKET_REFERENCE (bukan HSPK lokal)',
    bali.unitPrice === 480000 && bali.provenance === 'MARKET_REFERENCE', `${bali.unitPrice} ${bali.provenance}`);
  check('Penanda lintas-wilayah terstruktur: crossRegion=true + sourceRegion=Jawa Timur',
    bali.crossRegion === true && bali.sourceRegion === 'Jawa Timur', `${bali.crossRegion} ${bali.sourceRegion}`);
  check('Catatan §9 tampil: berasal dari Jawa Timur, belum terverifikasi lokal Bali',
    /Harga referensi berasal dari Jawa Timur\. Belum diverifikasi sebagai harga lokal proyek Bali\./.test(bali.explanation), bali.explanation.slice(0, 200));
  const jatim = resolveComponentPrice({ name: 'U-Ditch Precast 40x40 cm (Panjang 1.20 m)', quantity: 1, unit: 'unit', kind: 'MATERIAL', projectProvince: 'Jawa Timur' });
  check('U-Ditch untuk proyek Jatim → HSPK lokal tanpa asumsi & tanpa crossRegion', jatim.unitPrice === 480000 && jatim.provenance === 'OFFICIAL_HSPK_REGIONAL' && jatim.regionalPriceAssumption === false && jatim.crossRegion === false, `${jatim.unitPrice} ${jatim.regionalPriceAssumption} ${jatim.crossRegion}`);
  const aanNtt = resolveComponentPrice({ name: 'Batu Belah Aanstamping (Batu Kosong)', quantity: 1, unit: 'm³', kind: 'MATERIAL', projectProvince: 'Nusa Tenggara Timur' });
  check('Aanstamping NTT → HSPK Sikka 200.300', aanNtt.unitPrice === 200300 && aanNtt.provenance === 'OFFICIAL_HSPK_REGIONAL', `${aanNtt.unitPrice} ${aanNtt.provenance}`);
  const aanBali = resolveComponentPrice({ name: 'Batu Belah Aanstamping (Batu Kosong)', quantity: 1, unit: 'm³', kind: 'MATERIAL', projectProvince: 'Bali' });
  check('Aanstamping Bali → lintas-wilayah 200.300 MARKET_REFERENCE (BUKAN pasir urug nasional, kelas diturunkan dari HSPK Sikka)',
    aanBali.unitPrice === 200300 && aanBali.provenance === 'MARKET_REFERENCE' && aanBali.crossRegion === true, `${aanBali.unitPrice} ${aanBali.provenance}`);
  const acwcJatim = resolveComponentPrice({ name: 'Aspal Hotmix Laston Lapis Aus (AC-WC)', quantity: 1, unit: 'ton', kind: 'MATERIAL', projectProvince: 'Jawa Timur' });
  check('AC-WC untuk proyek Jatim → lintas-wilayah Semarang 1.710.000 MARKET_REFERENCE bertanda',
    acwcJatim.unitPrice === 1710000 && acwcJatim.provenance === 'MARKET_REFERENCE' && acwcJatim.crossRegion === true && acwcJatim.sourceRegion === 'Jawa Tengah',
    `${acwcJatim.unitPrice} ${acwcJatim.provenance} ${acwcJatim.crossRegion}`);
  const acwcJateng = resolveComponentPrice({ name: 'Aspal Hotmix Laston Lapis Aus (AC-WC)', quantity: 1, unit: 'ton', kind: 'MATERIAL', projectProvince: 'Jawa Tengah' });
  check('AC-WC untuk proyek Jateng (provinsi sama) → pasar lokal tanpa crossRegion',
    acwcJateng.unitPrice === 1710000 && acwcJateng.crossRegion === false, `${acwcJateng.unitPrice} ${acwcJateng.crossRegion}`);
  const paku12 = resolveComponentPrice({ name: 'Paku 12 cm', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Paku 12 cm → identitas rentang NAIL_8_12CM, HSPK Gunungkidul 18.000 (bukan harga 4-inch terpisah)',
    paku12.resourceCode === 'NAIL_8_12CM' && paku12.unitPrice === 18000 && paku12.provenance === 'OFFICIAL_HSPK_REGIONAL',
    `${paku12.resourceCode} ${paku12.unitPrice} ${paku12.provenance}`);
  const paku4 = resolveComponentPrice({ name: 'Paku 4 inch', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Paku 4 inch tetap jalur nasional CK 19.000 (tidak diganti harga baru)', paku4.unitPrice === 19000 && paku4.provenance === 'OFFICIAL_AHSP_2026', `${paku4.unitPrice} ${paku4.provenance}`);
}

console.log('== Remediasi riset: kasus terlarang tetap unresolved ==');
{
  const girder = resolveComponentPrice({ name: 'Balok Girder Precast L=25m', quantity: 1, unit: 'buah', kind: 'MATERIAL' });
  check('Girder L=25m tetap UNRESOLVED (tidak diekstrapolasi)', girder.unitPrice === null, `${girder.unitPrice}`);
  const coverPlat = resolveComponentPrice({ name: 'Cover Plat Beton 80x60x10 cm', quantity: 1, unit: 'buah', kind: 'MATERIAL' });
  check('Cover plat 80x60x10 tetap UNRESOLVED (sumber hanya rentang)', coverPlat.unitPrice === null, `${coverPlat.unitPrice}`);
  const bjts = resolveComponentPrice({ name: 'Besi Tulangan Ulir BJTS-420B', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('BJTS tanpa diameter → basis per-kg distributor (10.400) sejak putaran 3; tetap TIDAK meminjam record D10/BJ-004', bjts.unitPrice === 10400 && bjts.sourceReference !== 'BJ-004', `${bjts.unitPrice} ${bjts.sourceReference}`);
  const splitGen = resolveComponentPrice({ name: 'Batu split', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Batu split generik → HSPK Surabaya "Batu Pecah Mesin 2/3" 275.000 (kebijakan putaran 2 menggantikan penahanan putaran 1; catatan ekuivalensi wajib ada)',
    splitGen.unitPrice === 275000 && splitGen.provenance === 'OFFICIAL_HSPK_REGIONAL' && /Batu Pecah Mesin/.test(splitGen.explanation),
    `${splitGen.unitPrice} ${splitGen.provenance}`);
  const ud60 = resolveComponentPrice({ name: 'U-Ditch Precast 60x60 cm (Panjang 1.20 m)', quantity: 1, unit: 'buah', kind: 'MATERIAL' });
  check('U-Ditch 60x60 tetap UNRESOLVED (tidak meminjam harga 40x40)', ud60.unitPrice === null, `${ud60.unitPrice}`);
  const bundel = resolveComponentPrice({ name: '[ALAT] Asphalt Finisher & Tandem Roller', quantity: 1, unit: 'sewa-hari', kind: 'EQUIPMENT' });
  check('Bundel finisher+tandem tetap UNRESOLVED (harga per alat tidak dipaksakan)', bundel.unitPrice === null, `${bundel.unitPrice}`);
  const k350nas = resolveComponentPrice({ name: 'Beton Struktur K-350 / fc 30 MPa', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('K-350 nasional TETAP resmi CK 1.001.900 (fallback HSPK tidak menimpa)',
    k350nas.unitPrice === 1001900 && k350nas.provenance === 'OFFICIAL_AHSP_2026', `${k350nas.unitPrice} ${k350nas.provenance}`);
  const pasirUrug = resolveComponentPrice({ name: 'Pasir Urug', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Pasir urug nasional TETAP 254.700 (anomali Cirebon 909.780 tidak dipakai)',
    pasirUrug.unitPrice === 254700 && pasirUrug.unitPrice !== 909780, `${pasirUrug.unitPrice}`);
  const pasirBetonKg = resolveComponentPrice({ name: 'Pasir beton', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Pasir beton per kg dihargai HANYA dari record per-kg resmi katalog sendiri (300, SE 47/2026) — BUKAN konversi m³ dan BUKAN HSPK Pamekasan 380',
    pasirBetonKg.unitPrice === 300 && pasirBetonKg.provenance === 'OFFICIAL_AHSP_2026' && pasirBetonKg.regionalSource == null,
    `${pasirBetonKg.unitPrice} ${pasirBetonKg.provenance} ${pasirBetonKg.status}`);
  const pasirBetonJabar = resolveComponentPrice({ name: 'Pasir beton', quantity: 1, unit: 'm³', kind: 'MATERIAL', projectProvince: 'Jawa Barat' });
  check('Pasir beton per m³ nasional TETAP 370.200 (HSPK Cirebon 301.000 tidak menimpa jalur nasional)',
    pasirBetonJabar.unitPrice === 370200 && pasirBetonJabar.provenance === 'OFFICIAL_AHSP_2026',
    `${pasirBetonJabar.unitPrice} ${pasirBetonJabar.provenance}`);
}

console.log('== Coverage Completion putaran 2: upah HSPK daerah ==');
{
  const tukang = resolveComponentPrice({ name: 'Tukang', quantity: 1, unit: 'OH', kind: 'LABOR' });
  check('Tukang generik → HSPK Surabaya 150.000 (tiga perdagangan tarif seragam)', tukang.unitPrice === 150000 && tukang.provenance === 'OFFICIAL_HSPK_REGIONAL' && tukang.resourceCode === 'LABOR_TUKANG_GENERIC', `${tukang.unitPrice} ${tukang.provenance} ${tukang.resourceCode}`);
  check('Tukang tanpa provinsi proyek → penanda asumsi wilayah aktif', tukang.regionalPriceAssumption === true);
  const besiKayu = resolveComponentPrice({ name: 'Tukang Besi & Kayu', quantity: 1, unit: 'OH', kind: 'LABOR' });
  check('Tukang Besi & Kayu → 150.000 (kedua perdagangan SAMA di sumber — bukan harga separuh bundel)', besiKayu.unitPrice === 150000 && besiKayu.provenance === 'OFFICIAL_HSPK_REGIONAL', `${besiKayu.unitPrice}`);
  const kayuAlu = resolveComponentPrice({ name: 'Tukang Kayu / Aluminium', quantity: 1, unit: 'OH', kind: 'LABOR' });
  check('Tukang Kayu/Aluminium → tarif Aluminium 175.000 dengan catatan kedua tarif', kayuAlu.unitPrice === 175000 && /Aluminium/.test(kayuAlu.explanation) && /150\.000/.test(kayuAlu.explanation), `${kayuAlu.unitPrice}`);
  const pekerjaJabar = resolveComponentPrice({ name: 'Pekerja', quantity: 1, unit: 'OH', kind: 'LABOR', projectProvince: 'Jawa Barat' });
  check('Pekerja proyek Jabar → HSPK Bandung 133.000 (provinsi sama menang atas Surabaya)',
    pekerjaJabar.unitPrice === 133000 && pekerjaJabar.provenance === 'OFFICIAL_HSPK_REGIONAL' && pekerjaJabar.crossRegion === false, `${pekerjaJabar.unitPrice} ${pekerjaJabar.provenance}`);
  const pekerjaJatim = resolveComponentPrice({ name: 'Pekerja', quantity: 1, unit: 'OH', kind: 'LABOR', projectProvince: 'Jawa Timur' });
  check('Pekerja proyek Jatim → HSPK Surabaya 150.000 (menggantikan katalog pasar Jabodetabek sesuai presedensi HSPK > pasar)',
    pekerjaJatim.unitPrice === 150000 && pekerjaJatim.provenance === 'OFFICIAL_HSPK_REGIONAL', `${pekerjaJatim.unitPrice} ${pekerjaJatim.provenance}`);
  const mandor = resolveComponentPrice({ name: 'Mandor', quantity: 1, unit: 'OH', kind: 'LABOR' });
  check('Mandor → daftar harga Surabaya 215.000 (konflik Kepwal 158.000 TIDAK dipakai/dirata-rata)',
    mandor.unitPrice === 215000 && mandor.unitPrice !== 158000 && /KONFLIK/.test(mandor.explanation), `${mandor.unitPrice}`);
  const fabrikasi = resolveComponentPrice({ name: 'Tukang Fabrikasi & Las Konstruksi Baja', quantity: 1, unit: 'OH', kind: 'LABOR' });
  check('Upah spesialisasi fabrikasi/las tetap UNRESOLVED (tarif Tukang generik TIDAK ditempelkan)', fabrikasi.unitPrice === null, `${fabrikasi.unitPrice}`);
}

console.log('== Coverage Completion putaran 2: besi beton per batang & konflik per kg ==');
{
  const u16 = resolveComponentPrice({ name: 'Besi utama, dia: 16 mm', quantity: 1, unit: 'batang', kind: 'MATERIAL' });
  check('Besi utama Ø16 → Jayasteel polos 161.950/batang MARKET_REFERENCE', u16.unitPrice === 161950 && u16.provenance === 'MARKET_REFERENCE', `${u16.unitPrice} ${u16.provenance}`);
  check('Provenance pasar lengkap (penerbit Jayasteel, tanggal 2026, VERIFIED_LIVE)',
    !!u16.regionalSource && u16.regionalSource.publisher.includes('Jayasteel') && u16.regionalSource.documentDate.includes('2026') && u16.priceConfidence === 'VERIFIED_LIVE');
  const a13 = resolveComponentPrice({ name: 'Besi alas, dia: 13 mm', quantity: 1, unit: 'batang', kind: 'MATERIAL' });
  check('Besi alas Ø13 → Jayasteel ULIR 107.500 (satu-satunya varian Ø13 di sumber, tercatat)', a13.unitPrice === 107500 && /ULIR/.test(a13.explanation), `${a13.unitPrice}`);
  const s10 = resolveComponentPrice({ name: 'Besi sengkang, dia: 10 mm', quantity: 1, unit: 'batang', kind: 'MATERIAL' });
  const d6 = resolveComponentPrice({ name: 'Besi diameter: 6 mm', quantity: 1, unit: 'batang', kind: 'MATERIAL' });
  check('Sengkang Ø10 → 63.300 & Ø6 → 23.550 per batang', s10.unitPrice === 63300 && d6.unitPrice === 23550, `${s10.unitPrice}/${d6.unitPrice}`);
  const kg12 = resolveComponentPrice({ name: 'Besi Tulangan Utama Ø12', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Besi tulangan utama Ø12 per kg → HSPK 13.500 MENANG atas pasar 8.550 (konflik tercatat, tidak dirata-rata)',
    kg12.unitPrice === 13500 && kg12.provenance === 'OFFICIAL_HSPK_REGIONAL' && /KONFLIK/.test(kg12.explanation), `${kg12.unitPrice} ${kg12.provenance}`);
}

console.log('== Coverage Completion putaran 2: pasar persis, ekuivalensi nama, supplier nasional ==');
{
  const kanal = resolveComponentPrice({ name: 'Kanal Baja Ringan C75.75 (Panjang 6 m)', quantity: 1, unit: 'batang', kind: 'MATERIAL', projectProvince: 'Jawa Timur' });
  check('Kanal C75.75 6 m → pasar nasional 128.000 (spek persis, tanpa crossRegion)', kanal.unitPrice === 128000 && kanal.provenance === 'MARKET_REFERENCE' && kanal.crossRegion === false, `${kanal.unitPrice} ${kanal.crossRegion}`);
  const reng = resolveComponentPrice({ name: 'Reng Baja Ringan U30 (Panjang 6 m)', quantity: 1, unit: 'batang', kind: 'MATERIAL' });
  check('Reng U30 → 40.000 dengan asumsi profil "Reng 30.45" dinyatakan', reng.unitPrice === 40000 && /Reng 30\.45/.test(reng.explanation), `${reng.unitPrice}`);
  const sds = resolveComponentPrice({ name: 'Self Drilling Screw / Baut Roofing', quantity: 1, unit: 'buah', kind: 'MATERIAL' });
  check('SDS roofing → 550/buah pasar', sds.unitPrice === 550 && sds.provenance === 'MARKET_REFERENCE', `${sds.unitPrice}`);
  const pvcBali = resolveComponentPrice({ name: 'Pipa PVC Tipe AW 3/4" (Panjang 4 m)', quantity: 1, unit: 'batang', kind: 'MATERIAL', projectProvince: 'Bali' });
  check('Pipa PVC AW 3/4" proyek Bali → manufacturer nasional Rucika 38.200 (mengalahkan HSPK lintas-wilayah; PPN dinyatakan)',
    pvcBali.unitPrice === 38200 && pvcBali.provenance === 'MARKET_REFERENCE' && /PPN/.test(pvcBali.explanation), `${pvcBali.unitPrice} ${pvcBali.provenance}`);
  const pvcJatim = resolveComponentPrice({ name: 'Pipa PVC Tipe AW 3/4" (Panjang 4 m)', quantity: 1, unit: 'batang', kind: 'MATERIAL', projectProvince: 'Jawa Timur' });
  check('Pipa PVC AW 3/4" proyek Jatim → HSPK Surabaya generik 37.000 (provinsi sama menang)',
    pvcJatim.unitPrice === 37000 && pvcJatim.provenance === 'OFFICIAL_HSPK_REGIONAL', `${pvcJatim.unitPrice} ${pvcJatim.provenance}`);
  const cutterJatim = resolveComponentPrice({ name: 'Concrete Cutter Machine (Pemotong Sambungan)', quantity: 1, unit: 'sewa-hari', kind: 'EQUIPMENT', projectProvince: 'Jawa Timur' });
  check('Concrete cutter proyek Jatim → sewa-hari Balikpapan 695.000 lintas-wilayah bertanda (bukan konversi jam)',
    cutterJatim.unitPrice === 695000 && cutterJatim.provenance === 'MARKET_REFERENCE' && cutterJatim.crossRegion === true && cutterJatim.sourceRegion === 'Kalimantan Timur',
    `${cutterJatim.unitPrice} ${cutterJatim.crossRegion} ${cutterJatim.sourceRegion}`);
}

console.log('== Coverage Completion putaran 2: material HSPK Surabaya & ekuivalensi bercatatan ==');
{
  const balok = resolveComponentPrice({ name: 'Kayu Balok 5/7 (Meranti/Borneo)', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Kayu Balok 5/7 Meranti → HSPK Surabaya 3.000.000/m³', balok.unitPrice === 3000000 && balok.provenance === 'OFFICIAL_HSPK_REGIONAL', `${balok.unitPrice}`);
  const papan = resolveComponentPrice({ name: 'Kayu Papan 3/20 (Meranti/Borneo)', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Kayu Papan 3/20 → 3.000.000 dengan ASUMSI 2/20 dinyatakan', papan.unitPrice === 3000000 && /ASUMSI/.test(papan.explanation), `${papan.unitPrice}`);
  const bek = resolveComponentPrice({ name: 'Papan Bekisting + Kayu Dolken Penyangga', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Papan Bekisting+Dolken → tarif Kayu Meranti Bekisting 3.000.000/m³ (dolken tidak digabung satuan)', bek.unitPrice === 3000000 && /Kayu Meranti Bekisting/.test(bek.explanation), `${bek.unitPrice}`);
  const ayak = resolveComponentPrice({ name: 'Pasir Pasang Ayak', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Pasir Pasang Ayak → HSPK Surabaya 160.000 (kata "Ayak" tak dinyatakan — tercatat)', ayak.unitPrice === 160000 && ayak.provenance === 'OFFICIAL_HSPK_REGIONAL', `${ayak.unitPrice}`);
  const ayakHalus = resolveComponentPrice({ name: 'Pasir Pasang Ayak Halus', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Pasir Pasang Ayak HALUS tetap UNRESOLVED (harga "halus" terpisah tidak ditemukan)', ayakHalus.unitPrice === null, `${ayakHalus.unitPrice}`);
  const grout = resolveComponentPrice({ name: 'Semen Warna / Tile Grout (Nat Keramik)', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Semen warna → HSPK Surabaya 16.067/kg', grout.unitPrice === 16067 && grout.provenance === 'OFFICIAL_HSPK_REGIONAL', `${grout.unitPrice}`);
  const kacaJatim = resolveComponentPrice({ name: 'Kaca Polos Tebal 5 mm', quantity: 1, unit: 'm²', kind: 'MATERIAL', projectProvince: 'Jawa Timur' });
  const kacaJabar = resolveComponentPrice({ name: 'Kaca Polos Tebal 5 mm', quantity: 1, unit: 'm²', kind: 'MATERIAL', projectProvince: 'Jawa Barat' });
  check('Kaca 5 mm: Jatim 87.000 vs Jabar 200.500 — provinsi menentukan, TIDAK dirata-rata',
    kacaJatim.unitPrice === 87000 && kacaJabar.unitPrice === 200500, `${kacaJatim.unitPrice}/${kacaJabar.unitPrice}`);
  const kusen = resolveComponentPrice({ name: 'Kusen Kayu Kamper / Aluminium 4 inch', quantity: 1, unit: "m'", kind: 'MATERIAL' });
  check('Kusen 4" → profil aluminium 145.000/m\' dengan batas varian dinyatakan', kusen.unitPrice === 145000 && /ALUMINIUM/.test(kusen.explanation) && /kamper/i.test(kusen.explanation), `${kusen.unitPrice}`);
  const nym = resolveComponentPrice({ name: 'Kabel NYM 3x2.5 mm² / 2x1.5 mm² Standar SNI', quantity: 1, unit: "m'", kind: 'MATERIAL' });
  check('Kabel NYM → 15.600/m\' untuk 3x2,5 dengan batas 2x1,5 dinyatakan', nym.unitPrice === 15600 && /2x1,5/.test(nym.explanation), `${nym.unitPrice}`);
}

console.log('== Coverage Completion putaran 2: INDEX_ONLY & sub-harga ketebalan ==');
{
  const lpa = resolveComponentPrice({ name: 'Lapis Pondasi Agregat Kelas A Standar Bina Marga', quantity: 1, unit: 'm³', kind: 'MATERIAL', projectProvince: 'Sumatera Barat' });
  check('LPA Kelas A → HSPK Pesisir Selatan 1.187.827 basis terpasang, flag INDEX_ONLY eksplisit',
    lpa.unitPrice === 1187827 && lpa.provenance === 'OFFICIAL_HSPK_REGIONAL' && lpa.priceConfidence === 'INDEX_ONLY' && /INDEX ONLY/.test(lpa.explanation) && /terpasang/.test(lpa.explanation),
    `${lpa.unitPrice} ${lpa.provenance} ${lpa.priceConfidence}`);
  const ud60 = resolveComponentPrice({ name: 'U-Ditch Precast 60x60x120 cm', quantity: 1, unit: 'buah', kind: 'MATERIAL' });
  check('U-Ditch 60×60×120 → pasar Jabodetabek 735.000 INDEX_ONLY terkoroborasi', ud60.unitPrice === 735000 && ud60.provenance === 'MARKET_REFERENCE' && ud60.priceConfidence === 'INDEX_ONLY', `${ud60.unitPrice} ${ud60.priceConfidence}`);
  const geo = resolveComponentPrice({ name: 'Geomembran HDPE Tebal 1.0 - 1.5 mm', quantity: 1, unit: 'm²', kind: 'MATERIAL' });
  check('Geomembran rentang 1,0–1,5 mm → sub-harga 1,0 mm 15.000 dipakai & sub-harga 1,5 mm (20.000) disebut — BUKAN angka gabungan',
    geo.unitPrice === 15000 && geo.provenance === 'MARKET_REFERENCE' && /20\.000/.test(geo.explanation), `${geo.unitPrice}`);
}

console.log('== Coverage Completion putaran 2 → Putaran 3: yang kini teresolusi bersumber (niat protektif lama dipertahankan) ==');
{
  const hollow = resolveComponentPrice({ name: 'Besi Hollow Galvanis 4x4 & 2x4 (Panjang 4 m)', quantity: 1, unit: 'batang', kind: 'MATERIAL' });
  check('Hollow bundel → JUMLAH terdokumentasi 27.000 (40×40) + 20.000 (20×40) = 47.000 dari SATU daftar supplier', hollow.unitPrice === 47000 && hollow.provenance === 'MARKET_REFERENCE' && /27\.000/.test(hollow.explanation) && /20\.000/.test(hollow.explanation), `${hollow.unitPrice}`);
  const box = resolveComponentPrice({ name: 'Box Panel MCB Presto + MCB Schneider', quantity: 1, unit: 'unit', kind: 'MATERIAL' });
  check('Box Panel + MCB tetap UNRESOLVED (jumlah MCB per box tak terdefinisi sumber mana pun — penjumlahan ditolak)', box.unitPrice === null, `${box.unitPrice}`);
  const kunci = resolveComponentPrice({ name: 'Kunci Tanam & Engsel Stainless Pintu', quantity: 1, unit: 'set', kind: 'MATERIAL' });
  check('Kunci Tanam & Engsel (set) tetap UNRESOLVED (bagian terpisah di SSH, komposisi set tak terdefinisi — tidak dijumlahkan)', kunci.unitPrice === null, `${kunci.unitPrice}`);
  const granit = resolveComponentPrice({ name: 'Homogeneous Tile / Granit 60x60 cm', quantity: 1, unit: 'dus', kind: 'MATERIAL' });
  check('Granit 60×60 per dus → SATU model bernama (Infiniti Rugao Grey) 174.990/dus, batas model dinyatakan', granit.unitPrice === 174990 && granit.provenance === 'MARKET_REFERENCE' && /RUGAO/i.test(granit.explanation), `${granit.unitPrice}`);
  const keramik = resolveComponentPrice({ name: 'Keramik Dinding 30x60 cm / Homogeneous Tile', quantity: 1, unit: 'dus', kind: 'MATERIAL' });
  check('Keramik dinding 30×60 per dus → SATU model bernama (Roman dWeave) 152.000/dus', keramik.unitPrice === 152000 && keramik.provenance === 'MARKET_REFERENCE' && /Roman/.test(keramik.explanation), `${keramik.unitPrice}`);
  const batuKali = resolveComponentPrice({ name: 'Pasangan Batu Kali 1:4', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Pasangan Batu Kali 1:4 → HSPK Sleman TA 2026 Rp1.178.070/m³ sebelum PPN (BUKAN dokumen 2017/blog)', batuKali.unitPrice === 1178070 && batuKali.provenance === 'OFFICIAL_HSPK_REGIONAL' && /Sleman/.test(batuKali.explanation), `${batuKali.unitPrice}`);
  const las = resolveComponentPrice({ name: 'Mesin Las Inverter 250A / 400A', quantity: 1, unit: 'sewa-hari', kind: 'EQUIPMENT' });
  check('Mesin las INVERTER tetap UNRESOLVED (yang ditemukan 250A DIESEL — kelas alat berbeda; ampere saja tidak cukup)', las.unitPrice === null, `${las.unitPrice}`);
  const craneBundel = resolveComponentPrice({ name: 'Mobile Crane / Chain Block Ereksi Baja', quantity: 1, unit: 'sewa-hari', kind: 'EQUIPMENT' });
  check('Bundel Mobile Crane/Chain Block tetap UNRESOLVED (kapasitas crane tak dinyatakan komponen; sumber chain block 2016 lemah)', craneBundel.unitPrice === null, `${craneBundel.unitPrice}`);
}

console.log('== Putaran 3: harga baru HSPK resmi (INDEX_ONLY — browser.open mati selama riset) ==');
{
  const urug = resolveComponentPrice({ name: 'Tanah Uruk Biasa / Peninggian Lantai', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Tanah Uruk (bahan) → SHS Gunungkidul 93.750/m³ HSPK, INDEX_ONLY jujur', urug.unitPrice === 93750 && urug.provenance === 'OFFICIAL_HSPK_REGIONAL' && urug.priceConfidence === 'INDEX_ONLY', `${urug.unitPrice} ${urug.priceConfidence}`);
  const pasirUrug = resolveComponentPrice({ name: 'Pasir Urug', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Tanah Uruk ≠ Pasir Urug (identitas & harga berbeda)', urug.resourceCode !== pasirUrug.resourceCode && pasirUrug.unitPrice === 254700, `${urug.resourceCode}/${pasirUrug.resourceCode}`);
  const kembali = resolveComponentPrice({ name: 'Tanah Timbunan Kembali Dipadatkan', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Urugan kembali → HSPK Bantul 74.400/m³', kembali.unitPrice === 74400 && kembali.provenance === 'OFFICIAL_HSPK_REGIONAL', `${kembali.unitPrice}`);
  const pilihan = resolveComponentPrice({ name: 'Timbunan Pilihan Berbutir (Selected Embankment)', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Timbunan pilihan (pekerjaan) → HSPK Sambas 315.146/m³', pilihan.unitPrice === 315146 && pilihan.provenance === 'OFFICIAL_HSPK_REGIONAL', `${pilihan.unitPrice}`);
  const revet = resolveComponentPrice({ name: 'Pasangan Batu Kali 1:4 Revetment', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Varian nama pasangan 1:4 (revetment) → harga & identitas sama', revet.unitPrice === 1178070 && revet.resourceCode === 'STONE_MASONRY_14', `${revet.unitPrice} ${revet.resourceCode}`);
  const siar = resolveComponentPrice({ name: 'Plesteran Dinding Siar 1:2', quantity: 1, unit: 'm²', kind: 'MATERIAL' });
  check('Siaran 1:2 → HSPK Gunungkidul SDA 50.957,27/m² (mortar tipe M = 1 PC : 2 PP)', siar.unitPrice === 50957.27 && siar.provenance === 'OFFICIAL_HSPK_REGIONAL', `${siar.unitPrice}`);
  const bedding = resolveComponentPrice({ name: 'Pasir Pasang Alas Bedding Saluran (Tebal 10 cm)', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Bedding saluran → Pasir Isi [SDA] Gunungkidul 143.000/m³', bedding.unitPrice === 143000 && bedding.provenance === 'OFFICIAL_HSPK_REGIONAL', `${bedding.unitPrice}`);
  const alasPaving = resolveComponentPrice({ name: 'Pasir Ekstra Beton / Pasir Pasang Alas Paving', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Alas paving → Pasir Pasang SSH Cianjur 250.000/m³', alasPaving.unitPrice === 250000 && alasPaving.provenance === 'OFFICIAL_HSPK_REGIONAL', `${alasPaving.unitPrice}`);
  const toe = resolveComponentPrice({ name: 'Batu Pecah / Gravel Porous Toe Drain', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Gravel toe drain → SHS Gunungkidul "Gravel" 351.600/m³', toe.unitPrice === 351600 && toe.provenance === 'OFFICIAL_HSPK_REGIONAL', `${toe.unitPrice}`);
  const pelat = resolveComponentPrice({ name: 'Pelat Baja Sambungan & Baseplate (BJ 37 / SS400)', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Pelat baja → SSH Makassar 16.800/kg HSPK + catatan keaslian salinan', pelat.unitPrice === 16800 && pelat.provenance === 'OFFICIAL_HSPK_REGIONAL' && /KEASLIAN SUMBER/.test(pelat.explanation), `${pelat.unitPrice}`);
}

console.log('== Putaran 3: geografi — HSPK DIY dipakai proyek Jatim = lintas-wilayah berlabel ==');
{
  const lokal = resolveComponentPrice({ name: 'Tanah Uruk Biasa / Peninggian Lantai', quantity: 1, unit: 'm³', kind: 'MATERIAL', projectProvince: 'DI Yogyakarta' });
  check('Proyek DIY → kelas HSPK asli, bukan lintas-wilayah', lokal.provenance === 'OFFICIAL_HSPK_REGIONAL' && lokal.crossRegion === false, `${lokal.provenance} ${lokal.crossRegion}`);
  const lintas = resolveComponentPrice({ name: 'Tanah Uruk Biasa / Peninggian Lantai', quantity: 1, unit: 'm³', kind: 'MATERIAL', projectProvince: 'Jawa Timur' });
  check('Proyek Jatim → MARKET_REFERENCE lintas-wilayah + catatan §9, harga sama (tanpa faktor karangan)', lintas.unitPrice === 93750 && lintas.provenance === 'MARKET_REFERENCE' && lintas.crossRegion === true && /Belum diverifikasi sebagai harga lokal/.test(lintas.explanation), `${lintas.unitPrice} ${lintas.provenance}`);
}

console.log('== Putaran 3: harga baru pasar & turunan terdokumentasi ==');
{
  const lasWire = resolveComponentPrice({ name: 'Kawat Las / Elektroda E7018 / E6013', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Kawat las → E6013 Nikko RD-460 42.433/kg pasar; E7018 dinyatakan belum berharga', lasWire.unitPrice === 42433 && lasWire.provenance === 'MARKET_REFERENCE' && /E7018/.test(lasWire.explanation), `${lasWire.unitPrice}`);
  const pintu = resolveComponentPrice({ name: 'Daun Pintu Solid Wood / Engineering Door', quantity: 1, unit: 'm²', kind: 'MATERIAL' });
  check('Daun pintu → panel kamper supplier 750.000/m²', pintu.unitPrice === 750000 && pintu.provenance === 'MARKET_REFERENCE', `${pintu.unitPrice}`);
  const genteng = resolveComponentPrice({ name: 'Genteng Metal Pasir / Genteng Beton', quantity: 1, unit: 'm²', kind: 'MATERIAL' });
  check('Genteng metal → turunan terdokumentasi 38.000 × 1,62 lembar/m² = 61.560/m²', genteng.unitPrice === 61560 && /1,62/.test(genteng.explanation), `${genteng.unitPrice}`);
  const plint = resolveComponentPrice({ name: 'Plint Granit 10x60 cm', quantity: 1, unit: "m'", kind: 'MATERIAL' });
  check('Plint granit → turunan 15.500/pcs ÷ 0,6 m = 25.833/m\'', plint.unitPrice === 25833 && plint.provenance === 'MARKET_REFERENCE', `${plint.unitPrice}`);
  const nat = resolveComponentPrice({ name: 'Semen Nat Anti Jamur', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  const natGenerik = resolveComponentPrice({ name: 'Semen Warna / Tile Grout (Nat Keramik)', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('Nat anti jamur → MU-408 58.889/kg, identitas BERBEDA dari nat generik (16.067)', nat.unitPrice === 58889 && nat.resourceCode === 'GROUT_ANTIFUNGAL' && natGenerik.unitPrice === 16067, `${nat.unitPrice}/${natGenerik.unitPrice}`);
  const catIn = resolveComponentPrice({ name: 'Cat Tembok Interior Standar Premium (Pail 20 kg)', quantity: 1, unit: 'pail', kind: 'MATERIAL' });
  check('Cat interior pail 20 kg → Dulux Easy Clean 3.174.000/pail (UNIT_MISMATCH lama tertutup tautan kemasan persis)', catIn.unitPrice === 3174000 && catIn.provenance === 'MARKET_REFERENCE' && catIn.status === 'RESOLVED', `${catIn.unitPrice} ${catIn.status}`);
  const catEx = resolveComponentPrice({ name: 'Cat Tembok Eksterior Weatherproof (Galon 2.5 Liter)', quantity: 1, unit: 'galon', kind: 'MATERIAL' });
  check('Cat eksterior galon 2,5 L → Nippon Weatherbond 336.000/galon', catEx.unitPrice === 336000 && catEx.provenance === 'MARKET_REFERENCE', `${catEx.unitPrice}`);
  const plamir = resolveComponentPrice({ name: 'Plamir Tembok Siap Pakai (Pail 20 kg)', quantity: 1, unit: 'pail', kind: 'MATERIAL' });
  check('Plamir pail 20 kg → Nippon Matex Putty 350.000/pail', plamir.unitPrice === 350000, `${plamir.unitPrice}`);
  const rolset = resolveComponentPrice({ name: 'Rol Cat, Kuas, Ampelas & Lakban Kertas', quantity: 1, unit: 'set', kind: 'MATERIAL' });
  check('Set alat cat → set supplier 7 pcs 45.500/set', rolset.unitPrice === 45500 && rolset.provenance === 'MARKET_REFERENCE', `${rolset.unitPrice}`);
  const kran = resolveComponentPrice({ name: 'Kran Dinding Stainless Steel 1/2 Inch', quantity: 1, unit: 'buah', kind: 'MATERIAL' });
  check('Kran dinding SS 1/2" → Waterplus SS-304 93.951/buah', kran.unitPrice === 93951, `${kran.unitPrice}`);
  const rcp = resolveComponentPrice({ name: 'Pipa Beton Bertulang RCP Dia 800 mm', quantity: 1, unit: 'm', kind: 'MATERIAL' });
  check('RCP Ø800 → turunan 1.270.000/pcs ÷ Leff 1,25 m = 1.016.000/m', rcp.unitPrice === 1016000 && /1,25/.test(rcp.explanation), `${rcp.unitPrice}`);
  const fs45 = resolveComponentPrice({ name: "Beton Ready Mix Rigid FS-45 / Mutu f'c 25 MPa (Tebal 15 cm)", quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('FS-45 → Niagara 1.400.000/m³ + peringatan FS-45 ≠ f\'c 25 pada penjelasan', fs45.unitPrice === 1400000 && fs45.provenance === 'MARKET_REFERENCE' && /TIDAK setara/.test(fs45.explanation), `${fs45.unitPrice}`);
  const wt350 = resolveComponentPrice({ name: 'Beton Kedap Air K-350 / fc 30 MPa Reservoir', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Beton kedap air K-350 → varian waterproof 1.050.000/m³ (bukan K-350 polos)', wt350.unitPrice === 1050000 && wt350.provenance === 'MARKET_REFERENCE', `${wt350.unitPrice}`);
  const ej = resolveComponentPrice({ name: 'Expansion Joint Tipe Asphaltic Plug / Baja Modular', quantity: 1, unit: 'm', kind: 'MATERIAL' });
  check('Expansion joint → asphaltic plug jurnal 2025 Rp2.170.500/m; baja modular dinyatakan berbeda', ej.unitPrice === 2170500 && /11\.450\.000/.test(ej.explanation), `${ej.unitPrice}`);
  const ccsp = resolveComponentPrice({ name: 'CCSP / Sheet Pile L=12m We=50cm', quantity: 1, unit: 'batang', kind: 'MATERIAL' });
  check('CCSP W500 L=12 → turunan 1.250.000/m × 12 m = 15.000.000/batang', ccsp.unitPrice === 15000000 && ccsp.provenance === 'MARKET_REFERENCE', `${ccsp.unitPrice}`);
  const galv = resolveComponentPrice({ name: 'Pipa Baja Galvanis Dia 3" Railing', quantity: 1, unit: 'm', kind: 'MATERIAL' });
  check('Pipa galvanis 3" → turunan 1.263.000/btg ÷ 6 m (dinyatakan sumber) = 210.500/m', galv.unitPrice === 210500 && /3,75 mm/.test(galv.explanation), `${galv.unitPrice}`);
  const hdpe400 = resolveComponentPrice({ name: 'Pipa Baja / HDPE Dia 400 mm Outlet', quantity: 1, unit: 'm', kind: 'MATERIAL' });
  check('HDPE Ø400 PN10 → Vinilon 1.810.000/m', hdpe400.unitPrice === 1810000, `${hdpe400.unitPrice}`);
  const nd150 = resolveComponentPrice({ name: 'Pipa Air Bersih HDPE/DIP/PVC ND 150 mm', quantity: 1, unit: 'm', kind: 'MATERIAL' });
  check('ND 150 → OD 160 PN10 215.700/m (konvensi ND dinyatakan)', nd150.unitPrice === 215700 && /OD 160/.test(nd150.explanation), `${nd150.unitPrice}`);
  const tangki = resolveComponentPrice({ name: 'Tangki Air Bersih Kapasitas 50 m³', quantity: 1, unit: 'unit', kind: 'MATERIAL' });
  check('Tangki FRP 50 m³ → listing unit persis 250.000.000 + konflik per-m³ dinyatakan', tangki.unitPrice === 250000000 && /KONFLIK/.test(tangki.explanation), `${tangki.unitPrice}`);
  const hatch = resolveComponentPrice({ name: 'Pintu Akses Stainless Steel (Manhole Hatch)', quantity: 1, unit: 'unit', kind: 'MATERIAL' });
  check('Manhole hatch SS → Serinox SS304 9.192.900/unit', hatch.unitPrice === 9192900, `${hatch.unitPrice}`);
  const bjts = resolveComponentPrice({ name: 'Besi Tulangan Ulir BJTS-420B', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  const bjts2 = resolveComponentPrice({ name: 'Baja Tulangan Sirip BJTS-420B', quantity: 1, unit: 'kg', kind: 'MATERIAL' });
  check('BJTS-420B tanpa diameter → basis per-kg distributor sendiri ±10.400/kg (BUKAN record satu diameter)', bjts.unitPrice === 10400 && bjts.provenance === 'MARKET_REFERENCE' && bjts.resourceCode === bjts2.resourceCode && bjts2.unitPrice === 10400, `${bjts.unitPrice}/${bjts2.unitPrice}`);
}

console.log('== Putaran 3: yang tetap DITOLAK (tanpa false positive baru) ==');
{
  const cases: Array<[string, string, 'MATERIAL' | 'LABOR' | 'EQUIPMENT']> = [
    ['Baut Mutu Tinggi HTB Grade A325 / Anchor Bolt', 'kg', 'MATERIAL'],
    ['Balok Girder Precast L=25m', 'buah', 'MATERIAL'],
    ['Cover Plat Beton 80x60x10 cm', 'buah', 'MATERIAL'],
    ['Tiang Pancang / Bored Pile Dia 800mm', 'm', 'MATERIAL'],
    ['Tiang Sandaran Railing Baja', 'buah', 'MATERIAL'],
    ['Kanstin Beton Pracetak 15x30x40 cm', "m'", 'MATERIAL'],
    ['Sekrup Gypsum & Cornice Compound', 'buah', 'MATERIAL'],
    ['Asphalt Finisher & Tandem Roller', 'sewa-hari', 'EQUIPMENT'],
    ['Concrete Paver / Concrete Vibrator Truss Screed', 'sewa-hari', 'EQUIPMENT'],
    ['Tripod Crane / Excavator Mini (Pemasang Precast)', 'sewa-hari', 'EQUIPMENT'],
    ['Lem Pipa PVC + Seal Tape', 'kaleng', 'MATERIAL'],
    ['Pipa Conduit Listrik PVC 20 mm + T-Dos', "m'", 'MATERIAL'],
    ['Fitting Sambungan PVC (Knee, Tee, Socket, Reducer)', 'buah', 'MATERIAL'],
    ['Plastik Cor Membran Pemisah (PE Sheet)', 'm²', 'MATERIAL'],
    ['Joint Sealant Aspal Sambungan Beton', "m'", 'MATERIAL'],
    ['Semen Mortar Pengisi Nat Sambungan U-Ditch', 'm³', 'MATERIAL'],
    ['Daun Jendela Ram Kayu / Aluminium', 'm²', 'MATERIAL'],
    ['Beton Struktur K-300 / K-350 Abutmen', 'm³', 'MATERIAL'],
    ['Beton Kedap Air K-300 / K-350 Admixture Waterproofing', 'm³', 'MATERIAL'],
    ['Tukang Fabrikasi & Las Konstruksi Baja', 'OH', 'LABOR'],
    ['Pekerja Konstruksi Baja / Rigger', 'OH', 'LABOR'],
    ['Mandor Ereksi Struktur', 'OH', 'LABOR'],
    ['Bekisting Kayu / Baja Jembatan', 'm²', 'MATERIAL'],
    ['Tanah Lempung Kedap Air Terpilih', 'm³', 'MATERIAL'],
    ['Pasir Pasang Ayak Halus', 'm³', 'MATERIAL'],
  ];
  for (const [name, unit, kind] of cases) {
    const r = resolveComponentPrice({ name, quantity: 1, unit, kind });
    check(`Tetap UNRESOLVED: ${name}`, r.unitPrice === null, `${r.unitPrice} ${r.provenance}`);
  }
}

console.log('== Coverage Completion §9: label Bahasa Indonesia per kelas provenance ==');
{
  check('Label OFFICIAL_AHSP_2026 = "Harga AHSP Nasional"', PROVENANCE_LABELS_ID.OFFICIAL_AHSP_2026 === 'Harga AHSP Nasional');
  check('Label OFFICIAL_HSPK_REGIONAL = "Harga HSPK Daerah"', PROVENANCE_LABELS_ID.OFFICIAL_HSPK_REGIONAL === 'Harga HSPK Daerah');
  check('Label MARKET_REFERENCE = "Referensi Harga Pasar"', PROVENANCE_LABELS_ID.MARKET_REFERENCE === 'Referensi Harga Pasar');
  check('Label CALCULATOR_ESTIMATE = "Estimasi Kalkulator"', PROVENANCE_LABELS_ID.CALCULATOR_ESTIMATE === 'Estimasi Kalkulator');
  check('Label USER_PROVIDED = "Harga Manual Proyek"', PROVENANCE_LABELS_ID.USER_PROVIDED === 'Harga Manual Proyek');
  check('Label UNRESOLVED = "Harga Belum Tersedia"', PROVENANCE_LABELS_ID.UNRESOLVED === 'Harga Belum Tersedia');
}

console.log('== Fase 9: persistensi status parsial di factory RAB ==');
{
  const item: any = createRabItemRecord({
    description: 'Item Parsial Uji',
    unit: 'm³',
    volume: 1,
    unitPrice: 500000,
    isPartial: true,
    unresolvedComponentCount: 3,
    priceValidationWarnings: ['3 komponen belum berharga'],
  } as any, 'PRJ-TEST');
  check('isPartial tersimpan di record RAB', item.isPartial === true, JSON.stringify(item.isPartial));
  check('unresolvedComponentCount tersimpan', item.unresolvedComponentCount === 3);
  check('priceValidationWarnings tersimpan', Array.isArray(item.priceValidationWarnings) && item.priceValidationWarnings.length === 1);
}

console.log('== Fase 8: guard defaultUnitPrice ==');
{
  const offenders = ALL_CONSTRUCTION_CALCULATORS.filter((s: any) => 'defaultUnitPrice' in s);
  check('Tidak ada spec dengan defaultUnitPrice', offenders.length === 0, offenders.map((s) => s.id).join(','));
}

console.log('== Fase 10/11: cakupan registry — semua kalkulator jalan & terklasifikasi ==');
{
  check('Registry memuat 190 kalkulator', ALL_CONSTRUCTION_CALCULATORS.length === 190, `${ALL_CONSTRUCTION_CALCULATORS.length}`);
  let executed = 0;
  let crashed = 0;
  const seen = new Map<string, { status: string; provenance: string }>();
  for (const spec of ALL_CONSTRUCTION_CALCULATORS) {
    const inputs: Record<string, number> = {};
    for (const p of (spec as any).parameters ?? (spec as any).inputs ?? []) {
      if (typeof p.defaultValue === 'number') inputs[p.id ?? p.key] = p.defaultValue;
    }
    let result: any;
    try {
      result = spec.calculate(inputs);
      executed += 1;
    } catch {
      crashed += 1;
      continue;
    }
    const rows: Array<{ name: string; qty: number; unit: string; cat: 'MATERIAL' | 'LABOR' | 'EQUIPMENT'; code?: string; est?: number }> = [
      ...(result.materials ?? []).map((m: any) => ({ name: m.name, qty: m.quantity, unit: m.unit, cat: 'MATERIAL' as const, code: m.resourceCode, est: m.unitPriceEstimate })),
      ...(result.labor ?? []).map((l: any) => ({ name: l.role, qty: l.hoursOrDays, unit: l.unit || 'OH', cat: 'LABOR' as const, code: l.resourceCode, est: l.rateEstimate })),
      ...(result.equipment ?? []).map((e: any) => ({ name: e.name, qty: e.quantity, unit: e.unit, cat: 'EQUIPMENT' as const, code: e.resourceCode, est: e.unitPriceEstimate })),
    ];
    for (const row of rows) {
      const key = `${row.name}|${row.unit}|${row.cat}`;
      if (seen.has(key)) continue;
      const r = resolveComponentPrice({ name: row.name, quantity: row.qty, unit: row.unit, kind: row.cat, resourceCode: row.code, declaredEstimate: row.est });
      seen.set(key, { status: r.status, provenance: r.provenance });
    }
  }
  check('Semua kalkulator tereksekusi tanpa crash', crashed === 0, `crashed=${crashed}`);
  check('Eksekusi = 190', executed === 190, `${executed}`);
  const statuses = [...seen.values()];
  const resolved = statuses.filter((s) => s.provenance === 'OFFICIAL_AHSP_2026' || s.provenance === 'OFFICIAL_HSPK_REGIONAL' || s.provenance === 'MARKET_REFERENCE').length;
  const estimates = statuses.filter((s) => s.provenance === 'CALCULATOR_ESTIMATE').length;
  const unresolved = statuses.filter((s) => s.provenance === 'UNRESOLVED').length;
  console.log(`  [probe] komponen unik=${seen.size} resolved(official+hspk+market)=${resolved} estimate=${estimates} unresolved=${unresolved}`);
  check('Setiap komponen unik terklasifikasi', resolved + estimates + unresolved === seen.size);
}

console.log(`\nRESOLUTION SUITE: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

/**
 * PRICE INTEGRITY GATE — suite regresi (audit 2026-11-06)
 * =========================================================
 * Memverifikasi independen kontrak Master Price Integrity Gate:
 * §2 sinkron parsial QTO→RAB (di level kontrak data yang dipakai gerbang
 *    UI + factory + clone + serialisasi), §3 provenance ujung-ke-ujung,
 * §4 ekuivalensi risiko tinggi (Surabaya/Scribd, Pesisir Selatan,
 *    bekisting+dolken, asumsi terbatas), §5 matriks geografi,
 * §6 integritas ekspor (Excel/PDF/summary).
 * Run: npx tsx src/test/priceIntegrityGate.test.ts
 *
 * Catatan cakupan jujur: gerbang UI handleSyncToRAB hidup di komponen
 * React (tidak dapat diimpor di sini); suite ini membuktikan kontrak
 * datanya — status agregat resolver, persistensi factory, clone proyek,
 * dan gerbang ekspor — yang menjadi prasyarat gerbang UI tersebut.
 */
import {
  resolveComponentPrice,
  summarizeComponentPrices,
  crossRegionNoteId,
  PROVENANCE_LABELS_ID,
  type ComponentPriceResult,
} from '../engine/constructionCalculators/componentPriceResolution';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { cloneProjectItems } from '../lib/projectClone';
import { resolveQtoSyncPrice } from '../lib/qtoSyncPricing';
import {
  summarizeExportItems,
  exportItemAmount,
  exportTotalNote,
} from '../export/priceIntegrity';
import { buildExcelSourceText } from '../export/excelExportEngine';
import { buildPdfSourceAnnotations } from '../export/pdfExporter';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${extra}`); }
}

const K350 = { name: 'Beton Struktur K-350 / fc 30 MPa', quantity: 2, unit: 'm³', kind: 'MATERIAL' as const };
// PUTARAN 3: 'Pasangan Batu Kali 1:4' & bundel hollow KINI berharga bersumber,
// jadi contoh unresolved diganti komponen yang tetap tanpa sumber sah:
// girder L=25m (USER_PRICE_REQUIRED) & cover plat 80x60x10 (spek tak terkonfirmasi).
const UNRESOLVED_EXEMPLAR = { name: 'Balok Girder Precast L=25m', quantity: 1, unit: 'buah', kind: 'MATERIAL' as const };
const UNRESOLVED_EXEMPLAR_2 = { name: 'Cover Plat Beton 80x60x10 cm', quantity: 1, unit: 'buah', kind: 'MATERIAL' as const };

console.log('== §2 kasus 1: rincian LENGKAP → status RESOLVED (satu-satunya jalur harga campuran boleh dibuat) ==');
{
  const rows: ComponentPriceResult[] = [resolveComponentPrice(K350), resolveComponentPrice({ name: 'Semen Portland (PC)', quantity: 10, unit: 'sak', kind: 'MATERIAL' })];
  const s = summarizeComponentPrices(rows);
  check('Semua komponen berharga', rows.every((r) => r.unitPrice != null), rows.map((r) => `${r.description}=${r.unitPrice}`).join(','));
  check('Status agregat RESOLVED', s.status === 'RESOLVED', s.status);
  check('unresolvedCount = 0', s.unresolvedCount === 0);
  check('grandTotal = jumlah subtotal nyata', s.grandTotal === rows.reduce((a, r) => a + (r.subtotal ?? 0), 0));
}

console.log('== §2 kasus 2: rincian SEBAGIAN → INCOMPLETE; identitas unresolved bertahan; null bukan 0 ==');
{
  const rows: ComponentPriceResult[] = [resolveComponentPrice(K350), resolveComponentPrice(UNRESOLVED_EXEMPLAR)];
  const s = summarizeComponentPrices(rows);
  check('Status agregat INCOMPLETE', s.status === 'INCOMPLETE', s.status);
  check('unresolvedCount = 1', s.unresolvedCount === 1, `${s.unresolvedCount}`);
  const un = rows.find((r) => r.unitPrice == null);
  check('Baris unresolved tetap ada (tidak hilang)', !!un && un.description === UNRESOLVED_EXEMPLAR.name);
  check('unitPrice unresolved === null (BUKAN 0)', un?.unitPrice === null, `${un?.unitPrice}`);
  check('subtotal unresolved === null (BUKAN 0)', un?.subtotal === null, `${un?.subtotal}`);
  check('provenance unresolved = UNRESOLVED + alasan terstruktur ada', un?.provenance === 'UNRESOLVED' && un?.missingReason != null);
  check('grandTotal parsial = subtotal komponen berharga SAJA', s.grandTotal === (rows[0].subtotal ?? -1), `${s.grandTotal}`);
}

console.log('== §2 kasus 3: SEMUA unresolved → UNRESOLVED, total 0 dari nol harga (bukan harga Rp0) ==');
{
  const rows: ComponentPriceResult[] = [resolveComponentPrice(UNRESOLVED_EXEMPLAR), resolveComponentPrice(UNRESOLVED_EXEMPLAR_2)];
  const s = summarizeComponentPrices(rows);
  check('Status agregat UNRESOLVED', s.status === 'UNRESOLVED', s.status);
  check('Semua unitPrice null', rows.every((r) => r.unitPrice === null));
  check('resolvedCount = 0', s.resolvedCount === 0);
}

console.log('== §2 kasus 4: UNIT_MISMATCH tidak pernah dihargai ==');
{
  const wp = resolveComponentPrice({ name: 'Waterproofing Cementitious / Epoxy Food Grade', quantity: 1, unit: 'm²', kind: 'MATERIAL' });
  check('Waterproofing aplikasi m² vs record per set → unitPrice null', wp.unitPrice === null, `${wp.unitPrice}`);
  check('Waterproofing status/missingReason menandai UNIT_MISMATCH', wp.status === 'UNIT_MISMATCH' || wp.missingReason === 'UNIT_MISMATCH', `${wp.status}/${wp.missingReason}`);
  // PUTARAN 3: dua kasus UNIT_MISMATCH lama tertutup oleh sumber SATUAN PERSIS
  // (bukan konversi diam-diam): tarif HARIAN PTR & kemasan pail 20 kg persis.
  const ptr = resolveComponentPrice({ name: 'Pneumatic Tire Roller (PTR 10 Ton)', quantity: 1, unit: 'sewa-hari', kind: 'EQUIPMENT' });
  check('PTR 10 Ton → tarif harian riset 1.800.000 (record per jam tetap tidak dipakai)', ptr.unitPrice === 1800000 && ptr.sourceReference !== 'EQ-017', `${ptr.unitPrice}`);
  const cat = resolveComponentPrice({ name: 'Cat Tembok Interior Standar Premium (Pail 20 kg)', quantity: 1, unit: 'pail', kind: 'MATERIAL' });
  check('Cat pail 20 kg → harga kemasan persis 3.174.000/pail (bukan konversi dari record per kg)', cat.unitPrice === 3174000 && cat.sourceReference !== 'CT-001', `${cat.unitPrice}`);
}

console.log('== §2 kasus 5+6: lintas-wilayah & INDEX_ONLY bertahan lewat persistensi factory + clone + serialisasi ==');
{
  const note = crossRegionNoteId('Jawa Timur', 'Bali');
  check('Format catatan §9 persis', note === 'Harga referensi berasal dari Jawa Timur. Belum diverifikasi sebagai harga lokal proyek Bali.', note);
  const item: any = createRabItemRecord({
    description: 'Item Sinkron Uji',
    unit: 'm³',
    volume: 2,
    unitPrice: 500000,
    isPartial: false,
    unresolvedComponentCount: 0,
    priceValidationWarnings: [note, 'Sumber INDEX ONLY (keyakinan lebih rendah): Lapis Pondasi Agregat Kelas A — HSPK.'],
  } as any, 'PRJ-GATE');
  check('Factory meneruskan unresolvedComponentCount = 0 secara eksplisit', item.unresolvedComponentCount === 0, `${item.unresolvedComponentCount}`);
  check('Factory meneruskan priceValidationWarnings (lintas-wilayah + INDEX_ONLY)', Array.isArray(item.priceValidationWarnings) && item.priceValidationWarnings.length === 2);
  check('Item lengkap TIDAK ditandai parsial', item.isPartial !== true);
  const it2: any = createRabItemRecord({ description: 'X', unit: 'm³', volume: 1, unitPrice: 1000, qtoItemId: 'QTO-1', calculationRunId: 'CALC-1', calculatorId: 'BALOK' } as any, 'PRJ-GATE');
  check('Factory mempertahankan identitas sumber kalkulator/QTO (qtoItemId/calculationRunId/calculatorId)',
    it2.qtoItemId === 'QTO-1' && it2.calculationRunId === 'CALC-1' && it2.calculatorId === 'BALOK',
    JSON.stringify({ q: it2.qtoItemId, r: it2.calculationRunId, c: it2.calculatorId }));
  const cloned = cloneProjectItems(
    { rabItems: [item], qtoItems: [], mappings: [] } as any,
    'PRJ-GATE',
    'PRJ-GATE-2',
    (kind, _old, idx) => `${kind}-copy-${idx}`,
  );
  const c0: any = cloned.rabItems[0];
  check('Clone proyek mempertahankan warnings + unresolvedComponentCount', !!c0 && c0.priceValidationWarnings?.length === 2 && c0.unresolvedComponentCount === 0);
  const roundTrip: any = JSON.parse(JSON.stringify(item));
  check('Serialisasi simpan/muat (JSON) mempertahankan warnings', roundTrip.priceValidationWarnings?.length === 2);
  const partial: any = createRabItemRecord({
    description: 'Item Parsial Uji', unit: 'm³', volume: 1, unitPrice: 500000,
    isPartial: true, unresolvedComponentCount: 3, priceValidationWarnings: ['3 komponen belum berharga'],
  } as any, 'PRJ-GATE');
  const clonedPartial = cloneProjectItems({ rabItems: [partial], qtoItems: [], mappings: [] } as any, 'PRJ-GATE', 'PRJ-GATE-2', (kind, _o, idx) => `${kind}-copy-${idx}`);
  const cp: any = clonedPartial.rabItems[0];
  check('Item parsial: isPartial + jumlah unresolved bertahan di factory DAN clone', partial.isPartial === true && partial.unresolvedComponentCount === 3 && cp?.isPartial === true && cp?.unresolvedComponentCount === 3);
}

console.log('== §2 kasus 7: harga manual tetap teridentifikasi manual ==');
{
  const manual = resolveComponentPrice({ name: 'Semen Portland (PC)', quantity: 1, unit: 'sak', kind: 'MATERIAL', userPrice: 777000 });
  check('userPrice → USER_PROVIDED (bukan resmi/pasar)', manual.provenance === 'USER_PROVIDED', manual.provenance);
  check('Label manual = "Harga Manual Proyek"', PROVENANCE_LABELS_ID[manual.provenance] === 'Harga Manual Proyek');
  check('Harga manual dipakai apa adanya', manual.unitPrice === 777000);
  const syncPrice = resolveQtoSyncPrice(50000);
  check('resolveQtoSyncPrice(50000) → ada harga; tanpa harga → PRICE_UNRESOLVED (tidak mengarang)', syncPrice.unitPrice === 50000 && resolveQtoSyncPrice(undefined).priceStatus === 'PRICE_UNRESOLVED');
  const excelManual = buildExcelSourceText({ priceStatus: 'PRICE_MANUAL', priceSourceKind: 'MARKET_REFERENCE' });
  check('Excel: PRICE_MANUAL tampil "INPUT MANUAL" (mengalahkan label sumber lain)', excelManual.startsWith('INPUT MANUAL'), excelManual);
  check('PDF: PRICE_MANUAL beranotasi INPUT MANUAL', buildPdfSourceAnnotations({ priceStatus: 'PRICE_MANUAL' }).includes('INPUT MANUAL'));
}

console.log('== §3/§6 ekspor: parsial dilabeli, unresolved tidak jadi 0, pasar tidak jadi resmi ==');
{
  const items = [
    { volume: 2, unit: 'm³', unitPrice: 1001900, totalPrice: 2003800, amount: 2003800, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' },
    { volume: 1, unit: 'm³', unitPrice: 0, totalPrice: 999999, amount: 0, priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'UNRESOLVED' },
  ];
  const s = summarizeExportItems(items as any);
  check('Item UNRESOLVED (walau totalPrice basi 999.999) TIDAK dihitung', s.unpricedCount === 1 && s.pricedTotal === 2003800, `${s.unpricedCount}/${s.pricedTotal}`);
  check('Ringkasan ekspor isPartial = true', s.isPartial === true);
  check('exportItemAmount(unresolved) = null (bukan 0)', exportItemAmount(items[1] as any) === null);
  check('Catatan total ekspor menyebut TOTAL PARSIAL', exportTotalNote(s).includes('TOTAL PARSIAL'), exportTotalNote(s));
  const complete = summarizeExportItems([items[0]] as any);
  check('Himpunan lengkap → isPartial = false', complete.isPartial === false);
  check('Excel: MARKET_REFERENCE tampil "REFERENSI PASAR" (bukan AHSP resmi)', buildExcelSourceText({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' }).startsWith('REFERENSI PASAR'));
  check('Excel: UNRESOLVED tampil "HARGA BELUM TERSEDIA"', buildExcelSourceText({ priceStatus: 'PRICE_UNRESOLVED', priceSourceKind: 'UNRESOLVED' }).startsWith('HARGA BELUM TERSEDIA'));
  check('PDF: UNRESOLVED beranotasi "Harga belum tersedia — bukan Rp0"', buildPdfSourceAnnotations({ priceStatus: 'PRICE_UNRESOLVED' }).includes('Harga belum tersedia — bukan Rp0'));
  const warnItem = { priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE', priceValidationWarnings: ['Harga referensi berasal dari Jawa Timur. Belum diverifikasi sebagai harga lokal proyek Bali.'] };
  check('Excel: peringatan lintas-wilayah tersimpan ikut tampil di kolom Sumber', buildExcelSourceText(warnItem).includes('PERINGATAN') && buildExcelSourceText(warnItem).includes('Belum diverifikasi sebagai harga lokal proyek Bali'));
  check('PDF: peringatan lintas-wilayah tersimpan ikut tampil sebagai anotasi', buildPdfSourceAnnotations(warnItem).includes('PERINGATAN HARGA') && buildPdfSourceAnnotations(warnItem).includes('Belum diverifikasi sebagai harga lokal proyek Bali'));
  check('Ekspor tanpa peringatan tersimpan: teks sumber tidak berubah', buildExcelSourceText({ priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' }) === 'REFERENSI PASAR');
}

console.log('== §5 matriks geografi (baris yang belum ter-cover suite resolusi) ==');
{
  const cross = resolveComponentPrice({ name: 'U-Ditch Precast 40x40 cm (Panjang 1.20 m)', quantity: 1, unit: 'unit', kind: 'MATERIAL', projectProvince: 'Bali' });
  check('Lintas-provinsi: regionalRejected tetap deprecated (null/tidak terisi)', cross.regionalRejected == null, JSON.stringify(cross.regionalRejected));
  check('Lintas-provinsi: sourceRegion tidak terhapus', cross.sourceRegion === 'Jawa Timur');
  check('Lintas-provinsi: catatan §9 ada DI PENJELASAN resolver', cross.explanation.includes('Harga referensi berasal dari Jawa Timur. Belum diverifikasi sebagai harga lokal proyek Bali.'));
  const rucika = resolveComponentPrice({ name: 'Pipa PVC Tipe AW 3/4" (Panjang 4 m)', quantity: 1, unit: 'batang', kind: 'MATERIAL', projectProvince: 'Bali' });
  check('Manufacturer nasional: MARKET_REFERENCE tanpa crossRegion untuk provinsi mana pun', rucika.provenance === 'MARKET_REFERENCE' && rucika.crossRegion === false, `${rucika.provenance}/${rucika.crossRegion}`);
  check('Manufacturer nasional: taxNote PPN diteruskan ke penjelasan', /PPN/.test(rucika.explanation));
  const lpaCross = resolveComponentPrice({ name: 'Lapis Pondasi Agregat Kelas A Standar Bina Marga', quantity: 1, unit: 'm³', kind: 'MATERIAL', resourceCode: 'LPA_CLASS_A', projectProvince: 'Bali' });
  check('INDEX_ONLY lintas-wilayah: kelas turun ke MARKET_REFERENCE tetapi confidence INDEX_ONLY tetap terbedakan',
    lpaCross.provenance === 'MARKET_REFERENCE' && lpaCross.crossRegion === true && lpaCross.priceConfidence === 'INDEX_ONLY',
    `${lpaCross.provenance}/${lpaCross.crossRegion}/${lpaCross.priceConfidence}`);
}

console.log('== §4A Surabaya/Scribd: keterbatasan keaslian dinyatakan eksplisit ==');
{
  const tukang = resolveComponentPrice({ name: 'Tukang', quantity: 1, unit: 'OH', kind: 'LABOR' });
  check('Sumber Surabaya memang Scribd', !!tukang.regionalSource && tukang.regionalSource.url.includes('scribd.com'), tukang.regionalSource?.url);
  check('Penjelasan memuat CATATAN KEASLIAN SUMBER (Scribd ≠ bukti dokumen primer)', tukang.explanation.includes('CATATAN KEASLIAN SUMBER') && tukang.explanation.includes('Scribd'), tukang.explanation.slice(0, 160));
  check('confidence tetap VERIFIED_LIVE (definisi = halaman dibuka; BUKAN klaim keaslian)', tukang.priceConfidence === 'VERIFIED_LIVE', `${tukang.priceConfidence}`);
  const uditch = resolveComponentPrice({ name: 'U-Ditch Precast 40x40 cm (Panjang 1.20 m)', quantity: 1, unit: 'unit', kind: 'MATERIAL' });
  check('Sumber resmi ber-nomor peraturan (Pamekasan) TIDAK memikul catatan keaslian Scribd', !uditch.explanation.includes('CATATAN KEASLIAN SUMBER'));
}

console.log('== §4B Pesisir Selatan: HSPK daerah via jurnal, INDEX_ONLY, basis terpasang — tidak dipromosikan ==');
{
  const lpa = resolveComponentPrice({ name: 'Lapis Pondasi Agregat Kelas A Standar Bina Marga', quantity: 1, unit: 'm³', kind: 'MATERIAL', resourceCode: 'LPA_CLASS_A', projectProvince: 'Sumatera Barat' });
  check('LPA provinsi sama → OFFICIAL_HSPK_REGIONAL (BUKAN AHSP nasional)', lpa.provenance === 'OFFICIAL_HSPK_REGIONAL', lpa.provenance);
  check('LPA confidence INDEX_ONLY (bukan VERIFIED_LIVE)', lpa.priceConfidence === 'INDEX_ONLY', `${lpa.priceConfidence}`);
  check('LPA penjelasan menyebut INDEX ONLY + basis terpasang + reproduksi jurnal', /INDEX ONLY/.test(lpa.explanation) && /terpasang/i.test(lpa.explanation), lpa.explanation.slice(0, 200));
  check('LPA harga 1.187.827 tidak berubah', lpa.unitPrice === 1187827, `${lpa.unitPrice}`);
}

console.log('== §4C Bekisting+Dolken: penjelasan eksplisit dolken TIDAK terhargai terpisah ==');
{
  const bek = resolveComponentPrice({ name: 'Papan Bekisting + Kayu Dolken Penyangga', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Penjelasan menyebut Kayu Meranti Bekisting DAN dolken tidak dihargai terpisah',
    /Kayu Meranti Bekisting/.test(bek.explanation) && /TIDAK dihargai terpisah/.test(bek.explanation), bek.explanation.slice(0, 220));
}

console.log('== §4D asumsi terbatas lain tertulis di penjelasan hasil ==');
{
  const ayak = resolveComponentPrice({ name: 'Pasir Pasang Ayak', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Pasir Pasang Ayak: asumsi kata "Ayak" tercatat', /ASUMSI/.test(ayak.explanation) && /Ayak/.test(ayak.explanation));
  const papan = resolveComponentPrice({ name: 'Kayu Papan 3/20 (Meranti/Borneo)', quantity: 1, unit: 'm³', kind: 'MATERIAL' });
  check('Kayu Papan 3/20: sumber 2/20 dinyatakan', /2\/20/.test(papan.explanation) && /ASUMSI/.test(papan.explanation));
  const kayuAlu = resolveComponentPrice({ name: 'Tukang Kayu / Aluminium', quantity: 1, unit: 'OH', kind: 'LABOR' });
  check('Tukang Kayu/Aluminium: tarif Aluminium dipakai, tarif Kayu 150.000 tercatat', kayuAlu.unitPrice === 175000 && /150\.000/.test(kayuAlu.explanation));
  const kusen = resolveComponentPrice({ name: 'Kusen Kayu Kamper / Aluminium 4 inch', quantity: 1, unit: "m'", kind: 'MATERIAL' });
  check('Kusen: harga PROFIL material, bukan pekerjaan jadi; varian kamper tak terhargai dinyatakan',
    kusen.unitPrice != null && /PROFIL/.test(kusen.explanation) && /bukan harga pekerjaan kusen jadi/i.test(kusen.explanation), `${kusen.unitPrice} ${kusen.explanation.slice(0, 200)}`);
  const nym = resolveComponentPrice({ name: 'Kabel NYM 3x2.5 mm² / 2x1.5 mm² Standar SNI', quantity: 1, unit: "m'", kind: 'MATERIAL' });
  check('Kabel NYM gabungan: hanya 3x2,5 yang ditanggung sumber; 2x1,5 dinyatakan tidak ada',
    nym.unitPrice != null && /2x1,5/.test(nym.explanation), `${nym.unitPrice} ${nym.explanation.slice(0, 200)}`);
  const geo = resolveComponentPrice({ name: 'Geomembran HDPE Tebal 1.0 - 1.5 mm', quantity: 1, unit: 'm²', kind: 'MATERIAL' });
  check('Geomembran rentang: sub-harga 1,0 mm dipakai; sub-harga 1,5 mm disebut', geo.unitPrice === 15000 && /20\.000/.test(geo.explanation), `${geo.unitPrice}`);
}

console.log(`\nPRICE INTEGRITY GATE SUITE: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

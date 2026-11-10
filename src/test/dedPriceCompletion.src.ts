/**
 * REGRESI PENYELESAIAN HARGA & KUANTITAS AI — DED Estimate (owner 2026-11-10).
 *
 * Run: npx esbuild src/test/dedPriceCompletion.src.ts --bundle --platform=node
 *      --format=cjs --outfile=<folder>/dedPriceCompletion.cjs
 *      && node <folder>/dedPriceCompletion.cjs
 *
 * Mencakup:
 * - Fixture permanen 38 baris tabel owner (fixtures/dedOwnerTable38.ts):
 *   FULL_AI + penyelesaian → 38/38 lengkap (qty + harga + subtotal);
 *   DATABASE pada fixture yang sama → hasil identik dengan tanpa
 *   penyelesaian (mode tidak berubah).
 * - 20 skenario master prompt §12: perlindungan AHSP & manual, referensi
 *   konflik, cakupan material vs terpasang, beda wilayah, sumber basi,
 *   persistensi metadata ke RAB, batch gagal sebagian, kegagalan
 *   provider, idempotensi, hitung ulang kanonis, diskriminator nol,
 *   mesin harga tidak mengarang kuantitas, item non-AHSP sah, cache,
 *   kebijakan penggantian, tanpa markup overhead/profit.
 */
import { OWNER_TABLE_38 } from './fixtures/dedOwnerTable38';
import { convertAiItem } from '../ai-tools/ded-ai-estimate/service';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import {
  completeDedBatch, completeDedItem, derivePlanContext, classifyQuantity,
  rejectCompletion,
} from '../ai-tools/ded-ai-estimate/priceCompletion';
import {
  EXTERNAL_PRICE_REFERENCES, findExternalReference,
  type ExternalPriceReference,
} from '../ai-tools/ded-ai-estimate/externalPriceReferences';
import {
  researchCacheKey, putResearch, getResearch, clearResearchCache,
} from '../ai-tools/ded-ai-estimate/priceResearchCache';
import { mapDedAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-11-10T00:00:00Z');
const baseItem = (over: Partial<DedAiItem>): DedAiItem => ({
  id: 't-1', name: 'Item Uji', category: 'Uji', units: 'm2',
  quantity: 10, quantitySource: 'DERIVED', unitPrice: null,
  priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [], provenance: [],
  stage: 'PARSE', ...over,
} as DedAiItem);
const CTX = { floorAreaM2: 48.5, ceilingAreaM2: 29.5, buildingPerimeterM: 24, doorUnits: 4, roomCount: 4 };

// ===========================================================================
// A. FIXTURE 38 BARIS — FULL_AI + penyelesaian = 38/38 lengkap
// ===========================================================================
console.log('== A. Fixture 38 baris (FULL_AI) ==');
clearResearchCache();
const converted38 = OWNER_TABLE_38.map((row, idx) => convertAiItem(idx, row.raw as any, 'DETAIL', 'FULL_AI'));
const completed = completeDedBatch(converted38, derivePlanContext(converted38), { policy: 'FULL_AI', now: NOW });
const out38 = DedAiCalculator.buildOutput({
  jobId: 'fixture-38', projectType: 'BANGUNAN', mode: 'DETAIL', policy: 'FULL_AI',
  projectName: 'Fixture Owner 38', pageCount: 32, items: completed.items,
});
check('A1 38/38 punya kuantitas', out38.items.every((it) => it.quantity != null && it.quantity > 0));
check('A2 38/38 punya harga', out38.items.every((it) => it.unitPrice != null && it.unitPrice > 0));
check('A3 38/38 punya subtotal', out38.items.every((it) => it.subtotal != null && it.subtotal > 0));
check('A4 tidak ada Harga Blm Tersedia', out38.items.every((it) => it.unitPrice != null));
check('A5 tidak ada Perlu Input', out38.items.every((it) => it.quantity != null));
const row13 = out38.items[12];
check('A6 baris 13 pelat dak: kuantitas mikro diganti estimasi berlabel 2,95 m3',
  row13.quantity === 2.95 && row13.subtotal === 16520000
    && row13.priceCompletion?.quantityBasis != null
    && /diganti estimasi|tidak fisik/i.test(row13.priceCompletion?.quantityBasis + (row13.quantityNote || '')),
  `qty=${row13.quantity} subtotal=${row13.subtotal}`);
const row6 = out38.items[5];
check('A7 baris 6 cerucuk: subtotal terhitung 3.600 (rantai subtotal diperbaiki)',
  row6.subtotal === 3600, `subtotal=${row6.subtotal}`);
const row8 = out38.items[7];
check('A8 baris 8 lantai kerja: subtotal terhitung 2.992.500', row8.subtotal === 2992500, `subtotal=${row8.subtotal}`);
const row33 = out38.items[32];
check('A9 baris 33 bak kontrol: subtotal terhitung 900.000', row33.subtotal === 900000, `subtotal=${row33.subtotal}`);
const row18 = out38.items[17];
check('A10 baris 18 listplank: kuantitas fragmen diganti keliling bangunan (bouwplank DED_GEOMETRIC 24 m\') + harga referensi',
  row18.quantity === 24 && row18.unitPrice === 65000
    && /keliling bangunan 24/.test(row18.priceCompletion?.quantityBasis || ''),
  `qty=${row18.quantity} price=${row18.unitPrice}`);
check('A11 laporan: 15 harga terisi referensi pasar', completed.report.filledMarketReference === 15,
  JSON.stringify(completed.report));
check('A12 laporan: 6 kuantitas dilengkapi', completed.report.quantityFilled === 6, JSON.stringify(completed.report));
check('A13 semua isian harga penyelesaian berlabel klasifikasi MARKET_REFERENCE + sumber',
  out38.items.filter((it) => it.priceCompletion?.referenceId).length === 15
    && out38.items.filter((it) => it.priceCompletion?.referenceId).every((it) =>
      it.priceCompletion!.classification === 'MARKET_REFERENCE' && Boolean(it.priceCompletion!.sourceName)));
check('A14 total harness (grand total mesin kanonis)', out38.grandTotal === 149023200, `total=${out38.grandTotal}`);

// ===========================================================================
// B. MODE DATABASE TIDAK BERUBAH
// ===========================================================================
console.log('== B. Mode DATABASE tidak berubah ==');
const dbConverted = OWNER_TABLE_38.map((row, idx) => convertAiItem(idx, row.raw as any, 'DETAIL', 'DATABASE'));
const dbCompleted = completeDedBatch(dbConverted, derivePlanContext(dbConverted), { policy: 'DATABASE', now: NOW });
check('B1 penyelesaian menolak mode DATABASE (item identik)',
  dbCompleted.items.every((it, i) => it === dbConverted[i]));
const dbOut = DedAiCalculator.buildOutput({
  jobId: 'fixture-38-db', projectType: 'BANGUNAN', mode: 'DETAIL', policy: 'DATABASE',
  projectName: 'Fixture Owner 38 DB', pageCount: 32, items: dbCompleted.items,
});
const dbPlain = DedAiCalculator.buildOutput({
  jobId: 'fixture-38-db2', projectType: 'BANGUNAN', mode: 'DETAIL', policy: 'DATABASE',
  projectName: 'Fixture Owner 38 DB', pageCount: 32, items: dbConverted,
});
check('B2 grand total DATABASE sama dengan tanpa penyelesaian', dbOut.grandTotal === dbPlain.grandTotal);
check('B3 lubang tetap lubang di DATABASE', dbOut.items.filter((it) => it.unitPrice == null).length >= 10);

// ===========================================================================
// C. 20 SKENARIO §12
// ===========================================================================
console.log('== C. Skenario master prompt §12 ==');
// S1: harga AHSP resmi dipertahankan
{
  const it = baseItem({ unitPrice: 300000, priceSource: 'AHSP_2026', ahspCode: 'X.1' });
  const { item, outcome } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  check('S1 harga AHSP tidak ditimpa', item.unitPrice === 300000 && outcome === 'KEPT_OFFICIAL'
    && item.priceCompletion?.classification === 'OFFICIAL_AHSP_VERIFIED');
}
// S2: harga manual dipertahankan
{
  const it = baseItem({ unitPrice: 123456, priceSource: 'USER_INPUT', name: 'Rangka Atap Baja Ringan' });
  const { item } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  check('S2 harga manual tidak ditimpa referensi', item.unitPrice === 123456
    && item.priceCompletion?.classification === 'MANUAL_PRICE');
}
// S3: referensi konflik — dua sumber rentang berbeda → rekomendasi di dalam
// rentang gabungan dan keyakinan tidak naik
{
  const ref = EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-sakelar')!;
  check('S3 referensi konflik (sakelar): rekomendasi di dalam rentang gabungan dua sumber',
    ref.rangeMin === 120000 && ref.rangeMax === 220000 && ref.recommendedPrice >= ref.rangeMin && ref.recommendedPrice <= ref.rangeMax
    && /dua sumber|gabungan/i.test(ref.specAssumption + ref.sourceName));
}
// S4: cakupan material-saja vs terpasang dipisah & terpasang didahulukan
{
  const materialOnly: ExternalPriceReference = {
    id: 'uji-material', matchKeywords: ['nok'], unit: "m'", recommendedPrice: 30000,
    rangeMin: 25000, rangeMax: 35000, scope: 'MATERIAL_SAJA', tier: 'SUPPLIER_MANUFACTURER',
    sourceName: 'Uji', sourceUrl: 'https://example.invalid', sourceDate: '2026-10-01',
    accessedAt: '2026-11-10', region: 'Nasional', confidence: 'LOW', specAssumption: 'material saja',
  };
  const found = findExternalReference('Nok Spandek', "m'", [materialOnly, ...EXTERNAL_PRICE_REFERENCES]);
  check('S4 referensi terpasang didahulukan atas material-saja', found?.scope === 'TERPASANG_PENUH');
  const filled = completeDedItem(baseItem({ name: 'Nok Spandek', units: "m'" }), CTX,
    { policy: 'FULL_AI', now: NOW, references: [materialOnly] });
  check('S4b cakupan tercatat di output terstruktur', filled.item.priceCompletion?.scope === 'MATERIAL_SAJA');
}
// S5: beda wilayah → tetap MARKET_REFERENCE + catatan luar wilayah
{
  const it = baseItem({ name: 'Rangka Atap Baja Ringan', units: 'm2' });
  const { item } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW, projectRegion: 'Papua' });
  check('S5 referensi luar wilayah tidak dilabeli lokal',
    item.priceCompletion?.classification === 'MARKET_REFERENCE'
    && /LUAR wilayah proyek/.test(item.priceAssumptionNote || ''));
}
// S6: sumber kedaluwarsa → turun jadi AI_ESTIMATE berlabel basi
{
  clearResearchCache();
  const it = baseItem({ name: 'Rangka Atap Baja Ringan', units: 'm2' });
  const future = new Date('2027-06-01T00:00:00Z');
  const { item } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: future });
  check('S6 referensi basi turun klasifikasi + tertanda',
    item.priceCompletion?.classification === 'AI_ESTIMATE' && item.priceCompletion?.sourceStale === true);
  clearResearchCache();
}
// S7: persistensi metadata ke baris RAB
{
  const it = baseItem({ name: 'Rangka Atap Baja Ringan', units: 'm2' });
  const { item } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  const rab = mapDedAiItemToRabInput(item, 'FULL_AI');
  check('S7 metadata sumber bertahan ke RAB (bukan VERIFIED)',
    rab != null && rab.verificationStatus === 'NEEDS_VERIFICATION'
    && rab.priceSourceKind === 'EZRAB_ASSUMPTION'
    && /MARKET_REFERENCE/.test(rab.priceSourceExplanation) && /homeX/.test(rab.priceSourceExplanation));
}
// S8: batch gagal sebagian — resolver melempar untuk satu item, sisanya selesai
{
  const items = [
    baseItem({ id: 'a', name: 'Rangka Atap Baja Ringan', units: 'm2' }),
    baseItem({ id: 'b', name: 'Nok Spandek', units: "m'" }),
    baseItem({ id: 'c', name: 'Penutup Atap Spandek', units: 'm2' }),
  ];
  const res = completeDedBatch(items, CTX, {
    policy: 'FULL_AI', now: NOW,
    resolveReference: (item) => {
      if (item.id === 'b') throw new Error('provider gagal');
      return findExternalReference(item.name, item.units);
    },
  });
  check('S8 batch lanjut walau satu item gagal',
    res.report.failures === 1 && res.items[0].unitPrice != null && res.items[2].unitPrice != null
    && res.items[1].unitPrice == null);
}
// S9: kegagalan pencarian/provider total → tidak crash, item UNRESOLVED jujur
{
  const { item, outcome } = completeDedItem(baseItem({ name: 'Pekerjaan Sangat Kustom XYZ' }), CTX,
    { policy: 'FULL_AI', now: NOW, resolveReference: () => null });
  check('S9 tanpa referensi: item tetap UNRESOLVED, bukan angka karangan',
    item.unitPrice == null && outcome === 'UNRESOLVED');
}
// S10: idempotensi — penyelesaian dua kali = hasil sama, riwayat tidak ganda
{
  clearResearchCache();
  const it = baseItem({ name: 'Nok Spandek', units: "m'" });
  const once = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW }).item;
  const twice = completeDedItem(once, CTX, { policy: 'FULL_AI', now: NOW }).item;
  check('S10 idempoten', twice.unitPrice === once.unitPrice
    && (twice.priceCompletion?.history.length ?? 0) === (once.priceCompletion?.history.length ?? 0));
}
// S11: hitung ulang baris + ringkasan oleh mesin kanonis
{
  const items = [
    baseItem({ id: 'a', name: 'Rangka Atap Baja Ringan', units: 'm2', quantity: 27.2 }),
    baseItem({ id: 'b', name: 'Nok Spandek', units: "m'", quantity: 7.3 }),
  ];
  const done = completeDedBatch(items, CTX, { policy: 'FULL_AI', now: NOW }).items;
  const out = DedAiCalculator.buildOutput({
    jobId: 's11', projectType: 'BANGUNAN', mode: 'DETAIL', policy: 'FULL_AI',
    projectName: 'S11', pageCount: 1, items: done,
  });
  check('S11 subtotal & total dari mesin kanonis',
    out.items[0].subtotal === Math.round(27.2 * 165000) && out.items[1].subtotal === Math.round(7.3 * 55000)
    && out.grandTotal === Math.round(27.2 * 165000) + Math.round(7.3 * 55000));
}
// S12: diskriminator nol — fragmen mikro vs nol disengaja
{
  check('S12a pelat dak mikro = IMPLAUSIBLE_FRAGMENT',
    classifyQuantity({ name: 'Pelat Dak Beton t=100mm', units: 'm3', quantity: 0.0000035714 }) === 'IMPLAUSIBLE_FRAGMENT');
  check('S12b nol eksplisit = EXPLICIT_ZERO (tidak diestimasi)',
    classifyQuantity({ name: 'Pelat Dak Beton t=100mm', units: 'm3', quantity: 0 }) === 'EXPLICIT_ZERO');
  check('S12c null = MISSING', classifyQuantity({ name: 'Septic Tank', units: 'unit', quantity: null }) === 'MISSING');
  check('S12d kuantitas wajar = PRESENT',
    classifyQuantity({ name: 'Galian Tanah', units: 'm3', quantity: 8.4 }) === 'PRESENT');
}
// S13: mesin harga tidak mengarang kuantitas
{
  const it = baseItem({ name: 'Rangka Atap Baja Ringan', units: 'm2', quantity: null, quantitySource: 'UNRESOLVED' });
  const { item, outcome } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  check('S13 harga terisi tapi kuantitas tetap kosong → NEEDS_QUANTITY',
    item.unitPrice === 165000 && item.quantity == null && outcome === 'NEEDS_QUANTITY');
}
// S14: item tanpa kode AHSP tetap sah & terisi (tidak ditolak)
{
  const it = baseItem({ name: 'Penutup Atap Spandek', units: 'm2' });
  const { item } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  check('S14 item non-AHSP terisi berprovenans non-AHSP',
    item.unitPrice === 95000 && item.ahspCode == null && item.priceSource === 'AI_ESTIMATE');
}
// S15: kunci cache ternormalisasi + hit + kedaluwarsa
{
  clearResearchCache();
  const ref = EXTERNAL_PRICE_REFERENCES[0];
  const k1 = researchCacheKey({ description: 'Rangka Atap, Baja Ringan!', unit: 'm2', region: 'Jawa Timur', scope: 'TERPASANG_PENUH' });
  const k2 = researchCacheKey({ description: 'baja ringan rangka atap', unit: 'm2', region: 'jawa timur', scope: 'terpasang_penuh' });
  check('S15a kunci cache stabil terhadap urutan kata/kapital', k1 === k2);
  putResearch({ description: 'Rangka Atap Baja Ringan', unit: 'm2', region: 'Jawa Timur', scope: 'TERPASANG_PENUH' }, ref, '2026-11-10');
  const hit = getResearch({ description: 'Rangka Atap Baja Ringan', unit: 'm2', region: 'Jawa Timur', scope: 'TERPASANG_PENUH' }, NOW);
  check('S15b cache hit & segar dalam masa berlaku', hit != null && hit.stale === false);
  const old = getResearch({ description: 'Rangka Atap Baja Ringan', unit: 'm2', region: 'Jawa Timur', scope: 'TERPASANG_PENUH' }, new Date('2027-01-01T00:00:00Z'));
  check('S15c cache basi tertanda (tidak dibuang diam-diam)', old != null && old.stale === true);
}
// S16: kebijakan penggantian — estimasi penyelesaian diganti referensi lebih
// kuat dengan riwayat; yang setara tidak diganti
{
  clearResearchCache();
  const weakRef: ExternalPriceReference = {
    id: 'ext-lemah', matchKeywords: ['nok'], unit: "m'", recommendedPrice: 40000,
    rangeMin: 35000, rangeMax: 45000, scope: 'TERPASANG_PENUH', tier: 'CONTRACTOR_MARKET',
    sourceName: 'Lemah', sourceUrl: 'https://example.invalid', sourceDate: '2026-10-01',
    accessedAt: '2026-11-10', region: 'Nasional', confidence: 'LOW', specAssumption: 'uji',
  };
  const it = baseItem({ name: 'Nok Spandek', units: "m'" });
  // Tanam estimasi AI murni (klasifikasi AI_ESTIMATE) seolah dari penyelesaian lama
  const seeded: DedAiItem = {
    ...it, unitPrice: 40000, priceSource: 'AI_ESTIMATE',
    priceCompletion: {
      classification: 'AI_ESTIMATE', recommendedPrice: 40000, rangeMin: null, rangeMax: null,
      unit: "m'", scope: 'TERPASANG_PENUH', accessedAt: '2026-11-01', confidence: 'LOW',
      method: 'estimasi lama', ahspRelated: false, referenceId: 'ext-lemah',
      originalUnitPrice: null, originalQuantity: 10, history: [],
    },
  };
  void weakRef;
  const { item } = completeDedItem(seeded, CTX, { policy: 'FULL_AI', now: NOW });
  check('S16 referensi pasar menggantikan estimasi lama + riwayat tercatat',
    item.unitPrice === 55000 && item.priceCompletion?.classification === 'MARKET_REFERENCE'
    && (item.priceCompletion?.history.length ?? 0) === 1);
}
// S17: penolakan pengguna memulihkan keadaan awal
{
  const it = baseItem({ name: 'Nok Spandek', units: "m'" });
  const filled = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW }).item;
  const rejected = rejectCompletion(filled);
  check('S17 tolak penyelesaian → harga kembali kosong', rejected.unitPrice == null && rejected.priceCompletion == null);
}
// S18: tanpa markup overhead/profit implisit
{
  const it = baseItem({ name: 'Titik Penerangan', units: 'titik' });
  const { item } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  const ref = EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-titik-penerangan')!;
  check('S18 harga = harga referensi persis (tanpa markup)', item.unitPrice === ref.recommendedPrice);
}
// S19: kuantitas elektrikal dari konteks denah (jalur estimasi-kuantitas)
{
  const it = baseItem({ name: 'Instalasi Stop Kontak', units: 'titik', quantity: null, quantitySource: 'UNRESOLVED' });
  const { item } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  check('S19 stop kontak terisi dari jumlah ruang (4 ruang × 2 = 8) berlabel ASSUMPTION',
    item.quantity === 8 && item.quantitySource === 'ASSUMPTION' && Boolean(item.quantityFormula));
}
// S20: item yang spesifikasinya tidak cukup → NEEDS_QUANTITY jujur
{
  const emptyCtx = { floorAreaM2: null, ceilingAreaM2: null, buildingPerimeterM: null, doorUnits: null, roomCount: null };
  const it = baseItem({ name: 'Instalasi Titik Penerangan', units: 'titik', quantity: null, quantitySource: 'UNRESOLVED' });
  const { item, outcome } = completeDedItem(it, emptyCtx, { policy: 'FULL_AI', now: NOW });
  check('S20 tanpa konteks denah: kuantitas tidak dikarang',
    item.quantity == null && outcome === 'NEEDS_QUANTITY' && item.unitPrice === 185000);
}

console.log(`\nHASIL: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

/**
 * EZRAB — AHSP R2 ANOMALY PINS (Phase 2 Workstream 2, 2026-11-19)
 *
 * Suite ini MENGUNCI keadaan anomali/UNRESOLVED yang ditemukan audit Fase 2
 * dan diverifikasi ulang di Phase 2 — BUKAN mengesahkan angka-angkanya.
 * Setiap blok menjelaskan: apa yang dipin, mengapa, dan apa yang TIDAK boleh
 * dilakukan ("memperbaiki" tes ini dengan mengubah angka yang dipin tanpa
 * keputusan owner / regenerasi pipeline adalah pemalsuan).
 *
 * - B: peralatan SDA tetap UNRESOLVED (bukan Rp0, bukan ikatan kode naif).
 * - C: konflik Air M170 tetap terlihat (Rp19.900 vs Rp14,65; SE 12/SE/Db/2026
 *   belum ditemukan di repo/workspace).
 * - D: semantik OJ tetap campuran; TIDAK ada transfer 1:1 universal.
 * - E: Dolken R049/R052 tetap PROVISIONAL; hanya galam (M.56.a) bernama
 *   spesies di AHSP.
 * - F: anomali resmi CK + OWNER-03/04/07/08 dipin apa adanya.
 *
 * Jalankan: npx --yes tsx src/test/ahspR2Anomalies.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { RESOURCE_PRICE_RECORDS } from '../data/priceDatabase2026/priceMaster.generated';
import { getNeedsReviewFlag } from '../data/priceDatabase2026/needsReviewRegistry';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const readRepo = (rel: string) => readFileSync(join(HERE, '..', '..', rel), 'utf-8');
const resolve = (q: any) => priceResolver2026.resolveResourcePrice(q) as any;

// ---------------------------------------------------------------------------
// B. Peralatan SDA — UNRESOLVED, bukan Rp0; ikatan kode naif dilarang.
// ---------------------------------------------------------------------------
console.log('B. Peralatan SDA tetap UNRESOLVED');
for (const [code, name] of [
  ['E.15.e', 'E.15.e'],
  ['E.13.c', 'E.13.c'],
  ['E.11.b', 'Crawler Crane 10 Ton + *1 E.11.b'],
  ['', 'E.20.b'],
  ['T.34', 'T.34'],
] as Array<[string, string]>) {
  const r = resolve({ resourceCode: code, resourceName: name, resourceType: 'equipment', unit: 'jam' });
  check(`${name} @ jam → NOT_FOUND (bukan Rp0)`, r.status === 'NOT_FOUND' && r.price === null, `dapat ${r.status} ${r.price}`);
}
// E19c adalah tabrakan tiga identitas (BM = Vibratory Roller Rp515.343,62;
// Lampiran IV inline = Rp226.736,40 tanpa nama mesin; SDA = Jack Hammer).
// Ikatan kode naif akan salah harga — pin bahwa Jack Hammer TIDAK resolve.
const jackHammer = resolve({
  resourceCode: 'E.19.c',
  resourceName: 'Jack Hammer Drill + E.19.c',
  resourceType: 'equipment',
  unit: 'jam',
});
check('Jack Hammer E.19.c @ jam → NOT_FOUND (tidak terikat ke harga E19c manapun)', jackHammer.status === 'NOT_FOUND' && jackHammer.price === null, `dapat ${jackHammer.status} ${jackHammer.price}`);
const liv26 = JSON.parse(readRepo('data/ahsp2026/validated/sda_hsd_inline_lampiran_iv_26entries.json')) as any[];
const livE19c = liv26.find((e) => e.code === 'E19c');
check('Lampiran IV inline memuat E19c Rp226.736,40 (sumber tetap ada, belum terikat)', livE19c?.price === 226736.4, `dapat ${livE19c?.price}`);
const sdaItem: any = (officialAhspRepository as any).getOfficialAhsp?.('A.3.01.1a.4.a');
check('A.3.01.1a.4.a ada di repository', sdaItem !== undefined && sdaItem !== null);
if (sdaItem) {
  const comp: any = priceResolver2026.resolveAhspUnitPrice(sdaItem);
  check('A.3.01.1a.4.a status PARTIAL (peralatan belum terhargai)', comp.pricingStatus === 'PARTIAL', `dapat ${comp.pricingStatus}`);
  const eqLine = (comp.equipment?.components ?? []).find((c: any) => c.itemName === 'E.15.e');
  check(
    'E.15.e di komposisi: unitPrice null + unresolvedReason terisi',
    eqLine?.unitPrice === null && typeof eqLine?.unresolvedReason === 'string' && eqLine.unresolvedReason.length > 0,
    `dapat ${JSON.stringify({ unitPrice: eqLine?.unitPrice, reason: eqLine?.unresolvedReason })}`,
  );
}

// ---------------------------------------------------------------------------
// C. Air M170 — konflik tetap terlihat; harga TIDAK ditulis ulang.
// ---------------------------------------------------------------------------
console.log('C. Air M170 SOURCE_ANOMALY');
const m170 = resolve({ resourceCode: 'M170', resourceName: 'Air', resourceType: 'material', unit: 'liter' });
check('M170 @ liter → Rp19.900 (perilaku runtime saat ini, BUKAN harga benar)', m170.status === 'RESOLVED' && m170.price === 19900, `dapat ${m170.status} ${m170.price}`);
check(
  'M170 membawa flag CONFLICT M170|liter',
  m170.needsReview?.kind === 'CONFLICT' && m170.needsReview?.componentKey === 'M170|liter',
  `dapat ${JSON.stringify(m170.needsReview)}`,
);
check(
  'alasan CONFLICT menyebut SE 12/SE/Db/2026 (sumber yang dibutuhkan)',
  String(m170.needsReview?.reason ?? '').includes('SE 12/SE/Db/2026'),
  `dapat ${m170.needsReview?.reason}`,
);
const hsdText = readRepo('src/data/nationalCostDatabase/officialHSD2026.ts');
check('HSD-2026-022 Air Rp19.900/liter lestari di katalog HSD', /id: 'HSD-2026-022'[\s\S]{0,300}?price: 19900/.test(hsdText));
const bmText = readRepo('src/data/nationalCostDatabase/officialBinaMargaPrices2026.ts');
check('BM M170 Air Rp14,65/Ltr lestari di berkas harga BM', /"code": "M170",\s*"name": "Air",\s*"unit": "Ltr",\s*"price": 14\.65/.test(bmText));
check('spread M170 > 1350× (anomali tetap kentara)', 19900 / 14.65 > 1350 && 19900 / 14.65 < 1370, `dapat ${19900 / 14.65}`);
const airCodeless = resolve({ resourceName: 'Air', resourceType: 'material', unit: 'liter' });
check(
  'CELAH VISIBILITAS (dikenal): Air tanpa kode → Rp200 TANPA flag konflik',
  airCodeless.status === 'RESOLVED' && airCodeless.price === 200 && airCodeless.needsReview === null,
  `dapat ${airCodeless.status} ${airCodeless.price} flag=${JSON.stringify(airCodeless.needsReview)}`,
);

// ---------------------------------------------------------------------------
// D. OJ — campuran; TIDAK ada transfer 1:1 universal.
// ---------------------------------------------------------------------------
console.log('D. Semantik OJ');
const ojHourly = resolve({ resourceCode: 'L02', resourceName: 'Tukang Batu', resourceType: 'labor', unit: 'OJ' });
check('OJ per-jam (kode L02): Tukang Batu → Rp29.049,71', ojHourly.status === 'RESOLVED' && ojHourly.price === 29049.71, `dapat ${ojHourly.status} ${ojHourly.price}`);
check('OJ per-jam: recordBasis OJ_HOUR', ojHourly.ojBasis?.recordBasis === 'OJ_HOUR', `dapat ${JSON.stringify(ojHourly.ojBasis)}`);
check('OJ per-jam: flag AMBIGUITY L02|OJ', ojHourly.needsReview?.kind === 'AMBIGUITY' && ojHourly.needsReview?.componentKey === 'L02|OJ', `dapat ${JSON.stringify(ojHourly.needsReview)}`);
check('OJ per-jam: tanpa konversi unit', ojHourly.unitConversion === null, `dapat ${JSON.stringify(ojHourly.unitConversion)}`);
const ohDaily = resolve({ resourceName: 'Tukang Batu', resourceType: 'labor', unit: 'OH' });
check('OH harian: Tukang Batu → Rp145.000', ohDaily.status === 'RESOLVED' && ohDaily.price === 145000, `dapat ${ohDaily.status} ${ohDaily.price}`);
check('TIDAK ada 1:1 universal: OJ berkode (29.049,71) ≠ OH (145.000)', ojHourly.price !== ohDaily.price);
const ojUndoc = resolve({ resourceName: 'Tukang Batu', resourceType: 'labor', unit: 'OJ' });
check(
  'OJ ambigu (tanpa kode, jalur langsung) → NOT_FOUND, basis OJ_UNDOCUMENTED',
  ojUndoc.status === 'NOT_FOUND' && ojUndoc.price === null && ojUndoc.ojBasis?.queryBasis === 'OJ_UNDOCUMENTED',
  `dapat ${ojUndoc.status} ${ojUndoc.price} ${JSON.stringify(ojUndoc.ojBasis)}`,
);
const ojCompItem: any = (officialAhspRepository as any).getOfficialAhsp?.('A.3.09.2a.7');
if (ojCompItem) {
  const comp: any = priceResolver2026.resolveAhspUnitPrice(ojCompItem);
  const tb = (comp.labor?.components ?? []).find((c: any) => c.itemName === 'Tukang Batu');
  check(
    'komposisi A.3.09.2a.7: Tukang Batu OJ tanpa kode → Rp145.000 via konversi 1:1 (§7.1, jalur komposisi SAJA)',
    tb?.unitPrice === 145000 && tb?.unitConversion?.factor === 1 && tb?.unitConversion?.fromUnit === 'OH',
    `dapat ${JSON.stringify({ unitPrice: tb?.unitPrice, conversion: tb?.unitConversion })}`,
  );
  const pk = (comp.labor?.components ?? []).find((c: any) => c.itemName === 'Pekerja');
  check(
    'komposisi A.3.09.2a.7: Pekerja OJ berkode → Rp27.643,54 DENGAN basisMismatch=true (campuran skala ditandai)',
    pk?.unitPrice === 27643.54 && pk?.ojBasis?.basisMismatch === true,
    `dapat ${JSON.stringify({ unitPrice: pk?.unitPrice, ojBasis: pk?.ojBasis })}`,
  );
  const md = (comp.labor?.components ?? []).find((c: any) => c.itemName === 'Mandor');
  check(
    'komposisi A.3.09.2a.7: Mandor OJ → Rp175.000 harian, tanpa mismatch',
    md?.unitPrice === 175000 && md?.ojBasis?.basisMismatch === false,
    `dapat ${JSON.stringify({ unitPrice: md?.unitPrice, ojBasis: md?.ojBasis })}`,
  );
} else {
  check('A.3.09.2a.7 ada di repository', false);
}

// ---------------------------------------------------------------------------
// E. Dolken — PROVISIONAL; hanya galam bernama spesies.
// ---------------------------------------------------------------------------
console.log('E. Dolken PROVISIONAL');
const dolkenCases: Array<[string, string, number]> = [
  ['Dolken atau kayu klas I ø 8 cm – <10 cm M.41.d', 'batang', 29500],
  ['1* Cerucuk dolken ∅ 8-10 cm M.41.d', 'm3', 1159277],
  ['Dolken kayu galam M.56.a', 'm', 7500],
];
for (const [name, unit, price] of dolkenCases) {
  const r = resolve({ resourceName: name, resourceType: 'material', unit });
  check(`${name} → Rp${price.toLocaleString('id-ID')}`, r.status === 'RESOLVED' && r.price === price, `dapat ${r.status} ${r.price}`);
  check(`${name}: verificationStatus NEEDS_REVIEW (PROVISIONAL)`, r.verificationStatus === 'NEEDS_REVIEW', `dapat ${r.verificationStatus}`);
  const winning = (RESOURCE_PRICE_RECORDS as any[]).find((rec) => rec.id === r.recordId);
  check(
    `${name}: record pemenang adalah MARKET_2026 (pasar), bukan katalog resmi`,
    winning?.sourceKey === 'MARKET_2026' && String(winning?.sourceName ?? '').includes('Riset Harga Pasar'),
    `dapat ${JSON.stringify({ recordId: r.recordId, sourceKey: winning?.sourceKey, sourceName: winning?.sourceName })}`,
  );
}
const master = JSON.parse(readRepo('data/ahsp2026/validated/ahsp_2026_master.json')) as any;
const dolkenRows: any[] = [];
for (const it of master.items as any[]) {
  for (const arr of ['materials', 'labor', 'equipment'] as const) {
    for (const c of (it.components?.[arr] ?? []) as any[]) {
      const nm = String(c.resource_name ?? '').toLowerCase();
      if (nm.includes('olken') || nm.includes('galam') || nm.includes('racuk')) dolkenRows.push(c);
    }
  }
}
check('baris Dolken/Galam/Racuk di master kanonis = 17', dolkenRows.length === 17, `dapat ${dolkenRows.length}`);
check(
  'hanya 2 baris menyebut spesies (galam, M.56.a); 0 menyebut racuk',
  dolkenRows.filter((c) => String(c.resource_name ?? '').toLowerCase().includes('galam')).length === 2 &&
    dolkenRows.filter((c) => String(c.resource_name ?? '').toLowerCase().includes('racuk')).length === 0,
  `dapat galam=${dolkenRows.filter((c) => String(c.resource_name ?? '').toLowerCase().includes('galam')).length} racuk=${dolkenRows.filter((c) => String(c.resource_name ?? '').toLowerCase().includes('racuk')).length}`,
);
check(
  'baris M.41.d tidak menyebut spesies apa pun (gelam/racuk tidak boleh disamakan)',
  dolkenRows
    .filter((c) => String(c.resource_name ?? '').includes('M.41.d'))
    .every((c) => !/galam|racuk|gelam/i.test(String(c.resource_name ?? ''))),
);

// ---------------------------------------------------------------------------
// F. Anomali + OWNER items — dipin apa adanya.
// ---------------------------------------------------------------------------
console.log('F. Anomali resmi + OWNER items');
const semenMerah = resolve({ resourceName: 'Semen merah', resourceType: 'material', unit: 'kg' });
check('Semen merah (jalur live CK) → Rp15.800 VERIFIED', semenMerah.status === 'RESOLVED' && semenMerah.price === 15800 && semenMerah.verificationStatus === 'VERIFIED', `dapat ${semenMerah.status} ${semenMerah.price} ${semenMerah.verificationStatus}`);
const semenNat = resolve({ resourceName: 'Semen nat', resourceType: 'material', unit: 'kg' });
check('Semen nat (jalur live CK) → Rp16.100 VERIFIED', semenNat.status === 'RESOLVED' && semenNat.price === 16100 && semenNat.verificationStatus === 'VERIFIED', `dapat ${semenNat.status} ${semenNat.price} ${semenNat.verificationStatus}`);
const collapsed = (RESOURCE_PRICE_RECORDS as any[]).filter(
  (r) => r.sourceRecordId === 'MAT-CK-07558' || r.sourceRecordId === 'MAT-CK-07561',
);
check(
  'CACAT BINDING (dikenal, pipeline): record priceMaster MAT-CK-07558/07561 runtuh ke nama generik "Semen"',
  collapsed.length === 2 && collapsed.every((r) => r.resourceName === 'Semen'),
  `dapat ${collapsed.map((r) => `${r.sourceRecordId}:${r.resourceName}:${r.price}`).join(', ')}`,
);
const r091 = (RESOURCE_PRICE_RECORDS as any[]).find((r) => r.sourceRecordId === 'MKT-R091');
check(
  'R091 Campuran Beton fc\' 25: basis AHSP_DOC tetapi sourceKey MARKET_2026 (salah label provenance, harga tidak diubah)',
  r091?.price === 810569.59 &&
    String((r091?.notes ?? []).join(' ')).includes('basis=AHSP_DOC') &&
    r091?.sourceKey === 'MARKET_2026',
  `dapat ${JSON.stringify({ price: r091?.price, sourceKey: r091?.sourceKey, notes: r091?.notes })}`,
);
const pasirById = resolve({ resourceId: 'RES-003733', resourceName: 'Pasir', resourceType: 'material', unit: 'm3' });
const pasirNoId = resolve({ resourceName: 'Pasir', resourceType: 'material', unit: 'm3' });
check('Pasir via resourceId RES-003733 → Rp210.000 (HSD)', pasirById.status === 'RESOLVED' && pasirById.price === 210000, `dapat ${pasirById.status} ${pasirById.price}`);
check('Pasir tanpa resourceId → Rp246.300 (BM) — fragmentasi identitas TETAP TERBUKA', pasirNoId.status === 'RESOLVED' && pasirNoId.price === 246300, `dapat ${pasirNoId.status} ${pasirNoId.price}`);
const pasirRecs = (RESOURCE_PRICE_RECORDS as any[]).filter((r) => r.resourceId === 'RES-003733');
check('RES-003733 masih terfragmentasi (≥16 record)', pasirRecs.length >= 16, `dapat ${pasirRecs.length}`);
const registryText = readRepo('src/data/priceDatabase2026/needsReviewRegistry.generated.ts');
check('registry needsReview TIDAK memuat R015/R110/R111 (jembatan satuan belum diratifikasi)', !/Flexible Conduit|Tube Settler|R015|R110|R111/.test(registryText) && !/Kabel NYM/.test(registryText));
const r015 = resolve({ resourceName: 'Flexible Conduit 20 mm', resourceType: 'material', unit: 'm' });
check('R015 Flexible Conduit 20 mm → Rp5.400 VERIFIED, tanpa flag ratifikasi', r015.status === 'RESOLVED' && r015.price === 5400 && r015.needsReview === null, `dapat ${r015.status} ${r015.price} flag=${JSON.stringify(r015.needsReview)}`);
const r110 = resolve({ resourceCode: 'M396n', resourceName: 'Kabel NYM 3 x 2.5 mm2', resourceType: 'material', unit: "M'" });
check('R110 Kabel NYM (ejaan AHSP mm2/2.5) → Rp12.000 HSD, BUKAN Rp21.300 CK (jembatan nama mm² belum ada)', r110.status === 'RESOLVED' && r110.price === 12000, `dapat ${r110.status} ${r110.price} ${r110.sourceName}`);
const mat02 = readRepo('src/data/nationalCostDatabase/ckPriceChunks/materials02.ts');
check('katalog CK memuat "Kabel NYM 3 x 2,5 mm²" Rp21.300 (ejaan sumber berbeda)', mat02.includes('Kabel NYM 3 x 2,5 mm²') && mat02.includes('"price":21300.0'));
const r111 = resolve({ resourceName: 'Tube Settler', resourceType: 'material', unit: 'm2' });
check('R111 Tube Settler → Rp150.000 VERIFIED, tanpa flag ratifikasi', r111.status === 'RESOLVED' && r111.price === 150000 && r111.needsReview === null, `dapat ${r111.status} ${r111.price} flag=${JSON.stringify(r111.needsReview)}`);
const dynM10 = resolve({ resourceName: 'Dynabolt M10', resourceType: 'material', unit: 'bh' });
const dynM12 = resolve({ resourceName: 'Dynabolt dia. 12 x 120 mm', resourceType: 'material', unit: 'bh' });
check('Dynabolt M10 → Rp25.000 resmi CK (tidak ditulis ulang)', dynM10.status === 'RESOLVED' && dynM10.price === 25000, `dapat ${dynM10.status} ${dynM10.price}`);
check('Dynabolt dia. 12 x 120 mm → Rp4.000 resmi CK (anomali 6,25× tetap tercatat)', dynM12.status === 'RESOLVED' && dynM12.price === 4000, `dapat ${dynM12.status} ${dynM12.price}`);
check('rasio anomali Dynabolt = 6,25×', dynM10.price / dynM12.price === 6.25, `dapat ${dynM10.price / dynM12.price}`);
const fung = resolve({ resourceName: 'Fungisida/Insektisida', resourceType: 'material', unit: 'kg' });
check('Fungisida/Insektisida → Rp430.000 resmi CK (tidak ditulis ulang)', fung.status === 'RESOLVED' && fung.price === 430000, `dapat ${fung.status} ${fung.price}`);
const pipaBaja = resolve({ resourceCode: 'M241b', resourceName: 'Pipa Baja dia 100 m', resourceType: 'material', unit: 'm' });
check(
  'Pipa Baja dia 100 (M241b) → Rp1.083.333,33 + flag CONFLICT M241B|m (misbinding tetap terlihat)',
  pipaBaja.status === 'RESOLVED' &&
    Math.abs(pipaBaja.price - 1083333.3333333333) < 0.01 &&
    pipaBaja.needsReview?.kind === 'CONFLICT' &&
    pipaBaja.needsReview?.componentKey === 'M241B|m',
  `dapat ${pipaBaja.status} ${pipaBaja.price} flag=${JSON.stringify(pipaBaja.needsReview)}`,
);
const lemKayu = resolve({ resourceName: 'Lem Kayu M.138.a', resourceType: 'material', unit: 'kg' });
check('OWNER-03: Lem Kayu M.138.a → Rp48.000 pasar (CK Rp16.400 tidak terjangkau jalur ini)', lemKayu.status === 'RESOLVED' && lemKayu.price === 48000, `dapat ${lemKayu.status} ${lemKayu.price}`);
const lemKayuBare = resolve({ resourceName: 'Lem kayu', resourceType: 'material', unit: 'kg' });
check('OWNER-03 kandidat ketiga: "Lem kayu" tanpa sufiks → Rp16.400 resmi CK', lemKayuBare.status === 'RESOLVED' && lemKayuBare.price === 16400, `dapat ${lemKayuBare.status} ${lemKayuBare.price}`);
const krikilPrices = new Set(
  (RESOURCE_PRICE_RECORDS as any[])
    .filter((r) => String(r.resourceName ?? '').includes('Krikil'))
    .map((r) => r.price),
);
check(
  'OWNER-04: spread Krikil tetap terbuka (Rp117/162/179 per kg pada baris berbeda)',
  krikilPrices.has(117) && krikilPrices.has(162) && krikilPrices.has(179),
  `dapat [${[...krikilPrices].sort((a, b) => a - b).join(', ')}]`,
);
const batuGunung = resolve({ resourceName: 'oval / gunung 200 kg – M.27.f', resourceType: 'material', unit: 'm3' });
check('OWNER-07: oval/gunung 200 kg → Rp150.000 pasar (vs Rp448.500 di dokumen)', batuGunung.status === 'RESOLVED' && batuGunung.price === 150000, `dapat ${batuGunung.status} ${batuGunung.price}`);
const buis70 = resolve({ resourceName: 'Buis Beton ø 70 cm, pjg 1 m', resourceType: 'material', unit: 'buah' });
const buis80 = resolve({ resourceName: 'Buis Beton ø 80 cm, pjg 1 m', resourceType: 'material', unit: 'buah' });
check('OWNER-08: Buis Beton ø70/ø80 → NOT_FOUND (harga tertanam anomali belum diimpor)', buis70.status === 'NOT_FOUND' && buis80.status === 'NOT_FOUND', `dapat ${buis70.status}/${buis80.status}`);

// getNeedsReviewFlag dipakai langsung (impor diuji eksplisit).
check('getNeedsReviewFlag(M170|liter) mengembalikan CONFLICT', (getNeedsReviewFlag as any)('M170|liter')?.kind === 'CONFLICT');

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

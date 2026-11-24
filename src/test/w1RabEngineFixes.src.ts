/**
 * W1 — REGRESI PERBAIKAN RAB ENGINE / AHSP / QTO (Wave 1, 2026-11-24).
 *
 * Run: npx --yes tsx src/test/w1RabEngineFixes.src.ts
 *
 * Enam cacat nyata yang diperbaiki (satu berkas per cacat, semua di
 * dalam kepemilikan W1):
 *  F1 universalRab.ts — isPriceValidForTotal menerima harga NEGATIF
 *     (gerbang "satu-satunya yang sah" membiarkan harga negatif
 *     mengurangi total, masuk payload transfer sebagai RESOLVED, dan
 *     memblokir pengisian Full AI).
 *  F2 priceCompletion.ts — rejectCompletion memulihkan kuantitas ke
 *     nilai ISIAN, bukan nilai sebelum pengisian (blok penyelesaian
 *     mencatat quantity pasca-isi / null).
 *  F3 finalizeMapping.ts — mapDedAiItemToRabInput /
 *     mapFullAiItemToRabInput hanya menahan null: kuantitas/harga
 *     <= 0 atau NaN lolos menjadi baris RAB (mapper Magic AI sudah
 *     menahannya).
 *  F4 quantity.ts — computeQuantity menerima dimensi negatif/nol dan
 *     mengembalikan kuantitas negatif, bukan null (cabang nilai
 *     eksplisit sudah mensyaratkan > 0).
 *  F5 dedAhspMatchingEngine.ts — kode CUSTOM dari 4 digit milidetik
 *     Date.now: dua item tak cocok dalam milidetik yang sama mendapat
 *     KODE YANG SAMA (tabrakan identitas).
 *  F6 dedQtoCalculationEngine.ts — validateForCalculation hanya
 *     mengecek kehadiran dimensi: panjang/lebar/tinggi 0, negatif,
 *     atau NaN lolos lalu calculateQuantity mengembalikan kuantitas
 *     0/negatif/NaN dengan success=true.
 *
 * Deterministik, tanpa panggilan AI live, tanpa network.
 */
import {
  isPriceValidForTotal, pricedAmount, totalsFromItems, transferPriceStatus,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  completeDedItem, rejectCompletion,
} from '../ai-tools/ded-ai-estimate/priceCompletion';
import type { ExternalPriceReference } from '../ai-tools/ded-ai-estimate/externalPriceReferences';
import {
  mapDedAiItemToRabInput, mapFullAiItemToRabInput,
} from '../ai-tools/ded-ai-estimate/finalizeMapping';
import {
  computeQuantity, attemptQuantityFromDimensionString,
} from '../ai-tools/ded-ai-estimate/quantity';
import { dedAhspMatchingEngine } from '../services/dedAhspMatchingEngine';
import { dedQtoCalculationEngine } from '../services/dedQtoCalculationEngine';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';
import type { DEDWorkItem, DimensionExtraction } from '../domain/ded/dedPipelineTypes';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-11-10T00:00:00Z');
const CTX = { floorAreaM2: 48.5, ceilingAreaM2: 29.5, buildingPerimeterM: 24, doorUnits: 4, roomCount: 4 };

const baseItem = (over: Partial<DedAiItem>): DedAiItem => ({
  id: 'w1-1', name: 'Item Uji', category: 'Uji', units: 'm2',
  quantity: 10, quantitySource: 'DERIVED', unitPrice: null,
  priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [], provenance: [],
  stage: 'PARSE', ...over,
} as DedAiItem);

const baseFullAi = (over: { qty: number | null; price: number | null }): FullAiItem => ({
  id: 'f-1', no: 1, name: 'Item Full AI', category: 'Uji',
  quantity: { value: over.qty, unit: 'm2', provenance: 'DERIVED', confidence: 'MEDIUM' },
  price: { unitPrice: over.price, unit: 'm2', source: 'AI_ESTIMATE' },
  subtotal: null, subtotalVerified: false,
  status: 'READY', exclusionReason: null,
} as FullAiItem);

// ===========================================================================
// F1 — harga negatif bukan harga valid (gerbang tunggal)
// ===========================================================================
console.log('== F1. Harga negatif ditolak gerbang harga ==');
check('F1.1 isPriceValidForTotal menolak unitPrice negatif berstatus RESOLVED',
  isPriceValidForTotal({ priceStatus: 'PRICE_RESOLVED', unitPrice: -1000 }) === false);
check('F1.2 isPriceValidForTotal menolak unitPrice negatif berstatus MANUAL',
  isPriceValidForTotal({ priceStatus: 'PRICE_MANUAL', unitPrice: -5 }) === false);
check('F1.3 kontrak sentinel dipertahankan: unitPrice 0 eksplisit RESOLVED tetap valid',
  isPriceValidForTotal({ priceStatus: 'PRICE_RESOLVED', unitPrice: 0 }) === true);
check('F1.4 pricedAmount negatif → null (bukan jumlah negatif)',
  pricedAmount({ volume: 10, priceStatus: 'PRICE_RESOLVED', unitPrice: -1000 }) === null);
{
  const t = totalsFromItems([
    { volume: 10, unitPrice: -1000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' },
    { volume: 2, unitPrice: 50000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' },
  ]);
  check('F1.5 totalsFromItems mengecualikan item berharga negatif (total 100.000, bukan 90.000)',
    t.estimatedTotal === 100000 && t.unpricedCount === 1 && t.officialCount === 1,
    `total=${t.estimatedTotal} unpriced=${t.unpricedCount} official=${t.officialCount}`);
}
check('F1.6 transferPriceStatus: harga negatif → PRICE_UNRESOLVED (tidak masuk total engine)',
  transferPriceStatus({ priceStatus: 'PRICE_RESOLVED', unitPrice: -1000, priceSourceKind: 'OFFICIAL_AHSP' }) === 'PRICE_UNRESOLVED');

// ===========================================================================
// F2 — rejectCompletion memulihkan kuantitas SEBELUM pengisian
// ===========================================================================
console.log('== F2. Penolakan penyelesaian memulihkan kuantitas asal ==');
{
  // (a) Fragmen + harga yang sudah ada: blok dibuat markQuantityBasis.
  const frag = 0.00000357;
  const it = baseItem({
    name: 'Pelat dak beton t=120mm', units: 'm3', quantity: frag,
    quantitySource: 'DED_GEOMETRIC', unitPrice: 1000000, priceSource: 'AI_ESTIMATE',
  });
  const { item: done } = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  check('F2.1 pelat fragmen terisi estimasi dari luas plafon (3,54 m3)',
    done.quantity === 3.54 && done.quantitySource === 'ASSUMPTION', `qty=${done.quantity}`);
  check('F2.2 blok penyelesaian mencatat originalQuantity fragmen asal (bukan null)',
    done.priceCompletion?.originalQuantity === frag,
    `originalQuantity=${done.priceCompletion?.originalQuantity}`);
  const rejected = rejectCompletion(done);
  check('F2.3 tolak penyelesaian → kuantitas kembali ke fragmen asal',
    rejected.quantity === frag && rejected.quantitySource === 'UNRESOLVED',
    `qty=${rejected.quantity}`);
  check('F2.4 tolak penyelesaian → harga yang sudah ada dipertahankan (bukan isian)',
    rejected.unitPrice === 1000000, `price=${rejected.unitPrice}`);
}
{
  // (b) Kuantitas MISSING + harga terisi: blok dibuat applyReference.
  const stubRef: ExternalPriceReference = {
    id: 'W1-STUB-SEPTIC', matchKeywords: ['septic'], unit: 'unit',
    recommendedPrice: 2500000, rangeMin: 2000000, rangeMax: 3000000,
    scope: 'TERPASANG_PENUH', tier: 'CONTRACTOR_MARKET',
    sourceName: 'Stub Uji W1', sourceUrl: 'https://contoh.invalid/septic',
    sourceDate: '2026-11-01', accessedAt: '2026-11-10', region: 'Jawa Timur',
    confidence: 'MEDIUM', specAssumption: 'Septic tank + resapan standar 1 rumah',
  };
  const it = baseItem({
    name: 'Septic tank + resapan', units: 'unit', quantity: null,
    quantitySource: 'UNRESOLVED', unitPrice: null, priceSource: 'UNRESOLVED',
  });
  const { item: done } = completeDedItem(it, CTX, {
    policy: 'FULL_AI', now: NOW, resolveReference: () => stubRef,
  });
  check('F2.5 septic terisi kuantitas 1 + harga stub 2.500.000',
    done.quantity === 1 && done.unitPrice === 2500000,
    `qty=${done.quantity} price=${done.unitPrice}`);
  check('F2.6 blok penyelesaian mencatat originalQuantity null pra-isi (bukan 1 terisi)',
    done.priceCompletion?.originalQuantity === null,
    `originalQuantity=${done.priceCompletion?.originalQuantity}`);
  const rejected = rejectCompletion(done);
  check('F2.7 tolak penyelesaian → kuantitas kembali null (isian ter-undo)',
    rejected.quantity === null && rejected.quantitySource === 'UNRESOLVED',
    `qty=${rejected.quantity}`);
  check('F2.8 tolak penyelesaian → harga kembali null',
    rejected.unitPrice === null && rejected.priceSource === 'UNRESOLVED',
    `price=${rejected.unitPrice} source=${rejected.priceSource}`);
}

// ===========================================================================
// F3 — mapper finalisasi menahan kuantitas/harga non-positif & non-finite
// ===========================================================================
console.log('== F3. Mapper finalisasi menahan baris tak dapat dihitung ==');
check('F3.1 mapDedAiItem: kuantitas negatif → null',
  mapDedAiItemToRabInput(baseItem({ quantity: -2, unitPrice: 100000, priceSource: 'AI_ESTIMATE' }), 'FULL_AI') === null);
check('F3.2 mapDedAiItem: kuantitas 0 → null',
  mapDedAiItemToRabInput(baseItem({ quantity: 0, unitPrice: 100000, priceSource: 'AI_ESTIMATE' }), 'FULL_AI') === null);
check('F3.3 mapDedAiItem: kuantitas NaN → null',
  mapDedAiItemToRabInput(baseItem({ quantity: NaN, unitPrice: 100000, priceSource: 'AI_ESTIMATE' }), 'FULL_AI') === null);
check('F3.4 mapDedAiItem: harga negatif → null',
  mapDedAiItemToRabInput(baseItem({ quantity: 2, unitPrice: -5, priceSource: 'AI_ESTIMATE' }), 'FULL_AI') === null);
check('F3.5 mapDedAiItem: harga 0 → null (nol bukan harga sah di jalur AI)',
  mapDedAiItemToRabInput(baseItem({ quantity: 2, unitPrice: 0, priceSource: 'AI_ESTIMATE' }), 'FULL_AI') === null);
check('F3.6 mapDedAiItem: kontrol positif tetap menjadi baris',
  mapDedAiItemToRabInput(baseItem({ quantity: 2, unitPrice: 100000, priceSource: 'AI_ESTIMATE' }), 'FULL_AI') !== null);
check('F3.7 mapFullAiItem: kuantitas negatif → null',
  mapFullAiItemToRabInput(baseFullAi({ qty: -1, price: 100000 }), 'FULL_AI') === null);
check('F3.8 mapFullAiItem: harga 0 → null',
  mapFullAiItemToRabInput(baseFullAi({ qty: 2, price: 0 }), 'FULL_AI') === null);
check('F3.9 mapFullAiItem: kontrol positif tetap menjadi baris',
  mapFullAiItemToRabInput(baseFullAi({ qty: 2, price: 100000 }), 'FULL_AI') !== null);

// ===========================================================================
// F4 — computeQuantity menolak dimensi non-positif
// ===========================================================================
console.log('== F4. computeQuantity: dimensi non-positif → null ==');
check('F4.1 VOLUME panjang negatif → null',
  computeQuantity('VOLUME', { length: -5, width: 2, height: 3 }, 'uji').quantity === null);
check('F4.2 VOLUME lebar 0 → null',
  computeQuantity('VOLUME', { length: 5, width: 0, height: 3 }, 'uji').quantity === null);
check('F4.3 VOLUME kedalaman negatif (jalur L×W×D) → null',
  computeQuantity('VOLUME', { length: 5, width: 2, depth: -1 }, 'uji').quantity === null);
check('F4.4 AREA tinggi negatif (jalur L×H) → null',
  computeQuantity('AREA', { length: 5, height: -2 }, 'uji').quantity === null);
check('F4.5 LENGTH negatif → null',
  computeQuantity('LENGTH', { length: -3 }, 'uji').quantity === null);
check('F4.6 WEIGHT panjang negatif → null (bukan berat negatif)',
  computeQuantity('WEIGHT', { length: -10, width: 2, height: 0.5, ratioKgPerM3: 100 }, 'uji').quantity === null);
check('F4.7 string dimensi negatif "-5 x 2 x 3 m" → kuantitas null',
  attemptQuantityFromDimensionString('m3', '-5 x 2 x 3 m').quantity === null);
check('F4.8 kontrol positif VOLUME 2×3×4 = 24 tetap',
  computeQuantity('VOLUME', { length: 2, width: 3, height: 4 }, 'uji').quantity === 24);

// ===========================================================================
// F5 — kode CUSTOM AHSP unik per item
// ===========================================================================
console.log('== F5. Kode AI_CUSTOM unik (tanpa tabrakan milidetik) ==');
{
  const mkWorkItem = (name: string): DEDWorkItem => ({
    id: `w1-${name.slice(0, 4)}`, projectId: 'W1-PROJ', name,
    category: 'OTHER', sourceIds: ['src-1'], evidence: [],
    confidence: 'HIGH', status: 'CONFIRMED',
  } as DEDWorkItem);
  const m1 = dedAhspMatchingEngine.matchAhsp({ workItem: mkWorkItem('Xyzzy Plumbus Quantum Zzz') });
  const m2 = dedAhspMatchingEngine.matchAhsp({ workItem: mkWorkItem('Frobnicate Wibble Wobble Zqx') });
  check('F5.1 kedua item tak cocok menjadi AI_CUSTOM',
    m1.isCustomItem === true && m2.isCustomItem === true && m1.matchStatus === 'AI_CUSTOM' && m2.matchStatus === 'AI_CUSTOM',
    `m1=${m1.matchStatus} m2=${m2.matchStatus}`);
  check('F5.2 kode CUSTOM kedua item BERBEDA (tidak bertabrakan)',
    m1.ahspCode !== undefined && m2.ahspCode !== undefined && m1.ahspCode !== m2.ahspCode,
    `m1=${m1.ahspCode} m2=${m2.ahspCode}`);
  check('F5.3 format kode CUST-NNN',
    /^CUST-\d{3,}$/.test(m1.ahspCode ?? '') && /^CUST-\d{3,}$/.test(m2.ahspCode ?? ''),
    `m1=${m1.ahspCode} m2=${m2.ahspCode}`);
  check('F5.4 harga CUSTOM tetap PRICE_NOT_FOUND (bukan Rp0)',
    m1.priceResolution.priceSource === 'PRICE_NOT_FOUND' && m1.priceResolution.unitPrice === undefined);
}

// ===========================================================================
// F6 — QTO menolak dimensi tidak valid
// ===========================================================================
console.log('== F6. QTO: dimensi 0/negatif/NaN ditolak ==');
{
  const makeItem = (dims: DimensionExtraction): DEDWorkItem => ({
    id: 'w1-qto', projectId: 'W1-PROJ', name: 'Beton Kolom K-250',
    category: 'CONCRETE', sourceIds: ['src1'],
    evidence: [{
      sourceType: 'pdf', sourceId: 'src1', sourceName: 'DED.pdf',
      confidence: 'HIGH', status: 'VERIFIED',
    }],
    confidence: 'HIGH', status: 'CONFIRMED', dimensions: dims,
  } as unknown as DEDWorkItem);
  const baseDims = (over: Partial<DimensionExtraction>): DimensionExtraction => ({
    unit: 'm³', rawSnippets: [], scaleVerified: true, ...over,
  });
  const neg = dedQtoCalculationEngine.calculateQuantity(makeItem(baseDims({ length: -5, width: 0.6, height: 0.3 })));
  check('F6.1 panjang negatif → gagal INVALID_DIMENSION (bukan volume negatif)',
    neg.success === false && neg.errorState === 'INVALID_DIMENSION',
    `success=${neg.success} error=${neg.errorState} qty=${neg.quantity}`);
  const zero = dedQtoCalculationEngine.calculateQuantity(makeItem(baseDims({ length: 42.5, width: 0, height: 0.3 })));
  check('F6.2 lebar 0 → gagal INVALID_DIMENSION',
    zero.success === false && zero.errorState === 'INVALID_DIMENSION',
    `success=${zero.success} error=${zero.errorState}`);
  const nan = dedQtoCalculationEngine.calculateQuantity(makeItem(baseDims({ length: 42.5, width: 0.6, height: NaN })));
  check('F6.3 tinggi NaN → gagal INVALID_DIMENSION (bukan kuantitas NaN)',
    nan.success === false && nan.errorState === 'INVALID_DIMENSION',
    `success=${nan.success} error=${nan.errorState} qty=${nan.quantity}`);
  const ok = dedQtoCalculationEngine.calculateQuantity(makeItem(baseDims({ length: 42.5, width: 0.6, height: 0.3 })));
  check('F6.4 kontrol positif 42,50 × 0,60 × 0,30 = 7,65 m³ tetap',
    ok.success === true && ok.quantity === 7.65, `qty=${ok.quantity}`);
  const v = dedQtoCalculationEngine.validateForCalculation(makeItem(baseDims({ length: -1, width: 2, height: 3 })));
  check('F6.5 validateForCalculation langsung menolak dimensi negatif',
    v.isValid === false && v.errorState === 'INVALID_DIMENSION');
}

console.log(`\nW1: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

/**
 * REGRESI HARDENING DED ESTIMATE AI (2026-11-10, Tahap 1–6 master prompt
 * DED Final Hardening & Completion).
 *
 * Run: npx esbuild src/test/dedHardening.src.ts --bundle --platform=node
 *      --format=cjs --outfile=<folder>/dedHardening.cjs
 *      && node <folder>/dedHardening.cjs
 *
 * Mencakup:
 * - Tahap 1: klasifikasi kuantitas eksplisit (mikro/fragmen, nol
 *   eksplisit, hilang, satuan salah, dimensi hilang, dimensi konflik,
 *   deskripsi ganda, editan user, disetujui, bukti kurang) + blok audit
 *   (nilai asli/usulan/metode/rumus/asumsi/keyakinan/verifikasi/
 *   persetujuan) + estimasi tidak pernah naik kelas DRAWING_EXTRACTED.
 * - Tahap 2: sourceKind kosakata Unified Credits + konflik material
 *   (pintu kayu vs referensi aluminium → tidak terisi +
 *   NEEDS_VERIFICATION; genteng vs spandek; "Nok Spandek" BUKAN konflik).
 * - Tahap 3: cache — kunci simpan = kunci cari (hit lintas panggilan
 *   tanpa projectRegion), entri rusak ditolak, entri basi melewati
 *   batas umur maksimum dibuang, entri basi dalam batas tetap tertanda.
 * - Tahap 4: paritas ded-full-ai — completeFullAiQuantities mengisi
 *   kuantitas hilang/fragmen dari konteks denah (layanan bersama),
 *   nol eksplisit tidak diisi, DATABASE tidak disentuh fungsi ini.
 * - Tahap 5: terima eksplisit (acceptCompletion → APPROVED), tolak
 *   memulihkan + mencabut blok audit isian.
 * - Tahap 6: metadata usage (buildDedUsageFromStandard /
 *   buildDedUsageFromFullAi) — token null jujur, featureKey matriks,
 *   panggilan model dari jejak pass, status PARTIAL.
 */
import {
  completeDedItem, completeDedBatch, derivePlanContext, classifyQuantityProvenance,
  buildQuantityAudit, acceptCompletion, rejectCompletion, priceSourceKindFor,
} from '../ai-tools/ded-ai-estimate/priceCompletion';
import {
  EXTERNAL_PRICE_REFERENCES, findExternalReference, referenceSpecConflict, findConflictingReference,
} from '../ai-tools/ded-ai-estimate/externalPriceReferences';
import {
  putResearch, getResearch, clearResearchCache, isValidCachedEntry,
  RESEARCH_CACHE_TTL_DAYS,
} from '../ai-tools/ded-ai-estimate/priceResearchCache';
import { completeFullAiQuantities } from '../ai-tools/ded-full-ai/service';
import { buildDedUsageFromStandard, buildDedUsageFromFullAi } from '../ai-tools/ded-ai-estimate/usageMetadata';
import type { DedAiItem, DedAiOutput } from '../ai-tools/ded-ai-estimate/types';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`); }
}

const NOW = new Date('2026-11-10T00:00:00Z');
const CTX = { floorAreaM2: 48.5, ceilingAreaM2: 29.5, buildingPerimeterM: 24, doorUnits: 4, roomCount: 4 };
const baseItem = (over: Partial<DedAiItem>): DedAiItem => ({
  id: 'h-1', name: 'Item Uji', category: 'Uji', units: 'm2',
  quantity: 10, quantitySource: 'DERIVED', unitPrice: null,
  priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [], provenance: [],
  stage: 'PARSE', ...over,
} as DedAiItem);

// ===========================================================================
// Tahap 1 — klasifikasi kuantitas
// ===========================================================================
console.log('== Tahap 1: klasifikasi kuantitas ==');
check('T1.1 kuantitas mikro struktural = IMPLAUSIBLE_FRAGMENT',
  classifyQuantityProvenance(baseItem({ name: 'Pelat Lantai Beton', units: 'm3', quantity: 0.0000035714, quantitySource: 'DERIVED' })) === 'IMPLAUSIBLE_FRAGMENT');
check('T1.2 nol eksplisit disengaja = EXPLICIT_ZERO (bukan estimasi)',
  classifyQuantityProvenance(baseItem({ name: 'Pekerjaan Opsional', quantity: 0, quantitySource: 'DED_EXPLICIT' })) === 'EXPLICIT_ZERO');
check('T1.3 kuantitas hilang = MISSING',
  classifyQuantityProvenance(baseItem({ quantity: null, quantitySource: 'UNRESOLVED' })) === 'MISSING');
check('T1.4 fakta gambar = DRAWING_EXTRACTED',
  classifyQuantityProvenance(baseItem({ quantity: 12, quantitySource: 'DED_EXPLICIT' })) === 'DRAWING_EXTRACTED');
check('T1.5 editan user = USER_PROVIDED',
  classifyQuantityProvenance(baseItem({ quantity: 7, quantitySource: 'USER_INPUT' })) === 'USER_PROVIDED');
check('T1.6 derivasi deterministik = CALCULATED_FROM_VERIFIED_INPUT',
  classifyQuantityProvenance(baseItem({ quantity: 9.6, quantitySource: 'DED_GEOMETRIC' })) === 'CALCULATED_FROM_VERIFIED_INPUT');
check('T1.7 asumsi = ESTIMATED_FROM_CONTEXT (tidak pernah DRAWING_EXTRACTED)',
  classifyQuantityProvenance(baseItem({ quantity: 6, quantitySource: 'ASSUMPTION' })) === 'ESTIMATED_FROM_CONTEXT'
  && classifyQuantityProvenance(baseItem({ quantity: 6, quantitySource: 'AI_INFERENCE' })) === 'ESTIMATED_FROM_CONTEXT');
check('T1.8 evaluator menandai tidak wajar = NEEDS_REVIEW',
  classifyQuantityProvenance(baseItem({
    quantity: 500, quantitySource: 'DED_EXPLICIT',
    quantityReview: { outcome: 'NEEDS_REVIEW', reasonCode: 'X', explanation: 'x', severity: 'HIGH', originalQuantity: 500 },
  })) === 'NEEDS_REVIEW');
// Satuan salah: fragmen listplank satuan panjang < 1
check('T1.9 fragmen listplank satuan m\' = IMPLAUSIBLE_FRAGMENT',
  classifyQuantityProvenance(baseItem({ name: 'Listplank Kalsiboard', units: "m'", quantity: 0.0295, quantitySource: 'DERIVED' })) === 'IMPLAUSIBLE_FRAGMENT');
// Dimensi bangunan hilang: tanpa konteks, estimasi tidak dikarang
{
  const emptyCtx = { floorAreaM2: null, ceilingAreaM2: null, buildingPerimeterM: null, doorUnits: null, roomCount: null };
  const { item } = completeDedItem(baseItem({ name: 'Titik Penerangan', units: 'titik', quantity: null, quantitySource: 'UNRESOLVED' }), emptyCtx, { policy: 'FULL_AI', now: NOW });
  check('T1.10 dimensi hilang → kuantitas tetap kosong + audit MISSING',
    item.quantity == null && item.quantityAudit?.classification === 'MISSING');
}
// Deskripsi ganda: dua item bernama sama diproses independen, keduanya terklasifikasi
{
  const items = [
    baseItem({ id: 'd1', name: 'Titik Penerangan', units: 'titik', quantity: null, quantitySource: 'UNRESOLVED' }),
    baseItem({ id: 'd2', name: 'Titik Penerangan', units: 'titik', quantity: null, quantitySource: 'UNRESOLVED' }),
  ];
  const res = completeDedBatch(items, CTX, { policy: 'FULL_AI', now: NOW });
  check('T1.11 deskripsi ganda: kedua item dilengkapi & teraudit independen',
    res.items.every((it) => it.quantity === 6 && it.quantityAudit?.classification === 'ESTIMATED_FROM_CONTEXT'));
}
// Blok audit lengkap untuk isian konteks (nilai contoh program lalu tetap estimasi)
{
  const { item } = completeDedItem(
    baseItem({ name: 'Pelat Lantai Beton Bertulang', units: 'm3', quantity: 0.0000035714, quantitySource: 'DERIVED' }),
    CTX, { policy: 'FULL_AI', now: NOW });
  const qa = item.quantityAudit;
  check('T1.12 fragmen beton → estimasi 2,95 m3 ber-audit lengkap (asli tercatat, PENDING)',
    item.quantity === 2.95 && qa?.classification === 'ESTIMATED_FROM_CONTEXT'
    && qa?.originalQuantity === 0.0000035714 && qa?.proposedQuantity === 2.95
    && qa?.method === 'plan-context-estimate' && typeof qa?.formula === 'string'
    && qa?.userApprovalStatus === 'PENDING' && qa?.verificationStatus === 'UNVERIFIED'
    && qa != null && qa.inputs.some((i) => i.name === 'ceilingAreaM2'));
  check('T1.13 buildQuantityAudit murni: fakta gambar NOT_REQUIRED + VERIFIED',
    (() => { const a = buildQuantityAudit(baseItem({ quantity: 3, quantitySource: 'DED_EXPLICIT' })); return a.classification === 'DRAWING_EXTRACTED' && a.userApprovalStatus === 'NOT_REQUIRED' && a.verificationStatus === 'VERIFIED'; })());
}

// ===========================================================================
// Tahap 2 — provenans & konflik material
// ===========================================================================
console.log('== Tahap 2: sourceKind + konflik spesifikasi ==');
check('T2.1 pemetaan sourceKind lengkap',
  priceSourceKindFor('OFFICIAL_AHSP_VERIFIED') === 'OFFICIAL_AHSP'
  && priceSourceKindFor('OFFICIAL_REGIONAL_REFERENCE') === 'OFFICIAL_SSH_HSPK'
  && priceSourceKindFor('MARKET_REFERENCE', 'SUPPLIER_MANUFACTURER') === 'VERIFIED_SUPPLIER'
  && priceSourceKindFor('MARKET_REFERENCE', 'CONTRACTOR_MARKET') === 'MARKET_REFERENCE'
  && priceSourceKindFor('AI_ESTIMATE') === 'AI_ESTIMATE'
  && priceSourceKindFor('MANUAL_PRICE') === 'USER_MANUAL'
  && priceSourceKindFor('PRICE_UNRESOLVED') === 'UNRESOLVED');
{
  const p1 = EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-pintu-p1-double-hpl')!;
  check('T2.2 pintu kayu vs referensi aluminium = konflik',
    referenceSpecConflict('Pintu Double Kayu Kamper P1', p1) != null
    && findExternalReference('Pintu Double Kayu Kamper P1', 'unit') === null);
  const filled = completeDedItem(baseItem({ name: 'Pintu Double Kayu Kamper P1', units: 'unit', quantity: 1 }), CTX, { policy: 'FULL_AI', now: NOW });
  check('T2.3 konflik → harga tetap kosong + NEEDS_VERIFICATION',
    filled.item.unitPrice == null && filled.item.priceCompletion?.verificationStatus === 'NEEDS_VERIFICATION'
    && findConflictingReference('Pintu Double Kayu Kamper P1', 'unit')?.ref.id === 'ext-pintu-p1-double-hpl');
  check('T2.4 "Nok Spandek" BUKAN konflik genteng (kata genteng tidak berdiri sendiri)',
    referenceSpecConflict('Nok Spandek', EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-nok-spandek')!) === null
    && findExternalReference('Nok Spandek', "m'")?.id === 'ext-nok-spandek');
  check('T2.5 atap genteng tanah liat vs referensi spandek = konflik',
    findExternalReference('Penutup Atap Genteng Tanah Liat', 'm2') === null);
  const filledRef = completeDedItem(baseItem({ name: 'Plafon Gypsum Rangka Hollow', units: 'm2', quantity: 29.5 }), CTX, { policy: 'FULL_AI', now: NOW });
  check('T2.6 isian pasar membawa sourceKind (tier kontraktor → MARKET_REFERENCE) + UNVERIFIED + PENDING',
    filledRef.item.priceCompletion?.classification === 'MARKET_REFERENCE'
    && filledRef.item.priceCompletion?.sourceKind === 'MARKET_REFERENCE'
    && filledRef.item.priceCompletion?.verificationStatus === 'UNVERIFIED'
    && filledRef.item.priceCompletion?.userApprovalStatus === 'PENDING');
  const ahsp = completeDedItem(baseItem({ name: 'Beton K-250', units: 'm3', quantity: 5, unitPrice: 950000, priceSource: 'AHSP_2026' }), CTX, { policy: 'FULL_AI', now: NOW });
  check('T2.7 AHSP: sourceKind OFFICIAL_AHSP + VERIFIED',
    ahsp.item.priceCompletion?.sourceKind === 'OFFICIAL_AHSP' && ahsp.item.priceCompletion?.verificationStatus === 'VERIFIED');
}

// ===========================================================================
// Tahap 3 — cache & kesegaran
// ===========================================================================
console.log('== Tahap 3: cache ==');
{
  clearResearchCache();
  const it = baseItem({ name: 'Rangka Atap Baja Ringan', units: 'm2', quantity: 90 });
  const first = completeDedItem(it, CTX, { policy: 'FULL_AI', now: NOW });
  const entry = getResearch({ description: 'Rangka Atap Baja Ringan', unit: 'm2', region: '', scope: 'TERPASANG_PENUH' }, NOW);
  check('T3.1 kunci simpan = kunci cari: hit sesudah pengisian pertama',
    first.item.unitPrice != null && entry != null && entry.entry.reference.id === 'ext-rangka-baja-ringan');
  check('T3.2 entri rusak (harga 0 / tanpa id) tidak sah',
    !isValidCachedEntry({ key: 'x', reference: { id: '', recommendedPrice: 0, unit: '' }, fetchedAt: '2026-11-10', expiresAt: '2026-12-10' })
    && !isValidCachedEntry(null) && !isValidCachedEntry({}));
  const beyond = new Date(NOW.getTime() + (RESEARCH_CACHE_TTL_DAYS + 91) * 24 * 3600 * 1000);
  check('T3.3 basi melewati batas umur maksimum → dibuang (miss)',
    getResearch({ description: 'Rangka Atap Baja Ringan', unit: 'm2', region: '', scope: 'TERPASANG_PENUH' }, beyond) === null);
  clearResearchCache();
  const ref = EXTERNAL_PRICE_REFERENCES[0];
  putResearch({ description: 'Uji Segar', unit: ref.unit, region: '', scope: ref.scope }, ref, '2026-11-10');
  const staleHit = getResearch({ description: 'Uji Segar', unit: ref.unit, region: '', scope: ref.scope }, new Date('2026-12-25T00:00:00Z'));
  check('T3.4 basi dalam batas → tetap dikembalikan tertanda stale (tidak naik kelas)',
    staleHit != null && staleHit.stale === true);
  clearResearchCache();
}

// ===========================================================================
// Tahap 4 — paritas ded-full-ai
// ===========================================================================
console.log('== Tahap 4: paritas Full AI ==');
{
  const mk = (over: Partial<FullAiItem>): FullAiItem => ({
    id: 'f', no: 1, name: 'Item', category: 'Uji',
    quantity: { value: 10, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' },
    price: { unitPrice: 100000, unit: 'm2', source: 'AI_ESTIMATE' },
    subtotal: 1000000, subtotalVerified: true, status: 'READY', exclusionReason: null,
    ...over,
  } as FullAiItem);
  const items: FullAiItem[] = [
    mk({ id: 'f1', name: 'Pemasangan Keramik Lantai 40x40', quantity: { value: 48.5, unit: 'm2', provenance: 'EXPLICIT', confidence: 'HIGH' } }),
    mk({ id: 'f2', name: 'Titik Penerangan', quantity: { value: null, unit: 'titik', provenance: 'UNRESOLVED', confidence: 'LOW' }, price: { unitPrice: 185000, unit: 'titik', source: 'AI_ESTIMATE' }, subtotal: null, subtotalVerified: false, status: 'UNRESOLVED', exclusionReason: 'MISSING_QUANTITY' }),
    mk({ id: 'f3', name: 'Pekerjaan Opsional Tidak Dilakukan', quantity: { value: 0, unit: 'unit', provenance: 'EXPLICIT', confidence: 'HIGH' }, subtotal: null, subtotalVerified: false, status: 'UNRESOLVED', exclusionReason: 'MISSING_QUANTITY' }),
    mk({ id: 'f4', name: 'Pengukuran dan Bouwplank', quantity: { value: 24, unit: "m'", provenance: 'EXPLICIT', confidence: 'HIGH' } }),
    mk({ id: 'f5', name: 'Listplank Kalsiboard 30 cm', quantity: { value: 0.0295, unit: "m'", provenance: 'DERIVED', confidence: 'MEDIUM' }, price: { unitPrice: 65000, unit: "m'", source: 'AI_ESTIMATE' }, subtotal: null, subtotalVerified: false, status: 'UNRESOLVED', exclusionReason: 'MISSING_QUANTITY' }),
  ];
  const filledCount = completeFullAiQuantities(items);
  check('T4.1 kuantitas hilang terisi dari konteks denah (penerangan = ceil(48,5/9) = 6)',
    items[1].quantity.value === 6 && items[1].quantity.provenance === 'ASSUMPTION'
    && items[1].status === 'READY' && items[1].subtotal === 6 * 185000);
  check('T4.2 fragmen listplank terisi dari keliling (24 m\') berlabel asumsi + formula',
    items[4].quantity.value === 24 && items[4].quantity.provenance === 'ASSUMPTION'
    && typeof items[4].quantity.formula === 'string' && (items[4].quantity.assumptions?.length ?? 0) > 0);
  check('T4.3 nol eksplisit TIDAK diisi; jumlah terisi = 2',
    items[2].quantity.value === 0 && filledCount === 2);
  check('T4.4 isian tidak menyamar: catatan menyebut nilai asli & bukan fakta gambar',
    /bukan fakta gambar/.test(items[1].quantity.notes || ''));
}

// ===========================================================================
// Tahap 5 — terima / tolak eksplisit
// ===========================================================================
console.log('== Tahap 5: persetujuan user ==');
{
  const { item } = completeDedItem(baseItem({ name: 'Plafon Gypsum Rangka Hollow', units: 'm2', quantity: 29.5 }), CTX, { policy: 'FULL_AI', now: NOW });
  const accepted = acceptCompletion(item);
  check('T5.1 terima eksplisit → APPROVED pada harga (nilai tidak berubah)',
    accepted.priceCompletion?.userApprovalStatus === 'APPROVED' && accepted.unitPrice === item.unitPrice);
  const rejected = rejectCompletion(item);
  check('T5.2 tolak → harga dipulihkan kosong + blok audit isian dicabut',
    rejected.unitPrice == null && rejected.priceCompletion === undefined);
  const qtyFilled = completeDedItem(
    baseItem({ name: 'Titik Penerangan', units: 'titik', quantity: null, quantitySource: 'UNRESOLVED', unitPrice: 185000, priceSource: 'AI_ESTIMATE' }),
    CTX, { policy: 'FULL_AI', now: NOW }).item;
  const qtyAccepted = acceptCompletion(qtyFilled);
  const qtyRejected = rejectCompletion(qtyFilled);
  check('T5.3 terima/tolak kuantitas isian: APPROVED tercatat; tolak memulihkan kuantitas asli (null)',
    qtyAccepted.quantityAudit?.userApprovalStatus === 'APPROVED'
    && qtyRejected.quantity == null && qtyRejected.quantityAudit === undefined);
}

// ===========================================================================
// Tahap 6 — metadata usage
// ===========================================================================
console.log('== Tahap 6: usage metadata ==');
{
  const output = {
    jobId: 'dedai-test-1', mode: 'DETAIL', policy: 'FULL_AI', partial: true,
    completionReport: { filledMarketReference: 3, filledAiEstimate: 1 },
    analysisTrace: {
      passes: [
        { clusterLabel: 'A', status: 'OK', passStatus: 'SUCCESS', retryCount: 1 },
        { clusterLabel: 'B', status: 'SKIPPED_BUDGET', passStatus: 'SKIPPED_BUDGET' },
        { clusterLabel: 'C', status: 'FAILED', passStatus: 'FAILED', errorCode: 'TIMEOUT' },
      ],
    },
  } as unknown as DedAiOutput;
  const u = buildDedUsageFromStandard(output, { projectId: 'PRJ-1' });
  check('T6.1 usage standar: workflow=jobId, panggilan model hanya pass terkirim (2), retry tercatat',
    u.workflowId === 'dedai-test-1' && u.modelCalls === 2 && u.retries === 1 && u.status === 'PARTIAL');
  check('T6.2 token & biaya null jujur; featureKey matriks; riset terapan tercatat',
    u.inputTokens === null && u.outputTokens === null && u.providerCostIdr === null
    && u.featureKey === 'ded-ai/medium' && u.externalResearchApplications === 4 && u.projectId === 'PRJ-1'
    && u.errors.length === 1);
  const uf = buildDedUsageFromFullAi(
    { provenance: { provider: 'gemini', model: 'gemini-x' }, items: [{ price: { filledFromExternalRef: true } }, { price: {} }], isPartial: false, warnings: [] },
    { workflowId: 'fullai-1', policy: 'FULL_AI' });
  check('T6.3 usage Full AI: provider/model aktual tercatat, featureKey ded-ai/full-ai',
    uf.provider === 'gemini' && uf.model === 'gemini-x' && uf.featureKey === 'ded-ai/full-ai'
    && uf.modelCalls === 1 && uf.externalResearchApplications === 1 && uf.inputTokens === null);
}

console.log(`\nHASIL: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);

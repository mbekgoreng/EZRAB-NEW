/**
 * W4 — DED-RAB AI DUAL MODE (§6 pipeline Full AI 7 tahap + §9
 * spreadsheet/finansial + §11 error handling), 2026-11-13.
 *
 * Cakupan suite:
 *  1. Pipeline 7 tahap: definisi kanonis + urutan + pin wiring
 *     `runExecute` (jejak tahap terekam berurutan; QC sebelum total).
 *  2. QC §6.7: 6 pemeriksaan + kejujuran iterasi (revisionIterations
 *     SELALU 0 — tidak ada loop revisi otomatis).
 *  3. Validasi-sebelum-sisip: all-or-nothing; kegagalan tidak merusak
 *     RAB aktif (simulasi store + pin atomisitas bulkAdd).
 *  4. G-SP-1: kesetaraan total DED vs engine kanonis gaya P3B
 *     (DedAiCalculator + sum inline Full AI vs recalculateCostSummary
 *     pada fixture yang sama; selisih Rp0) + karakterisasi celah
 *     mapper-drop (W4-SP-1) + selisih O&P/pajak terukur.
 *
 * Gaya plain-tsx (tanpa vitest — vitest tidak terinstal di sandbox):
 * jalankan dari ROOT repo: `npx tsx src/test/w4FullAiPipeline.test.ts`
 *
 * Catatan: `runExecute` sendiri TIDAK dieksekusi di sini (butuh gateway
 * AI live — tanpa panggilan provider berbayar). Urutan eksekusi 7 tahap
 * di dalam `runExecute` dikunci lewat pin sumber (§1.3); perilaku
 * tahapnya diuji lewat fungsi murni yang dipanggilnya (QC, total,
 * validasi finalisasi).
 */
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  FULL_AI_PIPELINE_STAGES,
  FULL_AI_STAGE_ORDER,
  computeFullAiGrandTotal,
  runFullAiQualityControl,
} from '../ai-tools/ded-full-ai/qualityControl';
import {
  validateDedFinalizeBatch,
  validateFullAiFinalizeBatch,
  formatFinalizeFailures,
  type DedFinalizeValidation,
} from '../ai-tools/ded-ai-estimate/dedFinalizeValidation';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import {
  mapDedAiItemToRabInput,
  mapFullAiItemToRabInput,
} from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { verifySubtotal } from '../ai-tools/ded-full-ai/validator';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e: any) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e?.message ?? e}`);
  }
}
const eq = (a: unknown, b: unknown, msg: string) => {
  if (a !== b) throw new Error(`${msg} (dapat ${a}, harap ${b})`);
};
const here = dirname(fileURLToPath(import.meta.url));
const srcOf = (rel: string) => readFileSync(join(here, rel), 'utf8');

// ---------------------------------------------------------------- fixture
const mkDed = (over: Partial<DedAiItem>): DedAiItem =>
  ({
    id: 'ded-1',
    name: 'Pekerjaan A',
    category: 'Lain-lain',
    units: 'm3',
    quantity: 10,
    quantitySource: 'DED_EXPLICIT',
    unitPrice: 100000,
    priceSource: 'AI_ESTIMATE',
    subtotal: null,
    sourcePages: [1],
    provenance: [],
    stage: 'PARSE',
    ...over,
  } as DedAiItem);

const mkFullAi = (over: Partial<FullAiItem> & { quantity?: Partial<FullAiItem['quantity']>; price?: Partial<FullAiItem['price']> }): FullAiItem => {
  const { quantity, price, ...rest } = over as any;
  return {
    id: 'fullai-1',
    no: 1,
    wbsCode: 'BGN-01',
    wbsGroup: 'Pekerjaan Persiapan',
    name: 'Pekerjaan A',
    category: 'Lain-lain',
    quantity: {
      value: 10, unit: 'm3', formula: '10 × 1 × 1',
      provenance: 'EXPLICIT', confidence: 'HIGH', ...quantity,
    },
    price: { unitPrice: 100000, unit: 'm3', source: 'AI_ESTIMATE', ...price },
    subtotal: 1000000,
    subtotalVerified: true,
    status: 'READY',
    exclusionReason: null,
    ...rest,
  } as FullAiItem;
};

const QC_CTX = { projectType: 'BANGUNAN', scopeSummary: 'Ringkasan cakupan tes.', documentPages: 5 };

// ----------------------------------------------- 1. pipeline 7 tahap
console.log('== 1. Pipeline Full AI 7 tahap (§6) ==');

check('1.1 FULL_AI_PIPELINE_STAGES: persis 7 tahap, urutan 1..7, id sesuai §6', () => {
  eq(FULL_AI_PIPELINE_STAGES.length, 7, 'jumlah tahap');
  const ids = FULL_AI_PIPELINE_STAGES.map((s) => s.id);
  eq(
    ids.join(','),
    'DOCUMENT_INTELLIGENCE,SCOPE_WBS,METHOD_REASONING,AI_AHSP_GENERATION,AI_PRICING,QUANTITY_VOLUME,QUALITY_CONTROL',
    'urutan id tahap §6.1–§6.7',
  );
  FULL_AI_PIPELINE_STAGES.forEach((s, i) => eq(s.order, i + 1, `order tahap ${s.id}`));
  eq(FULL_AI_STAGE_ORDER.DOCUMENT_INTELLIGENCE, 1, 'order map tahap 1');
  eq(FULL_AI_STAGE_ORDER.QUALITY_CONTROL, 7, 'order map tahap 7');
});

check('1.2 nama tahap sesuai directive (tanpa klaim pass terpisah untuk 2–4)', () => {
  const byId = Object.fromEntries(FULL_AI_PIPELINE_STAGES.map((s) => [s.id, s]));
  eq(byId.DOCUMENT_INTELLIGENCE.name, 'Document Intelligence', 'nama tahap 1');
  eq(byId.SCOPE_WBS.name, 'Scope + WBS', 'nama tahap 2');
  eq(byId.METHOD_REASONING.name, 'Construction Method Reasoning', 'nama tahap 3');
  eq(byId.AI_AHSP_GENERATION.name, 'AI AHSP Generation', 'nama tahap 4');
  eq(byId.AI_PRICING.name, 'AI Pricing', 'nama tahap 5');
  eq(byId.QUANTITY_VOLUME.name, 'Quantity + Volume', 'nama tahap 6');
  eq(byId.QUALITY_CONTROL.name, 'Quality Control', 'nama tahap 7');
  // Tahap 2–4 dinyatakan model-side di deskripsinya (jujur: satu panggilan AI).
  for (const id of ['SCOPE_WBS', 'METHOD_REASONING', 'AI_AHSP_GENERATION'] as const) {
    assert.ok(
      byId[id].description.includes('satu panggilan AI'),
      `deskripsi ${id} menyatakan model-side satu panggilan AI`,
    );
  }
  assert.ok(
    byId.QUALITY_CONTROL.description.includes('0 iterasi'),
    'deskripsi QC menyatakan 0 iterasi revisi',
  );
});

check('1.3 [PIN SUMBER] runExecute merekam 7 tahap BERURUTAN + QC sebelum total + lampiran keluaran', () => {
  const svc = srcOf('../ai-tools/ded-full-ai/service.ts');
  const idx = (needle: string) => {
    const i = svc.indexOf(needle);
    assert.ok(i >= 0, `service.ts memuat ${needle}`);
    return i;
  };
  // Jejak tahap dicatat menurut urutan eksekusi nyata (posisi sumber menaik).
  const order = [
    idx("markStage(\n        'DOCUMENT_INTELLIGENCE'"),
    idx("markStage(\n        'SCOPE_WBS'"),
    idx("markStage(\n        'METHOD_REASONING'"),
    idx("markStage(\n        'AI_AHSP_GENERATION'"),
    idx("markStage(\n        'AI_PRICING'"),
    idx("markStage(\n        'QUANTITY_VOLUME'"),
    idx('runFullAiQualityControl(items, {'),
    idx("markStage(\n        'QUALITY_CONTROL'"),
    idx('computeFullAiGrandTotal(items)'),
  ];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i] > order[i - 1], `posisi sumber tahap ke-${i + 1} sesudah tahap ke-${i}`);
  }
  // QC berjalan sebelum total dihitung (total memakai item yang sudah diaudit).
  assert.ok(
    idx('runFullAiQualityControl(items, {') < idx('computeFullAiGrandTotal(items)'),
    'QC dipanggil sebelum total dihitung',
  );
  // Jejak + laporan dilampirkan ke keluaran sukses.
  assert.ok(svc.includes('pipelineStages: stageTrace'), 'keluaran melampirkan pipelineStages');
  assert.ok(svc.includes('qualityControl,'), 'keluaran melampirkan qualityControl');
  // Wilayah W5 TIDAK disentuh W4: resolusi kanonis + completion + gerbang harga tetap ada.
  // (Bentuk pemanggilan boleh berubah oleh refactor W5 — yang dipin adalah
  // keberadaan impor adapter + kedua fungsi, bukan sintaks panggilannya.)
  assert.ok(svc.includes("from '../ded-canonical/canonicalDedPricing'"), 'impor adapter kanonis (W5) tetap ada');
  assert.ok(svc.includes('matchDedItemToAhsp'), 'blok resolusi kanonis (W5) tetap ada');
  assert.ok(svc.includes('resolveDedPriceWithCanonical'), 'pemanggilan adapter (W5) tetap ada');
  assert.ok(svc.includes('completeFullAiPrices(items'), 'pemanggilan completion harga (W5) tetap ada');
  assert.ok(svc.includes('completeFullAiQuantities(items)'), 'pemanggilan completion kuantitas (W5) tetap ada');
  assert.ok(svc.includes('applyFullAiPricePolicy(policy, normalized.price'), 'applyFullAiPricePolicy (W5) tetap dipakai');
  // Total inline lama sudah diganti pemanggilan helper (satu rumus total).
  assert.ok(!svc.includes('.filter((it) => it.subtotal != null && it.subtotal > 0)\n        .reduce((sum, it) => sum + (it.subtotal || 0), 0);'), 'penjumlahan inline lama di runExecute sudah diganti computeFullAiGrandTotal');
});

check('1.4 computeFullAiGrandTotal ≡ semantik inline lama (termasuk subtotal 0/negatif/null)', () => {
  const items = [
    mkFullAi({ id: 'a', subtotal: 1000000 }),
    mkFullAi({ id: 'b', subtotal: 500000 }),
    mkFullAi({ id: 'c', subtotal: 0, status: 'UNRESOLVED', subtotalVerified: false }),
    mkFullAi({ id: 'd', subtotal: null, status: 'UNRESOLVED', subtotalVerified: false }),
    mkFullAi({ id: 'e', subtotal: -100, status: 'UNRESOLVED', subtotalVerified: false }),
  ];
  const inline = items
    .filter((it) => it.subtotal != null && it.subtotal > 0)
    .reduce((sum, it) => sum + (it.subtotal || 0), 0);
  const via = computeFullAiGrandTotal(items);
  eq(via.grandTotal, inline, 'helper == inline lama');
  eq(via.grandTotal, 1500000, 'total hanya subtotal positif');
  eq(via.includedCount, 2, '2 item masuk total');
  eq(via.excludedCount, 3, '3 item dikecualikan (0/null/negatif)');
});

// ------------------------------------------------------- 2. QC §6.7
console.log('== 2. Quality Control §6.7 (audit single-pass, 0 iterasi revisi) ==');

check('2.1 batch bersih: semua pemeriksaan lolos, 0 iterasi, 0 warning, item tak berubah', () => {
  const items = [
    mkFullAi({ id: 'a', name: 'Pekerjaan A' }),
    mkFullAi({ id: 'b', no: 2, name: 'Pekerjaan B', wbsCode: 'BGN-02', wbsGroup: 'Pekerjaan Tanah', quantity: { value: 5, unit: 'm2', formula: '5 × 1', provenance: 'DERIVED', confidence: 'MEDIUM' }, price: { unitPrice: 200000, unit: 'm2', source: 'USER_INPUT' }, subtotal: 1000000 }),
  ];
  const before = JSON.stringify(items);
  const qc = runFullAiQualityControl(items, QC_CTX);
  eq(qc.revisionIterations, 0, 'revisionIterations = 0 (tidak ada loop revisi)');
  eq(qc.revisionPassesExecuted, 0, 'revisionPassesExecuted = 0');
  eq(qc.passed, true, 'batch bersih lolos QC');
  eq(qc.checks.length, 6, '6 pemeriksaan QC');
  assert.ok(qc.checks.every((c) => c.passed), 'semua pemeriksaan lolos');
  eq(qc.warnings.length, 0, 'tanpa warning');
  eq(qc.unresolvedIssueCount, 0, 'tanpa isu tak terselesaikan');
  eq(JSON.stringify(items), before, 'QC tidak mengubah item (audit murni)');
});

check('2.2 duplikasi nama+satuan ditandai (warning), keduanya dipertahankan, tetap 0 iterasi', () => {
  const items = [
    mkFullAi({ id: 'a', name: 'Pekerjaan Sama' }),
    mkFullAi({ id: 'b', no: 2, name: 'Pekerjaan Sama' }),
    mkFullAi({ id: 'c', no: 3, name: 'Pekerjaan Lain' }),
  ];
  const qc = runFullAiQualityControl(items, QC_CTX);
  const dup = qc.checks.find((c) => c.id === 'duplicates')!;
  eq(dup.passed, false, 'pemeriksaan duplikasi gagal');
  eq(dup.severity, 'warning', 'duplikasi = warning (bukan error)');
  eq(dup.itemIds.join(','), 'a,b', 'item duplikat teridentifikasi');
  assert.ok(qc.warnings.some((w) => w.includes('Pekerjaan Sama')), 'warning menyebut nama duplikat');
  eq(qc.revisionIterations, 0, 'tetap 0 iterasi revisi');
  eq(qc.passed, true, 'warning saja tidak menggagalkan QC');
});

check('2.3 WBS: kode tak dikenal katalog + tak terklasifikasi ditandai (visibilitas P3D-O6/S6-O2)', () => {
  const items = [
    mkFullAi({ id: 'a', name: 'Pekerjaan Berkode Asing', wbsCode: 'XXX-99', wbsGroup: 'Kelompok Karangan Model' }),
    mkFullAi({ id: 'b', no: 2, name: 'Pekerjaan Tanpa WBS', wbsCode: undefined, wbsGroup: undefined }),
    mkFullAi({ id: 'c', no: 3, name: 'Pekerjaan Sah', wbsCode: 'BGN-01', wbsGroup: 'Pekerjaan Persiapan' }),
  ];
  const qc = runFullAiQualityControl(items, QC_CTX);
  const wbs = qc.checks.find((c) => c.id === 'wbs-hierarchy')!;
  eq(wbs.passed, false, 'pemeriksaan WBS gagal');
  assert.ok(wbs.detail.includes('XXX-99'), 'detail menyebut kode tak dikenal');
  assert.ok(wbs.detail.includes('1 dari 3 item tanpa klasifikasi WBS'), 'detail menghitung tak terklasifikasi');
  assert.ok(wbs.itemIds.includes('a') && wbs.itemIds.includes('b'), 'item bermasalah teridentifikasi');
  eq(qc.revisionIterations, 0, 'tetap 0 iterasi revisi');
});

check('2.4 satuan/rumus: satuan harga≠kuantitas, DERIVED tanpa rumus, rumus tanpa kuantitas', () => {
  const items = [
    mkFullAi({ id: 'a', name: 'Satuan Beda', price: { unitPrice: 100000, unit: 'm2', source: 'AI_ESTIMATE' } }),
    mkFullAi({ id: 'b', no: 2, name: 'Turunan Tanpa Rumus', quantity: { value: 5, unit: 'm3', formula: undefined, provenance: 'DERIVED', confidence: 'MEDIUM' } }),
    mkFullAi({ id: 'c', no: 3, name: 'Rumus Tanpa Volume', quantity: { value: null, unit: 'm3', formula: '2 × 3 × 4', provenance: 'DERIVED', confidence: 'LOW' }, subtotal: null, subtotalVerified: false, status: 'UNRESOLVED', exclusionReason: 'MISSING_QUANTITY' }),
  ];
  const qc = runFullAiQualityControl(items, QC_CTX);
  const uf = qc.checks.find((c) => c.id === 'unit-formula-consistency')!;
  eq(uf.passed, false, 'pemeriksaan satuan/rumus gagal');
  assert.ok(uf.detail.includes('Satuan Beda'), 'satuan tidak cocok ditandai');
  assert.ok(uf.detail.includes('Turunan Tanpa Rumus'), 'DERIVED tanpa rumus ditandai');
  assert.ok(uf.detail.includes('Rumus Tanpa Volume'), 'rumus tanpa kuantitas ditandai');
  eq(qc.revisionIterations, 0, 'tetap 0 iterasi revisi');
});

check('2.5 provenance: AHSP tanpa kode + VERIFIED_SOURCE warisan = warning; invarian subtotal = error', () => {
  const warnItems = [
    mkFullAi({ id: 'a', name: 'Kanonis Tanpa Kode', price: { unitPrice: 100000, unit: 'm3', source: 'AHSP_2026', ahspCode: undefined } }),
    mkFullAi({ id: 'b', no: 2, name: 'Klaim Warisan', price: { unitPrice: 100000, unit: 'm3', source: 'VERIFIED_SOURCE', ahspCode: 'B.38' } }),
  ];
  const qcWarn = runFullAiQualityControl(warnItems, QC_CTX);
  const provWarn = qcWarn.checks.find((c) => c.id === 'provenance-integrity')!;
  eq(provWarn.passed, false, 'provenance bermasalah gagal');
  eq(provWarn.severity, 'warning', 'tanpa pelanggaran invarian = warning');
  assert.ok(provWarn.detail.includes('Kanonis Tanpa Kode'), 'AHSP tanpa kode ditandai');
  assert.ok(provWarn.detail.includes('Klaim Warisan'), 'VERIFIED_SOURCE warisan ditandai');
  eq(qcWarn.passed, true, 'warning saja tidak menggagalkan QC');

  const errItems = [
    mkFullAi({ id: 'c', name: 'Verified Palsu', subtotal: null, subtotalVerified: true, status: 'UNRESOLVED', exclusionReason: 'MISSING_QUANTITY' }),
    mkFullAi({ id: 'd', no: 2, name: 'Aritmetika Salah', subtotal: 999999 }),
  ];
  const qcErr = runFullAiQualityControl(errItems, QC_CTX);
  const provErr = qcErr.checks.find((c) => c.id === 'provenance-integrity')!;
  eq(provErr.severity, 'error', 'pelanggaran invarian = error');
  assert.ok(provErr.detail.includes('INVARIAN DILANGGAR'), 'detail menyatakan pelanggaran invarian');
  eq(qcErr.passed, false, 'error menggagalkan QC (passed=false)');
  eq(qcErr.revisionIterations, 0, 'tetap 0 iterasi revisi — invarian dilaporkan, bukan diperbaiki diam-diam');
});

check('2.6 hasil kosong: scope gagal (error); kelengkapan menghitung unresolved yang dipertahankan', () => {
  const qcEmpty = runFullAiQualityControl([], QC_CTX);
  const scope = qcEmpty.checks.find((c) => c.id === 'scope-completeness')!;
  eq(scope.passed, false, 'scope kosong gagal');
  eq(scope.severity, 'error', 'hasil kosong = error');
  eq(qcEmpty.passed, false, 'QC gagal untuk hasil kosong');
  eq(qcEmpty.revisionIterations, 0, 'tetap 0 iterasi revisi');

  const mixed = [
    mkFullAi({ id: 'a', name: 'Siap' }),
    mkFullAi({ id: 'b', no: 2, name: 'Tanpa Harga', price: { unitPrice: null, unit: 'm3', source: 'UNRESOLVED' }, subtotal: null, subtotalVerified: false, status: 'NEEDS_CONFIRMATION', exclusionReason: 'MISSING_UNIT_PRICE' }),
    mkFullAi({ id: 'c', no: 3, name: 'Tanpa Volume', quantity: { value: null, unit: 'm3', provenance: 'UNRESOLVED', confidence: 'LOW' }, subtotal: null, subtotalVerified: false, status: 'UNRESOLVED', exclusionReason: 'MISSING_QUANTITY' }),
  ];
  const qcMixed = runFullAiQualityControl(mixed, QC_CTX);
  const comp = qcMixed.checks.find((c) => c.id === 'price-quantity-completeness')!;
  eq(comp.passed, false, 'kelengkapan gagal bila ada yang dikecualikan');
  assert.ok(comp.detail.includes('1 READY, 1 NEEDS_CONFIRMATION, 1 UNRESOLVED/EXCLUDED'), 'hitungan status eksplisit');
  assert.ok(comp.detail.includes('2 item dikecualikan dari total'), 'hitungan eksklusi eksplisit');
  assert.ok(qcMixed.warnings.some((w) => w.includes('tetap ditampilkan sebagai unresolved')), 'unresolved dipertahankan terlihat');
});

// --------------------------------------- 3. validasi-sebelum-sisip
console.log('== 3. Validasi-sebelum-sisip finalisasi (§9 + §11) ==');

/** Simulasi kontrak handler: sisip HANYA bila validasi ok (all-or-nothing). */
function simulateFinalize<T extends { mapped: unknown[] }>(
  validation: DedFinalizeValidation<any>,
  store: unknown[],
): { inserted: number } {
  if (!validation.ok) return { inserted: 0 };
  store.push(...(validation.mapped as unknown[]));
  return { inserted: validation.mapped.length };
}

check('3.1 standar valid: ok, semua terpetakan, blocked dihitung, needsReview dihitung', () => {
  const items = [
    mkDed({ id: 'a', name: 'Pekerjaan A', stage: 'CALCULATED', subtotal: 1000000 }),
    mkDed({ id: 'b', name: 'Pekerjaan B', stage: 'CALCULATED', subtotal: 1000000, quantity: 5, quantitySource: 'ASSUMPTION', units: 'm2', unitPrice: 200000, priceSource: 'USER_INPUT' }),
    mkDed({ id: 'c', name: 'Pekerjaan Ditolak', stage: 'REJECTED', subtotal: null, quantity: null, quantitySource: 'UNRESOLVED', unitPrice: null, priceSource: 'UNRESOLVED' }),
  ];
  const v = validateDedFinalizeBatch(items, 'FULL_AI');
  eq(v.ok, true, 'batch valid lolos');
  eq(v.savable.length, 2, '2 savable');
  eq(v.mapped.length, 2, '2 terpetakan');
  eq(v.failures.length, 0, 'tanpa kegagalan');
  eq(v.blockedCount, 1, '1 blocked (REJECTED)');
  eq(v.needsReviewCount, 1, '1 needsReview (ASSUMPTION)');
  eq(v.mapped[0].priceSourceKind, 'EZRAB_ASSUMPTION', 'AI_ESTIMATE → EZRAB_ASSUMPTION');
  eq(v.mapped[1].priceSourceLabel, 'Input User', 'USER_INPUT berlabel Input User');
});

check('3.2 standar: SATU item UNRESOLVED-berharga membatalkan SELURUH batch (tanpa sisip sebagian)', () => {
  const store: unknown[] = [
    { description: 'Baris RAB lama 1', volume: 1, unit: 'ls', unitPrice: 1000 },
    { description: 'Baris RAB lama 2', volume: 2, unit: 'ls', unitPrice: 2000 },
  ];
  const before = JSON.stringify(store);
  const items = [
    mkDed({ id: 'a', name: 'Pekerjaan Sah', stage: 'CALCULATED', subtotal: 1000000 }),
    // Item "beracun": CALCULATED + harga terisi, tapi sumber UNRESOLVED
    // (mapper mengembalikan null — tidak boleh jadi baris RAB berharga).
    mkDed({ id: 'b', name: 'Pekerjaan Tak Terpetakan', stage: 'CALCULATED', subtotal: 100000, quantity: 2, units: 'm2', unitPrice: 50000, priceSource: 'UNRESOLVED' }),
  ];
  const v = validateDedFinalizeBatch(items, 'FULL_AI');
  eq(v.ok, false, 'batch ditolak');
  eq(v.failures.length, 1, '1 kegagalan');
  eq(v.failures[0].itemName, 'Pekerjaan Tak Terpetakan', 'kegagalan menyebut itemnya');
  assert.ok(v.failures[0].reason.includes('UNRESOLVED'), 'alasan menyebut UNRESOLVED');
  const res = simulateFinalize(v, store);
  eq(res.inserted, 0, 'TIDAK ADA yang disisip');
  eq(JSON.stringify(store), before, 'RAB aktif tidak berubah (2 baris lama utuh)');
});

check('3.3 standar: baris hasil pemetaan cacat (volume/harga ≤ 0) ikut membatalkan batch', () => {
  const items = [
    mkDed({ id: 'a', name: 'Volume Negatif', stage: 'CALCULATED', subtotal: 100000, quantity: -5, unitPrice: 50000 }),
  ];
  const v = validateDedFinalizeBatch(items, 'FULL_AI');
  eq(v.ok, false, 'batch ditolak');
  assert.ok(v.failures[0].reason.includes('volume'), 'alasan menyebut volume tidak valid');
});

check('3.4 Full AI valid: ok; item blocked tidak menggagalkan batch', () => {
  const items = [
    mkFullAi({ id: 'a', name: 'Siap A' }),
    mkFullAi({ id: 'b', no: 2, name: 'Siap B' }),
    mkFullAi({ id: 'c', no: 3, name: 'Belum Siap', status: 'NEEDS_CONFIRMATION', subtotal: null, subtotalVerified: false, exclusionReason: 'MISSING_UNIT_PRICE', price: { unitPrice: null, unit: 'm3', source: 'UNRESOLVED' } }),
    mkFullAi({ id: 'd', no: 4, name: 'Tak Teresolusi', status: 'UNRESOLVED', subtotal: null, subtotalVerified: false, exclusionReason: 'MISSING_QUANTITY', quantity: { value: null, unit: 'm3', provenance: 'UNRESOLVED', confidence: 'LOW' } }),
  ];
  const v = validateFullAiFinalizeBatch(items, 'FULL_AI');
  eq(v.ok, true, 'batch lolos (blocked bukan kegagalan)');
  eq(v.savable.length, 2, '2 savable');
  eq(v.mapped.length, 2, '2 terpetakan');
  eq(v.blockedCount, 2, '2 blocked');
  eq(v.failures.length, 0, 'tanpa kegagalan');
});

check('3.5 tanpa savable: ok=false (handler memakai pesan finalize_none / tanpa-harga)', () => {
  const vDed = validateDedFinalizeBatch(
    [mkDed({ id: 'a', stage: 'REJECTED', subtotal: null, quantity: null, quantitySource: 'UNRESOLVED', unitPrice: null, priceSource: 'UNRESOLVED' })],
    'FULL_AI',
  );
  eq(vDed.ok, false, 'standar tanpa savable ditolak');
  eq(vDed.savable.length, 0, '0 savable');
  const vFull = validateFullAiFinalizeBatch(
    [mkFullAi({ id: 'a', status: 'UNRESOLVED', subtotal: null, subtotalVerified: false, exclusionReason: 'MISSING_QUANTITY' })],
    'FULL_AI',
  );
  eq(vFull.ok, false, 'Full AI tanpa savable ditolak');
});

check('3.6 formatFinalizeFailures: maks 5 baris + ringkasan sisanya', () => {
  const failures = Array.from({ length: 7 }, (_, i) => ({ itemId: `x${i}`, itemName: `Item ${i}`, reason: 'alasan' }));
  const text = formatFinalizeFailures(failures);
  const lines = text.split('\n');
  eq(lines.length, 6, '5 baris + 1 ringkasan');
  assert.ok(lines[5].includes('dan 2 item lainnya'), 'ringkasan menyebut 2 sisanya');
  assert.ok(lines[0].includes('"Item 0"'), 'baris menyebut nama item');
});

check('3.7 [PIN SUMBER] handler memvalidasi SEBELUM createProject/bulkAdd; pola flatMap-buang hilang', () => {
  const view = srcOf('../ai-tools/ded-ai-estimate/view.tsx');
  const h1 = view.indexOf('const handleFinalize');
  const h2 = view.indexOf('const handleFullAiFinalize');
  assert.ok(h1 >= 0 && h2 > h1, 'kedua handler ditemukan');
  const segStd = view.slice(h1, h2);
  const segFull = view.slice(h2);
  // Standar: validasi → (bila ok) createProject → bulkAdd.
  const vStd = segStd.indexOf('validateDedFinalizeBatch(items');
  const cStd = segStd.indexOf('createProject({');
  const bStd = segStd.indexOf('bulkAddRabItems(mappedInputs, projectId');
  assert.ok(vStd >= 0 && cStd > vStd && bStd > cStd, 'standar: validasi SEBELUM createProject SEBELUM bulkAdd');
  assert.ok(segStd.includes('if (!validation.ok)'), 'standar: gate !ok mengembalikan error');
  assert.ok(segStd.includes('const mappedInputs = validation.mapped;'), 'standar: bulkAdd memakai hasil validasi');
  assert.ok(!segStd.includes('flatMap'), 'standar: pola flatMap-buang diam-diam hilang');
  assert.ok(!segStd.includes('mapDedAiItemToRabInput('), 'standar: mapper tidak lagi dipanggil langsung di handler');
  // Full AI: pola yang sama.
  const vFull = segFull.indexOf('validateFullAiFinalizeBatch(items');
  const cFull = segFull.indexOf('createProject({');
  const bFull = segFull.indexOf('bulkAddRabItems(mappedInputs, projectId');
  assert.ok(vFull >= 0 && cFull > vFull && bFull > cFull, 'Full AI: validasi SEBELUM createProject SEBELUM bulkAdd');
  assert.ok(segFull.includes('if (!validation.ok)'), 'Full AI: gate !ok mengembalikan error');
  assert.ok(segFull.includes('const mappedInputs = validation.mapped;'), 'Full AI: bulkAdd memakai hasil validasi');
  assert.ok(!segFull.includes('flatMap'), 'Full AI: pola flatMap-buang diam-diam hilang');
  assert.ok(!segFull.includes('mapFullAiItemToRabInput('), 'Full AI: mapper tidak lagi dipanggil langsung di handler');
  // Kegagalan bulkAdd (catch) tidak mengaktifkan proyek / tidak menandai finalized:
  // setCurrentProjectId + setFinalized hanya muncul SEBELUM catch (di jalur sukses).
  for (const [label, seg] of [['standar', segStd], ['Full AI', segFull]] as const) {
    const catchIdx = seg.indexOf('} catch (e: any) {');
    const activateIdx = seg.indexOf('setCurrentProjectId(projectId)');
    const finalizedIdx = seg.indexOf('setFinalized(true)');
    assert.ok(catchIdx > 0 && activateIdx > 0 && activateIdx < catchIdx, `${label}: aktivasi proyek hanya di jalur sukses`);
    assert.ok(finalizedIdx > 0 && finalizedIdx < catchIdx, `${label}: flag finalized hanya di jalur sukses`);
  }
});

check('3.8 [PIN SUMBER] bulkAddRabItems atomik: semua record dibangun SEBELUM satu setState sisip', () => {
  const ctx = srcOf('../context/ProjectContext.tsx');
  const start = ctx.indexOf('const bulkAddRabItems = useCallback(');
  assert.ok(start >= 0, 'bulkAddRabItems ditemukan');
  const seg = ctx.slice(start, start + 8000);
  const buildIdx = seg.indexOf('createRabItemRecord(itemData, pid');
  const setIdx = seg.indexOf('setAllRabItems((prev)');
  assert.ok(buildIdx >= 0 && setIdx > buildIdx, 'semua record dibangun dulu, baru satu setAllRabItems');
  // Kegagalan proyek-tak-ditemukan melempar SEBELUM record dibangun.
  const gateIdx = seg.indexOf("if (!projectsRef.current.some((p) => p.id === pid))");
  assert.ok(gateIdx >= 0 && gateIdx < buildIdx, 'gate proyek-tak-ditemukan sebelum pembangunan record');
});

check('3.9 simulasi bulkAdd melempar: RAB aktif tidak berubah', () => {
  const store: unknown[] = [{ description: 'Baris lama', volume: 1, unit: 'ls', unitPrice: 1000 }];
  const before = JSON.stringify(store);
  const throwingBulkAdd = (_rows: unknown[]): never => {
    throw new Error('Proyek tujuan tidak ditemukan (ID: x). Item RAB tidak disimpan.');
  };
  const v = validateDedFinalizeBatch(
    [mkDed({ id: 'a', stage: 'CALCULATED', subtotal: 1000000 })],
    'FULL_AI',
  );
  eq(v.ok, true, 'batch valid');
  let caught = '';
  try {
    throwingBulkAdd(v.mapped);
  } catch (e: any) {
    caught = e?.message || '';
  }
  assert.ok(caught.includes('tidak disimpan'), 'error bulkAdd ditangkap handler');
  eq(JSON.stringify(store), before, 'RAB aktif tidak berubah sesudah kegagalan sisip');
});

// --------------------------------------- 4. G-SP-1 kesetaraan total
console.log('== 4. G-SP-1: total DED vs engine kanonis (gaya P3B) ==');

// Fixture EKONOMI YANG SAMA di ketiga kaki (angka bulat + pecahan):
//   A: 10 m3 × Rp100.000 = Rp1.000.000 (AI_ESTIMATE, DED_EXPLICIT)
//   B: 5 m2 × Rp200.000 = Rp1.000.000 (USER_INPUT, DED_EXPLICIT)
//   C: 2,5 m3 × Rp123.456 = Rp308.640 (AI_ESTIMATE, ASSUMPTION + rumus)
//   D: 0,5 m × Rp12.345 = Rp6.172,5 → Rp6.173 (AI_ESTIMATE, DERIVED — probe half-up)
//   E: qty 3, harga null → dikecualikan di semua kaki
//   F: qty null, harga Rp50.000 → dikecualikan di semua kaki
// Biaya langsung berharga: Rp2.314.813.
const DIRECT_W4 = 2314813;

function dedFixture(): DedAiItem[] {
  return [
    mkDed({ id: 'a', name: 'Pekerjaan A', units: 'm3', quantity: 10, quantitySource: 'DED_EXPLICIT', unitPrice: 100000, priceSource: 'AI_ESTIMATE' }),
    mkDed({ id: 'b', name: 'Pekerjaan B', units: 'm2', quantity: 5, quantitySource: 'DED_EXPLICIT', unitPrice: 200000, priceSource: 'USER_INPUT' }),
    mkDed({ id: 'c', name: 'Pekerjaan C', units: 'm3', quantity: 2.5, quantitySource: 'ASSUMPTION', quantityFormula: '2,5 × 1 × 1', unitPrice: 123456, priceSource: 'AI_ESTIMATE' }),
    mkDed({ id: 'd', name: 'Pekerjaan D', units: 'm', quantity: 0.5, quantitySource: 'DERIVED', quantityFormula: '0,5 × 1', unitPrice: 12345, priceSource: 'AI_ESTIMATE' }),
    mkDed({ id: 'e', name: 'Pekerjaan E', units: 'm3', quantity: 3, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED' }),
    mkDed({ id: 'f', name: 'Pekerjaan F', units: 'm2', quantity: null, quantitySource: 'UNRESOLVED', unitPrice: 50000, priceSource: 'AI_ESTIMATE' }),
  ];
}

function fullAiFixture(): FullAiItem[] {
  const sub = (q: number | null, p: number | null) => verifySubtotal(q, p).subtotal;
  return [
    mkFullAi({ id: 'a', name: 'Pekerjaan A', quantity: { value: 10, unit: 'm3', formula: '10 × 1 × 1', provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 100000, unit: 'm3', source: 'AI_ESTIMATE' }, subtotal: sub(10, 100000) }),
    mkFullAi({ id: 'b', no: 2, name: 'Pekerjaan B', quantity: { value: 5, unit: 'm2', formula: '5 × 1', provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: 200000, unit: 'm2', source: 'USER_INPUT' }, subtotal: sub(5, 200000) }),
    mkFullAi({ id: 'c', no: 3, name: 'Pekerjaan C', quantity: { value: 2.5, unit: 'm3', formula: '2,5 × 1 × 1', provenance: 'ASSUMPTION', confidence: 'MEDIUM' }, price: { unitPrice: 123456, unit: 'm3', source: 'AI_ESTIMATE' }, subtotal: sub(2.5, 123456) }),
    mkFullAi({ id: 'd', no: 4, name: 'Pekerjaan D', quantity: { value: 0.5, unit: 'm', formula: '0,5 × 1', provenance: 'DERIVED', confidence: 'MEDIUM' }, price: { unitPrice: 12345, unit: 'm', source: 'AI_ESTIMATE' }, subtotal: sub(0.5, 12345) }),
    mkFullAi({ id: 'e', no: 5, name: 'Pekerjaan E', quantity: { value: 3, unit: 'm3', formula: undefined, provenance: 'EXPLICIT', confidence: 'HIGH' }, price: { unitPrice: null, unit: 'm3', source: 'UNRESOLVED' }, subtotal: null, subtotalVerified: false, status: 'NEEDS_CONFIRMATION', exclusionReason: 'MISSING_UNIT_PRICE' }),
    mkFullAi({ id: 'f', no: 6, name: 'Pekerjaan F', quantity: { value: null, unit: 'm2', formula: undefined, provenance: 'UNRESOLVED', confidence: 'LOW' }, price: { unitPrice: 50000, unit: 'm2', source: 'AI_ESTIMATE' }, subtotal: null, subtotalVerified: false, status: 'UNRESOLVED', exclusionReason: 'MISSING_QUANTITY' }),
  ];
}

check('4.1 kaki standar: DedAiCalculator.buildOutput = Rp2.314.813 (4 resolved, 2 unresolved)', () => {
  const out = DedAiCalculator.buildOutput({
    jobId: 'w4', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
    projectName: 'Fixture W4', pageCount: 1, items: dedFixture(),
  });
  eq(out.grandTotal, DIRECT_W4, 'grandTotal standar');
  eq(out.coverage.itemsFullyResolved, 4, '4 item fully resolved');
  eq(out.coverage.itemsUnresolved, 2, '2 item unresolved');
  eq(out.coverage.itemsWithAssumption, 1, '1 item asumsi (C) tetap masuk total — G2 Opsi A');
  const catSum = out.categorySummaries.reduce((a, c) => a + c.subtotal, 0);
  eq(catSum, out.grandTotal, 'Σ subtotal kategori == grandTotal');
  const d = out.items.find((i) => i.id === 'd')!;
  eq(d.subtotal, 6173, 'probe half-up: 0,5 × Rp12.345 = Rp6.173 (Math.round)');
  eq(d.stage, 'CALCULATED', 'item D CALCULATED');
});

check('4.2 kaki Full AI: computeFullAiGrandTotal = Rp2.314.813 (selisih Rp0 vs standar)', () => {
  const items = fullAiFixture();
  const t = computeFullAiGrandTotal(items);
  eq(t.grandTotal, DIRECT_W4, 'grandTotal Full AI');
  eq(t.includedCount, 4, '4 item masuk total');
  eq(t.excludedCount, 2, '2 item dikecualikan');
  const d = items.find((i) => i.id === 'd')!;
  eq(d.subtotal, 6173, 'probe half-up Full AI: 0,5 × Rp12.345 = Rp6.173 (verifySubtotal)');
});

check('4.3 kaki kanonis (jalur standar): engine directCost == grandTotal DED (selisih Rp0)', () => {
  const out = DedAiCalculator.buildOutput({
    jobId: 'w4', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
    projectName: 'Fixture W4', pageCount: 1, items: dedFixture(),
  });
  const savable = out.items.filter((it) => it.stage === 'CALCULATED' && it.subtotal != null && it.unitPrice != null);
  eq(savable.length, 4, '4 item savable');
  const mapped = savable.map((it) => mapDedAiItemToRabInput(it, 'FULL_AI'));
  assert.ok(mapped.every((m) => m !== null), 'semua savable terpetakan (tanpa null)');
  const records = mapped.map((m, i) => createRabItemRecord(m as never, 'PRJ-W4', { index: i }));
  eq(records.map((r) => r.amount).join(','), '1000000,1000000,308640,6173', 'amount factory per item');
  const s = UnifiedProjectEngine.recalculateCostSummary(records as never, {} as never);
  eq(s.directCost, out.grandTotal, 'directCost engine == grandTotal DED standar');
  eq(s.directCost - out.grandTotal, 0, 'SELISIH Rp0');
  eq(s.grandTotal, DIRECT_W4, 'proyek baru (O&P 0/0, pajak mati) → grand == direct');
  eq(s.unresolvedItems, 0, 'tanpa unresolved pasca-finalisasi');
});

check('4.4 kaki kanonis (jalur Full AI): engine directCost == sum inline Full AI (selisih Rp0)', () => {
  const items = fullAiFixture();
  const t = computeFullAiGrandTotal(items);
  const savable = items.filter((it) => it.status === 'READY' && it.subtotal != null && it.subtotal > 0 && it.price.unitPrice != null);
  eq(savable.length, 4, '4 item savable');
  const mapped = savable.map((it) => mapFullAiItemToRabInput(it, 'FULL_AI'));
  assert.ok(mapped.every((m) => m !== null), 'semua savable terpetakan (tanpa null)');
  const records = mapped.map((m, i) => createRabItemRecord(m as never, 'PRJ-W4', { index: i }));
  eq(records.map((r) => r.amount).join(','), '1000000,1000000,308640,6173', 'amount factory per item');
  const s = UnifiedProjectEngine.recalculateCostSummary(records as never, {} as never);
  eq(s.directCost, t.grandTotal, 'directCost engine == total Full AI');
  eq(s.directCost - t.grandTotal, 0, 'SELISIH Rp0');
  eq(s.grandTotal, DIRECT_W4, 'proyek baru (O&P 0/0, pajak mati) → grand == direct');
});

check('4.5 [W4-SP-1 KARAKTERISASI] item UNRESOLVED-berharga: DED menghitungnya, mapper membuangnya (selisih terukur Rp100.000) — gate baru menolak batch-nya', () => {
  const poisoned = [
    ...dedFixture(),
    mkDed({ id: 'g', name: 'Pekerjaan G', units: 'm2', quantity: 2, quantitySource: 'DED_EXPLICIT', unitPrice: 50000, priceSource: 'UNRESOLVED' }),
  ];
  const out = DedAiCalculator.buildOutput({
    jobId: 'w4', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
    projectName: 'Fixture W4-SP-1', pageCount: 1, items: poisoned,
  });
  eq(out.grandTotal, DIRECT_W4 + 100000, 'DED menghitung item G (Rp100.000) — finalizeItems tidak memeriksa priceSource');
  const g = out.items.find((i) => i.id === 'g')!;
  eq(g.stage, 'CALCULATED', 'item G CALCULATED meski sumber UNRESOLVED');
  eq(mapDedAiItemToRabInput(g, 'FULL_AI'), null, 'mapper mengembalikan null untuk item G');
  const savable = out.items.filter((it) => it.stage === 'CALCULATED' && it.subtotal != null && it.unitPrice != null);
  const mapped = savable.flatMap((it) => {
    const m = mapDedAiItemToRabInput(it, 'FULL_AI');
    return m ? [m] : [];
  });
  const records = mapped.map((m, i) => createRabItemRecord(m as never, 'PRJ-W4', { index: i }));
  const s = UnifiedProjectEngine.recalculateCostSummary(records as never, {} as never);
  eq(out.grandTotal - s.directCost, 100000, 'SELISIH TERUKUR Rp100.000: total DED vs directCost pasca-transfer — temuan terbuka W4-SP-1 (hanya tercapai via data non-service: adapter tidak pernah mengeluarkan UNRESOLVED+berharga)');
  // Perilaku BARU (§11): gate menolak batch ini — drop diam-diam tidak lagi mencapai store.
  const v = validateDedFinalizeBatch(out.items, 'FULL_AI');
  eq(v.ok, false, 'gate baru menolak batch yang mengandung item G');
  eq(v.failures.length, 1, '1 kegagalan (item G)');
});

check('4.6 [KARAKTERISASI] proyek terkonfigurasi O&P 10/5 + PPN 11%: grand engine vs total DED (selisih terukur Rp640.046)', () => {
  const out = DedAiCalculator.buildOutput({
    jobId: 'w4', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
    projectName: 'Fixture W4', pageCount: 1, items: dedFixture(),
  });
  const savable = out.items.filter((it) => it.stage === 'CALCULATED' && it.subtotal != null && it.unitPrice != null);
  const mapped = savable.map((it) => mapDedAiItemToRabInput(it, 'FULL_AI')!);
  const records = mapped.map((m, i) => createRabItemRecord(m as never, 'PRJ-W4', { index: i }));
  const s = UnifiedProjectEngine.recalculateCostSummary(records as never, {
    overheadPercent: 10, profitPercent: 5, ppnEnabled: true, taxPercent: 11,
  } as never);
  eq(s.directCost, DIRECT_W4, 'directCost tetap == total DED (kaki langsung tak berubah)');
  eq(s.overheadAmount, 231481, 'OH 10% × Rp2.314.813');
  eq(s.profitAmount, 115741, 'profit 5% × Rp2.314.813');
  eq(s.taxAmount, 292824, 'PPN 11% × subtotal Rp2.662.035');
  eq(s.grandTotal, 2954859, 'grand pasca-transfer O&P 10/5 + PPN 11%');
  eq(s.grandTotal - out.grandTotal, 640046, 'SELISIH TERUKUR Rp640.046 (+27,7%): total DED adalah biaya langsung saja; O&P/pajak hanya di engine — sama seperti temuan P3B-O2, keputusan owner');
});

check('4.7 default finansial dipertahankan: proyek baru O&P 0%/0%, nilai eksplisit tak ditimpa', () => {
  const records = [createRabItemRecord({ description: 'Pekerjaan A', volume: 10, unit: 'm3', unitPrice: 100000 } as never, 'PRJ-W4', { index: 0 })];
  const fresh = UnifiedProjectEngine.recalculateCostSummary(records as never, {} as never);
  eq(fresh.overheadPercent, 0, 'fallback overhead 0% (keputusan owner 2026-11-08)');
  eq(fresh.profitPercent, 0, 'fallback profit 0%');
  eq(fresh.grandTotal, 1000000, 'grand == direct untuk proyek baru');
  const configured = UnifiedProjectEngine.recalculateCostSummary(records as never, { overheadPercent: 10, profitPercent: 5 } as never);
  eq(configured.overheadPercent, 10, 'nilai eksplisit 10% dipertahankan');
  eq(configured.grandTotal, 1150000, 'grand memakai konfigurasi eksplisit');
});

console.log(`\nw4FullAiPipeline: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

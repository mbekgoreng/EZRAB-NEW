/**
 * dedOutputContract — KONTRAK KELUARAN DED BERSAMA (Final Hardening §6,
 * 2026-11-11). Konsolidasi SETINGKAT KONTRAK, bukan mesin baru.
 *
 * Dua pipeline DED hidup berdampingan dengan semantik gerbang yang
 * SENGAJA berbeda dan TIDAK diselaraskan oleh modul ini:
 * - ded-ai (src/ai-tools/ded-ai-estimate/): evaluator kewajaran
 *   (reasonableness.ts) hanya MENGANNOTASI — item beranotasi tetap masuk
 *   total; yang keluar dari total hanyalah item stage 'REJECTED'
 *   (calculator.finalizeItems: subtotal null).
 * - legacy magic-ai (src/ai-estimate/aiEstimatePipeline.ts):
 *   QuantitySanityGate MEMBLOKIR item katastrofik dari total
 *   (quantityStatus 'BLOCKED_FROM_TOTAL', subtotal null, dikeluarkan
 *   dari AiEstimateCalculator.calculateGrandTotal).
 *
 * Modul ini menyediakan SATU bentuk keluaran bersama + validator
 * fail-closed + adapter MURNI dari kedua pipeline. Adapter tidak
 * mengubah hitungan, total, atau semantik gerbang mana pun: ia hanya
 * menerjemahkan hasil akhir pipeline ke kosakata kontrak, dengan
 * pemetaan quantityKind yang JUJUR terhadap perlakuan pipeline asal:
 * - item yang digerbang legacy            → EXCLUDED_FROM_TOTAL
 * - item terannotasi ded-ai (NEEDS_REVIEW) → tetap masuk total;
 *   quantityKind mengikuti asal kuantitasnya, status validasi membawa
 *   anotasi apa adanya.
 * - ekstraksi AI mentah (AI_INFERENCE / ASSUMPTION / AI_INFERENCE legacy)
 *   → AI_EXTRACTED sampai ada validasi manusia/deterministik di atasnya.
 *
 * includedInTotal diturunkan dari subtotal AKTUAL hasil pipeline
 * (bukan dari label status), sehingga total kontrak selalu dapat
 * direkonsiliasi terhadap total pipeline asal.
 */

import type { DedAiItem, DedAiOutput } from '../ai-tools/ded-ai-estimate/types';
import type { AiEstimateOutput, AiEstimateWorkItem } from '../ai-estimate/types';

// ===========================================================================
// 1. TIPE KONTRAK
// ===========================================================================

export type DedContractQuantityKind =
  | 'CALCULATED'               // diturunkan deterministik dari input terverifikasi (geometri/derivasi kode)
  | 'AI_EXTRACTED'             // ekstraksi/inferensi AI mentah — belum divalidasi di atasnya
  | 'ACCEPTED_AFTER_VALIDATION'// lolos lapisan validasi pipeline dan diterima apa adanya
  | 'EXCLUDED_FROM_TOTAL'      // digerbang keluar dari total oleh pipeline asal
  | 'NEEDS_HUMAN_REVIEW';      // belum boleh diputuskan mesin — perlu manusia (termasuk kuantitas hilang)

export type DedContractPipeline = 'DED_AI' | 'LEGACY_MAGIC_AI';

export interface DedContractSourceDocument {
  /** Id dokumen/job bila pipeline menyediakannya; null = tidak tersedia (tidak dikarang). */
  id: string | null;
  name: string;
  /** Hash isi dokumen bila tersedia; kedua pipeline TIDAK menyediakannya hari ini → null jujur. */
  hash: string | null;
  pageCount: number | null;
}

export interface DedContractPriceProvenance {
  /** Kosakata provenans kontrak: OFFICIAL_AHSP | OFFICIAL_REGIONAL_REFERENCE |
   *  MARKET_REFERENCE | AI_ESTIMATE | MANUAL_PRICE | UNRESOLVED | (label pipeline apa adanya). */
  kind: string;
  /** Status verifikasi sebagaimana dicatat pipeline asal (VERIFIED/UNVERIFIED/UNRESOLVED/…). */
  status: string;
  /** Label terbaca untuk UI/laporan. */
  label: string;
}

export interface DedContractItem {
  /** Id item pada pipeline asal (dipertahankan untuk telusur balik). */
  sourceItemId: string;
  description: string;
  category: string | null;
  /** Kuantitas EFEKTIF pipeline asal (legacy: acceptedQuantity ?? quantity; ded-ai: quantity). null = hilang. */
  quantity: number | null;
  unit: string;
  quantityKind: DedContractQuantityKind;
  /** Status validasi sebagaimana dicatat pipeline asal (tidak dinormalisasi diam-diam). */
  validationStatus: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  /** MAPPED | CANDIDATE_REVIEW | NOT_MAPPED | NOT_APPLICABLE (legacy tidak punya pemetaan AHSP). */
  ahspMappingStatus: string;
  /** Kode AHSP kanonis bila pipeline asal benar-benar memetakannya; selain itu null. */
  ahspCode: string | null;
  unitPrice: number | null;
  priceProvenance: DedContractPriceProvenance;
  /** Subtotal deterministik pipeline asal; null = tidak terhitung / digerbang. */
  subtotal: number | null;
  /** Benar iff item ini benar-benar menyumbang ke total pipeline asal (subtotal non-null). */
  includedInTotal: boolean;
  unresolvedReasons: string[];
  assumptions: string[];
  warnings: string[];
}

export interface DedOutputContract {
  contractVersion: 1;
  sourcePipeline: DedContractPipeline;
  sourceDocument: DedContractSourceDocument;
  /** Gabungan nomor halaman yang dirujuk item-item hasil (urut, unik). */
  pageRefs: number[];
  items: DedContractItem[];
  /** Keadaan finalisasi menurut pipeline asal: FINALIZED | PARTIAL | PRELIMINARY. */
  finalizationState: string;
  /** Total resmi pipeline asal (ded-ai: grandTotal; legacy: summary.estimatedTotal). */
  pipelineTotal: number;
  /** Total yang dihitung ULANG dari kontrak: Σ subtotal item includedInTotal. */
  includedTotal: number;
}

// ===========================================================================
// 2. VALIDATOR RUNTIME (fail-closed untuk field wajib)
// ===========================================================================

const QUANTITY_KINDS: ReadonlySet<string> = new Set([
  'CALCULATED', 'AI_EXTRACTED', 'ACCEPTED_AFTER_VALIDATION', 'EXCLUDED_FROM_TOTAL', 'NEEDS_HUMAN_REVIEW',
]);

export interface DedContractValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validator ringan fail-closed: field wajib yang hilang/rusak → ok:false
 * dengan daftar kesalahan eksplisit. Tidak menebak, tidak memperbaiki.
 */
export function validateDedOutputContract(x: unknown): DedContractValidation {
  const errors: string[] = [];
  if (!x || typeof x !== 'object' || Array.isArray(x)) {
    return { ok: false, errors: ['contract: bukan objek'] };
  }
  const c = x as Record<string, unknown>;
  if (c.contractVersion !== 1) errors.push('contractVersion: wajib 1');
  if (c.sourcePipeline !== 'DED_AI' && c.sourcePipeline !== 'LEGACY_MAGIC_AI') {
    errors.push('sourcePipeline: wajib DED_AI | LEGACY_MAGIC_AI');
  }
  const doc = c.sourceDocument as Record<string, unknown> | undefined;
  if (!doc || typeof doc !== 'object') errors.push('sourceDocument: wajib ada');
  else if (typeof doc.name !== 'string' || doc.name.trim() === '') errors.push('sourceDocument.name: wajib string non-kosong');
  if (!Array.isArray(c.pageRefs)) errors.push('pageRefs: wajib array');
  if (typeof c.finalizationState !== 'string' || c.finalizationState === '') errors.push('finalizationState: wajib string non-kosong');
  if (typeof c.pipelineTotal !== 'number' || !Number.isFinite(c.pipelineTotal)) errors.push('pipelineTotal: wajib angka finite');
  if (typeof c.includedTotal !== 'number' || !Number.isFinite(c.includedTotal)) errors.push('includedTotal: wajib angka finite');
  if (!Array.isArray(c.items)) {
    errors.push('items: wajib array');
    return { ok: false, errors };
  }
  c.items.forEach((raw, i) => {
    const at = `items[${i}]`;
    if (!raw || typeof raw !== 'object') { errors.push(`${at}: bukan objek`); return; }
    const it = raw as Record<string, unknown>;
    if (typeof it.description !== 'string' || it.description.trim() === '') errors.push(`${at}.description: wajib string non-kosong`);
    if (typeof it.unit !== 'string' || it.unit.trim() === '') errors.push(`${at}.unit: wajib string non-kosong`);
    if (typeof it.quantityKind !== 'string' || !QUANTITY_KINDS.has(it.quantityKind)) errors.push(`${at}.quantityKind: nilai tidak dikenal`);
    if (typeof it.validationStatus !== 'string' || it.validationStatus === '') errors.push(`${at}.validationStatus: wajib string non-kosong`);
    if (typeof it.ahspMappingStatus !== 'string' || it.ahspMappingStatus === '') errors.push(`${at}.ahspMappingStatus: wajib string non-kosong`);
    const pp = it.priceProvenance as Record<string, unknown> | undefined;
    if (!pp || typeof pp !== 'object') errors.push(`${at}.priceProvenance: wajib ada`);
    else {
      if (typeof pp.kind !== 'string' || pp.kind === '') errors.push(`${at}.priceProvenance.kind: wajib`);
      if (typeof pp.status !== 'string' || pp.status === '') errors.push(`${at}.priceProvenance.status: wajib`);
      if (typeof pp.label !== 'string' || pp.label === '') errors.push(`${at}.priceProvenance.label: wajib`);
    }
    if (!(it.quantity === null || (typeof it.quantity === 'number' && Number.isFinite(it.quantity)))) errors.push(`${at}.quantity: wajib number|null`);
    if (!(it.unitPrice === null || (typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice)))) errors.push(`${at}.unitPrice: wajib number|null`);
    if (!(it.subtotal === null || (typeof it.subtotal === 'number' && Number.isFinite(it.subtotal)))) errors.push(`${at}.subtotal: wajib number|null`);
    if (typeof it.includedInTotal !== 'boolean') errors.push(`${at}.includedInTotal: wajib boolean`);
    if (!Array.isArray(it.unresolvedReasons)) errors.push(`${at}.unresolvedReasons: wajib array`);
    if (!Array.isArray(it.assumptions)) errors.push(`${at}.assumptions: wajib array`);
    if (!Array.isArray(it.warnings)) errors.push(`${at}.warnings: wajib array`);
    // Konsistensi gerbang: item tergerbang tidak boleh menyumbang total.
    if (it.quantityKind === 'EXCLUDED_FROM_TOTAL' && it.includedInTotal === true) {
      errors.push(`${at}: EXCLUDED_FROM_TOTAL tidak boleh includedInTotal`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/** Total kontrak: Σ subtotal item yang masuk total (sesuai semantik pipeline asal). */
export function dedContractIncludedTotal(items: DedContractItem[]): number {
  return items.reduce((acc, it) => acc + (it.includedInTotal && it.subtotal !== null ? it.subtotal : 0), 0);
}

function pageRefsOf(pageLists: Array<number[] | undefined>): number[] {
  const set = new Set<number>();
  for (const list of pageLists) for (const p of list ?? []) if (Number.isFinite(p)) set.add(p);
  return Array.from(set).sort((a, b) => a - b);
}

// ===========================================================================
// 3. ADAPTER — ded-ai (src/ai-tools/ded-ai-estimate)
// ===========================================================================

function dedAiQuantityKind(item: DedAiItem): DedContractQuantityKind {
  // Kuantitas hilang/tak berdasar: belum pernah terhitung — kebutuhan
  // review manusia, bukan "dig-gerbang" (finalizer memang menandainya
  // REJECTED, tetapi tidak ada nilai yang dibuang dari total).
  if (item.quantity === null || item.quantitySource === 'UNRESOLVED') return 'NEEDS_HUMAN_REVIEW';
  // Gerbang ded-ai satu-satunya yang membuang NILAI yang ada dari total
  // adalah finalizeItems → stage REJECTED (validateQuantity gugur).
  if (item.stage === 'REJECTED') return 'EXCLUDED_FROM_TOTAL';
  switch (item.quantitySource) {
    case 'DED_GEOMETRIC':
    case 'DERIVED':
      return 'CALCULATED';
    case 'DED_EXPLICIT':
    case 'USER_INPUT':
      return 'ACCEPTED_AFTER_VALIDATION';
    case 'AI_INFERENCE':
    case 'ASSUMPTION':
    default:
      // Ekstraksi/inferensi AI mentah: masuk total menurut kebijakan
      // ded-ai, tetapi TIDAK naik kelas menjadi tervalidasi.
      return 'AI_EXTRACTED';
  }
}

function dedAiValidationStatus(item: DedAiItem): string {
  // Anotasi evaluator kewajaran dibawa apa adanya — ia TIDAK mengubah
  // keikutsertaan item dalam total (reasonableness.ts: anotasi murni).
  if (item.quantityReview) return `REASONABLENESS:${item.quantityReview.outcome}`;
  if (item.stage === 'REJECTED') return 'REJECTED_BY_FINALIZER';
  return `STAGE:${item.stage}`;
}

function dedAiPriceProvenance(item: DedAiItem): DedContractPriceProvenance {
  if (item.priceCompletion) {
    const cls = item.priceCompletion.classification;
    return {
      kind: cls,
      status: item.priceCompletion.verificationStatus ?? 'UNVERIFIED',
      label: `DED priceCompletion: ${cls} (${item.priceCompletion.sourceName ?? item.priceCompletion.method})`,
    };
  }
  switch (item.priceSource) {
    case 'AHSP_2026':
      return { kind: 'OFFICIAL_AHSP', status: 'VERIFIED', label: `AHSP 2026 kanonis${item.ahspCode ? ` (${item.ahspCode})` : ''}` };
    case 'AI_ESTIMATE':
      return { kind: 'AI_ESTIMATE', status: 'UNVERIFIED', label: 'Estimasi AI (DED) — bukan harga resmi' };
    case 'USER_INPUT':
      return { kind: 'MANUAL_PRICE', status: 'UNVERIFIED', label: 'Harga input pengguna (DED)' };
    default:
      return { kind: 'UNRESOLVED', status: 'UNRESOLVED', label: 'Harga belum teresolusi (DED)' };
  }
}

export function mapDedAiOutputToContract(output: DedAiOutput): DedOutputContract {
  const items: DedContractItem[] = output.items.map((item) => {
    const unresolvedReasons: string[] = [];
    if (item.quantity === null) unresolvedReasons.push('QUANTITY_MISSING');
    if (item.unitPrice === null) unresolvedReasons.push('PRICE_UNRESOLVED');
    if (item.stage === 'REJECTED' && item.quantityNote) unresolvedReasons.push(item.quantityNote);
    const warnings: string[] = [];
    if (item.quantityReview && item.quantityReview.outcome !== 'REASONABLE') {
      warnings.push(`[${item.quantityReview.reasonCode}] ${item.quantityReview.explanation}`);
    }
    if (item.priceAssumptionNote) warnings.push(item.priceAssumptionNote);
    return {
      sourceItemId: item.id,
      description: item.description || item.name,
      category: item.category ?? null,
      quantity: item.quantity,
      unit: item.units,
      quantityKind: dedAiQuantityKind(item),
      validationStatus: dedAiValidationStatus(item),
      ahspMappingStatus: item.ahspCode
        ? 'MAPPED'
        : item.ahspMatch
          ? 'CANDIDATE_REVIEW'
          : 'NOT_MAPPED',
      ahspCode: item.ahspCode ?? null,
      unitPrice: item.unitPrice,
      priceProvenance: dedAiPriceProvenance(item),
      subtotal: item.subtotal,
      includedInTotal: item.subtotal !== null,
      unresolvedReasons,
      assumptions: [
        ...(item.quantityAudit?.assumptions ? [item.quantityAudit.assumptions] : []),
        ...(item.quantitySource === 'ASSUMPTION' ? ['Kuantitas berasal dari ASSUMPTION (ded-ai quantitySource)'] : []),
      ],
      warnings,
    };
  });
  return {
    contractVersion: 1,
    sourcePipeline: 'DED_AI',
    sourceDocument: {
      id: output.jobId ?? null,
      name: output.fileName || output.projectName,
      hash: null, // pipeline ded-ai tidak menghitung hash dokumen
      pageCount: output.pageCount ?? null,
    },
    pageRefs: pageRefsOf(output.items.map((i) => i.sourcePages)),
    items,
    finalizationState: output.partial ? 'PARTIAL' : 'FINALIZED',
    pipelineTotal: output.grandTotal,
    includedTotal: dedContractIncludedTotal(items),
  };
}

// ===========================================================================
// 4. ADAPTER — legacy magic-ai (src/ai-estimate/aiEstimatePipeline)
// ===========================================================================

function legacyQuantityKind(item: AiEstimateWorkItem): DedContractQuantityKind {
  // QuantitySanityGate MEMBLOKIR: item tergerbang keluar dari total.
  if (item.quantityStatus === 'BLOCKED_FROM_TOTAL' || item.status === 'BLOCKED') return 'EXCLUDED_FROM_TOTAL';
  if (item.quantityStatus === 'UNRESOLVED' || item.status === 'UNRESOLVED') return 'NEEDS_HUMAN_REVIEW';
  if (item.quantityStatus === 'SUSPICIOUS') return 'NEEDS_HUMAN_REVIEW';
  if (item.quantityStatus === 'ACCEPTED') {
    // Diterima gerbang kewajaran; asal-usul AI tetap dicatat di
    // validationStatus agar tidak menyamar sebagai ekstraksi terverifikasi.
    return item.quantitySource === 'DED_GEOMETRIC' ? 'CALCULATED' : 'ACCEPTED_AFTER_VALIDATION';
  }
  // Item belum melewati gerbang (quantityStatus absen): ekstraksi AI mentah.
  return 'AI_EXTRACTED';
}

function legacyPriceProvenance(item: AiEstimateWorkItem): DedContractPriceProvenance {
  if (item.priceSource === 'UNRESOLVED' || item.priceStatus === 'PRICE_UNRESOLVED') {
    return { kind: 'UNRESOLVED', status: 'UNRESOLVED', label: 'Harga belum teresolusi (legacy)' };
  }
  if (item.priceStatus === 'USER_INPUT') {
    return { kind: 'MANUAL_PRICE', status: 'UNVERIFIED', label: 'Harga input pengguna (legacy)' };
  }
  return { kind: 'AI_ESTIMATE', status: 'UNVERIFIED', label: 'Estimasi AI (legacy) — tanpa pemetaan AHSP' };
}

export function mapLegacyEstimateToContract(output: AiEstimateOutput): DedOutputContract {
  const items: DedContractItem[] = output.workItems.map((item) => {
    const kind = legacyQuantityKind(item);
    const blocked = kind === 'EXCLUDED_FROM_TOTAL';
    const unresolvedReasons: string[] = [];
    if (blocked && item.blockingReason) unresolvedReasons.push(item.blockingReason);
    if (item.quantity === null && !blocked) unresolvedReasons.push('QUANTITY_MISSING');
    if ((item.unitPrice ?? item.estimatedUnitPrice ?? null) === null) unresolvedReasons.push('PRICE_UNRESOLVED');
    if (item.quantityStatus === 'SUSPICIOUS' && item.blockingReason) unresolvedReasons.push(item.blockingReason);
    const warnings = (item.warnings ?? []).map((w: unknown) =>
      typeof w === 'string' ? w : ((w as { message?: string })?.message ?? String(w)),
    );
    return {
      sourceItemId: item.id,
      description: item.description || item.specification || item.workName || item.item || '',
      category: item.category ?? null,
      quantity: item.acceptedQuantity ?? item.quantity,
      unit: item.unit,
      quantityKind: kind,
      validationStatus: `SANITY:${item.quantityStatus ?? 'UNGATED'}|STATUS:${item.status ?? 'UNKNOWN'}|QTY_SOURCE:${item.quantitySource}`,
      confidence: item.confidence,
      // Pipeline legacy tidak memetakan AHSP sama sekali — dinyatakan
      // eksplisit, bukan diklaim NOT_MAPPED seolah sudah dicoba.
      ahspMappingStatus: 'NOT_APPLICABLE',
      ahspCode: null,
      unitPrice: item.unitPrice ?? item.estimatedUnitPrice ?? null,
      priceProvenance: legacyPriceProvenance(item),
      subtotal: blocked ? null : (item.subtotal ?? item.estimatedSubtotal ?? null),
      // Keikutsertaan mengikuti subtotal AKTUAL kalkulator legacy
      // (calculateGrandTotal hanya melewati item BLOCKED; item SUSPICIOUS
      // dengan acceptedQuantity null jatuh ke `?? quantity` di
      // calculateSubtotal sehingga tetap menyumbang — dicatat apa adanya).
      includedInTotal: !blocked && (item.subtotal ?? item.estimatedSubtotal ?? null) !== null,
      unresolvedReasons,
      assumptions: item.assumptions ?? [],
      warnings,
    };
  });
  return {
    contractVersion: 1,
    sourcePipeline: 'LEGACY_MAGIC_AI',
    sourceDocument: {
      id: output.projectId ?? null,
      name: output.projectName,
      hash: null, // pipeline legacy tidak menghitung hash dokumen
      pageCount: output.totalPagesRead ?? null,
    },
    pageRefs: pageRefsOf(output.workItems.map((i) => i.sourcePages)),
    items,
    finalizationState: output.summary?.status ?? 'PRELIMINARY',
    pipelineTotal: output.summary.estimatedTotal,
    includedTotal: dedContractIncludedTotal(items),
  };
}

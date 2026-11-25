/**
 * DED SELF-REVIEW AUDIT — LIVE (Phase C, owner directive 2026-11-25)
 * =====================================================================
 * Structured post-run audit for the live DED path. This is a NEW live
 * module: it takes the v2 20-question set + metrics shape as its spec,
 * but every question is re-implemented against live types with a
 * three-state verdict (`PASS` / `FAIL` / `NOT_EVALUATED` + reason +
 * evidence). It is NOT a verbatim copy of the v2 engine, and it never
 * imports v2 or the v3 self-review engine.
 *
 * Honesty rules enforced here (readiness report §2 candidate C table,
 * §5.3, plus the owner supplement):
 * - No question reports PASS without the evidence listed in its
 *   `evidence` field.
 * - No hardcoded PASS: the 9 v2 questions that were hardcoded now get a
 *   real check against live data, or `NOT_EVALUATED` when the data
 *   source does not exist on the path.
 * - No arbitrary item-count threshold (a legitimate 5-item DED must not
 *   fail on count); no invented schedule codes; no invented page
 *   counts; no invented single-storey floor-area envelope.
 * - Q19 (suspicious quantities) aggregates live per-item outcomes only:
 *   `quantityReview` outcomes from `evaluateQuantityReasonableness`
 *   (ded-ai path) / `QuantitySanityGate` outcomes (Magic AI path).
 *   Document-level floor area is context for the note only, never a
 *   new threshold, and no new ratio is introduced here.
 * - Q16: an AI-estimate price is never a verified source; the note
 *   never attributes AI estimates to an official catalog.
 * - The audit is READ-ONLY: it never changes RAB data, never corrects
 *   items, never saves anything. (Contrast the v3 engine, which nulls
 *   AHSP matches and rewrites item statuses on failure.)
 *
 * Output contract (readiness §4.3): the v2 `SelfReviewAuditReport`
 * shape extended with `notEvaluatedCount` and per-question `evidence`.
 * `overallPassed` is replaced by two flags: `failedCount === 0` and
 * `complete` (`notEvaluatedCount === 0`). A run is a clean pass ONLY
 * with zero failures AND zero NOT_EVALUATED questions (`cleanPass`).
 * Each question is computed defensively: a question that throws
 * degrades to `NOT_EVALUATED` instead of failing the audit.
 */

import { semanticClassifier, type LiveDedEntityType } from './semanticClassifier';
import { dedUnitSafetyGate } from '../../ded-rab-v3/ahsp/dedUnitSafetyGate';
import {
  deriveKolomVolume,
  deriveDindingNetto,
  derivePlester,
} from './derivation';
import type { DedAiItem, DedQuantityReview } from './types';
import type { DedPlanContext } from './priceCompletion';
import type { DedAiOutput } from './types';
import type { FullAiItem } from '../ded-full-ai/types';
import type { AiEstimateWorkItem } from '../../ai-estimate/types';
import type { AiEstimateOutput } from '../../ai-estimate/types';
import type { DedContextMemory, RoomDefinition } from '../../ded-rab-v3/types';
import type { LiveGateValidationResult } from './dedRabValidationGate';

export type AuditVerdict = 'PASS' | 'FAIL' | 'NOT_EVALUATED';

export interface AuditQuestionResult {
  number: number;
  question: string;
  verdict: AuditVerdict;
  reason: string;
  /** Item ids / counts supporting the verdict. PASS always carries evidence. */
  evidence: string[];
}

export interface SelfReviewAuditReport {
  timestamp: string;
  /** Zero failures — one of the two flags that replace `overallPassed`. */
  failedCount: number;
  /** Questions that could not be evaluated. */
  notEvaluatedCount: number;
  passedCount: number;
  /** True only when every question could be evaluated. */
  complete: boolean;
  /** True only when `failedCount === 0` AND `complete`. The only clean pass. */
  cleanPass: boolean;
  questions: AuditQuestionResult[];
  metrics: {
    pagesTotal: number;
    pagesProcessed: number;
    inventoryCount: number;
    quantityResolvedCount: number;
    quantityUnresolvedCount: number;
    quantityResolutionRate: number; // 0..100%
    ahspValidatedCount: number;
    ahspReviewCount: number;
    ahspValidationRate: number; // 0..100%
    priceResolvedCount: number;
    priceUnresolvedCount: number;
    priceResolutionRate: number; // 0..100%
    readyCount: number;
    reviewCount: number;
    conflictCount: number;
  };
}

/**
 * Optional classifier hook for Q9 (materials vs work items). When no hook
 * is supplied, Q9 defaults to the ported live `semanticClassifier`
 * (`defaultConstructionWorkClassifier`, owner ACC 2026-11-25). A caller
 * that supplies its own classifier overrides the default.
 */
export type ConstructionWorkClassifier = (name: string, category: string) => {
  isConstructionWork: boolean;
  reason?: string;
  /** Classifier entity type, when the implementation can report it — lets Q9 tell UNKNOWN apart from a confident non-work entity. */
  entityType?: LiveDedEntityType;
};

/** Default Q9 classifier: the ported live `semanticClassifier` (v2 semantics: CONSTRUCTION_WORK + eligible = work). */
const defaultConstructionWorkClassifier: ConstructionWorkClassifier = (name, category) => {
  const res = semanticClassifier.classify(name, category);
  return {
    isConstructionWork: res.isRabEligible && res.fact.entityType === 'CONSTRUCTION_WORK',
    reason: res.rejectReason,
    entityType: res.fact.entityType,
  };
};

export interface SelfReviewInput {
  items: DedAiItem[] | FullAiItem[] | AiEstimateWorkItem[];
  pagesTotal: number;
  pagesProcessed: number;
  /** ded-ai path: `derivePlanContext(items)` — floor area is note context only. */
  planContext?: DedPlanContext;
  /** Magic AI path: `DedContextMemory.rooms` (or the rooms slice of `contextMemory`). */
  rooms?: RoomDefinition[];
  /** Magic AI path: full document memory (rooms + unresolved information queries). */
  contextMemory?: DedContextMemory;
  /** Per-item reasonableness outcomes when items do not already carry them. */
  quantityReviews?: DedQuantityReview[];
  /** Deduper merge count from the pipeline (`duplicateDetector.deduplicate`). */
  duplicatesMerged?: number;
  /** Phase B per-item gate results, where the caller already computed them. */
  gateResults?: ReadonlyMap<string, LiveGateValidationResult>;
  /**
   * Floor count, where available, from `FullAiProjectInfo.floorCount`.
   * Model-provided: cited as model-provided, never as verified fact.
   */
  floorCount?: number | null;
  /** Q9 classifier hook (see `ConstructionWorkClassifier`). Absent → NOT_EVALUATED. */
  classifyConstructionWork?: ConstructionWorkClassifier;
}

/** `DedAiOutput` carrying the audit (additive; the base type is untouched). */
export type DedAiOutputWithAudit = DedAiOutput & { selfReviewAudit: SelfReviewAuditReport };
/** `AiEstimateOutput` carrying the audit (additive; the base type is untouched). */
export type AiEstimateOutputWithAudit = AiEstimateOutput & { selfReviewAudit: SelfReviewAuditReport };

export const AUDIT_QUESTION_COUNT = 20;

/** The v2 question set, verbatim — the spec these verdicts answer. */
export const AUDIT_QUESTIONS: string[] = [
  'Did I process every page?',
  'Did I identify all major construction work?',
  'Did I accidentally stop early?',
  'Did I miss dimensions?',
  'Did I miss schedules?',
  'Did I miss quantities?',
  'Did I assume any quantity?',
  'Did I use any default quantity?',
  'Did I confuse materials with work items?',
  'Did I duplicate work items?',
  'Does every quantity have evidence?',
  'Does every quantity have a valid unit?',
  'Does every formula make physical sense?',
  'Does every AHSP semantically match?',
  'Does every AHSP unit match the quantity?',
  'Does every price have a valid source?',
  'Are there conflicts between pages?',
  'Are unresolved items still visible?',
  'Are there suspiciously low/high quantities?',
  'Is the final RAB consistent with the DED?',
];

// ---------------------------------------------------------------------------
// Normalized item view (one adapter per live shape; the questions below
// only ever see this view, so adapter drift stays in one place).
// ---------------------------------------------------------------------------

type AuditItemShape = 'DED_AI' | 'FULL_AI' | 'MAGIC_AI';

interface AuditItemView {
  id: string;
  name: string;
  category: string;
  shape: AuditItemShape;
  quantity: number | null;
  unit: string;
  quantitySource: string;
  quantityFormula: string;
  rawDimensions: string;
  sourceEvidence: string;
  visionEvidenceCount: number;
  sourcePages: number[];
  derivation?: NonNullable<DedAiItem['derivation']>;
  quantityReview?: DedQuantityReview;
  quantityAuditClassification?: string;
  /** Canonical match status; undefined = no match data (Magic AI: never exists). */
  ahspStatus?: string;
  ahspCode?: string;
  ahspUnit?: string;
  unitPrice: number | null;
  priceSource: string;
  /** True when a price-completion block claims VERIFIED / official-AHSP. */
  priceVerifiedClaim: boolean;
  priceClassification?: string;
  stage?: string;
  status?: string;
  /** Magic AI path: QuantitySanityGate outcome. */
  quantityStatus?: string;
  detectionStatus?: string;
  exclusionReason?: string | null;
  warnings: string[];
  assumptions: string[];
  subtotal: number | null;
  /** Needs human review (missing qty/price, unmatched AHSP, NEEDS_REVIEW, rejected). */
  unresolved: boolean;
  /**
   * Task B (2026-11-25): recorded cross-pass dimension conflict from the
   * live ded-ai dedup (`mergeRawItemsAcrossPasses`, service.ts) — same
   * normalized name+unit with different dimension signatures across
   * passes, kept twice and flagged on provenance (`dedup-conflict:`).
   * The audit only READS this recorded flag; it never re-derives
   * dimensions. False on shapes whose pipeline never runs that dedup.
   */
  dedupDimensionConflict: boolean;
  /** The unresolved state is visible/labeled on the item (never silently resolved). */
  visiblyFlagged: boolean;
  /** A null quantity is explicitly marked unresolved (not silently missed). */
  explicitUnresolvedMarker: boolean;
  /** Some dimensional basis exists (raw dimensions, formula, derivation, evidence). */
  hasDimensionBasis: boolean;
  /** Some page/evidence trace exists. */
  hasEvidence: boolean;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function priceVerifiedClaimOf(pc: DedAiItem['priceCompletion'] | undefined): boolean {
  if (!pc) return false;
  return pc.verificationStatus === 'VERIFIED' || pc.classification === 'OFFICIAL_AHSP_VERIFIED';
}

function adaptDedAiItem(item: DedAiItem): AuditItemView {
  const ahspStatus = item.ahspMatch?.status;
  const unresolved =
    item.quantity === null ||
    item.unitPrice === null ||
    (ahspStatus !== undefined && ahspStatus !== 'RESOLVED') ||
    (ahspStatus === undefined && !item.ahspCode) ||
    item.quantityReview?.outcome === 'NEEDS_REVIEW' ||
    item.stage === 'REJECTED';
  const visiblyFlagged =
    item.quantitySource === 'UNRESOLVED' ||
    item.quantitySource === 'ASSUMPTION' ||
    item.quantitySource === 'AI_INFERENCE' ||
    item.stage === 'REJECTED' ||
    Boolean(item.quantityNote && item.quantityNote.trim().length > 0) ||
    item.priceSource === 'UNRESOLVED' ||
    (ahspStatus !== undefined && ahspStatus !== 'RESOLVED') ||
    item.quantityReview?.outcome === 'NEEDS_REVIEW' ||
    item.quantityReview?.outcome === 'INSUFFICIENT_CONTEXT' ||
    item.quantityAudit?.classification === 'MISSING' ||
    item.quantityAudit?.classification === 'NEEDS_REVIEW';
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    shape: 'DED_AI',
    quantity: item.quantity,
    unit: item.units,
    quantitySource: item.quantitySource,
    quantityFormula: item.quantityFormula ?? '',
    rawDimensions: item.rawDimensions ?? '',
    sourceEvidence: item.sourceEvidence ?? '',
    visionEvidenceCount: item.visionEvidence?.length ?? 0,
    sourcePages: item.sourcePages ?? [],
    derivation: item.derivation,
    quantityReview: item.quantityReview,
    quantityAuditClassification: item.quantityAudit?.classification,
    ahspStatus,
    ahspCode: item.ahspCode ?? item.ahspMatch?.matchedCode,
    ahspUnit: item.ahspMatch?.unit,
    unitPrice: item.unitPrice,
    priceSource: item.priceSource,
    priceVerifiedClaim: priceVerifiedClaimOf(item.priceCompletion),
    priceClassification: item.priceCompletion?.classification,
    stage: item.stage,
    subtotal: item.subtotal,
    warnings: [],
    assumptions: [],
    unresolved,
    // Task B: the dedup-conflict marker is written by convertAiItem
    // (service.ts:394) into provenance and survives price completion
    // (priceCompletion.ts spreads provenance) and finalizeItems
    // (calculator.ts spreads the item), so it is present on finalItems.
    dedupDimensionConflict: (item.provenance ?? []).some((p) => p.startsWith('dedup-conflict:')),
    visiblyFlagged,
    explicitUnresolvedMarker:
      item.quantityAudit?.classification === 'MISSING' || item.quantitySource === 'UNRESOLVED',
    hasDimensionBasis: Boolean(
      item.rawDimensions || item.quantityFormula || item.derivation || item.sourceEvidence || (item.visionEvidence?.length ?? 0) > 0,
    ),
    hasEvidence: (item.sourcePages?.length ?? 0) > 0 || Boolean(item.sourceEvidence) || (item.visionEvidence?.length ?? 0) > 0,
  };
}

function adaptFullAiItem(item: FullAiItem): AuditItemView {
  const priceCompletion = item.priceCompletion ?? item.price.priceCompletion;
  const ahspStatus = item.price.ahspMatch?.status;
  const provenance = item.quantity.provenance;
  const unresolved =
    item.quantity.value === null ||
    item.price.unitPrice === null ||
    item.status !== 'READY' ||
    (ahspStatus !== undefined && ahspStatus !== 'RESOLVED') ||
    item.exclusionReason !== null;
  const visiblyFlagged =
    item.status !== 'READY' ||
    item.exclusionReason !== null ||
    provenance === 'ASSUMPTION' ||
    provenance === 'NEEDS_CONFIRMATION' ||
    provenance === 'UNRESOLVED' ||
    item.price.source === 'UNRESOLVED' ||
    (ahspStatus !== undefined && ahspStatus !== 'RESOLVED') ||
    (item.quantity.assumptions?.length ?? 0) > 0 ||
    Boolean(item.quantity.notes && item.quantity.notes.trim().length > 0);
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    shape: 'FULL_AI',
    quantity: item.quantity.value,
    unit: item.quantity.unit,
    quantitySource: provenance,
    quantityFormula: item.quantity.formula ?? '',
    rawDimensions: item.quantity.dimensions ?? '',
    sourceEvidence: '',
    visionEvidenceCount: item.visionEvidence?.length ?? 0,
    sourcePages: item.sourcePages ?? item.quantity.sourcePages ?? [],
    quantityAuditClassification:
      item.quantityAudit?.classification ?? item.quantity.quantityAudit?.classification,
    ahspStatus,
    ahspCode: item.price.ahspCode ?? item.price.ahspMatch?.matchedCode,
    ahspUnit: item.price.ahspMatch?.unit ?? item.price.unit,
    unitPrice: item.price.unitPrice,
    priceSource: item.price.source,
    priceVerifiedClaim: priceVerifiedClaimOf(priceCompletion),
    priceClassification: priceCompletion?.classification,
    status: item.status,
    exclusionReason: item.exclusionReason,
    subtotal: item.subtotal,
    warnings: [],
    assumptions: item.quantity.assumptions ?? [],
    unresolved,
    // Full AI items never pass through the ded-ai dedup, so no recorded
    // cross-pass dimension conflict can exist on them.
    dedupDimensionConflict: false,
    visiblyFlagged,
    explicitUnresolvedMarker: item.status === 'UNRESOLVED' || item.exclusionReason !== null,
    hasDimensionBasis: Boolean(
      item.quantity.formula || item.quantity.dimensions || (item.quantity.steps?.length ?? 0) > 0,
    ),
    hasEvidence:
      (item.sourcePages?.length ?? 0) > 0 ||
      (item.quantity.sourcePages?.length ?? 0) > 0 ||
      (item.visionEvidence?.length ?? 0) > 0,
  };
}

function adaptMagicAiItem(item: AiEstimateWorkItem): AuditItemView {
  const warnings = (item.warnings ?? []).map((w) =>
    typeof w === 'string' ? w : asText((w as { message?: unknown } | null)?.message) || 'warning',
  );
  const unresolved =
    item.quantity === null ||
    item.unitPrice === null ||
    item.unitPrice === undefined ||
    item.status === 'UNRESOLVED' ||
    item.status === 'BLOCKED' ||
    item.quantityStatus === 'BLOCKED_FROM_TOTAL' ||
    item.quantityStatus === 'SUSPICIOUS' ||
    item.quantityStatus === 'UNRESOLVED';
  const visiblyFlagged =
    item.status === 'UNRESOLVED' ||
    item.status === 'BLOCKED' ||
    warnings.length > 0 ||
    (item.quantityStatus !== undefined && item.quantityStatus !== 'ACCEPTED') ||
    item.quantitySource === 'UNRESOLVED' ||
    item.quantitySource === 'ASSUMPTION' ||
    item.priceSource === 'UNRESOLVED' ||
    (item.assumptions?.length ?? 0) > 0;
  return {
    id: item.id,
    name: item.workName || item.item || item.id,
    category: item.category,
    shape: 'MAGIC_AI',
    quantity: item.quantity,
    unit: item.unit,
    quantitySource: item.quantitySource,
    quantityFormula: item.formula ?? '',
    rawDimensions: item.dimensions ?? '',
    sourceEvidence: item.sourceEvidence ?? '',
    visionEvidenceCount: 0,
    sourcePages: item.sourcePages ?? [],
    unitPrice: item.unitPrice ?? null,
    priceSource: item.priceSource,
    priceVerifiedClaim: false,
    status: item.status,
    quantityStatus: item.quantityStatus,
    detectionStatus: item.detectionStatus,
    subtotal: item.subtotal ?? null,
    warnings,
    assumptions: item.assumptions ?? [],
    unresolved,
    // Magic AI items never pass through the ded-ai dedup, so no recorded
    // cross-pass dimension conflict can exist on them.
    dedupDimensionConflict: false,
    visiblyFlagged,
    explicitUnresolvedMarker:
      item.status === 'UNRESOLVED' ||
      item.detectionStatus === 'UNRESOLVED' ||
      item.quantityStatus === 'UNRESOLVED',
    hasDimensionBasis: Boolean(item.formula || item.dimensions || item.sourceEvidence),
    hasEvidence: (item.sourcePages?.length ?? 0) > 0 || Boolean(item.sourceEvidence),
  };
}

function adaptItem(item: DedAiItem | FullAiItem | AiEstimateWorkItem): AuditItemView {
  const raw = item as unknown as Record<string, unknown>;
  if ('workName' in raw && 'warnings' in raw) return adaptMagicAiItem(item as AiEstimateWorkItem);
  const qty = raw['quantity'];
  if (qty !== null && typeof qty === 'object' && 'value' in (qty as Record<string, unknown>)) {
    return adaptFullAiItem(item as FullAiItem);
  }
  return adaptDedAiItem(item as DedAiItem);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_NORMALIZED_UNITS = new Set(['m³', 'm²', 'm', 'unit', 'titik', 'kg', 'ls']);

function notEvaluated(number: number, reason: string, evidence: string[] = []): AuditQuestionResult {
  return { number, question: AUDIT_QUESTIONS[number - 1], verdict: 'NOT_EVALUATED', reason, evidence };
}

function verdict(
  number: number,
  v: AuditVerdict,
  reason: string,
  evidence: string[],
): AuditQuestionResult {
  return { number, question: AUDIT_QUESTIONS[number - 1], verdict: v, reason, evidence };
}

function idsOf(views: AuditItemView[]): string[] {
  return views.map((v) => v.id);
}

/** Floor-area context for the Q19 note only — never a threshold. */
function floorAreaNote(input: SelfReviewInput): string | null {
  const fromPlan = input.planContext?.floorAreaM2;
  if (fromPlan !== null && fromPlan !== undefined && Number.isFinite(fromPlan)) {
    return `Luas lantai ${fromPlan} m² (dari item lantai pada hasil ini).`;
  }
  const rooms = input.rooms ?? input.contextMemory?.rooms;
  if (rooms && rooms.length > 0) {
    const total = rooms.reduce(
      (acc, r) => acc + (typeof r.areaM2 === 'number' && Number.isFinite(r.areaM2) ? r.areaM2 : 0),
      0,
    );
    if (total > 0) {
      return `Luas lantai ${total} m² (jumlah ${rooms.length} ruangan dari memori DED).`;
    }
    return 'Ruangan tersedia tetapi luasnya tidak tercatat.';
  }
  return null;
}

function floorCountNote(input: SelfReviewInput): string {
  if (input.floorCount === null || input.floorCount === undefined) return '';
  return ` Jumlah lantai ${input.floorCount} (diberikan model, bukan fakta terverifikasi).`;
}

/** Remaining duplicates in the final list: same work, unit, quantity, overlapping pages. */
function findRemainingDuplicates(views: AuditItemView[]): Array<{ key: string; ids: string[] }> {
  const normalizeName = (name: string): string => {
    let n = name.toLowerCase().trim().replace(/\s+/g, ' ');
    for (const prefix of ['pekerjaan ', 'pemasangan ', 'pembuatan ', 'pasangan ', 'instalasi ']) {
      if (n.startsWith(prefix)) n = n.slice(prefix.length);
    }
    return n.replace(/bata merah/g, 'bata').replace(/dinding bata/g, 'bata').trim();
  };
  const groups = new Map<string, AuditItemView[]>();
  for (const v of views) {
    const key = `${normalizeName(v.name)}|${dedUnitSafetyGate.normalizeUnit(v.unit)}|${v.quantity ?? 'null'}`;
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }
  const out: Array<{ key: string; ids: string[] }> = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    // Same extraction twice shares source pages (or both carry no pages at all).
    const pagesOverlap =
      list.every((v) => v.sourcePages.length === 0) ||
      list.some((a, i) =>
        list.slice(i + 1).some((b) => a.sourcePages.some((p) => b.sourcePages.includes(p))),
      );
    if (pagesOverlap) out.push({ key, ids: idsOf(list) });
  }
  return out;
}

/**
 * Re-derive a recorded derivation trail with the live `derivation.ts`
 * functions and compare. Returns null when the formula type has no live
 * re-derivation (the recorded validation status is then the only signal).
 */
function rederiveTrail(
  d: NonNullable<AuditItemView['derivation']>,
): { liveStatus: string; liveResult: number | null } | null {
  const byName = new Map(d.inputs.map((i) => [i.name, i]));
  const val = (name: string): number | null => {
    const inp = byName.get(name);
    return inp && typeof inp.value === 'number' && Number.isFinite(inp.value) ? inp.value : null;
  };
  const src = (name: string): 'DED' | 'USER' | 'ASSUMPTION' => {
    const inp = byName.get(name);
    return inp?.source === 'DED' || inp?.source === 'USER' ? inp.source : 'ASSUMPTION';
  };
  if (d.formulaType === 'kolom_volume') {
    const t = deriveKolomVolume(val('jumlah_kolom'), val('lebar'), val('panjang'), val('tinggi'), src('jumlah_kolom'));
    return { liveStatus: t.validationStatus, liveResult: t.result };
  }
  if (d.formulaType === 'dinding_netto' || d.formulaType === 'dinding_bruto') {
    const t = deriveDindingNetto(val('panjang'), val('tinggi'), val('luas_bukaan'), src('luas_bukaan'));
    return { liveStatus: t.validationStatus, liveResult: t.result };
  }
  if (d.formulaType === 'plester') {
    const t = derivePlester(val('luas_bidang'), val('jumlah_sisi'), src('jumlah_sisi'));
    return { liveStatus: t.validationStatus, liveResult: t.result };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------

/**
 * Runs the 20-question self-review audit. Pure and read-only: it never
 * mutates `input.items` or anything else, and never persists anything.
 */
export function runSelfReviewAudit(input: SelfReviewInput): SelfReviewAuditReport {
  const views = (input.items ?? []).map(adaptItem);
  const totalItems = views.length;
  const pagesTotal = input.pagesTotal;
  const pagesProcessed = input.pagesProcessed;
  const questions: AuditQuestionResult[] = [];

  const safe = (number: number, fn: () => AuditQuestionResult): AuditQuestionResult => {
    try {
      return fn();
    } catch (e) {
      return notEvaluated(
        number,
        `Tidak dapat dievaluasi: ${(e as Error).message}`,
        [`question-${number}-error`],
      );
    }
  };

  // Q1 — every page processed (vacuous when there are no pages at all).
  questions.push(safe(1, () => {
    if (pagesTotal === 0) {
      return notEvaluated(1, 'Tidak ada halaman pada dokumen — tidak ada yang dapat diproses.', ['pagesTotal=0']);
    }
    if (pagesProcessed >= pagesTotal) {
      return verdict(1, 'PASS', `Diproses ${pagesProcessed} dari ${pagesTotal} halaman.`, [
        `processed=${pagesProcessed}`,
        `total=${pagesTotal}`,
      ]);
    }
    return verdict(1, 'FAIL', `Hanya diproses ${pagesProcessed} dari ${pagesTotal} halaman — ${pagesTotal - pagesProcessed} halaman belum diproses.`, [
      `processed=${pagesProcessed}`,
      `total=${pagesTotal}`,
      `missing=${pagesTotal - pagesProcessed}`,
    ]);
  }));

  // Q2 — major work identified. No item-count threshold: the check is
  // breadth (non-empty, named, categorized inventory). The reason states
  // openly that this is a breadth check, not proof of completeness —
  // no independent work checklist exists on this path.
  questions.push(safe(2, () => {
    if (totalItems === 0) {
      return notEvaluated(2, 'Tidak ada item — tidak ada inventaris pekerjaan yang dapat dinilai.', ['items=0']);
    }
    const unnamed = views.filter((v) => !v.name.trim() || !v.category.trim());
    if (unnamed.length > 0) {
      return verdict(2, 'FAIL', `${unnamed.length} dari ${totalItems} item tanpa nama/kategori — inventaris tidak lengkap.`, idsOf(unnamed));
    }
    const categories = [...new Set(views.map((v) => v.category))];
    return verdict(
      2,
      'PASS',
      `${totalItems} item dalam ${categories.length} kategori. Pemeriksaan keluasan saja — tidak ada daftar periksa independen pada jalur ini, sehingga kelengkapan tidak dapat dibuktikan penuh dari data ini.`,
      [`items=${totalItems}`, `categories=${categories.length}`, ...categories.slice(0, 10)],
    );
  }));

  // Q3 — stopped early: Q1 and Q2 composed (no independent threshold).
  questions.push(safe(3, () => {
    const q1 = questions[0];
    const q2 = questions[1];
    if (q1.verdict === 'FAIL') {
      return verdict(3, 'FAIL', `Penelusuran berhenti sebelum semua halaman diproses (${pagesProcessed} dari ${pagesTotal} halaman).`, q1.evidence);
    }
    if (q1.verdict === 'NOT_EVALUATED' || q2.verdict === 'NOT_EVALUATED') {
      return notEvaluated(3, 'Tidak dapat dipastikan penelusuran selesai — cakupan halaman atau inventaris tidak dapat dievaluasi.', [...q1.evidence, ...q2.evidence]);
    }
    if (q2.verdict === 'FAIL') {
      return verdict(3, 'FAIL', 'Inventaris pekerjaan tidak lengkap — penelusuran mungkin berhenti sebelum waktunya.', q2.evidence);
    }
    return verdict(3, 'PASS', `Penelusuran selesai tanpa henti prematur: ${pagesProcessed} dari ${pagesTotal} halaman, ${totalItems} item teridentifikasi.`, [
      `processed=${pagesProcessed}`,
      `total=${pagesTotal}`,
      `items=${totalItems}`,
    ]);
  }));

  // Q4 — missed dimensions: quantified items with no dimensional basis.
  questions.push(safe(4, () => {
    const quantified = views.filter((v) => v.quantity !== null && v.quantity > 0);
    if (totalItems === 0 || quantified.length === 0) {
      return notEvaluated(4, 'Tidak ada item berkuantitas — tidak ada dimensi yang dapat diperiksa.', ['quantified=0']);
    }
    const noBasis = quantified.filter((v) => !v.hasDimensionBasis);
    if (noBasis.length > 0) {
      return verdict(4, 'FAIL', `${noBasis.length} dari ${quantified.length} item berkuantitas tanpa dasar dimensi (tanpa dimensi mentah, rumus, jejak derivasi, atau bukti sumber).`, idsOf(noBasis));
    }
    return verdict(4, 'PASS', `Seluruh ${quantified.length} item berkuantitas memiliki dasar dimensi (dimensi mentah, rumus, jejak derivasi, atau bukti sumber).`, [
      `quantified=${quantified.length}`,
    ]);
  }));

  // Q5 — missed schedules: door/window items present is the only
  // evidence available. Absence is NOT a failure (the run may
  // legitimately contain no schedule items) and no schedule codes are
  // ever named — none were verified.
  questions.push(safe(5, () => {
    if (totalItems === 0) {
      return notEvaluated(5, 'Tidak ada item — jadwal tidak dapat diperiksa.', ['items=0']);
    }
    const scheduleItems = views.filter(
      (v) => v.category === 'DOOR_WINDOW' || /pintu|jendela|kusen/i.test(v.name) || /pintu|jendela|kusen/i.test(v.category),
    );
    if (scheduleItems.length === 0) {
      return notEvaluated(
        5,
        'Tidak ada item pintu/jendela/kusen pada hasil ini — jadwal tidak dapat dikonfirmasi maupun dibantah dari data ini.',
        ['schedule-items=0'],
      );
    }
    return verdict(5, 'PASS', `${scheduleItems.length} item jadwal pintu/jendela/kusen teridentifikasi dari DED.`, idsOf(scheduleItems));
  }));

  // Q6 — missed quantities: null-quantity items must carry an explicit
  // unresolved marker (v3 Q4 pattern); silently missing is a FAIL.
  questions.push(safe(6, () => {
    if (totalItems === 0) {
      return notEvaluated(6, 'Tidak ada item — tidak ada kuantitas yang dapat diperiksa.', ['items=0']);
    }
    const missing = views.filter((v) => v.quantity === null);
    if (missing.length === 0) {
      return verdict(6, 'PASS', `Seluruh ${totalItems} item memiliki kuantitas.`, [`items=${totalItems}`]);
    }
    const unmarked = missing.filter((v) => !v.explicitUnresolvedMarker);
    if (unmarked.length > 0) {
      return verdict(6, 'FAIL', `${unmarked.length} dari ${missing.length} item tanpa kuantitas tidak ditandai eksplisit sebagai belum teresolusi.`, idsOf(unmarked));
    }
    return verdict(6, 'PASS', `${missing.length} item tanpa kuantitas — seluruhnya ditandai eksplisit sebagai belum teresolusi (bukan hilang diam-diam).`, idsOf(missing));
  }));

  // Q7 — assumed quantities: FAIL with the count when items carry an
  // ASSUMPTION quantity source. Never a hardcoded pass.
  questions.push(safe(7, () => {
    if (totalItems === 0) {
      return notEvaluated(7, 'Tidak ada item — tidak ada kuantitas asumsi yang dapat diperiksa.', ['items=0']);
    }
    const assumed = views.filter((v) => v.quantitySource === 'ASSUMPTION');
    if (assumed.length > 0) {
      return verdict(7, 'FAIL', `${assumed.length} dari ${totalItems} item memakai kuantitas asumsi — perlu persetujuan pengguna.`, idsOf(assumed));
    }
    return verdict(7, 'PASS', `Tidak ada kuantitas asumsi pada ${totalItems} item.`, [`items=${totalItems}`]);
  }));

  // Q8 — default quantities: v3 Q5 pattern — formula text carrying a
  // guessed/default marker. No marker anywhere is a PASS with evidence.
  questions.push(safe(8, () => {
    if (totalItems === 0) {
      return notEvaluated(8, 'Tidak ada item — tidak ada rumus kuantitas yang dapat diperiksa.', ['items=0']);
    }
    const flagged = views.filter((v) => {
      const text = `${v.quantityFormula} ${v.derivation?.notes ?? ''}`;
      return /guessed/i.test(text) || /default\s*1/i.test(text);
    });
    if (flagged.length > 0) {
      return verdict(8, 'FAIL', `${flagged.length} item memakai kuantitas default/tebakan tanpa dasar (penanda pada rumus).`, idsOf(flagged));
    }
    return verdict(8, 'PASS', `Tidak ada penanda kuantitas default/tebakan pada rumus ${totalItems} item.`, [`items=${totalItems}`]);
  }));

  // Q9 — materials vs work items: the ported live semanticClassifier runs
  // by default (owner ACC 2026-11-25); a caller-supplied hook overrides it.
  // UNKNOWN (the classifier cannot decide) → NOT_EVALUATED, never a
  // fabricated material/work label; a confident non-work entity → FAIL.
  questions.push(safe(9, () => {
    if (totalItems === 0) {
      return notEvaluated(9, 'Tidak ada item — tidak ada yang dapat diklasifikasi.', ['items=0']);
    }
    const classify = input.classifyConstructionWork ?? defaultConstructionWorkClassifier;
    const unknown: AuditItemView[] = [];
    const nonWork: AuditItemView[] = [];
    for (const v of views) {
      let outcome: { isConstructionWork: boolean; reason?: string; entityType?: LiveDedEntityType };
      try {
        outcome = classify(v.name, v.category);
      } catch {
        unknown.push(v);
        continue;
      }
      if (outcome.entityType === 'UNKNOWN') {
        unknown.push(v);
      } else if (!outcome.isConstructionWork) {
        nonWork.push(v);
      }
    }
    if (unknown.length > 0) {
      return notEvaluated(
        9,
        `${unknown.length} item tidak dapat diklasifikasi sebagai material vs pekerjaan (pengklasifikasi tidak dapat memutuskan): ${unknown.map((v) => v.name).join(', ')}.`,
        idsOf(unknown),
      );
    }
    if (nonWork.length > 0) {
      return verdict(9, 'FAIL', `${nonWork.length} item terklasifikasi sebagai material, bukan pekerjaan: ${nonWork.map((v) => v.name).join(', ')}.`, idsOf(nonWork));
    }
    return verdict(9, 'PASS', `Seluruh ${totalItems} item terklasifikasi sebagai pekerjaan konstruksi.`, [`items=${totalItems}`]);
  }));

  // Q10 — duplicates: report the deduper's merge count; FAIL only when
  // unmerged duplicates remain in the final list.
  questions.push(safe(10, () => {
    if (totalItems === 0) {
      return notEvaluated(10, 'Tidak ada item — tidak ada duplikat yang dapat diperiksa.', ['items=0']);
    }
    const remaining = findRemainingDuplicates(views);
    const mergeNote =
      input.duplicatesMerged !== undefined && input.duplicatesMerged !== null
        ? `Deduper menggabungkan ${input.duplicatesMerged} duplikat sebelum daftar final.`
        : 'Jumlah gabungan deduper tidak diteruskan ke audit.';
    if (remaining.length > 0) {
      const dupIds = remaining.flatMap((r) => r.ids);
      return verdict(10, 'FAIL', `${mergeNote} ${remaining.length} kelompok duplikat belum tergabung pada daftar final: ${dupIds.join(', ')}.`, dupIds);
    }
    return verdict(10, 'PASS', `${mergeNote} Tidak ada duplikat tersisa pada daftar final (${totalItems} item).`, [
      `items=${totalItems}`,
      `merged=${input.duplicatesMerged ?? 'unknown'}`,
    ]);
  }));

  // Q11 — every quantity has evidence. Vacuous-true on an empty list is
  // forbidden: empty (or no quantified items) → NOT_EVALUATED.
  questions.push(safe(11, () => {
    const quantified = views.filter((v) => v.quantity !== null);
    if (totalItems === 0 || quantified.length === 0) {
      return notEvaluated(11, 'Tidak ada item berkuantitas — tidak ada bukti kuantitas yang dapat diperiksa.', ['quantified=0']);
    }
    const unevidenced = quantified.filter((v) => !v.hasEvidence);
    if (unevidenced.length > 0) {
      return verdict(11, 'FAIL', `${unevidenced.length} dari ${quantified.length} item berkuantitas tanpa bukti (tanpa halaman sumber, bukti teks, atau bukti visual).`, idsOf(unevidenced));
    }
    return verdict(11, 'PASS', `Seluruh ${quantified.length} item berkuantitas memiliki bukti (halaman sumber, bukti teks, atau bukti visual).`, [
      `quantified=${quantified.length}`,
    ]);
  }));

  // Q12 — every quantity has a valid unit: blank, unknown, or
  // engineering-invalid units fail. Vacuous-true on empty → NOT_EVALUATED.
  questions.push(safe(12, () => {
    if (totalItems === 0) {
      return notEvaluated(12, 'Tidak ada item — tidak ada satuan yang dapat diperiksa.', ['items=0']);
    }
    const invalid: Array<{ id: string; why: string }> = [];
    for (const v of views) {
      const raw = (v.unit ?? '').trim();
      if (!raw) {
        invalid.push({ id: v.id, why: 'satuan kosong' });
        continue;
      }
      const norm = dedUnitSafetyGate.normalizeUnit(raw);
      if (!KNOWN_NORMALIZED_UNITS.has(norm)) {
        invalid.push({ id: v.id, why: `satuan tidak dikenal: '${raw}'` });
        continue;
      }
      const eng = dedUnitSafetyGate.validateWorkItemEngineeringUnit(v.name, raw);
      if (!eng.isValid) invalid.push({ id: v.id, why: eng.rejectionReason ?? 'satuan tidak valid secara teknik' });
    }
    if (invalid.length > 0) {
      return verdict(12, 'FAIL', `${invalid.length} dari ${totalItems} item memakai satuan tidak valid: ${invalid.map((i) => `${i.id} (${i.why})`).join('; ')}.`, invalid.map((i) => i.id));
    }
    return verdict(12, 'PASS', `Seluruh ${totalItems} item memakai satuan yang dikenal dan valid secara teknik.`, [`items=${totalItems}`]);
  }));

  // Q13 — formula sense: re-derive recorded derivation trails with the
  // live `derivation.ts` functions and compare against the recorded
  // result + validation status. Formula-only items are noted, not
  // re-derived. No trail and no formula anywhere → NOT_EVALUATED.
  questions.push(safe(13, () => {
    if (totalItems === 0) {
      return notEvaluated(13, 'Tidak ada item — tidak ada rumus yang dapat diperiksa.', ['items=0']);
    }
    const failures: string[] = [];
    const failureIds: string[] = [];
    let trailsChecked = 0;
    let trailsOk = 0;
    let formulaOnly = 0;
    for (const v of views) {
      if (v.derivation) {
        trailsChecked++;
        const status = v.derivation.validationStatus ?? '';
        if (status.startsWith('rejected')) {
          failures.push(`${v.id}: jejak derivasi ditolak (${status})`);
          failureIds.push(v.id);
          continue;
        }
        const live = rederiveTrail(v.derivation);
        if (live === null) {
          // Unknown formula type: recorded status is the only signal.
          if (status.startsWith('ok')) trailsOk++;
          else {
            failures.push(`${v.id}: status validasi derivasi tidak dapat dipastikan ('${status}')`);
            failureIds.push(v.id);
          }
          continue;
        }
        if (live.liveStatus.startsWith('rejected')) {
          failures.push(`${v.id}: hitung-ulang menolak derivasi (${live.liveStatus})`);
          failureIds.push(v.id);
          continue;
        }
        const recorded = v.derivation.result;
        if (recorded !== null && recorded !== undefined && live.liveResult !== null && live.liveResult !== undefined) {
          if (Math.abs(recorded - live.liveResult) > 0.011) {
            failures.push(`${v.id}: hasil derivasi tercatat ${recorded} tetapi hitung-ulang ${live.liveResult}`);
            failureIds.push(v.id);
            continue;
          }
        }
        if ((recorded === null || recorded === undefined) && live.liveResult !== null && live.liveResult !== undefined) {
          failures.push(`${v.id}: hasil derivasi tercatat kosong tetapi hitung-ulang ${live.liveResult}`);
          failureIds.push(v.id);
          continue;
        }
        trailsOk++;
      } else if (v.quantityFormula && v.quantityFormula.trim().length > 0) {
        formulaOnly++;
      }
    }
    if (failures.length > 0) {
      return verdict(13, 'FAIL', `${failures.length} jejak derivasi tidak konsisten: ${failures.join('; ')}.`, failureIds);
    }
    if (trailsChecked === 0 && formulaOnly === 0) {
      return notEvaluated(13, 'Tidak ada jejak derivasi atau rumus pada hasil ini — kewajaran rumus tidak dapat diperiksa.', ['trails=0', 'formulas=0']);
    }
    return verdict(
      13,
      'PASS',
      `${trailsOk} jejak derivasi terverifikasi lewat hitung-ulang${formulaOnly > 0 ? `; ${formulaOnly} item membawa rumus teks saja (tidak dihitung-ulang)` : ''}.`,
      [`trails=${trailsChecked}`, `trails-ok=${trailsOk}`, `formula-only=${formulaOnly}`],
    );
  }));

  // Q14 — AHSP semantic match: unmatched items count as review, never
  // as PASS. Consumes Phase B per-item gate results where supplied
  // (Gate 5/6 FAIL also marks the item as review).
  questions.push(safe(14, () => {
    const shapes = new Set(views.map((v) => v.shape));
    const hasMagicOnly = shapes.size === 1 && shapes.has('MAGIC_AI');
    if (totalItems === 0) {
      return notEvaluated(14, 'Tidak ada item — tidak ada kecocokan AHSP yang dapat diperiksa.', ['items=0']);
    }
    if (hasMagicOnly) {
      return notEvaluated(14, 'Jalur ini tidak memakai pencocokan AHSP — tidak ada kecocokan yang dapat diperiksa.', ['ahsp=not-applicable']);
    }
    const review: AuditItemView[] = [];
    const matched: AuditItemView[] = [];
    for (const v of views) {
      if (v.shape === 'MAGIC_AI') continue;
      const gate = input.gateResults?.get(v.id);
      const gateReview = gate !== undefined && gate.gates.some((g) => (g.gate === 5 || g.gate === 6) && g.status === 'FAIL');
      const aiCustom = (v.ahspCode ?? '').startsWith('AI-CUSTOM');
      if (v.ahspStatus === 'RESOLVED' && !gateReview && !aiCustom) matched.push(v);
      else review.push(v);
    }
    if (review.length > 0) {
      const detail = review
        .map((v) => `${v.id} (${v.ahspStatus ?? 'tanpa kecocokan AHSP'})`)
        .join('; ');
      return verdict(14, 'FAIL', `${review.length} dari ${totalItems} item belum tercocokkan AHSP secara semantik dan butuh tinjauan — tidak semua item cocok: ${detail}.`, idsOf(review));
    }
    return verdict(14, 'PASS', `Seluruh ${matched.length} item tercocokkan AHSP secara semantik (status RESOLVED, tanpa kode sintetis).`, [
      `matched=${matched.length}`,
    ]);
  }));

  // Q15 — AHSP unit vs quantity unit, via the live unit safety gate.
  // Consumes Phase B Gate 4 results where supplied.
  questions.push(safe(15, () => {
    if (totalItems === 0) {
      return notEvaluated(15, 'Tidak ada item — tidak ada pasangan satuan yang dapat diperiksa.', ['items=0']);
    }
    const evaluable = views.filter(
      (v) => v.shape !== 'MAGIC_AI' && v.ahspUnit !== undefined && v.ahspUnit.trim().length > 0,
    );
    if (evaluable.length === 0) {
      return notEvaluated(15, 'Tidak ada item dengan satuan AHSP — pasangan satuan tidak dapat diperiksa.', ['evaluable=0']);
    }
    const bad: Array<{ id: string; why: string }> = [];
    for (const v of evaluable) {
      const gate = input.gateResults?.get(v.id);
      const gate4 = gate?.gates.find((g) => g.gate === 4);
      if (gate4 && gate4.status === 'FAIL') {
        bad.push({ id: v.id, why: gate4.reason });
        continue;
      }
      const check = dedUnitSafetyGate.verifyUnitCompatibility(v.unit, v.ahspUnit as string);
      if (!check.isCompatible) bad.push({ id: v.id, why: check.rejectionReason ?? 'satuan tidak kompatibel' });
    }
    if (bad.length > 0) {
      return verdict(15, 'FAIL', `${bad.length} dari ${evaluable.length} item memakai satuan kuantitas yang tidak cocok dengan satuan AHSP: ${bad.map((b) => `${b.id} (${b.why})`).join('; ')}.`, bad.map((b) => b.id));
    }
    return verdict(15, 'PASS', `Satuan kuantitas cocok dengan satuan AHSP pada seluruh ${evaluable.length} item yang dapat dievaluasi.`, [
      `evaluable=${evaluable.length}`,
    ]);
  }));

  // Q16 — price source honesty: an AI-estimate price is never a
  // verified source. A VERIFIED claim without AHSP backing fails.
  questions.push(safe(16, () => {
    if (totalItems === 0) {
      return notEvaluated(16, 'Tidak ada item — tidak ada harga yang dapat diperiksa.', ['items=0']);
    }
    const priced = views.filter((v) => v.unitPrice !== null && v.unitPrice !== undefined && v.unitPrice > 0);
    if (priced.length === 0) {
      return notEvaluated(16, 'Tidak ada item berharga — tidak ada sumber harga yang dapat diperiksa.', ['priced=0']);
    }
    const bad: Array<{ id: string; why: string }> = [];
    for (const v of priced) {
      if (v.priceSource === 'UNRESOLVED') {
        bad.push({ id: v.id, why: 'harga terisi tetapi sumber harga UNRESOLVED' });
      } else if (v.priceSource === 'VERIFIED_SOURCE') {
        bad.push({ id: v.id, why: 'klaim sumber terverifikasi lawas tanpa dukungan database' });
      } else if (v.priceVerifiedClaim && v.priceSource !== 'AHSP_2026') {
        bad.push({ id: v.id, why: `harga ${v.priceSource} diklaim terverifikasi` });
      } else if (v.priceSource === 'AHSP_2026' && !v.ahspCode) {
        bad.push({ id: v.id, why: 'harga AHSP tanpa kode AHSP pendukung' });
      }
    }
    if (bad.length > 0) {
      return verdict(16, 'FAIL', `${bad.length} dari ${priced.length} harga bermasalah sumbernya: ${bad.map((b) => `${b.id} (${b.why})`).join('; ')}.`, bad.map((b) => b.id));
    }
    const ahspCount = priced.filter((v) => v.priceSource === 'AHSP_2026').length;
    const aiCount = priced.filter((v) => v.priceSource === 'AI_ESTIMATE').length;
    const userCount = priced.filter((v) => v.priceSource === 'USER_INPUT').length;
    return verdict(
      16,
      'PASS',
      `${priced.length} harga berlabel jujur: ${ahspCount} dari katalog AHSP resmi, ${aiCount} estimasi AI (bukan harga terverifikasi), ${userCount} input pengguna.`,
      [`priced=${priced.length}`, `ahsp=${ahspCount}`, `ai-estimate=${aiCount}`, `user=${userCount}`],
    );
  }));

  // Q17 — conflicts between pages. Two REAL sources, both read-only;
  // the audit never invents a conflict and never re-derives dimensions.
  //
  // (a) Ded-ai path — recorded cross-pass dimension conflict. The live
  // dedup (`mergeRawItemsAcrossPasses`, service.ts:766) deterministically
  // groups raw items by normalized name+unit and compares dimension
  // signatures (`dimensionSignatureOf`, parsed numerics, no LLM). Same
  // name+unit with DIFFERENT dimensions across passes is kept twice
  // and flagged `__dedupDimensionConflict` (service.ts:790); the flag
  // is recorded on the item as a provenance entry `dedup-conflict: …`
  // (service.ts:394) plus a review note, and survives price completion
  // and finalizeItems (both spread the item). The dedup runs
  // unconditionally in `execute` (service.ts:1390, single call site in
  // production code; `convertAiItem` is additionally called directly
  // only by test harnesses — `.src.ts` files — which bypass the dedup,
  // so the PASS below is scoped to items produced by live `execute`),
  // so a DED_AI item list with no such marker is a list the check ran
  // over and found clean — that is the PASS. Scope is stated in the
  // reason: only same-name+unit dimension conflicts across passes are
  // covered; contradictions under different names (spec vs schedule)
  // are not.
  //
  // (b) Magic AI path — unresolved information queries from memory
  // (pre-existing behaviour, unchanged).
  //
  // Either source reporting a conflict FAILs; PASS needs at least one
  // source to have been available and clean; neither available stays
  // NOT_EVALUATED (never a fabricated zero-conflicts claim).
  questions.push(safe(17, () => {
    const dedAiViews = views.filter((v) => v.shape === 'DED_AI');
    const dedupConflicted = dedAiViews.filter((v) => v.dedupDimensionConflict);
    const memory = input.contextMemory;
    const unresolved = (memory?.missing_information_queries ?? []).filter((q) => !q.resolved);
    if (dedupConflicted.length > 0 || unresolved.length > 0) {
      const parts: string[] = [];
      const evidence: string[] = [];
      if (dedupConflicted.length > 0) {
        const detail = dedupConflicted
          .map((v) => `${v.id} (${v.name}, halaman ${v.sourcePages.length > 0 ? v.sourcePages.join(', ') : 'tanpa halaman'})`)
          .join('; ');
        parts.push(
          `${dedupConflicted.length} item membawa konflik dimensi antar-pass yang tercatat: ${detail} — nama+satuan sama dengan dimensi berbeda, keduanya dipertahankan untuk review.`,
        );
        evidence.push(...idsOf(dedupConflicted));
      }
      if (unresolved.length > 0) {
        parts.push(
          `${unresolved.length} pertanyaan informasi antar-halaman belum teresolusi: ${unresolved.map((q) => q.question).join('; ')}.`,
        );
        evidence.push(...unresolved.map((_, i) => `query-${i + 1}`));
      }
      return verdict(17, 'FAIL', parts.join(' '), evidence);
    }
    if (dedAiViews.length > 0 || memory) {
      const sources: string[] = [];
      if (dedAiViews.length > 0) {
        sources.push(
          `pemeriksaan dedup antar-pass atas ${dedAiViews.length} item (nama+satuan+sidik dimensi deterministik) tidak menemukan konflik dimensi`,
        );
      }
      if (memory) {
        sources.push('tidak ada pertanyaan informasi antar-halaman yang belum teresolusi pada memori DED');
      }
      const scopeNote =
        dedAiViews.length > 0
          ? ' Cakupan pemeriksaan ded-ai terbatas pada konflik dimensi antar-pass untuk nama+satuan yang sama; kontradiksi antar-halaman lain di luar itu tidak tercakup.'
          : '';
      return verdict(
        17,
        'PASS',
        `${sources.join('; ')}.${scopeNote}`,
        [`items=${dedAiViews.length}`, 'dedup-conflicts=0', `unresolved-queries=${unresolved.length}`],
      );
    }
    return notEvaluated(17, 'Tidak ada sumber data konflik pada jalur ini — konflik antar-halaman tidak dapat diperiksa.', ['conflict-source=missing']);
  }));

  // Q18 — unresolved items still visible: every unresolved item must
  // carry a visible/labeled flag; a silently-resolved item fails.
  questions.push(safe(18, () => {
    if (totalItems === 0) {
      return notEvaluated(18, 'Tidak ada item — tidak ada yang dapat diperiksa visibilitasnya.', ['items=0']);
    }
    const unresolvedItems = views.filter((v) => v.unresolved);
    if (unresolvedItems.length === 0) {
      return verdict(18, 'PASS', 'Tidak ada item belum teresolusi — tidak ada yang berisiko tersembunyi.', ['unresolved=0']);
    }
    const hidden = unresolvedItems.filter((v) => !v.visiblyFlagged);
    if (hidden.length > 0) {
      return verdict(18, 'FAIL', `${hidden.length} dari ${unresolvedItems.length} item belum teresolusi tampil tanpa penanda (tampak selesai padahal belum).`, idsOf(hidden));
    }
    return verdict(18, 'PASS', `Seluruh ${unresolvedItems.length} item belum teresolusi tetap tampil dengan penanda statusnya.`, idsOf(unresolvedItems));
  }));

  // Q19 — suspicious quantities. The envelope comes from live data only:
  // per-item `quantityReview` outcomes (ded-ai) / `quantityStatus`
  // outcomes (Magic AI). Floor area is note context only, never a new
  // threshold. No new ratio is introduced here.
  questions.push(safe(19, () => {
    const areaNote = floorAreaNote(input);
    const floorNote = floorCountNote(input);
    const contextNote = [areaNote, floorNote.trim().length > 0 ? floorNote.trim() : null]
      .filter(Boolean)
      .join(' ');
    const flagged = views.filter(
      (v) =>
        v.quantityReview?.outcome === 'NEEDS_REVIEW' ||
        v.quantityStatus === 'BLOCKED_FROM_TOTAL' ||
        v.quantityStatus === 'SUSPICIOUS',
    );
    if (flagged.length > 0) {
      const detail = flagged
        .map((v) => {
          const code = v.quantityReview?.reasonCode ?? v.quantityStatus ?? 'NEEDS_REVIEW';
          return `${v.id} (${code})`;
        })
        .join('; ');
      return verdict(
        19,
        'FAIL',
        `${flagged.length} item membawa hasil penilaian kewajaran NEEDS_REVIEW: ${detail}.${contextNote ? ` ${contextNote}` : ''}`,
        idsOf(flagged),
      );
    }
    const reviewed = views.filter(
      (v) => v.quantityReview !== undefined || v.quantityStatus === 'ACCEPTED',
    );
    const reasonable = views.filter(
      (v) => v.quantityReview?.outcome === 'REASONABLE' || v.quantityStatus === 'ACCEPTED',
    ).length;
    const insufficient = views.filter((v) => v.quantityReview?.outcome === 'INSUFFICIENT_CONTEXT').length;
    if (reviewed.length > 0) {
      if (reasonable === 0) {
        return notEvaluated(
          19,
          `Tidak ada item yang dapat diperiksa skalanya — seluruh ${insufficient} item berstatus konteks tidak cukup.${contextNote ? ` ${contextNote}` : ''}`,
          [`insufficient-context=${insufficient}`],
        );
      }
      return verdict(
        19,
        'PASS',
        `Tidak ada item NEEDS_REVIEW: ${reasonable} item wajar menurut penilaian kewajaran${insufficient > 0 ? `, ${insufficient} item konteks tidak cukup (tidak dinilai wajar)` : ''}.${contextNote ? ` ${contextNote}` : ''}`,
        [`reasonable=${reasonable}`, `insufficient-context=${insufficient}`, `flagged=0`],
      );
    }
    // No per-item outcomes carried: fall back to a supplied aggregate.
    const supplied = input.quantityReviews ?? [];
    if (supplied.length > 0) {
      const suppliedFlagged = supplied.filter((r) => r.outcome === 'NEEDS_REVIEW');
      if (suppliedFlagged.length > 0) {
        return verdict(
          19,
          'FAIL',
          `${suppliedFlagged.length} hasil penilaian kewajaran NEEDS_REVIEW (id item tidak diteruskan).${contextNote ? ` ${contextNote}` : ''}`,
          [`flagged=${suppliedFlagged.length}`],
        );
      }
      const suppliedReasonable = supplied.filter((r) => r.outcome === 'REASONABLE').length;
      if (suppliedReasonable > 0) {
        return verdict(
          19,
          'PASS',
          `Tidak ada NEEDS_REVIEW pada ${supplied.length} hasil penilaian kewajaran yang diteruskan (${suppliedReasonable} wajar).${contextNote ? ` ${contextNote}` : ''}`,
          [`reasonable=${suppliedReasonable}`, 'flagged=0'],
        );
      }
      return notEvaluated(19, 'Hasil penilaian kewajaran yang diteruskan tidak memuat satu pun penilaian skala.', ['reviews=insufficient-only']);
    }
    if (!areaNote) {
      return notEvaluated(
        19,
        'floor area unknown — no envelope can be applied (luas lantai tidak diketahui — tidak ada amplop yang dapat diterapkan).',
        ['floor-area=unknown'],
      );
    }
    return notEvaluated(
      19,
      `Tidak ada hasil penilaian kewajaran kuantitas pada jalur ini. ${areaNote}`,
      ['reviews=none'],
    );
  }));

  // Q20 — final RAB consistent with the DED: arithmetic consistency of
  // every subtotal plus full page coverage. No invented page counts —
  // the actual counts are stated.
  questions.push(safe(20, () => {
    if (totalItems === 0 || pagesTotal === 0) {
      return notEvaluated(20, 'Tidak ada item atau halaman — konsistensi RAB final tidak dapat diperiksa.', ['items=0-or-pages=0']);
    }
    const mismatches: string[] = [];
    let checked = 0;
    for (const v of views) {
      if (v.quantity !== null && v.unitPrice !== null && v.subtotal !== null) {
        checked++;
        if (Math.abs(v.subtotal - v.quantity * v.unitPrice) > 0.5) {
          mismatches.push(`${v.id}: subtotal ${v.subtotal} ≠ ${v.quantity} × ${v.unitPrice}`);
        }
      } else if (v.quantity !== null && v.unitPrice !== null && v.subtotal === null) {
        mismatches.push(`${v.id}: subtotal kosong padahal kuantitas dan harga tersedia`);
      } else if ((v.quantity === null || v.unitPrice === null) && v.subtotal !== null) {
        mismatches.push(`${v.id}: subtotal terisi padahal kuantitas/harga kosong`);
      }
    }
    if (mismatches.length > 0) {
      return verdict(20, 'FAIL', `${mismatches.length} inkonsistensi aritmetika pada RAB final: ${mismatches.join('; ')}.`, mismatches.map((m) => m.split(':')[0]));
    }
    if (pagesProcessed < pagesTotal) {
      return verdict(20, 'FAIL', `RAB final tidak konsisten dengan DED: hanya ${pagesProcessed} dari ${pagesTotal} halaman diproses.`, [
        `processed=${pagesProcessed}`,
        `total=${pagesTotal}`,
      ]);
    }
    return verdict(
      20,
      'PASS',
      `RAB final konsisten dengan DED: ${checked} subtotal terverifikasi aritmetikanya, ${pagesProcessed} dari ${pagesTotal} halaman diproses.`,
      [`subtotals-checked=${checked}`, `processed=${pagesProcessed}`, `total=${pagesTotal}`],
    );
  }));

  // ---- Metrics (v2 shape, honestly computed from the same live data) ----
  const quantityResolvedCount = views.filter((v) => v.quantity !== null && v.quantity > 0).length;
  const ahspCapable = views.filter((v) => v.shape !== 'MAGIC_AI');
  const ahspValidatedCount = ahspCapable.filter((v) => v.ahspStatus === 'RESOLVED').length;
  const ahspReviewCount = ahspCapable.length - ahspValidatedCount;
  const priceResolvedCount = views.filter((v) => v.unitPrice !== null && v.unitPrice > 0).length;
  const readyCount = views.filter(
    (v) => v.stage === 'CALCULATED' || v.status === 'VALID' || v.status === 'READY',
  ).length;
  const conflictCount =
    views.filter((v) => v.dedupDimensionConflict).length +
    (input.contextMemory?.missing_information_queries ?? []).filter((q) => !q.resolved).length;

  const failedCount = questions.filter((q) => q.verdict === 'FAIL').length;
  const notEvaluatedCount = questions.filter((q) => q.verdict === 'NOT_EVALUATED').length;
  const passedCount = questions.filter((q) => q.verdict === 'PASS').length;

  return {
    timestamp: new Date().toISOString(),
    failedCount,
    notEvaluatedCount,
    passedCount,
    complete: notEvaluatedCount === 0,
    cleanPass: failedCount === 0 && notEvaluatedCount === 0,
    questions,
    metrics: {
      pagesTotal,
      pagesProcessed,
      inventoryCount: totalItems,
      quantityResolvedCount,
      quantityUnresolvedCount: totalItems - quantityResolvedCount,
      quantityResolutionRate:
        totalItems > 0 ? Math.round((quantityResolvedCount / totalItems) * 100) : 0,
      ahspValidatedCount,
      ahspReviewCount,
      ahspValidationRate:
        ahspCapable.length > 0 ? Math.round((ahspValidatedCount / ahspCapable.length) * 100) : 0,
      priceResolvedCount,
      priceUnresolvedCount: totalItems - priceResolvedCount,
      priceResolutionRate: totalItems > 0 ? Math.round((priceResolvedCount / totalItems) * 100) : 0,
      readyCount,
      // Items not in a ready state (conflictCount counts recorded
      // conflicts — dedup-conflicted items plus unresolved information
      // queries — not items, so it is never subtracted here).
      reviewCount: totalItems - readyCount,
      conflictCount,
    },
  };
}

/**
 * "Audit unavailable" report: every question NOT_EVALUATED. Hooks use
 * this when the audit itself throws, so an audit error never fails the
 * run it audits.
 */
export function unavailableSelfReviewAudit(
  pagesTotal: number,
  pagesProcessed: number,
  reason: string,
): SelfReviewAuditReport {
  const questions: AuditQuestionResult[] = AUDIT_QUESTIONS.map((question, i) => ({
    number: i + 1,
    question,
    verdict: 'NOT_EVALUATED',
    reason: `Audit tidak tersedia: ${reason}`,
    evidence: ['audit-unavailable'],
  }));
  return {
    timestamp: new Date().toISOString(),
    failedCount: 0,
    notEvaluatedCount: AUDIT_QUESTION_COUNT,
    passedCount: 0,
    complete: false,
    cleanPass: false,
    questions,
    metrics: {
      pagesTotal,
      pagesProcessed,
      inventoryCount: 0,
      quantityResolvedCount: 0,
      quantityUnresolvedCount: 0,
      quantityResolutionRate: 0,
      ahspValidatedCount: 0,
      ahspReviewCount: 0,
      ahspValidationRate: 0,
      priceResolvedCount: 0,
      priceUnresolvedCount: 0,
      priceResolutionRate: 0,
      readyCount: 0,
      reviewCount: 0,
      conflictCount: 0,
    },
  };
}

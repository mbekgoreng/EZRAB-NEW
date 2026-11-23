/**
 * DED drawing-vision — visual review state (increment I7, spec §10).
 *
 * PURE logic: no React, no DOM. This is the state layer the Visual Review
 * Interface (`DedVisionReviewViewer.tsx`) runs on, and the layer I7b wires
 * into the live `DedAiResultView`.
 *
 * Model
 * -----
 * `ReviewItem` unifies everything reviewable into one shape: a
 * `DimensionRecord` | `OpeningRecord` | `GeometryQuantity` from the vision
 * layer, or a live `DedAiItem` from the DED result. Adapters
 * (`reviewItemFrom*`) build it; the adapters never invent data:
 *   - `originalText` (dimension as read) is preserved verbatim, never rewritten.
 *   - A missing value stays `null` — never 0, never a guess.
 *   - A missing position stays `bbox: null` — jumps become page-only, never
 *     a fake position.
 *   - Adapters never produce `VERIFIED` (see the guard below).
 *
 * VERIFIED guard (structural, not just documented)
 * -----------------------------------------------
 * `VERIFIED` can only be reached through `confirmItem` or `correctItem`
 * with `{ confirm: true }` — the only two functions that assign it, and
 * both require an explicit user action plus a non-null value. Confidence
 * alone caps at `HIGH_CONFIDENCE` (`statusFromConfidence` in types.ts).
 * There is no other path: adapters pass statuses through (they never
 * upgrade to VERIFIED), and no helper in this module assigns VERIFIED.
 *
 * Confirm rule (decided for I7, documented here)
 * ----------------------------------------------
 * `confirmItem` requires a non-null value. An item with no value —
 * including an UNRESOLVED item without evidence — cannot be confirmed:
 * there is nothing to confirm. The honest remedies are `correctItem`
 * (supply a value/input) or `rejectItem` (declare the detection wrong).
 * Confirming a `NOT_DETECTED` (rejected) item is likewise refused.
 *
 * Corrections
 * -----------
 * `correctItem` supports two shapes:
 *   - `{ type: 'input', inputName, value }` — correct ONE named input and
 *     recompute the dependent quantity deterministically through the I4
 *     geometry/QTO functions (SafeDecimalEngine). The formula string is
 *     display-only and is never parsed to compute. Requires the item to
 *     carry a `recomputeKind`; without one the correction is refused
 *     honestly (the caller can still correct the value directly).
 *   - `{ type: 'value', value }` — correct the value directly (user-
 *     supplied). The old formula is kept as the "rumus asal" and a note
 *     records that the value no longer follows it.
 * Invalid corrections (NaN, negative where invalid, fractional counts)
 * are refused and leave the item untouched — they never produce a
 * quantity. A corrected item becomes VERIFIED only when the correction
 * itself is confirmed (`{ confirm: true }`); otherwise NEEDS_REVIEW.
 * If a recompute succeeds on valid inputs but the geometry is
 * inconsistent (e.g. openings exceed the wall), the quantity becomes
 * null + UNRESOLVED — never negative, never 0.
 *
 * Assumptions
 * -----------
 * Assumptions are log entries with a decision (`pending`/`approved`/
 * `rejected`) plus an optional note. Rejecting an assumption flags its
 * item NEEDS_REVIEW — the item is never silently dropped. (A rejected
 * NOT_DETECTED item keeps its status; there is nothing left to flag.)
 *
 * Coordinate model (shared with the viewer)
 * -----------------------------------------
 * `bbox` is in PAGE IMAGE PIXEL space: x/y/width/height in pixels
 * relative to the rendered page image's natural size (the same space
 * `pdfPageService` / the live parser's `previewDataUrl` renders in).
 * `bboxToPercent` converts a pixel bbox to CSS percentages of the image
 * so overlays scale with zoom for free. Bboxes are clamped to the image
 * bounds; a degenerate bbox (zero area after clamping) yields `null`
 * and the viewer renders no marker for it.
 */

import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import {
  qtoArea,
  qtoCount,
  qtoLength,
  qtoPerimeter,
  qtoSurfaceArea,
  qtoVolume,
  qtoWallNetArea,
} from './geometryQto';
import type {
  BoundingBox,
  DimensionRecord,
  EvidenceRecord,
  GeometryQuantity,
  OpeningKind,
  OpeningRecord,
  VisionReviewStatus,
} from './types';
import type { DedAiItem } from '../ded-ai-estimate/types';

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/** What kind of thing is under review. `structure` is reserved for the
 *  structural-schedule adapters (K1/B1/S1/F1, spec §6) in a later
 *  increment; live result items map to `quantity` (see
 *  `reviewItemFromDedAiItem`). */
export type ReviewItemKind = 'dimension' | 'opening' | 'quantity' | 'structure' | 'other';

/** The three confidence colours of the owner-approved prototype
 *  (green/amber/red) — used ONLY for confidence semantics, never for
 *  primary actions (those are EZRAB blue). */
export type ConfidenceColor = 'green' | 'yellow' | 'red';

export type AssumptionDecision = 'pending' | 'approved' | 'rejected';

/** One entry in the per-item assumption log. */
export interface AssumptionEntry {
  id: string;
  text: string;
  decision: AssumptionDecision;
  note?: string;
}

/** Deterministic recompute shapes `correctItem` knows how to run through
 *  the I4 geometry/QTO module. Absent = no recompute available for this
 *  item (input corrections are refused; direct value corrections still work). */
export type RecomputeKind =
  | 'wall-net-area'
  | 'area'
  | 'length'
  | 'volume'
  | 'perimeter'
  | 'count'
  | 'surface-area';

export interface ReviewItem {
  id: string;
  kind: ReviewItemKind;
  /** Display label (dimension text, opening mark, work-item name, …). */
  label: string;
  /** Primary source page (1-based). Null when no source page is known —
   *  `jumpTarget` then returns null (no jump is possible, honestly). */
  page: number | null;
  /** All source pages (includes `page` when known). */
  sourcePages: number[];
  /** Position in PAGE IMAGE PIXEL space. Null = unknown position. */
  bbox: BoundingBox | null;
  /** Dimension text exactly as read from the drawing — never rewritten.
   *  Null for non-dimension items. */
  originalText: string | null;
  /** Normalized interpretation: the value that is reviewed. Null value =
   *  no value (never 0 as a stand-in). */
  interpretation: {
    value: number | null;
    unit: string;
    /** What the value means (dimension kind, quantity kind, category, …). */
    detail: string;
  };
  /** Display-only formula string (never parsed to compute). */
  formula: string | null;
  /** Named numeric/string inputs the quantity was computed from. */
  inputs: Record<string, number | string>;
  recomputeKind?: RecomputeKind;
  /** The source record's own kind (DimensionKind / OpeningKind /
   *  GeometryQuantityKind / DedAiQuantitySource) — used for validation
   *  rules that depend on what the item is (e.g. negative elevations). */
  sourceKind?: string;
  /** 0..1. For vision records this is the measured confidence; for live
   *  result items it is a provenance-based display heuristic (see
   *  `reviewItemFromDedAiItem`) — never a claimed model measurement. */
  confidence: number;
  status: VisionReviewStatus;
  assumptions: AssumptionEntry[];
  evidence: EvidenceRecord[];
  /** Free traceability notes (quantity notes, correction audit notes, …). */
  notes: string[];
  /** Audit trail of the last user correction, if any. */
  correctedFrom?: { previousValue: number | null; note: string };
  /** Rejection reason (set when status is NOT_DETECTED). */
  rejectionReason?: string;
}

export interface ReviewState {
  items: ReviewItem[];
}

/** Result of a review action. `ok: false` means the action was refused
 *  and `state` is unchanged (same reference); `error` explains why. */
export interface ReviewActionResult {
  state: ReviewState;
  ok: boolean;
  error?: string;
}

/** Jump target for the viewer: the page to show, and the bbox to center
 *  on (null = page-only jump, no fake position). */
export interface JumpTarget {
  page: number;
  bbox: BoundingBox | null;
}

/** Indonesian labels for the 6-state taxonomy (UI display). */
export const REVIEW_STATUS_LABELS: Record<VisionReviewStatus, string> = {
  VERIFIED: 'Terverifikasi',
  HIGH_CONFIDENCE: 'Keyakinan tinggi',
  NEEDS_REVIEW: 'Perlu ditinjau',
  CONFLICT: 'Konflik',
  UNRESOLVED: 'Belum teresolusi',
  NOT_DETECTED: 'Tidak terdeteksi',
};

/* ------------------------------------------------------------------ */
/* Confidence -> colour                                                */
/* ------------------------------------------------------------------ */

/**
 * Map a 0..1 confidence to the prototype's three colours. Thresholds
 * match `statusFromConfidence` (0.85 / 0.6). Non-finite input is
 * fail-closed red — an unreadable confidence is never shown as green.
 */
export function confidenceToColor(confidence: number): ConfidenceColor {
  if (!Number.isFinite(confidence)) return 'red';
  if (confidence >= 0.85) return 'green';
  if (confidence >= 0.6) return 'yellow';
  return 'red';
}

/** Clamp a confidence to 0..1 for display (non-finite -> 0). */
export function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence));
}

/* ------------------------------------------------------------------ */
/* State helpers                                                       */
/* ------------------------------------------------------------------ */

export function createReviewState(items: ReviewItem[]): ReviewState {
  return { items: [...items] };
}

export function reviewItemById(state: ReviewState, id: string): ReviewItem | undefined {
  return state.items.find((it) => it.id === id);
}

/** Items whose primary page is `page`. */
export function itemsOnPage(state: ReviewState, page: number): ReviewItem[] {
  return state.items.filter((it) => it.page === page);
}

export interface ReviewCounts {
  total: number;
  byStatus: Record<VisionReviewStatus, number>;
  byColor: Record<ConfidenceColor, number>;
}

/** Summary counts for the review panel / summary bar. */
export function reviewCounts(state: ReviewState): ReviewCounts {
  const byStatus: Record<VisionReviewStatus, number> = {
    VERIFIED: 0,
    HIGH_CONFIDENCE: 0,
    NEEDS_REVIEW: 0,
    CONFLICT: 0,
    UNRESOLVED: 0,
    NOT_DETECTED: 0,
  };
  const byColor: Record<ConfidenceColor, number> = { green: 0, yellow: 0, red: 0 };
  for (const it of state.items) {
    byStatus[it.status] += 1;
    byColor[confidenceToColor(it.confidence)] += 1;
  }
  return { total: state.items.length, byStatus, byColor };
}

/* ------------------------------------------------------------------ */
/* Coordinates: pixel bbox -> CSS percentages                          */
/* ------------------------------------------------------------------ */

export interface BboxPercent {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

/**
 * Convert a pixel-space bbox to CSS percentages of the rendered image.
 * Returns null when the image size is invalid or the bbox has no area
 * after clamping to the image bounds (the viewer then renders no marker
 * instead of a zero-size or off-image one).
 */
export function bboxToPercent(
  bbox: BoundingBox,
  imageWidthPx: number,
  imageHeightPx: number,
): BboxPercent | null {
  if (
    !Number.isFinite(imageWidthPx) ||
    !Number.isFinite(imageHeightPx) ||
    imageWidthPx <= 0 ||
    imageHeightPx <= 0
  ) {
    return null;
  }
  if (
    !Number.isFinite(bbox.x) ||
    !Number.isFinite(bbox.y) ||
    !Number.isFinite(bbox.width) ||
    !Number.isFinite(bbox.height)
  ) {
    return null;
  }
  const x = Math.min(Math.max(bbox.x, 0), imageWidthPx);
  const y = Math.min(Math.max(bbox.y, 0), imageHeightPx);
  const width = Math.min(Math.max(bbox.width, 0), imageWidthPx - x);
  const height = Math.min(Math.max(bbox.height, 0), imageHeightPx - y);
  if (width <= 0 || height <= 0) return null;
  return {
    leftPct: (x / imageWidthPx) * 100,
    topPct: (y / imageHeightPx) * 100,
    widthPct: (width / imageWidthPx) * 100,
    heightPct: (height / imageHeightPx) * 100,
  };
}

/* ------------------------------------------------------------------ */
/* Jump target                                                         */
/* ------------------------------------------------------------------ */

/**
 * The target the viewer centers on when a result is clicked. Null only
 * when the item has no known page (nothing to jump to). A null bbox is
 * NOT null here — it is an honest page-only jump.
 */
export function jumpTarget(item: ReviewItem): JumpTarget | null {
  if (item.page === null || !Number.isFinite(item.page) || item.page < 1) return null;
  return { page: item.page, bbox: item.bbox };
}

/* ------------------------------------------------------------------ */
/* Adapters: vision records / live items -> ReviewItem                 */
/* ------------------------------------------------------------------ */

function assumptionEntries(texts: string[], prefix: string): AssumptionEntry[] {
  return texts.map((text, i) => ({
    id: `${prefix}-a${i + 1}`,
    text,
    decision: 'pending' as AssumptionDecision,
  }));
}

function firstBbox(evidence: EvidenceRecord[]): BoundingBox | null {
  for (const ev of evidence) {
    if (ev.boundingBox) return ev.boundingBox;
  }
  return null;
}

function sortedUniquePages(pages: number[]): number[] {
  return [...new Set(pages.filter((p) => Number.isFinite(p) && p >= 1))].sort((a, b) => a - b);
}

export function reviewItemFromDimension(rec: DimensionRecord): ReviewItem {
  return {
    id: `dim-${rec.id}`,
    kind: 'dimension',
    label: rec.originalText.trim() !== '' ? rec.originalText : `Dimensi ${rec.kind}`,
    page: rec.page,
    sourcePages: [rec.page],
    bbox: rec.region ?? null,
    originalText: rec.originalText,
    interpretation: { value: rec.normalizedValue, unit: rec.unit, detail: rec.kind },
    formula: null,
    inputs: {},
    sourceKind: rec.kind,
    confidence: clampConfidence(rec.confidence),
    status: rec.status,
    assumptions: rec.notes ? assumptionEntries([rec.notes], `dim-${rec.id}`) : [],
    evidence: [],
    notes: [],
  };
}

const OPENING_KIND_LABELS: Record<OpeningKind, string> = {
  door: 'Pintu',
  window: 'Jendela',
  ventilation: 'Ventilasi',
  louver: 'Louver',
  'glass-partition': 'Partisi kaca',
  gate: 'Gerbang',
  'other-opening': 'Bukaan',
};

export function reviewItemFromOpening(rec: OpeningRecord): ReviewItem {
  const safeMark = rec.mark.replace(/[^A-Za-z0-9_-]/g, '-');
  const id = `opening-${safeMark}`;
  const sourcePages = sortedUniquePages([
    ...rec.sourcePages,
    ...(rec.schedulePage !== null ? [rec.schedulePage] : []),
  ]);
  // Size text is built ONLY from evidenced dimensions — a missing width
  // or height is omitted, never guessed.
  const sizeParts: string[] = [];
  if (rec.widthMm !== null) sizeParts.push(`${rec.widthMm} mm`);
  if (rec.heightMm !== null) sizeParts.push(`${rec.heightMm} mm`);
  const detail =
    sizeParts.length > 0
      ? `${OPENING_KIND_LABELS[rec.elementType] ?? 'Bukaan'} — ${sizeParts.join(' × ')}`
      : `${OPENING_KIND_LABELS[rec.elementType] ?? 'Bukaan'} — ukuran belum terbaca`;
  const inputs: Record<string, number | string> = { jumlah: rec.quantity };
  if (rec.widthMm !== null) inputs.lebar_mm = rec.widthMm;
  if (rec.heightMm !== null) inputs.tinggi_mm = rec.heightMm;
  const notes: string[] = [];
  if (rec.material) notes.push(`Material: ${rec.material}`);
  if (rec.frame) notes.push(`Kusen: ${rec.frame}`);
  if (rec.glazing) notes.push(`Kaca: ${rec.glazing}`);
  return {
    id,
    kind: 'opening',
    label: `${rec.mark} · ${OPENING_KIND_LABELS[rec.elementType] ?? 'Bukaan'}`,
    page: rec.sourcePages[0] ?? rec.schedulePage ?? null,
    sourcePages,
    bbox: firstBbox(rec.evidence),
    originalText: null,
    interpretation: { value: rec.quantity, unit: 'unit', detail },
    formula: null,
    inputs,
    // Count corrections recompute deterministically (integer >= 0).
    recomputeKind: 'count',
    sourceKind: rec.elementType,
    confidence: clampConfidence(rec.confidence),
    status: rec.status,
    assumptions: [],
    evidence: [...rec.evidence],
    notes,
  };
}

const GEOMETRY_KIND_LABELS: Record<string, string> = {
  LENGTH: 'Panjang',
  AREA: 'Luas',
  PERIMETER: 'Keliling',
  VOLUME: 'Volume',
  COUNT: 'Jumlah',
  SURFACE_AREA: 'Luas permukaan',
};

/**
 * Best-effort inference of a recompute shape from a quantity's input
 * keys (I4 naming convention: `*_mm` inputs). Returns undefined when
 * the inputs do not match any known shape — callers then get honest
 * "no recompute" refusals instead of a wrong recompute. An explicit
 * `recomputeKind` passed to `reviewItemFromGeometry` always wins.
 */
export function inferRecomputeKind(
  inputs: Record<string, number | string>,
  kind?: string,
): RecomputeKind | undefined {
  const has = (key: string): boolean => key in inputs;
  if (has('panjang_dinding_mm')) return 'wall-net-area';
  if (kind === 'COUNT' && has('jumlah')) return 'count';
  if (has('panjang_mm') && has('lebar_mm') && has('tinggi_mm')) {
    if (kind === 'SURFACE_AREA') return 'surface-area';
    if (kind === 'VOLUME') return 'volume';
    return undefined;
  }
  if (has('panjang_mm') && has('lebar_mm')) {
    if (kind === 'PERIMETER') return 'perimeter';
    if (kind === 'AREA') return 'area';
    return undefined;
  }
  if (has('panjang_mm') && kind === 'LENGTH') return 'length';
  return undefined;
}

export interface GeometryAdapterOptions {
  label?: string;
  recomputeKind?: RecomputeKind;
}

export function reviewItemFromGeometry(
  q: GeometryQuantity,
  opts?: GeometryAdapterOptions,
): ReviewItem {
  const sourcePages = sortedUniquePages(q.sourcePages);
  return {
    id: q.id,
    kind: 'quantity',
    label: opts?.label ?? GEOMETRY_KIND_LABELS[q.kind] ?? q.kind,
    page: sourcePages[0] ?? null,
    sourcePages,
    bbox: firstBbox(q.evidence),
    originalText: null,
    interpretation: { value: q.quantity, unit: q.unit, detail: q.kind },
    formula: q.formula,
    inputs: { ...q.inputs },
    recomputeKind: opts?.recomputeKind ?? inferRecomputeKind(q.inputs, q.kind),
    sourceKind: q.kind,
    confidence: clampConfidence(q.confidence),
    status: q.status,
    assumptions: assumptionEntries(q.assumptions, q.id),
    evidence: [...q.evidence],
    notes: [],
  };
}

/**
 * Provenance-based display confidence/status for a live result item.
 * This is a HEURISTIC for the review UI (the live pipeline records no
 * measured confidence) — it is never presented as a model measurement,
 * and it never yields VERIFIED (only an explicit user confirm does).
 */
function liveItemConfidenceAndStatus(item: DedAiItem): {
  confidence: number;
  status: VisionReviewStatus;
} {
  if (item.quantity === null) return { confidence: 0, status: 'UNRESOLVED' };
  switch (item.quantitySource) {
    case 'DERIVED':
    case 'DED_GEOMETRIC':
    case 'DED_EXPLICIT':
      return { confidence: 0.9, status: 'HIGH_CONFIDENCE' };
    case 'USER_INPUT':
      return { confidence: 0.95, status: 'HIGH_CONFIDENCE' };
    case 'AI_INFERENCE':
      return { confidence: 0.55, status: 'NEEDS_REVIEW' };
    case 'ASSUMPTION':
      return { confidence: 0.5, status: 'NEEDS_REVIEW' };
    case 'UNRESOLVED':
    default:
      return { confidence: 0, status: 'UNRESOLVED' };
  }
}

export function reviewItemFromDedAiItem(item: DedAiItem): ReviewItem {
  const { confidence, status } = liveItemConfidenceAndStatus(item);
  const sourcePages = sortedUniquePages(item.sourcePages);
  const inputs: Record<string, number | string> = {};
  if (item.derivation) {
    for (const input of item.derivation.inputs) {
      if (typeof input.value === 'number' && Number.isFinite(input.value)) {
        inputs[input.name] = input.value;
      }
    }
  }
  const assumptions: AssumptionEntry[] = [];
  const notes: string[] = [];
  if (item.quantityNote?.trim()) {
    if (item.quantitySource === 'ASSUMPTION') {
      assumptions.push({ id: `live-${item.id}-a1`, text: item.quantityNote.trim(), decision: 'pending' });
    } else {
      notes.push(item.quantityNote.trim());
    }
  }
  if (item.sourceEvidence?.trim()) notes.push(`Bukti: ${item.sourceEvidence.trim()}`);
  return {
    id: `live-${item.id}`,
    // Live items are QTO results; `structure` stays reserved for the
    // structural-schedule adapters (spec §6) — category strings are not
    // reliable structural marks, so they are not mapped here.
    kind: 'quantity',
    label: item.name,
    page: sourcePages[0] ?? null,
    sourcePages,
    // Live items carry no bbox (source pages are text numbers today).
    // Null = page-only jump; I8 may populate this from vision evidence.
    bbox: null,
    originalText: item.rawDimensions ?? null,
    interpretation: { value: item.quantity, unit: item.units, detail: item.category },
    formula: item.quantityFormula ?? null,
    inputs,
    // Deliberately NO recomputeKind: derivation inputs use original units
    // and names (e.g. `panjang` in metres), while the I4 QTO functions
    // require millimetre `*_mm` keys. Inferring a recompute here would
    // misread units. Value corrections still work.
    sourceKind: item.quantitySource,
    confidence,
    status,
    assumptions,
    evidence: [],
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Review actions (pure, immutable)                                    */
/* ------------------------------------------------------------------ */

function refused(state: ReviewState, error: string): ReviewActionResult {
  return { state, ok: false, error };
}

function replaceItem(state: ReviewState, next: ReviewItem): ReviewState {
  return { items: state.items.map((it) => (it.id === next.id ? next : it)) };
}

/**
 * Explicit user confirmation. Sets VERIFIED — the ONLY function besides
 * `correctItem({ confirm: true })` that may do so. Requires a non-null
 * value (see the confirm rule in the header). Idempotent on an already
 * VERIFIED item.
 */
export function confirmItem(state: ReviewState, itemId: string): ReviewActionResult {
  const item = reviewItemById(state, itemId);
  if (!item) return refused(state, `Item ${itemId} tidak ditemukan.`);
  if (item.status === 'NOT_DETECTED') {
    return refused(state, 'Item yang ditolak tidak bisa dikonfirmasi.');
  }
  if (item.interpretation.value === null) {
    return refused(
      state,
      'Item tanpa nilai tidak bisa dikonfirmasi — koreksi dulu (beri nilai) atau tolak item ini.',
    );
  }
  if (item.status === 'VERIFIED') return { state, ok: true };
  return {
    state: replaceItem(state, { ...item, status: 'VERIFIED', confidence: 1 }),
    ok: true,
  };
}

/**
 * Mark a detection as wrong. Status -> NOT_DETECTED, value -> null
 * (a rejected value must not stand, and never becomes 0), reason
 * recorded. `originalText`, `bbox`, and evidence are kept for audit.
 * A reason is required — silent rejection hides why a detection died.
 */
export function rejectItem(state: ReviewState, itemId: string, reason: string): ReviewActionResult {
  const item = reviewItemById(state, itemId);
  if (!item) return refused(state, `Item ${itemId} tidak ditemukan.`);
  if (!reason || reason.trim() === '') {
    return refused(state, 'Alasan penolakan wajib diisi.');
  }
  if (item.status === 'NOT_DETECTED') return { state, ok: true };
  return {
    state: replaceItem(state, {
      ...item,
      status: 'NOT_DETECTED',
      interpretation: { ...item.interpretation, value: null },
      rejectionReason: reason.trim(),
    }),
    ok: true,
  };
}

export type ItemCorrection =
  | { type: 'input'; inputName: string; value: number }
  | { type: 'value'; value: number; unit?: string };

export interface CorrectOptions {
  /** When true, the correction itself is confirmed and the item becomes
   *  VERIFIED. Otherwise the corrected item is NEEDS_REVIEW. */
  confirm?: boolean;
  /** Optional note recorded with the correction. */
  note?: string;
}

function numericInput(inputs: Record<string, number | string>, key: string): number | undefined {
  const v = inputs[key];
  return typeof v === 'number' ? v : undefined;
}

/**
 * Deterministic recompute through the I4 geometry/QTO functions. The
 * formula string is never parsed — only the named numeric inputs feed
 * the computation. Returns the recomputed GeometryQuantity (which may
 * itself be null-quantity + UNRESOLVED when the inputs are inconsistent).
 */
function recomputeFromInputs(
  kind: RecomputeKind,
  inputs: Record<string, number | string>,
): GeometryQuantity {
  switch (kind) {
    case 'wall-net-area': {
      const openings: { widthMm: number | null | undefined; heightMm: number | null | undefined }[] = [];
      const indices = Object.keys(inputs)
        .map((k) => /^bukaan_(\d+)_lebar_mm$/.exec(k))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => Number(m[1]))
        .sort((a, b) => a - b);
      for (const i of indices) {
        openings.push({
          widthMm: numericInput(inputs, `bukaan_${i}_lebar_mm`),
          heightMm: numericInput(inputs, `bukaan_${i}_tinggi_mm`),
        });
      }
      return qtoWallNetArea(
        numericInput(inputs, 'panjang_dinding_mm'),
        numericInput(inputs, 'tinggi_dinding_mm'),
        openings,
      );
    }
    case 'area':
      return qtoArea(numericInput(inputs, 'panjang_mm'), numericInput(inputs, 'lebar_mm'));
    case 'length':
      return qtoLength(numericInput(inputs, 'panjang_mm'));
    case 'volume':
      return qtoVolume(
        numericInput(inputs, 'panjang_mm'),
        numericInput(inputs, 'lebar_mm'),
        numericInput(inputs, 'tinggi_mm'),
      );
    case 'perimeter':
      return qtoPerimeter(numericInput(inputs, 'panjang_mm'), numericInput(inputs, 'lebar_mm'));
    case 'count':
      return qtoCount(numericInput(inputs, 'jumlah'));
    case 'surface-area':
      return qtoSurfaceArea(
        numericInput(inputs, 'panjang_mm'),
        numericInput(inputs, 'lebar_mm'),
        numericInput(inputs, 'tinggi_mm'),
      );
  }
}

function correctionNote(
  item: ReviewItem,
  correction: ItemCorrection,
  opts?: CorrectOptions,
): string {
  const base =
    correction.type === 'input'
      ? `Koreksi input ${correction.inputName} → ${correction.value}`
      : `Koreksi nilai → ${correction.value}${correction.unit ? ` ${correction.unit}` : ''}`;
  const prev =
    item.interpretation.value === null
      ? 'nilai sebelumnya: (tidak ada)'
      : `nilai sebelumnya: ${item.interpretation.value} ${item.interpretation.unit}`;
  return opts?.note ? `${base} (${prev}; ${opts.note})` : `${base} (${prev})`;
}

/**
 * User correction. Two shapes (see `ItemCorrection`):
 *  - `input`: correct one named input, recompute deterministically.
 *  - `value`: correct the value directly (user-supplied).
 *
 * Refusals (state unchanged, `ok: false`): unknown item; rejected
 * (NOT_DETECTED) item; non-finite value; negative value where invalid
 * (dimensions/counts; ELEVATION/LEVEL dimensions may be negative);
 * fractional value for a count (`unit: 'unit'`); input correction on
 * an item without a `recomputeKind`.
 *
 * On success the item becomes VERIFIED only when `opts.confirm` is
 * true; otherwise NEEDS_REVIEW. If a recompute runs on valid inputs
 * but the geometry is inconsistent, the quantity becomes null +
 * UNRESOLVED (never negative, never 0) and the correction is still
 * recorded — the caller must read the item's status afterwards.
 */
export function correctItem(
  state: ReviewState,
  itemId: string,
  correction: ItemCorrection,
  opts?: CorrectOptions,
): ReviewActionResult {
  const item = reviewItemById(state, itemId);
  if (!item) return refused(state, `Item ${itemId} tidak ditemukan.`);
  if (item.status === 'NOT_DETECTED') {
    return refused(state, 'Item yang ditolak tidak bisa dikoreksi.');
  }
  if (!Number.isFinite(correction.value)) {
    return refused(state, 'Nilai koreksi tidak valid (bukan angka).');
  }
  const isCount = item.interpretation.unit === 'unit';
  if (isCount && !Number.isInteger(correction.value)) {
    return refused(state, 'Jumlah harus bilangan bulat.');
  }
  // Elevations/levels may legitimately be negative (+3.500 / -0.500);
  // every other corrected value must be >= 0.
  const mayBeNegative =
    item.kind === 'dimension' && (item.sourceKind === 'ELEVATION' || item.sourceKind === 'LEVEL');
  if (correction.value < 0 && !mayBeNegative) {
    return refused(state, 'Nilai koreksi tidak boleh negatif.');
  }

  const note = correctionNote(item, correction, opts);
  const correctedFrom = { previousValue: item.interpretation.value, note };
  const nextStatus: VisionReviewStatus = opts?.confirm ? 'VERIFIED' : 'NEEDS_REVIEW';
  const nextConfidence = opts?.confirm ? 1 : item.confidence;

  if (correction.type === 'value') {
    const rounded = SafeDecimalEngine.safeRound(correction.value, 4);
    const notes = [...item.notes, note];
    if (item.formula) {
      notes.push('Nilai dikoreksi manual — rumus di atas adalah rumus asal, bukan rumus nilai baru.');
    }
    return {
      state: replaceItem(state, {
        ...item,
        interpretation: {
          ...item.interpretation,
          value: rounded,
          unit: correction.unit ?? item.interpretation.unit,
        },
        status: nextStatus,
        confidence: nextConfidence,
        correctedFrom,
        notes,
      }),
      ok: true,
    };
  }

  // Input correction: deterministic recompute.
  if (!item.recomputeKind) {
    return refused(
      state,
      'Item ini tidak punya rumus recompute — koreksi nilai langsung (bukan input).',
    );
  }
  const nextInputs = { ...item.inputs, [correction.inputName]: correction.value };
  const recomputed = recomputeFromInputs(item.recomputeKind, nextInputs);
  if (recomputed.quantity === null) {
    // Valid inputs, inconsistent geometry (or an input the recompute
    // itself rejects): honest null + UNRESOLVED, never a wrong number.
    const reason =
      recomputed.assumptions.length > 0
        ? recomputed.assumptions[recomputed.assumptions.length - 1]
        : 'Hitung ulang gagal — kuantitas tidak dihitung.';
    return {
      state: replaceItem(state, {
        ...item,
        interpretation: { ...item.interpretation, value: null },
        formula: recomputed.formula,
        inputs: { ...recomputed.inputs },
        status: 'UNRESOLVED',
        correctedFrom,
        notes: [...item.notes, note, reason],
      }),
      ok: true,
    };
  }
  return {
    state: replaceItem(state, {
      ...item,
      interpretation: {
        ...item.interpretation,
        value: recomputed.quantity,
        unit: recomputed.unit,
      },
      formula: recomputed.formula,
      inputs: { ...recomputed.inputs },
      status: nextStatus,
      confidence: nextConfidence,
      correctedFrom,
      notes: [...item.notes, note],
    }),
    ok: true,
  };
}

/**
 * Approve one assumption-log entry. The item's status is unchanged —
 * approving an assumption is not a confirmation of the item itself.
 */
export function approveAssumption(
  state: ReviewState,
  itemId: string,
  assumptionId: string,
  note?: string,
): ReviewActionResult {
  const item = reviewItemById(state, itemId);
  if (!item) return refused(state, `Item ${itemId} tidak ditemukan.`);
  const entry = item.assumptions.find((a) => a.id === assumptionId);
  if (!entry) return refused(state, `Asumsi ${assumptionId} tidak ditemukan.`);
  const next: ReviewItem = {
    ...item,
    assumptions: item.assumptions.map((a) =>
      a.id === assumptionId
        ? { ...a, decision: 'approved' as AssumptionDecision, ...(note ? { note } : {}) }
        : a,
    ),
  };
  return { state: replaceItem(state, next), ok: true };
}

/**
 * Reject one assumption-log entry. The item is flagged NEEDS_REVIEW —
 * a rejected assumption never silently drops the item. A rejected
 * (NOT_DETECTED) item keeps its status; the decision is still recorded.
 */
export function rejectAssumption(
  state: ReviewState,
  itemId: string,
  assumptionId: string,
  note?: string,
): ReviewActionResult {
  const item = reviewItemById(state, itemId);
  if (!item) return refused(state, `Item ${itemId} tidak ditemukan.`);
  const entry = item.assumptions.find((a) => a.id === assumptionId);
  if (!entry) return refused(state, `Asumsi ${assumptionId} tidak ditemukan.`);
  const next: ReviewItem = {
    ...item,
    status: item.status === 'NOT_DETECTED' ? 'NOT_DETECTED' : 'NEEDS_REVIEW',
    assumptions: item.assumptions.map((a) =>
      a.id === assumptionId
        ? { ...a, decision: 'rejected' as AssumptionDecision, ...(note ? { note } : {}) }
        : a,
    ),
  };
  return { state: replaceItem(state, next), ok: true };
}

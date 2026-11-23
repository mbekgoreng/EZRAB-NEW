/**
 * DED drawing-vision shared contracts (owner order 2026-11-22, spec §2–§10).
 *
 * Pure types + tiny pure helpers. No runtime dependencies except type-only
 * imports from the existing v2 canonical types (zero-cost at runtime).
 *
 * Rules these contracts enforce:
 * - Every quantity carries formula + inputs + source pages + evidence +
 *   assumptions + confidence + review status. Missing/unreliable input means
 *   `quantity: null` and UNRESOLVED/NEEDS_REVIEW — never 0, never invented.
 * - `VERIFIED` is set only by explicit verification (cross-check, user
 *   confirmation, calibrated measurement). Confidence alone caps at
 *   HIGH_CONFIDENCE — see `statusFromConfidence`.
 * - Marks (D1/P1/W1/J1/K1/…) are project-defined identifiers. No code in
 *   this module assumes a universal meaning for any mark.
 */

import type { BoundingBox, EvidenceRecord } from '../../ded-rab-v2/types';

export type { BoundingBox, EvidenceRecord };

/** Spec §10 — the single review-status taxonomy for the vision layer. */
export type VisionReviewStatus =
  | 'VERIFIED'
  | 'HIGH_CONFIDENCE'
  | 'NEEDS_REVIEW'
  | 'CONFLICT'
  | 'UNRESOLVED'
  | 'NOT_DETECTED';

/**
 * Map a 0..1 confidence to a review status. VERIFIED is deliberately
 * unreachable here: only explicit verification (cross-check, calibration,
 * user confirmation) may set VERIFIED.
 */
export function statusFromConfidence(confidence: number): VisionReviewStatus {
  if (!Number.isFinite(confidence)) return 'UNRESOLVED';
  if (confidence >= 0.85) return 'HIGH_CONFIDENCE';
  if (confidence >= 0.6) return 'NEEDS_REVIEW';
  return 'UNRESOLVED';
}

/**
 * Spec §2 — drawing page classes. UNKNOWN means "cannot classify", never a guess.
 * `CIVIL` (I10b E12) covers road / bridge / dam / water-works sheets
 * (alinemen jalan, jembatan, bendungan, saluran, irigasi) — the 13 spec
 * classes had no home for them, so civil sheets were misclassified as
 * FLOOR_PLAN (via the generic `denah` anchor) or forced to UNKNOWN.
 */
export type DrawingPageClass =
  | 'COVER'
  | 'SITE_PLAN'
  | 'FLOOR_PLAN'
  | 'ELEVATION'
  | 'SECTION'
  | 'STRUCTURAL'
  | 'FOUNDATION'
  | 'ROOF_PLAN'
  | 'DOOR_WINDOW_SCHEDULE'
  | 'STRUCTURAL_SCHEDULE'
  | 'MEP'
  | 'DETAIL'
  | 'LEGEND_SPEC'
  | 'CIVIL'
  | 'UNKNOWN';

export interface PageClassification {
  page: number;
  drawingClass: DrawingPageClass;
  /** 0..1. Pages with no usable signal score 0 and classify UNKNOWN. */
  confidence: number;
  /** Human-readable signals that drove the classification (keywords, title, …). */
  signals: string[];
  status: VisionReviewStatus;
}

/** Page metadata kept for vision processing (render + text layer facts). */
export interface VisionPageMeta {
  page: number;
  widthPx?: number;
  heightPx?: number;
  renderScale?: number;
  /** False for scanned/image-only pages (no native text layer). */
  hasTextLayer: boolean;
  classification?: PageClassification;
}

/** Spec §3 — dimension kinds. Identifiers (grid labels, detail refs, drawing numbers) are NOT lengths. */
export type DimensionKind =
  | 'LINEAR'
  | 'OVERALL'
  | 'CHAINED'
  | 'GRID'
  | 'ELEVATION'
  | 'LEVEL'
  | 'DIAMETER'
  | 'RADIUS'
  | 'ANGLE'
  | 'SLOPE'
  | 'THICKNESS'
  | 'SECTION_MARKER'
  | 'DETAIL_REF'
  | 'SCALE'
  | 'UNKNOWN';

export type DimensionUnit = 'mm' | 'm' | 'cm' | 'deg' | 'percent' | 'ratio' | 'unknown';

export interface DimensionRecord {
  id: string;
  /** The exact text as read from the drawing — never rewritten. */
  originalText: string;
  /** Numeric value in `unit`. */
  normalizedValue: number;
  unit: DimensionUnit;
  kind: DimensionKind;
  page: number;
  /** Drawing region the dimension was read from (when known). */
  region?: BoundingBox;
  /** Drawing element this dimension belongs to, when associated (e.g. mark "D1"). */
  associatedElement?: string;
  confidence: number;
  status: VisionReviewStatus;
  notes?: string;
}

/** Spec §4 — opening kinds. */
export type OpeningKind =
  | 'door'
  | 'window'
  | 'ventilation'
  | 'louver'
  | 'glass-partition'
  | 'gate'
  | 'other-opening';

export interface OpeningRecord {
  elementType: OpeningKind;
  /** Project-defined mark, e.g. "D1", "P1", "W1", "J1". */
  mark: string;
  /** Null unless evidenced by a schedule row or an explicit dimension. Never guessed. */
  widthMm: number | null;
  heightMm: number | null;
  /** Occurrences counted across applicable floor plans. */
  quantity: number;
  material: string | null;
  frame: string | null;
  glazing: string | null;
  schedulePage: number | null;
  sourcePages: number[];
  evidence: EvidenceRecord[];
  confidence: number;
  status: VisionReviewStatus;
}

/** One row of a door/window (or structural) schedule, as read from the drawing. */
export interface ScheduleEntry {
  mark: string;
  kind?: OpeningKind | string;
  widthMm?: number | null;
  heightMm?: number | null;
  /**
   * I11 Stage 4 (E15) — third dimension of a 3-value row ("F1 100×100×40"
   * → thickness 400 mm), normalized to mm like width/height. Null when
   * the row carries no third value. A single-value row ("S1 | Pelat |
   * 12 cm") does NOT populate this field — without a keyword its role
   * (thickness vs width vs depth) is unknowable, so it stays null rather
   * than guessed. The raw row text in `rowText` is the evidence.
   */
  thicknessMm?: number | null;
  material?: string | null;
  frame?: string | null;
  glazing?: string | null;
  sourcePage: number;
  /** The exact row text, for traceability. */
  rowText: string;
}

/**
 * I11 Stage 4 (E16) — element categories for non-opening records.
 * `CIVIL` covers road/bridge elements (same class precedent as the E12
 * CIVIL page class). The category is the closed part of an element's
 * identity; `elementType` (below) is the open vocabulary.
 */
export type ElementCategory = 'STRUCTURAL' | 'WALL' | 'ROOF' | 'SDA' | 'CIVIL';

/**
 * I11 Stage 4 (E16) — one non-opening element: a structural member, a
 * wall, a roof element, an SDA (water-resources) element, or a civil
 * element. Reuses the I0 contracts (`EvidenceRecord`,
 * `VisionReviewStatus`) and the I4 geometry types — no parallel type
 * system. Dimensions are null unless evidenced by a schedule row, a
 * same-page dimension record, or the element's own label text (see
 * `elements.ts`); never guessed. `quantity` is the occurrence count of
 * the element's symbol/object on its source pages — the same mark seen
 * on two different views (e.g. a column on a floor plan AND on the
 * structural plan) is the same physical element shown twice, so
 * cross-page quantities for one mark must NOT be summed blindly (E19).
 *
 * `elementType` vocabulary (project-defined strings, see
 * `elements.ts`): column, beam, slab, foundation, tie-beam, stair,
 * rebar, wall, partition-wall, roof-plane, roof-frame, roof-covering,
 * ridge, dam-body, channel, weir, sluice-gate, road, bridge.
 */
export interface ElementRecord {
  /** Deterministic id: `el-<category>-p<page>-<mark|elementType>` (+ suffix when needed). */
  id: string;
  category: ElementCategory;
  elementType: string;
  /** Project-defined mark (e.g. "K1", "B1", "F1") or null when unmarked. */
  mark: string | null;
  /** Occurrences counted on the source pages. */
  quantity: number;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  thicknessMm: number | null;
  /** Rebar diameter from the mark ("D12" → 12); null for non-rebar elements. */
  diameterMm: number | null;
  schedulePage: number | null;
  sourcePages: number[];
  evidence: EvidenceRecord[];
  confidence: number;
  status: VisionReviewStatus;
  /** Human-readable notes (e.g. a dimension source or a skipped deduction). */
  notes?: string;
}

/** Spec §8 — deterministic geometry quantity. Quantity is null when inputs are missing. */
export type GeometryQuantityKind =
  | 'LENGTH'
  | 'AREA'
  | 'PERIMETER'
  | 'VOLUME'
  | 'COUNT'
  | 'SURFACE_AREA';

export interface GeometryQuantity {
  id: string;
  kind: GeometryQuantityKind;
  /** Null when the quantity cannot be computed from evidenced inputs. */
  quantity: number | null;
  unit: string;
  /** Human-readable formula, e.g. "3.50 × 3.00 − 0.90 × 2.10". Display only — the value is computed deterministically, never by parsing this string. */
  formula: string;
  /** Named numeric/string inputs the formula used. */
  inputs: Record<string, number | string>;
  sourcePages: number[];
  evidence: EvidenceRecord[];
  /** Declared assumptions, if any (empty when fully evidenced). */
  assumptions: string[];
  confidence: number;
  status: VisionReviewStatus;
}

/** Spec §7 — cross-sheet reference states. */
export type ReferenceStatus = 'CONFIRMED' | 'PROBABLE' | 'UNRESOLVED' | 'CONTRADICTORY';

export interface ReferenceEndpoint {
  /** Page number, when known. Null for dangling/unresolved targets. */
  page: number | null;
  /** The reference as written (mark, detail id, section tag, …). */
  ref: string;
}

export interface CrossSheetReference {
  from: ReferenceEndpoint;
  to: ReferenceEndpoint;
  kind: 'DETAIL' | 'SECTION' | 'ELEVATION' | 'SCHEDULE' | 'SPEC' | 'GRID' | 'OTHER';
  status: ReferenceStatus;
  evidence: EvidenceRecord[];
  /** For CONTRADICTORY refs: what the two sides claim. */
  conflictDetail?: string;
}

/** Spec §9 — scale calibration. Explicit dimensions always outrank pixel measurement. */
export type ScaleMethod =
  | 'EXPLICIT_DIMENSION'
  | 'PIXEL_CALIBRATED'
  | 'STATED_ONLY'
  | 'UNVERIFIED';

export interface ScaleCalibration {
  page: number;
  /** Stated scale as printed, e.g. "1:100". Null when the drawing states none. */
  statedScale: string | null;
  method: ScaleMethod;
  /** Calibration evidence: a known dimension and its pixel length. */
  calibratedFrom: { dimensionMm: number; pixels: number } | null;
  /** True only when calibration was verified against additional known dimensions. */
  verified: boolean;
  /** Relative uncertainty in percent, when measured. */
  uncertaintyPct: number | null;
  status: VisionReviewStatus;
  evidence: EvidenceRecord[];
}

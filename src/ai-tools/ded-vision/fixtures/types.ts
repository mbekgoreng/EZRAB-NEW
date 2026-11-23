/**
 * DED drawing-vision benchmark — fixture contracts (increment I10a).
 *
 * STUB-FIRST, HONEST TIERS: the benchmark measures the deterministic
 * layers (I1–I9) + pipeline wiring with fixture-defined stub vision
 * responses. It does NOT measure live-model quality — no provider call
 * is ever made, and every stub response is a fixture artifact, not a
 * model read. Internet fixtures use a PERFECT-MODEL SIMULATION: the stub
 * returns exactly the dimension/schedule strings hand-verified in the
 * real PDF's text layer, so the pipeline measurement tests deterministic
 * fidelity on real-world strings, never model accuracy.
 *
 * Tiers:
 * - 'synthetic': hand-built fixtures with full hand-verified ground truth.
 * - 'internet': public sample drawings; ground truth ONLY where the
 *   worker verified it against the extracted text layer. Anything
 *   unverifiable is listed in `notMeasured` and reported as "not
 *   measured", never guessed.
 * - 'owner': the owner's own drawings — EMPTY until the owner sends
 *   them. The harness handles the empty tier gracefully (reported, never
 *   failed).
 *
 * Ground-truth rule: every expected value in a fixture is computed or
 * verified BY HAND by the fixture author — never copied from a module
 * under test. A fixture that cannot be hand-verified does not exist.
 */

import type { DedRabAiMode } from '../../ded-ai-estimate/dedMode';
import type {
  BoundingBox,
  DimensionKind,
  DimensionUnit,
  DrawingPageClass,
  ReferenceStatus,
} from '../types';

export type FixtureTier = 'synthetic' | 'internet' | 'owner';

export type FixtureType =
  | 'house'
  | 'building'
  | 'structural-rebar'
  | 'roof-detail'
  | 'road-bridge'
  | 'dam-sda'
  | 'scanned'
  | 'autocad'
  | 'schedule'
  | 'negative';

/** OCR span text classes, for per-class recall/precision. */
export type OcrTextClass =
  | 'dimension'
  | 'mark'
  | 'room-label'
  | 'table-row'
  | 'reference'
  | 'title-block'
  | 'other';

/**
 * Stub vision responses for one page. JSON bodies the stub responder
 * returns verbatim for each prompt kind:
 * - survey: `{ detections: [...] }` for the PAGE SURVEY first pass.
 * - detail: `{ detections: [...] }` for the DETAIL escalation re-pass.
 * - ocr: `{ spans: [...] }` for the OCR first pass (scanned pages).
 * Absent = the responder returns an empty body for that kind.
 */
export interface FixturePageStub {
  survey?: unknown;
  detail?: unknown;
  ocr?: unknown;
}

/** One page of a benchmark document fixture. */
export interface FixturePage {
  page: number;
  title?: string;
  /** Native text-layer content ('' / undefined when scanned). */
  text?: string;
  hasTextLayer: boolean;
  widthPx: number;
  heightPx: number;
  base64Length: number;
  /** Hand-verified expected page class. */
  expectedClass: DrawingPageClass;
  stub: FixturePageStub;
  /**
   * Expected bboxes for the I7 viewer-marker IoU metric: the bbox the
   * pipeline SHOULD attach to the proposal with this label+kind, in
   * full-page pixels. The stub's bbox may differ deliberately (a
   * slightly-off model read) — IoU measures pipeline bbox fidelity.
   */
  expectedBboxes?: Array<{
    label: string;
    kind: string;
    bbox: BoundingBox;
  }>;
  /**
   * Expected DETAIL escalation for this page, hand-derived from the
   * documented policy (I8: 'full' pages with UNRESOLVED/CONFLICT records
   * or nothing validated from visible proposals). Null = not asserted.
   */
  expectDetailPass?: boolean | null;
}

/** One expected dimension record (hand-verified value + unit + kind). */
export interface ExpectedDimension {
  page: number;
  originalText: string;
  value: number;
  unit: DimensionUnit;
  kind: DimensionKind;
}

/** One expected opening, doc-level (quantities summed over pages). */
export interface ExpectedOpening {
  mark: string;
  widthMm: number | null;
  heightMm: number | null;
  /** Total quantity across the document. */
  quantity: number;
  schedulePage: number | null;
}

/**
 * I11 Stage 4 (E16) — one expected element record, PER PAGE (unlike
 * openings, elements are NOT aggregated across pages: the same mark on
 * a floor plan and on the structural plan is the same physical element
 * shown twice, so cross-page quantities must not be summed — E19).
 * `quantity` is the occurrence count on that page. All dimension
 * fields are asserted (null = no dimension evidenced).
 */
export interface ExpectedElement {
  page: number;
  category: 'STRUCTURAL' | 'WALL' | 'ROOF' | 'SDA' | 'CIVIL';
  elementType: string;
  mark: string | null;
  quantity: number;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  thicknessMm: number | null;
  diameterMm: number | null;
  schedulePage: number | null;
}

/**
 * I11 Stage 4 (E17) — one expected ELEMENT-derived quantity (ids
 * `qto-el-*`; opening COUNT quantities are covered by the opening
 * metrics + the qto-exact guard, not here). `ref` is the element's
 * mark, or its elementType when unmarked. `quantity` is the exact
 * expected value (SafeDecimalEngine arithmetic — compared within
 * 1e-9); null = the quantity must be UNRESOLVED (never asserted for
 * a resolvable quantity).
 */
export interface ExpectedQuantity {
  page: number;
  kind: 'LENGTH' | 'AREA' | 'PERIMETER' | 'VOLUME' | 'COUNT' | 'SURFACE_AREA';
  unit: string;
  quantity: number | null;
  ref: string;
}

/** One expected cross-sheet reference (to.ref matched exactly). */
export interface ExpectedReference {
  fromPage: number;
  toRef: string;
  status: ReferenceStatus;
}

/** One expected OCR span, for per-class recall/precision. */
export interface ExpectedOcrSpan {
  page: number;
  text: string;
  textClass: OcrTextClass;
  truncated?: boolean;
}

/** Provenance for an internet-tier fixture file. */
export interface FixtureSource {
  name: string;
  url: string;
  license?: string;
  downloadedAt?: string;
  fileName?: string;
  pages?: number;
  sizeBytes?: number;
}

/** One benchmark document fixture (a whole drawing set). */
export interface BenchmarkFixture {
  id: string;
  tier: FixtureTier;
  type: FixtureType;
  title: string;
  notes?: string;
  source?: FixtureSource;
  /** What is NOT measured for this fixture, and why. */
  notMeasured?: string[];
  /** DED mode for the run. Default 'EZRAB_AI'. */
  mode?: DedRabAiMode;
  /** Call cap override (default: the pipeline default, 40). */
  maxCallsPerDocument?: number;
  /**
   * AHSP matcher seam: true (default) injects the NULL-MATCHER test
   * double (every mark unmatched → ahspCode must be null — the
   * no-invention guard). False passes no matcher (the shipped I8 state:
   * skippedReason 'no-matcher-provided').
   */
  useAhspMatcher?: boolean;
  pages: FixturePage[];
  expected: {
    dimensions?: ExpectedDimension[];
    openings?: ExpectedOpening[];
    /** I11 Stage 4 (E16) — per-page element records. */
    elements?: ExpectedElement[];
    /** I11 Stage 4 (E17) — element-derived quantities (`qto-el-*` ids). */
    quantities?: ExpectedQuantity[];
    references?: ExpectedReference[];
    scales?: Array<{ page: number; statedScale: string | null }>;
    ocrSpans?: ExpectedOcrSpan[];
    /**
     * Expected total vision calls for the FIRST run, hand-derived from
     * the documented policy (1 survey/OCR call per non-'none' page +
     * 1 DETAIL call per escalated 'full' page). A mismatch is a
     * finding to investigate, not a guard failure.
     */
    calls?: number;
    budgetHit?: boolean;
  };
}

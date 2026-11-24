/**
 * I8b — Vision orchestration: wires the I8a vision layer into the LIVE DED path.
 *
 * This module is the ONLY place that decides WHEN a vision call happens, WHAT
 * it reads, and WHAT a vision proposal is allowed to become. It is pure-ish
 * orchestration: no direct fetch, no direct pdf.js. The two seams are injected:
 * - `responder: VisionResponder` — the transport (real gateway responder in
 *   production, a stub in every test). The pipeline never constructs one.
 * - `renderPage: VisionRenderPage` — page-image supply (parser 1.0× previews
 *   in the live services, a stub in tests).
 *
 * COST CONTROL (PLAN.md §13 + §6 risk 4 — the gateway allows ONE image per
 * request, ≤3.5M base64 chars, no streaming with media):
 * 1. CLASSIFY BEFORE VISION. Every page is classified by I1 from its native
 *    text + title FIRST. The per-class policy (VISION_CLASS_POLICY) decides
 *    whether the page gets a vision call at all:
 *    - 'none': no call. COVER pages carry no detection value.
 *    - 'survey': ONE survey call (the combined first-pass prompt), never a
 *      DETAIL re-pass. For classes where detection is informative but rarely
 *      quantity-bearing (SITE_PLAN, ELEVATION, MEP, LEGEND_SPEC) and for
 *      UNKNOWN pages (one look to discover content, never a blind deep read).
 *    - 'full': one survey call + ONE DETAIL re-pass when the first pass
 *      leaves UNRESOLVED/CONFLICT records. For quantity-bearing classes
 *      (FLOOR_PLAN, SECTION, STRUCTURAL, FOUNDATION, ROOF_PLAN,
 *      DOOR_WINDOW_SCHEDULE, STRUCTURAL_SCHEDULE, DETAIL).
 *    Scanned pages (no text layer) classify UNKNOWN from nothing — they get
 *    the survey, then are RE-CLASSIFIED from the survey's own text, and the
 *    policy is re-evaluated from the new class. Classification is never
 *    guessed from nothing: a page with no text and no survey content stays
 *    UNKNOWN.
 *    I9 — OCR-AS-SURVEY: for scanned pages the first pass IS the OCR pass
 *    (visionOcr.ts: buildOcrPrompt), NOT a survey plus a pre-pass. One
 *    vision call reads the page as text spans; the spans are deduped
 *    (dedupeOcrSpans) and shaped into proposals (ocrSpansToProposals),
 *    which then flow through the SAME re-classification, validation,
 *    DETAIL-escalation, and AHSP steps as survey proposals. Rationale:
 *    a pre-pass would cost an EXTRA call per scanned page before the
 *    survey, and the survey's structured detections are exactly what the
 *    OCR spans get routed into anyway — the OCR read subsumes the
 *    survey for a page with no text layer. Non-scanned pages are
 *    UNCHANGED: no OCR pass, the native text already exists, and no
 *    vision call is spent re-reading it. The OCR pass counts toward the
 *    40-call cap and uses the same cache + responder seam, with its own
 *    roiId segment (`full:ocr:<version>`) so OCR entries never collide
 *    with survey/detail entries.
 * 2. SEQUENTIAL, CAPPED. Pages run one after another (no parallel provider
 *    calls — gateway budget + rate limits). DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT
 *    (40) caps the whole document: when the next call would exceed it, the
 *    remaining pages are recorded NOT_DETECTED with reason 'budget' — never
 *    silently skipped.
 * 3. CACHE FIRST. Every analyze goes through VisionCache (keyed on docHash +
 *    page + roi + VISION_PROMPT_VERSION + model version). A re-run of the
 *    same document costs zero provider calls.
 * 4. SIZE-AWARE RENDER. The render scale is chosen from the MEASURED base64
 *    length (see decideVisionRender): fits → native single render; modest
 *    oversize (downscale factor ≥ 0.5) → one downscaled render; large
 *    oversize → overlapping tiles via tilePage, each analysed separately,
 *    tile-local bboxes translated back to page coordinates, then
 *    dedupeProposals (IoU > 0.5, same kind + label) collapses overlap-zone
 *    duplicates. When even tiling exceeds the tile cap, the page is read
 *    once at the downscale factor WITH an explicit readability warning —
 *    a degraded read is reported honestly, never refused silently.
 *
 * VALIDATION — AI proposes, the deterministic engine decides (PLAN.md §2.5):
 * - Dimension proposals are re-parsed by the I2 parser on their VERBATIM
 *   text. The model's own normalized value (when present in the raw entry)
 *   is NEVER trusted: it is compared against the I2 value and, on mismatch,
 *   discarded with a NEEDS_REVIEW note. An unparseable dimension becomes a
 *   skipped proposal, never a record.
 * - Symbol proposals flow to I3 (mark → schedule link). A mark with no
 *   schedule row stays UNRESOLVED with null dims — never a guessed size.
 *   I11 Stage 4 (E16): structural symbols (columns/beams/slabs/footings/
 *   rebar) and object proposals (walls, roofs, SDA/civil elements) now
 *   become ElementRecords instead of skips — same mark → schedule link,
 *   same confidence/status rules as openings.
 * - Geometry quantities are recomputed by I4 (qtoCount) from evidenced
 *   inputs only. I8 computed COUNT quantities from opening occurrences;
 *   I11 Stage 4 (E17) adds area/volume quantities from element geometry
 *   (wall net area with opening deductions, volumes from dimensions,
 *   cross-section and plan areas) via quantitiesForElement — missing
 *   inputs yield NO quantity record, never a 0.
 * - Cross-page references are recorded in the I5 graph and resolved at
 *   document level against known targets (page titles + schedule marks).
 * - Scale comes from I6: stated scales (native text first, vision legend
 *   second) are STATED_ONLY and unverified. Pixel calibration is NOT
 *   attempted: a proposal bbox bounds the dimension TEXT, not the measured
 *   span, so no pixel length is evidence in I8.
 * - Proposals NEVER arrive VERIFIED (statusFromConfidence caps at
 *   HIGH_CONFIDENCE); impossible bboxes are dropped by the I8a parser
 *   before this module ever sees them.
 *
 * FULL AI ISOLATION (dedMode.ts rule C3): the pipeline routes every
 * canonical-catalog decision through canEnrichWithCanonical(), which is
 * canUseCanonicalCatalog(mode) && canUseInternalPriceData(mode). In FULL_AI
 * mode enrichment is skipped with reason 'full-ai-isolation' and the
 * (optional, injected) AHSP matcher is never called. In EZRAB_AI mode a
 * matcher may be injected; an unmatched record stays null + UNRESOLVED —
 * a price is never invented. I11 Stage 4 ships the matcher adapter
 * (visionAhsp.ts over the canonical resolver `matchDedItemToAhsp`) and
 * the live services pass it, so EZRAB_AI enriches openings AND geometry
 * quantities; FULL_AI still records 'full-ai-isolation'.
 *
 * `docHash` is an input string (sha256 of the PDF bytes). The pipeline
 * never hashes bytes itself; computeDocHash() below is the helper the
 * SERVICE layer calls to produce it.
 */

import { classifyDrawingPage } from './classification';
import { parseDimensionList, parseDimensionToken, parseSheetUnitsNote } from './dimensions';
import {
  ELEMENT_TYPE_LABELS,
  diameterFromMark,
  elementDimsFromText,
  elementMarkFromText,
  inferElement,
  linkElementToSchedule,
  quantitiesForElement,
} from './elements';
import type { ElementOccurrence } from './elements';
import {
  extractKeywordQualifiedDigitMark,
  extractKeywordQualifiedMark,
  linkOpeningToSchedule,
  normalizeMark,
  parseScheduleRow,
} from './openings';
import { qtoCount } from './geometryQto';
import { addReference, createReferenceGraph, detectConflicts, resolveGraph } from './references';
import type { ClaimedValue, KnownTarget } from './references';
import { parseStatedScale } from './scale';
import {
  MAX_VISION_BASE64_CHARS,
  VISION_MODEL_VERSION,
  VISION_PROMPT_VERSION,
  VisionClient,
  assertVisionImageSize,
  buildDimensionPrompt,
  buildPageSurveyPrompt,
  buildSymbolPrompt,
  buildTablePrompt,
  visionDownscaleFactorForBase64,
} from './visionClient';
import type {
  VisionDetectionProposal,
  VisionParseResult,
  VisionResponder,
} from './visionClient';
import {
  OCR_ROI_ID,
  buildOcrPrompt,
  dedupeOcrSpans,
  isScheduleRowLikeText,
  ocrSpansFromProposals,
  ocrSpansToProposals,
  ocrTileRoiId,
  parseOcrResponse,
} from './visionOcr';
import type { OcrTextSpan } from './visionOcr';
import { visionCacheKey } from './visionCache';
import type { VisionCache, VisionCacheStorage } from './visionCache';
import { bboxIou, dedupeProposals, roiIdFor, tilePage, tilePageGrid } from './roi';
import type { DedupeMerge, PageTile } from './roi';
import { canUseCanonicalCatalog, canUseInternalPriceData } from '../ded-ai-estimate/dedMode';
import type { DedRabAiMode } from '../ded-ai-estimate/dedMode';
import { statusFromConfidence } from './types';
import type {
  BoundingBox,
  CrossSheetReference,
  DimensionRecord,
  DrawingPageClass,
  ElementCategory,
  ElementRecord,
  EvidenceRecord,
  GeometryQuantity,
  OpeningKind,
  OpeningRecord,
  PageClassification,
  ScheduleEntry,
  ScaleCalibration,
  VisionReviewStatus,
} from './types';
import type { EvidenceType } from '../../ded-rab-v2/types';

// ---------------------------------------------------------------------------
// Policy knobs — one place, documented
// ---------------------------------------------------------------------------

/** Default cap on vision (provider) calls per document run. */
export const DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT = 40;
/**
 * Default cap on tiles per page when a single render cannot fit the gateway cap.
 * 9 (a 3×3 grid) is the SMALLEST cap under which tiling is reachable at all:
 * tiling only triggers below the 0.5 downscale floor (base64 > 14M chars),
 * and a 14M+ page needs ≥ 6 tiles at the 0.8 budget fraction — a cap of 4
 * would make the tiling branch dead code. 9 tiles = 9 calls worst case for
 * one page; the document cap (40) still bounds the run.
 */
export const DEFAULT_MAX_TILES_PER_PAGE = 9;
/**
 * Below this linear downscale factor a whole-page render is too degraded to
 * read reliably — tile instead. A 0.5 factor halves each dimension (quarter
 * area); small dimension text below that is routinely unreadable.
 */
export const MIN_VISION_DOWNSCALE_FACTOR = 0.5;
/**
 * I11 Stage 3, fix 3 — DENSITY threshold for legibility tiling: native
 * text-layer characters per megapixel of the RENDER. At or above this
 * density the page's text is too small to read whole-page at the render
 * scale, so the page is tiled at native scale (each tile read sees its
 * text relatively larger, and each response is smaller — less truncation
 * risk). Calibrated on measured densities (2026-11-22): synthetic
 * fixture pages ≤ 84 ch/MP; Kirkland (sparse Letter sheet) 2,668;
 * 90135 (dense A2) 14,354; 111853 (very dense A4) 88,419. The 5,000
 * threshold sits 2× above the sparsest real sheet and ~3× below the
 * densest-legible one — a heuristic with a measured margin on both
 * sides, not a fitted constant. A 2× re-render quarters the density
 * (same text, 4× the pixels): 90135 drops to 3,589 (single read at
 * 2×), 111853 stays at 22,105 (still tiled at 2×) — the threshold
 * correctly tracks render-relative legibility. Scanned pages have no
 * text layer (density 0) and never tile on density — a documented
 * limitation (a pixel-density signal would be needed there).
 */
export const DENSITY_TILE_THRESHOLD_CHARS_PER_MP = 5000;
/** Long-side cap (px) for density tiles — see tilePageGrid (roi.ts). */
export const DENSITY_TILE_MAX_PX = 700;
/** Text density (chars per megapixel of the render) for one page. Pure, exported for tests. */
export function visionTextDensityCharsPerMp(textChars: number, widthPx: number, heightPx: number): number {
  const megapixels = (widthPx * heightPx) / 1e6;
  if (!Number.isFinite(megapixels) || megapixels <= 0) return 0;
  if (!Number.isFinite(textChars) || textChars <= 0) return 0;
  return textChars / megapixels;
}
/** Tiles are sized so each holds at most this fraction of the gateway cap. */
const TILE_BUDGET_FRACTION = 0.8;
/** Overlap between adjacent tiles (px) so a detection on a seam is seen whole by at least one tile. */
const TILE_OVERLAP_PX = 64;

// ---------------------------------------------------------------------------
// Per-class vision policy
// ---------------------------------------------------------------------------

/**
 * What the pipeline may spend on a page of a given class:
 * - 'none': no vision call at all.
 * - 'survey': one survey call; no DETAIL re-pass.
 * - 'full': one survey call + one DETAIL re-pass when UNRESOLVED/CONFLICT remain.
 */
export type VisionPagePolicy = 'none' | 'survey' | 'full';

/**
 * Per-class policy. Rationale: detection pays only where quantities live.
 * COVER carries no detection value (title block only — its text is already
 * in the native layer when present, and a scanned cover still has nothing
 * to count). LEGEND_SPEC/SITE_PLAN/ELEVATION/MEP inform context (scale,
 * site, heights) but rarely bear quantities, so one survey look and no
 * re-pass. UNKNOWN gets one survey look to discover content — never a
 * blind deep read. The nine 'full' classes are where dimensions, openings,
 * schedules, and structure live (CIVIL is 'full': road/bridge/dam sheets
 * are quantity-bearing — alignments, sections, and structures).
 */
export const VISION_CLASS_POLICY: Record<DrawingPageClass, VisionPagePolicy> = {
  COVER: 'none',
  LEGEND_SPEC: 'survey',
  SITE_PLAN: 'survey',
  ELEVATION: 'survey',
  MEP: 'survey',
  UNKNOWN: 'survey',
  FLOOR_PLAN: 'full',
  SECTION: 'full',
  STRUCTURAL: 'full',
  FOUNDATION: 'full',
  ROOF_PLAN: 'full',
  DOOR_WINDOW_SCHEDULE: 'full',
  STRUCTURAL_SCHEDULE: 'full',
  DETAIL: 'full',
  CIVIL: 'full',
};

export function visionPolicyForClass(drawingClass: DrawingPageClass): VisionPagePolicy {
  return VISION_CLASS_POLICY[drawingClass] ?? 'survey';
}

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/** Shared mutable call budget for one document run. */
export interface VisionCallBudget {
  used: number;
  max: number;
}

/** One rendered page image (full page or one tile). */
export interface RenderedPageImage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** Measured base64 payload length (prefix excluded) — the gateway counts this. */
  base64Length: number;
}

/**
 * Page-image seam. `roi` (in full-page image pixels) requests a crop;
 * `scale` (0..1] requests a linear downscale. Implementations: parser
 * previews in the live services (createParserPreviewRenderPage), a stub
 * in tests. A render failure rejects — the pipeline records the page
 * honestly (skippedReason 'render'/'error') and continues with the rest.
 */
export type VisionRenderPage = (req: {
  page: number;
  roi?: BoundingBox;
  scale?: number;
}) => Promise<RenderedPageImage>;

/** One page as the pipeline sees it (text layer facts + render facts). */
export interface VisionPageInput {
  page: number;
  title?: string;
  /** Native text-layer content ('' when the page is scanned/image-only). */
  text?: string;
  /** False for scanned/image-only pages (no native text layer). */
  hasTextLayer: boolean;
  /** Full-page render size in px (from the PNG header — see pngDimensionsFromDataUrl). */
  widthPx: number;
  heightPx: number;
  /** Measured base64 length of the full-page render. */
  base64Length: number;
  /** Schedule rows known BEFORE this page runs (doc-level accumulation). */
  schedule?: ScheduleEntry[];
  /** Known cross-sheet targets for reference resolution (doc-level). */
  knownTargets?: KnownTarget[];
  /** Source file name (evidence provenance). */
  fileName?: string;
}

export interface VisionPageCost {
  /** Provider (responder) calls made for this page. */
  calls: number;
  /** Base64 chars sent for this page. */
  bytesSent: number;
  /** Cache hits for this page. */
  cacheHits: number;
}

/** A parsed proposal that could not become a record — recorded, never silently dropped. */
export interface SkippedProposal {
  kind: string;
  label: string;
  rawText: string;
  reason: string;
}

/**
 * I11 Stage 4 — one AHSP match request: a work-item name + billing unit
 * for the resolver, keyed to the record it came from. Built by
 * `ahspInputForOpening` / `ahspInputForQuantity` (below) from evidenced
 * record fields only — never from model-invented names.
 */
export interface VisionAhspMatchInput {
  /** Record key (opening mark or quantity id). */
  key: string;
  /** Work-item name for the resolver (e.g. 'Pintu Kayu Jati', 'Beton footplat'). */
  name: string;
  /** Billing unit (e.g. 'buah', 'm3', 'm2'). */
  unit: string;
  /** Specification detail for the resolver's spec gate (e.g. '900 x 2100 mm'). */
  specification?: string;
}

export interface VisionAhspMatch {
  /** Record key (opening mark or quantity id). */
  key: string;
  /** What was matched: an opening record or a geometry quantity. */
  recordKind: 'opening' | 'quantity';
  /** Null when unmatched — never an invented code. */
  ahspCode: string | null;
  /** Canonical direct-cost unit price — ONLY when ahspCode is non-null. */
  unitPrice: number | null;
  status: VisionReviewStatus;
  note?: string;
}

export interface VisionAhspOutcome {
  attempted: boolean;
  enrichedCount: number;
  /**
   * Why enrichment did not run: 'full-ai-isolation' (C3 — FULL_AI mode),
   * 'no-records-to-enrich' (no openings or matchable quantities on the
   * page), 'no-matcher-provided' (no matcher was injected). Null when
   * enrichment ran.
   */
  skippedReason: string | null;
  matches: VisionAhspMatch[];
}

export interface VisionRenderDecision {
  mode: 'single' | 'tiled' | 'none';
  /** Linear downscale factor applied to the render (1 = native). */
  scale: number;
  /** Tiles when mode is 'tiled' (empty otherwise). */
  tiles: PageTile[];
  /** Human-readable reason for the choice (audit trail). */
  reason: string;
}

export interface VisionPageResult {
  page: number;
  classification: PageClassification;
  policy: VisionPagePolicy;
  renderDecision: VisionRenderDecision;
  dimensions: DimensionRecord[];
  openings: OpeningRecord[];
  /** I11 Stage 4 (E16) — non-opening elements (structural, wall, roof, SDA, civil). */
  elements: ElementRecord[];
  quantities: GeometryQuantity[];
  references: CrossSheetReference[];
  scale: ScaleCalibration | null;
  scheduleEntries: ScheduleEntry[];
  /** Deduped proposals in PAGE coordinates (audit trail + item matching). */
  proposals: VisionDetectionProposal[];
  /** OCR spans read from this page (I9; scanned pages only — [] for text-layer pages). */
  ocrSpans: OcrTextSpan[];
  /** True when the OCR pass ran for this page (scanned pages only). */
  ocrPass: boolean;
  skippedProposals: SkippedProposal[];
  /** Entries the I8a parser dropped as malformed (impossible bbox, bad kind, …). */
  droppedProposalCount: number;
  /** Overlap-zone duplicates collapsed by dedupeProposals. */
  dedupeMerges: number;
  /** True when every vision read this page needed came from the cache. */
  cacheHit: boolean;
  cost: VisionPageCost;
  status: VisionReviewStatus;
  /** Why no (complete) vision read happened: null when the page was read. */
  skippedReason: 'policy' | 'budget' | 'render' | 'error' | null;
  ahsp: VisionAhspOutcome;
  /** True when the DETAIL escalation re-pass ran for this page. */
  detailPass: boolean;
  /**
   * True when ANY vision read for this page was truncated mid-JSON
   * (gateway output clamp) and its proposals/spans are SALVAGED
   * partial results — a PARTIAL read, never a full read (I11 Stage 3,
   * fix 1). The focused completion passes (focusPasses) exist to
   * complete such reads; a page can be partialRead AND completed.
   */
  partialRead: boolean;
  /**
   * Focused completion passes run for this page (I11 Stage 3, fix 2):
   * 'dimensions' | 'symbols' | 'tables' — each names one focused
   * prompt re-read. Empty when the first pass needed no completion.
   */
  focusPasses: string[];
  warnings: string[];
}

export interface VisionDocumentCost {
  calls: number;
  bytesSent: number;
  cacheHits: number;
  pages: number;
}

export interface VisionDocumentResult {
  docHash: string;
  mode: DedRabAiMode;
  pages: VisionPageResult[];
  /** Doc-level linked openings (all pages, page order). */
  openings: OpeningRecord[];
  /** Doc-level linked elements (all pages, page order). */
  elements: ElementRecord[];
  /** Doc-level resolved references (I5 graph). */
  references: CrossSheetReference[];
  /** All schedule rows read anywhere in the document. */
  scheduleEntries: ScheduleEntry[];
  totalCost: VisionDocumentCost;
  /** True when the call cap stopped one or more pages. */
  budgetHit: boolean;
  warnings: string[];
}

/**
 * Vision evidence attached to one live result item (DedAiItem /
 * FullAiItem). The bbox is in PAGE-IMAGE pixels of the parser preview —
 * the same frame the I7 viewer renders markers in.
 */
export interface VisionItemEvidence {
  page: number;
  bbox: BoundingBox;
  label: string;
  kind: VisionDetectionProposal['kind'];
  confidence: number;
  status: VisionReviewStatus;
}

/**
 * AHSP matcher seam for vision records (optional, injected). I11 Stage 4
 * ships the adapter (`visionAhsp.ts` over the canonical resolver
 * `matchDedItemToAhsp`); the live services pass it. A matcher maps a
 * work-item name + unit to a canonical AHSP code + unit price, or null
 * (unmatched). It is called ONLY when canEnrichWithCanonical(mode) is
 * true (see evaluateAhsp) — never in FULL_AI mode (C3).
 */
export type VisionAhspMatcher = (input: VisionAhspMatchInput) => {
  ahspCode: string | null;
  unitPrice?: number | null;
  note?: string;
} | null | undefined;

// ---------------------------------------------------------------------------
// Pure helpers — hashing, image facts, cache storage
// ---------------------------------------------------------------------------

/** Coerce the buffer shapes parseDedPdf accepts into a Uint8Array (same rules as the parser). */
export function coerceToUint8Array(buffer: ArrayBuffer | Uint8Array | Buffer | string): Uint8Array {
  if (typeof buffer === 'string') return new TextEncoder().encode(buffer);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }
  if (buffer instanceof Uint8Array) {
    return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }
  return new Uint8Array(buffer);
}

/**
 * Content hash of the PDF bytes for cache keys. SHA-256 via WebCrypto
 * (browser + Node 19+); falls back to FNV-1a 32-bit in environments
 * without WebCrypto — the `fnv1a-` prefix keeps the weaker hash honest.
 * Called by the SERVICE layer; the pipeline takes docHash as an input.
 */
export async function computeDocHash(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    // Copy into a fresh ArrayBuffer-backed view (TS: subtle.digest needs
    // BufferSource over ArrayBuffer, not ArrayBufferLike).
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const digest = await subtle.digest('SHA-256', copy);
    const hex = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256-${hex}`;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16).padStart(8, '0')}`;
}

/**
 * Read PNG pixel dimensions from the IHDR chunk of a data URL (or bare
 * base64). The parser renders PNG previews but reports no dimensions —
 * this recovers them without decoding the image. Returns null for
 * non-PNG input, truncated input, or invalid dimensions — never a guess.
 */
export function pngDimensionsFromDataUrl(
  dataUrl: string,
): { widthPx: number; heightPx: number } | null {
  if (typeof dataUrl !== 'string') return null;
  const comma = dataUrl.indexOf(',');
  const compact = (comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl).replace(/\s+/g, '');
  if (compact.length < 32) return null;
  let bytes: Uint8Array;
  try {
    if (typeof Buffer !== 'undefined') {
      bytes = Buffer.from(compact.slice(0, 44), 'base64');
    } else {
      const bin = atob(compact.slice(0, 44));
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    }
  } catch {
    return null;
  }
  if (bytes.length < 24) return null;
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isIhdr =
    bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
  if (!isPng || !isIhdr) return null;
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { widthPx: width, heightPx: height };
}

/** Base64 payload length of a data URL (prefix excluded — the gateway strips it before measuring). */
export function base64LengthOfDataUrl(dataUrl: string): number {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  return (comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl).replace(/\s+/g, '').length;
}

/**
 * sessionStorage mirror for VisionCache (browser only). Returns undefined
 * outside a browser or when storage is unavailable — the in-memory cache
 * still works. The mirror is best-effort: quota failures never throw.
 */
export function browserSessionVisionCacheStorage(): VisionCacheStorage | undefined {
  try {
    if (typeof sessionStorage === 'undefined') return undefined;
    const storage = sessionStorage;
    return {
      get: (key) => {
        try {
          return storage.getItem(key);
        } catch {
          return null;
        }
      },
      set: (key, value) => {
        try {
          storage.setItem(key, value);
        } catch {
          /* quota/full — the mirror is best-effort, the memory cache stands */
        }
      },
      remove: (key) => {
        try {
          storage.removeItem(key);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Render seam backed by parser previews (used by the live services)
// ---------------------------------------------------------------------------

/** One parser 1.0× preview, with the facts the pipeline needs. */
export interface ParserPreviewImage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  base64Length: number;
}

/**
 * Build a VisionRenderPage from the parser's per-page previews
 * (parseDedPdf withImages:true). Full-page native reads return the preview
 * as-is (no canvas, no copy). Tile crops / downscales go through a
 * browser canvas and therefore throw a clear error outside a browser —
 * the pipeline records that page honestly instead of crashing the run.
 */
export function createParserPreviewRenderPage(
  previews: ReadonlyMap<number, ParserPreviewImage>,
): VisionRenderPage {
  return async ({ page, roi, scale }) => {
    const preview = previews.get(page);
    if (!preview) {
      throw new Error(
        `No parser preview available for page ${page} — the page image was not rendered ` +
          `(withImages was off or the render failed).`,
      );
    }
    const s = scale ?? 1;
    if (!roi && s >= 1) {
      return {
        dataUrl: preview.dataUrl,
        widthPx: preview.widthPx,
        heightPx: preview.heightPx,
        base64Length: preview.base64Length,
      };
    }
    return cropPreviewImage(preview, roi, s);
  };
}

async function cropPreviewImage(
  preview: ParserPreviewImage,
  roi: BoundingBox | undefined,
  scale: number,
): Promise<RenderedPageImage> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error(
      'Cropping/scaling a page preview needs a browser canvas (document/Image) — unavailable in this environment.',
    );
  }
  const srcX = roi ? Math.max(0, Math.round(roi.x)) : 0;
  const srcY = roi ? Math.max(0, Math.round(roi.y)) : 0;
  const srcW = roi
    ? Math.max(1, Math.min(Math.round(roi.width), preview.widthPx - srcX))
    : preview.widthPx;
  const srcH = roi
    ? Math.max(1, Math.min(Math.round(roi.height), preview.heightPx - srcY))
    : preview.heightPx;
  const destW = Math.max(1, Math.round(srcW * scale));
  const destH = Math.max(1, Math.round(srcH * scale));
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load the page preview image for cropping.'));
    el.src = preview.dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable — cannot crop the page preview.');
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, destW, destH);
  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, widthPx: destW, heightPx: destH, base64Length: base64LengthOfDataUrl(dataUrl) };
}

// ---------------------------------------------------------------------------
// Render decision + tile translation (pure, tested)
// ---------------------------------------------------------------------------

/**
 * Choose single-render vs tiling from the MEASURED base64 length of the
 * full-page render and (I11 Stage 3, fix 3) the page's TEXT DENSITY.
 * Pure — no I/O, no render.
 *
 * - Fits the cap → single render at native scale — UNLESS the page is
 *   dense (textChars/MP ≥ DENSITY_TILE_THRESHOLD_CHARS_PER_MP), in
 *   which case it is tiled at native scale for legibility (small
 *   dimension text is unreadable whole-page at that density, and each
 *   tile's smaller response also dodges the output-token clamp).
 * - Modest oversize (downscale factor ≥ 0.5) → single render at that
 *   factor — unless dense, in which case tiling at native scale wins
 *   over downscaling (downscaling a dense page only shrinks its text
 *   further). Each tile's size is still enforced by the client guard.
 * - Large oversize → overlapping tiles sized so each tile holds ≤ 80% of
 *   the cap, when the tile count fits maxTilesPerPage (size-driven
 *   tiling — density is irrelevant here, the page tiles either way).
 * - Tiling would exceed the tile cap → single render at the downscale
 *   factor WITH a readability warning (a degraded read, reported honestly).
 * - Unknown page size (0/invalid dims) → single render attempted as-is;
 *   the size guard in the client still refuses a truly oversize image.
 */
export function decideVisionRender(input: {
  widthPx: number;
  heightPx: number;
  base64Length: number;
  maxTilesPerPage?: number;
  /**
   * Native text-layer length in characters (0/absent for scanned pages).
   * Density = textChars per megapixel of the render.
   */
  textChars?: number;
}): VisionRenderDecision {
  const maxTiles = input.maxTilesPerPage ?? DEFAULT_MAX_TILES_PER_PAGE;
  const { widthPx, heightPx, base64Length } = input;
  if (
    !Number.isFinite(widthPx) || widthPx <= 0 ||
    !Number.isFinite(heightPx) || heightPx <= 0 ||
    !Number.isFinite(base64Length) || base64Length < 0
  ) {
    return {
      mode: 'single',
      scale: 1,
      tiles: [],
      reason: 'Unknown page size — single render attempted as-is; the client size guard still refuses oversize images.',
    };
  }
  const factor = visionDownscaleFactorForBase64(base64Length);
  // I11 Stage 3, fix 3 — density tiling (legibility), before the
  // size-based branches: a dense page that fits (or nearly fits) is
  // tiled at native scale. Large-oversize pages (factor < 0.5) skip
  // this branch and tile via the size branch below.
  const density = visionTextDensityCharsPerMp(input.textChars ?? 0, widthPx, heightPx);
  if (density >= DENSITY_TILE_THRESHOLD_CHARS_PER_MP && factor >= MIN_VISION_DOWNSCALE_FACTOR) {
    const grid = tilePageGrid(widthPx, heightPx, DENSITY_TILE_MAX_PX, TILE_OVERLAP_PX);
    if (grid.length > 1 && grid.length <= maxTiles) {
      return {
        mode: 'tiled',
        scale: 1,
        tiles: grid,
        reason:
          `Dense page (${density.toLocaleString('en-US', { maximumFractionDigits: 0 })} text chars/MP ≥ ${DENSITY_TILE_THRESHOLD_CHARS_PER_MP.toLocaleString('en-US')} threshold) — ` +
          `${grid.length} overlapping tiles at native scale for legibility; small dimension text is unreadable whole-page at this density.`,
      };
    }
    // Grid degenerate (1 tile — the page is already smaller than a tile)
    // or over the tile cap: fall through to the size-based decision.
  }
  if (factor >= 1) {
    return {
      mode: 'single',
      scale: 1,
      tiles: [],
      reason: `Full-page render fits the gateway cap (${base64Length.toLocaleString('en-US')} / ${MAX_VISION_BASE64_CHARS.toLocaleString('en-US')} base64 chars) — single render at native scale.`,
    };
  }
  if (factor >= MIN_VISION_DOWNSCALE_FACTOR) {
    return {
      mode: 'single',
      scale: factor,
      tiles: [],
      reason: `Full-page render oversize — single render downscaled ×${factor.toFixed(2)} to fit the gateway cap.`,
    };
  }
  // Large oversize: tile. Estimate the tile count from area (encoded size
  // scales with pixel area to first order), then lay a grid over the aspect.
  const estTiles = Math.ceil(base64Length / (TILE_BUDGET_FRACTION * MAX_VISION_BASE64_CHARS));
  const cols = Math.max(1, Math.round(Math.sqrt(estTiles * (widthPx / heightPx))));
  const rows = Math.max(1, Math.ceil(estTiles / cols));
  const maxTilePx =
    Math.max(Math.ceil(widthPx / cols), Math.ceil(heightPx / rows)) + TILE_OVERLAP_PX;
  const tiles = tilePage(widthPx, heightPx, maxTilePx, TILE_OVERLAP_PX);
  if (tiles.length > 1 && tiles.length <= maxTiles) {
    return {
      mode: 'tiled',
      scale: 1,
      tiles,
      reason: `Full-page render oversize (downscale ×${factor.toFixed(2)} would drop below the readability floor) — ${tiles.length} overlapping tiles, each sized to fit the gateway cap.`,
    };
  }
  return {
    mode: 'single',
    scale: factor,
    tiles: [],
    reason:
      `Full-page render oversize and tiling would need ${tiles.length} tiles (max ${maxTiles}) — ` +
      `single render downscaled ×${factor.toFixed(2)}; small text may be missed.`,
  };
}

/**
 * Translate a tile-local bbox (pixels of the rendered tile image) back to
 * full-page image pixels. Handles tiles rendered at a downscale: the scale
 * factor is recovered from the tile bbox vs the rendered image size.
 * MUST run before dedupeProposals — IoU across coordinate frames is
 * meaningless (roi.ts documents the same rule).
 */
export function translateTileBboxToPage(
  bbox: BoundingBox,
  tile: PageTile,
  renderedWidthPx: number,
  renderedHeightPx: number,
): BoundingBox {
  const sx = renderedWidthPx > 0 ? tile.bbox.width / renderedWidthPx : 1;
  const sy = renderedHeightPx > 0 ? tile.bbox.height / renderedHeightPx : 1;
  return {
    x: tile.bbox.x + bbox.x * sx,
    y: tile.bbox.y + bbox.y * sy,
    width: bbox.width * sx,
    height: bbox.height * sy,
  };
}

/**
 * Rescale a bbox from RENDERED-image pixels (a downscaled whole-page
 * render) back to full-page image pixels. A no-op (same object values)
 * when the rendered size already equals the page size. The viewer renders
 * markers against the native parser preview, so every bbox this module
 * emits must be in full-page pixels — never in downscaled pixels.
 */
export function rescaleBboxToPage(
  bbox: BoundingBox,
  renderedWidthPx: number,
  renderedHeightPx: number,
  pageWidthPx: number,
  pageHeightPx: number,
): BoundingBox {
  const sx = renderedWidthPx > 0 && pageWidthPx > 0 ? pageWidthPx / renderedWidthPx : 1;
  const sy = renderedHeightPx > 0 && pageHeightPx > 0 ? pageHeightPx / renderedHeightPx : 1;
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return { ...bbox };
  return {
    x: bbox.x * sx,
    y: bbox.y * sy,
    width: bbox.width * sx,
    height: bbox.height * sy,
  };
}

// ---------------------------------------------------------------------------
// FULL AI isolation — the C3 guard point (dedMode.ts rule B)
// ---------------------------------------------------------------------------

/**
 * The ONE canonical-catalog gate for the vision layer: both C3 guards
 * from dedMode.ts must pass. FULL_AI fails both; EZRAB_AI passes both.
 * Every enrichment decision in this module routes through here.
 */
export function canEnrichWithCanonical(mode: DedRabAiMode): boolean {
  return canUseCanonicalCatalog(mode) && canUseInternalPriceData(mode);
}

/** Indonesian work labels for opening kinds (AHSP name building). */
const OPENING_AHSP_LABELS: Record<OpeningKind, string> = {
  door: 'Pintu',
  window: 'Jendela',
  ventilation: 'Ventilasi',
  louver: 'Louver',
  gate: 'Gerbang',
  'glass-partition': 'Partisi Kaca',
  'other-opening': 'Kusen',
};

/**
 * I11 Stage 4 — build the resolver input for one opening. The name is
 * the opening kind + the evidenced material verbatim (`Pintu Kayu
 * Jati`); the specification carries the evidenced dims + frame/glazing.
 * Nothing is invented: an unlinked opening (null dims) simply has no
 * dimension specification, and the resolver decides on the name alone.
 */
export function ahspInputForOpening(o: OpeningRecord): VisionAhspMatchInput {
  const label = OPENING_AHSP_LABELS[o.elementType] ?? 'Kusen';
  const name = o.material ? `${label} ${o.material}` : label;
  const specParts: string[] = [];
  if (o.widthMm !== null && o.heightMm !== null) {
    specParts.push(`${o.widthMm} x ${o.heightMm} mm`);
  }
  if (o.frame) specParts.push(o.frame);
  if (o.glazing) specParts.push(o.glazing);
  return {
    key: o.mark,
    name,
    unit: 'buah',
    specification: specParts.length > 0 ? specParts.join('; ') : undefined,
  };
}

/** Format one inputs value as mm text for a specification, or null when absent/invalid. */
function specMm(inputs: Record<string, number | string>, key: string): string | null {
  const v = inputs[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? `${v} mm` : null;
}

/**
 * I11 Stage 4 — build the resolver input for one geometry quantity, or
 * null when the quantity has no billing meaning:
 * - VOLUME (STRUCTURAL/WALL) → `Beton <label>` per m3 (a footing's
 *   volume IS concrete work; a roof volume is NOT matched — roofing
 *   material is unevidenced, and `Beton atap` would be wrong).
 * - Wall net AREA → `Dinding` per m2 (material unevidenced — the
 *   resolver decides, and usually NEEDS_REVIEWs, honestly).
 * - Roof plan AREA → `Atap` per m2.
 * - Slab/foundation plan AREA → `<label>` per m2.
 * - COUNT and cross-section AREA → null (no per-piece column items and
 *   no cross-section billing in the catalog; matching them would
 *   manufacture a work item the drawing does not evidence).
 * The quantity's `inputs` carry the element identity (`elemen`,
 * `tipe_elemen`, `kategori_elemen`, `jenis_kuantitas` — set by
 * `tagQuantity` in elements.ts); a quantity without them (e.g. an
 * opening COUNT) is never matched.
 */
export function ahspInputForQuantity(q: GeometryQuantity): VisionAhspMatchInput | null {
  const jenis = q.inputs.jenis_kuantitas;
  const tipe = q.inputs.tipe_elemen;
  const kategori = q.inputs.kategori_elemen;
  if (typeof jenis !== 'string' || typeof tipe !== 'string' || typeof kategori !== 'string') {
    return null;
  }
  const label = ELEMENT_TYPE_LABELS[tipe] ?? tipe;
  if (q.kind === 'VOLUME' && (kategori === 'STRUCTURAL' || kategori === 'WALL')) {
    const dims = [specMm(q.inputs, 'panjang_mm'), specMm(q.inputs, 'lebar_mm'), specMm(q.inputs, 'tinggi_mm')]
      .filter((s): s is string => s !== null);
    return {
      key: q.id,
      name: `Beton ${label}`,
      unit: 'm3',
      specification: dims.length > 0 ? dims.join(' x ') : undefined,
    };
  }
  if (q.kind === 'AREA' && jenis === 'luas bersih dinding') {
    const dims = [specMm(q.inputs, 'panjang_dinding_mm'), specMm(q.inputs, 'tinggi_dinding_mm')]
      .filter((s): s is string => s !== null);
    return {
      key: q.id,
      name: 'Dinding',
      unit: 'm2',
      specification: dims.length > 0 ? dims.join(' x ') : undefined,
    };
  }
  if (q.kind === 'AREA' && jenis === 'luas denah atap') {
    return { key: q.id, name: 'Atap', unit: 'm2' };
  }
  if (q.kind === 'AREA' && jenis === 'luas denah') {
    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    return { key: q.id, name: capitalized, unit: 'm2' };
  }
  return null;
}

function evaluateAhsp(
  mode: DedRabAiMode,
  matcher: VisionAhspMatcher | undefined,
  openings: OpeningRecord[],
  quantities: GeometryQuantity[],
): VisionAhspOutcome {
  if (!canEnrichWithCanonical(mode)) {
    return { attempted: false, enrichedCount: 0, skippedReason: 'full-ai-isolation', matches: [] };
  }
  // I11 Stage 4: quantities are enrichable too — but only the
  // matchable kinds (see ahspInputForQuantity). COUNT and
  // cross-section quantities never reach the matcher.
  const quantityInputs = quantities
    .map((q) => ({ q, input: ahspInputForQuantity(q) }))
    .filter((e): e is { q: GeometryQuantity; input: VisionAhspMatchInput } => e.input !== null);
  if (openings.length === 0 && quantityInputs.length === 0) {
    return { attempted: false, enrichedCount: 0, skippedReason: 'no-records-to-enrich', matches: [] };
  }
  if (!matcher) {
    return { attempted: false, enrichedCount: 0, skippedReason: 'no-matcher-provided', matches: [] };
  }
  const matches: VisionAhspMatch[] = [
    ...openings.map((o): VisionAhspMatch => {
      const found = matcher(ahspInputForOpening(o));
      const code = found?.ahspCode ?? null;
      return {
        key: o.mark,
        recordKind: 'opening' as const,
        ahspCode: code,
        unitPrice: code !== null ? (found?.unitPrice ?? null) : null,
        status: code !== null ? 'HIGH_CONFIDENCE' : 'UNRESOLVED',
        note: found?.note,
      };
    }),
    ...quantityInputs.map(({ q, input }): VisionAhspMatch => {
      const found = matcher(input);
      const code = found?.ahspCode ?? null;
      return {
        key: q.id,
        recordKind: 'quantity' as const,
        ahspCode: code,
        unitPrice: code !== null ? (found?.unitPrice ?? null) : null,
        status: code !== null ? 'HIGH_CONFIDENCE' : 'UNRESOLVED',
        note: found?.note,
      };
    }),
  ];
  return {
    attempted: true,
    enrichedCount: matches.filter((m) => m.ahspCode !== null).length,
    skippedReason: null,
    matches,
  };
}

// ---------------------------------------------------------------------------
// Proposal validation — AI proposes, I1–I6 decide
// ---------------------------------------------------------------------------

const MARK_LIKE_RE = /^[A-Za-z]{1,3}-?\d{1,3}$/;

/**
 * I11 Stage 4 (F11) — clean a symbol label before mark extraction: strip
 * a leading `mark`/`tanda` word (the model sometimes labels a symbol
 * `mark "P1"`) and surrounding quotes. `mark "P1"` → `P1`; `"P1"` → `P1`.
 * Exported for tests.
 */
export function cleanSymbolLabel(label: string): string {
  let t = label.trim();
  t = t.replace(/^(?:mark|tanda)\s*:?\s*/i, '');
  t = t.replace(/^["'“”]+|["'“”]+$/g, '');
  return t.trim();
}

/**
 * Extract a mark from a symbol label + raw text, in precedence order:
 * 1. The cleaned label is exactly mark-like (`D1`, `PJ1`).
 * 2. (F11) The raw text ALONE is exactly mark-like — the label
 *    `mark "P1"` with rawText `P1` dropped every symbol in the
 *    id-jadwal-kusen live read; the raw text carries the mark.
 * 3. A digit mark qualified by an opening keyword anywhere
 *    (`Pintu D1` in either field).
 * 4. (E4) A letter-only mark qualified by an opening keyword
 *    (`D DOOR`, `MD MAIN DOOR`).
 * 5. (F8, symbol context only) A bare letter-only label that is one of
 *    the documented opening-mark letters (see OPENING_LETTER_MARKS):
 *    the 90135 live read dropped D/MD/V ×8 with NO keyword in either
 *    field (label = rawText = the bare letter), so the keyword rules
 *    above cannot recover them — but the model's kind='symbol' alone
 *    does NOT discriminate either (the E4 'A' case: a bare grid-axis
 *    label classified as a symbol must still be skipped). The closed
 *    vocabulary is the discriminator: D/MD/W/V/J/P are opening-mark
 *    conventions evidenced by the live read + fixtures; grid axes
 *    (A–E) and unlisted letters stay skipped. A lone X is excluded
 *    (the dimension separator — E4 precedent). The dimension path does
 *    NOT get this rule (`symbolContext: false`): a dimension labelled
 *    `D` is not evidence it belongs to element D.
 */
function markFromLabel(
  label: string,
  rawText: string,
  opts?: { symbolContext?: boolean },
): string | null {
  const cleaned = cleanSymbolLabel(label);
  if (MARK_LIKE_RE.test(cleaned)) return normalizeMark(cleaned);
  const rawTrimmed = rawText.trim();
  if (MARK_LIKE_RE.test(rawTrimmed)) return normalizeMark(rawTrimmed);
  const combined = `${cleaned} ${rawText}`;
  const digitMark = extractKeywordQualifiedDigitMark(combined);
  if (digitMark) return digitMark;
  const letterMark = extractKeywordQualifiedMark(combined);
  if (letterMark) return letterMark;
  if (
    opts?.symbolContext === true &&
    OPENING_LETTER_MARKS.has(cleaned.toUpperCase())
  ) {
    return normalizeMark(cleaned);
  }
  return null;
}

/**
 * I11 Stage 4 (F8) — the closed set of bare letter-only opening marks.
 * D = door, MD = main door, W = window, V = vent/ventilasi,
 * J = jendela, P = pintu. Evidenced by the 90135 live read (D/MD/V
 * dropped with no keyword) and the E4 fixtures (D/MD/W). Deliberately
 * NOT included: grid axes (A–E), structural letters (K/B/S/F — the
 * structural path owns those), and unlisted letters (e.g. 90135's G,
 * whose semantics are unverified — fail closed, skip with a reason).
 */
const OPENING_LETTER_MARKS = new Set(['D', 'MD', 'W', 'V', 'J', 'P']);

const STRUCTURAL_KEYWORDS = [
  'kolom', 'column', 'balok', 'beam', 'pelat', 'slab',
  'pondasi', 'fondasi', 'footplat', 'sloof', 'tangga', 'stair',
];

/**
 * I10b E8 — structural-mark shapes: K/B/S/F + digits (kolom/balok/slab/
 * footplat) and D + digits ≥ 6 (rebar diameter — mirrors I2's diameter
 * floor: D6 is the smallest standard rebar, D1–D5 stay opening marks).
 * These are structural ONLY on a structural page class (see
 * isStructuralPageClass): the same token on a floor plan is a
 * project-defined opening mark.
 */
const STRUCTURAL_MARK_RE = /^(?:[KBSF]\d{1,3}|D(?:[6-9]\d*|\d{2,3}))$/i;

function isStructuralPageClass(drawingClass: DrawingPageClass): boolean {
  return (
    drawingClass === 'STRUCTURAL' ||
    drawingClass === 'FOUNDATION' ||
    drawingClass === 'STRUCTURAL_SCHEDULE'
  );
}

function isStructuralMark(label: string): boolean {
  return STRUCTURAL_MARK_RE.test(label.trim());
}

/**
 * I11 Stage 4 (E16) — a bare single-letter structural mark (K/B/S/F) on
 * a structural page. `D` is deliberately NOT here: a bare `D` stays an
 * opening candidate (the E8 D1–D5 judgment call, extended to the bare
 * letter — a door mark `D` is far more common than a structural `D`).
 */
const STRUCTURAL_LETTER_MARK_RE = /^[KBSF]$/i;

function isStructuralLetterMark(label: string): boolean {
  return STRUCTURAL_LETTER_MARK_RE.test(label.trim());
}

/**
 * I11 Stage 4 (E16) — element type from a structural mark's first
 * letter (K → column, B → beam, S → slab, F → foundation, D → rebar).
 * Used when a bare mark carries no keyword for `inferElement`.
 */
function structuralTypeFromMarkLetter(
  label: string,
  rawText: string,
): { category: ElementCategory; elementType: string } | null {
  const mark = elementMarkFromText(`${label} ${rawText}`);
  const letter = (mark ?? label.trim()).charAt(0).toUpperCase();
  switch (letter) {
    case 'K':
      return { category: 'STRUCTURAL', elementType: 'column' };
    case 'B':
      return { category: 'STRUCTURAL', elementType: 'beam' };
    case 'S':
      return { category: 'STRUCTURAL', elementType: 'slab' };
    case 'F':
      return { category: 'STRUCTURAL', elementType: 'foundation' };
    case 'D':
      return { category: 'STRUCTURAL', elementType: 'rebar' };
    default:
      return null;
  }
}

/**
 * I11 Stage 4 (E16) — element type from a structural keyword, with the
 * same substring matching as `isStructuralSymbol` (so a keyword that
 * entered the structural path always resolves a type even when
 * `inferElement`'s word-boundary match misses it, e.g. `KOLOMX`).
 */
function structuralTypeFromKeyword(
  label: string,
  rawText: string,
): { category: ElementCategory; elementType: string } | null {
  const hay = `${label} ${rawText}`.toLowerCase();
  const byKeyword: Array<{ words: string[]; elementType: string }> = [
    { words: ['kolom', 'column'], elementType: 'column' },
    { words: ['balok', 'beam'], elementType: 'beam' },
    { words: ['pelat', 'slab'], elementType: 'slab' },
    { words: ['pondasi', 'fondasi', 'footplat'], elementType: 'foundation' },
    { words: ['sloof'], elementType: 'tie-beam' },
    { words: ['tangga', 'stair'], elementType: 'stair' },
    { words: ['tulangan', 'rebar'], elementType: 'rebar' },
  ];
  for (const entry of byKeyword) {
    if (entry.words.some((w) => hay.includes(w))) {
      return { category: 'STRUCTURAL', elementType: entry.elementType };
    }
  }
  return null;
}

const OPENING_KEYWORDS: Array<{ words: string[]; kind: OpeningKind }> = [
  { words: ['pintu', 'door'], kind: 'door' },
  { words: ['jendela', 'window'], kind: 'window' },
  { words: ['ventilasi', 'vent'], kind: 'ventilation' },
  { words: ['louver'], kind: 'louver' },
  { words: ['gerbang', 'gate'], kind: 'gate' },
  { words: ['partisi'], kind: 'glass-partition' },
];

function containsWord(haystack: string, word: string): boolean {
  return haystack.includes(word);
}

function inferOpeningKind(label: string, rawText: string): OpeningKind | null {
  const hay = `${label} ${rawText}`.toLowerCase();
  for (const entry of OPENING_KEYWORDS) {
    if (entry.words.some((w) => containsWord(hay, w))) return entry.kind;
  }
  if (containsWord(hay, 'kusen') || containsWord(hay, 'kaca')) return 'other-opening';
  return null;
}

function isStructuralSymbol(label: string, rawText: string): boolean {
  const hay = `${label} ${rawText}`.toLowerCase();
  return STRUCTURAL_KEYWORDS.some((w) => containsWord(hay, w));
}

/** One observed symbol occurrence, grouped by mark for I3 linking. */
interface SymbolOccurrence {
  mark: string;
  elementType: OpeningKind;
  page: number;
  evidence: EvidenceRecord[];
}

interface ValidatedProposals {
  dimensions: DimensionRecord[];
  occurrences: SymbolOccurrence[];
  /** I11 Stage 4 (E16) — grouped element occurrences (structural/wall/roof/SDA/civil). */
  elementOccurrences: ElementOccurrence[];
  scheduleEntries: ScheduleEntry[];
  statedScales: Array<{ scale: string; proposal: VisionDetectionProposal }>;
  references: CrossSheetReference[];
  skipped: SkippedProposal[];
  warnings: string[];
}

function evidenceForProposal(
  docHash: string,
  fileName: string,
  proposal: VisionDetectionProposal,
  type: EvidenceType,
  index: number,
): EvidenceRecord {
  const record: EvidenceRecord = {
    id: `EV-p${proposal.page}-${proposal.kind}-${index}`,
    sourceDocumentId: docHash,
    sourceFileName: fileName,
    pageNumber: proposal.page,
    type,
    content: proposal.rawText !== '' ? proposal.rawText : proposal.label,
    confidence: proposal.confidence,
  };
  if (proposal.bbox) record.boundingBox = { ...proposal.bbox };
  return record;
}

/** The model's own normalized value, when the raw entry carries one. Unit is unknown — read as mm (drawing convention). */
function modelClaimedMm(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const v = rec.normalizedValue ?? rec.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function dimensionRecordToMm(rec: DimensionRecord): number | null {
  if (rec.unit === 'mm') return rec.normalizedValue;
  if (rec.unit === 'm') return rec.normalizedValue * 1000;
  if (rec.unit === 'cm') return rec.normalizedValue * 10;
  return null; // deg / percent / ratio / unknown are not lengths
}

/**
 * I10b E10 — a preposition after the keyword marks a LABEL, not a
 * reference: `SECTION ON AA` is the title of a section drawing ("section
 * on line AA"), not a reference to a section named `ON`. The lookahead
 * blocks the capture when the next word is a preposition (followed by
 * whitespace or end — a hyphenated word like `ON-SITE` is still an
 * identifier). An identifier-shape rule was considered and rejected:
 * section names are words (`POTONGAN BENDUNGAN` is a real reference),
 * so the preposition is the discriminator.
 */
const PREPOSITION_LOOKAHEAD = String.raw`(?!(?:on|di|pada|at|ke|dari|of)(?:\s|$))`;

const REF_PATTERNS: Array<{ re: RegExp; kind: CrossSheetReference['kind']; refOf: (m: RegExpMatchArray) => string }> = [
  { re: new RegExp(String.raw`\b(?:potongan|section)\s+${PREPOSITION_LOOKAHEAD}([A-Za-z0-9][A-Za-z0-9-]*)`, 'i'), kind: 'SECTION', refOf: (m) => m[0].trim() },
  { re: new RegExp(String.raw`\bdetail\s+${PREPOSITION_LOOKAHEAD}([A-Za-z0-9][A-Za-z0-9-]*)`, 'i'), kind: 'DETAIL', refOf: (m) => m[0].trim() },
  { re: new RegExp(String.raw`\b(?:tampak|elevation)\s+${PREPOSITION_LOOKAHEAD}([A-Za-z0-9][A-Za-z0-9-]*)`, 'i'), kind: 'ELEVATION', refOf: (m) => m[0].trim() },
  { re: new RegExp(String.raw`\b(?:jadwal|schedule)\s+${PREPOSITION_LOOKAHEAD}([A-Za-z0-9][A-Za-z0-9-]*)`, 'i'), kind: 'SCHEDULE', refOf: (m) => m[0].trim() },
  { re: new RegExp(String.raw`\bgrid\s+${PREPOSITION_LOOKAHEAD}([A-Za-z0-9][A-Za-z0-9-]*)`, 'i'), kind: 'GRID', refOf: (m) => m[0].trim() },
  { re: /\b(?:lihat|see)\s+(.{1,80})/i, kind: 'OTHER', refOf: (m) => (m[1] ?? '').trim() },
];

/**
 * I10b E1 — does `tail` sit immediately to the right of `head` (a split
 * number's second fragment)? Horizontal gap −2..10 px (a 2 px overlap
 * tolerates bbox jitter) with at least half the shorter height
 * overlapping vertically — the two fragments share a text baseline.
 */
function bboxAbuts(head: BoundingBox, tail: BoundingBox): boolean {
  const gap = tail.x - (head.x + head.width);
  if (gap < -2 || gap > 10) return false;
  const overlap =
    Math.min(head.y + head.height, tail.y + tail.height) -
    Math.max(head.y, tail.y);
  const minHeight = Math.min(head.height, tail.height);
  return minHeight > 0 && overlap >= minHeight * 0.5;
}

/**
 * I11 Stage 3 (F9/F10) — degenerate flood detection. A model that cannot
 * read a page sometimes confabulates a PERFECT GRID of identical
 * detections (49× `0.91` at conf 0.6 on a 45 px grid; 123 identical
 * `door, unmarked` at conf 0.3): same kind, same rawText, same
 * confidence, bboxes on a uniform lattice. Real repeated readings vary
 * in confidence and almost never sit on a perfect 2D lattice, so the
 * conjunction of (a) ≥6 identical entries, (b) identical confidence
 * ≤ 0.7, (c) a perfect 2D grid (uniform x/y gaps within 2 px, grid fill
 * ≥ 0.8) is confabulation, not evidence. Returns the proposal indices
 * to skip as `degenerate-grid-confabulation`. A real 1D dimension chain
 * (one row of identical segment dims) is SAFE: it has a single distinct
 * y, so the 2D-grid test excludes it. Residual risk, documented: a real
 * 2D bay-dim lattice read at uniformly-low confidence would be dropped
 * — the warning names it, so a reviewer can see the drop happened.
 * Exported for tests.
 */
export function detectDegenerateFlood(proposals: VisionDetectionProposal[]): Set<number> {
  const groups = new Map<string, number[]>();
  proposals.forEach((p, i) => {
    if ((p.kind !== 'dimension' && p.kind !== 'symbol') || !p.bbox) return;
    const key = `${p.kind}|${p.rawText}|${p.confidence}`;
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  });
  const flood = new Set<number>();
  for (const indices of groups.values()) {
    if (indices.length < 6) continue;
    if (proposals[indices[0]].confidence > 0.7) continue;
    const xs = [...new Set(indices.map((i) => Math.round(proposals[i].bbox!.x)))].sort((a, b) => a - b);
    const ys = [...new Set(indices.map((i) => Math.round(proposals[i].bbox!.y)))].sort((a, b) => a - b);
    if (xs.length < 2 || ys.length < 2) continue;
    const uniform = (vals: number[]): boolean => {
      const gaps = vals.slice(1).map((v, j) => v - vals[j]);
      return gaps.every((g) => Math.abs(g - gaps[0]) <= 2);
    };
    if (!uniform(xs) || !uniform(ys)) continue;
    if (indices.length / (xs.length * ys.length) < 0.8) continue;
    for (const i of indices) flood.add(i);
  }
  return flood;
}

/** Normalize a text for identity/containment comparisons (F12/F13): uppercase, one separator letter, single spaces. */
function normalizeIdentityText(s: string): string {
  return s
    .toUpperCase()
    .replace(/[×✕]/g, 'X')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * I11 Stage 5 (F13) — cross-pass identity of a proposal: what the
 * detection IS, independent of how the model happened to phrase its
 * label on this pass. The DETAIL/focused re-read returns the same
 * symbol at the same bbox but with label/rawText SWAPPED (survey:
 * label `Pintu P1` + rawText `P1`; DETAIL: label `P1` + rawText
 * `Pintu P1`) — the label-exact `dedupeProposals` cannot see they are
 * the same detection, so every re-read occurrence counted twice
 * (opening counts exactly 2×, element quantities ×2, schedule rows
 * duplicated). The identity is per kind:
 * - symbol: the mark (`P1`), via the same `markFromLabel` validation
 *   uses — null when no mark is extractable (those symbols skip
 *   anyway, so there is nothing to dedupe).
 * - object: the inferred element (category + type + mark, when the
 *   object carries one) — null when no element is inferred.
 * - table: the normalized row text — a schedule row is a DEFINITION,
 *   so identical text is the same row even without bbox evidence.
 * - dimension: the parsed mm values (+ kinds) — the same annotation
 *   re-read with a different label parses to the same values; when the
 *   text does not parse, the normalized raw text itself is the
 *   identity (two identical unparseable texts at the same bbox are
 *   the same annotation — e.g. an E21 bare `44` re-read).
 * - text/legend: null — those kinds are never re-read by a focused or
 *   DETAIL pass (the prompts are dimensions/symbols/tables only).
 * Exported for tests.
 */
export function crossPassIdentity(p: VisionDetectionProposal): string | null {
  if (p.kind === 'symbol') {
    const mark = markFromLabel(p.label, p.rawText, { symbolContext: true });
    return mark ? `symbol:${normalizeMark(mark)}` : null;
  }
  if (p.kind === 'object') {
    const inferred = inferElement(p.label, p.rawText);
    if (!inferred) return null;
    const mark = elementMarkFromText(`${p.label} ${p.rawText}`);
    return mark
      ? `object:${inferred.category}:${inferred.elementType}:${normalizeMark(mark)}`
      : `object:${inferred.category}:${inferred.elementType}`;
  }
  if (p.kind === 'table') {
    if (!parseScheduleRow(p.rawText, 0)) return null;
    return `table:${normalizeIdentityText(p.rawText)}`;
  }
  if (p.kind === 'dimension') {
    const records = parseDimensionList(p.rawText, { page: 0 });
    if (records.length > 0) {
      return `dimension:${records
        .map((r) => `${dimensionRecordToMm(r) ?? '?'}:${r.kind}`)
        .join('+')}`;
    }
    return `dimension:raw:${normalizeIdentityText(p.rawText)}`;
  }
  return null;
}

/**
 * I11 Stage 5 (F13) — cross-pass dedupe. Two proposals with the SAME
 * cross-pass identity are the same detection seen on two passes when
 * their bboxes overlap above the IoU threshold (default 0.5, same as
 * `dedupeProposals`): the higher-confidence one is kept, the other is
 * dropped and the merge recorded. On a confidence tie the FIRST
 * proposal wins (stable — same rule as `dedupeProposals`).
 *
 * Two different instances of one mark (two P1 doors at different
 * places) NEVER merge: their bboxes do not overlap. Null-bbox
 * proposals never merge either (no placement evidence — the same rule
 * as `dedupeProposals`), EXCEPT table rows, whose identity is the row
 * text itself: a schedule row is a definition, not an instance, so
 * two identical row texts are one row even with no bbox.
 *
 * Runs AFTER `dedupeProposals` at every merge point (survey, focused,
 * DETAIL) — the label-exact pass catches same-label duplicates first,
 * this pass catches the label-variant re-reads it misses.
 * Exported for tests.
 */
export function dedupeCrossPassProposals(
  proposals: VisionDetectionProposal[],
  iouThreshold = 0.5,
): { kept: VisionDetectionProposal[]; dropped: VisionDetectionProposal[]; merges: DedupeMerge[] } {
  if (!Number.isFinite(iouThreshold) || iouThreshold < 0 || iouThreshold > 1) {
    throw new RangeError('dedupeCrossPassProposals: iouThreshold must be a finite number in 0..1.');
  }
  const identities = proposals.map((p) => crossPassIdentity(p));
  const ordered = proposals
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.confidence - a.p.confidence || a.i - b.i)
    .map(({ p, i }) => ({ p, identity: identities[i] }));
  const kept: VisionDetectionProposal[] = [];
  const keptIdentities: Array<string | null> = [];
  const dropped: VisionDetectionProposal[] = [];
  const merges: DedupeMerge[] = [];
  for (const { p: candidate, identity } of ordered) {
    let duplicateOf: VisionDetectionProposal | null = null;
    let duplicateIou = 0;
    if (identity !== null) {
      for (let k = 0; k < kept.length; k += 1) {
        const existing = kept[k];
        if (keptIdentities[k] !== identity) continue;
        if (existing.kind !== candidate.kind) continue;
        if (candidate.kind === 'table') {
          // Schedule rows merge on identical text alone (see above).
          duplicateOf = existing;
          duplicateIou = 1;
          break;
        }
        if (existing.bbox === null || candidate.bbox === null) continue;
        const iou = bboxIou(existing.bbox, candidate.bbox);
        if (iou > iouThreshold) {
          duplicateOf = existing;
          duplicateIou = iou;
          break;
        }
      }
    }
    if (duplicateOf) {
      dropped.push(candidate);
      merges.push({
        kind: candidate.kind,
        label: candidate.label,
        keptConfidence: duplicateOf.confidence,
        droppedConfidence: candidate.confidence,
        iou: duplicateIou,
      });
    } else {
      kept.push(candidate);
      keptIdentities.push(identity);
    }
  }
  return { kept, dropped, merges };
}

/**
 * I11 Stage 5 (F14) — cap on identical NULL-BBOX proposals per
 * (kind, rawText, confidence) group on one page. On the KRS p1 live
 * read both focused-dimensions calls hit the 8K clamp and the
 * salvaged entries carried NO bbox (coverage 38% / 24%), so 115
 * identical `300` + 92 `1500` records survived: null-bbox proposals
 * skip the flood detector (`!p.bbox → return`) and cannot dedupe (no
 * bbox to compare), so the p1 count of 233 was not credible as an
 * instance count. The VALUES were grounded (hallucination 2/262) but
 * the multiplicities were not.
 *
 * Why 10: a genuine page rarely repeats the exact same dimension
 * value more than ~10 times with NO placement evidence at all
 * (bbox'd repeats are real — chains, grids — and are covered by the
 * grid detector + IoU dedupe instead); the flood cases run 92–115.
 * The cap keeps the FIRST 10 in proposal order and skips the rest as
 * `null-bbox-repetition-cap`. It applies to dimension + symbol kinds
 * only (the record-bearing kinds that COUNT); table rows dedupe by
 * text under F13, and text/legend proposals never become counted
 * records. Exported for tests.
 */
export const NULL_BBOX_REPETITION_CAP = 10;

/**
 * I11 Stage 5 (F14) — indices of proposals beyond the null-bbox
 * repetition cap, with the group key + total for the warning. A group
 * is (kind, rawText, confidence) over null-bbox dimension/symbol
 * proposals only. Exported for tests.
 */
export function nullBboxRepetitionCapIndices(
  proposals: VisionDetectionProposal[],
  cap: number = NULL_BBOX_REPETITION_CAP,
): Map<number, { key: string; total: number }> {
  const groups = new Map<string, number[]>();
  proposals.forEach((p, i) => {
    if ((p.kind !== 'dimension' && p.kind !== 'symbol') || p.bbox !== null) return;
    const key = `${p.kind}|${p.rawText}|${p.confidence}`;
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  });
  const capped = new Map<number, { key: string; total: number }>();
  for (const [key, indices] of groups) {
    if (indices.length <= cap) continue;
    for (const i of indices.slice(cap)) {
      capped.set(i, { key, total: indices.length });
    }
  }
  return capped;
}

/**
 * I11 Stage 5 (F9/F10) — size of an identical (kind, rawText,
 * confidence) group in ONE call's response that counts as runaway
 * repetition. The F9 flood was 123 identical symbols and the F10
 * flood 49 identical dimensions per call; a legitimate focused call
 * never returns 20+ IDENTICAL values at identical confidence (a dense
 * sheet yields many values, not many copies of one value).
 */
export const FOCUSED_RUNAWAY_GROUP_SIZE = 20;

/**
 * I11 Stage 5 (F9/F10) — does this single call's batch show runaway
 * repetition? Either (a) an identical (kind, rawText, confidence)
 * group of ≥ FOCUSED_RUNAWAY_GROUP_SIZE, or (b) a degenerate grid
 * flood (the F9/F10 signature) inside the batch. The caller
 * early-stops the NEXT tile's focused call for the same kind when
 * this returns true — the runaway batch itself still flows through
 * validation, where the flood detector + F14 cap bound it; the
 * early-stop only saves the next tile's wasted call.
 * Exported for tests.
 */
export function isRunawayBatch(proposals: VisionDetectionProposal[]): boolean {
  const groups = new Map<string, number>();
  for (const p of proposals) {
    if (p.kind !== 'dimension' && p.kind !== 'symbol') continue;
    const key = `${p.kind}|${p.rawText}|${p.confidence}`;
    const count = (groups.get(key) ?? 0) + 1;
    if (count >= FOCUSED_RUNAWAY_GROUP_SIZE) return true;
    groups.set(key, count);
  }
  return detectDegenerateFlood(proposals).size > 0;
}

/** Do two bboxes come within `maxGapPx` of each other (expanded-intersection test)? */
function bboxNear(a: BoundingBox, b: BoundingBox, maxGapPx: number): boolean {
  return (
    a.x - maxGapPx <= b.x + b.width &&
    b.x - maxGapPx <= a.x + a.width &&
    a.y - maxGapPx <= b.y + b.height &&
    b.y - maxGapPx <= a.y + a.height
  );
}

/**
 * I11 Stage 4 (E21) — labels that make a bare sub-100 integer
 * dimension-evident on their own: a unit word or a dimension word in the
 * proposal's label (`44 mm`, `tebal 44`, `frame 44`).
 */
const DIMENSION_EVIDENT_LABEL_RE =
  /\b(mm|cm|m|meter|dimensi|dimension|tebal|lebar|tinggi|panjang|ukuran|frame|kusen)\b/i;

/**
 * I11 Stage 5 (F12) — a bare size pair (`90 x 210`, `0.9 x 2.1`,
 * `120×150 cm`): two numbers joined by a separator, optionally with a
 * unit. This is the shape of a schedule row's size re-reported as a
 * dimension proposal — a labeled dimension (`TREAD - 0.25M`) or a
 * single value (`2100`) never matches.
 */
const SIZE_PAIR_RE = /^\d+(?:[.,]\d+)?\s*[Xx×]\s*\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?$/;

interface ScheduleRowIndexEntry {
  entry: ScheduleEntry;
  rawText: string;
  bbox: BoundingBox | null;
}

/**
 * I11 Stage 5 (F12) — does this dimension proposal re-report a
 * schedule row's size? The live model returns BOTH the table row AND
 * a dimension proposal for each schedule size (`90 x 210`), and the
 * pipeline had no cross-kind dedupe, so schedule sizes became phantom
 * dimension records (8 extras on id-jadwal-kusen p2). Two evidences,
 * either suffices:
 * (a) TEXT: the proposal is a bare size pair whose normalized text is
 *     contained in a same-page schedule row's normalized text
 *     (`90 X 210` inside `P1 | PINTU | 90 X 210 | ...`) — the
 *     dimension text IS the row's size substring.
 * (b) VALUE + PLACE: the proposal parses to exactly two values that
 *     equal a row's (widthMm, heightMm) pair (order-insensitive) AND
 *     its bbox overlaps the row's bbox — the same size re-read in a
 *     different surface form (`0.9 x 2.1` vs row `90 x 210`) at the
 *     same place.
 * Single values are never suppressed this way (a 2100 mm height
 * dimension is common on plans and is not a schedule re-report), and
 * a pair that matches no row on THIS page is kept. Returns the
 * matched row's mark for the warning, or null. The information
 * survives in the schedule entry — suppression loses no data, it
 * removes a duplicate.
 */
function scheduleRowDuplicatedBy(
  proposal: VisionDetectionProposal,
  records: DimensionRecord[],
  rows: ScheduleRowIndexEntry[],
): string | null {
  const dimText = normalizeIdentityText(proposal.rawText);
  const isPairShape = SIZE_PAIR_RE.test(proposal.rawText.trim());
  const values =
    records.length === 2
      ? records.map((r) => dimensionRecordToMm(r))
      : null;
  for (const row of rows) {
    if (isPairShape && normalizeIdentityText(row.rawText).includes(dimText)) {
      return row.entry.mark;
    }
    if (
      values !== null &&
      values[0] !== null &&
      values[1] !== null &&
      row.entry.widthMm != null &&
      row.entry.heightMm != null &&
      ((values[0] === row.entry.widthMm && values[1] === row.entry.heightMm) ||
        (values[0] === row.entry.heightMm && values[1] === row.entry.widthMm)) &&
      proposal.bbox !== null &&
      row.bbox !== null &&
      bboxIou(proposal.bbox, row.bbox) > 0
    ) {
      return row.entry.mark;
    }
  }
  return null;
}

/**
 * Validate deduped page-coordinate proposals through I2/I3/I5/I6.
 * Every proposal either becomes a record, becomes a skipped proposal with
 * a reason, or stays in the audit trail (non-scale legend entries and
 * free text notes — read, but with no record type and no failure).
 */
function validateProposals(
  proposals: VisionDetectionProposal[],
  ctx: {
    docHash: string;
    fileName: string;
    page: number;
    /** Page class (E8: structural-mark gating needs it). */
    drawingClass: DrawingPageClass;
    /** Sheet units note (E3: bare-decimal default unit, when stated). */
    sheetUnitsNote?: string | null;
    /** Full-page render width in px (E21: bbox-adjacency threshold). */
    pageWidthPx?: number;
  },
): ValidatedProposals {
  const dimensions: DimensionRecord[] = [];
  const occurrenceGroups = new Map<string, SymbolOccurrence>();
  const elementGroups = new Map<string, ElementOccurrence>();
  const scheduleEntries: ScheduleEntry[] = [];
  const statedScales: Array<{ scale: string; proposal: VisionDetectionProposal }> = [];
  const references: CrossSheetReference[] = [];
  const skipped: SkippedProposal[] = [];
  const warnings: string[] = [];

  /** Merge one element occurrence into its group (marked: by mark; unmarked: by type+page). */
  const addElementOccurrence = (occ: ElementOccurrence): void => {
    const key = occ.mark
      ? `m:${occ.category}:${normalizeMark(occ.mark)}`
      : `u:${occ.category}:${occ.elementType}:p${occ.page}`;
    const existing = elementGroups.get(key);
    if (!existing) {
      elementGroups.set(key, { ...occ, evidence: [...occ.evidence] });
      return;
    }
    existing.evidence.push(...occ.evidence);
    // Dims: first non-null per field wins; a disagreement is a review
    // matter for the record, not a merge failure (linkElementToSchedule
    // notes schedule-vs-text disagreements; same-source disagreements
    // keep the first value — the occurrences are the same element).
    if (existing.textDims || occ.textDims) {
      const a = existing.textDims ?? { lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null };
      const b = occ.textDims ?? { lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null };
      existing.textDims = {
        lengthMm: a.lengthMm ?? b.lengthMm,
        widthMm: a.widthMm ?? b.widthMm,
        heightMm: a.heightMm ?? b.heightMm,
        thicknessMm: a.thicknessMm ?? b.thicknessMm,
      };
    }
    if ((existing.diameterMm ?? null) === null) existing.diameterMm = occ.diameterMm ?? null;
  };

  /** Shape parsed dimension records into page records (shared by the main branch and the E21 second pass). */
  const addDimensionRecords = (
    proposal: VisionDetectionProposal,
    proposalIdx: number,
    records: DimensionRecord[],
  ): void => {
    const claimed = records.length === 1 ? modelClaimedMm(proposal.raw) : null;
    records.forEach((rec) => {
      const mm = dimensionRecordToMm(rec);
      let status = statusFromConfidence(Math.min(rec.confidence, proposal.confidence));
      let notes = rec.notes;
      if (claimed !== null && mm !== null && Math.abs(claimed - mm) > 1) {
        // The model's number disagrees with the deterministic parse of
        // its OWN verbatim text — the I2 value stands, the claim is
        // discarded, and the record drops to NEEDS_REVIEW.
        if (status === 'HIGH_CONFIDENCE') status = 'NEEDS_REVIEW';
        const note =
          `Model mengklaim ${claimed} (dibaca sebagai mm); parser I2 mengurai "${proposal.rawText}" menjadi ${mm} mm — klaim model dibuang.`;
        notes = notes ? `${notes}; ${note}` : note;
        warnings.push(
          `Dimensi "${proposal.rawText}" (hal. ${ctx.page}): klaim model ${claimed} ditolak — nilai I2 ${mm} mm yang dipakai.`,
        );
      }
      dimensions.push({
        ...rec,
        // I2 ids are deterministic per (page, kind, text, index) — two
        // identical texts on one page would collide, so the pipeline
        // suffixes the proposal ordinal (still deterministic).
        id: `${rec.id}-v${proposalIdx}`,
        region: proposal.bbox ? { ...proposal.bbox } : undefined,
        confidence: Math.min(rec.confidence, proposal.confidence),
        status,
        notes,
      });
    });
  };

  // I10b E1 — fragment-continuation pre-pass: a bare-integer dimension
  // proposal whose bbox abuts a same-page dimension proposal ending in
  // '.' (`3.` + `500`, `+3.` + `500`) is the TAIL of one CAD string
  // split across two detections — not a dimension. The head (`3.`) is
  // unparseable and skipped anyway; the tail must not become a false
  // 500 mm record. Requires bbox evidence: a proposal with no bbox
  // cannot be placed, so it is never guarded.
  const fragmentTails = new Set<number>();
  proposals.forEach((proposal, i) => {
    if (proposal.kind !== 'dimension' || !proposal.bbox) return;
    if (!/^\d+$/.test(proposal.rawText.trim())) return;
    for (let j = 0; j < proposals.length; j += 1) {
      if (j === i) continue;
      const head = proposals[j];
      if (head.kind !== 'dimension' || !head.bbox) continue;
      if (!/\.\s*$/.test(head.rawText.trim())) continue;
      if (bboxAbuts(head.bbox, proposal.bbox)) {
        fragmentTails.add(i);
        break;
      }
    }
  });

  // I11 Stage 3 (F9/F10) — degenerate-flood pre-pass: identical
  // low-confidence detections on a perfect grid are confabulation, not
  // readings. Flood members skip before any kind branch runs.
  const floodIndices = detectDegenerateFlood(proposals);

  // I11 Stage 5 (F14) — null-bbox repetition cap pre-pass: identical
  // null-bbox proposals beyond the cap skip before any kind branch
  // runs (they carry no placement evidence, so neither the flood
  // detector nor IoU dedupe can bound them).
  const cappedIndices = nullBboxRepetitionCapIndices(proposals);
  const cappedWarnings = new Set<string>();

  // I11 Stage 5 (F12) — schedule-row index for the cross-kind check:
  // every table proposal on this page that parses into a schedule
  // entry, with its verbatim row text + bbox. Built BEFORE the main
  // loop because a dimension proposal may precede its row in proposal
  // order. parseScheduleRow is pure, so the main loop's own table
  // branch re-parses the same rows idempotently.
  const scheduleRowIndex: ScheduleRowIndexEntry[] = [];
  for (const proposal of proposals) {
    if (proposal.kind !== 'table') continue;
    const entry = parseScheduleRow(proposal.rawText, ctx.page);
    if (entry) scheduleRowIndex.push({ entry, rawText: proposal.rawText, bbox: proposal.bbox });
  }

  // I11 Stage 4 (E21) — bare sub-100 integer dimension proposals that
  // failed the plain parse are held for the second pass below (after
  // the main loop, when validated dimensions exist for adjacency).
  const bareSmallCandidates: Array<{ proposal: VisionDetectionProposal; proposalIdx: number }> = [];

  proposals.forEach((proposal, proposalIdx) => {
    const skip = (reason: string): void => {
      skipped.push({ kind: proposal.kind, label: proposal.label, rawText: proposal.rawText, reason });
    };

    if (floodIndices.has(proposalIdx)) {
      skip('degenerate-grid-confabulation');
      warnings.push(
        `"${proposal.rawText}" (hal. ${ctx.page}) bagian dari pola kisi identik berulang — dibaca sebagai halusinasi model, bukan deteksi.`,
      );
      return;
    }

    const capped = cappedIndices.get(proposalIdx);
    if (capped) {
      skip('null-bbox-repetition-cap');
      // One warning per group, not one per dropped copy (a flood can
      // carry a hundred copies of one value).
      if (!cappedWarnings.has(capped.key)) {
        cappedWarnings.add(capped.key);
        warnings.push(
          `"${proposal.rawText}" (hal. ${ctx.page}): ${capped.total} deteksi identik tanpa bbox — hanya ${NULL_BBOX_REPETITION_CAP} pertama yang dipakai (batas pengulangan F14).`,
        );
      }
      return;
    }

    if (proposal.kind === 'dimension') {
      if (fragmentTails.has(proposalIdx)) {
        skip('dimension-fragment-continuation');
        warnings.push(
          `Dimensi "${proposal.rawText}" (hal. ${ctx.page}) berbatasan dengan fragmen yang berakhir titik — dibaca sebagai kelanjutan angka yang terbelah, bukan dimensi.`,
        );
        return;
      }
      const associatedElement =
        markFromLabel(proposal.label, proposal.rawText) ?? undefined;
      const records = parseDimensionList(proposal.rawText, {
        page: ctx.page,
        associatedElement,
        sheetUnitsNote: ctx.sheetUnitsNote ?? undefined,
        // I11 Stage 4 (E18): the proposal label may evidence the kind
        // (OVERALL vs CHAINED). Only LINEAR records are re-kind-ed.
        labelHint: proposal.label,
      });
      if (records.length === 0) {
        // I11 Stage 4 (E21): hold bare integers in [10, 99] for the
        // second pass — they may be dimensions in a dimension-evident
        // context (a label naming a dimension, or a parsed dimension
        // nearby). Everything else skips now, as before.
        const bare = /^\d+$/.test(proposal.rawText.trim())
          ? Number(proposal.rawText.trim())
          : null;
        if (bare !== null && bare >= 10 && bare < 100) {
          bareSmallCandidates.push({ proposal, proposalIdx });
          return;
        }
        skip('dimension-unparseable');
        warnings.push(
          `Dimensi "${proposal.rawText}" (hal. ${ctx.page}) tidak dapat diuraikan parser I2 — diabaikan, bukan ditebak.`,
        );
        return;
      }
      // I11 Stage 5 (F12) — a dimension proposal that re-reports a
      // schedule row's size is the same text twice, not a dimension:
      // skip it (the size survives in the schedule entry).
      const duplicatedRowMark = scheduleRowDuplicatedBy(proposal, records, scheduleRowIndex);
      if (duplicatedRowMark !== null) {
        skip('dimension-duplicates-schedule-row');
        warnings.push(
          `Dimensi "${proposal.rawText}" (hal. ${ctx.page}) mengulang ukuran baris jadwal ${duplicatedRowMark} — diabaikan, bukan dihitung dua kali.`,
        );
        return;
      }
      addDimensionRecords(proposal, proposalIdx, records);
      return;
    }

    if (proposal.kind === 'symbol') {
      const label = cleanSymbolLabel(proposal.label);
      const rawText = proposal.rawText;
      // I11 Stage 4 (E16) — STRUCTURAL path first: a structural keyword
      // anywhere, or a structural mark/letter on a structural page,
      // becomes an ELEMENT record. I8 skipped these
      // (`structural-symbol-no-record-type`) because no record type
      // existed; the type exists now, so the skip is retired for
      // symbols that resolve to an element.
      const structuralKeyword = isStructuralSymbol(label, rawText);
      const structuralMark =
        isStructuralPageClass(ctx.drawingClass) &&
        (isStructuralMark(label) || isStructuralLetterMark(label));
      if (structuralKeyword || structuralMark) {
        const inferred = inferElement(label, rawText);
        const type =
          inferred ??
          structuralTypeFromMarkLetter(label, rawText) ??
          structuralTypeFromKeyword(label, rawText);
        if (!type) {
          // Defensive: unreachable — entry requires a keyword or a
          // mark letter, and both fallbacks resolve a type from those.
          skip('structural-symbol-no-record-type');
          return;
        }
        const mark =
          elementMarkFromText(`${label} ${rawText}`) ??
          (isStructuralLetterMark(label) ? normalizeMark(label) : null) ??
          (isStructuralMark(label) ? normalizeMark(label) : null);
        const evidence = evidenceForProposal(ctx.docHash, ctx.fileName, proposal, 'SYMBOL', proposalIdx);
        addElementOccurrence({
          category: type.category,
          elementType: type.elementType,
          mark,
          page: ctx.page,
          diameterMm: diameterFromMark(mark),
          evidence: [evidence],
        });
        return;
      }
      // I10b E4 — letter-only marks (D, MD, W) qualify when an opening
      // keyword is present; digit marks (D1, PJ1) qualify as before.
      // I11 Stage 4 (F8/F11): `markFromLabel` also takes the raw text
      // alone and a bare letter-only label in symbol context.
      const mark = markFromLabel(label, rawText, { symbolContext: true });
      const kind = inferOpeningKind(label, rawText);
      if (mark === null && kind === null) {
        skip('symbol-not-an-opening');
        return;
      }
      // A mark-like label with no opening keyword is still an opening
      // candidate (marks are project-defined; the schedule link decides
      // what it is). A keyword without a mark cannot be linked or
      // counted — it has no OpeningRecord identity.
      if (mark === null) {
        skip('symbol-unmarked');
        return;
      }
      const evidence = evidenceForProposal(ctx.docHash, ctx.fileName, proposal, 'SYMBOL', proposalIdx);
      const existing = occurrenceGroups.get(mark);
      if (existing) {
        existing.evidence.push(evidence);
      } else {
        occurrenceGroups.set(mark, {
          mark,
          elementType: kind ?? 'other-opening',
          page: ctx.page,
          evidence: [evidence],
        });
      }
      return;
    }

    if (proposal.kind === 'table') {
      const entry = parseScheduleRow(proposal.rawText, ctx.page);
      if (!entry) {
        skip('schedule-row-unparseable');
        return;
      }
      scheduleEntries.push(entry);
      return;
    }

    if (proposal.kind === 'legend') {
      const scale = parseStatedScale(proposal.rawText);
      if (scale) statedScales.push({ scale, proposal });
      // Non-scale legend entries (titles, notes) are read but have no
      // record type in I8 — they stay in the proposals audit trail.
      return;
    }

    if (proposal.kind === 'text') {
      for (const pattern of REF_PATTERNS) {
        const m = proposal.rawText.match(pattern.re);
        if (m) {
          const ref = pattern.refOf(m);
          if (ref !== '') {
            references.push({
              from: { page: ctx.page, ref: proposal.rawText },
              to: { page: null, ref },
              kind: pattern.kind,
              status: 'UNRESOLVED',
              evidence: [evidenceForProposal(ctx.docHash, ctx.fileName, proposal, 'NOTE', proposalIdx)],
            });
          }
          return;
        }
      }
      // Free text with no reference pattern — audit trail only.
      return;
    }

    if (proposal.kind === 'object') {
      // I11 Stage 4 (E16) — an object proposal with an element keyword
      // becomes an ELEMENT record (wall, roof, SDA, civil, structural).
      // Its label text may carry its own dims (`Dinding luar 7.000 x
      // 3.500`) — parsed by elementDimsFromText (a dimension-evident
      // context: the text IS the element's description). A room name
      // (`RUANG TAMU`) or any object without an element keyword still
      // has no record type and skips, as before.
      const inferred = inferElement(proposal.label, proposal.rawText);
      if (!inferred) {
        skip('object-no-record-type');
        return;
      }
      const mark = elementMarkFromText(`${proposal.label} ${proposal.rawText}`);
      const textDims = elementDimsFromText(proposal.rawText, inferred.category);
      const evidence = evidenceForProposal(ctx.docHash, ctx.fileName, proposal, 'SYMBOL', proposalIdx);
      addElementOccurrence({
        category: inferred.category,
        elementType: inferred.elementType,
        mark,
        page: ctx.page,
        textDims,
        diameterMm: diameterFromMark(mark),
        evidence: [evidence],
      });
      return;
    }

    // Unknown kinds (the parser should never emit them) — audit trail
    // only; the proposal is recorded in `proposals`, not dropped.
    skip('object-no-record-type');
  });

  // I11 Stage 4 (E21) — second pass for bare sub-100 integers. A
  // candidate becomes a dimension ONLY in a dimension-evident context:
  // (i) its label names a dimension (a unit or dimension word), or
  // (ii) its bbox sits near (gap ≤ 10% of page width) a dimension that
  // parsed successfully on this page. Otherwise it skips exactly as it
  // did before E21 — the fail-closed default that keeps
  // `dim-negatives-zero-fp` green.
  const adjacencyPx = (ctx.pageWidthPx ?? 1000) * 0.1;
  for (const { proposal, proposalIdx } of bareSmallCandidates) {
    const labelEvident = DIMENSION_EVIDENT_LABEL_RE.test(proposal.label);
    const nearDimension =
      proposal.bbox !== undefined &&
      dimensions.some((d) => d.region !== undefined && bboxNear(proposal.bbox!, d.region, adjacencyPx));
    if (labelEvident || nearDimension) {
      const records = parseDimensionList(proposal.rawText, {
        page: ctx.page,
        dimensionEvident: true,
        sheetUnitsNote: ctx.sheetUnitsNote ?? undefined,
        labelHint: proposal.label,
      });
      if (records.length > 0) {
        addDimensionRecords(proposal, proposalIdx, records);
        continue;
      }
    }
    skipped.push({
      kind: proposal.kind,
      label: proposal.label,
      rawText: proposal.rawText,
      reason: 'dimension-unparseable',
    });
    warnings.push(
      `Dimensi "${proposal.rawText}" (hal. ${ctx.page}) tidak dapat diuraikan parser I2 — diabaikan, bukan ditebak.`,
    );
  }

  return {
    dimensions,
    occurrences: [...occurrenceGroups.values()],
    elementOccurrences: [...elementGroups.values()],
    scheduleEntries,
    statedScales,
    references,
    skipped,
    warnings,
  };
}

/** Link one page's symbol occurrences to the schedule via I3. Quantity = occurrence count on this page. */
function linkPageOpenings(
  occurrences: SymbolOccurrence[],
  schedule: ScheduleEntry[],
): OpeningRecord[] {
  return occurrences.map((occ) => {
    const linked = linkOpeningToSchedule(
      {
        mark: occ.mark,
        elementType: occ.elementType,
        sourcePages: [occ.page],
        evidence: occ.evidence,
      },
      schedule,
    );
    // linkOpeningToSchedule sets quantity 1 (one input opening); the
    // occurrence count is the evidence count for this mark on this page.
    return { ...linked, quantity: occ.evidence.length };
  });
}

/** Link one page's element occurrences to the schedule via I3. Quantity = occurrence count on this page. */
function linkPageElements(
  occurrences: ElementOccurrence[],
  schedule: ScheduleEntry[],
  dimensions: DimensionRecord[],
): ElementRecord[] {
  return occurrences.map((occ) => {
    // Same-page dimension association: a section-PAIR record whose
    // associatedElement matches the mark supplies width/height when
    // neither the schedule nor the label text did (`K1` + a `15/30`
    // dimension on the same page). Only PAIRS are applied — a single
    // LINEAR value's role (length vs width vs height) is unknowable.
    let textDims = occ.textDims;
    if (occ.mark) {
      const pairDims = dimensions.filter(
        (d) =>
          d.associatedElement !== undefined &&
          normalizeMark(d.associatedElement) === normalizeMark(occ.mark!) &&
          d.kind === 'LINEAR' &&
          (d.notes ?? '').startsWith('pair:'),
      );
      if (
        pairDims.length >= 2 &&
        (textDims?.widthMm == null || textDims?.heightMm == null)
      ) {
        const w = dimensionRecordToMm(pairDims[0]);
        const h = dimensionRecordToMm(pairDims[1]);
        if (w !== null && h !== null) {
          textDims = {
            lengthMm: textDims?.lengthMm ?? null,
            widthMm: textDims?.widthMm ?? w,
            heightMm: textDims?.heightMm ?? h,
            thicknessMm: textDims?.thicknessMm ?? null,
          };
        }
      }
    }
    const linked = linkElementToSchedule(
      {
        category: occ.category,
        elementType: occ.elementType,
        mark: occ.mark,
        quantity: occ.evidence.length,
        sourcePages: [occ.page],
        evidence: occ.evidence,
        textDims,
        diameterMm: occ.diameterMm,
      },
      schedule,
    );
    return linked;
  });
}

function safeMark(mark: string): string {
  const slug = mark.replace(/[^A-Za-z0-9_-]/g, '-');
  return slug === '' ? 'x' : slug;
}

/** COUNT quantities (I4) — one per opening record, from the evidenced occurrence count. */
function quantitiesForOpenings(openings: OpeningRecord[], page: number): GeometryQuantity[] {
  return openings.map((o) =>
    qtoCount(o.quantity, {
      id: `qto-count-p${page}-${safeMark(o.mark)}`,
      sourcePages: o.sourcePages,
      evidence: o.evidence,
      confidence: o.confidence,
    }),
  );
}

/** I11 Stage 4 (E17) — geometry quantities for one page's elements (COUNT + area/volume). */
function quantitiesForElements(
  elements: ElementRecord[],
  openings: OpeningRecord[],
  page: number,
): GeometryQuantity[] {
  return elements.flatMap((el) => quantitiesForElement(el, openings, page));
}

function aggregatePageStatus(
  dimensions: DimensionRecord[],
  openings: OpeningRecord[],
  quantities: GeometryQuantity[],
  elements: ElementRecord[] = [],
): VisionReviewStatus {
  const all: VisionReviewStatus[] = [
    ...dimensions.map((d) => d.status),
    ...openings.map((o) => o.status),
    ...quantities.map((q) => q.status),
    ...elements.map((e) => e.status),
  ];
  if (all.length === 0) return 'UNRESOLVED';
  if (all.includes('CONFLICT')) return 'CONFLICT';
  if (all.includes('HIGH_CONFIDENCE')) return 'HIGH_CONFIDENCE';
  if (all.includes('NEEDS_REVIEW')) return 'NEEDS_REVIEW';
  return 'UNRESOLVED';
}

/** DETAIL escalation rule: exactly one focused re-pass when the first pass leaves UNRESOLVED/CONFLICT records — or validated nothing at all from visible proposals. Zero proposals means nothing was seen; a re-pass cannot help. */
function pageNeedsDetail(
  dimensions: DimensionRecord[],
  openings: OpeningRecord[],
  quantities: GeometryQuantity[],
  proposalCount: number,
  elements: ElementRecord[] = [],
): boolean {
  if (proposalCount === 0) return false;
  const hasUnresolved = [...dimensions, ...openings, ...quantities, ...elements].some(
    (r) => r.status === 'UNRESOLVED' || r.status === 'CONFLICT',
  );
  const nothingValidated =
    dimensions.length === 0 && openings.length === 0 && quantities.length === 0 && elements.length === 0;
  return hasUnresolved || nothingValidated;
}

// ---------------------------------------------------------------------------
// Focused completion (I11 Stage 3, fix 2) — text-layer gap evidence
// ---------------------------------------------------------------------------

/** Focused completion kinds: the three record-bearing focused prompts. */
export type VisionFocusKind = 'dimensions' | 'symbols' | 'tables';

/** roiId segment for a focused completion pass (`<base>:focus-<kind>`). */
export function focusRoiId(baseRoiId: string, kind: VisionFocusKind): string {
  return `${baseRoiId}:focus-${kind}`;
}

/**
 * Strip leading/trailing punctuation from a text-layer token before
 * testing it — EXCEPT `"` and `'`, which are dimension-significant
 * (`2"` is 2 inches; stripping the quote would destroy the evidence).
 * The caller tries the token as-is FIRST and the stripped form second,
 * so a token that parses as-is never depends on the strip.
 */
function stripTokenPunctuation(token: string): string {
  return token.replace(/^[^A-Za-z0-9"']+|[^A-Za-z0-9"']+$/g, '');
}

/**
 * Does the page's native text layer contain a token the I2 parser reads
 * as a dimension? Uses the SAME parser that validates proposals, so
 * evidence and validation agree: a note number (`1.`) does NOT parse
 * (no evidence), while `3.05`, `2"`, `15/30`, `+3.500` do. A bare
 * integer ≥ 100 parses as mm — that is I2's documented rule, so a
 * text layer full of bare counts (e.g. a quantity table) can evidence
 * dimensions; the gap trigger pairs this with "the survey validated
 * zero dimensions", so the cost of a false positive is one focused
 * call, never a false record.
 */
export function textLayerEvidencesDimensions(text: string): boolean {
  for (const token of text.split(/\s+/)) {
    if (token === '') continue;
    if (parseDimensionToken(token, {}) !== null) return true;
    const stripped = stripTokenPunctuation(token);
    if (stripped !== token && stripped !== '' && parseDimensionToken(stripped, {}) !== null) return true;
  }
  return false;
}

/**
 * Does the text layer contain an UPPERCASE mark token (`D1`, `K1`,
 * `W1`)? Drawing marks are uppercase identifiers by convention — a
 * lowercase token (`d1`, `m2`) in running text is a word fragment or
 * a unit, not a mark, so it is NOT evidence. (The OCR router's
 * isMarkLikeText is case-insensitive because OCR spans are short codes,
 * not running text — a different context with a different rule.)
 */
export function textLayerEvidencesMarks(text: string): boolean {
  const markRe = /^[A-Z]{1,3}-?\d{1,3}$/;
  for (const token of text.split(/\s+/)) {
    if (token === '') continue;
    if (markRe.test(token)) return true;
    const stripped = stripTokenPunctuation(token);
    if (stripped !== token && stripped !== '' && markRe.test(stripped)) return true;
  }
  return false;
}

/**
 * Does the text layer contain a schedule-row-like LINE (a mark plus a
 * dimension pair, or a pipe-joined row carrying a mark)? Line-scoped:
 * a mark on one line and a pair on another is NOT a row. Reuses the
 * OCR router's isScheduleRowLikeText — the same rule that shapes OCR
 * spans into table candidates.
 */
export function textLayerEvidencesScheduleRows(text: string): boolean {
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() !== '' && isScheduleRowLikeText(line)) return true;
  }
  return false;
}

function scaleFromStated(
  page: number,
  statedScale: string | null,
  evidence: EvidenceRecord[],
): ScaleCalibration | null {
  if (!statedScale) return null;
  return {
    page,
    statedScale,
    method: 'STATED_ONLY',
    calibratedFrom: null,
    verified: false,
    uncertaintyPct: null,
    // Stated, not verified: NEEDS_REVIEW. A stated scale is a claim from
    // the drawing, not a verified measurement.
    status: 'NEEDS_REVIEW',
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Cached analyze — one call site for every provider call in the pipeline
// ---------------------------------------------------------------------------

type AnalyzeOutcome =
  | { kind: 'ok'; result: VisionParseResult; fromCache: boolean }
  | { kind: 'budget' };

async function analyzeCached(args: {
  client: VisionClient;
  cache: VisionCache<VisionParseResult> | undefined;
  docHash: string;
  page: number;
  /** ROI id segment of the cache key — includes the pass kind (':detail' for re-passes). */
  roiId: string;
  prompt: string;
  image: RenderedPageImage;
  budget: VisionCallBudget;
  cost: VisionPageCost;
}): Promise<AnalyzeOutcome> {
  const key = visionCacheKey({
    docHash: args.docHash,
    page: args.page,
    roiId: args.roiId,
    promptVersion: VISION_PROMPT_VERSION,
    modelVersion: VISION_MODEL_VERSION,
  });
  if (args.cache) {
    const cached = args.cache.get(key);
    if (cached.hit) {
      args.cost.cacheHits += 1;
      return { kind: 'ok', result: cached.entry.result, fromCache: true };
    }
  }
  if (args.budget.used >= args.budget.max) return { kind: 'budget' };
  args.budget.used += 1;
  args.cost.calls += 1;
  args.cost.bytesSent += args.image.base64Length;
  const result = await args.client.analyze({
    imageDataUrl: args.image.dataUrl,
    prompt: args.prompt,
    page: args.page,
    imageWidthPx: args.image.widthPx,
    imageHeightPx: args.image.heightPx,
    roiId: args.roiId,
  });
  args.cache?.set(key, result);
  return { kind: 'ok', result, fromCache: false };
}

// ---------------------------------------------------------------------------
// Cached OCR analyze — I9: the scanned-page first pass
// ---------------------------------------------------------------------------

type AnalyzeOcrOutcome =
  | {
      kind: 'ok';
      /** Spans in SENT-IMAGE coordinates — the caller translates them to page coordinates. */
      spans: OcrTextSpan[];
      droppedCount: number;
      warnings: string[];
      /** True when the OCR read was truncated mid-JSON (salvaged partial read). */
      truncated: boolean;
      fromCache: boolean;
    }
  | { kind: 'budget' };

/**
 * I9 — one OCR read through the cache + budget, mirroring analyzeCached.
 * Differences (all deliberate):
 * - The prompt is the OCR prompt and the parser is parseOcrResponse —
 *   the VisionClient only parses survey-style `detections`, so the OCR
 *   path calls the injected responder directly (same seam, same
 *   transport) after running the size guard itself.
 * - The size guard runs BEFORE the budget is spent: an oversize image
 *   never reached the provider, so it must not consume the call cap.
 * - The cached VALUE is a VisionParseResult whose proposals carry the
 *   spans in `raw` (ocrSpansToProposals) — the pipeline cache is typed
 *   VisionCache<VisionParseResult>, so spans ride inside proposals.
 *   On a cache hit the spans are recovered via ocrSpansFromProposals;
 *   unrecoverable proposals are counted as dropped, never reconstructed.
 * - The roiId carries the `:ocr:` pass segment (OCR_ROI_ID /
 *   ocrTileRoiId), so OCR entries never collide with survey/detail
 *   entries for the same page.
 */
async function analyzeOcrCached(args: {
  responder: VisionResponder;
  cache: VisionCache<VisionParseResult> | undefined;
  docHash: string;
  page: number;
  /** OCR roiId — includes the `:ocr:` pass segment + OCR prompt version. */
  roiId: string;
  prompt: string;
  image: RenderedPageImage;
  budget: VisionCallBudget;
  cost: VisionPageCost;
}): Promise<AnalyzeOcrOutcome> {
  const key = visionCacheKey({
    docHash: args.docHash,
    page: args.page,
    roiId: args.roiId,
    promptVersion: VISION_PROMPT_VERSION,
    modelVersion: VISION_MODEL_VERSION,
  });
  if (args.cache) {
    const cached = args.cache.get(key);
    if (cached.hit) {
      args.cost.cacheHits += 1;
      const recovered = ocrSpansFromProposals(cached.entry.result.proposals);
      const warnings = [...cached.entry.result.warnings];
      if (recovered.unrecoverable > 0) {
        warnings.push(
          `${recovered.unrecoverable} cached OCR proposal(s) carried no recoverable span — dropped, never reconstructed.`,
        );
      }
      return {
        kind: 'ok',
        spans: recovered.spans,
        droppedCount: cached.entry.result.droppedCount + recovered.unrecoverable,
        warnings,
        truncated: cached.entry.result.truncated === true,
        fromCache: true,
      };
    }
  }
  if (args.budget.used >= args.budget.max) return { kind: 'budget' };
  assertVisionImageSize(args.image.dataUrl);
  args.budget.used += 1;
  args.cost.calls += 1;
  args.cost.bytesSent += args.image.base64Length;
  const response = await args.responder({
    imageDataUrl: args.image.dataUrl,
    prompt: args.prompt,
  });
  const parsed = parseOcrResponse(response.content, {
    page: args.page,
    imageWidthPx: args.image.widthPx,
    imageHeightPx: args.image.heightPx,
  });
  const proposals = ocrSpansToProposals(parsed.spans, { page: args.page, roiId: args.roiId });
  args.cache?.set(key, {
    proposals,
    droppedCount: parsed.droppedCount,
    warnings: parsed.warnings,
    status: parsed.status,
    truncated: parsed.truncated,
  });
  return {
    kind: 'ok',
    spans: parsed.spans,
    droppedCount: parsed.droppedCount,
    warnings: parsed.warnings,
    truncated: parsed.truncated,
    fromCache: false,
  };
}

// ---------------------------------------------------------------------------
// runVisionPage — one page, end to end
// ---------------------------------------------------------------------------

export interface RunVisionPageInput extends VisionPageInput {
  docHash: string;
  mode: DedRabAiMode;
  responder: VisionResponder;
  renderPage: VisionRenderPage;
  cache?: VisionCache<VisionParseResult>;
  /** Shared document budget (mutated as calls are made). */
  budget: VisionCallBudget;
  maxTilesPerPage?: number;
  ahspMatcher?: VisionAhspMatcher;
}

export async function runVisionPage(input: RunVisionPageInput): Promise<VisionPageResult> {
  const warnings: string[] = [];
  const cost: VisionPageCost = { calls: 0, bytesSent: 0, cacheHits: 0 };
  const client = new VisionClient(input.responder);
  const fileName = input.fileName ?? '';
  const schedule = input.schedule ?? [];
  // I9 — OCR state for this page. baseResult reads these at call time,
  // so every return (including early policy/budget exits) carries them:
  // [] / false for text-layer pages and for pages whose OCR pass never
  // completed, the deduped spans / true once an OCR read lands.
  let ocrSpans: OcrTextSpan[] = [];
  let ocrPass = false;
  // I11 Stage 3, fix 1 — set when ANY read for this page truncates
  // mid-JSON (survey, OCR, DETAIL, or focused). baseResult reads it at
  // call time, so every return (including early exits) carries it.
  let partialRead = false;
  // I11 Stage 3, fix 2 — focused completion passes run for this page.
  const focusPasses: string[] = [];
  const emptyAhsp: VisionAhspOutcome = {
    attempted: false,
    enrichedCount: 0,
    skippedReason: null,
    matches: [],
  };

  // 1. Classify FIRST, from native text + title (I1). Scanned pages have
  //    no text layer: classifyDrawingPage ignores `text` then, so a scanned
  //    page starts UNKNOWN and is re-classified from the survey below.
  let classification = classifyDrawingPage({
    page: input.page,
    title: input.title,
    text: input.text,
    hasTextLayer: input.hasTextLayer,
  });
  let policy = visionPolicyForClass(classification.drawingClass);

  // Stated scale from the native text layer is free and deterministic —
  // it outranks a vision legend read (native text is ground truth).
  const textScale = input.hasTextLayer ? parseStatedScale(input.text ?? '') : null;
  // I10b E3 — a sheet units note ("ALL DIMENSION ARE IN METER") is the
  // evidenced default unit for bare-decimal dimensions on this page.
  // Native text only: a scanned page's note lives in OCR spans, which
  // validateProposals does not see as text (recorded limitation).
  const sheetUnitsNote = input.hasTextLayer
    ? parseSheetUnitsNote(input.text ?? '')
    : null;
  const textScaleEvidence: EvidenceRecord[] = textScale
    ? [
        {
          id: `EV-p${input.page}-text-scale`,
          sourceDocumentId: input.docHash,
          sourceFileName: fileName,
          pageNumber: input.page,
          type: 'TITLE_BLOCK',
          content: textScale,
          confidence: 1,
        },
      ]
    : [];

  const baseResult = (
    overrides: Partial<VisionPageResult>,
  ): VisionPageResult => ({
    page: input.page,
    classification,
    policy,
    renderDecision: { mode: 'none', scale: 1, tiles: [], reason: 'No vision read attempted.' },
    dimensions: [],
    openings: [],
    elements: [],
    quantities: [],
    references: [],
    scale: scaleFromStated(input.page, textScale, textScaleEvidence),
    scheduleEntries: [],
    proposals: [],
    ocrSpans,
    ocrPass,
    skippedProposals: [],
    droppedProposalCount: 0,
    dedupeMerges: 0,
    cacheHit: false,
    cost,
    status: classification.status,
    skippedReason: null,
    ahsp: emptyAhsp,
    detailPass: false,
    partialRead,
    focusPasses,
    warnings,
    ...overrides,
  });

  // 2. Policy gate — 'none' pages cost zero calls.
  if (policy === 'none') {
    warnings.push(
      `Hal. ${input.page} (${classification.drawingClass}): kebijakan kelas 'none' — tidak ada panggilan vision.`,
    );
    return baseResult({ skippedReason: 'policy', status: classification.status });
  }

  // 3. Budget gate — the cap stops the page before any render/call.
  if (input.budget.used >= input.budget.max) {
    warnings.push(
      `Hal. ${input.page}: anggaran panggilan vision habis (${input.budget.used}/${input.budget.max}) — halaman dicatat NOT_DETECTED.`,
    );
    return baseResult({ skippedReason: 'budget', status: 'NOT_DETECTED' });
  }

  // 4. Render decision from the measured base64 length (+ text density).
  const decision = decideVisionRender({
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    base64Length: input.base64Length,
    maxTilesPerPage: input.maxTilesPerPage,
    textChars: (input.text ?? '').length,
  });

  // 5. FAST first pass — survey (one call per tile, or one for the page).
  //    I9: for scanned pages the first pass IS the OCR pass (OCR-AS-SURVEY —
  //    see the module header). Text-layer pages are unchanged: no OCR call.
  const isScanned = !input.hasTextLayer;
  const surveyed: VisionDetectionProposal[] = [];
  /** OCR spans in PAGE coordinates (translated per read, deduped in step 5b). */
  const ocrCollected: OcrTextSpan[] = [];
  let droppedProposalCount = 0;
  // Counts first-pass reads of EITHER kind (survey reads + OCR reads).
  let surveyReads = 0;
  let surveyBudgetHit = false;

  const surveyOne = async (args: {
    image: RenderedPageImage;
    roiId: string;
    /** Map each proposal's bbox from rendered-image pixels to full-page pixels (tile translation or downscale rescale). */
    toPage: (p: VisionDetectionProposal) => VisionDetectionProposal;
    label: string;
  }): Promise<boolean> => {
    const prompt = buildPageSurveyPrompt({
      page: input.page,
      imageWidthPx: args.image.widthPx,
      imageHeightPx: args.image.heightPx,
      drawingClass: classification.drawingClass,
    });
    try {
      const outcome = await analyzeCached({
        client,
        cache: input.cache,
        docHash: input.docHash,
        page: input.page,
        roiId: args.roiId,
        prompt,
        image: args.image,
        budget: input.budget,
        cost,
      });
      if (outcome.kind === 'budget') {
        surveyBudgetHit = true;
        warnings.push(`Hal. ${input.page}: anggaran panggilan vision habis di tengah survei (${args.label}).`);
        return false;
      }
      surveyReads += 1;
      droppedProposalCount += outcome.result.droppedCount;
      if (outcome.result.truncated) partialRead = true;
      warnings.push(...outcome.result.warnings);
      for (const p of outcome.result.proposals) {
        surveyed.push(args.toPage(p));
      }
      return true;
    } catch (e) {
      warnings.push(
        `Survei vision gagal di hal. ${input.page} (${args.label}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  };

  // I9 — one OCR read (scanned pages only). Mirrors surveyOne: the same
  // budget, cache, and responder seam; spans are translated to page
  // coordinates by the caller-supplied toPage before they are collected.
  // ocrPass flips true on the first completed OCR read (call OR cache
  // hit) — a budget-hit or failed read leaves it false, honestly.
  const ocrOne = async (args: {
    image: RenderedPageImage;
    roiId: string;
    /** Map each span's bbox from rendered-image pixels to full-page pixels (tile translation or downscale rescale). */
    toPage: (s: OcrTextSpan) => OcrTextSpan;
    label: string;
  }): Promise<boolean> => {
    const prompt = buildOcrPrompt({
      page: input.page,
      imageWidthPx: args.image.widthPx,
      imageHeightPx: args.image.heightPx,
      drawingClass: classification.drawingClass,
    });
    try {
      const outcome = await analyzeOcrCached({
        responder: input.responder,
        cache: input.cache,
        docHash: input.docHash,
        page: input.page,
        roiId: args.roiId,
        prompt,
        image: args.image,
        budget: input.budget,
        cost,
      });
      if (outcome.kind === 'budget') {
        surveyBudgetHit = true;
        warnings.push(`Hal. ${input.page}: anggaran panggilan vision habis di tengah pembacaan OCR (${args.label}).`);
        return false;
      }
      surveyReads += 1;
      ocrPass = true;
      droppedProposalCount += outcome.droppedCount;
      if (outcome.truncated) partialRead = true;
      warnings.push(...outcome.warnings);
      for (const s of outcome.spans) {
        ocrCollected.push(args.toPage(s));
      }
      return true;
    } catch (e) {
      warnings.push(
        `Pembacaan OCR gagal di hal. ${input.page} (${args.label}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  };

  if (decision.mode === 'single') {
    try {
      const image = await input.renderPage({ page: input.page, scale: decision.scale });
      if (isScanned) {
        await ocrOne({
          image,
          roiId: OCR_ROI_ID,
          // A downscaled render reports bboxes in downscaled pixels —
          // rescale them to full-page pixels before they become evidence.
          toPage: (s) =>
            s.bbox
              ? { ...s, bbox: rescaleBboxToPage(s.bbox, image.widthPx, image.heightPx, input.widthPx, input.heightPx) }
              : s,
          label: 'full page',
        });
      } else {
        await surveyOne({
          image,
          roiId: 'full',
          // A downscaled render reports bboxes in downscaled pixels —
          // rescale them to full-page pixels before they become evidence.
          toPage: (p) =>
            p.bbox
              ? { ...p, bbox: rescaleBboxToPage(p.bbox, image.widthPx, image.heightPx, input.widthPx, input.heightPx) }
              : p,
          label: 'full page',
        });
      }
    } catch (e) {
      warnings.push(
        `Render hal. ${input.page} gagal: ${e instanceof Error ? e.message : String(e)}`,
      );
      return baseResult({
        renderDecision: decision,
        skippedReason: 'render',
        status: 'UNRESOLVED',
        droppedProposalCount,
      });
    }
  } else {
    for (const tile of decision.tiles) {
      if (surveyBudgetHit) break;
      try {
        const image = await input.renderPage({ page: input.page, roi: tile.bbox });
        if (isScanned) {
          await ocrOne({
            image,
            roiId: ocrTileRoiId(roiIdFor(tile.bbox)),
            toPage: (s) =>
              s.bbox
                ? { ...s, bbox: translateTileBboxToPage(s.bbox, tile, image.widthPx, image.heightPx) }
                : s,
            label: `tile ${tile.index}`,
          });
        } else {
          await surveyOne({
            image,
            roiId: roiIdFor(tile.bbox),
            toPage: (p) =>
              p.bbox
                ? { ...p, bbox: translateTileBboxToPage(p.bbox, tile, image.widthPx, image.heightPx) }
                : p,
            label: `tile ${tile.index}`,
          });
        }
      } catch (e) {
        warnings.push(
          `Render/analisis tile ${tile.index} hal. ${input.page} gagal: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  if (surveyReads === 0) {
    if (surveyBudgetHit) {
      return baseResult({
        renderDecision: decision,
        skippedReason: 'budget',
        status: 'NOT_DETECTED',
        droppedProposalCount,
      });
    }
    return baseResult({
      renderDecision: decision,
      skippedReason: 'error',
      status: 'UNRESOLVED',
      droppedProposalCount,
    });
  }

  // 5b. I9 — scanned pages: collapse duplicated OCR text (tile overlap
  //     zones + CAD-duplicated layers) in PAGE coordinates, then shape
  //     the deduped spans into proposals. From here on the OCR spans flow
  //     through the SAME steps as survey proposals: re-classification
  //     (step 7), I2/I3/I5 validation (step 8), DETAIL escalation
  //     (step 9). The OCR spans are UNTRUSTED input until validated —
  //     a span that fails validation is dropped with a warning below,
  //     never forced into a record.
  if (isScanned && ocrCollected.length > 0) {
    const dedupedOcr = dedupeOcrSpans(ocrCollected);
    ocrSpans = dedupedOcr.kept;
    if (dedupedOcr.merges.length > 0) {
      warnings.push(
        `Hal. ${input.page}: ${dedupedOcr.merges.length} teks OCR ganda digabung (duplikat dihitung, bukan dihitung dua kali).`,
      );
    }
    surveyed.push(...ocrSpansToProposals(ocrSpans, { page: input.page }));
  }

  // 6. Dedupe in PAGE coordinates (tile overlap zones report twice).
  //    I11 Stage 5 (F13): the label-exact pass runs first, then the
  //    cross-pass pass catches label-variant re-reads of the same
  //    detection (same mark + same bbox, different label wording).
  const deduped = dedupeProposals(surveyed);
  if (deduped.merges.length > 0) {
    warnings.push(
      `Hal. ${input.page}: ${deduped.merges.length} deteksi ganda zona overlap tile digabung (keyakinan tertinggi dipertahankan).`,
    );
  }
  const dedupedCrossPass = dedupeCrossPassProposals(deduped.kept);
  if (dedupedCrossPass.merges.length > 0) {
    warnings.push(
      `Hal. ${input.page}: ${dedupedCrossPass.merges.length} deteksi ganda lintas-pass digabung (tanda/bbox sama, label berbeda).`,
    );
  }
  const surveyDedupeMerges = deduped.merges.length + dedupedCrossPass.merges.length;
  let proposals = dedupedCrossPass.kept;

  // 7. Scanned pages: re-classify from the first pass's own text (OCR
  //    spans for scanned pages, survey detections otherwise), then
  //    re-evaluate the policy. A COVER discovered this way still paid
  //    for its first pass (unavoidable — the class was unknowable without
  //    looking); it gets no further call.
  if (!input.hasTextLayer && proposals.length > 0) {
    const surveyText = proposals.map((p) => `${p.label} ${p.rawText}`).join(' ');
    const reclassified = classifyDrawingPage({
      page: input.page,
      title: input.title,
      text: surveyText,
      hasTextLayer: true,
    });
    if (reclassified.drawingClass !== 'UNKNOWN') {
      classification = reclassified;
      policy = visionPolicyForClass(reclassified.drawingClass);
      warnings.push(
        `Hal. ${input.page} (scan, tanpa lapisan teks) diklasifikasi ulang dari ${isScanned ? 'teks OCR' : 'survei vision'}: ${reclassified.drawingClass}.`,
      );
    }
  }
  if (policy === 'none') {
    // Re-classified to a no-call class after the survey — stop here.
    const validated = validateProposals(proposals, {
      docHash: input.docHash,
      fileName,
      page: input.page,
      drawingClass: classification.drawingClass,
      sheetUnitsNote,
      pageWidthPx: input.widthPx,
    });
    return baseResult({
      classification,
      policy,
      renderDecision: decision,
      proposals,
      skippedProposals: validated.skipped,
      droppedProposalCount,
      dedupeMerges: surveyDedupeMerges,
      cacheHit: cost.calls === 0 && cost.cacheHits > 0,
      status: classification.status,
      skippedReason: 'policy',
      warnings: [...warnings, ...validated.warnings],
    });
  }

  // 8. Validate the first pass deterministically.
  let validated = validateProposals(proposals, {
    docHash: input.docHash,
    fileName,
    page: input.page,
    drawingClass: classification.drawingClass,
    sheetUnitsNote,
    pageWidthPx: input.widthPx,
  });
  warnings.push(...validated.warnings);
  let openings = linkPageOpenings(validated.occurrences, schedule);
  let elements = linkPageElements(validated.elementOccurrences, schedule, validated.dimensions);
  let quantities = [
    ...quantitiesForOpenings(openings, input.page),
    ...quantitiesForElements(elements, openings, input.page),
  ];

  // 8b. FOCUSED COMPLETION (I11 Stage 3, fix 2) — complete an
  // incomplete first pass with focused per-kind re-reads. Two triggers:
  // (a) TRUNCATION: any first-pass read was cut off mid-JSON — the
  // salvaged proposals are a PARTIAL read, so ALL THREE record-bearing
  // kinds are re-read with focused prompts (each response is small
  // enough to fit the clamp — the Stage 2 diagnostic proved a focused
  // dimension prompt fits in 3,279 tokens where the survey hit 8,000).
  // (b) TEXT-LAYER GAP: the native text layer evidences a kind the
  // survey validated ZERO records of (e.g. the model labeled
  // dimension-bearing callouts as `text`, or omitted small dimension
  // text entirely) — re-read just that kind. Gap triggers require
  // proposals.length > 0 (the DETAIL rule's rationale: when the survey
  // saw nothing at all, a re-read cannot help); truncation triggers do
  // not (truncation PROVES the model was reading successfully).
  // Each focused pass costs one call per tile (or one for the page)
  // and counts toward the document call cap — the trade-off vs the
  // single survey call is recorded in the page cost, not hidden.
  const focused: VisionDetectionProposal[] = [];
  let focusBudgetHit = false;
  const focusOne = async (args: {
    kind: VisionFocusKind;
    image: RenderedPageImage;
    roiId: string;
    /** Map each proposal's bbox from rendered-image pixels to full-page pixels. */
    toPage: (p: VisionDetectionProposal) => VisionDetectionProposal;
    label: string;
  }): Promise<boolean> => {
    const promptOpts = {
      page: input.page,
      imageWidthPx: args.image.widthPx,
      imageHeightPx: args.image.heightPx,
      drawingClass: classification.drawingClass,
    };
    const prompt =
      args.kind === 'dimensions'
        ? buildDimensionPrompt(promptOpts)
        : args.kind === 'symbols'
          ? buildSymbolPrompt(promptOpts)
          : buildTablePrompt(promptOpts);
    try {
      const outcome = await analyzeCached({
        client,
        cache: input.cache,
        docHash: input.docHash,
        page: input.page,
        roiId: args.roiId,
        prompt,
        image: args.image,
        budget: input.budget,
        cost,
      });
      if (outcome.kind === 'budget') {
        focusBudgetHit = true;
        warnings.push(`Hal. ${input.page}: re-pass fokus ${args.kind} dilewati — anggaran panggilan vision habis.`);
        return false;
      }
      droppedProposalCount += outcome.result.droppedCount;
      if (outcome.result.truncated) partialRead = true;
      warnings.push(...outcome.result.warnings);
      for (const p of outcome.result.proposals) {
        focused.push(args.toPage(p));
      }
      return true;
    } catch (e) {
      warnings.push(
        `Re-pass fokus ${args.kind} gagal di hal. ${input.page} (${args.label}): ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  };

  const focusKinds: VisionFocusKind[] = [];
  if (partialRead) {
    // Truncation: the salvaged read is partial in EVERY kind — re-read all three.
    focusKinds.push('dimensions', 'symbols', 'tables');
  } else if (proposals.length > 0 && input.hasTextLayer) {
    // Text-layer gaps: only the kinds the text evidences AND the survey
    // validated nothing of. Scanned pages have no text layer — no gaps.
    const text = input.text ?? '';
    if (validated.dimensions.length === 0 && textLayerEvidencesDimensions(text)) focusKinds.push('dimensions');
    if (validated.occurrences.length === 0 && validated.elementOccurrences.length === 0 && textLayerEvidencesMarks(text)) focusKinds.push('symbols');
    if (validated.scheduleEntries.length === 0 && textLayerEvidencesScheduleRows(text)) focusKinds.push('tables');
  }
  for (const kind of focusKinds) {
    if (focusBudgetHit) break;
    let kindOk = false;
    if (decision.mode === 'single') {
      try {
        const image = await input.renderPage({ page: input.page, scale: decision.scale });
        kindOk = await focusOne({
          kind,
          image,
          roiId: focusRoiId('full', kind),
          toPage: (p) =>
            p.bbox
              ? { ...p, bbox: rescaleBboxToPage(p.bbox, image.widthPx, image.heightPx, input.widthPx, input.heightPx) }
              : p,
          label: 'full page',
        });
      } catch (e) {
        warnings.push(
          `Render re-pass fokus ${kind} hal. ${input.page} gagal: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } else {
      for (const tile of decision.tiles) {
        if (focusBudgetHit) break;
        try {
          const image = await input.renderPage({ page: input.page, roi: tile.bbox });
          const focusedBefore = focused.length;
          const ok = await focusOne({
            kind,
            image,
            roiId: focusRoiId(roiIdFor(tile.bbox), kind),
            toPage: (p) =>
              p.bbox
                ? { ...p, bbox: translateTileBboxToPage(p.bbox, tile, image.widthPx, image.heightPx) }
                : p,
            label: `tile ${tile.index}`,
          });
          kindOk = kindOk || ok;
          // I11 Stage 5 (F9/F10) — early-stop: when one tile's focused
          // call comes back as runaway repetition (the F9 123×
          // identical symbols / F10 49× identical dimensions shape),
          // the next tile's call for the SAME kind would burn another
          // clamped call on the same illegible read — skip it. The
          // runaway batch itself still flows through validation,
          // where the flood detector + F14 cap bound it. Other kinds
          // are unaffected (a symbols runaway says nothing about the
          // tables pass).
          if (ok && isRunawayBatch(focused.slice(focusedBefore))) {
            warnings.push(
              `Hal. ${input.page}: re-pass fokus ${kind} tile ${tile.index} menunjukkan pengulangan massal — tile berikutnya dilewati (early-stop F9/F10).`,
            );
            break;
          }
        } catch (e) {
          warnings.push(
            `Render/analisis tile ${tile.index} re-pass fokus ${kind} hal. ${input.page} gagal: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
    if (kindOk) focusPasses.push(kind);
  }
  if (focused.length > 0) {
    const mergedFocus = dedupeProposals([...proposals, ...focused]);
    // I11 Stage 5 (F13): the focused re-read may return the same
    // detection with a swapped label — the cross-pass pass merges it
    // (same mark + bbox), so a re-read occurrence is not counted twice.
    const mergedFocusCrossPass = dedupeCrossPassProposals(mergedFocus.kept);
    proposals = mergedFocusCrossPass.kept;
    if (mergedFocus.merges.length > 0) {
      warnings.push(
        `Hal. ${input.page}: ${mergedFocus.merges.length} deteksi ganda re-pass fokus digabung.`,
      );
    }
    if (mergedFocusCrossPass.merges.length > 0) {
      warnings.push(
        `Hal. ${input.page}: ${mergedFocusCrossPass.merges.length} deteksi ganda lintas-pass re-pass fokus digabung (tanda/bbox sama, label berbeda).`,
      );
    }
    validated = validateProposals(proposals, {
      docHash: input.docHash,
      fileName,
      page: input.page,
      drawingClass: classification.drawingClass,
      sheetUnitsNote,
      pageWidthPx: input.widthPx,
    });
    warnings.push(...validated.warnings);
    openings = linkPageOpenings(validated.occurrences, schedule);
    elements = linkPageElements(validated.elementOccurrences, schedule, validated.dimensions);
    quantities = [
      ...quantitiesForOpenings(openings, input.page),
      ...quantitiesForElements(elements, openings, input.page),
    ];
  }

  // 9. DETAIL escalation — exactly ONE focused re-pass, only for 'full'
  //    policy pages whose first pass left UNRESOLVED/CONFLICT records
  //    (or validated nothing from visible proposals).
  let detailPass = false;
  if (
    policy === 'full' &&
    pageNeedsDetail(validated.dimensions, openings, quantities, proposals.length, elements)
  ) {
    const unresolvedOpenings = openings.filter(
      (o) => o.status === 'UNRESOLVED' || o.status === 'CONFLICT',
    ).length;
    const unresolvedElements = elements.filter(
      (e) => e.status === 'UNRESOLVED' || e.status === 'CONFLICT',
    ).length;
    const isScheduleClass =
      classification.drawingClass === 'DOOR_WINDOW_SCHEDULE' ||
      classification.drawingClass === 'STRUCTURAL_SCHEDULE';
    try {
      const detailImage = await input.renderPage({ page: input.page, scale: decision.scale });
      const promptOpts = {
        page: input.page,
        imageWidthPx: detailImage.widthPx,
        imageHeightPx: detailImage.heightPx,
        drawingClass: classification.drawingClass,
      };
      // I11 Stage 4 (E16): unresolved ELEMENTS escalate to the dimension
      // prompt — what an undimensioned element is missing is its dims
      // (its schedule row, if any, is read by the table prompt on
      // schedule pages). Openings still take precedence (symbol prompt).
      const detailPrompt =
        unresolvedOpenings > 0
          ? buildSymbolPrompt(promptOpts)
          : unresolvedElements > 0
            ? buildDimensionPrompt(promptOpts)
            : isScheduleClass
              ? buildTablePrompt(promptOpts)
              : buildDimensionPrompt(promptOpts);
      const outcome = await analyzeCached({
        client,
        cache: input.cache,
        docHash: input.docHash,
        page: input.page,
        roiId: 'full:detail',
        prompt: detailPrompt,
        image: detailImage,
        budget: input.budget,
        cost,
      });
      if (outcome.kind === 'budget') {
        warnings.push(`Hal. ${input.page}: re-pass DETAIL dilewati — anggaran panggilan vision habis.`);
      } else {
        detailPass = true;
        droppedProposalCount += outcome.result.droppedCount;
        if (outcome.result.truncated) partialRead = true;
        warnings.push(...outcome.result.warnings);
        // The detail image is a (possibly downscaled) whole-page render —
        // rescale its bboxes to full-page pixels, like the survey.
        const detailProposals = outcome.result.proposals.map((p) =>
          p.bbox
            ? { ...p, bbox: rescaleBboxToPage(p.bbox, detailImage.widthPx, detailImage.heightPx, input.widthPx, input.heightPx) }
            : p,
        );
        const merged = dedupeProposals([...proposals, ...detailProposals]);
        // I11 Stage 5 (F13): the DETAIL re-read returns the same
        // symbols/elements at the same bboxes with swapped
        // label/rawText — the cross-pass pass merges them, so a
        // re-read occurrence is not counted twice.
        const mergedCrossPass = dedupeCrossPassProposals(merged.kept);
        if (mergedCrossPass.merges.length > 0) {
          warnings.push(
            `Hal. ${input.page}: ${mergedCrossPass.merges.length} deteksi ganda lintas-pass re-pass DETAIL digabung (tanda/bbox sama, label berbeda).`,
          );
        }
        proposals = mergedCrossPass.kept;
        // Full re-validation of the merged set (deterministic; the
        // detail read may repair or contradict the survey).
        validated = validateProposals(proposals, {
          docHash: input.docHash,
          fileName,
          page: input.page,
          drawingClass: classification.drawingClass,
          sheetUnitsNote,
          pageWidthPx: input.widthPx,
        });
        warnings.push(...validated.warnings);
        openings = linkPageOpenings(validated.occurrences, schedule);
        elements = linkPageElements(validated.elementOccurrences, schedule, validated.dimensions);
        quantities = [
          ...quantitiesForOpenings(openings, input.page),
          ...quantitiesForElements(elements, openings, input.page),
        ];
      }
    } catch (e) {
      warnings.push(
        `Re-pass DETAIL hal. ${input.page} gagal: ${e instanceof Error ? e.message : String(e)} — hasil survei tetap dipakai.`,
      );
    }
  }

  // 10. Scale: native-text stated scale wins; vision legend second; a
  //     disagreement is warned, never silently resolved.
  let scale = scaleFromStated(input.page, textScale, textScaleEvidence);
  if (!scale && validated.statedScales.length > 0) {
    const first = validated.statedScales[0];
    scale = scaleFromStated(input.page, first.scale, [
      evidenceForProposal(input.docHash, fileName, first.proposal, 'TITLE_BLOCK', 0),
    ]);
  }
  if (scale && validated.statedScales.length > 0) {
    const differing = validated.statedScales.filter((s) => s.scale !== scale?.statedScale);
    if (differing.length > 0) {
      warnings.push(
        `Hal. ${input.page}: skala tercantum berbeda antara teks native (${scale.statedScale}) dan pembacaan vision (${differing.map((d) => d.scale).join(', ')}) — teks native yang dipakai.`,
      );
      // I10b E2 — the conflict is visible in the RECORD, not just the
      // warning log: the disagreeing vision read is appended to the
      // scale evidence so the reviewer sees both values (native text
      // still wins — it is ground truth when correctly parsed).
      scale = {
        ...scale,
        evidence: [
          ...scale.evidence,
          ...differing.map((d, i) =>
            evidenceForProposal(input.docHash, fileName, d.proposal, 'TITLE_BLOCK', 100 + i),
          ),
        ],
      };
    }
  }

  // 11. References resolve against the page's known targets (doc-level
  //     resolution in runVisionDocument re-resolves against all targets).
  const references =
    input.knownTargets && input.knownTargets.length > 0
      ? resolveGraph(validated.references, input.knownTargets)
      : validated.references;

  // 12. AHSP enrichment — behind the C3 guard (evaluateAhsp).
  const ahsp = evaluateAhsp(input.mode, input.ahspMatcher, openings, quantities);

  return baseResult({
    classification,
    policy,
    renderDecision: decision,
    dimensions: validated.dimensions,
    openings,
    elements,
    quantities,
    references,
    scale,
    scheduleEntries: validated.scheduleEntries,
    proposals,
    skippedProposals: validated.skipped,
    droppedProposalCount,
    dedupeMerges: surveyDedupeMerges,
    cacheHit: cost.calls === 0 && cost.cacheHits > 0,
    status: aggregatePageStatus(validated.dimensions, openings, quantities, elements),
    ahsp,
    detailPass,
  });
}

// ---------------------------------------------------------------------------
// runVisionDocument — the whole document, sequential, capped
// ---------------------------------------------------------------------------

export interface VisionDocumentInput {
  docHash: string;
  mode: DedRabAiMode;
  pages: VisionPageInput[];
  responder: VisionResponder;
  renderPage: VisionRenderPage;
  cache?: VisionCache<VisionParseResult>;
  maxCallsPerDocument?: number;
  maxTilesPerPage?: number;
  fileName?: string;
  /** Schedule rows known before the run (e.g. from a previous analysis). */
  schedule?: ScheduleEntry[];
  ahspMatcher?: VisionAhspMatcher;
  onProgress?: (ev: {
    page: number;
    pagesDone: number;
    totalPages: number;
    callsUsed: number;
  }) => void;
}

export async function runVisionDocument(input: VisionDocumentInput): Promise<VisionDocumentResult> {
  const budget: VisionCallBudget = {
    used: 0,
    max: input.maxCallsPerDocument ?? DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT,
  };
  const maxTilesPerPage = input.maxTilesPerPage ?? DEFAULT_MAX_TILES_PER_PAGE;
  const pageResults: VisionPageResult[] = [];
  const allSchedule: ScheduleEntry[] = [...(input.schedule ?? [])];
  const warnings: string[] = [];

  // Phase 1 — sequential per page. Schedule rows accumulate as pages are
  // read, so a schedule page read early links the floor plans after it;
  // phase 2 re-links everything against the FULL schedule.
  for (const pageInput of input.pages) {
    const res = await runVisionPage({
      ...pageInput,
      docHash: input.docHash,
      mode: input.mode,
      responder: input.responder,
      renderPage: input.renderPage,
      cache: input.cache,
      budget,
      maxTilesPerPage,
      ahspMatcher: input.ahspMatcher,
      fileName: input.fileName ?? pageInput.fileName,
      schedule: allSchedule,
    });
    pageResults.push(res);
    for (const entry of res.scheduleEntries) {
      const duplicate = allSchedule.some(
        (s) => s.mark === entry.mark && s.sourcePage === entry.sourcePage && s.rowText === entry.rowText,
      );
      if (!duplicate) allSchedule.push(entry);
    }
    input.onProgress?.({
      page: pageInput.page,
      pagesDone: pageResults.length,
      totalPages: input.pages.length,
      callsUsed: budget.used,
    });
  }

  // Phase 2 — doc-level linking against the FULL schedule + I5 graph.
  const knownTargets: KnownTarget[] = [
    ...input.pages.map((p) => ({ page: p.page, ref: p.title ?? `Page ${p.page}` })),
    ...allSchedule.map((e) => ({ page: e.sourcePage, ref: e.mark })),
  ];
  let graph = createReferenceGraph();
  for (const res of pageResults) {
    // Re-link this page's openings against the full schedule (a floor
    // plan processed BEFORE its schedule page still gets linked now).
    // linkOpeningToSchedule needs only mark/type/pages/evidence, which
    // the page-level record already carries; quantity is preserved.
    const relinked = res.openings.map((o) => {
      const linked = linkOpeningToSchedule(
        {
          mark: o.mark,
          elementType: o.elementType,
          sourcePages: o.sourcePages,
          evidence: o.evidence,
        },
        allSchedule,
      );
      return { ...linked, quantity: o.quantity };
    });
    res.openings = relinked;
    // I11 Stage 4 (E16/E17) — re-link this page's ELEMENTS against the
    // full schedule. Unlike openings, an element record carries dims
    // that may have come from its label text: re-linking passes the
    // CURRENT dims back as the text fallback (the schedule row, when
    // found, still wins for width/height/thickness — see
    // linkElementToSchedule). Already-linked elements are kept as-is:
    // a later row for the same mark is a conflict for the claims map,
    // not a re-link.
    const relinkedElements = res.elements.map((el) => {
      if (el.schedulePage !== null) return el;
      const linked = linkElementToSchedule(
        {
          category: el.category,
          elementType: el.elementType,
          mark: el.mark,
          quantity: el.quantity,
          sourcePages: el.sourcePages,
          evidence: el.evidence,
          textDims: {
            lengthMm: el.lengthMm,
            widthMm: el.widthMm,
            heightMm: el.heightMm,
            thicknessMm: el.thicknessMm,
          },
          diameterMm: el.diameterMm,
        },
        allSchedule,
      );
      return { ...linked, quantity: el.quantity };
    });
    res.elements = relinkedElements;
    // Quantities are recomputed from the re-linked records — a wall's
    // net area deducts the RE-LINKED openings (their dims may only
    // have arrived in phase 2).
    res.quantities = [
      ...quantitiesForOpenings(relinked, res.page),
      ...quantitiesForElements(relinkedElements, relinked, res.page),
    ];
    if (res.skippedReason === null) {
      res.status = aggregatePageStatus(res.dimensions, res.openings, res.quantities, res.elements);
    }
    // Re-evaluate AHSP against the re-linked openings (a link found in
    // phase 2 may change what is enrichable).
    res.ahsp = evaluateAhsp(input.mode, input.ahspMatcher, relinked, res.quantities);
    for (const ref of res.references) graph = addReference(graph, ref);
    for (const o of relinked) {
      if (o.schedulePage !== null) {
        graph = addReference(graph, {
          from: { page: o.sourcePages[0] ?? res.page, ref: o.mark },
          to: { page: o.schedulePage, ref: o.mark },
          kind: 'SCHEDULE',
          status: 'UNRESOLVED',
          evidence: o.evidence,
        });
      }
    }
  }
  let resolved = resolveGraph(graph, knownTargets);
  // Conflict claims: same schedule mark, different stated dimensions.
  const claims = new Map<string, ClaimedValue[]>();
  for (const e of allSchedule) {
    if (
      e.widthMm !== null && e.widthMm !== undefined &&
      e.heightMm !== null && e.heightMm !== undefined
    ) {
      const list = claims.get(e.mark) ?? [];
      list.push({ claim: `${e.widthMm}×${e.heightMm} mm`, page: e.sourcePage });
      claims.set(e.mark, list);
    }
  }
  resolved = detectConflicts(resolved, claims);
  for (const res of pageResults) {
    res.references = resolved.filter((r) => r.from.page === res.page);
  }

  const totalCost: VisionDocumentCost = {
    calls: pageResults.reduce((a, p) => a + p.cost.calls, 0),
    bytesSent: pageResults.reduce((a, p) => a + p.cost.bytesSent, 0),
    cacheHits: pageResults.reduce((a, p) => a + p.cost.cacheHits, 0),
    pages: pageResults.length,
  };
  for (const res of pageResults) warnings.push(...res.warnings);

  return {
    docHash: input.docHash,
    mode: input.mode,
    pages: pageResults,
    openings: pageResults.flatMap((p) => p.openings),
    elements: pageResults.flatMap((p) => p.elements),
    references: resolved,
    scheduleEntries: allSchedule,
    totalCost,
    budgetHit: pageResults.some((p) => p.skippedReason === 'budget'),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Service entry point — the visionEnabled gate lives HERE
// ---------------------------------------------------------------------------

export interface VisionServiceRunInput {
  /**
   * THE gate. Anything other than exactly `true` returns null WITHOUT
   * touching the responder factory, the renderer, or the cache — the
   * text-only path stays byte-identical.
   */
  visionEnabled: boolean;
  /** Injected responder (tests stub it; production passes none and uses the factory). */
  responder?: VisionResponder;
  /** Lazy factory for the real gateway responder — called ONLY when enabled and no responder was injected. */
  createResponder?: () => VisionResponder;
  docHash: string;
  mode: DedRabAiMode;
  pages: VisionPageInput[];
  renderPage: VisionRenderPage;
  cache?: VisionCache<VisionParseResult>;
  maxCallsPerDocument?: number;
  maxTilesPerPage?: number;
  fileName?: string;
  schedule?: ScheduleEntry[];
  ahspMatcher?: VisionAhspMatcher;
  onProgress?: VisionDocumentInput['onProgress'];
}

/**
 * The live services' single entry point. Returns null when vision is off
 * (the gate) — the services then behave exactly as before. Throws when
 * vision is on but no responder is available (a programmer error, never
 * a silent text-only fallback: an enabled vision run that cannot call
 * must be visible, not quietly degraded).
 */
export async function runVisionForDedService(
  input: VisionServiceRunInput,
): Promise<VisionDocumentResult | null> {
  if (input.visionEnabled !== true) return null;
  const responder = input.responder ?? input.createResponder?.();
  if (!responder) {
    throw new Error(
      'Vision is enabled but no VisionResponder is available (neither responder nor createResponder was provided).',
    );
  }
  return runVisionDocument({
    docHash: input.docHash,
    mode: input.mode,
    pages: input.pages,
    responder,
    renderPage: input.renderPage,
    cache: input.cache,
    maxCallsPerDocument: input.maxCallsPerDocument,
    maxTilesPerPage: input.maxTilesPerPage,
    fileName: input.fileName,
    schedule: input.schedule,
    ahspMatcher: input.ahspMatcher,
    onProgress: input.onProgress,
  });
}

// ---------------------------------------------------------------------------
// Item matching — vision evidence onto live result items (for the I7 viewer)
// ---------------------------------------------------------------------------

/** The fields item matching reads (DedAiItem and FullAiItem both supply these). */
export interface VisionEvidenceMatchInput {
  name: string;
  /** Free-text fields to match dimension text / marks against (rawDimensions, formulas, …). */
  texts: string[];
  sourcePages: number[];
}

function stripForDimensionMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function wordsForMarkMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministic, conservative item matching: a vision detection becomes
 * item evidence ONLY when it is textually tied to the item AND on one of
 * the item's source pages.
 * - dimension: the proposal's verbatim text (whitespace-stripped) is a
 *   substring of the item's name/texts. "3.500" matches "3.500 x 2.800".
 * - symbol: the proposal's mark (normalized) appears as a whole word in
 *   the item's name/texts. "D1" matches "Pintu D1 kayu", not "D12".
 * - table/legend/object/text proposals never attach to items (page-level
 *   evidence only — they describe the page, not a work item).
 * - Proposals without a bbox never attach (there is nothing to point at).
 * No match → no evidence → the I7 viewer keeps its honest page-only jump.
 */
export function matchVisionEvidenceToItem(
  item: VisionEvidenceMatchInput,
  pages: VisionPageResult[],
): VisionItemEvidence[] {
  const dimHaystacks = [item.name, ...item.texts].map(stripForDimensionMatch);
  const markHaystacks = [item.name, ...item.texts].map(wordsForMarkMatch);
  const pageSet = new Set(item.sourcePages);
  const out: VisionItemEvidence[] = [];
  for (const pr of pages) {
    if (!pageSet.has(pr.page)) continue;
    for (const prop of pr.proposals) {
      if (!prop.bbox) continue;
      let matched = false;
      if (prop.kind === 'dimension') {
        const needle = stripForDimensionMatch(prop.rawText);
        matched = needle.length > 0 && dimHaystacks.some((h) => h.includes(needle));
      } else if (prop.kind === 'symbol') {
        const mark = normalizeMark(prop.label);
        if (mark !== '') {
          const re = new RegExp(`\\b${escapeRegExp(mark.toLowerCase())}\\b`);
          matched = markHaystacks.some((h) => re.test(h));
        }
      }
      if (matched) {
        out.push({
          page: pr.page,
          bbox: { ...prop.bbox },
          label: prop.label,
          kind: prop.kind,
          confidence: prop.confidence,
          status: prop.status,
        });
      }
    }
  }
  out.sort((a, b) => a.page - b.page || b.confidence - a.confidence);
  return out;
}

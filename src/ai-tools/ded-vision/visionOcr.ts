/**
 * I9 — Vision-based OCR for scanned drawing pages (owner decision
 * 2026-11-22 12:40: vision-model OCR, NO new OCR library, NO new
 * dependency of any kind).
 *
 * Scanned pages have no native text layer (`VisionPageMeta.hasTextLayer`
 * is false) and are excluded from live DED today with a warning. This
 * module is the read path that brings them back: one vision call per
 * page (the OCR pass — see the OCR-AS-SURVEY decision in
 * visionPipeline.ts) asks the gateway vision model to READ the page as
 * text spans, and the spans flow into the existing deterministic
 * validators — I1 re-classification, I2 dimension parsing, I3 mark
 * linking, I5 reference recording — through `ocrSpansToProposals`.
 *
 * HONESTY RULES (the whole module exists to enforce these):
 * 1. VERBATIM. Span text is the model's reading, character for character.
 *    Nothing in this module rewrites, completes, translates, or
 *    normalizes span text. A truncated word stays truncated.
 * 2. NO COMPLETION. A truncated span is KNOWN-incomplete: its partial
 *    text is kept verbatim, flagged `truncated`, and it NEVER routes to
 *    a record-bearing kind (dimension/mark/table) — a partial number
 *    must never be parsed as a complete dimension. It stays a 'text'
 *    proposal (audit trail only).
 * 3. NO MODEL NUMBERS. The OCR schema carries NO normalized value: the
 *    model returns TEXT, and the I2 parser decides the value. Any
 *    model-supplied number field (`value`, `normalizedValue`, …) in the
 *    raw JSON is IGNORED by the parser — it never reaches a record.
 * 4. FLAGS COST CONFIDENCE. Truncated/skewed/blurry/duplicated spans
 *    take a documented confidence penalty (see OCR_FLAG_PENALTIES) and
 *    can never be HIGH_CONFIDENCE — NEEDS_REVIEW at best.
 * 5. UNTRUSTED UNTIL VALIDATED. OCR spans are proposals, not facts.
 *    The routing helpers in this module only SHAPE spans into
 *    candidates for I2/I3/I5 — they never validate a value, a size, or
 *    a link. A span that fails validation is dropped with a warning.
 * 6. DUPLICATES DON'T DOUBLE-COUNT. The same text read twice (tile
 *    overlap zones, CAD-duplicated text layers) collapses to ONE span
 *    with `duplicateCount` recorded. A duplicated schedule row yields
 *    ONE schedule entry; a duplicated mark yields ONE occurrence.
 *
 * CACHE (see visionCache.ts): OCR entries live in the SAME VisionCache
 * as survey/detail entries, distinguished by the roiId segment of the
 * key — `full:ocr:<OCR_PROMPT_VERSION>` for a whole-page pass,
 * `<tile-roi-id>:ocr:<OCR_PROMPT_VERSION>` for a tile pass (see
 * OCR_ROI_ID / ocrTileRoiId). The roiId carries BOTH the pass kind and
 * the OCR prompt version, so an OCR entry can never collide with a
 * survey/detail entry for the same page AND never survives an OCR
 * prompt change. (The key's promptVersion segment still carries
 * VISION_PROMPT_VERSION, shared with the survey prompts.)
 *
 * The cached VALUE for an OCR pass is a VisionParseResult whose
 * proposals carry the OcrTextSpan in `raw` (see ocrSpansToProposals) —
 * the pipeline cache is typed VisionCache<VisionParseResult>, so the
 * spans ride inside the proposals. `ocrSpansFromProposals` recovers
 * them on a cache hit; a proposal whose raw span is unrecoverable is
 * DROPPED and counted, never reconstructed from guesswork.
 *
 * STUB-FIRST: no live provider call happens in this module. The
 * pipeline calls the injected VisionResponder; every test stubs it.
 *
 * SCHEMA TOLERANCE: the prompt asks for `{"spans": [...]}`, but the
 * parser also accepts a top-level `detections` array (the survey
 * schema) — the same model family answers both prompts through the
 * same gateway endpoint, and a detections-shaped answer carries the
 * identical evidence (verbatim text + bbox + confidence). A
 * detection-shaped entry reads its text from `rawText`, falling back
 * to `label` when `rawText` is empty (survey symbol entries carry the
 * mark in `label` and an empty `rawText` by design). This tolerance
 * is what keeps the I8b scanned-page suite green: its stub answers
 * scanned pages in survey shape, and the OCR path must read that
 * evidence rather than drop the page to UNKNOWN.
 */

import type { BoundingBox, VisionReviewStatus } from './types';
import { statusFromConfidence } from './types';
import { extractKeywordQualifiedMark } from './openings';
import { parseStatedScale } from './scale';
import { bboxIou } from './roi';
import {
  extractJsonFromModelOutput,
  extractTruncatedJsonArrayEntries,
  type VisionDetectionProposal,
  type VisionPromptOptions,
  type VisionProposalKind,
} from './visionClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Flags the vision model reports per span (and the parser/dedupe add to). */
export interface OcrSpanFlags {
  /** The text is cut off (page edge, crop, overlapping line) — the text kept is PARTIAL, verbatim. */
  truncated?: boolean;
  /** The text is skewed/rotated — reading may be unreliable. */
  skewed?: boolean;
  /** The text is blurry/low-contrast — reading may be unreliable. */
  blurry?: boolean;
  /** The same text appears more than once at (nearly) the same place (e.g. CAD-duplicated layers). */
  duplicated?: boolean;
  /** How many instances of this text were seen (1 = single; ≥2 = duplicated). */
  duplicateCount?: number;
}

/**
 * One text span read from a scanned drawing page. UNTRUSTED input until
 * I2/I3/I5 validate it.
 *
 * - `text`: verbatim as read — never rewritten or completed. A truncated
 *   span keeps its partial text (e.g. "3.5…"), never the completed value.
 * - `bbox`: image-pixel bbox of the span, or null ONLY when the model
 *   gave no location (or an out-of-bounds one — see parseOcrResponse).
 * - `confidence`: 0..1 AFTER the flag penalties (see OCR_FLAG_PENALTIES).
 * - `status`: from statusFromConfidence, capped at NEEDS_REVIEW when any
 *   flag is set. NEVER VERIFIED — only explicit verification sets that.
 * - `source`: provenance marker, always 'vision-ocr'.
 */
export interface OcrTextSpan {
  text: string;
  bbox: BoundingBox | null;
  confidence: number;
  status: VisionReviewStatus;
  flags: OcrSpanFlags;
  page: number;
  source: 'vision-ocr';
}

/** Result of parsing one OCR response — mirrors VisionParseResult. */
export interface OcrParseResult {
  spans: OcrTextSpan[];
  /** Spans dropped as malformed — the caller must know how many. */
  droppedCount: number;
  /** One human-readable line per drop / anomaly (parse warnings). */
  warnings: string[];
  /**
   * Aggregate status: UNRESOLVED when zero spans parse (never an
   * invented reading); otherwise the status of the highest-confidence
   * span. Per-span `status` is the authoritative field.
   */
  status: VisionReviewStatus;
  /**
   * True when the model output was cut off mid-JSON (the gateway's
   * 8,000-token output clamp) and the spans above are SALVAGED
   * complete entries — a PARTIAL read, never a full read. See
   * VisionParseResult.truncated (visionClient.ts) for the contract.
   */
  truncated: boolean;
}

export interface OcrParseContext {
  /** 1-based page the image came from (stamped onto every span). */
  page: number;
  /** Pixel size of the image AS SENT — bboxes are validated against it. */
  imageWidthPx: number;
  imageHeightPx: number;
}

// ---------------------------------------------------------------------------
// Confidence penalty rule for flagged spans (documented, tested)
// ---------------------------------------------------------------------------

/**
 * CONFIDENCE PENALTY RULE — applied by the parser AFTER clamping the
 * model's confidence to 0..1:
 *
 *   penalized = max(0, clamped
 *     − 0.15 if truncated
 *     − 0.10 if skewed
 *     − 0.10 if blurry
 *     − 0.05 if duplicated)
 *
 * Penalties STACK (a truncated + blurry span loses 0.25). Rationale for
 * the sizes: truncation is the worst defect — the text is KNOWN to be
 * incomplete, so the reading cannot be trusted at all (0.15, the
 * largest); skew and blur degrade legibility but the text may still be
 * fully visible (0.10 each); duplication is a layout artifact, not a
 * legibility defect — the text itself may be perfectly readable
 * (0.05, the smallest).
 *
 * STATUS CAP: any flag set caps the span's status at NEEDS_REVIEW —
 * a flagged span can never be HIGH_CONFIDENCE, even when the penalized
 * confidence is still ≥ 0.85. A penalized confidence below 0.6 still
 * yields UNRESOLVED (the cap never UPGRADES a low-confidence span).
 */
export const OCR_TRUNCATED_PENALTY = 0.15;
export const OCR_SKEWED_PENALTY = 0.1;
export const OCR_BLURRY_PENALTY = 0.1;
export const OCR_DUPLICATED_PENALTY = 0.05;

/** IoU above which two same-text spans are the same text seen twice. */
export const OCR_DEDUPE_IOU_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Cache identity — the roiId segment distinguishes OCR entries
// ---------------------------------------------------------------------------

/**
 * Version of the OCR prompt built by buildOcrPrompt. Bump on ANY OCR
 * prompt change — the roiId (below) carries it, so a prompt change can
 * never reuse stale OCR spans.
 */
export const OCR_PROMPT_VERSION = 'v1';

/**
 * roiId segment for a whole-page OCR pass. Distinct from the survey
 * roiId ('full') and the DETAIL roiId ('full:detail') by construction.
 */
export const OCR_ROI_ID = `full:ocr:${OCR_PROMPT_VERSION}`;

/** roiId segment for one tile's OCR pass (`tileRoiId` from roiIdFor). */
export function ocrTileRoiId(tileRoiId: string): string {
  return `${tileRoiId}:ocr:${OCR_PROMPT_VERSION}`;
}

// ---------------------------------------------------------------------------
// Prompt builder — pure
// ---------------------------------------------------------------------------

export interface OcrPromptOptions extends VisionPromptOptions {
  // No extra options today; VisionPromptOptions carries page, image size,
  // and the (optional) drawing class. Kept as a named interface so an
  // OCR-specific option (e.g. a table hint) has a home later.
}

const OCR_SCHEMA = `{
  "spans": [
    {
      "text": "the exact text as printed, verbatim",
      "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
      "confidence": 0.0,
      "truncated": false,
      "skewed": false,
      "blurry": false,
      "duplicated": false,
      "duplicateCount": 1
    }
  ]
}`;

/**
 * Build the OCR prompt for one scanned drawing page (or one tile of it).
 *
 * The prompt asks the model to READ — not to interpret: every visible
 * text span, verbatim, with its pixel bbox, a per-span confidence, and
 * flags for the four defect kinds (truncated / skewed / blurry /
 * duplicated). The discipline block is OCR-specific and deliberately
 * stricter than the survey prompt's: a truncated number must NEVER be
 * completed, a dimension must NEVER be invented, and duplicated text
 * must be reported ONCE with a count — because OCR text feeds the
 * deterministic validators downstream, and a completed number would
 * become a false dimension record.
 *
 * Length: ~2.5k chars, far under the 20,000-char gateway message cap
 * (buildGatewayVisionRequestBody enforces it; the suite asserts it).
 * The 'TASK — OCR' marker lets stubs/tests (and the pipeline's own
 * prompt routing) tell an OCR call from a survey/detail call.
 */
export function buildOcrPrompt(opts: OcrPromptOptions): string {
  const classLine = opts.drawingClass
    ? `This page is classified as ${opts.drawingClass}.`
    : 'The drawing class of this page is unknown — read what is actually there.';
  return [
    `You are reading page ${opts.page} of a SCANNED architectural/engineering drawing (no text layer — the image is the only source).`,
    `The image is ${opts.imageWidthPx} px wide × ${opts.imageHeightPx} px tall.`,
    '',
    `TASK — OCR: ${classLine}`,
    'Read EVERY text span visible on this page: technical text, dimension numbers (e.g. "3.500", "2.500 × 3.000", "15/30", "+3.500", "Ø12"), door/window/column codes (D1, P1, W1, J1, K1, B1, …), schedule-table rows (read each row as ONE span, columns joined with " | "), title-block fields, scale notes, section/detail references (e.g. "LIHAT DETAIL A", "POTONGAN B-B"), and notes.',
    '',
    'RULES — follow them exactly:',
    '1. Report ONLY what is visible in the image. Do NOT estimate, guess, infer, or calculate any text, number, label, or count that is not clearly visible.',
    '2. Copy text VERBATIM — character for character, including punctuation, spacing, and units. Never rewrite, translate, normalize, or "fix" the text.',
    '3. NEVER complete a truncated word or number by guessing. If text is cut off (page edge, crop, overlapping line), report the PARTIAL text exactly as visible and set "truncated": true. A dimension that reads "3.5…" stays "3.5…" — NEVER write "3.500".',
    '4. NEVER invent a dimension. If a dimension is missing, unreadable, or cut off, do NOT emit a span for it — a missing dimension is reported by its absence, never by a guessed value.',
    '5. If text is skewed or rotated, set "skewed": true and lower the confidence honestly. If text is blurry or low-contrast, set "blurry": true and lower the confidence honestly. Do not guess at unreadable characters — report what you can read and flag the span.',
    '6. DUPLICATED TEXT: the same text sometimes appears twice at (nearly) the same place (duplicated CAD layers, double-printed labels). Report it ONCE, with "duplicated": true and "duplicateCount" set to how many instances you see. NEVER emit two conflicting readings of the same text.',
    '7. Give bounding boxes in IMAGE-PIXEL coordinates: {"x": <left px>, "y": <top px>, "width": <px>, "height": <px>}, where (0,0) is the top-left corner of the image as sent. If you cannot locate a span precisely, set "bbox" to null — never guess a box.',
    '8. Give a "confidence" from 0 to 1 for EVERY span (0 = unreadable guess, 1 = perfectly clear).',
    '9. Return ONLY JSON matching the schema below. No prose, no markdown fences, no commentary outside the JSON.',
    '10. If the page is blank or no text is visible, return {"spans": []} — never invent content.',
    '',
    'JSON SCHEMA:',
    OCR_SCHEMA,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Response parser — pure, strict (same discipline as visionClient)
// ---------------------------------------------------------------------------

function clampConfidence(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Apply the flag penalty rule (see OCR_FLAG_PENALTIES above) and the
 * NEEDS_REVIEW status cap. Pure — exported for the suite so the rule is
 * testable without a full parse.
 */
export function applyOcrFlagPenalty(
  confidence: number,
  flags: OcrSpanFlags,
): { confidence: number; status: VisionReviewStatus } {
  let penalized = confidence;
  if (flags.truncated) penalized -= OCR_TRUNCATED_PENALTY;
  if (flags.skewed) penalized -= OCR_SKEWED_PENALTY;
  if (flags.blurry) penalized -= OCR_BLURRY_PENALTY;
  if (flags.duplicated) penalized -= OCR_DUPLICATED_PENALTY;
  penalized = Math.max(0, penalized);
  const hasFlag = Boolean(flags.truncated || flags.skewed || flags.blurry || flags.duplicated);
  let status = statusFromConfidence(penalized);
  if (hasFlag && status === 'HIGH_CONFIDENCE') status = 'NEEDS_REVIEW';
  return { confidence: penalized, status };
}

function readFlag(entry: Record<string, unknown>, key: string): boolean {
  return entry[key] === true;
}

/**
 * Validate one raw span entry. Returns the typed span, or null (with a
 * warning appended) when the entry is malformed. Malformed entries are
 * DROPPED — never repaired by guessing. Unknown fields (including any
 * model-supplied number like `value` / `normalizedValue`) are IGNORED:
 * the model returns TEXT, and only the I2 parser assigns a value.
 *
 * Text source (first non-blank wins, kept VERBATIM): `text`, then
 * `rawText` (the survey schema's field), then `label` — the label
 * fallback exists for detection-shaped entries, where a symbol's mark
 * lives in `label` and `rawText` is empty by design (see the module
 * header). A descriptive label ('overall width') can ride through
 * here, but it routes to 'text' (audit trail only) downstream — it
 * can never become a dimension or a mark.
 *
 * Bbox rules (identical to the visionClient parser — the two failure
 * modes are deliberately different):
 * - IMPOSSIBLE bbox (non-finite numbers, zero/negative width or height)
 *   → the whole span is DROPPED: a model emitting impossible geometry
 *   is untrustworthy for that entry.
 * - FINITE, positive-area bbox that merely extends past the image edge
 *   → the span is KEPT with bbox null: the text may still be real,
 *   but the location is not evidence.
 */
function validateOcrSpan(
  entry: unknown,
  index: number,
  ctx: OcrParseContext,
  warnings: string[],
): OcrTextSpan | null {
  const where = `span #${index}`;
  if (!isRecord(entry)) {
    warnings.push(`${where}: dropped — not a JSON object.`);
    return null;
  }
  const text = [entry.text, entry.rawText, entry.label].find(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  ) ?? '';
  if (text.trim().length === 0) {
    warnings.push(`${where}: dropped — no text.`);
    return null;
  }
  const confidenceRaw = entry.confidence;
  if (typeof confidenceRaw !== 'number' || !Number.isFinite(confidenceRaw)) {
    warnings.push(`${where}: dropped — confidence is missing or not a finite number.`);
    return null;
  }
  const clamped = clampConfidence(confidenceRaw);
  if (clamped !== confidenceRaw) {
    warnings.push(`${where}: confidence ${confidenceRaw} clamped to ${clamped}.`);
  }

  let bbox: BoundingBox | null = null;
  const rawBbox = entry.bbox;
  if (rawBbox !== null && rawBbox !== undefined) {
    if (!isRecord(rawBbox)) {
      warnings.push(`${where}: dropped — bbox is not an object.`);
      return null;
    }
    const { x, y, width, height } = rawBbox as Record<string, unknown>;
    if (
      typeof x !== 'number' || typeof y !== 'number' ||
      typeof width !== 'number' || typeof height !== 'number' ||
      !Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(width) || !Number.isFinite(height)
    ) {
      warnings.push(`${where}: dropped — bbox has non-finite numbers.`);
      return null;
    }
    if (width <= 0 || height <= 0) {
      warnings.push(`${where}: dropped — bbox has zero or negative area (${width}×${height}).`);
      return null;
    }
    const outOfBounds =
      x < 0 || y < 0 || x + width > ctx.imageWidthPx || y + height > ctx.imageHeightPx;
    if (outOfBounds) {
      warnings.push(
        `${where}: bbox (${x},${y} ${width}×${height}) is outside the ${ctx.imageWidthPx}×${ctx.imageHeightPx} image — kept with bbox null.`,
      );
      bbox = null;
    } else {
      bbox = { x, y, width, height };
    }
  }

  const flags: OcrSpanFlags = {};
  if (readFlag(entry, 'truncated')) flags.truncated = true;
  if (readFlag(entry, 'skewed')) flags.skewed = true;
  if (readFlag(entry, 'blurry')) flags.blurry = true;
  if (readFlag(entry, 'duplicated')) flags.duplicated = true;
  const countRaw = entry.duplicateCount;
  if (typeof countRaw === 'number' && Number.isFinite(countRaw) && countRaw >= 1) {
    flags.duplicateCount = Math.floor(countRaw);
  } else if (flags.duplicated) {
    // The model said "duplicated" but gave no count: at least 2 instances.
    flags.duplicateCount = 2;
  }
  if (flags.duplicateCount !== undefined && flags.duplicateCount >= 2) flags.duplicated = true;

  const { confidence, status } = applyOcrFlagPenalty(clamped, flags);
  return {
    text, // verbatim — never trimmed, never rewritten
    bbox,
    confidence,
    status,
    flags,
    page: ctx.page,
    source: 'vision-ocr',
  };
}

/**
 * Parse an OCR response's model output into typed spans.
 * Accepts a top-level object with a `spans` / `items` / `texts` /
 * `detections` array, or a bare JSON array. The `detections` alias is
 * the survey schema (see the module header): the same evidence in a
 * sibling shape. Zero parseable spans → empty list + status
 * UNRESOLVED, never an invented reading.
 *
 * TRUNCATION (I11 Stage 3, fix 1): same salvage contract as
 * parseVisionResponse — complete spans already emitted are salvaged
 * from a mid-JSON cut-off and the result carries `truncated: true`
 * (a PARTIAL read). The incomplete tail span is dropped, never
 * repaired — and a salvaged span keeps its own `truncated` FLAG
 * semantics untouched (a span the model flagged truncated still routes
 * to 'text' only, per ocrSpansToProposals).
 */
export function parseOcrResponse(content: string, ctx: OcrParseContext): OcrParseResult {
  const warnings: string[] = [];
  let entries: unknown[] | null = null;
  let truncated = false;
  const parsed = extractJsonFromModelOutput(content);
  if (parsed !== null) {
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else if (isRecord(parsed)) {
      const list = parsed.spans ?? parsed.items ?? parsed.texts ?? parsed.detections;
      if (!Array.isArray(list)) {
        warnings.push('OCR JSON has no spans/items/texts/detections array.');
        return { spans: [], droppedCount: 0, warnings, status: 'UNRESOLVED', truncated: false };
      }
      entries = list;
    } else {
      warnings.push('OCR JSON is neither an object nor an array.');
      return { spans: [], droppedCount: 0, warnings, status: 'UNRESOLVED', truncated: false };
    }
  } else {
    const salvage = extractTruncatedJsonArrayEntries(content, ['spans', 'items', 'texts', 'detections']);
    if (!salvage.foundArray || salvage.entries.length === 0) {
      if (salvage.foundArray && salvage.truncated) {
        warnings.push(
          'OCR response was truncated mid-JSON (output token clamp) — no complete span could be salvaged; the read is lost.',
        );
      } else {
        warnings.push('No parseable JSON found in the OCR response.');
      }
      return { spans: [], droppedCount: 0, warnings, status: 'UNRESOLVED', truncated: salvage.truncated };
    }
    entries = salvage.entries;
    truncated = true;
    warnings.push(
      `OCR response was truncated mid-JSON (output token clamp) — ${salvage.entries.length} complete span(s) salvaged; the remainder is lost. This is a PARTIAL read, never a full read.`,
    );
    if (salvage.unparseableEntries > 0) {
      warnings.push(
        `${salvage.unparseableEntries} salvaged entr${salvage.unparseableEntries === 1 ? 'y was' : 'ies were'} not valid JSON — dropped, never repaired.`,
      );
    }
  }

  const spans: OcrTextSpan[] = [];
  let droppedCount = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const span = validateOcrSpan(entries[i], i, ctx, warnings);
    if (span) spans.push(span);
    else droppedCount += 1;
  }
  if (entries.length === 0) {
    warnings.push('OCR response carried zero spans.');
  }
  const status: VisionReviewStatus =
    spans.length === 0
      ? 'UNRESOLVED'
      : spans.reduce((best, s) => (s.confidence > best.confidence ? s : best), spans[0]).status;
  return { spans, droppedCount, warnings, status, truncated };
}

// ---------------------------------------------------------------------------
// Dedupe — the same text read twice is ONE span
// ---------------------------------------------------------------------------

export interface OcrDedupeMerge {
  /** The kept span's text (verbatim). */
  text: string;
  /** Confidence of the kept span. */
  keptConfidence: number;
  /** Confidence of the dropped duplicate. */
  droppedConfidence: number;
  /** IoU that triggered the merge. */
  iou: number;
  /** Total instances after the merge. */
  duplicateCount: number;
}

export interface OcrDedupeResult {
  kept: OcrTextSpan[];
  dropped: OcrTextSpan[];
  /** One record per merge, so the caller can audit what was collapsed. */
  merges: OcrDedupeMerge[];
}

/**
 * Normalize span text for duplicate comparison: trim + collapse internal
 * whitespace. Case-SENSITIVE — drawing codes (D1 vs d1) and labels are
 * case-bearing identifiers, and two readings that differ only by case
 * are distinct readings, not duplicates.
 */
export function normalizeOcrText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Collapse duplicated OCR text: two spans with the SAME normalized text
 * whose bboxes overlap above `iouThreshold` are the same text seen twice
 * (tile overlap zones, CAD-duplicated layers). The higher-confidence one
 * is kept; the other is dropped; the kept span records
 * `duplicated: true` and `duplicateCount` = the SUM of both counts, so
 * a downstream counter never double-counts the text AND the duplication
 * stays auditable. On a confidence tie the FIRST span wins (stable).
 *
 * NOT merged:
 * - Same text at NON-overlapping positions = separate instances (the
 *   same room label on two floors, the same dimension on two walls) —
 *   both kept.
 * - Different text at overlapping positions = distinct readings (a
 *   dimension overlapping the symbol it annotates) — both kept.
 * - Spans with a null bbox can never be proven duplicates — always kept.
 *
 * Default threshold 0.5 (same as dedupeProposals). Callers working in
 * tile-local coordinates MUST translate bboxes to page coordinates
 * first — IoU across different coordinate frames is meaningless.
 */
export function dedupeOcrSpans(
  spans: OcrTextSpan[],
  iouThreshold: number = OCR_DEDUPE_IOU_THRESHOLD,
): OcrDedupeResult {
  if (!Number.isFinite(iouThreshold) || iouThreshold < 0 || iouThreshold > 1) {
    throw new RangeError('dedupeOcrSpans: iouThreshold must be a finite number in 0..1.');
  }
  // Sort by confidence desc, stable (original order breaks ties).
  const ordered = spans
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.confidence - a.s.confidence || a.i - b.i)
    .map(({ s }) => s);
  const kept: OcrTextSpan[] = [];
  const dropped: OcrTextSpan[] = [];
  const merges: OcrDedupeMerge[] = [];
  for (const candidate of ordered) {
    let duplicateOf: OcrTextSpan | null = null;
    let duplicateIou = 0;
    if (candidate.bbox !== null) {
      for (const existing of kept) {
        if (existing.bbox === null) continue;
        if (normalizeOcrText(existing.text) !== normalizeOcrText(candidate.text)) continue;
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
      const totalCount =
        (duplicateOf.flags.duplicateCount ?? 1) + (candidate.flags.duplicateCount ?? 1);
      // The kept span is mutated in place: it is the pipeline's own
      // object (fresh from the parser), never a shared fixture.
      duplicateOf.flags.duplicated = true;
      duplicateOf.flags.duplicateCount = totalCount;
      merges.push({
        text: duplicateOf.text,
        keptConfidence: duplicateOf.confidence,
        droppedConfidence: candidate.confidence,
        iou: duplicateIou,
        duplicateCount: totalCount,
      });
    } else {
      kept.push(candidate);
    }
  }
  return { kept, dropped, merges };
}

// ---------------------------------------------------------------------------
// Routing — shape spans into candidates for I2/I3/I5 (never validate)
// ---------------------------------------------------------------------------

/**
 * One OCR span shaped as a validator candidate. The `text` is the span's
 * verbatim text (the validator re-parses it); the `span` carries the
 * bbox/confidence/status/flags for evidence. These helpers CLASSIFY —
 * they never decide a value, a size, or a link.
 */
export interface OcrSpanCandidate {
  span: OcrTextSpan;
  /** The span's verbatim text — the validator's input. */
  text: string;
}

/**
 * Mark pattern — mirrors visionPipeline.ts MARK_LIKE_RE (keep in sync):
 * 1–3 letters, optional hyphen, 1–3 digits. Marks are project-defined
 * identifiers (D1/P1/W1/J1/K1/B1/…), never assumed universal.
 */
export const OCR_MARK_LIKE_RE = /^[A-Za-z]{1,3}-?\d{1,3}$/;

/** A bare mark token anywhere in a longer text (schedule rows, notes). */
const MARK_TOKEN_RE = /[A-Za-z]{1,3}-?\d{1,3}/;

/** Reference keywords — mirrors the pipeline's REF_PATTERNS, plus DENAH. */
const REFERENCE_KEYWORDS_RE =
  /\b(?:lihat|see|potongan|section|detail|denah|tampak|elevation|jadwal|schedule|grid)\b/i;
const LEVEL_REF_RE = /\bLT\.?\s*\d/i;

/** Is this text a bare project mark (D1, P1, W1, J1, K1, B1, …)? */
export function isMarkLikeText(text: string): boolean {
  return OCR_MARK_LIKE_RE.test(text.trim());
}

/** Does this text reference another sheet/detail/section/schedule? */
export function isReferenceLikeText(text: string): boolean {
  return REFERENCE_KEYWORDS_RE.test(text) || LEVEL_REF_RE.test(text);
}

/**
 * Is this text a schedule-table row? Either a pipe-joined row carrying
 * a mark ("D1 | Pintu | 900 x 2100 | Kayu") or a mark followed by a
 * dimension pair ("D1 Pintu 900 x 2100"). I10b E4: a LETTER-ONLY mark
 * qualifies the same way when an opening keyword is present
 * ("D-DOOR - 0.91X2.13", "W WINDOW 1.52X1.83"). The I3 parseScheduleRow
 * call is the real gate — this only shapes the candidate.
 */
export function isScheduleRowLikeText(text: string): boolean {
  const t = text.trim();
  if (
    t.includes('|') &&
    (MARK_TOKEN_RE.test(t) || extractKeywordQualifiedMark(t) !== null)
  ) {
    return true;
  }
  // The pair separator is ×, x, or X — uppercase X is standard CAD text
  // (`0.91X2.13`); a lowercase-only class misses every Indian schedule row.
  if (/[A-Za-z]{1,3}-?\d{1,3}\b.{0,60}?\d+\s*[×xX]\s*\d+/.test(t)) return true;
  return (
    extractKeywordQualifiedMark(t) !== null &&
    /\d+\s*[×xX]\s*\d+/.test(t)
  );
}

/**
 * Is this text dimension-like — a plausible dimension token the I2
 * parser should look at? The test is deliberately CONSERVATIVE:
 * dimension characters only (digits, separators, units, Ø/D/R
 * prefixes), PLUS at least one explicit dimension signal (a separator,
 * a unit, or an Ø/D/R prefix).
 *
 * Why conservative: the I2 parser reads a bare integer as millimetres
 * ("120" → 120 mm), so routing a bare number to I2 would turn a count
 * or a drawing number into a false dimension. A bare "120" therefore
 * routes to 'text' (audit trail only), not to I2. (Years are now also
 * rejected by I2 itself — I10b E1 moved the year guard into
 * parseDimensionToken, so the guard is shared by the survey and OCR
 * paths; this router stays conservative for counts and drawing
 * numbers.) A real dimension on a drawing almost always carries a
 * separator ("3.500", "15/30"), a unit ("3500 mm"), or a prefix
 * ("Ø12") — those route to I2, which remains the only decider of the
 * value.
 *
 * A "Label: <dimension>" prefix is stripped before the test ("Lebar:
 * 3.500" → "3.500"), mirroring parseDimensionList. Scale statements
 * ("SKALA 1:100", "1:100") never route here — the colon split leaves a
 * bare number with no dimension signal.
 */
export function isDimensionLikeText(text: string): boolean {
  let t = text.trim();
  const colonIdx = t.indexOf(':');
  if (colonIdx > 0) t = t.slice(colonIdx + 1).trim();
  if (t === '' || !/[0-9]/.test(t)) return false;
  if (OCR_MARK_LIKE_RE.test(t)) return false; // a bare mark is a symbol, not a dimension
  const hasUnit = /\s*(mm|cm|m)\s*$/i.test(t);
  const withoutUnit = hasUnit ? t.replace(/\s*(mm|cm|m)\s*$/i, '').trim() : t;
  // Dimension characters only: optional sign, optional Ø/D/R prefix,
  // then digits and separators. Any other letter fails the test.
  if (!/^[+±]?\s*(?:[ØøDR]\s*)?[0-9][0-9\s.,×xX/+\-]*$/.test(withoutUnit)) return false;
  if (hasUnit) return true;
  if (/^[+±]?\s*[ØøDR]/.test(withoutUnit)) return true;
  // A separator (., ×, /, +, −) is the dimension signal for bare numbers.
  return /[.,×xX/+\-]/.test(withoutUnit);
}

/** Dimension-like spans — candidates for the I2 parser (verbatim re-parse). */
export function ocrSpansToDimensionCandidates(spans: OcrTextSpan[]): OcrSpanCandidate[] {
  return spans
    .filter((s) => !s.flags.truncated && isDimensionLikeText(s.text))
    .map((span) => ({ span, text: span.text }));
}

/** Mark-like spans — candidates for I3 (mark → schedule link). */
export function ocrSpansToMarkCandidates(spans: OcrTextSpan[]): OcrSpanCandidate[] {
  return spans
    .filter((s) => !s.flags.truncated && isMarkLikeText(s.text))
    .map((span) => ({ span, text: span.text }));
}

/** Reference-like spans — candidates for the I5 reference graph. */
export function ocrSpansToReferences(spans: OcrTextSpan[]): OcrSpanCandidate[] {
  return spans
    .filter((s) => isReferenceLikeText(s.text))
    .map((span) => ({ span, text: span.text }));
}

/** Schedule-row-like spans — candidates for I3 parseScheduleRow. */
export function ocrSpansToScheduleRowCandidates(spans: OcrTextSpan[]): OcrSpanCandidate[] {
  return spans
    .filter((s) => !s.flags.truncated && isScheduleRowLikeText(s.text))
    .map((span) => ({ span, text: span.text }));
}

// ---------------------------------------------------------------------------
// Spans → proposals — the pipeline's consumption point
// ---------------------------------------------------------------------------

export interface OcrProposalsContext {
  /** 1-based page the spans came from. */
  page: number;
  /** ROI id when the spans came from a cropped region. */
  roiId?: string;
}

/**
 * Shape OCR spans (in PAGE coordinates — callers MUST translate
 * tile/downscaled bboxes first) into VisionDetectionProposals so the
 * pipeline's existing validateProposals path consumes them exactly like
 * survey detections. Kind precedence per span:
 *
 *   1. truncated → 'text' (ALWAYS — a partial text must never be parsed
 *      as a complete dimension, mark, or schedule row).
 *   2. schedule-row-like → 'table' (I3 parseScheduleRow decides).
 *   3. mark-like → 'symbol' (I3 linkOpeningToSchedule decides). I10b
 *      E4: a keyword-qualified LETTER-ONLY mark (`D DOOR`, `W-WINDOW`)
 *      is a symbol too — the label is the mark alone so the pipeline
 *      links it by mark; rawText keeps the full span.
 *   4. reference-like → 'text' (I5 REF_PATTERNS decide).
 *   5. dimension-like → 'dimension' (I2 parseDimensionList decides).
 *   6. scale-like → 'legend' (I10b E19: a stated scale in an OCR span
 *      becomes a legend proposal, so a scanned page's scale is captured
 *      by the pipeline's existing legend path instead of lost).
 *   7. anything else → 'text' (audit trail only — room labels, notes,
 *      titles; no record type, no failure).
 *
 * The span itself rides in `raw` (audit + cache-hit recovery via
 * ocrSpansFromProposals). Confidence/status are the span's own
 * (post-penalty, capped) — proposals NEVER arrive VERIFIED, and OCR
 * spans can't be either (statusFromConfidence + the flag cap).
 */
export function ocrSpansToProposals(
  spans: OcrTextSpan[],
  ctx: OcrProposalsContext,
): VisionDetectionProposal[] {
  return spans.map((span): VisionDetectionProposal => {
    let kind: VisionProposalKind = 'text';
    let label = span.text.trim();
    if (!span.flags.truncated) {
      const letterMark = extractKeywordQualifiedMark(span.text);
      if (isScheduleRowLikeText(span.text)) kind = 'table';
      else if (isMarkLikeText(span.text)) kind = 'symbol';
      else if (letterMark !== null) {
        kind = 'symbol';
        label = letterMark;
      } else if (isReferenceLikeText(span.text)) kind = 'text';
      else if (isDimensionLikeText(span.text)) kind = 'dimension';
      else if (parseStatedScale(span.text) !== null) kind = 'legend';
    }
    const proposal: VisionDetectionProposal = {
      kind,
      label,
      rawText: span.text,
      bbox: span.bbox ? { ...span.bbox } : null,
      confidence: span.confidence,
      page: ctx.page,
      status: span.status,
      raw: span,
    };
    if (ctx.roiId !== undefined) proposal.roiId = ctx.roiId;
    return proposal;
  });
}

// ---------------------------------------------------------------------------
// Cache-hit recovery — spans out of cached proposals
// ---------------------------------------------------------------------------

/** True when `value` is an OcrTextSpan (the `raw` of an OCR proposal). */
export function isOcrTextSpan(value: unknown): value is OcrTextSpan {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    rec.source === 'vision-ocr' &&
    typeof rec.text === 'string' &&
    typeof rec.confidence === 'number' &&
    typeof rec.page === 'number' &&
    typeof rec.status === 'string' &&
    isRecord(rec.flags)
  );
}

export interface OcrSpansFromProposalsResult {
  spans: OcrTextSpan[];
  /**
   * Proposals whose span could not be recovered (raw missing or not a
   * span). The caller counts these as dropped — a span is never
   * reconstructed from proposal fields, because the flags (notably
   * `truncated`) live only on the span, and a flag-less reconstruction
   * could route a truncated text to a record-bearing kind.
   */
  unrecoverable: number;
}

/**
 * Recover OCR spans from cached proposals (their `raw` fields). Used on
 * a cache hit in the pipeline's OCR path. Entries written by this module
 * always carry the span in `raw`, so `unrecoverable` is 0 in practice;
 * the count exists so a foreign/legacy entry fails honestly instead of
 * silently.
 */
export function ocrSpansFromProposals(
  proposals: VisionDetectionProposal[],
): OcrSpansFromProposalsResult {
  const spans: OcrTextSpan[] = [];
  let unrecoverable = 0;
  for (const proposal of proposals) {
    if (isOcrTextSpan(proposal.raw)) spans.push(proposal.raw);
    else unrecoverable += 1;
  }
  return { spans, unrecoverable };
}

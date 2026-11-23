/**
 * I9 — Vision-OCR path suite (plain-tsx assertion script, NO vitest).
 *
 * STUB-FIRST: this suite makes ZERO network calls and NEVER constructs the
 * real gateway responder (`createGatewayVisionResponder` is not even
 * imported here). The global fetch is replaced with a sentinel that fails
 * the suite if anything ever calls it; every vision call goes through a
 * recording stub responder, and every render goes through a stub
 * renderPage.
 *
 * Covers: the OCR prompt discipline, the strict parser (incl. the flag
 * penalty rule), span dedupe, routing into I2/I3/I5, the scanned-page
 * end-to-end through runVisionPage/runVisionDocument, the non-scanned
 * no-OCR guarantee, the OCR cache identity, and the 40-call cap.
 *
 * Run from repo root:
 *   npx --yes tsx src/test/dedVisionOcr.test.ts
 */

import { runVisionDocument, runVisionPage } from '../ai-tools/ded-vision/visionPipeline';
import type {
  VisionPageInput,
  VisionRenderPage,
} from '../ai-tools/ded-vision/visionPipeline';
import { VisionCache, visionCacheKey } from '../ai-tools/ded-vision/visionCache';
import { VISION_MODEL_VERSION, VISION_PROMPT_VERSION } from '../ai-tools/ded-vision/visionClient';
import type { VisionParseResult, VisionRequest, VisionResponder, VisionResponse } from '../ai-tools/ded-vision/visionClient';
import {
  OCR_DEDUPE_IOU_THRESHOLD,
  OCR_PROMPT_VERSION,
  OCR_ROI_ID,
  applyOcrFlagPenalty,
  buildOcrPrompt,
  dedupeOcrSpans,
  isDimensionLikeText,
  isMarkLikeText,
  isReferenceLikeText,
  isScheduleRowLikeText,
  normalizeOcrText,
  ocrSpansFromProposals,
  ocrSpansToDimensionCandidates,
  ocrSpansToMarkCandidates,
  ocrSpansToProposals,
  ocrSpansToReferences,
  ocrSpansToScheduleRowCandidates,
  ocrTileRoiId,
  parseOcrResponse,
} from '../ai-tools/ded-vision/visionOcr';
import type { OcrTextSpan } from '../ai-tools/ded-vision/visionOcr';
import type { ScheduleEntry } from '../ai-tools/ded-vision/types';

// --- fetch sentinel: ANY network call fails the suite -----------------------
const realFetch = globalThis.fetch;
let fetchCalls = 0;
(globalThis as unknown as { fetch: typeof fetch }).fetch = ((..._args: unknown[]) => {
  fetchCalls += 1;
  throw new Error('NETWORK CALL IN TEST — vision tests must use stub responders only.');
}) as unknown as typeof fetch;

// --- assertion harness (same style as dedVisionPipeline.test.ts) ------------
let passed = 0;
let total = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  total += 1;
  const ok =
    typeof actual === 'number' && typeof expected === 'number'
      ? Math.abs(actual - expected) < 1e-9
      : actual === expected;
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function checkTrue(name: string, cond: boolean): void {
  total += 1;
  if (cond) passed += 1;
  else failures.push(`${name} — expected true, got false`);
}

// --- fixtures ----------------------------------------------------------------

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const PAGE_W = 1000;
const PAGE_H = 1400;

type ScriptFn = (req: VisionRequest, callIndex: number) => unknown;

function makeResponder(script: ScriptFn): { responder: VisionResponder; calls: VisionRequest[] } {
  const calls: VisionRequest[] = [];
  const responder: VisionResponder = async (req: VisionRequest): Promise<VisionResponse> => {
    const body = script(req, calls.length);
    calls.push(req);
    return {
      content: typeof body === 'string' ? body : JSON.stringify(body),
      model: 'stub',
      provider: 'stub',
      requestId: null,
      durationMs: 1,
      usage: null,
      usageStatus: null,
    };
  };
  return { responder, calls };
}

function promptPage(prompt: string): number {
  const m = prompt.match(/reading page (\d+)/);
  return m ? Number(m[1]) : 0;
}

function stubRenderPage(): VisionRenderPage {
  return async () => ({
    dataUrl: TINY_PNG,
    widthPx: PAGE_W,
    heightPx: PAGE_H,
    base64Length: 100,
  });
}

function scannedPage(page: number): VisionPageInput {
  return { page, hasTextLayer: false, widthPx: PAGE_W, heightPx: PAGE_H, base64Length: 100 };
}

const D1_SCHEDULE: ScheduleEntry[] = [
  {
    mark: 'D1',
    widthMm: 900,
    heightMm: 2100,
    material: null,
    frame: null,
    glazing: null,
    sourcePage: 1,
    rowText: 'D1 | Pintu | 900 x 2100 | Kayu',
  },
];

/**
 * The stubbed OCR read of a scanned floor plan. Includes every routing
 * case: a title (re-classification), room labels (audit trail), a
 * dimension carrying a MODEL-SUPPLIED NUMBER (9999 — must never survive),
 * a mark, a cross-sheet reference, a truncated dimension (must never
 * become a record), and a dimension with an out-of-bounds bbox (text
 * usable, location not evidence).
 */
function floorPlanOcrSpans(): Record<string, unknown> {
  return {
    spans: [
      { text: 'DENAH LANTAI 1', bbox: { x: 10, y: 10, width: 200, height: 30 }, confidence: 0.95 },
      { text: 'RUANG TAMU', bbox: { x: 100, y: 200, width: 120, height: 25 }, confidence: 0.9 },
      { text: 'KAMAR TIDUR', bbox: { x: 100, y: 400, width: 130, height: 25 }, confidence: 0.9 },
      {
        text: '3.500',
        bbox: { x: 400, y: 50, width: 60, height: 20 },
        confidence: 0.95,
        normalizedValue: 9999,
      },
      { text: 'D1', bbox: { x: 300, y: 300, width: 30, height: 30 }, confidence: 0.9 },
      { text: 'LIHAT DETAIL A', bbox: { x: 50, y: 1300, width: 150, height: 20 }, confidence: 0.9 },
      {
        text: '3.5…',
        bbox: { x: 500, y: 50, width: 40, height: 20 },
        confidence: 0.8,
        truncated: true,
      },
      // Out of bounds (950 + 100 > 1000): kept with bbox null.
      { text: '2.800', bbox: { x: 950, y: 50, width: 100, height: 20 }, confidence: 0.9 },
    ],
  };
}

/** Stub script: OCR prompts get the fixture by page; anything else gets empty detections. */
function ocrScript(ocrByPage: Record<number, unknown>): ScriptFn {
  return (req) => {
    if (req.prompt.includes('TASK — OCR')) {
      const page = promptPage(req.prompt);
      return ocrByPage[page] ?? { spans: [] };
    }
    return { detections: [] };
  };
}

/** Build a valid OcrTextSpan fixture (overrides win). */
function span(
  text: string,
  overrides: Partial<OcrTextSpan> = {},
): OcrTextSpan {
  return {
    text,
    bbox: { x: 100, y: 100, width: 50, height: 20 },
    confidence: 0.9,
    status: 'HIGH_CONFIDENCE',
    flags: {},
    page: 1,
    source: 'vision-ocr',
    ...overrides,
  };
}

const OCR_CTX = { page: 3, imageWidthPx: PAGE_W, imageHeightPx: PAGE_H };

// --- suite -------------------------------------------------------------------

async function main(): Promise<void> {
  // =======================================================================
  // A. Prompt discipline
  // =======================================================================
  const prompt = buildOcrPrompt({ page: 1, imageWidthPx: PAGE_W, imageHeightPx: PAGE_H });
  checkTrue('prompt: carries the TASK — OCR marker', prompt.includes('TASK — OCR'));
  checkTrue('prompt: demands verbatim text', prompt.includes('VERBATIM'));
  checkTrue('prompt: forbids completing truncated text', prompt.includes('NEVER complete a truncated word or number'));
  checkTrue('prompt: shows the truncated example verbatim (3.5… stays 3.5…)', prompt.includes('"3.5…" stays "3.5…"'));
  checkTrue('prompt: forbids inventing a dimension', prompt.includes('NEVER invent a dimension'));
  checkTrue('prompt: covers skewed text', prompt.includes('skewed'));
  checkTrue('prompt: covers blurry text', prompt.includes('blurry'));
  checkTrue('prompt: covers duplicated text with a count', prompt.includes('duplicated') && prompt.includes('duplicateCount'));
  checkTrue('prompt: demands image-pixel bboxes', prompt.includes('IMAGE-PIXEL'));
  checkTrue('prompt: carries the spans JSON schema', prompt.includes('"spans"'));
  checkTrue('prompt: names dimension numbers', prompt.includes('"3.500"'));
  checkTrue('prompt: names door/window codes', prompt.includes('D1, P1, W1, J1, K1'));
  checkTrue('prompt: names schedule-table rows', prompt.includes('schedule-table rows'));
  checkTrue('prompt: under the 20,000-char gateway cap', prompt.length < 20000);
  checkTrue('prompt: states the page and image size', prompt.includes('page 1') && prompt.includes('1000 px wide'));

  // =======================================================================
  // B. Parser — strict, same discipline as the visionClient parser
  // =======================================================================
  const valid = parseOcrResponse(
    JSON.stringify({
      spans: [
        { text: '3.500', bbox: { x: 10, y: 20, width: 60, height: 15 }, confidence: 0.95 },
        { text: 'D1', bbox: null, confidence: 0.9 },
      ],
    }),
    OCR_CTX,
  );
  check('parser: valid spans parsed', valid.spans.length, 2);
  check('parser: text kept verbatim', valid.spans[0].text, '3.500');
  check('parser: bbox kept', valid.spans[0].bbox?.x, 10);
  check('parser: confidence kept', valid.spans[0].confidence, 0.95);
  check('parser: high-confidence span is HIGH_CONFIDENCE', valid.spans[0].status, 'HIGH_CONFIDENCE');
  check('parser: source stamped vision-ocr', valid.spans[0].source, 'vision-ocr');
  check('parser: page stamped', valid.spans[0].page, 3);
  check('parser: null bbox kept null', valid.spans[1].bbox, null);
  check('parser: droppedCount 0 on clean input', valid.droppedCount, 0);
  check('parser: aggregate status follows best span', valid.status, 'HIGH_CONFIDENCE');

  const fenced = parseOcrResponse(
    '```json\n{"spans": [{"text": "D1", "bbox": null, "confidence": 0.9}]}\n```',
    OCR_CTX,
  );
  check('parser: fenced ```json block parses', fenced.spans.length, 1);

  const proseWrapped = parseOcrResponse(
    'Here is what I read: {"spans": [{"text": "D1", "bbox": null, "confidence": 0.9}]} — end of reading.',
    OCR_CTX,
  );
  check('parser: prose-wrapped JSON parses', proseWrapped.spans.length, 1);

  const malformed = parseOcrResponse(
    JSON.stringify({
      spans: [
        {},
        { text: 'x' },
        { text: 'x', confidence: 0.9, bbox: { x: 0, y: 0, width: 0, height: 10 } },
        { text: 'x', confidence: 0.9, bbox: 'nope' },
        'not-an-object',
        { text: '   ', confidence: 0.9 },
      ],
    }),
    OCR_CTX,
  );
  check('parser: malformed spans dropped + counted', malformed.droppedCount, 6);
  check('parser: malformed input yields zero spans', malformed.spans.length, 0);
  check('parser: zero spans → UNRESOLVED', malformed.status, 'UNRESOLVED');

  const empty = parseOcrResponse('{"spans": []}', OCR_CTX);
  check('parser: empty spans → empty', empty.spans.length, 0);
  check('parser: empty spans → UNRESOLVED', empty.status, 'UNRESOLVED');

  const noJson = parseOcrResponse('no json here at all', OCR_CTX);
  check('parser: no JSON → empty + UNRESOLVED', noJson.spans.length, 0);
  check('parser: no JSON status', noJson.status, 'UNRESOLVED');
  check('parser: no JSON → truncated false', noJson.truncated, false);
  check('parser: complete response → truncated false', valid.truncated, false);

  // Truncation-tolerant salvage (I11 Stage 3, fix 1) — same contract as
  // the vision parser: complete spans already emitted are salvaged from
  // a mid-JSON cut-off; the incomplete tail span is dropped, never
  // repaired; the result is flagged a PARTIAL read. Fixture mirrors the
  // real 90135 OCR-probe truncation (cut inside the last span object).
  const truncatedOcr =
    '{"spans": [\n' +
    '{"text": "DENAH LANTAI 1", "bbox": {"x": 100, "y": 50, "width": 200, "height": 20}, "confidence": 0.95, "truncated": false, "skewed": false, "blurry": false, "duplicated": false, "duplicateCount": 1},\n' +
    '{"text": "3.500", "bbox": {"x": 120, "y": 200, "width": 60, "height": 18}, "confidence": 0.9, "truncated": false, "skewed": false, "blurry": false, "duplicated": false, "duplicateCount": 1},\n' +
    '{"text": "FOUNDATION BEAM", "bbox"';
  const salvagedOcr = parseOcrResponse(truncatedOcr, OCR_CTX);
  check('salvage: 2 complete spans salvaged from truncated OCR JSON', salvagedOcr.spans.length, 2);
  check('salvage: first salvaged span text verbatim', salvagedOcr.spans[0].text, 'DENAH LANTAI 1');
  check('salvage: second salvaged span text verbatim', salvagedOcr.spans[1].text, '3.500');
  check('salvage: truncated flag true', salvagedOcr.truncated, true);
  check('salvage: aggregate status follows best salvaged span', salvagedOcr.status, 'HIGH_CONFIDENCE');
  checkTrue('salvage: warning names the partial read', salvagedOcr.warnings.some((w) => w.includes('PARTIAL read')));
  check('salvage: incomplete tail span dropped, not counted as malformed', salvagedOcr.droppedCount, 0);

  // Cut off inside the first span: nothing to salvage — lost, honestly flagged.
  const cutInFirstSpan = '{"spans": [{"text": "DENAH LANTAI 1 IS A LONG TITLE THAT WAS CUT';
  const cutFirstSpan = parseOcrResponse(cutInFirstSpan, OCR_CTX);
  check('salvage: cut inside first span → 0 spans', cutFirstSpan.spans.length, 0);
  check('salvage: cut inside first span → UNRESOLVED', cutFirstSpan.status, 'UNRESOLVED');
  check('salvage: cut inside first span → truncated true', cutFirstSpan.truncated, true);

  // A salvaged span keeps its OWN truncated flag semantics: a span the
  // model flagged truncated still routes to 'text' only downstream —
  // the response-level salvage must not clear span-level flags.
  const flaggedSalvage = parseOcrResponse(
    '{"spans": [{"text": "3.5…", "bbox": null, "confidence": 0.9, "truncated": true}, {"text": "TAIL',
    OCR_CTX,
  );
  check('salvage: flagged span survives salvage', flaggedSalvage.spans.length, 1);
  checkTrue('salvage: span-level truncated flag preserved', flaggedSalvage.spans[0].flags.truncated === true);
  check('salvage: flagged span keeps its penalty (0.9 → 0.75)', flaggedSalvage.spans[0].confidence, 0.75);

  const clamped = parseOcrResponse(
    JSON.stringify({
      spans: [
        { text: 'A', bbox: null, confidence: 1.5 },
        { text: 'B', bbox: null, confidence: -0.2 },
      ],
    }),
    OCR_CTX,
  );
  check('parser: confidence above 1 clamped to 1', clamped.spans[0].confidence, 1);
  check('parser: confidence below 0 clamped to 0', clamped.spans[1].confidence, 0);
  check('parser: clamped-to-0 span is UNRESOLVED', clamped.spans[1].status, 'UNRESOLVED');

  const oob = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: '2.800', bbox: { x: 950, y: 50, width: 100, height: 20 }, confidence: 0.9 }],
    }),
    OCR_CTX,
  );
  check('parser: out-of-bounds bbox span is kept', oob.spans.length, 1);
  check('parser: out-of-bounds bbox becomes null', oob.spans[0].bbox, null);

  const modelNumber = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: '3.500', bbox: null, confidence: 0.95, normalizedValue: 9999, value: 9999 }],
    }),
    OCR_CTX,
  );
  checkTrue('parser: model-supplied normalizedValue is ignored', !('normalizedValue' in modelNumber.spans[0]));
  checkTrue('parser: model-supplied value is ignored', !('value' in modelNumber.spans[0]));

  // Flag penalties + NEEDS_REVIEW cap (the documented penalty rule).
  const truncated = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: '3.5…', bbox: { x: 1, y: 1, width: 10, height: 10 }, confidence: 0.9, truncated: true }],
    }),
    OCR_CTX,
  );
  check('parser: truncated partial text kept verbatim (never completed)', truncated.spans[0].text, '3.5…');
  checkTrue('parser: truncated flag preserved', truncated.spans[0].flags.truncated === true);
  check('parser: truncated penalty 0.15 (0.9 → 0.75)', truncated.spans[0].confidence, 0.75);
  check('parser: truncated span capped at NEEDS_REVIEW', truncated.spans[0].status, 'NEEDS_REVIEW');

  const skewed = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: 'D1', bbox: null, confidence: 0.9, skewed: true }],
    }),
    OCR_CTX,
  );
  check('parser: skewed penalty 0.10 (0.9 → 0.8)', skewed.spans[0].confidence, 0.8);
  check('parser: skewed span capped at NEEDS_REVIEW', skewed.spans[0].status, 'NEEDS_REVIEW');

  const blurry = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: 'D1', bbox: null, confidence: 0.95, blurry: true }],
    }),
    OCR_CTX,
  );
  check('parser: blurry penalty 0.10 (0.95 → 0.85)', blurry.spans[0].confidence, 0.85);
  check('parser: blurry span capped at NEEDS_REVIEW despite 0.85', blurry.spans[0].status, 'NEEDS_REVIEW');

  const stacked = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: '3.5', bbox: null, confidence: 0.9, truncated: true, blurry: true }],
    }),
    OCR_CTX,
  );
  check('parser: stacked penalties add (0.9 − 0.15 − 0.10 = 0.65)', stacked.spans[0].confidence, 0.65);

  const duplicated = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: 'D1', bbox: null, confidence: 0.9, duplicated: true, duplicateCount: 3 }],
    }),
    OCR_CTX,
  );
  check('parser: duplicated penalty 0.05 (0.9 → 0.85)', duplicated.spans[0].confidence, 0.85);
  check('parser: duplicateCount preserved', duplicated.spans[0].flags.duplicateCount, 3);
  check('parser: duplicated span capped at NEEDS_REVIEW', duplicated.spans[0].status, 'NEEDS_REVIEW');

  const dupNoCount = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: 'D1', bbox: null, confidence: 0.9, duplicated: true }],
    }),
    OCR_CTX,
  );
  check('parser: duplicated without a count defaults to 2', dupNoCount.spans[0].flags.duplicateCount, 2);

  const countNoFlag = parseOcrResponse(
    JSON.stringify({
      spans: [{ text: 'D1', bbox: null, confidence: 0.9, duplicateCount: 2 }],
    }),
    OCR_CTX,
  );
  checkTrue('parser: duplicateCount ≥ 2 implies duplicated', countNoFlag.spans[0].flags.duplicated === true);

  const penaltyDirect = applyOcrFlagPenalty(0.9, { truncated: true });
  check('penalty: direct truncated rule', penaltyDirect.confidence, 0.75);
  check('penalty: direct truncated status', penaltyDirect.status, 'NEEDS_REVIEW');
  const penaltyClean = applyOcrFlagPenalty(0.9, {});
  check('penalty: unflagged span unpenalized', penaltyClean.confidence, 0.9);
  check('penalty: unflagged span keeps HIGH_CONFIDENCE', penaltyClean.status, 'HIGH_CONFIDENCE');

  // Schema tolerance: a detections-shaped answer (the survey schema)
  // carries the same evidence and must parse as spans.
  const detectionsShaped = parseOcrResponse(
    JSON.stringify({
      detections: [
        { kind: 'text', label: 'drawing title', rawText: 'DENAH LANTAI 1', bbox: { x: 10, y: 10, width: 200, height: 30 }, confidence: 0.95 },
        { kind: 'dimension', label: '3.500', rawText: '3.500', bbox: { x: 400, y: 50, width: 60, height: 20 }, confidence: 0.9 },
        { kind: 'symbol', label: 'D1', rawText: '', bbox: { x: 300, y: 300, width: 30, height: 30 }, confidence: 0.9 },
      ],
    }),
    OCR_CTX,
  );
  check('parser: detections-shaped answer parses as spans', detectionsShaped.spans.length, 3);
  check('parser: detections-shaped text read from rawText', detectionsShaped.spans[0].text, 'DENAH LANTAI 1');
  check('parser: symbol mark read from label when rawText is empty', detectionsShaped.spans[2].text, 'D1');

  // =======================================================================
  // C. Dedupe — the same text read twice is ONE span
  // =======================================================================
  check('dedupe: default IoU threshold is 0.5', OCR_DEDUPE_IOU_THRESHOLD, 0.5);
  const dupes = dedupeOcrSpans([
    span('D1', { bbox: { x: 100, y: 100, width: 50, height: 20 }, confidence: 0.9 }),
    span('D1', { bbox: { x: 102, y: 101, width: 50, height: 20 }, confidence: 0.7 }),
  ]);
  check('dedupe: same text + overlap → one span', dupes.kept.length, 1);
  check('dedupe: higher confidence kept', dupes.kept[0].confidence, 0.9);
  check('dedupe: duplicateCount recorded as 2', dupes.kept[0].flags.duplicateCount, 2);
  checkTrue('dedupe: duplicated flag set', dupes.kept[0].flags.duplicated === true);
  check('dedupe: one merge recorded', dupes.merges.length, 1);

  const separate = dedupeOcrSpans([
    span('RUANG TAMU', { bbox: { x: 100, y: 100, width: 120, height: 25 }, confidence: 0.9 }),
    span('RUANG TAMU', { bbox: { x: 500, y: 500, width: 120, height: 25 }, confidence: 0.9 }),
  ]);
  check('dedupe: same text at different positions → both kept', separate.kept.length, 2);

  const distinct = dedupeOcrSpans([
    span('D1', { bbox: { x: 100, y: 100, width: 50, height: 20 }, confidence: 0.9 }),
    span('D2', { bbox: { x: 100, y: 100, width: 50, height: 20 }, confidence: 0.9 }),
  ]);
  check('dedupe: different text at overlapping positions → both kept', distinct.kept.length, 2);

  const nullBbox = dedupeOcrSpans([
    span('D1', { bbox: null, confidence: 0.9 }),
    span('D1', { bbox: null, confidence: 0.8 }),
  ]);
  check('dedupe: null-bbox spans can never be proven duplicates → both kept', nullBbox.kept.length, 2);

  const counted = dedupeOcrSpans([
    span('D1', { bbox: { x: 100, y: 100, width: 50, height: 20 }, confidence: 0.9, flags: { duplicated: true, duplicateCount: 2 } }),
    span('D1', { bbox: { x: 101, y: 101, width: 50, height: 20 }, confidence: 0.8 }),
  ]);
  check('dedupe: duplicateCount sums across merges (2 + 1 = 3)', counted.kept[0].flags.duplicateCount, 3);

  const tie = dedupeOcrSpans([
    span('D1', { bbox: { x: 100, y: 100, width: 50, height: 20 }, confidence: 0.8 }),
    span('D1', { bbox: { x: 102, y: 101, width: 50, height: 20 }, confidence: 0.8 }),
  ]);
  check('dedupe: confidence tie → first span wins', tie.kept[0].bbox?.x, 100);

  check('dedupe: normalizeOcrText collapses whitespace', normalizeOcrText('  D1   Pintu '), 'D1 Pintu');

  // =======================================================================
  // D. Routing — spans shaped into I2/I3/I5 candidates (never validated here)
  // =======================================================================
  checkTrue('routing: "3.500" is dimension-like', isDimensionLikeText('3.500'));
  checkTrue('routing: "15/30" is dimension-like', isDimensionLikeText('15/30'));
  checkTrue('routing: "Ø12" is dimension-like', isDimensionLikeText('Ø12'));
  checkTrue('routing: "+3.500" is dimension-like', isDimensionLikeText('+3.500'));
  checkTrue('routing: "2.500 × 3.000" is dimension-like', isDimensionLikeText('2.500 × 3.000'));
  checkTrue('routing: "Lebar: 3.500" is dimension-like', isDimensionLikeText('Lebar: 3.500'));
  checkTrue('routing: "3500 mm" is dimension-like', isDimensionLikeText('3500 mm'));
  checkTrue('routing: "D12-150" is dimension-like', isDimensionLikeText('D12-150'));
  checkTrue('routing: "D1" is NOT dimension-like (it is a mark)', !isDimensionLikeText('D1'));
  checkTrue('routing: "RUANG TAMU" is NOT dimension-like', !isDimensionLikeText('RUANG TAMU'));
  checkTrue('routing: bare "2026" is NOT dimension-like (a year is not 2026 mm)', !isDimensionLikeText('2026'));
  checkTrue('routing: bare "120" is NOT dimension-like (ambiguous count)', !isDimensionLikeText('120'));
  checkTrue('routing: "SKALA 1:100" is NOT dimension-like', !isDimensionLikeText('SKALA 1:100'));
  checkTrue('routing: "1:100" is NOT dimension-like', !isDimensionLikeText('1:100'));
  checkTrue('routing: "DENAH LT.2" is NOT dimension-like', !isDimensionLikeText('DENAH LT.2'));

  checkTrue('routing: "D1" is mark-like', isMarkLikeText('D1'));
  checkTrue('routing: "P1" is mark-like', isMarkLikeText('P1'));
  checkTrue('routing: "K1" is mark-like', isMarkLikeText('K1'));
  checkTrue('routing: "3.500" is NOT mark-like', !isMarkLikeText('3.500'));

  checkTrue('routing: "LIHAT DETAIL A" is reference-like', isReferenceLikeText('LIHAT DETAIL A'));
  checkTrue('routing: "POTONGAN B-B" is reference-like', isReferenceLikeText('POTONGAN B-B'));
  checkTrue('routing: "DENAH LT.2" is reference-like', isReferenceLikeText('DENAH LT.2'));
  checkTrue('routing: "RUANG TAMU" is NOT reference-like', !isReferenceLikeText('RUANG TAMU'));

  checkTrue('routing: pipe-joined row is schedule-row-like', isScheduleRowLikeText('D1 | Pintu | 900 x 2100 | Kayu'));
  checkTrue('routing: mark + dimension pair is schedule-row-like', isScheduleRowLikeText('D1 Pintu 900 x 2100'));
  checkTrue('routing: bare "D1" is NOT schedule-row-like', !isScheduleRowLikeText('D1'));

  const mixed = [
    span('3.500'),
    span('D1'),
    span('LIHAT DETAIL A'),
    span('RUANG TAMU'),
    span('D1 | Pintu | 900 x 2100 | Kayu'),
  ];
  check('routing: dimension candidates pick only dimension-like spans', ocrSpansToDimensionCandidates(mixed).length, 1);
  check('routing: dimension candidate text is verbatim', ocrSpansToDimensionCandidates(mixed)[0].text, '3.500');
  check('routing: mark candidates pick only marks', ocrSpansToMarkCandidates(mixed).length, 1);
  check('routing: reference candidates pick only references', ocrSpansToReferences(mixed).length, 1);
  check('routing: schedule-row candidates pick only rows', ocrSpansToScheduleRowCandidates(mixed).length, 1);

  const proposals = ocrSpansToProposals(mixed, { page: 1 });
  const kindOf = (text: string): string | undefined => proposals.find((p) => p.rawText === text)?.kind;
  check('routing: dimension span → dimension proposal', kindOf('3.500'), 'dimension');
  check('routing: mark span → symbol proposal', kindOf('D1'), 'symbol');
  check('routing: reference span → text proposal', kindOf('LIHAT DETAIL A'), 'text');
  check('routing: schedule row span → table proposal', kindOf('D1 | Pintu | 900 x 2100 | Kayu'), 'table');
  check('routing: room label span → text proposal (audit trail only)', kindOf('RUANG TAMU'), 'text');
  checkTrue('routing: proposal carries the span in raw', proposals[0].raw === mixed[0]);
  check('routing: proposal page stamped', proposals[0].page, 1);

  const truncatedRouting = ocrSpansToProposals(
    [
      span('3.5', { flags: { truncated: true }, status: 'NEEDS_REVIEW', confidence: 0.75 }),
      span('D1', { flags: { truncated: true }, status: 'NEEDS_REVIEW', confidence: 0.75 }),
      span('D1 | Pintu | 900 x 2100', { flags: { truncated: true }, status: 'NEEDS_REVIEW', confidence: 0.75 }),
    ],
    { page: 1 },
  );
  check('routing: truncated dimension → text, never dimension', truncatedRouting[0].kind, 'text');
  check('routing: truncated mark → text, never symbol', truncatedRouting[1].kind, 'text');
  check('routing: truncated row → text, never table', truncatedRouting[2].kind, 'text');

  // I10b E4 — letter-only marks route like digit marks when an opening
  // keyword qualifies them; the keyword is the discriminator.
  checkTrue('routing E4: "D-DOOR - 0.91X2.13" is schedule-row-like', isScheduleRowLikeText('D-DOOR - 0.91X2.13'));
  checkTrue('routing E4: "W WINDOW 1.52X1.83" is schedule-row-like', isScheduleRowLikeText('W WINDOW 1.52X1.83'));
  checkTrue('routing E4: pipe row with a letter mark is schedule-row-like', isScheduleRowLikeText('D | Door | 0.91 X 2.13'));
  checkTrue('routing E4: letter mark without a keyword is NOT schedule-row-like', !isScheduleRowLikeText('D 0.91X2.13'));
  checkTrue('routing E4: "A SECTION" is NOT schedule-row-like', !isScheduleRowLikeText('A SECTION'));
  const letterMarkProposals = ocrSpansToProposals(
    [span('D DOOR'), span('W-WINDOW'), span('A'), span('D DOOR', { flags: { truncated: true }, status: 'NEEDS_REVIEW', confidence: 0.75 })],
    { page: 1 },
  );
  check('routing E4: "D DOOR" span → symbol proposal', letterMarkProposals[0].kind, 'symbol');
  check('routing E4: symbol label is the mark alone ("D")', letterMarkProposals[0].label, 'D');
  check('routing E4: rawText keeps the full span', letterMarkProposals[0].rawText, 'D DOOR');
  check('routing E4: "W-WINDOW" span → symbol proposal', letterMarkProposals[1].kind, 'symbol');
  check('routing E4: symbol label is the mark alone ("W")', letterMarkProposals[1].label, 'W');
  check('routing E4: bare "A" (no keyword) → text, never symbol', letterMarkProposals[2].kind, 'text');
  check('routing E4: truncated letter mark → text, never symbol', letterMarkProposals[3].kind, 'text');

  // I10b E19 — scale-like spans route to legend proposals (a scanned
  // page's stated scale is captured by the pipeline's legend path).
  const scaleProposals = ocrSpansToProposals(
    [span('SKALA 1:100'), span('1:100'), span('SCALE - 1:100'), span('R.C.C 1:2:4'), span('Brickwork in C.M 1:5')],
    { page: 1 },
  );
  check('routing E19: "SKALA 1:100" span → legend proposal', scaleProposals[0].kind, 'legend');
  check('routing E19: bare "1:100" span → legend proposal', scaleProposals[1].kind, 'legend');
  check('routing E19: "SCALE - 1:100" span → legend proposal', scaleProposals[2].kind, 'legend');
  check('routing E19: mix ratio "R.C.C 1:2:4" → text, never legend', scaleProposals[3].kind, 'text');
  check('routing E19: mix ratio "C.M 1:5" → text, never legend', scaleProposals[4].kind, 'text');

  // Cache-hit recovery: spans ride in proposal raw; foreign proposals drop honestly.
  const recovered = ocrSpansFromProposals(proposals);
  check('recovery: all spans recovered from proposals', recovered.spans.length, 5);
  check('recovery: zero unrecoverable for OCR proposals', recovered.unrecoverable, 0);
  const foreign = ocrSpansFromProposals([
    { kind: 'dimension', label: '3.500', rawText: '3.500', bbox: null, confidence: 0.9, page: 1, status: 'HIGH_CONFIDENCE', raw: { kind: 'dimension' } },
  ]);
  check('recovery: foreign proposal (no span in raw) is unrecoverable', foreign.unrecoverable, 1);
  check('recovery: foreign proposal yields no span', foreign.spans.length, 0);

  // =======================================================================
  // E. Scanned-page end-to-end through the pipeline (stubbed responder)
  // =======================================================================
  const linked = makeResponder(ocrScript({ 1: floorPlanOcrSpans() }));
  const linkedRes = await runVisionPage({
    ...scannedPage(1),
    docHash: 'doc-ocr-e1',
    mode: 'EZRAB_AI',
    responder: linked.responder,
    renderPage: stubRenderPage(),
    budget: { used: 0, max: 40 },
    schedule: D1_SCHEDULE,
  });
  checkTrue('e2e-linked: OCR pass ran', linkedRes.ocrPass);
  check('e2e-linked: 8 OCR spans read', linkedRes.ocrSpans.length, 8);
  check('e2e-linked: page re-classified from OCR text to FLOOR_PLAN', linkedRes.classification.drawingClass, 'FLOOR_PLAN');
  check('e2e-linked: policy re-evaluated to full', linkedRes.policy, 'full');
  check('e2e-linked: exactly one vision call (OCR-as-survey, no pre-pass)', linkedRes.cost.calls, 1);
  checkTrue('e2e-linked: no DETAIL re-pass (nothing unresolved)', !linkedRes.detailPass);
  check('e2e-linked: the one call was the OCR prompt', linked.calls.length, 1);
  checkTrue('e2e-linked: OCR prompt sent', linked.calls[0].prompt.includes('TASK — OCR'));
  checkTrue('e2e-linked: survey prompt NOT sent for a scanned page', !linked.calls[0].prompt.includes('TASK — PAGE SURVEY'));
  check('e2e-linked: two dimension records (3.500 + 2.800)', linkedRes.dimensions.length, 2);
  const dim3500 = linkedRes.dimensions.find((d) => d.originalText === '3.500');
  check('e2e-linked: I2 wins — "3.500" parses to 3500 mm, not the model\'s 9999', dim3500?.normalizedValue, 3500);
  check('e2e-linked: dimension status HIGH_CONFIDENCE', dim3500?.status, 'HIGH_CONFIDENCE');
  checkTrue('e2e-linked: no record carries the invented 9999', linkedRes.dimensions.every((d) => d.normalizedValue !== 9999));
  checkTrue('e2e-linked: truncated "3.5…" never became a dimension record', linkedRes.dimensions.every((d) => d.originalText !== '3.5…'));
  const dim2800 = linkedRes.dimensions.find((d) => d.originalText === '2.800');
  check('e2e-linked: out-of-bounds-bbox dimension still parses (2800 mm)', dim2800?.normalizedValue, 2800);
  check('e2e-linked: out-of-bounds-bbox dimension has no region', dim2800?.region, undefined);
  checkTrue('e2e-linked: in-bounds dimension keeps its region', dim3500?.region !== undefined);
  check('e2e-linked: one opening (D1)', linkedRes.openings.length, 1);
  check('e2e-linked: D1 linked to the schedule (900 mm)', linkedRes.openings[0].widthMm, 900);
  check('e2e-linked: D1 linked to the schedule (2100 mm)', linkedRes.openings[0].heightMm, 2100);
  check('e2e-linked: D1 link status HIGH_CONFIDENCE', linkedRes.openings[0].status, 'HIGH_CONFIDENCE');
  check('e2e-linked: one cross-sheet reference recorded', linkedRes.references.length, 1);
  check('e2e-linked: reference kind DETAIL', linkedRes.references[0].kind, 'DETAIL');
  check('e2e-linked: reference target "DETAIL A"', linkedRes.references[0].to.ref, 'DETAIL A');
  check('e2e-linked: page status HIGH_CONFIDENCE', linkedRes.status, 'HIGH_CONFIDENCE');
  check('e2e-linked: no skip', linkedRes.skippedReason, null);
  const ocr3500 = linkedRes.ocrSpans.find((s) => s.text === '3.500');
  checkTrue('e2e-linked: OCR span itself carries no model number', ocr3500 !== undefined && !('normalizedValue' in ocr3500));

  // Unlinked mark → UNRESOLVED + null dims, and the DETAIL escalation still runs.
  const unlinked = makeResponder(ocrScript({ 1: floorPlanOcrSpans() }));
  const unlinkedRes = await runVisionPage({
    ...scannedPage(1),
    docHash: 'doc-ocr-e2',
    mode: 'EZRAB_AI',
    responder: unlinked.responder,
    renderPage: stubRenderPage(),
    budget: { used: 0, max: 40 },
    schedule: [],
  });
  checkTrue('e2e-unlinked: OCR pass ran', unlinkedRes.ocrPass);
  check('e2e-unlinked: D1 with no schedule → UNRESOLVED', unlinkedRes.openings[0].status, 'UNRESOLVED');
  check('e2e-unlinked: D1 width null (never guessed)', unlinkedRes.openings[0].widthMm, null);
  check('e2e-unlinked: D1 height null (never guessed)', unlinkedRes.openings[0].heightMm, null);
  check('e2e-unlinked: D1 schedulePage null', unlinkedRes.openings[0].schedulePage, null);
  checkTrue('e2e-unlinked: DETAIL escalation ran for the unresolved mark', unlinkedRes.detailPass);
  check('e2e-unlinked: two calls (OCR + DETAIL)', unlinkedRes.cost.calls, 2);
  checkTrue('e2e-unlinked: second call was the focused symbol prompt', unlinked.calls[1].prompt.includes('TASK — SYMBOLS'));

  // =======================================================================
  // E2. I10b — scanned-page scale capture (E19) + letter-only marks (E4),
  //     end-to-end through the pipeline (stubbed responder)
  // =======================================================================
  const e19Spans = {
    spans: [
      { text: 'DENAH LANTAI 1', bbox: { x: 10, y: 10, width: 200, height: 30 }, confidence: 0.95 },
      { text: '3.500', bbox: { x: 400, y: 50, width: 60, height: 20 }, confidence: 0.95 },
      { text: 'D DOOR', bbox: { x: 300, y: 300, width: 60, height: 30 }, confidence: 0.9 },
      { text: 'D-DOOR - 0.91X2.13', bbox: { x: 50, y: 600, width: 300, height: 20 }, confidence: 0.9 },
      { text: 'SKALA 1:100', bbox: { x: 800, y: 1350, width: 120, height: 20 }, confidence: 0.9 },
    ],
  };
  const e19 = makeResponder(ocrScript({ 1: e19Spans }));
  const e19Doc = await runVisionDocument({
    docHash: 'doc-ocr-e19',
    mode: 'EZRAB_AI',
    pages: [scannedPage(1)],
    responder: e19.responder,
    renderPage: stubRenderPage(),
  });
  const e19Page = e19Doc.pages[0];
  check('e2e-E19: scanned scale captured from the OCR legend span', e19Page.scale?.statedScale, '1:100');
  check('e2e-E19: scale method STATED_ONLY', e19Page.scale?.method, 'STATED_ONLY');
  checkTrue(
    'e2e-E19: the SKALA span became a legend proposal',
    e19Page.proposals.some((p) => p.kind === 'legend' && p.rawText === 'SKALA 1:100'),
  );
  const e19D = e19Doc.openings.find((o) => o.mark === 'D');
  checkTrue('e2e-E4: letter-only mark D became an opening', e19D !== undefined);
  check('e2e-E4: D linked via the OCR schedule row (910 mm)', e19D?.widthMm, 910);
  check('e2e-E4: D linked via the OCR schedule row (2130 mm)', e19D?.heightMm, 2130);
  check('e2e-E4: D link status HIGH_CONFIDENCE', e19D?.status, 'HIGH_CONFIDENCE');

  // =======================================================================
  // F. Non-scanned page — NO OCR pass, ever
  // =======================================================================
  const textLayer = makeResponder(() => ({ detections: [] }));
  const textRes = await runVisionPage({
    page: 1,
    title: 'Denah Lantai 1',
    text: 'DENAH LANTAI 1 RUANG TAMU',
    hasTextLayer: true,
    widthPx: PAGE_W,
    heightPx: PAGE_H,
    base64Length: 100,
    docHash: 'doc-ocr-f',
    mode: 'EZRAB_AI',
    responder: textLayer.responder,
    renderPage: stubRenderPage(),
    budget: { used: 0, max: 40 },
  });
  checkTrue('nonscan: OCR pass did NOT run', !textRes.ocrPass);
  check('nonscan: zero OCR spans', textRes.ocrSpans.length, 0);
  checkTrue('nonscan: OCR prompt never sent', textLayer.calls.every((c) => !c.prompt.includes('TASK — OCR')));
  checkTrue('nonscan: survey prompt sent instead', textLayer.calls.some((c) => c.prompt.includes('TASK — PAGE SURVEY')));
  check('nonscan: classified from the native text layer', textRes.classification.drawingClass, 'FLOOR_PLAN');

  // =======================================================================
  // G. Cache — OCR entries never collide with survey/detail entries
  // =======================================================================
  check('cache: OCR roiId carries the pass segment + version', OCR_ROI_ID, `full:ocr:${OCR_PROMPT_VERSION}`);
  const ocrKey = visionCacheKey({ docHash: 'h', page: 1, roiId: OCR_ROI_ID, promptVersion: VISION_PROMPT_VERSION, modelVersion: VISION_MODEL_VERSION });
  const surveyKey = visionCacheKey({ docHash: 'h', page: 1, roiId: 'full', promptVersion: VISION_PROMPT_VERSION, modelVersion: VISION_MODEL_VERSION });
  const detailKey = visionCacheKey({ docHash: 'h', page: 1, roiId: 'full:detail', promptVersion: VISION_PROMPT_VERSION, modelVersion: VISION_MODEL_VERSION });
  checkTrue('cache: OCR key differs from the survey key', ocrKey !== surveyKey);
  checkTrue('cache: OCR key differs from the DETAIL key', ocrKey !== detailKey);
  checkTrue('cache: survey key differs from the DETAIL key', surveyKey !== detailKey);
  check('cache: tile OCR roiId', ocrTileRoiId('roi-0-0-100-100'), `roi-0-0-100-100:ocr:${OCR_PROMPT_VERSION}`);
  checkTrue('cache: tile OCR roiId differs from the tile survey roiId', ocrTileRoiId('roi-0-0-100-100') !== 'roi-0-0-100-100');

  // Second run of the same page costs zero provider calls; spans recover from cache.
  const cache = new VisionCache<VisionParseResult>();
  const cachedCalls = makeResponder(ocrScript({ 1: floorPlanOcrSpans() }));
  const firstRun = await runVisionPage({
    ...scannedPage(1),
    docHash: 'doc-ocr-g',
    mode: 'EZRAB_AI',
    responder: cachedCalls.responder,
    renderPage: stubRenderPage(),
    cache,
    budget: { used: 0, max: 40 },
    schedule: D1_SCHEDULE,
  });
  check('cache: first run made 1 call', firstRun.cost.calls, 1);
  const secondRun = await runVisionPage({
    ...scannedPage(1),
    docHash: 'doc-ocr-g',
    mode: 'EZRAB_AI',
    responder: cachedCalls.responder,
    renderPage: stubRenderPage(),
    cache,
    budget: { used: 0, max: 40 },
    schedule: D1_SCHEDULE,
  });
  check('cache: second run made 0 calls', secondRun.cost.calls, 0);
  checkTrue('cache: second run was a cache hit', secondRun.cacheHit);
  check('cache: spans recovered from cache (8)', secondRun.ocrSpans.length, 8);
  check('cache: dimensions recovered from cache (2)', secondRun.dimensions.length, 2);
  check('cache: responder called once in total', cachedCalls.calls.length, 1);

  // =======================================================================
  // H. Cap — OCR calls count toward the 40-call document cap
  // =======================================================================
  const capped = makeResponder(ocrScript({ 1: floorPlanOcrSpans(), 2: floorPlanOcrSpans() }));
  const cappedDoc = await runVisionDocument({
    docHash: 'doc-ocr-h',
    mode: 'EZRAB_AI',
    pages: [scannedPage(1), scannedPage(2)],
    responder: capped.responder,
    renderPage: stubRenderPage(),
    maxCallsPerDocument: 1,
    schedule: D1_SCHEDULE,
  });
  check('cap: exactly 1 call spent', cappedDoc.totalCost.calls, 1);
  checkTrue('cap: budget hit flagged', cappedDoc.budgetHit);
  checkTrue('cap: page 1 got its OCR pass', cappedDoc.pages[0].ocrPass);
  check('cap: page 2 skipped for budget', cappedDoc.pages[1].skippedReason, 'budget');
  check('cap: page 2 recorded NOT_DETECTED', cappedDoc.pages[1].status, 'NOT_DETECTED');
  checkTrue('cap: page 2 got no OCR pass', !cappedDoc.pages[1].ocrPass);
  check('cap: responder called once', capped.calls.length, 1);

  // =======================================================================
  // I. Negatives — duplicated rows must not double-count; invented
  //    dimensions must not become records
  // =======================================================================
  const dupSpans = {
    spans: [
      { text: 'DENAH LANTAI 1', bbox: { x: 10, y: 10, width: 200, height: 30 }, confidence: 0.95 },
      { text: 'D1 | Pintu | 900 x 2100 | Kayu', bbox: { x: 100, y: 100, width: 300, height: 20 }, confidence: 0.9 },
      { text: 'D1 | Pintu | 900 x 2100 | Kayu', bbox: { x: 102, y: 101, width: 300, height: 20 }, confidence: 0.8 },
      { text: 'D1', bbox: { x: 300, y: 300, width: 30, height: 30 }, confidence: 0.9 },
      { text: 'D1', bbox: { x: 301, y: 301, width: 30, height: 30 }, confidence: 0.85 },
    ],
  };
  const dupCalls = makeResponder(ocrScript({ 1: dupSpans }));
  const dupDoc = await runVisionDocument({
    docHash: 'doc-ocr-i',
    mode: 'EZRAB_AI',
    pages: [scannedPage(1)],
    responder: dupCalls.responder,
    renderPage: stubRenderPage(),
  });
  check('neg-dup: duplicated row spans collapse to 3 OCR spans', dupDoc.pages[0].ocrSpans.length, 3);
  check('neg-dup: duplicated schedule row yields ONE schedule entry', dupDoc.scheduleEntries.length, 1);
  check('neg-dup: duplicated mark yields ONE opening', dupDoc.openings.length, 1);
  check('neg-dup: duplicated mark counted ONCE (quantity 1, not 2)', dupDoc.openings[0].quantity, 1);
  const keptRow = dupDoc.pages[0].ocrSpans.find((s) => s.text.startsWith('D1 |'));
  check('neg-dup: kept row records duplicateCount 2', keptRow?.flags.duplicateCount, 2);
  checkTrue('neg-dup: dedupe warned about the merge', dupDoc.pages[0].warnings.some((w) => w.includes('digabung')));
  check('neg-dup: linked D1 width from the single row', dupDoc.openings[0].widthMm, 900);

  // A room label is not a dimension; a bare year is not a dimension.
  const labelOnly = makeResponder(
    ocrScript({
      1: {
        spans: [
          { text: 'DENAH LANTAI 1', bbox: { x: 10, y: 10, width: 200, height: 30 }, confidence: 0.95 },
          { text: 'RUANG TAMU', bbox: { x: 100, y: 200, width: 120, height: 25 }, confidence: 0.9 },
          { text: '2026', bbox: { x: 900, y: 10, width: 50, height: 20 }, confidence: 0.9 },
        ],
      },
    }),
  );
  const labelRes = await runVisionPage({
    ...scannedPage(1),
    docHash: 'doc-ocr-i2',
    mode: 'EZRAB_AI',
    responder: labelOnly.responder,
    renderPage: stubRenderPage(),
    budget: { used: 0, max: 40 },
  });
  check('neg-label: no dimension records from labels/a bare year', labelRes.dimensions.length, 0);
  check('neg-label: page still re-classified from OCR text', labelRes.classification.drawingClass, 'FLOOR_PLAN');
  checkTrue('neg-label: OCR pass ran', labelRes.ocrPass);

  // --- Summary ------------------------------------------------------------
  check('network: fetch was never called', fetchCalls, 0);
  (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
  }
  console.log(`PASS ${passed}/${total}`);
  if (passed !== total) process.exit(1);
}

main().catch((e) => {
  console.error(`FATAL: ${e instanceof Error ? e.stack || e.message : String(e)}`);
  process.exit(1);
});

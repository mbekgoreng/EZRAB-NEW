/**
 * I8a — Gateway vision-mode client for the DED drawing-vision layer.
 *
 * STUB-FIRST: every test in this program injects a stub `VisionResponder`.
 * The real responder (`createGatewayVisionResponder`) posts to the EZRAB
 * gateway ONLY — no provider keys, no provider URLs, no direct provider
 * fetch from this module. No live call is made anywhere in this file.
 *
 * Gateway contract (read from source 2026-11-22 — do not guess it):
 *
 * ENDPOINT
 *   POST /api/ai/multi-provider/execute
 *   (`api/ai/multi-provider/execute.js` — thin wrapper over
 *   `handleAiRequest` in `api/_lib/aiGateway.js`.) Vision is reached HERE
 *   with `mode: 'vision'`; `/api/ai/tools/execute` has no vision mapping.
 *
 * REQUEST BODY — validated by `validateAiInput` (`api/_lib/security.js:200-296`):
 *   message          string, required, ≤ 20000 chars (aliases: prompt, input)
 *                    — security.js:214-216.
 *   mode             'vision' (only 'advanced'/'vision' pass through; every
 *                    other value is clamped to 'fast') — security.js:219-221.
 *   temperature      0..1, default 0.3 — security.js:223.
 *   maxTokens        100..8000, default 4000 — security.js:223.
 *   systemPrompt     string ≤ 20000 chars — security.js:230-238.
 *   jsonMode         boolean — security.js:239.
 *   imageDataBase64  pure base64 OR a data URL (the `data:<mime>;base64,`
 *                    prefix is stripped server-side) — security.js:256-266,
 *                    sanitizeMedia at security.js:303-331.
 *   imageMimeType    allowlist: image/png, image/jpeg, image/webp; default
 *                    image/png; a value outside the allowlist is
 *                    NORMALIZED to the default, not rejected — security.js:317.
 *   stream           MUST be false/absent with media (rejected INVALID_REQUEST)
 *                    — security.js:276. stream + jsonMode is also rejected.
 *   pdfDataBase64    DEAD for vision: `executeAI` fail-fasts with
 *                    'Vision PDF tidak didukung…' because the only PDF-capable
 *                    leg (Gemini native) was removed 2026-11-22
 *                    — aiGateway.js:1050-1052. Never send a PDF here.
 *
 * SIZE CAP
 *   MAX_MEDIA_B64_CHARS = 3_500_000 base64 chars (~2.6 MB binary)
 *   — security.js:303. Exceeding it is a 400 PAYLOAD_TOO_LARGE.
 *   (The HTTP body cap is 4 MiB — security.js:160 — so a max-size image
 *   plus prompt still fits, but only just; keep prompts short.)
 *
 * VISION CHAIN (aiGateway.js:1041-1058) — single image per request:
 *   River deepseek-ai/DeepSeek-V4.1-Flash (RIVER_VISION_MODEL, :138)
 *   → Atmo ag/gemini-3.8-flash-high (ATMO_VISION_MODEL = ATMO_ADVANCED_MODEL, :161)
 *   → ZyRouter.
 * Chain time budget 240 s + one in-flight attempt (55 s) = worst case 295 s
 * (aiGateway.js:1136-1156); the client default timeout below (300 s) matches
 * the established client abort window (301 s) quoted in that comment.
 *
 * SUCCESS RESPONSE — HTTP 200 (aiGateway.js ~1897-1914):
 *   { success: true, content, model: 'Ezrab-flash-v1' (MASKED alias —
 *     modelMasking.js:6,31-33), provider: 'ezrab' (masked),
 *     mode, requestId, durationMs,
 *     usage: { inputTokens, outputTokens, totalTokens, cachedTokens,
 *              reasoningTokens } | null, usageStatus }
 *   `attempts[]` is NOT returned (masked out server-side).
 *
 * ERROR RESPONSES — all `{ success: false, error, errorCode?, requestId }`:
 *   400 INVALID_REQUEST / PAYLOAD_TOO_LARGE (validation — security.js),
 *   400 CONTENT_REJECTED / AI_BAD_REQUEST / MEDIA_NOT_SUPPORTED_FOR_MODE
 *       (executeAI fail-fast, aiGateway.js ~1927),
 *   401 AUTH_REQUIRED, 403 (CORS / DEMO_RESTRICTED), 429 RATE_LIMITED
 *       (+ retryAfterMs), 502 'AI sedang tidak tersedia.' (all legs failed).
 *
 * Prompt discipline is inherited from the v2/v3 vision readers (unmounted,
 * mined for conventions only — their stacks are NOT reused):
 *   - "Do NOT estimate dimensions" + MISSING_DATA status
 *     (ded-rab-v2/ai/dedVisionReader.ts:12,65,293-294).
 *   - referencesToOtherPages in the page-visual schema
 *     (ded-rab-v2/ai/pageVisualReader.ts:113,190).
 *   - door/window schedules in the per-page prompt
 *     (ded-rab-v3/reading/dedDocumentReader.ts:89,130-132).
 */

import type { BoundingBox, VisionReviewStatus } from './types';
import { statusFromConfidence } from './types';

/** The one and only network target of this module. */
export const VISION_GATEWAY_ENDPOINT = '/api/ai/multi-provider/execute';

/** Gateway media cap — api/_lib/security.js:303. Base64 chars, not bytes. */
export const MAX_VISION_BASE64_CHARS = 3_500_000;

/** Gateway image allowlist — api/_lib/security.js:260. */
export const VISION_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type VisionImageMimeType = (typeof VISION_IMAGE_MIME_TYPES)[number];

/** Default client timeout: 300 s, matching the gateway chain budget + overshoot. */
export const DEFAULT_VISION_TIMEOUT_MS = 300_000;

/**
 * Version of the prompts built by this module. Bump on ANY prompt change —
 * the vision cache keys on it, so a prompt change can never reuse stale
 * detections (see visionCache.ts).
 * v2 (I11 Stage 3, fix 4): bare-value dimension rule — a dimension printed
 * as part of a longer callout goes in "rawText" as the bare value only,
 * with the full callout in "label" (the live pilot showed full callouts
 * like `2" HMA CLASS 1/2"` failing dimension validation 7/8 times).
 * v3 (I11 Stage 4): F9/F10 mitigations — the symbol prompt caps unmarked
 * symbols at 10 per page (a 246-identical flood burned 16K tokens @1×)
 * and the dimension prompt forbids repeating one value in a grid (the
 * 49× `0.91` confabulation); E18 de-poisoning — the dimension example
 * label is now neutral (`wall length`) so the model only writes
 * "overall" deliberately (the label now evidences the OVERALL/CHAINED
 * kind). Cache keys change with the version, so no stale v2 detection
 * is ever reused.
 */
export const VISION_PROMPT_VERSION = 'v3';

/** Model-version label carried in cache keys (masked alias the gateway returns). */
export const VISION_MODEL_VERSION = 'Ezrab-flash-v1';

/** Gateway token-usage fields — aiGateway.js:1399. */
export interface GatewayVisionUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  cachedTokens?: number | null;
  reasoningTokens?: number | null;
}

// ---------------------------------------------------------------------------
// Errors — typed, never a thrown raw Response
// ---------------------------------------------------------------------------

export type VisionErrorKind =
  | 'oversize' // image exceeds the gateway base64 cap (client-side guard)
  | 'invalid_image' // not a data URL / not valid base64 / unsupported mime
  | 'invalid_request' // prompt empty, bad dims, bad options (caller bug)
  | 'network' // fetch itself failed (offline, DNS, socket)
  | 'timeout' // client-side timeout fired
  | 'unauthorized' // HTTP 401 / AUTH_REQUIRED
  | 'bad_request' // HTTP 400 / CONTENT_REJECTED / AI_BAD_REQUEST / …
  | 'rate_limited' // HTTP 429 / RATE_LIMITED
  | 'unavailable' // HTTP 502 / 5xx — all gateway legs failed
  | 'gateway' // any other non-2xx or success:false payload
  | 'invalid_response'; // body unparseable / missing content

export class VisionError extends Error {
  readonly kind: VisionErrorKind;
  /** HTTP status when the error came from an HTTP response; null otherwise. */
  readonly httpStatus: number | null;
  /** Gateway errorCode when the server sent one (e.g. PAYLOAD_TOO_LARGE). */
  readonly errorCode: string | null;
  /** True when retrying the same request later may succeed. */
  readonly retryable: boolean;
  /** Server-suggested wait (429 retryAfterMs), when present. */
  readonly retryAfterMs: number | null;

  constructor(
    kind: VisionErrorKind,
    message: string,
    opts: {
      httpStatus?: number | null;
      errorCode?: string | null;
      retryable?: boolean;
      retryAfterMs?: number | null;
    } = {},
  ) {
    super(message);
    this.name = 'VisionError';
    this.kind = kind;
    this.httpStatus = opts.httpStatus ?? null;
    this.errorCode = opts.errorCode ?? null;
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }
}

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

/**
 * What a responder needs: the image, the prompt, and generation params.
 * Page/ROI context lives in `VisionAnalyzeInput` (client level) — the
 * gateway never sees it.
 */
export interface VisionRequest {
  /** Full data URL (`data:image/png;base64,…`) or bare base64. */
  imageDataUrl: string;
  /** The user prompt (sent as `message`). Must be non-empty, ≤ 20000 chars. */
  prompt: string;
  /** Optional system prompt (≤ 20000 chars). The server prepends its own
   *  policy before it — composeSystemPrompt, aiGateway.js. */
  systemPrompt?: string;
  /** 0..1, default 0.3 (gateway default). Low = more deterministic extraction. */
  temperature?: number;
  /**
   * 100..8000, clamped client-side to the gateway range. Default 8000:
   * vision JSON responses are token-heavy and a truncated list corrupts the
   * whole parse; the live DED path already effectively asks for 8000
   * (FAST 16k / DETAIL 24–32k clamped server-side). Callers may lower it.
   */
  maxTokens?: number;
}

/** The gateway's success body, normalized (see the contract header). */
export interface VisionResponse {
  /** Raw model output text — the JSON the parser consumes. */
  content: string;
  /** Masked model alias, e.g. 'Ezrab-flash-v1'; null when absent. */
  model: string | null;
  /** Masked provider display value ('ezrab'); null when absent. */
  provider: string | null;
  requestId: string | null;
  durationMs: number | null;
  usage: GatewayVisionUsage | null;
  usageStatus: string | null;
}

/**
 * The seam between the client and the transport. The real implementation
 * (`createGatewayVisionResponder`) posts to the gateway; tests inject a
 * stub. The client NEVER constructs a live fetch itself.
 */
export type VisionResponder = (request: VisionRequest) => Promise<VisionResponse>;

/** Detection kinds the parser accepts. Unknown kinds are dropped, never mapped. */
export type VisionProposalKind = 'dimension' | 'symbol' | 'table' | 'legend' | 'object' | 'text';

export const VISION_PROPOSAL_KINDS: readonly VisionProposalKind[] = [
  'dimension',
  'symbol',
  'table',
  'legend',
  'object',
  'text',
];

/**
 * One parsed, typed proposal from a vision read. A PROPOSAL, not a fact:
 * downstream deterministic validation (dimensions.ts, openings.ts, …)
 * decides whether it becomes evidence. `status` is capped at
 * HIGH_CONFIDENCE — proposals NEVER arrive VERIFIED.
 */
export interface VisionDetectionProposal {
  kind: VisionProposalKind;
  /** Short label for the detection (e.g. mark "D1", dimension text, table title). */
  label: string;
  /** The exact text as read from the drawing — verbatim, never rewritten. */
  rawText: string;
  /** Image-pixel bbox ({x, y, width, height} in pixels of the sent image),
   *  or null when the model gave none / an out-of-bounds one. */
  bbox: BoundingBox | null;
  /** 0..1, clamped. */
  confidence: number;
  /** 1-based page the proposal came from. */
  page: number;
  /** ROI id when the proposal came from a cropped region (see roi.ts). */
  roiId?: string;
  /** From statusFromConfidence — HIGH_CONFIDENCE at best, never VERIFIED. */
  status: VisionReviewStatus;
  /** The unparsed model entry, kept verbatim for audit/debugging. */
  raw: unknown;
}

/** Result of parsing one vision response. */
export interface VisionParseResult {
  proposals: VisionDetectionProposal[];
  /** Entries dropped as malformed — the caller must know how many. */
  droppedCount: number;
  /** One human-readable line per drop / anomaly (parse warnings). */
  warnings: string[];
  /**
   * Aggregate status: UNRESOLVED when zero proposals parse (never an
   * invented detection); otherwise the status of the highest-confidence
   * proposal. Per-proposal `status` is the authoritative field.
   */
  status: VisionReviewStatus;
  /**
   * True when the model output was cut off mid-JSON (the gateway's
   * 8,000-token output clamp) and the proposals above are SALVAGED
   * complete entries from the truncated array — a PARTIAL read, never
   * a full read. False for complete responses and for garbage input
   * with no JSON array at all. The pipeline records this on the page
   * result (partialRead) and escalates to focused re-reads.
   */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Image size guard + scale helpers
// ---------------------------------------------------------------------------

const BASE64_ALPHABET = /^[A-Za-z0-9+/=]+$/;
const DATA_URL_RE = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

/**
 * Split a data URL (or bare base64) into mime type + base64 payload.
 * Mirrors the gateway's sanitizeMedia (security.js:309-318): data-URL prefix
 * stripped, mime defaulted to image/png when absent, non-allowlist mime
 * NORMALIZED to image/png (never rejected — the gateway does the same).
 * Throws VisionError('invalid_image') for non-base64 payloads.
 */
export function splitVisionDataUrl(dataUrl: string): { mimeType: VisionImageMimeType; base64: string } {
  if (typeof dataUrl !== 'string' || dataUrl.trim().length === 0) {
    throw new VisionError('invalid_image', 'Vision image is empty — expected a data URL or base64 string.');
  }
  const trimmed = dataUrl.trim().replace(/\s+/g, '');
  const match = trimmed.match(DATA_URL_RE);
  let mime = 'image/png';
  let base64 = trimmed;
  if (match) {
    mime = match[1].toLowerCase();
    base64 = match[2];
  }
  if (!(VISION_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) mime = 'image/png';
  if (base64.length === 0 || !BASE64_ALPHABET.test(base64)) {
    throw new VisionError('invalid_image', 'Vision image payload is not valid base64.');
  }
  return { mimeType: mime as VisionImageMimeType, base64 };
}

/**
 * Reject (VisionError 'oversize') when the base64 payload exceeds the
 * gateway cap (3.5M chars). The data-URL prefix is NOT counted — the
 * gateway strips it before measuring (security.js:309-322). Exactly at the
 * cap is ACCEPTED (the gateway rejects only `> MAX`, security.js:319).
 * Returns the payload length so callers can log it.
 *
 * The client REFUSES oversize input rather than silently degrading it:
 * downscaling is I8b's render-scale choice (see visionImageScaleFactor /
 * visionDownscaleFactorForBase64).
 */
export function assertVisionImageSize(dataUrl: string): number {
  const { base64 } = splitVisionDataUrl(dataUrl);
  if (base64.length > MAX_VISION_BASE64_CHARS) {
    throw new VisionError(
      'oversize',
      `Vision image exceeds the gateway cap: ${base64.length.toLocaleString('en-US')} base64 chars ` +
        `(max ${MAX_VISION_BASE64_CHARS.toLocaleString('en-US')}). Downscale the render before sending.`,
      { errorCode: 'PAYLOAD_TOO_LARGE' },
    );
  }
  return base64.length;
}

/**
 * PURE helper: the linear downscale factor (0..1) needed so a
 * widthPx × heightPx image fits `maxBytes` under a BYTES-PER-PIXEL
 * estimate. Returns 1 when already within budget.
 *
 * HONESTY NOTE: PNG bytes do not scale deterministically with pixels —
 * line drawings compress far below 4 bytes/px. This helper uses the
 * uncompressed RGBA upper bound (4 bytes/px by default), so the factor
 * is CONSERVATIVE: a render scaled by it will fit the cap whenever the
 * estimate holds, and usually fits with room to spare. Prefer
 * `visionDownscaleFactorForBase64` when the real base64 length is known
 * (pdfPageService reports `base64Length` per page).
 *
 * Throws RangeError on non-finite / non-positive inputs.
 */
export function visionImageScaleFactor(
  widthPx: number,
  heightPx: number,
  maxBytes: number,
  bytesPerPixel = 4,
): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) throw new RangeError('visionImageScaleFactor: widthPx must be a positive finite number.');
  if (!Number.isFinite(heightPx) || heightPx <= 0) throw new RangeError('visionImageScaleFactor: heightPx must be a positive finite number.');
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new RangeError('visionImageScaleFactor: maxBytes must be a positive finite number.');
  if (!Number.isFinite(bytesPerPixel) || bytesPerPixel <= 0) throw new RangeError('visionImageScaleFactor: bytesPerPixel must be a positive finite number.');
  const estimatedBytes = widthPx * heightPx * bytesPerPixel;
  if (estimatedBytes <= maxBytes) return 1;
  return Math.sqrt(maxBytes / estimatedBytes);
}

/**
 * PURE helper: the linear downscale factor (0..1) for a render whose
 * MEASURED base64 length is known. Assumes encoded size scales with pixel
 * area (true to first order for a re-render at lower scale). Returns 1
 * when within the cap (default: the gateway cap). This is the helper I8b
 * should use with pdfPageService's `base64Length`.
 */
export function visionDownscaleFactorForBase64(
  base64Chars: number,
  maxChars: number = MAX_VISION_BASE64_CHARS,
): number {
  if (!Number.isFinite(base64Chars) || base64Chars < 0) throw new RangeError('visionDownscaleFactorForBase64: base64Chars must be a non-negative finite number.');
  if (!Number.isFinite(maxChars) || maxChars <= 0) throw new RangeError('visionDownscaleFactorForBase64: maxChars must be a positive finite number.');
  if (base64Chars <= maxChars) return 1;
  return Math.sqrt(maxChars / base64Chars);
}

// ---------------------------------------------------------------------------
// Prompt builders — pure functions returning prompt strings
// ---------------------------------------------------------------------------

export interface VisionPromptOptions {
  /** 1-based page number (stated in the prompt for traceability). */
  page: number;
  /** Pixel size of the image AS SENT — bboxes are in these coordinates. */
  imageWidthPx: number;
  imageHeightPx: number;
  /** Drawing class when known (from classification.ts); narrows the read. */
  drawingClass?: string;
}

/**
 * Shared discipline block — every prompt carries it verbatim. Inherited
 * from the v2 reader ("Do NOT estimate dimensions", MISSING_DATA) and the
 * program's evidence-first rule (PLAN.md §2.6).
 */
function promptDiscipline(opts: VisionPromptOptions): string {
  return [
    `You are reading page ${opts.page} of an architectural/engineering drawing.`,
    `The image is ${opts.imageWidthPx} px wide × ${opts.imageHeightPx} px tall.`,
    'RULES — follow them exactly:',
    '1. Report ONLY what is visible in the image. Do NOT estimate, guess, infer, or calculate any dimension, value, label, or count that is not clearly visible.',
    '2. Do NOT estimate dimensions. If a dimension is missing, unreadable, or cut off, report it as MISSING_DATA — never invent a value.',
    '3. Copy original text VERBATIM — character for character, including punctuation, spacing, and units. Never rewrite, translate, or normalize the text.',
    '4. Give bounding boxes in IMAGE-PIXEL coordinates: {"x": <left px>, "y": <top px>, "width": <px>, "height": <px>}, where (0,0) is the top-left corner of the image as sent. If you cannot locate an item precisely, set "bbox" to null — never guess a box.',
    '5. Give a "confidence" from 0 to 1 for EVERY item (0 = unreadable guess, 1 = perfectly clear).',
    '6. Return ONLY JSON matching the schema below. No prose, no markdown fences, no commentary outside the JSON.',
  ].join('\n');
}

const DETECTION_SCHEMA = `{
  "detections": [
    {
      "kind": "dimension | symbol | table | legend | object | text",
      "label": "short label, e.g. mark \\"D1\\" or the dimension text",
      "rawText": "the exact text as printed on the drawing, verbatim",
      "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
      "confidence": 0.0
    }
  ]
}`;

/** Read every dimension annotation on the page (linear/overall/chained/elevation/…). */
export function buildDimensionPrompt(opts: VisionPromptOptions): string {
  return [
    promptDiscipline(opts),
    '',
    'TASK — DIMENSIONS: List every dimension annotation visible on this page: linear dimensions, overall dimensions, chained dimensions, grid dimensions, elevations/levels (e.g. +3.500), diameters (Ø12, D12), thicknesses, and section/detail markers.',
    'For each dimension: "kind" is "dimension", "label" is a short description (e.g. "wall length"), "rawText" is the dimension text EXACTLY as printed (e.g. "3.500", "2.500 × 3.000", "15/30"). Write "overall" in the label ONLY when the dimension is the total extent of a run, and "chained" ONLY when it is one segment in a dimension chain — the label is read as evidence of the kind.',
    'Report each dimension annotation ONCE at its actual position — do NOT repeat the same value in a regular grid pattern (a value repeated identically across the page is a reading error, not many dimensions).',
    'BARE VALUE RULE: when a dimension is printed as part of a longer callout (e.g. `2" HMA CLASS 1/2"`, `4" COMPACTED ATB`, `115 mm brick wall`, `2% SLOPE`), put ONLY the bare dimension value in "rawText" (e.g. `2"`, `4"`, `115 mm`, `2%`) and the FULL callout text verbatim in "label". The value in "rawText" must be the dimension itself, verbatim — never a paraphrase, never a computed value.',
    'A grid label (A, B, 1, 2), a detail ID, or a drawing number is NOT a dimension — do not list it here.',
    'If no dimension is visible, return {"detections": []} — never invent one.',
    '',
    'JSON SCHEMA:',
    DETECTION_SCHEMA,
  ].join('\n');
}

/** Read door/window/structural symbols and their marks. */
export function buildSymbolPrompt(opts: VisionPromptOptions): string {
  return [
    promptDiscipline(opts),
    '',
    'TASK — SYMBOLS: List every door, window, ventilation, louver, gate, column (K1, K2…), beam (B1…), and stair symbol visible on this page.',
    'For each symbol: "kind" is "symbol", "label" is the mark EXACTLY as printed (e.g. "D1", "P1", "W1", "J1", "K1") — marks are project-defined, never assume what a mark means — and "rawText" is any text printed next to the symbol, verbatim (empty string when there is none).',
    'Count each OCCURRENCE separately: the same mark appearing 3 times is 3 detections, each with its own bbox.',
    'If a symbol has no readable mark, label it by what it visibly is (e.g. "door, unmarked") and set confidence honestly low — but report AT MOST 10 unmarked symbols per page: if more unmarked symbols are visible, report only the 10 clearest and stop. Do NOT enumerate symbols you cannot clearly see; if the page is illegible, return {"detections": []} rather than guessing symbols.',
    'If no symbol is visible, return {"detections": []} — never invent one.',
    '',
    'JSON SCHEMA:',
    DETECTION_SCHEMA,
  ].join('\n');
}

/** Read schedule tables (door/window, structural, …) row by row. */
export function buildTablePrompt(opts: VisionPromptOptions & { tableKind?: string }): string {
  const kindLine = opts.tableKind
    ? `Focus on the ${opts.tableKind} table(s) on this page.`
    : 'Focus on any schedule table on this page (door/window schedule, structural schedule, material schedule).';
  return [
    promptDiscipline(opts),
    '',
    `TASK — TABLES: ${kindLine}`,
    'For each table ROW: "kind" is "table", "label" is the row mark (e.g. "D1") or the row title, "rawText" is the ENTIRE row text verbatim (columns joined with " | ", e.g. "D1 | Pintu | 900 x 2100 | Kayu").',
    'Read cell values exactly as printed. A cell that is blank, unreadable, or cut off is MISSING_DATA — never fill it in.',
    'If no table is visible, return {"detections": []} — never invent one.',
    '',
    'JSON SCHEMA:',
    DETECTION_SCHEMA,
  ].join('\n');
}

/** Read the legend / title block / specification notes. */
export function buildLegendPrompt(opts: VisionPromptOptions): string {
  return [
    promptDiscipline(opts),
    '',
    'TASK — LEGEND: List every legend entry, title-block field, scale note, and specification note visible on this page.',
    'For each entry: "kind" is "legend", "label" is a short description (e.g. "scale", "project title", "north arrow"), "rawText" is the entry text EXACTLY as printed, verbatim.',
    'Pay special attention to the stated scale (e.g. "SKALA 1:100") — copy it verbatim; do not compute or assume a scale.',
    'If no legend or title block is visible, return {"detections": []} — never invent one.',
    '',
    'JSON SCHEMA:',
    DETECTION_SCHEMA,
  ].join('\n');
}

/** Read named construction objects (rooms, elements, fixtures) — generic object pass. */
export function buildObjectPrompt(opts: VisionPromptOptions): string {
  return [
    promptDiscipline(opts),
    '',
    'TASK — OBJECTS: List the named construction objects visible on this page: rooms (with their labels), structural elements (columns, beams, slabs, foundations), stairs, ramps, fixtures, and equipment.',
    'For each object: "kind" is "object", "label" is the object name as printed (e.g. "RUANG TAMU", "KOLOM K1"), "rawText" is any label text printed with it, verbatim.',
    'Do NOT estimate sizes, areas, or quantities for any object — report only what is labeled or drawn.',
    'If no labeled object is visible, return {"detections": []} — never invent one.',
    '',
    'JSON SCHEMA:',
    DETECTION_SCHEMA,
  ].join('\n');
}

/**
 * Combined first-pass survey: dimensions + symbols + tables + legend +
 * objects in ONE vision call. Use for FAST mode (spec §13: first-pass
 * detection); the focused prompts above are the DETAIL escalation for
 * pages where the survey left items UNRESOLVED.
 */
export function buildPageSurveyPrompt(opts: VisionPromptOptions): string {
  const classLine = opts.drawingClass
    ? `This page is classified as ${opts.drawingClass}.`
    : 'The drawing class of this page is unknown — read what is actually there.';
  return [
    promptDiscipline(opts),
    '',
    `TASK — PAGE SURVEY: ${classLine}`,
    'Survey this page ONCE and list everything visible, in one list:',
    '- "dimension": every dimension annotation (linear, overall, chained, elevation, diameter, thickness).',
    '- "symbol": every door/window/column/beam/stair symbol, each occurrence separately, with its mark verbatim.',
    '- "table": every schedule-table row (door/window schedule, structural schedule), the full row text verbatim.',
    '- "legend": every legend entry, title-block field, and scale note, verbatim.',
    '- "object": every labeled room, structural element, stair, and fixture.',
    '- "text": any other printed text worth recording (drawing title, notes, section references like "POTONGAN A-A").',
    'For "dimension" entries: when a dimension is printed as part of a longer callout (e.g. `2" HMA CLASS 1/2"`, `115 mm brick wall`), put ONLY the bare dimension value in "rawText" (e.g. `2"`, `115 mm`) and the FULL callout text verbatim in "label". Report each dimension annotation ONCE at its actual position — do NOT repeat the same value in a regular grid pattern.',
    'For "symbol" entries: report AT MOST 10 unmarked symbols per page — if more are visible, report only the 10 clearest and stop; never enumerate symbols you cannot clearly see.',
    'For references to other pages (e.g. "LIHAT DETAIL A", "POTONGAN B-B"), use kind "text" and copy the reference verbatim in "rawText".',
    'If the page is blank or unreadable, return {"detections": []} — never invent content.',
    '',
    'JSON SCHEMA:',
    DETECTION_SCHEMA,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Response parser — pure, strict
// ---------------------------------------------------------------------------

export interface VisionParseContext {
  /** 1-based page the image came from (stamped onto every proposal). */
  page: number;
  /** Pixel size of the image AS SENT — bboxes are validated against it. */
  imageWidthPx: number;
  imageHeightPx: number;
  /** ROI id when the image was a crop (stamped onto every proposal). */
  roiId?: string;
}

function clampConfidence(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract the first JSON value (object or array) from model output.
 * Tolerates a fenced ```json block and surrounding prose: finds the first
 * `{` or `[` and scans for its balanced close. Returns null when no
 * parseable JSON value exists. Never repairs malformed JSON by guessing.
 */
export function extractJsonFromModelOutput(content: string): unknown | null {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;
  // Fast path: the whole output is JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to extraction */
  }
  // Fenced block: ```json ... ``` (or plain ``` ... ```).
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through to brace scan */
    }
  }
  // Brace scan: first balanced {…} or […] in the text.
  const startObj = trimmed.indexOf('{');
  const startArr = trimmed.indexOf('[');
  let start = -1;
  let open = '';
  let close = '';
  if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
    start = startObj;
    open = '{';
    close = '}';
  } else if (startArr !== -1) {
    start = startArr;
    open = '[';
    close = ']';
  } else {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Truncation-tolerant salvage (I11 Stage 3, fix 1)
// ---------------------------------------------------------------------------

export interface TruncatedJsonSalvage {
  /** Complete array entries recovered (parsed JSON values). */
  entries: unknown[];
  /** True when the array was unclosed or its last entry was incomplete. */
  truncated: boolean;
  /** Complete-looking objects whose JSON.parse failed (skipped, never repaired). */
  unparseableEntries: number;
  /** True when an array opening was found at all. */
  foundArray: boolean;
}

/**
 * Scan one balanced `{…}` object starting at `start` (which must point
 * at `{`). String-aware: braces inside strings never count. Returns the
 * index of the matching `}` and whether it closed — `closed: false`
 * when the content ends first (the object is the truncated tail).
 */
function scanBalancedObject(content: string, start: number): { end: number; closed: boolean } {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i += 1) {
    const ch = content[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { end: i, closed: true };
    }
  }
  return { end: content.length - 1, closed: false };
}

/**
 * Salvage COMPLETE entries from a JSON array that was cut off mid-stream
 * (the gateway's 8,000-token output clamp truncates dense-sheet reads
 * mid-JSON — I11 Stage 2 pilot: both 90135 reads died at exactly 8,000
 * output tokens, and the strict parser discarded 109 already-emitted
 * detections).
 *
 * Finds the first `"key": [` for any of `arrayKeys` (or a bare leading
 * `[`), then scans the array body for top-level `{…}` objects. Every
 * object that closes is JSON.parsed and kept; the final incomplete
 * object is DROPPED (never repaired — a half-written entry may carry a
 * half-written number or bbox, and completing it would be invention).
 * Unparseable complete objects are skipped and counted, never repaired.
 *
 * This function NEVER invents content: it returns only substrings the
 * model actually emitted, parsed strictly. Callers must still record
 * the read as PARTIAL (`truncated: true`) — the salvaged entries are
 * the model's first N detections, not the whole page.
 */
export function extractTruncatedJsonArrayEntries(
  content: string,
  arrayKeys: readonly string[],
): TruncatedJsonSalvage {
  const none: TruncatedJsonSalvage = { entries: [], truncated: false, unparseableEntries: 0, foundArray: false };
  if (typeof content !== 'string' || content.length === 0) return none;
  let arrayStart = -1;
  for (const key of arrayKeys) {
    const re = new RegExp(`"${key}"\\s*:\\s*\\[`);
    const m = re.exec(content);
    if (m && (arrayStart === -1 || m.index < arrayStart)) {
      arrayStart = m.index + m[0].length - 1; // index of '['
    }
  }
  if (arrayStart === -1) {
    const trimmedStart = content.trimStart();
    if (trimmedStart.startsWith('[')) arrayStart = content.indexOf('[');
    else return none;
  }
  const entries: unknown[] = [];
  let unparseableEntries = 0;
  let truncated = true; // assumed until the closing ']' is seen
  let i = arrayStart + 1;
  const n = content.length;
  while (i < n) {
    const ch = content[i];
    if (ch === ']') {
      truncated = false;
      break;
    }
    if (ch === '"') {
      // A bare string element (not an object): skip it string-aware so
      // a '{' inside it is never mistaken for an entry start. An
      // unterminated string means truncation — stop here.
      let closed = false;
      let escaped = false;
      i += 1;
      while (i < n) {
        const c = content[i];
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') {
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) {
        truncated = true;
        break;
      }
      i += 1;
      continue;
    }
    if (ch === '{') {
      const { end, closed } = scanBalancedObject(content, i);
      if (!closed) {
        truncated = true;
        break; // incomplete tail entry — dropped, never repaired
      }
      try {
        entries.push(JSON.parse(content.slice(i, end + 1)));
      } catch {
        unparseableEntries += 1;
      }
      i = end + 1;
      continue;
    }
    i += 1; // whitespace, commas, anything else between entries
  }
  return { entries, truncated, unparseableEntries, foundArray: true };
}

/**
 * Validate one raw detection entry. Returns the typed proposal, or null
 * (with a warning appended) when the entry is malformed. Malformed entries
 * are DROPPED — never repaired by guessing.
 *
 * Bbox rules (the two failure modes are deliberately different):
 * - IMPOSSIBLE bbox (non-finite numbers, zero/negative width or height)
 *   → the whole proposal is DROPPED: a model emitting impossible geometry
 *   is untrustworthy for that entry.
 * - FINITE, positive-area bbox that merely extends past the image edge
 *   → the proposal is KEPT with bbox null: the text may still be real,
 *   but the location is not evidence.
 */
function validateProposal(
  entry: unknown,
  index: number,
  ctx: VisionParseContext,
  warnings: string[],
): VisionDetectionProposal | null {
  const where = `detection #${index}`;
  if (!isRecord(entry)) {
    warnings.push(`${where}: dropped — not a JSON object.`);
    return null;
  }
  const kind = entry.kind;
  if (typeof kind !== 'string' || !(VISION_PROPOSAL_KINDS as readonly string[]).includes(kind)) {
    warnings.push(`${where}: dropped — unknown kind ${JSON.stringify(kind)}.`);
    return null;
  }
  const label = typeof entry.label === 'string' ? entry.label.trim() : '';
  const rawText = typeof entry.rawText === 'string' ? entry.rawText : typeof entry.text === 'string' ? entry.text : '';
  if (label.length === 0 && rawText.trim().length === 0) {
    warnings.push(`${where}: dropped — no label and no text.`);
    return null;
  }
  const confidenceRaw = entry.confidence;
  if (typeof confidenceRaw !== 'number' || !Number.isFinite(confidenceRaw)) {
    warnings.push(`${where}: dropped — confidence is missing or not a finite number.`);
    return null;
  }
  const confidence = clampConfidence(confidenceRaw);
  if (confidence !== confidenceRaw) {
    warnings.push(`${where}: confidence ${confidenceRaw} clamped to ${confidence}.`);
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

  const proposal: VisionDetectionProposal = {
    kind: kind as VisionProposalKind,
    label: label.length > 0 ? label : rawText.trim(),
    rawText,
    bbox,
    confidence,
    page: ctx.page,
    status: statusFromConfidence(confidence),
    raw: entry,
  };
  if (ctx.roiId !== undefined) proposal.roiId = ctx.roiId;
  return proposal;
}

/**
 * Parse a vision response's model output into typed proposals.
 * Accepts a top-level object with a `detections` / `items` / `proposals`
 * array, or a bare JSON array. Zero parseable proposals → empty list +
 * status UNRESOLVED, never an invented detection.
 *
 * TRUNCATION (I11 Stage 3, fix 1): when the strict parse fails because
 * the output was cut off mid-JSON (the gateway's 8,000-token output
 * clamp), the complete entries already emitted are SALVAGED via
 * extractTruncatedJsonArrayEntries and validated exactly like a
 * complete response — and the result carries `truncated: true` so the
 * pipeline records a PARTIAL read and escalates to focused re-reads.
 * The incomplete tail entry is dropped, never repaired.
 */
export function parseVisionResponse(content: string, ctx: VisionParseContext): VisionParseResult {
  const warnings: string[] = [];
  let entries: unknown[] | null = null;
  let truncated = false;
  const parsed = extractJsonFromModelOutput(content);
  if (parsed !== null) {
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else if (isRecord(parsed)) {
      const list = parsed.detections ?? parsed.items ?? parsed.proposals;
      if (!Array.isArray(list)) {
        warnings.push('Vision JSON has no detections/items/proposals array.');
        return { proposals: [], droppedCount: 0, warnings, status: 'UNRESOLVED', truncated: false };
      }
      entries = list;
    } else {
      warnings.push('Vision JSON is neither an object nor an array.');
      return { proposals: [], droppedCount: 0, warnings, status: 'UNRESOLVED', truncated: false };
    }
  } else {
    const salvage = extractTruncatedJsonArrayEntries(content, ['detections', 'items', 'proposals']);
    if (!salvage.foundArray || salvage.entries.length === 0) {
      if (salvage.foundArray && salvage.truncated) {
        warnings.push(
          'Vision response was truncated mid-JSON (output token clamp) — no complete detection could be salvaged; the read is lost.',
        );
      } else {
        warnings.push('No parseable JSON found in the vision response.');
      }
      return { proposals: [], droppedCount: 0, warnings, status: 'UNRESOLVED', truncated: salvage.truncated };
    }
    entries = salvage.entries;
    truncated = true;
    warnings.push(
      `Vision response was truncated mid-JSON (output token clamp) — ${salvage.entries.length} complete detection(s) salvaged; the remainder is lost. This is a PARTIAL read, never a full read.`,
    );
    if (salvage.unparseableEntries > 0) {
      warnings.push(
        `${salvage.unparseableEntries} salvaged entr${salvage.unparseableEntries === 1 ? 'y was' : 'ies were'} not valid JSON — dropped, never repaired.`,
      );
    }
  }

  const proposals: VisionDetectionProposal[] = [];
  let droppedCount = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const proposal = validateProposal(entries[i], i, ctx, warnings);
    if (proposal) proposals.push(proposal);
    else droppedCount += 1;
  }
  if (entries.length === 0) {
    warnings.push('Vision response carried zero detections.');
  }
  const status: VisionReviewStatus =
    proposals.length === 0
      ? 'UNRESOLVED'
      : proposals.reduce((best, p) => (p.confidence > best.confidence ? p : best), proposals[0]).status;
  return { proposals, droppedCount, warnings, status, truncated };
}

// ---------------------------------------------------------------------------
// Gateway request body — pure, so tests can assert the exact contract
// ---------------------------------------------------------------------------

/** The exact JSON body POSTed to the gateway for a vision request. */
export interface GatewayVisionRequestBody {
  message: string;
  mode: 'vision';
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  jsonMode: true;
  imageDataBase64: string;
  imageMimeType: VisionImageMimeType;
}

/**
 * Build the exact gateway request body. Pure — no network.
 * Clamps maxTokens to the gateway range (100..8000, security.js:223) and
 * temperature to 0..1. `jsonMode: true` because the parser expects JSON;
 * `stream` is deliberately ABSENT (stream + media is rejected, security.js:276).
 */
export function buildGatewayVisionRequestBody(request: VisionRequest): GatewayVisionRequestBody {
  if (typeof request.prompt !== 'string' || request.prompt.trim().length === 0) {
    throw new VisionError('invalid_request', 'Vision prompt is empty — the gateway requires message/prompt.');
  }
  if (request.prompt.length > 20000) {
    throw new VisionError('invalid_request', `Vision prompt is ${request.prompt.length} chars — the gateway caps message at 20000.`);
  }
  if (request.systemPrompt !== undefined && request.systemPrompt.length > 20000) {
    throw new VisionError('invalid_request', 'Vision systemPrompt exceeds the gateway cap of 20000 chars.');
  }
  const { mimeType, base64 } = splitVisionDataUrl(request.imageDataUrl);
  if (base64.length > MAX_VISION_BASE64_CHARS) {
    throw new VisionError(
      'oversize',
      `Vision image exceeds the gateway cap: ${base64.length.toLocaleString('en-US')} base64 chars ` +
        `(max ${MAX_VISION_BASE64_CHARS.toLocaleString('en-US')}).`,
      { errorCode: 'PAYLOAD_TOO_LARGE' },
    );
  }
  const temperature =
    request.temperature === undefined ? 0.3 : Math.min(1, Math.max(0, request.temperature));
  const maxTokens =
    request.maxTokens === undefined
      ? 8000
      : Math.round(Math.min(8000, Math.max(100, request.maxTokens)));
  const body: GatewayVisionRequestBody = {
    message: request.prompt,
    mode: 'vision',
    temperature,
    maxTokens,
    jsonMode: true,
    imageDataBase64: base64,
    imageMimeType: mimeType,
  };
  if (request.systemPrompt !== undefined) body.systemPrompt = request.systemPrompt;
  return body;
}

// ---------------------------------------------------------------------------
// Real responder — the ONLY network code in this module
// ---------------------------------------------------------------------------

export interface GatewayVisionResponderOptions {
  /** Override the endpoint (tests only — production is always the relative path). */
  endpoint?: string;
  /** Client-side timeout in ms. Default 300_000 (see DEFAULT_VISION_TIMEOUT_MS). */
  timeoutMs?: number;
  /**
   * Fetch implementation. Default: globalThis.fetch. Inject a fake in tests
   * — NEVER construct this responder with the live fetch in a test.
   */
  fetchImpl?: typeof fetch;
  /**
   * Optional auth headers provider. I8b wires the app's
   * `aiGatewayAuthHeaders()` here (Supabase JWT). Without it the gateway
   * runs in degraded mode (rate-limited, origin-checked).
   */
  getAuthHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  /**
   * Optional idempotency key (header `Idempotency-Key`). The gateway replays
   * a stored success for the same key instead of calling the provider again
   * (aiGateway.js client-idempotency section) — cheap insurance for retries.
   */
  idempotencyKey?: string;
}

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Map a gateway error payload / HTTP status to a typed VisionError.
 * Never throws a raw Response; always a VisionError with a kind.
 */
export function mapGatewayError(status: number, payload: unknown): VisionError {
  const body = isRecord(payload) ? payload : {};
  const errorCode = typeof body.errorCode === 'string' ? body.errorCode : null;
  const message =
    typeof body.error === 'string' && body.error.length > 0
      ? body.error
      : typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : `Gateway request failed (HTTP ${status}).`;
  const retryAfterMs =
    typeof body.retryAfterMs === 'number' && Number.isFinite(body.retryAfterMs) ? body.retryAfterMs : null;
  const base = { httpStatus: status, errorCode, retryAfterMs };

  if (status === 401 || errorCode === 'AUTH_REQUIRED') {
    return new VisionError('unauthorized', message, base);
  }
  if (status === 429 || errorCode === 'RATE_LIMITED') {
    return new VisionError('rate_limited', message, { ...base, retryable: true });
  }
  if (errorCode === 'PAYLOAD_TOO_LARGE') {
    return new VisionError('oversize', message, base);
  }
  if (
    status === 400 ||
    errorCode === 'INVALID_REQUEST' ||
    errorCode === 'CONTENT_REJECTED' ||
    errorCode === 'AI_BAD_REQUEST' ||
    errorCode === 'MEDIA_NOT_SUPPORTED_FOR_MODE' ||
    errorCode === 'DEMO_RESTRICTED'
  ) {
    return new VisionError('bad_request', message, base);
  }
  if (status === 502 || status >= 500) {
    return new VisionError('unavailable', message, { ...base, retryable: true });
  }
  return new VisionError('gateway', message, base);
}

/**
 * The real gateway responder. Posts to /api/ai/multi-provider/execute with
 * mode 'vision'. Timeout via AbortController (default 300 s). All failures
 * surface as VisionError — network, timeout, 4xx, 5xx, malformed body.
 */
export function createGatewayVisionResponder(
  options: GatewayVisionResponderOptions = {},
): VisionResponder {
  const endpoint = options.endpoint ?? VISION_GATEWAY_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_VISION_TIMEOUT_MS;
  const fetchImpl = (options.fetchImpl ?? globalThis.fetch) as unknown as FetchLike;
  if (typeof fetchImpl !== 'function') {
    throw new VisionError('network', 'No fetch implementation available for the vision gateway call.');
  }

  return async (request: VisionRequest): Promise<VisionResponse> => {
    const body = buildGatewayVisionRequestBody(request);
    const controller = new AbortController();
    // Timeout is a RACE, not just an abort: a transport that ignores the
    // signal (or a hung socket) must still reject the await. The fetch
    // promise gets a no-op catch so a late rejection after the timeout
    // wins cannot surface as an unhandled rejection.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(
          new VisionError('timeout', `Vision gateway call timed out after ${timeoutMs} ms.`, {
            retryable: true,
          }),
        );
      }, timeoutMs);
    });
    try {
      const authHeaders = options.getAuthHeaders ? await options.getAuthHeaders() : {};
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...authHeaders,
      };
      if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
      let response: { ok: boolean; status: number; json: () => Promise<unknown> };
      try {
        const fetchPromise = fetchImpl(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        fetchPromise.catch(() => {
          /* observed here so a post-timeout rejection is never unhandled */
        });
        response = await Promise.race([fetchPromise, timeoutPromise]);
      } catch (e) {
        if (e instanceof VisionError && e.kind === 'timeout') throw e;
        if (controller.signal.aborted || (e as Error)?.name === 'AbortError') {
          throw new VisionError('timeout', `Vision gateway call timed out after ${timeoutMs} ms.`, { retryable: true });
        }
        throw new VisionError(
          'network',
          `Cannot reach the vision gateway (${(e as Error)?.message || 'fetch failed'}).`,
          { retryable: true },
        );
      }
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        throw new VisionError('invalid_response', `Vision gateway returned an unparseable body (HTTP ${response.status}).`, {
          httpStatus: response.status,
        });
      }
      if (!response.ok || !isRecord(payload) || payload.success !== true) {
        throw mapGatewayError(response.status, payload);
      }
      const content = payload.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new VisionError('invalid_response', 'Vision gateway returned success without content.', {
          httpStatus: response.status,
        });
      }
      const usage = isRecord(payload.usage) ? (payload.usage as GatewayVisionUsage) : null;
      return {
        content,
        model: typeof payload.model === 'string' ? payload.model : null,
        provider: typeof payload.provider === 'string' ? payload.provider : null,
        requestId: typeof payload.requestId === 'string' ? payload.requestId : null,
        durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : null,
        usage,
        usageStatus: typeof payload.usageStatus === 'string' ? payload.usageStatus : null,
      };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  };
}

// ---------------------------------------------------------------------------
// Client — responder + size guard + parser, composed
// ---------------------------------------------------------------------------

export interface VisionAnalyzeInput extends VisionRequest {
  /** 1-based page the image came from (stamped onto every proposal). */
  page: number;
  /** Pixel size of the image AS SENT — bboxes are validated against it. */
  imageWidthPx: number;
  imageHeightPx: number;
  /** ROI id when the image was a crop (stamped onto every proposal). */
  roiId?: string;
}

/**
 * The vision client: a responder (real or stub) + the size guard + the
 * parser. Constructed with an INJECTED responder — the client itself never
 * touches the network. I8b composes this with VisionCache + ROI helpers
 * and flips the live services' withImages flag.
 */
export class VisionClient {
  private readonly responder: VisionResponder;

  constructor(responder: VisionResponder) {
    if (typeof responder !== 'function') {
      throw new VisionError('invalid_request', 'VisionClient requires a VisionResponder function.');
    }
    this.responder = responder;
  }

  /**
   * Send one image + prompt through the responder and parse the result.
   * The size guard runs BEFORE the responder is called, so an oversize
   * image never costs a gateway call.
   */
  async analyze(input: VisionAnalyzeInput): Promise<VisionParseResult> {
    assertVisionImageSize(input.imageDataUrl);
    if (!Number.isFinite(input.imageWidthPx) || input.imageWidthPx <= 0) {
      throw new VisionError('invalid_request', 'Vision analyze needs a positive imageWidthPx.');
    }
    if (!Number.isFinite(input.imageHeightPx) || input.imageHeightPx <= 0) {
      throw new VisionError('invalid_request', 'Vision analyze needs a positive imageHeightPx.');
    }
    const response = await this.responder({
      imageDataUrl: input.imageDataUrl,
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });
    return parseVisionResponse(response.content, {
      page: input.page,
      imageWidthPx: input.imageWidthPx,
      imageHeightPx: input.imageHeightPx,
      roiId: input.roiId,
    });
  }
}

/**
 * I8a — Vision client + cache + ROI suite (plain-tsx assertion script, NO vitest).
 *
 * STUB-FIRST: this suite makes ZERO network calls. The global fetch is
 * replaced with a sentinel that fails the suite if anything ever calls it;
 * the only "fetch" the responder tests see is a recording fake, and the
 * client tests use a stub responder. The real gateway path is NEVER
 * constructed with a live fetch here.
 *
 * Run from repo root:
 *   npx --yes tsx src/test/dedVisionClient.test.ts
 */

import {
  DEFAULT_VISION_TIMEOUT_MS,
  MAX_VISION_BASE64_CHARS,
  VISION_GATEWAY_ENDPOINT,
  VISION_MODEL_VERSION,
  VISION_PROMPT_VERSION,
  VisionClient,
  VisionError,
  buildDimensionPrompt,
  buildGatewayVisionRequestBody,
  buildLegendPrompt,
  buildObjectPrompt,
  buildPageSurveyPrompt,
  buildSymbolPrompt,
  buildTablePrompt,
  createGatewayVisionResponder,
  extractTruncatedJsonArrayEntries,
  mapGatewayError,
  parseVisionResponse,
  splitVisionDataUrl,
  assertVisionImageSize,
  visionDownscaleFactorForBase64,
  visionImageScaleFactor,
} from '../ai-tools/ded-vision/visionClient';
import type { VisionRequest, VisionResponse } from '../ai-tools/ded-vision/visionClient';
import { VisionCache, visionCacheKey } from '../ai-tools/ded-vision/visionCache';
import type { VisionCacheStorage } from '../ai-tools/ded-vision/visionCache';
import {
  bboxIou,
  dedupeProposals,
  expandRoi,
  normalizeRoi,
  roiIdFor,
  tilePage,
  tilePageGrid,
} from '../ai-tools/ded-vision/roi';

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
    failures.push(`${name}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function checkTrue(name: string, value: boolean): void {
  check(name, value, true);
}

function checkContains(name: string, haystack: string, needle: string): void {
  total += 1;
  if (haystack.includes(needle)) {
    passed += 1;
  } else {
    failures.push(`${name}: expected prompt to contain ${JSON.stringify(needle)}`);
  }
}

function checkThrows(name: string, fn: () => unknown): void {
  total += 1;
  try {
    fn();
    failures.push(`${name}: expected a throw, but nothing was thrown`);
  } catch {
    passed += 1;
  }
}

function checkThrowsKind(name: string, fn: () => unknown, kind: string): void {
  total += 1;
  try {
    fn();
    failures.push(`${name}: expected a VisionError(${kind}), but nothing was thrown`);
  } catch (e) {
    if (e instanceof VisionError && e.kind === kind) {
      passed += 1;
    } else {
      failures.push(`${name}: expected VisionError(${kind}), got ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    }
  }
}

async function checkRejectsKind(name: string, promise: Promise<unknown>, kind: string): Promise<void> {
  total += 1;
  try {
    await promise;
    failures.push(`${name}: expected a VisionError(${kind}), but the promise resolved`);
  } catch (e) {
    if (e instanceof VisionError && e.kind === kind) {
      passed += 1;
    } else {
      failures.push(`${name}: expected VisionError(${kind}), got ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    }
  }
}

// --- Zero-network enforcement --------------------------------------------
// Replace the global fetch with a sentinel: ANY code path that reaches the
// live fetch fails the suite loudly. Restored at the end.
const realFetch = globalThis.fetch;
let liveFetchCalls = 0;
(globalThis as unknown as { fetch: typeof fetch }).fetch = (() => {
  liveFetchCalls += 1;
  throw new Error('LIVE FETCH USED IN TEST — stub-first violation');
}) as unknown as typeof fetch;

const SMALL_PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SMALL_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const BARE_B64 = 'iVBORw0KGgo=';

async function main(): Promise<void> {
  // =======================================================================
  // 1. Gateway contract constants + request body (pure)
  // =======================================================================
  check('endpoint is the multi-provider execute endpoint', VISION_GATEWAY_ENDPOINT, '/api/ai/multi-provider/execute');
  check('base64 cap is 3.5M chars (security.js:303)', MAX_VISION_BASE64_CHARS, 3500000);
  check('default timeout is 300s (chain budget + overshoot)', DEFAULT_VISION_TIMEOUT_MS, 300000);
  // I11 Stage 3, fix 4 — prompt version bumped v1 → v2 for the bare-value
  // dimension rule (a prompt change must never reuse stale cached reads).
  check('prompt version is v3 (E18 de-poisoned labels + F9/F10 caps)', VISION_PROMPT_VERSION, 'v3');
  check('model version is the masked flash alias', VISION_MODEL_VERSION, 'Ezrab-flash-v1');

  const body = buildGatewayVisionRequestBody({ imageDataUrl: SMALL_PNG, prompt: 'Read this page.' });
  check('body mode is vision', body.mode, 'vision');
  check('body message carries the prompt', body.message, 'Read this page.');
  check('body jsonMode is true', body.jsonMode, true);
  check('body strips the data-URL prefix (bare base64 only)', body.imageDataBase64, BARE_B64);
  check('body mime is image/png for a PNG data URL', body.imageMimeType, 'image/png');
  checkTrue('body has NO stream field (stream+media is rejected)', !('stream' in body));
  checkTrue('body has NO pdf field (vision PDF is dead)', !('pdfDataBase64' in body));
  check('body default maxTokens is 8000 (gateway max)', body.maxTokens, 8000);
  check('body default temperature is 0.3 (gateway default)', body.temperature, 0.3);

  const jpegBody = buildGatewayVisionRequestBody({ imageDataUrl: SMALL_JPEG, prompt: 'x' });
  check('body mime is image/jpeg for a JPEG data URL', jpegBody.imageMimeType, 'image/jpeg');

  const gifBody = buildGatewayVisionRequestBody({ imageDataUrl: 'data:image/gif;base64,R0lGODlh', prompt: 'x' });
  check('non-allowlist mime normalizes to image/png (gateway behavior)', gifBody.imageMimeType, 'image/png');

  const bareBody = buildGatewayVisionRequestBody({ imageDataUrl: BARE_B64, prompt: 'x' });
  check('bare base64 accepted, mime defaults to png', bareBody.imageMimeType, 'image/png');

  const clampedLow = buildGatewayVisionRequestBody({ imageDataUrl: SMALL_PNG, prompt: 'x', maxTokens: 50 });
  check('maxTokens clamps up to the gateway minimum 100', clampedLow.maxTokens, 100);
  const clampedHigh = buildGatewayVisionRequestBody({ imageDataUrl: SMALL_PNG, prompt: 'x', maxTokens: 99999 });
  check('maxTokens clamps down to the gateway maximum 8000', clampedHigh.maxTokens, 8000);
  const tempHigh = buildGatewayVisionRequestBody({ imageDataUrl: SMALL_PNG, prompt: 'x', temperature: 2 });
  check('temperature clamps to 1', tempHigh.temperature, 1);
  const tempLow = buildGatewayVisionRequestBody({ imageDataUrl: SMALL_PNG, prompt: 'x', temperature: -1 });
  check('temperature clamps to 0', tempLow.temperature, 0);
  const withSystem = buildGatewayVisionRequestBody({ imageDataUrl: SMALL_PNG, prompt: 'x', systemPrompt: 'Be precise.' });
  check('systemPrompt passes through', withSystem.systemPrompt, 'Be precise.');

  checkThrowsKind('empty prompt is invalid_request', () => buildGatewayVisionRequestBody({ imageDataUrl: SMALL_PNG, prompt: '   ' }), 'invalid_request');
  checkThrowsKind('prompt over 20000 chars is invalid_request', () => buildGatewayVisionRequestBody({ imageDataUrl: SMALL_PNG, prompt: 'x'.repeat(20001) }), 'invalid_request');
  checkThrowsKind('oversize image in body builder is oversize', () => buildGatewayVisionRequestBody({ imageDataUrl: 'A'.repeat(3500001), prompt: 'x' }), 'oversize');

  // splitVisionDataUrl
  const split = splitVisionDataUrl(SMALL_PNG);
  check('split mime', split.mimeType, 'image/png');
  check('split base64', split.base64, BARE_B64);
  checkThrowsKind('split rejects empty image', () => splitVisionDataUrl(''), 'invalid_image');
  checkThrowsKind('split rejects non-base64 payload', () => splitVisionDataUrl('data:image/png;base64,!!!not-base64!!!'), 'invalid_image');

  // mapGatewayError (pure error mapping)
  check('map 401 → unauthorized', mapGatewayError(401, { errorCode: 'AUTH_REQUIRED', error: 'Login diperlukan.' }).kind, 'unauthorized');
  check('map 429 → rate_limited', mapGatewayError(429, { errorCode: 'RATE_LIMITED', error: 'slow down', retryAfterMs: 5000 }).kind, 'rate_limited');
  checkTrue('map 429 is retryable', mapGatewayError(429, { errorCode: 'RATE_LIMITED', error: 'slow down' }).retryable);
  check('map 429 carries retryAfterMs', mapGatewayError(429, { errorCode: 'RATE_LIMITED', error: 'x', retryAfterMs: 5000 }).retryAfterMs, 5000);
  check('map 400 PAYLOAD_TOO_LARGE → oversize', mapGatewayError(400, { errorCode: 'PAYLOAD_TOO_LARGE', error: 'too big' }).kind, 'oversize');
  check('map 400 CONTENT_REJECTED → bad_request', mapGatewayError(400, { errorCode: 'CONTENT_REJECTED', error: 'nope' }).kind, 'bad_request');
  check('map 502 → unavailable', mapGatewayError(502, { error: 'AI sedang tidak tersedia.' }).kind, 'unavailable');
  checkTrue('map 502 is retryable', mapGatewayError(502, { error: 'AI sedang tidak tersedia.' }).retryable);
  check('map 500 → unavailable', mapGatewayError(500, {}).kind, 'unavailable');
  check('map unknown status → gateway', mapGatewayError(418, {}).kind, 'gateway');

  // =======================================================================
  // 2. Real responder shape + error mapping, via a RECORDING FAKE fetch
  //    (never the live fetch — the sentinel above would fail the suite)
  // =======================================================================
  type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
  const fetchCalls: Array<{ url: string; init: Record<string, unknown> }> = [];
  let scripted: FakeResponse | Error | 'never' = { ok: true, status: 200, json: async () => ({}) };
  const fakeFetch = (async (url: string, init?: Record<string, unknown>) => {
    fetchCalls.push({ url, init: init ?? {} });
    if (scripted === 'never') return new Promise<never>(() => {});
    if (scripted instanceof Error) throw scripted;
    return scripted;
  }) as unknown as typeof fetch;

  const responder = createGatewayVisionResponder({ fetchImpl: fakeFetch, timeoutMs: 5000 });
  const req: VisionRequest = { imageDataUrl: SMALL_PNG, prompt: 'Survey this page.' };

  scripted = {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      content: '{"detections":[]}',
      model: 'Ezrab-flash-v1',
      provider: 'ezrab',
      requestId: 'req-1',
      durationMs: 1234,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      usageStatus: 'actual',
    }),
  };
  const okResp = await responder(req);
  check('responder returns content', okResp.content, '{"detections":[]}');
  check('responder returns masked model alias', okResp.model, 'Ezrab-flash-v1');
  check('responder returns masked provider', okResp.provider, 'ezrab');
  check('responder returns requestId', okResp.requestId, 'req-1');
  check('responder returns durationMs', okResp.durationMs, 1234);
  check('responder returns usage totalTokens', okResp.usage?.totalTokens, 30);
  check('responder returns usageStatus', okResp.usageStatus, 'actual');
  check('fake fetch called once so far', fetchCalls.length, 1);
  check('fetch URL is the gateway endpoint', fetchCalls[0].url, '/api/ai/multi-provider/execute');
  check('fetch method is POST', (fetchCalls[0].init as { method: string }).method, 'POST');
  check(
    'fetch Content-Type is JSON',
    ((fetchCalls[0].init as { headers: Record<string, string> }).headers)['Content-Type'],
    'application/json',
  );
  const sentBody = JSON.parse((fetchCalls[0].init as { body: string }).body) as Record<string, unknown>;
  check('sent body mode is vision', sentBody.mode, 'vision');
  check('sent body jsonMode is true', sentBody.jsonMode, true);
  check('sent body carries bare base64', sentBody.imageDataBase64, BARE_B64);
  checkTrue('sent body has no stream field', !('stream' in sentBody));

  // Error paths (each = exactly one more fake-fetch call)
  scripted = { ok: false, status: 400, json: async () => ({ success: false, errorCode: 'PAYLOAD_TOO_LARGE', error: 'too big' }) };
  await checkRejectsKind('responder 400 PAYLOAD_TOO_LARGE → oversize', responder(req), 'oversize');
  scripted = { ok: false, status: 429, json: async () => ({ success: false, errorCode: 'RATE_LIMITED', error: 'slow', retryAfterMs: 1000 }) };
  await checkRejectsKind('responder 429 → rate_limited', responder(req), 'rate_limited');
  scripted = { ok: false, status: 502, json: async () => ({ success: false, error: 'AI sedang tidak tersedia.' }) };
  await checkRejectsKind('responder 502 → unavailable', responder(req), 'unavailable');
  scripted = { ok: false, status: 401, json: async () => ({ success: false, errorCode: 'AUTH_REQUIRED', error: 'Login diperlukan.' }) };
  await checkRejectsKind('responder 401 → unauthorized', responder(req), 'unauthorized');
  scripted = { ok: false, status: 400, json: async () => ({ success: false, errorCode: 'CONTENT_REJECTED', error: 'rejected' }) };
  await checkRejectsKind('responder 400 CONTENT_REJECTED → bad_request', responder(req), 'bad_request');
  scripted = { ok: true, status: 200, json: async () => ({ success: false, error: 'all legs failed' }) };
  await checkRejectsKind('responder success:false with 200 → gateway', responder(req), 'gateway');
  scripted = { ok: true, status: 200, json: async () => ({ success: true }) };
  await checkRejectsKind('responder success without content → invalid_response', responder(req), 'invalid_response');
  scripted = { ok: true, status: 200, json: async () => { throw new Error('bad json'); } };
  await checkRejectsKind('responder unparseable body → invalid_response', responder(req), 'invalid_response');
  scripted = new Error('socket hang up');
  await checkRejectsKind('responder fetch throw → network', responder(req), 'network');
  check('fake fetch got exactly 10 calls (1 success + 9 errors)', fetchCalls.length, 10);

  // Timeout path: a fetch that never resolves + a 5 ms timeout.
  const timeoutResponder = createGatewayVisionResponder({ fetchImpl: fakeFetch, timeoutMs: 5 });
  scripted = 'never';
  await checkRejectsKind('responder timeout → timeout', timeoutResponder(req), 'timeout');
  check('timeout consumed one more fake-fetch call', fetchCalls.length, 11);

  // =======================================================================
  // 3. Image size guard
  // =======================================================================
  check('size guard returns payload length for a small image', assertVisionImageSize(SMALL_PNG), BARE_B64.length);
  check('size guard accepts bare base64', assertVisionImageSize(BARE_B64), BARE_B64.length);
  check('size guard accepts EXACTLY at the cap (gateway rejects only >)', assertVisionImageSize('A'.repeat(3500000)), 3500000);
  check('size guard does not count the data-URL prefix', assertVisionImageSize('data:image/png;base64,' + 'A'.repeat(3500000)), 3500000);
  checkThrowsKind('size guard rejects 1 char over the cap', () => assertVisionImageSize('A'.repeat(3500001)), 'oversize');
  checkThrowsKind('size guard rejects invalid base64', () => assertVisionImageSize('!!!'), 'invalid_image');
  checkThrowsKind('size guard rejects empty input', () => assertVisionImageSize(''), 'invalid_image');

  // =======================================================================
  // 4. Scale-factor helpers (pure)
  // =======================================================================
  check('downscale: within cap → 1', visionDownscaleFactorForBase64(1000), 1);
  check('downscale: exactly at cap → 1', visionDownscaleFactorForBase64(3500000), 1);
  check('downscale: 4x over cap → 0.5', visionDownscaleFactorForBase64(14000000), 0.5);
  check('downscale: 2x over cap → sqrt(0.5)', visionDownscaleFactorForBase64(7000000), Math.sqrt(0.5));
  check('downscale: custom cap honored', visionDownscaleFactorForBase64(400, 100), 0.5);
  checkThrows('downscale rejects negative chars', () => visionDownscaleFactorForBase64(-1));
  checkThrows('downscale rejects zero cap', () => visionDownscaleFactorForBase64(100, 0));

  check('scale factor: small image → 1', visionImageScaleFactor(100, 100, 1000000), 1);
  check('scale factor: exactly at budget → 1 (500x500x4 = 1,000,000)', visionImageScaleFactor(500, 500, 1000000), 1);
  check('scale factor: 4x over budget → 0.5', visionImageScaleFactor(1000, 1000, 1000000), 0.5);
  check('scale factor: 1 byte/px assumption honored', visionImageScaleFactor(1000, 1000, 1000000, 1), 1);
  checkThrows('scale factor rejects zero width', () => visionImageScaleFactor(0, 100, 1000));
  checkThrows('scale factor rejects negative height', () => visionImageScaleFactor(100, -5, 1000));
  checkThrows('scale factor rejects zero maxBytes', () => visionImageScaleFactor(100, 100, 0));

  // =======================================================================
  // 5. Prompt builders — required discipline in every prompt
  // =======================================================================
  const promptOpts = { page: 3, imageWidthPx: 1240, imageHeightPx: 1754, drawingClass: 'FLOOR_PLAN' };
  const prompts: Array<[string, string]> = [
    ['dimension', buildDimensionPrompt(promptOpts)],
    ['symbol', buildSymbolPrompt(promptOpts)],
    ['table', buildTablePrompt({ ...promptOpts, tableKind: 'door-window-schedule' })],
    ['legend', buildLegendPrompt(promptOpts)],
    ['object', buildObjectPrompt(promptOpts)],
    ['survey', buildPageSurveyPrompt(promptOpts)],
  ];
  for (const [name, prompt] of prompts) {
    checkContains(`${name} prompt: do-not-estimate instruction`, prompt, 'Do NOT estimate');
    checkContains(`${name} prompt: MISSING_DATA convention`, prompt, 'MISSING_DATA');
    checkContains(`${name} prompt: verbatim text instruction`, prompt, 'VERBATIM');
    checkContains(`${name} prompt: pixel bbox instruction`, prompt, 'IMAGE-PIXEL');
    checkContains(`${name} prompt: JSON schema`, prompt, '"detections"');
    checkContains(`${name} prompt: states the page`, prompt, 'page 3');
    checkContains(`${name} prompt: states image size`, prompt, '1240 px wide');
    checkTrue(`${name} prompt fits the 20000-char gateway message cap`, prompt.length < 20000);
  }
  checkContains('dimension prompt: dimension kinds', prompts[0][1], 'chained');
  checkContains('symbol prompt: door/window marks', prompts[1][1], 'D1');
  checkContains('table prompt: row reading', prompts[2][1], 'ROW');
  checkContains('legend prompt: scale note', prompts[3][1], 'SKALA 1:100');
  checkContains('object prompt: rooms', prompts[4][1], 'rooms');
  checkContains('survey prompt: covers symbols', prompts[5][1], '"symbol"');
  checkContains('survey prompt: covers tables', prompts[5][1], '"table"');
  checkContains('survey prompt: covers cross-page references', prompts[5][1], 'other pages');
  // I11 Stage 3, fix 4 — bare-value dimension rule in both prompts that
  // read dimensions (focused + survey); other prompts must NOT carry it
  // (symbols/tables/legend/object rawText stays the full verbatim text).
  checkContains('dimension prompt: bare-value rule', prompts[0][1], 'BARE VALUE RULE');
  checkContains('dimension prompt: bare-value example (imperial callout)', prompts[0][1], '2" HMA CLASS 1/2"');
  checkContains('dimension prompt: full callout goes in label', prompts[0][1], 'FULL callout text verbatim in "label"');
  checkContains('survey prompt: bare-value rule for dimension entries', prompts[5][1], 'ONLY the bare dimension value in "rawText"');
  checkTrue('symbol prompt: no bare-value rule', !prompts[1][1].includes('BARE VALUE'));
  checkTrue('table prompt: no bare-value rule', !prompts[2][1].includes('BARE VALUE'));
  checkTrue('legend prompt: no bare-value rule', !prompts[2][1].includes('BARE VALUE'));
  checkTrue('legend prompt: no bare-value rule', !prompts[3][1].includes('BARE VALUE'));
  checkTrue('object prompt: no bare-value rule', !prompts[4][1].includes('BARE VALUE'));
  // I11 Stage 4 (v3) — E18 de-poisoning: the dimension example label
  // is neutral (a label reading "overall width" would make every
  // example-shaped dim OVERALL), and overall/chained are written ONLY
  // deliberately. F9/F10: the symbol cap + the no-grid-repetition
  // rule, in both the focused prompts and the survey.
  checkContains('dimension prompt v3: neutral example label', prompts[0][1], '"wall length"');
  checkTrue('dimension prompt v3: no overall-width example', !prompts[0][1].includes('overall width'));
  checkContains('dimension prompt v3: overall only when deliberate', prompts[0][1], 'ONLY when the dimension is the total extent of a run');
  checkContains('dimension prompt v3: chained only when deliberate', prompts[0][1], 'ONLY when it is one segment in a dimension chain');
  checkContains('dimension prompt v3: no grid repetition', prompts[0][1], 'do NOT repeat the same value in a regular grid pattern');
  checkContains('symbol prompt v3: unmarked cap', prompts[1][1], 'AT MOST 10 unmarked symbols');
  checkContains('symbol prompt v3: illegible page returns empty', prompts[1][1], 'if the page is illegible');
  checkContains('survey prompt v3: no grid repetition', prompts[5][1], 'do NOT repeat the same value in a regular grid pattern');
  checkContains('survey prompt v3: unmarked cap', prompts[5][1], 'AT MOST 10 unmarked symbols');

  // =======================================================================
  // 6. Response parser — strict, drop-don't-guess
  // =======================================================================
  const ctx = { page: 3, imageWidthPx: 1240, imageHeightPx: 1754 };

  const valid = parseVisionResponse(
    JSON.stringify({
      detections: [
        { kind: 'dimension', label: 'overall width', rawText: '3.500', bbox: { x: 100, y: 200, width: 300, height: 40 }, confidence: 0.92 },
        { kind: 'symbol', label: 'D1', rawText: 'D1', bbox: { x: 500, y: 600, width: 90, height: 210 }, confidence: 0.71 },
      ],
    }),
    ctx,
  );
  check('parser: valid response yields 2 proposals', valid.proposals.length, 2);
  check('parser: first kind', valid.proposals[0].kind, 'dimension');
  check('parser: rawText verbatim', valid.proposals[0].rawText, '3.500');
  check('parser: bbox kept', valid.proposals[0].bbox?.width, 300);
  check('parser: page stamped', valid.proposals[0].page, 3);
  check('parser: 0.92 → HIGH_CONFIDENCE', valid.proposals[0].status, 'HIGH_CONFIDENCE');
  check('parser: 0.71 → NEEDS_REVIEW', valid.proposals[1].status, 'NEEDS_REVIEW');
  check('parser: droppedCount 0', valid.droppedCount, 0);
  check('parser: raw entry kept for audit', (valid.proposals[0].raw as { label: string }).label, 'overall width');
  check('parser: aggregate status follows best proposal', valid.status, 'HIGH_CONFIDENCE');

  // Proposals NEVER arrive VERIFIED, even at confidence 1.0.
  const perfect = parseVisionResponse(
    JSON.stringify({ detections: [{ kind: 'text', label: 'title', rawText: 'DENAH', bbox: null, confidence: 1 }] }),
    ctx,
  );
  check('parser: confidence 1.0 caps at HIGH_CONFIDENCE, never VERIFIED', perfect.proposals[0].status, 'HIGH_CONFIDENCE');

  // Fenced JSON + prose-wrapped JSON + bare array.
  const fenced = parseVisionResponse('```json\n{"detections":[{"kind":"text","label":"a","rawText":"A","bbox":null,"confidence":0.5}]}\n```', ctx);
  check('parser: fenced ```json block parses', fenced.proposals.length, 1);
  const proseWrapped = parseVisionResponse('Here are the results:\n{"detections":[{"kind":"text","label":"b","rawText":"B","bbox":null,"confidence":0.5}]}\nHope this helps!', ctx);
  check('parser: prose-wrapped JSON parses', proseWrapped.proposals.length, 1);
  const bareArray = parseVisionResponse('[{"kind":"text","label":"c","rawText":"C","bbox":null,"confidence":0.5}]', ctx);
  check('parser: bare JSON array parses', bareArray.proposals.length, 1);
  const itemsKey = parseVisionResponse(JSON.stringify({ items: [{ kind: 'text', label: 'd', rawText: 'D', bbox: null, confidence: 0.5 }] }), ctx);
  check('parser: "items" key accepted', itemsKey.proposals.length, 1);

  // Malformed entries dropped + counted, never repaired.
  const mixed = parseVisionResponse(
    JSON.stringify({
      detections: [
        { kind: 'teleport', label: 'x', rawText: 'X', confidence: 0.9 },
        { kind: 'text', label: '', rawText: '', confidence: 0.9 },
        { kind: 'text', label: 'no-conf', rawText: 'N', confidence: null },
        'not-an-object',
        { kind: 'text', label: 'good', rawText: 'G', bbox: null, confidence: 0.8 },
      ],
    }),
    ctx,
  );
  check('parser: 1 good entry survives mixed input', mixed.proposals.length, 1);
  check('parser: 4 malformed entries dropped', mixed.droppedCount, 4);
  checkTrue('parser: drops are recorded as warnings', mixed.warnings.length >= 4);

  // Empty / unparseable → empty + UNRESOLVED, never invented.
  const empty = parseVisionResponse('{"detections": []}', ctx);
  check('parser: empty detections → 0 proposals', empty.proposals.length, 0);
  check('parser: empty detections → UNRESOLVED', empty.status, 'UNRESOLVED');
  const garbage = parseVisionResponse('I cannot see anything clearly.', ctx);
  check('parser: no JSON → 0 proposals', garbage.proposals.length, 0);
  check('parser: no JSON → UNRESOLVED', garbage.status, 'UNRESOLVED');
  checkTrue('parser: no JSON → warning recorded', garbage.warnings.length >= 1);
  const noArray = parseVisionResponse('{"notes": "nothing here"}', ctx);
  check('parser: object without detections array → UNRESOLVED', noArray.status, 'UNRESOLVED');

  // Confidence clamping.
  const clamped = parseVisionResponse(
    JSON.stringify({
      detections: [
        { kind: 'text', label: 'hi', rawText: 'H', bbox: null, confidence: 1.5 },
        { kind: 'text', label: 'lo', rawText: 'L', bbox: null, confidence: -0.2 },
      ],
    }),
    ctx,
  );
  check('parser: confidence 1.5 clamps to 1', clamped.proposals[0].confidence, 1);
  check('parser: confidence -0.2 clamps to 0', clamped.proposals[1].confidence, 0);
  check('parser: clamped 0 → UNRESOLVED', clamped.proposals[1].status, 'UNRESOLVED');

  // Out-of-bounds bbox → null, proposal kept.
  const oob = parseVisionResponse(
    JSON.stringify({
      detections: [{ kind: 'text', label: 'edge', rawText: 'E', bbox: { x: 1200, y: 100, width: 100, height: 40 }, confidence: 0.8 }],
    }),
    ctx,
  );
  check('parser: out-of-bounds bbox → null', oob.proposals[0].bbox, null);
  check('parser: out-of-bounds proposal still kept (text may be real)', oob.proposals.length, 1);

  // NEGATIVE: impossible bbox must not survive parsing — proposal dropped.
  const impossible = parseVisionResponse(
    JSON.stringify({
      detections: [
        { kind: 'symbol', label: 'D9', rawText: 'D9', bbox: { x: -50, y: 10, width: 0, height: 40 }, confidence: 0.99 },
        { kind: 'symbol', label: 'D8', rawText: 'D8', bbox: { x: 10, y: 10, width: 50, height: -30 }, confidence: 0.99 },
        { kind: 'symbol', label: 'D7', rawText: 'D7', bbox: 'not-a-box', confidence: 0.99 },
      ],
    }),
    ctx,
  );
  check('parser: confident detection with zero-area bbox is DROPPED', impossible.proposals.length, 0);
  check('parser: all 3 impossible-bbox entries dropped', impossible.droppedCount, 3);
  check('parser: impossible-bbox response → UNRESOLVED', impossible.status, 'UNRESOLVED');

  // roiId propagation.
  const withRoi = parseVisionResponse(
    JSON.stringify({ detections: [{ kind: 'text', label: 'r', rawText: 'R', bbox: null, confidence: 0.6 }] }),
    { ...ctx, roiId: 'roi-0-0-400-400' },
  );
  check('parser: roiId stamped onto proposals', withRoi.proposals[0].roiId, 'roi-0-0-400-400');

  // Complete responses are never flagged truncated.
  check('parser: complete response → truncated false', valid.truncated, false);
  check('parser: garbage input → truncated false', garbage.truncated, false);

  // =======================================================================
  // 6b. Truncation-tolerant parsing (I11 Stage 3, fix 1) — salvage the
  // complete detections already emitted instead of dropping everything.
  // Fixtures mirror the real 90135 pilot truncation: a `detections`
  // array cut mid-entry by the 8,000-token output clamp.
  // =======================================================================
  const truncatedSurvey =
    '{\n  "detections": [\n' +
    '    {"kind": "dimension", "label": "overall width", "rawText": "3.05", "bbox": {"x": 100, "y": 200, "width": 60, "height": 20}, "confidence": 0.9},\n' +
    '    {"kind": "symbol", "label": "D1", "rawText": "D1", "bbox": {"x": 500, "y": 600, "width": 90, "height": 210}, "confidence": 0.9},\n' +
    '    {"kind": "text", "label": "Engineer block", "rawText": "Er. B. NAKKIRAN, D.C.E.\\nCIVIL ENGINEER & L.B.S.\\nGANESH DESIGNERS\\n# 12/2 C, C.N.K. ROAD,\\nKALLKURICHI - 606 202.\\nPh:222977, M:94433 21977\\nRegistered Engineer Grade-II\\nKallakurichi Municipality\\n';
  const salvaged = parseVisionResponse(truncatedSurvey, ctx);
  check('salvage: 2 complete detections salvaged from truncated JSON', salvaged.proposals.length, 2);
  check('salvage: first salvaged kind', salvaged.proposals[0].kind, 'dimension');
  check('salvage: first salvaged rawText verbatim', salvaged.proposals[0].rawText, '3.05');
  check('salvage: second salvaged kind', salvaged.proposals[1].kind, 'symbol');
  check('salvage: truncated flag true', salvaged.truncated, true);
  check('salvage: aggregate status follows best salvaged proposal', salvaged.status, 'HIGH_CONFIDENCE');
  checkTrue('salvage: warning names the partial read', salvaged.warnings.some((w) => w.includes('PARTIAL read')));
  checkTrue('salvage: warning counts the salvaged entries', salvaged.warnings.some((w) => w.includes('2 complete detection(s) salvaged')));
  check('salvage: incomplete tail entry dropped, not counted as malformed', salvaged.droppedCount, 0);

  // The tail entry is dropped even when it ALMOST closes (missing only
  // the final brace) — a half-written entry is never repaired.
  const almostClosed =
    '{"detections": [{"kind": "text", "label": "a", "rawText": "A", "bbox": null, "confidence": 0.9}, {"kind": "text", "label": "b", "rawText": "B", "bbox": null, "confidence": 0.8';
  const almost = parseVisionResponse(almostClosed, ctx);
  check('salvage: almost-closed tail entry dropped', almost.proposals.length, 1);
  check('salvage: almost-closed tail keeps the complete entry', almost.proposals[0].rawText, 'A');
  check('salvage: almost-closed response flagged truncated', almost.truncated, true);

  // Cut off inside the FIRST entry: nothing complete to salvage — the
  // read is lost, honestly flagged, never a partial invention.
  const cutInFirst =
    '{"detections": [{"kind": "text", "label": "a", "rawText": "A LONG TEXT THAT WAS CUT OFF MID-STR';
  const cutFirst = parseVisionResponse(cutInFirst, ctx);
  check('salvage: cut inside first entry → 0 proposals', cutFirst.proposals.length, 0);
  check('salvage: cut inside first entry → UNRESOLVED', cutFirst.status, 'UNRESOLVED');
  check('salvage: cut inside first entry → truncated true', cutFirst.truncated, true);
  checkTrue('salvage: cut inside first entry → loss warning', cutFirst.warnings.some((w) => w.includes('no complete detection could be salvaged')));

  // Braces inside strings must not fool the scanner (a rawText carrying
  // '{' or '}' is still one entry).
  const bracesInString =
    '{"detections": [{"kind": "text", "label": "note", "rawText": "SEE DETAIL {A} ON SHEET 2", "bbox": null, "confidence": 0.9}, {"kind": "text", "label": "cut", "rawText": "TAIL';
  const braces = parseVisionResponse(bracesInString, ctx);
  check('salvage: braces inside a string do not split the entry', braces.proposals.length, 1);
  check('salvage: brace-carrying rawText verbatim', braces.proposals[0].rawText, 'SEE DETAIL {A} ON SHEET 2');

  // Bare truncated array (no object wrapper) salvages the same way.
  const bareTruncated =
    '[{"kind": "text", "label": "a", "rawText": "A", "bbox": null, "confidence": 0.9}, {"kind": "text", "label": "b", "rawText": "B", "bbox": null, "confidence": 0.8}, {"kind": "text", "label": "c", "rawText": "CUT';
  const bare = parseVisionResponse(bareTruncated, ctx);
  check('salvage: bare truncated array salvages complete entries', bare.proposals.length, 2);
  check('salvage: bare truncated array flagged truncated', bare.truncated, true);

  // A complete-but-unparseable salvaged entry is skipped and counted,
  // never repaired (trailing comma inside one object).
  const badEntry =
    '{"detections": [{"kind": "text", "label": "a", "rawText": "A", "bbox": null, "confidence": 0.9,}, {"kind": "text", "label": "b", "rawText": "B", "bbox": null, "confidence": 0.8}, {"kind": "text", "label": "c", "rawText": "CUT';
  const bad = parseVisionResponse(badEntry, ctx);
  check('salvage: unparseable complete entry skipped', bad.proposals.length, 1);
  check('salvage: unparseable entry keeps the valid one', bad.proposals[0].rawText, 'B');
  checkTrue('salvage: unparseable entry warned', bad.warnings.some((w) => w.includes('not valid JSON')));

  // Extractor-level checks (used by the OCR parser too).
  const extracted = extractTruncatedJsonArrayEntries(truncatedSurvey, ['detections']);
  check('salvage extractor: foundArray true', extracted.foundArray, true);
  check('salvage extractor: 2 entries', extracted.entries.length, 2);
  check('salvage extractor: truncated true', extracted.truncated, true);
  const noArrayExtract = extractTruncatedJsonArrayEntries('I cannot see anything clearly.', ['detections']);
  check('salvage extractor: prose → foundArray false', noArrayExtract.foundArray, false);
  check('salvage extractor: prose → truncated false', noArrayExtract.truncated, false);
  const emptyExtract = extractTruncatedJsonArrayEntries('', ['detections']);
  check('salvage extractor: empty input → 0 entries', emptyExtract.entries.length, 0);

  // =======================================================================
  // 7. Vision cache
  // =======================================================================
  const keyInput = { docHash: 'doc-abc', page: 3, promptVersion: 'v1', modelVersion: 'Ezrab-flash-v1' };
  check('cache key is stable', visionCacheKey(keyInput), visionCacheKey(keyInput));
  checkTrue(
    'cache key: prompt-version change MUST change the key (no stale reuse)',
    visionCacheKey(keyInput) !== visionCacheKey({ ...keyInput, promptVersion: 'v2' }),
  );
  checkTrue('cache key: model-version change changes the key', visionCacheKey(keyInput) !== visionCacheKey({ ...keyInput, modelVersion: 'Ezrab-pro' }));
  checkTrue('cache key: ROI change changes the key', visionCacheKey(keyInput) !== visionCacheKey({ ...keyInput, roiId: 'roi-0-0-400-400' }));
  checkTrue('cache key: page change changes the key', visionCacheKey(keyInput) !== visionCacheKey({ ...keyInput, page: 4 }));
  checkTrue('cache key: doc change changes the key', visionCacheKey(keyInput) !== visionCacheKey({ ...keyInput, docHash: 'doc-xyz' }));
  checkTrue('cache key: separator inside docHash cannot collide', visionCacheKey({ ...keyInput, docHash: 'a/b' }) !== visionCacheKey({ ...keyInput, docHash: 'a', page: 3 }));
  checkContains('cache key: readable docHash segment', visionCacheKey(keyInput), 'doc-abc');

  const cache = new VisionCache<string>();
  const k1 = visionCacheKey(keyInput);
  check('cache: miss before set', cache.get(k1).hit, false);
  check('cache: has false before set', cache.has(k1), false);
  cache.set(k1, 'result-1');
  const hit = cache.get(k1);
  checkTrue('cache: hit after set', hit.hit);
  if (hit.hit) {
    check('cache: hit carries the stored result', hit.entry.result, 'result-1');
    check('cache: entry source is vision', hit.entry.source, 'vision');
    check('cache: entry key matches', hit.entry.key, k1);
  }
  check('cache: has true after set', cache.has(k1), true);
  check('cache: size 1', cache.size, 1);

  // TTL with an injected clock.
  let now = 1000000;
  const ttlCache = new VisionCache<string>({ ttlMs: 1000, now: () => now });
  ttlCache.set('k', 'v');
  now = 1000999;
  check('cache: hit 1 ms before TTL', ttlCache.get('k').hit, true);
  now = 1001000;
  check('cache: expired at exactly TTL → miss', ttlCache.get('k').hit, false);
  check('cache: expired entry removed from size', ttlCache.size, 0);

  // LRU eviction: maxEntries 2; get refreshes recency.
  const lru = new VisionCache<string>({ maxEntries: 2 });
  lru.set('a', 'A');
  lru.set('b', 'B');
  lru.get('a'); // 'a' is now most-recently-used; 'b' is the eviction victim.
  lru.set('c', 'C');
  check('cache LRU: refreshed entry survives', lru.has('a'), true);
  check('cache LRU: least-recently-used evicted', lru.has('b'), false);
  check('cache LRU: newest entry present', lru.has('c'), true);
  check('cache LRU: size stays at cap', lru.size, 2);

  // Invalidation.
  const inv = new VisionCache<string>();
  const d1p1 = visionCacheKey({ docHash: 'd1', page: 1, promptVersion: 'v1', modelVersion: 'm1' });
  const d1p2 = visionCacheKey({ docHash: 'd1', page: 2, promptVersion: 'v1', modelVersion: 'm1' });
  const d1p1roi = visionCacheKey({ docHash: 'd1', page: 1, roiId: 'roi-0-0-100-100', promptVersion: 'v1', modelVersion: 'm1' });
  const d2p1 = visionCacheKey({ docHash: 'd2', page: 1, promptVersion: 'v1', modelVersion: 'm1' });
  inv.set(d1p1, '1');
  inv.set(d1p2, '2');
  inv.set(d1p1roi, '1r');
  inv.set(d2p1, '3');
  check('invalidatePage removes both entries of that page', inv.invalidatePage('d1', 1), 2);
  check('invalidatePage leaves other pages alone', inv.has(d1p2), true);
  check('invalidatePage leaves other docs alone', inv.has(d2p1), true);
  check('invalidateDoc removes the rest of the doc', inv.invalidateDoc('d1'), 1);
  check('invalidateDoc leaves other docs alone', inv.has(d2p1), true);
  inv.clear();
  check('clear empties the cache', inv.size, 0);

  checkThrows('cache rejects maxEntries 0', () => new VisionCache({ maxEntries: 0 }));
  checkThrows('cache rejects ttlMs 0', () => new VisionCache({ ttlMs: 0 }));

  // Storage-interface fake: write-through + restore in a fresh instance.
  const fakeStore = new Map<string, string>();
  const storage: VisionCacheStorage = {
    get: (k) => fakeStore.get(k) ?? null,
    set: (k, v) => { fakeStore.set(k, v); },
    remove: (k) => { fakeStore.delete(k); },
  };
  const cacheA = new VisionCache<string>({ storage, ttlMs: 60000, now: () => 5000 });
  cacheA.set('sk', 'stored-value');
  checkTrue('cache: set writes through to storage', fakeStore.has('sk'));
  const cacheB = new VisionCache<string>({ storage, ttlMs: 60000, now: () => 5000 });
  const restored = cacheB.get('sk');
  checkTrue('cache: fresh instance restores from storage', restored.hit);
  if (restored.hit) check('cache: restored result matches', restored.entry.result, 'stored-value');
  const cacheC = new VisionCache<string>({ storage, ttlMs: 60000, now: () => 5000 + 60000 });
  check('cache: expired storage entry is a miss', cacheC.get('sk').hit, false);
  // Corrupt mirror entry → miss, never a crash.
  fakeStore.set('bad', '{not json');
  check('cache: corrupt storage entry is a miss, not a crash', cacheB.get('bad').hit, false);

  // =======================================================================
  // 8. ROI math
  // =======================================================================
  const normInside = normalizeRoi({ x: 100, y: 100, width: 200, height: 150 }, 1000, 800);
  check('normalize: inside box unchanged (x)', normInside?.x, 100);
  check('normalize: inside box unchanged (w)', normInside?.width, 200);
  const normOver = normalizeRoi({ x: -50, y: -20, width: 200, height: 100 }, 1000, 800);
  check('normalize: negative origin clamps to 0', normOver?.x, 0);
  check('normalize: intersection width (not shift)', normOver?.width, 150);
  check('normalize: intersection height', normOver?.height, 80);
  const normEdge = normalizeRoi({ x: 950, y: 750, width: 200, height: 100 }, 1000, 800);
  check('normalize: right edge clamps width', normEdge?.width, 50);
  check('normalize: bottom edge clamps height', normEdge?.height, 50);
  check('normalize: zero width → null', normalizeRoi({ x: 0, y: 0, width: 0, height: 10 }, 1000, 800), null);
  check('normalize: negative height → null', normalizeRoi({ x: 0, y: 0, width: 10, height: -5 }, 1000, 800), null);
  check('normalize: NaN → null', normalizeRoi({ x: NaN, y: 0, width: 10, height: 10 }, 1000, 800), null);
  check('normalize: fully off-page → null', normalizeRoi({ x: 2000, y: 0, width: 10, height: 10 }, 1000, 800), null);

  const expanded = expandRoi({ x: 100, y: 100, width: 50, height: 50 }, 10, 1000, 800);
  check('expand: grows on all sides (x)', expanded?.x, 90);
  check('expand: grows on all sides (w)', expanded?.width, 70);
  const expandedEdge = expandRoi({ x: 0, y: 0, width: 50, height: 50 }, 20, 1000, 800);
  check('expand: clamps at page edge (x)', expandedEdge?.x, 0);
  check('expand: clamps at page edge (w)', expandedEdge?.width, 70);
  const expandedLine = expandRoi({ x: 0, y: 0, width: 0, height: 10 }, 5, 1000, 800);
  check('expand: zero-width box + positive margin buffers into a real box (w)', expandedLine?.width, 5);
  check('expand: zero-width box + positive margin buffers into a real box (h)', expandedLine?.height, 15);
  check('expand: degenerate input + zero margin → null', expandRoi({ x: 0, y: 0, width: 0, height: 10 }, 0, 1000, 800), null);
  check('expand: NaN input → null', expandRoi({ x: NaN, y: 0, width: 10, height: 10 }, 5, 1000, 800), null);

  // Tiling.
  const single = tilePage(800, 600, 1000, 50);
  check('tile: page smaller than maxTile → 1 tile', single.length, 1);
  check('tile: single tile covers the whole page', single[0].bbox.width, 800);
  const tiles = tilePage(1000, 1000, 400, 50);
  check('tile: 1000x1000 @400/50 → 9 tiles', tiles.length, 9);
  checkTrue('tile: no tile exceeds maxTilePx', tiles.every((t) => t.bbox.width <= 400 && t.bbox.height <= 400));
  check('tile: indices are row-major 0..8', tiles.map((t) => t.index).join(','), '0,1,2,3,4,5,6,7,8');
  // Coverage: every sample point (37 px grid + all four corners) is inside ≥1 tile.
  let uncovered = 0;
  const samplePoints: Array<[number, number]> = [[0, 0], [999, 0], [0, 999], [999, 999], [500, 500]];
  for (let y = 0; y < 1000; y += 37) {
    for (let x = 0; x < 1000; x += 37) samplePoints.push([x, y]);
  }
  for (const [px, py] of samplePoints) {
    const covered = tiles.some((t) => px >= t.bbox.x && px < t.bbox.x + t.bbox.width && py >= t.bbox.y && py < t.bbox.y + t.bbox.height);
    if (!covered) uncovered += 1;
  }
  check('tile: every sampled pixel (incl. corners) is covered', uncovered, 0);
  // Adjacent overlap honored (≥ overlapPx).
  const row0 = tiles.filter((t) => t.row === 0);
  const hOverlap = row0[0].bbox.x + row0[0].bbox.width - row0[1].bbox.x;
  checkTrue('tile: horizontal neighbors overlap by ≥ overlapPx', hOverlap >= 50);
  const col0 = tiles.filter((t) => t.col === 0);
  const vOverlap = col0[0].bbox.y + col0[0].bbox.height - col0[1].bbox.y;
  checkTrue('tile: vertical neighbors overlap by ≥ overlapPx', vOverlap >= 50);
  checkThrows('tile: overlap >= maxTile rejected', () => tilePage(1000, 1000, 400, 400));
  checkThrows('tile: maxTile 0 rejected', () => tilePage(1000, 1000, 0, 10));
  checkThrows('tile: negative overlap rejected', () => tilePage(1000, 1000, 400, -1));

  // Even-grid tiling (I11 Stage 3, fix 3 — density-aware tiling).
  const grid90135 = tilePageGrid(1191, 1684, 700, 64);
  check('grid: 1191x1684 @700/64 → 6 tiles (2 cols x 3 rows)', grid90135.length, 6);
  check('grid: 90135 cols', new Set(grid90135.map((t) => t.col)).size, 2);
  check('grid: 90135 rows', new Set(grid90135.map((t) => t.row)).size, 3);
  check('grid: 90135 indices row-major 0..5', grid90135.map((t) => t.index).join(','), '0,1,2,3,4,5');
  const grid111853 = tilePageGrid(595, 842, 700, 64);
  check('grid: 595x842 @700/64 → 2 tiles (1 col x 2 rows)', grid111853.length, 2);
  check('grid: 111853 single column', new Set(grid111853.map((t) => t.col)).size, 1);
  const gridPortrait = tilePageGrid(842, 595, 700, 64);
  check('grid: 842x595 @700/64 → 2 tiles (2 cols x 1 row)', gridPortrait.length, 2);
  check('grid: 842x595 single row', new Set(gridPortrait.map((t) => t.row)).size, 1);
  const gridSmall = tilePageGrid(600, 400, 700, 64);
  check('grid: page smaller than maxTile → 1 tile', gridSmall.length, 1);
  check('grid: single tile covers the whole page', gridSmall[0].bbox.width, 600);
  check('grid: single tile full height', gridSmall[0].bbox.height, 400);
  // Tile size bound: never more than maxTilePx + overlapPx on either axis.
  checkTrue('grid: 90135 tiles within maxTile+overlap', grid90135.every((t) => t.bbox.width <= 764 && t.bbox.height <= 764));
  // Last tile ends exactly at the far edge on both axes.
  const last90135 = grid90135[5];
  check('grid: last tile reaches right edge', last90135.bbox.x + last90135.bbox.width, 1191);
  check('grid: last tile reaches bottom edge', last90135.bbox.y + last90135.bbox.height, 1684);
  const last111853 = grid111853[1];
  check('grid: 111853 last tile reaches bottom edge', last111853.bbox.y + last111853.bbox.height, 842);
  // Coverage: every sample point (41 px grid + corners) is inside ≥1 tile.
  let gridUncovered = 0;
  const gridPoints: Array<[number, number]> = [[0, 0], [1190, 0], [0, 1683], [1190, 1683], [595, 842]];
  for (let y = 0; y < 1684; y += 41) {
    for (let x = 0; x < 1191; x += 41) gridPoints.push([x, y]);
  }
  for (const [px, py] of gridPoints) {
    const covered = grid90135.some((t) => px >= t.bbox.x && px < t.bbox.x + t.bbox.width && py >= t.bbox.y && py < t.bbox.y + t.bbox.height);
    if (!covered) gridUncovered += 1;
  }
  check('grid: every sampled pixel (incl. corners) is covered', gridUncovered, 0);
  // Adjacent overlap honored (≥ overlapPx) on both axes.
  const gridRow0 = grid90135.filter((t) => t.row === 0);
  checkTrue('grid: horizontal neighbors overlap by ≥ overlapPx', gridRow0[0].bbox.x + gridRow0[0].bbox.width - gridRow0[1].bbox.x >= 64);
  const gridCol0 = grid90135.filter((t) => t.col === 0);
  checkTrue('grid: vertical neighbors overlap by ≥ overlapPx', gridCol0[0].bbox.y + gridCol0[0].bbox.height - gridCol0[1].bbox.y >= 64);
  checkTrue('grid: vertical neighbors (row 1→2) overlap by ≥ overlapPx', gridCol0[1].bbox.y + gridCol0[1].bbox.height - gridCol0[2].bbox.y >= 64);
  checkThrows('grid: overlap >= maxTile rejected', () => tilePageGrid(1000, 1000, 400, 400));
  checkThrows('grid: maxTile 0 rejected', () => tilePageGrid(1000, 1000, 0, 10));
  checkThrows('grid: negative overlap rejected', () => tilePageGrid(1000, 1000, 400, -1));

  // roiIdFor.
  check('roiId: stable for the same bbox', roiIdFor({ x: 10, y: 20, width: 30, height: 40 }), roiIdFor({ x: 10, y: 20, width: 30, height: 40 }));
  checkTrue('roiId: distinct bboxes → distinct ids', roiIdFor({ x: 10, y: 20, width: 30, height: 40 }) !== roiIdFor({ x: 11, y: 20, width: 30, height: 40 }));
  check('roiId: rounds float jitter', roiIdFor({ x: 10.4, y: 20.6, width: 30.2, height: 40.8 }), 'roi-10-21-30-41');

  // IoU.
  check('iou: identical boxes → 1', bboxIou({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 }), 1);
  check('iou: disjoint boxes → 0', bboxIou({ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 50, width: 10, height: 10 }), 0);
  check('iou: half-overlap → 1/3', bboxIou({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 0, width: 100, height: 100 }), 1 / 3);
  check('iou: degenerate box → 0', bboxIou({ x: 0, y: 0, width: 0, height: 100 }, { x: 0, y: 0, width: 100, height: 100 }), 0);

  // Dedupe.
  const dupes = dedupeProposals(
    [
      { kind: 'symbol', label: 'D1', bbox: { x: 100, y: 100, width: 90, height: 210 }, confidence: 0.6 },
      { kind: 'symbol', label: 'D1', bbox: { x: 100, y: 100, width: 90, height: 210 }, confidence: 0.9 },
    ],
    0.5,
  );
  check('dedupe: identical overlap collapses to 1', dupes.kept.length, 1);
  check('dedupe: higher confidence wins', dupes.kept[0].confidence, 0.9);
  check('dedupe: lower confidence dropped', dupes.dropped.length, 1);
  check('dedupe: merge recorded', dupes.merges.length, 1);
  check('dedupe: merge records kept confidence', dupes.merges[0].keptConfidence, 0.9);
  check('dedupe: merge records dropped confidence', dupes.merges[0].droppedConfidence, 0.6);

  const distinct = dedupeProposals(
    [
      { kind: 'symbol', label: 'D1', bbox: { x: 100, y: 100, width: 90, height: 210 }, confidence: 0.9 },
      { kind: 'symbol', label: 'D2', bbox: { x: 100, y: 100, width: 90, height: 210 }, confidence: 0.9 },
      { kind: 'dimension', label: 'D1', bbox: { x: 100, y: 100, width: 90, height: 210 }, confidence: 0.9 },
    ],
    0.5,
  );
  check('dedupe: different label never merges', distinct.kept.length, 3);
  const nullBbox = dedupeProposals(
    [
      { kind: 'symbol', label: 'D1', bbox: null, confidence: 0.9 },
      { kind: 'symbol', label: 'D1', bbox: null, confidence: 0.8 },
    ],
    0.5,
  );
  check('dedupe: null-bbox proposals can never be proven duplicates', nullBbox.kept.length, 2);
  const belowThreshold = dedupeProposals(
    [
      { kind: 'symbol', label: 'D1', bbox: { x: 0, y: 0, width: 100, height: 100 }, confidence: 0.9 },
      { kind: 'symbol', label: 'D1', bbox: { x: 50, y: 0, width: 100, height: 100 }, confidence: 0.8 },
    ],
    0.5,
  );
  check('dedupe: IoU 1/3 below 0.5 threshold → both kept', belowThreshold.kept.length, 2);
  checkThrows('dedupe rejects threshold > 1', () => dedupeProposals([], 1.5));

  // =======================================================================
  // 9. VisionClient + stub responder (no network anywhere in this section)
  // =======================================================================
  let stubCalls = 0;
  const stubResponder = async (request: VisionRequest): Promise<VisionResponse> => {
    stubCalls += 1;
    void request;
    return {
      content: JSON.stringify({
        detections: [{ kind: 'dimension', label: 'width', rawText: '3.500', bbox: { x: 10, y: 10, width: 100, height: 20 }, confidence: 0.95 }],
      }),
      model: 'Ezrab-flash-v1',
      provider: 'ezrab',
      requestId: 'stub-1',
      durationMs: 5,
      usage: null,
      usageStatus: 'missing',
    };
  };
  const client = new VisionClient(stubResponder);
  const analyzed = await client.analyze({
    imageDataUrl: SMALL_PNG,
    prompt: buildDimensionPrompt({ page: 1, imageWidthPx: 1240, imageHeightPx: 1754 }),
    page: 1,
    imageWidthPx: 1240,
    imageHeightPx: 1754,
  });
  check('client: stub response parses to 1 proposal', analyzed.proposals.length, 1);
  check('client: proposal label from stub', analyzed.proposals[0].label, 'width');
  check('client: stub called exactly once', stubCalls, 1);

  // Oversize image is refused BEFORE the responder is called.
  await checkRejectsKind(
    'client: oversize image refused before any responder call',
    client.analyze({ imageDataUrl: 'A'.repeat(3500001), prompt: 'x', page: 1, imageWidthPx: 100, imageHeightPx: 100 }),
    'oversize',
  );
  check('client: stub NOT called for the oversize image', stubCalls, 1);

  // Invalid dims refused before the responder is called.
  await checkRejectsKind(
    'client: zero imageWidthPx refused',
    client.analyze({ imageDataUrl: SMALL_PNG, prompt: 'x', page: 1, imageWidthPx: 0, imageHeightPx: 100 }),
    'invalid_request',
  );
  check('client: stub NOT called for invalid dims', stubCalls, 1);

  // Stub errors propagate as VisionError, unchanged.
  const failingStub: VisionResponder = async () => {
    throw new VisionError('unavailable', 'stub says the gateway is down', { retryable: true });
  };
  const failingClient = new VisionClient(failingStub);
  await checkRejectsKind(
    'client: stub VisionError propagates with its kind',
    failingClient.analyze({ imageDataUrl: SMALL_PNG, prompt: 'x', page: 1, imageWidthPx: 100, imageHeightPx: 100 }),
    'unavailable',
  );

  checkThrowsKind('client: constructor requires a responder function', () => new VisionClient(null as unknown as never), 'invalid_request');

  // =======================================================================
  // Zero-network proof: the sentinel was never tripped, and every fetch
  // went through the recording fake (11 calls, all accounted for above).
  // =======================================================================
  check('ZERO NETWORK: global fetch was never called', liveFetchCalls, 0);
  check('ZERO NETWORK: recording fake saw exactly 11 calls', fetchCalls.length, 11);
  check('ZERO NETWORK: stub responder saw exactly 1 call', stubCalls, 1);

  // --- Summary ------------------------------------------------------------
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

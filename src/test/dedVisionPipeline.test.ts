/**
 * I8b — Vision pipeline + live-service wiring suite (plain-tsx assertion script, NO vitest).
 *
 * STUB-FIRST: this suite makes ZERO network calls and NEVER constructs the
 * real gateway responder (`createGatewayVisionResponder` is not even
 * imported here). The global fetch is replaced with a sentinel that fails
 * the suite if anything ever calls it; every vision call goes through a
 * recording stub responder, and every render goes through a stub
 * renderPage. The service-level gate is exercised through
 * `runVisionForDedService` — the exact entry point both live services
 * call (the services pass `options.visionEnabled` straight through).
 *
 * Run from repo root:
 *   npx --yes tsx src/test/dedVisionPipeline.test.ts
 */

import { canUseCanonicalCatalog, canUseInternalPriceData } from '../ai-tools/ded-ai-estimate/dedMode';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';
import { jumpTarget } from '../ai-tools/ded-vision/reviewState';
import {
  applyVisionEvidenceToReviewItem,
  buildReviewItems,
  buildVisionReviewItems,
  liveItemFingerprint,
  reconcileReviewState,
} from '../ai-tools/ded-vision/reviewIntegration';
import { createReviewState } from '../ai-tools/ded-vision/reviewState';
import { VisionCache, visionCacheKey } from '../ai-tools/ded-vision/visionCache';
import { VISION_MODEL_VERSION, VISION_PROMPT_VERSION } from '../ai-tools/ded-vision/visionClient';
import type { VisionParseResult, VisionRequest, VisionResponder, VisionResponse } from '../ai-tools/ded-vision/visionClient';
import {
  DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT,
  DENSITY_TILE_MAX_PX,
  DENSITY_TILE_THRESHOLD_CHARS_PER_MP,
  base64LengthOfDataUrl,
  canEnrichWithCanonical,
  cleanSymbolLabel,
  computeDocHash,
  createParserPreviewRenderPage,
  decideVisionRender,
  detectDegenerateFlood,
  focusRoiId,
  matchVisionEvidenceToItem,
  pngDimensionsFromDataUrl,
  rescaleBboxToPage,
  runVisionDocument,
  runVisionForDedService,
  runVisionPage,
  textLayerEvidencesDimensions,
  textLayerEvidencesMarks,
  textLayerEvidencesScheduleRows,
  translateTileBboxToPage,
  visionPolicyForClass,
  visionTextDensityCharsPerMp,
} from '../ai-tools/ded-vision/visionPipeline';
import type {
  VisionDetectionProposal,
  VisionPageInput,
  VisionRenderPage,
} from '../ai-tools/ded-vision/visionPipeline';

// --- fetch sentinel: ANY network call fails the suite -----------------------
const realFetch = globalThis.fetch;
let fetchCalls = 0;
(globalThis as unknown as { fetch: typeof fetch }).fetch = ((..._args: unknown[]) => {
  fetchCalls += 1;
  throw new Error('NETWORK CALL IN TEST — vision tests must use stub responders only.');
}) as unknown as typeof fetch;

// --- assertion harness (same style as dedVisionClient.test.ts) --------------
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

function checkNear(name: string, actual: number, expected: number, tolerance: number): void {
  total += 1;
  if (Math.abs(actual - expected) <= tolerance) passed += 1;
  else failures.push(`${name} — expected ${expected} ± ${tolerance}, got ${actual}`);
}

// --- fixtures ----------------------------------------------------------------

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

function promptKind(prompt: string): string {
  if (prompt.includes('TASK — PAGE SURVEY')) return 'survey';
  if (prompt.includes('TASK — DIMENSIONS')) return 'dimension';
  if (prompt.includes('TASK — SYMBOLS')) return 'symbol';
  if (prompt.includes('TASK — TABLES')) return 'table';
  if (prompt.includes('TASK — LEGEND')) return 'legend';
  if (prompt.includes('TASK — OBJECTS')) return 'object';
  return 'unknown';
}

function promptPage(prompt: string): number {
  const m = prompt.match(/reading page (\d+)/);
  return m ? Number(m[1]) : 0;
}

interface RenderPageSpec {
  w: number;
  h: number;
  b64: number;
}

function makeRenderPage(
  specs: Record<number, RenderPageSpec>,
  opts: { respectScale?: boolean } = {},
): { renderPage: VisionRenderPage; calls: Array<{ page: number; roi?: unknown; scale?: number }> } {
  const calls: Array<{ page: number; roi?: unknown; scale?: number }> = [];
  const renderPage: VisionRenderPage = async ({ page, roi, scale }) => {
    calls.push({ page, roi, scale });
    const spec = specs[page] ?? { w: 1000, h: 800, b64: 1000 };
    if (roi) {
      const r = roi as { x: number; y: number; width: number; height: number };
      return { dataUrl: TINY_PNG, widthPx: Math.round(r.width), heightPx: Math.round(r.height), base64Length: 250 };
    }
    const s = opts.respectScale ? (scale ?? 1) : 1;
    return {
      dataUrl: TINY_PNG,
      widthPx: Math.max(1, Math.round(spec.w * s)),
      heightPx: Math.max(1, Math.round(spec.h * s)),
      base64Length: spec.b64,
    };
  };
  return { renderPage, calls };
}

function floorPlanPage(overrides: Partial<VisionPageInput> = {}): VisionPageInput {
  return {
    page: 1,
    title: 'DENAH LANTAI 1',
    text: 'denah lantai 1 ruang tamu kamar tidur dapur',
    hasTextLayer: true,
    widthPx: 1000,
    heightPx: 800,
    base64Length: 100000,
    ...overrides,
  };
}

function detections(list: unknown[]): { detections: unknown[] } {
  return { detections: list };
}

function dimEntry(rawText: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'dimension',
    // I11 Stage 4 (E18): the label carries kind evidence now — 'overall
    // width' would make every helper dim OVERALL. The neutral helper
    // uses a label with no kind keyword.
    label: 'wall length',
    rawText,
    bbox: { x: 100, y: 100, width: 200, height: 40 },
    confidence: 0.95,
    ...extra,
  };
}

function symbolEntry(mark: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'symbol',
    label: mark,
    rawText: mark,
    bbox: { x: 300, y: 200, width: 60, height: 90 },
    confidence: 0.9,
    ...extra,
  };
}

function makeLiveItem(overrides: Partial<DedAiItem> = {}): DedAiItem {
  return {
    id: 'item-1',
    name: 'Dinding bata merah',
    category: 'Pekerjaan Dinding',
    units: 'm2',
    quantity: 10,
    quantitySource: 'DERIVED',
    quantityFormula: '3.500 x 2.800',
    rawDimensions: '3.500 x 2.800 m',
    unitPrice: 50000,
    priceSource: 'AHSP_2026',
    subtotal: 500000,
    sourcePages: [1],
    provenance: ['test'],
    stage: 'CALCULATED',
    ...overrides,
  };
}

async function main(): Promise<void> {
  // =======================================================================
  // A. The visionEnabled gate (runVisionForDedService — the services' entry)
  // =======================================================================
  {
    let factoryCalls = 0;
    const { responder, calls } = makeResponder(() => detections([]));
    const { renderPage, calls: renderCalls } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const cache = new VisionCache<VisionParseResult>({ maxEntries: 10 });
    const off = await runVisionForDedService({
      visionEnabled: false,
      responder,
      createResponder: () => {
        factoryCalls += 1;
        return responder;
      },
      docHash: 'doc-a',
      mode: 'EZRAB_AI',
      pages: [floorPlanPage()],
      renderPage,
      cache,
    });
    check('gate off: returns null', off, null);
    check('gate off: responder factory never called', factoryCalls, 0);
    check('gate off: responder never called', calls.length, 0);
    check('gate off: renderPage never called', renderCalls.length, 0);
    check('gate off: cache untouched', cache.size, 0);

    const on = await runVisionForDedService({
      visionEnabled: true,
      responder,
      createResponder: () => {
        factoryCalls += 1;
        return responder;
      },
      docHash: 'doc-a',
      mode: 'EZRAB_AI',
      pages: [floorPlanPage()],
      renderPage,
      cache,
    });
    checkTrue('gate on: returns a document result', on !== null);
    check('gate on: injected responder wins, factory still uncalled', factoryCalls, 0);
    check('gate on: responder called once (survey)', calls.length, 1);

    let factoryOnlyCalls = 0;
    const onFactory = await runVisionForDedService({
      visionEnabled: true,
      createResponder: () => {
        factoryOnlyCalls += 1;
        return responder;
      },
      docHash: 'doc-a',
      mode: 'EZRAB_AI',
      pages: [floorPlanPage()],
      renderPage,
    });
    check('gate on + factory only: factory called exactly once', factoryOnlyCalls, 1);
    checkTrue('gate on + factory only: returns a result', onFactory !== null);

    let threw = false;
    try {
      await runVisionForDedService({
        visionEnabled: true,
        docHash: 'doc-a',
        mode: 'EZRAB_AI',
        pages: [floorPlanPage()],
        renderPage,
      });
    } catch {
      threw = true;
    }
    checkTrue('gate on + no responder at all: throws (never a silent text-only fallback)', threw);
  }

  // =======================================================================
  // B. Per-class policy — classify before vision
  // =======================================================================
  check('policy: COVER gets no call', visionPolicyForClass('COVER'), 'none');
  check('policy: FLOOR_PLAN gets full', visionPolicyForClass('FLOOR_PLAN'), 'full');
  check('policy: UNKNOWN gets survey only', visionPolicyForClass('UNKNOWN'), 'survey');
  check('policy: LEGEND_SPEC gets survey only', visionPolicyForClass('LEGEND_SPEC'), 'survey');
  check('policy: DOOR_WINDOW_SCHEDULE gets full', visionPolicyForClass('DOOR_WINDOW_SCHEDULE'), 'full');
  {
    const { responder, calls } = makeResponder(() => detections([dimEntry('3.500')]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const cover = await runVisionPage({
      ...floorPlanPage({ title: 'Sampul Proyek', text: 'sampul gambar kerja daftar gambar' }),
      docHash: 'doc-b',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('COVER page: classification is COVER', cover.classification.drawingClass, 'COVER');
    check('COVER page: zero responder calls', calls.length, 0);
    check('COVER page: skippedReason is policy', cover.skippedReason, 'policy');
    check('COVER page: cost.calls is 0', cover.cost.calls, 0);

    const plan = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-b',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('FLOOR_PLAN page: classification is FLOOR_PLAN', plan.classification.drawingClass, 'FLOOR_PLAN');
    checkTrue('FLOOR_PLAN page: gets a detection call', calls.length >= 1);
    check('FLOOR_PLAN page: dimension validated from survey', plan.dimensions.length, 1);
    check('FLOOR_PLAN page: dimension value is 3500 mm', plan.dimensions[0]?.normalizedValue, 3500);
  }

  // =======================================================================
  // C. Cache — hit skips the responder; prompt version is part of the key
  // =======================================================================
  {
    const cache = new VisionCache<VisionParseResult>({ maxEntries: 10 });
    const { responder, calls } = makeResponder(() => detections([dimEntry('3.500')]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const doc = { docHash: 'doc-c', mode: 'EZRAB_AI' as const, pages: [floorPlanPage()], responder, renderPage, cache };
    const first = await runVisionDocument(doc);
    check('cache: first run makes 1 call', first.totalCost.calls, 1);
    const second = await runVisionDocument(doc);
    check('cache: second identical run makes 0 new calls', calls.length, 1);
    check('cache: second run page is a cache hit', second.pages[0]?.cacheHit, true);
    check('cache: second run records the hit', second.totalCost.cacheHits, 1);
    check('cache: second run still yields the dimension', second.pages[0]?.dimensions.length, 1);

    const keyV1 = visionCacheKey({ docHash: 'd', page: 1, promptVersion: 'v1', modelVersion: VISION_MODEL_VERSION });
    const keyV2 = visionCacheKey({ docHash: 'd', page: 1, promptVersion: 'v2', modelVersion: VISION_MODEL_VERSION });
    checkTrue('cache: key changes with prompt version', keyV1 !== keyV2);

    // Poison the cache under a STALE prompt version — the pipeline must miss.
    const poisoned = new VisionCache<VisionParseResult>({ maxEntries: 10 });
    poisoned.set(
      visionCacheKey({ docHash: 'doc-c', page: 1, roiId: 'full', promptVersion: 'v0', modelVersion: VISION_MODEL_VERSION }),
      {
        proposals: [
          {
            kind: 'dimension',
            label: 'POISON',
            rawText: 'POISON',
            bbox: null,
            confidence: 1,
            page: 1,
            status: 'HIGH_CONFIDENCE',
            raw: {},
          },
        ],
        droppedCount: 0,
        warnings: [],
        status: 'HIGH_CONFIDENCE',
      },
    );
    const { responder: responder2, calls: calls2 } = makeResponder(() => detections([dimEntry('3.500')]));
    const poisonedRun = await runVisionDocument({
      docHash: 'doc-c',
      mode: 'EZRAB_AI',
      pages: [floorPlanPage()],
      responder: responder2,
      renderPage,
      cache: poisoned,
    });
    check('cache poison: stale prompt version misses (responder called)', calls2.length, 1);
    checkTrue(
      'cache poison: poisoned label never reaches the result',
      !poisonedRun.pages[0]?.proposals.some((p) => p.label === 'POISON'),
    );
    check('cache poison: prompt version in use is v3 (E18 de-poisoned labels + F9/F10 caps)', VISION_PROMPT_VERSION, 'v3');
  }

  // =======================================================================
  // D. Render decision — single vs downscale vs tiling (pure)
  // =======================================================================
  {
    const small = decideVisionRender({ widthPx: 1000, heightPx: 800, base64Length: 100000 });
    check('render: small page is a single native render', small.mode, 'single');
    check('render: small page scale is 1', small.scale, 1);

    const medium = decideVisionRender({ widthPx: 2000, heightPx: 1500, base64Length: 7142857 });
    check('render: modest oversize stays single', medium.mode, 'single');
    checkNear('render: modest oversize downscale factor is ~0.7', medium.scale, 0.7, 0.01);

    const huge = decideVisionRender({ widthPx: 4000, heightPx: 3000, base64Length: 20000000 });
    check('render: large oversize tiles', huge.mode, 'tiled');
    checkTrue('render: tile count is within the cap', huge.tiles.length >= 2 && huge.tiles.length <= 9);

    const enormous = decideVisionRender({ widthPx: 8000, heightPx: 6000, base64Length: 100000000 });
    check('render: tile-cap overflow falls back to single', enormous.mode, 'single');
    checkTrue('render: overflow scale is below the readability floor', enormous.scale < 0.5);
    checkTrue('render: overflow reason names the tile cap', enormous.reason.includes('tile'));

    const unknown = decideVisionRender({ widthPx: 0, heightPx: 0, base64Length: 1000 });
    check('render: unknown size attempts a single render', unknown.mode, 'single');
  }

  // =======================================================================
  // D2. Density-aware tiling (I11 Stage 3, fix 3)
  // =======================================================================
  {
    check('density: threshold constant is 5000 ch/MP', DENSITY_TILE_THRESHOLD_CHARS_PER_MP, 5000);
    check('density: tile long-side cap is 700 px', DENSITY_TILE_MAX_PX, 700);
    checkNear('density: 90135 sheet ≈ 14,354 ch/MP', visionTextDensityCharsPerMp(28790, 1191, 1684), 14354, 5);
    checkNear('density: 111853 sheet ≈ 88,419 ch/MP', visionTextDensityCharsPerMp(44297, 595, 842), 88419, 5);
    check('density: zero text → 0', visionTextDensityCharsPerMp(0, 1191, 1684), 0);
    check('density: unknown size → 0', visionTextDensityCharsPerMp(1000, 0, 0), 0);

    // Dense page tiles at NATIVE scale (legibility, not size, is the driver).
    const dense = decideVisionRender({ widthPx: 1191, heightPx: 1684, base64Length: 100000, textChars: 28790 });
    check('render-density: dense page tiles', dense.mode, 'tiled');
    check('render-density: 90135 density grid is 6 tiles', dense.tiles.length, 6);
    check('render-density: density tiles at native scale', dense.scale, 1);
    checkTrue('render-density: reason names density', dense.reason.includes('Dense page'));

    const dense111853 = decideVisionRender({ widthPx: 595, heightPx: 842, base64Length: 100000, textChars: 44297 });
    check('render-density: 111853 density grid is 2 tiles', dense111853.tiles.length, 2);
    check('render-density: 111853 density tiles at native scale', dense111853.scale, 1);

    // Sparse page stays single.
    const sparse = decideVisionRender({ widthPx: 1191, heightPx: 1684, base64Length: 100000, textChars: 1000 });
    check('render-density: sparse page stays single', sparse.mode, 'single');

    // Same text at 2x render scale → density below threshold → single.
    const dense2x = decideVisionRender({ widthPx: 2382, heightPx: 3368, base64Length: 100000, textChars: 28790 });
    check('render-density: dense text at 2x render stays single', dense2x.mode, 'single');

    // Dense + modest oversize → density branch wins: tiles at native
    // scale instead of a 0.7x downscale (downscaling dense text makes
    // it LESS legible, never more).
    const denseOversize = decideVisionRender({ widthPx: 1191, heightPx: 1684, base64Length: 7142857, textChars: 28790 });
    check('render-density: dense + modest oversize tiles', denseOversize.mode, 'tiled');
    check('render-density: dense + modest oversize tiles at native scale', denseOversize.scale, 1);

    // Dense + LARGE oversize (downscale factor < 0.5) → density branch
    // does not apply; the size branch decides (tiles by size here).
    const denseHuge = decideVisionRender({ widthPx: 4000, heightPx: 3000, base64Length: 20000000, textChars: 200000 });
    check('render-density: dense + large oversize still tiles (size branch)', denseHuge.mode, 'tiled');
    checkTrue('render-density: large-oversize reason is size, not density', denseHuge.reason.includes('oversize') && !denseHuge.reason.includes('Dense page'));

    // Density grid over the 9-tile cap → falls through to the size
    // branch (small payload → single native render).
    const denseWide = decideVisionRender({ widthPx: 4000, heightPx: 4000, base64Length: 100000, textChars: 100000 });
    check('render-density: density grid over cap falls back to single', denseWide.mode, 'single');
    check('render-density: over-cap fallback at native scale', denseWide.scale, 1);

    // Scanned page (no text layer) → density 0 → no density tiling.
    const scanned = decideVisionRender({ widthPx: 1191, heightPx: 1684, base64Length: 100000, textChars: 0 });
    check('render-density: scanned page (no text) stays single', scanned.mode, 'single');
    // Omitted textChars behaves like 0.
    const noTextArg = decideVisionRender({ widthPx: 1191, heightPx: 1684, base64Length: 100000 });
    check('render-density: omitted textChars stays single', noTextArg.mode, 'single');
  }

  // =======================================================================
  // E. Tiling — bbox translation + dedupe across overlap zones
  // =======================================================================
  {
    // 14.1M base64 chars → 6 tiles (3 cols × 2 rows, tile 0 at x 0..1564,
    // tile 1 at x 1500..3064). Door at page (1520,100,30,30) sits in the
    // overlap: tile-local (1520,100) vs (20,100).
    const script: ScriptFn = (_req, callIndex) => {
      if (callIndex === 0) {
        return detections([{ ...symbolEntry('D1'), bbox: { x: 1520, y: 100, width: 30, height: 30 }, confidence: 0.9 }]);
      }
      if (callIndex === 1) {
        return detections([{ ...symbolEntry('D1'), bbox: { x: 20, y: 100, width: 30, height: 30 }, confidence: 0.8 }]);
      }
      return detections([]);
    };
    const { responder, calls } = makeResponder(script);
    const { renderPage } = makeRenderPage({ 1: { w: 4000, h: 3000, b64: 14100000 } });
    const tiled = await runVisionPage({
      ...floorPlanPage({ widthPx: 4000, heightPx: 3000, base64Length: 14100000 }),
      docHash: 'doc-e',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
      schedule: [{ mark: 'D1', widthMm: 900, heightMm: 2100, sourcePage: 2, rowText: 'D1 | Pintu | 900 x 2100' }],
    });
    check('tiling: render decision is tiled', tiled.renderDecision.mode, 'tiled');
    check('tiling: 6 tile survey calls', calls.length, 6);
    check('tiling: detail pass not needed (linked opening)', tiled.detailPass, false);
    check('tiling: overlap duplicate deduped to 1 proposal', tiled.proposals.length, 1);
    check('tiling: higher-confidence duplicate kept', tiled.proposals[0]?.confidence, 0.9);
    check('tiling: bbox translated to page coords (x)', tiled.proposals[0]?.bbox?.x, 1520);
    check('tiling: bbox translated to page coords (y)', tiled.proposals[0]?.bbox?.y, 100);
    check('tiling: one opening from the deduped symbol', tiled.openings.length, 1);
    check('tiling: opening quantity is 1 (no double-count)', tiled.openings[0]?.quantity, 1);
    check('tiling: opening linked to the schedule row', tiled.openings[0]?.widthMm, 900);
    checkTrue('tiling: at least one dedupe merge recorded', tiled.dedupeMerges >= 1);

    // Direct translation check (pure helper).
    const moved = translateTileBboxToPage(
      { x: 100, y: 100, width: 50, height: 50 },
      { index: 1, row: 0, col: 1, bbox: { x: 1000, y: 0, width: 1000, height: 1000 } },
      1000,
      1000,
    );
    check('translate: tile-local x maps to page x', moved.x, 1100);
    check('translate: tile-local y maps to page y', moved.y, 100);
    const scaled = rescaleBboxToPage({ x: 100, y: 100, width: 50, height: 50 }, 500, 400, 1000, 800);
    check('rescale: downscaled x maps to page x', scaled.x, 200);
    check('rescale: downscaled width maps to page width', scaled.width, 100);
  }

  // =======================================================================
  // F. Downscaled single render — bboxes rescale to page pixels
  // =======================================================================
  {
    const { responder } = makeResponder(() => detections([dimEntry('3.500')]));
    const { renderPage } = makeRenderPage(
      { 1: { w: 1000, h: 800, b64: 14000000 } },
      { respectScale: true },
    );
    const downscaled = await runVisionPage({
      ...floorPlanPage({ base64Length: 14000000 }),
      docHash: 'doc-f',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('downscale: decision is single', downscaled.renderDecision.mode, 'single');
    checkNear('downscale: factor is ~0.5', downscaled.renderDecision.scale, 0.5, 0.01);
    check('downscale: dimension region x rescaled to page px', downscaled.dimensions[0]?.region?.x, 200);
    check('downscale: dimension region width rescaled to page px', downscaled.dimensions[0]?.region?.width, 400);
  }

  // =======================================================================
  // G. Dimension validation — the model's number never survives unvalidated
  // =======================================================================
  {
    const { responder } = makeResponder(() => detections([dimEntry('3.500', { normalizedValue: 3500 })]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const agreeing = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-g1',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('dimension: agreeing model value passes (3500 mm)', agreeing.dimensions[0]?.normalizedValue, 3500);
    check('dimension: agreeing record is HIGH_CONFIDENCE', agreeing.dimensions[0]?.status, 'HIGH_CONFIDENCE');
  }
  {
    const { responder } = makeResponder(() => detections([dimEntry('3.500', { normalizedValue: 9999 })]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const lying = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-g2',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('dimension: lying model value discarded — I2 value stands', lying.dimensions[0]?.normalizedValue, 3500);
    check('dimension: mismatch drops the record to NEEDS_REVIEW', lying.dimensions[0]?.status, 'NEEDS_REVIEW');
    checkTrue(
      'dimension: no record carries the model number 9999',
      lying.dimensions.every((d) => d.normalizedValue !== 9999),
    );
    checkTrue('dimension: mismatch is noted on the record', (lying.dimensions[0]?.notes ?? '').includes('9999'));
  }
  {
    const { responder } = makeResponder(() =>
      detections([dimEntry('ABC'), dimEntry('15/30', { label: 'section pair' })]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const mixed = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-g3',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    checkTrue(
      'dimension: unparseable "ABC" becomes a skipped proposal, not a record',
      mixed.skippedProposals.some((s) => s.rawText === 'ABC' && s.reason === 'dimension-unparseable'),
    );
    checkTrue(
      'dimension: no record carries the text "ABC"',
      mixed.dimensions.every((d) => d.originalText !== 'ABC'),
    );
    const pair = mixed.dimensions.filter((d) => d.originalText === '15/30');
    check('dimension: section pair "15/30" yields two records', pair.length, 2);
    checkTrue('dimension: pair records are in cm', pair.every((d) => d.unit === 'cm'));
  }

  // =======================================================================
  // H. Openings — mark with no schedule stays UNRESOLVED with null dims
  // =======================================================================
  {
    const { responder } = makeResponder((req) =>
      promptKind(req.prompt) === 'survey' ? detections([symbolEntry('D1')]) : detections([symbolEntry('D1')]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const unlinked = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-h',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('opening: unlinked mark is UNRESOLVED', unlinked.openings[0]?.status, 'UNRESOLVED');
    check('opening: unlinked mark width is null (never guessed)', unlinked.openings[0]?.widthMm, null);
    check('opening: unlinked mark height is null (never guessed)', unlinked.openings[0]?.heightMm, null);
    check('opening: unlinked mark has no schedule page', unlinked.openings[0]?.schedulePage, null);
    check('opening: COUNT quantity exists for the occurrence', unlinked.quantities.length, 1);
    check('opening: COUNT quantity equals the occurrence count', unlinked.quantities[0]?.quantity, 1);
  }

  // =======================================================================
  // I. Doc-level linking — plan symbol + schedule row on a later page
  // =======================================================================
  let linkedDoc: Awaited<ReturnType<typeof runVisionDocument>> | null = null;
  {
    const script: ScriptFn = (req) => {
      const page = promptPage(req.prompt);
      if (page === 1) return detections([symbolEntry('D1')]);
      return detections([
        {
          kind: 'table',
          label: 'D1',
          rawText: 'D1 | Pintu | 900 x 2100 | Kayu',
          bbox: { x: 50, y: 50, width: 400, height: 30 },
          confidence: 0.95,
        },
      ]);
    };
    const { responder } = makeResponder(script);
    const { renderPage } = makeRenderPage({
      1: { w: 1000, h: 800, b64: 1000 },
      2: { w: 1000, h: 800, b64: 1000 },
    });
    linkedDoc = await runVisionDocument({
      docHash: 'doc-i',
      mode: 'EZRAB_AI',
      pages: [
        floorPlanPage({ page: 1 }),
        floorPlanPage({
          page: 2,
          title: 'JADWAL KUSEN',
          text: 'jadwal kusen pintu jendela daftar kusen',
        }),
      ],
      responder,
      renderPage,
    });
    check('doc-link: schedule page classified as schedule', linkedDoc.pages[1]?.classification.drawingClass, 'DOOR_WINDOW_SCHEDULE');
    check('doc-link: one schedule row read', linkedDoc.scheduleEntries.length, 1);
    check('doc-link: opening linked across pages (width)', linkedDoc.openings[0]?.widthMm, 900);
    check('doc-link: opening linked across pages (height)', linkedDoc.openings[0]?.heightMm, 2100);
    check('doc-link: linked opening is HIGH_CONFIDENCE', linkedDoc.openings[0]?.status, 'HIGH_CONFIDENCE');
    check('doc-link: schedule page recorded', linkedDoc.openings[0]?.schedulePage, 2);
    const schedRef = linkedDoc.references.find((r) => r.kind === 'SCHEDULE' && r.to.ref === 'D1');
    checkTrue('doc-link: SCHEDULE cross-ref exists for the linked opening', schedRef !== undefined);
    check('doc-link: SCHEDULE cross-ref is CONFIRMED', schedRef?.status, 'CONFIRMED');
  }

  // =======================================================================
  // J. FULL AI isolation — the C3 guard point
  // =======================================================================
  {
    check('C3: FULL_AI cannot use the canonical catalog', canUseCanonicalCatalog('FULL_AI'), false);
    check('C3: FULL_AI cannot use internal price data', canUseInternalPriceData('FULL_AI'), false);
    check('C3: EZRAB_AI can use the canonical catalog', canUseCanonicalCatalog('EZRAB_AI'), true);
    check('C3: pipeline enrichment gate is closed for FULL_AI', canEnrichWithCanonical('FULL_AI'), false);
    check('C3: pipeline enrichment gate is open for EZRAB_AI', canEnrichWithCanonical('EZRAB_AI'), true);

    let matcherCalls = 0;
    const recordingMatcher = () => {
      matcherCalls += 1;
      return { ahspCode: 'AHSP-TEST-1' };
    };
    const { responder } = makeResponder(() => detections([symbolEntry('D1')]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const fullAi = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-j1',
      mode: 'FULL_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
      ahspMatcher: recordingMatcher,
    });
    check('FULL_AI: matcher never called', matcherCalls, 0);
    check('FULL_AI: enrichment skipped for isolation', fullAi.ahsp.skippedReason, 'full-ai-isolation');
    check('FULL_AI: no AHSP enrichment attempted', fullAi.ahsp.attempted, false);
    check('FULL_AI: no AHSP matches carried', fullAi.ahsp.matches.length, 0);

    const ezrab = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-j2',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
      ahspMatcher: recordingMatcher,
    });
    check('EZRAB_AI: matcher IS called (gate open)', matcherCalls, 1);
    check('EZRAB_AI: enrichment attempted', ezrab.ahsp.attempted, true);
    check('EZRAB_AI: matched code recorded', ezrab.ahsp.matches[0]?.ahspCode, 'AHSP-TEST-1');

    const nullMatcher = () => null;
    const unmatched = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-j3',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
      ahspMatcher: nullMatcher,
    });
    check('EZRAB_AI: unmatched record stays null (never invented)', unmatched.ahsp.matches[0]?.ahspCode, null);
    check('EZRAB_AI: unmatched record is UNRESOLVED', unmatched.ahsp.matches[0]?.status, 'UNRESOLVED');

    const noMatcher = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-j4',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('EZRAB_AI: no matcher provided is recorded honestly', noMatcher.ahsp.skippedReason, 'no-matcher-provided');
  }

  // =======================================================================
  // K. DETAIL escalation — exactly one re-pass, then it stops
  // =======================================================================
  {
    const { responder, calls } = makeResponder((req) =>
      promptKind(req.prompt) === 'survey' ? detections([symbolEntry('D1')]) : detections([symbolEntry('D1')]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const escalated = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-k1',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('detail: UNRESOLVED full-policy page gets exactly 2 calls', calls.length, 2);
    check('detail: detailPass flag is set', escalated.detailPass, true);
    check('detail: second call is the focused symbol prompt', promptKind(calls[1]?.prompt ?? ''), 'symbol');
    check('detail: still UNRESOLVED after one re-pass (no schedule exists)', escalated.openings[0]?.status, 'UNRESOLVED');
  }
  {
    const { responder, calls } = makeResponder(() => detections([symbolEntry('D1')]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const site = await runVisionPage({
      ...floorPlanPage({ title: 'DENAH SITUASI', text: 'denah situasi site plan tapak jalan' }),
      docHash: 'doc-k2',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('detail: SITE_PLAN classifies as SITE_PLAN', site.classification.drawingClass, 'SITE_PLAN');
    check('detail: survey-policy page gets exactly 1 call (no re-pass)', calls.length, 1);
    check('detail: survey-policy page detailPass is false', site.detailPass, false);
  }
  {
    const { responder, calls } = makeResponder(() => detections([dimEntry('3.500', { normalizedValue: 3500 })]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const clean = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-k3',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('detail: clean page (all HIGH_CONFIDENCE) gets 1 call', calls.length, 1);
    check('detail: clean page detailPass is false', clean.detailPass, false);
  }

  // =======================================================================
  // L. Call cap — remaining pages are NOT_DETECTED with reason 'budget'
  // =======================================================================
  {
    const { responder, calls } = makeResponder(() => detections([dimEntry('3.500', { normalizedValue: 3500 })]));
    const { renderPage } = makeRenderPage({
      1: { w: 1000, h: 800, b64: 1000 },
      2: { w: 1000, h: 800, b64: 1000 },
      3: { w: 1000, h: 800, b64: 1000 },
    });
    const capped = await runVisionDocument({
      docHash: 'doc-l',
      mode: 'EZRAB_AI',
      pages: [
        floorPlanPage({ page: 1 }),
        floorPlanPage({ page: 2, title: 'DENAH LANTAI 2', text: 'denah lantai 2 kamar' }),
        floorPlanPage({ page: 3, title: 'DENAH LANTAI 3', text: 'denah lantai 3 kamar' }),
      ],
      responder,
      renderPage,
      maxCallsPerDocument: 2,
    });
    check('cap: total calls stop at the cap', capped.totalCost.calls, 2);
    check('cap: responder called exactly twice', calls.length, 2);
    check('cap: page 3 is NOT_DETECTED', capped.pages[2]?.status, 'NOT_DETECTED');
    check('cap: page 3 reason is budget', capped.pages[2]?.skippedReason, 'budget');
    check('cap: budgetHit is set', capped.budgetHit, true);
    check('cap: pages 1-2 were read', capped.pages[0]?.dimensions.length, 1);
  }

  // =======================================================================
  // M. Bbox flow — vision detection → DedAiItem → ReviewItem → jumpTarget
  // =======================================================================
  {
    const { responder } = makeResponder((req) =>
      promptKind(req.prompt) === 'survey'
        ? detections([dimEntry('3.500', { normalizedValue: 3500 }), symbolEntry('D1')])
        : detections([symbolEntry('D1')]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const doc = await runVisionDocument({
      docHash: 'doc-m',
      mode: 'EZRAB_AI',
      pages: [floorPlanPage()],
      responder,
      renderPage,
    });
    const dimEvidence = matchVisionEvidenceToItem(
      { name: 'Dinding bata merah', texts: ['3.500 x 2.800 m', '3.500 x 2.800'], sourcePages: [1] },
      doc.pages,
    );
    check('bbox-flow: dimension evidence matches the item', dimEvidence.length >= 1, true);
    check('bbox-flow: evidence bbox x is the proposal bbox', dimEvidence[0]?.bbox.x, 100);
    check('bbox-flow: evidence bbox width is the proposal bbox', dimEvidence[0]?.bbox.width, 200);
    check('bbox-flow: evidence page is the proposal page', dimEvidence[0]?.page, 1);

    const unrelated = matchVisionEvidenceToItem(
      { name: 'Pondasi batu kali', texts: ['10.0 x 0.8 x 1.2 m'], sourcePages: [1] },
      doc.pages,
    );
    check('bbox-flow: unrelated item gets no evidence', unrelated.length, 0);

    const markMatch = matchVisionEvidenceToItem(
      { name: 'Pintu D1 kayu', texts: [], sourcePages: [1] },
      doc.pages,
    );
    checkTrue('bbox-flow: mark D1 matches an item naming D1', markMatch.some((e) => e.label === 'D1'));
    const markNoMatch = matchVisionEvidenceToItem(
      { name: 'Pintu D12 kayu', texts: [], sourcePages: [1] },
      doc.pages,
    );
    check('bbox-flow: mark D1 does NOT match D12 (word boundary)', markNoMatch.length, 0);
    const wrongPage = matchVisionEvidenceToItem(
      { name: 'Dinding bata merah', texts: ['3.500 x 2.800 m'], sourcePages: [7] },
      doc.pages,
    );
    check('bbox-flow: no match when the page is not a source page', wrongPage.length, 0);

    // Through the I7 adapter: item → ReviewItem with bbox → jumpTarget.
    const liveItem = makeLiveItem({ visionEvidence: dimEvidence });
    const reviewItems = buildReviewItems([liveItem]);
    check('bbox-flow: ReviewItem carries the vision bbox', reviewItems[0]?.bbox?.x, 100);
    check('bbox-flow: ReviewItem bbox width matches', reviewItems[0]?.bbox?.width, 200);
    const target = jumpTarget(reviewItems[0]!);
    check('bbox-flow: jumpTarget page is the evidence page', target?.page, 1);
    check('bbox-flow: jumpTarget bbox is the evidence bbox', target?.bbox?.x, 100);

    // No vision evidence → the adapter is byte-identical to before (bbox null, page-only jump).
    const plainItem = makeLiveItem();
    const plainReview = buildReviewItems([plainItem]);
    check('bbox-flow: item without vision evidence keeps bbox null', plainReview[0]?.bbox, null);
    check('bbox-flow: page-only jump still works', jumpTarget(plainReview[0]!)?.page, 1);

    // Reconcile keeps the vision bbox when the live item is unchanged…
    const state = createReviewState(reviewItems);
    const fps = new Map([[liveItem.id, liveItemFingerprint(liveItem)]]);
    const reconciled = reconcileReviewState(state, [liveItem], fps);
    check('bbox-flow: reconcile keeps the review item when unchanged', reconciled.changed, false);
    check('bbox-flow: reconciled item keeps its bbox', reconciled.state.items[0]?.bbox?.x, 100);
    // …and the fingerprint tracks vision evidence.
    const fpWith = liveItemFingerprint(liveItem);
    const fpWithout = liveItemFingerprint(makeLiveItem());
    checkTrue('bbox-flow: fingerprint changes when vision evidence changes', fpWith !== fpWithout);
    check(
      'bbox-flow: fingerprint is stable for identical evidence',
      liveItemFingerprint(makeLiveItem({ visionEvidence: dimEvidence })),
      fpWith,
    );

    // The adapter extension is a no-op (same reference) without evidence.
    const untouched = applyVisionEvidenceToReviewItem(plainReview[0]!, plainItem);
    checkTrue('bbox-flow: adapter returns the same item when no evidence', untouched === plainReview[0]);

    // Vision-only review items (the follow-up seam) carry bboxes too.
    const visionOnly = buildVisionReviewItems(doc.pages);
    const dimReview = visionOnly.find((it) => it.kind === 'dimension');
    checkTrue('bbox-flow: vision-only dimension item exists', dimReview !== undefined);
    check('bbox-flow: vision-only dimension item has the bbox', dimReview?.bbox?.x, 100);
    const openingReview = visionOnly.find((it) => it.kind === 'opening');
    checkTrue('bbox-flow: vision-only opening item exists', openingReview !== undefined);
    check('bbox-flow: vision-only opening item has the bbox', openingReview?.bbox?.x, 300);
  }

  // =======================================================================
  // N. Negative cases — confident-but-impossible detections never become quantities
  // =======================================================================
  {
    const { responder } = makeResponder(() =>
      detections([
        { ...symbolEntry('D1'), bbox: { x: 0, y: 0, width: 0, height: 50 }, confidence: 0.99 },
        dimEntry('999999999'),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const impossible = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-n1',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    checkTrue('negative: impossible bbox dropped by the parser', impossible.droppedProposalCount >= 1);
    check('negative: impossible symbol yields no opening', impossible.openings.length, 0);
    check('negative: impossible symbol yields no quantity', impossible.quantities.length, 0);
    check('negative: absurd dimension yields no record', impossible.dimensions.length, 0);
  }
  {
    const { responder } = makeResponder(() =>
      detections([
        {
          kind: 'object',
          label: 'RUANG TAMU',
          rawText: 'RUANG TAMU',
          bbox: { x: 100, y: 100, width: 300, height: 200 },
          confidence: 0.99,
        },
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const objectOnly = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-n2',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('negative: object-only page yields no quantities', objectOnly.quantities.length, 0);
    checkTrue(
      'negative: object proposal recorded as skipped (not silently lost)',
      objectOnly.skippedProposals.some((s) => s.reason === 'object-no-record-type'),
    );
  }
  {
    const { responder } = makeResponder(() =>
      detections([
        {
          kind: 'symbol',
          label: 'north arrow',
          rawText: '',
          bbox: { x: 10, y: 10, width: 40, height: 40 },
          confidence: 0.99,
        },
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const unmarked = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-n3',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('negative: confident non-opening symbol yields no opening', unmarked.openings.length, 0);
    checkTrue(
      'negative: non-opening symbol recorded as skipped',
      unmarked.skippedProposals.some((s) => s.reason === 'symbol-not-an-opening'),
    );
  }

  // =======================================================================
  // O. Scanned pages, scale, cross-sheet refs, conflicts
  // =======================================================================
  {
    const { responder } = makeResponder(() =>
      detections([
        {
          kind: 'text',
          label: 'drawing title',
          rawText: 'DENAH LANTAI 1',
          bbox: { x: 10, y: 10, width: 200, height: 30 },
          confidence: 0.95,
        },
        dimEntry('3.500', { normalizedValue: 3500 }),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const scanned = await runVisionPage({
      ...floorPlanPage({ title: undefined, text: '', hasTextLayer: false }),
      docHash: 'doc-o1',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('scanned: survey runs for a no-text page', scanned.cost.calls >= 1, true);
    check('scanned: re-classified from survey text as FLOOR_PLAN', scanned.classification.drawingClass, 'FLOOR_PLAN');
  }
  {
    const { responder } = makeResponder(() =>
      detections([
        {
          kind: 'legend',
          label: 'scale',
          rawText: 'SKALA 1:100',
          bbox: null,
          confidence: 0.9,
        },
        dimEntry('3.500', { normalizedValue: 3500 }),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const scaled = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-o2',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('scale: stated scale read from the legend', scaled.scale?.statedScale, '1:100');
    check('scale: method is STATED_ONLY', scaled.scale?.method, 'STATED_ONLY');
    check('scale: stated scale is NOT verified', scaled.scale?.verified, false);
  }
  {
    const { responder } = makeResponder(() =>
      detections([
        {
          kind: 'legend',
          label: 'scale',
          rawText: 'SKALA 1:100',
          bbox: null,
          confidence: 0.9,
        },
        dimEntry('3.500', { normalizedValue: 3500 }),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const conflict = await runVisionPage({
      ...floorPlanPage({ text: 'denah lantai 1 skala 1:50 ruang tamu' }),
      docHash: 'doc-o3',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('scale: native-text scale wins over the vision legend', conflict.scale?.statedScale, '1:50');
    checkTrue(
      'scale: the disagreement is warned, not silently resolved',
      conflict.warnings.some((w) => w.includes('berbeda')),
    );
  }
  {
    const { responder } = makeResponder(() =>
      detections([
        {
          kind: 'text',
          label: 'reference',
          rawText: 'LIHAT DETAIL A',
          bbox: { x: 10, y: 10, width: 120, height: 20 },
          confidence: 0.9,
        },
        dimEntry('3.500', { normalizedValue: 3500 }),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const noTarget = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-o4',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('refs: text reference parsed as DETAIL', noTarget.references[0]?.kind, 'DETAIL');
    check('refs: unknown target stays UNRESOLVED', noTarget.references[0]?.status, 'UNRESOLVED');
    const withTarget = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-o5',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
      knownTargets: [{ page: 5, ref: 'DETAIL A' }],
    });
    check('refs: known target (page unknown) resolves PROBABLE', withTarget.references[0]?.status, 'PROBABLE');
  }
  {
    // Two schedule rows, same mark, different dims → CONTRADICTORY.
    const script: ScriptFn = (req) => {
      const page = promptPage(req.prompt);
      if (page === 1) return detections([symbolEntry('D1')]);
      return detections([
        {
          kind: 'table',
          label: 'D1',
          rawText: 'D1 | Pintu | 900 x 2100 | Kayu',
          bbox: { x: 50, y: 50, width: 400, height: 30 },
          confidence: 0.95,
        },
        {
          kind: 'table',
          label: 'D1',
          rawText: 'D1 | Pintu | 1000 x 2100 | Kayu',
          bbox: { x: 50, y: 90, width: 400, height: 30 },
          confidence: 0.95,
        },
      ]);
    };
    const { responder } = makeResponder(script);
    const { renderPage } = makeRenderPage({
      1: { w: 1000, h: 800, b64: 1000 },
      2: { w: 1000, h: 800, b64: 1000 },
    });
    const conflicted = await runVisionDocument({
      docHash: 'doc-o6',
      mode: 'EZRAB_AI',
      pages: [
        floorPlanPage({ page: 1 }),
        floorPlanPage({ page: 2, title: 'JADWAL KUSEN', text: 'jadwal kusen pintu jendela' }),
      ],
      responder,
      renderPage,
    });
    const bad = conflicted.references.find((r) => r.to.ref === 'D1' && r.status === 'CONTRADICTORY');
    checkTrue('refs: conflicting schedule rows mark the D1 ref CONTRADICTORY', bad !== undefined);
    checkTrue(
      'refs: conflict detail names both claims',
      (bad?.conflictDetail ?? '').includes('900') && (bad?.conflictDetail ?? '').includes('1000'),
    );
  }

  // =======================================================================
  // P. Pure helpers — hashing, PNG dims, preview render seam
  // =======================================================================
  {
    const h1 = await computeDocHash(new Uint8Array([1, 2, 3, 4]));
    const h2 = await computeDocHash(new Uint8Array([1, 2, 3, 4]));
    const h3 = await computeDocHash(new Uint8Array([1, 2, 3, 5]));
    check('hash: same bytes give the same hash', h1, h2);
    checkTrue('hash: different bytes give a different hash', h1 !== h3);
    checkTrue('hash: SHA-256 (WebCrypto) in this environment', h1.startsWith('sha256-'));

    check('png: 1x1 PNG dims read from IHDR', JSON.stringify(pngDimensionsFromDataUrl(TINY_PNG)), JSON.stringify({ widthPx: 1, heightPx: 1 }));
    const fakePngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x03, 0x20, // 800
      0x00, 0x00, 0x02, 0x58, // 600
      0x08, 0x02, 0x00, 0x00, 0x00,
    ]);
    const fakePng = `data:image/png;base64,${fakePngBytes.toString('base64')}`;
    check('png: 800x600 PNG dims read from IHDR', JSON.stringify(pngDimensionsFromDataUrl(fakePng)), JSON.stringify({ widthPx: 800, heightPx: 600 }));
    check('png: garbage returns null (never a guess)', pngDimensionsFromDataUrl('data:image/png;base64,aaaa'), null);
    check('png: non-PNG returns null', pngDimensionsFromDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////'), null);

    check('b64len: counts the payload only (prefix excluded)', base64LengthOfDataUrl('data:image/png;base64,QUJD'), 4);
    check('b64len: bare base64 counts whole', base64LengthOfDataUrl('QUJD'), 4);

    const previews = new Map([
      [1, { dataUrl: TINY_PNG, widthPx: 100, heightPx: 80, base64Length: 50 }],
    ]);
    const previewRender = createParserPreviewRenderPage(previews);
    const full = await previewRender({ page: 1 });
    check('preview-render: full page returns the preview as-is', full.dataUrl, TINY_PNG);
    check('preview-render: full page reports stored dims', full.widthPx, 100);
    let missingThrew = false;
    try {
      await previewRender({ page: 2 });
    } catch {
      missingThrew = true;
    }
    checkTrue('preview-render: missing page throws', missingThrew);
    let cropError = '';
    try {
      await previewRender({ page: 1, roi: { x: 0, y: 0, width: 10, height: 10 } });
    } catch (e) {
      cropError = e instanceof Error ? e.message : String(e);
    }
    checkTrue('preview-render: crop outside a browser fails with a clear canvas error', cropError.includes('canvas'));
  }

  // =======================================================================
  // Q. Doc-level result from section I (kept for the summary print)
  // =======================================================================
  checkTrue('doc-link: linked doc result retained for the report', linkedDoc !== null);

  // =======================================================================
  // R. I10b fix pass — E1 fragments, E2 scale evidence, E3 units note,
  //    E4 letter-only marks, E8 structural marks, E10 prepositions
  // =======================================================================
  {
    // E1 — '3.' + '500' fragments (adjacent bboxes): the tail is skipped,
    // never a false 500 mm record. A far-away '500' with no '.'-head
    // nearby still parses (the guard needs bbox adjacency evidence).
    const { responder } = makeResponder(() =>
      detections([
        dimEntry('3.500'),
        dimEntry('3.', { bbox: { x: 400, y: 100, width: 30, height: 20 } }),
        dimEntry('500', { bbox: { x: 430, y: 100, width: 30, height: 20 } }),
        dimEntry('500', { bbox: { x: 100, y: 400, width: 30, height: 20 } }),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const frag = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-r1',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E1 fragment: only the real 3.500 + the lone 500 parse', frag.dimensions.length, 2);
    checkTrue(
      'E1 fragment: no 500 mm record from the abutting tail',
      frag.dimensions.filter((d) => d.normalizedValue === 500).length === 1 &&
        frag.dimensions.some((d) => d.normalizedValue === 3500),
    );
    checkTrue(
      'E1 fragment: the tail is skipped with reason dimension-fragment-continuation',
      frag.skippedProposals.some((s) => s.reason === 'dimension-fragment-continuation' && s.rawText === '500'),
    );
    checkTrue(
      'E1 fragment: the head is skipped as unparseable',
      frag.skippedProposals.some((s) => s.reason === 'dimension-unparseable' && s.rawText === '3.'),
    );
  }
  {
    // E1 — no bbox, no guard: a bbox-less '500' next to a '3.' cannot be
    // placed, so it parses (the guard never fires without evidence).
    const { responder } = makeResponder(() =>
      detections([
        dimEntry('3.', { bbox: { x: 400, y: 100, width: 30, height: 20 } }),
        dimEntry('500', { bbox: null }),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const noBbox = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-r1b',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    checkTrue(
      'E1 fragment: bbox-less 500 still parses (no placement evidence)',
      noBbox.dimensions.some((d) => d.normalizedValue === 500),
    );
  }
  {
    // E2 — the scale conflict is visible in the RECORD, not just the
    // warning log: the disagreeing vision read is appended to evidence.
    const { responder } = makeResponder(() =>
      detections([
        { kind: 'legend', label: 'scale', rawText: 'SKALA 1:100', bbox: null, confidence: 0.9 },
        dimEntry('3.500', { normalizedValue: 3500 }),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const conflict = await runVisionPage({
      ...floorPlanPage({ text: 'denah lantai 1 skala 1:50 ruang tamu' }),
      docHash: 'doc-r2',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E2 evidence: native text still wins', conflict.scale?.statedScale, '1:50');
    checkTrue(
      'E2 evidence: the disagreeing vision read is in the scale evidence',
      (conflict.scale?.evidence ?? []).some((e) => e.content === 'SKALA 1:100'),
    );
    check('E2 evidence: two evidence entries on conflict', conflict.scale?.evidence.length, 2);
    const agree = await runVisionPage({
      ...floorPlanPage({ text: 'denah lantai 1 skala 1:100 ruang tamu' }),
      docHash: 'doc-r2b',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E2 evidence: no duplicate append when vision agrees', agree.scale?.evidence.length, 1);
  }
  {
    // E3 — the sheet units note is threaded into dimension parsing: the
    // same bare decimal is HIGH_CONFIDENCE with the note, NEEDS_REVIEW
    // without it. The note text is recorded in the record's notes.
    const { responder } = makeResponder(() => detections([dimEntry('3.05')]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const noted = await runVisionPage({
      ...floorPlanPage({ text: "denah lantai 1 ruang tamu. ALL DIMENSION ARE IN 'METER'." }),
      docHash: 'doc-r3',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E3 wiring: 3.05 → 3050 mm with the units note', noted.dimensions[0]?.normalizedValue, 3050);
    check('E3 wiring: evidenced inference is HIGH_CONFIDENCE', noted.dimensions[0]?.status, 'HIGH_CONFIDENCE');
    checkTrue(
      'E3 wiring: the note text is recorded in notes',
      (noted.dimensions[0]?.notes ?? '').includes("ALL DIMENSION ARE IN 'METER'"),
    );
    const bare = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-r3b',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E3 wiring: 3.05 → 3050 mm without the note too', bare.dimensions[0]?.normalizedValue, 3050);
    check('E3 wiring: unevidenced inference stays NEEDS_REVIEW', bare.dimensions[0]?.status, 'NEEDS_REVIEW');
  }
  {
    // E4 — letter-only marks become linked openings (doc-level re-link:
    // same-page schedule rows link in phase 2). A bare 'A' with no
    // keyword is not an opening; a label carrying the keyword ('D-DOOR')
    // still links by the mark alone.
    const { responder } = makeResponder(() =>
      detections([
        symbolEntry('D', { rawText: 'D DOOR' }),
        symbolEntry('D', { rawText: 'D DOOR', bbox: { x: 500, y: 200, width: 60, height: 90 } }),
        symbolEntry('MD', { rawText: 'MD MAIN DOOR' }),
        symbolEntry('W', { rawText: 'W WINDOW' }),
        symbolEntry('D-DOOR', { rawText: 'D-DOOR' }),
        symbolEntry('A', { rawText: 'A' }),
        { kind: 'table', label: 'D', rawText: 'D-DOOR - 0.91X2.13', bbox: { x: 50, y: 50, width: 400, height: 30 }, confidence: 0.95 },
        { kind: 'table', label: 'MD', rawText: 'MD-MAIN DOOR - 1.07X2.13', bbox: { x: 50, y: 90, width: 400, height: 30 }, confidence: 0.95 },
        { kind: 'table', label: 'W', rawText: 'W-WINDOW - 0.91X1.21', bbox: { x: 50, y: 130, width: 400, height: 30 }, confidence: 0.95 },
        dimEntry('3.500'),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const doc = await runVisionDocument({
      docHash: 'doc-r4',
      mode: 'EZRAB_AI',
      pages: [floorPlanPage()],
      responder,
      renderPage,
    });
    const byMark = new Map(doc.openings.map((o) => [o.mark, o]));
    checkTrue('E4 marks: D links with 910×2130', byMark.get('D')?.widthMm === 910 && byMark.get('D')?.heightMm === 2130);
    check('E4 marks: D quantity counts all three occurrences', byMark.get('D')?.quantity, 3);
    checkTrue('E4 marks: MD links with 1070×2130', byMark.get('MD')?.widthMm === 1070 && byMark.get('MD')?.heightMm === 2130);
    checkTrue('E4 marks: W links with 910×1210', byMark.get('W')?.widthMm === 910 && byMark.get('W')?.heightMm === 1210);
    checkTrue('E4 marks: no phantom A opening', !byMark.has('A'));
    checkTrue('E4 marks: no DDOOR opening (label keyword is not the mark)', !byMark.has('DDOOR'));
    checkTrue(
      'E4 marks: A is skipped as not-an-opening',
      doc.pages[0].skippedProposals.some((s) => s.reason === 'symbol-not-an-opening' && s.label === 'A'),
    );
  }
  {
    // E8 — bare structural marks on a STRUCTURAL page become ELEMENT
    // records (I11 Stage 4, E16), never phantom openings. The class gate
    // is essential: K1 on a floor plan stays an opening candidate, and
    // D5 (below the rebar floor) stays an opening candidate even on a
    // structural page.
    const structuralResponder = makeResponder(() =>
      detections([
        symbolEntry('D12'),
        symbolEntry('K1'),
        symbolEntry('B1'),
        symbolEntry('D5', { bbox: { x: 600, y: 200, width: 60, height: 90 } }),
        dimEntry('3.500'),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const structural = await runVisionPage({
      ...floorPlanPage({ title: 'DENAH STRUKTUR', text: 'denah struktur kolom balok pelat' }),
      docHash: 'doc-r5',
      mode: 'EZRAB_AI',
      responder: structuralResponder.responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E8 structural: class is STRUCTURAL', structural.classification.drawingClass, 'STRUCTURAL');
    check('E8 structural: no phantom D12/K1/B1 openings', structural.openings.filter((o) => ['D12', 'K1', 'B1'].includes(o.mark)).length, 0);
    check('E8 structural: D5 stays an opening candidate', structural.openings.some((o) => o.mark === 'D5'), true);
    // I11 Stage 4 (E16): the three marks are element records now, not
    // skips — D12 rebar (diameter from the mark), K1 column, B1 beam.
    // The no-phantom-openings checks above still guard the E8 intent.
    check('E8 structural: three element records', structural.elements.length, 3);
    checkTrue(
      'E8 structural: D12 is a rebar element with diameter 12',
      structural.elements.some((e) => e.mark === 'D12' && e.elementType === 'rebar' && e.diameterMm === 12),
    );
    checkTrue(
      'E8 structural: D12 rebar is NEEDS_REVIEW (diameter only)',
      structural.elements.some((e) => e.mark === 'D12' && e.status === 'NEEDS_REVIEW'),
    );
    checkTrue(
      'E8 structural: K1 is a column element',
      structural.elements.some((e) => e.mark === 'K1' && e.elementType === 'column'),
    );
    checkTrue(
      'E8 structural: B1 is a beam element',
      structural.elements.some((e) => e.mark === 'B1' && e.elementType === 'beam'),
    );
    check(
      'E8 structural: no structural-symbol skips remain',
      structural.skippedProposals.filter((s) => s.reason === 'structural-symbol-no-record-type').length,
      0,
    );
    const floorResponder = makeResponder(() => detections([symbolEntry('K1'), dimEntry('3.500')]));
    const floor = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-r5b',
      mode: 'EZRAB_AI',
      responder: floorResponder.responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E8 gate: K1 on a floor plan stays an opening candidate', floor.openings.some((o) => o.mark === 'K1'), true);
  }
  {
    // E10 — a preposition after the keyword marks a LABEL, not a
    // reference: 'SECTION ON AA' yields no ref. Word section names
    // ('POTONGAN BENDUNGAN') still yield refs — the preposition, not an
    // identifier shape, is the discriminator.
    const { responder } = makeResponder(() =>
      detections([
        { kind: 'text', label: 'label', rawText: 'SECTION ON AA', bbox: { x: 10, y: 10, width: 120, height: 20 }, confidence: 0.9 },
        { kind: 'text', label: 'label', rawText: 'SECTION - A-A', bbox: { x: 10, y: 40, width: 120, height: 20 }, confidence: 0.9 },
        { kind: 'text', label: 'ref', rawText: 'LIHAT POTONGAN BENDUNGAN', bbox: { x: 10, y: 70, width: 180, height: 20 }, confidence: 0.9 },
        { kind: 'text', label: 'ref', rawText: 'DETAIL A', bbox: { x: 10, y: 100, width: 120, height: 20 }, confidence: 0.9 },
        dimEntry('3.500'),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const refs = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-r6',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E10 preposition: exactly two refs (labels yield none)', refs.references.length, 2);
    checkTrue(
      'E10 preposition: no ref to ON (the old bug read "SECTION ON AA" as a ref to ON)',
      !refs.references.some((r) => r.to.ref === 'SECTION ON' || r.to.ref === 'ON'),
    );
    checkTrue(
      'E10 preposition: POTONGAN BENDUNGAN still yields a SECTION ref',
      refs.references.some((r) => r.to.ref === 'POTONGAN BENDUNGAN' && r.kind === 'SECTION'),
    );
    checkTrue(
      'E10 preposition: DETAIL A still yields a DETAIL ref',
      refs.references.some((r) => r.to.ref === 'DETAIL A' && r.kind === 'DETAIL'),
    );
  }
  {
    // E12 — CIVIL pages get the 'full' policy (quantity-bearing class).
    check('E12 policy: CIVIL is full', visionPolicyForClass('CIVIL'), 'full');
  }

  // =======================================================================
  // S. I11 Stage 3 — fix 1 audit (partialRead) + fix 2 focused completion
  // =======================================================================
  {
    // Text-layer gap evidence — pure helpers.
    check('gap evidence: note numbers are not dimension evidence', textLayerEvidencesDimensions('catatan 1. 2. 3. revisi'), false);
    check('gap evidence: bare decimal-dot is dimension evidence', textLayerEvidencesDimensions('ukuran 3.05 lebar'), true);
    check('gap evidence: imperial is dimension evidence', textLayerEvidencesDimensions('tebal 2" HMA'), true);
    check('gap evidence: a year is not dimension evidence', textLayerEvidencesDimensions('tahun 2026 revisi'), false);
    check('gap evidence: lowercase d1 is not a mark', textLayerEvidencesMarks('pintu d1 kayu'), false);
    check('gap evidence: uppercase D1 is a mark', textLayerEvidencesMarks('Pintu D1 kayu'), true);
    check('gap evidence: m2 is not a mark', textLayerEvidencesMarks('luas m2 60'), false);
    check('gap evidence: pipe-joined row is a schedule row', textLayerEvidencesScheduleRows('D1 | Pintu | 900 x 2100'), true);
    check('gap evidence: mark and pair on different lines are not a row', textLayerEvidencesScheduleRows('D1 pintu\n900 x 2100'), false);
    check('focus roiId: whole-page dimensions', focusRoiId('full', 'dimensions'), 'full:focus-dimensions');
    check('focus roiId: tile tables', focusRoiId('roi-0-0-100-100', 'tables'), 'roi-0-0-100-100:focus-tables');
  }
  {
    // Truncation trigger: a survey cut off mid-JSON salvages 1 dim and
    // fires ALL THREE focused passes (the salvaged read is partial in
    // every kind). The focused dimension re-read repeats the salvaged
    // 3.500 — dedupe keeps ONE 3500 mm record. The D1 opening stays
    // UNRESOLVED at page level (its schedule row links in phase 2), so
    // DETAIL still fires once afterwards (FLOOR_PLAN 'full' policy).
    const truncatedSurvey =
      '{"detections": [' +
      '{"kind": "dimension", "label": "wall length", "rawText": "3.500", "bbox": {"x": 100, "y": 100, "width": 200, "height": 40}, "confidence": 0.95},' +
      '{"kind": "text", "label": "note", "rawText": "CUT OFF MID-STR';
    const { responder, calls } = makeResponder((req) => {
      const kind = promptKind(req.prompt);
      if (kind === 'survey') return truncatedSurvey;
      if (kind === 'dimension') {
        // Distinct bboxes: two different dimensions at the SAME bbox
        // with the same label are indistinguishable from tile-overlap
        // duplicates, and dedupeProposals correctly merges them.
        return detections([
          dimEntry('5.000', { bbox: { x: 400, y: 100, width: 200, height: 40 } }),
          dimEntry('3.500'),
        ]);
      }
      if (kind === 'symbol') return detections([symbolEntry('D1')]);
      if (kind === 'table') {
        return detections([
          { kind: 'table', label: 'D1', rawText: 'D1 | Pintu | 900 x 2100', bbox: { x: 50, y: 50, width: 400, height: 30 }, confidence: 0.95 },
        ]);
      }
      return detections([]);
    });
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const cache = new VisionCache<VisionParseResult>({ maxEntries: 10 });
    const page = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-s1',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      cache,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('focus truncation: partialRead true', page.partialRead, true);
    check('focus truncation: all three focused passes ran', page.focusPasses.join(','), 'dimensions,symbols,tables');
    check('focus truncation: 1 survey + 3 focused + 1 detail = 5 calls', calls.length, 5);
    check('focus truncation: salvaged + focused dims = 2 records', page.dimensions.length, 2);
    check(
      'focus truncation: the repeated 3.500 dedupes to one 3500 mm record',
      page.dimensions.filter((d) => d.normalizedValue === 3500).length,
      1,
    );
    checkTrue('focus truncation: focused 5.000 recovered', page.dimensions.some((d) => d.normalizedValue === 5000));
    check('focus truncation: focused table row parsed', page.scheduleEntries.length, 1);
    check('focus truncation: D1 occurrence from the focused symbol pass', page.openings.some((o) => o.mark === 'D1'), true);
    check('focus truncation: DETAIL still fires for the unresolved opening', page.detailPass, true);
    // Second run, same cache: every read (survey + focused + detail) is
    // cached — zero provider calls, same focusPasses recorded.
    const callsBefore = calls.length;
    const page2 = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-s1',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      cache,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('focus truncation: second run costs 0 calls (all cached)', calls.length - callsBefore, 0);
    check('focus truncation: second run still records the focused passes', page2.focusPasses.join(','), 'dimensions,symbols,tables');
    check('focus truncation: second run still partialRead (cached truncated survey)', page2.partialRead, true);
  }
  {
    // Gap trigger (dimensions only): the survey labeled the dimension
    // callouts as `text` (the Kirkland F3a failure) and validated zero
    // dimensions, while the text layer evidences dimensions — ONLY the
    // dimension pass fires. UNKNOWN class → 'survey' policy → no DETAIL.
    const { responder, calls } = makeResponder((req) => {
      const kind = promptKind(req.prompt);
      if (kind === 'survey') {
        return detections([
          { kind: 'text', label: 'callout', rawText: '3.05 LEBAR RUANG', bbox: { x: 10, y: 10, width: 120, height: 20 }, confidence: 0.9 },
          { kind: 'text', label: 'title', rawText: 'CATATAN TEKNIS', bbox: { x: 10, y: 40, width: 120, height: 20 }, confidence: 0.9 },
        ]);
      }
      if (kind === 'dimension') {
        return detections([
          dimEntry('3.05'),
          dimEntry('5.10', { bbox: { x: 400, y: 100, width: 200, height: 40 } }),
        ]);
      }
      return detections([]);
    });
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage({ title: 'CATATAN TEKNIS', text: 'catatan teknis 3.05 5.10 ukuran' }),
      docHash: 'doc-s2',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('focus gap: class is UNKNOWN', page.classification.drawingClass, 'UNKNOWN');
    check('focus gap: only the dimension pass fires', page.focusPasses.join(','), 'dimensions');
    check('focus gap: 1 survey + 1 focused = 2 calls', calls.length, 2);
    check('focus gap: both focused dims recovered', page.dimensions.length, 2);
    check('focus gap: partialRead false (no truncation)', page.partialRead, false);
    check('focus gap: no DETAIL on survey-policy pages', page.detailPass, false);
  }
  {
    // Gap trigger (symbols + tables, NOT dimensions): the survey
    // validated a dimension, so dimensions are NOT re-read — only the
    // missing kinds are. The text layer evidences all three kinds
    // ('900'/'2100' parse as mm), so the selectivity comes from the
    // validated-record check, not from the evidence check.
    const { responder, calls } = makeResponder((req) => {
      const kind = promptKind(req.prompt);
      if (kind === 'survey') return detections([dimEntry('3.500')]);
      if (kind === 'symbol') return detections([symbolEntry('D1')]);
      if (kind === 'table') {
        return detections([
          { kind: 'table', label: 'D1', rawText: 'D1 | Pintu | 900 x 2100', bbox: { x: 50, y: 50, width: 400, height: 30 }, confidence: 0.95 },
        ]);
      }
      return detections([]);
    });
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage({ title: 'JADWAL KUSEN', text: 'D1 | Pintu | 900 x 2100 jadwal kusen pintu jendela' }),
      docHash: 'doc-s3',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('focus selective: only symbols + tables fire', page.focusPasses.join(','), 'symbols,tables');
    check('focus selective: 1 survey + 2 focused + 1 detail = 4 calls', calls.length, 4);
    check('focus selective: the survey dimension is kept', page.dimensions.length, 1);
    check('focus selective: D1 occurrence from the focused symbol pass', page.openings.some((o) => o.mark === 'D1'), true);
    check('focus selective: focused table row parsed', page.scheduleEntries.length, 1);
  }
  {
    // No completion when the survey is complete: the text layer
    // evidences dimensions and marks, but the survey validated records
    // of both — zero focused passes, zero extra calls.
    const { responder, calls } = makeResponder(() =>
      detections([
        dimEntry('3.500'),
        symbolEntry('D1'),
        { kind: 'table', label: 'D1', rawText: 'D1 | Pintu | 900 x 2100', bbox: { x: 50, y: 50, width: 400, height: 30 }, confidence: 0.95 },
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage({ text: 'denah lantai 1 3.500 D1 pintu' }),
      docHash: 'doc-s4',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('focus none: no focused passes on a complete survey', page.focusPasses.length, 0);
    check('focus none: partialRead false', page.partialRead, false);
    // 2 calls = survey + DETAIL (the D1 opening is UNRESOLVED at page
    // level — its same-page schedule row links only in phase 2 — so the
    // pre-existing DETAIL rule fires; no FOCUSED call was spent).
    check('focus none: survey + detail only, no focused call', calls.length, 2);
  }
  {
    // No gap trigger when the survey saw nothing at all: zero proposals
    // means the re-read cannot help (the DETAIL rule's rationale).
    const { responder, calls } = makeResponder(() => detections([]));
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage({ title: 'CATATAN TEKNIS', text: 'catatan teknis 3.05 5.10 ukuran' }),
      docHash: 'doc-s5',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('focus empty-survey: no focused passes on zero proposals', page.focusPasses.length, 0);
    check('focus empty-survey: only the survey call', calls.length, 1);
  }
  {
    // Budget respected: cap 2 with a truncated survey — the survey
    // spends 1, the first focused kind spends 1, the rest are skipped
    // honestly (no call, warning recorded, focusPasses names only the
    // pass that ran).
    const truncatedSurvey =
      '{"detections": [' +
      '{"kind": "dimension", "label": "wall length", "rawText": "3.500", "bbox": {"x": 100, "y": 100, "width": 200, "height": 40}, "confidence": 0.95},' +
      '{"kind": "text", "label": "note", "rawText": "CUT';
    const { responder, calls } = makeResponder((req) => {
      const kind = promptKind(req.prompt);
      if (kind === 'survey') return truncatedSurvey;
      if (kind === 'dimension') {
        return detections([dimEntry('5.000', { bbox: { x: 400, y: 100, width: 200, height: 40 } })]);
      }
      return detections([]);
    });
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-s6',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: 2 },
    });
    check('focus budget: only the dimensions pass fits the cap', page.focusPasses.join(','), 'dimensions');
    check('focus budget: exactly 2 calls spent', calls.length, 2);
    checkTrue('focus budget: the skipped pass is warned', page.warnings.some((w) => w.includes('anggaran panggilan vision habis')));
    checkTrue('focus budget: the focused dim still recovered', page.dimensions.some((d) => d.normalizedValue === 5000));
  }
  {
    // Scanned page truncation: the OCR read truncates mid-JSON (1 span
    // salvaged) and the truncation trigger fires all three focused
    // passes — scanned pages have no text layer, so ONLY truncation
    // can trigger completion there.
    const truncatedOcr =
      '{"spans": [' +
      '{"text": "3.500", "bbox": {"x": 120, "y": 200, "width": 60, "height": 18}, "confidence": 0.9},' +
      '{"text": "TAIL';
    const { responder, calls } = makeResponder((req) => {
      if (req.prompt.includes('TASK — OCR')) return truncatedOcr;
      const kind = promptKind(req.prompt);
      if (kind === 'dimension') return detections([dimEntry('5.000')]);
      if (kind === 'symbol') return detections([symbolEntry('D1')]);
      return detections([]);
    });
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage({ title: undefined, text: '', hasTextLayer: false }),
      docHash: 'doc-s7',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('focus scanned: partialRead true from the truncated OCR read', page.partialRead, true);
    check('focus scanned: all three focused passes ran', page.focusPasses.join(','), 'dimensions,symbols,tables');
    check('focus scanned: the salvaged OCR span became a dimension record', page.dimensions.some((d) => d.normalizedValue === 3500), true);
    check('focus scanned: the focused dim recovered', page.dimensions.some((d) => d.normalizedValue === 5000), true);
    // 1 OCR + 3 focused; no DETAIL (the page re-classifies UNKNOWN from
    // the OCR text, and UNKNOWN maps to 'survey' policy).
    check('focus scanned: 1 OCR + 3 focused = 4 calls', calls.length, 4);
  }

  // =======================================================================
  // T. I11 Stage 4 — F8/F11/E21/F9/F10 + E16/E17 + AHSP quantities
  // =======================================================================
  {
    // F8 — the 90135 live shape: bare letter-only symbols with NO
    // keyword in either field (label = rawText = the bare letter).
    // D/V/MD are documented opening-mark letters and become openings;
    // G (unlisted, semantics unverified) and A (grid axis) stay skipped.
    const { responder } = makeResponder(() =>
      detections([
        symbolEntry('D'),
        symbolEntry('V'),
        symbolEntry('MD'),
        symbolEntry('G'),
        symbolEntry('A'),
        dimEntry('3.500'),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-t1',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    const marks = new Set(page.openings.map((o) => o.mark));
    checkTrue('F8: bare D becomes an opening', marks.has('D'));
    checkTrue('F8: bare V becomes an opening', marks.has('V'));
    checkTrue('F8: bare MD becomes an opening', marks.has('MD'));
    checkTrue('F8: unlisted G stays skipped (not an opening)', !marks.has('G'));
    checkTrue('F8: grid axis A stays skipped (not an opening)', !marks.has('A'));
    checkTrue(
      'F8: G is skipped as not-an-opening',
      page.skippedProposals.some((s) => s.reason === 'symbol-not-an-opening' && s.label === 'G'),
    );
  }
  {
    // F11 — quoted-mark labels (`mark "P1"`) break naive label parsing;
    // the raw text carries the mark. cleanSymbolLabel strips the
    // `mark`/`tanda` prefix + quotes.
    check('F11: cleanSymbolLabel strips mark + quotes', cleanSymbolLabel('mark "P1"'), 'P1');
    check('F11: cleanSymbolLabel strips tanda + colon + quotes', cleanSymbolLabel("tanda: 'J2'"), 'J2');
    check('F11: cleanSymbolLabel strips bare quotes', cleanSymbolLabel('"D1"'), 'D1');
    check('F11: cleanSymbolLabel leaves a plain mark alone', cleanSymbolLabel('D1'), 'D1');
    const { responder } = makeResponder(() =>
      detections([
        { kind: 'symbol', label: 'mark "P1"', rawText: 'P1', bbox: { x: 300, y: 200, width: 60, height: 90 }, confidence: 0.9 },
        { kind: 'symbol', label: "tanda 'J2'", rawText: 'J2', bbox: { x: 500, y: 200, width: 60, height: 90 }, confidence: 0.9 },
        dimEntry('3.500'),
      ]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-t2',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    const marks = new Set(page.openings.map((o) => o.mark));
    checkTrue('F11: quoted P1 flows to an opening', marks.has('P1'));
    checkTrue('F11: quoted J2 flows to an opening', marks.has('J2'));
  }
  {
    // E21 — bare sub-100 integers are dimensions ONLY in a
    // dimension-evident context: (a) a dimension word in the label,
    // (b) adjacency to a parsed dimension. Without evidence the token
    // stays null, and single digits never parse.
    const { responder: responderA } = makeResponder(() =>
      detections([dimEntry('44', { label: 'frame 44' }), dimEntry('3.500')]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const labelEvident = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-t3a',
      mode: 'EZRAB_AI',
      responder: responderA,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    const by44 = labelEvident.dimensions.find((d) => d.normalizedValue === 44);
    check('E21: label-evident 44 → 44 mm', by44?.normalizedValue, 44);
    check('E21: label-evident 44 is NEEDS_REVIEW', by44?.status, 'NEEDS_REVIEW');
    check('E21: label-evident 44 confidence is 0.6', by44?.confidence, 0.6);

    const { responder: responderB } = makeResponder(() =>
      detections([
        dimEntry('792', { bbox: { x: 100, y: 100, width: 200, height: 40 } }),
        dimEntry('44', { bbox: { x: 320, y: 100, width: 60, height: 30 } }),
      ]),
    );
    const adjacent = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-t3b',
      mode: 'EZRAB_AI',
      responder: responderB,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    checkTrue(
      'E21: 44 adjacent to parsed 792 becomes a dimension',
      adjacent.dimensions.some((d) => d.normalizedValue === 44),
    );

    const { responder: responderC } = makeResponder(() =>
      detections([dimEntry('12'), dimEntry('9', { label: 'frame 9' })]),
    );
    const noEvidence = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-t3c',
      mode: 'EZRAB_AI',
      responder: responderC,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('E21: bare 12 with no evidence stays null', noEvidence.dimensions.length, 0);
    checkTrue(
      'E21: bare 12 is skipped as dimension-unparseable',
      noEvidence.skippedProposals.some((s) => s.reason === 'dimension-unparseable' && s.rawText === '12'),
    );
    checkTrue(
      'E21: single digit 9 never parses even with an evident label',
      !noEvidence.dimensions.some((d) => d.normalizedValue === 9),
    );
  }
  {
    // F9/F10 — degenerate-flood detection: ≥6 identical low-confidence
    // proposals in a perfect 2D grid are confabulation; a real 1D
    // dimension chain, a high-confidence grid, and a 5-member group
    // are all safe.
    const grid = (rawText: string, confidence: number, count: number): VisionDetectionProposal[] => {
      const xs = [100, 145, 190];
      const ys = [100, 145];
      const out: VisionDetectionProposal[] = [];
      for (let i = 0; i < count; i += 1) {
        out.push({
          kind: 'dimension',
          label: 'grid value',
          rawText,
          bbox: { x: xs[i % 3], y: ys[Math.floor(i / 3) % 2], width: 20, height: 15 },
          confidence,
        });
      }
      return out;
    };
    check('F10: 6 identical conf-0.6 grid values are a flood', detectDegenerateFlood(grid('0.91', 0.6, 6)).size, 6);
    check('F10: 5 identical grid values are not a flood', detectDegenerateFlood(grid('0.91', 0.6, 5)).size, 0);
    check('F10: a conf-0.9 grid is not a flood', detectDegenerateFlood(grid('0.91', 0.9, 6)).size, 0);
    const chain: VisionDetectionProposal[] = [0, 1, 2, 3, 4, 5].map((i) => ({
      kind: 'dimension',
      label: 'chain segment',
      rawText: '3.05',
      bbox: { x: 100 + i * 45, y: 100, width: 20, height: 15 },
      confidence: 0.6,
    }));
    check('F10: a real 1D dimension chain is not a flood', detectDegenerateFlood(chain).size, 0);

    // End-to-end: the flood is skipped, the real dimension survives.
    const { responder } = makeResponder(() =>
      detections([...grid('0.91', 0.6, 6), dimEntry('3.500', { normalizedValue: 3500 })]),
    );
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const page = await runVisionPage({
      ...floorPlanPage(),
      docHash: 'doc-t4',
      mode: 'EZRAB_AI',
      responder,
      renderPage,
      budget: { used: 0, max: DEFAULT_MAX_VISION_CALLS_PER_DOCUMENT },
    });
    check('F10 e2e: flood values produce no dimension records', page.dimensions.filter((d) => d.normalizedValue === 910).length, 0);
    checkTrue('F10 e2e: the real 3.500 survives', page.dimensions.some((d) => d.normalizedValue === 3500));
    check(
      'F10 e2e: all six flood proposals skipped as degenerate-grid-confabulation',
      page.skippedProposals.filter((s) => s.reason === 'degenerate-grid-confabulation').length,
      6,
    );
  }
  {
    // E16/E17 — a wall object becomes a WALL record with a net-area
    // quantity: 7.000 × 3.500 gross 24.5 m² minus the linked D1
    // (0.9 × 2.1 = 1.89 m²) = 22.61 m² net, plus a COUNT of 1.
    // Doc-level (runVisionDocument): same-page vision table rows link
    // in phase 2 by pre-existing I8 design — at PAGE time the D1 is
    // still unlinked, so the page-time quantity is the gross area
    // with an "upper bound" assumption; the doc-level recompute (phase
    // 2) deducts the re-linked opening. The doc result is what the
    // live services surface.
    const wallDetections = () => detections([
      { kind: 'object', label: 'DINDING LUAR', rawText: 'Dinding luar 7.000 x 3.500', bbox: { x: 100, y: 100, width: 400, height: 40 }, confidence: 0.9 },
      symbolEntry('D1'),
      { kind: 'table', label: 'D1', rawText: 'D1 | Pintu | 900 x 2100', bbox: { x: 50, y: 50, width: 400, height: 30 }, confidence: 0.95 },
      dimEntry('3.500'),
    ]);
    const { responder } = makeResponder(wallDetections);
    const { renderPage } = makeRenderPage({ 1: { w: 1000, h: 800, b64: 1000 } });
    const doc = await runVisionDocument({
      docHash: 'doc-t5',
      mode: 'EZRAB_AI',
      pages: [floorPlanPage()],
      responder,
      renderPage,
    });
    const page = doc.pages[0];
    const wall = page.elements.find((e) => e.category === 'WALL');
    check('E16: wall object becomes a WALL record', wall?.elementType, 'wall');
    check('E16: wall length 7000 mm', wall?.lengthMm, 7000);
    check('E16: wall height 3500 mm', wall?.heightMm, 3500);
    check('E16: dimensioned-unlinked wall is NEEDS_REVIEW', wall?.status, 'NEEDS_REVIEW');
    checkTrue('E16: D1 links in phase 2 (900×2100)', page.openings.some((o) => o.mark === 'D1' && o.widthMm === 900 && o.heightMm === 2100));
    const wallArea = page.quantities.find((q) => q.id.startsWith('qto-el-') && q.kind === 'AREA');
    check('E17: wall net area is 22.61 m²', wallArea?.quantity, 22.61);
    check('E17: wall net area unit is m2', wallArea?.unit, 'm2');
    checkTrue(
      'E17: wall net area formula shows the D1 deduction',
      (wallArea?.formula ?? '').includes('0.900 × 2.100'),
    );
    check('E17: wall net area inputs carry the total deduction', wallArea?.inputs.total_bukaan_m2, 1.89);
    const wallCount = page.quantities.find((q) => q.id.startsWith('qto-el-') && q.kind === 'COUNT');
    check('E17: wall COUNT is 1', wallCount?.quantity, 1);

    // AHSP: the wall AREA is matchable, the wall COUNT is not. The
    // matcher sees the opening + the area (twice each: page time and
    // the phase-2 re-evaluation — pre-existing I8 design).
    const seen: Array<{ key: string; name: string; unit: string }> = [];
    const recordingMatcher = (input: { key: string; name: string; unit: string }) => {
      seen.push(input);
      return { ahspCode: `AHSP-${input.key}` };
    };
    const { responder: responder2 } = makeResponder(wallDetections);
    const enriched = await runVisionDocument({
      docHash: 'doc-t6',
      mode: 'EZRAB_AI',
      pages: [floorPlanPage()],
      responder: responder2,
      renderPage,
      ahspMatcher: recordingMatcher,
    });
    checkTrue(
      'AHSP quantities: wall area matched as Dinding per m2',
      seen.some((i) => i.name === 'Dinding' && i.unit === 'm2'),
    );
    checkTrue(
      'AHSP quantities: wall COUNT never reaches the matcher',
      !seen.some((i) => i.name === 'Dinding' && i.unit === 'buah'),
    );
    checkTrue(
      'AHSP quantities: a quantity match record is carried',
      enriched.pages[0].ahsp.matches.some((m) => m.recordKind === 'quantity' && m.ahspCode !== null),
    );

    // C3 still holds with quantities present: FULL_AI never calls it.
    const { responder: responder3 } = makeResponder(wallDetections);
    let fullAiCalls = 0;
    const fullAi = await runVisionDocument({
      docHash: 'doc-t7',
      mode: 'FULL_AI',
      pages: [floorPlanPage()],
      responder: responder3,
      renderPage,
      ahspMatcher: () => {
        fullAiCalls += 1;
        return { ahspCode: 'AHSP-NEVER' };
      },
    });
    check('C3 quantities: FULL_AI matcher call count is 0', fullAiCalls, 0);
    check('C3 quantities: FULL_AI carries no matches', fullAi.pages[0].ahsp.matches.length, 0);
  }

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

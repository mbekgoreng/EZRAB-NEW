/**
 * DED drawing-vision — SYNTHETIC demo data for the I7 visual review
 * viewer (increment I11 Stage 1, owner order 2026-11-22 16:32).
 *
 * ------------------------------------------------------------------
 * DEMO-ONLY, TEST HARNESS — NOT PRODUCTION DATA
 * ------------------------------------------------------------------
 * This module exists ONLY so the I7 split-view viewer can be rendered
 * and exercised in a real browser without a live vision run (vision
 * is stub-first; visionEnabled defaults false; there is no live data).
 * Every value here is hand-built synthetic demo content, labelled
 * "DEMO" wherever it can appear on screen. Nothing here is a real
 * measurement, a real price, or a real drawing.
 *
 * GATING: the demo is injected ONLY when the URL carries
 * `?dedvr-demo=1` (see `isDedVisionReviewDemoRequested`). Without that
 * query param this module is inert — no component reads it, no state
 * changes, no production behaviour is affected. The hook call sites
 * are: `view.tsx` (mounts the demo result) and `DedAiResultView.tsx`
 * (appends the demo vision-only review items).
 *
 * WHAT THE DEMO CONTAINS (designed to exercise every viewer check):
 * - 3 pages: page 1 + 2 carry synthetic SVG plan images (1200x1600);
 *   page 3 deliberately has NO image (honest empty-state check).
 * - 6 live items (DedAiItem[]) with sourcePages + visionEvidence
 *   bboxes that match the drawn features pixel-for-pixel, so marker
 *   positions can be measured against the image:
 *     1. Pintu D1      (p1, conf heuristic 0.90 -> GREEN marker)
 *     2. Jendela W1    (p1, AI_INFERENCE 0.55 -> RED marker)
 *     3. Dinding bata  (p1, ASSUMPTION 0.50 -> RED marker + pending
 *                        assumption for the approve/reject check)
 *     4. Kolom K1      (p2, DERIVED 0.90 -> GREEN marker, cross-page)
 *     5. Atap          (p3, quantity null -> UNRESOLVED, page-only
 *                        jump, confirm must be refused: no value)
 *     6. Plesteran     (p1, DED_GEOMETRIC 0.90, NO visionEvidence ->
 *                        page-only jump, NO marker: no fake position)
 * - 1 vision-only review item (no live row): a dimension "3.500" on
 *   page 2 with measured confidence 0.72 -> the YELLOW marker band.
 *   Live items can NEVER be yellow: the provenance heuristic in
 *   reviewState.ts only emits {0, 0.5, 0.55, 0.9, 0.95}, so the
 *   0.6-0.85 yellow band is reachable only via vision-only items.
 *   The viewer renders both kinds through the same code path.
 *
 * REMOVAL: deleting this file + the two gated call sites removes the
 * demo entirely. It must never be wired to a real run.
 */

import type { DedAiItem, DedAiOutput } from './types';
import type { DedRunSnapshot } from './dedRunStore';
import type { ReviewItem } from '../ded-vision/reviewState';
import type { VisionItemEvidence } from '../ded-vision/visionPipeline';

/** Query param that arms the demo (`?dedvr-demo=1`). No param = inert. */
export const DEDVR_DEMO_QUERY_PARAM = 'dedvr-demo';

/** True only when the current URL explicitly requests the demo. */
export function isDedVisionReviewDemoRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get(DEDVR_DEMO_QUERY_PARAM) === '1';
  } catch {
    return false;
  }
}

/** Synthetic page image size (px). Bboxes below are in this space. */
export const DEDVR_DEMO_IMAGE_WIDTH = 1200;
export const DEDVR_DEMO_IMAGE_HEIGHT = 1600;

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Page 1 — synthetic floor plan ("Denah Lt.1"). Drawn features match
 * the demo bboxes exactly:
 *   D1 door band     x=120  y=160  w=240 h=320
 *   W1 window band   x=600  y=240  w=360 h=200
 *   Dinding band     x=120  y=900  w=960 h=120
 */
function demoPage1Svg(): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${DEDVR_DEMO_IMAGE_WIDTH}" height="${DEDVR_DEMO_IMAGE_HEIGHT}" viewBox="0 0 1200 1600">`,
    '<rect width="1200" height="1600" fill="#ffffff"/>',
    '<rect x="40" y="40" width="1120" height="1520" fill="none" stroke="#0f172a" stroke-width="3"/>',
    '<text x="100" y="110" font-family="sans-serif" font-size="44" font-weight="700" fill="#0f172a">DENAH LT.1 — DEMO (data sintetis)</text>',
    '<text x="100" y="1560" font-family="sans-serif" font-size="24" fill="#64748b">Halaman 1 dari 3 — gambar sintetis untuk uji visual I7, bukan denah asli.</text>',
    // Outer walls
    '<rect x="100" y="140" width="1000" height="1260" fill="none" stroke="#0f172a" stroke-width="10"/>',
    // Room divisions
    '<line x1="600" y1="140" x2="600" y2="900" stroke="#0f172a" stroke-width="6"/>',
    '<line x1="100" y1="700" x2="600" y2="700" stroke="#0f172a" stroke-width="6"/>',
    '<line x1="600" y1="1060" x2="1100" y2="1060" stroke="#0f172a" stroke-width="6"/>',
    // D1 door band (bbox 120,160,240,320)
    '<rect x="120" y="160" width="240" height="320" fill="#dbeafe" stroke="#2563eb" stroke-width="4"/>',
    '<path d="M 120 480 A 320 320 0 0 1 360 160" fill="none" stroke="#2563eb" stroke-width="3" stroke-dasharray="10 8"/>',
    '<line x1="120" y1="480" x2="360" y2="480" stroke="#2563eb" stroke-width="4"/>',
    '<text x="150" y="330" font-family="sans-serif" font-size="40" font-weight="700" fill="#1d4ed8">D1</text>',
    '<text x="150" y="380" font-family="sans-serif" font-size="22" fill="#1d4ed8">90 x 210</text>',
    // W1 window band (bbox 600,240,360,200)
    '<rect x="600" y="240" width="360" height="200" fill="#fef3c7" stroke="#d97706" stroke-width="4"/>',
    '<line x1="600" y1="340" x2="960" y2="340" stroke="#d97706" stroke-width="3"/>',
    '<line x1="780" y1="240" x2="780" y2="440" stroke="#d97706" stroke-width="3"/>',
    '<text x="630" y="300" font-family="sans-serif" font-size="40" font-weight="700" fill="#92400e">W1</text>',
    '<text x="630" y="420" font-family="sans-serif" font-size="22" fill="#92400e">120 x 120</text>',
    // Dinding band (bbox 120,900,960,120)
    '<rect x="120" y="900" width="960" height="120" fill="#fee2e2" stroke="#b91c1c" stroke-width="4"/>',
    '<line x1="120" y1="960" x2="1080" y2="960" stroke="#b91c1c" stroke-width="2" stroke-dasharray="14 10"/>',
    '<text x="150" y="975" font-family="sans-serif" font-size="36" font-weight="700" fill="#991b1b">DINDING BATA 1/2</text>',
    // Room labels
    '<text x="700" y="800" font-family="sans-serif" font-size="32" fill="#475569">RUANG TAMU</text>',
    '<text x="150" y="800" font-family="sans-serif" font-size="32" fill="#475569">KAMAR 1</text>',
    '<text x="700" y="1250" font-family="sans-serif" font-size="32" fill="#475569">DAPUR</text>',
    '<text x="150" y="1250" font-family="sans-serif" font-size="32" fill="#475569">KAMAR 2</text>',
    '</svg>',
  ].join('');
}

/**
 * Page 2 — synthetic upper floor ("Denah Lt.2"). Drawn features match
 * the demo bboxes exactly:
 *   Dimensi 3.500    x=120  y=120  w=600 h=60
 *   K1 column        x=480  y=640  w=240 h=240
 */
function demoPage2Svg(): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${DEDVR_DEMO_IMAGE_WIDTH}" height="${DEDVR_DEMO_IMAGE_HEIGHT}" viewBox="0 0 1200 1600">`,
    '<rect width="1200" height="1600" fill="#ffffff"/>',
    '<rect x="40" y="40" width="1120" height="1520" fill="none" stroke="#0f172a" stroke-width="3"/>',
    '<text x="100" y="110" font-family="sans-serif" font-size="44" font-weight="700" fill="#0f172a">DENAH LT.2 — DEMO (data sintetis)</text>',
    '<text x="100" y="1560" font-family="sans-serif" font-size="24" fill="#64748b">Halaman 2 dari 3 — gambar sintetis untuk uji visual I7, bukan denah asli.</text>',
    // Dimension line 3.500 (bbox 120,120,600,60)
    '<rect x="120" y="120" width="600" height="60" fill="#fef9c3" stroke="#ca8a04" stroke-width="3"/>',
    '<line x1="130" y1="150" x2="710" y2="150" stroke="#0f172a" stroke-width="2"/>',
    '<line x1="130" y1="138" x2="130" y2="162" stroke="#0f172a" stroke-width="2"/>',
    '<line x1="710" y1="138" x2="710" y2="162" stroke="#0f172a" stroke-width="2"/>',
    '<text x="360" y="145" font-family="sans-serif" font-size="26" font-weight="700" fill="#0f172a">3.500</text>',
    // Outer walls
    '<rect x="100" y="240" width="1000" height="1160" fill="none" stroke="#0f172a" stroke-width="10"/>',
    '<line x1="600" y1="240" x2="600" y2="900" stroke="#0f172a" stroke-width="6"/>',
    '<line x1="100" y1="900" x2="1100" y2="900" stroke="#0f172a" stroke-width="6"/>',
    // K1 column (bbox 480,640,240,240)
    '<rect x="480" y="640" width="240" height="240" fill="#dcfce7" stroke="#15803d" stroke-width="4"/>',
    '<circle cx="600" cy="760" r="70" fill="none" stroke="#15803d" stroke-width="3"/>',
    '<text x="545" y="750" font-family="sans-serif" font-size="40" font-weight="700" fill="#166534">K1</text>',
    '<text x="520" y="800" font-family="sans-serif" font-size="22" fill="#166534">15 / 30</text>',
    // Room labels
    '<text x="150" y="500" font-family="sans-serif" font-size="32" fill="#475569">KAMAR 3</text>',
    '<text x="700" y="500" font-family="sans-serif" font-size="32" fill="#475569">KAMAR 4</text>',
    '<text x="150" y="1200" font-family="sans-serif" font-size="32" fill="#475569">RUANG KELUARGA</text>',
    '</svg>',
  ].join('');
}

/** Page images: pages 1-2 only. Page 3 has NO image by design. */
export function buildDemoPageImages(): Array<{ page: number; dataUrl: string }> {
  return [
    { page: 1, dataUrl: svgDataUrl(demoPage1Svg()) },
    { page: 2, dataUrl: svgDataUrl(demoPage2Svg()) },
  ];
}

function ev(
  page: number,
  bbox: { x: number; y: number; width: number; height: number },
  label: string,
  kind: VisionItemEvidence['kind'],
  confidence: number,
  status: VisionItemEvidence['status'],
): VisionItemEvidence {
  return { page, bbox, label, kind, confidence, status };
}

export function buildDemoDedAiItems(): DedAiItem[] {
  return [
    {
      id: 'demo-pintu-d1',
      name: 'Pintu D1 — 90×210 cm (DEMO)',
      category: 'Pekerjaan Pintu & Jendela',
      units: 'unit',
      quantity: 3,
      quantitySource: 'DERIVED',
      quantityFormula: '3 unit (denah: D1 ×3)',
      rawDimensions: 'D1 90×210',
      unitPrice: null,
      priceSource: 'UNRESOLVED',
      subtotal: null,
      sourcePages: [1],
      sourceEvidence: 'Denah Lt.1 — simbol D1 (demo)',
      visionEvidence: [
        ev(1, { x: 120, y: 160, width: 240, height: 320 }, 'D1', 'symbol', 0.92, 'HIGH_CONFIDENCE'),
      ],
      provenance: ['dedvr-demo'],
      stage: 'CALCULATED',
    },
    {
      id: 'demo-jendela-w1',
      name: 'Jendela W1 — 120×120 cm (DEMO)',
      category: 'Pekerjaan Pintu & Jendela',
      units: 'unit',
      quantity: 4,
      quantitySource: 'AI_INFERENCE',
      quantityFormula: '4 unit (inferensi: W1 ×4)',
      rawDimensions: 'W1 120×120',
      unitPrice: null,
      priceSource: 'UNRESOLVED',
      subtotal: null,
      sourcePages: [1],
      sourceEvidence: 'Denah Lt.1 — simbol W1 (demo)',
      visionEvidence: [
        ev(1, { x: 600, y: 240, width: 360, height: 200 }, 'W1', 'symbol', 0.72, 'NEEDS_REVIEW'),
      ],
      provenance: ['dedvr-demo'],
      stage: 'CALCULATED',
    },
    {
      id: 'demo-dinding',
      name: 'Dinding bata merah 1/2 bata (DEMO)',
      category: 'Pekerjaan Dinding',
      units: 'm2',
      quantity: 42.5,
      quantitySource: 'ASSUMPTION',
      quantityFormula: '12,14 m × 3,5 m',
      quantityNote: 'Tinggi dinding diasumsikan 3,5 m (tidak terbaca di denah).',
      rawDimensions: '12,14 m × 3,5 m',
      unitPrice: null,
      priceSource: 'UNRESOLVED',
      subtotal: null,
      sourcePages: [1],
      sourceEvidence: 'Denah Lt.1 — dinding (demo)',
      visionEvidence: [
        ev(1, { x: 120, y: 900, width: 960, height: 120 }, 'Dinding', 'object', 0.45, 'NEEDS_REVIEW'),
      ],
      provenance: ['dedvr-demo'],
      stage: 'CALCULATED',
    },
    {
      id: 'demo-kolom-k1',
      name: 'Kolom K1 15/30 (DEMO)',
      category: 'Pekerjaan Struktur',
      units: 'm3',
      quantity: 0.54,
      quantitySource: 'DERIVED',
      quantityFormula: '4 × 0,15 × 0,30 × 3,0',
      rawDimensions: 'K1 15/30, h 3,0 m, 4 bh',
      unitPrice: null,
      priceSource: 'UNRESOLVED',
      subtotal: null,
      sourcePages: [2],
      sourceEvidence: 'Denah Lt.2 — kolom K1 (demo)',
      visionEvidence: [
        ev(2, { x: 480, y: 640, width: 240, height: 240 }, 'K1', 'symbol', 0.95, 'HIGH_CONFIDENCE'),
      ],
      provenance: ['dedvr-demo'],
      stage: 'CALCULATED',
    },
    {
      id: 'demo-atap',
      name: 'Atap — rangka + penutup (DEMO)',
      category: 'Pekerjaan Atap',
      units: 'm2',
      quantity: null,
      quantitySource: 'UNRESOLVED',
      quantityNote: 'Detail atap tidak terbaca — perlu input manual.',
      unitPrice: null,
      priceSource: 'UNRESOLVED',
      subtotal: null,
      sourcePages: [3],
      sourceEvidence: 'Potongan A-A — atap tidak terbaca (demo)',
      provenance: ['dedvr-demo'],
      stage: 'QUANTITY',
    },
    {
      id: 'demo-plester',
      name: 'Plesteran dinding (DEMO)',
      category: 'Pekerjaan Dinding',
      units: 'm2',
      quantity: 85,
      quantitySource: 'DED_GEOMETRIC',
      quantityFormula: '2 × 42,5 m²',
      rawDimensions: '2 sisi × 42,5 m²',
      unitPrice: null,
      priceSource: 'UNRESOLVED',
      subtotal: null,
      sourcePages: [1],
      sourceEvidence: 'Denah Lt.1 — plester 2 sisi (demo)',
      // NO visionEvidence by design: page-only jump, no marker.
      provenance: ['dedvr-demo'],
      stage: 'CALCULATED',
    },
  ];
}

export function buildDemoDedAiOutput(): DedAiOutput {
  const items = buildDemoDedAiItems();
  return {
    success: true,
    jobId: 'dedvr-demo-1',
    projectType: 'BANGUNAN',
    mode: 'FAST',
    policy: 'DATABASE',
    projectName: 'DEMO — Denah Rumah 60 m² (data sintetis)',
    fileName: 'demo-denah-sintetis.pdf',
    pageCount: 3,
    items,
    grandTotal: 0,
    categorySummaries: [],
    coverage: {
      totalItems: items.length,
      itemsWithQuantity: 5,
      itemsWithPrice: 0,
      itemsFullyResolved: 0,
      itemsUnresolved: 1,
      itemsWithAssumption: 1,
    },
    analysisTrace: {
      totalPages: 3,
      selectedPageCount: 3,
      skippedPageCount: 0,
      totalCharsBudget: 0,
      totalCharsSent: 0,
      pages: [
        { page: 1, title: 'Denah Lt.1', pageType: 'FLOOR_PLAN', totalChars: 0, sentChars: 0, status: 'SENT' },
        { page: 2, title: 'Denah Lt.2', pageType: 'FLOOR_PLAN', totalChars: 0, sentChars: 0, status: 'SENT' },
        { page: 3, title: 'Potongan A-A', pageType: 'SECTION', totalChars: 0, sentChars: 0, status: 'SENT' },
      ],
      passes: [],
      warnings: ['Data demo sintetis (I11 Stage 1) — bukan hasil analisis dokumen nyata.'],
    },
    pageImages: buildDemoPageImages(),
  };
}

/**
 * Vision-only review items (no live row) for the demo. The live view
 * builds its review list from output.items only, so this is the ONLY
 * way the yellow confidence band (0.6-0.85) can appear on screen:
 * the live provenance heuristic never emits a yellow confidence.
 * Appended demo-gated in DedAiResultView; reconcile leaves vision-only
 * items untouched by design.
 */
export function buildDemoVisionReviewItems(): ReviewItem[] {
  return [
    {
      id: 'dim-demo-3500',
      kind: 'dimension',
      label: '3.500',
      page: 2,
      sourcePages: [2],
      bbox: { x: 120, y: 120, width: 600, height: 60 },
      originalText: '3.500',
      interpretation: { value: 3500, unit: 'mm', detail: 'LINEAR' },
      formula: null,
      inputs: {},
      sourceKind: 'LINEAR',
      confidence: 0.72,
      status: 'NEEDS_REVIEW',
      assumptions: [],
      evidence: [],
      notes: ['Demo sintetis (I11 Stage 1) — item vision-only, tanpa baris live.'],
    },
  ];
}

/** Full run snapshot for the demo result screen (in-memory store only). */
export function demoDedRunSnapshot(): Omit<DedRunSnapshot, 'runId' | 'updatedAt'> {
  const now = Date.now();
  return {
    status: 'done',
    screen: 'result',
    session: null,
    runMode: 'EZRAB_AI',
    stages: [],
    percent: 100,
    statusLine: 'Demo tinjau visual (data sintetis)',
    summary: {
      projectName: 'DEMO — Denah Rumah 60 m² (data sintetis)',
      fileCount: 1,
      totalSize: 0,
      mode: 'FAST',
      startedAt: now,
    },
    error: null,
    result: buildDemoDedAiOutput(),
    fullAiOutput: null,
    resultReady: true,
    draftSaved: false,
    finalized: false,
    startedAt: now,
  };
}

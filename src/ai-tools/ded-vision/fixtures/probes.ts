/**
 * DED drawing-vision benchmark — direct-module probe fixtures (I10a).
 *
 * Hand-verified ground truth for the PURE deterministic layers, measured
 * WITHOUT the pipeline: classification (I1), dimensions (I2), openings
 * (I3), QTO (I4), references (I5), scale (I6), OCR parsing/routing (I9),
 * review-state bboxes (I7). Every expected value was computed or verified
 * BY HAND — never copied from a module under test.
 *
 * The pipeline-level fixtures (whole documents) live in the sibling
 * family modules (house.ts, building.ts, …); the harness runs both.
 */

import type { BoundingBox } from '../types';
import type {
  CrossSheetReference,
  DimensionKind,
  DimensionUnit,
  DrawingPageClass,
  GeometryQuantity,
  ReferenceStatus,
} from '../types';
import type { ClaimedValue, KnownTarget } from '../references';
import type { OpeningOccurrence, PlanOpeningDimensions } from '../openings';
import type { OcrParseContext, OcrTextSpan } from '../visionOcr';
import type { VisionReviewStatus } from '../types';

// ---------------------------------------------------------------------------
// I1 — classification probes
// ---------------------------------------------------------------------------

export interface ClassificationProbe {
  name: string;
  title?: string;
  text?: string;
  hasTextLayer: boolean;
  expected: DrawingPageClass;
}

export const CLASSIFICATION_PROBES: ClassificationProbe[] = [
  { name: 'cover-sampul', title: 'SAMPUL', text: 'gambar kerja rumah tinggal 1 lantai', hasTextLayer: true, expected: 'COVER' },
  { name: 'cover-daftar-gambar', title: 'DAFTAR GAMBAR', text: 'daftar gambar a-101 denah', hasTextLayer: true, expected: 'COVER' },
  { name: 'site-denah-situasi', title: 'DENAH SITUASI', text: 'denah situasi batas tanah gsb jalan', hasTextLayer: true, expected: 'SITE_PLAN' },
  { name: 'floor-denah-lantai-1', title: 'DENAH LANTAI 1', text: 'denah lantai 1 ruang tamu kamar tidur', hasTextLayer: true, expected: 'FLOOR_PLAN' },
  { name: 'floor-body-only', text: 'denah lantai 1 ruang tamu dapur', hasTextLayer: true, expected: 'FLOOR_PLAN' },
  { name: 'elevation-tampak-depan', title: 'TAMPAK DEPAN', text: 'tampak depan fasad genteng', hasTextLayer: true, expected: 'ELEVATION' },
  { name: 'section-potongan-aa', title: 'POTONGAN A-A', text: 'potongan a-a penampang atap', hasTextLayer: true, expected: 'SECTION' },
  { name: 'structural-denah-struktur', title: 'DENAH STRUKTUR LANTAI 1', text: 'denah struktur kolom balok pelat', hasTextLayer: true, expected: 'STRUCTURAL' },
  { name: 'foundation-denah-pondasi', title: 'DENAH PONDASI', text: 'denah pondasi footplat tiang pancang', hasTextLayer: true, expected: 'FOUNDATION' },
  { name: 'roof-denah-atap', title: 'DENAH ATAP', text: 'denah atap rangka kuda kuda genteng', hasTextLayer: true, expected: 'ROOF_PLAN' },
  { name: 'schedule-jadwal-kusen', title: 'JADWAL KUSEN', text: 'jadwal kusen pintu jendela daun pintu', hasTextLayer: true, expected: 'DOOR_WINDOW_SCHEDULE' },
  { name: 'schedule-jadwal-pembesian', title: 'JADWAL PEMBESIAN', text: 'jadwal pembesian kolom balok tulangan', hasTextLayer: true, expected: 'STRUCTURAL_SCHEDULE' },
  { name: 'schedule-jadwal-kolom', title: 'JADWAL KOLOM', text: 'jadwal kolom k1 k2 pembesian', hasTextLayer: true, expected: 'STRUCTURAL_SCHEDULE' },
  { name: 'mep-instalasi-listrik', title: 'DENAH INSTALASI LISTRIK', text: 'denah instalasi listrik penerangan stop kontak', hasTextLayer: true, expected: 'MEP' },
  { name: 'detail-a', title: 'DETAIL A', text: 'detail a sambungan kusen', hasTextLayer: true, expected: 'DETAIL' },
  { name: 'legend-catatan-umum', title: 'CATATAN UMUM', text: 'catatan umum spesifikasi simbol notasi', hasTextLayer: true, expected: 'LEGEND_SPEC' },
  // Negatives / traps: bare "jadwal" is a work schedule, not a drawing
  // schedule; "site" inside "arsitektur" is not a site-plan signal.
  { name: 'unknown-jadwal-kerja', title: 'JADWAL KERJA PROYEK', text: 'jadwal kerja minggu 1 2 3 progres', hasTextLayer: true, expected: 'UNKNOWN' },
  { name: 'unknown-empty', hasTextLayer: true, expected: 'UNKNOWN' },
  { name: 'unknown-scanned-no-title', hasTextLayer: false, expected: 'UNKNOWN' },
  { name: 'unknown-arsitektur-trap', title: 'ARSITEKTUR', text: 'gambar arsitektur rumah', hasTextLayer: true, expected: 'UNKNOWN' },
  // Scanned page: native text is untrusted and ignored; the title still counts.
  { name: 'section-scanned-title-only', title: 'POTONGAN B-B', text: 'denah lantai 1 ruang tamu', hasTextLayer: false, expected: 'SECTION' },
];

// ---------------------------------------------------------------------------
// I2 — dimension probes
// ---------------------------------------------------------------------------

export interface DimensionTokenProbe {
  name: string;
  text: string;
  /** Null = must NOT parse as a dimension. */
  expected: { value: number; unit: DimensionUnit; kind: DimensionKind } | null;
}

export const DIMENSION_TOKEN_PROBES: DimensionTokenProbe[] = [
  // Positives — Indonesian notation, hand-verified.
  { name: 'thousands-3500', text: '3.500', expected: { value: 3500, unit: 'mm', kind: 'LINEAR' } },
  { name: 'bare-3500', text: '3500', expected: { value: 3500, unit: 'mm', kind: 'LINEAR' } },
  { name: 'thousands-12500', text: '12.500', expected: { value: 12500, unit: 'mm', kind: 'LINEAR' } },
  { name: 'decimal-comma-m', text: '3,50 m', expected: { value: 3.5, unit: 'm', kind: 'LINEAR' } },
  { name: 'explicit-mm', text: '3500 mm', expected: { value: 3500, unit: 'mm', kind: 'LINEAR' } },
  { name: 'explicit-cm', text: '250 cm', expected: { value: 250, unit: 'cm', kind: 'LINEAR' } },
  { name: 'small-with-unit', text: '12 mm', expected: { value: 12, unit: 'mm', kind: 'LINEAR' } },
  { name: 'thousands-decimal', text: '3.500,50', expected: { value: 3500.5, unit: 'mm', kind: 'LINEAR' } },
  { name: 'decimal-dot-with-unit', text: '3.5 m', expected: { value: 3.5, unit: 'm', kind: 'LINEAR' } },
  { name: 'elev-plus', text: '+3.500', expected: { value: 3500, unit: 'mm', kind: 'ELEVATION' } },
  { name: 'elev-minus', text: '-1.500', expected: { value: -1500, unit: 'mm', kind: 'ELEVATION' } },
  { name: 'elev-plusminus-zero', text: '±0.000', expected: { value: 0, unit: 'mm', kind: 'ELEVATION' } },
  { name: 'elev-el-prefix', text: 'EL +3.500', expected: { value: 3500, unit: 'mm', kind: 'ELEVATION' } },
  { name: 'level-prefix', text: 'LEVEL +1.200', expected: { value: 1200, unit: 'mm', kind: 'LEVEL' } },
  { name: 'level-peil', text: 'PEIL ±0.000', expected: { value: 0, unit: 'mm', kind: 'LEVEL' } },
  { name: 'diameter-symbol', text: 'Ø12', expected: { value: 12, unit: 'mm', kind: 'DIAMETER' } },
  { name: 'diameter-d12', text: 'D12', expected: { value: 12, unit: 'mm', kind: 'DIAMETER' } },
  { name: 'diameter-d16', text: 'D16', expected: { value: 16, unit: 'mm', kind: 'DIAMETER' } },
  { name: 'radius-r500', text: 'R500', expected: { value: 500, unit: 'mm', kind: 'RADIUS' } },
  { name: 'angle-45', text: '45°', expected: { value: 45, unit: 'deg', kind: 'ANGLE' } },
  // I10b E1 PIN UPDATE — the old probe ("bare-year-2026-parses",
  // expected 2026 mm) encoded the bug: the year guard lived ONLY in the
  // OCR routing layer, so the survey path parsed years as dimensions
  // (guard dim-negatives-zero-fp failed). The guard is now shared: it
  // lives in parseDimensionToken, so 2026 parses NOWHERE. The probe is
  // renamed + moved to the negatives below (neg-year-2026); the
  // mod-10 exception (round years 2000/2100 still parse as mm) is
  // pinned by the dimensions suite, not here.
  // (See 'neg-year-2026' below.)
  // Negatives — identifiers / ambiguous fragments must NEVER parse.
  { name: 'neg-grid-a1', text: 'A-1', expected: null },
  { name: 'neg-grid-b3', text: 'B/3', expected: null },
  { name: 'neg-detail-det3', text: 'DET-3', expected: null },
  { name: 'neg-drawing-a101', text: 'A-101', expected: null },
  { name: 'neg-section-aa', text: 'A-A', expected: null },
  { name: 'neg-section-11', text: '1-1', expected: null },
  { name: 'neg-scale', text: '1:100', expected: null },
  { name: 'neg-bare-12', text: '12', expected: null },
  { name: 'neg-bare-45', text: '45', expected: null },
  { name: 'neg-bare-decimal', text: '3,5', expected: null },
  // I10b E1 — a bare year (1900–2100, not a multiple of 10) is a year,
  // never a dimension. See the PIN UPDATE note above.
  { name: 'neg-year-2026', text: '2026', expected: null },
  { name: 'neg-mark-d1', text: 'D1', expected: null },
  { name: 'neg-mark-d5', text: 'D5', expected: null },
  { name: 'neg-rebar-spacing', text: 'D12-150', expected: null },
  { name: 'neg-thousands-m-implausible', text: '3.500 m', expected: null },
  { name: 'neg-diameter-garbage', text: 'Øx', expected: null },
  { name: 'neg-empty', text: '', expected: null },
  { name: 'neg-mark-k1', text: 'K1', expected: null },
  { name: 'neg-chainage', text: 'STA 0+000', expected: null },
  { name: 'neg-pair-single-token', text: '15/30', expected: null },
  { name: 'neg-product-single-token', text: '2.500 × 3.000', expected: null },
];

export interface DimensionListProbe {
  name: string;
  text: string;
  expected: Array<{
    value: number;
    unit: DimensionUnit;
    kind: DimensionKind;
    associatedElement?: string;
  }>;
}

export const DIMENSION_LIST_PROBES: DimensionListProbe[] = [
  { name: 'list-pair-15-30', text: '15/30', expected: [
    { value: 15, unit: 'cm', kind: 'LINEAR' },
    { value: 30, unit: 'cm', kind: 'LINEAR' },
  ] },
  { name: 'list-pair-x', text: '15x30', expected: [
    { value: 15, unit: 'cm', kind: 'LINEAR' },
    { value: 30, unit: 'cm', kind: 'LINEAR' },
  ] },
  { name: 'list-product', text: '2.500 × 3.000', expected: [
    { value: 2500, unit: 'mm', kind: 'LINEAR' },
    { value: 3000, unit: 'mm', kind: 'LINEAR' },
  ] },
  { name: 'list-label-pair', text: 'K1: 15/30', expected: [
    { value: 15, unit: 'cm', kind: 'LINEAR', associatedElement: 'K1' },
    { value: 30, unit: 'cm', kind: 'LINEAR', associatedElement: 'K1' },
  ] },
  { name: 'list-comma-separated', text: '3.500, 2.000', expected: [
    { value: 3500, unit: 'mm', kind: 'LINEAR' },
    { value: 2000, unit: 'mm', kind: 'LINEAR' },
  ] },
  { name: 'list-semicolon', text: '3.500; 2.000', expected: [
    { value: 3500, unit: 'mm', kind: 'LINEAR' },
    { value: 2000, unit: 'mm', kind: 'LINEAR' },
  ] },
  { name: 'list-slash-lengths', text: '2.500/3.000', expected: [
    { value: 2500, unit: 'mm', kind: 'LINEAR' },
    { value: 3000, unit: 'mm', kind: 'LINEAR' },
  ] },
  { name: 'list-grid-nothing', text: 'B/3', expected: [] },
  { name: 'list-scale-nothing', text: 'SKALA 1:100', expected: [] },
  { name: 'list-scale-bare-nothing', text: '1:100', expected: [] },
  { name: 'list-identifier-dropped', text: 'DET-3, 3.500', expected: [
    { value: 3500, unit: 'mm', kind: 'LINEAR' },
  ] },
  { name: 'list-rebar-nothing', text: 'D12-150', expected: [] },
  { name: 'list-decimal-comma-kept', text: '3,50 m, 2,10 m', expected: [
    { value: 3.5, unit: 'm', kind: 'LINEAR' },
    { value: 2.1, unit: 'm', kind: 'LINEAR' },
  ] },
];

// ---------------------------------------------------------------------------
// I3 — opening probes
// ---------------------------------------------------------------------------

export interface ScheduleRowProbe {
  name: string;
  rowText: string;
  page: number;
  /** Null = not a schedule row for an opening. */
  expected: { mark: string; widthMm: number | null; heightMm: number | null; thicknessMm?: number | null } | null;
}

export const SCHEDULE_ROW_PROBES: ScheduleRowProbe[] = [
  { name: 'row-d1-cm-pair', rowText: 'D1 | Pintu Utama | 90 x 210 | Kayu Jati | Kusen Kayu', page: 4, expected: { mark: 'D1', widthMm: 900, heightMm: 2100 } },
  { name: 'row-j1-cm-pair', rowText: 'J1 | Jendela | 120 x 150 | Kaca Bening | Kusen Aluminium', page: 4, expected: { mark: 'J1', widthMm: 1200, heightMm: 1500 } },
  { name: 'row-p1-mm-pair', rowText: 'P1 | Pintu | 900 x 2100 mm', page: 4, expected: { mark: 'P1', widthMm: 900, heightMm: 2100 } },
  { name: 'row-w1-m-pair', rowText: 'W1 | Window | 0,9 x 2,1 m', page: 4, expected: { mark: 'W1', widthMm: 900, heightMm: 2100 } },
  { name: 'row-k1-slash', rowText: 'K1 | Kolom | 15/30 | 4D16', page: 5, expected: { mark: 'K1', widthMm: 150, heightMm: 300 } },
  { name: 'row-b1-slash', rowText: 'B1 | Balok | 20/40', page: 5, expected: { mark: 'B1', widthMm: 200, heightMm: 400 } },
  { name: 'row-s1-single', rowText: 'S1 | Pelat | 12 cm', page: 5, expected: { mark: 'S1', widthMm: null, heightMm: null } },
  // I11 Stage 4 (E15): a 3-dimension row keeps ALL THREE values — the
  // third is the thickness (40 cm → 400 mm). The old probe name
  // (`row-f1-triple-first-pair`) encoded the limitation; it is retired
  // with the limitation itself.
  { name: 'row-f1-triple', rowText: 'F1 | Footplat | 100 x 100 x 40', page: 5, expected: { mark: 'F1', widthMm: 1000, heightMm: 1000, thicknessMm: 400 } },
  { name: 'row-f2-slash-triple', rowText: 'F2 | Footplat | 120/120/50', page: 5, expected: { mark: 'F2', widthMm: 1200, heightMm: 1200, thicknessMm: 500 } },
  { name: 'row-d2-no-dims', rowText: 'D2 | Pintu | Kusen Aluminium', page: 4, expected: { mark: 'D2', widthMm: null, heightMm: null } },
  { name: 'row-no-mark', rowText: 'Tanpa kode | Pintu | 90 x 210', page: 4, expected: null },
  { name: 'row-hyphen-lowercase', rowText: 'd-1 | pintu | 90/210', page: 4, expected: { mark: 'D1', widthMm: 900, heightMm: 2100 } },
  { name: 'row-bv1', rowText: 'BV1 | Bouvenlicht | 60 x 40', page: 4, expected: { mark: 'BV1', widthMm: 600, heightMm: 400 } },
];

export interface OpeningCountProbe {
  name: string;
  occurrences: OpeningOccurrence[];
  scheduleRows: string[];
  /** Expected records, matched as a multiset on (mark, quantity). */
  expected: Array<{ mark: string; quantity: number; widthMm: number | null; heightMm: number | null }>;
}

export const OPENING_COUNT_PROBES: OpeningCountProbe[] = [
  {
    name: 'count-multi-floor',
    occurrences: [
      { mark: 'D1', elementType: 'door', page: 2 },
      { mark: 'D1', elementType: 'door', page: 2 },
      { mark: 'D1', elementType: 'door', page: 3, floor: 'Lt 2' },
      { mark: 'J1', elementType: 'window', page: 2 },
      { mark: 'J1', elementType: 'window', page: 2 },
      { mark: 'J1', elementType: 'window', page: 2 },
    ],
    scheduleRows: [
      'D1 | Pintu | 90 x 210 | Kayu',
      'J1 | Jendela | 120 x 150 | Kaca',
    ],
    expected: [
      { mark: 'D1', quantity: 2, widthMm: 900, heightMm: 2100 },
      { mark: 'D1', quantity: 1, widthMm: 900, heightMm: 2100 },
      { mark: 'J1', quantity: 3, widthMm: 1200, heightMm: 1500 },
    ],
  },
  {
    name: 'count-unlinked',
    occurrences: [{ mark: 'D9', elementType: 'door', page: 2 }],
    scheduleRows: ['D1 | Pintu | 90 x 210 | Kayu'],
    expected: [{ mark: 'D9', quantity: 1, widthMm: null, heightMm: null }],
  },
];

export interface OpeningConflictProbe {
  name: string;
  plan: PlanOpeningDimensions;
  rowText: string;
  expected: 'OK' | 'CONFLICT';
}

export const OPENING_CONFLICT_PROBES: OpeningConflictProbe[] = [
  { name: 'conflict-match', plan: { mark: 'D1', widthMm: 900, heightMm: 2100 }, rowText: 'D1 | Pintu | 90 x 210', expected: 'OK' },
  { name: 'conflict-width-diff', plan: { mark: 'D1', widthMm: 900, heightMm: 2100 }, rowText: 'D1 | Pintu | 100 x 210', expected: 'CONFLICT' },
  { name: 'conflict-height-diff', plan: { mark: 'D1', widthMm: 900, heightMm: 2100 }, rowText: 'D1 | Pintu | 90 x 220', expected: 'CONFLICT' },
  { name: 'conflict-missing-plan-width', plan: { mark: 'D1', widthMm: null, heightMm: 2100 }, rowText: 'D1 | Pintu | 90 x 210', expected: 'OK' },
  { name: 'conflict-missing-both', plan: { mark: 'D1', widthMm: null, heightMm: null }, rowText: 'D1 | Pintu | 90 x 210', expected: 'OK' },
];

// ---------------------------------------------------------------------------
// I4 — QTO probes (hand-computed values; tolerance 1e-9)
// ---------------------------------------------------------------------------

export interface QtoProbe {
  name: string;
  /** Thunk calling the module under test; `expected` is the hand value. */
  run: () => GeometryQuantity;
  expected: number | null;
  expectedUnit: string;
  expectedStatus?: VisionReviewStatus;
}

// Bound in benchmark.ts — kept here as a factory so the hand-computed
// expectations live next to the other probes (this module stays import-
// light; the geometryQto functions are injected by the harness).
export function makeQtoProbes(qto: {
  qtoLength: (mm: number | null | undefined) => GeometryQuantity;
  qtoArea: (l: number | null | undefined, w: number | null | undefined) => GeometryQuantity;
  qtoPerimeter: (l: number | null | undefined, w: number | null | undefined) => GeometryQuantity;
  qtoVolume: (l: number | null | undefined, w: number | null | undefined, h: number | null | undefined) => GeometryQuantity;
  qtoCount: (n: number | null | undefined) => GeometryQuantity;
  qtoSurfaceArea: (l: number | null | undefined, w: number | null | undefined, h: number | null | undefined) => GeometryQuantity;
  qtoWallNetArea: (
    l: number | null | undefined,
    h: number | null | undefined,
    ops: Array<{ widthMm: number | null | undefined; heightMm: number | null | undefined }>,
  ) => GeometryQuantity;
  aggregateFloors: (qs: GeometryQuantity[]) => GeometryQuantity;
}): QtoProbe[] {
  return [
    { name: 'qto-area-3500x3000', run: () => qto.qtoArea(3500, 3000), expected: 10.5, expectedUnit: 'm2' },
    { name: 'qto-area-7000x5000', run: () => qto.qtoArea(7000, 5000), expected: 35, expectedUnit: 'm2' },
    { name: 'qto-volume-room', run: () => qto.qtoVolume(3500, 3000, 2800), expected: 29.4, expectedUnit: 'm3' },
    // Column K1 30×30 cm, 3.5 m high: 0.3 × 0.3 × 3.5 = 0.315 m³.
    { name: 'qto-volume-column-k1', run: () => qto.qtoVolume(300, 300, 3500), expected: 0.315, expectedUnit: 'm3' },
    { name: 'qto-perimeter-7000x5000', run: () => qto.qtoPerimeter(7000, 5000), expected: 24, expectedUnit: 'm' },
    { name: 'qto-length-12500', run: () => qto.qtoLength(12500), expected: 12.5, expectedUnit: 'm' },
    { name: 'qto-count-7', run: () => qto.qtoCount(7), expected: 7, expectedUnit: 'unit' },
    { name: 'qto-count-negative-null', run: () => qto.qtoCount(-1), expected: null, expectedUnit: 'unit', expectedStatus: 'UNRESOLVED' },
    { name: 'qto-count-fraction-null', run: () => qto.qtoCount(2.5), expected: null, expectedUnit: 'unit', expectedStatus: 'UNRESOLVED' },
    // Prism surface 0.3×0.3×3.5: 2×(0.09 + 1.05 + 1.05) = 4.38 m².
    { name: 'qto-surface-column', run: () => qto.qtoSurfaceArea(300, 300, 3500), expected: 4.38, expectedUnit: 'm2' },
    // Wall 7.00 × 3.00 = 21.00 m² minus D1 0.90×2.10 = 1.89 and J1 1.20×1.50 = 1.80 → 17.31 m².
    { name: 'qto-wall-net-two-openings', run: () => qto.qtoWallNetArea(7000, 3000, [
      { widthMm: 900, heightMm: 2100 },
      { widthMm: 1200, heightMm: 1500 },
    ]), expected: 17.31, expectedUnit: 'm2' },
    { name: 'qto-wall-net-no-openings', run: () => qto.qtoWallNetArea(3500, 3000, []), expected: 10.5, expectedUnit: 'm2' },
    { name: 'qto-wall-net-deduction-exceeds-null', run: () => qto.qtoWallNetArea(2000, 2000, [
      { widthMm: 3000, heightMm: 3000 },
    ]), expected: null, expectedUnit: 'm2', expectedStatus: 'UNRESOLVED' },
    { name: 'qto-wall-net-missing-opening-null', run: () => qto.qtoWallNetArea(7000, 3000, [
      { widthMm: 900, heightMm: null },
    ]), expected: null, expectedUnit: 'm2', expectedStatus: 'UNRESOLVED' },
    { name: 'qto-area-missing-null', run: () => qto.qtoArea(null, 3000), expected: null, expectedUnit: 'm2', expectedStatus: 'UNRESOLVED' },
    { name: 'qto-area-negative-null', run: () => qto.qtoArea(-100, 3000), expected: null, expectedUnit: 'm2', expectedStatus: 'UNRESOLVED' },
    { name: 'qto-aggregate-two-floors', run: () => qto.aggregateFloors([qto.qtoArea(3500, 3000), qto.qtoArea(3500, 3000)]), expected: 21, expectedUnit: 'm2' },
    { name: 'qto-aggregate-empty-null', run: () => qto.aggregateFloors([]), expected: null, expectedUnit: 'm2', expectedStatus: 'UNRESOLVED' },
    { name: 'qto-aggregate-mixed-null', run: () => qto.aggregateFloors([qto.qtoArea(3500, 3000), qto.qtoVolume(3500, 3000, 2800)]), expected: null, expectedUnit: 'm2', expectedStatus: 'UNRESOLVED' },
  ];
}

// ---------------------------------------------------------------------------
// I6 — scale probes
// ---------------------------------------------------------------------------

export interface StatedScaleProbe {
  name: string;
  text: string;
  expected: string | null;
}

export const STATED_SCALE_PROBES: StatedScaleProbe[] = [
  { name: 'scale-skala-1-100', text: 'SKALA 1:100', expected: '1:100' },
  { name: 'scale-spaced', text: '1 : 50', expected: '1:50' },
  { name: 'scale-lowercase', text: 'Skala 1:20', expected: '1:20' },
  { name: 'scale-in-sentence', text: 'Denah lantai 1 skala 1:200', expected: '1:200' },
  { name: 'scale-none', text: 'tanpa skala', expected: null },
  { name: 'scale-zero-denominator', text: '1:0', expected: null },
  { name: 'scale-not-one', text: '2:100', expected: null },
  { name: 'scale-empty', text: '', expected: null },
];

export interface ScaleFlowProbe {
  name: string;
  calibrate: { knownMm: number; pixels: number };
  verifyChecks: Array<{ dimensionMm: number; pixels: number }>;
  measurePx?: number;
  expectedMmPerPixel: number;
  expectedVerified: boolean;
  /** Null = measurement must be refused. */
  expectedMeasuredMm: number | null;
  /** Max allowed uncertaintyPct after verification (hand-computed bound). */
  expectedUncertaintyPctMax?: number;
}

export const SCALE_FLOW_PROBES: ScaleFlowProbe[] = [
  {
    name: 'scale-flow-exact',
    calibrate: { knownMm: 3500, pixels: 350 },
    verifyChecks: [
      { dimensionMm: 7000, pixels: 700 },
      { dimensionMm: 3000, pixels: 300 },
    ],
    measurePx: 525,
    expectedMmPerPixel: 10,
    expectedVerified: true,
    // 525 px × 10 mm/px = 5250 mm.
    expectedMeasuredMm: 5250,
    expectedUncertaintyPctMax: 0.0001,
  },
  {
    name: 'scale-flow-within-tolerance',
    calibrate: { knownMm: 3500, pixels: 350 },
    // Predicted 700 px vs measured 714 px: error 14/714 = 1.9608% ≤ 2%.
    verifyChecks: [{ dimensionMm: 7000, pixels: 714 }],
    measurePx: 100,
    expectedMmPerPixel: 10,
    expectedVerified: true,
    expectedMeasuredMm: 1000,
    expectedUncertaintyPctMax: 2,
  },
  {
    name: 'scale-flow-beyond-tolerance',
    calibrate: { knownMm: 3500, pixels: 350 },
    // Predicted 700 px vs measured 720 px: error 20/720 = 2.78% > 2%.
    verifyChecks: [{ dimensionMm: 7000, pixels: 720 }],
    measurePx: 100,
    expectedMmPerPixel: 10,
    expectedVerified: false,
    expectedMeasuredMm: null,
  },
  {
    name: 'scale-flow-no-checks-unverified',
    calibrate: { knownMm: 3500, pixels: 350 },
    verifyChecks: [],
    measurePx: 100,
    expectedMmPerPixel: 10,
    expectedVerified: false,
    expectedMeasuredMm: null,
  },
];

export interface NonUniformProbe {
  name: string;
  xMmPerPixel: number;
  yMmPerPixel: number;
  expected: boolean;
}

export const NON_UNIFORM_PROBES: NonUniformProbe[] = [
  // |10 − 10.3| / 10.15 = 2.96% > 2% → distorted.
  { name: 'nonuniform-3pct', xMmPerPixel: 10, yMmPerPixel: 10.3, expected: true },
  // |10 − 10.1| / 10.05 = 0.995% ≤ 2% → uniform.
  { name: 'nonuniform-1pct', xMmPerPixel: 10, yMmPerPixel: 10.1, expected: false },
  { name: 'nonuniform-equal', xMmPerPixel: 10, yMmPerPixel: 10, expected: false },
  { name: 'nonuniform-invalid-input', xMmPerPixel: 0, yMmPerPixel: 10, expected: false },
];

// ---------------------------------------------------------------------------
// I5 — reference probes
// ---------------------------------------------------------------------------

export interface ReferenceProbe {
  name: string;
  refs: CrossSheetReference[];
  knownTargets: KnownTarget[];
  claims?: Array<{ key: string; claims: ClaimedValue[] }>;
  expectedStatuses: ReferenceStatus[];
  /** Expected conflictDetail substring for CONTRADICTORY refs (or null). */
  expectedConflictDetailContains?: string | null;
}

function ref(fromPage: number, fromRef: string, toPage: number | null, toRef: string): CrossSheetReference {
  return {
    from: { page: fromPage, ref: fromRef },
    to: { page: toPage, ref: toRef },
    kind: 'DETAIL',
    status: 'UNRESOLVED',
    evidence: [],
  };
}

export const REFERENCE_PROBES: ReferenceProbe[] = [
  {
    name: 'ref-confirmed-exact',
    refs: [ref(2, 'DENAH', 5, 'DETAIL A')],
    knownTargets: [{ page: 5, ref: 'DETAIL A' }],
    expectedStatuses: ['CONFIRMED'],
  },
  {
    name: 'ref-probable-page-unknown',
    refs: [ref(2, 'DENAH', null, 'DETAIL A')],
    knownTargets: [{ page: 5, ref: 'DETAIL A' }],
    expectedStatuses: ['PROBABLE'],
  },
  {
    name: 'ref-probable-wrong-page',
    refs: [ref(2, 'DENAH', 9, 'DETAIL A')],
    knownTargets: [{ page: 5, ref: 'DETAIL A' }],
    expectedStatuses: ['PROBABLE'],
  },
  {
    name: 'ref-unresolved-no-target',
    refs: [ref(2, 'DENAH', null, 'DETAIL Z')],
    knownTargets: [{ page: 5, ref: 'DETAIL A' }],
    expectedStatuses: ['UNRESOLVED'],
  },
  {
    name: 'ref-unresolved-empty-ref',
    refs: [ref(2, 'DENAH', null, '   ')],
    knownTargets: [{ page: 5, ref: 'DETAIL A' }],
    expectedStatuses: ['UNRESOLVED'],
  },
  {
    name: 'ref-conflict-two-claims',
    refs: [
      { ...ref(2, 'DENAH', 4, 'D1'), kind: 'SCHEDULE' as const },
      { ...ref(3, 'DENAH LT2', 4, 'D1'), kind: 'SCHEDULE' as const },
    ],
    knownTargets: [{ page: 4, ref: 'D1' }],
    claims: [
      { key: 'D1', claims: [
        { claim: '900×2100 mm', page: 4 },
        { claim: '1000×2100 mm', page: 7 },
      ] },
    ],
    expectedStatuses: ['CONTRADICTORY', 'CONTRADICTORY'],
    expectedConflictDetailContains: '"900×2100 mm" (page 4) vs "1000×2100 mm" (page 7)',
  },
  {
    name: 'ref-single-claim-no-conflict',
    refs: [{ ...ref(2, 'DENAH', 4, 'D1'), kind: 'SCHEDULE' as const }],
    knownTargets: [{ page: 4, ref: 'D1' }],
    claims: [
      { key: 'D1', claims: [{ claim: '900×2100 mm', page: 4 }] },
    ],
    expectedStatuses: ['CONFIRMED'],
  },
  {
    name: 'ref-same-claim-twice-no-conflict',
    refs: [{ ...ref(2, 'DENAH', 4, 'D1'), kind: 'SCHEDULE' as const }],
    knownTargets: [{ page: 4, ref: 'D1' }],
    claims: [
      { key: 'D1', claims: [
        { claim: '900×2100 mm', page: 4 },
        { claim: '900×2100 mm', page: 7 },
      ] },
    ],
    expectedStatuses: ['CONFIRMED'],
  },
];

// ---------------------------------------------------------------------------
// I9 — OCR probes
// ---------------------------------------------------------------------------

export interface OcrParseProbe {
  name: string;
  content: string;
  ctx: OcrParseContext;
  /** Expected spans, matched by exact text (order-insensitive). */
  expectedSpans: Array<{
    text: string;
    confidence?: number;
    status?: VisionReviewStatus;
    truncated?: boolean;
    bboxNull?: boolean;
    duplicateCount?: number;
  }>;
  expectedDropped: number;
}

const OCR_CTX_1000x800: OcrParseContext = { page: 1, imageWidthPx: 1000, imageHeightPx: 800 };

export const OCR_PARSE_PROBES: OcrParseProbe[] = [
  {
    name: 'ocr-spans-schema',
    content: JSON.stringify({
      spans: [
        { text: '3.500', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.95 },
        { text: 'D1', bbox: { x: 300, y: 200, width: 30, height: 20 }, confidence: 0.9 },
        { text: 'RUANG TAMU', bbox: { x: 400, y: 300, width: 120, height: 20 }, confidence: 0.88 },
      ],
    }),
    ctx: OCR_CTX_1000x800,
    expectedSpans: [
      { text: '3.500', confidence: 0.95, status: 'HIGH_CONFIDENCE' },
      { text: 'D1', confidence: 0.9, status: 'HIGH_CONFIDENCE' },
      { text: 'RUANG TAMU', confidence: 0.88, status: 'HIGH_CONFIDENCE' },
    ],
    expectedDropped: 0,
  },
  {
    name: 'ocr-detections-alias',
    content: JSON.stringify({
      detections: [
        { text: '7.000', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.9 },
      ],
    }),
    ctx: OCR_CTX_1000x800,
    expectedSpans: [{ text: '7.000', confidence: 0.9, status: 'HIGH_CONFIDENCE' }],
    expectedDropped: 0,
  },
  {
    name: 'ocr-bare-array',
    content: JSON.stringify([
      { text: '2.500', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.9 },
    ]),
    ctx: OCR_CTX_1000x800,
    expectedSpans: [{ text: '2.500', confidence: 0.9, status: 'HIGH_CONFIDENCE' }],
    expectedDropped: 0,
  },
  {
    name: 'ocr-truncated-kept-verbatim',
    // THE guard case: a truncated span keeps its PARTIAL text ("3.5…")
    // verbatim — never completed to "3.500". Confidence 0.9 − 0.15 = 0.75,
    // status capped at NEEDS_REVIEW.
    content: JSON.stringify({
      spans: [
        { text: '3.5…', bbox: { x: 100, y: 100, width: 40, height: 20 }, confidence: 0.9, truncated: true },
      ],
    }),
    ctx: OCR_CTX_1000x800,
    expectedSpans: [{ text: '3.5…', confidence: 0.75, status: 'NEEDS_REVIEW', truncated: true }],
    expectedDropped: 0,
  },
  {
    name: 'ocr-penalty-stacking',
    // 0.95 − 0.15 (truncated) − 0.10 (blurry) = 0.70, capped NEEDS_REVIEW.
    content: JSON.stringify({
      spans: [
        { text: '3.500', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.95, truncated: true, blurry: true },
      ],
    }),
    ctx: OCR_CTX_1000x800,
    expectedSpans: [{ text: '3.500', confidence: 0.7, status: 'NEEDS_REVIEW', truncated: true }],
    expectedDropped: 0,
  },
  {
    name: 'ocr-malformed-dropped',
    content: JSON.stringify({
      spans: [
        { text: '3.500', bbox: { x: 100, y: 100, width: 60, height: 20 } }, // no confidence → dropped
        { text: '7.000', bbox: { x: 100, y: 100, width: 0, height: 20 }, confidence: 0.9 }, // zero-area bbox → dropped
        { text: '2.500', bbox: { x: 950, y: 100, width: 100, height: 20 }, confidence: 0.9 }, // out of bounds → kept, bbox null
        'not an object', // dropped
        { text: '   ', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.9 }, // blank text → dropped
        { text: '1.200', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.9 }, // clean → kept
      ],
    }),
    ctx: OCR_CTX_1000x800,
    expectedSpans: [
      { text: '2.500', confidence: 0.9, status: 'HIGH_CONFIDENCE', bboxNull: true },
      { text: '1.200', confidence: 0.9, status: 'HIGH_CONFIDENCE' },
    ],
    expectedDropped: 4,
  },
  {
    name: 'ocr-no-json',
    content: 'this is not json at all',
    ctx: OCR_CTX_1000x800,
    expectedSpans: [],
    expectedDropped: 0,
  },
  {
    name: 'ocr-duplicate-count',
    content: JSON.stringify({
      spans: [
        { text: 'D1', bbox: { x: 300, y: 200, width: 30, height: 20 }, confidence: 0.9, duplicated: true, duplicateCount: 3 },
      ],
    }),
    ctx: OCR_CTX_1000x800,
    // 0.9 − 0.05 (duplicated) = 0.85, capped NEEDS_REVIEW.
    expectedSpans: [{ text: 'D1', confidence: 0.85, status: 'NEEDS_REVIEW', duplicateCount: 3 }],
    expectedDropped: 0,
  },
  {
    name: 'ocr-model-value-ignored',
    // A model-supplied `normalizedValue` must be IGNORED: only I2 assigns values.
    content: JSON.stringify({
      spans: [
        { text: '3.500', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.9, normalizedValue: 9999, value: 42 },
      ],
    }),
    ctx: OCR_CTX_1000x800,
    expectedSpans: [{ text: '3.500', confidence: 0.9, status: 'HIGH_CONFIDENCE' }],
    expectedDropped: 0,
  },
];

export interface OcrDedupeProbe {
  name: string;
  spans: Array<{ text: string; bbox: BoundingBox | null; confidence: number }>;
  expectedKept: number;
  expectedMerges: number;
  /** Expected duplicateCount on the kept span (when a merge happened). */
  expectedDuplicateCount?: number;
}

export const OCR_DEDUPE_PROBES: OcrDedupeProbe[] = [
  {
    name: 'dedupe-overlapping-identical',
    spans: [
      { text: '3.500', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.95 },
      { text: '3.500', bbox: { x: 102, y: 101, width: 60, height: 20 }, confidence: 0.9 },
    ],
    expectedKept: 1,
    expectedMerges: 1,
    expectedDuplicateCount: 2,
  },
  {
    name: 'dedupe-same-text-far-apart',
    spans: [
      { text: '3.500', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.95 },
      { text: '3.500', bbox: { x: 500, y: 500, width: 60, height: 20 }, confidence: 0.9 },
    ],
    expectedKept: 2,
    expectedMerges: 0,
  },
  {
    name: 'dedupe-different-text-overlapping',
    spans: [
      { text: '3.500', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.95 },
      { text: 'D1', bbox: { x: 100, y: 100, width: 60, height: 20 }, confidence: 0.9 },
    ],
    expectedKept: 2,
    expectedMerges: 0,
  },
  {
    name: 'dedupe-null-bbox-never-merged',
    spans: [
      { text: '3.500', bbox: null, confidence: 0.95 },
      { text: '3.500', bbox: null, confidence: 0.9 },
    ],
    expectedKept: 2,
    expectedMerges: 0,
  },
  {
    name: 'dedupe-three-copies',
    spans: [
      { text: 'D1', bbox: { x: 300, y: 200, width: 30, height: 20 }, confidence: 0.95 },
      { text: 'D1', bbox: { x: 301, y: 201, width: 30, height: 20 }, confidence: 0.9 },
      { text: 'D1', bbox: { x: 299, y: 199, width: 30, height: 20 }, confidence: 0.85 },
    ],
    expectedKept: 1,
    expectedMerges: 2,
    expectedDuplicateCount: 3,
  },
  {
    name: 'dedupe-case-sensitive',
    // D1 vs d1 are distinct readings, not duplicates.
    spans: [
      { text: 'D1', bbox: { x: 300, y: 200, width: 30, height: 20 }, confidence: 0.95 },
      { text: 'd1', bbox: { x: 300, y: 200, width: 30, height: 20 }, confidence: 0.9 },
    ],
    expectedKept: 2,
    expectedMerges: 0,
  },
];

export interface OcrRoutingProbe {
  name: string;
  text: string;
  dimensionLike: boolean;
  markLike: boolean;
  referenceLike: boolean;
  scheduleRowLike: boolean;
}

export const OCR_ROUTING_PROBES: OcrRoutingProbe[] = [
  { name: 'route-dim-3500', text: '3.500', dimensionLike: true, markLike: false, referenceLike: false, scheduleRowLike: false },
  { name: 'route-year-2026-not-dim', text: '2026', dimensionLike: false, markLike: false, referenceLike: false, scheduleRowLike: false },
  { name: 'route-bare-120-not-dim', text: '120', dimensionLike: false, markLike: false, referenceLike: false, scheduleRowLike: false },
  { name: 'route-dim-mm', text: '3500 mm', dimensionLike: true, markLike: false, referenceLike: false, scheduleRowLike: false },
  { name: 'route-dim-diameter', text: 'Ø12', dimensionLike: true, markLike: false, referenceLike: false, scheduleRowLike: false },
  // 'D12' is mark-like, and the mark test runs FIRST in isDimensionLikeText
  // ("a bare mark is a symbol, not a dimension") — so it routes to 'symbol',
  // never to I2. That precedence is what creates the D12 phantom opening on
  // scanned structural drawings (see the scanned fixture).
  { name: 'route-d12-mark-not-dim', text: 'D12', dimensionLike: false, markLike: true, referenceLike: false, scheduleRowLike: false },
  { name: 'route-mark-d1', text: 'D1', dimensionLike: false, markLike: true, referenceLike: false, scheduleRowLike: false },
  { name: 'route-mark-k1', text: 'K1', dimensionLike: false, markLike: true, referenceLike: false, scheduleRowLike: false },
  { name: 'route-ref-lihat-detail', text: 'LIHAT DETAIL A', dimensionLike: false, markLike: false, referenceLike: true, scheduleRowLike: false },
  { name: 'route-ref-potongan', text: 'POTONGAN A-A', dimensionLike: false, markLike: false, referenceLike: true, scheduleRowLike: false },
  { name: 'route-schedule-row', text: 'D1 | Pintu | 90 x 210 | Kayu', dimensionLike: false, markLike: false, referenceLike: false, scheduleRowLike: true },
  { name: 'route-room-label', text: 'RUANG TAMU', dimensionLike: false, markLike: false, referenceLike: false, scheduleRowLike: false },
  { name: 'route-scale-not-dim', text: 'SKALA 1:100', dimensionLike: false, markLike: false, referenceLike: false, scheduleRowLike: false },
  { name: 'route-truncated-ellipsis', text: '3.5…', dimensionLike: false, markLike: false, referenceLike: false, scheduleRowLike: false },
  { name: 'route-pair-15-30', text: '15/30', dimensionLike: true, markLike: false, referenceLike: false, scheduleRowLike: false },
];

export interface OcrPenaltyProbe {
  name: string;
  confidence: number;
  flags: OcrTextSpan['flags'];
  expectedConfidence: number;
  expectedStatus: VisionReviewStatus;
}

export const OCR_PENALTY_PROBES: OcrPenaltyProbe[] = [
  { name: 'penalty-none', confidence: 0.9, flags: {}, expectedConfidence: 0.9, expectedStatus: 'HIGH_CONFIDENCE' },
  { name: 'penalty-truncated', confidence: 0.9, flags: { truncated: true }, expectedConfidence: 0.75, expectedStatus: 'NEEDS_REVIEW' },
  { name: 'penalty-skewed', confidence: 0.9, flags: { skewed: true }, expectedConfidence: 0.8, expectedStatus: 'NEEDS_REVIEW' },
  { name: 'penalty-blurry', confidence: 0.9, flags: { blurry: true }, expectedConfidence: 0.8, expectedStatus: 'NEEDS_REVIEW' },
  { name: 'penalty-duplicated', confidence: 0.9, flags: { duplicated: true }, expectedConfidence: 0.85, expectedStatus: 'NEEDS_REVIEW' },
  // 1.0 − 0.15 − 0.10 − 0.10 − 0.05 = 0.60 — all four penalties stack.
  { name: 'penalty-all-stack', confidence: 1.0, flags: { truncated: true, skewed: true, blurry: true, duplicated: true }, expectedConfidence: 0.6, expectedStatus: 'NEEDS_REVIEW' },
  // 0.10 − 0.15 floors at 0 — never negative.
  { name: 'penalty-floor-zero', confidence: 0.1, flags: { truncated: true }, expectedConfidence: 0, expectedStatus: 'UNRESOLVED' },
];

// ---------------------------------------------------------------------------
// I7 — review-state bbox probes
// ---------------------------------------------------------------------------

export interface BboxPercentProbe {
  name: string;
  bbox: BoundingBox;
  imageWidthPx: number;
  imageHeightPx: number;
  expected: { leftPct: number; topPct: number; widthPct: number; heightPct: number } | null;
}

export const BBOX_PERCENT_PROBES: BboxPercentProbe[] = [
  {
    name: 'bboxpct-center',
    bbox: { x: 100, y: 80, width: 200, height: 40 },
    imageWidthPx: 1000,
    imageHeightPx: 800,
    // left 100/1000=10, top 80/800=10, width 200/1000=20, height 40/800=5.
    expected: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 5 },
  },
  {
    name: 'bboxpct-full-frame',
    bbox: { x: 0, y: 0, width: 1000, height: 800 },
    imageWidthPx: 1000,
    imageHeightPx: 800,
    expected: { leftPct: 0, topPct: 0, widthPct: 100, heightPct: 100 },
  },
  {
    name: 'bboxpct-clamped',
    // x 900 + w 200 overflows 1000 → w clamps to 100; y 700 + h 200
    // overflows 800 → h clamps to 100.
    bbox: { x: 900, y: 700, width: 200, height: 200 },
    imageWidthPx: 1000,
    imageHeightPx: 800,
    expected: { leftPct: 90, topPct: 87.5, widthPct: 10, heightPct: 12.5 },
  },
  {
    name: 'bboxpct-zero-area-null',
    bbox: { x: 100, y: 100, width: 0, height: 40 },
    imageWidthPx: 1000,
    imageHeightPx: 800,
    expected: null,
  },
  {
    name: 'bboxpct-invalid-image-null',
    bbox: { x: 100, y: 100, width: 200, height: 40 },
    imageWidthPx: 0,
    imageHeightPx: 800,
    expected: null,
  },
];

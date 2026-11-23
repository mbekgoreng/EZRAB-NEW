/**
 * I10a benchmark fixture — ROOF + DETAILS (synthetic).
 *
 * Roof plan + detail sheet + section. Tests roof angles (30°, 45°),
 * detail↔section cross-references (PROBABLE via title match), and
 * vision-legend scale capture (1:20 from a legend proposal — the native
 * text states no scale on p2).
 *
 * Hand-derived call count (first run): p1 1 + p2 1 + p3 1 = 3.
 *
 * I11 Stage 4 (E16/E17): p1 gains a roof object (`Atap 6.000 x 8.000`
 * → ROOF record + plan-area quantity 48 m², NEEDS_REVIEW). Calls are
 * unchanged — the roof is dimensioned, not UNRESOLVED.
 */

import type { BenchmarkFixture } from './types';
import {
  bbox,
  detections,
  dimEntry,
  emptyDetections,
  legendEntry,
  objectEntry,
  textEntry,
} from './stub';

export const ROOF_DETAIL_FIXTURE: BenchmarkFixture = {
  id: 'roof-detail',
  tier: 'synthetic',
  type: 'roof-detail',
  title: 'Atap + detail — denah atap + detail nok + potongan',
  pages: [
    {
      page: 1,
      title: 'DENAH ATAP',
      text: 'denah atap rangka kuda kuda genteng',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'ROOF_PLAN',
      stub: {
        survey: detections([
          dimEntry('30°', bbox(100, 100, 80, 30)),
          dimEntry('6.000', bbox(300, 100, 120, 30)),
          dimEntry('8.000', bbox(500, 100, 120, 30)),
          // I11 Stage 4 (E16/E17): roof plane object — dims from its
          // own label text (6.000 × 8.000); plan area 48 m² (no slope
          // correction — the 30° angle is a separate record).
          objectEntry('ATAP', 'Atap 6.000 x 8.000', bbox(300, 300, 400, 200)),
          textEntry('LIHAT DETAIL B', bbox(100, 700, 150, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 2,
      title: 'DETAIL B',
      text: 'detail b nok atap genteng',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'DETAIL',
      stub: {
        survey: detections([
          dimEntry('1.500', bbox(100, 100, 120, 30)),
          legendEntry('SKALA 1:20', bbox(800, 750, 120, 20)),
          textEntry('LIHAT POTONGAN C-C', bbox(100, 700, 180, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 3,
      title: 'POTONGAN C-C',
      text: 'potongan c-c atap +4.500',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SECTION',
      stub: {
        survey: detections([
          dimEntry('+4.500', bbox(100, 100, 120, 30)),
          dimEntry('45°', bbox(300, 100, 80, 30)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 1, originalText: '30°', value: 30, unit: 'deg', kind: 'ANGLE' },
      { page: 1, originalText: '6.000', value: 6000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '8.000', value: 8000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '1.500', value: 1500, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '+4.500', value: 4500, unit: 'mm', kind: 'ELEVATION' },
      { page: 3, originalText: '45°', value: 45, unit: 'deg', kind: 'ANGLE' },
    ],
    openings: [],
    // I11 Stage 4 (E16): one roof plane (dims from its label text).
    elements: [
      { page: 1, category: 'ROOF', elementType: 'roof-plane', mark: null, quantity: 1, lengthMm: 6000, widthMm: 8000, heightMm: null, thicknessMm: null, diameterMm: null, schedulePage: null },
    ],
    // I11 Stage 4 (E17): plan area 6.000 × 8.000 = 48 m².
    quantities: [
      { page: 1, kind: 'AREA', unit: 'm2', quantity: 48, ref: 'roof-plane' },
      { page: 1, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'roof-plane' },
    ],
    references: [
      { fromPage: 1, toRef: 'DETAIL B', status: 'PROBABLE' },
      { fromPage: 2, toRef: 'POTONGAN C-C', status: 'PROBABLE' },
    ],
    scales: [
      { page: 1, statedScale: null },
      { page: 2, statedScale: '1:20' },
      { page: 3, statedScale: null },
    ],
    calls: 3,
    budgetHit: false,
  },
  notMeasured: [
    'Roof form / slope / frame / covering as structured records: a roof-plane record + plan area exist since I11 Stage 4, but slope-corrected area, frame members, and covering types are not measured (no slope correction in SafeDecimalEngine; no frame/covering evidence on this sheet).',
  ],
};

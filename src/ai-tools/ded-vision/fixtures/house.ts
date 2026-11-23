/**
 * I10a benchmark fixture — HOUSE (synthetic).
 *
 * A 1-storey 60 m² house: cover + floor plan + section + door/window
 * schedule + detail. Ground truth hand-verified against the I1–I9
 * contracts (see the per-page notes). The stub survey responses simulate
 * a PERFECT model read — they measure deterministic pipeline fidelity,
 * never live-model quality.
 *
 * Hand-derived call count (first run): p1 0 (COVER policy 'none') +
 * p2 2 (survey + DETAIL: D2 unresolved at page time) + p3 1 + p4 2
 * (survey + DETAIL: schedule pages validate nothing record-bearing) +
 * p5 1 = 6.
 *
 * I11 Stage 4 (E16/E17/E18): p2 gains a wall object (`Dinding luar
 * 7.000 x 3.500` → WALL record + net-area quantity 18.92 m² after
 * deducting the linked D1×2 + J1 openings; D2 has no dims, so it is
 * skipped with an assumption) and OVERALL/CHAINED dimension labels
 * (the `7.000` overall extent + a `3.500` chained segment). Calls are
 * unchanged — the wall is NEEDS_REVIEW, not UNRESOLVED.
 */

import type { BenchmarkFixture } from './types';
import {
  bbox,
  detections,
  dimEntry,
  emptyDetections,
  legendEntry,
  objectEntry,
  symbolEntry,
  tableEntry,
  textEntry,
} from './stub';

export const HOUSE_FIXTURE: BenchmarkFixture = {
  id: 'house-1lantai-60m2',
  tier: 'synthetic',
  type: 'house',
  title: 'Rumah 1 lantai 60 m² — denah + potongan + jadwal kusen + detail',
  notes:
    'D2 has NO schedule row anywhere: it must stay UNRESOLVED with null ' +
    'dimensions (never a guessed size). D1 occurs twice on the plan (front ' +
    '+ back door, same mark) → quantity 2. The 7.000 dimension stub bbox ' +
    'is offset 10 px from the expected bbox (IoU 0.9048) to exercise the ' +
    'bbox-fidelity metric.',
  pages: [
    {
      page: 1,
      title: 'SAMPUL — RUMAH TINGGAL 1 LANTAI',
      text: 'sampul gambar kerja rumah tinggal 1 lantai 60 m2',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'COVER',
      stub: {},
      expectDetailPass: false,
    },
    {
      page: 2,
      title: 'DENAH LANTAI 1',
      text: 'denah lantai 1 ruang tamu kamar tidur dapur kamar mandi skala 1:100',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'FLOOR_PLAN',
      stub: {
        survey: detections([
          // Deliberately offset 10 px in x from the expected bbox.
          dimEntry('7.000', bbox(110, 60, 200, 30)),
          dimEntry('5.000', bbox(100, 100, 200, 30)),
          dimEntry('3.500', bbox(100, 140, 120, 30)),
          dimEntry('2.500 × 3.000', bbox(400, 140, 200, 30)),
          // I11 Stage 4 (E18): OVERALL extent + CHAINED segment — the
          // LABEL evidences the kind (see dimensions.ts labelHint).
          dimEntry('7.000', bbox(100, 20, 200, 30), 0.95, 'overall width'),
          dimEntry('3.500', bbox(400, 100, 120, 30), 0.95, 'chained dimension'),
          // I11 Stage 4 (E16/E17): exterior wall object — dims from its
          // own label text (7.000 × 3.500); net area deducts the linked
          // openings on this page.
          objectEntry('DINDING LUAR', 'Dinding luar 7.000 x 3.500', bbox(100, 300, 400, 30)),
          symbolEntry('D1', 'Pintu D1', bbox(300, 300, 60, 90)),
          symbolEntry('D1', 'Pintu D1', bbox(700, 300, 60, 90)),
          symbolEntry('D2', 'Pintu D2', bbox(300, 500, 60, 90)),
          symbolEntry('J1', 'Jendela J1', bbox(600, 500, 90, 60)),
          legendEntry('SKALA 1:100', bbox(800, 750, 120, 20)),
          textEntry('LIHAT DETAIL A', bbox(100, 700, 150, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectedBboxes: [
        { label: '7.000', kind: 'dimension', bbox: bbox(100, 60, 200, 30) },
        { label: 'D1', kind: 'symbol', bbox: bbox(300, 300, 60, 90) },
        { label: 'J1', kind: 'symbol', bbox: bbox(600, 500, 90, 60) },
      ],
      expectDetailPass: true,
    },
    {
      page: 3,
      title: 'POTONGAN A-A',
      text: 'potongan a-a tampak samping +3.500 ±0.000',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SECTION',
      stub: {
        survey: detections([
          dimEntry('+3.500', bbox(100, 100, 120, 30)),
          dimEntry('±0.000', bbox(100, 140, 120, 30)),
          dimEntry('3.000', bbox(100, 180, 120, 30)),
          textEntry('LIHAT DETAIL A', bbox(100, 700, 150, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 4,
      title: 'JADWAL KUSEN',
      text: 'jadwal kusen pintu jendela daun pintu',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'DOOR_WINDOW_SCHEDULE',
      stub: {
        survey: detections([
          tableEntry('D1 | Pintu Utama | 90 x 210 | Kayu Jati | Kusen Kayu', bbox(100, 100, 500, 20)),
          tableEntry('J1 | Jendela | 120 x 150 | Kaca Bening | Kusen Aluminium', bbox(100, 130, 500, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 5,
      title: 'DETAIL A',
      text: 'detail a kusen pintu d1 skala 1:10',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'DETAIL',
      stub: {
        survey: detections([
          dimEntry('900', bbox(100, 100, 80, 30)),
          textEntry('LIHAT POTONGAN A-A', bbox(100, 700, 180, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 2, originalText: '7.000', value: 7000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '5.000', value: 5000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '3.500', value: 3500, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '2.500', value: 2500, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '3.000', value: 3000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '7.000', value: 7000, unit: 'mm', kind: 'OVERALL' },
      { page: 2, originalText: '3.500', value: 3500, unit: 'mm', kind: 'CHAINED' },
      { page: 3, originalText: '+3.500', value: 3500, unit: 'mm', kind: 'ELEVATION' },
      { page: 3, originalText: '±0.000', value: 0, unit: 'mm', kind: 'ELEVATION' },
      { page: 3, originalText: '3.000', value: 3000, unit: 'mm', kind: 'LINEAR' },
      { page: 5, originalText: '900', value: 900, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [
      { mark: 'D1', widthMm: 900, heightMm: 2100, quantity: 2, schedulePage: 4 },
      { mark: 'D2', widthMm: null, heightMm: null, quantity: 1, schedulePage: null },
      { mark: 'J1', widthMm: 1200, heightMm: 1500, quantity: 1, schedulePage: 4 },
    ],
    // I11 Stage 4 (E16): one exterior wall (dims from its label text;
    // no schedule row exists for a wall, so it stays NEEDS_REVIEW).
    elements: [
      { page: 2, category: 'WALL', elementType: 'wall', mark: null, quantity: 1, lengthMm: 7000, widthMm: null, heightMm: 3500, thicknessMm: null, diameterMm: null, schedulePage: null },
    ],
    // I11 Stage 4 (E17): wall net area = 7.000×3.500 gross (24.5 m²)
    // − D1×2 (0.9×2.1 = 1.89 each) − J1 (1.2×1.5 = 1.8) = 18.92 m².
    // D2 (no dims) is skipped with an assumption, not deducted. This
    // is a single-exterior-wall fixture simplification: real wall
    // attribution needs wall geometry (which wall an opening sits in)
    // that the vision read does not evidence.
    quantities: [
      { page: 2, kind: 'AREA', unit: 'm2', quantity: 18.92, ref: 'wall' },
      { page: 2, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'wall' },
    ],
    references: [
      { fromPage: 2, toRef: 'DETAIL A', status: 'PROBABLE' },
      { fromPage: 3, toRef: 'DETAIL A', status: 'PROBABLE' },
      { fromPage: 5, toRef: 'POTONGAN A-A', status: 'PROBABLE' },
      { fromPage: 2, toRef: 'D1', status: 'CONFIRMED' },
      { fromPage: 2, toRef: 'J1', status: 'CONFIRMED' },
    ],
    scales: [
      { page: 1, statedScale: null },
      { page: 2, statedScale: '1:100' },
      { page: 3, statedScale: null },
      { page: 4, statedScale: null },
      { page: 5, statedScale: '1:10' },
    ],
    calls: 6,
    budgetHit: false,
  },
};

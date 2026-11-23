/**
 * I10a benchmark fixture — BUILDING (synthetic).
 *
 * A 3-storey building: site plan + two floor plans + structural plan +
 * structural schedule + door/window schedule + section. Tests multi-floor
 * opening aggregation (D1 on Lt 1 and Lt 2) and — since I11 Stage 4
 * (E16/E17) — structural ELEMENT records: the column/beam symbols
 * ('Kolom K1', 'Balok B1') that I8 skipped
 * ('structural-symbol-no-record-type') are now records linked to the p5
 * schedule, with cross-section quantities. (The same K1 mark appears on
 * p2 AND p4 — the same physical column shown twice — so elements are
 * scored PER PAGE, not aggregated by mark: see fixtures/types.ts E19.)
 *
 * Hand-derived call count (first run): p1 1 (survey only) + p2 2 + p3 2
 * (DETAIL: openings unresolved at page time — the schedule is on p6) +
 * p4 2 (DETAIL: I11 Stage 4 — K1/B1 unresolved at page time) + p5 2 +
 * p6 2 (schedule pages: nothing validated) + p7 1 = 12.
 */

import type { BenchmarkFixture } from './types';
import {
  bbox,
  detections,
  dimEntry,
  emptyDetections,
  legendEntry,
  symbolEntry,
  tableEntry,
  textEntry,
} from './stub';

export const BUILDING_FIXTURE: BenchmarkFixture = {
  id: 'building-3lantai',
  tier: 'synthetic',
  type: 'building',
  title: 'Gedung 3 lantai — denah Lt 1–2 + struktur + jadwal + potongan',
  notes:
    'Structural symbols (K1/B1) are ELEMENT records since I11 Stage 4 ' +
    '(E16), linked to the p5 schedule in phase 2. D1 totals 2 across ' +
    'floors (1 + 1); J1 totals 3 (2 on Lt 1 + 1 on Lt 2). K1 appears ' +
    'on p2 AND p4 (same column, two views) — scored per page, not ' +
    'summed.',
  pages: [
    {
      page: 1,
      title: 'DENAH SITUASI',
      text: 'denah situasi batas tanah gsb jalan akses',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SITE_PLAN',
      stub: {
        survey: detections([
          legendEntry('SKALA 1:500', bbox(800, 750, 120, 20)),
          textEntry('GEDUNG 3 LANTAI', bbox(100, 100, 200, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 2,
      title: 'DENAH LANTAI 1',
      text: 'denah lantai 1 lobi ruang rapat tangga',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'FLOOR_PLAN',
      stub: {
        survey: detections([
          dimEntry('12.000', bbox(100, 60, 200, 30)),
          dimEntry('8.000', bbox(100, 100, 200, 30)),
          symbolEntry('D1', 'Pintu D1', bbox(300, 300, 60, 90)),
          symbolEntry('J1', 'Jendela J1', bbox(600, 300, 90, 60)),
          symbolEntry('J1', 'Jendela J1', bbox(600, 500, 90, 60)),
          // I11 Stage 4 (E16): structural symbol → column ELEMENT
          // record (keyword path; links to the p5 schedule in phase 2).
          symbolEntry('K1', 'Kolom K1', bbox(200, 200, 40, 40)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 3,
      title: 'DENAH LANTAI 2',
      text: 'denah lantai 2 ruang kerja ruang rapat',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'FLOOR_PLAN',
      stub: {
        survey: detections([
          dimEntry('12.000', bbox(100, 60, 200, 30)),
          dimEntry('8.000', bbox(100, 100, 200, 30)),
          symbolEntry('D1', 'Pintu D1', bbox(300, 300, 60, 90)),
          symbolEntry('J1', 'Jendela J1', bbox(600, 300, 90, 60)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 4,
      title: 'DENAH STRUKTUR LANTAI 1',
      text: 'denah struktur kolom balok pelat pembesian',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'STRUCTURAL',
      stub: {
        survey: detections([
          dimEntry('15/30', bbox(100, 100, 120, 30)),
          dimEntry('Ø12', bbox(300, 100, 80, 30)),
          // Rebar spacing is a specification, not a dimension — skipped.
          dimEntry('D12-150', bbox(500, 100, 120, 30)),
          // I11 Stage 4 (E16): structural symbols → ELEMENT records.
          symbolEntry('K1', 'Kolom K1', bbox(200, 300, 40, 40)),
          symbolEntry('B1', 'Balok B1', bbox(400, 300, 80, 30)),
        ]),
        detail: emptyDetections(),
      },
      // I11 Stage 4 (E16): K1/B1 are UNRESOLVED at page time (schedule
      // on p5) → DETAIL escalates.
      expectDetailPass: true,
    },
    {
      page: 5,
      title: 'JADWAL PEMBESIAN',
      text: 'jadwal pembesian kolom balok tulangan',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'STRUCTURAL_SCHEDULE',
      stub: {
        survey: detections([
          tableEntry('K1 | Kolom | 15/30 | 4D16', bbox(100, 100, 400, 20)),
          tableEntry('B1 | Balok | 20/40 | 2D16', bbox(100, 130, 400, 20)),
          tableEntry('S1 | Pelat | 12 cm', bbox(100, 160, 400, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 6,
      title: 'JADWAL KUSEN',
      text: 'jadwal kusen pintu jendela',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'DOOR_WINDOW_SCHEDULE',
      stub: {
        survey: detections([
          tableEntry('D1 | Pintu | 90 x 210 | Kayu', bbox(100, 100, 400, 20)),
          tableEntry('J1 | Jendela | 120 x 150 | Kaca', bbox(100, 130, 400, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 7,
      title: 'POTONGAN B-B',
      text: 'potongan b-b +7.500 ±0.000',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SECTION',
      stub: {
        survey: detections([
          dimEntry('+7.500', bbox(100, 100, 120, 30)),
          dimEntry('±0.000', bbox(100, 140, 120, 30)),
          dimEntry('3.500', bbox(100, 180, 120, 30)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 2, originalText: '12.000', value: 12000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '8.000', value: 8000, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '12.000', value: 12000, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '8.000', value: 8000, unit: 'mm', kind: 'LINEAR' },
      { page: 4, originalText: '15/30', value: 15, unit: 'cm', kind: 'LINEAR' },
      { page: 4, originalText: '15/30', value: 30, unit: 'cm', kind: 'LINEAR' },
      { page: 4, originalText: 'Ø12', value: 12, unit: 'mm', kind: 'DIAMETER' },
      { page: 7, originalText: '+7.500', value: 7500, unit: 'mm', kind: 'ELEVATION' },
      { page: 7, originalText: '±0.000', value: 0, unit: 'mm', kind: 'ELEVATION' },
      { page: 7, originalText: '3.500', value: 3500, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [
      { mark: 'D1', widthMm: 900, heightMm: 2100, quantity: 2, schedulePage: 6 },
      { mark: 'J1', widthMm: 1200, heightMm: 1500, quantity: 3, schedulePage: 6 },
    ],
    // I11 Stage 4 (E16): structural elements, per page. K1 appears on
    // p2 (floor plan) AND p4 (structural plan) — same column, two
    // views, two records (E19: not summed).
    elements: [
      { page: 2, category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 1, lengthMm: null, widthMm: 150, heightMm: 300, thicknessMm: null, diameterMm: null, schedulePage: 5 },
      { page: 4, category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 1, lengthMm: null, widthMm: 150, heightMm: 300, thicknessMm: null, diameterMm: null, schedulePage: 5 },
      { page: 4, category: 'STRUCTURAL', elementType: 'beam', mark: 'B1', quantity: 1, lengthMm: null, widthMm: 200, heightMm: 400, thicknessMm: null, diameterMm: null, schedulePage: 5 },
    ],
    // I11 Stage 4 (E17): K1 0.15×0.30 = 0.045 m², B1 0.20×0.40 =
    // 0.08 m² cross-section areas (per page, like the records).
    quantities: [
      { page: 2, kind: 'AREA', unit: 'm2', quantity: 0.045, ref: 'K1' },
      { page: 2, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'K1' },
      { page: 4, kind: 'AREA', unit: 'm2', quantity: 0.045, ref: 'K1' },
      { page: 4, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'K1' },
      { page: 4, kind: 'AREA', unit: 'm2', quantity: 0.08, ref: 'B1' },
      { page: 4, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'B1' },
    ],
    references: [
      { fromPage: 2, toRef: 'D1', status: 'CONFIRMED' },
      { fromPage: 3, toRef: 'D1', status: 'CONFIRMED' },
      { fromPage: 2, toRef: 'J1', status: 'CONFIRMED' },
      { fromPage: 3, toRef: 'J1', status: 'CONFIRMED' },
    ],
    scales: [
      { page: 1, statedScale: '1:500' },
      { page: 2, statedScale: null },
      { page: 3, statedScale: null },
      { page: 4, statedScale: null },
      { page: 5, statedScale: null },
      { page: 6, statedScale: null },
      { page: 7, statedScale: null },
    ],
    calls: 12,
    budgetHit: false,
  },
  notMeasured: [
    'Cross-view element identity (E19): K1 on p2 and p4 is the same physical column, but the pipeline records it twice (once per view) — no doc-level element dedup exists yet, so per-page quantities must not be summed across views.',
    'Rebar quantities (bar counts, bending schedules): no rebar quantity derivation.',
  ],
};

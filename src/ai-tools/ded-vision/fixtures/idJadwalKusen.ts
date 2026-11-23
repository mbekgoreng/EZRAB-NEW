/**
 * I11 Stage 3 benchmark fixture — ID-JADWAL-KUSEN (synthetic).
 *
 * A dedicated Indonesian door/window schedule document: denah (plan
 * symbols) + jadwal kusen (schedule table) + detail kusen. It measures
 * what the KRS internet fixture cannot: cross-page schedule LINKING
 * (plan marks → table rows → dimensions + CONFIRMED references) with
 * Indonesian marks P1 (pintu), PJ1 (pintu-jendela), J1 (jendela), V1
 * (ventilasi), BV1 (bouvenlicht). The house/building fixtures carry
 * only 2-row schedules on one page each; this family is the full
 * 5-mark, 3-page schedule workflow.
 *
 * Ground truth hand-derived from the I1–I9 contracts (see the per-page
 * notes). The stub survey responses simulate a PERFECT model read —
 * they measure deterministic pipeline fidelity, never live-model
 * quality.
 *
 * Hand-derived call count (first run): p1 2 (survey + DETAIL: openings
 * unresolved at page time — the schedule is on p2, not yet run) +
 * p2 2 (survey + DETAIL: schedule pages validate nothing
 * record-bearing) + p3 1 (dims validate) = 5.
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

export const ID_JADWAL_KUSEN_FIXTURE: BenchmarkFixture = {
  id: 'id-jadwal-kusen',
  tier: 'synthetic',
  type: 'schedule',
  title: 'Jadwal Kusen — denah + jadwal + detail (mark P1/PJ1/J1/V1/BV1)',
  notes:
    'Indonesian door/window schedule workflow: p1 denah carries 9 plan ' +
    'symbols (P1 ×2, PJ1 ×1, J1 ×3, V1 ×2, BV1 ×1); p2 jadwal kusen ' +
    'carries 5 table rows with sizes in cm; p3 detail kusen P1 carries ' +
    'bare-mm detail dims (792/2100, as on the KRS detail sheets) plus ' +
    'one bare 44 mm frame member (E21 — dimension-evident by adjacency ' +
    'to the parsed 792). ' +
    'Phase 2 links all five marks to their rows (CONFIRMED refs). BV1 ' +
    '(bouvenlicht) has no opening keyword in OPENING_KEYWORDS, but its ' +
    'mark-like label makes it an opening candidate (elementType ' +
    'other-opening) — the schedule row supplies its dims.',
  notMeasured: [
    'Material/frame/glazing hints (Kayu Jati, Kusen Aluminium, …) are parsed into schedule entries but not asserted as expected values.',
    'E21 — bare sub-100 integers are dimensions ONLY in a dimension-evident context (I11 Stage 4: a dimension word in the label, or a parsed dimension nearby). One 44 is stubbed on p3, adjacent to the parsed 792, and IS expected; a bare 44 with no evidence stays null (see the dim-negatives-zero-fp guard on the negatives fixture).',
    'bbox IoU is not asserted for this fixture (no expectedBboxes — the schedule workflow is measured on marks, counts, dims, and refs).',
    'QTO counts follow the opening quantities (COUNT records) — verified by the qto-exact guard, not listed as separate expectations.',
  ],
  pages: [
    {
      page: 1,
      title: 'DENAH LANTAI 1',
      text: 'denah lantai 1 ruang tamu kamar tidur dapur skala 1:100',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'FLOOR_PLAN',
      stub: {
        survey: detections([
          dimEntry('7.000', bbox(100, 60, 200, 30)),
          dimEntry('5.000', bbox(100, 100, 200, 30)),
          symbolEntry('P1', 'Pintu P1', bbox(200, 250, 60, 90)),
          symbolEntry('P1', 'Pintu P1', bbox(700, 250, 60, 90)),
          symbolEntry('PJ1', 'Pintu Jendela PJ1', bbox(450, 250, 80, 90)),
          symbolEntry('J1', 'Jendela J1', bbox(200, 450, 90, 60)),
          symbolEntry('J1', 'Jendela J1', bbox(500, 450, 90, 60)),
          symbolEntry('J1', 'Jendela J1', bbox(800, 450, 90, 60)),
          symbolEntry('V1', 'Ventilasi V1', bbox(300, 600, 60, 60)),
          symbolEntry('V1', 'Ventilasi V1', bbox(600, 600, 60, 60)),
          symbolEntry('BV1', 'Bouvenlicht BV1', bbox(850, 600, 50, 40)),
          legendEntry('SKALA 1:100', bbox(800, 750, 120, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 2,
      title: 'JADWAL KUSEN',
      text: 'jadwal kusen pintu jendela daun pintu daun jendela',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'DOOR_WINDOW_SCHEDULE',
      stub: {
        survey: detections([
          tableEntry('P1 | Pintu Utama | 90 x 210 | Kayu Jati | Kusen Kayu', bbox(100, 100, 500, 20)),
          tableEntry('PJ1 | Pintu Jendela | 80 x 210 | Kayu Kamper | Kusen Aluminium', bbox(100, 130, 500, 20)),
          tableEntry('J1 | Jendela Geser | 120 x 150 | Kaca Bening | Kusen Aluminium', bbox(100, 160, 500, 20)),
          tableEntry('V1 | Ventilasi | 60 x 60 | Kaca Nako | Kusen Aluminium', bbox(100, 190, 500, 20)),
          tableEntry('BV1 | Bouvenlicht | 40 x 60 | Kaca Bening | Kusen Kayu', bbox(100, 220, 500, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 3,
      title: 'DETAIL KUSEN P1',
      text: 'detail kusen p1 skala 1:10',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'DETAIL',
      stub: {
        survey: detections([
          // I11 Stage 4 (E21): the bare 44 mm frame member IS stubbed
          // — its bbox sits 20 px from the parsed 792 (gap ≤ 10% of
          // page width), so the dimension-evident context rule reads
          // it as 44 mm at NEEDS_REVIEW.
          dimEntry('792', bbox(200, 100, 80, 30)),
          dimEntry('44', bbox(300, 100, 60, 30)),
          dimEntry('2100', bbox(100, 150, 80, 30)),
          textEntry('LIHAT JADWAL KUSEN', bbox(100, 700, 200, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 1, originalText: '7.000', value: 7000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '5.000', value: 5000, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '792', value: 792, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '44', value: 44, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '2100', value: 2100, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [
      { mark: 'P1', widthMm: 900, heightMm: 2100, quantity: 2, schedulePage: 2 },
      { mark: 'PJ1', widthMm: 800, heightMm: 2100, quantity: 1, schedulePage: 2 },
      { mark: 'J1', widthMm: 1200, heightMm: 1500, quantity: 3, schedulePage: 2 },
      { mark: 'V1', widthMm: 600, heightMm: 600, quantity: 2, schedulePage: 2 },
      { mark: 'BV1', widthMm: 400, heightMm: 600, quantity: 1, schedulePage: 2 },
    ],
    references: [
      { fromPage: 1, toRef: 'P1', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'PJ1', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'J1', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'V1', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'BV1', status: 'CONFIRMED' },
      { fromPage: 3, toRef: 'JADWAL KUSEN', status: 'PROBABLE' },
    ],
    scales: [
      { page: 1, statedScale: '1:100' },
      { page: 2, statedScale: null },
      { page: 3, statedScale: '1:10' },
    ],
    calls: 5,
    budgetHit: false,
  },
};

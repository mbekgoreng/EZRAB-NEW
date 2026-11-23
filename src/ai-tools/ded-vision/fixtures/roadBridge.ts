/**
 * I10a benchmark fixture — ROAD + BRIDGE (synthetic).
 *
 * Site plan + road alignment sheets + cross-section. Tests the CIVIL
 * TAXONOMY GAP: the 13-class taxonomy has no road/bridge/linear-works
 * class. A sheet titled 'ALINEMEN HORISONTAL' (no 'denah') correctly
 * lands UNKNOWN; a sheet titled 'DENAH ALINEMEN JALAN' is pulled to
 * FLOOR_PLAN by the generic 'denah' anchor — a misclassification the
 * benchmark records as a finding. Also tests chainage rejection
 * ('STA 0+000' is not a dimension).
 *
 * Hand-derived call count (first run): p1 1 (survey) + p2 1 (UNKNOWN →
 * survey) + p3 1 (FLOOR_PLAN 'full', dims all HIGH → no DETAIL) +
 * p4 1 = 4.
 *
 * I11 Stage 4 (E16): p1 gains road + bridge objects (CIVIL records,
 * COUNT only — no area/volume: a road/bridge section is not L×H).
 * Calls are unchanged — SITE_PLAN is 'survey' policy, never DETAIL.
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

export const ROAD_BRIDGE_FIXTURE: BenchmarkFixture = {
  id: 'road-bridge',
  tier: 'synthetic',
  type: 'road-bridge',
  title: 'Jalan + jembatan — situasi + alinement + potongan melintang',
  notes:
    'Expected class for p2/p3 is UNKNOWN (no civil class exists). p3 is ' +
    'the known trap: the generic "denah" anchor pulls "DENAH ALINEMEN ' +
    'JALAN" to FLOOR_PLAN. Chainage "STA 0+000" must never become a ' +
    'dimension record.',
  pages: [
    {
      page: 1,
      title: 'DENAH SITUASI',
      text: 'denah situasi jalan akses jembatan sungai',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SITE_PLAN',
      stub: {
        survey: detections([
          legendEntry('SKALA 1:1000', bbox(800, 750, 120, 20)),
          // I11 Stage 4 (E16): CIVIL objects — no dims on the site
          // plan, so the records are UNRESOLVED with COUNT only.
          objectEntry('JALAN AKSES', 'Jalan akses', bbox(100, 300, 500, 40)),
          objectEntry('JEMBATAN', 'Jembatan', bbox(600, 300, 150, 40)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 2,
      title: 'ALINEMEN HORISONTAL',
      text: 'alinemen horisontal jalan sta 0+000 sta 1+200',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      // I10b E12 — CIVIL class added; the old UNKNOWN expectation was
      // conditioned on "no civil class exists" (see notMeasured).
      expectedClass: 'CIVIL',
      stub: {
        survey: detections([
          dimEntry('7.000', bbox(100, 100, 120, 30)),
          dimEntry('12.000', bbox(300, 100, 120, 30)),
          // Chainage as a dimension proposal: must be rejected.
          dimEntry('STA 0+000', bbox(500, 100, 150, 30)),
          textEntry('STA 0+000', bbox(100, 300, 150, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 3,
      title: 'DENAH ALINEMEN JALAN',
      text: 'denah alinement jalan jembatan sta',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      // I10b E11/E12 — CIVIL, not FLOOR_PLAN: the `denah alinement`
      // anchor outranks the generic `denah` anchor.
      expectedClass: 'CIVIL',
      stub: {
        survey: detections([
          dimEntry('9.000', bbox(100, 100, 120, 30)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 4,
      title: 'POTONGAN MELINTANG',
      text: 'potongan melintang jalan badan jalan bahu',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SECTION',
      stub: {
        survey: detections([
          dimEntry('7.000', bbox(100, 100, 120, 30)),
          dimEntry('1.500', bbox(300, 100, 120, 30)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 2, originalText: '7.000', value: 7000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '12.000', value: 12000, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '9.000', value: 9000, unit: 'mm', kind: 'LINEAR' },
      { page: 4, originalText: '7.000', value: 7000, unit: 'mm', kind: 'LINEAR' },
      { page: 4, originalText: '1.500', value: 1500, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [],
    // I11 Stage 4 (E16): road + bridge CIVIL records (no dims).
    elements: [
      { page: 1, category: 'CIVIL', elementType: 'road', mark: null, quantity: 1, lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null, diameterMm: null, schedulePage: null },
      { page: 1, category: 'CIVIL', elementType: 'bridge', mark: null, quantity: 1, lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null, diameterMm: null, schedulePage: null },
    ],
    quantities: [
      { page: 1, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'road' },
      { page: 1, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'bridge' },
    ],
    references: [],
    scales: [
      { page: 1, statedScale: '1:1000' },
      { page: 2, statedScale: null },
      { page: 3, statedScale: null },
      { page: 4, statedScale: null },
    ],
    calls: 4,
    budgetHit: false,
  },
  notMeasured: [
    'Chainage / stationing as structured data: no chainage record type.',
    'Road/bridge geometry (length, width, section): CIVIL records exist since I11 Stage 4, but no dims are evidenced on the site plan, so no area/volume is derived.',
    // I10b E12 — the CIVIL class now exists; p2/p3 classify CIVIL and
    // are measured (the old note "no civil class exists" is retired).
  ],
};

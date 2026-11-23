/**
 * I10a benchmark fixture — STRUCTURAL + REBAR (synthetic).
 *
 * Structural plan + foundation plan + rebar schedule. Tests section
 * pairs (15/30), rebar diameters (Ø12, D16), rebar spacing rejection
 * (D12-150 is a specification, not a dimension), and the 3-dimension
 * schedule row (F1 100×100×40 — I11 Stage 4 (E15) keeps the thickness
 * 400 mm; the I8 limitation that lost it is retired).
 *
 * I11 Stage 4 (E16/E17): the structural symbols (K1/B1/F1) are now
 * ELEMENT records (linked to the p3 schedule in phase 2) with
 * quantities — K1/B1 cross-section areas, F1 footing volume 0.4 m³.
 * At page time they are UNRESOLVED (the schedule is on p3), so p1/p2
 * now escalate to DETAIL (calls 4 → 6).
 *
 * Hand-derived call count (first run): p1 2 + p2 2 + p3 2 (schedule
 * page: nothing validated) = 6.
 */

import type { BenchmarkFixture } from './types';
import {
  bbox,
  detections,
  dimEntry,
  emptyDetections,
  symbolEntry,
  tableEntry,
} from './stub';

export const STRUCTURAL_FIXTURE: BenchmarkFixture = {
  id: 'structural-rebar',
  tier: 'synthetic',
  type: 'structural-rebar',
  title: 'Struktur + pembesian — denah struktur + pondasi + jadwal pembesian',
  notes:
    'No openings exist in this drawing set (all symbols are structural ' +
    'elements). The F1 row (100 x 100 x 40) keeps all three values ' +
    '(1000×1000×400 mm) since I11 Stage 4 (E15). K1/B1 link to the p3 ' +
    'schedule in phase 2; at page time they are UNRESOLVED, so p1/p2 ' +
    'escalate to DETAIL.',
  pages: [
    {
      page: 1,
      title: 'DENAH STRUKTUR',
      text: 'denah struktur kolom balok sloof pembesian tulangan',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'STRUCTURAL',
      stub: {
        survey: detections([
          dimEntry('15/30', bbox(100, 100, 120, 30)),
          dimEntry('20/40', bbox(300, 100, 120, 30)),
          dimEntry('Ø12', bbox(500, 100, 80, 30)),
          dimEntry('D16', bbox(600, 100, 80, 30)),
          dimEntry('D12-150', bbox(700, 100, 120, 30)),
          dimEntry('3.500', bbox(100, 200, 120, 30)),
          symbolEntry('K1', 'Kolom K1', bbox(200, 300, 40, 40)),
          symbolEntry('B1', 'Balok B1', bbox(400, 300, 80, 30)),
        ]),
        detail: emptyDetections(),
      },
      // I11 Stage 4 (E16): K1/B1 are UNRESOLVED at page time (schedule
      // on p3) → DETAIL escalates.
      expectDetailPass: true,
    },
    {
      page: 2,
      title: 'DENAH PONDASI',
      text: 'denah pondasi footplat tiang pancang',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'FOUNDATION',
      stub: {
        survey: detections([
          dimEntry('1.000 × 1.000', bbox(100, 100, 200, 30)),
          dimEntry('2.500', bbox(100, 200, 120, 30)),
          symbolEntry('F1', 'Footplat F1', bbox(300, 300, 60, 60)),
        ]),
        detail: emptyDetections(),
      },
      // I11 Stage 4 (E16): F1 is UNRESOLVED at page time (schedule on
      // p3) → DETAIL escalates.
      expectDetailPass: true,
    },
    {
      page: 3,
      title: 'JADWAL PEMBESIAN',
      text: 'jadwal pembesian kolom balok pondasi tulangan',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'STRUCTURAL_SCHEDULE',
      stub: {
        survey: detections([
          tableEntry('K1 | Kolom | 15/30 | 4D16', bbox(100, 100, 400, 20)),
          tableEntry('B1 | Balok | 20/40 | 2D16 + 2D13', bbox(100, 130, 400, 20)),
          tableEntry('F1 | Footplat | 100 x 100 x 40', bbox(100, 160, 400, 20)),
          tableEntry('S1 | Pelat | 12 cm', bbox(100, 190, 400, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
  ],
  expected: {
    dimensions: [
      { page: 1, originalText: '15/30', value: 15, unit: 'cm', kind: 'LINEAR' },
      { page: 1, originalText: '15/30', value: 30, unit: 'cm', kind: 'LINEAR' },
      { page: 1, originalText: '20/40', value: 20, unit: 'cm', kind: 'LINEAR' },
      { page: 1, originalText: '20/40', value: 40, unit: 'cm', kind: 'LINEAR' },
      { page: 1, originalText: 'Ø12', value: 12, unit: 'mm', kind: 'DIAMETER' },
      { page: 1, originalText: 'D16', value: 16, unit: 'mm', kind: 'DIAMETER' },
      { page: 1, originalText: '3.500', value: 3500, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '1.000', value: 1000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '1.000', value: 1000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '2.500', value: 2500, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [],
    // I11 Stage 4 (E16): structural elements, per page (K1/B1 link to
    // the p3 schedule in phase 2; S1 has no symbol on the plans, so no
    // S1 record exists — a schedule row alone is not an element).
    elements: [
      { page: 1, category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 1, lengthMm: null, widthMm: 150, heightMm: 300, thicknessMm: null, diameterMm: null, schedulePage: 3 },
      { page: 1, category: 'STRUCTURAL', elementType: 'beam', mark: 'B1', quantity: 1, lengthMm: null, widthMm: 200, heightMm: 400, thicknessMm: null, diameterMm: null, schedulePage: 3 },
      { page: 2, category: 'STRUCTURAL', elementType: 'foundation', mark: 'F1', quantity: 1, lengthMm: null, widthMm: 1000, heightMm: 1000, thicknessMm: 400, diameterMm: null, schedulePage: 3 },
    ],
    // I11 Stage 4 (E17): K1 0.15×0.30 = 0.045 m², B1 0.20×0.40 =
    // 0.08 m² cross-section areas; F1 1.00×1.00×0.40 = 0.4 m³ volume.
    quantities: [
      { page: 1, kind: 'AREA', unit: 'm2', quantity: 0.045, ref: 'K1' },
      { page: 1, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'K1' },
      { page: 1, kind: 'AREA', unit: 'm2', quantity: 0.08, ref: 'B1' },
      { page: 1, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'B1' },
      { page: 2, kind: 'VOLUME', unit: 'm3', quantity: 0.4, ref: 'F1' },
      { page: 2, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'F1' },
    ],
    references: [],
    scales: [
      { page: 1, statedScale: null },
      { page: 2, statedScale: null },
      { page: 3, statedScale: null },
    ],
    calls: 6,
    budgetHit: false,
  },
  notMeasured: [
    'Rebar quantities (bar counts, bending schedules, kg): no rebar quantity derivation — a rebar element carries its diameter only.',
    'S1 slab: no symbol on the plans, so no element record — only the schedule row exists.',
  ],
};

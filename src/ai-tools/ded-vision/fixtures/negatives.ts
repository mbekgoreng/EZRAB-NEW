/**
 * I10a benchmark fixture — NEGATIVES (synthetic).
 *
 * The fixture that must produce (almost) NOTHING valid:
 * - p1: a WORK schedule ('JADWAL KERJA PROYEK') — bare 'jadwal' is not a
 *   drawing-schedule signal → UNKNOWN, zero records.
 * - p2: every dimension proposal is a negative (grid labels, detail ids,
 *   drawing numbers, a year, a bare small number, a mark, rebar spacing,
 *   a scale). Ground truth: ZERO dimension records. ('2026' does NOT
 *   parse: the E1 year guard kills it — the I10a note calling it an
 *   expected false positive is stale. The bare '12' stays null under
 *   E21: no dimension word in its label, and no parsed dimension
 *   anywhere on the page for adjacency — the guard case.) p2 also
 *   carries the D1 symbol whose schedule rows conflict (p4 vs p5), so
 *   the doc-level conflict surfaces on the D1 SCHEDULE ref, and the K1
 *   'Kolom K1' symbol — I11 Stage 4 (E16): a column ELEMENT record
 *   (keyword path, any page class), not a skip.
 * - p3: a scanned page with no text at all → OCR returns zero spans →
 *   UNKNOWN, UNRESOLVED, zero records.
 * - p4/p5: two schedule pages stating DIFFERENT sizes for D1 (90×210 vs
 *   100×210) → the D1 SCHEDULE ref must be CONTRADICTORY with a detail
 *   naming both claims; the link itself keeps the FIRST row (900×2100).
 *
 * Hand-derived call count (first run): p1 1 + p2 2 (DETAIL: D1
 * unresolved at page time) + p3 1 (OCR, zero spans) + p4 2 + p5 2
 * (schedule pages: nothing validated) = 8.
 */

import type { BenchmarkFixture } from './types';
import {
  bbox,
  detections,
  dimEntry,
  emptyDetections,
  emptyOcr,
  legendEntry,
  symbolEntry,
  tableEntry,
  textEntry,
} from './stub';

export const NEGATIVES_FIXTURE: BenchmarkFixture = {
  id: 'negatives',
  tier: 'synthetic',
  type: 'negative',
  title: 'Negatif — jadwal kerja + semua-negatif + halaman kosong + konflik',
  notes:
    'Zero dimension records on p2: the E1 year guard kills "2026" and ' +
    'E21 keeps the bare "12" null (no dimension evidence on the page). ' +
    'The D1 link keeps the FIRST schedule row (900×2100); the conflict ' +
    'is surfaced on the reference, never silently resolved. K1 is a ' +
    'column element record (I11 Stage 4, E16).',
  pages: [
    {
      page: 1,
      title: 'JADWAL KERJA PROYEK',
      text: 'jadwal kerja minggu 1 2 3 progres pekerjaan',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'UNKNOWN',
      stub: {
        survey: emptyDetections(),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 2,
      title: 'DENAH LANTAI 1',
      text: 'denah lantai 1 arsitektur',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'FLOOR_PLAN',
      stub: {
        survey: detections([
          dimEntry('A-1', bbox(100, 100, 60, 20)),
          dimEntry('B/3', bbox(200, 100, 60, 20)),
          dimEntry('DET-3', bbox(300, 100, 60, 20)),
          dimEntry('A-101', bbox(400, 100, 60, 20)),
          dimEntry('2026', bbox(500, 100, 60, 20)),
          dimEntry('12', bbox(600, 100, 60, 20)),
          dimEntry('D1', bbox(700, 100, 60, 20)),
          dimEntry('D12-150', bbox(800, 100, 80, 20)),
          dimEntry('1:100', bbox(100, 140, 60, 20)),
          symbolEntry('D1', 'Pintu D1', bbox(300, 300, 60, 90)),
          symbolEntry('K1', 'Kolom K1', bbox(500, 300, 40, 40)),
          legendEntry('SKALA 1:100', bbox(800, 750, 120, 20)),
          textEntry('arsitektur', bbox(100, 700, 120, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 3,
      hasTextLayer: false,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'UNKNOWN',
      stub: {
        ocr: emptyOcr(),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 4,
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
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 5,
      title: 'JADWAL KUSEN REVISI',
      text: 'jadwal kusen revisi pintu jendela',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'DOOR_WINDOW_SCHEDULE',
      stub: {
        survey: detections([
          tableEntry('D1 | Pintu | 100 x 210 | Kayu', bbox(100, 100, 400, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
  ],
  expected: {
    dimensions: [],
    openings: [
      { mark: 'D1', widthMm: 900, heightMm: 2100, quantity: 1, schedulePage: 4 },
    ],
    // I11 Stage 4 (E16): K1 'Kolom K1' on a FLOOR_PLAN — the keyword
    // path is class-independent (only bare marks are class-gated).
    elements: [
      { page: 2, category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 1, lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null, diameterMm: null, schedulePage: null },
    ],
    quantities: [
      { page: 2, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'K1' },
    ],
    references: [
      { fromPage: 2, toRef: 'D1', status: 'CONTRADICTORY' },
    ],
    scales: [
      { page: 1, statedScale: null },
      { page: 2, statedScale: '1:100' },
      { page: 3, statedScale: null },
      { page: 4, statedScale: null },
      { page: 5, statedScale: null },
    ],
    calls: 8,
    budgetHit: false,
  },
};

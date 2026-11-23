/**
 * I10a benchmark fixture — SCANNED PDF (synthetic).
 *
 * Two scanned pages (NO text layer): a floor plan and a structural
 * plan. The OCR pass is the only read. Tests:
 * - OCR-as-survey + re-classification from OCR text (both pages start
 *   UNKNOWN — no title, no text layer — and must be re-classified from
 *   the spans: FLOOR_PLAN / STRUCTURAL).
 * - OCR dedupe: the overlapping '3.500' pair collapses to ONE dimension
 *   record; the two far-apart 'D1' marks stay TWO occurrences (qty 2).
 * - Truncation: '3.5…' (truncated) must NEVER become a dimension record
 *   (guard: completion-hallucination rate 0).
 * - Malformed spans are dropped (the span without confidence).
 * - Scale capture (I10b E19 — FIXED): 'SKALA 1:100' arrives as an OCR
 *   span and now routes to a 'legend' proposal, so the scanned page's
 *   stated scale IS captured (1:100) via the pipeline's existing legend
 *   path. (I10a: OCR spans never became legend proposals, so the scale
 *   was lost — scale null.)
 * - PHANTOM OPENINGS (p2 — I10b E8 FIXED): bare marks 'D12' (a rebar
 *   diameter) and 'K1' (a column) route to 'symbol' proposals but are
 *   now skipped as structural marks on the STRUCTURAL page (class-gated
 *   structural-mark rule) instead of becoming UNRESOLVED opening
 *   records. Expected openings for p2 is EMPTY.
 * - I11 Stage 4 (E16): the same two marks now become ELEMENT records
 *   (D12 → rebar, diameter 12, NEEDS_REVIEW; K1 → column, UNRESOLVED)
 *   instead of skips — the record type exists now. K1's UNRESOLVED
 *   status escalates p2 to DETAIL (calls 3 → 4).
 *
 * Hand-derived call count (first run): p1 2 (OCR + DETAIL — the D1
 * schedule row sits on the SAME page, and same-page rows do not link at
 * page time, so D1 is UNRESOLVED when the DETAIL decision is made; phase
 * 2 re-links it) + p2 2 (OCR + DETAIL — I11 Stage 4: the K1 element is
 * UNRESOLVED at page time) = 4.
 */

import type { BenchmarkFixture } from './types';
import {
  bbox,
  emptyDetections,
  ocrSpan,
  ocrSpans,
} from './stub';

export const SCANNED_FIXTURE: BenchmarkFixture = {
  id: 'scanned-house-structural',
  tier: 'synthetic',
  type: 'scanned',
  title: 'Scan — denah lantai 1 + denah struktur (tanpa lapisan teks)',
  notes:
    'OCR spans are the fixture-defined stub (a perfect OCR read). ' +
    'I10b: phantom openings D12/K1 on p2 are FIXED (E8 — skipped as ' +
    'structural marks on the STRUCTURAL page), and the scanned scale ' +
    '("SKALA 1:100") IS captured (E19 — OCR spans route to legend ' +
    'proposals). I11 Stage 4 (E16): D12/K1 are now ELEMENT records ' +
    '(rebar/column), not skips.',
  pages: [
    {
      page: 1,
      hasTextLayer: false,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'FLOOR_PLAN',
      stub: {
        ocr: ocrSpans([
          ocrSpan('DENAH LANTAI 1', bbox(400, 30, 200, 30), 0.95),
          ocrSpan('3.500', bbox(100, 100, 60, 20), 0.95),
          // Overlapping duplicate of the same text → deduped to one.
          ocrSpan('3.500', bbox(102, 101, 60, 20), 0.9),
          ocrSpan('7.000', bbox(100, 140, 60, 20), 0.95),
          ocrSpan('D1', bbox(300, 300, 30, 20), 0.9),
          // Same mark, far apart → a second occurrence (qty 2).
          ocrSpan('D1', bbox(700, 300, 30, 20), 0.9),
          ocrSpan('RUANG TAMU', bbox(400, 400, 120, 20), 0.88),
          ocrSpan('D1 | Pintu | 90 x 210 | Kayu', bbox(100, 600, 300, 20), 0.9),
          ocrSpan('LIHAT DETAIL A', bbox(100, 650, 150, 20), 0.9),
          // Truncated — must stay partial, never completed, never a record.
          ocrSpan('3.5…', bbox(500, 100, 40, 20), 0.9, { truncated: true }),
          ocrSpan('SKALA 1:100', bbox(800, 750, 120, 20), 0.9),
          ocrSpan('KAMAR TIDUR', bbox(400, 450, 120, 20), 0.7, { blurry: true }),
          // Malformed: no confidence → dropped by the parser.
          { text: '9.999', bbox: { x: 100, y: 200, width: 60, height: 20 } },
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 2,
      hasTextLayer: false,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'STRUCTURAL',
      stub: {
        ocr: ocrSpans([
          ocrSpan('DENAH STRUKTUR', bbox(400, 30, 200, 30), 0.95),
          ocrSpan('Ø12', bbox(100, 100, 60, 20), 0.95),
          // A rebar diameter that routes to 'symbol' — I10b E8: not
          // an opening; I11 Stage 4 (E16): a rebar ELEMENT record
          // (diameter 12 from the mark).
          ocrSpan('D12', bbox(300, 100, 40, 20), 0.9),
          // A column mark that routes to 'symbol' — I10b E8: not an
          // opening; I11 Stage 4 (E16): a column ELEMENT record.
          ocrSpan('K1', bbox(500, 100, 30, 20), 0.9),
          ocrSpan('15/30', bbox(100, 200, 60, 20), 0.95),
        ]),
        detail: emptyDetections(),
      },
      // I11 Stage 4 (E16) — the K1 element is UNRESOLVED at page
      // time (no dims, no schedule) → DETAIL escalates. (I10b E8: no
      // phantom UNRESOLVED openings remain — still true.)
      expectDetailPass: true,
    },
  ],
  expected: {
    dimensions: [
      { page: 1, originalText: '3.500', value: 3500, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '7.000', value: 7000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: 'Ø12', value: 12, unit: 'mm', kind: 'DIAMETER' },
      { page: 2, originalText: '15/30', value: 15, unit: 'cm', kind: 'LINEAR' },
      { page: 2, originalText: '15/30', value: 30, unit: 'cm', kind: 'LINEAR' },
    ],
    openings: [
      { mark: 'D1', widthMm: 900, heightMm: 2100, quantity: 2, schedulePage: 1 },
    ],
    // I11 Stage 4 (E16): D12 → rebar (diameter from the mark),
    // K1 → column (no dims). Neither has a schedule row.
    elements: [
      { page: 2, category: 'STRUCTURAL', elementType: 'rebar', mark: 'D12', quantity: 1, lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null, diameterMm: 12, schedulePage: null },
      { page: 2, category: 'STRUCTURAL', elementType: 'column', mark: 'K1', quantity: 1, lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null, diameterMm: null, schedulePage: null },
    ],
    quantities: [
      { page: 2, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'D12' },
      { page: 2, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'K1' },
    ],
    references: [
      { fromPage: 1, toRef: 'DETAIL A', status: 'UNRESOLVED' },
      // D1 links to the schedule row on its OWN page (p1) → a
      // same-page SCHEDULE ref, CONFIRMED (exact page + ref match).
      { fromPage: 1, toRef: 'D1', status: 'CONFIRMED' },
    ],
    scales: [
      // I10b E19 — the scanned page's stated scale IS captured now.
      { page: 1, statedScale: '1:100' },
      { page: 2, statedScale: null },
    ],
    ocrSpans: [
      { page: 1, text: 'DENAH LANTAI 1', textClass: 'title-block' },
      { page: 1, text: '3.500', textClass: 'dimension' },
      { page: 1, text: '7.000', textClass: 'dimension' },
      { page: 1, text: 'D1', textClass: 'mark' },
      // Second D1 occurrence (far apart — NOT a duplicate).
      { page: 1, text: 'D1', textClass: 'mark' },
      { page: 1, text: 'RUANG TAMU', textClass: 'room-label' },
      { page: 1, text: 'D1 | Pintu | 90 x 210 | Kayu', textClass: 'table-row' },
      { page: 1, text: 'LIHAT DETAIL A', textClass: 'reference' },
      { page: 1, text: '3.5…', textClass: 'dimension', truncated: true },
      { page: 1, text: 'SKALA 1:100', textClass: 'title-block' },
      { page: 1, text: 'KAMAR TIDUR', textClass: 'room-label' },
      { page: 2, text: 'DENAH STRUKTUR', textClass: 'title-block' },
      { page: 2, text: 'Ø12', textClass: 'dimension' },
      { page: 2, text: 'D12', textClass: 'mark' },
      { page: 2, text: 'K1', textClass: 'mark' },
      { page: 2, text: '15/30', textClass: 'dimension' },
    ],
    // I11 Stage 4 (E16) — p1 2 (OCR + DETAIL) + p2 2 (OCR + DETAIL) = 4.
    calls: 4,
    budgetHit: false,
  },
  notMeasured: [
    'Real OCR accuracy on real scans: the stub is a perfect OCR read; live-model OCR quality is NOT measured.',
    // I10b E19 — the scanned-page scale IS captured now (legend routing);
    // the old "never captured" limitation is retired.
  ],
};

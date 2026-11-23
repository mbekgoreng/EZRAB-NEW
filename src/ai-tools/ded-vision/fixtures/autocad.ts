/**
 * I10a benchmark fixture — AUTOCAD PDF (synthetic).
 *
 * AutoCAD-exported PDFs: duplicated text layers + fragmented dimensions.
 * Tests:
 * - Duplicated detections (same kind + label, overlapping bbox) collapse
 *   to ONE record via dedupeProposals: the '3.500' pair → one dimension;
 *   the D1 pair → quantity 1 (guard: duplicated marks never
 *   double-counted).
 * - FRAGMENTED DIMENSIONS (I10b E1 — FIXED): '3.' + '500' fragments
 *   are NOT reconstituted, but the tail is no longer a false record:
 *   '3.' is unparseable (skipped) and '500' is skipped by the
 *   fragment-continuation guard (its bbox abuts the '.'-terminated
 *   head). The ground truth lists only the real '3.500' (from the
 *   deduped pair). (I10a: '500' parsed as a bare 500 mm — a FALSE
 *   dimension record.)
 * - Same-page schedule rows do not link at page time (schedule
 *   accumulates from earlier pages only), so p1 spends a DETAIL call
 *   even though its schedule is on the same page — phase 2 re-links.
 *
 * Hand-derived call count (first run): p1 2 (survey + DETAIL: openings
 * unresolved at page time) + p2 1 = 3.
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

export const AUTOCAD_FIXTURE: BenchmarkFixture = {
  id: 'autocad-duplicated-fragmented',
  tier: 'synthetic',
  type: 'autocad',
  title: 'AutoCAD — lapisan teks ganda + dimensi terfragmentasi',
  notes:
    'I10b E1 — the "500" fragment is FIXED: the drawing means 3.500 ' +
    '(fragmented as "3." + "500"), and the fragment-continuation guard ' +
    'skips the tail instead of emitting a spurious 500 mm dimension.',
  pages: [
    {
      page: 1,
      title: 'DENAH LANTAI 1',
      text: 'denah lantai 1 ruang tamu dapur skala 1:100',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'FLOOR_PLAN',
      stub: {
        survey: detections([
          dimEntry('3.500', bbox(100, 100, 60, 20), 0.95),
          // Duplicated layer: same text, overlapping bbox → deduped.
          dimEntry('3.500', bbox(102, 101, 60, 20), 0.9),
          // Fragmented dimension: '3.' + '500' (two detections).
          dimEntry('3.', bbox(400, 100, 30, 20), 0.8),
          dimEntry('500', bbox(430, 100, 30, 20), 0.8),
          symbolEntry('D1', 'Pintu D1', bbox(300, 300, 60, 90), 0.9),
          // Duplicated mark: same mark, overlapping bbox → qty 1.
          symbolEntry('D1', 'Pintu D1', bbox(302, 301, 60, 90), 0.85),
          symbolEntry('J1', 'Jendela J1', bbox(600, 300, 90, 60), 0.9),
          tableEntry('D1 | Pintu | 90 x 210 | Kayu', bbox(100, 600, 400, 20)),
          tableEntry('J1 | Jendela | 120 x 150 | Kaca', bbox(100, 630, 400, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: true,
    },
    {
      page: 2,
      title: 'POTONGAN A-A',
      text: 'potongan a-a',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SECTION',
      stub: {
        survey: detections([
          dimEntry('+3.500', bbox(100, 100, 120, 30)),
          // Fragmented elevation: '+3.' + '500'.
          dimEntry('+3.', bbox(400, 100, 40, 30), 0.8),
          dimEntry('500', bbox(440, 100, 30, 30), 0.8),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 1, originalText: '3.500', value: 3500, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '+3.500', value: 3500, unit: 'mm', kind: 'ELEVATION' },
    ],
    openings: [
      { mark: 'D1', widthMm: 900, heightMm: 2100, quantity: 1, schedulePage: 1 },
      { mark: 'J1', widthMm: 1200, heightMm: 1500, quantity: 1, schedulePage: 1 },
    ],
    references: [
      { fromPage: 1, toRef: 'D1', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'J1', status: 'CONFIRMED' },
    ],
    scales: [
      { page: 1, statedScale: '1:100' },
      { page: 2, statedScale: null },
    ],
    calls: 3,
    budgetHit: false,
  },
};

/**
 * I10a benchmark fixture — DAM + SDA WORKS (synthetic).
 *
 * Site plan + dam section + irrigation-channel detail. Tests large
 * linear dimensions (40.000 mm), dam elevations (+12.500), and a
 * detail→section cross-reference.
 *
 * Hand-derived call count (first run): p1 1 + p2 1 + p3 1 = 3.
 *
 * I11 Stage 4 (E16): p1 gains dam-body + channel objects (SDA records,
 * COUNT only — no area/volume: a dam section is not L×H). Calls are
 * unchanged — SITE_PLAN is 'survey' policy, never DETAIL.
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

export const DAM_SDA_FIXTURE: BenchmarkFixture = {
  id: 'dam-sda',
  tier: 'synthetic',
  type: 'dam-sda',
  title: 'Bendungan + SDA — situasi + potongan bendungan + detail saluran',
  pages: [
    {
      page: 1,
      title: 'DENAH SITUASI',
      text: 'denah situasi bendungan saluran irigasi sungai',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SITE_PLAN',
      stub: {
        survey: detections([
          legendEntry('SKALA 1:500', bbox(800, 750, 120, 20)),
          // I11 Stage 4 (E16): SDA objects — no dims on the site plan,
          // so the records are UNRESOLVED with COUNT only.
          objectEntry('TUBUH BENDUNGAN', 'Tubuh bendungan', bbox(100, 300, 500, 60)),
          objectEntry('SALURAN IRIGASI', 'Saluran irigasi', bbox(100, 450, 400, 30)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 2,
      title: 'POTONGAN BENDUNGAN',
      text: 'potongan bendungan tubuh bendungan +12.500',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'SECTION',
      stub: {
        survey: detections([
          dimEntry('40.000', bbox(100, 100, 120, 30)),
          dimEntry('+12.500', bbox(300, 100, 120, 30)),
          dimEntry('3.000', bbox(500, 100, 120, 30)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
    {
      page: 3,
      title: 'DETAIL SALURAN',
      text: 'detail saluran irigasi penampang',
      hasTextLayer: true,
      widthPx: 1000,
      heightPx: 800,
      base64Length: 100000,
      expectedClass: 'DETAIL',
      stub: {
        survey: detections([
          dimEntry('1.500', bbox(100, 100, 120, 30)),
          dimEntry('2.000', bbox(300, 100, 120, 30)),
          textEntry('LIHAT POTONGAN BENDUNGAN', bbox(100, 700, 220, 20)),
        ]),
        detail: emptyDetections(),
      },
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 2, originalText: '40.000', value: 40000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '+12.500', value: 12500, unit: 'mm', kind: 'ELEVATION' },
      { page: 2, originalText: '3.000', value: 3000, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '1.500', value: 1500, unit: 'mm', kind: 'LINEAR' },
      { page: 3, originalText: '2.000', value: 2000, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [],
    // I11 Stage 4 (E16): dam-body + channel SDA records (no dims).
    elements: [
      { page: 1, category: 'SDA', elementType: 'dam-body', mark: null, quantity: 1, lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null, diameterMm: null, schedulePage: null },
      { page: 1, category: 'SDA', elementType: 'channel', mark: null, quantity: 1, lengthMm: null, widthMm: null, heightMm: null, thicknessMm: null, diameterMm: null, schedulePage: null },
    ],
    quantities: [
      { page: 1, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'dam-body' },
      { page: 1, kind: 'COUNT', unit: 'unit', quantity: 1, ref: 'channel' },
    ],
    references: [
      { fromPage: 3, toRef: 'POTONGAN BENDUNGAN', status: 'PROBABLE' },
    ],
    scales: [
      { page: 1, statedScale: '1:500' },
      { page: 2, statedScale: null },
      { page: 3, statedScale: null },
    ],
    calls: 3,
    budgetHit: false,
  },
  notMeasured: [
    'Dam-body / weir / channel geometry (section profiles, volumes): SDA records exist since I11 Stage 4, but section geometry is not derivable from L×H, so no area/volume is derived.',
  ],
};

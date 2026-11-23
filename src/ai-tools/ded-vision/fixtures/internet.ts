/**
 * DED drawing-vision benchmark — INTERNET tier (I10a + I11 Stage 3).
 *
 * Four public sample drawings, sourced 2026-11-22 under the owner
 * order 2026-10-31 (sourcing real sample DED files from the internet is
 * explicitly authorized for this benchmark). Public sources only: two
 * Indian government-approved residential plans published by
 * verified.realestate, one City of Kirkland (WA, USA) standard road
 * drawing, and (I11 Stage 3) two sheets from an Indonesian working-
 * drawing set (BANK DESAIN KRS JAWA 3, Universitas Teknologi
 * Yogyakarta). No login, no paywall, no pirated material.
 *
 * Ground truth was hand-verified against each PDF's extracted text
 * layer (`pdftotext -layout`, kept next to the PDFs in `internet/`):
 * every expected dimension / schedule row / opening count below was
 * counted or computed by hand from that text. Anything unverifiable is
 * listed in each fixture's `notMeasured` and reported as "not
 * measured", never guessed.
 *
 * PERFECT-MODEL SIMULATION: the stub survey responses return exactly
 * the dimension/schedule strings verified in the real text layer, so
 * the pipeline measurement tests deterministic fidelity on real-world
 * strings — never live-model quality. A stub detection is a fixture
 * artifact, not a claim about what a live model reads.
 *
 * Honest limits of this tier (see also BENCHMARK-I10.md):
 * - 4 files, not the 5–10 aimed for: YourHome.gov.au technical
 *   drawings returned HTTP 403 via curl (both default and browser
 *   user-agent); the Palo Alto standard-drawings set exceeds the 2 MB
 *   per-file cap; FHWA sources were 403 / oversize in an earlier
 *   round. The shortfall is recorded, not hidden.
 * - Three of the four sheets are single pages; the KRS fixture (I11)
 *   is the first multi-page internet doc (2 pages). Cross-page
 *   behaviour on real drawings is therefore measured only thinly here
 *   and mainly by the synthetic tier.
 * - Opening counts are verified against the extracted text layer
 *   only; a symbol drawn without a text label is not counted.
 */

import { readFileSync } from 'node:fs';

import type { BoundingBox } from '../types';
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
import type { BenchmarkFixture } from './types';

/** Read an extracted text layer kept next to its PDF in `internet/`. */
function internetText(fileName: string): string {
  return readFileSync(new URL(`./internet/${fileName}`, import.meta.url), 'utf8');
}

/**
 * Two-column stub-bbox grid. The pipeline dedupes proposals with
 * IoU > 0.5 + same kind + label, so every stub entry needs a bbox
 * that overlaps no other entry's bbox (adjacent rows are 26 px apart
 * with 22 px height; columns are 260 px apart with 180 px width).
 * Fits the smallest sheet in this tier (US Letter, 612×792 pts).
 */
function grid(): () => BoundingBox {
  let i = 0;
  return () => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    i += 1;
    return bbox(60 + col * 260, 60 + row * 26, 180, 22);
  };
}

// ---------------------------------------------------------------------------
// house-in-90135 — approved 2-storey residential plan, Kallakurichi, India
// ---------------------------------------------------------------------------

const box90135 = grid();

const HOUSE_IN_90135: BenchmarkFixture = {
  id: 'house-in-90135',
  tier: 'internet',
  type: 'house',
  title: 'Approved residential building plan — Kallakurichi, Tamil Nadu, India (ground + first floor, R.C.C. roof)',
  notes:
    'Composite single A2 sheet: ground + first floor plans, front elevation, ' +
    'section A-A, site plan, septic-tank plan, staircase detail, joinery ' +
    'schedule (8 rows). The sheet states "ALL DIMENSION ARE IN \'METER\'" and ' +
    '"SCALE - 1:100" (twice). Dimensions use decimal-dot metres (3.05, 14.11) ' +
    'with a few mm callouts (300 X 230 MM) and unit-suffixed values (1.5M). ' +
    'Opening counts hand-counted from the text layer, schedule rows excluded: ' +
    'D ×4, D1 ×3, MD ×2, W1 ×6, V ×2. Dimension sample: 17 callout strings ' +
    'covering the notation forms on the sheet (not an exhaustive census).',
  source: {
    name: 'Verified.RealEstate — approved plans (ppa)',
    url: 'https://files.verified.realestate/ppa/approved_plans/90135.pdf',
    license:
      'Public approved-plan record published by verified.realestate; no license ' +
      'statement on the file — used as a benchmark sample under the owner order 2026-10-31.',
    downloadedAt: '2026-11-22',
    fileName: 'house-in-90135.pdf',
    pages: 1,
    sizeBytes: 685567,
  },
  notMeasured: [
    'Classification is asserted UNKNOWN (composite sheet — no single class); the closest single class would be FLOOR_PLAN, but the sheet also carries a site plan, elevation, section, and details.',
    'Opening counts verified against the extracted text layer only; symbols drawn without a text label are not counted.',
    'W, KV, G have schedule rows but no plan symbol in the text layer — their schedule rows are not covered by the opening metrics.',
    'bbox IoU not measured — no ground-truth pixel coordinates extracted.',
    'Wall / structure / roof / QTO / AHSP not measured on this sheet — no wall-thickness schedule, no structural schedule, no quantities in the text layer.',
  ],
  pages: [
    {
      page: 1,
      title: 'PLAN SHOWING THE PROPOSED CONSTRUCTION OF R.C.C. ROOF RESIDENTIAL BUILDING',
      text: internetText('house-in-90135.txt'),
      hasTextLayer: true,
      widthPx: 1191,
      heightPx: 1684,
      base64Length: 100000,
      expectedClass: 'UNKNOWN',
      stub: {
        survey: detections([
          // Dimensions — decimal-dot metres (the sheet's dominant notation).
          dimEntry('3.05', box90135()),
          dimEntry('3.05', box90135()),
          dimEntry('14.11', box90135()),
          dimEntry('15.91', box90135()),
          dimEntry('10.68', box90135()),
          dimEntry('5.10', box90135()),
          dimEntry("6.10 [20']", box90135()),
          dimEntry('0.91', box90135()),
          dimEntry('0.15', box90135()),
          // Dimensions — mm callouts (column / plinth-beam sizes).
          dimEntry('300 X 230 MM', box90135()),
          dimEntry('230 X 325 MM', box90135()),
          // Dimensions — room-size product, label-prefixed, unit-suffixed.
          dimEntry('4.64X5.12', box90135()),
          dimEntry('TREAD - 0.25M', box90135()),
          dimEntry('RISE - 0.15M', box90135()),
          dimEntry('1.5M', box90135()),
          dimEntry('1M', box90135()),
          dimEntry('1.20 X1.20 Sq', box90135()),
          // Plan symbols (counts hand-verified from the text layer).
          symbolEntry('D', 'D DOOR', box90135()),
          symbolEntry('D', 'D DOOR', box90135()),
          symbolEntry('D', 'D DOOR', box90135()),
          symbolEntry('D', 'D DOOR', box90135()),
          symbolEntry('D1', 'D1 DOOR', box90135()),
          symbolEntry('D1', 'D1 DOOR', box90135()),
          symbolEntry('D1', 'D1 DOOR', box90135()),
          symbolEntry('MD', 'MD MAIN DOOR', box90135()),
          symbolEntry('MD', 'MD MAIN DOOR', box90135()),
          symbolEntry('W1', 'W1 WINDOW', box90135()),
          symbolEntry('W1', 'W1 WINDOW', box90135()),
          symbolEntry('W1', 'W1 WINDOW', box90135()),
          symbolEntry('W1', 'W1 WINDOW', box90135()),
          symbolEntry('W1', 'W1 WINDOW', box90135()),
          symbolEntry('W1', 'W1 WINDOW', box90135()),
          symbolEntry('V', 'V VENTILATOR', box90135()),
          symbolEntry('V', 'V VENTILATOR', box90135()),
          // Joinery schedule — verbatim rows from the JOINERY DETAILS block.
          tableEntry('D1-DOOR - 0.76X2.13', box90135()),
          tableEntry('D-DOOR - 0.91X2.13', box90135()),
          tableEntry('MD-MAIN DOOR - 1.07X2.13', box90135()),
          tableEntry('W-WINDOW - 0.91X1.21', box90135()),
          tableEntry('W1-WINDOW - 1.21X1.21', box90135()),
          tableEntry('V-VENTILATOR - 0.91X0.61', box90135()),
          tableEntry('KV-KIT-VENTILATOR - 1.21X0.91', box90135()),
          tableEntry('G-GATE - 1.07X2.13', box90135()),
          // Scale legend + section labels (visible text on the sheet).
          legendEntry('SCALE - 1:100', box90135()),
          textEntry('SECTION ON AA', box90135()),
          textEntry('SECTION - A-A', box90135()),
        ]),
        detail: emptyDetections(),
      },
      // Classified UNKNOWN (I10b E9: SITE_PLAN/FLOOR_PLAN tie) → 'survey'
      // policy → no DETAIL re-pass.
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 1, originalText: '3.05', value: 3050, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '3.05', value: 3050, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '14.11', value: 14110, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '15.91', value: 15910, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '10.68', value: 10680, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '5.10', value: 5100, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: "6.10 [20']", value: 6100, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '0.91', value: 910, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '0.15', value: 150, unit: 'mm', kind: 'LINEAR' },
      // '300 X 230 MM' splits into two records (parser-verbatim originalTexts).
      { page: 1, originalText: '300', value: 300, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '230 MM', value: 230, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '230', value: 230, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '325 MM', value: 325, unit: 'mm', kind: 'LINEAR' },
      // Room-size product: two LINEAR records from one callout.
      // I10b E3/E14 — per-piece originalTexts, per the product contract
      // pinned by the dimensions suite ("300 X 230 MM" → '300'/'230 MM'):
      // each side keeps its own text. Values/units/kinds unchanged.
      { page: 1, originalText: '4.64', value: 4640, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '5.12', value: 5120, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: 'TREAD - 0.25M', value: 250, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: 'RISE - 0.15M', value: 150, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '1.5M', value: 1.5, unit: 'm', kind: 'LINEAR' },
      { page: 1, originalText: '1M', value: 1, unit: 'm', kind: 'LINEAR' },
      { page: 1, originalText: '1.20', value: 1200, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '1.20 Sq', value: 1200, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [
      { mark: 'D', widthMm: 910, heightMm: 2130, quantity: 4, schedulePage: 1 },
      { mark: 'D1', widthMm: 760, heightMm: 2130, quantity: 3, schedulePage: 1 },
      { mark: 'MD', widthMm: 1070, heightMm: 2130, quantity: 2, schedulePage: 1 },
      { mark: 'W1', widthMm: 1210, heightMm: 1210, quantity: 6, schedulePage: 1 },
      { mark: 'V', widthMm: 910, heightMm: 610, quantity: 2, schedulePage: 1 },
    ],
    references: [
      { fromPage: 1, toRef: 'D1', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'W1', status: 'CONFIRMED' },
      // I10b E4 — phase 2 adds one SCHEDULE ref per linked opening; the
      // fixture's own opening list already expects D/MD/V linked
      // (schedulePage 1), so the references list was internally
      // inconsistent with it (written against pre-fix output, when the
      // letter-only marks were invisible). Values are derived, not
      // drawn from the sheet: every linked opening gets its ref.
      { fromPage: 1, toRef: 'D', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'MD', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'V', status: 'CONFIRMED' },
    ],
    scales: [{ page: 1, statedScale: '1:100' }],
    // I11 Stage 3, fix 3 — density tiling: this sheet's text density
    // (28,790 chars / 2.01 MP ≈ 14,354 ch/MP) exceeds the 5,000 ch/MP
    // threshold, so the 1191×1684 page tiles into a 2×3 grid = 6 survey
    // calls (was 1 whole-page call). Derived consequence of the fix,
    // not a ground-truth change: the same detections are read, per tile.
    calls: 6,
    budgetHit: false,
  },
};

// ---------------------------------------------------------------------------
// house-in-111853 — approved 2-storey residential plan, Pudukkottai, India
// ---------------------------------------------------------------------------

const box111853 = grid();

const HOUSE_IN_111853: BenchmarkFixture = {
  id: 'house-in-111853',
  tier: 'internet',
  type: 'house',
  title: 'Approved residential building plan — Pudukkottai, Tamil Nadu, India (ground + first floor, R.C.C. roof)',
  notes:
    'Composite single A4 sheet: ground + first floor plans, elevation, ' +
    'sections, staircase + column details, septic-tank details, key plan, ' +
    'joinery schedule (5 rows), legend. Dimensions in metres, decimal dots, ' +
    'including 4-decimal CAD values (8.4377, 3.0380, 0.1395). NO scale is ' +
    'stated anywhere on the sheet. Imperial sizes appear in the details ' +
    '(R.C.C COLUMN 9" x 9", PLINTH BEAM 9" x 1\'-6"). Opening counts ' +
    'hand-counted from the text layer, schedule rows excluded: D ×3, D1 ×1, ' +
    'MD ×2, W ×5, V ×4. Dimension sample: 20 callout strings covering the ' +
    'notation forms on the sheet (not an exhaustive census).',
  source: {
    name: 'Verified.RealEstate — approved plans (ppa)',
    url: 'https://files.verified.realestate/ppa/approved_plans/111853.pdf',
    license:
      'Public approved-plan record published by verified.realestate; no license ' +
      'statement on the file — used as a benchmark sample under the owner order 2026-10-31.',
    downloadedAt: '2026-11-22',
    fileName: 'house-in-111853.pdf',
    pages: 1,
    sizeBytes: 565221,
  },
  notMeasured: [
    'Classification is asserted UNKNOWN (composite sheet — no single class); the closest single class would be FLOOR_PLAN, but the sheet also carries an elevation, sections, and details.',
    'Opening counts verified against the extracted text layer only; symbols drawn without a text label are not counted.',
    'D2 has a schedule row but no plan symbol in the text layer — its schedule row is not covered by the opening metrics.',
    "'BD' plan label (1 occurrence, probable balcony-door mark) — semantics unverified, not measured.",
    'bbox IoU not measured — no ground-truth pixel coordinates extracted.',
    'Wall / structure / roof / QTO / AHSP not measured on this sheet — no wall-thickness schedule, no structural schedule, no quantities in the text layer.',
  ],
  pages: [
    {
      page: 1,
      title: 'PLAN SHOWING THE PROPOSED CONSTRUCTION OF R.C.C. TERRACED RESIDENTIAL BUILDING',
      text: internetText('house-in-111853.txt'),
      hasTextLayer: true,
      widthPx: 595,
      heightPx: 842,
      base64Length: 100000,
      expectedClass: 'UNKNOWN',
      stub: {
        survey: detections([
          // Dimensions — decimal-dot metres (incl. 4-decimal CAD values).
          dimEntry('3.05', box111853()),
          dimEntry('3.05', box111853()),
          dimEntry('8.4377', box111853()),
          dimEntry('1.2000', box111853()),
          dimEntry('3.0380', box111853()),
          dimEntry('6.21', box111853()),
          dimEntry('8.74', box111853()),
          // Dimensions — unit-suffixed metres (setback table).
          dimEntry('1.50m', box111853()),
          dimEntry('2.0m', box111853()),
          dimEntry('1.08m', box111853()),
          dimEntry('1.00m', box111853()),
          // Dimensions — room-size products, label-prefixed, imperial, suffixed.
          dimEntry('2.92X3.0', box111853()),
          dimEntry('2.99X5.91', box111853()),
          dimEntry('TREAD 0.25m', box111853()),
          dimEntry('RISE 0.175m', box111853()),
          dimEntry('9" x 9"', box111853()),
          dimEntry('23cm TK', box111853()),
          dimEntry('1.22', box111853()),
          dimEntry('8.6', box111853()),
          dimEntry('6.6', box111853()),
          dimEntry('11.6', box111853()),
          // Plan symbols (counts hand-verified from the text layer).
          symbolEntry('D', 'D DOOR', box111853()),
          symbolEntry('D', 'D DOOR', box111853()),
          symbolEntry('D', 'D DOOR', box111853()),
          symbolEntry('D1', 'D1 DOOR', box111853()),
          symbolEntry('MD', 'MD MAIN DOOR', box111853()),
          symbolEntry('MD', 'MD MAIN DOOR', box111853()),
          symbolEntry('W', 'W WINDOW', box111853()),
          symbolEntry('W', 'W WINDOW', box111853()),
          symbolEntry('W', 'W WINDOW', box111853()),
          symbolEntry('W', 'W WINDOW', box111853()),
          symbolEntry('W', 'W WINDOW', box111853()),
          symbolEntry('V', 'V VENTILATOR', box111853()),
          symbolEntry('V', 'V VENTILATOR', box111853()),
          symbolEntry('V', 'V VENTILATOR', box111853()),
          symbolEntry('V', 'V VENTILATOR', box111853()),
          // Joinery schedule — verbatim rows from the SCHEDUL OF JOINERIES block.
          tableEntry('MD MAIN DOOR 1.06X2.13', box111853()),
          tableEntry('D1 DOOR 0.91X2.13', box111853()),
          tableEntry('D2 DOOR 0.75X2.13', box111853()),
          tableEntry('W WINDOW 1.52X1.83', box111853()),
          tableEntry('V VENTILATOR 0.91X0.61', box111853()),
          // A bare section label (visible text; matches no reference pattern).
          textEntry('SECTION', box111853()),
        ]),
        detail: emptyDetections(),
      },
      // I10b E9 — classified UNKNOWN (FLOOR_PLAN 4 vs five classes at 3:
      // a contested top, not a classification) → 'survey' policy → no
      // DETAIL re-pass. D1 still links in phase 2 (doc-level re-link).
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 1, originalText: '3.05', value: 3050, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '3.05', value: 3050, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '8.4377', value: 8437.7, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '1.2000', value: 1200, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '3.0380', value: 3038, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '6.21', value: 6210, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '8.74', value: 8740, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '1.50m', value: 1.5, unit: 'm', kind: 'LINEAR' },
      { page: 1, originalText: '2.0m', value: 2, unit: 'm', kind: 'LINEAR' },
      { page: 1, originalText: '1.08m', value: 1.08, unit: 'm', kind: 'LINEAR' },
      { page: 1, originalText: '1.00m', value: 1, unit: 'm', kind: 'LINEAR' },
      // Room-size products: two LINEAR records from one callout each.
      // I10b E3/E14 — per-piece originalTexts, per the product contract
      // (see the 90135 note above). Values/units/kinds unchanged.
      { page: 1, originalText: '2.92', value: 2920, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '3.0', value: 3000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '2.99', value: 2990, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '5.91', value: 5910, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: 'TREAD 0.25m', value: 250, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: 'RISE 0.175m', value: 175, unit: 'mm', kind: 'LINEAR' },
      // Imperial column size: 9 in = 228.6 mm exactly.
      { page: 1, originalText: '9"', value: 228.6, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '9"', value: 228.6, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '23cm TK', value: 230, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '1.22', value: 1220, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '8.6', value: 8600, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '6.6', value: 6600, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '11.6', value: 11600, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [
      // D has NO schedule row on this sheet (plan symbols only).
      { mark: 'D', widthMm: null, heightMm: null, quantity: 3, schedulePage: null },
      { mark: 'D1', widthMm: 910, heightMm: 2130, quantity: 1, schedulePage: 1 },
      { mark: 'MD', widthMm: 1060, heightMm: 2130, quantity: 2, schedulePage: 1 },
      { mark: 'W', widthMm: 1520, heightMm: 1830, quantity: 5, schedulePage: 1 },
      { mark: 'V', widthMm: 910, heightMm: 610, quantity: 4, schedulePage: 1 },
    ],
    references: [
      { fromPage: 1, toRef: 'D1', status: 'CONFIRMED' },
      // I10b E4 — phase 2 adds one SCHEDULE ref per linked opening (see
      // the 90135 note). D has no schedule row on this sheet, so it
      // correctly gets no ref.
      { fromPage: 1, toRef: 'MD', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'W', status: 'CONFIRMED' },
      { fromPage: 1, toRef: 'V', status: 'CONFIRMED' },
    ],
    // No scale is stated anywhere on this sheet.
    scales: [{ page: 1, statedScale: null }],
    // I10b E9 — classified UNKNOWN (contested top) → 'survey' policy →
    // no DETAIL re-pass. I11 Stage 3, fix 3 — density tiling: this
    // sheet's text density (44,297 chars / 0.50 MP ≈ 88,419 ch/MP)
    // exceeds the 5,000 ch/MP threshold, so the 595×842 page tiles
    // into a 1×2 grid = 2 survey calls (was 1 whole-page call).
    // Derived consequence of the fix, not a ground-truth change.
    calls: 2,
    budgetHit: false,
  },
};

// ---------------------------------------------------------------------------
// road-us-kirkland-ckr09 — Standard Road Cross Section, City of Kirkland (WA)
// ---------------------------------------------------------------------------

const boxKirkland = grid();

const ROAD_US_KIRKLAND_CKR09: BenchmarkFixture = {
  id: 'road-us-kirkland-ckr09',
  tier: 'internet',
  type: 'road-bridge',
  title: 'Standard Road Cross Section CK-R.09 — City of Kirkland, WA, USA',
  notes:
    'Single-page AutoCAD standard detail (US Letter), imperial units ' +
    'throughout: inch layer thicknesses (2" HMA, 4" ATB, 4" crushed rock, ' +
    '1-1/4" aggregate, 1/2" asphalt class), a 20"-24" patch-width range, ' +
    'percent grades (2% slope, 15% max grade), and a 2:1 side-slope ratio. ' +
    'No scale is stated on the sheet. Cross-references standard plan ' +
    'CK-R.17 ("SEE STANDARD PLAN CK-R.17"). The 1/2" aggregate size appears ' +
    'twice on the sheet (layer callout + note 1); stubbed once.',
  source: {
    name: 'City of Kirkland (WA) — Roadway Pre-Approved Plans',
    url: 'https://www.kirklandwa.gov/files/sharedassets/public/v/1/development-services/pdfs/pre-approved-plans/ck-r-9.pdf',
    license:
      'Public standard drawing published by the City of Kirkland; no license ' +
      'statement on the file — used as a benchmark sample under the owner order 2026-10-31.',
    downloadedAt: '2026-11-22',
    fileName: 'road-us-kirkland-ckr09.pdf',
    pages: 1,
    sizeBytes: 140472,
  },
  notMeasured: [
    'Spec percentages (95% compaction) are not dimensions and are not stubbed as detections.',
    'The 20"-24" patch width is a stated range; expected as its two bounds (508 + 609.6 mm).',
    'bbox IoU not measured — no ground-truth pixel coordinates extracted.',
    'Walls / structure / roof / QTO / AHSP not applicable to this sheet.',
  ],
  pages: [
    {
      page: 1,
      title: 'Standard Road Cross Section',
      text: internetText('road-us-kirkland-ckr09.txt'),
      hasTextLayer: true,
      widthPx: 612,
      heightPx: 792,
      base64Length: 100000,
      expectedClass: 'SECTION',
      stub: {
        survey: detections([
          // Inch layer thicknesses (1 in = 25.4 mm exactly).
          dimEntry('2"', boxKirkland()),
          dimEntry('4"', boxKirkland()),
          dimEntry('4"', boxKirkland()),
          dimEntry('1-1/4"', boxKirkland()),
          dimEntry('1/2"', boxKirkland()),
          // Patch-width range.
          dimEntry('20" TO 24"', boxKirkland()),
          // Percent grades + side-slope ratio.
          dimEntry('2%', boxKirkland()),
          dimEntry('15%', boxKirkland()),
          dimEntry('2:1', boxKirkland()),
          // Genuine cross-reference to another standard plan.
          textEntry('SEE STANDARD PLAN CK-R.17', boxKirkland()),
        ]),
        detail: emptyDetections(),
      },
      // Classified SECTION → 'full' policy; I10b E6/E7 — the first pass
      // now validates every dimension (imperial + slopes parse), so no
      // DETAIL re-pass is needed.
      expectDetailPass: false,
    },
  ],
  expected: {
    dimensions: [
      { page: 1, originalText: '2"', value: 50.8, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '4"', value: 101.6, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '4"', value: 101.6, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '1-1/4"', value: 31.75, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '1/2"', value: 12.7, unit: 'mm', kind: 'LINEAR' },
      // I10b E6 — per-bound originalTexts, per the range contract (each
      // bound keeps its own text). Values/units/kinds unchanged.
      { page: 1, originalText: '20"', value: 508, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '24"', value: 609.6, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '2%', value: 2, unit: 'percent', kind: 'SLOPE' },
      { page: 1, originalText: '15%', value: 15, unit: 'percent', kind: 'SLOPE' },
      { page: 1, originalText: '2:1', value: 2, unit: 'ratio', kind: 'SLOPE' },
    ],
    openings: [],
    references: [
      // CK-R.17 is NOT in this document, so the I5 contract
      // (resolveReference) correctly leaves the ref UNRESOLVED: no known
      // target matches. UNRESOLVED here is a correct outcome, not a miss.
      { fromPage: 1, toRef: 'STANDARD PLAN CK-R.17', status: 'UNRESOLVED' },
    ],
    scales: [{ page: 1, statedScale: null }],
    // I10b E6/E7 — 1 call: no DETAIL re-pass (see the note above).
    calls: 1,
    budgetHit: false,
  },
};

// ---------------------------------------------------------------------------
// house-id-krs-type45 — Desain Rumah Tumbuh Type 45, BANK DESAIN KRS JAWA 3
// (I11 Stage 3 — first INDONESIAN sheet in the internet tier)
// ---------------------------------------------------------------------------

const boxKrs = grid();

const HOUSE_ID_KRS_TYPE45: BenchmarkFixture = {
  id: 'house-id-krs-type45',
  tier: 'internet',
  type: 'house',
  title: 'Desain Rumah Tumbuh Type 45 — BANK DESAIN KRS JAWA 3 (lembar 03 Denah + lembar 10 Rencana Kusen)',
  notes:
    'Two A3 landscape sheets from a 40-page Indonesian working-drawing set ' +
    '(student design bank, Universitas Teknologi Yogyakarta): lembar 03 ' +
    'DENAH RUMAH TYPE 45 and lembar 10 RENCANA KUSEN, both Skala 1:100. ' +
    'Dimensions are bare integers in mm (2000, 6000, 17500…) — the ' +
    'Indonesian convention of unitless mm on the drawing. The kusen plan ' +
    'carries Indonesian opening marks J1/J2 (jendela) and P1–P4 (pintu), ' +
    'hand-counted from the text layer: J1 ×2, J2 ×2, P1 ×3, P2 ×4, P3 ×2, ' +
    'P4 ×2. The size details for these marks live on the DETAIL J1/P1 ' +
    'sheets (lembar 11–12), NOT in a schedule table on this sheet — so ' +
    'the openings are expected with null dims (plan symbols only, same ' +
    'pattern as the 111853 D mark). The stored PDF is pages 7 + 14 of ' +
    'the 40-page source (4.4 MB, over the 2 MB per-file cap), extracted ' +
    'with pypdf; the source URL below is the full set.',
  source: {
    name: 'BANK DESAIN KRS JAWA 3 — Desain Rumah Tumbuh (houseDesign PDF)',
    url: 'https://apiternak.krsjawa3.com/uploads/files/houseDesign_file-1765700333456.pdf',
    license:
      'Public design-bank PDF (student work, Universitas Teknologi ' +
      'Yogyakarta); no license statement on the file — used as a ' +
      'benchmark sample under the owner order 2026-10-31. Stored file ' +
      'is a 2-page extract (lembar 03 + 10) of the 40-page source.',
    downloadedAt: '2026-11-22',
    fileName: 'house-id-krs-type45.pdf',
    pages: 2,
    sizeBytes: 344204,
  },
  notMeasured: [
    'Opening DIMENSIONS are not measured on this sheet: the J/P sizes live on the DETAIL J1/P1 sheets (lembar 11–12), not in a schedule table — the pipeline has no detail-page linking, so association is expected null (count is the meaningful metric here).',
    'Opening counts verified against the extracted text layer only; symbols drawn without a text label are not counted. The denah (p1) carries no opening marks in its text layer, so no openings are expected there.',
    'Grid labels (A–E, 1–8) and the north arrow (U) are not dimensions and are not stubbed.',
    'bbox IoU not measured — no ground-truth pixel coordinates extracted.',
    'Wall / structure / roof / QTO / AHSP not measured on these sheets — no wall-thickness schedule, no structural schedule, no quantities in the text layer.',
  ],
  pages: [
    {
      page: 1,
      title: 'DENAH RUMAH TYPE 45',
      text: internetText('house-id-krs-type45-p1.txt'),
      hasTextLayer: true,
      widthPx: 1191,
      heightPx: 842,
      base64Length: 100000,
      expectedClass: 'FLOOR_PLAN',
      stub: {
        survey: detections([
          // All 10 distinct dimension values on the sheet, one detection
          // each (repeated instances not counted — a census of values,
          // not of instances). Bare integers ≥ 100 mm parse as mm (E1
          // year exception: 2000 is a multiple of 10, so it stays a
          // dimension).
          dimEntry('1000', boxKrs()),
          dimEntry('1500', boxKrs()),
          dimEntry('2000', boxKrs()),
          dimEntry('2500', boxKrs()),
          dimEntry('3000', boxKrs()),
          dimEntry('4000', boxKrs()),
          dimEntry('4500', boxKrs()),
          dimEntry('5000', boxKrs()),
          dimEntry('6000', boxKrs()),
          dimEntry('17500', boxKrs()),
          legendEntry('Skala 1 : 100', boxKrs()),
        ]),
        detail: emptyDetections(),
      },
      // Classified FLOOR_PLAN → 'full' policy, but the survey validates
      // every dimension at HIGH_CONFIDENCE (bare integers, 0.85) and
      // leaves no UNRESOLVED record — no DETAIL re-pass.
      expectDetailPass: false,
    },
    {
      page: 2,
      title: 'RENCANA KUSEN RUMAH TYPE 45',
      text: internetText('house-id-krs-type45-p2.txt'),
      hasTextLayer: true,
      widthPx: 1191,
      heightPx: 842,
      base64Length: 100000,
      expectedClass: 'DOOR_WINDOW_SCHEDULE',
      stub: {
        survey: detections([
          // Dimension sample (same grid dims as p1; 4 of 10 values).
          dimEntry('2000', boxKrs()),
          dimEntry('3000', boxKrs()),
          dimEntry('5000', boxKrs()),
          dimEntry('17500', boxKrs()),
          // Kusen marks, hand-counted from the text layer (order as
          // printed: J2 P1 P1 P2 P3 J1 P2 P4 P1 P3 P4 J1 J2 P2).
          // J = jendela (window), P = pintu (door) — the stub rawText
          // carries the Indonesian keyword the openings module maps
          // (OPENING_KEYWORDS: pintu/jendela).
          symbolEntry('J2', 'J2 JENDELA', boxKrs()),
          symbolEntry('P1', 'P1 PINTU', boxKrs()),
          symbolEntry('P1', 'P1 PINTU', boxKrs()),
          symbolEntry('P2', 'P2 PINTU', boxKrs()),
          symbolEntry('P3', 'P3 PINTU', boxKrs()),
          symbolEntry('J1', 'J1 JENDELA', boxKrs()),
          symbolEntry('P2', 'P2 PINTU', boxKrs()),
          symbolEntry('P4', 'P4 PINTU', boxKrs()),
          symbolEntry('P1', 'P1 PINTU', boxKrs()),
          symbolEntry('P3', 'P3 PINTU', boxKrs()),
          symbolEntry('P4', 'P4 PINTU', boxKrs()),
          symbolEntry('J1', 'J1 JENDELA', boxKrs()),
          symbolEntry('J2', 'J2 JENDELA', boxKrs()),
          symbolEntry('P2', 'P2 PINTU', boxKrs()),
          symbolEntry('P2', 'P2 PINTU', boxKrs()),
          legendEntry('Skala 1 : 100', boxKrs()),
        ]),
        // DETAIL re-pass (symbols — the openings are UNRESOLVED without
        // a schedule): empty, per the established fixture pattern (the
        // house/building DETAIL pages all return empty detail bodies).
        // A re-read cannot conjure a schedule that is not on the sheet;
        // the openings stay UNRESOLVED (correct).
        detail: emptyDetections(),
      },
      // Classified DOOR_WINDOW_SCHEDULE → 'full' policy; the six
      // openings are UNRESOLVED (no schedule table on this sheet), so
      // the DETAIL re-pass fires (symbols). The re-read returns nothing
      // new; the openings stay UNRESOLVED (correct — there is no
      // schedule to link against).
      expectDetailPass: true,
    },
  ],
  expected: {
    dimensions: [
      // Page 1 — all 10 distinct values.
      { page: 1, originalText: '1000', value: 1000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '1500', value: 1500, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '2000', value: 2000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '2500', value: 2500, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '3000', value: 3000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '4000', value: 4000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '4500', value: 4500, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '5000', value: 5000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '6000', value: 6000, unit: 'mm', kind: 'LINEAR' },
      { page: 1, originalText: '17500', value: 17500, unit: 'mm', kind: 'LINEAR' },
      // Page 2 — 4-value sample.
      { page: 2, originalText: '2000', value: 2000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '3000', value: 3000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '5000', value: 5000, unit: 'mm', kind: 'LINEAR' },
      { page: 2, originalText: '17500', value: 17500, unit: 'mm', kind: 'LINEAR' },
    ],
    openings: [
      // Null dims: no schedule table on this sheet (see notes).
      { mark: 'J1', widthMm: null, heightMm: null, quantity: 2, schedulePage: null },
      { mark: 'J2', widthMm: null, heightMm: null, quantity: 2, schedulePage: null },
      { mark: 'P1', widthMm: null, heightMm: null, quantity: 3, schedulePage: null },
      { mark: 'P2', widthMm: null, heightMm: null, quantity: 4, schedulePage: null },
      { mark: 'P3', widthMm: null, heightMm: null, quantity: 2, schedulePage: null },
      { mark: 'P4', widthMm: null, heightMm: null, quantity: 2, schedulePage: null },
    ],
    references: [],
    scales: [
      { page: 1, statedScale: '1:100' },
      { page: 2, statedScale: '1:100' },
    ],
    // p1: 1 survey call (no DETAIL). p2: 1 survey + 1 DETAIL (symbols).
    calls: 3,
    budgetHit: false,
  },
};

export const INTERNET_FIXTURES: BenchmarkFixture[] = [
  HOUSE_IN_90135,
  HOUSE_IN_111853,
  ROAD_US_KIRKLAND_CKR09,
  HOUSE_ID_KRS_TYPE45,
];

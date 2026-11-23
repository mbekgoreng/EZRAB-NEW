/**
 * DED vision — dimension recognition suite (increment I2).
 *
 * Plain-tsx assertion script (NO vitest imports). Run from repo root:
 *   npx --yes tsx src/test/dedVisionDimensions.test.ts
 *
 * Fixtures carry hand-verified ground truth (value + unit + kind) for every
 * supported Indonesian drawing notation, plus NEGATIVE fixtures: grid
 * labels, detail ids, drawing numbers and section markers must NOT parse
 * as lengths, and ambiguous bare numbers must never become a confident
 * length (they return null).
 *
 * Prints `PASS n/total` and exits non-zero on any failure.
 */

import {
  kindFromLabelHint,
  parseDimensionList,
  parseDimensionToken,
  parseSheetUnitsNote,
} from '../ai-tools/ded-vision/dimensions';
import type { DimensionKind, DimensionRecord, DimensionUnit } from '../ai-tools/ded-vision/types';

let pass = 0;
let total = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  total += 1;
  if (cond) {
    pass += 1;
  } else {
    failures.push(detail === '' ? name : `${name} — ${detail}`);
  }
}

function describe(rec: DimensionRecord | null): string {
  if (!rec) return 'null';
  return (
    `${rec.normalizedValue} ${rec.unit} ${rec.kind} ` +
    `conf=${rec.confidence} status=${rec.status} id=${rec.id} ` +
    `notes=${rec.notes ?? '—'} orig=${JSON.stringify(rec.originalText)}`
  );
}

interface ExpectedDim {
  value: number;
  unit: DimensionUnit;
  kind: DimensionKind;
  status?: string;
}

/** One token fixture: expected record fields, or null (must NOT parse). */
function expectDim(
  name: string,
  text: string,
  expected: ExpectedDim | null,
  ctx?: { page?: number; associatedElement?: string; labelHint?: string; dimensionEvident?: boolean },
): void {
  const rec = parseDimensionToken(text, ctx);
  if (expected === null) {
    check(name, rec === null, `expected null, got ${describe(rec)}`);
    return;
  }
  const ok =
    rec !== null &&
    rec.normalizedValue === expected.value &&
    rec.unit === expected.unit &&
    rec.kind === expected.kind &&
    rec.originalText === text &&
    (expected.status === undefined || rec.status === expected.status);
  check(
    name,
    ok,
    `expected ${expected.value} ${expected.unit} ${expected.kind}` +
      `${expected.status ? ` ${expected.status}` : ''}, got ${describe(rec)}`,
  );
}

/** One list fixture: expected records in order (value + unit + kind). */
function expectList(
  name: string,
  text: string,
  expected: ExpectedDim[],
  ctx?: { page?: number; associatedElement?: string; labelHint?: string; dimensionEvident?: boolean },
): void {
  const recs = parseDimensionList(text, ctx);
  const ok =
    recs.length === expected.length &&
    expected.every((e, i) => {
      const r = recs[i];
      return (
        r !== undefined &&
        r.normalizedValue === e.value &&
        r.unit === e.unit &&
        r.kind === e.kind
      );
    });
  check(
    name,
    ok,
    `expected [${expected.map((e) => `${e.value} ${e.unit} ${e.kind}`).join(' | ')}], ` +
      `got [${recs.map(describe).join(' | ')}]`,
  );
}

// =============================================================================
// parseDimensionToken — positives (ground truth: value + unit + kind)
// =============================================================================

// Thousands dot → mm.
expectDim('3.500 → 3500 mm LINEAR', '3.500', {
  value: 3500,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'HIGH_CONFIDENCE',
});
expectDim('12.500 → 12500 mm LINEAR', '12.500', {
  value: 12500,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('3.500,50 → 3500.5 mm LINEAR (thousands + decimal comma)', '3.500,50', {
  value: 3500.5,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('3.500,5 → 3500.5 mm LINEAR', '3.500,5', {
  value: 3500.5,
  unit: 'mm',
  kind: 'LINEAR',
});

// Bare integer ≥ 100 → mm.
expectDim('3500 → 3500 mm LINEAR', '3500', {
  value: 3500,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'HIGH_CONFIDENCE',
});
expectDim('100 → 100 mm LINEAR (bare minimum)', '100', {
  value: 100,
  unit: 'mm',
  kind: 'LINEAR',
});

// Decimal comma + explicit unit → m.
expectDim('3,50 m → 3.5 m LINEAR', '3,50 m', {
  value: 3.5,
  unit: 'm',
  kind: 'LINEAR',
  status: 'HIGH_CONFIDENCE',
});
expectDim('3,50m → 3.5 m LINEAR (no space)', '3,50m', {
  value: 3.5,
  unit: 'm',
  kind: 'LINEAR',
});
expectDim('3.5 m → 3.5 m LINEAR (decimal dot with unit)', '3.5 m', {
  value: 3.5,
  unit: 'm',
  kind: 'LINEAR',
});
expectDim('3500 mm → 3500 mm LINEAR', '3500 mm', {
  value: 3500,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('250 cm → 250 cm LINEAR', '250 cm', {
  value: 250,
  unit: 'cm',
  kind: 'LINEAR',
});
expectDim('12 mm → 12 mm LINEAR (explicit unit disambiguates small value)', '12 mm', {
  value: 12,
  unit: 'mm',
  kind: 'LINEAR',
});

// Elevations / levels — kind ELEVATION / LEVEL, never LINEAR.
expectDim('+3.500 → 3500 mm ELEVATION', '+3.500', {
  value: 3500,
  unit: 'mm',
  kind: 'ELEVATION',
  status: 'HIGH_CONFIDENCE',
});
expectDim('-1.500 → -1500 mm ELEVATION (below datum keeps its sign)', '-1.500', {
  value: -1500,
  unit: 'mm',
  kind: 'ELEVATION',
});
expectDim('+3,50 m → 3.5 m ELEVATION', '+3,50 m', {
  value: 3.5,
  unit: 'm',
  kind: 'ELEVATION',
});
expectDim('EL +3.500 → 3500 mm ELEVATION', 'EL +3.500', {
  value: 3500,
  unit: 'mm',
  kind: 'ELEVATION',
});
expectDim('EL. +3.500 → 3500 mm ELEVATION', 'EL. +3.500', {
  value: 3500,
  unit: 'mm',
  kind: 'ELEVATION',
});
expectDim('PEIL ±0.000 → 0 mm LEVEL (datum)', 'PEIL ±0.000', {
  value: 0,
  unit: 'mm',
  kind: 'LEVEL',
});
expectDim('LEVEL +1.200 → 1200 mm LEVEL', 'LEVEL +1.200', {
  value: 1200,
  unit: 'mm',
  kind: 'LEVEL',
});

// Diameters / radius.
expectDim('Ø12 → 12 mm DIAMETER', 'Ø12', {
  value: 12,
  unit: 'mm',
  kind: 'DIAMETER',
  status: 'HIGH_CONFIDENCE',
});
expectDim('D12 → 12 mm DIAMETER', 'D12', {
  value: 12,
  unit: 'mm',
  kind: 'DIAMETER',
  status: 'HIGH_CONFIDENCE',
});
expectDim('Ø 12 → 12 mm DIAMETER (space variant)', 'Ø 12', {
  value: 12,
  unit: 'mm',
  kind: 'DIAMETER',
});
expectDim('D16 → 16 mm DIAMETER', 'D16', {
  value: 16,
  unit: 'mm',
  kind: 'DIAMETER',
});
expectDim('ø8 → 8 mm DIAMETER (lowercase symbol)', 'ø8', {
  value: 8,
  unit: 'mm',
  kind: 'DIAMETER',
});
expectDim('diameter 12 mm → 12 mm DIAMETER (word form)', 'diameter 12 mm', {
  value: 12,
  unit: 'mm',
  kind: 'DIAMETER',
});
expectDim('R500 → 500 mm RADIUS', 'R500', {
  value: 500,
  unit: 'mm',
  kind: 'RADIUS',
});

// Angle.
expectDim('45° → 45 deg ANGLE', '45°', {
  value: 45,
  unit: 'deg',
  kind: 'ANGLE',
});

// Verbatim originalText incl. surrounding whitespace (matching trims,
// the stored text does not).
expectDim('padded "  3.500  " → 3500 mm, originalText kept verbatim', '  3.500  ', {
  value: 3500,
  unit: 'mm',
  kind: 'LINEAR',
});

// =============================================================================
// parseDimensionToken — negatives (must return null, never a length)
// =============================================================================

// Identifiers: grid labels, detail ids, drawing numbers.
expectDim('A-1 grid label → null', 'A-1', null);
expectDim('B/3 grid label → null', 'B/3', null);
expectDim('DET-3 detail id → null', 'DET-3', null);
expectDim('A-101 drawing number → null', 'A-101', null);
expectDim('AR-101 drawing number → null', 'AR-101', null);
expectDim('G-01 grid/drawing id → null', 'G-01', null);
expectDim('J1 opening mark → null', 'J1', null);

// Section markers and scales.
expectDim('1-1 section marker → null', '1-1', null);
expectDim('A-A section marker → null', 'A-A', null);
expectDim('POT A-A section marker → null', 'POT A-A', null);
expectDim('1:100 scale → null', '1:100', null);
expectDim('SKALA 1:100 scale statement → null', 'SKALA 1:100', null);

// Ambiguous fragments: never a confident length.
expectDim('12 bare small number → null', '12', null);
expectDim('45 bare small number → null', '45', null);
expectDim('3,5 bare decimal without unit → null', '3,5', null);
expectDim('D1 mark, not a 1 mm diameter → null', 'D1', null);
expectDim('D12-150 rebar spacing, not a single dimension → null', 'D12-150', null);
expectDim('3/4 fraction → null', '3/4', null);

// Multi-dimension expressions belong to parseDimensionList.
expectDim('15/30 pair → null from the single-token parser', '15/30', null);
expectDim('2.500 × 3.000 product → null from the single-token parser', '2.500 × 3.000', null);

// Empty / zero / implausible.
expectDim('empty string → null', '', null);
expectDim('whitespace only → null', '   ', null);
expectDim('0 mm zero length → null', '0 mm', null);
expectDim('0 bare zero → null', '0', null);
expectDim('3.500 m → null (reads as 3500 m, implausible; never silently 3.5 m)', '3.500 m', null);

// =============================================================================
// parseDimensionList — positives
// =============================================================================

expectList('2.500 × 3.000 → two LINEAR mm records', '2.500 × 3.000', [
  { value: 2500, unit: 'mm', kind: 'LINEAR' },
  { value: 3000, unit: 'mm', kind: 'LINEAR' },
]);
expectList('15/30 → two LINEAR cm records (section pair)', '15/30', [
  { value: 15, unit: 'cm', kind: 'LINEAR' },
  { value: 30, unit: 'cm', kind: 'LINEAR' },
]);
expectList('15x30 → section pair (x separator)', '15x30', [
  { value: 15, unit: 'cm', kind: 'LINEAR' },
  { value: 30, unit: 'cm', kind: 'LINEAR' },
]);
expectList('3.500, 2.000 → two mm records (list comma)', '3.500, 2.000', [
  { value: 3500, unit: 'mm', kind: 'LINEAR' },
  { value: 2000, unit: 'mm', kind: 'LINEAR' },
]);
expectList('3500,2000 → two mm records (spaceless list comma)', '3500,2000', [
  { value: 3500, unit: 'mm', kind: 'LINEAR' },
  { value: 2000, unit: 'mm', kind: 'LINEAR' },
]);
expectList('3,50 m, 2,00 m → two m records (decimal commas kept)', '3,50 m, 2,00 m', [
  { value: 3.5, unit: 'm', kind: 'LINEAR' },
  { value: 2, unit: 'm', kind: 'LINEAR' },
]);
expectList('15/30; 20/40 → four records (two pairs)', '15/30; 20/40', [
  { value: 15, unit: 'cm', kind: 'LINEAR' },
  { value: 30, unit: 'cm', kind: 'LINEAR' },
  { value: 20, unit: 'cm', kind: 'LINEAR' },
  { value: 40, unit: 'cm', kind: 'LINEAR' },
]);
expectList('K1: 15/30 → pair values', 'K1: 15/30', [
  { value: 15, unit: 'cm', kind: 'LINEAR' },
  { value: 30, unit: 'cm', kind: 'LINEAR' },
]);
expectList('2.500/3.000 → two mm records (slash fallback, not a pair)', '2.500/3.000', [
  { value: 2500, unit: 'mm', kind: 'LINEAR' },
  { value: 3000, unit: 'mm', kind: 'LINEAR' },
]);
expectList('A-1, 3.500 → grid label dropped, length kept', 'A-1, 3.500', [
  { value: 3500, unit: 'mm', kind: 'LINEAR' },
]);
expectList('3500 × 2500 → two mm records (large sides are lengths, not a pair)', '3500 × 2500', [
  { value: 3500, unit: 'mm', kind: 'LINEAR' },
  { value: 2500, unit: 'mm', kind: 'LINEAR' },
]);
expectList('Ø12, D16 → two DIAMETER records', 'Ø12, D16', [
  { value: 12, unit: 'mm', kind: 'DIAMETER' },
  { value: 16, unit: 'mm', kind: 'DIAMETER' },
]);
expectList('newline-separated "3.500\\n2.000" → two records', '3.500\n2.000', [
  { value: 3500, unit: 'mm', kind: 'LINEAR' },
  { value: 2000, unit: 'mm', kind: 'LINEAR' },
]);

// =============================================================================
// parseDimensionList — negatives (must yield no records)
// =============================================================================

expectList('1:100 → []', '1:100', []);
expectList('SKALA 1:100 → []', 'SKALA 1:100', []);
expectList('A-1 → []', 'A-1', []);
expectList('B/3 → [] (neither slash side parses)', 'B/3', []);
expectList('3/4 → [] (fraction, not a section pair)', '3/4', []);
expectList('D1, J1 → [] (marks only)', 'D1, J1', []);
expectList('empty string → []', '', []);
expectList('DET-3, A-101 → [] (identifiers only)', 'DET-3, A-101', []);

// =============================================================================
// Record properties: pair linkage, ids, page, associated element, status
// =============================================================================

{
  const pair = parseDimensionList('15/30');
  check(
    'pair: both records carry notes "pair:15/30"',
    pair.length === 2 && pair[0].notes === 'pair:15/30' && pair[1].notes === 'pair:15/30',
    `[${pair.map(describe).join(' | ')}]`,
  );
  check(
    'pair: both records keep originalText "15/30" verbatim',
    pair.length === 2 && pair[0].originalText === '15/30' && pair[1].originalText === '15/30',
    `[${pair.map(describe).join(' | ')}]`,
  );
  check(
    'pair: the two records have distinct ids',
    pair.length === 2 && pair[0].id !== pair[1].id,
    `[${pair.map((r) => r.id).join(', ')}]`,
  );
}

{
  const first = parseDimensionToken('3.500', { page: 2 });
  const second = parseDimensionToken('3.500', { page: 2 });
  check(
    'id is deterministic: same input twice → same id',
    first !== null && second !== null && first.id === second.id,
    `${describe(first)} vs ${describe(second)}`,
  );
  check(
    'id encodes the page (dim-p2-…)',
    first !== null && first.id.indexOf('dim-p2-') === 0,
    describe(first),
  );
  check(
    'page ctx flows into the record',
    first !== null && first.page === 2,
    describe(first),
  );
}

{
  const listed = parseDimensionList('3.500', { page: 2 });
  check(
    'list: page ctx flows into records',
    listed.length === 1 && listed[0].page === 2,
    `[${listed.map(describe).join(' | ')}]`,
  );
}

{
  const labelled = parseDimensionList('K1: 15/30');
  check(
    'label prefix sets associatedElement ("K1")',
    labelled.length === 2 &&
      labelled[0].associatedElement === 'K1' &&
      labelled[1].associatedElement === 'K1',
    `[${labelled.map(describe).join(' | ')}]`,
  );
  const explicit = parseDimensionList('K1: 15/30', { associatedElement: 'B1' });
  check(
    'explicit ctx associatedElement wins over the label',
    explicit.length === 2 && explicit[0].associatedElement === 'B1',
    `[${explicit.map(describe).join(' | ')}]`,
  );
  const tokenCtx = parseDimensionToken('3.500', { associatedElement: 'D1' });
  check(
    'token: ctx associatedElement is kept',
    tokenCtx !== null && tokenCtx.associatedElement === 'D1',
    describe(tokenCtx),
  );
}

{
  const product = parseDimensionList('2.500 × 3.000');
  check(
    'product: each side keeps its own originalText ("2.500" / "3.000")',
    product.length === 2 &&
      product[0].originalText === '2.500' &&
      product[1].originalText === '3.000',
    `[${product.map(describe).join(' | ')}]`,
  );
}

{
  // Design invariant: ambiguous tokens return null, so every record the
  // parser emits is confident — none may sit below HIGH_CONFIDENCE.
  const mixed = parseDimensionList('3.500, 3500, 3,50 m, Ø12, +3.500, 15/30');
  check(
    'mixed list yields 7 records (5 singles + pair)',
    mixed.length === 7,
    `[${mixed.map(describe).join(' | ')}]`,
  );
  check(
    'every emitted record is HIGH_CONFIDENCE (ambiguous → null, never low-confidence)',
    mixed.length > 0 && mixed.every((r) => r.status === 'HIGH_CONFIDENCE'),
    `[${mixed.map((r) => `${r.originalText}:${r.status}`).join(', ')}]`,
  );
}

// =============================================================================
// I10b fix pass — benchmark errors E1, E3, E5, E6, E7, E13, E14
// (real strings from the I10a report's evidence section)
// =============================================================================

// --- E1: bare years are not dimensions (shared guard, survey + OCR) ---------
expectDim('2026 → null (a year, not 2026 mm)', '2026', null);
expectDim('1999 → null (year)', '1999', null);
expectDim('2027 → null (year)', '2027', null);
expectDim('2000 → 2000 mm (round year-range value stays a dimension)', '2000', {
  value: 2000,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('2100 → 2100 mm (round year-range value)', '2100', {
  value: 2100,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('2050 → 2050 mm (round year-range value)', '2050', {
  value: 2050,
  unit: 'mm',
  kind: 'LINEAR',
});

// --- E3: bare decimal-dot metres (Indian/decimal-dot notation) -------------
// The inference is LABELED: NEEDS_REVIEW without a units note, never
// silent — the one designed exception to the "every record is
// HIGH_CONFIDENCE" invariant above (direct parses still hold it).
expectDim('3.05 → 3050 mm NEEDS_REVIEW (bare decimal-dot = metres)', '3.05', {
  value: 3050,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'NEEDS_REVIEW',
});
expectDim('14.11 → 14110 mm NEEDS_REVIEW', '14.11', {
  value: 14110,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'NEEDS_REVIEW',
});
expectDim('0.15 → 150 mm NEEDS_REVIEW', '0.15', {
  value: 150,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'NEEDS_REVIEW',
});
expectDim('0.91 → 910 mm NEEDS_REVIEW', '0.91', {
  value: 910,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'NEEDS_REVIEW',
});
expectDim('8.4377 → 8437.7 mm NEEDS_REVIEW (4-decimal CAD value)', '8.4377', {
  value: 8437.7,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'NEEDS_REVIEW',
});
expectDim('0.1 → 100 mm (range floor, inclusive)', '0.1', {
  value: 100,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'NEEDS_REVIEW',
});
expectDim('99.9 → 99900 mm (range ceiling, inclusive)', '99.9', {
  value: 99900,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'NEEDS_REVIEW',
});
expectDim('0.09 → null (below the metre range)', '0.09', null);
expectDim('100.5 → null (above the metre range)', '100.5', null);

{
  const note = parseSheetUnitsNote("ALL DIMENSION ARE IN 'METER'");
  check(
    'parseSheetUnitsNote finds the 90135 units note verbatim',
    note === "ALL DIMENSION ARE IN 'METER'",
    `got ${JSON.stringify(note)}`,
  );
  check(
    'parseSheetUnitsNote returns null without a note',
    parseSheetUnitsNote('denah lantai 1') === null,
  );
  check(
    'parseSheetUnitsNote ignores an mm note (only metre notes evidence bare decimals)',
    parseSheetUnitsNote('ALL DIMENSIONS ARE IN MM') === null,
  );
  const evidenced = parseDimensionList('3.05', { page: 1, sheetUnitsNote: note ?? undefined });
  check(
    'E3 evidenced: units note lifts the inference to HIGH_CONFIDENCE',
    evidenced.length === 1 && evidenced[0].status === 'HIGH_CONFIDENCE' && evidenced[0].confidence === 0.9,
    `[${evidenced.map(describe).join(' | ')}]`,
  );
  check(
    'E3 evidenced: the note text is recorded in notes',
    evidenced.length === 1 && (evidenced[0].notes ?? '').includes("ALL DIMENSION ARE IN 'METER'"),
    `[${evidenced.map(describe).join(' | ')}]`,
  );
}

// Leading-zero decimals are decimals, not thousands (E3 companion fix).
expectDim('0.175m → 0.175 m (leading zero = decimal, not thousands)', '0.175m', {
  value: 0.175,
  unit: 'm',
  kind: 'LINEAR',
});
expectDim('±0.000 → 0 mm ELEVATION (datum zero still parses)', '±0.000', {
  value: 0,
  unit: 'mm',
  kind: 'ELEVATION',
});

// --- E5: label-prefixed dims (fallback strips the label, keeps full text) --
expectDim('TREAD - 0.25M → 250 mm (label stripped, normalized to mm)', 'TREAD - 0.25M', {
  value: 250,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('RISE - 0.15M → 150 mm', 'RISE - 0.15M', {
  value: 150,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('TREAD 0.25m → 250 mm', 'TREAD 0.25m', {
  value: 250,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('RISE 0.175m → 175 mm', 'RISE 0.175m', {
  value: 175,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('HANDRAIL HEIGHT in-1.33m → 1330 mm', 'HANDRAIL HEIGHT in-1.33m', {
  value: 1330,
  unit: 'mm',
  kind: 'LINEAR',
});
expectList('D12 0.25m → [] (a digit-bearing label never strips)', 'D12 0.25m', []);

// --- E6: imperial (exact conversions, 1 in = 25.4 mm) -----------------------
expectDim('2" → 50.8 mm', '2"', { value: 50.8, unit: 'mm', kind: 'LINEAR' });
expectDim('4" → 101.6 mm', '4"', { value: 101.6, unit: 'mm', kind: 'LINEAR' });
expectDim('1-1/4" → 31.75 mm (fractional inch)', '1-1/4"', {
  value: 31.75,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('1/2" → 12.7 mm (fractional inch)', '1/2"', {
  value: 12.7,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim("20' → 6096 mm (feet)", "20'", { value: 6096, unit: 'mm', kind: 'LINEAR' });
expectDim("1'-6\" → 457.2 mm (feet + inches)", "1'-6\"", {
  value: 457.2,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim("6.10 [20'] → 6100 mm NEEDS_REVIEW (dual-unit: metric wins)", "6.10 [20']", {
  value: 6100,
  unit: 'mm',
  kind: 'LINEAR',
  status: 'NEEDS_REVIEW',
});
expectList('9" x 9" → two 228.6 mm records', '9" x 9"', [
  { value: 228.6, unit: 'mm', kind: 'LINEAR' },
  { value: 228.6, unit: 'mm', kind: 'LINEAR' },
]);
expectList('20" TO 24" → 508 + 609.6 mm (range bounds)', '20" TO 24"', [
  { value: 508, unit: 'mm', kind: 'LINEAR' },
  { value: 609.6, unit: 'mm', kind: 'LINEAR' },
]);

// --- E7: percent slopes + slope ratios --------------------------------------
expectDim('2% → 2 percent SLOPE', '2%', { value: 2, unit: 'percent', kind: 'SLOPE' });
expectDim('15% → 15 percent SLOPE', '15%', { value: 15, unit: 'percent', kind: 'SLOPE' });
expectDim('2:1 → 2 ratio SLOPE (N:M with N≠1 is a slope, never a scale)', '2:1', {
  value: 2,
  unit: 'ratio',
  kind: 'SLOPE',
});

// --- E13: trailing suffix after the unit ------------------------------------
expectDim('23cm TK → 230 mm (suffix stripped, normalized to mm)', '23cm TK', {
  value: 230,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('3.500 m → null (a unit word is not a suffix)', '3.500 m', null);

// --- E14: room-size decimal products (fixed automatically by E3) ------------
expectList('4.64X5.12 → 4640 + 5120 mm', '4.64X5.12', [
  { value: 4640, unit: 'mm', kind: 'LINEAR' },
  { value: 5120, unit: 'mm', kind: 'LINEAR' },
]);
expectList('2.92X3.0 → 2920 + 3000 mm', '2.92X3.0', [
  { value: 2920, unit: 'mm', kind: 'LINEAR' },
  { value: 3000, unit: 'mm', kind: 'LINEAR' },
]);
expectList('2.99X5.91 → 2990 + 5910 mm', '2.99X5.91', [
  { value: 2990, unit: 'mm', kind: 'LINEAR' },
  { value: 5910, unit: 'mm', kind: 'LINEAR' },
]);
expectList('1.20 X1.20 Sq → 1200 + 1200 mm', '1.20 X1.20 Sq', [
  { value: 1200, unit: 'mm', kind: 'LINEAR' },
  { value: 1200, unit: 'mm', kind: 'LINEAR' },
]);
{
  const product = parseDimensionList('4.64X5.12');
  check(
    'E14 product: each side keeps its own originalText ("4.64" / "5.12")',
    product.length === 2 && product[0].originalText === '4.64' && product[1].originalText === '5.12',
    `[${product.map(describe).join(' | ')}]`,
  );
  const range = parseDimensionList('20" TO 24"');
  check(
    'E6 range: each bound keeps its own originalText ("20\\"" / "24\\"")',
    range.length === 2 && range[0].originalText === '20"' && range[1].originalText === '24"',
    `[${range.map(describe).join(' | ')}]`,
  );
}

// --- I11 E20: leading unit-bearing value in a callout ----------------------
// Live pilot (Stage 2, F3): DETAIL returned full callouts as rawText and I2
// rejected 7/8. The leading value is extracted; the remainder is ignored
// and named in notes; the record keeps the FULL callout as originalText.
expectDim('E20: 2" HMA CLASS 1/2" → 50.8 mm (pilot callout)', '2" HMA CLASS 1/2"', {
  value: 50.8,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('E20: 4" COMPACTED ATB → 101.6 mm (pilot callout)', '4" COMPACTED ATB', {
  value: 101.6,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('E20: 115 mm. brick wall → 115 mm', '115 mm. brick wall', {
  value: 115,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('E20: 250 mm CONCRETE WALL → 250 mm', '250 mm CONCRETE WALL', {
  value: 250,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('E20: 2% SLOPE → 2 percent SLOPE (pilot callout)', '2% SLOPE', {
  value: 2,
  unit: 'percent',
  kind: 'SLOPE',
});
expectDim('E20: 2:1 MAXIMUM → 2 ratio SLOPE (pilot callout)', '2:1 MAXIMUM', {
  value: 2,
  unit: 'ratio',
  kind: 'SLOPE',
});
expectDim('E20: Ø12 REBAR → 12 mm DIAMETER', 'Ø12 REBAR', {
  value: 12,
  unit: 'mm',
  kind: 'DIAMETER',
});
expectDim('E20: 1/2" HMA CLASS → 12.7 mm (fraction + long callout)', '1/2" HMA CLASS', {
  value: 12.7,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('E20: 1\'-6" CONCRETE FOOTING → 457.2 mm (feet-inches callout)', '1\'-6" CONCRETE FOOTING', {
  value: 457.2,
  unit: 'mm',
  kind: 'LINEAR',
});
expectDim('E20: 115 mm. TK → 115 mm (punctuation separator: E13 cannot cross ".", E20 fires)', '115 mm. TK', {
  value: 115,
  unit: 'mm',
  kind: 'LINEAR',
});
expectList('E20: range with callout on the hi bound keeps BOTH bounds', '20\' TO 24" BASE COURSE', [
  { value: 6096, unit: 'mm', kind: 'LINEAR' },
  { value: 609.6, unit: 'mm', kind: 'LINEAR' },
]);
{
  const rec = parseDimensionToken('2" HMA CLASS 1/2"', {});
  check(
    'E20: notes name the ignored remainder',
    rec !== null && (rec.notes ?? '').includes('HMA CLASS 1/2"'),
    `notes: ${rec?.notes ?? '(none)'}`,
  );
  check(
    'E20: originalText is the FULL callout, not the extracted value',
    rec !== null && rec.originalText === '2" HMA CLASS 1/2"',
    `originalText: ${rec?.originalText ?? '(none)'}`,
  );
  // E13 deferral: a single short word after pure whitespace is E13's
  // domain, not E20's — the note proves which rule handled it.
  const deferred = parseDimensionToken('2" TK', {});
  check(
    'E20 defers to E13: 2" TK → 50.8 mm with a trailing-suffix note',
    deferred !== null &&
      deferred.normalizedValue === 50.8 &&
      (deferred.notes ?? '').includes('trailing suffix "TK"'),
    `notes: ${deferred?.notes ?? '(none)'}`,
  );
}
// Guards — the extraction must NOT fire here.
expectDim('E20 guard: 2026 REVISION NOTE → null (bare leading number, no unit)', '2026 REVISION NOTE', null);
expectDim('E20 guard: 500 CONCRETE → null (bare leading number, no unit)', '500 CONCRETE', null);
expectDim('E20 guard: 20" TO 24" → null as a single token (never half a range)', '20" TO 24"', null);
expectDim('E20 guard: 500 mm x 500 mm → null as a single token (never half a product)', '500 mm x 500 mm', null);
expectDim('E20 guard: D12 DOOR SCHEDULE → null (D-prefix is a mark, never extracted)', 'D12 DOOR SCHEDULE', null);
expectDim('E20 guard: 1:5:10 MIX → null (triple mix ratio, not a slope)', '1:5:10 MIX', null);
expectDim('E20 guard: R.C.C 1:2:4 → null (letter-leading mix ratio)', 'R.C.C 1:2:4', null);
expectDim('E20 guard: C.C 1:2:4 4" THICK → null (letter-leading; the 4" is not leading)', 'C.C 1:2:4 4" THICK', null);
expectDim('E20 guard: 15/30 DETAIL → null (pair + label: known gap, not extracted)', '15/30 DETAIL', null);
expectDim('E20 guard: 1:100 DETAIL → null (scale re-parse safety net)', '1:100 DETAIL', null);
expectDim('E20 guard: Ø12-150 REBAR → null (spacing spec: hyphen never separates)', 'Ø12-150 REBAR', null);
expectDim('E20 guard: 2" 1/2 → null (mixed fraction without a letter remainder)', '2" 1/2', null);
expectList('E20 guard: 300 X 230 MM still parses as a pair via the list path', '300 X 230 MM', [
  { value: 300, unit: 'mm', kind: 'LINEAR' },
  { value: 230, unit: 'mm', kind: 'LINEAR' },
]);

// =============================================================================
// I11 Stage 4 — E18 OVERALL/CHAINED kinds (label-evidenced only)
// =============================================================================

check('E18 kindFromLabelHint: overall width → OVERALL', kindFromLabelHint('overall width') === 'OVERALL');
check('E18 kindFromLabelHint: TOTAL length → OVERALL', kindFromLabelHint('TOTAL length') === 'OVERALL');
check('E18 kindFromLabelHint: keseluruhan → OVERALL', kindFromLabelHint('lebar keseluruhan') === 'OVERALL');
check('E18 kindFromLabelHint: chained dimension → CHAINED', kindFromLabelHint('chained dimension') === 'CHAINED');
check('E18 kindFromLabelHint: berantai → CHAINED', kindFromLabelHint('dimensi berantai') === 'CHAINED');
check('E18 kindFromLabelHint: segmen → CHAINED', kindFromLabelHint('segmen 2') === 'CHAINED');
check('E18 kindFromLabelHint: wall length → null (no kind evidence)', kindFromLabelHint('wall length') === null);
check('E18 kindFromLabelHint: overall + chained → null (contradictory, fail closed)', kindFromLabelHint('overall chained') === null);
check('E18 kindFromLabelHint: empty label → null', kindFromLabelHint('') === null);

expectDim('E18: 7.000 + overall hint → OVERALL', '7.000', { value: 7000, unit: 'mm', kind: 'OVERALL' }, { labelHint: 'overall width' });
expectDim('E18: 3.500 + chained hint → CHAINED', '3.500', { value: 3500, unit: 'mm', kind: 'CHAINED' }, { labelHint: 'chained dimension' });
expectDim('E18: 7.000 + neutral hint stays LINEAR', '7.000', { value: 7000, unit: 'mm', kind: 'LINEAR' }, { labelHint: 'wall length' });
expectDim('E18: 7.000 with no hint stays LINEAR (default)', '7.000', { value: 7000, unit: 'mm', kind: 'LINEAR' });
expectDim('E18: contradictory hint stays LINEAR', '7.000', { value: 7000, unit: 'mm', kind: 'LINEAR' }, { labelHint: 'overall chained' });
expectList('E18: section pair never takes a kind hint', '15/30', [
  { value: 15, unit: 'cm', kind: 'LINEAR' },
  { value: 30, unit: 'cm', kind: 'LINEAR' },
], { labelHint: 'overall width' });
expectList('E18: colon-label Overall evidences the kind', 'Overall: 12.000', [
  { value: 12000, unit: 'mm', kind: 'OVERALL' },
]);
expectList('E18: TOTAL prefix evidences OVERALL (E5 fallback)', 'TOTAL 12.500 mm', [
  { value: 12500, unit: 'mm', kind: 'OVERALL' },
]);
expectList('E18: product with an overall hint kinds both pieces', '7.000 x 3.500', [
  { value: 7000, unit: 'mm', kind: 'OVERALL' },
  { value: 3500, unit: 'mm', kind: 'OVERALL' },
], { labelHint: 'overall width' });
{
  const rec = parseDimensionToken('7.000', { labelHint: 'overall width' });
  check(
    'E18: the kind evidence is recorded as a machine-readable notes marker',
    (rec?.notes ?? '').includes('kind OVERALL evidenced by label "overall width"'),
    `notes=${rec?.notes ?? '—'}`,
  );
}

// =============================================================================
// I11 Stage 4 — E21 bare sub-100 integers (dimension-evident context only)
// =============================================================================

expectDim('E21: bare 44 without evidence stays null', '44', null);
expectDim('E21: bare 12 without evidence stays null', '12', null);
expectDim('E21: bare 44 with dimensionEvident → 44 mm NEEDS_REVIEW', '44', { value: 44, unit: 'mm', kind: 'LINEAR', status: 'NEEDS_REVIEW' }, { dimensionEvident: true });
expectDim('E21: bare 12 with dimensionEvident → 12 mm', '12', { value: 12, unit: 'mm', kind: 'LINEAR', status: 'NEEDS_REVIEW' }, { dimensionEvident: true });
expectDim('E21: bare 99 with dimensionEvident → 99 mm (upper bound)', '99', { value: 99, unit: 'mm', kind: 'LINEAR', status: 'NEEDS_REVIEW' }, { dimensionEvident: true });
expectDim('E21: single digit 9 never parses, even evident', '9', null, { dimensionEvident: true });
expectDim('E21: single digit 1 never parses, even evident', '1', null, { dimensionEvident: true });
expectDim('E21: year 2026 never parses, even evident (year guard wins)', '2026', null, { dimensionEvident: true });
{
  const rec = parseDimensionToken('44', { dimensionEvident: true });
  check('E21: evident 44 confidence is 0.6', rec?.confidence === 0.6, `conf=${rec?.confidence}`);
  check(
    'E21: evident 44 notes record the E21 basis',
    (rec?.notes ?? '').includes('dimension-evident context (E21)'),
    `notes=${rec?.notes ?? '—'}`,
  );
}

// =============================================================================
// Summary
// =============================================================================

if (failures.length > 0) {
  console.log('FAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(`PASS ${pass}/${total}`);
if (pass !== total) process.exit(1);

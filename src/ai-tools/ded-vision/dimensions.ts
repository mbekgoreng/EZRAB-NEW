/**
 * DED drawing-vision — dimension recognition (increment I2).
 *
 * Pure notation parser for Indonesian drawing conventions. No I/O, no AI
 * calls: it turns a dimension string exactly as read from a drawing into a
 * typed {@link DimensionRecord}, or `null` when the string is not a
 * dimension.
 *
 * Supported notations (see the suite `src/test/dedVisionDimensions.test.ts`
 * for ground truth):
 * - `3.500` — thousands dot → 3500 mm
 * - `3500` — bare integer ≥ 100 → mm
 * - `3,50 m` — decimal comma + explicit unit → 3.50 m
 * - `+3.500` / `-1.500` / `±0.000` / `EL +3.500` — ELEVATION (signed);
 *   `LEVEL …` / `PEIL …` — LEVEL. Never LINEAR.
 * - `Ø12` / `D12` — DIAMETER, 12 mm (see the D-prefix rule below)
 * - `R500` — RADIUS, 500 mm
 * - `45°` — ANGLE, 45 deg
 * - `15/30` — section pair: two LINEAR records in cm, linked via
 *   `notes: "pair:15/30"` (only via `parseDimensionList` — a single
 *   `DimensionRecord` cannot hold a pair, so `parseDimensionToken` returns
 *   `null` for it)
 * - `2.500 × 3.000` — two LINEAR records (only via `parseDimensionList`)
 * - `3.05` — bare decimal-dot in the metre range → 3050 mm LINEAR (I10b
 *   E3: inferred metres, NEEDS_REVIEW unless a sheet units note evidences
 *   it — see `parseSheetUnitsNote`).
 * - `2"` / `1-1/4"` / `1/2"` / `20'` / `1'-6"` — imperial inches/feet,
 *   exact conversions (1 in = 25.4 mm); `6.10 [20']` takes the metric
 *   value when present (I10b E6).
 * - `2%` / `15%` — SLOPE/percent; `2:1` — SLOPE/ratio (I10b E7). A `1:N`
 *   form is a scale, never a slope.
 * - `TREAD - 0.25M` / `RISE 0.175m` — a label prefix is stripped when the
 *   remainder parses as a dimension WITH a unit (I10b E5); `23cm TK` /
 *   `1.20 Sq` — a trailing non-unit suffix is stripped (I10b E13). The
 *   record keeps the FULL input as `originalText`.
 * - `2" HMA CLASS 1/2"` / `4" COMPACTED ATB` / `115 mm. brick wall` /
 *   `2% SLOPE` / `2:1 MAXIMUM` / `Ø12 REBAR` / `1'-6" FOOTING` — a
 *   LEADING unit-bearing value is extracted from a longer callout (I11
 *   E20, runs before the fail-closed guards — the pilot's callouts are
 *   exactly the strings the `/`, Ø, and `:` guards kill); the remainder
 *   is ignored and named in `notes`. A bare leading number is never
 *   extracted, and a remainder starting a range (`TO …`) or a product
 *   (`x …`) blocks the extraction (list level handles those whole).
 *
 * Hard fail-closed rules:
 * - Identifiers are NEVER lengths: grid labels (`A-1`, `B/3`), detail ids
 *   (`DET-3`), drawing numbers (`A-101`), section markers (`A-A`, `1-1`)
 *   and scales (`1:100`) all return `null`.
 * - Ambiguous tokens return `null` — never a confident length. Bare small
 *   numbers (`12`, `45`), bare decimals without a unit (`3,5`) and
 *   implausible values (linear > 1 km) are not dimensions on their own.
 *   An explicit unit disambiguates: `12 mm` IS a dimension.
 * - A bare 4-digit integer in the year range 1900–2100 is a year, not a
 *   dimension (I10b E1 — the year guard is shared by the survey and OCR
 *   paths). A real 2000 mm dimension carries a separator (`2.000`) or a
 *   unit (`2000 mm`); a bare `2000` is year-ambiguous and returns null.
 * - `D<n>` is a diameter only for n ≥ 6. Smaller D-numbers (`D1`…`D5`)
 *   are far more likely opening marks than sub-6 mm diameters, so they
 *   return `null` and stay the openings module's (I3) business. The `Ø`
 *   symbol is unambiguous and has no such floor.
 * - `D12-150` (rebar spacing) is a specification, not a single dimension —
 *   it returns `null` rather than a partial 12 mm diameter.
 * - `parseDimensionList` never merges unrelated numeric fragments into
 *   one dimension: each emitted record comes from exactly one parsed
 *   fragment, and unparseable fragments are dropped, not guessed.
 *
 * Number conventions (Indonesian): `.` groups thousands (`3.500` = 3500),
 * `,` is the decimal mark (`3,50` = 3.5). A dot followed by exactly three
 * digits is always a thousands separator, never a decimal dot — so
 * `3.500 m` reads as 3500 m and is rejected as implausible rather than
 * silently reinterpreted as 3.5 m. A decimal dot is accepted only with an
 * explicit unit and a non-3-digit fraction (`3.5 m` = 3.5 m).
 *
 * Reference: the pre-existing diameter-only detector
 * `isDiameterOnlyDimension` in `../ded-ai-estimate/quantity.ts` is NOT
 * reused here — it answers a different question (whether a whole dimension
 * string contains only a diameter, for the live QTO path) and is left
 * untouched. The `D<digit>` reading here follows the same narrow spirit.
 */

import { statusFromConfidence } from './types';
import type { DimensionKind, DimensionRecord, DimensionUnit } from './types';

/** Caller context for a dimension token. */
export interface DimensionParseContext {
  /** 1-based page number. Defaults to 0 ("page not given"). */
  page?: number;
  /** Drawing element this dimension belongs to (e.g. mark "D1"). */
  associatedElement?: string;
  /**
   * Verbatim sheet units note, e.g. `ALL DIMENSION ARE IN 'METER'` (see
   * {@link parseSheetUnitsNote}). When present, a bare decimal-dot value
   * reads as metres on the sheet's own authority (HIGH_CONFIDENCE);
   * without it the same reading is an inference (NEEDS_REVIEW).
   */
  sheetUnitsNote?: string;
  /**
   * I11 Stage 4 (E18) — a label that may evidence the dimension KIND
   * (OVERALL vs CHAINED vs LINEAR): the vision proposal's label, or the
   * label stripped by the E5 fallback. Only LINEAR records are ever
   * re-kind-ed by it, and only when exactly one kind's keywords match
   * (word-boundaried, case-insensitive); a contradictory or keyword-less
   * label leaves LINEAR untouched. The kind evidence is recorded in the
   * record's `notes` so the benchmark re-parse can re-derive it.
   */
  labelHint?: string;
  /**
   * I11 Stage 4 (E21) — the caller asserts this token sits in a
   * dimension-evident context (its label names a dimension, or a parsed
   * dimension sits nearby on the page). Only then does a bare sub-100
   * integer read as mm (confidence 0.6, NEEDS_REVIEW). Without this
   * flag, bare integers below 100 stay null — the fail-closed default
   * that keeps the `dim-negatives-zero-fp` guard green.
   */
  dimensionEvident?: boolean;
}

/** Plausibility ceiling for any linear dimension, in mm (1 km). */
const MAX_LINEAR_MM = 1_000_000;
/** Bare integers below this are ambiguous (counts, marks, levels) → null. */
const MIN_BARE_INTEGER_MM = 100;
/** `D<n>` / `R<n>` below this are treated as marks, not diameters/radii. */
const MIN_PREFIXED_DIAMETER_MM = 6;
/** Section-pair sides are plain integers in this cm range. */
const PAIR_MIN_CM = 5;
const PAIR_MAX_CM = 200;
/**
 * E1 — bare 4-digit integers in this range are years, not dimensions.
 * A real dimension in this range carries a separator (`2.026`) or a unit.
 */
const YEAR_LIKE_MIN = 1900;
const YEAR_LIKE_MAX = 2100;
/**
 * E3 — bare decimal-dot values accepted as metres, in this range.
 * Rationale: 0.1–99.9 m covers every plausible building dimension in
 * metres (100 mm–99.9 m); below 0.1 m the value is likelier a
 * coefficient than a length, above 99.9 m a single building dimension
 * is implausible. Outside the range the token stays null (fail closed).
 * In Indonesian notation the decimal mark is a comma, so a bare
 * decimal-dot number in a metric drawing almost always means metres —
 * but it is still an inference, so the record is NEEDS_REVIEW unless a
 * sheet units note evidences it (see `sheetUnitsNote`).
 */
const BARE_METRE_MIN = 0.1;
const BARE_METRE_MAX = 99.9;
/** E3/E6 — confidence of a bare-decimal metre inference without a units note. */
const BARE_METRE_INFERENCE_CONFIDENCE = 0.7;
/** E3 — confidence of a bare-decimal metre reading evidenced by a units note. */
const BARE_METRE_EVIDENCED_CONFIDENCE = 0.9;
/** E6 — exact imperial conversions (1 in = 25.4 mm by definition). */
const MM_PER_INCH = 25.4;
const MM_PER_FOOT = 304.8;
/** E7 — percent slopes above this are not slopes (a spec percentage, …). */
const MAX_SLOPE_PERCENT = 1000;

/** Round a computed millimetre value to 0.001 mm — kills float dust
 *  (`0.91 * 1000` must be exactly 910, `9 * 25.4` exactly 228.6). */
function roundMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Parse a sheet units note from drawing text — e.g.
 * `ALL DIMENSION ARE IN 'METER'` (Indian approved-plan sheets). Returns
 * the matched note VERBATIM (evidence, not an assumption), or null when
 * the text states no metre note. Only metre notes are recognised: a
 * bare decimal on an mm/cm sheet stays ambiguous (fail closed).
 */
export function parseSheetUnitsNote(text: string): string | null {
  const m = /\bALL DIMENSIONS?\s+(?:ARE\s+)?IN\s+['"]?(METERS?|METRES?)['"]?(?!\w)/i.exec(text);
  return m ? m[0].trim() : null;
}

/** Forms an Indonesian number literal can take. */
type NumberForm =
  | 'integer'
  | 'thousands'
  | 'decimal-comma'
  | 'decimal-dot'
  | 'thousands-decimal';

interface ParsedNumber {
  value: number;
  form: NumberForm;
}

/**
 * Parse an Indonesian number literal. Returns null for anything that is
 * not a well-formed number in one of the five forms above.
 *
 * Disambiguation: a dot followed by exactly three digits is a thousands
 * separator (`3.500` = 3500). A decimal dot is only recognised when the
 * fraction is NOT exactly three digits (`3.5`, `3.50`).
 */
function parseIndonesianNumber(raw: string): ParsedNumber | null {
  const s = raw.trim();
  if (s === '') return null;
  // Thousands + decimal comma: 3.500,50 → 3500.50. The leading group
  // must start with a non-zero digit: `0.175` is a decimal fraction
  // (0.175), never a thousands grouping — nobody writes 175 as `0.175`.
  if (/^[1-9]\d{0,2}(\.\d{3})+,\d+$/.test(s)) {
    return {
      value: Number(s.replace(/\./g, '').replace(',', '.')),
      form: 'thousands-decimal',
    };
  }
  // Decimal comma: 3,50 → 3.5
  if (/^\d+,\d+$/.test(s)) {
    return { value: Number(s.replace(',', '.')), form: 'decimal-comma' };
  }
  // Thousands dot: 3.500 / 12.500 → 3500 / 12500. Leading-zero
  // excluded (see above): `0.175` falls through to decimal-dot.
  if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    return { value: Number(s.replace(/\./g, '')), form: 'thousands' };
  }
  // Decimal dot: 3.5 / 3.50 (a 3-digit fraction would have matched
  // 'thousands' above, so this branch never sees one).
  if (/^\d+\.\d+$/.test(s)) {
    return { value: Number(s), form: 'decimal-dot' };
  }
  // Plain integer.
  if (/^\d+$/.test(s)) {
    return { value: Number(s), form: 'integer' };
  }
  return null;
}

/** Convert a value in `unit` to millimetres. */
function toMillimetres(value: number, unit: DimensionUnit): number {
  if (unit === 'm') return value * 1000;
  if (unit === 'cm') return value * 10;
  return value;
}

/**
 * Parse a number with an optional explicit unit suffix (`3,50 m`,
 * `3500 mm`, `250cm`). Without a unit, bare decimals are ambiguous and
 * rejected — only integer / thousands / thousands-decimal forms may stand
 * alone, and they read as millimetres.
 */
function parseNumberWithOptionalUnit(
  raw: string,
): { value: number; unit: DimensionUnit } | null {
  const s = raw.trim();
  const withUnit = /^(.*?)\s*(mm|cm|m)$/i.exec(s);
  if (withUnit) {
    const num = parseIndonesianNumber(withUnit[1]);
    if (!num) return null;
    return { value: num.value, unit: withUnit[2].toLowerCase() as DimensionUnit };
  }
  const num = parseIndonesianNumber(s);
  if (!num) return null;
  // Bare decimals (`3,5`, `3.5`) carry no unit — ambiguous, reject.
  // Exception: an exact zero (`0.000`, the datum) is 0 in every reading.
  if (
    (num.form === 'decimal-comma' || num.form === 'decimal-dot') &&
    num.value !== 0
  ) {
    return null;
  }
  return { value: num.value, unit: 'mm' };
}

/** URL-safe slug of the original text, for deterministic ids. */
function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'x' : slug;
}

interface RecordOptions {
  originalText: string;
  normalizedValue: number;
  unit: DimensionUnit;
  kind: DimensionKind;
  page: number;
  associatedElement?: string;
  /** 0..1. Status is derived via statusFromConfidence (caps at HIGH_CONFIDENCE). */
  confidence: number;
  notes?: string;
  /** Ordinal of this record within its parse call — part of the id. */
  index: number;
}

function makeRecord(opts: RecordOptions): DimensionRecord {
  const record: DimensionRecord = {
    id: `dim-p${opts.page}-${opts.index}-${opts.kind.toLowerCase()}-${slugify(opts.originalText)}`,
    originalText: opts.originalText,
    normalizedValue: opts.normalizedValue,
    unit: opts.unit,
    kind: opts.kind,
    page: opts.page,
    confidence: opts.confidence,
    status: statusFromConfidence(opts.confidence),
  };
  if (opts.associatedElement !== undefined) record.associatedElement = opts.associatedElement;
  if (opts.notes !== undefined) record.notes = opts.notes;
  return record;
}

/**
 * Identifier patterns — grid labels, detail ids, drawing numbers, section
 * markers and scales. Anything matching one of these is an identifier,
 * never a length.
 */
function isIdentifierToken(s: string): boolean {
  // Grid labels / drawing numbers: A-1, B/3, A-101, AR-101, G-01.
  if (/^[A-Za-z]{1,3}[-/][A-Za-z0-9]{1,3}$/.test(s)) return true;
  // Longer detail ids: DET-3, DET 3, DETAIL-12, POT-1.
  if (/^[A-Za-z]{2,}[- ][A-Za-z0-9]{1,3}$/.test(s)) return true;
  // Section markers / ranges: 1-1, 2-2.
  if (/^\d{1,3}-\d{1,3}$/.test(s)) return true;
  // Scales and anything colon-separated: 1:100.
  if (s.includes(':')) return true;
  return false;
}

/** Try to parse an elevation / level token. Null when not an elevation form. */
function tryParseElevation(
  s: string,
  ctx: DimensionParseContext,
  originalText: string,
  index: number,
): DimensionRecord | null {
  // Signed elevation: +3.500 / -1.500 / ±0.000 (optional unit: +3,50 m).
  const signed = /^([+\-±])\s*(.+)$/.exec(s);
  if (signed) {
    const parsed = parseNumberWithOptionalUnit(signed[2]);
    if (!parsed) return null;
    const sign = signed[1] === '-' ? -1 : 1;
    const value = sign * parsed.value;
    if (Math.abs(toMillimetres(value, parsed.unit)) > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: value,
      unit: parsed.unit,
      kind: 'ELEVATION',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  // Prefixed elevation / level: EL +3.500, EL. 3.500, LEVEL +1.200, PEIL ±0.000.
  const prefixed = /^(el\.?|elev\.?|level|lev\.?|peil)\s+([+\-±]?\s*.+)$/i.exec(s);
  if (prefixed) {
    const prefix = prefixed[1].toLowerCase().replace('.', '');
    const rest = prefixed[2].replace(/^\s+/, '');
    const signMatch = /^([+\-±])\s*(.*)$/.exec(rest);
    const sign = signMatch && signMatch[1] === '-' ? -1 : 1;
    const numberPart = signMatch ? signMatch[2] : rest;
    const parsed = parseNumberWithOptionalUnit(numberPart);
    if (!parsed) return null;
    const value = sign * parsed.value;
    if (Math.abs(toMillimetres(value, parsed.unit)) > MAX_LINEAR_MM) return null;
    const kind: DimensionKind =
      prefix === 'level' || prefix === 'lev' || prefix === 'peil' ? 'LEVEL' : 'ELEVATION';
    return makeRecord({
      originalText,
      normalizedValue: value,
      unit: parsed.unit,
      kind,
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  return null;
}

/** Try to parse a diameter / radius token. Null when not a diameter form. */
function tryParseDiameter(
  s: string,
  ctx: DimensionParseContext,
  originalText: string,
  index: number,
): DimensionRecord | null {
  // Ø symbol — unambiguous: Ø12, Ø 12, ø12 mm.
  const symbol = /^[øØ]\s*(.+)$/.exec(s);
  if (symbol) {
    const parsed = parseNumberWithOptionalUnit(symbol[1]);
    if (!parsed || parsed.value <= 0) return null;
    if (toMillimetres(parsed.value, parsed.unit) > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: parsed.value,
      unit: parsed.unit,
      kind: 'DIAMETER',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  // Word form: diameter 12 / Diameter 12 mm.
  const word = /^diameter\s+(.+)$/i.exec(s);
  if (word) {
    const parsed = parseNumberWithOptionalUnit(word[1]);
    if (!parsed || parsed.value <= 0) return null;
    if (toMillimetres(parsed.value, parsed.unit) > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: parsed.value,
      unit: parsed.unit,
      kind: 'DIAMETER',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  // D / R prefix, integer only: D12, D 12, R500. Values below 6 are marks
  // (D1 = a door mark, not a 1 mm diameter) — see the module header.
  const prefixed = /^([dDrR])\s*(\d+)\s*(mm|cm|m)?\s*$/i.exec(s);
  if (prefixed) {
    const value = Number(prefixed[2]);
    if (value < MIN_PREFIXED_DIAMETER_MM) return null;
    const unit = (prefixed[3] ? prefixed[3].toLowerCase() : 'mm') as DimensionUnit;
    if (toMillimetres(value, unit) > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: value,
      unit,
      kind: prefixed[1].toLowerCase() === 'r' ? 'RADIUS' : 'DIAMETER',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  return null;
}

/** Try to parse an angle token (`45°`, `45,5°`). Null otherwise. */
function tryParseAngle(
  s: string,
  ctx: DimensionParseContext,
  originalText: string,
  index: number,
): DimensionRecord | null {
  const m = /^(.+?)\s*°\s*$/.exec(s);
  if (!m) return null;
  const num = parseIndonesianNumber(m[1]);
  if (!num || num.value < 0 || num.value > 360) return null;
  return makeRecord({
    originalText,
    normalizedValue: num.value,
    unit: 'deg',
    kind: 'ANGLE',
    page: ctx.page ?? 0,
    associatedElement: ctx.associatedElement,
    confidence: 0.95,
    index,
  });
}

/** Parse an inch value: whole (`6`), decimal (`2.5`), fraction (`1/2`),
 *  or mixed (`1-1/4`, `1 1/4`). Returns inches, or null. */
function parseInchValue(text: string): number | null {
  const t = text.trim();
  const mixed = /^(\d+)[- ](\d+)\/(\d+)$/.exec(t);
  if (mixed) {
    const den = Number(mixed[3]);
    if (den === 0) return null;
    return Number(mixed[1]) + Number(mixed[2]) / den;
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(t);
  if (fraction) {
    const den = Number(fraction[2]);
    if (den === 0) return null;
    return Number(fraction[1]) / den;
  }
  const num = parseIndonesianNumber(t);
  return num ? num.value : null;
}

/**
 * Try to parse an imperial token (I10b E6): inches (`2"`, `1-1/4"`,
 * `1/2"`), feet (`20'`), and feet+inches (`1'-6"`). All values convert
 * to millimetres exactly (1 in = 25.4 mm) and round to 0.001 mm.
 * Must run BEFORE the `/` early-return (fractions contain `/`).
 */
function tryParseImperial(
  s: string,
  ctx: DimensionParseContext,
  originalText: string,
  index: number,
): DimensionRecord | null {
  // Feet + inches: 1'-6" (the inches part may itself be fractional).
  const feetInches = /^(\d+)\s*'\s*-\s*(.+?)\s*"\s*$/.exec(s);
  if (feetInches) {
    const inches = parseInchValue(feetInches[2]);
    if (inches === null) return null;
    const mm = roundMm(Number(feetInches[1]) * MM_PER_FOOT + inches * MM_PER_INCH);
    if (mm <= 0 || mm > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: mm,
      unit: 'mm',
      kind: 'LINEAR',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  // Inches: 2", 1-1/4", 1/2", 2.5".
  const inches = /^(.+?)\s*"\s*$/.exec(s);
  if (inches) {
    const value = parseInchValue(inches[1]);
    if (value === null || value <= 0) return null;
    const mm = roundMm(value * MM_PER_INCH);
    if (mm > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: mm,
      unit: 'mm',
      kind: 'LINEAR',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  // Feet: 20', 6.10' (a decimal foot value is unusual but well-defined).
  const feet = /^(.+?)\s*'\s*$/.exec(s);
  if (feet) {
    const num = parseIndonesianNumber(feet[1]);
    if (!num || num.value <= 0) return null;
    const mm = roundMm(num.value * MM_PER_FOOT);
    if (mm > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: mm,
      unit: 'mm',
      kind: 'LINEAR',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  return null;
}

/**
 * Try to parse a slope token (I10b E7): percent (`2%`, `15%`) or ratio
 * (`2:1`). A `1:N` form is a SCALE, never a slope — it falls through to
 * the identifier check and returns null. Must run BEFORE the identifier
 * check (ratios contain `:`).
 */
function tryParseSlope(
  s: string,
  ctx: DimensionParseContext,
  originalText: string,
  index: number,
): DimensionRecord | null {
  const percent = /^(.+?)\s*%\s*$/.exec(s);
  if (percent) {
    const num = parseIndonesianNumber(percent[1]);
    if (!num || num.value <= 0 || num.value > MAX_SLOPE_PERCENT) return null;
    return makeRecord({
      originalText,
      normalizedValue: num.value,
      unit: 'percent',
      kind: 'SLOPE',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  const ratio = /^(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)$/.exec(s);
  if (ratio) {
    const a = parseIndonesianNumber(ratio[1]);
    const b = parseIndonesianNumber(ratio[2]);
    if (!a || !b || a.value <= 0 || b.value <= 0) return null;
    // 1:N is a scale (1:100, 1:2) — never a slope. Only N:M with N ≠ 1
    // reads as a slope ratio.
    if (a.value === 1) return null;
    return makeRecord({
      originalText,
      normalizedValue: a.value / b.value,
      unit: 'ratio',
      kind: 'SLOPE',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }
  return null;
}

/**
 * I11 Stage 4 (E18) — kind keywords for OVERALL vs CHAINED. OVERALL is
 * the total extent of a run (the outside dimension line); CHAINED is one
 * segment in a dimension chain (a run of consecutive segment dims).
 * Word-boundaried so `total` in `subtotal` or `rangka` in `rangkaian`
 * never matches. `chain` and `chained` are both listed because the word
 * boundary keeps them distinct.
 */
const OVERALL_KIND_RE = /\b(overall|total|keseluruhan|menyeluruh)\b/i;
const CHAINED_KIND_RE = /\b(chain|chained|berantai|rangkaian|rantai|segmen|segment)\b/i;

/**
 * Derive an OVERALL/CHAINED kind from a label hint, or null when the
 * label evidences no kind — or evidences BOTH (contradictory labels fail
 * closed to LINEAR). Exported for the benchmark re-parse check.
 */
export function kindFromLabelHint(label: string | undefined): 'OVERALL' | 'CHAINED' | null {
  if (!label) return null;
  const overall = OVERALL_KIND_RE.test(label);
  const chained = CHAINED_KIND_RE.test(label);
  if (overall && chained) return null;
  if (overall) return 'OVERALL';
  if (chained) return 'CHAINED';
  return null;
}

/** Combine two label hints into one string for kind detection. */
function combineLabelHints(a: string | undefined, b: string | undefined): string | undefined {
  const parts = [a, b].map((s) => (s ?? '').trim()).filter((s) => s !== '');
  return parts.length === 0 ? undefined : parts.join(' ');
}

/**
 * Parse ONE dimension token into a single record, or `null` when the
 * token is not a dimension (identifier, ambiguous fragment, or a
 * multi-dimension expression — those belong to {@link parseDimensionList}).
 *
 * `originalText` is preserved verbatim. `id` is deterministic from the
 * page, the record kind, the normalized text and `index` (the ordinal
 * within the parse call — 0 for a direct call, the running position when
 * called from `parseDimensionList`).
 *
 * I11 Stage 4 (E18): when `ctx.labelHint` evidences OVERALL or CHAINED
 * and the parsed record is LINEAR, the record's kind is overridden and
 * the evidence is appended to `notes` as a machine-readable marker
 * (`kind OVERALL evidenced by label "..."`) so the benchmark re-parse
 * check can re-derive it. Non-LINEAR kinds are never overridden.
 */
export function parseDimensionToken(
  text: string,
  ctx: DimensionParseContext = {},
  index = 0,
): DimensionRecord | null {
  const rec = parseDimensionTokenInner(text, ctx, index);
  if (!rec) return null;
  if (rec.kind !== 'LINEAR') return rec;
  const kind = kindFromLabelHint(ctx.labelHint);
  if (!kind) return rec;
  const marker = `kind ${kind} evidenced by label "${ctx.labelHint?.trim() ?? ''}"`;
  return {
    ...rec,
    id: `dim-p${ctx.page ?? 0}-${index}-${kind.toLowerCase()}-${slugify(rec.originalText)}`,
    kind,
    notes: rec.notes ? `${rec.notes}; ${marker}` : marker,
  };
}

/** The direct parse paths (see `parseDimensionToken` for the contract). */
function parseDimensionTokenInner(
  text: string,
  ctx: DimensionParseContext = {},
  index = 0,
): DimensionRecord | null {
  const originalText = text;
  const s = text.trim();
  if (s === '') return null;

  // Elevations first: the EL prefix would otherwise look like an
  // identifier ("EL +3.500" starts with letters + a number).
  const elevation = tryParseElevation(s, ctx, originalText, index);
  if (elevation) return elevation;
  // A signed/prefixed form whose number does not parse is garbage, not a
  // dimension — do not let it fall through to the other branches.
  if (/^[+\-±]/.test(s)) return null;
  if (/^(el\.?|elev\.?|level|lev\.?|peil)\s+/i.test(s)) return null;

  // I11 E20 — leading unit-bearing value in a callout (`2" HMA CLASS
  // 1/2"`, `Ø12 REBAR`, `2:1 MAXIMUM`). Runs BEFORE the diameter /
  // angle / imperial / slope attempts and the fail-closed guards below:
  // the live pilot's callouts are exactly the strings the `/`, Ø, and
  // `:` guards kill, and the value in them is real. Whole-token parses
  // are unaffected — E20 only matches a leading value followed by a
  // callout remainder — and its own guards (unit required, TO/product
  // blocks, E13 deferral, re-parse safety net) keep the fail-closed
  // intent: a guarded token is rescued only when the leading value
  // re-parses as a dimension on its own.
  const leading = tryLeadingCalloutValue(s, ctx, originalText, index);
  if (leading) return leading;

  const diameter = tryParseDiameter(s, ctx, originalText, index);
  if (diameter) return diameter;
  // A diameter marker whose number does not parse (Øx, D12-150) is not a
  // length — fail closed instead of falling through.
  if (/^[øØ]/.test(s)) return null;
  if (/^diameter\s+/i.test(s)) return null;
  if (/^[dDrR]\s*\d/.test(s)) return null;

  const angle = tryParseAngle(s, ctx, originalText, index);
  if (angle) return angle;
  if (s.includes('°')) return null;

  // Imperial (E6) before the `/` early-return: fractions contain `/`.
  // Slope (E7) before the identifier check: ratios contain `:`.
  const imperial = tryParseImperial(s, ctx, originalText, index);
  if (imperial) return imperial;
  const slope = tryParseSlope(s, ctx, originalText, index);
  if (slope) return slope;

  // Identifiers are never lengths.
  if (isIdentifierToken(s)) return null;

  // Multi-dimension expressions belong to parseDimensionList: a single
  // record cannot hold a pair (`15/30`) or a product (`2.500 × 3.000`).
  if (s.includes('/') || s.includes('×')) return null;

  // I10b fallbacks (E5/E13/E6-dual): a label prefix, a trailing
  // non-unit suffix, or a bracketed dual unit. Each strips the
  // non-dimension part and re-parses the remainder; the record keeps
  // the FULL input as originalText. They run here — after the
  // fail-closed guards above, before the direct number paths — so a
  // guarded token (`D12-150`, `Øx`) can never be rescued by stripping.
  const fallback = tryFallbackParse(s, ctx, originalText, index);
  if (fallback) return fallback;

  // Explicit unit: 3,50 m / 3500 mm / 250 cm / 12 mm. The unit removes all
  // ambiguity, so small values are fine here.
  const withUnit = /^(.*?)\s*(mm|cm|m)$/i.exec(s);
  if (withUnit) {
    const num = parseIndonesianNumber(withUnit[1]);
    if (!num) return null;
    const unit = withUnit[2].toLowerCase() as DimensionUnit;
    if (num.value <= 0) return null;
    if (toMillimetres(num.value, unit) > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: num.value,
      unit,
      kind: 'LINEAR',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.95,
      index,
    });
  }

  // Thousands-dot form without a unit: 3.500 / 12.500 / 3.500,50 → mm.
  const num = parseIndonesianNumber(s);
  if (!num) return null;
  if (num.form === 'thousands' || num.form === 'thousands-decimal') {
    if (num.value <= 0 || num.value > MAX_LINEAR_MM) return null;
    return makeRecord({
      originalText,
      normalizedValue: num.value,
      unit: 'mm',
      kind: 'LINEAR',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.9,
      index,
    });
  }

  // Bare integer: only ≥ 100 mm reads as a length. Smaller bare numbers
  // (12, 45) are ambiguous — counts, marks, levels — and return null.
  // I11 Stage 4 (E21): the ONE exception is a dimension-evident
  // context (`ctx.dimensionEvident`): a bare integer in [10, 99] then
  // reads as mm at confidence 0.6 (NEEDS_REVIEW) — the KRS 44 mm frame
  // members are real dimensions that the fail-closed rule could never
  // read. Single digits (1–9) never parse, even evidenced: they are
  // counts far more often than lengths. Without the flag the token
  // stays null — the default that keeps `dim-negatives-zero-fp` green.
  if (num.form === 'integer') {
    if (num.value < MIN_BARE_INTEGER_MM || num.value > MAX_LINEAR_MM) {
      if (
        ctx.dimensionEvident === true &&
        num.value >= 10 &&
        num.value < MIN_BARE_INTEGER_MM
      ) {
        return makeRecord({
          originalText,
          normalizedValue: num.value,
          unit: 'mm',
          kind: 'LINEAR',
          page: ctx.page ?? 0,
          associatedElement: ctx.associatedElement,
          confidence: 0.6,
          notes: 'Bare sub-100 integer read as mm — dimension-evident context (E21)',
          index,
        });
      }
      return null;
    }
    // E1 — a bare 4-digit integer in the year range is a year (drawing
    // date, revision year), not a dimension. The guard is shared by the
    // survey and OCR paths: both call this parser. Exception: multiples
    // of 10 mm stay dimensions — nominal dimension values cluster on
    // round numbers (`2000`, `2100` are standard sizes), while years
    // are uniformly distributed, so a non-multiple (`2026`) in the year
    // range is a year, not a length. A real non-round dimension in this
    // range carries a separator (`2.026`) or a unit (`2026 mm`).
    if (
      num.value >= YEAR_LIKE_MIN &&
      num.value <= YEAR_LIKE_MAX &&
      num.value % 10 !== 0
    ) {
      return null;
    }
    return makeRecord({
      originalText,
      normalizedValue: num.value,
      unit: 'mm',
      kind: 'LINEAR',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: 0.85,
      index,
    });
  }

  // E3 — bare decimal-dot in the metre range reads as metres, in mm.
  // In Indonesian notation the decimal mark is a comma, so a bare
  // decimal-dot value in a metric drawing almost always means metres —
  // but it is still an inference: NEEDS_REVIEW unless a sheet units
  // note evidences it. Decimal-comma (`3,5`) stays null: without a unit
  // it is genuinely ambiguous (a decimal comma with no unit is not a
  // dimension in Indonesian notation either).
  if (num.form === 'decimal-dot') {
    if (num.value < BARE_METRE_MIN || num.value > BARE_METRE_MAX) return null;
    const mm = roundMm(num.value * 1000);
    if (mm > MAX_LINEAR_MM) return null;
    const note = ctx.sheetUnitsNote;
    const evidenced = note !== undefined && note.trim() !== '';
    return makeRecord({
      originalText,
      normalizedValue: mm,
      unit: 'mm',
      kind: 'LINEAR',
      page: ctx.page ?? 0,
      associatedElement: ctx.associatedElement,
      confidence: evidenced ? BARE_METRE_EVIDENCED_CONFIDENCE : BARE_METRE_INFERENCE_CONFIDENCE,
      notes: evidenced
        ? `Bare decimal-dot read as metres per sheet units note: "${note}"`
        : 'Bare decimal-dot read as metres (no units note on sheet; decimal-dot is not Indonesian decimal-comma notation)',
      index,
    });
  }

  return null;
}

/**
 * Re-record a fallback parse under the FULL input text: the value comes
 * from the stripped remainder, but `originalText` (and the id derived
 * from it) is the token as read. The strip is recorded in `notes`.
 *
 * Fallback-recovered lengths are NORMALIZED to mm (the drawing's base
 * unit): direct parses keep their stated unit, but a recovered value
 * has already been transformed once, so it is reported in the canonical
 * unit — uniformly with the E3 (bare-decimal) and E6 (imperial)
 * inferences, which also emit mm.
 */
function withFullOriginalText(
  rec: DimensionRecord,
  originalText: string,
  page: number,
  index: number,
  stripNote: string,
): DimensionRecord {
  let normalizedValue = rec.normalizedValue;
  let unit = rec.unit;
  let note = stripNote;
  if (unit === 'm' || unit === 'cm') {
    normalizedValue = roundMm(toMillimetres(rec.normalizedValue, unit));
    unit = 'mm';
    note = `${stripNote}; normalized to mm`;
  }
  return {
    ...rec,
    id: `dim-p${page}-${index}-${rec.kind.toLowerCase()}-${slugify(originalText)}`,
    originalText,
    normalizedValue,
    unit,
    notes: rec.notes ? `${rec.notes}; ${note}` : note,
  };
}

/**
 * I10b fallbacks — try to parse a token that failed the direct paths by
 * stripping ONE non-dimension part and re-parsing the remainder:
 *
 * - E5 label prefix: `TREAD - 0.25M` / `RISE 0.175m` / `HANDRAIL HEIGHT
 *   in-1.33m` — the remainder must parse as a dimension WITH a unit,
 *   and the label must contain a letter and NO digit (so `300 X 230 MM`
 *   never strips to `230 MM`, and a label like `D12` never becomes a
 *   dimension — it has a digit and no unit-bearing remainder anyway).
 * - E13 trailing suffix: `23cm TK` / `1.20 Sq` — a trailing 1–4-letter
 *   word that is NOT a unit is stripped. A unit word (`m`, `mm`, `cm`)
 *   is never stripped, so `3.500 m` cannot degrade to `3.500`.
 * - E6 dual unit: `6.10 [20']` — a trailing bracketed part is stripped
 *   and the metric value is taken when present: the outside value wins
 *   unless it is imperial and the bracketed value parses as metric.
 *
 * (The I11 E20 leading-value extraction is NOT here: it must run before
 * the fail-closed guards in `parseDimensionToken`, so it lives in
 * `tryLeadingCalloutValue` and is called from there directly.)
 *
 * Each strip strictly shortens the token, so the recursion terminates.
 * Returns null when no strip yields a dimension.
 */
function tryFallbackParse(
  s: string,
  ctx: DimensionParseContext,
  originalText: string,
  index: number,
): DimensionRecord | null {
  const page = ctx.page ?? 0;

  // E5 — label prefix + trailing <number><unit>.
  const labelMatch = /^(.+?)[\s-]+(\d[\d.,]*\s*(?:mm|cm|m))\s*$/i.exec(s);
  if (labelMatch) {
    const label = labelMatch[1].trim();
    if (/[A-Za-z]/.test(label) && !/\d/.test(label)) {
      // I11 Stage 4 (E18): the stripped label is itself a kind hint —
      // `TOTAL 12.500` is an OVERALL extent, `RANGKAIAN 3.500` a CHAINED
      // segment. It is combined with any caller hint; a contradiction
      // between the two fails closed to LINEAR.
      const rec = parseDimensionToken(labelMatch[2], {
        ...ctx,
        labelHint: combineLabelHints(ctx.labelHint, label),
      }, index);
      if (rec) {
        return withFullOriginalText(rec, originalText, page, index, `label "${label}" stripped`);
      }
    }
  }

  // E13 — trailing non-unit suffix.
  const suffixMatch = /^(.+?)\s+([A-Za-z]{1,4})\s*$/.exec(s);
  if (suffixMatch) {
    const suffix = suffixMatch[2];
    const remainder = suffixMatch[1];
    if (!/^(mm|cm|m)$/i.test(suffix) && /\d/.test(remainder)) {
      const rec = parseDimensionToken(remainder, ctx, index);
      if (rec) {
        return withFullOriginalText(rec, originalText, page, index, `trailing suffix "${suffix}" ignored`);
      }
    }
  }

  // E6 — dual unit: metric value wins when present.
  const bracketMatch = /^(.+?)\s*\[([^\]]*)\]\s*$/.exec(s);
  if (bracketMatch) {
    const outside = bracketMatch[1].trim();
    const inside = bracketMatch[2].trim();
    const outsideRec = outside !== '' ? parseDimensionToken(outside, ctx, index) : null;
    const outsideIsImperial = /["']/.test(outside);
    if (outsideRec && !outsideIsImperial) {
      return withFullOriginalText(outsideRec, originalText, page, index, `bracketed dual unit "[${inside}]" ignored; metric value used`);
    }
    if (inside !== '') {
      const insideRec = parseDimensionToken(inside, ctx, index);
      if (insideRec && !/["']/.test(inside)) {
        return withFullOriginalText(insideRec, originalText, page, index, `metric value "${inside}" taken from brackets; outside "${outside}" ignored`);
      }
    }
    if (outsideRec) {
      return withFullOriginalText(outsideRec, originalText, page, index, `bracketed dual unit "[${inside}]" ignored`);
    }
  }

  return null;
}

/**
 * I11 E20 — leading unit-bearing value in a callout. Extracts the
 * LEADING dimension from a longer callout string and re-parses it:
 * `2" HMA CLASS 1/2"` → `2"`; `4" COMPACTED ATB` → `4"`; `115 mm.
 * brick wall` → `115 mm`; `2% SLOPE` → `2%`; `2:1 MAXIMUM` → `2:1`;
 * `Ø12 REBAR` → `Ø12`; `1'-6" FOOTING` → `1'-6"`.
 *
 * Called from `parseDimensionToken` BEFORE the fail-closed guards: the
 * live pilot's callouts are exactly the strings the `/`, Ø, and `:`
 * guards kill, and the value in them is real. The guards' intent is
 * preserved by E20's own rules:
 * - the value MUST carry a unit (mm/cm/m, "/', %, a ratio, Ø, or a
 *   feet-inches form) — a bare leading number is never extracted, so
 *   `2026 …` and `500 …` stay null;
 * - the remainder must contain a letter (callout text, not another
 *   dimension part);
 * - a remainder starting a range (`TO …`) or a product (`x …` + digit)
 *   blocks the extraction — those are handled whole at the list level;
 * - a hyphen never separates value from remainder (`Ø12-150` is a
 *   spacing spec, not a callout);
 * - when the remainder is a single 1–4-letter word after pure
 *   whitespace, E20 DEFERS to E13 (the trailing-suffix rule owns
 *   `23cm TK` / `2" HMA`; E20 only fires when the separator carries
 *   punctuation E13 cannot cross, e.g. `115 mm. TK`);
 * - the extracted value is RE-PARSED, so a scale (`1:100 DETAIL`)
 *   still returns null — the re-parse is the safety net.
 * The `D`-prefix form is deliberately NOT extracted (`D12 …` is an
 * opening mark far more often than a diameter).
 * Returns null when no leading value qualifies.
 */
function tryLeadingCalloutValue(
  s: string,
  ctx: DimensionParseContext,
  originalText: string,
  index: number,
): DimensionRecord | null {
  const page = ctx.page ?? 0;
  const leadingMatch =
    /^(\d+\s*'\s*-\s*[\d\s./]+\s*"|\d+\s*\/\s*\d+\s*[\"']|[øØ]\s*\d[\d.,]*\s*(?:mm|cm|m)?|\d[\d.,]*\s*(?:mm|cm|m|[\"']|%)|\d+\s*:\s*\d+)([\s.,;]+)(.+)$/.exec(s);
  if (!leadingMatch) return null;
  const value = leadingMatch[1].trim();
  const separator = leadingMatch[2];
  const remainder = leadingMatch[3].trim();
  // E13 owns single-short-word suffixes after pure whitespace.
  if (/^\s+$/.test(separator) && /^[A-Za-z]{1,4}$/.test(remainder)) return null;
  if (!/[A-Za-z]/.test(remainder)) return null;
  if (/^TO\b/i.test(remainder)) return null;
  if (/^[x×]\s*\d/i.test(remainder)) return null;
  const rec = parseDimensionToken(value, ctx, index);
  if (!rec) return null;
  return withFullOriginalText(rec, originalText, page, index, `callout remainder "${remainder}" ignored; leading value "${value}" used`);
}

/**
 * Parse a section pair (`15/30`, `15x30`, `15 × 30`, optionally with a
 * unit suffix) into two LINEAR records in cm (or the stated unit),
 * linked via `notes: "pair:<a>/<b>"`. Both records keep the full pair
 * string as `originalText`; their ids differ by index.
 * Returns null when the text is not a well-formed pair.
 */
function parseSectionPair(
  text: string,
  ctx: DimensionParseContext,
  startIndex: number,
): DimensionRecord[] | null {
  const m = /^\s*(\d+)\s*[/x×]\s*(\d+)\s*(mm|cm|m)?\s*$/i.exec(text);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a < PAIR_MIN_CM || a > PAIR_MAX_CM || b < PAIR_MIN_CM || b > PAIR_MAX_CM) return null;
  const unit = (m[3] ? m[3].toLowerCase() : 'cm') as DimensionUnit;
  const notes = `pair:${a}/${b}`;
  const page = ctx.page ?? 0;
  return [
    makeRecord({
      originalText: text,
      normalizedValue: a,
      unit,
      kind: 'LINEAR',
      page,
      associatedElement: ctx.associatedElement,
      confidence: 0.9,
      notes,
      index: startIndex,
    }),
    makeRecord({
      originalText: text,
      normalizedValue: b,
      unit,
      kind: 'LINEAR',
      page,
      associatedElement: ctx.associatedElement,
      confidence: 0.9,
      notes,
      index: startIndex + 1,
    }),
  ];
}

/**
 * Split on commas that separate list items, keeping decimal commas
 * intact. A comma is a decimal comma when followed by 1–3 digits and then
 * a non-digit or the end of the string (`3,50 m`, `3,500 m`); any other
 * comma (`3.500, 2.000`, `3500,2000`) separates items.
 */
function splitListCommas(segment: string): string[] {
  return segment.split(/,(?!\d{1,3}(?:\D|$))/);
}

/**
 * True when the candidate is a scale statement (`1:100`, `SKALA 1:100`).
 * Scales are `1:N` by definition — a `2:1` ratio is a SLOPE (E7), not a
 * scale, so only a leading `1` counts here.
 */
function isScaleStatement(candidate: string): boolean {
  return /^(?:[A-Za-z][A-Za-z .]*)?1\s*:\s*\d+$/.test(candidate.trim());
}

/**
 * Split a string into candidate dimension tokens and parse each one.
 * Splits on `;`, newlines, list-separator commas and `×`/`x` products;
 * never merges unrelated numeric fragments into one dimension.
 * Unparseable fragments (identifiers, ambiguous numbers, scales) are
 * dropped, not guessed — so the result may legitimately be empty.
 *
 * Extras over the single-token parser:
 * - section pairs (`15/30`) → two LINEAR records in cm, `notes: "pair:15/30"`;
 * - `x`/`×` products (`2.500 × 3.000`, `9" x 9"`) → one record per side;
 * - `TO` ranges (`20" TO 24"`) → one record per bound, only when both
 *   bounds parse;
 * - fractional inches (`1-1/4"`, `1/2"`) parse as one dimension via the
 *   whole-token attempt before the slash split;
 * - a `Label: <dimension>` prefix (`K1: 15/30`) sets `associatedElement`
 *   from the label (unless `ctx.associatedElement` is already set);
 * - slash-separated lengths that are NOT a pair (`2.500/3.000`) are split
 *   and parsed side by side (grid labels like `B/3` still yield nothing,
 *   because neither side parses as a dimension).
 *
 * `ctx.sheetUnitsNote` (see {@link parseSheetUnitsNote}) evidences the
 * bare-decimal metre inference (E3) for every token parsed here.
 */
export function parseDimensionList(
  text: string,
  ctx: DimensionParseContext = {},
): DimensionRecord[] {
  const out: DimensionRecord[] = [];
  let index = 0;
  const page = ctx.page ?? 0;

  for (const segment of text.split(/[;\n\r]+/)) {
    for (const commaPart of splitListCommas(segment)) {
      let candidate = commaPart.trim();
      if (candidate === '') continue;

      // Scale statements are never dimensions, even with a word label.
      if (isScaleStatement(candidate)) continue;

      // "Label: <dimension>" — keep the label as the associated element.
      // I11 Stage 4 (E18): the colon label is also a kind hint
      // (`Overall: 12.000` is an OVERALL extent).
      let associatedElement = ctx.associatedElement;
      let labelHint = ctx.labelHint;
      const colonIdx = candidate.indexOf(':');
      if (colonIdx > 0) {
        const label = candidate.slice(0, colonIdx).trim();
        if (/[A-Za-z]/.test(label)) {
          candidate = candidate.slice(colonIdx + 1).trim();
          if (associatedElement === undefined && label !== '') associatedElement = label;
          labelHint = combineLabelHints(labelHint, label);
          if (candidate === '') continue;
        }
      }
      const subCtx: DimensionParseContext = {
        page,
        associatedElement,
        sheetUnitsNote: ctx.sheetUnitsNote,
        labelHint,
        dimensionEvident: ctx.dimensionEvident,
      };

      // Section pair (whole candidate): 15/30, 15x30, 15 × 30.
      const pair = parseSectionPair(candidate, subCtx, index);
      if (pair) {
        out.push(pair[0], pair[1]);
        index += 2;
        continue;
      }

      // Multiplication: 2.500 × 3.000 (letter x between digits counts).
      // The left side may carry an inch/foot mark: 9" x 9" (E6).
      const product = candidate.replace(/(\d["']?)\s*[xX]\s*(\d)/g, '$1×$2');
      if (product.includes('×')) {
        for (const piece of product.split('×')) {
          // Trim: the whitespace around a separator is not part of the token.
          const rec = parseDimensionToken(piece.trim(), subCtx, index);
          if (rec) {
            out.push(rec);
            index += 1;
          }
        }
        continue;
      }

      // Range: 20" TO 24" (E6) — both bounds must parse, else nothing
      // (a range with an unparseable bound is dropped, not half-kept).
      const rangeMatch = /^(.+?)\s+TO\s+(.+)$/i.exec(candidate);
      if (rangeMatch) {
        const lo = parseDimensionToken(rangeMatch[1].trim(), subCtx, index);
        const hi = parseDimensionToken(rangeMatch[2].trim(), subCtx, index + 1);
        if (lo && hi) {
          out.push(lo, hi);
          index += 2;
          continue;
        }
        // One bound unparseable — fall through to the single-token path,
        // which returns null for the range as a whole (never half a range).
      }

      // Whole-token parse before the slash split: fractional inches
      // (1-1/4", 1/2") contain `/` but are ONE dimension (E6). A pair
      // (15/30) was already handled above; a slash length (2.500/3.000)
      // returns null here and falls through to the split below.
      if (candidate.includes('/')) {
        const whole = parseDimensionToken(candidate, subCtx, index);
        if (whole) {
          out.push(whole);
          index += 1;
          continue;
        }
      }

      // Slash fallback for non-pair lengths: 2.500/3.000. Grid labels
      // (B/3) and fractions (3/4) yield nothing — neither side parses.
      if (candidate.includes('/')) {
        for (const piece of candidate.split('/')) {
          const rec = parseDimensionToken(piece.trim(), subCtx, index);
          if (rec) {
            out.push(rec);
            index += 1;
          }
        }
        continue;
      }

      const rec = parseDimensionToken(candidate, subCtx, index);
      if (rec) {
        out.push(rec);
        index += 1;
      }
    }
  }
  return out;
}

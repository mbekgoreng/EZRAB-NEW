/**
 * DED drawing-vision scale calibration (spec §9, increment I6).
 *
 * Core rule: explicit dimension annotations ALWAYS outrank pixel measurement.
 * A guessed scale is never a verified measurement.
 *
 * - A printed scale (`1:100`) is a *stated* fact only. It is recorded, never
 *   used to measure: a stated-only scale has no pixel calibration behind it,
 *   and `measureFromPixels` refuses it.
 * - Pixel measurement requires a calibration built from a known explicit
 *   dimension AND verified against additional known dimensions. Until then
 *   the calibration is unverified and measurement is refused.
 * - This module NEVER defaults to a scale. No stated scale means `null`,
 *   not `1:100`.
 *
 * Reference (read-only, NOT modified): the existing scale regex lives in
 * `src/ded-rab-v2/ingestion/pdfPageService.ts` — `extractScale()` (line
 * ~334, `/skala\s*[:=]?\s*(1\s*:\s*\d+)/i`) — and one call site applies an
 * unverified `|| '1:100'` default (line ~299). This module deliberately does
 * not reproduce that default.
 *
 * Pure functions only. No I/O, no provider calls.
 */

import {
  statusFromConfidence,
  type ScaleCalibration,
  type ScaleMethod,
} from './types';

/**
 * Relative tolerance for calibration verification and non-uniform-scaling
 * detection, as a fraction (0.02 = 2%).
 *
 * Rationale: pixel lengths read off a rendered drawing carry sub-pixel
 * rounding plus line-thickness ambiguity (a dimension line is several px
 * wide at 1.5× render), so an exact match is unrealistic; 2% keeps a
 * 3500 mm wall within ±70 mm — tight enough to catch a wrong scale or a
 * misread dimension, loose enough for render noise. The same tolerance
 * governs `verifyCalibration` and `detectNonUniformScaling` so the two
 * checks cannot disagree about what "close enough" means.
 */
export const SCALE_TOLERANCE = 0.02;

/** Tolerance expressed in percent, for reporting (`uncertaintyPct`). */
export const SCALE_TOLERANCE_PCT = SCALE_TOLERANCE * 100;

/**
 * A pixel calibration: the measured mm-per-pixel factor plus the
 * `ScaleCalibration` record that carries its provenance and review status.
 * The factor and its record travel together so a bare number can never be
 * mistaken for a verified measurement.
 */
export interface PixelCalibration {
  /** Millimetres per pixel, from a known explicit dimension. */
  mmPerPixel: number;
  calibration: ScaleCalibration;
}

/** Match a printed `1:N` scale, tolerating spaces around the colon. */
const STATED_SCALE_RE = /(?:^|[^\d])1\s*:\s*(\d+)/g;

/**
 * I10b E2 — a ratio immediately preceded by a mix/material keyword is a
 * concrete/mortar mix, never a scale: `C.M 1:5` and `IN CM 1:4` (cement
 * mortar), `R.C.C 1:2:4`, `P.C.C 1:5:10`, `C.C-1:2:4 mix`, `BETON
 * 1:2:3`. The keyword must be ADJACENT to the ratio (optional hyphen /
 * space between) — a scale later in the same sentence (`R.C.C DETAILS
 * SCALE 1:50`) is not skipped, because `SCALE` sits between the
 * material word and the ratio. `RATIO` is deliberately NOT in this
 * list: `SCALE RATIO 1:100` is a scale statement, and adjacency cannot
 * tell it from `RATIO 1:5`.
 */
const MIX_KEYWORD_BEFORE_RE =
  /\b(?:C\.C\.?|C\.M\.?|R\.C\.C\.?|P\.C\.C\.?|CC|CM|RCC|PCC|CEMENT|MORTAR|CONCRETE|BETON|MIX|ADUKAN|CAMPURAN|SEMEN|SPESI)\s*[-–—:]?\s*$/i;

/** A ratio immediately followed by `mix`/`ratio` is a mix, never a scale. */
const MIX_KEYWORD_AFTER_RE = /^\s*(?:mix|ratio|rasio)\b/i;

/**
 * Parse a printed scale from drawing text. Accepts `1:20`, `1:50`, `1:100`,
 * `1:200`, and any other `1:N` form; tolerates spaces (`1 : 100`) and
 * prefixes (`SKALA 1:100`). Returns the normalized form `1:N` (no spaces,
 * no leading zeros in N), or `null` when the text states no scale — never
 * a default.
 *
 * I10b E2 — concrete/mortar mix ratios are NOT scales, in two forms:
 * (a) a match followed by `:<digit>` is the head of a triple ratio
 * (`1:2:4`, `1:5:10` — mix notation, standard on Indonesian and Indian
 * drawings) and is skipped; (b) a match immediately preceded by a
 * mix/material keyword (`C.M 1:5`, `IN CM 1:4`) or followed by `mix` /
 * `ratio` is a two-part mix ratio and is skipped. Scanning continues
 * for a real scale later in the text. A standalone `1:2` still parses
 * — 1:1/1:2/1:5 are real detail scales, so a denominator floor alone
 * would be unsafe.
 */
export function parseStatedScale(text: string): string | null {
  STATED_SCALE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STATED_SCALE_RE.exec(text)) !== null) {
    // Triple ratio? `1:2:4` matches as `1:2` with `:4` right after it.
    const after = text.slice(STATED_SCALE_RE.lastIndex);
    if (/^\s*:\s*\d/.test(after)) continue;
    // Mix ratio? A material keyword sits immediately before the ratio
    // (`C.M 1:5`, `IN CM 1:4`), or `mix`/`ratio` right after it.
    const oneIndex = match.index + match[0].indexOf('1');
    if (MIX_KEYWORD_BEFORE_RE.test(text.slice(0, oneIndex))) continue;
    if (MIX_KEYWORD_AFTER_RE.test(after)) continue;
    const denominator = Number.parseInt(match[1], 10);
    if (!Number.isFinite(denominator) || denominator <= 0) continue;
    return `1:${denominator}`;
  }
  return null;
}

/**
 * Build a calibration from one known explicit dimension.
 * `mmPerPixel = knownMm / pixels`.
 *
 * Method is PIXEL_CALIBRATED and `verified` is FALSE until
 * `verifyCalibration` checks it against additional known dimensions —
 * a single dimension calibrates, it does not verify.
 *
 * @throws RangeError when `knownMm` or `pixels` is not a positive finite number.
 */
export function calibrateFromDimension(
  knownMm: number,
  pixels: number,
  page: number,
  statedScale?: string | null,
): PixelCalibration {
  if (!Number.isFinite(knownMm) || knownMm <= 0) {
    throw new RangeError(`calibrateFromDimension: knownMm must be > 0, got ${knownMm}`);
  }
  if (!Number.isFinite(pixels) || pixels <= 0) {
    throw new RangeError(`calibrateFromDimension: pixels must be > 0, got ${pixels}`);
  }
  const method: ScaleMethod = 'PIXEL_CALIBRATED';
  const calibration: ScaleCalibration = {
    page,
    statedScale: statedScale ?? null,
    method,
    calibratedFrom: { dimensionMm: knownMm, pixels },
    verified: false,
    // Uncertainty is unknown until verification measures it.
    uncertaintyPct: null,
    // Unverified calibration: no confidence claim at all.
    status: statusFromConfidence(0),
    evidence: [],
  };
  return { mmPerPixel: knownMm / pixels, calibration };
}

/** Relative error between a predicted and an actual pixel length. */
function relativePixelError(predictedPx: number, actualPx: number): number {
  if (!Number.isFinite(actualPx) || actualPx <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(predictedPx - actualPx) / actualPx;
}

/**
 * Verify a calibration against additional known dimensions. Each check
 * predicts a pixel length from the calibration (`dimensionMm / mmPerPixel`)
 * and requires it to agree with the measured pixel length within
 * `SCALE_TOLERANCE` (2%).
 *
 * - All checks pass → `verified: true`, status HIGH_CONFIDENCE, and
 *   `uncertaintyPct` set to the worst observed relative error (percent).
 * - Any check fails → `verified: false`, status UNRESOLVED, `uncertaintyPct`
 *   still records the worst observed error so the failure is diagnosable.
 * - Zero checks → the calibration is returned unchanged (still unverified):
 *   verification requires evidence.
 *
 * Returns a new object; the input is not mutated.
 */
export function verifyCalibration(
  cal: PixelCalibration,
  checks: { dimensionMm: number; pixels: number }[],
): PixelCalibration {
  if (checks.length === 0) return cal;
  let worstError = 0;
  let allPass = true;
  for (const check of checks) {
    const predictedPx = check.dimensionMm / cal.mmPerPixel;
    const error = relativePixelError(predictedPx, check.pixels);
    if (error > worstError) worstError = error;
    if (!(error <= SCALE_TOLERANCE)) allPass = false;
  }
  const verified = allPass;
  return {
    mmPerPixel: cal.mmPerPixel,
    calibration: {
      ...cal.calibration,
      verified,
      // Worst observed deviation, as a percent (Infinity when a check
      // carried an unusable pixel length — a failed check, honestly reported).
      uncertaintyPct: Number.isFinite(worstError) ? worstError * 100 : null,
      // A verified calibration is HIGH_CONFIDENCE: explicit verification
      // raises it above a confidence-only claim, but VERIFIED is reserved
      // for the review layer's final sign-off (see types.ts).
      status: verified ? statusFromConfidence(0.9) : statusFromConfidence(0),
    },
  };
}

/**
 * Detect non-uniform (anisotropic) scaling — e.g. a distorted scan where
 * the X and Y axes were stretched differently. True when the X and Y
 * mm-per-pixel factors differ by more than `SCALE_TOLERANCE` (2%),
 * measured relative to their mean. Non-positive or non-finite inputs are
 * not evidence of distortion and return false.
 */
export function detectNonUniformScaling(
  xMmPerPixel: number,
  yMmPerPixel: number,
): boolean {
  if (
    !Number.isFinite(xMmPerPixel) ||
    !Number.isFinite(yMmPerPixel) ||
    xMmPerPixel <= 0 ||
    yMmPerPixel <= 0
  ) {
    return false;
  }
  const mean = (xMmPerPixel + yMmPerPixel) / 2;
  return Math.abs(xMmPerPixel - yMmPerPixel) / mean > SCALE_TOLERANCE;
}

export type PixelMeasurement = { mm: number } | { mm: null; reason: string };

/**
 * Measure a length from pixels — ONLY when the calibration is verified.
 * An unverified calibration (or a stated-only scale, which has no
 * calibration at all) is refused with a reason: a guessed scale is never
 * a verified measurement.
 */
export function measureFromPixels(
  cal: PixelCalibration,
  pixels: number,
): PixelMeasurement {
  if (!cal.calibration.verified) {
    return {
      mm: null,
      reason:
        'Calibration is not verified: measure only from a calibration verified against known dimensions.',
    };
  }
  if (!Number.isFinite(pixels) || pixels < 0) {
    return { mm: null, reason: `Invalid pixel length: ${pixels}` };
  }
  return { mm: pixels * cal.mmPerPixel };
}

/**
 * I6 — Scale calibration suite (plain-tsx assertion script, NO vitest).
 *
 * Ground truth is hand-verified: a 3500 mm dimension spanning 700 px is
 * exactly 5 mm/px, so every expected value below is arithmetic, not a guess.
 *
 * Run from repo root:
 *   npx --yes tsx src/test/dedVisionScale.test.ts
 */

import {
  SCALE_TOLERANCE,
  calibrateFromDimension,
  detectNonUniformScaling,
  measureFromPixels,
  parseStatedScale,
  verifyCalibration,
} from '../ai-tools/ded-vision/scale';

let passed = 0;
let total = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  total += 1;
  const ok =
    typeof actual === 'number' && typeof expected === 'number'
      ? Math.abs(actual - expected) < 1e-9
      : actual === expected;
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function checkTrue(name: string, value: boolean): void {
  check(name, value, true);
}

function checkThrows(name: string, fn: () => unknown): void {
  total += 1;
  try {
    fn();
    failures.push(`${name}: expected a throw, but nothing was thrown`);
  } catch {
    passed += 1;
  }
}

// --- Tolerance constant -------------------------------------------------
check('tolerance is 2%', SCALE_TOLERANCE, 0.02);

// --- parseStatedScale: each written form --------------------------------
check('parse 1:20', parseStatedScale('SKALA 1:20'), '1:20');
check('parse 1:50', parseStatedScale('1:50'), '1:50');
check('parse 1:100', parseStatedScale('1:100'), '1:100');
check('parse 1:200', parseStatedScale('DENAH SKALA 1:200'), '1:200');
check('parse other 1:N form (1:75)', parseStatedScale('1:75'), '1:75');
check('parse spaced form 1 : 100', parseStatedScale('1 : 100'), '1:100');
check('parse SKALA 1 : 50', parseStatedScale('SKALA 1 : 50'), '1:50');
check('parse lowercase skala with =', parseStatedScale('skala = 1:100'), '1:100');
check('parse normalizes leading zeros', parseStatedScale('1:050'), '1:50');
check('parse ignores 21:100 (not a 1:N scale)', parseStatedScale('21:100'), null);

// --- I10b E2: mix ratios are NOT scales -----------------------------------
// Triple ratios (concrete mix notation) are skipped; scanning continues
// for a real scale later in the text.
check('triple ratio R.C.C 1:2:4 → null', parseStatedScale('R.C.C 1:2:4'), null);
check('triple ratio C.C-1:2:4 mix → null', parseStatedScale('C.C-1:2:4 mix'), null);
check('triple ratio P.C.C 1:5:10 → null', parseStatedScale('P.C.C 1:5:10 - 23cm TK'), null);
check('triple ratio then a real scale → the scale', parseStatedScale('R.C.C 1:2:4 SCALE - 1:100'), '1:100');
check('triple ratio then SKALA 1:50 → 1:50', parseStatedScale('BETON 1:2:3 dan SKALA 1:50'), '1:50');
// Two-part mix ratios (cement-mortar notation) are skipped too — the
// material keyword immediately before the ratio is the discriminator.
check('two-part mix C.M 1:5 → null', parseStatedScale('Brickwork in C.M 1:5'), null);
check('two-part mix IN CM 1:4 → null', parseStatedScale('IN CM 1:4'), null);
check('two-part mix C.M-1:5 mix → null', parseStatedScale('C.M-1:5 mix'), null);
check('ratio followed by "mix" → null', parseStatedScale('1:5 mix'), null);
// A standalone 1:N is still a scale (1:1/1:2/1:5 are real detail scales),
// and a material word EARLIER in the sentence must not swallow a scale.
check('standalone 1:2 still parses', parseStatedScale('1:2'), '1:2');
check('standalone 1:5 still parses', parseStatedScale('1:5'), '1:5');
check('R.C.C DETAILS SCALE 1:50 → 1:50 (SCALE sits between)', parseStatedScale('R.C.C DETAILS SCALE 1:50'), '1:50');
check('SCALE RATIO 1:100 → 1:100', parseStatedScale('SCALE RATIO 1:100'), '1:100');

// --- parseStatedScale: no stated scale → null, NEVER a default ----------
check('no scale in text → null', parseStatedScale('DENAH LANTAI 1'), null);
check('empty text → null', parseStatedScale(''), null);
check('dimension text without scale → null', parseStatedScale('3.500 x 3.000'), null);
check('bare number without 1: prefix → null', parseStatedScale('POTONGAN A-A 100'), null);

// --- calibrateFromDimension ---------------------------------------------
const cal = calibrateFromDimension(3500, 700, 3, '1:100');
check('calibration 3500 mm / 700 px = 5 mm/px', cal.mmPerPixel, 5);
check('calibration method is PIXEL_CALIBRATED', cal.calibration.method, 'PIXEL_CALIBRATED');
check('calibration starts unverified', cal.calibration.verified, false);
check('calibration status starts UNRESOLVED', cal.calibration.status, 'UNRESOLVED');
check('calibration keeps stated scale', cal.calibration.statedScale, '1:100');
check('calibration keeps page', cal.calibration.page, 3);
check('calibration records source dimension', cal.calibration.calibratedFrom?.dimensionMm, 3500);
check('calibration records source pixels', cal.calibration.calibratedFrom?.pixels, 700);
check('calibration uncertainty unknown before verification', cal.calibration.uncertaintyPct, null);

const calNoScale = calibrateFromDimension(3500, 700, 3);
check('no stated scale → statedScale null, never a default', calNoScale.calibration.statedScale, null);

checkThrows('calibrate rejects zero pixels', () => calibrateFromDimension(3500, 0, 1));
checkThrows('calibrate rejects negative dimension', () => calibrateFromDimension(-3500, 700, 1));
checkThrows('calibrate rejects NaN pixels', () => calibrateFromDimension(3500, Number.NaN, 1));

// --- verifyCalibration: passing checks ----------------------------------
const verified = verifyCalibration(cal, [
  { dimensionMm: 3000, pixels: 600 }, // exactly 5 mm/px
  { dimensionMm: 2500, pixels: 500 }, // exactly 5 mm/px
]);
checkTrue('verification passes with consistent checks', verified.calibration.verified);
check('verified status is HIGH_CONFIDENCE', verified.calibration.status, 'HIGH_CONFIDENCE');
check('verified uncertainty is 0% for exact checks', verified.calibration.uncertaintyPct, 0);
check('verification keeps mmPerPixel', verified.mmPerPixel, 5);

// Boundary: 3000 mm predicts 600 px; 612 px is 12/612 = 1.96% off → pass.
const boundaryPass = verifyCalibration(cal, [{ dimensionMm: 3000, pixels: 612 }]);
checkTrue('check within 2% tolerance passes (1.96%)', boundaryPass.calibration.verified);

// Boundary: 613 px is 13/613 = 2.12% off → fail.
const boundaryFail = verifyCalibration(cal, [{ dimensionMm: 3000, pixels: 613 }]);
check('check beyond 2% tolerance fails (2.12%)', boundaryFail.calibration.verified, false);
check('failed verification status is UNRESOLVED', boundaryFail.calibration.status, 'UNRESOLVED');

// --- verifyCalibration: failing check -----------------------------------
const failed = verifyCalibration(cal, [
  { dimensionMm: 3000, pixels: 600 },
  { dimensionMm: 3000, pixels: 700 }, // predicts 600 px, measures 700 → 16.7% off
]);
check('verification fails with an inconsistent check', failed.calibration.verified, false);
check('failed verification status is UNRESOLVED (mixed checks)', failed.calibration.status, 'UNRESOLVED');
checkTrue(
  'failed verification still records uncertainty',
  typeof failed.calibration.uncertaintyPct === 'number' &&
    (failed.calibration.uncertaintyPct as number) > 2,
);

// --- verifyCalibration: zero checks → stays unverified -------------------
const noChecks = verifyCalibration(cal, []);
check('zero checks → stays unverified', noChecks.calibration.verified, false);
check('zero checks → status stays UNRESOLVED', noChecks.calibration.status, 'UNRESOLVED');

// --- verifyCalibration does not mutate its input -------------------------
check('input calibration still unverified after verify', cal.calibration.verified, false);

// --- detectNonUniformScaling ---------------------------------------------
checkTrue('non-uniform scaling detected (X 5.0 vs Y 5.5)', detectNonUniformScaling(5.0, 5.5));
check('uniform scaling not flagged (5.0 vs 5.0)', detectNonUniformScaling(5.0, 5.0), false);
check('1% X/Y difference not flagged (5.0 vs 5.05)', detectNonUniformScaling(5.0, 5.05), false);
checkTrue('3% X/Y difference flagged (5.0 vs 5.15)', detectNonUniformScaling(5.0, 5.15));
check('invalid input is not evidence of distortion', detectNonUniformScaling(5.0, 0), false);

// --- measureFromPixels ---------------------------------------------------
const refused = measureFromPixels(cal, 700);
check('measurement refused on unverified calibration', refused.mm, null);
checkTrue(
  'refusal carries a reason',
  refused.mm === null && typeof (refused as { reason: string }).reason === 'string' &&
    (refused as { reason: string }).reason.length > 0,
);

const allowed = measureFromPixels(verified, 700);
check('measurement allowed on verified calibration (700 px → 3500 mm)', allowed.mm, 3500);

const refusedAfterFail = measureFromPixels(failed, 700);
check('measurement refused after failed verification', refusedAfterFail.mm, null);

const refusedBadPixels = measureFromPixels(verified, -10);
check('measurement refused for negative pixels', refusedBadPixels.mm, null);

// --- Summary --------------------------------------------------------------
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
}
console.log(`PASS ${passed}/${total}`);
if (passed !== total) process.exit(1);

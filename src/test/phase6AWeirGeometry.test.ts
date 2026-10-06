/**
 * PHASE 6A — WEIR GEOMETRY TEST
 *
 * Validates the Weir Body geometry formula against the golden case:
 *   L = 25 m, H = 3.5 m, Wc = 2 m, Wb = 6 m
 *   → Area = ((2 + 6) / 2) × 3.5 = 14 m²
 *   → Volume = 14 × 25 = 350 m³
 *
 * Also validates edge cases and formula correctness.
 */

import { WeirCostService } from '../engine/weir/weirCostService';
import { WeirCostInput } from '../engine/weir/weirTypes';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    console.error(`  ✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg || 'Expected true');
}

console.log('====================================================');
console.log('PHASE 6A — WEIR GEOMETRY TEST');
console.log('====================================================\n');

const GOLDEN_INPUT: WeirCostInput = {
  weirLength: 25,
  weirHeight: 3.5,
  crestWidth: 2.0,
  baseWidth: 6.0,
  includeReinforcement: 1,
  includeFormwork: 1,
  includeJoint: 1,
  includeWaterstop: 1,
  rebarRatio: 85,
  projectLocation: 'Kabupaten Probolinggo',
};

// ── GOLDEN CASE ──────────────────────────────────────────────────────

test('Golden case: L=25, H=3.5, Wc=2, Wb=6 → Area = 14 m²', () => {
  const geom = WeirCostService.calculateGeometry(GOLDEN_INPUT);
  assertEqual(geom.crossSectionArea, 14, 'Cross-section area must be exactly 14 m²');
});

test('Golden case: Volume = 14 × 25 = 350 m³', () => {
  const geom = WeirCostService.calculateGeometry(GOLDEN_INPUT);
  assertEqual(geom.volume, 350, 'Volume must be exactly 350 m³');
});

test('Golden case: goldenCaseMatch flag is true', () => {
  const geom = WeirCostService.calculateGeometry(GOLDEN_INPUT);
  assertTrue(geom.goldenCaseMatch, 'goldenCaseMatch must be true for golden inputs');
});

test('Golden case: unit is m³', () => {
  const geom = WeirCostService.calculateGeometry(GOLDEN_INPUT);
  assertEqual(geom.unit, 'm³', 'Unit must be m³');
});

test('Golden case: formula steps are present', () => {
  const geom = WeirCostService.calculateGeometry(GOLDEN_INPUT);
  assertTrue(geom.formulaSteps.length >= 2, 'Must have at least 2 formula steps');
  assertTrue(geom.formulaSteps[0].includes('Area'), 'First step must mention Area');
  assertTrue(geom.formulaSteps[1].includes('Volume'), 'Second step must mention Volume');
});

// ── EDGE CASES ───────────────────────────────────────────────────────

test('Non-golden geometry: L=30, H=4, Wc=2.5, Wb=8 → Area=21, Vol=630', () => {
  const geom = WeirCostService.calculateGeometry({
    ...GOLDEN_INPUT,
    weirLength: 30,
    weirHeight: 4,
    crestWidth: 2.5,
    baseWidth: 8,
  });
  assertEqual(geom.crossSectionArea, 21, 'Area = ((2.5+8)/2)*4 = 21');
  assertEqual(geom.volume, 630, 'Volume = 21 * 30 = 630');
  assertTrue(!geom.goldenCaseMatch, 'goldenCaseMatch must be false for non-golden inputs');
});

test('Symmetric cross-section: Wc=Wb=4, H=3, L=10 → Area=12, Vol=120', () => {
  const geom = WeirCostService.calculateGeometry({
    ...GOLDEN_INPUT,
    weirLength: 10,
    weirHeight: 3,
    crestWidth: 4,
    baseWidth: 4,
  });
  assertEqual(geom.crossSectionArea, 12, 'Area = ((4+4)/2)*3 = 12');
  assertEqual(geom.volume, 120, 'Volume = 12 * 10 = 120');
});

test('Minimal geometry: L=2, H=0.5, Wc=0.5, Wb=1 → Area=0.375', () => {
  const geom = WeirCostService.calculateGeometry({
    ...GOLDEN_INPUT,
    weirLength: 2,
    weirHeight: 0.5,
    crestWidth: 0.5,
    baseWidth: 1,
  });
  assertEqual(geom.crossSectionArea, 0.375, 'Area = ((0.5+1)/2)*0.5 = 0.375');
  assertEqual(geom.volume, 0.75, 'Volume = 0.375 * 2 = 0.75');
});

// ── GEOMETRY IS DESIGN-DERIVED (NOT MODIFIED) ────────────────────────

test('Geometry is NOT modified by cost calculation — volume stays 350', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.geometry.volume, 350, 'Volume must remain 350 after full cost calculation');
  assertEqual(result.costSummary.volume, 350, 'Cost summary volume must be 350');
});

console.log('');

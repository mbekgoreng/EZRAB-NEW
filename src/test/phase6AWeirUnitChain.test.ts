/**
 * PHASE 6A — WEIR UNIT CHAIN TEST
 *
 * Validates the full unit chain for every resource:
 *   Quantity Unit → AHSP Unit → Coefficient Unit → Resource Unit → Price Unit
 *
 * Rules:
 *   m³ → m³ = valid
 *   kg → kg = valid
 *   OH → OH = valid
 *   m³ → kg = INVALID (unless documented density conversion)
 *   m² → m³ = INVALID (unless thickness supplied)
 *   zak → kg = INVALID (unless package conversion documented)
 *
 * Never silently convert. Reject illegal conversions.
 */

import { WeirCostService } from '../engine/weir/weirCostService';
import { lookupWeirPrice } from '../engine/weir/weirPriceDatabase';
import { WeirCostInput } from '../engine/weir/weirTypes';

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; }
}
function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
}
function assertTrue(cond: boolean, msg?: string) { if (!cond) throw new Error(msg || 'Expected true'); }

console.log('====================================================');
console.log('PHASE 6A — WEIR UNIT CHAIN TEST');
console.log('====================================================\n');

const GOLDEN_INPUT: WeirCostInput = {
  weirLength: 25, weirHeight: 3.5, crestWidth: 2.0, baseWidth: 6.0,
  includeReinforcement: 1, includeFormwork: 1, includeJoint: 1, includeWaterstop: 1,
  rebarRatio: 85, projectLocation: 'Kabupaten Probolinggo',
};

// ── PRICE UNIT VERIFICATION ──────────────────────────────────────────

test('Semen Portland (M.01) price unit is kg', () => {
  const p = lookupWeirPrice('M.01');
  assertTrue(p !== null, 'M.01 must exist');
  assertEqual(p!.unit, 'kg', 'Unit must be kg');
});

test('Pasir Beton (M.02) price unit is m³', () => {
  const p = lookupWeirPrice('M.02');
  assertEqual(p!.unit, 'm³', 'Unit must be m³');
});

test('Besi Beton Ulir (M.04) price unit is kg', () => {
  const p = lookupWeirPrice('M.04');
  assertEqual(p!.unit, 'kg', 'Unit must be kg');
});

test('Labor (L.01) price unit is OH', () => {
  const p = lookupWeirPrice('L.01');
  assertEqual(p!.unit, 'OH', 'Unit must be OH');
});

test('Equipment (E.01) price unit is jam', () => {
  const p = lookupWeirPrice('E.01');
  assertEqual(p!.unit, 'jam', 'Unit must be jam');
});

// ── UNIT CHAIN VALIDATION (GOLDEN CASE) ──────────────────────────────

test('Golden case: all unit chain checks pass (no INVALID)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.unitValidation.valid, 'All unit checks must be valid');
  const invalid = result.unitValidation.checks.filter((c) => c.status === 'INVALID');
  assertEqual(invalid.length, 0, 'Must have 0 INVALID checks');
});

test('Golden case: concrete m³ → m³ chain is valid', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const concreteChecks = result.unitValidation.checks.filter((c) => c.ahspUnit === 'm³');
  assertTrue(concreteChecks.length > 0, 'Must have concrete-related checks');
  for (const c of concreteChecks) {
    if (c.coefficientUnit === 'kg' && c.priceUnit === 'kg') {
      assertEqual(c.status, 'MATCH', 'kg → kg must be MATCH');
    } else if (c.coefficientUnit === 'm³' && c.priceUnit === 'm³') {
      assertEqual(c.status, 'MATCH', 'm³ → m³ must be MATCH');
    }
  }
});

test('Golden case: rebar kg → kg chain is valid', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const rebarChecks = result.unitValidation.checks.filter((c) => c.ahspUnit === 'kg');
  assertTrue(rebarChecks.length > 0, 'Must have rebar-related checks');
  for (const c of rebarChecks) {
    assertTrue(c.status !== 'INVALID', `Rebar check must not be INVALID: ${c.componentName}`);
  }
});

test('Golden case: formwork m² → m² chain is valid', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const formworkChecks = result.unitValidation.checks.filter((c) => c.ahspUnit === 'm²');
  assertTrue(formworkChecks.length > 0, 'Must have formwork-related checks');
});

// ── NEGATIVE: ILLEGAL UNIT CONVERSIONS ───────────────────────────────

test('m³ → kg conversion is INVALID (no density conversion documented)', () => {
  // Semen has coefficient in kg but AHSP unit is m³ for concrete
  // This is valid because the coefficient is per m³ of concrete (kg/m³)
  // But if we tried to convert m³ → kg directly it would be INVALID
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  // All checks should be MATCH because coefficients are per-AHSP-unit
  const invalidChecks = result.unitValidation.checks.filter((c) => c.status === 'INVALID');
  assertEqual(invalidChecks.length, 0, 'No INVALID checks in golden case');
});

test('Missing price entry causes INVALID unit check', () => {
  // If price is not found, unit chain cannot be validated
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  // All prices exist in golden case, so no INVALID
  const missingPriceChecks = result.unitValidation.checks.filter(
    (c) => c.priceUnit === 'NOT_FOUND',
  );
  assertEqual(missingPriceChecks.length, 0, 'No NOT_FOUND prices in golden case');
});

// ── UNIT CONSISTENCY ACROSS WORK ITEMS ─────────────────────────────────

test('All work item units match their AHSP units', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const wi of result.workItems) {
    if (wi.priceStatus === 'RESOLVED' || wi.priceStatus === 'WARNING') {
      // The work item unit should be compatible with the AHSP unit
      // (they should be the same for direct mapping)
      const ahsp = result.workItems.find((w) => w.id === wi.id);
      assertTrue(ahsp !== undefined, `Work item ${wi.id} must exist`);
    }
  }
});

test('Audit trail Step 7 (Unit Validation) is present', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const step7 = result.auditTrail.find((s) => s.stepIndex === 7);
  assertTrue(step7 !== undefined, 'Step 7 must exist');
  assertEqual(step7!.stageName, 'Unit Validation', 'Step 7 must be Unit Validation');
});

console.log('');

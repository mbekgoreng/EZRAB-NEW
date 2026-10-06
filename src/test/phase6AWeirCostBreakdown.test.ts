/**
 * PHASE 6A — WEIR COST BREAKDOWN TEST
 *
 * Validates the full cost breakdown:
 *   DIRECT COST (Labor + Material + Equipment)
 *   + SMKK
 *   + OVERHEAD
 *   + PROFIT
 *   + TAX
 *   = FINAL COST
 *
 * Every number must be independently traceable.
 */

import { WeirCostService } from '../engine/weir/weirCostService';
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
console.log('PHASE 6A — WEIR COST BREAKDOWN TEST');
console.log('====================================================\n');

const GOLDEN_INPUT: WeirCostInput = {
  weirLength: 25, weirHeight: 3.5, crestWidth: 2.0, baseWidth: 6.0,
  includeReinforcement: 1, includeFormwork: 1, includeJoint: 1, includeWaterstop: 1,
  rebarRatio: 85, projectLocation: 'Kabupaten Probolinggo',
};

// ── COST SUMMARY STRUCTURE ───────────────────────────────────────────

test('Cost summary has all required fields', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  assertTrue(s.volume !== undefined, 'Must have volume');
  assertTrue(s.unit !== undefined, 'Must have unit');
  assertTrue(s.directCost !== undefined, 'Must have directCost');
  assertTrue(s.laborCost !== undefined, 'Must have laborCost');
  assertTrue(s.materialCost !== undefined, 'Must have materialCost');
  assertTrue(s.equipmentCost !== undefined, 'Must have equipmentCost');
  assertTrue(s.smkk !== undefined, 'Must have smkk');
  assertTrue(s.overhead !== undefined, 'Must have overhead');
  assertTrue(s.profit !== undefined, 'Must have profit');
  assertTrue(s.tax !== undefined, 'Must have tax');
  assertTrue(s.finalCost !== undefined, 'Must have finalCost');
});

test('Direct cost = labor + material + equipment', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  const computed = s.laborCost + s.materialCost + s.equipmentCost;
  assertEqual(s.directCost, computed, 'Direct cost must equal L+M+E');
});

test('Final cost = direct + smkk + overhead + profit + tax', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  const computed = s.directCost + s.smkk + s.overhead + s.profit + s.tax;
  assertEqual(s.finalCost, computed, 'Final cost must equal D+SMKK+OH+P+T');
});

test('Volume in cost summary is 350 m³', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.costSummary.volume, 350, 'Volume must be 350');
  assertEqual(result.costSummary.unit, 'm³', 'Unit must be m³');
});

// ── DIRECT COST IS NOT ZERO ──────────────────────────────────────────

test('Direct cost > 0 (not the old Rp 17.5M fallback)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.costSummary.directCost > 0, 'Direct cost must be > 0');
  assertTrue(result.costSummary.directCost !== 17500000, 'Direct cost must NOT be the old Rp 17.5M fallback');
});

test('Final cost > 0', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.costSummary.finalCost > 0, 'Final cost must be > 0');
});

// ── COST IS NOT VOLUME × ARBITRARY UNIT PRICE ────────────────────────

test('Cost is NOT volume × 50,000 (old fallback)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const oldFallback = 350 * 50000;
  assertEqual(result.costSummary.finalCost === oldFallback, false, 'Must not equal old fallback');
});

test('Cost is NOT volume × 150,000', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const arbitrary = 350 * 150000;
  assertEqual(result.costSummary.finalCost === arbitrary, false, 'Must not equal arbitrary price');
});

// ── WORK ITEM BREAKDOWN ──────────────────────────────────────────────

test('Each work item has ahspCode, ahspDescription, ahspUnit', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const wi of result.workItems) {
    assertTrue(wi.ahspCode.length > 0, `Work item ${wi.name} must have ahspCode`);
    assertTrue(wi.ahspDescription.length > 0, `Work item ${wi.name} must have ahspDescription`);
    assertTrue(wi.ahspUnit.length > 0, `Work item ${wi.name} must have ahspUnit`);
  }
});

test('Each resolved work item has labor, material, equipment costs', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const wi of result.workItems) {
    if (wi.priceStatus === 'RESOLVED') {
      assertTrue(wi.laborCost >= 0, `Work item ${wi.name} must have laborCost`);
      assertTrue(wi.materialCost >= 0, `Work item ${wi.name} must have materialCost`);
      assertTrue(wi.equipmentCost >= 0, `Work item ${wi.name} must have equipmentCost`);
      assertTrue(wi.directCost >= 0, `Work item ${wi.name} must have directCost`);
    }
  }
});

test('Concrete work item direct cost > 0', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const concrete = result.workItems.find((w) => w.id === 'wi_weir_concrete')!;
  assertTrue(concrete.directCost > 0, 'Concrete direct cost must be > 0');
});

test('Rebar work item direct cost > 0', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const rebar = result.workItems.find((w) => w.id === 'wi_weir_rebar')!;
  assertTrue(rebar.directCost > 0, 'Rebar direct cost must be > 0');
});

// ── AUDIT TRAIL HAS 14 STEPS ─────────────────────────────────────────

test('Audit trail has exactly 14 steps', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.auditTrail.length, 14, 'Must have 14 audit steps');
});

test('Audit trail steps are numbered 1-14', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (let i = 0; i < 14; i++) {
    assertEqual(result.auditTrail[i].stepIndex, i + 1, `Step ${i + 1} must be at index ${i}`);
  }
});

test('Audit trail step names match required stages', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const expectedNames = [
    'Geometry', 'Quantity', 'Work Item', 'AHSP Mapping', 'Coefficient',
    'Resource', 'Unit Validation', 'Price Resolution', 'Direct Cost',
    'SMKK', 'Overhead', 'Profit', 'Tax', 'Final Cost',
  ];
  for (let i = 0; i < 14; i++) {
    assertEqual(result.auditTrail[i].stageName, expectedNames[i], `Step ${i + 1} name must match`);
  }
});

// ── PARETO ANALYSIS ───────────────────────────────────────────────────

test('Pareto analysis is present and sorted by contribution %', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.paretoAnalysis.length > 0, 'Must have Pareto entries');
  for (let i = 1; i < result.paretoAnalysis.length; i++) {
    assertTrue(
      result.paretoAnalysis[i - 1].contributionPercent >= result.paretoAnalysis[i].contributionPercent,
      'Pareto must be sorted descending',
    );
  }
});

test('Pareto contribution percentages sum to ~100%', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const total = result.paretoAnalysis.reduce((sum, p) => sum + p.contributionPercent, 0);
  assertTrue(total >= 99 && total <= 101, `Pareto must sum to ~100%, got ${total}%`);
});

console.log('');

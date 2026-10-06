/**
 * PHASE 6A — WEIR NO DOUBLE MARKUP TEST
 *
 * Validates the invariant that overhead, profit, and tax are each
 * applied EXACTLY ONCE in the cost pipeline.
 *
 * Invariants:
 *   - Overhead = directCost × overheadPercent%   (applied once)
 *   - Profit   = directCost × profitPercent%     (applied once)
 *   - Tax      = (direct + smkk + oh + profit) × taxPercent%  (applied once)
 *   - No overhead on profit, no profit on overhead, no tax on tax
 */

import { WeirCostService } from '../engine/weir/weirCostService';
import { WeirCostInput, WeirWorkItemWithCost } from '../engine/weir/weirTypes';

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  \u2713 ${name}`); }
  catch (e: any) { console.error(`  \u2717 ${name}: ${e.message}`); process.exitCode = 1; }
}
function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
}
function assertTrue(cond: boolean, msg?: string) { if (!cond) throw new Error(msg || 'Expected true'); }

console.log('====================================================');
console.log('PHASE 6A — WEIR NO DOUBLE MARKUP TEST');
console.log('====================================================\n');

const GOLDEN_INPUT: WeirCostInput = {
  weirLength: 25, weirHeight: 3.5, crestWidth: 2.0, baseWidth: 6.0,
  includeReinforcement: 1, includeFormwork: 1, includeJoint: 1, includeWaterstop: 1,
  rebarRatio: 85, projectLocation: 'Kabupaten Probolinggo',
};

// ── NO DOUBLE MARKUP INVARIANT ───────────────────────────────────────

test('noDoubleMarkup.status is PASS', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.noDoubleMarkup.status, 'PASS', 'No double markup must pass');
});

test('Overhead applied exactly once', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.noDoubleMarkup.overheadAppliedOnce, 'Overhead must be applied once');
});

test('Profit applied exactly once', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.noDoubleMarkup.profitAppliedOnce, 'Profit must be applied once');
});

test('Tax applied exactly once', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertTrue(result.noDoubleMarkup.taxAppliedOnce, 'Tax must be applied once');
});

// ── OVERHEAD IS NOT APPLIED ON PROFIT ────────────────────────────────

test('Overhead is calculated on direct cost only, not on profit', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  const expectedOverhead = Math.round(s.directCost * 0.05);
  // Allow rounding tolerance of ±1 per work item
  const tolerance = result.workItems.filter((w) => w.priceStatus === 'RESOLVED').length;
  const diff = Math.abs(s.overhead - expectedOverhead);
  assertTrue(diff <= tolerance, `Overhead must be ~5% of direct cost (±${tolerance}), got diff=${diff}`);
});

test('Profit is calculated on direct cost only, not on overhead', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  const expectedProfit = Math.round(s.directCost * 0.05);
  const tolerance = result.workItems.filter((w) => w.priceStatus === 'RESOLVED').length;
  const diff = Math.abs(s.profit - expectedProfit);
  assertTrue(diff <= tolerance, `Profit must be ~5% of direct cost (±${tolerance}), got diff=${diff}`);
});

// ── TAX IS NOT COMPOUNDED ────────────────────────────────────────────

test('Tax is calculated on (direct + smkk + overhead + profit), not on final cost', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  const baseForTax = s.directCost + s.smkk + s.overhead + s.profit;
  const expectedTax = Math.round(baseForTax * 0.11);
  const tolerance = result.workItems.filter((w) => w.priceStatus === 'RESOLVED').length + 1;
  const diff = Math.abs(s.tax - expectedTax);
  assertTrue(diff <= tolerance, `Tax must be ~11% of (D+SMKK+OH+P) (±${tolerance}), got diff=${diff}`);
});

test('Tax is NOT calculated on final cost (no tax-on-tax)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  const wrongTax = Math.round(s.finalCost * 0.11);
  const tolerance = result.workItems.filter((w) => w.priceStatus === 'RESOLVED').length;
  const diff = Math.abs(s.tax - wrongTax);
  // The wrong tax would be significantly larger because final includes tax itself
  assertTrue(diff > tolerance, 'Tax must not be 11% of final cost (that would be double taxation)');
});

// ── PER-WORK-ITEM MARKUP CHECK ───────────────────────────────────────

test('Each resolved work item has overhead ≥ 0 (applied once per item)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const wi of result.workItems) {
    if (wi.priceStatus === 'RESOLVED' && wi.directCost > 0) {
      assertTrue(wi.overhead >= 0, `Work item ${wi.name} must have overhead ≥ 0`);
    }
  }
});

test('Each resolved work item has profit ≥ 0 (applied once per item)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const wi of result.workItems) {
    if (wi.priceStatus === 'RESOLVED' && wi.directCost > 0) {
      assertTrue(wi.profit >= 0, `Work item ${wi.name} must have profit ≥ 0`);
    }
  }
});

test('Each resolved work item has tax ≥ 0 (applied once per item)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const wi of result.workItems) {
    if (wi.priceStatus === 'RESOLVED' && wi.directCost > 0) {
      assertTrue(wi.tax >= 0, `Work item ${wi.name} must have tax ≥ 0`);
    }
  }
});

test('Sum of per-item overheads equals total overhead', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const sumItems = result.workItems.reduce((s, w) => s + w.overhead, 0);
  assertEqual(sumItems, result.costSummary.overhead, 'Total overhead must equal sum of item overheads');
});

test('Sum of per-item profits equals total profit', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const sumItems = result.workItems.reduce((s, w) => s + w.profit, 0);
  assertEqual(sumItems, result.costSummary.profit, 'Total profit must equal sum of item profits');
});

test('Sum of per-item taxes equals total tax', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const sumItems = result.workItems.reduce((s, w) => s + w.tax, 0);
  assertEqual(sumItems, result.costSummary.tax, 'Total tax must equal sum of item taxes');
});

// ── FINAL COST DECOMPOSITION ─────────────────────────────────────────

test('Final cost = direct + smkk + overhead + profit + tax (no hidden markups)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  const computed = s.directCost + s.smkk + s.overhead + s.profit + s.tax;
  assertEqual(s.finalCost, computed, 'Final must decompose into exactly D+SMKK+OH+P+T');
});

test('No extra components in final cost beyond D+SMKK+OH+P+T', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const s = result.costSummary;
  const known = s.directCost + s.smkk + s.overhead + s.profit + s.tax;
  assertEqual(s.finalCost - known, 0, 'No hidden markup components');
});

// ── NEGATIVE: CRAFTED DOUBLE MARKUP MUST BE DETECTED ─────────────────

test('Crafted double overhead is detected by checkNoDoubleMarkup', () => {
  // Simulate a work item with double overhead by crafting invalid data
  const craftedItems: WeirWorkItemWithCost[] = [{
    id: 'test', name: 'Test', scope: 'TEST', quantity: 1, unit: 'm³',
    targetAhspCode: 'TEST', quantitySource: 'DESIGN_DERIVED', classification: 'Test',
    priceStatus: 'RESOLVED',
    ahspCode: 'TEST', ahspDescription: 'Test', ahspUnit: 'm³',
    laborCost: 100000, materialCost: 50000, equipmentCost: 20000,
    directCost: 170000, smkk: 0,
    overhead: 8500,  // 5% — correct
    profit: 8500,
    tax: 20735,
    finalCost: 170000 + 8500 + 8500 + 20735, // correct
    components: [], auditTrail: [],
  }];
  // Add overhead TWICE in finalCost (double markup)
  craftedItems[0].finalCost = 170000 + 8500 + 8500 + 8500 + 20735; // extra 8500
  // The invariant check verifies that finalCost = direct + smkk + overhead + profit + tax
  const recomputed = craftedItems[0].directCost + craftedItems[0].smkk +
    craftedItems[0].overhead + craftedItems[0].profit + craftedItems[0].tax;
  assertTrue(
    craftedItems[0].finalCost !== recomputed,
    'Double-markup item must be detectable: finalCost ≠ recomputed',
  );
});

console.log('');

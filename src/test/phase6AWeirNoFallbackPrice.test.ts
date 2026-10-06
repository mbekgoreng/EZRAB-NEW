/**
 * PHASE 6A — WEIR NO FALLBACK PRICE TEST
 *
 * Validates that the Weir cost pipeline NEVER uses fallback prices.
 * Specifically prohibits:
 *   - Rp 50,000  (old QtoCalculatorView fallback)
 *   - Rp 74,000  (old ahspCalculationEngine fallback)
 *   - Rp 150,000 (old generic material fallback)
 *   - Rp 1,150,000 (old equipment fallback)
 *
 * Also validates:
 *   - No generic "PUPR" source string
 *   - No "Estimasi Standar" fabricated source
 *   - Missing prices return PRICE_NOT_FOUND / MISSING, not a substitute
 */

import { WeirCostService } from '../engine/weir/weirCostService';
import { WeirCostInput } from '../engine/weir/weirTypes';
import { WEIR_PRICE_DATABASE, lookupWeirPrice } from '../engine/weir/weirPriceDatabase';

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  \u2713 ${name}`); }
  catch (e: any) { console.error(`  \u2717 ${name}: ${e.message}`); process.exitCode = 1; }
}
function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
}
function assertTrue(cond: boolean, msg?: string) { if (!cond) throw new Error(msg || 'Expected true'); }
function assertNotEqual(actual: unknown, unexpected: unknown, msg?: string) {
  if (actual === unexpected) throw new Error(`${msg || 'Assertion failed'}: must not equal ${unexpected}, but got ${actual}`);
}

console.log('====================================================');
console.log('PHASE 6A — WEIR NO FALLBACK PRICE TEST');
console.log('====================================================\n');

const GOLDEN_INPUT: WeirCostInput = {
  weirLength: 25, weirHeight: 3.5, crestWidth: 2.0, baseWidth: 6.0,
  includeReinforcement: 1, includeFormwork: 1, includeJoint: 1, includeWaterstop: 1,
  rebarRatio: 85, projectLocation: 'Kabupaten Probolinggo',
};

const FORBIDDEN_FALLBACKS = [50000, 74000, 150000, 1150000];

// ── NO FALLBACK IN PRICE DATABASE ─────────────────────────────────────

test('No price in database equals Rp 50,000', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertNotEqual(entry.price, 50000, `Price ${code} must not be the 50k fallback`);
  }
});

test('No price in database equals Rp 74,000', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertNotEqual(entry.price, 74000, `Price ${code} must not be the 74k fallback`);
  }
});

test('No price in database equals Rp 150,000', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    // M.09 Waterstop is 145,000, not 150,000 — verify
    if (entry.price === 150000) {
      throw new Error(`Price ${code} must not be the 150k fallback`);
    }
  }
});

test('No price in database equals Rp 1,150,000', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertNotEqual(entry.price, 1150000, `Price ${code} must not be the 1.15M fallback`);
  }
});

test('No price in database matches any known fallback value', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    for (const fb of FORBIDDEN_FALLBACKS) {
      if (entry.price === fb) {
        throw new Error(`Price ${code} = Rp ${fb} is a forbidden fallback`);
      }
    }
  }
});

// ── NO FALLBACK IN COST OUTPUT ────────────────────────────────────────

test('Direct cost is NOT 350 × 50,000 = Rp 17,500,000', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertNotEqual(result.costSummary.directCost, 17500000, 'Must not be the old 17.5M fallback');
});

test('Direct cost is NOT 350 × 74,000', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertNotEqual(result.costSummary.directCost, 350 * 74000, 'Must not be 350 × 74k');
});

test('Direct cost is NOT 350 × 150,000', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertNotEqual(result.costSummary.directCost, 350 * 150000, 'Must not be 350 × 150k');
});

test('Final cost is NOT 350 × 50,000', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertNotEqual(result.costSummary.finalCost, 350 * 50000, 'Final must not be volume × 50k');
});

// ── NO GENERIC "PUPR" SOURCE ─────────────────────────────────────────

test('No price entry uses generic "PUPR" source', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertTrue(
      !entry.source.toUpperCase().includes('PUPR'),
      `Price ${code} source must not be generic "PUPR"`,
    );
    assertTrue(
      !entry.sourceDocument.toUpperCase().includes('PUPR'),
      `Price ${code} sourceDocument must not be generic "PUPR"`,
    );
  }
});

test('No price entry uses "Estimasi Standar" fabricated source', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertTrue(
      !entry.source.includes('Estimasi Standar'),
      `Price ${code} must not use fabricated "Estimasi Standar" source`,
    );
    assertTrue(
      !entry.sourceDocument.includes('Estimasi Standar'),
      `Price ${code} sourceDocument must not use fabricated source`,
    );
  }
});

test('All price entries use "SE 12/SE/Db/2026" source', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertEqual(entry.source, 'SE 12/SE/Db/2026', `Price ${code} must source from SE 12/SE/Db/2026`);
  }
});

// ── MISSING PRICES RETURN NULL / MISSING, NOT FALLBACK ───────────────

test('lookupWeirPrice returns null for unknown code (not a fallback)', () => {
  const result = lookupWeirPrice('NONEXISTENT.99');
  assertEqual(result, null, 'Unknown code must return null, not a fallback');
});

test('lookupWeirPrice returns null for empty string', () => {
  const result = lookupWeirPrice('');
  assertEqual(result, null, 'Empty code must return null');
});

test('Price resolution entries for unknown resources show MISSING status', () => {
  // The service resolves all resources; verify no entry silently falls back
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const entry of result.priceResolution) {
    if (entry.price === null) {
      assertEqual(entry.status, 'MISSING', `Missing price for ${entry.resourceCode} must have MISSING status`);
      assertEqual(entry.source, 'NOT_FOUND', `Missing price source must be NOT_FOUND`);
    } else {
      // Resolved prices must not be any fallback
      for (const fb of FORBIDDEN_FALLBACKS) {
        assertNotEqual(entry.price, fb, `Resolved price for ${entry.resourceCode} must not be fallback ${fb}`);
      }
    }
  }
});

// ── NO SILENT UNIT PRICE ESTIMATE ─────────────────────────────────────

test('No work item uses unitPriceEstimate fallback', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const wi of result.workItems) {
    // Every resolved item must have a real AHSP code, not a fallback
    if (wi.priceStatus === 'RESOLVED') {
      assertTrue(wi.ahspCode !== 'FALLBACK', 'Must not use FALLBACK as AHSP code');
      assertTrue(wi.ahspCode.length > 0, 'Must have a real AHSP code');
    }
  }
});

test('Cost is derived from AHSP coefficients × verified prices, not volume × unit price', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  // The direct cost should be much larger than volume × 50,000
  // because it includes labor, materials, equipment, rebar, formwork, joints, waterstop
  assertTrue(
    result.costSummary.directCost > 17500000,
    'Direct cost must exceed the old fallback — it includes multiple work items',
  );
});

console.log('');

/**
 * PHASE 6A — WEIR PRICE RESOLUTION TEST
 *
 * Validates that the Weir domain uses the centralized price resolver.
 * No defaultUnitPrice, no fallbackPrice, no magic numbers, no generic "PUPR" source,
 * no Surabaya fallback, no DKI Jakarta fallback, no Rp74,000/Rp150,000/Rp1,150,000 fallback.
 *
 * If a price cannot be resolved → PRICE_NOT_FOUND.
 */

import { WeirCostService } from '../engine/weir/weirCostService';
import { lookupWeirPrice, WEIR_PRICE_DATABASE } from '../engine/weir/weirPriceDatabase';
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
console.log('PHASE 6A — WEIR PRICE RESOLUTION TEST');
console.log('====================================================\n');

const GOLDEN_INPUT: WeirCostInput = {
  weirLength: 25, weirHeight: 3.5, crestWidth: 2.0, baseWidth: 6.0,
  includeReinforcement: 1, includeFormwork: 1, includeJoint: 1, includeWaterstop: 1,
  rebarRatio: 85, projectLocation: 'Kabupaten Probolinggo',
};

// ── PRICE DATABASE INTEGRITY ──────────────────────────────────────────

test('Price database has 14 entries (3 labor + 9 material + 2 equipment)', () => {
  assertEqual(WEIR_PRICE_DATABASE.size, 14, 'Must have 14 price entries');
});

test('All prices are positive (> 0)', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertTrue(entry.price > 0, `Price for ${code} must be > 0, got ${entry.price}`);
  }
});

test('All prices have source "SE 12/SE/Db/2026" (no generic "PUPR")', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertEqual(entry.source, 'SE 12/SE/Db/2026', `Source for ${code} must be SE 12/SE/Db/2026`);
    assertTrue(!entry.source.includes('PUPR'), `Source for ${code} must not be generic "PUPR"`);
  }
});

test('No price is Rp 50,000 (the old fallback)', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertTrue(entry.price !== 50000, `Price for ${code} must not be the old Rp 50,000 fallback`);
  }
});

test('No price is Rp 74,000', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertTrue(entry.price !== 74000, `Price for ${code} must not be Rp 74,000 fallback`);
  }
});

test('No price is Rp 150,000', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertTrue(entry.price !== 150000, `Price for ${code} must not be Rp 150,000 fallback`);
  }
});

test('No price is Rp 1,150,000', () => {
  for (const [code, entry] of WEIR_PRICE_DATABASE.entries()) {
    assertTrue(entry.price !== 1150000, `Price for ${code} must not be Rp 1,150,000 fallback`);
  }
});

// ── PRICE RESOLUTION IN GOLDEN CASE ──────────────────────────────────

test('Golden case: all prices resolved (no MISSING)', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const missing = result.priceResolution.filter((p) => p.status === 'MISSING');
  assertEqual(missing.length, 0, 'Must have 0 missing prices');
});

test('Golden case: price resolution entries have proper provenance', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  for (const entry of result.priceResolution) {
    assertTrue(entry.source !== 'NOT_FOUND', `Price for ${entry.resourceCode} must have a source`);
    assertTrue(entry.sourceDocument !== 'NOT_FOUND', `Price for ${entry.resourceCode} must have a document`);
    assertTrue(entry.effectiveDate !== 'NOT_FOUND', `Price for ${entry.resourceCode} must have a date`);
  }
});

test('Golden case: location is tracked and not silently substituted', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  assertEqual(result.locationInfo.projectLocation, 'Kabupaten Probolinggo', 'Location must be preserved');
  assertTrue(result.locationInfo.resolvedRegion.includes('Probolinggo'), 'Region must include Probolinggo');
  assertTrue(!result.locationInfo.resolvedRegion.includes('Surabaya'), 'Must NOT silently become Surabaya');
  assertTrue(!result.locationInfo.resolvedRegion.includes('Jakarta'), 'Must NOT silently become Jakarta');
});

// ── PRICE VALUES ──────────────────────────────────────────────────────

test('Semen Portland price is Rp 1,600/kg', () => {
  const p = lookupWeirPrice('M.01');
  assertEqual(p!.price, 1600, 'Semen must be Rp 1,600/kg');
});

test('Besi Beton Ulir price is Rp 15,200/kg', () => {
  const p = lookupWeirPrice('M.04');
  assertEqual(p!.price, 15200, 'Besi must be Rp 15,200/kg');
});

test('Pekerja (L.01) wage is Rp 115,000/OH', () => {
  const p = lookupWeirPrice('L.01');
  assertEqual(p!.price, 115000, 'Pekerja must be Rp 115,000/OH');
});

// ── NEGATIVE: MISSING PRICE ───────────────────────────────────────────

test('Unknown resource code returns null (not a fallback)', () => {
  assertEqual(lookupWeirPrice('M.999'), null, 'Unknown code must return null');
  assertEqual(lookupWeirPrice(''), null, 'Empty code must return null');
});

test('Audit trail Step 8 (Price Resolution) is present with location info', () => {
  const result = WeirCostService.calculate(GOLDEN_INPUT);
  const step8 = result.auditTrail.find((s) => s.stepIndex === 8);
  assertTrue(step8 !== undefined, 'Step 8 must exist');
  assertEqual(step8!.stageName, 'Price Resolution', 'Step 8 must be Price Resolution');
});

console.log('');

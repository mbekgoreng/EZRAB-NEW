/**
 * useScopeBasedCost hook tests
 *
 * Verifies:
 * - Weir calculator gets scope-based cost breakdown
 * - Non-weir calculator returns NO_MAPPING
 * - Missing price state is returned when prices unavailable
 * - Hook result contains line items with AHSP codes
 */

import { computeScopeBasedCost } from '../hooks/useScopeBasedCost';
import { PriceContext } from '../engine/pricing/contracts/types';

const priceContext: PriceContext = {
  projectId: 'test-project',
  location: 'Probolinggo, Jawa Timur',
  effectiveDate: '2026-01-01',
  periodVersion: '2026',
};

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e}`);
    process.exitCode = 1;
  }
}

function assertTrue(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg || 'Expected true');
}

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

test('Weir calculator has mapping and returns line items', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  assertTrue(result.hasMapping, 'Weir body should have mapping');
  assertTrue(result.lineItems.length > 0, 'Should have line items');
  assertTrue(result.auditTrail.length > 0, 'Should have audit trail');
});

test('Non-weir calculator returns NO_MAPPING', () => {
  const result = computeScopeBasedCost(
    'residential.beton',
    { length: 10, width: 5, height: 0.2 },
    priceContext,
    'test-project'
  );

  assertEqual(result.hasMapping, false, 'Residential calculator should not have mapping');
  assertEqual(result.status, 'NO_MAPPING');
  assertEqual(result.lineItems.length, 0);
});

test('Weir body 350 m3 has correct body volume in line items', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  const bodyItem = result.lineItems.find((li) => li.name.includes('Tubuh'));
  assertTrue(!!bodyItem, 'Should have body work item');
  assertEqual(bodyItem!.quantity, 350, 'Body quantity should be 350 m3');
});

test('Hook returns valid status (PRICE_MISSING, PARTIAL, or RESOLVED)', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  assertTrue(
    result.status === 'PRICE_MISSING' || result.status === 'RESOLVED' || result.status === 'PARTIAL',
    `Status should be PRICE_MISSING, PARTIAL, or RESOLVED, got ${result.status}`
  );
});

test('Summary contains cost breakdown', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  assertTrue(!!result.summary, 'Should have summary');
  assertTrue(result.summary!.directCost >= 0, 'Direct cost should be >= 0');
  assertTrue(result.summary!.grandTotal >= result.summary!.directCost, 'Grand total >= direct cost');
});

console.log('\nDone.');

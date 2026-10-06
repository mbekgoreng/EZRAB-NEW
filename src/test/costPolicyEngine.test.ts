/**
 * CostPolicyEngine tests
 *
 * Verifies:
 * - AHSP lookup by code from official dataset
 * - Cost composition with real coefficients
 * - Missing price handling (PRICE_NOT_FOUND)
 * - Missing AHSP handling (AHSP_MISSING)
 * - Policy application (overhead + profit + tax)
 * - Audit trail generation
 */

import { CostPolicyEngine } from '../engine/cost/policy/costPolicyEngine';
import { BINA_MARGA_AHSP_2026_OFFICIAL } from '../data/nationalCostDatabase/binaMargaCanonical';
import { PriceContext } from '../engine/pricing/contracts/types';

const engine = new CostPolicyEngine();

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

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg || 'Expected true');
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

test('Lookup AHSP 2.1.(1) from official dataset', () => {
  const item = BINA_MARGA_AHSP_2026_OFFICIAL.find((i) => i.code === '2.1.(1)');
  assertTrue(!!item, 'Item 2.1.(1) should exist');
  assertEqual(item!.name, 'Galian untuk Selokan Drainase dan Saluran Air');
  assertEqual(item!.unit, 'm3');
  assertTrue(item!.laborComponents.length > 0, 'Should have labor components');
});

test('Calculate cost for drainage excavation with real AHSP', () => {
  const result = engine.calculate(
    [{ name: 'Galian Drainase', quantity: 100, unit: 'm3', ahspCode: '2.1.(1)' }],
    BINA_MARGA_AHSP_2026_OFFICIAL,
    {},
    priceContext,
    'test-project'
  );

  assertEqual(result.lineItems.length, 1, 'Should have 1 line item');
  assertEqual(result.lineItems[0].ahspCode, '2.1.(1)');
  assertTrue(result.lineItems[0].composition.status === 'PRICE_MISSING' || result.lineItems[0].composition.status === 'COMPLETE', 'Status should be PRICE_MISSING or COMPLETE');
  assertTrue(result.auditTrail.some((s) => s.includes('COMPOSED:')), 'Should have audit trail');
});

test('Missing AHSP returns AHSP_MISSING', () => {
  const result = engine.calculate(
    [{ name: 'Pekerjaan Tidak Dikenal', quantity: 50, unit: 'm3', ahspCode: '99.99.(99)' }],
    BINA_MARGA_AHSP_2026_OFFICIAL,
    {},
    priceContext,
    'test-project'
  );

  assertEqual(result.status, 'AHSP_MISSING');
  assertEqual(result.lineItems.length, 0);
  assertTrue(result.missingAHSPs.length > 0, 'Should report missing AHSP');
});

test('Policy defaults are applied correctly', () => {
  const result = engine.calculate(
    [{ name: 'Galian Drainase', quantity: 100, unit: 'm3', ahspCode: '2.1.(1)' }],
    BINA_MARGA_AHSP_2026_OFFICIAL,
    { overheadPercent: 10, profitPercent: 10, taxPercent: 11 },
    priceContext,
    'test-project'
  );

  assertEqual(result.policy.overheadPercent, 10);
  assertEqual(result.policy.profitPercent, 10);
  assertEqual(result.policy.taxPercent, 11);
  assertTrue(result.summary.grandTotal >= result.summary.directCost, 'Grand total should be >= direct cost');
});

test('Audit trail contains summary line', () => {
  const result = engine.calculate(
    [{ name: 'Galian Drainase', quantity: 100, unit: 'm3', ahspCode: '2.1.(1)' }],
    BINA_MARGA_AHSP_2026_OFFICIAL,
    {},
    priceContext,
    'test-project'
  );

  assertTrue(result.auditTrail.some((s) => s.startsWith('SUMMARY:')), 'Should have SUMMARY line');
});

test('UNREADABLE AHSP is rejected', () => {
  // Create a fake unreadable item
  const unreadableItem = {
    ...BINA_MARGA_AHSP_2026_OFFICIAL[0],
    code: 'UNREADABLE.TEST',
    codeNormalized: 'UNREADABLE.TEST',
    readability: 'UNREADABLE' as const,
    laborComponents: [
      { ...BINA_MARGA_AHSP_2026_OFFICIAL[0].laborComponents[0], coefficient: 0, total: 1000, readability: 'LOST_COEF' as const },
    ],
  };

  const result = engine.calculate(
    [{ name: 'Test Unreadable', quantity: 10, unit: 'm3', ahspCode: 'UNREADABLE.TEST' }],
    [unreadableItem],
    {},
    priceContext,
    'test-project'
  );

  assertTrue(
    result.auditTrail.some((s) => s.includes('AHSP_UNREADABLE')),
    'Should flag unreadable AHSP'
  );
});

console.log('\nDone.');

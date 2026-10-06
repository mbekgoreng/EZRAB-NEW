/**
 * ScopeBasedCostCalculator tests
 *
 * Verifies:
 * - Weir geometry breakdown into scope-based work items
 * - AHSP code mapping via registry
 * - Cost calculation via CostPolicyEngine
 * - Scope breakdown structure
 */

import { ScopeBasedCostCalculator } from '../engine/cost/scope/scopeBasedCostCalculator';
import { BINA_MARGA_AHSP_2026_OFFICIAL } from '../data/nationalCostDatabase/binaMargaCanonical';
import { PriceContext } from '../engine/pricing/contracts/types';

const calculator = new ScopeBasedCostCalculator();

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

test('Weir body 350 m3 produces multiple scopes', () => {
  const result = calculator.calculateWeir(
    {
      weirLength: 25,
      weirHeight: 3.5,
      crestWidth: 2,
      baseWidth: 6,
      crestArcLength: 4.5,
      skinThickness: 0.25,
      apronWidth: 25,
      apronLength: 10,
      apronThickness: 0.8,
      basinWidth: 25,
      basinLength: 12,
      basinSlabThickness: 1.0,
      endSillHeight: 0.8,
    },
    BINA_MARGA_AHSP_2026_OFFICIAL,
    priceContext,
    'test-weir-project'
  );

  assertEqual(result.structureType, 'weir');
  assertTrue(result.scopes.length >= 6, `Should have at least 6 scopes, got ${result.scopes.length}`);

  const scopeIds = result.scopes.map((s) => s.scopeId);
  assertTrue(scopeIds.includes('earthwork'), 'Should have earthwork scope');
  assertTrue(scopeIds.includes('foundation'), 'Should have foundation scope');
  assertTrue(scopeIds.includes('body'), 'Should have body scope');
  assertTrue(scopeIds.includes('spillway'), 'Should have spillway scope');
  assertTrue(scopeIds.includes('apron'), 'Should have apron scope');
  assertTrue(scopeIds.includes('stilling-basin'), 'Should have stilling-basin scope');
});

test('Body volume matches calculator formula', () => {
  const result = calculator.calculateWeir(
    {
      weirLength: 25,
      weirHeight: 3.5,
      crestWidth: 2,
      baseWidth: 6,
    },
    BINA_MARGA_AHSP_2026_OFFICIAL,
    priceContext,
    'test-weir-project'
  );

  const bodyScope = result.scopes.find((s) => s.scopeId === 'body');
  assertTrue(!!bodyScope, 'Should have body scope');

  const concreteItem = bodyScope!.workItems.find((w) => w.name.includes('Beton'));
  assertTrue(!!concreteItem, 'Should have concrete work item');

  // Expected: ((2+6)/2) * 3.5 * 25 = 350 m3
  assertEqual(concreteItem!.quantity, 350, 'Body volume should be 350 m3');
});

test('Cost result has audit trail', () => {
  const result = calculator.calculateWeir(
    {
      weirLength: 25,
      weirHeight: 3.5,
      crestWidth: 2,
      baseWidth: 6,
    },
    BINA_MARGA_AHSP_2026_OFFICIAL,
    priceContext,
    'test-weir-project'
  );

  assertTrue(result.costResult.auditTrail.length > 0, 'Should have audit trail');
  assertTrue(result.costResult.auditTrail.some((s) => s.startsWith('SUMMARY:')), 'Should have SUMMARY line');
});

test('Work items have AHSP codes', () => {
  const result = calculator.calculateWeir(
    {
      weirLength: 25,
      weirHeight: 3.5,
      crestWidth: 2,
      baseWidth: 6,
    },
    BINA_MARGA_AHSP_2026_OFFICIAL,
    priceContext,
    'test-weir-project'
  );

  const allWorkItems = result.scopes.flatMap((s) => s.workItems);
  const itemsWithCode = allWorkItems.filter((w) => w.ahspCode);
  assertTrue(itemsWithCode.length > 0, 'Should have work items with AHSP codes');

  // Verify at least one code exists in official dataset
  const officialCodes = new Set(BINA_MARGA_AHSP_2026_OFFICIAL.map((i) => i.code));
  const matchedCodes = itemsWithCode.filter((w) => officialCodes.has(w.ahspCode!));
  assertTrue(matchedCodes.length > 0, 'At least one AHSP code should match official dataset');
});

test('Excavation volume is larger than body volume', () => {
  const result = calculator.calculateWeir(
    {
      weirLength: 25,
      weirHeight: 3.5,
      crestWidth: 2,
      baseWidth: 6,
    },
    BINA_MARGA_AHSP_2026_OFFICIAL,
    priceContext,
    'test-weir-project'
  );

  const earthworkScope = result.scopes.find((s) => s.scopeId === 'earthwork');
  assertTrue(!!earthworkScope, 'Should have earthwork scope');

  const excavationItem = earthworkScope!.workItems.find((w) => w.name.includes('Galian'));
  assertTrue(!!excavationItem, 'Should have excavation item');
  assertTrue(excavationItem!.quantity > 350, 'Excavation should be > 350 m3 (working space)');
});

console.log('\nDone.');

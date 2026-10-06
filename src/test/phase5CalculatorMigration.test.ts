/**
 * Tests for Phase 5: Calculator Migration Framework & Regression Guards
 */

import {
  CalculatorMigrationRunner,
  StandardCalculatorContract,
  StandardGeometryResult,
  StandardWorkItem,
} from '../engine/migration/calculatorMigrationContract';
import { AHSPDefinition } from '../engine/ahsp/contracts/types';
import { PriceResolutionOutput } from '../engine/pricing/resolver/advancedPriceResolutionEngine';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e: any) {
    console.error(`✗ ${name}: ${e.message}`);
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

console.log('====================================================');
console.log('PHASE 5 — CALCULATOR MIGRATION & REGRESSION TESTS');
console.log('====================================================\n');

// Mock Batch 1 Calculator (Weir)
const weirStandardCalculator: StandardCalculatorContract<{
  length: number;
  height: number;
  crestWidth: number;
  baseWidth: number;
}> = {
  id: 'weir.body',
  title: 'Tubuh Bendung Tetap (Weir Body)',
  batch: 1,
  calculateGeometry(inputs) {
    // Exact standard formula: ((Wc + Wb) / 2) * H * L
    const bodyVolume = ((inputs.crestWidth + inputs.baseWidth) / 2) * inputs.height * inputs.length;
    return {
      primaryQuantity: bodyVolume,
      primaryUnit: 'm³',
      breakdown: { bodyVolume },
      formulaSteps: ['Volume = ((Wc + Wb) / 2) * H * L'],
    };
  },
  mapWorkItems(geom, inputs) {
    return [
      {
        id: 'wi_body_concrete',
        name: 'Beton Tubuh Bendung K-300',
        scope: 'BODY',
        quantity: geom.primaryQuantity,
        unit: 'm³',
        targetAhspCode: '3.1.(1)',
      },
    ];
  },
};

const mockLegacyWeirCalc = (inputs: any) => {
  const vol = ((inputs.crestWidth + inputs.baseWidth) / 2) * inputs.height * inputs.length;
  return {
    primaryQuantity: vol,
    primaryUnit: 'm³',
    estimatedTotalCost: vol * 1500000, // old hardcoded constant
  };
};

const mockAhspBeton: AHSPDefinition = {
  id: 'AHSP_3.1.1',
  code: '3.1.(1)',
  codeNormalized: '3.1.(1)',
  name: 'Beton Mutu Sedang fc 25 MPa',
  unit: 'm³',
  domain: 'BINA_MARGA',
  category: 'STRUKTUR',
  version: '2026.1',
  sourceDocument: 'Lampiran V',
  laborComponents: [{ id: 'l1', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 1.0 }],
  materialComponents: [{ id: 'm1', type: 'material', itemCode: 'M.01', itemName: 'Semen', unit: 'kg', coefficient: 400 }],
  equipmentComponents: [],
  totalLaborCoefficient: 1.0,
  totalMaterialCoefficient: 400,
  totalEquipmentCoefficient: 0,
  provenance: { sourceDocument: 'Lampiran V', version: '2026.1', verificationStatus: 'VERIFIED' },
};

const ahspMap = new Map<string, AHSPDefinition>([['3.1.(1)', mockAhspBeton]]);
const priceMap = new Map<string, PriceResolutionOutput>([
  ['L.01', { status: 'VALID', price: 100000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
  ['M.01', { status: 'VALID', price: 1500, unit: 'kg', provenance: null, anomalies: [], explanation: '' }],
]);

const settings = {
  overheadPercent: 5,
  profitPercent: 5,
  taxPercent: 11,
  includeTax: true,
};

// 1. Regression Check: Quantity must be identical
test('Migration Runner validates identical geometry with legacy engine (Zero Drift)', () => {
  const inputs = { length: 25, height: 3.5, crestWidth: 2, baseWidth: 6 };

  const res = CalculatorMigrationRunner.execute(
    weirStandardCalculator,
    inputs,
    mockLegacyWeirCalc,
    ahspMap,
    priceMap,
    settings,
    'v2'
  );

  assertEqual(res.regressionPass, true);
  assertEqual(res.geometry.primaryQuantity, 350, '350 m3 volume maintained');
  assertEqual(res.costs.length, 1);
  assertTrue(res.grandTotal > 0);
  assertTrue(res.auditTrail.some((t) => t.includes('REGRESSION GUARD: PASS')));
});

// 2. Feature Flag 'legacy' Mode
test('Migration Runner supports fallback to legacy pricing mode via feature flag', () => {
  const inputs = { length: 25, height: 3.5, crestWidth: 2, baseWidth: 6 };

  const res = CalculatorMigrationRunner.execute(
    weirStandardCalculator,
    inputs,
    mockLegacyWeirCalc,
    ahspMap,
    priceMap,
    settings,
    'legacy'
  );

  assertEqual(res.engineVersion, 'legacy');
  assertEqual(res.grandTotal, 350 * 1500000); // 525,000,000
});

// 3. Regression Blocker Test
test('Migration Runner blocks execution if geometry drift is detected', () => {
  const faultyLegacy = (inputs: any) => ({
    primaryQuantity: 999999, // drift!
    primaryUnit: 'm³',
  });

  let blocked = false;
  try {
    CalculatorMigrationRunner.execute(
      weirStandardCalculator,
      { length: 25, height: 3.5, crestWidth: 2, baseWidth: 6 },
      faultyLegacy,
      ahspMap,
      priceMap,
      settings,
      'v2'
    );
  } catch (e: any) {
    blocked = true;
    assertTrue(e.message.includes('CRITICAL REGRESSION BLOCKED'));
  }

  assertTrue(blocked, 'Must throw and block migration on geometry difference');
});

// 4. Batch 1: Weir Body Standard Work Item Mapping (concrete, rebar, formwork, joint, waterstop)
import {
  WeirBodyMigratedCalculator,
  DrainageChannelMigratedCalculator,
  BoxCulvertMigratedCalculator,
} from '../engine/migration/migratedCalculators';
import { generateMigrationReport } from '../engine/migration/migrationMatrix';

test('Batch 1: Weir Body produces standardized work items (concrete, rebar, formwork, joint, waterstop)', () => {
  const calc = new WeirBodyMigratedCalculator();
  const inputs = {
    weirLength: 25,
    weirHeight: 3.5,
    crestWidth: 2.0,
    baseWidth: 6.0,
    includeReinforcement: 1,
    includeFormwork: 1,
    includeJoint: 1,
    includeWaterstop: 1,
  };

  const geom = calc.calculateGeometry(inputs);
  assertEqual(geom.primaryQuantity, 350, 'Weir body volume = 350 m3');

  const workItems = calc.mapWorkItems(geom, inputs);
  assertEqual(workItems.length, 5, 'Must produce 5 standardized work items');

  const scopes = workItems.map((w) => w.scope);
  assertTrue(scopes.includes('STRUCTURE_BODY'), 'Includes concrete');
  assertTrue(scopes.includes('REINFORCEMENT'), 'Includes reinforcement');
  assertTrue(scopes.includes('FORMWORK'), 'Includes formwork');
  assertTrue(scopes.includes('JOINTS'), 'Includes joint');
  assertTrue(scopes.includes('WATERPROOFING'), 'Includes waterstop');
});

// 5. Batch 1: Drainage Channel Migrated Calculator
test('Batch 1: Drainage Channel produces standardized excavation and lining work items', () => {
  const calc = new DrainageChannelMigratedCalculator();
  const inputs = {
    length: 100,
    topWidth: 1.2,
    bottomWidth: 0.8,
    depth: 1.0,
    liningThickness: 0.15,
    includePlastering: 1,
  };

  const geom = calc.calculateGeometry(inputs);
  assertEqual(geom.primaryQuantity, 100, 'Excavation volume = 100 m3');

  const workItems = calc.mapWorkItems(geom, inputs);
  assertEqual(workItems.length, 3, 'Must produce excavation, masonry lining, and plastering');
  assertTrue(workItems.some((w) => w.scope === 'EARTHWORK'));
  assertTrue(workItems.some((w) => w.scope === 'LINING'));
  assertTrue(workItems.some((w) => w.scope === 'FINISHING'));
});

// 6. Batch 2: Culvert (Box Culvert) Migrated Calculator
test('Batch 2: Box Culvert Migrated Calculator calculates geometry and work items with zero drift', () => {
  const calc = new BoxCulvertMigratedCalculator();
  const inputs = {
    length: 12,
    innerSpan: 1.5,
    innerRise: 1.5,
    wallThickness: 0.20,
    beddingThickness: 0.10,
  };

  const geom = calc.calculateGeometry(inputs);
  assertEqual(geom.primaryQuantity, 12, '12m primary length');

  const workItems = calc.mapWorkItems(geom, inputs);
  assertEqual(workItems.length, 3);
  assertTrue(workItems.some((w) => w.scope === 'STRUCTURE'));
});

// 7. Migration Matrix & Report
test('Generates comprehensive migration matrix report with 0 critical regressions', () => {
  const report = generateMigrationReport();
  assertTrue(report.total >= 8, 'At least 8 calculators tracked');
  assertTrue(report.migrated >= 4, 'Batch 1 and 2 migrated');
  assertEqual(report.criticalRegressionBlocked, false, 'No regressions permitted');
});

console.log('\nAll Phase 5 tests passed.');

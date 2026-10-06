/**
 * Tests for Phase 4: Deterministic Cost Engine
 */

import { CentralDeterministicCostEngine, ProjectCostPolicySettings } from '../engine/cost/centralDeterministicCostEngine';
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
console.log('PHASE 4 — CENTRAL DETERMINISTIC COST ENGINE TESTS');
console.log('====================================================\n');

const mockAhspBeton: AHSPDefinition = {
  id: 'AHSP_BETON_K300',
  code: '3.1.(1)',
  codeNormalized: '3.1.(1)',
  name: 'Beton Mutu Sedang fc 25 MPa (K-300)',
  unit: 'm³',
  domain: 'BINA_MARGA',
  category: 'STRUKTUR',
  version: '2026.1',
  sourceDocument: 'Lampiran V SE DJBK 2026',
  laborComponents: [
    { id: 'c1', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 1.0 },
    { id: 'c2', type: 'labor', itemCode: 'L.02', itemName: 'Tukang', unit: 'OH', coefficient: 0.25 },
  ],
  materialComponents: [
    { id: 'c3', type: 'material', itemCode: 'M.01', itemName: 'Semen Portland', unit: 'kg', coefficient: 400 },
    { id: 'c4', type: 'material', itemCode: 'M.02', itemName: 'Pasir Beton', unit: 'm3', coefficient: 0.5 },
  ],
  equipmentComponents: [
    { id: 'c5', type: 'equipment', itemCode: 'E.01', itemName: 'Concrete Mixer', unit: 'jam', coefficient: 0.2 },
  ],
  totalLaborCoefficient: 1.25,
  totalMaterialCoefficient: 400.5,
  totalEquipmentCoefficient: 0.2,
  provenance: {
    sourceDocument: 'Lampiran V SE DJBK 2026',
    version: '2026.1',
    verificationStatus: 'VERIFIED',
  },
};

const defaultSettings: ProjectCostPolicySettings = {
  overheadPercent: 5,
  profitPercent: 5,
  taxPercent: 11,
  includeTax: true,
};

// 1. Complete Cost Calculation Test
test('Calculates direct cost, O&P, PPN, and total deterministically', () => {
  const resolvedPrices = new Map<string, PriceResolutionOutput>([
    ['L.01', { status: 'VALID', price: 100000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['L.02', { status: 'VALID', price: 140000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['M.01', { status: 'VALID', price: 1500, unit: 'kg', provenance: null, anomalies: [], explanation: '' }],
    ['M.02', { status: 'VALID', price: 250000, unit: 'm3', provenance: null, anomalies: [], explanation: '' }],
    ['E.01', { status: 'VALID', price: 50000, unit: 'jam', provenance: null, anomalies: [], explanation: '' }],
  ]);

  // Expected:
  // Labor: (1.0 * 100,000) + (0.25 * 140,000) = 100,000 + 35,000 = 135,000
  // Material: (400 * 1,500) + (0.5 * 250,000) = 600,000 + 125,000 = 725,000
  // Equipment: (0.2 * 50,000) = 10,000
  // Direct Cost: 135,000 + 725,000 + 10,000 = 870,000
  // Overhead (5%): 43,500
  // Profit (5%): 43,500
  // Subtotal before tax: 870,000 + 87,000 = 957,000
  // Tax (11% of 957,000): 105,270
  // Unit Price: 957,000 + 105,270 = 1,062,270
  // Quantity: 350 m3 -> Total: 350 * 1,062,270 = 371,794,500

  const res = CentralDeterministicCostEngine.calculateWorkItem(
    {
      workItemName: 'Tubuh Bendung Beton K-300',
      quantity: 350,
      unit: 'm³',
      ahsp: mockAhspBeton,
      resolvedPrices,
    },
    defaultSettings
  );

  assertEqual(res.status, 'COMPLETE');
  assertEqual(res.breakdown.laborCost, 135000);
  assertEqual(res.breakdown.materialCost, 725000);
  assertEqual(res.breakdown.equipmentCost, 10000);
  assertEqual(res.breakdown.directCost, 870000);
  assertEqual(res.breakdown.overheadAmount, 43500);
  assertEqual(res.breakdown.profitAmount, 43500);
  assertEqual(res.breakdown.taxAmount, 105270);
  assertEqual(res.breakdown.unitPrice, 1062270);
  assertEqual(res.breakdown.totalCost, 371794500);
  assertTrue(res.explanation.includes('350 m³ x Rp 1.062.270/m³ = Rp 371.794.500'));
});

// 2. Missing Component Price Returns INCOMPLETE (Never silent fake price)
test('Returns status INCOMPLETE when any component price is missing', () => {
  const missingPrices = new Map<string, PriceResolutionOutput>([
    ['L.01', { status: 'VALID', price: 100000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    // M.01 (Semen) is deliberately omitted
  ]);

  const res = CentralDeterministicCostEngine.calculateWorkItem(
    {
      workItemName: 'Tubuh Bendung Beton K-300',
      quantity: 350,
      unit: 'm³',
      ahsp: mockAhspBeton,
      resolvedPrices: missingPrices,
    },
    defaultSettings
  );

  assertEqual(res.status, 'INCOMPLETE');
  assertTrue(res.missingComponents.length > 0);
  assertEqual(res.breakdown.totalCost, 0, 'Total cost must remain 0 when incomplete');
  assertTrue(res.explanation.includes('belum tersedia'));
});

// 3. Tax Configurable (includeTax: false)
test('Suppresses PPN calculation when includeTax is false', () => {
  const resolvedPrices = new Map<string, PriceResolutionOutput>([
    ['L.01', { status: 'VALID', price: 100000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['L.02', { status: 'VALID', price: 140000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['M.01', { status: 'VALID', price: 1500, unit: 'kg', provenance: null, anomalies: [], explanation: '' }],
    ['M.02', { status: 'VALID', price: 250000, unit: 'm3', provenance: null, anomalies: [], explanation: '' }],
    ['E.01', { status: 'VALID', price: 50000, unit: 'jam', provenance: null, anomalies: [], explanation: '' }],
  ]);

  const noTaxSettings: ProjectCostPolicySettings = {
    ...defaultSettings,
    includeTax: false,
  };

  const res = CentralDeterministicCostEngine.calculateWorkItem(
    {
      workItemName: 'Tubuh Bendung Beton K-300',
      quantity: 10,
      unit: 'm³',
      ahsp: mockAhspBeton,
      resolvedPrices,
    },
    noTaxSettings
  );

  assertEqual(res.breakdown.taxAmount, 0);
  assertEqual(res.breakdown.unitPrice, 957000); // 870,000 + 43,500 + 43,500
  assertEqual(res.breakdown.totalCost, 9570000);
});

// 4. Zero Cost Only on Actual Zero
test('Returns ZERO_COST only when actual quantity is zero', () => {
  const resolvedPrices = new Map<string, PriceResolutionOutput>([
    ['L.01', { status: 'VALID', price: 100000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['L.02', { status: 'VALID', price: 140000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['M.01', { status: 'VALID', price: 1500, unit: 'kg', provenance: null, anomalies: [], explanation: '' }],
    ['M.02', { status: 'VALID', price: 250000, unit: 'm3', provenance: null, anomalies: [], explanation: '' }],
    ['E.01', { status: 'VALID', price: 50000, unit: 'jam', provenance: null, anomalies: [], explanation: '' }],
  ]);

  const res = CentralDeterministicCostEngine.calculateWorkItem(
    {
      workItemName: 'Tubuh Bendung Beton K-300',
      quantity: 0,
      unit: 'm³',
      ahsp: mockAhspBeton,
      resolvedPrices,
    },
    defaultSettings
  );

  assertEqual(res.status, 'ZERO_COST');
  assertEqual(res.breakdown.totalCost, 0);
});

// 5. Configurable generalProfitPercent
test('Supports generalProfitPercent configuration', () => {
  const resolvedPrices = new Map<string, PriceResolutionOutput>([
    ['L.01', { status: 'VALID', price: 100000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['L.02', { status: 'VALID', price: 140000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['M.01', { status: 'VALID', price: 1500, unit: 'kg', provenance: null, anomalies: [], explanation: '' }],
    ['M.02', { status: 'VALID', price: 250000, unit: 'm3', provenance: null, anomalies: [], explanation: '' }],
    ['E.01', { status: 'VALID', price: 50000, unit: 'jam', provenance: null, anomalies: [], explanation: '' }],
  ]);

  const genSettings: ProjectCostPolicySettings = {
    generalProfitPercent: 15,
    taxPercent: 11,
    includeTax: false,
  };

  const res = CentralDeterministicCostEngine.calculateWorkItem(
    {
      workItemName: 'Tubuh Bendung Beton K-300',
      quantity: 1,
      unit: 'm³',
      ahsp: mockAhspBeton,
      resolvedPrices,
    },
    genSettings
  );

  // Direct: 870,000. Profit (15%): 130,500. Total = 1,000,500
  assertEqual(res.breakdown.directCost, 870000);
  assertEqual(res.breakdown.profitAmount, 130500);
  assertEqual(res.breakdown.overheadAmount, 0);
  assertEqual(res.breakdown.totalCost, 1000500);
});

// 6. Component Unit Conversion
test('Automatically converts component price between compatible units (ton to kg)', () => {
  const convertedPrices = new Map<string, PriceResolutionOutput>([
    ['L.01', { status: 'VALID', price: 100000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    ['L.02', { status: 'VALID', price: 140000, unit: 'OH', provenance: null, anomalies: [], explanation: '' }],
    // M.01 price provided in ton (1,500,000 / ton), AHSP requires kg
    ['M.01', { status: 'VALID', price: 1500000, unit: 'ton', provenance: null, anomalies: [], explanation: '' }],
    ['M.02', { status: 'VALID', price: 250000, unit: 'm3', provenance: null, anomalies: [], explanation: '' }],
    ['E.01', { status: 'VALID', price: 50000, unit: 'jam', provenance: null, anomalies: [], explanation: '' }],
  ]);

  const res = CentralDeterministicCostEngine.calculateWorkItem(
    {
      workItemName: 'Tubuh Bendung Beton K-300',
      quantity: 1,
      unit: 'm³',
      ahsp: mockAhspBeton,
      resolvedPrices: convertedPrices,
    },
    { ...defaultSettings, includeTax: false }
  );

  // M.01 coeff = 400 kg. Price = 1,500,000 / ton = 1,500 / kg.
  // 400 * 1,500 = 600,000. Total material = 600,000 + 125,000 = 725,000.
  assertEqual(res.status, 'COMPLETE');
  assertEqual(res.breakdown.materialCost, 725000);
  assertTrue(res.auditTrail.some((t) => t.includes('[UNIT_CONVERSION]')));
});

// 7. Missing AHSP Definition Handling
test('Returns status INCOMPLETE when AHSP definition is missing', () => {
  const res = CentralDeterministicCostEngine.calculateWorkItem(
    {
      workItemName: 'Item Tanpa AHSP',
      quantity: 50,
      unit: 'm³',
      ahsp: null as any,
      resolvedPrices: new Map(),
    },
    defaultSettings
  );

  assertEqual(res.status, 'INCOMPLETE');
  assertEqual(res.breakdown.totalCost, 0);
  assertTrue(res.explanation.includes('tidak ditemukan'));
});

console.log('\nAll Phase 4 tests passed.');

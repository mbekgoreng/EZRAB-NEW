/**
 * EZRAB — AI ESTIMATE ONLY TEST SUITE
 * ====================================
 *
 * Verifies the AI Estimate Only architecture:
 * 1. AI = estimator, Code = calculator (strict separation)
 * 2. Deterministic calculation: subtotal = qty × price
 * 3. Null handling: missing quantity or price yields null subtotal (NOT zero)
 * 4. Sanity check engine:
 *    - Unit mismatch detection (e.g. beton in kg)
 *    - Extreme price detection (e.g. baja Rp3.864.000/kg)
 *    - Duplicate work detection
 *    - Identical prices anomaly detection
 * 5. Range calculation & overall confidence estimation
 * 6. Category breakdown accuracy
 * 7. Independence: No AHSP matcher, no database price resolver dependencies
 */

import { strict as assert } from 'node:assert';
import {
  AiEstimateWorkItem,
  AiEstimateCalculator,
  AiEstimateSanityCheck,
  QuantitySourceType,
  PriceSourceType,
} from '../ai-estimate';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${label}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${err.message || err}`);
    failures.push(label);
    failed++;
  }
}

function createSampleItem(overrides: Partial<AiEstimateWorkItem> = {}): AiEstimateWorkItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    category: 'Struktur',
    workName: 'Pekerjaan Beton Kolom K1 15/15',
    description: 'Cor beton K-225 kolom praktis',
    quantity: 5.2,
    unit: 'm3',
    estimatedUnitPrice: 1_250_000,
    estimatedSubtotal: null,
    quantitySource: 'DED_GEOMETRIC',
    priceSource: 'AI_ESTIMATE',
    confidence: 'HIGH',
    detectionType: 'DRAWING_CONFIRMED',
    detectionStatus: 'DETECTED',
    assumptions: ['Tinggi kolom 3.2m', 'Dimensi 15x15cm'],
    sourcePages: [2, 3],
    provenance: {
      quantitySource: 'DED_GEOMETRIC',
      priceSource: 'AI_ESTIMATE',
      subtotalSource: 'UNRESOLVED',
      totalSource: 'UNRESOLVED',
    },
    warnings: [],
    ...overrides,
  };
}

console.log('\n=== RUNNING AI ESTIMATE ONLY SUITE ===\n');

// -----------------------------------------------------------------------------
// 1. DETERMINISTIC CALCULATOR
// -----------------------------------------------------------------------------
console.log('--- 1. Deterministic Calculator Tests ---');

check('Subtotal is calculated as quantity * estimatedUnitPrice', () => {
  const item = createSampleItem({
    quantity: 10,
    estimatedUnitPrice: 50_000,
  });

  const subtotal = AiEstimateCalculator.calculateSubtotal(item);
  assert.equal(subtotal, 500_000);
});

check('Missing quantity yields null subtotal (NOT zero)', () => {
  const item = createSampleItem({
    quantity: null,
    estimatedUnitPrice: 100_000,
  });

  const subtotal = AiEstimateCalculator.calculateSubtotal(item);
  assert.equal(subtotal, null, 'Unresolved quantity must result in null subtotal');
});

check('Missing unit price yields null subtotal (NOT zero)', () => {
  const item = createSampleItem({
    quantity: 12.5,
    estimatedUnitPrice: null,
  });

  const subtotal = AiEstimateCalculator.calculateSubtotal(item);
  assert.equal(subtotal, null, 'Unresolved unit price must result in null subtotal');
});

check('calculateAllSubtotals updates items in place and sets provenance', () => {
  const items = [
    createSampleItem({ quantity: 2, estimatedUnitPrice: 100_000 }),
    createSampleItem({ quantity: null, estimatedUnitPrice: 200_000 }),
  ];

  AiEstimateCalculator.calculateAllSubtotals(items);

  assert.equal(items[0].estimatedSubtotal, 200_000);
  assert.equal(items[0].provenance?.subtotalSource, 'DETERMINISTIC_CALCULATION');

  assert.equal(items[1].estimatedSubtotal, null);
  assert.equal(items[1].provenance?.subtotalSource, 'UNRESOLVED');
});

check('Grand total sums only non-null positive subtotals', () => {
  const items = [
    createSampleItem({ quantity: 2, estimatedUnitPrice: 100_000 }), // 200,000
    createSampleItem({ quantity: 5, estimatedUnitPrice: 50_000 }),  // 250,000
    createSampleItem({ quantity: null, estimatedUnitPrice: 50_000 }), // null
  ];

  AiEstimateCalculator.calculateAllSubtotals(items);
  const total = AiEstimateCalculator.calculateGrandTotal(items);

  assert.equal(total, 450_000);
});

check('Range calculations reflect confidence tiers', () => {
  const itemsHigh = [
    createSampleItem({ confidence: 'HIGH', quantity: 10, estimatedUnitPrice: 100_000 }),
    createSampleItem({ confidence: 'HIGH', quantity: 20, estimatedUnitPrice: 100_000 }),
  ];
  AiEstimateCalculator.calculateAllSubtotals(itemsHigh);
  const summaryHigh = AiEstimateCalculator.buildSummary(itemsHigh);

  assert.equal(summaryHigh.confidence, 'HIGH');
  assert.equal(summaryHigh.estimatedTotal, 3_000_000);
  assert.equal(summaryHigh.rangeLow, 2_700_000); // 0.90
  assert.equal(summaryHigh.rangeHigh, 3_300_000); // 1.10

  const itemsLow = [
    createSampleItem({ confidence: 'LOW', quantity: 10, estimatedUnitPrice: 100_000 }),
    createSampleItem({ confidence: 'LOW', quantity: 20, estimatedUnitPrice: 100_000 }),
  ];
  AiEstimateCalculator.calculateAllSubtotals(itemsLow);
  const summaryLow = AiEstimateCalculator.buildSummary(itemsLow);

  assert.equal(summaryLow.confidence, 'LOW');
  assert.equal(summaryLow.rangeLow, 1_950_000); // 0.65
  assert.equal(summaryLow.rangeHigh, 4_500_000); // 1.50
});

check('Category breakdown correctly aggregates category subtotals and counts', () => {
  const items = [
    createSampleItem({ category: 'Pondasi', quantity: 10, estimatedUnitPrice: 50_000 }),
    createSampleItem({ category: 'Pondasi', quantity: null, estimatedUnitPrice: 60_000 }),
    createSampleItem({ category: 'Struktur', quantity: 4, estimatedUnitPrice: 250_000 }),
  ];

  AiEstimateCalculator.calculateAllSubtotals(items);
  const breakdown = AiEstimateCalculator.buildCategoryBreakdown(items);

  assert.equal(breakdown.length, 2);
  const pondasi = breakdown.find(b => b.category === 'Pondasi');
  assert.ok(pondasi);
  assert.equal(pondasi!.subtotal, 500_000);
  assert.equal(pondasi!.itemCount, 2);
  assert.equal(pondasi!.resolvedCount, 1);
  assert.equal(pondasi!.unresolvedCount, 1);

  const struktur = breakdown.find(b => b.category === 'Struktur');
  assert.ok(struktur);
  assert.equal(struktur!.subtotal, 1_000_000);
  assert.equal(struktur!.itemCount, 1);
  assert.equal(struktur!.resolvedCount, 1);
  assert.equal(struktur!.unresolvedCount, 0);
});

// -----------------------------------------------------------------------------
// 2. SANITY CHECK ENGINE
// -----------------------------------------------------------------------------
console.log('\n--- 2. Sanity Check Engine Tests ---');

check('Detects unit mismatch (e.g. beton in kg instead of m3)', () => {
  const items = [
    createSampleItem({
      workName: 'Cor Beton Pondasi Plat',
      unit: 'kg', // Invalid unit for beton
    }),
  ];

  const warnings = AiEstimateSanityCheck.checkUnitMismatches(items);
  assert.ok(warnings.length > 0, 'Should produce a warning for beton in kg');
  assert.equal(warnings[0].type, 'UNIT_MISMATCH');
  assert.ok(warnings[0].message.includes('kg'));
});

check('Does not flag valid units for work types', () => {
  const items = [
    createSampleItem({
      workName: 'Cor Beton Balok',
      unit: 'm3',
    }),
    createSampleItem({
      workName: 'Pekerjaan Pembesian Kolom',
      unit: 'kg',
    }),
    createSampleItem({
      workName: 'Pemasangan Dinding Bata Ringan',
      unit: 'm2',
    }),
  ];

  const warnings = AiEstimateSanityCheck.checkUnitMismatches(items);
  assert.equal(warnings.length, 0, 'Valid units should have zero unit mismatch warnings');
});

check('Detects extreme prices (e.g. baja Rp3.864.000/kg is absurd)', () => {
  const items = [
    createSampleItem({
      workName: 'Pekerjaan Pembesian Baja Tulangan',
      unit: 'kg',
      estimatedUnitPrice: 3_864_000, // Absurd price per kg
    }),
  ];

  const warnings = AiEstimateSanityCheck.checkExtremePrices(items);
  assert.ok(warnings.length > 0, 'Should detect extreme price per kg');
  assert.equal(warnings[0].type, 'EXTREME_PRICE');
  assert.equal(warnings[0].level, 'CRITICAL');
});

check('Detects extreme subtotals', () => {
  const items = [
    createSampleItem({
      workName: 'Pekerjaan Ringbalk',
      quantity: 500,
      estimatedUnitPrice: 1_200_000,
      estimatedSubtotal: 600_000_000, // Extreme subtotal
    }),
  ];

  const warnings = AiEstimateSanityCheck.checkExtremeSubtotals(items);
  assert.ok(warnings.length > 0);
  assert.equal(warnings[0].type, 'EXTREME_SUBTOTAL');
});

check('Detects duplicate work items', () => {
  const items = [
    createSampleItem({ workName: 'Pasangan Dinding Bata Merah 1:4' }),
    createSampleItem({ workName: 'Pasangan Dinding Bata Merah 1:4' }),
  ];

  const warnings = AiEstimateSanityCheck.checkDuplicateWork(items);
  assert.ok(warnings.length > 0, 'Should detect duplicate item names');
  assert.equal(warnings[0].type, 'DUPLICATE_WORK');
});

check('Detects identical prices anomaly across different units', () => {
  const items = [
    createSampleItem({ workName: 'Pintu Utama Kayu', unit: 'unit', estimatedUnitPrice: 150_000 }),
    createSampleItem({ workName: 'Cat Dinding Interior', unit: 'm2', estimatedUnitPrice: 150_000 }),
    createSampleItem({ workName: 'Cor Beton K-250', unit: 'm3', estimatedUnitPrice: 150_000 }),
  ];

  const warnings = AiEstimateSanityCheck.checkIdenticalPrices(items);
  assert.ok(warnings.length > 0, 'Should detect identical price across different unit types');
  assert.equal(warnings[0].type, 'IDENTICAL_PRICES');
});

check('Detects missing quantity and missing price', () => {
  const items = [
    createSampleItem({ quantity: null, estimatedUnitPrice: 100_000 }),
    createSampleItem({ quantity: 10, estimatedUnitPrice: null }),
  ];

  const warnings = AiEstimateSanityCheck.checkMissingData(items);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some(w => w.type === 'MISSING_QUANTITY'));
  assert.ok(warnings.some(w => w.type === 'MISSING_PRICE'));
});

check('runAllChecks populates warnings on items themselves', () => {
  const item = createSampleItem({
    workName: 'Cor Beton Sloof',
    unit: 'kg', // Mismatch!
    quantity: null, // Missing!
  });

  AiEstimateSanityCheck.runAllChecks([item]);
  assert.ok(item.warnings.length >= 2, 'Item warnings array should contain the generated warnings');
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n=======================================');
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
if (failed > 0) {
  console.error('\nFailed tests:', failures);
  process.exit(1);
} else {
  console.log('ALL AI ESTIMATE ONLY TESTS PASSED!');
  console.log('=======================================\n');
}

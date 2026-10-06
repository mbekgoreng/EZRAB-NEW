/**
 * EZRAB — AI ESTIMATE QUANTITY SANITY & GEOMETRY TEST SUITE
 * ========================================================
 *
 * Verifies the diagnostic fixes against catastrophic quantities:
 * 1. Ring Balk 60.000.000 m³ is BLOCKED_FROM_TOTAL (subtotal: null, confidence != HIGH)
 * 2. Sloof 1.200.000 m³ is BLOCKED_FROM_TOTAL
 * 3. Pondasi Batu Kali 3.606.720 m³ is BLOCKED_FROM_TOTAL
 * 4. Galian Tanah 1.020.000 m³ is BLOCKED_FROM_TOTAL
 * 5. Urugan Kembali 1.020.000 m³ is BLOCKED_FROM_TOTAL
 * 6. Dinding 85.585,8 m² and Acian 171.171,6 m² are BLOCKED_FROM_TOTAL
 * 7. Grand total STRICTLY excludes blocked items (prevents Rp279 Trillion catastrophe)
 * 8. Missing price items (e.g. Electrical, Painting) remain PRICE_UNRESOLVED (subtotal null, not Rp0)
 * 9. Valid quantities are ACCEPTED with subtotal calculated
 * 10. Raw quantity and accepted quantity are preserved with full diagnostic trace
 */

import { strict as assert } from 'node:assert';
import {
  AiEstimateWorkItem,
  QuantitySanityGate,
  AiEstimateCalculator,
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

function createItem(overrides: Partial<AiEstimateWorkItem> = {}): AiEstimateWorkItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    category: 'Struktur',
    workName: 'Ring Balk Beton Bertulang',
    description: 'Cor ring balk',
    rawQuantity: null,
    acceptedQuantity: null,
    quantity: null,
    unit: 'm³',
    quantityStatus: 'UNRESOLVED',
    priceStatus: 'PRICE_ESTIMATED',
    estimatedUnitPrice: 4_500_000,
    estimatedSubtotal: null,
    quantitySource: 'DED_GEOMETRIC',
    priceSource: 'AI_ESTIMATE',
    confidence: 'HIGH',
    detectionType: 'DRAWING_CONFIRMED',
    detectionStatus: 'DETECTED',
    assumptions: ['Panjang 60m', 'Dimensi 15x15 cm'],
    sourcePages: [2, 4],
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

console.log('\n=== RUNNING QUANTITY SANITY & GEOMETRY DIAGNOSTIC SUITE ===\n');

// -----------------------------------------------------------------------------
// 1. CATASTROPHIC CASES FROM REAL DED
// -----------------------------------------------------------------------------
console.log('--- 1. Real DED Catastrophic Quantity Gating ---');

check('Ring Balk 60.000.000 m³ is BLOCKED_FROM_TOTAL and confidence downgraded from HIGH', () => {
  const item = createItem({
    workName: 'Pekerjaan Ring Balk Beton Bertulang',
    quantity: 60_000_000,
    unit: 'm³',
    confidence: 'HIGH',
  });

  QuantitySanityGate.evaluateItem(item);

  assert.equal(item.quantityStatus, 'BLOCKED_FROM_TOTAL');
  assert.equal(item.rawQuantity, 60_000_000, 'Raw quantity must be preserved');
  assert.equal(item.acceptedQuantity, null, 'Accepted quantity must be null');
  assert.equal(item.quantity, null, 'Effective quantity must be null');
  assert.notEqual(item.confidence, 'HIGH', 'Catastrophic quantity must NEVER be HIGH confidence');
  assert.equal(item.confidence, 'LOW');
  assert.ok(item.blockingReason, 'Must provide blocking reason');
  assert.ok(item.quantityTrace, 'Must provide quantity trace');

  // Subtotal check
  const subtotal = AiEstimateCalculator.calculateSubtotal(item);
  assert.equal(subtotal, null, 'Blocked item subtotal must be null');
});

check('Sloof 1.200.000 m³ is BLOCKED_FROM_TOTAL', () => {
  const item = createItem({
    workName: 'Pekerjaan Sloof 15x20',
    quantity: 1_200_000,
    unit: 'm³',
    confidence: 'HIGH',
  });

  QuantitySanityGate.evaluateItem(item);

  assert.equal(item.quantityStatus, 'BLOCKED_FROM_TOTAL');
  assert.equal(item.acceptedQuantity, null);
  assert.equal(item.confidence, 'LOW');
});

check('Pondasi Batu Kali 3.606.720 m³ is BLOCKED_FROM_TOTAL', () => {
  const item = createItem({
    workName: 'Pondasi Batu Kali',
    quantity: 3_606_720,
    unit: 'm³',
    confidence: 'HIGH',
  });

  QuantitySanityGate.evaluateItem(item);

  assert.equal(item.quantityStatus, 'BLOCKED_FROM_TOTAL');
  assert.equal(item.acceptedQuantity, null);
  assert.equal(item.confidence, 'LOW');
});

check('Galian Tanah 1.020.000 m³ and Urugan 1.020.000 m³ are BLOCKED_FROM_TOTAL', () => {
  const galian = createItem({
    workName: 'Pekerjaan Galian Tanah Biasa',
    quantity: 1_020_000,
    unit: 'm³',
  });
  const urugan = createItem({
    workName: 'Pekerjaan Urugan Tanah Kembali',
    quantity: 1_020_000,
    unit: 'm³',
  });

  QuantitySanityGate.evaluateItem(galian);
  QuantitySanityGate.evaluateItem(urugan);

  assert.equal(galian.quantityStatus, 'BLOCKED_FROM_TOTAL');
  assert.equal(galian.acceptedQuantity, null);
  assert.equal(urugan.quantityStatus, 'BLOCKED_FROM_TOTAL');
  assert.equal(urugan.acceptedQuantity, null);
});

check('Dinding 85.585,8 m² and Acian 171.171,6 m² are BLOCKED_FROM_TOTAL', () => {
  const dinding = createItem({
    workName: 'Pasangan Dinding Bata Ringan',
    quantity: 85_585.8,
    unit: 'm²',
  });
  const acian = createItem({
    workName: 'Acian Semen Dinding',
    quantity: 171_171.6,
    unit: 'm²',
  });

  QuantitySanityGate.evaluateItem(dinding);
  QuantitySanityGate.evaluateItem(acian);

  assert.equal(dinding.quantityStatus, 'BLOCKED_FROM_TOTAL');
  assert.equal(dinding.acceptedQuantity, null);
  assert.equal(acian.quantityStatus, 'BLOCKED_FROM_TOTAL');
  assert.equal(acian.acceptedQuantity, null);
});

// -----------------------------------------------------------------------------
// 2. GRAND TOTAL SANITY & PREVENTION OF 279 TRILLION CATASTROPHE
// -----------------------------------------------------------------------------
console.log('\n--- 2. Grand Total Calculation Protection ---');

check('Grand total strictly ignores BLOCKED items and does not inflate to trillions', () => {
  const items = [
    // Extreme items that previously caused Rp279 Trillion:
    createItem({ workName: 'Ring Balk', quantity: 60_000_000, estimatedUnitPrice: 4_500_000 }),
    createItem({ workName: 'Sloof', quantity: 1_200_000, estimatedUnitPrice: 4_500_000 }),
    createItem({ workName: 'Pondasi Batu Kali', quantity: 3_606_720, estimatedUnitPrice: 1_000_000 }),
    createItem({ workName: 'Galian Tanah', quantity: 1_020_000, estimatedUnitPrice: 85_000 }),
    // Legitimate valid items:
    createItem({ workName: 'Pekerjaan Pembersihan Lahan', quantity: 120, estimatedUnitPrice: 15_000 }), // 1,800,000
    createItem({ workName: 'Pemasangan Bowplank', quantity: 48, estimatedUnitPrice: 50_000 }),         // 2,400,000
  ];

  QuantitySanityGate.evaluateAll(items);
  AiEstimateCalculator.calculateAllSubtotals(items);
  const total = AiEstimateCalculator.calculateGrandTotal(items);

  // Grand total must ONLY sum the 2 valid items (1.8M + 2.4M = 4.2M)
  assert.equal(total, 4_200_000, 'Grand total must be exactly Rp 4.200.000, NOT Rp 279 Trillion');
});

// -----------------------------------------------------------------------------
// 3. MISSING != ZERO FOR ELECTRICAL & PAINTING
// -----------------------------------------------------------------------------
console.log('\n--- 3. Missing != Zero Invariant ---');

check('Electrical without price is PRICE_UNRESOLVED and subtotal is null (NOT Rp0)', () => {
  const item = createItem({
    category: 'Electrical',
    workName: 'Instalasi Titik Lampu Downlight',
    quantity: 12,
    unit: 'titik',
    priceStatus: 'PRICE_UNRESOLVED',
    estimatedUnitPrice: null, // missing price
  });

  QuantitySanityGate.evaluateItem(item);
  const subtotal = AiEstimateCalculator.calculateSubtotal(item);

  assert.equal(item.quantityStatus, 'ACCEPTED');
  assert.equal(item.priceStatus, 'PRICE_UNRESOLVED');
  assert.equal(subtotal, null, 'Subtotal must be null, never 0');
});

check('Painting without price is PRICE_UNRESOLVED and subtotal is null (NOT Rp0)', () => {
  const item = createItem({
    category: 'Pengecatan',
    workName: 'Pengecatan Dinding Interior',
    quantity: 210,
    unit: 'm²',
    priceStatus: 'PRICE_UNRESOLVED',
    estimatedUnitPrice: null, // missing price
  });

  QuantitySanityGate.evaluateItem(item);
  const subtotal = AiEstimateCalculator.calculateSubtotal(item);

  assert.equal(subtotal, null, 'Painting without price must yield null subtotal');
});

// -----------------------------------------------------------------------------
// 4. NORMAL QUANTITY ACCEPTANCE
// -----------------------------------------------------------------------------
console.log('\n--- 4. Normal Realistic Quantities Acceptance ---');

check('Normal realistic house quantities are ACCEPTED with correct subtotal', () => {
  const items = [
    createItem({ workName: 'Galian Tanah Pondasi', quantity: 32.5, unit: 'm³', estimatedUnitPrice: 85_000 }),
    createItem({ workName: 'Pondasi Batu Kali', quantity: 24.8, unit: 'm³', estimatedUnitPrice: 950_000 }),
    createItem({ workName: 'Sloof Beton 15x20', quantity: 2.28, unit: 'm³', estimatedUnitPrice: 4_200_000 }),
    createItem({ workName: 'Ringbalk 15x15', quantity: 1.71, unit: 'm³', estimatedUnitPrice: 4_200_000 }),
    createItem({ workName: 'Pasangan Dinding Bata', quantity: 185, unit: 'm²', estimatedUnitPrice: 135_000 }),
  ];

  QuantitySanityGate.evaluateAll(items);
  AiEstimateCalculator.calculateAllSubtotals(items);

  for (const item of items) {
    assert.equal(item.quantityStatus, 'ACCEPTED', `${item.workName} should be ACCEPTED`);
    assert.equal(item.acceptedQuantity, item.rawQuantity);
    assert.ok(typeof item.estimatedSubtotal === 'number' && item.estimatedSubtotal > 0);
  }
});

// -----------------------------------------------------------------------------
// 5. TRACE INTEGRITY
// -----------------------------------------------------------------------------
console.log('\n--- 5. Quantity Trace Auditability ---');

check('Every item contains structured quantity trace with raw, normalized, and formula', () => {
  const item = createItem({
    workName: 'Ring Balk Beton',
    quantity: 60_000_000,
    unit: 'm³',
  });

  QuantitySanityGate.evaluateItem(item);

  assert.ok(item.quantityTrace, 'Trace must exist');
  assert.ok(item.quantityTrace.raw.includes('60.000.000') || item.quantityTrace.raw.includes('60000000'));
  assert.ok(item.quantityTrace.result.includes('BLOCKED_FROM_TOTAL'));
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
if (failed > 0) {
  console.error('\nFailed tests:', failures);
  process.exit(1);
} else {
  console.log('ALL QUANTITY SANITY & GEOMETRY TESTS PASSED!');
  console.log('======================================================\n');
}

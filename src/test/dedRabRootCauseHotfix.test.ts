/**
 * EZRAB DED -> RAB ROOT-CAUSE FIX v2.0 REGRESSION TEST SUITE
 *
 * Verifies all 20 Critical Regression Tests:
 * - TEST 01: "Kamar Utama" -> ROOM_LABEL -> NOT RAB
 * - TEST 02: "Kamar Anak" -> ROOM_LABEL -> NOT RAB
 * - TEST 03: "KM/WC" -> ROOM_LABEL -> NOT RAB
 * - TEST 04: "Pondasi Batu Kali" -> CONSTRUCTION_WORK -> AHSP candidate
 * - TEST 05: "AI-CUSTOM-XXXX" -> NOT OFFICIAL AHSP
 * - TEST 06: AI hallucinated AHSP code -> rejected
 * - TEST 07: AHSP valid + quantity missing -> NOT READY
 * - TEST 08: AHSP valid + price missing -> NO_PRICE -> NOT READY
 * - TEST 09: AHSP valid + unit mismatch -> UNIT_MISMATCH
 * - TEST 10: AHSP valid + specification mismatch -> SPECIFICATION_MISMATCH
 * - TEST 11: Multiple candidates -> MULTIPLE_CANDIDATES
 * - TEST 12: Valid AHSP + valid quantity + valid components + valid price -> READY
 * - TEST 13: READY item -> can apply to RAB
 * - TEST 14: 67 invalid items -> apply button = 0 valid
 * - TEST 15: AI tries to create custom AHSP -> rejected
 * - TEST 16: P1/P2 without legend/context -> NEEDS_REVIEW
 * - TEST 17: P1 proven as column through drawing context -> CONSTRUCTION_WORK candidate
 * - TEST 18: Dimension extraction: 10 x 0.6 x 0.8 -> 4.8 m3
 * - TEST 19: DED quantity preserved exactly -> no arbitrary rounding
 * - TEST 20: Project AHSP version mismatch -> rejected
 */

import assert from 'node:assert/strict';
import { semanticClassifier } from '../ded-rab-v2/semantic/semanticClassifier';
import { dedRabValidationGate } from '../ded-rab-v2/validation/dedRabValidationGate';
import { ahspMatcher } from '../ded-rab-v2/ahsp/ahspMatcher';
import { ahspPriceResolver } from '../ded-rab-v2/ahsp/ahspPriceResolver';
import { ezrabCoreQto } from '../ded-rab-v2/qto/ezrabCoreQto';
import { dedRabReviewService } from '../ded-rab-v2/review/dedRabReviewService';
import { dedInterpreter } from '../ded-rab-v2/interpretation/dedInterpreter';
import { DedWorkItem, RawPageAnalysisPass2 } from '../ded-rab-v2/types';

console.log('======================================================================');
console.log('EZRAB DED -> RAB PIPELINE ROOT-CAUSE FIX v2.0 — 20 REGRESSION TESTS');
console.log('======================================================================');

let passedTests = 0;
let failedTests = 0;

function runTest(testName: string, fn: () => void) {
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  [FAIL] ${testName}`);
    console.error(`         Reason: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// TEST 01: "Kamar Utama" -> ROOM_LABEL -> NOT RAB
// -----------------------------------------------------------------------------
runTest('TEST 01: "Kamar Utama" -> ROOM_LABEL -> NOT RAB', () => {
  const result = semanticClassifier.classify('Kamar Utama', 'OTHER', 1);
  assert.equal(result.fact.entityType, 'ROOM_LABEL');
  assert.equal(result.isRabEligible, false);
});

// -----------------------------------------------------------------------------
// TEST 02: "Kamar Anak" -> ROOM_LABEL -> NOT RAB
// -----------------------------------------------------------------------------
runTest('TEST 02: "Kamar Anak" -> ROOM_LABEL -> NOT RAB', () => {
  const result = semanticClassifier.classify('Kamar Anak', 'OTHER', 1);
  assert.equal(result.fact.entityType, 'ROOM_LABEL');
  assert.equal(result.isRabEligible, false);
});

// -----------------------------------------------------------------------------
// TEST 03: "KM/WC" -> ROOM_LABEL -> NOT RAB
// -----------------------------------------------------------------------------
runTest('TEST 03: "KM/WC" -> ROOM_LABEL -> NOT RAB', () => {
  const result = semanticClassifier.classify('KM/WC', 'OTHER', 1);
  assert.equal(result.fact.entityType, 'ROOM_LABEL');
  assert.equal(result.isRabEligible, false);
});

// -----------------------------------------------------------------------------
// TEST 04: "Pondasi Batu Kali" -> CONSTRUCTION_WORK -> AHSP candidate
// -----------------------------------------------------------------------------
runTest('TEST 04: "Pondasi Batu Kali" -> CONSTRUCTION_WORK -> AHSP candidate', () => {
  const result = semanticClassifier.classify('Pondasi batu kali adukan 1:4', 'FOUNDATION', 1);
  assert.equal(result.fact.entityType, 'CONSTRUCTION_WORK');
  assert.equal(result.isRabEligible, true);
});

// -----------------------------------------------------------------------------
// TEST 05: "AI-CUSTOM-XXXX" -> NOT OFFICIAL AHSP
// -----------------------------------------------------------------------------
runTest('TEST 05: "AI-CUSTOM-XXXX" -> NOT OFFICIAL AHSP', () => {
  const customItem: DedWorkItem = {
    id: 'DED-001',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pekerjaan Khusus Aneh',
    category: 'OTHER',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: 10,
    ahspMatch: {
      code: 'AI-CUSTOM-MUN26QW',
      name: 'Pekerjaan Khusus Aneh',
      unit: 'm3',
      matchType: 'AI_CUSTOM',
      source: 'CUSTOM_ITEM',
      confidence: 0.5,
    },
    price: {
      unitPrice: 85000,
      totalPrice: 850000,
      priceSource: 'OFFICIAL_DATABASE',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(customItem, 'test-project');
  assert.equal(validation.isValid, false);
  assert.notEqual(validation.status, 'READY');
  assert.ok(validation.errors.some((e: string) => e.includes('AI-CUSTOM')));
});

// -----------------------------------------------------------------------------
// TEST 06: AI hallucinated AHSP code -> rejected
// -----------------------------------------------------------------------------
runTest('TEST 06: AI hallucinated AHSP code -> rejected', () => {
  const hallucinatedItem: DedWorkItem = {
    id: 'DED-002',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pondasi Batu Kali',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: 10,
    ahspMatch: {
      code: 'A.99.99.99.HALLUCINATED',
      name: 'Hallucinated AHSP',
      unit: 'm3',
      matchType: 'SEMANTIC_MATCH',
      source: 'LLM Hallucination',
      confidence: 0.9,
    },
    price: {
      unitPrice: 150000,
      totalPrice: 1500000,
      priceSource: 'OFFICIAL_DATABASE',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(hallucinatedItem, 'test-project');
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e: string) => e.includes('database resmi')));
});

// -----------------------------------------------------------------------------
// TEST 07: AHSP valid + quantity missing -> NOT READY
// -----------------------------------------------------------------------------
runTest('TEST 07: AHSP valid + quantity missing -> NOT READY', () => {
  const missingQtyItem: DedWorkItem = {
    id: 'DED-003',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pasangan Pondasi Batu Belah 1:4',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: null, // Missing quantity
    ahspMatch: {
      // Real 2026 official code (§2/§14): a MATCHED code MUST exist in the official catalog.
      code: '2.2.2.1.2',
      name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual',
      unit: 'm3',
      matchType: 'EXACT_MATCH',
      source: 'Standar PUPR 2026',
      confidence: 0.95,
    },
    price: {
      unitPrice: 950000,
      totalPrice: 0,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(missingQtyItem, 'test-project');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'MISSING_QUANTITY');
});

// -----------------------------------------------------------------------------
// TEST 08: AHSP valid + price missing -> NO_PRICE -> NOT READY
// -----------------------------------------------------------------------------
runTest('TEST 08: AHSP valid + price missing -> NO_PRICE -> NOT READY', () => {
  const missingPriceItem: DedWorkItem = {
    id: 'DED-004',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pasangan Pondasi Batu Belah 1:4',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: 12.5,
    ahspMatch: {
      code: '2.2.2.1.2',
      name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual',
      unit: 'm3',
      matchType: 'EXACT_MATCH',
      source: 'Standar PUPR 2026',
      confidence: 0.95,
    },
    price: {
      unitPrice: 0, // Zero / missing price
      totalPrice: 0,
      priceSource: 'PRICE_NOT_FOUND',
      isOfficial: false,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(missingPriceItem, 'test-project');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'MISSING_PRICE');
});

// -----------------------------------------------------------------------------
// TEST 09: AHSP valid + unit mismatch -> UNIT_MISMATCH
// -----------------------------------------------------------------------------
runTest('TEST 09: AHSP valid + unit mismatch -> UNIT_MISMATCH', () => {
  const unitMismatchItem: DedWorkItem = {
    id: 'DED-005',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pondasi Batu Kali',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2', // DED reports area (m2) but AHSP is volume (m3)
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: 20,
    ahspMatch: {
      code: '2.2.2.1.2',
      name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual',
      unit: 'm3',
      matchType: 'EXACT_MATCH',
      source: 'Standar PUPR 2026',
      confidence: 0.95,
    },
    price: {
      unitPrice: 950000,
      totalPrice: 19000000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(unitMismatchItem, 'test-project');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'UNIT_MISMATCH');
});

// -----------------------------------------------------------------------------
// TEST 10: AHSP valid + specification mismatch -> SPECIFICATION_MISMATCH
// -----------------------------------------------------------------------------
runTest('TEST 10: AHSP valid + specification mismatch -> SPECIFICATION_MISMATCH', () => {
  const specMismatchItem: DedWorkItem = {
    id: 'DED-006',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Dinding Pasangan Bata Merah 1/2 Bata',
    materialSpec: 'Bata merah oven adukan 1:4',
    category: 'WALL',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2',
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: 45,
    ahspMatch: {
      // Real 2026 official code for LIGHTWEIGHT brick — deliberately incompatible with the
      // item's "bata merah" spec, so the SPECIFICATION_MISMATCH gate must fire (§4).
      code: '3.6.4.1',
      name: 'Pemasangan 1 m2 dinding bata ringan tebal 7,5 cm dengan mortar siap pakai',
      unit: 'm2',
      matchType: 'SEMANTIC_MATCH',
      source: 'Standar PUPR 2026',
      confidence: 0.9,
    },
    price: {
      unitPrice: 165000,
      totalPrice: 7425000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(specMismatchItem, 'test-project');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'SPECIFICATION_MISMATCH');
});

// -----------------------------------------------------------------------------
// TEST 11: Multiple candidates
// -----------------------------------------------------------------------------
runTest('TEST 11: Multiple candidates -> MULTIPLE_CANDIDATES', () => {
  const ambiguousCandidatesItem: DedWorkItem = {
    id: 'DED-007',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pondasi Batu Kali',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.7,
    assumptions: [],
    warnings: [],
    quantity: 15,
    candidateAhspList: [
      {
        code: '2.2.2.1.4',
        name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe S 12,5 Mpa (setara 1SP : 3PP), cara manual',
        unit: 'm3',
        matchType: 'SEMANTIC_MATCH',
        source: 'PUPR 2026',
        confidence: 0.85,
      },
      {
        code: '2.2.2.1.2',
        name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual',
        unit: 'm3',
        matchType: 'SEMANTIC_MATCH',
        source: 'PUPR 2026',
        confidence: 0.85,
      },
      {
        code: '2.2.2.1.6',
        name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe N 5,2 Mpa (setara 1SP : 4PP), cara manual',
        unit: 'm3',
        matchType: 'SEMANTIC_MATCH',
        source: 'PUPR 2026',
        confidence: 0.85,
      },
    ],
    price: {
      unitPrice: 900000,
      totalPrice: 13500000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(ambiguousCandidatesItem, 'test-project');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'AMBIGUOUS');
});

// -----------------------------------------------------------------------------
// TEST 12: Valid AHSP + valid quantity + valid components + valid price -> READY
// -----------------------------------------------------------------------------
runTest('TEST 12: Valid AHSP + valid quantity + valid components + valid price -> READY', () => {
  const readyItem: DedWorkItem = {
    id: 'DED-008',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pondasi Batu Kali 1:4',
    materialSpec: 'Batu belah adukan 1 SP : 4 PP',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: { length: 20, width: 0.6, height: 0.8 },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
    quantity: 9.6,
    ahspMatch: {
      code: '2.2.2.1.2',
      name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual',
      unit: 'm3',
      matchType: 'EXACT_MATCH',
      source: 'Standar PUPR 2026',
      confidence: 0.95,
    },
    price: {
      unitPrice: 950000,
      totalPrice: 9120000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
      components: [
        { type: 'MATERIAL', name: 'Batu belah', unit: 'm3', coefficient: 1.2, unitPrice: 350000, totalPrice: 420000 },
        { type: 'LABOR', name: 'Pekerja', unit: 'OH', coefficient: 1.5, unitPrice: 120000, totalPrice: 180000 },
        { type: 'LABOR', name: 'Tukang batu', unit: 'OH', coefficient: 0.75, unitPrice: 150000, totalPrice: 112500 },
      ],
    },
  };

  const validation = dedRabValidationGate.validateItem(readyItem, 'test-project');
  assert.equal(validation.isValid, true);
  assert.equal(validation.status, 'READY');
  assert.ok(validation.provenance);
  assert.equal(validation.provenance.databaseVerified, true);
});

// -----------------------------------------------------------------------------
// TEST 13: READY item -> can apply to RAB
// -----------------------------------------------------------------------------
runTest('TEST 13: READY item -> can apply to RAB', () => {
  const readyItem: DedWorkItem = {
    id: 'DED-009',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pondasi Batu Kali 1:4',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.95,
    assumptions: [],
    warnings: [],
    quantity: 12.0,
    ahspMatch: {
      code: '2.2.2.1.2',
      name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual',
      unit: 'm3',
      matchType: 'EXACT_MATCH',
      source: 'Standar PUPR 2026',
      confidence: 0.95,
    },
    price: {
      unitPrice: 950000,
      totalPrice: 11400000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
      components: [
        { type: 'MATERIAL', name: 'Batu belah', unit: 'm3', coefficient: 1.2, unitPrice: 350000, totalPrice: 420000 },
        { type: 'LABOR', name: 'Pekerja', unit: 'OH', coefficient: 1.5, unitPrice: 120000, totalPrice: 180000 },
        { type: 'LABOR', name: 'Tukang batu', unit: 'OH', coefficient: 0.75, unitPrice: 150000, totalPrice: 112500 },
      ],
    },
    userApproved: true,
  };

  const rabItems = dedRabReviewService.convertToOfficialRabItems([readyItem], 'test-project');
  assert.equal(rabItems.length, 1);
  assert.equal(rabItems[0].code, '2.2.2.1.2');
  assert.equal(rabItems[0].amount, 11400000);
});

// -----------------------------------------------------------------------------
// TEST 14: 67 invalid items -> apply button = 0 valid
// -----------------------------------------------------------------------------
runTest('TEST 14: 67 invalid items -> apply button = 0 valid', () => {
  const invalidItems: DedWorkItem[] = [];
  for (let i = 1; i <= 67; i++) {
    invalidItems.push({
      id: `DED-INV-${i}`,
      projectId: 'test-project',
      sourceDocumentId: 'doc-1',
      name: i % 2 === 0 ? 'Kamar Tidur' : 'Simbol P1',
      category: 'OTHER',
      status: 'MISSING_DATA',
      evidenceIds: [],
      sourcePages: [1],
      dimensions: {},
      geometry: { shape: 'RECTANGULAR' },
      unit: 'unit',
      calculationInputs: {},
      confidence: 0.4,
      assumptions: [],
      warnings: [],
      quantity: null, // Missing QTO
      ahspMatch: {
        code: `AI-CUSTOM-${i}`,
        name: 'Item Palsu',
        unit: 'unit',
        matchType: 'AI_CUSTOM',
        source: 'CUSTOM_ITEM',
        confidence: 0.5,
      },
      price: {
        unitPrice: 85000,
        totalPrice: 0,
        priceSource: 'PRICE_NOT_FOUND',
        isOfficial: false,
        currency: 'IDR',
      },
      userApproved: true,
    });
  }

  // Server revalidation
  const rabItems = dedRabReviewService.convertToOfficialRabItems(invalidItems, 'test-project');
  assert.equal(rabItems.length, 0);
});

// -----------------------------------------------------------------------------
// TEST 15: AI tries to create custom AHSP -> rejected
// -----------------------------------------------------------------------------
runTest('TEST 15: AI tries to create custom AHSP -> rejected', () => {
  const item: DedWorkItem = {
    id: 'DED-010',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Robot Pelapis Aspal Otomatis Nanoteknologi',
    category: 'OTHER',
    status: 'CONFIRMED',
    evidenceIds: [],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'COUNT' },
    unit: 'unit',
    calculationInputs: {},
    confidence: 0.8,
    assumptions: [],
    warnings: [],
  };

  const match = ahspMatcher.matchWorkItem(item);
  assert.equal(match.matchType, 'NOT_FOUND');
  assert.equal(match.code, '');
});

// -----------------------------------------------------------------------------
// TEST 16: P1/P2 without legend/context -> NEEDS_REVIEW
// -----------------------------------------------------------------------------
runTest('TEST 16: P1/P2 without legend/context -> NEEDS_REVIEW', () => {
  const p1Classification = semanticClassifier.classify('P1', 'OTHER', 1);
  assert.ok(
    p1Classification.fact.entityType === 'SYMBOL' || p1Classification.fact.entityType === 'DOOR_REFERENCE',
    `Expected SYMBOL or DOOR_REFERENCE, got ${p1Classification.fact.entityType}`
  );
  assert.equal(p1Classification.isRabEligible, false);

  const p2Classification = semanticClassifier.classify('P2', 'OTHER', 1);
  assert.ok(
    p2Classification.fact.entityType === 'SYMBOL' || p2Classification.fact.entityType === 'DOOR_REFERENCE',
    `Expected SYMBOL or DOOR_REFERENCE, got ${p2Classification.fact.entityType}`
  );
  assert.equal(p2Classification.isRabEligible, false);
});

// -----------------------------------------------------------------------------
// TEST 17: P1 proven as column through drawing context -> CONSTRUCTION_WORK candidate
// -----------------------------------------------------------------------------
runTest('TEST 17: P1 proven as column through drawing context -> CONSTRUCTION_WORK candidate', () => {
  // If drawing title or description proves P1 is a column schedule entry:
  const provenResult = semanticClassifier.classify('P1 - Kolom Praktis 15x15 cm Beton Bertulang', 'STRUCTURE_COLUMN', 2);
  assert.equal(provenResult.fact.entityType, 'CONSTRUCTION_WORK');
  assert.equal(provenResult.isRabEligible, true);
});

// -----------------------------------------------------------------------------
// TEST 18: Dimension extraction: 10 x 0.6 x 0.8 -> 4.8 m3
// -----------------------------------------------------------------------------
runTest('TEST 18: Dimension extraction: 10 x 0.6 x 0.8 -> 4.8 m3', () => {
  const foundationItem: DedWorkItem = {
    id: 'DED-011',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pondasi Batu Kali',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {
      length: { value: 10.0, unit: 'm', isMissing: false },
      width: { value: 0.6, unit: 'm', isMissing: false },
      height: { value: 0.8, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {
      length: 10.0,
      width: 0.6,
      height: 0.8,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(foundationItem);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(qto.quantity, 4.8);
  assert.equal(qto.unit, 'm³');
});

// -----------------------------------------------------------------------------
// TEST 19: DED quantity preserved exactly -> no arbitrary rounding
// -----------------------------------------------------------------------------
runTest('TEST 19: DED quantity preserved exactly -> no arbitrary rounding', () => {
  const item: DedWorkItem = {
    id: 'DED-012',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Galian Tanah Saluran',
    category: 'SITEWORK',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {
      length: { value: 12.3456, unit: 'm', isMissing: false },
      width: { value: 1.0, unit: 'm', isMissing: false },
      height: { value: 1.0, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {
      length: 12.3456,
      width: 1.0,
      height: 1.0,
    },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(item);
  assert.equal(qto.quantity, 12.3456);
});

// -----------------------------------------------------------------------------
// TEST 20: Project AHSP version mismatch -> rejected
// -----------------------------------------------------------------------------
runTest('TEST 20: Project AHSP version mismatch -> rejected', () => {
  const item: DedWorkItem = {
    id: 'DED-013',
    projectId: 'test-project',
    sourceDocumentId: 'doc-1',
    name: 'Pondasi Batu Kali',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: 10,
    ahspMatch: {
      code: '2.2.2.1.2',
      name: 'Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual',
      unit: 'm3',
      matchType: 'EXACT_MATCH',
      source: 'Standar PUPR 2026',
      confidence: 0.95,
    },
    price: {
      unitPrice: 950000,
      totalPrice: 9500000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  // Specifying an incompatible AHSP version for the project (e.g. SNI 2008 when project uses 2026)
  const validation = dedRabValidationGate.validateItem(item, 'test-project', 'SNI_2008_DEPRECATED');
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e: string) => e.includes('Versi AHSP')));
});

console.log('----------------------------------------------------------------------');
console.log(`TOTAL TESTS: 20 | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('======================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

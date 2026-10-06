/**
 * EZRAB DED -> RAB ENGINE v1.0
 * 15 MANDATORY REGRESSION TEST CRITERIA
 *
 * Verifies all 15 core regression criteria mandated by the specification:
 * 1. Missing dimension -> QTO returns quantity: null, status: MISSING_DATA (not 0)
 * 2. Missing unit price -> Price returns unitPrice: null / 0, status: MISSING_PRICE (not fabricated)
 * 3. Hallucinated AHSP code -> AHSP validation rejects as non-existent in official DB
 * 4. Project context isolation -> Project A cannot read/write/override prices of Project B
 * 5. Formula evaluation -> SafeDecimalEngine handles precision and zero division safely
 * 6. Room labels ("Kamar Tidur", "Toilet") -> marked as ROOM_LABEL, not added as RAB line items
 * 7. Door/Window marks ("P1", "J1") without schedule -> marked as SYMBOL / REFERENCE, not RAB eligible
 * 8. Door/Window marks with schedule -> resolved to actual work item (CONSTRUCTION_WORK)
 * 9. Material spec mismatch -> flagged as SPECIFICATION_MISMATCH
 * 10. Unit mismatch -> flagged as UNIT_MISMATCH
 * 11. Multi-candidate AHSP -> flags item as AMBIGUOUS with candidate list
 * 12. Valid item passing all gates -> achieves status: READY, rabEligible: true
 * 13. Commit action with mixed items -> only READY items committed to RAB, unready items preserved
 * 14. Audit report generation -> produces complete audit trail with provenance
 * 15. Zero AI math -> all calculations use SafeDecimalEngine, no LLM arithmetic
 */

import assert from 'node:assert/strict';
import { semanticClassifier } from '../ded-rab-v2/semantic/semanticClassifier';
import { dedRabValidationGate } from '../ded-rab-v2/validation/dedRabValidationGate';
import { ahspMatcher } from '../ded-rab-v2/ahsp/ahspMatcher';
import { ezrabCoreQto } from '../ded-rab-v2/qto/ezrabCoreQto';
import { dedRabReviewService } from '../ded-rab-v2/review/dedRabReviewService';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import { projectPriceEngine } from '../engine/pricing/projectPriceEngine';
import { DedWorkItem } from '../ded-rab-v2/types';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

/**
 * CANONICAL OFFICIAL MATCH FIXTURE (§2/§14).
 *
 * These regression criteria exercise the DOWNSTREAM gates (READY, commit, provenance,
 * audit trail). To do that they need an AHSP that actually EXISTS in the official 2026
 * catalog — otherwise the official-catalog gate correctly fires first and masks the gate
 * under test. The fixture therefore points at a real code, and the file asserts (below)
 * that this code is in the catalog, so the suite fails loudly if the catalog ever changes.
 *
 * It previously used `A.3.2.1.2` ("Pasangan batu belah 1 SP : 4 PP"), a 2022 code that is
 * NOT in the 2026 catalog — the exact mismatch this task removes.
 */
const OFFICIAL_STONE_FOUNDATION_CODE = '2.2.2.1.2';
const OFFICIAL_STONE_FOUNDATION_NAME =
  'Pemasangan 1 m3 pondasi batu belah mortar tipe M 17,5 Mpa setara 1SP : 2PP, cara manual';
/** Real 2026 official code for LIGHTWEIGHT brick (used for SPECIFICATION_MISMATCH). */
const OFFICIAL_LIGHT_BRICK_CODE = '3.6.4.1';
const OFFICIAL_LIGHT_BRICK_NAME = 'Pemasangan 1 m2 dinding bata ringan tebal 7,5 cm dengan mortar siap pakai';

console.log('======================================================================');
console.log('EZRAB DED -> RAB ENGINE v1.0 — 15 REGRESSION CRITERIA TEST SUITE');
console.log('======================================================================');

let passedTests = 0;
let failedTests = 0;

function runTest(testNum: number, title: string, fn: () => void) {
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] CRITERION ${testNum.toString().padStart(2, '0')}: ${title}`);
  } catch (err: any) {
    failedTests++;
    console.error(`  [FAIL] CRITERION ${testNum.toString().padStart(2, '0')}: ${title}`);
    console.error(`         Error: ${err.message}`);
  }
}

// Guard: the shared fixtures MUST be real official 2026 items, or this suite is meaningless.
assert.ok(
  officialAhspRepository.hasOfficialAhsp(OFFICIAL_STONE_FOUNDATION_CODE),
  `Fixture code ${OFFICIAL_STONE_FOUNDATION_CODE} is not in the official catalog`
);
assert.ok(
  officialAhspRepository.hasOfficialAhsp(OFFICIAL_LIGHT_BRICK_CODE),
  `Fixture code ${OFFICIAL_LIGHT_BRICK_CODE} is not in the official catalog`
);

// -----------------------------------------------------------------------------
// CRITERION 1: Upload DED with missing dimension -> quantity: null, MISSING_DATA
// -----------------------------------------------------------------------------
runTest(1, 'Missing dimension -> QTO returns quantity: null, status: MISSING_DATA', () => {
  const missingDimItem: DedWorkItem = {
    id: 'CRIT-01',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Pondasi Batu Kali',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {
      length: { value: 10, unit: 'm', isMissing: false },
      // width and height missing!
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: { length: 10 },
    confidence: 0.8,
    assumptions: [],
    warnings: [],
  };

  const qto = ezrabCoreQto.calculateQuantity(missingDimItem);
  assert.equal(qto.quantity, null, 'Quantity must be null when dimensions are missing, never 0');
  assert.equal(qto.status, 'MISSING_DATA');
  assert.ok(qto.missingParameters?.includes('width') || qto.missingParameters?.includes('height'));
});

// -----------------------------------------------------------------------------
// CRITERION 2: Upload DED with missing unit price -> unitPrice: null / 0, MISSING_PRICE
// -----------------------------------------------------------------------------
runTest(2, 'Missing unit price -> status: MISSING_PRICE, unitPrice is unverified', () => {
  const missingPriceItem: DedWorkItem = {
    id: 'CRIT-02',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Pasangan Pondasi Batu Belah 1:4',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: { length: 10, width: 0.6, height: 0.8 },
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: 4.8,
    ahspMatch: {
      code: OFFICIAL_STONE_FOUNDATION_CODE,
      name: OFFICIAL_STONE_FOUNDATION_NAME,
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

  const validation = dedRabValidationGate.validateItem(missingPriceItem, 'PRJ-TEST-01');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'MISSING_PRICE');
  assert.equal(validation.provenance.priceVerification.verified, false);
});

// -----------------------------------------------------------------------------
// CRITERION 3: Hallucinated AHSP code -> rejected as non-existent in official DB
// -----------------------------------------------------------------------------
runTest(3, 'Hallucinated AHSP code -> rejected from official database validation', () => {
  const rogueItem: DedWorkItem = {
    id: 'CRIT-03',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Pekerjaan Kolom Fantasi',
    category: 'STRUCTURE_COLUMN',
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
    quantity: 5,
    ahspMatch: {
      code: 'A.99.99.FAKE.CODE',
      name: 'Fake Code AHSP',
      unit: 'm3',
      matchType: 'SEMANTIC_MATCH',
      source: 'LLM Hallucination',
      confidence: 0.95,
    },
    price: {
      unitPrice: 500000,
      totalPrice: 2500000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(rogueItem, 'PRJ-TEST-01');
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e: string) => e.includes('database resmi') || e.includes('tidak terdaftar')));
});

// -----------------------------------------------------------------------------
// CRITERION 4: Project context isolation -> Project A price cannot leak to Project B
// -----------------------------------------------------------------------------
runTest(4, 'Project context isolation -> Project A overrides do not leak to Project B', () => {
  const projA = 'PROJECT-ALPHA';
  const projB = 'PROJECT-BETA';
  const itemKey = 'PASIR_BETON_TEST';

  // Set override on Project A
  projectPriceEngine.setProjectPrice({
    projectId: projA,
    materialId: itemKey,
    price: 450000,
    unit: 'm3',
    source: 'SUPPLIER',
    supplierName: 'PT Sumber Material',
  });

  // Verify Project A has override
  const priceA = projectPriceEngine.getProjectPrice(projA, itemKey);
  assert.equal(priceA?.price, 450000);

  // Verify Project B is isolated and has NO override
  const priceB = projectPriceEngine.getProjectPrice(projB, itemKey);
  assert.equal(priceB, undefined, 'Project B must not see Project A price override');
});

// -----------------------------------------------------------------------------
// CRITERION 5: Formula evaluation -> SafeDecimalEngine handles precision and division by zero
// -----------------------------------------------------------------------------
runTest(5, 'Formula evaluation -> SafeDecimalEngine precision & division by zero guard', () => {
  // Floating point drift test: 0.1 + 0.2 === 0.3
  const floatSum = SafeDecimalEngine.safeAdd(0.1, 0.2);
  assert.equal(floatSum, 0.3, 'SafeDecimalEngine must eliminate floating point drift');

  // Precision multiplication test: 100000 * 0.125 === 12500
  const multRes = SafeDecimalEngine.safeMultiply(100000, 0.125);
  assert.equal(multRes, 12500);

  // Zero division safe guard
  const divZero = SafeDecimalEngine.safeDivide(1500, 0, 2, 0);
  assert.equal(divZero, 0, 'Division by zero must safely return fallback 0 without throwing NaN or Infinity');
});

// -----------------------------------------------------------------------------
// CRITERION 6: Room labels ("Kamar Tidur", "Toilet") -> marked as ROOM_LABEL, not added to RAB
// -----------------------------------------------------------------------------
runTest(6, 'Room labels -> classified as ROOM_LABEL, not RAB eligible', () => {
  const labels = ['Kamar Tidur Utama', 'Kamar Mandi / WC', 'Ruang Tamu', 'Dapur Bersih'];
  for (const label of labels) {
    const res = semanticClassifier.classify(label, 'OTHER', 1);
    assert.equal(res.fact.entityType, 'ROOM_LABEL', `${label} should be classified as ROOM_LABEL`);
    assert.equal(res.isRabEligible, false, `${label} must NOT be RAB eligible`);
  }
});

// -----------------------------------------------------------------------------
// CRITERION 7: Door/Window marks ("P1", "J1") without schedule -> marked as REFERENCE, not RAB
// -----------------------------------------------------------------------------
runTest(7, 'Door/Window marks without schedule -> marked as SYMBOL/REFERENCE, not RAB eligible', () => {
  const symbols = ['P1', 'P2', 'J1', 'BV1', 'K1'];
  for (const sym of symbols) {
    const res = semanticClassifier.classify(sym, 'OTHER', 1);
    assert.ok(
      res.fact.entityType === 'SYMBOL' ||
      res.fact.entityType === 'DOOR_REFERENCE' ||
      res.fact.entityType === 'WINDOW_REFERENCE' ||
      res.fact.entityType === 'STRUCTURAL_REFERENCE' ||
      res.fact.entityType === 'STRUCTURAL_LABEL',
      `${sym} should be classified as SYMBOL or REFERENCE, got ${res.fact.entityType}`
    );
    assert.equal(res.isRabEligible, false, `Raw symbol ${sym} without schedule must not be RAB eligible`);
  }
});

// -----------------------------------------------------------------------------
// CRITERION 8: Door/Window marks with schedule -> resolved to actual work item (CONSTRUCTION_WORK)
// -----------------------------------------------------------------------------
runTest(8, 'Door/Window marks with schedule -> resolved to CONSTRUCTION_WORK', () => {
  const scheduledItem = 'P1 - Daun Pintu Panel Kayu Jati Tebal 3.5 cm Termasuk Kusen';
  const res = semanticClassifier.classify(scheduledItem, 'DOOR_WINDOW', 2);
  assert.equal(res.fact.entityType, 'CONSTRUCTION_WORK');
  assert.equal(res.isRabEligible, true);
});

// -----------------------------------------------------------------------------
// CRITERION 9: Material spec mismatch -> flagged as SPECIFICATION_MISMATCH
// -----------------------------------------------------------------------------
runTest(9, 'Material spec mismatch (Bata Merah vs Bata Ringan) -> SPECIFICATION_MISMATCH', () => {
  const item: DedWorkItem = {
    id: 'CRIT-09',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Dinding Bata Merah Tebal 15 cm',
    materialSpec: 'Bata Merah Standar Campuran 1:4',
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
    quantity: 50,
    ahspMatch: {
      code: OFFICIAL_LIGHT_BRICK_CODE,
      name: 'Pasangan Dinding Bata Ringan (AAC / Hebel) Tebal 10 cm',
      unit: 'm2',
      matchType: 'SEMANTIC_MATCH',
      source: 'Standar PUPR 2026',
      confidence: 0.85,
    },
    price: {
      unitPrice: 155000,
      totalPrice: 7750000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(item, 'PRJ-TEST-01');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'SPECIFICATION_MISMATCH');
});

// -----------------------------------------------------------------------------
// CRITERION 10: Unit mismatch -> flagged as UNIT_MISMATCH
// -----------------------------------------------------------------------------
runTest(10, 'Unit mismatch (DED calculates m2, AHSP is m3) -> UNIT_MISMATCH', () => {
  const item: DedWorkItem = {
    id: 'CRIT-10',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Pondasi Batu Kali',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm2', // Dimensional mismatch: AHSP is m3, DED gave m2
    calculationInputs: {},
    confidence: 0.9,
    assumptions: [],
    warnings: [],
    quantity: 20,
    ahspMatch: {
      code: OFFICIAL_STONE_FOUNDATION_CODE,
      name: OFFICIAL_STONE_FOUNDATION_NAME,
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

  const validation = dedRabValidationGate.validateItem(item, 'PRJ-TEST-01');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'UNIT_MISMATCH');
});

// -----------------------------------------------------------------------------
// CRITERION 11: Multi-candidate AHSP -> flags item as AMBIGUOUS with candidate list
// -----------------------------------------------------------------------------
runTest(11, 'Multi-candidate AHSP -> item marked AMBIGUOUS with candidates list', () => {
  const item: DedWorkItem = {
    id: 'CRIT-11',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Pondasi Batu Belah Campuran Semen',
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
    quantity: 12,
    candidateAhspList: [
      { code: 'A.3.2.1.1', name: 'Pasangan batu belah 1 SP : 3 PP', unit: 'm3', matchType: 'SEMANTIC_MATCH', source: 'PUPR 2026', confidence: 0.8 },
      { code: OFFICIAL_STONE_FOUNDATION_CODE, name: OFFICIAL_STONE_FOUNDATION_NAME, unit: 'm3', matchType: 'SEMANTIC_MATCH', source: 'PUPR 2026', confidence: 0.8 },
      { code: 'A.3.2.1.3', name: OFFICIAL_STONE_FOUNDATION_NAME, unit: 'm3', matchType: 'SEMANTIC_MATCH', source: 'PUPR 2026', confidence: 0.8 },
    ],
    price: {
      unitPrice: 920000,
      totalPrice: 11040000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(item, 'PRJ-TEST-01');
  assert.equal(validation.isValid, false);
  assert.equal(validation.status, 'AMBIGUOUS');
});

// -----------------------------------------------------------------------------
// CRITERION 12: Valid item passing all gates -> achieves status: READY, rabEligible: true
// -----------------------------------------------------------------------------
runTest(12, 'Valid item passing all gates -> achieves READY and rabEligible: true', () => {
  const validItem: DedWorkItem = {
    id: 'CRIT-12',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Pondasi Batu Belah 1:4',
    materialSpec: 'Batu belah adukan 1 SP : 4 PP',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-01'],
    sourcePages: [1],
    dimensions: {
      length: { value: 20, unit: 'm', isMissing: false },
      width: { value: 0.6, unit: 'm', isMissing: false },
      height: { value: 0.8, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: { length: 20, width: 0.6, height: 0.8 },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
    quantity: 9.6,
    ahspMatch: {
      code: OFFICIAL_STONE_FOUNDATION_CODE,
      name: OFFICIAL_STONE_FOUNDATION_NAME,
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
      ],
    },
  };

  const validation = dedRabValidationGate.validateItem(validItem, 'PRJ-TEST-01');
  assert.equal(validation.isValid, true);
  assert.equal(validation.status, 'READY');
  assert.equal(validation.confidenceRating, 'HIGH');
  assert.equal(validation.provenance.databaseVerified, true);
});

// -----------------------------------------------------------------------------
// CRITERION 13: Commit action with mixed items -> only READY items committed
// -----------------------------------------------------------------------------
runTest(13, 'Commit action with mixed items -> only READY items committed, unready filtered', () => {
  const validItem: DedWorkItem = {
    id: 'CRIT-13-VALID',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Pondasi Batu Belah 1:4',
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
    quantity: 10,
    ahspMatch: {
      code: OFFICIAL_STONE_FOUNDATION_CODE,
      name: OFFICIAL_STONE_FOUNDATION_NAME,
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
      components: [
        { type: 'MATERIAL', name: 'Batu belah', unit: 'm3', coefficient: 1.2, unitPrice: 350000, totalPrice: 420000 },
        { type: 'LABOR', name: 'Pekerja', unit: 'OH', coefficient: 1.5, unitPrice: 120000, totalPrice: 180000 },
      ],
    },
    userApproved: true,
  };

  const unreadyItem: DedWorkItem = {
    id: 'CRIT-13-UNREADY',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'doc-01',
    name: 'Kamar Mandi', // Room label
    category: 'OTHER',
    status: 'MISSING_DATA',
    evidenceIds: [],
    sourcePages: [1],
    dimensions: {},
    geometry: { shape: 'RECTANGULAR' },
    unit: 'unit',
    calculationInputs: {},
    confidence: 0.3,
    assumptions: [],
    warnings: [],
    quantity: null,
    userApproved: true,
  };

  const committed = dedRabReviewService.convertToOfficialRabItems([validItem, unreadyItem], 'PRJ-TEST-01');
  assert.equal(committed.length, 1, 'Only 1 READY item should be converted to official RAB');
  assert.equal(committed[0].code, OFFICIAL_STONE_FOUNDATION_CODE);
  assert.equal(committed[0].volume, 10);
});

// -----------------------------------------------------------------------------
// CRITERION 14: Audit report generation -> produces complete audit trail
// -----------------------------------------------------------------------------
runTest(14, 'Audit report generation -> produces complete audit trail with source provenance', () => {
  const item: DedWorkItem = {
    id: 'CRIT-14',
    projectId: 'PRJ-TEST-01',
    sourceDocumentId: 'DED_Struktur_S01.pdf',
    name: 'Pondasi Batu Belah 1:4',
    materialSpec: 'Batu belah adukan 1 SP : 4 PP',
    category: 'FOUNDATION',
    status: 'CONFIRMED',
    evidenceIds: ['EV-S01-04'],
    sourcePages: [2],
    dimensions: {
      length: { value: 15, unit: 'm', isMissing: false },
      width: { value: 0.6, unit: 'm', isMissing: false },
      height: { value: 0.8, unit: 'm', isMissing: false },
    },
    geometry: { shape: 'RECTANGULAR' },
    unit: 'm3',
    calculationInputs: { length: 15, width: 0.6, height: 0.8 },
    confidence: 0.95,
    assumptions: [],
    warnings: [],
    quantity: 7.2,
    ahspMatch: {
      code: OFFICIAL_STONE_FOUNDATION_CODE,
      name: OFFICIAL_STONE_FOUNDATION_NAME,
      unit: 'm3',
      matchType: 'EXACT_MATCH',
      source: 'AHSP PUPR 2026 (SE DJBK No. 47/SE/Dk/2026)',
      confidence: 0.95,
    },
    price: {
      unitPrice: 950000,
      totalPrice: 6840000,
      priceSource: 'OFFICIAL_AHSP',
      isOfficial: true,
      currency: 'IDR',
    },
  };

  const validation = dedRabValidationGate.validateItem(item, 'PRJ-TEST-01');
  const prov = validation.provenance;
  assert.ok(prov, 'Provenance record must be present');
  assert.equal(prov.matchedAhspCode, OFFICIAL_STONE_FOUNDATION_CODE);
  assert.equal(prov.sourceDocumentTrace.fileName, 'DED_Struktur_S01.pdf');
  assert.equal(prov.sourceDocumentTrace.pageNumber, 2);
  assert.equal(prov.sourceDocumentTrace.evidenceId, 'EV-S01-04');
  assert.equal(prov.databaseVerified, true);
  assert.equal(prov.specificationMatch.isCompatible, true);
  assert.equal(prov.unitMatch.isCompatible, true);
});

// -----------------------------------------------------------------------------
// CRITERION 15: Zero AI math -> all calculations verified with SafeDecimalEngine
// -----------------------------------------------------------------------------
runTest(15, 'Zero AI math -> calculations strictly verified via SafeDecimalEngine', () => {
  const qty = 7.2;
  const unitPrice = 950000;
  const exactAmount = SafeDecimalEngine.safeMultiply(qty, unitPrice);
  assert.equal(exactAmount, 6840000);

  // Rounding test for coefficients
  const coefProduct = SafeDecimalEngine.safeMultiply(1.2, 0.075, 4);
  assert.equal(coefProduct, 0.09);

  // Weight percentage calculation
  const weight = SafeDecimalEngine.calculateWeight(exactAmount, 68400000);
  assert.equal(weight, 10.0, 'Bobot percentage should be 10.00%');
});

console.log('----------------------------------------------------------------------');
console.log(`TOTAL CRITERIA TESTED: 15 | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('======================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

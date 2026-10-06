/**
 * EZRAB — FINAL AI PRICE ESTIMATION FALLBACK TEST SUITE
 * ======================================================
 *
 * Verifies:
 * 1. 7-Tier Resolution Hierarchy:
 *    Project -> Workspace -> Official AHSP -> National/Cached -> External -> AI Estimation -> Unresolved.
 * 2. Resource-Level Estimation Principle:
 *    When AHSP recipe exists, prices known components from DB and AI-estimates only missing components,
 *    computing composite unit price deterministically via SafeDecimalEngine (Unit Price = Σ coef × price).
 * 3. Range & Confidence:
 *    Every AI price estimate derives { low, central, high } and explicit confidence (HIGH | MEDIUM | LOW).
 * 4. Provenance & Reasoning:
 *    Every estimate records basis, inputs, calculation_method, model_used.
 * 5. Strict Non-Official Invariant:
 *    AI-estimated prices are NEVER marked as PUPR official (isOfficial: false, source_type: "AI_ESTIMATE", status: "ESTIMATED").
 * 6. Model Routing:
 *    EZRAB-AI-1.3 for routine items vs EZRAB-AI-Pro for complex technical interpretation & unusual materials.
 * 7. Price Status Codes:
 *    PRICE_INTERNAL, PRICE_EXTERNAL, PRICE_AI_ESTIMATE, PRICE_MIXED, PRICE_UNRESOLVED.
 * 8. RAB Ready Rule:
 *    Items with valid quantity, valid AHSP/AI construction spec, and AI-estimated price are admitted into RAB
 *    (validationStatus: 'READY', rabEligible: true).
 */

import { strict as assert } from 'node:assert';
import { ahspPriceResolver } from '../ded-rab-v2/ahsp/ahspPriceResolver';
import {
  aiPriceEstimationEngine,
  MODEL_EZRAB_AI_1_3,
  MODEL_EZRAB_AI_PRO,
} from '../ded-rab-v2/pricing/aiPriceEstimationEngine';
import { dedRabValidationGate } from '../ded-rab-v2/validation/dedRabValidationGate';
import { DedWorkItem } from '../ded-rab-v2/types';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';

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

const sampleItem = (overrides: Partial<DedWorkItem> = {}): DedWorkItem => ({
  id: 'DED-001',
  projectId: 'PRJ-TEST-PRICE',
  sourceDocumentId: 'doc-01',
  name: 'Pondasi Batu Kali 1:4',
  category: 'FOUNDATION',
  status: 'CONFIRMED',
  evidenceIds: ['EV-001'],
  sourcePages: [1],
  dimensions: {
    length: { value: 10, unit: 'm' },
    width: { value: 0.8, unit: 'm' },
    height: { value: 0.8, unit: 'm' },
  },
  geometry: { shape: 'RECTANGULAR' },
  unit: 'm³',
  quantity: 6.4,
  calculationInputs: {},
  confidence: 0.95,
  assumptions: [],
  warnings: [],
  materialSpec: 'Batu belah camp 1:4',
  qto: {
    formula: '10 * 0.8 * 0.8',
    quantity: 6.4,
    unit: 'm³',
    status: 'CALCULATED',
  },
  ahspMatch: {
    code: '2.2.2.1.6',
    name: 'Pasangan Pondasi Batu Belah Campuran 1 SP : 4 PP',
    unit: 'm³',
    matchType: 'EXACT_MATCH',
    source: 'PUPR 2026',
    confidence: 1.0,
  },
  ...overrides,
});

console.log('======================================================================');
console.log('EZRAB — AI PRICE ESTIMATION ENGINE & FALLBACK VERIFICATION SUITE');
console.log('======================================================================');

// =========================================================================
// 1. Model Routing Verification
// =========================================================================
console.log('\n--- 1. Model Routing (EZRAB-AI-1.3 vs EZRAB-AI-Pro) ---');

check('routes routine standard materials to EZRAB-AI-1.3', () => {
  const routine = aiPriceEstimationEngine.routeModel({
    name: 'Pasir pasang lokal ayak',
    specification: 'Standar bangunan rumah',
    category: 'FOUNDATION',
  });
  assert.equal(routine.model, MODEL_EZRAB_AI_1_3);
});

check('routes complex technical specifications to EZRAB-AI-Pro', () => {
  const complexTech = aiPriceEstimationEngine.routeModel({
    name: 'Bore pile beton K-350 diameter 60 cm',
    specification: 'Pengecoran tremie bawah air kedalaman 18 m',
    category: 'FOUNDATION',
  });
  assert.equal(complexTech.model, MODEL_EZRAB_AI_PRO);
  assert.ok(complexTech.complexityFactors.some((f) => f.includes('bore pile') || f.includes('k-350')));
});

check('routes unusual chemical materials and additives to EZRAB-AI-Pro', () => {
  const unusual = aiPriceEstimationEngine.routeModel({
    name: 'Waterproofing membrane bakar 3mm dengan primer polyurethane',
    specification: 'Elastomeric bituminous torch-on',
  });
  assert.equal(unusual.model, MODEL_EZRAB_AI_PRO);
});

check('routes remote eastern Indonesia regions to EZRAB-AI-Pro', () => {
  const remote = aiPriceEstimationEngine.routeModel({
    name: 'Batu belah pondasi',
    region: 'Kabupaten Jayawijaya, Papua Pegunungan',
  });
  assert.equal(remote.model, MODEL_EZRAB_AI_PRO);
  assert.ok(remote.complexityFactors.some((f) => f.includes('Papua')));
});

// =========================================================================
// 2. Resource-Level Estimation Principles
// =========================================================================
console.log('\n--- 2. Resource-Level Estimation & Deterministic Composition ---');

check('estimates missing resource prices and records reasoning metadata', () => {
  const est = aiPriceEstimationEngine.estimateResourcePrice({
    name: 'Aditif Cair Superplasticizer Beton Sikament',
    type: 'material',
    unit: 'kg',
    specification: 'High range water reducing admixture',
  });

  assert.ok(est.estimated_price > 0, 'Estimated price must be greater than zero');
  assert.equal(est.source_type, 'AI_ESTIMATE');
  assert.equal(est.status, 'ESTIMATED');
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(est.confidence_level));
  assert.ok(est.range.low < est.range.central);
  assert.ok(est.range.high > est.range.central);
  assert.ok(est.basis.length > 0);
  assert.ok(est.calculation_method.length > 0);
  assert.ok(Array.isArray(est.inputs) ? est.inputs.length > 0 : Object.keys(est.inputs).length > 0);
});

check('preserves known DB component prices and estimates only missing components via SafeDecimalEngine', () => {
  const knownComponents = [
    {
      type: 'MATERIAL' as const,
      code: 'M01',
      name: 'Semen Portland (Known DB)',
      unit: 'kg',
      coefficient: 100,
      unitPrice: 1500, // Rp 150.000
      totalPrice: 150000,
      priceSource: 'OFFICIAL_DATABASE' as const,
      priceStatus: 'PRICE_INTERNAL' as const,
    },
    {
      type: 'LABOR' as const,
      code: 'L01',
      name: 'Pekerja (Known DB)',
      unit: 'OH',
      coefficient: 1.5,
      unitPrice: 120000, // Rp 180.000
      totalPrice: 180000,
      priceSource: 'OFFICIAL_DATABASE' as const,
      priceStatus: 'PRICE_INTERNAL' as const,
    },
  ];

  const missingResources = [
    {
      code: 'M-ADD-01',
      name: 'Aditif Waterproofing Khusus',
      type: 'material',
      unit: 'kg',
      coefficient: 2.0,
    },
  ];

  const composite = aiPriceEstimationEngine.estimateMissingAhspComponents(
    '2.2.1.CUSTOM',
    'Beton Khusus Tahan Air',
    knownComponents,
    missingResources,
    5.0
  );

  // Verify composition
  assert.ok(composite.unitPrice! > 330000, 'Composite price must include known (330k) + estimated additive');
  assert.equal(composite.priceStatus, 'PRICE_MIXED', 'Mixed known DB + AI estimate must be PRICE_MIXED');
  assert.equal(composite.priceSource, 'MIXED');
  assert.equal(composite.isOfficial, false, 'Must NEVER be marked as official');

  // Verify SafeDecimalEngine calculation
  const additiveComponent = composite.components?.find((c) => c.name.includes('Aditif'));
  assert.ok(additiveComponent, 'Additive must be present in components');
  assert.equal(additiveComponent?.priceStatus, 'PRICE_AI_ESTIMATE');
  assert.equal(additiveComponent?.isEstimated, true);

  const expectedUnit = SafeDecimalEngine.safeAdd(
    composite.materialPrice!,
    SafeDecimalEngine.safeAdd(composite.laborPrice!, composite.equipmentPrice!)
  );
  assert.equal(composite.unitPrice, expectedUnit, 'Unit price must exactly equal sum of components');
  assert.equal(composite.totalPrice, SafeDecimalEngine.safeMultiply(composite.unitPrice!, 5.0, 2));

  // Verify range preservation
  assert.ok(composite.range!.low < composite.unitPrice!);
  assert.ok(composite.range!.high > composite.unitPrice!);
});

// =========================================================================
// 3. 7-Tier Resolution Hierarchy in AhspPriceResolver
// =========================================================================
console.log('\n--- 3. 7-Tier Audited Resolution Hierarchy ---');

check('Priority 1: Project price overrides official DB price', () => {
  const item = sampleItem();
  const existingProjectRab = [
    {
      id: 'RAB-001',
      ahspCode: '2.2.2.1.6',
      description: 'Pondasi Batu Kali Project Override',
      unitPrice: 1250000, // Custom project rate
      unit: 'm³',
      quantity: 10,
      category: 'FOUNDATION',
    } as any,
  ];

  const res = ahspPriceResolver.resolvePrice(item, existingProjectRab);
  assert.equal(res.priceSource, 'PROJECT_PRICE');
  assert.equal(res.priceStatus, 'PRICE_INTERNAL');
  assert.equal(res.unitPrice, 1250000);
  assert.equal(res.isOfficial, true);
});

check('Priority 2: Company/Workspace price catalog overrides official catalog', () => {
  const item = sampleItem();
  const companyCatalog = [{ code: '2.2.2.1.6', unitPrice: 1100000 }];

  const res = ahspPriceResolver.resolvePrice(item, [], companyCatalog);
  assert.equal(res.priceSource, 'COMPANY_PRICE');
  assert.equal(res.priceStatus, 'PRICE_INTERNAL');
  assert.equal(res.unitPrice, 1100000);
  assert.equal(res.isOfficial, true);
});

check('Priority 3: Official AHSP PUPR 2026 resolves with OFFICIAL_AHSP and PRICE_INTERNAL', () => {
  const item = sampleItem();
  const res = ahspPriceResolver.resolvePrice(item, [], []);

  assert.equal(res.priceSource, 'OFFICIAL_AHSP');
  assert.equal(res.priceStatus, 'PRICE_INTERNAL');
  assert.equal(res.isOfficial, true);
  assert.ok(res.unitPrice! > 0);
  assert.ok(res.components && res.components.length > 0);
});

check('Priority 6: Falls back to AI Price Estimation for uncataloged construction work', () => {
  const uncatalogedItem = sampleItem({
    id: 'DED-999',
    name: 'Pemasangan Pintu Lipat Garasi Besi Hollow Tempered Glass',
    unit: 'm²',
    materialSpec: 'Besi hollow galvanis 40x60 t=1.8mm + Kaca tempered 8mm',
    ahspMatch: {
      code: '',
      name: '',
      unit: 'm²',
      matchType: 'NOT_FOUND',
      source: '',
      confidence: 0,
    },
  });

  const res = ahspPriceResolver.resolvePrice(uncatalogedItem, [], [], { enableAiFallback: true });

  assert.ok(res.unitPrice !== null && res.unitPrice > 0, 'Uncataloged item must NOT be left without price');
  assert.equal(res.priceSource, 'AI_ESTIMATE');
  assert.equal(res.priceStatus, 'PRICE_AI_ESTIMATE');
  assert.equal(res.isOfficial, false, 'AI estimated price must carry isOfficial = false');
  assert.ok(res.estimationRecord, 'Must record estimation provenance');
  assert.ok(res.range?.low! < res.range?.central!);
});

check('Priority 7: Returns PRICE_UNRESOLVED only when AI fallback is explicitly disabled', () => {
  const uncatalogedItem = sampleItem({
    id: 'DED-999',
    name: 'Item Fiktif Tanpa Harga',
    ahspMatch: {
      code: '',
      name: '',
      unit: 'm²',
      matchType: 'NOT_FOUND',
      source: '',
      confidence: 0,
    },
  });

  const res = ahspPriceResolver.resolvePrice(uncatalogedItem, [], [], { enableAiFallback: false });
  assert.equal(res.unitPrice, null);
  assert.equal(res.priceStatus, 'PRICE_UNRESOLVED');
  assert.equal(res.priceSource, 'PRICE_NOT_FOUND');
});

// =========================================================================
// 4. RAB Ready Rule (13-Gate Integration)
// =========================================================================
console.log('\n--- 4. RAB Ready Rule (Validation Gates Compatibility) ---');

check('admits official AHSP items with AI-estimated components into the RAB as READY', () => {
  const mixedItem = sampleItem({
    id: 'DED-010',
    name: 'Pondasi Batu Kali 1:4',
    price: {
      unitPrice: 950000,
      totalPrice: 6080000,
      priceSource: 'MIXED',
      priceStatus: 'PRICE_MIXED',
      isOfficial: false,
      currency: 'IDR',
      materialPrice: 650000,
      laborPrice: 300000,
      equipmentPrice: 0,
      subtotalMaterial: 4160000,
      subtotalLabor: 1920000,
      subtotalEquipment: 0,
      components: [
        {
          type: 'MATERIAL',
          name: 'Batu Belah',
          unit: 'm³',
          coefficient: 1.2,
          unitPrice: 280000,
          totalPrice: 336000,
          priceSource: 'OFFICIAL_DATABASE',
          priceStatus: 'PRICE_INTERNAL',
        },
        {
          type: 'MATERIAL',
          name: 'Aditif Khusus',
          unit: 'kg',
          coefficient: 1.0,
          unitPrice: 50000,
          totalPrice: 50000,
          priceSource: 'AI_ESTIMATE',
          priceStatus: 'PRICE_AI_ESTIMATE',
          isEstimated: true,
        },
        {
          type: 'LABOR',
          name: 'Tukang Batu',
          unit: 'OH',
          coefficient: 0.75,
          unitPrice: 160000,
          totalPrice: 120000,
          priceSource: 'OFFICIAL_DATABASE',
          priceStatus: 'PRICE_INTERNAL',
        },
      ],
      confidenceRating: 'MEDIUM',
    },
    priceStatus: 'PRICE_MIXED',
    missingResources: [],
  });

  const validation = dedRabValidationGate.validateItem(mixedItem, 'PRJ-TEST-PRICE');

  assert.equal(validation.isValid, true, 'Item with AI-estimated mixed price must be valid');
  assert.equal(validation.status, 'READY', 'Validation status must be READY');
  assert.equal(validation.rabEligible, true, 'Must be allowed into the RAB');
  assert.equal(validation.provenance?.databaseVerified, false, 'Must NOT claim official DB verification');
  assert.ok(validation.provenance?.matchReasons.some((r) => r.includes('estimasi AI')));
});

check('admits uncataloged construction work with AI specification and AI price into RAB as READY', () => {
  const aiSpecItem = sampleItem({
    id: 'DED-011',
    name: 'Pekerjaan Partisi Kaca Tempered 10mm Rangka Aluminium',
    materialSpec: 'Kaca tempered 10 mm clear + Frame aluminium 4 inch anodized',
    ahspMatch: {
      code: '',
      name: '',
      unit: 'm²',
      matchType: 'NOT_FOUND',
      source: '',
      confidence: 0,
    },
    price: {
      unitPrice: 850000,
      totalPrice: 8500000,
      priceSource: 'AI_ESTIMATE',
      priceStatus: 'PRICE_AI_ESTIMATE',
      isOfficial: false,
      currency: 'IDR',
      components: [
        {
          type: 'MATERIAL',
          name: 'Kaca tempered 10mm + Frame',
          unit: 'm²',
          coefficient: 1.0,
          unitPrice: 550000,
          totalPrice: 550000,
          priceSource: 'AI_ESTIMATE',
          priceStatus: 'PRICE_AI_ESTIMATE',
        },
        {
          type: 'LABOR',
          name: 'Upah Tukang Pasang Kaca',
          unit: 'm²',
          coefficient: 1.0,
          unitPrice: 300000,
          totalPrice: 300000,
          priceSource: 'AI_ESTIMATE',
          priceStatus: 'PRICE_AI_ESTIMATE',
        },
      ],
      confidenceRating: 'MEDIUM',
    },
    priceStatus: 'PRICE_AI_ESTIMATE',
    missingResources: [],
  });

  const validation = dedRabValidationGate.validateItem(aiSpecItem, 'PRJ-TEST-PRICE');

  assert.equal(validation.isValid, true, 'AI construction spec with AI price must be RAB eligible');
  assert.equal(validation.status, 'READY');
  assert.equal(validation.rabEligible, true);
  assert.equal(validation.provenance?.databaseVerified, false);
  assert.ok(validation.provenance?.matchedAhspCode.includes('AI-ESTIMATE'));
});

console.log('======================================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('======================================================================');

if (failed > 0) {
  process.exit(1);
}

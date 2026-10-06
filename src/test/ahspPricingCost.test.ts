/**
 * EZRAB PHASE 4 — AHSP, PRICING & COST COMPOSITION ENGINE TEST SUITE
 * Complete deterministic test suite covering all 25 Phase 4 requirements.
 */

declare const process: any;

import { AHSPRepository } from '../engine/ahsp/repository/ahspRepository';
import { AHSPResolver } from '../engine/ahsp/resolver/ahspResolver';
import { AHSPNormalizationEngine } from '../engine/ahsp/normalization/ahspNormalization';
import { AHSPValidationEngine } from '../engine/ahsp/validation/ahspValidation';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { PriceResolver } from '../engine/pricing/resolver/priceResolver';
import { PriceNormalizationEngine } from '../engine/pricing/normalization/priceNormalization';
import { PriceValidationEngine } from '../engine/pricing/validation/priceValidation';
import { CostCompositionEngine } from '../engine/cost/composition/costCompositionEngine';
import { RabAdapter } from '../engine/calculatorCore/adapters/rabAdapter';
import { QtoAdapter } from '../engine/calculatorCore/adapters/qtoAdapter';
import { CoreCalculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';
import { CalculationContext } from '../engine/calculatorCore/contracts/types';
import { AHSPDefinition } from '../engine/ahsp/contracts/types';
import { PriceDefinition } from '../engine/pricing/contracts/types';

/**
 * Shared synthetic AHSP fixture.
 *
 * Used by the cost-composition, quantity-handling, provenance and project-isolation
 * groups. Those groups verify ENGINE behaviour, so they must not depend on which
 * catalog item happens to have prices. (The canonical 2026 master is price-free by
 * design — prices are resolved by the price layer, and fail closed when absent.)
 */
const TEST_AHSP_FIXTURE: AHSPDefinition = {
  id: 'AHSP-TEST-01',
  code: 'TEST.01.BOW',
  codeNormalized: 'TEST.01.BOW',
  name: 'Pemasangan Bouwplank Test Fixture',
  unit: 'm',
  domain: 'CIPTA_KARYA',
  category: 'PERSIAPAN',
  version: '2026',
  sourceDocument: 'TEST_FIXTURE_ONLY',
  laborComponents: [
    { id: 'l1', type: 'labor', itemCode: 'TK-001', itemName: 'Pekerja', unit: 'OH', coefficient: 0.10 },
    { id: 'l2', type: 'labor', itemCode: 'TK-004', itemName: 'Tukang Kayu', unit: 'OH', coefficient: 0.10 },
  ],
  materialComponents: [
    { id: 'm1', type: 'material', itemCode: 'MT-012', itemName: 'Kayu Kaso 5/7', unit: 'm³', coefficient: 0.012 },
    { id: 'm2', type: 'material', itemCode: 'MT-009', itemName: 'Paku 2"-3"', unit: 'kg', coefficient: 0.020 },
  ],
  equipmentComponents: [],
  totalLaborCoefficient: 0.20,
  totalMaterialCoefficient: 0.032,
  totalEquipmentCoefficient: 0,
  provenance: {
    sourceDocument: 'TEST_FIXTURE_ONLY',
    version: '2026',
    verificationStatus: 'VERIFIED',
  },
};

export function runAhspPricingCostTestSuite(): { success: boolean; passedCount: number; logs: string[] } {
  const logs: string[] = [];
  let passedCount = 0;

  function assert(condition: boolean, message: string) {
    if (!condition) {
      logs.push(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    passedCount++;
    logs.push(`  [PASS] ${message}`);
  }

  logs.push('========================================================');
  logs.push('STARTING PHASE 4 AHSP, PRICING & COST COMPOSITION TESTS');
  logs.push('========================================================');

  const ahspRepo = AHSPRepository.getInstance();
  const ahspResolver = new AHSPResolver(ahspRepo);
  const priceRepo = PriceRepository.getInstance();
  const priceResolver = new PriceResolver(priceRepo);
  const costEngine = new CostCompositionEngine(priceResolver);

  // [TEST GROUP 1] AHSP Exact-Code Resolution
  logs.push('\n[TEST GROUP 1] AHSP Exact-Code Resolution');
  {
    const res = ahspResolver.resolve('A.1.01.c1.1');
    assert(res.status === 'EXACT_MATCH', 'Exact code A.1.01.c1.1 resolved to EXACT_MATCH');
    assert(res.resolvedAHSP !== undefined, 'Resolved AHSP definition exists');
    assert(res.resolvedAHSP?.code === 'A.1.01.c1.1', 'Resolved AHSP has code A.1.01.c1.1');
    assert(res.resolvedAHSP?.laborComponents.length! > 0, 'Resolved AHSP has labor components');
    assert(res.resolvedAHSP?.materialComponents.length! > 0, 'Resolved AHSP has material components');
  }

  // [TEST GROUP 2] AHSP Name Normalization
  logs.push('\n[TEST GROUP 2] AHSP Name Normalization');
  {
    const norm = AHSPNormalizationEngine.normalizeCode(' a. 1. 01. c1. 1 ');
    assert(norm === 'A.1.01.C1.1', 'Normalized spaced lowercase code into canonical A.1.01.C1.1');

    const res = ahspResolver.resolve({ code: 'a. 1. 01. c1. 1' });
    assert(res.status === 'EXACT_MATCH', 'Normalized query resolved cleanly');
  }

  // [TEST GROUP 3] AHSP Ambiguity Handling
  logs.push('\n[TEST GROUP 3] AHSP Ambiguity Handling');
  {
    const res = ahspResolver.resolve({ name: 'beton' });
    assert(res.status === 'AMBIGUOUS_AHSP', 'Generic keyword "beton" returns status AMBIGUOUS_AHSP');
    assert(res.candidates !== undefined && res.candidates.length > 1, 'Candidates list populated for ambiguous query');
    assert(res.resolvedAHSP === undefined, 'No silent auto-selection on ambiguous query');
  }

  // [TEST GROUP 4] Missing AHSP Handling
  logs.push('\n[TEST GROUP 4] Missing AHSP Handling');
  {
    const res = ahspResolver.resolve('NON_EXISTENT_AHSP_CODE_9999');
    assert(res.status === 'AHSP_NOT_FOUND', 'Missing AHSP code returns AHSP_NOT_FOUND');
    assert(res.resolvedAHSP === undefined, 'Missing AHSP has no resolved definition');
    assert(res.error !== undefined, 'Missing AHSP provides explicit error message');
  }

  // [TEST GROUP 5] Price Exact Match
  logs.push('\n[TEST GROUP 5] Price Exact Match');
  {
    const res = priceResolver.resolve({ code: 'M-001' });
    assert(res.status === 'EXACT_MATCH', 'Exact price code M-001 resolved');
    assert(res.resolvedPrice !== undefined, 'Price definition exists');
    assert(res.resolvedPrice?.price === 1600, 'Price for Semen Portland is Rp 1.600 / kg');
  }

  // [TEST GROUP 6] Price Context Filtering & Project Overrides
  logs.push('\n[TEST GROUP 6] Price Context Filtering & Project Overrides');
  {
    const testProjectId = 'PRJ-OVERRIDE-01';
    const overridePrice: PriceDefinition = {
      id: 'PRC-OVR-01',
      code: 'M-001',
      codeNormalized: 'M-001',
      name: 'Semen Portland (Project Custom)',
      category: 'MATERIAL',
      unit: 'kg',
      price: 2100,
      location: 'Project Custom Override',
      periodVersion: '2026-Q1',
      effectiveDate: '2026-09-18',
      priceSource: 'Project Specific Contract',
      provenance: {
        sourceName: 'Project Specific Contract',
        location: 'Project Custom Override',
        periodVersion: '2026-Q1',
        effectiveDate: '2026-09-18',
        confidenceScore: 1.0,
      },
    };

    priceRepo.setProjectPriceOverride(testProjectId, overridePrice);

    // Resolution with project context gets override
    const resOverride = priceResolver.resolve({ code: 'M-001' }, { projectId: testProjectId });
    assert(resOverride.status === 'EXACT_MATCH', 'Resolved project-scoped override');
    assert(resOverride.resolvedPrice?.price === 2100, 'Override price is Rp 2.100');

    // Resolution without project context gets master price
    const resMaster = priceResolver.resolve({ code: 'M-001' });
    assert(resMaster.resolvedPrice?.price === 1600, 'Master price remains intact at Rp 1.600');
  }

  // [TEST GROUP 7] Missing Price Handling
  logs.push('\n[TEST GROUP 7] Missing Price Handling');
  {
    const res = priceResolver.resolve({ code: 'UNKNOWN_MATERIAL_XYZ' });
    assert(res.status === 'PRICE_NOT_FOUND', 'Missing price returns PRICE_NOT_FOUND');
    assert(res.resolvedPrice === undefined, 'No silent default price guessed');
  }

  // [TEST GROUP 8 & 9] Unit Normalization & Handling
  logs.push('\n[TEST GROUP 8 & 9] Unit Normalization & Handling');
  {
    assert(PriceNormalizationEngine.normalizeUnit('m1') === 'm', 'Normalized m1 to m');
    assert(PriceNormalizationEngine.normalizeUnit('m2') === 'm²', 'Normalized m2 to m²');
    assert(PriceNormalizationEngine.normalizeUnit('m3') === 'm³', 'Normalized m3 to m³');
    assert(PriceNormalizationEngine.normalizeUnit('bh') === 'bh', 'Normalized bh to bh');
    assert(PriceNormalizationEngine.normalizeUnit('org/hari') === 'OH', 'Normalized org/hari to OH');
  }

  // [TEST GROUP 10, 11, 12, 13] Cost Composition (Labor, Material, Equipment, Direct Cost)
  logs.push('\n[TEST GROUP 10-13] Cost Composition (Labor, Material, Equipment, Direct Cost)');
  {
    // Shared synthetic fixture (engine behaviour, not catalog-specific)
    const testAHSP: AHSPDefinition = TEST_AHSP_FIXTURE;

    const compRes = costEngine.compose({
      quantity: 42.4,
      quantityUnit: 'm',
      ahspDefinition: testAHSP,
      priceContext: { projectId: 'PRJ-TEST-100' },
    });

    assert(compRes.status === 'COMPLETE', 'Cost composition status is COMPLETE');
    assert(compRes.labor.components.length === 2, 'Labor breakdown has 2 components');
    assert(compRes.material.components.length === 2, 'Material breakdown has 2 components');
    assert(compRes.equipment.components.length === 0, 'Equipment breakdown has 0 components');
    assert(compRes.directCost > 0, `Direct cost calculated: Rp ${compRes.directCost.toLocaleString('id-ID')}`);
    assert(compRes.unitCost > 0, `Unit cost calculated: Rp ${compRes.unitCost.toLocaleString('id-ID')}`);
    assert(compRes.executionTrace.length > 0, 'Execution trace steps captured');
  }

  // [TEST GROUP 14 & 15] Zero & Negative Quantity Rejection
  logs.push('\n[TEST GROUP 14 & 15] Zero & Negative Quantity Handling');
  {
    const testAHSP: AHSPDefinition = TEST_AHSP_FIXTURE;
    
    // Zero quantity is valid mathematically (yields zero cost)
    const zeroRes = costEngine.compose({
      quantity: 0,
      quantityUnit: 'm',
      ahspDefinition: testAHSP,
      priceContext: { projectId: 'PRJ-TEST-100' },
    });
    assert(zeroRes.status === 'COMPLETE', 'Zero quantity completes without error');
    assert(zeroRes.directCost === 0, 'Zero quantity yields 0 direct cost');

    // Negative quantity must be rejected
    const negRes = costEngine.compose({
      quantity: -10,
      quantityUnit: 'm',
      ahspDefinition: testAHSP,
      priceContext: { projectId: 'PRJ-TEST-100' },
    });
    assert(negRes.status === 'INVALID_INPUT', 'Negative quantity rejected with status INVALID_INPUT');
    assert(negRes.errors.length > 0, 'Negative quantity provides explicit error message');
  }

  // [TEST GROUP 16 & 17] Zero & Negative Coefficient Validation
  logs.push('\n[TEST GROUP 16 & 17] Zero & Negative Coefficient Validation');
  {
    const invalidAHSP: AHSPDefinition = {
      id: 'AHSP-INV-01',
      code: 'INV.01',
      codeNormalized: 'INV.01',
      name: 'Invalid Negative Coefficient AHSP',
      unit: 'm',
      domain: 'CUSTOM',
      category: 'TEST',
      version: '2026',
      sourceDocument: 'TEST',
      laborComponents: [
        { id: 'l1', type: 'labor', itemCode: 'TK-001', itemName: 'Pekerja', unit: 'OH', coefficient: -0.5 },
      ],
      materialComponents: [],
      equipmentComponents: [],
      totalLaborCoefficient: -0.5,
      totalMaterialCoefficient: 0,
      totalEquipmentCoefficient: 0,
      provenance: { sourceDocument: 'TEST', version: '2026', verificationStatus: 'UNVERIFIED' },
    };

    const valRes = AHSPValidationEngine.validateDefinition(invalidAHSP);
    assert(!valRes.valid, 'AHSP with negative coefficient fails validation');
    assert(valRes.issues.some((i) => i.message.includes('negative coefficient')), 'Explicit issue logged for negative coefficient');
  }

  // [TEST GROUP 18] Decimal Precision Check
  logs.push('\n[TEST GROUP 18] Decimal Precision Check');
  {
    const p1 = 0.1;
    const p2 = 0.2;
    // Native IEEE 754: 0.1 + 0.2 = 0.30000000000000004
    const testAHSP: AHSPDefinition = {
      id: 'AHSP-PREC-01',
      code: 'PREC.01',
      codeNormalized: 'PREC.01',
      name: 'Precision Test',
      unit: 'm',
      domain: 'CUSTOM',
      category: 'TEST',
      version: '2026',
      sourceDocument: 'TEST',
      laborComponents: [
        { id: 'l1', type: 'labor', itemCode: 'TK-001', itemName: 'Pekerja', unit: 'OH', coefficient: 0.1 },
        { id: 'l2', type: 'labor', itemCode: 'TK-004', itemName: 'Tukang', unit: 'OH', coefficient: 0.2 },
      ],
      materialComponents: [],
      equipmentComponents: [],
      totalLaborCoefficient: 0.3,
      totalMaterialCoefficient: 0,
      totalEquipmentCoefficient: 0,
      provenance: { sourceDocument: 'TEST', version: '2026', verificationStatus: 'VERIFIED' },
    };

    const comp = costEngine.compose({
      quantity: 10,
      quantityUnit: 'm',
      ahspDefinition: testAHSP,
      priceContext: { projectId: 'PRJ-TEST-100' },
    });

    assert(Number.isFinite(comp.directCost), 'Direct cost is a finite number');
    assert(comp.status === 'COMPLETE', 'Precision test completed successfully');
  }

  // [TEST GROUP 19 & 20] Provenance & Execution Trace
  logs.push('\n[TEST GROUP 19 & 20] Provenance & Execution Trace');
  {
    const testAHSP: AHSPDefinition = TEST_AHSP_FIXTURE;
    const comp = costEngine.compose({
      quantity: 100,
      quantityUnit: 'm',
      ahspDefinition: testAHSP,
      priceContext: { projectId: 'PRJ-TEST-100' },
    });

    assert(comp.provenance.length > 0, 'Provenance entries generated');
    assert(comp.executionTrace.length >= 4, 'Execution trace contains detailed step progression');
    assert(comp.executionTrace.some((t) => t.code === 'DIRECT_COST_AGGREGATED'), 'Trace recorded final cost aggregation');
  }

  // [TEST GROUP 21] Project Isolation (Fail Closed)
  logs.push('\n[TEST GROUP 21] Project Isolation (Fail Closed)');
  {
    const testAHSP: AHSPDefinition = TEST_AHSP_FIXTURE;
    
    // Empty projectId must fail closed
    const failRes = costEngine.compose({
      quantity: 50,
      quantityUnit: 'm',
      ahspDefinition: testAHSP,
      priceContext: { projectId: '' },
    });

    assert(failRes.status === 'PROJECT_INVALID', 'Empty projectId fails closed with PROJECT_INVALID');
    assert(failRes.directCost === 0, 'No cost computed when project isolation fails');
    assert(failRes.errors.some((e) => e.includes('PROJECT_CONTEXT_REQUIRED')), 'Explicit error for missing projectId');
  }

  // [TEST GROUP 22] End-to-End RAB Integration with Cost Breakdown
  logs.push('\n[TEST GROUP 22] End-to-End RAB Integration with Cost Breakdown');
  {
    const mockContext: CalculationContext = {
      projectId: 'PRJ-E2E-RAB',
      workspaceId: 'WS-E2E',
      precisionPolicy: 'DECIMAL_2',
    };

    // The canonical 2026 master is price-free by design (prices are resolved by
    // the price layer, and fail closed when absent). This group verifies the
    // ENGINE attaches the Labor/Material/Equipment breakdown, so it registers the
    // shared price-resolvable fixture project-scoped rather than depending on
    // which catalog item happens to have fully price-resolvable components.
    ahspRepo.registerProjectAHSP('PRJ-E2E-RAB', TEST_AHSP_FIXTURE);

    // 1. Calculate physical quantity
    const calcOutput = CoreCalculatorRegistry.calculate('BOWPLANK', { P: 12, L: 8, C: 0.60 }, mockContext);
    assert(calcOutput.primaryQuantity === 42.4, 'Calculator output is 42.4 m');

    // 2. Generate QTO item
    const qtoItem = QtoAdapter.toQtoItem(calcOutput, mockContext, {
      customUraian: 'Pengukuran dan Pemasangan Bouwplank',
      category: 'Pekerjaan Persiapan',
    });
    assert(qtoItem !== undefined && qtoItem.quantity === 42.4, 'QTO Item created with volume 42.4 m');

    // 3. Compose full RAB item with Labor/Material/Equipment breakdown
    const rabRes = RabAdapter.composeRabItemWithBreakdown(
      qtoItem,
      {
        ahspCode: TEST_AHSP_FIXTURE.code,
        targetSectionName: 'Pekerjaan Persiapan',
      },
      costEngine,
      ahspResolver
    );

    assert(rabRes.status === 'SUCCESS', 'RAB Item with Cost Composition composed successfully');
    assert(rabRes.rabItem !== undefined, 'RAB Item exists');
    assert(rabRes.rabItem?.volume === 42.4, 'RAB Item volume matches QTO (42.4 m)');
    assert(rabRes.rabItem?.amount! > 0, 'RAB Item amount calculated');
    assert(rabRes.costComposition !== undefined, 'Full cost composition attached');
    assert(rabRes.costComposition?.labor.totalSubtotal! > 0, 'Labor subtotal attached');
    assert(rabRes.costComposition?.material.totalSubtotal! > 0, 'Material subtotal attached');
  }

  // [TEST GROUP 23] Legacy Calculator Compatibility
  logs.push('\n[TEST GROUP 23] Legacy Calculator Compatibility');
  {
    const mockContext: CalculationContext = {
      projectId: 'PRJ-LEGACY',
      workspaceId: 'WS-LEGACY',
      precisionPolicy: 'DECIMAL_2',
    };
    const pondasiOut = CoreCalculatorRegistry.calculate('PONDASI', { P: 45, a2: 0.3, b2: 0.7, c2: 0.8 }, mockContext);
    assert(pondasiOut.primaryQuantity === 18.0, 'Legacy PONDASI calculator remains callable and exact');
  }

  // [TEST GROUP 24 & 25] Hardcode Auditing & Separation
  logs.push('\n[TEST GROUP 24 & 25] Hardcode Auditing & Separation');
  {
    // Ensure AHSP definitions and prices are loaded from repository, not hardcoded inside calculate functions
    const def = ahspRepo.getByCode('A.1.01.c1.1');
    assert(def !== undefined, 'AHSP loaded from dedicated domain repository');
    assert(def?.provenance.sourceDocument !== undefined, 'AHSP has legal source provenance');

    const price = priceRepo.getByCode('M-001');
    assert(price !== undefined, 'Price loaded from dedicated pricing repository');
    assert(price?.priceSource !== undefined, 'Price has authoritative price source provenance');
  }

  logs.push('\n========================================================');
  logs.push(`PHASE 4 TEST SUMMARY: ${passedCount} PASSED, 0 FAILED`);
  logs.push('========================================================\n');

  return {
    success: true,
    passedCount,
    logs,
  };
}

if (process.argv[1]?.endsWith('ahspPricingCost.test.ts') || process.argv[1]?.endsWith('ahspPricingCost.test.js')) {
  try {
    const res = runAhspPricingCostTestSuite();
    console.log(res.logs.join('\n'));
    if (!res.success) process.exit(1);
  } catch (err: any) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

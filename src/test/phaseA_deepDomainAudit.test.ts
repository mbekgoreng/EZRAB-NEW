import assert from 'node:assert';
import { test, describe } from 'node:test';

// Domain Engines & Services
import { PriceResolver } from '../engine/pricing/resolver/priceResolver';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { projectPriceEngine } from '../engine/pricing/projectPriceEngine';
import { RabTemplateService } from '../services/rabTemplateService';
import { CoreCalculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';
import { LocalDocumentRepository } from '../document-engine/repository';
import { ProjectFinanceRepository } from '../domain/finance/repository';
import { buildUnifiedProjectContext } from '../services/unifiedProjectContext';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { dedRabReviewService } from '../ded-rab-v2/review/dedRabReviewService';
import { Project, RabItem } from '../types';

describe('EZRAB PHASE A — DEEP DOMAIN AUDIT TEST SUITE', () => {

  // =========================================================================
  // 1. PROJECT ISOLATION GATE (PROJECT A vs PROJECT B)
  // =========================================================================
  describe('[DOMAIN 1] Project Isolation: Fail-Closed & Zero Data Leakage', () => {
    const projA = 'PRJ-AUDIT-AAA';
    const projB = 'PRJ-AUDIT-BBB';

    test('1.1 Documents Isolation: Project A cannot see Project B documents', () => {
      const repoA = new LocalDocumentRepository(projA);
      const repoB = new LocalDocumentRepository(projB);

      repoA.saveDocument({
        id: 'doc-a1',
        definitionId: 'boq',
        documentId: 'boq',
        projectId: projA,
        status: 'COMPLETE',
        data: { secretA: 'SecretValueA' },
        sourceData: {},
        values: {},
        userFieldValues: {},
        sourceHash: 'hashA',
        sourceTimestamp: new Date().toISOString(),
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const docsInA = repoA.getProjectDocuments(projA);
      const docsInB = repoB.getProjectDocuments(projB);

      assert.strictEqual(docsInA.some((d) => d.id === 'doc-a1'), true);
      assert.strictEqual(docsInB.some((d) => d.id === 'doc-a1'), false);
    });

    test('1.2 Finance Isolation: Project A cannot see Project B transactions', () => {
      const finRepoA = new ProjectFinanceRepository(projA);
      const finRepoB = new ProjectFinanceRepository(projB);

      finRepoA.saveTermin({
        id: 'term-a1',
        projectId: projA,
        sequence: 1,
        name: 'DP Proyek A',
        percentage: 20,
        amount: 50000000,
        status: 'PAID',
      });

      assert.strictEqual(finRepoA.getTerminList().some((t) => t.id === 'term-a1'), true);
      assert.strictEqual(finRepoB.getTerminList().some((t) => t.id === 'term-a1'), false);
    });

    test('1.2b Regression F-01: saveTermin accepts name, alias title, empty name, or missing name without crash', () => {
      const finRepo = new ProjectFinanceRepository('PRJ-REGRESSION-F01');

      // Case 1: Standard name provided
      const t1 = finRepo.saveTermin({
        name: 'Termin Pertama 20%',
        percentage: 20,
        amount: 20000000,
      });
      assert.strictEqual(t1.name, 'Termin Pertama 20%');

      // Case 2: Alias title provided instead of name
      const t2 = finRepo.saveTermin({
        title: 'Termin Kedua 30% (Via Title)',
        percentage: 30,
        amount: 30000000,
      });
      assert.strictEqual(t2.name, 'Termin Kedua 30% (Via Title)');

      // Case 3: Empty name provided
      const t3 = finRepo.saveTermin({
        name: '   ',
        percentage: 25,
        amount: 25000000,
      });
      assert.strictEqual(t3.name, 'Termin 3');

      // Case 4: Completely missing / undefined name
      const t4 = finRepo.saveTermin({
        percentage: 25,
        amount: 25000000,
      });
      assert.strictEqual(t4.name, 'Termin 4');
    });

    test('1.3 Material Project Price Override Isolation: Project A override does not affect Project B', () => {
      const resolver = new PriceResolver(PriceRepository.getInstance());

      projectPriceEngine.setProjectOverride({
        projectId: projA,
        materialId: 'M-001',
        materialCode: 'M-001',
        materialName: 'Semen Portland',
        unit: 'kg',
        price: 2500,
        reason: 'Khusus Proyek A Negosiasi',
        active: true,
      });

      const resA = resolver.resolvePrice({ code: 'M-001', name: 'Semen Portland' }, { projectId: projA });
      const resB = resolver.resolvePrice({ code: 'M-001', name: 'Semen Portland' }, { projectId: projB });

      assert.strictEqual(resA.price, 2500);
      assert.strictEqual(resA.status, 'OVERRIDE');
      assert.notStrictEqual(resB.price, 2500);
      assert.notStrictEqual(resB.status, 'OVERRIDE');
    });

    test('1.4 Unified Context Fail-Closed Gate: Fails on missing or mismatched project', () => {
      const dummyProjA: Project = {
        id: projA,
        name: 'Proyek A',
        buildingType: 'Rumah Tinggal',
        status: 'draft',
        sections: [],
        costSummary: {
          directCost: 0,
          overheadPercent: 5,
          overheadAmount: 0,
          profitPercent: 5,
          profitAmount: 0,
          contingencyPercent: 0,
          contingencyAmount: 0,
          directorMarkupPercent: 0,
          directorMarkupNominal: 0,
          directorMarkupTotal: 0,
          showMarkupToEditor: false,
          showMarkupToClient: false,
          subtotalBeforeTax: 0,
          taxPercent: 11,
          taxAmount: 0,
          grandTotal: 0,
          costPerM2: 0,
        },
        createdAt: new Date().toISOString(),
      };

      assert.throws(() => {
        buildUnifiedProjectContext({
          projectId: '',
          project: dummyProjA,
        });
      }, /fail-closed/i);

      assert.throws(() => {
        buildUnifiedProjectContext({
          projectId: projB,
          project: dummyProjA,
        });
      }, /PROJECT_ISOLATION_ERROR/i);
    });
  });

  // =========================================================================
  // 2. RAB END-TO-END CALCULATION AUDIT
  // =========================================================================
  describe('[DOMAIN 7] Master RAB End-to-End Calculation Integrity', () => {
    test('2.1 Numeric Precision: SafeDecimalEngine prevents floating drift and NaN', () => {
      const vol = 12.35;
      const rate = 145250;
      const amount = SafeDecimalEngine.safeMultiply(vol, rate, 0);

      assert.strictEqual(amount, 1793838);
      assert.strictEqual(isNaN(amount), false);
      assert.strictEqual(isFinite(amount), true);
    });

    test('2.2 Zero Quantity / Missing Data: Does not produce NaN or crash', () => {
      const zeroAmount = SafeDecimalEngine.safeMultiply(0, 500000, 0);
      assert.strictEqual(zeroAmount, 0);

      const nullAmount = SafeDecimalEngine.safeMultiply(null as any, 500000, 0);
      assert.strictEqual(nullAmount, 0);
    });

    test('2.3 RAB Subtotal & Grand Total Recalculation', () => {
      const items: RabItem[] = [
        { id: '1', no: 1, code: 'A.1', category: 'Pekerjaan Tanah', description: 'Galian', volume: 10, unit: 'm3', unitPrice: 85000, amount: 850000 },
        { id: '2', no: 2, code: 'A.2', category: 'Pekerjaan Pondasi', description: 'Pondasi', volume: 5, unit: 'm3', unitPrice: 950000, amount: 4750000 },
      ];

      const directCost = items.reduce((acc, i) => acc + (i.amount || 0), 0);
      const overheadAmount = Math.round(directCost * 0.05);
      const profitAmount = Math.round(directCost * 0.05);
      const subtotalBeforeTax = directCost + overheadAmount + profitAmount;
      const taxAmount = Math.round(subtotalBeforeTax * 0.11);
      const grandTotal = subtotalBeforeTax + taxAmount;

      assert.strictEqual(directCost, 5600000);
      assert.strictEqual(overheadAmount, 280000);
      assert.strictEqual(profitAmount, 280000);
      assert.strictEqual(subtotalBeforeTax, 6160000);
      assert.strictEqual(taxAmount, 677600);
      assert.strictEqual(grandTotal, 6837600);
    });
  });

  // =========================================================================
  // 3. TEMPLATE RAB DETERMINISTIC CALCULATION
  // =========================================================================
  describe('[DOMAIN 3] Template RAB Reusability & Parameter Variation', () => {
    test('3.1 Parameter Variation Changes Quantities Deterministically', () => {
      const tplService = RabTemplateService.getInstance();
      const tpl = tplService.getTemplateById('HOUSE-T36-1FL');
      assert.ok(tpl, 'Template HOUSE-T36-1FL exists');

      // Standard parameters (36 m²)
      const res1 = tplService.generateRabFromTemplate(tpl!, { building_area: 36, floor_count: 1 }, 'PRJ-TPL-1', 'PROFESSIONAL');
      // Scaled parameters (72 m²)
      const res2 = tplService.generateRabFromTemplate(tpl!, { building_area: 72, floor_count: 1 }, 'PRJ-TPL-2', 'PROFESSIONAL');

      assert.strictEqual(res1.items.length > 0, true);
      assert.strictEqual(res2.items.length > 0, true);
      assert.ok(res2.totalEstimate > res1.totalEstimate, '72m2 estimate must be greater than 36m2');
      assert.strictEqual(isNaN(res1.totalEstimate), false);
      assert.strictEqual(isNaN(res2.totalEstimate), false);
    });
  });

  // =========================================================================
  // 4. MATERIAL & HARGA RESOLUTION HIERARCHY
  // =========================================================================
  describe('[DOMAIN 5 & 6] Material & AHSP Pricing Resolution Hierarchy', () => {
    test('4.1 Resolver Hierarchy: Project Override > Project Price > Master DB > Fail-Closed', () => {
      const resolver = new PriceResolver(PriceRepository.getInstance());
      const testPid = 'PRJ-PRICING-TEST';

      // Stage 1: Master DB baseline (M-001 Semen Portland = 1600)
      const baseRes = resolver.resolvePrice({ code: 'M-001', name: 'Semen Portland' }, { projectId: testPid });
      assert.strictEqual(baseRes.status, 'REFERENCE');
      const basePrice = baseRes.price;
      assert.strictEqual(basePrice, 1600);

      // Stage 2: Add Project Price
      projectPriceEngine.setProjectPrice({
        projectId: testPid,
        materialId: 'M-001',
        materialCode: 'M-001',
        materialName: 'Semen Portland',
        unit: 'kg',
        price: 2100,
        source: 'QUOTATION',
        supplierName: 'PT ReadyMix Jaya',
      });

      const ppRes = resolver.resolvePrice({ code: 'M-001', name: 'Semen Portland' }, { projectId: testPid });
      assert.strictEqual(ppRes.status, 'PROJECT_PRICE');
      assert.strictEqual(ppRes.price, 2100);

      // Stage 3: Add Project Override
      projectPriceEngine.setProjectOverride({
        projectId: testPid,
        materialId: 'M-001',
        materialCode: 'M-001',
        materialName: 'Semen Portland',
        unit: 'kg',
        price: 1950,
        reason: 'Estimator approved adjustment',
        active: true,
      });

      const ovrRes = resolver.resolvePrice({ code: 'M-001', name: 'Semen Portland' }, { projectId: testPid });
      assert.strictEqual(ovrRes.status, 'OVERRIDE');
      assert.strictEqual(ovrRes.price, 1950);

      // Stage 4: Unknown Item fails closed
      const unknownRes = resolver.resolvePrice({ code: 'NONEXISTENT_ITEM_999', name: 'Item Antah Berantah' }, { projectId: testPid });
      assert.strictEqual(unknownRes.status, 'NOT_FOUND');
      assert.strictEqual(unknownRes.price, 0);
    });
  });

  // =========================================================================
  // 5. DED -> RAB ZERO ITEM HONESTY & REVIEW CONVERSION
  // =========================================================================
  describe('[DOMAIN 8] DED -> RAB Review & Conversion Gate', () => {
    test('5.1 Zero items: dedRabReviewService correctly reports 0 and does not invent fake items', () => {
      const summary = dedRabReviewService.computeReviewSummary([]);
      assert.strictEqual(summary.totalItemsFound, 0);
      assert.strictEqual(summary.confirmedCount, 0);
      assert.strictEqual(summary.totalEstimatedRab, 0);
      assert.strictEqual(summary.coverage?.completenessScore, 0);
    });

    test('5.2 Only approved items with volume > 0 are converted to official RAB items', () => {
      const items: any[] = [
        {
          id: 'ITEM-1',
          name: 'Pekerjaan Pasangan Dinding',
          category: 'WALL',
          unit: 'm2',
          userApproved: true,
          qto: { quantity: 150, status: 'CALCULATED' },
          price: { unitPrice: 145000, totalPrice: 21750000 },
        },
        {
          id: 'ITEM-2',
          name: 'Pekerjaan Cat Dinding',
          category: 'PAINTING',
          unit: 'm2',
          userApproved: false, // Not approved by user
          qto: { quantity: 300, status: 'CALCULATED' },
          price: { unitPrice: 35000, totalPrice: 10500000 },
        },
        {
          id: 'ITEM-3',
          name: 'Pekerjaan Talang Air',
          category: 'ROOF',
          unit: 'm1',
          userApproved: true,
          qto: { quantity: 0, status: 'MISSING_DATA' }, // Volume 0
          price: { unitPrice: 85000, totalPrice: 0 },
        },
      ];

      const converted = dedRabReviewService.convertToOfficialRabItems(items, 'PRJ-CONVERT-1');
      assert.strictEqual(converted.length, 1);
      assert.strictEqual(converted[0].description, 'Pekerjaan Pasangan Dinding');
      assert.strictEqual(converted[0].volume, 150);
      assert.strictEqual(converted[0].amount, 21750000);
    });
  });

  // =========================================================================
  // 6. VOLUME CALCULATOR INTEGRITY
  // =========================================================================
  describe('[DOMAIN 4] Volume Calculator Registry & Boundary Tests', () => {
    test('6.1 Calculator registry has and executes legacy calculators', () => {
      assert.strictEqual(CoreCalculatorRegistry.has('BOWPLANK'), true);
      const bowplank = CoreCalculatorRegistry.get('BOWPLANK');
      assert.ok(bowplank, 'Bowplank calculator is registered');

      const res = bowplank.calculate({ panjang_bangunan: 10, lebar_bangunan: 8 });
      assert.ok(res.primaryQuantity > 0);
      assert.strictEqual(isNaN(res.primaryQuantity), false);
    });
  });
});

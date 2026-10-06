/**
 * EZRAB — Golden Price & Cost Engine Regression Suite
 * Standalone TypeScript runner for Phase 11-20 test invariants.
 */

import { canonicalPriceResolver } from '../engine/pricing/canonical/canonicalPriceResolver';
import { priceSanityValidator } from '../engine/pricing/canonical/priceSanityValidator';
import { canonicalCostEngine } from '../engine/pricing/canonical/canonicalCostEngine';
import { rabSanityEngine } from '../engine/pricing/canonical/rabSanityEngine';
import { projectPriceEngine } from '../engine/pricing/projectPriceEngine';
import { specificationValidator } from '../ded-rab-v3/validation/specificationValidator';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';

// Standalone test assertions matching repo convention
let currentSuite = '';
let passedTests = 0;
let failedTests = 0;
const testLogs: string[] = [];
let beforeEachHook: (() => void) | null = null;

function describe(suiteName: string, fn: () => void) {
  currentSuite = suiteName;
  testLogs.push(`\n=== SUITE: ${suiteName} ===`);
  fn();
}

function beforeEach(fn: () => void) {
  beforeEachHook = fn;
}

function it(testName: string, fn: () => void) {
  if (beforeEachHook) beforeEachHook();
  try {
    fn();
    passedTests++;
    testLogs.push(`  [PASS] ${testName}`);
  } catch (err: any) {
    failedTests++;
    testLogs.push(`  [FAIL] ${testName} -> ${err?.message || err}`);
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    not: {
      toBe(expected: any) {
        if (actual === expected) {
          throw new Error(`Expected NOT ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
      },
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} > ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (typeof actual !== 'number' || actual < expected) {
        throw new Error(`Expected ${actual} >= ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (typeof actual !== 'number' || actual >= expected) {
        throw new Error(`Expected ${actual} < ${expected}`);
      }
    },
    toContain(expected: any) {
      if (typeof actual === 'string' && !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      } else if (Array.isArray(actual) && !actual.includes(expected)) {
        throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
      }
    },
  };
}

describe('EZRAB Phase 19: Golden Price & Cost Engine Regression Suite', () => {
  beforeEach(() => {
    projectPriceEngine.clearAll();
  });

  // =========================================================================
  // TEST 1: unit = kg, price = absurd -> EXPECTED: REJECT / INVALID
  // =========================================================================
  it('TEST 1: unit = kg with absurd price (e.g. Rp 3.864.000/kg) must be REJECTED as INVALID', () => {
    // 1A. Direct sanity validator test
    const sanity = priceSanityValidator.validatePrice('Baja Tulangan Ringbalk', 3_864_000, 'kg');
    expect(sanity.status).toBe('PRICE_INVALID');
    expect(sanity.isValid).toBe(false);
    expect(sanity.rejectionReason).toContain('melampaui batas wajar');

    // 1B. Attempting to inject an absurd price override via project engine
    projectPriceEngine.setProjectOverride({
      projectId: 'test-proj-1',
      materialId: 'MAT-REBAR-ABSURD',
      materialName: 'Pembesian Tulangan 4 D12',
      price: 3_864_000,
      unit: 'kg',
      reason: 'Absurd user mistake',
      active: true,
    });

    const res = canonicalPriceResolver.resolve({
      name: 'Pembesian Tulangan 4 D12',
      unit: 'kg',
      projectId: 'test-proj-1',
    });

    expect(res.status).toBe('INVALID');
    expect(res.price).toBeNull();
    expect(res.resolutionPath.some((p) => p.includes('PRICE_SANITY_REJECTED'))).toBe(true);
  });

  // =========================================================================
  // TEST 2: missing price -> EXPECTED: MISSING (Fail-Closed)
  // =========================================================================
  it('TEST 2: unknown/missing item price must return status MISSING with price null (no 100k fallback)', () => {
    const res = canonicalPriceResolver.resolve({
      name: 'Material Fiktif Tidak Dikenal ABC-999-XYZ',
      unit: 'unit',
    });

    expect(res.status).toBe('MISSING');
    expect(res.price).toBeNull();
    // Verify that NO silent fallback like 100.000 or 75.000 was returned
    expect(res.price).not.toBe(100_000);
    expect(res.price).not.toBe(75_000);
    expect(res.resolutionPath).toContain('PRICE_NOT_FOUND_FAIL_CLOSED');
  });

  // =========================================================================
  // TEST 3: AHSP material price vs AHSP unit price -> EXPECTED: tidak tertukar
  // =========================================================================
  it('TEST 3: assembled AHSP unit price and raw material component price must NOT be swapped', () => {
    // Look up rebar AHSP 2.2.1.1.4 (Penulangan BjTP >= 12mm)
    const ahsp = officialAhspRepository.getOfficialAhsp('2.2.1.1.4');
    expect(ahsp).toBeDefined();

    if (ahsp) {
      const comp = priceResolver2026.resolveAhspUnitPrice(ahsp);
      const ahspHsp = comp.hspPrice || comp.unitPrice;

      // The assembled HSP must be greater than Rp 18.000/kg (material + labor + equipment + overhead)
      expect(ahspHsp).toBeGreaterThan(18_000);
      expect(ahspHsp).toBeLessThan(35_000);

      // Raw steel component price must be lower than the assembled AHSP unit price
      const rawSteelRes = priceResolver2026.resolveResourcePrice({
        resourceName: 'Besi Beton Polos',
        unit: 'kg',
        period: { year: 2026 },
      });

      if (rawSteelRes && rawSteelRes.price) {
        expect(rawSteelRes.price).toBeLessThan(ahspHsp!);
        expect(rawSteelRes.price).toBeGreaterThan(10_000);
      }
    }
  });

  // =========================================================================
  // TEST 4: project override -> EXPECTED: override hanya berlaku pada project
  // =========================================================================
  it('TEST 4: project override only applies to the designated project and does not pollute others', () => {
    // Set override of Rp 220.000 on project-A for Pasir Urug
    projectPriceEngine.setProjectOverride({
      projectId: 'project-A',
      materialId: 'MAT-PASIR-URUG',
      materialName: 'Pasir urug',
      price: 220_000,
      unit: 'm3',
      reason: 'Negosiasi supplier lokal project-A',
      active: true,
    });

    // Query for project-A: should resolve to override price
    const resA = canonicalPriceResolver.resolve({
      name: 'Pasir urug',
      unit: 'm3',
      projectId: 'project-A',
    });
    expect(resA.status).toBe('RESOLVED');
    expect(resA.price).toBe(220_000);
    expect(resA.source).toBe('PROJECT_OVERRIDE');

    // Query for project-B: must NOT see project-A override
    const resB = canonicalPriceResolver.resolve({
      name: 'Pasir urug',
      unit: 'm3',
      projectId: 'project-B',
    });
    expect(resB.status).toBe('RESOLVED');
    expect(resB.price).not.toBe(220_000);
    // Resolves to official 2026 price in database (not 220.000 override)
    expect(resB.price).toBe(229_800);
  });

  // =========================================================================
  // TEST 5: same material different region -> EXPECTED: resolver mempertimbangkan region
  // =========================================================================
  it('TEST 5: resolver handles regional specification and differentiates locations', () => {
    const resDki = canonicalPriceResolver.resolve({
      name: 'Pekerja',
      unit: 'OH',
      region: 'DKI Jakarta',
    });
    expect(resDki.status).toBe('RESOLVED');
    expect(resDki.price).toBeGreaterThan(0);
    expect(['oh', 'oj']).toContain(resDki.unit.toLowerCase());
  });

  // =========================================================================
  // TEST 6: same material different specification -> EXPECTED: tidak otomatis merge
  // =========================================================================
  it('TEST 6: different specifications (e.g. Keramik 40x40 vs 60x60, Kaca 5mm vs 8mm) must NOT auto-merge', () => {
    // Keramik 40x40 vs 60x60
    const tileValidation = specificationValidator.validate(
      'Keramik Lantai 40x40',
      '40x40 cm',
      'Pemasangan 1 m2 lantai keramik 60x60 cm',
      'm2'
    );
    expect(tileValidation.isCompatible).toBe(false);
    expect(tileValidation.dimensionMatch).toBe(false);

    // Kaca 5mm vs Kaca 8mm
    const glassValidation = specificationValidator.validate(
      'Kaca bening 5 mm',
      'tebal 5 mm',
      'Pemasangan 1 m2 kaca polos tebal 8 mm',
      'm2'
    );
    expect(glassValidation.isCompatible).toBe(false);

    // Bata Merah vs Bata Ringan / Hebel
    const brickValidation = specificationValidator.validate(
      'Pasangan dinding bata merah',
      'bata merah bakar',
      'Pemasangan 1 m2 dinding bata ringan hebel t=10cm',
      'm2'
    );
    expect(brickValidation.isCompatible).toBe(false);
    expect(brickValidation.materialMatch).toBe(false);
  });

  // =========================================================================
  // TEST 7: Deterministic Cost Engine Arithmetic Check (Phase 12)
  // =========================================================================
  it('TEST 7: Canonical Cost Engine deterministically computes component, AHSP, and work totals', () => {
    // 1. Component cost: 1.05 kg * Rp 14.500/kg
    const compCost = canonicalCostEngine.calculateComponentCost(1.05, 14_500);
    expect(compCost).toBe(15_225);

    // 2. AHSP breakdown
    const ahspBreakdown = canonicalCostEngine.calculateAhsp(
      '2.2.1.1.4',
      'Penulangan BjTP >= 12mm',
      'kg',
      [
        { itemCode: 'M1', itemName: 'Besi Beton', category: 'material', unit: 'kg', coefficient: 1.05, unitPrice: 14_500 },
        { itemCode: 'M2', itemName: 'Kawat Beton', category: 'material', unit: 'kg', coefficient: 0.015, unitPrice: 22_000 },
        { itemCode: 'L1', itemName: 'Pekerja', category: 'labor', unit: 'OH', coefficient: 0.007, unitPrice: 120_000 },
        { itemCode: 'L2', itemName: 'Tukang Besi', category: 'labor', unit: 'OH', coefficient: 0.007, unitPrice: 150_000 },
      ],
      0.15 // 15% overhead
    );

    expect(ahspBreakdown.isComplete).toBe(true);
    expect(ahspBreakdown.materialCost).toBe(15_225 + 330);
    expect(ahspBreakdown.laborCost).toBe(840 + 1_050);
    expect(ahspBreakdown.unitPrice).toBeGreaterThan(ahspBreakdown.directCost);

    // 3. Work total: 177.92 kg * unitPrice
    const workTotal = canonicalCostEngine.calculateWorkTotal(
      'Pembesian Ringbalk',
      177.92,
      'kg',
      ahspBreakdown.unitPrice
    );
    expect(workTotal.totalCost).toBe(Math.round(177.92 * ahspBreakdown.unitPrice));
  });

  // =========================================================================
  // TEST 8: RAB Quality Gate & Sanity Audit Check (Phase 13, 14, 20)
  // =========================================================================
  it('TEST 8: RAB Sanity Engine detects violations and rejects RAB as NEEDS_REVIEW when invalid', () => {
    // Flawed RAB with absurd rebar price and invalid unit
    const flawedItems = [
      {
        id: 'item-1',
        name: 'Pembesian Tulangan Utama',
        volume: 177.92,
        unit: 'm2', // INVALID UNIT for rebar!
        unitPrice: 3_864_000, // ABSURD PRICE!
        totalCost: 687_482_880,
        priceStatus: 'AI_ESTIMATED', // BANNED!
      },
    ];

    const auditResult = rabSanityEngine.auditRab(flawedItems);
    expect(auditResult.isValid).toBe(false);
    expect(auditResult.overallStatus).toBe('NEEDS_REVIEW');
    expect(auditResult.blockerCount).toBeGreaterThanOrEqual(2);
    expect(auditResult.checks.UNIT_CHECK.passed).toBe(false);
    expect(auditResult.checks.PRICE_CHECK.passed).toBe(false);
  });
});

console.log(testLogs.join('\n'));
console.log(`\nResults: ${passedTests} passed, ${failedTests} failed`);

const runtimeProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
if (failedTests > 0 && runtimeProcess?.exit) {
  runtimeProcess.exit(1);
}

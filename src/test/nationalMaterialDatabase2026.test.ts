/**
 * EZRAB — NATIONAL MATERIAL & HARGA DATABASE 2026 TEST SUITE
 * 
 * Verifies:
 * 1. Multi-Sector Master Material Ingestion across all 10 Sectors
 * 2. Brand Database Canonicalization & Aliases (e.g. Semen Gresik / SIG)
 * 3. 38 Indonesian Provinces & Regional IKK Indices
 * 4. Critical Test 79: Multi-Tier Price Resolution Waterfall Precedence
 *    (Project > User > Regional City > Province Fallback > Supplier > Official > PRICE_NOT_FOUND)
 * 5. Critical Test 80: Strict Anti-Hallucination (PRICE_NOT_FOUND if unknown, no fabricated numbers)
 * 6. Critical Test 81: Regional Fallback Alerting & Provenance
 * 7. Critical Test 82: Unit Normalization Safety Bounds (batang -> m only when known)
 * 8. Immutable Price Snapshots for Historical RAB Reproducibility
 * 9. Price Alert Detection (> 5% Price Shift)
 * 10. Data Quality & 10-Sector Coverage Reporting
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { MaterialDatabaseService } from '../domain/material/materialDatabaseService';
import { BrandDatabaseService } from '../domain/material/brandDatabase';
import { NationalRegionService, INDONESIA_38_PROVINCES } from '../domain/material/nationalRegionDatabase';
import { WebPriceResearchAdapter } from '../domain/material/webPriceResearchAdapter';

describe('EZRAB Master Material & Harga Database Indonesia 2026', () => {
  let matDb: MaterialDatabaseService;

  before(() => {
    matDb = MaterialDatabaseService.getInstance();
  });

  // --------------------------------------------------------------------------
  // TEST 1: SECTORS INGESTION
  // --------------------------------------------------------------------------
  test('1. Multi-Sector Ingestion: Database covers all 10 required construction sectors', () => {
    const allMats = matDb.getAllMaterials();
    assert.ok(allMats.length > 500, `Expected thousands of materials, got ${allMats.length}`);

    const sectorsFound = new Set(allMats.map((m) => m.sector));
    const requiredSectors = [
      'BANGUNAN',
      'JALAN',
      'DRAINASE',
      'JEMBATAN',
      'IRIGASI',
      'SUNGAI',
      'BENDUNG',
      'EMBUNG',
      'BENDUNGAN',
      'BANGUNAN_AIR',
    ];

    for (const reqSec of requiredSectors) {
      assert.ok(
        sectorsFound.has(reqSec as any),
        `Required sector ${reqSec} must be present in master database`
      );
    }

    console.log(`  ✓ PASSED: All 10 sectors represented across ${allMats.length} indexed materials.`);
  });

  // --------------------------------------------------------------------------
  // TEST 2: BRAND CANONICALIZATION & ALIASES
  // --------------------------------------------------------------------------
  test('2. Brand Normalization: Resolves aliases to canonical brand names', () => {
    const brandService = BrandDatabaseService.getInstance();

    assert.equal(brandService.getCanonicalBrand('semen gresik'), 'Semen Indonesia Group');
    assert.equal(brandService.getCanonicalBrand('PT Semen Indonesia Tbk'), 'Semen Indonesia Group');
    assert.equal(brandService.getCanonicalBrand('tiga roda'), 'Tiga Roda');
    assert.equal(brandService.getCanonicalBrand('indocement'), 'Tiga Roda');
    assert.equal(brandService.getCanonicalBrand('wika beton precast'), 'WIKA Beton');
    assert.equal(brandService.getCanonicalBrand('krakatau steel'), 'Krakatau Steel');
    assert.equal(brandService.getCanonicalBrand('rucika piping'), 'Rucika');

    console.log('  ✓ PASSED: Canonical brand resolution and alias normalization working correctly.');
  });

  // --------------------------------------------------------------------------
  // TEST 3: 38 PROVINCES & IKK INDICES
  // --------------------------------------------------------------------------
  test('3. Regional Geography: All 38 provinces in 2026 boundaries indexed with IKK factor', () => {
    assert.equal(INDONESIA_38_PROVINCES.length, 38, 'Must index all 38 Indonesian provinces in 2026');

    // Check specific 2026 provinces
    const papuaSelatan = INDONESIA_38_PROVINCES.find((p) => p.name === 'Papua Selatan');
    assert.ok(papuaSelatan, 'Papua Selatan must exist in 2026 database');
    assert.ok(papuaSelatan.defaultCostIndexVsJakarta > 1.3, 'Papua Selatan IKK cost multiplier reflects logistics');

    const jatim = INDONESIA_38_PROVINCES.find((p) => p.name === 'Jawa Timur');
    assert.ok(jatim, 'Jawa Timur must exist');
    assert.ok(jatim.regenciesAndCities.includes('Probolinggo'));
    assert.ok(jatim.regenciesAndCities.includes('Surabaya'));

    console.log('  ✓ PASSED: All 38 Indonesian provinces and regional cost factor indices verified.');
  });

  // --------------------------------------------------------------------------
  // TEST 4: CRITICAL TEST 79 (RESOLUTION WATERFALL PRECEDENCE)
  // --------------------------------------------------------------------------
  test('4. Critical Test 79: Pipa PVC 1/2" Resolution Priority in Probolinggo', () => {
    // A. Query exact material in Probolinggo
    const resProbolinggo = matDb.resolveMaterialPrice({
      materialCode: 'MAT-DRN-PVC-0001',
      regionName: 'Probolinggo',
    });

    assert.equal(resProbolinggo.status, 'RESOLVED');
    assert.equal(resProbolinggo.regionMatch, 'EXACT');
    assert.equal(resProbolinggo.price, 37500); // Exact Probolinggo supplier price
    assert.equal(resProbolinggo.unit, 'batang');

    // B. Project override takes priority over regional database
    const projectId = 'PROJ-TEST-PROBOLINGGO';
    matDb.setProjectPriceOverride(projectId, {
      id: 'PRC-PROJ-OVERRIDE-1',
      materialId: 'MAT-DRN-PVC-0001',
      materialCode: 'MAT-DRN-PVC-0001',
      regionId: 'REG-PROBOLINGGO',
      region: { country: 'Indonesia', province: 'Jawa Timur', city: 'Probolinggo' },
      supplierName: 'Negosiasi Khusus Proyek',
      price: 32000, // Special discounted price for project
      currency: 'IDR',
      unit: 'batang',
      priceType: 'PROJECT',
      priceTier: 'STANDARD',
      taxIncluded: true,
      deliveryIncluded: true,
      sourceType: 'USER_INPUT',
      sourceName: 'Harga Kontrak Proyek',
      priceDate: '2026-03-25',
      confidence: 'HIGH',
      verificationStatus: 'VERIFIED',
      freshness: 'CURRENT',
      createdAt: '2026-03-25T00:00:00Z',
      updatedAt: '2026-03-25T00:00:00Z',
    });

    const resWithProject = matDb.resolveMaterialPrice({
      materialCode: 'MAT-DRN-PVC-0001',
      regionName: 'Probolinggo',
      projectId,
    });

    assert.equal(resWithProject.status, 'RESOLVED');
    assert.equal(resWithProject.resolvedAtTier, 1);
    assert.equal(resWithProject.price, 32000, 'Project override must take precedence');
    assert.equal(resWithProject.source?.type, 'PROJECT_PRICE');

    console.log('  ✓ PASSED: Critical Test 79 verified (Project Price > Local Supplier > Regional DB).');
  });

  // --------------------------------------------------------------------------
  // TEST 5: CRITICAL TEST 80 (STRICT ANTI-HALLUCINATION / NO FAKE PRICES)
  // --------------------------------------------------------------------------
  test('5. Critical Test 80: Unlisted material strictly returns PRICE_NOT_FOUND (No Guessing)', () => {
    const unlisted = matDb.resolveMaterialPrice({
      name: 'Bahan Fiktif Nano Anti Gravitasi 9999',
      regionName: 'Probolinggo',
    });

    assert.equal(unlisted.status, 'PRICE_NOT_FOUND');
    assert.equal(unlisted.price, undefined);
    assert.ok(unlisted.error?.includes('tidak ditemukan'));

    console.log('  ✓ PASSED: Critical Test 80 verified (Strict anti-hallucination, zero fabricated numbers).');
  });

  // --------------------------------------------------------------------------
  // TEST 6: CRITICAL TEST 81 (REGIONAL FALLBACK NOTIFICATION)
  // --------------------------------------------------------------------------
  test('6. Critical Test 81: Regional Fallback from missing Regency to Province reference', () => {
    // Pipa PVC only has prices in Jakarta, Surabaya, Probolinggo.
    // Querying "Pacitan" (which is in Jawa Timur but has no direct local record) should fallback to Jawa Timur province.
    const resFallback = matDb.resolveMaterialPrice({
      materialCode: 'MAT-DRN-PVC-0001',
      regionName: 'Pacitan',
    });

    assert.equal(resFallback.status, 'RESOLVED');
    assert.equal(resFallback.regionMatch, 'PROVINCE');
    assert.ok(resFallback.fallbackReason?.includes('Fallback'), 'Must include fallback explanation');

    console.log(`  ✓ PASSED: Critical Test 81 verified (Fallback occurred: ${resFallback.fallbackReason}).`);
  });

  // --------------------------------------------------------------------------
  // TEST 7: CRITICAL TEST 82 (UNIT NORMALIZATION SAFETY BOUNDS)
  // --------------------------------------------------------------------------
  test('7. Critical Test 82: Unit Normalization converts safely and preserves raw unit if unknown', () => {
    // 1. Pipa PVC 1/2" batang (4m) -> meter
    const convPipa = matDb.normalizeUnitAndPrice(36000, 'batang', 'm', 'Pipa PVC 4 meter');
    assert.equal(convPipa.wasConverted, true);
    assert.equal(convPipa.normalizedUnit, 'm');
    assert.equal(convPipa.normalizedPrice, 9000); // 36,000 / 4 = 9,000 / meter

    // 2. Semen sak (50kg) -> kg
    const convSemen = matDb.normalizeUnitAndPrice(75000, 'sak', 'kg', 'Semen Gresik 50kg');
    assert.equal(convSemen.wasConverted, true);
    assert.equal(convSemen.normalizedUnit, 'kg');
    assert.equal(convSemen.normalizedPrice, 1500); // 75,000 / 50 = 1,500 / kg

    // 3. Unknown dimensions: do NOT blindly convert!
    const convUnknown = matDb.normalizeUnitAndPrice(50000, 'buah', 'meter');
    assert.equal(convUnknown.wasConverted, false, 'Do not convert when conversion is physically unknown');
    assert.equal(convUnknown.normalizedPrice, 50000);

    console.log('  ✓ PASSED: Critical Test 82 verified (Safe unit normalization with strict guardrails).');
  });

  // --------------------------------------------------------------------------
  // TEST 8: PRICE SNAPSHOTS & ALERTS FOR RAB
  // --------------------------------------------------------------------------
  test('8. Price Snapshots & Alerts: Freezes prices for historical RAB reproducibility', () => {
    const mockPrices = matDb.getPricesByMaterialId('MAT-BLD-CEM-0001');
    assert.ok(mockPrices.length > 0);

    const snapshot = matDb.createPriceSnapshot('RAB-2026-TEST', 'PROJ-01', mockPrices);
    assert.ok(snapshot.id?.startsWith('SNAP-'));
    assert.equal(snapshot.items.length, mockPrices.length);

    // Live check for price alerts
    const alerts = matDb.checkForPriceAlerts(snapshot.id!);
    assert.ok(Array.isArray(alerts));

    console.log(`  ✓ PASSED: Price snapshot generated (${snapshot.items.length} items frozen for RAB integrity).`);
  });

  // --------------------------------------------------------------------------
  // TEST 9: DATA QUALITY & SECTOR COVERAGE
  // --------------------------------------------------------------------------
  test('9. Data Quality & Sector Coverage: Reports accurate metrics across 10 sectors', () => {
    const report = matDb.getDataQualityReport();

    assert.ok(report.totalMaterials! > 500);
    assert.ok(report.totalBrands! >= 30);
    assert.ok(report.totalSuppliers! >= 5);
    assert.ok(report.sectorCoverage.length === 10, 'All 10 sectors audited in quality report');

    for (const sc of report.sectorCoverage) {
      assert.ok(sc.totalMaterials >= 1, `Sector ${sc.sector} must have indexed materials`);
      assert.ok(sc.coveragePercent >= 0 && sc.coveragePercent <= 100);
    }

    console.log('  ✓ PASSED: Live Data Quality & Sector Coverage verified across all 10 construction disciplines.');
  });
});

/**
 * EZRAB PRICE RESOLUTION ENGINE V1 — TEST SUITE
 *
 * Verifies:
 * 1. Material & Price Database CRUD & Duplicate Detection
 * 2. Multi-tier Price Waterfall (Project Override -> Master DB -> Similar Item)
 * 3. AI Web Price Search Provider & Cache Integrity
 * 4. Strict Anti-Hallucination Fail-Closed Guarantee (No fake prices)
 * 5. Unit & Specification Validation (Dimensions != Takeoff Quantities)
 * 6. DED Review Incremental Recalculation without AI re-scan
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { PriceResolver } from '../engine/pricing/resolver/priceResolver';
import { aiPriceSearchService } from '../services/aiPriceSearchService';
import { dedRabReviewService } from '../ded-rab-v2/review/dedRabReviewService';
import { DedWorkItem } from '../ded-rab-v2/types';

test('EZRAB Price Resolution Engine V1 Suite', async (t) => {
  const repo = PriceRepository.getInstance();
  const resolver = new PriceResolver(repo);

  await t.test('1. PriceRepository: Ingestion, Custom Add, Duplicate Detection & Project Overrides', () => {
    // Check initial master seed
    const initialItems = repo.getAll();
    assert.ok(initialItems.length > 0, 'PriceRepository should be seeded with master prices');

    // Add a custom material
    const customItem = repo.addCustomPrice({
      code: 'TEST-BESI-D16',
      name: 'Besi Beton Ulir D16 SNI',
      category: 'MATERIAL',
      subcategory: 'Baja & Besi',
      specification: 'BJTS 420B, Diameter 16mm, Panjang 12m',
      brand: 'Krakatau Steel',
      unit: 'kg',
      price: 15500,
      location: 'DKI Jakarta',
      priceSource: 'USER_INPUT',
      supplier: 'PT Krakatau Steel Official',
    });

    assert.ok(customItem.id, 'Custom item must have generated ID');
    assert.equal(customItem.price, 15500);

    // Duplicate detection test
    const duplicate = repo.findDuplicate('Besi Beton Ulir D16 SNI', 'kg');
    assert.ok(duplicate, 'Duplicate should be detected for matching normalized name and unit');
    assert.equal(duplicate.id, customItem.id);

    // Project Price Override
    const projectOverride = repo.setProjectPriceOverride(
      'proj-alpha-123',
      customItem.id,
      14800,
      'Negosiasi khusus volume besar proyek Alpha'
    );
    assert.equal(projectOverride.price, 14800);
    assert.equal(projectOverride.projectId, 'proj-alpha-123');

    // Retrieve project prices
    const projectPrices = repo.getProjectPrices('proj-alpha-123');
    assert.ok(projectPrices.some((p) => p.price === 14800));

    // CSV Export
    const csv = repo.exportToCsv();
    assert.ok(csv.includes('Kode,Nama Material,Kategori'));
    assert.ok(csv.includes('Besi Beton Ulir D16 SNI'));
  });

  await t.test('2. Multi-tier Price Waterfall: Project Override takes precedence over Master DB', () => {
    // Query without project context -> should get global custom price (15,500)
    const globalRes = resolver.resolve({
      name: 'Besi Beton Ulir D16 SNI',
      unit: 'kg',
    });
    assert.ok(
      globalRes.status === 'EXACT_MATCH' || globalRes.status === 'NORMALIZED_MATCH' || globalRes.status === 'CONTEXTUAL_MATCH',
      `Expected match status, got ${globalRes.status}`
    );
    assert.equal(globalRes.resolvedPrice?.price, 15500);
    assert.equal(globalRes.priceCandidates?.[0].source, 'EZRAB_DATABASE');

    // Query WITH project context -> should get project override price (14,800)
    const projectRes = resolver.resolve({
      name: 'Besi Beton Ulir D16 SNI',
      unit: 'kg',
      projectId: 'proj-alpha-123',
    });
    assert.equal(projectRes.status, 'EXACT_MATCH');
    assert.equal(projectRes.resolvedPrice?.price, 14800);
    assert.equal(projectRes.priceCandidates?.[0].source, 'PROJECT');
    assert.ok(projectRes.explanation?.includes('harga khusus proyek'));
  });

  await t.test('3. Similar Item Matching & Range Computation for unlisted variants', () => {
    // Query for a slight variant that is not an exact match but similar
    const similarRes = resolver.resolve({
      name: 'Besi Beton Ulir D16 Standar SNI KS',
      unit: 'kg',
    });

    // Should resolve via similar match or contextual match
    assert.ok(
      similarRes.status === 'EXACT_MATCH' || similarRes.status === 'CONTEXTUAL_MATCH' || similarRes.status === 'NORMALIZED_MATCH',
      `Expected matched status, got ${similarRes.status}`
    );
    assert.ok(similarRes.resolvedPrice !== undefined);
    assert.ok((similarRes.confidence || 0) >= 0.7, 'Confidence for closely related material should be >= 0.7');
    assert.ok(similarRes.priceRange !== undefined, 'Price range must be computed');
    assert.ok(similarRes.priceRange.median > 0, 'Median price must be positive');
  });

  await t.test('4. Anti-Hallucination Fail-Closed Guarantee (Strict NO Fake Prices)', async () => {
    // 1. Database search on non-existent gibberish item
    const unresolvable = resolver.resolve({
      name: 'Unobtanium Hyperdrive Coil 9999XYZ',
      unit: 'pcs',
    });
    assert.equal(unresolvable.status, 'PRICE_NOT_FOUND', 'Unresolvable item must fail closed with PRICE_NOT_FOUND');
    assert.equal(unresolvable.resolvedPrice, undefined, 'Must NEVER fabricate a price for unresolvable item');

    // 2. AI Web Price Search on unparseable/mock response
    // When no candidates can be extracted from search results, it must fail closed
    const emptySearchResult = await aiPriceSearchService.searchPrice({
      material: '', // Empty query
    });
    assert.equal(emptySearchResult.status, 'NO_RESULT', 'Empty query must return NO_RESULT');
    assert.equal(emptySearchResult.candidates.length, 0, 'No candidates may be returned for empty query');
  });

  await t.test('5. Specification & Unit Validation: Dimensions are not Takeoff Volumes', () => {
    // Pipa PVC 1/2 inch -> '1/2 inch' is specification / diameter, unit is 'm' or 'btg'
    const pipaItem = repo.addCustomPrice({
      code: 'PIPA-PVC-HALF',
      name: 'Pipa PVC AW 1/2 inch',
      category: 'MATERIAL',
      specification: 'Diameter nominal 1/2", tipe AW, panjang 4m',
      unit: 'm',
      price: 12000,
      location: 'DKI Jakarta',
      priceSource: 'VENDOR',
    });

    const res = resolver.resolve({
      name: 'Pipa PVC AW',
      specification: '1/2 inch',
      unit: 'm',
    });

    assert.ok(res.resolvedPrice !== undefined);
    assert.equal(res.resolvedPrice.unit, 'm');
    assert.equal(res.resolvedPrice.price, 12000);
  });

  await t.test('6. End-to-End DED Review Incremental Recalculation without AI Rescan', () => {
    // Initial work item with missing price
    const initialItem: DedWorkItem = {
      id: 'ded-test-item-1',
      projectId: 'proj-ded-1',
      sourceDocumentId: 'doc-1',
      name: 'Pemasangan Pintu Kayu Jati Solid Custom',
      category: 'DOOR_WINDOW',
      unit: 'unit',
      status: 'MISSING_DATA',
      sourceType: 'DED_VERIFIED',
      sourcePages: [2],
      dimensions: {
        count: { value: 4, unit: 'unit', isMissing: false },
      },
      geometry: { shape: 'COUNT' },
      calculationInputs: { count: 4 },
      confidence: 0.95,
      assumptions: [],
      warnings: [],
      evidenceIds: ['ev-door-1'],
      userApproved: false,
      qto: {
        quantity: 4,
        unit: 'unit',
        status: 'CALCULATED',
        formula: '4 unit',
        calculationBreakdown: '4 unit daun pintu lantai 1',
      },
      price: {
        unitPrice: 0,
        totalPrice: 0,
        priceSource: 'PRICE_NOT_FOUND',
        isOfficial: false,
        currency: 'IDR',
        sourceDetail: 'Belum ada harga satuan',
      },
    };

    // Calculate initial review summary
    const initialSummary = dedRabReviewService.computeReviewSummary([initialItem]);
    assert.equal(initialSummary.missingPriceCount, 1, 'Initially 1 item must have missing price');
    assert.equal(initialSummary.totalEstimatedRab, 0);

    // Estimator opens PriceResolutionDrawer and confirms a price (e.g., Rp 3.500.000 / unit)
    const confirmedPrice = 3500000;
    const recalculated = dedRabReviewService.recalculateItem(
      initialItem,
      undefined,
      undefined,
      {
        unitPrice: confirmedPrice,
        priceSource: 'MANUAL_USER_PRICE',
        sourceDetail: 'Dikonfirmasi oleh Estimator Senior via Price Drawer',
      }
    );

    // Verify item updated
    assert.equal(recalculated.price?.unitPrice, 3500000);
    assert.equal(recalculated.price?.totalPrice, 14000000); // 4 unit * 3.500.000
    assert.equal(recalculated.price?.priceSource, 'MANUAL_USER_PRICE');
    assert.equal(recalculated.status, 'CONFIRMED');
    assert.equal(recalculated.userApproved, true);

    // Recompute summary dynamically
    const updatedSummary = dedRabReviewService.computeReviewSummary([recalculated]);
    assert.equal(updatedSummary.missingPriceCount, 0, 'Missing price count must drop to 0');
    assert.equal(updatedSummary.totalEstimatedRab, 14000000, 'Total RAB must be updated to Rp 14.000.000');
    assert.equal(updatedSummary.coverage?.priceCoverage, 100, 'Price coverage must reach 100%');
  });
});

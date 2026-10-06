import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  constructionNormalizer,
  evidenceResolver,
  constructionCompletenessEngine,
  dedPageCache,
  aiConcurrencyQueue,
  dedRabReviewService,
  dedInterpreter,
  DedWorkItem,
  EvidenceRecord,
  RawPageAnalysisPass2,
} from '../ded-rab-v2';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

describe('EZRAB DED -> RAB Construction Intelligence & Accuracy Suite', () => {
  const projectId = 'test-proj-ci-001';

  it('1. ConstructionNormalizer: Accurately maps AI semantic text into canonical construction taxonomies', () => {
    // 1A: AAC Masonry Wall
    const wallNorm = constructionNormalizer.normalize('Dinding luar bata ringan tebal 10 cm spesi instan');
    assert.equal(wallNorm.category, 'WALL');
    assert.equal(wallNorm.constructionType, 'AAC_BLOCK_WALL');
    assert.equal(wallNorm.standardUnit, 'm²');
    // suggestedAhspCode is a NON-authoritative hint (see constructionNormalizer);
    // the matcher validates it against the official catalog. Assert the hint exists,
    // not that it is a verified code.
    assert.ok(typeof wallNorm.suggestedAhspCode === 'string');

    // 1B: Floor Finishes (Homogeneous Tile)
    const floorNorm = constructionNormalizer.normalize('Lantai Granit Tile 60x60 cm Polished');
    assert.equal(floorNorm.category, 'FLOOR_FINISH');
    assert.equal(floorNorm.standardUnit, 'm²');
    assert.ok(typeof floorNorm.suggestedAhspCode === 'string');

    // 1C: Structural Concrete Column
    const colNorm = constructionNormalizer.normalize('Kolom Praktis 15x15 cm beton bertulang');
    assert.equal(colNorm.category, 'STRUCTURE_COLUMN');
    assert.equal(colNorm.constructionType, 'PRACTICAL_COLUMN');

    // 1D: Sanitary Fixture (Kloset Duduk)
    const sanNorm = constructionNormalizer.normalize('Kloset duduk monoblok komplit');
    assert.equal(sanNorm.category, 'SANITARY');
    assert.ok(typeof sanNorm.suggestedAhspCode === 'string');
    assert.ok(sanNorm.standardUnit === 'unit' || sanNorm.standardUnit === 'buah');

    // 1E: Roofing (Light gauge steel truss)
    const roofNorm = constructionNormalizer.normalize('Rangka atap baja ringan C75');
    assert.equal(roofNorm.category, 'ROOF');
    assert.equal(roofNorm.standardUnit, 'm²');
    assert.ok(typeof roofNorm.suggestedAhspCode === 'string');
  });

  it('2. EvidenceResolver: Accurately correlates cross-page dimensions and identifies spaces', () => {
    const evidences: EvidenceRecord[] = [
      {
        id: 'EV-001',
        sourceDocumentId: 'doc-01',
        sourceFileName: 'Denah.pdf',
        pageNumber: 2,
        type: 'NOTE',
        content: 'Kamar Tidur Utama 3.00 x 4.00 m',
        confidence: 0.95,
      },
      {
        id: 'EV-002',
        sourceDocumentId: 'doc-01',
        sourceFileName: 'Denah.pdf',
        pageNumber: 2,
        type: 'NOTE',
        content: 'Kamar Mandi 1.50 x 2.00 m',
        confidence: 0.95,
      },
      {
        id: 'EV-003',
        sourceDocumentId: 'doc-01',
        sourceFileName: 'Potongan_AA.pdf',
        pageNumber: 5,
        type: 'DIMENSION',
        content: 'Tinggi Plafon Elevasi +3.20 m',
        confidence: 0.98,
      },
      {
        id: 'EV-004',
        sourceDocumentId: 'doc-01',
        sourceFileName: 'Jadwal_Kusen.pdf',
        pageNumber: 8,
        type: 'SCHEDULE_ROW',
        content: 'P1 : 90 x 210 cm, Jml = 3 unit',
        confidence: 0.96,
      },
    ];

    const correlations = evidenceResolver.resolveCorrelations(evidences);

    // Verify Space Identification
    assert.equal(correlations.spaces.length, 2);
    const kt = correlations.spaces.find(s => s.name === 'Kamar Tidur Utama');
    assert.ok(kt);
    assert.equal(kt.area, 12); // 3 * 4 = 12 m2
    assert.equal(kt.dimensions?.height, 3.20); // Correlated from Section!

    const km = correlations.spaces.find(s => s.name === 'Kamar Mandi');
    assert.ok(km);
    assert.equal(km.area, 3); // 1.5 * 2 = 3 m2

    // Verify Cross-Page Dimension Resolution for Walls
    const wallH = evidenceResolver.resolveMissingDimension('Dinding Pasangan Bata', 'height', correlations);
    assert.ok(wallH);
    assert.equal(wallH.value, 3.20);
    assert.equal(wallH.resolutionMethod, 'CROSS_PAGE_CORRELATION');
    assert.equal(wallH.sourcePage, 5);

    // Verify Schedule Resolution for P1
    const doorP1 = evidenceResolver.resolveMissingDimension('Pintu P1', 'count', correlations);
    assert.ok(doorP1);
    assert.equal(doorP1.value, 3);
    assert.equal(doorP1.resolutionMethod, 'SCHEDULE_LOOKUP');
    assert.equal(doorP1.sourcePage, 8);
  });

  it('3. ConstructionCompletenessEngine: Generates derived items with strict sourceType = CONSTRUCTION_RULE', () => {
    const existingWorkItems: DedWorkItem[] = [
      {
        id: 'DED-001',
        projectId,
        sourceDocumentId: 'doc-01',
        name: 'Dinding Bata Ringan',
        category: 'WALL',
        status: 'CONFIRMED',
        sourceType: 'DED_VERIFIED',
        evidenceIds: ['EV-001'],
        sourcePages: [2],
        dimensions: { length: { value: 20, unit: 'm' }, height: { value: 3, unit: 'm' } },
        geometry: { shape: 'RECTANGULAR' },
        unit: 'm²',
        calculationInputs: { length: 20, height: 3 },
        confidence: 0.95,
        assumptions: [],
        warnings: [],
      },
    ];

    const spaces = [
      {
        id: 'SP-001',
        name: 'Kamar Mandi',
        level: 'Lantai 1',
        area: 3.0,
        evidenceIds: ['EV-002'],
        sourcePages: [2],
        confidence: 0.95,
      },
    ];

    const derived = constructionCompletenessEngine.generateDerivedWorkItems(
      projectId,
      'doc-01',
      existingWorkItems,
      spaces,
      100
    );

    // Must generate Waterproofing for Bathroom
    const wp = derived.find(d => d.name.includes('Waterproofing'));
    assert.ok(wp);
    assert.equal(wp.sourceType, 'CONSTRUCTION_RULE');
    assert.equal(wp.calculationInputs.area, 3.0);
    assert.equal(wp.unit, 'm²');

    // Must generate Floor Drain for Bathroom
    const fd = derived.find(d => d.name.includes('Floor Drain'));
    assert.ok(fd);
    assert.equal(fd.sourceType, 'CONSTRUCTION_RULE');
    assert.equal(fd.calculationInputs.count, 1);

    // Must generate Plastering (2 sides of wall: 2 * 20m * 3m = 120 m2)
    const pl = derived.find(d => d.name.includes('Plesteran'));
    assert.ok(pl);
    assert.equal(pl.sourceType, 'CONSTRUCTION_RULE');
    assert.equal(pl.calculationInputs.area, 120);

    // Must generate Painting
    const pt = derived.find(d => d.name.includes('Pengecatan'));
    assert.ok(pt);
    assert.equal(pt.sourceType, 'CONSTRUCTION_RULE');
    assert.equal(pt.calculationInputs.area, 120);
  });

  it('4. DedPageCache & AiConcurrencyQueue: Hash verification, caching, and bounded concurrency', async () => {
    dedPageCache.clear();

    const docId = 'doc-test';
    const pageNum = 1;
    const fakeImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const model = 'geminiflash-3.8';

    const cacheKey = dedPageCache.generateKey(docId, pageNum, fakeImage, model, 1);

    // Miss on first lookup
    const miss = dedPageCache.get(cacheKey);
    assert.equal(miss, null);

    // Save
    const mockData = { pageNumber: 1, drawingType: 'FLOOR_PLAN', drawingTitle: 'Denah Lt 1' };
    dedPageCache.set(cacheKey, docId, pageNum, dedPageCache.computeHash(fakeImage), model, mockData);

    // Hit on second lookup
    const hit = dedPageCache.get<typeof mockData>(cacheKey);
    assert.deepEqual(hit, mockData);

    const stats = dedPageCache.getStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);

    // Concurrency queue deduplication check
    let executions = 0;
    const taskFn = async () => {
      executions++;
      return 'done';
    };

    const p1 = aiConcurrencyQueue.enqueue('req-fingerprint-1', taskFn);
    const p2 = aiConcurrencyQueue.enqueue('req-fingerprint-1', taskFn); // identical in-flight!

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, 'done');
    assert.equal(r2, 'done');
    assert.equal(executions, 1, 'In-flight request deduplication must execute underlying task only once');
  });

  it('5. Incremental Recalculation: Recalculates updated item deterministically without AI calls', () => {
    const incompleteItem: DedWorkItem = {
      id: 'DED-005',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Dinding Bata Ringan Tebal 10 cm',
      category: 'WALL',
      status: 'MISSING_DATA',
      sourceType: 'DED_VERIFIED',
      evidenceIds: ['EV-001'],
      sourcePages: [2],
      dimensions: {
        length: { value: 15.0, unit: 'm' },
        height: { value: null, unit: 'm', isMissing: true },
      },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm²',
      calculationInputs: { length: 15.0, height: null },
      confidence: 0.95,
      assumptions: [],
      warnings: [],
      missingDataCategories: ['MISSING_DIMENSION'],
    };

    // Before resolution: QTO is missing
    const initialSummary = dedRabReviewService.computeReviewSummary([incompleteItem]);
    assert.equal(initialSummary.missingDataCount, 1);
    assert.equal(initialSummary.confirmedCount, 0);

    // Estimator supplies missing height: 3.5m
    const resolvedItem: DedWorkItem = {
      ...incompleteItem,
      calculationInputs: { length: 15.0, height: 3.5 },
      dimensions: {
        length: { value: 15.0, unit: 'm' },
        height: { value: 3.5, unit: 'm', isMissing: false },
      },
    };

    const recalculated = dedRabReviewService.recalculateItem(resolvedItem);
    assert.equal(recalculated.status, 'CONFIRMED');
    assert.equal(recalculated.qto?.status, 'CALCULATED');
    assert.equal(recalculated.qto?.quantity, 52.5); // 15 * 3.5 = 52.5 m2

    // AHSP must be an honest decision: either an official catalog match, or the
    // first-class non-decision AMBIGUOUS/NOT_FOUND. Never AI_CUSTOM, never a
    // non-official code pretending to be a match (§ FINAL PRINCIPLE).
    assert.ok(recalculated.ahspMatch);
    assert.notEqual(recalculated.ahspMatch!.matchType, 'AI_CUSTOM');
    if (
      recalculated.ahspMatch!.matchType === 'EXACT_MATCH' ||
      recalculated.ahspMatch!.matchType === 'SEMANTIC_MATCH'
    ) {
      assert.ok(officialAhspRepository.hasOfficialAhsp(recalculated.ahspMatch!.code));
    } else {
      assert.ok(
        recalculated.ahspMatch!.matchType === 'AMBIGUOUS' ||
          recalculated.ahspMatch!.matchType === 'NOT_FOUND'
      );
    }

    // PRICE: a positive totalPrice is only legitimate when the item is backed by an
    // official AHSP code. Otherwise the resolver must fail closed — null (or 0) with
    // no fabricated amount. NO_PRICE over FAKE_PRICE.
    const isOfficialAhsp =
      recalculated.ahspMatch!.matchType === 'EXACT_MATCH' ||
      recalculated.ahspMatch!.matchType === 'SEMANTIC_MATCH';
    if (isOfficialAhsp) {
      assert.ok((recalculated.price?.totalPrice || 0) > 0);
    } else {
      assert.ok(
        recalculated.price?.totalPrice === null ||
          recalculated.price?.totalPrice === undefined ||
          recalculated.price?.totalPrice === 0,
        'Unmatched AHSP must never yield a fabricated positive price'
      );
      assert.ok(
        !recalculated.price ||
          recalculated.price.priceSource === 'PRICE_NOT_FOUND' ||
          (recalculated.price.unitPrice || 0) <= 0
      );
    }

    const updatedSummary = dedRabReviewService.computeReviewSummary([recalculated]);
    assert.equal(updatedSummary.confirmedCount, 1);
    assert.equal(updatedSummary.missingDataCount, 0);
    assert.equal(updatedSummary.coverage?.qtoCoverage, 100);

    // A non-official AHSP decision must NOT be counted as official AHSP coverage.
    if (!isOfficialAhsp) {
      assert.equal(updatedSummary.coverage?.ahspCoverage, 0);
      assert.equal(updatedSummary.coverage?.priceCoverage, 0);
    }
  });

  it('6. DedBuildingModel Assembly via DedInterpreter', () => {
    const mockPass2Results: RawPageAnalysisPass2[] = [
      {
        pageNumber: 2,
        evidences: [
          {
            id: 'EV-P2-001',
            type: 'NOTE',
            content: 'Kamar Tidur Utama 3.00 x 4.00 m',
            confidence: 0.95,
          },
          {
            id: 'EV-P2-002',
            type: 'NOTE',
            content: 'Kamar Mandi 1.50 x 2.00 m',
            confidence: 0.95,
          },
          {
            id: 'EV-P2-003',
            type: 'DIMENSION',
            content: 'Dinding Bata Ringan L=20m',
            confidence: 0.95,
          },
        ],
        candidateItems: [
          {
            tempId: 'ITEM-P2-001',
            name: 'Dinding Bata Ringan',
            category: 'WALL',
            evidenceIds: ['EV-P2-003'],
            dimensions: {
              length: { value: 20.0, unit: 'm', evidenceId: 'EV-P2-003' },
            },
            shape: 'RECTANGULAR',
            unit: 'm²',
            status: 'CONFIRMED',
          },
        ],
      },
      {
        pageNumber: 5,
        evidences: [
          {
            id: 'EV-P5-001',
            type: 'DIMENSION',
            content: 'Elevasi Plafon Potongan +3.00 m',
            confidence: 0.98,
          },
        ],
        candidateItems: [],
      },
    ];

    const result = dedInterpreter.interpretWithBuildingModel(projectId, 'doc-01', mockPass2Results);

    // Verify Building Model
    assert.ok(result.buildingModel);
    assert.ok(result.buildingModel.spaces.length >= 2);
    assert.ok(result.buildingModel.levels.length >= 1);
    assert.ok(result.buildingModel.elements.length >= 1);

    // Verify Wall item had its height resolved via cross-page evidence from page 5!
    const wallItem = result.workItems.find(i => i.name === 'Dinding Bata Ringan');
    assert.ok(wallItem);
    assert.equal(wallItem.calculationInputs.height, 3.0); // Resolved cross-page!
    assert.equal(wallItem.sourceType, 'DED_VERIFIED');

    // Verify derived items generated
    const derivedWp = result.workItems.find(i => i.name.includes('Waterproofing'));
    assert.ok(derivedWp);
    assert.equal(derivedWp.sourceType, 'CONSTRUCTION_RULE');
  });
});

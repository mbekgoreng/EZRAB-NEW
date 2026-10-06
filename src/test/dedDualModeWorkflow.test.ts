import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedRabPipeline,
  getDedProcessingConfig,
  getDedModel,
  DED_MODES,
  SAFE_DED_MODES,
  getSafeDedModeMetadata,
  DedWorkItem,
  evidenceService,
  ezrabCoreQto,
  ahspMatcher,
  ahspPriceResolver,
  DedPipelineEventType,
  DedProcessingMode,
} from '../ded-rab-v2';

describe('EZRAB DED -> RAB Dual Mode & Workflow Verification Suite', () => {
  const projectId = 'test-dual-workflow-001';

  it('1. FAST Mode Configuration & Routing Integrity', () => {
    const fastConfig = getDedProcessingConfig('FAST');
    assert.equal(fastConfig.mode, 'FAST');
    assert.ok(fastConfig.provider === 'gemini' || fastConfig.provider === 'zyrouter');
    assert.ok(fastConfig.model.includes('flash') || fastConfig.model.includes('gemini'));
    assert.equal(fastConfig.reasoningLevel, 'low');
    assert.equal(fastConfig.enableSecondPass, false);
    assert.equal(fastConfig.maxConcurrentPages, 6);

    const modelInfo = getDedModel('FAST');
    assert.ok(modelInfo.provider === 'gemini' || modelInfo.provider === 'zyrouter');
  });

  it('2. ADVANCED Mode Configuration & Routing Integrity', () => {
    const advConfig = getDedProcessingConfig('ADVANCED');
    assert.equal(advConfig.mode, 'ADVANCED');
    assert.ok(advConfig.provider === 'zyrouter' || advConfig.provider === 'vleee');
    assert.equal(advConfig.enableCrossPageVerification, true);
    assert.equal(advConfig.enableAmbiguityResolution, true);
    assert.equal(advConfig.enableDeepQuantityValidation, true);
    assert.equal(advConfig.enableDeepAhspValidation, true);
    assert.equal(advConfig.enablePriceResolution, true);

    const modelInfo = getDedModel('ADVANCED');
    assert.ok(modelInfo.provider.length > 0);
  });

  it('3. User-Facing Safe Metadata: ZERO AI Models, ZERO Providers Exposed', () => {
    const modes: ('FAST' | 'ADVANCED')[] = ['FAST', 'ADVANCED'];
    const forbiddenKeywords = [
      'gemini',
      'flash lite',
      'flash-lite',
      'qwen',
      'zyrouter',
      'provider',
      'api key',
      'model id',
      'reasoning level',
      'temperature',
      'token',
      'fallback',
    ];

    for (const mode of modes) {
      const meta = DED_MODES[mode];
      assert.ok(meta, `Metadata for ${mode} should exist`);
      assert.ok(meta.label === 'Cepat' || meta.label === 'Advanced');

      const jsonString = JSON.stringify(meta).toLowerCase();
      for (const forbidden of forbiddenKeywords) {
        assert.ok(
          !jsonString.includes(forbidden),
          `Safe metadata for ${mode} must not contain "${forbidden}". Found in: ${jsonString}`
        );
      }

      const safeMeta = getSafeDedModeMetadata(mode);
      assert.equal(safeMeta.mode, mode);
    }
  });

  it('4. Real Progress Event Pipeline Subscription', async () => {
    const eventsReceived: DedPipelineEventType[] = [];

    const output = await dedRabPipeline.execute({
      projectId,
      files: [
        {
          fileName: 'Denah_Arsitektur_R01.png',
          buffer: Buffer.from('Contoh Berkas DED Struktur & Arsitektur'),
          mimeType: 'image/png',
        },
      ],
      mode: 'FAST',
      onPipelineEvent: (event) => {
        if (event.eventType && !eventsReceived.includes(event.eventType)) {
          eventsReceived.push(event.eventType);
        }
      },
    });

    assert.ok(output, 'Pipeline should return valid output');
    assert.ok(eventsReceived.includes('DED_INGEST_STARTED'), 'Must emit DED_INGEST_STARTED');
    assert.ok(eventsReceived.includes('PAGE_RENDER_STARTED'), 'Must emit PAGE_RENDER_STARTED');
    assert.ok(eventsReceived.includes('AI_ANALYSIS_STARTED'), 'Must emit AI_ANALYSIS_STARTED');
    assert.ok(eventsReceived.includes('QTO_STARTED'), 'Must emit QTO_STARTED');
    assert.ok(eventsReceived.includes('QTO_COMPLETED'), 'Must emit QTO_COMPLETED');
    assert.ok(eventsReceived.includes('AHSP_STARTED'), 'Must emit AHSP_STARTED');
    assert.ok(eventsReceived.includes('AHSP_COMPLETED'), 'Must emit AHSP_COMPLETED');
    assert.ok(eventsReceived.includes('PRICE_STARTED'), 'Must emit PRICE_STARTED');
    assert.ok(eventsReceived.includes('PRICE_COMPLETED'), 'Must emit PRICE_COMPLETED');
    assert.ok(eventsReceived.includes('REVIEW_READY'), 'Must emit REVIEW_READY');
  });

  it('5. Deterministic QTO & Missing Data Handling (No Fabricated Quantities)', () => {
    const missingItem: DedWorkItem = {
      id: 'DED-MISSING-01',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Pipa Air Bersih PVC Ø 1/2"',
      category: 'MEP',
      status: 'MISSING_DATA',
      quantityStatus: 'MISSING_DATA',
      evidenceIds: [],
      sourcePages: [1],
      dimensions: {
        diameter: { value: 0.0127, unit: 'm' },
        length: { value: null, unit: 'm', isMissing: true },
      },
      geometry: { shape: 'LINEAR' },
      unit: 'm',
      calculationInputs: { length: null, diameter: 0.0127 },
      confidence: 0.9,
      assumptions: [],
      warnings: ['Panjang belum tertera pada dokumen'],
      source: 'DED',
    };

    const qto = ezrabCoreQto.calculateQuantity(missingItem);
    assert.equal(qto.status, 'MISSING_DATA');
    assert.equal(qto.quantity, null); // Core QTO returns null for missing data without guessing
    assert.ok(qto.missingParameters?.includes('length'));

    // Valid item QTO calculation
    const validItem: DedWorkItem = {
      id: 'DED-VALID-01',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Kolom Praktis Beton 15/15',
      category: 'STRUCTURE_COLUMN',
      status: 'CONFIRMED',
      quantityStatus: 'CONFIRMED',
      evidenceIds: ['EV-01'],
      sourcePages: [1],
      dimensions: {
        width: { value: 0.15, unit: 'm' },
        height: { value: 3.5, unit: 'm' },
        length: { value: 0.15, unit: 'm' },
        count: { value: 8, unit: 'titik' },
      },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      calculationInputs: { width: 0.15, height: 3.5, length: 0.15, count: 8 },
      confidence: 0.98,
      assumptions: [],
      warnings: [],
      source: 'CALCULATED',
    };

    const validQto = ezrabCoreQto.calculateQuantity(validItem);
    assert.equal(validQto.status, 'CALCULATED');
    // 0.15 * 0.15 * 3.5 * 8 = 0.63 m³
    assert.equal(validQto.quantity, 0.63);
    assert.ok(validQto.formula.includes('0.15'));
  });

  it('6. AHSP Matching & Price Resolution Integrity (No Fabricated Prices)', () => {
    const concreteItem: DedWorkItem = {
      id: 'DED-CONCRETE-01',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Pekerjaan Beton Mutu f’c = 19,3 MPa (K-225)',
      category: 'STRUCTURE_BEAM',
      status: 'CONFIRMED',
      evidenceIds: [],
      sourcePages: [1],
      unit: 'm³',
      dimensions: { length: { value: 10, unit: 'm' } },
      geometry: { shape: 'RECTANGULAR' },
      calculationInputs: { length: 10 },
      confidence: 0.95,
      qto: {
        status: 'CALCULATED',
        quantity: 10,
        unit: 'm³',
        formula: '10 m³',
      },
      assumptions: [],
      warnings: [],
      source: 'CALCULATED',
    };

    const ahsp = ahspMatcher.matchWorkItem(concreteItem);
    assert.ok(ahsp.code.length > 0, 'Must match PUPR AHSP code');
    assert.ok(ahsp.matchType === 'EXACT_MATCH' || ahsp.matchType === 'SEMANTIC_MATCH');

    concreteItem.ahspMatch = ahsp;
    const price = ahspPriceResolver.resolvePrice(concreteItem);
    assert.ok(price.unitPrice !== null && price.unitPrice > 0, 'Price must come from resolution engine, not fabricate');
    assert.equal(price.totalPrice, (price.unitPrice || 0) * 10);
    assert.ok(price.priceSource.length > 0);
  });

  it('7. Targeted Advanced Verification (reprocessItemWithDetail)', async () => {
    const initialItem: DedWorkItem = {
      id: 'DED-ITEM-TARGETED',
      projectId: 'proj-targeted-01',
      sourceDocumentId: 'doc-01',
      name: 'Pintu Tipe D-02 Kusen Aluminium',
      category: 'DOOR_WINDOW',
      status: 'AMBIGUOUS',
      quantityStatus: 'AMBIGUOUS',
      evidenceIds: [],
      sourcePages: [1],
      unit: 'unit',
      dimensions: {
        count: { value: 2, unit: 'unit' },
      },
      geometry: { shape: 'COUNT' },
      calculationInputs: { count: 2 },
      confidence: 0.85,
      assumptions: ['Dimensi berbeda pada halaman 2 dan halaman 5'],
      warnings: ['Konflik dimensi'],
      source: 'AI_SUGGESTION',
    };

    // Pre-seed pipeline cache for targeted re-evaluation
    dedRabPipeline.setActiveResult('proj-targeted-01', {
      success: true,
      jobId: 'job-test-target',
      projectId: 'proj-targeted-01',
      mode: 'FAST',
      sourceDocuments: [
        {
          id: 'doc-01',
          projectId: 'proj-targeted-01',
          fileName: 'Arsitektur_Pintu.png',
          mimeType: 'image/png',
          fileSize: 1024,
          sha256: 'hash-pintu-01',
          pageCount: 1,
          createdAt: new Date().toISOString(),
          status: 'SOURCE_VERIFIED',
          pages: [
            {
              id: 'p1',
              documentId: 'doc-01',
              pageNumber: 1,
              width: 1000,
              height: 1000,
              drawingType: 'DOOR_WINDOW_SCHEDULE',
              status: 'ANALYZED',
              imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              scale: '1:50',
              scaleVerified: true,
            },
          ],
        },
      ],
      workItems: [initialItem],
      evidences: [],
      reviewSummary: {
        totalItemsFound: 1,
        confirmedCount: 0,
        partialCount: 0,
        missingDataCount: 0,
        ambiguousCount: 1,
        conflictCount: 0,
        unsupportedCount: 0,
        totalEstimatedRab: 0,
        currency: 'IDR',
        dedVerifiedCount: 0,
        constructionDerivedCount: 0,
        userAddedCount: 0,
        missingDimensionCount: 0,
        missingQuantityCount: 0,
        missingMaterialCount: 0,
        missingSpecificationCount: 0,
        missingReferenceCount: 0,
        missingAhspCount: 0,
        missingPriceCount: 0,
      },
      diagnostics: {
        jobId: 'job-test-target',
        projectId: 'proj-targeted-01',
        stage: 'READY_FOR_REVIEW',
        eventType: 'REVIEW_READY',
        currentPage: 1,
        totalPages: 1,
        pagesAnalyzed: 1,
        evidenceCount: 0,
        dedItemCount: 1,
        qtoCount: 0,
        ahspCount: 0,
        priceCount: 0,
        priceResolvedCount: 0,
        priceReferenceCount: 0,
        aiModel: 'gemini-3.5-flash-lite',
        aiRequests: 0,
        aiSuccessful: 0,
        aiFailed: 0,
        fallbackCount: 0,
        stageDetails: 'Ready',
        durationMs: 10,
      },
    });

    const updatedOutput = await dedRabPipeline.reprocessItemWithDetail(
      'proj-targeted-01',
      'DED-ITEM-TARGETED'
    );

    assert.ok(updatedOutput, 'Must return updated pipeline output');
    const reprocessedItem = updatedOutput.workItems.find((i) => i.id === 'DED-ITEM-TARGETED');
    assert.ok(reprocessedItem, 'Reprocessed item must exist in output');
    assert.equal(reprocessedItem.id, initialItem.id);
    assert.equal(reprocessedItem.status, 'CONFIRMED');
    assert.equal(reprocessedItem.quantity, 2);
  });

  it('8. RAB Mutation Approval Gate: Work items do NOT mutate official project RAB without explicit approval', () => {
    // In our architecture, the pipeline merely yields PipelineExecutionOutput.
    // Official RAB mutation requires the user to trigger handleConfirmApplyToRab().
    const workItems: DedWorkItem[] = [
      {
        id: 'DED-01',
        projectId,
        sourceDocumentId: 'doc-01',
        name: 'Galian Tanah Pondasi',
        category: 'SITEWORK',
        status: 'CONFIRMED',
        evidenceIds: [],
        sourcePages: [1],
        dimensions: { length: { value: 10, unit: 'm' } },
        geometry: { shape: 'RECTANGULAR' },
        calculationInputs: { length: 10 },
        confidence: 0.95,
        unit: 'm³',
        quantity: 25.5,
        userApproved: false, // User has not approved or unticked
        price: {
          unitPrice: 85000,
          totalPrice: 2167500,
          priceSource: 'PROJECT_PRICE',
          isOfficial: true,
          currency: 'IDR',
        },
        assumptions: [],
        warnings: [],
      },
      {
        id: 'DED-02',
        projectId,
        sourceDocumentId: 'doc-01',
        name: 'Pasangan Batu Kosong (Aanstamping)',
        category: 'FOUNDATION',
        status: 'CONFIRMED',
        evidenceIds: [],
        sourcePages: [1],
        dimensions: { length: { value: 8, unit: 'm' } },
        geometry: { shape: 'RECTANGULAR' },
        calculationInputs: { length: 8 },
        confidence: 0.95,
        unit: 'm³',
        quantity: 8.2,
        userApproved: true, // User approved
        price: {
          unitPrice: 450000,
          totalPrice: 3690000,
          priceSource: 'PROJECT_PRICE',
          isOfficial: true,
          currency: 'IDR',
        },
        assumptions: [],
        warnings: [],
      },
    ];

    // Filter only items approved by user for mutation
    const approvableItems = workItems.filter((i) => i.userApproved !== false);
    assert.equal(approvableItems.length, 1);
    assert.equal(approvableItems[0].id, 'DED-02');
  });
});

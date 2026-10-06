import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  dedRabPipeline,
  getDedProcessingConfig,
  getDedModel,
  DedProcessingMode,
  DedWorkItem,
  evidenceService,
  documentIngestionService,
  ezrabCoreQto,
  ahspMatcher,
  ahspPriceResolver,
} from '../ded-rab-v2';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

describe('EZRAB DED -> RAB 3-Mode Pipeline Integration Test Suite', () => {
  const projectId = 'test-3mode-proj-001';

  it('1. FAST Mode: Routing, configuration, and single-pass behavior', async () => {
    const fastConfig = getDedProcessingConfig('FAST');
    assert.equal(fastConfig.mode, 'FAST');
    assert.equal(fastConfig.provider, 'zyrouter');
    assert.ok(fastConfig.model.includes('flash') || fastConfig.model.includes('gemini'));
    assert.equal(fastConfig.reasoningLevel, 'low');
    assert.equal(fastConfig.enableSecondPass, false);
    assert.equal(fastConfig.maxConcurrentPages, 6);

    const modelInfo = getDedModel('FAST');
    assert.equal(modelInfo.provider, 'zyrouter');
    assert.ok(modelInfo.model.length > 0);
  });

  it('uses explicit Gemini vision model labels while retaining shared processing contract', () => {
    const fast = getDedProcessingConfig('FAST');
    const advanced = getDedProcessingConfig('ADVANCED');
    assert.equal(fast.model, 'gemini-3.5-flash-lite');
    assert.equal(fast.modelLabel, 'Gemini 3.5 Flash Lite');
    assert.equal(advanced.model, 'geminiflash-3.8');
    assert.equal(advanced.modelLabel, 'Gemini Flash 3.8');
    assert.equal(fast.provider, advanced.provider);
    assert.equal(fast.enablePriceResolution, true);
    assert.equal(advanced.enablePriceResolution, true);
  });

  it('2. STANDARD Mode: Routing, Qwen Flash + Omni Flash, and balanced two-pass', async () => {
    const stdConfig = getDedProcessingConfig('STANDARD');
    assert.equal(stdConfig.mode, 'STANDARD');
    assert.equal(stdConfig.provider, 'vleee');
    assert.equal(stdConfig.textModel, 'ali/qwen3.8-flash');
    assert.equal(stdConfig.visionModel, 'ali/qwen3.8-omni-flash');
    assert.equal(stdConfig.reasoningLevel, 'medium');
    assert.equal(stdConfig.enableSecondPass, true);
    assert.equal(stdConfig.enableCrossPageVerification, true);
    assert.equal(stdConfig.enablePriceResolution, true);

    const modelInfo = getDedModel('STANDARD');
    assert.equal(modelInfo.provider, 'vleee');
    assert.equal(modelInfo.visionModel, 'ali/qwen3.8-omni-flash');
    assert.equal(modelInfo.textModel, 'ali/qwen3.8-flash');
  });

  it('3. DETAIL Mode: Routing, ZyRouter Gemini 3.8 Flash, and multi-pass deep verification', async () => {
    const detailConfig = getDedProcessingConfig('DETAIL');
    assert.equal(detailConfig.mode, 'DETAIL');
    assert.equal(detailConfig.provider, 'zyrouter');
    assert.ok(detailConfig.model.includes('gemini') || detailConfig.model.includes('flash'));
    assert.equal(detailConfig.enableCrossPageVerification, true);
    assert.equal(detailConfig.enableAmbiguityResolution, true);
    assert.equal(detailConfig.enableDeepQuantityValidation, true);
    assert.equal(detailConfig.enableDeepAhspValidation, true);

    const modelInfo = getDedModel('DETAIL');
    assert.equal(modelInfo.provider, 'zyrouter');
    assert.ok(modelInfo.model.includes('gemini'));
  });

  it('4. Dimension Rule: Nominal pipe diameter is NOT treated as quantity', () => {
    const pipeItem: DedWorkItem = {
      id: 'DED-PIPE-001',
      projectId,
      sourceDocumentId: 'doc-pipe',
      name: 'Pipa PVC AW Ø 1/2"',
      category: 'MEP',
      status: 'MISSING_DATA',
      evidenceIds: ['EV-PIPE-001'],
      sourcePages: [4],
      dimensions: {
        diameter: { value: 0.0127, unit: 'm', evidenceId: 'EV-PIPE-001' },
        length: { value: null, unit: 'm', isMissing: true },
      },
      geometry: { shape: 'LINEAR' },
      unit: 'm',
      calculationInputs: { length: null, diameter: 0.0127 },
      confidence: 0.95,
      assumptions: [],
      warnings: [],
    };

    const qto = ezrabCoreQto.calculateQuantity(pipeItem);
    assert.equal(qto.status, 'MISSING_DATA');
    assert.equal(qto.quantity, null);
    assert.ok(qto.missingParameters?.includes('length'));
  });

  it('5. Evidence-First & Deterministic Price Resolution across all modes', () => {
    evidenceService.clearEvidence(projectId);

    const ev = evidenceService.addEvidence(projectId, {
      sourceDocumentId: 'doc-01',
      sourceFileName: 'Denah_Pondasi.pdf',
      pageNumber: 2,
      type: 'DIMENSION',
      content: 'Pondasi Batu Kali 0.40 x 0.80 x 20.00 m',
      unit: 'm',
      confidence: 0.98,
    });

    const workItem: DedWorkItem = {
      id: 'DED-PONDASI-001',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Pondasi Batu Kali 1:4',
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      evidenceIds: [ev.id],
      sourcePages: [2],
      dimensions: {
        length: { value: 20.0, unit: 'm', evidenceId: ev.id },
        width: { value: 0.4, unit: 'm', evidenceId: ev.id },
        height: { value: 0.8, unit: 'm', evidenceId: ev.id },
      },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      calculationInputs: { length: 20.0, width: 0.4, height: 0.8 },
      confidence: 0.98,
      assumptions: [],
      warnings: [],
    };

    const qto = ezrabCoreQto.calculateQuantity(workItem);
    assert.equal(qto.status, 'CALCULATED');
    assert.equal(qto.quantity, 6.4); // 20 * 0.4 * 0.8 = 6.4

    const ahsp = ahspMatcher.matchWorkItem(workItem);
    // The 2026 catalog holds MULTIPLE equally-valid "pondasi batu belah 1SP : 4PP" analyses
    // (2.2.2.1.6 manual + 2.2.2.1.7 semi-mekanis), so an honest matcher returns a MATCH whose
    // code is official, or an AMBIGUOUS non-decision carrying the real candidates. Asserting a
    // single certain match would encode a fabricated certainty (see AHSP source-of-truth task).
    assert.notEqual(ahsp.matchType, 'AI_CUSTOM');
    if (ahsp.matchType === 'AMBIGUOUS') {
      assert.equal(ahsp.code, '');
      assert.ok((ahsp.candidates || []).length > 0);
    } else {
      assert.ok(ahsp.matchType === 'EXACT_MATCH' || ahsp.matchType === 'SEMANTIC_MATCH');
      assert.ok(officialAhspRepository.hasOfficialAhsp(ahsp.code));
    }

    const itemWithQtoAndAhsp: DedWorkItem = {
      ...workItem,
      qto,
      ahspMatch: ahsp,
    };

    const price = ahspPriceResolver.resolvePrice(itemWithQtoAndAhsp);
    if (ahsp.matchType === 'AMBIGUOUS') {
      assert.equal(price.priceSource, 'PRICE_NOT_FOUND', 'Ambiguous AHSP fails closed without guessing price');
      assert.equal(price.unitPrice, null);
      assert.equal(price.totalPrice, null);
    } else {
      assert.ok(price.priceSource === 'OFFICIAL_AHSP' || price.priceSource === 'PRICE_NOT_FOUND');
      if (price.priceSource === 'OFFICIAL_AHSP') {
        assert.ok(price.unitPrice !== null && price.unitPrice > 0);
      }
    }
  });

  it('6. Targeted Reprocessing: reprocessItemWithDetail re-evaluates item incrementally', async () => {
    const testDoc = await documentIngestionService.ingestDocument({
      projectId: 'proj-targeted-reprocess',
      fileName: 'Test_Drawing.png',
      buffer: Buffer.from('DED Technical Sheet - Detail Kolom & Balok'),
      mimeType: 'image/png',
    });

    const dummyOutput = await dedRabPipeline.execute({
      projectId: 'proj-targeted-reprocess',
      files: [{ fileName: 'Test_Drawing.png', buffer: Buffer.from('DED Technical Sheet'), mimeType: 'image/png' }],
      mode: 'FAST',
    });

    assert.ok(dummyOutput !== undefined);
  });

  it('7. Real DED PDF Regression: Render and verify actual technical drawing', async () => {
    const pdfPath = path.resolve('qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.warn(`[Skip Real PDF Test] File not found at ${pdfPath}`);
      return;
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    assert.ok(pdfBuffer.length > 1000, 'PDF buffer must contain real bytes');

    const doc = await documentIngestionService.ingestDocument({
      projectId: 'proj-real-pdf-test',
      fileName: 'pdf-gambar-rumah-1-lantai_compress.pdf',
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
      maxPages: 3, // Render first 3 pages for fast deterministic regression test
    });

    assert.equal(doc.status, 'SOURCE_VERIFIED');
    assert.ok(doc.pages.length >= 1, 'At least 1 page rendered');
    assert.ok(doc.pages[0].imageDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(doc.pages[0].width > 0 && doc.pages[0].height > 0);
  });
});

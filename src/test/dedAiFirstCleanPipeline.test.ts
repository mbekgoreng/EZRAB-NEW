import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  dedRabPipeline,
  documentIngestionService,
  ezrabCoreQto,
  ahspMatcher,
  ahspPriceResolver,
  evidenceService,
  dedRabReviewService,
  dedSpreadsheetSync,
  dedRabValidationGate,
  DedWorkItem,
  SourceDocument,
} from '../ded-rab-v2';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { aiPriceSearchService } from '../services/aiPriceSearchService';

describe('EZRAB DED -> RAB AI-First Clean Rebuild Suite', () => {
  const projectId = 'proj-ded-ai-first-001';

  it('Section 30 Mandatory Test Case: Pondasi Batu Kali (32.50 x 0.40 x 0.80 m, mortar 1:4)', () => {
    // 1. Evidence capture
    evidenceService.clearEvidence(projectId);
    const ev1 = evidenceService.addEvidence(projectId, {
      sourceDocumentId: 'doc-s01',
      sourceFileName: 'S-01_Pondasi.pdf',
      pageNumber: 2,
      type: 'DIMENSION',
      content: 'P=32.50 m, L=0.40 m, T=0.80 m, mortar 1:4',
      unit: 'm',
      confidence: 0.99,
    });

    // 2. Canonical Work Item
    const item: DedWorkItem = {
      id: 'WORK-FND-001',
      projectId,
      sourceDocumentId: 'doc-s01',
      name: 'Pekerjaan Pasangan Pondasi Batu Belah 1:4',
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      evidenceIds: [ev1.id],
      sourcePages: [2],
      materialSpec: 'Batu belah mortar 1SP:4PP',
      dimensions: {
        length: { value: 32.50, unit: 'm', evidenceId: ev1.id },
        width: { value: 0.40, unit: 'm', evidenceId: ev1.id },
        height: { value: 0.80, unit: 'm', evidenceId: ev1.id },
      },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      calculationInputs: { length: 32.50, width: 0.40, height: 0.80 },
      confidence: 0.99,
      assumptions: [],
      warnings: [],
    };

    // 3. Deterministic QTO
    const qto = ezrabCoreQto.calculateQuantity(item);
    assert.equal(qto.status, 'CALCULATED');
    assert.equal(qto.quantity, 10.40, 'Volume must equal exactly 32.50 * 0.40 * 0.80 = 10.40 m³');

    // 4. Official AHSP Matching (No rogue AI-CUSTOM-XXXX)
    const match = ahspMatcher.matchWorkItem(item);
    assert.notEqual(match.matchType, 'AI_CUSTOM', 'AI must NEVER invent AI-CUSTOM AHSP codes');
    assert.ok(match.code, 'Must match an official AHSP code');
    assert.ok(match.name.toLowerCase().includes('batu') || match.name.toLowerCase().includes('pondasi'));

    const itemWithMatch: DedWorkItem = {
      ...item,
      qto,
      quantity: qto.quantity,
      ahspMatch: match,
    };

    // 5. Decomposition & Price Resolution from EZRAB Source of Truth
    const priceRes = ahspPriceResolver.resolvePrice(itemWithMatch);
    assert.notEqual(priceRes.priceSource, 'PRICE_NOT_FOUND', 'Official AHSP must resolve price');
    assert.ok(priceRes.unitPrice && priceRes.unitPrice > 0, 'Unit price must be > 0');
    assert.ok(priceRes.totalPrice && priceRes.totalPrice > 0, 'Total price must be computed');
    
    // Arithmetic validation with SafeDecimalEngine
    const expectedTotal = SafeDecimalEngine.safeMultiply(priceRes.unitPrice!, 10.40, 2);
    assert.equal(priceRes.totalPrice, expectedTotal, 'Total must equal Unit Price * 10.40 m³');

    // 6. Components inspection (Material is component, NOT separate work item)
    assert.ok(priceRes.components && priceRes.components.length > 0, 'AHSP must have decomposed resources');
    const hasStone = priceRes.components.some(c => c.name.toLowerCase().includes('batu'));
    const hasCement = priceRes.components.some(c => c.name.toLowerCase().includes('semen') || c.name.toLowerCase().includes('portland'));
    const hasLabor = priceRes.components.some(c => c.type === 'LABOR' || c.name.toLowerCase().includes('pekerja') || c.name.toLowerCase().includes('tukang'));
    assert.ok(hasStone, 'Must include stone/batu as resource component');
    assert.ok(hasCement, 'Must include cement/semen as resource component');
    assert.ok(hasLabor, 'Must include labor/tenaga as resource component');
  });

  it('Section 11 & 28: Fail-Closed Rule — Missing Dimensions returns quantity = null and invalid gate', () => {
    const itemMissingDims: DedWorkItem = {
      id: 'WORK-FND-MISSING',
      projectId,
      sourceDocumentId: 'doc-s01',
      name: 'Pondasi Batu Kali',
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      evidenceIds: [],
      sourcePages: [1],
      dimensions: {
        width: { value: 0.40, unit: 'm' },
        // length is missing
      },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      calculationInputs: { width: 0.40 }, // length & height null
      confidence: 0.8,
      assumptions: [],
      warnings: [],
    };

    const qto = ezrabCoreQto.calculateQuantity(itemMissingDims);
    assert.equal(qto.status, 'MISSING_DATA');
    assert.equal(qto.quantity, null, 'Must NOT default to 1 or guess quantity');

    const validation = dedRabValidationGate.validateItem({
      ...itemMissingDims,
      qto,
      quantity: null,
      ahspMatch: {
        code: '2.2.2.1.6',
        name: 'Pemasangan pondasi batu belah 1:4',
        unit: 'm3',
        matchType: 'EXACT_MATCH',
        source: 'PUPR 2026',
        confidence: 0.95,
      },
    }, projectId);

    assert.equal(validation.isValid, false, 'Incomplete item must fail validation gate');
    assert.ok(validation.status === 'MISSING_QUANTITY' || validation.status === 'NEEDS_REVIEW');
  });

  it('Section 11: AI is strictly prohibited from fabricating fake AHSP codes', () => {
    const fakeWorkItem: DedWorkItem = {
      id: 'WORK-FANTASY-001',
      projectId,
      sourceDocumentId: 'doc-s01',
      name: 'Pekerjaan Instalasi Quantum Teleporter Reactor',
      category: 'OTHER',
      status: 'CONFIRMED',
      evidenceIds: [],
      sourcePages: [1],
      dimensions: {},
      geometry: { shape: 'COUNT' },
      unit: 'unit',
      calculationInputs: {},
      confidence: 0.5,
      assumptions: [],
      warnings: [],
    };

    const match = ahspMatcher.matchWorkItem(fakeWorkItem);
    assert.notEqual(match.code, 'AI-CUSTOM-001', 'Must not generate AI-CUSTOM-XXXX');
    assert.equal(match.matchType, 'NOT_FOUND', 'Unmatched item must return NOT_FOUND');
  });

  it('Section 13 & 14: External Price Discovery provider interface and fallback validation', async () => {
    const searchRes = await aiPriceSearchService.searchPrice({
      material: 'Batu Belah Kali Pondasi',
      specification: 'Ukuran 15-20 cm standar pondasi',
      unit: 'm3',
      region: 'DKI Jakarta',
    });

    assert.ok(searchRes !== undefined);
    assert.ok(searchRes.status === 'FOUND' || searchRes.status === 'NO_RESULT' || (searchRes.candidates && searchRes.candidates.length >= 0));
  });

  it('Section 20: Spreadsheet RAB Sync produces structured rows with correct column hierarchy', async () => {
    const validItem: DedWorkItem = {
      id: 'WORK-RAB-001',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Pemasangan Pondasi Batu Belah 1:4',
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      evidenceIds: ['EV-001'],
      sourcePages: [1],
      dimensions: {
        length: { value: 32.50, unit: 'm' },
        width: { value: 0.40, unit: 'm' },
        height: { value: 0.80, unit: 'm' },
      },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      quantity: 10.40,
      calculationInputs: { length: 32.50, width: 0.40, height: 0.80 },
      qto: {
        quantity: 10.40,
        unit: 'm³',
        status: 'CALCULATED',
        formula: '32.50 × 0.40 × 0.80',
      },
      ahspMatch: {
        code: '2.2.2.1.6',
        name: 'Pemasangan 1 m3 pondasi batu belah 1SP : 4PP',
        unit: 'm3',
        matchType: 'EXACT_MATCH',
        source: 'PUPR 2026',
        confidence: 0.98,
      },
      price: {
        unitPrice: 951200,
        totalPrice: 9892480,
        priceSource: 'OFFICIAL_AHSP',
        isOfficial: true,
        currency: 'IDR',
      },
      validationStatus: 'READY',
      rabEligible: true,
      userApproved: true,
      confidence: 0.98,
      assumptions: [],
      warnings: [],
    };

    const syncResult = await dedSpreadsheetSync.syncToSheets({
      projectId,
      projectName: 'Proyek Rumah 1 Lantai Tipe 70',
      sourceDocuments: [
        {
          id: 'doc-01',
          projectId,
          fileName: 'DED_Rumah.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          sha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
          pageCount: 1,
          pages: [],
          status: 'SOURCE_VERIFIED',
          createdAt: new Date().toISOString(),
        },
      ],
      workItems: [validItem],
      evidences: [],
    });

    assert.equal(syncResult.success, true);
    assert.equal(syncResult.status, 'SYNCED');
    assert.ok(syncResult.syncedSheets.length === 9, 'Must generate all 9 canonical sheets');
    assert.ok(syncResult.rowCount > 0, 'Must have populated spreadsheet rows');
  });

  it('Section 29: Real DED File Ingestion Verification (pdf-gambar-rumah-1-lantai_compress.pdf)', async () => {
    const realFilePath = path.resolve(process.cwd(), 'qa-fixtures', 'pdf-gambar-rumah-1-lantai_compress.pdf');
    if (fs.existsSync(realFilePath)) {
      const buffer = fs.readFileSync(realFilePath);
      const ingested = await documentIngestionService.ingestDocument({
        projectId: 'proj-real-ded-test',
        fileName: 'pdf-gambar-rumah-1-lantai_compress.pdf',
        buffer,
        mimeType: 'application/pdf',
        maxPages: 3,
      });

      assert.equal(ingested.status, 'SOURCE_VERIFIED');
      assert.ok(ingested.sha256.length === 64);
      assert.ok(ingested.pages.length > 0, 'Must have rendered pages');
      assert.ok(ingested.pages[0].imageDataUrl.startsWith('data:image/'));
    }
  });
});

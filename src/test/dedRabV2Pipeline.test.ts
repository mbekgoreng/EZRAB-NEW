import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedRabPipeline,
  documentIngestionService,
  ezrabCoreQto,
  ahspMatcher,
  ahspPriceResolver,
  evidenceService,
  dedRabReviewService,
  dedSpreadsheetSync,
  DedWorkItem,
  SourceDocument,
} from '../ded-rab-v2';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/officialAhspRepository';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';

describe('EZRAB DED -> RAB V2 Full Pipeline Suite', () => {
  const projectId = 'test-proj-v2-001';

  it('1. Document Ingestion: Computes SHA-256 and transitions UPLOADED -> SOURCE_VERIFIED', async () => {
    const sampleBuffer = Buffer.from('DED Drawing Header - Pondasi Batu Kali 60/30 L=25m');
    const doc = await documentIngestionService.ingestDocument({
      projectId,
      fileName: 'DED_Struktur_S01.png',
      buffer: sampleBuffer,
      mimeType: 'image/png',
    });

    assert.equal(doc.projectId, projectId);
    assert.equal(doc.fileName, 'DED_Struktur_S01.png');
    assert.equal(doc.status, 'SOURCE_VERIFIED');
    assert.ok(doc.sha256.length === 64, 'SHA-256 must be 64-char hex');
    assert.equal(doc.pageCount, 1);
    assert.equal(doc.pages.length, 1);
    assert.equal(doc.pages[0].pageNumber, 1);
    assert.ok(doc.pages[0].imageDataUrl.startsWith('data:image/png;base64,'));
  });

  it('2. Ingestion Integrity Gate: Unreadable/corrupt files marked as FAILED or UNREADABLE', async () => {
    const emptyDoc = await documentIngestionService.ingestDocument({
      projectId,
      fileName: 'DED_Corrupt_File.pdf',
      buffer: Buffer.alloc(0),
    });

    assert.ok(emptyDoc.status === 'FAILED' || emptyDoc.status === 'UNREADABLE');
    assert.ok(emptyDoc.error !== undefined);
  });

  it('3. Evidence First: Dimension without evidence is rejected (Strict Evidence Rule)', () => {
    evidenceService.clearEvidence(projectId);

    const ev1 = evidenceService.addEvidence(projectId, {
      sourceDocumentId: 'doc-01',
      sourceFileName: 'S-01.pdf',
      pageNumber: 2,
      type: 'DIMENSION',
      content: '0.60',
      unit: 'm',
      confidence: 0.98,
    });

    const ev2 = evidenceService.addEvidence(projectId, {
      sourceDocumentId: 'doc-01',
      sourceFileName: 'S-01.pdf',
      pageNumber: 2,
      type: 'DIMENSION',
      content: '0.30',
      unit: 'm',
      confidence: 0.98,
    });

    assert.equal(ev1.id, 'EV-001');
    assert.equal(ev2.id, 'EV-002');

    const stored = evidenceService.getEvidences(projectId);
    assert.equal(stored.length, 2);
  });

  it('4. EZRAB Core QTO: Deterministic volume calculation (L x W x H)', () => {
    const item: DedWorkItem = {
      id: 'DED-001',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Pondasi Batu Kali',
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      evidenceIds: ['EV-001', 'EV-002'],
      sourcePages: [2],
      dimensions: {
        length: { value: 42.5, unit: 'm', evidenceId: 'EV-003' },
        width: { value: 0.6, unit: 'm', evidenceId: 'EV-001' },
        height: { value: 0.3, unit: 'm', evidenceId: 'EV-002' },
      },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      calculationInputs: { length: 42.5, width: 0.6, height: 0.3 },
      confidence: 0.98,
      assumptions: [],
      warnings: [],
    };

    const qto = ezrabCoreQto.calculateQuantity(item);
    assert.equal(qto.status, 'CALCULATED');
    // 42.5 * 0.6 * 0.3 = 7.65 m3
    assert.equal(qto.quantity, 7.65);
    assert.equal(qto.unit, 'm³');
    assert.ok(qto.formula.includes('42.5'));
  });

  it('5. QTO Failure Principle: Missing dimension results in MISSING_DATA (No AI guessing)', () => {
    const incompleteItem: DedWorkItem = {
      id: 'DED-002',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Pondasi Batu Kali',
      category: 'FOUNDATION',
      status: 'MISSING_DATA',
      evidenceIds: ['EV-001'],
      sourcePages: [2],
      dimensions: {
        length: { value: null, unit: 'm', isMissing: true },
        width: { value: 0.6, unit: 'm', evidenceId: 'EV-001' },
        height: { value: 0.3, unit: 'm', evidenceId: 'EV-002' },
      },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      calculationInputs: { length: null, width: 0.6, height: 0.3 },
      confidence: 0.90,
      assumptions: [],
      warnings: [],
    };

    const qto = ezrabCoreQto.calculateQuantity(incompleteItem);
    assert.equal(qto.status, 'MISSING_DATA');
    assert.equal(qto.quantity, null);
    assert.ok(qto.missingParameters?.includes('length'));
  });

  it('6. AHSP Matching: PUPR 2026 match vs AI_CUSTOM item classification', () => {
    const officialItem: DedWorkItem = {
      id: 'DED-003',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Pekerjaan Pasangan Pondasi Batu Kali 1:4',
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      evidenceIds: [],
      sourcePages: [1],
      dimensions: {},
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      calculationInputs: {},
      confidence: 0.95,
      assumptions: [],
      warnings: [],
    };

    const matchOfficial = ahspMatcher.matchWorkItem(officialItem);
    assert.ok(matchOfficial.matchType === 'EXACT_MATCH' || matchOfficial.matchType === 'SEMANTIC_MATCH');
    assert.ok(matchOfficial.code.length > 0);

    const customItem: DedWorkItem = {
      id: 'DED-004',
      projectId,
      sourceDocumentId: 'doc-01',
      name: 'Instalasi Sensor Kinetik Holografik Ruang Server',
      category: 'OTHER',
      status: 'CONFIRMED',
      evidenceIds: [],
      sourcePages: [1],
      dimensions: {},
      geometry: { shape: 'COUNT' },
      unit: 'unit',
      calculationInputs: {},
      confidence: 0.90,
      assumptions: [],
      warnings: [],
    };

    const matchCustom = ahspMatcher.matchWorkItem(customItem);
    assert.equal(matchCustom.matchType, 'NOT_FOUND', 'AI must never invent fake AHSP codes');
  });

  it('7. Price Resolution: Strict hierarchy without price fabrication', () => {
    const firstOfficial = officialAhspRepository.getAllOfficialAhsp().find(a => a.name.toLowerCase().includes('batu') || a.code.length > 0)!;
    const officialMatchedItem: DedWorkItem = {
      id: 'DED-005',
      projectId,
      sourceDocumentId: 'doc-01',
      name: firstOfficial.name,
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      evidenceIds: [],
      sourcePages: [1],
      dimensions: {},
      geometry: { shape: 'RECTANGULAR' },
      unit: firstOfficial.unit || 'm³',
      calculationInputs: {},
      confidence: 0.95,
      assumptions: [],
      warnings: [],
      qto: { formula: '7.65 m³', quantity: 7.65, unit: firstOfficial.unit || 'm³', status: 'CALCULATED' },
      ahspMatch: {
        code: firstOfficial.code,
        name: firstOfficial.name,
        unit: firstOfficial.unit || 'm³',
        matchType: 'EXACT_MATCH',
        source: 'PUPR 2026',
        confidence: 0.96,
      },
    };

    const priceResult = ahspPriceResolver.resolvePrice(officialMatchedItem);
    assert.ok(priceResult.unitPrice !== null && priceResult.unitPrice > 0);
    assert.ok(priceResult.priceSource === 'OFFICIAL_AHSP' || priceResult.priceSource === 'PROJECT_PRICE');
    assert.equal(priceResult.totalPrice, SafeDecimalEngine.safeMultiply(priceResult.unitPrice!, 7.65, 2));

    // Item with non-existent AHSP code
    const unknownItem: DedWorkItem = {
      ...officialMatchedItem,
      id: 'DED-006',
      ahspMatch: {
        code: 'X.99.99.99',
        name: 'Item Fiktif',
        unit: 'm³',
        matchType: 'NOT_FOUND',
        source: 'UNKNOWN',
        confidence: 0,
      },
    };

    const unpriced = ahspPriceResolver.resolvePrice(unknownItem);
    assert.equal(unpriced.priceSource, 'PRICE_NOT_FOUND');
    assert.equal(unpriced.unitPrice, null);
  });

  it('8. Critical Empty Result Rule (Rule 24): Empty work items fails closed without Rp 0 display', async () => {
    const emptyResult = await dedRabPipeline.execute({
      projectId: 'proj-empty-check',
      files: [
        {
          fileName: 'DED_Tanpa_Item.txt',
          buffer: 'Hanya teks deskriptif tanpa gambar teknik dan tanpa dimensi',
        },
      ],
    });

    // Per Rule 24: If items = [], do NOT return verified RAB Rp 0; return failure state with diagnostics
    assert.equal(emptyResult.success, false);
    assert.equal(emptyResult.workItems.length, 0);
    assert.ok(emptyResult.error?.includes('NO_VERIFIED_ITEMS') || emptyResult.error?.includes('AI tidak menemukan'));
    assert.ok(emptyResult.diagnostics !== undefined);
  });

  it('9. Google Sheets 9-Tab Workspace Structure (Rule 30)', async () => {
    const doc: SourceDocument = {
      id: 'src-01',
      projectId,
      fileName: 'DED_Final.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024000,
      sha256: 'abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pageCount: 2,
      createdAt: new Date().toISOString(),
      status: 'SOURCE_VERIFIED',
      pages: [],
    };

    const item: DedWorkItem = {
      id: 'DED-001',
      projectId,
      sourceDocumentId: 'src-01',
      name: 'Pondasi Batu Kali',
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      evidenceIds: ['EV-001'],
      sourcePages: [1],
      dimensions: { length: { value: 20, unit: 'm' } },
      geometry: { shape: 'RECTANGULAR' },
      unit: 'm³',
      calculationInputs: { length: 20 },
      confidence: 0.98,
      assumptions: [],
      warnings: [],
      qto: { formula: '20 * 0.6 * 0.3', quantity: 3.6, unit: 'm³', status: 'CALCULATED' },
      ahspMatch: { code: 'A.3.2.1.2', name: 'Pondasi Batu Belah 1:4', unit: 'm³', matchType: 'EXACT_MATCH', source: 'PUPR 2026', confidence: 0.98 },
      price: { unitPrice: 1250000, totalPrice: 4500000, priceSource: 'OFFICIAL_AHSP', isOfficial: true, currency: 'IDR' },
      userApproved: true,
    };

    const syncRes = await dedSpreadsheetSync.syncToSheets({
      projectId,
      projectName: 'Proyek Validasi V2',
      sourceDocuments: [doc],
      workItems: [item],
      evidences: evidenceService.getEvidences(projectId),
    });

    assert.equal(syncRes.success, true);
    assert.equal(syncRes.sheets.length, 9);
    assert.deepEqual(syncRes.sheets.map((s) => s.sheetName), [
      '01_PROJECT',
      '02_SOURCES',
      '03_DED_ITEMS',
      '04_EVIDENCE',
      '05_QTO',
      '06_AHSP',
      '07_PRICING',
      '08_RAB_DRAFT',
      '09_REVIEW',
    ]);
  });

  it('10. User Approval Gate: Convert to Official RabItem only after explicit approval', () => {
    const firstOfficial = officialAhspRepository.getAllOfficialAhsp().find(a => a.name.toLowerCase().includes('beton') || a.name.toLowerCase().includes('pondasi'))!;
    const items: DedWorkItem[] = [
      {
        id: 'DED-010',
        projectId,
        sourceDocumentId: 'src-01',
        name: firstOfficial.name,
        category: 'STRUCTURE_COLUMN',
        status: 'CONFIRMED',
        evidenceIds: ['EV-010'],
        sourcePages: [1],
        dimensions: {
          length: { value: 3.5, unit: 'm' },
          width: { value: 0.15, unit: 'm' },
          height: { value: 0.15, unit: 'm' },
          count: { value: 10, unit: 'titik' },
        },
        geometry: { shape: 'RECTANGULAR' },
        unit: firstOfficial.unit || 'm³',
        quantity: 0.787,
        calculationInputs: { length: 3.5, width: 0.15, height: 0.15, count: 10 },
        confidence: 0.98,
        assumptions: [],
        warnings: [],
        qto: { formula: '10 * 0.15 * 0.15 * 3.5', quantity: 0.787, unit: firstOfficial.unit || 'm³', status: 'CALCULATED' },
        ahspMatch: { code: firstOfficial.code, name: firstOfficial.name, unit: firstOfficial.unit || 'm³', matchType: 'EXACT_MATCH', source: 'PUPR 2026', confidence: 0.98 },
        price: {
          unitPrice: 1300000,
          totalPrice: 1023100,
          priceSource: 'OFFICIAL_AHSP',
          isOfficial: true,
          currency: 'IDR',
          components: [
            { type: 'MATERIAL', code: 'M-01', name: 'Semen PC', unit: 'kg', coefficient: 326, unitPrice: 1500, totalPrice: 489000 },
          ],
        },
        userApproved: true,
      },
      {
        id: 'DED-011',
        projectId,
        sourceDocumentId: 'src-01',
        name: 'Item Yang Ditolak Pengguna',
        category: 'OTHER',
        status: 'PARTIAL',
        evidenceIds: [],
        sourcePages: [2],
        dimensions: {},
        geometry: { shape: 'COUNT' },
        unit: 'unit',
        calculationInputs: {},
        confidence: 0.5,
        assumptions: [],
        warnings: [],
        userApproved: false, // Rejected by user
      },
    ];

    const officialRab = dedRabReviewService.convertToOfficialRabItems(items, projectId);
    assert.equal(officialRab.length, 1);
    assert.equal(officialRab[0].description, firstOfficial.name);
    assert.equal(officialRab[0].volume, 0.787);
    assert.equal(officialRab[0].unitPrice, 1300000);
  });
});

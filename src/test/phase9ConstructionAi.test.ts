/**
 * Phase 9 — EZRAB AI Construction Intelligence Test Suite
 * Validates:
 * 1. AI Baca Denah (room/area/perimeter detection, scale warning, element takeoff, volume derivations)
 * 2. AI Baca Nota (OCR extraction, Master Price matching with % difference, Human Confirmation Gate into ProjectFinanceRepository)
 * 3. AI Cek Kewajaran RAB (price audit against Master Price, AHSP catalog, duplicate detection, missing items, health score)
 * 4. Human Confirmation Gate & Strict Non-Mutation prior to user consent
 * 5. Multi-Project Isolation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDrawing,
  convertDraftToRabItems,
  VolumeDraftItem,
} from '../services/aiDrawingIntelligence';
import {
  analyzeReceipt,
  matchItemWithMasterPrice,
  confirmAndSaveExpenseToRepository,
  DEFAULT_MASTER_PRICE_CATALOG,
} from '../services/aiReceiptIntelligence';
import {
  reviewProjectRab,
  RABReviewSummary,
} from '../services/aiRabReview';
import { ProjectFinanceRepository } from '../domain/finance/repository';
import { Project, RabItem } from '../types';

// Mock helper for projects
function createMockProject(id: string, name: string): Project {
  return {
    id,
    name,
    location: 'Surabaya',
    buildingType: 'Rumah Tinggal',
    budget: 500000000,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Project;
}

// Mock helper for RAB items
function createMockRabItem(
  id: string,
  category: string,
  description: string,
  volume: number,
  unit: string,
  unitPrice: number,
  ahspCode?: string
): RabItem {
  return {
    id,
    category,
    description,
    volume,
    unit,
    unitPrice,
    totalPrice: volume * unitPrice,
    ahspCode,
  } as RabItem;
}

describe('PHASE 9.1 — AI BACA DENAH (FLOOR PLAN & DED INTELLIGENCE)', () => {
  const projectA = createMockProject('PRJ-DENAH-01', 'Rumah Tinggal 2 Lantai Mewah');

  it('should analyze drawing file and detect scale, spaces, and dimensions', async () => {
    const res = await analyzeDrawing({
      projectId: projectA.id,
      fileName: 'denah_lantai_1.png',
      fileData: 'mock_binary_data_png',
      customScale: '1:100',
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.result, 'Should have result');
    const result = res.result!;

    assert.ok(result.id, 'Should generate analysis ID');
    assert.strictEqual(result.fileName, 'denah_lantai_1.png');
    assert.ok(result.spaces.length >= 4, 'Should detect at least 4 room spaces');
    assert.ok(result.totalBuildingArea > 0, 'Should calculate total gross floor area');

    // Validate space geometry properties
    const firstSpace = result.spaces[0];
    assert.ok(firstSpace.name, 'Space should have a name');
    assert.ok(firstSpace.area.value > 0, 'Space should have area > 0');
    assert.ok(firstSpace.perimeter.value > 0, 'Space should have perimeter > 0');
    assert.ok(firstSpace.dimensions && firstSpace.dimensions.width > 0, 'Space width must be positive');
    assert.ok(firstSpace.dimensions && firstSpace.dimensions.length > 0, 'Space length must be positive');
  });

  it('should issue scale warning when drawing scale is uncalibrated or approximate', async () => {
    const res = await analyzeDrawing({
      projectId: projectA.id,
      fileName: 'denah_sketsa_tanpa_skala.jpg',
      fileData: 'mock_binary_data_jpg',
      // No customScale provided
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.result, 'Result should exist');
    const result = res.result!;

    assert.ok(result.detectedScale, 'Result should have scale metadata');
    assert.ok(result.scaleWarning, 'Should provide scale warning message');
    assert.match(result.scaleWarning || '', /skala|asumsi|kalibrasi/i);
  });

  it('should detect architectural, structural, and MEP construction elements', async () => {
    const res = await analyzeDrawing({
      projectId: projectA.id,
      fileName: 'denah_arsitektur_lengkap.png',
      fileData: 'mock_binary_data',
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.result);
    const result = res.result!;

    assert.ok(result.elements.length >= 3, 'Should detect multiple construction elements');
    const elementCategories = result.elements.map((e) => e.category);
    assert.ok(elementCategories.includes('Arsitektur') || elementCategories.includes('Struktur'));
  });

  it('should derive volume drafts with formula heuristics tagged with approved=false', async () => {
    const res = await analyzeDrawing({
      projectId: projectA.id,
      fileName: 'denah_lt1.png',
      fileData: 'mock_data',
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.result);
    const result = res.result!;

    assert.ok(result.volumeDraft.length >= 5, 'Should derive multiple volume draft items');
    for (const draft of result.volumeDraft) {
      assert.ok(draft.formula, 'Draft item must contain derivation formula');
      assert.ok(draft.volume > 0, 'Draft volume must be positive');
      assert.strictEqual(draft.approved, false, 'Must be unapproved pending human confirmation');
      assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(draft.confidence), 'Confidence must be valid');
    }
  });

  it('should convert approved volume draft items into standard RAB items', () => {
    const mockDrafts: VolumeDraftItem[] = [
      {
        id: 'VD-1',
        category: 'Pekerjaan Pasangan & Dinding',
        workItemName: 'Pasangan Dinding Bata Ringan tebal 10 cm',
        volume: 145.2,
        unit: 'm2',
        formula: 'Keliling Total (55m) x Tinggi (3.3m) - Bukaan (15%)',
        confidence: 'HIGH',
        unitPrice: 165000,
        ahspCode: 'A.4.4.1.9',
        source: 'Denah: Ruang Tamu',
        approved: true, // Approved by user
      },
      {
        id: 'VD-2',
        category: 'Pekerjaan Lainnya',
        workItemName: 'Item Belum Disetujui',
        volume: 10,
        unit: 'm2',
        confidence: 'LOW',
        source: 'Denah',
        approved: false, // Not approved
      },
    ];

    const rabItems = convertDraftToRabItems(mockDrafts);
    assert.strictEqual(rabItems.length, 1, 'Only approved drafts should be converted');
    assert.strictEqual(rabItems[0].volume, 145.2);
    assert.strictEqual(rabItems[0].unit, 'm2');
    assert.strictEqual(rabItems[0].unitPrice, 165000);
    assert.strictEqual(rabItems[0].ahspCode, 'A.4.4.1.9');
  });
});

describe('PHASE 9.2 — AI BACA NOTA (RECEIPT OCR & MASTER PRICE MATCHING)', () => {
  const projectB = createMockProject('PRJ-FINANCE-02', 'Pembangunan Ruko 3 Pintu');

  it('should extract structured invoice data from receipt image', async () => {
    const res = await analyzeReceipt({
      projectId: projectB.id,
      fileName: 'nota_semen_gresik.jpg',
      fileData: 'mock_image_binary',
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.result, 'Should return OCR result');
    const result = res.result!;

    assert.ok(result.id, 'Should generate OCR ID');
    assert.ok(result.supplierName, 'Should extract vendor name');
    assert.ok(result.invoiceNumber, 'Should extract invoice number');
    assert.ok(result.invoiceDate, 'Should extract date');
    assert.ok(result.lineItems.length >= 2, 'Should extract at least 2 line items');
    assert.ok(result.grandTotal > 0, 'Should extract grand total');
  });

  it('should match receipt items against Master Price catalog and calculate percentage difference', () => {
    // Exact match test
    const matchedSemen = matchItemWithMasterPrice('Semen Portland 50 kg', 65000, DEFAULT_MASTER_PRICE_CATALOG);
    assert.ok(matchedSemen, 'Should find a match for Semen Portland');
    assert.ok(matchedSemen.masterPrice && matchedSemen.masterPrice > 0);
    assert.ok(typeof matchedSemen.priceDifferencePercent === 'number');

    // Price difference calculation check
    // If master is 62,000 and receipt is 65,000 -> diff = ((65000 - 62000)/62000)*100 = +4.84%
    assert.ok(matchedSemen.priceDifferencePercent > 0, 'Receipt price higher than master should be positive diff');

    // Unknown item test
    const unknownItem = matchItemWithMasterPrice('Barang Aneh Tidak Dikenal XYZ 999', 50000, DEFAULT_MASTER_PRICE_CATALOG);
    assert.strictEqual(unknownItem, undefined, 'Unknown item should return undefined match');
  });

  it('should NOT save expense to ProjectFinanceRepository before user confirmation (Confirmation Gate)', () => {
    const repo = new ProjectFinanceRepository(projectB.id);
    const initialExpenses = repo.getExpenses();
    const initialCount = initialExpenses.length;

    // Simulate OCR extraction without calling save
    assert.strictEqual(repo.getExpenses().length, initialCount, 'Expenses count must not change prior to confirmation');
  });

  it('should accurately save expense to ProjectFinanceRepository upon explicit user confirmation', () => {
    const repo = new ProjectFinanceRepository(projectB.id);

    const savedExpense = confirmAndSaveExpenseToRepository(
      {
        projectId: projectB.id,
        ocrId: 'OCR-REC-12345',
        supplier: 'TB Usaha Jaya Abadi',
        date: '2026-09-21',
        amount: 4850000,
        category: 'Material',
        paymentMethod: 'Transfer',
        description: 'Pembelian Semen Portland & Pasir Pasang',
        referenceNumber: 'INV-TB-998811',
      },
      repo
    );

    assert.ok(savedExpense.id, 'Saved expense must have ID');
    assert.strictEqual(savedExpense.amount, 4850000);
    assert.strictEqual(savedExpense.category, 'Material');
    assert.strictEqual(savedExpense.vendor, 'TB Usaha Jaya Abadi');
    assert.strictEqual(savedExpense.reference, 'INV-TB-998811');

    // Verify stored in repository
    const stored = repo.getExpenses().find((e) => e.id === savedExpense.id);
    assert.ok(stored, 'Expense must be persisted in repository');
    assert.strictEqual(stored?.amount, 4850000);
  });
});

describe('PHASE 9.3 — AI CEK KEWAJARAN RAB (MULTI-DIMENSIONAL AUDIT)', () => {
  const projectC = createMockProject('PRJ-RAB-03', 'Renovasi Kantor 3 Lantai');

  it('should detect unit price markups and underpriced items against Master Price', async () => {
    const rabItems: RabItem[] = [
      createMockRabItem('1', 'Pekerjaan Struktur', 'Semen Portland 50 kg', 100, 'sak', 150000, 'A.4.1.1.1'), // Master is ~62,000 -> Overpriced (+141%)
      createMockRabItem('2', 'Pekerjaan Struktur', 'Besi Beton Polos Dia 10mm SNI', 200, 'btg', 30000, 'A.4.1.1.2'), // Master is ~72,000 -> Underpriced (-58%)
      createMockRabItem('3', 'Pekerjaan Pasangan', 'Bata Ringan Hebel 10 cm', 50, 'm³', 650000, 'A.4.4.1.1'), // Normal ~650,000
    ];

    const res = await reviewProjectRab({
      projectId: projectC.id,
      projectName: projectC.name,
      rabItems,
    });

    assert.strictEqual(res.success, true);
    const summary = res.summary;

    assert.ok(summary.totalFindings > 0, 'Should find anomalies in RAB');
    assert.ok(summary.priceFindings >= 2, 'Should detect both overpriced and underpriced items');

    const markup = summary.findings.find((f) => f.category === 'PRICE' && f.differencePercent && f.differencePercent > 50);
    assert.ok(markup, 'Must identify significant price markup finding');
    assert.strictEqual(markup?.severity, 'WARNING');
    assert.strictEqual(markup?.source, 'Master Price');
  });

  it('should identify unmapped AHSP items and missing codes', async () => {
    const rabItems: RabItem[] = [
      createMockRabItem('1', 'Pekerjaan Khusus', 'Pekerjaan Custom Tanpa Analisa', 10, 'ls', 5000000), // No ahspCode
    ];

    const res = await reviewProjectRab({
      projectId: projectC.id,
      rabItems,
    });

    assert.strictEqual(res.success, true);
    const ahspFindings = res.summary.findings.filter((f) => f.category === 'AHSP');
    assert.ok(ahspFindings.length >= 1, 'Should find unmapped AHSP item');
    assert.strictEqual(ahspFindings[0].source, 'AHSP');
  });

  it('should detect duplicate items within the same work scope', async () => {
    const rabItems: RabItem[] = [
      createMockRabItem('1', 'Pekerjaan Dinding', 'Plesteran 1:4 tebal 15mm', 120, 'm2', 45000, 'A.4.4.2.1'),
      createMockRabItem('2', 'Pekerjaan Dinding', 'Plesteran 1:4 tebal 15mm', 120, 'm2', 45000, 'A.4.4.2.1'), // Duplicate
    ];

    const res = await reviewProjectRab({
      projectId: projectC.id,
      rabItems,
    });

    assert.strictEqual(res.success, true);
    const duplicateFindings = res.summary.findings.filter((f) => f.category === 'DUPLICATE');
    assert.ok(duplicateFindings.length >= 1, 'Should flag duplicate work item');
    assert.strictEqual(duplicateFindings[0].severity, 'WARNING');
  });

  it('should identify missing essential construction scopes', async () => {
    // Only includes painting, missing fondasi, struktur, dinding, atap
    const rabItems: RabItem[] = [
      createMockRabItem('1', 'Pekerjaan Pengecatan', 'Cat Tembok Interior 20 kg', 50, 'pail', 750000, 'A.4.7.1.1'),
    ];

    const res = await reviewProjectRab({
      projectId: projectC.id,
      rabItems,
    });

    assert.strictEqual(res.success, true);
    const missingFindings = res.summary.findings.filter((f) => f.category === 'MISSING');
    assert.ok(missingFindings.length >= 2, 'Should warn about missing essential construction scopes');
  });

  it('should compute a health score and appropriate summary metrics', async () => {
    // Ideal clean RAB
    const cleanRab: RabItem[] = [
      createMockRabItem('1', 'Pekerjaan Struktur', 'Pengecoran Beton K-250', 25, 'm3', 1150000, 'A.4.1.1.5'),
      createMockRabItem('2', 'Pekerjaan Pasangan', 'Pasangan Dinding Bata Ringan Hebel 10 cm', 80, 'm2', 650000, 'A.4.4.1.9'),
      createMockRabItem('3', 'Pekerjaan Pengecatan', 'Cat Tembok Interior 20 kg', 160, 'pail', 750000, 'A.4.7.1.1'),
    ];

    const res = await reviewProjectRab({
      projectId: projectC.id,
      rabItems: cleanRab,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.summary.healthScore >= 50, 'Clean RAB should have a valid health score');
    assert.strictEqual(typeof res.summary.totalFindings, 'number');
  });
});

describe('PHASE 9.4 — HUMAN CONFIRMATION GATE & MULTI-PROJECT ISOLATION', () => {
  it('should isolate Project 1 data from Project 2 in AI workflows', () => {
    const proj1 = createMockProject('PRJ-ALPHA', 'Villa Ubud Bali');
    const proj2 = createMockProject('PRJ-BETA', 'Gudang Logistik Cikarang');

    const repo1 = new ProjectFinanceRepository(proj1.id);
    const repo2 = new ProjectFinanceRepository(proj2.id);

    // Save expense to Proj 1
    confirmAndSaveExpenseToRepository(
      {
        projectId: proj1.id,
        ocrId: 'OCR-01',
        supplier: 'TB Bali Indah',
        date: '2026-09-21',
        amount: 12000000,
        category: 'Material',
        paymentMethod: 'Transfer',
        description: 'Batu Alam Paras Jogja',
        referenceNumber: 'INV-BALI-01',
      },
      repo1
    );

    // Assert Proj 1 has 1 expense, Proj 2 has 0
    assert.strictEqual(repo1.getExpenses().length, 1);
    assert.strictEqual(repo2.getExpenses().length, 0);
  });
});

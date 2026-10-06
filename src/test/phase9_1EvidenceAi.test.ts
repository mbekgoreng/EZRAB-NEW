/**
 * Phase 9.1 — EZRAB Evidence-Based AI & Anti-Hallucination Test Suite
 * 
 * CORE PRINCIPLE: NO SOURCE -> NO FACT
 * 
 * Validates:
 * 1. Anti-hallucination refusals (AI refuses to guess height, concrete grade, price, or area without source).
 * 2. Source-first factual answers with exact citations and provenance.
 * 3. Ambiguous/unlabeled floor plan handling (no fabricated room names).
 * 4. Receipt OCR validation and arithmetic mismatch warnings.
 * 5. Multi-project isolation in evidence retrieval.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectSourceInventory,
  queryFactInProjectSources,
  formatEvidenceCallout,
} from '../services/aiEvidenceService';
import { MockAiProvider } from '../services/aiProviderEngine';
import { analyzeDrawing } from '../services/aiDrawingIntelligence';
import { analyzeReceipt, matchItemWithMasterPrice } from '../services/aiReceiptIntelligence';
import { FullProjectAIContext } from '../services/aiContextService';
import { Project, RabItem } from '../types';

function createMockContext(projectOverride?: Partial<Project>, rabItems: RabItem[] = []): FullProjectAIContext {
  const defaultProject: Project = {
    id: 'PRJ-EVIDENCE-01',
    name: 'Proyek Villa Tropis Canggu',
    location: 'Bali',
    buildingType: 'Rumah Tinggal',
    budget: 800000000,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...projectOverride,
  } as unknown as Project;

  const totalRab = rabItems.reduce((acc, i) => acc + (i.volume * (i.unitPrice || 0)), 0);

  return {
    project: defaultProject,
    currentPage: 'magic-ai',
    rab: {
      totalRab,
      totalItems: rabItems.length,
      categories: [
        {
          name: 'Pekerjaan Utama',
          total: totalRab,
          weightPercent: 100,
          itemCount: rabItems.length,
          items: rabItems,
        },
      ],
      highestCostItem: rabItems[0] || null,
      topCostItems: rabItems,
      anomalyItems: [],
      missingVolumeItems: [],
    },
    curveS: {
      plannedProgress: 25,
      actualProgress: 20,
      deviation: -5,
      status: 'BEHIND_SCHEDULE',
      statusLabel: 'Deviasi -5%',
      totalWeeks: 12,
      currentWeek: 3,
      dataPoints: [],
    },
    schedule: {
      totalTasks: 8,
      completedTasks: [],
      activeTasks: [],
      pendingTasks: [],
      criticalTasks: [],
    },
    report: {
      projectName: defaultProject.name,
      clientName: 'Owner Proyek',
      location: defaultProject.location || 'Indonesia',
      currentDate: new Date().toISOString().split('T')[0],
      periodLabel: 'Minggu ke-3',
      actualProgress: 20,
      plannedProgress: 25,
      deviation: -5,
      totalCost: totalRab,
      completedWorks: [],
      activeWorks: [],
      upcomingWorks: [],
      potentialIssues: [],
    },
    timestamp: new Date().toISOString(),
  };
}

describe('PHASE 9.1 [1] — ANTI-HALLUCINATION REFUSALS (NO SOURCE -> NO FACT)', () => {
  const aiProvider = new MockAiProvider();

  it('should REFUSE to guess wall height when no drawing or parameter is available', async () => {
    // Project with NO height data
    const context = createMockContext();
    const fact = queryFactInProjectSources('TINGGI_DINDING', context);

    assert.strictEqual(fact.status, 'NOT_FOUND');
    assert.match(fact.answer, /tidak menemukan data tinggi dinding/i);
    assert.strictEqual(fact.confidence, 'LOW');

    // Test through chat interface
    const chatRes = await aiProvider.chat('Berapa tinggi dinding proyek ini?', context);
    assert.match(chatRes.content, /NOT FOUND|tidak menemukan data tinggi dinding/i);
    assert.doesNotMatch(chatRes.content, /\b3\.5\s*meter\b|\b3\s*meter\b/i, 'Must not hallucinate generic 3.5m height');
  });

  it('should REFUSE to guess concrete grade when no specification exists', async () => {
    // Project with no concrete specs
    const context = createMockContext();
    const fact = queryFactInProjectSources('MUTU_BETON', context);

    assert.strictEqual(fact.status, 'NOT_FOUND');
    assert.match(fact.answer, /tidak menemukan spesifikasi mutu beton/i);

    // Chat interface check
    const chatRes = await aiProvider.chat('Apa mutu beton yang digunakan?', context);
    assert.match(chatRes.content, /NOT FOUND|tidak menemukan spesifikasi mutu beton/i);
    assert.doesNotMatch(chatRes.content, /\bK-250\b|\bK-225\b|\bK-300\b/i, 'Must not hallucinate concrete grade');
  });

  it('should REFUSE to guess material prices for unlisted items', async () => {
    const context = createMockContext();
    const fact = queryFactInProjectSources('HARGA_MATERIAL', context, 'marmer_italia_carrara_super_langka');

    assert.strictEqual(fact.status, 'NOT_FOUND');
    assert.match(fact.answer, /tidak menemukan harga acuan/i);

    // Chat interface check
    const chatRes = await aiProvider.chat('Berapa harga semen di proyek ini?', context);
    // Semen exists in Master Price -> returns verified price
    assert.match(chatRes.content, /Semen Portland|Rp\s*62\.000/i);
  });

  it('should REFUSE to guess building area when absent from project sources', async () => {
    const context = createMockContext(); // No surfaceArea/buildingArea specified
    const fact = queryFactInProjectSources('LUAS_BANGUNAN', context);

    assert.strictEqual(fact.status, 'NOT_FOUND');
    assert.match(fact.answer, /tidak menemukan data luas bangunan/i);

    const chatRes = await aiProvider.chat('Berapa luas bangunan ini?', context);
    assert.match(chatRes.content, /NOT FOUND|tidak menemukan data luas bangunan/i);
    assert.doesNotMatch(chatRes.content, /\b120\s*m²\b|\b100\s*m²\b/i, 'Must not hallucinate generic 120m2 area');
  });
});

describe('PHASE 9.1 [2] — SOURCE-FIRST FACTUAL VERIFICATION WITH CITATION', () => {
  const aiProvider = new MockAiProvider();

  it('should extract VERIFIED building area with citation when present in Project Master', async () => {
    const context = createMockContext({
      ...({ buildingArea: 184.5 } as any),
    });

    const fact = queryFactInProjectSources('LUAS_BANGUNAN', context);
    assert.strictEqual(fact.status, 'VERIFIED');
    assert.match(fact.answer, /184\.5\s*m²/);
    assert.strictEqual(fact.source, 'Project Master Data');
    assert.strictEqual(fact.confidence, 'HIGH');

    const chatRes = await aiProvider.chat('Berapa luas bangunan proyek?', context);
    assert.match(chatRes.content, /184\.5\s*m²/);
    assert.match(chatRes.content, /Project Master Data/);
  });

  it('should extract DERIVED total RAB with calculation basis', async () => {
    const mockRabItems: RabItem[] = [
      { id: '1', category: 'Struktur', description: 'Pengecoran Beton K-250', volume: 10, unit: 'm3', unitPrice: 1100000, totalPrice: 11000000 } as unknown as RabItem,
      { id: '2', category: 'Dinding', description: 'Pasangan Bata Ringan', volume: 50, unit: 'm2', unitPrice: 150000, totalPrice: 7500000 } as unknown as RabItem,
    ];
    const context = createMockContext({}, mockRabItems);

    const fact = queryFactInProjectSources('TOTAL_BIAYA_RAB', context);
    assert.strictEqual(fact.status, 'DERIVED');
    assert.match(fact.answer, /18\.500\.000/);
    assert.strictEqual(fact.source, 'RAB Spreadsheet');
    assert.strictEqual(fact.confidence, 'HIGH');
  });

  it('should cite Master Price benchmark with exact provenance for standard materials', () => {
    const matched = matchItemWithMasterPrice('Semen Portland 50 kg', 62000);
    assert.ok(matched);
    assert.strictEqual(matched?.masterPrice, 62000);
    assert.strictEqual(matched?.masterItemName, 'Semen Portland 50 kg');
    assert.strictEqual(matched?.priceDifferencePercent, 0);
  });
});

describe('PHASE 9.1 [3] — BACA DENAH VISION & AMBIGUITY HANDLING', () => {
  it('should flag scale warning on drawing when scale ratio is unverified', async () => {
    const res = await analyzeDrawing({
      projectId: 'PRJ-DRAW-01',
      fileName: 'denah_tanpa_skala.jpg',
      fileData: 'dummy',
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.result?.scaleWarning, 'Must issue scale warning');
    assert.match(res.result?.scaleWarning || '', /skala/i);
  });

  it('should label rooms as Unlabeled Area without guessing names when drawing is ambiguous/blurry', async () => {
    const res = await analyzeDrawing({
      projectId: 'PRJ-DRAW-01',
      fileName: 'denah_buram_unclear.png',
      fileData: 'dummy',
    });

    assert.strictEqual(res.success, true);
    const spaces = res.result?.spaces || [];
    assert.ok(spaces.length > 0);

    // Verify room names do not hallucinate "Ruang Tamu"
    const firstRoom = spaces[0];
    assert.match(firstRoom.name, /Area\s+[A-Z]|Belum Terbaca/i);
    assert.strictEqual(firstRoom.confidence, 'LOW');
    assert.strictEqual(firstRoom.evidenceStatus, 'NOT_FOUND');
  });
});

describe('PHASE 9.1 [4] — BACA NOTA OCR & ARITHMETIC VALIDATION', () => {
  it('should flag UNREADABLE items and calculation discrepancy on damaged receipts', async () => {
    const res = await analyzeReceipt({
      projectId: 'PRJ-REC-01',
      fileName: 'nota_rusak_buram.jpg',
      fileData: 'dummy',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.result?.overallConfidence, 'LOW');
    assert.ok(res.result?.warnings && res.result.warnings.length > 0);

    const hasUnreadable = res.result?.lineItems.some((i) => i.description.includes('UNREADABLE'));
    assert.strictEqual(hasUnreadable, true, 'Damaged line item must be marked UNREADABLE');
  });
});

describe('PHASE 9.1 [5] — PROJECT SOURCE INVENTORY & ISOLATION', () => {
  it('should construct accurate source inventory without false positive availability', () => {
    const context = createMockContext();
    const inventory = buildProjectSourceInventory(context);

    assert.strictEqual(inventory.projectName, 'Proyek Villa Tropis Canggu');
    assert.strictEqual(inventory.hasRab, false);
    assert.strictEqual(inventory.hasMasterPrice, true);
    assert.ok(inventory.sources.length >= 7);

    const rabSource = inventory.sources.find((s) => s.type === 'rab');
    assert.strictEqual(rabSource?.isAvailable, false);
  });

  it('should format clean evidence callouts with appropriate status badges', () => {
    const verifiedCallout = formatEvidenceCallout({
      answer: 'Luas 200 m²',
      status: 'VERIFIED',
      source: 'DED Lantai 1',
      pageOrField: 'Halaman 3',
      basis: 'Dimensi 10m x 20m',
      confidence: 'HIGH',
    });

    assert.match(verifiedCallout, /VERIFIED/);
    assert.match(verifiedCallout, /DED Lantai 1/);

    const notFoundCallout = formatEvidenceCallout({
      answer: 'Data tidak ditemukan',
      status: 'NOT_FOUND',
      source: 'Tidak Ditemukan',
      confidence: 'LOW',
    });

    assert.match(notFoundCallout, /NOT FOUND/);
  });
});

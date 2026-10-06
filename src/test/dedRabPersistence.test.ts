/**
 * EZRAB DED -> RAB PERSISTENT ANALYSIS INTEGRATION TESTS
 *
 * Verifies end-to-end result persistence across:
 * 1. Component unmount & remount (navigation between EZRAB AI and Dashboard/Spreadsheet).
 * 2. Full page refresh & storage recovery (rehydration from local cache).
 * 3. Project isolation (Project A vs Project B data boundary).
 * 4. Incremental milestone persistence during pipeline execution.
 * 5. Atomic completion and fail-closed persistence guarantees.
 * 6. "Analisis Baru" active pointer reset without history loss.
 * 7. Spreadsheet RAB data synchronization and official item conversion.
 */

import {
  DedAnalysisPersistenceService,
  dedAnalysisPersistenceService,
  DurableDedAnalysis,
} from '../services/dedAnalysisPersistenceService';
import { dedRabReviewService } from '../ded-rab-v2/review/dedRabReviewService';
import { dedRabPipeline, PipelineExecutionOutput } from '../ded-rab-v2/pipeline/dedRabPipeline';
import { DedWorkItem } from '../ded-rab-v2/types';
import { RabItem } from '../types';

// =============================================================================
// MOCK DATA GENERATOR
// =============================================================================

function createMockWorkItems(projectId: string = 'PRJ-RUMAH-2LT-01'): DedWorkItem[] {
  return [
    {
      id: 'ITEM-FND-01',
      canonicalWorkId: 'WORK-FND-BATU-KALI',
      projectId,
      sourceDocumentId: 'DOC-DED-01',
      name: 'Pasangan Pondasi Batu Kali 1:4',
      category: 'FOUNDATION',
      status: 'CONFIRMED',
      sourceType: 'DED_VERIFIED',
      source: 'DED',
      quantity: 10.4,
      quantityStatus: 'CONFIRMED',
      evidenceIds: ['EVD-01'],
      sourcePages: [2],
      dimensions: {
        length: { value: 32.5, unit: 'm', isMissing: false },
        width: { value: 0.8, unit: 'm', isMissing: false },
        height: { value: 0.8, unit: 'm', isMissing: false },
      },
      geometry: { shape: 'TRAPEZOIDAL', notes: 'Pondasi batu belah menerus' },
      unit: 'm3',
      calculationInputs: { length: 32.5, width: 0.8, height: 0.8 },
      confidence: 0.98,
      assumptions: [],
      warnings: [],
      materialSpec: 'Batu belah kali, semen PC, pasir pasang',
      qto: {
        formula: 'length * ((topWidth + bottomWidth) / 2) * height',
        quantity: 10.4,
        unit: 'm3',
        status: 'CALCULATED',
        calculationBreakdown: '32.5 * ((0.4 + 0.8) / 2) * 0.8',
      },
      ahspMatch: {
        code: '2.2.2.1.6',
        name: 'Pemasangan 1 m3 Pondasi Batu Belah Campuran 1 SP : 4 PP',
        unit: 'm3',
        matchType: 'EXACT_MATCH',
        confidence: 0.99,
        source: 'STANDAR_PUPR_2026',
      },
      price: {
        unitPrice: 951200,
        totalPrice: 9892480,
        materialPrice: 650000,
        laborPrice: 280000,
        equipmentPrice: 21200,
        priceSource: 'OFFICIAL_AHSP',
        isOfficial: true,
        currency: 'IDR',
        components: [
          { type: 'MATERIAL', name: 'Batu Kali', unit: 'm3', coefficient: 1.2, unitPrice: 250000, totalPrice: 300000 },
          { type: 'LABOR', name: 'Tukang Batu', unit: 'OH', coefficient: 0.75, unitPrice: 150000, totalPrice: 112500 },
        ],
      },
      entityType: 'CONSTRUCTION_WORK',
      rabEligible: true,
      validationStatus: 'READY',
      quantitySource: 'DED_DIMENSION',
      userApproved: true,
    },
    {
      id: 'ITEM-STR-01',
      canonicalWorkId: 'WORK-STR-SLOOF-1520',
      projectId,
      sourceDocumentId: 'DOC-DED-01',
      name: 'Balok Sloof SL1 15/20 Beton K-225',
      category: 'STRUCTURE_BEAM',
      status: 'CONFIRMED',
      sourceType: 'DED_VERIFIED',
      source: 'DED',
      quantity: 0.975,
      quantityStatus: 'CONFIRMED',
      evidenceIds: ['EVD-02'],
      sourcePages: [3],
      dimensions: {
        length: { value: 32.5, unit: 'm', isMissing: false },
        width: { value: 0.15, unit: 'm', isMissing: false },
        height: { value: 0.2, unit: 'm', isMissing: false },
      },
      geometry: { shape: 'RECTANGULAR', notes: 'Sloof struktural keliling' },
      unit: 'm3',
      calculationInputs: { length: 32.5, width: 0.15, height: 0.2 },
      confidence: 0.97,
      assumptions: [],
      warnings: [],
      materialSpec: 'Beton K-225, besi tulangan ulir BjTS 420B, begel polos',
      qto: {
        formula: 'length * width * height',
        quantity: 0.975,
        unit: 'm3',
        status: 'CALCULATED',
        calculationBreakdown: '32.5 * 0.15 * 0.20',
      },
      ahspMatch: {
        code: '2.2.1.10.1',
        name: 'Pembuatan 1 m3 Balok Sloof Beton Bertulang (200 kg Besi + Bekisting)',
        unit: 'm3',
        matchType: 'EXACT_MATCH',
        confidence: 0.96,
        source: 'STANDAR_PUPR_2026',
      },
      price: {
        unitPrice: 5120000,
        totalPrice: 4992000,
        materialPrice: 3800000,
        laborPrice: 1100000,
        equipmentPrice: 220000,
        priceSource: 'OFFICIAL_AHSP',
        isOfficial: true,
        currency: 'IDR',
        components: [
          { type: 'MATERIAL', name: 'Beton K-225', unit: 'm3', coefficient: 1.02, unitPrice: 950000, totalPrice: 969000 },
          { type: 'LABOR', name: 'Tukang Besi', unit: 'OH', coefficient: 1.5, unitPrice: 160000, totalPrice: 240000 },
        ],
      },
      entityType: 'CONSTRUCTION_WORK',
      rabEligible: true,
      validationStatus: 'READY',
      quantitySource: 'DED_DIMENSION',
      userApproved: true,
    },
    {
      id: 'ITEM-WAL-01',
      canonicalWorkId: 'WORK-WAL-BATA-14',
      projectId,
      sourceDocumentId: 'DOC-DED-01',
      name: 'Dinding Bata Merah 1:4 Tebal 1/2 Bata',
      category: 'WALL',
      status: 'CONFIRMED',
      sourceType: 'DED_VERIFIED',
      source: 'DED',
      quantity: 142.5,
      quantityStatus: 'CONFIRMED',
      evidenceIds: ['EVD-03'],
      sourcePages: [4],
      dimensions: {
        length: { value: 38.0, unit: 'm', isMissing: false },
        height: { value: 3.75, unit: 'm', isMissing: false },
      },
      geometry: { shape: 'POLYGONAL', notes: 'Dinding pasangan keliling netto' },
      unit: 'm2',
      calculationInputs: { length: 38.0, height: 3.75 },
      confidence: 0.95,
      assumptions: [],
      warnings: [],
      materialSpec: 'Bata merah oven, semen PC, pasir pasang',
      qto: {
        formula: 'grossArea - openingDeductions',
        quantity: 142.5,
        unit: 'm2',
        status: 'CALCULATED',
        calculationBreakdown: '160.0 - 17.5 m2 bukaan pintu/jendela',
      },
      ahspMatch: {
        code: '3.6.1.8',
        name: 'Pemasangan 1 m2 Dinding Bata Merah Tebal 1/2 Bata Campuran 1 SP : 4 PP',
        unit: 'm2',
        matchType: 'EXACT_MATCH',
        confidence: 0.98,
        source: 'STANDAR_PUPR_2026',
      },
      price: {
        unitPrice: 148500,
        totalPrice: 21161250,
        materialPrice: 105000,
        laborPrice: 42000,
        equipmentPrice: 1500,
        priceSource: 'OFFICIAL_AHSP',
        isOfficial: true,
        currency: 'IDR',
        components: [
          { type: 'MATERIAL', name: 'Bata Merah', unit: 'bh', coefficient: 70, unitPrice: 1200, totalPrice: 84000 },
          { type: 'LABOR', name: 'Tukang Pasang', unit: 'OH', coefficient: 0.2, unitPrice: 150000, totalPrice: 30000 },
        ],
      },
      entityType: 'CONSTRUCTION_WORK',
      rabEligible: true,
      validationStatus: 'READY',
      quantitySource: 'DED_DIMENSION',
      userApproved: true,
    },
  ];
}

function createMockExecutionOutput(projectId: string): PipelineExecutionOutput {
  const items = createMockWorkItems(projectId);
  const summary = dedRabReviewService.computeReviewSummary(items);

  return {
    success: true,
    jobId: `JOB-${Date.now().toString(36)}`,
    projectId,
    mode: 'STANDARD',
    sourceDocuments: [
      {
        id: `DOC-DED-${projectId}`,
        projectId,
        fileName: 'PRJ-RUMAH-2LT-01_DED.pdf',
        mimeType: 'application/pdf',
        fileSize: 1048576,
        sha256: 'a1b2c3d4e5f6789012345678abcdef01',
        pageCount: 4,
        createdAt: new Date().toISOString(),
        status: 'READY' as any,
        pages: [
          { id: 'p1', documentId: `DOC-DED-${projectId}`, pageNumber: 1, width: 1200, height: 800, imageDataUrl: 'data:image/png;base64,mock', drawingType: 'COVER' as any, scaleVerified: true, status: 'PROCESSED' as any },
          { id: 'p2', documentId: `DOC-DED-${projectId}`, pageNumber: 2, width: 1200, height: 800, imageDataUrl: 'data:image/png;base64,mock', drawingType: 'FLOOR_PLAN' as any, scaleVerified: true, status: 'PROCESSED' as any },
          { id: 'p3', documentId: `DOC-DED-${projectId}`, pageNumber: 3, width: 1200, height: 800, imageDataUrl: 'data:image/png;base64,mock', drawingType: 'STRUCTURAL' as any, scaleVerified: true, status: 'PROCESSED' as any },
          { id: 'p4', documentId: `DOC-DED-${projectId}`, pageNumber: 4, width: 1200, height: 800, imageDataUrl: 'data:image/png;base64,mock', drawingType: 'ARCHITECTURAL' as any, scaleVerified: true, status: 'PROCESSED' as any },
        ],
      },
    ] as any,
    workItems: items,
    evidences: [
      {
        id: 'EVD-01',
        sourceDocumentId: `DOC-DED-${projectId}`,
        sourceFileName: 'PRJ-RUMAH-2LT-01_DED.pdf',
        pageNumber: 2,
        type: 'SPECIFICATION' as const,
        content: 'Pondasi Batu Kali 1:4 panjang 32.50m',
        confidence: 0.99,
      },
    ] as any,
    reviewSummary: summary,
    diagnostics: {
      stage: 'COMPLETED',
      jobId: `JOB-${projectId}`,
      status: 'COMPLETED',
      message: 'Analisis DED selesai.',
      renderedPages: 4,
      pagesAnalyzed: 4,
      aiRequests: 4,
      aiSuccessful: 4,
      aiFailed: 0,
      evidenceCount: 3,
      dedItemCount: 3,
      durationMs: 4200,
      aiModel: 'gemini-1.5-pro',
    } as any,
    modelLabel: 'Gemini 1.5 Pro',
    sourceHash: 'sha256:a1b2c3d4e5f6',
    resultHash: 'resHash:778899aabb',
    executedAt: new Date().toISOString(),
    canonicalDataset: {
      projectId,
      inventory: items.map((it) => ({
        id: it.id,
        name: it.name,
        category: it.category,
        discipline: 'STRUCTURE' as const,
        specification: it.materialSpec || '',
        status: it.status,
        unit: it.unit,
        sourcePages: it.sourcePages,
        evidenceIds: it.evidenceIds,
      })),
      relations: [],
      invariants: [],
      metadata: { generatedAt: new Date().toISOString(), version: '2.0', sourceHash: 'h0' },
    },
  };
}

// =============================================================================
// TEST SUITE EXECUTION
// =============================================================================

async function runDedRabPersistenceTests() {
  console.log('====================================================================');
  console.log('EZRAB DED → RAB PERSISTENCE INTEGRATION VERIFICATION SUITE');
  console.log('====================================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      failedCount++;
    }
  }

  const service = DedAnalysisPersistenceService.getInstance();
  const projectA = 'PRJ-RUMAH-2LT-01';
  const projectB = 'PRJ-GEDUNG-KANTOR-02';

  // ---------------------------------------------------------------------------
  // 1. INCREMENTAL MILESTONE PERSISTENCE
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. Testing Incremental Pipeline Milestones ---');
  const sessionAId = `DED-RAB-${projectA}-RUN-001`;

  const m1 = await service.saveMilestone({
    analysisId: sessionAId,
    projectId: projectA,
    stage: 'RENDERING',
    progress: 25,
    message: 'Merender 4 lembar DED...',
    pagesProcessed: 4,
  });
  assert(m1.current_stage === 'RENDERING' && m1.progress === 25, 'Milestone RENDERING (25%) recorded');

  const m2 = await service.saveMilestone({
    analysisId: sessionAId,
    projectId: projectA,
    stage: 'MATCHING_AHSP',
    progress: 90,
    message: 'Pencocokan AHSP PUPR 2026...',
    pagesProcessed: 4,
  });
  assert(m2.current_stage === 'MATCHING_AHSP' && m2.progress === 90, 'Milestone MATCHING_AHSP (90%) updated');

  // Verify milestone query reflects current active progress
  const activeMilestone = await service.getLatestAnalysis(projectA);
  assert(
    activeMilestone !== null && activeMilestone.progress === 90 && activeMilestone.current_stage === 'MATCHING_AHSP',
    'Query getLatestAnalysis returns latest active milestone',
    `got ${activeMilestone?.progress}% ${activeMilestone?.current_stage}`
  );

  // ---------------------------------------------------------------------------
  // 2. ATOMIC COMPLETION PERSISTENCE
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Testing Atomic Completion Persistence ---');
  const mockOutputA = createMockExecutionOutput(projectA);

  const completedA = await service.persistCompleteResult({
    analysisId: sessionAId,
    projectId: projectA,
    output: mockOutputA,
  });

  assert(completedA.status === 'COMPLETED', 'Status transitioned to COMPLETED');
  assert(completedA.progress === 100, 'Progress marked 100%');
  assert(Boolean(completedA.work_items && completedA.work_items.length === 3), 'All 3 work items persisted');
  assert(completedA.execution_output !== undefined, 'Full PipelineExecutionOutput retained');
  assert(completedA.review_summary?.totalItemsFound === 3, 'Review summary total items matches 3');
  assert(
    (completedA.review_summary?.totalEstimatedRab || 0) > 0,
    'Review summary estimated RAB total is non-zero'
  );

  // ---------------------------------------------------------------------------
  // 3. UNMOUNT & REMOUNT SURVIVAL
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing Component Unmount & Remount Survival ---');
  // Simulating user leaving EZRAB AI and returning:
  // Component unmounts, later remounts and calls getLatestAnalysis
  const hydratedA = await service.getLatestAnalysis(projectA);

  assert(hydratedA !== null, 'Persisted session recovered on remount');
  assert(hydratedA?.id === sessionAId, 'Session ID matches exactly');
  assert(hydratedA?.status === 'COMPLETED', 'Recovered status is COMPLETED');
  assert(Boolean(hydratedA?.work_items && hydratedA.work_items.length === 3), 'Work items preserved intact across unmount');
  assert(hydratedA?.work_items?.[0]?.ahspMatch?.code === '2.2.2.1.6', 'Item 1 AHSP code preserved (2.2.2.1.6)');
  assert(hydratedA?.work_items?.[1]?.ahspMatch?.code === '2.2.1.10.1', 'Item 2 AHSP code preserved (2.2.1.10.1)');
  assert(hydratedA?.work_items?.[2]?.ahspMatch?.code === '3.6.1.8', 'Item 3 AHSP code preserved (3.6.1.8)');

  // ---------------------------------------------------------------------------
  // 4. BROWSER REFRESH & MEMORY WIPE RECOVERY
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Testing Browser Refresh / Memory Wipe Recovery ---');
  // Simulating F5 browser refresh: In-memory singleton reset
  DedAnalysisPersistenceService.resetInstance();
  const refreshedService = DedAnalysisPersistenceService.getInstance();

  const refreshedA = await refreshedService.getLatestAnalysis(projectA);
  assert(refreshedA !== null, 'Analysis survived full browser refresh simulation');
  assert(Boolean(refreshedA?.work_items && refreshedA.work_items.length === 3), 'All work items survive refresh via persistent local recovery cache');
  assert(refreshedA?.status === 'COMPLETED', 'Status remains COMPLETED after refresh');

  // ---------------------------------------------------------------------------
  // 5. PROJECT ISOLATION (PROJECT A vs PROJECT B)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Testing Multi-Project Isolation ---');
  // Query Project B before it has any analyses:
  const projectBBefore = await refreshedService.getLatestAnalysis(projectB);
  assert(projectBBefore === null, 'Project B has NO analysis (Zero data leakage from Project A)');

  // Now create and complete an analysis for Project B
  const sessionBId = `DED-RAB-${projectB}-RUN-002`;
  const mockOutputB = createMockExecutionOutput(projectB);
  // Modify one item in Project B to verify distinct values
  mockOutputB.workItems = [mockOutputB.workItems[0]]; // Only 1 item

  await refreshedService.persistCompleteResult({
    analysisId: sessionBId,
    projectId: projectB,
    output: mockOutputB,
  });

  // Verify Project B has its own distinct result
  const projectBAfter = await refreshedService.getLatestAnalysis(projectB);
  assert(projectBAfter !== null && projectBAfter.id === sessionBId, 'Project B has its own active session');
  assert(Boolean(projectBAfter?.work_items && projectBAfter.work_items.length === 1), 'Project B has 1 work item');

  // Verify Project A was NOT mutated or contaminated by Project B
  const projectACheck = await refreshedService.getLatestAnalysis(projectA);
  assert(projectACheck !== null && projectACheck.id === sessionAId, 'Project A remained completely isolated');
  assert(Boolean(projectACheck?.work_items && projectACheck.work_items.length === 3), 'Project A retains all 3 items (No collision)');

  // ---------------------------------------------------------------------------
  // 6. ACTIVE POINTER RESET ("ANALISIS BARU")
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Testing Active Pointer Reset (Analisis Baru) ---');
  // User clicks "Analisis Baru" on Project A:
  refreshedService.clearActiveAnalysis(projectA);

  const clearedActive = await refreshedService.getLatestAnalysis(projectA);
  assert(clearedActive === null, 'Active analysis is null after Analisis Baru clear (upload prompt displayed)');
  // Verify that history list is still preserved
  const historyList = await refreshedService.listAnalyses(projectA);
  assert(historyList.length >= 1, 'Historical analysis preserved in history log even after active pointer clear');
  assert(historyList[0].id === sessionAId, 'Historical record matches sessionAId');

  // ---------------------------------------------------------------------------
  // 7. SPREADSHEET RAB CONVERSION AND COMPATIBILITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Testing Spreadsheet RAB Compatibility & Conversion ---');
  const officialRabItems = dedRabReviewService.convertToOfficialRabItems(mockOutputA.workItems, projectA);

  assert(officialRabItems.length === 3, 'All 3 items converted to official RabItem format');
  assert(officialRabItems[0].code === '2.2.2.1.6', 'RabItem 1 code matches AHSP 2.2.2.1.6');
  assert(officialRabItems[0].volume === 10.4, 'RabItem 1 volume matches 10.4');
  assert(officialRabItems[0].unit === 'm3', 'RabItem 1 unit matches m3');
  assert(officialRabItems[0].unitPrice === 951200, 'RabItem 1 unit price matches Rp 951.200');
  assert(officialRabItems[0].amount === 9892480, 'RabItem 1 total amount matches Rp 9.892.480');
  assert(officialRabItems[0].category === 'Pekerjaan Pondasi & Tanah', 'RabItem 1 categorized to proper WBS section');

  assert(officialRabItems[1].code === '2.2.1.10.1', 'RabItem 2 code matches AHSP 2.2.1.10.1');
  assert(officialRabItems[1].category === 'Pekerjaan Struktur Beton Bertulang', 'RabItem 2 categorized to proper WBS section');

  assert(officialRabItems[2].code === '3.6.1.8', 'RabItem 3 code matches AHSP 3.6.1.8');
  assert(officialRabItems[2].category === 'Pekerjaan Dinding & Plesteran', 'RabItem 3 categorized to proper WBS section');

  // ---------------------------------------------------------------------------
  // FINAL SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log('====================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runDedRabPersistenceTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

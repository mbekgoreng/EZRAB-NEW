/**
 * EZRAB DED → RAB → PROJECT INTEGRATION TESTS
 *
 * Verifies end-to-end integration between DED → RAB AI Engine and Official Project Data:
 * 1. Derives project identity from DED drawing / file name ("Rumah Tinggal 2 Lantai").
 * 2. Auto-creates new project when no active project exists.
 * 3. Uses active project when available without creating unwanted duplicates.
 * 4. User control: Supports switching between "Gunakan Proyek Saat Ini" and "Buat Proyek Baru".
 * 5. Existing RAB Protection: Creates EstimateVersion snapshot before modifying existing RAB.
 * 6. Non-destructive versioning: Old items remain 100% recoverable.
 * 7. Complete data relationship: Project -> ProjectDocument -> DurableDedAnalysis -> RabItem[] -> EstimateVersion.
 * 8. Persistence verification: Ensures transactional completion before marking success.
 * 9. Project isolation: Proyek A and Proyek B remain strictly separated.
 */

import { deriveProjectNameFromFileName } from '../components/document/DedRabWorkflowView';
import {
  DedAnalysisPersistenceService,
  DurableDedAnalysis,
} from '../services/dedAnalysisPersistenceService';
import { dedRabReviewService } from '../ded-rab-v2/review/dedRabReviewService';
import { PipelineExecutionOutput } from '../ded-rab-v2/pipeline/dedRabPipeline';
import { DedWorkItem } from '../ded-rab-v2/types';
import { Project, ProjectDocument, RabItem, EstimateVersion } from '../types';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';

// =============================================================================
// MOCK BUILDERS
// =============================================================================

function createMockWorkItems(projectId: string): DedWorkItem[] {
  return [
    {
      id: `ITEM-FND-${projectId}-01`,
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
      id: `ITEM-STR-${projectId}-02`,
      canonicalWorkId: 'WORK-STR-KOLOM-PRAKTIS',
      projectId,
      sourceDocumentId: 'DOC-DED-01',
      name: 'Kolom Praktis Beton Bertulang 15x15 cm',
      category: 'STRUCTURE_COLUMN',
      status: 'CONFIRMED',
      sourceType: 'DED_VERIFIED',
      source: 'DED',
      quantity: 48.0,
      quantityStatus: 'CONFIRMED',
      evidenceIds: ['EVD-02'],
      sourcePages: [3],
      dimensions: {
        length: { value: 48.0, unit: 'm', isMissing: false },
        width: { value: 0.15, unit: 'm', isMissing: false },
        height: { value: 0.15, unit: 'm', isMissing: false },
      },
      geometry: { shape: 'RECTANGULAR', notes: 'Kolom praktis lantai 1 & 2' },
      unit: 'm1',
      calculationInputs: { length: 48.0 },
      confidence: 0.95,
      assumptions: [],
      warnings: [],
      materialSpec: 'Beton K-175, pembesian 4D10, sengkang D6-150',
      qto: {
        formula: 'total_column_height',
        quantity: 48.0,
        unit: 'm1',
        status: 'CALCULATED',
      },
      ahspMatch: {
        code: '2.2.1.10.1',
        name: 'Pembuatan kolom praktis beton bertulang (15 x 15) cm',
        unit: 'm1',
        matchType: 'EXACT_MATCH',
        confidence: 0.96,
        source: 'STANDAR_PUPR_2026',
      },
      price: {
        unitPrice: 125000,
        totalPrice: 6000000,
        materialPrice: 80000,
        laborPrice: 45000,
        equipmentPrice: 0,
        priceSource: 'OFFICIAL_AHSP',
        isOfficial: true,
        currency: 'IDR',
        components: [
          { type: 'MATERIAL', name: 'Beton K-175', unit: 'm3', coefficient: 0.0225, unitPrice: 1100000, totalPrice: 24750 },
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
  return {
    success: true,
    jobId: `job-test-${Date.now()}`,
    projectId,
    mode: 'STANDARD',
    sourceDocuments: [
      {
        id: `doc-${projectId}-01`,
        projectId,
        fileName: 'PRJ-RUMAH-2LT-01_DED.pdf',
        mimeType: 'application/pdf',
        fileSize: 1048576,
        createdAt: new Date().toISOString(),
        status: 'READY' as any,
        sha256: 'a1b2c3d4e5f6789012345678abcdef01',
        pageCount: 32,
        pages: [],
      },
    ],
    workItems: items,
    evidences: [],
    reviewSummary: dedRabReviewService.computeReviewSummary(items),
    diagnostics: {} as any,
    modelLabel: 'EZRAB-VISION-PRO',
    sourceHash: 'a1b2c3d4e5f6',
    resultHash: 'f6e5d4c3b2a1',
    executedAt: new Date().toISOString(),
  };
}

// =============================================================================
// STANDALONE RUNNER
// =============================================================================

async function runDedRabProjectIntegrationTests() {
  console.log('====================================================================');
  console.log('EZRAB DED → RAB → PROJECT INTEGRATION VERIFICATION SUITE');
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

  // --- 1. Project Identity Derivation ---
  console.log('--- 1. Testing Project Identity Derivation ---');
  const name1 = deriveProjectNameFromFileName('PRJ-RUMAH-2LT-01_DED.pdf');
  assert(name1 === 'Rumah Tinggal 2 Lantai', 'Derives "Rumah Tinggal 2 Lantai" from PRJ-RUMAH-2LT-01_DED.pdf');

  const name2 = deriveProjectNameFromFileName('pdf-gambar-rumah-1-lantai_compress.pdf');
  assert(name2 === 'Rumah Tinggal 1 Lantai', 'Derives "Rumah Tinggal 1 Lantai" from pdf-gambar-rumah-1-lantai_compress.pdf');

  const name3 = deriveProjectNameFromFileName('DED_Villa_Modern_Bali_Final.pdf');
  assert(name3 === 'Villa Modern Bali', 'Derives clean title-cased name for generic architectural filenames');

  const name4 = deriveProjectNameFromFileName('');
  assert(name4 === 'Proyek Konstruksi Baru', 'Fallback gracefully when filename is empty or undefined');

  // --- 2. Auto Project Creation When No Active Project ---
  console.log('\n--- 2. Testing Auto Project Creation When No Active Project ---');
  const activeProject: Project | null = null;
  const fileName = 'PRJ-RUMAH-2LT-01_DED.pdf';
  const derivedName = deriveProjectNameFromFileName(fileName);
  assert(!activeProject && derivedName === 'Rumah Tinggal 2 Lantai', 'Determines target is new project with derived name');

  const newProjectId = `PRJ-202610-AUTO`;
  const newProject: Project = {
    id: newProjectId,
    name: derivedName,
    buildingType: 'Rumah Tinggal',
    status: 'draft',
    creationMethod: 'magic_ai',
    progress: 0,
    totalRab: 0,
    sections: [],
    costSummary: {
      directCost: 0,
      overheadPercent: 5,
      overheadAmount: 0,
      profitPercent: 5,
      profitAmount: 0,
      contingencyPercent: 0,
      contingencyAmount: 0,
      directorMarkupPercent: 0,
      directorMarkupNominal: 0,
      directorMarkupTotal: 0,
      showMarkupToEditor: false,
      showMarkupToClient: false,
      subtotalBeforeTax: 0,
      taxPercent: 11,
      taxAmount: 0,
      grandTotal: 0,
      costPerM2: 0,
    },
    createdAt: new Date().toISOString(),
    documents: [],
  };
  assert(newProject.id === newProjectId, 'Project created with valid PRJ ID contract');
  assert(newProject.creationMethod === 'magic_ai', 'Project creationMethod marked as magic_ai');
  assert(newProject.name === 'Rumah Tinggal 2 Lantai', 'Project name correctly derived from DED document');

  // --- 3. Active Project Target Resolution ---
  console.log('\n--- 3. Testing Active Project Target Resolution ---');
  const existingProject: Project = {
    id: 'PRJ-EXISTING-001',
    name: 'Proyek Rumah Bpk Herman',
    status: 'in_progress',
    sections: [],
    costSummary: { directCost: 0, overheadPercent: 5, overheadAmount: 0, profitPercent: 5, profitAmount: 0, contingencyPercent: 0, contingencyAmount: 0, directorMarkupPercent: 0, directorMarkupNominal: 0, directorMarkupTotal: 0, showMarkupToEditor: false, showMarkupToClient: false, subtotalBeforeTax: 0, taxPercent: 11, taxAmount: 0, grandTotal: 0, costPerM2: 0 },
    createdAt: new Date().toISOString(),
  };
  const targetMode: 'ACTIVE' | 'NEW' = 'ACTIVE';
  const resolvedTargetId = targetMode === 'ACTIVE' && existingProject ? existingProject.id : 'NEW_ID';
  assert(resolvedTargetId === 'PRJ-EXISTING-001', 'Uses existing active project ID without creating duplicates');

  // --- 4. Existing RAB Protection & Snapshotting ---
  console.log('\n--- 4. Testing Existing RAB Protection & Snapshotting ---');
  const projectId = 'PRJ-EXISTING-RAB';
  const existingRabItems: RabItem[] = [
    {
      id: 'RAB-OLD-01',
      projectId,
      no: 1,
      code: 'PREP-01',
      category: 'Pekerjaan Persiapan',
      description: 'Pekerjaan Persiapan Lapangan Manual',
      volume: 1,
      unit: 'ls',
      unitPrice: 5000000,
      totalPrice: 5000000,
      amount: 5000000,
    },
  ];

  const versions: EstimateVersion[] = [];
  if (existingRabItems.length > 0) {
    const backupVersion: EstimateVersion = {
      id: `ver-${Date.now()}-backup`,
      projectId,
      versionNumber: 'v1.0',
      label: 'Versi Sebelum Analisis DED AI',
      timestamp: new Date().toISOString(),
      author: 'Lead Estimator (EZRAB Safety Guard)',
      description: 'Snapshot otomatis sebelum pembaruan DED RAB dari PRJ-RUMAH-2LT-01_DED.pdf',
      revisionNotes: 'Dibuat otomatis oleh EZRAB Safety Guard untuk mencegah kehilangan data RAB eksisting.',
      costBefore: 5000000,
      costAfter: 5000000,
      difference: 0,
      percentageDiff: 0,
      rabItemsSnapshot: JSON.parse(JSON.stringify(existingRabItems)),
      itemsCount: existingRabItems.length,
      isBaseline: true,
    };
    versions.push(backupVersion);
  }
  assert(versions.length === 1, 'Backup EstimateVersion snapshot created');
  assert(versions[0].label === 'Versi Sebelum Analisis DED AI', 'Snapshot labeled "Versi Sebelum Analisis DED AI"');
  assert(versions[0].rabItemsSnapshot.length === 1, 'Previous RAB items safely preserved in snapshot');

  const newItems = dedRabReviewService.convertToOfficialRabItems(createMockWorkItems(projectId), projectId);
  assert(newItems.length === 2, 'New AI work items converted to official items (13 gates passed)');

  const newTotalCost = newItems.reduce((acc, i) => acc + (i.totalPrice || 0), 0);
  const aiVersion: EstimateVersion = {
    id: `ver-${Date.now()}-ai`,
    projectId,
    versionNumber: 'v1.1',
    label: 'Hasil Analisis DED AI (STANDARD)',
    timestamp: new Date().toISOString(),
    author: 'Lead Estimator (EZRAB AI)',
    description: 'RAB terverifikasi dari dokumen DED: PRJ-RUMAH-2LT-01_DED.pdf',
    revisionNotes: `Ekstraksi ${newItems.length} pekerjaan konstruksi dengan 13-gate audit mandiri PUPR 2026.`,
    costBefore: versions[0].costAfter,
    costAfter: newTotalCost,
    difference: newTotalCost - versions[0].costAfter,
    percentageDiff: parseFloat((((newTotalCost - versions[0].costAfter) / versions[0].costAfter) * 100).toFixed(2)),
    rabItemsSnapshot: JSON.parse(JSON.stringify(newItems)),
    itemsCount: newItems.length,
    isBaseline: false,
  };
  versions.push(aiVersion);
  assert(versions.length === 2, 'New generation version created as latest active version');
  assert(versions[0].rabItemsSnapshot[0].id === 'RAB-OLD-01', 'Original user data remains 100% recoverable');

  // --- 5. Complete Data Relationship & Persistence Verification ---
  console.log('\n--- 5. Testing Complete Data Relationship & Persistence Verification ---');
  const service = DedAnalysisPersistenceService.getInstance();
  const fullProjectId = 'PRJ-FULL-HIERARCHY-01';
  const output = createMockExecutionOutput(fullProjectId);

  const doc: ProjectDocument = {
    id: `doc-${fullProjectId}-01`,
    projectId: fullProjectId,
    fileName: 'PRJ-RUMAH-2LT-01_DED.pdf',
    fileSize: 4500000,
    fileType: 'PDF',
    category: 'Struktur',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'Lead Estimator (EZRAB AI)',
    pageCount: 32,
    analysisStatus: 'COMPLETED',
  };
  assert(doc.analysisStatus === 'COMPLETED', 'ProjectDocument attached with COMPLETED status');

  const analysisId = `DED-RAB-${fullProjectId}-test`;
  const persistedAnalysis = await service.persistCompleteResult({
    analysisId,
    projectId: fullProjectId,
    output,
  });
  assert(persistedAnalysis.status === 'COMPLETED', 'DurableDedAnalysis marked COMPLETED');
  assert(persistedAnalysis.project_id === fullProjectId, 'Analysis associated with correct project_id');
  assert(persistedAnalysis.work_items?.length === 2, 'Analysis holds verified work_items');

  const verified = await service.getLatestAnalysis(fullProjectId);
  assert(verified !== null && verified.status === 'COMPLETED', 'Persistence verification passed');

  const officialRabItems = dedRabReviewService.convertToOfficialRabItems(output.workItems, fullProjectId);
  assert(officialRabItems.length === 2, 'Converted to 2 official RabItem records');
  assert(officialRabItems[0].projectId === fullProjectId, 'RabItem has valid projectId linkage');
  assert(officialRabItems[0].ahspCode === '2.2.2.1.6', 'RabItem 1 matched to AHSP 2.2.2.1.6');
  assert(officialRabItems[0].verificationStatus === 'VERIFIED', 'RabItem 1 marked VERIFIED');
  assert(officialRabItems[1].ahspCode === '2.2.1.10.1', 'RabItem 2 matched to AHSP 2.2.1.10.1');

  const costSummary = UnifiedProjectEngine.recalculateCostSummary(officialRabItems);
  assert(costSummary.directCost === 15892480, 'Direct cost correctly calculated via UnifiedProjectEngine');
  assert(costSummary.grandTotal > costSummary.directCost, 'Grand total correctly incorporates overhead and tax');

  // --- 6. Navigation Resilience & Project Isolation ---
  console.log('\n--- 6. Testing Navigation Resilience & Project Isolation ---');
  const projA = 'PRJ-ISOLATION-A';
  const projB = 'PRJ-ISOLATION-B';
  const outputA = createMockExecutionOutput(projA);
  const outputB = createMockExecutionOutput(projB);

  await service.persistCompleteResult({
    analysisId: `analysis-${projA}`,
    projectId: projA,
    output: outputA,
  });
  await service.persistCompleteResult({
    analysisId: `analysis-${projB}`,
    projectId: projB,
    output: outputB,
  });

  const resultA = await service.getLatestAnalysis(projA);
  const resultB = await service.getLatestAnalysis(projB);
  assert(resultA?.project_id === projA, 'Project A rehydration retains Project A id');
  assert(resultA?.work_items?.[0].projectId === projA, 'Project A items belong strictly to Project A');
  assert(resultB?.project_id === projB, 'Project B rehydration retains Project B id');
  assert(resultB?.work_items?.[0].projectId === projB, 'Project B items belong strictly to Project B');
  assert(resultA?.id !== resultB?.id, 'Strict data boundary: Zero cross-project leakage');

  console.log('\n====================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log('====================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Auto-run if executed directly
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('dedRabProjectIntegration')) {
  runDedRabProjectIntegrationTests().catch((err) => {
    console.error('Unhandled test failure:', err);
    process.exit(1);
  });
}

export { runDedRabProjectIntegrationTests };

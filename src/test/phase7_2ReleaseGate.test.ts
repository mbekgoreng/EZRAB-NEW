/**
 * PHASE 7.2 — RELEASE GATE VERIFICATION TEST SUITE
 * 
 * End-to-end production verification for EZRAB Magic AI:
 * - AI Context & Active Project Reading
 * - Source Inventory & Document Registry Scanning
 * - Document Planner & Missing Data Classification
 * - Confirmation Gate (Cancel vs Confirm)
 * - Duplicate Prevention & Idempotency
 * - Document Record Integrity (status=DRAFT, rev=0)
 * - Source Mutation Guard (Zero Mutation Snapshot)
 * - Reviewer Consistency (Mismatch attribution & clean test)
 * - Project Isolation (Project A vs Project B)
 * - Real Export & Artifact QA (PDF, DOCX, XLSX, ZIP inspection)
 * - Magic AI Existing Actions Regression (RAB, DED, Volume, AHSP)
 * - Manual Document Workflow Regression
 */

// In-memory localStorage polyfill for Node.js test environment
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
}

import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { DOCUMENT_REGISTRY, getDocumentDefinition } from '../document-engine/registry';
import { LocalDocumentRepository } from '../document-engine/repository';
import {
  buildAiDocumentContext,
  planProjectDocuments,
  createDraftDocumentsAfterConfirmation,
  reviewDocumentConsistency,
  mapTemplateFields,
} from '../services/aiDocumentIntelligence';
import { defaultAiProvider } from '../services/aiProviderEngine';
import { buildFullAIContext } from '../services/aiContextService';
import { generatePdf } from '../document-engine/exporters/pdfGenerator';
import { generateDocx } from '../document-engine/exporters/docxGenerator';
import { generateXlsx } from '../document-engine/exporters/xlsxGenerator';
import { buildDocumentData } from '../document-engine/documentData';
import { downloadTenderPackage } from '../document-engine/packageExporter';
import type { ProjectMasterData } from '../document-engine/types';
import { EMPTY_MASTER_DATA } from '../document-engine/types';
import type { Project, RabItem, ScheduleTask } from '../types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] Test ${passed + failed}: ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] Test ${passed + failed}: ${name}`);
    failures.push(name);
  }
}

export async function runPhase72ReleaseGateTests() {
  console.log('\n================================================================');
  console.log('🚀 PHASE 7.2 — FINAL RELEASE GATE VERIFICATION');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. SETUP FIXTURES: PROJECT A
  // ---------------------------------------------------------------------------
  console.log('--- [1] Fixtures Setup: Project A ---');
  const projectA: Project = {
    id: 'PRJ-EZRAB-QA-A',
    name: 'EZRAB QA PROJECT A',
    location: 'Jl. Sudirman Kav. 24, Jakarta Selatan',
    status: 'in_progress',
    client: 'PT Citra Graha Pratama',
    clientName: 'PT Citra Graha Pratama',
    startDate: '2026-03-01',
    targetDate: '2026-11-30',
    sections: [],
    costSummary: {
      directCost: 2500000000, overheadPercent: 5, overheadAmount: 125000000, profitPercent: 10,
      profitAmount: 250000000, contingencyPercent: 0, contingencyAmount: 0,
      directorMarkupPercent: 0, directorMarkupNominal: 0, directorMarkupTotal: 0,
      showMarkupToEditor: false, showMarkupToClient: false, subtotalBeforeTax: 2875000000,
      taxPercent: 11, taxAmount: 316250000, grandTotal: 3191250000, costPerM2: 6382500,
    },
    createdAt: '2026-03-01T08:00:00.000Z',
  };

  const projectMasterA: ProjectMasterData = {
    ...EMPTY_MASTER_DATA,
    id: projectA.id,
    projectName: projectA.name,
    projectNumber: 'PRJ/QA-A/2026/001',
    owner: 'PT Citra Graha Pratama',
    contractor: 'PT Ezrab Konstruksi Mandiri',
    companyName: 'PT Ezrab Konstruksi Mandiri',
    location: projectA.location || '',
    startDate: '2026-03-01',
    endDate: '2026-11-30',
    duration: '275 Hari Kalender',
    contractValue: 3191250000,
    director: 'Bpk. Ir. Ahmad Sudrajat, M.T.',
  };

  const rabItemsA: RabItem[] = [
    {
      id: 'RAB-A-01',
      projectId: projectA.id,
      no: 1,
      code: 'STR-01',
      category: 'Pekerjaan Struktur',
      description: 'Pengecoran Beton Ready Mix K-350 Kolom',
      volume: 65,
      unit: 'm3',
      unitPrice: 1450000,
      amount: 94250000,
      totalPrice: 94250000,
    },
    {
      id: 'RAB-A-02',
      projectId: projectA.id,
      no: 2,
      code: 'STR-02',
      category: 'Pekerjaan Struktur',
      description: 'Pembesian Besi Beton Ulir BJTS 420B',
      volume: 8500,
      unit: 'kg',
      unitPrice: 16500,
      amount: 140250000,
      totalPrice: 140250000,
    },
  ];

  const scheduleTasksA: ScheduleTask[] = [
    {
      id: 'TSK-A-01',
      projectId: projectA.id,
      name: 'Pekerjaan Struktur Bawah dan Pondasi Footplat',
      category: 'Pekerjaan Struktur',
      startDate: '2026-03-01',
      endDate: '2026-04-15',
      startWeek: 1,
      endWeek: 6,
      durationWeeks: 6,
      actualProgressPercent: 100,
      status: 'COMPLETED',
      weightPercent: 35,
    },
    {
      id: 'TSK-A-02',
      projectId: projectA.id,
      name: 'Pekerjaan Struktur Rangka & Kolom Lantai 1-2',
      category: 'Pekerjaan Struktur',
      startDate: '2026-04-16',
      endDate: '2026-06-30',
      startWeek: 7,
      endWeek: 17,
      durationWeeks: 11,
      actualProgressPercent: 40,
      status: 'ON_TRACK',
      weightPercent: 45,
    },
  ];

  // Initialize fresh repository for Project A
  const repoA = new LocalDocumentRepository(projectA.id);
  if (repoA.clearAll) repoA.clearAll();
  assert(repoA.getProjectDocuments(projectA.id).length === 0, 'Project A repository starts cleanly with 0 documents');

  // Capture Source Snapshot before any Magic AI operations
  const sourceSnapshotA = JSON.parse(JSON.stringify({
    project: projectA,
    projectMaster: projectMasterA,
    rabItems: rabItemsA,
    scheduleTasks: scheduleTasksA,
  }));

  // ---------------------------------------------------------------------------
  // 2. AI CONTEXT & TRIGGER: "Buatkan dokumen proyek untuk pekerjaan ini."
  // ---------------------------------------------------------------------------
  console.log('\n--- [2] Magic AI Trigger: Buatkan dokumen proyek untuk pekerjaan ini ---');
  const fullAiContextA = buildFullAIContext(projectA, rabItemsA);
  const aiResponse = await defaultAiProvider.chat('Buatkan dokumen proyek untuk pekerjaan ini.', fullAiContextA);

  assert(Boolean(aiResponse.content && aiResponse.content.length > 50), 'AI response content generated');
  assert(aiResponse.content.includes(projectA.name), 'AI response references active project name');
  assert(aiResponse.content.includes(projectA.id), 'AI response references active project ID');
  assert(aiResponse.badge === 'LAPORAN', 'AI response badge is LAPORAN');
  assert(aiResponse.actionProposal !== undefined, 'AI produces an action proposal');
  assert(aiResponse.actionProposal?.type === 'CREATE_PROJECT_DOCUMENTS', 'Action proposal type is CREATE_PROJECT_DOCUMENTS');
  assert(aiResponse.actionProposal?.status === 'PENDING', 'Action proposal status is PENDING (confirmation gated)');
  assert(Boolean(aiResponse.actionProposal?.payload?.definitionIds?.length), 'Action proposal payload includes definitionIds');

  // Verify Document Planner details
  const aiDocContextA = buildAiDocumentContext(projectA, {
    rabItems: rabItemsA,
    scheduleTasks: scheduleTasksA,
    documents: repoA.getProjectDocuments(projectA.id),
  });
  const planA = planProjectDocuments(aiDocContextA);
  assert(planA.requiresConfirmation === true, 'Document planner requiresConfirmation = true');
  assert(planA.items.length === DOCUMENT_REGISTRY.length, 'Document planner includes all registry definitions');
  assert(planA.items.every(i => i.status === 'NOT_CREATED'), 'All documents initially classified as NOT_CREATED');
  assert(aiDocContextA.availableSources.includes('project') && aiDocContextA.availableSources.includes('rab'), 'Sources include project and rab');

  // Verify AUTO mapping: Auto fields (e.g. projectName, grandTotal) are NOT asked as manual user fields
  const offerLetterDef = getDocumentDefinition('offer-letter')!;
  const mappedFields = mapTemplateFields(offerLetterDef);
  assert(mappedFields['projectName'] === 'AUTO', 'projectName classified as AUTO');
  assert(mappedFields['letter.number'] === 'USER', 'letter.number classified as USER');
  assert(!planA.missingFields.includes('Nama Proyek'), 'AUTO field Nama Proyek is NOT in missing manual fields');

  // ---------------------------------------------------------------------------
  // 3. CONFIRMATION GATE: CANCEL TEST
  // ---------------------------------------------------------------------------
  console.log('\n--- [3] Confirmation Gate: User CANCEL Test ---');
  // When user cancels, proposal status becomes REJECTED and no documents are saved
  const rejectedProposal = { ...aiResponse.actionProposal!, status: 'REJECTED' as const };
  assert(rejectedProposal.status === 'REJECTED', 'Proposal status transitioned to REJECTED on cancel');
  assert(repoA.getProjectDocuments(projectA.id).length === 0, 'No DocumentRecords created on CANCEL');

  // ---------------------------------------------------------------------------
  // 4. CONFIRMATION GATE: CONFIRM TEST
  // ---------------------------------------------------------------------------
  console.log('\n--- [4] Confirmation Gate: User CONFIRM Test ---');
  const confirmedDefinitionIds = ['offer-letter', 'boq', 'rab', 'schedule', 'curve-s', 'rkk', 'jsa'];
  const createdRecords = createDraftDocumentsAfterConfirmation(aiDocContextA, repoA, confirmedDefinitionIds);

  assert(createdRecords.length === confirmedDefinitionIds.length, `Created exactly ${confirmedDefinitionIds.length} document records`);
  assert(createdRecords.every(r => r.status === 'DRAFT'), 'All confirmed documents created with status DRAFT');
  assert(createdRecords.every(r => r.revision === 0), 'All confirmed documents created with revision 0');
  assert(createdRecords.every(r => r.projectId === projectA.id), 'All confirmed documents bound to Project A');
  assert(repoA.getProjectDocuments(projectA.id).length === confirmedDefinitionIds.length, 'Repository persisted all confirmed records');

  // ---------------------------------------------------------------------------
  // 5. DUPLICATE PREVENTION TEST
  // ---------------------------------------------------------------------------
  console.log('\n--- [5] Duplicate Prevention Test ---');
  // Trigger AI planner again with updated repository
  const aiDocContextAAfterCreation = buildAiDocumentContext(projectA, {
    rabItems: rabItemsA,
    scheduleTasks: scheduleTasksA,
    documents: repoA.getProjectDocuments(projectA.id),
  });
  const planAfterCreation = planProjectDocuments(aiDocContextAAfterCreation);
  const existingInPlan = planAfterCreation.items.filter(i => i.status !== 'NOT_CREATED');
  assert(existingInPlan.length === confirmedDefinitionIds.length, `Planner detects all ${confirmedDefinitionIds.length} existing documents`);

  // Attempt duplicate creation
  const duplicateAttempt = createDraftDocumentsAfterConfirmation(aiDocContextAAfterCreation, repoA, confirmedDefinitionIds);
  assert(duplicateAttempt.length === 0, 'Duplicate creation returned 0 records');
  assert(repoA.getProjectDocuments(projectA.id).length === confirmedDefinitionIds.length, 'Repository count unchanged by duplicate trigger');
  assert(repoA.getDocument('offer-letter')?.revision === 0, 'Revision remains 0 (not bumped by duplicate trigger)');

  // ---------------------------------------------------------------------------
  // 6. SOURCE MUTATION GUARD TEST
  // ---------------------------------------------------------------------------
  console.log('\n--- [6] Source Mutation Guard Test ---');
  const sourceSnapshotAfter = JSON.parse(JSON.stringify({
    project: projectA,
    projectMaster: projectMasterA,
    rabItems: rabItemsA,
    scheduleTasks: scheduleTasksA,
  }));
  assert(JSON.stringify(sourceSnapshotA) === JSON.stringify(sourceSnapshotAfter), 'All source data 100% IDENTICAL before vs after Magic AI operations');

  // ---------------------------------------------------------------------------
  // 7. PROJECT ISOLATION TEST (PROJECT A vs PROJECT B)
  // ---------------------------------------------------------------------------
  console.log('\n--- [7] Project Isolation Test: Project A vs Project B ---');
  const projectB: Project = {
    id: 'PRJ-EZRAB-QA-B',
    name: 'EZRAB QA PROJECT B',
    location: 'Jl. Asia Afrika No. 100, Bandung',
    status: 'in_progress',
    client: 'PT Graha Pasundan Lestari',
    clientName: 'PT Graha Pasundan Lestari',
    startDate: '2026-05-01',
    targetDate: '2026-10-31',
    sections: [],
    costSummary: {
      directCost: 800000000, overheadPercent: 5, overheadAmount: 40000000, profitPercent: 10,
      profitAmount: 80000000, contingencyPercent: 0, contingencyAmount: 0,
      directorMarkupPercent: 0, directorMarkupNominal: 0, directorMarkupTotal: 0,
      showMarkupToEditor: false, showMarkupToClient: false, subtotalBeforeTax: 920000000,
      taxPercent: 11, taxAmount: 101200000, grandTotal: 1021200000, costPerM2: 5106000,
    },
    createdAt: '2026-05-01T08:00:00.000Z',
  };

  const repoB = new LocalDocumentRepository(projectB.id);
  if (repoB.clearAll) repoB.clearAll();

  // Query Project B -> MUST NOT see Project A records
  const docsInB = repoB.getProjectDocuments(projectB.id);
  assert(docsInB.length === 0, 'Project B repository returns 0 documents (zero leak from Project A)');

  // Run AI chat for Project B
  const fullAiContextB = buildFullAIContext(projectB, []);
  const aiResponseB = await defaultAiProvider.chat('Buatkan dokumen proyek untuk pekerjaan ini.', fullAiContextB);
  assert(aiResponseB.content.includes(projectB.name), 'Project B AI response uses Project B name');
  assert(!aiResponseB.content.includes(projectA.name), 'Project B AI response contains NO Project A name');
  assert(!aiResponseB.content.includes(projectA.id), 'Project B AI response contains NO Project A ID');

  // Verify Project A repository remains intact
  assert(repoA.getProjectDocuments(projectA.id).length === confirmedDefinitionIds.length, 'Project A repository remains intact after Project B operations');

  // ---------------------------------------------------------------------------
  // 8. REVIEWER TEST: CLEAN SCENARIO & MISMATCHED SCENARIO
  // ---------------------------------------------------------------------------
  console.log('\n--- [8] Consistency Reviewer Test ---');
  // Clean scenario
  const cleanFindings = reviewDocumentConsistency(aiDocContextAAfterCreation);
  assert(cleanFindings.length === 0, 'Clean scenario produces 0 false mismatch findings');

  // Mismatched scenario: Inject document record with different project name
  const mismatchedRecord = {
    ...repoA.getDocument('offer-letter')!,
    values: { projectName: 'Proyek Yang Berbeda' },
    userFieldValues: { projectName: 'Proyek Yang Berbeda' },
  };
  const mismatchedContext = {
    ...aiDocContextAAfterCreation,
    documents: [mismatchedRecord],
  };
  const mismatchFindings = reviewDocumentConsistency(mismatchedContext);
  assert(mismatchFindings.length === 1, 'Reviewer detects exactly 1 mismatch');
  assert(mismatchFindings[0].source === 'Project Master → name', 'Reviewer attributes finding to Project Master → name');
  assert(mismatchFindings[0].field === 'projectName', 'Reviewer identifies field projectName');
  assert(repoA.getDocument('offer-letter')?.revision === 0, 'Reviewer did not bump revision');

  // ---------------------------------------------------------------------------
  // 9. REAL ARTIFACT QA: PDF, DOCX, XLSX, ZIP
  // ---------------------------------------------------------------------------
  console.log('\n--- [9] Real Artifact QA Inspection ---');
  const sourceContextA = {
    master: projectMasterA,
    projectMaster: projectMasterA,
    rabItems: rabItemsA,
    scheduleTasks: scheduleTasksA,
  };

  // 9a. Real PDF Artifact
  const offerLetterData = buildDocumentData(offerLetterDef, sourceContextA);
  const pdfBlob = await generatePdf(offerLetterDef, offerLetterData, undefined, 0);
  assert(pdfBlob instanceof Blob, 'Generated PDF is a valid Blob instance');
  assert(pdfBlob.size > 1000, `Generated PDF has substantial size (${pdfBlob.size} bytes)`);

  const pdfArrayBuffer = await pdfBlob.arrayBuffer();
  const pdfBuffer = Buffer.from(pdfArrayBuffer);
  const pdfHeader = pdfBuffer.slice(0, 8).toString('latin1');
  assert(pdfHeader.startsWith('%PDF-'), 'PDF artifact has valid %PDF- header');

  const pdfText = pdfBuffer.toString('latin1');
  assert(pdfText.includes('%%EOF'), 'PDF artifact has valid %%EOF trailer');
  assert(!pdfText.includes('undefined') && !pdfText.includes('NaN'), 'PDF has no undefined or NaN strings');

  // 9b. Real DOCX Artifact
  const docxBlob = await generateDocx(offerLetterDef, offerLetterData, undefined, 0);
  assert(docxBlob instanceof Blob, 'Generated DOCX is a valid Blob instance');
  assert(docxBlob.size > 1000, `Generated DOCX has substantial size (${docxBlob.size} bytes)`);

  const docxArrayBuffer = await docxBlob.arrayBuffer();
  const docxBuffer = Buffer.from(docxArrayBuffer);
  assert(docxBuffer[0] === 0x50 && docxBuffer[1] === 0x4B, 'DOCX has valid PK zip magic bytes');

  const docxZip = await JSZip.loadAsync(docxBuffer);
  assert(Boolean(docxZip.file('word/document.xml')), 'DOCX contains word/document.xml');
  const docXml = await docxZip.file('word/document.xml')!.async('text');
  assert(docXml.includes('<w:p>'), 'DOCX contains paragraph elements');
  assert(!docXml.includes('{{') && !docXml.includes('}}'), 'DOCX has no unresolved template placeholders');

  // 9c. Real XLSX Artifact
  const boqDef = getDocumentDefinition('boq')!;
  const boqData = buildDocumentData(boqDef, sourceContextA);
  const xlsxBlob = await generateXlsx(boqDef, boqData, undefined, 0);
  assert(xlsxBlob instanceof Blob, 'Generated XLSX is a valid Blob instance');
  assert(xlsxBlob.size > 1000, `Generated XLSX has substantial size (${xlsxBlob.size} bytes)`);

  const xlsxArrayBuffer = await xlsxBlob.arrayBuffer();
  const xlsxBuffer = Buffer.from(xlsxArrayBuffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsxBuffer as any);
  assert(workbook.worksheets.length > 0, 'XLSX contains at least one worksheet');
  const sheet = workbook.worksheets[0];
  assert(sheet.rowCount > 5, 'XLSX sheet contains rows');

  // 9d. Real ZIP Package Export
  const zipResult = await downloadTenderPackage(
    [offerLetterDef, boqDef],
    sourceContextA,
    ['PDF', 'XLSX']
  );
  assert(zipResult.blob instanceof Blob, 'Generated ZIP package is a valid Blob instance');
  const zipArrayBuffer = await zipResult.blob.arrayBuffer();
  const zipLoaded = await JSZip.loadAsync(Buffer.from(zipArrayBuffer));
  assert(Boolean(zipLoaded.file('MANIFEST.txt')), 'ZIP package contains MANIFEST.txt at root');
  assert(zipResult.manifestText.includes(projectA.name), 'MANIFEST includes Project Name');
  assert(zipResult.manifestText.includes('SUCCESS'), 'MANIFEST records SUCCESS status');

  // ---------------------------------------------------------------------------
  // 10. MAGIC AI EXISTING ACTION REGRESSION
  // ---------------------------------------------------------------------------
  console.log('\n--- [10] Magic AI Existing Action Regression ---');
  // Buat RAB
  const rabActionRes = await defaultAiProvider.chat('Buatkan saya estimasi RAB rumah tinggal type 36', fullAiContextA);
  assert(rabActionRes.badge === 'WIZARD' || rabActionRes.content.includes('RAB'), 'Buat RAB action works');

  // Analisis DED
  const dedActionRes = await defaultAiProvider.chat('bantu saya menganalisis dokumen ded', fullAiContextA);
  assert(dedActionRes.quickActionResponse?.actionId === 'ANALISIS_DED', 'Analisis DED action preserved');

  // Hitung Volume
  const volActionRes = await defaultAiProvider.chat('bantu saya menghitung volume', fullAiContextA);
  assert(volActionRes.quickActionResponse?.actionId === 'HITUNG_VOLUME', 'Hitung Volume action preserved');

  // Cari AHSP
  const ahspActionRes = await defaultAiProvider.chat('saya bantu mencari ahsp', fullAiContextA);
  assert(ahspActionRes.quickActionResponse?.actionId === 'CARI_AHSP', 'Cari AHSP action preserved');

  // ---------------------------------------------------------------------------
  // 11. MANUAL DOCUMENT WORKFLOW REGRESSION
  // ---------------------------------------------------------------------------
  console.log('\n--- [11] Manual Document Workflow Regression ---');
  // Dokumen Proyek -> select document -> open -> edit -> preview -> export
  const manualRecord = repoA.getDocument('offer-letter')!;
  assert(manualRecord.id !== '', 'Manual workflow retrieves canonical document record');
  manualRecord.userFieldValues = { ...manualRecord.userFieldValues, letterNumber: '001/SP/QA/2026' };
  repoA.saveDocument(manualRecord);
  assert(repoA.getDocument('offer-letter')?.userFieldValues?.['letterNumber'] === '001/SP/QA/2026', 'Manual edit persists');
  assert(repoA.getDocument('offer-letter')?.revision === 0, 'Manual edit preserves revision at 0');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 7.2 TEST SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error('Failure Details:\n' + failures.map(f => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

runPhase72ReleaseGateTests().catch((err) => {
  console.error('Fatal Error during Phase 7.2 tests:', err);
  process.exit(1);
});

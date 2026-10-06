/**
 * EZRAB Document Package Wizard & Dokumen Proyek Test Suite
 * 
 * Verifies:
 * 1. 18-Document Tender Registry & Categorization
 * 2. Tender Presets Alignment (Administrasi: 5, Teknis: 5, Biaya: 5, Jadwal: 2, K3: 1)
 * 3. Source Dependency Evaluation
 * 4. Cross-Document Consistency Engine Verification
 * 5. Document Package Intent Classification
 */

import { DOCUMENT_REGISTRY, getDocumentDefinition, TENDER_PACKAGE_PRESETS, getPresetDocuments } from '../../src/document-engine/registry';
import { evaluateDependency, getSourceStatus } from '../../src/document-engine/requirementEngine';
import { ConsistencyEngine } from '../../src/document-engine/consistencyEngine';
import { classifyIntent } from '../orchestrator/intentClassifier';
import { EMPTY_MASTER_DATA } from '../../src/document-engine/types';

function runTestSuite() {
  console.log('========================================================');
  console.log('STARTING DOCUMENT PACKAGE WIZARD & REGISTRY TEST SUITE');
  console.log('========================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: 18 TENDER DOCUMENTS & REGISTRY INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n[TEST GROUP 1] 18-Document Tender Registry Integrity');

  assert(DOCUMENT_REGISTRY.length >= 18, `Registry has at least 18 documents (found ${DOCUMENT_REGISTRY.length})`);

  const offerLetter = getDocumentDefinition('offer-letter');
  assert(!!offerLetter && offerLetter.name === 'Surat Penawaran Tender', 'Surat Penawaran Tender exists');
  assert(offerLetter?.category === 'ADMINISTRATION', 'Surat Penawaran is in ADMINISTRATION');

  const execMethod = getDocumentDefinition('execution-method');
  assert(!!execMethod && execMethod.name === 'Metode Pelaksanaan', 'Metode Pelaksanaan exists');

  const boq = getDocumentDefinition('boq');
  assert(!!boq && boq.name === 'BOQ', 'BOQ exists');

  const rab = getDocumentDefinition('rab');
  assert(!!rab && rab.name === 'RAB', 'RAB exists');

  const schedule = getDocumentDefinition('schedule');
  assert(!!schedule && schedule.name === 'Time Schedule', 'Time Schedule exists');

  const curveS = getDocumentDefinition('curve-s');
  assert(!!curveS && curveS.name === 'Kurva-S', 'Kurva-S exists');

  const rkk = getDocumentDefinition('rkk');
  assert(!!rkk && rkk.name === 'RKK', 'RKK exists in HSE');

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: TENDER PACKAGE PRESETS (5-CATEGORY MATRIX)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST GROUP 2] Tender Package Presets Alignment');

  assert(TENDER_PACKAGE_PRESETS.ALL.length === 18, `All Preset has exactly 18 documents (got ${TENDER_PACKAGE_PRESETS.ALL.length})`);
  assert(TENDER_PACKAGE_PRESETS.ADMINISTRATION.length === 5, `Administrasi preset has 5 documents (got ${TENDER_PACKAGE_PRESETS.ADMINISTRATION.length})`);
  assert(TENDER_PACKAGE_PRESETS.TECHNICAL.length === 5, `Teknis preset has 5 documents (got ${TENDER_PACKAGE_PRESETS.TECHNICAL.length})`);
  assert(TENDER_PACKAGE_PRESETS.COMMERCIAL.length === 5, `Biaya preset has 5 documents (got ${TENDER_PACKAGE_PRESETS.COMMERCIAL.length})`);
  assert(TENDER_PACKAGE_PRESETS.SCHEDULE.length === 2, `Jadwal preset has 2 documents (got ${TENDER_PACKAGE_PRESETS.SCHEDULE.length})`);
  assert(TENDER_PACKAGE_PRESETS.HSE.length === 1, `K3 preset has 1 document (got ${TENDER_PACKAGE_PRESETS.HSE.length})`);

  const allPresetDocs = getPresetDocuments('ALL');
  assert(allPresetDocs.length === 18, 'getPresetDocuments(ALL) resolves all 18 definitions');

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: SOURCE DEPENDENCY CHECKING
  // ---------------------------------------------------------------------------
  console.log('\n[TEST GROUP 3] Source Dependency Evaluation');

  const emptySources = getSourceStatus({});
  const boqDepCheck = evaluateDependency(boq!, emptySources);
  assert(boqDepCheck.status === 'INCOMPLETE', 'BOQ with missing sources reports INCOMPLETE');
  assert(Boolean(boqDepCheck.missingFields && boqDepCheck.missingFields.length > 0), 'BOQ lists missing dependency fields');

  const readySources = getSourceStatus({ boq: true, rab: true, schedule: true, curveS: true });
  const boqDepCheckReady = evaluateDependency(boq!, readySources);
  assert(boqDepCheckReady.status === 'COMPLETE', 'BOQ with ready sources reports COMPLETE');

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: CROSS-DOCUMENT CONSISTENCY ENGINE
  // ---------------------------------------------------------------------------
  console.log('\n[TEST GROUP 4] Cross-Document Consistency Engine');

  const dummyMaster = {
    ...EMPTY_MASTER_DATA,
    projectName: 'Pembangunan RSUD Pratama',
    projectNumber: 'PRJ-RSUD-2026',
    duration: '120 Hari Kalender',
    contractValue: 1000000000,
  };

  // Consistent Case
  const consistentResult = ConsistencyEngine.verify({
    projectMaster: dummyMaster,
    rabItems: [{ total: 1000000000 }],
    scheduleTasks: [{ duration: 120 }],
    activeDocumentIds: ['offer-letter', 'rab', 'schedule', 'rkk'],
    records: {
      'offer-letter': {
        id: 'offer-REV-00',
        definitionId: 'offer-letter',
        status: 'DRAFT',
        data: {},
        sourceData: {},
        values: { contractValue: 1000000000 },
        revision: 0,
        createdAt: '',
        updatedAt: '',
      } as any,
    },
  });

  assert(consistentResult.valid === true, 'Consistent data passes consistency check');
  assert(consistentResult.score >= 90, `Consistency score is high (got ${consistentResult.score})`);

  // Discrepancy Case: Offer Letter differs from RAB total
  const inconsistentResult = ConsistencyEngine.verify({
    projectMaster: dummyMaster,
    rabItems: [{ total: 1250000000 }], // RAB is 1.25B
    scheduleTasks: [{ duration: 120 }],
    activeDocumentIds: ['offer-letter', 'rab', 'schedule'],
    records: {
      'offer-letter': {
        id: 'offer-REV-00',
        definitionId: 'offer-letter',
        status: 'DRAFT',
        data: {},
        sourceData: {},
        values: { contractValue: 1000000000 }, // Offer is 1.0B
        revision: 0,
        createdAt: '',
        updatedAt: '',
      } as any,
    },
  });

  assert(inconsistentResult.valid === false, 'Discrepancy in offer letter vs RAB flags validation failure');
  const grandTotalIssue = inconsistentResult.issues.find((i) => i.ruleId === 'GRAND_TOTAL_MATCH');
  assert(!!grandTotalIssue, 'GRAND_TOTAL_MATCH rule triggered with detailed discrepancy report');
  assert(grandTotalIssue?.severity === 'ERROR', 'Grand total mismatch has ERROR severity');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: DOCUMENT PACKAGE INTENT CLASSIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n[TEST GROUP 5] Document Package Intent Classification');

  const q1 = classifyIntent('Buatkan semua dokumen tender untuk proyek ini');
  assert(q1.category === 'CREATE_DOCUMENT_PACKAGE', 'Identifies "Buatkan semua dokumen tender untuk proyek ini" as CREATE_DOCUMENT_PACKAGE');
  assert(q1.confidence >= 0.95, `High confidence for package creation (got ${q1.confidence})`);

  const q2 = classifyIntent('Siapkan paket dokumen proyek sekarang');
  assert(q2.category === 'CREATE_DOCUMENT_PACKAGE', 'Identifies "Siapkan paket dokumen proyek sekarang" as CREATE_DOCUMENT_PACKAGE');

  const q3 = classifyIntent('Buat dokumen tender');
  assert(q3.category === 'CREATE_DOCUMENT_PACKAGE', 'Identifies "Buat dokumen tender" as CREATE_DOCUMENT_PACKAGE');

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${passed + failed} tests`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();

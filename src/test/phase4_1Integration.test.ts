import { buildDocumentData, DocumentSourceContext } from '../document-engine/documentData';
import { validateDocument } from '../document-engine/validationEngine';
import { renderDocument } from '../document-engine/renderer';
import { exportDocument } from '../document-engine/exportService';
import { generateXlsx } from '../document-engine/exporters/xlsxGenerator';
import { downloadTenderPackage } from '../document-engine/packageExporter';
import { LocalDocumentRepository } from '../document-engine/repository';
import { DOCUMENT_REGISTRY, getDocumentDefinition } from '../document-engine/registry';
import type { ProjectMasterData, DocumentDefinition } from '../document-engine/types';
import type { RABItem, ScheduleTask, KurvaSDataPoint } from '../types';
import ExcelJS from 'exceljs';

export async function runPhase41IntegrationTests(): Promise<{
  success: boolean;
  passedCount: number;
  failedCount: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      passedCount++;
      logs.push(`  [PASS] ${msg}`);
    } else {
      failedCount++;
      logs.push(`  [FAIL] ${msg}`);
    }
  }

  logs.push('========================================================');
  logs.push('STARTING EZRAB PHASE 4.1 PRODUCTION ACCEPTANCE TESTS');
  logs.push('========================================================');

  // SETUP: REAL PROJECT DATA (Matching existing application data)
  const realMasterData: ProjectMasterData = {
    projectName: 'Rumah Tinggal Ahmad',
    projectNumber: 'PRJ-2026-0001',
    owner: 'Ahmad Yusuf',
    contractor: 'PT Ezrab Bangun Persada',
    location: 'Surabaya, Jawa Timur',
    contractValue: 4044960,
    duration: '12 Minggu',
    startDate: '2026-10-01',
    endDate: '2026-12-24',
    tenderNumber: 'TND/2026/09/001',
    projectType: 'Rumah Tinggal',
    tenderType: 'Pascakualifikasi',
    director: 'Ir. Ahmad Yusuf, S.T., M.T.',
    projectManager: 'Budi Santoso, S.T.',
    engineer: 'Dewi Lestari, S.T.',
    architect: 'Rian Pratama, IAI',
    hseOfficer: 'Eko Prasetyo, S.KM.',
    qs: 'Fitri Handayani, S.T.',
    companyName: 'PT Ezrab Bangun Persada',
    companyAddress: 'Jl. Pemuda No. 45, Surabaya',
    companyPhone: '031-5551234',
    companyEmail: 'kontak@ezrab-persada.co.id',
    companyLogo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    companySignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  const realRabItems: RABItem[] = [
    {
      id: 'RAB-001',
      sectionId: 'SEC-01',
      itemNumber: '1.1',
      code: 'A.1.1.1',
      description: 'Pengukuran & Pemasangan Bowplank',
      specification: 'Kayu Meranti 5/7 & Paku 2-3 inch',
      volume: 42.4,
      unit: 'm',
      materialPrice: 50000,
      laborPrice: 40000,
      equipmentPrice: 5400,
      unitPrice: 95400,
      totalPrice: 4044960,
      verificationStatus: 'VERIFIED',
    },
  ];

  const realScheduleTasks: ScheduleTask[] = [
    {
      id: 'SCH-001',
      projectId: 'proj-real-001',
      name: 'Pekerjaan Persiapan & Bowplank',
      category: 'Persiapan',
      durationWeeks: 2,
      startDate: '2026-10-01',
      endDate: '2026-10-14',
      startWeek: 1,
      endWeek: 2,
      weightPercent: 15.5,
      actualProgressPercent: 10.0,
      status: 'ON_TRACK',
    },
  ];

  const realKurvaSData: KurvaSDataPoint[] = [
    {
      weekIndex: 1,
      weekLabel: 'Minggu 1',
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      plannedWeeklyPercent: 7.75,
      cumulativePlannedPercent: 7.75,
      plannedWeeklyCost: 313484,
      cumulativePlannedCost: 313484,
      actualProgressPercent: 5.0,
    },
    {
      weekIndex: 2,
      weekLabel: 'Minggu 2',
      startDate: '2026-10-08',
      endDate: '2026-10-14',
      plannedWeeklyPercent: 7.75,
      cumulativePlannedPercent: 15.5,
      plannedWeeklyCost: 313484,
      cumulativePlannedCost: 626968,
      actualProgressPercent: 10.0,
    },
  ];

  // =========================================================================
  // TEST GROUP 1: DocumentData Aggregation & No Fake Data
  // =========================================================================
  logs.push('\n[TEST GROUP 1] DocumentData Aggregation & Authentic Modeling');
  {
    const boqDef = getDocumentDefinition('boq')!;
    const context: DocumentSourceContext = {
      master: realMasterData,
      rabItems: realRabItems,
      scheduleTasks: realScheduleTasks,
      kurvaSData: realKurvaSData,
    };

    const docData = buildDocumentData(boqDef, context);

    assert(docData.project.projectName === 'Rumah Tinggal Ahmad', 'Mapped real project name correctly');
    assert(docData.project.owner === 'Ahmad Yusuf', 'Mapped real owner correctly');
    assert(docData.boq.length === 1, 'BOQ rows count matches authoritative RAB source (1 row)');
    assert(docData.boq[0].quantity === 42.4, 'BOQ quantity preserves exact 42.4 m value');
    assert(docData.boq[0].unitPrice === 95400, 'BOQ unitPrice preserves exact Rp 95.400');
    assert(docData.rab[0].amount === 4044960, 'RAB amount matches Rp 4.044.960');
    assert(docData.schedule.length === 1, 'Schedule tasks mapped correctly');
    assert(docData.schedule[0].duration === 2, 'Schedule duration matches 2 weeks');

    // Test: No fake data when source modules are empty
    assert(docData.rkk.length === 0, 'RKK remains empty array when source is empty (no fake data)');
    assert(docData.jsa.length === 0, 'JSA remains empty array when source is empty (no fake data)');
    assert(docData.personnel.length === 0, 'Personnel remains empty array when source is empty (no fake data)');
    assert(docData.equipment.length === 0, 'Equipment remains empty array when source is empty (no fake data)');
  }

  // =========================================================================
  // TEST GROUP 2: Dynamic Dependency Validation (Blocking Errors vs Non-Blocking Warnings)
  // =========================================================================
  logs.push('\n[TEST GROUP 2] Dynamic Dependency Validation Engine');
  {
    const boqDef = getDocumentDefinition('boq')!; // Depends on BOQ
    const rkkDef = getDocumentDefinition('rkk')!; // Depends on RKK

    // Scenario A: Missing BOQ dependency -> Error blocks export
    const emptyContext: DocumentSourceContext = {
      master: realMasterData,
      rabItems: [], // Missing!
    };
    const emptyBoqData = buildDocumentData(boqDef, emptyContext);
    const boqValResult = validateDocument(boqDef, emptyBoqData);

    assert(!boqValResult.valid, 'Missing required BOQ dependency results in valid=false');
    assert(
      boqValResult.errors.some((e) => e.includes('BOQ')),
      'Error message explicitly specifies "Data BOQ belum tersedia"'
    );

    // Scenario B: Valid BOQ -> Pass
    const validContext: DocumentSourceContext = {
      master: realMasterData,
      rabItems: realRabItems,
    };
    const validBoqData = buildDocumentData(boqDef, validContext);
    const validBoqVal = validateDocument(boqDef, validBoqData, validContext);
    assert(validBoqVal.valid, 'Populated BOQ data passes validation with valid=true');

    // Scenario C: RKK document without RKK data -> Error
    const rkkData = buildDocumentData(rkkDef, {
      master: realMasterData,
      rkk: [],
    });
    const rkkVal = validateDocument(rkkDef, rkkData);
    assert(!rkkVal.valid, 'Missing RKK dependency fails validation for RKK document');
    assert(
      rkkVal.errors.some((e) => e.includes('RKK')),
      'Error message explicitly states "Data RKK belum tersedia"'
    );

    // Scenario D: Non-blocking warning when logo is missing
    const noLogoMaster: ProjectMasterData = {
      ...realMasterData,
      companyLogo: '',
    };
    const noLogoContext: DocumentSourceContext = {
      master: noLogoMaster,
      rabItems: realRabItems,
    };
    const noLogoData = buildDocumentData(boqDef, noLogoContext);
    const noLogoVal = validateDocument(boqDef, noLogoData, noLogoContext);
    assert(noLogoVal.valid, 'Missing logo is NON-BLOCKING (valid remains true)');
    assert(
      noLogoVal.warnings.some((w) => w.includes('Logo')),
      'Warning issued: "Logo perusahaan belum tersedia"'
    );
  }

  // =========================================================================
  // TEST GROUP 3: Revision Model & History Integrity
  // =========================================================================
  logs.push('\n[TEST GROUP 3] Explicit Revision Model & History Integrity');
  {
    const repo = new LocalDocumentRepository('PRJ-2026-TEST-REV');
    const boqDef = getDocumentDefinition('boq')!;

    // Initial REV 00
    const initialRecord = {
      id: `${boqDef.id}-REV-00`,
      definitionId: boqDef.id,
      projectId: 'PRJ-2026-TEST-REV',
      status: 'DRAFT' as const,
      data: {},
      sourceData: {},
      values: {},
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    repo.saveDocument(initialRecord);

    // Verify initial state
    const saved0 = repo.getDocument(boqDef.id);
    assert(saved0?.revision === 0, 'Initial revision is REV 00');

    // Create explicit revision -> REV 01
    const rev1 = repo.createRevision(initialRecord, 'Penyesuaian volume galian tanah addendum 1');
    assert(rev1.revision === 1, 'Revision incremented explicitly to REV 01');
    assert(rev1.revisionDescription === 'Penyesuaian volume galian tanah addendum 1', 'Revision description recorded');
    assert(rev1.isReadOnly === false, 'New active revision is editable (not read-only)');

    // Check history: REV 00 must be preserved and marked read-only
    const history = repo.getRevisionHistory(boqDef.id);
    assert(history.length >= 2, 'Revision history contains both REV 00 and REV 01');
    const rev0InHistory = history.find((r) => r.revision === 0);
    assert(rev0InHistory?.isReadOnly === true, 'Archived past revision REV 00 is strictly read-only');

    // Create another revision -> REV 02
    const rev2 = repo.createRevision(rev1, 'Finalisasi negosiasi harga');
    assert(rev2.revision === 2, 'Revision incremented explicitly to REV 02');

    const updatedHistory = repo.getRevisionHistory(boqDef.id);
    assert(updatedHistory.length === 3, 'Revision history preserves all 3 revisions (REV 00, 01, 02)');
  }

  // =========================================================================
  // TEST GROUP 4: Export History Tracking (SUCCESS & FAILED)
  // =========================================================================
  logs.push('\n[TEST GROUP 4] Export History Recording (SUCCESS & FAILED)');
  {
    const repo = new LocalDocumentRepository('PRJ-2026-TEST-EXP');

    // Record SUCCESS
    repo.saveExportHistory({
      id: 'EXP-TEST-001',
      documentId: 'boq',
      projectId: 'PRJ-2026-TEST-EXP',
      format: 'PDF',
      fileName: 'TDR-COM-001_Rumah-Tinggal-Ahmad_REV00.pdf',
      revision: 0,
      createdAt: new Date().toISOString(),
      status: 'SUCCESS',
    });

    // Record FAILED
    repo.saveExportHistory({
      id: 'EXP-TEST-002',
      documentId: 'rkk',
      projectId: 'PRJ-2026-TEST-EXP',
      format: 'DOCX',
      fileName: 'TDR-HSE-001_Rumah-Tinggal-Ahmad_REV00.docx',
      revision: 0,
      createdAt: new Date().toISOString(),
      status: 'FAILED',
      error: 'Data RKK belum tersedia',
    });

    const exports = repo.getExportHistory();
    assert(exports.length === 2, 'Both export events recorded in history');
    assert(exports.some((x) => x.status === 'SUCCESS'), 'SUCCESS status recorded correctly');
    assert(exports.some((x) => x.status === 'FAILED' && x.error === 'Data RKK belum tersedia'), 'FAILED status with error recorded correctly');
  }

  // =========================================================================
  // TEST GROUP 5: Strict Project Isolation
  // =========================================================================
  logs.push('\n[TEST GROUP 5] Strict Project Namespace Isolation');
  {
    const repoA = new LocalDocumentRepository('PROJECT-ALPHA');
    const repoB = new LocalDocumentRepository('PROJECT-BETA');

    repoA.saveDocument({
      id: 'doc-alpha',
      definitionId: 'boq',
      projectId: 'PROJECT-ALPHA',
      status: 'COMPLETE',
      data: { secretAlpha: true },
      sourceData: {},
      values: {},
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    repoA.saveExportHistory({
      id: 'exp-alpha',
      documentId: 'boq',
      projectId: 'PROJECT-ALPHA',
      format: 'PDF',
      fileName: 'Alpha.pdf',
      revision: 1,
      createdAt: new Date().toISOString(),
      status: 'SUCCESS',
    });

    const docsB = repoB.getProjectDocuments();
    const exportsB = repoB.getExportHistory();

    assert(!docsB.some((d) => d.id === 'doc-alpha'), 'Project B cannot view Project A documents');
    assert(!exportsB.some((e) => e.id === 'exp-alpha'), 'Project B cannot view Project A export history');
  }

  // =========================================================================
  // TEST GROUP 6: Real-Data XLSX Formulas & Column Structure
  // =========================================================================
  logs.push('\n[TEST GROUP 6] XLSX Generator Formula & Authentic Data Verification');
  {
    const boqDef = getDocumentDefinition('boq')!;
    const docData = buildDocumentData(boqDef, {
      master: realMasterData,
      rabItems: realRabItems,
    });

    const xlsxBlob = await generateXlsx(boqDef, docData);
    assert(xlsxBlob instanceof Blob, 'generateXlsx returns valid Blob');
    assert(xlsxBlob.size > 1000, 'XLSX Blob has substantial file size (> 1KB)');

    // Parse and inspect Excel workbook
    const arrayBuffer = await xlsxBlob.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);

    const ws = wb.worksheets[0];
    assert(Boolean(ws), 'Worksheet exists in generated XLSX');

    // Check Header row (Row 5)
    const headerRow = ws.getRow(5);
    const expectedHeaders = ['NO', 'CODE', 'ITEM', 'DESCRIPTION', 'SPECIFICATION', 'UNIT', 'QTY', 'UNIT PRICE', 'TOTAL'];
    let headersMatch = true;
    for (let col = 1; col <= 9; col++) {
      if (headerRow.getCell(col).value !== expectedHeaders[col - 1]) {
        headersMatch = false;
      }
    }
    assert(headersMatch, 'XLSX Column headers match standard 9-column BOQ format exactly');

    // Check Data row (Row 6)
    const dataRow = ws.getRow(6);
    assert(dataRow.getCell(1).value === 1, 'Row NO is 1');
    assert(dataRow.getCell(2).value === 'A.1.1.1', 'Row CODE matches authentic code A.1.1.1');
    assert(dataRow.getCell(7).value === 42.4, 'Row QTY matches exact 42.4');
    assert(dataRow.getCell(8).value === 95400, 'Row UNIT PRICE matches Rp 95.400');

    // Check formula: Cell I6 must contain formula "=G6*H6"
    const totalCellVal = dataRow.getCell(9).value as { formula?: string } | null;
    assert(
      Boolean(totalCellVal && totalCellVal.formula === 'G6*H6'),
      'Row 6 TOTAL uses dynamic formula G6*H6 (no hardcoded/placeholder value)'
    );

    // Check Grand Total row (Row 7)
    const grandTotalRow = ws.getRow(7);
    assert(grandTotalRow.getCell(8).value === 'GRAND TOTAL', 'Grand total label present');
    const grandTotalFormula = grandTotalRow.getCell(9).value as { formula?: string } | null;
    assert(
      Boolean(grandTotalFormula && grandTotalFormula.formula === 'SUM(I6:I6)'),
      'Grand Total uses dynamic SUM formula SUM(I6:I6)'
    );
  }

  // =========================================================================
  // TEST GROUP 7: Central Export Pipeline (`exportDocument`) End-to-End
  // =========================================================================
  logs.push('\n[TEST GROUP 7] Central Export Pipeline (exportDocument) End-to-End');
  {
    const repo = new LocalDocumentRepository('PRJ-CENTRAL-PIPELINE');
    const boqDef = getDocumentDefinition('boq')!;

    // 1. Export blocked by validation error (missing BOQ data)
    const failResult = await exportDocument({
      definition: boqDef,
      context: {
        master: realMasterData,
        rabItems: [], // Missing!
      },
      format: 'PDF',
      repository: repo,
      triggerDownload: false,
    });

    assert(failResult.success === false, 'exportDocument returns success=false when validation fails');
    assert(Boolean(failResult.error?.includes('BOQ')), 'Error indicates missing BOQ dependency');
    assert(failResult.blob === undefined, 'No blob generated when validation fails (export halted)');

    // Verify failed export history recorded
    const historyAfterFail = repo.getExportHistory('boq');
    assert(historyAfterFail.length === 1 && historyAfterFail[0].status === 'FAILED', 'Failed export automatically recorded in history');

    // 2. Successful export with valid data
    const successResult = await exportDocument({
      definition: boqDef,
      context: {
        master: realMasterData,
        rabItems: realRabItems,
      },
      format: 'PDF',
      repository: repo,
      triggerDownload: false,
    });

    assert(successResult.success === true, 'exportDocument returns success=true on valid data');
    assert(successResult.blob instanceof Blob, 'exportDocument generates valid Blob');
    assert(successResult.filename.includes('TDR-COM-001'), 'Filename includes document code');
    assert(successResult.filename.includes('REV00'), 'Filename includes revision');

    // Verify successful export history recorded
    const historyAfterSuccess = repo.getExportHistory('boq');
    assert(historyAfterSuccess.some((x) => x.status === 'SUCCESS'), 'Successful export automatically recorded in history');
  }

  // =========================================================================
  // TEST GROUP 8: Package Exporter Partial Failure Tolerance & MANIFEST.txt
  // =========================================================================
  logs.push('\n[TEST GROUP 8] Package Exporter Partial Failure & MANIFEST.txt');
  {
    // Provide 2 definitions: BOQ (has data) and RKK (missing data)
    const boqDef = getDocumentDefinition('boq')!;
    const rkkDef = getDocumentDefinition('rkk')!;

    const testDefs = [boqDef, rkkDef];

    const packageResult = await downloadTenderPackage(
      testDefs,
      {
        master: realMasterData,
        rabItems: realRabItems, // BOQ will succeed
        rkk: [], // RKK will fail validation
      },
      ['PDF']
    );

    assert(packageResult.generatedCount > 0, 'Generated at least 1 successful document');
    assert(packageResult.failedCount > 0, 'Recorded failed document without crashing entire package');
    assert(packageResult.totalCount === packageResult.generatedCount + packageResult.failedCount, 'Total count matches sum of generated and failed');
    assert(packageResult.manifestText.includes('MANIFEST'), 'Manifest contains header');
    assert(packageResult.manifestText.includes('SUCCESS'), 'Manifest notes SUCCESS for BOQ');
    assert(packageResult.manifestText.includes('FAILED'), 'Manifest notes FAILED with error for RKK');
    assert(packageResult.manifestText.includes('PACKAGE SUMMARY:'), 'Manifest contains package summary section');
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  logs.push('\n========================================================');
  logs.push(`PHASE 4.1 TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED out of ${passedCount + failedCount} tests`);
  logs.push('========================================================');

  return {
    success: failedCount === 0,
    passedCount,
    failedCount,
    logs,
  };
}

// Direct execution when invoked via tsx
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/')) || process.argv[1]?.includes('phase4_1Integration')) {
  runPhase41IntegrationTests().then((res) => {
    console.log(res.logs.join('\n'));
    if (!res.success) {
      process.exit(1);
    }
  });
}

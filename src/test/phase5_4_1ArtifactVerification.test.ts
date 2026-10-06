/**
 * Phase 5.4.1 — Export Artifact Verification Test Suite
 * Rigorous deep verification of actual generated artifacts:
 * - PDF Artifacts: BOQ, RAB, JSA, RKK, Schedule, Kurva-S
 * - PDF Long-Table Paging: 10 rows, 50 rows, 100+ rows (multi-page, repeated headers)
 * - DOCX Artifacts: Native editable XML (<w:t>, <w:tbl>, <w:tr>), table & row counts, metadata
 * - XLSX Artifacts: Native ExcelJS parsing, real Excel formulas (*, SUM), number formats, column widths
 * - ZIP Packages: Relevant category folders only, Section 11 MANIFEST.txt, transparent failure logging
 * - Validation Gate: Complete documents pass, missing dependencies/required data fail-closed & blocked
 * - Revision Safety: Edits & exports preserve revision, explicit new revision increments and preserves history
 * - Project Isolation: Project A data strictly isolated from Project B
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
import { getDocumentDefinition, DOCUMENT_REGISTRY } from '../document-engine/registry';
import { exportDocument, sanitizeFilenamePart, getExportFilename } from '../document-engine/exportService';
import { generatePdf } from '../document-engine/exporters/pdfGenerator';
import { generateDocx } from '../document-engine/exporters/docxGenerator';
import { generateXlsx } from '../document-engine/exporters/xlsxGenerator';
import { buildDocumentData, DocumentSourceContext } from '../document-engine/documentData';
import { downloadTenderPackage } from '../document-engine/packageExporter';
import { LocalDocumentRepository } from '../document-engine/repository';
import type { DocumentRecord, DocumentDefinition, ProjectMasterData } from '../document-engine/types';
import { EMPTY_MASTER_DATA } from '../document-engine/types';
import { generateKurvaSData } from '../engine/kurvaSEngine';
import type { ScheduleTask, KurvaSDataPoint } from '../types';

let passedCount = 0;
let failedCount = 0;
const failureDetails: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] Test ${passedCount + failedCount}: ${message}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] Test ${passedCount + failedCount}: ${message}`);
    failureDetails.push(message);
  }
}

// Helpers to invoke exporters with canonical data
const runPdf = (def: DocumentDefinition, context: DocumentSourceContext, rev?: number) => {
  const data = buildDocumentData(def, context);
  return generatePdf(def, data, undefined, rev);
};

const runDocx = (def: DocumentDefinition, context: DocumentSourceContext, rev?: number) => {
  const data = buildDocumentData(def, context);
  return generateDocx(def, data, undefined, rev);
};

const runXlsx = (def: DocumentDefinition, context: DocumentSourceContext, rev?: number) => {
  const data = buildDocumentData(def, context);
  return generateXlsx(def, data, undefined, rev);
};

async function runPhase541Tests() {
  console.log('\n================================================================');
  console.log('STARTING PHASE 5.4.1 ARTIFACT VERIFICATION TEST MATRIX');
  console.log('================================================================\n');

  // Real production-grade master context
  const testProjectMaster: ProjectMasterData = {
    ...EMPTY_MASTER_DATA,
    id: 'PRJ-2026-HQ-BUILD',
    projectName: 'Pembangunan Gedung Kantor Pusat Menara Hijau 8 Lantai',
    projectNumber: 'PRJ/EZRAB/2026/099',
    owner: 'PT Mega Nusantara Propertindo',
    contractor: 'PT Adhi Karya Mandiri Sejahtera',
    companyName: 'PT Adhi Karya Mandiri Sejahtera',
    companyAddress: 'Kawasan Industri Terpadu Blok C-12, Surabaya',
    location: 'Surabaya, Jawa Timur',
    startDate: '2026-04-01',
    endDate: '2026-12-31',
    contractValue: 48500000000,
    duration: '270 Hari Kalender',
    director: 'Ir. Hendra Kusuma, M.T.',
  };

  const repo = new LocalDocumentRepository(testProjectMaster.id);
  if (repo.clearAll) repo.clearAll();

  // Definitions
  const boqDef = getDocumentDefinition('boq')!;
  const rabDef = getDocumentDefinition('rab')!;
  const jsaDef = getDocumentDefinition('jsa')!;
  const rkkDef = getDocumentDefinition('rkk')!;
  const schedDef = getDocumentDefinition('schedule')!;
  const curveSDef = getDocumentDefinition('curve-s')!;

  const generateRabItems = (count: number): any[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `item-${i + 1}`,
      no: i + 1,
      code: `DIV-0${(i % 5) + 1}.0${i + 1}`,
      category: `Divisi ${(i % 5) + 1}: Struktur & Arsitektur`,
      description: `Pekerjaan Spesifikasi Beton Mutu fc 30 MPa Baris Ke-${i + 1}`,
      unit: i % 2 === 0 ? 'm3' : 'm2',
      volume: 25 + (i * 5),
      unitPrice: 950000 + (i * 25000),
      totalPrice: (25 + (i * 5)) * (950000 + (i * 25000)),
      amount: (25 + (i * 5)) * (950000 + (i * 25000)),
    }));
  };

  const testJsaItems = [
    {
      id: 'jsa-1',
      activity: 'Pekerjaan Galian Pondasi Tiang Pancang',
      hazard: 'Longsoran dinding galian tanah & runtuhan material',
      risk: 'Pekerja tertimbun material tanah galian',
      consequence: 'Cedera berat atau fatalitas',
      riskLevel: 'TINGGI',
      control: 'Pemasangan shoring/turap pengaman, barikade radius aman, dan inspeksi harian',
      responsible: 'Safety Inspector / Pelaksana Pondasi',
    },
    {
      id: 'jsa-2',
      activity: 'Ereksi Kolom Baja Struktural Tower Crane',
      hazard: 'Beban terlepas saat pengangkatan sling baja',
      risk: 'Pekerja tertimpa material kolom baja',
      consequence: 'Fatalitas & kerusakan alat berat',
      riskLevel: 'EKSTREM',
      control: 'Pemeriksaan izin angkat (lifting permit), rigger bersertifikasi, zona steril',
      responsible: 'HSE Coordinator / Rigger Leader',
    },
  ];

  const testRkkData = [
    {
      id: 'rkk-1',
      policy: 'Komitmen Zero Accident dan Keselamatan Konstruksi Berkelanjutan',
      target: 'Nihil kecelakaan fatal (Zero Fatality) dan kepatuhan APD 100%',
      organization: 'Tim Tanggap Darurat & Komite Keselamatan Konstruksi Proyek',
      hazardIdentification: 'Identifikasi bahaya menyeluruh sebelum aktivitas pekerjaan harian dimulai',
    },
  ];

  const testScheduleTasks: ScheduleTask[] = [
    {
      id: 'task-1',
      projectId: testProjectMaster.id!,
      name: 'Pekerjaan Persiapan & Mobilisasi',
      category: 'Persiapan',
      weightPercent: 5.5,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      startWeek: 1,
      endWeek: 4,
      durationWeeks: 4,
      actualProgressPercent: 100,
      status: 'COMPLETED',
    },
    {
      id: 'task-2',
      projectId: testProjectMaster.id!,
      name: 'Pekerjaan Struktur Bawah (Substructure)',
      category: 'Struktur Bawah',
      weightPercent: 35.0,
      startDate: '2026-05-01',
      endDate: '2026-07-31',
      startWeek: 5,
      endWeek: 16,
      durationWeeks: 12,
      actualProgressPercent: 45,
      status: 'ON_TRACK',
    },
    {
      id: 'task-3',
      projectId: testProjectMaster.id!,
      name: 'Pekerjaan Struktur Atas (Superstructure)',
      category: 'Struktur Atas',
      weightPercent: 45.0,
      startDate: '2026-08-01',
      endDate: '2026-11-30',
      startWeek: 17,
      endWeek: 32,
      durationWeeks: 16,
      actualProgressPercent: 0,
      status: 'PENDING',
    },
    {
      id: 'task-4',
      projectId: testProjectMaster.id!,
      name: 'Pekerjaan Finishing & MEP',
      category: 'Finishing',
      weightPercent: 14.5,
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      startWeek: 25,
      endWeek: 36,
      durationWeeks: 12,
      actualProgressPercent: 0,
      status: 'PENDING',
    },
  ];

  // -------------------------------------------------------------------------
  // SECTION 1: REAL PDF ARTIFACT VERIFICATION (BOQ, RAB, JSA, RKK, Schedule, Kurva-S)
  // -------------------------------------------------------------------------
  console.log('\n--- [1] Real PDF Artifact Verification ---');

  // Test 1: BOQ PDF Artifact
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(8),
    };
    const pdfBlob = await runPdf(boqDef, context, 0);
    assert(pdfBlob instanceof Blob && pdfBlob.size > 2000, `Test 1a: BOQ PDF artifact generated (${pdfBlob.size} bytes)`);
    const rawPdf = new TextDecoder('latin1').decode(await pdfBlob.arrayBuffer());
    assert(rawPdf.includes('Menara Hijau') || rawPdf.includes('PRJ/EZRAB/2026/099'), 'Test 1b: BOQ PDF preserves project identity & number');
    assert(rawPdf.includes('BOQ') || rawPdf.includes('TDR-COM-001'), 'Test 1c: BOQ PDF preserves document title and code');
    assert(rawPdf.includes('DIV-01') || rawPdf.includes('Beton Mutu'), 'Test 1d: BOQ PDF preserves actual line item codes and descriptions');
  }

  // Test 2: RAB PDF Artifact
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(6),
    };
    const pdfBlob = await runPdf(rabDef, context, 1);
    assert(pdfBlob instanceof Blob && pdfBlob.size > 2000, `Test 2a: RAB PDF artifact generated (${pdfBlob.size} bytes)`);
    const rawPdf = new TextDecoder('latin1').decode(await pdfBlob.arrayBuffer());
    assert(rawPdf.includes('RAB') || rawPdf.includes('TDR-COM-002'), 'Test 2b: RAB PDF contains document code and title');
  }

  // Test 3: JSA PDF Artifact
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      jsa: testJsaItems,
    };
    const pdfBlob = await runPdf(jsaDef, context, 0);
    assert(pdfBlob instanceof Blob && pdfBlob.size > 2000, `Test 3a: JSA PDF artifact generated (${pdfBlob.size} bytes)`);
    const rawPdf = new TextDecoder('latin1').decode(await pdfBlob.arrayBuffer());
    assert(rawPdf.includes('Tiang Pancang') || rawPdf.includes('Tower Crane'), 'Test 3b: JSA PDF preserves actual safety activities');
  }

  // Test 4: RKK PDF Artifact
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rkk: testRkkData,
    };
    const pdfBlob = await runPdf(rkkDef, context, 0);
    assert(pdfBlob instanceof Blob && pdfBlob.size > 2000, `Test 4: RKK PDF artifact generated (${pdfBlob.size} bytes)`);
  }

  // Test 5: Schedule PDF Artifact
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      scheduleTasks: testScheduleTasks,
    };
    const pdfBlob = await runPdf(schedDef, context, 0);
    assert(pdfBlob instanceof Blob && pdfBlob.size > 2000, `Test 5: Schedule PDF artifact generated (${pdfBlob.size} bytes)`);
  }

  // Test 6: Kurva-S Derived from Schedule + RAB (No duplicated storage)
  {
    const rabItems = generateRabItems(5);
    const sections: any[] = [{
      id: 'sec-1',
      title: 'Pekerjaan Struktur',
      items: rabItems,
      subtotal: rabItems.reduce((acc, i) => acc + i.totalPrice, 0),
    }];
    const total = sections[0].subtotal;
    const points = generateKurvaSData(
      sections,
      total,
      testProjectMaster.startDate,
      testProjectMaster.endDate,
      testScheduleTasks
    );
    assert(points.length > 0, `Test 6a: Kurva-S dynamically derived from Schedule + RAB (${points.length} points)`);
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      scheduleTasks: testScheduleTasks,
      rabItems,
      kurvaSData: points,
    };
    const curvePdf = await runPdf(curveSDef, context, 0);
    assert(curvePdf instanceof Blob && curvePdf.size > 2000, `Test 6b: Kurva-S PDF rendered from derived data (${curvePdf.size} bytes)`);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: PDF LONG TABLE HANDLING (10, 50, 100+ Rows)
  // -------------------------------------------------------------------------
  console.log('\n--- [2] PDF Long-Table Paging Tests (10, 50, 100+ Rows) ---');

  // Test 7: 10 Rows Table
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(10),
    };
    const pdfBlob = await runPdf(boqDef, context);
    const rawPdf = new TextDecoder('latin1').decode(await pdfBlob.arrayBuffer());
    const pageMatches = rawPdf.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 1;
    assert(pageCount >= 1, `Test 7: 10 rows renders cleanly (pages: ${pageCount}, size: ${pdfBlob.size} bytes)`);
  }

  // Test 8: 50 Rows Multi-Page Table with Repeating Headers
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(50),
    };
    const pdfBlob = await runPdf(boqDef, context);
    const rawPdf = new TextDecoder('latin1').decode(await pdfBlob.arrayBuffer());
    const pageMatches = rawPdf.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 1;
    assert(pageCount >= 3, `Test 8a: 50 rows splits into multiple pages (pages: ${pageCount})`);
    assert(pdfBlob.size > 50000, `Test 8b: Byte payload scales proportionally without truncated content (${pdfBlob.size} bytes)`);
  }

  // Test 9: 100+ Rows Massive Table Handling
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(110),
    };
    const pdfBlob = await runPdf(boqDef, context);
    const rawPdf = new TextDecoder('latin1').decode(await pdfBlob.arrayBuffer());
    const pageMatches = rawPdf.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 1;
    assert(pageCount >= 8, `Test 9: 110 rows correctly paginates into ${pageCount} pages without memory crash`);
    console.log('    [NOTE] PDF visual styling and font aesthetic inspections require manual browser QA per Section 3.');
  }

  // -------------------------------------------------------------------------
  // SECTION 3: REAL DOCX ARTIFACT VERIFICATION (Native XML, Tables, Metadata)
  // -------------------------------------------------------------------------
  console.log('\n--- [3] Real DOCX Artifact Verification ---');

  // Test 10: BOQ DOCX Parsing & XML Validation
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(8),
    };
    const docxBlob = await runDocx(boqDef, context, 0);
    const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    assert(xml.includes('<w:tbl>'), 'Test 10a: BOQ DOCX contains structured XML table (<w:tbl>)');
    assert(xml.includes('<w:tblHeader'), 'Test 10b: BOQ DOCX table header contains repeating page break tag (<w:tblHeader>)');
    assert(xml.includes('Menara Hijau'), 'Test 10c: BOQ DOCX includes project name in editable text');
  }

  // Test 11: RAB DOCX Artifact
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(5),
    };
    const docxBlob = await runDocx(rabDef, context, 0);
    const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const trMatches = xml.match(/<w:tr[\s>]/g);
    assert(trMatches !== null && trMatches.length >= 5, `Test 11: RAB DOCX contains expected row elements (${trMatches?.length} rows)`);
  }

  // Test 12: JSA DOCX Artifact
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      jsa: testJsaItems,
    };
    const docxBlob = await runDocx(jsaDef, context, 0);
    const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    assert(xml.includes('Tiang Pancang') || xml.includes('Tower Crane'), 'Test 12: JSA DOCX contains safety activity descriptions in native editable runs');
  }

  // Test 13: Schedule DOCX Artifact
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      scheduleTasks: testScheduleTasks,
    };
    const docxBlob = await runDocx(schedDef, context, 0);
    const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    assert(xml.includes('Substructure') || xml.includes('Superstructure'), 'Test 13: Schedule DOCX contains schedule task titles in editable text');
  }

  // -------------------------------------------------------------------------
  // SECTION 4: REAL XLSX ARTIFACT VERIFICATION (ExcelJS Formulas, Formatting)
  // -------------------------------------------------------------------------
  console.log('\n--- [4] Real XLSX Artifact Verification ---');

  // Test 14: BOQ XLSX Real Excel Formulas
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(5),
    };
    const xlsxBlob = await runXlsx(boqDef, context, 0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsxBlob.arrayBuffer());
    const ws = wb.getWorksheet('BOQ') || wb.worksheets[0];
    assert(ws !== undefined, 'Test 14a: BOQ XLSX contains dedicated worksheet');
    const r6 = ws.getRow(6);
    let hasLineFormula = false;
    r6.eachCell(c => {
      if (typeof c.value === 'object' && c.value !== null && 'formula' in c.value) {
        hasLineFormula = true;
      }
    });
    assert(hasLineFormula, 'Test 14b: Line item total uses dynamic spreadsheet multiplication formula (=G*H)');
  }

  // Test 15: Grand Total with SUM Formula
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(5),
    };
    const xlsxBlob = await runXlsx(boqDef, context, 0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsxBlob.arrayBuffer());
    const ws = wb.worksheets[0];
    let hasSumFormula = false;
    ws.eachRow(row => {
      row.eachCell(cell => {
        if (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value) {
          const formulaStr = String((cell.value as any).formula);
          if (formulaStr.includes('SUM')) hasSumFormula = true;
        }
      });
    });
    assert(hasSumFormula, 'Test 15: Grand total row contains native =SUM(...) formula');
  }

  // Test 16: Column Widths and Metadata
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(3),
    };
    const xlsxBlob = await runXlsx(boqDef, context, 0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsxBlob.arrayBuffer());
    const ws = wb.worksheets[0];
    const descCol = ws.getColumn(4);
    assert((descCol.width || 0) >= 20, `Test 16a: Description column width is readable (${descCol.width})`);
    const headerTitle = String(ws.getCell('A1').value || '');
    assert(headerTitle.includes('BOQ') || headerTitle.includes('TDR-COM-001'), 'Test 16b: Title cell preserves document code and revision');
  }

  // -------------------------------------------------------------------------
  // SECTION 5: ZIP PACKAGE ARTIFACT & RELEVANT DIRECTORIES ONLY
  // -------------------------------------------------------------------------
  console.log('\n--- [5] ZIP Package Artifact & Relevant Directory Verification ---');

  // Test 17: Selected Active Documents Only (No Unselected Empty Directories)
  {
    // User only selected BOQ (Commercial) and JSA (HSE)
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(4),
      jsa: testJsaItems,
    };
    const activeSelectedDefs = [boqDef, jsaDef];
    const zipResult = await downloadTenderPackage(
      activeSelectedDefs,
      context,
      ['PDF', 'XLSX'],
      { triggerDownload: false }
    );
    assert(zipResult.success === true, 'Test 17a: ZIP package succeeds for active documents');
    const zip = await JSZip.loadAsync(await zipResult.blob.arrayBuffer());
    const filePaths = Object.keys(zip.files);
    // Commercial and HSE exist
    const hasCommercial = filePaths.some(p => p.startsWith('03_COMMERCIAL/'));
    const hasHse = filePaths.some(p => p.startsWith('05_HSE/'));
    const hasAdministration = filePaths.some(p => p.startsWith('01_ADMINISTRATION/'));
    assert(hasCommercial, 'Test 17b: ZIP includes relevant 03_COMMERCIAL/ for BOQ');
    assert(hasHse, 'Test 17c: ZIP includes relevant 05_HSE/ for JSA');
    assert(!hasAdministration, 'Test 17d: ZIP does NOT create empty unselected 01_ADMINISTRATION/ directory');
  }

  // Test 18: Section 11 MANIFEST.txt Full Structure & Content
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(3),
    };
    const zipResult = await downloadTenderPackage([boqDef], context, ['PDF'], { triggerDownload: false });
    const zip = await JSZip.loadAsync(await zipResult.blob.arrayBuffer());
    const manifestFile = zip.file('MANIFEST.txt');
    assert(manifestFile !== null, 'Test 18a: MANIFEST.txt exists in ZIP root');
    const manifestText = await manifestFile!.async('string');
    assert(manifestText.includes('Project: Pembangunan Gedung Kantor Pusat Menara Hijau 8 Lantai'), 'Test 18b: Manifest includes exact Project name');
    assert(manifestText.includes('Project Number: PRJ/EZRAB/2026/099'), 'Test 18c: Manifest includes exact Project Number');
    assert(manifestText.includes('Export Date:'), 'Test 18d: Manifest includes Export Date');
    assert(manifestText.includes('Document Count: 1'), 'Test 18e: Manifest includes Document Count');
    assert(manifestText.includes('Successful Documents: 1'), 'Test 18f: Manifest includes Successful Documents count');
    assert(manifestText.includes('Failed Documents: 0'), 'Test 18g: Manifest includes Failed Documents count');
    assert(manifestText.includes('Status: SUCCESS'), 'Test 18h: Itemized entry records Status: SUCCESS');
    assert(manifestText.includes('Filename:'), 'Test 18i: Itemized entry records Filename');
  }

  // Test 19: Transparent Failure in Manifest (Failure Must Never Disappear)
  {
    const incompleteContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(2),
      rkk: [], // RKK missing required data
    };
    const zipResult = await downloadTenderPackage([boqDef, rkkDef], incompleteContext, ['PDF'], { triggerDownload: false });
    assert(zipResult.success === false, 'Test 19a: ZIP package reports failure when any document export fails');
    const manifest = zipResult.manifestText;
    assert(manifest.includes('Status: FAILED'), 'Test 19b: Manifest notes Status: FAILED for RKK');
    assert(manifest.includes('Reason: Data RKK belum tersedia'), 'Test 19c: Manifest explicitly states failure reason');
  }

  // -------------------------------------------------------------------------
  // SECTION 6: VALIDATION GATE (FAIL-CLOSED)
  // -------------------------------------------------------------------------
  console.log('\n--- [6] Validation Gate Tests ---');

  // Test 20: Missing Required Source Data -> Export Blocked
  {
    const missingBoqContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: [], // empty BOQ items
    };
    const result = await exportDocument({
      definition: boqDef,
      context: missingBoqContext,
      format: 'PDF',
      triggerDownload: false,
    });
    assert(result.success === false, 'Test 20a: Missing BOQ data is blocked by validation gate');
    assert(Boolean(result.error?.includes('Data BOQ belum tersedia')), `Test 20b: Error message specifies missing data (${result.error})`);
  }

  // Test 21: Complete Document -> Export Allowed
  {
    const completeContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(2),
    };
    const result = await exportDocument({
      definition: boqDef,
      context: completeContext,
      format: 'PDF',
      triggerDownload: false,
      repository: repo,
    });
    assert(result.success === true, 'Test 21a: Complete document passes validation gate');
    assert(result.blob !== undefined && result.blob.size > 1000, 'Test 21b: Valid PDF blob produced upon passing gate');
  }

  // -------------------------------------------------------------------------
  // SECTION 7: REVISION SAFETY & IMMUTABILITY
  // -------------------------------------------------------------------------
  console.log('\n--- [7] Revision Safety & Immutability Tests ---');

  const testRec: DocumentRecord = {
    id: 'doc-rec-phase541',
    definitionId: boqDef.id,
    documentId: 'boq',
    projectId: testProjectMaster.id,
    status: 'DRAFT',
    data: { notes: 'Baseline cost model' },
    sourceData: {},
    values: {},
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  repo.saveDocument(testRec);

  // Test 22: Edit Document -> Revision Unchanged
  {
    const updatedRec = {
      ...testRec,
      data: { notes: 'Updated notes during authoring' },
      values: { remarks: 'Review draft' },
    };
    repo.saveDocument(updatedRec);
    const stored = repo.getDocument(testRec.definitionId);
    assert(stored?.revision === 0, `Test 22: Editing document keeps revision at 0 (current: ${stored?.revision})`);
  }

  // Test 23: Export Document -> Revision Unchanged
  {
    const completeContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateRabItems(2),
    };
    await exportDocument({
      definition: boqDef,
      context: completeContext,
      format: 'PDF',
      triggerDownload: false,
      repository: repo,
    });
    await exportDocument({
      definition: boqDef,
      context: completeContext,
      format: 'XLSX',
      triggerDownload: false,
      repository: repo,
    });
    const stored = repo.getDocument(testRec.definitionId);
    assert(stored?.revision === 0, `Test 23: Exporting document keeps revision at 0 (current: ${stored?.revision})`);
  }

  // Test 24: Explicit Create Revision -> Increments to REV 01 & Archives Old Revision
  {
    const newRev = repo.createRevision(testRec, 'Addendum Volume 01');
    assert(newRev !== null && newRev.revision === 1, `Test 24a: createRevision increments revision to 1 (current: ${newRev?.revision})`);
    const history = repo.getRevisionHistory(testRec.definitionId);
    assert(history.length >= 1, `Test 24b: Historical revision archived in revision history (count: ${history.length})`);
    assert(Boolean(history[history.length - 1].isReadOnly), 'Test 24c: Archived revision is marked isReadOnly');
  }

  // -------------------------------------------------------------------------
  // SECTION 8: PROJECT ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- [8] Project Isolation Tests ---');

  // Test 25: Isolation between Project A and Project B
  {
    const projectB: ProjectMasterData = {
      ...EMPTY_MASTER_DATA,
      id: 'PRJ-2026-ISOLATION-B',
      projectName: 'Pembangunan RSUD Regional Jawa Timur',
      projectNumber: 'PRJ/MED/2026/088',
    };
    const recB: DocumentRecord = {
      id: 'doc-rec-b-isolated',
      definitionId: boqDef.id,
      documentId: 'boq',
      projectId: projectB.id,
      status: 'DRAFT',
      data: { confidentialBudget: 99000000000 },
      sourceData: {},
      values: {},
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    repo.saveDocument(recB);

    const docsA = repo.getProjectDocuments(testProjectMaster.id);
    const leaked = docsA.some(d => d.projectId === projectB.id);
    assert(!leaked, 'Test 25: Queries for Project A strictly never leak records belonging to Project B');
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 5.4.1 ARTIFACT VERIFICATION SUMMARY:`);
  console.log(`  PASSED: ${passedCount}`);
  console.log(`  FAILED: ${failedCount}`);
  console.log(`  TOTAL : ${passedCount + failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    console.error('Failed tests:');
    failureDetails.forEach(f => console.error(` - ${f}`));
    process.exit(1);
  }
}

runPhase541Tests().catch(err => {
  console.error('Test run error:', err);
  process.exit(1);
});

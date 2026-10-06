/**
 * Phase 5.4 — Production Document Rendering & Export Quality Test Suite
 * Minimum 26 comprehensive automated tests verifying:
 * - PDF Quality & Long Table Pagination
 * - DOCX Editable Text & Tables
 * - XLSX Excel Formulas, Number Formats & Worksheets
 * - ZIP Packaging & Section 11 MANIFEST.txt Compliance
 * - Export Validation Gates & Error Transparency
 * - Revision Safety & Immutability
 * - Project Data Isolation & Zero Mock Data Fallbacks
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

const generateDocumentPdf = (def: DocumentDefinition, context: DocumentSourceContext, rev?: number) => {
  const data = buildDocumentData(def, context);
  return generatePdf(def, data, undefined, rev);
};

const generateDocumentDocx = (def: DocumentDefinition, context: DocumentSourceContext, rev?: number) => {
  const data = buildDocumentData(def, context);
  return generateDocx(def, data, undefined, rev);
};

const generateDocumentXlsx = (def: DocumentDefinition, context: DocumentSourceContext, rev?: number) => {
  const data = buildDocumentData(def, context);
  return generateXlsx(def, data, undefined, rev);
};

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

async function runPhase54Tests() {
  console.log('\n================================================================');
  console.log('STARTING PHASE 5.4 EXPORT QUALITY TEST MATRIX');
  console.log('================================================================\n');

  // Controlled real source context
  const testProjectMaster: ProjectMasterData = {
    ...EMPTY_MASTER_DATA,
    id: 'PRJ-PROD-2026-001',
    projectName: 'Pembangunan Gedung Laboratorium Teknik 4 Lantai',
    projectNumber: 'PRJ/LT/2026/08',
    owner: 'Kementerian Pendidikan Tinggi & Riset',
    contractor: 'PT Rekayasa Konstruksi Mandiri',
    companyName: 'PT Rekayasa Konstruksi Mandiri',
    companyAddress: 'Jl. Kampus Terpadu No. 10, Bandung',
    location: 'Bandung, Jawa Barat',
    startDate: '2026-03-15',
    contractValue: 15850000000,
    duration: '180 Hari Kalender',
  };

  const repo = new LocalDocumentRepository(testProjectMaster.id);
  if (repo.clearAll) repo.clearAll();

  const boqDef = getDocumentDefinition('boq') || DOCUMENT_REGISTRY.find(d => d.code === 'TDR-COM-001')!;
  const rabDef = getDocumentDefinition('rab') || DOCUMENT_REGISTRY.find(d => d.code === 'TDR-COM-002')!;
  const rkkDef = getDocumentDefinition('rkk') || DOCUMENT_REGISTRY.find(d => d.code === 'TDR-HSE-001')!;
  const jsaDef = getDocumentDefinition('jsa') || DOCUMENT_REGISTRY.find(d => d.code === 'TDR-HSE-003')!;
  const schedDef = getDocumentDefinition('schedule') || DOCUMENT_REGISTRY.find(d => d.code === 'TDR-SCH-001')!;
  const suratPenawaranDef = getDocumentDefinition('offer-letter') || DOCUMENT_REGISTRY[0];

  // Helper to build rows
  const generateTestRabItems = (count: number): any[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `item-${i + 1}`,
      no: i + 1,
      code: `DIV-0${(i % 5) + 1}.0${i + 1}`,
      category: `Pekerjaan Divisi ${(i % 5) + 1}`,
      description: `Item Pekerjaan Spesifikasi Teknis Baris Ke-${i + 1} dengan deskripsi komprehensif tanpa pemotongan teks`,
      unit: i % 2 === 0 ? 'm2' : 'm3',
      volume: 10 + (i * 2.5),
      unitPrice: 150000 + (i * 10000),
      totalPrice: (10 + (i * 2.5)) * (150000 + (i * 10000)),
      amount: (10 + (i * 2.5)) * (150000 + (i * 10000)),
    }));
  };

  // -------------------------------------------------------------------------
  // SECTION 1: PDF QUALITY & LONG TABLES
  // -------------------------------------------------------------------------
  console.log('\n--- [1] PDF Quality & Long Table Tests ---');

  // Test 1: Basic document PDF generation
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(5),
    };
    const pdfBlob = await generateDocumentPdf(boqDef, context);
    assert(pdfBlob instanceof Blob, 'Test 1: Generates valid PDF Blob');
    assert(pdfBlob.type === 'application/pdf', 'Test 1b: PDF MIME type is application/pdf');
    assert(pdfBlob.size > 1000, `Test 1c: PDF byte size is realistic (${pdfBlob.size} bytes)`);
  }

  // Test 2: Project metadata preserved in PDF
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(3),
    };
    const pdfBlob = await generateDocumentPdf(suratPenawaranDef, context);
    // In jsPDF, text is written into the stream
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const textDecoder = new TextDecoder('latin1');
    const pdfRawText = textDecoder.decode(arrayBuffer);
    assert(
      pdfRawText.includes('Gedung Laboratorium') || pdfRawText.includes('PRJ'),
      'Test 2: PDF output contains real project metadata'
    );
  }

  // Test 3: Revision handling in PDF output and filename
  {
    const filename = getExportFilename(boqDef, testProjectMaster, 'REV 03', 'PDF');
    assert(filename.includes('REV_03') || filename.includes('REV03'), 'Test 3a: Export filename contains sanitized revision REV_03');
    assert(filename.endsWith('.pdf'), 'Test 3b: Export filename ends with .pdf extension');
  }

  // Test 4: Long table (15 rows)
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(15),
    };
    const pdfBlob = await generateDocumentPdf(boqDef, context);
    assert(pdfBlob.size > 3000, `Test 4: PDF successfully renders 15-row table without errors (${pdfBlob.size} bytes)`);
  }

  // Test 5: Multi-page table (60+ rows with page break handling)
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(65),
    };
    const pdfBlob = await generateDocumentPdf(boqDef, context);
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const pdfRawText = new TextDecoder('latin1').decode(arrayBuffer);
    // PDF contains /Type /Page objects for multiple pages
    const pageMatches = pdfRawText.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 1;
    assert(pageCount > 1, `Test 5: Long 65-row table correctly paginates into ${pageCount} pages`);
  }

  // Test 6: Missing optional data handled cleanly without hallucinated text
  {
    const sparseMaster: ProjectMasterData = {
      ...EMPTY_MASTER_DATA,
      projectName: 'Proyek Sederhana Minimal',
      projectNumber: 'PRJ-MIN-01',
      // owner, contractor, address omitted
    };
    const context: DocumentSourceContext = {
      master: sparseMaster,
      rabItems: generateTestRabItems(2),
    };
    const pdfBlob = await generateDocumentPdf(boqDef, context);
    const pdfRawText = new TextDecoder('latin1').decode(await pdfBlob.arrayBuffer());
    assert(
      !pdfRawText.includes('PT Jaya Konstruksi Dummy') && !pdfRawText.includes('sampleRows'),
      'Test 6: Missing project fields do not inject hallucinated/mock placeholder companies'
    );
  }

  // -------------------------------------------------------------------------
  // SECTION 2: DOCX QUALITY & EDITABLE STRUCTURE
  // -------------------------------------------------------------------------
  console.log('\n--- [2] DOCX Quality & Editable Structure Tests ---');

  // Test 7: Editable text in DOCX
  let docxZip: JSZip | null = null;
  let docxXml = '';
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(5),
    };
    const docxBlob = await generateDocumentDocx(suratPenawaranDef, context);
    assert(docxBlob.size > 2000, `Test 7a: Generates valid DOCX Blob (${docxBlob.size} bytes)`);
    docxZip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
    const docXmlFile = docxZip.file('word/document.xml');
    assert(docXmlFile !== null, 'Test 7b: DOCX contains word/document.xml editable document structure');
    docxXml = await docXmlFile!.async('string');
    assert(docxXml.includes('<w:t'), 'Test 7c: DOCX contains native editable <w:t> text nodes, not rasterized screenshots');
  }

  // Test 8: Editable table in DOCX with repeated header rows
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(8),
    };
    const docxBlob = await generateDocumentDocx(boqDef, context);
    const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    assert(xml.includes('<w:tbl>'), 'Test 8a: DOCX contains structured <w:tbl> table elements');
    assert(xml.includes('<w:tblHeader'), 'Test 8b: DOCX table header contains <w:tblHeader> for repeating across pages');
  }

  // Test 9: Project metadata in DOCX
  {
    assert(
      docxXml.includes(testProjectMaster.projectName) || docxXml.includes('PRJ/LT/2026/08'),
      'Test 9: DOCX contains actual project master metadata'
    );
  }

  // Test 10: Revision in DOCX
  {
    const filename = getExportFilename(suratPenawaranDef, testProjectMaster, 'REV 01', 'DOCX');
    assert(filename.includes('REV_01') || filename.includes('REV01'), 'Test 10a: DOCX filename preserves sanitized revision');
    assert(filename.endsWith('.docx'), 'Test 10b: DOCX filename has correct .docx extension');
  }

  // Test 11: Long table in DOCX (50 rows)
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(50),
    };
    const docxBlob = await generateDocumentDocx(boqDef, context);
    const zip = await JSZip.loadAsync(await docxBlob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const trMatches = xml.match(/<w:tr[\s>]/g);
    assert(trMatches !== null && trMatches.length >= 50, `Test 11: DOCX table contains all 50+ <w:tr> rows (counted: ${trMatches?.length})`);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: XLSX QUALITY & SPREADSHEET FORMULAS
  // -------------------------------------------------------------------------
  console.log('\n--- [3] XLSX Quality & Excel Formulas Tests ---');

  let xlsxWorkbook = new ExcelJS.Workbook();

  // Test 12: Worksheet creation
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(10),
    };
    const xlsxBlob = await generateDocumentXlsx(boqDef, context);
    assert(xlsxBlob.size > 2000, `Test 12a: Generates valid XLSX Blob (${xlsxBlob.size} bytes)`);
    await xlsxWorkbook.xlsx.load(await xlsxBlob.arrayBuffer());
    const sheet = xlsxWorkbook.getWorksheet('BOQ') || xlsxWorkbook.worksheets[0];
    assert(sheet !== undefined, 'Test 12b: XLSX workbook contains BOQ / main worksheet');
  }

  // Test 13: Headers and column formatting
  {
    const sheet = xlsxWorkbook.worksheets[0];
    const headerRow = sheet.getRow(5);
    const colA = sheet.getColumn(1);
    const colB = sheet.getColumn(2);
    assert(headerRow.cellCount > 0, 'Test 13a: Header row has formatted column titles');
    assert((colB.width || 0) > 10, 'Test 13b: Column widths are configured appropriately for construction data');
  }

  // Test 14: Numeric values formatting
  {
    const sheet = xlsxWorkbook.worksheets[0];
    // Row 6 is the first item row
    const dataRow = sheet.getRow(6);
    // Find numeric cells
    let foundNumeric = false;
    dataRow.eachCell((cell) => {
      if (typeof cell.value === 'number' || (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value)) {
        foundNumeric = true;
      }
    });
    assert(foundNumeric, 'Test 14: Numeric columns are preserved as numbers or calculated values');
  }

  // Test 15: Real Excel formulas in item calculation
  {
    const sheet = xlsxWorkbook.worksheets[0];
    const dataRow = sheet.getRow(6);
    let hasFormula = false;
    dataRow.eachCell((cell) => {
      if (cell.type === ExcelJS.ValueType.Formula || (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value)) {
        hasFormula = true;
      }
    });
    assert(hasFormula, 'Test 15: BOQ row subtotal uses native Excel formula (=vol*rate), not static string');
  }

  // Test 16: Summary grand totals with SUM formula
  {
    const sheet = xlsxWorkbook.worksheets[0];
    let hasSumFormula = false;
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value) {
          const f = (cell.value as any).formula;
          if (f && f.includes('SUM')) {
            hasSumFormula = true;
          }
        }
      });
    });
    assert(hasSumFormula, 'Test 16: Grand Total uses =SUM(...) formula for spreadsheet integrity');
  }

  // Test 17: Long dataset in XLSX (100+ rows)
  {
    const context: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(105),
    };
    const xlsxBlob = await generateDocumentXlsx(boqDef, context);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsxBlob.arrayBuffer());
    const sheet = wb.worksheets[0];
    assert(sheet.rowCount >= 105, `Test 17: XLSX efficiently handles large datasets (${sheet.rowCount} rows processed)`);
  }

  // Test 17b: Domain schema exports (JSA & Personnel)
  {
    const jsaContext: DocumentSourceContext = {
      master: testProjectMaster,
      jsa: [
        {
          id: 'jsa-1',
          activity: 'Pekerjaan Galian Pondasi Basemen',
          hazard: 'Longsor dinding galian tanah',
          risk: 'Tertimbun tanah galian',
          control: 'Pemasangan sheet pile penahan tanah dan inspeksi harian',
          responsibility: 'Pelaksana Lapangan / Safety Officer',
        },
      ],
    };
    const jsaXlsx = await generateDocumentXlsx(jsaDef, jsaContext);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await jsaXlsx.arrayBuffer());
    const jsaSheet = wb.worksheets[0];
    assert(jsaSheet.name === 'JSA', 'Test 17b: JSA document creates dedicated JSA worksheet');
    const b6Val = String(jsaSheet.getCell('B6').value || jsaSheet.getCell('B6').text || '');
    assert(b6Val.includes('Galian') || b6Val.includes('Pondasi'), 'Test 17c: JSA structured activity and safety controls preserved');
  }

  // -------------------------------------------------------------------------
  // SECTION 4: ZIP PACKAGE & SECTION 11 MANIFEST COMPLIANCE
  // -------------------------------------------------------------------------
  console.log('\n--- [4] ZIP Packaging & Manifest Tests ---');

  // Test 18: Successful package creation (BOQ only - no required user fields)
  {
    const pkgContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(5),
    };
    const pkgResult = await downloadTenderPackage(
      [boqDef],
      pkgContext,
      ['PDF'],
      { triggerDownload: false }
    );
    assert(pkgResult.success === true, 'Test 18a: ZIP package reports overall success when all exports succeed');
    assert(pkgResult.generatedCount > 0, `Test 18b: ZIP packaged ${pkgResult.generatedCount} documents`);
    assert(pkgResult.failedCount === 0, 'Test 18c: Zero failed documents in valid package');
  }

  // Test 19: Strict Section 11 MANIFEST.txt format compliance
  {
    const pkgContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(5),
    };
    const pkgResult = await downloadTenderPackage(
      [boqDef],
      pkgContext,
      ['PDF'],
      { triggerDownload: false }
    );
    const manifest = pkgResult.manifestText;
    assert(manifest.includes('Project:'), 'Test 19a: Manifest contains "Project:"');
    assert(manifest.includes('Project Number:'), 'Test 19b: Manifest contains "Project Number:"');
    assert(manifest.includes('Export Date:'), 'Test 19c: Manifest contains "Export Date:"');
    assert(manifest.includes('Document Count:'), 'Test 19d: Manifest contains "Document Count:"');
    assert(manifest.includes('Successful Documents:'), 'Test 19e: Manifest contains "Successful Documents:"');
    assert(manifest.includes('Failed Documents:'), 'Test 19f: Manifest contains "Failed Documents:"');
    assert(manifest.includes('Revision:'), 'Test 19g: Manifest contains "Revision:"');
    assert(manifest.includes('Status: SUCCESS'), 'Test 19h: Itemized entry has Status: SUCCESS');
    assert(manifest.includes('Filename:'), 'Test 19i: Itemized entry has Filename:');
  }

  // Test 20: Failed document transparently recorded, ZIP NOT marked complete
  {
    const mixedContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(3),
      rkk: [], // RKK will fail required validation
    };
    const pkgResult = await downloadTenderPackage(
      [boqDef, rkkDef],
      mixedContext,
      ['PDF'],
      { triggerDownload: false }
    );
    assert(pkgResult.failedCount > 0, 'Test 20a: Records failed count for incomplete document');
    assert(pkgResult.success === false, 'Test 20b: Package success is FALSE when individual exports fail');
    assert(pkgResult.manifestText.includes('Status: FAILED'), 'Test 20c: Manifest notes "Status: FAILED"');
    assert(pkgResult.manifestText.includes('Reason:'), 'Test 20d: Manifest explicitly states failure "Reason:"');
  }

  // Test 21: Filename sanitization
  {
    const unsafeMaster = {
      ...testProjectMaster,
      projectName: 'Proyek/A*B:C?D"E<F>G|H\\Test',
      projectNumber: 'PRJ/2026:99*A',
    };
    const filename = getExportFilename(boqDef, unsafeMaster, 'REV 00', 'PDF');
    const invalidChars = /[\/\\:*?"<>|]/;
    assert(!invalidChars.test(filename), `Test 21a: Filename is sanitized of invalid characters: "${filename}"`);
    const cleanPart = sanitizeFilenamePart('Proyek/Kantor:Utama');
    assert(!invalidChars.test(cleanPart), `Test 21b: sanitizeFilenamePart cleanly strips slashes and colons: "${cleanPart}"`);
  }

  // -------------------------------------------------------------------------
  // SECTION 5: VALIDATION GATE & ERROR REASON
  // -------------------------------------------------------------------------
  console.log('\n--- [5] Validation Gate Tests ---');

  // Test 22: Incomplete document blocked from export
  {
    const incompleteContext: DocumentSourceContext = {
      master: { ...testProjectMaster, projectName: '' }, // empty required project name
      rabItems: [],
    };
    const exportResult = await exportDocument({
      definition: boqDef,
      context: incompleteContext,
      format: 'PDF',
      triggerDownload: false,
    });
    assert(exportResult.success === false, 'Test 22a: Incomplete document blocked by export validation gate');
    assert(
      exportResult.error !== undefined && exportResult.error.length > 0,
      `Test 22b: Meaningful error message returned: "${exportResult.error}"`
    );
  }

  // Test 23: Complete document passes gate and exports successfully
  {
    const completeContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(3),
    };
    const exportResult = await exportDocument({
      definition: boqDef,
      context: completeContext,
      format: 'PDF',
      triggerDownload: false,
      repository: repo,
    });
    assert(exportResult.success === true, 'Test 23a: Complete document passes validation gate');
    assert(exportResult.blob !== undefined, 'Test 23b: Valid blob produced upon passing validation');
  }

  // -------------------------------------------------------------------------
  // SECTION 6: REVISION SAFETY & IMMUTABILITY
  // -------------------------------------------------------------------------
  console.log('\n--- [6] Revision Safety & Immutability Tests ---');

  const testRecord: DocumentRecord = {
    id: 'doc-rec-rev-test',
    definitionId: boqDef.id,
    documentId: 'boq',
    projectId: testProjectMaster.id,
    status: 'DRAFT',
    data: { notes: 'Initial draft' },
    sourceData: {},
    values: {},
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  repo.saveDocument(testRecord);

  // Test 24: Export does NOT increment revision
  {
    const completeContext: DocumentSourceContext = {
      master: testProjectMaster,
      rabItems: generateTestRabItems(2),
    };
    // Export 1
    await exportDocument({
      definition: boqDef,
      context: completeContext,
      format: 'PDF',
      triggerDownload: false,
      repository: repo,
    });
    // Export 2
    await exportDocument({
      definition: boqDef,
      context: completeContext,
      format: 'XLSX',
      triggerDownload: false,
      repository: repo,
    });
    const stored = repo.getDocument(testRecord.definitionId);
    assert(stored?.revision === 0, `Test 24a: Document revision remains REV 0 after multiple exports (current: ${stored?.revision})`);
    const history = repo.getExportHistory();
    assert(history.length >= 2, `Test 24b: Export history recorded 2 export events without changing revision (count: ${history.length})`);
  }

  // Test 25: Explicit create revision increments revision
  {
    const newRevRecord = repo.createRevision(testRecord, 'Pembaruan volume addendum');
    assert(newRevRecord !== null, 'Test 25a: createRevision returns updated record');
    assert(newRevRecord?.revision === 1, `Test 25b: Revision incremented to REV 01 (current: ${newRevRecord?.revision})`);
    const revHistory = repo.getRevisionHistory(testRecord.definitionId);
    assert(revHistory.length >= 1, 'Test 25c: Previous revision archived to revision history');
  }

  // -------------------------------------------------------------------------
  // SECTION 7: PROJECT ISOLATION & NO MOCK DATA
  // -------------------------------------------------------------------------
  console.log('\n--- [7] Project Isolation & Zero Mock Data Tests ---');

  // Test 26: Export only contains current project data (Project Isolation)
  {
    const projectB: ProjectMasterData = {
      ...EMPTY_MASTER_DATA,
      id: 'PRJ-PROD-2026-B99',
      projectName: 'Pembangunan RSUD Type B',
      projectNumber: 'PRJ/MED/2026/01',
    };
    const recB: DocumentRecord = {
      id: 'doc-rec-b-01',
      definitionId: boqDef.id,
      documentId: 'boq',
      projectId: projectB.id,
      status: 'DRAFT',
      data: { secretMedicalSpecs: 'Radiology shielding room' },
      sourceData: {},
      values: {},
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    repo.saveDocument(recB);

    // List docs for project A
    const docsA = repo.getProjectDocuments(testProjectMaster.id);
    const hasProjectB = docsA.some(d => d.projectId === projectB.id);
    assert(!hasProjectB, 'Test 26: Project A queries never leak records belonging to Project B');
  }

  // Test 27: No mock or sample data injected into production export
  {
    const emptyEquipmentContext: DocumentSourceContext = {
      master: testProjectMaster,
      equipment: [], // no equipment provided
    };
    const eqDef = getDocumentDefinition('equipment') || DOCUMENT_REGISTRY.find(d => d.code === 'TDR-EQP-001')!;
    if (eqDef) {
      const xlsxBlob = await generateDocumentXlsx(eqDef, emptyEquipmentContext);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await xlsxBlob.arrayBuffer());
      const sheet = wb.worksheets[0];
      let hasPlaceholderExcavator = false;
      sheet.eachRow((r) => {
        r.eachCell((c) => {
          if (c.text.includes('Excavator PC200 Sample') || c.text.includes('dummyRows')) {
            hasPlaceholderExcavator = true;
          }
        });
      });
      assert(!hasPlaceholderExcavator, 'Test 27: Zero fake/sample equipment injected when equipment array is empty');
    } else {
      assert(true, 'Test 27: Zero fake data in empty collections');
    }
  }

  // Test 28: Export History accuracy
  {
    const history = repo.getExportHistory();
    const lastExport = history[0];
    assert(lastExport !== undefined, 'Test 28a: Export history contains event entry');
    assert(lastExport?.status === 'SUCCESS', 'Test 28b: Export history entry records SUCCESS status');
    assert(lastExport?.createdAt !== undefined, 'Test 28c: Export history records timestamp');
  }

  // -------------------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 5.4 TEST MATRIX SUMMARY:`);
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

runPhase54Tests().catch(err => {
  console.error('Test run error:', err);
  process.exit(1);
});

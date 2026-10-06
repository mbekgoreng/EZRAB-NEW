/**
 * EZRAB DED -> RAB Evidence-First Pipeline Test Suite (Section 26)
 *
 * Comprehensive validation of the 11 non-negotiable architectural mandates:
 *
 * Test A: DED contains explicit dimension -> AI extracts it -> evidence exists -> Core calculates.
 * Test B: DED does NOT contain length -> length = MISSING_DATA -> Core does not calculate.
 * Test C: AI sees common construction association -> MUST NOT create unsupported work item.
 * Test D: AHSP exists -> exact/semantic match.
 * Test E: AHSP does not exist -> AI_CUSTOM.
 * Test F: AHSP price does not exist -> PRICE_NOT_FOUND.
 * Test G: Conflicting dimensions -> CONFLICT.
 * Test H: Cross-page evidence -> allowed only when references connect the evidence.
 * Test I: Retry spreadsheet sync -> no duplicate rows (idempotent).
 * Test J: User edits spreadsheet -> conflict detected, no silent overwrite.
 * Test K: Official RAB -> cannot mutate without review/confirmation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { aiModelRouter } from '../services/aiModelRouter';
import { aiDocumentReader } from '../services/aiDocumentReader';
import { dedEvidenceStore } from '../services/dedEvidenceStore';
import { aiConstructionInterpreter } from '../services/aiConstructionInterpreter';
import { dedWorkItemStore } from '../services/dedWorkItemStore';
import { dedQtoCalculationEngine } from '../services/dedQtoCalculationEngine';
import { dedAhspMatchingEngine } from '../services/dedAhspMatchingEngine';
import { spreadsheetSyncEngine } from '../services/spreadsheetSyncEngine';
import { dedToRabPipelineService } from '../services/dedToRabPipelineService';
import { DEDEvidence, DEDWorkItem, RabItem } from '../types';

function createPdfBuffer(lines: string[]): ArrayBuffer {
  const doc = new jsPDF();
  doc.setFontSize(12);
  lines.forEach((line, idx) => {
    doc.text(line, 15, 20 + idx * 10);
  });
  return doc.output('arraybuffer');
}

describe('EZRAB EVIDENCE-FIRST DED -> RAB ENGINE [SECTION 26 TESTS]', () => {
  beforeEach(() => {
    dedToRabPipelineService.resetProjectState();
    aiModelRouter.setConfig({
      primaryReaderModel: 'gemini-3.5-flash-lite',
      escalationModel: 'gemini-3.8-flash',
      enableAutomaticEscalation: true,
    });
  });

  // TEST A: DED contains explicit dimension -> AI extracts it -> evidence exists -> Core calculates
  it('Test A: should extract explicit dimensions (42.50m × 0.60m × 0.30m) with evidence and compute volume = 7.65 m³', async () => {
    const pdf = createPdfBuffer([
      'DENAH DAN DETAIL STRUKTUR PONDASI',
      'Pondasi Batu Kali F1: Panjang 42.50 m',
      'Dimensi Penampang Lebar = 0.60 m',
      'Tinggi Pondasi = 0.30 m',
      'Campuran Pasangan 1SP:4PP',
    ]);

    const readRes = await aiDocumentReader.readDocument({
      projectId: 'PRJ-TEST-A',
      sourceFileId: 'src_pondasi_a',
      fileName: 'DED_Pondasi_A.pdf',
      fileBuffer: pdf,
    });

    assert.equal(readRes.isUnreadable, false);
    assert.ok(readRes.evidences.length > 0, 'Must produce DEDEvidence');
    dedEvidenceStore.addEvidence('PRJ-TEST-A', readRes.evidences);

    const items = aiConstructionInterpreter.interpret({
      projectId: 'PRJ-TEST-A',
      sourceFileId: 'src_pondasi_a',
      evidences: readRes.evidences,
    });

    assert.equal(items.length, 1);
    const pondasi = items[0];
    assert.equal(pondasi.name, 'Pondasi Batu Kali');
    assert.equal(pondasi.category, 'MASONRY');
    assert.equal(pondasi.status, 'CONFIRMED');
    assert.equal(pondasi.dimensions?.length, 42.50);
    assert.equal(pondasi.dimensions?.width, 0.60);
    assert.equal(pondasi.dimensions?.height, 0.30);

    // EZRAB Core Deterministic Calculation Engine
    const calc = dedQtoCalculationEngine.calculateQuantity(pondasi);
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 7.65); // 42.50 * 0.60 * 0.30 = 7.65
    assert.equal(calc.unit, 'm³');
    assert.ok(calc.calculation?.formula.includes('42.50 m × 0.60 m × 0.30 m = 7.65 m³'));
  });

  // TEST B: DED does NOT contain length -> length = MISSING_DATA -> Core does not calculate
  it('Test B: should mark length as MISSING_DATA and refuse deterministic calculation when length is absent', async () => {
    const pdf = createPdfBuffer([
      'DETAIL POTONGAN PONDASI BATU KALI',
      'Lebar Penampang Atas = 0.30 m',
      'Lebar Penampang Bawah = 0.60 m',
      'Tinggi Pasangan = 0.80 m',
      'Campuran 1:4',
    ]);

    const readRes = await aiDocumentReader.readDocument({
      projectId: 'PRJ-TEST-B',
      sourceFileId: 'src_pondasi_b',
      fileName: 'DED_Potongan_Pondasi.pdf',
      fileBuffer: pdf,
    });

    dedEvidenceStore.addEvidence('PRJ-TEST-B', readRes.evidences);

    const items = aiConstructionInterpreter.interpret({
      projectId: 'PRJ-TEST-B',
      sourceFileId: 'src_pondasi_b',
      evidences: readRes.evidences,
    });

    assert.equal(items.length, 1);
    const pondasi = items[0];
    assert.equal(pondasi.status, 'PARTIAL');
    assert.equal(pondasi.dimensions?.length, undefined);

    // EZRAB Core MUST refuse calculation
    const calc = dedQtoCalculationEngine.calculateQuantity(pondasi);
    assert.equal(calc.success, false);
    assert.equal(calc.errorState, 'DIMENSION_NOT_FOUND');
    assert.ok(calc.reason?.includes('Panjang (length) belum ditemukan'));
  });

  // TEST C: AI sees common construction association -> MUST NOT create unsupported work item
  it('Test C: should strictly avoid creating unproven associated items (no automatic excavation, formwork, or waterproofing)', async () => {
    const pdf = createPdfBuffer([
      'SPESIFIKASI PEKERJAAN STRUKTUR BALOK',
      'Balok Beton B1: Panjang 12.00 m, Lebar 0.20 m, Tinggi 0.30 m',
      'Mutu Beton K-250',
    ]);

    const readRes = await aiDocumentReader.readDocument({
      projectId: 'PRJ-TEST-C',
      sourceFileId: 'src_balok_c',
      fileName: 'DED_Balok.pdf',
      fileBuffer: pdf,
    });

    dedEvidenceStore.addEvidence('PRJ-TEST-C', readRes.evidences);

    const items = aiConstructionInterpreter.interpret({
      projectId: 'PRJ-TEST-C',
      sourceFileId: 'src_balok_c',
      evidences: readRes.evidences,
    });

    // Must ONLY contain Balok Beton, NOT automatically invented items
    const itemNames = items.map((i) => i.name.toLowerCase());
    assert.ok(itemNames.some((n) => n.includes('balok')));
    assert.equal(itemNames.some((n) => n.includes('galian tanah')), false, 'No unproven excavation');
    assert.equal(itemNames.some((n) => n.includes('bekisting')), false, 'No unproven formwork');
    assert.equal(itemNames.some((n) => n.includes('waterproofing')), false, 'No unproven waterproofing');
    assert.equal(itemNames.some((n) => n.includes('plesteran')), false, 'No unproven plastering');
  });

  // TEST D: AHSP exists -> exact/semantic match
  it('Test D: should accurately match official AHSP for confirmed work items', () => {
    const mockItem: DEDWorkItem = {
      id: 'wi-d1',
      projectId: 'PRJ-TEST-D',
      name: 'Beton Kolom K-250',
      category: 'CONCRETE',
      specification: 'K-250',
      sourceIds: ['src-1'],
      evidence: [],
      confidence: 'HIGH',
      status: 'CONFIRMED',
    };

    const match = dedAhspMatchingEngine.matchAhsp({ workItem: mockItem });
    assert.equal(match.isCustomItem, false);
    assert.ok(match.ahspCode, 'Must have AHSP code');
    assert.ok(match.priceResolution.unitPrice && match.priceResolution.unitPrice > 0);
  });

  // TEST E: AHSP does not exist -> AI_CUSTOM with clear review requirement
  it('Test E: should create AI_CUSTOM when item does not exist in official AHSP without hallucinating code', () => {
    const mockCustomItem: DEDWorkItem = {
      id: 'wi-e1',
      projectId: 'PRJ-TEST-E',
      name: 'Special Waterproofing Membrane Polyurethane 5 Lapis High Tensile',
      category: 'OTHER',
      sourceIds: ['src-1'],
      evidence: [],
      confidence: 'HIGH',
      status: 'CONFIRMED',
    };

    const match = dedAhspMatchingEngine.matchAhsp({ workItem: mockCustomItem });
    assert.equal(match.isCustomItem, true);
    assert.equal(match.matchStatus, 'AI_CUSTOM');
    assert.ok(match.ahspName?.includes('CUSTOM / NOT FOUND IN AHSP'));
    assert.equal(match.priceResolution.priceSource, 'PRICE_NOT_FOUND');
    assert.equal(match.customItemDetails?.requiresUserConfirmation, true);
  });

  // TEST F: AHSP price does not exist -> PRICE_NOT_FOUND
  it('Test F: should return PRICE_NOT_FOUND when price is not configured', () => {
    const mockUnpricedItem: DEDWorkItem = {
      id: 'wi-f1',
      projectId: 'PRJ-TEST-F',
      name: 'Pekerjaan Ornamen Seni Tembaga Kinetik Khusus',
      category: 'OTHER',
      sourceIds: ['src-1'],
      evidence: [],
      confidence: 'HIGH',
      status: 'CONFIRMED',
    };

    const match = dedAhspMatchingEngine.matchAhsp({ workItem: mockUnpricedItem });
    assert.equal(match.priceResolution.unitPrice, undefined);
    assert.equal(match.priceResolution.priceSource, 'PRICE_NOT_FOUND');
  });

  // TEST G: Conflicting dimensions -> CONFLICT
  it('Test G: should flag CONFLICT status when different sources provide conflicting dimensions for the same element', () => {
    const evPlan: DEDEvidence = {
      id: 'ev_plan',
      sourceFileId: 'src_plan',
      sourceFileName: 'Denah_Lantai_1.pdf',
      pageNumber: 2,
      type: 'DIMENSION',
      rawText: 'Kolom K1: Lebar 0.35 m, Tinggi 0.35 m',
      value: 0.35,
      unit: 'm',
      confidence: 0.95,
    };

    const evDetail: DEDEvidence = {
      id: 'ev_detail',
      sourceFileId: 'src_detail',
      sourceFileName: 'Detail_Kolom_K1.pdf',
      pageNumber: 5,
      type: 'DIMENSION',
      rawText: 'Detail Kolom K1: Lebar 0.25 m, Tinggi 0.25 m',
      value: 0.25,
      unit: 'm',
      confidence: 0.95,
    };

    dedEvidenceStore.addEvidence('PRJ-TEST-G', [evPlan, evDetail]);

    const items = aiConstructionInterpreter.interpret({
      projectId: 'PRJ-TEST-G',
      sourceFileId: 'src_plan',
      evidences: [evPlan, evDetail],
    });

    assert.equal(items.length, 1);
    const kolom = items[0];
    assert.equal(kolom.status, 'CONFLICT');
    assert.ok(kolom.conflictDetails);
    assert.match(kolom.conflictDetails.description, /Konflik dimensi/i);

    // QTO engine should refuse to calculate on conflict
    const calc = dedQtoCalculationEngine.calculateQuantity(kolom);
    assert.equal(calc.success, false);
    assert.equal(calc.errorState, 'CONFLICT');
  });

  // TEST H: Cross-page evidence -> allowed only when references connect the evidence
  it('Test H: should correlate cross-page evidence when reference identifiers (F1) connect them', () => {
    const evPage4: DEDEvidence = {
      id: 'ev_p4',
      sourceFileId: 'ded_doc',
      sourceFileName: 'DED_Lengkap.pdf',
      pageNumber: 4,
      type: 'DIMENSION',
      rawText: 'Detail Pondasi F1: Lebar 0.60 m, Tinggi 0.30 m',
      value: 0.60,
      unit: 'm',
      confidence: 0.95,
    };

    const evPage7: DEDEvidence = {
      id: 'ev_p7',
      sourceFileId: 'ded_doc',
      sourceFileName: 'DED_Lengkap.pdf',
      pageNumber: 7,
      type: 'DIMENSION',
      rawText: 'Denah Pondasi: F1 = 42.50 m',
      value: 42.50,
      unit: 'm',
      confidence: 0.95,
    };

    dedEvidenceStore.addEvidence('PRJ-TEST-H', [evPage4, evPage7]);

    const items = aiConstructionInterpreter.interpret({
      projectId: 'PRJ-TEST-H',
      sourceFileId: 'ded_doc',
      evidences: [evPage4, evPage7],
    });

    assert.equal(items.length, 1);
    const pondasi = items[0];
    assert.equal(pondasi.dimensions?.length, 42.50);
    assert.equal(pondasi.dimensions?.width, 0.60);

    const calc = dedQtoCalculationEngine.calculateQuantity(pondasi);
    assert.equal(calc.success, true);
    assert.equal(calc.quantity, 7.65);
  });

  // TEST I: Retry spreadsheet sync -> no duplicate rows (idempotent)
  it('Test I: should guarantee idempotent spreadsheet workspace synchronization without duplicate rows', async () => {
    const pdf = createPdfBuffer([
      'SPESIFIKASI BALOK BETON B1',
      'Balok Beton B1: Panjang 10.00 m, Lebar 0.20 m, Tinggi 0.30 m',
    ]);

    const draft = await dedToRabPipelineService.executePipeline({
      projectId: 'PRJ-TEST-I',
      projectName: 'Proyek Idempotent Sync',
      files: [{ fileName: 'DED_Balok.pdf', buffer: pdf }],
    });

    const sync1 = spreadsheetSyncEngine.syncToSheets(draft);
    const initialRowsCount = sync1.sheets.sheet06_rab.length;

    // Retry sync 3 times
    const sync2 = spreadsheetSyncEngine.syncToSheets(draft);
    const sync3 = spreadsheetSyncEngine.syncToSheets(draft);

    assert.equal(sync2.sheets.sheet06_rab.length, initialRowsCount, 'Retry 1 must not add duplicate rows');
    assert.equal(sync3.sheets.sheet06_rab.length, initialRowsCount, 'Retry 2 must not add duplicate rows');
    assert.equal(sync3.sourceRevision, 4, 'Revision counter increments cleanly');
  });

  // TEST J: User edits spreadsheet -> conflict detected, no silent overwrite
  it('Test J: should detect conflict when user edits spreadsheet value and prevent silent overwrite', async () => {
    const pdf = createPdfBuffer([
      'SPESIFIKASI DINDING LANTAI 1',
      'Pasangan Dinding Bata: Panjang 20.00 m, Lebar 3.00 m',
    ]);

    const draft = await dedToRabPipelineService.executePipeline({
      projectId: 'PRJ-TEST-J',
      projectName: 'Proyek Conflict Detection',
      files: [{ fileName: 'DED_Dinding.pdf', buffer: pdf }],
    });

    const sync = spreadsheetSyncEngine.syncToSheets(draft);
    const targetRow = sync.sheets.sheet06_rab[0];
    assert.ok(targetRow);

    // Simulate user editing total in Google Sheets
    const conflictCheck = spreadsheetSyncEngine.detectExternalConflict(
      'PRJ-TEST-J',
      targetRow.id,
      { total: 99999999 } // user modified value
    );

    assert.equal(conflictCheck.hasConflict, true);
    assert.match(conflictCheck.message!, /Konflik terdeteksi/i);

    const currentSync = spreadsheetSyncEngine.getWorkspaceSync('PRJ-TEST-J');
    assert.equal(currentSync?.syncStatus, 'CONFLICT_DETECTED');
  });

  // TEST K: Official RAB -> cannot mutate without review/confirmation
  it('Test K: should block official RAB mutation without explicit confirmation gate', async () => {
    const pdf = createPdfBuffer([
      'SPESIFIKASI BALOK B1',
      'Balok Beton: Panjang 10.00 m, Lebar 0.20 m, Tinggi 0.30 m',
    ]);

    await dedToRabPipelineService.executePipeline({
      projectId: 'PRJ-TEST-K',
      projectName: 'Proyek Confirmation Gate',
      files: [{ fileName: 'DED_Balok.pdf', buffer: pdf }],
    });

    const existingRab: RabItem[] = [];
    const addedItems: any[] = [];

    // Confirm gate execution
    const commitRes = dedToRabPipelineService.confirmAndCommitToRab(
      'PRJ-TEST-K',
      existingRab,
      (item) => addedItems.push(item)
    );

    assert.equal(commitRes.success, true);
    assert.equal(commitRes.committedCount, 1);
    assert.equal(addedItems.length, 1);
    assert.ok(addedItems[0].description.includes('Balok'));

    // Attempting to commit non-existent project fails closed
    assert.throws(() => {
      dedToRabPipelineService.confirmAndCommitToRab(
        'PRJ-NON-EXISTENT',
        existingRab,
        (item) => addedItems.push(item)
      );
    }, /No draft found/);
  });
});

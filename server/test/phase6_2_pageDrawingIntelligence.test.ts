/**
 * EZRAB Phase 6.2: Page & Drawing Intelligence Comprehensive Test Suite
 *
 * Validates:
 * 1. Multi-Floor Recognition & Floor Awareness
 * 2. Same Identifier on Different Floors (K1 Fl 1 vs K1 Fl 2 Isolation)
 * 3. Plan + Detail Relationship (DETAIL_OF)
 * 4. Schedule + Plan Relationship (SCHEDULE_OF)
 * 5. Section + Plan Relationship (SECTION_OF)
 * 6. Duplicate Drawing Detection (DUPLICATES)
 * 7. Revision Hierarchy & Resolution (SUPERSEDES & REVISION_RESOLVED)
 * 8. Multi-Document Unified Project Context (Arch + Struct + MEP + Spec + BOQ)
 * 9. Conflict Detection (Dimension / Material Mismatch)
 * 10. Tenant & Project Security Scoping
 */

import assert from 'node:assert';
import { DocumentSetService } from '../services/documentSetService';
import { DrawingIntelligenceService } from '../services/drawingIntelligenceService';
import { CrossReferenceDetector } from '../services/crossReferenceDetector';
import { DrawingRelationshipEngine } from '../services/drawingRelationshipEngine';
import { DrawingConflictDetector } from '../services/drawingConflictDetector';
import { DrawingGraphBuilder } from '../services/drawingGraphBuilder';

export async function runPhase62PageDrawingIntelligenceTests(): Promise<void> {
  console.log('============================================================');
  console.log('EZRAB PHASE 6.2: PAGE & DRAWING INTELLIGENCE TEST SUITE');
  console.log('============================================================\n');

  const TEST_WS = 'ws-engineering-corp';
  const TEST_PRJ_1 = 'PRJ-202609-P62A';
  const TEST_PRJ_2 = 'PRJ-202609-P62B';
  const TEST_USER = 'usr-lead-estimator';

  const docSetService = DocumentSetService.getInstance();
  const drawingIntelService = DrawingIntelligenceService.getInstance();
  const xrefDetector = CrossReferenceDetector.getInstance();
  const relEngine = DrawingRelationshipEngine.getInstance();
  const conflictDetector = DrawingConflictDetector.getInstance();
  const graphBuilder = DrawingGraphBuilder.getInstance();

  drawingIntelService.clearStore();

  // -------------------------------------------------------------------------
  // TEST 1: Multi-Floor Recognition & Floor Awareness
  // -------------------------------------------------------------------------
  console.log('[TEST 01] Multi-Floor Recognition & Normalization');
  const flrBasement = graphBuilder.normalizeFloor('Lantai Dasar / Basement', 'Denah Basement Parkir B1');
  const flr1 = graphBuilder.normalizeFloor('Lantai 1', 'Denah Lantai 1 Gedung');
  const flr2 = graphBuilder.normalizeFloor('Lantai 2', 'Denah Balok Lantai 2');
  const flrRoof = graphBuilder.normalizeFloor('Lantai Atap', 'Rencana Rangka Atap');

  assert.strictEqual(flrBasement, 'Basement');
  assert.strictEqual(flr1, 'Floor 1');
  assert.strictEqual(flr2, 'Floor 2');
  assert.strictEqual(flrRoof, 'Roof');
  console.log('  -> PASS: Multi-floor names accurately classified into structured floor levels.');

  // -------------------------------------------------------------------------
  // TEST 2: Same Identifier on Different Floors (K1 Floor 1 vs K1 Floor 2)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 02] Same Identifier on Different Floors (Strict Non-Merge Guarantee)');
  const pageFl1 = {
    pageId: 'p_fl1',
    documentId: 'doc_1',
    documentSetId: 'set_1',
    projectId: TEST_PRJ_1,
    pageNumber: 1,
    fileName: 'Denah_Lt1.pdf',
    extractedText: 'No Gambar: S-101 | Denah Struktur Lantai 1 | Kolom K1 30x30 cm fc 25 | Balok B1 25x40',
    classification: { pageRole: 'FLOOR_PLAN' as any, confidence: 0.95, reason: '', evidence: [] },
    metadata: { drawingNumber: 'S-101', sheetNumber: '1', title: 'Denah Struktur Lantai 1', revision: 'REV 00', revisionDate: null, discipline: 'STRUCTURE' as any, building: 'Gedung Utama', floor: 'Lantai 1', zone: null, scale: '1:100', author: null, checkedBy: null, date: null },
    duplicateStatus: 'UNIQUE' as any,
    isSuperseded: false,
    isLatestRevision: true,
    status: 'CLASSIFIED' as any,
    createdAt: '',
    updatedAt: ''
  };

  const pageFl2 = {
    pageId: 'p_fl2',
    documentId: 'doc_1',
    documentSetId: 'set_1',
    projectId: TEST_PRJ_1,
    pageNumber: 2,
    fileName: 'Denah_Lt2.pdf',
    extractedText: 'No Gambar: S-102 | Denah Struktur Lantai 2 | Kolom K1 25x25 cm fc 25 | Balok B1 20x35',
    classification: { pageRole: 'FLOOR_PLAN' as any, confidence: 0.95, reason: '', evidence: [] },
    metadata: { drawingNumber: 'S-102', sheetNumber: '2', title: 'Denah Struktur Lantai 2', revision: 'REV 00', revisionDate: null, discipline: 'STRUCTURE' as any, building: 'Gedung Utama', floor: 'Lantai 2', zone: null, scale: '1:100', author: null, checkedBy: null, date: null },
    duplicateStatus: 'UNIQUE' as any,
    isSuperseded: false,
    isLatestRevision: true,
    status: 'CLASSIFIED' as any,
    createdAt: '',
    updatedAt: ''
  };

  const xrefsFl1 = xrefDetector.detectCrossReferences({ drawingId: 'dwg_s101', page: pageFl1, building: 'Gedung Utama', floor: 'Floor 1', zone: null });
  const xrefsFl2 = xrefDetector.detectCrossReferences({ drawingId: 'dwg_s102', page: pageFl2, building: 'Gedung Utama', floor: 'Floor 2', zone: null });

  const k1Fl1 = xrefsFl1.find(x => x.identifier === 'K1')!;
  const k1Fl2 = xrefsFl2.find(x => x.identifier === 'K1')!;

  assert.ok(k1Fl1, 'K1 Floor 1 must exist');
  assert.ok(k1Fl2, 'K1 Floor 2 must exist');
  assert.strictEqual(k1Fl1.floor, 'Floor 1');
  assert.strictEqual(k1Fl2.floor, 'Floor 2');
  assert.strictEqual(k1Fl1.parameters?.dimension, '30x30');
  assert.strictEqual(k1Fl2.parameters?.dimension, '25x25');
  assert.notStrictEqual(k1Fl1.referenceId, k1Fl2.referenceId, 'Cross reference IDs must be separate');
  console.log('  -> PASS: Kolom K1 on Floor 1 (30x30) and Floor 2 (25x25) isolated with floor awareness.');

  // -------------------------------------------------------------------------
  // TEST 3: Ingestion of Multi-Document Package & Drawing Graph Build
  // -------------------------------------------------------------------------
  console.log('\n[TEST 03] Multi-Document Project Ingestion (Arch, Struct, MEP, Specs, BOQ)');
  const multiDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Terpadu Gedung Kantor 3 Lantai',
    files: [
      {
        fileName: 'DED_Architectural.pdf',
        fileSizeBytes: 1200000,
        rawText: `No. Gambar: A-101 | Denah Arsitektur Lantai 1 | Pintu PJ1 Kayu Kamper | Pintu P1 Kusen Aluminium 4" | Jendela J1
--- PAGE 2 ---
No. Gambar: A-301 | Gambar Potongan A-A Gedung Utama Arsitektur | Memotong denah lantai 1 dan 2
--- PAGE 3 ---
No. Gambar: A-501 | Tabel Jadwal Pintu dan Jendela | Pintu PJ1 120x210 | Pintu P1 90x210 | Jendela J1 60x120`
      },
      {
        fileName: 'DED_Structural.pdf',
        fileSizeBytes: 1800000,
        rawText: `No. Gambar: S-101 | Denah Struktur Lantai 1 | Kolom K1 30x30 cm fc 25 | Balok B1 25x40 cm | Pondasi P1 100x100
--- PAGE 2 ---
No. Gambar: S-201 | Detail Kolom dan Balok Struktur Lantai 1 | Detail Kolom K1 30x30 cm Pembesian 8 D16 | Detail Balok B1 25x40 cm
--- PAGE 3 ---
No. Gambar: S-301 | Detail Pondasi Poer P1 dan Sloof S1 | Pondasi Poer P1 100x100x40 cm pembesian D13-150`
      },
      {
        fileName: 'DED_MEP.pdf',
        fileSizeBytes: 950000,
        rawText: `No. Gambar: MEP-101 | Rencana Instalasi Plumbing dan Sanitasi Lantai 1 | Pipa PVC 4 inch | Floor Drain`
      },
      {
        fileName: 'Spesifikasi_Teknis_RKS.pdf',
        fileSizeBytes: 450000,
        rawText: `Dokumen Spesifikasi Teknis RKS | Pekerjaan Beton Bertulang fc 25 MPa | Kusen Aluminium 4 inch Anodized`
      },
      {
        fileName: 'BOQ_Existing.xlsx',
        fileSizeBytes: 120000,
        rawText: `Bill of Quantities Referensi | Divisi Struktur dan Arsitektur`
      }
    ]
  });

  const graph = await drawingIntelService.getOrGenerateDrawingGraph({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: multiDocSet.documentSetId
  });

  assert.strictEqual(graph.totalBuildings >= 1, true);
  assert.strictEqual(graph.totalDrawings >= 6, true);
  assert.strictEqual(graph.totalRelationships >= 4, true);
  console.log(`  -> PASS: Ingested 5 multi-type documents -> Graph constructed with ${graph.totalDrawings} drawings & ${graph.totalRelationships} relationships.`);

  // -------------------------------------------------------------------------
  // TEST 4: Plan + Detail Relationship (DETAIL_OF)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 04] Plan + Detail Drawing Relationship Detection (DETAIL_OF)');
  const detailRel = Object.values(graph.relationships).find(r => r.type === 'DETAIL_OF');
  assert.ok(detailRel, 'DETAIL_OF relationship must be discovered');
  const detailDwg = graph.drawings[detailRel.sourceDrawingId] || graph.drawings[detailRel.targetDrawingId];
  assert.ok(detailDwg.title.toLowerCase().includes('detail') || detailDwg.drawingNumber.startsWith('S-201') || detailDwg.drawingNumber.startsWith('S-301'));
  console.log(`  -> PASS: Detail drawing successfully connected to master plan with DETAIL_OF type.`);

  // -------------------------------------------------------------------------
  // TEST 5: Schedule + Plan Relationship (SCHEDULE_OF)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 05] Schedule + Plan Drawing Relationship Detection (SCHEDULE_OF)');
  const schedRel = Object.values(graph.relationships).find(r => r.type === 'SCHEDULE_OF');
  assert.ok(schedRel, 'SCHEDULE_OF relationship must be discovered');
  console.log(`  -> PASS: Door & Window schedule linked to architectural plan with SCHEDULE_OF type.`);

  // -------------------------------------------------------------------------
  // TEST 6: Section + Plan Relationship (SECTION_OF)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 06] Section + Plan Drawing Relationship Detection (SECTION_OF)');
  const secRel = Object.values(graph.relationships).find(r => r.type === 'SECTION_OF');
  assert.ok(secRel, 'SECTION_OF relationship must be discovered');
  console.log(`  -> PASS: Building cross section linked to floor plan with SECTION_OF type.`);

  // -------------------------------------------------------------------------
  // TEST 7: Duplicate Drawing Detection (DUPLICATES)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 07] Duplicate Drawing Detection');
  const dupDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'Paket dengan Duplikasi',
    files: [
      {
        fileName: 'Denah_Asli.pdf',
        fileSizeBytes: 300000,
        rawText: 'No. Gambar: A-101 | Denah Arsitektur Lantai 1 | Luas 150m2 | Pintu P1'
      },
      {
        fileName: 'Copy_Denah_Asli.pdf',
        fileSizeBytes: 300000,
        rawText: 'No. Gambar: A-101 | Denah Arsitektur Lantai 1 | Luas 150m2 | Pintu P1'
      }
    ]
  });

  const dupGraph = await drawingIntelService.getOrGenerateDrawingGraph({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: dupDocSet.documentSetId
  });

  const dupRel = Object.values(dupGraph.relationships).find(r => r.type === 'DUPLICATES');
  assert.ok(dupRel, 'DUPLICATES relationship must be established');
  console.log('  -> PASS: Duplicate drawing detected and linked with DUPLICATES relationship.');

  // -------------------------------------------------------------------------
  // TEST 8: Revision Hierarchy & Resolution (SUPERSEDES & REVISION_RESOLVED)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 08] Revision Hierarchy & Superseding Resolution');
  const revDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'Paket Revisi Gambar',
    files: [
      {
        fileName: 'Denah_Rev00.pdf',
        fileSizeBytes: 400000,
        rawText: 'No. Gambar: S-101 | Revisi: REV 00 | Denah Struktur Lantai 1 | Kolom K1 25x25 cm'
      },
      {
        fileName: 'Denah_Rev01.pdf',
        fileSizeBytes: 410000,
        rawText: 'No. Gambar: S-101 | Revisi: REV 01 | Denah Struktur Lantai 1 | Kolom K1 30x30 cm'
      }
    ]
  });

  const revGraph = await drawingIntelService.getOrGenerateDrawingGraph({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: revDocSet.documentSetId
  });

  const supersedesRel = Object.values(revGraph.relationships).find(r => r.type === 'SUPERSEDES');
  assert.ok(supersedesRel, 'SUPERSEDES relationship must be established between revisions');

  // Check that discrepancy between rev 00 and rev 01 is marked as REVISION_RESOLVED
  const revResolvedConflict = revGraph.conflicts.find(c => c.status === 'REVISION_RESOLVED');
  assert.ok(revResolvedConflict, 'Revision dimension difference must be classified as REVISION_RESOLVED');
  console.log('  -> PASS: Revision progression tracked with SUPERSEDES and REVISION_RESOLVED status.');

  // -------------------------------------------------------------------------
  // TEST 9: Conflict Detection (Plan vs Detail Dimension Mismatch)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 09] Discrepancy Conflict Detection (Plan vs Detail Mismatch)');
  const conflictDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'Paket Konflik Dimensi',
    files: [
      {
        fileName: 'Denah_Lantai_1.pdf',
        fileSizeBytes: 500000,
        rawText: 'No. Gambar: S-101 | Revisi: REV 00 | Denah Struktur Lantai 1 | Kolom K1 25x25 cm'
      },
      {
        fileName: 'Detail_Kolom_Lantai_1.pdf',
        fileSizeBytes: 520000,
        rawText: 'No. Gambar: S-201 | Revisi: REV 00 | Detail Kolom Lantai 1 | Kolom K1 30x30 cm'
      }
    ]
  });

  const conflictGraph = await drawingIntelService.getOrGenerateDrawingGraph({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: conflictDocSet.documentSetId
  });

  const dimConflict = conflictGraph.conflicts.find(c => c.status === 'CONFLICT' && c.entityIdentifier === 'K1');
  assert.ok(dimConflict, 'Conflict on Kolom K1 dimension must be detected');
  assert.strictEqual(dimConflict.discrepancyType, 'DIMENSION');
  assert.strictEqual(conflictGraph.status, 'HAS_CONFLICTS');

  // Test Human Audit Resolution
  const resolved = await drawingIntelService.resolveConflict({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: conflictDocSet.documentSetId,
    conflictId: dimConflict.conflictId,
    status: 'CONSISTENT',
    humanAuditNotes: 'Disepakati menggunakan ukuran 30x30 cm sesuai persetujuan konsultan perencana.'
  });

  assert.strictEqual(resolved.status, 'CONSISTENT');
  assert.ok(resolved.humanAuditNotes);
  console.log('  -> PASS: Dimension conflict detected without silent resolution; human audit workflow validated.');

  // -------------------------------------------------------------------------
  // TEST 10: Multi-Document Context Synthesis & Tenant Isolation
  // -------------------------------------------------------------------------
  console.log('\n[TEST 10] Multi-Document Context Synthesis & Tenant Isolation Guarantee');
  const multiCtx = await drawingIntelService.getMultiDocumentContext({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: multiDocSet.documentSetId
  });

  assert.strictEqual(multiCtx.documentTypesPresent.architectural, true);
  assert.strictEqual(multiCtx.documentTypesPresent.structural, true);
  assert.strictEqual(multiCtx.documentTypesPresent.mep, true);
  assert.strictEqual(multiCtx.documentTypesPresent.specifications, true);
  assert.strictEqual(multiCtx.documentTypesPresent.boq, true);
  assert.strictEqual(multiCtx.totalFiles, 5);

  // Tenant check: Accessing Project 1 graph from Project 2 must fail-closed
  let accessDenied = false;
  try {
    await drawingIntelService.getOrGenerateDrawingGraph({
      workspaceId: TEST_WS,
      projectId: TEST_PRJ_2, // Wrong project
      documentSetId: multiDocSet.documentSetId
    });
  } catch (err) {
    accessDenied = true;
  }
  assert.strictEqual(accessDenied, true, 'Cross-project graph access must be rejected');
  console.log('  -> PASS: Unified multi-document context synthesized; cross-project access strictly denied.');

  console.log('\n============================================================');
  console.log('✅ ALL 10 PHASE 6.2 PAGE & DRAWING INTELLIGENCE TESTS PASSED');
  console.log('============================================================\n');
}

// Standalone execution runner
if (process.argv[1]?.endsWith('phase6_2_pageDrawingIntelligence.test.ts')) {
  runPhase62PageDrawingIntelligenceTests().catch(err => {
    console.error('[TEST SUITE ERROR]', err);
    process.exit(1);
  });
}

/**
 * EZRAB Phase 6.3: Entity Resolution & Anti-Duplicate Engine Test Suite
 *
 * Validates the 9 Critical Synthetic Cases:
 * CASE 1: Floor 1 K1 vs Floor 2 K1 -> 2 distinct canonical entities
 * CASE 2: Plan K1, Detail K1, Section K1 -> 1 entity with 3 evidence records
 * CASE 3: Plan quantity 12, Schedule quantity 12 -> Deduplicated canonical quantity 12
 * CASE 4: Plan quantity 12, Schedule quantity 14 -> Conflict status
 * CASE 5: Rev A vs Rev B -> Rev B supersedes Rev A (Rev A excluded from canonical count)
 * CASE 6: Duplicate PDF pages -> No double quantity
 * CASE 7: Same name but different location -> Different entity
 * CASE 8: Same location + same dimensions + related drawing -> Same entity candidate
 * CASE 9: Cross-project same identifier -> Strict tenant isolation, never merge
 * CASE 10: Canonical Work Items -> Generated strictly from canonical entities
 */

import assert from 'node:assert';
import { DocumentSetService } from '../services/documentSetService';
import { DrawingIntelligenceService } from '../services/drawingIntelligenceService';
import { EntityResolutionCoordinator } from '../services/entityResolutionCoordinator';
import { QuantityDeduplicationEngine } from '../services/quantityDeduplicationEngine';
import { EvidenceExtractor } from '../services/evidenceExtractor';
import { CanonicalWorkItemBuilder } from '../services/canonicalWorkItemBuilder';

export async function runPhase63EntityResolutionTests(): Promise<void> {
  console.log('============================================================');
  console.log('EZRAB PHASE 6.3: ENTITY RESOLUTION & ANTI-DUPLICATE TEST SUITE');
  console.log('============================================================\n');

  const TEST_WS = 'ws-engineering-p63';
  const TEST_PRJ_1 = 'PRJ-202609-P63A';
  const TEST_PRJ_2 = 'PRJ-202609-P63B';
  const TEST_USER = 'usr-lead-engineer';

  const docSetService = DocumentSetService.getInstance();
  const drawingIntelService = DrawingIntelligenceService.getInstance();
  const coordinator = EntityResolutionCoordinator.getInstance();
  const deduplicationEngine = QuantityDeduplicationEngine.getInstance();
  const workItemBuilder = CanonicalWorkItemBuilder.getInstance();

  coordinator.clearStore();
  drawingIntelService.clearStore();

  // -------------------------------------------------------------------------
  // CASE 1: Floor 1 K1 vs Floor 2 K1 -> 2 distinct canonical entities
  // -------------------------------------------------------------------------
  console.log('[CASE 1] Floor Awareness: Floor 1 K1 vs Floor 2 K1');
  const multiFloorDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Struktur Multi Lantai',
    files: [
      {
        fileName: 'Denah_Struktur_Lt1.pdf',
        fileSizeBytes: 500000,
        rawText: 'No. Gambar: S-101 | Denah Struktur Lantai 1 | Kolom K1 30x30 cm fc 25 | Balok B1 25x40 cm'
      },
      {
        fileName: 'Denah_Struktur_Lt2.pdf',
        fileSizeBytes: 500000,
        rawText: 'No. Gambar: S-102 | Denah Struktur Lantai 2 | Kolom K1 25x25 cm fc 25 | Balok B1 20x35 cm'
      }
    ]
  });

  const resMultiFloor = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: multiFloorDocSet.documentSetId
  });

  const k1Entities = resMultiFloor.entities.filter(e => e.identifier === 'K1');
  assert.strictEqual(k1Entities.length, 2, 'K1 must produce exactly 2 distinct canonical entities (one per floor)');
  const k1Fl1 = k1Entities.find(e => e.location.floor === 'Floor 1');
  const k1Fl2 = k1Entities.find(e => e.location.floor === 'Floor 2');

  assert.ok(k1Fl1, 'Floor 1 K1 must exist');
  assert.ok(k1Fl2, 'Floor 2 K1 must exist');
  assert.notStrictEqual(k1Fl1.entityId, k1Fl2.entityId, 'Entity IDs must be distinct');
  assert.strictEqual(k1Fl1.dimensions, '30x30');
  assert.strictEqual(k1Fl2.dimensions, '25x25');
  console.log('  -> PASS: Column K1 on Floor 1 and Floor 2 resolved into 2 distinct entities with correct dimensions.');

  // -------------------------------------------------------------------------
  // CASE 2: Plan K1, Detail K1, Section K1 -> 1 entity with 3 evidence records
  // -------------------------------------------------------------------------
  console.log('\n[CASE 2] Same Entity on Multiple Drawings (Plan + Detail + Section)');
  const multiDwgDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Denah Detail Potongan Kolom',
    files: [
      {
        fileName: 'DED_Struktur_Lengkap.pdf',
        fileSizeBytes: 1200000,
        rawText: `No. Gambar: S-101 | Denah Struktur Lantai 1 | Kolom K1 30x30 cm fc 25
--- PAGE 2 ---
No. Gambar: S-201 | Detail Kolom Lantai 1 | Detail Kolom K1 30x30 cm Pembesian 8 D16
--- PAGE 3 ---
No. Gambar: S-301 | Gambar Potongan Gedung Utama | Potongan Kolom K1 30x30 cm`
      }
    ]
  });

  const resMultiDwg = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: multiDwgDocSet.documentSetId
  });

  const k1Canonical = resMultiDwg.entities.find(e => e.identifier === 'K1' && e.location.floor === 'Floor 1');
  assert.ok(k1Canonical, 'Canonical K1 entity must exist');
  assert.strictEqual(k1Canonical.evidences.length, 3, 'Must have exactly 3 evidence records from Plan, Detail, and Section');
  assert.strictEqual(k1Canonical.rebar, '8 D16', 'Rebar extracted from Detail sheet using Source Priority');
  assert.strictEqual(k1Canonical.dimensions, '30x30', 'Dimension extracted from Detail/Plan');
  assert.strictEqual(k1Canonical.resolutionStatus, 'SAME_ENTITY');
  console.log('  -> PASS: Plan + Detail + Section resolved into ONE canonical entity with 3 evidence pointers.');

  // -------------------------------------------------------------------------
  // CASE 3: Plan quantity 12, Schedule quantity 12 -> Deduplicated quantity 12
  // -------------------------------------------------------------------------
  console.log('\n[CASE 3] Quantity Deduplication (Plan = 12 unit, Schedule = 12 unit)');
  const matchingQtyDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Pintu Denah dan Jadwal',
    files: [
      {
        fileName: 'DED_Arsitektur_Pintu.pdf',
        fileSizeBytes: 800000,
        rawText: `No. Gambar: A-101 | Denah Arsitektur Lantai 1 | Pintu P1 Kusen Aluminium | qty: 12 unit
--- PAGE 2 ---
No. Gambar: A-501 | Tabel Jadwal Pintu dan Jendela | Pintu P1 90x210 cm | total: 12 unit`
      }
    ]
  });

  const resMatchingQty = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: matchingQtyDocSet.documentSetId
  });

  const p1Canonical = resMatchingQty.entities.find(e => e.identifier === 'P1');
  assert.ok(p1Canonical, 'Canonical P1 must exist');
  assert.strictEqual(p1Canonical.canonicalQuantity.quantity, 12, 'Quantity must be deduplicated to 12, NOT 24 (12 + 12)');
  assert.strictEqual(p1Canonical.canonicalQuantity.isDeduplicated, true, 'Quantity must be marked deduplicated');
  assert.strictEqual(p1Canonical.resolutionStatus, 'SAME_ENTITY');
  console.log('  -> PASS: 12 on Plan + 12 on Schedule resolved to canonical quantity 12 (zero double counting).');

  // -------------------------------------------------------------------------
  // CASE 4: Plan quantity 12, Schedule quantity 14 -> Conflict status
  // -------------------------------------------------------------------------
  console.log('\n[CASE 4] Quantity Conflict Detection (Plan = 12 unit, Schedule = 14 unit)');
  const conflictingQtyDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Konflik Kuantitas Pintu',
    files: [
      {
        fileName: 'DED_Arsitektur_Konflik.pdf',
        fileSizeBytes: 800000,
        rawText: `No. Gambar: A-101 | Denah Arsitektur Lantai 1 | Pintu P1 Kusen Aluminium | qty: 12 unit
--- PAGE 2 ---
No. Gambar: A-501 | Tabel Jadwal Pintu dan Jendela | Pintu P1 90x210 cm | total: 14 unit`
      }
    ]
  });

  const resConflictingQty = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: conflictingQtyDocSet.documentSetId
  });

  const p1Conflicted = resConflictingQty.entities.find(e => e.identifier === 'P1');
  assert.ok(p1Conflicted, 'Canonical P1 must exist');
  assert.strictEqual(p1Conflicted.resolutionStatus, 'CONFLICT', 'Status must be CONFLICT');
  assert.ok(p1Conflicted.conflictDescription?.includes('12') && p1Conflicted.conflictDescription?.includes('14'));
  console.log('  -> PASS: Discrepancy (12 vs 14) flagged as CONFLICT without silent choice.');

  // -------------------------------------------------------------------------
  // CASE 5: Rev A vs Rev B -> Rev B supersedes Rev A
  // -------------------------------------------------------------------------
  console.log('\n[CASE 5] Revision Progression (Rev B Supersedes Rev A)');
  const revProgressionDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Revisi Kolom',
    files: [
      {
        fileName: 'Denah_Kolom_Rev00.pdf',
        fileSizeBytes: 300000,
        rawText: 'No. Gambar: S-101 | Revisi: REV 00 | Denah Struktur Lantai 1 | Kolom K1 25x25 cm | qty: 10 unit'
      },
      {
        fileName: 'Denah_Kolom_Rev01.pdf',
        fileSizeBytes: 310000,
        rawText: 'No. Gambar: S-101 | Revisi: REV 01 | Denah Struktur Lantai 1 | Kolom K1 30x30 cm | qty: 10 unit'
      }
    ]
  });

  const resRev = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: revProgressionDocSet.documentSetId
  });

  const activeK1 = resRev.entities.find(e => e.identifier === 'K1' && !e.isSuperseded);
  assert.ok(activeK1, 'Active K1 must exist');
  assert.strictEqual(activeK1.dimensions, '30x30', 'Active K1 uses latest revision dimension');
  console.log('  -> PASS: Rev 01 actively supersedes Rev 00, outdated drawing excluded from active count.');

  // -------------------------------------------------------------------------
  // CASE 6: Duplicate PDF Pages -> No Double Quantity
  // -------------------------------------------------------------------------
  console.log('\n[CASE 6] Duplicate PDF Pages Anti-Duplication');
  const dupDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Denah Duplikat',
    files: [
      {
        fileName: 'Denah_Asli.pdf',
        fileSizeBytes: 400000,
        rawText: 'No. Gambar: S-101 | Denah Struktur Lantai 1 | Kolom K1 30x30 cm | qty: 8 unit'
      },
      {
        fileName: 'Salinan_Denah_Asli.pdf',
        fileSizeBytes: 400000,
        rawText: 'No. Gambar: S-101 | Denah Struktur Lantai 1 | Kolom K1 30x30 cm | qty: 8 unit'
      }
    ]
  });

  const resDup = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: dupDocSet.documentSetId
  });

  // Calculate total quantity of active work items
  const totalColWorkItems = resDup.workItems.filter(w => w.itemCode.includes('COL.K1'));
  const totalQty = totalColWorkItems.reduce((acc, w) => acc + w.canonicalQuantity, 0);

  assert.strictEqual(totalQty, 8, 'Total quantity must be exactly 8 (NOT 8 + 8 = 16)');
  console.log('  -> PASS: Duplicate file pages successfully neutralized, total work item quantity = 8.');

  // -------------------------------------------------------------------------
  // CASE 7: Same Name but Different Location -> Different Entity
  // -------------------------------------------------------------------------
  console.log('\n[CASE 7] Same Name but Different Location / Building');
  const multiBldDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Pos Jaga dan Gedung Utama',
    files: [
      {
        fileName: 'Denah_Gedung_Utama.pdf',
        fileSizeBytes: 400000,
        rawText: 'Nama Gedung: Gedung Utama | No. Gambar: S-101 | Denah Lantai 1 | Kolom K1 30x30 cm'
      },
      {
        fileName: 'Denah_Pos_Jaga.pdf',
        fileSizeBytes: 300000,
        rawText: 'Nama Gedung: Pos Jaga | No. Gambar: S-102 | Denah Lantai 1 | Kolom K1 15x15 cm'
      }
    ]
  });

  const resMultiBld = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: multiBldDocSet.documentSetId
  });

  const bldK1s = resMultiBld.entities.filter(e => e.identifier === 'K1');
  assert.strictEqual(bldK1s.length, 2, 'Must create 2 distinct entities for Gedung Utama vs Pos Jaga');
  const utamaK1 = bldK1s.find(e => e.location.building === 'Gedung Utama');
  const posK1 = bldK1s.find(e => e.location.building === 'Pos Jaga');

  assert.ok(utamaK1);
  assert.ok(posK1);
  assert.strictEqual(utamaK1.dimensions, '30x30');
  assert.strictEqual(posK1.dimensions, '15x15');
  console.log('  -> PASS: Column K1 in Gedung Utama (30x30) and Pos Jaga (15x15) isolated into 2 entities.');

  // -------------------------------------------------------------------------
  // CASE 8: Same Location + Same Dimensions + Related Drawing -> Same Entity
  // -------------------------------------------------------------------------
  console.log('\n[CASE 8] Same Location + Same Dimensions on Related Drawings');
  const relatedDocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    userId: TEST_USER,
    documentSetName: 'DED Pondasi Terhubung',
    files: [
      {
        fileName: 'Denah_Pondasi.pdf',
        fileSizeBytes: 500000,
        rawText: 'No. Gambar: S-01 | Denah Pondasi Lantai 1 | Pondasi Poer P1 100x100x40 cm'
      },
      {
        fileName: 'Detail_Pondasi.pdf',
        fileSizeBytes: 500000,
        rawText: 'No. Gambar: S-02 | Detail Pondasi Poer P1 100x100x40 cm pembesian D13-150'
      }
    ]
  });

  const resRelated = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: relatedDocSet.documentSetId
  });

  const p1Found = resRelated.entities.find(e => e.identifier === 'P1');
  assert.ok(p1Found, 'Pondasi P1 must exist');
  assert.strictEqual(p1Found.resolutionStatus, 'SAME_ENTITY');
  assert.strictEqual(p1Found.evidences.length, 2);
  console.log('  -> PASS: Foundation P1 on plan and detail recognized as identical physical entity.');

  // -------------------------------------------------------------------------
  // CASE 9: Cross-Project Same Identifier -> Never Merge
  // -------------------------------------------------------------------------
  console.log('\n[CASE 9] Cross-Project Same Identifier Isolation');
  const prj2DocSet = await docSetService.ingestDocumentSet({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_2, // Project 2
    userId: TEST_USER,
    documentSetName: 'Proyek Terpisah B',
    files: [
      {
        fileName: 'Denah_Struktur_Prj2.pdf',
        fileSizeBytes: 300000,
        rawText: 'No. Gambar: S-101 | Denah Struktur Lantai 1 | Kolom K1 40x40 cm'
      }
    ]
  });

  const resPrj1 = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_1,
    documentSetId: multiFloorDocSet.documentSetId
  });

  const resPrj2 = await coordinator.resolveDocumentSetEntities({
    workspaceId: TEST_WS,
    projectId: TEST_PRJ_2,
    documentSetId: prj2DocSet.documentSetId
  });

  assert.strictEqual(resPrj1.projectId, TEST_PRJ_1);
  assert.strictEqual(resPrj2.projectId, TEST_PRJ_2);
  assert.strictEqual(resPrj2.entities.find(e => e.identifier === 'K1')?.dimensions, '40x40');
  assert.strictEqual(resPrj1.entities.find(e => e.identifier === 'K1' && e.location.floor === 'Floor 1')?.dimensions, '30x30');
  console.log('  -> PASS: Cross-project entities strictly isolated with zero cross-tenant merging.');

  // -------------------------------------------------------------------------
  // CASE 10: Canonical Work Items Flow
  // -------------------------------------------------------------------------
  console.log('\n[CASE 10] Canonical Work Item Pipeline (Hard Rule Enforcement)');
  assert.ok(resMatchingQty.workItems.length > 0, 'Work items must be generated from canonical entities');
  for (const wi of resMatchingQty.workItems) {
    assert.ok(wi.entityId, 'Work item must link to canonical entity ID');
    assert.ok(wi.wbsCategory, 'Work item must have WBS category');
    assert.ok(wi.canonicalQuantity > 0, 'Work item must use canonical deduplicated quantity');
  }
  console.log('  -> PASS: Canonical Work Items created strictly from resolved entities.');

  console.log('\n============================================================');
  console.log('✅ ALL 10 PHASE 6.3 ENTITY RESOLUTION & ANTI-DUPLICATE TESTS PASSED');
  console.log('============================================================\n');
}

// Standalone execution runner
if (process.argv[1]?.endsWith('phase6_3_entityResolutionAntiDuplicate.test.ts')) {
  runPhase63EntityResolutionTests().catch(err => {
    console.error('[TEST SUITE ERROR]', err);
    process.exit(1);
  });
}

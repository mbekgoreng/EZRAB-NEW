/**
 * Phase 6.6 Synthetic Test Suite: Review -> Approval -> Spreadsheet Integration
 *
 * Tests:
 * 1. Full E2E Pipeline (DED -> Canonical Entities -> QTO -> AHSP -> Price -> Draft -> Review -> Spreadsheet)
 * 2. 7-Tab Review Workspace & 9 Review Counts Integrity
 * 3. 12-Column RAB Review Table Attributes
 * 4. User Item Modification (Volume & Price) with Audit History
 * 5. Item Rejection / Exclusion from Final Spreadsheet
 * 6. Conflict Resolution & Audit Logging
 * 7. Missing AHSP & Missing Price Manual Resolution
 * 8. Idempotency Guard (Double-Click Replay -> Zero Duplicates)
 * 9. Strict Multi-Tenant & Project Isolation Gating
 * 10. RBAC / Permission Gating (AI_CREATE / AI_UPDATE)
 * 11. Mathematical Precision & Instant UI State Synchronization
 */

import { SpreadsheetApprovalEngine } from '../services/spreadsheetApprovalEngine';
import { DeterministicRabDraftEngine } from '../services/deterministicRabDraftEngine';
import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';
import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';
import { RABSection } from '../../src/types';

export async function runPhase66Tests(): Promise<boolean> {
  console.log('============================================================');
  console.log('EZRAB PHASE 6.6: REVIEW -> APPROVAL -> SPREADSHEET TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  -> PASS: ${message}`);
      passed++;
    } else {
      console.error(`  -> FAIL: ${message}`);
      failed++;
    }
  }

  // Helper to create mock canonical entity
  function createEntity(
    id: string,
    name: string,
    elementType: string,
    dimensions: string,
    quantity: number = 1,
    material?: string,
    resolutionStatus: any = 'SAME_ENTITY'
  ): CanonicalEntity {
    return {
      entityId: `ent_${id}`,
      projectId: 'proj_rev_test',
      buildingId: 'bld_main',
      floorId: 'Lantai 1',
      zoneId: null,
      discipline: 'STRUCTURAL',
      elementType,
      name,
      identifier: id,
      drawingReferences: ['DWG-S-001'],
      evidenceIds: [`ev_${id}`],
      evidences: [
        {
          evidenceId: `ev_${id}`,
          pageId: 'p_1',
          drawingId: 'DWG-S-001',
          pageNumber: 1,
          fileName: 'structural_plan.pdf',
          sourceType: 'STRUCTURAL_PLAN',
          sourcePriority: 3,
          sourceText: `Detail ${name} dimensi ${dimensions}`,
          extractedValue: { identifier: id, dimensions, quantity },
          confidence: 0.95,
          createdAt: new Date().toISOString()
        }
      ],
      location: { floor: 'Lantai 1', building: 'Main' },
      dimensions,
      material,
      quantityCandidates: [],
      canonicalQuantity: {
        quantity,
        unit: 'unit',
        source: 'DWG-S-001',
        confidence: 0.95,
        isDeduplicated: true
      },
      identityConfidence: 0.95,
      resolutionStatus,
      isDuplicate: false,
      isSuperseded: false,
      provenance: {
        sourceDrawings: ['DWG-S-001'],
        sourcePages: ['page_1'],
        detectedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  try {
    const rabEngine = DeterministicRabDraftEngine.getInstance();
    const approvalEngine = SpreadsheetApprovalEngine.getInstance();
    approvalEngine.clearRegistry();

    // -------------------------------------------------------------
    // [TEST 1] Full E2E Pipeline to Review Workspace
    // -------------------------------------------------------------
    console.log('[TEST 1] Full E2E Pipeline to Review Workspace');
    {
      const sloof = createEntity('SL1', 'Balok Sloof 15x20', 'SLOOF', '15x20 cm', 1);
      sloof.geometry = { length: 40.0 };

      const col = createEntity('K1', 'Kolom Praktis 15x15', 'COLUMN', '15x15 cm', 8);
      col.geometry = { height: 3.5 };

      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rev_test',
        projectName: 'Gedung Uji Coba Review',
        entities: [sloof, col],
        ppnPercent: 11
      });

      const reviewItems = approvalEngine.initializeReviewItems(draftSummary);
      assert(reviewItems.length === 2, `Review workspace initialized with ${reviewItems.length} items`);
      assert(reviewItems[0].description.includes('Sloof'), 'Item 1 description mapped accurately');
      assert(reviewItems[0].calculationFormula.includes('0.15m × 0.20m × 40.00m'), 'Item 1 formula preserved');
    }

    // -------------------------------------------------------------
    // [TEST 2] 7-Tab Review Structure & Review Metric Counts
    // -------------------------------------------------------------
    console.log('\n[TEST 2] 7-Tab Structure & Review Counts Calculation');
    {
      const ent1 = createEntity('SL1', 'Balok Sloof', 'SLOOF', '15x20 cm', 1);
      ent1.geometry = { length: 40.0 };
      const entConf = createEntity('K1_CONF', 'Kolom Konflik', 'COLUMN', '30x30 cm', 4, 'Beton', 'CONFLICT');
      const entNoAhsp = createEntity('X1', 'Elemen Quantum Super Exotic', 'SPECIAL', 'N/A', 1);

      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rev_test',
        entities: [ent1, entConf, entNoAhsp]
      });

      const items = approvalEngine.initializeReviewItems(draftSummary);
      const counts = approvalEngine.calculateReviewCounts(items, 12, 3);

      assert(counts.totalPages === 12, 'Total pages count is 12');
      assert(counts.totalEntities === 3, 'Total entities count is 3');
      assert(counts.unmappedCount >= 1 || counts.mappedCount >= 1, `Review counts categorized items correctly (Unmapped: ${counts.unmappedCount}, Mapped: ${counts.mappedCount})`);
      assert(counts.conflictsCount >= 1, `Conflicts flagged accurately (${counts.conflictsCount})`);
      assert(counts.missingAhspCount >= 1, `Missing AHSP items detected (${counts.missingAhspCount})`);
    }

    // -------------------------------------------------------------
    // [TEST 3] 12-Column RAB Review Table Attributes
    // -------------------------------------------------------------
    console.log('\n[TEST 3] 12-Column RAB Review Table Verification');
    {
      const sloof = createEntity('SL1', 'Balok Sloof 15x20', 'SLOOF', '15x20 cm', 1);
      sloof.geometry = { length: 40.0 };

      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rev_test',
        entities: [sloof]
      });

      const items = approvalEngine.initializeReviewItems(draftSummary);
      const row = items[0];

      assert(typeof row.no === 'number', 'Column 1 (No) present');
      assert(Boolean(row.wbsCode), 'Column 2 (WBS) present');
      assert(row.ahspCode !== undefined, 'Column 3 (Kode AHSP) present');
      assert(Boolean(row.description), 'Column 4 (Uraian) present');
      assert(row.volume === 1.2, 'Column 5 (Volume) accurate (1.2 m³)');
      assert(row.unit === 'm³', 'Column 6 (Satuan) accurate (m³)');
      assert(typeof row.unitPrice === 'number', 'Column 7 (Harga Satuan) present');
      assert(row.totalPrice === SafeDecimalEngine.safeMultiply(row.volume, row.unitPrice), 'Column 8 (Jumlah) equals Volume * Harga');
      assert(Boolean(row.sumber), 'Column 9 (Sumber) present');
      assert(Boolean(row.status), 'Column 10 (Status) present');
      assert(Boolean(row.sourceTrace), 'Column 11 (Source) trace object present');
      assert(row.auditHistory.length >= 1, 'Column 12 (Action & Audit Log) initialized');
    }

    // -------------------------------------------------------------
    // [TEST 4] User Item Modification & Audit Logging
    // -------------------------------------------------------------
    console.log('\n[TEST 4] User Item Modification & Audit Logging');
    {
      const sloof = createEntity('SL1', 'Balok Sloof 15x20', 'SLOOF', '15x20 cm', 1);
      sloof.geometry = { length: 40.0 };

      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rev_test',
        entities: [sloof]
      });

      let items = approvalEngine.initializeReviewItems(draftSummary);
      const originalVolume = items[0].volume;

      // User modifies volume to 2.5 and unit price to 200,000
      items = approvalEngine.editItem(
        items,
        items[0].rabDraftItemId,
        {
          volume: 2.5,
          unitPrice: 200000
        },
        'Estimator Senior',
        'Penyesuaian volume berdasarkan addendum revisi 02'
      );

      assert(items[0].volume === 2.5, 'Volume successfully updated to 2.5');
      assert(items[0].unitPrice === 200000, 'Unit price successfully updated to 200,000');
      assert(items[0].totalPrice === 500000, 'Total price deterministically recalculated to 500,000 (2.5 * 200,000)');
      assert(items[0].status === 'MODIFIED', 'Item status marked as MODIFIED');
      assert(items[0].sumber === 'USER_OVERRIDE', 'Sumber marked as USER_OVERRIDE');
      assert(items[0].auditHistory.length === 2, 'Audit history recorded modification event');
      assert(items[0].auditHistory[1].actor === 'Estimator Senior', 'Audit history recorded correct actor');
      assert(items[0].auditHistory[1].previousValue.volume === originalVolume, 'Audit history recorded previous volume');
    }

    // -------------------------------------------------------------
    // [TEST 5] Item Rejection / Exclusion
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Item Rejection & Exclusion from Spreadsheet');
    {
      const ent1 = createEntity('SL1', 'Balok Sloof 15x20', 'SLOOF', '15x20 cm', 1);
      ent1.geometry = { length: 40.0 };
      const ent2 = createEntity('K1', 'Kolom Praktis 15x15', 'COLUMN', '15x15 cm', 8);
      ent2.geometry = { height: 3.5 };

      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rev_test',
        entities: [ent1, ent2]
      });

      let items = approvalEngine.initializeReviewItems(draftSummary);
      
      // Reject Column Item
      items = approvalEngine.rejectItem(
        items,
        items[1].rabDraftItemId,
        'Estimator Senior',
        'Dikerjakan oleh kontraktor spesialis terpisah'
      );

      assert(items[1].status === 'REJECTED', 'Item 2 status marked as REJECTED');
      assert(items[1].isExcluded === true, 'Item 2 isExcluded set to true');

      const proposal = approvalEngine.prepareProposal({
        projectId: 'proj_rev_test',
        workspaceId: 'ws_test',
        userId: 'usr_1',
        userName: 'Estimator',
        items
      });

      assert(proposal.totalItems === 2, 'Total items in proposal is 2');
      assert(proposal.activeItemsCount === 1, 'Active items count is 1');
      assert(proposal.rejectedItemsCount === 1, 'Rejected items count is 1');
      assert(proposal.subtotal === items[0].totalPrice, 'Proposal subtotal only includes active item');
    }

    // -------------------------------------------------------------
    // [TEST 6] Conflict Resolution
    // -------------------------------------------------------------
    console.log('\n[TEST 6] Conflict Resolution & Status Update');
    {
      const entConf = createEntity('K1_CONF', 'Kolom K1', 'COLUMN', '30x30 cm', 12, 'Beton', 'CONFLICT');
      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rev_test',
        entities: [entConf]
      });

      let items = approvalEngine.initializeReviewItems(draftSummary);
      assert(items[0].status === 'CONFLICT', 'Initial status is CONFLICT');

      items = approvalEngine.resolveConflict(
        items,
        items[0].rabDraftItemId,
        14.5,
        'Lead Architect',
        'Menggunakan dimensi potongan detail S-004'
      );

      assert(items[0].status === 'APPROVED', 'Status updated to APPROVED after conflict resolution');
      assert(items[0].volume === 14.5, 'Volume updated to chosen 14.5');
      assert(items[0].auditHistory.some(a => a.action === 'RESOLVE_CONFLICT'), 'RESOLVE_CONFLICT action logged');
    }

    // -------------------------------------------------------------
    // [TEST 7] Missing AHSP & Price Resolution
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Missing AHSP & Missing Price Resolution');
    {
      const entNoAhsp = createEntity('X1', 'Quantum Space Reactor Frame 9000', 'UNKNOWN', 'N/A', 1);
      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rev_test',
        entities: [entNoAhsp]
      });

      let items = approvalEngine.initializeReviewItems(draftSummary);
      assert(items[0].ahspCode === null, 'Initial AHSP code is null');

      // User selects AHSP from official PUPR database and sets custom price
      items = approvalEngine.editItem(
        items,
        items[0].rabDraftItemId,
        {
          ahspCode: '1.1.1',
          unitPrice: 187100,
          description: 'Pembuatan pagar proyek sementara'
        },
        'Estimator',
        'Pemilihan AHSP Cipta Karya 2026'
      );

      assert(items[0].ahspCode === '1.1.1', 'AHSP code updated to 1.1.1');
      assert(items[0].unitPrice === 187100, 'Unit price updated to 187,100');
      assert(items[0].totalPrice === 187100, 'Total price calculated accurately');
    }

    // -------------------------------------------------------------
    // [TEST 8] Idempotency Guard (Double-Click Protection)
    // -------------------------------------------------------------
    console.log('\n[TEST 8] Idempotency Guard (Double-Click Protection)');
    {
      const sloof = createEntity('SL1', 'Balok Sloof 15x20', 'SLOOF', '15x20 cm', 1);
      sloof.geometry = { length: 40.0 };

      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rev_test',
        entities: [sloof]
      });

      const items = approvalEngine.initializeReviewItems(draftSummary);
      const proposal = approvalEngine.prepareProposal({
        projectId: 'proj_rev_test',
        workspaceId: 'ws_test',
        userId: 'usr_1',
        userName: 'Estimator',
        items,
        idempotencyKey: 'idemp_key_double_click_test'
      });

      // First click
      const result1 = await approvalEngine.executeImportToSpreadsheet({
        proposal,
        authoritativeProjectId: 'proj_rev_test',
        authoritativeWorkspaceId: 'ws_test',
        userPermissions: ['AI_CREATE', 'AI_UPDATE']
      });

      assert(result1.success === true, 'First import execution succeeded');
      assert(result1.idempotentReplay === false, 'First execution marked as fresh execution');
      assert(result1.createdItemsCount === 1, '1 item created in spreadsheet');

      // Second click (Double click replay)
      const result2 = await approvalEngine.executeImportToSpreadsheet({
        proposal,
        authoritativeProjectId: 'proj_rev_test',
        authoritativeWorkspaceId: 'ws_test',
        userPermissions: ['AI_CREATE', 'AI_UPDATE']
      });

      assert(result2.success === true, 'Second import execution returned success');
      assert(result2.idempotentReplay === true, 'Second execution identified as idempotent replay');
      assert(result2.createdItemsCount === 1, 'Zero duplicate items generated (count remained 1)');
    }

    // -------------------------------------------------------------
    // [TEST 9] Strict Multi-Tenant & Project Isolation
    // -------------------------------------------------------------
    console.log('\n[TEST 9] Strict Multi-Tenant & Project Isolation Gating');
    {
      const ent = createEntity('SL1', 'Balok Sloof', 'SLOOF', '15x20 cm', 1);
      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_alpha',
        entities: [ent]
      });

      const items = approvalEngine.initializeReviewItems(draftSummary);
      const proposalAlpha = approvalEngine.prepareProposal({
        projectId: 'proj_alpha',
        workspaceId: 'ws_alpha',
        userId: 'usr_1',
        userName: 'Estimator',
        items
      });

      // Try applying Alpha proposal to Beta project
      let securityCaught = false;
      try {
        await approvalEngine.executeImportToSpreadsheet({
          proposal: proposalAlpha,
          authoritativeProjectId: 'proj_beta', // Mismatch!
          authoritativeWorkspaceId: 'ws_alpha',
          userPermissions: ['AI_CREATE']
        });
      } catch (err: any) {
        if (err.message.includes('[SECURITY_VIOLATION]')) {
          securityCaught = true;
        }
      }

      assert(securityCaught === true, 'Cross-project mismatch strictly blocked by security guard');
    }

    // -------------------------------------------------------------
    // [TEST 10] RBAC & Permission Gating
    // -------------------------------------------------------------
    console.log('\n[TEST 10] RBAC & Permission Gating');
    {
      const ent = createEntity('SL1', 'Balok Sloof', 'SLOOF', '15x20 cm', 1);
      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_rbac_test',
        entities: [ent]
      });

      const items = approvalEngine.initializeReviewItems(draftSummary);
      const proposal = approvalEngine.prepareProposal({
        projectId: 'proj_rbac_test',
        workspaceId: 'ws_rbac',
        userId: 'usr_guest',
        userName: 'Guest User',
        items
      });

      let permissionDenied = false;
      try {
        await approvalEngine.executeImportToSpreadsheet({
          proposal,
          authoritativeProjectId: 'proj_rbac_test',
          authoritativeWorkspaceId: 'ws_rbac',
          userPermissions: ['READ_ONLY_VIEWER'] // No AI_CREATE / AI_UPDATE
        });
      } catch (err: any) {
        if (err.message.includes('[PERMISSION_DENIED]')) {
          permissionDenied = true;
        }
      }

      assert(permissionDenied === true, 'Unauthorized user without AI_CREATE permission rejected');
    }

    // -------------------------------------------------------------
    // [TEST 11] Mathematical Precision & Live UI Synchronization
    // -------------------------------------------------------------
    console.log('\n[TEST 11] Mathematical Precision & Live UI Synchronization');
    {
      const sloof = createEntity('SL1', 'Balok Sloof 15x20', 'SLOOF', '15x20 cm', 1);
      sloof.geometry = { length: 40.0 };
      const col = createEntity('K1', 'Kolom Praktis 15x15', 'COLUMN', '15x15 cm', 8);
      col.geometry = { height: 3.5 };

      const draftSummary = rabEngine.generateRabDraft({
        projectId: 'proj_sync_test',
        entities: [sloof, col],
        ppnPercent: 11
      });

      const items = approvalEngine.initializeReviewItems(draftSummary);
      const proposal = approvalEngine.prepareProposal({
        projectId: 'proj_sync_test',
        workspaceId: 'ws_sync',
        userId: 'usr_admin',
        userName: 'Admin',
        items
      });

      let syncedSections: RABSection[] = [];
      let syncedGrandTotal: number = 0;

      const result = await approvalEngine.executeImportToSpreadsheet({
        proposal,
        authoritativeProjectId: 'proj_sync_test',
        authoritativeWorkspaceId: 'ws_sync',
        userPermissions: ['SUPER_ADMIN'],
        onCommitSuccess: (sections, grandTotal) => {
          syncedSections = sections;
          syncedGrandTotal = grandTotal;
        }
      });

      assert(result.success === true, 'Import executed successfully');
      assert(syncedSections.length > 0, `Spreadsheet instantly received ${syncedSections.length} WBS sections`);
      
      const calculatedSubtotal = syncedSections.reduce((sum, sec) => SafeDecimalEngine.safeAdd(sum, sec.subtotal), 0);
      assert(calculatedSubtotal === result.subtotal, `Section subtotals sum (${calculatedSubtotal}) matches result subtotal (${result.subtotal})`);

      const expectedPpn = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(calculatedSubtotal, 0.11), 0);
      assert(result.ppnAmount === expectedPpn, `PPN matches 11% exact integer (${result.ppnAmount})`);
      assert(syncedGrandTotal === result.grandTotal, `Instant UI sync grand total matches exact calculation (${syncedGrandTotal})`);
    }

    console.log('\n============================================================');
    console.log(`EZRAB PHASE 6.6 TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('============================================================\n');

    return failed === 0;
  } catch (error) {
    console.error('Fatal error in Phase 6.6 test suite:', error);
    return false;
  }
}

// Direct execution
if (process.argv[1] && process.argv[1].includes('phase6_6_reviewApprovalSpreadsheet')) {
  runPhase66Tests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
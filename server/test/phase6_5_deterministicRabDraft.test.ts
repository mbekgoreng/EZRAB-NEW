/**
 * Phase 6.5 Synthetic Test Suite: Deterministic QTO -> AHSP -> Price -> RAB Draft
 *
 * Tests:
 * 1. Deterministic QTO (Volume formulas, e.g. Sloof 0.15 x 0.20 x 40 = 1.20 m3)
 * 2. AHSP Exact Match (Official PUPR code matching & coefficients)
 * 3. AHSP Missing Handling (ahspCode = null, no fabricated codes)
 * 4. Price Available (Authoritative database price lookup)
 * 5. Price Missing Handling (PRICE_NOT_FOUND, no silent price fabrication)
 * 6. AI Estimated Price Handling (source = AI_ESTIMATE, status = NEEDS_VERIFICATION)
 * 7. Duplicate Quantity Prevention (Zero double-counting in RAB items)
 * 8. Conflicting Dimension Detection (Flags discrepancy in QTO & RAB)
 * 9. Invalid Unit Handling (Flags empty/invalid units)
 * 10. Project & Tenant Isolation (Zero cross-project data leakage)
 * 11. Total Consistency & Mathematical Precision (Subtotal + Grand Total exact match)
 */

import { DeterministicQtoEngine } from '../services/deterministicQtoEngine';
import { AuthoritativeAhspPriceBridge } from '../services/authoritativeAhspPriceBridge';
import { DeterministicRabDraftEngine } from '../services/deterministicRabDraftEngine';
import { DeterministicRabCoordinator } from '../services/deterministicRabCoordinator';
import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';
import { TemplateMappingCoordinator } from '../services/templateMappingCoordinator';
import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';

export async function runPhase65Tests(): Promise<boolean> {
  console.log('============================================================');
  console.log('EZRAB PHASE 6.5: DETERMINISTIC QTO -> AHSP -> PRICE -> RAB DRAFT');
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

  // Helper to create mock canonical entities
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
      projectId: 'proj_test',
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
    const qtoEngine = DeterministicQtoEngine.getInstance();
    const ahspBridge = AuthoritativeAhspPriceBridge.getInstance();
    const rabEngine = DeterministicRabDraftEngine.getInstance();
    const rabCoordinator = DeterministicRabCoordinator.getInstance();

    // -------------------------------------------------------------
    // [TEST 1] Deterministic QTO Calculation
    // -------------------------------------------------------------
    console.log('[TEST 1] Deterministic QTO Geometric Math');
    {
      const sloofEntity = createEntity('SL1', 'Balok Sloof 15x20', 'SLOOF', '15x20 cm', 1);
      sloofEntity.geometry = { length: 40.0 };

      const colEntity = createEntity('K1', 'Kolom Praktis 15x15', 'COLUMN', '15x15 cm', 8);
      colEntity.geometry = { height: 3.5 };

      const qtoResults = qtoEngine.calculateQto({
        projectId: 'p_qto_test',
        entities: [sloofEntity, colEntity]
      });

      const sloofQto = qtoResults.find(q => q.entityId === 'ent_SL1');
      assert(Boolean(sloofQto), 'Sloof QTO item created');
      // 0.15 x 0.20 x 40 = 1.20 m3
      assert(sloofQto?.volume === 1.20, `Sloof volume exactly 1.20 m³ (Actual: ${sloofQto?.volume})`);
      assert(sloofQto?.unit === 'm³', 'Sloof unit is m³');

      const colQto = qtoResults.find(q => q.entityId === 'ent_K1');
      assert(Boolean(colQto), 'Column QTO item created');
      // 0.15 x 0.15 x 3.5 x 8 = 0.63 m3
      assert(colQto?.volume === 0.63, `Column volume exactly 0.63 m³ (Actual: ${colQto?.volume})`);
    }

    // -------------------------------------------------------------
    // [TEST 2] AHSP Exact Match & Coefficients Breakdown
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Official AHSP Exact Match & Coefficients');
    {
      const match = ahspBridge.searchAhsp('Pembuatan pagar proyek', '1.1.1', 'Pekerjaan Persiapan');
      assert(match.matchStatus === 'EXACT_MATCH', 'Exact match status returned');
      assert(match.ahspCode === '1.1.1', 'Matched official AHSP code 1.1.1');
      assert(match.isOfficial === true, 'Marked as official PUPR AHSP standard');
      assert(match.coefficients.length > 0, `Coefficients breakdown available (${match.coefficients.length} components)`);
    }

    // -------------------------------------------------------------
    // [TEST 3] AHSP Missing Handling (No Fabrication)
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Missing AHSP Handling (Zero Code Hallucination)');
    {
      const match = ahspBridge.searchAhsp('Antigravity Quantum Space Reactor Frame', undefined, 'Specialty');
      assert(match.matchStatus === 'NOT_FOUND', 'Match status returned NOT_FOUND');
      assert(match.ahspCode === null, 'AHSP code preserved as null (never fabricated)');
      assert(match.baseUnitPrice === null, 'Base unit price preserved as null');
    }

    // -------------------------------------------------------------
    // [TEST 4] Authoritative Price Lookup
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Authoritative Price Lookup from Database');
    {
      const ahspMatch = ahspBridge.searchAhsp('Pembuatan pagar proyek', '1.1.1');
      const priceRes = ahspBridge.lookupPrice(ahspMatch, false);

      assert(priceRes.priceStatus === 'PRICE_VERIFIED', 'Price status is PRICE_VERIFIED');
      assert(priceRes.unitPrice > 0, `Price value is greater than zero (Rp ${priceRes.unitPrice.toLocaleString('id-ID')})`);
      assert(priceRes.source === 'OFFICIAL_REGIONAL_DB', 'Source is OFFICIAL_REGIONAL_DB');
    }

    // -------------------------------------------------------------
    // [TEST 5] Missing Price Handling (PRICE_NOT_FOUND)
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Missing Price Handling (No Price Fabrication)');
    {
      const nullAhsp = {
        matchStatus: 'NOT_FOUND' as const,
        ahspCode: null,
        ahspTitle: null,
        standardCategory: null,
        baseUnitPrice: null,
        coefficients: [],
        isOfficial: false,
        confidence: 0.0
      };
      const priceRes = ahspBridge.lookupPrice(nullAhsp, false);

      assert(priceRes.priceStatus === 'PRICE_NOT_FOUND', 'Price status is PRICE_NOT_FOUND');
      assert(priceRes.unitPrice === 0, 'Unit price is 0');
      assert(priceRes.status === 'PRICE_MISSING', 'Status is PRICE_MISSING');
    }

    // -------------------------------------------------------------
    // [TEST 6] AI Estimated Price Handling
    // -------------------------------------------------------------
    console.log('\n[TEST 6] AI Estimated Price Flagging');
    {
      const nullAhsp = {
        matchStatus: 'NOT_FOUND' as const,
        ahspCode: null,
        ahspTitle: null,
        standardCategory: null,
        baseUnitPrice: null,
        coefficients: [],
        isOfficial: false,
        confidence: 0.0
      };
      const priceRes = ahspBridge.lookupPrice(nullAhsp, true);

      assert(priceRes.priceStatus === 'AI_ESTIMATED', 'Price status is AI_ESTIMATED');
      assert(priceRes.source === 'AI_ESTIMATE', 'Source is AI_ESTIMATE');
      assert(priceRes.status === 'NEEDS_VERIFICATION', 'Status explicitly flagged as NEEDS_VERIFICATION');
    }

    // -------------------------------------------------------------
    // [TEST 7] Duplicate Quantity Prevention
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Duplicate Quantity Prevention in Draft RAB');
    {
      const ent1 = createEntity('K1_A', 'Kolom Praktis 15x15', 'COLUMN', '15x15 cm', 4);
      ent1.geometry = { height: 3.5 };
      const ent2 = createEntity('K1_B', 'Kolom Praktis 15x15', 'COLUMN', '15x15 cm', 4);
      ent2.isDuplicate = true; // Neutralized duplicate

      const draft = rabEngine.generateRabDraft({
        projectId: 'p_dup_test',
        entities: [ent1, ent2]
      });

      assert(draft.totalItems === 1, 'Only 1 active non-duplicate entity processed into RAB item');
    }

    // -------------------------------------------------------------
    // [TEST 8] Conflicting Dimension Propagation
    // -------------------------------------------------------------
    console.log('\n[TEST 8] Conflicting Dimension Propagation & Review');
    {
      const conflictEnt = createEntity('K1_CONF', 'Kolom K1 Konflik', 'COLUMN', '30x30 cm', 8, 'Beton', 'CONFLICT');
      const draft = rabEngine.generateRabDraft({
        projectId: 'p_conf_test',
        entities: [conflictEnt]
      });

      const confItem = draft.items.find(i => i.entityId === 'ent_K1_CONF');
      assert(Boolean(confItem), 'Conflict item in draft');
      assert(confItem?.validationStatus === 'NEEDS_REVIEW', 'Conflict item marked as NEEDS_REVIEW');
      assert(draft.conflictsCount >= 1, 'Conflicts counter incremented');
    }

    // -------------------------------------------------------------
    // [TEST 9] Invalid Unit Handling
    // -------------------------------------------------------------
    console.log('\n[TEST 9] Invalid Unit Handling & Audit');
    {
      const invalidEnt = createEntity('INV1', 'Item Tanpa Satuan', 'UNKNOWN', 'N/A', 0);
      const draft = rabEngine.generateRabDraft({
        projectId: 'p_inv_test',
        entities: [invalidEnt]
      });

      assert(draft.items[0]?.validationStatus === 'INVALID', 'Zero volume or invalid item flagged as INVALID');
    }

    // -------------------------------------------------------------
    // [TEST 10] Project & Tenant Isolation Guarantee
    // -------------------------------------------------------------
    console.log('\n[TEST 10] Project & Tenant Isolation Guarantee');
    {
      const entA = createEntity('K1_PA', 'Kolom Proyek A', 'COLUMN', '30x30 cm', 4);
      const entB = createEntity('K1_PB', 'Kolom Proyek B', 'COLUMN', '40x40 cm', 10);

      await rabCoordinator.processRabDraft({
        projectId: 'proj_alpha',
        tenantId: 'tenant_alpha',
        entities: [entA]
      });

      await rabCoordinator.processRabDraft({
        projectId: 'proj_beta',
        tenantId: 'tenant_beta',
        entities: [entB]
      });

      const draftA = rabCoordinator.getCachedDraft('proj_alpha', 'tenant_alpha');
      const draftB = rabCoordinator.getCachedDraft('proj_beta', 'tenant_beta');

      assert(draftA?.items.length === 1 && draftA.items[0].description.includes('Proyek A'), 'Project Alpha strictly isolated');
      assert(draftB?.items.length === 1 && draftB.items[0].description.includes('Proyek B'), 'Project Beta strictly isolated');
      assert(rabCoordinator.getCachedDraft('proj_alpha', 'tenant_beta') === undefined, 'Zero cross-tenant leakage');
    }

    // -------------------------------------------------------------
    // [TEST 11] Total Consistency & Mathematical Precision
    // -------------------------------------------------------------
    console.log('\n[TEST 11] Total Consistency & Mathematical Precision');
    {
      const entSloof = createEntity('SL1', 'Balok Sloof 15x20', 'SLOOF', '15x20 cm', 1);
      entSloof.geometry = { length: 40.0 };

      const entCol = createEntity('K1', 'Kolom Struktur 30x30', 'COLUMN', '30x30 cm', 8);
      entCol.geometry = { height: 3.5 };

      const draft = rabEngine.generateRabDraft({
        projectId: 'p_total_test',
        entities: [entSloof, entCol],
        ppnPercent: 11
      });

      const manualSubtotal = draft.items.reduce((sum, item) => SafeDecimalEngine.safeAdd(sum, item.totalPrice), 0);
      assert(draft.subtotal === manualSubtotal, `Draft subtotal (${draft.subtotal}) equals sum of item totals (${manualSubtotal})`);

      const expectedPpn = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(manualSubtotal, 0.11), 0);
      assert(draft.ppnAmount === expectedPpn, `PPN amount matches 11% exact integer calculation (${draft.ppnAmount})`);

      const expectedGrandTotal = SafeDecimalEngine.safeAdd(manualSubtotal, expectedPpn);
      assert(draft.grandTotal === expectedGrandTotal, `Grand total matches Subtotal + PPN (${draft.grandTotal})`);
    }

    console.log('\n============================================================');
    console.log(`EZRAB PHASE 6.5 TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('============================================================\n');

    return failed === 0;
  } catch (error) {
    console.error('Fatal error in Phase 6.5 test suite:', error);
    return false;
  }
}

// Direct execution
if (process.argv[1] && process.argv[1].includes('phase6_5_deterministicRabDraft')) {
  runPhase65Tests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

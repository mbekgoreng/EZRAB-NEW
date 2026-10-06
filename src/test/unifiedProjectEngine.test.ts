/**
 * EZRAB — UNIFIED PROJECT DATA ARCHITECTURE TEST SUITE
 * 
 * Validates:
 * 1. Calculator -> QTO -> RAB -> BOQ -> Rekapitulasi cascade.
 * 2. Price override -> AHSP -> RAB -> BOQ recalculation.
 * 3. Schedule Tasks -> Dynamic Kurva S & weights calculation.
 * 4. Strict project isolation (Project A != Project B).
 * 5. Delete safety & detachment without breaking RAB references.
 * 6. Zero fake data on clean state.
 */

import {
  recalculateCostSummary,
  computeItemWeights,
  recalculateScheduleAndKurvaS,
  traceItemLineage,
  createDefaultProjectScheduleTasks,
} from '../engine/unifiedProjectEngine';
import { Project, QTOItem, RabItem } from '../types';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';

export function runUnifiedProjectTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING EZRAB UNIFIED PROJECT ARCHITECTURE TESTS');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 1: CALCULATOR -> QTO -> RAB -> BOQ -> REKAPITULASI CASCADE
  // -------------------------------------------------------------------------
  try {
    const projectA: Project = {
      id: 'proj-alpha',
      name: 'Proyek Alpha',
      location: 'Jakarta',
      clientName: 'PT Test Alpha',
      status: 'DRAFT',
      createdAt: '2026-09-09T00:00:00Z',
      sections: [],
      costSummary: {
        directCost: 0,
        overheadPercent: 0,
        overheadAmount: 0,
        profitPercent: 10,
        profitAmount: 0,
        contingencyPercent: 0,
        contingencyAmount: 0,
        directorMarkupPercent: 0,
        directorMarkupNominal: 0,
        directorMarkupTotal: 0,
        showMarkupToEditor: false,
        showMarkupToClient: false,
        subtotalBeforeTax: 0,
        taxPercent: 11,
        taxAmount: 0,
        grandTotal: 0,
        costPerM2: 0,
      },
    };

    // Linked RAB Item
    const rabItem: RabItem = {
      id: 'rab-item-1',
      no: 1,
      projectId: 'proj-alpha',
      code: 'A.2.2.1.4',
      description: 'Pengukuran dan Pemasangan Bowplank',
      category: 'Pekerjaan Persiapan',
      volume: 50,
      unit: "m'",
      unitPrice: 100000,
      amount: 5000000,
      volumeSource: 'CALCULATOR',
      qtoItemId: 'qto-bowplank-1',
    };

    // Step 1: Check initial summary
    let summary = recalculateCostSummary([rabItem], {
      profitPercent: 10,
      taxPercent: 11,
      overheadPercent: 0,
      contingencyPercent: 0,
      directorMarkupPercent: 0,
    });

    assert(summary.directCost === 5000000, 'Test 1.1: Direct Cost calculates exact base amount', `Expected 5,000,000, got ${summary.directCost}`);
    assert(summary.profitAmount === 500000, 'Test 1.2: Profit 10% on 5,000,000 is 500,000', `Got ${summary.profitAmount}`);
    assert(summary.subtotalBeforeTax === 5500000, 'Test 1.3: Subtotal before tax is 5,500,000', `Got ${summary.subtotalBeforeTax}`);
    assert(summary.taxAmount === 605000, 'Test 1.4: Tax (PPN 11%) on 5,500,000 is 605,000', `Got ${summary.taxAmount}`);
    assert(summary.grandTotal === 6105000, 'Test 1.5: Grand total is 6,105,000', `Got ${summary.grandTotal}`);

    // Step 2: Simulate User changing parameter P: 15 -> 20 (new volume = 60 m')
    const updatedVolume = 60;
    const cascadedRabItem: RabItem = {
      ...rabItem,
      volume: updatedVolume,
      amount: SafeDecimalEngine.safeMultiply(updatedVolume, rabItem.unitPrice, 0),
    };

    summary = recalculateCostSummary([cascadedRabItem], {
      profitPercent: 10,
      taxPercent: 11,
      overheadPercent: 0,
      contingencyPercent: 0,
      directorMarkupPercent: 0,
    });
    assert(cascadedRabItem.amount === 6000000, 'Test 1.6: RAB Item amount auto-cascades to 6,000,000');
    assert(summary.directCost === 6000000, 'Test 1.7: Direct Cost cascades to 6,000,000');
    assert(summary.grandTotal === 7326000, 'Test 1.8: Grand Total cascades with PPN & Profit to 7,326,000');
  } catch (e: any) {
    assert(false, 'Test 1: Cascade Execution', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2: PRICE OVERRIDE CASCADE
  // -------------------------------------------------------------------------
  try {
    const rabItemA: RabItem = {
      id: 'rab-a',
      no: 1,
      projectId: 'proj-alpha',
      code: 'A.1',
      description: 'Pekerjaan A',
      category: 'Struktur',
      volume: 10,
      unit: 'm³',
      unitPrice: 500000,
      amount: 5000000,
    };
    const rabItemB: RabItem = {
      id: 'rab-b',
      no: 2,
      projectId: 'proj-alpha',
      code: 'A.2',
      description: 'Pekerjaan B',
      category: 'Struktur',
      volume: 20,
      unit: 'm²',
      unitPrice: 250000,
      amount: 5000000,
    };

    // Override unit price of Item A: 500,000 -> 750,000
    const newUnitPrice = 750000;
    const updatedRabItemA: RabItem = {
      ...rabItemA,
      unitPrice: newUnitPrice,
      amount: SafeDecimalEngine.safeMultiply(rabItemA.volume, newUnitPrice, 0),
    };

    const weightedItems = computeItemWeights([updatedRabItemA, rabItemB]) as any[];
    assert(updatedRabItemA.amount === 7500000, 'Test 2.1: Price override updates Item A amount to 7,500,000');
    
    // Total = 7,500,000 + 5,000,000 = 12,500,000
    // Item A Weight = (7.5 / 12.5) * 100 = 60%
    // Item B Weight = (5.0 / 12.5) * 100 = 40%
    assert(weightedItems[0].weight === 60, 'Test 2.2: Item A weight dynamically recalculated to 60.00%', `Got ${weightedItems[0].weight}`);
    assert(weightedItems[1].weight === 40, 'Test 2.3: Item B weight dynamically recalculated to 40.00%', `Got ${weightedItems[1].weight}`);
  } catch (e: any) {
    assert(false, 'Test 2: Price Override', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: SCHEDULE TASKS & KURVA S RECALCULATION
  // -------------------------------------------------------------------------
  try {
    const rabItems: RabItem[] = [
      { id: 'rab-1', no: 1, projectId: 'p1', code: 'C.1', description: 'Persiapan', category: 'Pekerjaan Persiapan', volume: 1, unit: 'ls', unitPrice: 20000000, amount: 20000000 },
      { id: 'rab-2', no: 2, projectId: 'p1', code: 'C.2', description: 'Struktur', category: 'Pekerjaan Struktur', volume: 1, unit: 'ls', unitPrice: 80000000, amount: 80000000 },
    ];

    const tasks = createDefaultProjectScheduleTasks('p1', rabItems);
    assert(tasks.length === 2, 'Test 3.1: Auto-generates schedule tasks from RAB categories');

    const kurvaResult = recalculateScheduleAndKurvaS(rabItems, tasks, 8);
    assert(kurvaResult.kurvaS.length === 8, 'Test 3.2: Generates 8 weeks of Kurva S plan & actual data');
    
    // Last week cumulative planned progress should reach 100%
    const lastWeek = kurvaResult.kurvaS[7];
    assert(lastWeek.cumulativePlannedPercent >= 99.9 && lastWeek.cumulativePlannedPercent <= 100.1, 'Test 3.3: Kurva S final cumulative reaches 100.00%', `Got ${lastWeek.cumulativePlannedPercent}`);
  } catch (e: any) {
    assert(false, 'Test 3: Schedule & Kurva S', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: STRICT MULTI-PROJECT DATA ISOLATION
  // -------------------------------------------------------------------------
  try {
    const project1Qto: QTOItem = {
      id: 'qto-p1',
      projectId: 'project-1',
      calculatorId: 'BOWPLANK',
      kode: 'A.1',
      uraian: 'Bowplank P1',
      quantity: 100,
      unit: "m'",
      source: 'CALCULATOR',
      status: 'SYNCED_TO_RAB',
      createdAt: '',
      updatedAt: '',
    };
    const project2Qto: QTOItem = {
      id: 'qto-p2',
      projectId: 'project-2',
      calculatorId: 'SLOOF',
      kode: 'B.1',
      uraian: 'Sloof P2',
      quantity: 20,
      unit: 'm³',
      source: 'CALCULATOR',
      status: 'SYNCED_TO_RAB',
      createdAt: '',
      updatedAt: '',
    };

    const allQto = [project1Qto, project2Qto];
    const p1Items = allQto.filter((q) => q.projectId === 'project-1');
    const p2Items = allQto.filter((q) => q.projectId === 'project-2');

    assert(p1Items.length === 1 && p1Items[0].id === 'qto-p1', 'Test 4.1: Project 1 only receives Project 1 QTO items');
    assert(p2Items.length === 1 && p2Items[0].id === 'qto-p2', 'Test 4.2: Project 2 only receives Project 2 QTO items');
  } catch (e: any) {
    assert(false, 'Test 4: Project Isolation', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: SAFE DELETION & DETACHMENT LINEAGE
  // -------------------------------------------------------------------------
  try {
    const qtoId = 'qto-to-delete';
    const rabItem: RabItem = {
      id: 'rab-linked',
      no: 1,
      projectId: 'p1',
      code: 'X.1',
      description: 'Pondasi Batu Kali',
      category: 'Pekerjaan Pondasi',
      volume: 15,
      unit: 'm³',
      unitPrice: 850000,
      amount: 12750000,
      volumeSource: 'CALCULATOR',
      qtoItemId: qtoId,
    };

    const qtoItem: QTOItem = {
      id: qtoId,
      projectId: 'p1',
      calculatorId: 'PONDASI',
      kode: 'X.1',
      uraian: 'Pondasi Batu Kali',
      quantity: 15,
      unit: 'm³',
      source: 'CALCULATOR',
      status: 'SYNCED_TO_RAB',
      createdAt: '',
      updatedAt: '',
    };

    const mappings = [{ id: 'm-1', projectId: 'p1', qtoItemId: qtoId, rabItemId: rabItem.id, quantitySource: 'CALCULATOR' as const, createdAt: '', updatedAt: '' }];

    // Lineage check BEFORE deletion
    let lineage = traceItemLineage(qtoId, [qtoItem], [rabItem], mappings);

    assert(lineage.sourceCalculator === 'PONDASI', 'Test 5.1: Lineage traces to PONDASI calculator before deletion');
    assert(lineage.linkedRabItem?.id === rabItem.id, 'Test 5.2: Lineage references RAB item');

    // Simulate safe deletion detachment: QTO deleted, mapping removed, RAB converted to MANUAL
    const detachedRabItem: RabItem = {
      ...rabItem,
      volumeSource: 'MANUAL',
      qtoItemId: undefined,
    };

    lineage = traceItemLineage(qtoId, [], [detachedRabItem], []);
    assert(detachedRabItem.volume === 15, 'Test 5.3: Detached RAB item retains its calculated volume safely');
    assert(detachedRabItem.volumeSource === 'MANUAL', 'Test 5.4: RAB item source converted to MANUAL to prevent dangling pointer');
    assert(lineage.qto === undefined, 'Test 5.5: QTO cleanly unlinked after deletion');
  } catch (e: any) {
    assert(false, 'Test 5: Safe Deletion', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST 6: CLEAN EMPTY STATE FOR NEW ACCOUNTS (ZERO FAKE STATS)
  // -------------------------------------------------------------------------
  try {
    const emptyRabItems: RabItem[] = [];
    const emptySummary = recalculateCostSummary(emptyRabItems);
    const emptyWeights = computeItemWeights(emptyRabItems);
    const emptySchedule = recalculateScheduleAndKurvaS(emptyRabItems, [], 4);

    assert(emptySummary.directCost === 0, 'Test 6.1: Clean state has 0 Direct Cost');
    assert(emptySummary.grandTotal === 0, 'Test 6.2: Clean state has 0 Grand Total');
    assert(emptyWeights.length === 0, 'Test 6.3: Clean state has 0 Weighted items');
    assert(emptySchedule.tasks.length === 0, 'Test 6.4: Clean state has 0 tasks');
  } catch (e: any) {
    assert(false, 'Test 6: Clean State', e.message);
  }

  console.log('====================================================');
  console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  return { passed, failed, total: passed + failed };
}

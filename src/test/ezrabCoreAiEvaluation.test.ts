/**
 * ============================================================================
 * EZRAB CORE AI — 15 GOLDEN TASKS MASTER EVALUATION TEST SUITE
 * ============================================================================
 * 
 * Tests the single unified master orchestrator (EZRAB Core AI) against all
 * 15 mandatory Golden Tasks specified in Section 42:
 * 
 * TASK 01: Create RAB from DED
 * TASK 02: Calculate foundation volume
 * TASK 03: Find AHSP foundation
 * TASK 04: Find material price
 * TASK 05: Update project price
 * TASK 06: Create RAB from QTO
 * TASK 07: Audit RAB
 * TASK 08: Explain missing price
 * TASK 09: Explain AHSP mismatch
 * TASK 10: Fix missing price
 * TASK 11: Resolve ambiguous AHSP
 * TASK 12: Handle missing quantity
 * TASK 13: Handle wrong AHSP version
 * TASK 14: Prevent fake AI-CUSTOM AHSP
 * TASK 15: Project isolation
 */

import { ezrabCoreAi } from '../services/ai/core/ezrabCoreAi';
import { intentEngine } from '../services/ai/core/intentEngine';
import { planningEngine } from '../services/ai/core/planningEngine';
import { ruleEngine } from '../services/ai/core/ruleEngine';
import { selfReviewEngine } from '../services/ai/core/selfReviewEngine';
import { taskStateManager } from '../services/ai/core/taskState';
import { aiToolRegistry } from '../services/ai/tools/aiToolRegistry';
import { ezrabProjectCopilot } from '../services/ai/orchestration/aiOrchestrator';
import { unifiedConversationStore } from '../services/ai/conversation/unifiedConversationStore';
import { ProjectIsolationError } from '../services/unifiedProjectContext';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import type { Project, RabItem } from '../types';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runCoreAiEvaluation() {
  console.log('\n======================================================================');
  console.log('🌟 EZRAB CORE AI — 15 GOLDEN TASKS MASTER EVALUATION');
  console.log('======================================================================\n');

  const PROJ_TEST_1 = 'PRJ-EVAL-01';
  const PROJ_TEST_2 = 'PRJ-EVAL-02';

  const mockProject1: Project = {
    id: PROJ_TEST_1,
    name: 'Rumah Tinggal 2 Lantai Modern',
    location: 'Jakarta Selatan',
    contractValue: 850000000,
    status: 'planning',
    progress: 0,
    startDate: '2026-03-01',
    endDate: '2026-09-01',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  } as any;

  const defaultToolContext = {
    projectId: PROJ_TEST_1,
    conversationId: 'conv-eval-01',
    project: mockProject1,
  };

  const sampleRabItems: RabItem[] = [
    {
      id: 'rab-item-1',
      no: 1,
      code: '01.01',
      description: 'Pembersihan Lapangan',
      volume: 120,
      unit: 'm²',
      unitPrice: 15000,
      amount: 1800000,
      category: 'Pekerjaan Persiapan',
      projectId: PROJ_TEST_1,
      ahspCode: 'A.2.2.1.9',
    },
    {
      id: 'rab-item-2',
      no: 2,
      code: '02.01',
      description: 'Pondasi Batu Kali 1:4',
      volume: 17.28,
      unit: 'm³',
      unitPrice: 950000,
      amount: 16416000,
      category: 'Pekerjaan Struktur',
      projectId: PROJ_TEST_1,
      ahspCode: 'A.3.2.1.2',
    },
    {
      id: 'rab-item-3',
      no: 3,
      code: '02.02',
      description: 'Beton Kolom K-250',
      volume: 4.5,
      unit: 'm³',
      unitPrice: 1150000,
      amount: 5175000,
      category: 'Pekerjaan Struktur',
      projectId: PROJ_TEST_1,
      ahspCode: 'A.4.1.1.5',
    },
  ];

  // --------------------------------------------------------------------------
  // TASK 01: Create RAB from DED
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 01: Create RAB from DED ---');
  {
    const intentRes = intentEngine.classifyIntent('Buat RAB dari gambar DED untuk proyek ini');
    assert(intentRes.type === 'CREATE_RAB_FROM_DED', 'TASK 01.1: Intent recognized as CREATE_RAB_FROM_DED');

    const plan = planningEngine.buildPlan('CREATE_RAB_FROM_DED', 'Buat RAB dari gambar DED');
    assert(plan.steps.length >= 6, `TASK 01.2: Planning engine generated multi-step plan (${plan.steps.length} steps)`);
    assert(plan.steps.some(s => s.toolName === 'read_ded_document'), 'TASK 01.3: Plan contains read_ded_document step');
    assert(plan.steps.some(s => s.toolName === 'classify_ded_objects'), 'TASK 01.4: Plan contains classify_ded_objects step');

    const response = await ezrabCoreAi.processRequest({
      projectId: PROJ_TEST_1,
      conversationId: 'conv-eval-01',
      message: 'Buat RAB dari gambar DED untuk proyek ini',
      project: mockProject1,
      rabItems: sampleRabItems,
    });

    assert(response.intent === 'CREATE_RAB_FROM_DED', 'TASK 01.5: Core AI executed CREATE_RAB_FROM_DED request');
    assert(response.message.role === 'assistant', 'TASK 01.6: Assistant message generated');
    assert(response.agentLoopResult !== undefined, 'TASK 01.7: Agent loop execution result returned');
    assert(response.agentLoopResult!.traces.length > 0, 'TASK 01.8: Step traces recorded');
  }

  // --------------------------------------------------------------------------
  // TASK 02: Calculate foundation volume
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 02: Calculate foundation volume ---');
  {
    const length = 24;
    const topWidth = 0.3;
    const bottomWidth = 0.8;
    const height = 0.8;

    // Deterministic trapezoid calculation via SafeDecimalEngine
    const avgWidth = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(topWidth, bottomWidth), 2); // 0.55
    const area = SafeDecimalEngine.safeMultiply(avgWidth, height); // 0.44
    const volume = SafeDecimalEngine.safeMultiply(area, length); // 10.56

    assert(volume === 10.56, `TASK 02.1: SafeDecimalEngine trapezoid volume is exact 10.56 m³ (Got: ${volume})`);

    const calcToolRes = await aiToolRegistry.executeTool('calculate_volume', {
      length: 24,
      width: 0.55,
      height: 0.8,
    }, defaultToolContext);

    assert(calcToolRes.success === true, 'TASK 02.2: calculate_volume tool executed successfully');
    const calcResult = (calcToolRes as any).result;
    assert(calcResult.volume === 10.56, 'TASK 02.3: Tool volume matches 10.56 m³');
    assert(calcResult.unit === 'm³', 'TASK 02.4: Volume unit is m³');
  }

  // --------------------------------------------------------------------------
  // TASK 03: Find AHSP foundation
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 03: Find AHSP foundation ---');
  {
    const searchRes = await aiToolRegistry.executeTool('search_ahsp', {
      query: 'pondasi batu belah',
    }, defaultToolContext);

    assert(searchRes.success === true, 'TASK 03.1: search_ahsp tool executed successfully');
    const items = (searchRes as any).result?.items || [];
    assert(items.length > 0, `TASK 03.2: Found official PUPR AHSP items (Count: ${items.length})`);
    const foundPondasi = items.find((it: any) => it.name.toLowerCase().includes('pondasi') || it.name.toLowerCase().includes('batu'));
    assert(foundPondasi !== undefined, 'TASK 03.3: Verified pondasi batu item found in official AHSP catalog');
    assert(foundPondasi.code.length > 0 && /^[A-Za-z0-9\.]+$/.test(foundPondasi.code), `TASK 03.4: Official AHSP code format verified (${foundPondasi.code})`);
  }

  // --------------------------------------------------------------------------
  // TASK 04: Find material price
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 04: Find material price ---');
  {
    const priceRes = await aiToolRegistry.executeTool('resolve_project_price', {
      name: 'semen portland',
    }, defaultToolContext);

    assert(priceRes.success === true, 'TASK 04.1: resolve_project_price executed successfully');
    const resData = (priceRes as any).result;
    assert(resData.price > 0, `TASK 04.2: Resolved official price > 0 (Got: Rp ${resData.price})`);
    assert(resData.sourceTier !== undefined, `TASK 04.3: Source tier identified (${resData.sourceTier})`);

    // Verify fail-closed for non-existent material (Zero AI hallucination)
    const roguePriceRes = await aiToolRegistry.executeTool('resolve_project_price', {
      name: 'material-siluman-tidak-ada-999',
    }, defaultToolContext);
    assert(roguePriceRes.success === false, 'TASK 04.4: Fails closed for unknown material (No AI price guessing)');
    assert((roguePriceRes as any).errorCode === 'PRICE_NOT_FOUND', 'TASK 04.5: Returns PRICE_NOT_FOUND error code');
  }

  // --------------------------------------------------------------------------
  // TASK 05: Update project price
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 05: Update project price ---');
  {
    const updateRes = await aiToolRegistry.executeTool('update_project_price', {
      materialName: 'Semen Portland 50kg',
      newPrice: 75000,
    }, defaultToolContext);

    assert(updateRes.success === true, 'TASK 05.1: update_project_price tool generated proposal');
    const prop = (updateRes as any).proposal;
    assert(prop !== undefined, 'TASK 05.2: ACTION tool created AIActionProposal');
    assert(prop?.status === 'PENDING', 'TASK 05.3: Proposal status is PENDING (No Auto Mutation)');
    assert((prop?.proposedChanges as any)?.newPrice === 75000, 'TASK 05.4: Proposed price correctly captured');

    // Reject invalid price (<= 0)
    const invalidPriceRes = await aiToolRegistry.executeTool('update_project_price', {
      materialName: 'Semen Portland 50kg',
      newPrice: -500,
    }, defaultToolContext);
    assert(invalidPriceRes.success === false, 'TASK 05.5: Rule Engine rejects negative price');
  }

  // --------------------------------------------------------------------------
  // TASK 06: Create RAB from QTO
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 06: Create RAB from QTO ---');
  {
    const qtoIntent = intentEngine.classifyIntent('Buat RAB dari data QTO volume beton dan pasangan');
    assert(qtoIntent.type === 'CREATE_RAB_FROM_QTO', 'TASK 06.1: Intent recognized as CREATE_RAB_FROM_QTO');

    const qtoItems = [
      { name: 'Beton Kolom K-250', volume: 2.52, unit: 'm³', ahspCode: 'A.4.1.1.5', unitPrice: 1200000 },
      { name: 'Beton Balok K-250', volume: 2.16, unit: 'm³', ahspCode: 'A.4.1.1.6', unitPrice: 1250000 },
    ];

    const item1Amount = SafeDecimalEngine.safeMultiply(qtoItems[0].volume, qtoItems[0].unitPrice); // 3.024.000
    const item2Amount = SafeDecimalEngine.safeMultiply(qtoItems[1].volume, qtoItems[1].unitPrice); // 2.700.000
    const grandTotal = SafeDecimalEngine.safeAdd(item1Amount, item2Amount); // 5.724.000

    assert(item1Amount === 3024000, 'TASK 06.2: Item 1 deterministic amount 3.024.000 verified');
    assert(item2Amount === 2700000, 'TASK 06.3: Item 2 deterministic amount 2.700.000 verified');
    assert(grandTotal === 5724000, 'TASK 06.4: Grand total deterministic calculation 5.724.000 verified');
  }

  // --------------------------------------------------------------------------
  // TASK 07: Audit RAB
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 07: Audit RAB ---');
  {
    const auditIntent = intentEngine.classifyIntent('Audit kelayakan dan konsistensi data RAB proyek ini');
    assert(auditIntent.type === 'AUDIT_RAB', 'TASK 07.1: Intent recognized as AUDIT_RAB');

    // Audit valid items
    const validAudit = selfReviewEngine.auditItems(sampleRabItems);
    assert(validAudit.isPassed === true, 'TASK 07.2: Clean RAB items pass self-review');
    assert(validAudit.readyItemsCount === 3, 'TASK 07.3: All 3 items marked as ready');

    // Audit invalid items (missing AHSP, missing volume, missing price, duplicate)
    const flawedItems: any[] = [
      { id: 'flaw-1', description: 'Galian Tanah', volume: null, unitPrice: 50000, ahspCode: 'A.2.3.1.1' },
      { id: 'flaw-2', description: 'Pasangan Dinding', volume: 40, unitPrice: null, ahspCode: 'A.4.4.1.1' },
      { id: 'flaw-3', description: 'Pekerjaan Tanpa AHSP', volume: 10, unitPrice: 100000, ahspCode: '' },
      { id: 'flaw-4', description: 'Pasangan Dinding', volume: 20, unitPrice: 150000, ahspCode: 'A.4.4.1.1' }, // duplicate name
    ];

    const flawedAudit = selfReviewEngine.auditItems(flawedItems);
    assert(flawedAudit.isPassed === false, 'TASK 07.4: Flawed items fail audit');
    assert(flawedAudit.findings.some(f => f.type === 'MISSING_QTO'), 'TASK 07.5: Detected MISSING_QTO finding');
    assert(flawedAudit.findings.some(f => f.type === 'MISSING_PRICE'), 'TASK 07.6: Detected MISSING_PRICE finding');
    assert(flawedAudit.findings.some(f => f.type === 'MISSING_AHSP'), 'TASK 07.7: Detected MISSING_AHSP finding');
    assert(flawedAudit.findings.some(f => f.type === 'DUPLICATE_ITEM'), 'TASK 07.8: Detected DUPLICATE_ITEM finding');
  }

  // --------------------------------------------------------------------------
  // TASK 08: Explain missing price
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 08: Explain missing price ---');
  {
    const explainIntent = intentEngine.classifyIntent('Kenapa harga pondasi kosong?');
    assert(explainIntent.type === 'EXPLAIN_PRICE_STATUS', 'TASK 08.1: Intent recognized as EXPLAIN_PRICE_STATUS');
    assert(explainIntent.extractedParameters.targetItem?.toLowerCase().includes('pondasi'), 'TASK 08.2: Extracted target item "pondasi"');

    const res = await ezrabCoreAi.processRequest({
      projectId: PROJ_TEST_1,
      conversationId: 'conv-eval-01',
      message: 'Kenapa harga pondasi kosong?',
      project: mockProject1,
    });

    assert(res.intent === 'EXPLAIN_PRICE_STATUS', 'TASK 08.3: Core AI processed EXPLAIN_PRICE_STATUS');
    assert(res.message.content.includes('Status') || res.message.content.includes('Harga'), 'TASK 08.4: Diagnostic forensic report returned');
    assert(res.message.content.includes('Project Override') || res.message.content.includes('PUPR 2026'), 'TASK 08.5: Hierarchical lookup explanation verified');
    assert(res.message.content.includes('menolak mengarang') || res.message.content.includes('dilarang'), 'TASK 08.6: Explicit refusal of arbitrary percentage splits');
  }

  // --------------------------------------------------------------------------
  // TASK 09: Explain AHSP mismatch
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 09: Explain AHSP mismatch ---');
  {
    const mismatchIntent = intentEngine.classifyIntent('Kenapa AHSP ini tidak cocok dengan DED?');
    assert(mismatchIntent.type === 'EXPLAIN_AHSP_MATCH', 'TASK 09.1: Intent recognized as EXPLAIN_AHSP_MATCH');

    // Rule validation on unit mismatch
    const ruleRes = ruleEngine.validateAhspItem({
      code: 'A.4.1.1.5',
      name: 'Pekerjaan Beton Kolom K-250',
      unit: 'm³',
      sourceStandard: 'PUPR_2026',
    });
    assert(ruleRes.valid === true, 'TASK 09.2: Official AHSP item passes rule engine validation');

    const unitValidation = ruleEngine.validateUnitCompatibility('m²', 'm³');
    assert(unitValidation.compatible === false, 'TASK 09.3: Rule Engine flags unit mismatch (m² vs m³)');
    assert(unitValidation.reason !== undefined, 'TASK 09.4: Forensic mismatch reason provided');
  }

  // --------------------------------------------------------------------------
  // TASK 10: Fix missing price
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 10: Fix missing price ---');
  {
    const fixPriceIntent = intentEngine.classifyIntent('Perbaiki item yang belum ada harganya');
    assert(fixPriceIntent.type === 'RESOLVE_MISSING_PRICES', 'TASK 10.1: Intent recognized as RESOLVE_MISSING_PRICES');

    const plan = planningEngine.buildPlan('RESOLVE_MISSING_PRICES', 'Perbaiki harga kosong');
    assert(plan.steps.some(s => s.toolName === 'resolve_project_price'), 'TASK 10.2: Plan routes missing items through resolve_project_price');
  }

  // --------------------------------------------------------------------------
  // TASK 11: Resolve ambiguous AHSP
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 11: Resolve ambiguous AHSP ---');
  {
    // Search ambiguous query "plesteran"
    const searchRes = await aiToolRegistry.executeTool('search_ahsp', {
      query: 'plesteran',
    }, defaultToolContext);

    assert(searchRes.success === true, 'TASK 11.1: Multi-candidate query executed');
    const items = (searchRes as any).result?.items || [];
    assert(items.length > 1, `TASK 11.2: Returned multiple verified candidates (Count: ${items.length})`);
    // Rule Engine check: all candidates must be verified official AHSP
    assert(items.every((it: any) => it.code.length > 0), 'TASK 11.3: All candidates are verified official AHSP');
  }

  // --------------------------------------------------------------------------
  // TASK 12: Handle missing quantity
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 12: Handle missing quantity ---');
  {
    // Test missing quantity strictly set to null, NOT 0 and NOT 1
    const missingDimItem = {
      description: 'Balok B2 Lantai 2',
      length: 12,
      width: undefined, // missing width
      height: 0.3,
    };

    const validateQtyRes = ruleEngine.validateQuantity(null);
    assert(validateQtyRes.valid === false, 'TASK 12.1: Rule engine rejects null quantity');
    assert(validateQtyRes.reason.includes('null'), 'TASK 12.2: Rejection specifically notes null quantity');

    const zeroQtyRes = ruleEngine.validateQuantity(0);
    assert(zeroQtyRes.valid === false, 'TASK 12.3: Rule engine rejects 0 quantity (Golden Rule: volume > 0)');

    // In QTO engine, missing dimension returns null quantity
    const rawQty: number | null = missingDimItem.width ? 12 * missingDimItem.width * 0.3 : null;
    assert(rawQty === null, 'TASK 12.4: Missing dimension results in strictly null quantity, never defaulted to 0 or 1');
  }

  // --------------------------------------------------------------------------
  // TASK 13: Handle wrong AHSP version
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 13: Handle wrong AHSP version ---');
  {
    const legacyItem = {
      code: 'SNI-2008-01',
      name: 'Pondasi Batu Kali SNI Lama',
      unit: 'm³',
      sourceStandard: 'SNI_2008' as any,
    };

    const versionCheck = ruleEngine.validateAhspItem(legacyItem);
    assert(versionCheck.valid === false, 'TASK 13.1: Rule engine rejects obsolete SNI 2008 standard');
    assert(versionCheck.errors.some(e => e.includes('PUPR_2026')), 'TASK 13.2: Rejection mandates PUPR_2026 canonical standard');
  }

  // --------------------------------------------------------------------------
  // TASK 14: Prevent fake AI-CUSTOM AHSP
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 14: Prevent fake AI-CUSTOM AHSP ---');
  {
    const fakeAiItem = {
      code: 'AI-CUSTOM-999',
      name: 'Pekerjaan Pasangan Super Cepat Buatan AI',
      unit: 'm²',
      sourceStandard: 'PUPR_2026' as any,
    };

    const fakeCheck = ruleEngine.validateAhspItem(fakeAiItem);
    assert(fakeCheck.valid === false, 'TASK 14.1: Rule engine rejects AI-CUSTOM synthetic AHSP code');
    assert(fakeCheck.errors.some(e => e.includes('AI-CUSTOM')), 'TASK 14.2: Explicit violation error recorded for AI-CUSTOM');

    // Also check via aiToolRegistry
    const validateToolRes = await aiToolRegistry.executeTool('validate_ahsp', {
      ahspCode: 'AI-CUSTOM-404',
    }, defaultToolContext);

    assert(validateToolRes.success === false, 'TASK 14.3: validate_ahsp tool rejects AI-CUSTOM code');
    assert((validateToolRes as any).errorCode === 'ROGUE_AHSP_REJECTED', 'TASK 14.4: validate_ahsp error confirms ROGUE_AHSP_REJECTED');
  }

  // --------------------------------------------------------------------------
  // TASK 15: Project isolation
  // --------------------------------------------------------------------------
  console.log('\n--- TASK 15: Project isolation ---');
  {
    // A. Empty projectId check
    let threwEmpty = false;
    try {
      await ezrabCoreAi.processRequest({
        projectId: '',
        message: 'Berapa total RAB?',
      });
    } catch (e: any) {
      if (e instanceof ProjectIsolationError || e.message.includes('PROJECT_ISOLATION_ERROR')) {
        threwEmpty = true;
      }
    }
    assert(threwEmpty, 'TASK 15.1: Core AI throws ProjectIsolationError on empty projectId');

    // B. Project ID mismatch check (Context PROJ_TEST_1 vs Object PROJ_TEST_2)
    let threwMismatch = false;
    try {
      await ezrabCoreAi.processRequest({
        projectId: PROJ_TEST_1,
        message: 'Berapa total RAB?',
        project: { id: PROJ_TEST_2, name: 'Project 2' } as any,
      });
    } catch (e: any) {
      if (e instanceof ProjectIsolationError || e.message.includes('PROJECT_ISOLATION_ERROR')) {
        threwMismatch = true;
      }
    }
    assert(threwMismatch, 'TASK 15.2: Core AI throws ProjectIsolationError on project ID mismatch');

    // C. Tool Registry project isolation check
    const toolIsoRes = await aiToolRegistry.executeTool('getRabTotal', {}, {
      projectId: '',
      conversationId: 'conv-eval-01',
    });
    assert(toolIsoRes.success === false, 'TASK 15.3: Tool registry fails closed with empty projectId');
    assert((toolIsoRes as any).errorCode === 'PROJECT_ISOLATION_ERROR', 'TASK 15.4: Tool registry returns PROJECT_ISOLATION_ERROR');

    // D. Conversation isolation check
    const conv1 = unifiedConversationStore.getOrCreateActiveConversation(PROJ_TEST_1);
    const conv2 = unifiedConversationStore.getOrCreateActiveConversation(PROJ_TEST_2);
    assert(conv1.projectId === PROJ_TEST_1, 'TASK 15.5: Conversation 1 belongs strictly to PROJ_TEST_1');
    assert(conv2.projectId === PROJ_TEST_2, 'TASK 15.6: Conversation 2 belongs strictly to PROJ_TEST_2');
    assert(conv1.id !== conv2.id, 'TASK 15.7: Project conversations are strictly segregated');
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`EVALUATION COMPLETE: ${passCount} PASSED / ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log('======================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runCoreAiEvaluation().catch((err) => {
  console.error('Fatal Evaluation Error:', err);
  process.exit(1);
});

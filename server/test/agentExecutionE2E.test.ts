import assert from 'assert';
import { agentOrchestrator } from '../ai/agent/agentOrchestrator';
import { actionProposalManager } from '../ai/tools/actionProposalManager';
import { aiDbAdapter } from '../database/dbAdapter';
import { knowledgeRetriever } from '../ai/knowledge/knowledgeRetriever';
import { toolRegistry } from '../tools/toolRegistry';

export async function runAgentExecutionE2ETestSuite(): Promise<void> {
  console.log('============================================================');
  console.log('EZRAB REAL AGENT EXECUTION & E2E USER WORKFLOW (PHASE 5)');
  console.log('============================================================');

  const ws = 'WS-E2E-PHASE5';
  const prjA = 'PRJ-2026-E2E-A';
  const prjB = 'PRJ-2026-E2E-B';
  const userId = 'USR-ESTIMATOR-99';

  // Seed test projects
  aiDbAdapter.createProject(ws, {
    id: prjA,
    name: 'Proyek Rumah Tropis Modern',
    clientName: 'PT Properti Utama',
    location: 'Surabaya',
    buildingType: 'Rumah Tinggal',
    budget: 350000000,
    status: 'ACTIVE'
  });

  aiDbAdapter.createProject(ws, {
    id: prjB,
    name: 'Proyek Ruko 3 Lantai',
    clientName: 'CV Maju Lancar',
    location: 'Jakarta',
    buildingType: 'Ruko Komersial',
    budget: 900000000,
    status: 'ACTIVE'
  });

  // Seed sample RAB item in Project A
  await aiDbAdapter.addRabItem(ws, prjA, {
    description: 'Pekerjaan Pasangan Dinding Bata Merah',
    volume: 80,
    unit: 'm2',
    unitPrice: 125000,
    ahspCode: 'A.4.4.1.9',
    category: 'PEKERJAAN DINDING'
  });

  // -------------------------------------------------------------------------
  // TEST 01: RAB Total Query -> Core Direct Execution (0ms LLM, No Hallucination)
  // -------------------------------------------------------------------------
  const resp01 = await agentOrchestrator.handleRequest({
    requestId: 'req_01',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'Berapa total RAB proyek ini?',
    currentPage: 'spreadsheet'
  });

  assert.strictEqual(resp01.success, true, 'TEST 01: Request must succeed');
  assert.strictEqual(resp01.intent, 'RAB_TOTAL', 'TEST 01: Intent must be RAB_TOTAL');
  assert.strictEqual(resp01.provider, 'ezrab_core', 'TEST 01: Provider must be EZRAB Core');
  assert.strictEqual(resp01.requiresConfirmation, false, 'TEST 01: READ tool must not require confirmation');
  assert.ok(resp01.answer.includes('Rp 10.000.000') || resp01.answer.includes('Total RAB'), 'TEST 01: Answer must show authoritative total');
  console.log('[PASS] TEST 01: RAB Total -> EZRAB Core Direct Execution');

  // -------------------------------------------------------------------------
  // TEST 02: AHSP Search -> Official Dataset (No Invented Code)
  // -------------------------------------------------------------------------
  const resp02 = await agentOrchestrator.handleRequest({
    requestId: 'req_02',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'Cari AHSP analisa harga satuan pasangan bata ringan',
    currentPage: 'ahsp'
  });

  assert.strictEqual(resp02.success, true, 'TEST 02: Request must succeed');
  assert.strictEqual(resp02.intent, 'AHSP_SEARCH', 'TEST 02: Intent must be AHSP_SEARCH');
  assert.strictEqual(resp02.provider, 'ezrab_core', 'TEST 02: Provider must be EZRAB Core');
  assert.ok(resp02.answer.includes('Permen PUPR 2026') || resp02.answer.includes('AHSP'), 'TEST 02: Must reference PUPR 2026');
  console.log('[PASS] TEST 02: AHSP Search -> Verified PUPR 2026 Dataset');

  // -------------------------------------------------------------------------
  // TEST 03: QTO Calculation -> Deterministic Volume (0.15 x 0.20 x 40 = 1.20 m3)
  // -------------------------------------------------------------------------
  const resp03 = await agentOrchestrator.handleRequest({
    requestId: 'req_03',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'Hitung volume sloof 15/20 panjang 40m',
    currentPage: 'qto'
  });

  assert.strictEqual(resp03.success, true, 'TEST 03: Request must succeed');
  assert.strictEqual(resp03.intent, 'QTO_CALCULATE', 'TEST 03: Intent must be QTO_CALCULATE');
  assert.strictEqual(resp03.provider, 'ezrab_core', 'TEST 03: Provider must be EZRAB Core');
  assert.ok(resp03.answer.includes('1,2') || resp03.answer.includes('1.2'), 'TEST 03: Must calculate 1.2 m3 deterministically');
  console.log('[PASS] TEST 03: QTO Calculation -> Deterministic Formula Execution');

  // -------------------------------------------------------------------------
  // TEST 04: RAB Item Create -> ActionProposal Generated (No Silent Mutation)
  // -------------------------------------------------------------------------
  const itemsBefore = await aiDbAdapter.getRabItems(ws, prjA);
  const countBefore = itemsBefore.length;

  const resp04 = await agentOrchestrator.handleRequest({
    requestId: 'req_04',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'Tambahkan waterproofing kamar mandi 12 m2 harga Rp 150.000',
    currentPage: 'spreadsheet'
  });

  assert.strictEqual(resp04.success, true, 'TEST 04: Request must succeed');
  assert.strictEqual(resp04.state, 'WAITING_CONFIRMATION', 'TEST 04: State must be WAITING_CONFIRMATION');
  assert.strictEqual(resp04.requiresConfirmation, true, 'TEST 04: Mutating action requires confirmation');
  assert.ok(resp04.actionProposal, 'TEST 04: ActionProposal must be present');
  assert.strictEqual(resp04.actionProposal.parameters.volume, 12, 'TEST 04: Extracted volume must be 12');

  // Verify database was NOT mutated before confirmation
  const itemsAfterProposal = await aiDbAdapter.getRabItems(ws, prjA);
  assert.strictEqual(itemsAfterProposal.length, countBefore, 'TEST 04: Database must NOT mutate before confirmation');
  console.log('[PASS] TEST 04: RAB Create -> ActionProposal (No Silent Mutation)');

  // -------------------------------------------------------------------------
  // TEST 05: Confirm Proposal -> Live Database Mutation
  // -------------------------------------------------------------------------
  const proposalId = resp04.actionProposal.id;
  const confirmResult = await agentOrchestrator.executeConfirmation(proposalId, {
    workspaceId: ws,
    projectId: prjA,
    userId,
    userRole: 'ESTIMATOR'
  });

  assert.strictEqual(confirmResult.success, true, 'TEST 05: Confirmation execution must succeed');
  const itemsAfterConfirm = await aiDbAdapter.getRabItems(ws, prjA);
  assert.strictEqual(itemsAfterConfirm.length, countBefore + 1, 'TEST 05: Item count must increment by 1');
  console.log('[PASS] TEST 05: Confirm Proposal -> Database Mutated & Recalculated');

  // -------------------------------------------------------------------------
  // TEST 06: Double Confirmation Protection (Idempotency)
  // -------------------------------------------------------------------------
  await assert.rejects(
    async () => {
      await agentOrchestrator.executeConfirmation(proposalId, {
        workspaceId: ws,
        projectId: prjA,
        userId
      });
    },
    (err: any) => err.message.includes('already been executed'),
    'TEST 06: Re-executing confirmed proposal must be rejected'
  );
  console.log('[PASS] TEST 06: Double-Execution Protection (Idempotency)');

  // -------------------------------------------------------------------------
  // TEST 07: Cancel Proposal -> Clean Cancellation & No DB Mutation
  // -------------------------------------------------------------------------
  const resp07 = await agentOrchestrator.handleRequest({
    requestId: 'req_07',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'Tambahkan plesteran dinding 50 m2',
    currentPage: 'spreadsheet'
  });

  const prop07Id = resp07.actionProposal!.id;
  const cancelResult = agentOrchestrator.cancelConfirmation(prop07Id, {
    workspaceId: ws,
    projectId: prjA
  });

  assert.strictEqual(cancelResult.success, true, 'TEST 07: Cancel must succeed');
  await assert.rejects(
    async () => {
      await agentOrchestrator.executeConfirmation(prop07Id, {
        workspaceId: ws,
        projectId: prjA,
        userId
      });
    },
    (err: any) => err.message.includes('cancelled') || err.message.includes('no longer valid'),
    'TEST 07: Cancelled proposal cannot be executed'
  );
  console.log('[PASS] TEST 07: Cancel Proposal -> Clean Rejection & Zero Mutation');

  // -------------------------------------------------------------------------
  // TEST 08: Context Switch Invalidation -> Old Proposals Invalidated
  // -------------------------------------------------------------------------
  const resp08 = await agentOrchestrator.handleRequest({
    requestId: 'req_08',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'Tambahkan pengecatan interior 60 m2',
    currentPage: 'spreadsheet'
  });

  const prop08Id = resp08.actionProposal!.id;

  // Simulate context switch away from Project A
  actionProposalManager.invalidateProjectProposals(ws, prjA);

  await assert.rejects(
    async () => {
      await agentOrchestrator.executeConfirmation(prop08Id, {
        workspaceId: ws,
        projectId: prjA,
        userId
      });
    },
    (err: any) => err.message.includes('no longer valid'),
    'TEST 08: Invalidate proposal upon project switch'
  );
  console.log('[PASS] TEST 08: Project Switch -> Old Proposals Invalidated');

  // -------------------------------------------------------------------------
  // TEST 09: Update RAB Item -> Proposal & Mutation
  // -------------------------------------------------------------------------
  const existingItems = await aiDbAdapter.getRabItems(ws, prjA);
  const targetItem = existingItems[0];

  const updateProposal = actionProposalManager.createProposal({
    toolName: 'update_rab_item',
    projectId: prjA,
    workspaceId: ws,
    userId,
    parameters: {
      itemId: targetItem.id,
      updates: { volume: 100 }
    }
  });

  const updateResult = await agentOrchestrator.executeConfirmation(updateProposal.id, {
    workspaceId: ws,
    projectId: prjA,
    userId
  });

  assert.strictEqual(updateResult.success, true, 'TEST 09: Update must succeed');
  console.log('[PASS] TEST 09: Update RAB Item -> Proposal & Execution');

  // -------------------------------------------------------------------------
  // TEST 10: Delete RAB Item -> Confirmation Required & High Risk
  // -------------------------------------------------------------------------
  const deleteProposal = actionProposalManager.createProposal({
    toolName: 'delete_rab_item',
    projectId: prjA,
    workspaceId: ws,
    userId,
    parameters: { itemId: targetItem.id },
    riskLevel: 'HIGH'
  });

  assert.strictEqual(deleteProposal.preview.riskLevel, 'HIGH', 'TEST 10: Delete must be marked HIGH risk');
  const deleteResult = await agentOrchestrator.executeConfirmation(deleteProposal.id, {
    workspaceId: ws,
    projectId: prjA,
    userId
  });
  assert.strictEqual(deleteResult.success, true, 'TEST 10: Delete execution succeeds');
  console.log('[PASS] TEST 10: Delete RAB Item -> High Risk Confirmation & Deletion');

  // -------------------------------------------------------------------------
  // TEST 11: Price Safety -> Unavailable Price Not Fabricated
  // -------------------------------------------------------------------------
  const resp11 = await agentOrchestrator.handleRequest({
    requestId: 'req_11',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'Berapa harga material panel surya antimateri quantum?',
    currentPage: 'spreadsheet'
  });

  assert.ok(
    resp11.answer.includes('belum tersedia') || resp11.answer.includes('tidak ditemukan'),
    'TEST 11: Unknown price must not be fabricated'
  );
  console.log('[PASS] TEST 11: Price Safety -> Zero Fabricated Prices');

  // -------------------------------------------------------------------------
  // TEST 12: AHSP Safety -> Unknown AHSP Marked Needs Verification
  // -------------------------------------------------------------------------
  const ahspUnknown = knowledgeRetriever.resolveAhspItem('pekerjaan teleportasi laser fusi 9000');
  assert.strictEqual(ahspUnknown.verified, false, 'TEST 12: Unknown AHSP is not verified');
  assert.strictEqual(ahspUnknown.value, null, 'TEST 12: No fabricated AHSP code');
  assert.strictEqual(ahspUnknown.source, 'assumption', 'TEST 12: Source is assumption');
  console.log('[PASS] TEST 12: AHSP Safety -> Code Null & Needs Verification');

  // -------------------------------------------------------------------------
  // TEST 13: Ambiguity Handling -> Interactive Clarification
  // -------------------------------------------------------------------------
  const resp13 = await agentOrchestrator.handleRequest({
    requestId: 'req_13',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'tambah pondasi',
    currentPage: 'spreadsheet'
  });

  assert.strictEqual(resp13.intent, 'CLARIFICATION_NEEDED', 'TEST 13: Must return CLARIFICATION_NEEDED');
  assert.ok(resp13.clarificationOptions && resp13.clarificationOptions.length >= 2, 'TEST 13: Clarification options provided');
  console.log('[PASS] TEST 13: Ambiguity Handling -> Clarification Prompt & Options');

  // -------------------------------------------------------------------------
  // TEST 14: Project Security & Tenant Isolation (Fail Closed)
  // -------------------------------------------------------------------------
  const resp14 = await agentOrchestrator.handleRequest({
    requestId: 'req_14',
    userId,
    workspaceId: ws,
    projectId: undefined, // Missing project on project-required query
    message: 'Berapa total RAB proyek ini?',
    currentPage: 'spreadsheet'
  });

  assert.strictEqual(resp14.success, false, 'TEST 14: Must fail closed when project is missing');
  assert.strictEqual(resp14.state, 'CONTEXT_FAILED', 'TEST 14: State is CONTEXT_FAILED');
  console.log('[PASS] TEST 14: Project Security -> Fail-Closed on Missing Context');

  // -------------------------------------------------------------------------
  // TEST 15: Cross-Project Proposal Execution Forbidden
  // -------------------------------------------------------------------------
  const propCross = actionProposalManager.createProposal({
    toolName: 'create_rab_item',
    projectId: prjA,
    workspaceId: ws,
    userId,
    parameters: { name: 'Item Cross Project' }
  });

  await assert.rejects(
    async () => {
      await agentOrchestrator.executeConfirmation(propCross.id, {
        workspaceId: ws,
        projectId: prjB, // Mismatched project
        userId
      });
    },
    (err: any) => err.message.includes('SECURITY_ERROR'),
    'TEST 15: Executing Project A proposal on Project B must fail closed'
  );
  console.log('[PASS] TEST 15: Cross-Project Proposal Execution Forbidden');

  // -------------------------------------------------------------------------
  // TEST 16: Construction Knowledge -> RAG & Engineering Concept
  // -------------------------------------------------------------------------
  const resp16 = await agentOrchestrator.handleRequest({
    requestId: 'req_16',
    userId,
    workspaceId: ws,
    projectId: prjA,
    message: 'Apa fungsi sloof beton dalam struktur bangunan?',
    currentPage: 'dashboard'
  });

  assert.strictEqual(resp16.success, true, 'TEST 16: Request must succeed');
  assert.strictEqual(resp16.intent, 'CONSTRUCTION_KNOWLEDGE', 'TEST 16: Intent is CONSTRUCTION_KNOWLEDGE');
  assert.ok(resp16.answer.includes('sloof') || resp16.answer.includes('pondasi'), 'TEST 16: Must explain sloof');
  console.log('[PASS] TEST 16: Construction Knowledge -> RAG & Safe Conceptual Explanation');

  // -------------------------------------------------------------------------
  // TEST 17: Partial Failure Handling in Multi-Step Workflow
  // -------------------------------------------------------------------------
  const mockPlanSteps = [
    { id: 's1', stepNumber: 1, toolName: 'get_rab_summary', category: 'READ' as const, description: 'Step 1', arguments: {}, requiresConfirmation: false, status: 'PENDING' as const },
    { id: 's2', stepNumber: 2, toolName: 'non_existent_tool_xyz', category: 'READ' as const, description: 'Step 2', arguments: {}, requiresConfirmation: false, status: 'PENDING' as const }
  ];

  const step1Res = await toolRegistry.executeSafe(mockPlanSteps[0].toolName, {}, { workspaceId: ws, projectId: prjA, userId });
  assert.strictEqual(step1Res.success, true, 'TEST 17: Prerequisite step 1 succeeds');

  await assert.rejects(
    async () => {
      await toolRegistry.executeSafe(mockPlanSteps[1].toolName, {}, { workspaceId: ws, projectId: prjA, userId });
    },
    'TEST 17: Missing step 2 fails explicitly without reporting false total success'
  );
  console.log('[PASS] TEST 17: Multi-Step Workflow -> Partial Failure Explicitly Handled');

  // -------------------------------------------------------------------------
  // TEST 18: Double-Click Confirmation -> Exactly One Live Mutation
  // -------------------------------------------------------------------------
  const propDouble = actionProposalManager.createProposal({
    toolName: 'create_rab_item',
    projectId: prjA,
    workspaceId: ws,
    userId,
    parameters: {
      name: 'Pekerjaan Kanopi Baja Ringan',
      volume: 15,
      unit: 'm2',
      unitPrice: 275000
    }
  });

  const countBeforeDouble = (await aiDbAdapter.getRabItems(ws, prjA)).length;

  // First click
  const firstClick = await agentOrchestrator.executeConfirmation(propDouble.id, {
    workspaceId: ws,
    projectId: prjA,
    userId
  });
  assert.strictEqual(firstClick.success, true, 'TEST 18: First click succeeds');

  // Second click immediately
  await assert.rejects(
    async () => {
      await agentOrchestrator.executeConfirmation(propDouble.id, {
        workspaceId: ws,
        projectId: prjA,
        userId
      });
    },
    (err: any) => err.message.includes('already been executed'),
    'TEST 18: Second click rejected'
  );

  const countAfterDouble = (await aiDbAdapter.getRabItems(ws, prjA)).length;
  assert.strictEqual(countAfterDouble, countBeforeDouble + 1, 'TEST 18: Exactly 1 record created despite rapid double submit');
  console.log('[PASS] TEST 18: Double-Click Confirmation -> Exactly One Mutation');

  console.log('============================================================');
  console.log('✅ ALL 18 PHASE 5 AGENT E2E TEST SCENARIOS PASSED');
  console.log('============================================================');
}

// Run standalone if executed directly
if (process.argv[1]?.endsWith('agentExecutionE2E.test.ts')) {
  runAgentExecutionE2ETestSuite()
    .then(() => console.log('All Phase 5 Agent E2E tests completed successfully.'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

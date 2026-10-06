/**
 * ============================================================================
 * EZRAB PHASE C — PROJECT COPILOT ORCHESTRATION & STATE TEST SUITE
 * ============================================================================
 * 
 * Verifies:
 * 1. Unified Conversation Store & Multi-Turn State (F-02 Resolution)
 * 2. Fail-Closed Project Isolation (Project A != Project B)
 * 3. 3-Tier Tool Permission Matrix (INFORMATION, SUGGESTION, ACTION)
 * 4. Deterministic Core Engines Execution (RAB, Calc, Price, AHSP, Finance, Docs)
 * 5. Action Proposal, Approval Gate, Idempotency & Audit Trail
 * 6. Regex Collision Resolution ("pekerja" vs "pekerjaan")
 * 7. Failure Transparency (No Fake AI Fallback)
 */

import { unifiedConversationStore } from '../services/ai/conversation/unifiedConversationStore';
import { aiToolRegistry } from '../services/ai/tools/aiToolRegistry';
import { aiActionExecutor } from '../services/ai/actions/aiActionExecutor';
import { aiActionAuditEngine } from '../services/ai/actions/aiActionAudit';
import { ezrabProjectCopilot } from '../services/ai/orchestration/aiOrchestrator';
import { ProjectIsolationError, createActionProposal } from '../services/unifiedProjectContext';
import { defaultAiProvider } from '../services/aiProviderEngine';
import { buildFullAIContext } from '../services/aiContextService';
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

async function runPhaseCTests() {
  console.log('\n================================================================');
  console.log('🤖 EZRAB PHASE C — PROJECT COPILOT ORCHESTRATION & STATE TESTS');
  console.log('================================================================\n');

  const PROJ_A = 'proj-alpha-101';
  const PROJ_B = 'proj-beta-202';

  const mockProjectA: Project = {
    id: PROJ_A,
    name: 'Gedung Kantor Alpha',
    location: 'Jakarta',
    contractValue: 5000000000,
    status: 'in_progress',
    progress: 35,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  } as any;

  const mockRabItemsA: RabItem[] = [
    {
      id: 'rab-1',
      no: 1,
      code: '01.01',
      description: 'Pembersihan Lapangan',
      volume: 500,
      unit: 'm²',
      unitPrice: 15000,
      amount: 7500000,
      category: 'Pekerjaan Persiapan',
      projectId: PROJ_A,
    },
    {
      id: 'rab-2',
      no: 2,
      code: '02.01',
      description: 'Beton Kolom K-300',
      volume: 40,
      unit: 'm³',
      unitPrice: 1200000,
      amount: 48000000,
      category: 'Pekerjaan Struktur',
      projectId: PROJ_A,
    },
    {
      id: 'rab-3',
      no: 3,
      code: '02.02',
      description: 'Baja Tulangan Ulir D16',
      volume: 3500,
      unit: 'kg',
      unitPrice: 16500,
      amount: 57750000,
      category: 'Pekerjaan Struktur',
      projectId: PROJ_A,
    },
  ];

  // ===========================================================================
  // [1] CONVERSATION STORE & F-02 RESOLUTION (TWO SURFACES, ONE SOURCE OF TRUTH)
  // ===========================================================================
  console.log('--- [1] Unified Conversation Store & F-02 Multi-Surface Sync ---');

  // 1.1 Create conversation for Project A
  const convA = unifiedConversationStore.createConversation(PROJ_A, 'Audit Alpha');
  assert(convA.id.includes(PROJ_A), 'Conversation ID contains authoritative projectId');
  assert(convA.projectId === PROJ_A, 'Conversation belongs strictly to Project A');

  // 1.2 Surface 1 (Floating Chat) appends message
  const msg1 = unifiedConversationStore.appendMessage(convA.id, PROJ_A, {
    role: 'user',
    content: 'Berapa total RAB proyek ini?',
  });
  assert(msg1.content === 'Berapa total RAB proyek ini?', 'Floating Chat successfully appended user message');

  // 1.3 Surface 2 (Magic AI SuperView) reads the exact same conversation
  const superViewConv = unifiedConversationStore.getConversation(convA.id, PROJ_A);
  assert(superViewConv !== null, 'SuperView successfully retrieved conversation from shared store');
  assert(superViewConv?.messages.length === 1, 'SuperView sees the exact message count from Floating Chat');
  assert(superViewConv?.messages[0].id === msg1.id, 'SuperView message ID matches Floating Chat message ID');

  // 1.4 Surface 2 (SuperView) appends response
  const msg2 = unifiedConversationStore.appendMessage(convA.id, PROJ_A, {
    role: 'assistant',
    content: 'Total RAB proyek Alpha adalah Rp 113.250.000',
  });

  // 1.5 Surface 1 (Floating Chat) reads updated conversation
  const floatingConvUpdated = unifiedConversationStore.getConversation(convA.id, PROJ_A);
  assert(floatingConvUpdated?.messages.length === 2, 'Floating Chat instantly sees assistant response added by SuperView');
  assert(floatingConvUpdated?.messages[1].content === msg2.content, 'Both surfaces share identical message history (F-02 Resolved)');

  // 1.6 Event bus reactive subscription test
  let eventCaptured: boolean = false;
  const unsubscribe = unifiedConversationStore.subscribe((event) => {
    if (event.type === 'MESSAGE_CREATED' && event.conversationId === convA.id) {
      eventCaptured = true;
    }
  });

  unifiedConversationStore.appendMessage(convA.id, PROJ_A, {
    role: 'user',
    content: 'Tes sinkronisasi reaktif event bus',
  });
  assert(Boolean(eventCaptured), 'Store dispatches reactive event on message creation');
  unsubscribe();

  // ===========================================================================
  // [2] FAIL-CLOSED PROJECT ISOLATION (CROSS-PROJECT DEFENSE)
  // ===========================================================================
  console.log('\n--- [2] Fail-Closed Project Isolation ---');

  // 2.1 Rejects empty or missing projectId
  let emptyProjectCaught = false;
  try {
    unifiedConversationStore.createConversation('', 'Invalid');
  } catch (err: any) {
    emptyProjectCaught = err instanceof ProjectIsolationError;
  }
  assert(emptyProjectCaught, 'Fails closed when creating conversation with empty projectId');

  // 2.2 Accessing Project A conversation with Project B context throws ProjectIsolationError
  let crossAccessCaught = false;
  try {
    unifiedConversationStore.getConversation(convA.id, PROJ_B);
  } catch (err: any) {
    crossAccessCaught = err instanceof ProjectIsolationError;
  }
  assert(crossAccessCaught, 'Throws ProjectIsolationError when Project B tries to access Project A conversation');

  // 2.3 Listing conversations for Project B never returns Project A conversations
  const listB = unifiedConversationStore.listConversations(PROJ_B);
  assert(listB.length === 0, 'Project B conversation list is strictly isolated and returns 0 items');

  const listA = unifiedConversationStore.listConversations(PROJ_A);
  assert(listA.length >= 1, 'Project A conversation list contains only Project A conversations');
  assert(listA.every((c) => c.projectId === PROJ_A), 'Every conversation in Project A list has projectId === PROJ_A');

  // ===========================================================================
  // [3] TOOL REGISTRY & 3-TIER PERMISSION MATRIX
  // ===========================================================================
  console.log('\n--- [3] Centralized AI Tool Registry & Permission Matrix ---');

  const tools = aiToolRegistry.listTools();
  assert(tools.length >= 7, `Tool Registry has at least 7 core tools registered (Found: ${tools.length})`);

  const infoTool = aiToolRegistry.getTool('getRabTotal');
  assert(infoTool !== undefined, 'Tool "getRabTotal" exists');
  assert(infoTool?.mode === 'information', 'Mode is INFORMATION');
  assert(infoTool?.mutation === false, 'INFORMATION tool declares mutation: false');
  assert(infoTool?.requiresApproval === false, 'INFORMATION tool declares requiresApproval: false');

  const actionTool = aiToolRegistry.getTool('proposeAddRabItem');
  assert(actionTool !== undefined, 'Tool "proposeAddRabItem" exists');
  assert(actionTool?.mode === 'action', 'Mode is ACTION');
  assert(actionTool?.mutation === true, 'ACTION tool declares mutation: true');
  assert(actionTool?.requiresApproval === true, 'ACTION tool declares requiresApproval: true');

  // 3.1 Security validation: Rogue tool registration rejected
  let rogueCaught = false;
  try {
    aiToolRegistry.registerTool({
      name: 'rogueInformationMutationTool',
      description: 'Attempts to mutate under information mode',
      category: 'rab',
      mode: 'information',
      requiresApproval: false,
      mutation: true, // ILLEGAL
      execute: async () => ({ success: true, result: {}, provenance: { source: '', sourceType: '', timestamp: '' } }),
    });
  } catch {
    rogueCaught = true;
  }
  assert(rogueCaught, 'Registry rejects rogue INFORMATION tool that attempts to declare mutation: true');

  // ===========================================================================
  // [4] CORE DETERMINISTIC ENGINES EXECUTION VIA TOOLS
  // ===========================================================================
  console.log('\n--- [4] Deterministic Tools Execution (No Guessing / Real Engines) ---');

  const execContext = {
    projectId: PROJ_A,
    conversationId: convA.id,
    project: mockProjectA,
    rabItems: mockRabItemsA,
  };

  // 4.1 getRabTotal execution
  const rabTotalRes = await aiToolRegistry.executeTool('getRabTotal', {}, execContext);
  assert(rabTotalRes.success === true, 'getRabTotal executed successfully');
  if (rabTotalRes.success) {
    const res = rabTotalRes.result as any;
    assert(res.totalRab === 113250000, `Exact total RAB is 113.250.000 (Got: ${res.totalRab})`);
    assert(res.itemCount === 3, 'Exact item count is 3');
  }

  // 4.2 getRabGroup execution (Filtering category)
  const rabGroupRes = await aiToolRegistry.executeTool('getRabGroup', { categoryName: 'struktur' }, execContext);
  assert(rabGroupRes.success === true, 'getRabGroup executed successfully');
  if (rabGroupRes.success) {
    const res = rabGroupRes.result as any;
    assert(res.itemCount === 2, `Found exactly 2 structure items (Got: ${res.itemCount})`);
    assert(res.subtotal === 105750000, `Structure subtotal is 105.750.000 (Got: ${res.subtotal})`);
  }

  // 4.3 calculateQuantity schema validation & arithmetic
  const invalidCalcRes = await aiToolRegistry.executeTool('calculateQuantity', { length: 'not-a-number' }, execContext);
  assert(invalidCalcRes.success === false, 'calculateQuantity rejects non-numeric input without NaN propagation');

  const validCalcRes = await aiToolRegistry.executeTool('calculateQuantity', { length: 10, width: 8, height: 0.15 }, execContext);
  assert(validCalcRes.success === true, 'calculateQuantity executed successfully with numeric inputs');
  if (validCalcRes.success) {
    const res = validCalcRes.result as any;
    assert(res.quantity === 12, `10 x 8 x 0.15 = 12.00 m³ (Got: ${res.quantity})`);
    assert(res.unit === 'm³', 'Unit resolved to m³');
  }

  // 4.4 resolvePrice via 5-Tier Authoritative Hierarchy
  const priceRes = await aiToolRegistry.executeTool('resolvePrice', { code: 'M-001', name: 'Semen Portland' }, execContext);
  assert(priceRes.success === true, 'resolvePrice resolves valid material price');
  if (priceRes.success) {
    const res = priceRes.result as any;
    assert(res.price > 0, `Resolved price is greater than 0 (Got: Rp ${res.price})`);
  }

  const missingPriceRes = await aiToolRegistry.executeTool('resolvePrice', { code: 'NONEXISTENT-999', name: 'Barang Aneh' }, execContext);
  assert(missingPriceRes.success === false, 'resolvePrice fails closed for non-existent material (No Hallucinated Price)');
  if (!missingPriceRes.success) {
    assert(missingPriceRes.errorCode === 'PRICE_NOT_FOUND', 'Returns structured error PRICE_NOT_FOUND');
  }

  // 4.5 searchAHSP via National PUPR Database
  const ahspRes = await aiToolRegistry.executeTool('searchAHSP', { query: 'beton' }, execContext);
  assert(ahspRes.success === true, 'searchAHSP finds official PUPR items for "beton"');
  if (ahspRes.success) {
    const res = ahspRes.result as any;
    assert(res.items.length > 0, `Found ${res.items.length} official AHSP items`);
  }

  // ===========================================================================
  // [5] ACTION PROPOSAL, USER APPROVAL & IDEMPOTENCY
  // ===========================================================================
  console.log('\n--- [5] Action Proposal, Approval Gate, Idempotency & Audit ---');

  let itemCreatedInRab: any = null;
  const directAddCallback = (item: any) => {
    itemCreatedInRab = item;
  };

  const actionExecContext = {
    ...execContext,
    onAddRabItemDirect: directAddCallback,
  };

  // 5.1 Proposing an action generates PENDING AIActionProposal with preview
  const propRes = await aiToolRegistry.executeTool('proposeAddRabItem', {
    description: 'Pemasangan Keramik 60x60 Kamar Mandi',
    volume: 12,
    unit: 'm²',
    unitPrice: 185000,
  }, actionExecContext);

  const propResAny = propRes as any;
  assert(propRes.success === true, 'proposeAddRabItem successfully generated proposal');
  assert(propResAny.proposal !== undefined, 'Proposal object exists');
  assert(propResAny.proposal?.type === 'ACTION', 'Proposal type is ACTION');
  assert(propResAny.proposal?.status === 'PENDING', 'Proposal initial status is PENDING (No Auto Mutation)');
  assert(itemCreatedInRab === null, 'Source of truth has NOT been mutated prior to user approval');

  const proposal = propResAny.proposal!;
  const testIdempotencyKey = `idemp-${proposal.id}`;

  // 5.2 User Rejection Flow
  const rejectedExec = await aiActionExecutor.executeApprovedAction(
    proposal,
    actionExecContext,
    { userId: 'user-estimator-1', approved: false, rejectionReason: 'Salah spesifikasi keramik' },
    testIdempotencyKey
  );
  assert(rejectedExec.status === 'REJECTED', 'User rejection properly transitions proposal to REJECTED');
  assert(itemCreatedInRab === null, 'Source of truth was NOT mutated on rejection');

  // 5.3 Fresh Proposal for Approval Flow
  const propRes2 = await aiToolRegistry.executeTool('proposeAddRabItem', {
    description: 'Pemasangan Keramik 60x60 Granit',
    volume: 25,
    unit: 'm²',
    unitPrice: 220000,
  }, actionExecContext);

  const propRes2Any = propRes2 as any;
  const proposal2 = propRes2Any.proposal!;
  const approvalIdempotencyKey = `idemp-approve-${proposal2.id}`;

  // 5.4 User Approval Execution
  const approvedExec = await aiActionExecutor.executeApprovedAction(
    proposal2,
    actionExecContext,
    { userId: 'user-estimator-1', approved: true },
    approvalIdempotencyKey
  );

  assert(approvedExec.success === true, 'Approved action executed successfully');
  assert(approvedExec.status === 'EXECUTED', 'Action status transitioned to EXECUTED');
  assert(itemCreatedInRab !== null, 'Source of truth was mutated via EZRAB Core callback after approval');
  assert(itemCreatedInRab?.description === 'Pemasangan Keramik 60x60 Granit', 'Correct item description passed to Core');

  // 5.5 Idempotency Test: Executing the same approved action twice is prevented
  const duplicateExec = await aiActionExecutor.executeApprovedAction(
    proposal2,
    actionExecContext,
    { userId: 'user-estimator-1', approved: true },
    approvalIdempotencyKey
  );
  assert(duplicateExec.success === false, 'Duplicate execution rejected');
  assert(duplicateExec.errorCode === 'IDEMPOTENCY_DUPLICATE', 'Error code is IDEMPOTENCY_DUPLICATE');

  // 5.6 Audit Trail Test
  const auditLog = aiActionAuditEngine.getProjectAuditLog(PROJ_A);
  assert(auditLog.length >= 2, `Audit log contains records for both rejected and approved actions (Found: ${auditLog.length})`);
  const approvedAudit = auditLog.find((a) => a.actionId === proposal2.id);
  assert(approvedAudit !== undefined, 'Audit record exists for approved action');
  assert(approvedAudit?.approval.status === 'APPROVED', 'Audit recorded user approval');
  assert(approvedAudit?.executionStatus === 'SUCCESS', 'Audit recorded successful execution');

  // ===========================================================================
  // [6] REGEX COLLISION FIX ("pekerja" vs "pekerjaan")
  // ===========================================================================
  console.log('\n--- [6] Deterministic Intent Matching & Regex Collision Fix ---');

  const fullCtx = buildFullAIContext(mockProjectA, mockRabItemsA);

  // 6.1 Query containing "pekerja" (labor / workers) must NOT trigger ADD_RAB_ITEM masonry proposal
  const laborQueryRes = await defaultAiProvider.chat('Berapa upah pekerja harian standar PUPR?', fullCtx);
  assert(laborQueryRes.badge === 'AHSP', 'Query regarding pekerja matches AHSP labor intent');
  assert(laborQueryRes.actionProposal === undefined, '"pekerja" query does NOT accidentally generate ADD_RAB_ITEM proposal');
  assert(laborQueryRes.content.includes('Standar Upah Tenaga Kerja Konstruksi'), 'Returns genuine labor wage standards');

  // 6.2 Query containing "pekerjaan" (work item addition) correctly generates action proposal
  const workItemQueryRes = await defaultAiProvider.chat('Tambahkan pekerjaan pasangan bata ringan hebel 15 m2', fullCtx);
  assert(workItemQueryRes.actionProposal !== undefined, '"pekerjaan" query correctly triggers action proposal');
  assert(workItemQueryRes.actionProposal?.type === 'ADD_RAB_ITEM', 'Proposal type is ADD_RAB_ITEM');

  // ===========================================================================
  // [7] ORCHESTRATOR END-TO-END FLOW (COPILOT PIPELINE)
  // ===========================================================================
  console.log('\n--- [7] Copilot Orchestrator End-to-End Pipeline ---');

  // 7.1 Total RAB via Orchestrator
  const copilotTotal = await ezrabProjectCopilot.handleUserMessage({
    projectId: PROJ_A,
    message: 'Berapa total RAB proyek ini?',
    project: mockProjectA,
    rabItems: mockRabItemsA,
  });
  assert(copilotTotal.toolUsed === 'getRabTotal', 'Orchestrator routed query to getRabTotal tool');
  assert(copilotTotal.message.role === 'assistant', 'Assistant message generated in unified store');
  assert(copilotTotal.message.stats?.value === 'Rp 113.250.000', 'Response contains exact deterministic grand total');

  // 7.2 Floor volume calculation via Orchestrator
  const copilotCalc = await ezrabProjectCopilot.handleUserMessage({
    projectId: PROJ_A,
    message: 'Hitung volume lantai ukuran 12 x 8 meter tebal 0.12',
    project: mockProjectA,
    rabItems: mockRabItemsA,
  });
  assert(copilotCalc.toolUsed === 'calculateQuantity', 'Orchestrator routed calculation query to calculateQuantity tool');
  assert(copilotCalc.message.content.includes('11.52'), 'Calculation result 12 x 8 x 0.12 = 11.52 m³ verified');

  // 7.3 Action proposal generation via Orchestrator
  const copilotAction = await ezrabProjectCopilot.handleUserMessage({
    projectId: PROJ_A,
    message: 'Tambahkan pekerjaan pasangan dinding hebel volume 50 m2',
    project: mockProjectA,
    rabItems: mockRabItemsA,
  });
  assert(copilotAction.toolUsed === 'proposeAddRabItem', 'Orchestrator routed work addition to proposeAddRabItem tool');
  assert(copilotAction.actionProposal?.status === 'PENDING', 'Orchestrator created PENDING action proposal requiring approval');

  // 7.4 Multi-turn user approval: "Setujui"
  const copilotApproval = await ezrabProjectCopilot.handleUserMessage({
    projectId: PROJ_A,
    message: 'Setujui',
    project: mockProjectA,
    rabItems: mockRabItemsA,
    onAddRabItemDirect: (item) => {
      mockRabItemsA.push({
        id: `rab-${Date.now()}`,
        no: mockRabItemsA.length + 1,
        code: '04.01',
        description: item.description,
        volume: item.volume,
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.volume * item.unitPrice,
        category: item.category,
        projectId: PROJ_A,
      });
    },
  });
  assert(copilotApproval.message.content.includes('Telah Disetujui & Diterapkan'), 'Orchestrator applied approved mutation');
  assert(mockRabItemsA.length === 4, 'Mock RAB items count increased from 3 to 4');

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`PHASE C TEST SUMMARY: ${passCount} PASSED / ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhaseCTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

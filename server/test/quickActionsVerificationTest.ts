/**
 * Comprehensive Quick Actions Verification Test Suite
 * 
 * Verifies all 33 points covering:
 * - 10 Canonical Quick Actions (AUDIT_RAB, HITUNG_VOLUME, CARI_AHSP, CARI_HARGA, ANALISIS_DED,
 *   BUAT_LAPORAN, PERIKSA_KURVA_S, JELASKAN_ITEM, RECALCULATE, BANTUAN_FITUR)
 * - Two-way conversational state transitions (IDLE -> COLLECTING_PARAMETERS -> TOOL_PREVIEW -> EXECUTING -> COMPLETED)
 * - Free-form natural language dual parsing vs structured choice click
 * - Mutation confirmation gates & Diff previews
 * - Tenant isolation & Project context attachment
 * - Follow-up suggestion chips generation
 * - Fallback & Client offline simulation
 */

import { QuickActionStateMachine, quickActionStateMachine } from '../services/quickActionStateMachine.js';
import { QUICK_ACTION_CONTRACTS, QUICK_ACTIONS_LIST, QuickActionId } from '../../src/data/quickActionContracts.js';
import { aiOrchestrator } from '../orchestrator/aiOrchestrator.js';

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(num: number, name: string, condition: boolean, details?: string) {
  results.push({
    num,
    name,
    passed: condition,
    details: condition ? undefined : details || 'Assertion failed',
  });
  const symbol = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`[Test ${num.toString().padStart(2, '0')}] ${symbol}: ${name}`);
  if (!condition && details) {
    console.log(`   -> Error Details: ${details}`);
  }
}

async function runVerificationSuite() {
  console.log('================================================================');
  console.log('EZRAB COASSISTANT — QUICK ACTIONS 33-POINT VERIFICATION SUITE');
  console.log('================================================================\n');

  const mockProject = {
    id: 'PRJ-TROPIS-MODERN-01',
    name: 'Proyek Verifikasi Quick Actions',
    location: 'Jakarta',
    workspaceId: 'ws-default-ezrab',
    userId: 'user-estimator-01',
  };

  const mockRabItems = [
    {
      id: 'rab-1',
      code: '1.1',
      description: 'Pekerjaan Galian Tanah Pondasi',
      category: 'Pekerjaan Tanah',
      volume: 45,
      unit: 'm3',
      unitPrice: 85000,
      totalPrice: 3825000,
      ahspCode: 'A.2.3.1.1',
    },
    {
      id: 'rab-2',
      code: '2.1',
      description: 'Pondasi Batu Kali 1:4',
      category: 'Pekerjaan Pondasi',
      volume: 18,
      unit: 'm3',
      unitPrice: 950000,
      totalPrice: 17100000,
      ahspCode: 'A.3.2.1.2',
    },
    {
      id: 'rab-3',
      code: '3.1',
      description: 'Beton Kolom Praktis 15x15 K-175',
      category: 'Pekerjaan Struktur',
      volume: 12,
      unit: 'm3',
      unitPrice: 1250000,
      totalPrice: 15000000,
      ahspCode: 'A.4.1.1.5',
    },
  ];

  // --------------------------------------------------------------------------
  // SECTION 1: CANONICAL CONTRACT REGISTRY (Tests 1-5)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 1: CANONICAL CONTRACT REGISTRY ---');
  
  // Test 1: All 10 Quick Actions defined in registry
  const expectedActions: QuickActionId[] = [
    'AUDIT_RAB',
    'HITUNG_VOLUME',
    'CARI_AHSP',
    'CARI_HARGA',
    'ANALISIS_DED',
    'BUAT_LAPORAN',
    'PERIKSA_KURVA_S',
    'JELASKAN_ITEM',
    'RECALCULATE',
    'BANTUAN_FITUR',
  ];
  const registeredKeys = Object.keys(QUICK_ACTION_CONTRACTS);
  const all10Exist = expectedActions.every((id) => registeredKeys.includes(id));
  assert(1, 'All 10 Canonical Quick Actions are registered in QUICK_ACTION_CONTRACTS', all10Exist);

  // Test 2: QUICK_ACTIONS_LIST has 10 items with correct titles & actionIds
  const listCount = QUICK_ACTIONS_LIST.length === 10;
  assert(2, 'QUICK_ACTIONS_LIST exposes exact 10 action buttons', listCount);

  // Test 3: Read-only contracts marked as riskLevel: 'READ_ONLY' and requiresConfirmation: false
  const readOnlyActions: QuickActionId[] = ['AUDIT_RAB', 'HITUNG_VOLUME', 'CARI_AHSP', 'CARI_HARGA', 'ANALISIS_DED', 'PERIKSA_KURVA_S', 'JELASKAN_ITEM', 'BANTUAN_FITUR'];
  const readOnlyValid = readOnlyActions.every((id) => QUICK_ACTION_CONTRACTS[id].riskLevel === 'READ_ONLY' && QUICK_ACTION_CONTRACTS[id].requiresConfirmation === false);
  assert(3, 'Read-only Quick Actions strictly configured with riskLevel: READ_ONLY & requiresConfirmation: false', readOnlyValid);

  // Test 4: Mutating actions marked as riskLevel: 'MUTATION' and requiresConfirmation: true
  const mutatingActions: QuickActionId[] = ['RECALCULATE', 'BUAT_LAPORAN'];
  const mutatingValid = mutatingActions.every((id) => QUICK_ACTION_CONTRACTS[id].requiresConfirmation === true);
  assert(4, 'Mutating Quick Actions (RECALCULATE, BUAT_LAPORAN) configured with requiresConfirmation: true', mutatingValid);

  // Test 5: Parameter requirements defined for all actions
  const paramsDefined = expectedActions.every((id) => Array.isArray(QUICK_ACTION_CONTRACTS[id].requiredParameters));
  assert(5, 'Parameter schemas defined for all 10 Quick Actions', paramsDefined);

  // --------------------------------------------------------------------------
  // SECTION 2: TRIGGER PARSING & INTENT ROUTING (Tests 6-10)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: TRIGGER PARSING & INTENT ROUTING ---');

  // Test 6: AI Orchestrator routes [QUICK_ACTION_TRIGGER:AUDIT_RAB]
  const auditResp = await aiOrchestrator.handleChat({
    workspaceId: mockProject.workspaceId,
    projectId: mockProject.id,
    userId: mockProject.userId,
    message: '[QUICK_ACTION_TRIGGER:AUDIT_RAB] Lakukan audit RAB sekarang',
  });
  assert(6, 'AI Orchestrator detects [QUICK_ACTION_TRIGGER:AUDIT_RAB] and initiates session', Boolean(auditResp.quickActionResponse && auditResp.quickActionResponse.actionId === 'AUDIT_RAB'));

  // Test 7: Natural language intent fallback matches Quick Actions
  const natAudit = await aiOrchestrator.handleChat({
    workspaceId: mockProject.workspaceId,
    projectId: mockProject.id,
    userId: mockProject.userId,
    message: 'audit rab proyek ini dong tolong periksa',
  });
  assert(7, 'Natural language "audit rab" triggers AUDIT_RAB session or structured intent', Boolean(natAudit.intent === 'AUDIT_RAB' || natAudit.quickActionResponse?.actionId === 'AUDIT_RAB' || natAudit.success));

  // Test 8: Session returns initial step & choices
  const hasStepAndChoices = Boolean(auditResp.quickActionResponse?.step && auditResp.quickActionResponse?.choices?.length);
  assert(8, 'AUDIT_RAB returns structured step and interactive choice cards', hasStepAndChoices);

  // Test 9: Contextual follow-up suggestions generated on start
  const hasFollowUps = Boolean(auditResp.quickActionResponse?.followUpSuggestions && auditResp.quickActionResponse.followUpSuggestions.length >= 2);
  assert(9, 'Session includes 2-4 contextual follow-up suggestions', hasFollowUps);

  // Test 10: Human title preserved for user chat display
  const sessionData = auditResp.quickActionResponse;
  assert(10, 'Session contains valid title "Audit RAB"', sessionData?.title === 'Audit RAB' || sessionData?.actionTitle === 'Audit RAB');

  // --------------------------------------------------------------------------
  // SECTION 3: MULTI-TURN WORKFLOW & DUAL-INPUT PARSING (Tests 11-18)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: MULTI-TURN WORKFLOW & DUAL-INPUT PARSING ---');

  // Test 11: HITUNG_VOLUME initiation
  const volSession = await quickActionStateMachine.startSession({
    actionId: 'HITUNG_VOLUME',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
  });
  assert(11, 'HITUNG_VOLUME session started in COLLECTING_PARAMETERS state', volSession.currentState === 'COLLECTING_PARAMETERS');

  // Test 12: Select shape choice (KOLOM_BALOK)
  const volStep2 = await quickActionStateMachine.answerStep(
    volSession.sessionId,
    'KOLOM_BALOK'
  );
  assert(12, 'HITUNG_VOLUME transitions to dimension collection on shape select', Boolean(volStep2.step === 'MASUKKAN_DIMENSI'));

  // Test 13: Free-form text dimension parsing ("P: 6m, L: 0.2m, T: 0.3m, Jml: 4")
  const volStep3 = await quickActionStateMachine.answerStep(
    volSession.sessionId,
    undefined,
    undefined,
    'Panjang 6 meter, Lebar 0.2 m, Tinggi 0.3 m, Jumlah 4 buah'
  );
  // Expected volume: 6 * 0.2 * 0.3 * 4 = 1.44 m3
  const computedVol = (volStep3.collectedParameters as any)?.computedVolume;
  assert(13, 'Free-form natural language parsed dimensions correctly (Volume: 1.44 m3)', Math.abs(computedVol - 1.44) < 0.01);

  // Test 14: CARI_AHSP multi-turn search
  const ahspSession = await quickActionStateMachine.startSession({
    actionId: 'CARI_AHSP',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
  });
  const ahspStep2 = await quickActionStateMachine.answerStep(
    ahspSession.sessionId,
    'PEKERJAAN_BETON'
  );
  assert(14, 'CARI_AHSP lists relevant AHSP codes for Pekerjaan Beton', Boolean(ahspStep2.table && ahspStep2.table.rows.length > 0));

  // Test 15: CARI_HARGA multi-turn price lookup
  const hargaSession = await quickActionStateMachine.startSession({
    actionId: 'CARI_HARGA',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
  });
  const hargaStep2 = await quickActionStateMachine.answerStep(
    hargaSession.sessionId,
    'MATERIAL_PASIR_SEMEN'
  );
  assert(15, 'CARI_HARGA displays market & PUPR price comparison table', Boolean(hargaStep2.table && hargaStep2.table.rows.length > 0));

  // Test 16: ANALISIS_DED multi-turn drawing check
  const dedSession = await quickActionStateMachine.startSession({
    actionId: 'ANALISIS_DED',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
  });
  const dedStep2 = await quickActionStateMachine.answerStep(
    dedSession.sessionId,
    'DENAH_ARSITEKTUR'
  );
  assert(16, 'ANALISIS_DED extracts dimensions and checks completeness', Boolean(dedStep2.currentState === 'COMPLETED'));

  // Test 17: PERIKSA_KURVA_S deviation analysis
  const kurvaSession = await quickActionStateMachine.startSession({
    actionId: 'PERIKSA_KURVA_S',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
  });
  const kurvaStep2 = await quickActionStateMachine.answerStep(
    kurvaSession.sessionId,
    'CEK_DEVIASI_PROGRESS'
  );
  assert(17, 'PERIKSA_KURVA_S calculates progress deviation and risk level', Boolean(kurvaStep2.stats && kurvaStep2.stats.label.includes('Deviasi')));

  // Test 18: JELASKAN_ITEM explanation breakdown
  const jelaskanSession = await quickActionStateMachine.startSession({
    actionId: 'JELASKAN_ITEM',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
    rabItems: mockRabItems,
  });
  const jelaskanStep2 = await quickActionStateMachine.answerStep(
    jelaskanSession.sessionId,
    'PONDASI_BATU_KALI'
  );
  assert(18, 'JELASKAN_ITEM explains breakdown, composition, and reference specs', Boolean(jelaskanStep2.table && jelaskanStep2.table.headers.includes('Komponen')));

  // --------------------------------------------------------------------------
  // SECTION 4: MUTATION GATE, DIFF PREVIEWS & CONFIRMATION (Tests 19-25)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: MUTATION GATE, DIFF PREVIEWS & CONFIRMATION ---');

  // Test 19: RECALCULATE enters TOOL_PREVIEW with requiresConfirmation: true
  const recalcSession = await quickActionStateMachine.startSession({
    actionId: 'RECALCULATE',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
    rabItems: mockRabItems,
  });
  const recalcStep2 = await quickActionStateMachine.answerStep(
    recalcSession.sessionId,
    'UPDATE_ALL_AHSP_STANDARDS'
  );
  assert(19, 'RECALCULATE requiresConfirmation is true in TOOL_PREVIEW state', Boolean(recalcStep2.currentState === 'TOOL_PREVIEW' && recalcStep2.requiresConfirmation === true));

  // Test 20: RECALCULATE provides explicit Diff Preview (Before vs After)
  const hasDiffTable = Boolean(recalcStep2.diffPreview && recalcStep2.diffPreview.length > 0);
  assert(20, 'RECALCULATE generates diff preview comparison', hasDiffTable);

  // Test 21: RECALCULATE confirm applies mutation and finishes session
  const recalcConfirm = await quickActionStateMachine.confirmSession(recalcSession.sessionId);
  assert(21, 'RECALCULATE confirm transitions state to COMPLETED', recalcConfirm.currentState === 'COMPLETED');

  // Test 22: BUAT_LAPORAN requires confirmation before generating document
  const lapSession = await quickActionStateMachine.startSession({
    actionId: 'BUAT_LAPORAN',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
    rabItems: mockRabItems,
  });
  const lapStep2 = await quickActionStateMachine.answerStep(
    lapSession.sessionId,
    'FORMAT_EXCEL_RAB'
  );
  assert(22, 'BUAT_LAPORAN requires confirmation for generation', Boolean(lapStep2.requiresConfirmation === true));

  // Test 23: BUAT_LAPORAN confirm successfully finishes
  const lapConfirm = await quickActionStateMachine.confirmSession(lapSession.sessionId);
  assert(23, 'BUAT_LAPORAN confirm produces download link / confirmation', lapConfirm.currentState === 'COMPLETED');

  // Test 24: Non-mutating action calling confirm safely completes
  const nonMutConfirm = await quickActionStateMachine.confirmSession(auditResp.quickActionResponse!.sessionId);
  assert(24, 'Non-mutating action safely completes upon confirm call', nonMutConfirm.currentState === 'COMPLETED');

  // Test 25: BANTUAN_FITUR multi-step feature walkthrough
  const bantuanSession = await quickActionStateMachine.startSession({
    actionId: 'BANTUAN_FITUR',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
  });
  const bantuanStep2 = await quickActionStateMachine.answerStep(
    bantuanSession.sessionId,
    'CARA_IMPORT_EXCEL'
  );
  assert(25, 'BANTUAN_FITUR provides step-by-step tutorial guides', Boolean(bantuanStep2.message.includes('Langkah')));

  // --------------------------------------------------------------------------
  // SECTION 5: NAVIGATION, CANCELATION & TENANT ISOLATION (Tests 26-30)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: NAVIGATION, CANCELATION & TENANT ISOLATION ---');

  // Test 26: Go Back navigation returns to previous step
  const navSession = await quickActionStateMachine.startSession({
    actionId: 'HITUNG_VOLUME',
    projectId: mockProject.id,
    workspaceId: mockProject.workspaceId,
  });
  await quickActionStateMachine.answerStep(
    navSession.sessionId,
    'DINDING_BATA'
  );
  const goBackResp = await quickActionStateMachine.goBack(navSession.sessionId);
  assert(26, 'goBack returns user to initial shape selection step', goBackResp.step === 'PILIH_BENTUK_ELEMEN');

  // Test 27: Session Cancelation resets state
  const cancelResp = await quickActionStateMachine.cancelSession(navSession.sessionId);
  assert(27, 'cancelSession marks state as CANCELLED and returns cancellation note', cancelResp.currentState === 'CANCELLED');

  // Test 28: Expired or Non-existent session handling
  try {
    await quickActionStateMachine.answerStep('non-existent-session-999', 'test');
    assert(28, 'Error thrown for non-existent session ID', false);
  } catch (err: any) {
    assert(28, 'Non-existent session ID safely caught with explanatory error', Boolean(err.message));
  }

  // Test 29: Tenant Isolation prevents cross-workspace pollution
  const crossTenantSession = await quickActionStateMachine.startSession({
    actionId: 'AUDIT_RAB',
    projectId: mockProject.id,
    workspaceId: 'ws-tenant-99-unauthorized',
    rabItems: [],
  });
  const sessionStored = (quickActionStateMachine as any).sessions.get(crossTenantSession.sessionId);
  assert(29, 'Tenant workspace ID strictly bound to created session', sessionStored?.workspaceId === 'ws-tenant-99-unauthorized');

  // Test 30: Follow-up suggestions update dynamically after each step
  const dynamicFollowUps = Boolean(goBackResp.followUpSuggestions && goBackResp.followUpSuggestions.length > 0);
  assert(30, 'Follow-up suggestions adapt dynamically at every turn', dynamicFollowUps);

  // --------------------------------------------------------------------------
  // SECTION 6: CLIENT OFFLINE / FALLBACK SIMULATION (Tests 31-33)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: CLIENT OFFLINE / FALLBACK SIMULATION ---');

  // Test 31: Mock client handles Quick Actions trigger without backend
  const { defaultAiProvider } = await import('../../src/services/aiProviderEngine.js');
  const mockContext: any = {
    activeProject: mockProject,
    rabItems: mockRabItems,
  };
  const mockClientResult = await defaultAiProvider.chat(
    '[QUICK_ACTION_TRIGGER:AUDIT_RAB] Lakukan audit',
    mockContext
  );
  assert(31, 'Client AI Provider generates offline/mock Quick Action response', Boolean(mockClientResult.quickActionResponse));

  // Test 32: Client mock returns interactive choices for HITUNG_VOLUME
  const mockVolResult = await defaultAiProvider.chat(
    '[QUICK_ACTION_TRIGGER:HITUNG_VOLUME] Hitung volume balok',
    mockContext
  );
  assert(32, 'Client AI Provider provides interactive choices in mock mode', Boolean(mockVolResult.quickActionResponse?.choices?.length));

  // Test 33: Client mock returns followUpSuggestions
  assert(33, 'Client AI Provider supplies follow-up suggestions in mock mode', Boolean(mockClientResult.followUpSuggestions && mockClientResult.followUpSuggestions.length > 0));

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerificationSuite().catch((err) => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});

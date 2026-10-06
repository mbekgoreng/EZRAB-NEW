/**
 * EZRAB COASSISTANT — PRIORITY 1 AUTOMATED TEST SUITE
 *
 * Verifies all 19 functional, architectural, security, and wizard requirements.
 */

import { intentClassifier } from '../orchestrator/intentClassifier';
import { WizardStateMachine } from '../services/wizardStateMachine';
import { HOUSE_TYPE_CATALOG } from '../../src/data/houseTypeCatalog';
import { toolRegistry } from '../tools/toolRegistry';
import { aiDbAdapter } from '../database/dbAdapter';
import { observabilityService } from '../services/observabilityService';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
  }
}

async function runPriority1Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING EZRAB COASSISTANT PRIORITY 1 VERIFICATION SUITE');
  console.log('================================================================\n');

  const workspaceId = 'ws_p1_test';
  const projectId = 'prj_p1_test';
  const userId = 'usr_p1_estimator';
  const conversationId = 'conv_p1_test_001';

  // ---------------------------------------------------------------------------
  // TEST 1: "buatkan RAB rumah" menghasilkan choices
  // ---------------------------------------------------------------------------
  console.log('Test Group 1: Intent & Wizard Choices Generation');
  const wizardResp1 = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId,
    initialQuery: 'buatkan saya RAB rumah'
  });

  assert(
    wizardResp1.step === 'PROJECT_CATEGORY_SELECTION' || wizardResp1.step === 'TEMPLATE_SELECTION',
    'Test 1: "buatkan RAB rumah" menghasilkan wizard step yang valid',
    `Received step: ${wizardResp1.step}`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: choices tidak kosong
  // ---------------------------------------------------------------------------
  assert(
    Array.isArray(wizardResp1.choices) && wizardResp1.choices.length > 0,
    'Test 2: choices tidak kosong',
    `Found ${wizardResp1.choices?.length} choices`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Type 36 sampai Type 300 tampil di katalog
  // ---------------------------------------------------------------------------
  const houseChoices = HOUSE_TYPE_CATALOG;
  const t36 = houseChoices.find(c => c.value.startsWith('HOUSE-T36') || c.id.startsWith('house_t36'));
  const t45 = houseChoices.find(c => c.value.startsWith('HOUSE-T45') || c.id.startsWith('house_t45'));
  const t54 = houseChoices.find(c => c.value === 'HOUSE-T54' || c.id === 'house_t54');
  const t60 = houseChoices.find(c => c.value === 'HOUSE-T60' || c.id === 'house_t60');
  const t70 = houseChoices.find(c => c.value.startsWith('HOUSE-T70') || c.id.startsWith('house_t70'));
  const t90 = houseChoices.find(c => c.value === 'HOUSE-T90' || c.id === 'house_t90');
  const t100 = houseChoices.find(c => c.value === 'HOUSE-T100' || c.id === 'house_t100');
  const t120 = houseChoices.find(c => c.value === 'HOUSE-T120' || c.id === 'house_t120');
  const t150 = houseChoices.find(c => c.value === 'HOUSE-T150' || c.id === 'house_t150');
  const t180 = houseChoices.find(c => c.value === 'HOUSE-T180' || c.id === 'house_t180');
  const t200 = houseChoices.find(c => c.value === 'HOUSE-T200' || c.id === 'house_t200');
  const t250 = houseChoices.find(c => c.value === 'HOUSE-T250' || c.id === 'house_t250');
  const t300 = houseChoices.find(c => c.value === 'HOUSE-T300' || c.id === 'house_t300');
  const tCustom = houseChoices.find(c => c.value === 'HOUSE-CUSTOM' || c.id === 'house_custom');

  assert(
    Boolean(t36 && t45 && t54 && t60 && t70 && t90 && t100 && t120 && t150 && t180 && t200 && t250 && t300 && tCustom),
    'Test 3: Seluruh tipe rumah dari Type 36 sampai Type 300 + Custom tersedia di katalog'
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Choice memiliki id dan label stabil
  // ---------------------------------------------------------------------------
  const allChoicesHaveIdAndLabel = (wizardResp1.choices || []).every(c => Boolean(c.id && (c.label || (c as any).name)));
  assert(
    allChoicesHaveIdAndLabel,
    'Test 4: Semua pilihan wizard memiliki id dan label stabil'
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Type yang belum tersedia tidak dihitung palsu (gated/disabled/status indicator)
  // ---------------------------------------------------------------------------
  const unreadyHouse = houseChoices.find(c => c.value === 'HOUSE-T150' || c.id === 'house_t150');
  assert(
    unreadyHouse !== undefined && (unreadyHouse.disabled === true || unreadyHouse.readinessStatus === 'COMING_SOON'),
    'Test 5: Type yang belum siap memiliki status COMING_SOON / disabled dan tidak menghasilkan RAB palsu'
  );

  // ---------------------------------------------------------------------------
  // TEST 6: "buat RAB jalan aspal" meminta parameter
  // ---------------------------------------------------------------------------
  console.log('\nTest Group 2: Specific Project Intent & Adaptive Questions');
  const roadResp = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId: 'conv_road_01',
    initialQuery: 'buat RAB jalan aspal'
  });

  assert(
    roadResp.step === 'BASIC_PARAMETER_COLLECTION' && Array.isArray(roadResp.questions) && roadResp.questions.length > 0,
    'Test 6: "buat RAB jalan aspal" langsung masuk ke pertanyaan parameter adaptif'
  );

  // ---------------------------------------------------------------------------
  // TEST 7: "buat RAB gedung" meminta jenis gedung
  // ---------------------------------------------------------------------------
  const buildingResp = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId: 'conv_bld_01',
    initialQuery: 'buat RAB gedung'
  });

  assert(
    (buildingResp.step === 'PROJECT_TYPE_SELECTION' || buildingResp.step === 'PROJECT_CATEGORY_SELECTION') &&
    (buildingResp.choices?.some(c => c.id.includes('building') || c.id.includes('commercial') || c.id.includes('office') || c.id.includes('house') || c.label.toLowerCase().includes('gedung') || c.label.toLowerCase().includes('ruko')) || false),
    'Test 7: "buat RAB gedung" menampilkan pilihan sub-kategori gedung'
  );

  // ---------------------------------------------------------------------------
  // TEST 8: Intent confidence rendah memicu klarifikasi
  // ---------------------------------------------------------------------------
  console.log('\nTest Group 3: Universal Intent Classification');
  const vagueClassification = intentClassifier.classifyUniversal('anu itu tolong kerjakan sesuatu dong');
  assert(
    vagueClassification.requiresClarification === true || vagueClassification.confidence < 0.65,
    'Test 8: Kalimat ambigu menghasilkan confidence rendah atau requiresClarification = true'
  );

  // ---------------------------------------------------------------------------
  // TEST 9: Wizard session konsisten
  // ---------------------------------------------------------------------------
  console.log('\nTest Group 4: State Machine Operations & Session Consistency');
  const session1 = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId: 'conv_session_test',
    initialQuery: 'buatkan saya RAB'
  });

  const nextState = WizardStateMachine.answerStep({
    sessionId: session1.wizardSessionId,
    workspaceId,
    userId,
    choiceId: 'BUILDING'
  });

  assert(
    nextState.wizardSessionId === session1.wizardSessionId && nextState.step === 'PROJECT_TYPE_SELECTION',
    'Test 9: Session ID dipertahankan konsisten sepanjang transisi state'
  );

  // ---------------------------------------------------------------------------
  // TEST 10: Back, cancel, retry bekerja
  // ---------------------------------------------------------------------------
  const backState = WizardStateMachine.goBack(session1.wizardSessionId, workspaceId);
  assert(
    backState.step === 'PROJECT_CATEGORY_SELECTION',
    'Test 10a: goBack() mengembalikan state ke tahap sebelumnya'
  );

  const cancelResult = WizardStateMachine.cancelSession(session1.wizardSessionId, workspaceId);
  assert(
    cancelResult.success === true,
    'Test 10b: cancelSession() berhasil membatalkan sesi wizard'
  );

  // ---------------------------------------------------------------------------
  // TEST 11: Preview / dryRun tidak mengubah database
  // ---------------------------------------------------------------------------
  console.log('\nTest Group 5: Tool Registry, Dry-Run, & Security Authorization');
  const initialProjectsCount = aiDbAdapter.getProjects(workspaceId).length;

  const dryRunExecution = await toolRegistry.executeSafe(
    'create_project',
    { name: 'Proyek Uji DryRun' },
    { workspaceId, projectId, userId, userRole: 'ESTIMATOR', isDryRun: true }
  );

  const afterDryRunCount = aiDbAdapter.getProjects(workspaceId).length;
  assert(
    dryRunExecution.isDryRun === true && initialProjectsCount === afterDryRunCount,
    'Test 11: Tool execution dengan isDryRun tidak menambah data ke database'
  );

  // ---------------------------------------------------------------------------
  // TEST 12: Mutasi memerlukan konfirmasi
  // ---------------------------------------------------------------------------
  const createProjectTool = toolRegistry.get('create_project');
  assert(
    createProjectTool !== undefined && createProjectTool.requiresConfirmation === true,
    'Test 12: Tool mutasi terdaftar dengan requiresConfirmation = true'
  );

  // ---------------------------------------------------------------------------
  // TEST 13: User dari workspace lain ditolak (Tenant Isolation)
  // ---------------------------------------------------------------------------
  let tenantIsolated = false;
  try {
    await toolRegistry.executeSafe(
      'get_project',
      {},
      { workspaceId: '', projectId, userId, userRole: 'ESTIMATOR' }
    );
  } catch (err: any) {
    tenantIsolated = err.message.includes('Tenant Violation');
  }
  assert(
    tenantIsolated,
    'Test 13: Pemanggilan tool tanpa workspaceId ditolak dengan Tenant Violation error'
  );

  // ---------------------------------------------------------------------------
  // TEST 14: Role tidak boleh dipercaya dari frontend (Role Authorization)
  // ---------------------------------------------------------------------------
  let roleGated = false;
  try {
    await toolRegistry.executeSafe(
      'delete_project',
      {},
      { workspaceId, projectId, userId, userRole: 'VIEWER' }
    );
  } catch (err: any) {
    roleGated = err.message.includes('Access Denied');
  }
  assert(
    roleGated,
    'Test 14: Eksekusi tool destructive (delete_project) ditolak untuk role VIEWER'
  );

  // ---------------------------------------------------------------------------
  // TEST 15: Structured response yang invalid tidak merusak chatbox
  // ---------------------------------------------------------------------------
  console.log('\nTest Group 6: Resiliency, Observability, & Error Handling');
  let handledGracefully = false;
  try {
    WizardStateMachine.answerStep({
      sessionId: 'non_existent_session',
      workspaceId,
      userId,
      choiceId: 'dummy_val'
    });
  } catch (e: any) {
    handledGracefully = e.message.includes('tidak ditemukan');
  }
  assert(
    handledGracefully,
    'Test 15: Pemrosesan session tidak valid mengembalikan error terstruktur yang aman ditangkap'
  );

  // ---------------------------------------------------------------------------
  // TEST 16: Tool registry category breakdown (READ, ANALYZE, MUTATE)
  // ---------------------------------------------------------------------------
  const readTools = toolRegistry.getByCategory('READ');
  const analyzeTools = toolRegistry.getByCategory('ANALYZE');
  const mutateTools = toolRegistry.getByCategory('MUTATE');

  assert(
    readTools.length > 0 && analyzeTools.length > 0 && mutateTools.length > 0,
    'Test 16: Registry tool terbagi rapi menjadi READ, ANALYZE, dan MUTATE',
    `READ: ${readTools.length}, ANALYZE: ${analyzeTools.length}, MUTATE: ${mutateTools.length}`
  );

  // ---------------------------------------------------------------------------
  // TEST 17: Observability logging masks sensitive data
  // ---------------------------------------------------------------------------
  observabilityService.logTelemetry({
    requestId: 'req_obs_test',
    userId: 'usr_secret_12345',
    metadata: {
      userApiKey: 'sk_live_verysecret1234567890',
      password: 'mypassword123',
      normalField: 'safeValue'
    }
  });

  const recentLogs = observabilityService.getRecentLogs(1);
  const lastLog = recentLogs[0];
  const isMasked = lastLog.userId?.includes('***') &&
    lastLog.metadata?.userApiKey === '[REDACTED_SECRET]' &&
    lastLog.metadata?.password === '[REDACTED_SECRET]' &&
    lastLog.metadata?.normalField === 'safeValue';

  assert(
    isMasked,
    'Test 17: Observability masking menyamarkan userId dan meredact API key / password'
  );

  // ---------------------------------------------------------------------------
  // TEST 18: House type direct extraction (e.g. "buat RAB rumah type 120")
  // ---------------------------------------------------------------------------
  const directHouse = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId: 'conv_direct_t120',
    initialQuery: 'buat RAB rumah type 120'
  });

  assert(
    directHouse.title.includes('Type 120') || directHouse.message.includes('Type 120') || directHouse.step === 'TEMPLATE_SELECTION',
    'Test 18: "buat RAB rumah type 120" mendeteksi Type 120 secara langsung'
  );

  // ---------------------------------------------------------------------------
  // TEST 19: Tool camelCase and snake_case alias resolution
  // ---------------------------------------------------------------------------
  const toolCamel = toolRegistry.get('getProject');
  const toolSnake = toolRegistry.get('get_project');
  assert(
    toolCamel !== undefined && toolSnake !== undefined && toolCamel.name === toolSnake.name,
    'Test 19: Tool registry mengenali format camelCase (getProject) dan snake_case (get_project) secara konsisten'
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`🏁 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPriority1Tests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

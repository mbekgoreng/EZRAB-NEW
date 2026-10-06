import assert from 'assert';
import { intentClassifier } from '../orchestrator/intentClassifier';
import { WizardStateMachine } from '../services/wizardStateMachine';
import { TemplateResolver } from '../services/templateResolver';
import { aiOrchestrator } from '../orchestrator/aiOrchestrator';
import { aiDbAdapter } from '../database/dbAdapter';

async function runAutomaticRabEntryPointTests() {
  console.log('============================================================');
  console.log('EZRAB — AUTOMATIC RAB ENTRY POINT TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`[PASS] ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`[FAIL] ${name} ->`, err.message);
            failed++;
          });
      } else {
        console.log(`[PASS] ${name}`);
        passed++;
      }
    } catch (err: any) {
      console.error(`[FAIL] ${name} ->`, err.message);
      failed++;
    }
  }

  // =========================================================================
  // 1. INTENT CLASSIFIER TESTS (Target Query Variations)
  // =========================================================================
  const targetQueries = [
    'buatkan saya rab',
    'buatkan RAB',
    'buat rab',
    'saya mau buat rab',
    'saya ingin membuat rab',
    'tolong buatkan rab',
    'buatkan estimasi biaya',
    'buat estimasi proyek',
    'mulai membuat RAB',
    'buatkan RAB rumah',
    'buatkan RAB bangunan',
    'buatkan RAB gedung',
    'buatkan RAB jalan',
    'buatkan RAB bangunan air',
    'buatkan rab konstruksi',
    'buatkan saya raaab',
    'buatkan RAB hotel',
    'buatkan r.a.b',
    'buat rabnya',
    'BUATKAN SAYA RAB',
    'buatkan   saya   rab',
    'buatkan saya rab!?!?',
    'tolong buatkan estimasi biaya proyek rumah',
    'bikin rab jalan',
    'hitungkan rab saluran air'
  ];

  for (const q of targetQueries) {
    test(`Intent: "${q}" -> AUTOMATIC_RAB_START`, () => {
      const intent = intentClassifier.classify(q);
      assert.strictEqual(
        intent.category,
        'AUTOMATIC_RAB_START',
        `Query "${q}" expected AUTOMATIC_RAB_START but got ${intent.category}`
      );
      assert.strictEqual(intent.requiresProjectData, false);
      assert.strictEqual(intent.requiresFunction, true);
    });
  }

  // Verify non-RAB queries are NOT classified as AUTOMATIC_RAB_START
  test('Intent: "halo apa kabar" -> HOW_ARE_YOU (not AUTOMATIC_RAB_START)', () => {
    const intent = intentClassifier.classify('halo apa kabar');
    assert.strictEqual(intent.category, 'HOW_ARE_YOU');
  });

  test('Intent: "audit rab proyek ini" -> AUDIT_RAB (not AUTOMATIC_RAB_START)', () => {
    const intent = intentClassifier.classify('audit rab proyek ini');
    assert.strictEqual(intent.category, 'AUDIT_RAB');
  });

  test('Intent: "cek anomali harga" -> AUDIT_RAB (not AUTOMATIC_RAB_START)', () => {
    const intent = intentClassifier.classify('cek anomali harga');
    assert.strictEqual(intent.category, 'AUDIT_RAB');
  });

  // =========================================================================
  // 2. STATE MACHINE ROUTING: GENERAL QUERY ("buatkan saya rab")
  // =========================================================================
  test('Wizard: "buatkan saya rab" -> PROJECT_CATEGORY_SELECTION with 5 categories', () => {
    const resp = WizardStateMachine.startSession({
      workspaceId: 'ws-test-entry',
      userId: 'user-test-01',
      projectId: 'PRJ-TEST-01',
      conversationId: 'conv-test-01',
      initialQuery: 'buatkan saya rab'
    });

    assert.strictEqual(resp.responseType, 'wizard');
    assert.ok(resp.wizardSessionId.startsWith('wiz_'));
    assert.strictEqual(resp.step, 'PROJECT_CATEGORY_SELECTION');
    assert.strictEqual(resp.title, 'Pilih Jenis Proyek');
    assert.strictEqual(resp.message, 'Siap, saya bantu membuat RAB. Pilih jenis proyek yang ingin Anda hitung.');
    assert.strictEqual(resp.choices?.length, 5);

    const choiceIds = resp.choices?.map(c => c.id);
    assert.deepStrictEqual(choiceIds, [
      'BUILDING',
      'ROAD_AND_PAVEMENT',
      'WATER_RESOURCES',
      'CIVIL_STRUCTURE',
      'CUSTOM_PROJECT'
    ]);
  });

  // =========================================================================
  // 3. STATE MACHINE ROUTING: SPECIFIC QUERIES
  // =========================================================================
  test('Wizard: "buatkan RAB rumah" -> TEMPLATE_SELECTION with house choices', () => {
    const resp = WizardStateMachine.startSession({
      workspaceId: 'ws-test-entry',
      userId: 'user-test-01',
      projectId: 'PRJ-TEST-01',
      conversationId: 'conv-test-02',
      initialQuery: 'buatkan RAB rumah'
    });

    assert.strictEqual(resp.step, 'TEMPLATE_SELECTION');
    assert.strictEqual(resp.title, 'Pilih Tipe Rumah Tinggal');
    assert.ok(resp.choices?.some(c => c.value === 'HOUSE-T36-1FL'));
  });

  test('Wizard: "buatkan RAB jalan" -> PROJECT_TYPE_SELECTION with road choices', () => {
    const resp = WizardStateMachine.startSession({
      workspaceId: 'ws-test-entry',
      userId: 'user-test-01',
      projectId: 'PRJ-TEST-01',
      conversationId: 'conv-test-03',
      initialQuery: 'buatkan RAB jalan'
    });

    assert.strictEqual(resp.step, 'PROJECT_TYPE_SELECTION');
    assert.strictEqual(resp.title, 'Pilih Tipe Prasarana Jalan & Perkerasan');
    assert.ok(resp.choices?.some(c => c.value === 'ASPHALT-ROAD-LIGHT'));
    assert.ok(resp.choices?.some(c => c.value === 'RIGID-CONCRETE-ROAD'));
    assert.ok(resp.choices?.some(c => c.value === 'PAVING-BLOCK-STANDARD'));
  });

  test('Wizard: "buatkan RAB bangunan air" -> PROJECT_TYPE_SELECTION with water choices & Bendungan warning', () => {
    const resp = WizardStateMachine.startSession({
      workspaceId: 'ws-test-entry',
      userId: 'user-test-01',
      projectId: 'PRJ-TEST-01',
      conversationId: 'conv-test-04',
      initialQuery: 'buatkan RAB bangunan air'
    });

    assert.strictEqual(resp.step, 'PROJECT_TYPE_SELECTION');
    assert.strictEqual(resp.title, 'Pilih Tipe Bangunan Air');
    assert.ok(resp.choices?.some(c => c.value === 'WATER_IRRIGATION'));
    assert.ok(resp.choices?.some(c => c.value === 'DRAIN-OPEN-UDITCH'));

    const damChoice = resp.choices?.find(c => c.value === 'WATER_DAM');
    assert.ok(damChoice);
    assert.strictEqual(damChoice?.badge, 'ENGINEERING_REVIEW_REQUIRED');
  });

  test('Wizard: "buatkan RAB hotel" -> PROJECT_TYPE_SELECTION with building choices', () => {
    const resp = WizardStateMachine.startSession({
      workspaceId: 'ws-test-entry',
      userId: 'user-test-01',
      projectId: 'PRJ-TEST-01',
      conversationId: 'conv-test-05',
      initialQuery: 'buatkan RAB hotel'
    });

    assert.strictEqual(resp.step, 'PROJECT_TYPE_SELECTION');
    assert.strictEqual(resp.title, 'Pilih Tipe Bangunan Gedung');
    assert.ok(resp.choices?.some(c => c.id === 'BUILDING_HOTEL'));
    assert.ok(resp.choices?.some(c => c.id === 'HOUSE_RESIDENTIAL'));
  });

  // =========================================================================
  // 4. MULTI-STEP NAVIGATION FLOW TEST
  // =========================================================================
  await test('Flow: Category -> Building -> House -> T36 -> Param -> Preview -> Confirm', async () => {
    const ws = 'ws-test-flow';
    const prj = 'PRJ-FLOW-01';
    aiDbAdapter.createProject(ws, { id: prj, name: 'Proyek Flow Test', budget: 0, status: 'ACTIVE' });

    // 1. User says "buatkan saya rab"
    const start = WizardStateMachine.startSession({
      workspaceId: ws,
      userId: 'u1',
      projectId: prj,
      conversationId: 'c-flow',
      initialQuery: 'buatkan saya rab'
    });
    assert.strictEqual(start.step, 'PROJECT_CATEGORY_SELECTION');

    // 2. User clicks "BUILDING" (Bangunan Gedung)
    const step2 = WizardStateMachine.answerStep({
      sessionId: start.wizardSessionId,
      workspaceId: ws,
      userId: 'u1',
      choiceId: 'BUILDING'
    });
    assert.strictEqual(step2.step, 'PROJECT_TYPE_SELECTION');
    assert.strictEqual(step2.title, 'Pilih Tipe Bangunan Gedung');
    assert.ok(step2.choices?.some(c => c.id === 'HOUSE_RESIDENTIAL'));

    // 3. User clicks "HOUSE_RESIDENTIAL" (Rumah Tinggal)
    const step3 = WizardStateMachine.answerStep({
      sessionId: start.wizardSessionId,
      workspaceId: ws,
      userId: 'u1',
      choiceId: 'HOUSE_RESIDENTIAL'
    });
    assert.strictEqual(step3.step, 'TEMPLATE_SELECTION');
    assert.strictEqual(step3.title, 'Pilih Tipe Rumah Tinggal');

    // 4. User clicks "HOUSE-T36-1FL" (Rumah Type 36)
    const step4 = WizardStateMachine.answerStep({
      sessionId: start.wizardSessionId,
      workspaceId: ws,
      userId: 'u1',
      choiceId: 'HOUSE-T36-1FL'
    });
    assert.strictEqual(step4.step, 'BASIC_PARAMETER_COLLECTION');
    assert.strictEqual(step4.title, 'Spesifikasi Teknis: Rumah Type 36 (1 Lantai)');
    assert.ok(step4.questions.length >= 5);

    // 5. User submits technical parameters
    const step5 = WizardStateMachine.answerStep({
      sessionId: start.wizardSessionId,
      workspaceId: ws,
      userId: 'u1',
      parameters: {
        building_area: 36,
        foundation_type: 'BATU_KALI',
        wall_type: 'BATA_RINGAN',
        roof_type: 'BAJA_RINGAN_GENTENG_METAL',
        quality_level: 'STANDAR'
      }
    });
    assert.strictEqual(step5.step, 'RAB_PREVIEW');
    assert.ok(step5.summary);
    assert.strictEqual(step5.summary!.itemsCount, 16);
    assert.ok(step5.summary!.grandTotal > 0);
    assert.strictEqual(step5.summary!.taxPercent, 11);

    // 6. User confirms and applies to spreadsheet
    const applied = WizardStateMachine.confirmAndApply({
      sessionId: start.wizardSessionId,
      workspaceId: ws,
      userId: 'u1',
      projectId: prj
    });
    assert.strictEqual(applied.success, true);
    assert.strictEqual(applied.addedItemsCount, 16);

    const dbItems = await aiDbAdapter.getRabItems(ws, prj);
    assert.strictEqual(dbItems.length, 16);
  });

  // =========================================================================
  // 5. AI ORCHESTRATOR INTEGRATION TEST
  // =========================================================================
  await test('AI Orchestrator: handleChat with "buatkan saya rab" returns wizardResponse', async () => {
    const ws = 'ws-test-orch';
    const prj = 'PRJ-ORCH-01';
    aiDbAdapter.createProject(ws, { id: prj, name: 'Proyek Orchestrator Test', budget: 0, status: 'ACTIVE' });

    const response = await aiOrchestrator.handleChat({
      workspaceId: ws,
      projectId: prj,
      userId: 'u1',
      message: 'buatkan saya rab'
    });

    assert.strictEqual(response.success, true);
    assert.strictEqual(response.intent, 'AUTOMATIC_RAB_START');
    assert.strictEqual(response.content, 'Siap, saya bantu membuat RAB. Pilih jenis proyek yang ingin Anda hitung.');
    assert.ok(response.wizardResponse);
    assert.strictEqual(response.wizardResponse!.step, 'PROJECT_CATEGORY_SELECTION');
    assert.strictEqual(response.wizardResponse!.choices?.length, 5);
  });

  console.log('\n============================================================');
  console.log(`TOTAL SCENARIOS RUN: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAutomaticRabEntryPointTests().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});

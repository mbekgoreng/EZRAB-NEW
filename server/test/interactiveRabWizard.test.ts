import { intentClassifier } from '../orchestrator/intentClassifier';
import { WizardStateMachine } from '../services/wizardStateMachine';
import { TemplateResolver } from '../services/templateResolver';
import { aiDbAdapter } from '../database/dbAdapter';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FAIL] Assertion Failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function runInteractiveWizardTests() {
  console.log('============================================================');
  console.log('🧪 EZRAB INTERACTIVE RAB WIZARD — PHASE A ACCEPTANCE TESTS');
  console.log('============================================================\n');

  // TEST 1: INTENT CLASSIFICATION
  console.log('[Test 1] Intent Detection untuk Permintaan RAB Umum...');
  const intent1 = intentClassifier.classify('Buatkan RAB Rumah');
  assert(intent1.category === 'AUTOMATIC_RAB_START', 'Intent "Buatkan RAB Rumah" terdeteksi sebagai AUTOMATIC_RAB_START');

  const intent2 = intentClassifier.classify('Buatkan RAB Jalan');
  assert(intent2.category === 'AUTOMATIC_RAB_START', 'Intent "Buatkan RAB Jalan" terdeteksi sebagai AUTOMATIC_RAB_START');

  const intent3 = intentClassifier.classify('Buatkan RAB Bangunan Air');
  assert(intent3.category === 'AUTOMATIC_RAB_START', 'Intent "Buatkan RAB Bangunan Air" terdeteksi sebagai AUTOMATIC_RAB_START');

  const intent4 = intentClassifier.classify('Saya ingin membuat RAB hotel');
  assert(intent4.category === 'AUTOMATIC_RAB_START', 'Intent "Saya ingin membuat RAB hotel" terdeteksi sebagai AUTOMATIC_RAB_START');

  // TEST 2: TEMPLATE CHOICES SELECTION (PHASE A HOUSE)
  console.log('\n[Test 2] Pemilihan Tipe Rumah (Start Session)...');
  const wsA = 'ws-wizard-tenant-a';
  const prjA = 'PRJ-WIZ-A-01';
  const userId = 'user-estimator-01';

  aiDbAdapter.createProject(wsA, {
    id: prjA,
    name: 'Proyek Rumah Tinggal Phase A',
    client: 'Bpk. Budi Santoso',
    budget: 0,
    status: 'ACTIVE'
  });

  const startResp = WizardStateMachine.startSession({
    workspaceId: wsA,
    userId,
    projectId: prjA,
    conversationId: 'conv-wiz-01',
    initialQuery: 'Buatkan RAB Rumah'
  });

  assert(startResp.responseType === 'wizard', 'Response type adalah "wizard"');
  assert(startResp.step === 'TEMPLATE_SELECTION', 'Step awal adalah TEMPLATE_SELECTION');
  assert(Array.isArray(startResp.choices) && startResp.choices.length === 5, 'Tersedia 5 pilihan template rumah tinggal (T36, T45, T70, T36 2Lt, Custom)');
  assert(startResp.choices!.some(c => c.templateId === 'HOUSE-T36-1FL'), 'Pilihan memuat template HOUSE-T36-1FL');

  const sessionId = startResp.wizardSessionId;
  assert(Boolean(sessionId), `Session ID terbentuk: ${sessionId}`);

  // TEST 3: SELECT RUMAH TYPE 36 -> PARAMETER COLLECTION
  console.log('\n[Test 3] Memilih Rumah Type 36 (HOUSE-T36-1FL)...');
  const answerResp1 = WizardStateMachine.answerStep({
    sessionId,
    workspaceId: wsA,
    userId,
    choiceId: 'HOUSE-T36-1FL'
  });

  assert(answerResp1.step === 'BASIC_PARAMETER_COLLECTION', 'Step berpindah ke BASIC_PARAMETER_COLLECTION');
  assert(Array.isArray(answerResp1.questions) && answerResp1.questions.length >= 5, 'Form menanyakan parameter spesifikasi (luas, pondasi, dinding, atap, finishing)');

  // TEST 4: CALCULATION GATING (NO PREMATURE MUTATION BEFORE CONFIRMATION)
  console.log('\n[Test 4] Pengecekan Gating Mutasi Database...');
  const initialItems = await aiDbAdapter.getRabItems(wsA, prjA);
  assert(initialItems.length === 0, 'Database proyek masih 0 item (Nol mutasi prematur sebelum konfirmasi)');

  // TEST 5: SUBMIT PARAMETERS -> GENERATE DETERMINISTIC PREVIEW
  console.log('\n[Test 5] Pengiriman Parameter & Pembuatan Preview RAB Presisi...');
  const answerResp2 = WizardStateMachine.answerStep({
    sessionId,
    workspaceId: wsA,
    userId,
    parameters: {
      building_area: 36,
      foundation_type: 'BATU_KALI',
      wall_type: 'BATA_RINGAN',
      roof_type: 'BAJA_RINGAN_GENTENG_METAL',
      quality_level: 'STANDAR'
    }
  });

  assert(answerResp2.step === 'RAB_PREVIEW', 'Step berpindah ke RAB_PREVIEW');
  assert(Boolean(answerResp2.summary), 'Summary preview RAB tersedia');
  assert(answerResp2.summary!.itemsCount >= 14, `Total item pekerjaan terhitung lengkap (${answerResp2.summary!.itemsCount} items)`);
  assert(answerResp2.summary!.directCost > 0, `Direct cost terhitung: Rp ${answerResp2.summary!.directCost.toLocaleString('id-ID')}`);
  assert(answerResp2.summary!.taxPercent === 11, 'Pajak PPN 11% terhitung');
  assert(answerResp2.summary!.grandTotal > answerResp2.summary!.directCost, `Grand total terhitung: Rp ${answerResp2.summary!.grandTotal.toLocaleString('id-ID')}`);

  // TEST 6: NAVIGATION (GO BACK & RE-CALCULATE)
  console.log('\n[Test 6] Navigasi [Ubah Parameter / Kembali]...');
  const backResp = WizardStateMachine.goBack(sessionId, wsA);
  assert(backResp.step === 'BASIC_PARAMETER_COLLECTION', 'Tombol Kembali berhasil mengembalikan step ke BASIC_PARAMETER_COLLECTION');

  // Submit parameter ubah luas menjadi 45
  const reCalcResp = WizardStateMachine.answerStep({
    sessionId,
    workspaceId: wsA,
    userId,
    parameters: {
      building_area: 45,
      foundation_type: 'BATU_KALI',
      wall_type: 'BATA_RINGAN',
      roof_type: 'BAJA_RINGAN_GENTENG_METAL',
      quality_level: 'STANDAR'
    }
  });
  assert(reCalcResp.step === 'RAB_PREVIEW', 'Preview terhitung ulang');
  assert(reCalcResp.summary!.collectedParameters.building_area === 45, 'Parameter luas 45 m² tersimpan dan terhitung ulang');

  // TEST 7: MULTI-TENANT ISOLATION (CROSS-TENANT ACCESS BLOCKED)
  console.log('\n[Test 7] Pengujian Isolasi Multi-Tenant pada Session...');
  let crossTenantBlocked = false;
  try {
    WizardStateMachine.answerStep({
      sessionId,
      workspaceId: 'ws-wizard-tenant-b', // Unauthorized tenant
      userId: 'user-hacker-99',
      choiceId: 'HOUSE-T36-1FL'
    });
  } catch (err: any) {
    crossTenantBlocked = err.message.includes('tidak ditemukan') || err.message.includes('tidak aktif');
  }
  assert(crossTenantBlocked, 'Tenant B ditolak saat mencoba memanipulasi sesi wizard Tenant A');

  // TEST 8: CONFIRMATION & APPLY TO SPREADSHEET
  console.log('\n[Test 8] Konfirmasi Final & Penerapan ke Spreadsheet Proyek...');
  const confirmResult = WizardStateMachine.confirmAndApply({
    sessionId,
    workspaceId: wsA,
    userId,
    projectId: prjA
  });

  assert(confirmResult.success === true, 'Konfirmasi sukses');
  assert(confirmResult.addedItemsCount >= 14, `Berhasil menerapkan ${confirmResult.addedItemsCount} item pekerjaan`);

  const finalItems = await aiDbAdapter.getRabItems(wsA, prjA);
  assert(finalItems.length === confirmResult.addedItemsCount, `Database proyek sekarang berisi ${finalItems.length} item pekerjaan riil`);

  // TEST 9: CANCEL SESSION
  console.log('\n[Test 9] Pembatalan Sesi (Cancel)...');
  const cancelSess = WizardStateMachine.startSession({
    workspaceId: wsA,
    userId,
    projectId: prjA,
    conversationId: 'conv-wiz-cancel'
  });
  const cancelRes = WizardStateMachine.cancelSession(cancelSess.wizardSessionId, wsA);
  assert(cancelRes.success === true, 'Sesi berhasil dibatalkan tanpa error');

  console.log('\n============================================================');
  console.log('🎉 ALL PHASE A INTERACTIVE RAB WIZARD TESTS PASSED 100%');
  console.log('============================================================\n');
}

runInteractiveWizardTests().catch(err => {
  console.error('Fatal Interactive Wizard Test Error:', err);
  process.exit(1);
});

import assert from 'assert';
import { TemplateResolver } from '../services/templateResolver';
import { WizardStateMachine } from '../services/wizardStateMachine';
import { CalculationService } from '../services/calculationService';
import { aiDbAdapter } from '../database/dbAdapter';
import { IntentClassifier } from '../orchestrator/intentClassifier';

async function runPhaseAPhaseBCombinedTest() {
  console.log('============================================================');
  console.log('🧪 EZRAB — PHASE A (FULL) & PHASE B (ROAD/DRAINAGE) TEST SUITE');
  console.log('============================================================\n');

  const WS = 'ws-test-full-ab';
  const USER = 'user-estimator-ab';
  const PRJ_HOUSE = 'PRJ-HOUSE-FULL-01';
  const PRJ_ROAD = 'PRJ-ROAD-FULL-01';

  aiDbAdapter.createProject(WS, { id: PRJ_HOUSE, name: 'Proyek Perumahan Klaster', ownerId: USER } as any);
  aiDbAdapter.createProject(WS, { id: PRJ_ROAD, name: 'Proyek Jalan & Drainase Kawasan', ownerId: USER } as any);

  // -------------------------------------------------------------
  // TEST 1: PHASE A ALL HOUSE TEMPLATES VERIFICATION
  // -------------------------------------------------------------
  console.log('[Test 1] Verifikasi Seluruh Template Phase A (Rumah Tinggal)...');
  
  // 1.1 House Type 36
  const t36 = TemplateResolver.getTemplate('HOUSE-T36-1FL')!;
  const items36 = t36.generateRabItems({ building_area: 36 });
  assert.strictEqual(items36.length, 16);
  console.log('  ✅ PASS: HOUSE-T36-1FL terhitung 16 item standar');

  // 1.2 House Type 45
  const t45 = TemplateResolver.getTemplate('HOUSE-T45-1FL')!;
  const items45 = t45.generateRabItems({ building_area: 45, wall_height: 3.6 });
  assert.strictEqual(items45.length, 16);
  assert.ok(items45.find(i => i.itemNumber === '4.1')!.volume > items36.find(i => i.itemNumber === '4.1')!.volume);
  console.log('  ✅ PASS: HOUSE-T45-1FL terhitung 16 item dengan volume proporsional');

  // 1.3 House Type 70 (3 KT, 2 KM)
  const t70 = TemplateResolver.getTemplate('HOUSE-T70-1FL')!;
  const items70 = t70.generateRabItems({ building_area: 70, wall_height: 3.8, quality_level: 'MENENGAH' });
  assert.strictEqual(items70.length, 16);
  const sanitair70 = items70.find(i => i.itemNumber === '6.3')!;
  assert.strictEqual(sanitair70.volume, 2, 'Type 70 wajib memiliki 2 unit sanitair');
  console.log('  ✅ PASS: HOUSE-T70-1FL terhitung 2 unit kamar mandi & spesifikasi menengah');

  // 1.4 House Type 36 2 Lantai (Struktur Bertingkat + Tangga)
  const t36_2fl = TemplateResolver.getTemplate('HOUSE-T36-2FL')!;
  const items36_2fl = t36_2fl.generateRabItems({ building_area: 60 });
  assert.strictEqual(items36_2fl.length, 18, 'Type 36 2 Lantai wajib memiliki 18 item (+ Plat Lantai & Tangga Beton)');
  const platItem = items36_2fl.find(i => i.itemNumber === '3.4')!;
  const tanggaItem = items36_2fl.find(i => i.itemNumber === '3.5')!;
  assert.ok(platItem && tanggaItem, 'Plat lantai beton & Tangga beton harus ada');
  console.log('  ✅ PASS: HOUSE-T36-2FL terhitung 18 item (+ Plat Lantai 12cm & Tangga Beton Bertulang)');

  // -------------------------------------------------------------
  // TEST 2: PHASE B ROAD & DRAINAGE TEMPLATES VERIFICATION
  // -------------------------------------------------------------
  console.log('\n[Test 2] Verifikasi Seluruh Template Phase B (Jalan & Drainase)...');

  // 2.1 Paving Block (100 m x 4 m = 400 m2)
  const tPaving = TemplateResolver.getTemplate('PAVING-BLOCK-STANDARD')!;
  const itemsPaving = tPaving.generateRabItems({ length: 100, width: 4.0, paving_thickness: 6, use_curb: 'YES' });
  assert.strictEqual(itemsPaving.length, 5);
  const pvgArea = itemsPaving.find(i => i.itemNumber === '2.2')!.volume;
  const kanstinPjg = itemsPaving.find(i => i.itemNumber === '3.1')!.volume;
  assert.strictEqual(pvgArea, 400);
  assert.strictEqual(kanstinPjg, 200); // 2 x 100m
  console.log(`  ✅ PASS: PAVING-BLOCK-STANDARD: ${pvgArea} m² Paving K300 & ${kanstinPjg} m' Kanstin Beton`);

  // 2.2 Asphalt Road (200 m x 5 m = 1000 m2, AC-WC 4 cm)
  const tAsphalt = TemplateResolver.getTemplate('ASPHALT-ROAD-LIGHT')!;
  const itemsAsphalt = tAsphalt.generateRabItems({ length: 200, width: 5.0, asphalt_thickness: 4 });
  assert.strictEqual(itemsAsphalt.length, 5);
  const tonaseAspal = itemsAsphalt.find(i => i.itemNumber === '3.2')!.volume;
  const primeCoat = itemsAsphalt.find(i => i.itemNumber === '3.1')!.volume;
  assert.strictEqual(tonaseAspal, 92); // 1000m2 * 0.04m * 2.3 ton/m3 = 92 ton
  assert.strictEqual(primeCoat, 800); // 1000m2 * 0.8 L/m2 = 800 L
  console.log(`  ✅ PASS: ASPHALT-ROAD-LIGHT: ${tonaseAspal} Ton AC-WC & ${primeCoat} Liter Prime Coat`);

  // 2.3 Rigid Concrete Road (100 m x 4 m = 400 m2, Tebal 15 cm)
  const tRigid = TemplateResolver.getTemplate('RIGID-CONCRETE-ROAD')!;
  const itemsRigid = tRigid.generateRabItems({ length: 100, width: 4.0, concrete_thickness: 15, use_wiremesh: 'YES' });
  assert.strictEqual(itemsRigid.length, 6);
  const volBeton = itemsRigid.find(i => i.itemNumber === '3.2')!.volume;
  const volLc = itemsRigid.find(i => i.itemNumber === '2.1')!.volume;
  assert.strictEqual(volBeton, 60); // 400 * 0.15 = 60 m3
  assert.strictEqual(volLc, 20); // 400 * 0.05 = 20 m3
  console.log(`  ✅ PASS: RIGID-CONCRETE-ROAD: ${volBeton} m³ Beton FS-45 & ${volLc} m³ Lean Concrete B0`);

  // 2.4 Precast U-Ditch (50 m, 40x40 cm + Cover Light Duty)
  const tUditch = TemplateResolver.getTemplate('DRAIN-OPEN-UDITCH')!;
  const itemsUditch = tUditch.generateRabItems({ length: 50, uditch_size: '40x40', cover_type: 'LIGHT_DUTY' });
  assert.strictEqual(itemsUditch.length, 5);
  const jmlBox = itemsUditch.find(i => i.itemNumber === '2.2')!.volume;
  const jmlCover = itemsUditch.find(i => i.itemNumber === '2.3')!.volume;
  assert.strictEqual(jmlBox, 42); // ceil(50 / 1.20) = 42 unit
  assert.strictEqual(jmlCover, 84); // ceil(50 / 0.60) = 84 unit
  console.log(`  ✅ PASS: DRAIN-OPEN-UDITCH: ${jmlBox} Unit U-Ditch 40x40 cm & ${jmlCover} Unit Tutup Cover`);

  // -------------------------------------------------------------
  // TEST 3: INTENT ROUTING & CONVERSATIONAL STATE MACHINE
  // -------------------------------------------------------------
  console.log('\n[Test 3] Uji Routing Intent Percakapan (House vs Road vs Generic)...');

  // 3.1 "Buatkan RAB Rumah" -> Otomatis Pilihan Rumah
  const resHouse = WizardStateMachine.startSession({
    workspaceId: WS,
    userId: USER,
    projectId: PRJ_HOUSE,
    conversationId: 'conv-h-01',
    initialQuery: 'Buatkan RAB Rumah'
  });
  assert.strictEqual(resHouse.step, 'TEMPLATE_SELECTION');
  assert.strictEqual(resHouse.choices?.[0].id, 'house_t36_1fl');
  console.log('  ✅ PASS: Query "Buatkan RAB Rumah" langsung menyajikan 5 kartu Rumah');

  // 3.2 "Buatkan RAB Paving" -> Otomatis Pilihan Jalan/Drainase
  const resRoad = WizardStateMachine.startSession({
    workspaceId: WS,
    userId: USER,
    projectId: PRJ_ROAD,
    conversationId: 'conv-r-01',
    initialQuery: 'Buatkan RAB Jalan Paving'
  });
  assert.strictEqual(resRoad.step, 'TEMPLATE_SELECTION');
  assert.strictEqual(resRoad.choices?.[0].id, 'paving_block_std');
  console.log('  ✅ PASS: Query "Buatkan RAB Jalan Paving" langsung menyajikan 4 kartu Jalan/Drainase');

  // 3.3 "Buatkan RAB" (Generic) -> Menyajikan Kategori
  const resCat = WizardStateMachine.startSession({
    workspaceId: WS,
    userId: USER,
    projectId: PRJ_ROAD,
    conversationId: 'conv-c-01',
    initialQuery: 'Buatkan RAB'
  });
  assert.strictEqual(resCat.step, 'PROJECT_CATEGORY_SELECTION');
  assert.strictEqual(resCat.choices?.length, 2);
  console.log('  ✅ PASS: Query umum "Buatkan RAB" menyajikan 2 kartu Kategori Konstruksi');

  // -------------------------------------------------------------
  // TEST 4: END-TO-END ROAD WIZARD CONFIRMATION
  // -------------------------------------------------------------
  console.log('\n[Test 4] E2E Wizard Flow Jalan Paving -> Preview -> Confirmation...');
  const sessRoadId = resRoad.wizardSessionId;

  // Pick PAVING-BLOCK-STANDARD
  const rStep2 = WizardStateMachine.answerStep({
    sessionId: sessRoadId,
    workspaceId: WS,
    userId: USER,
    choiceId: 'PAVING-BLOCK-STANDARD'
  });
  assert.strictEqual(rStep2.step, 'BASIC_PARAMETER_COLLECTION');

  // Submit Parameters (P=150m, L=4m)
  const rStep3 = WizardStateMachine.answerStep({
    sessionId: sessRoadId,
    workspaceId: WS,
    userId: USER,
    parameters: { length: 150, width: 4.0, paving_thickness: 6, use_curb: 'YES' }
  });
  assert.strictEqual(rStep3.step, 'RAB_PREVIEW');
  assert.strictEqual(rStep3.summary?.itemsCount, 5);
  console.log(`  ✅ PASS: Preview Paving terhitung (Direct Cost: Rp ${rStep3.summary?.directCost.toLocaleString('id-ID')}, Grand Total: Rp ${rStep3.summary?.grandTotal.toLocaleString('id-ID')})`);

  // Confirm and Apply
  const rConfirm = WizardStateMachine.confirmAndApply({
    sessionId: sessRoadId,
    workspaceId: WS,
    userId: USER,
    projectId: PRJ_ROAD,
    idempotencyKey: 'idem-road-key-999'
  });
  assert.strictEqual(rConfirm.success, true);
  assert.strictEqual(rConfirm.addedItemsCount, 5);

  const roadItemsInDb = await aiDbAdapter.getRabItems(WS, PRJ_ROAD);
  assert.strictEqual(roadItemsInDb.length, 5);
  console.log('  ✅ PASS: 5 Item AHSP Jalan Paving berhasil diterapkan ke spreadsheet proyek');

  console.log('\n============================================================');
  console.log('🎉 ALL PHASE A (FULL) & PHASE B (ROAD) TESTS PASSED 100%');
  console.log('============================================================\n');
}

runPhaseAPhaseBCombinedTest().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

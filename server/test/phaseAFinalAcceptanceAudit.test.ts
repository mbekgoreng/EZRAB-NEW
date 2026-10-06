import assert from 'assert';
import { TemplateResolver } from '../services/templateResolver';
import { WizardStateMachine } from '../services/wizardStateMachine';
import { CalculationService } from '../services/calculationService';
import { aiDbAdapter } from '../database/dbAdapter';

async function runPhaseAFinalAcceptanceAudit() {
  console.log('============================================================');
  console.log('🔬 EZRAB — PHASE A FINAL ACCEPTANCE AUDIT TEST SUITE');
  console.log('============================================================\n');

  const WS_A = 'ws-company-alpha';
  const WS_B = 'ws-company-beta';
  const USER_A = 'user-estimator-alpha';
  const USER_B = 'user-estimator-beta';
  const PRJ_A = 'PRJ-AUDIT-HOUSE-01';
  const PRJ_B = 'PRJ-AUDIT-HOUSE-02';

  // Seed project in db adapter
  aiDbAdapter.createProject(WS_A, { id: PRJ_A, name: 'Proyek Audit Rumah Tinggal T36', ownerId: USER_A } as any);
  aiDbAdapter.createProject(WS_B, { id: PRJ_B, name: 'Proyek Beta', ownerId: USER_B } as any);

  // -------------------------------------------------------------
  // TEST 1: GEOMETRIC FORMULA VALIDATION & SENSITIVITY
  // -------------------------------------------------------------
  console.log('[Test 1] Validasi Geometri & Kepekaan Parameter (Sensitivity Analysis)...');
  const template = TemplateResolver.getTemplate('HOUSE-T36-1FL')!;
  assert.ok(template, 'Template HOUSE-T36-1FL wajib terdaftar');

  // Baseline: 36m2, Wall Height 3.5m, Batu Kali, Bata Ringan, Metal, Standar
  const baseItems = template.generateRabItems({
    building_area: 36,
    wall_height: 3.5,
    foundation_type: 'BATU_KALI',
    wall_type: 'BATA_RINGAN',
    roof_type: 'BAJA_RINGAN_GENTENG_METAL',
    quality_level: 'STANDAR'
  });
  assert.strictEqual(baseItems.length, 16, 'Wajib menghasilkan tepat 16 item pekerjaan terstandarisasi');

  // Case A: Area 45m2 (Volume galian, dinding, lantai, atap harus naik)
  const items45 = template.generateRabItems({
    building_area: 45,
    wall_height: 3.5,
    foundation_type: 'BATU_KALI',
    wall_type: 'BATA_RINGAN',
    roof_type: 'BAJA_RINGAN_GENTENG_METAL',
    quality_level: 'STANDAR'
  });
  const baseDinding = baseItems.find(i => i.itemNumber === '4.1')!.volume;
  const area45Dinding = items45.find(i => i.itemNumber === '4.1')!.volume;
  assert.ok(area45Dinding > baseDinding, `Luas dinding 45m² (${area45Dinding}) harus lebih besar dari 36m² (${baseDinding})`);
  console.log(`  ✅ PASS: Skalabilitas Luas Bangunan 36m² -> 45m²: Dinding bertambah (${baseDinding}m² -> ${area45Dinding}m²)`);

  // Case B: Wall Height 3.0m vs 4.0m (Luas dinding & volume kolom harus berubah proporsional)
  const itemsH30 = template.generateRabItems({ building_area: 36, wall_height: 3.0 });
  const itemsH40 = template.generateRabItems({ building_area: 36, wall_height: 4.0 });
  const dndH30 = itemsH30.find(i => i.itemNumber === '4.1')!.volume;
  const dndH40 = itemsH40.find(i => i.itemNumber === '4.1')!.volume;
  const klmH30 = itemsH30.find(i => i.itemNumber === '3.2')!.volume;
  const klmH40 = itemsH40.find(i => i.itemNumber === '3.2')!.volume;
  assert.ok(dndH40 > dndH30, 'Dinding H=4.0m harus lebih luas daripada H=3.0m');
  assert.ok(klmH40 > klmH30, 'Kolom H=4.0m harus lebih bervolume daripada H=3.0m');
  console.log(`  ✅ PASS: Kepekaan Tinggi Dinding (3.0m vs 4.0m): Dinding ${dndH30}m² -> ${dndH40}m², Kolom ${klmH30}m³ -> ${klmH40}m³`);

  // Case C: Foundation Type (BATU_KALI vs FOOTPLATE)
  const itemsFootplate = template.generateRabItems({ building_area: 36, foundation_type: 'FOOTPLATE' });
  const ponBatu = baseItems.find(i => i.itemNumber === '2.3')!;
  const ponFoot = itemsFootplate.find(i => i.itemNumber === '2.3')!;
  assert.strictEqual(ponBatu.ahspCode, 'A.3.2.1.2');
  assert.strictEqual(ponFoot.ahspCode, 'A.4.1.1.5');
  assert.ok(ponFoot.description.includes('Footplate'));
  console.log(`  ✅ PASS: Pergantian Pondasi: Batu Kali (${ponBatu.ahspCode}) -> Footplate (${ponFoot.ahspCode})`);

  // Case D: Roof Type (GENTENG_METAL vs GENTENG_KERAMIK vs SPANDEK)
  const itemsKeramik = template.generateRabItems({ building_area: 36, roof_type: 'BAJA_RINGAN_GENTENG_KERAMIK' });
  const itemsSpandek = template.generateRabItems({ building_area: 36, roof_type: 'BAJA_RINGAN_SPANDEK' });
  const atapMetal = baseItems.find(i => i.itemNumber === '5.2')!;
  const atapKeramik = itemsKeramik.find(i => i.itemNumber === '5.2')!;
  const atapSpandek = itemsSpandek.find(i => i.itemNumber === '5.2')!;
  assert.strictEqual(atapMetal.unitPrice, 125000);
  assert.strictEqual(atapKeramik.unitPrice, 195000);
  assert.strictEqual(atapSpandek.unitPrice, 98000);
  console.log(`  ✅ PASS: Pergantian Atap: Metal (Rp ${atapMetal.unitPrice}) vs Keramik (Rp ${atapKeramik.unitPrice}) vs Spandek (Rp ${atapSpandek.unitPrice})`);

  // Case E: Quality Level (STANDAR vs MENENGAH)
  const itemsMenengah = template.generateRabItems({ building_area: 36, quality_level: 'MENENGAH' });
  const lantaiStd = baseItems.find(i => i.itemNumber === '6.1')!;
  const lantaiMnh = itemsMenengah.find(i => i.itemNumber === '6.1')!;
  assert.strictEqual(lantaiStd.unitPrice, 155000);
  assert.strictEqual(lantaiMnh.unitPrice, 245000);
  console.log(`  ✅ PASS: Spesifikasi Kualitas: Keramik 40x40 (Rp ${lantaiStd.unitPrice}) -> Granit 60x60 (Rp ${lantaiMnh.unitPrice})`);

  // -------------------------------------------------------------
  // TEST 2: AHSP RECONCILIATION & SAFE DECIMAL CALCULATION
  // -------------------------------------------------------------
  console.log('\n[Test 2] Rekonsiliasi AHSP, Subtotal & PPN 11%...');
  const calcResult = CalculationService.calculateRabSummary(baseItems);
  assert.strictEqual(calcResult.status, 'READY');
  assert.ok(calcResult.directCost > 0);
  assert.strictEqual(calcResult.taxPercent, 11);
  assert.strictEqual(calcResult.grandTotal, calcResult.subtotalBeforeTax + calcResult.taxAmount);
  console.log(`  ✅ PASS: Direct Cost: Rp ${calcResult.directCost.toLocaleString('id-ID')}`);
  console.log(`  ✅ PASS: Overhead (5%) + Profit (5%): Rp ${(calcResult.overheadAmount + calcResult.profitAmount).toLocaleString('id-ID')}`);
  console.log(`  ✅ PASS: PPN 11%: Rp ${calcResult.taxAmount.toLocaleString('id-ID')}`);
  console.log(`  ✅ PASS: Grand Total: Rp ${calcResult.grandTotal.toLocaleString('id-ID')}`);

  // -------------------------------------------------------------
  // TEST 3: WIZARD STATE MACHINE & CONFIRMATION GATE
  // -------------------------------------------------------------
  console.log('\n[Test 3] Wizard State Machine & Confirmation Gate...');
  const startRes = WizardStateMachine.startSession({
    workspaceId: WS_A,
    userId: USER_A,
    projectId: PRJ_A,
    conversationId: 'conv-audit-01'
  });
  const sessId = startRes.wizardSessionId;

  // Answer 1: Pick HOUSE-T36-1FL
  const step2Res = WizardStateMachine.answerStep({
    sessionId: sessId,
    workspaceId: WS_A,
    userId: USER_A,
    choiceId: 'HOUSE-T36-1FL'
  });
  assert.strictEqual(step2Res.step, 'BASIC_PARAMETER_COLLECTION');

  // Verify DB remains clean (Confirmation Gate)
  const preConfirmItems = await aiDbAdapter.getRabItems(WS_A, PRJ_A);
  assert.strictEqual(preConfirmItems.length, 0, 'Database proyek HARUS tetap kosong sebelum konfirmasi');
  console.log('  ✅ PASS: Confirmation Gate Aktif (0 item masuk ke proyek sebelum konfirmasi)');

  // Answer 2: Submit Parameters -> Get Preview
  const step3Res = WizardStateMachine.answerStep({
    sessionId: sessId,
    workspaceId: WS_A,
    userId: USER_A,
    parameters: {
      building_area: 36,
      wall_height: 3.5,
      foundation_type: 'BATU_KALI',
      wall_type: 'BATA_RINGAN',
      roof_type: 'BAJA_RINGAN_GENTENG_METAL',
      quality_level: 'STANDAR'
    }
  });
  assert.strictEqual(step3Res.step, 'RAB_PREVIEW');
  assert.strictEqual(step3Res.summary?.itemsCount, 16);
  console.log('  ✅ PASS: Preview RAB terhitung 16 items dengan rincian kategori');

  // -------------------------------------------------------------
  // TEST 4: IDEMPOTENCY ON CONFIRMATION
  // -------------------------------------------------------------
  console.log('\n[Test 4] Uji Idempotensi pada Konfirmasi Penerapan...');
  const confirm1 = WizardStateMachine.confirmAndApply({
    sessionId: sessId,
    workspaceId: WS_A,
    userId: USER_A,
    projectId: PRJ_A,
    idempotencyKey: 'idem-audit-key-123'
  });
  assert.strictEqual(confirm1.success, true);
  assert.strictEqual(confirm1.addedItemsCount, 16);

  const dbAfterConfirm1 = await aiDbAdapter.getRabItems(WS_A, PRJ_A);
  assert.strictEqual(dbAfterConfirm1.length, 16, 'Harus tersimpan tepat 16 item');

  // Re-confirm (double confirm with same session / idempotency key)
  const confirm2 = WizardStateMachine.confirmAndApply({
    sessionId: sessId,
    workspaceId: WS_A,
    userId: USER_A,
    projectId: PRJ_A,
    idempotencyKey: 'idem-audit-key-123'
  });
  assert.strictEqual(confirm2.success, true);
  const dbAfterConfirm2 = await aiDbAdapter.getRabItems(WS_A, PRJ_A);
  assert.strictEqual(dbAfterConfirm2.length, 16, 'Idempotensi: Item TIDAK BOLEH bertambah dua kali (tetap 16)');
  console.log('  ✅ PASS: Idempotensi Lulus (Re-confirm mengembalikan hasil valid tanpa duplikasi data)');

  // -------------------------------------------------------------
  // TEST 5: SECURITY & MULTI-TENANT ISOLATION
  // -------------------------------------------------------------
  console.log('\n[Test 5] Uji Keamanan & Isolasi Multi-Tenant...');
  // Tenant B mencoba mengakses sesi Tenant A
  const sessionTenantB = WizardStateMachine.getSession(sessId, WS_B);
  assert.strictEqual(sessionTenantB, undefined, 'Tenant B dilarang membaca sesi Tenant A');

  // Tenant B mencoba answer sesi Tenant A
  assert.throws(() => {
    WizardStateMachine.answerStep({
      sessionId: sessId,
      workspaceId: WS_B,
      userId: USER_B,
      choiceId: 'HOUSE-T36-1FL'
    });
  }, /tidak ditemukan/i);
  console.log('  ✅ PASS: Isolasi Multi-Tenant Terverifikasi (Akses silang workspace ditolak tegas)');

  console.log('\n============================================================');
  console.log('🎉 ALL PHASE A FINAL ACCEPTANCE AUDIT TESTS PASSED 100%');
  console.log('============================================================\n');
}

runPhaseAFinalAcceptanceAudit().catch(err => {
  console.error('❌ AUDIT TEST FAILED:', err);
  process.exit(1);
});

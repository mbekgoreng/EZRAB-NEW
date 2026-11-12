/**
 * EZRAB — AI INTELLIGENCE OVERHAUL, FASE 6: PERSISTENT RUNTIME & RECOVERY
 * — TEST SUITE F6 (verifikasi + perluasan, BUKAN rebuild).
 *
 * Membuktikan, di atas fondasi yang ADA (gelombang lifecycle,
 * Gate 1–6 Integrasi, Fase 3 orkestrator, Fase 5 registry):
 *
 *  (L) Jaminan lifecycle pasca-Integrasi masih berlaku penuh pada
 *      runtime + registry yang sekarang (navigasi/reload/Stop/
 *      idempotensi; penulis snapshot registry di titik commit;
 *      ARS-08 tetap terbuka by design — BUKAN diperbaiki di sini).
 *  (S) Status langkah rencana di panel TERSINKRON sesudah eksekusi
 *      registry (celah Fase 5 §2.4/§11.2): sukses / selesai-sebagian /
 *      gagal / terhenti + alasan — termasuk aturan kejujuran
 *      transfer-draft (readiness check sukses ≠ transfer selesai)
 *      dan penandaan langkah transfer sesudah push-rab terverifikasi.
 *      Semantik approval gate TIDAK berubah.
 *  (P) Keputusan planned/ready (Fase 5 §3): dua siklus dibedakan
 *      dengan bukti — siklus eksekusi TOOL (registry) tidak pernah
 *      mengemisikan planned/ready (eksekutor sinkron langsung ke
 *      running), sedangkan siklus LANGKAH RENCANA (orkestrator)
 *      memakai keduanya secara hidup. Eksekutor async TIDAK dibangun:
 *      tidak ada eksekusi tool yang berjalan lintas navigasi/reload
 *      (semua invoke lokal + sinkron; satu-satunya operasi panjang
 *      adalah panggilan LLM yang dimiliki executionRuntime), rencana
 *      sendiri sudah dipersist dengan statusnya, dan job store server
 *      secara eksplisit di luar pagar (keputusan owner §17 butir 8).
 *  (D) Asersi sumber: tanpa fetch/provider di jalur sinkronisasi dan
 *      runtime; gate persetujuan tetap hanya dari user.
 *
 * Kelas bukti: mock terkendali (localStorage shim; provider nyata
 * NOT RUN — 0 panggilan; UI browser dibuktikan E2E terpisah).
 * Jalankan: npx --yes tsx src/test/chatPersistentRuntimePhase6.test.ts
 */

import { strict as assert } from 'assert';
import { readFileSync } from 'node:fs';
import {
  beginExecution,
  finishExecution,
  cancelExecution,
  getActiveExecution,
  getLastExecution,
  subscribeExecution,
  __resetExecutionRuntimeForTests,
} from '../ai-tools/ezrab-ai/executionRuntime';
import {
  deriveObjective,
  buildPlanForObjective,
  savePlan,
  loadPlan,
  approveStep,
  executeStep,
  retryStep,
  nextReadyStep,
  applyRegistryOutcomeToStep,
  markTransferStepCompleted,
  type TaskPlan,
  type PlanStepKind,
} from '../ai-tools/ezrab-ai/agentOrchestrator';
import {
  executeTool,
  runPlanStepWithRegistry,
  listToolExecutions,
  getToolDefinition,
  __resetToolRegistryForTests,
} from '../ai-tools/ezrab-ai/toolRegistry';
import {
  buildUniversalDraft,
  setLastUniversalDraft,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import { unifiedConversationStore } from '../services/ai/conversation/unifiedConversationStore';

/* ---------------- localStorage shim (pola Fase 2/3/4/5) ---------------- */
const store: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
(globalThis as { window?: unknown }).window = globalThis;

const PROJ = 'proj-f6';
const CONV = 'conv-f6';
const CONV_B = 'conv-f6-b';

function resetAll(): void {
  for (const k of Object.keys(store)) delete store[k];
  __resetToolRegistryForTests();
  __resetExecutionRuntimeForTests();
  setLastUniversalDraft(null);
}

/** Simulasi reload: singleton in-memory mati, storage utuh (pola 5A). */
function simulateReload(): void {
  setLastUniversalDraft(null);
  __resetExecutionRuntimeForTests();
}

const read = (rel: string): string => readFileSync(`${process.cwd()}/${rel}`, 'utf-8');

/* ---------------- runner (pola C4/T5) ---------------- */
let passed = 0;
let failed = 0;
const failedNames: string[] = [];
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((e) => {
      failed += 1;
      failedNames.push(name);
      console.log(`  ✗ ${name} — ${(e as Error).message}`);
    });
}

const DRAFT_TEXT = 'Buatkan RAB kandang sapi 20 ekor ukuran 17 x 9 m atap Galvalum budget 300 juta';

function kandangPlan(): TaskPlan {
  const obj = deriveObjective('Saya mau bangun kandang sapi 20 ekor, ukuran 17 m x 9 m, atap Galvalum, budget 300 jt', 'CREATE_RAB_SUMMARY');
  return buildPlanForObjective(obj, { userId: null, projectId: PROJ, conversationId: CONV });
}

function stepOf(plan: TaskPlan, kind: PlanStepKind) {
  const s = plan.steps.find((x) => x.kind === kind);
  assert.ok(s, `langkah ${kind} ada di rencana`);
  return s!;
}

function houseDraft(projectId: string | null = PROJ): UniversalDraft {
  const res = buildUniversalDraft(DRAFT_TEXT, undefined, { projectId });
  assert.equal(res.kind, 'draft', 'fixture kandang harus menghasilkan draft');
  return (res as { draft: UniversalDraft }).draft;
}

/** Rencana kandang dengan langkah transfer sudah disetujui user (status ready). */
function approvedTransferPlan(): TaskPlan {
  const plan = kandangPlan();
  const t = stepOf(plan, 'transfer-draft');
  const r = approveStep(plan, t.id, 'user');
  assert.equal(r.ok, true, 'approveStep user harus ok');
  return r.plan;
}

async function main(): Promise<void> {
  console.log('chatPersistentRuntimePhase6.test (OVERHAUL FASE 6)');

  // ============ (L) JAMINAN LIFECYCLE PASCA-INTEGRASI ============
  await test('F6-L1 navigasi SPA tidak membatalkan eksekusi (unsubscribe → generating, signal utuh)', () => {
    resetAll();
    const h = beginExecution(CONV, PROJ);
    let seen: string[] = [];
    const unsub = subscribeExecution(CONV, (rec) => { if (rec) seen.push(rec.status); });
    unsub(); // simulasi unmount komponen saat navigasi
    const active = getActiveExecution(CONV);
    assert.ok(active, 'eksekusi tetap aktif sesudah unsubscribe');
    assert.equal(active!.status, 'generating', 'status tetap generating');
    assert.equal(h.signal.aborted, false, 'signal tidak di-abort oleh unsubscribe');
    assert.ok(seen.includes('generating'), 'langganan sempat menerima generating');
    const done = finishExecution(h.record.requestId, 'completed');
    assert.equal(done?.status, 'completed', 'eksekusi dapat selesai normal sesudah navigasi');
  });

  await test('F6-L2 submit baru menggantikan (superseded) tanpa abort; finish lama tidak menimpa latest', () => {
    resetAll();
    const a = beginExecution(CONV, PROJ);
    const b = beginExecution(CONV, PROJ);
    assert.equal(a.isCurrent(), false, 'handle lama tidak current');
    assert.equal(b.isCurrent(), true, 'handle baru current');
    assert.equal(a.signal.aborted, false, 'pekerjaan lama TIDAK di-abort paksa (superseded saja)');
    const finishedA = finishExecution(a.record.requestId, 'completed');
    assert.equal(finishedA?.status, 'completed', 'finish lama tercatat pada record lama');
    assert.equal(finishedA?.superseded, true, 'record lama bertanda superseded');
    assert.equal(getLastExecution(CONV)?.requestId, b.record.requestId, 'latest tetap eksekusi baru');
    assert.equal(getActiveExecution(CONV)?.requestId, b.record.requestId, 'aktif tetap eksekusi baru');
    finishExecution(b.record.requestId, 'completed');
  });

  await test('F6-L3 reload: tanpa eksekusi hantu + input derivasi INTERRUPTED di store nyata', () => {
    resetAll();
    const h = beginExecution(CONV, PROJ);
    assert.equal(getActiveExecution(CONV)?.requestId, h.record.requestId, 'eksekusi berjalan sebelum reload');
    const conv = unifiedConversationStore.getOrCreateActiveConversation(PROJ);
    unifiedConversationStore.appendMessage(conv.id, PROJ, { role: 'user', content: 'jelaskan pondasi foot plat' });
    simulateReload(); // proses browser baru atas storage yang sama
    assert.equal(getActiveExecution(CONV), null, 'tidak ada eksekusi hantu sesudah reload');
    assert.equal(getLastExecution(CONV), null, 'tidak ada record eksekusi di sesi baru');
    const after = unifiedConversationStore.getOrCreateActiveConversation(PROJ);
    const msgs = after.messages ?? [];
    assert.equal(msgs[msgs.length - 1]?.role, 'user', 'pesan terakhir = user tanpa balasan (kondisi INTERRUPTED)');
    unifiedConversationStore.appendMessage(conv.id, PROJ, { role: 'assistant', content: 'Foot plat adalah…' });
    const afterReply = unifiedConversationStore.getOrCreateActiveConversation(PROJ);
    assert.equal(afterReply.messages?.[afterReply.messages.length - 1]?.role, 'assistant', 'sesudah balasan, kondisi INTERRUPTED hilang');
  });

  await test('F6-L4 Stop membatalkan hanya request itu; finish terlambat tidak membangkitkan cancelled', () => {
    resetAll();
    const a = beginExecution(CONV, PROJ);
    const b = beginExecution(CONV_B, PROJ);
    const cancelled = cancelExecution(a.record.requestId);
    assert.equal(cancelled?.status, 'cancelled', 'request yang di-Stop menjadi cancelled');
    assert.equal(a.signal.aborted, true, 'signal request yang di-Stop di-abort');
    assert.equal(getActiveExecution(CONV_B)?.status, 'generating', 'request lain tetap generating');
    assert.equal(b.signal.aborted, false, 'signal request lain tidak di-abort');
    const late = finishExecution(a.record.requestId, 'completed');
    assert.equal(late?.status, 'cancelled', 'finish terlambat tidak mengubah cancelled');
    const again = cancelExecution(a.record.requestId);
    assert.equal(again?.status, 'cancelled', 'cancel kedua idempotent (no-op)');
    finishExecution(b.record.requestId, 'completed');
  });

  await test('F6-L5 kunci idempotensi unik per eksekusi; retry sesudah INTERRUPTED = kunci baru', () => {
    resetAll();
    const a = beginExecution(CONV, PROJ);
    const b = beginExecution(CONV, PROJ);
    assert.notEqual(a.record.idempotencyKey, b.record.idempotencyKey, 'dua eksekusi = dua kunci berbeda');
    assert.notEqual(a.record.requestId, b.record.requestId, 'dua eksekusi = dua requestId berbeda');
    assert.ok(a.record.idempotencyKey.length > 0, 'kunci pertama tidak kosong');
    // Retry sesudah reload = beginExecution baru = kunci baru (desain Gate 1/6).
    simulateReload();
    const retry = beginExecution(CONV, PROJ);
    assert.notEqual(retry.record.idempotencyKey, a.record.idempotencyKey, 'retry memakai kunci baru (bukan replay kunci lama)');
    assert.notEqual(retry.record.idempotencyKey, b.record.idempotencyKey, 'retry berbeda dari kunci eksekusi terakhir');
    finishExecution(retry.record.requestId, 'completed');
  });

  await test('F6-L6 penulis snapshot registry di titik commit masih ada (sumber, pola S5A-03)', () => {
    const regSrc = read('src/ai-tools/ezrab-ai/actionRegistry.ts');
    const fnStart = regSrc.indexOf('function generateFromUniversalContext');
    assert.ok(fnStart > 0, 'generateFromUniversalContext ditemukan');
    const fn = regSrc.slice(fnStart, fnStart + 4500);
    const saveIdx = fn.indexOf('persistIntakeSnapshotNow(ctx');
    const clearIdx = fn.indexOf('universalCtx = null;');
    assert.ok(saveIdx > 0, 'generate memanggil persistIntakeSnapshotNow');
    assert.ok(clearIdx > saveIdx, 'simpan terjadi SEBELUM pembersihan singleton');
    assert.ok(fn.includes('getLastUniversalDraft()?.id'), 'tautan draft dibaca dari singleton draft');
    // Gerbang jalur cepat juga masih mencap projectId + menyimpan snapshot.
    assert.ok(regSrc.includes('persistIntakeSnapshotNow(fastCtx, draftNow.id)'), 'snapshot jalur cepat masih ditulis di gerbang');
  });

  await test('F6-L7 ARS-08 tetap terbuka by design: gateway tanpa pengamatan disconnect (sumber)', () => {
    const gw = read('api/_lib/aiGateway.js');
    const handler = read('api/ai/tools/execute.js');
    assert.ok(!gw.includes("req.on('close')") && !gw.includes('req.on("close")'), 'aiGateway.js tidak mengamati disconnect klien');
    assert.ok(!handler.includes("req.on('close')") && !handler.includes('req.on("close")'), 'handler tools/execute tidak mengamati disconnect klien');
    // Bukan diperbaiki di Fase 6 (pekerjaan gateway + keputusan owner §17 butir 8):
    // runtime klien tetap jujur — cancel hanya sisi klien, reload = INTERRUPTED.
    const rtSrc = read('src/ai-tools/ezrab-ai/executionRuntime.ts');
    assert.ok(rtSrc.includes('Reload browser TIDAK dapat dilanjutkan runtime ini'), 'runtime mendokumentasikan batas reload secara jujur');
  });

  // ============ (S) SINKRONISASI STATUS PLAN-STEP ============
  await test('F6-S1 hasil registry sukses → langkah succeeded + result + completedAt; saudara utuh', () => {
    resetAll();
    const plan = kandangPlan();
    const v = stepOf(plan, 'validate-spec-chain');
    const before = JSON.stringify(plan.steps.filter((s) => s.id !== v.id));
    const r = applyRegistryOutcomeToStep(plan, v.id, { status: 'succeeded', message: 'Validasi rantai spek: 6/6 butir lolos.' });
    assert.equal(r.ok, true, 'sinkronisasi ok');
    const after = stepOf(r.plan, 'validate-spec-chain');
    assert.equal(after.status, 'succeeded', 'langkah menjadi succeeded');
    assert.equal(after.result, 'Validasi rantai spek: 6/6 butir lolos.', 'result = ringkasan output registry');
    assert.ok(after.completedAt, 'completedAt terisi');
    assert.equal(after.error, null, 'error bersih');
    assert.equal(JSON.stringify(r.plan.steps.filter((s) => s.id !== v.id)), before, 'langkah lain tidak disentuh');
    assert.equal(r.plan.status, 'active', 'rencana tetap active (langkah lain masih pending)');
  });

  await test('F6-S2 hasil registry selesai-sebagian → langkah partially-succeeded', () => {
    resetAll();
    const plan = kandangPlan();
    const a = stepOf(plan, 'verify-prices');
    const r = applyRegistryOutcomeToStep(plan, a.id, { status: 'partially-succeeded', message: 'Verifikasi harga: 11 item terverifikasi AHSP resmi, 2 item belum terverifikasi (parsial).' });
    assert.equal(r.ok, true, 'sinkronisasi ok');
    const after = stepOf(r.plan, 'verify-prices');
    assert.equal(after.status, 'partially-succeeded', 'langkah menjadi partially-succeeded');
    assert.ok(after.result?.includes('parsial'), 'hasil parsial dilaporkan jujur');
    assert.ok(after.completedAt, 'completedAt terisi');
  });

  await test('F6-S3 hasil registry gagal → langkah failed + alasan; persetujuan TIDAK dicabut', () => {
    resetAll();
    const plan = approvedTransferPlan();
    const t = stepOf(plan, 'transfer-draft');
    assert.equal(t.status, 'ready', 'pra-kondisi: langkah disetujui (ready)');
    assert.equal(t.approvedByUser, true, 'pra-kondisi: approvedByUser true');
    const r = applyRegistryOutcomeToStep(plan, t.id, { status: 'failed', message: 'ERROR: versi draft tidak cocok (diminta v1, aktif v2) — muat ulang draft sebelum transfer.' });
    assert.equal(r.ok, true, 'sinkronisasi ok');
    const after = stepOf(r.plan, 'transfer-draft');
    assert.equal(after.status, 'failed', 'langkah menjadi failed');
    assert.ok(after.error?.includes('versi draft tidak cocok'), 'alasan gagal tercatat di error');
    assert.equal(after.approvedByUser, true, 'persetujuan tetap berlaku — yang gagal pemeriksaannya, bukan izinnya');
    assert.ok(after.completedAt, 'completedAt terisi');
  });

  await test('F6-S4 hasil registry terhenti → langkah blocked + alasan (input hilang)', () => {
    resetAll();
    const plan = kandangPlan();
    const v = stepOf(plan, 'validate-spec-chain');
    const r = applyRegistryOutcomeToStep(plan, v.id, { status: 'blocked', message: 'validate-spec-chain butuh draft aktif — belum ada draft untuk divalidasi.' });
    assert.equal(r.ok, true, 'sinkronisasi ok');
    const after = stepOf(r.plan, 'validate-spec-chain');
    assert.equal(after.status, 'blocked', 'langkah menjadi blocked');
    assert.ok(after.error?.includes('butuh draft aktif'), 'alasan terhenti tercatat');
  });

  await test('F6-S5 transfer-draft + readiness sukses (transfer BELUM terjadi) → tetap ready + result tercatat', () => {
    resetAll();
    const plan = approvedTransferPlan();
    const t = stepOf(plan, 'transfer-draft');
    const r = applyRegistryOutcomeToStep(plan, t.id, {
      status: 'succeeded',
      message: 'Draft "Kandang & peternakan" v1 SIAP dipindahkan ke proyek (kesiapan terverifikasi). Transfer diselesaikan lewat tombol "Push ke Spreadsheet RAB" — registry tidak menulis sendiri.',
    });
    assert.equal(r.ok, true, 'sinkronisasi ok');
    const after = stepOf(r.plan, 'transfer-draft');
    assert.equal(after.status, 'ready', 'langkah TETAP ready — readiness sukses BUKAN transfer selesai');
    assert.ok(after.result?.includes('SIAP dipindahkan'), 'hasil readiness tercatat di result (tampil di panel)');
    assert.equal(after.completedAt, null, 'completedAt tetap null — langkah belum selesai');
    assert.equal(after.approvedByUser, true, 'persetujuan utuh');
  });

  await test('F6-S6 transfer-draft + sukses + transferCompleted → succeeded (transfer benar terjadi)', () => {
    resetAll();
    const plan = approvedTransferPlan();
    const t = stepOf(plan, 'transfer-draft');
    const r = applyRegistryOutcomeToStep(plan, t.id, {
      status: 'succeeded',
      message: 'Draft "Kandang & peternakan" v1 SUDAH ditransfer ke proyek ini (14 item) — tidak ada penulisan ulang.',
      transferCompleted: true,
    });
    assert.equal(r.ok, true, 'sinkronisasi ok');
    const after = stepOf(r.plan, 'transfer-draft');
    assert.equal(after.status, 'succeeded', 'langkah menjadi succeeded karena transfer benar terjadi');
    assert.ok(after.completedAt, 'completedAt terisi');
  });

  await test('F6-S7 transfer-draft + readiness gagal → failed + alasan; langkah lain utuh', () => {
    resetAll();
    const plan = approvedTransferPlan();
    const t = stepOf(plan, 'transfer-draft');
    const before = JSON.stringify(plan.steps.filter((s) => s.id !== t.id));
    const r = applyRegistryOutcomeToStep(plan, t.id, { status: 'failed', message: 'ERROR: tidak ada draft aktif di sesi ini untuk proyek ini.' });
    const after = stepOf(r.plan, 'transfer-draft');
    assert.equal(after.status, 'failed', 'langkah menjadi failed');
    assert.ok(after.error?.includes('tidak ada draft aktif'), 'alasan tercatat');
    assert.equal(after.approvedByUser, true, 'persetujuan tidak dicabut');
    assert.equal(JSON.stringify(r.plan.steps.filter((s) => s.id !== t.id)), before, 'langkah lain tidak rusak oleh kegagalan registry');
  });

  await test('F6-S8 langkah terminal tidak ditimpa hasil registry yang datang terlambat', () => {
    resetAll();
    const plan = kandangPlan();
    const v = stepOf(plan, 'validate-spec-chain');
    const done = applyRegistryOutcomeToStep(plan, v.id, { status: 'succeeded', message: 'ok' });
    assert.equal(stepOf(done.plan, 'validate-spec-chain').status, 'succeeded', 'pra-kondisi: succeeded');
    const late = applyRegistryOutcomeToStep(done.plan, v.id, { status: 'failed', message: 'hasil basi yang datang terlambat' });
    assert.equal(late.ok, false, 'hasil terlambat ditolak');
    assert.equal(stepOf(late.plan, 'validate-spec-chain').status, 'succeeded', 'status terminal dipertahankan');
    assert.equal(late.plan, done.plan, 'objek rencana tidak berubah (referensi sama)');
  });

  await test('F6-S9 stepId tak dikenal → ok:false, rencana tidak berubah', () => {
    resetAll();
    const plan = kandangPlan();
    const before = JSON.stringify(plan);
    const r = applyRegistryOutcomeToStep(plan, 'step-tidak-ada', { status: 'succeeded', message: 'ok' });
    assert.equal(r.ok, false, 'stepId tak dikenal ditolak');
    assert.equal(JSON.stringify(r.plan), before, 'rencana tidak berubah');
  });

  await test('F6-S10 ujung-ke-ujung: validate-spec-chain lewat registry → langkah succeeded', async () => {
    resetAll();
    const plan = kandangPlan();
    const draft = houseDraft(PROJ);
    const v = stepOf(plan, 'validate-spec-chain');
    const exec = await runPlanStepWithRegistry(
      'validate-spec-chain',
      { projectId: PROJ, conversationId: CONV, planId: plan.planId, stepId: v.id },
      { draft, structuredSpecs: draft.structuredSpecs ?? [] },
      { actor: 'user', channel: 'orchestrator' },
    );
    assert.equal(exec.ok, true, 'eksekusi registry ok');
    assert.equal(exec.record.status, 'succeeded', 'record registry succeeded');
    const r = applyRegistryOutcomeToStep(plan, v.id, { status: 'succeeded', message: exec.output ?? 'selesai.' });
    assert.equal(stepOf(r.plan, 'validate-spec-chain').status, 'succeeded', 'panel (state rencana) mencerminkan hasil registry');
    assert.ok(stepOf(r.plan, 'validate-spec-chain').result?.includes('Validasi rantai spek'), 'result membawa output registry');
  });

  await test('F6-S11 ujung-ke-ujung: transfer-draft tanpa draft → blocked NO_DRAFT → langkah blocked', async () => {
    resetAll();
    const plan = approvedTransferPlan();
    const t = stepOf(plan, 'transfer-draft');
    const exec = await runPlanStepWithRegistry(
      'transfer-draft',
      { projectId: PROJ, conversationId: CONV, planId: plan.planId, stepId: t.id },
      {},
      { actor: 'user', approval: { actor: 'user', approvedAt: new Date().toISOString() }, channel: 'chat-ai' },
    );
    assert.equal(exec.ok, false, 'eksekusi registry gagal jujur');
    assert.equal(exec.record.status, 'blocked', 'record registry blocked');
    assert.equal(exec.errorCode, 'NO_DRAFT', 'alasan: NO_DRAFT');
    const r = applyRegistryOutcomeToStep(plan, t.id, { status: 'blocked', message: exec.error ?? 'gagal.' });
    const after = stepOf(r.plan, 'transfer-draft');
    assert.equal(after.status, 'blocked', 'langkah menjadi blocked (bukan tetap ready)');
    assert.ok(after.error?.includes('versi draft'), 'alasan terhenti tampil di panel');
    assert.equal(after.approvedByUser, true, 'persetujuan tetap berlaku');
  });

  await test('F6-S12 ujung-ke-ujung: transfer-draft versi diberi tapi singleton kosong → failed → langkah failed', async () => {
    resetAll();
    const plan = approvedTransferPlan();
    const t = stepOf(plan, 'transfer-draft');
    setLastUniversalDraft(null);
    const exec = await runPlanStepWithRegistry(
      'transfer-draft',
      { projectId: PROJ, conversationId: CONV, planId: plan.planId, stepId: t.id },
      { draftVersion: 1 },
      { actor: 'user', approval: { actor: 'user', approvedAt: new Date().toISOString() }, channel: 'chat-ai' },
    );
    assert.equal(exec.ok, false, 'eksekusi registry gagal jujur');
    assert.equal(exec.record.status, 'failed', 'record registry failed (output ERROR: ditolak validator)');
    assert.equal(exec.errorCode, 'OUTPUT_VALIDATION_FAILED', 'alasan: OUTPUT_VALIDATION_FAILED');
    const r = applyRegistryOutcomeToStep(plan, t.id, { status: 'failed', message: exec.error ?? 'gagal.' });
    const after = stepOf(r.plan, 'transfer-draft');
    assert.equal(after.status, 'failed', 'langkah menjadi failed');
    assert.ok(after.error?.includes('tidak ada draft aktif'), 'alasan gagal tampil di panel');
  });

  await test('F6-S13 semantik approval gate TIDAK berubah (pin A3-GATE diverifikasi ulang)', async () => {
    resetAll();
    const plan = kandangPlan();
    const t = stepOf(plan, 'transfer-draft');
    const byModel = approveStep(plan, t.id, 'model');
    assert.equal(byModel.ok, false, 'approval model ditolak');
    assert.ok(byModel.error?.includes('APPROVAL_SELF_GRANT_DENIED'), 'alasan penolakan model tercatat');
    const bySystem = approveStep(plan, t.id, 'system');
    assert.equal(bySystem.ok, false, 'approval system ditolak');
    let runnerCalled = false;
    const noApproval = await executeStep(plan, t.id, async () => { runnerCalled = true; return { ok: true, result: 'x' }; });
    assert.equal(noApproval.ok, false, 'executeStep tanpa persetujuan ditolak');
    assert.equal(runnerCalled, false, 'runner TIDAK dipanggil tanpa persetujuan');
    assert.equal(stepOf(noApproval.plan, 'transfer-draft').status, 'awaiting-approval', 'langkah kembali awaiting-approval');
    // Sinkronisasi registry tidak memberi izin: langkah awaiting-approval
    // yang menerima outcome sukses transfer (tanpa transferCompleted)
    // tetap awaiting-approval — bukan ready.
    const synced = applyRegistryOutcomeToStep(plan, t.id, { status: 'succeeded', message: 'kesiapan ok' });
    assert.equal(stepOf(synced.plan, 'transfer-draft').status, 'awaiting-approval', 'sync tidak mengubah awaiting-approval menjadi ready');
    assert.equal(stepOf(synced.plan, 'transfer-draft').approvedByUser, false, 'sync tidak menetapkan approvedByUser');
  });

  await test('F6-S14 markTransferStepCompleted: sukses push-rab → transfer succeeded; no-op bila tak ada langkah / sudah terminal', () => {
    resetAll();
    const plan = approvedTransferPlan();
    const marked = markTransferStepCompleted(plan, 'Draft v1 dipindahkan ke Spreadsheet RAB (14 item terverifikasi).');
    const after = stepOf(marked, 'transfer-draft');
    assert.equal(after.status, 'succeeded', 'langkah transfer menjadi succeeded');
    assert.ok(after.result?.includes('14 item terverifikasi'), 'result mencatat outcome push-rab');
    assert.ok(after.completedAt, 'completedAt terisi');
    // No-op: rencana tanpa langkah transfer-draft (goal search-ahsp).
    const obj = deriveObjective('cari ahsp pemasangan bata merah', 'SEARCH_AHSP');
    const searchPlan = buildPlanForObjective(obj, { userId: null, projectId: PROJ, conversationId: CONV });
    assert.equal(searchPlan.steps.some((s) => s.kind === 'transfer-draft'), false, 'pra-kondisi: rencana search tanpa transfer');
    assert.equal(markTransferStepCompleted(searchPlan, 'x'), searchPlan, 'tanpa langkah transfer → rencana tidak berubah');
    // No-op: langkah sudah terminal.
    const again = markTransferStepCompleted(marked, 'upaya kedua');
    assert.equal(stepOf(again, 'transfer-draft').result, after.result, 'langkah terminal tidak ditimpa');
  });

  await test('F6-S15 wiring view: handler Setujui + 2 situs push-rab memanggil sync; pagar catch dipertahankan', () => {
    const viewSrc = read('src/ai-tools/ezrab-ai/view.tsx');
    const handlerStart = viewSrc.indexOf('const r = approveStep(agentPlan, s.id');
    assert.ok(handlerStart > 0, 'handler Setujui ditemukan');
    const syncIdx = viewSrc.indexOf('applyRegistryOutcomeToStep(p, s.id');
    assert.ok(syncIdx > handlerStart, 'handler Setujui memanggil applyRegistryOutcomeToStep');
    assert.ok(syncIdx < viewSrc.indexOf('Setujui', handlerStart), 'pemanggilan sync berada di dalam handler Setujui (sebelum label tombol)');
    const pushSites = viewSrc.split('markTransferStepCompleted(p,').length - 1;
    assert.equal(pushSites, 2, 'dua situs push-rab (sukses terverifikasi + duplikat-terblokir) menandai langkah transfer');
    assert.ok(viewSrc.includes('kegagalan registry tidak boleh merusak rencana yang sudah disetujui'), 'pagar catch Fase 5 dipertahankan verbatim');
  });

  // ============ (P) KEPUTUSAN planned/ready ============
  await test('F6-P1 eksekutor tool TIDAK PERNAH mengemisikan planned/ready (matriks runtime)', async () => {
    resetAll();
    const statuses: string[] = [];
    const collect = (s: string) => { statuses.push(s); };
    // sukses
    const okRun = await executeTool({ toolName: 'subtotal', args: { volume: 2, unitPrice: 100000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    collect(okRun.record.status);
    // blocked (validasi input)
    const blocked = await executeTool({ toolName: 'subtotal', args: {}, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    collect(blocked.record.status);
    // failed (tool tak dikenal)
    const unknown = await executeTool({ toolName: 'tool_tidak_ada', args: {}, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    collect(unknown.record.status);
    // blocked (tool tidak tersedia)
    const unavailable = await executeTool({ toolName: 'wizard_server', args: { sessionId: 's1' }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    collect(unavailable.record.status);
    // awaiting-approval (konsekwensial tanpa persetujuan)
    const awaiting = await executeTool({ toolName: 'transfer_draft', args: { projectId: PROJ, draftVersion: 1 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    collect(awaiting.record.status);
    // failed (approval model ditolak)
    const selfGrant = await executeTool({ toolName: 'transfer_draft', args: { projectId: PROJ, draftVersion: 1 }, projectId: PROJ, actor: 'model', approval: { actor: 'model', approvedAt: new Date().toISOString() }, channel: 'chat-ai' });
    collect(selfGrant.record.status);
    // partially-succeeded
    const partial = await executeTool({ toolName: 'analyze_draft_costs', args: { items: [{ description: 'X', totalPrice: 1, priceStatus: 'PRICE_UNRESOLVED' }] }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    collect(partial.record.status);
    // blocked (langkah tanpa runner registry)
    const noRunner = await runPlanStepWithRegistry('understand-objective', { projectId: PROJ, conversationId: CONV }, {}, { actor: 'user', channel: 'orchestrator' });
    collect(noRunner.record.status);
    // Jejak terbaru per executionId (yang dibaca UI/audit) juga diperiksa.
    for (const r of listToolExecutions(PROJ, 200)) collect(r.status);
    assert.ok(!statuses.includes('planned'), `planned tidak pernah diemisikan (status teramati: ${[...new Set(statuses)].sort().join(', ')})`);
    assert.ok(!statuses.includes('ready'), `ready tidak pernah diemisikan (status teramati: ${[...new Set(statuses)].sort().join(', ')})`);
    const reached = new Set(statuses);
    for (const s of ['succeeded', 'partially-succeeded', 'failed', 'blocked', 'awaiting-approval']) {
      assert.ok(reached.has(s), `status ${s} terbukti dapat dicapai (matriks bukan kosong)`);
    }
  });

  await test('F6-P2 sumber: planned/ready di toolRegistry hanya di union tipe + komentar + penjaga cancel', () => {
    const regSrc = read('src/ai-tools/ezrab-ai/toolRegistry.ts');
    assert.ok(!regSrc.includes("status: 'planned'"), 'tidak ada penugasan status planned');
    assert.ok(!regSrc.includes("status: 'ready'"), 'tidak ada penugasan status ready');
    assert.ok(!regSrc.includes(", 'planned')"), 'tidak ada record yang dibuat berstatus planned');
    assert.ok(!regSrc.includes(", 'ready')"), 'tidak ada record yang dibuat berstatus ready');
    assert.ok(regSrc.includes("| 'planned'"), 'planned ada di union ToolExecutionStatus (cadangan)');
    assert.ok(regSrc.includes("| 'ready'"), 'ready ada di union ToolExecutionStatus (cadangan)');
    const cancelIdx = regSrc.indexOf('export function cancelToolExecution');
    assert.ok(cancelIdx > 0, 'cancelToolExecution ditemukan');
    const cancelBody = regSrc.slice(cancelIdx, cancelIdx + 600);
    assert.ok(cancelBody.includes("'planned'") && cancelBody.includes("'ready'"), 'penjaga cancel mengenali keduanya sebagai status yang dapat dibatalkan');
  });

  await test('F6-P3 siklus LANGKAH RENCANA memakai planned/ready secara hidup (berbeda dari siklus tool)', () => {
    resetAll();
    const plan = kandangPlan();
    const q = stepOf(plan, 'collect-specs-questionnaire');
    const v = stepOf(plan, 'validate-spec-chain');
    const g = stepOf(plan, 'generate-draft');
    assert.equal(q.status, 'planned', 'langkah baru berstatus planned');
    assert.equal(v.status, 'planned', 'langkah validasi berstatus planned');
    assert.equal(stepOf(plan, 'understand-objective').status, 'succeeded', 'memahami objektif langsung succeeded');
    assert.equal(stepOf(plan, 'transfer-draft').status, 'awaiting-approval', 'transfer menunggu persetujuan');
    // nextReadyStep memilih langkah planned yang dependensinya selesai.
    const next = nextReadyStep(plan);
    assert.ok(next, 'ada langkah siap berikutnya');
    assert.equal(next!.kind, 'collect-specs-questionnaire', 'langkah siap berikutnya = kuesioner (dependensi understand selesai)');
    // approveStep → ready; retryStep (sesudah failed) → ready.
    const t = stepOf(plan, 'transfer-draft');
    const approved = approveStep(plan, t.id, 'user');
    assert.equal(stepOf(approved.plan, 'transfer-draft').status, 'ready', 'approveStep menetapkan ready');
    const failedPlan = applyRegistryOutcomeToStep(plan, g.id, { status: 'failed', message: 'gagal simulasi' }).plan;
    const retried = retryStep(failedPlan, g.id);
    assert.equal(retried.ok, true, 'retry langkah gagal ok');
    assert.equal(stepOf(retried.plan, 'generate-draft').status, 'ready', 'retryStep menetapkan ready');
    assert.equal(stepOf(retried.plan, 'generate-draft').retryCount, 1, 'retryCount bertambah');
  });

  await test('F6-P4 rencana + status langkah selamat dari reload dingin (dibaca ulang dari storage)', () => {
    resetAll();
    const plan = approvedTransferPlan();
    const v = stepOf(plan, 'validate-spec-chain');
    const withOutcome = applyRegistryOutcomeToStep(plan, v.id, { status: 'succeeded', message: 'Validasi 6/6 lolos.' }).plan;
    assert.equal(savePlan(withOutcome), true, 'rencana tersimpan');
    simulateReload(); // singleton mati; storage utuh
    const reloaded = loadPlan(withOutcome.planId);
    assert.ok(reloaded, 'rencana termuat sesudah reload dingin');
    assert.equal(stepOf(reloaded!, 'validate-spec-chain').status, 'succeeded', 'langkah succeeded utuh sesudah reload');
    assert.equal(stepOf(reloaded!, 'transfer-draft').status, 'ready', 'langkah ready utuh sesudah reload');
    assert.equal(stepOf(reloaded!, 'transfer-draft').approvedByUser, true, 'persetujuan utuh sesudah reload');
    assert.equal(stepOf(reloaded!, 'collect-specs-questionnaire').status, 'planned', 'langkah planned utuh sesudah reload');
    assert.equal(reloaded!.objective.goal, 'build-rab', 'objektif utuh sesudah reload');
  });

  await test('F6-P5 eksekusi tool bersifat terminal segera sesudah await (tidak ada in-flight lintas reload)', async () => {
    resetAll();
    const run = await executeTool({ toolName: 'subtotal', args: { volume: 3, unitPrice: 50000 }, projectId: PROJ, actor: 'model', channel: 'chat-ai' });
    assert.equal(run.record.status, 'succeeded', 'record terminal sesudah await kembali');
    assert.ok(run.record.completedAt, 'completedAt terisi segera sesudah await');
    assert.ok(run.record.durationMs !== null && run.record.durationMs >= 0, 'durationMs terisi');
    const latest = listToolExecutions(PROJ, 200);
    assert.ok(latest.length > 0, 'trail terbaca balik');
    assert.ok(!latest.some((r) => r.status === 'running'), 'tidak ada record running yang tersisa (terbaru per executionId)');
    assert.ok(!latest.some((r) => r.status === 'planned' || r.status === 'ready'), 'tidak ada record planned/ready di trail');
  });

  await test('F6-P6 tidak ada eksekutor async / job store: resume server tetap TIDAK TERSEDIA (keputusan desain)', async () => {
    const regSrc = read('src/ai-tools/ezrab-ai/toolRegistry.ts');
    assert.ok(!regSrc.includes('enqueue'), 'tidak ada antrean eksekusi');
    assert.ok(!regSrc.includes('JobStore') && !regSrc.includes('jobStore'), 'tidak ada job store');
    assert.ok(!regSrc.includes('setInterval('), 'tidak ada scheduler interval');
    const def = getToolDefinition('resume_server_execution');
    assert.ok(def, 'tool resume_server_execution terdaftar');
    assert.equal(def!.available, false, 'resume server TIDAK tersedia (by design)');
    assert.ok(def!.unavailableReason?.includes('SERVER_RESUME_NOT_BUILT'), 'alasan: SERVER_RESUME_NOT_BUILT');
    const attempt = await executeTool({ toolName: 'resume_server_execution', args: { requestId: 'req-x' }, projectId: PROJ, actor: 'user', channel: 'chat-ai' });
    assert.equal(attempt.record.status, 'blocked', 'pemanggilan resume diblokir jujur');
    assert.equal(attempt.errorCode, 'TOOL_UNAVAILABLE', 'alasan blokir: TOOL_UNAVAILABLE');
  });

  // ============ (D) ASERSI SUMBER ============
  await test('F6-D1 jalur sinkronisasi + runtime tanpa fetch/provider (sumber)', () => {
    const orchSrc = read('src/ai-tools/ezrab-ai/agentOrchestrator.ts');
    assert.ok(!orchSrc.includes('fetch('), 'agentOrchestrator.ts tanpa fetch');
    assert.ok(!orchSrc.includes('providerClient'), 'agentOrchestrator.ts tanpa providerClient');
    const rtSrc = read('src/ai-tools/ezrab-ai/executionRuntime.ts');
    assert.ok(!rtSrc.includes('fetch('), 'executionRuntime.ts tanpa fetch');
    // Fungsi sync sendiri tidak pernah menyentuh approvedByUser (gate utuh).
    const fnStart = orchSrc.indexOf('export function applyRegistryOutcomeToStep');
    const fnEnd = orchSrc.indexOf('export function markTransferStepCompleted');
    assert.ok(fnStart > 0 && fnEnd > fnStart, 'fungsi sync ditemukan');
    const fnBody = orchSrc.slice(fnStart, fnEnd);
    assert.ok(!fnBody.includes('approvedByUser'), 'applyRegistryOutcomeToStep tidak pernah membaca/menulis approvedByUser');
  });

  await test('F6-D2 handler Setujui memanggil approveStep dengan actor user (sumber)', () => {
    const viewSrc = read('src/ai-tools/ezrab-ai/view.tsx');
    assert.ok(viewSrc.includes("approveStep(agentPlan, s.id, 'user')"), 'handler Setujui memakai actor user');
    assert.ok(!viewSrc.includes("approveStep(agentPlan, s.id, 'model')"), 'tidak ada approval model di handler');
    assert.ok(!viewSrc.includes("approveStep(agentPlan, s.id, 'system')"), 'tidak ada approval system di handler');
  });

  await test('F6-D3 executionRuntime: API permukaan utuh + tanpa impor jaringan (sumber)', () => {
    const rtSrc = read('src/ai-tools/ezrab-ai/executionRuntime.ts');
    for (const fn of ['beginExecution', 'finishExecution', 'cancelExecution', 'getActiveExecution', 'getLastExecution', 'getExecution', 'subscribeExecution', 'releaseConversation']) {
      assert.ok(rtSrc.includes(`export function ${fn}`), `ekspor ${fn} ada`);
    }
    assert.ok(!rtSrc.includes('from \'../'), 'runtime tidak mengimpor modul lain (mandiri, tanpa jaringan)');
    assert.ok(!rtSrc.includes('localStorage'), 'runtime tidak menyentuh storage (status hidup di memori sesi)');
  });

  console.log(`\nPERSISTENT RUNTIME (FASE 6): ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log(`Gagal: ${failedNames.join(' | ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('F6 fatal:', e);
  process.exit(1);
});

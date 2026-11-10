// Suite: Batas metering AI bersama (Sprint 3 Tugas 3) —
// api/_lib/aiMetering.js + aiMeteringLifecycle.js di atas ledger Gen-2
// NYATA (createCreditLedger + memory store). Gerbang AI_METERING_ENABLED
// default MATI dan fail-closed; tidak ada jalur yang menyentuh auth,
// handler, gateway, atau berkas DED.
// Jalankan dari root repo: npx --yes tsx src/test/ai-metering.test.ts
import {
  createAiMeteringBoundary,
  isAiMeteringEnabled,
  isValidIdempotencyKey,
  resolveGatewayFeature,
  classifyMeteringFeature,
  estimateReservationCredits,
  AI_METERING_ENV_FLAG,
} from '../../api/_lib/aiMetering.js';
import {
  canTransition,
  isTerminalStatus,
} from '../../api/_lib/aiMeteringLifecycle.js';
import { createCreditLedger, createMemoryLedgerStore } from '../../api/_lib/creditLedger.js';
import { EZRAB_DRAFT_TARIFFS } from '../../api/_lib/creditPricing.js';
import { chargeDecision } from '../../api/_lib/featureBillingMatrix.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const T0 = 1_700_000_000_000;
const CTX = { accountId: 'acct-meter-1', workspaceId: 'ws-1', userId: 'user-1' };
const ON = { [AI_METERING_ENV_FLAG]: 'true' };

function freshLedger() {
  const store = createMemoryLedgerStore();
  const ledger = createCreditLedger(store);
  ledger.grantSubscription({
    accountId: CTX.accountId, amount: 5000, periodStart: T0, periodEnd: T0 + 30 * 24 * 3600 * 1000,
    idempotencyKey: 'm-sub-1', now: T0,
  });
  return { store, ledger };
}

function freshBoundary(env?: any) {
  const { store, ledger } = freshLedger();
  const boundary = createAiMeteringBoundary({ ledger, env: env || ON, now: () => T0 });
  return { store, ledger, boundary };
}

console.log('=== Gerbang: default mati, hanya "true" persis yang menyalakan ===');
check('env kosong -> mati', isAiMeteringEnabled({}) === false);
check('env "false" -> mati', isAiMeteringEnabled({ [AI_METERING_ENV_FLAG]: 'false' }) === false);
check('env "1" -> mati (bukan "true")', isAiMeteringEnabled({ [AI_METERING_ENV_FLAG]: '1' }) === false);
check('env "true" -> menyala', isAiMeteringEnabled(ON) === true);

console.log('=== Gerbang mati: fail-closed, NOL efek ke ledger ===');
{
  const { ledger, boundary } = freshBoundary({});
  const entriesBefore = ledger.listLedger(CTX.accountId).length;
  const balBefore = ledger.getBalance(CTX.accountId, T0).total;
  const res: any = boundary.beginOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'gate-off-0001',
    serverEstimate: { tokensIn: 100, tokensOutAllowance: 100 },
  });
  check('beginOperation ditolak AI_METERING_DISABLED', res.ok === false && res.error === 'AI_METERING_DISABLED' && res.failClosed === true);
  check('tidak ada record wrapper dibuat', boundary._recordCount() === 0);
  check('tidak ada entri ledger baru', ledger.listLedger(CTX.accountId).length === entriesBefore);
  check('saldo tidak berubah (tanpa fallback simulasi)', ledger.getBalance(CTX.accountId, T0).total === balBefore);
}

console.log('=== State machine lifecycle (unit) ===');
check('CREATED->RESERVED sah', canTransition('CREATED', 'RESERVED') === true);
check('RESERVED->EXECUTING sah', canTransition('RESERVED', 'EXECUTING') === true);
check('EXECUTING->SUCCEEDED sah', canTransition('EXECUTING', 'SUCCEEDED') === true);
check('SUCCEEDED->SETTLED sah', canTransition('SUCCEEDED', 'SETTLED') === true);
check('SETTLED->RELEASED ilegal (terminal ganda)', canTransition('SETTLED', 'RELEASED') === false);
check('RELEASED->SETTLED ilegal (settle sesudah release)', canTransition('RELEASED', 'SETTLED') === false);
check('REQUIRES_REVIEW->SETTLED ilegal (bypass review)', canTransition('REQUIRES_REVIEW', 'SETTLED') === false);
check('REQUIRES_REVIEW->RELEASED ilegal (bypass review)', canTransition('REQUIRES_REVIEW', 'RELEASED') === false);
check('CREATED->EXECUTING ilegal (eksekusi sebelum reservasi)', canTransition('CREATED', 'EXECUTING') === false);
check('RESERVED->SETTLED ilegal (settle sebelum eksekusi sukses)', canTransition('RESERVED', 'SETTLED') === false);
check('SETTLED terminal', isTerminalStatus('SETTLED') === true && isTerminalStatus('RESERVED') === false);

console.log('=== Perbaikan R-3: pemetaan gateway -> kunci kanonis yang ADA di tarif ===');
{
  const ded = resolveGatewayFeature('DED_AI_FAST', { complexity: 'medium' });
  check('DED_AI_FAST + medium -> ded-ai/medium', ded.ok === true && (ded as any).featureKey === 'ded-ai/medium');
  check('kunci harga ded-ai/medium ADA di tarif draft', ded.ok === true && EZRAB_DRAFT_TARIFFS.tariffs[(ded as any).pricingFeatureKey] != null);
  check('kunci bare "ded-ai" TIDAK ada di tarif draft (akar bug lama)', EZRAB_DRAFT_TARIFFS.tariffs['ded-ai'] == null);
  const doc = resolveGatewayFeature('DOKUMEN_AI', { category: 'complex' });
  check('DOKUMEN_AI + complex -> ai-document/analysis + harga ai-document/complex',
    doc.ok === true && (doc as any).featureKey === 'ai-document/analysis' && (doc as any).pricingFeatureKey === 'ai-document/complex');
  check('kunci harga ai-document/complex ADA di tarif draft', EZRAB_DRAFT_TARIFFS.tariffs['ai-document/complex'] != null);
  check('kunci bare "ai-document" TIDAK ada di tarif draft', EZRAB_DRAFT_TARIFFS.tariffs['ai-document'] == null);
  check('DED tanpa kompleksitas -> fail-closed', resolveGatewayFeature('DED_AI_DETAIL', {}).ok === false);
  check('productId asing -> UNKNOWN_FEATURE', resolveGatewayFeature('PRODUK_ASING', {}).error === 'UNKNOWN_FEATURE');
  check('classify kunci legacy ambigu -> null di boundary', classifyMeteringFeature('ded-ai') === null && classifyMeteringFeature('ai-document') === null);
}

console.log('=== Registri tambahan: fitur Phase 2 yang hilang kini terdaftar (dorman) ===');
check('smart-add/work-item AI_METERED', classifyMeteringFeature('smart-add/work-item')?.billingClass === 'AI_METERED');
check('ai-document/review AI_METERED', classifyMeteringFeature('ai-document/review')?.billingClass === 'AI_METERED');
check('ded-rab/pipeline AI_METERED', classifyMeteringFeature('ded-rab/pipeline')?.billingClass === 'AI_METERED');
check('ai-receipt/scan ditandai MISSING_ENDPOINT', (classifyMeteringFeature('ai-receipt/scan') as any)?.transportStatus === 'MISSING_ENDPOINT');

console.log('=== Lifecycle penuh (gerbang menyala): chat, settle < reservasi ===');
{
  const { ledger, boundary } = freshBoundary();
  const run: any = await boundary.runMeteredOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'chat-run-0001',
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
  }, async () => ({
    provider: 'gemini', model: 'gemini-3.5-flash-lite',
    usage: { tokensIn: 2000, tokensOut: 1000, tokensCached: 0 },
    result: 'jawaban',
  }));
  // Estimasi reservasi: (2000 + 1000*3)/200 = 25; aktual sama = 25.
  check('run SETTLED', run.ok === true && run.status === 'SETTLED');
  check('settledCredits = 25 (v1.1)', run.settledCredits === 25);
  check('record membawa identitas lengkap', run.record.accountId === CTX.accountId && run.record.workspaceId === 'ws-1'
    && run.record.userId === 'user-1' && run.record.featureKey === 'chat-ai/fast'
    && run.record.provider === 'gemini' && run.record.tariffVersion === '2026-11-02.1'
    && run.record.reservationId === run.record.operationId && run.record.estimatedCredits === 25);
  check('saldo turun tepat 25', ledger.getBalance(CTX.accountId, T0).total === 5000 - 25);
  check('hasil executor diteruskan', run.result === 'jawaban');

  console.log('=== Transisi ilegal di tingkat boundary (sesudah SETTLED) ===');
  const againSettle: any = boundary.settleCredits(run.record.operationId);
  check('settle kedua ditolak ILLEGAL_TRANSITION', againSettle.ok === false && againSettle.error === 'ILLEGAL_TRANSITION');
  const relAfterSettle: any = boundary.releaseCredits(run.record.operationId);
  check('release sesudah settle ditolak ILLEGAL_TRANSITION', relAfterSettle.ok === false && relAfterSettle.error === 'ILLEGAL_TRANSITION');
  check('saldo tetap (tidak ada efek ganda)', ledger.getBalance(CTX.accountId, T0).total === 5000 - 25);
}

console.log('=== Settle sebagian: aktual < reservasi, sisa kembali ===');
{
  const { ledger, boundary } = freshBoundary();
  const run: any = await boundary.runMeteredOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'chat-part-0001',
    serverEstimate: { tokensIn: 4000, tokensOutAllowance: 2000 }, // estimasi (4000+6000)/200 = 50
  }, async () => ({
    provider: 'gemini', model: 'gemini-3.5-flash-lite',
    usage: { tokensIn: 2000, tokensOut: 1000, tokensCached: 0 }, // aktual 25
    result: 'ok',
  }));
  check('SETTLED 25 dari reservasi 50', run.status === 'SETTLED' && run.settledCredits === 25);
  check('releasedCredits = 25 (sisa reservasi)', run.releasedCredits === 25);
  check('saldo turun tepat 25', ledger.getBalance(CTX.accountId, T0).total === 4975);
}

console.log('=== Kegagalan provider -> release PENUH ===');
{
  const { ledger, boundary } = freshBoundary();
  const run: any = await boundary.runMeteredOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'chat-fail-0001',
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
  }, async () => { throw Object.assign(new Error('provider down'), { code: 'PROVIDER_ERROR' }); });
  check('run gagal -> status RELEASED', run.ok === false && run.status === 'RELEASED');
  check('saldo pulih PENUH', ledger.getBalance(CTX.accountId, T0).total === 5000);
  const settleAfterRelease: any = boundary.settleCredits(run.record.operationId);
  check('settle sesudah release ditolak', settleAfterRelease.ok === false && settleAfterRelease.error === 'ILLEGAL_TRANSITION');
}

console.log('=== Bukti usage hilang -> REQUIRES_REVIEW, tanpa tagihan karangan ===');
{
  const { ledger, boundary } = freshBoundary();
  const run: any = await boundary.runMeteredOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'chat-nousg-001',
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
  }, async () => ({ provider: 'zyrouter', model: 'geminiflash-3.8', usage: null, result: 'teks tanpa usage' }));
  check('status REQUIRES_REVIEW', run.status === 'REQUIRES_REVIEW');
  check('tidak ada settledCredits karangan', run.record.settledCredits === null);
  check('saldo tersedia TIDAK berkurang (reservasi tertahan, bukan terdebit)',
    ledger.getBalance(CTX.accountId, T0).total === 5000 - 25);
  const bal = ledger.getBalance(CTX.accountId, T0);
  check('reserved ledger = 25 (tertahan untuk review)', bal.reserved === 25);
  const bypass: any = boundary.releaseCredits(run.record.operationId);
  check('release otomatis dari REQUIRES_REVIEW ditolak (bypass review)', bypass.ok === false && bypass.error === 'ILLEGAL_TRANSITION');
}

console.log('=== Overage: aktual > reservasi -> review, TANPA debit otomatis ===');
{
  const { ledger, boundary } = freshBoundary();
  const run: any = await boundary.runMeteredOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'chat-over-0001',
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 }, // reservasi 25
  }, async () => ({
    provider: 'gemini', model: 'gemini-3.5-flash-lite',
    usage: { tokensIn: 4000, tokensOut: 2000, tokensCached: 0 }, // aktual (4000+6000)/200 = 50
    result: 'panjang',
  }));
  check('status REQUIRES_REVIEW dengan overage 25', run.status === 'REQUIRES_REVIEW' && run.overageCredits === 25);
  check('tidak ada konsumsi ledger (tanpa debit parsial/otomatis)',
    ledger.listBatches(CTX.accountId).every((b: any) => b.consumedAmount === 0));
}

console.log('=== approvedMaxCredits (R-4): ditolak EKSPLISIT, tidak dibuang ===');
{
  const { boundary } = freshBoundary();
  const res: any = boundary.beginOperation(CTX, {
    featureKey: 'ded-ai/complex', idempotencyKey: 'cap-test-0001', approvedMaxCredits: 100,
  });
  check('estimasi 800 > cap 100 -> ESTIMATE_EXCEEDS_APPROVED_MAX', res.ok === false && res.error === 'ESTIMATE_EXCEEDS_APPROVED_MAX');
  check('estimasi & cap dilaporkan utuh', res.estimatedCredits === 800 && res.approvedMaxCredits === 100);
  check('tidak ada operasi dibuat saat cap terlampaui', boundary._recordCount() === 0);
  const badCap: any = boundary.beginOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'cap-test-0002', approvedMaxCredits: -5,
    serverEstimate: { tokensIn: 10 },
  });
  check('cap tidak valid -> INVALID_APPROVED_MAX', badCap.ok === false && badCap.error === 'INVALID_APPROVED_MAX');
  const withinCap: any = boundary.beginOperation(CTX, {
    featureKey: 'ded-ai/simple', idempotencyKey: 'cap-test-0003', approvedMaxCredits: 500,
  });
  check('estimasi == cap -> diterima', withinCap.ok === true && withinCap.record.estimatedCredits === 500);
}

console.log('=== Keamanan konteks & payload klien ===');
{
  const { boundary } = freshBoundary();
  const noCtx: any = boundary.beginOperation({ accountId: 'x' } as any, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'sec-test-0001', serverEstimate: { tokensIn: 10 },
  });
  check('konteks tidak lengkap -> AUTH_CONTEXT_REQUIRED', noCtx.ok === false && noCtx.error === 'AUTH_CONTEXT_REQUIRED');
  const clientFields: any = boundary.beginOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'sec-test-0002',
    serverEstimate: { tokensIn: 10 }, accountId: 'akun-lain', tokensIn: 1,
  } as any);
  check('field billing klien -> CLIENT_BILLING_FIELDS_FORBIDDEN', clientFields.ok === false && clientFields.error === 'CLIENT_BILLING_FIELDS_FORBIDDEN'
    && clientFields.fields.includes('accountId') && clientFields.fields.includes('tokensIn'));
  check('tidak ada operasi dari payload tercemar', boundary._recordCount() === 0);
  const unknown: any = boundary.beginOperation(CTX, { featureKey: 'fitur-ngawur', idempotencyKey: 'sec-test-0003' });
  check('feature tak dikenal -> UNKNOWN_FEATURE fail-closed', unknown.ok === false && unknown.error === 'UNKNOWN_FEATURE');
  const legacy: any = boundary.beginOperation(CTX, { featureKey: 'ded-ai', idempotencyKey: 'sec-test-0004' });
  check('kunci legacy "ded-ai" -> LEGACY_AMBIGUOUS_FEATURE_KEY', legacy.ok === false && legacy.error === 'LEGACY_AMBIGUOUS_FEATURE_KEY');
  const receipt: any = boundary.beginOperation(CTX, {
    featureKey: 'ai-receipt/scan', idempotencyKey: 'sec-test-0005', serverEstimate: { tokensIn: 10 },
  });
  check('receipt scan (endpoint tidak ada) -> TRANSPORT_UNAVAILABLE', receipt.ok === false && receipt.error === 'TRANSPORT_UNAVAILABLE');
}

console.log('=== Idempotensi: format + scope per akun + replay ===');
check('kunci valid diterima formatnya', isValidIdempotencyKey('ded-run-2026-0001') === true);
check('kunci terlalu pendek ditolak', isValidIdempotencyKey('abc') === false);
check('kunci dengan spasi ditolak', isValidIdempotencyKey('kunci salah') === false);
{
  const { boundary } = freshBoundary();
  let executorCalls = 0;
  const mk = () => boundary.runMeteredOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'idem-run-00001',
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
  }, async () => {
    executorCalls += 1;
    return { provider: 'gemini', model: 'gemini-3.5-flash-lite', usage: { tokensIn: 2000, tokensOut: 1000, tokensCached: 0 }, result: 'x' };
  });
  const first: any = await mk();
  const second: any = await mk();
  check('kunci sama -> satu operasi', first.record.operationId === second.record.operationId);
  check('replay ditandai duplicate', second.duplicate === true);
  check('executor hanya jalan sekali', executorCalls === 1);
  check('record wrapper hanya satu', boundary._recordCount() === 1);
  const badKey: any = boundary.beginOperation(CTX, { featureKey: 'chat-ai/fast', idempotencyKey: 'x', serverEstimate: { tokensIn: 1 } });
  check('kunci malformed -> INVALID_IDEMPOTENCY_KEY', badKey.ok === false && badKey.error === 'INVALID_IDEMPOTENCY_KEY');
}

console.log('=== Reservasi gagal (saldo kurang): FAILED, eksekusi ditolak ===');
{
  const { boundary } = freshBoundary();
  const res: any = boundary.beginOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'insuf-run-0001',
    serverEstimate: { tokensIn: 2_000_000, tokensOutAllowance: 1000 },
  });
  check('reserve ditolak INSUFFICIENT_BALANCE', res.ok === false && res.error === 'INSUFFICIENT_BALANCE');
  check('record berstatus FAILED', res.record.status === 'FAILED');
  const exec: any = boundary.markExecuting(res.record.operationId);
  check('eksekusi sesudah reservasi gagal -> ILLEGAL_TRANSITION', exec.ok === false && exec.error === 'ILLEGAL_TRANSITION');
}

console.log('=== Settle sebelum eksekusi sukses ditolak (step API) ===');
{
  const { boundary } = freshBoundary();
  const begun: any = boundary.beginOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'early-setl-001', serverEstimate: { tokensIn: 100, tokensOutAllowance: 100 },
  });
  check('begin ok (RESERVED)', begun.ok === true && begun.record.status === 'RESERVED');
  const early: any = boundary.settleCredits(begun.record.operationId);
  check('settle dari RESERVED -> ILLEGAL_TRANSITION', early.ok === false && early.error === 'ILLEGAL_TRANSITION');
  const rel: any = boundary.releaseCredits(begun.record.operationId);
  check('release dari RESERVED sah', rel.ok === true && rel.status === 'RELEASED');
  const rel2: any = boundary.releaseCredits(begun.record.operationId);
  check('release ganda (terminal) -> ILLEGAL_TRANSITION', rel2.ok === false && rel2.error === 'ILLEGAL_TRANSITION');
}

console.log('=== Tarif tak dikenal -> review, tanpa harga karangan ===');
{
  const { ledger } = freshLedger();
  const boundary = createAiMeteringBoundary({
    ledger, env: ON, now: () => T0, pricingPolicyVersion: 'kebijakan-ngawur',
  });
  const run: any = await boundary.runMeteredOperation(CTX, {
    featureKey: 'chat-ai/fast', idempotencyKey: 'unk-tariff-001',
    serverEstimate: { tokensIn: 100, tokensOutAllowance: 100 },
  }, async () => ({
    provider: 'gemini', model: 'gemini-3.5-flash-lite',
    usage: { tokensIn: 100, tokensOut: 100, tokensCached: 0 }, result: 'x',
  }));
  // Estimasi sendiri gagal di begin (UNKNOWN_POLICY) ATAU settle ke review —
  // yang wajib: tidak ada angka final karangan dan tidak ada konsumsi.
  check('tidak ada settledCredits karangan', run.record == null || run.record.settledCredits === null);
  check('tidak ada konsumsi ledger', ledger.listBatches(CTX.accountId).every((b: any) => b.consumedAmount === 0));
}

console.log('=== Konsistensi matriks lama tidak berubah ===');
check('chargeDecision matriks untuk ded-ai/medium tetap FLAT_DRAFT', chargeDecision('ded-ai/medium').chargeable === true);
check('estimasi FLAT_DRAFT ded-ai/complex = 800', estimateReservationCredits('ded-ai/complex').estimatedCredits === 800);

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

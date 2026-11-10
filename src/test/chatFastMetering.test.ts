// Suite: Integrasi Chat FAST ke batas metering bersama (Sprint 4 Fase 3+4) —
// api/_lib/chatFastMetering.js (adapter BARU) + titik sisip handleAiRequest
// di api/_lib/aiGateway.js. executeAI TIDAK diubah.
// Bukti utama:
//  - Gerbang MATI: perilaku identik (provider/model/prompt/parsing/struktur
//    respons sama), NOL panggilan boundary, NOL tulis ledger.
//  - Gerbang MENYALA (dependensi MOCK/in-memory): lifecycle bersama
//    reserve→execute→settle; provider gagal → release penuh; bukti hilang
//    → REQUIRES_REVIEW tanpa angka karangan; field billing klien ditolak;
//    identitas fitur turunan server; retry idempoten tanpa settle ganda.
//  - Fitur lain (advanced/vision/DED/Dokumen/generik) TIDAK termeter.
//  - 15 operasi DETERMINISTIC_FREE (Phase 2) / 17 kunci suite deterministik
//    tetap di luar lifecycle debit.
// Jalankan dari root repo: npx --yes tsx src/test/chatFastMetering.test.ts
import {
  runChatFastWithMetering,
  deriveChatFastFeatureKey,
  estimateChatFastServerTokens,
  CHAT_FAST_FEATURE_KEY,
} from '../../api/_lib/chatFastMetering.js';
import * as chatFastModule from '../../api/_lib/chatFastMetering.js';
import {
  createAiMeteringBoundary,
  AI_METERING_ENV_FLAG,
  resolveGatewayFeature,
} from '../../api/_lib/aiMetering.js';
import { createCreditLedger, createMemoryLedgerStore } from '../../api/_lib/creditLedger.js';
import { listFeaturesByClass } from '../../api/_lib/featureBillingMatrix.js';
import { handleAiRequest } from '../../api/_lib/aiGateway.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const T0 = 1_700_000_000_000;
const DAY = 24 * 3600 * 1000;
const CTX = { accountId: 'acct-fast-1', workspaceId: 'ws-1', userId: 'user-1' };
const ON = { [AI_METERING_ENV_FLAG]: 'true' };

function freshOn(accountId = CTX.accountId, amount = 5000) {
  const store = createMemoryLedgerStore();
  const ledger = createCreditLedger(store);
  ledger.grantSubscription({
    accountId, amount, periodStart: T0, periodEnd: T0 + 30 * DAY,
    idempotencyKey: `sub-${accountId}`, now: T0,
  });
  const boundary = createAiMeteringBoundary({ ledger, env: ON, now: () => T0 });
  return { store, ledger, boundary };
}
function snap(ledger: any, acct: string) {
  return {
    entries: ledger.listLedger(acct).length,
    ops: (ledger as any).store.operations.size as number,
    total: ledger.getBalance(acct, T0).total,
    reserved: ledger.getBalance(acct, T0).reserved,
  };
}
function opKinds(ledger: any, acct: string, opId: string) {
  return ledger.listLedger(acct).filter((e: any) => e.operationId === opId).map((e: any) => e.kind);
}

const GATEWAY_OK = {
  ok: true, content: 'jawaban-mock', provider: 'gemini', model: 'gemini-3.5-flash-lite',
  requestId: 'req_mock', attempts: [{ provider: 'gemini', model: 'gemini-3.5-flash-lite', ok: true }],
  usage: { inputTokens: 2000, outputTokens: 1000, cachedTokens: 0, source: 'gemini_usageMetadata' },
};
function mockExecutor(result: any, hook?: (calls: number) => void) {
  const state = { calls: 0 };
  const execute = async () => { state.calls += 1; if (hook) hook(state.calls); return result; };
  return { execute, state };
}
const throwingBoundary: any = {
  runMeteredOperation() { throw new Error('boundary TIDAK boleh dipanggil'); },
};

// =======================================================================
console.log('=== Derivasi fitur server: hanya Chat FAST yang masuk cakupan ===');
check("mode chat (handler chat.js) -> chat-ai/fast", deriveChatFastFeatureKey({ mode: 'chat' }) === CHAT_FAST_FEATURE_KEY);
check("mode chat + EZRAB_AI -> chat-ai/fast", deriveChatFastFeatureKey({ mode: 'chat', productId: 'EZRAB_AI' }) === 'chat-ai/fast');
check("mode fast + EZRAB_AI -> chat-ai/fast", deriveChatFastFeatureKey({ mode: 'fast', productId: 'EZRAB_AI' }) === 'chat-ai/fast');
check("mode fast TANPA productId -> null (rantai fast berbagi DED/Dokumen)", deriveChatFastFeatureKey({ mode: 'fast' }) === null);
check("mode fast + DED_AI_FAST -> null (fitur lain)", deriveChatFastFeatureKey({ mode: 'fast', productId: 'DED_AI_FAST' }) === null);
check("mode fast + DOKUMEN_AI -> null (fitur lain)", deriveChatFastFeatureKey({ mode: 'fast', productId: 'DOKUMEN_AI' }) === null);
check("mode fast + productId asing -> null (fail-closed, tak dikenal)", deriveChatFastFeatureKey({ mode: 'fast', productId: 'PRODUK_ASING' }) === null);
check("mode advanced + EZRAB_AI -> null (chat-ai/advanced, bukan FAST)", deriveChatFastFeatureKey({ mode: 'advanced', productId: 'EZRAB_AI' }) === null);
check("mode vision -> null", deriveChatFastFeatureKey({ mode: 'vision', productId: 'EZRAB_AI' }) === null);
check("mode chat + productId DED -> null (defensif)", deriveChatFastFeatureKey({ mode: 'chat', productId: 'DED_AI_DETAIL' }) === null);
check('konsisten resolveGatewayFeature EZRAB_AI: chat/fast -> fast, advanced -> advanced',
  (resolveGatewayFeature('EZRAB_AI', { mode: 'chat' }) as any).featureKey === 'chat-ai/fast'
  && (resolveGatewayFeature('EZRAB_AI', { mode: 'fast' }) as any).featureKey === 'chat-ai/fast'
  && (resolveGatewayFeature('EZRAB_AI', { mode: 'advanced' }) as any).featureKey === 'chat-ai/advanced');
check('estimasi server: 4000 char -> 1000 token + allowance 1000',
  (() => { const e = estimateChatFastServerTokens({ message: 'x'.repeat(4000) }); return e.tokensIn === 1000 && e.tokensOutAllowance === 1000; })());

// =======================================================================
console.log('=== Gerbang MATI (adapter): bypass total, hasil identik, nol ledger ===');
for (const [label, env] of [
  ['env absen', {}],
  ['env "false"', { [AI_METERING_ENV_FLAG]: 'false' }],
  ['env "1"', { [AI_METERING_ENV_FLAG]: '1' }],
  ['env "TRUE" (kapital)', { [AI_METERING_ENV_FLAG]: 'TRUE' }],
  ['env nilai invalid', { [AI_METERING_ENV_FLAG]: 'menyala' }],
] as Array<[string, any]>) {
  const { execute, state } = mockExecutor(GATEWAY_OK);
  const out: any = await runChatFastWithMetering({
    mode: 'chat', productId: 'EZRAB_AI', env, context: null, boundary: throwingBoundary,
    clientPayload: { accountId: 'klaim-klien', credits: 1 }, // bahkan payload tercemar diabaikan saat mati (bypass sebelum cek)
    idempotencyKey: 'chatfast-off-0001', execute,
  });
  check(`${label}: metered=false, bypass, hasil = objek yang sama persis`, out.metered === false && out.bypassed === true && out.result === GATEWAY_OK);
  check(`${label}: executor jalan tepat sekali`, state.calls === 1);
}
{
  // Bukti nol tulis ledger dengan boundary+ledger NYATA saat gerbang mati.
  const { ledger, boundary } = freshOn();
  const before = snap(ledger, CTX.accountId);
  const { execute } = mockExecutor(GATEWAY_OK);
  const out: any = await runChatFastWithMetering({
    mode: 'fast', productId: 'EZRAB_AI', env: {}, context: CTX, boundary,
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-off-ledger', execute,
  });
  const after = snap(ledger, CTX.accountId);
  check('gerbang mati + boundary nyata: hasil tetap jawaban mock', out.result === GATEWAY_OK);
  check('gerbang mati: NOL record wrapper', boundary._recordCount() === 0);
  check('gerbang mati: NOL operasi, NOL entri ledger, saldo & reserved utuh',
    after.ops === before.ops && after.entries === before.entries && after.total === before.total && after.reserved === 0);
}
{
  // Paritas keluaran: jalur asli (executor langsung) vs adapter gerbang mati.
  const direct: any = await mockExecutor(GATEWAY_OK).execute();
  const { execute } = mockExecutor(GATEWAY_OK);
  const via: any = await runChatFastWithMetering({
    mode: 'chat', env: { [AI_METERING_ENV_FLAG]: 'false' }, boundary: throwingBoundary, execute,
  });
  check('paritas gate-OFF vs jalur asli: JSON identik', JSON.stringify(via.result) === JSON.stringify(direct));
  check('paritas: provider/model/content/usage sama',
    via.result.provider === direct.provider && via.result.model === direct.model
    && via.result.content === direct.content && via.result.usage.inputTokens === 2000);
}

// =======================================================================
console.log('=== Gerbang MENYALA: lifecycle reserve → execute → settle ===');
{
  const { ledger, boundary } = freshOn();
  let reservedDuringExecute = -1;
  let statusDuringExecute = '';
  const { execute, state } = mockExecutor(GATEWAY_OK, () => {
    reservedDuringExecute = ledger.getBalance(CTX.accountId, T0).reserved;
    const ops = [...(ledger as any).store.operations.values()] as any[];
    statusDuringExecute = ops[ops.length - 1].status;
  });
  const out: any = await runChatFastWithMetering({
    mode: 'chat', productId: 'EZRAB_AI', env: ON, context: CTX, boundary,
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 }, // estimasi 25
    idempotencyKey: 'chatfast-on-0001', execute,
  });
  check('SETTLED', out.metered === true && out.ok === true && out.status === 'SETTLED');
  check('settledCredits = 25 dari usage aktual (2000 in + 1000 out ×3)/200', out.settledCredits === 25);
  check('identitas record: akun konteks + fitur turunan server', out.record.accountId === CTX.accountId
    && out.record.workspaceId === 'ws-1' && out.record.userId === 'user-1' && out.record.featureKey === 'chat-ai/fast');
  check('reservasi ADA sebelum executor jalan (reserved=25 saat execute)', reservedDuringExecute === 25);
  check('status ledger saat execute = RESERVED (urutan reserve→execute)', statusDuringExecute === 'RESERVED');
  check('executor tepat sekali', state.calls === 1);
  check('saldo turun tepat 25, reserved kembali 0', ledger.getBalance(CTX.accountId, T0).total === 4975 && ledger.getBalance(CTX.accountId, T0).reserved === 0);
  check('urutan entri ledger operasi: RESERVE lalu CONSUME', JSON.stringify(opKinds(ledger, CTX.accountId, out.record.operationId)) === JSON.stringify(['RESERVE', 'CONSUME']));
  check('hasil AI diteruskan utuh', out.result === GATEWAY_OK);
}
console.log('=== Gerbang MENYALA: settle sebagian (aktual < reservasi) ===');
{
  const { ledger, boundary } = freshOn();
  const { execute } = mockExecutor(GATEWAY_OK);
  const out: any = await runChatFastWithMetering({
    mode: 'fast', productId: 'EZRAB_AI', env: ON, context: CTX, boundary,
    serverEstimate: { tokensIn: 4000, tokensOutAllowance: 2000 }, // estimasi 50
    idempotencyKey: 'chatfast-on-part1', execute,
  });
  check('SETTLED 25 dari reservasi 50, released 25', out.status === 'SETTLED' && out.settledCredits === 25 && out.releasedCredits === 25);
  check('entri: RESERVE, CONSUME, RESERVE_RELEASE', JSON.stringify(opKinds(ledger, CTX.accountId, out.record.operationId)) === JSON.stringify(['RESERVE', 'CONSUME', 'RESERVE_RELEASE']));
  check('saldo turun tepat 25', ledger.getBalance(CTX.accountId, T0).total === 4975);
}
console.log('=== Gerbang MENYALA: estimasi reservasi diturunkan server dari teks ===');
{
  const { boundary } = freshOn();
  const small = { ...GATEWAY_OK, usage: { inputTokens: 500, outputTokens: 1000, cachedTokens: 0, source: 'oai_usage' } };
  const { execute } = mockExecutor(small);
  const out: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: CTX, boundary,
    message: 'x'.repeat(2000), systemPrompt: '', // tokensIn server = 500; estimasi (500+3000)/200 = 18
    idempotencyKey: 'chatfast-on-est1', execute,
  });
  check('estimatedCredits record = 18 (turunan server, bukan klien)', out.record.estimatedCredits === 18);
  check('SETTLED 18 dari usage aktual yang sama', out.status === 'SETTLED' && out.settledCredits === 18);
}

// =======================================================================
console.log('=== Gerbang MENYALA: kegagalan provider → release PENUH ===');
{
  const { ledger, boundary } = freshOn();
  const FAILED = { ok: false, error: 'Gemini 500', requestId: 'req_mock', attempts: [] };
  const { execute } = mockExecutor(FAILED);
  const out: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: CTX, boundary,
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-on-fail1', execute,
  });
  check('status RELEASED dan hasil gateway gagal diteruskan apa adanya', out.metered === true && out.ok === false && out.status === 'RELEASED' && out.result === FAILED);
  check('saldo pulih PENUH 5000', ledger.getBalance(CTX.accountId, T0).total === 5000 && ledger.getBalance(CTX.accountId, T0).reserved === 0);
  check('entri: RESERVE, RESERVE_RELEASE — tanpa CONSUME', JSON.stringify(opKinds(ledger, CTX.accountId, out.record.operationId)) === JSON.stringify(['RESERVE', 'RESERVE_RELEASE']));
}
console.log('=== Gerbang MENYALA: bukti usage hilang/tidak lengkap → REQUIRES_REVIEW ===');
for (const [label, usage] of [
  ['usage null', null],
  ['inputTokens null', { inputTokens: null, outputTokens: 1000, cachedTokens: 0 }],
] as Array<[string, any]>) {
  const { ledger, boundary } = freshOn();
  const res = { ...GATEWAY_OK, usage };
  const { execute } = mockExecutor(res);
  const out: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: CTX, boundary,
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-on-nousg1', execute,
  });
  check(`${label}: REQUIRES_REVIEW`, out.status === 'REQUIRES_REVIEW');
  check(`${label}: jawaban tetap diteruskan (result ada)`, out.result === res);
  check(`${label}: settledCredits null — TANPA token/angka karangan`, out.record.settledCredits === null);
  check(`${label}: reservasi tertahan 25, saldo tersedia 4975, TANPA entri CONSUME`,
    ledger.getBalance(CTX.accountId, T0).reserved === 25 && ledger.getBalance(CTX.accountId, T0).total === 4975
    && !opKinds(ledger, CTX.accountId, out.record.operationId).includes('CONSUME'));
  const bypass: any = boundary.releaseCredits(out.record.operationId);
  check(`${label}: release otomatis dari review ditolak ILLEGAL_TRANSITION (tak bisa menyetujui/melepas sendiri)`,
    bypass.ok === false && bypass.error === 'ILLEGAL_TRANSITION');
}

// =======================================================================
console.log('=== Gerbang MENYALA: fail-closed sebelum provider berjalan ===');
{
  const { ledger, boundary } = freshOn();
  const before = snap(ledger, CTX.accountId);
  const { execute, state } = mockExecutor(GATEWAY_OK);
  const noCtx: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: null, boundary,
    serverEstimate: { tokensIn: 10 }, idempotencyKey: 'chatfast-fc-001', execute,
  });
  check('tanpa konteks terautentikasi → AUTH_CONTEXT_REQUIRED', noCtx.ok === false && noCtx.error === 'AUTH_CONTEXT_REQUIRED' && noCtx.result === null);
  const partialCtx: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: { accountId: 'hanya-akun' } as any, boundary,
    serverEstimate: { tokensIn: 10 }, idempotencyKey: 'chatfast-fc-002', execute,
  });
  check('konteks parsial → AUTH_CONTEXT_REQUIRED (accountId tak difabrikasi dari userId)', partialCtx.error === 'AUTH_CONTEXT_REQUIRED');
  const noBoundary: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: CTX, boundary: null,
    serverEstimate: { tokensIn: 10 }, idempotencyKey: 'chatfast-fc-003', execute,
  });
  check('tanpa boundary → METERING_BOUNDARY_UNAVAILABLE', noBoundary.error === 'METERING_BOUNDARY_UNAVAILABLE');
  const cap: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: CTX, boundary, approvedMaxCredits: 10,
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-fc-004', execute,
  });
  check('estimasi 25 > approvedMax server 10 → ESTIMATE_EXCEEDS_APPROVED_MAX', cap.error === 'ESTIMATE_EXCEEDS_APPROVED_MAX');
  const poor: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: CTX, boundary,
    serverEstimate: { tokensIn: 2_000_000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-fc-005', execute,
  });
  check('saldo kurang → INSUFFICIENT_BALANCE', poor.error === 'INSUFFICIENT_BALANCE');
  check('SEMUA penolakan fail-closed: executor TIDAK pernah jalan', state.calls === 0);
  const after = snap(ledger, CTX.accountId);
  check('saldo utuh sesudah semua penolakan pra-eksekusi', after.total === before.total && after.reserved === 0);
}

// =======================================================================
console.log('=== Fase 4 audit: klien tidak bisa memilih fitur/biaya/akun/settlement ===');
{
  const { ledger, boundary } = freshOn();
  // Setiap field billing klien ditolak satu per satu; executor tak jalan.
  for (const field of ['accountId', 'workspaceId', 'userId', 'credits', 'actualCredits', 'tokensIn', 'tokensOut', 'tariffVersion', 'provider', 'model', 'price', 'cost']) {
    const { execute, state } = mockExecutor(GATEWAY_OK);
    const out: any = await runChatFastWithMetering({
      mode: 'chat', env: ON, context: CTX, boundary,
      clientPayload: { message: 'halo', [field]: 'klaim-klien' },
      serverEstimate: { tokensIn: 100 }, idempotencyKey: `chatfast-audit-${field}`, execute,
    });
    check(`field klien "${field}" → CLIENT_BILLING_FIELDS_FORBIDDEN, executor 0`,
      out.ok === false && out.error === 'CLIENT_BILLING_FIELDS_FORBIDDEN' && out.fields.includes(field) && state.calls === 0);
  }
  check('tak ada operasi dari payload tercemar', boundary._recordCount() === 0 && snap(ledger, CTX.accountId).ops === 0);

  // Klien/ pemanggil mengusulkan featureKey lain lewat argumen: diabaikan —
  // adapter tidak membaca featureKey sama sekali; derivasi server menang.
  const { execute } = mockExecutor(GATEWAY_OK);
  const forced: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: CTX, boundary,
    featureKey: 'ded-ai/simple', credits: 1, // usulan asing — harus diabaikan
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-audit-force', execute,
  } as any);
  check('featureKey usulan ("ded-ai/simple") diabaikan → record tetap chat-ai/fast', forced.record.featureKey === 'chat-ai/fast');
  check('biaya tetap dari usage aktual (25), bukan usulan credits=1', forced.settledCredits === 25);
}
{
  // Isolasi akun: konteks A yang ditagih; akun B utuh; klaim akun B ditolak.
  const store = createMemoryLedgerStore();
  const ledger = createCreditLedger(store);
  for (const acct of ['acct-iso-a', 'acct-iso-b']) {
    ledger.grantSubscription({ accountId: acct, amount: 5000, periodStart: T0, periodEnd: T0 + 30 * DAY, idempotencyKey: `sub-${acct}`, now: T0 });
  }
  const boundary = createAiMeteringBoundary({ ledger, env: ON, now: () => T0 });
  const ctxA = { accountId: 'acct-iso-a', workspaceId: 'ws-a', userId: 'user-a' };
  const { execute } = mockExecutor(GATEWAY_OK);
  const out: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: ctxA, boundary,
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-iso-0001', execute,
  });
  check('debit hanya ke akun konteks (A 4975), akun lain utuh (B 5000)',
    out.status === 'SETTLED' && ledger.getBalance('acct-iso-a', T0).total === 4975 && ledger.getBalance('acct-iso-b', T0).total === 5000);
  const spoof: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: ctxA, boundary,
    clientPayload: { accountId: 'acct-iso-b' },
    serverEstimate: { tokensIn: 100 }, idempotencyKey: 'chatfast-iso-0002', execute: mockExecutor(GATEWAY_OK).execute,
  });
  check('klaim accountId akun lain di payload → ditolak', spoof.error === 'CLIENT_BILLING_FIELDS_FORBIDDEN');
}
{
  // Fitur tak dikenal: fail-closed di batas bersama; adapter tak punya jalur asing.
  const { boundary } = freshOn();
  const unknown: any = boundary.beginOperation(CTX, { featureKey: 'fitur-ngawur', idempotencyKey: 'chatfast-unk-001' });
  check('boundary: feature tak dikenal → UNKNOWN_FEATURE', unknown.ok === false && unknown.error === 'UNKNOWN_FEATURE');
  check('adapter tidak mengekspor resolve/settle/release/review apa pun (tak bisa menyetujui review sendiri)',
    !('resolveReview' in chatFastModule) && !('settleCredits' in chatFastModule) && !('releaseCredits' in chatFastModule));
}
console.log('=== Retry idempoten: tanpa eksekusi/settle ganda ===');
{
  const { ledger, boundary } = freshOn();
  const { execute, state } = mockExecutor(GATEWAY_OK);
  const args = {
    mode: 'chat', env: ON, context: CTX, boundary,
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-idem-001', execute,
  };
  const first: any = await runChatFastWithMetering(args);
  const entriesAfterFirst = snap(ledger, CTX.accountId).entries;
  const second: any = await runChatFastWithMetering(args);
  check('kunci sama → executor hanya sekali', state.calls === 1);
  check('replay ditandai duplicate + status terminal SETTLED dipertahankan', second.duplicate === true && second.status === 'SETTLED');
  check('replay TIDAK mengarang hasil AI baru (result null)', second.result === null);
  check('tepat satu operasi; saldo terdebit sekali (4975); entri ledger tak bertambah',
    snap(ledger, CTX.accountId).ops === 1 && ledger.getBalance(CTX.accountId, T0).total === 4975
    && snap(ledger, CTX.accountId).entries === entriesAfterFirst);
  check('operationId replay sama dengan operasi pertama', second.record.operationId === first.record.operationId);
}
console.log('=== Transisi lifecycle tak sah: nol tulis ledger tambahan (state machine bersama) ===');
{
  const { ledger, boundary } = freshOn();
  const { execute } = mockExecutor(GATEWAY_OK);
  const out: any = await runChatFastWithMetering({
    mode: 'chat', env: ON, context: CTX, boundary,
    serverEstimate: { tokensIn: 2000, tokensOutAllowance: 1000 },
    idempotencyKey: 'chatfast-illegal-1', execute,
  });
  const before = snap(ledger, CTX.accountId);
  const settle2: any = boundary.settleCredits(out.record.operationId);
  const release2: any = boundary.releaseCredits(out.record.operationId);
  const exec2: any = boundary.markExecuting(out.record.operationId);
  check('settle kedua → ILLEGAL_TRANSITION', settle2.ok === false && settle2.error === 'ILLEGAL_TRANSITION');
  check('release sesudah settle → ILLEGAL_TRANSITION', release2.ok === false && release2.error === 'ILLEGAL_TRANSITION');
  check('executing sesudah settle → ILLEGAL_TRANSITION', exec2.ok === false && exec2.error === 'ILLEGAL_TRANSITION');
  const after = snap(ledger, CTX.accountId);
  check('nol entri/operasi tambahan dari transisi tak sah', after.entries === before.entries && after.ops === before.ops && after.total === before.total);
}

// =======================================================================
console.log('=== Fitur lain TIDAK termeter walau gerbang MENYALA ===');
for (const [label, op] of [
  ['advanced EZRAB_AI', { mode: 'advanced', productId: 'EZRAB_AI' }],
  ['vision EZRAB_AI', { mode: 'vision', productId: 'EZRAB_AI' }],
  ['fast DED_AI_FAST', { mode: 'fast', productId: 'DED_AI_FAST' }],
  ['fast DOKUMEN_AI', { mode: 'fast', productId: 'DOKUMEN_AI' }],
  ['fast generik tanpa productId', { mode: 'fast', productId: undefined }],
  ['chat DED_AI_DETAIL (defensif)', { mode: 'chat', productId: 'DED_AI_DETAIL' }],
] as Array<[string, any]>) {
  const { execute, state } = mockExecutor(GATEWAY_OK);
  const out: any = await runChatFastWithMetering({
    ...op, env: ON, context: null, boundary: throwingBoundary,
    idempotencyKey: 'chatfast-oos-0001', execute,
  });
  check(`${label}: metered=false, hasil utuh, executor jalan (boundary tak disentuh)`,
    out.metered === false && out.result === GATEWAY_OK && state.calls === 1);
}

// =======================================================================
console.log('=== DETERMINISTIC_FREE tetap di luar lifecycle debit (klasifikasi tak diubah) ===');
{
  const { ledger, boundary } = freshOn();
  const keys = [
    ...listFeaturesByClass('DETERMINISTIC_FREE'),
    'qto-calculation', 'unit-conversion', 'local-validation',
    'document-parsing', 'master-price-matching', 'rab-review-local',
  ];
  check('jumlah kunci deterministik suite: 11 matriks + 6 tambahan = 17', keys.length === 17);
  const before = snap(ledger, CTX.accountId);
  let allRejected = true;
  let allFree = true;
  keys.forEach((key, i) => {
    const cls: any = boundary.classify(key);
    if (!(cls.ok === true && cls.chargeable === false && cls.credits === 0)) allFree = false;
    const attempt: any = boundary.beginOperation(CTX, {
      featureKey: key, idempotencyKey: `chatfast-free-${i}-x`, serverEstimate: { tokensIn: 100 },
    });
    if (!(attempt.ok === false && attempt.error === 'DETERMINISTIC_FREE_NOT_METERABLE')) allRejected = false;
  });
  check('semua kunci deterministik: classify chargeable=false, credits 0', allFree);
  check('semua kunci deterministik: beginOperation ditolak DETERMINISTIC_FREE_NOT_METERABLE', allRejected);
  const after = snap(ledger, CTX.accountId);
  check('nol operasi/entri/reservasi dari seluruh kunci deterministik',
    after.ops === before.ops && after.entries === before.entries && after.reserved === 0 && boundary._recordCount() === 0);
}

// =======================================================================
console.log('=== Level HTTP (handleAiRequest + fetch stub deterministik) ===');
{
  const savedFetch = (globalThis as any).fetch;
  const envKeysToClear = [
    'CROWN_API_KEY', 'ATMO_API_KEY', 'ZYROUTER_API_KEY', 'ZROUTER_API_KEY',
    'RIVER_API_KEY_1', 'DAHL_API_KEY_1', 'ATRIA_API_KEY_1', 'GEMINI_OAI_KEY_1',
    'GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5', 'GEMINI_API_KEY_6',
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AI_GATEWAY_TOKEN', 'AI_METERING_ENABLED', 'AI_ALLOW_ANONYMOUS',
  ];
  const savedEnv: Record<string, string | undefined> = {};
  for (const k of envKeysToClear) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  process.env.GEMINI_API_KEY_1 = 'dummy-gemini-key';

  let usageStub = { promptTokenCount: 2000, candidatesTokenCount: 1000, totalTokenCount: 3000 };
  const fetchCalls: any[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    fetchCalls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
    const payload = {
      candidates: [{ content: { parts: [{ text: 'HALO-DARI-GEMINI' }] } }],
      usageMetadata: usageStub,
    };
    return {
      ok: true, status: 200, headers: { get: () => 'application/json' },
      json: async () => payload, text: async () => JSON.stringify(payload),
    };
  };
  const mockReq = (body: any) => ({ method: 'POST', headers: {}, body, socket: { remoteAddress: '127.0.0.1' } });
  const mockRes = () => {
    const r: any = {
      statusCode: null, body: null, headers: {} as Record<string, string>,
      setHeader(k: string, v: string) { this.headers[k] = v; },
      status(c: number) { this.statusCode = c; return this; },
      json(b: any) { this.body = b; return this; },
      end() { return this; },
    };
    return r;
  };
  const chatOpts = { productIdToMode: () => 'chat' };
  const chatBody = { message: 'halo ezrab', productId: 'EZRAB_AI', systemPrompt: 'Jawab ringkas.' };

  // --- Gerbang mati (absen): paritas penuh di level HTTP ---
  fetchCalls.length = 0;
  const resOff: any = mockRes();
  await handleAiRequest(mockReq(chatBody) as any, resOff, chatOpts);
  check('HTTP gate OFF: 200 success', resOff.statusCode === 200 && resOff.body.success === true);
  check('HTTP gate OFF: content/provider/model/mode sama dengan jalur asli',
    resOff.body.content === 'HALO-DARI-GEMINI' && resOff.body.provider === 'gemini'
    && resOff.body.model === 'gemini-3.5-flash-lite' && resOff.body.mode === 'chat');
  check('HTTP gate OFF: struktur respons persis {success,content,model,provider,mode,requestId,durationMs,usage,usageStatus,attempts}',
    JSON.stringify(Object.keys(resOff.body).sort()) === JSON.stringify(['attempts', 'content', 'durationMs', 'mode', 'model', 'provider', 'requestId', 'success', 'usage', 'usageStatus']));
  check('HTTP gate OFF: provider dipanggil sekali', fetchCalls.length === 1);
  {
    const contents = fetchCalls[0].body.contents;
    const systemText = contents[0].parts[0].text;
    const userText = contents[contents.length - 1].parts[0].text;
    check('HTTP gate OFF: prompt ke provider = kebijakan server + prompt klien + pesan sama seperti semula',
      systemText.includes('KEBIJAKAN SERVER EZRAB') && systemText.includes('Jawab ringkas.') && userText === 'halo ezrab');
  }
  // --- Gerbang mati (varian nilai): hasil sama ---
  for (const v of ['false', '1']) {
    process.env.AI_METERING_ENABLED = v;
    fetchCalls.length = 0;
    const r: any = mockRes();
    await handleAiRequest(mockReq(chatBody) as any, r, chatOpts);
    check(`HTTP gate "${v}": tetap 200 dengan content/provider/model sama`,
      r.statusCode === 200 && r.body.content === 'HALO-DARI-GEMINI' && r.body.provider === 'gemini' && r.body.model === 'gemini-3.5-flash-lite');
  }
  // --- Gerbang menyala tanpa konteks/boundary: fail-closed, provider tak jalan ---
  process.env.AI_METERING_ENABLED = 'true';
  fetchCalls.length = 0;
  const resOnNoCtx: any = mockRes();
  await handleAiRequest(mockReq(chatBody) as any, resOnNoCtx, chatOpts);
  check('HTTP gate ON tanpa konteks: 401 AUTH_CONTEXT_REQUIRED', resOnNoCtx.statusCode === 401 && resOnNoCtx.body.errorCode === 'AUTH_CONTEXT_REQUIRED' && resOnNoCtx.body.success === false);
  check('HTTP gate ON tanpa konteks: provider TIDAK dipanggil', fetchCalls.length === 0);
  // --- Gerbang menyala dengan konteks+boundary suntikan: SETTLED lewat HTTP ---
  usageStub = { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 };
  const http = freshOn('acct-http-1');
  const ctxHttp = { accountId: 'acct-http-1', workspaceId: 'ws-http', userId: 'user-http' };
  fetchCalls.length = 0;
  const resOn: any = mockRes();
  await handleAiRequest(mockReq(chatBody) as any, resOn, {
    productIdToMode: () => 'chat', meteringContext: ctxHttp, meteringBoundary: http.boundary,
  });
  check('HTTP gate ON terkonteks: 200 dengan content asli', resOn.statusCode === 200 && resOn.body.content === 'HALO-DARI-GEMINI');
  const recHttp: any = http.boundary.findByIdempotencyKey('acct-http-1', `chatfast-${resOn.body.requestId}`);
  const opsHttp = [...(http.ledger as any).store.operations.values()] as any[];
  check('HTTP gate ON terkonteks: tepat satu operasi SETTLED chat-ai/fast',
    opsHttp.length === 1 && opsHttp[0].feature === 'chat-ai/fast' && opsHttp[0].status === 'SETTLED');
  check('HTTP gate ON terkonteks: settled dari usage aktual stub (100 in + 50 out×3)/200 → 2 kredit; saldo 4998',
    opsHttp[0].settledCredits === 2 && http.ledger.getBalance('acct-http-1', T0).total === 4998);
  check('HTTP gate ON terkonteks: record wrapper terindeks kunci idempotensi turunan requestId',
    recHttp !== null && recHttp.status === 'SETTLED' && recHttp.featureKey === 'chat-ai/fast');
  // --- Gerbang menyala: fitur lain lewat HTTP tetap tak termeter ---
  fetchCalls.length = 0;
  const resDed: any = mockRes();
  await handleAiRequest(mockReq({ message: 'analisis ded', productId: 'DED_AI_FAST' }) as any, resDed, { productIdToMode: () => 'fast' });
  check('HTTP gate ON: DED_AI_FAST (mode fast) tetap 200 normal tanpa metering', resDed.statusCode === 200 && resDed.body.content === 'HALO-DARI-GEMINI');
  const resAdv: any = mockRes();
  await handleAiRequest(mockReq(chatBody) as any, resAdv, { productIdToMode: () => 'advanced' });
  check('HTTP gate ON: mode advanced tetap 200 normal tanpa metering', resAdv.statusCode === 200 && resAdv.body.content === 'HALO-DARI-GEMINI');

  // Pulihkan env & fetch (proses tes saja — tidak persisten ke mana pun).
  delete process.env.AI_METERING_ENABLED;
  delete process.env.GEMINI_API_KEY_1;
  for (const k of envKeysToClear) { if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k]; }
  (globalThis as any).fetch = savedFetch;
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

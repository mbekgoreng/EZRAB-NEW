// Suite: Pengerasan handler billing/webhook Midtrans (Phase 2 W5).
// Bagian A — LEVEL HANDLER (api/credits/[action].js, tanpa DB nyata):
//   - pengecualian service → 500 BILLING_BACKEND_ERROR tersanitasi (bukan crash)
//   - signature invalid → 400 INVALID_SIGNATURE (sebelum query DB apa pun)
//   - repo belum terkonfigurasi → 503 BILLING_NOT_CONFIGURED (jujur)
//   - endpoint bootstrap ada + tergated auth (401 tanpa JWT)
// Bagian B — LEVEL SERVICE (InMemory, mirror billingWebhook.test.ts):
//   - notifikasi duplikat → hasil sama, tanpa grant kedua (idempoten)
//   - signature invalid → ditolak + terjurnal REJECTED_SIGNATURE
//   - settlement langganan → langganan ACTIVE + hak starter
//   - deny → order FAILED tanpa grant
// Tanpa jaringan/DB nyata, kecuali satu fetch ke 127.0.0.1:1 yang sengaja
// gagal (simulasi repo Supabase yang tidak dapat dijangkau).
// Jalankan dari root repo: npx --yes tsx src/test/bootstrapMidtransWebhookHardening.test.ts
import handler from '../../api/credits/[action].js';
import { InMemoryBillingRepository, loadLedgerSnapshot } from '../../api/_lib/billingStore.js';
import { createBillingService } from '../../api/_lib/billingService.js';
import { createCreditLedger } from '../../api/_lib/creditLedger.js';
import { computeNotificationSignature } from '../../api/_lib/midtrans.js';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}`); }
}

// ---------------------------------------------------------------------------
// Bagian A — handler
// ---------------------------------------------------------------------------

const KEY = 'sk_test_hardening';
const DUMMY_SERVICE_KEY = 'dummy-service-key-hardening';

function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: null,
    headersSent: false,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    json(obj: any) { this.body = obj; return this; },
    end() { return this; },
  };
  return res;
}

function fakeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    headers: {},
    query: { action: 'webhook' },
    body: {},
    ...overrides,
  } as any;
}

function signedNotification(orderId: string, gross: string, status: string, key = KEY) {
  const n: Record<string, unknown> = {
    order_id: orderId,
    status_code: '200',
    gross_amount: gross,
    transaction_status: status,
    payment_type: 'qris',
  };
  n.signature_key = computeNotificationSignature({
    orderId, statusCode: '200', grossAmount: gross, serverKey: key,
  });
  return n;
}

// Simpan + pulihkan env agar suite tidak mencemari proses.
const ENV_KEYS = ['MIDTRANS_SERVER_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_ANON_KEY', 'AI_ALLOW_ANONYMOUS'];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
function setEnv(patch: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

console.log('=== [A1] Handler webhook: signature invalid → 400, sebelum DB ===');
{
  setEnv({ MIDTRANS_SERVER_KEY: KEY });
  const req = fakeReq({ body: { ...signedNotification('EZR-A1', '54999.00', 'settlement'), signature_key: '0'.repeat(128) } });
  const res = fakeRes();
  await handler(req, res);
  check('signature invalid → 400 INVALID_SIGNATURE', res.statusCode === 400 && res.body?.error === 'INVALID_SIGNATURE');
  check('respons 400 tidak memuat Server Key', !JSON.stringify(res.body).includes(KEY));
}

console.log('=== [A2] Handler webhook: signature valid + repo belum ada → 503 jujur ===');
{
  setEnv({ MIDTRANS_SERVER_KEY: KEY });
  const req = fakeReq({ body: signedNotification('EZR-A2', '54999.00', 'settlement') });
  const res = fakeRes();
  await handler(req, res);
  check('tanpa repo → 503 BILLING_NOT_CONFIGURED', res.statusCode === 503 && res.body?.error === 'BILLING_NOT_CONFIGURED');
}

console.log('=== [A3] Handler webhook: repo melempar → 500 tersanitasi, bukan crash ===');
{
  setEnv({
    MIDTRANS_SERVER_KEY: KEY,
    SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SERVICE_ROLE_KEY: DUMMY_SERVICE_KEY,
    SUPABASE_ANON_KEY: 'dummy-anon-key',
  });
  const req = fakeReq({ body: signedNotification('EZR-A3', '54999.00', 'settlement') });
  const res = fakeRes();
  let threw = false;
  try {
    await handler(req, res);
  } catch {
    threw = true;
  }
  check('handler TIDAK melempar saat repo gagal (promise resolve)', threw === false);
  check('repo gagal → 500 BILLING_BACKEND_ERROR', res.statusCode === 500 && res.body?.error === 'BILLING_BACKEND_ERROR');
  const bodyText = JSON.stringify(res.body);
  check('respons 500 tidak memuat stack', !bodyText.includes('stack') && !bodyText.includes('Error:'));
  check('respons 500 tidak memuat Server Key Midtrans', !bodyText.includes(KEY));
  check('respons 500 tidak memuat service key Supabase', !bodyText.includes(DUMMY_SERVICE_KEY));
  check('respons 500 tidak memuat alamat backend', !bodyText.includes('127.0.0.1'));
}

console.log('=== [A4] Handler: aksi tak dikenal + method salah ===');
{
  setEnv({ MIDTRANS_SERVER_KEY: KEY });
  const res404 = fakeRes();
  await handler(fakeReq({ query: { action: 'tidak-ada' } }), res404);
  check('aksi tak dikenal → 404 NOT_FOUND', res404.statusCode === 404 && res404.body?.error === 'NOT_FOUND');
  const res405 = fakeRes();
  await handler(fakeReq({ method: 'GET' }), res405);
  check('webhook GET → 405', res405.statusCode === 405);
}

console.log('=== [A5] Handler bootstrap: ada + tergated auth ===');
{
  setEnv({
    SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SERVICE_ROLE_KEY: DUMMY_SERVICE_KEY,
    SUPABASE_ANON_KEY: 'dummy-anon-key',
  });
  const res = fakeRes();
  await handler(fakeReq({ query: { action: 'bootstrap' }, body: {} }), res);
  check('bootstrap tanpa JWT → 401 AUTH_REQUIRED (bukan 404/crash)', res.statusCode === 401 && res.body?.errorCode === 'AUTH_REQUIRED');
  const resGet = fakeRes();
  await handler(fakeReq({ method: 'GET', query: { action: 'bootstrap' } }), resGet);
  check('bootstrap GET → 405', resGet.statusCode === 405);
  setEnv({ MIDTRANS_SERVER_KEY: KEY }); // tanpa service Supabase:
  const res503 = fakeRes();
  await handler(fakeReq({ query: { action: 'bootstrap' }, body: {} }), res503);
  check('bootstrap tanpa service Supabase → 503 BOOTSTRAP_NOT_CONFIGURED', res503.statusCode === 503 && res503.body?.error === 'BOOTSTRAP_NOT_CONFIGURED');
}

restoreEnv();

// ---------------------------------------------------------------------------
// Bagian B — service (InMemory)
// ---------------------------------------------------------------------------

const MID_CFG = { serverKey: KEY, isProduction: false, snapHost: 'https://app.sandbox.midtrans.com' };
const OWNER = { ok: true, method: 'jwt', user: { id: 'user-owner', email: 'owner@example.id', isAnonymous: false } };
const T0 = Date.UTC(2026, 10, 19, 0, 0, 0);
let orderSeq = 0;
const okFetch = async () => ({ ok: true, status: 201, json: async () => ({ token: 'tok', redirect_url: 'https://pay.example' }) });

function setupService() {
  const repo = new InMemoryBillingRepository();
  repo.seedMembership('ws-1', 'user-owner', 'SUPER_ADMIN');
  const service = createBillingService({
    repo,
    midtransConfig: MID_CFG,
    fetchImpl: okFetch,
    now: () => T0,
    newOrderId: () => `EZR-HARD-${++orderSeq}`,
  });
  return { repo, service };
}

async function balanceOf(repo: InMemoryBillingRepository, accountId: string) {
  const snap = await loadLedgerSnapshot(repo, accountId, { ownerUserId: 'user-owner', workspaceId: 'ws-1' });
  return createCreditLedger(snap.store).getBalance(accountId, T0);
}

async function paidGrantEntries(repo: InMemoryBillingRepository, accountId: string) {
  const snap = await loadLedgerSnapshot(repo, accountId, { ownerUserId: 'user-owner', workspaceId: 'ws-1' });
  const freeOnceBatchIds = new Set(
    [...snap.store.batches.values()].filter((b: any) => b.type === 'FREE_ONCE').map((b: any) => b.id),
  );
  return snap.store.ledger.filter((e: any) => e.kind === 'GRANT' && !freeOnceBatchIds.has(e.batchId));
}

console.log('=== [B1] Service: notifikasi duplikat → hasil sama, tanpa grant kedua ===');
{
  const { repo, service } = setupService();
  const co: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  const account = await repo.getBillingAccountByWorkspace('ws-1');
  const r1: any = await service.handleNotification(signedNotification(co.orderId, '54999.00', 'settlement'));
  check('settlement pertama → granted', r1.ok === true && r1.granted === true);
  const r2: any = await service.handleNotification(signedNotification(co.orderId, '54999.00', 'settlement'));
  check('replay → duplicate:true, granted:false', r2.ok === true && r2.duplicate === true && r2.granted === false);
  const bal: any = await balanceOf(repo, account!.id);
  check('saldo langganan tetap 5.000 sesudah replay', bal.subscriptionAvailable === 5000);
  check('entri GRANT berbayar tetap 1 sesudah replay', (await paidGrantEntries(repo, account!.id)).length === 1);
  const r3: any = await service.handleNotification(signedNotification(co.orderId, '54999.00', 'settlement'));
  check('replay kedua juga konvergen (duplicate)', r3.ok === true && r3.duplicate === true && r3.granted === false);
}

console.log('=== [B2] Service: signature invalid → ditolak + terjurnal ===');
{
  const { repo, service } = setupService();
  const bad = { ...signedNotification('EZR-B2', '54999.00', 'settlement'), signature_key: 'f'.repeat(128) };
  const r: any = await service.handleNotification(bad);
  check('signature invalid → INVALID_SIGNATURE', r.ok === false && r.error === 'INVALID_SIGNATURE');
  const events = await repo.listPaymentEventsByOrder('EZR-B2');
  check('percobaan signature palsu terjurnal REJECTED_SIGNATURE', events.some((e: any) => e.processing_result === 'REJECTED_SIGNATURE' && e.signature_valid === false));
}

console.log('=== [B3] Service: settlement langganan → aktivasi langganan ===');
{
  const { repo, service } = setupService();
  const co: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  await service.handleNotification(signedNotification(co.orderId, '54999.00', 'settlement'));
  const st: any = await service.getSubscriptionState({ auth: OWNER, workspaceId: 'ws-1' });
  check('langganan ACTIVE sesudah settlement', st.subscription?.status === 'ACTIVE');
  check('hak efektif = starter', st.entitlementPlanId === 'starter');
  const order = await repo.getOrderByOrderId(co.orderId);
  check('order PAID + granted_at terisi', order?.status === 'PAID' && Boolean(order?.granted_at));
}

console.log('=== [B4] Service: deny → FAILED tanpa grant; transisi status ===');
{
  const { repo, service } = setupService();
  const co: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'TOP_UP', itemId: 'topup-500' });
  const account = await repo.getBillingAccountByWorkspace('ws-1');
  const r: any = await service.handleNotification(signedNotification(co.orderId, '5000.00', 'deny'));
  check('deny → tanpa grant', r.ok === true && r.granted === false);
  check('order FAILED sesudah deny', (await repo.getOrderByOrderId(co.orderId))?.status === 'FAILED');
  const bal: any = await balanceOf(repo, account!.id);
  check('tidak ada kredit top-up dari deny', bal.topupAvailable === 0);
  check('tidak ada entri GRANT berbayar dari deny', (await paidGrantEntries(repo, account!.id)).length === 0);
}

console.log(`\nHasil bootstrapMidtransWebhookHardening: ${pass} lolos, ${fail} gagal`);
if (fail > 0) {
  console.log('GAGAL:', failures.join(' | '));
  process.exit(1);
}
console.log('SEMUA TEST PENGERASAN WEBHOOK LOLOS');

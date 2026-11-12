// Suite: Billing checkout (lapisan layanan) — jumlah SELALU dari katalog
// server, otorisasi workspace fail-closed, resolusi workspace, dan gerbang
// belum-terkonfigurasi. Repository = InMemory (baris berbentuk DB);
// Midtrans = fetch suntikan. Tidak ada jaringan/DB nyata.
// Jalankan dari root repo: npx --yes tsx src/test/billingCheckout.test.ts
import { InMemoryBillingRepository } from '../../api/_lib/billingStore.js';
import { createBillingService } from '../../api/_lib/billingService.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const MID_CFG = { serverKey: 'sk_test_checkout', isProduction: false, snapHost: 'https://app.sandbox.midtrans.com' };
const OWNER = { ok: true, method: 'jwt', user: { id: 'user-owner', email: 'owner@example.id', isAnonymous: false } };
const CLIENT_USER = { ok: true, method: 'jwt', user: { id: 'user-client', email: 'c@example.id', isAnonymous: false } };
const DEMO = { ok: true, method: 'jwt', user: { id: 'user-demo', email: null, isAnonymous: true } };
const STRANGER = { ok: true, method: 'jwt', user: { id: 'user-stranger', email: 's@example.id', isAnonymous: false } };

function okFetch(calls: any[]) {
  return async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => ({ token: 'snap-tok', redirect_url: 'https://pay.example/x' }) };
  };
}

function setup(fetchImpl?: any) {
  const repo = new InMemoryBillingRepository();
  repo.seedMembership('ws-1', 'user-owner', 'SUPER_ADMIN');
  repo.seedMembership('ws-1', 'user-client', 'CLIENT');
  repo.seedMembership('ws-1', 'user-demo', 'ESTIMATOR');
  const calls: any[] = [];
  const service = createBillingService({
    repo,
    midtransConfig: MID_CFG,
    fetchImpl: fetchImpl || okFetch(calls),
    now: () => 1_700_000_000_000,
    newOrderId: () => 'EZR-SUB-TEST-1',
  });
  return { repo, service, calls };
}

console.log('=== Checkout langganan: jumlah dari katalog ===');
{
  const { repo, service, calls } = setup();
  const r: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('checkout starter berhasil', r.ok === true);
  check('amountIdr = harga katalog 54999', r.amountIdr === 54999);
  check('token Snap diteruskan', r.token === 'snap-tok');
  const sent = JSON.parse(calls[0].init.body);
  check('gross_amount ke Midtrans = 54999', sent.transaction_details.gross_amount === 54999);
  const order = await repo.getOrderByOrderId('EZR-SUB-TEST-1');
  check('order tersimpan PENDING', order?.status === 'PENDING');
  check('order amount_idr = 54999 (bukan dari klien)', Number(order?.amount_idr) === 54999);
  check('order snap_token tersimpan', order?.snap_token === 'snap-tok');
  check('akun billing workspace dibuat otomatis', (await repo.getBillingAccountByWorkspace('ws-1')) !== null);
}
{
  // Klien mencoba memalsukan jumlah: layanan checkout tidak menerima
  // parameter jumlah sama sekali — field asing diabaikan total.
  const { service } = setup();
  const r: any = await service.checkout({
    auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'professional',
    amountIdr: 1, gross_amount: 1, price: 1,
  } as any);
  check('jumlah palsu dari klien diabaikan (tetap 79999)', r.ok === true && r.amountIdr === 79999);
}

console.log('=== Penolakan katalog & otorisasi ===');
{
  const { service } = setup();
  const free: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'free' });
  check('paket free tidak bisa dibeli (UNKNOWN_ITEM)', free.ok === false && free.errorCode === 'UNKNOWN_ITEM');
  const asing: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'platinum' });
  check('item asing ditolak', asing.ok === false && asing.errorCode === 'UNKNOWN_ITEM');
  const stranger: any = await service.checkout({ auth: STRANGER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('bukan anggota → 403 NOT_A_MEMBER', stranger.ok === false && stranger.status === 403 && stranger.errorCode === 'NOT_A_MEMBER');
  const client: any = await service.checkout({ auth: CLIENT_USER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('role CLIENT → PERMISSION_DENIED', client.ok === false && client.errorCode === 'PERMISSION_DENIED');
  const demo: any = await service.checkout({ auth: DEMO, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('pengguna demo/anonim → DEMO_RESTRICTED', demo.ok === false && demo.errorCode === 'DEMO_RESTRICTED');
  const noAuth: any = await service.checkout({ auth: { ok: false }, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('tanpa identitas → 401', noAuth.ok === false && noAuth.status === 401);
}
{
  const repo = new InMemoryBillingRepository();
  repo.seedMembership('ws-9', 'user-owner', 'SUPER_ADMIN', { status: 'SUSPENDED' });
  const service = createBillingService({ repo, midtransConfig: MID_CFG, fetchImpl: okFetch([]), now: () => 1 });
  const r: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-9', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('keanggotaan SUSPENDED → MEMBERSHIP_INACTIVE', r.ok === false && r.errorCode === 'MEMBERSHIP_INACTIVE');
}

console.log('=== Resolusi workspace bila tidak diberikan ===');
{
  const { service } = setup();
  const r: any = await service.checkout({ auth: OWNER, workspaceId: undefined, kind: 'TOP_UP', itemId: 'topup-500' });
  check('satu keanggotaan aktif → ter-resolve & checkout jalan', r.ok === true && r.amountIdr === 5000);
}
{
  const repo = new InMemoryBillingRepository();
  repo.seedMembership('ws-1', 'user-owner', 'SUPER_ADMIN');
  repo.seedMembership('ws-2', 'user-owner', 'SUPER_ADMIN');
  const service = createBillingService({ repo, midtransConfig: MID_CFG, fetchImpl: okFetch([]), now: () => 1 });
  const r: any = await service.checkout({ auth: OWNER, workspaceId: undefined, kind: 'TOP_UP', itemId: 'topup-500' });
  check('dua keanggotaan → WORKSPACE_AMBIGUOUS', r.ok === false && r.errorCode === 'WORKSPACE_AMBIGUOUS');
}
{
  const { service } = setup();
  const r: any = await service.checkout({ auth: STRANGER, workspaceId: undefined, kind: 'TOP_UP', itemId: 'topup-500' });
  check('nol keanggotaan → NOT_A_MEMBER', r.ok === false && r.errorCode === 'NOT_A_MEMBER');
}

console.log('=== Gerbang belum terkonfigurasi & kegagalan Midtrans ===');
{
  const repo = new InMemoryBillingRepository();
  repo.seedMembership('ws-1', 'user-owner', 'SUPER_ADMIN');
  const noMid = createBillingService({ repo, midtransConfig: null, fetchImpl: okFetch([]), now: () => 1 });
  const r1: any = await noMid.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('tanpa Server Key → 503 BILLING_NOT_CONFIGURED (midtrans)', r1.ok === false && r1.status === 503 && r1.errorCode === 'BILLING_NOT_CONFIGURED' && r1.component === 'midtrans');
  const noRepo = createBillingService({ repo: null, midtransConfig: MID_CFG, fetchImpl: okFetch([]), now: () => 1 });
  const r2: any = await noRepo.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('tanpa repository → 503 BILLING_NOT_CONFIGURED (store)', r2.ok === false && r2.status === 503 && r2.component === 'store');
}
{
  const failFetch = async () => ({ ok: false, status: 401, json: async () => ({ error_messages: ['Unauthorized'] }) });
  const { repo, service } = setup(failFetch);
  const r: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  check('Midtrans menolak → 502 MIDTRANS_API_ERROR', r.ok === false && r.status === 502 && r.errorCode === 'MIDTRANS_API_ERROR');
  const order = await repo.getOrderByOrderId('EZR-SUB-TEST-1');
  check('order ditandai FAILED (tidak menggantung sebagai sukses)', order?.status === 'FAILED');
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

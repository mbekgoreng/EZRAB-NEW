// Suite: Billing webhook Midtrans — grant TEPAT SEKALI dari notifikasi
// terverifikasi; replay tidak menggandakan; status non-lunas tidak memberi
// grant; refund dicatat tanpa aksi saldo; signature buruk ditolak.
// Repository = InMemory; jam disuntikkan. Tidak ada jaringan/DB nyata.
// Jalankan dari root repo: npx --yes tsx src/test/billingWebhook.test.ts
import { InMemoryBillingRepository, loadLedgerSnapshot } from '../../api/_lib/billingStore.js';
import { createBillingService } from '../../api/_lib/billingService.js';
import { createCreditLedger } from '../../api/_lib/creditLedger.js';
import { computeNotificationSignature } from '../../api/_lib/midtrans.js';
import { addMonths, GRACE_MS } from '../../api/_lib/subscriptionMachine.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const KEY = 'sk_test_webhook';
const MID_CFG = { serverKey: KEY, isProduction: false, snapHost: 'https://app.sandbox.midtrans.com' };
const OWNER = { ok: true, method: 'jwt', user: { id: 'user-owner', email: 'owner@example.id', isAnonymous: false } };
const T0 = Date.UTC(2026, 10, 9, 0, 0, 0); // 9 Nov 2026
let clock = T0;
let orderSeq = 0;

const okFetch = async () => ({ ok: true, status: 201, json: async () => ({ token: 'tok', redirect_url: 'https://pay.example' }) });

function setup() {
  const repo = new InMemoryBillingRepository();
  repo.seedMembership('ws-1', 'user-owner', 'SUPER_ADMIN');
  const service = createBillingService({
    repo,
    midtransConfig: MID_CFG,
    fetchImpl: okFetch,
    now: () => clock,
    newOrderId: () => `EZR-TEST-${++orderSeq}`,
  });
  return { repo, service };
}

function notify(orderId: string, gross: string, transactionStatus: string, extra: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    order_id: orderId,
    status_code: '200',
    gross_amount: gross,
    transaction_status: transactionStatus,
    payment_type: 'qris',
    ...extra,
  };
  base.signature_key = computeNotificationSignature({
    orderId: String(base.order_id),
    statusCode: String(base.status_code),
    grossAmount: String(base.gross_amount),
    serverKey: KEY,
  });
  return base;
}

async function balanceOf(repo: InMemoryBillingRepository, accountId: string, at: number) {
  const snap = await loadLedgerSnapshot(repo, accountId, { ownerUserId: 'user-owner', workspaceId: 'ws-1' });
  return createCreditLedger(snap.store).getBalance(accountId, at);
}
async function grantEntries(repo: InMemoryBillingRepository, accountId: string) {
  const snap = await loadLedgerSnapshot(repo, accountId, { ownerUserId: 'user-owner', workspaceId: 'ws-1' });
  return snap.store.ledger.filter((e: any) => e.kind === 'GRANT');
}

// D18(iii) (2026-11-10): provisioning akun kini menerbitkan grant FREE_ONCE
// 100 kredit yang sah (Amendemen v1.2) — entri GRANT-nya BUKAN grant
// pembayaran. Pin keamanan suite ini adalah "pembayaran gagal/curang tidak
// memberi kredit BERBAYAR", jadi hitungan grant berbayar mengecualikan
// batch FREE_ONCE secara eksplisit.
async function paidGrantEntries(repo: InMemoryBillingRepository, accountId: string) {
  const snap = await loadLedgerSnapshot(repo, accountId, { ownerUserId: 'user-owner', workspaceId: 'ws-1' });
  const freeOnceBatchIds = new Set(
    [...snap.store.batches.values()].filter((b: any) => b.type === 'FREE_ONCE').map((b: any) => b.id),
  );
  return snap.store.ledger.filter((e: any) => e.kind === 'GRANT' && !freeOnceBatchIds.has(e.batchId));
}

console.log('=== Langganan: settlement → grant sekali; replay aman ===');
{
  clock = T0;
  const { repo, service } = setup();
  const co: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  const account = await repo.getBillingAccountByWorkspace('ws-1');

  const r1: any = await service.handleNotification(notify(co.orderId, '54999.00', 'settlement'));
  check('settlement → granted', r1.ok === true && r1.granted === true);
  let bal = await balanceOf(repo, account!.id, clock);
  check('saldo langganan = 5.000', bal.subscriptionAvailable === 5000);
  const order = await repo.getOrderByOrderId(co.orderId);
  check('order PAID + granted_at terisi', order?.status === 'PAID' && Boolean(order?.granted_at));
  const state: any = await service.getSubscriptionState({ auth: OWNER, workspaceId: 'ws-1' });
  check('langganan ACTIVE, plan efektif starter', state.subscription?.status === 'ACTIVE' && state.entitlementPlanId === 'starter');
  check('periodEnd = +1 bulan', state.subscription?.periodEnd === new Date(addMonths(T0, 1)).toISOString());

  const r2: any = await service.handleNotification(notify(co.orderId, '54999.00', 'settlement'));
  check('replay settlement → duplicate, tanpa grant baru', r2.ok === true && r2.duplicate === true && r2.granted === false);
  bal = await balanceOf(repo, account!.id, clock);
  check('saldo tetap 5.000 sesudah replay', bal.subscriptionAvailable === 5000);
  check('entri GRANT berbayar tetap 1', (await paidGrantEntries(repo, account!.id)).length === 1);

  console.log('=== Perpanjangan gagal → PAST_DUE → GRACE lewat → EXPIRED ===');
  const co2: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  const rd: any = await service.handleNotification(notify(co2.orderId, '54999.00', 'deny'));
  check('deny → tanpa grant', rd.ok === true && rd.granted === false);
  check('order perpanjangan FAILED', (await repo.getOrderByOrderId(co2.orderId))?.status === 'FAILED');
  let st: any = await service.getSubscriptionState({ auth: OWNER, workspaceId: 'ws-1' });
  check('langganan PAST_DUE, hak masih starter', st.subscription?.status === 'PAST_DUE' && st.entitlementPlanId === 'starter');
  check('graceEndsAt = periodEnd + 3 hari', st.subscription?.graceEndsAt === new Date(addMonths(T0, 1) + GRACE_MS).toISOString());

  clock = addMonths(T0, 1) + GRACE_MS + 1000;
  st = await service.getSubscriptionState({ auth: OWNER, workspaceId: 'ws-1' });
  check('lewat masa tenggang → EXPIRED, hak kembali free', st.subscription?.status === 'EXPIRED' && st.entitlementPlanId === 'free');

  console.log('=== Reaktivasi dari EXPIRED ===');
  const co3: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  const r3: any = await service.handleNotification(notify(co3.orderId, '54999.00', 'settlement'));
  check('settlement baru → granted', r3.granted === true);
  st = await service.getSubscriptionState({ auth: OWNER, workspaceId: 'ws-1' });
  check('langganan ACTIVE lagi', st.subscription?.status === 'ACTIVE' && st.entitlementPlanId === 'starter');
  bal = await balanceOf(repo, account!.id, clock);
  check('dua batch langganan aktif (5.000 + 5.000)', bal.subscriptionAvailable === 10000);
}

console.log('=== Top-up: grant dasar + bonus, replay aman ===');
{
  clock = T0;
  const { repo, service } = setup();
  const co: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'TOP_UP', itemId: 'topup-3600' });
  const account = await repo.getBillingAccountByWorkspace('ws-1');
  const r1: any = await service.handleNotification(notify(co.orderId, '5000.00', 'settlement'));
  check('settlement top-up → granted', r1.granted === true);
  let bal = await balanceOf(repo, account!.id, clock);
  check('topupAvailable = 3.000', bal.topupAvailable === 3000);
  check('bonusAvailable = 600 (batch terpisah)', bal.bonusAvailable === 600);
  const r2: any = await service.handleNotification(notify(co.orderId, '5000.00', 'settlement'));
  check('replay top-up → duplicate', r2.duplicate === true);
  bal = await balanceOf(repo, account!.id, clock);
  check('saldo top-up tidak ganda', bal.topupAvailable === 3000 && bal.bonusAvailable === 600);
  check('entri GRANT berbayar = 2 (top-up + bonus)', (await paidGrantEntries(repo, account!.id)).length === 2);

  console.log('=== Refund sesudah lunas: tercatat, saldo TIDAK berubah ===');
  const rr: any = await service.handleNotification(notify(co.orderId, '5000.00', 'refund'));
  check('refund tercatat (refundRecorded)', rr.ok === true && rr.refundRecorded === true);
  check('order menjadi REFUNDED', (await repo.getOrderByOrderId(co.orderId))?.status === 'REFUNDED');
  bal = await balanceOf(repo, account!.id, clock);
  check('saldo TIDAK ditarik oleh refund (PENDING_LEGAL_REVIEW)', bal.topupAvailable === 3000 && bal.bonusAvailable === 600);
  const events = await repo.listPaymentEventsByOrder(co.orderId);
  check('peristiwa refund terjurnal', events.some((e: any) => e.processing_result === 'RECORDED_REFUND'));
}

console.log('=== Status non-lunas & serangan ===');
{
  clock = T0;
  const { repo, service } = setup();
  const account = () => repo.getBillingAccountByWorkspace('ws-1');

  const coP: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  const rp: any = await service.handleNotification(notify(coP.orderId, '54999.00', 'pending'));
  check('pending → tanpa grant, order tetap PENDING', rp.granted === false && (await repo.getOrderByOrderId(coP.orderId))?.status === 'PENDING');

  const rc: any = await service.handleNotification(notify(coP.orderId, '54999.00', 'capture', { fraud_status: 'challenge' }));
  check('capture challenge → tanpa grant', rc.granted === false);

  const coE: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  const re: any = await service.handleNotification(notify(coE.orderId, '54999.00', 'expire'));
  check('expire → order EXPIRED, tanpa grant', re.granted === false && (await repo.getOrderByOrderId(coE.orderId))?.status === 'EXPIRED');
  const acct = await account();
  const balE: any = await balanceOf(repo, acct!.id, clock);
  check('saldo BERBAYAR tetap 0 (hanya Free-once 100 dari provisioning D18(iii))',
    balE.subscriptionAvailable === 0 && balE.topupAvailable === 0 && balE.bonusAvailable === 0 && balE.freeOnceAvailable === 100);

  const coM: any = await service.checkout({ auth: OWNER, workspaceId: 'ws-1', kind: 'SUBSCRIPTION', itemId: 'starter' });
  const rm: any = await service.handleNotification(notify(coM.orderId, '1.00', 'settlement'));
  check('jumlah tidak cocok → tanpa grant (AMOUNT_MISMATCH)', rm.granted === false && rm.reason === 'AMOUNT_MISMATCH');
  const balM: any = await balanceOf(repo, acct!.id, clock);
  check('saldo BERBAYAR tetap 0 sesudah mismatch (hanya Free-once 100)',
    balM.subscriptionAvailable === 0 && balM.topupAvailable === 0 && balM.bonusAvailable === 0 && balM.freeOnceAvailable === 100);

  const forged = notify(coM.orderId, '54999.00', 'settlement');
  forged.signature_key = 'f'.repeat(128);
  const rf: any = await service.handleNotification(forged);
  check('signature palsu → INVALID_SIGNATURE', rf.ok === false && rf.errorCode === 'INVALID_SIGNATURE');
  check('order tidak berubah oleh signature palsu', (await repo.getOrderByOrderId(coM.orderId))?.status === 'PENDING');
  const forgedEvents = await repo.listPaymentEventsByOrder(coM.orderId);
  check('percobaan signature palsu terjurnal sebagai tidak valid', forgedEvents.some((e: any) => e.signature_valid === false && e.processing_result === 'REJECTED_SIGNATURE'));

  const ru: any = await service.handleNotification(notify('EZR-TIDAK-ADA', '54999.00', 'settlement'));
  check('order tak dikenal → matched:false (200, tanpa grant)', ru.ok === true && ru.matched === false);
}

console.log('=== Gerbang belum terkonfigurasi (webhook) ===');
{
  const repo = new InMemoryBillingRepository();
  const noMid = createBillingService({ repo, midtransConfig: null, now: () => clock });
  const r1: any = await noMid.handleNotification(notify('X', '1.00', 'settlement'));
  check('tanpa Server Key → 503 BILLING_NOT_CONFIGURED', r1.ok === false && r1.status === 503 && r1.errorCode === 'BILLING_NOT_CONFIGURED');
  const noRepo = createBillingService({ repo: null, midtransConfig: MID_CFG, now: () => clock });
  const r2: any = await noRepo.handleNotification(notify('X', '1.00', 'settlement'));
  check('signature valid tapi tanpa repository → 503 (store)', r2.ok === false && r2.status === 503 && r2.component === 'store');
}

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

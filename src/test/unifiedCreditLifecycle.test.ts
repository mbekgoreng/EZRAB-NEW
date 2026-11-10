// Suite: Lifecycle Unified Credits ujung-ke-ujung lintas modul —
// featureBillingMatrix (keputusan tagih) -> pricingPolicy (metering v1.1)
// -> creditLedger (grant/reserve/settle/release dengan urutan alokasi
// Phase 5.1). Semua di atas ledger in-memory nyata.
// Jalankan dari root repo: npx --yes tsx src/test/unifiedCreditLifecycle.test.ts
import { chargeDecision } from '../../api/_lib/featureBillingMatrix.js';
import { creditsForTokenUsage } from '../../api/_lib/pricingPolicy.js';
import { createCreditLedger, createMemoryLedgerStore } from '../../api/_lib/creditLedger.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const T0 = 1_700_000_000_000;

console.log('=== Keputusan tagih per fitur ===');
const vol = chargeDecision('volume-calculation');
check('volume-calculation TIDAK chargeable', vol.chargeable === false && (vol as any).credits === 0);
const chat = chargeDecision('chat-ai/fast');
check('chat-ai/fast chargeable (TOKEN)', chat.chargeable === true && (chat as any).metering === 'TOKEN');

console.log('=== Metering contoh chat = 25 kredit ===');
const metered = creditsForTokenUsage({ tokensIn: 2000, tokensOut: 1000, tokensCached: 0 });
check('metering ok', metered.ok === true);
check('credits = 25', metered.ok === true && metered.credits === 25);
const ESTIMATE = metered.ok === true ? metered.credits : 0;

console.log('=== Akun 1: grant + reserve dari SUBSCRIPTION lebih dulu ===');
const store = createMemoryLedgerStore();
const ledger = createCreditLedger(store);
const ACCT = 'acct-life-1';
const subGrant: any = ledger.grantSubscription({
  accountId: ACCT, amount: 5000, periodStart: T0, periodEnd: T0 + 30 * 24 * 3600 * 1000,
  idempotencyKey: 'life-sub-1', now: T0,
});
check('grantSubscription 5000 ok', subGrant.ok === true);
const subBatchId = subGrant.batch.id;
const freeGrant: any = ledger.grantFreeOnce({ accountId: ACCT, now: T0 });
check('grantFreeOnce 100 ok', freeGrant.ok === true && freeGrant.batch.grantedAmount === 100);
const freeBatchId = freeGrant.batch.id;

const op1: any = ledger.createOperation({ accountId: ACCT, feature: 'chat-ai/fast', estimatedCredits: ESTIMATE, idempotencyKey: 'life-op-1', now: T0 });
check('createOperation(25) ok', op1.ok === true);
const reserve1: any = ledger.reserve(op1.operation.id, { accountId: ACCT, idempotencyKey: 'life-res-1', now: T0 });
check('reserve 25 ok', reserve1.ok === true);
check(
  'alokasi berasal dari batch SUBSCRIPTION (urutan Phase 5.1)',
  Array.isArray(reserve1.allocations) && reserve1.allocations.length === 1 && reserve1.allocations[0].batchId === subBatchId && reserve1.allocations[0].amount === 25,
);
let batches = ledger.listBatches(ACCT);
const subNow = () => ledger.listBatches(ACCT).find((b: any) => b.id === subBatchId);
const freeNow = () => ledger.listBatches(ACCT).find((b: any) => b.id === freeBatchId);
check('reserved subscription = 25', subNow()?.reservedAmount === 25);
check('reserved free-once = 0 (belum disentuh)', freeNow()?.reservedAmount === 0);
check('remaining subscription = 4975 saat ter-reserve', subNow()?.remainingAmount === 4975);

console.log('=== Settle aktual 20: konsumsi 20, lepas 5 ===');
const settle1: any = ledger.settle(op1.operation.id, {
  accountId: ACCT, actualCredits: 20, usageEvidence: { tokensIn: 2000, tokensOut: 1000, tokensCached: 0 },
  tariffVersion: '2026-11-02.1', idempotencyKey: 'life-settle-1', now: T0,
});
check('settle ok', settle1.ok === true && settle1.settledCredits === 20 && settle1.releasedCredits === 5);
check('subscription consumed = 20', subNow()?.consumedAmount === 20);
check('subscription remaining kembali +5 -> 4980', subNow()?.remainingAmount === 4980);
check('subscription reserved = 0 setelah settle', subNow()?.reservedAmount === 0);

console.log('=== Settle ulang kunci sama: tanpa efek ganda ===');
const beforeDup = JSON.stringify(ledger.listBatches(ACCT));
const entriesBefore = ledger.listLedger(ACCT).length;
const settleDup: any = ledger.settle(op1.operation.id, {
  accountId: ACCT, actualCredits: 20, usageEvidence: { tokensIn: 2000, tokensOut: 1000, tokensCached: 0 },
  tariffVersion: '2026-11-02.1', idempotencyKey: 'life-settle-1', now: T0,
});
check('settle ulang terdeteksi duplikat/replay', settleDup.ok === true);
check('saldo identik setelah settle ulang', JSON.stringify(ledger.listBatches(ACCT)) === beforeDup);
check('tidak ada entri ledger baru', ledger.listLedger(ACCT).length === entriesBefore);

console.log('=== Reserve melebihi saldo -> INSUFFICIENT_BALANCE ===');
const opBig: any = ledger.createOperation({ accountId: ACCT, feature: 'chat-ai/fast', estimatedCredits: 999999, idempotencyKey: 'life-op-big', now: T0 });
const reserveBig: any = ledger.reserve(opBig.operation.id, { accountId: ACCT, idempotencyKey: 'life-res-big', now: T0 });
check('reserve ditolak INSUFFICIENT_BALANCE', reserveBig.ok === false && reserveBig.error === 'INSUFFICIENT_BALANCE');
check('tidak ada alokasi parsial dari reserve gagal', subNow()?.reservedAmount === 0 && freeNow()?.reservedAmount === 0);

console.log('=== Overage: reserve 25, aktual 40 -> REQUIRES_REVIEW ===');
const opOver: any = ledger.createOperation({ accountId: ACCT, feature: 'chat-ai/fast', estimatedCredits: 25, idempotencyKey: 'life-op-over', now: T0 });
check('reserve overage-op ok', ledger.reserve(opOver.operation.id, { accountId: ACCT, idempotencyKey: 'life-res-over', now: T0 }).ok === true);
const settleOver: any = ledger.settle(opOver.operation.id, {
  accountId: ACCT, actualCredits: 40, usageEvidence: { tokensIn: 4000, tokensOut: 2000 },
  tariffVersion: '2026-11-02.1', idempotencyKey: 'life-settle-over', now: T0,
});
check('status REQUIRES_REVIEW', settleOver.ok === true && settleOver.status === 'REQUIRES_REVIEW' && settleOver.overageCredits === 15);
const opOverState: any = ledger.getOperation(opOver.operation.id, { accountId: ACCT });
check('operasi tercatat REQUIRES_REVIEW', opOverState.ok === true && opOverState.operation.status === 'REQUIRES_REVIEW');

console.log('=== Akun 2: release penuh memulihkan top-up ===');
const ACCT2 = 'acct-life-2';
const topGrant: any = ledger.grantTopUp({ accountId: ACCT2, amount: 500, paymentRef: 'pay-life-2', idempotencyKey: 'life-top-2', now: T0 });
check('grant top-up akun 2 ok', topGrant.ok === true);
const topBatchId = topGrant.batch.id;
const topNow = () => ledger.listBatches(ACCT2).find((b: any) => b.id === topBatchId);
const opRel: any = ledger.createOperation({ accountId: ACCT2, feature: 'chat-ai/fast', estimatedCredits: 300, idempotencyKey: 'life-op-rel', now: T0 });
check('reserve 300 ok', ledger.reserve(opRel.operation.id, { accountId: ACCT2, idempotencyKey: 'life-res-rel', now: T0 }).ok === true);
check('top-up reserved = 300, remaining = 200', topNow()?.reservedAmount === 300 && topNow()?.remainingAmount === 200);
const rel: any = ledger.release(opRel.operation.id, { accountId: ACCT2, idempotencyKey: 'life-release-1', now: T0 });
check('release ok (300)', rel.ok === true && rel.releasedCredits === 300);
check('remaining top-up pulih penuh (500)', topNow()?.remainingAmount === 500);
check('reserved top-up = 0 setelah release', topNow()?.reservedAmount === 0);
batches = ledger.listBatches(ACCT);
check('akun 1 tidak terpengaruh skenario akun 2', batches.length === 2);

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

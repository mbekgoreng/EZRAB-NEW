// Suite: Rekonsiliasi ledger kredit (api/_lib/creditReconciliation.js)
// terhadap ledger NYATA dari creditLedger.js (bukan data karangan):
// skenario sehat harus healthy; lima varian rusak masing-masing harus
// tertangkap pemeriksaannya.
// Jalankan dari root repo: npx --yes tsx src/test/creditReconciliation.test.ts
import { createCreditLedger, createMemoryLedgerStore } from '../../api/_lib/creditLedger.js';
import { reconcileAccountData } from '../../api/_lib/creditReconciliation.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const T0 = 1_700_000_000_000;
const ACCT = 'acct-recon-1';

const store = createMemoryLedgerStore();
const ledger = createCreditLedger(store);

console.log('=== Bangun ledger nyata ===');
const sub = ledger.grantSubscription({
  accountId: ACCT, amount: 5000, periodStart: T0, periodEnd: T0 + 30 * 24 * 3600 * 1000,
  idempotencyKey: 'sub-2026-11', now: T0,
});
check('grant subscription ok', sub.ok === true);
const top = ledger.grantTopUp({ accountId: ACCT, amount: 1000, paymentRef: 'pay-1', idempotencyKey: 'topup-1', now: T0 });
check('grant top-up ok', top.ok === true);
const free = ledger.grantFreeOnce({ accountId: ACCT, now: T0 });
check('grant free-once ok (100)', free.ok === true && free.batch?.grantedAmount === 100);

const opRes: any = ledger.createOperation({ accountId: ACCT, feature: 'chat-ai/fast', estimatedCredits: 25, idempotencyKey: 'op-1', now: T0 });
check('createOperation ok', opRes.ok === true);
const opId = opRes.operation.id;
check('reserve ok', ledger.reserve(opId, { accountId: ACCT, idempotencyKey: 'res-1', now: T0 }).ok === true);
const settled: any = ledger.settle(opId, {
  accountId: ACCT, actualCredits: 20, usageEvidence: { tokensIn: 2000, tokensOut: 1000 },
  tariffVersion: '2026-11-02.1', idempotencyKey: 'settle-1', now: T0,
});
check('settle sebagian ok (20 dari 25)', settled.ok === true && settled.settledCredits === 20);

function snapshot() {
  return {
    batches: ledger.listBatches(ACCT),
    ledgerEntries: ledger.listLedger(ACCT),
    operations: [...store.operations.values()].map((o: any) => JSON.parse(JSON.stringify(o))),
    orders: [] as any[],
  };
}
const kinds = (r: any) => r.discrepancies.map((d: any) => d.kind);

console.log('=== Skenario sehat ===');
const healthy = reconcileAccountData(snapshot(), { now: T0 + 1000 });
check('healthy = true', healthy.healthy === true);
check('0 discrepancy', healthy.discrepancies.length === 0);
check('0 stuck', healthy.stuckReservations.length === 0);
check('0 pending review', healthy.pendingReviews.length === 0);
check('counts cocok', healthy.counts.batches === 3 && healthy.counts.operations === 1 && healthy.counts.entries >= 6);

console.log('=== (i) consumedAmount diubah -> invariant/mismatch ===');
const tampered = snapshot();
const subBatch = tampered.batches.find((b: any) => b.type === 'SUBSCRIPTION');
subBatch.consumedAmount += 1;
const r1 = reconcileAccountData(tampered, { now: T0 + 1000 });
check('tidak healthy', r1.healthy === false);
check(
  'BATCH_INVARIANT_BROKEN atau LEDGER_BATCH_MISMATCH muncul',
  kinds(r1).includes('BATCH_INVARIANT_BROKEN') || kinds(r1).includes('LEDGER_BATCH_MISMATCH'),
);

console.log('=== (ii) Order PAID tanpa grant ===');
const withOrder = snapshot();
withOrder.orders = [{ orderId: 'EZR-TEST-1', status: 'PAID', grantedAt: T0 }];
const r2 = reconcileAccountData(withOrder, { now: T0 + 1000 });
check('PAID_ORDER_WITHOUT_GRANT untuk EZR-TEST-1', r2.discrepancies.some((d: any) => d.kind === 'PAID_ORDER_WITHOUT_GRANT' && d.ref === 'EZR-TEST-1'));
// Kunci pendamping ":bonus" saja TIDAK menyelamatkan order.
const bonusOnly = snapshot();
bonusOnly.orders = [{ orderId: 'EZR-TEST-2', status: 'PAID', grantedAt: T0 }];
bonusOnly.ledgerEntries = [
  ...bonusOnly.ledgerEntries,
  { id: 'le-bonus-only', accountId: ACCT, kind: 'GRANT', batchId: null, operationId: null, amount: 100, idempotencyKey: 'EZR-TEST-2:bonus', actor: 'payment', reason: 'bonus_grant', createdAt: T0 },
];
const r2b = reconcileAccountData(bonusOnly, { now: T0 + 1000 });
check('hanya ":bonus" tetap PAID_ORDER_WITHOUT_GRANT', r2b.discrepancies.some((d: any) => d.kind === 'PAID_ORDER_WITHOUT_GRANT' && d.ref === 'EZR-TEST-2'));
// Order dengan grant dasar berkunci orderId -> bersih dari pemeriksaan (4).
const withGrant = snapshot();
withGrant.orders = [{ orderId: 'topup-1', status: 'PAID', grantedAt: T0 }];
const r2c = reconcileAccountData(withGrant, { now: T0 + 1000 });
check('grant berkunci orderId -> tidak dilaporkan', !r2c.discrepancies.some((d: any) => d.kind === 'PAID_ORDER_WITHOUT_GRANT'));

console.log('=== (iii) Entri GRANT duplikat ===');
const dup = snapshot();
dup.ledgerEntries = [
  ...dup.ledgerEntries,
  { id: 'le-dup', accountId: ACCT, kind: 'GRANT', batchId: null, operationId: null, amount: 1000, idempotencyKey: 'topup-1', actor: 'payment', reason: 'topup_grant', createdAt: T0 },
];
const r3 = reconcileAccountData(dup, { now: T0 + 1000 });
check('DUPLICATE_GRANT_KEY muncul', r3.discrepancies.some((d: any) => d.kind === 'DUPLICATE_GRANT_KEY' && d.ref === 'topup-1'));

console.log('=== (iv) Reservasi macet ===');
const stuckData = snapshot();
stuckData.operations = [
  ...stuckData.operations,
  { id: 'op-stuck', accountId: ACCT, status: 'RESERVED', createdAt: T0 - 60 * 60 * 1000 },
];
const r4 = reconcileAccountData(stuckData, { now: T0 });
check('STUCK_RESERVATION tertangkap', r4.stuckReservations.some((s: any) => s.kind === 'STUCK_RESERVATION' && s.ref === 'op-stuck'));
check('stuck membuat tidak healthy', r4.healthy === false);
const notStuck = reconcileAccountData(stuckData, { now: T0, stuckTtlMs: 2 * 60 * 60 * 1000 });
check('TTL lebih longgar -> tidak stuck', notStuck.stuckReservations.length === 0);

console.log('=== (v) Overage -> pendingReviews, bukan discrepancy ===');
const op2Res: any = ledger.createOperation({ accountId: ACCT, feature: 'chat-ai/fast', estimatedCredits: 10, idempotencyKey: 'op-2', now: T0 });
ledger.reserve(op2Res.operation.id, { accountId: ACCT, idempotencyKey: 'res-2', now: T0 });
const over: any = ledger.settle(op2Res.operation.id, {
  accountId: ACCT, actualCredits: 15, usageEvidence: { tokensIn: 3000, tokensOut: 1000 },
  tariffVersion: '2026-11-02.1', idempotencyKey: 'settle-2', now: T0,
});
check('settle overage -> REQUIRES_REVIEW', over.ok === true && over.status === 'REQUIRES_REVIEW');
const r5 = reconcileAccountData(snapshot(), { now: T0 + 1000 });
check('operasi overage masuk pendingReviews', r5.pendingReviews.some((p: any) => p.ref === op2Res.operation.id));
check('pending review BUKAN discrepancy', !r5.discrepancies.some((d: any) => d.ref === op2Res.operation.id));

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

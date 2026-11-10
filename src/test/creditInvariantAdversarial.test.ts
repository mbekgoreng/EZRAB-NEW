// Suite: Adversarial financial-invariant tests — Unified Credits Phase 2 (Phase B).
// Run from repo root: npx --yes tsx src/test/creditInvariantAdversarial.test.ts
//
// Maps the 20 adversarial cases of the Phase 2 master prompt §4 to the pure
// domain modules (creditLedger / creditAllocation / creditReconciliation)
// and to the snapshot/flush boundary (billingStore.withLedger internals).
//
// IMPORTANT — concurrency cases (3 and 4) are Sprint 3 GUARANTEE tests
// (updated deliberately 2026-11-10, Sprint 4 Fase 2): they deterministically
// interleave two snapshots manually (no timing race, no sleep) and assert
// that the Sprint 3 boundary in billingStore.js — per-account serialization
// in withLedger, preflight invariant / idempotency-key / FREE_ONCE
// validation, content-CAS on changed persisted rows, and the compensated
// flush — REJECTS the stale second flush BEFORE it writes, leaving exactly
// the winner's state and a healthy reconciliation. These cases previously
// pinned the Phase 2 KNOWN-LIMITATION lost-update signature (orphan
// FREE_ONCE batch, double-settle CONSUME entries, reconciliation detecting
// the divergence); Sprint 3 fixed that boundary in-process, so — as this
// header always required — the failure-signature assertions were replaced
// deliberately in Sprint 4 by the stronger guarantee assertions below.
// Detection coverage itself is NOT weakened: Cases 15/16/17 still assert
// that creditReconciliation DETECTS divergence when fed divergent data
// directly.
// Case 2 (duplicate webhook) is covered at service level by
// billingWebhook.test.ts; here it is exercised at ledger level as a
// duplicate paid-order grant, which is the financial core of a webhook.
import {
  createCreditLedger,
  createMemoryLedgerStore,
} from '../../api/_lib/creditLedger.js';
import { resolveAllocationOrder } from '../../api/_lib/creditAllocation.js';
import { reconcileAccountData } from '../../api/_lib/creditReconciliation.js';
import {
  InMemoryBillingRepository,
  loadLedgerSnapshot,
  flushLedgerSnapshot,
} from '../../api/_lib/billingStore.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_800_000_000_000;
const TARIFF = '2026-11-02.1';

function freshLedger() {
  return createCreditLedger(createMemoryLedgerStore());
}
function invariantHolds(l: any, acct: string) {
  return l.listBatches(acct).every((b: any) =>
    b.grantedAmount === b.remainingAmount + b.reservedAmount + b.consumedAmount + b.expiredAmount &&
    b.remainingAmount >= 0 && b.reservedAmount >= 0 && b.consumedAmount >= 0 && b.expiredAmount >= 0);
}
function grantTop(l: any, acct: string, amount: number, key: string, now = T0) {
  return l.grantTopUp({ accountId: acct, amount, paymentRef: key, idempotencyKey: key, now });
}
function opReserve(l: any, acct: string, est: number, key: string, now = T0) {
  const op = l.createOperation({ accountId: acct, feature: 'chat-ai/fast', estimatedCredits: est, idempotencyKey: `${key}:op`, now });
  if (!op.ok) return op;
  const r = l.reserve(op.operation.id, { accountId: acct, idempotencyKey: `${key}:res`, now });
  return { ...r, operation: r.operation || op.operation };
}

console.log('=== Case 1: duplicate grant requests ===');
{
  const l = freshLedger();
  const g1: any = grantTop(l, 'A', 500, 'order-100');
  const g2: any = grantTop(l, 'A', 500, 'order-100');
  check('second grant is duplicate replay', g1.ok && g2.ok && g2.duplicate === true);
  check('exactly one batch persisted', l.listBatches('A').length === 1);
  check('balance is 500, not 1000', l.getBalance('A', T0).total === 500);
  const f1: any = l.grantFreeOnce({ accountId: 'A', now: T0 });
  const f2: any = l.grantFreeOnce({ accountId: 'A', now: T0 });
  check('FREE_ONCE granted once per account', f1.ok && f2.ok && l.listBatches('A').filter((b: any) => b.type === 'FREE_ONCE').length === 1);
  check('invariant holds', invariantHolds(l, 'A'));
}

console.log('=== Case 2: duplicate paid-order grant (webhook core) + payload mismatch behaviour ===');
{
  const l = freshLedger();
  const g1: any = grantTop(l, 'A', 3600, 'pay:order-xyz');
  // Sprint 3 (creditLedger.js idemGet payload comparison): same key + SAME
  // financial payload remains a safe duplicate replay — no second grant.
  const gSame: any = l.grantTopUp({ accountId: 'A', amount: 3600, paymentRef: 'pay:order-xyz', idempotencyKey: 'pay:order-xyz', now: T0 });
  check('identical replay is a safe duplicate (no second grant)', gSame.ok === true && gSame.duplicate === true && l.listBatches('A').length === 1);
  // Same idempotency key, DIFFERENT amount: Sprint 3 compares the recorded
  // payload, so the mismatch is now an explicit IDEMPOTENCY_CONFLICT
  // (ok:false) — no longer a silent replay of the original result.
  const entriesBeforeMismatch = l.listLedger('A').length;
  const g2: any = l.grantTopUp({ accountId: 'A', amount: 999999, paymentRef: 'pay:order-xyz', idempotencyKey: 'pay:order-xyz', now: T0 });
  check('mismatched replay rejected with IDEMPOTENCY_CONFLICT', g2.ok === false && g2.error === 'IDEMPOTENCY_CONFLICT');
  check('mismatched replay creates no new batch and no new ledger entry',
    l.listBatches('A').length === 1 && l.listLedger('A').length === entriesBeforeMismatch);
  check('granted amount stays the original 3600', l.getBalance('A', T0).total === 3600 && g1.batch.grantedAmount === 3600);
}

console.log('=== Case 5: reservation larger than available balance ===');
{
  const l = freshLedger();
  grantTop(l, 'A', 100, 'g1');
  const r: any = opReserve(l, 'A', 101, 'big');
  check('reserve 101 of 100 rejected', r.ok === false && r.error === 'INSUFFICIENT_BALANCE');
  const b: any = l.listBatches('A')[0];
  check('no partial allocation stored', b.remainingAmount === 100 && b.reservedAmount === 0);
  check('invariant holds', invariantHolds(l, 'A'));
}

console.log('=== Case 6: batch expiring during reservation lifecycle ===');
{
  const l = freshLedger();
  const exp = T0 + DAY;
  l.grantSubscription({ accountId: 'A', amount: 200, periodStart: T0, periodEnd: T0 + 30 * DAY, idempotencyKey: 'sub-live', now: T0 });
  // Directly craft an expiring bonus + a stable top-up:
  l.grantBonus({ accountId: 'A', amount: 100, campaignRef: 'c', expiresAt: exp, idempotencyKey: 'bon', now: T0 });
  grantTop(l, 'A', 100, 'top');
  const r: any = opReserve(l, 'A', 150, 'r6', exp + 1); // after bonus expiry
  check('reserve after bonus expiry succeeds from live batches only', r.ok === true);
  const bonus: any = l.listBatches('A').find((b: any) => b.type === 'BONUS');
  check('expired bonus contributed nothing', bonus.reservedAmount === 0);
  // Reserve against bonus BEFORE expiry, settle AFTER expiry: remainder is
  // written off as EXPIRATION, reserved portion consumed normally.
  const l2 = freshLedger();
  l2.grantBonus({ accountId: 'A', amount: 100, campaignRef: 'c', expiresAt: exp, idempotencyKey: 'bon', now: T0 });
  const r2: any = opReserve(l2, 'A', 100, 'r6b', T0);
  const s2: any = l2.settle(r2.operation.id, { accountId: 'A', actualCredits: 40, usageEvidence: { tokensIn: 10, tokensOut: 5 }, tariffVersion: TARIFF, idempotencyKey: 's6b', now: exp + 1 });
  const bon2: any = l2.listBatches('A')[0];
  check('settle after expiry: consumed 40', s2.ok === true && bon2.consumedAmount === 40);
  check('settle after expiry: remainder 60 written off as expired, not returned', bon2.expiredAmount === 60 && bon2.remainingAmount === 0);
  check('invariant holds', invariantHolds(l2, 'A'));
}

console.log('=== Case 7: reservation spanning multiple batches (Phase 5.1 order) ===');
{
  const l = freshLedger();
  l.grantTopUp({ accountId: 'A', amount: 50, paymentRef: 't', idempotencyKey: 'top', now: T0 });
  l.grantBonus({ accountId: 'A', amount: 50, campaignRef: 'c', expiresAt: T0 + 10 * DAY, idempotencyKey: 'bon', now: T0 });
  l.grantSubscription({ accountId: 'A', amount: 50, periodStart: T0, periodEnd: T0 + 30 * DAY, idempotencyKey: 'sub', now: T0 });
  const r: any = opReserve(l, 'A', 130, 'span');
  check('reserve 130 spans 3 batches', r.ok === true && r.allocations.length === 3);
  const byType = Object.fromEntries(r.allocations.map((a: any) => {
    const b: any = l.listBatches('A').find((x: any) => x.id === a.batchId);
    return [b.type, a.amount];
  }));
  check('subscription consumed first (50), bonus second (50), top-up last (30)',
    byType.SUBSCRIPTION === 50 && byType.BONUS === 50 && byType.TOP_UP === 30);
  check('invariant holds', invariantHolds(l, 'A'));
}

console.log('=== Cases 8/9/10: partial evidence, missing tariff, unknown usage ===');
{
  const l = freshLedger();
  grantTop(l, 'A', 500, 'g1');
  const r: any = opReserve(l, 'A', 200, 'r8');
  const opId = r.operation.id;
  const sMissing: any = l.settle(opId, { accountId: 'A', actualCredits: 100, usageEvidence: null, tariffVersion: TARIFF, idempotencyKey: 'sx', now: T0 });
  check('null evidence -> USAGE_MISSING', sMissing.ok === false && sMissing.error === 'USAGE_MISSING');
  const sTariff: any = l.settle(opId, { accountId: 'A', actualCredits: 100, usageEvidence: { tokensIn: 1 }, tariffVersion: 'nope-9.9', idempotencyKey: 'sy', now: T0 });
  check('unknown tariff -> UNKNOWN_TARIFF', sTariff.ok === false && sTariff.error === 'UNKNOWN_TARIFF');
  const sFloat: any = l.settle(opId, { accountId: 'A', actualCredits: 99.5, usageEvidence: { tokensIn: 1 }, tariffVersion: TARIFF, idempotencyKey: 'sz', now: T0 });
  check('fractional actual -> INVALID_USAGE', sFloat.ok === false && sFloat.error === 'INVALID_USAGE');
  const sNaN: any = l.settle(opId, { accountId: 'A', actualCredits: Number.NaN, usageEvidence: { tokensIn: 1 }, tariffVersion: TARIFF, idempotencyKey: 'sw', now: T0 });
  check('NaN actual -> INVALID_USAGE', sNaN.ok === false && sNaN.error === 'INVALID_USAGE');
  const opNow: any = l.getOperation(opId, { accountId: 'A' });
  check('operation untouched after rejected settles (still RESERVED)', opNow.ok && opNow.operation.status === 'RESERVED');
  const b: any = l.listBatches('A')[0];
  check('batch untouched (reserved still 200)', b.reservedAmount === 200 && b.consumedAmount === 0);
}

console.log('=== Case 11: duplicate settlement request ===');
{
  const l = freshLedger();
  grantTop(l, 'A', 500, 'g1');
  const r: any = opReserve(l, 'A', 200, 'r11');
  const s1: any = l.settle(r.operation.id, { accountId: 'A', actualCredits: 120, usageEvidence: { tokensIn: 3 }, tariffVersion: TARIFF, idempotencyKey: 's11-a', now: T0 });
  const s2: any = l.settle(r.operation.id, { accountId: 'A', actualCredits: 120, usageEvidence: { tokensIn: 3 }, tariffVersion: TARIFF, idempotencyKey: 's11-b', now: T0 });
  const b: any = l.listBatches('A')[0];
  check('first settle ok', s1.ok === true && s1.settledCredits === 120);
  check('second settle (different key) is duplicate, no double effect', s2.ok === true && s2.duplicate === true && b.consumedAmount === 120);
  check('invariant holds', invariantHolds(l, 'A'));
}

console.log('=== Cases 12/13: release after settle, settle after release ===');
{
  const l = freshLedger();
  grantTop(l, 'A', 500, 'g1');
  const r1: any = opReserve(l, 'A', 100, 'r12');
  l.settle(r1.operation.id, { accountId: 'A', actualCredits: 50, usageEvidence: { t: 1 }, tariffVersion: TARIFF, idempotencyKey: 's12', now: T0 });
  const rel: any = l.release(r1.operation.id, { accountId: 'A', idempotencyKey: 'rel12', now: T0 });
  check('release after settle -> INVALID_STATE', rel.ok === false && rel.error === 'INVALID_STATE');
  const r2: any = opReserve(l, 'A', 100, 'r13');
  const rel2: any = l.release(r2.operation.id, { accountId: 'A', idempotencyKey: 'rel13', now: T0 });
  const sAfter: any = l.settle(r2.operation.id, { accountId: 'A', actualCredits: 10, usageEvidence: { t: 1 }, tariffVersion: TARIFF, idempotencyKey: 's13', now: T0 });
  check('release ok then settle -> INVALID_STATE', rel2.ok === true && sAfter.ok === false && sAfter.error === 'INVALID_STATE');
  check('invariant holds', invariantHolds(l, 'A'));
}

console.log('=== Case 14: repeated expiration processing ===');
{
  const l = freshLedger();
  l.grantSubscription({ accountId: 'A', amount: 300, periodStart: T0 - 60 * DAY, periodEnd: T0 - 30 * DAY, idempotencyKey: 'sub-x', now: T0 - 60 * DAY });
  // Historical FREE_ONCE batch with finite expiry must never be swept.
  l.grantFreeOnce({ accountId: 'A', now: T0 });
  const e1: any = l.applyExpirations({ accountId: 'A', now: T0 });
  const entriesAfterFirst = l.listLedger('A').length;
  const e2: any = l.applyExpirations({ accountId: 'A', now: T0 });
  check('first sweep expires subscription remainder (300)', e1.ok && e1.totalExpired === 300);
  check('second sweep is a no-op', e2.ok && e2.totalExpired === 0 && l.listLedger('A').length === entriesAfterFirst);
  const bal = l.getBalance('A', T0);
  check('FREE_ONCE 100 survives sweeps', bal.freeOnceAvailable === 100);
  check('invariant holds', invariantHolds(l, 'A'));
}

console.log('=== Cases 15/16/17: reconciliation detection ===');
{
  const bad = reconcileAccountData({
    batches: [{ id: 'b1', type: 'TOP_UP', grantedAmount: 100, remainingAmount: 90, reservedAmount: 0, consumedAmount: 0, expiredAmount: 0, status: 'ACTIVE', expiresAt: null }],
    ledgerEntries: [{ batchId: 'b1', kind: 'GRANT', amount: 100, idempotencyKey: 'k1', operationId: null }],
    operations: [], orders: [],
  }, { now: T0 });
  check('invariant break detected', bad.discrepancies.some((d) => d.kind === 'BATCH_INVARIANT_BROKEN'));
  const mismatchOnly = reconcileAccountData({
    batches: [{ id: 'b2', type: 'TOP_UP', grantedAmount: 100, remainingAmount: 70, reservedAmount: 0, consumedAmount: 30, expiredAmount: 0, status: 'ACTIVE', expiresAt: null }],
    ledgerEntries: [{ batchId: 'b2', kind: 'GRANT', amount: 100, idempotencyKey: 'k2', operationId: null }],
    operations: [], orders: [],
  }, { now: T0 });
  check('ledger/batch mismatch detected (consumed in batch, absent in ledger)',
    mismatchOnly.discrepancies.some((d) => d.kind === 'LEDGER_BATCH_MISMATCH') &&
    !mismatchOnly.discrepancies.some((d) => d.kind === 'BATCH_INVARIANT_BROKEN'));
  const orphan = reconcileAccountData({
    batches: [], ledgerEntries: [],
    operations: [], orders: [{ orderId: 'order-paid-1', status: 'PAID', grantedAt: T0 }],
  }, { now: T0 });
  check('paid order without grant detected', orphan.discrepancies.some((d) => d.kind === 'PAID_ORDER_WITHOUT_GRANT'));
  const bonusOnly = reconcileAccountData({
    batches: [], operations: [], orders: [{ orderId: 'order-paid-2', status: 'PAID', grantedAt: T0 }],
    ledgerEntries: [{ batchId: 'b9', kind: 'GRANT', amount: 10, idempotencyKey: 'order-paid-2:bonus', operationId: null }],
  }, { now: T0 });
  check('bonus-only grant does NOT satisfy paid order', bonusOnly.discrepancies.some((d) => d.kind === 'PAID_ORDER_WITHOUT_GRANT'));
  const stuck = reconcileAccountData({
    batches: [], ledgerEntries: [], orders: [],
    operations: [{ id: 'op-old', status: 'RESERVED', createdAt: T0 - 31 * 60 * 1000 }],
  }, { now: T0 });
  check('stuck reservation detected and unhealthy', stuck.healthy === false && stuck.stuckReservations.length === 1);
}

console.log('=== Case 18: negative / malformed monetary values ===');
{
  const l = freshLedger();
  check('negative grant rejected', (l.grantTopUp({ accountId: 'A', amount: -5, paymentRef: 'x', idempotencyKey: 'n1', now: T0 }) as any).error === 'INVALID_AMOUNT');
  check('zero grant rejected', (l.grantTopUp({ accountId: 'A', amount: 0, paymentRef: 'x', idempotencyKey: 'n2', now: T0 }) as any).error === 'INVALID_AMOUNT');
  check('fractional grant rejected', (l.grantTopUp({ accountId: 'A', amount: 1.5, paymentRef: 'x', idempotencyKey: 'n3', now: T0 }) as any).error === 'INVALID_AMOUNT');
  check('string amount rejected', (l.grantTopUp({ accountId: 'A', amount: '100' as any, paymentRef: 'x', idempotencyKey: 'n4', now: T0 }) as any).error === 'INVALID_AMOUNT');
  check('bonus with NaN expiry rejected (Phase 2)', (l.grantBonus({ accountId: 'A', amount: 10, campaignRef: 'c', expiresAt: Number.NaN, idempotencyKey: 'n5', now: T0 }) as any).error === 'INVALID_EXPIRY');
  check('bonus with string expiry rejected (Phase 2)', (l.grantBonus({ accountId: 'A', amount: 10, campaignRef: 'c', expiresAt: 'tomorrow' as any, idempotencyKey: 'n6', now: T0 }) as any).error === 'INVALID_EXPIRY');
  check('no batches created by rejected grants', l.listBatches('A').length === 0);
  const order = resolveAllocationOrder([
    { id: 'bad', type: 'TOP_UP', remainingAmount: 50, reservedAmount: 0, expiresAt: Number.NaN, grantedAt: T0, status: 'ACTIVE' } as any,
    { id: 'good', type: 'TOP_UP', remainingAmount: 50, reservedAmount: 0, expiresAt: null, grantedAt: T0, status: 'ACTIVE' } as any,
  ], T0);
  check('batch with NaN expiresAt is ineligible (Phase 2 fail-closed)', order.map((b: any) => b.id).join(',') === 'good');
}

console.log('=== Case 19: integer overflow / unsafe numeric conversion (Phase 2 fix) ===');
{
  const l = freshLedger();
  const big: any = l.grantTopUp({ accountId: 'A', amount: 9007199254740992, paymentRef: 'x', idempotencyKey: 'ov1', now: T0 });
  check('2^53 grant rejected as unsafe integer', big.ok === false && big.error === 'INVALID_AMOUNT');
  const maxSafe: any = l.grantTopUp({ accountId: 'A', amount: Number.MAX_SAFE_INTEGER, paymentRef: 'x', idempotencyKey: 'ov2', now: T0 });
  check('MAX_SAFE_INTEGER grant accepted (boundary)', maxSafe.ok === true);
  const neg: any = l.createOperation({ accountId: 'B', feature: 'chat-ai/fast', estimatedCredits: 9007199254740992, idempotencyKey: 'ov3', now: T0 });
  check('unsafe estimatedCredits rejected', neg.ok === false && neg.error === 'INVALID_AMOUNT');
}

console.log('=== Case 20: account / workspace ownership mismatch ===');
{
  const l = freshLedger();
  grantTop(l, 'A', 500, 'g1');
  const r: any = opReserve(l, 'A', 100, 'r20');
  const sForeign: any = l.settle(r.operation.id, { accountId: 'B', actualCredits: 10, usageEvidence: { t: 1 }, tariffVersion: TARIFF, idempotencyKey: 'sf', now: T0 });
  check('settle by another account -> FORBIDDEN', sForeign.ok === false && sForeign.error === 'FORBIDDEN');
  const gForeign: any = l.getOperation(r.operation.id, { accountId: 'B' });
  check('getOperation by another account -> FORBIDDEN', gForeign.ok === false && gForeign.error === 'FORBIDDEN');
  const relForeign: any = l.release(r.operation.id, { accountId: 'B', idempotencyKey: 'rf', now: T0 });
  check('release by another account -> FORBIDDEN', relForeign.ok === false && relForeign.error === 'FORBIDDEN');
  check('operation still RESERVED for rightful owner', (l.getOperation(r.operation.id, { accountId: 'A' }) as any).operation.status === 'RESERVED');
}

console.log('=== Invariant across a mixed lifecycle sequence ===');
{
  const l = freshLedger();
  l.grantSubscription({ accountId: 'A', amount: 1000, periodStart: T0, periodEnd: T0 + 30 * DAY, idempotencyKey: 'sub', now: T0 });
  l.grantBonus({ accountId: 'A', amount: 200, campaignRef: 'c', expiresAt: T0 + 5 * DAY, idempotencyKey: 'bon', now: T0 });
  grantTop(l, 'A', 300, 'top');
  const steps: Array<() => void> = [
    () => { opReserve(l, 'A', 700, 'q1'); },
    () => { const r: any = opReserve(l, 'A', 400, 'q2'); (l as any).__q2 = r.operation.id; },
    () => { l.settle((l as any).__q2, { accountId: 'A', actualCredits: 150, usageEvidence: { t: 1 }, tariffVersion: TARIFF, idempotencyKey: 'q2s', now: T0 }); },
    () => { l.applyExpirations({ accountId: 'A', now: T0 + 40 * DAY }); },
  ];
  let allOk = true;
  for (const step of steps) { step(); if (!invariantHolds(l, 'A')) allOk = false; }
  check('invariant granted = remaining+reserved+consumed+expired after every step', allOk);
}

console.log('=== Cases 3/4: withLedger snapshot concurrency — Sprint 3 guarantees (deterministic interleave) ===');
{
  const ctx = { ownerUserId: 'u1', workspaceId: 'ws1' };
  const { withLedger } = await import('../../api/_lib/billingStore.js');
  // 3a: two snapshots grant FREE_ONCE concurrently. Sprint 3 guarantee:
  // preflightFlush (billingStore.js) sees the winner's GRANT key and
  // FREE_ONCE batch already persisted outside the stale snapshot and
  // rejects the second flush with UNIQUE_VIOLATION BEFORE writing — no
  // orphan batch, no partial state, reconciliation stays healthy.
  const repo = new InMemoryBillingRepository();
  const acct = 'acct-adv-race';
  const snapA: any = await loadLedgerSnapshot(repo as any, acct, ctx);
  const snapB: any = await loadLedgerSnapshot(repo as any, acct, ctx);
  const ledA = createCreditLedger(snapA.store);
  const ledB = createCreditLedger(snapB.store);
  ledA.grantFreeOnce({ accountId: acct, now: T0 });
  ledB.grantFreeOnce({ accountId: acct, now: T0 });
  await flushLedgerSnapshot(repo as any, snapA);
  let flushBError: any = null;
  try { await flushLedgerSnapshot(repo as any, snapB); } catch (e) { flushBError = e; }
  check('second flush rejected before writing (UNIQUE_VIOLATION)',
    flushBError != null && flushBError.code === 'UNIQUE_VIOLATION');
  const fresh: any = await loadLedgerSnapshot(repo as any, acct, ctx);
  const batches = [...fresh.store.batches.values()].map((b: any) => JSON.parse(JSON.stringify(b)));
  const entries = fresh.store.ledger.map((e: any) => ({ ...e }));
  check('final state is exactly 1 FREE_ONCE batch + 1 GRANT entry (no orphan, no partial write)',
    batches.filter((b: any) => b.type === 'FREE_ONCE').length === 1 && batches.length === 1 && entries.filter((e: any) => e.kind === 'GRANT').length === 1);
  const rec = reconcileAccountData({ batches, ledgerEntries: entries, operations: [], orders: [] }, { now: T0 });
  check('reconciliation reports NO orphan (zero LEDGER_BATCH_MISMATCH)',
    !rec.discrepancies.some((d) => d.kind === 'LEDGER_BATCH_MISMATCH'));
  check('reconciliation is healthy after the rejected flush', rec.healthy === true);

  // 4a (Sprint 4 Case 4 — CAS reservasi): two snapshots each reserve 80
  // against the same balance of 100, with DISTINCT operation/reservation
  // idempotency keys so the only possible rejection is the content-CAS in
  // preflightFlush: the winner's flush changes the persisted batch, so the
  // stale snapshot's changed batch no longer matches its load-time
  // original -> LEDGER_CONFLICT before writing. Exactly one reservation
  // may end up backed by the batch; the loser leaves nothing behind.
  const repo3 = new InMemoryBillingRepository();
  const acct3 = 'acct-adv-reserve-cas';
  await withLedger(repo3 as any, acct3, ctx, (l: any) => l.grantTopUp({ accountId: acct3, amount: 100, paymentRef: 'p', idempotencyKey: 'g', now: T0 }));
  const sRA: any = await loadLedgerSnapshot(repo3 as any, acct3, ctx);
  const sRB: any = await loadLedgerSnapshot(repo3 as any, acct3, ctx);
  const doReserve = (snap: any, suffix: string) => {
    const led = createCreditLedger(snap.store);
    const op: any = led.createOperation({ accountId: acct3, feature: 'chat-ai/fast', estimatedCredits: 80, idempotencyKey: `op-${suffix}`, now: T0 });
    if (!op.ok) return op;
    return led.reserve(op.operation.id, { accountId: acct3, idempotencyKey: `res-${suffix}`, now: T0 });
  };
  const resA: any = doReserve(sRA, 'A');
  const resB: any = doReserve(sRB, 'B');
  check('race setup: both snapshots reserve 80 locally against the same 100 balance', resA.ok === true && resB.ok === true);
  let flushRAError: any = null;
  try { await flushLedgerSnapshot(repo3 as any, sRA); } catch (e) { flushRAError = e; }
  check('first reservation flush succeeds', flushRAError == null);
  let flushRBError: any = null;
  try { await flushLedgerSnapshot(repo3 as any, sRB); } catch (e) { flushRBError = e; }
  check('second reservation flush rejected by content-CAS (LEDGER_CONFLICT)',
    flushRBError != null && flushRBError.code === 'LEDGER_CONFLICT');
  const fresh3: any = await loadLedgerSnapshot(repo3 as any, acct3, ctx);
  const batches3 = [...fresh3.store.batches.values()].map((b: any) => JSON.parse(JSON.stringify(b)));
  const entries3 = fresh3.store.ledger.map((e: any) => ({ ...e }));
  const ops3 = [...fresh3.store.operations.values()].map((o: any) => JSON.parse(JSON.stringify(o)));
  const reservedOps3 = ops3.filter((o: any) => o.status === 'RESERVED');
  check('exactly one persisted reservation, backed by an 80 allocation (zero unsupported reservations)',
    ops3.length === 1 && reservedOps3.length === 1 && reservedOps3[0].reservedCredits === 80
    && reservedOps3[0].allocations.reduce((a: number, x: any) => a + x.amount, 0) === 80
    && entries3.filter((e: any) => e.kind === 'RESERVE').length === 1);
  check('batch ends with reservedAmount 80 / remainingAmount 20 and the batch invariant holds',
    batches3.length === 1 && batches3[0].reservedAmount === 80 && batches3[0].remainingAmount === 20
    && batches3.every((b: any) => b.grantedAmount === b.remainingAmount + b.reservedAmount + b.consumedAmount + b.expiredAmount
      && b.remainingAmount >= 0 && b.reservedAmount >= 0 && b.consumedAmount >= 0 && b.expiredAmount >= 0));
  // Reconciliation time basis is the repository wall clock (operation rows
  // get created_at from the repository, not the domain T0) — same basis as
  // the healthy() helper in creditConcurrencySprint3.test.ts; with T0 a
  // legitimate RESERVED operation would be flagged STUCK spuriously.
  const rec3 = reconcileAccountData({ batches: batches3, ledgerEntries: entries3, operations: ops3, orders: [] }, { now: Date.now() });
  check('reconciliation is healthy for the single supported reservation (zero LEDGER_BATCH_MISMATCH)',
    rec3.healthy === true && !rec3.discrepancies.some((d) => d.kind === 'LEDGER_BATCH_MISMATCH'));

  // 4b: two snapshots settle the same reservation with different keys.
  // Sprint 3 guarantee: the second flush is rejected by the same
  // content-CAS (its changed batch/operation no longer match load-time
  // originals) -> LEDGER_CONFLICT, wrapped in try/catch; exactly one
  // CONSUME entry persists and reconciliation stays healthy.
  const repo2 = new InMemoryBillingRepository();
  const acct2 = 'acct-adv-settle';
  await withLedger(repo2 as any, acct2, ctx, (l: any) => l.grantTopUp({ accountId: acct2, amount: 100, paymentRef: 'p', idempotencyKey: 'g', now: T0 }));
  let opId = '';
  await withLedger(repo2 as any, acct2, ctx, (l: any) => {
    const op: any = l.createOperation({ accountId: acct2, feature: 'chat-ai/fast', estimatedCredits: 80, idempotencyKey: 'op', now: T0 });
    opId = op.operation.id;
    return l.reserve(opId, { accountId: acct2, idempotencyKey: 'res', now: T0 });
  });
  const sA: any = await loadLedgerSnapshot(repo2 as any, acct2, ctx);
  const sB: any = await loadLedgerSnapshot(repo2 as any, acct2, ctx);
  // Snapshot-local operation ids differ from persisted ids; resolve via store scan.
  const findOp = (snap: any) => [...snap.store.operations.values()].find((o: any) => o.status === 'RESERVED');
  const opA: any = findOp(sA); const opB: any = findOp(sB);
  createCreditLedger(sA.store).settle(opA.id, { accountId: acct2, actualCredits: 80, usageEvidence: { t: 1 }, tariffVersion: TARIFF, idempotencyKey: 'settle-A', now: T0 });
  createCreditLedger(sB.store).settle(opB.id, { accountId: acct2, actualCredits: 80, usageEvidence: { t: 1 }, tariffVersion: TARIFF, idempotencyKey: 'settle-B', now: T0 });
  await flushLedgerSnapshot(repo2 as any, sA);
  let flushSettleBError: any = null;
  try { await flushLedgerSnapshot(repo2 as any, sB); } catch (e) { flushSettleBError = e; }
  check('second settle flush rejected by content-CAS (LEDGER_CONFLICT)',
    flushSettleBError != null && flushSettleBError.code === 'LEDGER_CONFLICT');
  const fresh2: any = await loadLedgerSnapshot(repo2 as any, acct2, ctx);
  const batches2 = [...fresh2.store.batches.values()].map((b: any) => JSON.parse(JSON.stringify(b)));
  const entries2 = fresh2.store.ledger.map((e: any) => ({ ...e }));
  const consumeEntries = entries2.filter((e: any) => e.kind === 'CONSUME');
  check('final state has exactly 1 CONSUME entry and consumedAmount 80 (no double settle)',
    consumeEntries.length === 1 && batches2[0].consumedAmount === 80);
  const rec2 = reconcileAccountData({ batches: batches2, ledgerEntries: entries2, operations: [...fresh2.store.operations.values()].map((o: any) => JSON.parse(JSON.stringify(o))), orders: [] }, { now: Date.now() });
  check('reconciliation reports NO double-settle divergence (zero LEDGER_BATCH_MISMATCH)',
    !rec2.discrepancies.some((d) => d.kind === 'LEDGER_BATCH_MISMATCH'));
  check('reconciliation is healthy after the rejected settle flush', rec2.healthy === true);
}

console.log(`\nHASIL: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);

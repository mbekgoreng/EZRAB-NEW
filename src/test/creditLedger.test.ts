/**
 * Test: Credit Batch Ledger & Usage-Based Settlement (Phase 5).
 * Dijalankan via esbuild + vitest shim (pola sama seperti usageMeter.test.ts).
 *
 * Mencakup matriks §6 spec Phase 5: ledger batch (SUBSCRIPTION/TOP_UP/BONUS/
 * FREE_ONCE), kebijakan alokasi final Phase 5.1 (subscription → bonus/
 * free-once → top-up; status CONFIRMED_OWNER_PHASE_5_1), reservasi &
 * settlement berbasis usage aktual (USAGE), kedaluwarsa PERIOD_END_30,
 * isolasi akun, dan imutabilitas. Koreksi Phase 5.3 (FREE_ONCE tidak pernah
 * kedaluwarsa, review manual) diuji di phase53BillingSecurity.test.ts.
 * Semua waktu memakai epoch tetap agar deterministik.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveAllocationOrder,
  ALLOCATION_POLICY_STATUS,
} from '../../api/_lib/creditAllocation.js';
import {
  createCreditLedger,
  createMemoryLedgerStore,
  subscriptionExpiresAt,
  SUBSCRIPTION_ROLLOVER_MS,
  FREE_ONCE_AMOUNT,
} from '../../api/_lib/creditLedger.js';
import {
  createTariffRegistry,
  computeUsageCost,
  creditsFromTokens,
  normalizeProviderUsage,
  TARIFF_REGISTRY_VERSION,
} from '../../api/_lib/tariffRegistry.js';
import { createMemoryUsageStore } from '../../api/_lib/usageStore.js';
import { createUsageMeter } from '../../api/_lib/usageMeter.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_800_000_000_000; // epoch tetap
const P_START = T0;
const P_END = T0 + 30 * DAY;
const P_EXP = P_END + 30 * DAY; // kedaluwarsa batch periode pertama

function batchLike(partial: Record<string, unknown>) {
  return {
    id: 'b?', type: 'SUBSCRIPTION', remainingAmount: 100, reservedAmount: 0,
    expiresAt: null, grantedAt: T0, status: 'ACTIVE', ...partial,
  };
}

describe('creditAllocation', () => {
  it('1. subscription dipakai sebelum top-up (walau top-up terbit lebih dulu)', () => {
    const order = resolveAllocationOrder([
      batchLike({ id: 'b-top', type: 'TOP_UP', grantedAt: T0 - 10 * DAY }),
      batchLike({ id: 'b-sub', type: 'SUBSCRIPTION', expiresAt: P_EXP, grantedAt: T0 }),
    ], T0);
    expect(order.map((b) => b.id)).toEqual(['b-sub', 'b-top']);
  });

  it('2. subscription kedaluwarsa-tercepat dipakai lebih dulu', () => {
    const order = resolveAllocationOrder([
      batchLike({ id: 'b-late', type: 'SUBSCRIPTION', expiresAt: P_EXP + 30 * DAY }),
      batchLike({ id: 'b-early', type: 'SUBSCRIPTION', expiresAt: P_EXP }),
    ], T0);
    expect(order.map((b) => b.id)).toEqual(['b-early', 'b-late']);
  });

  it('3. batch kedaluwarsa/sisa nol dikeluarkan; bonus & free-once sebelum top-up; tanpa kedaluwarsa terakhir di grupnya', () => {
    const order = resolveAllocationOrder([
      batchLike({ id: 'b-expired', type: 'SUBSCRIPTION', expiresAt: T0 - 1 }),
      batchLike({ id: 'b-empty', type: 'SUBSCRIPTION', expiresAt: P_EXP, remainingAmount: 0 }),
      batchLike({ id: 'b-top', type: 'TOP_UP', grantedAt: T0 - 5 * DAY }),
      batchLike({ id: 'b-bonus-null', type: 'BONUS', expiresAt: null, grantedAt: T0 - 4 * DAY }),
      batchLike({ id: 'b-free', type: 'FREE_ONCE', expiresAt: T0 + 90 * DAY, grantedAt: T0 - 3 * DAY }),
      batchLike({ id: 'b-bonus-exp', type: 'BONUS', expiresAt: T0 + 10 * DAY, grantedAt: T0 - 2 * DAY }),
    ], T0);
    expect(order.map((b) => b.id)).toEqual(['b-bonus-exp', 'b-free', 'b-bonus-null', 'b-top']);
  });

  it('4. status kebijakan alokasi eksplisit & urutan deterministik', () => {
    expect(ALLOCATION_POLICY_STATUS).toBe('CONFIRMED_OWNER_PHASE_5_1');
    const input = [
      batchLike({ id: 'x2', type: 'TOP_UP', grantedAt: T0 + 1 }),
      batchLike({ id: 'x1', type: 'TOP_UP', grantedAt: T0 + 1 }),
      batchLike({ id: 'x0', type: 'SUBSCRIPTION', expiresAt: P_EXP }),
    ];
    const a = resolveAllocationOrder(input, T0).map((b) => b.id);
    const b = resolveAllocationOrder(input, T0).map((b) => b.id);
    expect(a).toEqual(b);
    expect(a).toEqual(['x0', 'x1', 'x2']);
  });
});

describe('creditLedger — grant & saldo', () => {
  it('5. grantSubscription: expiresAt = periodEnd + 30 hari persis (PERIOD_END_30)', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    const r = ledger.grantSubscription({
      accountId: 'acc1', amount: 5000, periodStart: P_START, periodEnd: P_END,
      sourceRef: 'sub:acc1:1', idempotencyKey: 'g-sub-1', actor: 'system', now: T0,
    });
    expect(r.ok).toBe(true);
    expect(r.batch.expiresAt).toBe(P_END + SUBSCRIPTION_ROLLOVER_MS);
    expect(r.batch.expiresAt - P_END).toBe(30 * DAY);
    expect(subscriptionExpiresAt(P_END)).toBe(P_END + 30 * DAY);
    expect(r.batch.type).toBe('SUBSCRIPTION');
    expect(r.batch.wallet).toBe('SUBSCRIPTION_CREDITS');
    expect(r.batch.periodRef).toEqual({ periodStart: P_START, periodEnd: P_END });
  });

  it('6. idempotensi grant: kunci sama tidak menggandakan batch/entri/saldo', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    const args = {
      accountId: 'acc1', amount: 5000, periodStart: P_START, periodEnd: P_END,
      sourceRef: 'sub:acc1:1', idempotencyKey: 'g-dup', actor: 'system', now: T0,
    };
    const r1 = ledger.grantSubscription(args);
    const r2 = ledger.grantSubscription(args);
    expect(r1.ok).toBe(true);
    expect(r2.duplicate).toBe(true);
    expect(r2.batch.id).toBe(r1.batch.id);
    expect(ledger.listBatches('acc1').length).toBe(1);
    expect(ledger.listLedger('acc1').filter((e) => e.kind === 'GRANT').length).toBe(1);
    expect(ledger.getBalance('acc1', T0).subscriptionAvailable).toBe(5000);
  });

  it('7. grantTopUp: tidak pernah kedaluwarsa; identitas pembayaran dipertahankan', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    const r = ledger.grantTopUp({
      accountId: 'acc1', amount: 1500, paymentRef: 'pay_123',
      idempotencyKey: 'g-top-1', now: T0,
    });
    expect(r.ok).toBe(true);
    expect(r.batch.type).toBe('TOP_UP');
    expect(r.batch.expiresAt).toBe(null);
    expect(r.batch.sourceRef).toBe('pay_123');
    // jauh di masa depan pun top-up tetap tersedia (tidak kena aturan rollover)
    expect(ledger.getBalance('acc1', T0 + 3650 * DAY).topupAvailable).toBe(1500);
  });

  it('8. grantBonus: identitas campaign terjaga & TIDAK melebur ke saldo top-up', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantTopUp({ accountId: 'acc1', amount: 500, paymentRef: 'pay_1', idempotencyKey: 'g-t', now: T0 });
    const r = ledger.grantBonus({
      accountId: 'acc1', amount: 200, campaignRef: 'promo-launch',
      expiresAt: T0 + 14 * DAY, grantedBy: 'admin:rina', idempotencyKey: 'g-b-1', now: T0,
    });
    expect(r.ok).toBe(true);
    expect(r.batch.type).toBe('BONUS');
    expect(r.batch.sourceRef).toBe('promo-launch');
    const entry = ledger.listLedger('acc1').find((e) => e.batchId === r.batch.id);
    expect(entry?.actor).toBe('admin:rina');
    const bal = ledger.getBalance('acc1', T0);
    expect(bal.bonusAvailable).toBe(200);
    expect(bal.topupAvailable).toBe(500);
    expect(bal.total).toBe(700);
  });

  it('9. free-once: 100 kredit satu kali — pengulangan & instance baru di store sama tidak menggandakan', () => {
    const store = createMemoryLedgerStore();
    const ledger1 = createCreditLedger(store);
    const r1 = ledger1.grantFreeOnce({ accountId: 'acc9', actor: 'system', now: T0 });
    expect(r1.ok).toBe(true);
    expect(r1.batch.type).toBe('FREE_ONCE');
    expect(r1.batch.grantedAmount).toBe(FREE_ONCE_AMOUNT);
    expect(FREE_ONCE_AMOUNT).toBe(100);
    // Phase 5.3: FREE_ONCE TIDAK PERNAH kedaluwarsa (Phase 5.1 C3) —
    // menggantikan asersi 90 hari dari implementasi Phase 5.
    expect(r1.batch.expiresAt).toBe(null);
    const r2 = ledger1.grantFreeOnce({ accountId: 'acc9', actor: 'system', now: T0 + DAY });
    expect(r2.duplicate).toBe(true);
    // simulasi inisialisasi ulang: engine BARU di atas store yang sama
    const ledger2 = createCreditLedger(store);
    const r3 = ledger2.grantFreeOnce({ accountId: 'acc9', actor: 'system', now: T0 + 2 * DAY });
    expect(r3.duplicate).toBe(true);
    expect(ledger2.listBatches('acc9').length).toBe(1);
    expect(ledger2.getBalance('acc9', T0).freeOnceAvailable).toBe(100);
    // 10 tahun kemudian pun FREE_ONCE masih tersedia penuh (tidak kedaluwarsa)
    expect(ledger2.getBalance('acc9', T0 + 3650 * DAY).freeOnceAvailable).toBe(100);
  });

  it('10. jumlah tidak valid (float/negatif/NaN) ditolak tanpa mengubah state', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    for (const bad of [10.5, -100, NaN, 0]) {
      const r = ledger.grantTopUp({
        accountId: 'acc1', amount: bad, paymentRef: 'p', idempotencyKey: `g-bad-${String(bad)}`, now: T0,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('INVALID_AMOUNT');
    }
    expect(ledger.listBatches('acc1').length).toBe(0);
    expect(ledger.getBalance('acc1', T0).total).toBe(0);
  });

  it('11. getBalance: komposisi per tipe + reserved + total benar', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantSubscription({ accountId: 'a', amount: 5000, periodStart: P_START, periodEnd: P_END, idempotencyKey: 'k1', now: T0 });
    ledger.grantTopUp({ accountId: 'a', amount: 1500, paymentRef: 'p', idempotencyKey: 'k2', now: T0 });
    ledger.grantBonus({ accountId: 'a', amount: 200, campaignRef: 'c', expiresAt: T0 + 7 * DAY, grantedBy: 'admin', idempotencyKey: 'k3', now: T0 });
    ledger.grantFreeOnce({ accountId: 'a', now: T0 });
    const bal = ledger.getBalance('a', T0);
    expect(bal.subscriptionAvailable).toBe(5000);
    expect(bal.topupAvailable).toBe(1500);
    expect(bal.bonusAvailable).toBe(200);
    expect(bal.freeOnceAvailable).toBe(100);
    expect(bal.reserved).toBe(0);
    expect(bal.total).toBe(6800);
  });
});

describe('creditLedger — reservasi & settlement (USAGE)', () => {
  function funded(amount = 10000) {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantSubscription({
      accountId: 'acc', amount, periodStart: P_START, periodEnd: P_END,
      idempotencyKey: 'seed', actor: 'system', now: T0,
    });
    return ledger;
  }
  const USAGE = { tokensIn: 5000, tokensOut: 1000, tokensCached: 0, source: 'test' };

  it('12. kanonis: reserve 800 → aktual 500 → konsumsi 500, lepas 300, saldo turun tepat 500', () => {
    const ledger = funded();
    expect(ledger.getBalance('acc', T0).subscriptionAvailable).toBe(10000);
    const op = ledger.createOperation({
      accountId: 'acc', feature: 'ded-ai', estimatedCredits: 800,
      idempotencyKey: 'op-12', actor: 'user1', now: T0,
    }).operation;
    const rsv = ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-12', now: T0 });
    expect(rsv.ok).toBe(true);
    let bal = ledger.getBalance('acc', T0);
    expect(bal.subscriptionAvailable).toBe(9200);
    expect(bal.reserved).toBe(800);

    const st = ledger.settle(op.id, {
      accountId: 'acc', actualCredits: 500, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: USAGE, idempotencyKey: 'stl-12', now: T0 + 1000,
    });
    expect(st.ok).toBe(true);
    expect(st.settledCredits).toBe(500);
    expect(st.releasedCredits).toBe(300);
    expect(st.operation.status).toBe('SETTLED');
    expect(st.operation.estimateDelta).toBe(300); // estimasi vs aktual tercatat terpisah
    bal = ledger.getBalance('acc', T0);
    expect(bal.subscriptionAvailable).toBe(9500); // BUKAN 9200 (tidak dobel) dan sisa 300 tidak hilang
    expect(bal.reserved).toBe(0);
    const batch = ledger.listBatches('acc')[0];
    expect(batch.consumedAmount).toBe(500);
    expect(batch.remainingAmount).toBe(9500);
    const kinds = ledger.listLedger('acc').map((e) => `${e.kind}:${e.amount}`);
    expect(kinds).toEqual(['GRANT:10000', 'RESERVE:-800', 'CONSUME:-500', 'RESERVE_RELEASE:300']);
  });

  it('13. saldo tidak cukup → INSUFFICIENT_BALANCE tanpa alokasi parsial', () => {
    const ledger = funded(500);
    const op = ledger.createOperation({ accountId: 'acc', feature: 'ded-ai', estimatedCredits: 800, idempotencyKey: 'op-13', now: T0 }).operation;
    const rsv = ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-13', now: T0 });
    expect(rsv.ok).toBe(false);
    expect(rsv.error).toBe('INSUFFICIENT_BALANCE');
    expect(ledger.getOperation(op.id, { accountId: 'acc' }).operation.status).toBe('CREATED');
    expect(ledger.listLedger('acc').filter((e) => e.kind === 'RESERVE').length).toBe(0);
    expect(ledger.getBalance('acc', T0).subscriptionAvailable).toBe(500);
  });

  it('14. reservasi konkuren: reservasi kedua yang melebihi sisa gagal bersih', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantTopUp({ accountId: 'acc', amount: 1000, paymentRef: 'p', idempotencyKey: 'seed', now: T0 });
    const op1 = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 800, idempotencyKey: 'op-14a', now: T0 }).operation;
    const op2 = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 800, idempotencyKey: 'op-14b', now: T0 }).operation;
    expect(ledger.reserve(op1.id, { accountId: 'acc', idempotencyKey: 'rsv-14a', now: T0 }).ok).toBe(true);
    const r2 = ledger.reserve(op2.id, { accountId: 'acc', idempotencyKey: 'rsv-14b', now: T0 });
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe('INSUFFICIENT_BALANCE');
    const bal = ledger.getBalance('acc', T0);
    expect(bal.topupAvailable).toBe(200);
    expect(bal.reserved).toBe(800);
  });

  it('15. settle berulang (kunci sama & berbeda) → efek tunggal', () => {
    const ledger = funded();
    const op = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 800, idempotencyKey: 'op-15', now: T0 }).operation;
    ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-15', now: T0 });
    const args = { accountId: 'acc', actualCredits: 500, tariffVersion: TARIFF_REGISTRY_VERSION, usageEvidence: USAGE, now: T0 };
    const s1 = ledger.settle(op.id, { ...args, idempotencyKey: 'stl-15' });
    const s2 = ledger.settle(op.id, { ...args, idempotencyKey: 'stl-15' });
    const s3 = ledger.settle(op.id, { ...args, idempotencyKey: 'stl-15-lain' });
    expect(s1.ok).toBe(true);
    expect(s2.duplicate).toBe(true);
    expect(s3.duplicate).toBe(true);
    expect(s3.settledCredits).toBe(500);
    expect(ledger.listLedger('acc').filter((e) => e.kind === 'CONSUME').length).toBe(1);
    expect(ledger.getBalance('acc', T0).subscriptionAvailable).toBe(9500);
  });

  it('16. release penuh mengembalikan saldo; release berulang tanpa efek ganda', () => {
    const ledger = funded();
    const op = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 800, idempotencyKey: 'op-16', now: T0 }).operation;
    ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-16', now: T0 });
    const r1 = ledger.release(op.id, { accountId: 'acc', idempotencyKey: 'rel-16', now: T0 });
    expect(r1.ok).toBe(true);
    expect(r1.releasedCredits).toBe(800);
    const r2 = ledger.release(op.id, { accountId: 'acc', idempotencyKey: 'rel-16', now: T0 });
    expect(r2.duplicate).toBe(true);
    const bal = ledger.getBalance('acc', T0);
    expect(bal.subscriptionAvailable).toBe(10000);
    expect(bal.reserved).toBe(0);
    // settle setelah release ditolak
    const st = ledger.settle(op.id, { accountId: 'acc', actualCredits: 100, tariffVersion: TARIFF_REGISTRY_VERSION, usageEvidence: USAGE, idempotencyKey: 'stl-16', now: T0 });
    expect(st.ok).toBe(false);
    expect(st.error).toBe('INVALID_STATE');
  });

  it('17. settlement setelah batch kedaluwarsa: sisa reservasi di-write-off EXPIRATION, bukan kembali ke saldo', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantSubscription({ accountId: 'acc', amount: 800, periodStart: P_START, periodEnd: P_END, idempotencyKey: 'seed', now: T0 });
    const op = ledger.createOperation({ accountId: 'acc', feature: 'ded-ai', estimatedCredits: 800, idempotencyKey: 'op-17', now: T0 }).operation;
    // reserve sehari sebelum kedaluwarsa batch (masih layak)
    expect(ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-17', now: P_EXP - DAY }).ok).toBe(true);
    // settle sehari SETELAH kedaluwarsa batch
    const st = ledger.settle(op.id, {
      accountId: 'acc', actualCredits: 500, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: USAGE, idempotencyKey: 'stl-17', now: P_EXP + DAY,
    });
    expect(st.ok).toBe(true);
    const batch = ledger.listBatches('acc')[0];
    expect(batch.consumedAmount).toBe(500);
    expect(batch.expiredAmount).toBe(300); // sisa 300 hangus tercatat, tidak menguap diam-diam
    expect(batch.reservedAmount).toBe(0);
    expect(batch.remainingAmount).toBe(0);
    expect(ledger.listLedger('acc').some((e) => e.kind === 'EXPIRATION' && e.amount === -300)).toBe(true);
    expect(ledger.getBalance('acc', P_EXP + DAY).total).toBe(0);
  });

  it('18. reserve setelah batch kedaluwarsa → batch dikeluarkan dari alokasi', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantSubscription({ accountId: 'acc', amount: 800, periodStart: P_START, periodEnd: P_END, idempotencyKey: 'seed', now: T0 });
    const op = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 100, idempotencyKey: 'op-18', now: P_EXP + DAY }).operation;
    const rsv = ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-18', now: P_EXP + DAY });
    expect(rsv.ok).toBe(false);
    expect(rsv.error).toBe('INSUFFICIENT_BALANCE');
  });

  it('19. aktual > reservasi → REQUIRES_REVIEW, bukti dipertahankan, saldo TIDAK berubah', () => {
    const ledger = funded();
    const op = ledger.createOperation({ accountId: 'acc', feature: 'ded-ai', estimatedCredits: 800, idempotencyKey: 'op-19', now: T0 }).operation;
    ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-19', now: T0 });
    const st = ledger.settle(op.id, {
      accountId: 'acc', actualCredits: 1000, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: USAGE, idempotencyKey: 'stl-19', now: T0,
    });
    expect(st.ok).toBe(true);
    expect(st.status).toBe('REQUIRES_REVIEW');
    expect(st.overageCredits).toBe(200);
    const saved = ledger.getOperation(op.id, { accountId: 'acc' }).operation;
    expect(saved.status).toBe('REQUIRES_REVIEW');
    expect(saved.usageEvidence).toEqual(USAGE);
    const bal = ledger.getBalance('acc', T0);
    expect(bal.subscriptionAvailable).toBe(9200); // tidak ada debit parsial, tidak negatif
    expect(bal.reserved).toBe(800);
    expect(ledger.listLedger('acc').filter((e) => e.kind === 'CONSUME').length).toBe(0);
  });

  it('20. usage hilang → USAGE_MISSING, operasi tetap RESERVED (estimasi tidak di-settle diam-diam)', () => {
    const ledger = funded();
    const op = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 800, idempotencyKey: 'op-20', now: T0 }).operation;
    ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-20', now: T0 });
    const st = ledger.settle(op.id, {
      accountId: 'acc', actualCredits: 500, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: null, idempotencyKey: 'stl-20', now: T0,
    });
    expect(st.ok).toBe(false);
    expect(st.error).toBe('USAGE_MISSING');
    expect(ledger.getOperation(op.id, { accountId: 'acc' }).operation.status).toBe('RESERVED');
    expect(ledger.getBalance('acc', T0).reserved).toBe(800);
  });

  it('21. usage tidak valid (negatif/float/NaN) → INVALID_USAGE, state utuh', () => {
    const ledger = funded();
    const op = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 800, idempotencyKey: 'op-21', now: T0 }).operation;
    ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-21', now: T0 });
    for (const bad of [-5, 500.5, NaN]) {
      const st = ledger.settle(op.id, {
        accountId: 'acc', actualCredits: bad, tariffVersion: TARIFF_REGISTRY_VERSION,
        usageEvidence: USAGE, idempotencyKey: `stl-21-${String(bad)}`, now: T0,
      });
      expect(st.ok).toBe(false);
      expect(st.error).toBe('INVALID_USAGE');
    }
    expect(ledger.getOperation(op.id, { accountId: 'acc' }).operation.status).toBe('RESERVED');
    expect(ledger.getBalance('acc', T0).reserved).toBe(800);
  });

  it('22. versi tarif tidak dikenal → UNKNOWN_TARIFF, state utuh', () => {
    const ledger = funded();
    const op = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 800, idempotencyKey: 'op-22', now: T0 }).operation;
    ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-22', now: T0 });
    const st = ledger.settle(op.id, {
      accountId: 'acc', actualCredits: 500, tariffVersion: 'versi-ngasal-9',
      usageEvidence: USAGE, idempotencyKey: 'stl-22', now: T0,
    });
    expect(st.ok).toBe(false);
    expect(st.error).toBe('UNKNOWN_TARIFF');
    expect(ledger.getOperation(op.id, { accountId: 'acc' }).operation.status).toBe('RESERVED');
  });

  it('23. settle sebelum reserve → INVALID_STATE', () => {
    const ledger = funded();
    const op = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 800, idempotencyKey: 'op-23', now: T0 }).operation;
    const st = ledger.settle(op.id, {
      accountId: 'acc', actualCredits: 500, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: USAGE, idempotencyKey: 'stl-23', now: T0,
    });
    expect(st.ok).toBe(false);
    expect(st.error).toBe('INVALID_STATE');
  });

  it('24. alokasi lintas batch: subscription habis dulu, top-up hanya menutup kekurangan; identitas top-up terjaga', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantTopUp({ accountId: 'acc', amount: 1000, paymentRef: 'pay_x', idempotencyKey: 'k-top', now: T0 });
    ledger.grantSubscription({ accountId: 'acc', amount: 500, periodStart: P_START, periodEnd: P_END, idempotencyKey: 'k-sub', now: T0 });
    const op = ledger.createOperation({ accountId: 'acc', feature: 'ded-ai', estimatedCredits: 800, idempotencyKey: 'op-24', now: T0 }).operation;
    const rsv = ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-24', now: T0 });
    expect(rsv.ok).toBe(true);
    const allocByType = rsv.allocations.map((a) => {
      const b = ledger.listBatches('acc').find((x) => x.id === a.batchId);
      return `${b?.type}:${a.amount}`;
    });
    expect(allocByType).toEqual(['SUBSCRIPTION:500', 'TOP_UP:300']);
    const st = ledger.settle(op.id, {
      accountId: 'acc', actualCredits: 800, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: USAGE, idempotencyKey: 'stl-24', now: T0,
    });
    expect(st.ok).toBe(true);
    const top = ledger.listBatches('acc').find((b) => b.type === 'TOP_UP');
    expect(top?.remainingAmount).toBe(700);
    expect(top?.consumedAmount).toBe(300);
    expect(top?.sourceRef).toBe('pay_x'); // sumber pembayaran tidak hilang setelah konsumsi
    expect(top?.expiresAt).toBe(null); // aturan rollover langganan tidak menular ke top-up
    const bal = ledger.getBalance('acc', T0);
    expect(bal.subscriptionAvailable).toBe(0);
    expect(bal.topupAvailable).toBe(700);
  });
});

describe('creditLedger — kedaluwarsa, isolasi, imutabilitas', () => {
  it('25. applyExpirations: sisa → expiredAmount via entri EXPIRATION; idempotent; dana ter-reserve tidak disentuh', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantSubscription({ accountId: 'acc', amount: 1000, periodStart: P_START, periodEnd: P_END, idempotencyKey: 'k-a', now: T0 });
    ledger.grantSubscription({
      accountId: 'acc', amount: 500, periodStart: P_END, periodEnd: P_END + 30 * DAY,
      idempotencyKey: 'k-b', now: T0,
    });
    ledger.grantSubscription({ accountId: 'acc', amount: 800, periodStart: P_START, periodEnd: P_END, idempotencyKey: 'k-c', now: T0 });
    const op = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 300, idempotencyKey: 'op-25', now: T0 }).operation;
    ledger.reserve(op.id, { accountId: 'acc', idempotencyKey: 'rsv-25', now: T0 }); // dari batch k-a (kedaluwarsa tercepat)

    const sweep1 = ledger.applyExpirations({ accountId: 'acc', now: P_EXP + DAY });
    expect(sweep1.ok).toBe(true);
    expect(sweep1.totalExpired).toBe(700 + 800); // sisa k-a (1000-300 reserve) + k-c penuh
    const batches = ledger.listBatches('acc');
    const a = batches.find((b) => b.grantedAmount === 1000);
    expect(a?.expiredAmount).toBe(700);
    expect(a?.remainingAmount).toBe(0);
    expect(a?.reservedAmount).toBe(300); // reservasi hidup tidak ikut hangus
    expect(a?.status).toBe('EXPIRED');
    const bNext = batches.find((b) => b.grantedAmount === 500);
    expect(bNext?.remainingAmount).toBe(500); // periode berikutnya belum kedaluwarsa
    const expCount = ledger.listLedger('acc').filter((e) => e.kind === 'EXPIRATION').length;
    expect(expCount).toBe(2);
    const sweep2 = ledger.applyExpirations({ accountId: 'acc', now: P_EXP + DAY });
    expect(sweep2.totalExpired).toBe(0);
    expect(ledger.listLedger('acc').filter((e) => e.kind === 'EXPIRATION').length).toBe(2);
  });

  it('26. isolasi akun: operasi lintas akun → FORBIDDEN; saldo korban utuh', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantTopUp({ accountId: 'korban', amount: 1000, paymentRef: 'p', idempotencyKey: 'k-v', now: T0 });
    const op = ledger.createOperation({ accountId: 'korban', feature: 'chat', estimatedCredits: 100, idempotencyKey: 'op-26', now: T0 }).operation;
    expect(ledger.reserve(op.id, { accountId: 'penyerang', idempotencyKey: 'x1', now: T0 }).error).toBe('FORBIDDEN');
    expect(ledger.getOperation(op.id, { accountId: 'penyerang' }).error).toBe('FORBIDDEN');
    ledger.reserve(op.id, { accountId: 'korban', idempotencyKey: 'rsv-26', now: T0 });
    expect(ledger.settle(op.id, {
      accountId: 'penyerang', actualCredits: 100, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: { tokensIn: 1, tokensOut: 1 }, idempotencyKey: 'x2', now: T0,
    }).error).toBe('FORBIDDEN');
    expect(ledger.release(op.id, { accountId: 'penyerang', idempotencyKey: 'x3', now: T0 }).error).toBe('FORBIDDEN');
    expect(ledger.getBatch(ledger.listBatches('korban')[0].id, { accountId: 'penyerang' }).error).toBe('FORBIDDEN');
    expect(ledger.getBalance('korban', T0).reserved).toBe(100);
    expect(ledger.getBalance('penyerang', T0).total).toBe(0);
  });

  it('27. imutabilitas: mengubah objek kembalian tidak mengubah state; entri tersimpan beku', () => {
    const store = createMemoryLedgerStore();
    const ledger = createCreditLedger(store);
    const r = ledger.grantTopUp({ accountId: 'acc', amount: 1000, paymentRef: 'p', idempotencyKey: 'k-i', now: T0 });
    r.batch.remainingAmount = 999999;
    r.batch.grantedAmount = 999999;
    expect(ledger.getBalance('acc', T0).topupAvailable).toBe(1000);
    const entries = ledger.listLedger('acc');
    entries[0].amount = -999999;
    expect(ledger.listLedger('acc')[0].amount).toBe(1000);
    expect(Object.isFrozen(store.ledger[0])).toBe(true);
    const listed = ledger.listBatches('acc');
    listed[0].remainingAmount = 0;
    expect(ledger.getBalance('acc', T0).topupAvailable).toBe(1000);
  });

  it('28. invarian akuntansi selalu berlaku & tidak ada saldo negatif setelah rangkaian campur', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantSubscription({ accountId: 'acc', amount: 5000, periodStart: P_START, periodEnd: P_END, idempotencyKey: 'm1', now: T0 });
    ledger.grantTopUp({ accountId: 'acc', amount: 1500, paymentRef: 'p', idempotencyKey: 'm2', now: T0 });
    ledger.grantBonus({ accountId: 'acc', amount: 300, campaignRef: 'c', expiresAt: T0 + 5 * DAY, grantedBy: 'admin', idempotencyKey: 'm3', now: T0 });
    ledger.grantFreeOnce({ accountId: 'acc', now: T0 });
    const op1 = ledger.createOperation({ accountId: 'acc', feature: 'ded-ai', estimatedCredits: 2000, idempotencyKey: 'mo1', now: T0 }).operation;
    ledger.reserve(op1.id, { accountId: 'acc', idempotencyKey: 'mr1', now: T0 });
    ledger.settle(op1.id, { accountId: 'acc', actualCredits: 1200, tariffVersion: TARIFF_REGISTRY_VERSION, usageEvidence: { tokensIn: 9, tokensOut: 9 }, idempotencyKey: 'ms1', now: T0 });
    const op2 = ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 400, idempotencyKey: 'mo2', now: T0 }).operation;
    ledger.reserve(op2.id, { accountId: 'acc', idempotencyKey: 'mr2', now: T0 });
    ledger.release(op2.id, { accountId: 'acc', idempotencyKey: 'mrel2', now: T0 });
    ledger.applyExpirations({ accountId: 'acc', now: T0 + 10 * DAY }); // bonus kedaluwarsa
    for (const b of ledger.listBatches('acc')) {
      expect(b.grantedAmount).toBe(b.remainingAmount + b.reservedAmount + b.consumedAmount + b.expiredAmount);
      expect(b.remainingAmount >= 0).toBe(true);
      expect(b.reservedAmount >= 0).toBe(true);
      expect(b.consumedAmount >= 0).toBe(true);
      expect(b.expiredAmount >= 0).toBe(true);
    }
    const bal = ledger.getBalance('acc', T0 + 10 * DAY);
    expect(bal.total >= 0).toBe(true);
  });
});

describe('tariffRegistry', () => {
  it('29. seed jujur: model lama ada dengan harga null + UNKNOWN; biaya UNDETERMINED', () => {
    const reg = createTariffRegistry();
    const t = reg.getTariff('gemini', 'gemini-3.5-flash-lite', T0);
    expect(t === null).toBe(false);
    expect(t?.inputPer1M).toBe(null);
    expect(t?.verificationStatus).toBe('UNKNOWN');
    expect(reg.hasVersion(TARIFF_REGISTRY_VERSION)).toBe(true);
    const cost = computeUsageCost({ tokensIn: 1000, tokensOut: 500, tokensCached: 0 }, t);
    expect(cost.status).toBe('UNDETERMINED');
    expect(cost.cost).toBe(null);
  });

  it('30. model tak dikenal → null; tanpa tarif → UNDETERMINED (tidak menebak)', () => {
    const reg = createTariffRegistry();
    expect(reg.getTariff('gemini', 'model-ngasal', T0)).toBe(null);
    expect(computeUsageCost({ tokensIn: 1, tokensOut: 1, tokensCached: 0 }, null).status).toBe('UNDETERMINED');
    expect(computeUsageCost(null, null).status).toBe('USAGE_UNAVAILABLE');
  });

  it('31. tarif berharga VERIFIED → biaya ACTUAL, cached dihitung pada tarif cached', () => {
    const reg = createTariffRegistry([]);
    reg.register({
      providerId: 'gemini', modelId: 'm-priced',
      inputPer1M: 2, outputPer1M: 8, cachedInputPer1M: 0.5,
      currency: 'USD', effectiveFrom: T0, effectiveTo: null,
      version: 'v-priced', source: 'https://example.invalid/pricing', verificationStatus: 'VERIFIED',
    });
    const t = reg.getTariff('gemini', 'm-priced', T0 + DAY);
    const cost = computeUsageCost({ tokensIn: 1_000_000, tokensOut: 500_000, tokensCached: 200_000 }, t);
    expect(cost.status).toBe('ACTUAL');
    // (800rb × 2 + 200rb × 0.5 + 500rb × 8) / 1jt = 1.6 + 0.1 + 4.0 = 5.7
    expect(Math.abs((cost.cost as number) - 5.7) < 1e-9).toBe(true);
    expect(reg.getTariff('gemini', 'm-priced', T0 - DAY)).toBe(null); // belum efektif
  });

  it('32. creditsFromTokens: rate null → UNKNOWN_TARIFF; versi tarif berbeda → kredit aktual berbeda & tercatat', () => {
    const usage = { tokensIn: 10000, tokensOut: 5000, tokensCached: 0 };
    expect(creditsFromTokens(usage, { version: 'v1' } as never, null).status).toBe('UNKNOWN_TARIFF');
    const reg = createTariffRegistry([]);
    reg.register({ providerId: 'gemini', modelId: 'm', inputPer1M: null, outputPer1M: null, cachedInputPer1M: null, currency: 'USD', effectiveFrom: T0, effectiveTo: null, version: 'tarif-v1', source: null, verificationStatus: 'UNVERIFIED' });
    reg.register({ providerId: 'gemini', modelId: 'm', inputPer1M: null, outputPer1M: null, cachedInputPer1M: null, currency: 'USD', effectiveFrom: T0, effectiveTo: null, version: 'tarif-v2', source: null, verificationStatus: 'UNVERIFIED' });
    const t1 = { ...reg.getTariff('gemini', 'm', T0), version: 'tarif-v1' };
    const t2 = { ...reg.getTariff('gemini', 'm', T0), version: 'tarif-v2' };
    const c1 = creditsFromTokens(usage, t1, { creditsPer1kIn: 1, creditsPer1kOut: 2 });
    const c2 = creditsFromTokens(usage, t2, { creditsPer1kIn: 2, creditsPer1kOut: 4 });
    expect(c1.credits).toBe(20);
    expect(c2.credits).toBe(40);

    const ledger = createCreditLedger(createMemoryLedgerStore(), { tariffs: reg });
    ledger.grantTopUp({ accountId: 'acc', amount: 1000, paymentRef: 'p', idempotencyKey: 'tv-seed', now: T0 });
    const mk = (key: string) => ledger.createOperation({ accountId: 'acc', feature: 'chat', estimatedCredits: 100, idempotencyKey: key, now: T0 }).operation;
    const opA = mk('tv-op-a');
    const opB = mk('tv-op-b');
    ledger.reserve(opA.id, { accountId: 'acc', idempotencyKey: 'tv-rsv-a', now: T0 });
    ledger.reserve(opB.id, { accountId: 'acc', idempotencyKey: 'tv-rsv-b', now: T0 });
    const sA = ledger.settle(opA.id, { accountId: 'acc', actualCredits: c1.credits as number, tariffVersion: 'tarif-v1', usageEvidence: usage, idempotencyKey: 'tv-stl-a', now: T0 });
    const sB = ledger.settle(opB.id, { accountId: 'acc', actualCredits: c2.credits as number, tariffVersion: 'tarif-v2', usageEvidence: usage, idempotencyKey: 'tv-stl-b', now: T0 });
    expect(sA.settledCredits).toBe(20);
    expect(sB.settledCredits).toBe(40);
    expect(sA.operation.tariffVersion).toBe('tarif-v1');
    expect(sB.operation.tariffVersion).toBe('tarif-v2');
  });

  it('33. normalizeProviderUsage: gemini & generic memetakan benar; raw dipertahankan apa adanya', () => {
    const rawGemini = { usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, cachedContentTokenCount: 200, totalTokenCount: 1500 } };
    const g = normalizeProviderUsage('gemini', rawGemini);
    expect(g.tokensIn).toBe(1200);
    expect(g.tokensOut).toBe(300);
    expect(g.tokensCached).toBe(200);
    expect(g.raw).toBe(rawGemini);
    const rawGeneric = { prompt_tokens: 100, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 10 } };
    const n = normalizeProviderUsage('generic', rawGeneric);
    expect(n.tokensIn).toBe(100);
    expect(n.tokensOut).toBe(40);
    expect(n.tokensCached).toBe(10);
    expect(n.raw).toBe(rawGeneric);
    const unknown = normalizeProviderUsage('provider-x', rawGeneric);
    expect(unknown.tokensIn).toBe(null); // tanpa adapter eksplisit: tidak menebak
    expect(normalizeProviderUsage('gemini', null).tokensIn).toBe(null);
  });
});

describe('usageStore + usageMeter', () => {
  it('34. meter MENYIMPAN ke store (tidak dibuang); bisa di-query; duplikat tidak menggandakan', async () => {
    const store = createMemoryUsageStore();
    const meter = createUsageMeter(store);
    const rec = {
      jobId: 'job_p5', requestId: 'req_p5', idempotencyKey: 'um_p5',
      userId: 'u1', feature: 'chat-ai/fast',
      provider: 'gemini', model: 'gemini-3.5-flash-lite',
      usage: { inputTokens: 100, outputTokens: 50 },
      attempts: 1, durationMs: 500, status: 'actual',
    };
    const r1 = await meter.record(rec);
    const r2 = await meter.record(rec);
    expect(r1.ok).toBe(true);
    expect(r2.duplicate).toBe(true);
    expect(store.listByUser('u1').length).toBe(1);
    expect(store.getByIdempotencyKey('um_p5')?.job_id).toBe('job_p5');
    expect(store.getByIdempotencyKey('tidak-ada')).toBe(null);
    const viaMeter = await meter.getUsage('u1');
    expect(viaMeter.length).toBe(1);
  });
});

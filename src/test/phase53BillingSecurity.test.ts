/**
 * Test: Phase 5.3 — Billing Foundation Hardening & Authentication Security.
 * Dijalankan via esbuild + vitest shim (pola sama seperti creditLedger.test.ts).
 *
 * Mencakup:
 * - Workstream A: FREE_ONCE 100 kredit, satu kali per workspace, expires_at
 *   NULL, tidak pernah kedaluwarsa (termasuk oleh sweep), koreksi teraudit
 *   untuk batch historis 90 hari, urutan alokasi final Phase 5.1.
 * - Workstream B: batas otorisasi workspace server-side
 *   (billingAuthorization.js) + evaluateCreditAccess fail-closed.
 * - Workstream D: review manual REQUIRES_REVIEW — hanya Owner workspace /
 *   billing admin bergrant eksplisit; APPROVED settle aktual terverifikasi;
 *   REJECTED melepas reservasi; PENDING mempertahankan reservasi & bukti.
 * Semua waktu memakai epoch tetap agar deterministik.
 */
import { describe, it, expect } from 'vitest';
import {
  createCreditLedger,
  createMemoryLedgerStore,
  FREE_ONCE_AMOUNT,
} from '../../api/_lib/creditLedger.js';
import { resolveAllocationOrder } from '../../api/_lib/creditAllocation.js';
import { TARIFF_REGISTRY_VERSION } from '../../api/_lib/tariffRegistry.js';
import {
  authorizeWorkspaceAccess,
  canResolveBillingReview,
  normalizeMembership,
  requestedWorkspaceId,
} from '../../api/_lib/billingAuthorization.js';
import { evaluateCreditAccess } from '../../api/_lib/security.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_800_000_000_000;
const P_START = T0;
const P_END = T0 + 30 * DAY;
const USAGE = { tokensIn: 5000, tokensOut: 1000, tokensCached: 0, source: 'test' };

function assertInvariant(ledger: ReturnType<typeof createCreditLedger>, accountId: string) {
  for (const b of ledger.listBatches(accountId)) {
    expect(b.grantedAmount).toBe(
      b.remainingAmount + b.reservedAmount + b.consumedAmount + b.expiredAmount,
    );
    expect(b.remainingAmount >= 0).toBe(true);
    expect(b.reservedAmount >= 0).toBe(true);
    expect(b.consumedAmount >= 0).toBe(true);
    expect(b.expiredAmount >= 0).toBe(true);
  }
}

const ownerReviewer = normalizeMembership({ workspace_id: 'ws-1', user_id: 'owner-1', role: 'SUPER_ADMIN' });
const estimatorReviewer = normalizeMembership({ workspace_id: 'ws-1', user_id: 'est-1', role: 'ESTIMATOR' });
const clientReviewer = normalizeMembership({ workspace_id: 'ws-1', user_id: 'cli-1', role: 'CLIENT' });
const billingAdminReviewer = normalizeMembership({ workspace_id: 'ws-1', user_id: 'dir-1', role: 'DIREKSI', billing_admin: true });

describe('phase53 A — FREE_ONCE', () => {
  it('A1. tepat 100 kredit, expiresAt NULL, satu kali — retry & instance bergantian tidak menggandakan', () => {
    const store = createMemoryLedgerStore();
    const ledger1 = createCreditLedger(store);
    const ledger2 = createCreditLedger(store);
    const r1 = ledger1.grantFreeOnce({ accountId: 'ws-1', now: T0 });
    expect(r1.ok).toBe(true);
    expect(r1.batch.grantedAmount).toBe(100);
    expect(FREE_ONCE_AMOUNT).toBe(100);
    expect(r1.batch.expiresAt).toBe(null);
    // Simulasi request berulang / retry / inisialisasi ulang dari dua instance.
    for (let i = 0; i < 3; i++) {
      expect(ledger1.grantFreeOnce({ accountId: 'ws-1', now: T0 + i * DAY }).duplicate).toBe(true);
      expect(ledger2.grantFreeOnce({ accountId: 'ws-1', now: T0 + i * DAY }).duplicate).toBe(true);
    }
    expect(ledger1.listBatches('ws-1').length).toBe(1);
    expect(ledger1.listLedger('ws-1').filter((e) => e.kind === 'GRANT').length).toBe(1);
    assertInvariant(ledger1, 'ws-1');
  });

  it('A2. isolasi workspace: tiap workspace dapat grant-nya sendiri; workspace lain tidak bisa menyentuh operasi', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    expect(ledger.grantFreeOnce({ accountId: 'ws-A', now: T0 }).ok).toBe(true);
    expect(ledger.grantFreeOnce({ accountId: 'ws-B', now: T0 }).ok).toBe(true);
    expect(ledger.getBalance('ws-A', T0).freeOnceAvailable).toBe(100);
    expect(ledger.getBalance('ws-B', T0).freeOnceAvailable).toBe(100);
    const op = ledger.createOperation({ accountId: 'ws-A', feature: 'chat', estimatedCredits: 50, idempotencyKey: 'a-op', now: T0 }).operation;
    expect(ledger.reserve(op.id, { accountId: 'ws-B', idempotencyKey: 'b-rsv', now: T0 }).error).toBe('FORBIDDEN');
    expect(ledger.getBalance('ws-A', T0).total).toBe(100);
    assertInvariant(ledger, 'ws-A');
    assertInvariant(ledger, 'ws-B');
  });

  it('A3. sweep kedaluwarsa TIDAK PERNAH menyentuh FREE_ONCE (bahkan 10 tahun & bahkan batch historis finite)', () => {
    const store = createMemoryLedgerStore();
    const ledger = createCreditLedger(store);
    ledger.grantFreeOnce({ accountId: 'ws-1', now: T0 });
    ledger.grantBonus({ accountId: 'ws-1', amount: 50, campaignRef: 'c', expiresAt: T0 + 7 * DAY, grantedBy: 'admin', idempotencyKey: 'b1', now: T0 });
    // Batch FREE_ONCE historis (pra-5.3) yang masih membawa expiresAt finite:
    const legacy = ledger.grantFreeOnce({ accountId: 'ws-legacy', now: T0 }).batch;
    (store.batches.get(legacy.id) as { expiresAt: number }).expiresAt = T0 + 90 * DAY;

    const sweep = ledger.applyExpirations({ now: T0 + 3650 * DAY });
    expect(sweep.ok).toBe(true);
    // bonus (50) hangus; kedua FREE_ONCE utuh — sweep melewati tipe ini eksplisit.
    expect(sweep.totalExpired).toBe(50);
    expect(ledger.getBalance('ws-1', T0 + 3650 * DAY).freeOnceAvailable).toBe(100);
    const legacyAfter = ledger.listBatches('ws-legacy')[0];
    expect(legacyAfter.remainingAmount).toBe(100);
    expect(legacyAfter.expiredAmount).toBe(0);
    expect(ledger.listLedger('ws-legacy').filter((e) => e.kind === 'EXPIRATION').length).toBe(0);
    assertInvariant(ledger, 'ws-1');
    assertInvariant(ledger, 'ws-legacy');
  });

  it('A4. koreksi batch historis SEBELUM sweep: expiresAt → null via event REVERSAL, GRANT asli utuh, idempotent', () => {
    const store = createMemoryLedgerStore();
    const ledger = createCreditLedger(store);
    const batch = ledger.grantFreeOnce({ accountId: 'ws-old', now: T0 }).batch;
    (store.batches.get(batch.id) as { expiresAt: number }).expiresAt = T0 + 90 * DAY;

    const c1 = ledger.recordFreeOncePolicyCorrection({
      accountId: 'ws-old', batchId: batch.id, actor: 'owner-1',
      reason: 'Phase 5.1 C3: FREE_ONCE tidak pernah kedaluwarsa', now: T0 + DAY,
    });
    expect(c1.ok).toBe(true);
    expect(c1.previousExpiresAt).toBe(T0 + 90 * DAY);
    expect(c1.restoredAmount).toBe(0);
    expect(c1.batch.expiresAt).toBe(null);
    expect(c1.batch.policyCorrection.actor).toBe('owner-1');
    // Sejarah tidak ditulis ulang: entri GRANT asli tetap satu-satunya GRANT.
    const entries = ledger.listLedger('ws-old');
    expect(entries.filter((e) => e.kind === 'GRANT').length).toBe(1);
    expect(entries.some((e) => e.kind === 'REVERSAL' && e.amount === 0)).toBe(true);
    // Putar ulang → tercatat sebagai duplikat, tanpa entri kedua.
    const c2 = ledger.recordFreeOncePolicyCorrection({
      accountId: 'ws-old', batchId: batch.id, actor: 'owner-1',
      reason: 'Phase 5.1 C3: FREE_ONCE tidak pernah kedaluwarsa', now: T0 + 2 * DAY,
    });
    expect(c2.duplicate).toBe(true);
    expect(ledger.listLedger('ws-old').filter((e) => e.kind === 'REVERSAL').length).toBe(1);
    // Setelah koreksi, sweep jauh di masa depan tidak menghanguskan apa pun.
    ledger.applyExpirations({ accountId: 'ws-old', now: T0 + 3650 * DAY });
    expect(ledger.getBalance('ws-old', T0 + 3650 * DAY).freeOnceAvailable).toBe(100);
    assertInvariant(ledger, 'ws-old');
  });

  it('A5. koreksi SETELAH sweep lama berjalan: sisa yang terlanjur expired dikembalikan, saldo efektif pulih', () => {
    const store = createMemoryLedgerStore();
    const ledger = createCreditLedger(store);
    const batch = ledger.grantFreeOnce({ accountId: 'ws-old2', now: T0 }).batch;
    // Simulasikan keadaan yang ditinggalkan sweep era Phase 5 (90 hari):
    // sisa sudah dipindah ke expiredAmount dan status EXPIRED.
    const raw = store.batches.get(batch.id) as {
      expiresAt: number; remainingAmount: number; expiredAmount: number; status: string;
    };
    raw.expiresAt = T0 + 90 * DAY;
    raw.expiredAmount = raw.remainingAmount;
    raw.remainingAmount = 0;
    raw.status = 'EXPIRED';
    expect(ledger.getBalance('ws-old2', T0 + 100 * DAY).freeOnceAvailable).toBe(0);

    const c = ledger.recordFreeOncePolicyCorrection({
      accountId: 'ws-old2', batchId: batch.id, actor: 'owner-1',
      reason: 'Rekonsiliasi Phase 5.3 atas batch 90 hari', now: T0 + 100 * DAY,
    });
    expect(c.ok).toBe(true);
    expect(c.restoredAmount).toBe(100);
    expect(c.batch.expiresAt).toBe(null);
    expect(c.batch.remainingAmount).toBe(100);
    expect(c.batch.expiredAmount).toBe(0);
    expect(c.batch.status).toBe('ACTIVE');
    expect(ledger.getBalance('ws-old2', T0 + 100 * DAY).freeOnceAvailable).toBe(100);
    expect(ledger.listLedger('ws-old2').some((e) => e.kind === 'REVERSAL' && e.amount === 100)).toBe(true);
    assertInvariant(ledger, 'ws-old2');
  });

  it('A6. koreksi ditolak untuk batch non-FREE_ONCE / akun lain / tanpa alasan', () => {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    const top = ledger.grantTopUp({ accountId: 'ws-1', amount: 500, paymentRef: 'p', idempotencyKey: 't1', now: T0 }).batch;
    expect(ledger.recordFreeOncePolicyCorrection({ accountId: 'ws-1', batchId: top.id, actor: 'o', reason: 'x', now: T0 }).error).toBe('NOT_FREE_ONCE');
    const free = ledger.grantFreeOnce({ accountId: 'ws-1', now: T0 }).batch;
    expect(ledger.recordFreeOncePolicyCorrection({ accountId: 'ws-lain', batchId: free.id, actor: 'o', reason: 'x', now: T0 }).error).toBe('FORBIDDEN');
    expect(ledger.recordFreeOncePolicyCorrection({ accountId: 'ws-1', batchId: free.id, actor: 'o', reason: '  ', now: T0 }).error).toBe('REASON_REQUIRED');
    // Batch baru memang sudah non-expiring: koreksi = no-op yang jujur.
    const noop = ledger.recordFreeOncePolicyCorrection({ accountId: 'ws-1', batchId: free.id, actor: 'o', reason: 'cek', now: T0 });
    expect(noop.ok).toBe(true);
    expect(noop.alreadyNonExpiring).toBe(true);
  });

  it('A7. urutan alokasi final: subscription → bonus finite → FREE_ONCE non-expiring → top-up; seri FIFO lalu id', () => {
    const mk = (partial: Record<string, unknown>) => ({
      id: 'b?', type: 'SUBSCRIPTION', remainingAmount: 100, reservedAmount: 0,
      expiresAt: null, grantedAt: T0, status: 'ACTIVE', ...partial,
    });
    const order = resolveAllocationOrder([
      mk({ id: 'b-top', type: 'TOP_UP', grantedAt: T0 - 9 * DAY }),
      mk({ id: 'b-free', type: 'FREE_ONCE', expiresAt: null, grantedAt: T0 - 8 * DAY }),
      mk({ id: 'b-bonus-null', type: 'BONUS', expiresAt: null, grantedAt: T0 - 7 * DAY }),
      mk({ id: 'b-bonus-fin', type: 'BONUS', expiresAt: T0 + 10 * DAY, grantedAt: T0 - 6 * DAY }),
      mk({ id: 'b-sub', type: 'SUBSCRIPTION', expiresAt: T0 + 60 * DAY, grantedAt: T0 }),
    ], T0).map((b) => b.id);
    // Dalam grup BONUS/FREE_ONCE: finite dulu; di antara non-expiring, FIFO grantedAt.
    expect(order).toEqual(['b-sub', 'b-bonus-fin', 'b-free', 'b-bonus-null', 'b-top']);
    // Seri penuh (grup + expiry + grantedAt sama) → id menentukan, deterministik.
    const tie = resolveAllocationOrder([
      mk({ id: 'z9', type: 'BONUS', expiresAt: T0 + DAY, grantedAt: T0 }),
      mk({ id: 'a1', type: 'BONUS', expiresAt: T0 + DAY, grantedAt: T0 }),
    ], T0).map((b) => b.id);
    expect(tie).toEqual(['a1', 'z9']);
  });
});

describe('phase53 B — otorisasi workspace & akses kredit', () => {
  const jwtUser = { ok: true, method: 'jwt', user: { id: 'user-1', email: 'u@example.invalid', isAnonymous: false } };
  const member = (over: Record<string, unknown> = {}) => ({
    workspace_id: 'ws-1', user_id: 'user-1', role: 'ESTIMATOR', ...over,
  });

  it('B1. tanpa autentikasi / auth gagal → 401; degraded & service-token (tanpa identitas) → 401', () => {
    expect(authorizeWorkspaceAccess({ auth: null, membership: member(), workspaceId: 'ws-1', permission: 'billing:read' }).status).toBe(401);
    expect(authorizeWorkspaceAccess({ auth: { ok: false }, membership: member(), workspaceId: 'ws-1', permission: 'billing:read' }).status).toBe(401);
    const degraded = authorizeWorkspaceAccess({ auth: { ok: true, method: 'none', user: null, degraded: true }, membership: member(), workspaceId: 'ws-1', permission: 'billing:read' });
    expect(degraded.allow).toBe(false);
    expect(degraded.errorCode).toBe('AUTH_REQUIRED');
    expect(authorizeWorkspaceAccess({ auth: { ok: true, method: 'token', user: null }, membership: member(), workspaceId: 'ws-1', permission: 'billing:read' }).allow).toBe(false);
    // evaluateCreditAccess (endpoint kredit) — kontrak yang sama:
    expect(evaluateCreditAccess({ ok: true, method: 'none', user: null, degraded: true }).allow).toBe(false);
    expect(evaluateCreditAccess({ ok: true, method: 'token', user: null }).status).toBe(401);
    expect(evaluateCreditAccess({ ok: true, user: { id: 'user-1', isAnonymous: false } }).allow).toBe(true);
    expect(evaluateCreditAccess({ ok: true, user: { id: 'demo-1', isAnonymous: true } }).status).toBe(403);
  });

  it('B2. user demo/anonim → 403 DEMO_RESTRICTED walau membawa record keanggotaan', () => {
    const r = authorizeWorkspaceAccess({
      auth: { ok: true, method: 'jwt', user: { id: 'user-1', isAnonymous: true } },
      membership: member(), workspaceId: 'ws-1', permission: 'billing:read',
    });
    expect(r.allow).toBe(false);
    expect(r.errorCode).toBe('DEMO_RESTRICTED');
  });

  it('B3. bukan anggota / record milik user lain / workspace dimodifikasi → ditolak (anti-IDOR)', () => {
    expect(authorizeWorkspaceAccess({ auth: jwtUser, membership: null, workspaceId: 'ws-1', permission: 'billing:read' }).errorCode).toBe('NOT_A_MEMBER');
    expect(authorizeWorkspaceAccess({ auth: jwtUser, membership: member({ user_id: 'user-lain' }), workspaceId: 'ws-1', permission: 'billing:read' }).errorCode).toBe('NOT_A_MEMBER');
    // Penyerang mengganti workspaceId di request ke workspace korban; record
    // keanggotaannya sendiri (ws-1) tidak membuktikan apa-apa untuk ws-2.
    const idor = authorizeWorkspaceAccess({ auth: jwtUser, membership: member(), workspaceId: 'ws-2', permission: 'billing:read' });
    expect(idor.allow).toBe(false);
    expect(idor.errorCode).toBe('WORKSPACE_MISMATCH');
    // Tanpa target workspace → 400.
    expect(authorizeWorkspaceAccess({ auth: jwtUser, membership: member(), workspaceId: '', permission: 'billing:read' }).status).toBe(400);
  });

  it('B4. keanggotaan suspended/revoked → 403 MEMBERSHIP_INACTIVE untuk semua permission', () => {
    for (const status of ['SUSPENDED', 'REVOKED']) {
      const r = authorizeWorkspaceAccess({ auth: jwtUser, membership: member({ status }), workspaceId: 'ws-1', permission: 'billing:read' });
      expect(r.allow).toBe(false);
      expect(r.errorCode).toBe('MEMBERSHIP_INACTIVE');
    }
    expect(canResolveBillingReview(normalizeMembership({ workspace_id: 'ws-1', user_id: 'o', role: 'SUPER_ADMIN', status: 'REVOKED' }))).toBe(false);
  });

  it('B5. matriks permission: CLIENT tidak pernah; member internal baca/pakai; resolve hanya owner / billing admin', () => {
    const as = (m: Record<string, unknown>, p: string) =>
      authorizeWorkspaceAccess({ auth: jwtUser, membership: member(m), workspaceId: 'ws-1', permission: p });
    expect(as({ role: 'CLIENT' }, 'billing:read').errorCode).toBe('PERMISSION_DENIED');
    expect(as({ role: 'CLIENT' }, 'billing:use').allow).toBe(false);
    expect(as({ role: 'ESTIMATOR' }, 'billing:read').allow).toBe(true);
    expect(as({ role: 'ESTIMATOR' }, 'billing:use').allow).toBe(true);
    expect(as({ role: 'ESTIMATOR' }, 'billing:review:resolve').allow).toBe(false);
    expect(as({ role: 'DIREKSI' }, 'billing:review:resolve').allow).toBe(false);
    expect(as({ role: 'DIREKSI', billing_admin: true }, 'billing:review:resolve').allow).toBe(true);
    const owner = as({ role: 'SUPER_ADMIN' }, 'billing:review:resolve');
    expect(owner.allow).toBe(true);
    // Principal hasil otorisasi membawa identitas server-side, bukan klaim client.
    expect((owner as { principal: { userId: string } }).principal.userId).toBe('user-1');
    // CLIENT + flag billingAdmin yang salah pasang tetap ditolak eksplisit.
    expect(canResolveBillingReview(normalizeMembership({ workspace_id: 'ws-1', user_id: 'c', role: 'CLIENT', billing_admin: true }))).toBe(false);
    expect(canResolveBillingReview(ownerReviewer)).toBe(true);
    expect(canResolveBillingReview(billingAdminReviewer)).toBe(true);
    expect(canResolveBillingReview(estimatorReviewer)).toBe(false);
    expect(canResolveBillingReview(clientReviewer)).toBe(false);
    expect(canResolveBillingReview(null)).toBe(false);
  });

  it('B6. requestedWorkspaceId mengambil target (header > body > query) sebagai nilai TIDAK terpercaya', () => {
    expect(requestedWorkspaceId({ headers: { 'x-workspace-id': 'ws-h' }, body: { workspaceId: 'ws-b' }, query: {} })).toBe('ws-h');
    expect(requestedWorkspaceId({ headers: {}, body: { workspaceId: 'ws-b' }, query: {} })).toBe('ws-b');
    expect(requestedWorkspaceId({ headers: {}, body: {}, query: { workspaceId: 'ws-q' } })).toBe('ws-q');
    expect(requestedWorkspaceId({ headers: {}, body: {}, query: {} })).toBe(null);
  });
});

describe('phase53 D — review manual REQUIRES_REVIEW', () => {
  function reviewScenario(fundAmount = 10000) {
    const ledger = createCreditLedger(createMemoryLedgerStore());
    ledger.grantSubscription({
      accountId: 'ws-1', amount: fundAmount, periodStart: P_START, periodEnd: P_END,
      idempotencyKey: 'seed', actor: 'system', now: T0,
    });
    const op = ledger.createOperation({
      accountId: 'ws-1', feature: 'ded-ai', estimatedCredits: 800,
      idempotencyKey: 'op-r', actor: 'est-1', now: T0,
    }).operation;
    ledger.reserve(op.id, { accountId: 'ws-1', idempotencyKey: 'rsv-r', now: T0 });
    const st = ledger.settle(op.id, {
      accountId: 'ws-1', actualCredits: 1000, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: USAGE, idempotencyKey: 'stl-r', now: T0,
    });
    return { ledger, op, st };
  }

  it('D1. overage membuka review PENDING dengan bukti lengkap; reservasi & bukti dipertahankan', () => {
    const { ledger, op, st } = reviewScenario();
    expect(st.status).toBe('REQUIRES_REVIEW');
    const rv = ledger.getReview(op.id, { accountId: 'ws-1' });
    expect(rv.ok).toBe(true);
    expect(rv.review.status).toBe('PENDING');
    expect(rv.review.reservedCredits).toBe(800);
    expect(rv.review.actualCredits).toBe(1000);
    expect(rv.review.overageCredits).toBe(200);
    expect(rv.review.tariffVersion).toBe(TARIFF_REGISTRY_VERSION);
    expect(rv.review.usageEvidence).toEqual(USAGE);
    expect(rv.review.requestedBy).toBe('est-1');
    // PENDING: tidak ada settlement, tidak ada release, tidak ada debit parsial.
    const bal = ledger.getBalance('ws-1', T0);
    expect(bal.subscriptionAvailable).toBe(9200);
    expect(bal.reserved).toBe(800);
    expect(ledger.listLedger('ws-1').filter((e) => e.kind === 'CONSUME').length).toBe(0);
    // Review workspace lain tidak terlihat.
    expect(ledger.getReview(op.id, { accountId: 'ws-2' }).error).toBe('FORBIDDEN');
    expect(ledger.listReviews('ws-1', 'PENDING').length).toBe(1);
    expect(ledger.listReviews('ws-2').length).toBe(0);
    assertInvariant(ledger, 'ws-1');
  });

  it('D2. resolusi oleh pihak TIDAK berwenang (member biasa, client, tanpa reviewer) → FORBIDDEN_REVIEW, state utuh', () => {
    const { ledger, op } = reviewScenario();
    for (const reviewer of [estimatorReviewer, clientReviewer, null, undefined]) {
      const r = ledger.resolveReview(op.id, {
        accountId: 'ws-1', reviewer, decision: 'APPROVED', reason: 'coba',
        idempotencyKey: `att-${String(reviewer && (reviewer as { userId: string }).userId)}`, now: T0,
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('FORBIDDEN_REVIEW');
    }
    expect(ledger.getReview(op.id, { accountId: 'ws-1' }).review.status).toBe('PENDING');
    expect(ledger.getBalance('ws-1', T0).reserved).toBe(800);
    // settle langsung pada operasi REQUIRES_REVIEW juga tertutup.
    const st = ledger.settle(op.id, {
      accountId: 'ws-1', actualCredits: 1000, tariffVersion: TARIFF_REGISTRY_VERSION,
      usageEvidence: USAGE, idempotencyKey: 'stl-lagi', now: T0,
    });
    expect(st.ok).toBe(false);
    expect(st.error).toBe('REQUIRES_REVIEW');
  });

  it('D3. APPROVED oleh owner: settle tepat aktual (800 alokasi + 200 kelebihan), invarian terjaga, teraudit', () => {
    const { ledger, op } = reviewScenario();
    const r = ledger.resolveReview(op.id, {
      accountId: 'ws-1', reviewer: ownerReviewer, decision: 'APPROVED',
      reason: 'Bukti provider terverifikasi', idempotencyKey: 'res-1', now: T0 + 1000,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('APPROVED');
    expect(r.operation.status).toBe('SETTLED');
    expect(r.operation.settledCredits).toBe(1000);
    expect(r.review.reviewerId).toBe('owner-1');
    expect(r.review.reviewerRole).toBe('SUPER_ADMIN');
    expect(r.review.resolutionReason).toBe('Bukti provider terverifikasi');
    const bal = ledger.getBalance('ws-1', T0);
    expect(bal.subscriptionAvailable).toBe(9000); // 10000 - 1000 aktual, bukan 9200
    expect(bal.reserved).toBe(0);
    const kinds = ledger.listLedger('ws-1').map((e) => e.kind);
    expect(kinds.filter((k) => k === 'CONSUME').length).toBe(2); // alokasi + kelebihan
    expect(kinds).toContain('REVIEW_DECISION');
    assertInvariant(ledger, 'ws-1');
  });

  it('D4. resolusi ganda: kunci sama → duplikat tercatat; kunci berbeda → ALREADY_RESOLVED tanpa efek', () => {
    const { ledger, op } = reviewScenario();
    const args = {
      accountId: 'ws-1', reviewer: ownerReviewer, decision: 'APPROVED',
      reason: 'ok', idempotencyKey: 'res-dup', now: T0,
    };
    expect(ledger.resolveReview(op.id, args).ok).toBe(true);
    const replay = ledger.resolveReview(op.id, args);
    expect(replay.duplicate).toBe(true);
    const second = ledger.resolveReview(op.id, { ...args, idempotencyKey: 'res-lain', decision: 'REJECTED' });
    expect(second.ok).toBe(false);
    expect(second.error).toBe('ALREADY_RESOLVED');
    expect(ledger.getBalance('ws-1', T0).subscriptionAvailable).toBe(9000);
    expect(ledger.listLedger('ws-1').filter((e) => e.kind === 'REVIEW_DECISION').length).toBe(1);
    assertInvariant(ledger, 'ws-1');
  });

  it('D5. REJECTED oleh billing admin: kelebihan tidak didebit, reservasi dilepas penuh, bukti & alasan tersimpan', () => {
    const { ledger, op } = reviewScenario();
    const r = ledger.resolveReview(op.id, {
      accountId: 'ws-1', reviewer: billingAdminReviewer, decision: 'REJECTED',
      reason: 'Bukti usage tidak dapat diverifikasi', idempotencyKey: 'res-rej', now: T0,
    });
    expect(r.ok).toBe(true);
    expect(r.operation.status).toBe('RELEASED');
    expect(r.operation.settledCredits).toBe(null);
    const bal = ledger.getBalance('ws-1', T0);
    expect(bal.subscriptionAvailable).toBe(10000);
    expect(bal.reserved).toBe(0);
    expect(ledger.listLedger('ws-1').filter((e) => e.kind === 'CONSUME').length).toBe(0);
    const rv = ledger.getReview(op.id, { accountId: 'ws-1' }).review;
    expect(rv.status).toBe('REJECTED');
    expect(rv.resolutionReason).toBe('Bukti usage tidak dapat diverifikasi');
    expect(rv.usageEvidence).toEqual(USAGE); // bukti tetap dipertahankan setelah penolakan
    assertInvariant(ledger, 'ws-1');
  });

  it('D6. APPROVED tanpa saldo cukup untuk kelebihan → INSUFFICIENT_BALANCE, review tetap PENDING; setelah top-up cukup → berhasil', () => {
    const { ledger, op } = reviewScenario(800); // saldo persis sebesar reservasi
    const r1 = ledger.resolveReview(op.id, {
      accountId: 'ws-1', reviewer: ownerReviewer, decision: 'APPROVED',
      reason: 'setujui', idempotencyKey: 'res-ins', now: T0,
    });
    expect(r1.ok).toBe(false);
    expect(r1.error).toBe('INSUFFICIENT_BALANCE');
    expect(ledger.getReview(op.id, { accountId: 'ws-1' }).review.status).toBe('PENDING');
    expect(ledger.getBalance('ws-1', T0).reserved).toBe(800);
    ledger.grantTopUp({ accountId: 'ws-1', amount: 500, paymentRef: 'pay-late', idempotencyKey: 'top-late', now: T0 });
    const r2 = ledger.resolveReview(op.id, {
      accountId: 'ws-1', reviewer: ownerReviewer, decision: 'APPROVED',
      reason: 'setujui — saldo sudah cukup', idempotencyKey: 'res-ins-2', now: T0,
    });
    expect(r2.ok).toBe(true);
    expect(ledger.getBalance('ws-1', T0).total).toBe(300); // 800+500-1000
    assertInvariant(ledger, 'ws-1');
  });

  it('D7. keputusan tidak valid / tanpa alasan → ditolak tanpa perubahan state', () => {
    const { ledger, op } = reviewScenario();
    expect(ledger.resolveReview(op.id, {
      accountId: 'ws-1', reviewer: ownerReviewer, decision: 'MUNGKIN',
      reason: 'x', idempotencyKey: 'res-bad-1', now: T0,
    }).error).toBe('INVALID_DECISION');
    expect(ledger.resolveReview(op.id, {
      accountId: 'ws-1', reviewer: ownerReviewer, decision: 'APPROVED',
      reason: ' ', idempotencyKey: 'res-bad-2', now: T0,
    }).error).toBe('REASON_REQUIRED');
    expect(ledger.getReview(op.id, { accountId: 'ws-1' }).review.status).toBe('PENDING');
    expect(ledger.getBalance('ws-1', T0).reserved).toBe(800);
    assertInvariant(ledger, 'ws-1');
  });
});

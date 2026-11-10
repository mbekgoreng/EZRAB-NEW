/**
 * api/_lib/billingAccountService.js — Wiring akun billing workspace ke
 * ledger batch gen-2 (langkah aktivasi D18(ii) + D18(iii), 2026-11-10).
 * ======================================================================
 * Lapisan bersama antara handler HTTP (api/credits/*) dan billingService:
 *
 * - resolveWorkspaceAccess: resolusi workspace → keanggotaan → keputusan
 *   authorizeWorkspaceAccess (pola yang sama seperti billingService —
 *   principal terautentikasi TIDAK PERNAH diganti identitas karangan).
 * - getOrCreateBillingAccount: provisioning akun billing workspace
 *   (satu workspace = tepat satu akun; pola getOrCreate yang sudah ada).
 * - ensureFreeOnceGrant: penerbitan Free 100 kredit SEKALI per akun
 *   (Amendemen v1.2) lewat domain creditLedger.grantFreeOnce di atas
 *   withLedger. Idempotensi dijamin domain (kunci `free-once:<accountId>`)
 *   + UNIQUE INDEX parsial FREE_ONCE di DB — pemanggilan berulang TIDAK
 *   menerbitkan dua kali.
 * - readBatchBalance: saldo diturunkan HANYA dari batch ledger
 *   (creditLedger.getBalance di atas snapshot repository) — menggantikan
 *   engine gen-1/memori untuk endpoint balance.
 * - readUsageHistory: riwayat operasi usage ledger untuk endpoint usage,
 *   dipetakan ke bentuk yang dirender UI (CreditPage). Biaya provider
 *   tidak disimpan ledger → cost_status jujur 'UNDETERMINED'.
 *
 * Fail-closed: modul ini tidak punya fallback memori/simulasi. Pemanggil
 * wajib memeriksa repository null (env Supabase service belum ter-set)
 * dan menjawab 503 sebelum menyentuh fungsi-fungsi di sini.
 */

import { authorizeWorkspaceAccess } from './billingAuthorization.js';
import { loadLedgerSnapshot, withLedger } from './billingStore.js';
import { createCreditLedger } from './creditLedger.js';

function fail(status, errorCode) {
  return { ok: false, status, error: errorCode, errorCode };
}

/**
 * Resolusi + otorisasi akses billing workspace untuk principal.
 * workspaceId eksplisit → verifikasi keanggotaan baris itu; tanpa
 * workspaceId → tepat satu keanggotaan aktif, selain itu ditolak.
 * Mengembalikan { ok:true, workspaceId, principal } atau fail().
 */
export async function resolveWorkspaceAccess(repo, auth, workspaceId, permission) {
  const userId = auth?.user?.id;
  if (!userId) return fail(401, 'AUTH_REQUIRED');
  let resolvedId = workspaceId || null;
  let membership = null;
  if (resolvedId) {
    membership = await repo.getMembership(resolvedId, userId);
  } else {
    const memberships = await repo.listMembershipsForUser(userId);
    const active = (memberships || []).filter(
      (m) => String(m.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
    );
    if (active.length === 0) return fail(403, 'NOT_A_MEMBER');
    if (active.length > 1) return fail(400, 'WORKSPACE_AMBIGUOUS');
    resolvedId = active[0].workspace_id;
    membership = active[0];
  }
  const access = authorizeWorkspaceAccess({
    auth,
    membership,
    workspaceId: resolvedId,
    permission,
  });
  if (!access.allow) return fail(access.status, access.errorCode);
  return { ok: true, workspaceId: resolvedId, principal: access.principal };
}

/** Provisioning akun billing workspace (get-or-create, idempoten per workspace). */
export async function getOrCreateBillingAccount(repo, workspaceId, userId) {
  const existing = await repo.getBillingAccountByWorkspace(workspaceId);
  if (existing) return existing;
  return repo.createBillingAccount({ workspaceId, createdBy: userId });
}

/**
 * Terbitkan Free-once 100 kredit bila akun belum pernah menerimanya.
 * Mengembalikan { granted: boolean, balance } — granted=true HANYA pada
 * penerbitan pertama; pemanggilan berikutnya adalah replay idempoten
 * (batch yang sama, tanpa entri baru).
 */
export async function ensureFreeOnceGrant(repo, account, { actorUserId, workspaceId, now } = {}) {
  const at = now == null ? Date.now() : now;
  const ctx = { ownerUserId: actorUserId ?? null, workspaceId: workspaceId ?? null };
  return withLedger(repo, account.id, ctx, (ledger) => {
    const existed = ledger
      .listBatches(account.id)
      .some((b) => b.type === 'FREE_ONCE');
    const result = ledger.grantFreeOnce({
      accountId: account.id,
      actor: actorUserId || 'system',
      now: at,
    });
    if (!result.ok) return { ok: false, error: result.error || 'FREE_ONCE_GRANT_FAILED' };
    return {
      ok: true,
      granted: !existed,
      batchId: result.batch?.id ?? null,
      balance: ledger.getBalance(account.id, at),
    };
  });
}

/** Saldo batch ledger (read-only; tanpa flush, tanpa penulisan). */
export async function readBatchBalance(repo, accountId, now) {
  const at = now == null ? Date.now() : now;
  const snapshot = await loadLedgerSnapshot(repo, accountId, {});
  const ledger = createCreditLedger(snapshot.store);
  return ledger.getBalance(accountId, at);
}

/**
 * Riwayat pemakaian dari operasi ledger (terbaru dulu), dipetakan ke
 * bentuk UI: { id, feature, model, tokens_in, tokens_out,
 * credits_charged, status, cost_status }.
 * status: SETTLED → 'actual'; RELEASED → 'failed'; selain itu 'pending'
 * (UI melabelinya "Menunggu rekonsiliasi").
 */
export async function readUsageHistory(repo, accountId, limit = 20) {
  const snapshot = await loadLedgerSnapshot(repo, accountId, {});
  const ops = [...snapshot.store.operations.values()]
    .filter((o) => o.accountId === accountId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, Math.max(1, Math.min(100, limit || 20)));
  return ops.map((o) => {
    const ev = o.usageEvidence || null;
    return {
      id: o.id,
      feature: o.feature || null,
      model: ev?.model ?? null,
      tokens_in: ev?.inputTokens ?? null,
      tokens_out: ev?.outputTokens ?? null,
      credits_charged: o.settledCredits ?? o.actualCredits ?? null,
      status:
        o.status === 'SETTLED' ? 'actual' : o.status === 'RELEASED' ? 'failed' : 'pending',
      cost_status: 'UNDETERMINED',
      created_at: o.createdAt ?? null,
    };
  });
}

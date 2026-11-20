/**
 * api/_lib/accountContextResolver.js — Account Context Resolver
 * (EZRAB Full Account Intelligence, FASE B — cakupan server-backed
 * yang dikurangi, 2026-11-20).
 * ======================================================================
 * SATU-SATUNYA perakit konteks akun server-side untuk Chat AI. Merakit
 * konteks dari domain yang BENAR-BENAR punya data server-side:
 *   identity · workspace · subscription · credits · usage · orders ·
 *   invitations.
 *
 * IDENTITAS — HANYA dari parameter `identity` yang diisi handler dari
 * JWT terverifikasi (authenticateRequest). Resolver TIDAK PERNAH membaca
 * body/query/header untuk identitas, TIDAK PERNAH menerima userId dari
 * LLM, dan TIDAK PERNAH mengarang identitas. Tanpa identity.userId →
 * throw (fail-closed). workspaceId yang diteruskan diperlakukan sebagai
 * TARGET tak terpercaya (pola yang sama seperti balance/usage): akses
 * diputuskan resolveWorkspaceAccess dari record keanggotaan server-side.
 *
 * REUSE, BUKAN SUMBER BARU — setiap seksi memakai layanan/repo yang
 * sudah ada: resolveWorkspaceAccess + readBatchBalance + readUsageHistory
 * (billingAccountService), mesin status langganan + pemeta baris
 * (subscriptionMachine + billingService.subscriptionRowToState),
 * listOrdersByAccount (billingStore), listInvitations (invitations/
 * service). TIDAK ADA sumber data baru yang diciptakan di sini.
 *
 * BACA-SAIA, TANPA PROVISIONING — mengikuti pola usage.js, bukan
 * balance: akun billing yang belum ada berarti konteks kosong (bukan
 * dibuat di sini). Akun dibuat oleh bootstrap pasca-signup.
 *
 * LAPORAN, BUKAN PENEGAKAN (D3 belum diputuskan) — resolver MELAPORKAN
 * fakta paket/langganan (planId, status, entitlementPlanId hasil mesin
 * status), TIDAK PERNAH menegakkan hak paket/entitlement.
 *
 * DI LUAR CAKUPAN (D1 belum diputuskan): proyek, RAB, QTO, dokumen,
 * jadwal, keuangan proyek — SEMUANYA localStorage tanpa field owner,
 * sehingga TIDAK ADA satu pun field proyek di output resolver ini.
 *
 * FRESHNESS — setiap seksi membawa label:
 *   'live'        dibaca dari server pada request ini;
 *   'unavailable' tidak dapat dibaca (alasan di `reason` — repo belum
 *                 terkonfigurasi, bukan anggota, bukan admin workspace,
 *                 atau lookup gagal). TIDAK PERNAH diisi angka karangan.
 *   'cached'      TIDAK PERNAH ditulis resolver — label ini hanya
 *                 ditulis modul klien (accountContext.ts) bila ia
 *                 menyajikan snapshot dari cache TTL-nya.
 *
 * DEGRADASI — kegagalan satu seksi TIDAK PERNAH menggagalkan seluruh
 * konteks: seksi yang gagal dilabeli 'unavailable' dengan alasannya,
 * seksi lain tetap live. Tanpa billing repo sama sekali, identitas
 * tetap live (dari JWT) dan semua seksi lain 'unavailable' — resolver
 * tidak melempar untuk kasus itu (hanya tanpa identitas ia melempar).
 */

import {
  readBatchBalance,
  readUsageHistory,
  resolveWorkspaceAccess,
} from './billingAccountService.js';
import { subscriptionRowToState } from './billingService.js';
import {
  entitlementPlanId,
  sweepSubscription,
} from './subscriptionMachine.js';
import { listInvitations } from './invitations/service.js';

/** Jendela riwayat yang dibawa konteks (prompt AI butuh ringkasan, bukan dump). */
export const ACCOUNT_CONTEXT_USAGE_LIMIT = 5;
export const ACCOUNT_CONTEXT_ORDERS_LIMIT = 5;
export const ACCOUNT_CONTEXT_INVITATIONS_LIMIT = 10;

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

function unavailable(reason) {
  return { freshness: 'unavailable', reason };
}

function compactOrder(row) {
  return {
    orderId: row.order_id,
    kind: row.kind ?? null,
    itemId: row.item_id ?? null,
    planId: row.plan_id ?? null,
    amountIdr: row.amount_idr == null ? null : Number(row.amount_idr),
    status: row.status ?? null,
    createdAt: row.created_at ?? null,
    paidAt: row.paid_at ?? null,
  };
}

function compactInvitation(view) {
  return {
    email: view.email,
    role: view.role ?? null,
    status: view.status ?? null,
    expiresAt: view.expiresAt ?? null,
    createdAt: view.createdAt ?? null,
  };
}

/**
 * Rakit konteks akun server-backed untuk satu principal terverifikasi.
 *
 * @param {object} input
 * @param {{ userId: string, email?: string|null, isAnonymous?: boolean }} input.identity
 *   Identitas HANYA dari JWT terverifikasi (diisi handler dari auth.user).
 *   `isAnonymous: true` diteruskan ke otorisasi sehingga pengguna demo
 *   ditolak fail-closed (DEMO_RESTRICTED) meski pemeriksaan handler
 *   dilewati — pertahanan berlapis, bukan jalur utama.
 * @param {string|null} [input.workspaceId] Target workspace (tak terpercaya;
 *   null = diturunkan dari keanggotaan, tepat satu yang aktif).
 * @param {object|null} [input.billingRepo] Repo billing (Supabase /
 *   InMemory). Null = backend belum terkonfigurasi → semua seksi
 *   dependen 'unavailable', identitas tetap live.
 * @param {object|null} [input.invitationRepo] Repo undangan. Null =
 *   seksi undangan 'unavailable' + nama workspace null.
 * @param {number} [input.nowMs] Jam suntikan (tes).
 * @param {number} [input.usageLimit] Jendela riwayat pemakaian (default 5).
 * @param {number} [input.ordersLimit] Jendela order (default 5).
 * @param {number} [input.invitationsLimit] Jendela undangan (default 10).
 * @returns {Promise<{ generatedAt: string, identity, workspace, subscription,
 *   credits, usage, orders, invitations }>} — TIDAK PERNAH berisi data
 *   proyek/RAB/QTO/dokumen/jadwal/keuangan (D1).
 * @throws {Error} ACCOUNT_CONTEXT_IDENTITY_REQUIRED bila tanpa identitas.
 */
export async function resolveAccountContext(input = {}) {
  const {
    identity,
    workspaceId = null,
    billingRepo = null,
    invitationRepo = null,
    nowMs,
    usageLimit = ACCOUNT_CONTEXT_USAGE_LIMIT,
    ordersLimit = ACCOUNT_CONTEXT_ORDERS_LIMIT,
    invitationsLimit = ACCOUNT_CONTEXT_INVITATIONS_LIMIT,
  } = input || {};
  const now = nowMs == null ? Date.now() : nowMs;
  const generatedAt = new Date(now).toISOString();

  // Identitas adalah SATU-SATUNYA input yang tidak boleh absen — tanpa
  // ini tidak ada konteks akun yang bisa dirakit secara jujur.
  if (!identity || typeof identity.userId !== 'string' || !identity.userId) {
    throw new Error('ACCOUNT_CONTEXT_IDENTITY_REQUIRED');
  }
  const identitySection = {
    freshness: 'live',
    userId: identity.userId,
    email: typeof identity.email === 'string' && identity.email ? identity.email : null,
  };

  // Tanpa repo billing, workspace tidak bisa diresolusi (keanggotaan
  // hidup di repo itu) — tetapi identitas dari JWT tetap valid dan
  // tetap dilaporkan live. Ini degradasi, bukan error.
  if (!billingRepo) {
    const reason = 'BILLING_NOT_CONFIGURED';
    return {
      generatedAt,
      identity: identitySection,
      workspace: unavailable(reason),
      subscription: unavailable(reason),
      credits: unavailable(reason),
      usage: unavailable(reason),
      orders: unavailable(reason),
      invitations: unavailable(reason),
    };
  }

  // Otorisasi workspace — pola yang sama persis dengan balance/usage:
  // principal dari JWT + record keanggotaan server-side, permission
  // 'billing:read'. Target workspaceId TIDAK PERNAH dipercaya begitu saja.
  const authLike = {
    ok: true,
    method: 'jwt',
    user: {
      id: identity.userId,
      email: identitySection.email,
      isAnonymous: identity.isAnonymous === true,
    },
  };
  let authz;
  try {
    authz = await resolveWorkspaceAccess(billingRepo, authLike, workspaceId || null, 'billing:read');
  } catch {
    authz = { ok: false, status: 503, error: 'WORKSPACE_LOOKUP_FAILED', errorCode: 'WORKSPACE_LOOKUP_FAILED' };
  }
  if (!authz.ok) {
    // NOT_A_MEMBER / WORKSPACE_AMBIGUOUS / DEMO_RESTRICTED / dll. adalah
    // KEADAAN AKUN yang jujur dilaporkan ke AI (bukan kegagalan teknis):
    // identitas tetap live, semua seksi dependen membawa alasannya.
    const reason = authz.errorCode || authz.error || 'WORKSPACE_UNAVAILABLE';
    return {
      generatedAt,
      identity: identitySection,
      workspace: { freshness: 'unavailable', reason, workspaceId: workspaceId || null },
      subscription: unavailable(reason),
      credits: unavailable(reason),
      usage: unavailable(reason),
      orders: unavailable(reason),
      invitations: unavailable(reason),
    };
  }

  const resolvedWorkspaceId = authz.workspaceId;

  // --- workspace -------------------------------------------------------
  let workspaceName = null;
  if (invitationRepo) {
    try {
      const ws = await invitationRepo.getWorkspace(resolvedWorkspaceId);
      workspaceName = ws?.name ?? null;
    } catch {
      workspaceName = null; // nama adalah pelengkap; keanggotaan adalah fakta utama
    }
  }
  // Status dari baris keanggotaan tersimpan (authz yang lolos sudah
  // menjamin ACTIVE — ini pembacaan faktual, bukan asumsi).
  let membershipStatus = 'ACTIVE';
  try {
    const membership = await billingRepo.getMembership(resolvedWorkspaceId, identity.userId);
    if (membership?.status) membershipStatus = String(membership.status);
  } catch {
    /* authz lolos ⇒ ACTIVE tersirat; kegagalan baca ulang tidak mengubah fakta itu */
  }
  const workspaceSection = {
    freshness: 'live',
    workspaceId: resolvedWorkspaceId,
    name: workspaceName,
    role: authz.principal?.role ?? null,
    status: membershipStatus,
    billingAdmin: authz.principal?.billingAdmin === true,
  };

  // --- akun billing (baca-saja; TIDAK dibuat bila belum ada) -----------
  let account = null;
  let accountLookupFailed = false;
  try {
    account = await billingRepo.getBillingAccountByWorkspace(resolvedWorkspaceId);
  } catch {
    accountLookupFailed = true;
  }

  // --- subscription (mesin status kanonis) ------------------------------
  let subscriptionSection;
  if (accountLookupFailed) {
    subscriptionSection = unavailable('BILLING_BACKEND_ERROR');
  } else if (!account) {
    subscriptionSection = { freshness: 'live', subscription: null, entitlementPlanId: 'free' };
  } else {
    try {
      const subRow = await billingRepo.getSubscriptionByAccount(account.id);
      const state = subscriptionRowToState(subRow);
      if (!state) {
        subscriptionSection = { freshness: 'live', subscription: null, entitlementPlanId: 'free' };
      } else {
        const swept = sweepSubscription(state, now);
        subscriptionSection = {
          freshness: 'live',
          subscription: {
            planId: swept.planId,
            status: swept.status,
            periodStart: iso(swept.periodStart),
            periodEnd: iso(swept.periodEnd),
            graceEndsAt: iso(swept.graceEndsAt),
            lastOrderId: swept.lastOrderId ?? null,
          },
          // Proyeksi hak dari mesin status — DILAPORKAN, bukan ditegakkan (D3).
          entitlementPlanId: entitlementPlanId(state, now),
        };
      }
    } catch {
      subscriptionSection = unavailable('SUBSCRIPTION_LOOKUP_FAILED');
    }
  }

  // --- credits (saldo ledger batch gen-2) -------------------------------
  let creditsSection;
  if (accountLookupFailed) {
    creditsSection = unavailable('BILLING_BACKEND_ERROR');
  } else if (!account) {
    creditsSection = { freshness: 'live', balance: null, reason: 'NO_BILLING_ACCOUNT' };
  } else {
    try {
      const balance = await readBatchBalance(billingRepo, account.id, now);
      creditsSection = { freshness: 'live', balance, reason: null };
    } catch {
      creditsSection = unavailable('BALANCE_LOOKUP_FAILED');
    }
  }

  // --- usage (jendela operasi ledger terbaru) ----------------------------
  let usageSection;
  if (accountLookupFailed) {
    usageSection = unavailable('BILLING_BACKEND_ERROR');
  } else if (!account) {
    usageSection = { freshness: 'live', recent: [], count: 0 };
  } else {
    try {
      const recent = await readUsageHistory(billingRepo, account.id, usageLimit);
      usageSection = { freshness: 'live', recent, count: recent.length };
    } catch {
      usageSection = unavailable('USAGE_LOOKUP_FAILED');
    }
  }

  // --- orders (jendela order terbaru milik workspace) --------------------
  let ordersSection;
  if (accountLookupFailed) {
    ordersSection = unavailable('BILLING_BACKEND_ERROR');
  } else if (!account) {
    ordersSection = { freshness: 'live', recent: [], count: 0 };
  } else {
    try {
      const rows = await billingRepo.listOrdersByAccount(account.id, ordersLimit);
      const recent = (rows || []).map(compactOrder);
      ordersSection = { freshness: 'live', recent, count: recent.length };
    } catch {
      ordersSection = unavailable('ORDER_LIST_FAILED');
    }
  }

  // --- invitations (hanya admin workspace — listInvitations sendiri
  // yang menegakkannya; non-admin mendapat 'unavailable' + alasan,
  // BUKAN daftar kosong yang menyamarkan keberadaan undangan) -----------
  let invitationsSection;
  if (!invitationRepo) {
    invitationsSection = unavailable('INVITATIONS_NOT_CONFIGURED');
  } else {
    try {
      const result = await listInvitations(
        { repo: invitationRepo, nowMs: now },
        { id: identity.userId },
        resolvedWorkspaceId,
        'ALL',
      );
      if (!result.ok) {
        const reason = result.error === 'FORBIDDEN'
          ? 'NOT_WORKSPACE_ADMIN'
          : (result.error || 'INVITATION_LIST_FAILED');
        invitationsSection = unavailable(reason);
      } else {
        const all = result.invitations || [];
        const pending = all.filter((i) => i.status === 'PENDING').length;
        invitationsSection = {
          freshness: 'live',
          pending,
          total: all.length,
          recent: all.slice(0, invitationsLimit).map(compactInvitation),
        };
      }
    } catch {
      invitationsSection = unavailable('INVITATION_LIST_FAILED');
    }
  }

  return {
    generatedAt,
    identity: identitySection,
    workspace: workspaceSection,
    subscription: subscriptionSection,
    credits: creditsSection,
    usage: usageSection,
    orders: ordersSection,
    invitations: invitationsSection,
  };
}

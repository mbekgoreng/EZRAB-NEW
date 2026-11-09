/**
 * api/_lib/billingService.js — Layanan billing server (checkout + webhook).
 * ============================================================================
 * Menghubungkan empat fondasi yang sudah ada — tidak satu pun ditulis ulang:
 * - katalog server (billingCatalog.js): satu-satunya sumber jumlah transaksi;
 * - otorisasi workspace (billingAuthorization.js): identitas dari JWT
 *   terverifikasi + record keanggotaan server-side, fail-closed;
 * - ledger domain (creditLedger.js) lewat adapter store (billingStore.js):
 *   grant hanya di sini, idempoten per order_id;
 * - Midtrans (midtrans.js): Snap untuk checkout, signature untuk webhook.
 *
 * Aturan uang yang ditegakkan:
 * - Jumlah transaksi SELALU dari katalog server. Fungsi checkout bahkan
 *   tidak menerima parameter jumlah — tidak ada yang bisa dipalsukan klien.
 * - Grant kredit/langganan HANYA dari notifikasi webhook yang signature-nya
 *   valid DAN jumlahnya cocok dengan order tersimpan. Redirect "sukses",
 *   polling klien, dan klaim klien tidak pernah memberi apa pun.
 * - Replay webhook tidak menggandakan grant: pagar berlapis — penanda
 *   granted_at pada order, last_order_id pada langganan, dan idempotency
 *   domain ledger (kunci = order_id) di level store.
 * - Refund dari gateway dicatat sebagai peristiwa + status order TANPA aksi
 *   saldo apa pun (register D2 — PENDING_LEGAL_REVIEW).
 * - Belum terkonfigurasi = jujur: tanpa Server Key Midtrans atau tanpa
 *   repository DB, semua aksi menjawab 503 BILLING_NOT_CONFIGURED dengan
 *   komponen yang hilang disebut — tidak ada mode pura-pura terhubung.
 *
 * Resolusi workspace: checkout/order/subscription menerima workspaceId
 * eksplisit dari klien (header/body/query — target, bukan bukti). Bila
 * tidak diberikan, workspace diturunkan dari record keanggotaan
 * terverifikasi milik pengguna HANYA bila tepat satu yang aktif; nol →
 * ditolak, lebih dari satu → ditolak sebagai ambigu. Keputusan aksesnya
 * sendiri selalu oleh authorizeWorkspaceAccess.
 */

import { randomBytes } from 'node:crypto';
import { getCatalogItem } from './billingCatalog.js';
import { authorizeWorkspaceAccess } from './billingAuthorization.js';
import {
  createSnapTransaction,
  verifyNotificationSignature,
  mapTransactionStatus,
  formatGrossAmount,
} from './midtrans.js';
import { withLedger } from './billingStore.js';
import {
  addMonths,
  createSubscriptionState,
  applyPaymentSucceeded,
  applyPaymentFailed,
  sweepSubscription,
  entitlementPlanId,
} from './subscriptionMachine.js';

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const toMs = (t) => (t == null ? null : Date.parse(t));

export function subscriptionRowToState(row) {
  if (!row) return null;
  return {
    planId: row.plan_id,
    status: row.status,
    periodStart: toMs(row.period_start),
    periodEnd: toMs(row.period_end),
    trialEnd: toMs(row.trial_end),
    graceEndsAt: toMs(row.grace_ends_at),
    lastOrderId: row.last_order_id ?? null,
    updatedAt: toMs(row.updated_at),
  };
}

export function stateToSubscriptionRow(state, ctx) {
  return {
    workspace_id: ctx.workspaceId,
    account_id: ctx.accountId,
    plan_id: state.planId,
    status: state.status,
    period_start: iso(state.periodStart),
    period_end: iso(state.periodEnd),
    trial_end: iso(state.trialEnd),
    grace_ends_at: iso(state.graceEndsAt),
    last_order_id: state.lastOrderId ?? null,
  };
}

function fail(status, errorCode, extra = {}) {
  return { ok: false, status, error: errorCode, errorCode, ...extra };
}

function notConfigured(component) {
  return {
    ok: false,
    status: 503,
    error: 'BILLING_NOT_CONFIGURED',
    errorCode: 'BILLING_NOT_CONFIGURED',
    component,
    message: 'Pembayaran online belum terhubung di server.',
  };
}

function defaultOrderId(kind, now) {
  const rand = randomBytes(4).toString('hex');
  return `EZR-${kind === 'SUBSCRIPTION' ? 'SUB' : 'TOP'}-${now.toString(36)}-${rand}`.slice(0, 50);
}

export function createBillingService(deps = {}) {
  const repo = deps.repo ?? null;
  const midtransConfig = deps.midtransConfig ?? null;
  const fetchImpl = deps.fetchImpl;
  const nowFn = deps.now || (() => Date.now());
  const newOrderId = deps.newOrderId || defaultOrderId;

  async function resolveWorkspace(auth, workspaceId) {
    const userId = auth?.user?.id;
    if (!userId) return { error: fail(401, 'AUTH_REQUIRED') };
    if (workspaceId) {
      const membership = await repo.getMembership(workspaceId, userId);
      return { workspaceId, membership };
    }
    const memberships = await repo.listMembershipsForUser(userId);
    const active = (memberships || []).filter(
      (m) => String(m.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
    );
    if (active.length === 0) return { error: fail(403, 'NOT_A_MEMBER') };
    if (active.length > 1) return { error: fail(400, 'WORKSPACE_AMBIGUOUS') };
    return { workspaceId: active[0].workspace_id, membership: active[0] };
  }

  async function authorize(auth, workspaceId, permission) {
    const resolved = await resolveWorkspace(auth, workspaceId);
    if (resolved.error) return resolved;
    const access = authorizeWorkspaceAccess({
      auth,
      membership: resolved.membership,
      workspaceId: resolved.workspaceId,
      permission,
    });
    if (!access.allow) {
      return { error: fail(access.status, access.errorCode) };
    }
    return { workspaceId: resolved.workspaceId, principal: access.principal };
  }

  async function getOrCreateAccount(workspaceId, userId) {
    const existing = await repo.getBillingAccountByWorkspace(workspaceId);
    if (existing) return existing;
    return repo.createBillingAccount({ workspaceId, createdBy: userId });
  }

  // ------------------------------------------------------------- checkout
  async function checkout({ auth, workspaceId, kind, itemId }) {
    if (!midtransConfig) return notConfigured('midtrans');
    if (!repo) return notConfigured('store');
    const authz = await authorize(auth, workspaceId, 'billing:use');
    if (authz.error) return authz.error;

    const item = getCatalogItem(kind, itemId);
    if (!item) return fail(400, 'UNKNOWN_ITEM');

    const account = await getOrCreateAccount(authz.workspaceId, auth.user.id);
    const now = nowFn();
    const orderId = newOrderId(kind, now);
    const creditsSnapshot = item.kind === 'SUBSCRIPTION'
      ? item.credits
      : item.baseCredits + item.bonusCredits;
    await repo.insertOrder({
      order_id: orderId,
      workspace_id: authz.workspaceId,
      account_id: account.id,
      created_by: auth.user.id,
      kind: item.kind,
      item_id: item.itemId,
      plan_id: item.kind === 'SUBSCRIPTION' ? item.planId : null,
      amount_idr: item.priceIdr,
      credits_snapshot: creditsSnapshot,
      status: 'PENDING',
      snap_token: null,
      redirect_url: null,
    });

    let snap;
    try {
      snap = await createSnapTransaction(midtransConfig, {
        orderId,
        amountIdr: item.priceIdr,
        itemDetails: [{
          id: item.itemId,
          price: item.priceIdr,
          quantity: 1,
          name: item.displayName,
        }],
        customerDetails: { email: auth.user.email || undefined },
      }, fetchImpl);
    } catch (err) {
      try {
        await repo.updateOrderByOrderId(orderId, { status: 'FAILED' });
      } catch { /* best-effort: order tetap tercatat PENDING untuk audit */ }
      return fail(502, 'MIDTRANS_API_ERROR');
    }

    await repo.updateOrderByOrderId(orderId, {
      snap_token: snap.token,
      redirect_url: snap.redirectUrl,
    });
    return {
      ok: true,
      orderId,
      token: snap.token,
      redirectUrl: snap.redirectUrl,
      amountIdr: item.priceIdr,
      kind: item.kind,
      itemId: item.itemId,
    };
  }

  // ------------------------------------------------------------- webhook
  async function recordEvent(order, notification, eventKind, result, signatureValid = true) {
    if (!repo) return;
    try {
      await repo.appendPaymentEvent({
        order_id: String(notification?.order_id || ''),
        account_id: order ? order.account_id : null,
        transaction_status: notification?.transaction_status ?? null,
        status_code: notification?.status_code ?? null,
        gross_amount: notification?.gross_amount ?? null,
        signature_valid: signatureValid,
        event_kind: eventKind,
        processing_result: result,
        payload: notification || {},
      });
    } catch { /* jurnal best-effort: kegagalannya tidak mengubah keputusan uang */ }
  }

  async function handleNotification(notification) {
    if (!midtransConfig) return notConfigured('midtrans');

    const signatureValid = verifyNotificationSignature(notification, midtransConfig.serverKey);
    if (!signatureValid) {
      await recordEvent(null, notification, null, 'REJECTED_SIGNATURE', false);
      return fail(400, 'INVALID_SIGNATURE');
    }
    if (!repo) return notConfigured('store');

    const order = await repo.getOrderByOrderId(String(notification.order_id || ''));
    if (!order) {
      await recordEvent(null, notification, mapTransactionStatus(notification), 'UNKNOWN_ORDER');
      return { ok: true, matched: false };
    }

    const event = mapTransactionStatus(notification);
    const now = nowFn();
    const ctx = { ownerUserId: order.created_by, workspaceId: order.workspace_id };

    // Replay setelah grant tercatat: konvergen, tanpa grant kedua. Refund
    // yang datang belakangan tetap dicatat sebagai transisi status.
    if (order.granted_at) {
      if (event === 'REFUNDED' || event === 'PARTIALLY_REFUNDED') {
        await repo.updateOrderByOrderId(order.order_id, {
          status: event,
          midtrans_transaction_status: notification.transaction_status ?? null,
        });
        await recordEvent(order, notification, event, 'RECORDED_REFUND');
        return { ok: true, matched: true, event, granted: false, duplicate: true, refundRecorded: true };
      }
      await recordEvent(order, notification, event, 'DUPLICATE');
      return { ok: true, matched: true, event, granted: false, duplicate: true };
    }

    if (event === 'PAID') {
      if (formatGrossAmount(Number(order.amount_idr)) !== String(notification.gross_amount)) {
        await recordEvent(order, notification, event, 'AMOUNT_MISMATCH');
        return { ok: true, matched: true, event, granted: false, reason: 'AMOUNT_MISMATCH' };
      }
      const item = getCatalogItem(order.kind, order.item_id);
      if (!item) {
        await recordEvent(order, notification, event, 'CATALOG_MISSING');
        return { ok: true, matched: true, event, granted: false, reason: 'CATALOG_MISSING' };
      }
      const parsedSettlement = notification.settlement_time
        ? Date.parse(String(notification.settlement_time).replace(' ', 'T'))
        : NaN;
      const paidAt = Number.isNaN(parsedSettlement) ? now : parsedSettlement;

      let grantResult;
      if (item.kind === 'SUBSCRIPTION') {
        grantResult = await withLedger(repo, order.account_id, ctx, (ledger) =>
          ledger.grantSubscription({
            accountId: order.account_id,
            amount: item.credits,
            periodStart: paidAt,
            periodEnd: addMonths(paidAt, item.periodMonths),
            idempotencyKey: order.order_id,
            sourceRef: order.order_id,
            actor: 'midtrans-webhook',
            now: paidAt,
          })
        );
      } else {
        grantResult = await withLedger(repo, order.account_id, ctx, (ledger) => {
          const topUp = ledger.grantTopUp({
            accountId: order.account_id,
            amount: item.baseCredits,
            paymentRef: order.order_id,
            idempotencyKey: order.order_id,
            actor: 'midtrans-webhook',
            now: paidAt,
          });
          if (!topUp.ok || !(item.bonusCredits > 0)) return topUp;
          const bonus = ledger.grantBonus({
            accountId: order.account_id,
            amount: item.bonusCredits,
            campaignRef: item.itemId,
            idempotencyKey: `${order.order_id}:bonus`,
            actor: 'midtrans-webhook',
            now: paidAt,
          });
          return bonus.ok ? topUp : bonus;
        });
      }
      if (!grantResult || !grantResult.ok) {
        await recordEvent(order, notification, event, 'GRANT_FAILED');
        return { ok: true, matched: true, event, granted: false, reason: grantResult?.error || 'GRANT_FAILED' };
      }

      if (item.kind === 'SUBSCRIPTION') {
        const subRow = await repo.getSubscriptionByAccount(order.account_id);
        if (!subRow || subRow.last_order_id !== order.order_id) {
          const current = subscriptionRowToState(subRow);
          const next = current
            ? { ...applyPaymentSucceeded(current, { at: paidAt, periodMonths: item.periodMonths, orderId: order.order_id }), planId: item.planId }
            : createSubscriptionState({ planId: item.planId, at: paidAt, periodMonths: item.periodMonths, orderId: order.order_id });
          const row = stateToSubscriptionRow(next, { workspaceId: order.workspace_id, accountId: order.account_id });
          if (subRow) await repo.updateSubscription(subRow.id, row);
          else await repo.insertSubscription(row);
        }
      }

      await repo.updateOrderByOrderId(order.order_id, {
        status: 'PAID',
        paid_at: iso(paidAt),
        granted_at: iso(now),
        midtrans_transaction_status: notification.transaction_status ?? null,
        midtrans_payment_type: notification.payment_type ?? null,
      });
      const duplicate = grantResult.duplicate === true;
      await recordEvent(order, notification, event, duplicate ? 'DUPLICATE' : 'GRANTED');
      return { ok: true, matched: true, event, granted: !duplicate, duplicate };
    }

    if (event === 'PENDING') {
      await repo.updateOrderByOrderId(order.order_id, {
        midtrans_transaction_status: notification.transaction_status ?? null,
        midtrans_payment_type: notification.payment_type ?? null,
      });
      await recordEvent(order, notification, event, 'RECORDED');
      return { ok: true, matched: true, event, granted: false };
    }

    if (event === 'FAILED' || event === 'EXPIRED') {
      const orderStatus = notification.transaction_status === 'cancel' ? 'CANCELLED' : event;
      await repo.updateOrderByOrderId(order.order_id, {
        status: orderStatus,
        midtrans_transaction_status: notification.transaction_status ?? null,
        midtrans_payment_type: notification.payment_type ?? null,
      });
      if (order.kind === 'SUBSCRIPTION') {
        const subRow = await repo.getSubscriptionByAccount(order.account_id);
        if (subRow && subRow.last_order_id !== order.order_id) {
          const current = subscriptionRowToState(subRow);
          const next = applyPaymentFailed(current, { at: now });
          await repo.updateSubscription(
            subRow.id,
            stateToSubscriptionRow(next, { workspaceId: order.workspace_id, accountId: order.account_id })
          );
        }
      }
      await recordEvent(order, notification, event, 'RECORDED_NO_GRANT');
      return { ok: true, matched: true, event, granted: false };
    }

    if (event === 'REFUNDED' || event === 'PARTIALLY_REFUNDED') {
      await repo.updateOrderByOrderId(order.order_id, {
        status: event,
        midtrans_transaction_status: notification.transaction_status ?? null,
      });
      await recordEvent(order, notification, event, 'RECORDED_NO_BALANCE_ACTION');
      return { ok: true, matched: true, event, granted: false, refundRecorded: true };
    }

    await recordEvent(order, notification, event, 'RECORDED_UNKNOWN');
    return { ok: true, matched: true, event, granted: false };
  }

  // ------------------------------------------------------------- reads
  async function getOrder({ auth, workspaceId, orderId }) {
    if (!repo) return notConfigured('store');
    const authz = await authorize(auth, workspaceId, 'billing:read');
    if (authz.error) return authz.error;
    const order = await repo.getOrderByOrderId(String(orderId || ''));
    if (!order || order.workspace_id !== authz.workspaceId) {
      return fail(404, 'ORDER_NOT_FOUND');
    }
    return {
      ok: true,
      order: {
        orderId: order.order_id,
        kind: order.kind,
        itemId: order.item_id,
        planId: order.plan_id,
        amountIdr: Number(order.amount_idr),
        status: order.status,
        paidAt: order.paid_at ?? null,
        grantedAt: order.granted_at ?? null,
        createdAt: order.created_at ?? null,
      },
    };
  }

  async function getSubscriptionState({ auth, workspaceId }) {
    if (!repo) return notConfigured('store');
    const authz = await authorize(auth, workspaceId, 'billing:read');
    if (authz.error) return authz.error;
    const account = await repo.getBillingAccountByWorkspace(authz.workspaceId);
    if (!account) {
      return { ok: true, subscription: null, entitlementPlanId: 'free' };
    }
    const subRow = await repo.getSubscriptionByAccount(account.id);
    const state = subscriptionRowToState(subRow);
    if (!state) {
      return { ok: true, subscription: null, entitlementPlanId: 'free' };
    }
    const now = nowFn();
    const swept = sweepSubscription(state, now);
    return {
      ok: true,
      subscription: {
        planId: swept.planId,
        status: swept.status,
        periodStart: iso(swept.periodStart),
        periodEnd: iso(swept.periodEnd),
        graceEndsAt: iso(swept.graceEndsAt),
        lastOrderId: swept.lastOrderId,
      },
      entitlementPlanId: entitlementPlanId(state, now),
    };
  }

  return {
    checkout,
    handleNotification,
    getOrder,
    getSubscriptionState,
    isConfigured: () => ({ midtrans: Boolean(midtransConfig), store: Boolean(repo) }),
  };
}

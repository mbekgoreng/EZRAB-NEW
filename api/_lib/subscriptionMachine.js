/**
 * api/_lib/subscriptionMachine.js — Mesin status langganan minimal (WS-B §3-6).
 * ============================================================================
 * Status: TRIALING · ACTIVE · PAST_DUE · GRACE · CANCELLED · EXPIRED.
 * Seluruh fungsi MURNI (tanpa I/O, tanpa mutasi input): transisi digerakkan
 * oleh (a) peristiwa pembayaran dari webhook Midtrans terverifikasi dan
 * (b) sapuan waktu (sweep) yang dihitung dari cap waktu yang tersimpan.
 * Persistensi adalah urusan repository (api/_lib/billingStore.js); modul ini
 * hanya memutuskan status berikutnya.
 *
 * Kebijakan yang dikunci:
 * - Masa tenggang (GRACE) = 3 hari sejak akhir periode (Spec billing:
 *   grace 3 hari). Selama GRACE hak paket masih berlaku — kegagalan bayar
 *   sesaat tidak boleh langsung memutus layanan.
 * - PAST_DUE menandai percobaan pembayaran yang GAGAL (deny/failure dari
 *   gateway) selagi periode berjalan; batas tenggangnya sama: periodEnd + 3
 *   hari, lalu sweep waktu yang memindahkan ke GRACE → EXPIRED.
 * - CANCELLED mempertahankan hak sampai periodEnd (pembatalan berlaku di
 *   akhir periode), sesudah itu sweep → EXPIRED.
 * - EXPIRED mengembalikan hak efektif ke Free (lihat entitlementPlanId).
 * - Pembayaran sukses dari status apa pun (termasuk EXPIRED/CANCELLED)
 *   mengaktifkan kembali: periode baru mulai dari max(sekarang, periodEnd
 *   yang masih berjalan) agar sisa periode berbayar tidak hilang.
 * - Status refund dari gateway TIDAK mengubah status langganan di sini —
 *   refund adalah peristiwa yang dicatat pada order (register D2,
 *   PENDING_LEGAL_REVIEW); penarikan hak otomatis karena refund adalah
 *   keputusan hukum yang belum diambil owner.
 * - TRIALING didukung mesin (dibuat hanya bila checkout kelak menjual masa
 *   coba dengan trialEnd eksplisit); katalog v1 TIDAK menjual trial, jadi
 *   status ini dorman — didukung dan teruji, bukan diklaim aktif.
 *
 * Model langganan v1 (register D6, rekomendasi WS-B): pembayaran manual per
 * periode lewat Snap — TIDAK ada auto-debit di v1. "Pembayaran per periode"
 * = order langganan baru yang lunas → applyPaymentSucceeded.
 */

export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE', 'CANCELLED', 'EXPIRED'];

/** Status yang masih memberi hak paket (sebelum sweep waktu diterapkan). */
const ENTITLED_STATUSES = new Set(['TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE', 'CANCELLED']);

/** Tambah bulan kalender (UTC) ke cap waktu ms — untuk periode langganan bulanan. */
export function addMonths(ms, months) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

function baseState(fields) {
  return {
    planId: fields.planId,
    status: fields.status,
    periodStart: fields.periodStart ?? null,
    periodEnd: fields.periodEnd ?? null,
    trialEnd: fields.trialEnd ?? null,
    graceEndsAt: fields.graceEndsAt ?? null,
    lastOrderId: fields.lastOrderId ?? null,
    updatedAt: fields.updatedAt ?? null,
  };
}

/**
 * State awal dari pembayaran pertama yang lunas.
 * - Tanpa trial: ACTIVE, periode [at, at + periodMonths].
 * - Dengan trialEnd eksplisit (> at): TRIALING sampai trialEnd (dorman di v1).
 */
export function createSubscriptionState({ planId, at, periodMonths = 1, trialEnd = null, orderId = null }) {
  if (trialEnd != null && trialEnd > at) {
    return baseState({
      planId, status: 'TRIALING',
      periodStart: at, periodEnd: trialEnd, trialEnd,
      lastOrderId: orderId, updatedAt: at,
    });
  }
  return baseState({
    planId, status: 'ACTIVE',
    periodStart: at, periodEnd: addMonths(at, periodMonths),
    lastOrderId: orderId, updatedAt: at,
  });
}

/** Peristiwa: pembayaran periode lunas (settlement/capture terverifikasi). */
export function applyPaymentSucceeded(state, { at, periodMonths = 1, orderId = null }) {
  const stillRunning = state && state.periodEnd != null && state.periodEnd > at &&
    state.status !== 'EXPIRED';
  const periodStart = stillRunning ? state.periodEnd : at;
  return baseState({
    planId: state?.planId,
    status: 'ACTIVE',
    periodStart,
    periodEnd: addMonths(periodStart, periodMonths),
    trialEnd: null,
    graceEndsAt: null,
    lastOrderId: orderId ?? state?.lastOrderId ?? null,
    updatedAt: at,
  });
}

/** Peristiwa: percobaan pembayaran gagal (deny/failure) untuk langganan ini. */
export function applyPaymentFailed(state, { at }) {
  if (!state) return state;
  if (state.status !== 'ACTIVE' && state.status !== 'TRIALING') return { ...state };
  const anchor = state.periodEnd ?? state.trialEnd ?? at;
  return {
    ...state,
    status: 'PAST_DUE',
    graceEndsAt: state.graceEndsAt ?? anchor + GRACE_MS,
    updatedAt: at,
  };
}

/** Peristiwa: pelanggan membatalkan — hak tetap sampai akhir periode. */
export function applyCancellation(state, { at }) {
  if (!state) return state;
  if (state.status === 'EXPIRED' || state.status === 'CANCELLED') return { ...state };
  return { ...state, status: 'CANCELLED', updatedAt: at };
}

/**
 * Sapuan waktu: kembalikan state sebagaimana seharusnya terlihat pada `at`.
 * Tidak mengubah apa pun selain transisi yang digerakkan waktu.
 */
export function sweepSubscription(state, at) {
  if (!state) return state;
  let s = state;
  if (s.status === 'TRIALING' && s.trialEnd != null && at > s.trialEnd) {
    s = { ...s, status: 'GRACE', graceEndsAt: s.trialEnd + GRACE_MS, updatedAt: at };
  }
  if ((s.status === 'ACTIVE' || s.status === 'PAST_DUE') && s.periodEnd != null && at > s.periodEnd) {
    s = { ...s, status: 'GRACE', graceEndsAt: s.graceEndsAt ?? s.periodEnd + GRACE_MS, updatedAt: at };
  }
  if (s.status === 'GRACE' && s.graceEndsAt != null && at > s.graceEndsAt) {
    s = { ...s, status: 'EXPIRED', updatedAt: at };
  }
  if (s.status === 'CANCELLED' && s.periodEnd != null && at > s.periodEnd) {
    s = { ...s, status: 'EXPIRED', updatedAt: at };
  }
  return s === state ? state : s;
}

/** Status efektif pada waktu `at` (setelah sapuan waktu). */
export function effectiveStatus(state, at) {
  if (!state) return null;
  return sweepSubscription(state, at).status;
}

/**
 * Plan yang berhak dipakai pada waktu `at`: planId langganan selama status
 * efektif masih memberi hak; 'free' bila tidak ada langganan / EXPIRED.
 * Inilah proyeksi yang dibaca lapisan entitlement — status mentah tidak
 * pernah dibaca langsung oleh pemanggil.
 */
export function entitlementPlanId(state, at) {
  if (!state) return 'free';
  const status = effectiveStatus(state, at);
  return ENTITLED_STATUSES.has(status) ? state.planId : 'free';
}

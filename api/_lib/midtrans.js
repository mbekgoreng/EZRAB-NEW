/**
 * api/_lib/midtrans.js — Klien server Midtrans (Snap + verifikasi notifikasi).
 * ============================================================================
 * Integrasi Midtrans untuk billing EZRAB (keputusan gateway owner — D5;
 * rencana WS-B §3). Prinsip yang ditegakkan di sini:
 *
 * - TANPA SDK baru: cukup fetch + node:crypto. Snap dibuat lewat
 *   POST {snapHost}/snap/v1/transactions dengan HTTP Basic
 *   (username = Server Key, password kosong) — sesuai docs resmi Midtrans.
 * - Server Key HANYA dibaca dari env server (MIDTRANS_SERVER_KEY). Ia tidak
 *   pernah dikirim ke browser, tidak pernah masuk log, dan tidak pernah
 *   menjadi bagian respons. Client Key bersifat publik (dipakai snap.js di
 *   browser) dan TIDAK dipakai modul ini selain diteruskan pemanggil.
 * - Fail-closed & jujur: tanpa Server Key, modul berstatus NOT_CONFIGURED
 *   dan setiap operasi melempar error berkode MIDTRANS_NOT_CONFIGURED —
 *   pemanggil (handler) memetakannya ke 503, mengikuti pola
 *   CREDITS_NOT_CONFIGURED yang sudah ada. Tidak ada mode "seolah terhubung".
 * - Notifikasi (webhook) HANYA dipercaya setelah signature_key cocok:
 *   SHA512(order_id + status_code + gross_amount + ServerKey), dibandingkan
 *   timing-safe. Signature tidak cocok = notifikasi ditolak, titik.
 * - Pemberian kredit TIDAK PERNAH berdasarkan redirect "sukses" dari klien;
 *   satu-satunya pemicu grant adalah notifikasi terverifikasi yang diproses
 *   billingService (lihat api/_lib/billingService.js).
 *
 * Env (server saja):
 * - MIDTRANS_SERVER_KEY      — wajib untuk status terkonfigurasi.
 * - MIDTRANS_IS_PRODUCTION   — 'true' → host produksi; selain itu sandbox.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export const MIDTRANS_SANDBOX_HOST = 'https://app.sandbox.midtrans.com';
export const MIDTRANS_PRODUCTION_HOST = 'https://app.midtrans.com';

/** Baca konfigurasi Midtrans dari env. Mengembalikan null bila belum ada Server Key. */
export function getMidtransConfig(env = process.env) {
  const serverKey = String(env.MIDTRANS_SERVER_KEY || '').trim();
  if (!serverKey) return null;
  const isProduction = String(env.MIDTRANS_IS_PRODUCTION || '').trim().toLowerCase() === 'true';
  return {
    serverKey,
    isProduction,
    snapHost: isProduction ? MIDTRANS_PRODUCTION_HOST : MIDTRANS_SANDBOX_HOST,
  };
}

export function isMidtransConfigured(env = process.env) {
  return getMidtransConfig(env) !== null;
}

function notConfiguredError() {
  const err = new Error('MIDTRANS_NOT_CONFIGURED');
  err.code = 'MIDTRANS_NOT_CONFIGURED';
  return err;
}

/**
 * Hitung signature notifikasi Midtrans:
 * SHA512(order_id + status_code + gross_amount + serverKey) — hex lowercase.
 * gross_amount dipakai PERSIS seperti string yang dikirim Midtrans
 * (mis. "54999.00") — jangan diformat ulang.
 */
export function computeNotificationSignature({ orderId, statusCode, grossAmount, serverKey }) {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

/**
 * Verifikasi signature_key sebuah notifikasi. Mengembalikan boolean;
 * tidak pernah melempar untuk input yang cacat (input cacat = tidak valid).
 */
export function verifyNotificationSignature(notification, serverKey) {
  if (!notification || typeof notification !== 'object') return false;
  const { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signatureKey } = notification;
  if (typeof orderId !== 'string' || typeof statusCode !== 'string' ||
      typeof grossAmount !== 'string' || typeof signatureKey !== 'string' ||
      !serverKey) {
    return false;
  }
  const expected = computeNotificationSignature({ orderId, statusCode, grossAmount, serverKey });
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureKey.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Petakan status transaksi Midtrans → peristiwa billing internal.
 * - PAID: settlement, atau capture dengan fraud_status accept (kartu).
 *   capture dengan fraud_status challenge/deny BUKAN lunas.
 * - PENDING: pending (menunggu pembayaran) — bukan grant.
 * - FAILED: deny / cancel / failure — pembayaran gagal/dibatalkan.
 * - EXPIRED: expire.
 * - REFUNDED / PARTIALLY_REFUNDED: refund / partial_refund — dicatat sebagai
 *   peristiwa SAJA oleh pemanggil; tidak ada aksi saldo di v1
 *   (PENDING_LEGAL_REVIEW, register D2).
 * - UNKNOWN: status tak dikenal — dicatat, tanpa aksi.
 */
export function mapTransactionStatus(notification) {
  const status = String(notification?.transaction_status || '');
  const fraud = String(notification?.fraud_status || '');
  switch (status) {
    case 'settlement':
      return 'PAID';
    case 'capture':
      if (fraud === 'accept' || fraud === '') return 'PAID';
      if (fraud === 'deny') return 'FAILED';
      return 'PENDING'; // challenge → menunggu keputusan fraud, bukan lunas
    case 'pending':
      return 'PENDING';
    case 'deny':
    case 'cancel':
    case 'failure':
      return 'FAILED';
    case 'expire':
      return 'EXPIRED';
    case 'refund':
      return 'REFUNDED';
    case 'partial_refund':
      return 'PARTIALLY_REFUNDED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Format jumlah untuk Midtrans: gross_amount pada notifikasi berbentuk
 * string desimal dua angka di belakang koma ("54999.00"). Fungsi ini dipakai
 * untuk MEMBANDINGKAN jumlah notifikasi dengan jumlah order tersimpan —
 * bukan untuk mengirim (Snap menerima integer gross_amount).
 */
export function formatGrossAmount(amountIdr) {
  if (!Number.isInteger(amountIdr) || amountIdr < 0) return null;
  return `${amountIdr}.00`;
}

/**
 * Buat transaksi Snap. Mengembalikan { token, redirectUrl }.
 * - amountIdr WAJIB integer rupiah dari katalog server (pemanggil yang
 *   menentukan; modul ini menolak jumlah tidak valid).
 * - fetchImpl dapat disuntikkan untuk tes (default: global fetch).
 * - Kegagalan HTTP dari Midtrans → error berkode MIDTRANS_API_ERROR dengan
 *   status; pesan mentah Midtrans tidak diteruskan mentah-mentah ke klien
 *   oleh pemanggil.
 */
export async function createSnapTransaction(config, args, fetchImpl) {
  if (!config || !config.serverKey) throw notConfiguredError();
  const { orderId, amountIdr, itemDetails, customerDetails } = args || {};
  if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 50) {
    const err = new Error('INVALID_ORDER_ID');
    err.code = 'INVALID_ORDER_ID';
    throw err;
  }
  if (!Number.isInteger(amountIdr) || amountIdr <= 0) {
    const err = new Error('INVALID_AMOUNT');
    err.code = 'INVALID_AMOUNT';
    throw err;
  }
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    const err = new Error('FETCH_UNAVAILABLE');
    err.code = 'FETCH_UNAVAILABLE';
    throw err;
  }
  const auth = Buffer.from(`${config.serverKey}:`, 'utf8').toString('base64');
  const res = await doFetch(`${config.snapHost}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: amountIdr },
      item_details: Array.isArray(itemDetails) ? itemDetails : undefined,
      customer_details: customerDetails || undefined,
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || typeof data.token !== 'string') {
    const err = new Error('MIDTRANS_API_ERROR');
    err.code = 'MIDTRANS_API_ERROR';
    err.status = res.status;
    err.midtransMessages = data && Array.isArray(data.error_messages) ? data.error_messages : undefined;
    throw err;
  }
  return { token: data.token, redirectUrl: typeof data.redirect_url === 'string' ? data.redirect_url : null };
}

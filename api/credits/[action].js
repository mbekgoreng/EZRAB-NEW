/**
 * /api/credits/[action] — SATU Serverless Function untuk seluruh permukaan
 * kredit & billing server:
 *   GET  /api/credits/balance      — saldo kredit (Phase 2/3, TIDAK berubah)
 *   POST /api/credits/checkout     — buat order + transaksi Snap Midtrans
 *   POST /api/credits/webhook      — notifikasi Midtrans → grant (idempoten)
 *   GET  /api/credits/order        — status satu order milik workspace
 *   GET  /api/credits/subscription — status langganan + plan hak efektif
 *   POST /api/credits/bootstrap    — bootstrap workspace pasca-signup
 *                                    (Phase 2 W5, 2026-11-19 — lihat
 *                                    api/_lib/workspaceBootstrap.js).
 *                                    AKSI, bukan file handler baru: plafon
 *                                    Vercel Hobby 12 fungsi SUDAH PENUH,
 *                                    jadi endpoint baru WAJIB menumpang
 *                                    handler dinamis yang ada.
 *
 * PENANGANAN ERROR (Phase 2 W5): setiap handler membungkus pemanggilan
 * service dalam try/catch dan menjawab 500 BILLING_BACKEND_ERROR yang
 * tersanitasi (tanpa stack, tanpa secret) bila service melempar — repo
 * yang gagal (mis. tabel belum ada) TIDAK LAGI menjadi 500 tak tertangkap.
 * Dispatcher default juga punya jaring pengaman yang sama. Webhook
 * mengembalikan 5xx agar Midtrans me-retry (idempoten); checkout
 * mengembalikan 500 jujur agar klien tidak mengira order berhasil.
 *
 * KENAPA DIGABUNG (keputusan owner D9(a), 2026-11-09): plafon Vercel Hobby
 * 12 fungsi/deployment SUDAH PENUH (11 handler + middleware). Aksi billing
 * TIDAK boleh menjadi fungsi baru, jadi ia digabung ke handler credits yang
 * sudah ada — pola yang sama persis dengan api/access/[action].js dan
 * api/invitations/[action].js. File ini MENGGANTIKAN api/credits/balance.js;
 * URL publik /api/credits/balance tidak berubah (isi handler balance
 * di-re-point ke ledger batch gen-2 pada 2026-11-10, D18(ii)). Total
 * handler tetap 11
 * (src/test/apiEndpointInventory.test.ts adalah penjaganya).
 *
 * KEJUJURAN STATUS: billing hanya hidup bila env server lengkap
 * (MIDTRANS_SERVER_KEY + Supabase service-role). Selama belum, aksi billing
 * menjawab 503 BILLING_NOT_CONFIGURED dan frontend tetap pada simulasi —
 * persis pola CREDITS_NOT_CONFIGURED yang sudah berlaku untuk balance.
 * Webhook TIDAK memakai auth pengguna: autentikasinya adalah signature
 * Midtrans yang diverifikasi di billingService sebelum apa pun diproses.
 */
import { applyCors, authenticateRequest, evaluateCreditAccess, readJsonBody } from '../_lib/security.js';
import { getBillingRepository } from '../_lib/billingStore.js';
import { getMidtransConfig } from '../_lib/midtrans.js';
import { createBillingService } from '../_lib/billingService.js';
import { requestedWorkspaceId } from '../_lib/billingAuthorization.js';
import {
  createBootstrapService,
  getBootstrapServiceConfig,
  getWorkspaceRepository,
} from '../_lib/workspaceBootstrap.js';
import {
  ensureFreeOnceGrant,
  getOrCreateBillingAccount,
  resolveWorkspaceAccess,
} from '../_lib/billingAccountService.js';

function buildBillingService() {
  return createBillingService({
    repo: getBillingRepository(),
    midtransConfig: getMidtransConfig(),
  });
}

async function readBody(req, res) {
  try {
    return typeof req.body === 'object' && req.body !== null ? req.body : await readJsonBody(req);
  } catch {
    res.status(400).json({ success: false, error: 'Body tidak valid.' });
    return undefined;
  }
}

function sendServiceResult(res, result) {
  if (result.ok) return res.status(200).json({ success: true, ...result, ok: undefined });
  return res.status(result.status || 400).json({
    success: false,
    error: result.error || 'BILLING_ERROR',
    errorCode: result.errorCode || result.error,
    ...(result.component ? { component: result.component } : {}),
    ...(result.message ? { message: result.message } : {}),
  });
}

/**
 * Respons 500 TERSANITASI untuk pengecualian tak terduga dari service —
 * tidak pernah memuat stack, pesan error mentah, atau nilai secret.
 * Dipakai semua handler yang memanggil service (checkout/webhook/order/
 * subscription/bootstrap) + jaring pengaman dispatcher.
 */
function sendBackendError(res) {
  return res.status(500).json({
    success: false,
    error: 'BILLING_BACKEND_ERROR',
    errorCode: 'BILLING_BACKEND_ERROR',
  });
}

// ---------------------------------------------------------------------------
// GET /api/credits/balance — saldo ledger batch gen-2 (D18(ii), 2026-11-10;
// menggantikan adapter gen-1/placeholder memori). Backend authoritative:
// saldo diturunkan dari batch kredit akun billing workspace pemanggil.
// Provisioning di jalur baca ini (D18(iii)): akun billing dibuat bila
// belum ada dan Free-once 100 kredit diterbitkan tepat sekali per akun
// (idempoten). 503 jujur bila repository Supabase server belum
// terkonfigurasi (frontend tetap memakai simulasi Phase 1). Flag lama
// CREDITS_DB_CONFIGURED tidak lagi menentukan endpoint ini.
// ---------------------------------------------------------------------------
async function balanceHandler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const repo = getBillingRepository();
  if (!repo) {
    return res.status(503).json({
      success: false,
      error: 'CREDITS_NOT_CONFIGURED',
      message: 'Backend kredit belum aktif — frontend memakai simulasi Phase 1.',
    });
  }

  const auth = await authenticateRequest(req);
  const access = evaluateCreditAccess(auth);
  if (!access.allow) {
    return res.status(access.status).json({ success: false, error: access.error, errorCode: access.errorCode });
  }
  // Phase 5.3 (audit R-01): TIDAK ada fallback 'anonymous'. evaluateCreditAccess
  // sudah menjamin identitas terverifikasi saat allow=true; penjaga eksplisit
  // ini memastikan handler gagal tertutup bila jaminan itu tidak terpenuhi,
  // bukan mengarang identitas bersama.
  if (!auth.user || !auth.user.id) {
    return res.status(401).json({ success: false, error: 'AUTH_REQUIRED', errorCode: 'AUTH_REQUIRED' });
  }
  const userId = auth.user.id;
  try {
    const authz = await resolveWorkspaceAccess(repo, auth, requestedWorkspaceId(req), 'billing:read');
    if (!authz.ok) {
      return res.status(authz.status).json({ success: false, error: authz.error, errorCode: authz.errorCode });
    }
    const account = await getOrCreateBillingAccount(repo, authz.workspaceId, userId);
    const grant = await ensureFreeOnceGrant(repo, account, {
      actorUserId: userId,
      workspaceId: authz.workspaceId,
    });
    if (!grant.ok) {
      return res.status(503).json({ success: false, error: 'CREDITS_BACKEND_UNAVAILABLE' });
    }
    return res.status(200).json({
      success: true,
      balance: grant.balance,
      freeOnceGranted: grant.granted === true,
      simulated: false,
    });
  } catch {
    return res.status(503).json({ success: false, error: 'CREDITS_BACKEND_UNAVAILABLE' });
  }
}

// ---------------------------------------------------------------------------
// POST /api/credits/checkout — buat order dari katalog server + Snap.
// Body: { kind: 'SUBSCRIPTION'|'TOP_UP', itemId: string, workspaceId?: string }
// Jumlah TIDAK dibaca dari body sama sekali — harga selalu dari katalog.
// ---------------------------------------------------------------------------
async function checkoutHandler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = await readBody(req, res);
  if (body === undefined) return;
  const auth = await authenticateRequest(req);
  const service = buildBillingService();
  let result;
  try {
    result = await service.checkout({
      auth,
      workspaceId: requestedWorkspaceId(req),
      kind: typeof body?.kind === 'string' ? body.kind : '',
      itemId: typeof body?.itemId === 'string' ? body.itemId : '',
    });
  } catch {
    return sendBackendError(res);
  }
  return sendServiceResult(res, result);
}

// ---------------------------------------------------------------------------
// POST /api/credits/webhook — notifikasi HTTP Midtrans.
// Tanpa auth pengguna & tanpa syarat Origin (server-to-server); keamanan
// sepenuhnya dari verifikasi signature di dalam layanan. Balasan 200 untuk
// setiap notifikasi yang terverifikasi & tercatat (termasuk yang tidak
// memberi grant) agar Midtrans berhenti mengulang; 400 hanya untuk
// signature tidak valid; 503 bila layanan belum terkonfigurasi.
// ---------------------------------------------------------------------------
async function webhookHandler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = await readBody(req, res);
  if (body === undefined) return;
  const service = buildBillingService();
  let result;
  try {
    result = await service.handleNotification(body || {});
  } catch {
    // 500 agar Midtrans me-retry; notifikasi yang sama aman diproses ulang
    // (idempoten per order_id) bila backend pulih.
    return sendBackendError(res);
  }
  if (result.ok) {
    return res.status(200).json({
      success: true,
      received: true,
      matched: result.matched === true,
      granted: result.granted === true,
    });
  }
  return sendServiceResult(res, result);
}

// ---------------------------------------------------------------------------
// GET /api/credits/order?orderId=... — status order milik workspace pemanggil.
// ---------------------------------------------------------------------------
async function orderHandler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  const service = buildBillingService();
  let result;
  try {
    result = await service.getOrder({
      auth,
      workspaceId: requestedWorkspaceId(req),
      orderId: typeof req.query?.orderId === 'string' ? req.query.orderId : '',
    });
  } catch {
    return sendBackendError(res);
  }
  return sendServiceResult(res, result);
}

// ---------------------------------------------------------------------------
// GET /api/credits/subscription — status langganan workspace + plan efektif.
// ---------------------------------------------------------------------------
async function subscriptionHandler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const auth = await authenticateRequest(req);
  const service = buildBillingService();
  let result;
  try {
    result = await service.getSubscriptionState({
      auth,
      workspaceId: requestedWorkspaceId(req),
    });
  } catch {
    return sendBackendError(res);
  }
  return sendServiceResult(res, result);
}

// ---------------------------------------------------------------------------
// POST /api/credits/bootstrap — bootstrap workspace pasca-signup (Phase 2 W5).
// Dipanggil klien sekali per sesi terautentikasi pertama (lihat
// src/services/workspaceBootstrap.ts). Body DIABAIKAN TOTAL: tidak ada
// role/workspaceId dari klien yang dipercaya — identitas HANYA dari JWT
// terverifikasi, peran HANYA dari allowlist env server-side
// (EZRAB_BOOTSTRAP_OWNER_EMAILS). Idempoten: pemanggilan ulang mengembalikan
// keanggotaan yang sudah ada tanpa workspace kedua.
// ---------------------------------------------------------------------------
async function bootstrapHandler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const workspaceRepo = getWorkspaceRepository();
  if (!workspaceRepo) {
    return res.status(503).json({
      success: false,
      error: 'BOOTSTRAP_NOT_CONFIGURED',
      errorCode: 'BOOTSTRAP_NOT_CONFIGURED',
      message: 'Backend bootstrap belum aktif — Supabase service belum terkonfigurasi di server.',
    });
  }

  const auth = await authenticateRequest(req);
  const access = evaluateCreditAccess(auth);
  if (!access.allow) {
    return res.status(access.status).json({ success: false, error: access.error, errorCode: access.errorCode });
  }
  if (!auth.user || !auth.user.id) {
    return res.status(401).json({ success: false, error: 'AUTH_REQUIRED', errorCode: 'AUTH_REQUIRED' });
  }

  const cfg = getBootstrapServiceConfig();
  const service = createBootstrapService({
    workspaceRepo,
    billingRepo: getBillingRepository(),
    allowlist: cfg.ownerAllowlist,
  });
  let result;
  try {
    result = await service.bootstrap({
      userId: auth.user.id,
      email: auth.user.email ?? null,
    });
  } catch {
    return sendBackendError(res);
  }
  if (!result.ok) {
    return res.status(result.status || 500).json({
      success: false,
      error: result.error,
      errorCode: result.errorCode || result.error,
    });
  }
  return res.status(200).json({
    success: true,
    workspaceId: result.workspaceId,
    role: result.role,
    created: result.created === true,
    billingProvisioned: result.billingProvisioned === true,
    freeOnceGranted: result.freeOnceGranted === true,
    ownerAllowlistConfigured: result.ownerAllowlistConfigured === true,
    ...(result.billingNotConfigured ? { billingNotConfigured: true } : {}),
    ...(result.billingError ? { billingError: result.billingError } : {}),
  });
}

const ACTIONS = {
  balance: balanceHandler,
  checkout: checkoutHandler,
  webhook: webhookHandler,
  order: orderHandler,
  subscription: subscriptionHandler,
  bootstrap: bootstrapHandler,
};

export default async function handler(req, res) {
  const action = req.query?.action;
  const fn = action ? ACTIONS[action] : undefined;
  if (!fn) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Endpoint kredit tidak ditemukan.' });
  }
  try {
    return await fn(req, res);
  } catch {
    // Jaring pengaman terakhir (mis. authenticateRequest melempar):
    // 500 tersanitasi, tidak pernah crash tak tertangkap.
    if (res.headersSent) return undefined;
    return sendBackendError(res);
  }
}

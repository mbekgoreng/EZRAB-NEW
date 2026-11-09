/**
 * /api/credits/[action] — SATU Serverless Function untuk seluruh permukaan
 * kredit & billing server:
 *   GET  /api/credits/balance      — saldo kredit (Phase 2/3, TIDAK berubah)
 *   POST /api/credits/checkout     — buat order + transaksi Snap Midtrans
 *   POST /api/credits/webhook      — notifikasi Midtrans → grant (idempoten)
 *   GET  /api/credits/order        — status satu order milik workspace
 *   GET  /api/credits/subscription — status langganan + plan hak efektif
 *
 * KENAPA DIGABUNG (keputusan owner D9(a), 2026-11-09): plafon Vercel Hobby
 * 12 fungsi/deployment SUDAH PENUH (11 handler + middleware). Aksi billing
 * TIDAK boleh menjadi fungsi baru, jadi ia digabung ke handler credits yang
 * sudah ada — pola yang sama persis dengan api/access/[action].js dan
 * api/invitations/[action].js. File ini MENGGANTIKAN api/credits/balance.js;
 * handler balance di bawah ini verbatim dari file asalnya, URL publik
 * /api/credits/balance tidak berubah. Total handler tetap 11
 * (src/test/apiEndpointInventory.test.ts adalah penjaganya).
 *
 * KEJUJURAN STATUS: billing hanya hidup bila env server lengkap
 * (MIDTRANS_SERVER_KEY + Supabase service-role). Selama belum, aksi billing
 * menjawab 503 BILLING_NOT_CONFIGURED dan frontend tetap pada simulasi —
 * persis pola CREDITS_NOT_CONFIGURED yang sudah berlaku untuk balance.
 * Webhook TIDAK memakai auth pengguna: autentikasinya adalah signature
 * Midtrans yang diverifikasi di billingService sebelum apa pun diproses.
 */
import { createCreditEngine, createMemoryAdapter } from '../_lib/creditEngine.js';
import { applyCors, authenticateRequest, evaluateCreditAccess, readJsonBody } from '../_lib/security.js';
import { getBillingRepository } from '../_lib/billingStore.js';
import { getMidtransConfig } from '../_lib/midtrans.js';
import { createBillingService } from '../_lib/billingService.js';
import { requestedWorkspaceId } from '../_lib/billingAuthorization.js';

function getAdapter() {
  // Supabase adapter menyusul setelah migration di-apply + koneksi terverifikasi.
  // Saat ini: kembalikan null → endpoint lapor NOT_CONFIGURED dengan jujur.
  if (process.env.CREDITS_DB_CONFIGURED === 'true') {
    return createMemoryAdapter(); // placeholder — ganti Supabase adapter
  }
  return null;
}

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

// ---------------------------------------------------------------------------
// GET /api/credits/balance — verbatim dari api/credits/balance.js (Phase 2/3).
// Backend authoritative. Mengembalikan 503 jujur bila database kredit
// belum dikonfigurasi (frontend tetap memakai mock Phase 1).
// ---------------------------------------------------------------------------
async function balanceHandler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const adapter = getAdapter();
  if (!adapter) {
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
  const engine = createCreditEngine(adapter);
  const balance = await engine.getBalance(userId);
  return res.status(200).json({ success: true, balance, simulated: false });
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
  const result = await service.checkout({
    auth,
    workspaceId: requestedWorkspaceId(req),
    kind: typeof body?.kind === 'string' ? body.kind : '',
    itemId: typeof body?.itemId === 'string' ? body.itemId : '',
  });
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
  const result = await service.handleNotification(body || {});
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
  const result = await service.getOrder({
    auth,
    workspaceId: requestedWorkspaceId(req),
    orderId: typeof req.query?.orderId === 'string' ? req.query.orderId : '',
  });
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
  const result = await service.getSubscriptionState({
    auth,
    workspaceId: requestedWorkspaceId(req),
  });
  return sendServiceResult(res, result);
}

const ACTIONS = {
  balance: balanceHandler,
  checkout: checkoutHandler,
  webhook: webhookHandler,
  order: orderHandler,
  subscription: subscriptionHandler,
};

export default async function handler(req, res) {
  const action = req.query?.action;
  const fn = action ? ACTIONS[action] : undefined;
  if (!fn) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Endpoint kredit tidak ditemukan.' });
  }
  return fn(req, res);
}

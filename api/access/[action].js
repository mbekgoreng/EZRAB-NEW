/**
 * /api/access/[action] — SATU Serverless Function untuk gerbang akses
 * sementara: session | verify | logout.
 *
 * Digabung dari 2 file endpoint terpisah (api/access/session.js +
 * api/access/verify.js) agar total fungsi deployment ≤ 12 (batas plan
 * Hobby Vercel; middleware gerbang ikut terhitung). Vercel memetakan
 * segmen [action] dari URL, jadi URL publik tidak berubah:
 * GET /api/access/session dan POST /api/access/verify tetap sama.
 * Isi kedua handler di bawah ini verbatim dari file asalnya.
 * Aksi logout ditambahkan R2 (2026-10-28) di file yang sama supaya
 * jumlah fungsi tetap — bukan endpoint baru.
 */
import { applyCors, rateLimit, readJsonBody } from '../_lib/security.js';
import {
  checkAccessSession,
  getAccessConfig,
  accessCodeMatches,
  createSessionToken,
  buildSessionCookie,
  buildClearCookie,
} from '../_lib/accessGate.js';

/**
 * GET /api/access/session — report whether the caller holds a valid
 * temporary access session. Used by the SPA gate screen to decide its
 * initial state. Reveals nothing sensitive: no code, no secret, only
 * booleans derived from the caller's own cookie.
 */
async function sessionHandler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { configured } = getAccessConfig();
  const session = checkAccessSession(req);
  return res.status(200).json({
    success: true,
    configured,
    active: session.active,
  });
}

/**
 * POST /api/access/verify — validate the temporary dashboard access code.
 *
 * - Code comes ONLY from the server env (EZRAB_ACCESS_CODE). It is never
 *   logged, never echoed, and never compared in plain form (hashed,
 *   constant-time compare).
 * - Success mints a signed, stateless session cookie (see accessGate.js).
 * - Fail closed: unconfigured env -> 503 ACCESS_NOT_CONFIGURED, no cookie.
 * - Attempt limiting: per-IP token bucket from security.js (best effort on
 *   serverless — each instance keeps its own bucket; documented limit).
 */
async function verifyHandler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const config = getAccessConfig();
  if (!config.configured) {
    return res.status(503).json({
      success: false,
      error: 'ACCESS_NOT_CONFIGURED',
      message: 'Gerbang akses belum dikonfigurasi di server.',
    });
  }

  // Attempt limiting: 10 percobaan / 10 menit / IP (best-effort per instance).
  const rl = rateLimit(req, { limit: 10, windowMs: 10 * 60 * 1000, keyPrefix: 'rl-access' });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rl.resetMs / 1000)));
    return res.status(429).json({
      success: false,
      error: 'TOO_MANY_ATTEMPTS',
      message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.',
    });
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : await readJsonBody(req);
  } catch {
    return res.status(400).json({ success: false, error: 'Body tidak valid.' });
  }

  const candidate = typeof body?.code === 'string' ? body.code : '';
  if (!accessCodeMatches(config.code, candidate)) {
    return res.status(401).json({ success: false, error: 'INVALID_CODE', message: 'Kode salah.' });
  }

  const token = createSessionToken(config.secret);
  res.setHeader('Set-Cookie', buildSessionCookie(token, req));
  return res.status(200).json({ success: true });
}

/**
 * POST /api/access/logout — akhiri sesi gerbang akses (R2).
 *
 * - Menghapus cookie `ezrab_access` dengan atribut yang SAMA persis
 *   dengan saat cookie dibuat (Path=/, HttpOnly, SameSite=Lax,
 *   Secure-bila-HTTPS) lewat buildClearCookie — atribut yang tidak
 *   cocok tidak akan menghapus cookie di browser.
 * - Idempotent dan tidak butuh konfigurasi: berhasil (200) juga bila
 *   tidak ada cookie, cookie rusak, atau env belum dikonfigurasi.
 *   Alasannya: cookie basi harus bisa dibersihkan justru saat env
 *   dicabut, dan tidak ada secret yang terlibat sehingga tidak ada
 *   yang perlu di-rate-limit di sini.
 * - Tidak membaca body, tidak mencatat cookie, tidak mengubah model
 *   gerbang middleware (jalur /api/access/* memang dikecualikan dari
 *   gerbang, sehingga logout selalu terjangkau).
 */
async function logoutHandler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  res.setHeader('Set-Cookie', buildClearCookie(req));
  return res.status(200).json({ success: true });
}

const ACTIONS = { session: sessionHandler, verify: verifyHandler, logout: logoutHandler };

export default async function handler(req, res) {
  const action = req.query?.action;
  const fn = action ? ACTIONS[action] : undefined;
  if (!fn) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Endpoint akses tidak ditemukan.' });
  }
  return fn(req, res);
}

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
import { applyCors, rateLimit, readJsonBody } from '../_lib/security.js';
import {
  getAccessConfig,
  accessCodeMatches,
  createSessionToken,
  buildSessionCookie,
} from '../_lib/accessGate.js';

export default async function handler(req, res) {
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

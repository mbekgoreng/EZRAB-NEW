/**
 * GET /api/credits/usage — Riwayat pemakaian AI (Phase 3, section 7)
 *
 * Mengembalikan catatan usage meter untuk user. Label eksplisit:
 * Estimasi / Aktual terverifikasi / Menunggu rekonsiliasi / Data tidak tersedia.
 */
import { createUsageMeter } from '../_lib/usageMeter.js';
import { applyCors, authenticateRequest, evaluateCreditAccess } from '../_lib/security.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if (process.env.CREDITS_DB_CONFIGURED !== 'true') {
    return res.status(503).json({
      success: false,
      error: 'CREDITS_NOT_CONFIGURED',
      message: 'Backend usage meter belum aktif.',
    });
  }

  const auth = await authenticateRequest(req);
  const access = evaluateCreditAccess(auth);
  if (!access.allow) {
    return res.status(access.status).json({ success: false, error: access.error, errorCode: access.errorCode });
  }
  const userId = auth.user ? auth.user.id : 'anonymous';
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  const meter = createUsageMeter(null);
  const usage = await meter.getUsage(userId, limit);
  return res.status(200).json({ success: true, usage, simulated: false });
}

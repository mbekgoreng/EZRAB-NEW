/**
 * GET /api/credits/balance — Saldo kredit user (Phase 2/3)
 *
 * Backend authoritative. Mengembalikan 503 jujur bila database kredit
 * belum dikonfigurasi (frontend tetap memakai mock Phase 1).
 */
import { createCreditEngine, createMemoryAdapter } from '../_lib/creditEngine.js';
import { applyCors, authenticateRequest, evaluateCreditAccess } from '../_lib/security.js';

function getAdapter() {
  // Supabase adapter menyusul setelah migration di-apply + koneksi terverifikasi.
  // Saat ini: kembalikan null → endpoint lapor NOT_CONFIGURED dengan jujur.
  if (process.env.CREDITS_DB_CONFIGURED === 'true') {
    return createMemoryAdapter(); // placeholder — ganti Supabase adapter
  }
  return null;
}

export default async function handler(req, res) {
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
  const userId = auth.user ? auth.user.id : 'anonymous';
  const engine = createCreditEngine(adapter);
  const balance = await engine.getBalance(userId);
  return res.status(200).json({ success: true, balance, simulated: false });
}

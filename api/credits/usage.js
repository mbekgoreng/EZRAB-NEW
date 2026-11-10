/**
 * GET /api/credits/usage — Riwayat pemakaian AI dari ledger batch gen-2
 * (D18(ii), 2026-11-10; menggantikan meter gen-1 placeholder).
 *
 * Mengembalikan operasi usage ledger milik akun billing workspace
 * pemanggil, terbaru dulu. Label eksplisit per baris: status
 * SETTLED → 'actual', RELEASED → 'failed', selain itu 'pending'
 * (UI: "Menunggu rekonsiliasi"); biaya provider tidak disimpan ledger
 * sehingga cost_status jujur 'UNDETERMINED'.
 *
 * 503 jujur bila repository Supabase server belum terkonfigurasi —
 * TIDAK ada fallback memori/simulasi. Flag lama CREDITS_DB_CONFIGURED
 * tidak lagi menentukan endpoint ini.
 */
import { applyCors, authenticateRequest, evaluateCreditAccess } from '../_lib/security.js';
import { getBillingRepository } from '../_lib/billingStore.js';
import { requestedWorkspaceId } from '../_lib/billingAuthorization.js';
import {
  readUsageHistory,
  resolveWorkspaceAccess,
} from '../_lib/billingAccountService.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const repo = getBillingRepository();
  if (!repo) {
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
  // Phase 5.3 (audit R-01): TIDAK ada fallback 'anonymous' — lihat balance.
  if (!auth.user || !auth.user.id) {
    return res.status(401).json({ success: false, error: 'AUTH_REQUIRED', errorCode: 'AUTH_REQUIRED' });
  }
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  try {
    const authz = await resolveWorkspaceAccess(repo, auth, requestedWorkspaceId(req), 'billing:read');
    if (!authz.ok) {
      return res.status(authz.status).json({ success: false, error: authz.error, errorCode: authz.errorCode });
    }
    // Endpoint riwayat bersifat baca-saja: akun yang belum terprovisioning
    // berarti riwayat kosong — akun TIDAK dibuat di sini.
    const account = await repo.getBillingAccountByWorkspace(authz.workspaceId);
    if (!account) {
      return res.status(200).json({ success: true, usage: [], simulated: false });
    }
    const usage = await readUsageHistory(repo, account.id, limit);
    return res.status(200).json({ success: true, usage, simulated: false });
  } catch {
    return res.status(503).json({ success: false, error: 'CREDITS_BACKEND_UNAVAILABLE' });
  }
}

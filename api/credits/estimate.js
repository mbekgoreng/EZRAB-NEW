/**
 * POST /api/credits/estimate — Estimasi kredit server-side (Phase 3)
 *
 * Menghitung estimasi dari tarif draft yang dikelola server.
 * Frontend TIDAK boleh menghitung sendiri untuk keputusan debit —
 * angka ini hanya untuk tampilan; debit aktual ditentukan server.
 */
import { estimateCredits } from '../_lib/creditPricing.js';
import { applyCors, authenticateRequest, evaluateCreditAccess, rateLimit, rateLimitIdentity } from '../_lib/security.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  // G4 (Phase B, 2026-11-20): endpoint ini sebelumnya TANPA auth dan TANPA
  // rate limit. Pola yang sama seperti balance/usage: JWT Supabase
  // terverifikasi wajib (fail-closed); mode degraded/token tanpa identitas
  // ditolak evaluateCreditAccess (audit R-01). Tidak ada pemanggil klien
  // hari ini (grep: hanya apiEndpointInventory yang menyebut URL ini),
  // jadi tidak ada UI yang rusak oleh pagar ini.
  const auth = await authenticateRequest(req);
  const access = evaluateCreditAccess(auth);
  if (!access.allow) {
    return res.status(access.status).json({ success: false, error: access.error, errorCode: access.errorCode });
  }
  // Penjaga eksplisit yang sama seperti balance/usage: gagal tertutup bila
  // jaminan identitas evaluateCreditAccess tidak terpenuhi.
  if (!auth.user || !auth.user.id) {
    return res.status(401).json({ success: false, error: 'AUTH_REQUIRED', errorCode: 'AUTH_REQUIRED' });
  }
  // G5: 30/mnt per pengguna terverifikasi (else per IP) — sama seperti
  // /api/market/search. Sesudah auth agar kunci memakai identitas
  // pengguna, bukan IP bersama.
  const rl = rateLimit(req, { limit: 30, key: 'rl-credits-estimate:' + rateLimitIdentity(req, auth) });
  if (!rl.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak permintaan. Coba lagi sebentar.',
      errorCode: 'RATE_LIMITED',
      retryAfterMs: rl.resetMs,
    });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ success: false, error: 'Body tidak valid' });
  }
  const feature = String(body.feature || '');
  const result = estimateCredits(feature);
  if (!result.ok) {
    return res.status(400).json({ success: false, error: result.error });
  }
  return res.status(200).json({ success: true, ...result, simulated: false });
}

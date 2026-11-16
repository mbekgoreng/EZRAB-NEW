/**
 * GET /api/ai/engine-status — health check.
 * Phase 2 hardening: CORS allowlist (was `*`), rate limiting.
 * Returns key AVAILABILITY booleans only — never key values, and (audit
 * 2026-10-31, F6) no longer exact key COUNTS: counts told an anonymous
 * caller exactly how much provider quota sits behind each provider.
 * The only consumer (UnifiedSettingsView) reads `status`, not counts.
 * MASKING (2026-11-16): field `providers` dan `modes` DIHAPUS dari
 * respons — keduanya membocorkan nama provider/model asli ke PUBLIK
 * anonim (endpoint ini sengaja publik, tanpa auth). Respons kini hanya
 * { success, status, time }; satu-satunya konsumen hanya membaca status.
 */
import { applyCors, rateLimit } from '../_lib/security.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rl = rateLimit(req, { limit: 120, keyPrefix: 'rl-status' });
  if (!rl.allowed) {
    return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan.' });
  }

  let gemini = 0, atria = 0, dahl = 0, geminiOai = 0, river = 0;
  for (let i = 1; i <= 6; i++) if ((process.env['GEMINI_API_KEY_' + i] || '').trim()) gemini++;
  for (let i = 1; i <= 14; i++) if ((process.env['ATRIA_API_KEY_' + i] || '').trim()) atria++;
  for (let i = 1; i <= 80; i++) if ((process.env['DAHL_API_KEY_' + i] || '').trim()) dahl++;
  for (let i = 1; i <= 12; i++) if ((process.env['GEMINI_OAI_KEY_' + i] || '').trim()) geminiOai++;
  for (let i = 1; i <= 10; i++) if ((process.env['RIVER_API_KEY_' + i] || '').trim()) river++;
  const zyrouter = !!((process.env.ZYROUTER_API_KEY || '').trim() || (process.env.ZROUTER_API_KEY || '').trim());
  // SECURITY (P0 fix): do NOT disclose auth posture (authMode / degradedMode)
  // publicly — it tells an attacker whether auth is enforced. Availability
  // counts are enough for the UI health check.
  const anyKeys = gemini + atria + dahl + geminiOai + river + (zyrouter ? 1 : 0) > 0;
  return res.status(200).json({
    success: true,
    status: anyKeys ? 'ready' : 'no_keys',
    time: new Date().toISOString(),
  });
}

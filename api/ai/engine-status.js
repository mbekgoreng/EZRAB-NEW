/**
 * GET /api/ai/engine-status — health check.
 * Phase 2 hardening: CORS allowlist (was `*`), rate limiting.
 * Returns key COUNTS only — never key values.
 */
import { applyCors, rateLimit } from '../_lib/security.js';
import { isSupabaseConfigured } from '../_lib/supabaseAuth.js';

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

  let gemini = 0, atria = 0;
  for (let i = 1; i <= 6; i++) if ((process.env['GEMINI_API_KEY_' + i] || '').trim()) gemini++;
  for (let i = 1; i <= 14; i++) if ((process.env['ATRIA_API_KEY_' + i] || '').trim()) atria++;
  const zyrouter = !!((process.env.ZYROUTER_API_KEY || '').trim() || (process.env.ZROUTER_API_KEY || '').trim());
  const gatewayToken = !!String(process.env.AI_GATEWAY_TOKEN || '').trim();
  const supabase = isSupabaseConfigured();
  const authMode = supabase ? 'jwt' : gatewayToken ? 'token' : 'degraded';

  return res.status(200).json({
    success: true,
    status: gemini + atria + (zyrouter ? 1 : 0) > 0 ? 'ready' : 'no_keys',
    providers: { gemini_keys: gemini, zyrouter, atria_keys: atria },
    modes: { fast: 'gemini-3.5-flash-lite', advanced: 'geminiflash-3.8' },
    security: { authMode, tokenAuthEnforced: authMode !== 'degraded', degradedMode: authMode === 'degraded' },
    time: new Date().toISOString(),
  });
}

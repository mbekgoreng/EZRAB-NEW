/**
 * GET /api/ai/multi-provider/providers
 * Phase 2 hardening: CORS allowlist (was `*`), rate limiting.
 * Returns provider availability only — never keys.
 */
import { applyCors, rateLimit } from '../../_lib/security.js';

export default async function handler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rl = rateLimit(req, { limit: 120, keyPrefix: 'rl-providers' });
  if (!rl.allowed) {
    return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan.' });
  }

  const providers = [];
  for (let i = 1; i <= 6; i++) {
    if ((process.env['GEMINI_API_KEY_' + i] || '').trim()) {
      providers.push({ id: 'gemini', label: 'Google Gemini', models: ['gemini-3.5-flash-lite'], available: true });
      break;
    }
  }
  if ((process.env.ZYROUTER_API_KEY || '').trim() || (process.env.ZROUTER_API_KEY || '').trim()) {
    providers.push({ id: 'zyrouter', label: 'ZyRouter', models: ['geminiflash-3.8'], available: true });
  }
  for (let i = 1; i <= 14; i++) {
    if ((process.env['ATRIA_API_KEY_' + i] || '').trim()) {
      providers.push({ id: 'atria', label: 'Atria', models: ['Atria-Dawn-Preview'], available: true });
      break;
    }
  }
  return res.status(200).json({ success: true, providers });
}

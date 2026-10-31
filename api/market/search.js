/**
 * API: POST /api/market/search
 * Proxy pencarian harga pasar server-side (kredensial tidak ke browser).
 * Body: { materialName, spec, baseUnit, region?, limit? }
 */
import { createMarketSearchProvider } from '../_lib/marketSearch/serperProvider.js';
import { applyCors, authenticateRequest, rateLimit } from '../_lib/security.js';

export default async function handler(req, res) {
  // Defense-in-depth (audit 2026-10-31, F4): handler ini sebelumnya TANPA
  // proteksi apa pun dan hanya selamat karena middleware menutup
  // /api/market/*. Bila matcher middleware suatu hari berubah/terlewati,
  // endpoint ini menjadi proxy terbuka yang membakar kuota Serper berbayar.
  // Tegakkan pagar yang sama seperti handler lain DI SINI juga.
  if (!applyCors(req, res)) {
    return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = await authenticateRequest(req);
  if (!auth.allow) {
    return res.status(auth.status || 401).json({ error: auth.errorCode || 'AUTH_REQUIRED' });
  }
  const rl = rateLimit(req, { limit: 30, keyPrefix: 'rl-market' });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }

  const { materialName, spec, baseUnit, region, limit } = req.body || {};
  if (!materialName || !baseUnit) {
    return res.status(400).json({ error: 'MISSING_PARAMS: materialName dan baseUnit wajib.' });
  }

  try {
    const provider = createMarketSearchProvider();
    const result = await provider.search({
      materialName: String(materialName).slice(0, 120),
      spec: spec || { category: 'lainnya', keyAttributes: {} },
      baseUnit: String(baseUnit).slice(0, 20),
      region: region ? String(region).slice(0, 40) : undefined,
      limit: Math.min(Number(limit) || 10, 20),
    });

    // Jangan bocorkan error internal mentah; kategorikan untuk UI.
    return res.status(200).json({
      candidates: result.candidates,
      isLive: result.isLive,
      searchedAt: result.searchedAt,
      limitations: result.limitations,
      errorCode: result.error ? result.error.split(':')[0] : null,
      errorMessage: result.error || null,
      provider: provider.capabilities.name,
    });
  } catch (e) {
    // Jangan bocorkan pesan error internal mentah ke klien (nama env dsb.).
    return res.status(500).json({ error: 'SEARCH_FAILED' });
  }
};

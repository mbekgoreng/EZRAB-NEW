/**
 * API: POST /api/market/search
 * Proxy pencarian harga pasar server-side (kredensial tidak ke browser).
 * Body: { materialName, spec, baseUnit, region?, limit? }
 */
const { createMarketSearchProvider } = require('../_lib/marketSearch/serperProvider');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
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
    return res.status(500).json({ error: 'SEARCH_FAILED', errorMessage: e?.message });
  }
};

/** GET /api/ai/multi-provider/providers — self-contained, no imports */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

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
};

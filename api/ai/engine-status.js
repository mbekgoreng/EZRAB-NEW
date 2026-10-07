/** GET /api/ai/engine-status — health check (self-contained, no imports) */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let gemini = 0, atria = 0;
  for (let i = 1; i <= 6; i++) if ((process.env['GEMINI_API_KEY_' + i] || '').trim()) gemini++;
  for (let i = 1; i <= 14; i++) if ((process.env['ATRIA_API_KEY_' + i] || '').trim()) atria++;
  const zyrouter = !!((process.env.ZYROUTER_API_KEY || '').trim() || (process.env.ZROUTER_API_KEY || '').trim());

  return res.status(200).json({
    success: true,
    status: gemini + atria + (zyrouter ? 1 : 0) > 0 ? 'ready' : 'no_keys',
    providers: { gemini_keys: gemini, zyrouter, atria_keys: atria },
    modes: { fast: 'gemini-3.5-flash-lite', advanced: 'geminiflash-3.8' },
    time: new Date().toISOString(),
  });
};
// trigger rebuild 1791400122

/** GET /api/ai/engine-status — health check for AI backend */
import { corsHeaders } from '../_core';

interface Req { method?: string; }
interface Res { setHeader(n: string, v: string): void; status(c: number): { json(o: unknown): void; end(): void }; }

function hasKeys(prefix: string, count: number): number {
  let n = 0;
  for (let i = 1; i <= count; i++) {
    if (process.env[`${prefix}_${i}`]?.trim()) n++;
  }
  return n;
}

export default async function handler(req: Req, res: Res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gemini = hasKeys('GEMINI_API_KEY', 6);
  const zyrouter = process.env.ZYROUTER_API_KEY?.trim() || process.env.ZROUTER_API_KEY?.trim() ? 1 : 0;
  const atria = hasKeys('ATRIA_API_KEY', 14);

  return res.status(200).json({
    success: true,
    status: gemini + zyrouter + atria > 0 ? 'ready' : 'no_keys',
    providers: { gemini_keys: gemini, zyrouter: !!zyrouter, atria_keys: atria },
    modes: { fast: 'gemini-3.5-flash-lite', advanced: 'geminiflash-3.8' },
    time: new Date().toISOString(),
  });
}

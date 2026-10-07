/** GET /api/ai/multi-provider/providers — list available providers (aliases only, no keys) */
import { corsHeaders } from '../../_core';

interface Req { method?: string; }
interface Res { setHeader(n: string, v: string): void; status(c: number): { json(o: unknown): void; end(): void }; }

function hasKeys(prefix: string, count: number): boolean {
  for (let i = 1; i <= count; i++) {
    if (process.env[`${prefix}_${i}`]?.trim()) return true;
  }
  return false;
}

export default async function handler(req: Req, res: Res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const providers = [];
  if (hasKeys('GEMINI_API_KEY', 6)) providers.push({ id: 'gemini', label: 'Google Gemini', models: ['gemini-3.5-flash-lite'], available: true });
  if (process.env.ZYROUTER_API_KEY?.trim() || process.env.ZROUTER_API_KEY?.trim()) {
    providers.push({ id: 'zyrouter', label: 'ZyRouter', models: ['geminiflash-3.8'], available: true });
  }
  if (hasKeys('ATRIA_API_KEY', 14)) providers.push({ id: 'atria', label: 'Atria', models: ['Atria-Dawn-Preview'], available: true });

  return res.status(200).json({ success: true, providers });
}

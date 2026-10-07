/** POST /api/ai/tools/execute — used by AiToolsProviderClient (browser) */
import { executeAI, corsHeaders, productIdToMode } from '../_core';

interface Req { method?: string; body: unknown; }
interface Res { setHeader(n: string, v: string): void; status(c: number): { json(o: unknown): void; end(): void }; }

export default async function handler(req: Req, res: Res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as Record<string, unknown>;
  const productId = String(body.productId ?? 'EZRAB_AI');
  const prompt = String(body.prompt ?? '');
  if (!prompt.trim()) return res.status(400).json({ success: false, error: 'prompt required', code: 'BAD_REQUEST' });

  const result = await executeAI({
    message: prompt,
    mode: productIdToMode(productId),
    systemPrompt: String(body.systemPrompt ?? ''),
    temperature: Number(body.temperature ?? 0.1),
    maxTokens: Math.min(Number(body.maxTokens ?? 6000), 8000),
    jsonMode: Boolean(body.jsonMode),
  });

  if (result.ok) {
    return res.status(200).json({
      success: true, content: result.content, structured: null,
      model: result.model, provider: result.provider, requestId: result.requestId,
    });
  }
  return res.status(502).json({ success: false, error: 'AI tidak tersedia', code: 'PROVIDER_ERROR', detail: result.error, requestId: result.requestId });
}

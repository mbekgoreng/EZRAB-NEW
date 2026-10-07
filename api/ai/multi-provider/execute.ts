/** POST /api/ai/multi-provider/execute — used by aiProviderRouter, zyrouterClient */
import { executeAI, corsHeaders } from '../../_core';

interface Req { method?: string; body: unknown; }
interface Res { setHeader(n: string, v: string): void; status(c: number): { json(o: unknown): void; end(): void }; }

export default async function handler(req: Req, res: Res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as Record<string, unknown>;
  // Support multiple frontend shapes
  const message = String(body.message ?? body.prompt ?? body.input ?? '');
  if (!message.trim()) return res.status(400).json({ success: false, error: 'message/prompt required' });

  const capMode = String(body.capabilityMode ?? body.mode ?? '');
  const mode: 'fast' | 'advanced' = capMode.includes('advanced') || capMode.includes('detail') ? 'advanced' : 'fast';

  const result = await executeAI({
    message,
    mode,
    systemPrompt: String(body.systemPrompt ?? ''),
    temperature: Number(body.temperature ?? 0.3),
    maxTokens: Math.min(Number(body.maxTokens ?? body.max_tokens ?? 4000), 8000),
    jsonMode: Boolean(body.jsonMode ?? (body.response_format !== undefined)),
  });

  if (result.ok) {
    return res.status(200).json({
      success: true, content: result.content, text: result.content,
      model: result.model, provider: result.provider, requestId: result.requestId,
    });
  }
  return res.status(502).json({ success: false, error: 'AI tidak tersedia', code: 'PROVIDER_ERROR', requestId: result.requestId });
}

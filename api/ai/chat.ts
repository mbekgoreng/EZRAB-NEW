/**
 * POST /api/ai/chat — simple chat endpoint (also used by tests).
 * Delegates to shared core.
 */
import { executeAI, corsHeaders } from './_core';

interface Req { method?: string; body: unknown; }
interface Res { setHeader(n: string, v: string): void; status(c: number): { json(o: unknown): void; end(): void }; }

export default async function handler(req: Req, res: Res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as Record<string, unknown>;
  const message = String(body.message ?? '');
  if (!message.trim()) return res.status(400).json({ success: false, error: 'message wajib diisi', code: 'BAD_REQUEST' });

  const result = await executeAI({
    message,
    mode: body.mode === 'advanced' ? 'advanced' : 'fast',
    systemPrompt: String(body.systemPrompt ?? ''),
    temperature: Math.min(Math.max(Number(body.temperature ?? 0.3), 0), 1),
    maxTokens: Math.min(Math.max(Number(body.maxTokens ?? 4000), 100), 8000),
    jsonMode: Boolean(body.jsonMode),
  });

  if (result.ok) {
    return res.status(200).json({
      success: true, content: result.content, model: result.model,
      provider: result.provider, mode: body.mode === 'advanced' ? 'advanced' : 'fast',
      requestId: result.requestId,
    });
  }
  return res.status(502).json({ success: false, error: 'AI sedang tidak tersedia.', code: 'PROVIDER_ERROR', requestId: result.requestId });
}

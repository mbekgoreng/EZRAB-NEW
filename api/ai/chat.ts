/**
 * Vercel Serverless Function: POST /api/ai/chat
 *
 * Production AI backend for EZRAB. Uses official Google Gemini API directly.
 * Replaces the Vite dev-middleware that only worked on localhost.
 *
 * Env vars required:
 *   GEMINI_API_KEY_1 (primary), GEMINI_API_KEY_2..6 (fallbacks)
 *
 * Request: { message, systemPrompt?, model?, temperature?, maxTokens?, jsonMode? }
 * Response: { success, content, model, requestId } or { success: false, error, code }
 */

// Minimal Vercel types (avoid @vercel/node dependency)
interface VercelRequest {
  method?: string;
  body: unknown;
}
interface VercelResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(obj: unknown): void; end(): void };
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Official model names (NOT the invented zyrouter ids)
const DEFAULT_MODEL = 'gemini-2.0-flash-lite';
const ALLOWED_MODELS = new Set([
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]);

function getApiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (k) keys.push(k);
  }
  // Also support single-key convention
  const single = process.env.GEMINI_API_KEY?.trim();
  if (single && !keys.includes(single)) keys.unshift(single);
  return keys;
}

function rid(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = rid();

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED', requestId });
  }

  const keys = getApiKeys();
  if (keys.length === 0) {
    return res.status(500).json({
      success: false,
      error: 'AI belum dikonfigurasi. Hubungi administrator untuk memasang GEMINI_API_KEY.',
      code: 'NO_API_KEY',
      requestId,
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  const message = String(body.message ?? '').slice(0, 8000);
  if (!message.trim()) {
    return res.status(400).json({ success: false, error: 'message wajib diisi', code: 'BAD_REQUEST', requestId });
  }

  const model = ALLOWED_MODELS.has(String(body.model)) ? String(body.model) : DEFAULT_MODEL;
  const systemPrompt = String(body.systemPrompt ?? '').slice(0, 4000);
  const temperature = Math.min(Math.max(Number(body.temperature ?? 0.3), 0), 1);
  const maxTokens = Math.min(Math.max(Number(body.maxTokens ?? 4000), 100), 8000);
  const jsonMode = Boolean(body.jsonMode);

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: `[SYSTEM]\n${systemPrompt}` }] });
    contents.push({ role: 'model', parts: [{ text: 'Baik, saya mengerti.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  // Try keys in order (failover)
  let lastError = '';
  for (const key of keys) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const r = await fetch(
        `${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        lastError = `Gemini ${r.status}: ${errText.slice(0, 200)}`;
        // 429/5xx → try next key; 4xx → don't bother retrying other keys
        if (r.status === 429 || r.status >= 500) continue;
        break;
      }

      const data = (await r.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) {
        lastError = 'Empty response from model';
        continue;
      }
      return res.status(200).json({ success: true, content: text, model, requestId });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
  }

  return res.status(502).json({
    success: false,
    error: 'AI sedang tidak tersedia. Coba lagi beberapa saat.',
    code: 'PROVIDER_ERROR',
    detail: lastError.slice(0, 300),
    requestId,
  });
}

/**
 * Vercel Serverless Function: POST /api/ai/chat
 *
 * Production AI backend for EZRAB.
 *
 * Modes (per Director order 2026-10-08):
 *   fast     → gemini-3.5-flash-lite (Google direct)
 *   advanced → geminiflash-3.8 (ZyRouter gateway)
 *   Fallback chain: fast → advanced → atria
 *
 * Env vars:
 *   GEMINI_API_KEY_1..6  (Google direct)
 *   ZYROUTER_API_KEY / ZROUTER_API_KEY (ZyRouter gateway)
 *   ATRIA_API_KEY_1..14 (Atria fallback)
 *
 * Request: { message, mode?: 'fast'|'advanced', systemPrompt?, temperature?, maxTokens?, jsonMode? }
 * Response: { success, content, model, provider, requestId } or { success:false, error, code }
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
const ZYROUTER_BASE = 'https://api.zyrouter.com/v1';
const ATRIA_BASE = 'https://api.atria-asi.ai/v1';

// Model routing per Director order
const FAST_MODEL = 'gemini-3.5-flash-lite';       // Google direct
const ADVANCED_MODEL = 'geminiflash-3.8';          // ZyRouter gateway
const ATRIA_MODEL = 'Atria-Dawn-Preview';          // Atria fallback

function getEnvKeys(prefix: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= count; i++) {
    const k = process.env[`${prefix}_${i}`]?.trim();
    if (k) keys.push(k);
  }
  return keys;
}

function getZyrouterKey(): string {
  return process.env.ZYROUTER_API_KEY?.trim() || process.env.ZROUTER_API_KEY?.trim() || '';
}

function rid(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ChatResult {
  ok: boolean;
  content?: string;
  model?: string;
  provider?: string;
  error?: string;
}

/** Call Google Gemini direct API */
async function callGemini(key: string, model: string, message: string, systemPrompt: string, temperature: number, maxTokens: number, jsonMode: boolean): Promise<ChatResult> {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: `[SYSTEM]\n${systemPrompt}` }] });
    contents.push({ role: 'model', parts: [{ text: 'Baik, saya mengerti.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const r = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, error: `Gemini ${r.status}: ${t.slice(0, 150)}` };
    }
    const data = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) return { ok: false, error: 'Empty response' };
    return { ok: true, content: text, model, provider: 'gemini' };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Call OpenAI-compatible endpoint (ZyRouter, Atria) */
async function callOpenAICompatible(baseUrl: string, key: string, model: string, provider: string, message: string, systemPrompt: string, temperature: number, maxTokens: number, jsonMode: boolean): Promise<ChatResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: message });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, error: `${provider} ${r.status}: ${t.slice(0, 150)}` };
    }
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) return { ok: false, error: 'Empty response' };
    return { ok: true, content: text, model, provider };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = rid();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED', requestId });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : ((req.body ?? {}) as Record<string, unknown>);
  const message = String(body.message ?? '').slice(0, 8000);
  if (!message.trim()) {
    return res.status(400).json({ success: false, error: 'message wajib diisi', code: 'BAD_REQUEST', requestId });
  }

  const mode = body.mode === 'advanced' ? 'advanced' : 'fast';
  const systemPrompt = String(body.systemPrompt ?? '').slice(0, 4000);
  const temperature = Math.min(Math.max(Number(body.temperature ?? 0.3), 0), 1);
  const maxTokens = Math.min(Math.max(Number(body.maxTokens ?? 4000), 100), 8000);
  const jsonMode = Boolean(body.jsonMode);

  const geminiKeys = getEnvKeys('GEMINI_API_KEY', 6);
  const zyrouterKey = getZyrouterKey();
  const atriaKeys = getEnvKeys('ATRIA_API_KEY', 14);

  const errors: string[] = [];

  // Build attempt chain based on mode
  // fast: gemini fast → zyrouter advanced → atria
  // advanced: zyrouter advanced → gemini fast → atria
  const attempts: Array<() => Promise<ChatResult>> = [];

  if (mode === 'advanced') {
    if (zyrouterKey) attempts.push(() => callOpenAICompatible(ZYROUTER_BASE, zyrouterKey, ADVANCED_MODEL, 'zyrouter', message, systemPrompt, temperature, maxTokens, jsonMode));
    for (const k of geminiKeys) attempts.push(() => callGemini(k, FAST_MODEL, message, systemPrompt, temperature, maxTokens, jsonMode));
  } else {
    for (const k of geminiKeys) attempts.push(() => callGemini(k, FAST_MODEL, message, systemPrompt, temperature, maxTokens, jsonMode));
    if (zyrouterKey) attempts.push(() => callOpenAICompatible(ZYROUTER_BASE, zyrouterKey, ADVANCED_MODEL, 'zyrouter', message, systemPrompt, temperature, maxTokens, jsonMode));
  }
  // Atria as final fallback
  for (const k of atriaKeys.slice(0, 3)) {
    attempts.push(() => callOpenAICompatible(ATRIA_BASE, k, ATRIA_MODEL, 'atria', message, systemPrompt, temperature, maxTokens, jsonMode));
  }

  if (attempts.length === 0) {
    return res.status(500).json({
      success: false,
      error: 'AI belum dikonfigurasi. Hubungi administrator.',
      code: 'NO_API_KEY',
      requestId,
    });
  }

  for (const attempt of attempts) {
    const result = await attempt();
    if (result.ok) {
      return res.status(200).json({
        success: true,
        content: result.content,
        model: result.model,
        provider: result.provider,
        mode,
        requestId,
      });
    }
    errors.push(result.error ?? 'unknown');
  }

  return res.status(502).json({
    success: false,
    error: 'AI sedang tidak tersedia. Coba lagi beberapa saat.',
    code: 'PROVIDER_ERROR',
    detail: errors.slice(0, 3).join(' | ').slice(0, 300),
    requestId,
  });
}

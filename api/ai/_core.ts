/**
 * Shared AI core for Vercel serverless functions.
 * Maps productId → mode, handles failover across providers.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ZYROUTER_BASE = 'https://api.zyrouter.com/v1';
const ATRIA_BASE = 'https://api.atria-asi.ai/v1';

const FAST_MODEL = 'gemini-3.5-flash-lite';
const ADVANCED_MODEL = 'geminiflash-3.8';
const ATRIA_MODEL = 'Atria-Dawn-Preview';

// productId → mode mapping
export function productIdToMode(productId: string): 'fast' | 'advanced' {
  if (productId === 'DED_AI_DETAIL' || productId === 'DOKUMEN_AI') return 'advanced';
  return 'fast'; // EZRAB_AI, DED_AI_FAST default to fast
}

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

interface ChatResult {
  ok: boolean;
  content?: string;
  model?: string;
  provider?: string;
  error?: string;
}

async function callGemini(key: string, model: string, message: string, systemPrompt: string, temperature: number, maxTokens: number, jsonMode: boolean): Promise<ChatResult> {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: `[SYSTEM]\n${systemPrompt}` }] });
    contents.push({ role: 'model', parts: [{ text: 'Baik, saya mengerti.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const r = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens, ...(jsonMode ? { responseMimeType: 'application/json' } : {}) },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) return { ok: false, error: `Gemini ${r.status}` };
    const data = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) return { ok: false, error: 'Empty' };
    return { ok: true, content: text, model, provider: 'gemini' };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function callOpenAICompatible(baseUrl: string, key: string, model: string, provider: string, message: string, systemPrompt: string, temperature: number, maxTokens: number, jsonMode: boolean): Promise<ChatResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: message });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) return { ok: false, error: `${provider} ${r.status}` };
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) return { ok: false, error: 'Empty' };
    return { ok: true, content: text, model, provider };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface AIRequest {
  message: string;
  mode: 'fast' | 'advanced';
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function executeAI(req: AIRequest): ChatResult & { requestId: string } {
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const { message, mode, systemPrompt = '', temperature = 0.3, maxTokens = 4000, jsonMode = false } = req;

  const geminiKeys = getEnvKeys('GEMINI_API_KEY', 6);
  const zyrouterKey = getZyrouterKey();
  const atriaKeys = getEnvKeys('ATRIA_API_KEY', 14);

  const attempts: Array<() => Promise<ChatResult>> = [];
  if (mode === 'advanced') {
    if (zyrouterKey) attempts.push(() => callOpenAICompatible(ZYROUTER_BASE, zyrouterKey, ADVANCED_MODEL, 'zyrouter', message, systemPrompt, temperature, maxTokens, jsonMode));
    for (const k of geminiKeys) attempts.push(() => callGemini(k, FAST_MODEL, message, systemPrompt, temperature, maxTokens, jsonMode));
  } else {
    for (const k of geminiKeys) attempts.push(() => callGemini(k, FAST_MODEL, message, systemPrompt, temperature, maxTokens, jsonMode));
    if (zyrouterKey) attempts.push(() => callOpenAICompatible(ZYROUTER_BASE, zyrouterKey, ADVANCED_MODEL, 'zyrouter', message, systemPrompt, temperature, maxTokens, jsonMode));
  }
  for (const k of atriaKeys.slice(0, 3)) {
    attempts.push(() => callOpenAICompatible(ATRIA_BASE, k, ATRIA_MODEL, 'atria', message, systemPrompt, temperature, maxTokens, jsonMode));
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    const result = await attempt();
    if (result.ok) return { ...result, requestId };
    errors.push(result.error ?? '?');
  }
  return { ok: false, error: errors.slice(0, 3).join(' | '), requestId };
}

export function corsHeaders(res: { setHeader(n: string, v: string): void }) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

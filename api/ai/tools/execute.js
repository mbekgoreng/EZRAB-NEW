/** POST /api/ai/tools/execute */
/**
 * Shared AI logic inlined (self-contained, no cross-file imports).
 * Used by: chat.js, tools/execute.js, multi-provider/execute.js
 */
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ZYROUTER_BASE = 'https://api.zyrouter.com/v1';
const ATRIA_BASE = 'https://api.atria-asi.ai/v1';
const FAST_MODEL = 'gemini-3.5-flash-lite';
const ADVANCED_MODEL = 'geminiflash-3.8';
const ATRIA_MODEL = 'Atria-Dawn-Preview';

function envKeys(prefix, count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const k = (process.env[prefix + '_' + i] || '').trim();
    if (k) out.push(k);
  }
  return out;
}

function zyrouterKey() {
  return (process.env.ZYROUTER_API_KEY || '').trim() || (process.env.ZROUTER_API_KEY || '').trim() || '';
}

async function callGemini(key, model, message, systemPrompt, temperature, maxTokens, jsonMode) {
  const contents = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: '[SYSTEM]\n' + systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Baik, saya mengerti.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 55000);
  try {
    const r = await fetch(GEMINI_BASE + '/models/' + model + ':generateContent?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: Object.assign({ temperature, maxOutputTokens: maxTokens }, jsonMode ? { responseMimeType: 'application/json' } : {}),
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, error: 'Gemini ' + r.status };
    const d = await r.json();
    const text = ((d.candidates || [])[0] || {}).content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) return { ok: false, error: 'Empty' };
    return { ok: true, content: text, model, provider: 'gemini' };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function callOAI(base, key, model, provider, message, systemPrompt, temperature, maxTokens, jsonMode) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: message });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 55000);
  try {
    const r = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(Object.assign(
        { model, messages, temperature, max_tokens: maxTokens },
        jsonMode ? { response_format: { type: 'json_object' } } : {}
      )),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, error: provider + ' ' + r.status };
    const d = await r.json();
    const text = ((d.choices || [])[0] || {}).message?.content || '';
    if (!text) return { ok: false, error: 'Empty' };
    return { ok: true, content: text, model, provider };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function executeAI(o) {
  const requestId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const message = o.message, mode = o.mode || 'fast';
  const systemPrompt = o.systemPrompt || '', temperature = o.temperature ?? 0.3;
  const maxTokens = o.maxTokens || 4000, jsonMode = !!o.jsonMode;

  const gk = envKeys('GEMINI_API_KEY', 6);
  const zk = zyrouterKey();
  const ak = envKeys('ATRIA_API_KEY', 14);

  const attempts = [];
  if (mode === 'advanced') {
    if (zk) attempts.push(() => callOAI(ZYROUTER_BASE, zk, ADVANCED_MODEL, 'zyrouter', message, systemPrompt, temperature, maxTokens, jsonMode));
    gk.forEach(k => attempts.push(() => callGemini(k, FAST_MODEL, message, systemPrompt, temperature, maxTokens, jsonMode)));
  } else {
    gk.forEach(k => attempts.push(() => callGemini(k, FAST_MODEL, message, systemPrompt, temperature, maxTokens, jsonMode)));
    if (zk) attempts.push(() => callOAI(ZYROUTER_BASE, zk, ADVANCED_MODEL, 'zyrouter', message, systemPrompt, temperature, maxTokens, jsonMode));
  }
  ak.slice(0, 3).forEach(k => attempts.push(() => callOAI(ATRIA_BASE, k, ATRIA_MODEL, 'atria', message, systemPrompt, temperature, maxTokens, jsonMode)));

  const errors = [];
  for (const a of attempts) {
    const r = await a();
    if (r.ok) return Object.assign({}, r, { requestId });
    errors.push(r.error || '?');
  }
  return { ok: false, error: errors.slice(0, 3).join(' | '), requestId };
}

function productIdToMode(pid) {
  return (pid === 'DED_AI_DETAIL' || pid === 'DOKUMEN_AI') ? 'advanced' : 'fast';
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch { return {}; }
}


export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const body = parseBody(req);
  const prompt = String(body.prompt || '');
  if (!prompt.trim()) return res.status(400).json({ success: false, error: 'prompt required' });
  const explicitMode = body.mode === 'advanced' ? 'advanced' : body.mode === 'fast' ? 'fast' : null;
  const r = await executeAI({ message: prompt, mode: explicitMode || productIdToMode(String(body.productId || 'EZRAB_AI')), systemPrompt: String(body.systemPrompt || ''), temperature: Number(body.temperature ?? 0.1), maxTokens: Math.min(Number(body.maxTokens ?? 6000), 8000), jsonMode: !!body.jsonMode });
  if (r.ok) return res.status(200).json({ success: true, content: r.content, structured: null, model: r.model, provider: r.provider, requestId: r.requestId });
  return res.status(502).json({ success: false, error: 'AI tidak tersedia', requestId: r.requestId });
};
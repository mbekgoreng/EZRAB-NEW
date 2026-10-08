/**
 * api/_lib/aiGateway.js — SINGLE canonical AI gateway for all Vercel AI endpoints.
 *
 * Phase 2 hardening. Replaces the three copy-pasted failover blocks that lived in
 *   - api/ai/chat.js
 *   - api/ai/tools/execute.js
 *   - api/ai/multi-provider/execute.js
 * A model/key/timeout change is now made ONCE, here.
 *
 * Responsibilities:
 *  - CORS allowlist, token auth (fail-closed when AI_GATEWAY_TOKEN is set),
 *    per-IP rate limiting, bounded body parsing, strict input validation
 *  - Sequential provider failover (Gemini keys -> ZyRouter -> Atria keys)
 *  - Structured, secret-free usage logging: requestId, ACTUAL provider/model
 *    that answered (no silent-substitution mystery), duration, prompt length/hash,
 *    per-attempt outcomes, client IP hash, auth mode
 *
 * What this does NOT do (documented, Phase 3+):
 *  - Per-user authentication (no user store exists yet; needs Supabase project)
 *  - Global rate limiting (in-memory buckets are per serverless instance)
 */
import {
  applyCors,
  rateLimit,
  checkApiToken,
  readJsonBody,
  validateAiInput,
  logAiUsage,
  ipHash,
  sha256hex,
} from './security.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const ZYROUTER_BASE = 'https://api.zyrouter.com/v1';
const ATRIA_BASE = 'https://api.atria-asi.ai/v1';
const FAST_MODEL = 'gemini-3.5-flash-lite';
const ADVANCED_MODEL = 'geminiflash-3.8';
const ATRIA_MODEL = 'Atria-Dawn-Preview';
const ATTEMPT_TIMEOUT_MS = 55000;

function envKeys(prefix, count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const k = String(process.env[prefix + '_' + i] || '').trim();
    if (k) out.push(k);
  }
  return out;
}

function zyrouterKey() {
  return (
    String(process.env.ZYROUTER_API_KEY || '').trim() ||
    String(process.env.ZROUTER_API_KEY || '').trim() ||
    ''
  );
}

function newRequestId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function callGemini(key, model, message, systemPrompt, temperature, maxTokens, jsonMode) {
  const contents = [];
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: '[SYSTEM]\n' + systemPrompt }] });
    contents.push({ role: 'model', parts: [{ text: 'Baik, saya mengerti.' }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ATTEMPT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const r = await fetch(GEMINI_BASE + '/models/' + model + ':generateContent?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: Object.assign(
          { temperature, maxOutputTokens: maxTokens },
          jsonMode ? { responseMimeType: 'application/json' } : {}
        ),
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, provider: 'gemini', model, ms: Date.now() - started, error: 'Gemini ' + r.status };
    const d = await r.json();
    const text = (((d.candidates || [])[0] || {}).content?.parts || []).map((p) => p.text || '').join('') || '';
    if (!text) return { ok: false, provider: 'gemini', model, ms: Date.now() - started, error: 'Empty' };
    return { ok: true, content: text, model, provider: 'gemini', ms: Date.now() - started };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, provider: 'gemini', model, ms: Date.now() - started, error: String((e && e.message) || e) };
  }
}

async function callOAI(base, key, model, provider, message, systemPrompt, temperature, maxTokens, jsonMode) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: message });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ATTEMPT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const r = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(
        Object.assign(
          { model, messages, temperature, max_tokens: maxTokens },
          jsonMode ? { response_format: { type: 'json_object' } } : {}
        )
      ),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false, provider, model, ms: Date.now() - started, error: provider + ' ' + r.status };
    const d = await r.json();
    const text = (((d.choices || [])[0] || {}).message || {}).content || '';
    if (!text) return { ok: false, provider, model, ms: Date.now() - started, error: 'Empty' };
    return { ok: true, content: text, model, provider, ms: Date.now() - started };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, provider, model, ms: Date.now() - started, error: String((e && e.message) || e) };
  }
}

/**
 * Sequential failover. onAttempt (optional) receives each attempt outcome —
 * used for structured logging so the ACTUAL model/provider is always traceable.
 */
export async function executeAI(o, onAttempt) {
  const requestId = o.requestId || newRequestId();
  const { message, mode = 'fast', systemPrompt = '', temperature = 0.3, maxTokens = 4000, jsonMode = false } = o;

  const gk = envKeys('GEMINI_API_KEY', 6);
  const zk = zyrouterKey();
  const ak = envKeys('ATRIA_API_KEY', 14);

  const attempts = [];
  if (mode === 'advanced') {
    if (zk) attempts.push(() => callOAI(ZYROUTER_BASE, zk, ADVANCED_MODEL, 'zyrouter', message, systemPrompt, temperature, maxTokens, jsonMode));
    gk.forEach((k) => attempts.push(() => callGemini(k, FAST_MODEL, message, systemPrompt, temperature, maxTokens, jsonMode)));
  } else {
    gk.forEach((k) => attempts.push(() => callGemini(k, FAST_MODEL, message, systemPrompt, temperature, maxTokens, jsonMode)));
    if (zk) attempts.push(() => callOAI(ZYROUTER_BASE, zk, ADVANCED_MODEL, 'zyrouter', message, systemPrompt, temperature, maxTokens, jsonMode));
  }
  ak.slice(0, 3).forEach((k) => attempts.push(() => callOAI(ATRIA_BASE, k, ATRIA_MODEL, 'atria', message, systemPrompt, temperature, maxTokens, jsonMode)));

  if (attempts.length === 0) {
    return { ok: false, error: 'No AI provider keys configured', requestId, attempts: [] };
  }

  const outcomes = [];
  for (const a of attempts) {
    const r = await a();
    outcomes.push({ provider: r.provider, model: r.model, ok: r.ok, ms: r.ms, error: r.ok ? undefined : r.error });
    if (typeof onAttempt === 'function') {
      try { onAttempt(outcomes[outcomes.length - 1]); } catch { /* never break on logging */ }
    }
    if (r.ok) return { ok: true, content: r.content, model: r.model, provider: r.provider, requestId, attempts: outcomes };
  }
  return {
    ok: false,
    error: outcomes.slice(0, 3).map((x) => x.error || '?').join(' | '),
    requestId,
    attempts: outcomes,
  };
}

/**
 * Full request pipeline for AI endpoints. opts:
 *  - productIdToMode(pid): map product id -> 'fast' | 'advanced' (for tools/execute compat)
 */
export async function handleAiRequest(req, res, opts = {}) {
  const started = Date.now();
  const requestId = newRequestId();

  // 1. CORS (allowlist; not a substitute for auth)
  if (!applyCors(req, res)) {
    return res.status(403).json({ success: false, error: 'Origin tidak diizinkan', requestId });
  }
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed', requestId });
  }

  // 2. Token auth (fail-closed when AI_GATEWAY_TOKEN is configured)
  const auth = checkApiToken(req);
  if (auth.enforced && !auth.ok) {
    logAiUsage({ requestId, event: 'auth_rejected', reason: auth.reason, ipHash: ipHash(req) });
    return res
      .status(401)
      .json({ success: false, error: 'Unauthorized', errorCode: 'AUTH_REQUIRED', requestId });
  }

  // 3. Rate limiting — stricter when token auth is NOT enforced (degraded mode)
  const limit = Number(process.env.AI_RATE_LIMIT_PER_MIN || (auth.enforced ? 60 : 20));
  const rl = rateLimit(req, { limit });
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.allowed) {
    logAiUsage({ requestId, event: 'rate_limited', ipHash: ipHash(req), limit });
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak permintaan. Coba lagi sebentar.',
      errorCode: 'RATE_LIMITED',
      requestId,
      retryAfterMs: rl.resetMs,
    });
  }

  // 4. Bounded body parsing
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, error: 'Body tidak valid: ' + String(e.message || e), requestId });
  }

  // 5. Strict input validation
  const { errors, input } = validateAiInput(body);
  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: errors.join('; '), requestId });
  }
  const mode =
    opts.productIdToMode && input.productId ? opts.productIdToMode(input.productId) : input.mode;

  // 6. Execute with structured, secret-free logging
  const attemptLog = [];
  const r = await executeAI({ ...input, mode, requestId }, (a) => attemptLog.push(a));
  const durationMs = Date.now() - started;
  logAiUsage({
    requestId,
    event: 'ai_request',
    mode,
    ok: r.ok,
    provider: r.ok ? r.provider : null,
    model: r.ok ? r.model : null,
    durationMs,
    promptChars: input.message.length,
    promptHash: sha256hex(input.message).slice(0, 16),
    ipHash: ipHash(req),
    authEnforced: auth.enforced,
    degradedMode: !auth.enforced,
    attempts: attemptLog,
    error: r.ok ? undefined : r.error,
  });
  if (!auth.enforced) {
    console.warn(
      '[ai-gateway] DEGRADED MODE: AI_GATEWAY_TOKEN is not set — endpoints are rate-limited and origin-checked only, not authenticated. Set AI_GATEWAY_TOKEN in Vercel env to enforce token auth.'
    );
  }

  if (r.ok) {
    return res.status(200).json({
      success: true,
      content: r.content,
      model: r.model,
      provider: r.provider,
      mode,
      requestId,
      durationMs,
    });
  }
  return res.status(502).json({ success: false, error: 'AI sedang tidak tersedia.', requestId, durationMs });
}

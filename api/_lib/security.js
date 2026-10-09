/**
 * api/_lib/security.js — shared server-side security primitives for Vercel functions.
 *
 * Phase 2 hardening. Provides:
 *  - CORS allowlist (origin-checked; CORS is NOT a substitute for auth)
 *  - In-memory per-IP rate limiting (per function instance; documented limitation)
 *  - Service-token auth (AI_GATEWAY_TOKEN). Fail-closed when configured;
 *    degraded (strict rate limit + origin check) when not — with a loud warning.
 *  - Bounded JSON body parsing (413 on oversize)
 *  - Strict AI input validation (clamped temperature/tokens, length caps)
 *  - Safe structured logging (never logs keys, tokens, or full prompt content)
 *
 * NOTE on Vercel: files under api/_lib/ are NOT routed as endpoints
 * (underscore-prefixed paths are ignored by the Vercel router).
 */
import { createHash, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------- CORS ---
// SECURITY (P0 fix): the `*.vercel.app` wildcard was REMOVED from defaults.
// Any Vercel deployment — including an attacker's — could previously make
// credentialed browser calls to the gateway. Same-origin calls (the app calls
// its own /api/...) do not need CORS at all. If a preview deployment genuinely
// needs cross-origin access, allowlist its exact origin via CORS_ALLOWED_ORIGINS.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://ezrab-site.vercel.app',
  'https://www.ezrab-site.vercel.app',
];

function configuredOrigins() {
  const extra = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

function originAllowed(origin, allowed) {
  for (const a of allowed) {
    if (a.startsWith('*.')) {
      // "*.vercel.app" matches any vercel.app subdomain (covers preview deploys)
      if (origin.endsWith(a.slice(1)) && origin.length > a.length - 1) return true;
    } else if (origin === a) {
      return true;
    }
  }
  return false;
}

/**
 * Applies CORS headers. Returns true when the request may proceed.
 * Requests WITHOUT an Origin header (same-origin, curl, health checks) are allowed
 * through — CORS is a browser mechanism, not authentication.
 */
export function applyCors(req, res) {
  const origin = String(req.headers.origin || '');
  const allowed = configuredOrigins();
  if (origin && !originAllowed(origin, allowed)) return false;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-ezrab-api-token, x-user-id, x-user-role, x-workspace-id'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

// ---------------------------------------------------------- rate limit ---
// In-memory token bucket per key. LIMITATION: on serverless each instance has
// its own bucket, so this is per-instance protection, not global. It still
// stops naive abuse and accidental loops. Tune via AI_RATE_LIMIT_PER_MIN.
const buckets = new Map();

export function rateLimit(req, { limit = 30, windowMs = 60000, keyPrefix = 'rl', key = null } = {}) {
  const id = key || keyPrefix + ':' + clientIp(req);
  const now = Date.now();
  let b = buckets.get(id);
  if (!b || now >= b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(id, b);
  }
  b.count += 1;
  if (buckets.size > 8000) {
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  }
  return {
    allowed: b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    resetMs: Math.max(0, b.reset - now),
  };
}

/**
 * Client IP for rate limiting / logging.
 * SECURITY (P0 fix): previously the FIRST x-forwarded-for entry was trusted,
 * which any client can spoof (`X-Forwarded-For: victim-ip`) to evade per-IP
 * rate limits or frame someone else. On Vercel the platform APPENDS the real
 * client IP, so the LAST entry is the one the trusted proxy added. We also
 * honor x-real-ip when present (set by the platform, not the client).
 */
export function clientIp(req) {
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const xff = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length > 0) return xff[xff.length - 1];
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/** SHA-256 hash of the client IP — logged instead of the raw IP (privacy). */
export function ipHash(req) {
  return createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16);
}

// ------------------------------------------------------------ token auth ---
/**
 * Service-token check for AI endpoints.
 * - When AI_GATEWAY_TOKEN is set: fail-closed. Requests must carry it as
 *   `x-ezrab-api-token` header or `Authorization: Bearer <token>`.
 * - When NOT set: degraded mode — allowed through, but the caller MUST apply
 *   strict rate limiting and log a warning. This keeps the app working while
 *   the owner provisions the token; it is NOT real authentication.
 */
export function checkApiToken(req) {
  const expected = String(process.env.AI_GATEWAY_TOKEN || '').trim();
  if (!expected) return { enforced: false, ok: true, reason: 'token_not_configured' };
  const headerToken = String(req.headers['x-ezrab-api-token'] || '').trim();
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const got = headerToken || bearer;
  if (!got) return { enforced: true, ok: false, reason: 'missing_token' };
  const a = Buffer.from(got, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return { enforced: true, ok, reason: ok ? '' : 'invalid_token' };
}

// ---------------------------------------------------------------- body ---
export async function readJsonBody(req, maxBytes = 4 * 1024 * 1024) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > maxBytes) {
        throw Object.assign(new Error('Payload too large'), { status: 413 });
      }
      return req.body ? JSON.parse(req.body) : {};
    }
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

// ------------------------------------------------------- input validation ---
function clampNum(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(n, min), max);
}

export function validateAiInput(body) {
  const errors = [];
  const message = String(body.message ?? body.prompt ?? body.input ?? '');
  if (!message.trim()) errors.push('message/prompt wajib diisi');
  if (message.length > 20000) errors.push('message/prompt maksimal 20000 karakter');
  const rawMode = String(body.mode || body.capabilityMode || 'fast').toLowerCase();
  const mode = rawMode === 'advanced' ? 'advanced' : 'fast';
  const temperature = clampNum(body.temperature, 0, 1, 0.3);
  const maxTokens = Math.round(clampNum(body.maxTokens, 100, 8000, 4000));
  const systemPrompt = String(body.systemPrompt || '').slice(0, 8000);
  const jsonMode = Boolean(body.jsonMode);
  return {
    errors,
    input: {
      message,
      mode,
      temperature,
      maxTokens,
      systemPrompt,
      jsonMode,
      productId: body.productId ? String(body.productId) : undefined,
    },
  };
}

// --------------------------------------------------------------- logging ---
export function sha256hex(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex');
}

/**
 * Structured, secret-free logging. Never pass API keys, tokens, or full
 * prompt/document content here — lengths and hashes only.
 */
export function logAiUsage(evt) {
  try {
    console.log('[ai-gateway] ' + JSON.stringify(evt));
  } catch {
    /* logging must never break the request */
  }
}

// ------------------------------------------------- unified authentication ---
// Phase 3: Supabase JWT is the primary method. The browser sends the USER's
// own JWT (Authorization: Bearer) — no shared secret ever lives in the
// browser bundle. Static AI_GATEWAY_TOKEN remains as a legacy fallback for
// service-to-service callers only when Supabase is not configured.
import { isSupabaseConfigured, extractBearerToken, verifySupabaseJwt } from './supabaseAuth.js';

/**
 * Authenticate an incoming request. Returns:
 *  { ok:true,  method:'jwt'|'token'|'none', user:{id,email}|null, degraded?:boolean }
 *  { ok:false, method:'jwt'|'token', reason }
 *
 * Order: Supabase JWT (if configured, fail-closed) -> static token (if
 * configured, fail-closed) -> degraded (strict rate limit + origin check).
 */
export async function authenticateRequest(req, opts = {}) {
  if (isSupabaseConfigured()) {
    const token = extractBearerToken(req);
    // Fase pengembangan: login dimatikan (AUTH_ENABLED=false di frontend).
    // AI_ALLOW_ANONYMOUS=true mengizinkan akses AI tanpa JWT — tetap
    // rate-limit ketat per IP + origin check (degraded). Default: fail-closed.
    // SECURITY (P0 fix): the anonymous bypass can NEVER activate in
    // production, even if the env var is set by accident. Vercel sets
    // VERCEL_ENV=production on production deployments.
    const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
    // SECURITY: hanya VERCEL_ENV yang menentukan production. NODE_ENV=production
    // diset Vercel untuk SEMUA deployment (termasuk preview), jadi tidak boleh
    // dipakai sebagai penanda production — kalau dipakai, AI_ALLOW_ANONYMOUS
    // tidak akan pernah aktif di preview dan AI Online mati total (401).
    const isProd = vercelEnv === 'production';
    if (!token && process.env.AI_ALLOW_ANONYMOUS === 'true' && !isProd) {
      return { ok: true, method: 'none', user: null, degraded: true };
    }
    if (!token && process.env.AI_ALLOW_ANONYMOUS === 'true' && isProd) {
      console.error('[ai-gateway] REFUSED: AI_ALLOW_ANONYMOUS is set but VERCEL_ENV=production — anonymous AI access stays disabled.');
    }
    const v = await verifySupabaseJwt(token, opts.jwtVerifier);
    if (!v.ok) return { ok: false, method: 'jwt', reason: v.reason };
    return { ok: true, method: 'jwt', user: v.user };
  }
  const t = checkApiToken(req);
  if (t.enforced) {
    if (!t.ok) return { ok: false, method: 'token', reason: t.reason };
    return { ok: true, method: 'token', user: null };
  }
  return { ok: true, method: 'none', user: null, degraded: true };
}

/** Rate-limit identity: verified user id when available, else client IP. */
export function rateLimitIdentity(req, auth) {
  if (auth && auth.ok && auth.user && auth.user.id) return 'user:' + auth.user.id;
  return 'ip:' + clientIp(req);
}

/**
 * api/_lib/supabaseAuth.js — server-side Supabase Auth verification.
 *
 * Phase 3. The browser NEVER holds a shared secret anymore: it sends the
 * user's own Supabase Auth JWT as `Authorization: Bearer <jwt>`, and the
 * gateway verifies it HERE, server-side, via the Supabase Auth API.
 *
 * Only the ANON key is used server-side (public by design). The SERVICE-ROLE
 * key is NEVER read here and must never reach the browser.
 */
import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

export function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null;
}

function getClient() {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  if (!cachedClient) {
    cachedClient = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}

export function extractBearerToken(req) {
  const h = String(req.headers.authorization || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : '';
  return token || '';
}

/**
 * D2 Option C (Phase 2, 2026-11-19): bounded JWT verification.
 * `client.auth.getUser()` is a network call to the Supabase Auth API with
 * NO timeout of its own — it runs BEFORE the provider chain (outside the
 * 100s chain budget, but INSIDE the client's abort window), so a hung Auth
 * API could eat the whole request window before any provider is tried.
 * The verification is therefore raced against a 10s bound: slow-but-alive
 * verifications (normally <1s) are untouched; a hung one fails CLOSED with
 * the distinct reason 'verify_timeout' (visible in the auth_rejected log
 * event, distinguishable from 'invalid_token'/'verify_error').
 * The bound covers the whole verification step (real path = getUser call;
 * injected test verifiers are bounded identically). `opts.timeoutMs`
 * overrides the default for tests only — production callers pass nothing.
 */
const JWT_VERIFY_TIMEOUT_MS_DEFAULT = 10000;
const VERIFY_TIMEOUT_SENTINEL = Symbol('jwt_verify_timeout');

function jwtVerifyTimeoutMs(opts) {
  const t = opts && typeof opts.timeoutMs === 'number' ? opts.timeoutMs : NaN;
  return Number.isFinite(t) && t > 0 ? t : JWT_VERIFY_TIMEOUT_MS_DEFAULT;
}

function raceVerifyWithTimeout(promise, timeoutMs) {
  let timer = null;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(VERIFY_TIMEOUT_SENTINEL), timeoutMs);
  });
  // Promise.race attaches handlers to both branches, so a late rejection
  // from the losing branch is still handled (no unhandledRejection).
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Verify a Supabase Auth JWT server-side.
 * `verifier` is injectable for tests: async (token) => { ok, user?, reason? }.
 * Never trusts client-supplied userId/role/org claims — identity comes only
 * from the verified token. Every return carries `ms` (verification duration,
 * for tests and diagnostics; callers ignore it). Auth failure ALWAYS fails
 * closed (ok:false) — including timeouts.
 */
export async function verifySupabaseJwt(token, verifier, opts = {}) {
  const started = Date.now();
  if (!token) return { ok: false, reason: 'missing_token', ms: 0 };
  const verify =
    verifier ||
    (async (t) => {
      const client = getClient();
      if (!client) return { ok: false, reason: 'supabase_not_configured' };
      try {
        const { data, error } = await client.auth.getUser(t);
        if (error || !data || !data.user) return { ok: false, reason: 'invalid_token' };
        return {
          ok: true,
          user: {
            id: data.user.id,
            email: data.user.email || null,
            // Supabase Anonymous Auth users carry is_anonymous=true. This is
            // NOT a role claim — it only marks HOW the identity was issued,
            // and the gateway uses it to apply the restricted demo policy.
            // NOTE: role/org come from OUR membership tables, never from token claims.
            isAnonymous: Boolean(data.user.is_anonymous),
          },
        };
      } catch {
        return { ok: false, reason: 'verify_error' };
      }
    });
  try {
    const settled = await raceVerifyWithTimeout(verify(token), jwtVerifyTimeoutMs(opts));
    if (settled === VERIFY_TIMEOUT_SENTINEL) {
      return { ok: false, reason: 'verify_timeout', ms: Date.now() - started };
    }
    const result = settled && typeof settled === 'object' ? settled : { ok: false, reason: 'verify_error' };
    return { ...result, ms: Date.now() - started };
  } catch {
    return { ok: false, reason: 'verify_error', ms: Date.now() - started };
  }
}

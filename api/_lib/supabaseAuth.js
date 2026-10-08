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
 * Verify a Supabase Auth JWT server-side.
 * `verifier` is injectable for tests: async (token) => { ok, user?, reason? }.
 * Never trusts client-supplied userId/role/org claims — identity comes only
 * from the verified token.
 */
export async function verifySupabaseJwt(token, verifier) {
  if (!token) return { ok: false, reason: 'missing_token' };
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
            // NOTE: role/org come from OUR membership tables, never from token claims.
          },
        };
      } catch {
        return { ok: false, reason: 'verify_error' };
      }
    });
  try {
    return await verify(token);
  } catch {
    return { ok: false, reason: 'verify_error' };
  }
}

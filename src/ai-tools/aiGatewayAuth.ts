/**
 * AI gateway auth headers (Phase 3).
 *
 * The browser sends the USER's Supabase Auth JWT as `Authorization: Bearer`.
 * The gateway verifies it server-side. No shared secret ever lives in the
 * browser bundle — VITE_AI_GATEWAY_TOKEN was removed for this reason
 * (a static token in public JS is not authentication).
 *
 * When Supabase is not configured (or the user is not logged in), no auth
 * header is sent: the gateway falls back to its token/degraded handling.
 * Never put userId/role/org here — the server derives identity from the
 * verified JWT only.
 */
import { getSupabaseClient, isSupabaseAuthEnabled } from '../lib/supabase';

export async function aiGatewayAuthHeaders(): Promise<Record<string, string>> {
  try {
    if (!isSupabaseAuthEnabled()) return {};
    const sb = getSupabaseClient();
    if (!sb) return {};
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

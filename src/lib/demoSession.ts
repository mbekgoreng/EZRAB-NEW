/**
 * Public demo session (Fase 3B) — Supabase Anonymous Auth.
 *
 * The demo identity is a REAL Supabase user issued by the server-side auth
 * service (signInAnonymously), never a fabricated label or a shared secret
 * in the bundle. The gateway verifies the JWT like any other and applies
 * the restricted demo policy because the user carries is_anonymous=true.
 *
 * Activation needs BOTH:
 *  - VITE_AI_DEMO_ENABLED=true in the frontend build env, and
 *  - "Allow anonymous sign-ins" enabled in the Supabase dashboard.
 * Until both are true this module is inert and AI calls simply carry no
 * demo token (the gateway then answers 401 for signed-out visitors, which
 * is the honest fail-closed behaviour).
 */
import { getSupabaseClient, isSupabaseAuthEnabled } from './supabase';

export type AuthKind = 'registered' | 'demo' | 'none';

export function isDemoAuthEnabled(): boolean {
  try {
    if (!isSupabaseAuthEnabled()) return false;
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    return env?.VITE_AI_DEMO_ENABLED === 'true';
  } catch {
    return false;
  }
}

let pendingDemoSession: Promise<string | null> | null = null;

/**
 * Access token for the current session if one exists; otherwise, when demo
 * is enabled, create an anonymous session and return its token. Returns
 * null when Supabase is unavailable or demo is disabled — never throws.
 */
export async function getDemoAccessToken(): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  } catch {
    /* fall through to anonymous sign-in */
  }
  if (!isDemoAuthEnabled()) return null;
  if (!pendingDemoSession) {
    pendingDemoSession = (async () => {
      try {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) return null;
        return data.session?.access_token ?? null;
      } catch {
        return null;
      } finally {
        pendingDemoSession = null;
      }
    })();
  }
  return pendingDemoSession;
}

/** Which identity the browser currently holds — for honest status display. */
export async function resolveAuthKind(): Promise<AuthKind> {
  const sb = getSupabaseClient();
  if (!sb) return 'none';
  try {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return 'none';
    return user.is_anonymous ? 'demo' : 'registered';
  } catch {
    return 'none';
  }
}

/** End the demo session (only signs out when the session is anonymous). */
export async function endDemoSession(): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user?.is_anonymous) await sb.auth.signOut();
  } catch {
    /* nothing to end */
  }
}

/**
 * Phase 3 — Supabase browser client (env-gated).
 *
 * Real auth is active ONLY when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are
 * set. Otherwise the app runs in legacy demo mode (demo PINs, local data) and
 * the owner is never locked out.
 *
 * Only the ANON key is ever exposed here (public by design). The service-role
 * key must never appear in this bundle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function isSupabaseAuthEnabled(): boolean {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    return Boolean(env?.VITE_SUPABASE_URL && env?.VITE_SUPABASE_ANON_KEY);
  } catch {
    return false;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseAuthEnabled()) return null;
  if (!cached) {
    const env = (import.meta as unknown as { env: Record<string, string> }).env;
    cached = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return cached;
}

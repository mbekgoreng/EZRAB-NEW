/**
 * Phase 3 — Supabase browser client (env-gated).
 *
 * Real auth is active ONLY when the Supabase configuration passes the
 * single strict check in src/auth/authMode.ts (isSupabaseReadyForAuth) —
 * AUTH-08 (audit 2026-10-29): every module now answers "is Supabase
 * configured?" from that one source of truth instead of three divergent
 * local checks. Otherwise the app runs in legacy demo mode (demo PINs,
 * local data) and the owner is never locked out.
 *
 * Only the ANON key is ever exposed here (public by design). The service-role
 * key must never appear in this bundle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseReadyForAuth, readAuthEnv } from '../auth/authMode';

let cached: SupabaseClient | null = null;

export function isSupabaseAuthEnabled(): boolean {
  return isSupabaseReadyForAuth(readAuthEnv());
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseAuthEnabled()) return null;
  if (!cached) {
    const env = (import.meta as unknown as { env: Record<string, string> }).env;
    cached = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return cached;
}

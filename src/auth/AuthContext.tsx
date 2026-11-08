/**
 * Phase 3 — real authentication context (Supabase Auth, env-gated).
 *
 * When VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set, this provides the
 * verified user session. When not set, everything is null and the app keeps
 * its legacy demo-PIN flow — the owner is never locked out.
 *
 * Server-side, identity is re-verified from the JWT on every sensitive call.
 * Nothing here is trusted by the server on its own.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseAuthEnabled } from '../lib/supabase';
import { authEmailRedirectTo } from '../components/auth/authFormShared';

interface AuthState {
  /** false when Supabase env is not configured (legacy demo mode) */
  enabled: boolean;
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ ok: boolean; error?: string }>;
  /** Kirim email reset kata sandi (tautan mendarat di /masuk, type=recovery). */
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** Pasang kata sandi baru pada sesi pemulihan yang aktif. */
  updatePassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  /** Redirects the browser to Google; resolves false only when the redirect cannot start. */
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  /** Fresh access token for API calls (null when logged out/disabled) */
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthState>({
  enabled: false,
  user: null,
  session: null,
  loading: false,
  signIn: async () => ({ ok: false, error: 'Auth tidak dikonfigurasi' }),
  signUp: async () => ({ ok: false, error: 'Auth tidak dikonfigurasi' }),
  resetPassword: async () => ({ ok: false, error: 'Auth tidak dikonfigurasi' }),
  updatePassword: async () => ({ ok: false, error: 'Auth tidak dikonfigurasi' }),
  signInWithGoogle: async () => ({ ok: false, error: 'Auth tidak dikonfigurasi' }),
  signOut: async () => {},
  getAccessToken: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const enabled = isSupabaseAuthEnabled();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    const sb = getSupabaseClient();
    if (!sb) {
      setLoading(false);
      return;
    }
    let mounted = true;
    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [enabled]);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, error: 'Auth tidak dikonfigurasi' };
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, error: 'Auth tidak dikonfigurasi' };
    const cleanName = (name ?? '').trim();
    const { error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: authEmailRedirectTo(),
        ...(cleanName ? { data: { full_name: cleanName, display_name: cleanName } } : {}),
      },
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, error: 'Auth tidak dikonfigurasi' };
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authEmailRedirectTo(),
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, error: 'Auth tidak dikonfigurasi' };
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, error: 'Auth tidak dikonfigurasi' };
    try {
      sessionStorage.setItem('ezrab_after_oauth', '1');
    } catch {
      /* storage unavailable — OAuth still works, modal just won't auto-open */
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const getAccessToken = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const value = useMemo(
    () => ({ enabled, user, session, loading, signIn, signUp, resetPassword, updatePassword, signInWithGoogle, signOut, getAccessToken }),
    [enabled, user, session, loading, signIn, signUp, resetPassword, updatePassword, signInWithGoogle, signOut, getAccessToken]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email atau kata sandi salah.';
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
  if (m.includes('user already registered') || m.includes('already exists'))
    return 'Email sudah terdaftar. Silakan masuk.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider'))
    return 'Login Google belum diaktifkan. Hubungi admin.';
  if (m.includes('password')) return 'Kata sandi tidak memenuhi syarat (min. 6 karakter).';
  return 'Gagal autentikasi. Coba lagi.';
}

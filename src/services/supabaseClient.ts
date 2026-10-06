import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

// Safe environment retrieval without exposing secrets
const supabaseUrl: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) || '';

const supabasePublishableKey: string =
  (typeof import.meta !== 'undefined' &&
    ((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
     (import.meta as any).env?.VITE_SUPABASE_ANON_KEY)) || '';

let clientInstance: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseUrl.startsWith('https://') &&
    supabasePublishableKey &&
    supabasePublishableKey.length > 20
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return clientInstance;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

export async function getCurrentSupabaseUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getUser();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function signInWithEmailPassword(email: string, password: string): Promise<{
  user: User | null;
  session: Session | null;
  error: Error | null;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      user: null,
      session: null,
      error: new Error('Konfigurasi Supabase tidak ditemukan atau belum valid.'),
    };
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  return {
    user: data.user,
    session: data.session,
    error: error ? new Error(error.message) : null,
  };
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  fullName?: string
): Promise<{
  user: User | null;
  session: Session | null;
  error: Error | null;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      user: null,
      session: null,
      error: new Error('Konfigurasi Supabase tidak ditemukan atau belum valid.'),
    };
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || '',
      },
    },
  });

  return {
    user: data.user,
    session: data.session,
    error: error ? new Error(error.message) : null,
  };
}

export async function signOutSupabase(): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return { error: null };
  }
  const { error } = await client.auth.signOut();
  return { error: error ? new Error(error.message) : null };
}

export async function signInWithGoogleOAuth(): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return { error: new Error('Konfigurasi Supabase tidak ditemukan.') };
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });
  return { error: error ? new Error(error.message) : null };
}

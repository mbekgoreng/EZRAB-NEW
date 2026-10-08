/**
 * Phase 3 — real login panel (Supabase Auth). Simple version:
 * email + nama + password, plus Gmail (Google) OAuth.
 * Rendered INSTEAD of the demo-PIN panel when Supabase is configured.
 */
import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2, LogOut, Mail, Lock, User } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

interface Props {
  onSuccess: () => void;
  onBackToLogin: () => void;
}

function GoogleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export const SupabaseLoginPanel: React.FC<Props> = ({ onSuccess, onBackToLogin }) => {
  const { user, loading, signIn, signUp, signInWithGoogle, signOut } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: '#64748b' }}>
        <Loader2 size={18} className="animate-spin" /> Memeriksa sesi…
      </div>
    );
  }

  if (user) {
    const displayName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.display_name as string | undefined) ||
      user.email;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 14, color: '#334155', margin: 0 }}>
          Masuk sebagai <strong>{displayName}</strong>
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onSuccess} style={primaryBtn}>
            Lanjut ke Aplikasi
          </button>
          <button type="button" onClick={() => void signOut()} style={ghostBtn}>
            <LogOut size={14} /> Keluar
          </button>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && !name.trim()) {
      setError('Isi nama Anda.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError('Isi email valid dan kata sandi min. 6 karakter.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, name);
    setBusy(false);
    if (r.ok) {
      if (mode === 'signup') {
        // Jika konfirmasi email aktif, pengguna harus verifikasi dulu.
        // Jika nonaktif, sesi langsung terbentuk dan panel otomatis
        // menampilkan status login lewat `user`.
        setMode('signin');
        setError(null);
      } else {
        onSuccess();
      }
    } else {
      setError(r.error || 'Gagal. Coba lagi.');
    }
  };

  const googleLogin = async () => {
    setGoogleBusy(true);
    setError(null);
    const r = await signInWithGoogle();
    if (!r.ok) {
      setGoogleBusy(false);
      setError(r.error || 'Gagal membuka login Google.');
    }
    // Jika ok, browser redirect ke Google — tidak ada lanjutan di sini.
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
          {mode === 'signin' ? 'Masuk ke EZRAB' : 'Buat Akun EZRAB'}
        </h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          {mode === 'signin'
            ? 'Masuk untuk mengelola proyek dan RAB Anda.'
            : 'Daftar gratis untuk mulai menyusun RAB.'}
        </p>
      </div>

      <button type="button" onClick={googleLogin} disabled={googleBusy || busy} style={googleBtn}>
        {googleBusy ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
        <span>Lanjutkan dengan Google</span>
      </button>

      <div style={divider}>
        <span style={dividerLine} />
        <span style={{ fontSize: 12, color: '#94a3b8' }}>atau</span>
        <span style={dividerLine} />
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mode === 'signup' && (
          <label style={field}>
            <span style={labelRow}><User size={14} /> Nama</span>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap" style={input} autoComplete="name"
            />
          </label>
        )}
        <label style={field}>
          <span style={labelRow}><Mail size={14} /> Email</span>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@perusahaan.id" style={input} autoComplete="email"
          />
        </label>
        <label style={field}>
          <span style={labelRow}><Lock size={14} /> Kata sandi</span>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" style={input} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#DC2626', fontSize: 12.5 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <button type="submit" disabled={busy || googleBusy} style={primaryBtn}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : mode === 'signin' ? 'Masuk' : 'Daftar'}
        </button>
      </form>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" onClick={onBackToLogin} style={linkBtn}>
          <ArrowLeft size={14} /> Kembali
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
          style={linkBtn}
        >
          {mode === 'signin' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
        </button>
      </div>
    </div>
  );
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10,
  padding: '11px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
const googleBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  background: '#fff', color: '#1e293b', border: '1px solid #CBD5E1', borderRadius: 10,
  padding: '10px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  ...primaryBtn, background: '#F1F5F9', color: '#334155',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2563EB', fontSize: 13,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
};
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#334155' };
const input: React.CSSProperties = {
  border: '1px solid #CBD5E1', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none',
};
const divider: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const dividerLine: React.CSSProperties = { flex: 1, height: 1, background: '#E2E8F0' };

export default SupabaseLoginPanel;

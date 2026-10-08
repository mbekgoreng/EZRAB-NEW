/**
 * Phase 3 — real login panel (Supabase Auth).
 * Rendered INSTEAD of the demo-PIN panel when Supabase is configured.
 * Demo PINs are never shown alongside real auth.
 */
import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2, LogOut, ShieldCheck, Mail, Lock } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

interface Props {
  onSuccess: () => void;
  onBackToLogin: () => void;
}

export const SupabaseLoginPanel: React.FC<Props> = ({ onSuccess, onBackToLogin }) => {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: '#64748b' }}>
        <Loader2 size={18} className="animate-spin" /> Memeriksa sesi…
      </div>
    );
  }

  if (user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={badge('#059669', '#ECFDF5', '#A7F3D0')}>
          <ShieldCheck size={12} /> LOGIN TERVERIFIKASI
        </div>
        <p style={{ fontSize: 13, color: '#334155', margin: 0 }}>
          Masuk sebagai <strong>{user.email}</strong>
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
    if (!email.trim() || password.length < 6) {
      setError('Isi email valid dan kata sandi min. 6 karakter.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = mode === 'signin' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (r.ok) {
      if (mode === 'signup') {
        setError(null);
        setMode('signin');
      } else {
        onSuccess();
      }
    } else {
      setError(r.error || 'Gagal. Coba lagi.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={badge('#2563EB', '#EFF6FF', '#BFDBFE')}>
          <ShieldCheck size={12} /> AUTH SERVER-SIDE
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
          {mode === 'signin' ? 'Masuk ke EZRAB' : 'Buat Akun EZRAB'}
        </h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          Sesi diverifikasi server. PIN demo dinonaktifkan dalam mode ini.
        </p>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
        <button type="submit" disabled={busy} style={primaryBtn}>
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

const badge = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800,
  letterSpacing: '0.06em', color, background: bg, border: `1px solid ${border}`,
  padding: '4px 10px', borderRadius: 999, marginBottom: 10, width: 'fit-content',
});
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10,
  padding: '11px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
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

export default SupabaseLoginPanel;

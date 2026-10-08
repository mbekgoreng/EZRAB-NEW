/**
 * AuthPage — halaman login/daftar mandiri (/masuk, /daftar, /masuk/role).
 *
 * - /masuk      → form Masuk (email + kata sandi + Google)
 * - /daftar     → form Daftar (nama + email + kata sandi + Google)
 * - /masuk/role → sign-in berbasis role demo (PIN), selalu tampil walau
 *                 Supabase aktif — untuk evaluasi/demo peran.
 *
 * Setelah sukses, onLoginSuccess dipanggil (App mengarahkan ke dashboard
 * dan memicu tur selamat datang bila perlu).
 */
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { RoleLoginPanel } from './components/auth/RoleLoginPanel';
import { isSupabaseAuthEnabled } from './lib/supabase';
import { navigateTo, paths } from './routing/routes';

interface AuthPageProps {
  mode: 'signin' | 'signup' | 'role';
  onLoginSuccess: () => void;
}

const TITLES: Record<AuthPageProps['mode'], { title: string; desc: string }> = {
  signin: {
    title: 'Selamat datang kembali',
    desc: 'Masuk untuk melanjutkan ke workspace Anda.',
  },
  signup: {
    title: 'Buat akun gratis',
    desc: 'Daftar dalam hitungan detik, langsung susun RAB pertama Anda.',
  },
  role: {
    title: 'Masuk sebagai peran',
    desc: 'Pilih peran untuk mencoba EZRAB dari sudut pandang berbeda.',
  },
};

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onLoginSuccess }) => {
  const { title, desc } = TITLES[mode];
  const handleBack = () => navigateTo(paths.home());
  const showModeToggle = mode !== 'role' && isSupabaseAuthEnabled();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background:
          'radial-gradient(1200px 600px at 50% -10%, #dbeafe 0%, #f8fafc 55%, #f1f5f9 100%)',
        fontFamily: 'var(--ezrab-font-sans)',
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 24,
          boxShadow: '0 20px 60px -20px rgba(37, 99, 235, 0.25)',
          padding: '32px 32px 28px',
        }}
      >
        <button
          onClick={handleBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 0',
            marginBottom: 18,
          }}
        >
          <ArrowLeft size={15} /> Beranda
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <img
            src="/images/ezrab-logo.png"
            alt="EZRAB"
            style={{ width: 36, height: 36, objectFit: 'contain' }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
            EZRAB
          </span>
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: '#0f172a',
            margin: '0 0 6px',
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 22px', lineHeight: 1.6 }}>{desc}</p>

        {mode === 'role' ? (
          <RoleLoginPanel
            forceDemoRoles
            onSuccess={onLoginSuccess}
            onBackToLogin={handleBack}
          />
        ) : (
          <RoleLoginPanel
            initialMode={mode}
            onSuccess={onLoginSuccess}
            onBackToLogin={handleBack}
          />
        )}

        {showModeToggle && (
          <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', margin: '18px 0 0' }}>
            {mode === 'signin' ? (
              <>
                Belum punya akun?{' '}
                <button
                  onClick={() => navigateTo(paths.signup())}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                >
                  Daftar gratis
                </button>
              </>
            ) : (
              <>
                Sudah punya akun?{' '}
                <button
                  onClick={() => navigateTo(paths.login())}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                >
                  Masuk
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthPage;

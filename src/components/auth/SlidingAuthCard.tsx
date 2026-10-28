/**
 * SlidingAuthCard — Masuk/Daftar EZRAB gaya "double slider" (sesuai video referensi).
 *
 * Panel overlay gradien biru bergeser halus saat beralih mode.
 * Memakai services/supabaseClient milik branch ini (bukan AuthContext).
 *
 * Maskot login (foto 3D, desktop saja — panel overlay disembunyikan di
 * mobile): menunduk + emot 🙈 saat kata sandi diisi, pindah ke tengah +
 * jempol 👍 saat login berhasil, dengan jeda 1,4 dtk sebelum lanjut ke
 * workspace agar animasinya sempat terlihat.
 */
import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, LogOut, X } from 'lucide-react';
import {
  getCurrentSupabaseUser,
  isSupabaseConfigured,
  signInWithEmailPassword,
  signInWithGoogleOAuth,
  signOutSupabase,
  signUpWithEmailPassword,
} from '../../services/supabaseClient';
import { useRole } from '../../auth/RoleContext';
import { logoutSessionsOnly } from '../../auth/logoutAll';
import './sliding-auth.css';

export type SlidingAuthTab = 'masuk' | 'daftar';

interface Props {
  initialTab?: SlidingAuthTab;
  onSuccessLogin: () => void;
  onClose: () => void;
  /** Tampilkan panel peran demo (PIN) sebagai ganti. */
  onShowRoleLogin: () => void;
  /** True bila backend login belum aktif: tampilkan banner demo-only. */
  demoOnly?: boolean;
}

function GoogleIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export const SlidingAuthCard: React.FC<Props> = ({
  initialTab = 'masuk',
  onSuccessLogin,
  onClose,
  onShowRoleLogin,
  demoOnly = false,
}) => {
  const [isSignUp, setIsSignUp] = useState(initialTab === 'daftar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const { logoutRole } = useRole();
  /** Animasi maskot sukses: true sejak login berhasil s.d. navigasi (1,4 dtk). */
  const [loginSuccess, setLoginSuccess] = useState(false);
  const successTimer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current);
    },
    [],
  );

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const u = await getCurrentSupabaseUser();
        if (alive) setCurrentUserEmail(u?.email ?? null);
      } catch {
        if (alive) setCurrentUserEmail(null);
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const switchMode = (toSignUp: boolean) => {
    setIsSignUp(toSignUp);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: React.FormEvent, forSignUp: boolean) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured()) {
      setError('Layanan autentikasi Supabase belum terhubung atau konfigurasi belum lengkap.');
      return;
    }
    if (forSignUp && !name.trim()) {
      setError('Isi nama Anda.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError('Isi email valid dan kata sandi min. 6 karakter.');
      return;
    }
    if (forSignUp && password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }

    setBusy(true);
    let successShown = false;
    try {
      const r = forSignUp
        ? await signUpWithEmailPassword(email.trim(), password, name.trim())
        : await signInWithEmailPassword(email.trim(), password);
      if (r.error) {
        setError(r.error.message || 'Gagal. Coba lagi.');
      } else if (forSignUp) {
        // Konfirmasi email mungkin aktif — arahkan ke form masuk.
        setNotice('Akun dibuat. Silakan masuk dengan akun Anda.');
        setIsSignUp(false);
      } else {
        // Animasi maskot sukses dulu (1,4 dtk) baru lanjut ke workspace.
        successShown = true;
        setLoginSuccess(true);
        successTimer.current = window.setTimeout(() => onSuccessLogin(), 1400);
      }
    } finally {
      if (!successShown) setBusy(false);
    }
  };

  const googleLogin = async () => {
    setError(null);
    setNotice(null);
    if (!isSupabaseConfigured()) {
      setError('Layanan autentikasi Supabase belum terhubung atau konfigurasi belum lengkap.');
      return;
    }
    setGoogleBusy(true);
    try {
      const { error: gErr } = await signInWithGoogleOAuth();
      if (gErr) setError(gErr.message || 'Gagal membuka login Google.');
      // Jika ok, browser redirect ke Google — tidak ada lanjutan di sini.
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSignOut = async () => {
    // R2: Keluar di kartu login = akhiri SEMUA sesi (Supabase + role
    // demo + cookie gerbang), tanpa menghapus data workspace dan tanpa
    // navigasi (kartu tetap tampil sebagai formulir login). Sebelum
    // R2 hanya signOutSupabase. signOutSupabase mengembalikan {error}
    // sehingga kegagalan tercatat jujur di result, bukan ditelan.
    const result = await logoutSessionsOnly({
      logoutRole,
      hasSupabaseSession: currentUserEmail !== null,
      signOutSupabase,
    });
    if (!result.allAttemptedOk) {
      console.warn('[logout] partial failure:', result.errors);
    }
    setCurrentUserEmail(null);
  };

  const spinner = <Loader2 size={15} className="animate-spin" />;

  /** Maskot mengetik = salah satu kolom kata sandi terisi (dan belum sukses). */
  const isTypingPassword = (password.length > 0 || confirmPassword.length > 0) && !loginSuccess;
  const mascotStateClass = loginSuccess ? ' sac-mascot-success' : isTypingPassword ? ' sac-mascot-typing' : '';
  const mascotBlock = (
    <>
      <div className="sac-mascot">
        <img src="/images/mascot-login-3d.png" alt="" aria-hidden="true" />
      </div>
      <div className="sac-mascot-bubble sac-mascot-bubble-peek" aria-hidden="true">
        🙈
      </div>
      <div className="sac-mascot-bubble sac-mascot-bubble-thumb" aria-hidden="true">
        👍
      </div>
      <div className="sac-mascot-note" aria-hidden="true">
        Berhasil! Mengalihkan ke workspace…
      </div>
    </>
  );

  return (
    <div className="sac-page">
      <button type="button" className="sac-close" onClick={onClose} aria-label="Tutup">
        <X size={20} />
      </button>

      {demoOnly && (
        <div
          role="note"
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            width: 'min(560px, calc(100% - 32px))',
            textAlign: 'center',
            fontSize: '13px',
            lineHeight: 1.55,
            color: '#1e40af',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '10px',
            padding: '10px 12px',
          }}
        >
          Login email belum diaktifkan — backend dalam redesign. Untuk
          sekarang, masuk lewat{' '}
          <button
            type="button"
            onClick={onShowRoleLogin}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#1d4ed8',
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            peran demo
          </button>
          .
        </div>
      )}

      <div className="sac-mobile-brand">
        <img src="/images/ez-emblem.png" alt="EZRAB" />
        <div className="sac-mobile-brand-text">
          <strong>EZRAB</strong>
          <span>Platform RAB &amp; Estimasi Konstruksi AI</span>
        </div>
      </div>

      <div className={`sac-container${isSignUp ? ' sac-right-active' : ''}`}>
        {checking ? (
          <div className="sac-loggedin">
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--ez-color-primary)' }} />
            <p>Memeriksa sesi…</p>
          </div>
        ) : currentUserEmail ? (
          <div className="sac-loggedin">
            <h2>Sudah masuk</h2>
            <p>
              Masuk sebagai <strong>{currentUserEmail}</strong>
            </p>
            <div className="sac-loggedin-row">
              <button type="button" className="sac-btn" onClick={onSuccessLogin}>
                Lanjut ke Aplikasi
              </button>
              <button type="button" className="sac-btn-secondary" onClick={() => void handleSignOut()}>
                <LogOut size={14} /> Keluar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---- Form DAFTAR ---- */}
            <div className="sac-form-container sac-sign-up-container">
              <form onSubmit={(e) => void submit(e, true)}>
                <h1>Buat Akun EZRAB</h1>
                <div className="sac-social">
                  <button
                    type="button"
                    className="sac-social-btn"
                    onClick={() => void googleLogin()}
                    disabled={googleBusy || busy}
                    title="Lanjutkan dengan Google"
                    aria-label="Lanjutkan dengan Google"
                  >
                    {googleBusy ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
                  </button>
                </div>
                <span className="sac-hint">atau gunakan email untuk pendaftaran</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkap"
                  autoComplete="name"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kata sandi (min. 6 karakter)"
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Konfirmasi kata sandi"
                  autoComplete="new-password"
                />
                {error && (
                  <div className="sac-error">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
                <button type="submit" className="sac-btn" disabled={busy || googleBusy}>
                  {busy && isSignUp ? spinner : null} Daftar
                </button>
              </form>
            </div>

            {/* ---- Form MASUK ---- */}
            <div className="sac-form-container sac-sign-in-container">
              <form onSubmit={(e) => void submit(e, false)}>
                <h1>Masuk ke EZRAB</h1>
                <div className="sac-social">
                  <button
                    type="button"
                    className="sac-social-btn"
                    onClick={() => void googleLogin()}
                    disabled={googleBusy || busy}
                    title="Lanjutkan dengan Google"
                    aria-label="Lanjutkan dengan Google"
                  >
                    {googleBusy ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
                  </button>
                </div>
                <span className="sac-hint">atau gunakan akun Anda</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kata sandi"
                  autoComplete="current-password"
                />
                {error && (
                  <div className="sac-error">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
                {notice && (
                  <div className="sac-success">
                    <CheckCircle2 size={14} /> {notice}
                  </div>
                )}
                <button type="submit" className="sac-btn" disabled={busy || googleBusy}>
                  {busy && !isSignUp ? spinner : null} Masuk
                </button>
              </form>
            </div>

            {/* ---- Overlay geser ---- */}
            <div className={`sac-overlay-container${mascotStateClass}`} aria-hidden="true">
              <div className="sac-overlay">
                <div className="sac-overlay-panel sac-overlay-left">
                  <div className="sac-brandmark">
                    <img src="/images/ez-emblem.png" alt="EZRAB" />
                  </div>
                  <h1>Selamat Datang Kembali!</h1>
                  <p>Masuk untuk melanjutkan proyek, QTO, dan RAB Anda</p>
                  <button type="button" className="sac-btn sac-ghost" onClick={() => switchMode(false)} tabIndex={-1}>
                    Masuk
                  </button>
                  {mascotBlock}
                </div>
                <div className="sac-overlay-panel sac-overlay-right">
                  <div className="sac-brandmark">
                    <img src="/images/ez-emblem.png" alt="EZRAB" />
                  </div>
                  <h1>Halo, Estimator!</h1>
                  <p>Daftar gratis dan susun RAB pertama Anda dalam hitungan menit</p>
                  <button type="button" className="sac-btn sac-ghost" onClick={() => switchMode(true)} tabIndex={-1}>
                    Daftar
                  </button>
                  {mascotBlock}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {!checking && !currentUserEmail && (
        <>
          <p className="sac-mobile-toggle">
            {isSignUp ? (
              <>
                Sudah punya akun? <button type="button" onClick={() => switchMode(false)}>Masuk</button>
              </>
            ) : (
              <>
                Belum punya akun? <button type="button" onClick={() => switchMode(true)}>Daftar gratis</button>
              </>
            )}
          </p>
          <button type="button" className="sac-role-link" onClick={onShowRoleLogin}>
            Coba masuk sebagai peran demo
          </button>
        </>
      )}
    </div>
  );
};

export default SlidingAuthCard;

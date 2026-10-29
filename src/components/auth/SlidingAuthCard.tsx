/**
 * SlidingAuthCard — Masuk/Daftar EZRAB dengan kartu dua panel: panel
 * panggung maskot animasi (LoginMatesScene) + panel form.
 *
 * Port desain login animasi final yang disetujui user (2026-10-29):
 * - Mood karakter idle/nosy/shy/exposed mengikuti fokus form: email =
 *   nosy (kepo), kata sandi = shy (menutup mata), kata sandi terlihat =
 *   exposed. Kursor menggerakkan wajah/helm karakter (--mx/--my) dan
 *   khusus mata maskot utama lewat tracker tersendiri (--hx/--hy);
 *   badan maskot utama terkunci diam (stationary lock di CSS).
 * - Klik tombol submit memicu animasi pop karakter dari bawah; error
 *   validasi menggoyang kartu.
 *
 * Perilaku app TIDAK berubah: props sama, submit/validasi/Google/demo
 * sama, dan login berhasil tetap menunggu 1,4 dtk sebelum
 * onSuccessLogin agar animasinya sempat terlihat. Memakai
 * services/supabaseClient milik branch ini (bukan AuthContext).
 *
 * Deviasi sadar dari desain pratinjau: baris "ingat saya / lupa kata
 * sandi" tidak di-port (belum ada perilaku app di baliknya — desain
 * pratinjau memalsukan tautan reset terkirim), dan judul memakai teks
 * app berbahasa Indonesia yang sudah ada.
 */
import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, LogOut, X } from 'lucide-react';
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
import { LoginMatesScene } from './LoginMatesScene';
import './sliding-auth.css';

export type SlidingAuthTab = 'masuk' | 'daftar';
type Mood = 'idle' | 'nosy' | 'shy' | 'exposed';
type FocusField = 'email' | 'password' | null;

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

const clampUnit = (v: number) => Math.max(-1, Math.min(1, v));

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
  const successTimer = React.useRef<number | null>(null);

  /* ---- State mesin mood desain ---- */
  const [focusField, setFocusField] = useState<FocusField>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [peekToggle, setPeekToggle] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [shaking, setShaking] = useState(false);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const popTimer = React.useRef<number | null>(null);
  const shakeTimer = React.useRef<number | null>(null);
  /** Target tracking kursor global (--mx/--my), ditulis mousemove + input email. */
  const trackTarget = React.useRef({ x: 0, y: 0 });
  const focusRef = React.useRef<FocusField>(null);

  const mood: Mood =
    showPassword && password.length > 0
      ? 'exposed'
      : focusField === 'password'
        ? 'shy'
        : focusField === 'email'
          ? 'nosy'
          : 'idle';
  const moodRef = React.useRef<Mood>(mood);
  React.useEffect(() => {
    moodRef.current = mood;
    focusRef.current = focusField;
  });

  React.useEffect(
    () => () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current);
      if (popTimer.current !== null) window.clearTimeout(popTimer.current);
      if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current);
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

  /* ---- Tracking kursor global: wajah/helm karakter mengikuti kursor
         (lerp rAF 0.35 seperti desain; saat email fokus, mousemove diabaikan
         dan target diatur progres ketikan email). ---- */
  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let curX = 0;
    let curY = 0;
    let raf = 0;
    const loop = () => {
      curX += (trackTarget.current.x - curX) * 0.35;
      curY += (trackTarget.current.y - curY) * 0.35;
      card.style.setProperty('--mx', curX.toFixed(3));
      card.style.setProperty('--my', curY.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onMove = (e: MouseEvent) => {
      if (focusRef.current === 'email') return;
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width * 0.26;
      const centerY = rect.top + rect.height * 0.68;
      trackTarget.current = {
        x: clampUnit((e.clientX - centerX) / 210),
        y: clampUnit((e.clientY - centerY) / 210),
      };
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  /* ---- Eye tracking maskot utama: hanya mata yang bergerak (interval
         lerp konvergen menulis --hx/--hy pada elemen hero); pointer keluar
         kartu/jendela -> kembali netral; nonaktif bila reduced-motion. ---- */
  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const hero = card.querySelector('.mate--ezrab') as HTMLElement | null;
    if (!hero) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let timerId: number | null = null;
    const loop = () => {
      cx += (tx - cx) * 0.16;
      cy += (ty - cy) * 0.16;
      if (Math.abs(tx - cx) < 0.002) cx = tx;
      if (Math.abs(ty - cy) < 0.002) cy = ty;
      hero.style.setProperty('--hx', cx.toFixed(3));
      hero.style.setProperty('--hy', cy.toFixed(3));
      if (cx === tx && cy === ty && timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };
    const kick = () => {
      if (timerId === null) {
        loop();
        timerId = window.setInterval(loop, 16);
      }
    };
    const onMove = (e: PointerEvent | MouseEvent) => {
      if (reduceMotion.matches) return;
      const r = hero.getBoundingClientRect();
      if (!r.width) return;
      const hx = r.left + r.width / 2;
      const hy = r.top + r.height / 2;
      tx = clampUnit((e.clientX - hx) / 260);
      ty = clampUnit((e.clientY - hy) / 260);
      kick();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('mousemove', onMove, { passive: true });
    card.addEventListener('pointerleave', onLeave);
    card.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      card.removeEventListener('pointerleave', onLeave);
      card.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseleave', onLeave);
      if (timerId !== null) window.clearInterval(timerId);
    };
  }, []);

  /* ---- Kedip berkala + reaksi klik karakter (blink + bounce) ---- */
  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const mates = Array.from(card.querySelectorAll('.mate'));
    let cancelled = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const scheduleBlink = () => {
      later(() => {
        if (cancelled) return;
        const m = moodRef.current;
        if (m === 'idle' || m === 'nosy') {
          mates.forEach((mate, idx) => {
            if (Math.random() > 0.25 || idx === 3) {
              later(() => {
                mate.classList.add('is-blinking');
                later(() => mate.classList.remove('is-blinking'), 140);
              }, idx * 55);
            }
          });
        }
        scheduleBlink();
      }, 2200 + Math.random() * 2600);
    };
    scheduleBlink();
    const clickHandlers: Array<{ el: Element; fn: () => void }> = [];
    mates.forEach((mate) => {
      const fn = () => {
        mate.classList.add('is-blinking');
        mate.classList.remove('mate-bounce');
        void mate.getBoundingClientRect();
        mate.classList.add('mate-bounce');
        later(() => mate.classList.remove('is-blinking'), 180);
      };
      mate.addEventListener('click', fn);
      clickHandlers.push({ el: mate, fn });
    });
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      clickHandlers.forEach(({ el, fn }) => el.removeEventListener('click', fn));
    };
  }, []);

  const triggerPop = () => {
    setLoggingIn(true);
    if (popTimer.current !== null) window.clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(() => setLoggingIn(false), 1250);
  };

  const triggerShake = () => {
    setShaking(true);
    if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShaking(false), 500);
  };

  const switchMode = (toSignUp: boolean) => {
    setIsSignUp(toSignUp);
    setError(null);
    setNotice(null);
    setFocusField(null);
  };

  const submit = async (e: React.FormEvent, forSignUp: boolean) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    // Pop karakter dari bawah setiap klik submit (sesuai desain).
    triggerPop();

    const failValidation = (msg: string) => {
      setError(msg);
      triggerShake();
    };

    if (!isSupabaseConfigured()) {
      failValidation('Layanan autentikasi Supabase belum terhubung atau konfigurasi belum lengkap.');
      return;
    }
    if (forSignUp && !name.trim()) {
      failValidation('Isi nama Anda.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      failValidation('Isi email valid dan kata sandi min. 6 karakter.');
      return;
    }
    if (forSignUp && password !== confirmPassword) {
      failValidation('Konfirmasi kata sandi tidak sama.');
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
        // Animasi pop login dulu (1,4 dtk) baru lanjut ke workspace.
        successShown = true;
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

  const fieldFocus = (field: FocusField) => ({
    onFocus: () => setFocusField(field),
    onBlur: () => {
      if (focusRef.current === field) setFocusField(null);
    },
  });

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

      <div
        ref={cardRef}
        className={`sac2-card${loggingIn ? ' is-logging-in' : ''}${shaking ? ' shake' : ''}`}
        data-mood={mood}
        data-peek={peekToggle ? 'true' : 'false'}
      >
        {/* ---- Panel panggung maskot ---- */}
        <div className="stage-panel" aria-hidden="true">
          <LoginMatesScene />
        </div>

        {/* ---- Panel form ---- */}
        <div className="form-panel">
          {checking ? (
            <div className="sac2-state">
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--ez-color-primary)' }} />
              <p>Memeriksa sesi…</p>
            </div>
          ) : currentUserEmail ? (
            <div className="sac2-state">
              <h2>Sudah masuk</h2>
              <p>
                Masuk sebagai <strong>{currentUserEmail}</strong>
              </p>
              <div className="sac2-state-row">
                <button type="button" className="primary-btn sac2-btn-auto" onClick={onSuccessLogin}>
                  Lanjut ke Aplikasi
                </button>
                <button type="button" className="sac2-btn-secondary" onClick={() => void handleSignOut()}>
                  <LogOut size={14} /> Keluar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="sac2-logo-wrap">
                <img src="/images/ez-logo-glossy.png" alt="EZRAB" style={{ width: 60, height: 60, display: 'block' }} />
              </div>
              <div className="sac2-form-head">
                <h2 className="sac2-form-title">{isSignUp ? 'Buat Akun EZRAB' : 'Masuk ke EZRAB'}</h2>
                <p className="sac2-form-subtitle">
                  {isSignUp
                    ? 'Daftar gratis dan susun RAB pertama Anda dalam hitungan menit'
                    : 'Masuk untuk melanjutkan proyek, QTO, dan RAB Anda'}
                </p>
              </div>

              <form onSubmit={(e) => void submit(e, isSignUp)}>
                {isSignUp && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="sac2-name">Nama lengkap</label>
                    <div className="input-line">
                      <input
                        id="sac2-name"
                        type="text"
                        className="text-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Nama lengkap Anda"
                        autoComplete="name"
                        {...fieldFocus(null)}
                      />
                    </div>
                  </div>
                )}

                <div className="field-group">
                  <label className="field-label" htmlFor="sac2-email">Email</label>
                  <div className="input-line">
                    <input
                      id="sac2-email"
                      type="email"
                      className="text-input"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        // Karakter menoleh mengikuti progres ketikan email (desain).
                        const progress = Math.min(1, e.target.value.length / 24);
                        trackTarget.current = { x: 0.35 + progress * 0.65, y: -0.35 };
                      }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      {...fieldFocus('email')}
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="sac2-password">Kata sandi</label>
                  <div className="input-line">
                    <input
                      id="sac2-password"
                      type={showPassword ? 'text' : 'password'}
                      className="text-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignUp ? 'Min. 6 karakter' : '••••••••'}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      {...fieldFocus('password')}
                    />
                    <button
                      type="button"
                      className={`eye-btn${showPassword ? ' is-on' : ''}`}
                      onClick={() => setShowPassword((v) => !v)}
                      onMouseEnter={() => setPeekToggle(true)}
                      onMouseLeave={() => setPeekToggle(false)}
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      title="Tampilkan / sembunyikan kata sandi"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {isSignUp && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="sac2-confirm">Konfirmasi kata sandi</label>
                    <div className="input-line">
                      <input
                        id="sac2-confirm"
                        type={showPassword ? 'text' : 'password'}
                        className="text-input"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        {...fieldFocus('password')}
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="sac2-banner sac2-banner-error">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
                {notice && (
                  <div className="sac2-banner sac2-banner-ok">
                    <CheckCircle2 size={14} /> {notice}
                  </div>
                )}

                <button type="submit" className="primary-btn" disabled={busy || googleBusy}>
                  {busy ? spinner : null} {isSignUp ? 'Daftar' : 'Masuk'}
                </button>

                <div className="or-divider">
                  <div className="or-line" />
                  <span className="or-text">atau</span>
                </div>

                <button
                  type="button"
                  className="google-btn"
                  onClick={() => void googleLogin()}
                  disabled={googleBusy || busy}
                >
                  {googleBusy ? <Loader2 size={15} className="animate-spin" /> : <GoogleIcon />}
                  <span>{isSignUp ? 'Daftar dengan Google' : 'Masuk dengan Google'}</span>
                </button>
              </form>

              <p className="signup-footer">
                <span>{isSignUp ? 'Sudah punya akun?' : 'Belum punya akun?'}</span>
                <button type="button" className="signup-link" onClick={() => switchMode(!isSignUp)}>
                  {isSignUp ? 'Masuk' : 'Daftar gratis'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      {!checking && !currentUserEmail && (
        <button type="button" className="sac-role-link" onClick={onShowRoleLogin}>
          Coba masuk sebagai peran demo
        </button>
      )}
    </div>
  );
};

export default SlidingAuthCard;

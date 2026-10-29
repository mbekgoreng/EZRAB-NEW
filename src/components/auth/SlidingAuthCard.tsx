/**
 * SlidingAuthCard — Masuk/Daftar EZRAB dengan kartu dua panel: panel
 * panggung maskot animasi (LoginMatesScene) + panel form.
 *
 * Port desain login animasi final yang disetujui user (2026-10-29):
 * - Mood karakter idle/nosy/shy/exposed mengikuti fokus form: email =
 *   nosy (kepo), kata sandi = shy (menutup mata), kata sandi terlihat =
 *   exposed. Kursor menggerakkan wajah/helm karakter (--mx/--my) dan
 *   khusus mata maskot utama lewat tracker tersendiri (--hx/--hy).
 *   Maskot utama bergerak seperti karakter lain (miring/sway, pop,
 *   bounce klik) — kunci diam lama dicabut atas keputusan user
 *   2026-10-29; batch audit landing+auth 2026-10-29 juga menambahkan:
 *   pesan demo-only yang eksplisit (AUTH-02), sinkronisasi mode↔URL
 *   (AUTH-06), validasi per-field + pesan error aman (AUTH-09), pesan
 *   daftar sadar konfirmasi email (AUTH-10), scene dimuat lazy
 *   (PERF-01), dan tracker kursor menghormati reduced-motion (A11Y-01).
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
import './sliding-auth.css';

// PERF-01 (audit 2026-10-29): scene maskot adalah SVG inline ~386 KB —
// dimuat lazy agar tidak membebani bundle utama halaman landing; kartu
// login hanya tampil di route/modal auth, jadi chunk-nya terpisah.
const LoginMatesScene = React.lazy(() =>
  import('./LoginMatesScene').then((m) => ({ default: m.LoginMatesScene })),
);

export type SlidingAuthTab = 'masuk' | 'daftar';
type Mood = 'idle' | 'nosy' | 'shy' | 'exposed';
type FocusField = 'email' | 'password' | null;

interface Props {
  initialTab?: SlidingAuthTab;
  onSuccessLogin: () => void;
  onClose: () => void;
  /** Tampilkan panel peran demo (PIN) sebagai ganti. */
  onShowRoleLogin: () => void;
  /** AUTH-06: dipanggil saat pengguna menukar mode Masuk/Daftar. Di
      varian 'page' pemilik route menavigasikan URL (/masuk ↔ /daftar)
      agar URL, judul, dan mode form tidak pernah berbeda. */
  onModeChange?: (tab: SlidingAuthTab) => void;
  /** True bila backend login belum aktif: tampilkan banner demo-only. */
  demoOnly?: boolean;
  /** 'overlay' (bawaan — lapisan fixed; tak ada pemanggil aktif sejak
      AuthModal dipensiunkan) atau
      'page' (halaman route /masuk & /daftar — .sac-page mengalir sebagai
      dokumen dan banner demo-only tampil in-flow di atas kartu). */
  variant?: 'overlay' | 'page';
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

/**
 * AUTH-09 (audit 2026-10-29): pesan error provider TIDAK ditampilkan
 * mentah ke pengguna — petakan ke pesan aman berbahasa Indonesia
 * (selaras friendlyAuthError di AuthContext).
 */
function friendlyAuthError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email atau kata sandi salah.';
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
  if (m.includes('user already registered') || m.includes('already exists'))
    return 'Email sudah terdaftar. Silakan masuk.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider'))
    return 'Login Google belum diaktifkan. Hubungi admin.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'Koneksi bermasalah. Periksa jaringan Anda, lalu coba lagi.';
  if (m.includes('password')) return 'Kata sandi tidak memenuhi syarat (min. 6 karakter).';
  return 'Gagal autentikasi. Coba lagi.';
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

export const SlidingAuthCard: React.FC<Props> = ({
  initialTab = 'masuk',
  onSuccessLogin,
  onClose,
  onShowRoleLogin,
  onModeChange,
  demoOnly = false,
  variant = 'overlay',
}) => {
  const [isSignUp, setIsSignUp] = useState(initialTab === 'daftar');
  // AUTH-06: mode mengikuti route — saat URL berpindah /masuk ↔ /daftar
  // (termasuk tombol kembali browser), form menyesuaikan, bukan sebaliknya.
  React.useEffect(() => {
    setIsSignUp(initialTab === 'daftar');
  }, [initialTab]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
    // A11Y-01: pengguna reduced-motion tidak dilacak kursornya sama
    // sekali (sama seperti tracker mata maskot utama di bawah).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
    setFieldErrors({});
    setNotice(null);
    setFocusField(null);
    // AUTH-06: di halaman route, pertukaran mode menavigasikan URL agar
    // /masuk dan /daftar selalu cocok dengan mode form + judul halaman.
    if (variant === 'page' && onModeChange) {
      onModeChange(toSignUp ? 'daftar' : 'masuk');
    }
  };

  const submit = async (e: React.FormEvent, forSignUp: boolean) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setNotice(null);
    // Pop karakter dari bawah setiap klik submit (sesuai desain).
    triggerPop();

    const failValidation = (msg: string) => {
      setError(msg);
      triggerShake();
    };

    // AUTH-02: selama demo-only formulir email nonaktif — jangan pernah
    // mengirim kredensial ke provider yang tidak terkonfigurasi.
    if (demoOnly) {
      failValidation('Login email belum diaktifkan. Gunakan peran demo untuk masuk.');
      return;
    }
    if (!isSupabaseConfigured()) {
      failValidation('Layanan autentikasi Supabase belum terhubung atau konfigurasi belum lengkap.');
      return;
    }

    // AUTH-09: validasi per-field — setiap field menyebut masalahnya
    // sendiri (bukan satu pesan gabungan), dan error hilang saat diketik.
    const nextErrors: FieldErrors = {};
    if (forSignUp && !name.trim()) nextErrors.name = 'Isi nama Anda.';
    if (!email.trim()) nextErrors.email = 'Isi email Anda.';
    else if (!EMAIL_FORMAT.test(email.trim())) nextErrors.email = 'Format email tidak valid.';
    if (!password) nextErrors.password = 'Isi kata sandi Anda.';
    else if (password.length < 6) nextErrors.password = 'Kata sandi minimal 6 karakter.';
    if (forSignUp && password && password !== confirmPassword)
      nextErrors.confirm = 'Konfirmasi kata sandi tidak sama.';
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      triggerShake();
      return;
    }

    setBusy(true);
    let successShown = false;
    try {
      const r = forSignUp
        ? await signUpWithEmailPassword(email.trim(), password, name.trim())
        : await signInWithEmailPassword(email.trim(), password);
      if (r.error) {
        setError(friendlyAuthError(r.error.message));
      } else if (forSignUp) {
        if (r.session) {
          // AUTH-10: konfirmasi email NONAKTIF — sesi langsung terbentuk,
          // pengguna benar-benar sudah masuk; perlakukan seperti login.
          successShown = true;
          successTimer.current = window.setTimeout(() => onSuccessLogin(), 1400);
        } else {
          // AUTH-10: konfirmasi email AKTIF — akun menunggu verifikasi;
          // jangan menyuruh pengguna langsung masuk sebelum konfirmasi.
          setNotice(
            'Akun dibuat. Periksa email Anda dan selesaikan konfirmasi, lalu masuk dengan akun Anda.',
          );
          setIsSignUp(false);
          if (variant === 'page' && onModeChange) onModeChange('masuk');
        }
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
    if (demoOnly) {
      setError('Login email belum diaktifkan. Gunakan peran demo untuk masuk.');
      return;
    }
    setGoogleBusy(true);
    try {
      const { error: gErr } = await signInWithGoogleOAuth();
      if (gErr) setError(friendlyAuthError(gErr.message));
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
    <div className={variant === 'page' ? 'sac-page sac-page--route' : 'sac-page'}>
      {demoOnly && (
        <div
          role="note"
          style={
            variant === 'page'
              ? {
                  // Halaman route: banner mengalir sebagai blok biasa di
                  // atas kartu — tidak menimpa apa pun.
                  flexShrink: 0,
                  width: 'min(560px, 100%)',
                  margin: '0 0 14px',
                  textAlign: 'center',
                  fontSize: '13px',
                  lineHeight: 1.55,
                  color: '#1e40af',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '10px 12px',
                }
              : {
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
                }
          }
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
        {/* Tombol tutup menempel di pojok kartu (bukan melayang di pojok
            viewport) — di halaman route ini jalan kembali ke beranda. */}
        <button type="button" className="sac-close" onClick={onClose} aria-label="Tutup">
          <X size={20} />
        </button>

        {/* ---- Panel panggung maskot ---- */}
        <div className="stage-panel" aria-hidden="true">
          <React.Suspense fallback={null}>
            <LoginMatesScene />
          </React.Suspense>
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
                <img src="/images/ez-logo-glossy.png" alt="EZRAB" style={{ width: 46, height: 46, display: 'block' }} />
              </div>
              <div className="sac2-form-head">
                <h2 className="sac2-form-title">{isSignUp ? 'Buat Akun EZRAB' : 'Masuk ke EZRAB'}</h2>
                <p className="sac2-form-subtitle">
                  {demoOnly
                    ? isSignUp
                      ? 'Pendaftaran email belum dibuka — EZRAB masih tahap pengujian. Coba lewat peran demo.'
                      : 'Login email belum diaktifkan — masuk lewat peran demo untuk mencoba EZRAB.'
                    : isSignUp
                      ? 'Daftar gratis dan susun RAB pertama Anda dalam hitungan menit'
                      : 'Masuk untuk melanjutkan proyek, QTO, dan RAB Anda'}
                </p>
              </div>

              <form onSubmit={(e) => void submit(e, isSignUp)}>
                {demoOnly && (
                  <div className="sac2-banner sac2-banner-ok" role="note">
                    Formulir email nonaktif selama tahap pengujian — gunakan
                    tombol peran demo di bawah kartu untuk masuk.
                  </div>
                )}
                {isSignUp && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="sac2-name">Nama lengkap</label>
                    <div className="input-line">
                      <input
                        id="sac2-name"
                        type="text"
                        className="text-input"
                        value={name}
                        disabled={demoOnly}
                        required
                        aria-invalid={fieldErrors.name ? true : undefined}
                        aria-describedby={fieldErrors.name ? 'sac2-name-error' : undefined}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (error) setError(null);
                          if (fieldErrors.name)
                            setFieldErrors((prev) => ({ ...prev, name: undefined }));
                        }}
                        placeholder="Nama lengkap Anda"
                        autoComplete="name"
                        {...fieldFocus(null)}
                      />
                    </div>
                    {fieldErrors.name && (
                      <p className="sac2-field-error" id="sac2-name-error" role="alert">
                        {fieldErrors.name}
                      </p>
                    )}
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
                      disabled={demoOnly}
                      required
                      aria-invalid={fieldErrors.email ? true : undefined}
                      aria-describedby={fieldErrors.email ? 'sac2-email-error' : undefined}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                        if (fieldErrors.email)
                          setFieldErrors((prev) => ({ ...prev, email: undefined }));
                        // Karakter menoleh mengikuti progres ketikan email (desain).
                        const progress = Math.min(1, e.target.value.length / 24);
                        trackTarget.current = { x: 0.35 + progress * 0.65, y: -0.35 };
                      }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      {...fieldFocus('email')}
                    />
                  </div>
                  {fieldErrors.email && (
                    <p className="sac2-field-error" id="sac2-email-error" role="alert">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="sac2-password">Kata sandi</label>
                  <div className="input-line">
                    <input
                      id="sac2-password"
                      type={showPassword ? 'text' : 'password'}
                      className="text-input"
                      value={password}
                      disabled={demoOnly}
                      required
                      aria-invalid={fieldErrors.password ? true : undefined}
                      aria-describedby={fieldErrors.password ? 'sac2-password-error' : undefined}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                        if (fieldErrors.password)
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }}
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
                      aria-pressed={showPassword}
                      title="Tampilkan / sembunyikan kata sandi"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="sac2-field-error" id="sac2-password-error" role="alert">
                      {fieldErrors.password}
                    </p>
                  )}
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
                        disabled={demoOnly}
                        required
                        aria-invalid={fieldErrors.confirm ? true : undefined}
                        aria-describedby={fieldErrors.confirm ? 'sac2-confirm-error' : undefined}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (error) setError(null);
                          if (fieldErrors.confirm)
                            setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
                        }}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        {...fieldFocus('password')}
                      />
                    </div>
                    {fieldErrors.confirm && (
                      <p className="sac2-field-error" id="sac2-confirm-error" role="alert">
                        {fieldErrors.confirm}
                      </p>
                    )}
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

                <button type="submit" className="primary-btn" disabled={demoOnly || busy || googleBusy}>
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
                  disabled={demoOnly || googleBusy || busy}
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

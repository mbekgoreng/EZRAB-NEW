import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { ProjectProvider } from './context/ProjectContext';
import { ExactLandingPage } from './components/landing/ExactLandingPage';
import { AboutPage } from './components/about/AboutPage';
import { FeaturesPage } from './components/landing/features/FeaturesPage';
import { AdvantagesPage } from './components/landing/advantages/AdvantagesPage';
import { AuthRoutePage } from './components/auth/AuthRoutePage';
import { AcceptInvitationPage } from './components/auth/AcceptInvitationPage';
import { WorkspaceView } from './components/dashboard/WorkspaceView';
import { DemoModal } from './components/common/DemoModal';
import { AuthNoticePage, PrivacyPage, PublicNotFoundPage, TermsPage } from './components/public/PublicInfoPages';
import { NotificationProvider } from './notifications/NotificationContext';
import {
  OnboardingTour,
  migrateLegacyOnboardingFlag,
  shouldShowOnboarding,
  useOnboardingTour,
} from './components/onboarding/OnboardingTour';
import { OnboardingProvider } from './components/onboarding/OnboardingContext';
import { ToastProvider } from './components/onboarding/Toast';
import { OnboardingOrchestrator, openDashboardTour } from './components/onboarding/OnboardingOrchestrator';
import { FeatureTutorialPlayer } from './components/onboarding/tutorials/FeatureTutorialPlayer';
import { WelcomeSlotGuard } from './components/onboarding/tutorials/WelcomeSlotGuard';
import { isAppPath, isSafeInternalReturnTo, navigateTo, parseWorkspaceRoute, paths, routeForMenu, routeLabel } from './routing/routes';
import { useBrowserLocation } from './routing/useBrowserLocation';
import { resolveAuthMode, resolveLoginUi, type AuthMode } from './auth/authMode';
import { PasscodeGate } from './auth/PasscodeGate';

// Login dinonaktifkan sementara (perintah user 2026-10-12): seluruh pintu
// masuk login disembunyikan — CTA "Masuk/Daftar" langsung ke dashboard
// tanpa menampilkan modal atau halaman login. Ubah ke true untuk
// mengaktifkan kembali.
//
// FAIL-SAFE (audit auth 2026-10-17): flag true TANPA konfigurasi Supabase
// yang valid TIDAK mengunci owner dan TIDAK crash — aplikasi jatuh ke mode
// 'failsafe-demo' (akses terbuka seperti hari ini + banner peringatan).
// Lihat src/auth/authMode.ts untuk matriks resolusinya.
const AUTH_ENABLED = false;

// Login UI frontend-only (perintah user 2026-10-28): tombol "Masuk" /
// "Coba Gratis" membuka halaman login /masuk & /daftar walau AUTH_ENABLED=false. Backend
// login TIDAK ikut aktif — user akan mendesain ulang backend nanti.
// Di mode ini modal berjalan DEMO-ONLY: form email tampil, tapi submit
// email/Google gagal jujur karena Supabase belum terkonfigurasi (lihat
// SlidingAuthCard), dan jalur masuk yang jalan adalah peran demo lokal
// (RoleLoginPanel + forceDemoRoles). Owner tidak pernah terkunci:
// masuk demo → workspace seperti akses terbuka hari ini.
// Membalik flag ini ke false mengembalikan perilaku lama (CTA langsung
// ke workspace, modal tidak pernah tampil).
const LOGIN_UI_ENABLED = true;

/**
 * Mode auth efektif hasil resolusi flag + env. Dihitung sekali di module
 * scope karena import.meta.env di-inline saat build (vite).
 * - 'open'          : AUTH_ENABLED=false → perilaku hari ini (akses terbuka).
 * - 'real-login'    : AUTH_ENABLED=true + Supabase valid → login wajib aktif.
 * - 'failsafe-demo' : AUTH_ENABLED=true tapi Supabase belum valid → akses
 *                     terbuka + banner. Owner tidak pernah terkunci.
 */
const AUTH_MODE: AuthMode = resolveAuthMode(AUTH_ENABLED);

/** Keputusan tampilnya modal login (lihat src/auth/authMode.ts). */
const LOGIN_UI = resolveLoginUi(AUTH_MODE, LOGIN_UI_ENABLED);

if (typeof console !== 'undefined' && AUTH_MODE === 'failsafe-demo') {
  console.warn(
    '[EZRAB auth] AUTH_ENABLED=true tetapi konfigurasi Supabase belum valid ' +
      '(butuh VITE_SUPABASE_URL https:// + VITE_SUPABASE_ANON_KEY yang cukup panjang). ' +
      'Berjalan dalam mode fail-safe demo: akses terbuka, banner peringatan ditampilkan.'
  );
}

const FAILSAFE_BANNER_DISMISS_KEY = 'ezrab_auth_failsafe_dismissed';

/**
 * Banner fail-safe: hanya muncul saat AUTH_MODE === 'failsafe-demo'.
 * Dapat disembunyikan per sesi (sessionStorage); muncul lagi di sesi baru.
 */
const AuthFailsafeBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(FAILSAFE_BANNER_DISMISS_KEY) === '1') {
        setDismissed(true);
      }
    } catch {
      /* storage tidak tersedia — banner tetap tampil */
    }
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(FAILSAFE_BANNER_DISMISS_KEY, '1');
    } catch {
      /* abaikan */
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '10px 16px',
        background: '#FEF3C7',
        borderBottom: '2px solid #F59E0B',
        color: '#92400E',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.5,
        position: 'relative',
        zIndex: 1000,
      }}
    >
      <span aria-hidden="true">⚠️</span>
      <span>
        Mode demo (fail-safe): konfigurasi login (Supabase) belum lengkap — semua fitur
        terbuka tanpa login. Aktifkan login resmi sebelum go-live publik.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Sembunyikan peringatan"
        style={{
          marginLeft: 8,
          border: '1px solid #F59E0B',
          background: 'transparent',
          color: '#92400E',
          borderRadius: 8,
          padding: '2px 10px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Sembunyikan
      </button>
    </div>
  );
};

// Blog host lazy: markdown blog tidak ikut bundle awal aplikasi utama.
const BlogHostPage = lazy(() =>
  import('./blog/BlogHostPage').then((m) => ({ default: m.BlogHostPage })),
);

export const App: React.FC = () => {
  const location = useBrowserLocation();
  const workspaceRoute = parseWorkspaceRoute(location.pathname, location.search);
  const isWorkspace = isAppPath(location.pathname);
  const isAccess = location.pathname === '/access';
  // Halaman publik penerimaan undangan: /accept-invitation/<token>
  // Token hanya dipakai untuk pemanggilan API (body), tidak dirender.
  const invitationMatch = location.pathname.match(/^\/accept-invitation\/([^/]+)\/?$/);
  const invitationToken = invitationMatch ? decodeURIComponent(invitationMatch[1]) : null;
  const isAbout = location.pathname === '/about' || location.hash === '#tentang';
  const isFeatures = location.pathname === '/fitur';
  const isAdvantages = location.pathname === '/keunggulan';
  // Halaman publik jujur (F6): /masuk & /daftar selama login nonaktif TIDAK
  // lagi jatuh diam-diam ke landing; /privacy & /terms punya halaman nyata;
  // path publik lain yang tak dikenal → 404 publik.
  const isAuthNotice =
    location.pathname === '/masuk' ||
    location.pathname === '/daftar' ||
    location.pathname.startsWith('/masuk/');
  const authNoticeTab: 'masuk' | 'daftar' = location.pathname === '/daftar' ? 'daftar' : 'masuk';
  // Route login sungguhan: /masuk & /daftar merender halaman login animasi
  // (AuthRoutePage) selama UI login aktif. Bila UI login mati
  // (LOGIN_UI.showModal=false, mis. mode 'failsafe-demo'), kedua route
  // jatuh ke AuthNoticePage seperti sebelumnya — owner tidak terkunci.
  const isAuthRoute =
    (location.pathname === '/masuk' || location.pathname === '/daftar') && LOGIN_UI.showModal;
  const isPrivacy = location.pathname === '/privacy';
  const isTerms = location.pathname === '/terms';
  const isHomePath = location.pathname === '/' || location.pathname === '';
  // Host blog: fallback SPA bila rewrite statis /blog/* tidak tersaji.
  const isBlogHost =
    typeof window !== 'undefined' && window.location.hostname === 'blog.ezrab.site';

  const [demoModalOpen, setDemoModalOpen] = useState(false);

  // Boot screen dihapus (permintaan user): aplikasi langsung tampil.
  // Flag migrasi onboarding tetap dijalankan sekali saat mount.
  const [booted] = useState(true);
  const { open: tourOpen, closeTour } = useOnboardingTour();
  const [tourPending, setTourPending] = useState(false);
  /** welcome otomatis hanya ditampilkan sekali per sesi, saat masuk workspace */
  const autoTourShownRef = useRef(false);

  useEffect(() => {
    if (location.pathname === paths.app()) navigateTo(paths.dashboard(), { replace: true });
  }, [location.pathname]);

  useEffect(() => {
    if (isBlogHost) document.title = 'Blog EZRAB';
    else if (isWorkspace) document.title = workspaceRoute.status === 'not-found' ? 'Halaman Tidak Ditemukan — EZRAB' : `${routeLabel(workspaceRoute)} — EZRAB`;
    else if (isAccess) document.title = 'Akses Dashboard — EZRAB';
    else if (invitationToken) document.title = 'Terima Undangan — EZRAB';
    else if (isAbout) document.title = 'Tentang EZRAB';
    else if (isFeatures) document.title = 'Kenali EZRAB — Fitur Lengkap';
    else if (isAdvantages) document.title = 'Keunggulan EZRAB — Mengapa Memilih EZRAB';
    else if (isPrivacy) document.title = 'Kebijakan Privasi — EZRAB';
    else if (isTerms) document.title = 'Ketentuan Layanan — EZRAB';
    else if (isAuthRoute) document.title = authNoticeTab === 'daftar' ? 'Daftar — EZRAB' : 'Masuk — EZRAB';
    else if (isAuthNotice) document.title = authNoticeTab === 'daftar' ? 'Daftar — EZRAB' : 'Masuk — EZRAB';
    else if (!isHomePath) document.title = 'Halaman Tidak Ditemukan — EZRAB';
    else document.title = 'EZRAB — RAB & Estimasi Konstruksi';
  }, [isAbout, isFeatures, isAdvantages, isWorkspace, workspaceRoute, isPrivacy, isTerms, isAuthRoute, isAuthNotice, authNoticeTab, isHomePath]);

  useEffect(() => {
    migrateLegacyOnboardingFlag(); // idempoten: pengguna lama tidak ditanya ulang
  }, []);

  // Welcome otomatis HANYA di dalam workspace (/app/*), bukan di landing page.
  // Mencakup alur landing -> klik Masuk -> dashboard (tanpa reboot).
  useEffect(() => {
    if (!booted || !isWorkspace || autoTourShownRef.current) return;
    if (!shouldShowOnboarding()) return;
    autoTourShownRef.current = true;
    const t = window.setTimeout(() => setTourPending(true), 900);
    return () => window.clearTimeout(t);
  }, [booted, isWorkspace]);

  const handleTourClose = useCallback((completed: boolean) => {
    setTourPending(false);
    closeTour();
    // Welcome selesai (bukan dilewati) → tawarkan dashboard tour jika belum pernah dilihat.
    // Berlaku juga saat welcome dibuka ulang via "Tutorial EZRAB" (bug 2026-10-16).
    if (completed) {
      try {
        const seen = window.localStorage.getItem('ezrab_tour_seen_dashboard-tour');
        if (seen !== '1') {
          setTimeout(() => openDashboardTour(), 600);
        }
      } catch {
        /* abaikan */
      }
    }
  }, [closeTour]);

  const handleSetWorkspace = (val: boolean) => {
    navigateTo(val ? paths.dashboard() : paths.home());
  };

  const handleOpenAbout = () => {
    navigateTo(paths.about());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenFeaturesPage = () => {
    navigateTo('/fitur');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenPricing = () => {
    navigateTo(paths.home());
    setTimeout(() => {
      document.getElementById('harga')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const handleOpenAuth = (tab: 'masuk' | 'daftar' = 'masuk') => {
    // Pintu masuk login sekarang berupa route sendiri (/masuk & /daftar)
    // selama UI login aktif — mode 'real-login' (penuh) dan 'open' +
    // LOGIN_UI_ENABLED (demo-only). Mode lain (termasuk 'failsafe-demo')
    // selalu memberi akses terbuka — tidak pernah mengunci owner.
    if (LOGIN_UI.showModal) {
      navigateTo(tab === 'daftar' ? '/daftar' : '/masuk');
      window.scrollTo({ top: 0 });
      return;
    }
    handleSetWorkspace(true);
  };

  const handleReturnToLanding = () => {
    navigateTo(paths.home());
    setDemoModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenFeatures = () => {
    handleReturnToLanding();
    setTimeout(() => {
      const el = document.getElementById('fitur');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  let content: React.ReactNode = null;

  if (isBlogHost && !isWorkspace && !isAccess) {
    // Subdomain blog: indeks/artikel dari data markdown yang sama — bukan
    // landing (audit A-1). Path /app/* tetap ke workspace normal.
    content = (
      <Suspense
        fallback={
          <div style={{ padding: '48px', fontFamily: 'system-ui' }}>
            Memuat Blog EZRAB…
          </div>
        }
      >
        <BlogHostPage pathname={location.pathname} />
      </Suspense>
    );
  } else if (invitationToken) {
    // Penerimaan undangan bersifat publik (di luar shell workspace dan di
    // luar PasscodeGate) — keamanan ditegakkan server-side oleh endpoint
    // /api/invitations/* (validasi token + redeem atomik ber-JWT).
    content = <AcceptInvitationPage token={invitationToken} />;
  } else if (isAccess) {
    // Halaman gerbang akses (target redirect middleware untuk /app/* tanpa
    // sesi). Validasi kode sepenuhnya di server — lihat src/auth/passcode.ts.
    content = (
      <PasscodeGate enabled={AUTH_MODE !== 'real-login'} standalone />
    );
  } else if (isWorkspace) {
    // KUNCI SEMENTARA (user 2026-10-20): seluruh /app/* digerbang kode
    // akses selama login dimatikan; validasi di server (bukan client).
    // Nonaktif otomatis saat AUTH_MODE menjadi 'real-login'.
    content = (
      <PasscodeGate enabled={AUTH_MODE !== 'real-login'}>
        <ProjectProvider>
          <WorkspaceView
            route={workspaceRoute}
            onBackToLanding={handleReturnToLanding}
            onNavigateMenu={(menu, projectId) => navigateTo(routeForMenu(menu, projectId))}
          />
        </ProjectProvider>
      </PasscodeGate>
    );
  } else if (isAbout) {
    content = (
      <AboutPage
        onBackToLanding={handleReturnToLanding}
        onOpenWorkspace={() => handleOpenAuth('daftar')}
        onOpenFeatures={handleOpenFeatures}
      />
    );
  } else if (isFeatures) {
    content = (
      <FeaturesPage
        onBackToLanding={handleReturnToLanding}
        onOpenAuth={handleOpenAuth}
        onOpenWorkspace={() => handleOpenAuth('daftar')}
        onOpenPricing={handleOpenPricing}
        onOpenAdvantages={() => {
          navigateTo('/keunggulan');
          window.scrollTo(0, 0);
        }}
      />
    );
  } else if (isAdvantages) {
    content = (
      <AdvantagesPage
        onBackToLanding={handleReturnToLanding}
        onOpenAuth={handleOpenAuth}
        onOpenWorkspace={() => handleOpenAuth('daftar')}
        onOpenFeatures={handleOpenFeaturesPage}
      />
    );
  } else if (isPrivacy) {
    content = (
      <PrivacyPage
        onBackToLanding={handleReturnToLanding}
        onOpenWorkspace={() => handleSetWorkspace(true)}
      />
    );
  } else if (isTerms) {
    content = (
      <TermsPage
        onBackToLanding={handleReturnToLanding}
        onOpenWorkspace={() => handleSetWorkspace(true)}
      />
    );
  } else if (isAuthRoute) {
    // /masuk & /daftar: halaman login animasi di route sendiri — kartu
    // yang sama seperti modal, tetapi halaman dokumen: bisa di-scroll
    // alami, banner demo-only mengalir di atas kartu, dan tombol kembali
    // menempel di kartu. Login/peran-demo berhasil → masuk aplikasi,
    // persis perilaku modal sebelumnya.
    content = (
      <AuthRoutePage
        initialTab={authNoticeTab}
        demoOnly={LOGIN_UI.demoOnly}
        onSuccessLogin={() => {
          // AUTH-05: tujuan asal (?returnTo=) dipertahankan lewat login —
          // hanya path internal /app yang lolos validasi; selain itu
          // perilaku lama (dashboard) berlaku.
          const returnTo = new URLSearchParams(location.search).get('returnTo');
          if (returnTo && isSafeInternalReturnTo(returnTo) && isAppPath(returnTo)) {
            navigateTo(returnTo);
          } else {
            handleSetWorkspace(true);
          }
        }}
        onBackToLanding={handleReturnToLanding}
      />
    );
  } else if (isAuthNotice) {
    // Sisa jalur pemberitahuan: sub-path /masuk/* dan /masuk & /daftar
    // saat UI login tidak aktif (LOGIN_UI.showModal=false) — tampilkan
    // pemberitahuan jujur + jalan masuk aplikasi, bukan landing diam-diam.
    content = (
      <AuthNoticePage
        tab={authNoticeTab}
        onBackToLanding={handleReturnToLanding}
        onOpenWorkspace={() => handleSetWorkspace(true)}
      />
    );
  } else if (!isHomePath) {
    // Path publik tak dikenal → 404 yang jelas, bukan landing tanpa penjelasan.
    content = (
      <PublicNotFoundPage
        onBackToLanding={handleReturnToLanding}
        onOpenWorkspace={() => handleSetWorkspace(true)}
      />
    );
  } else {
    content = (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--ezrab-bg, var(--ez-hue-slate-bg))',
          color: 'var(--ezrab-text, #0f172a)',
        }}
      >
        {/* Exact Landing Page matching reference design */}
        <ExactLandingPage
          onOpenWorkspace={() => handleSetWorkspace(true)}
          onOpenAuth={(tab) => handleOpenAuth(tab || 'masuk')}
          onOpenDemo={() => setDemoModalOpen(true)}
          onBackToLanding={handleReturnToLanding}
          onOpenAbout={handleOpenAbout}
          onOpenAdvantages={() => {
            navigateTo('/keunggulan');
            window.scrollTo(0, 0);
          }}
        />

        {/* AuthModal lama sudah dipensiunkan (AUTH-07, audit 2026-10-29):
            tidak ada pemanggil yang pernah membukanya sejak CTA pindah ke
            route /masuk & /daftar (AuthRoutePage). */}
        <DemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          onOpenWorkspace={() => handleSetWorkspace(true)}
        />

      </div>
    );
  }

  return (
    <NotificationProvider>
      <ToastProvider>
        <OnboardingProvider>
          {/* Banner fail-safe hanya di mode 'failsafe-demo' (AUTH_ENABLED=true
              tanpa Supabase valid). Di mode 'open'/'real-login' tidak tampil. */}
          {AUTH_MODE === 'failsafe-demo' && <AuthFailsafeBanner />}
          {content}
          <OnboardingTour open={tourOpen || tourPending} onClose={handleTourClose} />
          <OnboardingOrchestrator />
          <FeatureTutorialPlayer />
          <WelcomeSlotGuard active={tourOpen || tourPending} />
        </OnboardingProvider>
      </ToastProvider>
    </NotificationProvider>
  );
};

export default App;

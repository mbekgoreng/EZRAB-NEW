import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectProvider } from './context/ProjectContext';
import { ExactLandingPage } from './components/landing/ExactLandingPage';
import { AboutPage } from './components/about/AboutPage';
import { AuthModal } from './components/auth/AuthModal';
import { WorkspaceView } from './components/dashboard/WorkspaceView';
import { DemoModal } from './components/common/DemoModal';
import { ThemeModal } from './components/common/ThemeModal';
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
import { isAppPath, navigateTo, parseWorkspaceRoute, paths, routeForMenu, routeLabel } from './routing/routes';
import { useBrowserLocation } from './routing/useBrowserLocation';
import { resolveAuthMode, type AuthMode } from './auth/authMode';

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

/**
 * Mode auth efektif hasil resolusi flag + env. Dihitung sekali di module
 * scope karena import.meta.env di-inline saat build (vite).
 * - 'open'          : AUTH_ENABLED=false → perilaku hari ini (akses terbuka).
 * - 'real-login'    : AUTH_ENABLED=true + Supabase valid → AuthModal aktif.
 * - 'failsafe-demo' : AUTH_ENABLED=true tapi Supabase belum valid → akses
 *                     terbuka + banner. Owner tidak pernah terkunci.
 */
const AUTH_MODE: AuthMode = resolveAuthMode(AUTH_ENABLED);

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

export const App: React.FC = () => {
  const location = useBrowserLocation();
  const workspaceRoute = parseWorkspaceRoute(location.pathname, location.search);
  const isWorkspace = isAppPath(location.pathname);
  const isAbout = location.pathname === '/about' || location.hash === '#tentang';

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'masuk' | 'daftar'>('daftar');
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);

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
    if (isWorkspace) document.title = workspaceRoute.status === 'not-found' ? 'Halaman Tidak Ditemukan — EZRAB' : `${routeLabel(workspaceRoute)} — EZRAB`;
    else if (isAbout) document.title = 'Tentang EZRAB';
    else document.title = 'EZRAB — RAB & Estimasi Konstruksi';
  }, [isAbout, isWorkspace, workspaceRoute]);

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

  const handleOpenAuth = (tab: 'masuk' | 'daftar' = 'masuk') => {
    // Fail-safe: mode selain 'real-login' (yaitu 'open' maupun 'failsafe-demo')
    // selalu memberi akses terbuka — tidak pernah mengunci owner.
    if (AUTH_MODE !== 'real-login') {
      handleSetWorkspace(true);
      return;
    }
    setAuthInitialTab(tab);
    setAuthModalOpen(true);
  };

  const handleReturnToLanding = () => {
    navigateTo(paths.home());
    setAuthModalOpen(false);
    setDemoModalOpen(false);
    setThemeModalOpen(false);
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

  if (isWorkspace) {
    content = (
      <ProjectProvider>
        <WorkspaceView
          route={workspaceRoute}
          onBackToLanding={handleReturnToLanding}
          onNavigateMenu={(menu, projectId) => navigateTo(routeForMenu(menu, projectId))}
        />
      </ProjectProvider>
    );
  } else if (isAbout) {
    content = (
      <AboutPage
        onBackToLanding={handleReturnToLanding}
        onOpenWorkspace={() => handleSetWorkspace(true)}
        onOpenFeatures={handleOpenFeatures}
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
          onOpenTheme={() => setThemeModalOpen(true)}
          onBackToLanding={handleReturnToLanding}
          onOpenAbout={handleOpenAbout}
        />

        {/* Modals — AuthModal hanya aktif di mode 'real-login' (fail-safe). */}
        {AUTH_MODE === 'real-login' && (
          <AuthModal
            isOpen={authModalOpen}
            initialTab={authInitialTab}
            onClose={() => setAuthModalOpen(false)}
            onSuccessLogin={() => {
              setAuthModalOpen(false);
              handleSetWorkspace(true);
            }}
          />
        )}

        <DemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          onOpenWorkspace={() => handleSetWorkspace(true)}
        />

        <ThemeModal
          isOpen={themeModalOpen}
          onClose={() => setThemeModalOpen(false)}
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

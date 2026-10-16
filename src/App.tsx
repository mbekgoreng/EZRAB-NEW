import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectProvider } from './context/ProjectContext';
import { ExactLandingPage } from './components/landing/ExactLandingPage';
import { AboutPage } from './components/about/AboutPage';
import { AuthModal } from './components/auth/AuthModal';
import { WorkspaceView } from './components/dashboard/WorkspaceView';
import { DemoModal } from './components/common/DemoModal';
import { ThemeModal } from './components/common/ThemeModal';
import { NotificationProvider } from './notifications/NotificationContext';
import { BootLoadingScreen } from './components/boot/BootLoadingScreen';
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

// Login dinonaktifkan sementara (perintah user 2026-10-12): seluruh pintu
// masuk login disembunyikan — CTA "Masuk/Daftar" langsung ke dashboard
// tanpa menampilkan modal atau halaman login. Ubah ke true untuk
// mengaktifkan kembali.
const AUTH_ENABLED = false;

export const App: React.FC = () => {
  const location = useBrowserLocation();
  const workspaceRoute = parseWorkspaceRoute(location.pathname, location.search);
  const isWorkspace = isAppPath(location.pathname);
  const isAbout = location.pathname === '/about' || location.hash === '#tentang';

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'masuk' | 'daftar'>('daftar');
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  // Boot sequence: loading screen -> (onboarding on first run) -> content.
  const [booted, setBooted] = useState(false);
  const [bootReady, setBootReady] = useState(false);
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

  // App shell is ready as soon as React mounts; the boot screen enforces
  // its own minimum display duration before calling onDone.
  useEffect(() => {
    setBootReady(true);
  }, []);

  const handleBootDone = useCallback(() => {
    setBooted(true);
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
    if (!AUTH_ENABLED) {
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

        {/* Modals */}
        {AUTH_ENABLED && (
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
          {!booted && (
            <BootLoadingScreen ready={bootReady} minDurationMs={1200} onDone={handleBootDone} />
          )}
          {booted && (
            <>
              {content}
              <OnboardingTour open={tourOpen || tourPending} onClose={handleTourClose} />
              <OnboardingOrchestrator />
              <FeatureTutorialPlayer />
              <WelcomeSlotGuard active={tourOpen || tourPending} />
            </>
          )}
        </OnboardingProvider>
      </ToastProvider>
    </NotificationProvider>
  );
};

export default App;

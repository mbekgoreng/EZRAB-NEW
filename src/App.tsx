import React, { useCallback, useEffect, useState } from 'react';
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
  shouldShowOnboarding,
  useOnboardingTour,
} from './components/onboarding/OnboardingTour';
import { isAppPath, navigateTo, parseWorkspaceRoute, paths, routeForMenu, routeLabel } from './routing/routes';
import { useBrowserLocation } from './routing/useBrowserLocation';

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
    setTourPending(shouldShowOnboarding());
  }, []);

  const handleTourClose = useCallback(() => {
    setTourPending(false);
    closeTour();
  }, [closeTour]);

  const handleSetWorkspace = (val: boolean) => {
    navigateTo(val ? paths.dashboard() : paths.home());
  };

  const handleOpenAbout = () => {
    navigateTo(paths.about());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenAuth = (tab: 'masuk' | 'daftar' = 'masuk') => {
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
          background: 'var(--ezrab-bg, #f8fafc)',
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
        <AuthModal
          isOpen={authModalOpen}
          initialTab={authInitialTab}
          onClose={() => setAuthModalOpen(false)}
          onSuccessLogin={() => {
            setAuthModalOpen(false);
            handleSetWorkspace(true);
          }}
        />

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
      {!booted && (
        <BootLoadingScreen ready={bootReady} minDurationMs={1200} onDone={handleBootDone} />
      )}
      {booted && (
        <>
          {content}
          <OnboardingTour open={tourOpen || tourPending} onClose={handleTourClose} />
        </>
      )}
    </NotificationProvider>
  );
};

export default App;

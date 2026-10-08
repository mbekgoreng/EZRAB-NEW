import React, { useCallback, useEffect, useState } from 'react';
import { ProjectProvider } from './context/ProjectContext';
import { ExactLandingPage } from './components/landing/ExactLandingPage';
import { AboutPage } from './components/about/AboutPage';
import { AuthModal } from './components/auth/AuthModal';
import { WorkspaceView } from './components/dashboard/WorkspaceView';
import { DemoModal } from './components/common/DemoModal';
import { ThemeModal } from './components/common/ThemeModal';
import { NotificationProvider } from './notifications/NotificationContext';
import { AuthPage } from './AuthPage';
import {
  OnboardingTour,
  shouldShowOnboarding,
  useOnboardingTour,
} from './components/onboarding/OnboardingTour';
import { isAppPath, navigateTo, parseWorkspaceRoute, paths, routeForMenu, routeLabel } from './routing/routes';
import { useBrowserLocation } from './routing/useBrowserLocation';

/**
 * AUTH_ENABLED = false → login dimatikan sementara.
 * Semua CTA ("Masuk", "Coba Gratis", dsb.) langsung membuka workspace tanpa login.
 * Nyalakan lagi (true) saat autentikasi siap dipakai.
 */
const AUTH_ENABLED = false;

export const App: React.FC = () => {
  const location = useBrowserLocation();
  const workspaceRoute = parseWorkspaceRoute(location.pathname, location.search);
  const isWorkspace = isAppPath(location.pathname);
  const isAbout = location.pathname === '/about' || location.hash === '#tentang';
  const cleanPath = location.pathname.replace(/\/+$/, '') || '/';
  const isLoginPage = cleanPath === paths.login();
  const isSignupPage = cleanPath === paths.signup();
  const isRoleLoginPage = cleanPath === paths.loginRole();
  const isAuthPage = isLoginPage || isSignupPage || isRoleLoginPage;

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  const { open: tourOpen, closeTour } = useOnboardingTour();
  const [tourPending, setTourPending] = useState(false);

  useEffect(() => {
    if (location.pathname === paths.app()) navigateTo(paths.dashboard(), { replace: true });
  }, [location.pathname]);

  // Saat auth dimatikan, halaman /masuk /daftar /masuk/role langsung ke dashboard.
  useEffect(() => {
    if (!AUTH_ENABLED && isAuthPage) navigateTo(paths.dashboard(), { replace: true });
  }, [isAuthPage]);

  useEffect(() => {
    if (isWorkspace) document.title = workspaceRoute.status === 'not-found' ? 'Halaman Tidak Ditemukan — EZRAB' : `${routeLabel(workspaceRoute)} — EZRAB`;
    else if (isAbout) document.title = 'Tentang EZRAB';
    else if (isLoginPage) document.title = 'Masuk — EZRAB';
    else if (isSignupPage) document.title = 'Daftar — EZRAB';
    else if (isRoleLoginPage) document.title = 'Masuk sebagai Peran — EZRAB';
    else document.title = 'EZRAB — RAB & Estimasi Konstruksi';
  }, [isAbout, isWorkspace, isLoginPage, isSignupPage, isRoleLoginPage, workspaceRoute]);

  // Setelah redirect balik dari Google OAuth: jika sudah di halaman auth
  // (/masuk//daftar), halaman menangani status login sendiri — jangan buka
  // modal di atasnya. Jika di landing, buka modal auth.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('ezrab_after_oauth') === '1') {
        sessionStorage.removeItem('ezrab_after_oauth');
        const p = window.location.pathname.replace(/\/+$/, '') || '/';
        if (p !== paths.login() && p !== paths.signup() && p !== paths.loginRole()) {
          setAuthModalOpen(true);
        }
      }
    } catch {
      /* abaikan jika storage tidak tersedia */
    }
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
  } else if (isAuthPage) {
    content = AUTH_ENABLED ? (
      <AuthPage
        mode={isRoleLoginPage ? 'role' : isSignupPage ? 'signup' : 'signin'}
        onLoginSuccess={() => {
          handleSetWorkspace(true);
          // Tur selamat datang muncul setelah login/daftar — kecuali
          // pengguna sudah memilih "Jangan tampilkan lagi".
          if (shouldShowOnboarding()) setTourPending(true);
        }}
      />
    ) : null;
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
          onOpenAuth={(tab) =>
            AUTH_ENABLED
              ? navigateTo(tab === 'daftar' ? paths.signup() : paths.login())
              : handleSetWorkspace(true)
          }
          onOpenDemo={() => setDemoModalOpen(true)}
          onOpenTheme={() => setThemeModalOpen(true)}
          onBackToLanding={handleReturnToLanding}
          onOpenAbout={handleOpenAbout}
        />

        {/* Modals */}
        <AuthModal
          isOpen={authModalOpen}
          initialTab="masuk"
          onClose={() => setAuthModalOpen(false)}
          onSuccessLogin={() => {
            setAuthModalOpen(false);
            handleSetWorkspace(true);
            // Tur selamat datang muncul setelah login/daftar — kecuali
            // pengguna sudah memilih "Jangan tampilkan lagi".
            if (shouldShowOnboarding()) setTourPending(true);
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
      {content}
      <OnboardingTour open={tourOpen || tourPending} onClose={handleTourClose} />
    </NotificationProvider>
  );
};

export default App;

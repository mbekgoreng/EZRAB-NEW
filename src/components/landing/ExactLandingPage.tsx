import React, { Suspense, useEffect } from 'react';
import '../../styles/landing-critical.css';
import '../../styles/exact-landing-flagship-mobile.css';
import { ExactNavbar } from './exact/ExactNavbar';
import { ExactHero } from './exact/ExactHero';

// Below-the-fold sections are code-split so the initial bundle only contains
// the navbar + hero (above-the-fold). framer-motion and the heavy showcase
// components are excluded from the first-paint JS.
const ExactWorkflow = React.lazy(() =>
  import('./exact/ExactWorkflow').then((m) => ({ default: m.ExactWorkflow })),
);
const ExactStackedShowcase = React.lazy(() =>
  import('./exact/ExactStackedShowcase').then((m) => ({ default: m.ExactStackedShowcase })),
);
const ExactRoles = React.lazy(() =>
  import('./exact/ExactRoles').then((m) => ({ default: m.ExactRoles })),
);
const DrawingsToDecisionsSection = React.lazy(() =>
  import('./exact/DrawingsToDecisionsSection').then((m) => ({ default: m.DrawingsToDecisionsSection })),
);
const ExactPricing = React.lazy(() =>
  import('./exact/ExactPricing').then((m) => ({ default: m.ExactPricing })),
);
const ExactFinalCta = React.lazy(() =>
  import('./exact/ExactFinalCta').then((m) => ({ default: m.ExactFinalCta })),
);
const ExactFooter = React.lazy(() =>
  import('./exact/ExactFooter').then((m) => ({ default: m.ExactFooter })),
);

interface ExactLandingPageProps {
  onOpenWorkspace: () => void;
  onOpenAuth: (tab?: 'masuk' | 'daftar') => void;
  onOpenDemo: () => void;
  onOpenTheme: () => void;
  onBackToLanding: () => void;
  onOpenAbout?: () => void;
}

export const ExactLandingPage: React.FC<ExactLandingPageProps> = ({
  onOpenWorkspace,
  onOpenAuth,
  onOpenDemo,
  onOpenTheme,
  onBackToLanding,
  onOpenAbout,
}) => {
  // Defer non-critical landing CSS: only the navbar/hero styles above are
  // bundled synchronously (landing-critical.css). The full stylesheet is
  // fetched as a separate chunk after mount so it never blocks first paint.
  useEffect(() => {
    void import('../../styles/exact-landing.css');
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      {/* 1. Fixed Dark Navbar */}
      <ExactNavbar
        onOpenAuth={onOpenAuth}
        onOpenTheme={onOpenTheme}
        onBackToLanding={onBackToLanding}
        onOpenAbout={onOpenAbout}
      />

      {/* Main Sections */}
      <main style={{ flexGrow: 1 }}>
        {/* 2. Hero klasik — video kanan diganti animasi demo produk */}
        <ExactHero
          onStartFree={() => onOpenAuth('daftar')}
          onOpenDemo={onOpenDemo}
        />

        {/* 3. Satu Workflow (2-row connected nodes) */}
        <Suspense fallback={null}>
          <ExactWorkflow />
        </Suspense>

        {/* 5-10. Stacked Scrolling Product Story (6-Workspace Physical Stack) */}
        <Suspense fallback={null}>
          <ExactStackedShowcase onOpenWorkspace={onOpenWorkspace} />
        </Suspense>

        {/* 11. Untuk Profesional di Bidang Konstruksi (Deep Navy 4-cards) */}
        <Suspense fallback={null}>
          <ExactRoles />
        </Suspense>

        {/* 11.5 Flagship Architectural Transition: FROM DRAWINGS TO DECISIONS */}
        <Suspense fallback={null}>
          <DrawingsToDecisionsSection />
        </Suspense>

        {/* 12. Harga / Pricing (Free, Pro, Enterprise) */}
        <Suspense fallback={null}>
          <ExactPricing onSelectPlan={() => onOpenAuth('daftar')} />
        </Suspense>

        {/* 13. Final CTA Banner (Dusk skyline with cranes) */}
        <Suspense fallback={null}>
          <ExactFinalCta
            onStartFree={() => onOpenAuth('daftar')}
            onOpenDemo={onOpenDemo}
          />
        </Suspense>
      </main>

      {/* 14. Clean Modern Footer */}
      <Suspense fallback={null}>
        <ExactFooter onOpenAbout={onOpenAbout} />
      </Suspense>
    </div>
  );
};

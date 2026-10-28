import React, { useEffect } from 'react';
import '../../styles/landing-critical.css';
import '../../styles/exact-landing-flagship-mobile.css';
import { ExactNavbar } from './exact/ExactNavbar';
import { CinematicHero } from './cinematic/CinematicHero';

// Section di bawah hero: direct import (bukan React.lazy).
// Alasan: React.lazy + Suspense di halaman ini tidak me-mount section
// sama sekali (terverifikasi: <main> hanya berisi hero), sehingga
// tautan navbar #fitur / #harga mati. Keandalan navigasi lebih penting
// daripada code-splitting di sini — hero Three.js sudah mendominasi bundle.
import { ExactWorkflow } from './exact/ExactWorkflow';
import { ExactStackedShowcase } from './exact/ExactStackedShowcase';
import { ExactRoles } from './exact/ExactRoles';
import { DrawingsToDecisionsSection } from './exact/DrawingsToDecisionsSection';
import { ExactPricing } from './exact/ExactPricing';
import { ExactFinalCta } from './exact/ExactFinalCta';
import { ExactFooter } from './exact/ExactFooter';

interface ExactLandingPageProps {
  onOpenWorkspace: () => void;
  onOpenAuth: (tab?: 'masuk' | 'daftar') => void;
  onOpenDemo: () => void;
  onBackToLanding: () => void;
  onOpenAbout?: () => void;
  onOpenAdvantages?: () => void;
}

export const ExactLandingPage: React.FC<ExactLandingPageProps> = ({
  onOpenWorkspace,
  onOpenAuth,
  onOpenDemo,
  onBackToLanding,
  onOpenAbout,
  onOpenAdvantages,
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
        onBackToLanding={onBackToLanding}
        onOpenAbout={onOpenAbout}
        onOpenAdvantages={onOpenAdvantages}
      />

      {/* Main Sections */}
      <main style={{ flexGrow: 1 }}>
        {/* 2. Cinematic Hero — monumental architecture × live product stage */}
        <CinematicHero
          onStartFree={() => onOpenAuth('daftar')}
          onOpenDemo={onOpenDemo}
        />

        {/* 3. Satu Workflow (2-row connected nodes) */}
        <ExactWorkflow />

        {/* 5-10. Stacked Scrolling Product Story (6-Workspace Physical Stack) */}
        <ExactStackedShowcase onOpenWorkspace={onOpenWorkspace} />

        {/* 11. Untuk Profesional di Bidang Konstruksi (Deep Navy 4-cards) */}
        <ExactRoles />

        {/* 11.5 Flagship Architectural Transition: FROM DRAWINGS TO DECISIONS */}
        <DrawingsToDecisionsSection />

        {/* 12. Harga / Pricing (Free, Pro, Enterprise) */}
        <ExactPricing onSelectPlan={() => onOpenAuth('daftar')} />

        {/* 13. Final CTA Banner (Dusk skyline with cranes) */}
        <ExactFinalCta
          onStartFree={() => onOpenAuth('daftar')}
          onOpenDemo={onOpenDemo}
        />
      </main>

      {/* 14. Clean Modern Footer */}
      <ExactFooter />
    </div>
  );
};

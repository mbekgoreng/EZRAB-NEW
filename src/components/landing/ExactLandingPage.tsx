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
import { AiShowcase } from './exact/AiShowcase';

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

        {/* 5-13. AI-first showcase (pengganti stacked showcase s.d. footer):
            pembuka AI, DED Estimate AI, Ezrab Chat AI, AI Document,
            Ezrab AI Assistant, strip pendukung, kejujuran AI, harga
            (id="harga"), FAQ, CTA, dan footer ramping — port dari mockup
            v8 yang di-ACC owner 2026-11-02. */}
        <AiShowcase onOpenAuth={onOpenAuth} onOpenDemo={onOpenDemo} />
      </main>
    </div>
  );
};

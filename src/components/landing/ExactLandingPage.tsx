import React from 'react';
import '../../styles/exact-landing.css';
import '../../styles/exact-landing-flagship-mobile.css';
import { ExactNavbar } from './exact/ExactNavbar';
import { ExactHero } from './exact/ExactHero';
import { ExactWorkflow } from './exact/ExactWorkflow';
import { ExactMagicAi } from './exact/ExactMagicAi';
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
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      {/* 1. Fixed Dark Navbar */}
      <ExactNavbar
        onOpenWorkspace={onOpenWorkspace}
        onOpenAuth={() => onOpenAuth('masuk')}
        onOpenTheme={onOpenTheme}
        onBackToLanding={onBackToLanding}
        onOpenAbout={onOpenAbout}
      />

      {/* Main Sections */}
      <main style={{ flexGrow: 1 }}>
        {/* 2. Dark Hero Section with 3D Building & 5 Floating Neon Cards */}
        <ExactHero
          onStartFree={onOpenWorkspace}
          onOpenDemo={onOpenDemo}
        />

        {/* 3. Satu Workflow (2-row connected nodes) */}
        <ExactWorkflow />

        {/* 4. EZRAB Magic AI (Dark with floating modal preview) */}
        <ExactMagicAi onStart={onOpenWorkspace} />

        {/* 5-10. Stacked Scrolling Product Story (6-Workspace Physical Stack) */}
        <ExactStackedShowcase onOpenWorkspace={onOpenWorkspace} />

        {/* 11. Untuk Profesional di Bidang Konstruksi (Deep Navy 4-cards) */}
        <ExactRoles />

        {/* 11.5 Flagship Architectural Transition: FROM DRAWINGS TO DECISIONS */}
        <DrawingsToDecisionsSection />

        {/* 12. Harga / Pricing (Free, Pro, Enterprise) */}
        <ExactPricing onSelectPlan={() => onOpenWorkspace()} />

        {/* 13. Final CTA Banner (Dusk skyline with cranes) */}
        <ExactFinalCta
          onStartFree={onOpenWorkspace}
          onOpenDemo={onOpenDemo}
        />
      </main>

      {/* 14. Clean Modern Footer */}
      <ExactFooter onOpenAbout={onOpenAbout} />
    </div>
  );
};

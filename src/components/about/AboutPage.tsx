import React from 'react';
import '../../styles/about-page.css';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { AboutHeroSection } from './AboutHeroSection';
import { AboutWhySection } from './AboutWhySection';
import { AboutWorkflowSection } from './AboutWorkflowSection';
import { AboutAiSection } from './AboutAiSection';
import { AboutRolesSection } from './AboutRolesSection';
import { AboutPhilosophySection } from './AboutPhilosophySection';
import { AboutStatementSection } from './AboutStatementSection';
import { AboutCtaSection } from './AboutCtaSection';
import { ExactFooter } from '../landing/exact/ExactFooter';

interface AboutPageProps {
  onBackToLanding: () => void;
  onOpenWorkspace: () => void;
  onOpenFeatures: () => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({
  onBackToLanding,
  onOpenWorkspace,
  onOpenFeatures,
}) => {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="ez-about-page-wrapper">
      {/* 1. Minimal Architectural Top Navbar */}
      <header className="ez-about-navbar">
        <div className="ez-about-nav-left">
          <button
            onClick={onBackToLanding}
            className="ez-about-nav-logo"
            aria-label="Kembali ke Beranda EZRAB"
          >
            <div className="ez-about-logo-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 6L14 3L20 9L10 12L4 6Z" fill="#ffffff" />
                <path d="M4 12L10 12L20 18L14 21L4 12Z" fill="#38bdf8" />
              </svg>
            </div>
            <span className="ez-about-logo-text">EZRAB</span>
          </button>
          <span className="ez-about-nav-badge">TENTANG</span>
        </div>

        {/* Section Jump Links for fast navigation */}
        <nav className="ez-about-nav-links" aria-label="Navigasi Halaman Tentang">
          <button onClick={() => scrollToSection('hero')} className="ez-about-nav-link">
            Visi
          </button>
          <button onClick={() => scrollToSection('why')} className="ez-about-nav-link">
            Mengapa EZRAB
          </button>
          <button onClick={() => scrollToSection('workflow')} className="ez-about-nav-link">
            Alur Kerja
          </button>
          <button onClick={() => scrollToSection('ai')} className="ez-about-nav-link">
            Magic AI
          </button>
          <button onClick={() => scrollToSection('roles')} className="ez-about-nav-link">
            Profesional
          </button>
          <button onClick={() => scrollToSection('philosophy')} className="ez-about-nav-link">
            Filosofi
          </button>
        </nav>

        <div className="ez-about-nav-actions">
          <button
            onClick={onBackToLanding}
            className="ez-about-nav-btn-back"
            aria-label="Kembali ke Beranda"
          >
            <ArrowLeft size={15} />
            <span>Beranda</span>
          </button>

          <button
            onClick={onOpenWorkspace}
            className="ez-about-nav-btn-cta"
            aria-label="Mulai Gratis"
          >
            <span>Mulai Gratis</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Main Content Sections with alternating DARK -> LIGHT -> LIGHT -> DARK -> LIGHT -> DARK -> LIGHT rhythm */}
      <main style={{ flexGrow: 1, paddingTop: '52px' }}>
        {/* Section 01: Hero (DARK #061225) */}
        <AboutHeroSection
          onScrollToWhy={() => scrollToSection('why')}
          onStartFree={onOpenWorkspace}
        />

        {/* Section 02: Why EZRAB (LIGHT #FFFFFF) */}
        <AboutWhySection />

        {/* Section 03: One Connected Workflow (LIGHT #F8FAFC) */}
        <AboutWorkflowSection />

        {/* Section 04: AI — Productivity Accelerator (DARK #061225) */}
        <AboutAiSection />

        {/* Section 05: Who is EZRAB for (LIGHT #FFFFFF) */}
        <AboutRolesSection />

        {/* Section 06: Product Philosophy (DARK #061225) */}
        <AboutPhilosophySection />

        {/* Section 07: Signature Statement (LIGHT #FFFFFF) */}
        <AboutStatementSection />

        {/* Section 08: Final CTA (DARK #061225) */}
        <AboutCtaSection
          onStartFree={onOpenWorkspace}
          onViewFeatures={onOpenFeatures}
        />
      </main>

      {/* Premium Minimal Footer */}
      <ExactFooter />
    </div>
  );
};

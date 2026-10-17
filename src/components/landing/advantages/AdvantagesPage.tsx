import React, { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import './advantages-page.css';
import { ExactFooter } from '../exact/ExactFooter';
import { AdvantagesHero } from './AdvantagesHero';
import {
  ProblemSection,
  WorkflowSection,
  PriceIntegritySection,
  AiOversightSection,
  EcosystemSection,
  RolesSection,
  TransparencySection,
  FinalCtaSection,
} from './AdvantageSections';

interface AdvantagesPageProps {
  onBackToLanding: () => void;
  onOpenWorkspace: () => void;
  onOpenFeatures: () => void;
}

const Section: React.FC<{
  id: string;
  no: string;
  meta: string;
  title: React.ReactNode;
  sub?: string;
  dark?: boolean;
  children: React.ReactNode;
}> = ({ id, no, meta, title, sub, dark, children }) => (
  <section id={id} className={`adv-section ${dark ? 'adv-section-dark' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="adv-container">
      <div className="adv-sec-head adv-reveal" aria-hidden="true">
        <span className="adv-sec-no">{no}</span>
        <span className="adv-sec-rule" />
        <span className="adv-sec-meta">{meta}</span>
      </div>
      <h2 id={`${id}-title`} className="adv-h2 adv-reveal">
        {title}
      </h2>
      {sub && <p className="adv-sub adv-reveal">{sub}</p>}
      <div className="adv-reveal" style={{ ['--adv-d' as any]: '0.08s' }}>
        {children}
      </div>
    </div>
  </section>
);

/**
 * /keunggulan — "Keunggulan EZRAB": mengapa memilih EZRAB.
 * Editorial engineering — bukan katalog fitur kedua.
 */
export const AdvantagesPage: React.FC<AdvantagesPageProps> = ({
  onBackToLanding,
  onOpenWorkspace,
  onOpenFeatures,
}) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Satu momen gerak: reveal saat scroll, sekali saja per elemen.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.adv-page .adv-reveal'));
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const scrollToWorkflow = () => {
    document.getElementById('alur')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="adv-page">
      {/* Nav */}
      <header className="adv-nav">
        <button type="button" className="adv-nav-back" onClick={onBackToLanding} aria-label="Kembali ke beranda">
          <span className="adv-nav-logo-text">EZRAB</span>
        </button>
        <button type="button" className="adv-nav-cta" onClick={onOpenWorkspace}>
          Coba EZRAB <ArrowRight size={14} />
        </button>
      </header>

      {/* 01 — Opening */}
      <AdvantagesHero onExploreWorkflow={scrollToWorkflow} onOpenFeatures={onOpenFeatures} />

      {/* 02 — Problem */}
      <Section
        id="masalah"
        no="02"
        meta="MASALAH NYATA"
        title="Masalahnya Bukan Hanya Menghitung. Tetapi Menjaga Semuanya Tetap Terhubung."
      >
        <ProblemSection />
      </Section>

      {/* 03 — Workflow */}
      <Section
        id="alur"
        no="03"
        meta="ALUR KERJA"
        title="Dari Informasi Proyek Menuju Estimasi yang Lebih Terstruktur."
        sub="Enam tahap dengan peran yang berbeda — setiap tahap menjelaskan apa yang dikerjakan dan oleh siapa."
      >
        <WorkflowSection onOpenWorkspace={onOpenWorkspace} />
      </Section>

      {/* 04 — Price integrity (navy anchor) */}
      <Section
        id="integritas-harga"
        no="04"
        meta="INTEGRITAS HARGA"
        title="Setiap Angka Harus Punya Konteks."
        sub="Nilai estimasi tidak cukup terlihat meyakinkan. Sumber, satuan, dan status harga harus dapat dibedakan."
        dark
      >
        <PriceIntegritySection />
      </Section>

      {/* 05 — AI oversight */}
      <Section
        id="ai"
        no="05"
        meta="AI & KEPUTUSAN"
        title="AI Membantu Pekerjaan. Keputusan Tetap di Tangan Anda."
      >
        <AiOversightSection />
      </Section>

      {/* 06 — Ecosystem */}
      <Section
        id="ekosistem"
        no="06"
        meta="EKOSISTEM"
        title="Satu Ekosistem untuk Berbagai Kebutuhan Estimasi."
        sub="Modul-modul EZRAB dikelompokkan menurut tahap alur kerja — bukan daftar fitur yang berdiri sendiri."
      >
        <EcosystemSection />
      </Section>

      {/* 07 — Roles */}
      <Section
        id="peran"
        no="07"
        meta="UNTUK SIAPA"
        title="Dirancang untuk Cara Kerja yang Berbeda."
        sub="Lima peran, lima kebutuhan konkret — tanpa testimoni fiktif."
      >
        <RolesSection />
      </Section>

      {/* 08 — Transparency */}
      <Section
        id="transparansi"
        no="08"
        meta="TRANSPARANSI"
        title="Dirancang untuk Membantu Anda Memeriksa, Bukan Sekadar Mempercayai."
      >
        <TransparencySection />
      </Section>

      {/* 09 — Final CTA */}
      <section className="adv-section adv-final-section" aria-labelledby="final-title">
        <div className="adv-container">
          <h2 id="final-title" className="adv-sr-only">
            Mulai menggunakan EZRAB
          </h2>
          <FinalCtaSection onOpenFeatures={onOpenFeatures} onOpenWorkspace={onOpenWorkspace} />
        </div>
      </section>

      <ExactFooter />
    </div>
  );
};

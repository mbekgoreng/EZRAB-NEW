import React from 'react';
import './cinematic-hero.css';
import { ProductStage } from './ProductStage';

interface CinematicHeroProps {
  onStartFree?: () => void;
  onOpenDemo?: () => void;
}

/**
 * EZRAB cinematic hero — "The Intelligence Behind Every Build".
 * Monumental architecture backdrop + live product-stage demo.
 * No backend calls; all demo figures are labelled demo data.
 */
export const CinematicHero: React.FC<CinematicHeroProps> = ({ onStartFree, onOpenDemo }) => (
  <section className="ch-hero" aria-label="EZRAB — Dari Perencanaan. Menjadi Kepastian.">
    {/* Monumental architecture backdrop (GPU-friendly slow drift) */}
    <div className="ch-hero-bg" aria-hidden="true">
      <img
        src="/images/landing/ezrab-rab-blueprint-hero.webp"
        alt=""
        className="ch-hero-bg-img"
        loading="eager"
        fetchPriority="high"
      />
      <div className="ch-hero-bg-veil" />
      <div className="ch-hero-grid" />
    </div>

    <div className="ch-hero-inner">
      <div className="ch-hero-copy">
        <img
          src="/images/landing/ezrab-logo-hero.png"
          alt="EZRAB — AI Construction Estimator"
          className="ch-hero-logo"
          loading="eager"
        />
        <p className="ch-eyebrow">
          <span className="ch-eyebrow-line" aria-hidden="true" />
          Platform Konstruksi Berbasis AI
        </p>
        <h1 className="ch-headline">
          Dari Perencanaan.
          <br />
          Menjadi <span className="ch-headline-accent">Kepastian.</span>
        </h1>
        <p className="ch-subheadline">
          Hubungkan dokumen teknis, estimasi biaya, volume pekerjaan, AHSP, dan
          manajemen proyek dalam satu platform konstruksi berbasis AI.
        </p>
        <div className="ch-cta-row">
          <button type="button" className="ch-cta-primary" onClick={onStartFree}>
            Mulai dengan EZRAB
          </button>
          <button type="button" className="ch-cta-secondary" onClick={onOpenDemo}>
            Lihat Demo Produk
          </button>
        </div>
        <p className="ch-hero-note">Gratis untuk memulai · Tanpa kartu kredit</p>
      </div>

      <div className="ch-hero-stage">
        <ProductStage />
      </div>
    </div>
  </section>
);

export default CinematicHero;

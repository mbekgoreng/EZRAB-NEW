import React from 'react';
import {
  ArrowRight,
  Calculator,
  Database,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Sparkles,
  Banknote,
} from 'lucide-react';
import './cinematic-hero.css';
import { ProductStage } from './ProductStage';
import { ArchitecturalBackground } from '../architectural/ArchitecturalBackground';

interface CinematicHeroProps {
  onStartFree?: () => void;
  onOpenDemo?: () => void;
}

/** Feature icon row under the CTAs (mirrors the reference hero). */
const FEATURE_ICONS = [
  { icon: FileText, label: 'DED → RAB' },
  { icon: Calculator, label: 'QTO' },
  { icon: Database, label: 'AHSP' },
  { icon: Banknote, label: 'Harga' },
  { icon: FolderKanban, label: 'Dokumen' },
  { icon: FileSpreadsheet, label: 'Proyek' },
];

/** Floating badges around the tilted 3D stage (reference-style, no mascot). */
const FLOATING_BADGES = [
  { label: 'QTO', className: 'ch-badge--tl', delay: '0s' },
  { label: 'AHSP', className: 'ch-badge--tr', delay: '1.2s' },
  { label: 'Harga', className: 'ch-badge--r', delay: '0.6s' },
  { label: 'RAB', className: 'ch-badge--br', delay: '1.8s' },
  { label: 'DED', className: 'ch-badge--bl', delay: '0.9s' },
  { label: 'AI', className: 'ch-badge--l', delay: '1.5s', icon: true },
];

/**
 * EZRAB cinematic hero — blueprint RAB backdrop + tilted 3D live product stage
 * with floating feature badges (reference-style composition).
 * No backend calls; all demo figures are labelled demo data.
 */
export const CinematicHero: React.FC<CinematicHeroProps> = ({ onStartFree, onOpenDemo }) => (
  <section className="ch-hero" aria-label="Rancang anggaran proyekmu dengan mudah, cepat, dan terkendali bersama EZRAB.">
    {/* Parametric building backdrop — Three.js: blueprint menggambar diri,
        wireframe tower merakit lantai per lantai, aliran cahaya, partikel.
        (Pengganti webp statis; otomatis fallback bila WebGL tak tersedia.) */}
    <div className="ch-hero-bg" aria-hidden="true">
      <ArchitecturalBackground mode={0} />
      <div className="ch-hero-bg-veil" />
      <div className="ch-hero-grid" />
    </div>

    <div className="ch-hero-inner">
      <div className="ch-hero-copy">
        <h1 className="ch-headline">
          Rancang anggaran proyekmu
          <br />
          dengan mudah, cepat, dan terkendali
          <br />
          bersama <span className="ch-headline-accent">EZRAB.</span>
        </h1>
        <p className="ch-subheadline">
          EZRAB membaca DED Anda, menghitung volume (QTO), menerapkan AHSP
          2026, dan merakit RAB siap tender — dalam hitungan menit, akurat
          sampai rupiah terakhir.
        </p>
        <div className="ch-cta-row">
          <button type="button" className="ch-cta-primary" onClick={onStartFree}>
            Mulai dengan EZRAB
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="ch-hero-note">Gratis untuk memulai · Tanpa kartu kredit</p>
        <ul className="ch-feature-icons" aria-label="Fitur utama EZRAB">
          {FEATURE_ICONS.map(({ icon: Icon, label }) => (
            <li key={label} className="ch-feature-icon">
              <span className="ch-feature-icon-badge">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="ch-hero-stage">
        <div className="ch-stage-orbit" aria-hidden="true">
          {FLOATING_BADGES.map((b) => (
            <span
              key={b.label}
              className={`ch-float-badge ${b.className}`}
              style={{ animationDelay: b.delay }}
            >
              {b.icon ? <Sparkles size={12} aria-hidden="true" /> : null}
              {b.label}
            </span>
          ))}
        </div>
        <ProductStage />
      </div>
    </div>
  </section>
);

export default CinematicHero;

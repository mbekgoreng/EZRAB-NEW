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
import { useI18n } from '../../../i18n';

interface CinematicHeroProps {
  onStartFree?: () => void;
  onOpenDemo?: () => void;
}

/**
 * EZRAB cinematic hero — blueprint RAB backdrop + tilted 3D live product stage
 * with floating feature badges (reference-style composition).
 * No backend calls; all demo figures are labelled demo data.
 */
export const CinematicHero: React.FC<CinematicHeroProps> = ({ onStartFree, onOpenDemo }) => {
  const { t } = useI18n();

  /** Feature icon row under the CTAs (mirrors the reference hero). */
  const featureIcons = [
    { id: 'ded-rab', icon: FileText, label: t('landing.cine_feat_ded_rab') },
    { id: 'qto', icon: Calculator, label: t('landing.cine_feat_qto') },
    { id: 'ahsp', icon: Database, label: t('landing.cine_feat_ahsp') },
    { id: 'harga', icon: Banknote, label: t('landing.cine_feat_harga') },
    { id: 'dokumen', icon: FolderKanban, label: t('landing.cine_feat_dokumen') },
    { id: 'proyek', icon: FileSpreadsheet, label: t('landing.cine_feat_proyek') },
  ];

  /** Floating badges around the tilted 3D stage (reference-style, no mascot). */
  const floatingBadges = [
    { id: 'qto', label: t('landing.cine_feat_qto'), className: 'ch-badge--tl', delay: '0s' },
    { id: 'ahsp', label: t('landing.cine_feat_ahsp'), className: 'ch-badge--tr', delay: '1.2s' },
    { id: 'harga', label: t('landing.cine_feat_harga'), className: 'ch-badge--r', delay: '0.6s' },
    { id: 'rab', label: t('landing.cine_badge_rab'), className: 'ch-badge--br', delay: '1.8s' },
    { id: 'ded', label: t('landing.cine_badge_ded'), className: 'ch-badge--bl', delay: '0.9s' },
    { id: 'ai', label: t('landing.cine_badge_ai'), className: 'ch-badge--l', delay: '1.5s', icon: true },
  ];

  return (
    <section
      className="ch-hero"
      aria-label={`${t('landing.cine_headline_a')} ${t('landing.cine_headline_b')} ${t('landing.cine_headline_c')}${t('landing.cine_headline_accent')}`}
    >
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
            {t('landing.cine_headline_a')}
            <br />
            {t('landing.cine_headline_b')}
            <br />
            {t('landing.cine_headline_c')}
            <span className="ch-headline-accent">{t('landing.cine_headline_accent')}</span>
          </h1>
          <p className="ch-subheadline">{t('landing.cine_subheadline')}</p>
          <div className="ch-cta-row">
            <button type="button" className="ch-cta-primary" onClick={onStartFree}>
              {t('landing.cine_cta')}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="ch-hero-note">{t('landing.cine_note')}</p>
          <ul className="ch-feature-icons" aria-label={t('landing.cine_features_aria')}>
            {featureIcons.map(({ id, icon: Icon, label }) => (
              <li key={id} className="ch-feature-icon">
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
            {floatingBadges.map((b) => (
              <span
                key={b.id}
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
};

export default CinematicHero;

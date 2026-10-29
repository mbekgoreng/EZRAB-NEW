import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  ArrowRight,
  Sparkles,
  Layers,
  Crown,
  Building2,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lock,
  Clock
} from 'lucide-react';

import {
  PLAN_IDS,
  getPlanDefinition,
  type PlanId,
} from '../../../billing/plans';

interface ExactPricingProps {
  onSelectPlan?: (plan: string) => void;
}

interface PlanFeature {
  text: string;
}

interface PlanConfig {
  id: string;
  name: string;
  badge?: string;
  monthlyPrice: string;
  annualPrice: string;
  monthlyNum: number;
  annualNum: number;
  periodLabelMonthly: string;
  periodLabelAnnual: string;
  annualBilledText?: string;
  /** Harga coret (harga normal sebelum promo), mis. 'Rp 125.000' */
  originalPrice?: string;
  /** Badge diskon promo, mis. 'HEMAT 52%' */
  discountBadge?: string;
  features: PlanFeature[];
  ctaText: string;
  isPopular?: boolean;
  styleVariant: 'free' | 'starter' | 'pro' | 'business';
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Harga, batas proyek, dan jatah kredit TIDAK lagi hardcoded di sini —
// semuanya diturunkan dari definisi paket kanonis (src/billing/plans.ts,
// tabel owner-approved). Blok ini hanya memuat PRESENTASI (ikon, badge,
// harga coret promo, daftar fitur turunan matriks entitlement §C).
// Diskon tahunan 15% (chip toggle) diterapkan sebagai rumus dari harga
// bulanan kanonis — bukan angka terpisah yang bisa menyimpang.
// ---------------------------------------------------------------------------

const formatRp = (n: number): string => `Rp ${n.toLocaleString('id-ID')}`;

interface PlanPresentation {
  badge?: string;
  isPopular?: boolean;
  originalPrice?: string;
  originalPriceNum?: number;
  /** Fitur setelah baris batas proyek & jatah kredit (keduanya otomatis). */
  features: string[];
  ctaText: string;
  styleVariant: PlanConfig['styleVariant'];
  icon: React.ReactNode;
}

const PLAN_PRESENTATION: Record<PlanId, PlanPresentation> = {
  free: {
    features: [
      'Kalkulator QTO dasar',
      'Database AHSP 2026 — Cipta Karya (lihat)',
      'Export PDF & Excel (terbatas)',
      'Tutorial & panduan',
    ],
    ctaText: 'Mulai Gratis',
    styleVariant: 'free',
    icon: <Zap size={20} />,
  },
  starter: {
    originalPrice: 'Rp 125.000',
    originalPriceNum: 125_000,
    features: [
      'Kalkulator standar SNI terverifikasi',
      'RAB & BOQ lengkap',
      'Export Excel & PDF',
      'DED → RAB AI',
      'Template Rumah Tinggal, Gedung & Kesehatan',
      'Database harga material',
    ],
    ctaText: 'Coba Starter',
    styleVariant: 'starter',
    icon: <Layers size={20} />,
  },
  professional: {
    badge: 'PALING POPULER',
    isPopular: true,
    originalPrice: 'Rp 180.000',
    originalPriceNum: 180_000,
    features: [
      'Semua fitur Starter',
      'Semua kalkulator & domain AHSP',
      'AI Documents',
      'Semua template dokumen proyek & jadwal',
      'Kurva S & laporan lengkap',
      'Kolaborasi tim',
      '3 tema premium',
    ],
    ctaText: 'Coba Pro',
    styleVariant: 'pro',
    icon: <Crown size={20} />,
  },
  business: {
    features: [
      'Semua fitur Professional',
      'Semua template dokumen (termasuk BAST)',
      'Finance & laporan penuh',
      'Kolaborasi tim penuh',
    ],
    ctaText: 'Coba Business',
    styleVariant: 'business',
    icon: <Building2 size={20} />,
  },
};

function toPlanConfig(id: PlanId): PlanConfig {
  const def = getPlanDefinition(id);
  const p = PLAN_PRESENTATION[id];
  const monthlyNum = def.monthlyPriceIdr;
  const annualNum = Math.round(monthlyNum * 0.85);
  const projectFeature =
    def.projectLimit === null ? 'Proyek tanpa batas' : `${def.projectLimit} Proyek`;
  const creditFeature =
    def.credits.kind === 'initial'
      ? `${def.credits.credits.toLocaleString('id-ID')} kredit AI awal`
      : `${def.credits.credits.toLocaleString('id-ID')} kredit AI per periode`;
  const discountBadge =
    p.originalPriceNum && monthlyNum > 0
      ? `HEMAT ${Math.round((1 - monthlyNum / p.originalPriceNum) * 100)}%`
      : undefined;
  return {
    id: def.id,
    name: def.displayName,
    badge: p.badge,
    isPopular: p.isPopular,
    monthlyPrice: formatRp(monthlyNum),
    annualPrice: formatRp(annualNum),
    monthlyNum,
    annualNum,
    periodLabelMonthly: monthlyNum === 0 ? 'selamanya' : '/bulan',
    periodLabelAnnual: monthlyNum === 0 ? 'selamanya' : '/bulan',
    annualBilledText:
      monthlyNum === 0 ? undefined : `Setara ${formatRp(annualNum * 12)} per tahun`,
    originalPrice: p.originalPrice,
    discountBadge,
    features: [
      { text: projectFeature },
      { text: creditFeature },
      ...p.features.map((text) => ({ text })),
    ],
    ctaText: p.ctaText,
    styleVariant: p.styleVariant,
    icon: p.icon,
  };
}

const PLANS: PlanConfig[] = PLAN_IDS.map(toPlanConfig);

export const ExactPricing: React.FC<ExactPricingProps> = ({ onSelectPlan }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [clickedBtnId, setClickedBtnId] = useState<string | null>(null);
  const [hasEntered, setHasEntered] = useState<boolean>(false);
  const [priceFading, setPriceFading] = useState<boolean>(false);

  const sectionRef = useRef<HTMLElement>(null);

  // prefers-reduced-motion check
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Viewport intersection observer for staggered entry
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasEntered) {
            setHasEntered(true);
          }
        });
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, [hasEntered]);

  // Handle cycle toggle with digit fade/slide transition
  const handleToggleCycle = (cycle: 'monthly' | 'annual') => {
    if (cycle === billingCycle) return;
    setPriceFading(true);
    setTimeout(() => {
      setBillingCycle(cycle);
      setPriceFading(false);
    }, 180);
  };

  // Button click micro-interaction: arrow transforms to check for 500ms
  const handleCtaClick = (planId: string) => {
    setClickedBtnId(planId);
    if (onSelectPlan) {
      onSelectPlan(planId);
    }
    setTimeout(() => {
      setClickedBtnId(null);
    }, 500);
  };

  return (
    <section id="harga" className="ez-pricing-section" ref={sectionRef}>
      {/* Background blueprint grid & radial glow behind Pro card */}
      <div className="ez-pricing-bg-grid" aria-hidden="true" />
      <div className="ez-pricing-bg-glow" aria-hidden="true" />

      <div className="ez-pricing-container">
        {/* Header Section */}
        <div className={`ez-pricing-header ${hasEntered ? 'is-entered' : ''}`}>
          <div className="ez-pricing-eyebrow">
            <span className="ez-pricing-eyebrow-pill">HARGA</span>
          </div>

          <h2 className="ez-pricing-heading">
            Pilih paket yang sesuai
            <br />
            <span className="ez-pricing-gradient-text">dengan kebutuhan Anda.</span>
          </h2>

          <p className="ez-pricing-subheading">
            Mulai gratis, lalu tingkatkan saat kebutuhan proyek Anda berkembang.
          </p>

          <p className="ez-pricing-stage-note" role="note">
            EZRAB saat ini dalam tahap pengujian — paket berbayar belum dapat
            dibeli. Harga di bawah adalah rencana paket saat rilis; tombol paket
            mengarahkan ke pendaftaran untuk mencoba versi demo.
          </p>

          {/* Premium Segmented Billing Toggle */}
          <div className="ez-billing-toggle-container">
            <div className="ez-billing-segmented-control" role="tablist" aria-label="Pilihan Pembayaran">
              {/* Animated sliding background pill */}
              <div
                className={`ez-toggle-slider ${billingCycle === 'annual' ? 'is-annual' : 'is-monthly'}`}
                aria-hidden="true"
              />

              <button
                role="tab"
                aria-selected={billingCycle === 'monthly'}
                className={`ez-toggle-btn ${billingCycle === 'monthly' ? 'is-active' : ''}`}
                onClick={() => handleToggleCycle('monthly')}
              >
                <span>Bulanan</span>
              </button>

              <button
                role="tab"
                aria-selected={billingCycle === 'annual'}
                className={`ez-toggle-btn ${billingCycle === 'annual' ? 'is-active' : ''}`}
                onClick={() => handleToggleCycle('annual')}
              >
                <span>Tahunan</span>
                <span className="ez-toggle-discount-chip">HEMAT 15%</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4 Pricing Cards Grid (Free, Starter, Professional, Business) */}
        <div className="ez-pricing-cards-grid">
          {PLANS.map((plan, idx) => {
            const isAnnual = billingCycle === 'annual';
            const priceDisplay = isAnnual ? plan.annualPrice : plan.monthlyPrice;
            const periodDisplay = isAnnual ? plan.periodLabelAnnual : plan.periodLabelMonthly;
            const isClicked = clickedBtnId === plan.id;

            return (
              <div
                key={plan.id}
                className={`ez-price-card ${plan.styleVariant} ${plan.isPopular ? 'is-featured-pro' : ''} ${hasEntered ? 'is-visible' : ''}`}
                style={{
                  transitionDelay: prefersReducedMotion ? '0ms' : `${600 + idx * 100}ms`
                }}
              >
                {/* Popular floating badge for Pro */}
                {plan.badge && (
                  <div className="ez-popular-badge-wrap">
                    <span className="ez-popular-badge">
                      <Sparkles size={11} className="ez-popular-badge-icon" />
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Card Top: Icon & Plan Name */}
                <div className="ez-card-top-row">
                  <div className="ez-plan-icon-wrap">
                    {plan.icon}
                  </div>
                  <div className="ez-price-plan-name">
                    {plan.name}
                  </div>
                </div>

                {/* Price Display with Animated Transition */}
                <div className="ez-price-amount-block">
                  {/* Harga coret + badge diskon promo */}
                  {plan.originalPrice && plan.discountBadge && !isAnnual && (
                    <div className="ez-promo-row">
                      <span className="ez-promo-original">{plan.originalPrice}</span>
                      <span className="ez-promo-badge">{plan.discountBadge}</span>
                    </div>
                  )}
                  <div className={`ez-price-number-row ${priceFading ? 'is-fading' : ''}`}>
                    <span className="ez-price-num tabular-nums">{priceDisplay}</span>
                    <span className="ez-price-period">{periodDisplay}</span>
                  </div>

                  {/* Annual savings details */}
                  <div className="ez-price-annual-meta">
                    {isAnnual && plan.annualBilledText ? (
                      <div className="ez-annual-billed-row">
                        <span className="ez-annual-billed-subtext">{plan.annualBilledText}</span>
                        <span className="ez-annual-savings-tag">Hemat 15%</span>
                      </div>
                    ) : (
                      <div className="ez-annual-billed-placeholder" aria-hidden="true" />
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="ez-card-divider" />

                {/* Features Checklist */}
                <div className="ez-price-features-list">
                  <div className="ez-features-header">FITUR TERMASUK:</div>
                  {plan.features.map((feat, featIdx) => (
                    <div
                      key={featIdx}
                      className={`ez-price-feat-row ${hasEntered ? 'feat-entered' : ''}`}
                      style={{
                        transitionDelay: prefersReducedMotion
                          ? '0ms'
                          : `${700 + idx * 80 + featIdx * 60}ms`
                      }}
                    >
                      <div className="ez-feat-check-icon">
                        <Check size={14} />
                      </div>
                      <span className="ez-feat-text">{feat.text}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button with Click Micro-Interaction */}
                <div className="ez-card-cta-wrap">
                  <button
                    onClick={() => handleCtaClick(plan.id)}
                    className={`ez-pricing-cta-btn ${plan.styleVariant} ${isClicked ? 'is-clicked' : ''}`}
                    aria-label={`${plan.ctaText} paket ${plan.name}`}
                  >
                    <span>{plan.ctaText}</span>
                    <span className="ez-cta-icon-box">
                      {isClicked ? (
                        <Check size={15} className="ez-cta-success-icon" />
                      ) : (
                        <ArrowRight size={15} className="ez-cta-arrow-icon" />
                      )}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Optional Trust Elements below cards */}
        <div className="ez-pricing-trust-strip">
          <p className="ez-trust-caption">
            Lebih terencana. Lebih efisien. Lebih terkendali.
          </p>
          <div className="ez-trust-chips-row">
            <div className="ez-trust-chip">
              <CheckCircle2 size={13} className="ez-trust-check" />
              <span>Data proyek tersusun rapi</span>
            </div>
            <div className="ez-trust-chip">
              <CheckCircle2 size={13} className="ez-trust-check" />
              <span>Proses estimasi lebih efisien</span>
            </div>
            <div className="ez-trust-chip">
              <CheckCircle2 size={13} className="ez-trust-check" />
              <span>Fleksibel untuk setiap kebutuhan</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExactPricing;

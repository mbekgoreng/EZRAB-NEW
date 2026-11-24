import React, { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  PLAN_IDS,
  getPlanDefinition,
  type PlanId,
} from '../../billing/plans';
import { PLAN_TAGLINE } from './exact/pricingMatrix';

interface PricingSectionProps {
  onSelectPlan?: (planId: string) => void;
}

// ---------------------------------------------------------------------------
// W6 (Wave 7): harga, batas proyek, dan jatah kredit TIDAK lagi hardcoded —
// semuanya diturunkan dari definisi paket kanonis (src/billing/plans.ts).
// Versi sebelumnya menampilkan paket usang Free/Basic/Pro/Enterprise dengan
// harga Rp0/99.000/199.000/499.000 dan batas proyek 1/3/10/∞ — semuanya
// menyimpang dari kanonis (Free/Starter/Professional/Business,
// Rp0/54.999/79.999/159.999, batas 1/7/25/∞). Diskon tahunan 15% mengikuti
// rumus yang sama dengan ExactPricing (bukan angka terpisah).
// ---------------------------------------------------------------------------

interface PlanPresentation {
  /** Fitur setelah baris batas proyek & jatah kredit (keduanya otomatis). */
  features: string[];
  ctaText: string;
  isPopular?: boolean;
  btnVariant: 'outline' | 'primary';
}

const PLAN_PRESENTATION: Record<PlanId, PlanPresentation> = {
  free: {
    features: ['AHSP Cipta Karya penuh', 'Ekspor PDF 15×/bulan · Excel 1×/bulan'],
    ctaText: 'Mulai Gratis',
    btnVariant: 'outline',
  },
  starter: {
    features: [
      'AHSP Cipta Karya penuh',
      'RAB AI, Chat AI & Dokumen AI (terbatas)',
      'Ekspor PDF 50× · Excel 30× per siklus',
    ],
    ctaText: 'Pilih Starter',
    btnVariant: 'outline',
  },
  professional: {
    features: [
      'Semua kategori AHSP 2026',
      'Custom Instructions di Chat AI',
      'Role Team hingga 6 seat · Ekspor tanpa batas',
    ],
    ctaText: 'Pilih Professional',
    isPopular: true,
    btnVariant: 'primary',
  },
  business: {
    features: [
      'Semua kategori AHSP 2026',
      'Kredit AI terbesar',
      'Role Team hingga 10 seat · Ekspor tanpa batas',
    ],
    ctaText: 'Pilih Business',
    btnVariant: 'outline',
  },
};

interface PlanView {
  id: PlanId;
  name: string;
  subtitle: string;
  priceMonthly: number;
  priceAnnual: number;
  features: string[];
  btnText: string;
  isPopular: boolean;
  btnVariant: 'outline' | 'primary';
}

function toPlanView(id: PlanId): PlanView {
  const def = getPlanDefinition(id);
  const p = PLAN_PRESENTATION[id];
  const monthly = def.monthlyPriceIdr;
  const projectFeature =
    def.projectLimit === null ? 'Proyek tanpa batas' : `${def.projectLimit} proyek aktif`;
  const creditFeature =
    def.credits.kind === 'initial'
      ? `${def.credits.credits.toLocaleString('id-ID')} kredit AI sekali — hanya untuk Chat AI`
      : `${def.credits.credits.toLocaleString('id-ID')} kredit AI/bln`;
  return {
    id: def.id,
    name: def.displayName,
    subtitle: PLAN_TAGLINE[id],
    priceMonthly: monthly,
    // Harga bulanan setara paket tahunan (diskon 15% dari harga kanonis).
    priceAnnual: Math.round(monthly * 0.85),
    features: [projectFeature, creditFeature, ...p.features],
    btnText: p.ctaText,
    isPopular: p.isPopular ?? false,
    btnVariant: p.btnVariant,
  };
}

const PLANS: PlanView[] = PLAN_IDS.map(toPlanView);

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = PLANS;

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('id-ID').format(val);
  };

  return (
    <section
      // NEW-05: dulu id="harga" — duplikat dengan section harga
      // landing (AiShowcase, yang kanonis) dan ExactPricing (mati).
      // Versi in-app ini memakai id sendiri.
      id="harga-paket"
      style={{
        padding: '100px 0',
        background: 'var(--ez-color-surface-secondary)',
        borderBottom: '1px solid var(--ez-color-border-line)',
      }}
    >
      <div className="ezrab-container">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--ez-hue-blue-bg)',
              border: '1px solid var(--ez-hue-blue-bg-deep)',
              color: 'var(--ez-color-primary)',
              padding: '4px 14px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              marginBottom: '12px',
            }}
          >
            <Sparkles size={13} />
            <span>Paket Berlangganan</span>
          </div>

          <h2
            style={{
              fontSize: 'clamp(28px, 3.4vw, 38px)',
              fontWeight: 800,
              color: 'var(--ez-color-text-primary)',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              marginBottom: '10px',
            }}
          >
            Pilih Paket yang Sesuai dengan Kebutuhan Anda
          </h2>

          <p
            style={{
              fontSize: '15px',
              color: 'var(--ez-color-text-muted)',
              maxWidth: '600px',
              margin: '0 auto',
            }}
          >
            Mulai gratis, upgrade kapan saja. Nikmati semua fitur premium untuk mendukung produktivitas Anda.
          </p>

          {/* Billing Toggle (Bulanan | Tahunan Hemat 15%) */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--ez-color-border-line)',
              padding: '4px',
              borderRadius: '999px',
              marginTop: '28px',
            }}
          >
            <button
              onClick={() => setIsAnnual(false)}
              style={{
                padding: '8px 20px',
                borderRadius: '999px',
                fontSize: '13.5px',
                fontWeight: 650,
                background: !isAnnual ? 'var(--ez-color-primary)' : 'transparent',
                color: !isAnnual ? '#ffffff' : 'var(--ez-color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Bulanan
            </button>

            <button
              onClick={() => setIsAnnual(true)}
              style={{
                padding: '8px 20px',
                borderRadius: '999px',
                fontSize: '13.5px',
                fontWeight: 650,
                background: isAnnual ? 'var(--ez-color-primary)' : 'transparent',
                color: isAnnual ? '#ffffff' : 'var(--ez-color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Tahunan <span style={{ fontSize: '11px', opacity: 0.9 }}>(Hemat 15%)</span>
            </button>
          </div>
        </div>

        {/* 4 Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            alignItems: 'stretch',
          }}
        >
          {plans.map((plan) => {
            const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;

            return (
              <div
                key={plan.id}
                style={{
                  background: 'var(--ez-color-surface)',
                  borderRadius: '20px',
                  border: plan.isPopular
                    ? '2px solid var(--ez-color-primary)'
                    : '1px solid var(--ez-color-border-line)',
                  padding: '30px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: plan.isPopular
                    ? '0 16px 36px -6px rgba(37, 99, 235, 0.16)'
                    : '0 4px 16px rgba(15, 23, 42, 0.04)',
                  transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  if (!plan.isPopular) {
                    e.currentTarget.style.borderColor = 'var(--ez-hue-blue-border)';
                    e.currentTarget.style.boxShadow = '0 12px 30px rgba(37, 99, 235, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  if (!plan.isPopular) {
                    e.currentTarget.style.borderColor = 'var(--ez-color-border-line)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(15, 23, 42, 0.04)';
                  }
                }}
              >
                {/* Popular Pill */}
                {plan.isPopular && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      background: 'var(--ez-color-primary)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 750,
                      padding: '3px 10px',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Populer
                  </div>
                )}

                {/* Plan Name & Description */}
                <h3
                  style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    color: 'var(--ez-color-text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  {plan.name}
                </h3>
                <p
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--ez-color-text-muted)',
                    marginBottom: '20px',
                    minHeight: '36px',
                  }}
                >
                  {plan.subtitle}
                </p>

                {/* Price Display */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '4px',
                    marginBottom: '24px',
                    paddingBottom: '20px',
                    borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                  }}
                >
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                    Rp
                  </span>
                  <span
                    style={{
                      fontSize: '32px',
                      fontWeight: 800,
                      color: 'var(--ez-color-text-primary)',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {formatPrice(price)}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)' }}>/bulan</span>
                </div>

                {/* Features List */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    flexGrow: 1,
                    marginBottom: '28px',
                  }}
                >
                  {plan.features.map((feat, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '13px',
                        color: 'var(--ez-color-text-body)',
                      }}
                    >
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'var(--ez-hue-blue-bg)',
                          color: 'var(--ez-color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Action CTA Button */}
                <button
                  onClick={() => onSelectPlan?.(plan.id)}
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: plan.btnVariant === 'primary' ? 'var(--ez-color-primary)' : 'var(--ez-color-surface)',
                    color: plan.btnVariant === 'primary' ? '#ffffff' : 'var(--ez-color-text-primary)',
                    border:
                      plan.btnVariant === 'primary'
                        ? 'none'
                        : '1px solid var(--ez-hue-slate-border)',
                    boxShadow:
                      plan.btnVariant === 'primary'
                        ? '0 6px 18px -2px rgba(37, 99, 235, 0.4)'
                        : 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (plan.btnVariant === 'primary') {
                      e.currentTarget.style.background = 'var(--ez-color-primary-hover)';
                    } else {
                      e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                      e.currentTarget.style.borderColor = 'var(--ez-color-text-faint)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (plan.btnVariant === 'primary') {
                      e.currentTarget.style.background = 'var(--ez-color-primary)';
                    } else {
                      e.currentTarget.style.background = 'var(--ez-color-surface)';
                      e.currentTarget.style.borderColor = 'var(--ez-hue-slate-border)';
                    }
                  }}
                >
                  {plan.btnText}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

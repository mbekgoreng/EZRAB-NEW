import React, { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';

interface PricingSectionProps {
  onSelectPlan?: (planId: string) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = [
    {
      id: 'free',
      name: 'Free',
      subtitle: 'Coba sekarang, tanpa biaya',
      priceMonthly: 0,
      priceAnnual: 0,
      features: [
        'Input & Edit RAB',
        'Export PDF',
        'Akses template dasar',
        '1 proyek aktif',
      ],
      btnText: 'Mulai Gratis',
      isPopular: false,
      btnVariant: 'outline',
    },
    {
      id: 'basic',
      name: 'Basic',
      subtitle: 'Cocok untuk individu & tim kecil',
      priceMonthly: 99000,
      priceAnnual: 79000,
      features: [
        'Semua fitur Free',
        'Export Excel',
        'Akses semua template',
        '3 proyek aktif',
      ],
      btnText: 'Pilih Basic',
      isPopular: false,
      btnVariant: 'outline',
    },
    {
      id: 'pro',
      name: 'Pro',
      subtitle: 'Untuk profesional & perusahaan',
      priceMonthly: 199000,
      priceAnnual: 159000,
      features: [
        'Semua fitur Basic',
        'Kolaborasi tim',
        'Manajemen proyek',
        '10 proyek aktif',
      ],
      btnText: 'Pilih Pro',
      isPopular: true,
      btnVariant: 'primary',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      subtitle: 'Untuk kebutuhan skala besar',
      priceMonthly: 499000,
      priceAnnual: 399000,
      features: [
        'Semua fitur Pro',
        'Custom template',
        'Dukungan prioritas',
        'Proyek tak terbatas',
      ],
      btnText: 'Hubungi Kami',
      isPopular: false,
      btnVariant: 'outline',
    },
  ];

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('id-ID').format(val);
  };

  return (
    <section
      id="harga"
      style={{
        padding: '100px 0',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
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
              background: '#eff6ff',
              border: '1px solid #dbeafe',
              color: '#2563eb',
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
              color: '#0f172a',
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
              color: '#64748b',
              maxWidth: '600px',
              margin: '0 auto',
            }}
          >
            Mulai gratis, upgrade kapan saja. Nikmati semua fitur premium untuk mendukung produktivitas Anda.
          </p>

          {/* Billing Toggle (Bulanan | Tahunan Hemat 20%) */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: '#e2e8f0',
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
                background: !isAnnual ? '#2563eb' : 'transparent',
                color: !isAnnual ? '#ffffff' : '#64748b',
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
                background: isAnnual ? '#2563eb' : 'transparent',
                color: isAnnual ? '#ffffff' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Tahunan <span style={{ fontSize: '11px', opacity: 0.9 }}>(Hemat 20%)</span>
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
                  background: '#ffffff',
                  borderRadius: '20px',
                  border: plan.isPopular
                    ? '2px solid #2563eb'
                    : '1px solid #e2e8f0',
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
                    e.currentTarget.style.borderColor = '#bfdbfe';
                    e.currentTarget.style.boxShadow = '0 12px 30px rgba(37, 99, 235, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  if (!plan.isPopular) {
                    e.currentTarget.style.borderColor = '#e2e8f0';
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
                      background: '#2563eb',
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
                    color: '#0f172a',
                    marginBottom: '4px',
                  }}
                >
                  {plan.name}
                </h3>
                <p
                  style={{
                    fontSize: '12.5px',
                    color: '#64748b',
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
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    Rp
                  </span>
                  <span
                    style={{
                      fontSize: '32px',
                      fontWeight: 800,
                      color: '#0f172a',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {formatPrice(price)}
                  </span>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>/bulan</span>
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
                        color: '#334155',
                      }}
                    >
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: '#eff6ff',
                          color: '#2563eb',
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
                    background: plan.btnVariant === 'primary' ? '#2563eb' : '#ffffff',
                    color: plan.btnVariant === 'primary' ? '#ffffff' : '#0f172a',
                    border:
                      plan.btnVariant === 'primary'
                        ? 'none'
                        : '1px solid #cbd5e1',
                    boxShadow:
                      plan.btnVariant === 'primary'
                        ? '0 6px 18px -2px rgba(37, 99, 235, 0.4)'
                        : 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (plan.btnVariant === 'primary') {
                      e.currentTarget.style.background = '#1d4ed8';
                    } else {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = '#94a3b8';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (plan.btnVariant === 'primary') {
                      e.currentTarget.style.background = '#2563eb';
                    } else {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.borderColor = '#cbd5e1';
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

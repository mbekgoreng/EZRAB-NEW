import React, { useState } from 'react';
import {
  Sparkles,
  Calculator,
  Layers,
  FileSpreadsheet,
  ArrowRight,
  ChevronLeft,
  X,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { useI18n } from '../../i18n';

interface OnboardingTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartFirstProject: () => void;
}

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({
  isOpen,
  onClose,
  onStartFirstProject,
}) => {
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      stepNumber: 1,
      badge: t('onboarding.badge_1'),
      title: t('onboarding.judul_1'),
      description: t('onboarding.desc_1'),
      highlight: t('onboarding.highlight_1'),
      icon: Sparkles,
      iconColor: '#4F46E5',
      iconBg: 'var(--ez-hue-indigo-bg-soft)',
    },
    {
      stepNumber: 2,
      badge: t('onboarding.badge_2'),
      title: t('onboarding.judul_2'),
      description: t('onboarding.desc_2'),
      items: [
        `✨ ${t('onboarding.item_2a')}`,
        `📝 ${t('onboarding.item_2b')}`,
        `📐 ${t('onboarding.item_2c')}`,
        `🏗️ ${t('onboarding.item_2d')}`,
      ],
      icon: Layers,
      iconColor: 'var(--ez-color-primary)',
      iconBg: 'var(--ez-color-primary-soft)',
    },
    {
      stepNumber: 3,
      badge: t('onboarding.badge_3'),
      title: t('onboarding.judul_3'),
      description: t('onboarding.desc_3'),
      highlight: t('onboarding.highlight_3'),
      icon: Calculator,
      iconColor: '#059669',
      iconBg: 'var(--ez-hue-emerald-bg)',
    },
    {
      stepNumber: 4,
      badge: t('onboarding.badge_4'),
      title: t('onboarding.judul_4'),
      description: t('onboarding.desc_4'),
      highlight: t('onboarding.highlight_4'),
      icon: FileSpreadsheet,
      iconColor: '#D97706',
      iconBg: 'var(--ez-hue-amber-bg)',
    },
  ];

  const active = steps[currentStep];
  const IconComponent = active.icon;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onClose();
      onStartFirstProject();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '22px',
          width: '100%',
          maxWidth: '520px',
          padding: '30px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                background: active.iconBg,
                color: active.iconColor,
                padding: '3px 10px',
                borderRadius: '99px',
                letterSpacing: '0.03em',
              }}
            >
              {active.badge} • {t('onboarding.langkah_dari')} {active.stepNumber} {t('onboarding.dari')} 4
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ez-color-text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '8px',
            }}
            title={t('onboarding.tutup_panduan')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Hero Visual Icon */}
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '12px',
            background: active.iconBg,
            color: active.iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
          }}
        >
          <IconComponent size={30} />
        </div>

        {/* Step Title & Copy */}
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 10px 0', lineHeight: 1.3 }}>
          {active.title}
        </h2>
        <p style={{ fontSize: '13.5px', color: 'var(--ez-color-text-secondary)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
          {active.description}
        </p>

        {/* Step 2 Feature Items List */}
        {active.items && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
            {active.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--ez-color-surface-secondary)',
                  border: '1px solid var(--ez-color-border)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  fontSize: '12.5px',
                  color: 'var(--ez-color-text-primary)',
                  lineHeight: 1.45,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}

        {/* Highlight Callout */}
        {active.highlight && (
          <div
            style={{
              background: 'var(--ez-color-primary-soft)',
              border: '1px solid var(--ez-hue-blue-border)',
              borderRadius: '12px',
              padding: '10px 14px',
              fontSize: '12px',
              color: 'var(--ez-color-primary-hover)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
            }}
          >
            <CheckCircle2 size={16} color="var(--ez-color-primary)" style={{ flexShrink: 0 }} />
            <span>{active.highlight}</span>
          </div>
        )}

        {/* Stepper Dots & Navigation Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid var(--ez-color-border-soft)' }}>
          {/* 4 Step Dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {[0, 1, 2, 3].map((dotIdx) => (
              <div
                key={dotIdx}
                onClick={() => setCurrentStep(dotIdx)}
                style={{
                  width: currentStep === dotIdx ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '99px',
                  background: currentStep === dotIdx ? 'var(--ez-color-primary)' : 'var(--ez-color-border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>

          {/* Action CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: '12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--ez-color-text-muted)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('common.lewati')}
            </button>

            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                style={{
                  padding: '8px 14px',
                  borderRadius: '12px',
                  background: 'var(--ez-color-surface-secondary)',
                  border: '1px solid var(--ez-color-border)',
                  color: 'var(--ez-color-text-secondary)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ChevronLeft size={15} />
                <span>{t('common.kembali')}</span>
              </button>
            )}

            <button
              onClick={handleNext}
              style={{
                padding: '8px 18px',
                borderRadius: '12px',
                background: 'var(--ez-color-primary)',
                color: 'var(--ez-color-on-primary)',
                border: 'none',
                fontSize: '13px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <span>{currentStep === 3 ? t('onboarding.mulai_proyek') : t('common.lanjut')}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTourModal;

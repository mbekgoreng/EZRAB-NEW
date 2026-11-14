/**
 * DashboardTour — guided tour 8 langkah untuk dashboard EZRAB.
 *
 * Menggunakan Spotlight untuk menyorot elemen aktual. Setiap langkah
 * menargetkan selector `data-tour` yang stabil. Jika target tidak
 * ditemukan, Spotlight otomatis melewati langkah tersebut.
 *
 * Mobile: jika viewport sempit (<768px), tampil sebagai kartu panduan
 * sederhana (bottom sheet) alih-alih spotlight.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Spotlight, SpotlightStep } from './Spotlight';
import { useOnboarding } from './OnboardingContext';
import { useI18n } from '../../i18n';
import { paths } from '../../routing/routes';

const TOUR_FLAG = 'dashboard-tour';

/**
 * D-25 (Batch G2): judul & isi langkah berasal dari kamus i18n
 * (`tour.step*_title` / `tour.step*_body`) agar tur mengikuti bahasa
 * aktif. Target selector tetap konstan.
 *
 * D-16 (Batch G2): langkah 5 menarget `[data-tour=
 * "menu-rab-spreadsheet"]` di dalam submenu RAB (tertutup default) —
 * `expandSubmenu: 'rab'` meminta Spotlight membuka submenu itu dulu
 * sebelum menyorot; tanpa ini langkah 4 melompat ke 6.
 */
function buildSteps(t: (key: string) => string): SpotlightStep[] {
  return [
    {
      target: '[data-tour="dashboard"]',
      title: t('tour.step1_title'),
      body: t('tour.step1_body'),
    },
    {
      target: '[data-tour="sidebar"]',
      title: t('tour.step2_title'),
      body: t('tour.step2_body'),
    },
    {
      target: '[data-tour="menu-proyek"]',
      title: t('tour.step3_title'),
      body: t('tour.step3_body'),
    },
    {
      target: '[data-tour="menu-ded-ai"]',
      title: t('tour.step4_title'),
      body: t('tour.step4_body'),
    },
    {
      target: '[data-tour="menu-rab-spreadsheet"]',
      title: t('tour.step5_title'),
      body: t('tour.step5_body'),
      expandSubmenu: 'rab',
    },
    {
      target: '[data-tour="menu-qto"]',
      title: t('tour.step6_title'),
      body: t('tour.step6_body'),
    },
    {
      target: '[data-tour="help"]',
      title: t('tour.step7_title'),
      body: t('tour.step7_body'),
    },
    {
      target: '[data-tour="dashboard"]',
      title: t('tour.step8_title'),
      body: t('tour.step8_body'),
    },
  ];
}

function isMobileViewport(): boolean {
  try {
    return window.innerWidth < 768;
  } catch {
    return false;
  }
}

interface DashboardTourProps {
  /** dipanggil saat tour selesai atau dilewati */
  onDone: () => void;
}

export function DashboardTour({ onDone }: DashboardTourProps) {
  const { t } = useI18n();
  const { markFeatureTourSeen, goToFeature } = useOnboarding();
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const [stepIndex, setStepIndex] = useState(0);

  // Memo: identitas array langkah harus stabil — Spotlight menjalankan
  // resolveTarget setiap kali identitas steps berubah; array baru tiap
  // render akan memicu loop setRect → render → resolveTarget.
  const steps = useMemo(() => buildSteps(t), [t]);

  useEffect(() => {
    const onResize = () => setIsMobile(isMobileViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleDone = useCallback(() => {
    markFeatureTourSeen(TOUR_FLAG);
    onDone();
  }, [markFeatureTourSeen, onDone]);

  const handleSkip = useCallback(() => {
    markFeatureTourSeen(TOUR_FLAG);
    onDone();
  }, [markFeatureTourSeen, onDone]);

  const handleStartProject = useCallback(() => {
    markFeatureTourSeen(TOUR_FLAG);
    onDone();
    goToFeature(paths.dashboard());
    // Arahkan ke halaman proyek setelah tour selesai
    setTimeout(() => goToFeature('/app/projects'), 100);
  }, [markFeatureTourSeen, onDone, goToFeature]);

  const isLastStep = stepIndex === steps.length - 1;

  // Mobile: tampilkan sebagai kartu bottom sheet sederhana
  if (isMobile) {
    const step = steps[stepIndex];
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t('tour.panduan')} ${stepIndex + 1}/${steps.length}`}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9995,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          background: 'rgba(11, 18, 32, 0.5)',
          padding: 0,
        }}
        onClick={handleSkip}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxHeight: '70vh',
            overflowY: 'auto',
            background: 'var(--ez-color-surface)',
            borderRadius: '20px 20px 0 0',
            padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 32px rgba(2, 6, 23, 0.2)',
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--ez-color-border-line)', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--ez-color-primary)', margin: '0 0 6px' }}>
            {t('tour.langkah')} {stepIndex + 1} / {steps.length}
          </p>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ezrab-text, #111827)', margin: '0 0 8px' }}>
            {step.title}
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ez-color-text-muted)', margin: '0 0 18px' }}>
            {step.body}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSkip}
              style={{ flex: 1, height: 48, borderRadius: 12, border: '1px solid var(--ez-color-border-line)', background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--ez-color-text-muted)', cursor: 'pointer' }}
            >
              {t('common.lewati')}
            </button>
            {stepIndex > 0 && (
              <button
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="ezrab-button-secondary"
                style={{ flex: 1, height: 48, fontSize: 14 }}
              >
                {t('common.kembali')}
              </button>
            )}
            {isLastStep ? (
              <button
                onClick={handleStartProject}
                className="ezrab-button-primary"
                style={{ flex: 2, height: 48, fontSize: 14 }}
              >
                {t('tour.mulai_proyek')}
              </button>
            ) : (
              <button
                onClick={() => setStepIndex((i) => i + 1)}
                className="ezrab-button-primary"
                style={{ flex: 2, height: 48, fontSize: 14 }}
              >
                {t('common.lanjut')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop: gunakan Spotlight
  return (
    <div>
      <Spotlight
        steps={steps}
        startAt={0}
        onDone={handleDone}
        onSkip={handleSkip}
        onStepChange={setStepIndex}
      />
      {isLastStep && (
        <button
          onClick={handleStartProject}
          className="ezrab-button-primary"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9996,
            height: 48,
            padding: '0 28px',
            fontSize: 14,
            borderRadius: 14,
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)',
          }}
        >
          {t('tour.mulai_proyek')}
        </button>
      )}
    </div>
  );
}

export default DashboardTour;

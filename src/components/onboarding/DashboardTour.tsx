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
import { useCallback, useEffect, useState } from 'react';
import { Spotlight, SpotlightStep } from './Spotlight';
import { useOnboarding } from './OnboardingContext';
import { paths } from '../../routing/routes';

const TOUR_FLAG = 'dashboard-tour';

const STEPS: SpotlightStep[] = [
  {
    target: '[data-tour="dashboard"]',
    title: 'Selamat datang di Dashboard EZRAB',
    body: 'Di sini kamu dapat melihat ringkasan aktivitas dan mengakses workspace utama untuk mengelola proyek konstruksi.',
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'Navigasi EZRAB',
    body: 'Gunakan navigasi ini untuk berpindah antara proyek, estimasi, AI, QTO, AHSP, laporan, dan fitur lain yang tersedia.',
  },
  {
    target: '[data-tour="menu-proyek"]',
    title: 'Kelola Proyek',
    body: 'Mulai dengan membuat proyek baru atau membuka proyek yang sudah ada dari daftar proyek. Informasi proyek menjadi dasar pengelolaan estimasi dan pekerjaan selanjutnya.',
  },
  {
    target: '[data-tour="menu-ded-ai"]',
    title: 'Buat Estimasi dengan AI',
    body: 'Gunakan AI (Ezrab Chat, DED ke RAB, Dokumen AI) untuk membantu memulai penyusunan estimasi. Selalu tinjau hasil sebelum menerapkannya ke proyek.',
  },
  {
    target: '[data-tour="menu-rab-spreadsheet"]',
    title: 'Susun Rencana Anggaran Biaya',
    body: 'Periksa item pekerjaan, volume, analisis harga satuan, harga, dan total biaya berdasarkan data yang tersedia.',
  },
  {
    target: '[data-tour="menu-qto"]',
    title: 'Periksa Volume dan AHSP',
    body: 'QTO membantu meninjau kuantitas pekerjaan, sedangkan AHSP digunakan untuk memeriksa analisis harga satuan yang relevan.',
  },
  {
    target: '[data-tour="help"]',
    title: 'Tutorial Bisa Dibuka Kembali',
    body: 'Kamu dapat membuka kembali panduan EZRAB kapan saja melalui menu bantuan atau kontrol tutorial yang tersedia.',
  },
  {
    target: '[data-tour="dashboard"]',
    title: 'Siap Memulai Proyek',
    body: 'Sekarang kamu sudah mengenal navigasi utama EZRAB. Mulailah dengan membuat proyek pertamamu.',
  },
];

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
  const { markFeatureTourSeen, goToFeature } = useOnboarding();
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const [stepIndex, setStepIndex] = useState(0);

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

  const isLastStep = stepIndex === STEPS.length - 1;

  // Mobile: tampilkan sebagai kartu bottom sheet sederhana
  if (isMobile) {
    const step = STEPS[stepIndex];
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Panduan ${stepIndex + 1} dari ${STEPS.length}`}
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
            LANGKAH {stepIndex + 1} / {STEPS.length}
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
              Lewati
            </button>
            {stepIndex > 0 && (
              <button
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="ezrab-button-secondary"
                style={{ flex: 1, height: 48, fontSize: 14 }}
              >
                Kembali
              </button>
            )}
            {isLastStep ? (
              <button
                onClick={handleStartProject}
                className="ezrab-button-primary"
                style={{ flex: 2, height: 48, fontSize: 14 }}
              >
                Mulai Membuat Proyek
              </button>
            ) : (
              <button
                onClick={() => setStepIndex((i) => i + 1)}
                className="ezrab-button-primary"
                style={{ flex: 2, height: 48, fontSize: 14 }}
              >
                Lanjut
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
        steps={STEPS}
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
          Mulai Membuat Proyek
        </button>
      )}
    </div>
  );
}

export default DashboardTour;

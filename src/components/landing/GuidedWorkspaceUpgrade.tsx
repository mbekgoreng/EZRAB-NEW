/**
 * GuidedWorkspaceUpgrade — tur 10 langkah + maskot robot berhelm (PREVIEW VARIANT)
 *
 * Branch: preview/landing-engineering-cinema
 * Self-contained: TIDAK menyentuh sistem onboarding yang sudah ada
 * (OnboardingContext / DashboardTour / TutorialCenter tetap utuh).
 * Catatan: langkah-langkah menargetkan selektor [data-tour="..."] workspace;
 * bila target tidak ada, spotlight dilewati dengan aman (bottom sheet tetap jalan).
 */
import React, { useEffect, useState, useCallback } from 'react';

export interface EZRABTutorialStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  route: string;
  targetSelector: string;
}

export const EZRAB_10_TUTORIAL_STEPS: EZRABTutorialStep[] = [
  {
    id: 'nav-dashboard',
    stepNumber: 1,
    title: 'Navigasi Dashboard',
    description:
      'Gunakan panel navigasi utama untuk berpindah antar ringkasan proyek, RAB, QTO, dan katalog AHSP.',
    route: '/dashboard',
    targetSelector: '[data-tour="sidebar-nav"]',
  },
  {
    id: 'create-project',
    stepNumber: 2,
    title: 'Membuat Proyek Baru',
    description:
      'Mulai pekerjaan dengan membuat proyek terstruktur berisi lokasi, tahun acuan, dan kategori bangunan.',
    route: '/dashboard',
    targetSelector: '[data-tour="create-project-btn"]',
  },
  {
    id: 'start-ded-to-rab',
    stepNumber: 3,
    title: 'Memulai DED → RAB',
    description:
      'Unggah dokumen teknis DED untuk mengekstrak kandidat item pekerjaan secara berbantuan AI.',
    route: '/dashboard/ded-to-rab',
    targetSelector: '[data-tour="ded-upload-zone"]',
  },
  {
    id: 'review-ai-candidates',
    stepNumber: 4,
    title: 'Meninjau Usulan Item',
    description:
      'Periksa kandidat pekerjaan dan status kecocokan satuannya sebelum Anda menyetujuinya ke dalam RAB.',
    route: '/dashboard/ded-to-rab',
    targetSelector: '[data-tour="candidate-review-table"]',
  },
  {
    id: 'recognize-rab-ahsp',
    stepNumber: 5,
    title: 'Mengenali RAB dan AHSP',
    description:
      'Tinjau bagaimana setiap baris pekerjaan di RAB terhubung dengan koefisien upah, bahan, dan alat pada AHSP.',
    route: '/dashboard/rab',
    targetSelector: '[data-tour="rab-ahsp-link"]',
  },
  {
    id: 'recognize-qto',
    stepNumber: 6,
    title: 'Mengenali Perhitungan QTO',
    description:
      'Periksa parameter dimensi dan rumus perhitungan volume yang menyuplai kuantitas ke baris RAB.',
    route: '/dashboard/qto',
    targetSelector: '[data-tour="qto-formula-panel"]',
  },
  {
    id: 'inspect-cost-provenance',
    stepNumber: 7,
    title: 'Meninjau Sumber Harga',
    description:
      'Pastikan indikator provenance harga (AHSP Resmi, Harga Manual, atau Perlu Verifikasi) sudah sesuai.',
    route: '/dashboard/rab',
    targetSelector: '[data-tour="cost-provenance-badge"]',
  },
  {
    id: 'prepare-reports',
    stepNumber: 8,
    title: 'Menyiapkan Laporan Konstruksi',
    description:
      'Susun dan tinjau preview dokumen rekapitulasi estimasi serta rincian biaya proyek.',
    route: '/dashboard/reports',
    targetSelector: '[data-tour="report-export-panel"]',
  },
  {
    id: 'find-tutorial-center',
    stepNumber: 9,
    title: 'Menemukan Tutorial Center',
    description:
      'Akses kembali panduan per fitur kapan saja melalui tombol Tutorial Center di sudut workspace.',
    route: '/dashboard',
    targetSelector: '[data-tour="tutorial-center-trigger"]',
  },
  {
    id: 'resume-or-replay',
    stepNumber: 10,
    title: 'Mengulangi atau Melanjutkan Tutorial',
    description:
      'Progres panduan Anda tersimpan otomatis sehingga Anda dapat menjeda dan melanjutkan kapan pun dibutuhkan.',
    route: '/dashboard',
    targetSelector: '[data-tour="tutorial-progress-status"]',
  },
];

/**
 * Maskot Robot Berhelm Proyek EZRAB (Ringan, Tanpa Beban WebGL di Dashboard)
 */
export const EzrabEngineerMascot: React.FC<{ pointing?: boolean }> = ({ pointing = false }) => {
  return (
    <div className="relative w-14 h-14 shrink-0 select-none" aria-hidden="true">
      <svg
        viewBox="0 0 80 80"
        className="w-full h-full motion-safe:animate-[bounce_3.2s_ease-in-out_infinite]"
        fill="none"
      >
        {/* Safety Hard Hat */}
        <path
          d="M18 32C18 19.8497 27.8497 10 40 10C52.1503 10 62 19.8497 62 32H18Z"
          fill="#F59E0B"
          stroke="#0F172A"
          strokeWidth="2.5"
        />
        <rect x="14" y="30" width="52" height="6" rx="3" fill="#D97706" stroke="#0F172A" strokeWidth="2" />
        <rect x="36" y="12" width="8" height="10" rx="2" fill="#FEF3C7" />

        {/* Robot Head */}
        <rect
          x="22"
          y="36"
          width="36"
          height="28"
          rx="8"
          fill="#FFFFFF"
          stroke="#0F172A"
          strokeWidth="2.5"
        />
        {/* Visor Screen */}
        <rect x="27" y="42" width="26" height="14" rx="4" fill="#0F172A" />
        {/* Glowing Cyan Eyes */}
        <circle cx="34" cy="49" r="3" fill="#56C8F5" />
        <circle cx="46" cy="49" r="3" fill="#56C8F5" />

        {/* Pointing Arm Gesture */}
        {pointing && (
          <path
            d="M58 52L72 46"
            stroke="#2563EB"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
};

interface GuidedTourControllerProps {
  storageKey?: string;
  currentPath?: string;
  onNavigate?: (route: string) => void;
  /** Dipanggil saat pengguna menutup/menyelesaikan tur (untuk unmount dari host). */
  onClose?: () => void;
}

export const GuidedWorkspaceTour: React.FC<GuidedTourControllerProps> = ({
  storageKey = 'ezrab_onboarding_progress_v1',
  currentPath = '/dashboard',
  onNavigate,
  onClose,
}) => {
  const [showWelcome, setShowWelcome] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Load saved progress safely
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setShowWelcome(true);
        return;
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed.stepIndex === 'number') {
        setStepIndex(
          Math.max(0, Math.min(EZRAB_10_TUTORIAL_STEPS.length - 1, parsed.stepIndex))
        );
      }
      if (parsed.status === 'in_progress') {
        setIsActive(true);
      }
    } catch {
      setShowWelcome(true);
    }
  }, [storageKey]);

  const saveProgress = useCallback(
    (nextStep: number, status: 'in_progress' | 'paused' | 'completed' | 'dismissed') => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            stepIndex: nextStep,
            status,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore storage quota errors
      }
    },
    [storageKey]
  );

  const currentStep = EZRAB_10_TUTORIAL_STEPS[stepIndex];

  // Wait for route and target DOM readiness before clamping spotlight
  useEffect(() => {
    if (!isActive || !currentStep) return;

    if (onNavigate && currentPath !== currentStep.route) {
      onNavigate(currentStep.route);
    }

    let attempts = 0;
    const pollId = window.setInterval(() => {
      attempts += 1;
      const el = document.querySelector(currentStep.targetSelector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.clearInterval(pollId);
      } else if (attempts >= 15) {
        setTargetRect(null);
        window.clearInterval(pollId);
      }
    }, 120);

    return () => window.clearInterval(pollId);
  }, [isActive, currentStep, currentPath, onNavigate]);

  const handleStartTour = () => {
    setShowWelcome(false);
    setStepIndex(0);
    setIsActive(true);
    saveProgress(0, 'in_progress');
  };

  const handleDismissWelcome = () => {
    setShowWelcome(false);
    saveProgress(0, 'dismissed');
    onClose?.();
  };

  const handleNext = () => {
    if (stepIndex < EZRAB_10_TUTORIAL_STEPS.length - 1) {
      const next = stepIndex + 1;
      setStepIndex(next);
      saveProgress(next, 'in_progress');
    } else {
      setIsActive(false);
      saveProgress(0, 'completed');
      onClose?.();
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      const prev = stepIndex - 1;
      setStepIndex(prev);
      saveProgress(prev, 'in_progress');
    }
  };

  const handlePause = () => {
    setIsActive(false);
    saveProgress(stepIndex, 'paused');
  };

  const handleExit = () => {
    setIsActive(false);
    saveProgress(0, 'dismissed');
    onClose?.();
  };

  return (
    <>
      {/* 8.1 Welcome Modal (Tidak Mengunci Pengguna) */}
      {showWelcome && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ezrab-welcome-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-[#0F172A]/40 backdrop-blur-xs"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#DCE6F2] p-6 shadow-xl">
            <div className="flex items-start gap-4">
              <EzrabEngineerMascot pointing />
              <div>
                <span className="font-mono text-[11px] font-semibold uppercase text-[#2563EB]">
                  LIVING ENGINEERING WORKSPACE
                </span>
                <h2 id="ezrab-welcome-title" className="text-lg font-bold text-[#0F172A] mt-0.5">
                  Selamat Datang di EZRAB Workspace
                </h2>
                <p className="text-xs sm:text-sm text-[#647D9B] mt-1.5 leading-relaxed">
                  Kenali alur kerja mulai dari pembuatan proyek, peninjauan DED ke RAB, pemeriksaan
                  QTO, hingga transparansi sumber harga dalam 10 langkah singkat.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleDismissWelcome}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#647D9B] hover:text-[#0F172A] hover:bg-[#F5F8FC] border border-[#DCE6F2] transition-colors"
              >
                Jelajahi Sendiri
              </button>
              <button
                type="button"
                onClick={handleStartTour}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#2563EB] text-white hover:bg-blue-700 transition-colors"
              >
                Mulai Tur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8.2 & 8.4 Interactive Spotlight + Mobile-First Bottom Sheet (390px safe) */}
      {isActive && currentStep && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Clamped Spotlight Highlight Box */}
          {targetRect && (
            <div
              aria-hidden="true"
              className="fixed rounded-xl border-2 border-[#2563EB] shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] transition-all duration-300"
              style={{
                top: Math.max(8, targetRect.top - 6),
                left: Math.max(8, targetRect.left - 6),
                width: Math.min(window.innerWidth - 16, targetRect.width + 12),
                height: Math.min(window.innerHeight - 180, targetRect.height + 12),
              }}
            />
          )}

          {/* Bottom Sheet on Mobile (390px) / Floating Card on Desktop */}
          <div
            role="dialog"
            aria-label={`Langkah tutorial ${currentStep.stepNumber} dari ${EZRAB_10_TUTORIAL_STEPS.length}`}
            className="pointer-events-auto fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[400px] bg-white rounded-t-2xl sm:rounded-2xl border border-[#DCE6F2] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <EzrabEngineerMascot pointing />
                <div>
                  <span className="font-mono text-[11px] font-bold text-[#2563EB]">
                    LANGKAH {currentStep.stepNumber} / {EZRAB_10_TUTORIAL_STEPS.length}
                  </span>
                  <h3 className="text-sm font-bold text-[#0F172A]">{currentStep.title}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={handleExit}
                className="text-xs text-[#647D9B] hover:text-[#0F172A] px-2 py-1"
                aria-label="Keluar dari tutorial"
              >
                Tutup
              </button>
            </div>

            <p className="mt-3 text-xs sm:text-sm text-[#647D9B] leading-relaxed">
              {currentStep.description}
            </p>

            <div className="mt-5 pt-3 border-t border-[#DCE6F2] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePause}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#647D9B] hover:text-[#0F172A] hover:bg-[#F5F8FC]"
                >
                  Jeda
                </button>
                <button
                  type="button"
                  onClick={handleExit}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#647D9B] hover:text-[#0F172A] hover:bg-[#F5F8FC]"
                >
                  Lewati Semua
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={stepIndex === 0}
                  onClick={handleBack}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border border-[#DCE6F2] text-[#0F172A] disabled:opacity-40"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#2563EB] text-white hover:bg-blue-700"
                >
                  {stepIndex === EZRAB_10_TUTORIAL_STEPS.length - 1 ? 'Selesai' : 'Lanjut'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

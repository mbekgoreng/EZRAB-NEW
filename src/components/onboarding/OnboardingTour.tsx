/**
 * OnboardingTour
 *
 * Layar sapa + tutorial singkat (3 langkah) untuk pengguna baru:
 *   1. Sapaan + apa itu EZRAB
 *   2. Fitur utama (RAB & estimasi, AI, database AHSP 2026)
 *   3. Cara mulai (buat proyek / buka dashboard)
 *
 * - Muncul SETELAH login/daftar berhasil (bukan saat boot landing page).
 * - "Lewati" = lewati kali ini saja (muncul lagi saat login berikutnya).
 * - "Jangan tampilkan lagi" / menyelesaikan tur = tidak muncul lagi,
 *   via flag localStorage `ezrab_onboarding_done_v1`.
 * - Bisa dibuka ulang dari pengaturan: panggil `openOnboarding()` atau
 *   dispatch CustomEvent `ezrab:open-onboarding`, lalu hubungkan dengan
 *   `useOnboardingTour()` di parent.
 * - `resetOnboarding()` menghapus flag (berguna untuk pengujian / pengaturan).
 *
 * Contoh integrasi di App.tsx:
 *   const { open, closeTour } = useOnboardingTour();
 *   const handleLoginSuccess = () => { if (shouldShowOnboarding()) setTourPending(true); };
 *   {booted && <OnboardingTour open={open} onClose={closeTour} />}
 */
import { useCallback, useEffect, useState } from 'react';
import { GreetingMascot } from '../boot/GreetingMascot';

export const ONBOARDING_FLAG = 'ezrab_onboarding_done_v1';
export const ONBOARDING_OPEN_EVENT = 'ezrab:open-onboarding';

const TOUR_STYLES = `
@keyframes ezrab-tour-enter {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes ezrab-tour-step {
  from { opacity: 0; transform: translateX(18px); }
  to { opacity: 1; transform: translateX(0); }
}
.ezrab-tour-enter { animation: ezrab-tour-enter 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }
.ezrab-tour-step { animation: ezrab-tour-step 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

/* ---------------- helpers ---------------- */

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeFlag(): void {
  try {
    window.localStorage.setItem(ONBOARDING_FLAG, '1');
  } catch {
    /* abaikan jika storage tidak tersedia */
  }
}

/** Apakah tur perlu ditampilkan untuk pengguna ini? */
export function shouldShowOnboarding(): boolean {
  return !readFlag();
}

/** Tandai tur sebagai selesai. */
export function markOnboardingDone(): void {
  writeFlag();
}

/** Hapus flag — tur akan muncul lagi di boot berikutnya. */
export function resetOnboarding(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_FLAG);
  } catch {
    /* abaikan */
  }
}

/** Buka tur dari mana saja (mis. halaman Pengaturan) lewat event global. */
export function openOnboarding(): void {
  window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT));
}

/** Hook: mengelola state buka/tutup tur + mendengarkan `openOnboarding()`. */
export function useOnboardingTour() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(ONBOARDING_OPEN_EVENT, handler);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, handler);
  }, []);

  const closeTour = useCallback(() => setOpen(false), []);
  const openTour = useCallback(() => setOpen(true), []);

  return { open, openTour, closeTour };
}

/* ---------------- ikon fitur (inline SVG) ---------------- */

function FeatureIcon({ kind }: { kind: 'rab' | 'ai' | 'db' }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'var(--ezrab-blue, #2563eb)',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (kind === 'rab')
    return (
      <svg {...common}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  if (kind === 'ai')
    return (
      <svg {...common}>
        <rect x="7" y="7" width="10" height="10" rx="2.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="10" cy="11" r="1" fill="var(--ezrab-blue, #2563eb)" stroke="none" />
        <circle cx="14" cy="11" r="1" fill="var(--ezrab-blue, #2563eb)" stroke="none" />
      </svg>
    );
  return (
    <svg {...common}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13" />
      <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
    </svg>
  );
}

/* ---------------- konten langkah ---------------- */

const FEATURES = [
  {
    kind: 'rab' as const,
    title: 'RAB & Estimasi',
    desc: 'Susun Rencana Anggaran Biaya proyek lengkap dengan volume, harga satuan, dan rekap otomatis.',
  },
  {
    kind: 'ai' as const,
    title: 'AI Estimator',
    desc: 'Asisten AI membantu menghitung volume, menganalisis gambar kerja (DED), dan menyusun dokumen.',
  },
  {
    kind: 'db' as const,
    title: 'Database AHSP 2026',
    desc: 'Analisa Harga Satuan Pekerjaan 2026 siap pakai — akurat dan selalu terbarui.',
  },
];

const START_STEPS = [
  {
    title: 'Buat proyek baru',
    desc: 'Beri nama proyek, pilih jenis pekerjaan, dan mulai susun RAB dari template.',
  },
  {
    title: 'Buka dashboard',
    desc: 'Lihat ringkasan semua proyek, progres pekerjaan, dan aktivitas terbaru Anda.',
  },
];

/* ---------------- komponen ---------------- */

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const totalSteps = 3;
  const isLast = step === totalSteps - 1;

  // Reset ke langkah pertama setiap tur dibuka
  useEffect(() => {
    if (open) setStep(0);
  }, [open ]);

  const handleFinish = useCallback(() => {
    markOnboardingDone();
    onClose();
  }, [onClose]);

  /** "Lewati" — tutup kali ini saja, tur boleh muncul lagi di login berikutnya. */
  const handleSkipOnce = useCallback(() => {
    onClose();
  }, [onClose]);

  /** "Jangan tampilkan lagi" — tutup permanen. */
  const handleDontShowAgain = useCallback(() => {
    markOnboardingDone();
    onClose();
  }, [onClose]);

  const next = useCallback(() => {
    if (isLast) handleFinish();
    else setStep((s) => s + 1);
  }, [isLast, handleFinish]);

  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  // Tutup dengan tombol Escape (dianggap "lewati sekali")
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkipOnce();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleSkipOnce, next, back]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panduan awal EZRAB"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <style>{TOUR_STYLES}</style>

      <div
        className="ezrab-tour-enter"
        style={{
          width: 'min(440px, 100%)',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          background: 'var(--ezrab-card-bg, #ffffff)',
          border: '1px solid var(--ezrab-card-border, #e5e7eb)',
          borderRadius: 'var(--ezrab-radius-xl, 28px)',
          boxShadow: 'var(--ezrab-shadow-lg)',
          padding: 28,
          fontFamily: 'var(--ezrab-font-sans)',
        }}
      >
        {/* Header: indikator langkah + Lewati */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 24 : 8,
                  height: 8,
                  borderRadius: 'var(--ezrab-radius-full, 9999px)',
                  background: i <= step ? 'var(--ezrab-blue, #2563eb)' : 'var(--ezrab-surface-subtle, #f1f5f9)',
                  transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            ))}
          </div>
          <button
            onClick={handleSkipOnce}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ezrab-text-secondary, #64748b)',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: 'var(--ezrab-radius-sm, 8px)',
              minHeight: 'var(--ezrab-touch-min, 44px)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ezrab-surface-soft, #f8fafc)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Lewati
          </button>
        </div>

        {/* Isi langkah */}
        <div key={step} className="ezrab-tour-step">
          {step === 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <GreetingMascot size={112} />
              </div>
              <h2
                style={{
                  fontSize: 'var(--font-size-h1, 24px)',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: 'var(--ezrab-text, #111827)',
                  margin: '0 0 10px',
                }}
              >
                Selamat datang di EZRAB!
              </h2>
              <p
                style={{
                  fontSize: 'var(--font-size-body, 13.5px)',
                  lineHeight: 1.6,
                  color: 'var(--ezrab-text-secondary, #64748b)',
                  margin: 0,
                }}
              >
                EZRAB adalah aplikasi penyusun <strong style={{ color: 'var(--ezrab-text, #111827)' }}>RAB &amp; estimasi
                biaya konstruksi</strong> yang cepat, akurat, dan mudah dipakai — dari perencanaan sampai rekap anggaran
                proyek Anda.
              </p>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2
                style={{
                  fontSize: 'var(--font-size-h1, 24px)',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: 'var(--ezrab-text, #111827)',
                  margin: '0 0 6px',
                }}
              >
                Semua kebutuhan estimasi, satu tempat
              </h2>
              <p
                style={{
                  fontSize: 'var(--font-size-body, 13.5px)',
                  color: 'var(--ezrab-text-secondary, #64748b)',
                  margin: '0 0 16px',
                  lineHeight: 1.6,
                }}
              >
                Tiga hal utama yang bisa Anda lakukan di EZRAB:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: 14,
                      background: 'var(--ezrab-surface-soft, #f8fafc)',
                      border: '1px solid var(--ezrab-border-light, #f1f5f9)',
                      borderRadius: 'var(--ezrab-radius-md, 14px)',
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: 'var(--ezrab-blue-soft, #eff6ff)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FeatureIcon kind={f.kind} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ezrab-text, #111827)', margin: '0 0 2px' }}>
                        {f.title}
                      </p>
                      <p
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          color: 'var(--ezrab-text-secondary, #64748b)',
                          margin: 0,
                        }}
                      >
                        {f.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2
                style={{
                  fontSize: 'var(--font-size-h1, 24px)',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: 'var(--ezrab-text, #111827)',
                  margin: '0 0 6px',
                }}
              >
                Mulai dalam hitungan detik
              </h2>
              <p
                style={{
                  fontSize: 'var(--font-size-body, 13.5px)',
                  color: 'var(--ezrab-text-secondary, #64748b)',
                  margin: '0 0 16px',
                  lineHeight: 1.6,
                }}
              >
                Tidak perlu pengaturan rumit. Pilih salah satu untuk mulai:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {START_STEPS.map((s, i) => (
                  <div
                    key={s.title}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: 14,
                      background: 'var(--ezrab-surface-soft, #f8fafc)',
                      border: '1px solid var(--ezrab-border-light, #f1f5f9)',
                      borderRadius: 'var(--ezrab-radius-md, 14px)',
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--ezrab-radius-full, 9999px)',
                        background: 'var(--ezrab-blue, #2563eb)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ezrab-text, #111827)', margin: '0 0 2px' }}>
                        {s.title}
                      </p>
                      <p
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          color: 'var(--ezrab-text-secondary, #64748b)',
                          margin: 0,
                        }}
                      >
                        {s.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--ezrab-text-muted, #94a3b8)',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                Panduan ini bisa dibuka lagi kapan saja dari menu Pengaturan.
              </p>
            </div>
          )}
        </div>

        {/* Footer navigasi */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 24,
            gap: 12,
          }}
        >
          {step > 0 ? (
            <button
              onClick={back}
              className="ezrab-button-secondary"
              style={{ height: 44, padding: '0 20px', minWidth: 110 }}
            >
              Kembali
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={next}
            className="ezrab-button-primary"
            style={{ height: 44, padding: '0 24px', minWidth: 140 }}
          >
            {isLast ? 'Mulai Sekarang' : 'Lanjut'}
          </button>
        </div>

        {/* Opsi permanen: jangan tampilkan lagi di login berikutnya */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button
            onClick={handleDontShowAgain}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 12.5,
              color: 'var(--ezrab-text-muted, #94a3b8)',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              padding: '6px 10px',
            }}
          >
            Jangan tampilkan lagi
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingTour;

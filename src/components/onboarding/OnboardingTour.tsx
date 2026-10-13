/**
 * OnboardingTour — Tutorial interaktif 6 langkah untuk pengguna baru EZRAB.
 *
 * Langkah:
 *   0. Selamat Datang (welcome)
 *   1. Kenali Dashboard
 *   2. Buat Proyek
 *   3. Buat dan Kelola RAB
 *   4. Gunakan CoAssistant dan Magic AI
 *   5. Gunakan AHSP dan Dokumen
 *   6. Selesai
 *
 * Penyimpanan status:
 * - `ezrab_onboarding_done_v1` = '1' → selesai / jangan tampilkan lagi
 * - `ezrab_onboarding_step_v1` = nomor langkah terakhir (untuk lanjutkan)
 * - Namespace per-user: suffix dengan user ID jika tersedia
 *
 * Buka ulang: dispatch CustomEvent `ezrab:open-onboarding`
 * Tutup: Escape (lewati sekali), tombol tutup, tombol Lewati
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GreetingMascot } from '../boot/GreetingMascot';

export const ONBOARDING_FLAG = 'ezrab_onboarding_done_v1';
export const ONBOARDING_STEP_KEY = 'ezrab_onboarding_step_v1';
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
@keyframes ezrab-mascot-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.ezrab-tour-enter { animation: ezrab-tour-enter 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }
.ezrab-tour-step { animation: ezrab-tour-step 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
.ezrab-mascot-anim { animation: ezrab-mascot-bounce 2.5s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .ezrab-tour-enter, .ezrab-tour-step, .ezrab-mascot-anim { animation: none; }
}
`;

/* ---------------- storage helpers ---------------- */

function storageKey(base: string, userId?: string): string {
  return userId ? `${base}_${userId}` : base;
}

function readFlag(userId?: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(ONBOARDING_FLAG, userId)) === '1';
  } catch {
    return false;
  }
}

function writeFlag(userId?: string): void {
  try {
    window.localStorage.setItem(storageKey(ONBOARDING_FLAG, userId), '1');
  } catch { /* abaikan */ }
}

function readStep(userId?: string): number {
  try {
    const v = window.localStorage.getItem(storageKey(ONBOARDING_STEP_KEY, userId));
    const n = v ? parseInt(v, 10) : 0;
    return isNaN(n) ? 0 : Math.max(0, Math.min(n, 6));
  } catch {
    return 0;
  }
}

function writeStep(step: number, userId?: string): void {
  try {
    window.localStorage.setItem(storageKey(ONBOARDING_STEP_KEY, userId), String(step));
  } catch { /* abaikan */ }
}

export function shouldShowOnboarding(userId?: string): boolean {
  return !readFlag(userId);
}

export function markOnboardingDone(userId?: string): void {
  writeFlag(userId);
  try {
    window.localStorage.removeItem(storageKey(ONBOARDING_STEP_KEY, userId));
  } catch { /* abaikan */ }
}

export function resetOnboarding(userId?: string): void {
  try {
    window.localStorage.removeItem(storageKey(ONBOARDING_FLAG, userId));
    window.localStorage.removeItem(storageKey(ONBOARDING_STEP_KEY, userId));
  } catch { /* abaikan */ }
}

export function openOnboarding(): void {
  window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT));
}

/* ---------------- langkah tutorial ---------------- */

interface TourStep {
  title: string;
  subtitle?: string;
  desc: string;
  bullets?: string[];
  actionLabel?: string;
  actionHref?: string;
  note?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    // 0 — Welcome
    title: 'Selamat Datang di EZRAB!',
    subtitle: 'Saya CoAssistant, asisten pintar Anda untuk mengelola RAB dengan lebih mudah dan cepat.',
    desc: 'Kami akan memandu Anda mengenal fitur utama EZRAB agar Anda bisa mulai bekerja dengan percaya diri.',
  },
  {
    // 1 — Dashboard
    title: 'Semua Proyek dalam Satu Tempat',
    desc: 'Dashboard membantu Anda melihat ringkasan proyek dan aktivitas pekerjaan. Gunakan menu Proyek untuk mulai mengelola proyek konstruksi.',
    bullets: [
      'Ringkasan total proyek aktif',
      'Aktivitas terbaru dan progres',
      'Akses cepat ke menu Proyek',
    ],
    actionLabel: 'Buka Dashboard',
    actionHref: '/app/dashboard',
  },
  {
    // 2 — Buat Proyek
    title: 'Mulai dari Proyek Anda',
    desc: 'Buat proyek baru, isi informasi dasar, lalu pilih metode penyusunan RAB yang sesuai kebutuhan.',
    bullets: [
      'Magic AI — susun RAB otomatis dari deskripsi',
      'Manual RAB — input item satu per satu',
      'Perhitungan Volume — hitung dari gambar',
      'Template RAB — pakai template yang sudah ada',
    ],
    actionLabel: 'Coba Buat Proyek',
    actionHref: '/app/proyek',
    note: 'Tidak ada proyek yang dibuat otomatis — Anda yang mengisi datanya.',
  },
  {
    // 3 — Kelola RAB
    title: 'Susun RAB dengan Lebih Mudah',
    desc: 'Tambahkan pekerjaan, tentukan volume dan satuan, periksa harga satuan, lalu tinjau subtotal serta total RAB.',
    bullets: [
      'Uraian pekerjaan yang jelas',
      'Volume dan satuan yang terverifikasi',
      'Harga satuan dari AHSP 2026',
      'Status validasi per item',
    ],
    actionLabel: 'Buka RAB',
    actionHref: '/app/rab',
    note: 'Contoh di bawah adalah DEMO — bukan data proyek Anda. Volume yang belum terverifikasi harus ditinjau sebelum digunakan.',
  },
  {
    // 4 — CoAssistant & Magic AI
    title: 'Cukup Tanyakan Apa yang Anda Butuhkan',
    desc: 'CoAssistant membantu mencari informasi proyek, memahami data RAB, dan menggunakan perintah yang didukung aplikasi.',
    bullets: [
      '"Berapa total RAB proyek ini?" — cek total cepat',
      '"Bantu saya menyusun RAB rumah tipe 36" — buat draf RAB',
      'Perintah slash: /help, /total, /cari',
    ],
    actionLabel: 'Coba CoAssistant',
    actionHref: '/app/ezrab-ai',
    note: 'CoAssistant dan Magic AI adalah fitur berbeda: CoAssistant untuk tanya-jawab, Magic AI untuk generate otomatis. Hasil AI perlu diperiksa sebelum dipakai.',
  },
  {
    // 5 — AHSP & Dokumen
    title: 'Periksa Dasar Perhitungan',
    desc: 'Gunakan fitur AHSP dan dokumen untuk membantu memeriksa dasar pekerjaan, harga, dan informasi teknis yang tersedia.',
    bullets: [
      'Pencarian AHSP 2026',
      'Pemeriksaan harga satuan',
      'Analisis dokumen DED dengan AI',
      'Kurva S dan progres proyek',
    ],
    actionLabel: 'Buka AHSP',
    actionHref: '/app/ahsp',
    note: 'Hasil AI dan kuantitas yang belum terverifikasi perlu diperiksa sebelum digunakan untuk keputusan proyek.',
  },
  {
    // 6 — Selesai
    title: 'Anda Siap Menggunakan EZRAB!',
    desc: 'Sekarang Anda sudah mengenal dasar penggunaan EZRAB. Mulailah dengan membuat proyek, menyusun RAB, atau bertanya kepada CoAssistant.',
  },
];

const TOTAL_STEPS = TOUR_STEPS.length;

/* ---------------- hook ---------------- */

export function useOnboardingTour(userId?: string) {
  const [open, setOpen] = useState(false);

  const openTour = useCallback(() => setOpen(true), []);
  const closeTour = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(ONBOARDING_OPEN_EVENT, handler);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, handler);
  }, []);

  return { open, openTour, closeTour, shouldShow: shouldShowOnboarding(userId) };
}

/* ---------------- komponen ---------------- */

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
  userId?: string;
}

export function OnboardingTour({ open, onClose, userId }: OnboardingTourProps) {
  // Mulai dari langkah tersimpan (lanjutkan) atau 0
  const [step, setStep] = useState(() => readStep(userId));
  const modalRef = useRef<HTMLDivElement>(null);
  const isLast = step === TOTAL_STEPS - 1;
  const isWelcome = step === 0;
  const current = TOUR_STEPS[step];

  // Reset ke langkah tersimpan setiap dibuka
  useEffect(() => {
    if (open) {
      setStep(readStep(userId));
      // Fokus ke modal untuk aksesibilitas
      setTimeout(() => modalRef.current?.focus(), 50);
    }
  }, [open, userId]);

  // Simpan progress setiap ganti langkah
  useEffect(() => {
    if (open) writeStep(step, userId);
  }, [step, open, userId]);

  const handleFinish = useCallback(() => {
    markOnboardingDone(userId);
    onClose();
  }, [onClose, userId]);

  const handleSkipOnce = useCallback(() => {
    onClose(); // progress tersimpan, bisa dilanjutkan nanti
  }, [onClose]);

  const handleDontShowAgain = useCallback(() => {
    markOnboardingDone(userId);
    onClose();
  }, [onClose, userId]);

  const next = useCallback(() => {
    if (isLast) handleFinish();
    else setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [isLast, handleFinish]);

  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  // Keyboard: Escape = tutup, panah = navigasi
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

  // Trap fokus sederhana di dalam modal
  useEffect(() => {
    if (!open) return;
    const handleFocus = (e: FocusEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        modalRef.current.focus();
      }
    };
    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, [open ]);

  if (!open) return null;

  const handleAction = () => {
    if (current.actionHref) {
      window.location.href = current.actionHref;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial EZRAB"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        // Klik backdrop = lewati sekali (tidak tutup permanen)
        if (e.target === e.currentTarget) handleSkipOnce();
      }}
    >
      <style>{TOUR_STYLES}</style>

      <div
        ref={modalRef}
        tabIndex={-1}
        className="ezrab-tour-enter"
        style={{
          width: 'min(520px, 100%)',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 24,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          padding: '28px 28px 24px',
          fontFamily: 'inherit',
          outline: 'none',
        }}
      >
        {/* Header: indikator + tutup */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-label={`Langkah ${step + 1} dari ${TOTAL_STEPS}`}>
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 28 : 8,
                  height: 8,
                  borderRadius: 9999,
                  background: i < step ? '#3b82f6' : i === step ? '#1d4ed8' : '#e2e8f0',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              {step + 1}/{TOTAL_STEPS}
            </span>
          </div>
          <button
            onClick={handleSkipOnce}
            aria-label="Tutup tutorial"
            style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid #e2e8f0',
              background: '#f8fafc', color: '#64748b', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Maskot */}
        <div className="ezrab-mascot-anim" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <GreetingMascot size={72} />
        </div>

        {/* Konten langkah */}
        <div key={step} className="ezrab-tour-step" style={{ textAlign: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            {current.title}
          </h2>
          {current.subtitle && (
            <p style={{ fontSize: 14, color: '#3b82f6', fontWeight: 600, margin: '0 0 12px' }}>
              {current.subtitle}
            </p>
          )}
          <p style={{ fontSize: 14.5, color: '#475569', lineHeight: 1.65, margin: '0 0 12px' }}>
            {current.desc}
          </p>

          {current.bullets && (
            <ul style={{ textAlign: 'left', margin: '0 auto 12px', maxWidth: 400, paddingLeft: 20, fontSize: 13.5, color: '#334155', lineHeight: 1.7 }}>
              {current.bullets.map((b, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{b}</li>
              ))}
            </ul>
          )}

          {current.note && (
            <div style={{
              fontSize: 12.5, color: '#92400e', background: '#fffbeb',
              border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px',
              margin: '0 auto', maxWidth: 420, textAlign: 'left', lineHeight: 1.5,
            }}>
              ℹ️ {current.note}
            </div>
          )}
        </div>

        {/* Tombol aksi langkah (jika ada) */}
        {current.actionLabel && current.actionHref && (
          <button
            onClick={handleAction}
            style={{
              display: 'block', width: '100%', marginBottom: 12,
              padding: '12px', borderRadius: 12, border: '1px solid #bfdbfe',
              background: '#eff6ff', color: '#1d4ed8',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {current.actionLabel} →
          </button>
        )}

        {/* Navigasi */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {step > 0 && (
            <button
              onClick={back}
              style={{
                flex: 1, padding: '12px', borderRadius: 12,
                border: '1px solid #e2e8f0', background: '#ffffff',
                color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ← Kembali
            </button>
          )}
          <button
            onClick={next}
            style={{
              flex: 2, padding: '12px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            }}
          >
            {isWelcome ? 'Mulai Tutorial' : isLast ? 'Mulai Menggunakan EZRAB' : 'Berikutnya →'}
          </button>
        </div>

        {/* Opsi bawah */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button
            onClick={handleSkipOnce}
            style={{ fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Lewati Tutorial
          </button>
          <label style={{ fontSize: 12.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              onChange={(e) => { if (e.target.checked) handleDontShowAgain(); }}
              style={{ accentColor: '#2563eb' }}
            />
            Jangan tampilkan otomatis lagi
          </label>
        </div>

        {isLast && (
          <button
            onClick={() => { resetOnboarding(userId); setStep(0); }}
            style={{
              display: 'block', width: '100%', marginTop: 12,
              fontSize: 13, color: '#3b82f6', background: 'none',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}
          >
            ↻ Ulangi Tutorial
          </button>
        )}
      </div>
    </div>
  );
}

export default OnboardingTour;

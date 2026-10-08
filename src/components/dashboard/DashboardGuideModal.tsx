/**
 * DashboardGuideModal
 *
 * Popup tutorial yang muncul saat pengguna PERTAMA KALI masuk dashboard
 * (belum punya proyek). Tujuannya satu: pengguna langsung tahu apa yang
 * harus dilakukan pertama — buat proyek, susun RAB, lihat rekap.
 *
 * - Muncul otomatis: menu dashboard + belum ada proyek + flag belum diset.
 * - "Buat Proyek Pertama" → menandai selesai + membuka modal buat proyek.
 * - "Nanti saja" → tutup kali ini saja (muncul lagi saat buka dashboard).
 * - "Jangan tampilkan lagi" → tutup permanen via localStorage.
 */
import { useCallback, useEffect, useState } from 'react';
import { FolderPlus, Calculator, FileBarChart, X } from 'lucide-react';

export const DASHBOARD_GUIDE_FLAG = 'ezrab_dashboard_guide_done_v1';
export const DASHBOARD_GUIDE_OPEN_EVENT = 'ezrab:open-dashboard-guide';

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(DASHBOARD_GUIDE_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeFlag(): void {
  try {
    window.localStorage.setItem(DASHBOARD_GUIDE_FLAG, '1');
  } catch {
    /* abaikan */
  }
}

export function shouldShowDashboardGuide(): boolean {
  return !readFlag();
}

export function markDashboardGuideDone(): void {
  writeFlag();
}

const STEPS = [
  {
    icon: <FolderPlus size={20} />,
    title: 'Buat proyek',
    desc: 'Beri nama proyek dan info dasar — cuma butuh beberapa detik.',
  },
  {
    icon: <Calculator size={20} />,
    title: 'Susun RAB',
    desc: 'Tambah item pekerjaan manual atau hitung volume otomatis.',
  },
  {
    icon: <FileBarChart size={20} />,
    title: 'Rekap otomatis',
    desc: 'Total anggaran terhitung sendiri, siap export ke Excel/PDF.',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onStartFirstProject: () => void;
}

export function DashboardGuideModal({ open, onClose, onStartFirstProject }: Props) {
  const handleStart = useCallback(() => {
    markDashboardGuideDone();
    onStartFirstProject();
  }, [onStartFirstProject]);

  const handleSkipOnce = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDontShowAgain = useCallback(() => {
    markDashboardGuideDone();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkipOnce();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleSkipOnce]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panduan langkah pertama"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9970,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          background: 'var(--ezrab-card-bg, #ffffff)',
          border: '1px solid var(--ezrab-card-border, #e5e7eb)',
          borderRadius: 'var(--ezrab-radius-xl, 28px)',
          boxShadow: 'var(--ezrab-shadow-lg)',
          padding: 28,
          fontFamily: 'var(--ezrab-font-sans)',
          position: 'relative',
        }}
      >
        <button
          onClick={handleSkipOnce}
          aria-label="Tutup"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 999,
            color: 'var(--ezrab-text-muted, #94a3b8)',
            cursor: 'pointer',
          }}
        >
          <X size={18} />
        </button>

        <h2
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: 'var(--ezrab-text, #111827)',
            margin: '0 0 6px',
          }}
        >
          Mulai langkah pertama Anda
        </h2>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            color: 'var(--ezrab-text-secondary, #64748b)',
            margin: '0 0 18px',
          }}
        >
          Tiga langkah cepat menuju RAB pertama Anda:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {STEPS.map((s, i) => (
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
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'var(--ezrab-blue-soft, #eff6ff)',
                  color: 'var(--ezrab-blue, #2563eb)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {s.icon}
                <span
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: 'var(--ezrab-blue, #2563eb)',
                    color: '#fff',
                    fontSize: 10.5,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {i + 1}
                </span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ezrab-text, #111827)', margin: '0 0 2px' }}>
                  {s.title}
                </p>
                <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ezrab-text-secondary, #64748b)', margin: 0 }}>
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleStart}
          className="ezrab-button-primary"
          style={{ width: '100%', height: 48, fontSize: 15, marginBottom: 10 }}
        >
          <FolderPlus size={17} /> Buat Proyek Pertama
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'center' }}>
          <button
            onClick={handleSkipOnce}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ezrab-text-secondary, #64748b)',
              cursor: 'pointer',
              padding: '8px 12px',
            }}
          >
            Nanti saja
          </button>
          <span style={{ color: 'var(--ezrab-border-light, #e2e8f0)' }}>|</span>
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
              padding: '8px 12px',
            }}
          >
            Jangan tampilkan lagi
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardGuideModal;

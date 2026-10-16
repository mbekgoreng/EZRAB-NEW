/**
 * Spotlight — guided tour overlay dengan highlight pada elemen target asli.
 *
 * - Target: CSS selector yang stabil (mis. `[data-tour="sidebar-rab"]`).
 * - Jika target tidak ditemukan / tersembunyi: langkah dilewati otomatis
 *   (tidak memblokir aplikasi, tidak crash).
 * - Tooltip diposisikan ulang saat scroll/resize.
 * - Aksesibilitas: fokus keyboard, Escape menutup, hormati prefers-reduced-motion.
 * - Semua listener dibersihkan saat unmount.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface SpotlightStep {
  /** CSS selector target yang stabil */
  target: string;
  title: string;
  body: string;
}

interface SpotlightProps {
  steps: SpotlightStep[];
  /** index awal (default 0) — diabaikan jika `index` terkontrol diisi */
  startAt?: number;
  /**
   * Jika diisi, index langkah dikontrol parent (controlled mode).
   * Parent wajib menangani `onRequestIndex` untuk Lanjut/Kembali.
   */
  index?: number;
  onDone: () => void;
  onSkip: () => void;
  /** dipanggil setiap kali langkah berubah */
  onStepChange?: (index: number) => void;
  /** diminta saat user klik Lanjut/Kembali dalam controlled mode */
  onRequestIndex?: (index: number) => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;

function getTargetRect(selector: string): Rect | null {
  try {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Tersembunyi atau berukuran nol → anggap tidak tersedia
    if (r.width === 0 && r.height === 0) return null;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function Spotlight({ steps, startAt = 0, index: controlledIndex, onDone, onSkip, onStepChange, onRequestIndex }: SpotlightProps) {
  const [internalIndex, setInternalIndex] = useState(startAt);
  const controlled = typeof controlledIndex === 'number';
  const index = controlled ? (controlledIndex as number) : internalIndex;
  const [rect, setRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(prefersReducedMotion());
  const isLast = index >= steps.length - 1;

  const step = steps[index];

  /** Minta pindah langkah: via parent dalam controlled mode, internal jika tidak. */
  const requestIndex = useCallback(
    (updater: (i: number) => number) => {
      if (controlled) {
        onRequestIndex?.(updater(index));
      } else {
        setInternalIndex(updater);
      }
    },
    [controlled, index, onRequestIndex]
  );

  // Cari target; jika tidak ada, lewati langkah ini
  const resolveTarget = useCallback(() => {
    if (!step) return;
    const r = getTargetRect(step.target);
    if (!r) {
      // Target hilang → lanjut ke langkah berikut, atau selesai jika terakhir
      if (index >= steps.length - 1) onDone();
      else requestIndex((i) => i + 1);
      return;
    }
    setRect(r);
  }, [step, index, steps.length, onDone, requestIndex]);

  useLayoutEffect(() => {
    resolveTarget();
  }, [resolveTarget]);

  // Posisikan ulang saat scroll / resize
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (step) {
          const r = getTargetRect(step.target);
          if (r) setRect(r);
          // jika target hilang saat tour berjalan, lewati
          else if (index < steps.length - 1) requestIndex((i) => i + 1);
          else onDone();
        }
      });
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(raf);
    };
  }, [step, index, steps.length, onDone, requestIndex]);

  // Posisikan tooltip di bawah/atas target, jaga dalam viewport
  useLayoutEffect(() => {
    if (!rect) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = Math.min(320, vw - 32);
    const th = tooltipRef.current?.offsetHeight ?? 180;
    let top = rect.top + rect.height + 12;
    if (top + th > vh - 16) top = Math.max(16, rect.top - th - 12);
    let left = Math.min(Math.max(16, rect.left), vw - tw - 16);
    setTooltipPos({ top, left });
  }, [rect, index]);

  // Fokus ke tooltip untuk aksesibilitas keyboard
  useEffect(() => {
    tooltipRef.current?.focus();
  }, [index, rect]);

  // Beri tahu parent saat langkah berubah
  useEffect(() => {
    onStepChange?.(index);
  }, [index, onStepChange]);

  // Escape menutup
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  const next = useCallback(() => {
    if (isLast) onDone();
    else requestIndex((i) => i + 1);
  }, [isLast, onDone, requestIndex]);

  const back = useCallback(() => requestIndex((i) => Math.max(0, i - 1)), [requestIndex]);

  if (!step) return null;

  const anim = reducedMotion.current ? 'none' : 'ezrab-spotlight-in 0.25s ease both';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Panduan langkah ${index + 1} dari ${steps.length}: ${step.title}`}
      style={{ position: 'fixed', inset: 0, zIndex: 9995, pointerEvents: 'auto' }}
    >
      {/* Overlay gelap dengan lubang highlight via box-shadow */}
      {rect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(11, 18, 32, 0.55)',
            border: '2px solid var(--ez-color-primary, #2563eb)',
            animation: anim,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Jika target tidak ada, overlay penuh tanpa highlight */}
      {!rect && (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(11, 18, 32, 0.55)' }} />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: 'min(320px, calc(100vw - 32px))',
          background: 'var(--ez-color-surface)',
          border: '1px solid var(--ez-color-border-line)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(2, 6, 23, 0.28)',
          padding: 18,
          animation: anim,
          outline: 'none',
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--ez-color-primary)', margin: '0 0 6px' }}>
          LANGKAH {index + 1} / {steps.length}
        </p>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ezrab-text, #111827)', margin: '0 0 6px' }}>
          {step.title}
        </h3>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ez-color-text-muted)', margin: '0 0 14px' }}>
          {step.body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            onClick={onSkip}
            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ez-color-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 4px' }}
          >
            Lewati
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {index > 0 && (
              <button
                onClick={back}
                className="ezrab-button-secondary"
                style={{ height: 36, padding: '0 14px', fontSize: 12.5 }}
              >
                Kembali
              </button>
            )}
            <button
              onClick={next}
              className="ezrab-button-primary"
              style={{ height: 36, padding: '0 16px', fontSize: 12.5 }}
            >
              {isLast ? 'Selesai' : 'Lanjut'}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes ezrab-spotlight-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

export default Spotlight;

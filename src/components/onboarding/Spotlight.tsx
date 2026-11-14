/**
 * Spotlight — guided tour overlay dengan highlight pada elemen target asli.
 *
 * - Target: CSS selector yang stabil (mis. `[data-tour="sidebar-rab"]`).
 * - Jika target tidak ditemukan / tersembunyi: langkah dilewati otomatis
 *   (tidak memblokir aplikasi, tidak crash). D-16 (Batch G2): lewati
 *   mengikuti ARAH navigasi — mundur dari langkah yang targetnya hilang
 *   kembali ke langkah sebelumnya, bukan meloncat maju. Bila langkah
 *   menyatakan `expandSubmenu`, submenu sidebar dibuka dulu (event
 *   ezrab:expand-sidebar-submenu) dan resolusi dicoba ulang setelah
 *   render — target di submenu tertutup tidak lagi dilewati diam-diam.
 * - Tooltip diposisikan ulang saat scroll/resize.
 * - Aksesibilitas: fokus keyboard, Escape menutup, hormati prefers-reduced-motion.
 * - Semua listener dibersihkan saat unmount.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { expandSidebarSubmenu, type SidebarSubmenuId } from './sidebarSubmenuEvents';

export interface SpotlightStep {
  /** CSS selector target yang stabil */
  target: string;
  title: string;
  body: string;
  /**
   * D-16 (Batch G2): submenu sidebar yang harus dibuka sebelum langkah
   * ini disorot (target di dalamnya tidak ada di DOM saat tertutup).
   */
  expandSubmenu?: SidebarSubmenuId;
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
  /**
   * D-86 (Batch G2): bila false, target yang hilang TIDAK memicu
   * auto-skip — tooltip fallback (tengah viewport, tanpa highlight)
   * yang tampil. Dipakai controlled mode saat parent sudah menunggu
   * target sendiri (waitForSelector) & menangani skip searah
   * navigasi (FeatureTutorialPlayer.goToStep); tanpa gate ini
   * Spotlight akan menimpa keputusan skip parent. Default true
   * (perilaku lama, dipakai DashboardTour uncontrolled).
   */
  autoSkipMissing?: boolean;
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

export function Spotlight({ steps, startAt = 0, index: controlledIndex, onDone, onSkip, onStepChange, onRequestIndex, autoSkipMissing = true }: SpotlightProps) {
  const { t } = useI18n();
  const [internalIndex, setInternalIndex] = useState(startAt);
  const controlled = typeof controlledIndex === 'number';
  const index = controlled ? (controlledIndex as number) : internalIndex;
  const [rect, setRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(prefersReducedMotion());
  const isLast = index >= steps.length - 1;

  const step = steps[index];

  // D-16 (Batch G2): arah navigasi terakhir — skip target hilang
  // mengikuti arah ini (mundur → langkah sebelumnya, bukan meloncat
  // maju). Diatur oleh next()/back(); default maju.
  const navDirectionRef = useRef<1 | -1>(1);
  // Timer retry setelah expand submenu + penanda percobaan per indeks
  // (satu kali expand per langkah — mencegah loop dispatch).
  const expandRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandTriedRef = useRef<{ index: number; submenu: SidebarSubmenuId } | null>(null);

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

  /**
   * D-16 (Batch G2): lewati langkah yang targetnya hilang, mengikuti
   * arah navigasi. Maju: ke langkah berikut (atau selesai bila
   * terakhir). Mundur: ke langkah sebelumnya; di langkah pertama tidak
   * ada yang bisa dimunduri — kartu fallback (overlay penuh tanpa
   * highlight) yang tampil, bukan lompatan maju.
   */
  const skipMissing = useCallback(() => {
    // D-86: controlled mode dengan parent yang menangani skip sendiri
    // (autoSkipMissing=false) — jangan menimpa keputusan parent;
    // tampilkan kartu fallback saja.
    if (!autoSkipMissing) {
      setRect(null);
      return;
    }
    const dir = navDirectionRef.current;
    if (dir < 0) {
      if (index > 0) requestIndex((i) => i - 1);
      else setRect(null);
    } else if (index >= steps.length - 1) {
      onDone();
    } else {
      requestIndex((i) => i + 1);
    }
  }, [index, steps.length, onDone, requestIndex, autoSkipMissing]);

  // Cari target; jika tidak ada, coba buka submenu dulu (bila langkah
  // menyatakannya), lalu lewati searah navigasi.
  const resolveTarget = useCallback(() => {
    if (!step) return;
    const r = getTargetRect(step.target);
    if (!r) {
      // Target di submenu tertutup: buka submenu, coba lagi setelah
      // React render ulang (±200 ms). Sekali per langkah.
      if (step.expandSubmenu) {
        const tried = expandTriedRef.current;
        if (!tried || tried.index !== index || tried.submenu !== step.expandSubmenu) {
          expandTriedRef.current = { index, submenu: step.expandSubmenu };
          expandSidebarSubmenu(step.expandSubmenu);
          if (expandRetryTimerRef.current) clearTimeout(expandRetryTimerRef.current);
          expandRetryTimerRef.current = setTimeout(() => {
            const retryRect = getTargetRect(step.target);
            if (retryRect) setRect(retryRect);
            else skipMissing();
          }, 200);
          return;
        }
      }
      skipMissing();
      return;
    }
    setRect(r);
  }, [step, index, skipMissing]);

  useLayoutEffect(() => {
    resolveTarget();
    return () => {
      if (expandRetryTimerRef.current) {
        clearTimeout(expandRetryTimerRef.current);
        expandRetryTimerRef.current = null;
      }
    };
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
          // jika target hilang saat tour berjalan, lewati searah navigasi
          else skipMissing();
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
  }, [step, skipMissing]);

  // Posisikan tooltip di bawah/atas target, jaga dalam viewport.
  // Tanpa target (kartu fallback): tengahkan di viewport — sebelumnya
  // tooltip jatuh di sudut kiri-atas (posisi awal 0,0).
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = Math.min(320, vw - 32);
    const th = tooltipRef.current?.offsetHeight ?? 180;
    if (!rect) {
      setTooltipPos({ top: Math.max(16, (vh - th) / 2), left: Math.max(16, (vw - tw) / 2) });
      return;
    }
    let top = rect.top + rect.height + 12;
    if (top + th > vh - 16) top = rect.top - th - 12;
    // Pengaman: tooltip tidak boleh keluar viewport atas/bawah
    // (mis. target sedang di luar area scroll) — selalu ada jalur UI.
    const maxTop = Math.max(16, vh - th - 16);
    top = Math.max(16, Math.min(top, maxTop));
    let left = Math.min(Math.max(16, rect.left), vw - tw - 16);
    left = Math.max(16, Math.min(left, Math.max(16, vw - tw - 16)));
    setTooltipPos({ top, left });
  }, [rect, index]);

  // Scroll target ke dalam viewport saat langkah berubah.
  // block:'nearest' = tidak menggeser berlebihan; hormati reduced-motion.
  useEffect(() => {
    if (!step) return;
    try {
      const el = document.querySelector(step.target) as HTMLElement | null;
      el?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: reducedMotion.current ? 'auto' : 'smooth',
      });
    } catch {
      /* abaikan */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Fokus ke tooltip untuk aksesibilitas keyboard.
  // preventScroll: cegah adu scroll dengan scrollIntoView di atas (bug 2026-10-16).
  useEffect(() => {
    try {
      tooltipRef.current?.focus({ preventScroll: true });
    } catch {
      tooltipRef.current?.focus();
    }
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
    navDirectionRef.current = 1;
    if (isLast) onDone();
    else requestIndex((i) => i + 1);
  }, [isLast, onDone, requestIndex]);

  const back = useCallback(() => {
    navDirectionRef.current = -1;
    requestIndex((i) => Math.max(0, i - 1));
  }, [requestIndex]);

  if (!step) return null;

  const anim = reducedMotion.current ? 'none' : 'ezrab-spotlight-in 0.25s ease both';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${t('tour.panduan')} ${index + 1}/${steps.length}: ${step.title}`}
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
          {t('tour.langkah')} {index + 1} / {steps.length}
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
            {t('common.lewati')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {index > 0 && (
              <button
                onClick={back}
                className="ezrab-button-secondary"
                style={{ height: 36, padding: '0 14px', fontSize: 12.5 }}
              >
                {t('common.kembali')}
              </button>
            )}
            <button
              onClick={next}
              className="ezrab-button-primary"
              style={{ height: 36, padding: '0 16px', fontSize: 12.5 }}
            >
              {isLast ? t('common.selesai') : t('common.lanjut')}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes ezrab-spotlight-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

export default Spotlight;

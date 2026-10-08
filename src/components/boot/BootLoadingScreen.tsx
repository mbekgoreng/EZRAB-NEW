/**
 * BootLoadingScreen
 *
 * Layar pembuka saat aplikasi pertama kali dibuka:
 * logo asli, maskot menyapa, dan indikator progres (bar + persen).
 *
 * Kontrol dari parent:
 *   <BootLoadingScreen ready={appSiap} onDone={() => setBooted(true)} />
 *
 * - Tampil minimal `minDurationMs` (default 1200ms) meski `ready` sudah true.
 * - Saat `ready` true dan durasi minimum terpenuhi, progres menyelesaikan ke
 *   100%, lalu layar memudar (fade-out) dan `onDone` dipanggil satu kali.
 */
import { useEffect, useRef, useState } from 'react';
import { GreetingMascot } from './GreetingMascot';

interface BootLoadingScreenProps {
  /** Sinyal dari parent bahwa aplikasi sudah siap (data awal, sesi, dll). */
  ready?: boolean;
  /** Durasi tampil minimum dalam ms. Default 1200. */
  minDurationMs?: number;
  /** Dipanggil satu kali setelah layar memudar. */
  onDone?: () => void;
}

const BOOT_STYLES = `
@keyframes ezrab-boot-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes ezrab-boot-bar-shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}
@keyframes ezrab-boot-fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.ezrab-boot-float { animation: ezrab-boot-float 3.2s ease-in-out infinite; }
.ezrab-boot-fade-up { animation: ezrab-boot-fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
.ezrab-boot-bar-fill {
  background: linear-gradient(90deg, var(--ezrab-blue, #2563eb), var(--ezrab-cyan, #0891b2));
  background-size: 200px 100%;
  animation: ezrab-boot-bar-shimmer 1.4s linear infinite;
  transition: width 0.18s ease-out;
}
`;

const STATUS_MESSAGES = [
  'Menyiapkan workspace…',
  'Memuat database AHSP 2026…',
  'Menyiapkan AI estimator…',
  'Hampir selesai…',
];

export function BootLoadingScreen({ ready = false, minDurationMs = 1200, onDone }: BootLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const startRef = useRef<number>(Date.now());
  const doneRef = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  // Putar pesan status selama memuat
  useEffect(() => {
    const id = window.setInterval(() => {
      setStatusIndex((i) => Math.min(i + 1, STATUS_MESSAGES.length - 1));
    }, Math.max(400, Math.floor(minDurationMs / STATUS_MESSAGES.length)));
    return () => window.clearInterval(id);
  }, [minDurationMs]);

  // Animasi progres: naik perlahan menuju 92% selagi belum siap,
  // langsung ke 100% begitu `ready` true dan durasi minimum tercapai.
  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress((prev) => {
        if (doneRef.current) return prev;
        if (readyRef.current && elapsed >= minDurationMs) return 100;
        const crawl = Math.min(92, (elapsed / minDurationMs) * 92);
        return Math.max(prev, Math.min(92, crawl));
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [minDurationMs]);

  // Fade-out + onDone sekali
  useEffect(() => {
    if (progress >= 100 && !doneRef.current) {
      doneRef.current = true;
      setFading(true);
      const id = window.setTimeout(() => {
        onDone?.();
      }, 420);
      return () => window.clearTimeout(id);
    }
  }, [progress, onDone]);

  const percent = Math.round(progress);

  return (
    <div
      role="status"
      aria-label="Memuat aplikasi EZRAB"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
        background: 'linear-gradient(180deg, var(--ezrab-bg, #ffffff) 0%, var(--ezrab-blue-soft, #eff6ff) 100%)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.42s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <style>{BOOT_STYLES}</style>

      {/* Logo asli */}
      <div className="ezrab-boot-fade-up" style={{ height: 56, display: 'flex', alignItems: 'center' }}>
        {logoFailed ? (
          <span
            style={{
              fontFamily: 'var(--ezrab-font-sans)',
              fontWeight: 800,
              fontSize: 32,
              letterSpacing: '-0.03em',
              color: 'var(--ezrab-blue, #2563eb)',
            }}
          >
            EZRAB
          </span>
        ) : (
          <img
            src="/images/ezrab-logo.png"
            alt="Logo EZRAB"
            height={56}
            onError={() => setLogoFailed(true)}
            style={{ height: 56, width: 'auto', objectFit: 'contain' }}
            draggable={false}
          />
        )}
      </div>

      {/* Maskot menyapa */}
      <div className="ezrab-boot-float" style={{ marginTop: 4 }}>
        <GreetingMascot size={128} />
      </div>

      <div className="ezrab-boot-fade-up" style={{ textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--ezrab-font-sans)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ezrab-text, #111827)',
            margin: '0 0 4px',
          }}
        >
          RAB &amp; Estimasi Konstruksi
        </p>
        <p
          style={{
            fontFamily: 'var(--ezrab-font-sans)',
            fontSize: 12,
            color: 'var(--ezrab-text-secondary, #64748b)',
            margin: 0,
            minHeight: 18,
          }}
          aria-live="polite"
        >
          {STATUS_MESSAGES[statusIndex]}
        </p>
      </div>

      {/* Indikator progres */}
      <div style={{ width: 'min(280px, 70vw)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: 8,
            borderRadius: 'var(--ezrab-radius-full, 9999px)',
            background: 'var(--ezrab-surface-subtle, #f1f5f9)',
            border: '1px solid var(--ezrab-border, #e5e7eb)',
            overflow: 'hidden',
          }}
        >
          <div className="ezrab-boot-bar-fill" style={{ height: '100%', width: `${percent}%`, borderRadius: 'inherit' }} />
        </div>
        <p
          style={{
            fontFamily: 'var(--ezrab-font-mono, monospace)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ezrab-blue, #2563eb)',
            textAlign: 'center',
            margin: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {percent}%
        </p>
      </div>
    </div>
  );
}

export default BootLoadingScreen;

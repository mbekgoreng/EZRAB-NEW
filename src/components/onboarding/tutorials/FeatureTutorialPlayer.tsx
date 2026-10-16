/**
 * FeatureTutorialPlayer — memutar tutorial fitur dari registry.
 *
 * - Dibuka via event `ezrab:open-tutorial` (detail: { tutorialId }).
 * - Desktop: Spotlight; Mobile (<768px): bottom sheet.
 * - Mendukung maju, mundur, lewati, tutup, selesai + indikator progres.
 * - LANGKAH LINTAS HALAMAN: jika langkah punya `route` yang berbeda dari
 *   halaman aktif, player otomatis navigasi ke route tersebut lalu menunggu
 *   target muncul — langkah tidak lagi dilewati diam-diam (bug 2026-10-16).
 * - TIDAK bertumpuk dengan welcome/dashboard tour (via tutorialCoordinator).
 * - Menutup (!= selesai): status tetap in-progress, bukan completed.
 * - TIDAK menjalankan operasi bisnis apa pun.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Spotlight } from '../Spotlight';
import { useToast } from '../Toast';
import {
  OPEN_TUTORIAL_EVENT,
  getTutorial,
  getTutorialProgress,
  setTutorialStatus,
  openSettingsTab,
  type FeatureTutorial,
} from './tutorialRegistry';
import { claimTutorialSlot, releaseTutorialSlot } from './tutorialCoordinator';
import { navigateTo } from '../../../routing/routes';

function isMobileViewport(): boolean {
  try {
    return window.innerWidth < 768;
  } catch {
    return false;
  }
}

/** Samakan pathname dengan route (toleran trailing slash & sub-route). */
function sameRoute(pathname: string, route: string): boolean {
  const norm = (p: string) => (p.replace(/\/+$/, '') || '/').toLowerCase();
  const a = norm(pathname);
  const b = norm(route);
  return a === b || a.startsWith(b + '/');
}

/**
 * Tunggu selector muncul di DOM (polling). Resolve `true` jika ketemu
 * sebelum timeout, `false` jika tidak.
 */
function waitForSelector(selector: string, timeoutMs = 4500): Promise<boolean> {
  return new Promise((resolve) => {
    if (!selector) {
      resolve(true);
      return;
    }
    try {
      if (document.querySelector(selector)) {
        resolve(true);
        return;
      }
    } catch {
      resolve(false);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      let found = false;
      try {
        found = !!document.querySelector(selector);
      } catch {
        /* abaikan */
      }
      if (found || Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(found);
      }
    }, 120);
  });
}

export function FeatureTutorialPlayer() {
  const { showToast } = useToast();
  const [tutorial, setTutorial] = useState<FeatureTutorial | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  /** true saat sedang navigasi ke route langkah (tampilkan veil). */
  const [navigating, setNavigating] = useState(false);

  const tutorialRef = useRef<FeatureTutorial | null>(null);
  /** token untuk membatalkan navigasi yang sudah basi (tutup/pindah langkah). */
  const navToken = useRef(0);
  const handleDoneRef = useRef<() => void>(() => {});

  const closePlayer = useCallback((markSkipped: boolean) => {
    const t = tutorialRef.current;
    if (t) {
      if (markSkipped) {
        const prev = getTutorialProgress(t.id);
        if (prev.status !== 'completed') setTutorialStatus(t.id, 'skipped');
      }
      // Tutup biasa: status tetap in-progress (tidak dihapus, tidak dianggap selesai)
    }
    navToken.current += 1; // batalkan navigasi yang tertunda
    releaseTutorialSlot('feature');
    tutorialRef.current = null;
    setNavigating(false);
    setTutorial(null);
    setStepIndex(0);
  }, []);

  const handleDone = useCallback(() => {
    const t = tutorialRef.current;
    if (t) setTutorialStatus(t.id, 'completed');
    navToken.current += 1;
    releaseTutorialSlot('feature');
    tutorialRef.current = null;
    setNavigating(false);
    setTutorial(null);
    setStepIndex(0);
    showToast('Tutorial selesai. Kamu bisa membukanya lagi kapan saja dari Pusat Bantuan.', 'success');
  }, [showToast]);

  useEffect(() => {
    handleDoneRef.current = handleDone;
  }, [handleDone]);

  const handleSkip = useCallback(() => closePlayer(true), [closePlayer]);
  const handleClose = useCallback(() => closePlayer(false), [closePlayer]);

  /**
   * Pindah ke langkah `rawIndex` — dengan navigasi otomatis jika langkah
   * menarget halaman lain. Menunggu target muncul sebelum menampilkan
   * langkah; jika target tak kunjung ada, lewati ke langkah berikut
   * (tidak macet, tidak menutup tutorial diam-diam).
   */
  const goToStep = useCallback((rawIndex: number) => {
    const token = ++navToken.current;

    const attempt = (startIndex: number) => {
      if (navToken.current !== token) return;
      const tut = tutorialRef.current;
      if (!tut) return;
      const total = tut.steps.length;
      let i = Math.max(0, Math.min(total - 1, startIndex));
      const step = tut.steps[i];
      if (!step) return;

      let pathname = '/';
      try {
        pathname = window.location.pathname || '/';
      } catch {
        /* abaikan */
      }
      const needNav = !!step.route && !sameRoute(pathname, step.route);

      const show = () => {
        if (navToken.current !== token) return;
        const sel = step.target ?? '[data-tour="dashboard"]';
        waitForSelector(sel, 4500).then((found) => {
          if (navToken.current !== token) return;
          if (found) {
            setNavigating(false);
            setStepIndex(i);
            return;
          }
          // Target tetap tidak ada setelah navigasi → lewati langkah ini.
          if (i >= tut.steps.length - 1) {
            handleDoneRef.current();
          } else {
            attempt(i + 1);
          }
        });
      };

      if (needNav) {
        setNavigating(true);
        navigateTo(step.route as string);
        if (step.settingsTab) {
          window.setTimeout(() => {
            if (navToken.current === token) openSettingsTab(step.settingsTab as string);
          }, 180);
        }
        show();
      } else {
        setNavigating(false);
        show();
      }
    };

    attempt(rawIndex);
  }, []);

  // Dengarkan event buka tutorial
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tutorialId?: string } | undefined;
      const id = detail?.tutorialId;
      if (!id) return;
      const t = getTutorial(id);
      if (!t) return;

      // Anti-tumpuk: hanya satu tutorial aktif
      if (!claimTutorialSlot('feature')) {
        showToast('Selesaikan atau tutup tutorial yang sedang berjalan terlebih dahulu.', 'warning');
        return;
      }

      // Tandai in-progress (bukan completed)
      const prev = getTutorialProgress(id);
      if (prev.status !== 'completed') {
        setTutorialStatus(id, 'in-progress');
      }
      tutorialRef.current = t;
      setTutorial(t);
      setStepIndex(0);
      setIsMobile(isMobileViewport());
      // Langkah 0 bisa saja butuh navigasi (mis. dibuka dari halaman lain)
      goToStep(0);
    };
    window.addEventListener(OPEN_TUTORIAL_EVENT, handler);
    return () => window.removeEventListener(OPEN_TUTORIAL_EVENT, handler);
  }, [showToast, goToStep]);

  // Escape untuk tutup
  useEffect(() => {
    if (!tutorial) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tutorial, handleClose]);

  if (!tutorial) return null;

  const totalSteps = tutorial.steps.length;
  const current = tutorial.steps[Math.min(stepIndex, totalSteps - 1)];

  const veil = navigating ? (
    <div
      role="status"
      aria-label="Menyiapkan langkah tutorial"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9994,
        background: 'rgba(11, 18, 32, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--ez-color-surface)',
          border: '1px solid var(--ez-color-border-line)',
          borderRadius: 16,
          padding: '18px 26px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 16px 48px rgba(2, 6, 23, 0.3)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--ezrab-text, #111827)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: '3px solid var(--ez-color-border-line)',
            borderTopColor: 'var(--ez-color-primary)',
            animation: 'ezrab-tutorial-spin 0.8s linear infinite',
          }}
        />
        Menyiapkan langkah…
      </div>
      <style>{`@keyframes ezrab-tutorial-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ) : null;

  // --- Mobile: bottom sheet ---
  if (isMobile) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tutorial.title}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9500,
          background: 'rgba(2, 6, 23, 0.45)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
        onClick={handleClose}
      >
        {veil}
        {!navigating && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxHeight: '72vh',
            overflowY: 'auto',
            background: 'var(--ez-color-surface)',
            borderRadius: '20px 20px 0 0',
            padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 32px rgba(2, 6, 23, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--ez-color-primary)',
                background: 'var(--ez-hue-blue-bg)',
                padding: '4px 10px',
                borderRadius: 9999,
              }}
            >
              Tutorial · {stepIndex + 1}/{totalSteps}
            </span>
            <button
              onClick={handleClose}
              aria-label="Tutup tutorial"
              style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ez-color-text-muted)' }}
            >
              ✕
            </button>
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: 'var(--ezrab-text, #111827)' }}>
            {tutorial.title}
          </h3>
          <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: 'var(--ez-color-primary)' }}>
            {current.title}
          </h4>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ez-color-text-body)', margin: '0 0 16px' }}>
            {current.body}
          </p>
          {/* Progress */}
          <div style={{ height: 4, background: 'var(--ez-color-surface-tertiary)', borderRadius: 9999, marginBottom: 16 }}>
            <div
              style={{
                height: '100%',
                width: `${((stepIndex + 1) / totalSteps) * 100}%`,
                background: 'var(--ez-color-primary)',
                borderRadius: 9999,
                transition: 'width 0.25s ease',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => goToStep(stepIndex - 1)}
              disabled={stepIndex === 0}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                border: '1px solid var(--ez-color-border-line)',
                background: 'var(--ez-color-surface)',
                fontSize: 14,
                fontWeight: 600,
                cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
                opacity: stepIndex === 0 ? 0.5 : 1,
              }}
            >
              Kembali
            </button>
            {stepIndex < totalSteps - 1 ? (
              <button
                onClick={() => goToStep(stepIndex + 1)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--ez-color-primary)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Lanjut
              </button>
            ) : (
              <button
                onClick={handleDone}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--ez-color-success, #16a34a)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Selesai
              </button>
            )}
          </div>
          <button
            onClick={handleSkip}
            style={{
              width: '100%',
              marginTop: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--ez-color-text-muted)',
              fontSize: 13,
              cursor: 'pointer',
              padding: 8,
            }}
          >
            Lewati tutorial
          </button>
        </div>
        )}
      </div>
    );
  }

  // --- Desktop: Spotlight (controlled index; navigasi ditangani goToStep) ---
  // Langkah tanpa target spesifik fallback ke area dashboard utama.
  const spotlightSteps = tutorial.steps.map((s) => ({
    target: s.target ?? '[data-tour="dashboard"]',
    title: s.title,
    body: s.body,
  }));
  return (
    <div>
      {veil}
      {!navigating && (
        <Spotlight
          steps={spotlightSteps}
          index={stepIndex}
          onRequestIndex={goToStep}
          onDone={handleDone}
          onSkip={handleSkip}
          onStepChange={setStepIndex}
        />
      )}
      {/* Header tutorial mengambang: judul + progres + tutup */}
      <div
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9996,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--ez-color-surface)',
          border: '1px solid var(--ez-color-border-line)',
          borderRadius: 9999,
          padding: '8px 8px 8px 16px',
          boxShadow: '0 8px 24px rgba(2, 6, 23, 0.16)',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ezrab-text, #111827)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tutorial.title}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', whiteSpace: 'nowrap' }}>
          {stepIndex + 1}/{totalSteps}
        </span>
        <div style={{ width: 80, height: 4, background: 'var(--ez-color-surface-tertiary)', borderRadius: 9999 }}>
          <div
            style={{
              height: '100%',
              width: `${((stepIndex + 1) / totalSteps) * 100}%`,
              background: 'var(--ez-color-primary)',
              borderRadius: 9999,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
        <button
          onClick={handleClose}
          aria-label="Tutup tutorial"
          style={{
            width: 28,
            height: 28,
            borderRadius: 9999,
            border: 'none',
            background: 'var(--ez-color-surface-tertiary)',
            color: 'var(--ez-color-text-muted)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default FeatureTutorialPlayer;

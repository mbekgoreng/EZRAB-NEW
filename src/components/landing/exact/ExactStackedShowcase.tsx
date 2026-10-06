import React, { useState, useEffect, useRef } from 'react';
import { ExactVolumeCalculator } from './ExactVolumeCalculator';
import { ExactRabWorkspace } from './ExactRabWorkspace';
import { ExactAhsp } from './ExactAhsp';
import { ExactConnectedData } from './ExactConnectedData';
import { ExactProjectManagement } from './ExactProjectManagement';
import { ExactReportsExport } from './ExactReportsExport';

interface ExactStackedShowcaseProps {
  onOpenWorkspace?: () => void;
}

interface CardStyle {
  transform: string;
  opacity: number;
  filter: string;
  zIndex: number;
  boxShadow: string;
  borderColor: string;
  pointerEvents: 'auto' | 'none';
  visibility: 'visible' | 'hidden';
}

const TOTAL_PAGES = 6;

// Reference scales and peeks requested:
// pos 0: 1.00, pos 1: 0.97, pos 2: 0.94, pos 3: 0.91, pos 4: 0.89, pos 5: 0.87
const BASE_SCALES = [1.00, 0.97, 0.94, 0.91, 0.89, 0.87];
const BASE_PEEKS = [0, 8, 16, 24, 30, 36]; // in px (ultra-compact stacked peeks)
const BASE_OPACITIES = [1.00, 0.95, 0.88, 0.80, 0.70, 0.60];
const BASE_BLURS = [0, 1.5, 2.5, 3.2, 4.0, 4.5];

function computeCardStyle(index: number, v: number): CardStyle {
  const diff = v - index; // v in [0, 5]

  // 1. Exiting card (user scrolled past this page: diff > 0)
  if (diff > 0) {
    const t = Math.min(1.2, diff);
    // Smooth cubic ease out
    const ease = t < 1 ? 1 - Math.pow(1 - t, 2.4) : 1 + (t - 1) * 0.5;
    const translateY = -ease * 115; // in vh
    const scale = 1.00 - ease * 0.04; // 1.00 -> 0.96
    const opacity = Math.max(0, 1.00 - ease * 0.12);
    const isHidden = diff >= 1.0;

    return {
      transform: `translate3d(0, ${translateY}vh, 0) scale(${scale})`,
      opacity: isHidden ? 0 : opacity,
      filter: 'none',
      zIndex: 25 - index, // maintains top layer as it slides up off the deck
      boxShadow: '0 30px 70px -15px rgba(15, 23, 42, 0.14)',
      borderColor: 'rgba(226, 232, 240, 0.8)',
      pointerEvents: 'none',
      visibility: isHidden ? 'hidden' : 'visible',
    };
  }

  // 2. Active card & upcoming stacked cards (diff <= 0, so d = -diff >= 0)
  const d = -diff; // d = 0 for active, d = 1 for next card, d = 2 for 2nd next, etc.

  const posFloor = Math.floor(d);
  const posCeil = Math.min(posFloor + 1, 5);
  const frac = d - posFloor;

  const s1 = BASE_SCALES[Math.min(posFloor, 5)] || 0.87;
  const s2 = BASE_SCALES[posCeil] || 0.87;
  const scale = s1 + (s2 - s1) * frac;

  const y1 = BASE_PEEKS[Math.min(posFloor, 5)] ?? 36;
  const y2 = BASE_PEEKS[posCeil] ?? 36;
  const translateY = y1 + (y2 - y1) * frac;

  const o1 = BASE_OPACITIES[Math.min(posFloor, 5)] || 0.6;
  const o2 = BASE_OPACITIES[posCeil] || 0.6;
  const opacity = o1 + (o2 - o1) * frac;

  // Ultra-subtle focus shift: strictly 0px when d <= 0.2, gently scaling to max 1.8px deeper in stack
  const blur = d <= 0.2 ? 0 : Math.min(1.8, (d - 0.2) * 1.5);

  const isActive = d < 0.25;

  return {
    transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
    opacity,
    filter: blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : 'none',
    zIndex: 10 - index,
    boxShadow: isActive
      ? '0 32px 85px -15px rgba(15, 23, 42, 0.18), 0 0 0 1.5px rgba(37, 99, 235, 0.16)'
      : '0 20px 45px -15px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(226, 232, 240, 0.7)',
    borderColor: isActive ? 'rgba(37, 99, 235, 0.25)' : 'rgba(226, 232, 240, 0.7)',
    pointerEvents: isActive ? 'auto' : 'none',
    visibility: 'visible',
  };
}

// Maps 0.00 -> 1.00 scroll progress into continuous virtual page 0.00 -> 5.00
// Each transition occupies 14% of the total scroll (within the requested 12-18% range),
// with comfortable hold/dwell time on each page so the content sits peacefully in view.
function progressToVirtualPage(p: number): number {
  const TRANS_DUR = 0.14; // 14%
  const STEP = 0.20;      // 14% transition + 6% hold
  const LEAD = 0.06;

  for (let k = 0; k < 5; k++) {
    const start = k * STEP + LEAD;
    const end = start + TRANS_DUR;

    if (p < start) {
      return k;
    }
    if (p <= end) {
      const u = (p - start) / TRANS_DUR;
      // cubic-bezier(0.22, 1, 0.36, 1) ease approximation
      const ease = 1 - Math.pow(1 - u, 2.5);
      return k + ease;
    }
  }

  return 5;
}

export const ExactStackedShowcase: React.FC<ExactStackedShowcaseProps> = ({ onOpenWorkspace }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const targetProgressRef = useRef<number>(0);
  const currentProgressRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const hasInitializedRef = useRef<boolean>(false);

  const [virtualPage, setVirtualPage] = useState<number>(0); // 0.00 to 5.00
  const [isInView, setIsInView] = useState<boolean>(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // IntersectionObserver to only animate when in view
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { rootMargin: '120px 0px 120px 0px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scroll listener that calculates normalized progress (0.00 to 1.00)
  useEffect(() => {
    if (prefersReducedMotion) return;

    const handleScroll = () => {
      const el = sectionRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const scrollDist = el.offsetHeight - window.innerHeight;
      if (scrollDist <= 0) return;

      const scrolled = -rect.top;
      const rawProgress = scrolled / scrollDist;
      const clamped = Math.max(0, Math.min(1, rawProgress));
      targetProgressRef.current = clamped;

      // On initial mount or jump before animation loop starts, sync immediately
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        currentProgressRef.current = clamped;
        setVirtualPage(progressToVirtualPage(clamped));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [prefersReducedMotion]);

  // Master RAF animation loop with smooth lerp physics
  useEffect(() => {
    if (!isInView || prefersReducedMotion) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const updateLoop = () => {
      const target = targetProgressRef.current;
      const current = currentProgressRef.current;

      const diff = target - current;
      // Adaptive lerp: smooth 0.16 for user scrolling, faster catchup (0.35) for large programmatic jumps
      const factor = Math.abs(diff) > 0.25 ? 0.35 : 0.16;
      let nextProgress = current + diff * factor;

      if (Math.abs(diff) < 0.0004) {
        nextProgress = target;
      }

      currentProgressRef.current = nextProgress;
      setVirtualPage(progressToVirtualPage(nextProgress));

      rafIdRef.current = requestAnimationFrame(updateLoop);
    };

    rafIdRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isInView, prefersReducedMotion]);

  // Interactive jump to card on dot click
  const handleDotClick = (idx: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const scrollDist = el.offsetHeight - window.innerHeight;
    if (scrollDist <= 0) return;

    // Target normalized progress for each page index
    const targetP = idx === 0 ? 0.02 : idx === 5 ? 0.99 : idx * 0.20 + 0.03;
    const targetScrollY = el.offsetTop + targetP * scrollDist;

    window.scrollTo({
      top: targetScrollY,
      behavior: 'smooth',
    });
  };

  // Pages definition wrapping all 6 existing feature sections
  const pages = [
    {
      id: 'page-volume',
      title: 'Hitung Volume',
      component: <ExactVolumeCalculator onOpenWorkspace={onOpenWorkspace} />,
    },
    {
      id: 'page-rab',
      title: 'RAB Spreadsheet',
      component: <ExactRabWorkspace onOpenWorkspace={onOpenWorkspace} />,
    },
    {
      id: 'page-ahsp',
      title: 'AHSP 2026',
      component: <ExactAhsp onOpenWorkspace={onOpenWorkspace} />,
    },
    {
      id: 'page-connected',
      title: 'Data Hub',
      component: <ExactConnectedData onOpenWorkspace={onOpenWorkspace} />,
    },
    {
      id: 'page-project',
      title: 'Project Management',
      component: <ExactProjectManagement onOpenWorkspace={onOpenWorkspace} />,
    },
    {
      id: 'page-reports',
      title: 'Report Center',
      component: <ExactReportsExport onOpenWorkspace={onOpenWorkspace} />,
    },
  ];

  return (
    <section
      ref={sectionRef}
      id="fitur-showcase"
      className="ez-stacked-showcase-section"
    >
      {/* 100vh Sticky Stage */}
      <div className="ez-stacked-sticky-viewport">
        {/* Subtle Architectural Ambient Background Layers */}
        <div className="ez-stacked-bg-grid" />
        <div className="ez-stacked-ambient-glow" />

        {/* Floating Stack Depth Indicator (Minimal, Elegant Spatial Cue) */}
        <div className="ez-stacked-nav-pills" role="navigation" aria-label="Feature navigation">
          {pages.map((p, idx) => {
            const isActive = Math.round(virtualPage) === idx;
            return (
              <button
                key={p.id}
                type="button"
                className={`ez-stacked-pill-dot ${isActive ? 'is-active' : ''}`}
                onClick={() => handleDotClick(idx)}
                aria-label={`Go to ${p.title}`}
                title={p.title}
              />
            );
          })}
        </div>

        {/* 3D Physical Cards Stack Container */}
        <div className="ez-stacked-stage-canvas">
          {pages.map((page, idx) => {
            const style = computeCardStyle(idx, virtualPage);

            return (
              <div
                key={page.id}
                className="ez-stacked-card-layer"
                style={{
                  transform: style.transform,
                  opacity: style.opacity,
                  filter: style.filter,
                  zIndex: style.zIndex,
                  pointerEvents: style.pointerEvents,
                  visibility: style.visibility,
                }}
              >
                <div
                  className="ez-stacked-card-frame"
                  style={{
                    boxShadow: style.boxShadow,
                    borderColor: style.borderColor,
                  }}
                >
                  {page.component}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ExactStackedShowcase;

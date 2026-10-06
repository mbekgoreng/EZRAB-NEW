import React, { useState, useEffect, useRef } from 'react';
import {
  FileCode2,
  Box,
  Ruler,
  Database,
  Calculator,
  ClipboardList,
  BarChart3,
  TrendingUp,
  FileCheck2,
  ArrowRight,
} from 'lucide-react';

interface WorkflowStep {
  id: string;
  num: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 'step-1', num: '01', label: 'Gambar Kerja', sublabel: 'CAD & PDF', icon: FileCode2 },
  { id: 'step-2', num: '02', label: 'Volume', sublabel: 'Ekstraksi Dimensi', icon: Box },
  { id: 'step-3', num: '03', label: 'QTO', sublabel: 'Kuantitas Material', icon: Ruler },
  { id: 'step-4', num: '04', label: 'AHSP', sublabel: 'Standar PUPR 2026', icon: Database },
  { id: 'step-5', num: '05', label: 'RAB', sublabel: 'Estimasi Biaya', icon: Calculator },
  { id: 'step-6', num: '06', label: 'BOQ', sublabel: 'Bill of Quantities', icon: ClipboardList },
  { id: 'step-7', num: '07', label: 'Rekapitulasi', sublabel: 'Ringkasan Proyek', icon: BarChart3 },
  { id: 'step-8', num: '08', label: 'Kurva S', sublabel: 'Jadwal & Progres', icon: TrendingUp },
  { id: 'step-9', num: '09', label: 'Laporan', sublabel: 'Ekspor Dokumen', icon: FileCheck2 },
];

export const ExactWorkflow: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);

  // Viewport Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Sequential Entrance Animation
  useEffect(() => {
    if (!isInView) return;

    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setRevealedCount(current);
      if (current >= WORKFLOW_STEPS.length) {
        clearInterval(interval);
      }
    }, 280);

    return () => clearInterval(interval);
  }, [isInView]);

  // Active Sequential Flow Particle Cycle (Runs continuously after all nodes are revealed)
  useEffect(() => {
    if (revealedCount < WORKFLOW_STEPS.length) return;

    const cycleInterval = setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev === null || prev >= WORKFLOW_STEPS.length - 1) {
          return 0;
        }
        return prev + 1;
      });
    }, 900);

    return () => clearInterval(cycleInterval);
  }, [revealedCount]);

  const topRowSteps = WORKFLOW_STEPS.slice(0, 5); // 01 Gambar Kerja -> 02 Volume -> 03 QTO -> 04 AHSP -> 05 RAB
  const bottomRowSteps = WORKFLOW_STEPS.slice(5).reverse(); // 06 BOQ (Right) -> 07 Rekap -> 08 Kurva S -> 09 Laporan (Left)

  return (
    <section ref={sectionRef} id="fitur" className="ez-wf-pipeline-section">
      {/* Subtle blueprint & architectural watermark backgrounds */}
      <div className="ez-wf-bg-blueprint" aria-hidden="true" />
      <div className="ez-wf-bg-wireframe" aria-hidden="true" />

      <div className="ez-wf-pipeline-container">
        {/* Left Column: Typography & Eyebrow */}
        <div className="ez-wf-pipeline-left">
          <div className="ez-wf-eyebrow">
            <span className="ez-wf-eyebrow-dash" />
            <span>SATU WORKFLOW</span>
          </div>

          <h2 className="ez-wf-heading">
            Dari Gambar Kerja<br />
            ke Laporan.
          </h2>

          <p className="ez-wf-body">
            Semua proses estimasi dan perhitungan proyek terhubung dalam satu alur kerja yang efisien.
          </p>

          <a href="#demo" className="ez-wf-cta-link">
            <span>Jelajahi Alur</span>
            <ArrowRight size={16} className="ez-wf-cta-arrow" />
          </a>
        </div>

        {/* Right Column: Serpentine Construction Data Pipeline */}
        <div className="ez-wf-pipeline-stage">
          {/* ================= DESKTOP / TABLET: 2-ROW SERPENTINE WORKFLOW ================= */}
          <div className="ez-wf-serpentine-grid">
            {/* SVG Connecting Path with Animated Sequential Particle */}
            <svg
              className="ez-wf-svg-track"
              viewBox="0 0 680 260"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <defs>
                <filter id="wfGlowParticle" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="wfTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#bfdbfe" />
                  <stop offset="50%" stopColor="#93c5fd" />
                  <stop offset="100%" stopColor="#bfdbfe" />
                </linearGradient>
              </defs>

              {/* Continuous Serpentine Path Track (#D7E5FF)
                  Node Centers:
                  Top Row: (60, 52), (196, 52), (332, 52), (468, 52), (604, 52)
                  Vertical Drop on Right: (604, 52) -> (604, 208)
                  Bottom Row: (604, 208) -> (468, 208) -> (332, 208) -> (196, 208)
              */}
              <path
                d="M 60 52 L 604 52 C 636 52 636 208 604 208 L 196 208"
                stroke="#D7E5FF"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ez-wf-track-base"
              />

              {/* Animated Flow Track with Active Pulse */}
              <path
                d="M 60 52 L 604 52 C 636 52 636 208 604 208 L 196 208"
                stroke="url(#wfTrackGrad)"
                strokeWidth="2.5"
                strokeDasharray="8 8"
                strokeLinecap="round"
                className="ez-wf-track-animated"
              />

              {/* Sequential Glowing Flow Particle */}
              {isInView && (
                <circle r="4.5" fill="#2563eb" filter="url(#wfGlowParticle)" className="ez-wf-glowing-particle">
                  <animateMotion
                    path="M 60 52 L 604 52 C 636 52 636 208 604 208 L 196 208"
                    dur="7.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </svg>

            {/* TOP ROW: 01 Gambar Kerja → 02 Volume → 03 QTO → 04 AHSP → 05 RAB */}
            <div className="ez-wf-row ez-wf-top-row">
              {topRowSteps.map((step, idx) => {
                const globalIndex = idx;
                const isRevealed = revealedCount > globalIndex;
                const isActive = activeStepIndex === globalIndex;
                const IconComponent = step.icon;

                return (
                  <div
                    key={step.id}
                    className={`ez-wf-node-card ${isRevealed ? 'is-revealed' : ''} ${
                      isActive ? 'is-active-flow' : ''
                    }`}
                    style={{ transitionDelay: `${idx * 40}ms` }}
                  >
                    <div className="ez-wf-node-header">
                      <span className="ez-wf-step-num">{step.num}</span>
                      <div className="ez-wf-icon-wrap">
                        <IconComponent size={24} className="ez-wf-icon" strokeWidth={2} />
                      </div>
                    </div>
                    <span className="ez-wf-node-title">{step.label}</span>
                    <span className="ez-wf-node-subtitle">{step.sublabel}</span>
                  </div>
                );
              })}
            </div>

            {/* VERTICAL CONNECTOR INDICATOR AT RIGHT TURN (05 RAB ↓ 06 BOQ) */}
            <div className="ez-wf-vertical-turn-indicator" aria-hidden="true">
              <span className="ez-wf-turn-dot" />
            </div>

            {/* BOTTOM ROW: 09 Laporan ← 08 Kurva S ← 07 Rekapitulasi ← 06 BOQ */}
            <div className="ez-wf-row ez-wf-bottom-row">
              {/* Spacer on leftmost spot for alignment with 5-item top row */}
              <div className="ez-wf-node-spacer" aria-hidden="true" />

              {bottomRowSteps.map((step, idx) => {
                // bottomRowSteps is [06 BOQ, 07 Rekap, 08 Kurva, 09 Laporan] reversed in DOM
                // Real step index is: 8 - idx (so 09 is idx 0, 08 is idx 1, 07 is idx 2, 06 is idx 3)
                const globalIndex = 5 + (3 - idx);
                const isRevealed = revealedCount > globalIndex;
                const isActive = activeStepIndex === globalIndex;
                const IconComponent = step.icon;

                return (
                  <div
                    key={step.id}
                    className={`ez-wf-node-card ${isRevealed ? 'is-revealed' : ''} ${
                      isActive ? 'is-active-flow' : ''
                    }`}
                    style={{ transitionDelay: `${(idx + 5) * 40}ms` }}
                  >
                    <div className="ez-wf-node-header">
                      <span className="ez-wf-step-num">{step.num}</span>
                      <div className="ez-wf-icon-wrap">
                        <IconComponent size={24} className="ez-wf-icon" strokeWidth={2} />
                      </div>
                    </div>
                    <span className="ez-wf-node-title">{step.label}</span>
                    <span className="ez-wf-node-subtitle">{step.sublabel}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ================= MOBILE: VERTICAL TIMELINE (1 ROW PER STEP) ================= */}
          <div className="ez-wf-mobile-timeline">
            <div className="ez-wf-mobile-vertical-line" />
            {WORKFLOW_STEPS.map((step, idx) => {
              const isRevealed = revealedCount > idx;
              const isActive = activeStepIndex === idx;
              const IconComponent = step.icon;

              return (
                <div
                  key={`mob-${step.id}`}
                  className={`ez-wf-mobile-node ${isRevealed ? 'is-revealed' : ''} ${
                    isActive ? 'is-active-flow' : ''
                  }`}
                >
                  <div className="ez-wf-mob-badge">
                    <IconComponent size={20} className="ez-wf-mob-icon" strokeWidth={2} />
                  </div>
                  <div className="ez-wf-mob-content">
                    <div className="ez-wf-mob-top">
                      <span className="ez-wf-mob-num">{step.num}</span>
                      <span className="ez-wf-mob-title">{step.label}</span>
                    </div>
                    <span className="ez-wf-mob-sub">{step.sublabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExactWorkflow;

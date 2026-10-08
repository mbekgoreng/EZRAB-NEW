import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  Database,
  Wrench,
  Users,
  Truck,
  Check,
  Layers,
  Sparkles,
  HardHat,
  Cpu,
  Activity
} from 'lucide-react';
import ahspCraneImg from '../../../assets/ahsp-crane-building.jpg';

interface ExactAhspProps {
  onOpenWorkspace?: () => void;
}

type AhspPhase = 'idle' | 'scan' | 'detect' | 'activate' | 'flow' | 'detail' | 'settled';

export const ExactAhsp: React.FC<ExactAhspProps> = ({ onOpenWorkspace }) => {
  const [phase, setPhase] = useState<AhspPhase>('scan');
  const [scanY, setScanY] = useState<number>(100);
  const [materialCount, setMaterialCount] = useState<number>(0);
  const [upahCount, setUpahCount] = useState<number>(0);
  const [alatCount, setAlatCount] = useState<number>(0);
  const [koefisien, setKoefisien] = useState<number>(1.0);
  const [hoveredComponent, setHoveredComponent] = useState<'material' | 'upah' | 'alat' | null>(null);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef<boolean>(true);

  // prefers-reduced-motion check
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // IntersectionObserver to sync visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisibleRef.current = entry.isIntersecting;
        });
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Handle immediate static display if reduced motion is preferred
  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase('settled');
      setMaterialCount(4821);
      setUpahCount(1205);
      setAlatCount(892);
      setKoefisien(1.125);
    }
  }, [prefersReducedMotion]);

  // Main 10–12s Animation Sequence
  useEffect(() => {
    if (prefersReducedMotion || isHovered || !isVisibleRef.current) return;

    let timer: ReturnType<typeof setTimeout>;

    if (phase === 'scan') {
      // Step 1: Scanning from bottom to top
      setScanY(100);
      const scanStartTime = Date.now();
      const scanDuration = 1800;

      const scanInterval = setInterval(() => {
        const elapsed = Date.now() - scanStartTime;
        const progress = Math.min(100, (elapsed / scanDuration) * 100);
        setScanY(100 - progress);

        if (progress >= 100) {
          clearInterval(scanInterval);
        }
      }, 30);

      timer = setTimeout(() => {
        clearInterval(scanInterval);
        setPhase('detect');
      }, 1900);
    } else if (phase === 'detect') {
      // Step 2: Work item detected
      timer = setTimeout(() => {
        setPhase('activate');
      }, 800);
    } else if (phase === 'activate') {
      // Step 3: AHSP Card activates & numbers count up
      const steps = 14;
      let step = 0;

      const countInterval = setInterval(() => {
        step++;
        const factor = step / steps;
        setMaterialCount(Math.round(4821 * factor));
        setUpahCount(Math.round(1205 * factor));
        setAlatCount(Math.round(892 * factor));

        if (step >= steps) {
          clearInterval(countInterval);
          setMaterialCount(4821);
          setUpahCount(1205);
          setAlatCount(892);
        }
      }, 40);

      timer = setTimeout(() => {
        clearInterval(countInterval);
        setPhase('flow');
      }, 1400);
    } else if (phase === 'flow') {
      // Step 4 & 5: Data flow to Material, Upah, Alat
      timer = setTimeout(() => {
        setPhase('detail');
      }, 1800);
    } else if (phase === 'detail') {
      // Step 6: Detail card appears & Koefisien counts: 1.000 -> 0.850 -> 1.125
      const koefStages = [1.0, 0.85, 1.125];
      let kIdx = 0;

      const koefInterval = setInterval(() => {
        kIdx++;
        if (kIdx < koefStages.length) {
          setKoefisien(koefStages[kIdx]);
        } else {
          clearInterval(koefInterval);
        }
      }, 250);

      timer = setTimeout(() => {
        clearInterval(koefInterval);
        setKoefisien(1.125);
        setPhase('settled');
      }, 1200);
    } else if (phase === 'settled') {
      // Step 7: Settle for 3.5s then smoothly restart cycle
      timer = setTimeout(() => {
        if (isVisibleRef.current && !isHovered) {
          setPhase('scan');
        }
      }, 3500);
    }

    return () => clearTimeout(timer);
  }, [phase, isHovered, prefersReducedMotion]);

  return (
    <section className="ez-ahsp-section" ref={sectionRef}>
      {/* Background Subtle Blueprint Grid & Soft Atmospheric Glow */}
      <div className="ez-ahsp-bg-grid" aria-hidden="true" />
      <div className="ez-ahsp-bg-glow" aria-hidden="true" />

      <div className="ez-ahsp-container">
        {/* Left Column: Copy & CTA */}
        <div className="ez-ahsp-left">
          <div className="ez-ahsp-eyebrow">
            <span className="ez-ahsp-eyebrow-pill">AHSP</span>
          </div>

          <h2 className="ez-ahsp-heading">
            Hubungkan pekerjaan
            <br />
            <span className="ez-ahsp-gradient-text">dengan AHSP 2026.</span>
          </h2>

          <p className="ez-ahsp-desc">
            Akses database AHSP lengkap dengan koefisien, material, upah, dan alat.
          </p>

          <div className="ez-ahsp-cta-group">
            <button
              onClick={onOpenWorkspace}
              className="ez-btn-primary-pill ez-ahsp-cta-btn"
              aria-label="Lihat AHSP"
            >
              <span>Lihat AHSP</span>
              <ArrowRight size={16} className="ez-ahsp-cta-arrow" />
            </button>
          </div>

          {/* Value Highlights / Badges */}
          <div className="ez-ahsp-features-row">
            <div className="ez-ahsp-feat-item">
              <div className="ez-ahsp-feat-dot" />
              <span>Standar Permen PUPR 2026</span>
            </div>
            <div className="ez-ahsp-feat-item">
              <div className="ez-ahsp-feat-dot" />
              <span>Analisa Koefisien Otomatis</span>
            </div>
            <div className="ez-ahsp-feat-item">
              <div className="ez-ahsp-feat-dot" />
              <span>Sinkronisasi Biaya Real-Time</span>
            </div>
          </div>
        </div>

        {/* Right Column: High-End Construction Visual + Live AHSP Database & Data Flow */}
        <div
          className={`ez-ahsp-visual-stage ${isHovered ? 'hovered' : ''}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            setIsHovered(false);
            setHoveredComponent(null);
          }}
        >
          {/* Base Construction Image with Crane & Structural Building */}
          <div className="ez-ahsp-viewport">
            <img
              src={ahspCraneImg}
              alt="AHSP 2026 Construction Building and Tower Crane"
              className="ez-ahsp-crane-img"
              loading="lazy"
              decoding="async"
            />

            {/* Subtle Blueprint Grid & CAD Layer */}
            <div className="ez-ahsp-blueprint-grid" />

            {/* Subtle Blueprint Annotations */}
            <div className="ez-ahsp-blueprint-notes" aria-hidden="true">
              <span className="ez-cad-tag tag-structure">STRUCTURE // LEVEL 04-07</span>
              <span className="ez-cad-tag tag-column">COLUMN 40/40</span>
              <span className="ez-cad-tag tag-slab">SLAB THICKNESS 150mm</span>
              <span className="ez-cad-tag tag-crane">TOWER CRANE // CAP 12T</span>
            </div>

            {/* Interactive SVG Connection & Data Flow Lines */}
            <svg className="ez-ahsp-svg-flow" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <filter id="ahspGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="0.8" floodColor="#38bdf8" floodOpacity="0.8" />
                </filter>
                <linearGradient id="laserGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
                  <stop offset="50%" stopColor="#2563eb" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Data Flow Connections (Step 4 & 5) */}
              {(phase === 'flow' || phase === 'detail' || phase === 'settled') && (
                <g className="ez-ahsp-flow-lines">
                  {/* Line to Material (Concrete Structure / Rebar) */}
                  <path
                    d="M 24 28 C 30 28, 32 46, 38 48"
                    className={`ez-flow-path path-material ${
                      hoveredComponent === 'material' ? 'highlight' : ''
                    }`}
                    filter="url(#ahspGlow)"
                  />
                  {/* Line to Upah (Workers Deck) */}
                  <path
                    d="M 24 32 C 32 32, 36 34, 43 34"
                    className={`ez-flow-path path-upah ${
                      hoveredComponent === 'upah' ? 'highlight' : ''
                    }`}
                    filter="url(#ahspGlow)"
                  />
                  {/* Line to Alat (Tower Crane) */}
                  <path
                    d="M 24 36 C 42 36, 52 28, 67 30"
                    className={`ez-flow-path path-alat ${
                      hoveredComponent === 'alat' ? 'highlight' : ''
                    }`}
                    filter="url(#ahspGlow)"
                  />

                  {/* Traveling Pulse Beads */}
                  <circle r="1" className="ez-flow-pulse-bead pulse-1">
                    <animateMotion
                      path="M 24 28 C 30 28, 32 46, 38 48"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle r="1" className="ez-flow-pulse-bead pulse-2">
                    <animateMotion
                      path="M 24 32 C 32 32, 36 34, 43 34"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle r="1" className="ez-flow-pulse-bead pulse-3">
                    <animateMotion
                      path="M 24 36 C 42 36, 52 28, 67 30"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              )}

              {/* Target Highlight Zones on the Model */}
              {/* Material Highlight Zone */}
              <ellipse
                cx="38"
                cy="48"
                rx="7"
                ry="4"
                className={`ez-target-highlight target-material ${
                  (phase === 'flow' || phase === 'detail' || hoveredComponent === 'material') ? 'active' : ''
                }`}
              />
              {/* Upah (Workers) Highlight Zone */}
              <ellipse
                cx="43"
                cy="34"
                rx="6"
                ry="3"
                className={`ez-target-highlight target-upah ${
                  (phase === 'flow' || phase === 'detail' || hoveredComponent === 'upah') ? 'active' : ''
                }`}
              />
              {/* Alat (Tower Crane) Highlight Zone */}
              <ellipse
                cx="67"
                cy="30"
                rx="8"
                ry="5"
                className={`ez-target-highlight target-alat ${
                  (phase === 'flow' || phase === 'detail' || hoveredComponent === 'alat') ? 'active' : ''
                }`}
              />
            </svg>

            {/* Bottom-to-Top Laser Scan Beam (Step 1) */}
            {phase === 'scan' && (
              <div className="ez-ahsp-laser-beam" style={{ top: `${scanY}%` }}>
                <div className="ez-ahsp-laser-glow" />
              </div>
            )}

            {/* Work Item Detected Pill (Step 2) */}
            {(phase === 'detect' || phase === 'flow' || phase === 'detail' || phase === 'settled') && (
              <div className="ez-ahsp-detected-pill">
                <span className="ez-detect-dot" />
                <span className="ez-detect-title">PEKERJAAN STRUKTUR</span>
                <span className="ez-detect-sub">AHSP 2026 // TERDETEKSI</span>
              </div>
            )}
          </div>

          {/* Floating AHSP Database Card (Top-Left, 8-12% more compact) */}
          <div className="ez-ahsp-metric-card">
            <div className="ez-ahsp-card-header">
              <div className="ez-ahsp-db-icon-box">
                <Database size={16} />
              </div>
              <div className="ez-ahsp-db-meta">
                <b className="ez-ahsp-db-name">AHSP 2026</b>
                <span className="ez-ahsp-db-status">
                  <span className={`ez-ahsp-status-dot ${phase !== 'idle' && phase !== 'scan' ? 'connected' : ''}`} />
                  {phase === 'scan' || phase === 'idle'
                    ? 'DATABASE AKTIF'
                    : 'DATABASE TERHUBUNG ✓'}
                </span>
              </div>
            </div>

            {/* Interactive Resource Rows */}
            <div className="ez-ahsp-rows-group">
              {/* Material Row */}
              <div
                className={`ez-ahsp-metric-row ${hoveredComponent === 'material' ? 'is-hovered' : ''}`}
                onMouseEnter={() => setHoveredComponent('material')}
                onMouseLeave={() => setHoveredComponent(null)}
                title="Komponen Material"
              >
                <span className="ez-metric-label">
                  <Wrench size={13} className="ez-row-icon icon-material" />
                  <span>Material</span>
                </span>
                <b className="ez-metric-val">
                  {(materialCount || 4821).toLocaleString('id-ID')} item
                </b>
              </div>

              {/* Upah Row */}
              <div
                className={`ez-ahsp-metric-row ${hoveredComponent === 'upah' ? 'is-hovered' : ''}`}
                onMouseEnter={() => setHoveredComponent('upah')}
                onMouseLeave={() => setHoveredComponent(null)}
                title="Komponen Upah"
              >
                <span className="ez-metric-label">
                  <Users size={13} className="ez-row-icon icon-upah" />
                  <span>Upah</span>
                </span>
                <b className="ez-metric-val">
                  {(upahCount || 1205).toLocaleString('id-ID')} item
                </b>
              </div>

              {/* Alat Row */}
              <div
                className={`ez-ahsp-metric-row ${hoveredComponent === 'alat' ? 'is-hovered' : ''}`}
                onMouseEnter={() => setHoveredComponent('alat')}
                onMouseLeave={() => setHoveredComponent(null)}
                title="Komponen Alat"
              >
                <span className="ez-metric-label">
                  <Truck size={13} className="ez-row-icon icon-alat" />
                  <span>Alat</span>
                </span>
                <b className="ez-metric-val">
                  {(alatCount || 892).toLocaleString('id-ID')} item
                </b>
              </div>
            </div>
          </div>

          {/* Tertiary Small Floating Detail Card (Bottom-Right, Appears at Step 6) */}
          {(phase === 'detail' || phase === 'settled') && (
            <div className="ez-ahsp-detail-card">
              <div className="ez-detail-header">
                <span className="ez-detail-eyebrow">KOMPONEN BIAYA</span>
                <span className="ez-detail-title">Pekerjaan Struktur</span>
              </div>

              <div className="ez-detail-list">
                <div className="ez-detail-item">
                  <span className="ez-detail-lbl">Material:</span>
                  <span className="ez-detail-val">Beton K-300</span>
                </div>
                <div className="ez-detail-item">
                  <span className="ez-detail-lbl">Upah:</span>
                  <span className="ez-detail-val">Pekerja + Tukang</span>
                </div>
                <div className="ez-detail-item">
                  <span className="ez-detail-lbl">Alat:</span>
                  <span className="ez-detail-val">Concrete Mixer</span>
                </div>
              </div>

              <div className="ez-detail-footer">
                <span className="ez-koef-lbl">Koefisien AHSP</span>
                <span className="ez-koef-val">
                  <b>{koefisien.toFixed(3)}</b>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

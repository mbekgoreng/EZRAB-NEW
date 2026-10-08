import React from 'react';
import {
  ArrowRight,
  Zap,
  Link2,
  ShieldCheck,
  Box,
  Ruler,
  Database,
  Table2,
  BarChart3,
  TrendingUp,
  FileCheck2,
  FileCode2,
  RefreshCw,
  Building2,
} from 'lucide-react';

interface ExactConnectedDataProps {
  onOpenWorkspace?: () => void;
}

export const ExactConnectedData: React.FC<ExactConnectedDataProps> = ({ onOpenWorkspace }) => {
  return (
    <section id="data-terhubung" className="ez-connected-section">
      {/* Background blueprint subtle watermark */}
      <div className="ez-connected-bg-grid" aria-hidden="true" />

      <div className="ez-connected-container">
        {/* Left Column: Typography, Actions, & Value Badges */}
        <div className="ez-connected-left">
          <div className="ez-connected-eyebrow">
            <span className="ez-eyebrow-line" />
            <span>SEMUA DATA TERHUBUNG</span>
          </div>

          <h2 className="ez-connected-title">
            Satu perubahan,<br />
            langsung<br />
            <span className="ez-title-highlight">terupdate.</span>
          </h2>

          <p className="ez-connected-desc">
            Setiap data saling terhubung dari QTO hingga laporan, untuk hasil yang lebih konsisten dan akurat.
          </p>

          <div className="ez-connected-cta-wrap">
            <button onClick={onOpenWorkspace} className="ez-btn-primary-pill ez-connected-btn">
              <span>Lihat Alur Lengkap</span>
              <ArrowRight size={17} />
            </button>
          </div>

          {/* 3 Sub-Features underneath matching uploaded reference */}
          <div className="ez-connected-features-row">
            <div className="ez-feat-pill">
              <Zap size={15} className="ez-feat-pill-icon text-blue-600" />
              <span>Lebih Efisien</span>
            </div>
            <div className="ez-feat-pill">
              <Link2 size={15} className="ez-feat-pill-icon text-blue-600" />
              <span>Terintegrasi</span>
            </div>
            <div className="ez-feat-pill">
              <ShieldCheck size={15} className="ez-feat-pill-icon text-blue-600" />
              <span>Mudah Digunakan</span>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Animated Radial Network Hub */}
        <div className="ez-radial-stage-wrapper">
          <div className="ez-radial-network-box">
            {/* 1. ANIMATED SVG CONCENTRIC RINGS & RADIAL CONNECTING LINES */}
            <svg
              className="ez-radial-svg-layer"
              viewBox="0 0 640 560"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="radialLineGrad" x1="320" y1="280" x2="640" y2="280" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.35" />
                </linearGradient>

                <radialGradient id="ringPulseGrad" cx="320" cy="280" r="240" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.12" />
                  <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>

                <filter id="glowDot" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Pulsing Ambient Background Halo */}
              <circle cx="320" cy="280" r="235" fill="url(#ringPulseGrad)" className="ez-svg-ambient-halo" />

              {/* Inner Concentric Circle (Animated Dashed Stroke) */}
              <circle
                cx="320"
                cy="280"
                r="135"
                stroke="#bfdbfe"
                strokeWidth="1.6"
                strokeDasharray="5 5"
                className="ez-svg-ring-inner"
              />

              {/* Outer Concentric Circle (Animated Dashed Stroke) */}
              <circle
                cx="320"
                cy="280"
                r="215"
                stroke="#dbeafe"
                strokeWidth="1.6"
                strokeDasharray="6 6"
                className="ez-svg-ring-outer"
              />

              {/* 8 Radial Dashed Connecting Lines (From Center 320,280 to each 8 Satellite positions) */}
              {/* 1. To Top Center (Volume: 320, 65) */}
              <line x1="320" y1="280" x2="320" y2="70" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 4" className="ez-radial-connector" />
              {/* 2. To Top Right (QTO: 472, 128) */}
              <line x1="320" y1="280" x2="472" y2="128" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 4" className="ez-radial-connector" />
              {/* 3. To Middle Right (AHSP: 535, 280) */}
              <line x1="320" y1="280" x2="535" y2="280" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 4" className="ez-radial-connector" />
              {/* 4. To Bottom Right (RAB: 472, 432) */}
              <line x1="320" y1="280" x2="472" y2="432" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 4" className="ez-radial-connector" />
              {/* 5. To Bottom Center (Rekapitulasi: 320, 490) */}
              <line x1="320" y1="280" x2="320" y2="490" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 4" className="ez-radial-connector" />
              {/* 6. To Bottom Left (Kurva S: 168, 432) */}
              <line x1="320" y1="280" x2="168" y2="432" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 4" className="ez-radial-connector" />
              {/* 7. To Middle Left (Laporan: 105, 280) */}
              <line x1="320" y1="280" x2="105" y2="280" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 4" className="ez-radial-connector" />
              {/* 8. To Top Left (Gambar Kerja: 168, 128) */}
              <line x1="320" y1="280" x2="168" y2="128" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 4" className="ez-radial-connector" />

              {/* Glowing Junction Dots on Inner Ring (r=135) */}
              <circle cx="320" cy="145" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" filter="url(#glowDot)" />
              <circle cx="415" cy="185" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" filter="url(#glowDot)" />
              <circle cx="455" cy="280" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" filter="url(#glowDot)" />
              <circle cx="415" cy="375" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" filter="url(#glowDot)" />
              <circle cx="320" cy="415" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" filter="url(#glowDot)" />
              <circle cx="225" cy="375" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" filter="url(#glowDot)" />
              <circle cx="185" cy="280" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" filter="url(#glowDot)" />
              <circle cx="225" cy="185" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" filter="url(#glowDot)" />

              {/* Glowing Junction Dots on Outer Ring (r=215) */}
              <circle cx="320" cy="65" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />
              <circle cx="472" cy="128" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />
              <circle cx="535" cy="280" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />
              <circle cx="472" cy="432" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />
              <circle cx="320" cy="495" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />
              <circle cx="168" cy="432" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />
              <circle cx="105" cy="280" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />
              <circle cx="168" cy="128" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.8" />

              {/* Orbiting Laser Particle on Inner Ring */}
              <g className="ez-svg-orbit-inner">
                <circle cx="320" cy="145" r="4" fill="#38bdf8" filter="url(#glowDot)" />
              </g>

              {/* Orbiting Laser Particle on Outer Ring */}
              <g className="ez-svg-orbit-outer">
                <circle cx="320" cy="65" r="4.5" fill="#2563eb" filter="url(#glowDot)" />
              </g>
            </svg>

            {/* 2. CENTRAL 3D GLOSSY EZRAB CORE BADGE */}
            <div className="ez-radial-center-3d">
              <div className="ez-core-bevel-sheen" />
              <img
                src="/images/ez-emblem.png"
                alt="EZ"
                className="ez-core-emblem-img"
                loading="lazy"
                decoding="async"
              />
              <span className="ez-core-logo-text">EZRAB</span>
              <div className="ez-core-pulse-ring" />
            </div>

            {/* 3. 8 SURROUNDING SATELLITE NODES (ENLARGED ICONS MATCHING UPLOADED REFERENCE) */}

            {/* Node 1: Top Center — Volume */}
            <div className="ez-radial-satellite-pill pos-top-center">
              <div className="ez-node-icon-box">
                <Box size={28} className="ez-node-icon text-blue-600" strokeWidth={2.2} />
              </div>
              <span className="ez-node-label">Volume</span>
            </div>

            {/* Node 2: Top Right — QTO */}
            <div className="ez-radial-satellite-pill pos-top-right">
              <div className="ez-node-icon-box">
                <Ruler size={26} className="ez-node-icon text-blue-600" strokeWidth={2.2} />
              </div>
              <span className="ez-node-label">QTO</span>
            </div>

            {/* Node 3: Middle Right — AHSP */}
            <div className="ez-radial-satellite-pill pos-mid-right">
              <div className="ez-node-icon-box">
                <Database size={26} className="ez-node-icon text-blue-600" strokeWidth={2.2} />
              </div>
              <span className="ez-node-label">AHSP</span>
            </div>

            {/* Node 4: Bottom Right — RAB */}
            <div className="ez-radial-satellite-pill pos-bottom-right">
              <div className="ez-node-icon-box">
                <Table2 size={26} className="ez-node-icon text-blue-600" strokeWidth={2.2} />
              </div>
              <span className="ez-node-label">RAB</span>
            </div>

            {/* Node 5: Bottom Center — Rekapitulasi */}
            <div className="ez-radial-satellite-pill pos-bottom-center">
              <div className="ez-node-icon-box">
                <BarChart3 size={26} className="ez-node-icon text-blue-600" strokeWidth={2.2} />
              </div>
              <span className="ez-node-label">Rekapitulasi</span>
            </div>

            {/* Node 6: Bottom Left — Kurva S */}
            <div className="ez-radial-satellite-pill pos-bottom-left">
              <div className="ez-node-icon-box">
                <TrendingUp size={26} className="ez-node-icon text-blue-600" strokeWidth={2.2} />
              </div>
              <span className="ez-node-label">Kurva S</span>
            </div>

            {/* Node 7: Middle Left — Laporan */}
            <div className="ez-radial-satellite-pill pos-mid-left">
              <div className="ez-node-icon-box">
                <FileCheck2 size={26} className="ez-node-icon text-blue-600" strokeWidth={2.2} />
              </div>
              <span className="ez-node-label">Laporan</span>
            </div>

            {/* Node 8: Top Left — Gambar Kerja */}
            <div className="ez-radial-satellite-pill pos-top-left">
              <div className="ez-node-icon-box">
                <FileCode2 size={26} className="ez-node-icon text-blue-600" strokeWidth={2.2} />
              </div>
              <span className="ez-node-label">Gambar Kerja</span>
            </div>
          </div>

          {/* 4. FLOATING PERSPECTIVE WIDGETS MATCHING UPLOADED REFERENCE */}

          {/* Top Right Floating Card: 3D Building Wireframe & Auto-Revision Tag */}
          <div className="ez-floating-preview-card top-right-card">
            <div className="ez-preview-tag-row">
              <span className="ez-revision-chip">
                <RefreshCw size={12} className="ez-spin-slow text-blue-600" />
                <span>Revisi otomatis di semua modul</span>
              </span>
            </div>
            <div className="ez-building-render-box">
              {/* Isometric 3D Building Structure Graphic */}
              <div className="ez-isometric-building-wireframe">
                <div className="ez-iso-cube top" />
                <div className="ez-iso-cube middle" />
                <div className="ez-iso-cube bottom" />
                <div className="ez-iso-scaffold-lines" />
              </div>
            </div>
          </div>

          {/* Bottom Right Floating Card: Progres Proyek Live Chart */}
          <div className="ez-floating-preview-card bottom-right-card">
            <div className="ez-chart-card-header">
              <span className="ez-chart-title">Progres Proyek</span>
              <span className="ez-chart-trend-badge">↗</span>
            </div>
            <div className="ez-chart-bars-wrap">
              <div className="ez-chart-bar" style={{ height: '35%' }} />
              <div className="ez-chart-bar" style={{ height: '52%' }} />
              <div className="ez-chart-bar" style={{ height: '44%' }} />
              <div className="ez-chart-bar" style={{ height: '68%' }} />
              <div className="ez-chart-bar" style={{ height: '82%' }} />
              <div className="ez-chart-bar" style={{ height: '96%' }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExactConnectedData;

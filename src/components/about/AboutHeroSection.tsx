import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowRight, Compass, Layers, CheckCircle2 } from 'lucide-react';

interface AboutHeroSectionProps {
  onScrollToWhy: () => void;
  onStartFree?: () => void;
}

export const AboutHeroSection: React.FC<AboutHeroSectionProps> = ({
  onScrollToWhy,
  onStartFree,
}) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  return (
    <section className="ez-about-hero-section" id="hero" onMouseMove={handleMouseMove}>
      {/* 1. Full-Bleed Panoramic Architectural Background from repository */}
      <div className="ez-about-hero-bg-layer">
        <img
          src="/images/about/about_hero_cityscape.webp"
          alt="Indonesian Contemporary Construction Infrastructure Visual"
          className="ez-about-hero-bg-img"
          style={{
            transform: `scale(1.04) translate(${mousePos.x * -12}px, ${mousePos.y * -8}px)`,
          }}
        />
        {/* Cinematic Gradient Scrim: Deep dark on left for text readability, clear on right for visual */}
        <div className="ez-about-hero-bg-overlay" />
        <div className="ez-about-hero-bg-bottom-fade" />
      </div>

      {/* 2. Technical CAD Coordinate Grid Overlay */}
      <svg
        className="ez-about-hero-cad-grid"
        viewBox="0 0 1440 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern id="aboutHeroCadPattern" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(0, 168, 255, 0.05)" strokeWidth="0.8" />
            <circle cx="64" cy="0" r="1.2" fill="rgba(0, 168, 255, 0.2)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#aboutHeroCadPattern)" />
        <line x1="80" y1="120" x2="1360" y2="120" stroke="rgba(0, 168, 255, 0.12)" strokeDasharray="6 8" strokeWidth="1" />
        <line x1="80" y1="800" x2="1360" y2="800" stroke="rgba(0, 168, 255, 0.12)" strokeDasharray="6 8" strokeWidth="1" />
        <line x1="240" y1="60" x2="240" y2="840" stroke="rgba(0, 168, 255, 0.08)" strokeDasharray="4 8" strokeWidth="1" />
      </svg>

      <div className="ez-about-hero-glow" />

      {/* 3. Hero Content Container */}
      <div className="ez-about-hero-container">
        {/* Left: Editorial Copy with Stagger Reveal */}
        <motion.div
          className="ez-about-hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="ez-about-hero-tag"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <Compass size={13} />
            <span>CONSTRUCTION ESTIMATION WORKSPACE</span>
          </motion.div>

          <motion.h1
            className="ez-about-hero-headline"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            MEMBANGUN CARA<br />
            <span className="highlight-blue">YANG LEBIH BAIK</span><br />
            UNTUK MENGHITUNG PROYEK.
          </motion.h1>

          <motion.p
            className="ez-about-hero-subhead"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            EZRAB menghubungkan gambar kerja, volume, QTO, AHSP, harga, RAB, BOQ, rekapitulasi, kurva S, hingga laporan proyek dalam satu ekosistem terpadu. Dari gambar kerja hingga keputusan penawaran.
          </motion.p>

          <motion.div
            className="ez-about-hero-cta-group"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.5 }}
          >
            <button
              onClick={onStartFree || onScrollToWhy}
              className="ez-about-hero-cta-primary"
              aria-label="Mulai Gratis"
            >
              <span>Mulai Gratis</span>
              <ArrowRight size={16} />
            </button>

            <button
              onClick={onScrollToWhy}
              className="ez-about-hero-cta-secondary"
              aria-label="Lihat Cara Kerja"
            >
              <span>Lihat Cara Kerja</span>
              <ArrowDown size={14} />
            </button>
          </motion.div>

          {/* Quick specs ribbon */}
          <motion.div
            className="ez-about-hero-stats-ribbon"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.65 }}
          >
            <div className="ez-about-hero-stat-item">
              <span className="ez-about-hero-stat-val">9 TAHAP</span>
              <span className="ez-about-hero-stat-label">Alur Terintegrasi</span>
            </div>
            <div className="ez-about-hero-stat-item">
              <span className="ez-about-hero-stat-val">100%</span>
              <span className="ez-about-hero-stat-label">Audit Formula Hidup</span>
            </div>
            <div className="ez-about-hero-stat-item">
              <span className="ez-about-hero-stat-val">PUPR</span>
              <span className="ez-about-hero-stat-label">Database AHSP Nasional</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Right: Architectural Telemetry Glass HUD over the Cityscape */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            transform: `perspective(1000px) rotateY(${mousePos.x * 3}deg) rotateX(${-mousePos.y * 3}deg)`,
            transition: 'transform 0.15s ease-out',
          }}
        >
          <div className="ez-about-hero-hud-card">
            <div className="ez-about-hud-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="#00A8FF" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.02em' }}>
                  BIM & QUANTITY TAKEOFF
                </span>
              </div>
              <div className="ez-about-hud-live-pill">
                <span className="ez-about-hud-live-dot" />
                <span>CONNECTED</span>
              </div>
            </div>

            <div className="ez-about-hud-metrics-list">
              <div className="ez-about-hud-metric-row">
                <span>Sektor Konstruksi</span>
                <span>CIPTA KARYA • BINA MARGA • SDA</span>
              </div>
              <div className="ez-about-hud-metric-row">
                <span>Model Presisi</span>
                <span>SCALE 1:100 COORDINATE BIM</span>
              </div>
              <div className="ez-about-hud-metric-row">
                <span>Sinkronisasi Volume</span>
                <span>REAL-TIME TAKE-OFF ENGINE</span>
              </div>
            </div>

            <div className="ez-about-hud-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={13} color="#00A8FF" />
                <span>Deterministic Calculation Guarantee</span>
              </div>
              <span>GRID B-4</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

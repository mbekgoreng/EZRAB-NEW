import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Play,
  Layers,
  Database,
  FileSpreadsheet,
  FolderKanban,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Zap,
  Check,
  Building2,
} from 'lucide-react';
import { ArchitecturalBackground } from '../architectural/ArchitecturalBackground';
import { ProductStage } from '../cinematic/ProductStage';

interface ExactHeroProps {
  onStartFree?: () => void;
  onOpenDemo?: () => void;
}

export const ExactHero: React.FC<ExactHeroProps> = ({ onStartFree, onOpenDemo }) => {
  const [cardsReady, setCardsReady] = useState<boolean>(false);
  // Active demo scene (Layer B) → drives the architectural background (Layer A)
  const [demoScene, setDemoScene] = useState<number>(0);

  // Stagger reveal of all 5 floating cards so all assets immediately render and stay visible
  useEffect(() => {
    const timer = setTimeout(() => {
      setCardsReady(true);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Cards are guaranteed to render and stay visible!
  const showCard1 = true;
  const showCard2 = cardsReady;
  const showCard4 = cardsReady;
  const showCard5 = cardsReady;

  return (
    <section id="beranda" className="ez-hero-exact">
      {/* Layer A — living architectural ambience (Three.js), reacts to the demo */}
      <ArchitecturalBackground mode={demoScene} />

      <div className="ez-hero-container">
        {/* Left Column: Copy & Actions */}
        <div className="ez-hero-left">
          <div className="ez-hero-tag-wrap">
            <span className="ez-hero-tag">
              <Sparkles size={14} className="ez-hero-tag-icon" />
              PLATFORM RAB & ESTIMASI KONSTRUKSI AI
            </span>
          </div>

          <h1 className="ez-hero-h1">
            Dari Gambar Kerja<br />
            Menjadi RAB.<br />
            <span className="ez-hero-h1-gradient">Lebih Cepat & Akurat.</span>
          </h1>

          <p className="ez-hero-desc">
            Hitung volume otomatis, susun analisa AHSP 2026, buat RAB, BOQ, hingga laporan proyek terintegrasi dalam satu workspace profesional.
          </p>

          <div className="ez-hero-actions">
            <button onClick={onStartFree} className="ez-btn-primary-pill">
              <span>Buat RAB Gratis</span>
              <ArrowRight size={17} />
            </button>

            <button onClick={onOpenDemo} className="ez-btn-outline-pill">
              <Play size={15} fill="currentColor" />
              <span>Lihat Cara Kerja</span>
            </button>
          </div>

          {/* 4 Bottom Features */}
          <div className="ez-hero-features-bar">
            <div className="ez-hero-feat-item">
              <div className="ez-hero-feat-icon">
                <Layers size={18} />
              </div>
              <div className="ez-hero-feat-text">
                <b>QTO Otomatis</b>
                <span>Hitung Cepat</span>
              </div>
            </div>

            <div className="ez-hero-feat-item">
              <div className="ez-hero-feat-icon">
                <Database size={18} />
              </div>
              <div className="ez-hero-feat-text">
                <b>AHSP 2026</b>
                <span>PUPR Terkini</span>
              </div>
            </div>

            <div className="ez-hero-feat-item">
              <div className="ez-hero-feat-icon">
                <FileSpreadsheet size={18} />
              </div>
              <div className="ez-hero-feat-text">
                <b>Export BOQ</b>
                <span>Excel & PDF</span>
              </div>
            </div>

            <div className="ez-hero-feat-item">
              <div className="ez-hero-feat-icon">
                <FolderKanban size={18} />
              </div>
              <div className="ez-hero-feat-text">
                <b>Manajemen</b>
                <span>Kurva S & Jadwal</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Video & Animated Floating Pop-up Cards */}
        <div className="ez-hero-visual-stage">
          <div className="ez-hero-visual-center">
            {/* Holographic Platform Glow & Scan */}
            <div className="ez-blueprint-scan-beam" />
            <div className="ez-platform-ground-glow" />

            {/* Demo animasi produk — miring perspektif seperti iPad Pro */}
            <div className="ez-feature-stage-wrapper">
              <ProductStage onSceneChange={setDemoScene} />
            </div>

            {/* Neon Connection Circuit Lines SVG Overlay */}
            <svg className="ez-neon-svg-overlay" viewBox="0 0 760 620" aria-hidden="true">
              <defs>
                <linearGradient id="neonGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
                  <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <path
                d="M 130 90 L 220 150 L 320 220"
                stroke="url(#neonGlowGrad)"
                strokeWidth="1.8"
                strokeDasharray="5 4"
                fill="none"
              />
              <path
                d="M 640 90 L 540 160 L 460 230"
                stroke="url(#neonGlowGrad)"
                strokeWidth="1.8"
                strokeDasharray="5 4"
                fill="none"
              />
              <path
                d="M 680 290 L 580 310 L 480 340"
                stroke="url(#neonGlowGrad)"
                strokeWidth="1.8"
                strokeDasharray="5 4"
                fill="none"
              />
              <path
                d="M 120 490 L 230 430 L 330 380"
                stroke="url(#neonGlowGrad)"
                strokeWidth="1.8"
                strokeDasharray="5 4"
                fill="none"
              />
              <path
                d="M 660 500 L 560 440 L 460 390"
                stroke="url(#neonGlowGrad)"
                strokeWidth="1.8"
                strokeDasharray="5 4"
                fill="none"
              />
            </svg>

            {/* =======================================================
                5 DYNAMIC ENLARGED POP-UP CARDS (Synchronized to Video)
                ======================================================= */}

            {/* Card 1: Proyek (Top Left) — sesuai scene demo "Proyek" */}
            <div
              className={`ez-popup-card ez-card-scene-proyek ${showCard1 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble blue">
                  <Building2 size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">PROYEK</span>
                  <span className="ez-card-chip-tag green">Aktif</span>
                </div>
              </div>

              <div className="ez-card-highlight-title">
                Rumah Tinggal Tipe 120
              </div>

              <div className="ez-card-meta-text">
                Bekasi, Jawa Barat
              </div>

              <div className="ez-card-footer-meta">
                <div className="ez-card-meta-stat">
                  <span className="ez-card-dot success" />
                  <span>Progres <b>34%</b></span>
                </div>
                <div className="ez-card-progress-track">
                  <div className="ez-card-progress-bar green" style={{ width: '34%' }} />
                </div>
              </div>
            </div>

            {/* Card 2: AI Estimate (Top Right) — sesuai scene demo "AI Estimate" */}
            <div
              className={`ez-popup-card ez-card-scene-estimate ${showCard2 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble cyan">
                  <Sparkles size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">AI ESTIMATE</span>
                  <span className="ez-card-chip-tag cyan">Selesai</span>
                </div>
              </div>

              <div className="ez-card-highlight-title">
                4 Item Tersusun
              </div>

              <div className="ez-card-mini-tags">
                <span className="ez-mini-badge">Galian</span>
                <span className="ez-mini-badge">Pondasi</span>
                <span className="ez-mini-badge">Sloof</span>
                <span className="ez-mini-badge">Besi</span>
              </div>

              <div className="ez-card-footer-meta">
                <span className="ez-card-sub-info">
                  <Zap size={13} className="text-amber-400" />
                  <span>Estimasi: <b>Rp 8.341.130</b></span>
                </span>
              </div>
            </div>

            {/* Card 4: QTO Volume (Bottom Left) — sesuai scene demo "QTO Volume" */}
            <div
              className={`ez-popup-card ez-card-scene-qto ${showCard4 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble amber">
                  <Layers size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">QTO VOLUME</span>
                  <span className="ez-card-chip-tag amber">15,00 m³</span>
                </div>
              </div>

              <div className="ez-card-highlight-title">
                Kalkulasi Otomatis
              </div>

              <div className="ez-card-meta-text">
                Galian tanah: 1,50 × 0,80 × 12,50
              </div>

              <div className="ez-card-progress-track">
                <div className="ez-card-progress-bar amber" style={{ width: '88%' }} />
              </div>
            </div>

            {/* Card 5: Kurva S (Bottom Right) — sesuai scene demo "Kurva S" */}
            <div
              className={`ez-popup-card ez-card-scene-kurva ${showCard5 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble purple">
                  <TrendingUp size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">KURVA S</span>
                  <span className="ez-card-chip-tag purple">68%</span>
                </div>
              </div>

              <div className="ez-card-highlight-title">
                Minggu 8 dari 12
              </div>

              <div className="ez-card-meta-text">
                Progres rencana vs realisasi
              </div>

              <div className="ez-card-footer-meta">
                <div className="ez-card-meta-stat">
                  <span className="ez-card-dot success" />
                  <span>Sesuai <b>jadwal</b></span>
                </div>
                <div className="ez-card-progress-track">
                  <div className="ez-card-progress-bar green" style={{ width: '68%' }} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

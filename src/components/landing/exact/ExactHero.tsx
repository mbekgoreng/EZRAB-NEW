import React, { useRef, useEffect, useState } from 'react';
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
  Cpu,
  Zap,
  Check,
  Building2,
} from 'lucide-react';
import buildingVideoWebm from '../../../assets/0908fg-transparent.webm';
import buildingVideoMp4 from '../../../assets/0908fg.mp4';
import buildingPoster from '../../../assets/0908fg-poster.jpg';
import { RibbonFieldBackground } from './RibbonFieldBackground';
import { ChromaKeyVideo } from '../../common/ChromaKeyVideo';

interface ExactHeroProps {
  onStartFree?: () => void;
  onOpenDemo?: () => void;
}

export const ExactHero: React.FC<ExactHeroProps> = ({ onStartFree, onOpenDemo }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoTime, setVideoTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [cardsReady, setCardsReady] = useState<boolean>(false);

  // Stagger reveal of all 5 floating cards so all assets immediately render and stay visible
  useEffect(() => {
    const timer = setTimeout(() => {
      setCardsReady(true);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Bulletproof video autoplay handling for modern browsers (Chrome/Edge/Safari/Firefox)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const playVideo = () => {
      video.defaultMuted = true;
      video.muted = true;
      const promise = video.play();
      if (promise !== undefined) {
        promise
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsPlaying(false);
            // Fallback: start video on first user interaction if autoplay was blocked by browser policy
            const onFirstGesture = () => {
              if (video.paused) {
                video.defaultMuted = true;
                video.muted = true;
                video.play().then(() => setIsPlaying(true)).catch(() => {});
              }
              window.removeEventListener('click', onFirstGesture);
              window.removeEventListener('touchstart', onFirstGesture);
              window.removeEventListener('scroll', onFirstGesture);
              window.removeEventListener('pointerdown', onFirstGesture);
            };
            window.addEventListener('click', onFirstGesture, { once: true });
            window.addEventListener('touchstart', onFirstGesture, { once: true });
            window.addEventListener('scroll', onFirstGesture, { once: true });
            window.addEventListener('pointerdown', onFirstGesture, { once: true });
          });
      }
    };

    playVideo();
    video.addEventListener('loadedmetadata', playVideo);
    video.addEventListener('canplay', playVideo);

    // Watchdog check: ensure video is running within first 2 seconds
    const watchdog = setInterval(() => {
      if (video.paused) {
        playVideo();
      }
    }, 800);

    const clearWatchdog = setTimeout(() => {
      clearInterval(watchdog);
    }, 4000);

    return () => {
      clearInterval(watchdog);
      clearTimeout(clearWatchdog);
      video.removeEventListener('loadedmetadata', playVideo);
      video.removeEventListener('canplay', playVideo);
    };
  }, []);

  const handleManualPlay = () => {
    if (videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setVideoTime(videoRef.current.currentTime);
    }
  };

  // All 5 cards are guaranteed to render and stay visible!
  const showCard1 = true;
  const showCard2 = cardsReady;
  const showCard3 = cardsReady;
  const showCard4 = cardsReady;
  const showCard5 = cardsReady;

  return (
    <section id="beranda" className="ez-hero-exact">
      {/* 1. WebGL Ribbon Field Background (Pure Blue Gradients + Deep Navy Base) */}
      <RibbonFieldBackground speed={1} pointerAmount={1} smoothing={0.035} />

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
              <span>Mulai Gratis</span>
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

            {/* Video Container positioned over the blueprint area (frameless) */}
            <div 
              className="ez-building-platform-wrapper"
              onClick={handleManualPlay}
              style={{ cursor: isPlaying ? 'default' : 'pointer' }}
              title={isPlaying ? 'Simulasi 3D Berjalan' : 'Klik untuk memutar video'}
            >
              <ChromaKeyVideo
                videoRef={(el) => {
                  videoRef.current = el;
                  if (el) {
                    el.defaultMuted = true;
                    el.muted = true;
                    el.playsInline = true;
                    el.setAttribute('playsinline', '');
                    el.setAttribute('webkit-playsinline', '');
                    el.play().then(() => setIsPlaying(true)).catch(() => {});
                  }
                }}
                src="/videos/0908fg.mp4"
                poster="/videos/0908fg-poster.jpg"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                threshold={0.065}
                smoothness={0.055}
                keyMode="black"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onCanPlay={(e) => {
                  const v = e.currentTarget;
                  v.defaultMuted = true;
                  v.muted = true;
                  v.play().then(() => setIsPlaying(true)).catch(() => {});
                }}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  v.defaultMuted = true;
                  v.muted = true;
                  v.play().then(() => setIsPlaying(true)).catch(() => {});
                }}
                onTimeUpdate={handleTimeUpdate}
                className="ez-hero-video-render"
              />

              {/* Status Indicator & Click-to-Play Overlay if Browser paused */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={handleManualPlay}
                  className="ez-hero-video-play-btn"
                  aria-label="Putar Video Simulasi 3D"
                >
                  <Play size={20} fill="#ffffff" />
                  <span>Putar Simulasi 3D</span>
                </button>
              )}
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

            {/* Card 1: Total Estimasi RAB (Top Left) */}
            <div
              className={`ez-popup-card ez-card-rab-total ${showCard1 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble green">
                  <TrendingUp size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">TOTAL ESTIMASI RAB</span>
                  <span className="ez-card-chip-tag green">AI Otomatis</span>
                </div>
              </div>

              <div className="ez-card-amount-display font-mono">
                Rp 1.485.250.000
              </div>

              <div className="ez-card-footer-meta">
                <div className="ez-card-meta-stat">
                  <span className="ez-card-dot success" />
                  <span>Akurasi 99.4% • <b>24 Item</b></span>
                </div>
                <div className="ez-card-progress-track">
                  <div className="ez-card-progress-bar green" style={{ width: '100%' }} />
                </div>
              </div>
            </div>

            {/* Card 2: Magic AI Detection (Top Right) */}
            <div
              className={`ez-popup-card ez-card-ai-detect ${showCard2 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble cyan">
                  <Sparkles size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">MAGIC AI ENGINE</span>
                  <span className="ez-card-chip-tag cyan">Terdeteksi</span>
                </div>
              </div>

              <div className="ez-card-highlight-title">
                24 Pekerjaan Terurai
              </div>

              <div className="ez-card-mini-tags">
                <span className="ez-mini-badge">Pondasi</span>
                <span className="ez-mini-badge">Kolom</span>
                <span className="ez-mini-badge">Balok</span>
                <span className="ez-mini-badge">Atap</span>
              </div>

              <div className="ez-card-footer-meta">
                <span className="ez-card-sub-info">
                  <Zap size={13} className="text-amber-400" />
                  <span>Waktu Analisis: <b>1.8 Detik</b></span>
                </span>
              </div>
            </div>

            {/* Card 3: AHSP PUPR 2026 Database (Middle Right) */}
            <div
              className={`ez-popup-card ez-card-ahsp-sync ${showCard3 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble blue">
                  <Database size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">DATABASE AHSP 2026</span>
                  <span className="ez-card-chip-tag blue">Permen PUPR</span>
                </div>
              </div>

              <div className="ez-card-sub-price font-mono">
                Rp 820.000 <small>/ m³</small>
              </div>

              <div className="ez-card-meta-text">
                Beton Bertulang K-300 SNI
              </div>

              <div className="ez-card-footer-meta">
                <span className="ez-card-status-pill blue">
                  <Check size={12} />
                  Harga Terupdate 2026
                </span>
              </div>
            </div>

            {/* Card 4: QTO & Volume Kalkulasi (Bottom Left) */}
            <div
              className={`ez-popup-card ez-card-qto-calc ${showCard4 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble amber">
                  <Layers size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">QTO & VOLUME</span>
                  <span className="ez-card-chip-tag amber">1.284 m³</span>
                </div>
              </div>

              <div className="ez-card-highlight-title">
                Kalkulasi Otomatis
              </div>

              <div className="ez-card-meta-text">
                Pondasi Strauss + Pile Cap Selesai
              </div>

              <div className="ez-card-progress-track">
                <div className="ez-card-progress-bar amber" style={{ width: '88%' }} />
              </div>
            </div>

            {/* Card 5: BOQ & Export Siap Tender (Bottom Right) */}
            <div
              className={`ez-popup-card ez-card-boq-export ${showCard5 ? 'is-visible' : ''}`}
            >
              <div className="ez-card-header-flex">
                <div className="ez-card-icon-bubble purple">
                  <FileSpreadsheet size={16} />
                </div>
                <div className="ez-card-header-text">
                  <span className="ez-card-cat-label">BOQ & LAPORAN</span>
                  <span className="ez-card-chip-tag purple">Siap Tender</span>
                </div>
              </div>

              <div className="ez-card-export-badges">
                <span className="ez-export-format-tag xlsx">.XLSX</span>
                <span className="ez-export-format-tag pdf">.PDF</span>
                <span className="ez-export-format-tag scurve">Kurva S</span>
              </div>

              <div className="ez-card-footer-meta">
                <span className="ez-card-sub-info">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span>1-Click Export Dokumen</span>
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

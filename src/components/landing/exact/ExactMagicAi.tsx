import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  ArrowRight,
  Volume2,
  VolumeX,
  FileCode2,
  Layers,
  Database,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Play,
  Pause,
} from 'lucide-react';

interface ExactMagicAiProps {
  onStart?: () => void;
}

// Ease functions for cinematic feel
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const ExactMagicAi: React.FC<ExactMagicAiProps> = ({ onStart }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const targetProgressRef = useRef<number>(0);
  const currentProgressRef = useRef<number>(0);

  // States
  const [isInView, setIsInView] = useState(false);
  const [progress, setProgress] = useState(0); // smoothed 0.00 -> 1.00
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoDuration, setVideoDuration] = useState(20);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // IntersectionObserver to observe section visibility & trigger autoplay
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { rootMargin: '100px 0px 100px 0px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Track whether scroll has initiated playback
  const hasTriggeredScrollPlay = useRef(false);

  // Guarantee muted & paused on initial load while showing intro headline
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = true;
    video.muted = isMuted;
    video.playsInline = true;
    // Keep paused initially so video only plays upon scrolling
    video.pause();
    setIsPlaying(false);
  }, [isMuted]);

  // Play video immediately and smoothly when user begins scrolling past the intro headline
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (progress > 0.02) {
      if (video.paused) {
        video.defaultMuted = true;
        video.muted = isMuted;
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      hasTriggeredScrollPlay.current = true;
    } else if (progress <= 0.01 && hasTriggeredScrollPlay.current) {
      // User scrolled all the way back to the top intro scene
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
      hasTriggeredScrollPlay.current = false;
    }
  }, [progress, isMuted]);

  // Video metadata loader
  const handleLoadedMetadata = () => {
    if (videoRef.current && videoRef.current.duration > 0) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  // Video time update tracker
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setVideoCurrentTime(videoRef.current.currentTime);
    }
  };

  // Sound toggle
  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    if (!nextMuted) {
      videoRef.current.volume = 0.75;
    }
    setIsMuted(nextMuted);
  };

  // Play / Pause toggle
  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Scroll listener that updates targetProgressRef
  useEffect(() => {
    if (prefersReducedMotion) return;

    const handleScroll = () => {
      const el = sectionRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const scrollDist = el.offsetHeight - window.innerHeight;
      if (scrollDist <= 0) return;

      // Calculate progress: 0 when top enters top of screen, 1 when bottom leaves bottom
      const scrolled = -rect.top;
      const rawProgress = scrolled / scrollDist;
      const clamped = Math.max(0, Math.min(1, rawProgress));
      targetProgressRef.current = clamped;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [prefersReducedMotion]);

  // Master RAF Animation Loop for smooth camera transforms & overlays
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

      // Smooth interpolation (lerp)
      const diff = target - current;
      const step = diff * 0.16;
      let nextProgress = current + step;

      if (Math.abs(diff) < 0.0004) {
        nextProgress = target;
      }

      currentProgressRef.current = nextProgress;
      setProgress(nextProgress);

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

  // Compute Auto-Scale curve
  // 0% -> 0.78, 10% -> 0.88, 25% -> 1.00, 50% -> 1.06, 68% -> 1.12, 82% -> 1.16, 90% -> 1.22, 97% -> 1.00
  const getProductScale = (p: number): number => {
    if (p <= 0.10) {
      const t = easeOutCubic(p / 0.10);
      return 0.78 + (0.88 - 0.78) * t;
    }
    if (p <= 0.25) {
      const t = easeInOutCubic((p - 0.10) / 0.15);
      return 0.88 + (1.00 - 0.88) * t;
    }
    if (p <= 0.50) {
      const t = (p - 0.25) / 0.25;
      return 1.00 + (1.06 - 1.00) * t;
    }
    if (p <= 0.68) {
      const t = (p - 0.50) / 0.18;
      return 1.06 + (1.12 - 1.06) * t;
    }
    if (p <= 0.82) {
      const t = (p - 0.68) / 0.14;
      return 1.12 + (1.16 - 1.12) * t;
    }
    if (p <= 0.90) {
      const t = easeInOutCubic((p - 0.82) / 0.08);
      return 1.16 + (1.22 - 1.16) * t;
    }
    if (p <= 0.97) {
      const t = easeInOutCubic((p - 0.90) / 0.07);
      return 1.22 - (1.22 - 1.00) * t;
    }
    return 1.00;
  };

  // Cover BG & Video Opacity when entering the final logo scene
  const coverBgOpacity = progress <= 0.82 ? 0 : Math.min(1, (progress - 0.82) / 0.08);
  const darkOverlay = progress > 0.82 ? Math.min(0.85, (progress - 0.82) / 0.12) : 0;

  // Video Opacity: always 1.0 (fully visible), fades out smoothly to 0 at 84% -> 90% as the dark navy cover takes over
  const videoOpacity =
    progress >= 0.84
      ? Math.max(0, 1 - (progress - 0.84) / 0.06)
      : 1;

  const productScale = getProductScale(progress);

  // Scene 01/02: Intro Text Opacity & Translation
  // 0.00 -> 0.08: 1.0, 0.08 -> 0.24: fades out with -30px translation
  const introOpacity = progress <= 0.08 ? 1 : Math.max(0, 1 - (progress - 0.08) / 0.16);
  const introTranslateY = progress <= 0.08 ? 0 : -35 * ((progress - 0.08) / 0.16);
  const showIntro = introOpacity > 0.02;

  // Temporary dark background at 85% opacity while intro headline is visible
  // Smoothly dissolves to 0 on scroll so video becomes fully visible & starts playing
  const introDarkOverlayOpacity = Math.max(0, Math.min(0.85, introOpacity * 0.85));

  // Scene 05: AI Processing HUD Chips (p = 0.32 to 0.68)
  const getChipOpacity = (start: number, peak: number, end: number) => {
    if (progress < start || progress > end) return 0;
    if (progress <= peak) return (progress - start) / (peak - start);
    return Math.max(0, 1 - (progress - peak) / (end - peak));
  };

  const chip1Opacity = getChipOpacity(0.30, 0.38, 0.48);
  const chip2Opacity = getChipOpacity(0.38, 0.46, 0.55);
  const chip3Opacity = getChipOpacity(0.46, 0.54, 0.63);
  const chip4Opacity = getChipOpacity(0.53, 0.61, 0.70);

  // Scene 06: Output Cards (p = 0.48 to 0.76)
  const outputCardOpacity = getChipOpacity(0.48, 0.58, 0.76);

  // Scene 07: Project Completion Metrics (p = 0.66 to 0.86)
  const metricsOpacity = getChipOpacity(0.66, 0.73, 0.84);
  // Interpolated counters
  const areaValue = Math.min(180, Math.round(Math.max(0, (progress - 0.67) / 0.06) * 180));
  const elemValue = Math.min(85, Math.round(Math.max(0, (progress - 0.69) / 0.06) * 85));
  const projectVal = Math.min(1.25, (Math.max(0, (progress - 0.71) / 0.06) * 1.25)).toFixed(2);

  // Scene 09 & 10: Final Logo Reveal & Signature (p = 0.85 to 1.00)
  const logoOpacity = progress <= 0.85 ? 0 : Math.min(1, (progress - 0.85) / 0.07);
  const logoScale = progress <= 0.85 ? 0.94 : 0.94 + 0.06 * Math.min(1, (progress - 0.85) / 0.07);

  // HUD footer fades out on final screen
  const hudFooterOpacity = progress <= 0.85 ? 1 : Math.max(0, 1 - (progress - 0.85) / 0.06);

  // Format time (mm:ss)
  const formatTime = (sec: number) => {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const remSec = s % 60;
    return `${m < 10 ? '0' : ''}${m}:${remSec < 10 ? '0' : ''}${remSec}`;
  };

  const videoPct = videoDuration > 0 ? (videoCurrentTime / videoDuration) * 100 : 0;

  return (
    <section ref={sectionRef} className="ez-magic-cinematic-section" id="magic-ai">
      <div className="ez-magic-sticky-viewport">
        {/* Deep Atmospheric Background Layers */}
        <div className="ez-magic-bg-gradient" />
        <div className="ez-magic-bg-grid" />
        <div
          className="ez-magic-ambient-glow"
          style={{
            transform: `translate(-50%, -50%) scale(${1 + progress * 0.35})`,
            opacity: 0.28 + progress * 0.2,
          }}
        />

        {/* Dynamic Dark Dimmer for Convergence & Logo Reveal */}
        <div
          className="ez-magic-dimmer-layer"
          style={{ opacity: darkOverlay, pointerEvents: 'none' }}
        />

        {/* STAGE CONTAINER */}
        <div className="ez-magic-stage">
          {/* ========================================================= */}
          {/* PRIMARY VIDEO VISUAL (FLAGSHIP 3D ASSET - CONTROLLED)       */}
          {/* ========================================================= */}
          <div
            className="ez-magic-video-frame"
            style={{
              transform: `scale(${productScale})`,
              opacity: videoOpacity,
            }}
          >
            {/* Glossy Bezel Highlight */}
            <div className="ez-magic-video-bezel-sheen" />

            <video
              ref={(el) => {
                videoRef.current = el;
                if (el) {
                  el.defaultMuted = true;
                  el.muted = isMuted;
                  el.playsInline = true;
                }
              }}
              src="/videos/ezrab-magic-ai.mp4"
              className="ez-magic-video-element"
              loop
              muted={isMuted}
              playsInline
              preload="auto"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              aria-label="EZRAB Magic AI Flagship Showcase"
            />

            {/* Dark 70% Overlay while intro headline is active, fading out on scroll */}
            <div
              className="ez-magic-video-dark-intro-bg"
              style={{
                opacity: introDarkOverlayOpacity,
                pointerEvents: 'none',
              }}
            />

            {/* Subtle Blue Inner Vignette */}
            <div className="ez-magic-video-inner-shadow" />
          </div>

          {/* ========================================================= */}
          {/* SCENE 01 & 02: FLOATING INTRO HEADLINE OVERLAY             */}
          {/* ========================================================= */}
          {showIntro && (
            <div
              className="ez-magic-intro-overlay"
              style={{
                opacity: introOpacity,
                transform: `translate(-50%, calc(-50% + ${introTranslateY}px))`,
                pointerEvents: introOpacity > 0.4 ? 'auto' : 'none',
              }}
            >
              <div className="ez-magic-eyebrow">
                <span className="ez-magic-eyebrow-glow" />
                <Sparkles size={14} className="ez-magic-eyebrow-icon" />
                <span>EZRAB MAGIC AI</span>
              </div>

              <h2 className="ez-magic-cinematic-headline">
                Kecerdasan di Balik Setiap<br />
                <span className="ez-text-gradient-cyan">Proyek Konstruksi.</span>
              </h2>

              <p className="ez-magic-cinematic-desc">
                AI cerdas yang membaca gambar kerja, mengidentifikasi komponen struktur,
                memetakan volume, hingga menyusun draft AHSP dan RAB secara otomatis.
              </p>

              <div className="ez-magic-intro-actions">
                <button
                  onClick={onStart}
                  className="ez-btn-primary-pill ez-magic-cta-btn"
                >
                  <span>Coba Magic AI</span>
                  <ArrowRight size={17} />
                </button>
                <span className="ez-magic-scroll-hint">
                  Scroll perlahan untuk menjelajahi timeline AI
                  <ChevronDown size={14} className="ez-bounce-slow" />
                </span>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCENE 05: SYNCHRONIZED AI PROCESSING HUD CHIPS             */}
          {/* ========================================================= */}
          {chip1Opacity > 0.02 && (
            <div
              className="ez-magic-hud-chip chip-pos-top-left"
              style={{
                opacity: chip1Opacity,
                transform: `translateY(${(1 - chip1Opacity) * 12}px) scale(${
                  0.94 + chip1Opacity * 0.06
                })`,
              }}
            >
              <div className="ez-hud-chip-dot blue" />
              <FileCode2 size={16} className="text-cyan-400" />
              <div className="ez-hud-chip-text">
                <span className="ez-hud-chip-title">Membaca Dokumen</span>
                <span className="ez-hud-chip-sub">DWG & Blueprint CAD Skala 1:100</span>
              </div>
            </div>
          )}

          {chip2Opacity > 0.02 && (
            <div
              className="ez-magic-hud-chip chip-pos-top-right"
              style={{
                opacity: chip2Opacity,
                transform: `translateY(${(1 - chip2Opacity) * -12}px) scale(${
                  0.94 + chip2Opacity * 0.06
                })`,
              }}
            >
              <div className="ez-hud-chip-dot cyan" />
              <Cpu size={16} className="text-blue-400" />
              <div className="ez-hud-chip-text">
                <span className="ez-hud-chip-title">Identifikasi Elemen</span>
                <span className="ez-hud-chip-sub">Kolom, Balok, Dinding & Plat Lantai</span>
              </div>
            </div>
          )}

          {chip3Opacity > 0.02 && (
            <div
              className="ez-magic-hud-chip chip-pos-bottom-left"
              style={{
                opacity: chip3Opacity,
                transform: `translateY(${(1 - chip3Opacity) * 12}px) scale(${
                  0.94 + chip3Opacity * 0.06
                })`,
              }}
            >
              <div className="ez-hud-chip-dot green" />
              <Layers size={16} className="text-emerald-400" />
              <div className="ez-hud-chip-text">
                <span className="ez-hud-chip-title">Kalkulasi Otomatis QTO</span>
                <span className="ez-hud-chip-sub">Ekstraksi Volume Material Presisi</span>
              </div>
            </div>
          )}

          {chip4Opacity > 0.02 && (
            <div
              className="ez-magic-hud-chip chip-pos-bottom-right"
              style={{
                opacity: chip4Opacity,
                transform: `translateY(${(1 - chip4Opacity) * -12}px) scale(${
                  0.94 + chip4Opacity * 0.06
                })`,
              }}
            >
              <div className="ez-hud-chip-dot amber" />
              <Database size={16} className="text-amber-400" />
              <div className="ez-hud-chip-text">
                <span className="ez-hud-chip-title">Menghubungkan AHSP 2026</span>
                <span className="ez-hud-chip-sub">Standardisasi Upah, Bahan & Alat</span>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCENE 06: CONNECTED OUTPUT BADGES OVERLAY                  */}
          {/* ========================================================= */}
          {outputCardOpacity > 0.02 && (
            <div
              className="ez-magic-output-float-card"
              style={{
                opacity: outputCardOpacity,
                transform: `scale(${0.95 + outputCardOpacity * 0.05})`,
              }}
            >
              <div className="ez-output-card-header">
                <span className="ez-output-badge-pulse" />
                <span className="ez-output-title">Output AI Terintegrasi</span>
              </div>
              <div className="ez-output-pills-row">
                <div className="ez-output-pill active">
                  <CheckCircle2 size={13} className="text-cyan-400" />
                  <span>QTO Terhitung</span>
                </div>
                <div className="ez-output-pill active">
                  <CheckCircle2 size={13} className="text-cyan-400" />
                  <span>AHSP Terhubung</span>
                </div>
                <div className="ez-output-pill active">
                  <CheckCircle2 size={13} className="text-cyan-400" />
                  <span>Draft RAB Siap</span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCENE 07: PROJECT COMPLETION METRICS                       */}
          {/* ========================================================= */}
          {metricsOpacity > 0.02 && (
            <div
              className="ez-magic-metrics-overlay"
              style={{
                opacity: metricsOpacity,
                transform: `translate(-50%, ${(1 - metricsOpacity) * 16}px)`,
              }}
            >
              <div className="ez-magic-metrics-badge">
                <Sparkles size={13} />
                <span>PROJECT INTELLIGENCE READY</span>
              </div>

              <div className="ez-magic-metrics-grid">
                <div className="ez-magic-metric-item">
                  <div className="ez-metric-num">{areaValue} m²</div>
                  <div className="ez-metric-lbl">Project Area</div>
                </div>
                <div className="ez-magic-metric-sep" />
                <div className="ez-magic-metric-item">
                  <div className="ez-metric-num">{elemValue}</div>
                  <div className="ez-metric-lbl">Structural Elements</div>
                </div>
                <div className="ez-magic-metric-sep" />
                <div className="ez-magic-metric-item">
                  <div className="ez-metric-num">Rp {projectVal}B</div>
                  <div className="ez-metric-lbl">Project Value</div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCENE 09 & 10: FLAGSHIP BRAND REVEAL EXPERIENCE           */}
          {/* ========================================================= */}
          {coverBgOpacity > 0.01 && (
            <div
              className="ez-flagship-universe"
              style={{
                opacity: coverBgOpacity,
                pointerEvents: coverBgOpacity > 0.5 ? 'auto' : 'none',
              }}
            >
              {/* Deep Engineering Blueprint Grid & Radial Ambient Bloom */}
              <div className="ez-flagship-cad-grid" />
              <div className="ez-flagship-radial-lighting" />

              {/* Technical Telemetry & HUD Coordinates */}
              <div className="ez-flagship-hud-coordinates hud-top-left">
                <div className="ez-hud-crosshair" />
                <div className="ez-hud-text-col">
                  <span className="ez-hud-tag">MODEL: BIM / CAD 3D</span>
                  <span className="ez-hud-subtag">LAT: 06°12′S • LNG: 106°49′E</span>
                </div>
              </div>

              <div className="ez-flagship-hud-coordinates hud-top-right">
                <div className="ez-hud-crosshair" />
                <div className="ez-hud-text-col">
                  <span className="ez-hud-tag">AI CORE: QUANTUM-NEURAL V4</span>
                  <span className="ez-hud-subtag">STATUS: SYNCHRONIZED & ARMED</span>
                </div>
              </div>

              <div className="ez-flagship-hud-coordinates hud-bottom-left">
                <div className="ez-hud-crosshair" />
                <div className="ez-hud-text-col">
                  <span className="ez-hud-tag">AHSP 2026: INTEGRATED</span>
                  <span className="ez-hud-subtag">TOLERANCE: &lt; 0.01% ERROR</span>
                </div>
              </div>

              <div className="ez-flagship-hud-coordinates hud-bottom-right">
                <div className="ez-hud-crosshair" />
                <div className="ez-hud-text-col">
                  <span className="ez-hud-tag">QTO AUTO-CALCULATE: READY</span>
                  <span className="ez-hud-subtag">PRECISION: FLAGSHIP TIER</span>
                </div>
              </div>

              {/* Center 3D Stage Visual */}
              <div
                className="ez-flagship-stage-center"
                style={{
                  transform: `translate(-50%, -50%) scale(${logoScale})`,
                  opacity: logoOpacity,
                }}
              >
                {/* 3D Multi-Axis Orbital Data Rings */}
                <div className="ez-flagship-orbit-system">
                  {/* Orbital Ring 1: Primary Equatorial Ring with QTO & AHSP */}
                  <div className="ez-orbit-ring ring-primary">
                    <div className="ez-orbit-node node-qto">
                      <div className="ez-node-pulse cyan" />
                      <div className="ez-node-card">
                        <span className="ez-node-pill cyan">QTO</span>
                        <span className="ez-node-val">Kuantitas Terverifikasi</span>
                      </div>
                    </div>
                    <div className="ez-orbit-particle particle-1" />
                  </div>

                  {/* Orbital Ring 2: Tilted Inclined Ring with AHSP */}
                  <div className="ez-orbit-ring ring-inclined">
                    <div className="ez-orbit-node node-ahsp">
                      <div className="ez-node-pulse violet" />
                      <div className="ez-node-card">
                        <span className="ez-node-pill violet">AHSP</span>
                        <span className="ez-node-val">Standar PUPR 2026</span>
                      </div>
                    </div>
                    <div className="ez-orbit-particle particle-2" />
                  </div>

                  {/* Orbital Ring 3: Counter-Tilted Ring with RAB & BOQ */}
                  <div className="ez-orbit-ring ring-counter">
                    <div className="ez-orbit-node node-rab">
                      <div className="ez-node-pulse emerald" />
                      <div className="ez-node-card">
                        <span className="ez-node-pill emerald">RAB</span>
                        <span className="ez-node-val">Kalkulasi Otomatis</span>
                      </div>
                    </div>
                    <div className="ez-orbit-node node-boq">
                      <div className="ez-node-pulse amber" />
                      <div className="ez-node-card">
                        <span className="ez-node-pill amber">BOQ</span>
                        <span className="ez-node-val">Bill of Quantities</span>
                      </div>
                    </div>
                    <div className="ez-orbit-particle particle-3" />
                  </div>

                  {/* Concentric Technical Wireframe Rings */}
                  <svg className="ez-orbit-svg-ticks" viewBox="0 0 600 600">
                    <circle cx="300" cy="300" r="280" className="ez-orbit-outer-circle" />
                    <circle cx="300" cy="300" r="220" className="ez-orbit-dash-circle" />
                    <circle cx="300" cy="300" r="160" className="ez-orbit-inner-circle" />
                  </svg>
                </div>

                {/* Centerpiece 3D Iridescent AI Core Asset */}
                <div className="ez-flagship-core-wrapper">
                  {/* Volumetric Core Aura Glow */}
                  <div className="ez-flagship-core-glow" />
                  <div className="ez-flagship-core-bloom" />

                  {/* High-Resolution Iridescent 3D Sphere Asset */}
                  <img
                    src="/images/magic-ai-core.png"
                    alt="EZRAB Magic AI Core"
                    className="ez-flagship-core-img"
                  />

                  {/* Optical Glass Lens Flare Refraction */}
                  <div className="ez-flagship-core-sheen" />
                </div>

                {/* Brand Identity Typography Hierarchy */}
                <div className="ez-flagship-brand-block">
                  {/* Metallic Titanium / Cyan Wordmark */}
                  <h3 className="ez-flagship-brand-title">
                    <span className="ez-brand-title-shimmer">EZRAB</span>
                  </h3>

                  {/* Tracked Cyber Cyan Subtitle */}
                  <div className="ez-flagship-brand-sub">
                    <span className="ez-brand-sub-glow">MAGIC AI</span>
                  </div>

                  {/* Architectural Intelligence Tagline */}
                  <p className="ez-flagship-brand-tagline">
                    The Intelligence Engine Behind Construction Estimation
                  </p>

                  {/* World-Class Glassmorphic CTA */}
                  <div className="ez-flagship-cta-wrapper">
                    <button
                      onClick={onStart}
                      className="ez-btn-cinematic-glass"
                    >
                      <span className="ez-glass-btn-bg" />
                      <span className="ez-glass-btn-border" />
                      <span className="ez-glass-btn-content">
                        <span>Mulai Eksplorasi Sekarang</span>
                        <ArrowRight size={17} className="ez-glass-btn-arrow" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* DISCREET CONTROLS HUD (PLAY/PAUSE, AUDIO & TIMELINE)       */}
          {/* ========================================================= */}
          <div
            className="ez-magic-hud-footer"
            style={{
              opacity: hudFooterOpacity,
              pointerEvents: hudFooterOpacity > 0.3 ? 'auto' : 'none',
            }}
          >
            <div className="ez-magic-hud-actions-left">
              {/* Play / Pause Toggle */}
              <button
                onClick={togglePlay}
                className="ez-magic-sound-toggle"
                aria-label={isPlaying ? 'Jeda Video' : 'Putar Video'}
                title={isPlaying ? 'Jeda Video' : 'Putar Video'}
              >
                {isPlaying ? (
                  <>
                    <Pause size={14} className="text-cyan-400" />
                    <span>Jeda</span>
                  </>
                ) : (
                  <>
                    <Play size={14} className="text-cyan-400" />
                    <span>Putar</span>
                  </>
                )}
              </button>

              {/* Sound Toggle */}
              <button
                onClick={toggleSound}
                className="ez-magic-sound-toggle"
                aria-label={isMuted ? 'Aktifkan Suara' : 'Matikan Suara'}
                title={isMuted ? 'Aktifkan Suara' : 'Matikan Suara'}
              >
                {isMuted ? (
                  <>
                    <VolumeX size={15} />
                    <span>Suara: Bisu</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={15} className="text-cyan-400" />
                    <span>Suara: Aktif</span>
                  </>
                )}
              </button>
            </div>

            {/* Scrubber & Status Indicator */}
            <div className="ez-magic-scrub-indicator">
              <span className="ez-magic-scrub-time font-mono">
                {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
              </span>
              <div className="ez-magic-scrub-track">
                <div
                  className="ez-magic-scrub-fill"
                  style={{ width: `${Math.round(videoPct)}%` }}
                />
              </div>
              <span className="ez-magic-scrub-label">AUTOPLAY • {Math.round(progress * 100)}% SCROLL</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExactMagicAi;

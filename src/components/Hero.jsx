import React, { useEffect, useRef } from "react";
import "../styles/hero.css";
import heroPoster from "../assets/0908fg-poster.jpg";
import heroVideoWebm from "../assets/0908fg-transparent.webm";
import heroVideoMp4 from "../assets/0908fg.mp4";
import { Sparkles, CheckCircle2, FileText, Database, Layers, ArrowRight, Play, TrendingUp } from "lucide-react";

export default function Hero({ onStartFree, onOpenDemo }) {
  const heroRef = useRef(null);
  const sceneRef = useRef(null);
  const videoRef = useRef(null);
  /* Scroll depth is expressed as CSS variables so transforms stay on the compositor. */
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const updateScrollDepth = () => {
      const rect = hero.getBoundingClientRect();
      const depth = Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height)));
      hero.style.setProperty('--hero-zoom', String(1 + depth * 0.07));
      hero.style.setProperty('--hero-card-offset', `${depth * -18}px`);
      hero.style.setProperty('--hero-card-opacity', String(0.78 + depth * 0.22));
    };
    window.addEventListener('scroll', updateScrollDepth, { passive: true });
    updateScrollDepth();
    return () => window.removeEventListener('scroll', updateScrollDepth);
  }, []);

  /* =========================
     ENSURE VIDEO AUTOPLAY
  ========================= */
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  /* =========================
     SMOOTH 3D MOUSE PARALLAX
  ========================= */
  useEffect(() => {
    const hero = heroRef.current;
    const scene = sceneRef.current;
    if (!hero || !scene) return;

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let animFrame = null;

    const handleMouseMove = (event) => {
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      targetX = x;
      targetY = y;
    };

    const handleMouseLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    const animate = () => {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;

      scene.style.transform = `
        perspective(1400px)
        rotateY(${currentX * 5}deg)
        rotateX(${-currentY * 4}deg)
        translate3d(${currentX * 12}px, ${currentY * 10}px, 0)
      `;
      animFrame = requestAnimationFrame(animate);
    };

    hero.addEventListener("mousemove", handleMouseMove);
    hero.addEventListener("mouseleave", handleMouseLeave);
    animFrame = requestAnimationFrame(animate);

    return () => {
      hero.removeEventListener("mousemove", handleMouseMove);
      hero.removeEventListener("mouseleave", handleMouseLeave);
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, []);

  return (
    <section ref={heroRef} className="ez-hero">
      {/* BACKGROUND GLOW & GRID */}
      <div className="hero-glow" />
      <div className="hero-grid" />

      {/* LEFT CONTENT */}
      <div className="hero-copy">
        <div className="hero-badge">
          <Sparkles size={14} className="hero-badge-icon" />
          <span>WORKSPACE RAB & ESTIMASI KONSTRUKSI</span>
        </div>

        <h1>
          Dari Gambar Kerja
          <br />
          Menjadi <strong>RAB.</strong>
          <br />
          Lebih Cepat.
        </h1>

        <p>
          Hitung volume, susun AHSP, buat RAB, BOQ, hingga laporan proyek
          dalam satu workspace terpadu.
        </p>

        <div className="hero-buttons">
          <button onClick={onStartFree} className="btn-primary">
            <span>Mulai Gratis</span>
            <ArrowRight size={16} />
          </button>

          <button onClick={onOpenDemo} className="btn-demo">
            <span className="btn-play-icon">
              <Play size={11} fill="currentColor" />
            </span>
            <span>Lihat Demo</span>
          </button>
        </div>

        {/* 3 Value Badges matching uploaded design */}
        <div className="hero-features-pills">
          <div className="hero-pill-item">
            <div className="pill-check-icon">✓</div>
            <div>
              <b>Template Lengkap</b>
              <small>Kementerian PUPR</small>
            </div>
          </div>

          <div className="hero-pill-item">
            <div className="pill-check-icon">✓</div>
            <div>
              <b>Database AHSP 2026</b>
              <small>Terupdate</small>
            </div>
          </div>

          <div className="hero-pill-item">
            <div className="pill-check-icon">✓</div>
            <div>
              <b>Ekspor Excel & PDF</b>
              <small>Siap Cetak</small>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT ENLARGED HYBRID SCENE (3D ISOMETRIC BUILDING + PROMINENT FLOATING GLASS CARDS) */}
      <div className="hero-scene-container">
        <div ref={sceneRef} className="hero-scene">
          {/* 1. ENLARGED 3D VIDEO BASE LAYER (TRANSPARENT BACKGROUND) */}
          <div className="scene-base-wrapper enlarged-wrapper">
            <video
              ref={videoRef}
              poster={heroPoster}
              autoPlay
              loop
              muted
              playsInline
              className="scene-3d-render enlarged-render"
            >
              <source src={heroVideoWebm} type="video/webm" />
              <source src={heroVideoMp4} type="video/mp4" />
            </video>
          </div>

          {/* 2. CARD 1 (TOP LEFT): TOTAL ESTIMASI RAB PROYEK */}
          <div className="pop-card hero-glass-card top-left-card">
            <div className="glass-card-header">
              <div className="dot-indicator blue" />
              <span>Total RAB Proyek (Terhitung)</span>
            </div>
            <strong className="glass-card-value">
              Rp 1.450.000.000
            </strong>
            <div className="glass-card-subinfo">
              <span className="glass-badge-highlight">✓ Realtime SNI 2026</span>
              <span className="glass-text-small">Otomatis Terhubung</span>
            </div>
            <svg className="mini-sparkline" viewBox="0 0 140 28" fill="none">
              <path
                d="M 0 20 Q 35 24, 60 14 T 100 12 T 140 4"
                stroke="#2563eb"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <path
                d="M 0 20 Q 35 24, 60 14 T 100 12 T 140 4 L 140 28 L 0 28 Z"
                fill="url(#sparkline-grad)"
                opacity="0.3"
              />
              <defs>
                <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* 3. CARD 2 (TOP RIGHT): QTO PEKERJAAN STRUKTUR */}
          <div className="pop-card hero-glass-card top-right-card">
            <div className="glass-card-row">
              <div className="glass-icon-circle blue">
                <Layers size={18} />
              </div>
              <div>
                <span className="glass-card-tag">QTO TERHITUNG</span>
                <b className="glass-card-sub">Pekerjaan Struktur & Beton</b>
              </div>
            </div>
            <div className="glass-card-footer">
              <span className="glass-volume-metric">1.485,50 m³</span>
              <span className="glass-status-badge success">✓ Terverifikasi</span>
            </div>
          </div>

          {/* 4. CARD 3 (MID LEFT): AHSP 2026 */}
          <div className="pop-card hero-glass-card mid-left-card">
            <div className="glass-card-row compact">
              <div className="glass-icon-circle check">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <b className="glass-card-title">AHSP PUPR 2026</b>
                <small className="glass-card-muted">12.500+ Koefisien Aktif</small>
              </div>
            </div>
          </div>

          {/* 5. CARD 4 (MID RIGHT): BOQ SIAP CETAK */}
          <div className="pop-card hero-glass-card mid-right-card">
            <div className="glass-card-row compact">
              <div className="glass-icon-circle purple">
                <FileText size={20} />
              </div>
              <div>
                <b className="glass-card-title">BOQ & Rekapitulasi</b>
                <small className="glass-card-muted">Format Standar Excel & PDF</small>
              </div>
            </div>
          </div>

          {/* 6. SUBTLE LASER / GRID OVERLAYS */}
          <div className="dimension dim-roof-tag">Elevasi +7.50 m</div>
          <div className="dimension dim-ground-tag">Site Area 360 m²</div>
        </div>
      </div>
    </section>
  );
}

export { Hero };

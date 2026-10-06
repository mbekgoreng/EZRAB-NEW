import React, { useRef, useEffect, useState } from 'react';
import {
  FileUp,
  Cpu,
  Database,
  FileSpreadsheet,
  Download,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  FileText,
  Share2,
  Layers,
  Search,
} from 'lucide-react';

import step1Img from '../../assets/workflow/step-1-upload.jpg';
import step2Img from '../../assets/workflow/step-2-ai-scan.jpg';
import step3Img from '../../assets/workflow/step-3-qto-ahsp.jpg';
import step4Img from '../../assets/workflow/step-4-rab-boq.jpg';
import step5Img from '../../assets/workflow/step-5-download-share.jpg';

export const CinematicScrollZoom: React.FC<{ onOpenWorkspace?: () => void }> = ({
  onOpenWorkspace,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(1);

  // 5 Step details
  const steps = [
    {
      num: '01',
      title: 'Unggah Dokumen',
      desc: 'PDF, DWG, JPG, atau gambar kerja arsitektur & struktur.',
      icon: FileUp,
      image: step1Img,
      badge: 'Multi-Format Input',
      subText: 'Membaca gambar kerja DED dan denah 2D/3D secara instan',
    },
    {
      num: '02',
      title: 'AI Membaca & Memproses',
      desc: 'Membaca daftar pekerjaan, ekstraksi volume, dan spesifikasi teknis.',
      icon: Cpu,
      image: step2Img,
      badge: 'AI Structural Parsing',
      subText: 'Ekstraksi volume elemen kolom, balok, pelat & pondasi',
    },
    {
      num: '03',
      title: 'Generate QTO & AHSP',
      desc: 'Mengacu pada database resmi standar terbaru AHSP 2026 PUPR.',
      icon: Database,
      image: step3Img,
      badge: 'AHSP 2026 PUPR',
      subText: 'Pencocokan koefisien harga satuan Bina Marga & Cipta Karya',
    },
    {
      num: '04',
      title: 'Hasil RAB & BOQ',
      desc: 'Siap diedit, diverifikasi, disesuaikan formula, dan diekspor.',
      icon: FileSpreadsheet,
      image: step4Img,
      badge: 'Deterministik 100%',
      subText: 'Rekapitulasi biaya proyek, PPN, dan Bill of Quantities',
    },
    {
      num: '05',
      title: 'Download / Share',
      desc: 'Dalam format Excel, PDF resmi, atau sinkron ke dashboard proyek.',
      icon: Download,
      image: step5Img,
      badge: 'Siap Cetak & Tender',
      subText: 'Export Excel dengan rumus formula utuh dan PDF siap tanda tangan',
    },
  ];

  useEffect(() => {
    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const totalScrollable = rect.height - windowHeight;

      if (totalScrollable <= 0) return;

      const currentScroll = -rect.top;
      const progress = Math.min(Math.max(currentScroll / totalScrollable, 0), 1);
      setScrollProgress(progress);

      // Map progress smoothly to step 1..5
      if (progress < 0.2) {
        setActiveStep(1);
      } else if (progress < 0.42) {
        setActiveStep(2);
      } else if (progress < 0.65) {
        setActiveStep(3);
      } else if (progress < 0.85) {
        setActiveStep(4);
      } else {
        setActiveStep(5);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleStepClick = (stepIndex: number) => {
    setActiveStep(stepIndex);
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const totalScrollable = rect.height - windowHeight;
    const targetProgress = (stepIndex - 1) / 4.2;
    const targetScrollTop = window.scrollY + rect.top + targetProgress * totalScrollable;
    window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  };

  // Subtle zoom scaling based on scroll
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const maxZoom = isMobile ? 1.08 : 1.18;
  const currentScale = 1.0 + (scrollProgress % 0.25) * 4 * (maxZoom - 1.0);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        height: '320vh',
        background: 'var(--ezrab-bg, #f7f8fb)',
      }}
    >
      {/* Sticky Cinematic Viewport */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        <div
          className="ezrab-container"
          style={{
            width: '100%',
            height: 'calc(100vh - 48px)',
            maxHeight: '820px',
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 1.25fr) minmax(320px, 1fr)',
            gap: '36px',
            alignItems: 'center',
          }}
          id="cinematic-grid-wrapper"
        >
          {/* ============================================================
              LEFT: DYNAMIC ANIMATED CINEMATIC VISUALS (CHANGES ON SCROLL)
          ============================================================ */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              minHeight: '460px',
              borderRadius: '24px',
              overflow: 'hidden',
              background: '#0b1329',
              boxShadow:
                '0 25px 60px -15px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* 1. Stacked 5 Images with Smooth Cross-Fade and Zooming */}
            {steps.map((step, idx) => {
              const stepNum = idx + 1;
              const isActive = activeStep === stepNum;

              return (
                <div
                  key={idx}
                  style={{
                    position: 'absolute',
                    inset: '-4%',
                    width: '108%',
                    height: '108%',
                    opacity: isActive ? 1 : 0,
                    transform: isActive
                      ? `scale(${currentScale}) translate3d(0, ${scrollProgress * -10}px, 0)`
                      : 'scale(1.05)',
                    transition:
                      'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                    pointerEvents: isActive ? 'auto' : 'none',
                    zIndex: isActive ? 3 : 1,
                  }}
                >
                  <img
                    src={step.image}
                    alt={step.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              );
            })}

            {/* 2. Soft Gradient Vignette & Blue Lighting */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(180deg, rgba(15, 23, 42, 0.1) 0%, rgba(37, 99, 235, 0.08) 50%, rgba(15, 23, 42, 0.75) 100%)',
                zIndex: 4,
                pointerEvents: 'none',
              }}
            />

            {/* 3. Blueprint Grid Lines Overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `
                  linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)
                `,
                backgroundSize: '32px 32px',
                zIndex: 5,
                pointerEvents: 'none',
              }}
            />

            {/* 4. REAL-TIME INTERACTIVE OVERLAYS ACCORDING TO ACTIVE STEP */}
            {/* Step 1 Overlay: Document Uploading HUD */}
            {activeStep === 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: '20px',
                  left: '20px',
                  right: '20px',
                  zIndex: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.94)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '12px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  }}
                >
                  <FileUp size={15} color="#2563eb" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                    Dokumen DED Terunggah
                  </span>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      color: '#16a34a',
                      background: '#dcfce7',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    100% Siap
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                  }}
                >
                  {['.PDF', '.DWG', '.JPG'].map((ext) => (
                    <span
                      key={ext}
                      style={{
                        fontSize: '11px',
                        fontWeight: 750,
                        color: '#ffffff',
                        background: 'rgba(15, 23, 42, 0.7)',
                        backdropFilter: 'blur(8px)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.15)',
                      }}
                    >
                      {ext}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2 Overlay: AI Scanning HUD */}
            {activeStep === 2 && (
              <div
                style={{
                  position: 'absolute',
                  top: '24px',
                  left: '20px',
                  background: 'rgba(15, 23, 42, 0.88)',
                  backdropFilter: 'blur(14px)',
                  borderRadius: '14px',
                  padding: '12px 18px',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
                  zIndex: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#38bdf8',
                      boxShadow: '0 0 10px #38bdf8',
                    }}
                  />
                  <b style={{ fontSize: '12.5px', color: '#ffffff' }}>
                    AI Parsing Struktur & Volume
                  </b>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <small style={{ color: '#93c5fd', fontSize: '11px' }}>✓ Balok & Kolom Beton: 45.00 m³</small>
                  <small style={{ color: '#93c5fd', fontSize: '11px' }}>✓ Pembesian Tulangan: 2.450 kg</small>
                  <small style={{ color: '#93c5fd', fontSize: '11px' }}>✓ Dinding Bata Ringan: 320 m²</small>
                </div>
              </div>
            )}

            {/* Step 3 Overlay: AHSP 2026 Matcher */}
            {activeStep === 3 && (
              <div
                style={{
                  position: 'absolute',
                  top: '24px',
                  right: '20px',
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(14px)',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  border: '1px solid #bfdbfe',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
                  zIndex: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Database size={16} color="#2563eb" />
                  <b style={{ fontSize: '12.5px', color: '#0f172a' }}>
                    Database AHSP PUPR 2026
                  </b>
                </div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                  Koefisien Tenaga Kerja, Bahan & Peralatan
                </span>
                <div
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    background: '#eff6ff',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#2563eb',
                  }}
                >
                  ✓ Terverifikasi Standar Nasional
                </div>
              </div>
            )}

            {/* Step 4 Overlay: RAB Rekapitulasi */}
            {activeStep === 4 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '80px',
                  left: '20px',
                  right: '20px',
                  background: 'rgba(255, 255, 255, 0.96)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '16px',
                  padding: '14px 20px',
                  border: '1px solid #bfdbfe',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                    Total Estimasi RAB Proyek
                  </span>
                  <b style={{ display: 'block', fontSize: '18px', color: '#0f172a', fontWeight: 800 }}>
                    Rp 2.845.750.000
                  </b>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#16a34a',
                    background: '#dcfce7',
                    padding: '4px 10px',
                    borderRadius: '999px',
                  }}
                >
                  Kalkulasi Siap
                </span>
              </div>
            )}

            {/* Step 5 Overlay: Export Artifacts */}
            {activeStep === 5 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '80px',
                  left: '20px',
                  right: '20px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: '16px',
                  padding: '14px 20px',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={18} color="#22c55e" />
                  <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 700 }}>
                    Excel (.xlsx)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#ef4444" />
                  <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 700 }}>
                    Laporan PDF
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Share2 size={18} color="#38bdf8" />
                  <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: 700 }}>
                    Cloud Dashboard
                  </span>
                </div>
              </div>
            )}

            {/* Bottom Caption on Image */}
            <div
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '20px',
                right: '20px',
                zIndex: 8,
              }}
            >
              <h3
                style={{
                  color: '#ffffff',
                  fontSize: 'clamp(18px, 2vw, 24px)',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  marginBottom: '2px',
                  textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                }}
              >
                {steps[activeStep - 1].num}. {steps[activeStep - 1].title}
              </h3>
              <p
                style={{
                  color: '#cbd5e1',
                  fontSize: '12.5px',
                  lineHeight: 1.4,
                  textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                }}
              >
                {steps[activeStep - 1].subText}
              </p>
            </div>
          </div>

          {/* ============================================================
              RIGHT: 5-STEP INTERACTIVE WORKFLOW LIST
          ============================================================ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ marginBottom: '6px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#eff6ff',
                  border: '1px solid #dbeafe',
                  color: '#2563eb',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  marginBottom: '8px',
                }}
              >
                <Sparkles size={13} />
                <span>Workflow Terintegrasi</span>
              </div>

              <h2
                style={{
                  fontSize: 'clamp(24px, 2.6vw, 32px)',
                  fontWeight: 800,
                  color: '#0f172a',
                  lineHeight: 1.2,
                  letterSpacing: '-0.03em',
                }}
              >
                Menjadi RAB, dalam Hitungan Menit
              </h2>
            </div>

            {/* The 5 Clickable & Scroll-Driven Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {steps.map((step, idx) => {
                const stepNum = idx + 1;
                const isCurrent = activeStep === stepNum;
                const isPassed = activeStep > stepNum;
                const Icon = step.icon;

                return (
                  <div
                    key={idx}
                    onClick={() => handleStepClick(stepNum)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      padding: '12px 16px',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      background: isCurrent
                        ? '#ffffff'
                        : isPassed
                        ? 'rgba(255, 255, 255, 0.65)'
                        : 'transparent',
                      border: isCurrent
                        ? '1.5px solid #2563eb'
                        : isPassed
                        ? '1px solid #e2e8f0'
                        : '1px solid transparent',
                      boxShadow: isCurrent
                        ? '0 10px 24px -4px rgba(37, 99, 235, 0.12)'
                        : 'none',
                      transform: isCurrent ? 'translateX(6px)' : 'translateX(0)',
                      transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) {
                        e.currentTarget.style.background = '#ffffff';
                        e.currentTarget.style.borderColor = '#bfdbfe';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) {
                        e.currentTarget.style.background = isPassed
                          ? 'rgba(255, 255, 255, 0.65)'
                          : 'transparent';
                        e.currentTarget.style.borderColor = isPassed
                          ? '#e2e8f0'
                          : 'transparent';
                      }
                    }}
                  >
                    {/* Circle Number / Icon */}
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: isCurrent
                          ? '#2563eb'
                          : isPassed
                          ? '#eff6ff'
                          : '#f1f5f9',
                        color: isCurrent
                          ? '#ffffff'
                          : isPassed
                          ? '#2563eb'
                          : '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 800,
                        flexShrink: 0,
                        border: isPassed ? '1px solid #bfdbfe' : 'none',
                      }}
                    >
                      {isPassed ? <CheckCircle2 size={18} /> : step.num}
                    </div>

                    {/* Step Content */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h4
                          style={{
                            fontSize: '14.5px',
                            fontWeight: 750,
                            color: isCurrent
                              ? '#0f172a'
                              : isPassed
                              ? '#334155'
                              : '#64748b',
                            marginBottom: '2px',
                          }}
                        >
                          {step.title}
                        </h4>
                        {isCurrent && (
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 700,
                              color: '#2563eb',
                              background: '#eff6ff',
                              padding: '2px 8px',
                              borderRadius: '999px',
                            }}
                          >
                            {step.badge}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: '12.5px',
                          color: '#64748b',
                          lineHeight: 1.45,
                        }}
                      >
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick action button */}
            <div style={{ marginTop: '8px' }}>
              <button
                onClick={onOpenWorkspace}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 22px',
                  borderRadius: '9999px',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px -2px rgba(37, 99, 235, 0.35)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1d4ed8';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span>Lihat Cara Kerja</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          #cinematic-grid-wrapper {
            grid-template-columns: 1fr !important;
            height: auto !important;
            max-height: none !important;
          }
        }
      `}</style>
    </div>
  );
};

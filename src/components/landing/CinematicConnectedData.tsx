import React, { useRef, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Sparkles,
  Users,
  ShieldCheck,
  RefreshCw,
  FolderSync,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import heroBuilding from '../../assets/hero-building.jpg';

export const CinematicConnectedData: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = sectionRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const totalDist = rect.height;
      const visible = windowHeight - rect.top;

      const progress = Math.min(Math.max(visible / (totalDist + windowHeight), 0), 1);
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const highlightedStep =
    scrollProgress < 0.3
      ? 'volume'
      : scrollProgress < 0.55
      ? 'hargasatuan'
      : scrollProgress < 0.8
      ? 'jumlah'
      : 'total';

  const benefits = [
    'Kolaborasi tim secara real-time',
    'Manajemen proyek dan versi RAB',
    'Akses multi-user dengan role berbeda',
    'Keamanan data tingkat tinggi',
    'Update harga dan material otomatis',
  ];

  return (
    <section
      ref={sectionRef}
      id="data-terhubung"
      style={{
        padding: '100px 0',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}
    >
      <div className="ezrab-container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '60px',
            alignItems: 'center',
          }}
          className="connected-data-grid"
        >
          {/* Left Column: Enlarged Architectural Villa with Connected Live Floating Sheet */}
          <div
            style={{
              position: 'relative',
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.12)',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            {/* Building Image */}
            <div
              style={{
                position: 'relative',
                height: '460px',
                overflow: 'hidden',
              }}
            >
              <img
                src={heroBuilding}
                alt="EZRAB Architecture"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: `scale(${1.02 + scrollProgress * 0.08})`,
                  transition: 'transform 0.2s ease-out',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(37,99,235,0.05) 0%, rgba(15,23,42,0.4) 100%)',
                }}
              />
            </div>

            {/* Overlaid Interactive Mini Spreadsheet connecting Volume -> Harga -> Jumlah */}
            <div
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '20px',
                right: '20px',
                background: 'rgba(255, 255, 255, 0.96)',
                backdropFilter: 'blur(16px)',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.15)',
                border: '1px solid #bfdbfe',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={16} color="#2563eb" />
                  <b style={{ fontSize: '13px', color: '#0f172a' }}>
                    Kalkulasi Terintegrasi Real-Time
                  </b>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#2563eb',
                    background: '#eff6ff',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  AHSP 2026 Sync
                </span>
              </div>

              {/* Table Calculation Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr 1fr 1.1fr',
                  gap: '6px',
                  fontSize: '11.5px',
                  background: '#f8fafc',
                  padding: '8px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ color: '#64748b' }}>
                  <span>Pekerjaan</span>
                  <b style={{ display: 'block', color: '#0f172a', fontSize: '12px' }}>
                    Beton K-250
                  </b>
                </div>

                <div
                  style={{
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background:
                      highlightedStep === 'volume' ? '#dbeafe' : 'transparent',
                    transition: 'background 0.3s',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Volume</span>
                  <b
                    style={{
                      display: 'block',
                      color:
                        highlightedStep === 'volume' ? '#1d4ed8' : '#0f172a',
                      fontSize: '12px',
                    }}
                  >
                    45.00 m³
                  </b>
                </div>

                <div
                  style={{
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background:
                      highlightedStep === 'hargasatuan'
                        ? '#dbeafe'
                        : 'transparent',
                    transition: 'background 0.3s',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Harga Satuan</span>
                  <b
                    style={{
                      display: 'block',
                      color:
                        highlightedStep === 'hargasatuan'
                          ? '#1d4ed8'
                          : '#0f172a',
                      fontSize: '12px',
                    }}
                  >
                    1.250.000
                  </b>
                </div>

                <div
                  style={{
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background:
                      highlightedStep === 'jumlah' || highlightedStep === 'total'
                        ? '#dcfce7'
                        : 'transparent',
                    textAlign: 'right',
                    transition: 'background 0.3s',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Jumlah (Rp)</span>
                  <b
                    style={{
                      display: 'block',
                      color:
                        highlightedStep === 'jumlah' ||
                        highlightedStep === 'total'
                          ? '#16a34a'
                          : '#0f172a',
                      fontSize: '12px',
                      fontWeight: 800,
                    }}
                  >
                    56.250.000
                  </b>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Copy & Checklist */}
          <div>
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
                marginBottom: '14px',
              }}
            >
              <Sparkles size={13} />
              <span>Fitur Unggulan</span>
            </div>

            <h2
              style={{
                fontSize: 'clamp(30px, 3.4vw, 40px)',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                marginBottom: '16px',
              }}
            >
              Lebih dari Sekadar Estimasi
            </h2>

            <p
              style={{
                fontSize: '15.5px',
                color: '#64748b',
                lineHeight: 1.65,
                marginBottom: '28px',
              }}
            >
              EZRAB dirancang dengan antarmuka modern, mudah digunakan, dan didukung fitur lengkap untuk kebutuhan profesional teknik sipil dan arsitektur.
            </p>

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {benefits.map((text, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <CheckCircle2 size={16} />
                  </div>
                  <span
                    style={{
                      fontSize: '14.5px',
                      fontWeight: 600,
                      color: '#1e293b',
                    }}
                  >
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .connected-data-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
        }
      `}</style>
    </section>
  );
};

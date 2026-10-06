import React, { useRef, useEffect, useState } from 'react';
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';
import heroBuilding from '../../assets/hero-building.jpg';
import blueprintImg from '../../assets/ezrab-3d-scene.png';

interface CinematicFinalCtaProps {
  onStartFree?: () => void;
}

export const CinematicFinalCta: React.FC<CinematicFinalCtaProps> = ({ onStartFree }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{
        padding: '100px 0',
        background: '#f8fafc',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="ezrab-container">
        <div
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, #0b1329 0%, #0f172a 60%, #1e3a8a 100%)',
            borderRadius: '28px',
            padding: '70px 50px',
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr',
            gap: '40px',
            alignItems: 'center',
            boxShadow:
              '0 25px 60px -10px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(59, 130, 246, 0.2)',
          }}
          className="final-cta-card"
        >
          {/* Glowing Aura Background Elements */}
          <div
            style={{
              position: 'absolute',
              top: '-100px',
              right: '-100px',
              width: '500px',
              height: '500px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(37,99,235,0.35) 0%, transparent 70%)',
              filter: 'blur(50px)',
              pointerEvents: 'none',
              transform: inView ? 'scale(1.2)' : 'scale(0.8)',
              transition: 'transform 1.2s ease-out',
            }}
          />

          {/* Blueprint Grid Overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)
              `,
              backgroundSize: '32px 32px',
              pointerEvents: 'none',
            }}
          />

          {/* Left: Headline, Subtitle & Action */}
          <div style={{ position: 'relative', zIndex: 10 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(37, 99, 235, 0.25)',
                border: '1px solid rgba(96, 165, 250, 0.4)',
                color: '#93c5fd',
                padding: '4px 14px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '20px',
              }}
            >
              <Sparkles size={13} />
              <span>Bangun RAB. Bukan dari Nol.</span>
            </div>

            <h2
              style={{
                fontSize: 'clamp(32px, 3.6vw, 44px)',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                marginBottom: '16px',
              }}
            >
              Siap Membuat Estimasi Proyek Lebih Mudah?
            </h2>

            <p
              style={{
                fontSize: '16px',
                color: '#94a3b8',
                lineHeight: 1.6,
                marginBottom: '32px',
                maxWidth: '520px',
              }}
            >
              Bergabung dengan ribuan profesional dan rasakan sendiri kemudahan menyusun RAB, QTO, dan analisa harga secara cerdas.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
              <button
                onClick={onStartFree}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 32px',
                  borderRadius: '9999px',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '15.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px -2px rgba(37, 99, 235, 0.5)',
                  transition: 'all 0.25s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1d4ed8';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                  e.currentTarget.style.boxShadow =
                    '0 12px 30px -2px rgba(37, 99, 235, 0.65)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow =
                    '0 8px 24px -2px rgba(37, 99, 235, 0.5)';
                }}
              >
                <span>Mulai Gratis Sekarang</span>
                <ArrowRight size={17} />
              </button>

              <span
                style={{
                  fontSize: '12.5px',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  paddingLeft: '4px',
                }}
              >
                <ShieldCheck size={14} color="#60a5fa" />
                <span>Tidak perlu kartu kredit · Akses instan langsung pakai</span>
              </span>
            </div>
          </div>

          {/* Right: Architectural 3D Wireframe Visual with Subtle Neon Glow */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5,
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxHeight: '340px',
                borderRadius: '20px',
                overflow: 'hidden',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                transform: inView ? 'scale(1)' : 'scale(0.95)',
                transition: 'transform 1s cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}
            >
              <img
                src={blueprintImg}
                alt="3D Building Wireframe"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  filter: 'brightness(1.05) contrast(1.1)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(circle at center, transparent 30%, rgba(11,19,41,0.6) 100%)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .final-cta-card {
            grid-template-columns: 1fr !important;
            padding: 40px 24px !important;
            text-align: center;
          }
          .final-cta-card > div:first-child {
            align-items: center;
            display: flex;
            flex-direction: column;
          }
          .final-cta-card > div:first-child p {
            margin-left: auto;
            margin-right: auto;
          }
        }
      `}</style>
    </section>
  );
};

import React from 'react';
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';

interface CtaSectionProps {
  onStartFree: () => void;
}

export const CtaSection: React.FC<CtaSectionProps> = ({ onStartFree }) => {
  return (
    <section style={{ padding: '110px 0', background: 'var(--ezrab-surface)', position: 'relative', overflow: 'hidden' }}>
      {/* Subtle Glow Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, var(--ezrab-blue-soft), transparent)',
          pointerEvents: 'none',
        }}
      />

      <div className="ezrab-container" style={{ position: 'relative', zIndex: 2 }}>
        <div
          style={{
            maxWidth: '840px',
            marginInline: 'auto',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div className="ezrab-badge" style={{ marginBottom: '20px' }}>
            <Sparkles size={14} />
            <span>Mulai Transformasi Estimasi Proyek</span>
          </div>

          <h2
            style={{
              fontSize: 'clamp(36px, 4.5vw, 56px)',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.045em',
              color: 'var(--ezrab-text)',
              marginBottom: '20px',
            }}
          >
            Tinggalkan Spreadsheet Manual.<br />
            Hitung RAB dengan <span style={{ color: 'var(--ezrab-blue)' }}>Akurasi AI.</span>
          </h2>

          <p style={{ fontSize: '18px', color: 'var(--ezrab-text-secondary)', lineHeight: 1.6, maxWidth: '600px', marginBottom: '36px' }}>
            Bergabunglah bersama ribuan kontraktor, estimator, dan konsultan yang menghemat ratusan jam kerja setiap bulannya dengan EZRAB.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '14px', marginBottom: '32px' }}>
            <button onClick={onStartFree} className="ezrab-button-primary" style={{ minHeight: '54px', padding: '0 32px', fontSize: '16px' }}>
              <span>Coba Gratis Sekarang</span>
              <ArrowRight size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', color: 'var(--ezrab-text-muted)', fontSize: '13px', fontWeight: 500 }}>
            <span>✓ Tanpa Kartu Kredit</span>
            <span>✓ Standar AHSP 2026</span>
            <span>✓ Data Terenkripsi & Terisolasi</span>
          </div>
        </div>
      </div>
    </section>
  );
};

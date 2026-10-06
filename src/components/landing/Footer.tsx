import React from 'react';
import { Layers, Shield, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer style={{ background: 'var(--ezrab-bg)', borderTop: '1px solid var(--ezrab-border)', padding: '70px 0 35px 0' }}>
      <div className="ezrab-container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr repeat(3, 1fr)',
            gap: '40px',
            marginBottom: '60px',
          }}
          className="footer-grid"
        >
          {/* Brand Col */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '9px',
                  background: 'var(--ezrab-blue)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <Layers size={18} />
              </div>
              <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ezrab-text)' }}>
                EZRAB<span style={{ color: 'var(--ezrab-blue)' }}>.</span>
              </span>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--ezrab-text-secondary)', lineHeight: 1.6, maxWidth: '320px' }}>
              Platform estimasi biaya konstruksi berbasis AI generasi terbaru untuk kontraktor, estimator, dan konsultan Indonesia.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h5 style={{ fontSize: '13px', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ezrab-text)', marginBottom: '16px' }}>
              Produk & Fitur
            </h5>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: 'var(--ezrab-text-secondary)' }}>
              <li><a href="#magic-ai" style={{ transition: 'color 0.2s' }}>EZRAB Magic AI</a></li>
              <li><a href="#spreadsheet" style={{ transition: 'color 0.2s' }}>Kalkulator Spreadsheet</a></li>
              <li><a href="#ahsp-database" style={{ transition: 'color 0.2s' }}>Database AHSP 2026</a></li>
              <li><a href="#fitur" style={{ transition: 'color 0.2s' }}>Manajemen Kurva S</a></li>
            </ul>
          </div>

          {/* Standards & Compliance */}
          <div>
            <h5 style={{ fontSize: '13px', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ezrab-text)', marginBottom: '16px' }}>
              Standar & Regulasi
            </h5>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: 'var(--ezrab-text-secondary)' }}>
              <li><span>Permen PUPR No. 1/2026</span></li>
              <li><span>SNI Analisa Biaya Konstruksi</span></li>
              <li><span>Indeks Harga Daerah BPS</span></li>
              <li><span>Keamanan ISO 27001</span></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h5 style={{ fontSize: '13px', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ezrab-text)', marginBottom: '16px' }}>
              Perusahaan
            </h5>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: 'var(--ezrab-text-secondary)' }}>
              <li><a href="#">Tentang EZRAB</a></li>
              <li><a href="#">Dokumentasi API</a></li>
              <li><a href="#">Kebijakan Privasi</a></li>
              <li><a href="#">Syarat & Ketentuan</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          style={{
            paddingTop: '28px',
            borderTop: '1px solid var(--ezrab-border)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            fontSize: '13px',
            color: 'var(--ezrab-text-muted)',
          }}
        >
          <div>
            &copy; {new Date().getFullYear()} EZRAB Technologies Inc. Hak Cipta Dilindungi Undang-Undang.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Dibuat dengan presisi untuk industri konstruksi Indonesia</span>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 840px) {
          .footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 520px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
};

import React, { useState } from 'react';
import { Logo } from '../common/Logo';
import { ArrowRight, Send, Check } from 'lucide-react';

export const LandingFooter: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setTimeout(() => {
        setSubscribed(false);
        setEmail('');
      }, 3000);
    }
  };

  return (
    <footer
      style={{
        background: '#0a0f1d',
        color: '#94a3b8',
        padding: '70px 0 30px',
        borderTop: '1px solid #1e293b',
      }}
    >
      <div className="ezrab-container">
        {/* Main 4-Column Layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.9fr 1fr 1fr 1.3fr',
            gap: '40px',
            marginBottom: '60px',
          }}
          className="landing-footer-grid"
        >
          {/* Col 1: Brand & Tagline */}
          <div>
            <div style={{ marginBottom: '14px' }}>
              <Logo height={32} />
            </div>
            <p
              style={{
                fontSize: '13.5px',
                color: '#64748b',
                lineHeight: 1.6,
                marginBottom: '20px',
                maxWidth: '240px',
              }}
            >
              Tools cerdas untuk masa depan konstruksi dan estimasi proyek terpadu.
            </p>

            {/* Social Icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {['FB', 'TW', 'IG', 'IN', 'YT'].map((s, i) => (
                <div
                  key={i}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#1e293b',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#2563eb';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#1e293b';
                    e.currentTarget.style.color = '#94a3b8';
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Col 2: Produk */}
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 750,
                color: '#ffffff',
                marginBottom: '16px',
              }}
            >
              Produk
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['Fitur', 'Template', 'Harga', 'Update'].map((item, idx) => (
                <li key={idx}>
                  <a
                    href={`#${item.toLowerCase()}`}
                    style={{
                      fontSize: '13px',
                      color: '#64748b',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Bantuan */}
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 750,
                color: '#ffffff',
                marginBottom: '16px',
              }}
            >
              Bantuan
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['FAQ', 'Panduan', 'Kontak', 'Syarat & Ketentuan'].map((item, idx) => (
                <li key={idx}>
                  <a
                    href="#"
                    style={{
                      fontSize: '13px',
                      color: '#64748b',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Perusahaan */}
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 750,
                color: '#ffffff',
                marginBottom: '16px',
              }}
            >
              Perusahaan
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['Tentang Kami', 'Karir', 'Blog'].map((item, idx) => (
                <li key={idx}>
                  <a
                    href="#"
                    style={{
                      fontSize: '13px',
                      color: '#64748b',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 5: Newsletter Input */}
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 750,
                color: '#ffffff',
                marginBottom: '12px',
              }}
            >
              Dapatkan Update Terbaru
            </h4>
            <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '14px' }}>
              Daftar buletin bulanan untuk info AHSP terbaru dan tips estimasi proyek.
            </p>

            <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
              <input
                type="email"
                placeholder="Email Anda..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  padding: '0 44px 0 14px',
                  color: '#ffffff',
                  fontSize: '13px',
                }}
              />
              <button
                type="submit"
                aria-label="Kirim Email"
                style={{
                  position: 'absolute',
                  right: '4px',
                  top: '4px',
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: subscribed ? '#16a34a' : '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {subscribed ? <Check size={16} /> : <ArrowRight size={15} />}
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          style={{
            paddingTop: '24px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            fontSize: '12.5px',
            color: '#64748b',
          }}
        >
          <div>© {new Date().getFullYear()} EZRAB. Semua hak dilindungi.</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <a href="#" style={{ color: '#64748b' }}>
              Privasi
            </a>
            <a href="#" style={{ color: '#64748b' }}>
              Syarat & Ketentuan
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .landing-footer-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 30px !important;
          }
        }
        @media (max-width: 560px) {
          .landing-footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
};

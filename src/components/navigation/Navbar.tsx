import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Logo } from '../common/Logo';

interface NavbarProps {
  onOpenWorkspace: () => void;
  onOpenAuth: () => void;
  onOpenTheme?: () => void;
  onBackToLanding?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenWorkspace,
  onOpenAuth,
  onBackToLanding,
}) => {
  const handleLogoClick = () => {
    if (onBackToLanding) {
      onBackToLanding();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBerandaClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onBackToLanding) {
      onBackToLanding();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '72px',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--ezrab-border-subtle)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 24px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Brand Logo */}
        <div onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
          <Logo
            height={36}
            style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
          />
        </div>

        {/* Center Navigation Links */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '36px',
          }}
          className="desktop-nav"
        >
          <a
            href="#"
            onClick={handleBerandaClick}
            style={{
              position: 'relative',
              fontSize: '14.5px',
              fontWeight: 700,
              color: 'var(--ezrab-blue)',
              padding: '6px 0',
              textDecoration: 'none',
            }}
          >
            Beranda
            <span
              style={{
                position: 'absolute',
                bottom: '-2px',
                left: '10%',
                right: '10%',
                height: '2.5px',
                background: 'var(--ezrab-blue)',
                borderRadius: '2px',
              }}
            />
          </a>
          <a
            href="#fitur"
            style={{
              fontSize: '14.5px',
              fontWeight: 500,
              color: 'var(--ezrab-text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ezrab-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ezrab-text-secondary)')}
          >
            Fitur
          </a>
          <a
            href="#workflow"
            style={{
              fontSize: '14.5px',
              fontWeight: 500,
              color: 'var(--ezrab-text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ezrab-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ezrab-text-secondary)')}
          >
            Alur Kerja
          </a>
          <a
            href="#volume"
            style={{
              fontSize: '14.5px',
              fontWeight: 500,
              color: 'var(--ezrab-text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ezrab-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ezrab-text-secondary)')}
          >
            Kalkulator Volume
          </a>
          <a
            href="#ahsp"
            style={{
              fontSize: '14.5px',
              fontWeight: 500,
              color: 'var(--ezrab-text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ezrab-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ezrab-text-secondary)')}
          >
            Database AHSP
          </a>
          <a
            href="#harga"
            style={{
              fontSize: '14.5px',
              fontWeight: 500,
              color: 'var(--ezrab-text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ezrab-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ezrab-text-secondary)')}
          >
            Harga
          </a>
          <a
            href="#tentang"
            style={{
              fontSize: '14.5px',
              fontWeight: 500,
              color: 'var(--ezrab-text-secondary)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ezrab-text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ezrab-text-secondary)')}
          >
            Tentang
          </a>
        </nav>

        {/* Right Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {/* Masuk (Login) */}
          <button
            onClick={onOpenAuth}
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--ezrab-text)',
              cursor: 'pointer',
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ezrab-blue)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ezrab-text)')}
          >
            Masuk
          </button>

          {/* Mulai Gratis Button */}
          <button
            onClick={onOpenWorkspace}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 22px',
              borderRadius: '9999px',
              background: 'var(--ezrab-blue)',
              color: '#ffffff',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 14px -2px rgba(37, 99, 235, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ezrab-blue-hover)';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 20px -2px rgba(37, 99, 235, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--ezrab-blue)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 14px -2px rgba(37, 99, 235, 0.4)';
            }}
          >
            <span>Mulai Gratis</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .desktop-nav {
            display: none !important;
          }
        }
      `}</style>
    </header>
  );
};

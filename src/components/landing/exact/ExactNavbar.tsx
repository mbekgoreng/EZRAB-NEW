import React, { useState, useEffect } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { getBlogBaseUrl } from '../../../blog/site';
import { navigateTo } from '../../../routing/routes';

interface ExactNavbarProps {
  onOpenAuth: (tab: 'masuk' | 'daftar') => void;
  onBackToLanding?: () => void;
  onOpenAbout?: () => void;
  onOpenAdvantages?: () => void;
}

export const ExactNavbar: React.FC<ExactNavbarProps> = ({
  onOpenAuth,
  onBackToLanding,
  onOpenAdvantages,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (id === 'beranda') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const elem = document.getElementById(id);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleGoPage = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    navigateTo(path);
    window.scrollTo(0, 0);
  };

  return (
    <header className={`ez-nav-dark ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="ez-nav-inner">
        {/* Left: Logo */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (onBackToLanding) onBackToLanding();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="ez-nav-logo"
        >
          <img
            src="/images/ez-logo.png"
            alt="EZRAB - AI Construction Estimator"
            className="ez-nav-brand-logo"
            fetchPriority="high"
            decoding="async"
          />
          <span className="ez-nav-logo-text" style={{ marginLeft: '10px' }}>EZRAB</span>
        </a>

        {/* Center: Navigation Links */}
        <nav className="ez-nav-links">
          <a
            href="#beranda"
            onClick={handleScrollTo('beranda')}
            className="ez-nav-link active"
          >
            Beranda
          </a>
          <a
            href="#fitur"
            onClick={handleScrollTo('fitur')}
            className="ez-nav-link"
          >
            Fitur
          </a>
          <a
            href="/fitur"
            onClick={handleGoPage('/fitur')}
            className="ez-nav-link"
          >
            Kenali EZRAB
          </a>
          <a
            href="/keunggulan"
            onClick={(e) => {
              e.preventDefault();
              setMobileMenuOpen(false);
              onOpenAdvantages?.();
            }}
            className="ez-nav-link"
          >
            Keunggulan
          </a>
          <a
            href="#harga"
            onClick={handleScrollTo('harga')}
            className="ez-nav-link"
          >
            Harga
          </a>
          {/* Blog tinggal di subdomain — tautan absolut */}
          <a href={getBlogBaseUrl()} className="ez-nav-link">
            Blog
          </a>
        </nav>

        {/* Right: Actions */}
        <div className="ez-nav-actions">
          <button
            className="ez-btn-ghost-dark"
            onClick={() => onOpenAuth('masuk')}
          >
            Masuk
          </button>

          <button
            className="ez-btn-primary-pill"
            onClick={() => onOpenAuth('daftar')}
          >
            <span>Coba Gratis</span>
            <ArrowRight size={13.5} />
          </button>
          <button
            type="button"
            className="ez-flagship-menu-trigger"
            aria-label={mobileMenuOpen ? 'Tutup navigasi' : 'Buka navigasi'}
            aria-expanded={mobileMenuOpen}
            aria-controls="ez-flagship-mobile-menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
      <nav
        id="ez-flagship-mobile-menu"
        className={`ez-flagship-mobile-menu ${mobileMenuOpen ? 'is-open' : ''}`}
        aria-label="Navigasi utama"
      >
        <div className="ez-flagship-menu-kicker">EXPLORE EZRAB</div>
        <a href="#beranda" onClick={handleScrollTo('beranda')}><span>01</span> Beranda</a>
        <a href="#fitur" onClick={handleScrollTo('fitur')}><span>02</span> Fitur Utama</a>
        <a href="/fitur" onClick={handleGoPage('/fitur')}><span>03</span> Kenali EZRAB</a>
        <a href="/keunggulan" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); onOpenAdvantages?.(); }}><span>04</span> Keunggulan</a>
        <a href="#harga" onClick={handleScrollTo('harga')}><span>05</span> Harga</a>
        <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAuth('masuk'); }}>
          Masuk ke Workspace <ArrowRight size={16} />
        </button>
      </nav>
    </header>
  );
};

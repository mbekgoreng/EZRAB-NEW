import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { getBlogBaseUrl } from '../../../blog/site';
import { navigateTo } from '../../../routing/routes';

interface ExactNavbarProps {
  onOpenAuth: (tab: 'masuk' | 'daftar') => void;
  onBackToLanding?: () => void;
  onOpenAbout?: () => void;
  onOpenAdvantages?: () => void;
}

type NavKey = 'beranda' | 'kenali' | 'keunggulan';

const keyForPath = (pathname: string): NavKey => {
  if (pathname === '/keunggulan') return 'keunggulan';
  if (pathname === '/fitur') return 'kenali';
  return 'beranda';
};

export const ExactNavbar: React.FC<ExactNavbarProps> = ({
  onOpenAuth,
  onBackToLanding,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<NavKey>(() =>
    typeof window === 'undefined' ? 'beranda' : keyForPath(window.location.pathname)
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Strip biru mengikuti halaman aktif — sinkron dengan setiap navigasi SPA.
  useEffect(() => {
    const sync = () => setActiveKey(keyForPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener('ezrab:navigate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('ezrab:navigate', sync);
    };
  }, []);

  /** Pindah halaman (SPA) lalu ke atas. */
  const goPage = useCallback(
    (path: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      setMobileMenuOpen(false);
      if (window.location.pathname !== path) {
        navigateTo(path);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  /** Ke section landing (#fitur / #harga) — dari halaman lain, pindah dulu ke landing. */
  const goLandingSection = useCallback(
    (sectionId: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      setMobileMenuOpen(false);
      // Coba scroll beberapa kali — landing butuh waktu render setelah navigasi.
      const scrollWithRetry = (attempts: number) => {
        const el = document.getElementById(sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Koreksi posisi akhir (layout bisa bergeser saat aset dimuat).
          setTimeout(() => {
            const top = el.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: Math.max(0, top - 70), behavior: 'smooth' });
          }, 900);
          return;
        }
        if (attempts > 0) setTimeout(() => scrollWithRetry(attempts - 1), 400);
      };
      if (window.location.pathname !== '/') {
        navigateTo('/');
        setTimeout(() => scrollWithRetry(8), 300);
      } else {
        scrollWithRetry(3);
      }
    },
    []
  );

  const linkCls = (key: NavKey) =>
    `ez-nav-link${activeKey === key ? ' active' : ''}`;

  return (
    <header className={`ez-nav-dark ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="ez-nav-inner">
        {/* Left: Logo */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setMobileMenuOpen(false);
            if (onBackToLanding) onBackToLanding();
            else {
              navigateTo('/');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
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
          <a href="/" onClick={goPage('/')} className={linkCls('beranda')}>
            Beranda
          </a>
          <a href="/#fitur" onClick={goLandingSection('fitur')} className="ez-nav-link">
            Fitur
          </a>
          <a href="/fitur" onClick={goPage('/fitur')} className={linkCls('kenali')}>
            Kenali EZRAB
          </a>
          <a href="/keunggulan" onClick={goPage('/keunggulan')} className={linkCls('keunggulan')}>
            Keunggulan
          </a>
          <a href="/#harga" onClick={goLandingSection('harga')} className="ez-nav-link">
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
        <a href="/" onClick={goPage('/')}><span>01</span> Beranda</a>
        <a href="/#fitur" onClick={goLandingSection('fitur')}><span>02</span> Fitur Utama</a>
        <a href="/fitur" onClick={goPage('/fitur')}><span>03</span> Kenali EZRAB</a>
        <a href="/keunggulan" onClick={goPage('/keunggulan')}><span>04</span> Keunggulan</a>
        <a href="/#harga" onClick={goLandingSection('harga')}><span>05</span> Harga</a>
        <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAuth('masuk'); }}>
          Masuk <ArrowRight size={16} />
        </button>
        <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAuth('daftar'); }}>
          Coba Gratis <ArrowRight size={16} />
        </button>
      </nav>
    </header>
  );
};

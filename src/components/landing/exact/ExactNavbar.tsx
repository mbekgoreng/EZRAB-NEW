import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, Check, ChevronDown, Menu, X } from 'lucide-react';
import { getBlogBaseUrl } from '../../../blog/site';
import { navigateTo } from '../../../routing/routes';
import { useI18n, LANG_OPTIONS } from '../../../i18n';
import type { Lang } from '../../../i18n';
import '../../../styles/exact-landing-nav-mobile.css';

/** Singkatan bahasa untuk tombol pemilih bahasa (pola TopBar). */
const LANG_SHORT: Record<Lang, string> = { id: 'ID', en: 'EN', zh: '中文', ms: 'MY' };

interface ExactNavbarProps {
  onOpenAuth: (tab: 'masuk' | 'daftar') => void;
  onBackToLanding?: () => void;
  onOpenAbout?: () => void;
  onOpenAdvantages?: () => void;
}

type NavKey = 'beranda' | 'kenali' | 'keunggulan' | 'harga';

const keyForPath = (pathname: string): NavKey => {
  if (pathname === '/keunggulan') return 'keunggulan';
  if (pathname === '/fitur') return 'kenali';
  if (pathname === '/harga') return 'harga';
  return 'beranda';
};

// Halaman yang latar atasnya TERANG: nav transparan (teks putih) tidak
// terbaca pada scroll 0 — nav harus gelap sejak load di halaman ini.
// (Defect live 2026-11-26: /harga nav nyaris tak terlihat sebelum scroll.)
const LIGHT_TOP_PATHS: readonly string[] = ['/harga'];
const isLightTopPage = (pathname: string) => LIGHT_TOP_PATHS.includes(pathname);

export const ExactNavbar: React.FC<ExactNavbarProps> = ({
  onOpenAuth,
  onBackToLanding,
}) => {
  const { t, lang, setLang } = useI18n();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKey] = useState<NavKey>(() =>
    typeof window === 'undefined' ? 'beranda' : keyForPath(window.location.pathname)
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30 || isLightTopPage(window.location.pathname));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Pemilih bahasa: tutup saat klik di luar / tekan Escape (pola TopBar).
  useEffect(() => {
    if (!langOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLangOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [langOpen]);

  // Strip biru mengikuti halaman aktif — sinkron dengan setiap navigasi SPA.
  useEffect(() => {
    const sync = () => {
      setActiveKey(keyForPath(window.location.pathname));
      setIsScrolled(window.scrollY > 30 || isLightTopPage(window.location.pathname));
    };
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
            // Offset navbar 70px + tinggi banner fail-safe bila tampil
            // (perbaikan overlap 2026-11-23).
            const bannerH =
              parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                  '--ez-failsafe-banner-h'
                )
              ) || 0;
            window.scrollTo({ top: Math.max(0, top - 70 - bannerH), behavior: 'smooth' });
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
            {t('nav.home')}
          </a>
          <a href="/#fitur" onClick={goLandingSection('fitur')} className="ez-nav-link">
            {t('landing.nav_fitur')}
          </a>
          <a href="/fitur" onClick={goPage('/fitur')} className={linkCls('kenali')}>
            {t('landing.nav_kenali')}
          </a>
          <a href="/keunggulan" onClick={goPage('/keunggulan')} className={linkCls('keunggulan')}>
            {t('landing.nav_keunggulan')}
          </a>
          <a href="/harga" onClick={goPage('/harga')} className={linkCls('harga')}>
            {t('landing.nav_harga')}
          </a>
          {/* Blog tinggal di subdomain — tautan absolut */}
          <a href={getBlogBaseUrl()} className="ez-nav-link">
            Blog
          </a>
        </nav>

        {/* Right: Actions */}
        <div className="ez-nav-actions">
          {/* Pemilih bahasa publik (desktop) — pola dropdown TopBar, ringkas. */}
          <div style={{ position: 'relative' }} ref={langRef}>
            <button
              type="button"
              onClick={() => setLangOpen((open) => !open)}
              title={t('nav.pilih_bahasa')}
              aria-label={t('nav.pilih_bahasa')}
              aria-expanded={langOpen}
              style={{
                height: '34px',
                minWidth: '56px',
                padding: '0 9px',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,.35)',
                background: langOpen ? 'rgba(255,255,255,.16)' : 'transparent',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 800,
                letterSpacing: '0.03em',
              }}
            >
              {LANG_SHORT[lang]}
              <ChevronDown size={13} />
            </button>
            {langOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '168px',
                  background: '#fff',
                  borderRadius: '14px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 16px 40px rgba(15,23,42,.18)',
                  zIndex: 100,
                  overflow: 'hidden',
                  padding: '6px',
                }}
              >
                {LANG_OPTIONS.map((opt) => {
                  const isActive = opt.id === lang;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setLang(opt.id);
                        setLangOpen(false);
                      }}
                      style={{
                        width: '100%',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 10px',
                        borderRadius: '8px',
                        background: isActive ? '#eff6ff' : 'transparent',
                        border: 'none',
                        color: isActive ? '#2563eb' : '#0f172a',
                        fontSize: '12.5px',
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {opt.nativeName}
                      {isActive && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            className="ez-btn-ghost-dark"
            onClick={() => onOpenAuth('masuk')}
          >
            {t('auth.masuk')}
          </button>

          <button
            className="ez-btn-primary-pill"
            onClick={() => onOpenAuth('daftar')}
          >
            <span>{t('landing.nav_coba_gratis')}</span>
            <ArrowRight size={13.5} />
          </button>
          <button
            type="button"
            className="ez-flagship-menu-trigger"
            aria-label={mobileMenuOpen ? t('landing.nav_tutup_navigasi') : t('landing.nav_buka_navigasi')}
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
        aria-label={t('landing.nav_navigasi_utama')}
      >
        <div className="ez-flagship-menu-kicker">{t('landing.nav_explore')}</div>
        <a href="/" onClick={goPage('/')}><span>01</span> {t('nav.home')}</a>
        <a href="/#fitur" onClick={goLandingSection('fitur')}><span>02</span> {t('landing.nav_fitur_utama')}</a>
        <a href="/fitur" onClick={goPage('/fitur')}><span>03</span> {t('landing.nav_kenali')}</a>
        <a href="/keunggulan" onClick={goPage('/keunggulan')}><span>04</span> {t('landing.nav_keunggulan')}</a>
        <a href="/harga" onClick={goPage('/harga')}><span>05</span> {t('landing.nav_harga')}</a>
        <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAuth('masuk'); }}>
          {t('auth.masuk')} <ArrowRight size={16} />
        </button>
        <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAuth('daftar'); }}>
          {t('landing.nav_coba_gratis')} <ArrowRight size={16} />
        </button>
        {/* Pemilih bahasa publik (mobile) — deretan 4 bahasa, tanpa dropdown. */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '14px 0 4px',
            borderTop: '1px solid rgba(255,255,255,.14)',
            marginTop: '6px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>
            {t('nav.pilih_bahasa').toUpperCase()}
          </span>
          {LANG_OPTIONS.map((opt) => {
            const isActive = opt.id === lang;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLang(opt.id)}
                aria-pressed={isActive}
                style={{
                  padding: '7px 12px',
                  borderRadius: '999px',
                  border: isActive ? '1px solid #fff' : '1px solid rgba(255,255,255,.35)',
                  background: isActive ? '#fff' : 'transparent',
                  color: isActive ? '#0f172a' : '#fff',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {opt.nativeName}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};

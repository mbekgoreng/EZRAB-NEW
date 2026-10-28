import React, { useEffect, useRef, useState } from 'react';
import { navigateTo, paths } from '../../../routing/routes';
import { getBlogBaseUrl } from '../../../blog/site';

interface ExactFooterProps {
  // Footer mandiri: link "Tentang EZRAB" selalu ke landing page.
}

export const ExactFooter: React.FC<ExactFooterProps> = () => {
  const [lineDrawn, setLineDrawn] = useState(false);
  const footerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLineDrawn(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLineDrawn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <footer ref={footerRef} className="ez-minimal-footer">
      <div className="ez-minimal-footer-container">
        {/* Main Columns Row */}
        <div className="ez-minimal-footer-main">
          {/* Left Brand Column */}
          <div className="ez-minimal-footer-brand-col">
            <div className="ez-minimal-footer-brand-title">EZRAB</div>
            <div className="ez-minimal-footer-subhead">
              Construction Estimation Workspace
            </div>
            <p className="ez-minimal-footer-quote">
              &ldquo;Dari gambar kerja hingga keputusan proyek.&rdquo;
            </p>
            {/* Ikon sosial DIHAPUS (F6): tidak ada akun resmi EZRAB yang
                terkonfirmasi — tautan generik x.com/instagram/linkedin
                hanya menyesatkan. */}
          </div>

          {/* Navigation Links Columns */}
          <div className="ez-minimal-footer-nav-groups">
            {/* Product — hanya tautan bertarget nyata (jangkar #fitur & #harga
                ada di landing; tautan mati #integrasi dihapus — F6) */}
            <div className="ez-minimal-footer-col">
              <h4 className="ez-minimal-footer-col-title">Product</h4>
              <ul className="ez-minimal-footer-links">
                <li><a href="#fitur">Fitur</a></li>
                <li><a href="#harga">Harga</a></li>
              </ul>
            </div>

            {/* Perusahaan — tautan mati #karier & #kontak dihapus (F6) */}
            <div className="ez-minimal-footer-col">
              <h4 className="ez-minimal-footer-col-title">Perusahaan</h4>
              <ul className="ez-minimal-footer-links">
                <li>
                  <a
                    href="/about"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(paths.about());
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Tentang EZRAB
                  </a>
                </li>
              </ul>
            </div>

            {/* Sumber Daya — FAQ menuju bagian FAQ di halaman /fitur;
                tautan mati #panduan & #dukungan dihapus (F6) */}
            <div className="ez-minimal-footer-col">
              <h4 className="ez-minimal-footer-col-title">Sumber Daya</h4>
              <ul className="ez-minimal-footer-links">
                <li>
                  {/* Blog tinggal di subdomain — tautan absolut, tanpa SPA navigate */}
                  <a href={getBlogBaseUrl()}>Blog</a>
                </li>
                <li>
                  <a
                    href="/fitur#faq"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo('/fitur');
                      window.setTimeout(() => {
                        document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' });
                      }, 250);
                    }}
                  >
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom divider: Very thin #E2E8F0 line */}
        <div className="ez-minimal-footer-divider" />

        {/* Bottom Bar */}
        <div className="ez-minimal-footer-bottom">
          <div className="ez-minimal-footer-copyright-group">
            <span className="ez-copy-brand">© 2026 EZRAB</span>
            <span className="ez-copy-tagline">Built for better estimating.</span>
          </div>

          <div className="ez-minimal-footer-legal-group">
            <a
              href="/privacy"
              className="ez-legal-link"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/privacy');
                window.scrollTo({ top: 0 });
              }}
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="ez-legal-link"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/terms');
                window.scrollTo({ top: 0 });
              }}
            >
              Terms of Service
            </a>
          </div>
        </div>

        {/* Very subtle architectural blueprint line near bottom edge (draws itself once) */}
        <div className="ez-minimal-footer-blueprint-track">
          <svg
            className={`ez-blueprint-drawing-svg ${lineDrawn ? 'is-drawn' : ''}`}
            viewBox="0 0 1200 12"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Main continuous dimension baseline */}
            <line
              x1="0"
              y1="6"
              x2="1200"
              y2="6"
              className="ez-blueprint-path-main"
            />
            {/* Architectural dimension ticks */}
            <line x1="2" y1="1" x2="2" y2="11" className="ez-blueprint-tick" />
            <line x1="300" y1="3" x2="300" y2="9" className="ez-blueprint-tick" />
            <line x1="600" y1="1" x2="600" y2="11" className="ez-blueprint-tick" />
            <line x1="900" y1="3" x2="900" y2="9" className="ez-blueprint-tick" />
            <line x1="1198" y1="1" x2="1198" y2="11" className="ez-blueprint-tick" />
          </svg>
        </div>
      </div>
    </footer>
  );
};

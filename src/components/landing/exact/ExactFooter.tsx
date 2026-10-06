import React, { useEffect, useRef, useState } from 'react';

interface ExactFooterProps {
  onOpenAbout?: () => void;
}

export const ExactFooter: React.FC<ExactFooterProps> = ({ onOpenAbout }) => {
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

            {/* Social Icons: Minimal Outlined Buttons */}
            <div className="ez-minimal-footer-socials">
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ez-minimal-social-btn"
                aria-label="X"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>

              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ez-minimal-social-btn"
                aria-label="Instagram"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                </svg>
              </a>

              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ez-minimal-social-btn"
                aria-label="LinkedIn"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                  <rect width="4" height="12" x="2" y="9" />
                  <circle cx="4" cy="4" r="2" />
                </svg>
              </a>
            </div>
          </div>

          {/* Navigation Links Columns */}
          <div className="ez-minimal-footer-nav-groups">
            {/* Product */}
            <div className="ez-minimal-footer-col">
              <h4 className="ez-minimal-footer-col-title">Product</h4>
              <ul className="ez-minimal-footer-links">
                <li><a href="#fitur">Fitur</a></li>
                <li><a href="#harga">Harga</a></li>
                <li><a href="#integrasi">Integrasi</a></li>
              </ul>
            </div>

            {/* Perusahaan */}
            <div className="ez-minimal-footer-col">
              <h4 className="ez-minimal-footer-col-title">Perusahaan</h4>
              <ul className="ez-minimal-footer-links">
                <li>
                  <a
                    href="#tentang"
                    onClick={(e) => {
                      if (onOpenAbout) {
                        e.preventDefault();
                        onOpenAbout();
                      }
                    }}
                  >
                    Tentang EZRAB
                  </a>
                </li>
                <li><a href="#karier">Karier</a></li>
                <li><a href="#kontak">Kontak</a></li>
              </ul>
            </div>

            {/* Sumber Daya */}
            <div className="ez-minimal-footer-col">
              <h4 className="ez-minimal-footer-col-title">Sumber Daya</h4>
              <ul className="ez-minimal-footer-links">
                <li><a href="#faq">FAQ</a></li>
                <li><a href="#panduan">Panduan</a></li>
                <li><a href="#dukungan">Dukungan</a></li>
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
            <a href="#privacy" className="ez-legal-link">Privacy Policy</a>
            <a href="#terms" className="ez-legal-link">Terms of Service</a>
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

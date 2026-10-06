import React, { useEffect, useRef, useState } from 'react';

interface ExactFinalCtaProps {
  onStartFree?: () => void;
  onOpenDemo?: () => void;
}

export const ExactFinalCta: React.FC<ExactFinalCtaProps> = ({ onStartFree }) => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
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
      className={`ez-luxury-cta-section ${isVisible ? 'is-revealed' : ''}`}
      id="cta"
    >
      {/* Deep Navy / Electric-Blue Ambient Glow */}
      <div className="ez-luxury-cta-ambient-glow" />

      {/* Extremely subtle animated architectural blueprint lines in the background */}
      <svg
        className="ez-luxury-cta-blueprint-bg"
        viewBox="0 0 1440 460"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern id="ctaBlueprintCadGrid" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(56, 189, 248, 0.05)" strokeWidth="0.8" />
            <circle cx="64" cy="0" r="1" fill="rgba(56, 189, 248, 0.12)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ctaBlueprintCadGrid)" />

        {/* Delicate structural axes & CAD alignment lines */}
        <line x1="100" y1="80" x2="1340" y2="80" stroke="rgba(56, 189, 248, 0.09)" strokeDasharray="6 8" strokeWidth="1" />
        <line x1="100" y1="380" x2="1340" y2="380" stroke="rgba(56, 189, 248, 0.09)" strokeDasharray="6 8" strokeWidth="1" />
        <line x1="260" y1="30" x2="260" y2="430" stroke="rgba(56, 189, 248, 0.06)" strokeDasharray="4 8" strokeWidth="1" />
        <line x1="1180" y1="30" x2="1180" y2="430" stroke="rgba(56, 189, 248, 0.06)" strokeDasharray="4 8" strokeWidth="1" />

        {/* Diagonal architectural drafting perspective guides */}
        <line x1="0" y1="460" x2="420" y2="230" stroke="rgba(56, 189, 248, 0.04)" strokeDasharray="3 9" strokeWidth="1" />
        <line x1="1440" y1="460" x2="1020" y2="230" stroke="rgba(56, 189, 248, 0.04)" strokeDasharray="3 9" strokeWidth="1" />
      </svg>

      <div className="ez-luxury-cta-container">
        <h2 className="ez-luxury-cta-heading">
          Siap membuat workflow estimasi yang lebih terhubung?
        </h2>

        <p className="ez-luxury-cta-subtext">
          Dari gambar kerja hingga laporan proyek, kelola semuanya dalam satu workspace.
        </p>

        <div className="ez-luxury-cta-action">
          <button
            onClick={onStartFree}
            className="ez-luxury-cta-primary-btn"
            aria-label="Mulai Gratis"
          >
            <span>Mulai Gratis</span>
            <span className="ez-luxury-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
};

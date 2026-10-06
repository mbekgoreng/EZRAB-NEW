import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Layers } from 'lucide-react';

interface AboutCtaSectionProps {
  onStartFree: () => void;
  onViewFeatures: () => void;
}

export const AboutCtaSection: React.FC<AboutCtaSectionProps> = ({
  onStartFree,
  onViewFeatures,
}) => {
  return (
    <section className="ez-about-cta-section" id="final-cta">
      {/* Background Architectural Wireframe from repository */}
      <img
        src="/images/about/about_wireframe_philosophy.png"
        alt="Architectural Blueprint Frame"
        className="ez-about-cta-wireframe-bg"
        loading="lazy"
      />

      <div className="ez-about-cta-container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="ez-about-cta-headline">
            Bangun workflow<br />
            estimasi Anda bersama EZRAB.
          </h2>

          <p className="ez-about-cta-subhead">
            Mulai dari proyek pertama Anda hari ini. Rasakan kemudahan perhitungan konstruksi yang terintegrasi.
          </p>

          <div className="ez-about-cta-buttons">
            <button
              onClick={onStartFree}
              className="ez-about-btn-primary"
              aria-label="Mulai Gratis"
            >
              <span>Mulai Gratis</span>
              <ArrowRight size={17} />
            </button>

            <button
              onClick={onViewFeatures}
              className="ez-about-btn-secondary"
              aria-label="Lihat Fitur"
            >
              <Layers size={16} />
              <span>Lihat Fitur</span>
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

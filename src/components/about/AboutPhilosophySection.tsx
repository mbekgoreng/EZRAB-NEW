import React from 'react';
import { motion } from 'framer-motion';

export const AboutPhilosophySection: React.FC = () => {
  return (
    <section className="ez-about-philosophy-section" id="philosophy">
      {/* Background Architectural Wireframe Image from Asset Repository */}
      <img
        src="/images/about/about_wireframe_philosophy.png"
        alt="EZRAB Architectural Wireframe"
        className="ez-about-philosophy-wireframe-bg"
        loading="lazy"
      />

      <div className="ez-about-philosophy-container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ez-about-philosophy-tag">
            FILOSOFI PRODUK
          </div>

          <h2 className="ez-about-philosophy-headline">
            Software konstruksi<br />
            tidak seharusnya<br />
            membuat pekerjaan<br />
            menjadi lebih rumit.
          </h2>

          <p className="ez-about-philosophy-subhead">
            EZRAB dibangun untuk menyederhanakan perhitungan estimasi yang rumit menjadi alur kerja yang jernih, terstruktur, dan terhubung — memberikan Anda ketenangan pikiran dalam setiap angka penawaran.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export const AboutAiSection: React.FC = () => {
  return (
    <section className="ez-about-ai-section" id="ai">
      <div className="ez-about-ai-container">
        {/* Left: Copy & 3 Professional Stages */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ez-about-hero-tag">
            <Sparkles size={13} />
            <span>EZRAB MAGIC AI</span>
          </div>

          <h2 className="ez-about-ai-headline">
            AI untuk mempercepat.<br />
            Anda tetap memegang kendali.
          </h2>

          <p className="ez-about-ai-subhead">
            EZRAB memosisikan AI sebagai akselerator cerdas: membantu membaca gambar kerja, mengenali elemen struktur, dan menyusun draft awal estimasi. Seluruh perhitungan numerik tetap dieksekusi oleh mesin kalkulasi deterministik yang transparan dan dapat diaudit.
          </p>

          <div className="ez-about-ai-stages-list">
            {/* Stage 01: READ */}
            <motion.div
              className="ez-about-ai-stage-card"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <span className="ez-about-ai-stage-tag">01 READ</span>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 750, color: '#FFFFFF', marginBottom: '4px' }}>
                  Membaca Gambar & Denah CAD/PDF
                </h4>
                <p style={{ fontSize: '13.5px', color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
                  Memindai lembar gambar kerja, layer denah, dan teks notasi elevasi untuk mengekstrak parameter fisik bangunan secara cepat.
                </p>
              </div>
            </motion.div>

            {/* Stage 02: ASSIST */}
            <motion.div
              className="ez-about-ai-stage-card"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <span className="ez-about-ai-stage-tag">02 ASSIST</span>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 750, color: '#FFFFFF', marginBottom: '4px' }}>
                  Identifikasi Pekerjaan & Draft QTO
                </h4>
                <p style={{ fontSize: '13.5px', color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
                  Menyarankan item pekerjaan (pondasi, kolom, dinding, atap) dan memetakan volume ke kode AHSP standar yang sesuai.
                </p>
              </div>
            </motion.div>

            {/* Stage 03: REVIEW */}
            <motion.div
              className="ez-about-ai-stage-card"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <span className="ez-about-ai-stage-tag">03 REVIEW</span>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 750, color: '#FFFFFF', marginBottom: '4px' }}>
                  Verifikasi Penuh oleh Estimator
                </h4>
                <p style={{ fontSize: '13.5px', color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
                  Setiap angka, koefisien, dan harga satuan dapat ditinjau dan disesuaikan langsung oleh tim estimator sebelum penerbitan dokumen resmi.
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Right: Dedicated visual column showcasing the full background graphics */}
        <div className="ez-about-ai-visual-space" aria-hidden="true" />
      </div>
    </section>
  );
};

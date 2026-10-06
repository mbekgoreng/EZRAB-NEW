import React from 'react';
import { motion } from 'framer-motion';
import { Layers, Sparkles, CheckCircle2 } from 'lucide-react';

const CONVERGING_ITEMS = [
  'Gambar kerja CAD / PDF',
  'Spreadsheet Excel',
  'Perhitungan Volume QTO',
  'Standar AHSP PUPR',
  'Harga Bahan & Upah',
  'RAB Terkalkulasi',
  'BOQ Resmi',
  'Kurva S & Laporan',
];

export const AboutWhySection: React.FC = () => {
  return (
    <section className="ez-about-why-section" id="why">
      {/* 1. Full-Bleed Minimalist UI Scene Background from repository */}
      <div className="ez-about-why-bg-layer">
        <img
          src="/images/about/about_workspace_converge.jpg"
          alt="EZRAB Digital Unified Workspace Scene"
          className="ez-about-why-bg-img"
          loading="lazy"
        />
        {/* Soft Scrim Gradient: Clean white on left for text readability, open on right for the 3D monitor */}
        <div className="ez-about-why-bg-scrim" />
        <div className="ez-about-why-bg-top-fade" />
        <div className="ez-about-why-bg-bottom-fade" />
      </div>

      <div className="ez-about-why-container">
        {/* Left: Editorial Copy */}
        <motion.div
          className="ez-about-why-copy"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ez-about-section-tag-light">
            <Layers size={13} />
            <span>MENGAPA EZRAB</span>
          </div>

          <h2 className="ez-about-why-headline">
            Karena estimasi proyek seharusnya tidak terasa seperti mengelola puluhan file.
          </h2>

          <div className="ez-about-why-list">
            {CONVERGING_ITEMS.map((item, idx) => (
              <motion.span
                key={item}
                className="ez-about-why-pill"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
              >
                {item}
              </motion.span>
            ))}
          </div>

          <div className="ez-about-why-punchline">
            EZRAB menyatukan seluruh proses estimasi ke dalam satu workspace terpadu yang terhubung dan transparan.
          </div>
        </motion.div>

        {/* Right: Floating Glass Convergence HUD that complements the background 3D workstation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ez-about-why-hud-box">
            <div className="ez-about-why-hud-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="#2563EB" />
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0B1B33' }}>
                  CONVERGED WORKSPACE
                </span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', fontFamily: 'monospace' }}>
                SINGLE TRUTH
              </span>
            </div>

            <div className="ez-about-why-converge-list">
              <div className="ez-about-why-converge-row">
                <span>Gambar Kerja DWG & PDF</span>
                <b>TERHUBUNG</b>
              </div>
              <div className="ez-about-why-converge-row">
                <span>Perhitungan Volume QTO</span>
                <b>OTOMATIS</b>
              </div>
              <div className="ez-about-why-converge-row">
                <span>Database AHSP PUPR</span>
                <b>SINKRON</b>
              </div>
              <div className="ez-about-why-converge-row">
                <span>RAB & BOQ Real-Time</span>
                <b>TERVALIDASI</b>
              </div>
            </div>

            <div className="ez-about-why-hud-footer">
              <CheckCircle2 size={14} color="#10B981" />
              <span>Semua data saling memperbarui tanpa rumus putus.</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

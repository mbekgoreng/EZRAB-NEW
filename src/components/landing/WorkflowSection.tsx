import React from 'react';
import { ArrowDown, Cpu, CheckCircle2, Calculator, Layers, FileSpreadsheet, Lock } from 'lucide-react';

export const WorkflowSection: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Input Dokumen Proyek',
      desc: 'Masukkan prompt bahasa natural, upload gambar denah 2D, file CAD DED, atau dokumen penawaran PDF/Excel.',
      badge: 'Multi-Modal Input',
    },
    {
      num: '02',
      title: 'AI Parsing & Structured JSON',
      desc: 'Model AI mengekstrak entitas konstruksi menjadi format JSON terstruktur dengan validasi ketat schema data.',
      badge: 'Schema Validation',
    },
    {
      num: '03',
      title: 'Pencocokan AHSP & Database Harga',
      desc: 'Sistem mencocokkan setiap item dengan katalog AHSP PUPR 2026 serta database harga material dan upah wilayah setempat.',
      badge: 'AHSP 2026 Matcher',
    },
    {
      num: '04',
      title: 'Kalkulasi Deterministik & Spreadsheet',
      desc: 'Mesin matematika presisi menghitung total anggaran, PPN, overhead, dan menyusun lembar kerja siap ekspor.',
      badge: 'Zero Float Error',
    },
  ];

  return (
    <section id="workflow" style={{ padding: '100px 0', background: 'var(--ezrab-surface)', borderTop: '1px solid var(--ezrab-border)', borderBottom: '1px solid var(--ezrab-border)' }}>
      <div className="ezrab-container">
        <div style={{ textAlign: 'center', marginBottom: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="ezrab-section-tag">
            <Lock size={14} />
            <span>Arsitektur Deterministik</span>
          </div>
          <h2 className="ezrab-section-title">Bagaimana EZRAB Menjamin Akurasi 100%</h2>
          <p className="ezrab-section-desc">
            Kami tidak membiarkan AI mengarang angka finansial secara bebas. AI bertindak sebagai penerjemah spesifikasi teknis, sedangkan angka dihitung oleh mesin kalkulasi deterministik.
          </p>
        </div>

        {/* Pipeline Diagram Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '20px',
            position: 'relative',
          }}
        >
          {steps.map((step, idx) => (
            <div
              key={idx}
              style={{
                background: 'var(--ezrab-bg)',
                border: '1px solid var(--ezrab-border)',
                borderRadius: 'var(--ezrab-radius-md)',
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ezrab-blue)', fontFamily: 'JetBrains Mono' }}>
                  {step.num}
                </span>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    color: 'var(--ezrab-blue)',
                    background: 'var(--ezrab-blue-soft)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {step.badge}
                </span>
              </div>

              <h4 style={{ fontSize: '17px', fontWeight: 750, color: 'var(--ezrab-text)', marginBottom: '10px' }}>
                {step.title}
              </h4>

              <p style={{ fontSize: '13.5px', color: 'var(--ezrab-text-secondary)', lineHeight: 1.6 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

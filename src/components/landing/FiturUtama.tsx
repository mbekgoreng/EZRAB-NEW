import React from 'react';
import {
  Sparkles,
  Calculator,
  FileSpreadsheet,
  Database,
  Layers,
  FolderGit2,
  FileText,
  Palette,
} from 'lucide-react';

export const FiturUtama: React.FC = () => {
  const features = [
    {
      icon: Sparkles,
      title: 'AI Estimation',
      desc: 'Import gambar/PDF, Text to RAB, AI analysis.',
    },
    {
      icon: Calculator,
      title: 'Manual Calculation',
      desc: 'Perhitungan manual lengkap dengan rumus standar.',
    },
    {
      icon: FileSpreadsheet,
      title: 'Import RAB',
      desc: 'Excel, PDF, CSV, ke tabel EZRAB.',
    },
    {
      icon: Database,
      title: 'AHSP 2026',
      desc: 'Database resmi terbaru.',
    },
    {
      icon: Layers,
      title: 'Material Database',
      desc: 'Material, alat, upah harga 2026.',
    },
    {
      icon: FolderGit2,
      title: 'Project Management',
      desc: 'Kolaborasi, tim, dan dokumen.',
    },
    {
      icon: FileText,
      title: 'Laporan & Export',
      desc: 'RAB, QTO, Kurva S, PDF/Excel.',
    },
    {
      icon: Palette,
      title: 'Custom Theme',
      desc: 'Light/Dark, warna, layout, dan animasi.',
    },
  ];

  return (
    <section id="fitur" style={{ padding: '80px 0', background: 'var(--ezrab-surface)' }}>
      <div className="ezrab-container">
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--ezrab-text)', letterSpacing: '-0.03em', marginBottom: '8px' }}>
            Fitur Utama
          </h2>
          <p style={{ fontSize: '15px', color: 'var(--ezrab-text-secondary)' }}>
            Semua yang Anda butuhkan dalam satu platform.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
          }}
        >
          {features.map(({ icon: Icon, title, desc }, idx) => (
            <div
              key={idx}
              style={{
                background: 'var(--ezrab-bg)',
                border: '1px solid var(--ezrab-border)',
                borderRadius: 'var(--ezrab-radius-md)',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--ezrab-blue-border)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--ezrab-shadow-md)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--ezrab-border)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#ffffff',
                  border: '1px solid var(--ezrab-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ezrab-blue)',
                  boxShadow: 'var(--ezrab-shadow-sm)',
                }}
              >
                <Icon size={19} />
              </div>

              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--ezrab-text)', marginBottom: '4px' }}>
                  {title}
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--ezrab-text-secondary)', lineHeight: 1.5 }}>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

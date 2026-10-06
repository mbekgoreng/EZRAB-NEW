import React from 'react';
import {
  Calculator,
  Layers,
  Database,
  FileSpreadsheet,
  FolderGit2,
  FileText,
  ArrowRight,
} from 'lucide-react';

interface FeatureShowcaseSectionProps {
  onExploreFeatures?: () => void;
}

export const FeatureShowcaseSection: React.FC<FeatureShowcaseSectionProps> = ({
  onExploreFeatures,
}) => {
  const features = [
    {
      icon: Calculator,
      title: 'RAB Otomatis',
      desc: 'Hitung RAB secara cepat dan sistematis dengan struktur baku standar nasional.',
      iconBg: '#eff6ff',
      iconColor: '#2563eb',
    },
    {
      icon: Layers,
      title: 'QTO',
      desc: 'Quantity Take Off otomatis dari gambar kerja, denah 2D, dan file CAD DED.',
      iconBg: '#eff6ff',
      iconColor: '#2563eb',
    },
    {
      icon: Database,
      title: 'AHSP 2026',
      desc: 'Database harga dan analisa kelayakan resmi PUPR Bina Marga, Cipta Karya & SDA.',
      iconBg: '#eff6ff',
      iconColor: '#2563eb',
    },
    {
      icon: FileSpreadsheet,
      title: 'BOQ',
      desc: 'Output RAB dalam format standar proyek (Bill of Quantities) siap tender.',
      iconBg: '#eff6ff',
      iconColor: '#2563eb',
    },
    {
      icon: FolderGit2,
      title: 'Template Proyek',
      desc: 'Berbagai template lengkap sesuai standar Kementerian PUPR siap pakai.',
      iconBg: '#eff6ff',
      iconColor: '#2563eb',
    },
    {
      icon: FileText,
      title: 'Ekspor Excel & PDF',
      desc: 'Siap digunakan dan dicetak dengan layout profesional, kop surat & formula utuh.',
      iconBg: '#eff6ff',
      iconColor: '#2563eb',
    },
  ];

  return (
    <section
      id="fitur-estimasi"
      style={{
        padding: '90px 0',
        background: '#ffffff',
        borderTop: '1px solid #f1f5f9',
        borderBottom: '1px solid #f1f5f9',
      }}
    >
      <div className="ezrab-container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 380px) 1fr',
            gap: '50px',
            alignItems: 'flex-start',
          }}
          className="feature-showcase-grid"
        >
          {/* Left Column: Heading, description & CTA button */}
          <div style={{ position: 'sticky', top: '100px' }}>
            <h2
              style={{
                fontSize: 'clamp(28px, 3vw, 36px)',
                fontWeight: 800,
                color: '#0f172a',
                lineHeight: 1.2,
                letterSpacing: '-0.03em',
                marginBottom: '18px',
              }}
            >
              Semua yang Anda Butuhkan untuk Estimasi Proyek
            </h2>

            <p
              style={{
                fontSize: '15px',
                color: '#64748b',
                lineHeight: 1.7,
                marginBottom: '32px',
              }}
            >
              EZRAB bukan sekadar kalkulator RAB. Ini adalah platform lengkap yang dirancang
              untuk mempermudah setiap tahap estimasi biaya konstruksi, dari awal hingga akhir.
            </p>

            <button
              onClick={onExploreFeatures}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 24px',
                borderRadius: '9999px',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '14.5px',
                fontWeight: 650,
                cursor: 'pointer',
                boxShadow: '0 6px 18px -2px rgba(37, 99, 235, 0.35)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1d4ed8';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2563eb';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span>Jelajahi Fitur</span>
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Right Column: 6 Cards in 2 or 3 columns */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '20px',
            }}
          >
            {features.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '24px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#bfdbfe';
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 12px 28px -4px rgba(37, 99, 235, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      background: item.iconBg,
                      color: item.iconColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #dbeafe',
                    }}
                  >
                    <Icon size={20} />
                  </div>

                  <div>
                    <h3
                      style={{
                        fontSize: '16px',
                        fontWeight: 750,
                        color: '#0f172a',
                        marginBottom: '6px',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {item.title}
                    </h3>
                    <p
                      style={{
                        fontSize: '13px',
                        color: '#64748b',
                        lineHeight: 1.55,
                      }}
                    >
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .feature-showcase-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
        }
      `}</style>
    </section>
  );
};

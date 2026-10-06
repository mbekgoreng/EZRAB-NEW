import React from 'react';
import {
  FileText,
  Building2,
  Droplets,
  ShieldCheck,
  LayoutGrid,
  ArrowRight,
} from 'lucide-react';

export const AhspSupportBar: React.FC = () => {
  const categories = [
    { label: 'Cipta Karya', icon: Building2 },
    { label: 'Bina Marga', icon: FileText },
    { label: 'Sumber Daya Air', icon: Droplets },
    { label: 'SMKK K3 Konstruksi', icon: ShieldCheck },
    { label: 'Kategori Lainnya', icon: LayoutGrid },
  ];

  return (
    <div
      style={{
        padding: '24px 0 36px 0',
        borderTop: '1px solid rgba(226, 232, 240, 0.6)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.6)',
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="ezrab-container">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px',
          }}
          className="ahsp-bar-container"
        >
          {/* Left Title */}
          <div
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              color: '#334155',
              whiteSpace: 'nowrap',
            }}
          >
            Didukung oleh <span style={{ color: '#0f172a' }}>AHSP 2026 Terbaru</span>
          </div>

          {/* Middle Category Badges */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              flexWrap: 'wrap',
            }}
            className="ahsp-categories-row"
          >
            {categories.map(({ label, icon: Icon }, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#64748b',
                  cursor: 'pointer',
                  transition: 'color 0.2s ease, transform 0.2s ease',
                  padding: '4px 6px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Icon size={16} color="currentColor" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* Right Slogan Link */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12.5px',
              fontWeight: 500,
              color: '#64748b',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <span>Teknologi untuk pembangunan yang lebih baik</span>
            <ArrowRight size={13} />
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .ahsp-bar-container {
            justifyContent: center !important;
            text-align: center;
          }
          .ahsp-categories-row {
            justifyContent: center !important;
          }
        }
      `}</style>
    </div>
  );
};

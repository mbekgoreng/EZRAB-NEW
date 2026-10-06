import React from 'react';
import { Building, Building2, Milestone, Navigation, Waves, ArrowRight, Sparkles } from 'lucide-react';
import templatePerumahan from '../../assets/template-perumahan.jpg';
import templateBertingkat from '../../assets/template-bertingkat.jpg';
import templateJembatan from '../../assets/template-jembatan.jpg';
import templateJalan from '../../assets/template-jalan.jpg';
import templateBangunanAir from '../../assets/template-bangunan-air.jpg';

interface ProjectTemplatesSectionProps {
  onSelectTemplate?: (templateName: string) => void;
  onViewAll?: () => void;
}

export const ProjectTemplatesSection: React.FC<ProjectTemplatesSectionProps> = ({
  onSelectTemplate,
  onViewAll,
}) => {
  const templates = [
    {
      id: 'perumahan',
      title: 'Gedung Perumahan',
      subtitle: 'Template RAB & DED',
      badge: 'Residensial',
      icon: Building,
      img: templatePerumahan,
      color: '#2563eb',
    },
    {
      id: 'bertingkat',
      title: 'Gedung Bertingkat',
      subtitle: 'Template RAB & DED',
      badge: 'Komersial & Kantor',
      icon: Building2,
      img: templateBertingkat,
      color: '#0284c7',
    },
    {
      id: 'jembatan',
      title: 'Jembatan',
      subtitle: 'Template RAB & DED',
      badge: 'Bina Marga PUPR',
      icon: Milestone,
      img: templateJembatan,
      color: '#7c3aed',
    },
    {
      id: 'jalan',
      title: 'Jalan',
      subtitle: 'Template RAB & DED',
      badge: 'Perkerasan Lentur/Kaku',
      icon: Navigation,
      img: templateJalan,
      color: '#059669',
    },
    {
      id: 'bangunan-air',
      title: 'Bangunan Air',
      subtitle: 'Template RAB & DED',
      badge: 'Irigasi & Drainase SDA',
      icon: Waves,
      img: templateBangunanAir,
      color: '#0891b2',
    },
  ];

  return (
    <section
      id="template-proyek"
      style={{
        padding: '90px 0',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <div className="ezrab-container">
        {/* Header with Title and "Lihat Semua Template ->" */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px',
            marginBottom: '40px',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#eff6ff',
                border: '1px solid #dbeafe',
                color: '#2563eb',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '12px',
              }}
            >
              <Sparkles size={13} />
              <span>Template Proyek</span>
            </div>

            <h2
              style={{
                fontSize: 'clamp(28px, 3.2vw, 36px)',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.03em',
                lineHeight: 1.2,
                marginBottom: '8px',
              }}
            >
              Siap untuk Berbagai Jenis Proyek
            </h2>

            <p style={{ fontSize: '15px', color: '#64748b' }}>
              Gunakan template sesuai kebutuhan proyek Anda, mulai dari gedung, jalan, jembatan, hingga bangunan air.
            </p>
          </div>

          <button
            onClick={onViewAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 22px',
              borderRadius: '9999px',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 650,
              cursor: 'pointer',
              boxShadow: '0 4px 14px -2px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.2s',
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
            <span>Lihat Semua Template</span>
            <ArrowRight size={15} />
          </button>
        </div>

        {/* 5 Template Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '18px',
          }}
        >
          {templates.map((tmpl) => {
            const Icon = tmpl.icon;
            return (
              <div
                key={tmpl.id}
                onClick={() => onSelectTemplate?.(tmpl.title)}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.borderColor = '#bfdbfe';
                  e.currentTarget.style.boxShadow = '0 16px 36px -4px rgba(37, 99, 235, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Visual Thumbnail */}
                <div
                  style={{
                    position: 'relative',
                    height: '140px',
                    overflow: 'hidden',
                    background: '#f1f5f9',
                  }}
                >
                  <img
                    src={tmpl.img}
                    alt={tmpl.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'transform 0.4s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1.0)')}
                  />

                  {/* Icon Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.92)',
                      backdropFilter: 'blur(4px)',
                      color: tmpl.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                    }}
                  >
                    <Icon size={16} />
                  </div>
                </div>

                {/* Info Content */}
                <div style={{ padding: '16px 14px' }}>
                  <h4
                    style={{
                      fontSize: '15px',
                      fontWeight: 750,
                      color: '#0f172a',
                      marginBottom: '3px',
                    }}
                  >
                    {tmpl.title}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                    {tmpl.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

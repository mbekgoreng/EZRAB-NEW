import React from 'react';
import {
  Plus,
  ChevronRight,
  Upload,
  Calculator,
  Shield,
  Folder,
  Clock,
  CheckCircle2,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { useI18n } from '../../i18n';
import { EZRABMascot3D } from '../mascot/EZRABMascot3D';

interface EzrabAiDashboardViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onSelectProject: (projectId: string, menu?: string) => void;
  onNavigateToTab: (tab: string, projectId?: string | null) => void;
  onOpenMagicAi: (mode?: 'chat' | 'ded-rab') => void;
  onOpenSubscription: () => void;
  onResetData?: () => void;
  onOpenOnboarding?: () => void;
}

const formatProjectDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
};

export const EzrabAiDashboardView: React.FC<EzrabAiDashboardViewProps> = ({
  projects,
  onCreateProject,
  onSelectProject,
  onNavigateToTab,
  onOpenMagicAi,
}) => {
  const { currentProject, setCurrentProjectId } = useProject();
  const { t } = useI18n();

  // Dynamic time-based greeting (localized)
  const getLocalizedGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) {
      return t('dashboard.pagi');
    } else if (hour >= 11 && hour < 15) {
      return t('dashboard.siang');
    } else if (hour >= 15 && hour < 18) {
      return t('dashboard.sore');
    } else {
      return t('dashboard.malam');
    }
  };

  // Dynamic genuine project metrics
  const totalProjects = projects.length;
  const inProgressProjects = projects.filter((p) => p.status === 'in_progress').length;
  const completedProjects = projects.filter(
    (p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED'
  ).length;
  const draftProjects = projects.filter(
    (p) => p.status === 'draft' || !p.status || p.status === 'DRAFT'
  ).length;

  const latestProject = currentProject || (projects.length > 0 ? projects[0] : null);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'in_progress':
        return {
          label: t('dashboard.status_aktif'),
          bg: '#EFF6FF',
          color: '#2563EB',
          border: '#DBEAFE',
        };
      case 'completed':
      case 'approved':
      case 'COMPLETED':
        return {
          label: t('dashboard.status_selesai'),
          bg: '#F0FDF4',
          color: '#16A34A',
          border: '#DCFCE7',
        };
      case 'archived':
        return {
          label: t('dashboard.status_arsip'),
          bg: '#F1F5F9',
          color: '#64748B',
          border: '#E2E8F0',
        };
      default:
        return {
          label: t('dashboard.status_draft'),
          bg: '#FFFBEB',
          color: '#D97706',
          border: '#FEF3C7',
        };
    }
  };

  return (
    <div
      className="ezrab-dashboard-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        maxWidth: '1440px',
        margin: '0 auto',
        width: '100%',
        color: '#0F172A',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* =========================================================================
          1. HERO AREA — COMMAND CENTER WITH 3D MASCOT & HANDWRITTEN ANNOTATION
         ========================================================================= */}
      <section
        className="ezrab-dashboard-hero"
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 55%, #EFF6FF 100%)',
          borderRadius: '20px',
          border: '1px solid #E5E7EB',
          padding: '36px 44px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          position: 'relative',
          overflow: 'visible',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '32px',
          minHeight: '280px',
        }}
      >
        {/* Ambient atmospheric glow behind mascot */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '20px',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-30%',
              right: '8%',
              width: '460px',
              height: '460px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(37,99,235,0.09) 0%, rgba(255,255,255,0) 70%)',
            }}
          />
        </div>

        {/* LEFT: Text & CTA Buttons */}
        <div className="ezrab-dashboard-hero-text" style={{ flex: 1, maxWidth: '580px', position: 'relative', zIndex: 2 }}>
          <div
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              letterSpacing: '0.01em',
              marginBottom: '10px',
            }}
          >
            <span style={{ color: '#0F172A' }}>{getLocalizedGreeting()}, </span>
            <span style={{ color: '#2563EB' }}>Ahmad</span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(28px, 3.2vw, 36px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: '#0F172A',
              lineHeight: 1.2,
              margin: '0 0 14px 0',
            }}
          >
            {t('dashboard.hero_title')}
          </h1>

          <p
            style={{
              fontSize: '14px',
              color: '#475569',
              lineHeight: 1.6,
              margin: '0 0 24px 0',
              maxWidth: '520px',
            }}
          >
            {t('dashboard.hero_sub')}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onCreateProject}
              style={{
                height: '42px',
                padding: '0 20px',
                borderRadius: '10px',
                background: '#2563EB',
                color: '#FFFFFF',
                fontSize: '13.5px',
                fontWeight: 650,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1D4ED8';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2563EB';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>{t('dashboard.buat_proyek_baru')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (latestProject) {
                  setCurrentProjectId(latestProject.id);
                  onSelectProject(latestProject.id, 'rab-estimasi');
                } else {
                  onNavigateToTab('proyek');
                }
              }}
              style={{
                height: '42px',
                padding: '0 18px',
                borderRadius: '10px',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '13.5px',
                fontWeight: 600,
                border: '1px solid #E2E8F0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F8FAFC';
                e.currentTarget.style.borderColor = '#CBD5E1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFFFFF';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <span>{t('dashboard.buka_proyek')}</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* RIGHT: Mascot Stage + Playful Cursive Annotation with Curved Arrow */}
        <div
          className="mascot-stage"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            zIndex: 2,
            width: 'clamp(280px, 26vw, 380px)',
            height: 'clamp(260px, 24vw, 360px)',
            padding: '10px',
            overflow: 'visible',
          }}
        >
          {/* Cursive handwritten annotation placed beside the mascot */}
          <div
            className="mascot-annotation-badge"
            style={{
              position: 'absolute',
              top: '36%',
              left: '-145px',
              transform: 'translateY(-50%)',
              width: '175px',
              height: '110px',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <svg width="175" height="110" viewBox="0 0 175 110" fill="none">
              <text
                x="65"
                y="28"
                textAnchor="middle"
                fill="#2563EB"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="16"
                fontWeight="700"
                transform="rotate(-3 65 28)"
              >
                Membangun
              </text>
              <text
                x="68"
                y="48"
                textAnchor="middle"
                fill="#2563EB"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="15"
                fontWeight="600"
                transform="rotate(-3 68 48)"
              >
                lebih baik bersama
              </text>
              <text
                x="72"
                y="70"
                textAnchor="middle"
                fill="#2563EB"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="17"
                fontWeight="800"
                transform="rotate(-3 72 70)"
              >
                EZRAB
              </text>
              {/* Playful curved arrow pointing right toward the mascot */}
              <path
                d="M 108 68 C 124 70, 138 76, 150 84"
                stroke="#2563EB"
                strokeWidth="2.2"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 140 85 L 151 84 L 148 74"
                stroke="#2563EB"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            <style>{`
              @media (max-width: 1120px) {
                .mascot-annotation-badge {
                  display: none !important;
                }
              }
            `}</style>
          </div>

          {/* Master 3D GLB Mascot in Dynamic 3/4 Pose with Wide Eyes */}
          <EZRABMascot3D
            variant="dashboard"
            width="100%"
            height="100%"
            enableEyeTracking={true}
            enableFloat={true}
            enableBlink={true}
            enableGlow={true}
          />
        </div>
      </section>

      {/* =========================================================================
          2. QUICK ACTIONS (4 CARDS)
         ========================================================================= */}
      <section>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 750,
            color: '#0F172A',
            margin: '0 0 14px 0',
          }}
        >
          Quick Actions
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Action 1: Buat RAB */}
          <div
            onClick={onCreateProject}
            role="button"
            tabIndex={0}
            style={{
              height: '96px',
              background: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E5E7EB',
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = '#BFDBFE';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>
                Buat RAB
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.35 }}>
                Penyusunan RAB otomatis & terstruktur
              </div>
            </div>
          </div>

          {/* Action 2: Upload DED */}
          <div
            onClick={() => onOpenMagicAi('ded-rab')}
            role="button"
            tabIndex={0}
            style={{
              height: '96px',
              background: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E5E7EB',
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = '#DDD6FE';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: '#F5F3FF',
                color: '#7C3AED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Upload size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>
                Upload DED
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.35 }}>
                Ekstraksi BoQ dari dokumen gambar teknis
              </div>
            </div>
          </div>

          {/* Action 3: Volume Calculation */}
          <div
            onClick={() => onNavigateToTab('qto-vc')}
            role="button"
            tabIndex={0}
            style={{
              height: '96px',
              background: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E5E7EB',
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = '#A7F3D0';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: '#ECFDF5',
                color: '#10B981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Calculator size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>
                Volume Calculation
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.35 }}>
                Kalkulator QTO terintegrasi standar teknis
              </div>
            </div>
          </div>

          {/* Action 4: Cari AHSP */}
          <div
            onClick={() => onNavigateToTab('ahsp-2026')}
            role="button"
            tabIndex={0}
            style={{
              height: '96px',
              background: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #E5E7EB',
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = '#FDE68A';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: '#FFFBEB',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Shield size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>
                Cari AHSP
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.35 }}>
                Database analisa PUPR 2026 terverifikasi
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. PROYEK ANDA (4 STAT METRIC CARDS WITH BALANCED ICONS)
         ========================================================================= */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 750, color: '#0F172A', margin: '0 0 2px 0' }}>
              Proyek Anda
            </h2>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              {t('dashboard.ringkasan_aktif')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToTab('proyek')}
            style={{
              fontSize: '12.5px',
              fontWeight: 650,
              color: '#2563EB',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>Semua Proyek</span>
            <ChevronRight size={14} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
          }}
        >
          {/* Card 1: Total Proyek */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>
                {totalProjects}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 550, color: '#64748B', marginTop: '4px' }}>
                Total Proyek
              </div>
            </div>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Folder size={18} />
            </div>
          </div>

          {/* Card 2: Sedang Dikerjakan */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#2563EB', lineHeight: 1.1 }}>
                {inProgressProjects}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 550, color: '#64748B', marginTop: '4px' }}>
                Sedang Dikerjakan
              </div>
            </div>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={18} />
            </div>
          </div>

          {/* Card 3: Selesai */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#16A34A', lineHeight: 1.1 }}>
                {completedProjects}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 550, color: '#64748B', marginTop: '4px' }}>
                Selesai
              </div>
            </div>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: '#ECFDF5',
                color: '#16A34A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={18} />
            </div>
          </div>

          {/* Card 4: Draft */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', lineHeight: 1.1 }}>
                {draftProjects}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 550, color: '#64748B', marginTop: '4px' }}>
                Draft
              </div>
            </div>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: '#FFFBEB',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={18} />
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. SPLIT GRID: DAFTAR PROYEK TERKINI (LEFT) + EZRAB INSIGHT (RIGHT)
         ========================================================================= */}
      <section
        className="ezrab-dashboard-split"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 350px',
          gap: '16px',
          alignItems: 'stretch',
        }}
      >
        {/* LEFT: Daftar Proyek Terkini Table */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 750,
              color: '#0F172A',
              margin: '0 0 16px 0',
            }}
          >
            Daftar Proyek Terkini
          </h3>

          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ color: '#64748B', fontWeight: 650, fontSize: '11px', borderBottom: '1px solid #F1F5F9' }}>
                  <th style={{ padding: '8px 12px 12px 6px', fontWeight: 650 }}>PROYEK</th>
                  <th style={{ padding: '8px 12px 12px 12px', fontWeight: 650 }}>LOKASI</th>
                  <th style={{ padding: '8px 12px 12px 12px', fontWeight: 650 }}>NILAI RAB</th>
                  <th style={{ padding: '8px 12px 12px 12px', fontWeight: 650 }}>PROGRESS</th>
                  <th style={{ padding: '8px 12px 12px 12px', fontWeight: 650 }}>STATUS</th>
                  <th style={{ padding: '8px 6px 12px 12px', fontWeight: 650 }}>UPDATED</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 3).map((proj) => {
                  const badge = getStatusBadge(proj.status);
                  const progressPct = proj.progress || 0;
                  const barColor = progressPct >= 70 ? '#10B981' : progressPct > 0 ? '#2563EB' : '#CBD5E1';

                  return (
                    <tr
                      key={proj.id}
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        onSelectProject(proj.id, 'rab-estimasi');
                      }}
                      style={{
                        borderBottom: '1px solid #F8FAFC',
                        cursor: 'pointer',
                        transition: 'background-color 0.12s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Proyek */}
                      <td style={{ padding: '14px 12px 14px 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '7px',
                              background: '#EFF6FF',
                              color: '#2563EB',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <FileText size={15} />
                          </div>
                          <span style={{ fontWeight: 650, color: '#0F172A', whiteSpace: 'nowrap' }}>
                            {proj.name}
                          </span>
                        </div>
                      </td>

                      {/* Lokasi */}
                      <td style={{ padding: '14px 12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                        {proj.location || 'Indonesia'}
                      </td>

                      {/* Nilai RAB */}
                      <td style={{ padding: '14px 12px', color: '#0F172A', fontWeight: 550, whiteSpace: 'nowrap' }}>
                        {proj.totalRab && proj.totalRab > 0
                          ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(proj.totalRab)
                          : '-'}
                      </td>

                      {/* Progress */}
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B', width: '28px' }}>
                            {progressPct}%
                          </span>
                          <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: '#F1F5F9', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${progressPct}%`,
                                height: '100%',
                                borderRadius: '3px',
                                background: barColor,
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>%</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 10px',
                            borderRadius: '999px',
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Updated */}
                      <td style={{ padding: '14px 6px 14px 12px', color: '#64748B', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                        {formatProjectDate(proj.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: EZRAB Insight Card with Mini Mascot Peeking */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
            padding: '22px 22px 18px 22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            minHeight: '210px',
          }}
        >
          {/* Header */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '7px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={16} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 750, color: '#2563EB' }}>
                EZRAB Insight
              </span>
            </div>

            <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, margin: 0, maxWidth: '200px' }}>
              3 item material pada proyek Anda memiliki potensi optimasi.
            </p>
          </div>

          {/* Bottom Action + Mini Mascot Peeking in Bottom Right Corner */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '20px' }}>
            <button
              type="button"
              onClick={() => onOpenMagicAi()}
              style={{
                height: '34px',
                padding: '0 14px',
                borderRadius: '8px',
                background: '#FFFFFF',
                color: '#2563EB',
                border: '1px solid #BFDBFE',
                fontSize: '12px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
                position: 'relative',
                zIndex: 2,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#EFF6FF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFFFFF';
              }}
            >
              <span>Lihat Analisis</span>
              <ChevronRight size={13} />
            </button>

            {/* Mini 3D mascot peeking in bottom-right corner */}
            <div
              style={{
                position: 'absolute',
                bottom: '-12px',
                right: '-8px',
                width: '120px',
                height: '110px',
                pointerEvents: 'none',
                overflow: 'hidden',
                zIndex: 1,
              }}
            >
              <div style={{ width: '130px', height: '130px', transform: 'translateY(10px)' }}>
                <EZRABMascot3D
                  variant="dashboard"
                  width="100%"
                  height="100%"
                  enableEyeTracking={true}
                  enableFloat={false}
                  enableBlink={true}
                  enableGlow={false}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. BOTTOM: AKTIVITAS TERBARU
         ========================================================================= */}
      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 24px 0' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 750, color: '#0F172A', margin: 0 }}>
          Aktivitas Terbaru
        </h2>
        <button
          type="button"
          onClick={() => onNavigateToTab('proyek')}
          style={{
            fontSize: '12.5px',
            fontWeight: 650,
            color: '#2563EB',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>Lihat Semua</span>
          <ChevronRight size={14} />
        </button>
      </section>
    </div>
  );
};

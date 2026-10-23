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
  Archive,
  Pencil,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { useI18n } from '../../i18n';
import { countUnpricedRabItems, unpricedInsightText } from '../../lib/dashboardInsight';
import { EZRABMascotLucu } from '../mascot/EZRABMascotLucu';

interface EzrabAiDashboardViewClassicProps {
  projects: Project[];
  onCreateProject: () => void;
  onSelectProject: (projectId: string, menu?: string) => void;
  onNavigateToTab: (tab: string, projectId?: string | null) => void;
  onNavigateToProjects?: (filter: string) => void;
  onOpenMagicAi: (mode?: 'chat' | 'ded-rab') => void;
  onOpenSubscription: () => void;
  onResetData?: () => void;
  onOpenOnboarding?: () => void;
  /** F1a: feed aktivitas nyata (sumber sama dengan mode Modern, dari WorkspaceView). */
  activities?: Array<{ text: string; time: string; type: string }>;
}

/** BCP47 locale untuk bahasa antarmuka yang sedang aktif. */
const localeForLang = (lang: string): string =>
  ({ id: 'id-ID', en: 'en-US', zh: 'zh-CN', ms: 'ms-MY' } as Record<string, string>)[lang] ?? 'id-ID';

const formatProjectDate = (dateStr: string | undefined, lang: string): string => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const datePart = new Intl.DateTimeFormat(localeForLang(lang), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${datePart}, ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
};

export const EzrabAiDashboardViewClassic: React.FC<EzrabAiDashboardViewClassicProps> = ({
  projects,
  onCreateProject,
  onSelectProject,
  onNavigateToTab,
  onNavigateToProjects,
  onOpenMagicAi,
  activities,
}) => {
  // Navigasi ke menu Proyek dengan filter status tertentu (fallback: tab proyek).
  const goProjects = (filter: string) => {
    if (onNavigateToProjects) onNavigateToProjects(filter);
    else onNavigateToTab('proyek');
  };

  const { currentProject, setCurrentProjectId, allRabItems } = useProject();
  const { t, lang } = useI18n();

  // F1a: Insight dari hitungan nyata; proyek terkini urut updatedAt dengan
  // fallback nilai grandTotal (sama seperti mode Modern).
  const unpricedCount = countUnpricedRabItems(allRabItems);
  const recentProjects = [...projects]
    .sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0))
    .slice(0, 3);
  const projectRabValue = (p: Project): number | null =>
    p.totalRab && p.totalRab > 0 ? p.totalRab : p.costSummary?.grandTotal || null;

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
          bg: 'var(--ez-color-primary-soft)',
          color: 'var(--ez-color-primary)',
          border: 'var(--ez-hue-blue-bg-deep)',
        };
      case 'completed':
      case 'approved':
      case 'COMPLETED':
        return {
          label: t('dashboard.status_selesai'),
          bg: 'var(--ez-color-success-soft)',
          color: 'var(--ez-color-success)',
          border: 'var(--ez-hue-green-bg-deep)',
        };
      case 'archived':
        return {
          label: t('dashboard.status_arsip'),
          bg: 'var(--ez-color-surface-secondary)',
          color: 'var(--ez-color-text-muted)',
          border: 'var(--ez-color-border)',
        };
      default:
        return {
          label: t('dashboard.status_draft'),
          bg: 'var(--ez-color-warning-soft)',
          color: 'var(--ez-color-warning)',
          border: 'var(--ez-hue-amber-bg-deep)',
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
        color: 'var(--ez-color-text-primary)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* =========================================================================
          1. HERO AREA — COMMAND CENTER WITH 3D MASCOT & HANDWRITTEN ANNOTATION
         ========================================================================= */}
      <section
        className="ezrab-dashboard-hero"
        style={{
          background: 'linear-gradient(135deg, var(--ez-color-surface) 0%, var(--ez-color-surface-secondary) 55%, var(--ez-color-primary-soft) 100%)',
          borderRadius: '22px',
          border: '1px solid var(--ez-color-border)',
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
            borderRadius: '22px',
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
            {/* F1a: sapaan netral — nama "Ahmad" hardcode dihapus. */}
            <span style={{ color: 'var(--ez-color-text-primary)' }}>{getLocalizedGreeting()}</span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(28px, 3.2vw, 36px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--ez-color-text-primary)',
              lineHeight: 1.2,
              margin: '0 0 14px 0',
            }}
          >
            {t('dashboard.hero_title')}
          </h1>

          <p
            style={{
              fontSize: '14px',
              color: 'var(--ez-color-text-secondary)',
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
                borderRadius: '12px',
                background: 'var(--ez-color-primary)',
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
                e.currentTarget.style.background = 'var(--ez-color-primary-hover)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--ez-color-primary)';
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
                borderRadius: '12px',
                background: 'var(--ez-color-surface)',
                color: 'var(--ez-color-text-primary)',
                fontSize: '13.5px',
                fontWeight: 600,
                border: '1px solid var(--ez-color-border)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ez-color-surface-secondary)';
                e.currentTarget.style.borderColor = 'var(--ez-color-border)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--ez-color-surface)';
                e.currentTarget.style.borderColor = 'var(--ez-color-border)';
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
                fill="var(--ez-color-primary)"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="16"
                fontWeight="700"
                transform="rotate(-3 65 28)"
              >
                {t('dash.hero_note_1')}
              </text>
              <text
                x="68"
                y="48"
                textAnchor="middle"
                fill="var(--ez-color-primary)"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="15"
                fontWeight="600"
                transform="rotate(-3 68 48)"
              >
                {t('dash.hero_note_2')}
              </text>
              <text
                x="72"
                y="70"
                textAnchor="middle"
                fill="var(--ez-color-primary)"
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
                stroke="var(--ez-color-primary)"
                strokeWidth="2.2"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 140 85 L 151 84 L 148 74"
                stroke="var(--ez-color-primary)"
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

          {/* Maskot kanonis EZRAB (vektor Lucu) */}
          <EZRABMascotLucu
            width="100%"
            height="100%"
            enableEyeTracking={true}
            enableFloat={true}
            enableBlink={true}
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
            color: 'var(--ez-color-text-primary)',
            margin: '0 0 14px 0',
          }}
        >
          {t('dash.quick_actions')}
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
              background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(37,99,235,0.04) 19px, rgba(37,99,235,0.04) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(37,99,235,0.04) 19px, rgba(37,99,235,0.04) 20px)',
              borderRadius: '22px',
              border: '1px solid #BFDBFE',
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
              e.currentTarget.style.borderColor = 'var(--ez-hue-blue-border)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'var(--ez-color-border)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--ez-color-primary-soft)',
                color: 'var(--ez-color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '2px' }}>
                {t('dash.qa_rab')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', lineHeight: 1.35 }}>
                {t('dash.qa_rab_desc')}
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
              background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 14px, rgba(249,115,22,0.05) 14px, rgba(249,115,22,0.05) 16px)',
              borderRadius: '22px',
              border: '1px solid #EA580C',
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
              e.currentTarget.style.borderColor = 'var(--ez-hue-violet-border)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'var(--ez-color-border)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--ez-hue-violet-bg)',
                color: 'var(--ez-hue-violet-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Upload size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '2px' }}>
                {t('dash.qa_ded')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', lineHeight: 1.35 }}>
                {t('dash.qa_ded_desc')}
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
              background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
              backgroundImage: 'radial-gradient(circle, rgba(22,163,74,0.06) 1.5px, transparent 1.5px)',
              backgroundSize: '18px 18px',
              borderRadius: '22px',
              border: '1px solid #16A34A',
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
              e.currentTarget.style.borderColor = 'var(--ez-hue-green-border-deep)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'var(--ez-color-border)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--ez-color-success-soft)',
                color: 'var(--ez-color-success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Calculator size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '2px' }}>
                {t('dash.qa_qto')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', lineHeight: 1.35 }}>
                {t('dash.qa_qto_desc')}
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
              background: 'linear-gradient(135deg, #FAF5FF 0%, #E9D5FF 100%)',
              backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 12px, rgba(147,51,234,0.04) 12px, rgba(147,51,234,0.04) 14px)',
              borderRadius: '22px',
              border: '1px solid #D8B4FE',
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
              e.currentTarget.style.borderColor = 'var(--ez-hue-amber-border)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'var(--ez-color-border)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--ez-color-warning-soft)',
                color: 'var(--ez-color-warning)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Shield size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '2px' }}>
                {t('dash.qa_ahsp')}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', lineHeight: 1.35 }}>
                {t('dash.qa_ahsp_desc')}
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
            <h2 style={{ fontSize: '17px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: '0 0 2px 0' }}>
              {t('dash.proyek_anda')}
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
              {t('dashboard.ringkasan_aktif')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => goProjects('Semua Proyek')}
            style={{
              fontSize: '12.5px',
              fontWeight: 650,
              color: 'var(--ez-color-primary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>{t('dash.semua_proyek')}</span>
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
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(255,255,255,0.07) 19px, rgba(255,255,255,0.07) 20px)',
              borderRadius: '22px',
              border: '1px solid #1D4ED8',
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            role="button"
            tabIndex={0}
            onClick={() => goProjects('Semua Proyek')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goProjects('Semua Proyek'); } }}
          >
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.1 }}>
                {totalProjects}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 550, color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>
                {t('dash.stat_total')}
              </div>
            </div>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.22)',
                color: '#FFFFFF',
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
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 14px, rgba(255,255,255,0.08) 14px, rgba(255,255,255,0.08) 16px)',
              borderRadius: '22px',
              border: '1px solid #D97706',
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            role="button"
            tabIndex={0}
            onClick={() => goProjects('Sedang Dikerjakan')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goProjects('Sedang Dikerjakan'); } }}
          >
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.1 }}>
                {inProgressProjects}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 550, color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>
                {t('dash.stat_aktif')}
              </div>
            </div>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.22)',
                color: '#FFFFFF',
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
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
              backgroundImage: 'radial-gradient(circle, rgba(22,163,74,0.07) 1.5px, transparent 1.5px)',
              backgroundSize: '16px 16px',
              borderRadius: '22px',
              border: '1px solid #16A34A',
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            role="button"
            tabIndex={0}
            onClick={() => goProjects('Selesai')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goProjects('Selesai'); } }}
          >
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.1 }}>
                {completedProjects}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 550, color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>
                {t('dash.stat_selesai')}
              </div>
            </div>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.22)',
                color: '#FFFFFF',
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
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
              backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 12px, rgba(249,115,22,0.05) 12px, rgba(249,115,22,0.05) 14px)',
              borderRadius: '22px',
              border: '1px solid #EA580C',
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            role="button"
            tabIndex={0}
            onClick={() => goProjects('Draft')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goProjects('Draft'); } }}
          >
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.1 }}>
                {draftProjects}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 550, color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>
                {t('dash.stat_draft')}
              </div>
            </div>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.22)',
                color: '#FFFFFF',
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
          gridTemplateColumns: unpricedCount > 0 ? 'minmax(0, 1fr) 350px' : 'minmax(0, 1fr)',
          gap: '16px',
          alignItems: 'stretch',
        }}
      >
        {/* LEFT: Daftar Proyek Terkini Table */}
        <div
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: '22px',
            border: '1px solid var(--ez-color-border)',
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
              color: 'var(--ez-color-text-primary)',
              margin: '0 0 16px 0',
            }}
          >
            {t('dash.daftar_proyek_terkini')}
          </h3>

          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ color: 'var(--ez-color-text-muted)', fontWeight: 650, fontSize: '11px', borderBottom: '1px solid var(--ez-color-border-soft)' }}>
                  <th style={{ padding: '8px 12px 12px 6px', fontWeight: 650 }}>{t('dash.col_proyek')}</th>
                  <th style={{ padding: '8px 12px 12px 12px', fontWeight: 650 }}>{t('dash.col_lokasi')}</th>
                  <th style={{ padding: '8px 12px 12px 12px', fontWeight: 650 }}>{t('dash.col_nilai_rab')}</th>
                  <th style={{ padding: '8px 12px 12px 12px', fontWeight: 650 }}>{t('dash.col_progress')}</th>
                  <th style={{ padding: '8px 12px 12px 12px', fontWeight: 650 }}>{t('dash.col_status')}</th>
                  <th style={{ padding: '8px 6px 12px 12px', fontWeight: 650 }}>{t('dash.col_updated')}</th>
                </tr>
              </thead>
              <tbody>
                {recentProjects.map((proj) => {
                  const badge = getStatusBadge(proj.status);
                  const progressPct = proj.progress || 0;
                  const barColor = progressPct >= 70 ? 'var(--ez-color-success)' : progressPct > 0 ? 'var(--ez-color-primary)' : 'var(--ez-color-border)';

                  return (
                    <tr
                      key={proj.id}
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        onSelectProject(proj.id, 'rab-estimasi');
                      }}
                      style={{
                        borderBottom: '1px solid var(--ez-color-surface-secondary)',
                        cursor: 'pointer',
                        transition: 'background-color 0.12s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--ez-color-surface-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Proyek */}
                      <td style={{ padding: '14px 12px 14px 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '8px',
                              background: 'var(--ez-color-primary-soft)',
                              color: 'var(--ez-color-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <FileText size={15} />
                          </div>
                          <span style={{ fontWeight: 650, color: 'var(--ez-color-text-primary)', whiteSpace: 'nowrap' }}>
                            {proj.name}
                          </span>
                        </div>
                      </td>

                      {/* Lokasi */}
                      <td style={{ padding: '14px 12px', color: 'var(--ez-color-text-muted)', whiteSpace: 'nowrap' }}>
                        {proj.location || 'Indonesia'}
                      </td>

                      {/* Nilai RAB */}
                      <td style={{ padding: '14px 12px', color: 'var(--ez-color-text-primary)', fontWeight: 550, whiteSpace: 'nowrap' }}>
                        {projectRabValue(proj)
                          ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(projectRabValue(proj) as number)
                          : '-'}
                      </td>

                      {/* Progress */}
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-muted)', width: '28px' }}>
                            {progressPct}%
                          </span>
                          <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'var(--ez-color-border-soft)', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${progressPct}%`,
                                height: '100%',
                                borderRadius: '3px',
                                background: barColor,
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>%</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 10px',
                            borderRadius: '99px',
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
                      <td style={{ padding: '14px 6px 14px 12px', color: 'var(--ez-color-text-muted)', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                        {formatProjectDate(proj.updatedAt, lang)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: EZRAB Insight Card with Mini Mascot Peeking — hanya tampil
            bila hitungan item belum berharga resmi > 0 (data nyata). */}
        {unpricedCount > 0 && (
        <div
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: '22px',
            border: '1px solid var(--ez-color-border)',
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
                  borderRadius: '8px',
                  background: 'var(--ez-color-primary-soft)',
                  color: 'var(--ez-color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={16} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 750, color: 'var(--ez-color-primary)' }}>
                EZRAB Insight
              </span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--ez-color-text-primary)', lineHeight: 1.5, margin: 0, maxWidth: '200px' }}>
              {unpricedInsightText(unpricedCount, lang)}
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
                background: 'var(--ez-color-surface)',
                color: 'var(--ez-color-primary)',
                border: '1px solid var(--ez-hue-blue-border)',
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
                e.currentTarget.style.background = 'var(--ez-color-primary-soft)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--ez-color-surface)';
              }}
            >
              <span>{t('dash.lihat_analisis')}</span>
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
                <EZRABMascotLucu
                  width="100%"
                  height="100%"
                  enableEyeTracking={true}
                  enableFloat={false}
                  enableBlink={true}
                />
              </div>
            </div>
          </div>
        </div>
        )}
      </section>

      {/* =========================================================================
          5. BOTTOM: AKTIVITAS TERBARU
         ========================================================================= */}
      <section style={{ paddingBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 14px 0' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: 0 }}>
            {t('dash.aktivitas_terbaru')}
          </h2>
          <button
            type="button"
            onClick={() => goProjects('Semua Proyek')}
            style={{
              fontSize: '12.5px',
              fontWeight: 650,
              color: 'var(--ez-color-primary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>{t('dashboard.lihat_semua')}</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* F1a: daftar aktivitas NYATA dari props activities (sumber sama
            dengan mode Modern — derivasi timestamp proyek di WorkspaceView).
            Sebelumnya seksi ini hanya judul + tombol tanpa daftar apa pun. */}
        <div
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: '22px',
            border: '1px solid var(--ez-color-border)',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
            padding: '6px 24px',
          }}
        >
          {activities && activities.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {activities.slice(0, 5).map((a, i, arr) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    padding: '11px 0',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--ez-color-border-soft)' : 'none',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      flexShrink: 0,
                      background:
                        a.type === 'create'
                          ? 'var(--ez-pastel-sky)'
                          : a.type === 'done'
                            ? 'var(--ez-pastel-mint)'
                            : a.type === 'archive'
                              ? 'var(--ez-color-surface-tertiary)'
                              : 'var(--ez-pastel-cream)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {a.type === 'create' ? (
                      <Plus size={15} color="var(--ez-pill-run-text)" />
                    ) : a.type === 'done' ? (
                      <CheckCircle2 size={15} color="var(--ez-pill-ok-text)" />
                    ) : a.type === 'archive' ? (
                      <Archive size={15} color="var(--ez-color-text-muted)" />
                    ) : (
                      <Pencil size={14} color="var(--ez-pill-wait-text)" />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-color-text-primary)', lineHeight: 1.45 }}>{a.text}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', textAlign: 'center', padding: '18px 8px' }}>
              {t('proj.all.activity_empty')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

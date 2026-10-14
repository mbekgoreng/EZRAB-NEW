import React from 'react';
import {
  Plus,
  ChevronRight,
  Sparkles,
  FileText,
  Upload,
  Calculator,
  Shield,
  Folder,
  Clock,
  CheckCircle2,
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

/* ------------------------------------------------------------------ */
/* Helpers — all values derived from real project data, never invented */
/* ------------------------------------------------------------------ */

/** BCP47 locale untuk bahasa antarmuka yang sedang aktif. */
const localeForLang = (lang: string): string =>
  ({ id: 'id-ID', en: 'en-US', zh: 'zh-CN', ms: 'ms-MY' } as Record<string, string>)[lang] ?? 'id-ID';

/** Tanggal panjang mengikuti bahasa antarmuka, mis. "Rabu, 14 Oktober 2026". */
const formatDateLong = (d: Date, lang: string): string =>
  new Intl.DateTimeFormat(localeForLang(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);

const formatRpFull = (v: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(v);

/** Short Indonesian Rp label for stat cards: Rp 684 jt / Rp 4,2 M */
const formatRpShort = (v: number): string => {
  if (v >= 1_000_000_000) {
    const n = v / 1_000_000_000;
    return `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: n >= 100 ? 0 : 1 })} M`;
  }
  if (v >= 1_000_000) {
    return `Rp ${Math.round(v / 1_000_000).toLocaleString('id-ID')} jt`;
  }
  return formatRpFull(v);
};

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

const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

export const EzrabAiDashboardView: React.FC<EzrabAiDashboardViewProps> = ({
  projects,
  onCreateProject,
  onSelectProject,
  onNavigateToTab,
  onOpenMagicAi,
}) => {
  const { currentProject, setCurrentProjectId } = useProject();
  const { t, lang } = useI18n();

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

  // Genuine project metrics — every number below comes from the projects prop
  const totalProjects = projects.length;
  const inProgressProjects = projects.filter((p) => p.status === 'in_progress').length;
  const completedProjects = projects.filter(
    (p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED'
  ).length;
  const draftProjects = projects.filter(
    (p) => p.status === 'draft' || !p.status || p.status === 'DRAFT'
  ).length;

  const latestProject = currentProject || (projects.length > 0 ? projects[0] : null);

  // Pastel status pills (tints only, no heavy borders)
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'in_progress':
        return { label: t('dashboard.status_aktif'), bg: 'var(--ez-color-primary-soft)', color: 'var(--ez-color-info)' };
      case 'completed':
      case 'approved':
      case 'COMPLETED':
        return { label: t('dashboard.status_selesai'), bg: 'var(--ez-pastel-mint)', color: 'var(--ez-color-success)' };
      case 'archived':
        return { label: t('dashboard.status_arsip'), bg: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-muted)' };
      default:
        return { label: t('dashboard.status_draft'), bg: 'var(--ez-pastel-cream)', color: 'var(--ez-color-warning)' };
    }
  };

  const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
  const CARD_SHADOW = 'var(--ez-shadow-card)';

  /* ---------------- Empty state: no fake zeros ---------------- */
  if (totalProjects === 0) {
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
          fontFamily: FONT,
        }}
      >
        <style>{`
          @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
          @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
        `}</style>
        <header style={{ marginBottom: '2px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.3px', margin: 0 }}>
            {t('dash.dashboard')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0 0' }}>
            {getLocalizedGreeting()} — {formatDateLong(new Date(), lang)}
          </p>
        </header>
        <div
          className="ezdb-anim"
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: '22px',
            border: '1px solid var(--ez-color-border-soft)',
            boxShadow: CARD_SHADOW,
            padding: '64px 32px',
            textAlign: 'center',
            animation: 'ezdb-rise 0.6s 0.1s both',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '22px',
              background: 'var(--ez-color-primary-soft)',
              color: 'var(--ez-color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px auto',
            }}
          >
            <FileText size={26} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--ez-color-text-primary)' }}>
            {t('dash.empty_title')}
          </h2>
          <p style={{ fontSize: '13.5px', color: 'var(--ez-color-text-muted)', margin: '0 0 24px 0', lineHeight: 1.6 }}>
            {t('dash.empty_desc')}
          </p>
          <button
            type="button"
            onClick={onCreateProject}
            style={{
              height: '44px',
              padding: '0 24px',
              borderRadius: '12px',
              background: 'var(--ez-color-primary)',
              color: 'var(--ez-color-surface)',
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>{t('dash.buat_proyek_pertama')}</span>
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- Main dashboard ---------------- */
  return (
    <div
      className="ezrab-dashboard-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        maxWidth: '1440px',
        margin: '0 auto',
        width: '100%',
        color: 'var(--ez-color-text-primary)',
        fontFamily: FONT,
      }}
    >
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
        @media (max-width: 1120px) { .ezdb-hero-annot { display: none !important; } }
        @media (max-width: 1000px) {
          .ezdb-stats { grid-template-columns: 1fr 1fr !important; }
          .ezdb-split { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .ezdb-stats { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ============ 1. HERO — greeting + mascot ============ */}
      <section
        className="ezdb-anim"
        style={{
          background: 'var(--ez-color-primary-soft)',
          borderRadius: '22px',
          boxShadow: CARD_SHADOW,
          padding: '36px 44px',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '32px',
          minHeight: '280px',
          animation: 'ezdb-rise 0.6s 0s both',
        }}
      >
        <div style={{ flex: 1, maxWidth: '580px', position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, letterSpacing: '0.01em', marginBottom: '10px' }}>
            <span style={{ color: 'var(--ez-color-text-primary)' }}>{getLocalizedGreeting()}, </span>
            <span style={{ color: 'var(--ez-color-primary)' }}>Ahmad</span>
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
          <p style={{ fontSize: '14px', color: 'var(--ez-color-text-secondary)', lineHeight: 1.6, margin: '0 0 24px 0', maxWidth: '520px' }}>
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
                color: 'var(--ez-color-surface)',
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
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: CARD_SHADOW,
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span>{t('dashboard.buka_proyek')}</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Mascot + handwritten annotation */}
        <div
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
          <div
            className="ezdb-hero-annot"
            style={{
              position: 'absolute',
              top: '36%',
              left: '-181px',
              transform: 'translateY(-50%)',
              width: '220px',
              height: '138px',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <svg width="220" height="138" viewBox="0 0 220 138" fill="none">
              <text x="81" y="35" textAnchor="middle" fill="var(--ez-color-primary)"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="20" fontWeight="700" transform="rotate(-3 81 35)">{t('dash.hero_note_1')}</text>
              <text x="85" y="60" textAnchor="middle" fill="var(--ez-color-primary)"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="19" fontWeight="600" transform="rotate(-3 85 60)">{t('dash.hero_note_2')}</text>
              <text x="90" y="87" textAnchor="middle" fill="var(--ez-color-primary)"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="21" fontWeight="800" transform="rotate(-3 90 87)">EZRAB</text>
              <path d="M 135 85 C 155 87, 172 95, 187 105" stroke="var(--ez-color-primary)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <path d="M 175 106 L 189 105 L 185 92" stroke="var(--ez-color-primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
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

      {/* ============ 2. QUICK ACTIONS ============ */}
      <section>
        <h2 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: '0 0 14px 0' }}>
          {t('dash.quick_actions')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {[
            { icon: FileText, title: t('dash.qa_rab'), desc: t('dash.qa_rab_desc'), iconBg: 'var(--ez-color-primary-soft)', iconColor: 'var(--ez-color-primary)', onClick: onCreateProject, delay: '0.05s' },
            { icon: Upload, title: t('dash.qa_ded'), desc: t('dash.qa_ded_desc'), iconBg: 'var(--ez-pastel-cream)', iconColor: 'var(--ez-color-warning)', onClick: () => onOpenMagicAi('ded-rab'), delay: '0.1s' },
            { icon: Calculator, title: t('dash.qa_qto'), desc: t('dash.qa_qto_desc'), iconBg: 'var(--ez-pastel-mint)', iconColor: 'var(--ez-color-success)', onClick: () => onNavigateToTab('qto-vc'), delay: '0.15s' },
            { icon: Shield, title: t('dash.qa_ahsp'), desc: t('dash.qa_ahsp_desc'), iconBg: 'var(--ez-pastel-peach)', iconColor: 'var(--ez-color-warning)', onClick: () => onNavigateToTab('ahsp-2026'), delay: '0.2s' },
          ].map((a) => (
            <div
              key={a.title}
              onClick={a.onClick}
              role="button"
              tabIndex={0}
              aria-label={a.title}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') a.onClick(); }}
              className="ezdb-anim"
              style={{
                height: '96px',
                background: 'var(--ez-color-surface)',
                borderRadius: '22px',
                border: '1px solid var(--ez-color-border-soft)',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                boxShadow: CARD_SHADOW,
                transition: 'all 0.18s ease',
                animation: `ezdb-rise 0.6s ${a.delay} both`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = CARD_SHADOW;
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: a.iconBg,
                  color: a.iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <a.icon size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '2px' }}>
                  {a.title}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', lineHeight: 1.35 }}>
                  {a.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 3. PROYEK ANDA — 4 pastel stat cards ============ */}
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
            onClick={() => onNavigateToTab('proyek')}
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
          className="ezdb-stats"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}
        >
          {[
            { bg: 'var(--ez-color-primary-soft)', icon: Folder, iconColor: 'var(--ez-color-primary)', value: totalProjects, label: t('dash.stat_total'), sub: `${draftProjects} ${t('dash.stat_draft_word')}`, delay: '0.05s' },
            { bg: 'var(--ez-pastel-cream)', icon: Clock, iconColor: 'var(--ez-color-warning)', value: inProgressProjects, label: t('dash.stat_aktif'), sub: t('dash.stat_aktif_sub'), delay: '0.12s' },
            { bg: 'var(--ez-pastel-mint)', icon: CheckCircle2, iconColor: 'var(--ez-color-success)', value: completedProjects, label: t('dash.stat_selesai'), sub: t('dash.stat_selesai_sub'), delay: '0.19s' },
            { bg: 'var(--ez-pastel-peach)', icon: FileText, iconColor: 'var(--ez-color-warning)', value: draftProjects, label: t('dash.stat_draft'), sub: t('dash.stat_draft_sub'), delay: '0.26s' },
          ].map((c) => (
            <div
              key={c.label}
              className="ezdb-anim"
              style={{
                background: c.bg,
                borderRadius: '22px',
                padding: '22px',
                boxShadow: CARD_SHADOW,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                animation: `ezdb-rise 0.6s ${c.delay} both`,
              }}
            >
              <div>
                <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)', lineHeight: 1.1 }}>
                  {c.value}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-secondary)', marginTop: '6px' }}>
                  {c.label}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
                  {c.sub}
                </div>
              </div>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'var(--ez-color-surface)',
                  color: c.iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <c.icon size={20} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 4. SPLIT: DAFTAR PROYEK TERKINI + EZRAB INSIGHT ============ */}
      <section
        className="ezdb-split"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '18px', alignItems: 'stretch' }}
      >
        {/* LEFT: Daftar Proyek Terkini table */}
        <div
          className="ezdb-anim"
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: '22px',
            border: '1px solid var(--ez-color-border-soft)',
            boxShadow: CARD_SHADOW,
            padding: '24px',
            animation: 'ezdb-rise 0.6s 0.3s both',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: '0 0 16px 0' }}>
            {t('dash.daftar_proyek_terkini')}
          </h3>
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px', minWidth: '560px' }}>
              <thead>
                <tr style={{ color: 'var(--ez-color-text-muted)', fontWeight: 700, fontSize: '11px', borderBottom: '1px solid var(--ez-color-border-soft)' }}>
                  {[t('dash.col_proyek'), t('dash.col_lokasi'), t('dash.col_nilai_rab'), t('dash.col_progress'), t('dash.col_status'), t('dash.col_updated')].map((h) => (
                    <th key={h} style={{ padding: '8px 12px 12px 6px', fontWeight: 700, letterSpacing: '0.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 3).map((proj) => {
                  const badge = getStatusBadge(proj.status);
                  const progressPct = Math.max(0, Math.min(100, proj.progress || 0));
                  const barColor = progressPct >= 70 ? 'var(--ez-color-success)' : progressPct > 0 ? 'var(--ez-color-primary)' : 'var(--ez-color-border)';
                  return (
                    <tr
                      key={proj.id}
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        onSelectProject(proj.id, 'rab-estimasi');
                      }}
                      style={{ borderBottom: '1px solid var(--ez-color-border-soft)', cursor: 'pointer', transition: 'background-color 0.12s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--ez-color-surface-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px 12px 14px 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '12px',
                              background: 'var(--ez-color-primary-soft)',
                              color: 'var(--ez-color-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '12px',
                              flexShrink: 0,
                            }}
                          >
                            {initialsOf(proj.name)}
                          </span>
                          <span style={{ fontWeight: 600, color: 'var(--ez-color-text-primary)', whiteSpace: 'nowrap' }}>
                            {proj.name}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px', color: 'var(--ez-color-text-muted)', whiteSpace: 'nowrap' }}>
                        {proj.location || 'Indonesia'}
                      </td>
                      <td style={{ padding: '14px 12px', color: 'var(--ez-color-text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {proj.totalRab && proj.totalRab > 0 ? formatRpFull(proj.totalRab) : '-'}
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-muted)', width: '30px' }}>
                            {progressPct}%
                          </span>
                          <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: 'var(--ez-color-border-soft)', overflow: 'hidden' }}>
                            <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: '99px', background: barColor }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '5px 12px',
                            borderRadius: '99px',
                            background: badge.bg,
                            color: badge.color,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
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

        {/* RIGHT: EZRAB Insight */}
        <div
          className="ezdb-anim"
          style={{
            background: 'var(--ez-pastel-cream)',
            borderRadius: '22px',
            boxShadow: CARD_SHADOW,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            minHeight: '210px',
            animation: 'ezdb-rise 0.6s 0.36s both',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '12px',
                  background: 'var(--ez-color-surface)',
                  color: 'var(--ez-color-warning)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={16} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
                EZRAB Insight
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--ez-color-text-secondary)', lineHeight: 1.6, margin: 0, maxWidth: '220px' }}>
              {t('dash.insight_text')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', marginTop: '20px' }}>
            <button
              type="button"
              onClick={() => onOpenMagicAi()}
              style={{
                height: '38px',
                padding: '0 16px',
                borderRadius: '12px',
                background: 'var(--ez-color-surface)',
                color: 'var(--ez-color-warning)',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: CARD_SHADOW,
                transition: 'all 0.15s ease',
                position: 'relative',
                zIndex: 2,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Sparkles size={14} />
              <span>{t('dash.lihat_analisis')}</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* ============ 5. AKTIVITAS TERBARU ============ */}
      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 24px 0' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: 0 }}>
          {t('dash.aktivitas_terbaru')}
        </h2>
        <button
          type="button"
          onClick={() => onNavigateToTab('proyek')}
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
      </section>
    </div>
  );
};

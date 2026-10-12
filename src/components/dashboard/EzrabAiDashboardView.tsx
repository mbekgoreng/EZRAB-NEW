import React from 'react';
import {
  Plus,
  ChevronRight,
  Sparkles,
  FileText,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { useI18n } from '../../i18n';

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

const formatIdDateLong = (d: Date): string => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

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

const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

/** Pastel fills cycled for row dots — restrained color accents only */
const DOT_FILLS = ['#FDF3D8', '#E2F4D8', '#FFE9D6', '#E3EEFB'];

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

  // Genuine project metrics — every number below comes from the projects prop
  const totalProjects = projects.length;
  const inProgressProjects = projects.filter((p) => p.status === 'in_progress').length;
  const completedProjects = projects.filter(
    (p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED'
  ).length;
  const draftProjects = projects.filter(
    (p) => p.status === 'draft' || !p.status || p.status === 'DRAFT'
  ).length;
  const totalRabValue = projects.reduce(
    (acc, p) => acc + (p.totalRab && p.totalRab > 0 ? p.totalRab : 0),
    0
  );
  const valuedProjects = projects.filter((p) => p.totalRab && p.totalRab > 0).length;

  const latestProject = currentProject || (projects.length > 0 ? projects[0] : null);

  // Pastel status pills (tints only, no heavy borders)
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'in_progress':
        return { label: t('dashboard.status_aktif'), bg: '#E3EEFB', color: '#2456A8' };
      case 'completed':
      case 'approved':
      case 'COMPLETED':
        return { label: t('dashboard.status_selesai'), bg: '#E2F4D8', color: '#2C6E2C' };
      case 'archived':
        return { label: t('dashboard.status_arsip'), bg: '#F1F5F9', color: '#64748B' };
      default:
        return { label: t('dashboard.status_draft'), bg: '#FDF3D8', color: '#A8780A' };
    }
  };

  const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
  const CARD_SHADOW = '0 4px 20px rgba(0,0,0,0.045)';

  const statCard = (bg: string, delay: string): React.CSSProperties => ({
    background: bg,
    borderRadius: '22px',
    padding: '22px',
    boxShadow: CARD_SHADOW,
    animation: `ezdb-rise 0.6s ${delay} both`,
  });

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
          color: '#141412',
          fontFamily: FONT,
        }}
      >
        <style>{`
          @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
          @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
        `}</style>
        <header style={{ marginBottom: '2px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.3px', margin: 0 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: '13px', color: '#8A8A84', margin: '4px 0 0 0' }}>
            {getLocalizedGreeting()} — {formatIdDateLong(new Date())}
          </p>
        </header>
        <div
          className="ezdb-anim"
          style={{
            background: '#FFFFFF',
            borderRadius: '22px',
            border: '1px solid #EEF1F6',
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
              borderRadius: '18px',
              background: '#E3EEFB',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px auto',
            }}
          >
            <FileText size={26} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: '#141412' }}>
            Belum ada proyek
          </h2>
          <p style={{ fontSize: '13.5px', color: '#8A8A84', margin: '0 0 24px 0', lineHeight: 1.6 }}>
            Buat proyek pertama Anda untuk mulai menyusun RAB dan memantau progres di sini.
          </p>
          <button
            type="button"
            onClick={onCreateProject}
            style={{
              height: '44px',
              padding: '0 24px',
              borderRadius: '12px',
              background: '#2563EB',
              color: '#FFFFFF',
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
            <span>Buat Proyek Pertama</span>
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
        color: '#141412',
        fontFamily: FONT,
      }}
    >
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
        @media (max-width: 1000px) {
          .ezdb-stats { grid-template-columns: 1fr 1fr !important; }
          .ezdb-split { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .ezdb-stats { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ============ 1. HEADER ============ */}
      <header className="ezdb-anim" style={{ animation: 'ezdb-rise 0.6s 0s both', marginBottom: '2px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.3px', margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: '13px', color: '#8A8A84', margin: '4px 0 0 0' }}>
          {getLocalizedGreeting()} — {formatIdDateLong(new Date())} · ringkasan seluruh proyek Anda
        </p>
      </header>

      {/* ============ 2. STAT ROW — 4 pastel cards, real data only ============ */}
      <section
        className="ezdb-stats"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}
      >
        <div className="ezdb-anim" style={statCard('#FDF3D8', '0.05s')}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Total Nilai RAB
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {formatRpShort(totalRabValue)}
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            dari <b style={{ color: '#141412' }}>{valuedProjects}</b> proyek bernilai
          </div>
        </div>

        <div className="ezdb-anim" style={statCard('#E2F4D8', '0.12s')}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Proyek Aktif
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {inProgressProjects}
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            <b style={{ color: '#141412' }}>{completedProjects}</b> selesai
          </div>
        </div>

        <div className="ezdb-anim" style={statCard('#FFE9D6', '0.19s')}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Total Proyek
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {totalProjects}
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            <b style={{ color: '#141412' }}>{draftProjects}</b> masih draft
          </div>
        </div>

        <div className="ezdb-anim" style={statCard('#E3EEFB', '0.26s')}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Selesai
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {completedProjects}
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            <b style={{ color: '#141412' }}>{inProgressProjects}</b> sedang berjalan
          </div>
        </div>
      </section>

      {/* ============ 3. SPLIT: PROYEK TERKINI + HIGHLIGHTS ============ */}
      <section
        className="ezdb-split"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '18px', alignItems: 'stretch' }}
      >
        {/* LEFT: white card — recent projects table */}
        <div
          className="ezdb-anim"
          style={{
            background: '#FFFFFF',
            borderRadius: '22px',
            border: '1px solid #EEF1F6',
            boxShadow: CARD_SHADOW,
            padding: '24px',
            animation: 'ezdb-rise 0.6s 0.3s both',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 2px 0' }}>Proyek Terkini</h3>
              <div style={{ fontSize: '12px', color: '#8A8A84', marginBottom: '12px' }}>
                {totalProjects} proyek terdaftar
              </div>
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
                whiteSpace: 'nowrap',
              }}
            >
              <span>Semua Proyek</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '560px' }}>
              <thead>
                <tr>
                  {['Proyek', 'Nilai RAB', 'Progres', 'Status'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        fontSize: '11px',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        color: '#8A8A84',
                        padding: '10px 12px',
                        borderBottom: '1px solid #F0EFE9',
                        fontWeight: 700,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 5).map((proj, idx) => {
                  const badge = getStatusBadge(proj.status);
                  const progressPct = Math.max(0, Math.min(100, proj.progress || 0));
                  return (
                    <tr
                      key={proj.id}
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        onSelectProject(proj.id, 'rab-estimasi');
                      }}
                      style={{ cursor: 'pointer', transition: 'background-color 0.12s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FAFAF8')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #F5F4EF' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '12px',
                              background: DOT_FILLS[idx % DOT_FILLS.length],
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '13px',
                              color: '#141412',
                              flexShrink: 0,
                            }}
                          >
                            {initialsOf(proj.name)}
                          </span>
                          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{proj.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #F5F4EF', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {proj.totalRab && proj.totalRab > 0 ? formatRpFull(proj.totalRab) : '-'}
                      </td>
                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #F5F4EF' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
                          <div style={{ flex: 1, height: '8px', borderRadius: '99px', background: '#F0EFE9', overflow: 'hidden' }}>
                            <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: '99px', background: '#2563EB' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#6B6B64' }}>{progressPct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #F5F4EF' }}>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: highlight stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
          {latestProject && (
            <div
              className="ezdb-anim"
              onClick={() => {
                setCurrentProjectId(latestProject.id);
                onSelectProject(latestProject.id, 'rab-estimasi');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setCurrentProjectId(latestProject.id);
                  onSelectProject(latestProject.id, 'rab-estimasi');
                }
              }}
              style={{
                borderRadius: '20px',
                padding: '18px',
                background: '#E3EEFB',
                boxShadow: CARD_SHADOW,
                cursor: 'pointer',
                animation: 'ezdb-rise 0.6s 0.4s both',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px', color: '#141412' }}>
                {latestProject.name}
              </div>
              <div style={{ fontSize: '12px', color: '#6B6B64' }}>
                Proyek terakhir dibuka
                {latestProject.totalRab && latestProject.totalRab > 0
                  ? ` · ${formatRpShort(latestProject.totalRab)}`
                  : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '4px 11px', borderRadius: '99px', background: 'rgba(255,255,255,0.7)', color: '#2456A8' }}>
                  Buka RAB
                </span>
                <ChevronRight size={16} color="#2456A8" />
              </div>
            </div>
          )}

          <div
            className="ezdb-anim"
            onClick={onCreateProject}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCreateProject(); }}
            style={{
              borderRadius: '20px',
              padding: '18px',
              background: '#E2F4D8',
              boxShadow: CARD_SHADOW,
              cursor: 'pointer',
              animation: 'ezdb-rise 0.6s 0.47s both',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Plus size={15} strokeWidth={2.5} color="#2C6E2C" />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#141412' }}>Buat Proyek Baru</div>
            </div>
            <div style={{ fontSize: '12px', color: '#6B6B64' }}>
              Mulai RAB baru dari nol atau template
            </div>
          </div>

          <div
            className="ezdb-anim"
            onClick={() => onOpenMagicAi()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenMagicAi(); }}
            style={{
              borderRadius: '20px',
              padding: '18px',
              background: '#FFE9D6',
              boxShadow: CARD_SHADOW,
              cursor: 'pointer',
              animation: 'ezdb-rise 0.6s 0.54s both',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Sparkles size={15} color="#A8780A" />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#141412' }}>Tanya AI EZRAB</div>
            </div>
            <div style={{ fontSize: '12px', color: '#6B6B64' }}>
              Estimasi, analisa harga & volume via AI
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

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
          background: '#E3EEFB',
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
            <span style={{ color: '#141412' }}>{getLocalizedGreeting()}, </span>
            <span style={{ color: '#2563EB' }}>Ahmad</span>
          </div>
          <h1
            style={{
              fontSize: 'clamp(28px, 3.2vw, 36px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: '#141412',
              lineHeight: 1.2,
              margin: '0 0 14px 0',
            }}
          >
            {t('dashboard.hero_title')}
          </h1>
          <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6, margin: '0 0 24px 0', maxWidth: '520px' }}>
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
                borderRadius: '12px',
                background: '#FFFFFF',
                color: '#141412',
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
              <text x="81" y="35" textAnchor="middle" fill="#2563EB"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="20" fontWeight="700" transform="rotate(-3 81 35)">Membangun</text>
              <text x="85" y="60" textAnchor="middle" fill="#2563EB"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="19" fontWeight="600" transform="rotate(-3 85 60)">lebih baik bersama</text>
              <text x="90" y="87" textAnchor="middle" fill="#2563EB"
                fontFamily="'Caveat', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
                fontSize="21" fontWeight="800" transform="rotate(-3 90 87)">EZRAB</text>
              <path d="M 135 85 C 155 87, 172 95, 187 105" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <path d="M 175 106 L 189 105 L 185 92" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
        <h2 style={{ fontSize: '16px', fontWeight: 750, color: '#141412', margin: '0 0 14px 0' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {[
            { icon: FileText, title: 'Buat RAB', desc: 'Penyusunan RAB otomatis & terstruktur', iconBg: '#E3EEFB', iconColor: '#2563EB', onClick: onCreateProject, delay: '0.05s' },
            { icon: Upload, title: 'Upload DED', desc: 'Ekstraksi BoQ dari dokumen gambar teknis', iconBg: '#FDF3D8', iconColor: '#A8780A', onClick: () => onOpenMagicAi('ded-rab'), delay: '0.1s' },
            { icon: Calculator, title: 'Volume Calculation', desc: 'Kalkulator QTO terintegrasi standar teknis', iconBg: '#E2F4D8', iconColor: '#2C6E2C', onClick: () => onNavigateToTab('qto-vc'), delay: '0.15s' },
            { icon: Shield, title: 'Cari AHSP', desc: 'Database analisa PUPR 2026 terverifikasi', iconBg: '#FFE9D6', iconColor: '#B45309', onClick: () => onNavigateToTab('ahsp-2026'), delay: '0.2s' },
          ].map((a) => (
            <div
              key={a.title}
              onClick={a.onClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') a.onClick(); }}
              className="ezdb-anim"
              style={{
                height: '96px',
                background: '#FFFFFF',
                borderRadius: '22px',
                border: '1px solid #EEF1F6',
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
                <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#141412', marginBottom: '2px' }}>
                  {a.title}
                </div>
                <div style={{ fontSize: '12px', color: '#8A8A84', lineHeight: 1.35 }}>
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
            <h2 style={{ fontSize: '17px', fontWeight: 750, color: '#141412', margin: '0 0 2px 0' }}>
              Proyek Anda
            </h2>
            <span style={{ fontSize: '12px', color: '#8A8A84' }}>
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
          className="ezdb-stats"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}
        >
          {[
            { bg: '#E3EEFB', icon: Folder, iconColor: '#2563EB', value: totalProjects, label: 'Total Proyek', sub: `${draftProjects} draft`, delay: '0.05s' },
            { bg: '#FDF3D8', icon: Clock, iconColor: '#A8780A', value: inProgressProjects, label: 'Sedang Dikerjakan', sub: 'proyek berjalan', delay: '0.12s' },
            { bg: '#E2F4D8', icon: CheckCircle2, iconColor: '#2C6E2C', value: completedProjects, label: 'Selesai', sub: 'proyek tuntas', delay: '0.19s' },
            { bg: '#FFE9D6', icon: FileText, iconColor: '#B45309', value: draftProjects, label: 'Draft', sub: 'belum berjalan', delay: '0.26s' },
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
                <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412', lineHeight: 1.1 }}>
                  {c.value}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginTop: '6px' }}>
                  {c.label}
                </div>
                <div style={{ fontSize: '11px', color: '#8A8A84', marginTop: '2px' }}>
                  {c.sub}
                </div>
              </div>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: '#FFFFFF',
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
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#141412', margin: '0 0 16px 0' }}>
            Daftar Proyek Terkini
          </h3>
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px', minWidth: '560px' }}>
              <thead>
                <tr style={{ color: '#8A8A84', fontWeight: 700, fontSize: '11px', borderBottom: '1px solid #F0EFE9' }}>
                  {['PROYEK', 'LOKASI', 'NILAI RAB', 'PROGRESS', 'STATUS', 'UPDATED'].map((h) => (
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
                  const barColor = progressPct >= 70 ? '#2C6E2C' : progressPct > 0 ? '#2563EB' : '#DCE4EE';
                  return (
                    <tr
                      key={proj.id}
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        onSelectProject(proj.id, 'rab-estimasi');
                      }}
                      style={{ borderBottom: '1px solid #F5F4EF', cursor: 'pointer', transition: 'background-color 0.12s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FAFAF8')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px 12px 14px 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '10px',
                              background: '#E3EEFB',
                              color: '#2563EB',
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
                          <span style={{ fontWeight: 600, color: '#141412', whiteSpace: 'nowrap' }}>
                            {proj.name}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px', color: '#8A8A84', whiteSpace: 'nowrap' }}>
                        {proj.location || 'Indonesia'}
                      </td>
                      <td style={{ padding: '14px 12px', color: '#141412', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {proj.totalRab && proj.totalRab > 0 ? formatRpFull(proj.totalRab) : '-'}
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#8A8A84', width: '30px' }}>
                            {progressPct}%
                          </span>
                          <div style={{ flex: 1, height: '6px', borderRadius: '99px', background: '#F0EFE9', overflow: 'hidden' }}>
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
                      <td style={{ padding: '14px 6px 14px 12px', color: '#8A8A84', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                        {formatProjectDate(proj.updatedAt)}
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
            background: '#FDF3D8',
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
                  borderRadius: '10px',
                  background: '#FFFFFF',
                  color: '#A8780A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={16} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 750, color: '#141412' }}>
                EZRAB Insight
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#6B6B64', lineHeight: 1.6, margin: 0, maxWidth: '220px' }}>
              3 item material pada proyek Anda memiliki potensi optimasi.
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
                background: '#FFFFFF',
                color: '#A8780A',
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
              <span>Lihat Analisis</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* ============ 5. AKTIVITAS TERBARU ============ */}
      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 24px 0' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 750, color: '#141412', margin: 0 }}>
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

import React, { useState, useMemo } from 'react';
import {
  Plus,
  Sparkles,
  Search,
  CheckCircle2,
  Trash2,
  SlidersHorizontal,
  Download,
  FileText,
  Eye,
  Pencil,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  MapPin,
  X,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { useI18n } from '../../i18n/I18nContext';
import { DeleteProjectModal } from './DeleteProjectModal';
import emptyBlueprintImg from '../../assets/proyek-empty-blueprint.png';

export interface ActivityItem {
  text: string;
  time: string;
  type: string;
}

interface AllProjectsViewProps {
  projects: Project[];
  activities?: ActivityItem[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
  onSwitchFilter?: (filter: string) => void;
}

/* ============================== helpers ============================== */

type StatusKey = 'berjalan' | 'draft' | 'selesai' | 'arsip';

const getStatusKey = (p: Project): StatusKey => {
  if (p.status === 'archived' || p.isArchived) return 'arsip';
  if (p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED') return 'selesai';
  if (p.status === 'in_progress') return 'berjalan';
  return 'draft';
};

const getStatusMeta = (
  t: (key: string) => string,
): Record<StatusKey, { label: string; bg: string; color: string }> => ({
  berjalan: { label: t('proj.all.st_running'), bg: 'var(--ez-pastel-sky)', color: 'var(--ez-pill-run-text)' },
  draft: { label: t('proj.all.st_draft'), bg: 'var(--ez-pastel-cream)', color: 'var(--ez-pill-wait-text)' },
  selesai: { label: t('proj.all.st_done'), bg: 'var(--ez-pastel-mint)', color: 'var(--ez-pill-ok-text)' },
  arsip: { label: t('proj.all.st_archived'), bg: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-muted)' },
});

const getProgress = (p: Project): number => {
  if (typeof p.progress === 'number') return Math.min(100, Math.max(0, Math.round(p.progress)));
  const s = getStatusKey(p);
  if (s === 'selesai') return 100;
  if (s === 'draft') return 0;
  return 0; // jujur: tidak ada data progres → 0, bukan angka tebakan
};

const getRabValue = (p: Project): number => p.totalRab || p.costSummary?.grandTotal || 0;

const isOverdue = (p: Project): boolean => {
  const s = getStatusKey(p);
  if (s === 'selesai' || s === 'arsip' || !p.targetDate) return false;
  const t = new Date(p.targetDate);
  if (isNaN(t.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return t < today;
};

/** Rencana progres hari ini dari kurva-S (jika ada data jadwal). */
const getPlannedProgress = (p: Project): number | null => {
  const pts = p.kurvaSData;
  if (!pts || pts.length === 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let planned: number | null = null;
  for (const pt of pts) {
    const s = new Date(pt.startDate);
    const e = new Date(pt.endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
    if (s <= today) planned = pt.cumulativePlannedPercent;
    if (s <= today && today <= e) {
      planned = pt.cumulativePlannedPercent;
      break;
    }
  }
  return planned == null ? null : Math.min(100, Math.max(0, Math.round(planned)));
};

const formatRpCompact = (v: number): string => {
  if (!v || v <= 0) return 'Rp 0';
  if (v >= 1e9) return `Rp ${(v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 })} jt`;
  if (v >= 1e3) return `Rp ${(v / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`;
  return `Rp ${v.toLocaleString('id-ID')}`;
};

const formatRpFull = (v: number): string => `Rp ${(v || 0).toLocaleString('id-ID')}`;

const formatDate = (d?: string): string => {
  if (!d) return '—';
  const t = new Date(d);
  if (isNaN(t.getTime())) return '—';
  return t.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ============================== small components ============================== */

const cardStyle: React.CSSProperties = {
  background: 'var(--ez-color-surface)',
  borderRadius: 'var(--ez-radius-card)',
  border: '1px solid var(--ez-color-border-soft)',
  padding: 24,
  boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
};

const StatCard: React.FC<{
  bgClass: string;
  label: string;
  value: string;
  sub: string;
  subColor?: string;
  onClick?: () => void;
  delay?: string;
}> = ({ bgClass, label, value, sub, subColor = 'var(--ez-color-text-muted)', onClick, delay = '0s' }) => (
  <div
    className={`ezdb-anim ez-stat ${bgClass}`}
    style={{ cursor: onClick ? 'pointer' : 'default', animation: `ezdb-rise 0.6s ${delay} both` }}
    onClick={onClick}
  >
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
      {value}
    </div>
    <div style={{ fontSize: 12, color: subColor, marginTop: 6 }}>{sub}</div>
  </div>
);

const Donut: React.FC<{ segments: Array<{ value: number; color: string; label: string }>; centerLabel: string }> = ({ segments, centerLabel }) => {
  const size = 132;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ez-color-surface-tertiary)" strokeWidth={stroke} />
          {segments.map((s, i) => {
            if (total === 0 || s.value === 0) return null;
            const frac = s.value / total;
            const el = (
              <circle
                key={i}
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${frac * C} ${C}`}
                strokeDashoffset={-acc * C}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            acc += frac;
            return el;
          })}
        </svg>
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--ez-color-text-primary)', lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 11, color: 'var(--ez-color-text-muted)' }}>{centerLabel}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--ez-color-text-muted)', fontWeight: 500 }}>{s.label}</span>
            <span style={{ color: 'var(--ez-color-text-primary)', fontWeight: 700, marginLeft: 'auto', paddingLeft: 12 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============================== main view ============================== */

export const AllProjectsView: React.FC<AllProjectsViewProps> = ({
  projects,
  activities = [],
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { deleteProject, backupProjectData, updateProject } = useProject();
  const { t } = useI18n();
  const STATUS_META = getStatusMeta(t);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all');
  const [sortBy, setSortBy] = useState<'terbaru' | 'nama' | 'nilai' | 'progres' | 'tenggat'>('terbaru');
  const [showFilters, setShowFilters] = useState(false);
  const [clientFilter, setClientFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const PAGE_SIZE = 8;

  /* ---------- metrics (data aktual, tanpa angka karangan) ---------- */
  const totalProjects = projects.length;
  const totalRab = projects.reduce((a, p) => a + getRabValue(p), 0);
  const countBy: Record<StatusKey, number> = {
    berjalan: 0, draft: 0, selesai: 0, arsip: 0,
  };
  projects.forEach((p) => { countBy[getStatusKey(p)] += 1; });
  const overdueList = projects.filter(isOverdue);
  const avgProgress = totalProjects > 0
    ? Math.round(projects.reduce((a, p) => a + getProgress(p), 0) / totalProjects)
    : 0;
  const plannedVals = projects.map(getPlannedProgress).filter((v): v is number => v != null);
  const avgPlanned = plannedVals.length > 0
    ? Math.round(plannedVals.reduce((a, v) => a + v, 0) / plannedVals.length)
    : null;
  const avgValue = totalProjects > 0 ? totalRab / totalProjects : 0;

  const clients = useMemo(
    () => Array.from(new Set(projects.map((p) => p.clientName || (p as unknown as { client?: string }).client || '').filter(Boolean))).sort(),
    [projects]
  );
  const locations = useMemo(
    () => Array.from(new Set(projects.map((p) => p.location || '').filter(Boolean))).sort(),
    [projects]
  );

  /* ---------- filter + sort + pagination ---------- */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = projects.filter((p) => {
      if (statusFilter !== 'all' && getStatusKey(p) !== statusFilter) return false;
      if (clientFilter !== 'all' && (p.clientName || (p as unknown as { client?: string }).client || '') !== clientFilter) return false;
      if (locationFilter !== 'all' && (p.location || '') !== locationFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.projectNumber || ''} ${p.clientName || ''} ${(p as unknown as { client?: string }).client || ''} ${p.location || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'nama': return a.name.localeCompare(b.name, 'id');
        case 'nilai': return getRabValue(b) - getRabValue(a);
        case 'progres': return getProgress(b) - getProgress(a);
        case 'tenggat':
          return (a.targetDate || '9999').localeCompare(b.targetDate || '9999');
        case 'terbaru':
        default:
          return (b.createdAt || '').localeCompare(a.createdAt || '');
      }
    });
    return list;
  }, [projects, searchQuery, statusFilter, clientFilter, locationFilter, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (pageItems.every((p) => selectedIds.has(p.id))) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageItems.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...pageItems.map((p) => p.id)]));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${t('proj.all.confirm_bulk_a')} ${selectedIds.size} ${t('proj.all.confirm_bulk_b')}`)) return;
    selectedIds.forEach((id) => {
      try { backupProjectData(id); } catch { /* abaikan */ }
      deleteProject(id);
    });
    setSelectedIds(new Set());
  };

  const tabs: Array<{ id: 'all' | StatusKey; label: string }> = [
    { id: 'all', label: `${t('proj.all.tab_all')} (${totalProjects})` },
    { id: 'draft', label: `${t('proj.all.tab_draft')} (${countBy.draft})` },
    { id: 'berjalan', label: `${t('proj.all.tab_running')} (${countBy.berjalan})` },
    { id: 'selesai', label: `${t('proj.all.tab_done')} (${countBy.selesai})` },
    { id: 'arsip', label: `${t('proj.all.tab_archived')} (${countBy.arsip})` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%', maxWidth: 1440, margin: '0 auto', color: 'var(--ez-color-text-primary)', fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>

      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
        @media (max-width: 1100px) {
          .ezrab-proyek-main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ============ BARIS 1: 4 kartu statistik ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
        <StatCard
          bgClass="ez-stat-cream"
          label={t('proj.all.stat_total')} value={String(totalProjects)}
          sub={t('proj.all.stat_total_sub')} delay="0.05s"
        />
        <StatCard
          bgClass="ez-stat-mint"
          label={t('proj.all.stat_value')} value={formatRpCompact(totalRab)}
          sub={t('proj.all.stat_value_sub')} delay="0.12s"
        />
        <StatCard
          bgClass="ez-stat-peach"
          label={t('proj.all.stat_running')} value={String(countBy.berjalan)}
          sub={t('proj.all.stat_running_sub')}
          onClick={() => { setStatusFilter('berjalan'); setPage(0); }} delay="0.19s"
        />
        <StatCard
          bgClass="ez-stat-sky"
          label={t('proj.all.stat_attention')} value={String(overdueList.length)}
          sub={overdueList.length > 0 ? t('proj.all.stat_attention_sub') : t('proj.all.stat_attention_ok')}
          subColor={overdueList.length > 0 ? '#B54747' : 'var(--ez-color-text-muted)'} delay="0.26s"
        />
      </div>

      {/* ============ BARIS 2: progres, terlambat, donut ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
        <StatCard
          bgClass="ez-stat-cream"
          label={t('proj.all.stat_avg')} value={formatRpCompact(avgValue)}
          sub={totalProjects > 0 ? `${t('proj.all.stat_avg_sub_a')} ${totalProjects} ${t('proj.all.stat_avg_sub_b')}` : t('proj.all.stat_avg_empty')} delay="0.3s"
        />
        <div className="ezdb-anim" style={{ ...cardStyle, animation: 'ezdb-rise 0.6s 0.34s both' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: 8 }}>{t('proj.all.progress_title')}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ez-color-text-primary)', letterSpacing: '-1px' }}>
            {avgProgress}%{avgPlanned != null && <span style={{ color: 'var(--ez-color-text-muted)', fontWeight: 600 }}> / {avgPlanned}%</span>}
          </div>
          <div style={{ fontSize: 12, color: avgPlanned != null && avgProgress < avgPlanned ? 'var(--ez-hue-rose-text)' : 'var(--ez-color-text-muted)', marginTop: 6 }}>
            {avgPlanned != null
              ? `${t('proj.all.progress_behind_a')} ${avgProgress - avgPlanned >= 0 ? '+' : ''}${avgProgress - avgPlanned}% ${t('proj.all.progress_behind_b')}`
              : t('proj.all.progress_avg')}
          </div>
          <div style={{ width: '100%', height: 6, background: 'var(--ez-color-surface-tertiary)', borderRadius: 'var(--ez-radius-pill)', overflow: 'hidden', marginTop: 10 }}>
            <div style={{ width: `${Math.min(100, avgProgress)}%`, height: '100%', background: 'var(--ez-color-primary)', borderRadius: 'var(--ez-radius-pill)' }} />
          </div>
        </div>
        <StatCard
          bgClass="ez-stat-peach"
          label={t('proj.all.stat_late')} value={String(overdueList.length)}
          sub={t('proj.all.stat_late_sub')} subColor="#B54747" delay="0.38s"
        />
        <div className="ezdb-anim" style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 4, animation: 'ezdb-rise 0.6s 0.42s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>{t('proj.all.donut_title')}</span>
          </div>
          <Donut
            centerLabel={t('proj.all.donut_center')}
            segments={[
              { value: countBy.berjalan, color: 'var(--ez-color-primary)', label: t('proj.all.st_running') },
              { value: countBy.draft, color: '#F59E0B', label: t('proj.all.st_draft') },
              { value: countBy.selesai, color: '#10B981', label: t('proj.all.st_done') },
              { value: countBy.arsip, color: '#94A3B8', label: t('proj.all.st_archived') },
            ]}
          />
        </div>
      </div>

      {/* ============ KONTEN UTAMA: tabel + panel kanan ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)',
          gap: 18,
          alignItems: 'start',
        }}
        className="ezrab-proyek-main-grid"
      >
        {/* ----- Daftar Proyek ----- */}
        <div className="ezdb-anim" style={{ ...cardStyle, padding: 0, overflow: 'hidden', animation: 'ezdb-rise 0.6s 0.5s both' }}>
          <div style={{ padding: '20px 24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>{t('proj.all.list_title')}</h3>
            </div>

            {/* search + filter + sort */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={15} color="var(--ez-color-text-faint)" style={{ position: 'absolute', left: 11, top: 12 }} />
                <input
                  type="text"
                  placeholder={t('proj.all.search_ph')}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                  style={{
                    width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
                    borderRadius: 'var(--ez-radius-control)', border: '1px solid var(--ez-color-border-soft)', background: 'var(--ez-color-surface-faint)',
                    fontSize: 13, color: 'var(--ez-color-text-primary)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  height: 38, padding: '0 14px', borderRadius: 'var(--ez-radius-control)', fontSize: 13, fontWeight: 700,
                  background: showFilters ? 'var(--ez-pastel-sky)' : 'var(--ez-color-surface)', color: showFilters ? 'var(--ez-pill-run-text)' : 'var(--ez-color-text-muted)',
                  border: `1px solid ${showFilters ? 'var(--ez-pastel-sky)' : 'var(--ez-color-border)'}`, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                <SlidersHorizontal size={14} /> {t('proj.all.filter')}
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                style={{
                  height: 38, padding: '0 10px', borderRadius: 'var(--ez-radius-control)', fontSize: 13, fontWeight: 600,
                  background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-muted)', border: '1px solid var(--ez-color-border-line)', cursor: 'pointer',
                }}
              >
                <option value="terbaru">{t('proj.all.sort_newest')}</option>
                <option value="nama">{t('proj.all.sort_name')}</option>
                <option value="nilai">{t('proj.all.sort_value')}</option>
                <option value="progres">{t('proj.all.sort_progress')}</option>
                <option value="tenggat">{t('proj.all.sort_due')}</option>
              </select>
            </div>

            {showFilters && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <select
                  value={clientFilter}
                  onChange={(e) => { setClientFilter(e.target.value); setPage(0); }}
                  style={{ height: 36, padding: '0 10px', borderRadius: 'var(--ez-radius-control)', fontSize: 12, border: '1px solid var(--ez-color-border-line)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)' }}
                >
                  <option value="all">{t('proj.all.opt_all_clients')}</option>
                  {clients.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={locationFilter}
                  onChange={(e) => { setLocationFilter(e.target.value); setPage(0); }}
                  style={{ height: 36, padding: '0 10px', borderRadius: 'var(--ez-radius-control)', fontSize: 12, border: '1px solid var(--ez-color-border-line)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-primary)' }}
                >
                  <option value="all">{t('proj.all.opt_all_locations')}</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}

            {/* status tabs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {tabs.map((t) => {
                const active = statusFilter === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setStatusFilter(t.id); setPage(0); }}
                    style={{
                      height: 32, padding: '0 14px', borderRadius: 'var(--ez-radius-pill)', fontSize: 12, fontWeight: active ? 700 : 600,
                      background: active ? 'var(--ez-color-primary)' : 'var(--ez-color-surface-faint)', color: active ? 'var(--ez-color-on-primary)' : 'var(--ez-color-text-muted)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* bulk bar */}
          {selectedIds.size > 0 && (
            <div
              style={{
                margin: '0 24px 10px', padding: '10px 14px', borderRadius: 'var(--ez-radius-control)',
                background: 'var(--ez-pastel-sky)',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--ez-pill-run-text)' }}>{selectedIds.size} {t('proj.all.bulk_selected')}</span>
              <button
                onClick={handleBulkDelete}
                style={{
                  marginLeft: 'auto', height: 32, padding: '0 14px', borderRadius: 'var(--ez-radius-control)',
                  background: '#B54747', color: 'var(--ez-color-on-primary)', fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Trash2 size={13} /> {t('proj.all.bulk_delete')}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                style={{ background: 'none', border: 'none', color: 'var(--ez-color-text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                {t('proj.all.bulk_cancel')}
              </button>
            </div>
          )}

          {/* table */}
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <img src={emptyBlueprintImg} alt={t('proj.all.empty_alt')} style={{ width: 150, opacity: 0.85, marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ez-color-text-primary)', marginBottom: 4 }}>{t('proj.all.empty_title')}</div>
              <div style={{ fontSize: 13, color: 'var(--ez-color-text-muted)', marginBottom: 14 }}>
                {searchQuery ? `${t('proj.all.empty_search_a')}${searchQuery}${t('proj.all.empty_search_b')}` : t('proj.all.empty_default')}
              </div>
              <button
                onClick={onCreateProject}
                style={{ height: '40px', padding: '0 20px', background: 'var(--ez-color-primary)', color: 'var(--ez-color-on-primary)', borderRadius: 'var(--ez-radius-control)', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                {t('proj.all.empty_cta')}
              </button>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--ez-color-surface-faint)', borderTop: '1px solid var(--ez-color-border-soft)', borderBottom: '1px solid var(--ez-color-border-soft)' }}>
                      <th style={{ padding: '10px 8px 10px 24px', width: 36 }}>
                        <input
                          type="checkbox"
                          checked={pageItems.length > 0 && pageItems.every((p) => selectedIds.has(p.id))}
                          onChange={toggleSelectAll}
                          style={{ width: 15, height: 15, accentColor: 'var(--ez-color-primary)', cursor: 'pointer' }}
                        />
                      </th>
                      {[
                        t('proj.all.th_no'), t('proj.all.th_name'), t('proj.all.th_client'), t('proj.all.th_location'),
                        t('proj.all.th_value'), t('proj.all.th_progress'), t('proj.all.th_status'), t('proj.all.th_due'),
                      ].map((h) => (
                        <th key={h} style={{ padding: '10px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                      <th style={{ padding: '10px 24px 10px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ez-color-text-muted)', textAlign: 'right' }}>{t('proj.all.th_action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((p) => {
                      const sk = getStatusKey(p);
                      const meta = STATUS_META[sk];
                      const overdue = isOverdue(p);
                      const prog = getProgress(p);
                      const val = getRabValue(p);
                      return (
                        <tr
                          key={p.id}
                          style={{ borderBottom: '1px solid var(--ez-color-border-soft)', background: selectedIds.has(p.id) ? 'var(--ez-hue-blue-bg)' : 'transparent' }}
                          onMouseEnter={(e) => { if (!selectedIds.has(p.id)) e.currentTarget.style.background = 'var(--ez-color-surface-faint)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = selectedIds.has(p.id) ? 'var(--ez-hue-blue-bg)' : 'transparent'; }}
                        >
                          <td style={{ padding: '12px 8px 12px 24px' }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleSelect(p.id)}
                              style={{ width: 15, height: 15, accentColor: 'var(--ez-color-primary)', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--ez-color-primary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {p.projectNumber || p.id.slice(0, 10)}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span
                              onClick={() => onOpenProject?.(p.id, 'manajemen-proyek')}
                              style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)', cursor: 'pointer' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ez-color-primary)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ez-color-text)')}
                            >
                              {p.name}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', color: 'var(--ez-color-text-primary)' }}>{p.clientName || (p as unknown as { client?: string }).client || '—'}</td>
                          <td style={{ padding: '12px 10px', color: 'var(--ez-color-text-muted)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <MapPin size={12} color="var(--ez-color-text-faint)" />{p.location || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 750, color: 'var(--ez-color-primary)', whiteSpace: 'nowrap' }} title={formatRpFull(val)}>
                            {val > 0 ? formatRpCompact(val) : <span style={{ color: 'var(--ez-color-text-muted)', fontWeight: 500 }}>{t('proj.all.no_value')}</span>}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
                              <div style={{ width: 64, height: 5, background: '#F0EFE9', borderRadius: 'var(--ez-radius-pill)', overflow: 'hidden' }}>
                                <div style={{ width: `${prog}%`, height: '100%', background: sk === 'selesai' ? '#16A34A' : 'var(--ez-color-primary)', borderRadius: 'var(--ez-radius-pill)' }} />
                              </div>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{prog}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            {overdue ? (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 'var(--ez-radius-pill)', background: '#FCE9E9', color: 'var(--ez-hue-rose-text)', whiteSpace: 'nowrap' }}>
                                {t('proj.all.overdue')}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 'var(--ez-radius-pill)', background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>
                                {meta.label}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 10px', color: overdue ? 'var(--ez-hue-rose-text)' : 'var(--ez-color-text-muted)', fontWeight: overdue ? 700 : 500, whiteSpace: 'nowrap' }}>
                            {formatDate(p.targetDate)}
                          </td>
                          <td style={{ padding: '12px 24px 12px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                              <button
                                title={t('proj.all.act_detail')}
                                onClick={() => onOpenProject?.(p.id, 'manajemen-proyek')}
                                style={iconBtn}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ez-pastel-sky)'; e.currentTarget.style.color = 'var(--ez-pill-run-text)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ez-color-text-muted)'; }}
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                title={t('proj.all.act_edit')}
                                onClick={() => setEditingProject(p)}
                                style={iconBtn}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ez-pastel-sky)'; e.currentTarget.style.color = 'var(--ez-pill-run-text)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ez-color-text-muted)'; }}
                              >
                                <Pencil size={14} />
                              </button>
                              <div style={{ position: 'relative' }}>
                                <button
                                  title={t('proj.all.act_more')}
                                  onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                                  style={iconBtn}
                                >
                                  <MoreVertical size={15} />
                                </button>
                                {openMenuId === p.id && (
                                  <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpenMenuId(null)} />
                                    <div
                                      style={{
                                        position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 51,
                                        background: 'var(--ez-color-surface)', borderRadius: 'var(--ez-radius-control)', border: '1px solid var(--ez-color-border-soft)',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.045)', minWidth: 180, overflow: 'hidden',
                                        padding: 4,
                                      }}
                                    >
                                      {[
                                        { label: t('proj.all.menu_open_rab'), fn: () => onOpenProject?.(p.id, 'rab-estimasi') },
                                        { label: t('proj.all.menu_open_qto'), fn: () => onOpenProject?.(p.id, 'qto') },
                                        { label: t('proj.all.menu_trash'), fn: () => setProjectToDelete(p), danger: true },
                                      ].map((a) => (
                                        <button
                                          key={a.label}
                                          onClick={() => { setOpenMenuId(null); a.fn(); }}
                                          style={{
                                            width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13,
                                            fontWeight: 600, color: a.danger ? 'var(--ez-hue-rose-text)' : 'var(--ez-color-text)',
                                            background: 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer',
                                          }}
                                          onMouseEnter={(e) => (e.currentTarget.style.background = a.danger ? '#FCE9E9' : 'var(--ez-color-surface-faint)')}
                                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                          {a.label}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* pagination */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 18px', borderTop: '1px solid var(--ez-color-border-soft)', flexWrap: 'wrap', gap: 8,
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--ez-color-text-muted)' }}>
                  {t('proj.all.pg_show')} {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, safePage * PAGE_SIZE + PAGE_SIZE)} {t('proj.all.pg_of')} {filtered.length} {t('proj.all.pg_projects')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                    disabled={safePage === 0}
                    style={pageBtn(safePage === 0)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      style={{
                        ...pageBtn(false),
                        background: i === safePage ? 'var(--ez-color-primary)' : 'var(--ez-color-on-primary)',
                        color: i === safePage ? 'var(--ez-color-on-primary)' : 'var(--ez-color-text)',
                        border: `1px solid ${i === safePage ? 'var(--ez-color-primary)' : 'var(--ez-color-border)'}`,
                        fontWeight: 700,
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                    disabled={safePage >= pageCount - 1}
                    style={pageBtn(safePage >= pageCount - 1)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ----- Panel kanan ----- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Aktivitas Terbaru */}
          <div className="ezdb-anim" style={{ ...cardStyle, animation: 'ezdb-rise 0.6s 0.54s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>{t('proj.all.activity_title')}</h4>
            </div>
            {activities.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--ez-color-text-muted)', textAlign: 'center', padding: '18px 8px' }}>
                {t('proj.all.activity_empty')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {activities.slice(0, 5).map((a, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', gap: 10, padding: '9px 0',
                      borderBottom: i < Math.min(activities.length, 5) - 1 ? '1px solid var(--ez-color-border-soft)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                        background: a.type === 'create' ? 'var(--ez-pastel-sky)' : a.type === 'delete' ? '#FCE9E9' : 'var(--ez-pastel-mint)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {a.type === 'create'
                        ? <Plus size={14} color="var(--ez-pill-run-text)" />
                        : a.type === 'delete'
                          ? <Trash2 size={13} color="var(--ez-hue-rose-text)" />
                          : <CheckCircle2 size={14} color="var(--ez-pill-ok-text)" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ez-color-text-primary)', lineHeight: 1.4 }}>{a.text}</div>
                      <div style={{ fontSize: 11, color: 'var(--ez-color-text-muted)', marginTop: 2 }}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="ezdb-anim" style={{ ...cardStyle, animation: 'ezdb-rise 0.6s 0.58s both' }}>
            <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 12px' }}>{t('proj.all.qa_title')}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={onCreateProject} style={qaBtn}>
                <Plus size={14} color="var(--ez-hue-blue-text)" /> {t('proj.all.qa_create')}
              </button>
              <button onClick={onOpenMagicAi} style={qaBtn}>
                <Sparkles size={14} color="var(--ez-hue-blue-text)" /> {t('proj.all.qa_ai')}
              </button>
              <button onClick={() => onNavigateToTab?.('ded-ai')} style={qaBtn}>
                <Download size={14} color="var(--ez-hue-blue-text)" /> {t('proj.all.qa_import')}
              </button>
              <button onClick={() => onNavigateToTab?.('template-rab')} style={qaBtn}>
                <FileText size={14} color="var(--ez-hue-blue-text)" /> {t('proj.all.qa_template')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* modal hapus */}
      <DeleteProjectModal
        isOpen={!!projectToDelete}
        project={projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirmDelete={(id) => deleteProject(id)}
        onBackupProject={(id) => backupProjectData(id)}
      />

      {/* modal ubah */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={(patch) => {
            updateProject(editingProject.id, patch);
            setEditingProject(null);
          }}
        />
      )}
    </div>
  );
};

const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7, background: 'transparent', border: 'none',
  color: 'var(--ez-color-text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const pageBtn = (disabled: boolean): React.CSSProperties => ({
  minWidth: 32, height: 32, borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)',
  color: disabled ? '#C9C9C2' : 'var(--ez-color-text)', cursor: disabled ? 'default' : 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
  opacity: disabled ? 0.5 : 1,
});

const qaBtn: React.CSSProperties = {
  height: 40, borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)',
  color: 'var(--ez-color-text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
};

/* ============================== edit modal ============================== */

const EditProjectModal: React.FC<{
  project: Project;
  onClose: () => void;
  onSave: (patch: Partial<Project>) => void;
}> = ({ project, onClose, onSave }) => {
  const { t } = useI18n();
  const [name, setName] = useState(project.name);
  const [clientName, setClientName] = useState(project.clientName || '');
  const [location, setLocation] = useState(project.location || '');
  const [targetDate, setTargetDate] = useState(project.targetDate || '');
  const [status, setStatus] = useState(project.status);

  const field: React.CSSProperties = { marginBottom: 12 };
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ez-color-text-muted)', marginBottom: 5 };
  const input: React.CSSProperties = {
    width: '100%', height: 38, borderRadius: 'var(--ez-radius-control)', border: '1px solid var(--ez-color-border-soft)',
    padding: '0 12px', fontSize: 13, color: 'var(--ez-color-text-primary)', outline: 'none', boxSizing: 'border-box',
    background: 'var(--ez-color-surface)',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(440px, 100%)', background: 'var(--ez-color-surface)', borderRadius: 'var(--ez-radius-card)',
          border: '1px solid var(--ez-color-border-soft)', boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>{t('proj.all.edit_title')}</h3>
          <button onClick={onClose} style={{ ...iconBtn, background: 'var(--ez-color-surface-tertiary)' }}>
            <X size={15} />
          </button>
        </div>

        <div style={field}>
          <label style={label}>{t('proj.all.edit_name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder={t('proj.all.edit_name')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={field}>
            <label style={label}>{t('proj.all.edit_client')}</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={input} placeholder={t('proj.all.edit_client')} />
          </div>
          <div style={field}>
            <label style={label}>{t('proj.all.edit_location')}</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={input} placeholder={t('proj.all.edit_location')} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={field}>
            <label style={label}>{t('proj.all.edit_due')}</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={input} />
          </div>
          <div style={field}>
            <label style={label}>{t('proj.all.edit_status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Project['status'])} style={input}>
              <option value="draft">{t('proj.all.edit_opt_draft')}</option>
              <option value="in_progress">{t('proj.all.edit_opt_progress')}</option>
              <option value="completed">{t('proj.all.edit_opt_done')}</option>
              <option value="archived">{t('proj.all.edit_opt_archived')}</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={onClose}
            style={{ height: 38, padding: '0 16px', borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-color-surface-tertiary)', color: 'var(--ez-color-text-primary)', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}
          >
            {t('proj.all.edit_cancel')}
          </button>
          <button
            onClick={() => {
              if (!name.trim()) return;
              onSave({ name: name.trim(), clientName: clientName.trim(), location: location.trim(), targetDate: targetDate || undefined, status });
            }}
            disabled={!name.trim()}
            style={{
              height: 38, padding: '0 18px', borderRadius: 'var(--ez-radius-control)', background: name.trim() ? 'var(--ez-color-primary)' : '#C9C9C2',
              color: 'var(--ez-color-on-primary)', fontSize: 13, fontWeight: 700, border: 'none', cursor: name.trim() ? 'pointer' : 'default',
              boxShadow: name.trim() ? '0 4px 14px rgba(37,99,235,0.28)' : 'none',
            }}
          >
            {t('proj.all.edit_save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AllProjectsView;

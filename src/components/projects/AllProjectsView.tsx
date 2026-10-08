import React, { useState, useMemo } from 'react';
import {
  Folder,
  Plus,
  Sparkles,
  Search,
  Play,
  CheckCircle2,
  FileText,
  Archive,
  TrendingUp,
  MapPin,
  Eye,
  Pencil,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Trash2,
  SlidersHorizontal,
  Download,
  Layers,
  Bell,
  X,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
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

const STATUS_META: Record<StatusKey, { label: string; bg: string; color: string; dot: string }> = {
  berjalan: { label: 'Berjalan', bg: '#DBEAFE', color: '#1D4ED8', dot: '#2563EB' },
  draft: { label: 'Draft', bg: '#FEF3C7', color: '#B45309', dot: '#F59E0B' },
  selesai: { label: 'Selesai', bg: '#DCFCE7', color: '#15803D', dot: '#10B981' },
  arsip: { label: 'Arsip', bg: '#F1F5F9', color: '#64748B', dot: '#94A3B8' },
};

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
  background: '#FFFFFF',
  borderRadius: 16,
  border: '1px solid #DFE8F5',
  padding: '16px 18px',
  boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  subColor?: string;
  onClick?: () => void;
}> = ({ icon, iconBg, label, value, sub, subColor = '#64748B', onClick }) => (
  <div
    style={{ ...cardStyle, cursor: onClick ? 'pointer' : 'default' }}
    onClick={onClick}
    onMouseEnter={onClick ? (e) => (e.currentTarget.style.boxShadow = '0 4px 14px rgba(37,99,235,0.10)') : undefined}
    onMouseLeave={onClick ? (e) => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(15,23,42,0.04)') : undefined}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: 10, background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#64748B' }}>{label}</span>
    </div>
    <div style={{ fontSize: 26, fontWeight: 800, color: '#10213D', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
      {value}
    </div>
    <div style={{ fontSize: 11.5, color: subColor, marginTop: 4, fontWeight: 500 }}>{sub}</div>
  </div>
);

const Donut: React.FC<{ segments: Array<{ value: number; color: string; label: string }> }> = ({ segments }) => {
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
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
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
          <span style={{ fontSize: 24, fontWeight: 800, color: '#10213D', lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 11, color: '#64748B' }}>Proyek</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: '#64748B', fontWeight: 500 }}>{s.label}</span>
            <span style={{ color: '#10213D', fontWeight: 700, marginLeft: 'auto', paddingLeft: 12 }}>{s.value}</span>
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
    if (!window.confirm(`Hapus ${selectedIds.size} proyek terpilih? Data akan dicadangkan dulu bila fitur backup tersedia.`)) return;
    selectedIds.forEach((id) => {
      try { backupProjectData(id); } catch { /* abaikan */ }
      deleteProject(id);
    });
    setSelectedIds(new Set());
  };

  const tabs: Array<{ id: 'all' | StatusKey; label: string }> = [
    { id: 'all', label: `Semua (${totalProjects})` },
    { id: 'draft', label: `Draft (${countBy.draft})` },
    { id: 'berjalan', label: `Berjalan (${countBy.berjalan})` },
    { id: 'selesai', label: `Selesai (${countBy.selesai})` },
    { id: 'arsip', label: `Arsip (${countBy.arsip})` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 1680, margin: '0 auto' }}>

      {/* ============ BARIS 1: 4 kartu statistik ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        <StatCard
          icon={<Folder size={18} color="#2563EB" />} iconBg="#EFF6FF"
          label="Total Proyek" value={String(totalProjects)}
          sub="Semua status"
        />
        <StatCard
          icon={<span style={{ fontWeight: 800, fontSize: 13, color: '#059669' }}>Rp</span>} iconBg="#ECFDF5"
          label="Total Nilai Estimasi" value={formatRpCompact(totalRab)}
          sub="Akumulasi semua proyek" subColor="#059669"
        />
        <StatCard
          icon={<Play size={15} color="#2563EB" fill="#2563EB" />} iconBg="#EFF6FF"
          label="Proyek Berjalan" value={String(countBy.berjalan)}
          sub="Monitoring progres & kurva S" subColor="#2563EB"
          onClick={() => { setStatusFilter('berjalan'); setPage(0); }}
        />
        <StatCard
          icon={<Bell size={17} color="#D97706" />} iconBg="#FEF3C7"
          label="Perlu Perhatian" value={String(overdueList.length)}
          sub={overdueList.length > 0 ? 'Tenggat lewat / perlu tindakan' : 'Tidak ada proyek bermasalah'}
          subColor={overdueList.length > 0 ? '#D97706' : '#64748B'}
        />
      </div>

      {/* ============ BARIS 2: progres, terlambat, donut ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        <StatCard
          icon={<TrendingUp size={17} color="#059669" />} iconBg="#ECFDF5"
          label="Rata-rata Nilai Proyek" value={formatRpCompact(avgValue)}
          sub={totalProjects > 0 ? `Dari ${totalProjects} proyek` : 'Belum ada proyek'}
        />
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Layers size={17} color="#2563EB" />
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#64748B' }}>Progres Aktual vs Rencana</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#10213D', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {avgProgress}%{avgPlanned != null && <span style={{ color: '#94A3B8', fontWeight: 600 }}> / {avgPlanned}%</span>}
          </div>
          <div style={{ fontSize: 11.5, color: avgPlanned != null && avgProgress < avgPlanned ? '#DC2626' : '#64748B', marginTop: 4, fontWeight: 500 }}>
            {avgPlanned != null
              ? `Selisih ${avgProgress - avgPlanned >= 0 ? '+' : ''}${avgProgress - avgPlanned}% dari jadwal`
              : 'Rata-rata progres aktual'}
          </div>
          <div style={{ width: '100%', height: 6, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${Math.min(100, avgProgress)}%`, height: '100%', background: 'linear-gradient(90deg,#2563EB,#10B981)', borderRadius: 999 }} />
          </div>
        </div>
        <StatCard
          icon={<FileText size={17} color="#DC2626" />} iconBg="#FEE2E2"
          label="Proyek Terlambat" value={String(overdueList.length)}
          sub="Perlu tindakan segera" subColor="#DC2626"
        />
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#64748B' }}>Status Proyek</span>
          </div>
          <Donut
            segments={[
              { value: countBy.berjalan, color: '#2563EB', label: 'Berjalan' },
              { value: countBy.draft, color: '#F59E0B', label: 'Draft' },
              { value: countBy.selesai, color: '#10B981', label: 'Selesai' },
              { value: countBy.arsip, color: '#94A3B8', label: 'Arsip' },
            ]}
          />
        </div>
      </div>

      {/* ============ BANNER EZRAB MAGIC AI ============ */}
      <div
        style={{
          borderRadius: 20,
          background: 'linear-gradient(120deg, #071A36 0%, #0B2A5B 55%, #123A8F 100%)',
          padding: '26px 30px',
          display: 'flex',
          alignItems: 'center',
          gap: 26,
          position: 'relative',
          overflow: 'hidden',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            position: 'absolute', right: -60, top: -60, width: 280, height: 280,
            borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <img
          src="/images/ezrab-mascot-greeting.png"
          alt="Maskot EZRAB"
          style={{ width: 104, height: 104, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.35))' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <div style={{ flex: 1, minWidth: 260, zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
              borderRadius: 999, background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(147,197,253,0.35)',
              color: '#BFDBFE', fontSize: 11, fontWeight: 700, marginBottom: 10,
            }}
          >
            <Sparkles size={12} /> AI POWERED
          </div>
          <h2 style={{ fontSize: 21, fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Buat Proyek Lebih Cepat dengan EZRAB Magic AI
          </h2>
          <p style={{ fontSize: 13, color: '#BFDBFE', margin: '0 0 14px', lineHeight: 1.55, maxWidth: 560 }}>
            Dari deskripsi proyek, gambar kerja, atau dokumen DED — kami bantu buat RAB,
            analisis volume, dan QTO secara otomatis. Hasil selalu bisa ditinjau sebelum disimpan.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {['Buat RAB dari deskripsi', 'Analisis DED/PDF/Gambar', 'Ekstrak volume & QTO', 'Tinjau & simpan ke proyek'].map((c) => (
              <span
                key={c}
                style={{
                  fontSize: 11.5, fontWeight: 600, color: '#DBEAFE',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(147,197,253,0.25)',
                  padding: '5px 10px', borderRadius: 8,
                }}
              >
                {c}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={onOpenMagicAi}
              style={{
                height: 38, padding: '0 18px', borderRadius: 10, background: '#2563EB', color: '#fff',
                fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
              }}
            >
              Mulai dengan AI <Sparkles size={14} />
            </button>
            <button
              onClick={onCreateProject}
              style={{
                height: 38, padding: '0 18px', borderRadius: 10, background: '#FFFFFF', color: '#0F172A',
                fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
              }}
            >
              Buat Manual
            </button>
          </div>
        </div>
      </div>

      {/* ============ KONTEN UTAMA: tabel + panel kanan ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)',
          gap: 14,
          alignItems: 'start',
        }}
        className="ezrab-proyek-main-grid"
      >
        {/* ----- Daftar Proyek ----- */}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Folder size={16} color="#2563EB" />
              </div>
              <h3 style={{ fontSize: 15.5, fontWeight: 800, color: '#10213D', margin: 0 }}>Daftar Proyek</h3>
            </div>

            {/* search + filter + sort */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: 11 }} />
                <input
                  type="text"
                  placeholder="Cari nama proyek, klien, lokasi, atau nomor proyek..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                  style={{
                    width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
                    borderRadius: 9, border: '1px solid #DFE8F5', background: '#F8FAFC',
                    fontSize: 12.5, color: '#0F172A', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  height: 38, padding: '0 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                  background: showFilters ? '#EFF6FF' : '#FFFFFF', color: showFilters ? '#2563EB' : '#475569',
                  border: `1px solid ${showFilters ? '#BFDBFE' : '#DFE8F5'}`, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                <SlidersHorizontal size={14} /> Filter
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                style={{
                  height: 38, padding: '0 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
                  background: '#FFFFFF', color: '#475569', border: '1px solid #DFE8F5', cursor: 'pointer',
                }}
              >
                <option value="terbaru">Terbaru</option>
                <option value="nama">Nama A–Z</option>
                <option value="nilai">Nilai terbesar</option>
                <option value="progres">Progres terbesar</option>
                <option value="tenggat">Tenggat terdekat</option>
              </select>
            </div>

            {showFilters && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <select
                  value={clientFilter}
                  onChange={(e) => { setClientFilter(e.target.value); setPage(0); }}
                  style={{ height: 34, padding: '0 10px', borderRadius: 8, fontSize: 12, border: '1px solid #DFE8F5', background: '#fff', color: '#334155' }}
                >
                  <option value="all">Semua klien</option>
                  {clients.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={locationFilter}
                  onChange={(e) => { setLocationFilter(e.target.value); setPage(0); }}
                  style={{ height: 34, padding: '0 10px', borderRadius: 8, fontSize: 12, border: '1px solid #DFE8F5', background: '#fff', color: '#334155' }}
                >
                  <option value="all">Semua lokasi</option>
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
                      height: 30, padding: '0 13px', borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500,
                      background: active ? '#2563EB' : '#F8FAFC', color: active ? '#fff' : '#64748B',
                      border: `1px solid ${active ? '#2563EB' : '#E2E8F0'}`, cursor: 'pointer',
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
                margin: '0 18px 10px', padding: '8px 12px', borderRadius: 9,
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5,
              }}
            >
              <span style={{ fontWeight: 700, color: '#1D4ED8' }}>{selectedIds.size} dipilih</span>
              <button
                onClick={handleBulkDelete}
                style={{
                  marginLeft: 'auto', height: 30, padding: '0 12px', borderRadius: 7,
                  background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Trash2 size={13} /> Hapus
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Batal
              </button>
            </div>
          )}

          {/* table */}
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <img src={emptyBlueprintImg} alt="Kosong" style={{ width: 150, opacity: 0.85, marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Tidak ada proyek yang sesuai</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 14 }}>
                {searchQuery ? `Tidak ditemukan untuk "${searchQuery}".` : 'Mulai dengan membuat proyek baru.'}
              </div>
              <button
                onClick={onCreateProject}
                style={{ padding: '8px 16px', background: '#2563EB', color: '#fff', borderRadius: 8, border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                + Buat Proyek Baru
              </button>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderTop: '1px solid #EEF2F7', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '10px 8px 10px 18px', width: 36 }}>
                        <input
                          type="checkbox"
                          checked={pageItems.length > 0 && pageItems.every((p) => selectedIds.has(p.id))}
                          onChange={toggleSelectAll}
                          style={{ width: 15, height: 15, accentColor: '#2563EB', cursor: 'pointer' }}
                        />
                      </th>
                      {['No. Proyek', 'Nama Proyek', 'Klien', 'Lokasi', 'Nilai Estimasi', 'Progres', 'Status', 'Tenggat'].map((h) => (
                        <th key={h} style={{ padding: '10px 10px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                      <th style={{ padding: '10px 18px 10px 10px', fontSize: 11, fontWeight: 700, color: '#64748B', textAlign: 'right' }}>Aksi</th>
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
                          style={{ borderBottom: '1px solid #F1F5F9', background: selectedIds.has(p.id) ? '#F5F9FF' : 'transparent' }}
                          onMouseEnter={(e) => { if (!selectedIds.has(p.id)) e.currentTarget.style.background = '#F8FAFC'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = selectedIds.has(p.id) ? '#F5F9FF' : 'transparent'; }}
                        >
                          <td style={{ padding: '12px 8px 12px 18px' }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleSelect(p.id)}
                              style={{ width: 15, height: 15, accentColor: '#2563EB', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 700, color: '#2563EB', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {p.projectNumber || p.id.slice(0, 10)}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span
                              onClick={() => onOpenProject?.(p.id, 'manajemen-proyek')}
                              style={{ fontWeight: 700, color: '#10213D', cursor: 'pointer' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#10213D')}
                            >
                              {p.name}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', color: '#334155' }}>{p.clientName || (p as unknown as { client?: string }).client || '—'}</td>
                          <td style={{ padding: '12px 10px', color: '#64748B' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <MapPin size={12} color="#94A3B8" />{p.location || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 750, color: '#2563EB', whiteSpace: 'nowrap' }} title={formatRpFull(val)}>
                            {val > 0 ? formatRpCompact(val) : <span style={{ color: '#94A3B8', fontWeight: 500 }}>Belum dihitung</span>}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
                              <div style={{ width: 64, height: 5, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
                                <div style={{ width: `${prog}%`, height: '100%', background: sk === 'selesai' ? '#10B981' : '#2563EB', borderRadius: 999 }} />
                              </div>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#334155' }}>{prog}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            {overdue ? (
                              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, fontWeight: 700, background: '#FEE2E2', color: '#DC2626', whiteSpace: 'nowrap' }}>
                                ● Terlambat
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>
                                ● {meta.label}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 10px', color: overdue ? '#DC2626' : '#64748B', fontWeight: overdue ? 700 : 500, whiteSpace: 'nowrap' }}>
                            {formatDate(p.targetDate)}
                          </td>
                          <td style={{ padding: '12px 18px 12px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                              <button
                                title="Lihat detail"
                                onClick={() => onOpenProject?.(p.id, 'manajemen-proyek')}
                                style={iconBtn}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.color = '#2563EB'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748B'; }}
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                title="Ubah proyek"
                                onClick={() => setEditingProject(p)}
                                style={iconBtn}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.color = '#2563EB'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748B'; }}
                              >
                                <Pencil size={14} />
                              </button>
                              <div style={{ position: 'relative' }}>
                                <button
                                  title="Aksi lainnya"
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
                                        background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0',
                                        boxShadow: '0 10px 28px rgba(15,23,42,0.12)', minWidth: 180, overflow: 'hidden',
                                        padding: 4,
                                      }}
                                    >
                                      {[
                                        { label: 'Buka RAB', fn: () => onOpenProject?.(p.id, 'rab-estimasi') },
                                        { label: 'Buka QTO', fn: () => onOpenProject?.(p.id, 'qto') },
                                        { label: 'Hapus & cadangkan', fn: () => setProjectToDelete(p), danger: true },
                                      ].map((a) => (
                                        <button
                                          key={a.label}
                                          onClick={() => { setOpenMenuId(null); a.fn(); }}
                                          style={{
                                            width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12.5,
                                            fontWeight: 600, color: a.danger ? '#DC2626' : '#334155',
                                            background: 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer',
                                          }}
                                          onMouseEnter={(e) => (e.currentTarget.style.background = a.danger ? '#FEF2F2' : '#F8FAFC')}
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
                  padding: '12px 18px', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap', gap: 8,
                }}
              >
                <span style={{ fontSize: 12, color: '#64748B' }}>
                  Menampilkan {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, safePage * PAGE_SIZE + PAGE_SIZE)} dari {filtered.length} proyek
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
                        background: i === safePage ? '#2563EB' : '#fff',
                        color: i === safePage ? '#fff' : '#475569',
                        border: `1px solid ${i === safePage ? '#2563EB' : '#E2E8F0'}`,
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Aktivitas Terbaru */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#10213D', margin: 0 }}>Aktivitas Terbaru</h4>
            </div>
            {activities.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '18px 8px' }}>
                Belum ada aktivitas tercatat.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {activities.slice(0, 5).map((a, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', gap: 10, padding: '9px 0',
                      borderBottom: i < Math.min(activities.length, 5) - 1 ? '1px solid #F1F5F9' : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                        background: a.type === 'create' ? '#EFF6FF' : a.type === 'delete' ? '#FEE2E2' : '#F0FDF4',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {a.type === 'create'
                        ? <Plus size={14} color="#2563EB" />
                        : a.type === 'delete'
                          ? <Trash2 size={13} color="#DC2626" />
                          : <CheckCircle2 size={14} color="#059669" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', lineHeight: 1.4 }}>{a.text}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={cardStyle}>
            <h4 style={{ fontSize: 13.5, fontWeight: 800, color: '#10213D', margin: '0 0 12px' }}>Quick Actions</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={onCreateProject} style={qaBtn}>
                <Plus size={14} color="#2563EB" /> Buat Proyek
              </button>
              <button onClick={onOpenMagicAi} style={qaBtn}>
                <Sparkles size={14} color="#2563EB" /> Buat dengan AI
              </button>
              <button onClick={() => onNavigateToTab?.('ded-ai')} style={qaBtn}>
                <Download size={14} color="#2563EB" /> Import DED/PDF
              </button>
              <button onClick={() => onNavigateToTab?.('template-rab')} style={qaBtn}>
                <FileText size={14} color="#2563EB" /> Template RAB
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .ezrab-proyek-main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

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
  color: '#64748B', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const pageBtn = (disabled: boolean): React.CSSProperties => ({
  minWidth: 30, height: 30, borderRadius: 7, background: '#fff', border: '1px solid #E2E8F0',
  color: disabled ? '#CBD5E1' : '#475569', cursor: disabled ? 'default' : 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
  opacity: disabled ? 0.5 : 1,
});

const qaBtn: React.CSSProperties = {
  height: 40, borderRadius: 9, background: '#F8FAFC', border: '1px solid #E2E8F0',
  color: '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
};

/* ============================== edit modal ============================== */

const EditProjectModal: React.FC<{
  project: Project;
  onClose: () => void;
  onSave: (patch: Partial<Project>) => void;
}> = ({ project, onClose, onSave }) => {
  const [name, setName] = useState(project.name);
  const [clientName, setClientName] = useState(project.clientName || '');
  const [location, setLocation] = useState(project.location || '');
  const [targetDate, setTargetDate] = useState(project.targetDate || '');
  const [status, setStatus] = useState(project.status);

  const field: React.CSSProperties = { marginBottom: 12 };
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 };
  const input: React.CSSProperties = {
    width: '100%', height: 38, borderRadius: 9, border: '1px solid #DFE8F5',
    padding: '0 12px', fontSize: 13, color: '#0F172A', outline: 'none', boxSizing: 'border-box',
    background: '#fff',
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
          width: 'min(440px, 100%)', background: '#fff', borderRadius: 18,
          border: '1px solid #E2E8F0', boxShadow: '0 24px 64px rgba(15,23,42,0.2)',
          padding: 22,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#10213D', margin: 0 }}>Ubah Proyek</h3>
          <button onClick={onClose} style={{ ...iconBtn, background: '#F1F5F9' }}>
            <X size={15} />
          </button>
        </div>

        <div style={field}>
          <label style={label}>Nama proyek</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="Nama proyek" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={field}>
            <label style={label}>Klien</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={input} placeholder="Klien" />
          </div>
          <div style={field}>
            <label style={label}>Lokasi</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={input} placeholder="Lokasi" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={field}>
            <label style={label}>Tenggat</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={input} />
          </div>
          <div style={field}>
            <label style={label}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Project['status'])} style={input}>
              <option value="draft">Draft</option>
              <option value="in_progress">Sedang dikerjakan</option>
              <option value="completed">Selesai</option>
              <option value="archived">Arsip</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={onClose}
            style={{ height: 38, padding: '0 16px', borderRadius: 9, background: '#F1F5F9', color: '#475569', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}
          >
            Batal
          </button>
          <button
            onClick={() => {
              if (!name.trim()) return;
              onSave({ name: name.trim(), clientName: clientName.trim(), location: location.trim(), targetDate: targetDate || undefined, status });
            }}
            disabled={!name.trim()}
            style={{
              height: 38, padding: '0 18px', borderRadius: 9, background: name.trim() ? '#2563EB' : '#CBD5E1',
              color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: name.trim() ? 'pointer' : 'default',
            }}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
};

export default AllProjectsView;

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

const STATUS_META: Record<StatusKey, { label: string; bg: string; color: string }> = {
  berjalan: { label: 'Berjalan', bg: '#E3EEFB', color: '#2456A8' },
  draft: { label: 'Draft', bg: '#FDF3D8', color: '#A8780A' },
  selesai: { label: 'Selesai', bg: '#E2F4D8', color: '#2C6E2C' },
  arsip: { label: 'Arsip', bg: '#F1F5F9', color: '#64748B' },
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
  borderRadius: 22,
  border: '1px solid #EEF1F6',
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
}> = ({ bgClass, label, value, sub, subColor = '#6B6B64', onClick, delay = '0s' }) => (
  <div
    className={`ezdb-anim ez-stat ${bgClass}`}
    style={{ cursor: onClick ? 'pointer' : 'default', animation: `ezdb-rise 0.6s ${delay} both` }}
    onClick={onClick}
  >
    <div style={{ fontSize: 12, fontWeight: 600, color: '#6B6B64', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
      {value}
    </div>
    <div style={{ fontSize: 12, color: subColor, marginTop: 6 }}>{sub}</div>
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
          <span style={{ fontSize: 24, fontWeight: 800, color: '#141412', lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 11, color: '#8A8A84' }}>Proyek</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: '#6B6B64', fontWeight: 500 }}>{s.label}</span>
            <span style={{ color: '#141412', fontWeight: 700, marginLeft: 'auto', paddingLeft: 12 }}>{s.value}</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%', maxWidth: 1440, margin: '0 auto', color: '#141412', fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>

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
          label="Total Proyek" value={String(totalProjects)}
          sub="Semua status" delay="0.05s"
        />
        <StatCard
          bgClass="ez-stat-mint"
          label="Total Nilai Estimasi" value={formatRpCompact(totalRab)}
          sub="Akumulasi semua proyek" delay="0.12s"
        />
        <StatCard
          bgClass="ez-stat-peach"
          label="Proyek Berjalan" value={String(countBy.berjalan)}
          sub="Monitoring progres & kurva S"
          onClick={() => { setStatusFilter('berjalan'); setPage(0); }} delay="0.19s"
        />
        <StatCard
          bgClass="ez-stat-sky"
          label="Perlu Perhatian" value={String(overdueList.length)}
          sub={overdueList.length > 0 ? 'Tenggat lewat / perlu tindakan' : 'Tidak ada proyek bermasalah'}
          subColor={overdueList.length > 0 ? '#B54747' : '#6B6B64'} delay="0.26s"
        />
      </div>

      {/* ============ BARIS 2: progres, terlambat, donut ============ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
        <StatCard
          bgClass="ez-stat-cream"
          label="Rata-rata Nilai Proyek" value={formatRpCompact(avgValue)}
          sub={totalProjects > 0 ? `Dari ${totalProjects} proyek` : 'Belum ada proyek'} delay="0.3s"
        />
        <div className="ezdb-anim" style={{ ...cardStyle, animation: 'ezdb-rise 0.6s 0.34s both' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B6B64', marginBottom: 8 }}>Progres Aktual vs Rencana</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#141412', letterSpacing: '-1px' }}>
            {avgProgress}%{avgPlanned != null && <span style={{ color: '#8A8A84', fontWeight: 600 }}> / {avgPlanned}%</span>}
          </div>
          <div style={{ fontSize: 12, color: avgPlanned != null && avgProgress < avgPlanned ? '#B54747' : '#6B6B64', marginTop: 6 }}>
            {avgPlanned != null
              ? `Selisih ${avgProgress - avgPlanned >= 0 ? '+' : ''}${avgProgress - avgPlanned}% dari jadwal`
              : 'Rata-rata progres aktual'}
          </div>
          <div style={{ width: '100%', height: 6, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
            <div style={{ width: `${Math.min(100, avgProgress)}%`, height: '100%', background: '#2563EB', borderRadius: 999 }} />
          </div>
        </div>
        <StatCard
          bgClass="ez-stat-peach"
          label="Proyek Terlambat" value={String(overdueList.length)}
          sub="Perlu tindakan segera" subColor="#B54747" delay="0.38s"
        />
        <div className="ezdb-anim" style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 4, animation: 'ezdb-rise 0.6s 0.42s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6B6B64' }}>Status Proyek</span>
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
        className="ezdb-anim ez-mini"
        style={{
          borderRadius: 22,
          background: '#E3EEFB',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          padding: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 26,
          position: 'relative',
          overflow: 'hidden',
          flexWrap: 'wrap',
          animation: 'ezdb-rise 0.6s 0.46s both',
        }}
      >
        <img
          src="/images/ezrab-mascot-greeting.png"
          alt="Maskot EZRAB"
          style={{ width: 104, height: 104, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 8px 18px rgba(37,99,235,0.18))' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <div style={{ flex: 1, minWidth: 260, zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              borderRadius: 999, background: 'rgba(255,255,255,0.75)',
              color: '#2456A8', fontSize: 11, fontWeight: 700, marginBottom: 10,
            }}
          >
            <Sparkles size={12} /> AI POWERED
          </div>
          <h2 style={{ fontSize: 21, fontWeight: 800, color: '#141412', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Buat Proyek Lebih Cepat dengan EZRAB Magic AI
          </h2>
          <p style={{ fontSize: 13, color: '#6B6B64', margin: '0 0 14px', lineHeight: 1.55, maxWidth: 560 }}>
            Dari deskripsi proyek, gambar kerja, atau dokumen DED — kami bantu buat RAB,
            analisis volume, dan QTO secara otomatis. Hasil selalu bisa ditinjau sebelum disimpan.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {['Buat RAB dari deskripsi', 'Analisis DED/PDF/Gambar', 'Ekstrak volume & QTO', 'Tinjau & simpan ke proyek'].map((c) => (
              <span
                key={c}
                style={{
                  fontSize: 11.5, fontWeight: 600, color: '#2456A8',
                  background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.9)',
                  padding: '5px 12px', borderRadius: 999,
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
                height: 40, padding: '0 20px', borderRadius: 12, background: '#2563EB', color: '#fff',
                fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
              }}
            >
              Mulai dengan AI <Sparkles size={14} />
            </button>
            <button
              onClick={onCreateProject}
              style={{
                height: 40, padding: '0 20px', borderRadius: 12, background: '#FFFFFF', color: '#141412',
                fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
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
          gap: 18,
          alignItems: 'start',
        }}
        className="ezrab-proyek-main-grid"
      >
        {/* ----- Daftar Proyek ----- */}
        <div className="ezdb-anim" style={{ ...cardStyle, padding: 0, overflow: 'hidden', animation: 'ezdb-rise 0.6s 0.5s both' }}>
          <div style={{ padding: '20px 24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#141412', margin: 0 }}>Daftar Proyek</h3>
            </div>

            {/* search + filter + sort */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={15} color="#8A8A84" style={{ position: 'absolute', left: 11, top: 12 }} />
                <input
                  type="text"
                  placeholder="Cari nama proyek, klien, lokasi, atau nomor proyek..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                  style={{
                    width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
                    borderRadius: 12, border: '1px solid #EEF1F6', background: '#FAFAF8',
                    fontSize: 13, color: '#141412', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  height: 38, padding: '0 14px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                  background: showFilters ? '#E3EEFB' : '#FFFFFF', color: showFilters ? '#2456A8' : '#6B6B64',
                  border: `1px solid ${showFilters ? '#E3EEFB' : '#E2E8F0'}`, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                <SlidersHorizontal size={14} /> Filter
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                style={{
                  height: 38, padding: '0 10px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                  background: '#FFFFFF', color: '#6B6B64', border: '1px solid #E2E8F0', cursor: 'pointer',
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
                  style={{ height: 36, padding: '0 10px', borderRadius: 12, fontSize: 12, border: '1px solid #E2E8F0', background: '#fff', color: '#141412' }}
                >
                  <option value="all">Semua klien</option>
                  {clients.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={locationFilter}
                  onChange={(e) => { setLocationFilter(e.target.value); setPage(0); }}
                  style={{ height: 36, padding: '0 10px', borderRadius: 12, fontSize: 12, border: '1px solid #E2E8F0', background: '#fff', color: '#141412' }}
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
                      height: 32, padding: '0 14px', borderRadius: 999, fontSize: 12, fontWeight: active ? 700 : 600,
                      background: active ? '#2563EB' : '#FAFAF8', color: active ? '#fff' : '#6B6B64',
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
                margin: '0 24px 10px', padding: '10px 14px', borderRadius: 12,
                background: '#E3EEFB',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 700, color: '#2456A8' }}>{selectedIds.size} dipilih</span>
              <button
                onClick={handleBulkDelete}
                style={{
                  marginLeft: 'auto', height: 32, padding: '0 14px', borderRadius: 12,
                  background: '#B54747', color: '#fff', fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Trash2 size={13} /> Hapus
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                style={{ background: 'none', border: 'none', color: '#6B6B64', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Batal
              </button>
            </div>
          )}

          {/* table */}
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <img src={emptyBlueprintImg} alt="Kosong" style={{ width: 150, opacity: 0.85, marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: '#141412', marginBottom: 4 }}>Tidak ada proyek yang sesuai</div>
              <div style={{ fontSize: 13, color: '#6B6B64', marginBottom: 14 }}>
                {searchQuery ? `Tidak ditemukan untuk "${searchQuery}".` : 'Mulai dengan membuat proyek baru.'}
              </div>
              <button
                onClick={onCreateProject}
                style={{ height: '40px', padding: '0 20px', background: '#2563EB', color: '#fff', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                + Buat Proyek Baru
              </button>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#FAFAF8', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #EEF1F6' }}>
                      <th style={{ padding: '10px 8px 10px 24px', width: 36 }}>
                        <input
                          type="checkbox"
                          checked={pageItems.length > 0 && pageItems.every((p) => selectedIds.has(p.id))}
                          onChange={toggleSelectAll}
                          style={{ width: 15, height: 15, accentColor: '#2563EB', cursor: 'pointer' }}
                        />
                      </th>
                      {['No. Proyek', 'Nama Proyek', 'Klien', 'Lokasi', 'Nilai Estimasi', 'Progres', 'Status', 'Tenggat'].map((h) => (
                        <th key={h} style={{ padding: '10px 10px', fontSize: 11, fontWeight: 700, color: '#8A8A84', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                      <th style={{ padding: '10px 24px 10px 10px', fontSize: 11, fontWeight: 700, color: '#8A8A84', textAlign: 'right' }}>Aksi</th>
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
                          onMouseEnter={(e) => { if (!selectedIds.has(p.id)) e.currentTarget.style.background = '#FAFAF8'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = selectedIds.has(p.id) ? '#F5F9FF' : 'transparent'; }}
                        >
                          <td style={{ padding: '12px 8px 12px 24px' }}>
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
                              style={{ fontWeight: 700, color: '#141412', cursor: 'pointer' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#141412')}
                            >
                              {p.name}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', color: '#141412' }}>{p.clientName || (p as unknown as { client?: string }).client || '—'}</td>
                          <td style={{ padding: '12px 10px', color: '#6B6B64' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <MapPin size={12} color="#8A8A84" />{p.location || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 750, color: '#2563EB', whiteSpace: 'nowrap' }} title={formatRpFull(val)}>
                            {val > 0 ? formatRpCompact(val) : <span style={{ color: '#8A8A84', fontWeight: 500 }}>Belum dihitung</span>}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
                              <div style={{ width: 64, height: 5, background: '#F0EFE9', borderRadius: 999, overflow: 'hidden' }}>
                                <div style={{ width: `${prog}%`, height: '100%', background: sk === 'selesai' ? '#16A34A' : '#2563EB', borderRadius: 999 }} />
                              </div>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#141412' }}>{prog}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            {overdue ? (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: '#FCE9E9', color: '#B54747', whiteSpace: 'nowrap' }}>
                                Terlambat
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>
                                {meta.label}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 10px', color: overdue ? '#B54747' : '#6B6B64', fontWeight: overdue ? 700 : 500, whiteSpace: 'nowrap' }}>
                            {formatDate(p.targetDate)}
                          </td>
                          <td style={{ padding: '12px 24px 12px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                              <button
                                title="Lihat detail"
                                onClick={() => onOpenProject?.(p.id, 'manajemen-proyek')}
                                style={iconBtn}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#E3EEFB'; e.currentTarget.style.color = '#2456A8'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8A8A84'; }}
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                title="Ubah proyek"
                                onClick={() => setEditingProject(p)}
                                style={iconBtn}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#E3EEFB'; e.currentTarget.style.color = '#2456A8'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8A8A84'; }}
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
                                        background: '#fff', borderRadius: 12, border: '1px solid #EEF1F6',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.045)', minWidth: 180, overflow: 'hidden',
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
                                            width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13,
                                            fontWeight: 600, color: a.danger ? '#B54747' : '#141412',
                                            background: 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer',
                                          }}
                                          onMouseEnter={(e) => (e.currentTarget.style.background = a.danger ? '#FCE9E9' : '#FAFAF8')}
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
                <span style={{ fontSize: 12, color: '#6B6B64' }}>
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
                        color: i === safePage ? '#fff' : '#141412',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Aktivitas Terbaru */}
          <div className="ezdb-anim" style={{ ...cardStyle, animation: 'ezdb-rise 0.6s 0.54s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h4 style={{ fontSize: 15, fontWeight: 800, color: '#141412', margin: 0 }}>Aktivitas Terbaru</h4>
            </div>
            {activities.length === 0 ? (
              <div style={{ fontSize: 12, color: '#8A8A84', textAlign: 'center', padding: '18px 8px' }}>
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
                        background: a.type === 'create' ? '#E3EEFB' : a.type === 'delete' ? '#FCE9E9' : '#E2F4D8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {a.type === 'create'
                        ? <Plus size={14} color="#2456A8" />
                        : a.type === 'delete'
                          ? <Trash2 size={13} color="#B54747" />
                          : <CheckCircle2 size={14} color="#2C6E2C" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#141412', lineHeight: 1.4 }}>{a.text}</div>
                      <div style={{ fontSize: 11, color: '#8A8A84', marginTop: 2 }}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="ezdb-anim" style={{ ...cardStyle, animation: 'ezdb-rise 0.6s 0.58s both' }}>
            <h4 style={{ fontSize: 15, fontWeight: 800, color: '#141412', margin: '0 0 12px' }}>Quick Actions</h4>
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
  color: '#8A8A84', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const pageBtn = (disabled: boolean): React.CSSProperties => ({
  minWidth: 32, height: 32, borderRadius: 12, background: '#fff', border: '1px solid #E2E8F0',
  color: disabled ? '#C9C9C2' : '#141412', cursor: disabled ? 'default' : 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
  opacity: disabled ? 0.5 : 1,
});

const qaBtn: React.CSSProperties = {
  height: 40, borderRadius: 12, background: '#FFFFFF', border: '1px solid #E2E8F0',
  color: '#141412', fontSize: 12, fontWeight: 700, cursor: 'pointer',
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
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#6B6B64', marginBottom: 5 };
  const input: React.CSSProperties = {
    width: '100%', height: 38, borderRadius: 12, border: '1px solid #EEF1F6',
    padding: '0 12px', fontSize: 13, color: '#141412', outline: 'none', boxSizing: 'border-box',
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
          width: 'min(440px, 100%)', background: '#fff', borderRadius: 22,
          border: '1px solid #EEF1F6', boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#141412', margin: 0 }}>Ubah Proyek</h3>
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
            style={{ height: 38, padding: '0 16px', borderRadius: 12, background: '#F1F5F9', color: '#141412', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}
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
              height: 38, padding: '0 18px', borderRadius: 12, background: name.trim() ? '#2563EB' : '#C9C9C2',
              color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: name.trim() ? 'pointer' : 'default',
              boxShadow: name.trim() ? '0 4px 14px rgba(37,99,235,0.28)' : 'none',
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

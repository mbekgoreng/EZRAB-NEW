import React, { useState } from 'react';
import {
  Play,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  LineChart,
  ClipboardList,
  Coins,
  MapPin,
  Sparkles,
  Sliders,
  CheckCircle,
  ArrowRight,
  Filter,
  Layers,
  ChevronRight,
  Plus,
  Search,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';

interface InProgressProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
}

export const InProgressProjectsView: React.FC<InProgressProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { updateProject } = useProject();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusSubFilter, setStatusSubFilter] = useState<'all' | 'on_track' | 'behind'>('all');
  
  // Progress modal edit state
  const [editingProgressProjId, setEditingProgressProjId] = useState<string | null>(null);
  const [newProgressVal, setNewProgressVal] = useState<number>(0);

  const inProgressProjects = projects.filter((p) => p.status === 'in_progress');

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  // Mock / Calculated S-Curve planned vs actual deviation for simulation
  const getProjectScheduleStatus = (proj: Project) => {
    const progress = proj.progress || 35;
    // Simulate planned progress (e.g. 5% higher or lower based on id hash)
    const planned = Math.min(100, Math.max(10, progress + (proj.id.length % 2 === 0 ? 4 : -3)));
    const deviation = progress - planned;
    const isAhead = deviation >= 0;
    return { progress, planned, deviation, isAhead };
  };

  const onTrackCount = inProgressProjects.filter((p) => getProjectScheduleStatus(p).isAhead).length;
  const behindCount = inProgressProjects.length - onTrackCount;
  const totalActiveValue = inProgressProjects.reduce(
    (acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0),
    0
  );
  const avgActiveProgress = inProgressProjects.length > 0
    ? Math.round(inProgressProjects.reduce((acc, p) => acc + (p.progress || 35), 0) / inProgressProjects.length)
    : 0;

  const filteredProjects = inProgressProjects.filter((proj) => {
    const matchesSearch =
      !searchQuery.trim() ||
      proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (proj.clientName || proj.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (proj.location || '').toLowerCase().includes(searchQuery.toLowerCase());

    const { isAhead } = getProjectScheduleStatus(proj);
    const matchesSubFilter =
      statusSubFilter === 'all' ||
      (statusSubFilter === 'on_track' && isAhead) ||
      (statusSubFilter === 'behind' && !isAhead);

    return matchesSearch && matchesSubFilter;
  });

  const handleOpenProgressModal = (proj: Project) => {
    setEditingProgressProjId(proj.id);
    setNewProgressVal(proj.progress || 35);
  };

  const handleSaveProgress = (projId: string) => {
    updateProject(projId, {
      progress: newProgressVal,
      updatedAt: new Date().toISOString(),
    });
    setEditingProgressProjId(null);
  };

  const handleMarkAsCompleted = (proj: Project) => {
    if (
      window.confirm(
        `Konfirmasi penyelesaian: Apakah proyek "${proj.name}" telah rampung 100% dan siap untuk Berita Acara Serah Terima (BAST)?`
      )
    ) {
      updateProject(proj.id, {
        status: 'completed',
        progress: 100,
        targetDate: proj.targetDate || new Date().toISOString().split('T')[0],
      });
      alert(`Proyek "${proj.name}" telah ditandai Selesai (100%) dan dipindahkan ke menu Selesai.`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP 4 LIVE CONSTRUCTION KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '14px',
        }}
      >
        {/* KPI 1: Proyek Aktif */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #EEF2F7',
            padding: '16px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Play size={14} fill="#2563EB" />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Proyek Lapangan Aktif</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {inProgressProjects.length} <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>Proyek</span>
            </div>
            <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
              {formatRupiah(totalActiveValue)}
            </div>
          </div>
          <div style={{ width: '56px', height: '32px', opacity: 0.8 }}>
            <svg viewBox="0 0 56 32" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 25 Q 15 10, 30 18 T 56 8" fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* KPI 2: On Schedule */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #EEF2F7',
            padding: '16px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#ECFDF5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Tepat Waktu / Ahead</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', letterSpacing: '-0.02em' }}>
              {onTrackCount} <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>Proyek</span>
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
              Deviasi bobot Kurva S positif
            </div>
          </div>
        </div>

        {/* KPI 3: Terlambat / Butuh Percepatan */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #EEF2F7',
            padding: '16px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#FEF2F2',
                  color: '#DC2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Deviasi / Waspada</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#DC2626', letterSpacing: '-0.02em' }}>
              {behindCount} <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>Proyek</span>
            </div>
            <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600, marginTop: '2px' }}>
              Perlu evaluasi opname & lembur
            </div>
          </div>
        </div>

        {/* KPI 4: Rata-rata Progres Realisasi */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #EEF2F7',
            padding: '16px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#F0FDF4',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Rata-rata Bobot Fisik</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {avgActiveProgress}%
            </div>
            <div style={{ width: '85%', height: '5px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', marginTop: '4px' }}>
              <div style={{ width: `${avgActiveProgress}%`, height: '100%', background: '#2563EB', borderRadius: '999px' }} />
            </div>
          </div>
        </div>
      </div>

      {/* 2. KURVA S & MONITORING HEADER BAR */}
      <div
        style={{
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '14px',
          border: '1px solid #EEF2F7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
            <input
              type="text"
              placeholder="Cari proyek aktif..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '36px',
                paddingLeft: '34px',
                paddingRight: '12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                fontSize: '12.5px',
                color: '#0F172A',
                outline: 'none',
              }}
            />
          </div>

          {/* Subfilter Chips */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setStatusSubFilter('all')}
              style={{
                height: '30px',
                padding: '0 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: statusSubFilter === 'all' ? 700 : 500,
                background: statusSubFilter === 'all' ? '#EFF6FF' : '#F8FAFC',
                color: statusSubFilter === 'all' ? '#2563EB' : '#64748B',
                border: statusSubFilter === 'all' ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                cursor: 'pointer',
              }}
            >
              Semua ({inProgressProjects.length})
            </button>
            <button
              onClick={() => setStatusSubFilter('on_track')}
              style={{
                height: '30px',
                padding: '0 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: statusSubFilter === 'on_track' ? 700 : 500,
                background: statusSubFilter === 'on_track' ? '#ECFDF5' : '#F8FAFC',
                color: statusSubFilter === 'on_track' ? '#059669' : '#64748B',
                border: statusSubFilter === 'on_track' ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                cursor: 'pointer',
              }}
            >
              🟢 On Track ({onTrackCount})
            </button>
            <button
              onClick={() => setStatusSubFilter('behind')}
              style={{
                height: '30px',
                padding: '0 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: statusSubFilter === 'behind' ? 700 : 500,
                background: statusSubFilter === 'behind' ? '#FEF2F2' : '#F8FAFC',
                color: statusSubFilter === 'behind' ? '#DC2626' : '#64748B',
                border: statusSubFilter === 'behind' ? '1px solid #FECACA' : '1px solid #E2E8F0',
                cursor: 'pointer',
              }}
            >
              🔴 Deviasi / Delay ({behindCount})
            </button>
          </div>
        </div>

        <button
          onClick={onCreateProject}
          style={{
            height: '36px',
            padding: '0 14px',
            borderRadius: '8px',
            background: '#2563EB',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Plus size={14} />
          <span>+ Tambah Proyek Aktif</span>
        </button>
      </div>

      {/* 3. ACTIVE PROJECTS DETAILED MONITORING CARDS */}
      {filteredProjects.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #EEF2F7',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Play size={36} color="#94A3B8" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
            Tidak ada proyek yang sedang berjalan
          </h3>
          <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '380px', margin: '0 0 16px 0' }}>
            Anda dapat memindahkan proyek dari status Draft atau membuat proyek baru untuk memulai monitoring pelaksanaan lapangan.
          </p>
          <button
            onClick={onCreateProject}
            style={{
              padding: '8px 16px',
              background: '#2563EB',
              color: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Buat Proyek Baru
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredProjects.map((proj) => {
            const { progress, planned, deviation, isAhead } = getProjectScheduleStatus(proj);
            const totalCost = proj.totalRab || proj.costSummary?.grandTotal || 0;

            return (
              <div
                key={proj.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #EEF2F7',
                  padding: '18px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div>
                  {/* Card Header: Code & Live Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                      }}
                    >
                      {proj.projectNumber || proj.id}
                    </span>

                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontWeight: 700,
                        background: isAhead ? '#DCFCE7' : '#FEF2F2',
                        color: isAhead ? '#15803D' : '#DC2626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {isAhead ? '🟢 On Schedule' : '🔴 Delay / Terlambat'}
                    </span>
                  </div>

                  {/* Project Name */}
                  <h4
                    onClick={() => onOpenProject?.(proj.id, 'manajemen-proyek')}
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#0F172A',
                      margin: '0 0 4px 0',
                      cursor: 'pointer',
                      lineHeight: 1.3,
                    }}
                  >
                    {proj.name}
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B', marginBottom: '14px' }}>
                    <MapPin size={12} color="#94A3B8" />
                    <span>{proj.location || 'Indonesia'}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || 'Klien Umum'}</span>
                  </div>

                  {/* Dual Kurva S Progress Comparison Box */}
                  <div
                    style={{
                      background: '#F8FAFC',
                      borderRadius: '12px',
                      padding: '12px',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: '#475569' }}>Realisasi Fisik (Aktual)</span>
                      <span style={{ fontWeight: 800, color: '#2563EB', fontSize: '14px' }}>{progress}%</span>
                    </div>

                    {/* Dual Progress Bar */}
                    <div style={{ position: 'relative', width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                      {/* Actual Progress Bar */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${progress}%`,
                          background: isAhead ? '#10B981' : '#2563EB',
                          borderRadius: '999px',
                          zIndex: 2,
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748B' }}>
                      <span>Rencana Jadwal: <strong>{planned}%</strong></span>
                      <span style={{ fontWeight: 700, color: isAhead ? '#059669' : '#DC2626' }}>
                        Deviasi: {deviation >= 0 ? `+${deviation}%` : `${deviation}%`}
                      </span>
                    </div>
                  </div>

                  {/* Inline Quick Progress Slider Editor */}
                  {editingProgressProjId === proj.id && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '10px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, color: '#1E40AF' }}>
                        <span>Input Opname Fisik:</span>
                        <span>{newProgressVal}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={newProgressVal}
                        onChange={(e) => setNewProgressVal(Number(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                        <button
                          onClick={() => setEditingProgressProjId(null)}
                          style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px', background: '#FFFFFF', border: '1px solid #CBD5E1', cursor: 'pointer' }}
                        >
                          Batal
                        </button>
                        <button
                          onClick={() => handleSaveProgress(proj.id)}
                          style={{ padding: '3px 10px', fontSize: '11px', borderRadius: '4px', background: '#2563EB', color: '#FFFFFF', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Simpan Opname
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Strip: Value, S-Curve Shortcut, & Mark Complete */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Nilai Kontrak Proyek</div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>
                        {formatRupiah(totalCost)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenProgressModal(proj)}
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        background: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#334155',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Sliders size={12} />
                      <span>Update Opname</span>
                    </button>
                  </div>

                  {/* Primary Navigation Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => onOpenProject?.(proj.id, 'kurva-s')}
                      style={{
                        flex: 1,
                        height: '32px',
                        borderRadius: '6px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        color: '#2563EB',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <LineChart size={13} />
                      <span>Kurva S & Jadwal</span>
                    </button>

                    <button
                      onClick={() => onOpenProject?.(proj.id, 'manajemen-proyek')}
                      style={{
                        flex: 1,
                        height: '32px',
                        borderRadius: '6px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      Dashboard Lapangan →
                    </button>

                    <button
                      onClick={() => handleMarkAsCompleted(proj)}
                      title="Tandai Proyek Selesai 100%"
                      style={{
                        height: '32px',
                        width: '32px',
                        borderRadius: '6px',
                        background: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        color: '#059669',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <CheckCircle size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

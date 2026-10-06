import React, { useState, useMemo } from 'react';
import {
  Folder,
  Plus,
  Sparkles,
  Search,
  LayoutGrid,
  List,
  ChevronRight,
  Play,
  CheckCircle2,
  FileText,
  Archive,
  ArrowUpRight,
  TrendingUp,
  MapPin,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  SlidersHorizontal,
  Download,
  Filter,
  Trash2,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { DeleteProjectModal } from './DeleteProjectModal';
import magicAiSceneImg from '../../assets/proyek-magic-ai-scene.png';
import emptyBlueprintImg from '../../assets/proyek-empty-blueprint.png';

interface AllProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
  onSwitchFilter?: (filter: string) => void;
}

export const AllProjectsView: React.FC<AllProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
  onSwitchFilter,
}) => {
  const { deleteProject, backupProjectData } = useProject();
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Metrics
  const totalProjects = projects.length;
  const totalRab = projects.reduce((acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0), 0);
  const activeProjects = projects.filter((p) => p.status === 'in_progress').length;
  const draftProjects = projects.filter((p) => p.status === 'draft' || !p.status || p.status === 'DRAFT').length;
  const completedProjects = projects.filter((p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED').length;
  const archivedProjects = projects.filter((p) => p.status === 'archived' || p.isArchived).length;

  const avgProgress = totalProjects > 0
    ? Math.round(projects.reduce((acc, p) => acc + (p.progress || (p.status === 'completed' ? 100 : p.status === 'draft' ? 0 : 35)), 0) / totalProjects)
    : 0;

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.clientName || p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.location || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.projectNumber || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === 'all' || p.buildingType === typeFilter;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'in_progress' && p.status === 'in_progress') ||
        (statusFilter === 'draft' && (p.status === 'draft' || !p.status || p.status === 'DRAFT')) ||
        (statusFilter === 'completed' && (p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED')) ||
        (statusFilter === 'archived' && (p.status === 'archived' || p.isArchived));

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [projects, searchQuery, typeFilter, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP 4 MASTER KPI CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '14px',
        }}
      >
        {/* KPI 1: Total Proyek */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563EB',
                }}
              >
                <Folder size={18} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Total Portofolio</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginTop: '2px' }}>
              {totalProjects} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94A3B8' }}>Proyek</span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              {activeProjects} Berjalan • {draftProjects} Draft • {completedProjects} Selesai
            </div>
          </div>
          <div style={{ width: '60px', height: '35px', opacity: 0.8 }}>
            <svg viewBox="0 0 60 35" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 25 Q 15 10, 30 20 T 60 8" fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Total Nilai Kontrak / RAB */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#ECFDF5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#059669',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              >
                Rp
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Total Nilai Estimasi</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginTop: '2px' }}>
              {totalRab === 0 ? 'Rp 0' : formatRupiah(totalRab)}
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
              ● Terakumulasi dari seluruh proyek
            </div>
          </div>
          <div style={{ width: '60px', height: '35px', opacity: 0.8 }}>
            <svg viewBox="0 0 60 35" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 28 Q 20 8, 40 18 T 60 5" fill="none" stroke="#6EE7B7" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* KPI 3: Proyek Sedang Berjalan */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563EB',
                }}
              >
                <Play size={15} fill="#2563EB" />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Aktif Berjalan</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginTop: '2px' }}>
              {activeProjects} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94A3B8' }}>Proyek</span>
            </div>
            <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>
              Monitoring progres & Kurva S
            </div>
          </div>
          <div style={{ width: '60px', height: '35px', opacity: 0.8 }}>
            <svg viewBox="0 0 60 35" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 20 Q 20 30, 40 12 T 60 15" fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* KPI 4: Rata-rata Progres Portofolio */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#FEF3C7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#D97706',
                }}
              >
                <TrendingUp size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Rata-rata Progres</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', marginTop: '2px' }}>
              {avgProgress}%
            </div>
            {/* Progress Bar */}
            <div style={{ width: '90%', height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', marginTop: '4px' }}>
              <div
                style={{
                  width: `${avgProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #3B82F6, #10B981)',
                  borderRadius: '999px',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. EZRAB MAGIC AI BANNER */}
      <div
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
          borderRadius: '20px',
          border: '1px solid #E2E8F0',
          padding: '24px 28px',
          boxShadow: '0 2px 12px rgba(15,23,42,0.03)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ maxWidth: '580px', zIndex: 2 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '999px',
              background: '#EFF6FF',
              border: '1px solid #DBEAFE',
              color: '#2563EB',
              fontSize: '11px',
              fontWeight: 700,
              marginBottom: '10px',
            }}
          >
            <Sparkles size={13} color="#2563EB" />
            <span>AI Fast-Track Estimator</span>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Otomasi Perhitungan RAB & QTO dari Blueprint Digital
          </h2>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            Unggah gambar kerja CAD/PDF atau deskripsikan rencana proyek Anda. Sistem AI akan mengekstrak volume dan mencocokkan AHSP secara otomatis.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={onOpenMagicAi}
              style={{
                height: '36px',
                padding: '0 16px',
                borderRadius: '8px',
                background: '#2563EB',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
              }}
            >
              <Sparkles size={14} />
              <span>Buka EZRAB Magic AI</span>
            </button>
            <button
              onClick={onCreateProject}
              style={{
                height: '36px',
                padding: '0 14px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #CBD5E1',
                color: '#334155',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={14} />
              <span>+ Buat Proyek Manual</span>
            </button>
          </div>
        </div>

        {/* Isometric Graphic */}
        <div style={{ position: 'relative', width: '220px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={magicAiSceneImg}
            alt="Magic AI Scene"
            style={{ maxHeight: '140px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.06))' }}
          />
        </div>
      </div>

      {/* 3. TOOLBAR: SEARCH, CATEGORY CHIPS, & VIEW TOGGLE */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '14px',
          border: '1px solid #EEF2F7',
        }}
      >
        {/* Left: Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              maxWidth: '320px',
            }}
          >
            <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px' }} />
            <input
              type="text"
              placeholder="Cari nama proyek, klien, lokasi..."
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

          {/* Status Filter Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `Semua (${totalProjects})` },
              { id: 'in_progress', label: `Berjalan (${activeProjects})` },
              { id: 'draft', label: `Draft (${draftProjects})` },
              { id: 'completed', label: `Selesai (${completedProjects})` },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setStatusFilter(chip.id)}
                style={{
                  height: '30px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: statusFilter === chip.id ? 700 : 500,
                  background: statusFilter === chip.id ? '#EFF6FF' : '#F8FAFC',
                  color: statusFilter === chip.id ? '#2563EB' : '#64748B',
                  border: statusFilter === chip.id ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: View Toggle (Grid / Table) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#F1F5F9',
              padding: '2px',
              borderRadius: '8px',
            }}
          >
            <button
              onClick={() => setViewMode('grid')}
              title="Tampilan Grid Kartu"
              style={{
                height: '30px',
                width: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                color: viewMode === 'grid' ? '#2563EB' : '#64748B',
                border: 'none',
                boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
              }}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Tampilan Tabel Rinci"
              style={{
                height: '30px',
                width: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                background: viewMode === 'table' ? '#ffffff' : 'transparent',
                color: viewMode === 'table' ? '#2563EB' : '#64748B',
                border: 'none',
                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
              }}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 4. MAIN PROJECT LIST (GRID OR TABLE) */}
      {filteredProjects.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #EEF2F7',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={emptyBlueprintImg}
            alt="Empty Projects"
            style={{ width: '180px', maxHeight: '130px', objectFit: 'contain', marginBottom: '14px', opacity: 0.85 }}
          />
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
            Tidak ada proyek yang sesuai
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 0 18px 0', lineHeight: 1.5 }}>
            {searchQuery
              ? `Tidak ditemukan proyek dengan kata kunci "${searchQuery}". Coba ubah filter atau kata pencarian.`
              : 'Mulai dengan membuat proyek konstruksi baru atau gunakan template siap pakai.'}
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onCreateProject}
              style={{
                padding: '8px 16px',
                background: '#2563EB',
                color: '#ffffff',
                borderRadius: '8px',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + Buat Proyek Baru
            </button>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                style={{
                  padding: '8px 14px',
                  background: '#F1F5F9',
                  color: '#475569',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset Pencarian
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredProjects.map((proj) => {
            const isCompleted = proj.status === 'completed' || proj.status === 'approved' || proj.status === 'COMPLETED';
            const isDraft = proj.status === 'draft' || !proj.status || proj.status === 'DRAFT';
            const isInProgress = proj.status === 'in_progress';
            const isArchived = proj.status === 'archived' || proj.isArchived;

            const progressVal = proj.progress || (isCompleted ? 100 : isDraft ? 0 : 45);
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
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div>
                  {/* Card Header: Code & Status */}
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

                    {/* Status Badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: isCompleted ? '#DCFCE7' : isInProgress ? '#DBEAFE' : isArchived ? '#F1F5F9' : '#FEF3C7',
                        color: isCompleted ? '#15803D' : isInProgress ? '#1D4ED8' : isArchived ? '#64748B' : '#B45309',
                      }}
                    >
                      ● {isCompleted ? 'Selesai' : isInProgress ? 'Sedang Berjalan' : isArchived ? 'Arsip' : 'Draft'}
                    </span>
                  </div>

                  {/* Title & Info */}
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B', marginBottom: '8px' }}>
                    <MapPin size={12} color="#94A3B8" />
                    <span>{proj.location || 'Indonesia'}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || 'Klien Umum'}</span>
                  </div>

                  {/* Building Type Tag */}
                  {proj.buildingType && (
                    <div style={{ display: 'inline-block', fontSize: '10.5px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '1px 6px', borderRadius: '4px', color: '#475569', fontWeight: 600 }}>
                      🏛️ {proj.buildingType}
                    </div>
                  )}
                </div>

                {/* Progress Bar & RAB Value */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B', marginBottom: '4px' }}>
                    <span>Progres Fisik</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{progressVal}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div
                      style={{
                        width: `${progressVal}%`,
                        height: '100%',
                        background: isCompleted ? '#10B981' : isInProgress ? '#2563EB' : '#94A3B8',
                        borderRadius: '999px',
                      }}
                    />
                  </div>

                  {/* Bottom Strip: Value & Quick Action Buttons */}
                  <div
                    style={{
                      borderTop: '1px solid #F1F5F9',
                      paddingTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Nilai Estimasi RAB</div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#2563EB' }}>
                        {formatRupiah(totalCost)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => onOpenProject?.(proj.id, 'qto')}
                        title="Buka Quantity Takeoff"
                        style={{
                          height: '30px',
                          padding: '0 8px',
                          borderRadius: '6px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          color: '#334155',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        📐 QTO
                      </button>
                      <button
                        onClick={() => onOpenProject?.(proj.id, 'rab-estimasi')}
                        title="Buka Spreadsheet RAB"
                        style={{
                          height: '30px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          color: '#2563EB',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        📊 RAB
                      </button>
                      <button
                        onClick={() => onOpenProject?.(proj.id, 'manajemen-proyek')}
                        title="Buka Dashboard Manajemen Proyek"
                        style={{
                          height: '30px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          background: '#2563EB',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Kelola →
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(proj);
                        }}
                        title="Hapus Proyek & Cadangkan Data"
                        style={{
                          height: '30px',
                          width: '30px',
                          borderRadius: '6px',
                          background: '#FEF2F2',
                          color: '#DC2626',
                          border: '1px solid #FECACA',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#DC2626';
                          e.currentTarget.style.color = '#FFFFFF';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#FEF2F2';
                          e.currentTarget.style.color = '#DC2626';
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW MODE */
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #EEF2F7',
            overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600, fontSize: '11.5px' }}>
                  <th style={{ padding: '12px 16px' }}>KODE & NAMA PROYEK</th>
                  <th style={{ padding: '12px 16px' }}>KLIEN & LOKASI</th>
                  <th style={{ padding: '12px 16px' }}>TIPE</th>
                  <th style={{ padding: '12px 16px' }}>STATUS</th>
                  <th style={{ padding: '12px 16px' }}>NILAI ESTIMASI RAB</th>
                  <th style={{ padding: '12px 16px' }}>PROGRES</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((proj) => {
                  const isCompleted = proj.status === 'completed' || proj.status === 'approved' || proj.status === 'COMPLETED';
                  const isDraft = proj.status === 'draft' || !proj.status || proj.status === 'DRAFT';
                  const isInProgress = proj.status === 'in_progress';
                  const isArchived = proj.status === 'archived' || proj.isArchived;
                  const progressVal = proj.progress || (isCompleted ? 100 : isDraft ? 0 : 45);

                  return (
                    <tr
                      key={proj.id}
                      style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 750, color: '#0F172A' }}>{proj.name}</div>
                        <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>{proj.projectNumber || proj.id}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ color: '#334155' }}>{proj.clientName || proj.client || '-'}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>{proj.location || 'Indonesia'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748B' }}>
                        {proj.buildingType || '-'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontWeight: 700,
                            background: isCompleted ? '#DCFCE7' : isInProgress ? '#DBEAFE' : isArchived ? '#F1F5F9' : '#FEF3C7',
                            color: isCompleted ? '#15803D' : isInProgress ? '#1D4ED8' : isArchived ? '#64748B' : '#B45309',
                          }}
                        >
                          ● {isCompleted ? 'Selesai' : isInProgress ? 'Berjalan' : isArchived ? 'Arsip' : 'Draft'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 750, color: '#2563EB' }}>
                        {formatRupiah(proj.totalRab || proj.costSummary?.grandTotal || 0)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '60px', height: '5px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ width: `${progressVal}%`, height: '100%', background: isCompleted ? '#10B981' : '#2563EB' }} />
                          </div>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>{progressVal}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => onOpenProject?.(proj.id, 'rab-estimasi')}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              background: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              color: '#2563EB',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            RAB
                          </button>
                          <button
                            onClick={() => onOpenProject?.(proj.id, 'manajemen-proyek')}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              background: '#2563EB',
                              color: '#ffffff',
                              border: 'none',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Buka
                          </button>
                          <button
                            type="button"
                            onClick={() => setProjectToDelete(proj)}
                            title="Hapus Proyek & Cadangkan"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '6px',
                              background: '#FEF2F2',
                              border: '1px solid #FECACA',
                              color: '#DC2626',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation & Backup Modal */}
      <DeleteProjectModal
        isOpen={!!projectToDelete}
        project={projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirmDelete={(id) => deleteProject(id)}
        onBackupProject={(id) => backupProjectData(id)}
      />
    </div>
  );
};

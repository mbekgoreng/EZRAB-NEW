import React, { useState, useEffect } from 'react';
import {
  Folder,
  Plus,
  Sparkles,
  FileText,
  Play,
  CheckCircle2,
  Archive,
} from 'lucide-react';
import { Project } from '../../types';
import { AllProjectsView, type ActivityItem } from './AllProjectsView';
import { DraftProjectsView } from './DraftProjectsView';
import { InProgressProjectsView } from './InProgressProjectsView';
import { CompletedProjectsView } from './CompletedProjectsView';
import { ArchivedProjectsView } from './ArchivedProjectsView';

interface ProjectsViewProps {
  projects: Project[];
  activities?: ActivityItem[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
  initialFilter?: string;
  onFilterChange?: (filter: string) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  activities,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
  initialFilter = 'Semua Proyek',
  onFilterChange,
}) => {
  const [filterType, setFilterTypeState] = useState(initialFilter);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

  useEffect(() => {
    if (initialFilter && initialFilter !== filterType) {
      setFilterTypeState(initialFilter);
    }
  }, [initialFilter]);

  const setFilterType = (val: string) => {
    setFilterTypeState(val);
    if (onFilterChange) onFilterChange(val);
  };

  // Counts for each tab
  const totalProjects = projects.length;
  const draftCount = projects.filter((p) => p.status === 'draft' || !p.status || p.status === 'DRAFT').length;
  const inProgressCount = projects.filter((p) => p.status === 'in_progress').length;
  const completedCount = projects.filter((p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED').length;
  const archiveCount = projects.filter((p) => p.status === 'archived' || p.isArchived).length;

  const tabs = [
    { id: 'Semua Proyek', label: 'Semua Proyek', count: totalProjects, icon: Folder },
    { id: 'Draft', label: 'Draft', count: draftCount, icon: FileText },
    { id: 'Sedang Dikerjakan', label: 'Sedang Dikerjakan', count: inProgressCount, icon: Play },
    { id: 'Selesai', label: 'Selesai', count: completedCount, icon: CheckCircle2 },
    { id: 'Arsip', label: 'Arsip', count: archiveCount, icon: Archive },
  ];

  // Header Title and Subtitle based on active menu
  const getHeaderInfo = () => {
    switch (filterType) {
      case 'Draft':
        return {
          title: 'Rancangan Proyek & Pra-Estimasi (Draft)',
          subtitle: 'Ruang kerja persiapan proyek, survei data volume awal, dan simulasi anggaran sebelum disetujui.',
        };
      case 'Sedang Dikerjakan':
      case 'Proyek Berjalan':
        return {
          title: 'Proyek Aktif & Monitoring Pelaksanaan Lapangan',
          subtitle: 'Pantau progres fisik real-time, Kurva S, jadwal pelaksanaan, deviasi mingguan, dan arus kas lapangan.',
        };
      case 'Selesai':
        return {
          title: 'Proyek Selesai & Serah Terima (Closeout)',
          subtitle: 'Rekapitulasi proyek tuntas 100%, evaluasi laba rugi realisasi anggaran, dan Berita Acara Serah Terima (BAST).',
        };
      case 'Arsip':
        return {
          title: 'Gudang Arsip & Data Historis Proyek',
          subtitle: 'Penyimpanan arsip aman proyek masa lalu, benchmark harga historis, dan fungsi pemulihan data (Restore).',
        };
      case 'Semua Proyek':
      default:
        return {
          title: 'Direktori & Portofolio Semua Proyek',
          subtitle: 'Pusat kendali seluruh siklus proyek konstruksi dari pra-desain, pelaksanaan, hingga serah terima.',
        };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        color: '#141412',
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* =========================================================================
          1. HEADER & INTERACTIVE NAVIGATION TABS
         ========================================================================= */}
      <div
        className="ezdb-anim"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          animation: 'ezdb-rise 0.6s 0s both',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '-0.3px',
              color: '#141412',
              margin: '0 0 4px 0',
            }}
          >
            {headerInfo.title}
          </h1>
          <p style={{ fontSize: '13px', color: '#8A8A84', margin: 0 }}>
            {headerInfo.subtitle}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={onCreateProject}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '12px',
              background: '#2563EB',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1D4ED8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#2563EB')}
          >
            <Plus size={15} />
            <span>+ Buat Proyek</span>
          </button>

          <button
            onClick={onOpenMagicAi}
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: '12px',
              background: '#ffffff',
              border: '1px solid #E2E8F0',
              color: '#2563EB',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#EFF6FF')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
          >
            <Sparkles size={15} color="#2563EB" />
            <span>Generate dengan AI</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. MENU TAB SWITCHER PILLS
         ========================================================================= */}
      <div
        className="ezdb-anim"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '2px',
          borderBottom: '1px solid #EEF1F6',
          animation: 'ezdb-rise 0.6s 0.08s both',
        }}
      >
        {tabs.map((tab) => {
          const isActive = filterType === tab.id;
          const TabIcon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              style={{
                height: '40px',
                padding: '0 16px',
                border: 'none',
                background: 'transparent',
                borderBottom: isActive ? '3px solid #2563EB' : '3px solid transparent',
                color: isActive ? '#2563EB' : '#8A8A84',
                fontSize: '13px',
                fontWeight: isActive ? 750 : 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <TabIcon size={16} color={isActive ? '#2563EB' : '#C9C9C2'} />
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '5px 12px',
                  borderRadius: '999px',
                  background: isActive ? '#E3EEFB' : '#F1F5F9',
                  color: isActive ? '#2456A8' : '#64748B',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          3. DEDICATED VIEW RENDERER BASED ON SELECTED MENU
         ========================================================================= */}
      {filterType === 'Draft' ? (
        <DraftProjectsView
          projects={projects}
          onCreateProject={onCreateProject}
          onOpenMagicAi={onOpenMagicAi}
          onNavigateToTab={onNavigateToTab}
          onOpenProject={onOpenProject}
        />
      ) : (filterType === 'Sedang Dikerjakan' || filterType === 'Proyek Berjalan') ? (
        <InProgressProjectsView
          projects={projects}
          onCreateProject={onCreateProject}
          onOpenMagicAi={onOpenMagicAi}
          onNavigateToTab={onNavigateToTab}
          onOpenProject={onOpenProject}
        />
      ) : filterType === 'Selesai' ? (
        <CompletedProjectsView
          projects={projects}
          onCreateProject={onCreateProject}
          onOpenMagicAi={onOpenMagicAi}
          onNavigateToTab={onNavigateToTab}
          onOpenProject={onOpenProject}
        />
      ) : filterType === 'Arsip' ? (
        <ArchivedProjectsView
          projects={projects}
          onCreateProject={onCreateProject}
          onOpenMagicAi={onOpenMagicAi}
          onNavigateToTab={onNavigateToTab}
          onOpenProject={onOpenProject}
        />
      ) : (
        <AllProjectsView
          projects={projects}
          activities={activities}
          onCreateProject={onCreateProject}
          onOpenMagicAi={onOpenMagicAi}
          onNavigateToTab={onNavigateToTab}
          onOpenProject={onOpenProject}
          onSwitchFilter={(f) => setFilterType(f)}
        />
      )}
    </div>
  );
};

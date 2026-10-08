import React, { useState, useEffect } from 'react';
import {
  Folder,
  Plus,
  Sparkles,
  ChevronDown,
  Layers,
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
        maxWidth: '1680px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        color: '#0F172A',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* =========================================================================
          1. HEADER & INTERACTIVE NAVIGATION TABS
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div>
          {/* Breadcrumb */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#64748B',
              marginBottom: '4px',
            }}
          >
            <span
              onClick={() => onNavigateToTab && onNavigateToTab('dashboard')}
              style={{ cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            >
              Dashboard
            </span>
            <span style={{ color: '#94A3B8' }}>&gt;</span>
            <span
              onClick={() => setFilterType('Semua Proyek')}
              style={{ cursor: 'pointer', color: filterType === 'Semua Proyek' ? '#2563EB' : '#64748B' }}
            >
              Proyek
            </span>
            {filterType !== 'Semua Proyek' && (
              <>
                <span style={{ color: '#94A3B8' }}>&gt;</span>
                <span style={{ color: '#2563EB', fontWeight: 600 }}>{filterType}</span>
              </>
            )}
          </div>

          <h1
            style={{
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: '#0F172A',
              margin: '0 0 4px 0',
            }}
          >
            {headerInfo.title}
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
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
              borderRadius: '10px',
              background: '#2563EB',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(37,99,235,0.22)',
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
              borderRadius: '10px',
              background: '#ffffff',
              border: '1px solid #BFDBFE',
              color: '#2563EB',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '2px',
          borderBottom: '1px solid #E2E8F0',
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
                color: isActive ? '#2563EB' : '#64748B',
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
              <TabIcon size={16} color={isActive ? '#2563EB' : '#94A3B8'} />
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '1px 7px',
                  borderRadius: '999px',
                  background: isActive ? '#DBEAFE' : '#F1F5F9',
                  color: isActive ? '#1D4ED8' : '#64748B',
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

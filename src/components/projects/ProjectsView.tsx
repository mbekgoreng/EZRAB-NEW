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
import { useI18n } from '../../i18n/I18nContext';
import { AllProjectsView, type ActivityItem } from './AllProjectsView';
import { DraftProjectsView } from './DraftProjectsView';
import { InProgressProjectsView } from './InProgressProjectsView';
import { CompletedProjectsView } from './CompletedProjectsView';
import { ArchivedProjectsView } from './ArchivedProjectsView';
import { TutorialHelpButton } from '../onboarding/tutorials/TutorialHelpButton';

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
  const { t } = useI18n();
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
    { id: 'Semua Proyek', label: t('proj.tab_all'), count: totalProjects, icon: Folder },
    { id: 'Draft', label: t('proj.tab_draft'), count: draftCount, icon: FileText },
    { id: 'Sedang Dikerjakan', label: t('proj.tab_active'), count: inProgressCount, icon: Play },
    { id: 'Selesai', label: t('proj.tab_done'), count: completedCount, icon: CheckCircle2 },
    { id: 'Arsip', label: t('proj.tab_archived'), count: archiveCount, icon: Archive },
  ];

  // Header Title and Subtitle based on active menu
  const getHeaderInfo = () => {
    switch (filterType) {
      case 'Draft':
        return {
          title: t('proj.head_draft_t'),
          subtitle: t('proj.head_draft_s'),
        };
      case 'Sedang Dikerjakan':
      case 'Proyek Berjalan':
        return {
          title: t('proj.head_active_t'),
          subtitle: t('proj.head_active_s'),
        };
      case 'Selesai':
        return {
          title: t('proj.head_done_t'),
          subtitle: t('proj.head_done_s'),
        };
      case 'Arsip':
        return {
          title: t('proj.head_archived_t'),
          subtitle: t('proj.head_archived_s'),
        };
      case 'Semua Proyek':
      default:
        return {
          title: t('proj.head_all_t'),
          subtitle: t('proj.head_all_s'),
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
        color: 'var(--ez-color-text-primary)',
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
              color: 'var(--ez-color-text-primary)',
              margin: '0 0 4px 0',
            }}
          >
            {headerInfo.title}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: 0 }}>
            {headerInfo.subtitle}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={onCreateProject}
            data-tutorial="proyek-create"
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-primary)',
              color: '#FFFFFF',
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
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ez-color-primary)')}
          >
            <Plus size={15} />
            <span>+ {t('proj.create_project')}</span>
          </button>
          <TutorialHelpButton tutorialId="proyek" label="Buka tutorial membuat proyek" />

          <button
            onClick={onOpenMagicAi}
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              color: 'var(--ez-color-primary)',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-hue-blue-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
          >
            <Sparkles size={15} color="var(--ez-hue-blue-text)" />
            <span>{t('proj.generate_ai')}</span>
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
          borderBottom: '1px solid var(--ez-color-border-soft)',
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
                color: isActive ? 'var(--ez-color-primary)' : 'var(--ez-color-text-muted)',
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
                  borderRadius: 'var(--ez-radius-pill)',
                  background: isActive ? 'var(--ez-pastel-sky)' : 'var(--ez-color-surface-tertiary)',
                  color: isActive ? 'var(--ez-hue-blue-text-deep)' : 'var(--ez-color-text-muted)',
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

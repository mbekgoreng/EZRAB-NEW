import React from 'react';
import { ChevronRight, Home, LayoutDashboard, Building, FolderKanban } from 'lucide-react';
import { Project } from '../../types';
import { WorkspaceRoute, routeLabel } from '../../routing/routes';

interface UnifiedBreadcrumbProps {
  route: WorkspaceRoute;
  currentProject: Project | null;
  activeMenu: string;
  onNavigate: (menu: string, projectId?: string | null) => void;
  projectFilter?: string;
  settingsTab?: string;
}

export const UnifiedBreadcrumb: React.FC<UnifiedBreadcrumbProps> = ({
  route,
  currentProject,
  activeMenu,
  onNavigate,
  projectFilter,
  settingsTab,
}) => {
  // Determine leaf module label
  const getModuleLabel = (menu: string): string => {
    switch (menu) {
      case 'rab-estimasi':
      case 'rab-spreadsheet':
        return 'RAB Spreadsheet';
      case 'rab-rekapitulasi':
        return 'Rekapitulasi RAB';
      case 'rab-analisa-harga':
        return 'Analisa Harga Satuan (AHSP)';
      case 'rab-kurva-s':
        return 'Kurva S & Jadwal';
      case 'rab-catatan':
        return 'Catatan Estimasi';
      case 'rab-pengaturan':
        return 'Pengaturan RAB';
      case 'volume-calculation':
      case 'qto-vc':
        return 'Volume Calculation';
      case 'qto':
      case 'qto-rekap':
        return 'Rekapitulasi Volume & QTO';
      case 'daftar-pekerjaan':
      case 'pekerjaan':
      case 'qto-daftar':
        return 'Daftar Pekerjaan';
      case 'magic-ai':
      case 'ai-assistant':
        return 'EZRAB Magic AI';
      case 'template-rab':
        return 'Template RAB';
      case 'ahsp-2026':
      case 'ahsp':
        return 'Analisa AHSP';
      case 'kurva-s':
      case 'jadwal':
        return 'Jadwal & Kurva S';
      case 'laporan':
      case 'boq':
      case 'rekapitulasi':
        return 'Laporan & Rekapitulasi';
      case 'manajemen-proyek':
        return 'Manajemen Proyek';
      case 'pengaturan':
        return 'Pengaturan';
      case 'subscription':
        return 'Langganan & Billing';
      case 'database-material':
      case 'database-upah':
      case 'database-alat':
        return 'Resource Library';
      default:
        return routeLabel(route);
    }
  };

  const crumbLinkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '12px',
    fontWeight: 500,
    color: '#64748B',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'color 0.15s ease',
  };

  const activeLeafStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 700,
    color: '#0F172A',
    maxWidth: '260px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        padding: '6px 0',
      }}
    >
      {/* 1. Dashboard (Always Root) */}
      <button
        onClick={() => onNavigate('dashboard')}
        style={crumbLinkStyle}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
        title="Kembali ke Dashboard Utama"
      >
        <LayoutDashboard size={13} color="#2563EB" />
        <span>Dashboard</span>
      </button>

      {/* Case A: Dashboard is active */}
      {activeMenu === 'dashboard' && null}

      {/* Case A2: DED -> AI Estimate Analisis DED */}
      {(activeMenu === 'magic-ai' || activeMenu === 'ded-rab' || activeMenu === 'ai-assistant') && (
        <>
          <ChevronRight size={13} color="#94A3B8" />
          <button
            onClick={() => onNavigate('magic-ai')}
            style={crumbLinkStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
          >
            DED → AI Estimate
          </button>
          <ChevronRight size={13} color="#94A3B8" />
          <span style={activeLeafStyle}>Analisis DED</span>
        </>
      )}

      {/* Case B: Proyek List View */}
      {activeMenu === 'proyek' && (
        <>
          <ChevronRight size={13} color="#94A3B8" />
          <span style={activeLeafStyle}>
            {projectFilter && projectFilter !== 'Semua Proyek'
              ? `Proyek (${projectFilter})`
              : 'Semua Proyek'}
          </span>
        </>
      )}

      {/* Case C: Project Scoped Module View (e.g. Dashboard > Proyek > [Project Name] > [RAB Spreadsheet]) */}
      {currentProject && activeMenu !== 'dashboard' && activeMenu !== 'proyek' && activeMenu !== 'magic-ai' && activeMenu !== 'ded-rab' && activeMenu !== 'ai-assistant' && (
        <>
          <ChevronRight size={13} color="#94A3B8" />
          <button
            onClick={() => onNavigate('proyek', null)}
            style={crumbLinkStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            title="Daftar Proyek"
          >
            Proyek
          </button>

          <ChevronRight size={13} color="#94A3B8" />
          <button
            onClick={() => onNavigate('manajemen-proyek', currentProject.id)}
            style={{
              ...crumbLinkStyle,
              maxWidth: '180px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            title={`Buka Dashboard ${currentProject.name}`}
          >
            {currentProject.name}
          </button>

          <ChevronRight size={13} color="#94A3B8" />
          <span style={activeLeafStyle}>
            {getModuleLabel(activeMenu)}
          </span>
        </>
      )}

      {/* Case D: Global Module View without active project */}
      {!currentProject && activeMenu !== 'dashboard' && activeMenu !== 'proyek' && activeMenu !== 'magic-ai' && activeMenu !== 'ded-rab' && activeMenu !== 'ai-assistant' && (
        <>
          <ChevronRight size={13} color="#94A3B8" />
          <span style={activeLeafStyle}>
            {getModuleLabel(activeMenu)}
          </span>
          {settingsTab && (
            <>
              <ChevronRight size={13} color="#94A3B8" />
              <span style={activeLeafStyle}>{settingsTab}</span>
            </>
          )}
        </>
      )}
    </nav>
  );
};

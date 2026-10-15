import React from 'react';
import {
  MapPin,
  Building,
  User,
  FolderOpen,
  Database,
  Upload,
  Download,
  MoreHorizontal,
  ChevronDown,
  GitBranch,
} from 'lucide-react';
import { Project } from '../../types';
import projectThumb from '../../assets/template-bertingkat.jpg';

interface ProjectContextHeaderProps {
  currentProject: Project | null;
  onSwitchProject: () => void;
  onImportAhsp: () => void;
  onImportExcel: () => void;
  onOpenVersionsAndScenarios: () => void;
  onExport: () => void;
  latestVersionLabel?: string;
}

export const ProjectContextHeader: React.FC<ProjectContextHeaderProps> = ({
  currentProject,
  onSwitchProject,
  onImportAhsp,
  onImportExcel,
  onOpenVersionsAndScenarios,
  onExport,
  latestVersionLabel = 'v1.0',
}) => {
  const projectName = currentProject?.name || 'Rumah Tinggal Modern Tropis 2 Lantai';
  const projectLocation = currentProject?.location || 'BSD City, Tangerang Selatan';
  const projectBuildingType = currentProject?.buildingType || 'Rumah Tinggal';
  const projectClient = currentProject?.client || currentProject?.clientName || 'Ir. Hendra Kusuma';
  const isCompleted = currentProject?.status === 'completed' || currentProject?.status === 'approved';

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* 1. Breadcrumbs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          color: 'var(--ez-color-text-muted)',
          fontWeight: 500,
          marginBottom: '10px',
        }}
      >
        <span>Proyek</span>
        <span>›</span>
        <span>{projectName}</span>
        <span>›</span>
        <span style={{ color: 'var(--ez-color-primary)', fontWeight: 700 }}>Estimator Spreadsheet</span>
      </div>

      {/* 2. Main Context Card */}
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '20px',
          border: '1px solid #EEF1F6',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
        }}
      >
        {/* Left: Thumbnail & Project Metadata */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: '1 1 240px' }}>
          {/* Project Image Thumbnail */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '10px',
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              border: '1px solid var(--ez-color-border-line)',
              background: 'var(--ez-color-surface-tertiary)',
            }}
          >
            <img
              src={projectThumb}
              alt={projectName}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          {/* Titles & Metadata */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: 'var(--ez-color-text-primary)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                {projectName}
              </h1>
              {/* Status Badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 9px',
                  borderRadius: 'var(--ez-radius-pill)',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'var(--ez-pastel-mint)',
                  color: '#2c6e2c',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isCompleted ? '#16A34A' : '#10B981',
                  }}
                />
                {isCompleted ? 'Selesai' : 'Sedang Berjalan'}
              </span>
            </div>

            {/* Secondary Metadata line */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                fontSize: '12px',
                color: 'var(--ez-color-text-muted)',
                marginTop: '4px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <MapPin size={13} color="#94A3B8" />
                <span>{projectLocation}</span>
              </div>

              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'var(--ez-pastel-sky)',
                  color: '#2456a8',
                  padding: '2px 10px',
                  borderRadius: 'var(--ez-radius-pill)',
                }}
              >
                {projectBuildingType}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <User size={13} color="#94A3B8" />
                <span>Klien: <strong style={{ color: '#334155', fontWeight: 650 }}>{projectClient}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Primary Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Ganti Proyek */}
          <button
            onClick={onSwitchProject}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              fontSize: '12px',
              fontWeight: 650,
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
          >
            <FolderOpen size={14} color="#64748B" />
            <span>Ganti Proyek</span>
          </button>

          {/* Import AHSP */}
          <button
            onClick={onImportAhsp}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              fontSize: '12px',
              fontWeight: 650,
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
          >
            <Database size={14} color="#64748B" />
            <span>Import AHSP</span>
          </button>

          {/* Import Excel */}
          <button
            onClick={onImportExcel}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '8px',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              fontSize: '12px',
              fontWeight: 650,
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
          >
            <Upload size={14} color="#64748B" />
            <span>Import Excel</span>
          </button>

          {/* Versi & Skenario (Phase 11) */}
          <button
            onClick={onOpenVersionsAndScenarios}
            title="Versi Estimasi & Simulasi Value Engineering"
            style={{
              height: '34px',
              padding: '0 10px',
              borderRadius: '8px',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              fontSize: '12px',
              fontWeight: 650,
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
          >
            <GitBranch size={14} color="#2563EB" />
            <span>Versi & Skenario</span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                background: 'var(--ez-pastel-sky)',
                color: '#2456a8',
                padding: '1px 6px',
                borderRadius: 'var(--ez-radius-pill)',
              }}
            >
              {latestVersionLabel}
            </span>
          </button>

          {/* Export Button (Primary Blue) */}
          <button
            onClick={onExport}
            style={{
              height: '34px',
              padding: '0 14px',
              borderRadius: '8px',
              background: 'var(--ez-color-primary)',
              border: '1px solid #1D4ED8',
              fontSize: '12px',
              fontWeight: 700,
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ez-color-primary)')}
          >
            <Download size={14} color="#FFFFFF" />
            <span>Export</span>
            <ChevronDown size={13} color="#FFFFFF" />
          </button>

          {/* More actions button */}
          <button
            aria-label="Aksi lainnya"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              color: 'var(--ez-color-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

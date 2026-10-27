import React from 'react';
import {
  MapPin,
  Building,
  User,
  FolderOpen,
  Database,
  Upload,
  GitBranch,
} from 'lucide-react';
import { Project } from '../../types';

interface ProjectContextHeaderProps {
  currentProject: Project | null;
  onSwitchProject: () => void;
  onImportAhsp: () => void;
  onImportExcel: () => void;
  onOpenVersionsAndScenarios: () => void;
  /* onExport dipertahankan di interface agar call-site lama tidak rusak,
   * tetapi tombol Export di header DIHAPUS (owner 2026-10-27) — Export
   * kini di Pengaturan Estimasi, di kanan tombol Simpan. */
  onExport: () => void;
  latestVersionLabel?: string;
}

export const ProjectContextHeader: React.FC<ProjectContextHeaderProps> = ({
  currentProject,
  onSwitchProject,
  onImportAhsp,
  onImportExcel,
  onOpenVersionsAndScenarios,
  latestVersionLabel = 'v1.0',
}) => {
  /* Fallback jujur (owner 2026-10-27): bila field proyek kosong, tampilkan
   * "Belum diisi" — BUKAN contoh proyek orang lain. Ini murni presentasi:
   * tidak ada nilai tersimpan yang diubah, dan komponen ini tidak menulis
   * ke proyek. Tipe bangunan dibiarkan apa adanya karena itu kategori
   * generik, bukan data spesifik proyek. */
  const projectName = currentProject?.name || 'Belum diisi';
  const projectLocation = currentProject?.location || 'Belum diisi';
  const projectBuildingType = currentProject?.buildingType || 'Rumah Tinggal';
  const projectClient = currentProject?.client || currentProject?.clientName || 'Belum diisi';
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
          {/* Ikon proyek netral — foto kiri DIHAPUS (owner 2026-10-27):
              foto contoh gedung bertingkat itu menyesatkan karena bukan
              foto proyek user. */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '10px',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              border: '1px solid var(--ez-color-border-line)',
              background: 'var(--ez-hue-blue-bg)',
              color: 'var(--ez-hue-blue-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={projectName}
          >
            <Building size={26} />
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
                  color: 'var(--ez-hue-green-text)',
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
                  color: 'var(--ez-hue-blue-text-deep)',
                  padding: '2px 10px',
                  borderRadius: 'var(--ez-radius-pill)',
                }}
              >
                {projectBuildingType}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <User size={13} color="#94A3B8" />
                <span>Klien: <strong style={{ color: 'var(--ez-color-text-body)', fontWeight: 650 }}>{projectClient}</strong></span>
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
              color: 'var(--ez-color-text-body)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface)')}
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
              color: 'var(--ez-color-text-body)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface)')}
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
              color: 'var(--ez-color-text-body)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface)')}
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
              color: 'var(--ez-color-text-body)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ez-color-surface)')}
          >
            <GitBranch size={14} color="var(--ez-hue-blue-text)" />
            <span>Versi &amp; Skenario</span>
          </button>

          {/* Tombol Export di header DIHAPUS (owner 2026-10-27) —
              pindah ke Pengaturan Estimasi, di kanan tombol Simpan. */}

        </div>
      </div>
    </div>
  );
};

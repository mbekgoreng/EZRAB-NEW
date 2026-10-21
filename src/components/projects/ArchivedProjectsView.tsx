import React, { useState } from 'react';
import {
  Archive,
  RotateCcw,
  Download,
  Trash2,
  Search,
  MapPin,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { DeleteProjectModal } from './DeleteProjectModal';
import { useI18n } from '../../i18n/I18nContext';

interface ArchivedProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
}

export const ArchivedProjectsView: React.FC<ArchivedProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { updateProject, deleteProject, backupProjectData } = useProject();
  const { t } = useI18n();
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const archivedProjects = projects.filter(
    (p) => p.status === 'archived' || p.isArchived
  );

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const filteredProjects = archivedProjects.filter((p) => {
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.clientName || p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location || '').toLowerCase().includes(searchQuery.toLowerCase());

    const projectYear = p.createdAt ? new Date(p.createdAt).getFullYear().toString() : '2026';
    const matchesYear = yearFilter === 'all' || projectYear === yearFilter;

    return matchesSearch && matchesYear;
  });

  const totalArchivedValue = archivedProjects.reduce(
    (acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0),
    0
  );

  const handleRestoreProject = (proj: Project) => {
    if (
      window.confirm(
        t('proj.arch.restore_confirm_a') + proj.name + t('proj.arch.restore_confirm_b')
      )
    ) {
      updateProject(proj.id, {
        status: 'in_progress',
        isArchived: false,
      });
      alert(t('proj.arch.restore_ok_a') + proj.name + t('proj.arch.restore_ok_b'));
    }
  };

  const handleDeletePermanent = (proj: Project) => {
    setProjectToDelete(proj);
  };

  const handleExportArchiveBundle = (proj: Project) => {
    alert(t('proj.arch.export_ok_a') + proj.name + t('proj.arch.export_ok_b'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' , fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* 1. TOP 4 ARCHIVE VAULT KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '18px',
        }}
      >
        {/* KPI 1: Total Proyek Diarsipkan */}
        <div className="ezdb-anim ez-stat ez-stat-sky" style={{ animation: 'ezdb-rise 0.6s 0.05s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: '8px' }}>
            {t('proj.arch.kpi1_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#FFFFFF' }}>
            {archivedProjects.length}{' '}
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', fontWeight: 500, letterSpacing: '0' }}>{t('proj.arch.kpi1_u')}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: '6px' }}>
            {t('proj.arch.kpi1_s')}
          </div>
        </div>

        {/* KPI 2: Total Nilai Historis */}
        <div className="ezdb-anim ez-stat ez-stat-cream" style={{ animation: 'ezdb-rise 0.6s 0.12s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: '8px' }}>
            {t('proj.arch.kpi2_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#FFFFFF' }}>
            {totalArchivedValue === 0 ? 'Rp 0' : formatRupiah(totalArchivedValue)}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: '6px' }}>
            {t('proj.arch.kpi2_s')}
          </div>
        </div>

        {/* KPI 3: Benchmark Database Referensi */}
        <div className="ezdb-anim ez-stat ez-stat-indigo" style={{ animation: 'ezdb-rise 0.6s 0.19s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: '8px' }}>
            {t('proj.arch.kpi3_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#FFFFFF' }}>
            {t('proj.arch.kpi3_v')}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: '6px' }}>
            {t('proj.arch.kpi3_s')}
          </div>
        </div>

        {/* KPI 4: Status Keamanan Vault */}
        <div className="ezdb-anim ez-stat ez-stat-peach" style={{ animation: 'ezdb-rise 0.6s 0.26s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', marginBottom: '8px' }}>
            {t('proj.arch.kpi4_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#FFFFFF' }}>
            {t('proj.arch.kpi4_v')}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: '6px' }}>
            {t('proj.arch.kpi4_s')}
          </div>
        </div>
      </div>

      {/* 2. SEARCH & YEAR FILTER BAR */}
      <div
        className="ezdb-anim"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--ez-color-surface)',
          padding: '16px 20px',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid var(--ez-color-border-soft)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          flexWrap: 'wrap',
          gap: '12px',
          animation: 'ezdb-rise 0.6s 0.3s both',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
            <Search size={14} color="var(--ez-color-text-faint)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="text"
              placeholder={t('proj.arch.search_ph')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '38px',
                paddingLeft: '34px',
                paddingRight: '12px',
                borderRadius: 'var(--ez-radius-control)',
                border: '1px solid var(--ez-color-border-soft)',
                background: 'var(--ez-color-surface-faint)',
                fontSize: '13px',
                color: 'var(--ez-color-text-primary)',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', '2026', '2025', '2024'].map((year) => (
              <button
                key={year}
                onClick={() => setYearFilter(year)}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  borderRadius: 'var(--ez-radius-pill)',
                  fontSize: '12px',
                  fontWeight: yearFilter === year ? 700 : 600,
                  background: yearFilter === year ? 'var(--ez-pastel-sky)' : 'var(--ez-color-surface-faint)',
                  color: yearFilter === year ? 'var(--ez-hue-blue-text-deep)' : 'var(--ez-color-text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {year === 'all' ? t('proj.arch.all_years') : year}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
          {t('proj.arch.showing_a')}{' '}<span style={{ color: 'var(--ez-color-text-primary)', fontWeight: 800 }}>{filteredProjects.length}</span>{' '}{t('proj.arch.showing_b')}
        </div>
      </div>

      {/* 3. ARCHIVED PROJECTS LIST */}
      {filteredProjects.length === 0 ? (
        <div
          className="ezdb-anim"
          style={{
            background: 'var(--ez-color-surface)',
            borderRadius: 'var(--ez-radius-card)',
            border: '1px solid var(--ez-color-border-soft)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'ezdb-rise 0.6s 0.36s both',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-surface-tertiary)',
              color: 'var(--ez-color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <Archive size={26} />
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
            {t('proj.arch.empty_t')}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', maxWidth: '380px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            {t('proj.arch.empty_b')}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '18px',
          }}
        >
          {filteredProjects.map((proj) => {
            const totalCost = proj.totalRab || proj.costSummary?.grandTotal || 0;

            return (
              <div
                key={proj.id}
                className="ezdb-anim"
                style={{
                  background: 'var(--ez-color-surface)',
                  borderRadius: 'var(--ez-radius-card)',
                  border: '1px solid var(--ez-color-border-soft)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  animation: 'ezdb-rise 0.6s 0.36s both',
                }}
              >
                <div>
                  {/* Card Header: Code & Archive Watermark Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 'var(--ez-radius-pill)',
                        background: 'var(--ez-pastel-sky)',
                        color: 'var(--ez-hue-blue-text-deep)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {proj.projectNumber || proj.id}
                    </span>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 'var(--ez-radius-pill)',
                        background: 'var(--ez-color-surface-tertiary)',
                        color: 'var(--ez-color-text-muted)',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Archive size={11} />
                      <span>{t('proj.arch.badge')}</span>
                    </span>
                  </div>

                  {/* Title */}
                  <h4
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: 'var(--ez-color-text-primary)',
                      margin: '0 0 4px 0',
                      lineHeight: 1.3,
                    }}
                  >
                    {proj.name}
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ez-color-text-muted)', marginBottom: '12px' }}>
                    <MapPin size={12} color="var(--ez-color-text-faint)" />
                    <span>{proj.location || t('proj.arch.loc_default')}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || t('proj.arch.client_default')}</span>
                  </div>

                  {/* Summary Box */}
                  <div
                    style={{
                      background: 'var(--ez-color-surface-faint)',
                      borderRadius: 'var(--ez-radius-control)',
                      padding: '10px 12px',
                      border: '1px solid var(--ez-color-border-soft)',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ez-color-text-muted)' }}>
                      <span>{t('proj.arch.hist_t')}</span>
                      <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{formatRupiah(totalCost)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ez-color-text-muted)' }}>
                      <span>{t('proj.arch.type_t')}</span>
                      <span style={{ fontWeight: 600, color: 'var(--ez-color-text-primary)' }}>{proj.buildingType || t('proj.arch.type_default')}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Strip: Restore, Download, Delete Permanent */}
                <div style={{ borderTop: '1px solid var(--ez-color-border-soft)', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    onClick={() => handleRestoreProject(proj)}
                    style={{
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: 'var(--ez-radius-control)',
                      background: 'var(--ez-color-primary)',
                      color: 'var(--ez-color-on-primary)',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>{t('proj.arch.restore_btn')}</span>
                  </button>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleExportArchiveBundle(proj)}
                      title={t('proj.arch.export_title')}
                      style={{
                        height: '36px',
                        padding: '0 12px',
                        borderRadius: 'var(--ez-radius-control)',
                        background: 'var(--ez-color-surface)',
                        border: '1px solid var(--ez-color-border-line)',
                        color: 'var(--ez-color-text-primary)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Download size={13} />
                      <span>{t('proj.arch.export_btn')}</span>
                    </button>

                    <button
                      onClick={() => handleDeletePermanent(proj)}
                      title={t('proj.arch.delete_title')}
                      style={{
                        height: '36px',
                        width: '36px',
                        borderRadius: 'var(--ez-radius-control)',
                        background: '#FCE9E9',
                        border: '1px solid #F5D5D5',
                        color: 'var(--ez-hue-rose-text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Archive Project Confirmation & Backup Modal */}
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

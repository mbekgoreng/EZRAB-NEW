import React, { useState } from 'react';
import {
  CheckCircle2,
  Trophy,
  FileCheck,
  Archive,
  RotateCcw,
  Search,
  MapPin,
  FileText,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { useI18n } from '../../i18n/I18nContext';

interface CompletedProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
}

export const CompletedProjectsView: React.FC<CompletedProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { updateProject } = useProject();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');

  const completedProjects = projects.filter(
    (p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED'
  );

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const filteredProjects = completedProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    return (
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.clientName || p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const totalCompletedValue = completedProjects.reduce(
    (acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0),
    0
  );

  // Financial simulation: estimate profit margins
  const getCompletedProjectFinancials = (proj: Project) => {
    const totalRab = proj.totalRab || proj.costSummary?.grandTotal || 0;
    // Simulated real cost (90-93% of RAB for healthy margin)
    const realCost = Math.round(totalRab * 0.88);
    const profitMargin = totalRab - realCost;
    const profitPercent = totalRab > 0 ? ((profitMargin / totalRab) * 100).toFixed(1) : '12.0';
    return { totalRab, realCost, profitMargin, profitPercent };
  };

  const handleArchiveProject = (proj: Project) => {
    if (
      window.confirm(
        t('proj.done.arch_confirm_a') + proj.name + t('proj.done.arch_confirm_b')
      )
    ) {
      updateProject(proj.id, {
        status: 'archived',
        isArchived: true,
        archivedAt: new Date().toISOString(),
      });
      alert(t('proj.done.arch_ok_a') + proj.name + t('proj.done.arch_ok_b'));
    }
  };

  const handleReopenProject = (proj: Project) => {
    if (
      window.confirm(
        t('proj.done.reopen_confirm_a') + proj.name + t('proj.done.reopen_confirm_b')
      )
    ) {
      updateProject(proj.id, {
        status: 'in_progress',
        progress: 95,
      });
      alert(t('proj.done.reopen_ok_a') + proj.name + t('proj.done.reopen_ok_b'));
    }
  };

  const handlePrintBast = (proj: Project) => {
    alert(t('proj.done.bast_ok_a') + proj.name + t('proj.done.bast_ok_b'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' , fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* 1. TOP 4 CLOSEOUT & HANDOVER KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '18px',
        }}
      >
        {/* KPI 1: Total Proyek Selesai */}
        <div className="ezdb-anim ez-stat ez-stat-mint" style={{ animation: 'ezdb-rise 0.6s 0.05s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.done.kpi1_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {completedProjects.length}{' '}
            <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', fontWeight: 500, letterSpacing: '0' }}>{t('proj.done.kpi1_u')}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {t('proj.done.kpi1_s')}
          </div>
        </div>

        {/* KPI 2: Total Omset Nilai Selesai */}
        <div className="ezdb-anim ez-stat ez-stat-cream" style={{ animation: 'ezdb-rise 0.6s 0.12s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.done.kpi2_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {totalCompletedValue === 0 ? 'Rp 0' : formatRupiah(totalCompletedValue)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {t('proj.done.kpi2_s')}
          </div>
        </div>

        {/* KPI 3: Rata-rata Margin Profit */}
        <div className="ezdb-anim ez-stat ez-stat-sky" style={{ animation: 'ezdb-rise 0.6s 0.19s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.done.kpi3_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-pill-ok-text)' }}>
            +12.4%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {t('proj.done.kpi3_s')}
          </div>
        </div>

        {/* KPI 4: Masa Retensi Aktif */}
        <div className="ezdb-anim ez-stat ez-stat-peach" style={{ animation: 'ezdb-rise 0.6s 0.26s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.done.kpi4_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {completedProjects.length}{' '}
            <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', fontWeight: 500, letterSpacing: '0' }}>{t('proj.done.kpi4_u')}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {t('proj.done.kpi4_s')}
          </div>
        </div>
      </div>

      {/* 2. SEARCH & CLOSEOUT ACTION BAR */}
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
        <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
          <Search size={14} color="var(--ez-color-text-faint)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input
            type="text"
            placeholder={t('proj.done.search_ph')}
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

        <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
          {t('proj.done.showing_a')}{' '}<span style={{ color: 'var(--ez-color-text-primary)', fontWeight: 800 }}>{filteredProjects.length}</span>{' '}{t('proj.done.showing_b')}
        </div>
      </div>

      {/* 3. COMPLETED PROJECT CARDS */}
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
              background: 'var(--ez-pastel-mint)',
              color: 'var(--ez-pill-ok-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <Trophy size={26} />
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
            {t('proj.done.empty_t')}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', maxWidth: '380px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            {t('proj.done.empty_b')}
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
            const { totalRab, realCost, profitMargin, profitPercent } = getCompletedProjectFinancials(proj);

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
                  {/* Card Header: Code & Completed 100% Badge */}
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
                        background: 'var(--ez-pastel-mint)',
                        color: 'var(--ez-pill-ok-text)',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle2 size={12} />
                      <span>{t('proj.done.badge')}</span>
                    </span>
                  </div>

                  {/* Project Title */}
                  <h4
                    onClick={() => onOpenProject?.(proj.id, 'laporan')}
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: 'var(--ez-color-text-primary)',
                      margin: '0 0 4px 0',
                      cursor: 'pointer',
                      lineHeight: 1.3,
                    }}
                  >
                    {proj.name}
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ez-color-text-muted)', marginBottom: '12px' }}>
                    <MapPin size={12} color="var(--ez-color-text-faint)" />
                    <span>{proj.location || t('proj.done.loc_default')}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || t('proj.done.client_default')}</span>
                  </div>

                  {/* Financial Evaluation Box (Closeout Reconciliation) */}
                  <div
                    style={{
                      background: 'var(--ez-color-surface-faint)',
                      borderRadius: 'var(--ez-radius-control)',
                      padding: '12px',
                      border: '1px solid var(--ez-color-border-soft)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ez-color-text-muted)' }}>
                      <span>{t('proj.done.contract_t')}</span>
                      <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{formatRupiah(totalRab)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ez-color-text-muted)' }}>
                      <span>{t('proj.done.actual_t')}</span>
                      <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{formatRupiah(realCost)}</span>
                    </div>

                    <div
                      style={{
                        borderTop: '1px dashed var(--ez-color-border-line)',
                        paddingTop: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontWeight: 700,
                        color: 'var(--ez-pill-ok-text)',
                      }}
                    >
                      <span>{t('proj.done.margin_t')}</span>
                      <span>+{formatRupiah(profitMargin)} ({profitPercent}%)</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Closeout Action Strip */}
                <div style={{ borderTop: '1px solid var(--ez-color-border-soft)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handlePrintBast(proj)}
                      style={{
                        flex: 1,
                        height: '36px',
                        borderRadius: 'var(--ez-radius-control)',
                        background: 'var(--ez-pastel-sky)',
                        border: 'none',
                        color: 'var(--ez-hue-blue-text-deep)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <FileCheck size={13} />
                      <span>{t('proj.done.bast_btn')}</span>
                    </button>

                    <button
                      onClick={() => onOpenProject?.(proj.id, 'laporan')}
                      style={{
                        flex: 1,
                        height: '36px',
                        borderRadius: 'var(--ez-radius-control)',
                        background: 'var(--ez-color-primary)',
                        color: 'var(--ez-color-on-primary)',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
                      }}
                    >
                      <FileText size={13} />
                      <span>{t('proj.done.report_btn')}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      onClick={() => handleReopenProject(proj)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--ez-color-text-muted)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 0',
                      }}
                    >
                      <RotateCcw size={11} />
                      <span>{t('proj.done.reopen_btn')}</span>
                    </button>

                    <button
                      onClick={() => handleArchiveProject(proj)}
                      style={{
                        height: '32px',
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
                      <Archive size={11} />
                      <span>{t('proj.done.arch_btn')}</span>
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

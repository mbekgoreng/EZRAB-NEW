import React, { useState } from 'react';
import {
  Plus,
  Sparkles,
  Search,
  CheckCircle2,
  Circle,
  Rocket,
  Copy,
  Trash2,
  MapPin,
} from 'lucide-react';
import { Project } from '../../types';
import docEmptyImg from '../../assets/proyek-doc-empty.png';
import { useProject } from '../../context/ProjectContext';
import { DeleteProjectModal } from './DeleteProjectModal';
import { useI18n } from '../../i18n/I18nContext';

interface DraftProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
}

export const DraftProjectsView: React.FC<DraftProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { updateProject, deleteProject, backupProjectData, createProject } = useProject();
  const { t } = useI18n();
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const draftProjects = projects.filter(
    (p) => p.status === 'draft' || !p.status || p.status === 'DRAFT'
  );

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const filteredDrafts = draftProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    return (
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.clientName || p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const totalDraftValue = draftProjects.reduce(
    (acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0),
    0
  );

  // Compute draft readiness score for each project (0 to 100%)
  const getDraftReadiness = (p: Project) => {
    let score = 25; // Base info
    if (p.location && (p.clientName || p.client)) score += 25;
    if (p.totalRab && p.totalRab > 0) score += 25;
    if (p.sections && p.sections.length > 0) score += 25;
    return Math.min(100, score);
  };

  const handlePublishToInProgress = (proj: Project) => {
    if (
      window.confirm(
        t('proj.draft.publish_confirm_a') + proj.name + t('proj.draft.publish_confirm_b')
      )
    ) {
      updateProject(proj.id, {
        status: 'in_progress',
        progress: proj.progress && proj.progress > 0 ? proj.progress : 5,
        startDate: proj.startDate || new Date().toISOString().split('T')[0],
      });
      alert(t('proj.draft.publish_ok_a') + proj.name + t('proj.draft.publish_ok_b'));
    }
  };

  const handleDuplicateDraft = (proj: Project) => {
    const newProj = createProject({
      name: proj.name + t('proj.draft.dup_suffix'),
      clientName: proj.clientName || proj.client,
      location: proj.location,
      buildingType: proj.buildingType,
      status: 'draft',
      totalRab: proj.totalRab,
      costSummary: proj.costSummary,
      sections: proj.sections,
    });
    alert(t('proj.draft.dup_ok_a') + newProj.name + '");');
  };

  const handleDeleteDraft = (proj: Project) => {
    setProjectToDelete(proj);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* 1. TOP SPECIALIZED DRAFT KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '18px',
        }}
      >
        {/* KPI 1: Total Draft */}
        <div className="ezdb-anim ez-stat ez-stat-cream" style={{ animation: 'ezdb-rise 0.6s 0.05s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.draft.kpi1_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {draftProjects.length}{' '}
            <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', fontWeight: 500, letterSpacing: '0' }}>{t('proj.draft.kpi1_u')}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {t('proj.draft.kpi1_s')}
          </div>
        </div>

        {/* KPI 2: Potensi Nilai Draft */}
        <div className="ezdb-anim ez-stat ez-stat-mint" style={{ animation: 'ezdb-rise 0.6s 0.12s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.draft.kpi2_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {totalDraftValue === 0 ? 'Rp 0' : formatRupiah(totalDraftValue)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {t('proj.draft.kpi2_s')}
          </div>
        </div>

        {/* KPI 3: Draft Siap Diajukan */}
        <div className="ezdb-anim ez-stat ez-stat-sky" style={{ animation: 'ezdb-rise 0.6s 0.19s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.draft.kpi3_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {draftProjects.filter((p) => getDraftReadiness(p) >= 75).length}{' '}
            <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', fontWeight: 500, letterSpacing: '0' }}>{t('proj.draft.kpi3_u')}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {t('proj.draft.kpi3_s')}
          </div>
        </div>

        {/* KPI 4: Akselerasi Template Rumah */}
        <div className="ezdb-anim ez-stat ez-stat-peach" style={{ animation: 'ezdb-rise 0.6s 0.26s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.draft.kpi4_t')}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ez-color-text-primary)', lineHeight: 1.4, marginBottom: '10px' }}>
            {t('proj.draft.kpi4_b')}
          </div>
          <button
            onClick={() => onNavigateToTab?.('template-rab')}
            style={{
              background: 'var(--ez-color-primary)',
              border: 'none',
              color: 'var(--ez-color-on-primary)',
              borderRadius: 'var(--ez-radius-control)',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('proj.draft.kpi4_btn')} →
          </button>
        </div>
      </div>

      {/* 2. DRAFT WORKSPACE BANNER: AI ACCELERATOR */}
      <div
        className="ezdb-anim"
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid var(--ez-color-border-soft)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          animation: 'ezdb-rise 0.6s 0.3s both',
        }}
      >
        <div style={{ maxWidth: '560px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#A8780A', fontSize: '11.5px', fontWeight: 750, marginBottom: '6px' }}>
            <Sparkles size={14} />
            <span>{t('proj.draft.banner_tag')}</span>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 4px 0' }}>
            {t('proj.draft.banner_t')}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: 0, lineHeight: 1.5 }}>
            {t('proj.draft.banner_b')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={onOpenMagicAi}
            style={{
              height: '40px',
              padding: '0 18px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-primary)',
              color: 'var(--ez-color-on-primary)',
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
            }}
          >
            <Sparkles size={14} />
            <span>{t('proj.draft.gen_btn')}</span>
          </button>
          <button
            onClick={onCreateProject}
            style={{
              height: '40px',
              padding: '0 16px',
              borderRadius: 'var(--ez-radius-control)',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              color: 'var(--ez-color-text-primary)',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={14} />
            <span>{t('proj.draft.manual_btn')}</span>
          </button>
        </div>
      </div>

      {/* 3. DRAFT SEARCH & FILTER TOOLBAR */}
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
          gap: '10px',
          animation: 'ezdb-rise 0.6s 0.36s both',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
          <Search size={14} color="var(--ez-color-text-faint)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input
            type="text"
            placeholder={t('proj.draft.search_ph')}
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

        <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
          {t('proj.draft.showing_a')}{' '}<span style={{ color: 'var(--ez-color-text-primary)', fontWeight: 800 }}>{filteredDrafts.length}</span>{' '}{t('proj.draft.showing_b')}
        </div>
      </div>

      {/* 4. DRAFT CARDS LIST WITH PRE-CONSTRUCTION READINESS CHECKLIST */}
      {filteredDrafts.length === 0 ? (
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
            animation: 'ezdb-rise 0.6s 0.42s both',
          }}
        >
          <img
            src={docEmptyImg}
            alt="No Drafts"
            style={{ width: '140px', maxHeight: '100px', objectFit: 'contain', marginBottom: '14px', opacity: 0.85 }}
          />
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
            {t('proj.draft.empty_t')}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', maxWidth: '380px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            {t('proj.draft.empty_b')}
          </p>
          <button
            onClick={onCreateProject}
            style={{
              height: '40px',
              padding: '0 20px',
              background: 'var(--ez-color-primary)',
              color: 'var(--ez-color-on-primary)',
              borderRadius: 'var(--ez-radius-control)',
              border: 'none',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('proj.draft.empty_btn')}
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '18px',
          }}
        >
          {filteredDrafts.map((proj) => {
            const readiness = getDraftReadiness(proj);
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
                  animation: 'ezdb-rise 0.6s 0.42s both',
                }}
              >
                <div>
                  {/* Header: Badge & Readiness Score */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 'var(--ez-radius-pill)',
                        background: 'var(--ez-pastel-cream)',
                        color: '#A8780A',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('proj.draft.badge')}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: readiness >= 75 ? 'var(--ez-pill-ok-text)' : '#A8780A',
                      }}
                    >
                      {t('proj.draft.readiness')} {readiness}%
                    </span>
                  </div>

                  {/* Title & Info */}
                  <h4
                    onClick={() => onOpenProject?.(proj.id, 'rab-estimasi')}
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
                    <span>{proj.location || t('proj.draft.loc_default')}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || t('proj.draft.client_default')}</span>
                  </div>

                  {/* Checklist Kelengkapan Pra-Konstruksi */}
                  <div
                    style={{
                      background: 'var(--ez-color-surface-faint)',
                      borderRadius: 'var(--ez-radius-control)',
                      padding: '10px 12px',
                      border: '1px solid var(--ez-color-border-soft)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      fontSize: '11.5px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)', marginBottom: '2px' }}>
                      {t('proj.draft.checklist_t')}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: proj.location ? 'var(--ez-pill-ok-text)' : 'var(--ez-color-text-muted)' }}>
                      {proj.location ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>{t('proj.draft.check_loc')}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: proj.buildingType ? 'var(--ez-pill-ok-text)' : 'var(--ez-color-text-muted)' }}>
                      {proj.buildingType ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>{t('proj.draft.check_type_a')}{proj.buildingType || t('proj.draft.check_type_none')})</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: totalCost > 0 ? 'var(--ez-pill-ok-text)' : 'var(--ez-color-text-muted)' }}>
                      {totalCost > 0 ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>{t('proj.draft.check_rab_a')}{formatRupiah(totalCost)})</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Strip */}
                <div style={{ borderTop: '1px solid var(--ez-color-border-soft)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>{t('proj.draft.budget_t')}</div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                        {formatRupiah(totalCost)}
                      </div>
                    </div>

                    {/* Launch / Publish Button */}
                    <button
                      onClick={() => handlePublishToInProgress(proj)}
                      title={t('proj.draft.publish_title')}
                      style={{
                        height: '36px',
                        padding: '0 14px',
                        borderRadius: 'var(--ez-radius-control)',
                        background: '#16A34A',
                        color: 'var(--ez-color-on-primary)',
                        fontSize: '13px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 14px rgba(22,163,74,0.28)',
                      }}
                    >
                      <Rocket size={13} />
                      <span>{t('proj.draft.publish_btn')}</span>
                    </button>
                  </div>

                  {/* Secondary Edit & Utility Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => onOpenProject?.(proj.id, 'qto')}
                        style={{
                          height: '32px',
                          padding: '0 12px',
                          borderRadius: 'var(--ez-radius-control)',
                          background: 'var(--ez-color-surface)',
                          border: '1px solid var(--ez-color-border-line)',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--ez-color-text-primary)',
                          cursor: 'pointer',
                        }}
                      >
                        {t('proj.draft.qto_btn')}
                      </button>
                      <button
                        onClick={() => onOpenProject?.(proj.id, 'rab-estimasi')}
                        style={{
                          height: '32px',
                          padding: '0 12px',
                          borderRadius: 'var(--ez-radius-control)',
                          background: 'var(--ez-pastel-sky)',
                          border: 'none',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#2456A8',
                          cursor: 'pointer',
                        }}
                      >
                        {t('proj.draft.rab_btn')}
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => handleDuplicateDraft(proj)}
                        title={t('proj.draft.dup_title')}
                        style={{
                          height: '32px',
                          width: '32px',
                          borderRadius: 'var(--ez-radius-control)',
                          background: 'var(--ez-color-surface-faint)',
                          border: '1px solid var(--ez-color-border-soft)',
                          color: 'var(--ez-color-text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteDraft(proj)}
                        title={t('proj.draft.del_title')}
                        style={{
                          height: '32px',
                          width: '32px',
                          borderRadius: 'var(--ez-radius-control)',
                          background: '#FCE9E9',
                          border: '1px solid #F5D5D5',
                          color: '#B54747',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
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
      )}

      {/* Delete Draft Project Confirmation & Backup Modal */}
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

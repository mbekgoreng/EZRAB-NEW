import React, { useState } from 'react';
import {
  LineChart,
  MapPin,
  Sliders,
  CheckCircle,
  Plus,
  Search,
  Play,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { useI18n } from '../../i18n/I18nContext';

interface InProgressProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
}

export const InProgressProjectsView: React.FC<InProgressProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { updateProject } = useProject();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusSubFilter, setStatusSubFilter] = useState<'all' | 'on_track' | 'behind'>('all');
  
  // Progress modal edit state
  const [editingProgressProjId, setEditingProgressProjId] = useState<string | null>(null);
  const [newProgressVal, setNewProgressVal] = useState<number>(0);

  const inProgressProjects = projects.filter((p) => p.status === 'in_progress');

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  // Mock / Calculated S-Curve planned vs actual deviation for simulation
  const getProjectScheduleStatus = (proj: Project) => {
    const progress = proj.progress || 35;
    // Simulate planned progress (e.g. 5% higher or lower based on id hash)
    const planned = Math.min(100, Math.max(10, progress + (proj.id.length % 2 === 0 ? 4 : -3)));
    const deviation = progress - planned;
    const isAhead = deviation >= 0;
    return { progress, planned, deviation, isAhead };
  };

  const onTrackCount = inProgressProjects.filter((p) => getProjectScheduleStatus(p).isAhead).length;
  const behindCount = inProgressProjects.length - onTrackCount;
  const totalActiveValue = inProgressProjects.reduce(
    (acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0),
    0
  );
  const avgActiveProgress = inProgressProjects.length > 0
    ? Math.round(inProgressProjects.reduce((acc, p) => acc + (p.progress || 35), 0) / inProgressProjects.length)
    : 0;

  const filteredProjects = inProgressProjects.filter((proj) => {
    const matchesSearch =
      !searchQuery.trim() ||
      proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (proj.clientName || proj.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (proj.location || '').toLowerCase().includes(searchQuery.toLowerCase());

    const { isAhead } = getProjectScheduleStatus(proj);
    const matchesSubFilter =
      statusSubFilter === 'all' ||
      (statusSubFilter === 'on_track' && isAhead) ||
      (statusSubFilter === 'behind' && !isAhead);

    return matchesSearch && matchesSubFilter;
  });

  const handleOpenProgressModal = (proj: Project) => {
    setEditingProgressProjId(proj.id);
    setNewProgressVal(proj.progress || 35);
  };

  const handleSaveProgress = (projId: string) => {
    updateProject(projId, {
      progress: newProgressVal,
      updatedAt: new Date().toISOString(),
    });
    setEditingProgressProjId(null);
  };

  const handleMarkAsCompleted = (proj: Project) => {
    if (
      window.confirm(
        t('proj.active.done_confirm_a') + proj.name + t('proj.active.done_confirm_b')
      )
    ) {
      updateProject(proj.id, {
        status: 'completed',
        progress: 100,
        targetDate: proj.targetDate || new Date().toISOString().split('T')[0],
      });
      alert(t('proj.active.done_ok_a') + proj.name + t('proj.active.done_ok_b'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' , fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* 1. TOP 4 LIVE CONSTRUCTION KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '18px',
        }}
      >
        {/* KPI 1: Proyek Aktif */}
        <div className="ezdb-anim ez-stat ez-stat-sky" style={{ animation: 'ezdb-rise 0.6s 0.05s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.active.kpi1_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {inProgressProjects.length}{' '}
            <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', fontWeight: 500, letterSpacing: '0' }}>{t('proj.active.kpi1_u')}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {formatRupiah(totalActiveValue)}
          </div>
        </div>

        {/* KPI 2: On Schedule */}
        <div className="ezdb-anim ez-stat ez-stat-mint" style={{ animation: 'ezdb-rise 0.6s 0.12s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.active.kpi2_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {onTrackCount}{' '}
            <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', fontWeight: 500, letterSpacing: '0' }}>{t('proj.active.kpi2_u')}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '6px' }}>
            {t('proj.active.kpi2_s')}
          </div>
        </div>

        {/* KPI 3: Terlambat / Butuh Percepatan */}
        <div
          className="ezdb-anim ez-stat"
          style={{
            animation: 'ezdb-rise 0.6s 0.19s both',
            background: '#FCE9E9',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.active.kpi3_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#B54747' }}>
            {behindCount}{' '}
            <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', fontWeight: 500, letterSpacing: '0' }}>{t('proj.active.kpi3_u')}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#B54747', marginTop: '6px' }}>
            {t('proj.active.kpi3_s')}
          </div>
        </div>

        {/* KPI 4: Rata-rata Progres Realisasi */}
        <div className="ezdb-anim ez-stat ez-stat-cream" style={{ animation: 'ezdb-rise 0.6s 0.26s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-muted)', marginBottom: '8px' }}>
            {t('proj.active.kpi4_t')}
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: 'var(--ez-color-text-primary)' }}>
            {avgActiveProgress}%
          </div>
          <div style={{ width: '100%', height: '6px', background: 'rgba(20,20,18,0.08)', borderRadius: 'var(--ez-radius-pill)', overflow: 'hidden', marginTop: '10px' }}>
            <div style={{ width: `${avgActiveProgress}%`, height: '100%', background: 'var(--ez-color-primary)', borderRadius: 'var(--ez-radius-pill)' }} />
          </div>
        </div>
      </div>

      {/* 2. KURVA S & MONITORING HEADER BAR */}
      <div
        className="ezdb-anim"
        style={{
          background: 'var(--ez-color-surface)',
          padding: '16px 20px',
          borderRadius: 'var(--ez-radius-card)',
          border: '1px solid var(--ez-color-border-soft)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
              placeholder={t('proj.active.search_ph')}
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

          {/* Subfilter Chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setStatusSubFilter('all')}
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: 'var(--ez-radius-pill)',
                fontSize: '12px',
                fontWeight: statusSubFilter === 'all' ? 700 : 600,
                background: statusSubFilter === 'all' ? 'var(--ez-pastel-sky)' : 'var(--ez-color-surface-faint)',
                color: statusSubFilter === 'all' ? '#2456A8' : 'var(--ez-color-text-muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('proj.active.chip_all')} ({inProgressProjects.length})
            </button>
            <button
              onClick={() => setStatusSubFilter('on_track')}
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: 'var(--ez-radius-pill)',
                fontSize: '12px',
                fontWeight: statusSubFilter === 'on_track' ? 700 : 600,
                background: statusSubFilter === 'on_track' ? 'var(--ez-pastel-mint)' : 'var(--ez-color-surface-faint)',
                color: statusSubFilter === 'on_track' ? 'var(--ez-pill-ok-text)' : 'var(--ez-color-text-muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('proj.active.chip_track')} ({onTrackCount})
            </button>
            <button
              onClick={() => setStatusSubFilter('behind')}
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: 'var(--ez-radius-pill)',
                fontSize: '12px',
                fontWeight: statusSubFilter === 'behind' ? 700 : 600,
                background: statusSubFilter === 'behind' ? '#FCE9E9' : 'var(--ez-color-surface-faint)',
                color: statusSubFilter === 'behind' ? '#B54747' : 'var(--ez-color-text-muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('proj.active.chip_delay')} ({behindCount})
            </button>
          </div>
        </div>

        <button
          onClick={onCreateProject}
          style={{
            height: '38px',
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
          <Plus size={14} />
          <span>{t('proj.active.add_btn')}</span>
        </button>
      </div>

      {/* 3. ACTIVE PROJECTS DETAILED MONITORING CARDS */}
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
              background: 'var(--ez-pastel-sky)',
              color: 'var(--ez-color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <Play size={26} />
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '0 0 6px 0' }}>
            {t('proj.active.empty_t')}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', maxWidth: '380px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            {t('proj.active.empty_b')}
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
            {t('proj.active.new_btn')}
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
          {filteredProjects.map((proj) => {
            const { progress, planned, deviation, isAhead } = getProjectScheduleStatus(proj);
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
                  {/* Card Header: Code & Live Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 'var(--ez-radius-pill)',
                        background: 'var(--ez-pastel-sky)',
                        color: '#2456A8',
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
                        background: isAhead ? 'var(--ez-pastel-mint)' : '#FCE9E9',
                        color: isAhead ? 'var(--ez-pill-ok-text)' : '#B54747',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isAhead ? t('proj.active.badge_on') : t('proj.active.badge_late')}
                    </span>
                  </div>

                  {/* Project Name */}
                  <h4
                    onClick={() => onOpenProject?.(proj.id, 'manajemen-proyek')}
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ez-color-text-muted)', marginBottom: '14px' }}>
                    <MapPin size={12} color="var(--ez-color-text-faint)" />
                    <span>{proj.location || t('proj.active.loc_default')}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || t('proj.active.client_default')}</span>
                  </div>

                  {/* Dual Kurva S Progress Comparison Box */}
                  <div
                    style={{
                      background: 'var(--ez-color-surface-faint)',
                      borderRadius: 'var(--ez-radius-control)',
                      padding: '12px',
                      border: '1px solid var(--ez-color-border-soft)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>{t('proj.active.actual_t')}</span>
                      <span style={{ fontWeight: 800, color: 'var(--ez-color-primary)', fontSize: '14px' }}>{progress}%</span>
                    </div>

                    {/* Dual Progress Bar */}
                    <div style={{ position: 'relative', width: '100%', height: '8px', background: '#F0EFE9', borderRadius: 'var(--ez-radius-pill)', overflow: 'hidden' }}>
                      {/* Actual Progress Bar */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${progress}%`,
                          background: isAhead ? '#16A34A' : 'var(--ez-color-primary)',
                          borderRadius: 'var(--ez-radius-pill)',
                          zIndex: 2,
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                      <span>{t('proj.active.planned_t')}<strong>{planned}%</strong></span>
                      <span style={{ fontWeight: 700, color: isAhead ? 'var(--ez-pill-ok-text)' : '#B54747' }}>
                        {t('proj.active.dev_t')}{deviation >= 0 ? `+${deviation}%` : `${deviation}%`}
                      </span>
                    </div>
                  </div>

                  {/* Inline Quick Progress Slider Editor */}
                  {editingProgressProjId === proj.id && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '12px',
                        background: 'var(--ez-pastel-sky)',
                        borderRadius: 'var(--ez-radius-control)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, color: '#2456A8' }}>
                        <span>{t('proj.active.slider_t')}</span>
                        <span>{newProgressVal}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={newProgressVal}
                        onChange={(e) => setNewProgressVal(Number(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                        <button
                          onClick={() => setEditingProgressProjId(null)}
                          style={{ height: '30px', padding: '0 12px', fontSize: '12px', fontWeight: 600, borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-primary)', cursor: 'pointer' }}
                        >
                          {t('proj.active.cancel')}
                        </button>
                        <button
                          onClick={() => handleSaveProgress(proj.id)}
                          style={{ height: '30px', padding: '0 12px', fontSize: '12px', borderRadius: 'var(--ez-radius-control)', background: 'var(--ez-color-primary)', color: 'var(--ez-color-on-primary)', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                        >
                          {t('proj.active.save')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Strip: Value, S-Curve Shortcut, & Mark Complete */}
                <div style={{ borderTop: '1px solid var(--ez-color-border-soft)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)' }}>{t('proj.active.value_t')}</div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                        {formatRupiah(totalCost)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenProgressModal(proj)}
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
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Sliders size={12} />
                      <span>{t('proj.active.update_opname')}</span>
                    </button>
                  </div>

                  {/* Primary Navigation Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => onOpenProject?.(proj.id, 'kurva-s')}
                      style={{
                        flex: 1,
                        height: '36px',
                        borderRadius: 'var(--ez-radius-control)',
                        background: 'var(--ez-pastel-sky)',
                        border: 'none',
                        color: '#2456A8',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <LineChart size={13} />
                      <span>{t('proj.active.curve_btn')}</span>
                    </button>

                    <button
                      onClick={() => onOpenProject?.(proj.id, 'manajemen-proyek')}
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
                      }}
                    >
                      {t('proj.active.dash_btn')} →
                    </button>

                    <button
                      onClick={() => handleMarkAsCompleted(proj)}
                      title={t('proj.active.complete_title')}
                      style={{
                        height: '36px',
                        width: '36px',
                        borderRadius: 'var(--ez-radius-control)',
                        background: 'var(--ez-pastel-mint)',
                        border: 'none',
                        color: 'var(--ez-pill-ok-text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <CheckCircle size={15} />
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

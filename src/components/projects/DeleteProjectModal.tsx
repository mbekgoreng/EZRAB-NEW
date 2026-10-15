import React, { useState } from 'react';
import { AlertTriangle, Download, Trash2, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Project } from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { useI18n } from '../../i18n/I18nContext';

export interface DeleteProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onConfirmDelete: (projectId: string) => void;
  onBackupProject?: (projectId: string) => any;
}

export const DeleteProjectModal: React.FC<DeleteProjectModalProps> = ({
  isOpen,
  project,
  onClose,
  onConfirmDelete,
  onBackupProject,
}) => {
  const { t } = useI18n();
  const [downloaded, setDownloaded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !project) return null;

  const totalCost = project.totalRab || project.costSummary?.grandTotal || 0;

  const handleDownloadBackup = () => {
    try {
      const backupData = onBackupProject ? onBackupProject(project.id) : null;
      const dataToSave = backupData || {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        project,
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dataToSave, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      const safeProjectName = (project.name || 'proyek').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      downloadAnchor.setAttribute('download', `backup_proyek_${project.projectNumber || project.id}_${safeProjectName}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setDownloaded(true);
    } catch (err) {
      console.error('Gagal mengunduh backup proyek:', err);
    }
  };

  const handleExecuteDelete = () => {
    setIsDeleting(true);
    // ensure backup is stored first if helper available
    if (onBackupProject) {
      try {
        onBackupProject(project.id);
      } catch (err) {
        console.warn('Backup error on delete:', err);
      }
    }
    setTimeout(() => {
      onConfirmDelete(project.id);
      setIsDeleting(false);
      onClose();
    }, 200);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: 'var(--ez-radius-card)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--ez-hue-red-bg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid var(--ez-hue-red-bg)',
            backgroundColor: 'var(--ez-hue-rose-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--ez-radius-control)',
                backgroundColor: 'var(--ez-hue-red-bg)',
                border: '1px solid var(--ez-hue-rose-border)',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#991B1B' }}>
                {t('proj.del.title')}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#B91C1C' }}>
                {t('proj.del.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94A3B8',
              padding: '4px',
              borderRadius: 'var(--ez-radius-chip)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Project Details Box */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'var(--ez-color-surface-secondary)',
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-color-border-line)',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('proj.del.detail_t')}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '4px' }}>
              {project.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '12px', color: '#475569' }}>
              <div>
                {t('proj.del.code_t')}<strong style={{ color: 'var(--ez-color-text-primary)' }}>{project.projectNumber || project.id}</strong>
              </div>
              <div>•</div>
              <div>
                {t('proj.del.rab_t')}<strong style={{ color: 'var(--ez-color-primary)' }}>{formatCurrencyIDR(totalCost)}</strong>
              </div>
              {project.location && (
                <>
                  <div>•</div>
                  <div>{t('proj.del.loc_t')}<strong>{project.location}</strong></div>
                </>
              )}
            </div>
          </div>

          {/* Backup Section */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'var(--ez-hue-blue-bg)',
              borderRadius: 'var(--ez-radius-control)',
              border: '1px solid var(--ez-hue-blue-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <ShieldAlert size={18} color="#2563EB" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#1E40AF' }}>
                  {t('proj.del.backup_t')}
                </div>
                <div style={{ fontSize: '11.5px', color: '#3B82F6', marginTop: '2px', lineHeight: 1.4 }}>
                  {t('proj.del.backup_b')}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadBackup}
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                backgroundColor: downloaded ? 'var(--ez-color-success-soft)' : 'var(--ez-color-on-primary)',
                border: downloaded ? '1px solid #86EFAC' : '1px solid #93C5FD',
                color: downloaded ? '#15803D' : 'var(--ez-color-primary-hover)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {downloaded ? <CheckCircle2 size={14} /> : <Download size={14} />}
              <span>{downloaded ? t('proj.del.dl_ok') : t('proj.del.dl_btn')}</span>
            </button>
          </div>

          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--ez-color-text-muted)', lineHeight: 1.45 }}>
            {t('proj.del.warn')}
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--ez-color-border-soft)',
            backgroundColor: 'var(--ez-color-surface-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--ez-hue-slate-border)',
              backgroundColor: 'var(--ez-color-surface)',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('proj.del.cancel')}
          </button>
          <button
            type="button"
            onClick={handleExecuteDelete}
            disabled={isDeleting}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#DC2626',
              color: 'var(--ez-color-on-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
            }}
          >
            <Trash2 size={14} />
            <span>{isDeleting ? t('proj.del.deleting') : t('proj.del.delete_btn')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

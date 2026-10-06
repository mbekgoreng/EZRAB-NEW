import React, { useState } from 'react';
import { AlertTriangle, Download, Trash2, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Project } from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

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
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #FEE2E2',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid #FEE2E2',
            backgroundColor: '#FEF2F2',
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
                borderRadius: '10px',
                backgroundColor: '#FEE2E2',
                border: '1px solid #FECACA',
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
                Hapus Proyek Konstruksi
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#B91C1C' }}>
                Tindakan ini memerlukan konfirmasi dan pencadangan data
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
              borderRadius: '6px',
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
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Rincian Proyek yang Akan Dihapus:
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
              {project.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px', fontSize: '12px', color: '#475569' }}>
              <div>
                Kode: <strong style={{ color: '#0F172A' }}>{project.projectNumber || project.id}</strong>
              </div>
              <div>•</div>
              <div>
                Total RAB: <strong style={{ color: '#2563EB' }}>{formatCurrencyIDR(totalCost)}</strong>
              </div>
              {project.location && (
                <>
                  <div>•</div>
                  <div>Lokasi: <strong>{project.location}</strong></div>
                </>
              )}
            </div>
          </div>

          {/* Backup Section */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: '#EFF6FF',
              borderRadius: '12px',
              border: '1px solid #BFDBFE',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <ShieldAlert size={18} color="#2563EB" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#1E40AF' }}>
                  Pencadangan Data Otomatis (Backup)
                </div>
                <div style={{ fontSize: '11.5px', color: '#3B82F6', marginTop: '2px', lineHeight: 1.4 }}>
                  EZRAB merekomendasikan mengunduh berkas cadangan JSON sebelum menghapus. Berkas ini mencakup seluruh item RAB, QTO, jadwal, dan data teknis.
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
                backgroundColor: downloaded ? '#DCFCE7' : '#FFFFFF',
                border: downloaded ? '1px solid #86EFAC' : '1px solid #93C5FD',
                color: downloaded ? '#15803D' : '#1D4ED8',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {downloaded ? <CheckCircle2 size={14} /> : <Download size={14} />}
              <span>{downloaded ? '✓ Cadangan Berhasil Diunduh' : 'Unduh Cadangan Proyek (.json)'}</span>
            </button>
          </div>

          <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B', lineHeight: 1.45 }}>
            Apakah Anda yakin ingin menghapus proyek ini secara permanen dari sistem? Seluruh perhitungan RAB dan keterkaitan data pekerjaan terkait akan dibersihkan.
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #F1F5F9',
            backgroundColor: '#F8FAFC',
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
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Batal
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
              color: '#FFFFFF',
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
            <span>{isDeleting ? 'Menghapus...' : 'Hapus Proyek & Simpan Backup'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

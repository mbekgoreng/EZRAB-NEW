/**
 * SaveStatusIndicator — honest storage status display.
 *
 * Shows the REAL save state from ProjectContext:
 * - 'saving': write in progress (debounced)
 * - 'saved': last write succeeded
 * - 'dirty': changes pending (not yet flushed)
 * - 'error': last write FAILED (with message)
 *
 * Also surfaces cross-tab conflicts via `externalChange`.
 * Never shows "saved" unless the write actually succeeded.
 */
import React from 'react';
import { useProject } from '../../context/ProjectContext';

interface Props {
  compact?: boolean;
}

export const SaveStatusIndicator: React.FC<Props> = ({ compact = false }) => {
  const { saveStatus, saveError, externalChange, dismissExternalChange } = useProject();

  const [showConflict, setShowConflict] = React.useState(false);
  const [showError, setShowError] = React.useState(false);

  React.useEffect(() => {
    if (externalChange) setShowConflict(true);
  }, [externalChange]);

  React.useEffect(() => {
    if (saveStatus === 'error') setShowError(true);
    else if (saveStatus === 'saved') setShowError(false);
  }, [saveStatus]);

  const handleReloadExternal = () => {
    // User chose external version: reload the page to pick up other tab's data.
    // Local unsaved changes will be lost — user explicitly chose this.
    window.location.reload();
  };

  const handleKeepLocal = () => {
    // User keeps local edits: dismiss the warning.
    // Next debounced save will overwrite with local data (explicit user choice).
    dismissExternalChange();
    setShowConflict(false);
  };

  const statusMap: Record<string, { bg: string; text: string; dot: string }> = {
    saving: { bg: '#F59E0B', text: 'Menyimpan...', dot: '#F59E0B' },
    saved: { bg: '#10B981', text: 'Tersimpan', dot: '#10B981' },
    dirty: { bg: '#6B7280', text: 'Belum tersimpan', dot: '#6B7280' },
    error: { bg: '#EF4444', text: 'Gagal menyimpan', dot: '#EF4444' },
  };
  const statusConfig = statusMap[saveStatus as string] || { bg: '#6B7280', text: 'Unknown', dot: '#6B7280' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Status pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '2px 8px' : '4px 12px',
          borderRadius: 999,
          background: `${statusConfig.bg}18`,
          border: `1px solid ${statusConfig.bg}44`,
          fontSize: compact ? 11 : 12,
          fontWeight: 600,
          color: statusConfig.bg,
        }}
        title={saveStatus === 'error' && saveError ? saveError : undefined}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusConfig.dot,
            animation: saveStatus === 'saving' ? 'pulse 1s infinite' : undefined,
          }}
        />
        <span>{statusConfig.text}</span>
      </div>

      {/* Conflict warning */}
      {externalChange && (
        <button
          onClick={() => setShowConflict(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: compact ? '2px 8px' : '4px 12px',
            borderRadius: 999,
            background: '#FEF3C7',
            border: '1px solid #F59E0B',
            fontSize: compact ? 11 : 12,
            fontWeight: 600,
            color: '#92400E',
            cursor: 'pointer',
          }}
        >
          ⚠️ Tab lain mengubah data
        </button>
      )}

      {/* Conflict modal */}
      {showConflict && externalChange && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowConflict(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              margin: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
              ⚠️ Data diubah di tab lain
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#4B5563' }}>
              Tab browser lain mengubah <code>{externalChange.key}</code>.
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#4B5563' }}>
              Perubahan lokal Anda yang belum tersimpan bisa hilang jika Anda memuat versi eksternal.
              Pilih dengan hati-hati:
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={handleKeepLocal}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  background: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Pertahankan edit saya
              </button>
              <button
                onClick={handleReloadExternal}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#2563EB',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Muat versi terbaru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error modal */}
      {showError && saveStatus === 'error' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowError(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              margin: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#DC2626' }}>
              ❌ Penyimpanan gagal
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#4B5563' }}>
              {saveError || 'Terjadi kesalahan saat menyimpan data.'}
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#4B5563' }}>
              Data Anda masih ada di memori. Jangan tutup tab ini sebelum masalah teratasi.
              Coba ekspor backup terlebih dahulu.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowError(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#2563EB',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
};

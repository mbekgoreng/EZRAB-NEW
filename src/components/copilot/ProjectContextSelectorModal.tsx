import React, { useState } from 'react';
import { Building2, Check, Search, X, Plus } from 'lucide-react';
import { Project } from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface ProjectContextSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  currentProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateNewProject?: () => void;
}

export const ProjectContextSelectorModal: React.FC<ProjectContextSelectorModalProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onSelectProject,
  onCreateNewProject,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = projects.filter((p) =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.location || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pilih Konteks Proyek"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10010,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#FFFFFF',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building2 size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                Pilih Konteks Proyek
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B' }}>
                Tentukan proyek aktif untuk analisis AI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              border: 'none',
              background: '#F1F5F9',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Input */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau lokasi proyek..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '12.5px',
                outline: 'none',
              }}
              autoFocus
            />
          </div>
        </div>

        {/* Project List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px' }}>
              Tidak ditemukan proyek yang cocok.
            </div>
          ) : (
            filtered.map((proj) => {
              const isSelected = proj.id === currentProjectId;
              return (
                <button
                  key={proj.id}
                  onClick={() => {
                    onSelectProject(proj.id);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: `1.5px solid ${isSelected ? '#2563EB' : '#E2E8F0'}`,
                    backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 750, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {proj.name}
                      </span>
                      {isSelected && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563EB', backgroundColor: '#DBEAFE', padding: '1px 6px', borderRadius: '4px' }}>
                          Aktif
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                      {proj.location || 'Indonesia'} • {formatCurrencyIDR(proj.totalRab || 0)}
                    </div>
                  </div>
                  {isSelected && (
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Check size={14} />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer with Create Shortcut */}
        {onCreateNewProject && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
            <button
              onClick={() => {
                onClose();
                onCreateNewProject();
              }}
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: '10px',
                border: '1px dashed #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#2563EB',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Plus size={15} />
              <span>+ Buat Proyek Baru</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { X, CheckCircle2, Sparkles } from 'lucide-react';

/**
 * DemoModal — namanya dipertahankan untuk kompatibilitas pemanggil, tetapi
 * isinya BUKAN demo interaktif/video (F6): ini gambaran fitur statis.
 * Judul dan isi ditulis jujur sebagai "Gambaran Fitur EZRAB".
 */

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWorkspace: () => void;
}

export const DemoModal: React.FC<DemoModalProps> = ({ isOpen, onClose, onOpenWorkspace }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(10px)',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '680px',
          background: 'var(--ezrab-surface)',
          borderRadius: 'var(--ezrab-radius-lg)',
          border: '1px solid var(--ezrab-border)',
          boxShadow: 'var(--ezrab-shadow-lg)',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'var(--ezrab-blue-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ezrab-blue)' }}>
              <Sparkles size={16} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ezrab-text)' }}>Gambaran Fitur EZRAB</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ezrab-text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Daftar alur kerja yang didukung — deskriptif, bukan simulasi berjalan */}
        <div
          style={{
            background: 'var(--ezrab-bg)',
            border: '1px solid var(--ezrab-border)',
            borderRadius: 'var(--ezrab-radius-md)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ezrab-text)' }}>
              Alur kerja yang didukung EZRAB
            </span>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--ezrab-text-muted)', margin: 0, lineHeight: 1.6 }}>
            Ini gambaran singkat alur di dalam aplikasi — bukan video atau demo yang dapat dimainkan.
            Buka workspace untuk mencobanya langsung.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--ezrab-success)' }}>
              <CheckCircle2 size={16} />
              <span>1. Membaca geometri denah & mengekstrak QTO balok, kolom, dinding</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--ezrab-success)' }}>
              <CheckCircle2 size={16} />
              <span>2. Pencocokan otomatis kode analisa AHSP PUPR No. 1/2026</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--ezrab-success)' }}>
              <CheckCircle2 size={16} />
              <span>3. Menghitung harga satuan per zona wilayah (Jakarta / Tangerang / Bali)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--ezrab-success)' }}>
              <CheckCircle2 size={16} />
              <span>4. Menyusun lembar RAB, rekapitulasi, dan jadwal Kurva S proyek</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} className="ezrab-button-secondary">
            Tutup
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenWorkspace();
            }}
            className="ezrab-button-primary"
          >
            <span>Buka Workspace Langsung</span>
          </button>
        </div>
      </div>
    </div>
  );
};

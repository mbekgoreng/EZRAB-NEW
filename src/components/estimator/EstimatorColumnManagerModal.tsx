import React from 'react';
import { X, Columns3, RotateCcw, Check, Lock } from 'lucide-react';

export interface ColumnDefinition {
  key: string;
  label: string;
  required?: boolean;
}

export const AVAILABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'no', label: 'Nomor Urut (No)' },
  { key: 'code', label: 'Kode AHSP' },
  { key: 'description', label: 'Uraian Pekerjaan', required: true },
  { key: 'volume', label: 'Volume' },
  { key: 'unit', label: 'Satuan' },
  { key: 'unitPrice', label: 'Harga Satuan (Rp)' },
  { key: 'amount', label: 'Jumlah / Total Harga (Rp)', required: true },
  { key: 'volumeSource', label: 'Sumber Data' },
];

interface EstimatorColumnManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (colKey: string) => void;
  onResetToDefault: () => void;
}

export const EstimatorColumnManagerModal: React.FC<EstimatorColumnManagerModalProps> = ({
  isOpen,
  onClose,
  visibleColumns,
  onToggleColumn,
  onResetToDefault,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          width: '380px',
          maxWidth: '92vw',
          padding: '20px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Columns3 size={18} color="#2563EB" />
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Pengaturan Tampilan Kolom
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            <X size={18} color="#64748B" />
          </button>
        </div>

        <p style={{ fontSize: '11.5px', color: '#64748B', margin: '0 0 14px 0' }}>
          Centang kolom yang ingin Anda tampilkan pada spreadsheet estimator RAB.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px' }}>
          {AVAILABLE_COLUMNS.map((col) => {
            const isVisible = visibleColumns[col.key] !== false;
            return (
              <label
                key={col.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: isVisible ? '#F8FAFC' : '#FFFFFF',
                  cursor: col.required ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 550,
                  color: col.required ? '#64748B' : '#1E293B',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    disabled={col.required}
                    onChange={() => onToggleColumn(col.key)}
                    style={{ accentColor: '#2563EB', cursor: col.required ? 'not-allowed' : 'pointer' }}
                  />
                  <span>{col.label}</span>
                </div>
                {col.required && (
                  <span style={{ fontSize: '10px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Lock size={10} />
                    <span>Wajib</span>
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <button
            onClick={onResetToDefault}
            style={{
              height: '32px',
              padding: '0 10px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#64748B',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <RotateCcw size={12} />
            <span>Default</span>
          </button>

          <button
            onClick={onClose}
            style={{
              height: '32px',
              padding: '0 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Trash2, Copy, Layers, X, CheckSquare } from 'lucide-react';
import { WORK_CATEGORIES } from '../../data/mockData';

interface EstimatorBulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkDuplicate: () => void;
  onBulkChangeCategory: (targetCategory: string) => void;
  categories?: string[];
}

export const EstimatorBulkActionBar: React.FC<EstimatorBulkActionBarProps> = ({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkDuplicate,
  onBulkChangeCategory,
  categories = WORK_CATEGORIES,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#0F172A',
        borderRadius: '12px',
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 20px 30px -10px rgba(15, 23, 42, 0.45)',
        zIndex: 90,
        color: '#FFFFFF',
        border: '1px solid #334155',
      }}
    >
      {/* Selection count badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CheckSquare size={16} color="#60A5FA" />
        <span style={{ fontSize: '13px', fontWeight: 700 }}>
          {selectedCount} item dipilih
        </span>
      </div>

      <div style={{ width: '1px', height: '20px', background: '#334155' }} />

      {/* Bulk Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Move / Change WBS category */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={14} color="#94A3B8" />
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                onBulkChangeCategory(e.target.value);
                e.target.value = '';
              }
            }}
            style={{
              height: '30px',
              padding: '0 8px',
              borderRadius: '6px',
              background: '#1E293B',
              border: '1px solid #475569',
              color: '#F8FAFC',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="" disabled>Pindah Kelompok WBS...</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Duplicate all */}
        <button
          onClick={onBulkDuplicate}
          style={{
            height: '30px',
            padding: '0 10px',
            borderRadius: '6px',
            background: '#1E293B',
            border: '1px solid #475569',
            color: '#F8FAFC',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Copy size={13} color="#94A3B8" />
          <span>Duplikasi</span>
        </button>

        {/* Bulk Delete */}
        <button
          onClick={onBulkDelete}
          style={{
            height: '30px',
            padding: '0 10px',
            borderRadius: '6px',
            background: '#7F1D1D',
            border: '1px solid #991B1B',
            color: '#FCA5A5',
            fontSize: '11.5px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Trash2 size={13} color="#FCA5A5" />
          <span>Hapus</span>
        </button>
      </div>

      <div style={{ width: '1px', height: '20px', background: '#334155' }} />

      {/* Clear selection */}
      <button
        onClick={onClearSelection}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#94A3B8',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
        }}
        title="Batal Pilih"
      >
        <X size={16} />
      </button>
    </div>
  );
};

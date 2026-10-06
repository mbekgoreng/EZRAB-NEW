import React, { useState } from 'react';
import { X, Filter, RotateCcw, Check } from 'lucide-react';
import { WORK_CATEGORIES } from '../../data/mockData';

export interface EstimatorFilterState {
  category: string;
  source: string;
  minPrice: number | null;
  maxPrice: number | null;
  minVolume: number | null;
  maxVolume: number | null;
  ahspLinkedOnly: boolean | null;
}

interface EstimatorAdvancedFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: EstimatorFilterState;
  onApplyFilters: (filters: EstimatorFilterState) => void;
  onResetFilters: () => void;
}

export const EstimatorAdvancedFilterModal: React.FC<EstimatorAdvancedFilterModalProps> = ({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
}) => {
  const [localFilters, setLocalFilters] = useState<EstimatorFilterState>(filters);

  if (!isOpen) return null;

  const handleApply = () => {
    onApplyFilters(localFilters);
    onClose();
  };

  const handleReset = () => {
    onResetFilters();
    setLocalFilters({
      category: 'ALL',
      source: 'ALL',
      minPrice: null,
      maxPrice: null,
      minVolume: null,
      maxVolume: null,
      ahspLinkedOnly: null,
    });
    onClose();
  };

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
          width: '460px',
          maxWidth: '92vw',
          padding: '20px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} color="#2563EB" />
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Filter Lanjutan Item RAB
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            <X size={18} color="#64748B" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Kelompok WBS */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
              Kelompok Pekerjaan (WBS):
            </label>
            <select
              value={localFilters.category}
              onChange={(e) => setLocalFilters({ ...localFilters, category: e.target.value })}
              style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
            >
              <option value="ALL">Semua Kelompok Pekerjaan</option>
              {WORK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Sumber Volume / Analisa */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
              Sumber Volume / Analisa:
            </label>
            <select
              value={localFilters.source}
              onChange={(e) => setLocalFilters({ ...localFilters, source: e.target.value })}
              style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
            >
              <option value="ALL">Semua Sumber</option>
              <option value="MANUAL">MANUAL</option>
              <option value="AHSP 2024">AHSP 2024</option>
              <option value="CALCULATOR">CALCULATOR (AI)</option>
              <option value="IMPORT">IMPORT (Excel)</option>
            </select>
          </div>

          {/* Kisaran Harga Satuan */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
              Rentang Harga Satuan (Rp):
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="number"
                placeholder="Min Rp"
                value={localFilters.minPrice || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, minPrice: e.target.value ? parseFloat(e.target.value) : null })}
                style={{ height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
              />
              <input
                type="number"
                placeholder="Max Rp"
                value={localFilters.maxPrice || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, maxPrice: e.target.value ? parseFloat(e.target.value) : null })}
                style={{ height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
              />
            </div>
          </div>

          {/* Keterkaitan AHSP */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
              Status Pemetaan AHSP:
            </label>
            <select
              value={localFilters.ahspLinkedOnly === null ? 'ALL' : localFilters.ahspLinkedOnly ? 'LINKED' : 'UNLINKED'}
              onChange={(e) => {
                const v = e.target.value;
                setLocalFilters({
                  ...localFilters,
                  ahspLinkedOnly: v === 'ALL' ? null : v === 'LINKED',
                });
              }}
              style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
            >
              <option value="ALL">Semua Item (Terpetakan & Manual)</option>
              <option value="LINKED">Hanya yang Terhubung AHSP Resmi</option>
              <option value="UNLINKED">Hanya yang Belum Terhubung AHSP</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <button
            onClick={handleReset}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#64748B',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{ height: '34px', padding: '0 14px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F1F5F9', color: '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              Batal
            </button>
            <button
              onClick={handleApply}
              style={{ height: '34px', padding: '0 16px', borderRadius: '6px', border: 'none', background: '#2563EB', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Check size={14} />
              <span>Terapkan Filter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

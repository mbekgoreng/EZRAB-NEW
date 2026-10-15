import React from 'react';
import { Plus, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface SpreadsheetFooterProps {
  groupsCount: number;
  totalItemsCount: number;
  totalRab: number;
  onAddGroup: () => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  isSaving?: boolean;
}

export const SpreadsheetFooter: React.FC<SpreadsheetFooterProps> = ({
  groupsCount,
  totalItemsCount,
  totalRab,
  onAddGroup,
  pageSize = 50,
  onPageSizeChange,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  isSaving = false,
}) => {
  return (
    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 1. Summary Bar (+ Tambah Kelompok, counts, Total RAB) */}
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '10px',
          border: '1px solid var(--ez-color-border-line)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
        }}
      >
        {/* Left: + Tambah Kelompok button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={onAddGroup}
            className="ezrab-touch-target"
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '6px',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              fontSize: '12px',
              fontWeight: 650,
              color: 'var(--ez-color-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ez-hue-blue-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
          >
            <Plus size={14} color="var(--ez-hue-blue-text)" />
            <span>Tambah Kelompok</span>
          </button>

          {/* Group & Item counts text */}
          <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', fontWeight: 500 }}>
            {groupsCount} kelompok • {totalItemsCount} item
          </span>
        </div>

        {/* Right: Total RAB */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--ez-color-text-slate)' }}>
            Total RAB
          </span>
          <span
            style={{
              fontSize: '17px',
              fontWeight: 850,
              color: 'var(--ez-color-text-primary)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}
          >
            {formatCurrencyIDR(totalRab ?? 0)}
          </span>
        </div>
      </div>

      {/* 2. Pagination & Autosave Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          fontSize: '12px',
          color: 'var(--ez-color-text-muted)',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        {/* Left: Page size dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Tampilkan</span>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              style={{
                height: '28px',
                padding: '0 22px 0 8px',
                borderRadius: '5px',
                border: '1px solid var(--ez-hue-slate-border)',
                background: 'var(--ez-color-surface)',
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--ez-color-text-body)',
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
              }}
            >
              <option value={20}>20 item</option>
              <option value={50}>50 item</option>
              <option value={100}>100 item</option>
            </select>
            <ChevronDown
              size={11}
              color="#64748B"
              style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Center: Pagination navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>
            1–{totalItemsCount} dari {totalItemsCount}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <button
              disabled={currentPage <= 1}
              onClick={() => onPageChange?.(currentPage - 1)}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '5px',
                border: '1px solid var(--ez-hue-slate-border)',
                background: 'var(--ez-color-surface)',
                color: currentPage <= 1 ? 'var(--ez-hue-slate-border)' : 'var(--ez-color-text-body)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={13} />
            </button>
            <span
              style={{
                minWidth: '26px',
                height: '26px',
                borderRadius: '5px',
                background: 'var(--ez-color-primary)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11.5px',
                fontWeight: 700,
              }}
            >
              {currentPage}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange?.(currentPage + 1)}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '5px',
                border: '1px solid var(--ez-hue-slate-border)',
                background: 'var(--ez-color-surface)',
                color: currentPage >= totalPages ? 'var(--ez-hue-slate-border)' : 'var(--ez-color-text-body)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Right: Autosave status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isSaving ? '#F59E0B' : '#10B981',
            }}
          />
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: isSaving ? 'var(--ez-hue-amber-text-deep)' : 'var(--ez-hue-green-text)' }}>
            {isSaving ? 'Menyimpan perubahan...' : 'Semua perubahan disimpan'}
          </span>
        </div>
      </div>
    </div>
  );
};

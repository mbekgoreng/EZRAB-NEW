import React from 'react';
import {
  ShieldCheck,
  Layers,
  BarChart3,
  CloudCheck,
  TrendingUp,
} from 'lucide-react';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface EstimatorMetricsProps {
  totalRab: number;
  totalItems: number;
  ahspCount: number;
  totalVolume: number;
  lastSavedText?: string;
  isSaving?: boolean;
  /** Real progress 0-100. When omitted/undefined the card renders "—" — never a demo number. */
  progressPercent?: number;
  completedItemsCount?: number;
  inProgressItemsCount?: number;
  pendingItemsCount?: number;
  /** Real percentageDiff from the latest estimate version. Null/undefined = no version history. */
  versionDeltaPercent?: number | null;
}

export const EstimatorMetrics: React.FC<EstimatorMetricsProps> = ({
  totalRab,
  totalItems,
  ahspCount,
  totalVolume,
  lastSavedText = '—',
  isSaving = false,
  progressPercent,
  completedItemsCount,
  inProgressItemsCount,
  pendingItemsCount,
  versionDeltaPercent = null,
}) => {
  // Data integrity: 0 is a valid value. Never use `||` fallbacks that replace
  // real zeros with demo numbers.
  const safeTotalRab = totalRab ?? 0;
  const safeTotalItems = totalItems ?? 0;
  const safeAhspCount = ahspCount ?? 0;

  // Progress is only shown when a real, finite value is provided.
  const progressPct =
    typeof progressPercent === 'number' && Number.isFinite(progressPercent)
      ? Math.min(100, Math.max(0, progressPercent))
      : null;

  // Version delta only when a real, finite percentageDiff exists.
  const deltaPct =
    typeof versionDeltaPercent === 'number' && Number.isFinite(versionDeltaPercent)
      ? versionDeltaPercent
      : null;
  // Format volume Indonesian style (e.g. 15.431,70)
  const formattedVolume = totalVolume.toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '20px',
      }}
    >
      {/* 1. TOTAL RAB */}
      <div className="ez-stat"
        style={{
          background: 'var(--ez-pastel-cream)',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)', textTransform: 'capitalize' }}>
            Total RAB
          </span>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={15} color="#2563EB" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '17px', fontWeight: 850, color: 'var(--ez-color-text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {formatCurrencyIDR(safeTotalRab)}
          </div>

          {/* Subtext + Sparkline */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              {deltaPct !== null ? (
                <>
                  <span style={{ color: deltaPct >= 0 ? '#059669' : '#DC2626', fontWeight: 700 }}>
                    {deltaPct >= 0 ? '▲' : '▼'}{' '}
                    {Math.abs(deltaPct).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </span>
                  <span>dari versi sebelumnya</span>
                </>
              ) : (
                <span>nilai saat ini</span>
              )}
            </div>

            {/* Sparkline curve */}
            <svg width="42" height="16" viewBox="0 0 42 16" fill="none">
              <path
                d="M1 14C8 13 14 8 20 8C26 8 32 3 41 2"
                stroke="#10B981"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* 2. TOTAL ITEM */}
      <div className="ez-stat"
        style={{
          background: 'var(--ez-pastel-mint)',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>
            Total Item
          </span>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={15} color="#2563EB" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '20px', fontWeight: 850, color: 'var(--ez-color-text-primary)', letterSpacing: '-0.02em' }}>
            {safeTotalItems}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
            dari {safeAhspCount} AHSP
          </div>
        </div>
      </div>

      {/* 3. TOTAL VOLUME */}
      <div className="ez-stat"
        style={{
          background: 'var(--ez-pastel-peach)',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>
            Total Volume
          </span>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BarChart3 size={15} color="#2563EB" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '18px', fontWeight: 850, color: 'var(--ez-color-text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {formattedVolume || '15.431,70'}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
            berbagai satuan
          </div>
        </div>
      </div>

      {/* 4. TERAKHIR DISIMPAN */}
      <div className="ez-stat"
        style={{
          background: 'var(--ez-pastel-sky)',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>
            Terakhir Disimpan
          </span>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloudCheck size={15} color="#2563EB" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '14px', fontWeight: 750, color: 'var(--ez-color-text-primary)', letterSpacing: '-0.01em' }}>
            {lastSavedText}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--ez-color-text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isSaving ? '#F59E0B' : '#10B981',
              }}
            />
            <span>{isSaving ? 'Menyimpan...' : 'Tersimpan otomatis'}</span>
          </div>
        </div>
      </div>

      {/* 5. PROGRESS ESTIMASI (Donut progress card) */}
      <div className="ez-stat"
        style={{
          background: 'var(--ez-pastel-cream)',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        {/* Radial gauge donut SVG */}
        <div style={{ position: 'relative', width: '48px', height: '48px', flexShrink: 0 }}>
          <svg width="48" height="48" viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="var(--ez-color-border-line)"
              strokeWidth="3.2"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#0D9488"
              strokeWidth="3.2"
              strokeDasharray={`${progressPct ?? 0}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 800,
              color: 'var(--ez-color-text-primary)',
            }}
          >
            {progressPct !== null ? `${progressPct}%` : '—'}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexGrow: 1 }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--ez-color-text-body)', marginBottom: '2px' }}>
            Progress Estimasi
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ez-color-text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981' }} />
              Item selesai
            </span>
            <span style={{ fontWeight: 700, color: 'var(--ez-color-text-body)' }}>{completedItemsCount ?? '—'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ez-color-text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#F59E0B' }} />
              Dalam proses
            </span>
            <span style={{ fontWeight: 700, color: 'var(--ez-color-text-body)' }}>{inProgressItemsCount ?? '—'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ez-color-text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3B82F6' }} />
              Belum dihitung
            </span>
            <span style={{ fontWeight: 700, color: 'var(--ez-color-text-body)' }}>{pendingItemsCount ?? '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

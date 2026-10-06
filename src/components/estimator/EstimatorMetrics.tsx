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
  progressPercent?: number;
  completedItemsCount?: number;
  inProgressItemsCount?: number;
  pendingItemsCount?: number;
}

export const EstimatorMetrics: React.FC<EstimatorMetricsProps> = ({
  totalRab,
  totalItems,
  ahspCount,
  totalVolume,
  lastSavedText = '14 Agu 2026, 10:24',
  isSaving = false,
  progressPercent = 68,
  completedItemsCount = 7,
  inProgressItemsCount = 0,
  pendingItemsCount = 0,
}) => {
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
        gap: '12px',
        marginBottom: '16px',
      }}
    >
      {/* 1. TOTAL RAB */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '14px 16px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'capitalize' }}>
            Total RAB
          </span>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={15} color="#2563EB" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '17px', fontWeight: 850, color: '#0F172A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {formatCurrencyIDR(totalRab || 660638840)}
          </div>

          {/* Subtext + Sparkline */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <div style={{ fontSize: '10.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span style={{ color: '#059669', fontWeight: 700 }}>▲ 3,2%</span>
              <span>dari versi sebelumnya</span>
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
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '14px 16px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
            Total Item
          </span>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={15} color="#2563EB" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '20px', fontWeight: 850, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {totalItems || 7}
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '4px' }}>
            dari {ahspCount || 7} AHSP
          </div>
        </div>
      </div>

      {/* 3. TOTAL VOLUME */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '14px 16px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
            Total Volume
          </span>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BarChart3 size={15} color="#2563EB" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '18px', fontWeight: 850, color: '#0F172A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {formattedVolume || '15.431,70'}
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '4px' }}>
            berbagai satuan
          </div>
        </div>
      </div>

      {/* 4. TERAKHIR DISIMPAN */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '14px 16px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
            Terakhir Disimpan
          </span>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloudCheck size={15} color="#2563EB" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '14px', fontWeight: 750, color: '#0F172A', letterSpacing: '-0.01em' }}>
            {lastSavedText}
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
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
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '12px 16px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
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
              stroke="#E2E8F0"
              strokeWidth="3.2"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#0D9488"
              strokeWidth="3.2"
              strokeDasharray={`${progressPercent}, 100`}
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
              color: '#0F172A',
            }}
          >
            {progressPercent}%
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexGrow: 1 }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
            Progress Estimasi
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#64748B' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981' }} />
              Item selesai
            </span>
            <span style={{ fontWeight: 700, color: '#334155' }}>{completedItemsCount}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#64748B' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#F59E0B' }} />
              Dalam proses
            </span>
            <span style={{ fontWeight: 700, color: '#334155' }}>{inProgressItemsCount}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#64748B' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3B82F6' }} />
              Belum dihitung
            </span>
            <span style={{ fontWeight: 700, color: '#334155' }}>{pendingItemsCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

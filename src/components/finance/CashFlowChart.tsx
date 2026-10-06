import React, { useState } from 'react';
import { CashFlowPoint, FinancialGranularity } from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { TrendingUp, AlertTriangle, Info, Calendar } from 'lucide-react';

interface CashFlowChartProps {
  points: CashFlowPoint[];
  granularity: FinancialGranularity;
  onGranularityChange?: (g: FinancialGranularity) => void;
  hasNegativeForecast?: boolean;
  futureLowestCumulative?: number;
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  points,
  granularity,
  onGranularityChange,
  hasNegativeForecast,
  futureLowestCumulative,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!points || points.length === 0) {
    return (
      <div
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          backgroundColor: '#F8FAFC',
          borderRadius: '12px',
          border: '1px dashed #CBD5E1',
          color: '#64748B',
          fontSize: '13px',
        }}
      >
        <TrendingUp size={28} style={{ margin: '0 auto 8px', color: '#94A3B8' }} />
        <div style={{ fontWeight: 600, color: '#334155' }}>Belum Ada Data Arus Kas</div>
        <div style={{ fontSize: '12px', marginTop: '4px' }}>
          Tambahkan pembayaran masuk atau pengeluaran untuk melihat grafik arus kas proyek.
        </div>
      </div>
    );
  }

  // Chart dimensions
  const svgWidth = 780;
  const svgHeight = 240;
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  // Find scale range
  const allValues = points.flatMap((p) => [p.cashIn, p.cashOut, p.cumulativeCashFlow]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(10_000_000, ...allValues);
  const range = maxVal - minVal || 1;

  const getY = (val: number) => {
    return paddingTop + chartHeight - ((val - minVal) / range) * chartHeight;
  };

  const stepX = points.length > 1 ? chartWidth / (points.length - 1) : chartWidth / 2;
  const getX = (idx: number) => paddingLeft + idx * stepX;

  const zeroY = getY(0);

  // Build SVG Paths for Cumulative Line (separating Actual and Forecast)
  const actualPoints = points.filter((p) => !p.isForecast);
  const forecastPoints = points.filter((p) => p.isForecast);

  let cumulativeActualPath = '';
  actualPoints.forEach((p, i) => {
    const x = getX(i);
    const y = getY(p.cumulativeCashFlow);
    cumulativeActualPath += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  });

  let cumulativeForecastPath = '';
  if (forecastPoints.length > 0) {
    const startIndex = actualPoints.length > 0 ? actualPoints.length - 1 : 0;
    const startPoint = points[startIndex];
    cumulativeForecastPath = `M ${getX(startIndex)} ${getY(startPoint.cumulativeCashFlow)}`;
    forecastPoints.forEach((p, i) => {
      const idx = actualPoints.length + i;
      cumulativeForecastPath += ` L ${getX(idx)} ${getY(p.cumulativeCashFlow)}`;
    });
  }

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Chart Controls & Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11.5px', color: '#475569' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', backgroundColor: '#10B981', borderRadius: '2px' }} />
            <span>Kas Masuk (Inflow)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', backgroundColor: '#EF4444', borderRadius: '2px' }} />
            <span>Kas Keluar (Outflow)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '14px', height: '2.5px', backgroundColor: '#2563EB', borderRadius: '1px' }} />
            <span>Kumulatif Aktual</span>
          </div>
          {forecastPoints.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '14px', height: '2px', borderTop: '2px dashed #8B5CF6' }} />
              <span style={{ color: '#7C3AED', fontWeight: 600 }}>Proyeksi (Forecast)</span>
            </div>
          )}
        </div>

        {onGranularityChange && (
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '2px' }}>
            {(['weekly', 'monthly', 'quarterly'] as FinancialGranularity[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onGranularityChange(g)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: granularity === g ? '#FFFFFF' : 'transparent',
                  color: granularity === g ? '#0F172A' : '#64748B',
                  fontWeight: granularity === g ? 700 : 500,
                  fontSize: '11px',
                  cursor: 'pointer',
                  boxShadow: granularity === g ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 120ms ease',
                }}
              >
                {g === 'weekly' ? 'Mingguan' : g === 'monthly' ? 'Bulanan' : 'Kuartalan'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          overflowX: 'auto',
          backgroundColor: '#FAFAFC',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '8px 4px',
        }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', height: 'auto', minWidth: '600px', display: 'block' }}
        >
          {/* Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const val = minVal + pct * range;
            const y = getY(val);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke={val === 0 ? '#94A3B8' : '#E2E8F0'}
                  strokeWidth={val === 0 ? 1.5 : 1}
                  strokeDasharray={val === 0 ? 'none' : '3 3'}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="#64748B"
                  fontFamily="sans-serif"
                >
                  {formatCompactNumber(val)}
                </text>
              </g>
            );
          })}

          {/* Forecast Area Background Shading */}
          {forecastPoints.length > 0 && actualPoints.length > 0 && (
            <rect
              x={getX(actualPoints.length - 1)}
              y={paddingTop}
              width={svgWidth - paddingRight - getX(actualPoints.length - 1)}
              height={chartHeight}
              fill="rgba(139, 92, 246, 0.04)"
              stroke="none"
            />
          )}

          {/* Bar Groups (Cash In & Out) */}
          {points.map((p, idx) => {
            const x = getX(idx);
            const barWidth = Math.max(6, Math.min(22, stepX * 0.35));
            const inHeight = Math.max(0, zeroY - getY(p.cashIn));
            const outHeight = Math.max(0, zeroY - getY(p.cashOut));

            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Cash In Bar (Emerald) */}
                {p.cashIn > 0 && (
                  <rect
                    x={x - barWidth - 1}
                    y={getY(p.cashIn)}
                    width={barWidth}
                    height={inHeight}
                    rx="3"
                    fill={p.isForecast ? 'rgba(16, 185, 129, 0.55)' : '#10B981'}
                  />
                )}

                {/* Cash Out Bar (Rose) */}
                {p.cashOut > 0 && (
                  <rect
                    x={x + 1}
                    y={getY(p.cashOut)}
                    width={barWidth}
                    height={outHeight}
                    rx="3"
                    fill={p.isForecast ? 'rgba(239, 68, 68, 0.55)' : '#EF4444'}
                  />
                )}

                {/* Period X-Axis Label */}
                <text
                  x={x}
                  y={svgHeight - 12}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={p.isForecast ? '600' : '500'}
                  fill={p.isForecast ? '#7C3AED' : '#475569'}
                  fontFamily="sans-serif"
                >
                  {p.periodLabel.replace(' (Proj)', '')}
                </text>
              </g>
            );
          })}

          {/* Cumulative Cash Flow Line: Actual */}
          {cumulativeActualPath && (
            <path
              d={cumulativeActualPath}
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Cumulative Cash Flow Line: Forecast (Dashed) */}
          {cumulativeForecastPath && (
            <path
              d={cumulativeForecastPath}
              fill="none"
              stroke="#8B5CF6"
              strokeWidth="2.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Cumulative Data Points Dots */}
          {points.map((p, idx) => {
            const x = getX(idx);
            const y = getY(p.cumulativeCashFlow);
            const isHovered = hoveredIndex === idx;

            return (
              <circle
                key={`dot-${idx}`}
                cx={x}
                cy={y}
                r={isHovered ? 5.5 : 3.5}
                fill={p.isForecast ? '#8B5CF6' : '#2563EB'}
                stroke="#FFFFFF"
                strokeWidth={isHovered ? 2 : 1.5}
                style={{ transition: 'all 120ms ease' }}
              />
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredPoint && hoveredIndex !== null && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '16px',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '11px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              zIndex: 10,
              pointerEvents: 'none',
              minWidth: '180px',
            }}
          >
            <div style={{ fontWeight: 700, borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{hoveredPoint.periodLabel}</span>
              {hoveredPoint.isForecast && (
                <span style={{ color: '#C084FC', fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Forecast
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4ADE80', marginBottom: '2px' }}>
              <span>Kas Masuk:</span>
              <span style={{ fontWeight: 600 }}>{formatRupiah(hoveredPoint.cashIn)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#F87171', marginBottom: '2px' }}>
              <span>Kas Keluar:</span>
              <span style={{ fontWeight: 600 }}>{formatRupiah(hoveredPoint.cashOut)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: hoveredPoint.netCashFlow >= 0 ? '#38BDF8' : '#FB7185', marginBottom: '4px' }}>
              <span>Arus Bersih:</span>
              <span style={{ fontWeight: 600 }}>{formatRupiah(hoveredPoint.netCashFlow)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: hoveredPoint.cumulativeCashFlow >= 0 ? '#FFFFFF' : '#EF4444', borderTop: '1px solid #334155', paddingTop: '4px', fontWeight: 700 }}>
              <span>Kumulatif:</span>
              <span>{formatRupiah(hoveredPoint.cumulativeCashFlow)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Cash Flow Forecast Disclaimer & Alert Box */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {hasNegativeForecast && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              backgroundColor: '#FEF2F2',
              borderRadius: '8px',
              border: '1px solid #FECACA',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#991B1B',
            }}
          >
            <AlertTriangle size={16} color="#DC2626" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700 }}>Peringatan Proyeksi Arus Kas (Cash Gap)</div>
              <div style={{ marginTop: '2px', color: '#B91C1C' }}>
                Proyeksi menunjukkan potensi kekurangan kas (defisit terdalam: {formatRupiah(Math.abs(futureLowestCumulative || 0))}).
                Pastikan jadwal penagihan termin selaras dengan jadwal belanja material & pengupahan.
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748B' }}>
          <Info size={13} color="#94A3B8" />
          <span>
            <em>Proyeksi (Forecast)</em> dihitung secara deterministik berdasarkan sisa jadwal termin dan Kurva-S RAB yang disetujui. Realisasi aktual dapat berbeda.
          </span>
        </div>
      </div>
    </div>
  );
};

function formatCompactNumber(val: number): string {
  if (Math.abs(val) >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toFixed(1)}M`;
  }
  if (Math.abs(val) >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(0)}Jt`;
  }
  if (Math.abs(val) >= 1_000) {
    return `${(val / 1_000).toFixed(0)}Rb`;
  }
  return String(val);
}

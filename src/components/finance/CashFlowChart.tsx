import React, { useState } from 'react';
import { CashFlowPoint, FinancialGranularity } from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { TrendingUp, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import './CashFlowChart.css';

interface CashFlowChartProps {
  points: CashFlowPoint[];
  granularity: FinancialGranularity;
  onGranularityChange?: (g: FinancialGranularity) => void;
  hasNegativeForecast?: boolean;
  futureLowestCumulative?: number;
}

type SeriesKey = 'in' | 'out' | 'cum' | 'fc';

export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  points,
  granularity,
  onGranularityChange,
  hasNegativeForecast,
  futureLowestCumulative,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  if (!points || points.length === 0) {
    return (
      <div
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          backgroundColor: 'var(--ez-color-surface-secondary)',
          borderRadius: 'var(--ez-radius-control)',
          border: '1px dashed var(--ez-hue-slate-border)',
          color: 'var(--ez-color-text-muted)',
          fontSize: '13px',
        }}
      >
        <TrendingUp size={28} style={{ margin: '0 auto 8px', color: 'var(--ez-color-text-faint)' }} />
        <div style={{ fontWeight: 600, color: 'var(--ez-color-text-body)' }}>Belum Ada Data Arus Kas</div>
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

  // Find scale range (logika skala tidak diubah)
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

  // Titik defisit terdalam — murni turunan data engine, bukan karangan
  const forecastWithIdx = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.isForecast);
  const lowest =
    forecastWithIdx.length > 0
      ? forecastWithIdx.reduce((a, b) => (b.p.cumulativeCashFlow < a.p.cumulativeCashFlow ? b : a))
      : null;
  const showGapZone = !!hasNegativeForecast && lowest !== null && lowest.p.cumulativeCashFlow < 0;

  const showIn = !hidden.has('in');
  const showOut = !hidden.has('out');
  const showCum = !hidden.has('cum');
  const showFc = !hidden.has('fc');

  const toggleSeries = (k: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;
  // Kurangi kepadatan label di layar kecil / banyak periode (data tetap utuh)
  const labelEvery = points.length > 14 ? 2 : 1;

  // Posisi tooltip mengikuti titik (persentase thd dimensi SVG), flip di tepi kanan
  const tipX = hoveredIndex !== null ? getX(hoveredIndex) : 0;
  const tipY = hoveredPoint ? getY(hoveredPoint.cumulativeCashFlow) : 0;
  const flipX = tipX > svgWidth * 0.58;
  const tipTopPct = Math.min(Math.max((tipY / svgHeight) * 100, 20), 80);

  const legendItems: { key: SeriesKey; label: string; swatch: React.ReactNode }[] = [
    {
      key: 'in',
      label: 'Kas Masuk (Inflow)',
      swatch: <span style={{ width: '10px', height: '10px', backgroundColor: '#10B981', borderRadius: '2px' }} />,
    },
    {
      key: 'out',
      label: 'Kas Keluar (Outflow)',
      swatch: <span style={{ width: '10px', height: '10px', backgroundColor: '#EF4444', borderRadius: '2px' }} />,
    },
    {
      key: 'cum',
      label: 'Kumulatif Aktual',
      swatch: <span style={{ width: '14px', height: '2.5px', backgroundColor: 'var(--ez-color-primary)', borderRadius: '1px' }} />,
    },
    ...(forecastPoints.length > 0
      ? [
          {
            key: 'fc' as SeriesKey,
            label: 'Proyeksi (Forecast)',
            swatch: <span style={{ width: '14px', height: '0px', borderTop: '2px dashed #8B5CF6' }} />,
          },
        ]
      : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Chart Controls & Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }} role="group" aria-label="Legenda grafik — klik untuk tampil/sembunyikan seri">
          {legendItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className="cf-legend-btn"
              aria-pressed={!hidden.has(item.key)}
              title={`Tampilkan/sembunyikan: ${item.label}`}
              onClick={() => toggleSeries(item.key)}
            >
              {item.swatch}
              <span style={{ fontWeight: item.key === 'fc' ? 600 : 400, color: item.key === 'fc' ? 'var(--ez-hue-violet-text)' : undefined }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {onGranularityChange && (
          <div
            style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--ez-color-surface-tertiary)', borderRadius: '8px', padding: '2px' }}
            role="group"
            aria-label="Pilih periode grafik"
          >
            {(['weekly', 'monthly', 'quarterly'] as FinancialGranularity[]).map((g) => {
              const active = granularity === g;
              return (
                <button
                  key={g}
                  type="button"
                  className="cf-gran-btn"
                  aria-pressed={active}
                  onClick={() => onGranularityChange(g)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: active ? 'var(--ez-color-surface)' : 'transparent',
                    color: active ? 'var(--ez-color-text)' : 'var(--ez-color-text-muted)',
                    fontWeight: active ? 700 : 500,
                    fontSize: '11px',
                    cursor: 'pointer',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 120ms ease',
                  }}
                >
                  {g === 'weekly' ? 'Mingguan' : g === 'monthly' ? 'Bulanan' : 'Kuartalan'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          overflowX: 'auto',
          backgroundColor: 'var(--ez-color-surface-secondary)',
          borderRadius: 'var(--ez-radius-control)',
          border: '1px solid var(--ez-color-border-line)',
          padding: '8px 4px',
        }}
      >
        {/* key=granularity: entrance animation replay setiap ganti periode */}
        <div key={granularity} style={{ position: 'relative', width: '100%', minWidth: '600px' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
            aria-label={`Grafik arus kas: ${points.length} periode, ${forecastPoints.length} periode proyeksi`}
            onClick={() => setHoveredIndex(null)}
          >
            {/* Grid Lines */}
            <g className="cf-anim-grid">
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
                      style={{ stroke: val === 0 ? 'var(--ez-color-text-faint)' : 'var(--ez-color-border-line)' }}
                      strokeWidth={val === 0 ? 1.5 : 1}
                      strokeDasharray={val === 0 ? 'none' : '3 3'}
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="9.5"
                      style={{ fill: 'var(--ez-color-text-muted)' }}
                      fontFamily="sans-serif"
                    >
                      {formatCompactNumber(val)}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Zona saldo negatif pada rentang proyeksi (hanya jika data memang negatif) */}
            {showGapZone && (
              <rect
                className="cf-anim-fade"
                style={{ animationDelay: '800ms' }}
                pointerEvents="none"
                x={getX(actualPoints.length > 0 ? actualPoints.length - 1 : 0)}
                y={zeroY}
                width={svgWidth - paddingRight - getX(actualPoints.length > 0 ? actualPoints.length - 1 : 0)}
                height={svgHeight - paddingBottom - zeroY}
                fill="rgba(239, 68, 68, 0.07)"
                stroke="none"
              />
            )}

            {/* Forecast Area Background Shading */}
            {showFc && forecastPoints.length > 0 && actualPoints.length > 0 && (
              <rect
                className="cf-anim-fade"
                style={{ animationDelay: '650ms' }}
                pointerEvents="none"
                x={getX(actualPoints.length - 1)}
                y={paddingTop}
                width={svgWidth - paddingRight - getX(actualPoints.length - 1)}
                height={chartHeight}
                fill="rgba(139, 92, 246, 0.04)"
                stroke="none"
              />
            )}

            {/* Vertical crosshair pada titik hover */}
            {hoveredIndex !== null && (
              <line
                x1={getX(hoveredIndex)}
                y1={paddingTop}
                x2={getX(hoveredIndex)}
                y2={svgHeight - paddingBottom}
                stroke="var(--ez-color-text-faint)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.8}
              />
            )}

            {/* Bar Groups (Cash In & Out) */}
            {points.map((p, idx) => {
              const x = getX(idx);
              const barWidth = Math.max(6, Math.min(22, stepX * 0.35));
              const inHeight = Math.max(0, zeroY - getY(p.cashIn));
              const outHeight = Math.max(0, zeroY - getY(p.cashOut));
              const dimmed = hoveredIndex !== null && hoveredIndex !== idx;
              const showLabel = idx % labelEvery === 0;

              return (
                <g
                  key={idx}
                  className="cf-bar-group"
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.periodLabel}: kas masuk ${formatRupiah(p.cashIn)}, kas keluar ${formatRupiah(p.cashOut)}, kumulatif ${formatRupiah(p.cumulativeCashFlow)}`}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(idx)}
                  onBlur={() => setHoveredIndex(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoveredIndex(idx);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setHoveredIndex(idx);
                    } else if (e.key === 'Escape') {
                      setHoveredIndex(null);
                    }
                  }}
                >
                  {/* Cash In Bar (Emerald) */}
                  {showIn && p.cashIn > 0 && (
                    <rect
                      className="cf-anim-bar cf-dim"
                      style={{ animationDelay: `${Math.min(idx * 35, 420)}ms`, opacity: dimmed ? 0.3 : 1 }}
                      x={x - barWidth - 1}
                      y={getY(p.cashIn)}
                      width={barWidth}
                      height={inHeight}
                      rx="3"
                      fill={p.isForecast ? 'rgba(16, 185, 129, 0.55)' : '#10B981'}
                    />
                  )}

                  {/* Cash Out Bar (Rose) */}
                  {showOut && p.cashOut > 0 && (
                    <rect
                      className="cf-anim-bar cf-dim"
                      style={{ animationDelay: `${Math.min(idx * 35 + 60, 480)}ms`, opacity: dimmed ? 0.3 : 1 }}
                      x={x + 1}
                      y={getY(p.cashOut)}
                      width={barWidth}
                      height={outHeight}
                      rx="3"
                      fill={p.isForecast ? 'rgba(239, 68, 68, 0.55)' : '#EF4444'}
                    />
                  )}

                  {/* Period X-Axis Label */}
                  {showLabel && (
                    <text
                      className="cf-anim-grid"
                      x={x}
                      y={svgHeight - 12}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight={p.isForecast ? '600' : '500'}
                      style={{ fill: p.isForecast ? 'var(--ez-hue-violet-text)' : 'var(--ez-color-text-slate)' }}
                      fontFamily="sans-serif"
                    >
                      {p.periodLabel.replace(' (Proj)', '')}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Cumulative Cash Flow Line: Actual (stroke-draw entrance) */}
            {showCum && cumulativeActualPath && (
              <path
                className="cf-anim-line cf-dim"
                style={{ opacity: hoveredIndex !== null ? 0.45 : 1 } as React.CSSProperties}
                d={cumulativeActualPath}
                pathLength={1}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Cumulative Cash Flow Line: Forecast (Dashed, fade entrance) */}
            {showFc && cumulativeForecastPath && (
              <path
                className="cf-anim-fade cf-dim"
                style={{ animationDelay: '700ms', opacity: hoveredIndex !== null ? 0.45 : 1 }}
                d={cumulativeForecastPath}
                fill="none"
                stroke="#8B5CF6"
                strokeWidth="2.5"
                strokeDasharray="5 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Penanda defisit terdalam (dari data engine) */}
            {showGapZone && lowest && (
              <g className="cf-anim-fade" style={{ animationDelay: '950ms' }}>
                <circle
                  cx={getX(lowest.i)}
                  cy={getY(lowest.p.cumulativeCashFlow)}
                  r={10}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  opacity={0.65}
                />
                <circle
                  cx={getX(lowest.i)}
                  cy={getY(lowest.p.cumulativeCashFlow)}
                  r={4.5}
                  fill="#EF4444"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
                <text
                  x={getX(lowest.i)}
                  y={getY(lowest.p.cumulativeCashFlow) - 16}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight={700}
                  fill="#DC2626"
                  fontFamily="sans-serif"
                >
                  Defisit terdalam
                </text>
              </g>
            )}

            {/* Cumulative Data Points Dots */}
            {points.map((p, idx) => {
              if (p.isForecast ? !showFc : !showCum) return null;
              const x = getX(idx);
              const y = getY(p.cumulativeCashFlow);
              const isHovered = hoveredIndex === idx;
              const dimmed = hoveredIndex !== null && !isHovered;

              return (
                <circle
                  key={`dot-${idx}`}
                  className="cf-anim-dot cf-dim"
                  style={{ animationDelay: `${500 + Math.min(idx * 30, 400)}ms`, opacity: dimmed ? 0.3 : 1 }}
                  cx={x}
                  cy={y}
                  r={isHovered ? 5.5 : 3.5}
                  fill={p.isForecast ? '#8B5CF6' : '#2563EB'}
                  stroke="#FFFFFF"
                  strokeWidth={isHovered ? 2 : 1.5}
                />
              );
            })}
          </svg>

          {/* Floating Tooltip — premium putih, mengikuti titik */}
          {hoveredPoint && hoveredIndex !== null && (
            <div
              style={{
                position: 'absolute',
                left: `${(tipX / svgWidth) * 100}%`,
                top: `${tipTopPct}%`,
                transform: flipX ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <div
                className="cf-tooltip-inner"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--ez-color-border-line)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                  padding: '10px 12px',
                  fontSize: '11px',
                  minWidth: '190px',
                  color: '#0F172A',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    borderBottom: '1px solid #F1F5F9',
                    paddingBottom: '5px',
                    marginBottom: '7px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span>{hoveredPoint.periodLabel}</span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '2px 7px',
                      borderRadius: '20px',
                      backgroundColor: hoveredPoint.isForecast ? '#F5F3FF' : '#EFF6FF',
                      color: hoveredPoint.isForecast ? '#7C3AED' : '#2563EB',
                      border: `1px solid ${hoveredPoint.isForecast ? '#DDD6FE' : '#BFDBFE'}`,
                    }}
                  >
                    {hoveredPoint.isForecast ? 'Proyeksi' : 'Aktual'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ color: '#64748B' }}>Kas Masuk</span>
                  <span style={{ fontWeight: 700, color: '#059669' }}>{formatRupiah(hoveredPoint.cashIn)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ color: '#64748B' }}>Kas Keluar</span>
                  <span style={{ fontWeight: 700, color: '#DC2626' }}>{formatRupiah(hoveredPoint.cashOut)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ color: '#64748B' }}>Arus Bersih</span>
                  <span style={{ fontWeight: 700, color: hoveredPoint.netCashFlow >= 0 ? '#2563EB' : '#DC2626' }}>
                    {formatRupiah(hoveredPoint.netCashFlow)}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid #F1F5F9',
                    paddingTop: '6px',
                    marginTop: '5px',
                    fontWeight: 800,
                  }}
                >
                  <span style={{ color: '#334155' }}>Kumulatif</span>
                  <span style={{ color: hoveredPoint.cumulativeCashFlow >= 0 ? '#0F172A' : '#DC2626' }}>
                    {formatRupiah(hoveredPoint.cumulativeCashFlow)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cash Flow Forecast Disclaimer & Alert Box */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {hasNegativeForecast ? (
          <div
            key={`gap-${hasNegativeForecast}`}
            className="cf-anim-alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              backgroundColor: 'var(--ez-hue-rose-bg)',
              borderRadius: '8px',
              border: '1px solid var(--ez-hue-rose-border)',
              padding: '10px 14px',
              fontSize: '12px',
              color: 'var(--ez-hue-red-text)',
            }}
            role="alert"
          >
            <AlertTriangle size={16} color="var(--ez-hue-rose-text)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700 }}>Peringatan Proyeksi Arus Kas (Cash Gap)</div>
              <div style={{ marginTop: '2px', color: 'var(--ez-hue-red-text)' }}>
                Proyeksi menunjukkan potensi kekurangan kas (defisit terdalam:{' '}
                {formatRupiah(Math.abs(futureLowestCumulative || 0))}
                {lowest ? ` pada ${lowest.p.periodLabel.replace(' (Proj)', '')}` : ''}). Pastikan jadwal
                penagihan termin selaras dengan jadwal belanja material &amp; pengupahan.
              </div>
            </div>
          </div>
        ) : (
          forecastPoints.length > 0 && (
            <div
              key="gap-safe"
              className="cf-anim-alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'var(--ez-hue-green-bg)',
                borderRadius: '8px',
                border: '1px solid var(--ez-hue-green-border)',
                padding: '10px 14px',
                fontSize: '12px',
                color: 'var(--ez-hue-green-text-deep)',
              }}
              role="status"
            >
              <CheckCircle2 size={16} color="var(--ez-hue-green-text)" style={{ flexShrink: 0 }} />
              <div>
                <span style={{ fontWeight: 700 }}>Proyeksi arus kas aman.</span>{' '}
                <span>Tidak terdeteksi defisit pada periode proyeksi berdasarkan jadwal termin saat ini.</span>
              </div>
            </div>
          )
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
          <Info size={13} color="var(--ez-color-text-faint)" />
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

/**
 * EZRAB PHASE 6A — WEIR COST SUMMARY PANEL
 *
 * Replaces the old simplistic "volume × 50,000" display with a full
 * forensic cost breakdown for the Weir/Bendung domain.
 *
 * Shows:
 *   - Direct Cost (Labor + Material + Equipment)
 *   - SMKK
 *   - Overhead, Profit, Tax
 *   - Final Cost
 *   - Data confidence grade
 *   - Work item breakdown
 *   - Pareto analysis (top 5)
 *   - Engineering assumptions
 */

import React, { useState } from 'react';
import { WeirCostResult } from '../../engine/weir/weirTypes';

interface WeirCostSummaryPanelProps {
  result: WeirCostResult;
}

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

const CONFIDENCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  A: { bg: '#DCFCE7', color: '#166534', label: 'A — Verified' },
  B: { bg: '#DBEAFE', color: '#1E40AF', label: 'B — 1 Ref. Estimate' },
  C: { bg: '#FEF3C7', color: '#92400E', label: 'C — Multiple Refs' },
  D: { bg: '#FED7AA', color: '#9A3412', label: 'D — Many Refs' },
  BLOCKED: { bg: '#FEE2E2', color: '#991B1B', label: 'BLOCKED — Missing Data' },
};

export const WeirCostSummaryPanel: React.FC<WeirCostSummaryPanelProps> = ({ result }) => {
  const [showWorkItems, setShowWorkItems] = useState(false);
  const [showPareto, setShowPareto] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const s = result.costSummary;
  const confStyle = CONFIDENCE_STYLES[result.dataConfidence] || CONFIDENCE_STYLES.D;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)',
          borderRadius: '10px',
          padding: '14px 16px',
          color: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '10px', opacity: 0.7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Forensic Cost Pipeline — Weir Body
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'monospace', marginTop: '4px' }}>
              {formatRupiah(s.finalCost)}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
              Volume: {s.volume} m³ | {s.workItemsResolved} items resolved | {s.workItemsBlocked} blocked
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
            <span
              style={{
                fontSize: '10px',
                background: confStyle.bg,
                color: confStyle.color,
                padding: '3px 8px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              {confStyle.label}
            </span>
            <span
              style={{
                fontSize: '9px',
                background: result.noDoubleMarkup.status === 'PASS' ? '#DCFCE7' : '#FEE2E2',
                color: result.noDoubleMarkup.status === 'PASS' ? '#166534' : '#991B1B',
                padding: '2px 6px',
                borderRadius: '3px',
                fontWeight: 700,
              }}
            >
              No Double Markup: {result.noDoubleMarkup.status}
            </span>
            <span
              style={{
                fontSize: '9px',
                background: result.smkkStatus === 'APPLIED' ? '#DBEAFE' : '#FEF3C7',
                color: result.smkkStatus === 'APPLIED' ? '#1E40AF' : '#92400E',
                padding: '2px 6px',
                borderRadius: '3px',
                fontWeight: 700,
              }}
            >
              SMKK: {result.smkkStatus}
            </span>
          </div>
        </div>
      </div>

      {/* ── COST BREAKDOWN TABLE ────────────────────────────────── */}
      <div
        style={{
          background: '#F8FAFC',
          borderRadius: '8px',
          border: '1px solid #CBD5E1',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0', background: '#F1F5F9' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Cost Breakdown
          </span>
        </div>
        <div style={{ padding: '8px 14px' }}>
          <CostRow label="Labor Cost" value={s.laborCost} color="#7C3AED" />
          <CostRow label="Material Cost" value={s.materialCost} color="#2563EB" />
          <CostRow label="Equipment Cost" value={s.equipmentCost} color="#0891B2" />
          <CostRow label="Direct Cost (L+M+E)" value={s.directCost} bold borderTop />
          {s.smkk > 0 && <CostRow label={`SMKK`} value={s.smkk} color="#D97706" />}
          <CostRow label={`Overhead (5%)`} value={s.overhead} color="#6B7280" />
          <CostRow label={`Profit (5%)`} value={s.profit} color="#6B7280" />
          <CostRow label={`Tax / PPN (11%)`} value={s.tax} color="#6B7280" />
          <CostRow label="FINAL COST" value={s.finalCost} bold large borderTop />
        </div>
      </div>

      {/* ── WORK ITEMS ──────────────────────────────────────────── */}
      <div
        style={{
          background: '#F8FAFC',
          borderRadius: '8px',
          border: '1px solid #CBD5E1',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={() => setShowWorkItems(!showWorkItems)}
          style={{
            width: '100%',
            padding: '10px 14px',
            border: 'none',
            background: '#F1F5F9',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Work Items ({result.workItems.length})
          </span>
          <span style={{ fontSize: '14px', color: '#94A3B8' }}>{showWorkItems ? '−' : '+'}</span>
        </button>
        {showWorkItems && (
          <div style={{ padding: '8px 14px' }}>
            {result.workItems.map((wi, idx) => (
              <div
                key={wi.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: idx < result.workItems.length - 1 ? '1px solid #F1F5F9' : 'none',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#1E293B' }}>{wi.name}</div>
                  <div style={{ fontSize: '9.5px', color: '#64748B', marginTop: '1px' }}>
                    {wi.quantity} {wi.unit} → AHSP: {wi.ahspCode} | Source: {wi.quantitySource}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'monospace', color: '#0F172A' }}>
                    {wi.priceStatus === 'RESOLVED' ? formatRupiah(wi.finalCost) : wi.priceStatus}
                  </div>
                  <div style={{ fontSize: '9px', color: '#64748B' }}>
                    Direct: {formatRupiah(wi.directCost)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PARETO ANALYSIS ─────────────────────────────────────── */}
      <div
        style={{
          background: '#F8FAFC',
          borderRadius: '8px',
          border: '1px solid #CBD5E1',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={() => setShowPareto(!showPareto)}
          style={{
            width: '100%',
            padding: '10px 14px',
            border: 'none',
            background: '#F1F5F9',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Pareto Analysis (Top 5)
          </span>
          <span style={{ fontSize: '14px', color: '#94A3B8' }}>{showPareto ? '−' : '+'}</span>
        </button>
        {showPareto && (
          <div style={{ padding: '8px 14px' }}>
            {result.paretoAnalysis.slice(0, 5).map((p, idx) => (
              <div key={idx} style={{ padding: '4px 0', borderBottom: idx < 4 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#1E293B' }}>{p.resource}</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#0F172A' }}>
                    {p.contributionPercent}%
                  </span>
                </div>
                <div
                  style={{
                    height: '4px',
                    background: '#E2E8F0',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${p.contributionPercent}%`,
                      height: '100%',
                      background: idx === 0 ? '#EF4444' : idx === 1 ? '#F97316' : idx === 2 ? '#EAB308' : '#3B82F6',
                      borderRadius: '2px',
                    }}
                  />
                </div>
                <div style={{ fontSize: '9px', color: '#64748B', marginTop: '1px' }}>
                  {formatRupiah(p.totalExpense)} | Cumulative: {p.cumulativePercent}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ASSUMPTIONS ─────────────────────────────────────────── */}
      {result.assumptions.length > 0 && (
        <div
          style={{
            background: '#FFFBEB',
            borderRadius: '8px',
            border: '1px solid #FCD34D',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setShowAssumptions(!showAssumptions)}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: 'none',
              background: '#FEF3C7',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase' }}>
              Assumptions ({result.assumptions.length})
            </span>
            <span style={{ fontSize: '14px', color: '#D97706' }}>{showAssumptions ? '−' : '+'}</span>
          </button>
          {showAssumptions && (
            <div style={{ padding: '8px 14px' }}>
              {result.assumptions.map((a, idx) => (
                <div key={idx} style={{ padding: '4px 0', fontSize: '10.5px', color: '#78350F' }}>
                  <strong>{a.field}</strong>: {a.value} ({a.type})
                  <div style={{ fontSize: '9.5px', color: '#92400E', marginTop: '1px' }}>{a.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LOCATION INFO ───────────────────────────────────────── */}
      <div style={{ fontSize: '10px', color: '#64748B', textAlign: 'center', padding: '4px' }}>
        Location: {result.locationInfo.projectLocation} → {result.locationInfo.resolvedRegion}
        | Price Source: {result.locationInfo.priceSource}
        | Date: {result.locationInfo.priceDate}
      </div>
    </div>
  );
};

// ── HELPER COMPONENT ──────────────────────────────────────────────

const CostRow: React.FC<{
  label: string;
  value: number;
  color?: string;
  bold?: boolean;
  large?: boolean;
  borderTop?: boolean;
}> = ({ label, value, color, bold, large, borderTop }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: borderTop ? '6px 0 2px' : '3px 0',
      borderTop: borderTop ? '1px solid #CBD5E1' : 'none',
      marginTop: borderTop ? '4px' : '0',
    }}
  >
    <span
      style={{
        fontSize: large ? '13px' : '11px',
        fontWeight: bold ? 800 : 500,
        color: color || '#475569',
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontSize: large ? '15px' : '11px',
        fontWeight: bold ? 800 : 600,
        fontFamily: 'monospace',
        color: bold ? '#0F172A' : color || '#475569',
      }}
    >
      {formatRupiah(value)}
    </span>
  </div>
);

export default WeirCostSummaryPanel;

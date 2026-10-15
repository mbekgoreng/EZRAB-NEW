import React from 'react';
import { BudgetActualPoint } from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { Scale, TrendingDown, TrendingUp, CheckCircle, AlertCircle } from 'lucide-react';

interface BudgetVsActualCardProps {
  items: BudgetActualPoint[];
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  variancePercent: number;
  status: 'UNDER_BUDGET' | 'ON_TRACK' | 'OVER_BUDGET';
  onSelectGroup?: (groupId: string) => void;
}

export const BudgetVsActualCard: React.FC<BudgetVsActualCardProps> = ({
  items,
  totalBudget,
  totalActual,
  totalVariance,
  variancePercent,
  status,
  onSelectGroup,
}) => {
  if (!items || items.length === 0) {
    return (
      <div
        style={{
          padding: '30px 20px',
          textAlign: 'center',
          backgroundColor: 'var(--ez-color-surface-secondary)',
          borderRadius: 'var(--ez-radius-control)',
          border: '1px dashed var(--ez-hue-slate-border)',
          color: 'var(--ez-color-text-muted)',
          fontSize: '13px',
        }}
      >
        <Scale size={24} style={{ margin: '0 auto 6px', color: 'var(--ez-color-text-faint)' }} />
        <div style={{ fontWeight: 600, color: 'var(--ez-color-text-body)' }}>Belum Ada Data Anggaran vs Realisasi</div>
        <div style={{ fontSize: '12px', marginTop: '2px' }}>
          Data akan otomatis terisi saat item RAB dan transaksi pengeluaran tersedia.
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...items.flatMap((i) => [i.budgetAmount, i.actualAmount]), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Overall Variance Header Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: '8px',
          backgroundColor: status === 'OVER_BUDGET' ? 'var(--ez-hue-rose-bg)' : (status === 'UNDER_BUDGET' ? 'var(--ez-hue-green-bg)' : 'var(--ez-color-surface-secondary)'),
          border: `1px solid ${status === 'OVER_BUDGET' ? 'var(--ez-hue-rose-border)' : (status === 'UNDER_BUDGET' ? 'var(--ez-hue-green-border)' : 'var(--ez-color-border)')}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status === 'OVER_BUDGET' ? (
            <AlertCircle size={16} color="#DC2626" />
          ) : status === 'UNDER_BUDGET' ? (
            <CheckCircle size={16} color="#16A34A" />
          ) : (
            <Scale size={16} color="#475569" />
          )}
          <span
            style={{
              fontSize: '12.5px',
              fontWeight: 700,
              color: status === 'OVER_BUDGET' ? '#991B1B' : (status === 'UNDER_BUDGET' ? '#166534' : '#334155'),
            }}
          >
            {status === 'OVER_BUDGET' ? 'Over Budget (Melebihi Anggaran)' : (status === 'UNDER_BUDGET' ? 'Under Budget (Sesuai Anggaran)' : 'On Track')}
          </span>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 750,
              color: status === 'OVER_BUDGET' ? '#DC2626' : (status === 'UNDER_BUDGET' ? '#16A34A' : '#475569'),
            }}
          >
            {totalVariance >= 0 ? '+' : ''}{formatRupiah(totalVariance)} ({variancePercent >= 0 ? '+' : ''}{variancePercent}%)
          </span>
        </div>
      </div>

      {/* Grouped Horizontal Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {items.map((item) => {
          const budgetPct = Math.min(100, Math.round((item.budgetAmount / maxVal) * 100));
          const actualPct = Math.min(100, Math.round((item.actualAmount / maxVal) * 100));
          const isOver = item.status === 'OVER_BUDGET';

          return (
            <div
              key={item.groupId}
              onClick={() => onSelectGroup && onSelectGroup(item.groupId)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: 'var(--ez-color-surface-secondary)',
                border: '1px solid var(--ez-color-border-soft)',
                cursor: onSelectGroup ? 'pointer' : 'default',
                transition: 'all 120ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ fontWeight: 650, color: 'var(--ez-color-text-strong)' }}>{item.groupName}</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: isOver ? '#DC2626' : '#16A34A',
                    backgroundColor: isOver ? 'var(--ez-hue-rose-bg)' : 'var(--ez-hue-green-bg)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {item.varianceAmount >= 0 ? '+' : ''}{formatRupiah(item.varianceAmount)} ({item.variancePercent >= 0 ? '+' : ''}{item.variancePercent}%)
                </span>
              </div>

              {/* Dual Progress Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                {/* Budget Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '45px', fontSize: '10px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>RAB</span>
                  <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--ez-color-border-line)', borderRadius: 'var(--ez-radius-pill)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${budgetPct}%`,
                        height: '100%',
                        backgroundColor: '#3B82F6',
                        borderRadius: 'var(--ez-radius-pill)',
                      }}
                    />
                  </div>
                  <span style={{ width: '75px', textAlign: 'right', fontSize: '10px', color: 'var(--ez-color-text-slate)', fontWeight: 600 }}>
                    {formatRupiah(item.budgetAmount)}
                  </span>
                </div>

                {/* Actual Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '45px', fontSize: '10px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>Aktual</span>
                  <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--ez-color-border-line)', borderRadius: 'var(--ez-radius-pill)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${actualPct}%`,
                        height: '100%',
                        backgroundColor: isOver ? '#EF4444' : '#10B981',
                        borderRadius: 'var(--ez-radius-pill)',
                      }}
                    />
                  </div>
                  <span style={{ width: '75px', textAlign: 'right', fontSize: '10px', color: isOver ? '#DC2626' : '#16A34A', fontWeight: 600 }}>
                    {formatRupiah(item.actualAmount)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

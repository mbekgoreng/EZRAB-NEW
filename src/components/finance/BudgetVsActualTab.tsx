import React, { useState, useMemo } from 'react';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  Filter,
  CheckCircle,
  AlertCircle,
  Download,
  Search,
  ArrowRight,
  PieChart,
} from 'lucide-react';
import { Project, RabItem } from '../../types';
import { FinancialAnalyticsService } from '../../services/financialAnalyticsService';
import { formatRupiah } from '../../engine/formulaEngine';
import { BudgetVsActualCard } from './BudgetVsActualCard';

interface BudgetVsActualTabProps {
  currentProject: Project | null;
  rabItems?: RabItem[];
}

export const BudgetVsActualTab: React.FC<BudgetVsActualTabProps> = ({
  currentProject,
  rabItems = [],
}) => {
  const projectId = currentProject?.id || 'global';
  const analytics = useMemo(() => new FinancialAnalyticsService(projectId), [projectId]);

  const budgetVsActual = useMemo(() => {
    return analytics.getBudgetVsActual(rabItems);
  }, [analytics, rabItems]);

  const costBreakdown = useMemo(() => {
    return analytics.getCostBreakdown(rabItems);
  }, [analytics, rabItems]);

  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Analisis Anggaran vs Realisasi (Budget vs Actual)
            </h2>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
              Komparasi mendalam antara budget RAB terencana dengan akumulasi pengeluaran lapangan per kelompok pekerjaan.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 750,
                color: budgetVsActual.status === 'OVER_BUDGET' ? '#DC2626' : '#166534',
                backgroundColor: budgetVsActual.status === 'OVER_BUDGET' ? '#FEE2E2' : '#DCFCE7',
                padding: '4px 10px',
                borderRadius: '6px',
                border: `1px solid ${budgetVsActual.status === 'OVER_BUDGET' ? '#FECACA' : '#BBF7D0'}`,
              }}
            >
              Varians: {budgetVsActual.totalVariance >= 0 ? '+' : ''}{formatRupiah(budgetVsActual.totalVariance)} ({budgetVsActual.variancePercent >= 0 ? '+' : ''}{budgetVsActual.variancePercent}%)
            </span>
          </div>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
          <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>Total Anggaran RAB</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
            {formatRupiah(budgetVsActual.totalBudget)}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Disetujui dari Master RAB</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
          <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>Total Realisasi Aktual</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
            {formatRupiah(budgetVsActual.totalActual)}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Pengeluaran tercatat</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
          <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>Sisa Anggaran Tersedia</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
            {formatRupiah(Math.max(0, budgetVsActual.totalBudget - budgetVsActual.totalActual))}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Tersedia untuk sisa pekerjaan</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
          <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>Status Pengendalian</div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 800,
              color: budgetVsActual.status === 'OVER_BUDGET' ? '#DC2626' : '#16A34A',
              marginTop: '4px',
            }}
          >
            {budgetVsActual.status === 'OVER_BUDGET' ? 'Over Budget' : (budgetVsActual.status === 'UNDER_BUDGET' ? 'Under Budget' : 'On Track')}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Deviasi: {budgetVsActual.variancePercent}%</div>
        </div>
      </div>

      {/* Main Budget vs Actual Visual Bars */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
          Rincian Komparasi per Kelompok Pekerjaan
        </h3>

        <BudgetVsActualCard
          items={budgetVsActual.items}
          totalBudget={budgetVsActual.totalBudget}
          totalActual={budgetVsActual.totalActual}
          totalVariance={budgetVsActual.totalVariance}
          variancePercent={budgetVsActual.variancePercent}
          status={budgetVsActual.status}
        />
      </div>

      {/* Cost Element Breakdown Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
          Komposisi Unsur Biaya (Material, Upah, Subkon, Alat, Operasional)
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Kategori Unsur Biaya</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Anggaran RAB</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Realisasi Aktual</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Varians</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Porsi Aktual</th>
              </tr>
            </thead>
            <tbody>
              {costBreakdown.items.map((c) => {
                const varAmt = c.actualAmount - c.budgetAmount;
                const isOver = varAmt > 0 && c.budgetAmount > 0;

                return (
                  <tr key={c.category} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 650, color: '#1E293B' }}>
                      {c.category}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                      {c.budgetAmount > 0 ? formatRupiah(c.budgetAmount) : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                      {formatRupiah(c.actualAmount)}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: isOver ? '#DC2626' : (varAmt < 0 ? '#16A34A' : '#64748B'),
                      }}
                    >
                      {c.budgetAmount > 0 ? `${varAmt >= 0 ? '+' : ''}${formatRupiah(varAmt)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 650, color: '#2563EB' }}>
                      {c.percentageOfTotal}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

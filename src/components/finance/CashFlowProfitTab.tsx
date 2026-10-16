import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Scale,
  Calendar,
  AlertCircle,
  CheckCircle2,
  PieChart,
  Info,
  AlertTriangle,
} from 'lucide-react';
import {
  ProjectFinanceSummary,
  Payment,
  Expense,
  Termin,
  Invoice,
  FinancialGranularity,
  FinancialPeriodFilter,
} from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { Project, RabItem } from '../../types';
import { FinancialAnalyticsService } from '../../services/financialAnalyticsService';
import { CashFlowChart } from './CashFlowChart';

interface CashFlowProfitTabProps {
  currentProject: Project | null;
  summary: ProjectFinanceSummary;
  payments: Payment[];
  expenses: Expense[];
  terms: Termin[];
  invoices: Invoice[];
  rabItems?: RabItem[];
}

export const CashFlowProfitTab: React.FC<CashFlowProfitTabProps> = ({
  currentProject,
  summary,
  payments,
  expenses,
  terms,
  invoices,
  rabItems = [],
}) => {
  const [granularity, setGranularity] = useState<FinancialGranularity>('monthly');
  const [periodFilter, setPeriodFilter] = useState<FinancialPeriodFilter>('all');

  const projectId = currentProject?.id || 'global';
  const analytics = useMemo(() => new FinancialAnalyticsService(projectId), [projectId, payments, expenses, terms, invoices]);

  const cashFlow = useMemo(() => {
    return analytics.getCashFlow({ granularity, periodFilter, includeForecast: true }, rabItems, currentProject);
  }, [analytics, granularity, periodFilter, rabItems, currentProject]);

  const profitability = useMemo(() => {
    return analytics.getProfitability(rabItems, currentProject);
  }, [analytics, rabItems, currentProject]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header Banner */}
      <div
        style={{
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: '16px',
          border: '1px solid var(--ez-color-border-line)',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Arus Kas & Analisis Profitabilitas (Cash Flow & Profit Engine)
            </h2>
            <div style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', marginTop: '4px' }}>
              Pemisahan tegas antara dana <strong>AKTUAL</strong> (kas masuk & keluar riil) dan dana <strong>PROYEKSI</strong> (rencana termin & Kurva-S).
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 750, color: 'var(--ez-hue-green-text-deep)', backgroundColor: 'var(--ez-hue-green-bg-deep)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-green-border)' }}>
              AKTUAL: {formatRupiah(cashFlow.totalActualIn)} Masuk
            </span>
            <span style={{ fontSize: '11.5px', fontWeight: 750, color: 'var(--ez-hue-violet-text)', backgroundColor: 'var(--ez-hue-violet-bg)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-violet-border)' }}>
              PROYEKSI: {formatRupiah(cashFlow.totalForecastIn)} Sisa Termin
            </span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Cash Flow Chart Card */}
      <div
        style={{
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: '16px',
          border: '1px solid var(--ez-color-border-line)',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Kurva Arus Kas Mingguan / Bulanan
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
              Garis biru menunjukkan realisasi kas kumulatif, garis ungu putus-putus menunjukkan proyeksi deterministik.
            </div>
          </div>
        </div>

        <CashFlowChart
          points={cashFlow.points}
          granularity={granularity}
          onGranularityChange={setGranularity}
          hasNegativeForecast={cashFlow.hasNegativeForecast}
          futureLowestCumulative={cashFlow.futureLowestCumulative}
        />
      </div>

      {/* 3. Profitability Deep Dive Section */}
      <div
        style={{
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: '16px',
          border: '1px solid var(--ez-color-border-line)',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Scale size={18} color="var(--ez-hue-blue-text)" />
          <h3 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--ez-color-text-primary)', margin: 0 }}>
            Analisis Margin Profitabilitas Proyek
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--ez-color-border-line)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Nilai Kontrak (Revenue)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', marginTop: '4px' }}>
              {profitability.isContractAvailable ? formatRupiah(profitability.contractValue) : '-'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
              Dasar penagihan klien
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--ez-color-border-line)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)', textTransform: 'uppercase' }}>
              Estimasi Total Biaya (Cost)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-slate)', marginTop: '4px' }}>
              {formatRupiah(profitability.projectedTotalCost)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
              Aktual + Sisa Budget RAB
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--ez-hue-rose-bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--ez-hue-rose-border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-hue-red-text)', textTransform: 'uppercase' }}>
              Biaya Riil Aktual (Spent)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-hue-rose-text)', marginTop: '4px' }}>
              {formatRupiah(profitability.actualCost)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ez-hue-red-text)', marginTop: '2px' }}>
              {summary.expensesCount} catatan pengeluaran
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--ez-hue-green-bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--ez-hue-green-border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-hue-green-text-deep)', textTransform: 'uppercase' }}>
              Proyeksi Margin Profit
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-hue-green-text)', marginTop: '4px' }}>
              {profitability.projectedProfit !== null ? formatRupiah(profitability.projectedProfit) : '-'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ez-hue-green-text-deep)', marginTop: '2px' }}>
              Margin: <strong>{profitability.projectedMarginPercent !== null ? `${profitability.projectedMarginPercent}%` : '-'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Detailed Periodic Data Table */}
      <div
        style={{
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: '16px',
          border: '1px solid var(--ez-color-border-line)',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
          Tabel Rincian Arus Kas (Per Periode)
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Periode</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Kas Masuk</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Kas Keluar</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Net Bersih</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Kumulatif</th>
              </tr>
            </thead>
            <tbody>
              {cashFlow.points.map((p) => {
                const isNetPositive = p.netCashFlow >= 0;
                const isCumPositive = p.cumulativeCashFlow >= 0;

                return (
                  <tr key={p.periodKey} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>
                      {p.periodLabel}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: p.isForecast ? 'var(--ez-hue-violet-bg)' : 'var(--ez-hue-blue-bg)',
                          color: p.isForecast ? 'var(--ez-hue-violet-text)' : 'var(--ez-hue-blue-text-deep)',
                          border: `1px solid ${p.isForecast ? 'var(--ez-hue-violet-border)' : 'var(--ez-hue-blue-border)'}`,
                        }}
                      >
                        {p.isForecast ? 'PROYEKSI' : 'AKTUAL'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ez-hue-green-text-bright)' }}>
                      {p.cashIn > 0 ? `+ ${formatRupiah(p.cashIn)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ez-hue-rose-text)' }}>
                      {p.cashOut > 0 ? `- ${formatRupiah(p.cashOut)}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 750, color: isNetPositive ? 'var(--ez-hue-green-text)' : 'var(--ez-hue-rose-text)' }}>
                      {isNetPositive ? '+' : ''}{formatRupiah(p.netCashFlow)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: isCumPositive ? 'var(--ez-color-text-primary)' : '#EF4444' }}>
                      {formatRupiah(p.cumulativeCashFlow)}
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

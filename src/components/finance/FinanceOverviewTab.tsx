import React, { useState, useMemo } from 'react';
import {
  Wallet,
  FileCheck2,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  TrendingUp,
  AlertCircle,
  Plus,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Scale,
  Sparkles,
  PieChart,
  Calendar,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  ProjectFinanceSummary,
  FinancialSummaryKPI,
  Termin,
  Invoice,
  Payment,
  Expense,
  FinancialPeriodFilter,
  FinancialGranularity,
} from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { Project, RabItem } from '../../types';
import { FinancialAnalyticsService } from '../../services/financialAnalyticsService';
import { CashFlowChart } from './CashFlowChart';
import { BudgetVsActualCard } from './BudgetVsActualCard';
import { TransactionTable } from './TransactionTable';

interface FinanceOverviewTabProps {
  currentProject: Project | null;
  summary: ProjectFinanceSummary;
  terms: Termin[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  rabItems?: RabItem[];
  onNavigateSubTab: (tab: any) => void;
  onOpenCreateTermin: () => void;
  onOpenCreateInvoice: () => void;
  onOpenRecordPayment: () => void;
  onOpenAddExpense: () => void;
}

export const FinanceOverviewTab: React.FC<FinanceOverviewTabProps> = ({
  currentProject,
  summary,
  terms,
  invoices,
  payments,
  expenses,
  rabItems = [],
  onNavigateSubTab,
  onOpenCreateTermin,
  onOpenCreateInvoice,
  onOpenRecordPayment,
  onOpenAddExpense,
}) => {
  const [periodFilter, setPeriodFilter] = useState<FinancialPeriodFilter>('all');
  const [granularity, setGranularity] = useState<FinancialGranularity>('monthly');
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'RECEIVABLE' | 'PAYABLE'>('ALL');

  const projectId = currentProject?.id || 'global';
  const analytics = useMemo(() => new FinancialAnalyticsService(projectId), [projectId, terms, invoices, payments, expenses]);

  // Derive Deterministic Financial Data
  const kpiData: FinancialSummaryKPI = useMemo(() => {
    return analytics.getFinancialSummary(rabItems, currentProject, periodFilter);
  }, [analytics, rabItems, currentProject, periodFilter]);

  const cashFlowData = useMemo(() => {
    return analytics.getCashFlow({ granularity, periodFilter, includeForecast: true }, rabItems, currentProject);
  }, [analytics, granularity, periodFilter, rabItems, currentProject]);

  const budgetVsActualData = useMemo(() => {
    return analytics.getBudgetVsActual(rabItems);
  }, [analytics, rabItems]);

  const costBreakdownData = useMemo(() => {
    return analytics.getCostBreakdown(rabItems);
  }, [analytics, rabItems]);

  const profitabilityData = useMemo(() => {
    return analytics.getProfitability(rabItems, currentProject);
  }, [analytics, rabItems, currentProject]);

  const receivablesData = useMemo(() => {
    return analytics.getReceivables();
  }, [analytics]);

  const payablesData = useMemo(() => {
    return analytics.getPayables();
  }, [analytics]);

  const transactionsData = useMemo(() => {
    return analytics.getTransactions({
      type: txTypeFilter,
      searchQuery: txSearchQuery,
      periodFilter,
      limit: 10,
    });
  }, [analytics, txTypeFilter, txSearchQuery, periodFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Project Context & Action Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 750,
                  color: 'var(--ez-color-primary)',
                  backgroundColor: 'var(--ez-hue-blue-bg)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--ez-hue-blue-border)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Project Financial Control
              </span>
              <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
                {currentProject?.location || 'Indonesia'} &bull; Durasi: {(currentProject as any)?.duration || '270 Hari'}
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: '6px 0 0 0', letterSpacing: '-0.02em' }}>
              {currentProject?.name || 'Pilih Proyek Aktif'}
            </h2>
          </div>

          {/* Quick Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onOpenCreateTermin}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--ez-hue-blue-bg)',
                border: '1px solid var(--ez-hue-blue-border)',
                color: 'var(--ez-color-primary-hover)',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 120ms ease',
              }}
            >
              <Plus size={14} />
              <span>Tambah Termin</span>
            </button>

            <button
              type="button"
              onClick={onOpenCreateInvoice}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--ez-hue-blue-bg)',
                border: '1px solid var(--ez-hue-blue-border)',
                color: 'var(--ez-color-primary-hover)',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 120ms ease',
              }}
            >
              <Plus size={14} />
              <span>Buat Invoice</span>
            </button>

            <button
              type="button"
              onClick={onOpenRecordPayment}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--ez-hue-green-bg)',
                border: '1px solid var(--ez-hue-green-border)',
                color: 'var(--ez-hue-green-text)',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 120ms ease',
              }}
            >
              <ArrowDownLeft size={14} />
              <span>Catat Masuk</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddExpense}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--ez-hue-rose-bg)',
                border: '1px solid var(--ez-hue-rose-border)',
                color: 'var(--ez-hue-rose-text)',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 120ms ease',
              }}
            >
              <ArrowUpRight size={14} />
              <span>Catat Keluar</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Primary KPI Cards Grid (Section 6 & 7) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        {/* KPI 1: Nilai Kontrak */}
        <div className="ez-stat"
          style={{
            backgroundColor: 'var(--ez-pastel-cream)',
            borderRadius: 'var(--ez-radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>Nilai Kontrak</span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '4px',
                backgroundColor: kpiData.isContractAvailable ? 'var(--ez-hue-green-bg-deep)' : 'var(--ez-color-surface-tertiary)',
                color: kpiData.isContractAvailable ? 'var(--ez-hue-green-text-deep)' : 'var(--ez-color-text-muted)',
              }}
            >
              {kpiData.isContractAvailable ? 'Available' : 'No Data'}
            </span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
            {kpiData.isContractAvailable ? formatRupiah(kpiData.contractValue) : 'Belum Diatur'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
            Sumber: Master Kontrak Proyek
          </div>
        </div>

        {/* KPI 2: Total Budget / RAB */}
        <div className="ez-stat"
          style={{
            backgroundColor: 'var(--ez-pastel-mint)',
            borderRadius: 'var(--ez-radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>Total Budget (RAB)</span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '4px',
                backgroundColor: kpiData.isBudgetAvailable ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface-tertiary)',
                color: kpiData.isBudgetAvailable ? 'var(--ez-hue-blue-text-deep)' : 'var(--ez-color-text-muted)',
              }}
            >
              {kpiData.isBudgetAvailable ? 'Approved RAB' : 'No Data'}
            </span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
            {kpiData.isBudgetAvailable ? formatRupiah(kpiData.totalBudget) : 'Belum Ada RAB'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
            Komitmen: {formatRupiah(kpiData.committedCost)}
          </div>
        </div>

        {/* KPI 3: Actual Cost (Pengeluaran Riil) */}
        <div className="ez-stat"
          style={{
            backgroundColor: 'var(--ez-pastel-peach)',
            borderRadius: 'var(--ez-radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>Actual Cost (Pengeluaran)</span>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-hue-rose-text)' }}>
            {expenses.length > 0 ? formatRupiah(kpiData.actualCost) : 'Rp 0'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
            {expenses.length} Transaksi Terverifikasi
          </div>
        </div>

        {/* KPI 4: Cash In (Penerimaan Riil) */}
        <div className="ez-stat"
          style={{
            backgroundColor: 'var(--ez-pastel-sky)',
            borderRadius: 'var(--ez-radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>Cash In (Penerimaan)</span>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-hue-green-text-bright)' }}>
            {payments.length > 0 ? formatRupiah(kpiData.cashIn) : 'Rp 0'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
            {payments.length} Pembayaran Diterima
          </div>
        </div>

        {/* KPI 5: Outstanding Piutang */}
        <div className="ez-stat"
          style={{
            backgroundColor: 'var(--ez-pastel-cream)',
            borderRadius: 'var(--ez-radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>Sisa Piutang (Receivable)</span>
            {receivablesData.totalOverdue > 0 && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: 'var(--ez-hue-red-bg)', color: 'var(--ez-hue-red-text)' }}>
                Overdue
              </span>
            )}
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: kpiData.receivableOutstanding > 0 ? 'var(--ez-hue-amber-text-deep)' : 'var(--ez-color-text)' }}>
            {formatRupiah(kpiData.receivableOutstanding)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
            Jatuh Tempo: {formatRupiah(receivablesData.totalOverdue)}
          </div>
        </div>

        {/* KPI 6: Profit Sementara & Margin */}
        <div className="ez-stat"
          style={{
            backgroundColor: 'var(--ez-pastel-mint)',
            borderRadius: 'var(--ez-radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>Gross Profit Sementara</span>
            <span style={{ fontSize: '11px', fontWeight: 750, color: 'var(--ez-color-primary)' }}>
              {kpiData.isContractAvailable ? `${kpiData.profitMarginPercent}%` : '-'}
            </span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: kpiData.currentProfit >= 0 ? 'var(--ez-color-primary)' : 'var(--ez-hue-rose-text)' }}>
            {kpiData.isContractAvailable ? formatRupiah(kpiData.currentProfit) : 'Belum Ada Kontrak'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
            Proyeksi Akhir: {profitabilityData.projectedProfit !== null ? formatRupiah(profitabilityData.projectedProfit) : 'N/A'}
          </div>
        </div>
      </div>

      {/* 3. Main Visual: Cash Flow Interactive Chart (Section 8, 9, 10, 11) */}
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
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Arus Kas Proyek (Cash Flow: Aktual vs Proyeksi)
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
              Pantau kas masuk, pengeluaran riil, dan proyeksi titik kritis arus kas secara berkesinambungan.
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateSubTab('cashflow')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              borderRadius: '6px',
              backgroundColor: 'var(--ez-color-surface-secondary)',
              border: '1px solid var(--ez-color-border-line)',
              color: 'var(--ez-color-primary)',
              fontSize: '11.5px',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            <span>Buka Detail Cash Flow</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <CashFlowChart
          points={cashFlowData.points}
          granularity={granularity}
          onGranularityChange={setGranularity}
          hasNegativeForecast={cashFlowData.hasNegativeForecast}
          futureLowestCumulative={cashFlowData.futureLowestCumulative}
        />
      </div>

      {/* 4. Mid Section: Budget vs Actual & Cost Breakdown (Section 12, 13, 14, 15) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
        {/* Budget vs Actual Card */}
        <div
          style={{
            backgroundColor: 'var(--ez-color-surface)',
            borderRadius: '16px',
            border: '1px solid var(--ez-color-border-line)',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Budget vs Actual (Paket Pekerjaan)
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSubTab('budget')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ez-color-primary)',
                fontSize: '11.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>Detail</span>
              <ArrowRight size={12} />
            </button>
          </div>

          <BudgetVsActualCard
            items={budgetVsActualData.items}
            totalBudget={budgetVsActualData.totalBudget}
            totalActual={budgetVsActualData.totalActual}
            totalVariance={budgetVsActualData.totalVariance}
            variancePercent={budgetVsActualData.variancePercent}
            status={budgetVsActualData.status}
            onSelectGroup={() => onNavigateSubTab('budget')}
          />
        </div>

        {/* Cost Breakdown & Profitability Summary Card */}
        <div
          style={{
            backgroundColor: 'var(--ez-color-surface)',
            borderRadius: '16px',
            border: '1px solid var(--ez-color-border-line)',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
            Komposisi Pengeluaran & Profitabilitas
          </h3>

          {/* Cost Composition Mini List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {costBreakdownData.items.slice(0, 5).map((item) => (
              <div key={item.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#3B82F6' }} />
                  <span style={{ color: 'var(--ez-color-text-body)', fontWeight: 600 }}>{item.category}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--ez-color-text-primary)', fontWeight: 700 }}>{formatRupiah(item.actualAmount)}</span>
                  <span style={{ color: 'var(--ez-color-text-muted)', fontSize: '11px', width: '38px', textAlign: 'right' }}>
                    {item.percentageOfTotal}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Profit & Margin Projections Box */}
          <div
            style={{
              marginTop: 'auto',
              backgroundColor: 'var(--ez-color-surface-secondary)',
              borderRadius: '10px',
              border: '1px solid var(--ez-color-border-line)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
              <span>Nilai Kontrak:</span>
              <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                {profitabilityData.isContractAvailable ? formatRupiah(profitabilityData.contractValue) : '-'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--ez-color-text-muted)' }}>
              <span>Proyeksi Total Biaya:</span>
              <span style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                {formatRupiah(profitabilityData.projectedTotalCost)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', borderTop: '1px solid var(--ez-color-border-line)', paddingTop: '6px', color: 'var(--ez-color-text-ink)', fontWeight: 750 }}>
              <span>Proyeksi Profit Margin:</span>
              <span style={{ color: profitabilityData.projectedProfit && profitabilityData.projectedProfit >= 0 ? 'var(--ez-hue-green-text-bright)' : 'var(--ez-hue-rose-text)' }}>
                {profitabilityData.projectedMarginPercent !== null ? `${profitabilityData.projectedMarginPercent}%` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Termin Timeline & Payables Overview (Section 16, 17, 18, 19) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
        {/* Termin & Receivable Timeline */}
        <div
          style={{
            backgroundColor: 'var(--ez-color-surface)',
            borderRadius: '16px',
            border: '1px solid var(--ez-color-border-line)',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Timeline Termin & Piutang
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSubTab('terms')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ez-color-primary)',
                fontSize: '11.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>Semua ({terms.length})</span>
              <ArrowRight size={12} />
            </button>
          </div>

          {terms.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ez-color-text-muted)', fontSize: '12px' }}>
              Belum ada termin kontrak yang dikonfigurasi.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {terms.map((t) => {
                const isPaid = t.status === 'PAID';
                const isInvoiced = t.status === 'INVOICED' || t.status === 'PARTIALLY_PAID';
                const isOverdue = t.status === 'OVERDUE';

                return (
                  <div
                    key={t.id}
                    onClick={() => onNavigateSubTab('terms')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--ez-color-surface-secondary)',
                      border: '1px solid var(--ez-color-surface-tertiary)',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 650, fontSize: '12.5px', color: 'var(--ez-color-text-primary)' }}>
                        {t.name} ({t.percentage}%)
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>
                        Jatuh Tempo: {t.dueDate || '-'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--ez-color-text-primary)' }}>
                        {formatRupiah(t.amount)}
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: isPaid ? 'var(--ez-hue-green-bg-deep)' : (isInvoiced ? 'var(--ez-hue-blue-bg)' : (isOverdue ? 'var(--ez-hue-red-bg)' : 'var(--ez-color-surface-tertiary)')),
                          color: isPaid ? 'var(--ez-hue-green-text-deep)' : (isInvoiced ? 'var(--ez-hue-blue-text-deep)' : (isOverdue ? 'var(--ez-hue-red-text)' : 'var(--ez-color-text-slate)')),
                        }}
                      >
                        {t.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hutang & Supplier Tracking */}
        <div
          style={{
            backgroundColor: 'var(--ez-color-surface)',
            borderRadius: '16px',
            border: '1px solid var(--ez-color-border-line)',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Hutang Vendor & Supplier
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSubTab('expenses')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ez-color-primary)',
                fontSize: '11.5px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>Pengeluaran</span>
              <ArrowRight size={12} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>Total Hutang Pending</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-hue-amber-text-deep)', marginTop: '2px' }}>
                {formatRupiah(payablesData.totalPayable)}
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--ez-color-surface-secondary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>Total Telah Dibayar</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-hue-green-text-bright)', marginTop: '2px' }}>
                {formatRupiah(payablesData.totalPaid)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', lineHeight: '1.5' }}>
            Status hutang dipantau otomatis berdasarkan status komitmen pengadaan barang/jasa dan tanggal jatuh tempo tagihan vendor.
          </div>
        </div>
      </div>

      {/* 6. Recent Unified Transactions Table (Section 23, 24, 25) */}
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
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Transaksi Keuangan Terbaru (Source Traceability)
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>
              Seluruh catatan mutasi pemasukan, pengeluaran, termin, dan invoice proyek. Klik baris untuk detail sumber.
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateSubTab('transactions')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              borderRadius: '6px',
              backgroundColor: 'var(--ez-color-surface-secondary)',
              border: '1px solid var(--ez-color-border-line)',
              color: 'var(--ez-color-primary)',
              fontSize: '11.5px',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            <span>Semua Transaksi ({transactionsData.totalCount})</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <TransactionTable
          transactions={transactionsData.transactions}
          totalCount={transactionsData.totalCount}
          totalIncome={transactionsData.totalIncome}
          totalExpense={transactionsData.totalExpense}
          searchQuery={txSearchQuery}
          onSearchChange={setTxSearchQuery}
          typeFilter={txTypeFilter}
          onTypeFilterChange={setTxTypeFilter}
          periodFilter={periodFilter}
          onPeriodFilterChange={setPeriodFilter}
          onNavigateToSource={(source) => {
            if (source === 'INVOICE') onNavigateSubTab('invoices');
            else if (source === 'PAYMENT') onNavigateSubTab('payments');
            else if (source === 'EXPENSE') onNavigateSubTab('expenses');
            else if (source === 'TERMIN') onNavigateSubTab('terms');
          }}
        />
      </div>

      {/* 7. AI Financial Insights Panel (Section 26, 47, 48) */}
      <div
        style={{
          backgroundColor: 'var(--ez-color-surface-secondary)',
          borderRadius: '14px',
          border: '1px solid var(--ez-color-border-line)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <Sparkles size={18} color="var(--ez-hue-blue-text)" style={{ marginTop: '2px', flexShrink: 0 }} />
        <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-body)', lineHeight: '1.5' }}>
          <div style={{ fontWeight: 750, color: 'var(--ez-color-text-primary)', marginBottom: '4px' }}>
            EZRAB Financial Core Intelligence
          </div>
          <div>
            Kalkulasi keuangan proyek dijalankan secara <strong>deterministik</strong> langsung dari basis data RAB, Termin, Invoice, dan Pengeluaran Riil.
            {kpiData.activeAlerts.length > 0 ? (
              <span style={{ color: 'var(--ez-hue-rose-text)', fontWeight: 600 }}>
                {' '}Terdapat {kpiData.activeAlerts.length} peringatan aktif yang membutuhkan perhatian estimator.
              </span>
            ) : (
              <span style={{ color: 'var(--ez-hue-green-text-bright)', fontWeight: 600 }}>
                {' '}Status arus kas dan realisasi biaya proyek terpantau seimbang tanpa anomali kritis.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

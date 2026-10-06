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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 750,
                  color: '#2563EB',
                  backgroundColor: '#EFF6FF',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: '1px solid #BFDBFE',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Project Financial Control
              </span>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                {currentProject?.location || 'Indonesia'} &bull; Durasi: {(currentProject as any)?.duration || '270 Hari'}
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '6px 0 0 0', letterSpacing: '-0.02em' }}>
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
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#1D4ED8',
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
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#1D4ED8',
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
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                color: '#15803D',
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
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#DC2626',
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
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Nilai Kontrak</span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '4px',
                backgroundColor: kpiData.isContractAvailable ? '#DCFCE7' : '#F1F5F9',
                color: kpiData.isContractAvailable ? '#166534' : '#64748B',
              }}
            >
              {kpiData.isContractAvailable ? 'Available' : 'No Data'}
            </span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
            {kpiData.isContractAvailable ? formatRupiah(kpiData.contractValue) : 'Belum Diatur'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            Sumber: Master Kontrak Proyek
          </div>
        </div>

        {/* KPI 2: Total Budget / RAB */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Total Budget (RAB)</span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '4px',
                backgroundColor: kpiData.isBudgetAvailable ? '#EFF6FF' : '#F1F5F9',
                color: kpiData.isBudgetAvailable ? '#1E40AF' : '#64748B',
              }}
            >
              {kpiData.isBudgetAvailable ? 'Approved RAB' : 'No Data'}
            </span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
            {kpiData.isBudgetAvailable ? formatRupiah(kpiData.totalBudget) : 'Belum Ada RAB'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            Komitmen: {formatRupiah(kpiData.committedCost)}
          </div>
        </div>

        {/* KPI 3: Actual Cost (Pengeluaran Riil) */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Actual Cost (Pengeluaran)</span>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#DC2626' }}>
            {expenses.length > 0 ? formatRupiah(kpiData.actualCost) : 'Rp 0'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            {expenses.length} Transaksi Terverifikasi
          </div>
        </div>

        {/* KPI 4: Cash In (Penerimaan Riil) */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Cash In (Penerimaan)</span>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#16A34A' }}>
            {payments.length > 0 ? formatRupiah(kpiData.cashIn) : 'Rp 0'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            {payments.length} Pembayaran Diterima
          </div>
        </div>

        {/* KPI 5: Outstanding Piutang */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Sisa Piutang (Receivable)</span>
            {receivablesData.totalOverdue > 0 && (
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: '#FEE2E2', color: '#991B1B' }}>
                Overdue
              </span>
            )}
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: kpiData.receivableOutstanding > 0 ? '#D97706' : '#0F172A' }}>
            {formatRupiah(kpiData.receivableOutstanding)}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            Jatuh Tempo: {formatRupiah(receivablesData.totalOverdue)}
          </div>
        </div>

        {/* KPI 6: Profit Sementara & Margin */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Gross Profit Sementara</span>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#2563EB' }}>
              {kpiData.isContractAvailable ? `${kpiData.profitMarginPercent}%` : '-'}
            </span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: kpiData.currentProfit >= 0 ? '#2563EB' : '#DC2626' }}>
            {kpiData.isContractAvailable ? formatRupiah(kpiData.currentProfit) : 'Belum Ada Kontrak'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            Proyeksi Akhir: {profitabilityData.projectedProfit !== null ? formatRupiah(profitabilityData.projectedProfit) : 'N/A'}
          </div>
        </div>
      </div>

      {/* 3. Main Visual: Cash Flow Interactive Chart (Section 8, 9, 10, 11) */}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Arus Kas Proyek (Cash Flow: Aktual vs Proyeksi)
            </h3>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
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
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#2563EB',
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
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Budget vs Actual (Paket Pekerjaan)
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSubTab('budget')}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563EB',
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
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
            Komposisi Pengeluaran & Profitabilitas
          </h3>

          {/* Cost Composition Mini List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {costBreakdownData.items.slice(0, 5).map((item) => (
              <div key={item.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#3B82F6' }} />
                  <span style={{ color: '#334155', fontWeight: 600 }}>{item.category}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>{formatRupiah(item.actualAmount)}</span>
                  <span style={{ color: '#64748B', fontSize: '11px', width: '38px', textAlign: 'right' }}>
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
              backgroundColor: '#F8FAFC',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B' }}>
              <span>Nilai Kontrak:</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>
                {profitabilityData.isContractAvailable ? formatRupiah(profitabilityData.contractValue) : '-'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B' }}>
              <span>Proyeksi Total Biaya:</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>
                {formatRupiah(profitabilityData.projectedTotalCost)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', borderTop: '1px solid #E2E8F0', paddingTop: '6px', color: '#1E293B', fontWeight: 750 }}>
              <span>Proyeksi Profit Margin:</span>
              <span style={{ color: profitabilityData.projectedProfit && profitabilityData.projectedProfit >= 0 ? '#16A34A' : '#DC2626' }}>
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
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Timeline Termin & Piutang
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSubTab('terms')}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563EB',
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
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '12px' }}>
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
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #F1F5F9',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 650, fontSize: '12.5px', color: '#0F172A' }}>
                        {t.name} ({t.percentage}%)
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Jatuh Tempo: {t.dueDate || '-'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0F172A' }}>
                        {formatRupiah(t.amount)}
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: isPaid ? '#DCFCE7' : (isInvoiced ? '#EFF6FF' : (isOverdue ? '#FEE2E2' : '#F1F5F9')),
                          color: isPaid ? '#166534' : (isInvoiced ? '#1E40AF' : (isOverdue ? '#991B1B' : '#475569')),
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
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Hutang Vendor & Supplier
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSubTab('expenses')}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563EB',
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
            <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '11px', color: '#64748B' }}>Total Hutang Pending</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#D97706', marginTop: '2px' }}>
                {formatRupiah(payablesData.totalPayable)}
              </div>
            </div>
            <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '11px', color: '#64748B' }}>Total Telah Dibayar</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#16A34A', marginTop: '2px' }}>
                {formatRupiah(payablesData.totalPaid)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11.5px', color: '#64748B', lineHeight: '1.5' }}>
            Status hutang dipantau otomatis berdasarkan status komitmen pengadaan barang/jasa dan tanggal jatuh tempo tagihan vendor.
          </div>
        </div>
      </div>

      {/* 6. Recent Unified Transactions Table (Section 23, 24, 25) */}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Transaksi Keuangan Terbaru (Source Traceability)
            </h3>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
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
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#2563EB',
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
          backgroundColor: '#F8FAFC',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <Sparkles size={18} color="#2563EB" style={{ marginTop: '2px', flexShrink: 0 }} />
        <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: '1.5' }}>
          <div style={{ fontWeight: 750, color: '#0F172A', marginBottom: '4px' }}>
            EZRAB Financial Core Intelligence
          </div>
          <div>
            Kalkulasi keuangan proyek dijalankan secara <strong>deterministik</strong> langsung dari basis data RAB, Termin, Invoice, dan Pengeluaran Riil.
            {kpiData.activeAlerts.length > 0 ? (
              <span style={{ color: '#DC2626', fontWeight: 600 }}>
                {' '}Terdapat {kpiData.activeAlerts.length} peringatan aktif yang membutuhkan perhatian estimator.
              </span>
            ) : (
              <span style={{ color: '#16A34A', fontWeight: 600 }}>
                {' '}Status arus kas dan realisasi biaya proyek terpantau seimbang tanpa anomali kritis.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

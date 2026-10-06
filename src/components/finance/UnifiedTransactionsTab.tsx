import React, { useState, useMemo } from 'react';
import { Project } from '../../types';
import { FinancialAnalyticsService } from '../../services/financialAnalyticsService';
import { FinancialPeriodFilter } from '../../domain/finance/types';
import { TransactionTable } from './TransactionTable';
import { formatRupiah } from '../../engine/formulaEngine';

interface UnifiedTransactionsTabProps {
  currentProject: Project | null;
  onNavigateSubTab?: (tab: string) => void;
}

export const UnifiedTransactionsTab: React.FC<UnifiedTransactionsTabProps> = ({
  currentProject,
  onNavigateSubTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'RECEIVABLE' | 'PAYABLE'>('ALL');
  const [periodFilter, setPeriodFilter] = useState<FinancialPeriodFilter>('all');

  const projectId = currentProject?.id || 'global';
  const analytics = useMemo(() => new FinancialAnalyticsService(projectId), [projectId]);

  const transactionsData = useMemo(() => {
    return analytics.getTransactions({
      type: typeFilter,
      searchQuery,
      periodFilter,
      limit: 100,
    });
  }, [analytics, typeFilter, searchQuery, periodFilter]);

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
              Buku Besar & Mutasi Transaksi Finansial
            </h2>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
              Log terpusat seluruh pergerakan kas masuk, pembayaran invoice, pengeluaran proyek, dan komitmen hutang.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', backgroundColor: '#DCFCE7', padding: '4px 10px', borderRadius: '6px' }}>
              Total Masuk: {formatRupiah(transactionsData.totalIncome)}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', backgroundColor: '#FEE2E2', padding: '4px 10px', borderRadius: '6px' }}>
              Total Keluar: {formatRupiah(transactionsData.totalExpense)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
        }}
      >
        <TransactionTable
          transactions={transactionsData.transactions}
          totalCount={transactionsData.totalCount}
          totalIncome={transactionsData.totalIncome}
          totalExpense={transactionsData.totalExpense}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          periodFilter={periodFilter}
          onPeriodFilterChange={setPeriodFilter}
          onNavigateToSource={(source) => {
            if (onNavigateSubTab) {
              if (source === 'INVOICE') onNavigateSubTab('invoices');
              else if (source === 'PAYMENT') onNavigateSubTab('payments');
              else if (source === 'EXPENSE') onNavigateSubTab('expenses');
              else if (source === 'TERMIN') onNavigateSubTab('terms');
            }
          }}
        />
      </div>
    </div>
  );
};

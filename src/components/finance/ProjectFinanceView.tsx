import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Layers,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Scale,
  FileText,
  Clock,
  Wallet,
} from 'lucide-react';
import { Project, RabItem, Company } from '../../types';
import { ProjectFinanceRepository } from '../../domain/finance/repository';
import { Termin, Invoice, Payment, Expense } from '../../domain/finance/types';
import { FinanceOverviewTab } from './FinanceOverviewTab';
import { TerminManagementTab } from './TerminManagementTab';
import { InvoiceManagementTab } from './InvoiceManagementTab';
import { PaymentTrackingTab } from './PaymentTrackingTab';
import { ExpenseTrackingTab } from './ExpenseTrackingTab';
import { CashFlowProfitTab } from './CashFlowProfitTab';
import { BudgetVsActualTab } from './BudgetVsActualTab';
import { UnifiedTransactionsTab } from './UnifiedTransactionsTab';
import { FinancialReportsTab } from './FinancialReportsTab';

export type FinanceSubTab =
  | 'overview'
  | 'cashflow'
  | 'budget'
  | 'terms'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'transactions'
  | 'reports';

export interface ProjectFinanceViewProps {
  currentProject: Project | null;
  projects?: Project[];
  rabItems?: RabItem[];
  company?: Company;
  initialTab?: FinanceSubTab;
  onNavigateToTab?: (tab: string, projectId?: string | null) => void;
}

export const ProjectFinanceView: React.FC<ProjectFinanceViewProps> = ({
  currentProject,
  projects = [],
  rabItems = [],
  company,
  initialTab = 'overview',
  onNavigateToTab,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<FinanceSubTab>(initialTab);
  const [targetInvoiceForPayment, setTargetInvoiceForPayment] = useState<Invoice | null>(null);

  const projectId = currentProject?.id || 'global';
  const repo = useMemo(() => new ProjectFinanceRepository(projectId), [projectId]);

  // Local state synced from repository
  const [terms, setTerms] = useState<Termin[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const refreshData = () => {
    repo.reload();
    setTerms(repo.getTerminList());
    setInvoices(repo.getInvoiceList());
    setPayments(repo.getPaymentList());
    setExpenses(repo.getExpenseList());
  };

  useEffect(() => {
    refreshData();
  }, [repo, projectId]);

  useEffect(() => {
    if (initialTab && initialTab !== activeSubTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  // Derive Contract Value and Estimated RAB Cost
  const totalProjectRab = useMemo(() => {
    return rabItems.reduce((acc, item) => acc + (Number(item.volume) || 0) * (Number(item.unitPrice) || 0), 0);
  }, [rabItems]);

  const contractValueFromProject = useMemo(() => {
    if (currentProject?.costSummary?.grandTotal && currentProject.costSummary.grandTotal > 0) {
      return currentProject.costSummary.grandTotal;
    }
    return totalProjectRab > 0 ? totalProjectRab : 0;
  }, [currentProject, totalProjectRab]);

  const summary = useMemo(() => {
    return repo.calculateFinanceSummary(contractValueFromProject, totalProjectRab);
  }, [repo, contractValueFromProject, totalProjectRab, terms, invoices, payments, expenses]);

  // Handlers
  const handleSaveTermin = (terminData: any) => {
    repo.saveTermin(terminData);
    refreshData();
  };

  const handleDeleteTermin = (id: string) => {
    repo.deleteTermin(id);
    refreshData();
  };

  const handleSaveInvoice = (invoiceData: any) => {
    repo.saveInvoice(invoiceData);
    refreshData();
  };

  const handleDeleteInvoice = (id: string) => {
    repo.deleteInvoice(id);
    refreshData();
  };

  const handleSavePayment = (paymentData: any) => {
    repo.savePayment(paymentData);
    refreshData();
  };

  const handleDeletePayment = (id: string) => {
    repo.deletePayment(id);
    refreshData();
  };

  const handleSaveExpense = (expenseData: any) => {
    repo.saveExpense(expenseData);
    refreshData();
  };

  const handleDeleteExpense = (id: string) => {
    repo.deleteExpense(id);
    refreshData();
  };

  const handleCreateInvoiceFromTermin = (termin: Termin) => {
    setActiveSubTab('invoices');
  };

  const handleOpenRecordPaymentForInvoice = (inv: Invoice) => {
    setTargetInvoiceForPayment(inv);
    setActiveSubTab('payments');
  };

  const subNavTabs: Array<{ id: FinanceSubTab; label: string; icon: React.ComponentType<{ size?: number; color?: string }>; count?: number }> = [
    { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
    { id: 'cashflow', label: 'Arus Kas & Forecast', icon: TrendingUp },
    { id: 'budget', label: 'Budget vs Actual', icon: Scale },
    { id: 'terms', label: 'Termin & Penagihan', icon: Layers, count: terms.length },
    { id: 'invoices', label: 'Invoice', icon: Receipt, count: invoices.length },
    { id: 'payments', label: 'Pemasukan', icon: ArrowDownLeft, count: payments.length },
    { id: 'expenses', label: 'Pengeluaran', icon: ArrowUpRight, count: expenses.length },
    { id: 'transactions', label: 'Log Transaksi', icon: Clock },
    { id: 'reports', label: 'Laporan', icon: FileText },
  ];

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Navigation Sub-Tabs Bar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
        }}
      >
        {subNavTabs.map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? '#2563EB' : 'transparent',
                color: isActive ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 120ms ease',
              }}
            >
              <IconComp size={14} color={isActive ? '#FFFFFF' : '#64748B'} />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 750,
                    padding: '1px 5px',
                    borderRadius: '999px',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : '#F1F5F9',
                    color: isActive ? '#FFFFFF' : '#64748B',
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Tab Content View */}
      {activeSubTab === 'overview' && (
        <FinanceOverviewTab
          currentProject={currentProject}
          summary={summary}
          terms={terms}
          invoices={invoices}
          payments={payments}
          expenses={expenses}
          rabItems={rabItems}
          onNavigateSubTab={setActiveSubTab}
          onOpenCreateTermin={() => setActiveSubTab('terms')}
          onOpenCreateInvoice={() => setActiveSubTab('invoices')}
          onOpenRecordPayment={() => setActiveSubTab('payments')}
          onOpenAddExpense={() => setActiveSubTab('expenses')}
        />
      )}

      {activeSubTab === 'cashflow' && (
        <CashFlowProfitTab
          currentProject={currentProject}
          summary={summary}
          payments={payments}
          expenses={expenses}
          terms={terms}
          invoices={invoices}
          rabItems={rabItems}
        />
      )}

      {activeSubTab === 'budget' && (
        <BudgetVsActualTab
          currentProject={currentProject}
          rabItems={rabItems}
        />
      )}

      {activeSubTab === 'terms' && (
        <TerminManagementTab
          currentProject={currentProject}
          terms={terms}
          contractValue={summary.contractValue}
          totalAllocatedPercentage={summary.totalAllocatedPercentage}
          onSaveTermin={handleSaveTermin}
          onDeleteTermin={handleDeleteTermin}
          onCreateInvoiceFromTermin={handleCreateInvoiceFromTermin}
        />
      )}

      {activeSubTab === 'invoices' && (
        <InvoiceManagementTab
          currentProject={currentProject}
          company={company}
          invoices={invoices}
          terms={terms}
          onSaveInvoice={handleSaveInvoice}
          onDeleteInvoice={handleDeleteInvoice}
          onOpenRecordPaymentForInvoice={handleOpenRecordPaymentForInvoice}
        />
      )}

      {activeSubTab === 'payments' && (
        <PaymentTrackingTab
          currentProject={currentProject}
          payments={payments}
          invoices={invoices}
          prefilledInvoice={targetInvoiceForPayment}
          onSavePayment={handleSavePayment}
          onDeletePayment={handleDeletePayment}
        />
      )}

      {activeSubTab === 'expenses' && (
        <ExpenseTrackingTab
          currentProject={currentProject}
          expenses={expenses}
          onSaveExpense={handleSaveExpense}
          onDeleteExpense={handleDeleteExpense}
        />
      )}

      {activeSubTab === 'transactions' && (
        <UnifiedTransactionsTab
          currentProject={currentProject}
          onNavigateSubTab={(tab) => setActiveSubTab(tab as FinanceSubTab)}
        />
      )}

      {activeSubTab === 'reports' && (
        <FinancialReportsTab
          currentProject={currentProject}
          rabItems={rabItems}
          company={company}
        />
      )}
    </div>
  );
};

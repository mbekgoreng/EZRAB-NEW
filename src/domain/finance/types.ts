/**
 * EZRAB Project Finance — Domain Types
 * Phase 8 Architecture
 */

export type TerminStatus =
  | 'PLANNED'
  | 'READY_TO_INVOICE'
  | 'INVOICED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export type PaymentMethod =
  | 'Transfer'
  | 'Cash'
  | 'Giro'
  | 'Other';

export type ExpenseCategory =
  | 'Material'
  | 'Tenaga Kerja'
  | 'Subkon'
  | 'Alat'
  | 'Transport'
  | 'Operasional'
  | 'Pajak'
  | 'Lainnya';

export interface Termin {
  id: string;
  projectId: string;
  sequence: number;
  name: string;
  percentage: number;
  amount: number;
  triggerDescription?: string;
  dueDate?: string;
  status: TerminStatus;
  notes?: string;
  invoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface Invoice {
  id: string;
  projectId: string;
  terminId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  projectName: string;
  projectLocation?: string;
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  deductions?: number; // e.g. Down Payment Amortization or Retention
  total: number;
  paidAmount: number;
  outstandingAmount: number;
  status: InvoiceStatus;
  notes?: string;
  paymentInstructions?: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountHolder?: string;
  items?: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  projectId: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  receivedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  projectId: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  vendor?: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFinanceSummary {
  contractValue: number;
  estimatedCost: number;
  totalInvoiced: number;
  totalPaid: number;
  totalReceivable: number;
  overdueReceivable: number;
  totalExpenses: number;
  netCashFlow: number;
  estimatedProfit: number;
  actualProfit: number;
  profitMarginPercent: number;
  isCostDataComplete: boolean;
  termsCount: number;
  invoicesCount: number;
  paymentsCount: number;
  expensesCount: number;
  totalAllocatedPercentage: number;
}

export interface ProjectFinanceConfig {
  contractValueOverride?: number;
  bankName?: string;
  bankAccount?: string;
  bankAccountHolder?: string;
  defaultTaxPercent?: number;
  invoicePrefix?: string;
}

// ---------------------------------------------------------------------------
// Construction Financial Analytics Models (Section 40)
// ---------------------------------------------------------------------------

export type FinancialPeriodFilter =
  | 'this_month'
  | '3_months'
  | '6_months'
  | 'ytd'
  | 'all'
  | 'custom';

export type FinancialGranularity = 'weekly' | 'monthly' | 'quarterly';

export type FinancialDataState = 'LOADING' | 'READY' | 'EMPTY' | 'PARTIAL' | 'ERROR';

export type FinancialTransactionType = 'INCOME' | 'EXPENSE' | 'RECEIVABLE' | 'PAYABLE';

export type FinancialTransactionStatus =
  | 'COMPLETED'
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'DRAFT';

export interface FinancialTransaction {
  id: string;
  projectId: string;
  date: string;
  type: FinancialTransactionType;
  category: string;
  description: string;
  vendorOrClient?: string;
  amount: number;
  status: FinancialTransactionStatus;
  reference?: string;
  paymentMethod?: string;
  source: 'INVOICE' | 'PAYMENT' | 'EXPENSE' | 'TERMIN' | 'PURCHASE_ORDER' | 'MANUAL';
  sourceId?: string;
  notes?: string;
  createdAt: string;
}

export interface CashFlowPoint {
  periodKey: string;
  periodLabel: string;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  isForecast: boolean;
  breakdown?: {
    material: number;
    labor: number;
    subkon: number;
    equipment: number;
    overhead: number;
    other: number;
  };
}

export interface BudgetActualPoint {
  groupId: string;
  groupName: string;
  budgetAmount: number;
  actualAmount: number;
  committedAmount: number;
  varianceAmount: number; // actual - budget
  variancePercent: number; // ((actual - budget) / budget) * 100
  status: 'UNDER_BUDGET' | 'ON_TRACK' | 'OVER_BUDGET';
}

export interface CostBreakdownItem {
  category: ExpenseCategory | string;
  budgetAmount: number;
  actualAmount: number;
  committedAmount: number;
  percentageOfTotal: number;
}

export interface ProfitabilitySummary {
  contractValue: number;
  isContractAvailable: boolean;
  totalBudget: number;
  actualCost: number;
  committedCost: number;
  projectedTotalCost: number;
  currentProfit: number; // contractValue - actualCost
  currentMarginPercent: number;
  projectedProfit: number | null; // contractValue - projectedTotalCost (null if forecast not available)
  projectedMarginPercent: number | null;
  status: 'AVAILABLE' | 'PARTIAL' | 'NO_DATA';
}

export interface ReceivableItem {
  id: string;
  type: 'INVOICE' | 'TERMIN';
  identifier: string;
  title: string;
  clientName: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: InvoiceStatus | TerminStatus;
  isOverdue: boolean;
  overdueDays: number;
}

export interface PayableItem {
  id: string;
  type: 'EXPENSE' | 'PURCHASE_ORDER';
  identifier: string;
  title: string;
  vendorName: string;
  date: string;
  dueDate?: string;
  amount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: 'PAID' | 'COMMITTED' | 'OVERDUE' | 'PARTIALLY_PAID';
  isOverdue: boolean;
  category: ExpenseCategory | string;
}

export interface FinancialForecast {
  period: string;
  projectedCashIn: number;
  projectedCashOut: number;
  projectedNetCashFlow: number;
  projectedCumulativeCashFlow: number;
  source: 'DETERMINISTIC';
  basisDescription: string;
}

export interface FinancialAlert {
  id: string;
  code:
    | 'OVER_BUDGET'
    | 'OVERDUE_RECEIVABLE'
    | 'OVERDUE_PAYABLE'
    | 'NEGATIVE_FORECAST_CASH'
    | 'HIGH_COMMITTED_COST'
    | 'LOW_CASH_POSITION';
  title: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  source: string;
  value?: number;
  threshold?: number;
  timestamp: string;
}

export interface FinancialSummaryKPI {
  contractValue: number;
  isContractAvailable: boolean;
  totalBudget: number;
  isBudgetAvailable: boolean;
  actualCost: number;
  cashIn: number;
  cashOut: number;
  receivableOutstanding: number;
  payableOutstanding: number;
  totalOutstanding: number;
  committedCost: number;
  currentProfit: number;
  profitMarginPercent: number;
  projectedProfit: number | null;
  projectedMarginPercent: number | null;
  activeAlerts: FinancialAlert[];
  dataState: FinancialDataState;
}


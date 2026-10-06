/**
 * EZRAB Project Finance — Repository Engine
 * Project-scoped persistence & financial integrity engine
 */

import {
  Termin,
  Invoice,
  Payment,
  Expense,
  ProjectFinanceSummary,
  ProjectFinanceConfig,
  TerminStatus,
  InvoiceStatus,
} from './types';

export class ProjectFinanceRepository {
  private terms: Termin[] = [];
  private invoices: Invoice[] = [];
  private payments: Payment[] = [];
  private expenses: Expense[] = [];
  private config: ProjectFinanceConfig = {};

  constructor(private readonly projectId: string) {
    this.loadFromStorage();
  }

  // ---------------------------------------------------------------------------
  // Storage Keys & Core IO
  // ---------------------------------------------------------------------------
  private getStorageKey(type: 'terms' | 'invoices' | 'payments' | 'expenses' | 'config'): string {
    const id = this.projectId || 'global';
    return `ezrab:project:${id}:${type}`;
  }

  public reload(): void {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined' || !this.projectId) return;

    try {
      const termsRaw = localStorage.getItem(this.getStorageKey('terms'));
      const invoicesRaw = localStorage.getItem(this.getStorageKey('invoices'));
      const paymentsRaw = localStorage.getItem(this.getStorageKey('payments'));
      const expensesRaw = localStorage.getItem(this.getStorageKey('expenses'));
      const configRaw = localStorage.getItem(this.getStorageKey('config'));

      this.terms = termsRaw ? JSON.parse(termsRaw) : [];
      this.invoices = invoicesRaw ? JSON.parse(invoicesRaw) : [];
      this.payments = paymentsRaw ? JSON.parse(paymentsRaw) : [];
      this.expenses = expensesRaw ? JSON.parse(expensesRaw) : [];
      this.config = configRaw ? JSON.parse(configRaw) : {};
    } catch {
      this.terms = [];
      this.invoices = [];
      this.payments = [];
      this.expenses = [];
      this.config = {};
    }
  }

  private persist(type: 'terms' | 'invoices' | 'payments' | 'expenses' | 'config'): void {
    if (typeof localStorage === 'undefined' || !this.projectId) return;

    try {
      if (type === 'terms') {
        localStorage.setItem(this.getStorageKey('terms'), JSON.stringify(this.terms));
      } else if (type === 'invoices') {
        localStorage.setItem(this.getStorageKey('invoices'), JSON.stringify(this.invoices));
      } else if (type === 'payments') {
        localStorage.setItem(this.getStorageKey('payments'), JSON.stringify(this.payments));
      } else if (type === 'expenses') {
        localStorage.setItem(this.getStorageKey('expenses'), JSON.stringify(this.expenses));
      } else if (type === 'config') {
        localStorage.setItem(this.getStorageKey('config'), JSON.stringify(this.config));
      }
    } catch (err) {
      console.warn(`[ProjectFinanceRepository] Failed to persist ${type}:`, err);
    }
  }

  public clearAll(): void {
    this.terms = [];
    this.invoices = [];
    this.payments = [];
    this.expenses = [];
    this.config = {};

    if (typeof localStorage !== 'undefined' && this.projectId) {
      try {
        localStorage.removeItem(this.getStorageKey('terms'));
        localStorage.removeItem(this.getStorageKey('invoices'));
        localStorage.removeItem(this.getStorageKey('payments'));
        localStorage.removeItem(this.getStorageKey('expenses'));
        localStorage.removeItem(this.getStorageKey('config'));
      } catch {
        // ignore
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Finance Config & Contract Value
  // ---------------------------------------------------------------------------
  public getConfig(): ProjectFinanceConfig {
    return { ...this.config };
  }

  public saveConfig(config: Partial<ProjectFinanceConfig>): void {
    this.config = { ...this.config, ...config };
    this.persist('config');
  }

  // ---------------------------------------------------------------------------
  // Termin Operations
  // ---------------------------------------------------------------------------
  public getTerminList(): Termin[] {
    return [...this.terms].sort((a, b) => a.sequence - b.sequence);
  }

  public getTermin(id: string): Termin | undefined {
    return this.terms.find((t) => t.id === id);
  }

  public saveTermin(termin: Omit<Termin, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'sequence' | 'status' | 'name'> & {
    id?: string;
    projectId?: string;
    sequence?: number;
    status?: TerminStatus;
    name?: string;
    title?: string;
  }): Termin {
    if (termin.percentage < 0 || termin.percentage > 100) {
      throw new Error('Persentase termin harus berada di antara 0% hingga 100%.');
    }
    if (termin.amount < 0) {
      throw new Error('Nominal termin tidak boleh negatif.');
    }

    const now = new Date().toISOString();
    const id = termin.id || `term-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const existingIndex = this.terms.findIndex((t) => t.id === id);

    const record: Termin = {
      id,
      projectId: this.projectId,
      sequence: termin.sequence || (this.terms.length + 1),
      name: (termin.name || (termin as any).title || '').trim() || `Termin ${termin.sequence || (this.terms.length + 1)}`,
      percentage: Number(termin.percentage),
      amount: Number(termin.amount),
      triggerDescription: termin.triggerDescription?.trim(),
      dueDate: termin.dueDate,
      status: termin.status || 'PLANNED',
      notes: termin.notes?.trim(),
      invoiceId: termin.invoiceId,
      createdAt: existingIndex >= 0 ? this.terms[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      this.terms[existingIndex] = record;
    } else {
      this.terms.push(record);
    }

    this.persist('terms');
    return record;
  }

  public deleteTermin(id: string): void {
    this.terms = this.terms.filter((t) => t.id !== id);
    this.persist('terms');
  }

  public getTotalAllocatedPercentage(): number {
    return this.terms
      .filter((t) => t.status !== 'CANCELLED')
      .reduce((sum, t) => sum + (Number(t.percentage) || 0), 0);
  }

  // ---------------------------------------------------------------------------
  // Invoice Operations
  // ---------------------------------------------------------------------------
  public getInvoiceList(): Invoice[] {
    return [...this.invoices].sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
  }

  public getInvoice(id: string): Invoice | undefined {
    return this.invoices.find((i) => i.id === id);
  }

  public generateNextInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const prefix = this.config.invoicePrefix || 'INV';
    const count = this.invoices.length + 1;
    const padded = String(count).padStart(3, '0');
    return `${prefix}-${year}-${padded}`;
  }

  public saveInvoice(invoice: Omit<Invoice, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'paidAmount' | 'outstandingAmount'> & { id?: string; projectId?: string; paidAmount?: number; outstandingAmount?: number }): Invoice {
    const now = new Date().toISOString();
    const id = invoice.id || `inv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const existingIndex = this.invoices.findIndex((i) => i.id === id);

    // Uniqueness check for invoiceNumber across this project
    const dup = this.invoices.find((i) => i.id !== id && i.invoiceNumber.trim().toLowerCase() === invoice.invoiceNumber.trim().toLowerCase());
    if (dup) {
      throw new Error(`Nomor invoice "${invoice.invoiceNumber}" sudah digunakan pada proyek ini.`);
    }

    // Calculate paid amount from recorded payments
    const paymentsForInvoice = this.payments.filter((p) => p.invoiceId === id);
    const paidAmount = paymentsForInvoice.reduce((sum, p) => sum + p.amount, 0);
    const total = Number(invoice.total);
    const outstandingAmount = Math.max(0, total - paidAmount);

    let resolvedStatus: InvoiceStatus = invoice.status || 'DRAFT';
    if (resolvedStatus !== 'CANCELLED' && resolvedStatus !== 'DRAFT') {
      if (paidAmount >= total && total > 0) {
        resolvedStatus = 'PAID';
      } else if (paidAmount > 0) {
        resolvedStatus = 'PARTIALLY_PAID';
      } else {
        const isOverdue = invoice.dueDate && new Date(invoice.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
        resolvedStatus = isOverdue ? 'OVERDUE' : 'ISSUED';
      }
    }

    const record: Invoice = {
      ...invoice,
      id,
      projectId: this.projectId,
      invoiceNumber: invoice.invoiceNumber.trim(),
      total,
      paidAmount,
      outstandingAmount,
      status: resolvedStatus,
      createdAt: existingIndex >= 0 ? this.invoices[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      this.invoices[existingIndex] = record;
    } else {
      this.invoices.push(record);
    }

    // If linked to termin, update termin status and link
    if (record.terminId) {
      const termIdx = this.terms.findIndex((t) => t.id === record.terminId);
      if (termIdx >= 0) {
        const term = this.terms[termIdx];
        let termStatus: TerminStatus = term.status;
        if (record.status === 'PAID') termStatus = 'PAID';
        else if (record.status === 'PARTIALLY_PAID') termStatus = 'PARTIALLY_PAID';
        else if (record.status === 'ISSUED') termStatus = 'INVOICED';
        else if (record.status === 'OVERDUE') termStatus = 'OVERDUE';
        else if (record.status === 'DRAFT') termStatus = 'READY_TO_INVOICE';
        else if (record.status === 'CANCELLED') termStatus = 'PLANNED';

        this.terms[termIdx] = {
          ...term,
          invoiceId: record.id,
          status: termStatus,
          updatedAt: now,
        };
        this.persist('terms');
      }
    }

    this.persist('invoices');
    return record;
  }

  public deleteInvoice(id: string): void {
    const inv = this.getInvoice(id);
    if (inv?.terminId) {
      const termIdx = this.terms.findIndex((t) => t.id === inv.terminId);
      if (termIdx >= 0) {
        this.terms[termIdx] = {
          ...this.terms[termIdx],
          invoiceId: undefined,
          status: 'PLANNED',
          updatedAt: new Date().toISOString(),
        };
        this.persist('terms');
      }
    }

    // Also remove associated payments
    this.payments = this.payments.filter((p) => p.invoiceId !== id);
    this.persist('payments');

    this.invoices = this.invoices.filter((i) => i.id !== id);
    this.persist('invoices');
  }

  // ---------------------------------------------------------------------------
  // Payment Operations (Pemasukan)
  // ---------------------------------------------------------------------------
  public getPaymentList(): Payment[] {
    return [...this.payments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  }

  public savePayment(payment: Omit<Payment, 'id' | 'projectId' | 'createdAt' | 'updatedAt'> & { id?: string; projectId?: string }): Payment {
    if (payment.amount <= 0) {
      throw new Error('Nominal pembayaran harus lebih besar dari 0.');
    }

    const targetInvoice = this.getInvoice(payment.invoiceId);
    if (!targetInvoice) {
      throw new Error('Invoice yang dituju tidak ditemukan.');
    }

    const now = new Date().toISOString();
    const id = payment.id || `pay-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const existingIndex = this.payments.findIndex((p) => p.id === id);

    // Calculate current paid excluding this payment if updating
    const otherPayments = this.payments.filter((p) => p.invoiceId === payment.invoiceId && p.id !== id);
    const existingPaid = otherPayments.reduce((sum, p) => sum + p.amount, 0);
    const newTotalPaid = existingPaid + payment.amount;

    if (newTotalPaid > targetInvoice.total) {
      const remainingAllowed = Math.max(0, targetInvoice.total - existingPaid);
      throw new Error(
        `Nominal pembayaran (Rp ${payment.amount.toLocaleString('id-ID')}) melebihi sisa tagihan invoice (Rp ${remainingAllowed.toLocaleString('id-ID')}).`
      );
    }

    const record: Payment = {
      id,
      projectId: this.projectId,
      invoiceId: payment.invoiceId,
      paymentDate: payment.paymentDate || now.split('T')[0],
      amount: Number(payment.amount),
      paymentMethod: payment.paymentMethod || 'Transfer',
      referenceNumber: payment.referenceNumber?.trim(),
      receivedBy: payment.receivedBy?.trim(),
      notes: payment.notes?.trim(),
      createdAt: existingIndex >= 0 ? this.payments[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      this.payments[existingIndex] = record;
    } else {
      this.payments.push(record);
    }

    this.persist('payments');

    // Refresh and sync invoice status
    this.syncInvoiceAfterPayment(payment.invoiceId);

    return record;
  }

  private syncInvoiceAfterPayment(invoiceId: string): void {
    const invIndex = this.invoices.findIndex((i) => i.id === invoiceId);
    if (invIndex < 0) return;

    const inv = this.invoices[invIndex];
    const payments = this.payments.filter((p) => p.invoiceId === invoiceId);
    const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const outstandingAmount = Math.max(0, inv.total - paidAmount);

    let resolvedStatus: InvoiceStatus = inv.status;
    if (inv.status !== 'CANCELLED') {
      if (paidAmount >= inv.total && inv.total > 0) {
        resolvedStatus = 'PAID';
      } else if (paidAmount > 0) {
        resolvedStatus = 'PARTIALLY_PAID';
      } else {
        const isOverdue = inv.dueDate && new Date(inv.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
        resolvedStatus = isOverdue ? 'OVERDUE' : (inv.status === 'DRAFT' ? 'DRAFT' : 'ISSUED');
      }
    }

    const updatedInvoice: Invoice = {
      ...inv,
      paidAmount,
      outstandingAmount,
      status: resolvedStatus,
      updatedAt: new Date().toISOString(),
    };
    this.invoices[invIndex] = updatedInvoice;
    this.persist('invoices');

    // Sync linked Termin
    if (inv.terminId) {
      const termIdx = this.terms.findIndex((t) => t.id === inv.terminId);
      if (termIdx >= 0) {
        let termStatus: TerminStatus = 'PLANNED';
        if (resolvedStatus === 'PAID') termStatus = 'PAID';
        else if (resolvedStatus === 'PARTIALLY_PAID') termStatus = 'PARTIALLY_PAID';
        else if (resolvedStatus === 'ISSUED') termStatus = 'INVOICED';
        else if (resolvedStatus === 'OVERDUE') termStatus = 'OVERDUE';
        else if (resolvedStatus === 'DRAFT') termStatus = 'READY_TO_INVOICE';

        this.terms[termIdx] = {
          ...this.terms[termIdx],
          status: termStatus,
          updatedAt: new Date().toISOString(),
        };
        this.persist('terms');
      }
    }
  }

  public deletePayment(id: string): void {
    const p = this.payments.find((item) => item.id === id);
    this.payments = this.payments.filter((item) => item.id !== id);
    this.persist('payments');

    if (p) {
      this.syncInvoiceAfterPayment(p.invoiceId);
    }
  }

  // ---------------------------------------------------------------------------
  // Expense Operations (Pengeluaran)
  // ---------------------------------------------------------------------------
  public getExpenseList(): Expense[] {
    return [...this.expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public saveExpense(expense: Omit<Expense, 'id' | 'projectId' | 'createdAt' | 'updatedAt'> & { id?: string; projectId?: string }): Expense {
    if (expense.amount <= 0) {
      throw new Error('Nominal pengeluaran harus lebih besar dari 0.');
    }

    const now = new Date().toISOString();
    const id = expense.id || `exp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const existingIndex = this.expenses.findIndex((e) => e.id === id);

    const record: Expense = {
      id,
      projectId: this.projectId,
      date: expense.date || now.split('T')[0],
      category: expense.category || 'Lainnya',
      description: expense.description.trim() || 'Pengeluaran Proyek',
      amount: Number(expense.amount),
      vendor: expense.vendor?.trim(),
      paymentMethod: expense.paymentMethod || 'Transfer',
      reference: expense.reference?.trim(),
      notes: expense.notes?.trim(),
      createdAt: existingIndex >= 0 ? this.expenses[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      this.expenses[existingIndex] = record;
    } else {
      this.expenses.push(record);
    }

    this.persist('expenses');
    return record;
  }

  public deleteExpense(id: string): void {
    this.expenses = this.expenses.filter((e) => e.id !== id);
    this.persist('expenses');
  }

  // ---------------------------------------------------------------------------
  // Finance Summary Calculation
  // ---------------------------------------------------------------------------
  public calculateFinanceSummary(
    contractValueFromProject: number,
    estimatedCostFromRab: number
  ): ProjectFinanceSummary {
    const fallbackContractValue = (contractValueFromProject && contractValueFromProject > 0)
      ? contractValueFromProject
      : (estimatedCostFromRab || 0);

    const effectiveContractValue =
      this.config.contractValueOverride !== undefined && this.config.contractValueOverride > 0
        ? this.config.contractValueOverride
        : fallbackContractValue;

    const nonCancelledInvoices = this.invoices.filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT');
    const totalInvoiced = nonCancelledInvoices.reduce((sum, i) => sum + i.total, 0);

    const totalPaid = this.payments.reduce((sum, p) => sum + p.amount, 0);
    const totalReceivable = Math.max(0, totalInvoiced - totalPaid);

    const todayMs = new Date().setHours(0, 0, 0, 0);
    const overdueReceivable = nonCancelledInvoices
      .filter((i) => i.dueDate && new Date(i.dueDate).getTime() < todayMs && i.outstandingAmount > 0)
      .reduce((sum, i) => sum + i.outstandingAmount, 0);

    const totalExpenses = this.expenses.reduce((sum, e) => sum + e.amount, 0);
    const netCashFlow = totalPaid - totalExpenses;

    const estimatedProfit = Math.max(0, effectiveContractValue - estimatedCostFromRab);
    const actualProfit = totalPaid - totalExpenses;
    const profitMarginPercent = effectiveContractValue > 0
      ? (estimatedProfit / effectiveContractValue) * 100
      : 0;

    const totalAllocatedPercentage = this.getTotalAllocatedPercentage();
    const isCostDataComplete = this.expenses.length > 0;

    return {
      contractValue: effectiveContractValue,
      estimatedCost: estimatedCostFromRab,
      totalInvoiced,
      totalPaid,
      totalReceivable,
      overdueReceivable,
      totalExpenses,
      netCashFlow,
      estimatedProfit,
      actualProfit,
      profitMarginPercent,
      isCostDataComplete,
      termsCount: this.terms.length,
      invoicesCount: this.invoices.length,
      paymentsCount: this.payments.length,
      expensesCount: this.expenses.length,
      totalAllocatedPercentage,
    };
  }

  // ---------------------------------------------------------------------------
  // Convenience Aliases & Validation Helpers
  // ---------------------------------------------------------------------------
  public getTerms(): Termin[] {
    return this.getTerminList();
  }

  public getTermById(id: string): Termin | undefined {
    return this.getTermin(id);
  }

  public saveTerm(termin: Omit<Termin, 'id' | 'projectId' | 'createdAt' | 'updatedAt'> & { id?: string; projectId?: string }): Termin {
    return this.saveTermin(termin);
  }

  public deleteTerm(id: string): void {
    this.deleteTermin(id);
  }

  public getTotalTermPercentage(): number {
    return this.getTotalAllocatedPercentage();
  }

  public getInvoices(): Invoice[] {
    return this.getInvoiceList();
  }

  public getInvoiceById(id: string): Invoice | undefined {
    return this.getInvoice(id);
  }

  public isInvoiceNumberUnique(invoiceNumber: string, excludeId?: string): boolean {
    return !this.invoices.some(
      (i) => i.id !== excludeId && i.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()
    );
  }

  public validatePayment(invoiceId: string, amount: number): { valid: boolean; error?: string } {
    const inv = this.getInvoice(invoiceId);
    if (!inv) return { valid: false, error: 'Invoice tidak ditemukan.' };
    const otherPayments = this.payments.filter((p) => p.invoiceId === invoiceId);
    const currentPaid = otherPayments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, inv.total - currentPaid);
    if (amount > remaining) {
      return {
        valid: false,
        error: `Nominal pembayaran (Rp ${amount.toLocaleString('id-ID')}) melebihi sisa tagihan invoice (Rp ${remaining.toLocaleString('id-ID')}).`,
      };
    }
    return { valid: true };
  }

  public linkInvoiceToTermin(terminId: string, invoiceId: string): void {
    const termIdx = this.terms.findIndex((t) => t.id === terminId);
    const inv = this.getInvoice(invoiceId);
    if (termIdx >= 0 && inv) {
      let termStatus: TerminStatus = 'INVOICED';
      if (inv.status === 'PAID') termStatus = 'PAID';
      else if (inv.status === 'PARTIALLY_PAID') termStatus = 'PARTIALLY_PAID';
      else if (inv.status === 'OVERDUE') termStatus = 'OVERDUE';
      else if (inv.status === 'DRAFT') termStatus = 'READY_TO_INVOICE';

      this.terms[termIdx] = {
        ...this.terms[termIdx],
        invoiceId,
        status: termStatus,
        updatedAt: new Date().toISOString(),
      };
      this.persist('terms');
    }
  }

  public getPayments(): Payment[] {
    return this.getPaymentList();
  }

  public getExpenses(): Expense[] {
    return this.getExpenseList();
  }

  public getSummary(contractValueFromProject?: number, estimatedCostFromRab?: number): ProjectFinanceSummary {
    return this.calculateFinanceSummary(contractValueFromProject || 0, estimatedCostFromRab || 0);
  }
}

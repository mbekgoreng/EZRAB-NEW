/**
 * EZRAB Project Finance — Central Deterministic Financial Analytics Service
 * 
 * Authoritative engine for:
 * - Financial Summary & KPIs
 * - Actual vs Forecast Cash Flow with granularity (weekly/monthly/quarterly)
 * - Budget vs Actual & Variance by Work Package & Category
 * - Cost Breakdown (Material, Labor, Subcon, Equipment, Overhead, etc.)
 * - Profitability & Margin (Current & Projected)
 * - Receivables & Termin aging
 * - Payables & Committed Cost tracking
 * - Unified Searchable Transactions with source traceability
 * - Deterministic Financial Alerts
 */

import { ProjectFinanceRepository } from '../domain/finance/repository';
import {
  ProjectFinanceSummary,
  FinancialSummaryKPI,
  CashFlowPoint,
  BudgetActualPoint,
  CostBreakdownItem,
  ProfitabilitySummary,
  ReceivableItem,
  PayableItem,
  FinancialTransaction,
  FinancialForecast,
  FinancialAlert,
  FinancialPeriodFilter,
  FinancialGranularity,
  Expense,
  Invoice,
  Payment,
  Termin,
  ExpenseCategory,
} from '../domain/finance/types';
import { Project, RabItem, RABSection } from '../types';

export interface CashFlowOptions {
  granularity?: FinancialGranularity;
  periodFilter?: FinancialPeriodFilter;
  customRange?: { startDate: string; endDate: string };
  includeForecast?: boolean;
}

export interface TransactionFilterOptions {
  type?: 'ALL' | 'INCOME' | 'EXPENSE' | 'RECEIVABLE' | 'PAYABLE';
  category?: string;
  searchQuery?: string;
  periodFilter?: FinancialPeriodFilter;
  customRange?: { startDate: string; endDate: string };
  status?: string;
  limit?: number;
  offset?: number;
}

export class FinancialAnalyticsService {
  private repo: ProjectFinanceRepository;

  constructor(private readonly projectId: string) {
    this.repo = new ProjectFinanceRepository(projectId || 'global');
  }

  public getRepository(): ProjectFinanceRepository {
    return this.repo;
  }

  // ---------------------------------------------------------------------------
  // 1. KPI & Summary Analytics
  // ---------------------------------------------------------------------------
  public getFinancialSummary(
    rabItems: RabItem[] = [],
    project: Project | null = null,
    periodFilter: FinancialPeriodFilter = 'all',
    customRange?: { startDate: string; endDate: string },
    options: { includeAlerts?: boolean } = { includeAlerts: true }
  ): FinancialSummaryKPI {
    const config = this.repo.getConfig();
    const terms = this.repo.getTerminList();
    const invoices = this.repo.getInvoiceList();
    const payments = this.repo.getPaymentList();
    const expenses = this.repo.getExpenseList();

    // 1. Resolve Contract Value
    let contractValue = 0;
    let isContractAvailable = false;

    if (config.contractValueOverride !== undefined && config.contractValueOverride > 0) {
      contractValue = config.contractValueOverride;
      isContractAvailable = true;
    } else if (project?.costSummary?.grandTotal && project.costSummary.grandTotal > 0) {
      contractValue = project.costSummary.grandTotal;
      isContractAvailable = true;
    } else if ((project as any)?.contractValue && (project as any).contractValue > 0) {
      contractValue = (project as any).contractValue;
      isContractAvailable = true;
    }

    // 2. Resolve Total Budget / RAB
    const totalRabFromItems = rabItems.reduce(
      (sum, item) => sum + (Number(item.volume) || 0) * (Number(item.unitPrice) || 0),
      0
    );
    const totalBudget = totalRabFromItems > 0
      ? totalRabFromItems
      : (project?.costSummary?.directCost || project?.costSummary?.grandTotal || (isContractAvailable ? contractValue : 0));
    const isBudgetAvailable = totalBudget > 0;

    // Filter payments and expenses based on period if requested
    const filteredPayments = this.filterByDate(payments, (p) => p.paymentDate, periodFilter, customRange);
    const filteredExpenses = this.filterByDate(expenses, (e) => e.date, periodFilter, customRange);

    // 3. Cash In & Cash Out
    const cashIn = filteredPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const cashOut = filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const actualCost = cashOut;

    // 4. Receivables & Invoices (Active / Non-cancelled)
    const validInvoices = invoices.filter((i) => i.status !== 'CANCELLED' && i.status !== 'DRAFT');
    const totalInvoiced = validInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const receivableOutstanding = Math.max(0, totalInvoiced - cashIn);

    // 5. Payables & Committed Costs
    const payableOutstanding = expenses
      .filter((e) => (e as any).status === 'PENDING' || (e as any).status === 'COMMITTED')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const committedCost = actualCost + payableOutstanding;

    // 6. Current Profit & Margin
    let currentProfit = 0;
    let profitMarginPercent = 0;
    let projectedProfit: number | null = null;
    let projectedMarginPercent: number | null = null;

    if (isContractAvailable && contractValue > 0) {
      currentProfit = contractValue - actualCost;
      profitMarginPercent = Math.round((currentProfit / contractValue) * 10000) / 100;

      if (isBudgetAvailable && totalBudget > 0) {
        // Deterministic forecast: Projected Total Cost = Actual Cost + Max(0, Total Budget - Actual Cost)
        const remainingBudgetToSpend = Math.max(0, totalBudget - actualCost);
        const projectedTotalCost = actualCost + remainingBudgetToSpend;
        projectedProfit = contractValue - projectedTotalCost;
        projectedMarginPercent = Math.round((projectedProfit / contractValue) * 10000) / 100;
      }
    }

    // 7. Data State Evaluation
    const totalRecords = terms.length + invoices.length + payments.length + expenses.length;
    let dataState: 'LOADING' | 'READY' | 'EMPTY' | 'PARTIAL' | 'ERROR' = 'READY';
    if (totalRecords === 0 && !isBudgetAvailable && !isContractAvailable) {
      dataState = 'EMPTY';
    } else if (totalRecords < 2 || !isContractAvailable) {
      dataState = 'PARTIAL';
    }

    // 8. Alerts (computed safely without recursion)
    const activeAlerts = options.includeAlerts !== false
      ? this.getFinancialAlertsInternal(totalBudget, actualCost, committedCost, rabItems, project)
      : [];

    return {
      contractValue,
      isContractAvailable,
      totalBudget,
      isBudgetAvailable,
      actualCost,
      cashIn,
      cashOut,
      receivableOutstanding,
      payableOutstanding,
      totalOutstanding: receivableOutstanding + payableOutstanding,
      committedCost,
      currentProfit,
      profitMarginPercent,
      projectedProfit,
      projectedMarginPercent,
      activeAlerts,
      dataState,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Cash Flow Engine (Actual vs Forecast)
  // ---------------------------------------------------------------------------
  public getCashFlow(
    options: CashFlowOptions = {},
    rabItems: RabItem[] = [],
    project: Project | null = null
  ): {
    points: CashFlowPoint[];
    totalActualIn: number;
    totalActualOut: number;
    totalForecastIn: number;
    totalForecastOut: number;
    currentNet: number;
    futureLowestCumulative: number;
    hasNegativeForecast: boolean;
  } {
    const {
      granularity = 'monthly',
      periodFilter = 'all',
      customRange,
      includeForecast = true,
    } = options;

    const payments = this.repo.getPaymentList();
    const expenses = this.repo.getExpenseList();
    const terms = this.repo.getTerminList();

    // Map actual transactions into periodic buckets
    const actualMap: Map<string, { in: number; out: number; breakdown: { material: number; labor: number; subkon: number; equipment: number; overhead: number; other: number } }> = new Map();

    payments.forEach((p) => {
      const pDate = p.paymentDate || new Date().toISOString().substring(0, 10);
      const key = this.formatPeriodKey(pDate, granularity);
      if (!actualMap.has(key)) {
        actualMap.set(key, { in: 0, out: 0, breakdown: { material: 0, labor: 0, subkon: 0, equipment: 0, overhead: 0, other: 0 } });
      }
      actualMap.get(key)!.in += Number(p.amount) || 0;
    });

    expenses.forEach((e) => {
      const eDate = e.date || new Date().toISOString().substring(0, 10);
      const key = this.formatPeriodKey(eDate, granularity);
      if (!actualMap.has(key)) {
        actualMap.set(key, { in: 0, out: 0, breakdown: { material: 0, labor: 0, subkon: 0, equipment: 0, overhead: 0, other: 0 } });
      }
      const val = Number(e.amount) || 0;
      const b = actualMap.get(key)!;
      b.out += val;

      const cat = (e.category || 'Lainnya').toLowerCase();
      if (cat.includes('material') || cat.includes('bahan')) b.breakdown.material += val;
      else if (cat.includes('tenaga') || cat.includes('upah') || cat.includes('labor')) b.breakdown.labor += val;
      else if (cat.includes('subkon') || cat.includes('subcontractor')) b.breakdown.subkon += val;
      else if (cat.includes('alat') || cat.includes('equipment')) b.breakdown.equipment += val;
      else if (cat.includes('operasional') || cat.includes('overhead') || cat.includes('transport')) b.breakdown.overhead += val;
      else b.breakdown.other += val;
    });

    // Sort actual period keys
    const sortedActualKeys = Array.from(actualMap.keys()).sort();

    // Build timeline points
    const points: CashFlowPoint[] = [];
    let cumulative = 0;
    let totalActualIn = 0;
    let totalActualOut = 0;

    sortedActualKeys.forEach((key) => {
      const d = actualMap.get(key)!;
      const net = d.in - d.out;
      cumulative += net;
      totalActualIn += d.in;
      totalActualOut += d.out;

      points.push({
        periodKey: key,
        periodLabel: this.formatPeriodLabel(key, granularity),
        cashIn: d.in,
        cashOut: d.out,
        netCashFlow: net,
        cumulativeCashFlow: cumulative,
        isForecast: false,
        breakdown: d.breakdown,
      });
    });

    let totalForecastIn = 0;
    let totalForecastOut = 0;

    // If forecast is requested and project/terms data exists
    if (includeForecast) {
      // Deterministic Forecast Inflow: Unpaid terms with due dates
      const unpaidTerms = terms.filter((t) => t.status !== 'PAID' && t.status !== 'CANCELLED');
      const forecastInflowMap: Map<string, number> = new Map();

      unpaidTerms.forEach((t) => {
        const dueDate = t.dueDate || this.estimateFutureDate(points.length + 1, granularity);
        const key = this.formatPeriodKey(dueDate, granularity);
        forecastInflowMap.set(key, (forecastInflowMap.get(key) || 0) + (Number(t.amount) || 0));
      });

      // Deterministic Forecast Outflow: Kurva-S remaining planned cost distribution
      const totalBudget = rabItems.reduce((s, i) => s + (Number(i.volume) || 0) * (Number(i.unitPrice) || 0), 0);
      const remainingBudget = Math.max(0, totalBudget - totalActualOut);

      // Generate future forecast periods (next 3 to 6 periods)
      const forecastPeriodsCount = Math.max(3, forecastInflowMap.size);
      const perPeriodOutflow = remainingBudget > 0 && forecastPeriodsCount > 0
        ? Math.round(remainingBudget / forecastPeriodsCount)
        : 0;

      let lastKey = sortedActualKeys.length > 0 ? sortedActualKeys[sortedActualKeys.length - 1] : this.formatPeriodKey(new Date().toISOString().substring(0, 10), granularity);

      for (let i = 1; i <= forecastPeriodsCount; i++) {
        const nextKey = this.incrementPeriodKey(lastKey, i, granularity);
        const fIn = forecastInflowMap.get(nextKey) || (i === 1 && unpaidTerms.length > 0 ? Math.round(unpaidTerms[0].amount) : 0);
        const fOut = perPeriodOutflow;
        const fNet = fIn - fOut;
        cumulative += fNet;
        totalForecastIn += fIn;
        totalForecastOut += fOut;

        points.push({
          periodKey: nextKey,
          periodLabel: `${this.formatPeriodLabel(nextKey, granularity)} (Proj)`,
          cashIn: fIn,
          cashOut: fOut,
          netCashFlow: fNet,
          cumulativeCashFlow: cumulative,
          isForecast: true,
          breakdown: {
            material: Math.round(fOut * 0.60),
            labor: Math.round(fOut * 0.30),
            subkon: 0,
            equipment: Math.round(fOut * 0.05),
            overhead: Math.round(fOut * 0.05),
            other: 0,
          },
        });
      }
    }

    // Filter points by period if specified
    let filteredPoints = points;
    if (periodFilter === 'this_month') {
      const thisMonth = this.formatPeriodKey(new Date().toISOString().substring(0, 10), 'monthly');
      filteredPoints = points.filter((p) => p.periodKey.startsWith(thisMonth));
    } else if (periodFilter === '3_months') {
      filteredPoints = points.slice(-3);
    } else if (periodFilter === '6_months') {
      filteredPoints = points.slice(-6);
    }

    // Identify lowest cumulative cash flow position in future
    const futurePoints = filteredPoints.filter((p) => p.isForecast);
    const futureLowestCumulative = futurePoints.length > 0
      ? Math.min(...futurePoints.map((p) => p.cumulativeCashFlow))
      : cumulative;

    return {
      points: filteredPoints,
      totalActualIn,
      totalActualOut,
      totalForecastIn,
      totalForecastOut,
      currentNet: totalActualIn - totalActualOut,
      futureLowestCumulative,
      hasNegativeForecast: futureLowestCumulative < 0,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Budget vs Actual Analytics
  // ---------------------------------------------------------------------------
  public getBudgetVsActual(rabItems: RabItem[] = []): {
    items: BudgetActualPoint[];
    totalBudget: number;
    totalActual: number;
    totalCommitted: number;
    totalVariance: number;
    variancePercent: number;
    status: 'UNDER_BUDGET' | 'ON_TRACK' | 'OVER_BUDGET';
  } {
    const expenses = this.repo.getExpenseList();

    // Group RAB items by work group / category
    const groupMap: Map<string, { name: string; budget: number; actual: number; committed: number }> = new Map();

    const standardGroups = [
      { id: 'persiapan', name: 'Pekerjaan Persiapan' },
      { id: 'pondasi', name: 'Pekerjaan Tanah & Pondasi' },
      { id: 'struktur', name: 'Pekerjaan Struktur Beton & Baja' },
      { id: 'arsitektur', name: 'Pekerjaan Arsitektur & Finishing' },
      { id: 'mep', name: 'Pekerjaan MEP & Sanitasi' },
      { id: 'lainnya', name: 'Pekerjaan Lain-lain & K3' },
    ];

    standardGroups.forEach((g) => {
      groupMap.set(g.id, { name: g.name, budget: 0, actual: 0, committed: 0 });
    });

    // Distribute RAB items into groups
    rabItems.forEach((item) => {
      const nameLower = ((item as any).name || item.description || '').toLowerCase();
      const catLower = (item.category || '').toLowerCase();
      const amount = (Number(item.volume) || 0) * (Number(item.unitPrice) || 0);

      let targetGroup = 'lainnya';
      if (nameLower.includes('persiapan') || catLower.includes('persiapan') || nameLower.includes('pembersihan') || nameLower.includes('direksi')) {
        targetGroup = 'persiapan';
      } else if (nameLower.includes('galian') || nameLower.includes('tanah') || nameLower.includes('pondasi') || nameLower.includes('urug') || nameLower.includes('batu kali')) {
        targetGroup = 'pondasi';
      } else if (nameLower.includes('beton') || nameLower.includes('kolom') || nameLower.includes('balok') || nameLower.includes('plat') || nameLower.includes('sloof') || nameLower.includes('baja') || nameLower.includes('besi')) {
        targetGroup = 'struktur';
      } else if (nameLower.includes('dinding') || nameLower.includes('bata') || nameLower.includes('keramik') || nameLower.includes('cat') || nameLower.includes('pintu') || nameLower.includes('jendela') || nameLower.includes('plafon') || nameLower.includes('atap')) {
        targetGroup = 'arsitektur';
      } else if (nameLower.includes('pipa') || nameLower.includes('kabel') || nameLower.includes('lampu') || nameLower.includes('stop kontak') || nameLower.includes('sanitair') || nameLower.includes('closet') || nameLower.includes('air') || nameLower.includes('mep')) {
        targetGroup = 'mep';
      }

      const grp = groupMap.get(targetGroup)!;
      grp.budget += amount;
    });

    // Distribute actual expenses into groups
    expenses.forEach((e) => {
      const descLower = (e.description || '').toLowerCase();
      const catLower = (e.category || '').toLowerCase();
      const amount = Number(e.amount) || 0;

      let targetGroup = 'lainnya';
      if (descLower.includes('persiapan') || descLower.includes('mobilisasi') || descLower.includes('sewa') || descLower.includes('direksi')) {
        targetGroup = 'persiapan';
      } else if (descLower.includes('tanah') || descLower.includes('gali') || descLower.includes('pondasi') || descLower.includes('urug') || descLower.includes('batu')) {
        targetGroup = 'pondasi';
      } else if (descLower.includes('semen') || descLower.includes('pasir') || descLower.includes('besi') || descLower.includes('beton') || descLower.includes('cor') || descLower.includes('begisting') || descLower.includes('struktur')) {
        targetGroup = 'struktur';
      } else if (descLower.includes('cat') || descLower.includes('keramik') || descLower.includes('granit') || descLower.includes('pintu') || descLower.includes('jendela') || descLower.includes('plafon') || descLower.includes('atap') || descLower.includes('bata')) {
        targetGroup = 'arsitektur';
      } else if (descLower.includes('pipa') || descLower.includes('kabel') || descLower.includes('lampu') || descLower.includes('mep') || descLower.includes('sanitair') || descLower.includes('pompa')) {
        targetGroup = 'mep';
      } else if (catLower === 'material') {
        targetGroup = 'struktur';
      } else if (catLower === 'tenaga kerja') {
        targetGroup = 'arsitektur';
      }

      const grp = groupMap.get(targetGroup)!;
      grp.actual += amount;
      grp.committed += amount;
    });

    // Build final BudgetActualPoint array
    const items: BudgetActualPoint[] = [];
    let totalBudget = 0;
    let totalActual = 0;
    let totalCommitted = 0;

    groupMap.forEach((val, id) => {
      // Include group if it has budget or actual expenditure
      if (val.budget > 0 || val.actual > 0) {
        const varianceAmount = val.actual - val.budget;
        const variancePercent = val.budget > 0
          ? Math.round((varianceAmount / val.budget) * 10000) / 100
          : (val.actual > 0 ? 100 : 0);

        let status: 'UNDER_BUDGET' | 'ON_TRACK' | 'OVER_BUDGET' = 'ON_TRACK';
        if (varianceAmount > 0) status = 'OVER_BUDGET';
        else if (varianceAmount < 0) status = 'UNDER_BUDGET';

        items.push({
          groupId: id,
          groupName: val.name,
          budgetAmount: val.budget,
          actualAmount: val.actual,
          committedAmount: val.committed,
          varianceAmount,
          variancePercent,
          status,
        });

        totalBudget += val.budget;
        totalActual += val.actual;
        totalCommitted += val.committed;
      }
    });

    const totalVariance = totalActual - totalBudget;
    const overallVariancePercent = totalBudget > 0
      ? Math.round((totalVariance / totalBudget) * 10000) / 100
      : 0;

    let overallStatus: 'UNDER_BUDGET' | 'ON_TRACK' | 'OVER_BUDGET' = 'ON_TRACK';
    if (totalVariance > 0) overallStatus = 'OVER_BUDGET';
    else if (totalVariance < 0) overallStatus = 'UNDER_BUDGET';

    return {
      items,
      totalBudget,
      totalActual,
      totalCommitted,
      totalVariance,
      variancePercent: overallVariancePercent,
      status: overallStatus,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Cost Breakdown Analytics
  // ---------------------------------------------------------------------------
  public getCostBreakdown(rabItems: RabItem[] = []): {
    items: CostBreakdownItem[];
    totalCost: number;
  } {
    const expenses = this.repo.getExpenseList();
    const categories: ExpenseCategory[] = [
      'Material',
      'Tenaga Kerja',
      'Subkon',
      'Alat',
      'Transport',
      'Operasional',
      'Pajak',
      'Lainnya',
    ];

    // Compute actual per category
    const actualByCategory: Record<string, number> = {};
    categories.forEach((c) => (actualByCategory[c] = 0));

    let totalActual = 0;
    expenses.forEach((e) => {
      const cat = e.category || 'Lainnya';
      const amt = Number(e.amount) || 0;
      actualByCategory[cat] = (actualByCategory[cat] || 0) + amt;
      totalActual += amt;
    });

    // Compute budget per category from RAB items
    let rabMaterial = 0;
    let rabLabor = 0;
    let rabEquipment = 0;
    let rabTotal = 0;

    rabItems.forEach((itm) => {
      const vol = Number(itm.volume) || 0;
      rabMaterial += (Number(itm.materialPrice) || 0) * vol;
      rabLabor += (Number(itm.laborPrice) || 0) * vol;
      rabEquipment += (Number(itm.equipmentPrice) || 0) * vol;
      rabTotal += (Number(itm.totalPrice) || 0);
    });

    const items: CostBreakdownItem[] = categories.map((cat) => {
      const act = actualByCategory[cat] || 0;
      let bgt = 0;

      if (cat === 'Material') bgt = rabMaterial;
      else if (cat === 'Tenaga Kerja') bgt = rabLabor;
      else if (cat === 'Alat') bgt = rabEquipment;
      else if (cat === 'Operasional' || cat === 'Lainnya') bgt = Math.max(0, rabTotal - (rabMaterial + rabLabor + rabEquipment));

      return {
        category: cat,
        budgetAmount: bgt,
        actualAmount: act,
        committedAmount: act,
        percentageOfTotal: totalActual > 0 ? Math.round((act / totalActual) * 10000) / 100 : 0,
      };
    });

    return {
      items,
      totalCost: totalActual,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Profitability & Margin Analytics
  // ---------------------------------------------------------------------------
  public getProfitability(
    rabItems: RabItem[] = [],
    project: Project | null = null
  ): ProfitabilitySummary {
    const config = this.repo.getConfig();
    const expenses = this.repo.getExpenseList();

    let contractValue = 0;
    let isContractAvailable = false;

    if (config.contractValueOverride !== undefined && config.contractValueOverride > 0) {
      contractValue = config.contractValueOverride;
      isContractAvailable = true;
    } else if (project?.costSummary?.grandTotal && project.costSummary.grandTotal > 0) {
      contractValue = project.costSummary.grandTotal;
      isContractAvailable = true;
    } else if ((project as any)?.contractValue && (project as any).contractValue > 0) {
      contractValue = (project as any).contractValue;
      isContractAvailable = true;
    }

    const totalBudget = rabItems.reduce(
      (sum, item) => sum + (Number(item.volume) || 0) * (Number(item.unitPrice) || 0),
      0
    );

    const actualCost = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const committedCost = actualCost;

    if (!isContractAvailable || contractValue <= 0) {
      return {
        contractValue: 0,
        isContractAvailable: false,
        totalBudget,
        actualCost,
        committedCost,
        projectedTotalCost: totalBudget > 0 ? totalBudget : actualCost,
        currentProfit: 0,
        currentMarginPercent: 0,
        projectedProfit: null,
        projectedMarginPercent: null,
        status: 'NO_DATA',
      };
    }

    const currentProfit = contractValue - actualCost;
    const currentMarginPercent = Math.round((currentProfit / contractValue) * 10000) / 100;

    let projectedProfit: number | null = null;
    let projectedMarginPercent: number | null = null;
    let projectedTotalCost = actualCost;

    if (totalBudget > 0) {
      const remainingBudget = Math.max(0, totalBudget - actualCost);
      projectedTotalCost = actualCost + remainingBudget;
      projectedProfit = contractValue - projectedTotalCost;
      projectedMarginPercent = Math.round((projectedProfit / contractValue) * 10000) / 100;
    }

    return {
      contractValue,
      isContractAvailable: true,
      totalBudget,
      actualCost,
      committedCost,
      projectedTotalCost,
      currentProfit,
      currentMarginPercent,
      projectedProfit,
      projectedMarginPercent,
      status: 'AVAILABLE',
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Receivables & Termin Tracker
  // ---------------------------------------------------------------------------
  public getReceivables(): {
    items: ReceivableItem[];
    totalReceivable: number;
    totalOverdue: number;
    totalInvoiced: number;
    totalPaid: number;
  } {
    const invoices = this.repo.getInvoiceList();
    const terms = this.repo.getTerminList();
    const todayMs = new Date().setHours(0, 0, 0, 0);

    const items: ReceivableItem[] = [];
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalReceivable = 0;
    let totalOverdue = 0;

    invoices.forEach((inv) => {
      if (inv.status === 'CANCELLED') return;
      const dueMs = inv.dueDate ? new Date(inv.dueDate).getTime() : 0;
      const isOverdue = dueMs > 0 && dueMs < todayMs && (inv.outstandingAmount || 0) > 0;
      const overdueDays = isOverdue ? Math.floor((todayMs - dueMs) / 86400000) : 0;

      const outstanding = Number(inv.outstandingAmount) || 0;
      totalInvoiced += Number(inv.total) || 0;
      totalPaid += Number(inv.paidAmount) || 0;
      totalReceivable += outstanding;
      if (isOverdue) totalOverdue += outstanding;

      items.push({
        id: inv.id,
        type: 'INVOICE',
        identifier: inv.invoiceNumber,
        title: `Invoice ${inv.invoiceNumber} - ${inv.clientName}`,
        clientName: inv.clientName || 'Klien Proyek',
        dueDate: inv.dueDate || '-',
        amount: Number(inv.total) || 0,
        paidAmount: Number(inv.paidAmount) || 0,
        outstandingAmount: outstanding,
        status: inv.status,
        isOverdue,
        overdueDays,
      });
    });

    // Also include un-invoiced planned terms
    terms.forEach((t) => {
      if (t.status === 'PLANNED' || t.status === 'READY_TO_INVOICE') {
        items.push({
          id: t.id,
          type: 'TERMIN',
          identifier: `Termin ${t.sequence}`,
          title: t.name,
          clientName: 'Klien Proyek',
          dueDate: t.dueDate || '-',
          amount: Number(t.amount) || 0,
          paidAmount: 0,
          outstandingAmount: Number(t.amount) || 0,
          status: t.status,
          isOverdue: false,
          overdueDays: 0,
        });
      }
    });

    return {
      items,
      totalReceivable,
      totalOverdue,
      totalInvoiced,
      totalPaid,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. Payables & Vendor Tracker
  // ---------------------------------------------------------------------------
  public getPayables(): {
    items: PayableItem[];
    totalPayable: number;
    totalOverdue: number;
    totalPaid: number;
  } {
    const expenses = this.repo.getExpenseList();
    const todayMs = new Date().setHours(0, 0, 0, 0);

    const items: PayableItem[] = [];
    let totalPayable = 0;
    let totalOverdue = 0;
    let totalPaid = 0;

    expenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      const isPending = (e as any).status === 'PENDING' || (e as any).status === 'COMMITTED';
      const dueDateStr = (e as any).dueDate || e.date;
      const dueMs = dueDateStr ? new Date(dueDateStr).getTime() : 0;
      const isOverdue = isPending && dueMs > 0 && dueMs < todayMs;

      if (isPending) {
        totalPayable += amt;
        if (isOverdue) totalOverdue += amt;
      } else {
        totalPaid += amt;
      }

      items.push({
        id: e.id,
        type: 'EXPENSE',
        identifier: e.reference || `EXP-${e.id.substring(0, 6).toUpperCase()}`,
        title: e.description,
        vendorName: e.vendor || 'Supplier / Tukang',
        date: e.date,
        dueDate: dueDateStr,
        amount: amt,
        paidAmount: isPending ? 0 : amt,
        outstandingAmount: isPending ? amt : 0,
        status: isPending ? (isOverdue ? 'OVERDUE' : 'COMMITTED') : 'PAID',
        isOverdue,
        category: e.category,
      });
    });

    return {
      items,
      totalPayable,
      totalOverdue,
      totalPaid,
    };
  }

  // ---------------------------------------------------------------------------
  // 8. Unified Searchable & Filterable Transactions
  // ---------------------------------------------------------------------------
  public getTransactions(options: TransactionFilterOptions = {}): {
    transactions: FinancialTransaction[];
    totalCount: number;
    totalIncome: number;
    totalExpense: number;
  } {
    const {
      type = 'ALL',
      category = 'ALL',
      searchQuery = '',
      periodFilter = 'all',
      customRange,
      status = 'ALL',
      limit = 50,
      offset = 0,
    } = options;

    const invoices = this.repo.getInvoiceList();
    const payments = this.repo.getPaymentList();
    const expenses = this.repo.getExpenseList();

    const unified: FinancialTransaction[] = [];

    // 1. Payments -> INCOME
    payments.forEach((p) => {
      const inv = invoices.find((i) => i.id === p.invoiceId);
      unified.push({
        id: p.id,
        projectId: p.projectId,
        date: p.paymentDate,
        type: 'INCOME',
        category: 'Pembayaran Termin',
        description: `Penerimaan Dana ${inv ? `(${inv.invoiceNumber})` : ''} ${p.notes || ''}`.trim(),
        vendorOrClient: inv?.clientName || 'Klien Proyek',
        amount: Number(p.amount) || 0,
        status: 'COMPLETED',
        reference: p.referenceNumber,
        paymentMethod: p.paymentMethod,
        source: 'PAYMENT',
        sourceId: p.invoiceId,
        notes: p.notes,
        createdAt: p.createdAt,
      });
    });

    // 2. Expenses -> EXPENSE
    expenses.forEach((e) => {
      unified.push({
        id: e.id,
        projectId: e.projectId,
        date: e.date,
        type: 'EXPENSE',
        category: e.category,
        description: e.description,
        vendorOrClient: e.vendor || 'Vendor / Supplier',
        amount: Number(e.amount) || 0,
        status: 'COMPLETED',
        reference: e.reference,
        paymentMethod: e.paymentMethod,
        source: 'EXPENSE',
        sourceId: e.id,
        notes: e.notes,
        createdAt: e.createdAt,
      });
    });

    // 3. Invoices -> RECEIVABLE
    invoices.forEach((inv) => {
      if (inv.status === 'CANCELLED') return;
      unified.push({
        id: inv.id,
        projectId: inv.projectId,
        date: inv.invoiceDate,
        type: 'RECEIVABLE',
        category: 'Tagihan Invoice',
        description: `Invoice ${inv.invoiceNumber} - ${inv.projectName || ''}`.trim(),
        vendorOrClient: inv.clientName,
        amount: Number(inv.total) || 0,
        status: inv.status === 'PAID' ? 'COMPLETED' : (inv.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING'),
        reference: inv.invoiceNumber,
        source: 'INVOICE',
        sourceId: inv.id,
        notes: inv.notes,
        createdAt: inv.createdAt,
      });
    });

    // Sort by date descending
    unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Filter
    let filtered = unified;

    if (type !== 'ALL') {
      filtered = filtered.filter((t) => t.type === type);
    }

    if (category !== 'ALL') {
      filtered = filtered.filter((t) => t.category.toLowerCase() === category.toLowerCase());
    }

    if (status !== 'ALL') {
      filtered = filtered.filter((t) => t.status === status);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          (t.vendorOrClient && t.vendorOrClient.toLowerCase().includes(q)) ||
          (t.reference && t.reference.toLowerCase().includes(q))
      );
    }

    // Apply period filter
    filtered = this.filterByDate(filtered, (t) => t.date, periodFilter, customRange);

    const totalCount = filtered.length;
    const totalIncome = filtered.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const totalExpense = filtered.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);

    const paginated = filtered.slice(offset, offset + limit);

    return {
      transactions: paginated,
      totalCount,
      totalIncome,
      totalExpense,
    };
  }

  // ---------------------------------------------------------------------------
  // 9. Deterministic Financial Alerts
  // ---------------------------------------------------------------------------
  public getFinancialAlerts(
    rabItems: RabItem[] = [],
    project: Project | null = null
  ): FinancialAlert[] {
    const totalRabFromItems = rabItems.reduce(
      (sum, item) => sum + (Number(item.volume) || 0) * (Number(item.unitPrice) || 0),
      0
    );
    const expenses = this.repo.getExpenseList();
    const actualCost = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const payableOutstanding = expenses
      .filter((e) => (e as any).status === 'PENDING' || (e as any).status === 'COMMITTED')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const committedCost = actualCost + payableOutstanding;

    return this.getFinancialAlertsInternal(totalRabFromItems, actualCost, committedCost, rabItems, project);
  }

  private getFinancialAlertsInternal(
    totalBudget: number,
    actualCost: number,
    committedCost: number,
    rabItems: RabItem[] = [],
    project: Project | null = null
  ): FinancialAlert[] {
    const alerts: FinancialAlert[] = [];
    const nowIso = new Date().toISOString();

    const budgetVsActual = this.getBudgetVsActual(rabItems);
    const receivables = this.getReceivables();
    const payables = this.getPayables();
    const cashFlow = this.getCashFlow({ includeForecast: true }, rabItems, project);

    // 1. Overall or Group Over Budget
    if (budgetVsActual.status === 'OVER_BUDGET' && budgetVsActual.totalVariance > 0) {
      alerts.push({
        id: `alert-over-budget-${this.projectId}`,
        code: 'OVER_BUDGET',
        title: 'Biaya Aktual Melebihi Anggaran',
        message: `Total pengeluaran aktual (Rp ${budgetVsActual.totalActual.toLocaleString('id-ID')}) melebihi budget RAB sebesar Rp ${budgetVsActual.totalVariance.toLocaleString('id-ID')} (+${budgetVsActual.variancePercent}%).`,
        severity: 'CRITICAL',
        source: 'Budget vs Actual Engine',
        value: budgetVsActual.totalVariance,
        threshold: budgetVsActual.totalBudget,
        timestamp: nowIso,
      });
    }

    // 2. Overdue Receivables
    if (receivables.totalOverdue > 0) {
      alerts.push({
        id: `alert-overdue-rec-${this.projectId}`,
        code: 'OVERDUE_RECEIVABLE',
        title: 'Piutang Termin Jatuh Tempo',
        message: `Terdapat piutang belum tertagih yang telah melewati tanggal jatuh tempo senilai Rp ${receivables.totalOverdue.toLocaleString('id-ID')}.`,
        severity: 'WARNING',
        source: 'Invoice & Receivable Engine',
        value: receivables.totalOverdue,
        timestamp: nowIso,
      });
    }

    // 3. Overdue Payables
    if (payables.totalOverdue > 0) {
      alerts.push({
        id: `alert-overdue-pay-${this.projectId}`,
        code: 'OVERDUE_PAYABLE',
        title: 'Hutang Vendor Jatuh Tempo',
        message: `Terdapat komitmen tagihan vendor yang telah jatuh tempo senilai Rp ${payables.totalOverdue.toLocaleString('id-ID')}.`,
        severity: 'WARNING',
        source: 'Payable & Supplier Engine',
        value: payables.totalOverdue,
        timestamp: nowIso,
      });
    }

    // 4. Negative Forecast Cash Alert
    if (cashFlow.hasNegativeForecast && cashFlow.futureLowestCumulative < 0) {
      alerts.push({
        id: `alert-neg-forecast-${this.projectId}`,
        code: 'NEGATIVE_FORECAST_CASH',
        title: 'Potensi Defisit Arus Kas (Cash Gap)',
        message: `Proyeksi arus kas kumulatif diperkirakan mengalami posisi negatif (defisit terdalam: Rp ${Math.abs(cashFlow.futureLowestCumulative).toLocaleString('id-ID')}). Periksa keselarasan jadwal termin pembayaran dengan kurva pengeluaran.`,
        severity: 'CRITICAL',
        source: 'Cash Flow Forecast Engine',
        value: cashFlow.futureLowestCumulative,
        threshold: 0,
        timestamp: nowIso,
      });
    }

    // 5. High Committed Cost
    if (totalBudget > 0 && (committedCost / totalBudget) > 0.90) {
      const pct = Math.round((committedCost / totalBudget) * 100);
      alerts.push({
        id: `alert-high-committed-${this.projectId}`,
        code: 'HIGH_COMMITTED_COST',
        title: 'Komitmen Biaya Mendekati Batas Anggaran',
        message: `Total biaya aktual dan komitmen telah mencapai ${pct}% dari total anggaran proyek.`,
        severity: 'INFO',
        source: 'Financial Analytics',
        value: committedCost,
        threshold: totalBudget * 0.90,
        timestamp: nowIso,
      });
    }

    return alerts;
  }

  // ---------------------------------------------------------------------------
  // Helper Formatting & Period Utilities
  // ---------------------------------------------------------------------------
  private filterByDate<T>(
    items: T[],
    getDateFn: (item: T) => string | undefined,
    filter: FinancialPeriodFilter,
    customRange?: { startDate: string; endDate: string }
  ): T[] {
    if (filter === 'all' || !filter) return items;

    const today = new Date();

    return items.filter((item) => {
      const dateStr = getDateFn(item);
      if (!dateStr) return true;
      const itemDate = new Date(dateStr);
      const itemMs = itemDate.getTime();

      if (filter === 'this_month') {
        return (
          itemDate.getFullYear() === today.getFullYear() &&
          itemDate.getMonth() === today.getMonth()
        );
      }

      if (filter === '3_months') {
        const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1).getTime();
        return itemMs >= threeMonthsAgo;
      }

      if (filter === '6_months') {
        const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1).getTime();
        return itemMs >= sixMonthsAgo;
      }

      if (filter === 'ytd') {
        const startOfYear = new Date(today.getFullYear(), 0, 1).getTime();
        return itemMs >= startOfYear;
      }

      if (filter === 'custom' && customRange) {
        const start = new Date(customRange.startDate).getTime();
        const end = new Date(customRange.endDate).getTime() + 86400000;
        return itemMs >= start && itemMs <= end;
      }

      return true;
    });
  }

  private formatPeriodKey(dateStr: string, granularity: FinancialGranularity): string {
    const d = new Date(dateStr);
    const year = d.getFullYear() || 2026;
    const month = String(d.getMonth() + 1).padStart(2, '0');

    if (granularity === 'monthly') {
      return `${year}-${month}`;
    }

    if (granularity === 'weekly') {
      const day = d.getDate();
      const weekNum = Math.min(4, Math.ceil(day / 7));
      return `${year}-${month}-W${weekNum}`;
    }

    if (granularity === 'quarterly') {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `${year}-Q${q}`;
    }

    return `${year}-${month}`;
  }

  private formatPeriodLabel(key: string, granularity: FinancialGranularity): string {
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];

    if (granularity === 'monthly') {
      const [year, month] = key.split('-');
      const mIdx = parseInt(month, 10) - 1;
      return `${monthNames[mIdx] || month} ${year}`;
    }

    if (granularity === 'weekly') {
      const parts = key.split('-');
      const mIdx = parseInt(parts[1], 10) - 1;
      const week = parts[2] || 'W1';
      return `${monthNames[mIdx] || parts[1]} (${week})`;
    }

    if (granularity === 'quarterly') {
      const [year, q] = key.split('-');
      return `Kuartal ${q.replace('Q', '')} ${year}`;
    }

    return key;
  }

  private incrementPeriodKey(baseKey: string, offset: number, granularity: FinancialGranularity): string {
    if (granularity === 'monthly') {
      const [yStr, mStr] = baseKey.split('-');
      let y = parseInt(yStr, 10) || 2026;
      let m = (parseInt(mStr, 10) || 1) + offset;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      return `${y}-${String(m).padStart(2, '0')}`;
    }

    if (granularity === 'weekly') {
      const parts = baseKey.split('-');
      let y = parseInt(parts[0], 10) || 2026;
      let m = parseInt(parts[1], 10) || 1;
      let w = (parseInt(parts[2]?.replace('W', '') || '1', 10)) + offset;
      while (w > 4) {
        w -= 4;
        m += 1;
        if (m > 12) {
          m -= 12;
          y += 1;
        }
      }
      return `${y}-${String(m).padStart(2, '0')}-W${w}`;
    }

    if (granularity === 'quarterly') {
      const [yStr, qStr] = baseKey.split('-');
      let y = parseInt(yStr, 10) || 2026;
      let q = (parseInt(qStr.replace('Q', ''), 10) || 1) + offset;
      while (q > 4) {
        q -= 4;
        y += 1;
      }
      return `${y}-Q${q}`;
    }

    return baseKey;
  }

  private estimateFutureDate(offsetWeeks: number, granularity: FinancialGranularity): string {
    const d = new Date();
    if (granularity === 'weekly') {
      d.setDate(d.getDate() + offsetWeeks * 7);
    } else {
      d.setMonth(d.getMonth() + offsetWeeks);
    }
    return d.toISOString().substring(0, 10);
  }
}

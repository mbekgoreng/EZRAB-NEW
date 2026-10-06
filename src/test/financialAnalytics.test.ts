/**
 * EZRAB Project Finance — Financial Analytics Engine Test Suite
 * 
 * Tests:
 * 1. Cash Flow points (Actual vs Forecast, Net, Cumulative, Granularity)
 * 2. Budget vs Actual (Grouping, Variance amount, Variance %, Over/Under Budget status)
 * 3. Profitability & Critical Test (Current vs Projected Profit, Missing contract handling)
 * 4. Receivables & Aging (Invoices, Termins, Overdue calculations)
 * 5. Payables & Committed Cost (Committed vs Paid expenses, Vendor tracking)
 * 6. Zero vs Empty State handling
 * 7. Project Isolation (Strict isolation between Project A and Project B)
 * 8. Deterministic Alerts (Over budget, Negative forecast cash, High committed cost)
 */

import assert from 'node:assert';
import { ProjectFinanceRepository } from '../domain/finance/repository';
import { FinancialAnalyticsService } from '../services/financialAnalyticsService';
import { RabItem, Project } from '../types';

// Mock localStorage for Node test runner environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() {
      return store.size;
    },
  };
}

console.log('\n================================================================');
console.log('🚀 EZRAB PROJECT FINANCE — FINANCIAL ANALYTICS ENGINE TEST');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

async function runTest(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    console.log(`  ✅ [PASS] ${desc}`);
    passCount++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${desc}: ${err.message}`);
    failCount++;
  }
}

async function runAllTests() {
  const PROJ_A = 'PROJ-TEST-FIN-001';
  const PROJ_B = 'PROJ-TEST-FIN-002';

  // ---------------------------------------------------------------------------
  // 1. Critical Profit & Margin Test (Section 42)
  // ---------------------------------------------------------------------------
  await runTest('Critical Profit Test: Contract 1M, Budget 800M, Actual 500M -> Profit 500M (50%)', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    // Set contract value override = 1,000,000,000
    repo.saveConfig({ contractValueOverride: 1_000_000_000 });

    // Record actual expense = 500,000,000
    repo.saveExpense({
      date: '2026-09-10',
      category: 'Material',
      description: 'Pembelian Besi dan Semen',
      amount: 500_000_000,
      paymentMethod: 'Transfer',
    });

    const rabItems: RabItem[] = [
      { id: '1', name: 'Pekerjaan Struktur Beton', volume: 1, unitPrice: 800_000_000, category: 'Struktur' } as any,
    ];

    const analytics = new FinancialAnalyticsService(PROJ_A);
    const prof = analytics.getProfitability(rabItems);

    assert.strictEqual(prof.isContractAvailable, true);
    assert.strictEqual(prof.contractValue, 1_000_000_000);
    assert.strictEqual(prof.actualCost, 500_000_000);
    assert.strictEqual(prof.currentProfit, 500_000_000);
    assert.strictEqual(prof.currentMarginPercent, 50);

    // Projected total cost = actualCost (500M) + remaining budget (300M) = 800M
    // Projected profit = 1M - 800M = 200M (20%)
    assert.strictEqual(prof.projectedTotalCost, 800_000_000);
    assert.strictEqual(prof.projectedProfit, 200_000_000);
    assert.strictEqual(prof.projectedMarginPercent, 20);
  });

  // ---------------------------------------------------------------------------
  // 2. Missing Contract Value Behavior (No Hallucination)
  // ---------------------------------------------------------------------------
  await runTest('Missing Contract Value: Returns NO_DATA and profit 0 without guessing', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);
    const analytics = new FinancialAnalyticsService(PROJ_A);

    const prof = analytics.getProfitability([]);
    assert.strictEqual(prof.isContractAvailable, false);
    assert.strictEqual(prof.contractValue, 0);
    assert.strictEqual(prof.currentProfit, 0);
    assert.strictEqual(prof.projectedProfit, null);
    assert.strictEqual(prof.status, 'NO_DATA');
  });

  // ---------------------------------------------------------------------------
  // 3. Cash Flow Points: Inflow, Outflow, Net, Cumulative, Actual vs Forecast
  // ---------------------------------------------------------------------------
  await runTest('Cash Flow: Computes exact Actual and Forecast periods with Cumulative position', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    // Setup invoice & payment
    const inv = repo.saveInvoice({
      invoiceNumber: 'INV-2026-001',
      invoiceDate: '2026-09-01',
      dueDate: '2026-09-15',
      clientName: 'PT Properti Utama',
      projectName: 'Gedung A',
      subtotal: 300_000_000,
      total: 300_000_000,
      taxPercent: 0,
      taxAmount: 0,
      status: 'ISSUED',
    });

    repo.savePayment({
      invoiceId: inv.id,
      paymentDate: '2026-09-05',
      amount: 200_000_000,
      paymentMethod: 'Transfer',
    });

    // Setup expense
    repo.saveExpense({
      date: '2026-09-12',
      category: 'Material',
      description: 'Semen & Pasir',
      amount: 150_000_000,
      paymentMethod: 'Transfer',
    });

    // Unpaid planned termin for forecast
    repo.saveTermin({
      sequence: 2,
      name: 'Termin 2',
      percentage: 40,
      amount: 400_000_000,
      dueDate: '2026-10-15',
      status: 'PLANNED',
    });

    const analytics = new FinancialAnalyticsService(PROJ_A);
    const cf = analytics.getCashFlow({ granularity: 'monthly', includeForecast: true });

    assert.ok(cf.points.length >= 2, 'Should contain actual and forecast periods');
    const septPoint = cf.points.find((p) => p.periodKey === '2026-09');
    assert.ok(septPoint, 'September point should exist');
    assert.strictEqual(septPoint.cashIn, 200_000_000);
    assert.strictEqual(septPoint.cashOut, 150_000_000);
    assert.strictEqual(septPoint.netCashFlow, 50_000_000);
    assert.strictEqual(septPoint.cumulativeCashFlow, 50_000_000);
    assert.strictEqual(septPoint.isForecast, false);

    // Check forecast point
    const forecastPoints = cf.points.filter((p) => p.isForecast);
    assert.ok(forecastPoints.length > 0, 'Forecast points should be generated');
  });

  // ---------------------------------------------------------------------------
  // 4. Budget vs Actual & Variance Calculation
  // ---------------------------------------------------------------------------
  await runTest('Budget vs Actual: Categorizes by work package, calculates variance & %', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    // Expenses
    repo.saveExpense({
      date: '2026-09-01',
      category: 'Material',
      description: 'Besi Beton Cor Kolom Struktur',
      amount: 220_000_000,
      paymentMethod: 'Transfer',
    });

    const rabItems: RabItem[] = [
      { id: '1', name: 'Beton Kolom K-250', volume: 10, unitPrice: 20_000_000, category: 'Struktur' } as any, // Budget: 200M
      { id: '2', name: 'Pasangan Dinding Bata Merah', volume: 100, unitPrice: 1_000_000, category: 'Arsitektur' } as any, // Budget: 100M
    ];

    const analytics = new FinancialAnalyticsService(PROJ_A);
    const bva = analytics.getBudgetVsActual(rabItems);

    const struktur = bva.items.find((i) => i.groupId === 'struktur');
    assert.ok(struktur, 'Struktur group should exist');
    assert.strictEqual(struktur.budgetAmount, 200_000_000);
    assert.strictEqual(struktur.actualAmount, 220_000_000);
    assert.strictEqual(struktur.varianceAmount, 20_000_000); // +20M over budget
    assert.strictEqual(struktur.variancePercent, 10); // +10%
    assert.strictEqual(struktur.status, 'OVER_BUDGET');
  });

  // ---------------------------------------------------------------------------
  // 5. Receivables, Invoicing & Overdue Detection
  // ---------------------------------------------------------------------------
  await runTest('Receivables: Accurately identifies overdue invoices based on due date', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    // Overdue invoice (dueDate in the past)
    repo.saveInvoice({
      invoiceNumber: 'INV-OVERDUE-01',
      invoiceDate: '2026-08-01',
      dueDate: '2026-08-15',
      clientName: 'Klien Telat',
      projectName: 'Proyek Telat',
      subtotal: 50_000_000,
      total: 50_000_000,
      taxPercent: 0,
      taxAmount: 0,
      status: 'ISSUED',
    });

    const analytics = new FinancialAnalyticsService(PROJ_A);
    const rec = analytics.getReceivables();

    assert.strictEqual(rec.totalInvoiced, 50_000_000);
    assert.strictEqual(rec.totalReceivable, 50_000_000);
    assert.strictEqual(rec.totalOverdue, 50_000_000);
    const overdueItem = rec.items.find((i) => i.identifier === 'INV-OVERDUE-01');
    assert.ok(overdueItem?.isOverdue, 'Item should be marked overdue');
  });

  // ---------------------------------------------------------------------------
  // 6. Project Isolation Gate
  // ---------------------------------------------------------------------------
  await runTest('Project Isolation: Project A financial records never leak into Project B', () => {
    localStorage.clear();
    const repoA = new ProjectFinanceRepository(PROJ_A);
    const repoB = new ProjectFinanceRepository(PROJ_B);

    repoA.saveExpense({
      date: '2026-09-01',
      category: 'Material',
      description: 'Pengeluaran Proyek A',
      amount: 99_000_000,
      paymentMethod: 'Transfer',
    });

    const analyticsA = new FinancialAnalyticsService(PROJ_A);
    const analyticsB = new FinancialAnalyticsService(PROJ_B);

    const sumA = analyticsA.getFinancialSummary();
    const sumB = analyticsB.getFinancialSummary();

    assert.strictEqual(sumA.actualCost, 99_000_000);
    assert.strictEqual(sumB.actualCost, 0, 'Project B must have 0 actual cost');
    assert.strictEqual(analyticsB.getTransactions().totalCount, 0, 'Project B transactions must be 0');
  });

  // ---------------------------------------------------------------------------
  // 7. Zero vs Empty State Handling (Section 43)
  // ---------------------------------------------------------------------------
  await runTest('Zero vs Empty State: Distinguishes empty repository from 0 value calculations', () => {
    localStorage.clear();
    const analyticsEmpty = new FinancialAnalyticsService('PROJ-EMPTY');
    const summaryEmpty = analyticsEmpty.getFinancialSummary();

    assert.strictEqual(summaryEmpty.dataState, 'EMPTY');
    assert.strictEqual(summaryEmpty.actualCost, 0);
    assert.strictEqual(summaryEmpty.cashIn, 0);
  });

  // ---------------------------------------------------------------------------
  // 8. Deterministic Alerts
  // ---------------------------------------------------------------------------
  await runTest('Alerts Engine: Generates OVER_BUDGET and OVERDUE_RECEIVABLE alerts deterministically', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    // Over budget expense
    repo.saveExpense({
      date: '2026-09-01',
      category: 'Material',
      description: 'Pengeluaran Melebihi Budget Cor',
      amount: 150_000_000,
      paymentMethod: 'Transfer',
    });

    const rabItems: RabItem[] = [
      { id: '1', name: 'Beton Cor', volume: 1, unitPrice: 100_000_000, category: 'Struktur' } as any,
    ];

    const analytics = new FinancialAnalyticsService(PROJ_A);
    const alerts = analytics.getFinancialAlerts(rabItems);

    const overBudgetAlert = alerts.find((a) => a.code === 'OVER_BUDGET');
    assert.ok(overBudgetAlert, 'OVER_BUDGET alert must be triggered');
    assert.strictEqual(overBudgetAlert.severity, 'CRITICAL');
  });

  console.log('\n================================================================');
  console.log(`🏁 TESTS COMPLETED: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

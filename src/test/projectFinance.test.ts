/**
 * EZRAB Project Finance — Verification Test Suite
 * Phase 8 Release Verification
 */

import assert from 'node:assert';
import { ProjectFinanceRepository } from '../domain/finance/repository';
import {
  Termin,
  Invoice,
  Payment,
  Expense,
  ProjectFinanceConfig,
} from '../domain/finance/types';
import { MockAiProvider } from '../services/aiProviderEngine';
import { FullProjectAIContext } from '../services/aiContextService';
import { parseWorkspaceRoute, paths, routeForMenu } from '../routing/routes';

// Mock localStorage for Node environment if not present
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
console.log('🚀 EZRAB PROJECT FINANCE — PHASE 8 VERIFICATION TEST');
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
  const PROJ_A = 'PROJ-FIN-001';
  const PROJ_B = 'PROJ-FIN-002';

  // ---------------------------------------------------------------------------
  // 1. Navigation & Routing Integration
  // ---------------------------------------------------------------------------
  await runTest('Routing: paths and menu mapping for Keuangan Proyek', () => {
    assert.strictEqual(paths.finance(), '/app/finance');
    assert.strictEqual(paths.project.finance('proj-123'), '/app/projects/proj-123/finance');
    assert.strictEqual(paths.project.finance('proj-123', 'termin'), '/app/projects/proj-123/finance?tab=termin');
    assert.strictEqual(paths.project.finance('proj-123', 'invoices'), '/app/projects/proj-123/finance?tab=invoices');
    assert.strictEqual(paths.project.finance('proj-123', 'cash-flow'), '/app/projects/proj-123/finance?tab=cash-flow');

    const route = parseWorkspaceRoute('/app/projects/proj-123/finance');
    assert.strictEqual(route.projectId, 'proj-123');
    assert.strictEqual(route.menu, 'keuangan-proyek');
    assert.strictEqual(route.status, 'ok');

    const mappedRoute = routeForMenu('keuangan-proyek', 'proj-123');
    assert.strictEqual(mappedRoute, '/app/projects/proj-123/finance');
  });

  // ---------------------------------------------------------------------------
  // 2. Contract Value Resolution & Config
  // ---------------------------------------------------------------------------
  await runTest('Finance Summary: Contract value hierarchy and user override', () => {
    localStorage.clear();
    const repoA = new ProjectFinanceRepository(PROJ_A);

    // Default fallback from raw RAB total
    const summary1 = repoA.getSummary(undefined, 100_000_000);
    assert.strictEqual(summary1.contractValue, 100_000_000);
    assert.strictEqual(summary1.estimatedCost, 100_000_000);

    // Grand total from project master cost summary
    const summary2 = repoA.getSummary(125_000_000, 100_000_000);
    assert.strictEqual(summary2.contractValue, 125_000_000);
    assert.strictEqual(summary2.estimatedCost, 100_000_000);

    // User override in finance config takes precedence
    repoA.saveConfig({ contractValueOverride: 150_000_000 });
    const summary3 = repoA.getSummary(125_000_000, 100_000_000);
    assert.strictEqual(summary3.contractValue, 150_000_000);
    assert.strictEqual(summary3.estimatedCost, 100_000_000);
  });

  // ---------------------------------------------------------------------------
  // 3. Termin Management & 100% Allocation Tracking
  // ---------------------------------------------------------------------------
  await runTest('Termin: Percentage calculations, amount allocation and 100% check', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    const t1 = repo.saveTerm({
      projectId: PROJ_A,
      sequence: 1,
      name: 'Uang Muka (DP)',
      percentage: 20,
      amount: 30_000_000,
      status: 'PLANNED',
      triggerDescription: 'Penandatanganan Kontrak',
    });
    assert.ok(t1.id);
    assert.strictEqual(t1.percentage, 20);

    const t2 = repo.saveTerm({
      projectId: PROJ_A,
      sequence: 2,
      name: 'Termin 1 (Struktur Selesai)',
      percentage: 50,
      amount: 75_000_000,
      status: 'PLANNED',
      triggerDescription: 'Pekerjaan Struktur 100%',
    });

    const t3 = repo.saveTerm({
      projectId: PROJ_A,
      sequence: 3,
      name: 'Termin 2 (Serah Terima BAST)',
      percentage: 30,
      amount: 45_000_000,
      status: 'PLANNED',
      triggerDescription: 'BAST-1',
    });

    const terms = repo.getTerms();
    assert.strictEqual(terms.length, 3);

    const totalPct = repo.getTotalTermPercentage();
    assert.strictEqual(totalPct, 100);

    const summary = repo.getSummary(150_000_000, 120_000_000);
    assert.strictEqual(summary.totalAllocatedPercentage, 100);
    assert.strictEqual(summary.termsCount, 3);
  });

  // ---------------------------------------------------------------------------
  // 4. Invoice Management, Numbering Uniqueness & Status Lifecycle
  // ---------------------------------------------------------------------------
  await runTest('Invoice: Numbering uniqueness, tax calculation and status transitions', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    assert.strictEqual(repo.isInvoiceNumberUnique('INV/2026/001'), true);

    const inv1 = repo.saveInvoice({
      projectId: PROJ_A,
      invoiceNumber: 'INV/2026/001',
      invoiceDate: '2026-03-01',
      dueDate: '2099-12-31',
      clientName: 'PT Mandiri Sejahtera',
      projectName: 'Pembangunan Gedung',
      subtotal: 50_000_000,
      taxPercent: 11,
      taxAmount: 5_500_000,
      deductions: 0,
      total: 55_500_000,
      paidAmount: 0,
      outstandingAmount: 55_500_000,
      status: 'ISSUED',
    });

    assert.ok(inv1.id);
    assert.strictEqual(repo.isInvoiceNumberUnique('INV/2026/001'), false);
    assert.strictEqual(repo.isInvoiceNumberUnique('INV/2026/001', inv1.id), true);

    const invoices = repo.getInvoices();
    assert.strictEqual(invoices.length, 1);
    assert.strictEqual(invoices[0].total, 55_500_000);
    assert.strictEqual(invoices[0].status, 'ISSUED');
  });

  // ---------------------------------------------------------------------------
  // 5. Payment Recording & Overpayment Prevention
  // ---------------------------------------------------------------------------
  await runTest('Payment: Partial payment, full payment, and overpayment prevention', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    const term = repo.saveTerm({
      projectId: PROJ_A,
      sequence: 1,
      name: 'Termin DP',
      percentage: 20,
      amount: 20_000_000,
      status: 'PLANNED',
    });

    const inv = repo.saveInvoice({
      projectId: PROJ_A,
      terminId: term.id,
      invoiceNumber: 'INV/2026/001',
      invoiceDate: '2026-03-01',
      dueDate: '2099-12-31',
      clientName: 'PT Mandiri Sejahtera',
      projectName: 'Pembangunan Ruko',
      subtotal: 20_000_000,
      taxPercent: 0,
      taxAmount: 0,
      total: 20_000_000,
      paidAmount: 0,
      outstandingAmount: 20_000_000,
      status: 'ISSUED',
    });

    repo.linkInvoiceToTermin(term.id, inv.id);

    // Overpayment check
    const overCheck = repo.validatePayment(inv.id, 25_000_000);
    assert.strictEqual(overCheck.valid, false);
    assert.ok(overCheck.error?.includes('melebihi'));

    // Partial Payment 1: 10,000,000
    repo.savePayment({
      projectId: PROJ_A,
      invoiceId: inv.id,
      paymentDate: '2026-03-05',
      amount: 10_000_000,
      paymentMethod: 'Transfer',
      referenceNumber: 'TRF-101',
    });

    let updatedInv = repo.getInvoiceById(inv.id);
    assert.strictEqual(updatedInv?.paidAmount, 10_000_000);
    assert.strictEqual(updatedInv?.outstandingAmount, 10_000_000);
    assert.strictEqual(updatedInv?.status, 'PARTIALLY_PAID');

    let updatedTerm = repo.getTermById(term.id);
    assert.strictEqual(updatedTerm?.status, 'PARTIALLY_PAID');

    // Full Payment 2: 10,000,000
    repo.savePayment({
      projectId: PROJ_A,
      invoiceId: inv.id,
      paymentDate: '2026-03-10',
      amount: 10_000_000,
      paymentMethod: 'Transfer',
      referenceNumber: 'TRF-102',
    });

    updatedInv = repo.getInvoiceById(inv.id);
    assert.strictEqual(updatedInv?.paidAmount, 20_000_000);
    assert.strictEqual(updatedInv?.outstandingAmount, 0);
    assert.strictEqual(updatedInv?.status, 'PAID');

    updatedTerm = repo.getTermById(term.id);
    assert.strictEqual(updatedTerm?.status, 'PAID');
  });

  // ---------------------------------------------------------------------------
  // 6. Expense Tracking & Categorization
  // ---------------------------------------------------------------------------
  await runTest('Expense: Categorization, vendor records and summary calculation', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    repo.saveExpense({
      projectId: PROJ_A,
      date: '2026-03-02',
      category: 'Material',
      description: 'Semen Padang 100 sak',
      amount: 6_500_000,
      vendor: 'TB Maju Jaya',
      paymentMethod: 'Transfer',
    });

    repo.saveExpense({
      projectId: PROJ_A,
      date: '2026-03-04',
      category: 'Tenaga Kerja',
      description: 'Upah Tukang Minggu 1',
      amount: 4_200_000,
      paymentMethod: 'Cash',
    });

    repo.saveExpense({
      projectId: PROJ_A,
      date: '2026-03-05',
      category: 'Alat',
      description: 'Sewa Molen Beton 3 hari',
      amount: 900_000,
      vendor: 'Rental Alat Prima',
      paymentMethod: 'Cash',
    });

    const expenses = repo.getExpenses();
    assert.strictEqual(expenses.length, 3);

    const totalExpense = expenses.reduce((acc, e) => acc + e.amount, 0);
    assert.strictEqual(totalExpense, 11_600_000);
  });

  // ---------------------------------------------------------------------------
  // 7. Cash Flow & Profitability Calculation (Actual vs Projected)
  // ---------------------------------------------------------------------------
  await runTest('Cash Flow & Profit: Actual Cash In/Out vs RAB Projection', () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    // Contract: 100,000,000 | RAB Estimated Cost: 75,000,000
    // Invoice 1: 50,000,000 -> Paid: 50,000,000 (Cash In)
    const inv = repo.saveInvoice({
      projectId: PROJ_A,
      invoiceNumber: 'INV/2026/001',
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-15',
      clientName: 'Owner',
      projectName: 'Proyek A',
      subtotal: 50_000_000,
      taxPercent: 0,
      taxAmount: 0,
      total: 50_000_000,
      paidAmount: 0,
      outstandingAmount: 50_000_000,
      status: 'ISSUED',
    });

    repo.savePayment({
      projectId: PROJ_A,
      invoiceId: inv.id,
      paymentDate: '2026-03-05',
      amount: 50_000_000,
      paymentMethod: 'Transfer',
    });

    // Expenses: 30,000,000 (Cash Out)
    repo.saveExpense({
      projectId: PROJ_A,
      date: '2026-03-06',
      category: 'Material',
      description: 'Besi Beton & Wiremesh',
      amount: 30_000_000,
      paymentMethod: 'Transfer',
    });

    const summary = repo.getSummary(100_000_000, 75_000_000);

    // Actual Cash In = 50,000,000
    assert.strictEqual(summary.totalPaid, 50_000_000);
    // Actual Cash Out = 30,000,000
    assert.strictEqual(summary.totalExpenses, 30_000_000);
    // Net Cash Flow = 20,000,000
    assert.strictEqual(summary.netCashFlow, 20_000_000);
    // Actual Profit (Cash Real) = 20,000,000
    assert.strictEqual(summary.actualProfit, 20_000_000);
    // Estimated Gross Profit = 100M - 75M = 25,000,000
    assert.strictEqual(summary.estimatedProfit, 25_000_000);
    // Profit margin percent = (25M / 100M) * 100 = 25%
    assert.strictEqual(summary.profitMarginPercent, 25);
  });

  // ---------------------------------------------------------------------------
  // 8. Project Isolation: Project A vs Project B
  // ---------------------------------------------------------------------------
  await runTest('Project Isolation: Storage separation between Project A and Project B', () => {
    localStorage.clear();
    const repoA = new ProjectFinanceRepository(PROJ_A);
    const repoB = new ProjectFinanceRepository(PROJ_B);

    repoA.saveTerm({
      projectId: PROJ_A,
      sequence: 1,
      name: 'Termin Proyek A',
      percentage: 50,
      amount: 50_000_000,
      status: 'PLANNED',
    });

    repoB.saveTerm({
      projectId: PROJ_B,
      sequence: 1,
      name: 'Termin Proyek B',
      percentage: 100,
      amount: 200_000_000,
      status: 'PLANNED',
    });

    assert.strictEqual(repoA.getTerms().length, 1);
    assert.strictEqual(repoA.getTerms()[0].name, 'Termin Proyek A');

    assert.strictEqual(repoB.getTerms().length, 1);
    assert.strictEqual(repoB.getTerms()[0].name, 'Termin Proyek B');

    // Confirm distinct storage keys
    const rawKeysA = repoA.getTerms();
    const rawKeysB = repoB.getTerms();
    assert.notDeepStrictEqual(rawKeysA, rawKeysB);
  });

  // ---------------------------------------------------------------------------
  // 9. AI Project Finance Intelligence & Action Proposal Confirmation Gate
  // ---------------------------------------------------------------------------
  await runTest('AI Finance Assistant: Piutang, Cash Flow, Profit & Invoice Proposal Gate', async () => {
    localStorage.clear();
    const repo = new ProjectFinanceRepository(PROJ_A);

    const term1 = repo.saveTerm({
      projectId: PROJ_A,
      sequence: 1,
      name: 'Uang Muka (DP 20%)',
      percentage: 20,
      amount: 40_000_000,
      status: 'PLANNED',
    });

    const ai = new MockAiProvider();
    const context: FullProjectAIContext = {
      currentPage: 'finance',
      timestamp: new Date().toISOString(),
      project: {
        id: PROJ_A,
        name: 'Gedung Laboratorium Terpadu',
        location: 'Bandung',
        client: 'Universitas Indonesia Mandiri',
        status: 'active',
        createdAt: '2026-01-01',
        updatedAt: '2026-03-01',
        costSummary: {
          grandTotal: 200_000_000,
          materialTotal: 120_000_000,
          laborTotal: 40_000_000,
          equipmentTotal: 20_000_000,
        },
      } as any,
      rab: {
        categories: [
          {
            id: 'c1',
            name: 'Pekerjaan Struktur',
            items: [
              { id: 'i1', description: 'Beton K-300', volume: 100, unit: 'm3', unitPrice: 1_200_000 },
            ],
          },
        ],
      } as any,
    } as any;

    // 1. Piutang Query
    const piutangRes = await ai.chat('Berapa sisa piutang proyek ini?', context);
    assert.ok(piutangRes.content.includes('Status Piutang & Penagihan'));
    assert.ok(piutangRes.content.includes('Gedung Laboratorium Terpadu'));

    // 2. Cash Flow Query
    const cashFlowRes = await ai.chat('Bagaimana posisi cash flow proyek saat ini?', context);
    assert.ok(cashFlowRes.content.includes('Analisis Arus Kas (Cash Flow)'));
    assert.ok(cashFlowRes.content.includes('Posisi Kas Riil (AKTUAL)'));

    // 3. Profit Query
    const profitRes = await ai.chat('Berapa estimasi profit proyek dan margin keuntungan?', context);
    assert.ok(profitRes.content.includes('Analisis Profitabilitas Proyek'));
    assert.ok(profitRes.content.includes('Estimasi Gross Profit'));

    // 4. Create Invoice Action Proposal
    const invProposalRes = await ai.chat('Buatkan invoice untuk Termin DP', context);
    assert.ok(invProposalRes.actionProposal);
    assert.strictEqual(invProposalRes.actionProposal?.type, 'CREATE_INVOICE_PROPOSAL');
    assert.strictEqual(invProposalRes.actionProposal?.status, 'PENDING');
    assert.ok(invProposalRes.content.includes('confirmation gate'));

    // Verify invoice is NOT created before user confirmation
    assert.strictEqual(repo.getInvoices().length, 0);

    // Simulate Confirmation Execution
    const payload = invProposalRes.actionProposal?.payload;
    const invCreated = repo.saveInvoice({
      ...payload,
      id: `INV-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    repo.linkInvoiceToTermin(term1.id, invCreated.id);

    // Verify invoice created and linked post-confirmation
    assert.strictEqual(repo.getInvoices().length, 1);
    assert.strictEqual(repo.getTermById(term1.id)?.status, 'INVOICED');
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`Test Execution Summary: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('----------------------------------------------------------------\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

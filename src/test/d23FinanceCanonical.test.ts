/**
 * D-23 (P3) — Finance total off by Rp2 (892.612.395 vs 892.612.393).
 * Run: npx tsx src/test/d23FinanceCanonical.test.ts
 *
 * Root cause (verified): Finance recomputed raw Σ volume×unitPrice and
 * rounded once at display, while the engine sums per-line rounded amounts
 * (round-per-line at write). The safeAdd(…, 2) hypothesis was RULED OUT —
 * the Finance path never used safeAdd. Finance now consumes the canonical
 * item amounts (UNRESOLVED excluded; amount-less items fall back to the
 * factory rule volume×price rounded to 0 decimals).
 */
import { FinancialAnalyticsService } from '../services/financialAnalyticsService';
import { canonicalDirectCost, canonicalItemAmount } from '../engine/projectCostConfig';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { resolveProjectCostConfig } from '../engine/projectCostConfig';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
import type { RabItem, Project } from '../types';

// Mock localStorage for the Node test runner (same as financialAnalytics.test.ts)
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() { return store.size; },
  };
}

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const item = (over: Partial<RabItem> & { id: string }): RabItem => ({
  no: 1,
  code: '',
  category: 'Pekerjaan Persiapan',
  description: 'Item uji D-23',
  volume: 1,
  unit: 'm2',
  unitPrice: 1000,
  amount: 1000,
  priceStatus: 'PRICE_RESOLVED',
  ...over,
} as RabItem);

const DEMO_DIRECT = 892612393;
const DEMO_RAW_ROUNDED = 892612395; // the old (wrong) Finance figure

// --- the defect, on the real demo dataset ------------------------------------

test('D-23: Finance totalBudget == engine directCost == 892.612.393 (not 892.612.395)', () => {
  const svc = new FinancialAnalyticsService('PRJ-TEST-D23');
  const summary = svc.getFinancialSummary(PREMIUM_DEMO_RAB_ITEMS, PREMIUM_DEMO_PROJECT);
  eq(summary.totalBudget, DEMO_DIRECT, 'getFinancialSummary totalBudget');
  const engine = UnifiedProjectEngine.recalculateCostSummary(
    PREMIUM_DEMO_RAB_ITEMS,
    resolveProjectCostConfig(PREMIUM_DEMO_PROJECT)
  );
  eq(engine.directCost, DEMO_DIRECT, 'engine directCost');
  eq(summary.totalBudget, engine.directCost, 'Finance == engine');
  // Prove the raw recompute really differs (the defect mechanism):
  const raw = PREMIUM_DEMO_RAB_ITEMS.reduce(
    (s, i) => s + (Number(i.volume) || 0) * (Number(i.unitPrice) || 0), 0
  );
  eq(Math.round(raw), DEMO_RAW_ROUNDED, 'raw recompute still gives the old wrong figure');
});

test('D-23: profitability + budget-vs-actual agree with the canonical total', () => {
  const svc = new FinancialAnalyticsService('PRJ-TEST-D23B');
  const profitability = svc.getProfitability(PREMIUM_DEMO_RAB_ITEMS, PREMIUM_DEMO_PROJECT);
  eq(profitability.totalBudget, DEMO_DIRECT, 'getProfitability totalBudget');
  const bva = svc.getBudgetVsActual(PREMIUM_DEMO_RAB_ITEMS);
  eq(bva.totalBudget, DEMO_DIRECT, 'getBudgetVsActual totalBudget');
  const groupSum = bva.items.reduce((s, g) => s + (g.budgetAmount || 0), 0);
  eq(groupSum, DEMO_DIRECT, 'group budgets sum to the canonical total');
});

// --- the mechanism, on a small synthetic case --------------------------------

test('D-23: fractional lines — Finance follows round-per-line, not round-once', () => {
  // raw: 100.6 + 200.6 = 301.2 -> round-once 301; per-line: 101 + 201 = 302.
  const items = [
    item({ id: 'f1', volume: 1, unitPrice: 100.6, amount: 101 }),
    item({ id: 'f2', volume: 1, unitPrice: 200.6, amount: 201 }),
  ];
  const svc = new FinancialAnalyticsService('PRJ-TEST-D23C');
  const summary = svc.getFinancialSummary(items, null);
  eq(summary.totalBudget, 302, 'Finance uses Σ amount (round-per-line)');
  eq(canonicalDirectCost(items), 302, 'canonicalDirectCost agrees');
});

// --- guardrails ----------------------------------------------------------------

test('D-23: UNRESOLVED items are excluded even with a stale amount', () => {
  const items = [
    item({ id: 'ok', volume: 2, unitPrice: 50000, amount: 100000 }),
    item({
      id: 'bad', volume: 100, unitPrice: 50000, amount: 5000000,
      priceStatus: 'PRICE_UNRESOLVED',
    }),
  ];
  eq(canonicalItemAmount(items[1]), 0, 'unresolved item amount is 0');
  const svc = new FinancialAnalyticsService('PRJ-TEST-D23D');
  const summary = svc.getFinancialSummary(items, null);
  eq(summary.totalBudget, 100000, 'unresolved item excluded from budget');
});

test('D-23: amount-less items fall back to the factory rule (volume×price)', () => {
  // Mirrors the existing financialAnalytics.test.ts fixtures (no amount).
  const items = [
    item({ id: 'a1', volume: 10, unitPrice: 80000000, amount: undefined }),
    item({ id: 'a2', volume: 5, unitPrice: 40000000, amount: undefined }),
    item({ id: 'a3', volume: 1, unitPrice: 100000000, amount: undefined }),
  ];
  const svc = new FinancialAnalyticsService('PRJ-TEST-D23E');
  const summary = svc.getFinancialSummary(items, null);
  eq(summary.totalBudget, 1100000000, 'amount-less items still counted via fallback');
});

test('D-23: empty items fall back to the project summary (unchanged behavior)', () => {
  const svc = new FinancialAnalyticsService('PRJ-TEST-D23F');
  const project = {
    costSummary: { directCost: 123456, grandTotal: 234567 },
  } as unknown as Project;
  const summary = svc.getFinancialSummary([], project);
  eq(summary.totalBudget, 123456, 'falls back to stored directCost');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-23: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

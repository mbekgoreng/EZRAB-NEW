/**
 * Batch C cross-surface agreement — card == recap == engine == finance.
 * Run: npx tsx src/test/cCrossSurface.test.ts
 *
 * After Batch C, every surface that shows a project total reads the same
 * canonical engine with the same resolved configuration:
 * - dashboard card: computeProjectInfoTotal (D-24)
 * - Rekapitulasi: computeRekapSummary (resolver)
 * - engine: UnifiedProjectEngine.recalculateCostSummary
 * - Finance: FinancialAnalyticsService (D-23, canonical direct cost)
 *
 * Golden totals pinned here: Premium Demo Rp1.089.879.733. The other two
 * goldens keep their existing suites: multi-gedung Rp924.102.500
 * (chatPhase5MultiBuilding, s2ProvenanceTransfer) and DED Rp149.023.200
 * (dedPriceCompletion) — run in the Batch C integration phase.
 */
import { computeProjectInfoTotal } from '../services/projectInfoTotal';
import { computeRekapSummary } from '../components/estimator/rekapSummary';
import { FinancialAnalyticsService } from '../services/financialAnalyticsService';
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
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const item = (over: Partial<RabItem> & { id: string }): RabItem => ({
  no: 1,
  code: '',
  category: 'Pekerjaan Umum',
  description: 'Item uji lintas-permukaan',
  volume: 1,
  unit: 'ls',
  unitPrice: 5006000,
  amount: 5006000,
  totalPrice: 5006000,
  priceStatus: 'PRICE_RESOLVED',
  ...over,
} as RabItem);

function allSurfaces(items: RabItem[], project: Project | null, tag: string) {
  const card = computeProjectInfoTotal(items, project);
  const rekap = computeRekapSummary(items, project);
  const engine = UnifiedProjectEngine.recalculateCostSummary(
    items,
    resolveProjectCostConfig(project)
  );
  const finance = new FinancialAnalyticsService(`PRJ-X-${tag}`).getFinancialSummary(items, project);
  return { card, rekap, engine, finance };
}

test('cross-surface: Premium Demo — all four surfaces agree on Rp1.089.879.733', () => {
  const { card, rekap, engine, finance } = allSurfaces(
    PREMIUM_DEMO_RAB_ITEMS,
    PREMIUM_DEMO_PROJECT,
    'demo'
  );
  ok(card !== null, 'card is not null');
  eq(card!.total, 1089879733, 'card grand total (golden)');
  eq(rekap.grandTotal, 1089879733, 'recap grand total (golden)');
  eq(engine.grandTotal, 1089879733, 'engine grand total (golden)');
  eq(card!.total, rekap.grandTotal, 'card == recap');
  eq(card!.total, engine.grandTotal, 'card == engine');
  eq(card!.direct, 892612393, 'card direct');
  eq(rekap.directCost, 892612393, 'recap direct');
  eq(engine.directCost, 892612393, 'engine direct');
  eq(finance.totalBudget, 892612393, 'finance budget == direct cost');
  // Component-level agreement (D-24's missing profit is back everywhere).
  eq(card!.overhead, 44630620, 'card overhead');
  eq(rekap.overheadNominal, 44630620, 'recap overhead');
  eq(engine.overheadAmount, 44630620, 'engine overhead');
  eq(card!.profit, 44630620, 'card profit');
  eq(rekap.profitNominal, 44630620, 'recap profit');
  eq(engine.profitAmount, 44630620, 'engine profit');
  eq(card!.ppn, 108006100, 'card PPN');
  eq(rekap.ppnNominal, 108006100, 'recap PPN');
  eq(engine.taxAmount, 108006100, 'engine PPN');
});

test('cross-surface: 0%/0% project — all surfaces agree on direct-only', () => {
  const items = [item({ id: 'x1' }), item({ id: 'x2', volume: 2, unitPrice: 2500000, amount: 5000000, totalPrice: 5000000 })];
  const project = { id: 'PRJ-X-ZERO' } as Project;
  const { card, rekap, engine, finance } = allSurfaces(items, project, 'zero');
  ok(card !== null, 'card is not null');
  eq(card!.total, 10006000, 'card total');
  eq(rekap.grandTotal, 10006000, 'recap total');
  eq(engine.grandTotal, 10006000, 'engine total');
  eq(finance.totalBudget, 10006000, 'finance budget');
  eq(card!.profit, 0, 'no profit at 0%');
  eq(card!.ppn, 0, 'no PPN when opt-in off');
});

test('cross-surface: HSP items — O&P exemption agrees on card and recap', () => {
  const items = [
    item({ id: 'h1', volume: 100, unitPrice: 1000000, amount: 100000000, totalPrice: 100000000, priceCostBasis: 'HSP' }),
    item({ id: 'h2', volume: 100, unitPrice: 1000000, amount: 100000000, totalPrice: 100000000, priceCostBasis: 'DIRECT_COST' }),
  ];
  const project = {
    id: 'PRJ-X-HSP',
    overheadPercent: 10, profitPercent: 10,
    ppnEnabled: false,
  } as unknown as Project;
  const { card, rekap, engine } = allSurfaces(items, project, 'hsp');
  // O&P base = DIRECT_COST items only (100.000.000): OH 10.000.000 + profit 10.000.000.
  eq(engine.grandTotal, 220000000, 'engine total with HSP exemption');
  eq(card!.total, 220000000, 'card total agrees');
  eq(rekap.grandTotal, 220000000, 'recap total agrees');
  eq(card!.overhead, 10000000, 'card overhead on non-HSP base only');
});

// --- summary ----------------------------------------------------------------

console.log(`\nBatch C cross-surface: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

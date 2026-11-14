/**
 * D-42 (P2) — scenario baseline Rp5.756.900 = direct ×1.15 vs v1.0 total
 * Rp5.006.000.
 * Run: npx tsx src/test/d42ScenarioBaseline.test.ts
 *
 * Fix: baseline scenarios use the CANONICAL ENGINE with the project's
 * actual configuration — not a hardcoded ×1.15 markup. Scenarios A/B/C
 * keep their modeled margins as explicit labeled parameters (5/10, 4/10,
 * 3/8) but compute totals through the engine with the project's tax
 * treatment, so deltas are apples-to-apples.
 */
import { VersionAndScenarioEngine } from '../engine/versionAndScenarioEngine';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { resolveProjectCostConfig } from '../engine/projectCostConfig';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
import type { RabItem, Project, ProjectCostSummary } from '../types';

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
  category: 'Pekerjaan Umum',
  description: 'Pekerjaan umum',
  volume: 1,
  unit: 'ls',
  unitPrice: 5006000,
  amount: 5006000,
  totalPrice: 5006000,
  priceStatus: 'PRICE_RESOLVED',
  ...over,
} as RabItem);

// The audit case: a 0%/0% project whose v1.0 total is Rp5.006.000.
const ZERO_CONFIG: Partial<ProjectCostSummary> = {
  overheadPercent: 0, profitPercent: 0, taxPercent: 11,
  ppnEnabled: false, pphEnabled: false, pphPercent: 0,
};

test('D-42: 0%/0% project — baseline == v1.0 total Rp5.006.000 (not ×1.15)', () => {
  const items = [item({ id: 'b1' })];
  const scenarios = VersionAndScenarioEngine.generateDefaultScenarios('PRJ-D42', items, ZERO_CONFIG);
  const baseline = scenarios.find((s) => s.isBaseline)!;
  eq(baseline.totalDirectCost, 5006000, 'baseline direct');
  eq(baseline.totalRab, 5006000, 'baseline total == v1.0 total (old code: 5.756.900)');
  eq(baseline.overheadPercent, 0, 'baseline overhead % is the project config, not 5');
  eq(baseline.profitPercent, 0, 'baseline profit % is the project config, not 10');
  eq(baseline.differenceFromBaseline, 0, 'baseline delta 0');
});

test('D-42: 2-arg call (no config) keeps the 0%/0% no-tax default', () => {
  const items = [item({ id: 'b2' })];
  const scenarios = VersionAndScenarioEngine.generateDefaultScenarios('PRJ-D42B', items);
  const baseline = scenarios.find((s) => s.isBaseline)!;
  eq(baseline.totalRab, 5006000, 'default config gives direct-only baseline');
});

test('D-42: demo config — baseline == golden Rp1.089.879.733', () => {
  const config = resolveProjectCostConfig(PREMIUM_DEMO_PROJECT);
  const scenarios = VersionAndScenarioEngine.generateDefaultScenarios(
    PREMIUM_DEMO_PROJECT.id,
    PREMIUM_DEMO_RAB_ITEMS,
    config
  );
  const baseline = scenarios.find((s) => s.isBaseline)!;
  eq(baseline.totalDirectCost, 892612393, 'baseline direct');
  eq(baseline.totalRab, 1089879733, 'baseline total == golden');
  eq(baseline.overheadPercent, 5, 'baseline overhead % from project');
  eq(baseline.profitPercent, 5, 'baseline profit % from project');
});

test('D-42: empty items — baseline 0 (keeps versionScenarioModalHooks behavior)', () => {
  const scenarios = VersionAndScenarioEngine.generateDefaultScenarios('PRJ-EMPTY', []);
  const baseline = scenarios.find((s) => s.isBaseline)!;
  eq(baseline.totalDirectCost, 0, 'empty direct 0');
  eq(baseline.totalRab, 0, 'empty total 0');
});

test('D-42: scenarios A/B/C use modeled margins THROUGH the engine (with project tax)', () => {
  const items = [item({ id: 't1' })];
  const ppnConfig: Partial<ProjectCostSummary> = {
    overheadPercent: 0, profitPercent: 0, taxPercent: 11,
    ppnEnabled: true, pphEnabled: false, pphPercent: 0,
  };
  const scenarios = VersionAndScenarioEngine.generateDefaultScenarios('PRJ-D42C', items, ppnConfig);
  const [baseline, a, b, c] = scenarios;
  // Baseline: 5.006.000 + PPN 550.660 = 5.556.660.
  eq(baseline.totalRab, 5556660, 'baseline with PPN');
  // A: no VE match on 'Pekerjaan umum'; 5/10 flat -> 5.756.900 + PPN 633.259.
  eq(a.overheadPercent, 5, 'A overhead 5');
  eq(a.profitPercent, 10, 'A profit 10');
  eq(a.totalRab, 6390159, 'A total through the engine (old code: 5.756.900, no tax)');
  // B/C: compare against the engine directly (same margins + project tax).
  const engineB = UnifiedProjectEngine.recalculateCostSummary(b.items, {
    ...ppnConfig, overheadPercent: 4, profitPercent: 10,
  });
  eq(b.totalRab, engineB.grandTotal, 'B total == engine with 4/10 + PPN');
  eq(b.overheadPercent, 4, 'B overhead 4');
  eq(b.profitPercent, 10, 'B profit 10');
  const engineC = UnifiedProjectEngine.recalculateCostSummary(c.items, {
    ...ppnConfig, overheadPercent: 3, profitPercent: 8,
  });
  eq(c.totalRab, engineC.grandTotal, 'C total == engine with 3/8 + PPN');
  eq(c.overheadPercent, 3, 'C overhead 3');
  eq(c.profitPercent, 8, 'C profit 8');
  // Deltas are computed from the new totals.
  eq(a.differenceFromBaseline, a.totalRab - baseline.totalRab, 'A delta consistent');
  eq(c.differenceFromBaseline, c.totalRab - baseline.totalRab, 'C delta consistent');
});

test('D-42: value-engineering discounts still apply (besi 0.94 in scenario A)', () => {
  const items = [
    item({ id: 'v1', description: 'Pembesian kolom', volume: 10, unitPrice: 100000, amount: 1000000, totalPrice: 1000000 }),
  ];
  const scenarios = VersionAndScenarioEngine.generateDefaultScenarios('PRJ-D42D', items, ZERO_CONFIG);
  const a = scenarios.find((s) => s.code === 'SCENARIO_A')!;
  eq(a.totalDirectCost, 940000, 'A direct after 6% rebar discount');
  // 940.000 + 5% OH + 10% profit (flat), no tax = 1.081.000.
  eq(a.totalRab, 1081000, 'A total with VE discount through the engine');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-42: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

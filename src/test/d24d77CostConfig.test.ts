/**
 * D-24 (P2) + D-77 (P2) + NEW-08 — one canonical cost config per project.
 * Run: npx tsx src/test/d24d77CostConfig.test.ts
 *
 * Regression:
 * - D-24: the dashboard card omitted profit (Rp1.040.339.744 vs the recap
 *   Rp1.089.879.733). computeProjectInfoTotal now delegates to the
 *   canonical engine, so card == recap == engine.
 * - D-77: profit 5% lived only in costSummary; Settings read the project
 *   field (-> 0%); global defaults were 10%. resolveProjectCostConfig is
 *   now the single resolver (field -> costSummary -> engine default).
 * - NEW-08: a no-change Settings Save used to write profitPercent: 0 onto
 *   the demo project (init from `?? 0`), dropping the golden total. The
 *   form now initializes from the resolver, so a no-change save is a
 *   no-op for the totals.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveProjectCostConfig,
  resolveProjectFormConfig,
} from '../engine/projectCostConfig';
import { computeProjectInfoTotal } from '../services/projectInfoTotal';
import { computeRekapSummary } from '../components/estimator/rekapSummary';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
import { DEFAULT_PORTFOLIO_PROJECTS } from '../context/ProjectContext';
import type { Project, ProjectCostSummary } from '../types';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

// --- resolver ---------------------------------------------------------------

test('resolver: demo project resolves 5/5, PPN 11% on, PPh off', () => {
  const cfg = resolveProjectCostConfig(PREMIUM_DEMO_PROJECT);
  eq(cfg.overheadPercent, 5, 'overhead');
  eq(cfg.profitPercent, 5, 'profit');
  eq(cfg.taxPercent, 11, 'taxPercent');
  eq(cfg.ppnEnabled, true, 'ppnEnabled');
  eq(cfg.pphEnabled, false, 'pphEnabled');
  eq(cfg.pphPercent, 0, 'pphPercent');
});

test('resolver: new project (no config anywhere) resolves 0/0, tax off', () => {
  const cfg = resolveProjectCostConfig({} as Project);
  eq(cfg.overheadPercent, 0, 'overhead');
  eq(cfg.profitPercent, 0, 'profit');
  eq(cfg.taxPercent, 11, 'taxPercent default 11');
  eq(cfg.ppnEnabled, false, 'ppnEnabled');
  eq(cfg.pphEnabled, false, 'pphEnabled');
  const cfgNull = resolveProjectCostConfig(null);
  eq(cfgNull.overheadPercent, 0, 'null project overhead');
  eq(cfgNull.profitPercent, 0, 'null project profit');
});

test('resolver: project field wins over costSummary', () => {
  const cfg = resolveProjectCostConfig({
    overheadPercent: 10,
    profitPercent: 12,
    ppnPercent: 10,
    costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } as ProjectCostSummary,
  } as Project);
  eq(cfg.overheadPercent, 10, 'field overhead wins');
  eq(cfg.profitPercent, 12, 'field profit wins');
  eq(cfg.taxPercent, 10, 'field ppnPercent wins');
});

test('resolver: costSummary is the fallback when the field is absent (legacy)', () => {
  const cfg = resolveProjectCostConfig({
    costSummary: { overheadPercent: 7, profitPercent: 8, taxPercent: 10 } as ProjectCostSummary,
  } as Project);
  eq(cfg.overheadPercent, 7, 'cs overhead');
  eq(cfg.profitPercent, 8, 'cs profit');
  eq(cfg.taxPercent, 10, 'cs taxPercent');
});

test('resolver: NaN/Infinity fall through to the next source (hardening)', () => {
  const cfg = resolveProjectCostConfig({
    overheadPercent: NaN,
    profitPercent: Infinity,
    costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } as ProjectCostSummary,
  } as Project);
  eq(cfg.overheadPercent, 5, 'NaN overhead falls to cs');
  eq(cfg.profitPercent, 5, 'Infinity profit falls to cs');
});

test('resolver: tax flags are strict (only === true counts as on)', () => {
  const cfg = resolveProjectCostConfig({
    ppnEnabled: 'yes',
    pphEnabled: 1,
  } as unknown as Project);
  eq(cfg.ppnEnabled, false, 'string flag is off');
  eq(cfg.pphEnabled, false, 'numeric flag is off');
});

test('resolver: explicit 0% is preserved (not treated as absent)', () => {
  const cfg = resolveProjectCostConfig({
    overheadPercent: 0,
    profitPercent: 0,
    costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } as ProjectCostSummary,
  } as Project);
  eq(cfg.overheadPercent, 0, 'explicit overhead 0 kept');
  eq(cfg.profitPercent, 0, 'explicit profit 0 kept');
});

// --- D-24: card == recap == engine -----------------------------------------

test('D-24: demo card == recap == engine == Rp1.089.879.733 (profit included)', () => {
  const card = computeProjectInfoTotal(PREMIUM_DEMO_RAB_ITEMS, PREMIUM_DEMO_PROJECT);
  ok(card !== null, 'card is not null');
  eq(card!.direct, 892612393, 'card direct');
  eq(card!.overheadPercent, 5, 'card overhead %');
  eq(card!.overhead, 44630620, 'card overhead');
  eq(card!.profitPercent, 5, 'card profit %');
  eq(card!.profit, 44630620, 'card profit (was missing entirely)');
  eq(card!.ppn, 108006100, 'card PPN');
  eq(card!.total, 1089879733, 'card grand total');

  const engine = UnifiedProjectEngine.recalculateCostSummary(
    PREMIUM_DEMO_RAB_ITEMS,
    resolveProjectCostConfig(PREMIUM_DEMO_PROJECT)
  );
  eq(engine.grandTotal, 1089879733, 'engine grand total');
  eq(card!.total, engine.grandTotal, 'card == engine');

  const rekap = computeRekapSummary(PREMIUM_DEMO_RAB_ITEMS, PREMIUM_DEMO_PROJECT);
  eq(rekap.grandTotal, 1089879733, 'recap grand total');
  eq(card!.total, rekap.grandTotal, 'card == recap');
});

test('D-24: 0%/0% project — card total equals direct cost', () => {
  const items = [{ amount: 5006000, priceStatus: 'PRICE_RESOLVED' }];
  const card = computeProjectInfoTotal(items, {} as Project);
  ok(card !== null, 'card is not null');
  eq(card!.direct, 5006000, 'direct');
  eq(card!.profit, 0, 'profit 0');
  eq(card!.overhead, 0, 'overhead 0');
  eq(card!.ppn, 0, 'PPN 0 (opt-in off)');
  eq(card!.total, 5006000, 'total == direct');
});

test('D-24: PPN off by flag — no tax even with taxPercent set', () => {
  const items = [{ amount: 1000000, priceStatus: 'PRICE_RESOLVED' }];
  const card = computeProjectInfoTotal(items, {
    overheadPercent: 5,
    profitPercent: 5,
    ppnPercent: 11,
    ppnEnabled: false,
  } as Project);
  eq(card!.ppn, 0, 'PPN 0 when flag off');
  eq(card!.total, 1100000, 'total = direct + 5% + 5%');
});

test('D-24: empty project returns null (never Rp0)', () => {
  eq(computeProjectInfoTotal([], PREMIUM_DEMO_PROJECT), null, 'empty -> null');
});

// --- NEW-08: no-change save is a no-op for the golden total -----------------

test('NEW-08: form config for the demo project is 5/5/11 (not 0 from ?? 0)', () => {
  const form = resolveProjectFormConfig(PREMIUM_DEMO_PROJECT);
  eq(form.overheadPercent, 5, 'form overhead');
  eq(form.profitPercent, 5, 'form profit');
  eq(form.ppnPercent, 11, 'form PPN');
  eq(form.ppnEnabled, true, 'form PPN enabled');
});

test('NEW-08: legacy summary-only project resolves its form from costSummary', () => {
  const legacy = {
    costSummary: {
      overheadPercent: 5, profitPercent: 5, taxPercent: 11,
    } as ProjectCostSummary,
  } as Project;
  const form = resolveProjectFormConfig(legacy);
  eq(form.overheadPercent, 5, 'legacy form overhead');
  eq(form.profitPercent, 5, 'legacy form profit');
  eq(form.ppnPercent, 11, 'legacy form PPN');
});

test('NEW-08: simulated no-change Settings save leaves the golden total intact', () => {
  const form = resolveProjectFormConfig(PREMIUM_DEMO_PROJECT);
  // Simulate what the Settings save handler writes: the form values as
  // explicit project fields.
  const savedProject = {
    ...PREMIUM_DEMO_PROJECT,
    overheadPercent: form.overheadPercent,
    profitPercent: form.profitPercent,
    ppnPercent: form.ppnPercent,
    ppnEnabled: form.ppnEnabled,
    pphEnabled: form.pphEnabled,
    pphPercent: form.pphPercent,
  } as Project;
  const engine = UnifiedProjectEngine.recalculateCostSummary(
    PREMIUM_DEMO_RAB_ITEMS,
    resolveProjectCostConfig(savedProject)
  );
  eq(engine.grandTotal, 1089879733, 'golden total survives a no-change save');
});

// --- seeds: profit lives in the field, not only in costSummary --------------

test('D-77 seed: PREMIUM_DEMO_PROJECT carries profitPercent 5 in the field', () => {
  eq((PREMIUM_DEMO_PROJECT as Project).profitPercent, 5, 'demo field profitPercent');
  eq((PREMIUM_DEMO_PROJECT as Project).overheadPercent, 5, 'demo field overheadPercent');
  eq(PREMIUM_DEMO_PROJECT.costSummary?.profitPercent, 5, 'demo cs profitPercent agrees');
});

test('D-77 seed: flagship fixture carries profitPercent 5 in the field', () => {
  const flagship = DEFAULT_PORTFOLIO_PROJECTS[0];
  eq(flagship.id, 'PRJ-RUMAH-2LT-01', 'flagship is first entry');
  eq(flagship.profitPercent, 5, 'flagship field profitPercent');
  eq(flagship.overheadPercent, 5, 'flagship field overheadPercent');
});

// --- source guard: Settings must not init O&P from `?? 0` ------------------

test('D-77 source guard: no `profitPercent ?? 0` / `overheadPercent ?? 0` in Settings forms', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const files = [
    'src/components/settings/UnifiedSettingsView.tsx',
    'src/components/estimator/EstimatorSettingsView.tsx',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    ok(!/profitPercent\s*\?\?\s*0/.test(src), `${rel} must not contain profitPercent ?? 0`);
    ok(!/overheadPercent\s*\?\?\s*0/.test(src), `${rel} must not contain overheadPercent ?? 0`);
    ok(src.includes('resolveProjectFormConfig'), `${rel} must init from resolveProjectFormConfig`);
  }
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-24/D-77/NEW-08: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

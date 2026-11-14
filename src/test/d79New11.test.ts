/**
 * D-79 (P2) + NEW-11 — honest budget baseline + flag-aware reconcile.
 * Run: npx tsx src/test/d79New11.test.ts
 *
 * D-79: the hardcoded Rp450.000.000 "disetujui direksi" fixture is gone;
 * the field is an honest empty state ("Belum ditetapkan") until a budget
 * is explicitly entered. (A real persisted budget field is a follow-up /
 * owner decision, not implemented here.)
 *
 * NEW-11: load-time reconcileProjectSummaries used to rebuild a stale
 * cache as direct-only whenever the stored taxAmount was 0, ignoring
 * ppnEnabled — silently dropping tax after reload. The rebuild now
 * respects the tax flags (with a legacy fallback when the flag was never
 * set), and a self-consistent cache that contradicts the flag is treated
 * as stale so already-corrupted caches get repaired.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { reconcileProjectSummaries } from '../lib/demoSeed';
import type { Project, ProjectCostSummary } from '../types';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const deepEq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// --- D-79: source checks ------------------------------------------------------

test('D-79: no Rp450.000.000 literal remains in UnifiedSettingsView', () => {
  const raw = fs.readFileSync(
    path.join(repoRoot, 'src/components/settings/UnifiedSettingsView.tsx'),
    'utf8'
  );
  // Strip comments: the D-79 fix comment itself quotes the old fixture.
  const src = raw
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
  ok(!src.includes('450000000'), 'the 450000000 fixture literal must be gone');
  ok(!src.includes('disetujui direksi'), 'the false "disetujui direksi" caption must be gone');
  ok(src.includes('Belum ditetapkan'), 'honest empty state is shown');
  ok(src.includes('Belum ada pagu anggaran'), 'honest empty-state caption is shown');
});

// --- NEW-11 fixtures ----------------------------------------------------------

type ReconItem = { projectId?: string; amount?: number | null; priceStatus?: string; taxIncludedPpn?: boolean; taxIncludedPph?: boolean };

const project = (over: Record<string, unknown>): Project => ({
  id: 'PRJ-NEW11',
  name: 'Proyek uji NEW-11',
  totalRab: 1000000,
  itemsCount: 2,
  costSummary: {
    directCost: 1000000,
    overheadPercent: 0, overheadAmount: 0,
    profitPercent: 0, profitAmount: 0,
    contingencyPercent: 0, contingencyAmount: 0,
    directorMarkupPercent: 0, directorMarkupTotal: 0,
    subtotalBeforeTax: 1000000,
    taxPercent: 11, taxAmount: 0,
    pphPercent: 0, pphAmount: 0,
    grandTotal: 1000000,
  } as ProjectCostSummary,
  ...over,
} as unknown as Project);

const twoItems: ReconItem[] = [
  { projectId: 'PRJ-NEW11', amount: 500000, priceStatus: 'PRICE_RESOLVED' },
  { projectId: 'PRJ-NEW11', amount: 500000, priceStatus: 'PRICE_RESOLVED' },
];

// --- NEW-11 -------------------------------------------------------------------

test('NEW-11: PPN flag ON + stored tax 0 + stale cache — rebuild keeps the tax', () => {
  const p = project({
    ppnEnabled: true, ppnPercent: 11,
    itemsCount: 1, // stale: 2 items exist
  });
  const { projects, changedIds } = reconcileProjectSummaries([p], twoItems);
  deepEq(changedIds, ['PRJ-NEW11'], 'project was rebuilt');
  eq(projects[0].totalRab, 1110000, 'totalRab includes 11% PPN (old code: 1.000.000)');
  eq(projects[0].costSummary!.taxAmount, 110000, 'taxAmount restored');
  eq(projects[0].costSummary!.grandTotal, 1110000, 'grandTotal consistent');
  eq(projects[0].itemsCount, 2, 'itemsCount repaired');
});

test('NEW-11: PPN flag ON + stored tax 0 + SELF-CONSISTENT cache — still repaired', () => {
  // The aftermath of the old bug: a direct-only cache stored consistently.
  // Without flag-aware staleness detection this would never be repaired.
  const p = project({ ppnEnabled: true, ppnPercent: 11 });
  const { projects, changedIds } = reconcileProjectSummaries([p], twoItems);
  deepEq(changedIds, ['PRJ-NEW11'], 'contradictory cache is treated as stale');
  eq(projects[0].totalRab, 1110000, 'tax restored');
  eq(projects[0].costSummary!.taxAmount, 110000, 'taxAmount restored');
});

test('NEW-11: PPN flag explicitly OFF — rebuild keeps tax at 0', () => {
  const p = project({
    ppnEnabled: false, ppnPercent: 11,
    itemsCount: 1, // stale
  });
  const { projects } = reconcileProjectSummaries([p], twoItems);
  eq(projects[0].totalRab, 1000000, 'explicit OFF respected');
  eq(projects[0].costSummary!.taxAmount, 0, 'tax stays 0');
});

test('NEW-11: flag never set (legacy) + old taxAmount > 0 — tax kept', () => {
  const p = project({
    itemsCount: 1, // stale
    costSummary: {
      directCost: 1000000,
      overheadPercent: 0, overheadAmount: 0,
      profitPercent: 0, profitAmount: 0,
      contingencyPercent: 0, contingencyAmount: 0,
      directorMarkupPercent: 0, directorMarkupTotal: 0,
      subtotalBeforeTax: 1000000,
      taxPercent: 11, taxAmount: 110000,
      pphPercent: 0, pphAmount: 0,
      grandTotal: 1110000,
    } as ProjectCostSummary,
    totalRab: 1110000,
  });
  const { projects } = reconcileProjectSummaries([p], twoItems);
  eq(projects[0].totalRab, 1110000, 'legacy taxed project keeps its tax');
  eq(projects[0].costSummary!.taxAmount, 110000, 'taxAmount kept');
});

test('NEW-11: flag never set (legacy) + old taxAmount 0 — tax stays 0', () => {
  const p = project({ itemsCount: 1 }); // stale, no flag, old tax 0
  const { projects } = reconcileProjectSummaries([p], twoItems);
  eq(projects[0].totalRab, 1000000, 'legacy untaxed project stays untaxed');
  eq(projects[0].costSummary!.taxAmount, 0, 'tax stays 0');
});

test('NEW-11: all items tax-included + flag ON + tax 0 — legitimate, NOT stale', () => {
  const p = project({ ppnEnabled: true, ppnPercent: 11 });
  const includedItems: ReconItem[] = twoItems.map((i) => ({ ...i, taxIncludedPpn: true }));
  const { projects, changedIds } = reconcileProjectSummaries([p], includedItems);
  deepEq(changedIds, [], 'no rebuild for a legitimately tax-free project');
  eq(projects[0], p, 'project returned unchanged (same reference)');
});

test('NEW-11: PPh flag ON + stored PPh 0 + stale cache — rebuild keeps the PPh', () => {
  const p = project({
    ppnEnabled: false,
    pphEnabled: true, pphPercent: 2,
    itemsCount: 1, // stale
  });
  const { projects } = reconcileProjectSummaries([p], twoItems);
  eq(projects[0].costSummary!.pphAmount, 20000, 'PPh 2% restored');
  eq(projects[0].totalRab, 1020000, 'grand total includes PPh (old code dropped it)');
});

test('NEW-11: project without items is never touched', () => {
  const p = project({ id: 'PRJ-EMPTY', totalRab: 999, itemsCount: 99 });
  const { projects, changedIds } = reconcileProjectSummaries([p], twoItems);
  deepEq(changedIds, [], 'no change');
  eq(projects[0], p, 'same reference');
});

test('NEW-11: fresh cache is untouched (idempotent)', () => {
  const p = project({
    ppnEnabled: true, ppnPercent: 11,
    totalRab: 1110000,
    costSummary: {
      directCost: 1000000,
      overheadPercent: 0, overheadAmount: 0,
      profitPercent: 0, profitAmount: 0,
      contingencyPercent: 0, contingencyAmount: 0,
      directorMarkupPercent: 0, directorMarkupTotal: 0,
      subtotalBeforeTax: 1000000,
      taxPercent: 11, taxAmount: 110000,
      pphPercent: 0, pphAmount: 0,
      grandTotal: 1110000,
    } as ProjectCostSummary,
  });
  const first = reconcileProjectSummaries([p], twoItems);
  deepEq(first.changedIds, [], 'first run: no change');
  eq(first.projects[0], p, 'same reference');
  const second = reconcileProjectSummaries(first.projects, twoItems);
  deepEq(second.changedIds, [], 'second run: still no change');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-79/NEW-11: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

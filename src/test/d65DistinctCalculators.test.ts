/**
 * D-65 (P3) — QTO summary counts items instead of distinct calculators.
 * Run: npx tsx src/test/d65DistinctCalculators.test.ts
 *
 * Root cause: the recap KPI counted
 * `new Set(items.filter(i => i.calculatorId !== 'MANUAL').map(i =>
 * i.calculatorId)).size` — legacy manual items carry `calculatorId ===
 * undefined`, which passes the `!== 'MANUAL'` filter and enters the Set
 * as a phantom 'undefined' calculator. Audit case: 2× BOWPLANK + 1
 * manual → "2 calculator terpakai" with only one real calculator.
 *
 * Fix (per Batch B handoff): `countDistinctCalculators` in
 * `src/lib/qtoItemSource.ts` excludes manual items via `isManualQtoItem`
 * (robust to legacy shapes) and drops falsy ids.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { countDistinctCalculators } from '../lib/qtoItemSource';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const bow = (id: string) => ({ source: 'CALCULATOR', calculatorId: 'BOWPLANK', calculationRunId: `RUN-${id}` });
const legacyManual = { source: 'MANUAL', calculatorId: undefined, calculationRunId: undefined };
const factoryManual = { source: 'MANUAL', calculatorId: 'MANUAL', calculationRunId: undefined };
const pondasi = { source: 'CALCULATOR', calculatorId: 'PONDASI', calculationRunId: 'RUN-P1' };

test('D-65 audit case: 2× BOWPLANK + 1 legacy manual -> 1 calculator terpakai', () => {
  eq(countDistinctCalculators([bow('1'), bow('2'), legacyManual]), 1, 'audit case');
});

test('D-65: 1 calculator with 2 items -> 1 (items are not counted)', () => {
  eq(countDistinctCalculators([bow('1'), bow('2')]), 1, 'two items, one calculator');
});

test('D-65: factory manual items (calculatorId MANUAL) are excluded too', () => {
  eq(countDistinctCalculators([bow('1'), factoryManual]), 1, 'factory manual excluded');
  eq(countDistinctCalculators([factoryManual, legacyManual]), 0, 'manuals only -> 0');
});

test('D-65: two real calculators + manuals -> 2', () => {
  eq(countDistinctCalculators([bow('1'), pondasi, legacyManual, factoryManual]), 2, 'two calculators');
});

test('D-65: empty list -> 0; nullish entries tolerated', () => {
  eq(countDistinctCalculators([]), 0, 'empty');
  eq(countDistinctCalculators([null, undefined, legacyManual]), 0, 'nullish + manual');
});

test('D-65: a non-manual item with no calculatorId is NOT a phantom calculator', () => {
  // Defensive: an item with a run but no calculatorId is not manual by
  // isManualQtoItem, but its falsy id must not enter the Set.
  eq(countDistinctCalculators([{ source: 'CALCULATOR', calculatorId: undefined, calculationRunId: 'RUN-X' }]), 0, 'run without id');
  eq(countDistinctCalculators([bow('1'), { source: 'CALCULATOR', calculatorId: undefined, calculationRunId: 'RUN-X' }]), 1, 'run without id + bowplank');
});

test('D-65: recap view uses the helper; the old phantom-counting filter is gone', () => {
  const viewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'components', 'qto', 'QtoRekapVolumeView.tsx');
  const src = fs.readFileSync(viewPath, 'utf8');
  ok(src.includes('countDistinctCalculators(projectQtoItems)'), 'view must count via countDistinctCalculators');
  ok(src.includes("countDistinctCalculators } from '../../lib/qtoItemSource'"), 'view must import the helper');
  ok(!src.includes("filter((i) => i.calculatorId !== 'MANUAL')"), 'old phantom-counting filter must be gone');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-65: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

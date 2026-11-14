/**
 * D-70 (P2) — QTO "Filter" opens Column Settings.
 * Run: npx tsx src/test/d70QtoFilter.test.ts
 *
 * Root cause: the "Filter" button and the "Columns" button shared the
 * identical `setColumnsModalOpen(true)` handler; no filter UI existed.
 * Fix: a real filter panel (status / source / calculator) whose pure
 * model lives in `src/lib/qtoTableFilter.ts` and composes with the
 * view's existing category-tab + search filtering. The Filter button
 * now toggles that panel; the Columns button still opens Column
 * Settings (the only remaining `setColumnsModalOpen(true)` call).
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  applyQtoTableFilter,
  countActiveQtoFilters,
  isQtoFilterActive,
  DEFAULT_QTO_TABLE_FILTER,
  type QtoTableFilter,
} from '../lib/qtoTableFilter';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const items = [
  { id: 'A', status: 'SYNCED_TO_RAB', source: 'CALCULATOR', calculatorId: 'BOWPLANK', calculationRunId: 'R1' },
  { id: 'B', status: 'CALCULATED', source: 'CALCULATOR', calculatorId: 'BOWPLANK', calculationRunId: 'R2' },
  { id: 'C', status: 'VERIFIED', source: 'CALCULATOR', calculatorId: 'PONDASI', calculationRunId: 'R3' },
  { id: 'D', status: 'DRAFT', source: 'MANUAL', calculatorId: 'MANUAL', calculationRunId: undefined },
  { id: 'E', status: 'DRAFT', source: 'MANUAL', calculatorId: undefined, calculationRunId: undefined }, // legacy manual
  { id: 'F', status: 'CALCULATED', source: 'CALCULATOR', calculatorId: 'SLOOF', calculationRunId: 'R4' },
];
const ids = (list: typeof items) => list.map((i) => i.id).join(',');

test('default filter is inactive and returns every item', () => {
  ok(!isQtoFilterActive(DEFAULT_QTO_TABLE_FILTER), 'default must be inactive');
  eq(countActiveQtoFilters(DEFAULT_QTO_TABLE_FILTER), 0, 'default count');
  eq(applyQtoTableFilter(items, DEFAULT_QTO_TABLE_FILTER).length, 6, 'default shows all');
});

test('status filter: SYNCED_TO_RAB shows only synced items', () => {
  const f: QtoTableFilter = { ...DEFAULT_QTO_TABLE_FILTER, status: 'SYNCED_TO_RAB' };
  eq(ids(applyQtoTableFilter(items, f)), 'A', 'synced only');
});

test('status filter: BELUM_SYNC shows everything not synced to RAB', () => {
  const f: QtoTableFilter = { ...DEFAULT_QTO_TABLE_FILTER, status: 'BELUM_SYNC' };
  eq(ids(applyQtoTableFilter(items, f)), 'B,C,D,E,F', 'unsynced only');
});

test('status filter: VERIFIED shows only verified items', () => {
  const f: QtoTableFilter = { ...DEFAULT_QTO_TABLE_FILTER, status: 'VERIFIED' };
  eq(ids(applyQtoTableFilter(items, f)), 'C', 'verified only');
});

test('source filter: MANUAL shows factory + legacy manual items', () => {
  const f: QtoTableFilter = { ...DEFAULT_QTO_TABLE_FILTER, source: 'MANUAL' };
  eq(ids(applyQtoTableFilter(items, f)), 'D,E', 'manual items incl. legacy (undefined calculatorId)');
});

test('source filter: CALCULATOR excludes all manual items', () => {
  const f: QtoTableFilter = { ...DEFAULT_QTO_TABLE_FILTER, source: 'CALCULATOR' };
  eq(ids(applyQtoTableFilter(items, f)), 'A,B,C,F', 'calculator items only');
});

test('calculator filter: BOWPLANK shows only bowplank items', () => {
  const f: QtoTableFilter = { ...DEFAULT_QTO_TABLE_FILTER, calculatorId: 'BOWPLANK' };
  eq(ids(applyQtoTableFilter(items, f)), 'A,B', 'bowplank only');
});

test('combined filters compose (calculator + unsynced)', () => {
  const f: QtoTableFilter = { status: 'BELUM_SYNC', source: 'CALCULATOR', calculatorId: 'BOWPLANK' };
  eq(ids(applyQtoTableFilter(items, f)), 'B', 'bowplank + calculator + unsynced');
  eq(countActiveQtoFilters(f), 3, 'three active filters');
});

test('combined filters compose (source + status)', () => {
  const f: QtoTableFilter = { ...DEFAULT_QTO_TABLE_FILTER, source: 'MANUAL', status: 'DRAFT' };
  eq(ids(applyQtoTableFilter(items, f)), 'D,E', 'manual + draft');
  eq(countActiveQtoFilters(f), 2, 'two active filters');
});

test('view wiring: Filter toggles the panel; Columns alone opens Column Settings', () => {
  const viewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'components', 'qto', 'QtoRekapVolumeView.tsx');
  const src = fs.readFileSync(viewPath, 'utf8');
  ok(src.includes('setFilterPanelOpen'), 'view must have the filter-panel toggle');
  ok(src.includes('ezrab-qto-filter-panel'), 'view must render the filter panel');
  ok(src.includes('Hapus filter'), 'panel must have a clear-filters action');
  ok(src.includes('applyQtoTableFilter(base, qtoFilter)'), 'filteredQtoItems must apply the panel filter');
  ok(src.includes("from '../../lib/qtoTableFilter'"), 'view must import the filter module');
  // Exactly ONE setColumnsModalOpen(true) may remain: the Columns button.
  const opens = src.split('setColumnsModalOpen(true)').length - 1;
  eq(opens, 1, 'only the Columns button may open Column Settings');
  // The Filter button must not call setColumnsModalOpen: the Filter icon
  // and the toggle must sit in the same button block.
  const filterIdx = src.indexOf('<Filter size={14}');
  ok(filterIdx >= 0, 'Filter button must exist');
  const buttonBlock = src.slice(Math.max(0, filterIdx - 1200), filterIdx);
  ok(buttonBlock.includes('setFilterPanelOpen'), 'Filter button must toggle the filter panel');
  ok(!buttonBlock.includes('setColumnsModalOpen(true)'), 'Filter button must not open Column Settings');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-70: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

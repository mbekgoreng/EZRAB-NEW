/**
 * D-66 (P2) — Manual QTO items were labeled "Volume Calculator": the label
 * checked `calculatorId === 'MANUAL'` while the factory never set
 * `calculatorId` (manual items had `calculatorId: undefined`).
 * Run: npx tsx src/test/d66ManualQtoSource.test.ts
 *
 * Fix, two layers: (1) the factory + seed now set `calculatorId:
 * 'MANUAL'` explicitly; (2) `qtoItemSourceLabel`/`isManualQtoItem` are the
 * single source of truth for the label, robust to legacy items stored
 * before the factory fix.
 *
 * HANDOFF to Batch D (D-65): the recap's distinct-calculator count
 * (`QtoRekapVolumeView.tsx:262`) still filters `calculatorId !==
 * 'MANUAL'` — legacy manual items (undefined calculatorId) still count
 * as a distinct 'undefined' calculator. D-65 should filter with
 * `!isManualQtoItem(i)` instead.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { isManualQtoItem, qtoItemSourceLabel } from '../lib/qtoItemSource';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

// --- helper behavior --------------------------------------------------------

test('factory shape (post-fix): source MANUAL + calculatorId MANUAL -> Input Manual', () => {
  const item = { source: 'MANUAL', calculatorId: 'MANUAL' };
  ok(isManualQtoItem(item), 'must be manual');
  eq(qtoItemSourceLabel(item), 'Input Manual', 'label');
});

test('legacy manual shape: source MANUAL, no calculatorId -> Input Manual', () => {
  const item = { source: 'MANUAL', calculatorId: undefined, calculationRunId: undefined };
  ok(isManualQtoItem(item), 'legacy manual item must be manual');
  eq(qtoItemSourceLabel(item), 'Input Manual', 'label');
});

test('legacy bare shape: nothing set -> Input Manual (no calculator ran)', () => {
  ok(isManualQtoItem({}), 'an item with no calculator and no run is manual');
  eq(qtoItemSourceLabel({}), 'Input Manual', 'label');
});

test('calculator shape: real calculatorId + run -> Volume Calculator', () => {
  const item = { source: 'CALCULATOR', calculatorId: 'BOWPLANK', calculationRunId: 'RUN-1' };
  ok(!isManualQtoItem(item), 'calculator item must not be manual');
  eq(qtoItemSourceLabel(item), 'Volume Calculator', 'label');
});

test('calculatorId alone (no run) still means a calculator item', () => {
  ok(!isManualQtoItem({ source: 'CALCULATOR', calculatorId: 'PONDASI' }), 'calculatorId present => calculator item');
});

test('a calculation run alone (calculatorId lost) still means a calculator item', () => {
  ok(!isManualQtoItem({ source: 'CALCULATOR', calculationRunId: 'RUN-9' }), 'calculationRunId present => calculator item');
});

test('source CALCULATOR but no calculator and no run -> Input Manual (nothing calculated it)', () => {
  ok(isManualQtoItem({ source: 'CALCULATOR' }), 'no calculator behind it => manual is the honest label');
});

test('null/undefined item -> not manual (nothing to label)', () => {
  ok(!isManualQtoItem(null), 'null item');
  ok(!isManualQtoItem(undefined), 'undefined item');
});

// --- wiring guards ----------------------------------------------------------

test('factory sets calculatorId MANUAL on new manual items', () => {
  const ctxPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'context', 'ProjectContext.tsx');
  const src = fs.readFileSync(ctxPath, 'utf8');
  const idx = src.indexOf('const createManualQtoItem = useCallback(');
  ok(idx >= 0, 'createManualQtoItem implementation must exist');
  const body = src.slice(idx, idx + 3000);
  ok(body.includes("calculatorId: 'MANUAL'"), 'createManualQtoItem must set calculatorId: MANUAL');
});

test('seed manual item sets calculatorId MANUAL', () => {
  const ctxPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'context', 'ProjectContext.tsx');
  const src = fs.readFileSync(ctxPath, 'utf8');
  const idx = src.indexOf('Pekerjaan Beton Kolom K1 15/15');
  ok(idx >= 0, 'seed manual item must exist');
  const block = src.slice(Math.max(0, idx - 400), idx + 400);
  ok(block.includes("calculatorId: 'MANUAL'"), 'seed manual item must set calculatorId: MANUAL');
});

test('recap view labels via the helper (old brittle check gone) and gates the navigate button', () => {
  const viewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'components', 'qto', 'QtoRekapVolumeView.tsx');
  const src = fs.readFileSync(viewPath, 'utf8');
  ok(src.includes('qtoItemSourceLabel'), 'recap must use qtoItemSourceLabel for the detail label');
  ok(src.includes('isManualQtoItem'), 'recap must use isManualQtoItem');
  ok(!src.includes("calculatorId === 'MANUAL' ? 'Input Manual'"), 'old brittle label check must be gone');
  ok(src.includes('!isManualQtoItem(activeSelectedItem)'), 'navigate-to-calculator button must be gated for manual items');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-66: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

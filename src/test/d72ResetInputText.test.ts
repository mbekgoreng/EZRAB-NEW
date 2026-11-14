/**
 * D-72 (P2) — Reset + favorite leaves inputs and results inconsistent.
 * Run: npx tsx src/test/d72ResetInputText.test.ts
 *
 * Root cause: dual state — `inputs` (numbers, drive the result) vs
 * `inputText` (raw strings, drive the displayed box value via
 * `inputText[param.id] ?? String(currentVal)`). `performReset` reset
 * `inputs` to defaults but did NOT clear `inputText` — the only
 * replacement path that forgot (calculator change, edit load, and
 * Excel paste all call `setInputText({})`). After reset the box still
 * showed P=6 while the result used P=3 (0.90 m³).
 *
 * Fix: `performReset` also calls `setInputText({})`, and the comment
 * listing the clearing cases now includes reset. The component cannot
 * be rendered by this tsx harness, so these are source-level checks
 * (same convention as Batch B's d66 test) plus the Sloof arithmetic
 * the desync hid: P=3 -> 0.90 m³, P=6 -> 1.80 m³.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getCalculatorById } from '../engine/constructionCalculators/registry';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const viewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'components', 'qto', 'QtoCalculatorView.tsx');
const src = fs.readFileSync(viewPath, 'utf8');

/** Body of a function/arrow starting at `anchor`, up to its closing `};`. */
function bodyFrom(anchor: string): string {
  const idx = src.indexOf(anchor);
  if (idx < 0) throw new Error(`anchor not found: ${anchor}`);
  const end = src.indexOf('\n  };', idx);
  if (end < 0) throw new Error(`body end not found after: ${anchor}`);
  return src.slice(idx, end);
}

test('D-72: performReset clears inputText as well as inputs', () => {
  const body = bodyFrom('const performReset = () => {');
  ok(body.includes('setInputs(initial)'), 'reset must set inputs to defaults');
  ok(body.includes('setInputText({})'), 'reset must clear inputText (the D-72 fix)');
});

test('D-72: the inputText comment lists reset among the clearing cases', () => {
  ok(src.includes('tempel Excel, reset'), 'comment must list reset as a clearing case');
});

test('D-72 audit: EVERY external inputs replacement clears inputText (no second forgotten path)', () => {
  // Calculator change (useEffect on selectedCalcId).
  const calcChange = src.slice(src.indexOf('useEffect(() => {\n    if (!editingQtoId) {'), src.indexOf('}, [selectedCalcId, activeSpec, editingQtoId]);'));
  ok(calcChange.includes('setInputs(initial)') && calcChange.includes('setInputText({})'), 'calculator change must clear inputText');
  // Edit load: setInputText({}) must follow setInputs(loaded) closely.
  const loadedIdx = src.indexOf('setInputs(loaded);');
  ok(loadedIdx >= 0, 'edit load must exist');
  ok(src.slice(loadedIdx, loadedIdx + 120).includes('setInputText({})'), 'edit load must clear inputText');
  // Excel paste: setInputText({}) must follow setInputs(updated) closely.
  const updatedIdx = src.indexOf('setInputs(updated);');
  ok(updatedIdx >= 0, 'excel paste must exist');
  ok(src.slice(updatedIdx, updatedIdx + 120).includes('setInputText({})'), 'excel paste must clear inputText');
  // Per-param typing keeps the two in sync by design (text handler sets
  // inputText first, then the numeric value) — assert the pairing exists.
  ok(src.includes('handleParamTextChange'), 'text handler must exist');
  const textHandler = bodyFrom('const handleParamTextChange');
  ok(textHandler.includes('setInputText((prev) => ({ ...prev, [id]: raw }))'), 'text handler must store the raw text');
  ok(textHandler.includes('handleInputChange(id, parsed)'), 'text handler must update the numeric value when parseable');
  // Stepper syncs both.
  const stepper = bodyFrom('const handleStepParam');
  ok(stepper.includes('handleInputChange(param.id, next)'), 'stepper must update the numeric value');
  ok(stepper.includes('setInputText((prev) => ({ ...prev, [param.id]: String(next) }))'), 'stepper must sync the box text');
});

test('D-72: the box displays inputText when present, else the numeric value', () => {
  ok(src.includes('inputText[param.id] ?? String(currentVal)'), 'display fallback must exist (clearing inputText re-syncs the box)');
});

test('D-72 arithmetic: the desync hid P=3 -> 0.90 m³ vs P=6 -> 1.80 m³ (Sloof)', () => {
  const spec = getCalculatorById('SLOOF');
  if (!spec) throw new Error('SLOOF spec not found');
  const defaults: Record<string, number> = {};
  spec.parameters.forEach((p) => { defaults[p.id] = p.defaultValue; });
  eq(defaults.P, 3, 'Sloof default P is 3');
  eq(spec.calculate(defaults).primaryQuantity, 0.9, 'P=3 -> 0.90 m³ (the reset result)');
  eq(spec.calculate({ ...defaults, P: 6 }).primaryQuantity, 1.8, 'P=6 -> 1.80 m³ (the stale box value)');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-72: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

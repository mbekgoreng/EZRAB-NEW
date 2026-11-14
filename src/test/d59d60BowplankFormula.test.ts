/**
 * D-59 + D-60 (P2) — Bowplank formula reproducibility.
 * Run: npx tsx src/test/d59d60BowplankFormula.test.ts
 *
 * D-59: the I11 formula text omitted the `ceil` the code applies, so the
 * printed formula evaluated to 30.30 while the code displayed 31.40.
 * The text now shows the ceil explicitly: (⌈42.4/2⌉ + 1) × … = 23 × …
 *
 * D-60: the two timber volume conversions were hidden (no formula step)
 * and the comment contradicted the code (0.006 vs 0.007; materials list
 * showed 0.012 for balok while the code used 0.0045). The 0.0045 IS the
 * Master Excel value (H49 = 0.0045*(I11+I13)); the materials-list 0.012
 * was the outlier and is corrected. Both conversions now have formula
 * steps (H49/H50) whose evaluation yields the displayed volumes.
 *
 * Audit inputs (from 01-part-financial.md): P=12, L=8, C=0.6, H=1.0, R=2.0.
 * Hand-verified: perimeter 42.40 m; papan 44.52 m; patok 31.40 m;
 * skur 11.13 m; balok 0.19 m³; papan 0.30 m³.
 */
import { getCalculatorById } from '../engine/constructionCalculators/registry';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const close = (a: number, b: number, tol: number, m: string) => { if (Math.abs(a - b) > tol) throw new Error(`${m}: expected ${b} ± ${tol}, got ${a}`); };

const spec = getCalculatorById('BOWPLANK');
if (!spec) throw new Error('BOWPLANK spec not found');
const res = spec.calculate({ P: 12, L: 8, C: 0.6, H: 1.0, R: 2.0 });
const step = (code: string) => {
  const s = res.formulaSteps.find((x) => x.code === code);
  if (!s) throw new Error(`formula step ${code} missing`);
  return s;
};

// --- hand-verified base values ------------------------------------------------

test('audit inputs: perimeter 42.40 m, papan 44.52 m, skur 11.13 m', () => {
  eq(res.primaryQuantity, 42.4, 'perimeter');
  eq(res.breakdown.panjangTotalPapan, 44.52, 'panjang papan');
  eq(res.breakdown.panjangTotalSkur, 11.13, 'panjang skur');
});

test('audit inputs: 23 stakes (ceil(42.4/2)+1) and patok length 31.40 m', () => {
  eq(res.breakdown.jumlahPatok, 23, 'jumlah patok');
  eq(res.breakdown.panjangTotalPatok, 31.4, 'panjang patok');
});

// --- D-59 ---------------------------------------------------------------------

test('D-59: I11 formula text shows the ceil and the stake count', () => {
  const s = step('I11');
  ok(s.formulaText.includes('⌈'), `formula text must show the ceiling step, got: ${s.formulaText}`);
  ok(s.formulaText.includes('23'), `formula text must show the 23 stakes, got: ${s.formulaText}`);
  ok(s.formulaText.includes('42.4'), `formula text must show the perimeter, got: ${s.formulaText}`);
});

test('D-59: printed I11 formula reproduces the displayed 31.40 (not the old 30.30)', () => {
  const s = step('I11');
  // Recompute from the values the text itself displays: 23 stakes ×
  // (1.00 + 0.30) × 105%.
  const reproduced = 23 * (1.0 + 0.3) * 1.05;
  close(s.calculatedValue, reproduced, 0.011, 'I11 calculatedValue must equal the ceiled expression');
  eq(s.calculatedValue, 31.4, 'I11 value');
  // The OLD un-ceiled expression evaluates to 30.30 — the new text must
  // not be that expression (it must contain the ceil, asserted above).
  const oldUnceiled = (42.4 / 2 + 1) * (1.0 + 0.3) * 1.05;
  close(oldUnceiled, 30.3, 0.01, 'sanity: old expression is 30.30');
  ok(Math.abs(s.calculatedValue - oldUnceiled) > 1, 'displayed value must differ from the old un-ceiled 30.30');
});

test('D-59: Excel deviation documented in technical notes', () => {
  const notes = (res.technicalNotes || []).join(' ');
  ok(notes.includes('Excel'), 'technical notes must mention the Excel deviation');
  ok(notes.includes('23'), 'technical notes must mention the 23 stakes');
});

test('D-59: ceil also applies at non-integer divisions (R=3 -> 16 stakes)', () => {
  const r3 = spec.calculate({ P: 12, L: 8, C: 0.6, H: 1.0, R: 3 });
  eq(r3.breakdown.jumlahPatok, 16, 'ceil(42.4/3)+1 = 16');
  const s = r3.formulaSteps.find((x) => x.code === 'I11')!;
  ok(s.formulaText.includes('⌈') && s.formulaText.includes('16'), `R=3 text must show ceil + 16, got: ${s.formulaText}`);
  close(s.calculatedValue, 16 * 1.3 * 1.05, 0.011, 'R=3 value reproduces from the text');
});

// --- D-60 ---------------------------------------------------------------------

test('D-60: H49 step documents the balok conversion; evaluation yields 0.19 m³', () => {
  const s = step('H49');
  ok(s.formulaText.includes('0.0045'), `H49 text must show the 0.0045 coefficient, got: ${s.formulaText}`);
  ok(s.formulaText.includes('31.4') && s.formulaText.includes('11.13'), `H49 text must show both length bases, got: ${s.formulaText}`);
  close(s.calculatedValue, 0.0045 * (31.4 + 11.13), 0.0001, 'H49 value must equal 0.0045 × (patok + skur)');
  eq(s.unit, 'm³', 'H49 unit');
  eq(Number(s.calculatedValue.toFixed(2)), 0.19, 'H49 displays 0.19 m³');
});

test('D-60: H50 step documents the papan conversion; evaluation yields 0.30 m³', () => {
  const s = step('H50');
  ok(s.formulaText.includes('42.4') && s.formulaText.includes('0.007'), `H50 text must show perimeter × 0.007, got: ${s.formulaText}`);
  close(s.calculatedValue, 42.4 * 0.007, 0.0001, 'H50 value must equal perimeter × 0.007');
  eq(s.unit, 'm³', 'H50 unit');
  eq(Number(s.calculatedValue.toFixed(2)), 0.3, 'H50 displays 0.30 m³');
});

test('D-60: materials-list coefficients equal the coefficients used in computation', () => {
  const balok = res.materials.find((m) => m.name.includes('Balok 5/7'));
  const papan = res.materials.find((m) => m.name.includes('Papan 3/20'));
  if (!balok || !papan) throw new Error('timber materials missing');
  eq(balok.coefficient, 0.0045, 'balok coefficient must be 0.0045 (Master Excel H49), not 0.012');
  eq(papan.coefficient, 0.007, 'papan coefficient must be 0.007');
  close(balok.quantity, 0.0045 * (31.4 + 11.13), 0.0001, 'balok quantity from its own coefficient');
  close(papan.quantity, 42.4 * 0.007, 0.0001, 'papan quantity from its own coefficient');
});

test('D-60: formula steps are 6, numbered 1..6 (I10, I11, I12, I13, H49, H50)', () => {
  eq(res.formulaSteps.length, 6, 'step count');
  eq(res.formulaSteps.map((s) => s.code).join(','), 'I10,I11,I12,I13,H49,H50', 'step codes');
  res.formulaSteps.forEach((s, i) => eq(s.stepNumber, i + 1, `step ${s.code} number`));
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-59/D-60: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

/**
 * EZRAB DED-FIX TASK 6 — Regression tests calling ACTUAL implementation functions.
 * Bundled from src/ai-tools/ded-ai-estimate/quantity.ts and calculator.ts via esbuild.
 * Run: npx esbuild src/test/dedQuantitySafety.src.ts --bundle --platform=node --format=cjs --outfile=/tmp/dedq.cjs && node /tmp/dedq.cjs
 * (This file is the test entry; see dedQuantitySafety.mjs runner.)
 */
import {
  parseDimensionsString,
  detectLengthUnitFactor,
  attemptQuantityFromDimensionString,
  computeQuantity,
} from '../ai-tools/ded-ai-estimate/quantity';
import { DedAiCalculator, validateQuantity } from '../ai-tools/ded-ai-estimate/calculator';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('DED QUANTITY SAFETY (actual implementation)');

// TASK 1: unit conversion fixtures
const r1 = attemptQuantityFromDimensionString('m3', '4 x 0.15 x 0.20 m');
check('T1 m: 4x0.15x0.20m = 0.12', r1.quantity === 0.12 || Math.abs((r1.quantity ?? 0) - 0.12) < 1e-9, `got ${r1.quantity}`);
const r2 = attemptQuantityFromDimensionString('m3', '400 x 15 x 20 cm');
check('T1 cm: 400x15x20cm = 0.12', Math.abs((r2.quantity ?? 0) - 0.12) < 1e-9, `got ${r2.quantity}`);
const r3 = attemptQuantityFromDimensionString('m3', '4000 x 150 x 200 mm');
check('T1 mm: 4000x150x200mm = 0.12', Math.abs((r3.quantity ?? 0) - 0.12) < 1e-9, `got ${r3.quantity}`);

// TASK 1: no unit -> unresolved
const r4 = attemptQuantityFromDimensionString('m3', '4000 x 150 x 200');
check('T1 no-unit: quantity null', r4.quantity === null, `got ${r4.quantity}`);
check('T1 no-unit: ambiguousUnit true', r4.ambiguousUnit === true);
check('T1 no-unit: reason mentions satuan', /satuan/i.test(r4.formula));
check('T1 no-unit: raw preserved', r4.rawDimensions === '4000 x 150 x 200');

// TASK 1: incomplete dims -> unresolved
const r5 = attemptQuantityFromDimensionString('m3', '4 x 0.15 m');
check('T1 incomplete: quantity null', r5.quantity === null, `got ${r5.quantity}`);

// TASK 4: Indonesian number parsing
const p1 = parseDimensionsString('1.200 mm');
check('T4 1.200 mm -> [1200]', p1.length === 1 && p1[0] === 1200, `got ${JSON.stringify(p1)}`);
const p2 = parseDimensionsString('1,2 m');
check('T4 1,2 m -> [1.2]', p2.length === 1 && p2[0] === 1.2, `got ${JSON.stringify(p2)}`);
const p3 = parseDimensionsString('0,15 m');
check('T4 0,15 m -> [0.15]', p3.length === 1 && Math.abs(p3[0] - 0.15) < 1e-9, `got ${JSON.stringify(p3)}`);
const p4 = parseDimensionsString('1.200,50');
check('T4 1.200,50 -> [1200.5]', p4.length === 1 && p4[0] === 1200.5, `got ${JSON.stringify(p4)}`);
const p5 = parseDimensionsString('1.5 m');
check('T4 1.5 m -> [1.5] (intl decimal)', p5.length === 1 && p5[0] === 1.5, `got ${JSON.stringify(p5)}`);
const p6 = parseDimensionsString('1.200.000');
check('T4 1.200.000 -> [1200000]', p6.length === 1 && p6[0] === 1200000, `got ${JSON.stringify(p6)}`);

// TASK 4 via full pipeline: 1.200 mm dims
const r6 = attemptQuantityFromDimensionString('m3', '1.200 x 150 x 200 mm');
check('T4 pipeline: 1.200x150x200mm = 0.036', Math.abs((r6.quantity ?? 0) - 0.036) < 1e-9, `got ${r6.quantity}`);

// TASK 3: quantity validation
check('T3 negative rejected', validateQuantity({ quantity: -5, units: 'm3', quantitySource: 'DED_GEOMETRIC' }).ok === false);
check('T3 NaN rejected', validateQuantity({ quantity: NaN, units: 'm3', quantitySource: 'DED_GEOMETRIC' }).ok === false);
check('T3 Infinity rejected', validateQuantity({ quantity: Infinity, units: 'm3', quantitySource: 'DED_GEOMETRIC' }).ok === false);
check('T3 null rejected', validateQuantity({ quantity: null, units: 'm3', quantitySource: 'UNRESOLVED' }).ok === false);
// AI_INFERENCE/ASSUMPTION: lolos validasi dengan badge "Perlu Ditinjau" di UI (bukan ditolak)
check('T3 AI_INFERENCE passes with review badge', validateQuantity({ quantity: 5, units: 'm3', quantitySource: 'AI_INFERENCE' }).ok === true);
check('T3 ASSUMPTION passes with review badge', validateQuantity({ quantity: 5, units: 'm3', quantitySource: 'ASSUMPTION' }).ok === true);
check('T3 extreme volume rejected', validateQuantity({ quantity: 120_000_000, units: 'm3', quantitySource: 'DED_GEOMETRIC' }).ok === false);
check('T3 valid passes', validateQuantity({ quantity: 0.12, units: 'm3', quantitySource: 'DED_GEOMETRIC' }).ok === true);
check('T3 large infra valid passes', validateQuantity({ quantity: 50000, units: 'm3', quantitySource: 'DED_GEOMETRIC' }).ok === true);

// TASK 3: finalizeItems rejects invalid
const items: any[] = [
  { id: 'a', name: 'Valid', units: 'm3', quantity: 0.12, quantitySource: 'DED_GEOMETRIC', unitPrice: 1000000, provenance: [], stage: 'PARSE' },
  { id: 'b', name: 'Inference', units: 'm3', quantity: 5, quantitySource: 'AI_INFERENCE', unitPrice: 1000000, provenance: [], stage: 'PARSE' },
  { id: 'c', name: 'Extreme', units: 'm3', quantity: 120000000, quantitySource: 'DED_GEOMETRIC', unitPrice: 1000000, provenance: [], stage: 'PARSE' },
  { id: 'd', name: 'Unresolved', units: 'm3', quantity: null, quantitySource: 'UNRESOLVED', unitPrice: 1000000, provenance: [], stage: 'PARSE' },
];
const fin = DedAiCalculator.finalizeItems(items);
check('T3 finalize: valid CALCULATED', fin[0].stage === 'CALCULATED' && fin[0].subtotal === 120000, `got ${fin[0].stage}/${fin[0].subtotal}`);
// Inference: CALCULATED tapi pertahankan source AI_INFERENCE agar UI tampilkan badge "Perlu Ditinjau"
check('T3 finalize: inference CALCULATED with review source', fin[1].stage === 'CALCULATED' && fin[1].quantitySource === 'AI_INFERENCE', `got ${fin[1].stage}/${fin[1].quantitySource}`);
check('T3 finalize: extreme REJECTED', fin[2].stage === 'REJECTED' && fin[2].subtotal === null);
check('T3 finalize: unresolved REJECTED', fin[3].stage === 'REJECTED' && fin[3].subtotal === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

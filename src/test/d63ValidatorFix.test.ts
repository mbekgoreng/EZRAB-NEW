/**
 * Opsi D (Fase 2) — Regression suite for the d63 validator fix.
 *
 * Root cause (investigasi Fase 1, 2026-11-16): the canonical path FOUND the
 * 20 BM weir components (NATIONAL_REFERENCE_MATCH at Step 5) but
 * `priceSanityValidator` rejected them on two wrong benchmarks —
 * (a) the labor benchmark demanded dimension LABOR_TIME while BM 2026
 * legitimately pays labor per hour (`jam`, EQUIPMENT_TIME), and then
 * compared the per-hour price raw against the per-day OH range;
 * (b) the concrete benchmark classified "Kawat Beton" (binding wire,
 * Rp25.000/kg) as bulk concrete (VOLUME). The fix lives in
 * `priceSanityValidator.ts` only: `kawat` carve-out + labor accepts
 * EQUIPMENT_TIME + trade range skipped when the price cannot convert
 * to the benchmark base unit (never a raw cross-unit comparison).
 *
 * This suite pins the fixed behaviour AND the guards that must NOT move:
 * daily-labor ranges, bulk-concrete rules, rebar bounds, per-ton
 * conversion, and the global bounds backstop. The end-to-end proof is
 * `d63WeirRemap.test.ts` (8/8, anchor Rp1.250.895.087) and the P5
 * fail-closed pin lives in `masterPricingIntegration.test.ts`.
 *
 * Run: npx tsx src/test/d63ValidatorFix.test.ts
 */
import { priceSanityValidator } from '../engine/pricing/canonical/priceSanityValidator';
import { canonicalPriceResolver } from '../engine/pricing/canonical/canonicalPriceResolver';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// --- A. Validator unit behaviour: the fix ----------------------------------

test('A1: upah Pekerja BM per jam VALID (Rp27.643,54/jam)', () => {
  const r = priceSanityValidator.validatePrice('Pekerja', 27643.54, 'jam');
  eq(r.status, 'VALID', 'status');
  eq(r.isValid, true, 'isValid');
});

test('A2: upah Tukang BM per jam VALID (Rp29.049,71/jam)', () => {
  const r = priceSanityValidator.validatePrice('jam Tukang', 29049.71, 'jam');
  eq(r.status, 'VALID', 'status');
});

test('A3: upah Mandor BM per jam VALID (Rp33.312,62/jam)', () => {
  const r = priceSanityValidator.validatePrice('jam Mandor', 33312.62, 'jam');
  eq(r.status, 'VALID', 'status');
});

test('A4: kapitalisasi satuan tidak berpengaruh (Jam vs jam)', () => {
  const r = priceSanityValidator.validatePrice('Jam Mandor', 33312.62, 'Jam');
  eq(r.status, 'VALID', 'status');
});

test('A5: Kawat Beton per kg VALID — carve-out kawat, bukan beton curah', () => {
  const r = priceSanityValidator.validatePrice('Kg Kawat Beton', 25000, 'kg');
  eq(r.status, 'VALID', 'status');
});

test('A6: Kawat Beton tanpa prefix satuan juga VALID', () => {
  const r = priceSanityValidator.validatePrice('Kawat Beton', 25000, 'kg');
  eq(r.status, 'VALID', 'status');
});

// --- B. Guards that must NOT move ------------------------------------------

test('B1: upah harian dalam rentang tetap VALID (Rp100.000/OH)', () => {
  const r = priceSanityValidator.validatePrice('Pekerja', 100000, 'OH');
  eq(r.status, 'VALID', 'status');
});

test('B2: upah harian di bawah minimum tetap PRICE_INVALID (Rp10.000/OH)', () => {
  const r = priceSanityValidator.validatePrice('Pekerja', 10000, 'OH');
  eq(r.status, 'PRICE_INVALID', 'status');
});

test('B3: upah harian di atas maksimum tetap PRICE_INVALID (Rp500.000/OH)', () => {
  const r = priceSanityValidator.validatePrice('Pekerja', 500000, 'OH');
  eq(r.status, 'PRICE_INVALID', 'status');
});

test('B4: beton curah m3 dalam batas tetap VALID', () => {
  const r = priceSanityValidator.validatePrice('Cor Sloof Beton', 1000000, 'm3');
  eq(r.status, 'VALID', 'status');
});

test('B5: beton curah m3 di bawah minimum tetap PRICE_INVALID', () => {
  const r = priceSanityValidator.validatePrice('Cor Sloof Beton', 100000, 'm3');
  eq(r.status, 'PRICE_INVALID', 'status');
});

test('B6: beton curah satuan luas tetap PRICE_INVALID (m2 vs VOLUME)', () => {
  const r = priceSanityValidator.validatePrice('Cor Sloof Beton', 1000000, 'm2');
  eq(r.status, 'PRICE_INVALID', 'status');
});

test('B7: tulangan dalam batas tetap VALID (Rp15.000/kg)', () => {
  const r = priceSanityValidator.validatePrice('Baja Tulangan', 15000, 'kg');
  eq(r.status, 'VALID', 'status');
});

test('B8: tulangan harga absurd tetap PRICE_INVALID (Rp3.864.000/kg)', () => {
  const r = priceSanityValidator.validatePrice('Baja Tulangan', 3864000, 'kg');
  eq(r.status, 'PRICE_INVALID', 'status');
});

test('B9: konversi per-ton tetap bekerja (Rp15.000.000/ton = Rp15.000/kg)', () => {
  const r = priceSanityValidator.validatePrice('Besi Beton', 15000000, 'ton');
  eq(r.status, 'VALID', 'status');
  eq(r.convertedPrice?.price, 15000, 'converted price');
  eq(r.convertedPrice?.unit, 'kg', 'converted unit');
});

test('B10: carve-out bukan tanpa batas — Kawat Beton Rp200 jt/kg PRICE_INVALID', () => {
  const r = priceSanityValidator.validatePrice('Kg Kawat Beton', 200000000, 'kg');
  eq(r.status, 'PRICE_INVALID', 'status');
});

test('B11: upah per jam di atas batas global tetap PRICE_INVALID (Rp200 jt/jam)', () => {
  const r = priceSanityValidator.validatePrice('Pekerja', 200000000, 'jam');
  eq(r.status, 'PRICE_INVALID', 'status');
});

// --- C. Canonical resolution end-to-end (Step 5 master path) ---------------

const canonCtx = { projectId: 'test-project', region: 'Probolinggo, Jawa Timur' };

test('C1: kanonis L01 Pekerja → RESOLVED Rp27.643,54/jam', () => {
  const r = canonicalPriceResolver.resolve({ code: 'L01', name: 'Pekerja', unit: 'jam', category: 'LABOR', ...canonCtx });
  eq(r.status, 'RESOLVED', 'status');
  eq(r.price, 27643.54, 'price');
});

test('C2: kanonis L02 jam Tukang → RESOLVED Rp29.049,71/jam', () => {
  const r = canonicalPriceResolver.resolve({ code: 'L02', name: 'jam Tukang', unit: 'jam', category: 'LABOR', ...canonCtx });
  eq(r.status, 'RESOLVED', 'status');
  eq(r.price, 29049.71, 'price');
});

test('C3: kanonis L03 jam Mandor → RESOLVED Rp33.312,62/jam', () => {
  const r = canonicalPriceResolver.resolve({ code: 'L03', name: 'jam Mandor', unit: 'jam', category: 'LABOR', ...canonCtx });
  eq(r.status, 'RESOLVED', 'status');
  eq(r.price, 33312.62, 'price');
});

test('C4: kanonis M14 Kg Kawat Beton → RESOLVED Rp25.000/kg', () => {
  const r = canonicalPriceResolver.resolve({ code: 'M14', name: 'Kg Kawat Beton', unit: 'kg', category: 'MATERIAL', ...canonCtx });
  eq(r.status, 'RESOLVED', 'status');
  eq(r.price, 25000, 'price');
});

test('C5: kanonis M-001/kg tetap RESOLVED Rp1.600 (kontrol positif P5)', () => {
  const r = canonicalPriceResolver.resolve({ code: 'M-001', name: 'Semen Portland', unit: 'kg', category: 'MATERIAL', ...canonCtx });
  eq(r.status, 'RESOLVED', 'status');
  eq(r.price, 1600, 'price');
  eq(r.unit, 'kg', 'unit');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD63-VALIDATOR-FIX: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

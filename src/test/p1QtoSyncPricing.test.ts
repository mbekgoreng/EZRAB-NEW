/**
 * P1 PRICE-1 — QTO->RAB sync must never invent prices (no network).
 * Run: npx tsx src/test/p1QtoSyncPricing.test.ts
 */
import { resolveQtoSyncPrice, resolveQtoSyncCode } from '../lib/qtoSyncPricing';

let failures = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

test('no fabricated fallback: missing price => PRICE_UNRESOLVED, amount basis 0', () => {
  const r = resolveQtoSyncPrice(undefined);
  eq(r.unitPrice, 0, 'unitPrice');
  eq(r.priceStatus, 'PRICE_UNRESOLVED', 'priceStatus');
  eq(r.verificationStatus, 'NEEDS_VERIFICATION', 'verificationStatus');
  ok(!!r.notes, 'must carry an explanatory note');
  ok(r.unitPrice !== 125000, 'must NEVER be the old 125000 fabrication');
});

test('NaN / Infinity price => PRICE_UNRESOLVED', () => {
  eq(resolveQtoSyncPrice(NaN).priceStatus, 'PRICE_UNRESOLVED', 'NaN');
  eq(resolveQtoSyncPrice(Infinity).priceStatus, 'PRICE_UNRESOLVED', 'Infinity');
});

test('explicit 0 price is RESOLVED (zero is a real price, not missing data)', () => {
  const r = resolveQtoSyncPrice(0);
  eq(r.priceStatus, 'PRICE_RESOLVED', 'priceStatus');
  eq(r.unitPrice, 0, 'unitPrice');
});

test('caller-supplied price => PRICE_RESOLVED', () => {
  const r = resolveQtoSyncPrice(85000);
  eq(r.unitPrice, 85000, 'unitPrice');
  eq(r.priceStatus, 'PRICE_RESOLVED', 'priceStatus');
  eq(r.verificationStatus, 'VERIFIED', 'verificationStatus');
});

test('no fabricated AHSP code: missing code => empty string', () => {
  eq(resolveQtoSyncCode(undefined, undefined), '', 'empty when nothing supplied');
  ok(resolveQtoSyncCode(undefined, undefined) !== 'AHSP.2026.01', 'must NEVER be the fake code');
  eq(resolveQtoSyncCode('A.1.1', 'X'), 'A.1.1', 'explicit ahspCode wins');
  eq(resolveQtoSyncCode(undefined, 'B.2'), 'B.2', 'qto kode used when present');
});

console.log(failures === 0 ? '\nALL QTO SYNC PRICING TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

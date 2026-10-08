/**
 * Phase 2 hardening regression tests — RAB financial-integrity write path.
 *
 * Run: npx tsx src/test/phase2RabIntegrity.test.ts
 *
 * Guards:
 *  - missing/null/NaN/empty unit price -> PRICE_UNRESOLVED + NEEDS_VERIFICATION
 *    (never silent Rp0, never VERIFIED)
 *  - explicit 0 price -> PRICE_RESOLVED (zero is a real price)
 *  - unresolved items are EXCLUDED from cost-summary totals and counted
 *  - legacy items (no priceStatus) keep old behavior (included in totals)
 */
import { resolvePriceStatus, isPriceUnresolved } from '../engine/pricing/priceStatus';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import type { RabItem } from '../types';

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertion'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const mkItem = (over: Partial<RabItem>): RabItem =>
  ({
    id: 't-' + Math.random().toString(36).slice(2, 6),
    projectId: 'p1',
    no: 1,
    code: '',
    category: '01. PEKERJAAN PERSIAPAN',
    description: 'test',
    volume: 1,
    unit: 'm3',
    unitPrice: 0,
    amount: 0,
    ...over,
  } as RabItem);

// ---------------------------------------------------------------- status ---
test('null price -> PRICE_UNRESOLVED', () => eq(resolvePriceStatus(null), 'PRICE_UNRESOLVED'));
test('undefined price -> PRICE_UNRESOLVED', () => eq(resolvePriceStatus(undefined), 'PRICE_UNRESOLVED'));
test('NaN price -> PRICE_UNRESOLVED', () => eq(resolvePriceStatus(NaN), 'PRICE_UNRESOLVED'));
test('empty-string price -> PRICE_UNRESOLVED', () => eq(resolvePriceStatus(''), 'PRICE_UNRESOLVED'));
test('non-numeric price -> PRICE_UNRESOLVED', () => eq(resolvePriceStatus('abc'), 'PRICE_UNRESOLVED'));
test('Infinity price -> PRICE_UNRESOLVED', () => eq(resolvePriceStatus(Infinity), 'PRICE_UNRESOLVED'));
test('explicit 0 price -> PRICE_RESOLVED (zero is real)', () => eq(resolvePriceStatus(0), 'PRICE_RESOLVED'));
test('string "0" price -> PRICE_RESOLVED', () => eq(resolvePriceStatus('0'), 'PRICE_RESOLVED'));
test('normal price -> PRICE_RESOLVED', () => eq(resolvePriceStatus(150000), 'PRICE_RESOLVED'));
test('isPriceUnresolved helper', () => {
  ok(isPriceUnresolved('PRICE_UNRESOLVED'), 'unresolved');
  ok(!isPriceUnresolved('PRICE_RESOLVED'), 'resolved');
  ok(!isPriceUnresolved(undefined), 'legacy undefined');
});

// ------------------------------------------------------------- factory ---
test('factory: missing price -> UNRESOLVED + NEEDS_VERIFICATION', () => {
  const it = createRabItemRecord(
    { description: 'Galian', volume: 10, unit: 'm3', unitPrice: undefined as unknown as number },
    'p1'
  );
  eq(it.priceStatus, 'PRICE_UNRESOLVED');
  eq(it.verificationStatus, 'NEEDS_VERIFICATION');
  eq(it.unitPrice, 0);
  eq(it.amount, 0);
});
test('factory: null price -> UNRESOLVED + NEEDS_VERIFICATION', () => {
  const it = createRabItemRecord(
    { description: 'Urugan', volume: 5, unit: 'm3', unitPrice: null as unknown as number },
    'p1'
  );
  eq(it.priceStatus, 'PRICE_UNRESOLVED');
  eq(it.verificationStatus, 'NEEDS_VERIFICATION');
});
test('factory: NaN price -> UNRESOLVED (not Rp0-VERIFIED)', () => {
  const it = createRabItemRecord(
    { description: 'Beton', volume: 2, unit: 'm3', unitPrice: NaN },
    'p1'
  );
  eq(it.priceStatus, 'PRICE_UNRESOLVED');
  eq(it.verificationStatus, 'NEEDS_VERIFICATION');
});
test('factory: valid price -> RESOLVED + VERIFIED + correct amount', () => {
  const it = createRabItemRecord(
    { description: 'Bekisting', volume: 20, unit: 'm2', unitPrice: 150000 },
    'p1'
  );
  eq(it.priceStatus, 'PRICE_RESOLVED');
  eq(it.verificationStatus, 'VERIFIED');
  eq(it.amount, 3000000);
});
test('factory: explicit 0 price stays RESOLVED (not flagged)', () => {
  const it = createRabItemRecord(
    { description: 'Gratis', volume: 1, unit: 'ls', unitPrice: 0 },
    'p1'
  );
  eq(it.priceStatus, 'PRICE_RESOLVED');
  eq(it.verificationStatus, 'VERIFIED');
});
test('factory: caller-supplied verificationStatus is respected', () => {
  const it = createRabItemRecord(
    { description: 'X', volume: 1, unit: 'ls', unitPrice: 100, verificationStatus: 'AI_GENERATED' },
    'p1'
  );
  eq(it.verificationStatus, 'AI_GENERATED');
});

// -------------------------------------------------------------- summary ---
test('summary excludes UNRESOLVED items from totals and counts them', () => {
  const items = [
    mkItem({ id: 'a', unitPrice: 100000, amount: 100000, priceStatus: 'PRICE_RESOLVED' }),
    mkItem({ id: 'b', unitPrice: 200000, amount: 200000, priceStatus: 'PRICE_RESOLVED' }),
    mkItem({ id: 'c', unitPrice: 0, amount: 0, priceStatus: 'PRICE_UNRESOLVED' }),
  ];
  const s = UnifiedProjectEngine.recalculateCostSummary(items);
  eq(s.directCost, 300000, 'directCost must exclude unresolved');
  eq(s.unresolvedItems, 1);
  eq(JSON.stringify(s.unresolvedItemIds), JSON.stringify(['c']));
  ok(s.grandTotal > 0 && s.grandTotal < 400000, 'grandTotal derived from 300k only');
});
test('summary: legacy items without priceStatus are included (backward compat)', () => {
  const items = [mkItem({ id: 'a', amount: 50000 }), mkItem({ id: 'b', amount: 70000 })];
  const s = UnifiedProjectEngine.recalculateCostSummary(items);
  eq(s.directCost, 120000);
  eq(s.unresolvedItems, 0);
});
test('summary: all-unresolved -> zero totals, all counted', () => {
  const items = [
    mkItem({ id: 'a', priceStatus: 'PRICE_UNRESOLVED' }),
    mkItem({ id: 'b', priceStatus: 'PRICE_UNRESOLVED' }),
  ];
  const s = UnifiedProjectEngine.recalculateCostSummary(items);
  eq(s.directCost, 0);
  eq(s.grandTotal, 0);
  eq(s.unresolvedItems, 2);
});

console.log(failures === 0 ? '\nALL PHASE 2 INTEGRITY TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;

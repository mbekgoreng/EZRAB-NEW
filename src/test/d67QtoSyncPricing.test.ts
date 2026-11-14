/**
 * D-67 (P2) — QTO sync must preserve the calculator price (and its
 * provenance) instead of silently producing a Rp0 / PRICE_UNRESOLVED item.
 * Pure tests for src/lib/qtoSyncPricing.ts (decideQtoSyncPrice).
 * Run: npx tsx src/test/d67QtoSyncPricing.test.ts
 *
 * Audit numbers: Bowplank 42,40 m × Rp67.742 = Rp2.872.250 (Fase 8).
 * The rekap sync used to drop that price entirely; the calculator's own
 * "Tambahkan & Sinkron ke RAB" path preserved it.
 */
import {
  decideQtoSyncPrice,
  checkQtoStoredPriceTransfer,
  resolveQtoSyncPrice,
  type QtoStoredPriceInput,
  type ExistingSyncedRabInput,
} from '../lib/qtoSyncPricing';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const deepEq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: differs.\n  expected: ${JSON.stringify(b)}\n  got:      ${JSON.stringify(a)}`);
};

// --- fixtures (audit Bowplank numbers) ---------------------------------------

const pricedQto = (): QtoStoredPriceInput => ({
  unitPrice: 67742,
  totalCost: 2872250,
  priceStatus: 'PRICE_RESOLVED',
  priceUnit: 'm',
  unit: 'm',
  priceNotes: 'Harga kalkulator BOWPLANK: grand total Rp2.872.250 / 42,40 m',
});

const unpricedQto = (): QtoStoredPriceInput => ({ unit: 'm' });

// --- new-item sync -----------------------------------------------------------

test('priced QTO item: stored price + provenance transfer to the RAB item', () => {
  const d = decideQtoSyncPrice({ qto: pricedQto() });
  eq(d.transferred, true, 'transferred');
  eq(d.source, 'QTO_STORED', 'source');
  eq(d.unitPrice, 67742, 'unitPrice is the calculator unit price (not 0)');
  eq(d.priceStatus, 'PRICE_RESOLVED', 'priceStatus');
  eq(d.verificationStatus, 'VERIFIED', 'verificationStatus');
  eq(d.notes, 'Harga kalkulator BOWPLANK: grand total Rp2.872.250 / 42,40 m', 'priceNotes traceability carried');
  ok(d.unitPrice !== 0, 'never the Rp0 sentinel for a priced item');
});

test('unpriced QTO item: PRICE_UNRESOLVED with a clear reason (never invented)', () => {
  const d = decideQtoSyncPrice({ qto: unpricedQto() });
  eq(d.transferred, false, 'not transferred');
  eq(d.source, 'UNRESOLVED', 'source');
  eq(d.unitPrice, 0, 'sentinel 0 with UNRESOLVED status (existing P1 convention)');
  eq(d.priceStatus, 'PRICE_UNRESOLVED', 'priceStatus');
  eq(d.verificationStatus, 'NEEDS_VERIFICATION', 'verificationStatus');
  ok(!!d.reason && d.reason.includes('belum memiliki harga'), 'reason explains the missing price');
  ok(!!d.notes && d.notes.includes('tidak mengarang harga'), 'note is honest');
});

test('manually priced item: PRICE_MANUAL is preserved, never upgraded to RESOLVED', () => {
  const d = decideQtoSyncPrice({
    qto: { unitPrice: 85000, totalCost: 85000, priceStatus: 'PRICE_MANUAL', priceUnit: 'm³', unit: 'm³' },
  });
  eq(d.transferred, true, 'transferred');
  eq(d.unitPrice, 85000, 'unitPrice');
  eq(d.priceStatus, 'PRICE_MANUAL', 'manual status preserved');
  eq(d.source, 'QTO_STORED', 'source');
});

test('estimated-price item: PRICE_ESTIMATED stays ESTIMATED and needs verification', () => {
  const d = decideQtoSyncPrice({
    qto: { unitPrice: 67742, priceStatus: 'PRICE_ESTIMATED', priceUnit: 'm', unit: 'm' },
  });
  eq(d.transferred, true, 'transferred');
  eq(d.priceStatus, 'PRICE_ESTIMATED', 'estimate is NOT silently upgraded to RESOLVED');
  eq(d.verificationStatus, 'NEEDS_VERIFICATION', 'an estimate is not VERIFIED');
});

test('unit mismatch: stored price is NOT transferred, with both units named', () => {
  const d = decideQtoSyncPrice({
    qto: { unitPrice: 67742, priceStatus: 'PRICE_RESOLVED', priceUnit: 'm³', unit: 'm' },
  });
  eq(d.transferred, false, 'not transferred');
  eq(d.priceStatus, 'PRICE_UNRESOLVED', 'falls back to unresolved, never a wrong-unit price');
  ok(!!d.reason && d.reason.includes('m³') && d.reason.includes('(m)'), 'reason names both units');
  const check = checkQtoStoredPriceTransfer({ unitPrice: 67742, priceUnit: 'm³', unit: 'm' });
  eq(check.transferable, false, 'check agrees');
});

test('stored price without a recorded unit transfers (nothing to contradict it)', () => {
  const d = decideQtoSyncPrice({ qto: { unitPrice: 50000, priceStatus: 'PRICE_RESOLVED', unit: 'm' } });
  eq(d.transferred, true, 'transferred when priceUnit is absent');
});

test('NaN / null stored price never transfers', () => {
  eq(decideQtoSyncPrice({ qto: { unitPrice: NaN, unit: 'm' } }).transferred, false, 'NaN');
  eq(decideQtoSyncPrice({ qto: { unitPrice: null, unit: 'm' } }).transferred, false, 'null');
  eq(decideQtoSyncPrice({ qto: { unitPrice: Infinity, unit: 'm' } }).transferred, false, 'Infinity');
});

test('provenance warnings travel with the stored price', () => {
  const d = decideQtoSyncPrice({
    qto: { ...pricedQto(), priceValidationWarnings: ['Harga lintas-wilayah: sumber DKI Jakarta'] },
  });
  deepEq(d.priceValidationWarnings, ['Harga lintas-wilayah: sumber DKI Jakarta'], 'warnings carried');
});

// --- precedence --------------------------------------------------------------

test('explicit caller price always wins over the stored price', () => {
  const d = decideQtoSyncPrice({ customUnitPrice: 90000, qto: pricedQto() });
  eq(d.source, 'CALLER', 'source');
  eq(d.unitPrice, 90000, 'caller price wins');
  eq(d.priceStatus, 'PRICE_RESOLVED', 'priceStatus');
});

// --- re-sync (existing mapping) ----------------------------------------------

test('manually priced RAB item is NEVER overwritten by a stored QTO price', () => {
  const existing: ExistingSyncedRabInput = {
    unitPrice: 100000,
    priceStatus: 'PRICE_RESOLVED',
    verificationStatus: 'VERIFIED',
  };
  const d = decideQtoSyncPrice({ qto: pricedQto(), existingRab: existing });
  eq(d.source, 'EXISTING', 'source');
  eq(d.unitPrice, 100000, 'manual RAB price preserved');
  eq(d.priceStatus, 'PRICE_RESOLVED', 'status preserved');
  eq(d.transferred, false, 'stored price not applied');
});

test('legacy RAB item without a status is treated as priced (never overwritten)', () => {
  const d = decideQtoSyncPrice({
    qto: pricedQto(),
    existingRab: { unitPrice: 50000, verificationStatus: 'VERIFIED' },
  });
  eq(d.unitPrice, 50000, 'legacy price preserved');
  eq(d.source, 'EXISTING', 'source');
});

test('retry after failure: unresolved RAB item is healed once the QTO has a price', () => {
  // First sync (before the fix / before a complete recalculation) created
  // an UNRESOLVED item; after the calculator run completes, re-sync heals it.
  const existing: ExistingSyncedRabInput = {
    unitPrice: 0,
    priceStatus: 'PRICE_UNRESOLVED',
    verificationStatus: 'NEEDS_VERIFICATION',
  };
  const d = decideQtoSyncPrice({ qto: pricedQto(), existingRab: existing });
  eq(d.source, 'QTO_STORED', 'source');
  eq(d.unitPrice, 67742, 'price applied on retry');
  eq(d.priceStatus, 'PRICE_RESOLVED', 'status healed');
  eq(d.verificationStatus, 'VERIFIED', 'verification healed');
});

test('retry with still no price: unresolved item stays unresolved (no invention)', () => {
  const existing: ExistingSyncedRabInput = {
    unitPrice: 0,
    priceStatus: 'PRICE_UNRESOLVED',
    verificationStatus: 'NEEDS_VERIFICATION',
  };
  const d = decideQtoSyncPrice({ qto: unpricedQto(), existingRab: existing });
  eq(d.priceStatus, 'PRICE_UNRESOLVED', 'stays unresolved');
  eq(d.unitPrice, 0, 'stays sentinel 0');
  ok(!!d.reason, 'reason carried for the UI warning');
});

test('duplicate sync is deterministic: same inputs, same decision', () => {
  const args = { qto: pricedQto() };
  const first = decideQtoSyncPrice(args);
  const second = decideQtoSyncPrice({ qto: pricedQto() });
  deepEq(second, first, 'decisions identical across duplicate syncs');
  const reArgs = {
    qto: pricedQto(),
    existingRab: { unitPrice: 67742, priceStatus: 'PRICE_RESOLVED' as const, verificationStatus: 'VERIFIED' as const },
  };
  deepEq(decideQtoSyncPrice(reArgs), decideQtoSyncPrice(reArgs), 're-sync decisions identical');
});

// --- P1 contract spot-checks (must not regress) -------------------------------

test('P1 PRICE-1 contract intact: no price => UNRESOLVED; explicit 0 => RESOLVED', () => {
  eq(resolveQtoSyncPrice(undefined).priceStatus, 'PRICE_UNRESOLVED', 'undefined');
  eq(resolveQtoSyncPrice(NaN).priceStatus, 'PRICE_UNRESOLVED', 'NaN');
  eq(resolveQtoSyncPrice(0).priceStatus, 'PRICE_RESOLVED', 'explicit zero is a real price');
  eq(resolveQtoSyncPrice(85000).unitPrice, 85000, 'caller price');
});

console.log(failures === 0 ? `\nALL D-67 QTO SYNC PRICING TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);

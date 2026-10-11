/**
 * Phase 2I.2: Partial total integrity & price status.
 * Run: npx tsx src/test/phase2i2PartialTotal.test.ts
 */
import { calculateRabTotals } from '../calculations/decimalEngine';
import { mapRabRows } from '../document-engine/integrations/rabIntegration';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail: string) => {
  if (cond) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label} — ${detail}`); }
};

console.log('Engine: isPartial flag');
{
  const priced = [
    { amount: 1000000 }, { amount: 2000000 },
  ] as any;
  const r1 = calculateRabTotals(priced);
  check('semua priced → isPartial=false', r1.isPartial === false && r1.unpricedCount === 0,
    `isPartial=${r1.isPartial}`);
  check('total benar', r1.subtotal === 3000000, `subtotal=${r1.subtotal}`);

  const mixed = [
    { amount: 1000000 }, { amount: null }, { amount: undefined }, { amount: 0 },
  ] as any;
  const r2 = calculateRabTotals(mixed);
  check('2 unpriced → isPartial=true, unpricedCount=2',
    r2.isPartial === true && r2.unpricedCount === 2,
    `isPartial=${r2.isPartial}, count=${r2.unpricedCount}`);
  check('null tidak jadi 0 di subtotal (1jt + 0 eksplisit)',
    r2.subtotal === 1000000, `subtotal=${r2.subtotal}`);
  check('grandTotal tetap dihitung dari priced saja',
    r2.grandTotal === Math.round(1000000 * 1.05 * 1.11), `grandTotal=${r2.grandTotal}`);
}

console.log('rabIntegration: null dipertahankan');
{
  const rows = mapRabRows([
    { code: 'A', unitPrice: 50000, volume: 2, priceStatus: 'PRICE_RESOLVED' },
    { code: 'B', unitPrice: null, volume: 3, priceStatus: 'PRICE_UNRESOLVED' },
    { code: 'C', unitPrice: 0, volume: 1, priceStatus: 'PRICE_RESOLVED' },
  ] as any);
  check('A: amount=100000', rows[0].amount === 100000, `dapat ${rows[0].amount}`);
  check('B: unitPrice null, amount null', rows[1].unitPrice === null && rows[1].amount === null,
    `unitPrice=${rows[1].unitPrice}, amount=${rows[1].amount}`);
  check('B: priceStatus UNRESOLVED', (rows[1] as any).priceStatus === 'PRICE_UNRESOLVED',
    `dapat ${(rows[1] as any).priceStatus}`);
  check('C: nol eksplisit dibedakan (amount=0, bukan null)', rows[2].amount === 0 && rows[2].unitPrice === 0,
    `amount=${rows[2].amount}`);
}

console.log(`\nTOTAL: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);

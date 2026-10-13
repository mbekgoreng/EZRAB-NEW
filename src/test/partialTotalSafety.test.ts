/**
 * Regression tests: Partial totals, mixed sources, legacy data
 *
 * Tests the actual calculateRabTotals behavior used by the app.
 */
import { describe, it, expect } from 'vitest';
import { calculateRabTotals } from '../calculations/decimalEngine';
import type { RabItem } from '../types';

function item(overrides: Partial<RabItem> = {}): RabItem {
  return {
    id: 'R1',
    no: 1,
    code: 'T.1',
    category: 'Test',
    description: 'Test',
    volume: 1,
    unit: 'm3',
    unitPrice: 100000,
    amount: 100000,
    ...overrides,
  } as RabItem;
}

describe('Partial total safety', () => {
  it('1. all official → not partial', () => {
    const r = calculateRabTotals([
      item({ amount: 100000, priceSourceKind: 'OFFICIAL_AHSP' }),
      item({ amount: 200000, priceSourceKind: 'OFFICIAL_AHSP' }),
    ]);
    expect(r.isPartial).toBe(false);
    expect(r.unpricedCount).toBe(0);
    expect(r.subtotal).toBe(300000);
  });

  it('2. mixed official + assumption → not partial (assumption is priced)', () => {
    const r = calculateRabTotals([
      item({ amount: 100000, priceSourceKind: 'OFFICIAL_AHSP' }),
      item({ amount: 50000, priceSourceKind: 'EZRAB_ASSUMPTION' }),
    ]);
    // Assumption has a price, so not counted as unpriced
    expect(r.isPartial).toBe(false);
    expect(r.subtotal).toBe(150000);
  });

  it('3. unresolved item → partial, excluded from total', () => {
    const r = calculateRabTotals([
      item({ amount: 100000, priceSourceKind: 'OFFICIAL_AHSP' }),
      item({ amount: null, unitPrice: null, priceSourceKind: 'UNRESOLVED' }),
    ]);
    expect(r.isPartial).toBe(true);
    expect(r.unpricedCount).toBe(1);
    expect(r.subtotal).toBe(100000); // unresolved not in total
  });

  it('4. explicit zero is valid, not unpriced', () => {
    const r = calculateRabTotals([
      item({ amount: 0, unitPrice: 0 }), // explicit zero
    ]);
    expect(r.isPartial).toBe(false);
    expect(r.unpricedCount).toBe(0);
  });

  it('5. null amount → partial (not zero)', () => {
    const r = calculateRabTotals([
      item({ amount: null, unitPrice: null }),
    ]);
    expect(r.isPartial).toBe(true);
    expect(r.subtotal).toBe(0);
    // subtotal 0 here means "nothing priced", not "total is zero"
  });

  it('6. legacy items without provenance work normally', () => {
    const r = calculateRabTotals([
      item({ amount: 100000 }), // no priceSourceKind
    ]);
    expect(r.isPartial).toBe(false);
    expect(r.subtotal).toBe(100000);
  });

  it('7. empty list → not partial, zero totals', () => {
    const r = calculateRabTotals([]);
    expect(r.isPartial).toBe(false);
    expect(r.subtotal).toBe(0);
  });
});

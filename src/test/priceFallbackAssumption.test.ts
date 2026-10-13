/**
 * Tests: EZRAB Price Fallback & Assumption Layer
 * Covers the 15 mandatory scenarios (core logic).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssumptionStore,
  resolveWithFallback,
  PRICE_SOURCE_LABELS,
  isAssumptionUsable,
} from '../engine/pricing/assumption/index';

describe('AssumptionStore', () => {
  let store: AssumptionStore;
  beforeEach(() => {
    store = new AssumptionStore();
  });

  it('1. creates assumption as DRAFT with required basis', () => {
    const a = store.create(
      {
        resourceCode: 'M.001',
        resourceName: 'Semen',
        resourceType: 'material',
        price: 75000,
        unit: 'zak',
        validFrom: '2026-01-01',
        sourceNote: 'Survei toko Jakarta Jan 2026',
      },
      'estimator1'
    );
    expect(a.status).toBe('DRAFT');
    expect(a.history).toHaveLength(1);
  });

  it('2. rejects creation without basis (sourceNote)', () => {
    expect(() =>
      store.create(
        {
          resourceCode: 'M.001',
          resourceName: 'Semen',
          resourceType: 'material',
          price: 75000,
          unit: 'zak',
          validFrom: '2026-01-01',
          sourceNote: '',
        },
        'estimator1'
      )
    ).toThrow();
  });

  it('3. blocks self-approval', () => {
    const a = store.create(
      {
        resourceCode: 'M.001',
        resourceName: 'Semen',
        resourceType: 'material',
        price: 75000,
        unit: 'zak',
        validFrom: '2026-01-01',
        sourceNote: 'Survei',
      },
      'estimator1'
    );
    store.submit(a.id, 'estimator1');
    expect(() => store.approve(a.id, 'estimator1')).toThrow(/self-approval/i);
  });

  it('4. full workflow DRAFT → PENDING → APPROVED', () => {
    const a = store.create(
      {
        resourceCode: 'M.001',
        resourceName: 'Semen',
        resourceType: 'material',
        price: 75000,
        unit: 'zak',
        validFrom: '2026-01-01',
        sourceNote: 'Survei',
      },
      'estimator1'
    );
    store.submit(a.id, 'estimator1');
    expect(store.get(a.id)!.status).toBe('PENDING');
    store.approve(a.id, 'manager1');
    const done = store.get(a.id)!;
    expect(done.status).toBe('APPROVED');
    expect(done.approvedBy).toBe('manager1');
    expect(done.history.length).toBeGreaterThanOrEqual(3);
  });

  it('5. DRAFT assumption is not usable', () => {
    const a = store.create(
      {
        resourceCode: 'M.001',
        resourceName: 'Semen',
        resourceType: 'material',
        price: 75000,
        unit: 'zak',
        validFrom: '2026-01-01',
        sourceNote: 'Survei',
      },
      'estimator1'
    );
    expect(isAssumptionUsable(a)).toBe(false);
  });

  it('6. expired assumption is not usable', () => {
    const a = store.create(
      {
        resourceCode: 'M.001',
        resourceName: 'Semen',
        resourceType: 'material',
        price: 75000,
        unit: 'zak',
        validFrom: '2020-01-01',
        validUntil: '2020-12-31',
        sourceNote: 'Survei lama',
      },
      'estimator1'
    );
    store.submit(a.id, 'estimator1');
    store.approve(a.id, 'manager1');
    // sweep expiry
    store.sweepExpiry(new Date('2026-06-01'));
    expect(store.get(a.id)!.status).toBe('EXPIRED');
  });
});

describe('FallbackResolver', () => {
  let store: AssumptionStore;
  beforeEach(async () => {
    // use isolated store via module singleton reset
    const mod = await import('../engine/pricing/assumption/assumptionStore');
    mod.assumptionStore.clear();
    store = mod.assumptionStore;
  });

  it('7. official price wins (tier 1)', () => {
    const r = resolveWithFallback({
      resourceCode: 'M.001',
      unit: 'zak',
      lookupOfficial: () => ({ price: 70000, sourceName: 'HSPK DKI 2026' }),
    });
    expect(r.sourceKind).toBe('OFFICIAL_AHSP');
    expect(r.price).toBe(70000);
    expect(r.usableInFinal).toBe(true);
    expect(r.sourceLabel).toBe(PRICE_SOURCE_LABELS.OFFICIAL_AHSP);
  });

  it('8. market reference used when official missing (tier 2)', () => {
    const r = resolveWithFallback({
      resourceCode: 'M.001',
      unit: 'zak',
      lookupOfficial: () => null,
      lookupMarket: () => ({ price: 72000, sourceName: 'Supplier A' }),
    });
    expect(r.sourceKind).toBe('MARKET_REFERENCE');
    expect(r.price).toBe(72000);
  });

  it('9. approved assumption used when official+market missing (tier 3)', () => {
    const a = store.create(
      {
        resourceCode: 'M.001',
        resourceName: 'Semen',
        resourceType: 'material',
        price: 75000,
        unit: 'zak',
        validFrom: '2026-01-01',
        sourceNote: 'Survei',
      },
      'estimator1'
    );
    store.submit(a.id, 'estimator1');
    store.approve(a.id, 'manager1');

    const r = resolveWithFallback({
      resourceCode: 'M.001',
      unit: 'zak',
      lookupOfficial: () => null,
    });
    expect(r.sourceKind).toBe('EZRAB_ASSUMPTION');
    expect(r.price).toBe(75000);
    expect(r.assumptionId).toBe(a.id);
    expect(r.explanation).toMatch(/BUKAN harga resmi/i);
  });

  it('10. DRAFT assumption is NOT used', () => {
    store.create(
      {
        resourceCode: 'M.002',
        resourceName: 'Pasir',
        resourceType: 'material',
        price: 300000,
        unit: 'm3',
        validFrom: '2026-01-01',
        sourceNote: 'Survei',
      },
      'estimator1'
    );
    const r = resolveWithFallback({
      resourceCode: 'M.002',
      unit: 'm3',
      lookupOfficial: () => null,
    });
    expect(r.sourceKind).toBe('UNRESOLVED');
    expect(r.price).toBeNull();
  });

  it('11. unresolved when nothing valid (tier 4)', () => {
    const r = resolveWithFallback({
      resourceCode: 'M.999',
      unit: 'unit',
      lookupOfficial: () => null,
    });
    expect(r.sourceKind).toBe('UNRESOLVED');
    expect(r.price).toBeNull();
    expect(r.usableInFinal).toBe(false);
    expect(r.sourceLabel).toBe('HARGA BELUM TERSEDIA');
  });

  it('12. unit mismatch does not produce wrong price', () => {
    const a = store.create(
      {
        resourceCode: 'M.001',
        resourceName: 'Semen',
        resourceType: 'material',
        price: 75000,
        unit: 'zak', // assumption in zak
        validFrom: '2026-01-01',
        sourceNote: 'Survei',
      },
      'estimator1'
    );
    store.submit(a.id, 'estimator1');
    store.approve(a.id, 'manager1');

    // query in kg — must NOT match zak assumption
    const r = resolveWithFallback({
      resourceCode: 'M.001',
      unit: 'kg',
      lookupOfficial: () => null,
    });
    expect(r.sourceKind).toBe('UNRESOLVED');
  });

  it('13. official price is never overwritten by assumption', () => {
    const a = store.create(
      {
        resourceCode: 'M.003',
        resourceName: 'Bata',
        resourceType: 'material',
        price: 999999, // wrong high price
        unit: 'buah',
        validFrom: '2026-01-01',
        sourceNote: 'Survei',
      },
      'estimator1'
    );
    store.submit(a.id, 'estimator1');
    store.approve(a.id, 'manager1');

    const r = resolveWithFallback({
      resourceCode: 'M.003',
      unit: 'buah',
      lookupOfficial: () => ({ price: 1500, sourceName: 'HSPK' }),
    });
    // official wins even though assumption exists
    expect(r.sourceKind).toBe('OFFICIAL_AHSP');
    expect(r.price).toBe(1500);
  });
});

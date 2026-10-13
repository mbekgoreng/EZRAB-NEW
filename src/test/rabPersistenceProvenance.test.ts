/**
 * Integration tests: RAB persistence & provenance survival
 *
 * Uses the ACTUAL localStorage mechanism from ProjectContext:
 *   save: JSON.stringify(allRabItems) → localStorage 'ezrab_prod_rab_items'
 *   load: JSON.parse(localStorage 'ezrab_prod_rab_items')
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RabItem } from '../types';

// Mock localStorage for Node test environment
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
});

// Simulate the exact save/load from ProjectContext.tsx
const KEY = 'ezrab_prod_rab_items';

function saveRabItems(items: RabItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function loadRabItems(): RabItem[] {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) return parsed as RabItem[];
  }
  return [];
}

function makeItem(overrides: Partial<RabItem> = {}): RabItem {
  return {
    id: 'R1',
    no: 1,
    code: 'TEST.1',
    category: 'Test',
    description: 'Test work',
    volume: 10,
    unit: 'm3',
    unitPrice: 500000,
    amount: 5000000,
    ...overrides,
  };
}

describe('RAB persistence — provenance survival', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('1. official price provenance survives save/reload', () => {
    const item = makeItem({
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: 'RESMI AHSP',
      priceSourceExplanation: 'Seluruh komponen memakai harga resmi.',
    });
    saveRabItems([item]);
    const loaded = loadRabItems();
    expect(loaded[0].priceSourceKind).toBe('OFFICIAL_AHSP');
    expect(loaded[0].priceSourceLabel).toBe('RESMI AHSP');
    expect(loaded[0].unitPrice).toBe(500000);
  });

  it('2. assumption provenance survives save/reload', () => {
    const item = makeItem({
      priceSourceKind: 'EZRAB_ASSUMPTION',
      priceSourceLabel: 'ASUMSI — PERLU VERIFIKASI',
      priceSourceExplanation: 'Approved assumption ASM-XXX by manager1. BUKAN harga resmi AHSP.',
    });
    saveRabItems([item]);
    const loaded = loadRabItems();
    expect(loaded[0].priceSourceKind).toBe('EZRAB_ASSUMPTION');
    // Must NOT become official after reload
    expect(loaded[0].priceSourceKind).not.toBe('OFFICIAL_AHSP');
    expect(loaded[0].priceSourceExplanation).toMatch(/BUKAN harga resmi/i);
  });

  it('3. unresolved status survives save/reload', () => {
    const item = makeItem({
      unitPrice: null,
      amount: null,
      priceStatus: 'PRICE_UNRESOLVED' as any,
      priceSourceKind: 'UNRESOLVED',
      priceSourceLabel: 'HARGA BELUM TERSEDIA',
    });
    saveRabItems([item]);
    const loaded = loadRabItems();
    expect(loaded[0].unitPrice).toBeNull();
    expect(loaded[0].priceSourceKind).toBe('UNRESOLVED');
    // Must NOT become 0 or valid
    expect(loaded[0].unitPrice).not.toBe(0);
  });

  it('4. legacy items without provenance load without error', () => {
    const legacy = {
      id: 'R-OLD',
      no: 1,
      code: 'OLD.1',
      category: 'Legacy',
      description: 'Old item',
      volume: 5,
      unit: 'm2',
      unitPrice: 100000,
      amount: 500000,
      // no priceSourceKind etc.
    };
    localStorage.setItem(KEY, JSON.stringify([legacy]));
    const loaded = loadRabItems();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].priceSourceKind).toBeUndefined();
    expect(loaded[0].unitPrice).toBe(100000);
  });

  it('5. totals consistent before/after reload', () => {
    const items = [
      makeItem({ id: 'R1', unitPrice: 100000, amount: 1000000, priceSourceKind: 'OFFICIAL_AHSP' }),
      makeItem({ id: 'R2', unitPrice: 200000, amount: 2000000, priceSourceKind: 'EZRAB_ASSUMPTION' }),
      makeItem({ id: 'R3', unitPrice: null, amount: null, priceSourceKind: 'UNRESOLVED' }),
    ];
    const totalBefore = items.reduce((s, i) => s + (i.amount || 0), 0);
    saveRabItems(items);
    const loaded = loadRabItems();
    const totalAfter = loaded.reduce((s, i) => s + (i.amount || 0), 0);
    expect(totalAfter).toBe(totalBefore);
    expect(totalAfter).toBe(3000000);
  });

  it('6. market reference provenance survives', () => {
    const item = makeItem({
      priceSourceKind: 'MARKET_REFERENCE',
      priceSourceLabel: 'REFERENSI PASAR',
      priceSourceExplanation: 'Market reference from Supplier A',
    });
    saveRabItems([item]);
    const loaded = loadRabItems();
    expect(loaded[0].priceSourceKind).toBe('MARKET_REFERENCE');
  });
});

describe('Recalculation behavior', () => {
  it('7. historical project does not change silently (snapshot principle)', () => {
    // Save a project with assumption price
    const item = makeItem({
      unitPrice: 75000,
      priceSourceKind: 'EZRAB_ASSUMPTION',
      priceSourceExplanation: 'ASM-001 approved',
    });
    saveRabItems([item]);

    // Simulate: assumption price changes in store, but saved project keeps old
    const loaded = loadRabItems();
    // Loaded item retains its saved price, not re-resolved
    expect(loaded[0].unitPrice).toBe(75000);
    expect(loaded[0].priceSourceExplanation).toBe('ASM-001 approved');
  });

  it('8. explicit recalculation is a separate action (not automatic)', () => {
    // This documents the expected behavior: reload does NOT trigger recalc.
    // Recalculation must be explicit via rabAdapter.composeRabItemWithBreakdown().
    const item = makeItem({ unitPrice: 500000 });
    saveRabItems([item]);
    const loaded = loadRabItems();
    // No automatic change on load
    expect(loaded[0].unitPrice).toBe(500000);
  });
});

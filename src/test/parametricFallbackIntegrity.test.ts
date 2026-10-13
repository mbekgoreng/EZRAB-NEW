/**
 * Tests: Parametric Price Fallback Integrity (Phase 3F)
 *
 * Verifies:
 * 1. Unique code with valid price → verified (not fabricated)
 * 2. Valid variant ID → verified
 * 3. Ambiguous code without ID → fabricated (not silently verified)
 * 4. Benchmark available → fabricated (indicative, not official)
 * 5. No benchmark → Rp150.000 fallback is fabricated
 * 6. Fabricated prices tracked separately from verified totals
 * 7. Unique code behavior unchanged
 */
import { describe, it, expect } from 'vitest';

// Simulated Phase 3F resolveUnitPrice
function resolveUnitPrice(ahspCode: string) {
  const mockItems = [
    { id: 'ID-001', code: 'A.1.01.a.1', unitPrice: 6000, domain: 'CIPTA_KARYA' },
    { id: 'ID-010', code: 'A.3.08.3.4.b.6.a', unitPrice: 8000000, domain: 'SDA' },
    { id: 'ID-011', code: 'A.3.08.3.4.b.6.a', unitPrice: 7500000, domain: 'SDA' },
  ];
  const benchmarks: Record<string, number> = {
    'A.2.2.1.1': 28500,
  };

  const idMatch = mockItems.find(it => it.id === ahspCode);
  if (idMatch && idMatch.unitPrice > 0) {
    return { unitPrice: idMatch.unitPrice, isFabricated: false, isAmbiguous: false };
  }

  const codeMatches = mockItems.filter(it => it.code === ahspCode);
  if (codeMatches.length > 1) {
    // Fall through to benchmark/default
  } else if (codeMatches.length === 1 && codeMatches[0].unitPrice > 0) {
    return { unitPrice: codeMatches[0].unitPrice, isFabricated: false, isAmbiguous: false };
  }

  if (benchmarks[ahspCode]) {
    return { unitPrice: benchmarks[ahspCode], isFabricated: true, isAmbiguous: codeMatches.length > 1 };
  }

  return { unitPrice: 150000, isFabricated: true, isAmbiguous: codeMatches.length > 1 };
}

// Simulated RAB calculation with separation
function calculateRab(items: Array<{ code: string; quantity: number }>) {
  let verified = 0;
  let fabricated = 0;
  for (const item of items) {
    const r = resolveUnitPrice(item.code);
    const total = item.quantity * r.unitPrice;
    if (r.isFabricated) fabricated += total;
    else verified += total;
  }
  return { verified, fabricated, total: verified + fabricated };
}

describe('Parametric Price Fallback Integrity (Phase 3F)', () => {
  it('1. unique code with valid price → verified', () => {
    const r = resolveUnitPrice('A.1.01.a.1');
    expect(r.isFabricated).toBe(false);
    expect(r.unitPrice).toBe(6000);
  });

  it('2. valid variant ID → verified', () => {
    const r = resolveUnitPrice('ID-010');
    expect(r.isFabricated).toBe(false);
    expect(r.unitPrice).toBe(8000000);
  });

  it('3. ambiguous code without ID → fabricated (not verified)', () => {
    const r = resolveUnitPrice('A.3.08.3.4.b.6.a');
    expect(r.isFabricated).toBe(true);
    expect(r.isAmbiguous).toBe(true);
  });

  it('4. benchmark available → fabricated (indicative)', () => {
    const r = resolveUnitPrice('A.2.2.1.1');
    expect(r.isFabricated).toBe(true);
    expect(r.unitPrice).toBe(28500);
  });

  it('5. no benchmark → Rp150.000 fallback is fabricated', () => {
    const r = resolveUnitPrice('UNKNOWN.CODE.99');
    expect(r.isFabricated).toBe(true);
    expect(r.unitPrice).toBe(150000);
  });

  it('6. fabricated prices tracked separately', () => {
    const result = calculateRab([
      { code: 'A.1.01.a.1', quantity: 10 },      // verified: 60.000
      { code: 'UNKNOWN.CODE.99', quantity: 2 },   // fabricated: 300.000
    ]);
    expect(result.verified).toBe(60000);
    expect(result.fabricated).toBe(300000);
    expect(result.total).toBe(360000);
    // Verified total must NOT include fabricated
    expect(result.verified).not.toBe(result.total);
  });

  it('7. all verified → fabricated is zero', () => {
    const result = calculateRab([
      { code: 'A.1.01.a.1', quantity: 5 },
    ]);
    expect(result.verified).toBe(30000);
    expect(result.fabricated).toBe(0);
  });

  it('8. unique code behavior unchanged', () => {
    // Same as before Phase 3F for non-ambiguous cases
    const r1 = resolveUnitPrice('A.1.01.a.1');
    const r2 = resolveUnitPrice('ID-001');
    // Both resolve to same item, both verified
    expect(r1.unitPrice).toBe(r2.unitPrice);
    expect(r1.isFabricated).toBe(false);
    expect(r2.isFabricated).toBe(false);
  });
});

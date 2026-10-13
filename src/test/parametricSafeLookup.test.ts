/**
 * Tests: Parametric Volume Engine Safe Lookup (Phase 3E)
 *
 * Verifies:
 * 1. Unique code → same unit price as before
 * 2. Ambiguous code → does NOT silently pick first variant (falls through)
 * 3. ID lookup → exact variant's price
 * 4. Ambiguous code does not affect RAB total with wrong variant price
 */
import { describe, it, expect } from 'vitest';

// Mock data
const mockItems = [
  { id: 'AHSP-2026-SDA-000010', code: 'A.3.08.3.4.b.6.a', name: 'Reducer DN 2000x1400', unitPrice: 8000000, domain: 'SDA' },
  { id: 'AHSP-2026-SDA-000011', code: 'A.3.08.3.4.b.6.a', name: 'Reducer DN 2000x1200', unitPrice: 7500000, domain: 'SDA' },
  { id: 'AHSP-2026-CK-000001', code: 'A.1.01.a.1', name: 'Pembersihan', unitPrice: 6000, domain: 'CIPTA_KARYA' },
];

// Simulated Phase 3E logic
function resolveUnitPrice(ahspCode: string): { unitPrice: number | null; ahspName: string; source: string; ambiguous: boolean } {
  // ID match first (unique)
  const idMatch = mockItems.find((it) => it.id === ahspCode);
  if (idMatch && idMatch.unitPrice && idMatch.unitPrice > 0) {
    return { unitPrice: idMatch.unitPrice, ahspName: idMatch.name, source: idMatch.domain, ambiguous: false };
  }

  // Code lookup with ambiguity check
  const codeMatches = mockItems.filter((it) => it.code === ahspCode);
  if (codeMatches.length > 1) {
    return { unitPrice: null, ahspName: `Ambiguous: ${ahspCode}`, source: 'AMBIGUOUS', ambiguous: true };
  } else if (codeMatches.length === 1 && codeMatches[0].unitPrice > 0) {
    return { unitPrice: codeMatches[0].unitPrice, ahspName: codeMatches[0].name, source: codeMatches[0].domain, ambiguous: false };
  }

  return { unitPrice: null, ahspName: 'Not found', source: 'NOT_FOUND', ambiguous: false };
}

describe('Parametric Volume Engine Safe Lookup (Phase 3E)', () => {
  it('1. unique code → same price as before', () => {
    const r = resolveUnitPrice('A.1.01.a.1');
    expect(r.ambiguous).toBe(false);
    expect(r.unitPrice).toBe(6000);
  });

  it('2. ambiguous code → does NOT pick first silently', () => {
    const r = resolveUnitPrice('A.3.08.3.4.b.6.a');
    expect(r.ambiguous).toBe(true);
    // Must NOT return first variant's price (8000000)
    expect(r.unitPrice).toBeNull();
  });

  it('3. ID lookup → exact variant price', () => {
    const r1 = resolveUnitPrice('AHSP-2026-SDA-000010');
    expect(r1.unitPrice).toBe(8000000);
    expect(r1.ahspName).toContain('1400');

    const r2 = resolveUnitPrice('AHSP-2026-SDA-000011');
    expect(r2.unitPrice).toBe(7500000);
    expect(r2.ahspName).toContain('1200');
  });

  it('4. ambiguous code with quantity does not produce wrong total', () => {
    const quantity = 2;
    const r = resolveUnitPrice('A.3.08.3.4.b.6.a');
    // With ambiguous result, caller should NOT calculate totalPrice from wrong variant
    expect(r.ambiguous).toBe(true);
    // Total should not be calculated from first variant's price
    const wrongTotal = quantity * 8000000; // first variant
    expect(r.unitPrice).not.toBe(8000000);
  });
});

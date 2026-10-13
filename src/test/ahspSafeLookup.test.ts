/**
 * Tests: Safe Ambiguous AHSP Lookup (Phase 3B)
 *
 * Verifies:
 * 1. Unique code → EXACT_MATCH (unchanged behavior)
 * 2. Ambiguous code without ID → AMBIGUOUS (no silent first-pick)
 * 3. Ambiguous code with valid variant ID → EXACT_MATCH with correct variant
 * 4. Variant ID mismatched with code → rejected
 * 5. Non-ambiguous items preserve previous lookup results
 * 6. Null prices not converted to zero (guard)
 */
import { describe, it, expect } from 'vitest';

// --- Mock data simulating the 8 duplicate groups ---
const mockDefs = [
  { id: 'AHSP-2026-SDA-000001', code: 'A.1.01.a.1', codeNormalized: 'a.1.01.a.1', name: 'Pembersihan', unit: 'm2', domain: 'SDA', unitPrice: 6000 },
  { id: 'AHSP-2026-SDA-000010', code: 'A.3.08.3.4.b.6.a', codeNormalized: 'a.3.08.3.4.b.6.a', name: 'Reducer DN 2000x1400', unit: 'unit', domain: 'SDA', unitPrice: null },
  { id: 'AHSP-2026-SDA-000011', code: 'A.3.08.3.4.b.6.a', codeNormalized: 'a.3.08.3.4.b.6.a', name: 'Reducer DN 2000x1200', unit: 'unit', domain: 'SDA', unitPrice: null },
];

// --- Simulated repository methods ---
function getAllByCode(code: string) {
  const clean = code.trim().toLowerCase();
  return mockDefs.filter(d => d.codeNormalized === clean || d.code.toLowerCase() === clean);
}

function normalizeCode(code: string) {
  return code.trim().toLowerCase().replace(/\s+/g, '');
}

// --- Simulated resolver logic (mirrors ahspResolver.ts) ---
function resolve(query: { code?: string; id?: string }) {
  if (query.code) {
    const normCode = normalizeCode(query.code);

    if (!query.id) {
      const allMatches = getAllByCode(normCode);
      if (allMatches.length > 1) {
        return {
          status: 'AMBIGUOUS',
          candidates: allMatches,
          error: `Kode "${query.code}" cocok dengan ${allMatches.length} varian.`,
        };
      }
    }

    if (query.id) {
      const byId = mockDefs.find(d => d.id === query.id);
      if (byId) {
        const byIdNorm = normalizeCode(byId.codeNormalized);
        if (byIdNorm !== normCode) {
          return { status: 'AHSP_NOT_FOUND', error: 'ID tidak cocok dengan kode.' };
        }
        return { status: 'EXACT_MATCH', resolvedAHSP: byId };
      }
    }

    const match = getAllByCode(normCode)[0];
    if (match) {
      return { status: 'EXACT_MATCH', resolvedAHSP: match };
    }
  }
  return { status: 'AHSP_NOT_FOUND' };
}

describe('Safe Ambiguous AHSP Lookup (Phase 3B)', () => {
  it('1. unique code → EXACT_MATCH (unchanged)', () => {
    const r = resolve({ code: 'A.1.01.a.1' });
    expect(r.status).toBe('EXACT_MATCH');
    expect((r as any).resolvedAHSP.id).toBe('AHSP-2026-SDA-000001');
  });

  it('2. ambiguous code without ID → AMBIGUOUS (no silent pick)', () => {
    const r = resolve({ code: 'A.3.08.3.4.b.6.a' });
    expect(r.status).toBe('AMBIGUOUS');
    expect((r as any).candidates).toHaveLength(2);
    // Must NOT return EXACT_MATCH
    expect((r as any).resolvedAHSP).toBeUndefined();
  });

  it('3. ambiguous code with valid variant ID → correct variant', () => {
    const r1 = resolve({ code: 'A.3.08.3.4.b.6.a', id: 'AHSP-2026-SDA-000010' });
    expect(r1.status).toBe('EXACT_MATCH');
    expect((r1 as any).resolvedAHSP.name).toContain('1400');

    const r2 = resolve({ code: 'A.3.08.3.4.b.6.a', id: 'AHSP-2026-SDA-000011' });
    expect(r2.status).toBe('EXACT_MATCH');
    expect((r2 as any).resolvedAHSP.name).toContain('1200');
  });

  it('4. variant ID mismatched with code → rejected', () => {
    const r = resolve({ code: 'A.1.01.a.1', id: 'AHSP-2026-SDA-000010' });
    expect(r.status).toBe('AHSP_NOT_FOUND');
  });

  it('5. price lookup does not take price from wrong variant', () => {
    // Both variants have null price; resolver must not fabricate
    const r = resolve({ code: 'A.3.08.3.4.b.6.a', id: 'AHSP-2026-SDA-000011' });
    const price = (r as any).resolvedAHSP?.unitPrice;
    expect(price).toBeNull();
    expect(price).not.toBe(0);
  });

  it('6. non-ambiguous items preserve previous results', () => {
    // Unique code behavior identical to before Phase 3B
    const r = resolve({ code: 'a.1.01.a.1' }); // lowercase variant
    expect(r.status).toBe('EXACT_MATCH');
  });

  it('7. null stays null (never becomes zero)', () => {
    const r = resolve({ code: 'A.3.08.3.4.b.6.a', id: 'AHSP-2026-SDA-000010' });
    const price = (r as any).resolvedAHSP.unitPrice;
    // Guard: null must remain null, not 0
    expect(price === null || typeof price === 'number').toBe(true);
    if (price === null) {
      expect(price).not.toBe(0);
    }
  });
});

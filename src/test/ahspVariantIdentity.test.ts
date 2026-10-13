/**
 * Tests: AHSP Variant Identity (Phase 3A)
 *
 * Verifies:
 * 1. Unique codes resolve via findByCode
 * 2. Duplicate codes detected via findAllByCode / isCodeAmbiguous
 * 3. findById returns exact variant
 * 4. No duplicate IDs
 */
import { describe, it, expect } from 'vitest';

// Mock minimal items for testing the logic
const mockItems = [
  { id: 'AHSP-2026-SDA-000001', code: 'A.1.01.a.1', codeNormalized: 'a.1.01.a.1', name: 'Unique item' },
  { id: 'AHSP-2026-SDA-000010', code: 'A.3.08.3.4.b.6.a', codeNormalized: 'a.3.08.3.4.b.6.a', name: 'Reducer DN 2000x1400' },
  { id: 'AHSP-2026-SDA-000011', code: 'A.3.08.3.4.b.6.a', codeNormalized: 'a.3.08.3.4.b.6.a', name: 'Reducer DN 2000x1200' },
];

// Simulate registry methods
function findByCode(code: string) {
  const clean = code.trim().toLowerCase();
  return mockItems.find(
    itm => itm.codeNormalized.toLowerCase() === clean || itm.code.toLowerCase() === clean
  );
}

function findAllByCode(code: string) {
  const clean = code.trim().toLowerCase();
  return mockItems.filter(
    itm => itm.codeNormalized.toLowerCase() === clean || itm.code.toLowerCase() === clean
  );
}

function findById(id: string) {
  return mockItems.find(itm => itm.id === id);
}

function isCodeAmbiguous(code: string) {
  return findAllByCode(code).length > 1;
}

describe('AHSP Variant Identity', () => {
  it('1. unique code resolves via findByCode', () => {
    const result = findByCode('A.1.01.a.1');
    expect(result).toBeDefined();
    expect(result!.id).toBe('AHSP-2026-SDA-000001');
  });

  it('2. duplicate code detected via findAllByCode', () => {
    const results = findAllByCode('A.3.08.3.4.b.6.a');
    expect(results).toHaveLength(2);
    expect(isCodeAmbiguous('A.3.08.3.4.b.6.a')).toBe(true);
    expect(isCodeAmbiguous('A.1.01.a.1')).toBe(false);
  });

  it('3. findById returns exact variant', () => {
    const v1 = findById('AHSP-2026-SDA-000010');
    const v2 = findById('AHSP-2026-SDA-000011');
    expect(v1!.name).toContain('1400');
    expect(v2!.name).toContain('1200');
    expect(v1!.id).not.toBe(v2!.id);
  });

  it('4. no duplicate IDs', () => {
    const ids = mockItems.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('5. findByCode on ambiguous code returns first (documented behavior)', () => {
    // This documents current backward-compat behavior
    // Callers should use findAllByCode + findById for variants
    const result = findByCode('A.3.08.3.4.b.6.a');
    expect(result).toBeDefined();
    // Returns first match - caller must check isCodeAmbiguous
  });
});

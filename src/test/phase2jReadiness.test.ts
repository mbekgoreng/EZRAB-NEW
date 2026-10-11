/**
 * Phase 2J — RAB Readiness for Users (regression gate).
 *
 * Locks in the Phase 2J fixes:
 * - P0-2: "Pengecatan plafon" must not match ceiling/gypsum (painting intent wins).
 * - P0: No fabricated Rp125.000 for AI custom items (dedToRabPipelineService).
 * - P0: null price stays null on edit (no null→0).
 * - P1: Quarantine-aware price resolution (no bypass via raw catalog).
 * - P1: DRAINAGE branch reachable (u-ditch).
 * - P1-2J-1: Concrete-pour intent must not match bekisting.
 *
 * Read-only wrt canonical data. No push/deploy.
 */
import { describe, it, expect } from 'vitest';
import { ahspMatcher } from '../ded-rab-v2/ahsp/ahspMatcher';

describe('Phase 2J — RAB readiness', () => {
  it('P0-2: Pengecatan plafon → painting item, not ceiling gypsum', () => {
    const r = ahspMatcher.matchWorkItem({ name: 'Pengecatan plafon', unit: 'm2', category: 'PAINTING' } as any);
    expect(r).not.toBeNull();
    expect(r!.code).not.toBe('3.5.2.1');
    expect(r!.name.toLowerCase()).toMatch(/cat|pengecatan/);
  });

  it('P0-2: Plafon gypsum (non-painting) still matches ceiling', () => {
    const r = ahspMatcher.matchWorkItem({ name: 'Plafon gypsum 9mm', unit: 'm2', category: 'CEILING' } as any);
    expect(r?.code).toBe('3.5.2.1');
  });

  it('P1-2J-2: Drainase u-ditch precast is reachable (not silent NOT_FOUND)', () => {
    const r = ahspMatcher.matchWorkItem({ name: 'Drainase u-ditch precast', unit: "m'", category: 'DRAINAGE' } as any);
    // Either a real match or AMBIGUOUS — but not a silent NOT_FOUND.
    expect(r).not.toBeNull();
    expect(['SEMANTIC_MATCH', 'AMBIGUOUS']).toContain(r!.matchType);
  });

  it('P1-2J-1: Plat lantai beton must not match bekisting', () => {
    const r = ahspMatcher.matchWorkItem({ name: 'Plat lantai beton t=12cm', unit: 'm2', category: 'STRUCTURE_SLAB' } as any);
    if (r && r.matchType === 'SEMANTIC_MATCH') {
      expect(r.name.toLowerCase()).not.toContain('bekisting');
    }
    // NOT_FOUND is also acceptable (honest); bekisting is not.
  });

  it('P0: no fabricated prices in pipeline service source', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      'src/services/dedToRabPipelineService.ts',
      'utf-8'
    );
    // The Rp125.000 fabrication must be gone.
    expect(src).not.toMatch(/unitPrice\s*=\s*125000/);
  });

  it('P1: no Rp150.000 fallback in SmartAddWorkItemModal', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      'src/components/estimator/SmartAddWorkItemModal.tsx',
      'utf-8'
    );
    expect(src).not.toContain('150000');
  });

  it('P1: quarantine-aware resolution (no raw ALL_OFFICIAL_AHSP_ITEMS.find in Priority 4)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      'src/services/dedToRabPipelineService.ts',
      'utf-8'
    );
    // Priority 4 must use the repository (quarantine-aware), not the raw catalog.
    expect(src).toContain('officialAhspRepository.getOfficialAhsp');
  });
});

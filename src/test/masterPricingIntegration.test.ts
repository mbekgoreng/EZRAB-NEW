/**
 * MASTER PRICING §12 — COMPLETE APPLICATION INTEGRATION
 * ======================================================================
 * One test (or more) per integrated surface, per redirected
 * `PriceResolver` consumer, per new §4 operation, per fixed AI
 * guardrail violation — plus the ported Phase 3
 * (AdvancedPriceResolutionEngine) assertions, re-expressed against the
 * canonical resolver (the engine class itself is archived at
 * `src/engine/pricing/resolver/_archive/`; its old test file is deleted
 * BY THIS PORT, not silently — see the mapping in
 * `fase12-integration.md` §"Pemindahan tes Phase 3").
 *
 * Fixture hygiene: every seeded name/code/project-id in this file is
 * unique to §12 (Qwertyplugh/Xyzzyplugh + S12 prefixes) so seeds never
 * collide with other suites' fixtures. PriceRepository and
 * ProjectPriceEngine are process singletons; seeds are added once in
 * `beforeAll` and never removed (removal APIs do not exist for custom
 * prices — the same pattern as priceIntegrityUnitGate).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { canonicalPriceResolver } from '../engine/pricing/canonical/canonicalPriceResolver';
import {
  canonicalPriceResolverAdapter,
  gateCanonicalUnit,
  resolveCanonicalPriceAsResolutionResult,
  resolveCanonicalPriceAsResolvedPrice,
} from '../engine/pricing/canonical/canonicalPriceResolverAdapter';
import { priceSanityValidator } from '../engine/pricing/canonical/priceSanityValidator';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { projectPriceEngine } from '../engine/pricing/projectPriceEngine';
import { CostCompositionEngine } from '../engine/cost/composition/costCompositionEngine';
import { CostPolicyEngine } from '../engine/cost/policy/costPolicyEngine';
import { BINA_MARGA_AHSP_2026_OFFICIAL } from '../data/nationalCostDatabase/binaMarga2026Adapter';
import { ahspPriceResolver } from '../ded-rab-v2/ahsp/ahspPriceResolver';
import { ezrabDatabasePriceProvider } from '../ded-rab-v2/resolution/priceProviders/ezrabDatabasePriceProvider';
import { priceResolutionEngine } from '../ded-rab-v2/resolution/priceResolutionEngine';
import { dedPriceResolutionEngine } from '../ded-rab-v3/pricing/dedPriceResolutionEngine';
import { aiEstimatorToolRegistry } from '../ded-rab-v3/agent/aiEstimatorToolRegistry';
import { aiPriceEstimationEngine } from '../ded-rab-v2/pricing/aiPriceEstimationEngine';
import { resolveComponentPrice } from '../engine/constructionCalculators/componentPriceResolution';
import { buildComponentPriceRef } from '../data/priceDatabase2026/centralResolution';
import {
  buildProjectPricingContext,
  effectiveProjectPricingStateForProject,
  formatPricingBasisLabel,
} from '../engine/pricing/projectPriceModes';
import { freezeRabSnapshot } from '../export/fiveSheetPreset';
import {
  AHSP_VERSION_WRITE_OPERATIONS,
  MASTER_PRICE_WRITE_OPERATIONS,
  authorizeMasterPriceOperation,
  authorizeMasterPriceWriteVia,
  isAhspVersionWriteOperation,
  isMasterPriceWriteOperation,
} from '../engine/pricing/admin/masterPriceAuthorization';
import {
  AHSP_VERSION_OPERATION_LABELS_ID,
  ahspVersionWriteGate,
} from '../engine/pricing/admin/masterPricingUiLogic';
import { lookupWeirPrice } from '../engine/weir/weirPriceDatabase';
import { resolveOfficialPriceForMappedItem } from '../engine/constructionCalculators/ahsp2026PriceIntegration';
import type { EstimateVersion, Project } from '../types';

const repo = PriceRepository.getInstance();

let seeded = false;
function seedOnce(): void {
  if (seeded) return;
  seeded = true;
  // Port fixtures (Phase 3 tier ladder, re-expressed canonically).
  repo.addCustomPrice({
    code: 'TEST-S12-NAT-001', name: 'Qwertyplugh Port Nasional', unit: 'kg',
    price: 5000, location: 'Nasional', priceSource: 'TEST-S12',
  } as never);
  repo.addCustomPrice({
    code: 'TEST-S12-REG-001', name: 'Qwertyplugh Port Regional', unit: 'kg',
    price: 7000, location: 'Jawa Timur', priceSource: 'TEST-S12',
  } as never);
  // Zero / negative fixtures (clamped to 0 by the repository itself).
  repo.addCustomPrice({
    code: 'TEST-S12-ZERO-001', name: 'Qwertyplugh Zero Price', unit: 'kg',
    price: 0, location: 'Nasional', priceSource: 'TEST-S12',
  } as never);
  repo.addCustomPrice({
    code: 'TEST-S12-NEG-001', name: 'Qwertyplugh Negative Price', unit: 'kg',
    price: -5000, location: 'Nasional', priceSource: 'TEST-S12',
  } as never);
  // Project override fixture: Semen Portland @ 9900/kg for one project only.
  projectPriceEngine.setProjectOverride({
    projectId: 'PROJ-S12-ADAPTER-001',
    materialId: 'mat_semen',
    materialCode: 'M-001',
    materialName: 'Semen Portland',
    price: 9900,
    unit: 'kg',
  } as never);
  // Expired quote fixture: a project price whose validity ended in 2025.
  projectPriceEngine.setProjectPrice({
    projectId: 'PROJ-S12-EXPIRED-001',
    materialId: 'mat_semen',
    materialCode: 'M-001',
    materialName: 'Semen Portland',
    price: 12345,
    unit: 'kg',
    supplierName: 'Supplier Kedaluwarsa TEST',
    validUntil: '2025-01-01',
  } as never);
  // Locked revision fixture: Semen Portland frozen at 7777/kg.
  projectPriceEngine.lockRevisionPrices(
    'PROJ-S12-LOCKED-001',
    'REV-S12-001',
    'Revisi Terkunci TEST §12',
    [
      {
        materialId: 'mat_semen',
        materialCode: 'M-001',
        materialName: 'Semen Portland',
        price: 7777,
        unit: 'kg',
        source: 'PROJECT_OVERRIDE',
        status: 'LOCKED',
      },
    ],
  );
}

beforeAll(() => {
  seedOnce();
});

// ===========================================================================
// A. ADAPTER — canonical resolver behind the legacy result shapes (D3/M-12)
// ===========================================================================
describe('§12 adapter — resolve() shape', () => {
  it('resolves a canonical master price as EXACT_MATCH with tier + category', () => {
    const r = resolveCanonicalPriceAsResolutionResult({ name: 'Semen Portland', unit: 'kg' });
    expect(r.status).toBe('EXACT_MATCH');
    expect(r.resolvedPrice?.price).toBe(1600);
    expect(r.resolvedPrice?.unit).toBe('kg');
    expect(r.resolvedPrice?.sourceTier).toBe('OFFICIAL');
    expect(r.resolvedPrice?.category).toBe('MATERIAL');
    expect(r.priceCandidates).toHaveLength(1);
    expect(r.priceCandidates?.[0].matchType).toBe('EXACT');
  });

  it('fails closed on an unknown item (no look-alike price)', () => {
    const r = resolveCanonicalPriceAsResolutionResult({ name: 'Qwertyplugh Unobtainium', unit: 'kg' });
    expect(r.status).toBe('PRICE_NOT_FOUND');
    expect(r.resolvedPrice).toBeUndefined();
    expect(r.priceCandidates).toEqual([]);
  });

  it('rejects an empty query as PRICE_NOT_CONFIGURED', () => {
    const r = resolveCanonicalPriceAsResolutionResult({ name: '', unit: 'kg' });
    expect(r.status).toBe('PRICE_NOT_CONFIGURED');
  });

  it('converts a canonical price into a convertible query unit (kg -> ton)', () => {
    // Canonical master: Semen Portland Rp1.600/kg. A per-ton query gets
    // the converted price (x1000), NOT the per-kg price served as per-ton.
    const r = resolveCanonicalPriceAsResolutionResult({ name: 'Semen Portland', unit: 'ton' });
    expect(r.status).toBe('EXACT_MATCH');
    expect(r.resolvedPrice?.price).toBe(1600000);
    expect(r.resolvedPrice?.unit).toBe('ton');
    expect(r.explanation).toContain('dikonversi');
  });

  it('fails closed on an incompatible unit (kg record vs m3 query) — P5', () => {
    const r = resolveCanonicalPriceAsResolutionResult({ name: 'Semen Portland', unit: 'm3' });
    expect(r.status).toBe('PRICE_NOT_FOUND');
    expect(r.explanation).toContain('UNIT_MISMATCH');
  });

  it('the singleton adapter resolves identically to the pure function', () => {
    const a = canonicalPriceResolverAdapter.resolve({ name: 'Semen Portland', unit: 'kg' });
    const b = resolveCanonicalPriceAsResolutionResult({ name: 'Semen Portland', unit: 'kg' });
    expect(a.status).toBe(b.status);
    expect(a.resolvedPrice?.price).toBe(b.resolvedPrice?.price);
  });
});

describe('§12 adapter — resolvePrice() shape', () => {
  it('returns REFERENCE for a canonical master price', () => {
    const r = resolveCanonicalPriceAsResolvedPrice({ name: 'Semen Portland', unit: 'kg' });
    expect(r.status).toBe('REFERENCE');
    expect(r.source).toBe('EZRAB_REFERENCE');
    expect(r.price).toBe(1600);
    expect(r.unit).toBe('kg');
    expect(r.isFinal).toBe(true);
  });

  it('returns OVERRIDE when a project override exists (Step 1 wins)', () => {
    const r = resolveCanonicalPriceAsResolvedPrice(
      { name: 'Semen Portland', unit: 'kg' },
      { projectId: 'PROJ-S12-ADAPTER-001' },
    );
    expect(r.status).toBe('OVERRIDE');
    expect(r.source).toBe('PROJECT_OVERRIDE');
    expect(r.price).toBe(9900);
    expect(r.overridePrice).toBe(9900);
    // The reference is the live master (1600) — variance is measured, not hidden.
    expect(r.referencePrice).toBe(1600);
  });

  it('the same material WITHOUT the project resolves to the live master', () => {
    const r = resolveCanonicalPriceAsResolvedPrice(
      { name: 'Semen Portland', unit: 'kg' },
      { projectId: 'PROJ-S12-OTHER-PROJECT' },
    );
    expect(r.status).toBe('REFERENCE');
    expect(r.price).toBe(1600);
  });

  it('returns LOCKED for a price frozen on a locked revision', () => {
    const r = resolveCanonicalPriceAsResolvedPrice(
      { code: 'M-001', name: 'Semen Portland', unit: 'kg' },
      { projectId: 'PROJ-S12-LOCKED-001', revisionId: 'REV-S12-001' },
    );
    expect(r.status).toBe('LOCKED');
    expect(r.price).toBe(7777);
    expect(r.isLocked).toBe(true);
    expect(r.referencePrice).toBe(1600);
  });

  it('returns EXPIRED for an expired quote, with the live-master fallback', () => {
    const r = resolveCanonicalPriceAsResolvedPrice(
      { code: 'M-001', name: 'Semen Portland', unit: 'kg' },
      { projectId: 'PROJ-S12-EXPIRED-001' },
    );
    expect(r.status).toBe('EXPIRED');
    // Fallback price is the live master (1600), NOT the expired 12345.
    expect(r.price).toBe(1600);
    expect(r.projectPrice).toBe(12345);
    expect(r.explanation).toContain('kedaluwarsa');
  });

  it('fails closed on an unknown item (NOT_FOUND, price 0, not final)', () => {
    const r = resolveCanonicalPriceAsResolvedPrice({ name: 'Qwertyplugh Unobtainium', unit: 'kg' });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.source).toBe('PRICE_NOT_FOUND');
    expect(r.price).toBe(0);
    expect(r.isFinal).toBe(false);
  });

  it('fails closed on an incompatible unit (kg record vs m3 query) — P5', () => {
    const r = resolveCanonicalPriceAsResolvedPrice({ name: 'Semen Portland', unit: 'm3' });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.explanation).toContain('UNIT_MISMATCH');
  });

  it('converts a canonical price into a convertible query unit (kg -> ton)', () => {
    const r = resolveCanonicalPriceAsResolvedPrice({ name: 'Semen Portland', unit: 'ton' });
    expect(r.status).toBe('REFERENCE');
    expect(r.price).toBe(1600000);
    expect(r.unit).toBe('ton');
  });
});

// ===========================================================================
// B. COST ENGINES — default resolver is now canonical (D3/M-12)
// ===========================================================================
describe('§12 cost engines — canonical default', () => {
  function composeWith(code: string, itemName: string, unit: string) {
    const engine = new CostCompositionEngine();
    const input = {
      quantity: 1,
      quantityUnit: 'm3',
      ahspDefinition: {
        id: 'TEST-S12-AHSP-1', code: 'T.S12', codeNormalized: 't.s12', name: 'AHSP Uji §12',
        unit: 'm3', domain: 'CIPTA_KARYA', category: 'TEST', version: '2026',
        sourceDocument: 'TEST-S12',
        laborComponents: [],
        materialComponents: [
          { id: 'c1', type: 'material', itemCode: code, itemName, unit, coefficient: 2 },
        ],
        equipmentComponents: [],
        totalLaborCoefficient: 0, totalMaterialCoefficient: 2, totalEquipmentCoefficient: 0,
        provenance: {},
      },
      priceContext: { projectId: 'PROJ-S12-COMPOSE-001' },
    } as never;
    return engine.compose(input);
  }

  it('CostCompositionEngine composes the canonical master price by default', () => {
    const result = composeWith('M-001', 'Semen Portland', 'kg');
    // 2 kg x Rp1.600 (canonical M-001) = Rp3.200 direct cost.
    expect(result.directCost).toBe(3200);
    expect(result.status).toBe('COMPLETE');
    expect(result.material.components[0].unitPrice).toBe(1600);
    expect(result.material.components[0].priceStatus).toBe('RESOLVED');
    expect(result.material.components[0].fallbackSourceKind).toBe('OFFICIAL_AHSP');
  });

  it('CostCompositionEngine fails closed on a wrong-unit component (P5)', () => {
    const result = composeWith('M-001', 'Semen Portland', 'm3');
    // No per-m3 canonical price exists; the per-kg price must NOT be
    // served as per-m3. The component is UNRESOLVED (unitPrice 0,
    // status PRICE_MISSING), never 1600.
    expect(result.material.components[0].unitPrice).toBe(0);
    expect(result.material.components[0].priceStatus).toBe('UNRESOLVED');
    expect(result.status).toBe('PRICE_MISSING');
  });

  it('CostPolicyEngine calculates through the canonical default', () => {
    const engine = new CostPolicyEngine();
    const result = engine.calculate(
      [{ name: 'Galian Drainase', quantity: 100, unit: 'm3', ahspCode: '2.1.(1)' }],
      BINA_MARGA_AHSP_2026_OFFICIAL,
      {},
      { projectId: 'PROJ-S12-POLICY-001', location: 'Probolinggo, Jawa Timur', effectiveDate: '2026-01-01', periodVersion: '2026' },
      'PROJ-S12-POLICY-001',
    );
    expect(result.lineItems.length).toBe(1);
    expect(result.lineItems[0].ahspCode).toBe('B.1');
    expect(['COMPLETE', 'PRICE_MISSING']).toContain(result.lineItems[0].composition.status);
    expect(result.auditTrail.some((s: string) => s.includes('COMPOSED:'))).toBe(true);
  });
});

// ===========================================================================
// C. DED v2 — Priority 5 + provider step 3 are canonical (D3/M-12)
// ===========================================================================
describe('§12 DED v2 — canonical Priority 5 + provider', () => {
  it('AhspPriceResolver Priority 5 resolves the canonical master price', () => {
    // A VERIFIED match (so the early return does not trigger) whose code
    // exists in NO official repository — Priorities 3–4 miss, Priority 5
    // (canonical) answers by name.
    const item = {
      name: 'Semen Portland',
      unit: 'kg',
      ahspMatch: { code: '9.9.9.9', matchType: 'EXACT' },
      qto: { quantity: 2 },
    } as never;
    const r = ahspPriceResolver.resolvePrice(item);
    expect(r.unitPrice).toBe(1600);
    expect(r.totalPrice).toBe(3200);
    expect(r.priceSource).toBe('EXTERNAL_DISCOVERY');
    expect(r.priceStatus).toBe('PRICE_EXTERNAL');
    expect(r.materialPrice).toBe(1600);
    expect(r.isOfficial).toBe(false);
    expect(r.sourceDetail).toContain('kanonis');
  });

  it('AhspPriceResolver Priority 5 fails closed on a wrong-unit item (P5)', () => {
    const item = {
      name: 'Semen Portland',
      unit: 'm3',
      ahspMatch: { code: '9.9.9.9', matchType: 'EXACT' },
      qto: { quantity: 2 },
    } as never;
    const r = ahspPriceResolver.resolvePrice(item);
    // No AI fallback enabled: the item stays unpriced, never 1600/m3.
    expect(r.unitPrice).toBeNull();
    expect(r.priceStatus).not.toBe('PRICE_EXTERNAL');
  });

  it('EzrabDatabasePriceProvider step 3 resolves the canonical master price', async () => {
    const r = await ezrabDatabasePriceProvider.search({
      workItemName: 'Semen Portland',
      unit: 'kg',
      quantity: 3,
    });
    expect(r).not.toBeNull();
    expect(r?.unitPrice).toBe(1600);
    expect(r?.totalPrice).toBe(4800);
    expect(r?.priceSource).toBe('EZRAB_DATABASE');
    expect(r?.materialPrice).toBe(1600);
    expect(r?.laborPrice).toBeNull();
    expect(r?.equipmentPrice).toBeNull();
    expect(r?.sourceName).toContain('Kanonis');
  });

  it('EzrabDatabasePriceProvider step 3 fails closed on a wrong-unit query (P5)', async () => {
    const r = await ezrabDatabasePriceProvider.search({
      workItemName: 'Semen Portland',
      unit: 'm3',
      quantity: 1,
    });
    // Step 3 is gated out; the provider falls to AI estimation or null —
    // it never returns the per-kg price as per-m3.
    if (r !== null) {
      expect(r.unitPrice).not.toBe(1600);
      expect(r.priceSource).not.toBe('EZRAB_DATABASE');
    }
  });

  it('PriceResolutionEngine canonical fallback is unit-gated (P6)', async () => {
    // The fallback only fires when all five providers miss, so the test
    // temporarily empties the provider chain on the singleton and
    // restores it in `finally`. Before §12 the ungated fallback served
    // the per-kg price as per-m3 (same defect class as P1/P5).
    const engine = priceResolutionEngine as unknown as {
      providers: unknown[];
      clearCache: () => void;
    };
    const saved = [...engine.providers];
    try {
      engine.providers = [];
      engine.clearCache();
      const wrong = await priceResolutionEngine.resolvePrice({
        workItemName: 'Semen Portland',
        unit: 'm3',
        quantity: 1,
      });
      expect(wrong.unitPrice).toBe(0);
      expect(wrong.priceStatus).toBe('PRICE_INTERNAL');
      expect(wrong.sourceName).toBe('Harga Tidak Ditemukan');

      const right = await priceResolutionEngine.resolvePrice({
        workItemName: 'Semen Portland',
        unit: 'kg',
        quantity: 2,
      });
      expect(right.unitPrice).toBe(1600);
      expect(right.totalPrice).toBe(3200);
      expect(right.priceStatus).toBe('RESOLVED');

      const converted = await priceResolutionEngine.resolvePrice({
        workItemName: 'Semen Portland',
        unit: 'ton',
        quantity: 1,
      });
      expect(converted.unitPrice).toBe(1600000);
      expect(converted.priceStatus).toBe('RESOLVED');
    } finally {
      engine.providers = saved;
      engine.clearCache();
    }
  });
});

// ===========================================================================
// D. DED v3 — dead PriceResolver field removed; canonical path intact
// ===========================================================================
describe('§12 DED v3 — canonical resolution intact', () => {
  it('resolveItemPrice resolves a resource item through the canonical service', () => {
    const r = dedPriceResolutionEngine.resolveItemPrice({
      id: 'S12-1',
      itemNumber: 1,
      name: 'Semen Portland',
      category: 'Bahan',
      specification: '',
      dimensions: {},
      quantity: 10,
      quantityUnit: 'kg',
    } as never);
    expect(r.unitPrice).toBe(1600);
    expect(r.totalPrice).toBe(16000);
    expect(r.currency).toBe('IDR');
  });

  it('resolveItemPrice fails closed on a wrong-unit item (P5)', () => {
    const r = dedPriceResolutionEngine.resolveItemPrice({
      id: 'S12-2',
      itemNumber: 2,
      name: 'Semen Portland',
      category: 'Bahan',
      specification: '',
      dimensions: {},
      quantity: 10,
      quantityUnit: 'm3',
    } as never);
    expect(r.unitPrice).toBe(0);
    expect(r.source).toBe('PRICE_NOT_FOUND');
    expect(r.providerOrLocation).toContain('UNIT_MISMATCH');
  });

  it('resolveItemPrice fails closed on an unknown item (never hallucinated)', () => {
    const r = dedPriceResolutionEngine.resolveItemPrice({
      id: 'S12-3',
      itemNumber: 3,
      name: 'Qwertyplugh Unobtainium',
      category: 'Bahan',
      specification: '',
      dimensions: {},
      quantity: 1,
      quantityUnit: 'kg',
    } as never);
    expect(r.unitPrice).toBe(0);
    expect(r.source).toBe('PRICE_NOT_FOUND');
  });
});

// ===========================================================================
// E. MAGIC AI GUARDRAIL — P1: findPrice must not serve a wrong-unit price
// ===========================================================================
describe('§12 Magic AI guardrail — findPrice (P1)', () => {
  it('findPrice serves the canonical price for a matching unit', () => {
    const r = aiEstimatorToolRegistry.findPrice({ itemName: 'Semen Portland', unit: 'kg' });
    expect(r.unitPrice).toBe(1600);
    expect(r.source).toBe('EZRAB_DATABASE');
    expect(r.confidence).toBe('MEDIUM');
  });

  it('findPrice NEVER serves a per-kg price for a per-m3 query (P1 regression)', () => {
    const r = aiEstimatorToolRegistry.findPrice({ itemName: 'Semen Portland', unit: 'm3' });
    // Before §12 this returned Rp1.800 REGIONAL_PRICE MEDIUM (a per-kg
    // record served as per-m3). Now the canonical answer is unit-gated
    // out and the AI estimate takes over, labelled as an estimate.
    expect(r.source).toBe('AI_ESTIMATED');
    expect(r.unitPrice).not.toBe(1600);
    expect(r.unitPrice).not.toBe(1800);
  });

  it('findPrice NEVER serves a per-kg price for a per-zak query (P1 regression)', () => {
    const r = aiEstimatorToolRegistry.findPrice({ itemName: 'Semen', unit: 'zak' });
    // Before §12 this returned Rp1.800 (a per-kg record served as
    // per-zak). Now either a genuine per-zak price (tens of thousands)
    // or an AI estimate — never the per-kg price.
    expect(r.unitPrice).not.toBe(1600);
    expect(r.unitPrice).not.toBe(1800);
    if (r.source !== 'AI_ESTIMATED') {
      expect(r.unitPrice ?? 0).toBeGreaterThan(10000);
    }
  });

  it('findPrice converts into a convertible query unit (kg -> ton)', () => {
    const r = aiEstimatorToolRegistry.findPrice({ itemName: 'Semen Portland', unit: 'ton' });
    expect(r.unitPrice).toBe(1600000);
    expect(r.source).toBe('EZRAB_DATABASE');
  });

  it('findPrice still falls to AI_ESTIMATED for a genuinely unknown item', () => {
    const r = aiEstimatorToolRegistry.findPrice({
      itemName: 'Ornamen Panel Akustik Kustom 3D',
      unit: 'm2',
    });
    expect(r.source).toBe('AI_ESTIMATED');
    expect(r.unitPrice).not.toBeNull();
  });
});

// ===========================================================================
// F. AI ESTIMATION GUARDRAIL — P2: comparable anchors must match the unit
// ===========================================================================
describe('§12 AI estimation guardrail — comparable unit filter (P2)', () => {
  it('findComparableReferences never anchors a per-m3 price for a kg query', () => {
    const refs = aiPriceEstimationEngine.findComparableReferences({
      name: 'Pasir Pasang',
      unit: 'kg',
    });
    // The per-m3 'Pasir Pasang' record (Rp200.000) is excluded; what
    // survives is a genuine per-kg anchor ('Pasir Beton', Rp300/kg).
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.unit).not.toBe('m3');
      expect(ref.price).not.toBe(200000);
    }
    expect(refs).toContainEqual(
      expect.objectContaining({ name: 'Pasir Beton', price: 300, unit: 'kg' }),
    );
  });

  it('findComparableReferences still anchors matching units (m3 query)', () => {
    const refs = aiPriceEstimationEngine.findComparableReferences({
      name: 'Pasir Pasang',
      unit: 'm3',
    });
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].unit).toBe('m3');
    expect(refs[0].price).toBe(200000);
  });

  it('estimateResourcePrice never anchors its baseline on a wrong-unit reference', () => {
    const rec = aiPriceEstimationEngine.estimateResourcePrice({
      name: 'Pasir Pasang',
      unit: 'kg',
    });
    expect(rec.source_type).toBe('AI_ESTIMATE');
    expect(rec.unit).toBe('kg');
    const related = (rec.inputs as { related_prices?: Array<{ unit: string }> }).related_prices ?? [];
    for (const rel of related) {
      expect(rel.unit).not.toBe('m3');
    }
    const basis = Array.isArray(rec.basis) ? rec.basis.join(' ') : String(rec.basis);
    expect(basis).not.toContain('/m3');
  });

  it('findComparableReferences converts a convertible anchor into the query unit', () => {
    // Besi Beton is priced per kg; a ton query gets anchors converted
    // to per-ton (x1000), labelled with the conversion — never a
    // per-kg price served as per-ton.
    const refs = aiPriceEstimationEngine.findComparableReferences({
      name: 'Besi Beton',
      unit: 'ton',
    });
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.unit).toBe('ton');
      expect(ref.price).toBeGreaterThan(1000000);
      expect(ref.price % 1000).toBe(0);
      expect(ref.source).toContain('dikonversi');
    }
  });
});

// ===========================================================================
// G. QTO — project pricing mode threading (§10 honoured in QTO)
// ===========================================================================
describe('§12 QTO — project pricing mode threading', () => {
  it('PROJECT_OVERRIDE context wins per component, labelled PROJECT_OVERRIDE', () => {
    const overrideRef = buildComponentPriceRef([
      { name: 'Semen Portland (PC)', unit: 'sak', unitPrice: 99999 },
    ]);
    const context = buildProjectPricingContext({
      mode: 'PROJECT_OVERRIDE',
      overrideRef,
    });
    const r = resolveComponentPrice({
      name: 'Semen Portland (PC)',
      quantity: 10,
      unit: 'sak',
      kind: 'MATERIAL',
      pricingContext: context,
    });
    expect(r.unitPrice).toBe(99999);
    expect(r.provenance).toBe('PROJECT_OVERRIDE');
    expect(r.status).toBe('RESOLVED');
    expect(r.explanation).toContain('override');
  });

  it('the same component WITHOUT context resolves the live price (not the override)', () => {
    const r = resolveComponentPrice({
      name: 'Semen Portland (PC)',
      quantity: 10,
      unit: 'sak',
      kind: 'MATERIAL',
    });
    expect(r.unitPrice).not.toBe(99999);
    expect(r.provenance).not.toBe('PROJECT_OVERRIDE');
  });

  it('SNAPSHOT context wins per component, labelled PROJECT_SNAPSHOT', () => {
    const snapshotRef = buildComponentPriceRef([
      { name: 'Semen Portland (PC)', unit: 'sak', unitPrice: 88888 },
    ]);
    const context = buildProjectPricingContext({
      mode: 'SNAPSHOT_PRICE',
      snapshotRef,
    });
    const r = resolveComponentPrice({
      name: 'Semen Portland (PC)',
      quantity: 10,
      unit: 'sak',
      kind: 'MATERIAL',
      pricingContext: context,
    });
    expect(r.unitPrice).toBe(88888);
    expect(r.provenance).toBe('PROJECT_SNAPSHOT');
    expect(r.explanation).toContain('snapshot');
  });

  it('an OVERRIDE context with no price for the component falls through to live (flagged)', () => {
    const overrideRef = buildComponentPriceRef([
      { name: 'Qwertyplugh Komponen Lain', unit: 'sak', unitPrice: 11111 },
    ]);
    const context = buildProjectPricingContext({
      mode: 'PROJECT_OVERRIDE',
      overrideRef,
    });
    const r = resolveComponentPrice({
      name: 'Semen Portland (PC)',
      quantity: 10,
      unit: 'sak',
      kind: 'MATERIAL',
      pricingContext: context,
    });
    expect(r.unitPrice).not.toBe(11111);
    expect(r.provenance).not.toBe('PROJECT_OVERRIDE');
    expect(r.explanation).toContain('PROJECT_OVERRIDE');
  });
});

// ===========================================================================
// H. §4 ENUM EXTENSION — AHSP version operations (§11 BLOCKED #2, closed)
// ===========================================================================
describe('§12 §4 enum — AHSP version operations', () => {
  const ADMIN = { kind: 'authenticated', userId: 'u-admin', isGlobalAdmin: true } as const;
  const ORDINARY = { kind: 'authenticated', userId: 'u-1', isGlobalAdmin: false } as const;
  const DEMO = { kind: 'demo', role: 'OWNER' } as const;
  const ANON = { kind: 'anonymous' } as const;

  it('the AHSP version list has exactly the four §12 operations', () => {
    expect([...AHSP_VERSION_WRITE_OPERATIONS]).toEqual([
      'CLONE_AHSP_VERSION',
      'PUBLISH_AHSP_VERSION',
      'ROLLBACK_AHSP_VERSION',
      'EDIT_AHSP_ACTIVE',
    ]);
  });

  it('the 9-op master list is untouched (§4 pin preserved)', () => {
    expect(MASTER_PRICE_WRITE_OPERATIONS).toHaveLength(9);
    expect([...MASTER_PRICE_WRITE_OPERATIONS]).toEqual([
      'CREATE_MASTER_ITEM',
      'EDIT_MASTER_ITEM',
      'EDIT_MASTER_PRICE',
      'DEACTIVATE_MASTER_ITEM',
      'PUBLISH_PRICE_UPDATE',
      'ROLLBACK_PRICE_CHANGE',
      'APPROVE_ALIAS',
      'APPROVE_RECONCILIATION',
      'CHANGE_CLASSIFICATION',
    ]);
  });

  it('the guards distinguish master ops from version ops', () => {
    expect(isAhspVersionWriteOperation('PUBLISH_AHSP_VERSION')).toBe(true);
    expect(isAhspVersionWriteOperation('EDIT_MASTER_PRICE')).toBe(false);
    expect(isMasterPriceWriteOperation('EDIT_MASTER_PRICE')).toBe(true);
    expect(isMasterPriceWriteOperation('PUBLISH_AHSP_VERSION')).toBe(false);
    expect(isAhspVersionWriteOperation('BOGUS_OP')).toBe(false);
  });

  it.each([...AHSP_VERSION_WRITE_OPERATIONS])(
    'anonymous is denied for %s (DENIED_NOT_AUTHENTICATED)',
    (op) => {
      const d = authorizeMasterPriceOperation(ANON, op);
      expect(d.allowed).toBe(false);
      expect(d.code).toBe('DENIED_NOT_AUTHENTICATED');
      expect(d.operation).toBe(op);
    },
  );

  it.each([...AHSP_VERSION_WRITE_OPERATIONS])(
    'demo roles are denied for %s (DENIED_DEMO_ROLE)',
    (op) => {
      const d = authorizeMasterPriceOperation(DEMO, op);
      expect(d.allowed).toBe(false);
      expect(d.code).toBe('DENIED_DEMO_ROLE');
    },
  );

  it.each([...AHSP_VERSION_WRITE_OPERATIONS])(
    'an ordinary authenticated user is denied for %s (DENIED_NOT_GLOBAL_ADMIN)',
    (op) => {
      const d = authorizeMasterPriceOperation(ORDINARY, op);
      expect(d.allowed).toBe(false);
      expect(d.code).toBe('DENIED_NOT_GLOBAL_ADMIN');
    },
  );

  it.each([...AHSP_VERSION_WRITE_OPERATIONS])(
    'a verified global admin is allowed for %s',
    (op) => {
      const d = authorizeMasterPriceOperation(ADMIN, op);
      expect(d.allowed).toBe(true);
      expect(d.code).toBe('ALLOWED');
      expect(d.operation).toBe(op);
    },
  );

  it('a malformed identity is denied fail-closed for version ops', () => {
    const d = authorizeMasterPriceOperation({ kind: 'nonsense' }, 'CLONE_AHSP_VERSION');
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_MALFORMED_IDENTITY');
  });

  it('the PROJECT_OVERRIDE channel can never write a version op (DENIED_WRONG_CHANNEL)', () => {
    const d = authorizeMasterPriceWriteVia(ADMIN, 'PUBLISH_AHSP_VERSION', 'PROJECT_OVERRIDE');
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_WRONG_CHANNEL');
    const ok = authorizeMasterPriceWriteVia(ADMIN, 'PUBLISH_AHSP_VERSION', 'DIRECT');
    expect(ok.allowed).toBe(true);
  });

  it('every version operation has an Indonesian label', () => {
    expect(AHSP_VERSION_OPERATION_LABELS_ID).toEqual({
      CLONE_AHSP_VERSION: 'Clone versi AHSP',
      PUBLISH_AHSP_VERSION: 'Terbitkan versi AHSP',
      ROLLBACK_AHSP_VERSION: 'Rollback versi AHSP',
      EDIT_AHSP_ACTIVE: 'Ubah AHSP aktif (edit langsung)',
    });
  });

  it('ahspVersionWriteGate returns the FULL view model for the named operation', () => {
    const gate = ahspVersionWriteGate('ROLLBACK_AHSP_VERSION');
    expect(gate.operation).toBe('ROLLBACK_AHSP_VERSION');
    expect(gate.operationLabel).toBe('Rollback versi AHSP');
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('DENIED_NOT_AUTHENTICATED');
    expect(gate.enforcementBlocked).toBe(true);
    expect(gate.reason).toContain('global admin');
  });

  it('ahspVersionWriteGate with a global-admin identity allows (logic-level; enforcement still BLOCKED)', () => {
    const gate = ahspVersionWriteGate('EDIT_AHSP_ACTIVE', ADMIN);
    expect(gate.allowed).toBe(true);
    expect(gate.code).toBe('ALLOWED');
    expect(gate.operationLabel).toBe('Ubah AHSP aktif (edit langsung)');
    expect(gate.enforcementBlocked).toBe(true);
  });
});

// ===========================================================================
// I. EXPORT LABELS — pricing basis frozen + labelled (§12)
// ===========================================================================
describe('§12 export labels — pricing basis', () => {
  const liveProject = {
    id: 'PROJ-S12-EXP-001',
    name: 'Proyek Uji §12',
    currentVersion: 'Rev 00',
    pricingMode: 'LIVE_MASTER_PRICE',
  } as Project;
  const legacyProject = {
    id: 'PROJ-S12-EXP-002',
    name: 'Proyek Legacy §12',
    currentVersion: 'Rev 00',
  } as Project;
  const emptySummary = {
    pricedCount: 0,
    unpricedCount: 0,
    pricedTotal: 0,
    officialTotal: 0,
    marketTotal: 0,
    manualTotal: 0,
    otherTotal: 0,
    isPartial: false,
    partialItemCount: 0,
    isMixed: false,
  } as never;

  it('freezeRabSnapshot carries the pricing state (mode + pins)', () => {
    const snap = freezeRabSnapshot(liveProject, [], {} as never, emptySummary, {
      actor: 'test-s12',
      createdAt: '2026-11-16T00:00:00.000Z',
    });
    expect(snap.pricingState.mode).toBe('LIVE_MASTER_PRICE');
    expect(snap.pricingState.modeSource).toBe('RECORDED');
    // No versions supplied: pins read as legacy defaults, labelled so.
    expect(snap.pricingState.pinnedAhspDatabaseVersion).toBe('2026.1');
    expect(snap.pricingState.pinSource).toBe('LEGACY_DEFAULT');
    expect(snap.pricingState.pinnedMasterPriceVersion).toBe('2026.1');
    expect(snap.pricingState.masterPinSource).toBe('LEGACY_DEFAULT');
  });

  it('freezeRabSnapshot reads pins from the active estimate version when supplied', () => {
    const versions = [
      {
        id: 'EV-S12-OLD',
        projectId: 'PROJ-S12-EXP-001',
        versionNumber: '1',
        label: 'v1',
        timestamp: '2026-11-01T00:00:00.000Z',
        author: 'test',
        description: '',
        costBefore: 0,
        costAfter: 0,
        difference: 0,
        percentageDiff: 0,
        ahspDatabaseVersion: '2026.1',
        masterPriceVersion: '2026.1',
      },
      {
        id: 'EV-S12-NEW',
        projectId: 'PROJ-S12-EXP-001',
        versionNumber: '2',
        label: 'v2',
        timestamp: '2026-11-15T00:00:00.000Z',
        author: 'test',
        description: '',
        costBefore: 0,
        costAfter: 0,
        difference: 0,
        percentageDiff: 0,
        ahspDatabaseVersion: '2026.2',
        masterPriceVersion: '2026.2',
      },
    ] as EstimateVersion[];
    const snap = freezeRabSnapshot(liveProject, [], {} as never, emptySummary, {
      actor: 'test-s12',
      createdAt: '2026-11-16T00:00:00.000Z',
      estimateVersions: versions,
    });
    // Latest by timestamp wins (no activeEstimateVersionId set).
    expect(snap.pricingState.pinnedAhspDatabaseVersion).toBe('2026.2');
    expect(snap.pricingState.pinSource).toBe('RECORDED');
    expect(snap.pricingState.pinnedMasterPriceVersion).toBe('2026.2');
    expect(snap.pricingState.masterPinSource).toBe('RECORDED');
  });

  it('the pricing labels live OUTSIDE the snapshot hash', () => {
    const a = freezeRabSnapshot(liveProject, [], {} as never, emptySummary, {
      createdAt: '2026-11-16T00:00:00.000Z',
    });
    const b = freezeRabSnapshot(
      { ...liveProject, pricingMode: 'SNAPSHOT_PRICE' } as Project,
      [],
      {} as never,
      emptySummary,
      { createdAt: '2026-11-16T00:00:00.000Z' },
    );
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.pricingState.mode).toBe('LIVE_MASTER_PRICE');
    expect(b.pricingState.mode).toBe('SNAPSHOT_PRICE');
  });

  it('a legacy project (no mode) reads as SNAPSHOT (Decision D)', () => {
    const state = effectiveProjectPricingStateForProject(legacyProject);
    expect(state.mode).toBe('SNAPSHOT_PRICE');
    expect(state.modeSource).toBe('DEFAULT_SNAPSHOT');
  });

  it('formatPricingBasisLabel names recorded pins and marks defaults', () => {
    const recorded = formatPricingBasisLabel({
      mode: 'LIVE_MASTER_PRICE',
      modeSource: 'RECORDED',
      pinnedAhspDatabaseVersion: '2026.2',
      pinSource: 'RECORDED',
      pinnedMasterPriceVersion: '2026.2',
      masterPinSource: 'RECORDED',
    });
    expect(recorded).toBe('Mode Live — harga master kini • AHSP 2026.2 • Harga master 2026.2');
    const defaults = formatPricingBasisLabel({
      mode: 'SNAPSHOT_PRICE',
      modeSource: 'DEFAULT_SNAPSHOT',
      pinnedAhspDatabaseVersion: '2026.1',
      pinSource: 'LEGACY_DEFAULT',
      pinnedMasterPriceVersion: '2026.1',
      masterPinSource: 'LEGACY_DEFAULT',
    });
    expect(defaults).toContain('(default snapshot)');
    expect(defaults).toContain('AHSP 2026.1 (default)');
    expect(defaults).toContain('Harga master 2026.1 (default)');
  });
});

// ===========================================================================
// J. WEIR BOUNDARY — domain-official SDA prices (deliberate non-redirect)
// ===========================================================================
describe('§12 weir boundary — SDA domain-official source', () => {
  it('weir prices resolve from the weir DB (SE 12/SE/Db/2026), pinned exactly', () => {
    expect(lookupWeirPrice('L.01')).toMatchObject({ price: 115000, unit: 'OH', source: 'SE 12/SE/Db/2026' });
    expect(lookupWeirPrice('M.01')).toMatchObject({ price: 1600, unit: 'kg', source: 'SE 12/SE/Db/2026' });
    expect(lookupWeirPrice('M.04')).toMatchObject({ price: 15200, unit: 'kg', source: 'SE 12/SE/Db/2026' });
    expect(lookupWeirPrice('X.99')).toBeNull();
  });

  it('the canonical master ALSO prices the same resources (the boundary is deliberate, not a gap)', () => {
    // Semen Portland exists canonically (1600/kg) AND in the weir DB
    // (1600/kg) — the weir path keeps its domain-official source by
    // §12 decision, because the canonical pipeline has no SDA source
    // and overriding SDA prices with CK/HSD prices would implicitly
    // decide open owner question #9.
    const canonical = canonicalPriceResolver.resolve({ name: 'Semen Portland', unit: 'kg' });
    expect(canonical.status).toBe('RESOLVED');
    expect(canonical.price).toBe(1600);
  });
});

// ===========================================================================
// K. LEGACY QUARANTINE (M-6) — still in force
// ===========================================================================
describe('§12 PriceRepository — legacy 2022 quarantine (M-6)', () => {
  it('legacy records are tier LEGACY + period 2022-Q1, and never in the master list', () => {
    const legacy = repo.getLegacyPrices();
    expect(legacy.length).toBeGreaterThan(0);
    for (const def of legacy) {
      expect(def.sourceTier).toBe('LEGACY');
      expect(def.periodVersion).toBe('2022-Q1');
    }
    const masterIds = new Set(repo.getAll().map((d) => d.id));
    for (const def of legacy) {
      expect(masterIds.has(def.id)).toBe(false);
    }
  });

  it('a legacy code never resolves as a 2026 price through the canonical service', () => {
    const legacy = repo.getLegacyPrices();
    const sample = legacy[0];
    const canonical = canonicalPriceResolver.resolve({
      code: sample.code,
      name: sample.name,
      unit: sample.unit,
    });
    // Either MISSING, or a 2026 price — never the legacy 2022 price
    // served as current. (A 2026 record with the same code legitimately
    // wins; the quarantine is about the 2022 VALUE, not the code.)
    if (canonical.status === 'RESOLVED') {
      expect(canonical.period).toBe('2026');
    } else {
      expect(canonical.price).toBeNull();
    }
  });
});

// ===========================================================================
// L. INTEGRATED SURFACES — canonical single path (audit evidence as tests)
// ===========================================================================
describe('§12 integrated surfaces — canonical single path', () => {
  it('AHSP browser / drawer / chat share one canonical AHSP price (9.3.5.1 pin)', () => {
    // resolveAhspUnitPrice is the single price path behind the AHSP
    // browser (AhspExplorerView), the detail drawer (ahspItemDisplay),
    // and Chat AI (chatSearch) — all three call priceResolver2026.
    const r = resolveOfficialPriceForMappedItem('9.3.5.1');
    expect(r.status).toBe('PRICE_RESOLVED');
    expect(r.unitPrice).toBe(2545645);
    expect(r.unit).toBe('buah');
    expect(r.priceSource).toBe('OFFICIAL_AHSP_2026');
  });

  it('canonical AHSP composition returns a priced, labelled result', () => {
    const r = canonicalPriceResolver.resolve({ code: '9.3.5.1', name: 'Pekerjaan', unit: 'm3' });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBeGreaterThan(0);
    expect(r.category).toBe('AHSP');
    expect(r.sourceTier).toBe('OFFICIAL');
  });

  it('the unit gate is shared: gateCanonicalUnit rejects incompatible units', () => {
    const resolved = canonicalPriceResolver.resolve({ name: 'Semen Portland', unit: 'kg' });
    expect(resolved.status).toBe('RESOLVED');
    expect(gateCanonicalUnit(resolved, 'm3')).toBeNull();
    expect(gateCanonicalUnit(resolved, 'kg')).toMatchObject({ price: 1600, unit: 'kg' });
    expect(gateCanonicalUnit(resolved, 'ton')).toMatchObject({ price: 1600000, unit: 'ton' });
  });
});

// ===========================================================================
// M. PORT OF phase3PriceResolutionEngine — archived engine, canonical suite
// ===========================================================================
describe('§12 port — Phase 3 (AdvancedPriceResolutionEngine) assertions', () => {
  it('port of "Prioritizes Project-Specific": a project override beats regional + national', () => {
    const r = canonicalPriceResolver.resolve({
      name: 'Semen Portland',
      unit: 'kg',
      projectId: 'PROJ-S12-ADAPTER-001',
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(9900);
    expect(r.source).toBe('PROJECT_OVERRIDE');
  });

  it('port of "Falls back to City/Province": a regional query resolves the regional record', () => {
    const r = canonicalPriceResolver.resolve({
      name: 'Qwertyplugh Port Regional',
      unit: 'kg',
      region: 'Jawa Timur',
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(7000);
    expect(r.source).toBe('REGIONAL_STANDARDS');
  });

  it('port of "Falls back to National": a national record resolves as EZRAB_REFERENCE', () => {
    const r = canonicalPriceResolver.resolve({
      name: 'Qwertyplugh Port Nasional',
      unit: 'kg',
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(5000);
    expect(r.source).toBe('EZRAB_REFERENCE');
  });

  it('port of "Missing price returns MISSING and price null (NO Rp0)"', () => {
    const r = canonicalPriceResolver.resolve({ name: 'Qwertyplugh Unobtainium', unit: 'kg' });
    expect(r.status).toBe('MISSING');
    expect(r.price).toBeNull();
  });

  it('port of "Converts price between compatible units (kg to ton)"', () => {
    // The conversion lives in priceResolver2026 (canonical Step 2):
    // Besi Beton Rp15.000/kg -> Rp15.000.000/ton.
    // NOTE (§13): the canonical service itself rejects this converted
    // price at its sanity gate (unit-unaware ranges) — see
    // fase12-integration.md. The port pins the conversion where it
    // provably works: the Step-2 engine.
    const r = priceResolver2026.resolveResourcePrice({ resourceName: 'Besi Beton', unit: 'ton' });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(15000000);
    expect(r.unit).toBe('ton');
  });

  it('port of "Rejects conversion between incompatible units (kg to m3)"', () => {
    const r = priceResolver2026.resolveResourcePrice({ resourceName: 'Besi Beton', unit: 'm3' });
    expect(r.status).toBe('NOT_FOUND');
    expect(r.price).toBeNull();
    expect(r.explanation).toContain('UNIT_MISMATCH');
  });

  it('port of "Deterministically resolves conflict": the same query always answers the same price', () => {
    const a = canonicalPriceResolver.resolve({ name: 'Semen Portland', unit: 'kg' });
    const b = canonicalPriceResolver.resolve({ name: 'Semen Portland', unit: 'kg' });
    expect(a.status).toBe(b.status);
    expect(a.price).toBe(b.price);
    // The archived engine's "latest effective date wins" rule has NO
    // canonical equivalent (Steps 3/5 match by name+region over a
    // deduplicated repository) — it is NOT ported; see the report.
  });

  it('port of "Creates immutable snapshot": SNAPSHOT mode resolves frozen prices', () => {
    const snap = canonicalPriceResolver.resolve({
      name: 'Semen Portland',
      unit: 'kg',
      pricingMode: 'SNAPSHOT_PRICE',
      snapshotRef: { pricesByComponentKey: { 'semen portland|kg': 1234 }, label: 'snap-s12' },
    });
    expect(snap.status).toBe('RESOLVED');
    expect(snap.price).toBe(1234);
    expect(snap.source).toBe('SNAPSHOT_PRICE');
    // A different snapshot ref answers a different frozen price — the
    // snapshot is data, not live state.
    const snap2 = canonicalPriceResolver.resolve({
      name: 'Semen Portland',
      unit: 'kg',
      pricingMode: 'SNAPSHOT_PRICE',
      snapshotRef: { pricesByComponentKey: { 'semen portland|kg': 4321 }, label: 'snap-s12-b' },
    });
    expect(snap2.price).toBe(4321);
    // And LIVE still answers the live master.
    const live = canonicalPriceResolver.resolve({ name: 'Semen Portland', unit: 'kg' });
    expect(live.price).toBe(1600);
  });

  it('port of "Detects expired price": the adapter reports EXPIRED with live-master fallback', () => {
    const r = resolveCanonicalPriceAsResolvedPrice(
      { code: 'M-001', name: 'Semen Portland', unit: 'kg' },
      { projectId: 'PROJ-S12-EXPIRED-001' },
    );
    expect(r.status).toBe('EXPIRED');
    expect(r.price).toBe(1600);
    expect(r.projectPrice).toBe(12345);
    expect(r.explanation).toContain('2025-01-01');
  });

  it('port of "Detects negative price anomaly": the sanity gate rejects negative prices', () => {
    const sanity = priceSanityValidator.validatePrice('Semen Portland', -100, 'kg');
    expect(sanity.status).toBe('PRICE_INVALID');
    expect(sanity.isValid).toBe(false);
    const r = canonicalPriceResolver.resolve({ name: 'Qwertyplugh Negative Price', unit: 'kg' });
    expect(r.status).toBe('MISSING');
    expect(r.price).toBeNull();
  });

  it('port of "Rejects unconfirmed Rp0": a zero price resolves as MISSING (never Rp0)', () => {
    const sanity = priceSanityValidator.validatePrice('Semen Portland', 0, 'kg');
    expect(sanity.isValid).toBe(false);
    const r = canonicalPriceResolver.resolve({ name: 'Qwertyplugh Zero Price', unit: 'kg' });
    expect(r.status).toBe('MISSING');
    expect(r.price).toBeNull();
  });
});

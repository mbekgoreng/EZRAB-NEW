/**
 * §9 IMPACT PREVIEW — the real impact calculator (Master Pricing program).
 *
 * What this suite pins (§9 (a)–(g) + §14):
 * - (a) the REAL `ImpactProvider`: a small diff → exact, deterministic impact.
 * - (b) scope: per-item deltas (old/new/%), affected components per family,
 *       per-project deltas over REAL workspace projects via the canonical engine.
 * - (c) LIVE / SNAPSHOT / OVERRIDE modes (SNAPSHOT delta 0 + adoption preview).
 * - (d) stale previews are refused (pointer moved / baseline moved / tampered).
 * - (e) rollback: deltas run in the opposite direction, exactly negated.
 * - (f) complete auditable preview; NOT_COMPUTED (never fake COMPUTED) on
 *       incomplete input; full-rupiah amounts via the canonical engine.
 * - (g) full-catalog performance (measured + reported, no sampling).
 * - Purity: frozen inputs never throw; state before == state after.
 * - Mode A integration: the confirm flow uses the real provider.
 *
 * FIXTURE FACTS (all probed against the real catalog 2026-11-16, pinned here):
 * - Item 1.1.1.1 (CK): FULL, baked == composition == Rp715.816; labor
 *   L.01 Pekerja OH x0,6 @100.000, L.02 x0,2 + x0,2 @145.000. Its labor
 *   components carry CODES.
 * - Items 1.1.1.2 (Rp577.752) / 1.1.1.3 (Rp343.854): FULL — but ALL their
 *   components are CODELESS (they resolve by name). A code-keyed price
 *   change therefore moves ONLY 1.1.1.1 in the [A,B,C] catalog — the
 *   codeless components are counted, not silently attributed.
 * - [A,B,C]: 37 components, 32 codeless, 4 distinct keys.
 * - Full catalog: 5.742 items / 30.265 components / 18.899 codeless /
 *   395 distinct keys. CK is 97% codeless; BM + SMKK are 100% coded.
 * - L.01 Pekerja OH = Rp100.000 (Standar Upah Cipta Karya SE 47/2026);
 *   L.02 OH = Rp145.000; L.03|jam (BM Mandor) = Rp33.312,62.
 * - E01|kegiatan (SMKK sewa LCD) is currently UNPRICED (NOT_FOUND) —
 *   the addition / NEWLY_PRICED fixture.
 *
 * Fixture projects are labelled FIXTURE everywhere — they are test
 * inputs only, never presented as real workspace impact (§9 (b)).
 */

import { describe, expect, it } from 'vitest';
import {
  applyDirectEdit,
  assessDirectEditImpact,
  assessRollbackImpact,
  buildRegistryState,
  compareAhspSnapshots,
  computeAhspContentChecksum,
  confirmDirectEdit,
  createCheckpoint,
  defaultImpactProvider,
  getActiveVersion,
  notComputedImpactProvider,
  snapshotPathFor,
  type AhspFamily,
  type AhspVersionRecord,
  type AhspVersionRegistryState,
} from '../data/nationalCostDatabase/ahspVersioning';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { MASTER_PRICE_VERSION } from '../data/priceDatabase2026/types';
import { recalculateCostSummary } from '../engine/unifiedProjectEngine';
import {
  buildResourceComponentIndex,
  computeAhspVersionImpact,
  computeCatalogChecksum,
  computeMasterPriceImpact,
  computeProjectsFingerprint,
  markPreviewStale,
  masterPriceImpactProvider,
  resolveCurrentBaselinePrices,
  validateImpactPreviewFreshness,
  type MasterPriceChangeInput,
  type MasterPriceImpactPreview,
  type ProjectImpactInput,
} from '../engine/pricing/impact/masterPriceImpactPreview';
import { collectWorkspaceProjects } from '../engine/pricing/impact/workspaceProjectCollector';
import type { AHSPComponent, ProjectPriceOverride, RabItem } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = '2026-11-16T00:00:00.000Z';
const T1 = '2026-11-16T01:00:00.000Z';
const T3 = '2026-11-16T03:00:00.000Z';
const REASON = 'Fixture reason for testing (long enough)';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Real catalog items (deep-cloned per use — the runtime catalog is never mutated). */
function realItem(code: string): NationalAHSPItem {
  const found = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.code === code);
  if (!found) throw new Error(`Fixture catalog item ${code} not found`);
  return clone(found);
}

/** The small fixture catalog: 1.1.1.1 (coded labor), 1.1.1.2, 1.1.1.3 (all codeless). */
function smallCatalog(): NationalAHSPItem[] {
  return [realItem('1.1.1.1'), realItem('1.1.1.2'), realItem('1.1.1.3')];
}

/** Synthetic AHSP item (NOT a real catalog item — labelled FIXTURE). */
function makeFixtureItem(overrides: Partial<NationalAHSPItem>): NationalAHSPItem {
  return {
    id: 'AHSP-FIXTURE-000001',
    code: 'FIXTURE-NEW-1',
    codeNormalized: 'FIXTURENEW1',
    name: 'Fixture: newly priced equipment (not a real AHSP item)',
    unit: 'kegiatan',
    domain: 'SMKK',
    category: 'FIXTURE',
    version: '2026',
    year: 2026,
    normativeStatus: 'Normatif',
    method: 'Manual',
    sourceId: 'FIXTURE',
    sourceDocument: 'Test fixture (not a real source document)',
    status: 'VERIFIED',
    laborComponents: [],
    materialComponents: [],
    equipmentComponents: [],
    totalLabor: null,
    totalMaterial: null,
    totalEquipment: null,
    unitPrice: null,
    lastUpdated: '2026-11-16',
    dataQualityScore: 90,
    ...overrides,
  };
}

function makeComponent(overrides: Partial<AHSPComponent> = {}): AHSPComponent {
  return {
    id: 'COMP-FIXTURE-1',
    code: 'E01',
    name: 'Sewa LCD proyektor & sound system kegiatan',
    unit: 'kegiatan',
    coefficient: 1,
    unitPrice: null,
    total: null,
    resourceType: 'EQUIPMENT',
    ...overrides,
  };
}

/** Minimal valid RabItem (FIXTURE). */
function makeRabItem(overrides: Partial<RabItem> & { id: string }): RabItem {
  return {
    no: 1,
    code: '1.1.1.1',
    category: 'FIXTURE',
    description: 'Fixture RAB item',
    volume: 1,
    unit: 'm',
    unitPrice: 715816,
    amount: 715816,
    priceStatus: 'PRICE_RESOLVED',
    ...overrides,
  };
}

/** Fixture project input (FIXTURE — labelled, never real workspace data). */
function makeProject(overrides: Partial<ProjectImpactInput> & { projectId: string }): ProjectImpactInput {
  return {
    projectName: `Fixture project ${overrides.projectId}`,
    pricingMode: 'LIVE_MASTER_PRICE',
    items: [],
    costSummary: {},
    ...overrides,
  };
}

/** The L.01 change: Pekerja OH Rp100.000 → Rp110.000 (baseline probed, pinned below). */
function l01Change(): MasterPriceChangeInput {
  return {
    resourceCode: 'L.01',
    resourceName: 'Pekerja',
    category: 'LABOR',
    unit: 'OH',
    oldPrice: 100000,
    newPrice: 110000,
  };
}

/** The L.02 change: Tukang OH Rp145.000 → Rp150.000. */
function l02Change(): MasterPriceChangeInput {
  return {
    resourceCode: 'L.02',
    resourceName: 'Tukang kayu',
    category: 'LABOR',
    unit: 'OH',
    oldPrice: 145000,
    newPrice: 150000,
  };
}

/** LIVE fixture project: A (vol 10) + B (vol 2), stored at their catalog prices. */
function liveProjectAB(): ProjectImpactInput {
  return makeProject({
    projectId: 'FIXTURE-P-LIVE',
    pricingMode: 'LIVE_MASTER_PRICE',
    items: [
      makeRabItem({
        id: 'FIXTURE-RAB-A',
        no: 1,
        code: '1.1.1.1',
        ahspCode: '1.1.1.1',
        description: 'Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter',
        volume: 10,
        unit: 'm',
        unitPrice: 715816,
        amount: 7158160,
      }),
      makeRabItem({
        id: 'FIXTURE-RAB-B',
        no: 2,
        code: '1.1.1.2',
        ahspCode: '1.1.1.2',
        description: 'Pembuatan 1 m’ pagar sementara dari seng gelombang',
        volume: 2,
        unit: 'm',
        unitPrice: 577752,
        amount: 1155504,
      }),
    ],
  });
}

/** The version-change target: A with L.01 coef 0,6 → 0,7 (baked 725.816), B unchanged, D added, C removed. */
function versionTargetItems(): NationalAHSPItem[] {
  const [a, b, c] = smallCatalog();
  const aPrime = clone(a);
  aPrime.laborComponents[0].coefficient = 0.7;
  aPrime.laborComponents[0].total = 70000;
  aPrime.totalLabor = 137600;
  aPrime.unitPrice = 725816;
  const d = clone(c);
  d.id = 'AHSP-FIXTURE-D';
  d.code = '1.1.1.99';
  d.codeNormalized = '111199';
  d.name = 'Fixture added item (not a real AHSP item)';
  return [aPrime, b, d];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// Pinned v2026.1 content checksums (§8 — re-pinned here for the mirror test).
const PINNED_CHECKSUMS: Record<AhspFamily, string> = {
  CIPTA_KARYA: 'e0b539f134f8d64c',
  BINA_MARGA: '08082e878d4f0e90',
  SUMBER_DAYA_AIR: '1c4794f9ec5dc3e1',
  SMKK: 'e77bbc73b1fea331',
};

// ---------------------------------------------------------------------------
// §9 (g): the resource → component index + the §8 checksum mirror
// ---------------------------------------------------------------------------

describe('§9 (g) resource index', () => {
  it('indexes the [A,B,C] fixture catalog: 37 components, 32 codeless, 4 keys', () => {
    const index = buildResourceComponentIndex(smallCatalog());
    expect(index.itemCount).toBe(3);
    expect(index.componentCount).toBe(37);
    // Only 1.1.1.1 has coded labor; 1.1.1.2/1.1.1.3 are entirely codeless.
    expect(index.codelessComponentCount).toBe(32);
    expect(index.distinctKeyCount).toBe(4);
    expect(index.byKey.get('L01|OH')).toHaveLength(1);
    expect(index.byKey.get('L01|OH')![0].itemCode).toBe('1.1.1.1');
    expect(index.byKey.get('L02|OH')).toHaveLength(2);
    expect(index.byKey.get('L03|OH')).toHaveLength(1);
    expect(index.byKey.get('L04|OH')).toHaveLength(1);
  });

  it('indexes the full catalog: 5.742 items / 30.265 components / 18.899 codeless / 395 keys', () => {
    const index = buildResourceComponentIndex(ALL_OFFICIAL_AHSP_ITEMS);
    expect(index.itemCount).toBe(5742);
    expect(index.componentCount).toBe(30265);
    expect(index.codelessComponentCount).toBe(18899);
    expect(index.distinctKeyCount).toBe(395);
    // The biggest fan-outs (BM labor, all coded):
    expect(index.byKey.get('L03|jam')).toHaveLength(1012);
    expect(index.byKey.get('L01|jam')).toHaveLength(1001);
    expect(index.byKey.get('L01|OH')).toHaveLength(496);
  });

  it('the codeless split is a catalog fact: CK 97% codeless, BM + SMKK 100% coded', () => {
    const ck = buildResourceComponentIndex(ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain === 'CIPTA_KARYA'));
    expect(ck.componentCount).toBe(16506);
    expect(ck.codelessComponentCount).toBe(15967);
    const bm = buildResourceComponentIndex(ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain === 'BINA_MARGA'));
    expect(bm.codelessComponentCount).toBe(0);
    const smkk = buildResourceComponentIndex(ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain === 'SMKK'));
    expect(smkk.codelessComponentCount).toBe(0);
  });
});

describe('§9 checksum mirror (§8 computeAhspContentChecksum)', () => {
  it.each([
    ['CIPTA_KARYA', 'e0b539f134f8d64c'],
    ['BINA_MARGA', '08082e878d4f0e90'],
    ['SUMBER_DAYA_AIR', '1c4794f9ec5dc3e1'],
    ['SMKK', 'e77bbc73b1fea331'],
  ] as Array<[AhspFamily, string]>)(
    '%s: computeCatalogChecksum === §8 checksum === pinned value',
    { timeout: 30000 },
    (family, pinned) => {
      const items = ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain === family);
      expect(computeCatalogChecksum(items)).toBe(computeAhspContentChecksum(items));
      expect(computeCatalogChecksum(items)).toBe(pinned);
      expect(PINNED_CHECKSUMS[family]).toBe(pinned);
    },
  );
});

// ---------------------------------------------------------------------------
// Baseline pins: the fixture prices are REAL resolver results, not invented
// ---------------------------------------------------------------------------

describe('§9 fixture baselines (probed against the real resolver)', () => {
  it('L.01 Pekerja OH resolves to Rp100.000', () => {
    const res = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L.01',
      resourceName: 'Pekerja',
      resourceType: 'labor',
      unit: 'OH',
    });
    expect(res.status).toBe('RESOLVED');
    expect(res.price).toBe(100000);
  });

  it('L.02 Tukang OH resolves to Rp145.000', () => {
    const res = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L.02',
      resourceName: 'Tukang kayu',
      resourceType: 'labor',
      unit: 'OH',
    });
    expect(res.status).toBe('RESOLVED');
    expect(res.price).toBe(145000);
  });

  it('L03 Mandor jam (BM) resolves to Rp33.312,62', () => {
    const res = priceResolver2026.resolveResourcePrice({
      resourceCode: 'L03',
      resourceName: 'Mandor',
      resourceType: 'labor',
      unit: 'jam',
    });
    expect(res.status).toBe('RESOLVED');
    expect(res.price).toBe(33312.62);
  });

  it('E01 kegiatan (SMKK) is currently UNPRICED', () => {
    const res = priceResolver2026.resolveResourcePrice({
      resourceCode: 'E01',
      resourceName: 'Sewa LCD proyektor & sound system kegiatan',
      resourceType: 'equipment',
      unit: 'kegiatan',
    });
    expect(res.status).not.toBe('RESOLVED');
    expect(res.price).toBeNull();
  });

  it('item 1.1.1.1 is FULL with baked == composition == Rp715.816', () => {
    const item = realItem('1.1.1.1');
    expect(item.unitPrice).toBe(715816);
    const comp = priceResolver2026.resolveAhspUnitPrice(item, {
      pricingContext: { pricingMode: 'LIVE_MASTER_PRICE' },
    });
    expect(comp.pricingStatus).toBe('FULL');
    expect(comp.unitPrice).toBe(715816);
    expect(comp.missingComponents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §9 (b): master-price impact — L.01 Pekerja OH Rp100.000 → Rp110.000
// ---------------------------------------------------------------------------

describe('§9 (b) master-price impact: L.01 OH 100.000 → 110.000', () => {
  it('computes the exact catalog impact over [A,B,C] with 0 projects (honest zero)', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [],
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    expect(preview.kind).toBe('MASTER_PRICE_CHANGE');
    expect(preview.notComputedReasons).toEqual([]);

    // Only 1.1.1.1 moves: 0,6 × Rp10.000 = Rp6.000 (B/C labor is codeless).
    expect(preview.items.summary).toEqual({
      added: 0,
      removed: 0,
      revised: 0,
      priceChanged: 1,
      totalAffected: 1,
      uncomputable: 0,
    });
    const [item] = preview.items.changed;
    expect(item.code).toBe('1.1.1.1');
    expect(item.changeKind).toBe('PRICE_CHANGED');
    expect(item.oldUnitPrice).toBe(715816);
    expect(item.newUnitPrice).toBe(721816);
    expect(item.delta).toBe(6000);
    expect(item.percentChange).toBe(0.84);
    expect(item.componentChangeCount).toBe(1);
    expect(item.pricingStatusNew).toBe('FULL');
    expect(item.missingComponentsNew).toBe(0);

    // One affected component reference, with its per-unit delta.
    expect(preview.components.summary.affectedReferenceCount).toBe(1);
    expect(preview.components.summary.codelessComponentCount).toBe(32);
    const [ref] = preview.components.affected;
    expect(ref.itemCode).toBe('1.1.1.1');
    expect(ref.resourceKey).toBe('L01|OH');
    expect(ref.coefficient).toBe(0.6);
    expect(ref.oldPrice).toBe(100000);
    expect(ref.newPrice).toBe(110000);
    expect(ref.deltaPerUnit).toBe(6000);
    expect(preview.components.summary.byFamily).toEqual([
      {
        family: 'CIPTA_KARYA',
        affectedItemCount: 1,
        affectedComponentReferenceCount: 1,
        addedItemCount: 0,
        removedItemCount: 0,
        revisedItemCount: 0,
        // A price-changed item is NOT a revision — counted separately.
        priceChangedItemCount: 1,
      },
    ]);

    // 0 projects in the workspace → 0 affected (honest, no invented projects).
    expect(preview.projects.summary.totalProjectCount).toBe(0);
    expect(preview.projects.summary.affectedProjectCount).toBe(0);
    expect(preview.projects.projects).toEqual([]);
    expect(preview.aggregates.totalDeltaGrandTotal).toBe(0);

    // §4.4 history inputs.
    expect(preview.affectedAhspReferences).toEqual(['1.1.1.1']);
    expect(preview.affectedLivePriceProjects).toEqual([]);

    // Fingerprint (§9 (d)).
    expect(preview.fingerprint.kind).toBe('MASTER_PRICE_CHANGE');
    expect(preview.fingerprint.masterPriceVersion).toBe(MASTER_PRICE_VERSION);
    expect(preview.fingerprint.changedResourceBaseline).toEqual([{ key: 'L01|OH', oldPrice: 100000 }]);
    expect(preview.fingerprint.computedAt).toBe(T0);
  });

  it('is deterministic: same input → identical preview (including the fingerprint hash)', () => {
    const input = {
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    };
    const first = computeMasterPriceImpact(input);
    const second = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    });
    expect(second).toEqual(first);
    expect(second.fingerprint.fingerprintHash).toBe(first.fingerprint.fingerprintHash);
  });

  it('two-key change: L.01 + L.02 move item A by exactly Rp8.000', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change(), l02Change()],
      catalogItems: smallCatalog(),
      projects: [],
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    const [item] = preview.items.changed;
    // 0,6 × 10.000 (L.01) + 0,4 × 5.000 (L.02 ×2 rows) = 6.000 + 2.000.
    expect(item.oldUnitPrice).toBe(715816);
    expect(item.newUnitPrice).toBe(723816);
    expect(item.delta).toBe(8000);
    expect(item.percentChange).toBe(1.12);
    expect(item.componentChangeCount).toBe(3);
    expect(preview.components.summary.affectedReferenceCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// §9 (c): LIVE / SNAPSHOT / OVERRIDE
// ---------------------------------------------------------------------------

describe('§9 (c) project modes', () => {
  it('LIVE: the project delta is computed via the canonical engine (Rp+60.000)', () => {
    const project = liveProjectAB();
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [project],
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    const [impact] = preview.projects.projects;
    expect(impact.pricingMode).toBe('LIVE_MASTER_PRICE');
    expect(impact.status).toBe('AFFECTED');
    // Old total: 10 × 715.816 + 2 × 577.752 = 8.313.664.
    expect(impact.oldGrandTotal).toBe(8313664);
    // Only A moves: 10 × 721.816 + 2 × 577.752 = 8.373.664.
    expect(impact.newGrandTotal).toBe(8373664);
    expect(impact.deltaGrandTotal).toBe(60000);
    expect(impact.repricedItemCount).toBe(1);
    expect(impact.unchangedItemCount).toBe(1);
    expect(impact.items).toHaveLength(1); // unchanged items are counted, not listed
    const [itemImpact] = impact.items;
    expect(itemImpact.rabItemId).toBe('FIXTURE-RAB-A');
    expect(itemImpact.status).toBe('REPRICED');
    expect(itemImpact.oldUnitPrice).toBe(715816);
    expect(itemImpact.newUnitPrice).toBe(721816);
    expect(itemImpact.newAmount).toBe(7218160);
    expect(itemImpact.deltaAmount).toBe(60000);
    expect(preview.aggregates.totalDeltaGrandTotal).toBe(60000);
    expect(preview.affectedLivePriceProjects).toEqual(['FIXTURE-P-LIVE']);

    // INDEPENDENT cross-check: the same totals from recalculateCostSummary directly.
    const expectedNew = recalculateCostSummary(
      [
        { ...project.items[0], unitPrice: 721816, amount: 7218160 },
        project.items[1],
      ],
      {},
    );
    expect(expectedNew.grandTotal).toBe(8373664);
    const expectedOld = recalculateCostSummary([...project.items], {});
    expect(expectedOld.grandTotal).toBe(8313664);
  });

  it('SNAPSHOT: locked (delta 0) + an adoption preview of the would-be delta', () => {
    const project = liveProjectAB();
    project.pricingMode = 'SNAPSHOT_PRICE';
    project.projectId = 'FIXTURE-P-SNAP';
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [project],
      computedAt: T0,
    });
    const [impact] = preview.projects.projects;
    expect(impact.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(impact.status).toBe('LOCKED_SNAPSHOT');
    expect(impact.oldGrandTotal).toBe(8313664);
    expect(impact.newGrandTotal).toBe(8313664);
    expect(impact.deltaGrandTotal).toBe(0);
    expect(impact.items).toEqual([]); // locked projects list no repriced items
    // The adoption preview is data only (excluded from aggregates).
    expect(impact.adoptionPreview).not.toBeNull();
    expect(impact.adoptionPreview!.newGrandTotal).toBe(8373664);
    expect(impact.adoptionPreview!.deltaGrandTotal).toBe(60000);
    expect(impact.adoptionPreview!.affectedItemCount).toBe(1);
    expect(impact.adoptionPreview!.uncomputableItemCount).toBe(0);
    expect(preview.aggregates.totalDeltaGrandTotal).toBe(0);
    expect(preview.projects.summary.lockedSnapshotCount).toBe(1);
  });

  it('absent mode reads as SNAPSHOT_PRICE (Decision D — never silently live)', () => {
    const project = liveProjectAB();
    project.pricingMode = null;
    project.projectId = 'FIXTURE-P-LEGACY';
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [project],
      computedAt: T0,
    });
    const [impact] = preview.projects.projects;
    expect(impact.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(impact.pricingModeSource).toBe('DEFAULT_SNAPSHOT');
    expect(impact.status).toBe('LOCKED_SNAPSHOT');
    expect(impact.deltaGrandTotal).toBe(0);
  });

  it('OVERRIDE: only the uncovered components move (L.01 covered @90.000, L.02 moves)', () => {
    const override: ProjectPriceOverride = {
      id: 'FIXTURE-OVR-1',
      projectId: 'FIXTURE-P-OVR',
      resourceCode: 'L.01',
      resourceName: 'Pekerja',
      category: 'LABOR',
      unit: 'OH',
      masterPrice: 100000,
      projectPrice: 90000,
      isOverridden: true,
      lastUpdated: T0,
    };
    // Stored prices already reflect the override: A = 715.816 − 0,6×10.000 = 709.816.
    const project = makeProject({
      projectId: 'FIXTURE-P-OVR',
      pricingMode: 'PROJECT_OVERRIDE',
      overrides: [override],
      items: [
        makeRabItem({
          id: 'FIXTURE-RAB-A',
          code: '1.1.1.1',
          ahspCode: '1.1.1.1',
          description: 'Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter',
          volume: 10,
          unit: 'm',
          unitPrice: 709816,
          amount: 7098160,
        }),
        makeRabItem({
          id: 'FIXTURE-RAB-B',
          no: 2,
          code: '1.1.1.2',
          ahspCode: '1.1.1.2',
          description: 'Pembuatan 1 m’ pagar sementara dari seng gelombang',
          volume: 2,
          unit: 'm',
          unitPrice: 577752,
          amount: 1155504,
        }),
      ],
    });
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change(), l02Change()],
      catalogItems: smallCatalog(),
      projects: [project],
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    const [impact] = preview.projects.projects;
    expect(impact.pricingMode).toBe('PROJECT_OVERRIDE');
    expect(impact.status).toBe('AFFECTED');
    // Old: 10 × 709.816 + 2 × 577.752 = 8.253.664.
    expect(impact.oldGrandTotal).toBe(8253664);
    // Only the L.02 part of A moves: 709.816 + 2.000 = 711.816 → +20.000.
    expect(impact.newGrandTotal).toBe(8273664);
    expect(impact.deltaGrandTotal).toBe(20000);
    const [itemImpact] = impact.items;
    expect(itemImpact.rabItemId).toBe('FIXTURE-RAB-A');
    expect(itemImpact.status).toBe('REPRICED');
    expect(itemImpact.newUnitPrice).toBe(711816);
    expect(itemImpact.deltaAmount).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// §9 (f): skip rules + newly priced items
// ---------------------------------------------------------------------------

describe('§9 (f) skip rules (each with a reason, never silent)', () => {
  it('MANUAL / ESTIMATED / HSP / unlinked items are SKIPPED; only the linked item moves', () => {
    const project = makeProject({
      projectId: 'FIXTURE-P-SKIP',
      pricingMode: 'LIVE_MASTER_PRICE',
      items: [
        makeRabItem({
          id: 'FIXTURE-RAB-MANUAL',
          code: '1.1.1.1',
          ahspCode: '1.1.1.1',
          description: 'Manual price item',
          volume: 1,
          unitPrice: 999999,
          amount: 999999,
          priceStatus: 'PRICE_MANUAL',
        }),
        makeRabItem({
          id: 'FIXTURE-RAB-EST',
          no: 2,
          code: '1.1.1.1',
          ahspCode: '1.1.1.1',
          description: 'Estimated price item',
          volume: 1,
          unitPrice: 888888,
          amount: 888888,
          priceStatus: 'PRICE_ESTIMATED',
        }),
        makeRabItem({
          id: 'FIXTURE-RAB-HSP',
          no: 3,
          code: '1.1.1.1',
          ahspCode: '1.1.1.1',
          description: 'HSP basis item',
          volume: 1,
          unitPrice: 715816,
          amount: 715816,
          priceCostBasis: 'HSP',
        }),
        makeRabItem({
          id: 'FIXTURE-RAB-NOLINK',
          no: 4,
          code: 'MANUAL-1',
          description: 'Manual item with no AHSP linkage',
          volume: 1,
          unitPrice: 50000,
          amount: 50000,
        }),
        makeRabItem({
          id: 'FIXTURE-RAB-A',
          no: 5,
          code: '1.1.1.1',
          ahspCode: '1.1.1.1',
          description: 'Linked item',
          volume: 1,
          unitPrice: 715816,
          amount: 715816,
        }),
      ],
    });
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [project],
      computedAt: T0,
    });
    const [impact] = preview.projects.projects;
    expect(impact.skippedItemCount).toBe(4);
    expect(impact.repricedItemCount).toBe(1);
    expect(impact.deltaGrandTotal).toBe(6000); // only the linked item, vol 1
    const byId = new Map(impact.items.map((i) => [i.rabItemId, i]));
    expect(byId.get('FIXTURE-RAB-MANUAL')!.status).toBe('SKIPPED');
    expect(byId.get('FIXTURE-RAB-MANUAL')!.reason).toMatch(/PRICE_MANUAL/);
    expect(byId.get('FIXTURE-RAB-EST')!.status).toBe('SKIPPED');
    expect(byId.get('FIXTURE-RAB-EST')!.reason).toMatch(/PRICE_ESTIMATED/);
    expect(byId.get('FIXTURE-RAB-HSP')!.status).toBe('SKIPPED');
    expect(byId.get('FIXTURE-RAB-HSP')!.reason).toMatch(/HSP/);
    expect(byId.get('FIXTURE-RAB-NOLINK')!.status).toBe('SKIPPED');
    expect(byId.get('FIXTURE-RAB-NOLINK')!.reason).toMatch(/No AHSP linkage/);
    // Skipped items keep their stored price and amount.
    expect(byId.get('FIXTURE-RAB-MANUAL')!.newUnitPrice).toBe(999999);
    expect(byId.get('FIXTURE-RAB-MANUAL')!.deltaAmount).toBe(0);
  });
});

describe('§9 (f) newly priced items (price ADDITION)', () => {
  it('adding E01|kegiatan @50.000 prices a previously unpriced item (NEWLY_PRICED)', () => {
    const fixtureItem = makeFixtureItem({
      equipmentComponents: [makeComponent()],
    });
    const project = makeProject({
      projectId: 'FIXTURE-P-NEW',
      pricingMode: 'LIVE_MASTER_PRICE',
      items: [
        makeRabItem({
          id: 'FIXTURE-RAB-NEW',
          code: 'FIXTURE-NEW-1',
          ahspCode: 'FIXTURE-NEW-1',
          description: 'Fixture: newly priced equipment',
          volume: 3,
          unit: 'kegiatan',
          unitPrice: null,
          amount: null,
          priceStatus: 'PRICE_UNRESOLVED',
        }),
      ],
    });
    const preview = computeMasterPriceImpact({
      priceChanges: [
        {
          resourceCode: 'E01',
          resourceName: 'Sewa LCD proyektor & sound system kegiatan',
          category: 'EQUIPMENT',
          unit: 'kegiatan',
          oldPrice: null,
          newPrice: 50000,
        },
      ],
      catalogItems: [fixtureItem],
      projects: [project],
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    const [item] = preview.items.changed;
    expect(item.code).toBe('FIXTURE-NEW-1');
    expect(item.oldUnitPrice).toBeNull();
    expect(item.newUnitPrice).toBe(50000);
    expect(item.delta).toBeNull(); // a delta against "no price" is undefined
    const [impact] = preview.projects.projects;
    expect(impact.oldGrandTotal).toBe(0); // the unpriced item was excluded
    expect(impact.newGrandTotal).toBe(150000);
    expect(impact.deltaGrandTotal).toBe(150000);
    expect(preview.aggregates.newlyPricedItemCount).toBe(1);
    const [itemImpact] = impact.items;
    expect(itemImpact.status).toBe('NEWLY_PRICED');
    expect(itemImpact.newUnitPrice).toBe(50000);
    expect(itemImpact.newAmount).toBe(150000);
    expect(itemImpact.deltaAmount).toBe(150000);
  });
});

// ---------------------------------------------------------------------------
// §9 (f): NOT_COMPUTED — never a fake COMPUTED
// ---------------------------------------------------------------------------

describe('§9 (f) NOT_COMPUTED on incomplete or uncomputable input', () => {
  it('price REMOVAL (newPrice null) → NOT_COMPUTED (the fallback cannot be determined)', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [{ ...l01Change(), newPrice: null }],
      catalogItems: smallCatalog(),
      projects: [],
      computedAt: T0,
    });
    expect(preview.status).toBe('NOT_COMPUTED');
    expect(preview.notComputedReasons.join(' ')).toMatch(/REMOVAL/);
    expect(preview.items.changed).toEqual([]);
    expect(preview.aggregates.totalDeltaGrandTotal).toBeNull();
  });

  it('baseline mismatch (stated old price ≠ resolver price) → NOT_COMPUTED', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [{ ...l01Change(), oldPrice: 99999 }],
      catalogItems: smallCatalog(),
      projects: [],
      computedAt: T0,
    });
    expect(preview.status).toBe('NOT_COMPUTED');
    expect(preview.notComputedReasons.join(' ')).toMatch(/baseline/i);
  });

  it('duplicate change keys → NOT_COMPUTED', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change(), l01Change()],
      catalogItems: smallCatalog(),
      projects: [],
      computedAt: T0,
    });
    expect(preview.status).toBe('NOT_COMPUTED');
    expect(preview.notComputedReasons.join(' ')).toMatch(/duplicate/i);
  });

  it('missing projects (undefined) → NOT_COMPUTED (absent is unknown, not zero)', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: undefined as unknown as ProjectImpactInput[],
      computedAt: T0,
    });
    expect(preview.status).toBe('NOT_COMPUTED');
    expect(preview.notComputedReasons.join(' ')).toMatch(/projects not supplied/);
  });

  it('missing catalogItems → NOT_COMPUTED', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: undefined as unknown as NationalAHSPItem[],
      projects: [],
      computedAt: T0,
    });
    expect(preview.status).toBe('NOT_COMPUTED');
  });

  it('an empty change list is a COMPLETE input: COMPUTED with zero impact', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    expect(preview.items.summary.totalAffected).toBe(0);
    expect(preview.aggregates.totalDeltaGrandTotal).toBe(0);
  });

  it('the provider with a minimal (legacy) description → NOT_COMPUTED, never a number', () => {
    const impact = masterPriceImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 1, removed: 0, revised: 1, unchanged: 1 },
    });
    expect(impact.status).toBe('NOT_COMPUTED');
    expect(impact.note).toMatch(/not computed/i);
  });

  it('notComputedImpactProvider remains the explicit opt-out', () => {
    const impact = notComputedImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 0, removed: 0, revised: 0, unchanged: 3 },
    });
    expect(impact.status).toBe('NOT_COMPUTED');
  });

  it('defaultImpactProvider IS the real provider', () => {
    expect(defaultImpactProvider).toBe(masterPriceImpactProvider);
  });
});

// ---------------------------------------------------------------------------
// §9 (b)/(e): version impact + rollback
// ---------------------------------------------------------------------------

describe('§9 (b)/(e) version impact + rollback', () => {
  function versionInput(projects: ProjectImpactInput[]) {
    const sourceItems = smallCatalog();
    const targetItems = versionTargetItems();
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: sourceItems },
      { versionId: '2026.2', items: targetItems },
      'CIPTA_KARYA',
    );
    return {
      family: 'CIPTA_KARYA' as const,
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      sourceItems,
      targetItems,
      diff,
      sourceContentChecksum: computeAhspContentChecksum(sourceItems),
      targetContentChecksum: computeAhspContentChecksum(targetItems),
      activeVersionIdAtCompute: '2026.1',
      projects,
      computedAt: T0,
    };
  }

  it('the §8 diff describes the fixture change: +1 / −1 / ~1 / =1', () => {
    const { diff } = versionInput([]);
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.removed).toBe(1);
    expect(diff.summary.revised).toBe(1);
    expect(diff.summary.unchanged).toBe(1);
    expect(diff.addedCodes.map((i) => i.code)).toEqual(['1.1.1.99']);
    expect(diff.removedCodes.map((i) => i.code)).toEqual(['1.1.1.3']);
    expect(diff.revisedCodes.map((i) => i.code)).toEqual(['1.1.1.1']);
  });

  it('computes the exact version impact: catalog deltas + project deltas + removed-item uncomputability', () => {
    const removedProject = makeProject({
      projectId: 'FIXTURE-P-REMOVED',
      pricingMode: 'LIVE_MASTER_PRICE',
      items: [
        makeRabItem({
          id: 'FIXTURE-RAB-C',
          code: '1.1.1.3',
          ahspCode: '1.1.1.3',
          description: 'Pembuatan 1 m’ pagar sementara dari kawat duri',
          volume: 1,
          unit: 'm',
          unitPrice: 343854,
          amount: 343854,
        }),
      ],
    });
    const preview = computeAhspVersionImpact(versionInput([liveProjectAB(), removedProject]));
    expect(preview.status).toBe('COMPUTED');
    expect(preview.kind).toBe('AHSP_VERSION_CHANGE');

    // Catalog: A revised +10.000 (+1,40%), D added, C removed.
    expect(preview.items.summary).toEqual({
      added: 1,
      removed: 1,
      revised: 1,
      priceChanged: 0,
      totalAffected: 3,
      uncomputable: 0,
    });
    const byCode = new Map(preview.items.changed.map((i) => [i.code, i]));
    const a = byCode.get('1.1.1.1')!;
    expect(a.changeKind).toBe('REVISED');
    expect(a.oldUnitPrice).toBe(715816);
    expect(a.newUnitPrice).toBe(725816);
    expect(a.delta).toBe(10000);
    expect(a.percentChange).toBe(1.4);
    expect(a.componentChangeCount).toBe(1); // only the coefficient (totalLabor is not a component ref)
    const d = byCode.get('1.1.1.99')!;
    expect(d.changeKind).toBe('ADDED');
    expect(d.oldUnitPrice).toBeNull();
    expect(d.newUnitPrice).toBe(343854);
    expect(d.delta).toBeNull();
    const c = byCode.get('1.1.1.3')!;
    expect(c.changeKind).toBe('REMOVED');
    expect(c.oldUnitPrice).toBe(343854);
    expect(c.newUnitPrice).toBeNull();

    // Components: A's 1 revised ref + D's 12 added + C's 12 removed = 25.
    expect(preview.components.summary.affectedReferenceCount).toBe(25);

    // Projects: LIVE A/B reprices +100.000; the C project is NOT_COMPUTABLE.
    const byProject = new Map(preview.projects.projects.map((p) => [p.projectId, p]));
    const live = byProject.get('FIXTURE-P-LIVE')!;
    expect(live.status).toBe('AFFECTED');
    expect(live.oldGrandTotal).toBe(8313664);
    expect(live.newGrandTotal).toBe(8413664);
    expect(live.deltaGrandTotal).toBe(100000);
    const removed = byProject.get('FIXTURE-P-REMOVED')!;
    expect(removed.status).toBe('NOT_COMPUTABLE');
    expect(removed.newGrandTotal).toBeNull();
    expect(removed.deltaGrandTotal).toBeNull();
    expect(removed.uncomputableItemCount).toBe(1);
    expect(removed.uncomputableReasons.join(' ')).toMatch(/removed/i);
    // The aggregate is null — never a partial sum presented as complete.
    expect(preview.aggregates.totalDeltaGrandTotal).toBeNull();
    expect(preview.projects.summary.notComputableProjectCount).toBe(1);

    // Fingerprint.
    expect(preview.fingerprint.family).toBe('CIPTA_KARYA');
    expect(preview.fingerprint.sourceVersionId).toBe('2026.1');
    expect(preview.fingerprint.targetVersionId).toBe('2026.2');
    expect(preview.fingerprint.baseContentChecksum).toBe(computeAhspContentChecksum(smallCatalog()));
    expect(preview.fingerprint.newContentChecksum).toBe(computeAhspContentChecksum(versionTargetItems()));
    expect(preview.fingerprint.activeVersionIdAtCompute).toBe('2026.1');
  });

  it('rollback: the deltas run in the opposite direction, exactly negated', () => {
    const forward = computeAhspVersionImpact(versionInput([liveProjectAB()]));
    expect(forward.status).toBe('COMPUTED');
    const forwardA = forward.items.changed.find((i) => i.code === '1.1.1.1')!;
    const forwardProject = forward.projects.projects[0];
    expect(forwardA.delta).toBe(10000);
    expect(forwardProject.deltaGrandTotal).toBe(100000);

    // Rollback: source = the 2026.2 content, target = the 2026.1 content.
    // The project is priced UNDER 2026.2 (it adopted the new version).
    const sourceItems = versionTargetItems();
    const targetItems = smallCatalog();
    const diff = compareAhspSnapshots(
      { versionId: '2026.2', items: sourceItems },
      { versionId: '2026.3', items: targetItems },
      'CIPTA_KARYA',
    );
    const rollbackProject = makeProject({
      projectId: 'FIXTURE-P-LIVE',
      pricingMode: 'LIVE_MASTER_PRICE',
      items: [
        makeRabItem({
          id: 'FIXTURE-RAB-A',
          code: '1.1.1.1',
          ahspCode: '1.1.1.1',
          description: 'Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter',
          volume: 10,
          unit: 'm',
          unitPrice: 725816,
          amount: 7258160,
        }),
        makeRabItem({
          id: 'FIXTURE-RAB-B',
          no: 2,
          code: '1.1.1.2',
          ahspCode: '1.1.1.2',
          description: 'Pembuatan 1 m’ pagar sementara dari seng gelombang',
          volume: 2,
          unit: 'm',
          unitPrice: 577752,
          amount: 1155504,
        }),
      ],
    });
    const rollback = computeAhspVersionImpact({
      kind: 'ROLLBACK',
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.2',
      targetVersionId: '2026.3',
      sourceItems,
      targetItems,
      diff,
      sourceContentChecksum: computeAhspContentChecksum(sourceItems),
      targetContentChecksum: computeAhspContentChecksum(targetItems),
      activeVersionIdAtCompute: '2026.2',
      projects: [rollbackProject],
      computedAt: T0,
    });
    expect(rollback.status).toBe('COMPUTED');
    expect(rollback.kind).toBe('ROLLBACK');
    const rollbackA = rollback.items.changed.find((i) => i.code === '1.1.1.1')!;
    expect(rollbackA.delta).toBe(-10000);
    expect(rollbackA.delta).toBe(-forwardA.delta!);
    const rollbackProj = rollback.projects.projects[0];
    expect(rollbackProj.deltaGrandTotal).toBe(-100000);
    expect(rollbackProj.deltaGrandTotal).toBe(-forwardProject.deltaGrandTotal!);
  });

  it('checksum mismatch → NOT_COMPUTED (the supplied content is not the checksummed content)', () => {
    const input = versionInput([]);
    const preview = computeAhspVersionImpact({
      ...input,
      targetContentChecksum: '0000000000000000',
    });
    expect(preview.status).toBe('NOT_COMPUTED');
    expect(preview.notComputedReasons.join(' ')).toMatch(/checksum/i);
  });

  it('diff describing a different pair → NOT_COMPUTED', () => {
    const input = versionInput([]);
    const wrongDiff = compareAhspSnapshots(
      { versionId: '2026.1', items: input.sourceItems },
      { versionId: '2026.1', items: input.sourceItems },
      'CIPTA_KARYA',
    );
    const preview = computeAhspVersionImpact({ ...input, diff: wrongDiff });
    expect(preview.status).toBe('NOT_COMPUTED');
  });

  it('BECAME_UNPRICED: a version that empties the composition drops the item from the total', () => {
    const sourceItems = [realItem('1.1.1.1')];
    const emptied = clone(sourceItems[0]);
    emptied.laborComponents = [];
    emptied.materialComponents = [];
    emptied.equipmentComponents = [];
    emptied.totalLabor = null;
    emptied.totalMaterial = null;
    emptied.totalEquipment = null;
    emptied.unitPrice = null;
    const targetItems = [emptied];
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: sourceItems },
      { versionId: '2026.2', items: targetItems },
      'CIPTA_KARYA',
    );
    const project = makeProject({
      projectId: 'FIXTURE-P-UNPRICED',
      pricingMode: 'LIVE_MASTER_PRICE',
      items: [
        makeRabItem({
          id: 'FIXTURE-RAB-A',
          code: '1.1.1.1',
          ahspCode: '1.1.1.1',
          description: 'Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter',
          volume: 2,
          unit: 'm',
          unitPrice: 715816,
          amount: 1431632,
        }),
      ],
    });
    const preview = computeAhspVersionImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      sourceItems,
      targetItems,
      diff,
      sourceContentChecksum: computeAhspContentChecksum(sourceItems),
      targetContentChecksum: computeAhspContentChecksum(targetItems),
      activeVersionIdAtCompute: '2026.1',
      projects: [project],
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    const [impact] = preview.projects.projects;
    expect(impact.status).toBe('AFFECTED');
    expect(impact.oldGrandTotal).toBe(1431632);
    expect(impact.newGrandTotal).toBe(0);
    expect(impact.deltaGrandTotal).toBe(-1431632);
    expect(preview.aggregates.becameUnpricedItemCount).toBe(1);
    const [itemImpact] = impact.items;
    expect(itemImpact.status).toBe('BECAME_UNPRICED');
    expect(itemImpact.newUnitPrice).toBeNull();
    expect(itemImpact.deltaAmount).toBe(-1431632);
  });
});

// ---------------------------------------------------------------------------
// §9 (d): stale previews are refused
// ---------------------------------------------------------------------------

describe('§9 (d) stale preview validation', () => {
  function versionPreview(): MasterPriceImpactPreview {
    const sourceItems = smallCatalog();
    const targetItems = versionTargetItems();
    return computeAhspVersionImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      sourceItems,
      targetItems,
      diff: compareAhspSnapshots(
        { versionId: '2026.1', items: sourceItems },
        { versionId: '2026.2', items: targetItems },
        'CIPTA_KARYA',
      ),
      sourceContentChecksum: computeAhspContentChecksum(sourceItems),
      targetContentChecksum: computeAhspContentChecksum(targetItems),
      activeVersionIdAtCompute: '2026.1',
      projects: [liveProjectAB()],
      computedAt: T0,
    });
  }

  function masterPricePreview(): MasterPriceImpactPreview {
    return computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    });
  }

  it('a concurrent publish (pointer moved) makes the version preview stale', () => {
    const preview = versionPreview();
    const validation = validateImpactPreviewFreshness(preview, {
      activeVersions: {
        CIPTA_KARYA: '2026.2',
        BINA_MARGA: '2026.1',
        SUMBER_DAYA_AIR: '2026.1',
        SMKK: '2026.1',
      },
      versionChecksums: {
        'CIPTA_KARYA|2026.1': computeAhspContentChecksum(smallCatalog()),
      },
      masterPriceVersion: MASTER_PRICE_VERSION,
      projectsFingerprint: preview.fingerprint.projectsFingerprint,
    });
    expect(validation.fresh).toBe(false);
    expect(validation.reasons.join(' ')).toMatch(/moved 2026\.1 → 2026\.2/);
  });

  it('a matching current state validates fresh with no skipped checks', () => {
    const preview = versionPreview();
    const validation = validateImpactPreviewFreshness(preview, {
      activeVersions: {
        CIPTA_KARYA: '2026.1',
        BINA_MARGA: '2026.1',
        SUMBER_DAYA_AIR: '2026.1',
        SMKK: '2026.1',
      },
      versionChecksums: {
        'CIPTA_KARYA|2026.1': computeAhspContentChecksum(smallCatalog()),
      },
      masterPriceVersion: MASTER_PRICE_VERSION,
      projectsFingerprint: preview.fingerprint.projectsFingerprint,
    });
    expect(validation.fresh).toBe(true);
    expect(validation.reasons).toEqual([]);
    expect(validation.checksSkipped).toEqual([]);
  });

  it('a moved baseline price makes the master-price preview stale', () => {
    const preview = masterPricePreview();
    expect(preview.status).toBe('COMPUTED');
    // The live baseline is still Rp100.000 — fresh.
    const fresh = validateImpactPreviewFreshness(preview, {
      masterPriceVersion: MASTER_PRICE_VERSION,
      catalogChecksum: preview.fingerprint.baseContentChecksum,
      currentBaselinePrices: resolveCurrentBaselinePrices(preview),
      projectsFingerprint: preview.fingerprint.projectsFingerprint,
    });
    expect(fresh.fresh).toBe(true);
    // If the baseline had moved to Rp105.000, the preview is stale.
    const stale = validateImpactPreviewFreshness(preview, {
      masterPriceVersion: MASTER_PRICE_VERSION,
      catalogChecksum: preview.fingerprint.baseContentChecksum,
      currentBaselinePrices: new Map([['L01|OH', 105000]]),
      projectsFingerprint: preview.fingerprint.projectsFingerprint,
    });
    expect(stale.fresh).toBe(false);
    expect(stale.reasons.join(' ')).toMatch(/baseline price for L01\|OH moved/);
  });

  it('changed project inputs make the preview stale', () => {
    const preview = masterPricePreview();
    const validation = validateImpactPreviewFreshness(preview, {
      masterPriceVersion: MASTER_PRICE_VERSION,
      catalogChecksum: preview.fingerprint.baseContentChecksum,
      currentBaselinePrices: resolveCurrentBaselinePrices(preview),
      projectsFingerprint: computeProjectsFingerprint([]),
    });
    expect(validation.fresh).toBe(false);
    expect(validation.reasons.join(' ')).toMatch(/project inputs changed/);
  });

  it('checks without current-state data are SKIPPED and named — never silently passed', () => {
    const preview = masterPricePreview();
    const validation = validateImpactPreviewFreshness(preview, {});
    expect(validation.fresh).toBe(true); // nothing contradicts the preview
    expect(validation.checksSkipped.length).toBeGreaterThan(0);
    expect(validation.checksSkipped.join(' ')).toMatch(/baseline prices/);
    expect(validation.checksSkipped.join(' ')).toMatch(/project inputs/);
  });

  it('a tampered FINGERPRINT fails the hash check (the hash covers state, not computed numbers)', () => {
    const preview = masterPricePreview();
    const tampered = clone(preview);
    // Forging the fingerprint's base checksum (e.g. to make a stale preview look fresh).
    tampered.fingerprint.baseContentChecksum = '0000000000000000';
    const validation = validateImpactPreviewFreshness(tampered, {
      masterPriceVersion: MASTER_PRICE_VERSION,
      catalogChecksum: preview.fingerprint.baseContentChecksum,
      currentBaselinePrices: resolveCurrentBaselinePrices(preview),
      projectsFingerprint: preview.fingerprint.projectsFingerprint,
    });
    expect(validation.fresh).toBe(false);
    expect(validation.reasons.join(' ')).toMatch(/fingerprint hash mismatch/);
  });

  it('markPreviewStale returns a STALE copy and never mutates the input', () => {
    const preview = masterPricePreview();
    const before = JSON.stringify(preview);
    const stale = markPreviewStale(preview, ['a publish happened after the preview was computed']);
    expect(stale.status).toBe('STALE');
    expect(stale.staleReasons).toEqual(['a publish happened after the preview was computed']);
    expect(stale.note).toMatch(/STALE/);
    expect(preview.status).toBe('COMPUTED');
    expect(JSON.stringify(preview)).toBe(before);
    const validation = validateImpactPreviewFreshness(stale, {});
    expect(validation.fresh).toBe(false);
    expect(validation.reasons[0]).toMatch(/already marked STALE/);
  });

  it('a NOT_COMPUTED preview never validates fresh', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [{ ...l01Change(), newPrice: null }],
      catalogItems: smallCatalog(),
      projects: [],
      computedAt: T0,
    });
    expect(validateImpactPreviewFreshness(preview, {}).fresh).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §9 (a): Mode A integration — the confirm flow uses the real provider
// ---------------------------------------------------------------------------

describe('§9 (a) Mode A integration (ahspVersioning + real provider)', () => {
  function fixtureRecord(
    family: AhspFamily,
    versionId: string,
    checksum: string,
    status: AhspVersionRecord['status'] = 'ACTIVE',
  ): AhspVersionRecord {
    return {
      family,
      versionId,
      status,
      createdFrom: versionId === '2026.1' ? null : '2026.1',
      createdBy: null,
      createdAt: T0,
      reason: REASON,
      contentChecksum: checksum,
      contentProvenance: 'CANONICAL_BASELINE',
      snapshotPath: snapshotPathFor(family, versionId),
      itemCount: 3,
      publishedAt: status === 'ACTIVE' ? T0 : null,
      publishedBy: null,
    };
  }

  /** Registry state whose CK record carries the REAL checksum of [A,B,C]. */
  function fixtureState(): AhspVersionRegistryState {
    return buildRegistryState([
      fixtureRecord('CIPTA_KARYA', '2026.1', computeAhspContentChecksum(smallCatalog())),
      fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
      fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
      fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
    ]);
  }

  it('assess → confirm → apply runs end to end with the real provider', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = assessDirectEditImpact(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      sourceItems: smallCatalog(),
      targetVersionId: '2026.2',
      newItems: versionTargetItems(),
      projects: [liveProjectAB()],
      now: T0,
    });
    expect(impact.status).toBe('COMPUTED');
    expect(impact.affectedAhspCodes).toContain('1.1.1.1');
    expect(impact.affectedLiveProjects).toEqual(['FIXTURE-P-LIVE']);
    expect(impact.fingerprint).toBeDefined();
    expect(impact.preview).toBeDefined();
    expect(impact.preview!.projects.projects[0].deltaGrandTotal).toBe(100000);

    const confirmation = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T1 });
    expect(confirmation.impact.status).toBe('COMPUTED');

    const { state: next, record } = applyDirectEdit(state, {
      confirmation,
      newVersionId: '2026.2',
      newItems: versionTargetItems(),
      contentProvenance: 'PIPELINE_REGENERATED',
      diffSummary: { added: 1, removed: 1, revised: 1, unchanged: 1 },
      now: T3,
    });
    expect(record.versionId).toBe('2026.2');
    expect(record.status).toBe('ACTIVE');
    expect(getActiveVersion(next, 'CIPTA_KARYA')).toBe('2026.2');
  });

  it('confirm with a STALE impact is refused', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = assessDirectEditImpact(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      sourceItems: smallCatalog(),
      targetVersionId: '2026.2',
      newItems: versionTargetItems(),
      projects: [],
      now: T0,
    });
    const stale = { ...impact, status: 'STALE' as const, note: `${impact.note} STALE — do not use.` };
    expect(() =>
      confirmDirectEdit(state, { checkpoint, impact: stale, reason: REASON, now: T1 }),
    ).toThrow(/STALE/);
  });

  it('a concurrent publish makes the fingerprinted preview stale at confirm', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = assessDirectEditImpact(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      sourceItems: smallCatalog(),
      targetVersionId: '2026.2',
      newItems: versionTargetItems(),
      projects: [],
      now: T0,
    });
    // Editor A applies first — the pointer moves.
    const confA = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T1 });
    const { state: moved } = applyDirectEdit(state, {
      confirmation: confA,
      newVersionId: '2026.2',
      newItems: versionTargetItems(),
      contentProvenance: 'PIPELINE_REGENERATED',
      now: T3,
    });
    // Editor B's confirm against the moved state is refused (stale preview + stale checkpoint).
    const checkpointB = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    expect(() =>
      confirmDirectEdit(moved, { checkpoint: checkpointB, impact, reason: REASON, now: T3 }),
    ).toThrow(/Stale/);
  });

  it('apply with content different from the preview is refused (regeneration after preview)', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = assessDirectEditImpact(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      sourceItems: smallCatalog(),
      targetVersionId: '2026.2',
      newItems: versionTargetItems(),
      projects: [],
      now: T0,
    });
    const confirmation = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T1 });
    // Applying the SOURCE content (not the previewed target) must fail.
    expect(() =>
      applyDirectEdit(state, {
        confirmation,
        newVersionId: '2026.2',
        newItems: smallCatalog(),
        contentProvenance: 'PIPELINE_REGENERATED',
        now: T3,
      }),
    ).toThrow(/Stale impact preview/);
  });

  it('a NOT_COMPUTED impact (no fingerprint) is still accepted at confirm (§8 contract)', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = notComputedImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 1, removed: 1, revised: 1, unchanged: 1 },
    });
    expect(impact.fingerprint).toBeUndefined();
    const confirmation = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T1 });
    expect(confirmation.impact.status).toBe('NOT_COMPUTED');
  });

  it('assessRollbackImpact computes the rollback preview with kind ROLLBACK', () => {
    const state = fixtureState();
    const impact = assessRollbackImpact(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.2',
      sourceItems: versionTargetItems(),
      targetVersionId: '2026.3',
      newItems: smallCatalog(),
      projects: [],
      now: T0,
    });
    expect(impact.status).toBe('COMPUTED');
    expect(impact.fingerprint!.kind).toBe('ROLLBACK');
    expect(impact.preview!.kind).toBe('ROLLBACK');
    const a = impact.preview!.items.changed.find((i) => i.code === '1.1.1.1')!;
    expect(a.delta).toBe(-10000);
  });
});

// ---------------------------------------------------------------------------
// §9 purity: the calculator changes nothing
// ---------------------------------------------------------------------------

describe('§9 purity (read-only calculator)', () => {
  it('deep-frozen inputs never throw, and unfrozen inputs are byte-identical after compute', () => {
    const changes = [l01Change(), l02Change()];
    const catalog = smallCatalog();
    const projects = [liveProjectAB()];
    const before = JSON.stringify({ changes, catalog, projects });
    // Frozen inputs: any mutation attempt throws in strict mode.
    deepFreeze(changes);
    deepFreeze(catalog);
    deepFreeze(projects);
    const preview = computeMasterPriceImpact({
      priceChanges: changes,
      catalogItems: catalog,
      projects,
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    expect(JSON.stringify({ changes, catalog, projects })).toBe(before);

    // Unfrozen inputs: same guarantee via before/after comparison.
    const changes2 = [l01Change()];
    const catalog2 = smallCatalog();
    const projects2 = [liveProjectAB()];
    const before2 = JSON.stringify({ changes2, catalog2, projects2 });
    computeMasterPriceImpact({ priceChanges: changes2, catalogItems: catalog2, projects: projects2, computedAt: T0 });
    expect(JSON.stringify({ changes2, catalog2, projects2 })).toBe(before2);
  });

  it('the resolver cache version is untouched (the calculator bypasses the cache, never invalidates it)', () => {
    const before = priceResolver2026.getCacheVersion();
    computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    });
    const sourceItems = smallCatalog();
    const targetItems = versionTargetItems();
    computeAhspVersionImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      sourceItems,
      targetItems,
      diff: compareAhspSnapshots(
        { versionId: '2026.1', items: sourceItems },
        { versionId: '2026.2', items: targetItems },
        'CIPTA_KARYA',
      ),
      sourceContentChecksum: computeAhspContentChecksum(sourceItems),
      targetContentChecksum: computeAhspContentChecksum(targetItems),
      activeVersionIdAtCompute: '2026.1',
      projects: [liveProjectAB()],
      computedAt: T0,
    });
    expect(priceResolver2026.getCacheVersion()).toBe(before);
  });

  it('the runtime catalog is never mutated by a full-catalog preview', () => {
    const item = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.code === '1.1.1.1')!;
    const before = JSON.stringify(item);
    computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: ALL_OFFICIAL_AHSP_ITEMS,
      projects: [],
      computedAt: T0,
    });
    expect(JSON.stringify(item)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Workspace collector (reads only — fake storage)
// ---------------------------------------------------------------------------

describe('workspaceProjectCollector', () => {
  function fakeReader(entries: Record<string, string>) {
    return { getItem: (key: string) => entries[key] ?? null };
  }

  function envelope(data: unknown) {
    return JSON.stringify({ v: 1, savedAt: T0, writeId: 'w1', data });
  }

  it('collects projects, modes, items, overrides, and cost config from fake storage', () => {
    const projects = [
      {
        id: 'P-LIVE',
        name: 'Live project',
        status: 'ACTIVE',
        pricingMode: 'LIVE_MASTER_PRICE',
        overheadPercent: 5,
        costSummary: { overheadPercent: 10, profitPercent: 3 },
      },
      {
        id: 'P-SNAP',
        name: 'Snapshot project',
        status: 'ACTIVE',
        activeEstimateVersionId: 'EV-1',
      },
      { id: 'P-DEMO', name: 'Demo project', status: 'ACTIVE', isDemo: true },
      { id: 'P-OVR', name: 'Override project', status: 'ACTIVE', pricingMode: 'PROJECT_OVERRIDE' },
    ];
    const rabItems = [
      { ...makeRabItem({ id: 'R1', ahspCode: '1.1.1.1' }), projectId: 'P-LIVE' },
      { ...makeRabItem({ id: 'R2', no: 2, ahspCode: '1.1.1.2' }), projectId: 'P-LIVE' },
      { ...makeRabItem({ id: 'R3', ahspCode: '1.1.1.3' }), projectId: 'P-SNAP' },
    ];
    const overrides = [
      {
        id: 'OVR-1',
        projectId: 'P-OVR',
        resourceCode: 'L.01',
        resourceName: 'Pekerja',
        category: 'LABOR',
        unit: 'OH',
        masterPrice: 100000,
        projectPrice: 90000,
        isOverridden: true,
        lastUpdated: T0,
      },
    ];
    const versions = [
      {
        id: 'EV-1',
        projectId: 'P-SNAP',
        versionNumber: 'v1',
        label: 'Baseline',
        timestamp: T0,
        author: 'fixture',
        description: 'fixture',
        costBefore: 0,
        costAfter: 0,
        difference: 0,
        percentageDiff: 0,
        rabItemsSnapshot: [],
        itemsCount: 0,
        pricingMode: 'SNAPSHOT_PRICE',
        ahspDatabaseVersion: '2026.1',
        masterPriceVersion: '2026.1',
      },
    ];
    const { projects: collected, warnings } = collectWorkspaceProjects(
      fakeReader({
        ezrab_prod_projects: envelope(projects),
        ezrab_prod_rab_items: JSON.stringify(rabItems),
        ezrab_prod_price_overrides: JSON.stringify(overrides),
        ezrab_prod_estimate_versions: JSON.stringify(versions),
      }),
    );
    expect(warnings).toEqual([]);
    expect(collected.map((p) => p.projectId)).toEqual(['P-DEMO', 'P-LIVE', 'P-OVR', 'P-SNAP']);
    const byId = new Map(collected.map((p) => [p.projectId, p]));
    // Mode: recorded on the project wins.
    expect(byId.get('P-LIVE')!.pricingMode).toBe('LIVE_MASTER_PRICE');
    // Mode: falls back to the active estimate version.
    expect(byId.get('P-SNAP')!.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(byId.get('P-SNAP')!.pinnedAhspDatabaseVersion).toBe('2026.1');
    expect(byId.get('P-SNAP')!.pinnedMasterPriceVersion).toBe('2026.1');
    // Mode: absent everywhere stays null (SNAPSHOT downstream — the collector never assigns LIVE).
    expect(byId.get('P-DEMO')!.pricingMode).toBeNull();
    expect(byId.get('P-DEMO')!.isDemo).toBe(true);
    expect(byId.get('P-OVR')!.pricingMode).toBe('PROJECT_OVERRIDE');
    // Items + overrides attached by projectId.
    expect(byId.get('P-LIVE')!.items).toHaveLength(2);
    expect(byId.get('P-SNAP')!.items).toHaveLength(1);
    expect(byId.get('P-OVR')!.overrides).toHaveLength(1);
    // Cost config mirrors ProjectContext: the TOP-LEVEL overheadPercent (5) wins over costSummary (10).
    expect(byId.get('P-LIVE')!.costSummary.overheadPercent).toBe(5);
    expect(byId.get('P-LIVE')!.costSummary.profitPercent).toBe(3);
  });

  it('an invalid recorded mode warns and is treated as absent', () => {
    const { projects: collected, warnings } = collectWorkspaceProjects(
      fakeReader({
        ezrab_prod_projects: envelope([
          { id: 'P-BAD', name: 'Bad mode', status: 'ACTIVE', pricingMode: 'LIVE' },
        ]),
        ezrab_prod_rab_items: JSON.stringify([]),
        ezrab_prod_price_overrides: JSON.stringify([]),
        ezrab_prod_estimate_versions: JSON.stringify([]),
      }),
    );
    expect(collected).toHaveLength(1);
    expect(collected[0].pricingMode).toBeNull();
    expect(warnings.join(' ')).toMatch(/invalid pricingMode/);
  });

  it('a corrupt key is skipped with a warning — no data invented', () => {
    const { projects: collected, warnings } = collectWorkspaceProjects(
      fakeReader({ ezrab_prod_projects: '{not json' }),
    );
    expect(collected).toEqual([]);
    expect(warnings.join(' ')).toMatch(/ezrab_prod_projects.*corrupt/);
  });

  it('empty storage collects honestly: 0 projects, no warnings', () => {
    const { projects: collected, warnings } = collectWorkspaceProjects(fakeReader({}));
    expect(collected).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §9 (g): full-catalog performance (measured, reported — no sampling)
// ---------------------------------------------------------------------------

describe('§9 (g) full-catalog performance', () => {
  it('L03|jam (1.012 refs, the biggest fan-out) over the full catalog completes in reasonable time', () => {
    const change: MasterPriceChangeInput = {
      resourceCode: 'L03',
      resourceName: 'Mandor',
      category: 'LABOR',
      unit: 'jam',
      oldPrice: 33312.62,
      newPrice: 34000,
    };
    const tIndex0 = Date.now();
    const index = buildResourceComponentIndex(ALL_OFFICIAL_AHSP_ITEMS);
    const indexMs = Date.now() - tIndex0;
    expect(index.byKey.get('L03|jam')).toHaveLength(1012);

    const t0 = Date.now();
    const preview = computeMasterPriceImpact({
      priceChanges: [change],
      catalogItems: ALL_OFFICIAL_AHSP_ITEMS,
      projects: [],
      computedAt: T0,
    });
    const computeMs = Date.now() - t0;
    // Reported (not asserted tight — the number is the deliverable).
    // eslint-disable-next-line no-console
    console.log(
      `[§9 perf] full catalog (5.742 items / 30.265 components): index ${indexMs} ms, ` +
        `L03|jam impact ${computeMs} ms, ` +
        `${preview.items.summary.totalAffected} items affected, ` +
        `${preview.components.summary.affectedReferenceCount} refs`,
    );
    expect(preview.status).toBe('COMPUTED');
    expect(preview.components.summary.affectedReferenceCount).toBe(1012);
    expect(preview.items.summary.totalAffected).toBeGreaterThan(0);
    expect(preview.components.summary.codelessComponentCount).toBe(18899);
    expect(computeMs).toBeLessThan(60_000);

    // Deterministic counts on a second run.
    const second = computeMasterPriceImpact({
      priceChanges: [change],
      catalogItems: ALL_OFFICIAL_AHSP_ITEMS,
      projects: [],
      computedAt: T0,
    });
    expect(second.items.summary).toEqual(preview.items.summary);
    expect(second.components.summary.affectedReferenceCount).toBe(
      preview.components.summary.affectedReferenceCount,
    );
  }, 120_000);
});

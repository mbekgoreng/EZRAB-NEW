/**
 * MASTER PRICING §10 — PROJECT PRICE MODES (D5 design).
 *
 * Tests the mode layer: the pricing mode on a project record, versioned
 * snapshot resolution (SNAPSHOT resolves from its PIN, not the pointer),
 * explicit adoption (preview → reason → NEW estimate version → pin
 * moves), the cache rule (§9 Keputusan 7: explicit context, never the
 * code-keyed default cache), OVERRIDE composition, financial defaults,
 * and read-only legacy compatibility.
 *
 * Fixtures mirror the §9 suite (same live-catalog items, same computed
 * numbers — they are the §9 calibration, re-used, not re-invented):
 *  - 1.1.1.1 "Pagar kayu" (CK): FULL composition Rp715.816 = L.01 Pekerja
 *    OH ×0,6 @100.000 + L.02 Tukang OH ×0,2 + ×0,2 @145.000 + material +
 *    equipment. 1.1.1.2 Rp577.752, 1.1.1.3 Rp343.854 (all codeless).
 *  - Version target 2026.2: A's L.01 coefficient 0,6 → 0,7 (composition
 *    Rp725.816, +Rp10.000/unit); B unchanged; C REMOVED; D (1.1.1.99)
 *    added.
 *  - Master-price change: L.01 OH 100.000 → 110.000 (+Rp6.000/unit on A).
 *  - Project AB (A vol 10 + B vol 2): old Rp8.313.664.
 *    Version adoption: +Rp100.000 → Rp8.413.664.
 *    Price adoption (L.01): +Rp60.000 → Rp8.373.664.
 *    OVERRIDE project (A stored Rp709.816, L.01 covered @90.000):
 *    old Rp8.253.664; version adoption +Rp90.000 → Rp8.343.664.
 *
 * Price integrity: fixture prices are the LIVE catalog's own prices
 * (or §9's labelled override @90.000 / a labelled synthetic snapshot
 * price @111.000, used only to prove which map wins). No price is
 * invented as a real price; every expected total is computed by hand
 * from the compositions above and asserted exactly.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import {
  AHSP_BASELINE_VERSION_ID,
  buildRegistryState,
  compareAhspSnapshots,
  computeAhspContentChecksum,
  getSnapshotAhspVersion,
  snapshotPathFor,
  type AhspFamily,
  type AhspVersionRecord,
  type AhspVersionRegistryState,
} from '../data/nationalCostDatabase/ahspVersioning';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';
import { DEFAULT_NEW_PROJECT_PRICING_MODE } from '../data/priceDatabase2026/types';
import { getActiveVersion } from '../data/nationalCostDatabase/ahspVersioning';
import { buildBaselineVersion, createRevision } from '../engine/estimateVersioning';
import { recalculateCostSummary } from '../engine/unifiedProjectEngine';
import { buildComponentPriceRef } from '../data/priceDatabase2026/centralResolution';
import {
  computeProjectsFingerprint,
  priceChangeKey,
  type CurrentImpactState,
  type ProjectImpactInput,
} from '../engine/pricing/impact/masterPriceImpactPreview';
import { ProjectPriceEngine } from '../engine/pricing/projectPriceEngine';
import {
  ADOPTION_REASON_MIN_LENGTH,
  approveAdoption,
  assertValidProjectPricingMode,
  buildOverrideRefForProject,
  buildOverrideRefFromEngineOverrides,
  buildOverrideRefFromProjectOverrides,
  buildProjectPricingContext,
  buildSnapshotPriceRef,
  createVersionedCatalogSource,
  defaultNewProjectPricingMode,
  defaultSnapshotPricingMode,
  effectiveProjectPricingState,
  mergeSnapshotAndOverrideRefs,
  previewAdoption,
  resolveEffectiveProjectPricingMode,
  resolveVersionedAhspItem,
  resolveVersionedAhspUnitPrice,
  setProjectPricingMode,
} from '../engine/pricing/projectPriceModes';
import { isValidProjectPricingMode, PROJECT_PRICING_MODES } from '../data/priceDatabase2026/types';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import type {
  AHSPProjectSnapshot,
  Project,
  ProjectCostSummary,
  ProjectPriceOverride,
  RabItem,
} from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = '2026-11-16T00:00:00.000Z';
const T1 = '2026-11-16T00:00:01.000Z';
const T2 = '2026-11-16T00:00:02.000Z';
const REASON = 'Adopsi harga AHSP 2026.2';

function realItem(code: string): NationalAHSPItem {
  const found = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.code === code);
  if (!found) throw new Error(`Fixture item ${code} not in live catalog`);
  return JSON.parse(JSON.stringify(found)) as NationalAHSPItem;
}

/** The §9 small catalog: A (1.1.1.1) + B (1.1.1.2) + C (1.1.1.3), CK. */
function smallCatalog(): NationalAHSPItem[] {
  return [realItem('1.1.1.1'), realItem('1.1.1.2'), realItem('1.1.1.3')];
}

/**
 * The §9 version target, mirrored EXACTLY (same ids, same baked
 * totals): A' with L.01 coefficient 0,6 → 0,7 (component total
 * 70.000, totalLabor 137.600, baked unitPrice 725.816), B unchanged,
 * C removed, D (1.1.1.99, cloned from C) added. A's id is NOT
 * changed — the diff matches by id, so A is REVISED, not
 * removed+added.
 */
function versionTargetItems(): NationalAHSPItem[] {
  const [a, b, c] = smallCatalog();
  const aPrime = JSON.parse(JSON.stringify(a)) as NationalAHSPItem;
  aPrime.laborComponents[0].coefficient = 0.7;
  aPrime.laborComponents[0].total = 70000;
  aPrime.totalLabor = 137600;
  aPrime.unitPrice = 725816;
  const d = JSON.parse(JSON.stringify(c)) as NationalAHSPItem;
  d.id = 'AHSP-FIXTURE-D';
  d.code = '1.1.1.99';
  d.codeNormalized = '111199';
  d.name = 'Fixture added item (not a real AHSP item)';
  return [aPrime, b, d];
}

function makeRabItem(partial: Partial<RabItem> & { id: string }): RabItem {
  return {
    id: partial.id,
    no: partial.no ?? 1,
    code: partial.code ?? '1.1.1.1',
    ahspCode: partial.ahspCode ?? '1.1.1.1',
    description: partial.description ?? 'Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter',
    volume: partial.volume ?? 10,
    unit: partial.unit ?? 'm',
    unitPrice: partial.unitPrice ?? 715816,
    amount: partial.amount ?? 7158160,
    category: partial.category ?? 'PEKERJAAN_PERSIAPAN',
    ...partial,
  };
}

/** A zeroed cost summary — the §10 (f) financial defaults (0% / 0%). */
function zeroCostSummary(): ProjectCostSummary {
  return {
    directCost: 0,
    overheadAmount: 0,
    overheadPercent: 0,
    subtotalBeforeProfit: 0,
    profitAmount: 0,
    profitPercent: 0,
    subtotalBeforeTax: 0,
    taxAmount: 0,
    grandTotal: 0,
  };
}

function makeProjectRecord(partial: Partial<Project> = {}): Project {
  return {
    id: partial.id ?? 'FIXTURE-P-SNAP',
    name: partial.name ?? 'Fixture Project (SNAPSHOT)',
    location: partial.location ?? '',
    status: partial.status ?? 'draft',
    sections: partial.sections ?? [],
    costSummary: partial.costSummary ?? zeroCostSummary(),
    createdAt: partial.createdAt ?? T0,
    updatedAt: partial.updatedAt ?? T0,
    ...partial,
  };
}

function makeProjectInput(partial: Partial<ProjectImpactInput> & { projectId: string }): ProjectImpactInput {
  return {
    projectId: partial.projectId,
    projectName: partial.projectName ?? 'Fixture Project',
    isDemo: partial.isDemo ?? false,
    pricingMode: partial.pricingMode ?? 'SNAPSHOT_PRICE',
    pinnedAhspDatabaseVersion: partial.pinnedAhspDatabaseVersion ?? '2026.1',
    pinnedMasterPriceVersion: partial.pinnedMasterPriceVersion ?? '2026.1',
    items: partial.items ?? [],
    costSummary: partial.costSummary ?? {},
    overrides: partial.overrides,
  };
}

/** A + B stored at catalog prices, vol 10 + 2 → old total Rp8.313.664. */
function projectABItems(): RabItem[] {
  return [
    makeRabItem({ id: 'FIXTURE-RAB-A' }),
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
  ];
}

function snapshotProjectAB(): ProjectImpactInput {
  return makeProjectInput({
    projectId: 'FIXTURE-P-SNAP',
    projectName: 'Fixture Project (SNAPSHOT)',
    pricingMode: 'SNAPSHOT_PRICE',
    pinnedAhspDatabaseVersion: '2026.1',
    pinnedMasterPriceVersion: '2026.1',
    items: projectABItems(),
  });
}

function liveProjectAB(): ProjectImpactInput {
  return makeProjectInput({
    projectId: 'FIXTURE-P-LIVE',
    projectName: 'Fixture Project (LIVE)',
    pricingMode: 'LIVE_MASTER_PRICE',
    pinnedAhspDatabaseVersion: '2026.1',
    pinnedMasterPriceVersion: '2026.1',
    items: projectABItems(),
  });
}

function overrideProjectAB(): ProjectImpactInput {
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
  return makeProjectInput({
    projectId: 'FIXTURE-P-OVR',
    projectName: 'Fixture Project (OVERRIDE)',
    pricingMode: 'PROJECT_OVERRIDE',
    pinnedAhspDatabaseVersion: '2026.1',
    pinnedMasterPriceVersion: '2026.1',
    overrides: [override],
    items: [
      // Stored prices already reflect the override: A = 709.816.
      makeRabItem({ id: 'FIXTURE-RAB-A', unitPrice: 709816, amount: 7098160 }),
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

function l01Change() {
  return {
    resourceCode: 'L.01',
    resourceName: 'Pekerja',
    category: 'LABOR' as const,
    unit: 'OH' as const,
    oldPrice: 100000,
    newPrice: 110000,
  };
}

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

/** Registry where CK 2026.2 is the published ACTIVE version. */
function publishedRegistry(): AhspVersionRegistryState {
  return buildRegistryState([
    fixtureRecord('CIPTA_KARYA', '2026.1', computeAhspContentChecksum(smallCatalog()), 'SUPERSEDED'),
    fixtureRecord('CIPTA_KARYA', '2026.2', computeAhspContentChecksum(versionTargetItems()), 'ACTIVE'),
    fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
    fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
    fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
  ]);
}

/** Registry where CK 2026.2 exists but is only a DRAFT (not adoptable). */
function draftRegistry(): AhspVersionRegistryState {
  return buildRegistryState([
    fixtureRecord('CIPTA_KARYA', '2026.1', computeAhspContentChecksum(smallCatalog()), 'ACTIVE'),
    fixtureRecord('CIPTA_KARYA', '2026.2', computeAhspContentChecksum(versionTargetItems()), 'DRAFT'),
    fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
    fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
    fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
  ]);
}

function activeVersions20262(): Record<AhspFamily, string> {
  return {
    CIPTA_KARYA: '2026.2',
    BINA_MARGA: '2026.1',
    SUMBER_DAYA_AIR: '2026.1',
    SMKK: '2026.1',
  };
}

function activeVersions20261(): Record<AhspFamily, string> {
  return {
    CIPTA_KARYA: '2026.1',
    BINA_MARGA: '2026.1',
    SUMBER_DAYA_AIR: '2026.1',
    SMKK: '2026.1',
  };
}

/** The version-kind change descriptor shared by the adoption tests. */
function versionChange(registry: AhspVersionRegistryState) {
  return {
    kind: 'AHSP_VERSION_CHANGE' as const,
    family: 'CIPTA_KARYA' as AhspFamily,
    sourceVersionId: '2026.1',
    targetVersionId: '2026.2',
    registry,
    sourceItems: smallCatalog(),
    targetItems: versionTargetItems(),
    diff: compareAhspSnapshots(
      { versionId: '2026.1', items: smallCatalog() },
      { versionId: '2026.2', items: versionTargetItems() },
      'CIPTA_KARYA',
    ),
    sourceContentChecksum: computeAhspContentChecksum(smallCatalog()),
    targetContentChecksum: computeAhspContentChecksum(versionTargetItems()),
  };
}

function priceChange() {
  return {
    kind: 'MASTER_PRICE_CHANGE' as const,
    targetMasterPriceVersion: '2026.2',
    priceChanges: [l01Change()],
    catalogItems: smallCatalog(),
  };
}

/**
 * The current-state fingerprint at the moment of the preview: the
 * pointer has already moved to 2026.2 (the published world), while the
 * SNAPSHOT project still pins 2026.1. Freshness is about the world not
 * moving BETWEEN preview and approval — not about the project's pin.
 * NOTE the §9 validator's key shapes: version checksums are keyed
 * `${family}|${sourceVersionId}` and compared against the BASE (source)
 * checksum; the catalog checksum is the §9 mirror of the catalog the
 * preview was computed over.
 */
function currentStateFor(projects: ProjectImpactInput[], activeVersions: Record<AhspFamily, string>): CurrentImpactState {
  const baseChecksum = computeAhspContentChecksum(smallCatalog());
  return {
    activeVersions,
    versionChecksums: { 'CIPTA_KARYA|2026.1': baseChecksum },
    masterPriceVersion: '2026.1',
    catalogChecksum: baseChecksum,
    currentBaselinePrices: new Map(),
    projectsFingerprint: computeProjectsFingerprint(projects),
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// §10 (a): mode on the project record
// ---------------------------------------------------------------------------

describe('§10 (a) mode on the project record', () => {
  it('PROJECT_PRICING_MODES is exactly the three §3/§6 vocabulary values', () => {
    expect([...PROJECT_PRICING_MODES].sort()).toEqual([
      'LIVE_MASTER_PRICE',
      'PROJECT_OVERRIDE',
      'SNAPSHOT_PRICE',
    ]);
  });

  it('isValidProjectPricingMode accepts only the three values', () => {
    expect(isValidProjectPricingMode('LIVE_MASTER_PRICE')).toBe(true);
    expect(isValidProjectPricingMode('SNAPSHOT_PRICE')).toBe(true);
    expect(isValidProjectPricingMode('PROJECT_OVERRIDE')).toBe(true);
    expect(isValidProjectPricingMode('LIVE')).toBe(false);
    expect(isValidProjectPricingMode('SNAPSHOT')).toBe(false);
    expect(isValidProjectPricingMode('')).toBe(false);
    expect(isValidProjectPricingMode(null)).toBe(false);
    expect(isValidProjectPricingMode(undefined)).toBe(false);
    expect(isValidProjectPricingMode(42)).toBe(false);
  });

  it('defaultNewProjectPricingMode is LIVE; defaultSnapshotPricingMode is SNAPSHOT', () => {
    expect(defaultNewProjectPricingMode()).toBe('LIVE_MASTER_PRICE');
    expect(defaultNewProjectPricingMode()).toBe(DEFAULT_NEW_PROJECT_PRICING_MODE);
    expect(defaultSnapshotPricingMode()).toBe('SNAPSHOT_PRICE');
  });

  it('resolveEffectiveProjectPricingMode returns a recorded mode as-is (source RECORDED)', () => {
    expect(resolveEffectiveProjectPricingMode('LIVE_MASTER_PRICE')).toEqual({
      mode: 'LIVE_MASTER_PRICE',
      source: 'RECORDED',
    });
    expect(resolveEffectiveProjectPricingMode('SNAPSHOT_PRICE')).toEqual({
      mode: 'SNAPSHOT_PRICE',
      source: 'RECORDED',
    });
    expect(resolveEffectiveProjectPricingMode('PROJECT_OVERRIDE')).toEqual({
      mode: 'PROJECT_OVERRIDE',
      source: 'RECORDED',
    });
  });

  it('resolveEffectiveProjectPricingMode reads absent mode as SNAPSHOT (Decision D)', () => {
    expect(resolveEffectiveProjectPricingMode(null)).toEqual({
      mode: 'SNAPSHOT_PRICE',
      source: 'DEFAULT_SNAPSHOT',
    });
    expect(resolveEffectiveProjectPricingMode(undefined)).toEqual({
      mode: 'SNAPSHOT_PRICE',
      source: 'DEFAULT_SNAPSHOT',
    });
  });

  it('resolveEffectiveProjectPricingMode throws on an invalid mode (fail-closed)', () => {
    expect(() => resolveEffectiveProjectPricingMode('LIVE' as never)).toThrow(/Unknown project pricing mode/);
    expect(() => resolveEffectiveProjectPricingMode('' as never)).toThrow(/Unknown project pricing mode/);
    expect(() => resolveEffectiveProjectPricingMode(42 as never)).toThrow(/Unknown project pricing mode/);
  });

  it('assertValidProjectPricingMode returns the mode or throws', () => {
    expect(assertValidProjectPricingMode('SNAPSHOT_PRICE')).toBe('SNAPSHOT_PRICE');
    expect(() => assertValidProjectPricingMode('LIVE')).toThrow(/Unknown project pricing mode/);
    expect(() => assertValidProjectPricingMode(null)).toThrow(/Unknown project pricing mode/);
  });

  it('setProjectPricingMode returns a NEW project with the mode stamped (input untouched)', () => {
    const project = makeProjectRecord({ pricingMode: undefined });
    const updated = setProjectPricingMode(project, 'PROJECT_OVERRIDE', { now: T1 });
    expect(updated.pricingMode).toBe('PROJECT_OVERRIDE');
    expect(updated.updatedAt).toBe(T1);
    expect(updated.id).toBe(project.id);
    expect(project.pricingMode).toBeUndefined();
    expect(updated).not.toBe(project);
  });

  it('setProjectPricingMode throws on an invalid mode', () => {
    expect(() => setProjectPricingMode(makeProjectRecord(), 'LIVE' as never)).toThrow(
      /Unknown project pricing mode/,
    );
  });

  it('effectiveProjectPricingState reports mode + pins + where each came from', () => {
    const state = effectiveProjectPricingState({
      pricingMode: 'LIVE_MASTER_PRICE',
      pinnedAhspDatabaseVersion: '2026.2',
      pinnedMasterPriceVersion: '2026.2',
    });
    expect(state.mode).toBe('LIVE_MASTER_PRICE');
    expect(state.modeSource).toBe('RECORDED');
    expect(state.pinnedAhspDatabaseVersion).toBe('2026.2');
    expect(state.pinSource).toBe('RECORDED');
    expect(state.pinnedMasterPriceVersion).toBe('2026.2');
    expect(state.masterPinSource).toBe('RECORDED');
  });

  it('effectiveProjectPricingState: legacy project (no mode, no pins) = SNAPSHOT + 2026.1', () => {
    const state = effectiveProjectPricingState({});
    expect(state.mode).toBe('SNAPSHOT_PRICE');
    expect(state.modeSource).toBe('DEFAULT_SNAPSHOT');
    expect(state.pinnedAhspDatabaseVersion).toBe('2026.1');
    expect(state.pinSource).toBe('LEGACY_DEFAULT');
    expect(state.pinnedMasterPriceVersion).toBe('2026.1');
    expect(state.masterPinSource).toBe('LEGACY_DEFAULT');
  });

  it('effectiveProjectPricingState never writes defaults back (read-only)', () => {
    const input: { pricingMode?: undefined; pinnedAhspDatabaseVersion?: undefined } = {};
    const before = JSON.stringify(input);
    effectiveProjectPricingState(input);
    expect(JSON.stringify(input)).toBe(before);
    expect('pricingMode' in input).toBe(false);
  });

  it('createRevision honours versionStamps (mode + pins) and validates them', () => {
    const baseline = buildBaselineVersion('FIXTURE-P-SNAP', projectABItems(), { now: T0 });
    const result = createRevision(
      [baseline],
      'FIXTURE-P-SNAP',
      projectABItems(),
      {
        label: 'Adoption test',
        description: 'Test revision with adopted pins',
        versionStamps: {
          ahspDatabaseVersion: '2026.2',
          masterPriceVersion: '2026.2',
          pricingMode: 'SNAPSHOT_PRICE',
        },
      },
      { now: T1 },
    );
    const revised = result.created;
    expect(revised.ahspDatabaseVersion).toBe('2026.2');
    expect(revised.masterPriceVersion).toBe('2026.2');
    expect(revised.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(revised.label).toContain('Adoption test');
    expect(result.versions).toHaveLength(2);
    // The baseline still pins the old versions (never rewritten).
    expect(baseline.ahspDatabaseVersion).toBe('2026.1');
    expect(baseline.masterPriceVersion).toBe('2026.1');
    expect(result.baselineCreated).toBeNull();

    expect(() =>
      createRevision(
        [baseline],
        'FIXTURE-P-SNAP',
        projectABItems(),
        { label: 'x', description: 'x', versionStamps: { pricingMode: 'LIVE' as never } },
        { now: T1 },
      ),
    ).toThrow(/Invalid pricingMode/);
    expect(() =>
      createRevision(
        [baseline],
        'FIXTURE-P-SNAP',
        projectABItems(),
        { label: 'x', description: 'x', versionStamps: { ahspDatabaseVersion: '' } },
        { now: T1 },
      ),
    ).toThrow(/must not be an empty string/);
  });

  it('createRevision without stamps keeps the §3 defaults (SNAPSHOT + 2026.1)', () => {
    const baseline = buildBaselineVersion('FIXTURE-P-SNAP', projectABItems(), { now: T0 });
    const result = createRevision(
      [baseline],
      'FIXTURE-P-SNAP',
      projectABItems(),
      { label: 'Plain revision', description: 'No stamps' },
      { now: T1 },
    );
    expect(result.created.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(result.created.ahspDatabaseVersion).toBe('2026.1');
    expect(result.created.masterPriceVersion).toBe('2026.1');
  });
});

// ---------------------------------------------------------------------------
// §10 (b): versioned-snapshot resolution
// ---------------------------------------------------------------------------

describe('§10 (b) versioned-snapshot resolution', () => {
  function versionedSource() {
    return createVersionedCatalogSource({
      activeVersions: activeVersions20262(),
      contents: {
        'CIPTA_KARYA|2026.1': smallCatalog(),
        'CIPTA_KARYA|2026.2': versionTargetItems(),
      },
    });
  }

  it('SNAPSHOT resolves from its PIN (2026.1), not the active pointer (2026.2)', () => {
    const r = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      source: versionedSource(),
    });
    expect(r.versionId).toBe('2026.1');
    expect(r.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(r.item.laborComponents[0].code).toBe('L.01');
    expect(r.item.laborComponents[0].coefficient).toBe(0.6);
    expect(r.composition.unitPrice).toBe(715816);
    expect(r.composition.pricingStatus).toBe('FULL');
  });

  it('LIVE follows the active pointer (2026.2) — coefficient 0,7, Rp725.816', () => {
    const r = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'LIVE_MASTER_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      source: versionedSource(),
    });
    expect(r.versionId).toBe('2026.2');
    expect(r.pricingMode).toBe('LIVE_MASTER_PRICE');
    expect(r.item.laborComponents[0].code).toBe('L.01');
    expect(r.item.laborComponents[0].coefficient).toBe(0.7);
    expect(r.composition.unitPrice).toBe(725816);
  });

  it('OVERRIDE resolves content from its pin (the override covers prices, not content)', () => {
    const r = resolveVersionedAhspItem({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'PROJECT_OVERRIDE',
      pinnedAhspDatabaseVersion: '2026.1',
      source: versionedSource(),
    });
    expect(r.versionId).toBe('2026.1');
    expect(r.pricingMode).toBe('PROJECT_OVERRIDE');
  });

  it('legacy (no mode, no pin) resolves as SNAPSHOT from 2026.1', () => {
    const r = resolveVersionedAhspItem({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      source: versionedSource(),
    });
    expect(r.versionId).toBe('2026.1');
    expect(r.pricingMode).toBe('SNAPSHOT_PRICE');
  });

  it('a code added in 2026.2 is invisible to a 2026.1 pin (throws, never substitutes)', () => {
    expect(() =>
      resolveVersionedAhspItem({
        family: 'CIPTA_KARYA',
        code: '1.1.1.99',
        pricingMode: 'SNAPSHOT_PRICE',
        pinnedAhspDatabaseVersion: '2026.1',
        source: versionedSource(),
      }),
    ).toThrow(/no item with that code in version 2026.1/);
    // ...but LIVE (2026.2) sees it.
    const r = resolveVersionedAhspItem({
      family: 'CIPTA_KARYA',
      code: '1.1.1.99',
      pricingMode: 'LIVE_MASTER_PRICE',
      source: versionedSource(),
    });
    expect(r.versionId).toBe('2026.2');
  });

  it('a code removed in 2026.2 throws for LIVE but still resolves from the 2026.1 pin', () => {
    expect(() =>
      resolveVersionedAhspItem({
        family: 'CIPTA_KARYA',
        code: '1.1.1.3',
        pricingMode: 'LIVE_MASTER_PRICE',
        source: versionedSource(),
      }),
    ).toThrow(/no item with that code in version 2026.2/);
    const r = resolveVersionedAhspItem({
      family: 'CIPTA_KARYA',
      code: '1.1.1.3',
      pricingMode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      source: versionedSource(),
    });
    expect(r.versionId).toBe('2026.1');
    expect(r.item.code).toBe('1.1.1.3');
  });

  it('unavailable pinned content throws (never substitutes live content)', () => {
    const source = createVersionedCatalogSource({
      activeVersions: activeVersions20262(),
      includeLiveCatalog: false,
    });
    expect(() =>
      resolveVersionedAhspItem({
        family: 'CIPTA_KARYA',
        code: '1.1.1.1',
        pricingMode: 'SNAPSHOT_PRICE',
        pinnedAhspDatabaseVersion: '2026.1',
        source,
      }),
    ).toThrow(/version 2026.1 content is not available/);
  });

  it('the live runtime catalog serves as the ACTIVE version content (and only that version)', () => {
    const source = createVersionedCatalogSource({ activeVersions: activeVersions20261() });
    const liveCk = source.getVersionItems('CIPTA_KARYA', '2026.1');
    expect(liveCk).not.toBeNull();
    expect(liveCk!.length).toBe(
      ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain === 'CIPTA_KARYA').length,
    );
    expect(liveCk!.some((i) => i.code === '1.1.1.1')).toBe(true);
    expect(source.getVersionItems('CIPTA_KARYA', '2026.2')).toBeNull();
    const r = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'LIVE_MASTER_PRICE',
      source,
    });
    expect(r.versionId).toBe('2026.1');
    expect(r.composition.unitPrice).toBe(715816);
  });

  it('an invalid mode throws (fail-closed)', () => {
    expect(() =>
      resolveVersionedAhspItem({
        family: 'CIPTA_KARYA',
        code: '1.1.1.1',
        pricingMode: 'LIVE' as never,
        source: versionedSource(),
      }),
    ).toThrow(/Unknown project pricing mode/);
  });
});

// ---------------------------------------------------------------------------
// §10 (c): cache — explicit context, never the code-keyed default cache
// ---------------------------------------------------------------------------

describe('§10 (c) cache (Keputusan 7)', () => {
  function versionedSource() {
    return createVersionedCatalogSource({
      activeVersions: activeVersions20262(),
      contents: {
        'CIPTA_KARYA|2026.1': smallCatalog(),
        'CIPTA_KARYA|2026.2': versionTargetItems(),
      },
    });
  }

  it('a coefficient change returns the NEW price, not the cached old one (same code)', () => {
    priceResolver2026.invalidateAhspCache();
    const versionBefore = priceResolver2026.getCacheVersion();
    const source = versionedSource();
    const old = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      source,
    });
    const next = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'LIVE_MASTER_PRICE',
      source,
    });
    expect(old.composition.unitPrice).toBe(715816);
    // The §9 probe returned the cached 715.816 here; §10 must return 725.816.
    expect(next.composition.unitPrice).toBe(725816);
    expect(next.composition).not.toBe(old.composition);
    // §10 read paths never mutate global cache state.
    expect(priceResolver2026.getCacheVersion()).toBe(versionBefore);
  });

  it('versioned resolutions never warm or poison the default cache', () => {
    priceResolver2026.invalidateAhspCache();
    const source = versionedSource();
    const versioned = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'LIVE_MASTER_PRICE',
      source,
    });
    expect(versioned.composition.unitPrice).toBe(725816);
    // The default path still serves LIVE content (715.816) — the
    // versioned 725.816 result never leaked into the code-keyed cache.
    const liveItem = realItem('1.1.1.1');
    const d1 = priceResolver2026.resolveAhspUnitPrice(liveItem);
    expect(d1.unitPrice).toBe(715816);
    expect(d1).not.toBe(versioned.composition);
    // ...and the default path still caches (semantics unchanged).
    const d2 = priceResolver2026.resolveAhspUnitPrice(liveItem);
    expect(d2).toBe(d1);
  });

  it('two identical versioned resolutions return equal but distinct compositions', () => {
    const source = versionedSource();
    const a = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      source,
    });
    const b = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      source,
    });
    expect(a.composition.unitPrice).toBe(b.composition.unitPrice);
    expect(a.composition).not.toBe(b.composition);
  });
});

// ---------------------------------------------------------------------------
// §10 (d): explicit adoption — version kind
// ---------------------------------------------------------------------------

describe('§10 (d) explicit adoption — AHSP version kind', () => {
  /** Registry with ONLY 2026.1 (no 2026.2 record at all). */
  function baselineRegistry(): AhspVersionRegistryState {
    return buildRegistryState([
      fixtureRecord('CIPTA_KARYA', '2026.1', computeAhspContentChecksum(smallCatalog())),
      fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
      fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
      fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
    ]);
  }

  /** Registry where 2026.2 was superseded by 2026.3 (target moved on). */
  function movedOnRegistry(): AhspVersionRegistryState {
    return buildRegistryState([
      fixtureRecord('CIPTA_KARYA', '2026.1', computeAhspContentChecksum(smallCatalog()), 'SUPERSEDED'),
      fixtureRecord('CIPTA_KARYA', '2026.2', computeAhspContentChecksum(versionTargetItems()), 'SUPERSEDED'),
      fixtureRecord('CIPTA_KARYA', '2026.3', 'eeeeeeeeeeeeeeee', 'ACTIVE'),
      fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
      fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
      fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
    ]);
  }

  it('preview: locked snapshot + as-if-LIVE diff + adopted items (A 715.816 → 725.816, +Rp100.000)', () => {
    const input = snapshotProjectAB();
    const before = JSON.stringify(input);
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    // PURE: the preview never mutates its input.
    expect(JSON.stringify(input)).toBe(before);

    expect(adoption.preview.status).toBe('COMPUTED');
    expect(adoption.changeKind).toBe('AHSP_VERSION_CHANGE');
    expect(adoption.targetAhspDatabaseVersion).toBe('2026.2');
    expect(adoption.targetMasterPriceVersion).toBe('2026.1');

    // The project's own impact: LOCKED (delta 0) + adoption aggregates.
    expect(adoption.projectImpact.status).toBe('LOCKED_SNAPSHOT');
    expect(adoption.projectImpact.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(adoption.projectImpact.oldGrandTotal).toBe(8313664);
    expect(adoption.projectImpact.deltaGrandTotal).toBe(0);
    expect(adoption.projectImpact.adoptionPreview).not.toBeNull();
    expect(adoption.projectImpact.adoptionPreview!.newGrandTotal).toBe(8413664);
    expect(adoption.projectImpact.adoptionPreview!.deltaGrandTotal).toBe(100000);
    expect(adoption.projectImpact.adoptionPreview!.affectedItemCount).toBe(1);
    expect(adoption.projectImpact.adoptionPreview!.uncomputableItemCount).toBe(0);

    // The as-if-LIVE diff: A repriced, B unchanged.
    expect(adoption.livePreview).not.toBeNull();
    expect(adoption.liveProjectImpact).not.toBeNull();
    expect(adoption.liveProjectImpact!.status).toBe('AFFECTED');
    expect(adoption.liveProjectImpact!.newGrandTotal).toBe(8413664);
    expect(adoption.liveProjectImpact!.deltaGrandTotal).toBe(100000);
    expect(adoption.adoptedItemImpacts).toHaveLength(1);
    const [aImpact] = adoption.adoptedItemImpacts;
    expect(aImpact.rabItemId).toBe('FIXTURE-RAB-A');
    expect(aImpact.status).toBe('REPRICED');
    expect(aImpact.oldUnitPrice).toBe(715816);
    expect(aImpact.newUnitPrice).toBe(725816);
    expect(aImpact.deltaAmount).toBe(100000);

    // The adopted items ARE the preview's items (totals-equality pin).
    expect(adoption.adoptedItems).not.toBeNull();
    expect(adoption.adoptedItems![0].unitPrice).toBe(725816);
    expect(adoption.adoptedItems![0].amount).toBe(7258160);
    expect(adoption.adoptedItems![1].unitPrice).toBe(577752);
    expect(adoption.adoptedItems![1].amount).toBe(1155504);
    expect(adoption.adoptedNewGrandTotal).toBe(8413664);
    expect(adoption.adoptedNewGrandTotal).toBe(
      adoption.projectImpact.adoptionPreview!.newGrandTotal,
    );
    expect(adoption.adoptedDeltaGrandTotal).toBe(100000);
    expect(adoption.uncomputableReasons).toEqual([]);
  });

  it('approve: baseline materialised from OLD items + new version pins 2026.2 (old never rewritten)', () => {
    const input = snapshotProjectAB();
    const project = makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' });
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    const result = approveAdoption({
      adoption,
      currentProjectInput: input,
      project,
      versions: [],
      reason: REASON,
      actor: 'fixture-owner',
      now: T2,
      currentState: currentStateFor([input], activeVersions20262()),
      registry: publishedRegistry(),
      idGenerator: () => 'FIXTURE-VERSION-ADOPTED',
    });

    expect(result.versions).toHaveLength(2);
    expect(result.oldGrandTotal).toBe(8313664);
    expect(result.newGrandTotal).toBe(8413664);
    expect(result.deltaGrandTotal).toBe(100000);
    expect(result.adoptedItems[0].unitPrice).toBe(725816);

    // The created version: new identity, adopted pins, frozen values.
    expect(result.created.id).toBe('FIXTURE-VERSION-ADOPTED');
    expect(result.created.versionNumber).toBe('v2.0');
    expect(result.created.label).toContain('Adopsi AHSP 2026.2');
    expect(result.created.ahspDatabaseVersion).toBe('2026.2');
    expect(result.created.masterPriceVersion).toBe('2026.1');
    expect(result.created.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(result.created.revisionNotes).toBe(REASON);
    expect(result.created.author).toBe('fixture-owner');
    expect(result.created.costBefore).toBe(8313664);
    expect(result.created.costAfter).toBe(8413664);
    expect(result.created.rabItemsSnapshot[0].unitPrice).toBe(725816);
    expect(result.created.rabItemsSnapshot[1].unitPrice).toBe(577752);

    // The materialised baseline records what the project WAS.
    const [baseline] = result.versions;
    expect(baseline.isBaseline).toBe(true);
    expect(baseline.ahspDatabaseVersion).toBe('2026.1');
    expect(baseline.masterPriceVersion).toBe('2026.1');
    expect(baseline.costAfter).toBe(8313664);
    expect(baseline.rabItemsSnapshot[0].unitPrice).toBe(715816);

    // The project record: only the pointer + updatedAt move.
    expect(result.project.activeEstimateVersionId).toBe('FIXTURE-VERSION-ADOPTED');
    expect(result.project.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(result.project.updatedAt).toBe(T2);
    expect(result.project.costSummary).toEqual(zeroCostSummary());
    expect(project.activeEstimateVersionId).toBeUndefined();
  });

  it('approve with existing versions: no baseline materialised, old versions untouched by reference', () => {
    const input = snapshotProjectAB();
    const project = makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' });
    const baseline = buildBaselineVersion('FIXTURE-P-SNAP', projectABItems(), { now: T0 });
    const versionsBefore = [baseline];
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    const result = approveAdoption({
      adoption,
      currentProjectInput: input,
      project,
      versions: versionsBefore,
      reason: REASON,
      now: T2,
      currentState: currentStateFor([input], activeVersions20262()),
      registry: publishedRegistry(),
    });
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0]).toBe(baseline);
    expect(versionsBefore).toHaveLength(1);
    expect(result.created.versionNumber).toBe('v2.0');
    expect(result.created.ahspDatabaseVersion).toBe('2026.2');
  });

  it('a 10-character reason is accepted (the §4 boundary)', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    expect(ADOPTION_REASON_MIN_LENGTH).toBe(10);
    const result = approveAdoption({
      adoption,
      currentProjectInput: input,
      project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
      versions: [],
      reason: 'Adopsi ok!',
      now: T2,
    });
    expect(result.created.revisionNotes).toBe('Adopsi ok!');
  });

  it('LIVE projects have nothing to adopt', () => {
    expect(() =>
      previewAdoption({
        project: liveProjectAB(),
        change: versionChange(publishedRegistry()),
        computedAt: T1,
      }),
    ).toThrow(/already follows new prices/);
  });

  it('a DRAFT target cannot be adopted', () => {
    expect(() =>
      previewAdoption({
        project: snapshotProjectAB(),
        change: versionChange(draftRegistry()),
        computedAt: T1,
      }),
    ).toThrow(/only the ACTIVE version can be adopted/);
  });

  it('a target missing from the registry cannot be adopted', () => {
    expect(() =>
      previewAdoption({
        project: snapshotProjectAB(),
        change: versionChange(baselineRegistry()),
        computedAt: T1,
      }),
    ).toThrow(/no such version in the registry/);
  });

  it('a NOT_COMPUTED preview cannot be adopted (wrong source checksum)', () => {
    const change = versionChange(publishedRegistry());
    expect(() =>
      previewAdoption({
        project: snapshotProjectAB(),
        change: { ...change, sourceContentChecksum: '0000000000000000' },
        computedAt: T1,
      }),
    ).toThrow(/NOT_COMPUTED/);
  });

  it('a short reason is refused', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    for (const bad of ['', 'ok', 'Adopsi 12']) {
      expect(() =>
        approveAdoption({
          adoption,
          currentProjectInput: input,
          project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
          versions: [],
          reason: bad,
          now: T2,
        }),
      ).toThrow(/at least 10 characters/);
    }
  });

  it('a project that moved since the preview is refused (fingerprint)', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    const moved: ProjectImpactInput = {
      ...input,
      items: [{ ...input.items[0], volume: 11, amount: 715816 * 11 }, input.items[1]],
    };
    expect(() =>
      approveAdoption({
        adoption,
        currentProjectInput: moved,
        project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
        versions: [],
        reason: REASON,
        now: T2,
      }),
    ).toThrow(/changed since the adoption preview/);
  });

  it('a stale preview is refused (the pointer moved between preview and approval)', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    const staleState = currentStateFor([input], {
      ...activeVersions20262(),
      CIPTA_KARYA: '2026.3',
    });
    expect(() =>
      approveAdoption({
        adoption,
        currentProjectInput: input,
        project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
        versions: [],
        reason: REASON,
        now: T2,
        currentState: staleState,
        registry: publishedRegistry(),
      }),
    ).toThrow(/stale/);
  });

  it('a target that is no longer ACTIVE at approval is refused', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    expect(() =>
      approveAdoption({
        adoption,
        currentProjectInput: input,
        project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
        versions: [],
        reason: REASON,
        now: T2,
        registry: movedOnRegistry(),
      }),
    ).toThrow(/no longer the ACTIVE version/);
  });

  it('a project mismatch is refused', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    expect(() =>
      approveAdoption({
        adoption,
        currentProjectInput: input,
        project: makeProjectRecord({ id: 'SOME-OTHER-PROJECT', pricingMode: 'SNAPSHOT_PRICE' }),
        versions: [],
        reason: REASON,
        now: T2,
      }),
    ).toThrow(/Adoption project mismatch/);
  });

  it('uncomputable items (removed in the new version) refuse adoption', () => {
    const input = makeProjectInput({
      projectId: 'FIXTURE-P-SNAP',
      projectName: 'Fixture Project (SNAPSHOT, uses removed item)',
      pricingMode: 'SNAPSHOT_PRICE',
      items: [
        makeRabItem({
          id: 'FIXTURE-RAB-C',
          code: '1.1.1.3',
          ahspCode: '1.1.1.3',
          description: 'Pembuatan 1 m2 plesteran',
          volume: 1,
          unit: 'm2',
          unitPrice: 343854,
          amount: 343854,
        }),
      ],
    });
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    expect(adoption.adoptedItems).toBeNull();
    expect(adoption.adoptedNewGrandTotal).toBeNull();
    expect(adoption.uncomputableReasons.length).toBeGreaterThan(0);
    expect(adoption.uncomputableReasons.join(' ')).toContain('1.1.1.3');
    expect(() =>
      approveAdoption({
        adoption,
        currentProjectInput: input,
        project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
        versions: [],
        reason: REASON,
        now: T2,
      }),
    ).toThrow(/cannot be repriced/);
  });

  it('§14.4 / Decision D: without adoption, a publish never moves a SNAPSHOT project', () => {
    const registry = publishedRegistry();
    expect(getActiveVersion(registry, 'CIPTA_KARYA')).toBe('2026.2');
    const source = createVersionedCatalogSource({
      activeVersions: activeVersions20262(),
      contents: {
        'CIPTA_KARYA|2026.1': smallCatalog(),
        'CIPTA_KARYA|2026.2': versionTargetItems(),
      },
    });
    // The pointer moved — the SNAPSHOT project still resolves 2026.1.
    const r = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      source,
    });
    expect(r.versionId).toBe('2026.1');
    expect(r.composition.unitPrice).toBe(715816);
    // ...and its stored totals are untouched.
    const summary = recalculateCostSummary([...snapshotProjectAB().items], {});
    expect(summary.directCost).toBe(8313664);
    expect(summary.grandTotal).toBe(8313664);
  });
});

// ---------------------------------------------------------------------------
// §10 (d): explicit adoption — master price kind
// ---------------------------------------------------------------------------

describe('§10 (d) explicit adoption — master price kind', () => {
  function livePricesApplied(): Map<string, number | null> {
    return new Map([[priceChangeKey(l01Change()), 110000]]);
  }

  it('preview: L.01 100.000 → 110.000 moves A by +Rp6.000/unit (project +Rp60.000)', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: priceChange(),
      computedAt: T1,
    });
    expect(adoption.preview.status).toBe('COMPUTED');
    expect(adoption.changeKind).toBe('MASTER_PRICE_CHANGE');
    // The AHSP pin does NOT move on a price adoption; the master label does.
    expect(adoption.targetAhspDatabaseVersion).toBe('2026.1');
    expect(adoption.targetMasterPriceVersion).toBe('2026.2');

    expect(adoption.projectImpact.status).toBe('LOCKED_SNAPSHOT');
    expect(adoption.projectImpact.adoptionPreview!.newGrandTotal).toBe(8373664);
    expect(adoption.projectImpact.adoptionPreview!.deltaGrandTotal).toBe(60000);
    expect(adoption.liveProjectImpact!.newGrandTotal).toBe(8373664);

    expect(adoption.adoptedItems![0].unitPrice).toBe(721816);
    expect(adoption.adoptedItems![0].amount).toBe(7218160);
    expect(adoption.adoptedItems![1].unitPrice).toBe(577752);
    expect(adoption.adoptedNewGrandTotal).toBe(8373664);
    expect(adoption.adoptedDeltaGrandTotal).toBe(60000);
  });

  it('approve refuses while the new prices are not live (live L.01 is still 100.000)', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: priceChange(),
      computedAt: T1,
    });
    expect(() =>
      approveAdoption({
        adoption,
        currentProjectInput: input,
        project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
        versions: [],
        reason: REASON,
        now: T2,
        currentState: currentStateFor([input], activeVersions20261()),
      }),
    ).toThrow(/not live as previewed/);
  });

  it('approve succeeds once the new prices are live (injected current prices)', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: priceChange(),
      computedAt: T1,
    });
    const result = approveAdoption({
      adoption,
      currentProjectInput: input,
      project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
      versions: [],
      reason: REASON,
      now: T2,
      currentState: currentStateFor([input], activeVersions20261()),
      currentPrices: livePricesApplied(),
    });
    expect(result.created.ahspDatabaseVersion).toBe('2026.1');
    expect(result.created.masterPriceVersion).toBe('2026.2');
    expect(result.created.label).toContain('Adopsi harga master 2026.2');
    expect(result.newGrandTotal).toBe(8373664);
    expect(result.deltaGrandTotal).toBe(60000);
    expect(result.created.rabItemsSnapshot[0].unitPrice).toBe(721816);
    // The baseline still holds the pre-adoption values.
    expect(result.versions[0].rabItemsSnapshot[0].unitPrice).toBe(715816);
    expect(result.versions[0].masterPriceVersion).toBe('2026.1');
  });

  it('approve refuses when the injected current prices disagree with the preview', () => {
    const input = snapshotProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: priceChange(),
      computedAt: T1,
    });
    const wrongPrices = new Map([[priceChangeKey(l01Change()), 100000]]);
    expect(() =>
      approveAdoption({
        adoption,
        currentProjectInput: input,
        project: makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' }),
        versions: [],
        reason: REASON,
        now: T2,
        currentPrices: wrongPrices,
      }),
    ).toThrow(/not live as previewed/);
  });

  it('a price adoption without a new master-price label is refused at preview', () => {
    expect(() =>
      previewAdoption({
        project: snapshotProjectAB(),
        change: { ...priceChange(), targetMasterPriceVersion: '' },
        computedAt: T1,
      }),
    ).toThrow(/without a new master price version label/);
  });
});

// ---------------------------------------------------------------------------
// §10 (d)+(e): OVERRIDE adoption
// ---------------------------------------------------------------------------

describe('§10 (d)+(e) OVERRIDE adoption', () => {
  it('preview: the OVERRIDE project reprices directly (no as-if-LIVE diff); L.01 covered @90.000', () => {
    const input = overrideProjectAB();
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    expect(adoption.preview.status).toBe('COMPUTED');
    // OVERRIDE projects are repriced by §9 directly — their own impact IS the diff.
    expect(adoption.livePreview).toBeNull();
    expect(adoption.liveProjectImpact).toBeNull();
    expect(adoption.projectImpact.status).toBe('AFFECTED');
    expect(adoption.projectImpact.pricingMode).toBe('PROJECT_OVERRIDE');
    expect(adoption.projectImpact.oldGrandTotal).toBe(8253664);
    // A: 709.816 → 718.816 (coef 0,7 × 90.000) = +9.000/unit × 10 = +90.000.
    expect(adoption.projectImpact.newGrandTotal).toBe(8343664);
    expect(adoption.projectImpact.deltaGrandTotal).toBe(90000);
    expect(adoption.adoptedItems![0].unitPrice).toBe(718816);
    expect(adoption.adoptedItems![0].amount).toBe(7188160);
    expect(adoption.adoptedNewGrandTotal).toBe(8343664);
    expect(adoption.targetAhspDatabaseVersion).toBe('2026.2');
  });

  it('approve: the created version is a frozen SNAPSHOT; the project record stays OVERRIDE', () => {
    const input = overrideProjectAB();
    const project = makeProjectRecord({ id: 'FIXTURE-P-OVR', pricingMode: 'PROJECT_OVERRIDE' });
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    const result = approveAdoption({
      adoption,
      currentProjectInput: input,
      project,
      versions: [],
      reason: REASON,
      now: T2,
      currentState: currentStateFor([input], activeVersions20262()),
      registry: publishedRegistry(),
    });
    expect(result.created.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(result.created.ahspDatabaseVersion).toBe('2026.2');
    expect(result.created.rabItemsSnapshot[0].unitPrice).toBe(718816);
    expect(result.project.pricingMode).toBe('PROJECT_OVERRIDE');
    expect(result.newGrandTotal).toBe(8343664);
  });
});

// ---------------------------------------------------------------------------
// §10 (e): OVERRIDE refs + OVERRIDE + pin composition
// ---------------------------------------------------------------------------

describe('§10 (e) OVERRIDE refs + pin composition', () => {
  beforeEach(() => {
    ProjectPriceEngine.resetInstance();
  });

  it('buildOverrideRefFromEngineOverrides takes only ACTIVE overrides (code = materialCode ?? materialId)', () => {
    const ref = buildOverrideRefFromEngineOverrides([
      {
        id: 'OVR-1',
        projectId: 'FIXTURE-P-OVR',
        materialId: 'L.01',
        materialCode: 'L.01',
        materialName: 'Pekerja',
        category: 'LABOR',
        price: 90000,
        unit: 'OH',
        reason: 'Fixture override',
        active: true,
        createdAt: T0,
      },
      {
        id: 'OVR-2',
        projectId: 'FIXTURE-P-OVR',
        materialId: 'L.02',
        price: 200000,
        unit: 'OH',
        reason: 'Inactive fixture override',
        active: false,
        createdAt: T0,
      },
    ]);
    expect(ref.pricesByComponentKey['L01|OH']).toBe(90000);
    expect(ref.pricesByComponentKey['L02|OH']).toBeUndefined();
  });

  it('buildOverrideRefFromProjectOverrides takes only isOverridden overrides', () => {
    const ref = buildOverrideRefFromProjectOverrides(
      [
        {
          id: 'OVR-1',
          projectId: 'FIXTURE-P-OVR',
          resourceCode: 'L.01',
          resourceName: 'Pekerja',
          category: 'LABOR',
          unit: 'OH',
          masterPrice: 100000,
          projectPrice: 90000,
          isOverridden: true,
          lastUpdated: T0,
        },
        {
          id: 'OVR-2',
          projectId: 'FIXTURE-P-OVR',
          resourceCode: 'L.02',
          resourceName: 'Tukang',
          category: 'LABOR',
          unit: 'OH',
          masterPrice: 145000,
          projectPrice: 145000,
          isOverridden: false,
          lastUpdated: T0,
        },
      ],
      'FIXTURE-P-OVR',
    );
    expect(ref.pricesByComponentKey['L01|OH']).toBe(90000);
    expect(ref.pricesByComponentKey['L02|OH']).toBeUndefined();
  });

  it('buildOverrideRefForProject reads the live ProjectPriceEngine store (read-only)', () => {
    const engine = ProjectPriceEngine.getInstance();
    engine.setProjectOverride({
      projectId: 'FIXTURE-P-OVR',
      materialId: 'L.01',
      materialCode: 'L.01',
      materialName: 'Pekerja',
      category: 'LABOR',
      price: 90000,
      unit: 'OH',
      reason: 'Fixture override for testing',
      active: true,
    });
    const ref = buildOverrideRefForProject('FIXTURE-P-OVR');
    expect(ref.pricesByComponentKey['L01|OH']).toBe(90000);
    expect(ref.label).toContain('FIXTURE-P-OVR');
    // A project with no overrides gets an empty map (never a fabricated price).
    const empty = buildOverrideRefForProject('FIXTURE-P-NONE');
    expect(empty.pricesByComponentKey).toEqual({});
  });

  it('mergeSnapshotAndOverrideRefs: override wins per key, the rest follows the snapshot', () => {
    const snapshotRef = buildComponentPriceRef(
      [
        { code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 111000 },
        { code: 'L.02', name: 'Tukang', unit: 'OH', unitPrice: 150000 },
      ],
      { label: 'snapshot:fixture', ahspDatabaseVersion: '2026.1', masterPriceVersion: '2026.1' },
    );
    const overrideRef = buildComponentPriceRef(
      [{ code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 90000 }],
      { label: 'project-overrides:fixture' },
    );
    const merged = mergeSnapshotAndOverrideRefs(snapshotRef, overrideRef);
    expect(merged.pricesByComponentKey['L01|OH']).toBe(90000);
    expect(merged.pricesByComponentKey['L02|OH']).toBe(150000);
    expect(merged.label).toContain('snapshot:fixture');
    expect(merged.label).toContain('project-overrides:fixture');
    // The inputs are untouched (pure merge).
    expect(snapshotRef.pricesByComponentKey['L01|OH']).toBe(111000);
  });

  it('buildProjectPricingContext: LIVE has no refs; SNAPSHOT passes the snapshot through; OVERRIDE merges', () => {
    const snapshotRef = buildComponentPriceRef(
      [{ code: 'L.02', name: 'Tukang', unit: 'OH', unitPrice: 150000 }],
      { label: 'snapshot:fixture' },
    );
    const overrideRef = buildComponentPriceRef(
      [{ code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 90000 }],
      { label: 'project-overrides:fixture' },
    );
    const live = buildProjectPricingContext({ mode: 'LIVE_MASTER_PRICE' });
    expect(live.pricingMode).toBe('LIVE_MASTER_PRICE');
    expect(live.snapshotRef).toBeUndefined();
    expect(live.overrideRef).toBeUndefined();

    const snap = buildProjectPricingContext({ mode: 'SNAPSHOT_PRICE', snapshotRef });
    expect(snap.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(snap.snapshotRef).toBe(snapshotRef);

    const ovr = buildProjectPricingContext({ mode: 'PROJECT_OVERRIDE', snapshotRef, overrideRef });
    expect(ovr.pricingMode).toBe('PROJECT_OVERRIDE');
    expect(ovr.overrideRef!.pricesByComponentKey['L01|OH']).toBe(90000);
    expect(ovr.overrideRef!.pricesByComponentKey['L02|OH']).toBe(150000);

    const ovrOnly = buildProjectPricingContext({ mode: 'PROJECT_OVERRIDE', overrideRef });
    expect(ovrOnly.overrideRef).toBe(overrideRef);

    expect(() => buildProjectPricingContext({ mode: 'LIVE' as never })).toThrow(
      /Unknown project pricing mode/,
    );
  });

  it('buildSnapshotPriceRef skips components without a usable positive price (never Rp0)', () => {
    const ref = buildSnapshotPriceRef({
      laborComponents: [
        { code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 100000 },
        { code: 'L.02', name: 'Tukang', unit: 'OH', unitPrice: null },
        { code: 'L.03', name: 'Mandor', unit: 'OH', unitPrice: 0 },
        { code: 'L.04', name: 'Kepala Tukang', unit: 'OH', unitPrice: -5 },
      ],
      materialComponents: [{ code: null, name: 'Pasir', unit: 'm3', unitPrice: 250000 }],
      ahspDatabaseVersion: '2026.1',
      masterPriceVersion: '2026.1',
      code: '1.1.1.1',
    });
    expect(ref.pricesByComponentKey['L01|OH']).toBe(100000);
    expect(ref.pricesByComponentKey['L02|OH']).toBeUndefined();
    expect(ref.pricesByComponentKey['L03|OH']).toBeUndefined();
    expect(ref.pricesByComponentKey['L04|OH']).toBeUndefined();
    expect(ref.ahspDatabaseVersion).toBe('2026.1');
    expect(ref.masterPriceVersion).toBe('2026.1');
  });

  it('OVERRIDE + pin, end to end: override wins, the rest follows the snapshot (synthetic prices labelled)', () => {
    // Synthetic fixture prices (LABELLED — they exist only to prove
    // which map wins, never as real prices): snapshot L.01 @111.000 /
    // L.02 @150.000, override L.01 @90.000. Live: L.01 @100.000,
    // L.02 @145.000. A = 715.816 with labour 118.000 (0,6/0,2/0,2).
    const source = createVersionedCatalogSource({
      activeVersions: activeVersions20262(),
      contents: { 'CIPTA_KARYA|2026.1': smallCatalog() },
    });
    const snapshotRef = buildComponentPriceRef(
      [
        { code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 111000 },
        { code: 'L.02', name: 'Tukang', unit: 'OH', unitPrice: 150000 },
      ],
      { label: 'snapshot:fixture', ahspDatabaseVersion: '2026.1', masterPriceVersion: '2026.1' },
    );
    const overrideRef = buildComponentPriceRef(
      [{ code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 90000 }],
      { label: 'project-overrides:fixture' },
    );

    // SNAPSHOT: labour 0,6×111.000 + 0,4×150.000 = 126.600 → 724.416.
    const snap = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      source,
      snapshotRef,
    });
    expect(snap.composition.unitPrice).toBe(724416);

    // OVERRIDE + pin: L.01 from the override (90.000), L.02 from the
    // snapshot (150.000) → labour 114.000 → 711.816.
    const ovr = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'PROJECT_OVERRIDE',
      pinnedAhspDatabaseVersion: '2026.1',
      source,
      snapshotRef,
      overrideRef,
    });
    expect(ovr.composition.unitPrice).toBe(711816);

    // OVERRIDE without a snapshot: L.02 falls back to LIVE (145.000) → 709.816.
    const ovrOnly = resolveVersionedAhspUnitPrice({
      family: 'CIPTA_KARYA',
      code: '1.1.1.1',
      pricingMode: 'PROJECT_OVERRIDE',
      pinnedAhspDatabaseVersion: '2026.1',
      source,
      overrideRef,
    });
    expect(ovrOnly.composition.unitPrice).toBe(709816);
  });
});

// ---------------------------------------------------------------------------
// §10 (f): financial defaults unchanged
// ---------------------------------------------------------------------------

describe('§10 (f) financial defaults unchanged (0% / 0%)', () => {
  it('an unconfigured project totals with 0% overhead / 0% profit', () => {
    const summary = recalculateCostSummary([...projectABItems()], {});
    expect(summary.directCost).toBe(8313664);
    expect(summary.overheadPercent).toBe(0);
    expect(summary.overheadAmount).toBe(0);
    expect(summary.profitPercent).toBe(0);
    expect(summary.profitAmount).toBe(0);
    expect(summary.grandTotal).toBe(8313664);
  });

  it('adoption preserves explicit overhead/profit on the project record', () => {
    const costSummary = {
      ...zeroCostSummary(),
      overheadPercent: 5,
      profitPercent: 10,
    };
    const input = makeProjectInput({
      projectId: 'FIXTURE-P-SNAP',
      projectName: 'Fixture Project (SNAPSHOT, 5%/10%)',
      pricingMode: 'SNAPSHOT_PRICE',
      items: projectABItems(),
      costSummary: { overheadPercent: 5, profitPercent: 10 },
    });
    const project = makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE', costSummary });
    const adoption = previewAdoption({
      project: input,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    const result = approveAdoption({
      adoption,
      currentProjectInput: input,
      project,
      versions: [],
      reason: REASON,
      now: T2,
    });
    // The mode change never touches the financial configuration.
    expect(result.project.costSummary.overheadPercent).toBe(5);
    expect(result.project.costSummary.profitPercent).toBe(10);
    // The adopted totals are consistent with the preview (O&P applied
    // by the canonical engine on both sides), and the version's
    // costAfter is the DIRECT cost (O&P are not frozen in versions).
    expect(result.newGrandTotal).toBe(adoption.adoptedNewGrandTotal);
    expect(result.newGrandTotal).toBeGreaterThan(result.oldGrandTotal);
    expect(result.created.costAfter).toBe(8413664);
  });

  it('setProjectPricingMode does not touch overhead/profit', () => {
    const project = makeProjectRecord({
      pricingMode: 'LIVE_MASTER_PRICE',
      costSummary: { ...zeroCostSummary(), overheadPercent: 5, profitPercent: 10 },
    });
    const updated = setProjectPricingMode(project, 'SNAPSHOT_PRICE', { now: T1 });
    expect(updated.costSummary.overheadPercent).toBe(5);
    expect(updated.costSummary.profitPercent).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// §10 (g): legacy compatibility (read-only)
// ---------------------------------------------------------------------------

describe('§10 (g) legacy compatibility (read-only)', () => {
  it('a legacy snapshot without version fields reads as 2026.1 (§8 §6 pattern)', () => {
    const legacy: AHSPProjectSnapshot = {
      ahspId: 'CK-1.1.1.1',
      code: '1.1.1.1',
      version: '2026.1',
      name: 'Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter',
      unit: 'm',
      laborComponents: [
        { code: 'L.01', name: 'Pekerja', unit: 'OH', coefficient: 0.6, unitPrice: 100000 },
      ],
      materialComponents: [],
      equipmentComponents: [],
      unitPrice: 715816,
    };
    expect(getSnapshotAhspVersion(legacy)).toBe('2026.1');
    const ref = buildSnapshotPriceRef(legacy);
    expect(ref.pricesByComponentKey['L01|OH']).toBe(100000);
    expect(ref.ahspDatabaseVersion).toBeNull();
    expect('ahspDatabaseVersion' in legacy).toBe(false);
  });

  it('a legacy project (no mode, no pins) resolves as SNAPSHOT + 2026.1 without any write-back', () => {
    const legacyProject = makeProjectRecord({ pricingMode: undefined });
    delete (legacyProject as Partial<Project>).pricingMode;
    const before = JSON.stringify(legacyProject);
    const state = effectiveProjectPricingState({
      pricingMode: legacyProject.pricingMode ?? null,
      pinnedAhspDatabaseVersion: null,
      pinnedMasterPriceVersion: null,
    });
    expect(state.mode).toBe('SNAPSHOT_PRICE');
    expect(state.pinnedAhspDatabaseVersion).toBe(AHSP_BASELINE_VERSION_ID);
    expect(JSON.stringify(legacyProject)).toBe(before);
    expect('pricingMode' in legacyProject).toBe(false);
  });

  it('deep-frozen legacy inputs never throw on §10 read paths', () => {
    const frozenProject = deepFreeze(makeProjectRecord({ pricingMode: undefined }));
    const frozenSnapshot = deepFreeze({
      laborComponents: [{ code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 100000 }],
      code: '1.1.1.1',
    });
    const frozenInput = deepFreeze({
      family: 'CIPTA_KARYA' as AhspFamily,
      code: '1.1.1.1',
      source: createVersionedCatalogSource({
        activeVersions: activeVersions20262(),
        contents: { 'CIPTA_KARYA|2026.1': smallCatalog() },
      }),
    });
    expect(() => {
      effectiveProjectPricingState({ pricingMode: frozenProject.pricingMode ?? null });
      buildSnapshotPriceRef(frozenSnapshot);
      resolveVersionedAhspItem(frozenInput);
    }).not.toThrow();
  });

  it('previewAdoption on a legacy (unpinned) SNAPSHOT project works and never writes pins back', () => {
    // Built manually (not via makeProjectInput): a legacy record has
    // NO pricingMode / pin keys at all — not even explicit undefineds.
    const legacyInput: ProjectImpactInput = {
      projectId: 'FIXTURE-P-SNAP',
      projectName: 'Legacy project (no pins)',
      isDemo: false,
      items: projectABItems(),
      costSummary: {},
    };
    const before = JSON.stringify(legacyInput);
    const adoption = previewAdoption({
      project: legacyInput,
      change: versionChange(publishedRegistry()),
      computedAt: T1,
    });
    expect(adoption.projectImpact.status).toBe('LOCKED_SNAPSHOT');
    expect(adoption.targetAhspDatabaseVersion).toBe('2026.2');
    expect(adoption.targetMasterPriceVersion).toBe('2026.1');
    expect(JSON.stringify(legacyInput)).toBe(before);
    expect('pricingMode' in legacyInput).toBe(false);
    expect('pinnedAhspDatabaseVersion' in legacyInput).toBe(false);
  });
});

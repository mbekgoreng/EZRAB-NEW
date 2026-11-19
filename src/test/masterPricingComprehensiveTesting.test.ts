/**
 * MASTER PRICING §14 — COMPREHENSIVE TESTING.
 *
 * The cross-cutting test layer over §2–§13. It does NOT re-test what
 * the per-phase suites already pin (§4 auth decisions, §8 versioning
 * ops, §9 impact math, §10 project modes, §12 resolver rules, §13
 * sync workflow internals); it covers what only §14 can:
 *
 *   §14.1 — the authorization MATRIX: every global write operation
 *     (9 master + 4 AHSP-version) × every identity class (global
 *     admin / ordinary / anonymous / demo / malformed) with the
 *     ALLOW/DENY + denial code, every write channel (incl.
 *     PROJECT_OVERRIDE denied for everyone), anti-self-approval,
 *     and the BLOCKED server-side tests as `it.skip` with precise
 *     reasons (never faked).
 *   §14.2 — propagation MECHANISM through the §9 preview path
 *     (the §12 suite covers the override-injection path): one
 *     change → every linked component repriced, coefficients
 *     untouched, totals recomputed. Full-catalog evidence lives in
 *     the JSON artifact `fase14-propagation-evidence.json`, not in
 *     this suite (a full-catalog sweep is minutes of compute).
 *   §14.3 — the version LIFECYCLE end to end: clone → edit →
 *     compare → publish → active → old version still readable →
 *     rollback; direct edit (checkpoint → confirm → apply);
 *     cancelled direct edit (no apply, no state change);
 *     concurrent-edit conflict (stale checkpoint refused).
 *   §14.4 — project modes end to end: SNAPSHOT locked, OVERRIDE
 *     partial, LIVE moves, adoption freezes totals + captures the
 *     snapshot map (§13 need #2), new projects 0%/0%.
 *   §14.5 — price-integrity PRE-GATE pins for the open §12 #1
 *     owner decision: the canonical resolver's Step 5 currently
 *     RESOLVES unit-incompatible matches (the gate would make them
 *     MISSING) — pinned so the decision's effect is measurable.
 *     The §12 suite covers the rest of §14.5 (missing ≠ Rp0,
 *     regions, periods, conflicts, provenance).
 *   §14.6 — the sync workflow at checklist level: happy path,
 *     rollback, idempotency, concurrent changes, stale preview.
 *     (§13 covers failure injection, retry, and cache layers.)
 *   §13 needs — regression tests for the needs §14 implemented:
 *     #2 snapshot capture + QTO read loop, #11 baseline-from-store,
 *     #6 feed pure functions. (#1 sweep, #5 --audit-dry-run, #10
 *     timeouts are verified by live runs, not unit tests — see the
 *     §14 report.)
 *
 * Fixtures mirror the §9/§10/§13 suites (same live-catalog items,
 * same computed numbers — the §9 calibration, re-used, not
 * re-invented): 1.1.1.1 Rp715.816 (L.01 Pekerja OH ×0,6 @100.000);
 * L.01 OH 100.000 → 110.000 moves A by +Rp6.000/unit; project AB
 * (A vol 10 + B vol 2) Rp8.313.664 → Rp8.373.664.
 *
 * Provider tests in this suite are mock/stub/simulated only: no
 * live AI call, no real provider, no browser E2E (NOT RUN — see
 * the §14 report §14.7).
 */
import { describe, expect, it } from 'vitest';

import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import {
  AHSP_FAMILIES,
  AHSP_FAMILY_DOMAINS,
  applyDirectEdit,
  buildRegistryState,
  cloneVersion,
  compareAhspSnapshots,
  computeAhspContentChecksum,
  confirmDirectEdit,
  createCheckpoint,
  getActiveVersion,
  getVersionRecord,
  notComputedImpactProvider,
  publishVersion,
  reviseDraftContent,
  rollbackVersion,
  snapshotPathFor,
  type AhspFamily,
  type AhspVersionImpact,
  type AhspVersionRecord,
  type AhspVersionRegistryState,
} from '../data/nationalCostDatabase/ahspVersioning';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { buildComponentPriceRef } from '../data/priceDatabase2026/centralResolution';
import {
  AHSP_VERSION_WRITE_OPERATIONS,
  MASTER_PRICE_WRITE_OPERATIONS,
  SERVER_ENFORCEMENT_STATUS,
  authorizeAliasApproval,
  authorizeMasterPriceOperation,
  authorizeMasterPriceWriteVia,
  authorizeReconciliationApproval,
  currentLocalIdentity,
  type GlobalWriteOperation,
  type MasterPriceIdentity,
} from '../engine/pricing/admin/masterPriceAuthorization';
import { canonicalPriceResolver } from '../engine/pricing/canonical/canonicalPriceResolver';
import { UnitEngine } from '../engine/calculatorCore/unit/unitEngine';
import {
  buildMasterPriceItemRepricer,
  computeCatalogChecksum,
  computeMasterPriceImpact,
  computeProjectsFingerprint,
  priceChangeKey,
  validateImpactPreviewFreshness,
  type MasterPriceChangeInput,
  type ProjectImpactInput,
} from '../engine/pricing/impact/masterPriceImpactPreview';
import {
  approveAdoption,
  buildProjectPricingContext,
  buildSnapshotRefFromProject,
  previewAdoption,
} from '../engine/pricing/projectPriceModes';
import {
  GLOBAL_PRICE_CHANGE_STEPS,
  createSyncMasterPriceStore,
  executeGlobalPriceChange,
  rollbackGlobalPriceChange,
  type SyncMasterPriceStore,
} from '../engine/pricing/sync/syncEngine';
import { buildHistoryEntry } from '../engine/pricing/admin/masterPriceHistory';
import type { MasterPriceHistoryEntry } from '../engine/pricing/admin/masterPriceHistory';
import type { MasterPriceWriteInput } from '../engine/pricing/admin/masterPriceRecord';
import {
  buildBaselineFeedEntry,
  buildPriceChangeFeedEntry,
  seedFeedFromHistory,
  type PriceChangeFeedInput,
} from '../engine/pricing/sync/priceChangeFeed';
import type { ResourcePriceRecord } from '../data/priceDatabase2026/types';
import { MASTER_PRICE_VERSION } from '../data/priceDatabase2026/types';
import type { Project, ProjectCostSummary, RabItem } from '../types';

// ---------------------------------------------------------------------------
// Fixtures (mirroring §9/§10/§13)
// ---------------------------------------------------------------------------

const T0 = '2026-11-16T00:00:00.000Z';
const T1 = '2026-11-16T00:00:01.000Z';
const T2 = '2026-11-16T00:00:02.000Z';
const T3 = '2026-11-16T00:00:03.000Z';
const REASON = 'Alasan fixture §14 yang cukup panjang';

const ADMIN: MasterPriceIdentity = { kind: 'authenticated', userId: 'admin-uuid-1', isGlobalAdmin: true };
const ADMIN_2: MasterPriceIdentity = { kind: 'authenticated', userId: 'admin-uuid-2', isGlobalAdmin: true };
const ORDINARY: MasterPriceIdentity = { kind: 'authenticated', userId: 'user-uuid-1', isGlobalAdmin: false };
const ANON: MasterPriceIdentity = { kind: 'anonymous' };
const DEMO: MasterPriceIdentity = { kind: 'demo', role: 'qs' };
const MALFORMED: unknown = { kind: 'authenticated' };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function realItem(code: string): NationalAHSPItem {
  const found = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.code === code);
  if (!found) throw new Error(`Fixture catalog item ${code} not found`);
  return clone(found);
}

/** The §9 small catalog: A (1.1.1.1) + B (1.1.1.2) + C (1.1.1.3), CK. */
function smallCatalog(): NationalAHSPItem[] {
  return [realItem('1.1.1.1'), realItem('1.1.1.2'), realItem('1.1.1.3')];
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

function snapshotProjectAB(): ProjectImpactInput {
  return makeProjectInput({
    projectId: 'FIXTURE-P-SNAP',
    projectName: 'Fixture Project (SNAPSHOT)',
    pricingMode: 'SNAPSHOT_PRICE',
    items: projectABItems(),
  });
}

function liveProjectAB(): ProjectImpactInput {
  return makeProjectInput({
    projectId: 'FIXTURE-P-LIVE',
    projectName: 'Fixture Project (LIVE)',
    pricingMode: 'LIVE_MASTER_PRICE',
    items: projectABItems(),
  });
}

/** The L.01 change: Pekerja OH Rp100.000 → Rp110.000 (baseline probed, pinned by §9). */
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

function makeRecord(over: Partial<ResourcePriceRecord> = {}): ResourcePriceRecord {
  return {
    id: 'PRC-TEST-1',
    resourceId: 'RES-TEST-001',
    resourceCode: 'M99',
    resourceName: 'Test Material',
    resourceType: 'material',
    unit: 'kg',
    unitRaw: 'kg',
    price: 10000,
    currency: 'IDR',
    location: { level: 'NATIONAL' },
    period: { year: 2026, month: null, label: '2026-Q1', effectiveFrom: '2026-01-01', effectiveTo: null },
    sourceKey: 'HSD_2026',
    sourceTier: 'OFFICIAL_GOVERNMENT',
    sourcePriority: 1,
    sourceName: 'Test Source',
    sourceType: 'GOVERNMENT_REFERENCE',
    retrievedAt: '2026-01-15',
    verificationStatus: 'VERIFIED',
    matchMethod: 'EXACT_CODE',
    matchConfidence: 0.95,
    notes: [],
    version: 1,
    status: 'ACTIVE',
    ...over,
  };
}

function l01Record(): ResourcePriceRecord {
  return makeRecord({
    id: 'PRC-HSD_2026-RES-L01-OH-NATIONAL-2026-Q1',
    resourceId: 'RES-L01',
    resourceCode: 'L.01',
    resourceName: 'Pekerja',
    resourceType: 'labor',
    unit: 'OH',
    unitRaw: 'OH',
    price: 100000,
  });
}

function l01Store(): SyncMasterPriceStore {
  return createSyncMasterPriceStore([l01Record()]);
}

function l01WriteInput(over: Partial<MasterPriceWriteInput> = {}): MasterPriceWriteInput {
  return {
    resourceId: 'RES-L01',
    price: 110000,
    unit: 'OH',
    location: { level: 'NATIONAL' },
    period: { year: 2026, month: null, label: '2026-Q1', effectiveFrom: '2026-01-01', effectiveTo: null },
    sourceKey: 'HSD_2026',
    reason: REASON,
    ...over,
  };
}

function baselineHistory(): readonly MasterPriceHistoryEntry[] {
  return [
    buildHistoryEntry({
      priceRecordId: null,
      resourceId: null,
      operation: 'BASELINE',
      previousAmount: null,
      newAmount: null,
      previousUnit: null,
      newUnit: null,
      previousRegion: null,
      newRegion: null,
      sourceKey: null,
      sourceTier: null,
      sourceDocument: null,
      verificationStatus: null,
      adminIdentity: null,
      changedAt: T0,
      reason: 'Baseline marker for testing (long enough)',
      affectedAhspReferences: [],
      affectedLivePriceProjects: [],
      publicationStatus: 'PUBLISHED',
      previousVersion: null,
      newVersion: null,
      masterPriceVersion: MASTER_PRICE_VERSION,
    }),
  ];
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
    itemCount: 10,
    publishedAt: status === 'ACTIVE' ? T0 : null,
    publishedBy: null,
  };
}

/** Minimal registry state: all four families ACTIVE at 2026.1, distinct checksums. */
function fixtureState(): AhspVersionRegistryState {
  return buildRegistryState([
    fixtureRecord('CIPTA_KARYA', '2026.1', 'aaaaaaaaaaaaaaaa'),
    fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
    fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
    fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
  ]);
}

/** A NOT_COMPUTED impact assessment (the honest "not measured" assessment for direct-edit confirmation). */
function notComputedImpact(): AhspVersionImpact {
  return notComputedImpactProvider.computeImpact({
    family: 'CIPTA_KARYA',
    sourceVersionId: '2026.1',
    targetVersionId: '2026.2',
    diffSummary: { added: 0, removed: 0, revised: 1, unchanged: 2 },
  });
}

// ---------------------------------------------------------------------------
// §14.1 — Authorization matrix
// ---------------------------------------------------------------------------

const ALL_WRITE_OPS: readonly GlobalWriteOperation[] = [
  ...MASTER_PRICE_WRITE_OPERATIONS,
  ...AHSP_VERSION_WRITE_OPERATIONS,
];

describe('§14.1 authorization matrix — every operation × every identity', () => {
  it('the matrix covers 13 write operations (9 master + 4 AHSP version)', () => {
    expect(MASTER_PRICE_WRITE_OPERATIONS).toHaveLength(9);
    expect(AHSP_VERSION_WRITE_OPERATIONS).toHaveLength(4);
    expect(ALL_WRITE_OPS).toHaveLength(13);
    expect(new Set(ALL_WRITE_OPS).size).toBe(13);
  });

  it.each(ALL_WRITE_OPS)('%s: global admin ALLOWED', (op) => {
    const d = authorizeMasterPriceOperation(ADMIN, op);
    expect(d.allowed).toBe(true);
    expect(d.code).toBe('ALLOWED');
  });

  it.each(ALL_WRITE_OPS)('%s: ordinary authenticated user DENIED (not a global admin)', (op) => {
    const d = authorizeMasterPriceOperation(ORDINARY, op);
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_NOT_GLOBAL_ADMIN');
  });

  it.each(ALL_WRITE_OPS)('%s: anonymous DENIED (not authenticated)', (op) => {
    const d = authorizeMasterPriceOperation(ANON, op);
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_NOT_AUTHENTICATED');
  });

  it.each(ALL_WRITE_OPS)('%s: demo role DENIED (demo identities cannot write global)', (op) => {
    const d = authorizeMasterPriceOperation(DEMO, op);
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_DEMO_ROLE');
  });

  it.each(ALL_WRITE_OPS)('%s: malformed identity DENIED (fail-closed)', (op) => {
    const d = authorizeMasterPriceOperation(MALFORMED, op);
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_MALFORMED_IDENTITY');
  });

  it('the local identity is anonymous — no admin exists in the frontend-only state', () => {
    expect(currentLocalIdentity()).toEqual({ kind: 'anonymous' });
    const d = authorizeMasterPriceOperation(currentLocalIdentity(), 'EDIT_MASTER_PRICE');
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_NOT_AUTHENTICATED');
  });

  it('server-side enforcement is BLOCKED — the local gate is UX only, never claimed as enforcement', () => {
    expect(SERVER_ENFORCEMENT_STATUS).toBe('BLOCKED');
  });

  it('reads are open for everyone (master prices are public reference data)', () => {
    for (const id of [ADMIN, ORDINARY, ANON, DEMO]) {
      expect(authorizeMasterPriceOperation(id, 'READ_MASTER_PRICE').allowed).toBe(true);
      expect(authorizeMasterPriceOperation(id, 'READ_MASTER_HISTORY').allowed).toBe(true);
    }
  });
});

describe('§14.1 authorization — write channels (no client-side bypass)', () => {
  it.each(['DIRECT', 'AHSP_EDIT', 'IMPORT', 'API', 'SYNC'] as const)(
    'via %s: global admin ALLOWED, ordinary DENIED, anonymous DENIED',
    (via) => {
      expect(authorizeMasterPriceWriteVia(ADMIN, 'EDIT_MASTER_PRICE', via).allowed).toBe(true);
      const ord = authorizeMasterPriceWriteVia(ORDINARY, 'EDIT_MASTER_PRICE', via);
      expect(ord.allowed).toBe(false);
      expect(ord.code).toBe('DENIED_NOT_GLOBAL_ADMIN');
      const anon = authorizeMasterPriceWriteVia(ANON, 'EDIT_MASTER_PRICE', via);
      expect(anon.allowed).toBe(false);
      expect(anon.code).toBe('DENIED_NOT_AUTHENTICATED');
    },
  );

  it('PROJECT_OVERRIDE is the wrong channel for a global write — denied for EVERYONE including admins', () => {
    for (const id of [ADMIN, ADMIN_2, ORDINARY, ANON, DEMO]) {
      const d = authorizeMasterPriceWriteVia(id, 'EDIT_MASTER_PRICE', 'PROJECT_OVERRIDE');
      expect(d.allowed).toBe(false);
      expect(d.code).toBe('DENIED_WRONG_CHANNEL');
    }
  });

  it('an unauthorized import is refused (IMPORT channel, ordinary user)', () => {
    const d = authorizeMasterPriceWriteVia(ORDINARY, 'CREATE_MASTER_ITEM', 'IMPORT');
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_NOT_GLOBAL_ADMIN');
  });

  it('an unauthorized API request is refused (API channel, anonymous)', () => {
    const d = authorizeMasterPriceWriteVia(ANON, 'PUBLISH_PRICE_UPDATE', 'API');
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_NOT_AUTHENTICATED');
  });

  it('a project override cannot change a global price (channel separation is structural)', () => {
    // The override engine writes project-scoped prices only; the
    // authorization layer independently refuses the channel. Both
    // halves are asserted: the channel decision here, the engine's
    // project scope in §14.4 (OVERRIDE moves only its own project).
    const d = authorizeMasterPriceWriteVia(ADMIN, 'EDIT_MASTER_PRICE', 'PROJECT_OVERRIDE');
    expect(d.code).toBe('DENIED_WRONG_CHANNEL');
  });
});

describe('§14.1 authorization — anti-self-approval', () => {
  it('an admin may not approve a reconciliation they created (DENIED_SELF_APPROVAL)', () => {
    const d = authorizeReconciliationApproval(ADMIN, 'admin-uuid-1');
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_SELF_APPROVAL');
  });

  it('a DIFFERENT admin may approve it', () => {
    const d = authorizeReconciliationApproval(ADMIN_2, 'admin-uuid-1');
    expect(d.allowed).toBe(true);
    expect(d.code).toBe('ALLOWED');
  });

  it('an admin may not approve an alias they proposed', () => {
    const d = authorizeAliasApproval(ADMIN, 'admin-uuid-1');
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_SELF_APPROVAL');
  });

  it('a null creator (legacy/system record) has no one to conflict with — any admin may approve', () => {
    expect(authorizeReconciliationApproval(ADMIN, null).allowed).toBe(true);
    expect(authorizeAliasApproval(ADMIN, null).allowed).toBe(true);
  });

  it('self-approval is checked AFTER the admin check: an ordinary user gets the admin denial, not self-approval', () => {
    const d = authorizeReconciliationApproval(ORDINARY, 'user-uuid-1');
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('DENIED_NOT_GLOBAL_ADMIN');
  });
});

describe('§14.1 server-side enforcement — BLOCKED (not faked)', () => {
  // §4.1 is BLOCKED: AUTH_ENABLED=false, the RLS migration is NOT
  // APPLIED, there are no master/AHSP tables in Postgres, no price
  // API endpoint, and the Vercel function quota is 12/12. These
  // tests are skipped with the precise blocker each — they become
  // runnable only when the infrastructure exists. The deterministic
  // logic above is tested; the server is NOT claimed.
  const BLOCKED =
    'BLOCKED (§4.1): no server enforcement exists to test — RLS migration NOT APPLIED, no price API endpoint, AUTH_ENABLED=false.';
  it.skip(`RLS: a non-admin JWT cannot UPDATE master_price_records (${BLOCKED})`, () => {});
  it.skip(`RLS: a global_admins member CAN UPDATE master_price_records (${BLOCKED})`, () => {});
  it.skip(`RLS: ezrab_is_global_admin() reflects grant/revoke in global_admins (${BLOCKED})`, () => {});
  it.skip(`API: POST /api/prices without a token returns 401 (${BLOCKED})`, () => {});
  it.skip(`API: POST /api/prices as an ordinary user returns 403 (${BLOCKED})`, () => {});
  it.skip(`API: POST /api/prices as a global admin returns 200 and writes the audit row (${BLOCKED})`, () => {});
  it.skip(`API: a client-side role claim cannot bypass the server check (${BLOCKED})`, () => {});
});

// ---------------------------------------------------------------------------
// §14.2 — Propagation mechanism (preview path)
// ---------------------------------------------------------------------------

describe('§14.2 propagation — one master change reprices every linked component', () => {
  it('L.01 100.000 → 110.000: item A 715.816 → 721.816 (+6.000), item B untouched', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
    });
    expect(preview.status).toBe('COMPUTED');
    const a = preview.items.changed.find((i) => i.code === '1.1.1.1');
    expect(a).toBeDefined();
    expect(a?.oldUnitPrice).toBe(715816);
    expect(a?.newUnitPrice).toBe(721816);
    expect(a?.delta).toBe(6000);
    expect(a?.componentChangeCount).toBe(1);
    // B (1.1.1.2) has no L.01|OH component — it is not in the changed list.
    expect(preview.items.changed.find((i) => i.code === '1.1.1.2')).toBeUndefined();
    expect(preview.items.summary.priceChanged).toBe(1);
  });

  it('the project delta is the sum of its items’ deltas (A vol 10 × 6.000 = +60.000)', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
    });
    expect(preview.status).toBe('COMPUTED');
    const p = preview.projects.projects[0];
    expect(p.oldGrandTotal).toBe(8313664);
    expect(p.newGrandTotal).toBe(8373664);
    expect(p.deltaGrandTotal).toBe(60000);
    expect(preview.aggregates.totalDeltaGrandTotal).toBe(60000);
  });

  it('component refs carry the per-component old/new price and delta', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
    });
    expect(preview.status).toBe('COMPUTED');
    const ref = preview.components.affected.find(
      (r) => r.itemCode === '1.1.1.1' && r.resourceKey === 'L01|OH',
    );
    expect(ref).toBeDefined();
    expect(ref?.oldPrice).toBe(100000);
    expect(ref?.newPrice).toBe(110000);
    expect(ref?.deltaPerUnit).toBe(6000);
    expect(ref?.coefficient).toBe(0.6);
  });

  it('coefficients do NOT change: the catalog checksum is identical before and after the preview', () => {
    const catalog = smallCatalog();
    const before = computeAhspContentChecksum(catalog);
    const coefBefore = catalog[0].laborComponents[0].coefficient;
    computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: catalog,
      projects: [liveProjectAB()],
    });
    expect(computeAhspContentChecksum(catalog)).toBe(before);
    expect(catalog[0].laborComponents[0].coefficient).toBe(coefBefore);
    expect(coefBefore).toBe(0.6);
  });

  it('the repricer itself reprices item A to 721.816 (direct builder use)', () => {
    const catalog = smallCatalog();
    const itemA = catalog[0];
    const repricer = buildMasterPriceItemRepricer({
      affectedItemIds: new Set([itemA.id]),
      changedPrices: new Map([[priceChangeKey(l01Change()), 110000]]),
      project: liveProjectAB(),
    });
    const result = repricer(makeRabItem({ id: 'FIXTURE-RAB-A' }), itemA);
    expect(result.computable).toBe(true);
    expect(result.affected).toBe(true);
    expect(result.newUnitPrice).toBe(721816);
  });

  it('full-catalog evidence is the JSON artifact (see fase14-propagation-evidence.json)', () => {
    // A full-catalog sweep is minutes of compute and does not belong
    // in a unit suite. The artifact pins, per change, the linked-ref
    // counts and the moved-item counts across CK/BM/SDA/SMKK
    // (L01|OH 496/496 refs, 479 items moved; L01|jam 1001/1001,
    // 960 moved; E07 ADD 108/108, 107 moved — all computed, 100%
    // of linked refs resolving the new price). This test pins the
    // artifact's contract: the mechanism above IS the mechanism the
    // artifact measures (same repricer, same mirror rule).
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [],
    });
    expect(preview.status).toBe('COMPUTED');
    expect(preview.components.summary.affectedReferenceCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §14.3 — Version lifecycle end to end
// ---------------------------------------------------------------------------

describe('§14.3 version lifecycle — clone → edit → compare → publish → rollback', () => {
  function draftItems(): NationalAHSPItem[] {
    const items = smallCatalog();
    // A's L.01 coefficient 0,6 → 0,7 (the §10 version target, mirrored).
    items[0].laborComponents[0].coefficient = 0.7;
    items[0].laborComponents[0].total = 70000;
    items[0].totalLabor = 137600;
    items[0].unitPrice = 725816;
    return items;
  }

  it('full lifecycle: clone, edit, compare, publish, old version readable, rollback', () => {
    const state0 = fixtureState();
    expect(getActiveVersion(state0, 'CIPTA_KARYA')).toBe('2026.1');

    // 1. Clone 2026.1 → 2026.2 (DRAFT); the active pointer does not move.
    const { state: cloned, record: draft } = cloneVersion(state0, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      newVersionId: '2026.2',
      reason: REASON,
      now: T1,
    });
    expect(draft.status).toBe('DRAFT');
    expect(draft.contentChecksum).toBe('aaaaaaaaaaaaaaaa');
    expect(getActiveVersion(cloned, 'CIPTA_KARYA')).toBe('2026.1');

    // 2. Edit the clone; the ORIGINAL record is untouched.
    const items = draftItems();
    const { state: edited, record: editedRecord } = reviseDraftContent(cloned, {
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      items,
      contentProvenance: 'PIPELINE_REGENERATED',
      reason: REASON,
      now: T2,
    });
    expect(editedRecord.contentChecksum).toBe(computeAhspContentChecksum(items));
    expect(editedRecord.contentChecksum).not.toBe('aaaaaaaaaaaaaaaa');
    expect(getVersionRecord(edited, 'CIPTA_KARYA', '2026.1')?.contentChecksum).toBe('aaaaaaaaaaaaaaaa');

    // 3. Compare: exactly 1 revised (A), 2 unchanged.
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: smallCatalog() },
      { versionId: '2026.2', items },
      AHSP_FAMILY_DOMAINS['CIPTA_KARYA'],
    );
    expect(diff.summary.revised).toBe(1);
    expect(diff.summary.unchanged).toBe(2);
    expect(diff.summary.added).toBe(0);
    expect(diff.summary.removed).toBe(0);
    expect(diff.revisedCodes[0].code).toBe('1.1.1.1');

    // 4. Publish: the pointer moves; 2026.1 is SUPERSEDED but still readable.
    const { state: published } = publishVersion(edited, {
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      reason: REASON,
      now: T3,
    });
    expect(getActiveVersion(published, 'CIPTA_KARYA')).toBe('2026.2');
    expect(getVersionRecord(published, 'CIPTA_KARYA', '2026.2')?.status).toBe('ACTIVE');
    const old = getVersionRecord(published, 'CIPTA_KARYA', '2026.1');
    expect(old).toBeDefined();
    expect(old?.status).toBe('SUPERSEDED');
    expect(old?.contentChecksum).toBe('aaaaaaaaaaaaaaaa');

    // 5. Rollback to 2026.1 as 2026.3: a DRAFT record with ROLLBACK_COPY
    //     content; publishing it moves the pointer back.
    const { state: rolledBack, record: rollbackRecord } = rollbackVersion(published, {
      family: 'CIPTA_KARYA',
      targetVersionId: '2026.1',
      newVersionId: '2026.3',
      reason: REASON,
      now: T3,
    });
    expect(rollbackRecord.status).toBe('DRAFT');
    expect(rollbackRecord.contentChecksum).toBe('aaaaaaaaaaaaaaaa');
    expect(rollbackRecord.contentProvenance).toBe('ROLLBACK_COPY');
    expect(getActiveVersion(rolledBack, 'CIPTA_KARYA')).toBe('2026.2');
    const { state: restored } = publishVersion(rolledBack, {
      family: 'CIPTA_KARYA',
      versionId: '2026.3',
      reason: REASON,
      now: T3,
    });
    expect(getActiveVersion(restored, 'CIPTA_KARYA')).toBe('2026.3');
    // Every version remains in the registry (nothing is deleted).
    expect(getVersionRecord(restored, 'CIPTA_KARYA', '2026.1')).toBeDefined();
    expect(getVersionRecord(restored, 'CIPTA_KARYA', '2026.2')).toBeDefined();
    expect(getVersionRecord(restored, 'CIPTA_KARYA', '2026.3')).toBeDefined();
  });

  it('the registry covers all four AHSP families', () => {
    expect([...AHSP_FAMILIES].sort()).toEqual(
      ['BINA_MARGA', 'CIPTA_KARYA', 'SMKK', 'SUMBER_DAYA_AIR'].sort(),
    );
    const state = fixtureState();
    for (const family of AHSP_FAMILIES) {
      expect(getActiveVersion(state, family)).toBe('2026.1');
    }
  });
});

describe('§14.3 direct edit — checkpoint → confirm → apply; cancel; conflict', () => {
  it('direct edit applies: checkpoint → confirm → apply moves the pointer (NOT_COMPUTED history)', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    expect(checkpoint.versionId).toBe('2026.1');
    const confirmation = confirmDirectEdit(state, {
      checkpoint,
      impact: notComputedImpact(),
      reason: REASON,
      now: T2,
    });
    expect(confirmation.impact.status).toBe('NOT_COMPUTED');
    const items = smallCatalog();
    const { state: next, record, historyEntry } = applyDirectEdit(state, {
      confirmation,
      newVersionId: '2026.2',
      newItems: items,
      contentProvenance: 'PIPELINE_REGENERATED',
      diffSummary: { added: 0, removed: 0, revised: 0, unchanged: 3 },
      now: T3,
    });
    expect(record.versionId).toBe('2026.2');
    expect(record.status).toBe('ACTIVE');
    expect(getActiveVersion(next, 'CIPTA_KARYA')).toBe('2026.2');
    expect(getVersionRecord(next, 'CIPTA_KARYA', '2026.1')?.status).toBe('SUPERSEDED');
    expect(historyEntry).not.toBeNull();
  });

  it('a cancelled direct edit changes nothing (confirm alone never mutates state)', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    confirmDirectEdit(state, { checkpoint, impact: notComputedImpact(), reason: REASON, now: T2 });
    // No apply: the registry is exactly as it was.
    expect(getActiveVersion(state, 'CIPTA_KARYA')).toBe('2026.1');
    expect(getVersionRecord(state, 'CIPTA_KARYA', '2026.2')).toBeNull();
    expect(getVersionRecord(state, 'CIPTA_KARYA', '2026.1')?.status).toBe('ACTIVE');
  });

  it('concurrent edit conflict: a checkpoint that went stale is refused at apply', () => {
    const state = fixtureState();
    const checkpointA = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const checkpointB = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const confA = confirmDirectEdit(state, {
      checkpoint: checkpointA,
      impact: notComputedImpact(),
      reason: REASON,
      now: T2,
    });
    const confB = confirmDirectEdit(state, {
      checkpoint: checkpointB,
      impact: notComputedImpact(),
      reason: REASON,
      now: T2,
    });
    const { state: moved } = applyDirectEdit(state, {
      confirmation: confA,
      newVersionId: '2026.2',
      newItems: smallCatalog(),
      contentProvenance: 'PIPELINE_REGENERATED',
      now: T3,
    });
    expect(getActiveVersion(moved, 'CIPTA_KARYA')).toBe('2026.2');
    // B's checkpoint is stale (the pointer moved under it) — apply refuses.
    expect(() =>
      applyDirectEdit(moved, {
        confirmation: confB,
        newVersionId: '2026.3',
        newItems: smallCatalog(),
        contentProvenance: 'PIPELINE_REGENERATED',
        now: T3,
      }),
    ).toThrow();
    expect(getActiveVersion(moved, 'CIPTA_KARYA')).toBe('2026.2');
  });

  it('a failed direct-edit transaction leaves the state untouched (pure functions, no partial write)', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const confirmation = confirmDirectEdit(state, {
      checkpoint,
      impact: notComputedImpact(),
      reason: REASON,
      now: T2,
    });
    expect(() =>
      applyDirectEdit(state, {
        confirmation,
        newVersionId: 'bukan-versi',
        newItems: smallCatalog(),
        contentProvenance: 'PIPELINE_REGENERATED',
        now: T3,
      }),
    ).toThrow();
    expect(getActiveVersion(state, 'CIPTA_KARYA')).toBe('2026.1');
    expect(getVersionRecord(state, 'CIPTA_KARYA', 'bukan-versi')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §14.4 — Historical projects
// ---------------------------------------------------------------------------

describe('§14.4 historical projects — SNAPSHOT locked, OVERRIDE partial, LIVE moves', () => {
  it('SNAPSHOT_PRICE is untouched by a global price change (delta 0, locked)', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [snapshotProjectAB()],
    });
    expect(preview.status).toBe('COMPUTED');
    const p = preview.projects.projects[0];
    expect(p.deltaGrandTotal).toBe(0);
    expect(p.newGrandTotal).toBe(p.oldGrandTotal);
    expect(p.oldGrandTotal).toBe(8313664);
    expect(preview.projects.summary.lockedSnapshotCount).toBe(1);
  });

  it('LIVE_MASTER_PRICE resolves the new price (delta +60.000)', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
    });
    expect(preview.status).toBe('COMPUTED');
    const p = preview.projects.projects[0];
    expect(p.deltaGrandTotal).toBe(60000);
    expect(p.newGrandTotal).toBe(8373664);
  });

  it('PROJECT_OVERRIDE: only the uncovered components move (L.01 covered @90.000 stays)', () => {
    const overrideProject = makeProjectInput({
      projectId: 'FIXTURE-P-OVR',
      projectName: 'Fixture Project (OVERRIDE)',
      pricingMode: 'PROJECT_OVERRIDE',
      overrides: [
        {
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
        },
      ],
      items: [
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
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [overrideProject],
    });
    expect(preview.status).toBe('COMPUTED');
    const p = preview.projects.projects[0];
    // A is fully covered by the L.01 override → no movement at all.
    expect(p.deltaGrandTotal).toBe(0);
    expect(p.newGrandTotal).toBe(p.oldGrandTotal);
  });

  it('adoption freezes the totals: the old version keeps the old items, the new version the new ones', () => {
    const input = snapshotProjectAB();
    const project = makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' });
    const adoption = previewAdoption({
      project: input,
      change: {
        kind: 'MASTER_PRICE_CHANGE' as const,
        targetMasterPriceVersion: '2026.2',
        priceChanges: [l01Change()],
        catalogItems: smallCatalog(),
      },
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
      currentPrices: new Map([[priceChangeKey(l01Change()), 110000]]),
      catalogItems: smallCatalog(),
      idGenerator: () => 'FIXTURE-VERSION-ADOPTED',
    });
    expect(result.oldGrandTotal).toBe(8313664);
    expect(result.newGrandTotal).toBe(8373664);
    expect(result.versions).toHaveLength(2);
    // The materialised baseline keeps the OLD items (pre-adoption).
    const baseline = result.versions[0];
    expect(baseline.rabItemsSnapshot[0].unitPrice).toBe(715816);
    // The created version keeps the NEW items.
    expect(result.created.rabItemsSnapshot[0].unitPrice).toBe(721816);
    // The project's mode and overhead/profit are unchanged by adoption.
    expect(result.project.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(result.project.costSummary.overheadPercent).toBe(0);
    expect(result.project.costSummary.profitPercent).toBe(0);
  });

  it('new projects keep the 0%/0% financial defaults (owner decision 2026-11-08)', () => {
    const project = makeProjectRecord();
    expect(project.costSummary.overheadPercent).toBe(0);
    expect(project.costSummary.profitPercent).toBe(0);
    expect(project.costSummary.overheadAmount).toBe(0);
    expect(project.costSummary.profitAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §14.5 — Price-integrity pre-gate pins (open §12 #1 owner decision)
// ---------------------------------------------------------------------------

describe('§14.5 integrity — canonical Steps 3/5 pre-gate behavior (pinned, not changed)', () => {
  it('Step 5 resolves M.23 kg same-unit after AHSP adoption (Rp1.425/kg)', () => {
    // RE-BASELINED 2026-11-18 (owner ratified "Terima patokan harga baru"):
    // the AHSP price adoption (aae4535/9acf312, v2026.2) supplied a
    // same-unit per-kg price for M.23, so the unit-incompatible
    // resolution this test used to pin (M.23 kg → Rp250.000/bh via
    // NATIONAL_REFERENCE_MATCH, §12 #1 evidence fase13-sweep12-1.json)
    // no longer occurs for this item — the adoption closed this
    // example. The §12 #1 gate question stays open for other items.
    // This test now pins the corrected behavior.
    const r = canonicalPriceResolver.resolve({ code: 'M.23', name: 'Portland Cement', unit: 'kg' });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(1425);
    expect(r.unit).toBe('kg');
    expect(r.resolutionPath.join(' ')).toContain('OFFICIAL_RESOURCE_RESOLVED');
    expect(UnitEngine.areCompatible('kg', r.unit)).toBe(true);
  });

  it('Step 5 converts a compatible unit (buah → bh, Rp453.500)', () => {
    // RE-BASELINED 2026-11-18 (owner ratified): adopted market price
    // for Bronjong ø3 mm is Rp453.500/bh (R044+R118, AHSP v2026.2);
    // the resolver now returns the record's own unit 'bh' instead of
    // converting to 'unit' — 'bh' is the same piece unit as 'buah'.
    const r = canonicalPriceResolver.resolve({
      name: 'Bronjong kawat pabrikan Uk.2x1x0,5 ø 3mm mesh 8x10',
      unit: 'buah',
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(453500);
    expect(r.unit).toBe('bh');
    expect(UnitEngine.areCompatible('buah', 'bh')).toBe(true);
  });

  it('a missing resource is MISSING with a null price — never Rp0', () => {
    const r = canonicalPriceResolver.resolve({ code: 'ZZZ-TIDAK-ADA', name: 'Tidak Ada', unit: 'm3' });
    expect(r.status).toBe('MISSING');
    expect(r.price).toBeNull();
    expect(r.price).not.toBe(0);
  });

  it('Step 0: a SNAPSHOT price answers first (frozen 111.000 beats live 100.000)', () => {
    const ref = buildComponentPriceRef(
      [{ code: 'L.01', name: 'Pekerja', unit: 'OH', unitPrice: 111000 }],
      { label: 'test-snapshot-14.5' },
    );
    const r = canonicalPriceResolver.resolve({
      code: 'L.01',
      name: 'Pekerja',
      unit: 'OH',
      pricingMode: 'SNAPSHOT_PRICE',
      snapshotRef: ref,
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(111000);
    expect(r.source).toBe('SNAPSHOT_PRICE');
  });

  it('Step 0 miss falls through to live (no snapshot entry → live 100.000)', () => {
    const ref = buildComponentPriceRef(
      [{ code: 'L.02', name: 'Tukang', unit: 'OH', unitPrice: 145000 }],
      { label: 'test-snapshot-14.5-miss' },
    );
    const r = canonicalPriceResolver.resolve({
      code: 'L.01',
      name: 'Pekerja',
      unit: 'OH',
      pricingMode: 'SNAPSHOT_PRICE',
      snapshotRef: ref,
    });
    expect(r.status).toBe('RESOLVED');
    expect(r.price).toBe(100000);
    expect(r.resolutionPath.join(' ')).toContain('SNAPSHOT_MISS_FALL_THROUGH_TO_LIVE');
  });
});

// ---------------------------------------------------------------------------
// §14.6 — Sync workflow (checklist level)
// ---------------------------------------------------------------------------

describe('§14.6 sync — happy path, rollback, idempotency, concurrency, staleness', () => {
  it('happy path: L.01 100.000 → 110.000 through all 10 steps, verified', () => {
    const result = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.steps.map((s) => s.step)).toEqual([...GLOBAL_PRICE_CHANGE_STEPS]);
    expect(result.steps.every((s) => s.status === 'OK')).toBe(true);
    expect(result.store.readPrice('L.01', 'OH')).toBe(110000);
    expect(result.history).toHaveLength(2);
    expect(result.historyEntry.operation).toBe('UPDATE');
    expect(result.historyEntry.previousAmount).toBe(100000);
    expect(result.historyEntry.newAmount).toBe(110000);
    expect(result.feed).toHaveLength(1);
    expect(result.feed[0].sourceKind).toBe('SYNC');
    expect(result.feed[0].resourceCode).toBe('L.01');
    // The preview inside the result carries the §9 delta.
    const item = result.preview.items.changed.find((i) => i.code === '1.1.1.1');
    expect(item?.delta).toBe(6000);
  });

  it('rollback restores the old price through the same ten steps (inverse preview)', () => {
    const first = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected the forward change to succeed');
    const rolled = rollbackGlobalPriceChange({
      identity: ADMIN,
      originalPreview: first.preview,
      originalChange: l01Change(),
      write: l01WriteInput({ price: 100000, reason: 'Rollback fixture: restore the L.01 wage' }),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store: first.store,
      history: first.history,
      feed: first.feed,
      now: T2,
    });
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) throw new Error(`expected the rollback to succeed: ${rolled.reason}`);
    expect(rolled.store.readPrice('L.01', 'OH')).toBe(100000);
    expect(rolled.syncHistoryEntry.operationType).toBe('ROLLBACK');
    expect(rolled.historyEntry.operation).toBe('ROLLBACK');
    const item = rolled.preview.items.changed.find((i) => i.code === '1.1.1.1');
    expect(item?.oldUnitPrice).toBe(721816);
    expect(item?.newUnitPrice).toBe(715816);
    expect(item?.delta).toBe(-6000);
    expect(rolled.history).toHaveLength(3);
    expect(rolled.feed).toHaveLength(2);
  });

  it('idempotency: re-running the same change fails at the baseline check (0 duplicates)', () => {
    const first = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected the first change to succeed');
    const second = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store: first.store,
      history: first.history,
      feed: first.feed,
      now: T2,
    });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('expected the re-run to fail');
    expect(second.failedAt).toBe('COMPUTE_IMPACT');
    expect(second.reason).toMatch(/baseline mismatch/);
    // No duplicate history/feed entries were written by the failed run.
    expect(first.history).toHaveLength(2);
    expect(first.feed).toHaveLength(1);
  });

  it('concurrent changes: the second writer sees the moved baseline and is refused', () => {
    const store = l01Store();
    const first = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store,
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected the first change to succeed');
    // A concurrent change premised on the OLD baseline (100.000 → 120.000).
    const concurrent = executeGlobalPriceChange({
      identity: ADMIN,
      change: { ...l01Change(), newPrice: 120000 },
      write: l01WriteInput({ price: 120000 }),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store: first.store,
      history: first.history,
      feed: first.feed,
      now: T2,
    });
    expect(concurrent.ok).toBe(false);
    if (concurrent.ok) throw new Error('expected the concurrent change to fail');
    expect(concurrent.failedAt).toBe('COMPUTE_IMPACT');
    expect(first.store.readPrice('L.01', 'OH')).toBe(110000);
  });

  it('a stale preview is refused by the freshness validator (moved catalog checksum)', () => {
    const catalog = smallCatalog();
    const projects = [liveProjectAB()];
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: catalog,
      projects,
    });
    expect(preview.status).toBe('COMPUTED');
    // Fresh against the world it was computed from.
    const fresh = validateImpactPreviewFreshness(preview, {
      catalogChecksum: computeCatalogChecksum(catalog),
      projectsFingerprint: computeProjectsFingerprint(projects),
    });
    expect(fresh.fresh).toBe(true);
    // Stale once the catalog moved (a different checksum).
    const stale = validateImpactPreviewFreshness(preview, {
      catalogChecksum: 'deadbeefdeadbeef',
      projectsFingerprint: computeProjectsFingerprint(projects),
    });
    expect(stale.fresh).toBe(false);
    expect(stale.reasons.join(' ')).toMatch(/catalog/i);
  });

  it('an unauthorized workflow attempt is refused at step 1 (AUTHORIZE)', () => {
    const result = executeGlobalPriceChange({
      identity: ORDINARY,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the unauthorized attempt to fail');
    expect(result.failedAt).toBe('AUTHORIZE');
  });
});

// ---------------------------------------------------------------------------
// §13 needs — regression tests for what §14 implemented
// ---------------------------------------------------------------------------

describe('§13 need #2 — snapshot capture at adoption approval + QTO read loop', () => {
  function approveWithCatalog(): ReturnType<typeof approveAdoption> {
    const input = snapshotProjectAB();
    const project = makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' });
    const adoption = previewAdoption({
      project: input,
      change: {
        kind: 'MASTER_PRICE_CHANGE' as const,
        targetMasterPriceVersion: '2026.2',
        priceChanges: [l01Change()],
        catalogItems: smallCatalog(),
      },
      computedAt: T1,
    });
    return approveAdoption({
      adoption,
      currentProjectInput: input,
      project,
      versions: [],
      reason: REASON,
      actor: 'fixture-owner',
      now: T2,
      currentPrices: new Map([[priceChangeKey(l01Change()), 110000]]),
      catalogItems: smallCatalog(),
      idGenerator: () => 'FIXTURE-VERSION-ADOPTED',
    });
  }

  it('the created version carries the captured component-price map (adopted prices)', () => {
    const result = approveWithCatalog();
    const snap = result.created.componentPriceSnapshot;
    expect(snap).toBeDefined();
    expect(snap?.estimateVersionId).toBe('FIXTURE-VERSION-ADOPTED');
    expect(snap?.masterPriceVersion).toBe('2026.2');
    expect(snap?.ahspDatabaseVersion).toBe('2026.1');
    // The changed key carries the ADOPTED price; unchanged keys the live price.
    expect(snap?.pricesByComponentKey['L01|OH']).toBe(110000);
    expect(snap?.pricesByComponentKey['L02|OH']).toBe(145000);
    expect(Object.keys(snap?.pricesByComponentKey ?? {}).length).toBe(18);
    // The map travels in the returned version list (the persisted copy).
    const inList = result.versions.find((v) => v.id === result.created.id);
    expect(inList?.componentPriceSnapshot?.pricesByComponentKey['L01|OH']).toBe(110000);
  });

  it('QTO SNAPSHOT resolves the frozen price from the map (721.816), live stays 715.816', () => {
    const result = approveWithCatalog();
    const ref = buildSnapshotRefFromProject(result.project, result.versions);
    expect(ref).not.toBeNull();
    expect(ref?.pricesByComponentKey['L01|OH']).toBe(110000);
    const ctx = buildProjectPricingContext({ mode: 'SNAPSHOT_PRICE', snapshotRef: ref });
    const frozen = priceResolver2026.resolveAhspUnitPrice(realItem('1.1.1.1'), { pricingContext: ctx });
    expect(frozen.unitPrice).toBe(721816);
    const live = priceResolver2026.resolveAhspUnitPrice(realItem('1.1.1.1'));
    expect(live.unitPrice).toBe(715816);
  });

  it('without catalog items no map is captured (backward compatible — honest absence)', () => {
    const input = snapshotProjectAB();
    const project = makeProjectRecord({ pricingMode: 'SNAPSHOT_PRICE' });
    const adoption = previewAdoption({
      project: input,
      change: {
        kind: 'MASTER_PRICE_CHANGE' as const,
        targetMasterPriceVersion: '2026.2',
        priceChanges: [l01Change()],
        catalogItems: smallCatalog(),
      },
      computedAt: T1,
    });
    const result = approveAdoption({
      adoption,
      currentProjectInput: input,
      project,
      versions: [],
      reason: REASON,
      now: T2,
      currentPrices: new Map([[priceChangeKey(l01Change()), 110000]]),
      idGenerator: () => 'FIXTURE-VERSION-NO-CATALOG',
    });
    expect(result.created.componentPriceSnapshot).toBeUndefined();
  });
});

describe('§13 need #11 — baseline-from-store (chained change against a diverged store)', () => {
  it('chained change 110.000 → 120.000 with store baseline 110.000 shows +6.000, not +12.000', () => {
    const change: MasterPriceChangeInput = { ...l01Change(), oldPrice: 110000, newPrice: 120000 };
    const key = priceChangeKey(change);
    const preview = computeMasterPriceImpact({
      priceChanges: [change],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      baselineOverride: new Map([[key, 110000]]),
    });
    expect(preview.status).toBe('COMPUTED');
    const a = preview.items.changed.find((i) => i.code === '1.1.1.1');
    expect(a?.oldUnitPrice).toBe(721816);
    expect(a?.newUnitPrice).toBe(727816);
    expect(a?.delta).toBe(6000);
    expect(preview.projects.projects[0].deltaGrandTotal).toBe(60000);
    const ref = preview.components.affected.find(
      (r) => r.itemCode === '1.1.1.1' && r.resourceKey === key,
    );
    expect(ref?.oldPrice).toBe(110000);
    expect(ref?.deltaPerUnit).toBe(6000);
  });

  it('without the baseline override the same chained change fails the baseline check', () => {
    const change: MasterPriceChangeInput = { ...l01Change(), oldPrice: 110000, newPrice: 120000 };
    const preview = computeMasterPriceImpact({
      priceChanges: [change],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
    });
    expect(preview.status).toBe('NOT_COMPUTED');
    expect(preview.notComputedReasons.join(' ')).toMatch(/baseline mismatch/);
  });

  it('the baseline is honored parametrically (store 105.000 → delta +9.000)', () => {
    const change: MasterPriceChangeInput = { ...l01Change(), oldPrice: 105000, newPrice: 120000 };
    const key = priceChangeKey(change);
    const preview = computeMasterPriceImpact({
      priceChanges: [change],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      baselineOverride: new Map([[key, 105000]]),
    });
    expect(preview.status).toBe('COMPUTED');
    const a = preview.items.changed.find((i) => i.code === '1.1.1.1');
    expect(a?.oldUnitPrice).toBe(718816);
    expect(a?.delta).toBe(9000);
  });
});

describe('§13 need #6 — price-change feed (pure functions; the CLI is verified live)', () => {
  function feedInput(over: Partial<PriceChangeFeedInput> = {}): PriceChangeFeedInput {
    return {
      resourceCode: 'L.01',
      resourceId: 'RES-L01',
      resourceName: 'Pekerja',
      category: 'LABOR',
      unit: 'OH',
      oldPrice: 100000,
      newPrice: 110000,
      region: null,
      source: null,
      changedAt: '2026-11-16T01:00:00.000Z',
      changedBy: 'admin-uuid-1',
      reason: 'Feed fixture reason (long enough)',
      masterPriceVersion: '2026.1',
      historyEntryId: null,
      sourceKind: 'SYNC',
      ...over,
    };
  }

  it('entry ids are deterministic content hashes (same input → same id)', () => {
    const a = buildPriceChangeFeedEntry(feedInput());
    const b = buildPriceChangeFeedEntry(feedInput());
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^PCF-[0-9a-f]{16}$/);
    const c = buildPriceChangeFeedEntry(feedInput({ newPrice: 120000 }));
    expect(c.id).not.toBe(a.id);
  });

  it('the BASELINE marker entry is built with the documented shape', () => {
    const entry = buildBaselineFeedEntry(T0, '2026.1');
    expect(entry.resourceCode).toBe('BASELINE');
    expect(entry.sourceKind).toBe('BASELINE');
    expect(entry.oldPrice).toBeNull();
    expect(entry.newPrice).toBeNull();
    expect(entry.masterPriceVersion).toBe('2026.1');
  });

  it('seedFeedFromHistory skips §4.4 entries without a resourceCode (with reasons, never silent)', () => {
    const history = baselineHistory();
    const { entries, skipped } = seedFeedFromHistory(history, T0);
    // The seeded feed is exactly the BASELINE marker (the history's
    // BASELINE entry itself is skipped as a marker — no price change).
    expect(entries).toHaveLength(1);
    expect(entries[0].resourceCode).toBe('BASELINE');
    expect(entries[0].sourceKind).toBe('BASELINE');
    expect(skipped).toHaveLength(1);
    expect(skipped[0].historyEntryId).toBe(history[0].id);
    expect(skipped[0].operation).toBe('BASELINE');
    expect(skipped[0].reason).toContain('marker entry');
  });

  it('validation refuses a short reason / missing code (fail-closed)', () => {
    expect(() => buildPriceChangeFeedEntry(feedInput({ reason: 'short' }))).toThrow(/at least 10/);
    expect(() => buildPriceChangeFeedEntry(feedInput({ resourceCode: '' }))).toThrow(/resourceCode is required/);
  });
});

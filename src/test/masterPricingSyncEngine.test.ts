/**
 * §13 SYNC ENGINE — the synchronization engine (Master Pricing program).
 *
 * What this suite pins (§13.1–§13.4 + the ten capabilities):
 * - (A) §13.4 sync history: all 13 fields, append-only, JSONL round-trip.
 * - (B) §13.1 idempotency + incremental sync: the row-set digest equals
 *       the pipeline's `activeRowDigest` (same algorithm, same input);
 *       diffs are keyed by stable row id; a re-run is a no-op.
 * - (C) §13 (7) conflict detection: source-priority resolution, ties
 *       UNRESOLVED (never an arbitrary pick), exact duplicates reported.
 * - (D) §13 (9) retry: bounded, deterministic, no timers.
 * - (E) §13 (10) recoverable workflow: compensations in reverse order,
 *       a failed compensation never masks the original failure.
 * - (F) §13.2 the ten-step global price change: happy path (all 10
 *       steps, verified completion), authorization / validation /
 *       stale-preview / NOT_COMPUTED refusals with NO partial update,
 *       injected failure → rollback, rollback restores the old price,
 *       re-running the same change → BASELINE_MISMATCH (0 duplicates).
 * - (G) §13.3 cache invalidation: all 8 layers enumerated, the resolver
 *       composition cache invalidated (object identity + generation),
 *       the canonical read after sync returns the new value.
 * - (H) §13 (5) AHSP version sync: snapshot loading (pure builder +
 *       disk loader over the REAL versions dir, read-only), checksum
 *       mismatch refused, interop with the §10 versioned source,
 *       Postgres pointer-sync SQL (pure builder).
 * - (I) price-change feed: format, since-pin, conversion to §10
 *       adoption inputs, seeding from §4.4 (BASELINE only — §4.4
 *       entries carry no resourceCode), numeric version comparison.
 * - (K) §12 secondaries: #2 sanity base-unit normalization, #3
 *       heuristic-anchor same-dimension conversion, #4 project
 *       snapshot-ref builder.
 * - (L) sync admin gate: denied honestly (anonymous/demo/ordinary),
 *       allowed for a test admin, CLI commands exposed.
 *
 * NOT in vitest (exec proofs, in the §13 report): the pipeline
 * dry-run (0 writes, md5-verified) and the live idempotency proof
 * (two live runs: generated modules byte-identical modulo embedded
 * timestamps; second sync a NO-OP). The full pipeline is too heavy
 * for a unit suite and its proof is a file-level comparison.
 *
 * Fixture facts (probed 2026-11-16, pinned here — same §9 fixtures):
 * - Item 1.1.1.1 (CK): FULL, Rp715.816; L.01 Pekerja OH x0,6 @100.000.
 * - L.01 100.000 → 110.000 moves ONLY 1.1.1.1 in [A,B,C]:
 *   715.816 → 721.816 (+6.000); project AB 8.313.664 → 8.373.664.
 * - Pinned v2026.1 checksums: CK e0b539f134f8d64c, BM 08082e878d4f0e90,
 *   SDA 1c4794f9ec5dc3e1, SMKK e77bbc73b1fea331.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AHSP_FAMILIES,
  buildRegistryState,
  buildVersionSnapshot,
  computeAhspContentChecksum,
  type AhspFamily,
  type AhspVersionRecord,
} from '../data/nationalCostDatabase/ahspVersioning';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import {
  MASTER_PRICE_VERSION,
  type ProjectPriceSnapshotMap,
  type ResourcePriceRecord,
} from '../data/priceDatabase2026/types';
import { aiPriceEstimationEngine } from '../ded-rab-v2/pricing/aiPriceEstimationEngine';
import {
  currentLocalIdentity,
  SERVER_ENFORCEMENT_STATUS,
  type MasterPriceIdentity,
} from '../engine/pricing/admin/masterPriceAuthorization';
import {
  appendHistoryEntry,
  buildHistoryEntry,
  type MasterPriceHistoryEntry,
} from '../engine/pricing/admin/masterPriceHistory';
import type { MasterPriceWriteInput } from '../engine/pricing/admin/masterPriceRecord';
import { priceSanityValidator } from '../engine/pricing/canonical/priceSanityValidator';
import {
  priceChangeKey,
  type MasterPriceChangeInput,
  type ProjectImpactInput,
} from '../engine/pricing/impact/masterPriceImpactPreview';
import {
  buildSnapshotRefFromProject,
  createVersionedCatalogSource,
  findActiveEstimateVersion,
} from '../engine/pricing/projectPriceModes';
import {
  appendPriceChangeFeedEntry,
  buildBaselineFeedEntry,
  buildPriceChangeFeedEntry,
  buildPriceChangeFeedJsonlHeader,
  compareMasterPriceVersions,
  feedEntriesToChangeInputs,
  parsePriceChangeFeedJsonl,
  readPriceChangesSince,
  seedFeedFromHistory,
  serializePriceChangeFeedEntryJsonl,
  serializePriceChangeFeedHeaderJsonl,
  validatePriceChangeFeedEntries,
  type PriceChangeFeedEntry,
} from '../engine/pricing/sync/priceChangeFeed';
import {
  buildPostgresPointerSyncSql,
  postgresFamilyFor,
  postgresVersionRowId,
} from '../engine/pricing/sync/postgresPointerSync';
import {
  asAhspVersionSnapshot,
  buildVersionedContents,
} from '../engine/pricing/sync/snapshotContents';
import {
  createSyncMasterPriceStore,
  detectPriceConflicts,
  diffPriceRowSets,
  executeGlobalPriceChange,
  GLOBAL_PRICE_CHANGE_STEPS,
  invalidateSyncCaches,
  invertMasterPriceChange,
  invertMasterPriceImpactPreview,
  priceRowSetDigest,
  rollbackGlobalPriceChange,
  runRecoverableWorkflow,
  runWithRetry,
  SYNC_CACHE_LAYERS,
  verifyRollbackComplete,
  type SyncMasterPriceStore,
} from '../engine/pricing/sync/syncEngine';
import {
  appendSyncHistoryEntry,
  buildSyncHistoryEntry,
  buildSyncHistoryJsonlHeader,
  parseSyncHistoryJsonl,
  serializeSyncHistoryEntryJsonl,
  serializeSyncHistoryHeaderJsonl,
  SYNC_HISTORY_SCHEMA_VERSION,
  SYNC_OPERATION_TYPES,
  SYNC_RECOVERY_STATUSES,
  validateSyncHistoryEntries,
  type SyncHistoryEntry,
} from '../engine/pricing/sync/syncHistory';
import {
  SYNC_CLI_COMMAND,
  SYNC_CLI_DRY_RUN_COMMAND,
  SYNC_CLI_POINTER_SYNC_COMMAND,
  syncAdminGate,
} from '../engine/pricing/sync/syncUiLogic';
import type { EstimateVersion, Project, RabItem } from '../types';
import {
  loadAhspVersionSnapshots,
  readActiveVersionRecords,
} from '../../scripts/ahsp2026/loadAhspVersionSnapshots';
import { activeRowDigest } from '../../scripts/price2026/normalizePrices';
import { PRICE_SOURCES } from '../../scripts/price2026/sources.config';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = '2026-11-16T00:00:00.000Z';
const T1 = '2026-11-16T01:00:00.000Z';
const T2 = '2026-11-16T02:00:00.000Z';
const REASON = 'Sync engine fixture: a long enough reason for testing';

const ADMIN: MasterPriceIdentity = { kind: 'authenticated', userId: 'admin-uuid-1', isGlobalAdmin: true };
const ORDINARY: MasterPriceIdentity = { kind: 'authenticated', userId: 'user-uuid-1', isGlobalAdmin: false };
const ANON: MasterPriceIdentity = { kind: 'anonymous' };
const DEMO: MasterPriceIdentity = { kind: 'demo', role: 'qs' };

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

/** Minimal valid price record (values are test fixtures, not prices). */
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

/** The L.01 store record: Pekerja OH @ Rp100.000 (the live master's price, pinned by §9). */
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

/** A store seeded with the L.01 record (the workflow's sync target). */
function l01Store(): SyncMasterPriceStore {
  return createSyncMasterPriceStore([l01Record()]);
}

/** The §4 write input for the L.01 change (price MUST equal change.newPrice). */
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

/** The §4.4 history chain with only the BASELINE marker (the honest starting state). */
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

/** A valid sync-history input (all 13 §13.4 fields). */
function makeSyncInput(over: Partial<Omit<SyncHistoryEntry, 'operationId' | 'schemaVersion'>> = {}): Omit<SyncHistoryEntry, 'operationId' | 'schemaVersion'> {
  return {
    operationType: 'GLOBAL_PRICE_PROPAGATION',
    initiatedBy: 'admin-uuid-1',
    sourceEntity: 'price:L01|OH',
    previousValue: 100000,
    newValue: 110000,
    affectedAhspFamilies: ['CIPTA_KARYA'],
    affectedComponents: ['L01|OH'],
    affectedProjects: ['FIXTURE-P-LIVE'],
    successfulOperations: 10,
    failedOperations: 0,
    unresolvedConflicts: [],
    completedAt: T1,
    recoveryStatus: 'NOT_NEEDED',
    ...over,
  };
}

/** A valid feed input for the L.01 change. */
function makeFeedInput(over: Partial<Omit<PriceChangeFeedEntry, 'id' | 'schemaVersion'>> = {}): Omit<PriceChangeFeedEntry, 'id' | 'schemaVersion'> {
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
    changedAt: T1,
    changedBy: 'admin-uuid-1',
    reason: REASON,
    masterPriceVersion: '2026.1',
    historyEntryId: null,
    sourceKind: 'SYNC',
    ...over,
  };
}

/** The §13 active predicate: a row is active when its source is active (mirrors the pipeline). */
function isActiveSourceRow(row: ResourcePriceRecord): boolean {
  return PRICE_SOURCES.find((s) => s.key === row.sourceKey)?.active ?? false;
}

// Pinned v2026.1 content checksums (§8).
const PINNED_CHECKSUMS: Record<AhspFamily, string> = {
  CIPTA_KARYA: 'e0b539f134f8d64c',
  BINA_MARGA: '08082e878d4f0e90',
  SUMBER_DAYA_AIR: '1c4794f9ec5dc3e1',
  SMKK: 'e77bbc73b1fea331',
};

// ===========================================================================
// (A) §13.4 — sync history
// ===========================================================================

describe('§13.4 — sync history (all 13 fields, append-only, JSONL)', () => {
  it('the operation vocabulary is exactly the 8 §13 operation types', () => {
    expect([...SYNC_OPERATION_TYPES]).toEqual([
      'FULL_RECONCILIATION',
      'INCREMENTAL_SYNC',
      'ADMIN_TRIGGERED_SYNC',
      'GLOBAL_PRICE_PROPAGATION',
      'AHSP_VERSION_SYNC',
      'DRY_RUN',
      'ROLLBACK',
      'RECOVERY',
    ]);
  });

  it('the recovery vocabulary is exactly the 6 §13 recovery statuses', () => {
    expect([...SYNC_RECOVERY_STATUSES]).toEqual([
      'NOT_APPLICABLE',
      'NOT_NEEDED',
      'RECOVERED',
      'ROLLBACK_APPLIED',
      'RECOVERY_FAILED',
      'RECOVERY_PENDING',
    ]);
  });

  it('builds an entry carrying all 13 §13.4 fields + a deterministic SYN- id', () => {
    const entry = buildSyncHistoryEntry(makeSyncInput());
    expect(entry.operationId).toMatch(/^SYN-[0-9a-f]{16}$/);
    expect(entry.schemaVersion).toBe(SYNC_HISTORY_SCHEMA_VERSION);
    expect(entry.operationType).toBe('GLOBAL_PRICE_PROPAGATION');
    expect(entry.initiatedBy).toBe('admin-uuid-1');
    expect(entry.sourceEntity).toBe('price:L01|OH');
    expect(entry.previousValue).toBe(100000);
    expect(entry.newValue).toBe(110000);
    expect(entry.affectedAhspFamilies).toEqual(['CIPTA_KARYA']);
    expect(entry.affectedComponents).toEqual(['L01|OH']);
    expect(entry.affectedProjects).toEqual(['FIXTURE-P-LIVE']);
    expect(entry.successfulOperations).toBe(10);
    expect(entry.failedOperations).toBe(0);
    expect(entry.unresolvedConflicts).toEqual([]);
    expect(entry.completedAt).toBe(T1);
    expect(entry.recoveryStatus).toBe('NOT_NEEDED');
    // Deterministic: the same input builds the same id (idempotent re-writes).
    expect(buildSyncHistoryEntry(makeSyncInput()).operationId).toBe(entry.operationId);
    // Frozen: the entry cannot be rewritten in memory.
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('refuses invalid entries (bad timestamp, negative counts, unknown operation)', () => {
    expect(() => buildSyncHistoryEntry(makeSyncInput({ completedAt: 'not-a-date' }))).toThrow();
    expect(() => buildSyncHistoryEntry(makeSyncInput({ successfulOperations: -1 }))).toThrow();
    expect(() => buildSyncHistoryEntry(makeSyncInput({ previousValue: -5 }))).toThrow();
    expect(() =>
      buildSyncHistoryEntry(makeSyncInput({ operationType: 'BOGUS' as never })),
    ).toThrow();
    expect(() =>
      buildSyncHistoryEntry(makeSyncInput({ recoveryStatus: 'BOGUS' as never })),
    ).toThrow();
  });

  it('append-only: append returns a NEW array and refuses duplicate ids', () => {
    const first = buildSyncHistoryEntry(makeSyncInput());
    const chain: readonly SyncHistoryEntry[] = [];
    const next = appendSyncHistoryEntry(chain, first);
    expect(chain).toHaveLength(0);
    expect(next).toHaveLength(1);
    expect(next[0]).toBe(first);
    expect(() => appendSyncHistoryEntry(next, first)).toThrow(/Duplicate/);
  });

  it('validates a chain (duplicate ids + schema versions)', () => {
    const first = buildSyncHistoryEntry(makeSyncInput());
    const second = buildSyncHistoryEntry(makeSyncInput({ completedAt: T2, newValue: 120000 }));
    expect(validateSyncHistoryEntries([first, second]).valid).toBe(true);
    expect(validateSyncHistoryEntries([first, first]).valid).toBe(false);
  });

  it('JSONL round-trips (header + entries) and reports malformed lines', () => {
    const header = buildSyncHistoryJsonlHeader(T0);
    const entry = buildSyncHistoryEntry(makeSyncInput());
    const text = [serializeSyncHistoryHeaderJsonl(header), serializeSyncHistoryEntryJsonl(entry)].join('\n');
    const parsed = parseSyncHistoryJsonl(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.header?.kind).toBe('HEADER');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].operationId).toBe(entry.operationId);
    // A malformed line is REPORTED, never silently dropped.
    const broken = parseSyncHistoryJsonl(`${text}\n{not json`);
    expect(broken.entries).toHaveLength(1);
    expect(broken.errors).toHaveLength(1);
    expect(broken.errors[0]).toContain('3');
  });
});

// ===========================================================================
// (B) §13.1 — idempotency + incremental diff
// ===========================================================================

describe('§13.1 — idempotency: stable ids + the pipeline digest', () => {
  it('priceRowSetDigest EQUALS the pipeline activeRowDigest on the same rows', () => {
    const rows = [
      makeRecord({ id: 'PRC-HSD_2026-A', sourceKey: 'HSD_2026', price: 1000 }),
      makeRecord({ id: 'PRC-LABOR_2026-B', sourceKey: 'LABOR_2026', price: 2000 }),
      // An INACTIVE source row must not move the digest in either implementation.
      makeRecord({ id: 'PRC-LEGACY_PUPR_2022-C', sourceKey: 'LEGACY_PUPR_2022', price: 999999 }),
    ];
    expect(priceRowSetDigest(rows, isActiveSourceRow)).toBe(activeRowDigest(rows));
    // And the inactive row alone does not change the digest.
    expect(priceRowSetDigest(rows.slice(0, 2), isActiveSourceRow)).toBe(activeRowDigest(rows));
  });

  it('diffPriceRowSets keys by stable row id (added / removed / changed / unchanged)', () => {
    const a = makeRecord({ id: 'PRC-A', price: 1000 });
    const b = makeRecord({ id: 'PRC-B', price: 2000 });
    const bChanged = makeRecord({ id: 'PRC-B', price: 2500 });
    const c = makeRecord({ id: 'PRC-C', price: 3000 });
    const diff = diffPriceRowSets([a, b], [a, bChanged, c], isActiveSourceRow);
    expect(diff.added.map((r) => r.id)).toEqual(['PRC-C']);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.map((r) => r.id)).toEqual(['PRC-B']);
    expect(diff.changed[0].changedFields).toContain('price');
    expect(diff.unchangedCount).toBe(1);
    expect(diff.unchanged).toBe(false);
    expect(diff.digestBefore).not.toBe(diff.digestAfter);
    // A re-run over identical sets is a no-op (byte-identical digest).
    const rerun = diffPriceRowSets([a, b], [a, b], isActiveSourceRow);
    expect(rerun.unchanged).toBe(true);
    expect(rerun.added).toEqual([]);
    expect(rerun.removed).toEqual([]);
    expect(rerun.changed).toEqual([]);
    expect(rerun.unchangedCount).toBe(2);
  });

  it('a removed row is reported (never silently dropped)', () => {
    const a = makeRecord({ id: 'PRC-A', price: 1000 });
    const b = makeRecord({ id: 'PRC-B', price: 2000 });
    const diff = diffPriceRowSets([a, b], [a], isActiveSourceRow);
    expect(diff.removed.map((r) => r.id)).toEqual(['PRC-B']);
    expect(diff.unchangedCount).toBe(1);
  });
});

// ===========================================================================
// (C) §13 (7) — conflict detection
// ===========================================================================

describe('§13 (7) — conflict detection (source priority, ties unresolved)', () => {
  function conflictRows(): ResourcePriceRecord[] {
    return [
      makeRecord({
        id: 'PRC-HSD_2026-X',
        resourceId: 'RES-X',
        resourceCode: 'M01',
        unit: 'kg',
        price: 1500,
        sourceKey: 'HSD_2026',
        sourcePriority: 1,
      }),
      makeRecord({
        id: 'PRC-COMMERCIAL_2026-X',
        resourceId: 'RES-X',
        resourceCode: 'M01',
        unit: 'kg',
        price: 1800,
        sourceKey: 'COMMERCIAL_2026',
        sourcePriority: 6,
      }),
    ];
  }

  it('resolves a price conflict by source priority (lowest wins, never silently dropped)', () => {
    const report = detectPriceConflicts(conflictRows());
    expect(report.conflicts).toHaveLength(1);
    expect(report.unresolved).toHaveLength(0);
    const c = report.conflicts[0];
    expect(c.resolution).toBe('SOURCE_PRIORITY');
    expect(c.preferred?.sourceKey).toBe('HSD_2026');
    expect(c.preferred?.price).toBe(1500);
    expect(c.candidates).toHaveLength(2);
  });

  it('a priority TIE with different prices is UNRESOLVED (never an arbitrary pick)', () => {
    const rows = conflictRows();
    rows[1] = { ...rows[1], sourcePriority: 1 };
    const report = detectPriceConflicts(rows);
    expect(report.conflicts).toHaveLength(1);
    expect(report.unresolved).toHaveLength(1);
    expect(report.conflicts[0].resolution).toBe('UNRESOLVED_PRIORITY_TIE');
    expect(report.conflicts[0].preferred).toBeNull();
  });

  it('the same price from two sources is NOT a conflict', () => {
    const rows = conflictRows();
    rows[1] = { ...rows[1], price: 1500 };
    const report = detectPriceConflicts(rows);
    expect(report.conflicts).toHaveLength(0);
  });

  it('exact duplicates (same identity INCLUDING sourceKey) are reported separately', () => {
    const a = makeRecord({ id: 'PRC-DUP-1', resourceId: 'RES-D', sourceKey: 'HSD_2026' });
    const b = makeRecord({ id: 'PRC-DUP-2', resourceId: 'RES-D', sourceKey: 'HSD_2026' });
    const report = detectPriceConflicts([a, b]);
    expect(report.exactDuplicateGroups).toHaveLength(1);
    expect(report.exactDuplicateGroups[0].count).toBe(2);
    expect(report.exactDuplicateGroups[0].ids).toEqual(['PRC-DUP-1', 'PRC-DUP-2']);
  });
});

// ===========================================================================
// (D) §13 (9) — retry
// ===========================================================================

describe('§13 (9) — retry (bounded, deterministic, no timers)', () => {
  it('succeeds on the first try with 1 attempt and no errors', () => {
    const out = runWithRetry(() => 42, { maxAttempts: 3, label: 'test' });
    expect(out).toEqual({ result: 42, attempts: 1, attemptErrors: [] });
  });

  it('retries a transient failure and records the failed attempt', () => {
    let calls = 0;
    const out = runWithRetry(
      () => {
        calls++;
        if (calls === 1) throw new Error('transient boom');
        return 'ok';
      },
      { maxAttempts: 3, label: 'test' },
    );
    expect(out.result).toBe('ok');
    expect(out.attempts).toBe(2);
    expect(out.attemptErrors).toEqual(['transient boom']);
  });

  it('throws the LAST error when attempts run out', () => {
    expect(() =>
      runWithRetry(
        () => {
          throw new Error('always boom');
        },
        { maxAttempts: 2, label: 'test' },
      ),
    ).toThrow('always boom');
  });

  it('never retries a non-retryable error (deterministic refusal)', () => {
    let calls = 0;
    expect(() =>
      runWithRetry(
        () => {
          calls++;
          throw new Error('price REMOVAL refused');
        },
        { maxAttempts: 3, isRetryable: (e) => !String(e).includes('REMOVAL'), label: 'test' },
      ),
    ).toThrow('price REMOVAL refused');
    expect(calls).toBe(1);
  });
});

// ===========================================================================
// (E) §13 (10) — recoverable workflow
// ===========================================================================

describe('§13 (10) — recoverable workflow (compensations in reverse order)', () => {
  it('runs all steps and reports success with no compensations', () => {
    const ran: string[] = [];
    const result = runRecoverableWorkflow([
      { name: 'A', run: () => ran.push('A') },
      { name: 'B', run: () => ran.push('B') },
    ]);
    expect(result.ok).toBe(true);
    expect(result.completedSteps).toEqual(['A', 'B']);
    expect(result.failedStep).toBeNull();
    expect(result.compensations).toEqual([]);
    expect(result.recoveryStatus).toBe('NOT_NEEDED');
  });

  it('compensates completed steps in REVERSE order on failure', () => {
    const order: string[] = [];
    const result = runRecoverableWorkflow([
      { name: 'A', run: () => order.push('A'), compensate: () => order.push('undo-A') },
      { name: 'B', run: () => order.push('B'), compensate: () => order.push('undo-B') },
      {
        name: 'C',
        run: () => {
          throw new Error('C failed');
        },
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe('C');
    expect(result.failureReason).toBe('C failed');
    expect(result.completedSteps).toEqual(['A', 'B']);
    expect(order).toEqual(['A', 'B', 'undo-B', 'undo-A']);
    expect(result.compensations.map((c) => c.step)).toEqual(['B', 'A']);
    expect(result.compensations.every((c) => c.ok)).toBe(true);
    expect(result.recoveryStatus).toBe('ROLLBACK_APPLIED');
  });

  it('a compensation that throws is recorded and never masks the original failure', () => {
    const result = runRecoverableWorkflow([
      {
        name: 'A',
        run: () => undefined,
        compensate: () => {
          throw new Error('undo-A failed');
        },
      },
      {
        name: 'B',
        run: () => {
          throw new Error('B failed');
        },
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe('B failed');
    expect(result.compensations).toEqual([{ step: 'A', ok: false, reason: 'undo-A failed' }]);
    expect(result.recoveryStatus).toBe('RECOVERY_FAILED');
  });
});

// ===========================================================================
// (F) §13.2 — the ten-step global price change workflow
// ===========================================================================

describe('§13.2 — the ten-step global price change workflow', () => {
  it('the step list is exactly the 10 specified steps, in order', () => {
    expect([...GLOBAL_PRICE_CHANGE_STEPS]).toEqual([
      'AUTHORIZE',
      'VALIDATE_PRICE',
      'COMPUTE_IMPACT',
      'VERIFY_PREVIEW_FRESH',
      'WRITE_HISTORY',
      'UPDATE_MASTER_PRICE',
      'INVALIDATE_CACHES',
      'RECALC_DERIVED',
      'RECORD_OPERATION',
      'RETURN_VERIFIED_RESULT',
    ]);
  });

  it('happy path: L.01 100.000 → 110.000 through all 10 steps, verified', () => {
    const store = l01Store();
    const history = baselineHistory();
    const result = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      store,
      history,
      feed: [],
      now: T1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    // All 10 steps OK, in order.
    expect(result.steps.map((s) => s.step)).toEqual([...GLOBAL_PRICE_CHANGE_STEPS]);
    expect(result.steps.every((s) => s.status === 'OK')).toBe(true);
    // The store moved: the canonical read returns the NEW price.
    expect(result.store.readPrice('L.01', 'OH')).toBe(110000);
    expect(result.store).not.toBe(store);
    // The old record is SUPERSEDED, never overwritten (a new v2 record exists).
    const records = result.store.records;
    expect(records).toHaveLength(2);
    const old = records.find((r) => r.id === l01Record().id);
    const next = records.find((r) => r.id !== l01Record().id);
    expect(old?.status).toBe('SUPERSEDED');
    expect(old?.price).toBe(100000);
    expect(next?.status).toBe('ACTIVE');
    expect(next?.price).toBe(110000);
    expect(next?.version).toBe(2);
    // The §4.4 history gained one UPDATE entry (operation + versions + impact).
    expect(result.history).toHaveLength(2);
    expect(result.historyEntry.operation).toBe('UPDATE');
    expect(result.historyEntry.previousAmount).toBe(100000);
    expect(result.historyEntry.newAmount).toBe(110000);
    expect(result.historyEntry.previousVersion).toBe(1);
    expect(result.historyEntry.newVersion).toBe(2);
    expect(result.historyEntry.adminIdentity).toBe('admin-uuid-1');
    expect(result.historyEntry.affectedAhspReferences).toContain('1.1.1.1');
    expect(result.historyEntry.affectedLivePriceProjects).toContain('FIXTURE-P-LIVE');
    // The feed gained one SYNC entry linked to the history entry.
    expect(result.feed).toHaveLength(1);
    expect(result.feed[0].sourceKind).toBe('SYNC');
    expect(result.feed[0].resourceCode).toBe('L.01');
    expect(result.feed[0].historyEntryId).toBe(result.historyEntry.id);
    // The sync history entry carries the §13.4 fields for this operation.
    expect(result.syncHistoryEntry.operationType).toBe('GLOBAL_PRICE_PROPAGATION');
    expect(result.syncHistoryEntry.initiatedBy).toBe('admin-uuid-1');
    expect(result.syncHistoryEntry.sourceEntity).toBe(`price:${priceChangeKey(l01Change())}`);
    expect(result.syncHistoryEntry.previousValue).toBe(100000);
    expect(result.syncHistoryEntry.newValue).toBe(110000);
    expect(result.syncHistoryEntry.successfulOperations).toBe(10);
    expect(result.syncHistoryEntry.failedOperations).toBe(0);
    expect(result.syncHistoryEntry.recoveryStatus).toBe('NOT_NEEDED');
    expect(result.operationId).toBe(result.syncHistoryEntry.operationId);
    // The impact preview is the §9 computation (pinned numbers).
    expect(result.preview.status).toBe('COMPUTED');
    const item = result.preview.items.changed.find((i) => i.code === '1.1.1.1');
    expect(item?.oldUnitPrice).toBe(715816);
    expect(item?.newUnitPrice).toBe(721816);
    expect(item?.delta).toBe(6000);
    const project = result.preview.projects.projects.find((p) => p.projectId === 'FIXTURE-P-LIVE');
    expect(project?.oldGrandTotal).toBe(8313664);
    expect(project?.newGrandTotal).toBe(8373664);
    // Verification: the canonical read after sync = the new price.
    expect(result.verification.readsVerified).toEqual([
      { key: priceChangeKey(l01Change()), expected: 110000, actual: 110000, ok: true },
    ]);
    expect(result.verification.affectedAhspItemCount).toBe(1);
    expect(result.verification.affectedProjectCount).toBe(1);
  });

  it('authorization denial (anonymous / demo / ordinary) aborts BEFORE any write', () => {
    for (const identity of [ANON, DEMO, ORDINARY]) {
      const store = l01Store();
      const history = baselineHistory();
      const result = executeGlobalPriceChange({
        identity,
        change: l01Change(),
        write: l01WriteInput(),
        catalogItems: smallCatalog(),
        projects: [],
        store,
        history,
        feed: [],
        now: T1,
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected denial');
      expect(result.failedAt).toBe('AUTHORIZE');
      expect(result.reason).toContain('DENIED');
      // NO partial update: the ORIGINAL store/history/feed are returned.
      expect(result.store).toBe(store);
      expect(result.history).toBe(history);
      expect(result.feed).toEqual([]);
      expect(result.store.readPrice('L.01', 'OH')).toBe(100000);
      expect(result.syncHistoryEntry.failedOperations).toBe(1);
      expect(result.syncHistoryEntry.successfulOperations).toBe(0);
      expect(result.recoveryStatus).toBe('NOT_NEEDED');
    }
  });

  it('the honest local identity (anonymous while §4.1 is BLOCKED) is denied', () => {
    expect(SERVER_ENFORCEMENT_STATUS).toBe('BLOCKED');
    expect(currentLocalIdentity()).toEqual({ kind: 'anonymous' });
    const result = executeGlobalPriceChange({
      identity: currentLocalIdentity(),
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failedAt).toBe('AUTHORIZE');
  });

  it('an invalid price (negative / short reason / write-change mismatch) is refused at step 2', () => {
    const store = l01Store();
    const base = {
      identity: ADMIN,
      change: l01Change(),
      catalogItems: smallCatalog(),
      projects: [],
      store,
      history: baselineHistory(),
      feed: [] as readonly PriceChangeFeedEntry[],
      now: T1,
    };
    const negative = executeGlobalPriceChange({ ...base, write: l01WriteInput({ price: -1 }) });
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      // §4 write validation fires first (negative price) — either way, step 2.
      expect(negative.failedAt).toBe('VALIDATE_PRICE');
      expect(negative.store).toBe(store);
    }
    const shortReason = executeGlobalPriceChange({
      ...base,
      change: { ...l01Change(), newPrice: 110000 },
      write: l01WriteInput({ reason: 'short' }),
    });
    expect(shortReason.ok).toBe(false);
    if (!shortReason.ok) expect(shortReason.failedAt).toBe('VALIDATE_PRICE');
    const mismatch = executeGlobalPriceChange({
      ...base,
      write: l01WriteInput({ price: 115000 }),
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.failedAt).toBe('VALIDATE_PRICE');
      expect(mismatch.reason).toContain('mismatch');
    }
  });

  it('the sanity gate refuses an absurd new price (rebar range applied to a labor name stays valid)', () => {
    // 'Pekerja' @ Rp 500.000/OH exceeds the labor benchmark max (450.000) → refused.
    const result = executeGlobalPriceChange({
      identity: ADMIN,
      change: { ...l01Change(), newPrice: 500000 },
      write: l01WriteInput({ price: 500000 }),
      catalogItems: smallCatalog(),
      projects: [],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedAt).toBe('VALIDATE_PRICE');
      expect(result.reason).toContain('Sanity gate');
    }
  });

  it('a stale preview (baseline moved since the preview) is refused at step 4', () => {
    const store = l01Store();
    const result = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store,
      history: baselineHistory(),
      feed: [],
      now: T1,
      currentStateOverride: {
        currentBaselinePrices: new Map([[priceChangeKey(l01Change()), 99999]]),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedAt).toBe('VERIFY_PREVIEW_FRESH');
      expect(result.reason).toContain('stale');
      expect(result.store).toBe(store);
      expect(result.store.readPrice('L.01', 'OH')).toBe(100000);
    }
  });

  it('a removal (newPrice null) is NOT_COMPUTED at step 3 — never a fake preview', () => {
    const store = l01Store();
    const removal: MasterPriceChangeInput = { ...l01Change(), newPrice: null };
    const result = executeGlobalPriceChange({
      identity: ADMIN,
      change: removal,
      write: l01WriteInput({ price: null }),
      catalogItems: smallCatalog(),
      projects: [],
      store,
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedAt).toBe('COMPUTE_IMPACT');
      expect(result.reason).toContain('not computed');
      expect(result.store).toBe(store);
    }
  });

  it('an injected failure at step 7 rolls back: originals returned, recovery verified', () => {
    const store = l01Store();
    const history = baselineHistory();
    const feed: readonly PriceChangeFeedEntry[] = [];
    const result = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store,
      history,
      feed,
      now: T1,
      invalidateCachesFn: () => {
        throw new Error('injected cache failure');
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedAt).toBe('INVALIDATE_CACHES');
      expect(result.recoveryStatus).toBe('ROLLBACK_APPLIED');
      // The failed run returns the ORIGINALS (no partial update).
      expect(result.store).toBe(store);
      expect(result.history).toBe(history);
      expect(result.feed).toBe(feed);
      expect(result.store.readPrice('L.01', 'OH')).toBe(100000);
      // The recovery check PROVES the rollback (it does not assume it).
      const report = verifyRollbackComplete(result, l01Change(), { store, history, feed });
      expect(report.recovered).toBe(true);
      expect(report.currentPrice).toBe(100000);
      expect(report.expectedPrice).toBe(100000);
    }
  });

  it('retry: a failing-then-succeeding invalidator completes the workflow (maxAttempts 2)', () => {
    let calls = 0;
    const result = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
      maxAttempts: 2,
      invalidateCachesFn: () => {
        calls++;
        if (calls === 1) throw new Error('transient cache failure');
        return invalidateSyncCaches();
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('idempotency: re-running the same change fails at step 3 (BASELINE_MISMATCH), 0 duplicates', () => {
    const first = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected first run to succeed');
    expect(first.store.records).toHaveLength(2);
    const second = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store: first.store,
      history: first.history,
      feed: first.feed,
      now: T2,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.failedAt).toBe('COMPUTE_IMPACT');
      expect(second.reason).toContain('baseline mismatch');
      // The store is untouched by the refused re-run (still 2 records, still 110.000).
      expect(second.store).toBe(first.store);
      expect(second.store.records).toHaveLength(2);
      expect(second.store.readPrice('L.01', 'OH')).toBe(110000);
      expect(second.history).toBe(first.history);
      expect(second.feed).toBe(first.feed);
    }
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
    // The inverse preview negates the forward deltas exactly (§9 rollback pattern).
    const item = rolled.preview.items.changed.find((i) => i.code === '1.1.1.1');
    expect(item?.oldUnitPrice).toBe(721816);
    expect(item?.newUnitPrice).toBe(715816);
    expect(item?.delta).toBe(-6000);
    const project = rolled.preview.projects.projects.find((p) => p.projectId === 'FIXTURE-P-LIVE');
    expect(project?.deltaGrandTotal).toBe(-60000);
    // History + feed each gained the rollback entry (no duplicates).
    expect(rolled.history).toHaveLength(3);
    expect(rolled.feed).toHaveLength(2);
    expect(rolled.feed[1].oldPrice).toBe(110000);
    expect(rolled.feed[1].newPrice).toBe(100000);
  });

  it('rollback is refused when the price moved again since the change (fail-closed)', () => {
    const first = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected the forward change to succeed');
    // A SECOND change moves L.01 to 120.000 — the rollback of the
    // FIRST change must not run over the newer price.
    const second = executeGlobalPriceChange({
      identity: ADMIN,
      change: { ...l01Change(), oldPrice: 110000, newPrice: 120000 },
      write: l01WriteInput({ price: 120000 }),
      catalogItems: smallCatalog(),
      projects: [],
      store: first.store,
      history: first.history,
      feed: first.feed,
      now: T2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('expected the second change to succeed');
    const rolled = rollbackGlobalPriceChange({
      identity: ADMIN,
      originalPreview: first.preview,
      originalChange: l01Change(),
      write: l01WriteInput({ price: 100000, reason: 'Rollback fixture: stale rollback attempt' }),
      catalogItems: smallCatalog(),
      projects: [],
      store: second.store,
      history: second.history,
      feed: second.feed,
      now: '2026-11-16T03:00:00.000Z',
    });
    expect(rolled.ok).toBe(false);
    if (!rolled.ok) {
      expect(rolled.failedAt).toBe('COMPUTE_IMPACT');
      expect(rolled.reason).toContain('baseline mismatch');
      expect(rolled.store.readPrice('L.01', 'OH')).toBe(120000);
    }
  });

  it('invertMasterPriceImpactPreview refuses a non-COMPUTED / non-price preview', () => {
    const computed = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(computed.ok).toBe(true);
    if (!computed.ok) throw new Error('expected success');
    const stale = { ...computed.preview, status: 'STALE' as const };
    expect(() =>
      invertMasterPriceImpactPreview(stale, {
        catalogChecksum: null,
        projectsFingerprint: 'x',
        computedAt: T2,
      }),
    ).toThrow(/COMPUTED/);
    const versionKind = { ...computed.preview, kind: 'AHSP_VERSION' as const };
    expect(() =>
      invertMasterPriceImpactPreview(versionKind, {
        catalogChecksum: null,
        projectsFingerprint: 'x',
        computedAt: T2,
      }),
    ).toThrow(/MASTER_PRICE_CHANGE/);
    expect(invertMasterPriceChange(l01Change())).toEqual({
      ...l01Change(),
      oldPrice: 110000,
      newPrice: 100000,
    });
  });

  it('adding a price to an unpriced resource (CREATE) works; rolling it back is refused (removal)', () => {
    // E01|kegiatan (SMKK sewa LCD) is UNPRICED in the live master — the
    // addition fixture. The store holds no E01 record at all.
    const emptyStore = createSyncMasterPriceStore([]);
    const addition: MasterPriceChangeInput = {
      resourceCode: 'E01',
      resourceName: 'Sewa LCD proyektor & sound system kegiatan',
      category: 'EQUIPMENT',
      unit: 'kegiatan',
      oldPrice: null,
      newPrice: 500000,
    };
    const added = executeGlobalPriceChange({
      identity: ADMIN,
      change: addition,
      write: {
        resourceId: 'RES-E01',
        price: 500000,
        unit: 'kegiatan',
        location: { level: 'NATIONAL' },
        period: { year: 2026, month: null, label: '2026-Q1', effectiveFrom: '2026-01-01', effectiveTo: null },
        sourceKey: 'HSD_2026',
        reason: REASON,
      },
      catalogItems: smallCatalog(),
      projects: [],
      store: emptyStore,
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error(`expected the addition to succeed: ${added.reason}`);
    expect(added.store.readPrice('E01', 'kegiatan')).toBe(500000);
    expect(added.historyEntry.operation).toBe('CREATE');
    expect(added.historyEntry.previousAmount).toBeNull();
    // Rolling back the addition is a REMOVAL — refused at step 6 (the
    // store never silently deletes a price; removals need staged re-preview).
    const rolled = rollbackGlobalPriceChange({
      identity: ADMIN,
      originalPreview: added.preview,
      originalChange: addition,
      write: {
        resourceId: 'RES-E01',
        price: null,
        unit: 'kegiatan',
        location: { level: 'NATIONAL' },
        period: { year: 2026, month: null, label: '2026-Q1', effectiveFrom: '2026-01-01', effectiveTo: null },
        sourceKey: 'HSD_2026',
        reason: 'Rollback fixture: remove the added E01 price',
      },
      catalogItems: smallCatalog(),
      projects: [],
      store: added.store,
      history: added.history,
      feed: added.feed,
      now: T2,
    });
    expect(rolled.ok).toBe(false);
    if (!rolled.ok) {
      expect(rolled.failedAt).toBe('UPDATE_MASTER_PRICE');
      expect(rolled.reason).toContain('REMOVAL');
      expect(rolled.store.readPrice('E01', 'kegiatan')).toBe(500000);
    }
  });
});

// ===========================================================================
// (G) §13.3 — cache invalidation
// ===========================================================================

describe('§13.3 — cache invalidation (all layers, read-after-sync)', () => {
  it('enumerates all 8 cache/derived layers with their action', () => {
    expect(SYNC_CACHE_LAYERS.map((l) => l.layer)).toEqual([
      'RESOLVER_AHSP_COMPOSITION',
      'RESOLVER_INDEXES',
      'READ_PROJECTION_PRICE_REPOSITORY',
      'CANONICAL_RESOLVER',
      'DERIVED_AHSP_VALUES',
      'CATALOG_CONTENT_INDEXES',
      'PROJECT_OVERRIDES',
      'PRICE_RESEARCH_CACHE',
    ]);
    // Only the mutable composition cache is invalidated; every other
    // layer is NO_ACTION with a documented reason (never silent).
    const invalidated = SYNC_CACHE_LAYERS.filter((l) => l.action === 'INVALIDATED');
    expect(invalidated.map((l) => l.layer)).toEqual(['RESOLVER_AHSP_COMPOSITION']);
    for (const layer of SYNC_CACHE_LAYERS) {
      expect(layer.reason.length).toBeGreaterThan(10);
    }
  });

  it('invalidateSyncCaches bumps the resolver generation and reports every layer', () => {
    const before = priceResolver2026.getCacheVersion();
    const result = invalidateSyncCaches();
    expect(result.cacheVersionBefore).toBe(before);
    expect(result.cacheVersionAfter).toBe(before + 1);
    expect(result.layers).toHaveLength(8);
    expect(result.layers.find((l) => l.layer === 'RESOLVER_AHSP_COMPOSITION')?.action).toBe(
      'INVALIDATED',
    );
    expect(priceResolver2026.getCacheVersion()).toBe(before + 1);
  });

  it('a stale cached composition is recomputed after invalidation (object identity)', () => {
    const item = realItem('1.1.1.1');
    const first = priceResolver2026.resolveAhspUnitPrice(item);
    expect(first.unitPrice).toBe(715816);
    // Mutate the coefficient on a CLONE (same code → same cache key):
    // the cached composition is still served (stale by design).
    const mutated = clone(item);
    mutated.laborComponents[0].coefficient = 0.7;
    const cached = priceResolver2026.resolveAhspUnitPrice(mutated);
    expect(cached).toBe(first);
    expect(cached.unitPrice).toBe(715816);
    // Invalidate → the next read recomputes from the mutated item.
    invalidateSyncCaches();
    const fresh = priceResolver2026.resolveAhspUnitPrice(mutated);
    expect(fresh).not.toBe(first);
    expect(fresh.unitPrice).toBe(725816);
  });

  it('the workflow invalidates the cache as step 7 (generation moves on success)', () => {
    const before = priceResolver2026.getCacheVersion();
    const result = executeGlobalPriceChange({
      identity: ADMIN,
      change: l01Change(),
      write: l01WriteInput(),
      catalogItems: smallCatalog(),
      projects: [],
      store: l01Store(),
      history: baselineHistory(),
      feed: [],
      now: T1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.verification.cacheVersionBefore).toBe(before);
    expect(result.verification.cacheVersionAfter).toBe(before + 1);
    expect(priceResolver2026.getCacheVersion()).toBe(before + 1);
  });
});

// ===========================================================================
// (H) §13 (5) — AHSP version sync: snapshot loading into §10 contents
// ===========================================================================

describe('§13 (5) — AHSP version sync (snapshots → VersionedAhspCatalogSource.contents)', () => {
  const ckItems = () => [realItem('1.1.1.1'), realItem('1.1.1.2')];
  const ckSnapshot = () =>
    buildVersionSnapshot({
      family: 'CIPTA_KARYA',
      versionId: '2026.1',
      createdFrom: null,
      createdBy: null,
      createdAt: T0,
      reason: 'Fixture snapshot for the §13 sync tests',
      contentProvenance: 'CANONICAL_BASELINE',
      sourceDescription: 'test fixture',
      items: ckItems(),
    });

  it('the pure builder loads a valid snapshot into the §10 contents map', () => {
    const result = buildVersionedContents([{ label: 'fixture', parsed: ckSnapshot() }]);
    expect(result.loadedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.records).toEqual([
      {
        family: 'CIPTA_KARYA',
        versionId: '2026.1',
        itemCount: 2,
        contentChecksum: computeAhspContentChecksum(ckItems()),
        contentProvenance: 'CANONICAL_BASELINE',
      },
    ]);
    expect(Object.keys(result.contents)).toEqual(['CIPTA_KARYA|2026.1']);
    expect(result.contents['CIPTA_KARYA|2026.1']).toHaveLength(2);
  });

  it('asAhspVersionSnapshot is a shape-only guard (checksum validation still belongs to the builder)', () => {
    expect(asAhspVersionSnapshot(ckSnapshot())).not.toBeNull();
    expect(asAhspVersionSnapshot({ schemaVersion: 2, meta: {}, items: [] })).toBeNull();
    expect(asAhspVersionSnapshot(null)).toBeNull();
    expect(asAhspVersionSnapshot('not an object')).toBeNull();
  });

  it('a tampered snapshot (coefficient changed) is refused by the checksum', () => {
    const tampered = clone(ckSnapshot());
    tampered.items[0].laborComponents[0].coefficient = 9.9;
    const result = buildVersionedContents([{ label: 'tampered', parsed: tampered }]);
    expect(result.loadedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain('content checksum mismatch');
    expect(result.contents).toEqual({});
  });

  it('a BINA_MARGA snapshot claiming PIPELINE_REGENERATED provenance is refused (frozen family)', () => {
    const bmItem = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.domain === 'BINA_MARGA');
    expect(bmItem).toBeDefined();
    const items = [bmItem!];
    // Hand-built parsed object (buildVersionSnapshot itself would throw):
    // the checksum is CORRECT, so only the provenance rule can refuse it.
    const parsed = {
      schemaVersion: 1,
      meta: {
        family: 'BINA_MARGA',
        versionId: '2026.1',
        createdFrom: null,
        createdBy: null,
        createdAt: T0,
        reason: 'Fixture: regenerated BM snapshot (forbidden)',
        contentChecksum: computeAhspContentChecksum(items),
        contentProvenance: 'PIPELINE_REGENERATED',
        itemCount: 1,
        sourceDescription: 'test fixture',
      },
      items,
    };
    const result = buildVersionedContents([{ label: 'bm-regen', parsed }]);
    expect(result.loadedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toMatch(/provenance|PIPELINE_REGENERATED/i);
  });

  it('a duplicate (family, versionId) and a bad schemaVersion are reported, never silently dropped', () => {
    const snapshot = ckSnapshot();
    const result = buildVersionedContents([
      { label: 'first', parsed: snapshot },
      { label: 'dup', parsed: snapshot },
      { label: 'bad-schema', parsed: { ...snapshot, schemaVersion: 2 } },
    ]);
    expect(result.loadedCount).toBe(1);
    expect(result.failedCount).toBe(2);
    expect(result.errors[0]).toContain('duplicate');
    expect(result.errors[1]).toContain('schemaVersion');
  });

  it('loaded contents plug into the §10 versioned catalog source (old versions become readable)', () => {
    const result = buildVersionedContents([{ label: 'fixture', parsed: ckSnapshot() }]);
    const activeVersions: Readonly<Record<AhspFamily, string>> = {
      CIPTA_KARYA: '2026.1',
      BINA_MARGA: '2026.1',
      SUMBER_DAYA_AIR: '2026.1',
      SMKK: '2026.1',
    };
    const source = createVersionedCatalogSource({
      activeVersions,
      contents: result.contents,
      includeLiveCatalog: false,
    });
    const items = source.getVersionItems('CIPTA_KARYA', '2026.1');
    expect(items).not.toBeNull();
    expect(items).toHaveLength(2);
    expect(items!.map((i) => i.code)).toEqual(['1.1.1.1', '1.1.1.2']);
    // A version with NO loaded contents still fails closed (null).
    expect(source.getVersionItems('CIPTA_KARYA', '2025.1')).toBeNull();
  });

  it('the disk loader reads the REAL versions dir (read-only): 4 snapshots, pinned checksums', () => {
    const loaded = loadAhspVersionSnapshots();
    expect(loaded.loaderErrors).toEqual([]);
    expect(loaded.result.loadedCount).toBe(4);
    expect(loaded.result.failedCount).toBe(0);
    expect(loaded.activeVersions).toEqual({
      CIPTA_KARYA: '2026.1',
      BINA_MARGA: '2026.1',
      SUMBER_DAYA_AIR: '2026.1',
      SMKK: '2026.1',
    });
    for (const record of loaded.result.records) {
      expect(record.contentChecksum).toBe(PINNED_CHECKSUMS[record.family]);
    }
    expect(loaded.result.contents['CIPTA_KARYA|2026.1']).toHaveLength(2859);
    expect(loaded.result.contents['BINA_MARGA|2026.1']).toHaveLength(1137);
    expect(loaded.result.contents['SUMBER_DAYA_AIR|2026.1']).toHaveLength(1556);
    expect(loaded.result.contents['SMKK|2026.1']).toHaveLength(190);
    // The records reader + registry state agree with the loader.
    const { records, errors } = readActiveVersionRecords();
    expect(errors).toEqual([]);
    expect(records).toHaveLength(4);
    const state = buildRegistryState(records);
    expect(state.active).toEqual(loaded.activeVersions);
  });

  it('temp-dir fixtures: a tampered snapshot file and a missing file are reported as errors', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fase13-versions-'));
    try {
      const versionsDir = path.join(tmp, 'versions');
      fs.mkdirSync(path.join(versionsDir, 'CIPTA_KARYA'), { recursive: true });
      const snapshot = ckSnapshot();
      const tampered = clone(snapshot);
      tampered.items[0].laborComponents[0].coefficient = 9.9;
      fs.writeFileSync(
        path.join(versionsDir, 'CIPTA_KARYA', '2026.1.json'),
        JSON.stringify(tampered),
      );
      fs.writeFileSync(
        path.join(versionsDir, 'active-versions.json'),
        JSON.stringify({
          schemaVersion: 1,
          active: {
            CIPTA_KARYA: '2026.1',
            BINA_MARGA: '2026.1',
            SUMBER_DAYA_AIR: '2026.1',
            SMKK: '2026.1',
          },
          records: [
            {
              family: 'CIPTA_KARYA',
              versionId: '2026.1',
              snapshotPath: 'data/ahsp2026/versions/CIPTA_KARYA/2026.1.json',
              contentChecksum: snapshot.meta.contentChecksum,
            },
            {
              family: 'BINA_MARGA',
              versionId: '2026.1',
              snapshotPath: 'data/ahsp2026/versions/BINA_MARGA/2026.1.json',
              contentChecksum: PINNED_CHECKSUMS.BINA_MARGA,
            },
          ],
        }),
      );
      const loaded = loadAhspVersionSnapshots(versionsDir);
      // The tampered CK snapshot failed in the builder; the BM file is
      // missing entirely (neither repo-root path nor the temp fallback
      // exists) — both are REPORTED, not silently skipped.
      expect(loaded.result.failedCount).toBe(1);
      expect(loaded.result.errors[0]).toContain('content checksum mismatch');
      expect(loaded.loaderErrors.some((e) => e.includes('BINA_MARGA'))).toBe(true);
      expect(loaded.result.loadedCount).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// (I) Price-change feed (the §10/§11 adoption pin, §13.4-adjacent)
// ===========================================================================

describe('price-change feed (adoption pin for kind-harga §10)', () => {
  it('entry ids are deterministic content hashes (PCF-<16 hex>)', () => {
    const a = buildPriceChangeFeedEntry(makeFeedInput());
    const b = buildPriceChangeFeedEntry(makeFeedInput());
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^PCF-[0-9a-f]{16}$/);
    expect(a.schemaVersion).toBe(1);
    expect(a.sourceKind).toBe('SYNC');
  });

  it('validation: short reason / missing resourceCode / non-finite price throw', () => {
    expect(() => buildPriceChangeFeedEntry(makeFeedInput({ reason: 'short' }))).toThrow(/reason/);
    expect(() =>
      buildPriceChangeFeedEntry(makeFeedInput({ resourceCode: '' })),
    ).toThrow(/resourceCode/);
    expect(() =>
      buildPriceChangeFeedEntry(makeFeedInput({ newPrice: NaN })),
    ).toThrow(/finite/);
  });

  it('append-only: a duplicate id is refused', () => {
    const entry = buildPriceChangeFeedEntry(makeFeedInput());
    const entries = appendPriceChangeFeedEntry([], entry);
    expect(entries).toHaveLength(1);
    expect(() => appendPriceChangeFeedEntry(entries, entry)).toThrow(/Duplicate/);
  });

  it('compareMasterPriceVersions orders numerically (2026.10 > 2026.9), garbage throws', () => {
    expect(compareMasterPriceVersions('2026.10', '2026.9')).toBe(1);
    expect(compareMasterPriceVersions('2026.9', '2026.10')).toBe(-1);
    expect(compareMasterPriceVersions('2026.1', '2026.1')).toBe(0);
    expect(compareMasterPriceVersions('2027.1', '2026.10')).toBe(1);
    expect(() => compareMasterPriceVersions('garbage', '2026.1')).toThrow(/version/);
  });

  it('readPriceChangesSince: version pin (strictly newer) and SINCE pin (strictly after)', () => {
    const e1 = buildPriceChangeFeedEntry(
      makeFeedInput({ changedAt: T0, masterPriceVersion: '2026.1' }),
    );
    const e2 = buildPriceChangeFeedEntry(
      makeFeedInput({
        changedAt: T1,
        masterPriceVersion: '2026.2',
        oldPrice: 110000,
        newPrice: 120000,
      }),
    );
    const entries = appendPriceChangeFeedEntry(appendPriceChangeFeedEntry([], e1), e2);
    // Version pin: only entries NEWER than 2026.1.
    expect(readPriceChangesSince(entries, { kind: 'MASTER_PRICE_VERSION', masterPriceVersion: '2026.1' })).toEqual([e2]);
    expect(readPriceChangesSince(entries, { kind: 'MASTER_PRICE_VERSION', masterPriceVersion: '2026.2' })).toEqual([]);
    // SINCE pin: only entries strictly AFTER T0.
    expect(readPriceChangesSince(entries, { kind: 'SINCE', since: T0 })).toEqual([e2]);
    expect(readPriceChangesSince(entries, { kind: 'SINCE', since: T1 })).toEqual([]);
  });

  it('the BASELINE marker is never returned as a change', () => {
    const baseline = buildBaselineFeedEntry(T0);
    const change = buildPriceChangeFeedEntry(makeFeedInput());
    const entries = appendPriceChangeFeedEntry(
      appendPriceChangeFeedEntry([], baseline),
      change,
    );
    expect(readPriceChangesSince(entries, { kind: 'SINCE', since: '2000-01-01T00:00:00.000Z' })).toEqual([change]);
    expect(readPriceChangesSince(entries, { kind: 'MASTER_PRICE_VERSION', masterPriceVersion: '2025.1' })).toEqual([change]);
  });

  it('feedEntriesToChangeInputs round-trips losslessly to §10 change inputs', () => {
    const entry = buildPriceChangeFeedEntry(makeFeedInput());
    // The feed entry carries resourceId + region/source (null) that the
    // bare §10 change input omits — the projection preserves them.
    expect(feedEntriesToChangeInputs([entry])).toEqual([
      { ...l01Change(), resourceId: 'RES-L01', region: null, source: null },
    ]);
  });

  it('seedFeedFromHistory: §4.4 entries carry NO resourceCode, so they are skipped with reasons', () => {
    const history = baselineHistory();
    const { entries, skipped } = seedFeedFromHistory(history, T0);
    expect(entries).toHaveLength(1);
    expect(entries[0].resourceCode).toBe('BASELINE');
    expect(entries[0].sourceKind).toBe('BASELINE');
    // The BASELINE marker is skipped as a marker (no price change).
    expect(skipped).toHaveLength(1);
    expect(skipped[0].historyEntryId).toBe(history[0].id);
    expect(skipped[0].operation).toBe('BASELINE');
    expect(skipped[0].reason).toContain('marker entry');
    // A real CREATE entry is skipped for the honest reason: the §4.4
    // trail carries no resource CODE, and a feed entry cannot be built
    // without inventing identity.
    const createEntry = { ...history[0], operation: 'CREATE' as const };
    const seeded2 = seedFeedFromHistory([createEntry], T0);
    expect(seeded2.entries).toHaveLength(1);
    expect(seeded2.skipped).toHaveLength(1);
    expect(seeded2.skipped[0].reason).toContain('resourceCode');
    // The seeded feed validates as a chain.
    expect(validatePriceChangeFeedEntries(entries).valid).toBe(true);
  });

  it('JSONL round-trip preserves the entry exactly (header + lines)', () => {
    const entry = buildPriceChangeFeedEntry(makeFeedInput());
    const header = buildPriceChangeFeedJsonlHeader(T0);
    const jsonl = [serializePriceChangeFeedHeaderJsonl(header), serializePriceChangeFeedEntryJsonl(entry)].join('\n');
    const parsed = parsePriceChangeFeedJsonl(jsonl);
    expect(parsed.errors).toEqual([]);
    expect(parsed.entries).toEqual([entry]);
    expect(parsed.header).toMatchObject({ kind: 'HEADER', schemaVersion: 1, masterPriceVersion: '2026.1' });
  });
});

// ===========================================================================
// (K) §12 secondaries #2/#3/#4
// ===========================================================================

describe('§12 secondary #2 — sanity ranges normalize to the base unit before judging', () => {
  const validator = priceSanityValidator;

  it('Besi Beton 15.000.000/ton is VALID (15.000/kg after conversion) with the converted price recorded', () => {
    const result = validator.validatePrice('Besi Beton Tulangan', 15_000_000, 'ton');
    expect(result.status).toBe('VALID');
    expect(result.isValid).toBe(true);
    expect(result.convertedPrice).toEqual({ price: 15000, unit: 'kg' });
  });

  it('Besi Beton 50.000.000/ton is INVALID (50.000/kg exceeds the 45.000 cap)', () => {
    const result = validator.validatePrice('Besi Beton Tulangan', 50_000_000, 'ton');
    expect(result.status).toBe('PRICE_INVALID');
    expect(result.rejectionReason).toContain('50.000');
    expect(result.rejectionReason).toContain('kg');
  });

  it('the pre-§13 pin is preserved: Besi Beton 3.864.000/kg is still INVALID', () => {
    const result = validator.validatePrice('Besi Beton Tulangan', 3_864_000, 'kg');
    expect(result.status).toBe('PRICE_INVALID');
  });

  it('Pasir Pasang 285.000/m3 stays VALID at the same unit (no conversion needed)', () => {
    const result = validator.validatePrice('Pasir Pasang', 285_000, 'm3');
    expect(result.status).toBe('VALID');
    expect(result.convertedPrice).toBeUndefined();
  });
});

describe('§12 secondary #3 — heuristic anchors carry their unit (convert when convertible)', () => {
  it('semen anchor converts to the query unit (ton): 1.750.000/ton with a conversion note', () => {
    const est = aiPriceEstimationEngine.estimateResourcePrice({
      name: 'Xqzsemen Blend-99',
      unit: 'ton',
      type: 'material',
    });
    // Precondition: the heuristic branch ran (0 comparables matched).
    expect(est.comparable_references ?? []).toHaveLength(0);
    // The anchor is 1.750.000/kg → ×1000 for a ton query.
    expect(est.estimated_price).toBe(1_750_000);
    expect(est.unit).toBe('ton');
    const basis = Array.isArray(est.basis) ? est.basis.join(' ') : est.basis;
    expect(basis).toContain('kg');
    expect(basis).toContain('ton');
  });

  it('pasir anchor is NOT convertible to kg (needs density): kept as-is with an honest note', () => {
    const est = aiPriceEstimationEngine.estimateResourcePrice({
      name: 'Xqzpasir Blend-99',
      unit: 'kg',
      type: 'material',
    });
    expect(est.comparable_references ?? []).toHaveLength(0);
    // The /m3 anchor value is served unchanged (285.000) — no density
    // factor is invented — and the basis says so.
    expect(est.estimated_price).toBe(285_000);
    const basis = Array.isArray(est.basis) ? est.basis.join(' ') : est.basis;
    expect(basis).toMatch(/tidak dapat dikonversi|tidak dikonversi|konversi/i);
  });

  it('the comparables path is untouched: Semen Portland/kg still resolves from records', () => {
    const est = aiPriceEstimationEngine.estimateResourcePrice({
      name: 'Semen Portland',
      unit: 'kg',
      type: 'material',
    });
    expect((est.comparable_references ?? []).length).toBeGreaterThan(0);
    expect(est.estimated_price).toBe(1800);
  });
});

describe('§12 secondary #4 — per-component snapshot map for QTO SNAPSHOT', () => {
  const project = { id: 'FIXTURE-P', activeEstimateVersionId: 'EV-1' } as Project;
  const makeVersion = (
    overrides: Partial<EstimateVersion> & { id: string; timestamp: string },
  ): EstimateVersion => ({
    id: overrides.id,
    projectId: overrides.projectId ?? 'FIXTURE-P',
    versionNumber: 'v1',
    label: 'v1',
    timestamp: overrides.timestamp,
    author: 'test',
    description: 'fixture',
    costBefore: 0,
    costAfter: 0,
    difference: 0,
    percentageDiff: 0,
    rabItemsSnapshot: [],
    itemsCount: 0,
    componentPriceSnapshot: overrides.componentPriceSnapshot ?? null,
  });
  const snapshotMap: ProjectPriceSnapshotMap = {
    estimateVersionId: 'EV-1',
    pricesByComponentKey: {
      'L.01|OH': 100000,
      'M.23|kg': 1800,
      'BAD|kg': -5,
      'ZERO|kg': 0,
      'NAN|kg': NaN,
    },
    masterPriceVersion: '2026.1',
    ahspDatabaseVersion: '2026.1',
    capturedAt: T0,
  };

  it('findActiveEstimateVersion: by id, else latest by timestamp, else null', () => {
    const v1 = makeVersion({ id: 'EV-1', timestamp: T0 });
    const v2 = makeVersion({ id: 'EV-2', timestamp: T1 });
    expect(findActiveEstimateVersion(project, [v1, v2])).toBe(v1);
    expect(findActiveEstimateVersion({ ...project, activeEstimateVersionId: null }, [v1, v2])).toBe(v2);
    expect(findActiveEstimateVersion(project, [])).toBeNull();
    expect(findActiveEstimateVersion(project, null)).toBeNull();
    expect(findActiveEstimateVersion(project, [makeVersion({ id: 'EV-9', timestamp: T0, projectId: 'OTHER' })])).toBeNull();
  });

  it('buildSnapshotRefFromProject builds the ref from the active version map (bad prices filtered)', () => {
    const version = makeVersion({
      id: 'EV-1',
      timestamp: T0,
      componentPriceSnapshot: snapshotMap,
    });
    const ref = buildSnapshotRefFromProject(project, [version]);
    expect(ref).not.toBeNull();
    expect(ref!.label).toBe('snapshot:EV-1');
    expect(ref!.masterPriceVersion).toBe('2026.1');
    expect(ref!.ahspDatabaseVersion).toBe('2026.1');
    expect(ref!.pricesByComponentKey).toEqual({ 'L.01|OH': 100000, 'M.23|kg': 1800 });
  });

  it('returns null when the active version carries no map (fallthrough preserved)', () => {
    const version = makeVersion({ id: 'EV-1', timestamp: T0 });
    expect(buildSnapshotRefFromProject(project, [version])).toBeNull();
  });

  it('refuses a map captured for a DIFFERENT version id', () => {
    const version = makeVersion({
      id: 'EV-1',
      timestamp: T0,
      componentPriceSnapshot: { ...snapshotMap, estimateVersionId: 'EV-OTHER' },
    });
    expect(buildSnapshotRefFromProject(project, [version])).toBeNull();
  });
});

// ===========================================================================
// (L) Admin trigger — the sync gate view model (§11 card)
// ===========================================================================

describe('admin trigger — syncAdminGate (§11 card view model)', () => {
  it('the honest local identity is DENIED (no admin in frontend-only state)', () => {
    const gate = syncAdminGate();
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('DENIED_NOT_AUTHENTICATED');
    expect(gate.enforcementBlocked).toBe(true);
    expect(gate.cliCommand).toBe(SYNC_CLI_COMMAND);
    expect(gate.cliDryRunCommand).toBe(SYNC_CLI_DRY_RUN_COMMAND);
    expect(gate.cliPointerSyncCommand).toBe(SYNC_CLI_POINTER_SYNC_COMMAND);
    // The literal commands are pinned (the §11 card prints them verbatim).
    expect(SYNC_CLI_COMMAND).toBe('npm run price:sync');
    expect(SYNC_CLI_DRY_RUN_COMMAND).toBe('npm run price:sync -- --dry-run');
    expect(SYNC_CLI_POINTER_SYNC_COMMAND).toBe('npm run ahsp:sync-pointers -- --dry-run');
  });

  it('a test admin is allowed; demo and ordinary identities are denied', () => {
    expect(syncAdminGate(ADMIN).allowed).toBe(true);
    expect(syncAdminGate(DEMO).code).toBe('DENIED_DEMO_ROLE');
    expect(syncAdminGate(ORDINARY).code).toBe('DENIED_NOT_GLOBAL_ADMIN');
  });
});

// ===========================================================================
// (M) §8 §12.3 — Postgres pointer-sync SQL (definition + logic only)
// ===========================================================================

describe('§8 §12.3 — Postgres pointer-sync SQL (never executed by this program)', () => {
  const makeRecord = (family: AhspFamily, overrides: Partial<AhspVersionRecord> = {}): AhspVersionRecord => ({
    family,
    versionId: '2026.1',
    status: 'ACTIVE',
    createdFrom: null,
    createdBy: null,
    createdAt: T0,
    reason: 'Fixture registry for the §13 pointer-sync tests',
    contentChecksum: PINNED_CHECKSUMS[family],
    contentProvenance: 'CANONICAL_BASELINE',
    snapshotPath: `data/ahsp2026/versions/${family}/2026.1.json`,
    itemCount: 100,
    publishedAt: T0,
    publishedBy: null,
    ...overrides,
  });
  const fixtureState = () =>
    buildRegistryState(AHSP_FAMILIES.map((f) => makeRecord(f)));

  it('postgresFamilyFor maps SUMBER_DAYA_AIR to SDA (the table CHECK value)', () => {
    expect(postgresFamilyFor('CIPTA_KARYA')).toBe('CIPTA_KARYA');
    expect(postgresFamilyFor('BINA_MARGA')).toBe('BINA_MARGA');
    expect(postgresFamilyFor('SUMBER_DAYA_AIR')).toBe('SDA');
    expect(postgresFamilyFor('SMKK')).toBe('SMKK');
    expect(postgresVersionRowId('SUMBER_DAYA_AIR', '2026.1')).toBe('SUMBER_DAYA_AIR:2026.1');
  });

  it('one upsert per version, with row ids, checksums, and the SDA mapping', () => {
    const { sql, rowIds, activeVersions } = buildPostgresPointerSyncSql(fixtureState(), T1);
    expect(rowIds).toEqual([
      'CIPTA_KARYA:2026.1',
      'BINA_MARGA:2026.1',
      'SUMBER_DAYA_AIR:2026.1',
      'SMKK:2026.1',
    ]);
    expect(activeVersions).toEqual({
      CIPTA_KARYA: '2026.1',
      BINA_MARGA: '2026.1',
      SUMBER_DAYA_AIR: '2026.1',
      SMKK: '2026.1',
    });
    expect(sql).toContain("insert into public.ahsp_database_versions");
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toContain("'SDA'");
    expect(sql).toContain('e0b539f134f8d64c');
    expect(sql).toContain('08082e878d4f0e90');
    expect(sql).toContain('1c4794f9ec5dc3e1');
    expect(sql).toContain('e77bbc73b1fea331');
    // created_at is never overwritten by the upsert.
    expect(sql).not.toContain('created_at = excluded.created_at');
  });

  it('single quotes in the reason are escaped by doubling', () => {
    const state = buildRegistryState(
      AHSP_FAMILIES.map((f) => makeRecord(f, { reason: "Owner's decision: publish 2026.1" })),
    );
    const { sql } = buildPostgresPointerSyncSql(state, T1);
    expect(sql).toContain("Owner''s decision: publish 2026.1");
  });

  it('a non-UUID createdBy throws (the column is uuid-typed)', () => {
    const state = buildRegistryState(
      AHSP_FAMILIES.map((f) => makeRecord(f, { createdBy: 'not-a-uuid' })),
    );
    expect(() => buildPostgresPointerSyncSql(state, T1)).toThrow(/not a UUID/i);
  });

  it('a UUID createdBy is emitted verbatim', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    const state = buildRegistryState(AHSP_FAMILIES.map((f) => makeRecord(f, { createdBy: uuid })));
    const { sql } = buildPostgresPointerSyncSql(state, T1);
    expect(sql).toContain(`'${uuid}'`);
  });
});

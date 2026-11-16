/**
 * MASTER PRICING §13 — SYNCHRONIZATION ENGINE.
 * ============================================
 *
 * The §13 engine is NOT a new pipeline. Per D6 (§2.4.6), the existing
 * `price:pipeline` IS the engine; this module is the deterministic
 * logic around it:
 *
 *   - §13.1 IDEMPOTENCY — stable canonical ids + source keys; the
 *     row-set digest (`priceRowSetDigest`, the same algorithm as the
 *     pipeline's `activeRowDigest`) and the row diff
 *     (`diffPriceRowSets`) prove a re-run changes nothing; the
 *     §13.2 workflow refuses a second application of the same change
 *     (its baseline no longer matches — fail-closed, never a
 *     duplicate record).
 *   - §13.2 TRANSACTION INTEGRITY — `executeGlobalPriceChange` runs
 *     the ten specified steps as a deterministic RECOVERABLE
 *     WORKFLOW (authorize → validate → impact → freshness → history
 *     → update → invalidate → recalc → record → verified result).
 *     It is NOT a server transaction: there is no server yet (§4.1
 *     BLOCKED). The workflow operates on an INJECTED store (an
 *     in-memory master-price store in tests; the pipeline is the
 *     production writer), so every step — including rollback — is
 *     testable without faking enforcement. A failure at any step
 *     after the write compensates (the pre-change store is restored)
 *     and records a FAILED history entry; no partial update ever
 *     escapes (pinned by tests).
 *   - §13.3 CACHE INVALIDATION — `invalidateSyncCaches` enumerates
 *     EVERY cache / derived-data layer (see `SYNC_CACHE_LAYERS`),
 *     invalidates the one mutable price cache (the resolver's
 *     composition cache), and reports the rest with their reason for
 *     needing no action. Sync is never claimed complete until the
 *     canonical read returns the new value (step 8 verifies it
 *     against the store; the CLI verifies it against the regenerated
 *     pipeline outputs).
 *   - §13.4 HISTORY — every run records a `SyncHistoryEntry`
 *     (./syncHistory.ts) with all thirteen fields.
 *   - §13 (7) CONFLICT DETECTION — `detectPriceConflicts` mirrors
 *     the pipeline's PHASE 25/26 identity rule: same identity, two
 *     prices. Resolved by source priority; UNRESOLVED only on a
 *     priority tie with different prices.
 *   - §13 (9) RETRY — `runWithRetry`: bounded, deterministic
 *     attempts around a step; only retryable failures retry
 *     (authorization / validation / freshness denials never retry).
 *   - §13 (10) RECOVERY + ROLLBACK — `runRecoverableWorkflow`
 *     (compensations in reverse order) + `rollbackGlobalPriceChange`
 *     (the inverse change through the same ten steps).
 *
 * The ten §13 capabilities, mapped:
 *   (1) full reconciliation — `price:sync --full` (CLI) + the
 *       reconciliation report; (2) incremental — digest diff;
 *   (3) admin-triggered — CLI `price:sync` + the gated UI trigger
 *       (`syncAdminGate`, ./syncUiLogic.ts); (4) automatic
 *       propagation — steps 6–8 of the §13.2 workflow;
 *   (5) AHSP version sync — ./snapshotContents.ts + the pointer-sync
 *       CLI; (6) dry-run — `--dry-run` (no writes, report only);
 *   (7) conflict detection; (8) idempotent execution;
 *   (9) retry; (10) recovery + rollback.
 */
import { looseCode, normalizeUnit, sha1Like, stableStringify } from '../../../data/priceDatabase2026/normalize';
import { priceResolver2026 } from '../../../data/priceDatabase2026/resolver';
import {
  MASTER_PRICE_VERSION,
  type ResourcePriceRecord,
  type ResourceType,
} from '../../../data/priceDatabase2026/types';
import type { AhspFamily } from '../../../data/nationalCostDatabase/ahspVersioning';
import type { NationalAHSPItem } from '../../../data/nationalCostDatabase/types';
import { authorizeMasterPriceWriteVia } from '../admin/masterPriceAuthorization';
import { validateMasterPriceWrite, type MasterPriceWriteInput } from '../admin/masterPriceRecord';
import {
  appendHistoryEntry,
  buildHistoryEntry,
  type MasterPriceHistoryEntry,
} from '../admin/masterPriceHistory';
import { priceSanityValidator } from '../canonical/priceSanityValidator';
import {
  buildFingerprint,
  computeCatalogChecksum,
  computeMasterPriceImpact,
  computeProjectsFingerprint,
  priceChangeKey,
  validateImpactPreviewFreshness,
  type AffectedComponentRef,
  type AhspItemImpact,
  type CurrentImpactState,
  type MasterPriceChangeInput,
  type MasterPriceImpactPreview,
  type ProjectImpact,
  type ProjectImpactInput,
  type ProjectItemImpact,
} from '../impact/masterPriceImpactPreview';
import { SafeDecimalEngine } from '../../safeDecimalEngine';
import {
  appendSyncHistoryEntry,
  buildSyncHistoryEntry,
  type SyncHistoryEntry,
  type SyncOperationType,
  type SyncRecoveryStatus,
} from './syncHistory';
import {
  appendPriceChangeFeedEntry,
  buildPriceChangeFeedEntry,
  type PriceChangeFeedEntry,
} from './priceChangeFeed';

// ===========================================================================
// §13.1 + §13 (2) — row-set digest + incremental diff
// ===========================================================================

/**
 * Stable digest of a price-row set — the SAME algorithm as the
 * pipeline's `activeRowDigest` (scripts/price2026/normalizePrices.ts):
 * `sha1Like(stableStringify(active rows mapped to
 * [id, price, unit, verificationStatus]))`. The pipeline filters by
 * its active-source map; here the caller supplies the predicate, so
 * this module never imports scripts-side config. Equality with the
 * pipeline digest is pinned by a test that imports both.
 */
export function priceRowSetDigest(
  rows: readonly ResourcePriceRecord[],
  isActive: (row: ResourcePriceRecord) => boolean,
): string {
  const active = rows.filter(isActive);
  return sha1Like(stableStringify(active.map((r) => [r.id, r.price, r.unit, r.verificationStatus])));
}

export interface ChangedPriceRow {
  id: string;
  /** Fields whose values differ (subset of the compared fields). */
  changedFields: string[];
  before: ResourcePriceRecord;
  after: ResourcePriceRecord;
}

export interface PriceRowSetDiff {
  digestBefore: string;
  digestAfter: string;
  /** True when the digest is unchanged (the run is a no-op). */
  unchanged: boolean;
  added: ResourcePriceRecord[];
  removed: ResourcePriceRecord[];
  changed: ChangedPriceRow[];
  unchangedCount: number;
}

const DIFF_COMPARED_FIELDS: ReadonlyArray<keyof ResourcePriceRecord> = [
  'price',
  'unit',
  'verificationStatus',
  'sourceKey',
  'resourceId',
  'resourceCode',
];

/**
 * Incremental diff between two row sets, keyed by the STABLE row id
 * (`PRC-<sourceKey>-<resourceId>-<unit>-<locationKey>-<periodLabel>` —
 * the canonical id + source key of §13.1). A row with the same id in
 * both sets is the SAME record; only its compared fields can change.
 * Rows are never matched by name (names drift; ids do not).
 */
export function diffPriceRowSets(
  prev: readonly ResourcePriceRecord[],
  next: readonly ResourcePriceRecord[],
  isActive: (row: ResourcePriceRecord) => boolean,
): PriceRowSetDiff {
  const digestBefore = priceRowSetDigest(prev, isActive);
  const digestAfter = priceRowSetDigest(next, isActive);
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const nextById = new Map(next.map((r) => [r.id, r]));
  const added: ResourcePriceRecord[] = [];
  const removed: ResourcePriceRecord[] = [];
  const changed: ChangedPriceRow[] = [];
  let unchangedCount = 0;
  for (const row of next) {
    const before = prevById.get(row.id);
    if (!before) {
      added.push(row);
      continue;
    }
    const changedFields: string[] = [];
    for (const field of DIFF_COMPARED_FIELDS) {
      if (before[field] !== row[field]) changedFields.push(field);
    }
    if (changedFields.length === 0) unchangedCount++;
    else changed.push({ id: row.id, changedFields, before, after: row });
  }
  for (const row of prev) {
    if (!nextById.has(row.id)) removed.push(row);
  }
  return {
    digestBefore,
    digestAfter,
    unchanged: digestBefore === digestAfter,
    added,
    removed,
    changed,
    unchangedCount,
  };
}

// ===========================================================================
// §13 (7) — conflict detection (mirrors pipeline PHASE 25/26)
// ===========================================================================

export interface PriceConflict {
  /** Identity WITHOUT the source key (resourceId|unit|location|period). */
  identity: string;
  resourceId: string | null;
  resourceCode: string;
  unit: string;
  candidates: Array<{
    price: number;
    sourceKey: string;
    sourcePriority: number;
  }>;
  /** The deterministic winner (lowest sourcePriority), or null on a tie. */
  preferred: { price: number; sourceKey: string; sourcePriority: number } | null;
  resolution: 'SOURCE_PRIORITY' | 'UNRESOLVED_PRIORITY_TIE';
  reason: string;
}

export interface PriceConflictReport {
  conflicts: PriceConflict[];
  /** Conflicts the engine could not resolve (priority ties). */
  unresolved: PriceConflict[];
  /** Exact duplicate groups (same identity INCLUDING sourceKey, >1 record) — an idempotency violation signal. */
  exactDuplicateGroups: Array<{ identity: string; count: number; ids: string[] }>;
}

function conflictIdentityKey(r: ResourcePriceRecord): string {
  return [
    r.resourceId ?? '',
    r.unit,
    r.location.level,
    r.location.provinceName ?? '',
    r.location.regencyName ?? '',
    r.period.label,
  ].join('|');
}

function fullIdentityKey(r: ResourcePriceRecord): string {
  return `${conflictIdentityKey(r)}|${r.sourceKey}`;
}

/**
 * Detect price conflicts: the same identity priced differently by
 * different sources. Resolution is deterministic source priority
 * (the pipeline's rule — never silently dropped). A conflict is
 * UNRESOLVED only when the two best priorities TIE with different
 * prices: no deterministic winner exists, and the engine must report
 * it rather than pick one arbitrarily. Exact duplicates (same
 * identity INCLUDING source key) are reported separately — a
 * duplicate is an idempotency defect, not a conflict.
 */
export function detectPriceConflicts(
  records: readonly ResourcePriceRecord[],
): PriceConflictReport {
  const byIdentity = new Map<string, ResourcePriceRecord[]>();
  for (const r of records) {
    const key = conflictIdentityKey(r);
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key)!.push(r);
  }
  const conflicts: PriceConflict[] = [];
  for (const [identity, list] of byIdentity) {
    const prices = [...new Set(list.map((r) => r.price))];
    if (list.length <= 1 || prices.length <= 1) continue;
    const sorted = [...list].sort((a, b) =>
      a.sourcePriority !== b.sourcePriority
        ? a.sourcePriority - b.sourcePriority
        : a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : 0,
    );
    const best = sorted[0];
    const runnerUp = sorted[1];
    const tied = runnerUp.sourcePriority === best.sourcePriority && runnerUp.price !== best.price;
    const candidates = sorted.map((r) => ({
      price: r.price,
      sourceKey: r.sourceKey,
      sourcePriority: r.sourcePriority,
    }));
    conflicts.push({
      identity,
      resourceId: list[0].resourceId,
      resourceCode: list[0].resourceCode,
      unit: list[0].unit,
      candidates,
      preferred: tied ? null : { price: best.price, sourceKey: best.sourceKey, sourcePriority: best.sourcePriority },
      resolution: tied ? 'UNRESOLVED_PRIORITY_TIE' : 'SOURCE_PRIORITY',
      reason: tied
        ? `Priority tie at ${best.sourcePriority} between ${best.sourceKey} (Rp${best.price.toLocaleString('id-ID')}) and ${runnerUp.sourceKey} (Rp${runnerUp.price.toLocaleString('id-ID')}) — no deterministic winner`
        : `Resolved by source priority: ${best.sourceKey} (priority ${best.sourcePriority}) wins over ${sorted.length - 1} other candidate(s)`,
    });
  }

  const byFullIdentity = new Map<string, ResourcePriceRecord[]>();
  for (const r of records) {
    const key = fullIdentityKey(r);
    if (!byFullIdentity.has(key)) byFullIdentity.set(key, []);
    byFullIdentity.get(key)!.push(r);
  }
  const exactDuplicateGroups = [...byFullIdentity.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([identity, list]) => ({ identity, count: list.length, ids: list.map((r) => r.id) }));

  return {
    conflicts,
    unresolved: conflicts.filter((c) => c.resolution === 'UNRESOLVED_PRIORITY_TIE'),
    exactDuplicateGroups,
  };
}

// ===========================================================================
// §13 (9) — retry (bounded, deterministic)
// ===========================================================================

export interface RetryOutcome<T> {
  result: T;
  /** Attempts used (1 = first try succeeded). */
  attempts: number;
  /** Error messages from the failed attempts, in order. */
  attemptErrors: string[];
}

/**
 * Run a step with bounded retries. Deterministic: no timers, no
 * backoff sleeps (the CLI may sleep between attempts; the engine
 * never blocks on a clock). `isRetryable` decides per error — the
 * default retries every error; the §13.2 workflow passes a
 * predicate that never retries authorization / validation /
 * freshness denials (those are deterministic, not transient).
 * Throws the LAST error when attempts run out.
 */
export function runWithRetry<T>(
  step: () => T,
  opts: { maxAttempts: number; isRetryable?: (error: unknown) => boolean; label: string },
): RetryOutcome<T> {
  const maxAttempts = Math.max(1, Math.floor(opts.maxAttempts));
  const isRetryable = opts.isRetryable ?? (() => true);
  const attemptErrors: string[] = [];
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = step();
      return { result, attempts: attempt, attemptErrors };
    } catch (err) {
      lastError = err;
      attemptErrors.push(err instanceof Error ? err.message : String(err));
      if (attempt >= maxAttempts || !isRetryable(err)) {
        throw err;
      }
    }
  }
  // Unreachable (the loop always returns or throws), but TypeScript
  // needs a total return; rethrow the last error to stay honest.
  throw lastError instanceof Error
    ? lastError
    : new Error(`${opts.label}: retry exhausted (${maxAttempts} attempts)`);
}

// ===========================================================================
// §13 (10) — recoverable workflow (compensations in reverse order)
// ===========================================================================

export interface SyncWorkflowStep<T> {
  name: string;
  /** Runs the step; throws on failure. */
  run: () => T;
  /** Undoes the step (compensation). Only called for steps that ran OK, in reverse order. */
  compensate?: () => void;
}

export interface SyncWorkflowResult {
  ok: boolean;
  completedSteps: string[];
  /** The step that failed, or null when all steps ran. */
  failedStep: string | null;
  failureReason: string | null;
  /** Compensation outcomes, in the order they ran (reverse step order). */
  compensations: Array<{ step: string; ok: boolean; reason: string | null }>;
  recoveryStatus: SyncRecoveryStatus;
}

/**
 * Run steps in order; on the first failure, run compensations for
 * the completed steps in REVERSE order. A compensation that throws
 * is recorded (recovery FAILED for that step) and never masks the
 * original failure. Steps without a `compensate` need none (pure
 * reads, or writes that are safe to leave — e.g. cache invalidation,
 * which only forces recomputation).
 */
export function runRecoverableWorkflow(
  steps: ReadonlyArray<SyncWorkflowStep<unknown>>,
): SyncWorkflowResult {
  const completedSteps: string[] = [];
  const compensations: SyncWorkflowResult['compensations'] = [];
  for (const step of steps) {
    try {
      step.run();
      completedSteps.push(step.name);
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : String(err);
      let compensationFailed = false;
      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const done = steps[i];
        if (!done.compensate) continue;
        try {
          done.compensate();
          compensations.push({ step: done.name, ok: true, reason: null });
        } catch (compErr) {
          compensationFailed = true;
          compensations.push({
            step: done.name,
            ok: false,
            reason: compErr instanceof Error ? compErr.message : String(compErr),
          });
        }
      }
      return {
        ok: false,
        completedSteps,
        failedStep: step.name,
        failureReason,
        compensations,
        recoveryStatus: compensationFailed ? 'RECOVERY_FAILED' : 'ROLLBACK_APPLIED',
      };
    }
  }
  return {
    ok: true,
    completedSteps,
    failedStep: null,
    failureReason: null,
    compensations,
    recoveryStatus: 'NOT_NEEDED',
  };
}

// ===========================================================================
// §13.3 — cache invalidation (EVERY layer enumerated)
// ===========================================================================

export type SyncCacheLayerAction = 'INVALIDATED' | 'NO_ACTION_NEEDED';

export interface SyncCacheLayerReport {
  layer: string;
  action: SyncCacheLayerAction;
  reason: string;
}

export interface SyncCacheInvalidation {
  /** Resolver composition-cache generation before invalidation. */
  cacheVersionBefore: number;
  /** Generation after invalidation (before + 1 when invalidated). */
  cacheVersionAfter: number;
  layers: SyncCacheLayerReport[];
}

/**
 * EVERY cache / derived-data layer in the pricing architecture, and
 * what sync does about it. Only ONE layer is a mutable price cache
 * (the resolver's composition cache); the rest are enumerated with
 * the reason they need no action — an unlisted layer would be a
 * staleness hole, so the list is pinned by tests.
 */
export const SYNC_CACHE_LAYERS: ReadonlyArray<{
  layer: string;
  action: SyncCacheLayerAction;
  reason: string;
}> = [
  {
    layer: 'RESOLVER_AHSP_COMPOSITION',
    action: 'INVALIDATED',
    reason: 'priceResolver2026.ahspDefaultCache (Map, keyed by cache generation + item code) — the only mutable price cache; invalidateAhspCache() bumps the generation and clears the map.',
  },
  {
    layer: 'RESOLVER_INDEXES',
    action: 'NO_ACTION_NEEDED',
    reason: 'priceResolver2026 byResourceId/byLooseCodeUnit/byNameUnit/byName indexes are built once from the generated priceMaster module at first use; module data cannot change within a session, so the indexes cannot go stale in-process. A pipeline regeneration refreshes them via app reload (new bundle).',
  },
  {
    layer: 'READ_PROJECTION_PRICE_REPOSITORY',
    action: 'NO_ACTION_NEEDED',
    reason: 'PriceRepository ingests HSD 2026 items + commercial master items + legacy PUPR 2022 components (quarantined tier LEGACY) — it NEVER reads priceMaster (RESOURCE_PRICE_RECORDS), so a master price change cannot stale its maps. Verified by grep: no priceMaster import in priceRepository.ts.',
  },
  {
    layer: 'CANONICAL_RESOLVER',
    action: 'NO_ACTION_NEEDED',
    reason: 'canonicalPriceResolver is stateless: no cache field, every resolve() recomputes from the lower resolver + PriceRepository. Nothing to invalidate.',
  },
  {
    layer: 'DERIVED_AHSP_VALUES',
    action: 'NO_ACTION_NEEDED',
    reason: 'Derived AHSP totals are computed on demand by resolveAhspUnitPrice (no stored derived values anywhere); invalidating the composition cache IS invalidating the derived values. Step 8 re-resolves the affected items to verify the new totals.',
  },
  {
    layer: 'CATALOG_CONTENT_INDEXES',
    action: 'NO_ACTION_NEEDED',
    reason: 'masterRegistry ALL_OFFICIAL_AHSP_ITEMS and officialAhspRepository byCode are CONTENT indexes (code → item); they carry no prices, so a price change cannot stale them. Content changes go through AHSP version sync (§13 (5)), not price sync.',
  },
  {
    layer: 'PROJECT_OVERRIDES',
    action: 'NO_ACTION_NEEDED',
    reason: 'ProjectPriceEngine overrides are project-scoped and WIN over master prices by design; a master price change must NOT invalidate them (Decision: overrides are the project\'s own prices).',
  },
  {
    layer: 'PRICE_RESEARCH_CACHE',
    action: 'NO_ACTION_NEEDED',
    reason: 'The calculator price-research cache holds EXTERNAL reference prices (market research), not master prices; a master sync does not touch external references.',
  },
];

/**
 * Invalidate the sync-affected caches: bump the resolver's
 * composition-cache generation (the real `invalidateAhspCache()`)
 * and report every layer. Returns the generation before/after so
 * the caller can prove the invalidation happened.
 */
export function invalidateSyncCaches(): SyncCacheInvalidation {
  const cacheVersionBefore = priceResolver2026.getCacheVersion();
  priceResolver2026.invalidateAhspCache();
  const cacheVersionAfter = priceResolver2026.getCacheVersion();
  return {
    cacheVersionBefore,
    cacheVersionAfter,
    layers: SYNC_CACHE_LAYERS.map((l) => ({ ...l })),
  };
}

// ===========================================================================
// The sync target: an in-memory master-price store (the §13.2 write target)
// ===========================================================================

/**
 * The store a §13.2 workflow writes to. IMMUTABLE: `applyPriceChange`
 * returns a NEW store; the old reference is the rollback snapshot
 * (no separate snapshot/restore API is needed — keeping the old
 * reference IS the rollback). The canonical read (`readPrice`)
 * mirrors the resolver's winner rule in miniature: among ACTIVE
 * records bound by code+unit, the lowest sourcePriority wins; ties
 * break by record id (deterministic). Name gating, regional logic
 * and conversion live in the real resolver, not here — the store is
 * keyed by code+unit exactly like the §9 effective-price model.
 *
 * PRODUCTION NOTE: this store is the workflow's testable target.
 * The production writer is the pipeline (`price:sync` regenerates
 * priceMaster from the sources); the store is how the workflow's
 * transaction logic is proven without a server.
 */
export interface SyncMasterPriceStore {
  readonly records: readonly ResourcePriceRecord[];
  /** Canonical read: the winning ACTIVE price for a code+unit key, or null (unpriced — never Rp0). */
  readPrice(resourceCode: string, unit: string): number | null;
  /**
   * Apply one price change: supersede the winning record (status
   * SUPERSEDED, effectiveTo = the change timestamp) and add the new
   * version (version + 1, ACTIVE). When the key is currently
   * unpriced, the change ADDS a v1 record built from the write input.
   * Returns a NEW store; the input store is untouched.
   */
  applyPriceChange(
    change: MasterPriceChangeInput,
    write: MasterPriceWriteInput,
    opts: { changedAt: string; adminIdentity: string | null },
  ): SyncMasterPriceStore;
}

function storeKey(resourceCode: string, unit: string): string {
  return `${looseCode(resourceCode)}|${normalizeUnit(unit)}`;
}

function recordKey(r: ResourcePriceRecord): string {
  return storeKey(r.resourceCode, r.unit);
}

function winningRecord(
  records: readonly ResourcePriceRecord[],
  key: string,
): ResourcePriceRecord | null {
  let best: ResourcePriceRecord | null = null;
  for (const r of records) {
    if (r.status !== undefined && r.status !== 'ACTIVE') continue;
    if (recordKey(r) !== key) continue;
    if (
      best === null ||
      r.sourcePriority < best.sourcePriority ||
      (r.sourcePriority === best.sourcePriority && r.id < best.id)
    ) {
      best = r;
    }
  }
  return best;
}

function categoryToResourceType(
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | null | undefined,
): ResourceType {
  if (category === 'MATERIAL') return 'material';
  if (category === 'LABOR') return 'labor';
  if (category === 'EQUIPMENT') return 'equipment';
  return 'unknown';
}

function locationKeyForId(location: MasterPriceWriteInput['location']): string {
  return [
    location.level,
    location.provinceName ?? '',
    location.regencyName ?? '',
  ].join('-');
}

class InMemorySyncMasterPriceStore implements SyncMasterPriceStore {
  readonly records: readonly ResourcePriceRecord[];

  constructor(records: readonly ResourcePriceRecord[]) {
    this.records = Object.freeze([...records]);
  }

  readPrice(resourceCode: string, unit: string): number | null {
    const winner = winningRecord(this.records, storeKey(resourceCode, unit));
    return winner ? winner.price : null;
  }

  applyPriceChange(
    change: MasterPriceChangeInput,
    write: MasterPriceWriteInput,
    opts: { changedAt: string; adminIdentity: string | null },
  ): SyncMasterPriceStore {
    if (change.newPrice === null) {
      throw new Error(
        `Cannot apply a price REMOVAL for ${priceChangeKey(change)} through the sync workflow — ` +
          'removals need a staged re-preview (§9 refuses removal previews: the fallback winner cannot be determined).',
      );
    }
    const key = storeKey(change.resourceCode, change.unit);
    const winner = winningRecord(this.records, key);
    const baseId = winner
      ? winner.id.replace(/#v\d+$/, '')
      : `PRC-${write.sourceKey}-${write.resourceId}-${normalizeUnit(change.unit)}-${locationKeyForId(write.location)}-${write.period.label}`;
    const nextVersion = (winner?.version ?? 0) + 1;
    const newRecord: ResourcePriceRecord = {
      id: `${baseId}#v${nextVersion}`,
      resourceId: change.resourceId ?? write.resourceId,
      resourceCode: change.resourceCode,
      resourceName: change.resourceName ?? winner?.resourceName ?? change.resourceCode,
      resourceType: winner?.resourceType ?? categoryToResourceType(change.category),
      unit: normalizeUnit(change.unit),
      unitRaw: change.unit,
      price: change.newPrice,
      currency: 'IDR',
      location: { ...write.location },
      period: { ...write.period, effectiveTo: null },
      sourceKey: write.sourceKey,
      sourceTier: winner?.sourceTier ?? 'OFFICIAL_GOVERNMENT',
      sourcePriority: winner?.sourcePriority ?? 1,
      sourceName: winner?.sourceName ?? 'Master price (sync workflow)',
      sourceType: winner?.sourceType ?? 'GOVERNMENT_REFERENCE',
      sourceDocument: write.sourceDocument ?? winner?.sourceDocument ?? null,
      retrievedAt: opts.changedAt.slice(0, 10),
      verificationStatus: winner?.verificationStatus ?? 'VERIFIED',
      matchMethod: winner?.matchMethod ?? 'EXACT_CODE',
      matchConfidence: winner?.matchConfidence ?? 1,
      notes: [
        ...(winner?.notes ?? []),
        `SYNC v${nextVersion}: supersedes ${winner ? winner.id : 'none'} (${change.oldPrice === null ? 'unpriced' : `Rp${change.oldPrice.toLocaleString('id-ID')}`} → Rp${change.newPrice.toLocaleString('id-ID')})`,
      ],
      version: nextVersion,
      status: 'ACTIVE',
      priceType: write.priceType ?? winner?.priceType ?? null,
      specContext: write.specContext ?? winner?.specContext ?? null,
      createdBy: opts.adminIdentity,
      updatedBy: opts.adminIdentity,
    };
    const nextRecords = this.records.map((r) => {
      if (winner && r.id === winner.id) {
        return {
          ...r,
          status: 'SUPERSEDED' as const,
          period: { ...r.period, effectiveTo: opts.changedAt.slice(0, 10) },
          updatedBy: opts.adminIdentity,
        };
      }
      return r;
    });
    nextRecords.push(newRecord);
    return new InMemorySyncMasterPriceStore(nextRecords);
  }
}

/** Build an in-memory sync store from price records (pipeline output or fixtures). */
export function createSyncMasterPriceStore(
  records: readonly ResourcePriceRecord[],
): SyncMasterPriceStore {
  return new InMemorySyncMasterPriceStore(records);
}

// ===========================================================================
// §13.2 — transaction integrity: the ten-step global price change workflow
// ===========================================================================

export type GlobalPriceChangeStep =
  | 'AUTHORIZE'
  | 'VALIDATE_PRICE'
  | 'COMPUTE_IMPACT'
  | 'VERIFY_PREVIEW_FRESH'
  | 'WRITE_HISTORY'
  | 'UPDATE_MASTER_PRICE'
  | 'INVALIDATE_CACHES'
  | 'RECALC_DERIVED'
  | 'RECORD_OPERATION'
  | 'RETURN_VERIFIED_RESULT';

export const GLOBAL_PRICE_CHANGE_STEPS: readonly GlobalPriceChangeStep[] = [
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
];

export interface GlobalPriceChangeStepRecord {
  step: GlobalPriceChangeStep;
  status: 'OK' | 'FAILED' | 'NOT_REACHED';
  detail: string | null;
}

export interface GlobalPriceChangeVerification {
  /** The canonical read after the sync, per changed key (must equal newPrice). */
  readsVerified: Array<{ key: string; expected: number | null; actual: number | null; ok: boolean }>;
  cacheVersionBefore: number | null;
  cacheVersionAfter: number | null;
  affectedAhspItemCount: number;
  affectedComponentReferenceCount: number;
  affectedProjectCount: number;
}

export interface GlobalPriceChangeRequest {
  /** The identity the change is authorized against (§4 — a VERIFIED identity is the server's job; tests pass test identities). */
  identity: unknown;
  change: MasterPriceChangeInput;
  /** The §4 write input (resourceId, unit, location, period, sourceKey, reason ≥ 10 chars). */
  write: MasterPriceWriteInput;
  catalogItems: readonly NationalAHSPItem[];
  projects: readonly ProjectImpactInput[];
  /** The sync target (in-memory in tests; the pipeline is the production writer). */
  store: SyncMasterPriceStore;
  /** The §4.4 history chain the workflow appends to (in-memory). */
  history: readonly MasterPriceHistoryEntry[];
  /** The price-change feed the workflow appends to (in-memory). */
  feed: readonly PriceChangeFeedEntry[];
  operationType?: 'GLOBAL_PRICE_PROPAGATION' | 'ROLLBACK';
  /** ISO timestamp for the run (default: now). Fixed in tests for determinism. */
  now?: string;
  /** Retry attempts for the mutating steps 6–8 (default 1 = no retry). */
  maxAttempts?: number;
  /** Cache invalidator seam (default: the real `invalidateSyncCaches`). */
  invalidateCachesFn?: () => SyncCacheInvalidation;
  /**
   * Freshness-state overrides (test seam): the workflow builds the
   * current state from its inputs (store + catalog + projects) and
   * applies these overrides on top — e.g. a moved baseline price to
   * prove a stale preview is refused.
   */
  currentStateOverride?: Partial<CurrentImpactState>;
  /**
   * Impact-preview override (rollback seam): when provided, step 3
   * uses this preview instead of computing one (the store baseline
   * is still verified first). Used by `rollbackGlobalPriceChange`
   * with the inverted preview — the §9 repricer prices the OLD side
   * from the live resolver, so a rollback MUST reuse the original
   * preview's numbers negated (§9's own rollback pattern), never a
   * fresh computation against stale old prices.
   */
  previewOverride?: MasterPriceImpactPreview;
}

export type GlobalPriceChangeResult =
  | {
      ok: true;
      operationId: string;
      store: SyncMasterPriceStore;
      history: readonly MasterPriceHistoryEntry[];
      feed: readonly PriceChangeFeedEntry[];
      syncHistoryEntry: SyncHistoryEntry;
      historyEntry: MasterPriceHistoryEntry;
      preview: MasterPriceImpactPreview;
      steps: GlobalPriceChangeStepRecord[];
      verification: GlobalPriceChangeVerification;
    }
  | {
      ok: false;
      failedAt: GlobalPriceChangeStep;
      reason: string;
      /** The ORIGINAL store/history/feed — a failed run never leaves a partial update. */
      store: SyncMasterPriceStore;
      history: readonly MasterPriceHistoryEntry[];
      feed: readonly PriceChangeFeedEntry[];
      syncHistoryEntry: SyncHistoryEntry;
      preview: MasterPriceImpactPreview | null;
      steps: GlobalPriceChangeStepRecord[];
      recoveryStatus: SyncRecoveryStatus;
    };

function adminIdFromIdentity(identity: unknown): string | null {
  if (typeof identity !== 'object' || identity === null || Array.isArray(identity)) return null;
  const id = identity as { kind?: unknown; userId?: unknown };
  if (id.kind === 'authenticated' && typeof id.userId === 'string' && id.userId.trim() !== '') {
    return id.userId;
  }
  return null;
}

/** Deterministic (non-transient) sync failures never retry. */
function isRetryableSyncError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('price REMOVAL')) return false;
  if (message.includes('Duplicate')) return false;
  if (message.includes('baseline mismatch')) return false;
  return true;
}

function emptySteps(): GlobalPriceChangeStepRecord[] {
  return GLOBAL_PRICE_CHANGE_STEPS.map((step) => ({ step, status: 'NOT_REACHED' as const, detail: null }));
}

function markStep(
  steps: GlobalPriceChangeStepRecord[],
  step: GlobalPriceChangeStep,
  status: 'OK' | 'FAILED',
  detail: string | null,
): void {
  const rec = steps.find((s) => s.step === step);
  if (rec) {
    rec.status = status;
    rec.detail = detail;
  }
}

function buildFailureSyncEntry(input: {
  operationType: 'GLOBAL_PRICE_PROPAGATION' | 'ROLLBACK';
  initiatedBy: string | null;
  sourceEntity: string;
  previousValue: number | null;
  newValue: number | null;
  preview: MasterPriceImpactPreview | null;
  completedSteps: number;
  completedAt: string;
  recoveryStatus: SyncRecoveryStatus;
  reason: string;
}): SyncHistoryEntry {
  const preview = input.preview;
  return buildSyncHistoryEntry({
    operationType: input.operationType,
    initiatedBy: input.initiatedBy,
    sourceEntity: input.sourceEntity,
    previousValue: input.previousValue,
    newValue: input.newValue,
    affectedAhspFamilies: preview
      ? [...new Set(preview.components.summary.byFamily.map((f) => f.family))].sort()
      : [],
    affectedComponents: preview
      ? [...new Set(preview.components.affected.map((c) => c.resourceKey))].sort()
      : [],
    affectedProjects: preview ? [...preview.affectedLivePriceProjects].sort() : [],
    successfulOperations: input.completedSteps,
    failedOperations: 1,
    unresolvedConflicts: [],
    completedAt: input.completedAt,
    recoveryStatus: input.recoveryStatus,
  });
}

/**
 * The §13.2 ten-step workflow for a global master price change.
 *
 * ATOMICITY (no server transaction exists — §4.1 BLOCKED): the
 * workflow builds every new state (store, §4.4 history chain, feed)
 * in memory and returns EITHER all of them (success) OR the original
 * inputs untouched (failure). A failure after the write discards the
 * new states — the caller never sees a half-applied change. Cache
 * invalidation is NOT reverted on failure: it only forces
 * recomputation, and recomputation against the UNCHANGED master
 * returns the old values — correct by construction.
 *
 * IDEMPOTENCY: re-running the same change fails at step 3 — the
 * store's baseline already moved (oldPrice no longer matches), so
 * no duplicate record is ever created.
 *
 * AUTHORIZATION: step 1 uses the §4 module with the SYNC channel.
 * With the honest local identity (anonymous while AUTH_ENABLED is
 * false) the workflow DENIES before any write — the engine never
 * mints an admin.
 */
export function executeGlobalPriceChange(
  request: GlobalPriceChangeRequest,
): GlobalPriceChangeResult {
  const now = request.now ?? new Date().toISOString();
  const operationType = request.operationType ?? 'GLOBAL_PRICE_PROPAGATION';
  const maxAttempts = request.maxAttempts ?? 1;
  const invalidateCachesFn = request.invalidateCachesFn ?? invalidateSyncCaches;
  const steps = emptySteps();
  const change = request.change;
  const key = priceChangeKey(change);
  const sourceEntity = `price:${key}`;
  const adminIdentity = adminIdFromIdentity(request.identity);

  const fail = (
    failedAt: GlobalPriceChangeStep,
    reason: string,
    preview: MasterPriceImpactPreview | null,
    completedCount: number,
    recoveryStatus: SyncRecoveryStatus,
  ): GlobalPriceChangeResult => {
    markStep(steps, failedAt, 'FAILED', reason);
    return {
      ok: false,
      failedAt,
      reason,
      store: request.store,
      history: request.history,
      feed: request.feed,
      syncHistoryEntry: buildFailureSyncEntry({
        operationType,
        initiatedBy: adminIdentity,
        sourceEntity,
        previousValue: change.oldPrice,
        newValue: change.newPrice,
        preview,
        completedSteps: completedCount,
        completedAt: now,
        recoveryStatus,
        reason,
      }),
      preview,
      steps,
      recoveryStatus,
    };
  };

  // --- Step 1: validate authorization (§4, SYNC channel). ---
  const decision = authorizeMasterPriceWriteVia(request.identity, 'EDIT_MASTER_PRICE', 'SYNC');
  if (!decision.allowed) {
    return fail(
      'AUTHORIZE',
      `${decision.code}: ${decision.reason}`,
      null,
      0,
      'NOT_NEEDED',
    );
  }
  markStep(steps, 'AUTHORIZE', 'OK', decision.reason);

  // --- Step 2: validate the new price (§4 write validation + sanity gate). ---
  const writeValidation = validateMasterPriceWrite(request.write);
  if (!writeValidation.valid) {
    return fail(
      'VALIDATE_PRICE',
      `Invalid price write: ${writeValidation.errors.join('; ')}`,
      null,
      1,
      'NOT_NEEDED',
    );
  }
  // The write input and the change must describe the SAME change — a
  // mismatch (e.g. write.price ≠ newPrice) would validate one price
  // and apply another.
  if (request.write.price !== change.newPrice) {
    return fail(
      'VALIDATE_PRICE',
      `Write/change mismatch: the write input prices the record at ` +
        `${request.write.price === null ? 'unpriced (null)' : `Rp${request.write.price.toLocaleString('id-ID')}`} but the change sets ` +
        `${change.newPrice === null ? 'unpriced (null)' : `Rp${change.newPrice.toLocaleString('id-ID')}`}`,
      null,
      1,
      'NOT_NEEDED',
    );
  }
  if (request.write.unit !== change.unit) {
    return fail(
      'VALIDATE_PRICE',
      `Write/change mismatch: the write input uses unit "${request.write.unit}" but the change uses unit "${change.unit}"`,
      null,
      1,
      'NOT_NEEDED',
    );
  }
  if (change.resourceId !== undefined && change.resourceId !== request.write.resourceId) {
    return fail(
      'VALIDATE_PRICE',
      `Write/change mismatch: the write input targets resource "${request.write.resourceId}" but the change targets "${change.resourceId}"`,
      null,
      1,
      'NOT_NEEDED',
    );
  }
  let sanityDetail: string | null = 'sanity gate skipped (no resource name supplied)';
  if (change.resourceName && change.newPrice !== null) {
    const sanity = priceSanityValidator.validatePrice(change.resourceName, change.newPrice, change.unit);
    if (sanity.status === 'PRICE_INVALID') {
      return fail(
        'VALIDATE_PRICE',
        `Sanity gate rejected the new price: ${sanity.rejectionReason ?? 'PRICE_INVALID'}`,
        null,
        1,
        'NOT_NEEDED',
      );
    }
    sanityDetail = `sanity gate ${sanity.status} for ${change.resourceName} @ Rp${change.newPrice.toLocaleString('id-ID')}/${change.unit}`;
  }
  markStep(steps, 'VALIDATE_PRICE', 'OK', sanityDetail);

  // --- Step 3: calculate impact (§9) — baseline verified against the STORE first. ---
  const storeBaseline = request.store.readPrice(change.resourceCode, change.unit);
  if (storeBaseline !== change.oldPrice) {
    return fail(
      'COMPUTE_IMPACT',
      `baseline mismatch for ${key}: the stated old price is ` +
        `${change.oldPrice === null ? 'unpriced (null)' : `Rp${change.oldPrice.toLocaleString('id-ID')}`} but the sync target ` +
        `currently resolves ${storeBaseline === null ? 'unpriced (null)' : `Rp${storeBaseline.toLocaleString('id-ID')}`} ` +
        `— the change was already applied, or the price moved since the preview was requested`,
      null,
      2,
      'NOT_NEEDED',
    );
  }
  const baselineOverride = new Map<string, number | null>([[key, storeBaseline]]);
  const preview = request.previewOverride ?? computeMasterPriceImpact({
    priceChanges: [change],
    catalogItems: request.catalogItems,
    projects: request.projects,
    masterPriceVersion: MASTER_PRICE_VERSION,
    computedAt: now,
    baselineOverride,
  });
  if (preview.status === 'NOT_COMPUTED') {
    return fail(
      'COMPUTE_IMPACT',
      `Impact not computed: ${preview.notComputedReasons.join('; ')}`,
      preview,
      2,
      'NOT_NEEDED',
    );
  }
  if (preview.status === 'STALE') {
    return fail(
      'COMPUTE_IMPACT',
      `Impact preview is STALE: ${preview.staleReasons.join('; ')}`,
      preview,
      2,
      'NOT_NEEDED',
    );
  }
  markStep(
    steps,
    'COMPUTE_IMPACT',
    'OK',
    `${preview.items.summary.totalAffected} AHSP item(s), ${preview.components.summary.affectedReferenceCount} component ref(s), ${preview.projects.summary.affectedProjectCount} project(s) affected`,
  );

  // --- Step 4: verify the preview is still current (fingerprint §9). ---
  const currentState: CurrentImpactState = {
    masterPriceVersion: MASTER_PRICE_VERSION,
    catalogChecksum: computeCatalogChecksum(request.catalogItems),
    currentBaselinePrices: new Map<string, number | null>([[key, storeBaseline]]),
    projectsFingerprint: computeProjectsFingerprint(request.projects),
    ...request.currentStateOverride,
  };
  const freshness = validateImpactPreviewFreshness(preview, currentState);
  if (!freshness.fresh) {
    return fail(
      'VERIFY_PREVIEW_FRESH',
      `Preview is stale: ${freshness.reasons.join('; ')}`,
      preview,
      3,
      'NOT_NEEDED',
    );
  }
  markStep(
    steps,
    'VERIFY_PREVIEW_FRESH',
    'OK',
    freshness.checksSkipped.length > 0
      ? `fresh (checks skipped: ${freshness.checksSkipped.join('; ')})`
      : 'fresh (all checks ran)',
  );

  // --- Step 5: write the price history (§4.4). Constructed now (per the
  // specified order); committed atomically with the store update at step 10
  // (the new chain is only returned on success). ---
  const winnerBefore = winningRecordForHistory(request.store, change);
  let historyEntry: MasterPriceHistoryEntry;
  let newHistory: readonly MasterPriceHistoryEntry[];
  try {
    historyEntry = buildHistoryEntry({
      priceRecordId: winnerBefore ? winnerBefore.id : null,
      resourceId: change.resourceId ?? request.write.resourceId,
      operation:
        operationType === 'ROLLBACK'
          ? 'ROLLBACK'
          : winnerBefore
            ? 'UPDATE'
            : 'CREATE',
      previousAmount: change.oldPrice,
      newAmount: change.newPrice,
      // A CREATE has no previous price — previous unit/region are
      // honestly null, never the new values restated.
      previousUnit: winnerBefore ? change.unit : null,
      newUnit: change.unit,
      previousRegion: winnerBefore ? winnerBefore.location : null,
      newRegion: request.write.location,
      sourceKey: request.write.sourceKey,
      sourceTier: winnerBefore ? winnerBefore.sourceTier : 'OFFICIAL_GOVERNMENT',
      sourceDocument: request.write.sourceDocument ?? winnerBefore?.sourceDocument ?? null,
      verificationStatus: winnerBefore ? winnerBefore.verificationStatus : 'VERIFIED',
      adminIdentity,
      changedAt: now,
      reason: request.write.reason,
      affectedAhspReferences: [...preview.affectedAhspReferences],
      affectedLivePriceProjects: [...preview.affectedLivePriceProjects],
      publicationStatus: 'PUBLISHED',
      previousVersion: winnerBefore ? winnerBefore.version ?? 1 : null,
      newVersion: winnerBefore ? (winnerBefore.version ?? 1) + 1 : 1,
      masterPriceVersion: MASTER_PRICE_VERSION,
    });
    newHistory = appendHistoryEntry(request.history, historyEntry);
  } catch (err) {
    return fail(
      'WRITE_HISTORY',
      `Could not write the price history entry: ${err instanceof Error ? err.message : String(err)}`,
      preview,
      4,
      'NOT_NEEDED',
    );
  }
  markStep(steps, 'WRITE_HISTORY', 'OK', `history entry ${historyEntry.id}`);

  // --- Steps 6–8: the mutating steps (retryable). A failure here
  // compensates: the new store/history are discarded (the originals
  // are returned) and the run is recorded ROLLBACK_APPLIED. ---
  let newStore: SyncMasterPriceStore;
  try {
    const applied = runWithRetry(
      () => request.store.applyPriceChange(change, request.write, { changedAt: now, adminIdentity }),
      { maxAttempts, isRetryable: isRetryableSyncError, label: 'UPDATE_MASTER_PRICE' },
    );
    newStore = applied.result;
    markStep(
      steps,
      'UPDATE_MASTER_PRICE',
      'OK',
      applied.attempts > 1
        ? `applied after ${applied.attempts} attempts (failures: ${applied.attemptErrors.join('; ')})`
        : 'applied',
    );
  } catch (err) {
    return fail(
      'UPDATE_MASTER_PRICE',
      `Could not update the master price: ${err instanceof Error ? err.message : String(err)}`,
      preview,
      5,
      'ROLLBACK_APPLIED',
    );
  }

  let invalidation: SyncCacheInvalidation;
  try {
    const invalidated = runWithRetry(invalidateCachesFn, {
      maxAttempts,
      isRetryable: isRetryableSyncError,
      label: 'INVALIDATE_CACHES',
    });
    invalidation = invalidated.result;
    markStep(
      steps,
      'INVALIDATE_CACHES',
      'OK',
      `cache generation ${invalidation.cacheVersionBefore} → ${invalidation.cacheVersionAfter}`,
    );
  } catch (err) {
    return fail(
      'INVALIDATE_CACHES',
      `Could not invalidate caches: ${err instanceof Error ? err.message : String(err)}`,
      preview,
      6,
      'ROLLBACK_APPLIED',
    );
  }

  // --- Step 8: recalculate / invalidate derived AHSP values + VERIFY.
  // The derived totals are the preview's own recomputation (computed
  // with the new price); the verification is that the canonical read
  // against the NEW store returns the new price. Sync is never
  // claimed complete until that read succeeds. ---
  let verification: GlobalPriceChangeVerification;
  try {
    const verified = runWithRetry(
      () => {
        const actual = newStore.readPrice(change.resourceCode, change.unit);
        if (actual !== change.newPrice) {
          throw new Error(
            `Verification failed: canonical read after sync returned ` +
              `${actual === null ? 'unpriced (null)' : `Rp${actual.toLocaleString('id-ID')}`} for ${key}, expected ` +
              `${change.newPrice === null ? 'unpriced (null)' : `Rp${change.newPrice.toLocaleString('id-ID')}`} — refusing to claim the sync complete`,
          );
        }
        return {
          readsVerified: [{ key, expected: change.newPrice, actual, ok: true }],
          cacheVersionBefore: invalidation.cacheVersionBefore,
          cacheVersionAfter: invalidation.cacheVersionAfter,
          affectedAhspItemCount: preview.items.summary.totalAffected,
          affectedComponentReferenceCount: preview.components.summary.affectedReferenceCount,
          affectedProjectCount: preview.projects.summary.affectedProjectCount,
        };
      },
      { maxAttempts, isRetryable: isRetryableSyncError, label: 'RECALC_DERIVED' },
    );
    verification = verified.result;
    markStep(
      steps,
      'RECALC_DERIVED',
      'OK',
      `canonical read after sync = Rp${(change.newPrice ?? 0).toLocaleString('id-ID')}; ${preview.items.summary.totalAffected} derived AHSP item(s) recalculated`,
    );
  } catch (err) {
    return fail(
      'RECALC_DERIVED',
      err instanceof Error ? err.message : String(err),
      preview,
      7,
      'ROLLBACK_APPLIED',
    );
  }

  // --- Step 9: record the operation (§13.4) + the price-change feed. ---
  let newFeed: readonly PriceChangeFeedEntry[];
  let syncHistoryEntry: SyncHistoryEntry;
  try {
    const feedEntry = buildPriceChangeFeedEntry({
      resourceCode: change.resourceCode,
      resourceId: change.resourceId ?? request.write.resourceId,
      resourceName: change.resourceName ?? null,
      category: change.category ?? null,
      unit: change.unit,
      oldPrice: change.oldPrice,
      newPrice: change.newPrice,
      region: change.region ?? null,
      source: change.source ?? null,
      changedAt: now,
      changedBy: adminIdentity,
      reason: request.write.reason,
      masterPriceVersion: MASTER_PRICE_VERSION,
      historyEntryId: historyEntry.id,
      sourceKind: 'SYNC',
    });
    newFeed = appendPriceChangeFeedEntry(request.feed, feedEntry);
    syncHistoryEntry = buildSyncHistoryEntry({
      operationType,
      initiatedBy: adminIdentity,
      sourceEntity,
      previousValue: change.oldPrice,
      newValue: change.newPrice,
      affectedAhspFamilies: [...new Set(preview.components.summary.byFamily.map((f) => f.family))].sort(),
      affectedComponents: [...new Set(preview.components.affected.map((c) => c.resourceKey))].sort(),
      affectedProjects: [...preview.affectedLivePriceProjects].sort(),
      successfulOperations: GLOBAL_PRICE_CHANGE_STEPS.length,
      failedOperations: 0,
      unresolvedConflicts: [],
      completedAt: now,
      recoveryStatus: 'NOT_NEEDED',
    });
  } catch (err) {
    return fail(
      'RECORD_OPERATION',
      `Could not record the operation: ${err instanceof Error ? err.message : String(err)}`,
      preview,
      8,
      'ROLLBACK_APPLIED',
    );
  }
  markStep(steps, 'RECORD_OPERATION', 'OK', `sync operation ${syncHistoryEntry.operationId}`);

  // --- Step 10: return the verified completion result. ---
  markStep(steps, 'RETURN_VERIFIED_RESULT', 'OK', 'all ten steps completed and verified');
  return {
    ok: true,
    operationId: syncHistoryEntry.operationId,
    store: newStore,
    history: newHistory,
    feed: newFeed,
    syncHistoryEntry,
    historyEntry,
    preview,
    steps,
    verification,
  };
}

/** The winning record for a change's key (for the §4.4 history entry's before-state). */
function winningRecordForHistory(
  store: SyncMasterPriceStore,
  change: MasterPriceChangeInput,
): ResourcePriceRecord | null {
  const key = storeKey(change.resourceCode, change.unit);
  return winningRecord(store.records, key);
}

// ===========================================================================
// §13 (10) — rollback: the inverse change through the same ten steps
// ===========================================================================

/** Swap old/new of one price change (the rollback's change). */
export function invertMasterPriceChange(change: MasterPriceChangeInput): MasterPriceChangeInput {
  return { ...change, oldPrice: change.newPrice, newPrice: change.oldPrice };
}

function negateNullable(value: number | null): number | null {
  return value === null ? null : -value;
}

/** Percent change vs a base, 2 decimals — the §9 formula (SafeDecimalEngine channel). */
function percentChangeOf(delta: number | null, base: number | null): number | null {
  if (delta === null || base === null || base === 0) return null;
  return SafeDecimalEngine.safeRound(
    SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(delta, base, 6), 100, 2),
    2,
  );
}

function invertItemImpact(item: AhspItemImpact): AhspItemImpact {
  const delta = item.delta === null ? null : -item.delta;
  return {
    ...item,
    oldUnitPrice: item.newUnitPrice,
    newUnitPrice: item.oldUnitPrice,
    delta,
    percentChange: percentChangeOf(delta, item.newUnitPrice),
  };
}

function invertProjectItemImpact(item: ProjectItemImpact): ProjectItemImpact {
  return {
    ...item,
    oldUnitPrice: item.newUnitPrice,
    newUnitPrice: item.oldUnitPrice,
    oldAmount: item.newAmount,
    newAmount: item.oldAmount,
    deltaAmount: negateNullable(item.deltaAmount),
    status:
      item.status === 'NEWLY_PRICED'
        ? 'BECAME_UNPRICED'
        : item.status === 'BECAME_UNPRICED'
          ? 'NEWLY_PRICED'
          : item.status,
  };
}

function invertProjectImpact(project: ProjectImpact): ProjectImpact {
  // A NOT_COMPUTABLE project has null new totals — the inverse is
  // equally uncomputable (never invent a new total from the old one).
  return {
    ...project,
    oldGrandTotal: project.newGrandTotal ?? project.oldGrandTotal,
    newGrandTotal: project.newGrandTotal === null ? null : project.oldGrandTotal,
    oldDirectCost: project.newDirectCost ?? project.oldDirectCost,
    newDirectCost: project.newDirectCost === null ? null : project.oldDirectCost,
    deltaGrandTotal: negateNullable(project.deltaGrandTotal),
    deltaDirectCost: negateNullable(project.deltaDirectCost),
    items: project.items.map(invertProjectItemImpact),
    adoptionPreview:
      project.adoptionPreview === null
        ? null
        : {
            ...project.adoptionPreview,
            newGrandTotal:
              project.adoptionPreview.deltaGrandTotal === null
                ? null
                : project.oldGrandTotal - project.adoptionPreview.deltaGrandTotal,
            deltaGrandTotal: negateNullable(project.adoptionPreview.deltaGrandTotal),
          },
  };
}

/**
 * The INVERSE of a computed master-price impact preview: every delta
 * negated, every old/new swapped (§9's own rollback pattern:
 * delta(A→B) = −delta(B→A)). The fingerprint is REBUILT over the
 * rollback-time state (post-change baselines), so the inverse preview
 * passes freshness validation against the current world — reusing
 * the original fingerprint would make every rollback instantly stale.
 *
 * WHY NOT RECOMPUTE: the §9 repricer prices the OLD side from the
 * live resolver. After the forward change, the live resolver still
 * reads the PRE-change master (the store is the workflow's target,
 * not the resolver's data) — a fresh §9 computation of the inverse
 * change would price its old side at the pre-change prices and
 * report delta 0. The inversion reuses the original preview's own
 * numbers, which were computed against the true pre-change state.
 * Throws unless the preview is a COMPUTED master-price preview.
 */
export function invertMasterPriceImpactPreview(
  preview: MasterPriceImpactPreview,
  input: {
    catalogChecksum: string | null;
    projectsFingerprint: string;
    masterPriceVersion?: string;
    computedAt: string;
  },
): MasterPriceImpactPreview {
  if (preview.status !== 'COMPUTED') {
    throw new Error(
      `Cannot invert an impact preview with status ${preview.status} — only a COMPUTED preview can be rolled back`,
    );
  }
  if (preview.kind !== 'MASTER_PRICE_CHANGE') {
    throw new Error(
      `Cannot invert an impact preview of kind ${preview.kind} — only MASTER_PRICE_CHANGE previews invert (version rollbacks use the §8 rollback path)`,
    );
  }
  const masterPriceVersion = input.masterPriceVersion ?? MASTER_PRICE_VERSION;
  const invertedChanges = preview.change.priceChanges.map(invertMasterPriceChange);
  return {
    status: 'COMPUTED',
    kind: 'MASTER_PRICE_CHANGE',
    computedAt: input.computedAt,
    note:
      `Rollback (inverse) of the master price change preview computed at ${preview.computedAt}: ` +
      'all deltas negated, all old/new values swapped (§9 rollback pattern).',
    notComputedReasons: [],
    staleReasons: [],
    fingerprint: buildFingerprint({
      kind: 'MASTER_PRICE_CHANGE',
      family: null,
      sourceVersionId: null,
      targetVersionId: null,
      baseContentChecksum: input.catalogChecksum,
      newContentChecksum: input.catalogChecksum,
      activeVersionIdAtCompute: null,
      masterPriceVersion,
      changedResourceBaseline: invertedChanges.map((c) => ({
        key: priceChangeKey(c),
        oldPrice: c.oldPrice,
      })),
      projectsFingerprint: input.projectsFingerprint,
      computedAt: input.computedAt,
    }),
    change: {
      family: preview.change.family,
      sourceVersionId: preview.change.sourceVersionId,
      targetVersionId: preview.change.targetVersionId,
      priceChanges: invertedChanges,
      nonBindingChanges: [...preview.change.nonBindingChanges],
    },
    items: {
      summary: { ...preview.items.summary },
      changed: preview.items.changed.map(invertItemImpact),
    },
    components: {
      summary: {
        affectedReferenceCount: preview.components.summary.affectedReferenceCount,
        byFamily: preview.components.summary.byFamily.map((f) => ({ ...f })),
        codelessComponentCount: preview.components.summary.codelessComponentCount,
      },
      affected: preview.components.affected.map((c: AffectedComponentRef) => ({
        ...c,
        oldPrice: c.newPrice,
        newPrice: c.oldPrice,
        deltaPerUnit: negateNullable(c.deltaPerUnit),
      })),
    },
    projects: {
      summary: { ...preview.projects.summary },
      projects: preview.projects.projects.map(invertProjectImpact),
    },
    aggregates: {
      totalDeltaGrandTotal: negateNullable(preview.aggregates.totalDeltaGrandTotal),
      totalDeltaDirectCost: negateNullable(preview.aggregates.totalDeltaDirectCost),
      newlyPricedItemCount: preview.aggregates.becameUnpricedItemCount,
      becameUnpricedItemCount: preview.aggregates.newlyPricedItemCount,
      uncomputableProjectCount: preview.aggregates.uncomputableProjectCount,
    },
    affectedAhspReferences: [...preview.affectedAhspReferences],
    affectedLivePriceProjects: [...preview.affectedLivePriceProjects],
  };
}

export interface RollbackGlobalPriceChangeInput {
  identity: unknown;
  /** The COMPUTED preview of the change being rolled back (returned by the original `executeGlobalPriceChange`). */
  originalPreview: MasterPriceImpactPreview;
  /** The change being rolled back (its newPrice is the current price). */
  originalChange: MasterPriceChangeInput;
  /** The rollback's write input (same resource/unit/location/period/sourceKey; the reason is the ROLLBACK reason, ≥ 10 chars). */
  write: MasterPriceWriteInput;
  catalogItems: readonly NationalAHSPItem[];
  projects: readonly ProjectImpactInput[];
  store: SyncMasterPriceStore;
  history: readonly MasterPriceHistoryEntry[];
  feed: readonly PriceChangeFeedEntry[];
  now?: string;
  maxAttempts?: number;
  invalidateCachesFn?: () => SyncCacheInvalidation;
  currentStateOverride?: Partial<CurrentImpactState>;
}

/**
 * Roll back a completed global price change: the INVERSE change
 * (old↔new swapped) through the SAME ten steps, with the inverted
 * preview (§9 rollback pattern). The store baseline check refuses
 * the rollback when the price moved again since the change
 * (fail-closed — rolling back over a newer price would corrupt the
 * master). Rolling back an ADDITION (oldPrice null) is refused at
 * step 6: its inverse is a removal, and removals need the staged
 * re-preview path (§9) — the workflow never silently deletes a price.
 */
export function rollbackGlobalPriceChange(
  input: RollbackGlobalPriceChangeInput,
): GlobalPriceChangeResult {
  const now = input.now ?? new Date().toISOString();
  const inverseChange = invertMasterPriceChange(input.originalChange);
  const inversePreview = invertMasterPriceImpactPreview(input.originalPreview, {
    catalogChecksum: computeCatalogChecksum(input.catalogItems),
    projectsFingerprint: computeProjectsFingerprint(input.projects),
    computedAt: now,
  });
  return executeGlobalPriceChange({
    identity: input.identity,
    change: inverseChange,
    write: input.write,
    catalogItems: input.catalogItems,
    projects: input.projects,
    store: input.store,
    history: input.history,
    feed: input.feed,
    operationType: 'ROLLBACK',
    now,
    maxAttempts: input.maxAttempts,
    invalidateCachesFn: input.invalidateCachesFn,
    currentStateOverride: input.currentStateOverride,
    previewOverride: inversePreview,
  });
}

// ===========================================================================
// §13 (10) — recovery verification after a failed run
// ===========================================================================

export interface SyncRecoveryReport {
  /** True when the pre-change state is intact (canonical read = old price, original store/history/feed returned). */
  recovered: boolean;
  recoveryStatus: SyncRecoveryStatus;
  /** The canonical price now read for the key (must equal the pre-change price). */
  currentPrice: number | null;
  expectedPrice: number | null;
  reason: string;
}

/**
 * Verify, after a FAILED workflow run, that no partial update
 * survived: the canonical read for the changed key must return the
 * PRE-change price, and the failed result must carry the ORIGINAL
 * store/history/feed references. This is the recovery check the
 * caller runs before retrying or escalating — it proves the
 * rollback, rather than assuming it.
 */
export function verifyRollbackComplete(
  failed: Extract<GlobalPriceChangeResult, { ok: false }>,
  change: MasterPriceChangeInput,
  original: {
    store: SyncMasterPriceStore;
    history: readonly MasterPriceHistoryEntry[];
    feed: readonly PriceChangeFeedEntry[];
  },
): SyncRecoveryReport {
  const currentPrice = failed.store.readPrice(change.resourceCode, change.unit);
  const sameStore = failed.store === original.store;
  const sameHistory = failed.history === original.history;
  const sameFeed = failed.feed === original.feed;
  const priceIntact = currentPrice === change.oldPrice;
  const recovered = sameStore && sameHistory && sameFeed && priceIntact;
  return {
    recovered,
    recoveryStatus: failed.recoveryStatus,
    currentPrice,
    expectedPrice: change.oldPrice,
    reason: recovered
      ? 'No partial update: the failed run returned the original store/history/feed and the canonical read still returns the pre-change price.'
      : [
          !sameStore ? 'the returned store is not the original store' : '',
          !sameHistory ? 'the returned history is not the original history' : '',
          !sameFeed ? 'the returned feed is not the original feed' : '',
          !priceIntact
            ? `the canonical read returned ${currentPrice === null ? 'unpriced (null)' : `Rp${currentPrice.toLocaleString('id-ID')}`}, expected the pre-change ${change.oldPrice === null ? 'unpriced (null)' : `Rp${change.oldPrice.toLocaleString('id-ID')}`}`
            : '',
        ]
          .filter(Boolean)
          .join('; '),
  };
}

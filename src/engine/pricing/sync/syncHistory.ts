/**
 * MASTER PRICING §13.4 — SYNCHRONIZATION HISTORY (pure writer + interim JSONL trail).
 * =================================================================================
 *
 * Every synchronization operation records the thirteen §13.4 fields
 * (thirteen bullets in the spec; "previous and new values" is one
 * bullet holding two fields, so fourteen fields in total):
 *
 *   1.  operationId            — deterministic content-hash id `SYN-<16 hex>`
 *   2.  operationType          — what kind of sync ran
 *   3.  initiatedBy            — initiating administrator (auth id, or NULL:
 *                                honest no-auth — never fabricated)
 *   4.  sourceEntity           — the entity the sync acted on
 *                                (`price:<code>|<unit>`, `ahsp:<FAMILY>@<version>`,
 *                                `pipeline:price:pipeline`, …)
 *   5.  previousValue          — price before (null when the operation is
 *                                not a price change)
 *   6.  newValue               — price after (null likewise)
 *   7.  affectedAhspFamilies   — AHSP families the change touched
 *   8.  affectedComponents     — component keys / codes touched
 *   9.  affectedProjects       — project ids touched (LIVE-mode projects
 *                                that reprice; SNAPSHOT/OVERRIDE projects
 *                                are never silently touched)
 *   10. successfulOperations   — count of sub-operations that succeeded
 *   11. failedOperations       — count of sub-operations that failed
 *   12. unresolvedConflicts    — conflicts the engine could not resolve
 *                                (each a human-readable description)
 *   13. completedAt            — ISO completion timestamp
 *   14. recoveryStatus         — what recovery did (or that none was needed)
 *
 * APPEND-ONLY, in three layers (the §4.4 pattern):
 *   1. LOCAL (this module): entries are frozen objects; the only
 *      operation is `appendSyncHistoryEntry` (returns a NEW array,
 *      refuses duplicate ids). There is NO update/delete function —
 *      the test suite pins the exported API surface.
 *   2. INTERIM TRAIL: append-only JSONL at
 *      data/price2026/reports/sync_history.jsonl — one entry per line,
 *      written per sync run by scripts/price2026/syncPipeline.ts.
 *      An honest TEMPORARY audit trail, NOT a replacement for the
 *      server history (documented in the file header + the §13 report).
 *   3. SERVER (future): the `sync_history` table in
 *      supabase/migrations/20261116_master_price_governance.sql
 *      (RLS insert-only) — NOT APPLIED yet, so the server history
 *      does not exist either.
 *
 * Identity honesty: `initiatedBy` is the authenticated admin's
 * auth.users id, or NULL when there is no authentication. This module
 * takes the identity as INPUT and never verifies it — verification is
 * the (blocked) server's job.
 */
import type { AhspFamily } from '../../../data/nationalCostDatabase/ahspVersioning';
import { MASTER_PRICE_VERSION } from '../../../data/priceDatabase2026/types';

/** Schema version of one sync history entry (bumped only with a migration). */
export const SYNC_HISTORY_SCHEMA_VERSION = 1 as const;

/** Interim JSONL trail location (repo-relative). */
export const SYNC_HISTORY_JSONL_PATH = 'data/price2026/reports/sync_history.jsonl';

/** The ten §13 capabilities, as operation types (plus DRY_RUN + ROLLBACK + RECOVERY). */
export type SyncOperationType =
  | 'FULL_RECONCILIATION' // §13 (1): initial full reconciliation
  | 'INCREMENTAL_SYNC' // §13 (2): incremental synchronization
  | 'ADMIN_TRIGGERED_SYNC' // §13 (3): administrator-triggered synchronization
  | 'GLOBAL_PRICE_PROPAGATION' // §13 (4): approved global master price change
  | 'AHSP_VERSION_SYNC' // §13 (5): AHSP version synchronization
  | 'DRY_RUN' // §13 (6): dry-run mode (no writes)
  | 'ROLLBACK' // §13 (10): rollback of a completed operation
  | 'RECOVERY'; // §13 (10): recovery after a failed operation

export const SYNC_OPERATION_TYPES: readonly SyncOperationType[] = [
  'FULL_RECONCILIATION',
  'INCREMENTAL_SYNC',
  'ADMIN_TRIGGERED_SYNC',
  'GLOBAL_PRICE_PROPAGATION',
  'AHSP_VERSION_SYNC',
  'DRY_RUN',
  'ROLLBACK',
  'RECOVERY',
];

/**
 * What recovery did after the operation. NOT_NEEDED means the
 * operation completed (or was refused before any write) so no
 * recovery was required; NOT_APPLICABLE is for read-only operations
 * (dry-run) that never needed recovery by construction.
 */
export type SyncRecoveryStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_NEEDED'
  | 'RECOVERED'
  | 'ROLLBACK_APPLIED'
  | 'RECOVERY_FAILED'
  | 'RECOVERY_PENDING';

export const SYNC_RECOVERY_STATUSES: readonly SyncRecoveryStatus[] = [
  'NOT_APPLICABLE',
  'NOT_NEEDED',
  'RECOVERED',
  'ROLLBACK_APPLIED',
  'RECOVERY_FAILED',
  'RECOVERY_PENDING',
];

/** One §13.4 sync history entry — every field, in one entry. */
export interface SyncHistoryEntry {
  /** Deterministic content-hash id: `SYN-<16 hex>` — same input, same id. */
  operationId: string;
  schemaVersion: typeof SYNC_HISTORY_SCHEMA_VERSION;
  operationType: SyncOperationType;
  /** Authenticated admin id, or NULL (honest no-auth). Never fabricated. */
  initiatedBy: string | null;
  /** The entity the sync acted on (see module header for formats). */
  sourceEntity: string | null;
  previousValue: number | null;
  newValue: number | null;
  affectedAhspFamilies: AhspFamily[];
  affectedComponents: string[];
  affectedProjects: string[];
  successfulOperations: number;
  failedOperations: number;
  unresolvedConflicts: string[];
  /** ISO timestamp of completion. */
  completedAt: string;
  recoveryStatus: SyncRecoveryStatus;
}

export type SyncHistoryInput = Omit<SyncHistoryEntry, 'operationId' | 'schemaVersion'>;

// ---------------------------------------------------------------------------
// Deterministic id (FNV-1a 64-bit, hex) — pure, no dependency
// ---------------------------------------------------------------------------

function fnv1aHex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function entryIdFor(input: SyncHistoryInput): string {
  const canonical = JSON.stringify([
    input.operationType,
    input.initiatedBy,
    input.sourceEntity,
    input.previousValue,
    input.newValue,
    [...input.affectedAhspFamilies].sort(),
    [...input.affectedComponents].sort(),
    [...input.affectedProjects].sort(),
    input.successfulOperations,
    input.failedOperations,
    [...input.unresolvedConflicts].sort(),
    input.completedAt,
    input.recoveryStatus,
  ]);
  return `SYN-${fnv1aHex(canonical)}`;
}

// ---------------------------------------------------------------------------
// Builder (validates; freezes the entry so it cannot be rewritten in memory)
// ---------------------------------------------------------------------------

export function buildSyncHistoryEntry(input: SyncHistoryInput): SyncHistoryEntry {
  if (typeof input.completedAt !== 'string' || Number.isNaN(Date.parse(input.completedAt))) {
    throw new Error(`completedAt must be a valid ISO timestamp, got ${JSON.stringify(input.completedAt)}`);
  }
  for (const [field, value] of [
    ['previousValue', input.previousValue],
    ['newValue', input.newValue],
  ] as const) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new Error(`${field} must be null (not a price change) or a finite number >= 0`);
    }
  }
  for (const [field, value] of [
    ['successfulOperations', input.successfulOperations],
    ['failedOperations', input.failedOperations],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer, got ${String(value)}`);
    }
  }
  if (!Array.isArray(input.affectedAhspFamilies) || !Array.isArray(input.affectedComponents) ||
      !Array.isArray(input.affectedProjects) || !Array.isArray(input.unresolvedConflicts)) {
    throw new Error('affectedAhspFamilies, affectedComponents, affectedProjects and unresolvedConflicts must be arrays');
  }
  if (!(SYNC_OPERATION_TYPES as readonly string[]).includes(input.operationType)) {
    throw new Error(`Unknown sync operation type ${JSON.stringify(input.operationType)}`);
  }
  if (!(SYNC_RECOVERY_STATUSES as readonly string[]).includes(input.recoveryStatus)) {
    throw new Error(`Unknown sync recovery status ${JSON.stringify(input.recoveryStatus)}`);
  }
  const entry: SyncHistoryEntry = Object.freeze({
    ...input,
    operationId: entryIdFor(input),
    schemaVersion: SYNC_HISTORY_SCHEMA_VERSION,
    affectedAhspFamilies: freezeArray(input.affectedAhspFamilies),
    affectedComponents: freezeArray(input.affectedComponents),
    affectedProjects: freezeArray(input.affectedProjects),
    unresolvedConflicts: freezeArray(input.unresolvedConflicts),
  });
  return entry;
}

/**
 * Freeze a copy of an array and keep its mutable element type.
 * (Object.freeze alone returns `readonly T[]`, which is not
 * assignable to `T[]` — the cast is the documented escape: the array
 * IS frozen at runtime, so no caller can push to it.)
 */
function freezeArray<T>(arr: readonly T[]): T[] {
  return Object.freeze([...arr]) as T[];
}

/**
 * Append-only write: returns a NEW (frozen) array with the entry
 * appended. Refuses a duplicate id (idempotency: re-appending the
 * same entry is an error, not a silent second row). Never mutates the
 * input array. There is intentionally no update or delete operation.
 */
export function appendSyncHistoryEntry(
  entries: readonly SyncHistoryEntry[],
  entry: SyncHistoryEntry,
): readonly SyncHistoryEntry[] {
  if (entries.some((e) => e.operationId === entry.operationId)) {
    throw new Error(`Duplicate sync history entry id ${entry.operationId} — history is append-only, re-append refused`);
  }
  return Object.freeze([...entries, entry]);
}

/** Validate a history chain: unique ids, required fields, sane counts. */
export function validateSyncHistoryEntries(
  entries: readonly SyncHistoryEntry[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const where = `entry[${i}]${e.operationId ? ` ${e.operationId}` : ''}`;
    if (!e.operationId) errors.push(`${where}: missing operationId`);
    else if (seen.has(e.operationId)) errors.push(`${where}: duplicate operationId`);
    else seen.add(e.operationId);
    if (e.schemaVersion !== SYNC_HISTORY_SCHEMA_VERSION) {
      errors.push(`${where}: unexpected schemaVersion ${String(e.schemaVersion)}`);
    }
    if (typeof e.completedAt !== 'string' || Number.isNaN(Date.parse(e.completedAt))) {
      errors.push(`${where}: completedAt is not a valid ISO timestamp`);
    }
    for (const [field, value] of [
      ['previousValue', e.previousValue],
      ['newValue', e.newValue],
    ] as const) {
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        errors.push(`${where}: ${field} must be null or a finite number >= 0`);
      }
    }
    for (const [field, value] of [
      ['successfulOperations', e.successfulOperations],
      ['failedOperations', e.failedOperations],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        errors.push(`${where}: ${field} must be a non-negative integer`);
      }
    }
  });
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Interim JSONL trail (data/price2026/reports/sync_history.jsonl)
// ---------------------------------------------------------------------------

export interface SyncHistoryJsonlHeader {
  kind: 'HEADER';
  schemaVersion: typeof SYNC_HISTORY_SCHEMA_VERSION;
  generatedAt: string;
  masterPriceVersion: string;
  /** Honest scope statement — this file is an interim trail, not the server history. */
  note: string;
}

export const SYNC_HISTORY_JSONL_NOTE =
  'INTERIM AUDIT TRAIL (Master Pricing §13.4): append-only JSONL written per sync run. ' +
  'This is a temporary, honest audit trail — NOT a replacement for the server-side ' +
  'sync_history table (supabase/migrations/20261116_master_price_governance.sql, NOT APPLIED). ' +
  'Entries are never edited or deleted; corrections are new entries.';

/** Build the header line for a fresh trail file. */
export function buildSyncHistoryJsonlHeader(
  generatedAt: string,
  masterPriceVersion: string = MASTER_PRICE_VERSION,
): SyncHistoryJsonlHeader {
  return {
    kind: 'HEADER',
    schemaVersion: SYNC_HISTORY_SCHEMA_VERSION,
    generatedAt,
    masterPriceVersion,
    note: SYNC_HISTORY_JSONL_NOTE,
  };
}

/** Serialize one entry as a single JSONL line. */
export function serializeSyncHistoryEntryJsonl(entry: SyncHistoryEntry): string {
  return JSON.stringify(entry);
}

/** Serialize the header as a single JSONL line. */
export function serializeSyncHistoryHeaderJsonl(header: SyncHistoryJsonlHeader): string {
  return JSON.stringify(header);
}

export interface ParsedSyncHistoryJsonl {
  header: SyncHistoryJsonlHeader | null;
  entries: SyncHistoryEntry[];
  /** Line-level parse errors (line numbers are 1-based). Never silently skipped. */
  errors: string[];
}

/** Parse a JSONL trail file. Malformed lines are reported, never silently dropped. */
export function parseSyncHistoryJsonl(text: string): ParsedSyncHistoryJsonl {
  let parsedHeader: SyncHistoryJsonlHeader | null = null;
  const entries: SyncHistoryEntry[] = [];
  const errors: string[] = [];
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      errors.push(`line ${lineNo}: invalid JSON`);
      return;
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      errors.push(`line ${lineNo}: not a JSON object`);
      return;
    }
    const rec = obj as Record<string, unknown>;
    if (rec.kind === 'HEADER') {
      if (parsedHeader !== null) errors.push(`line ${lineNo}: duplicate HEADER`);
      else parsedHeader = obj as SyncHistoryJsonlHeader;
      return;
    }
    if (typeof rec.operationId !== 'string' || typeof rec.operationType !== 'string') {
      errors.push(`line ${lineNo}: sync history entry without operationId/operationType`);
      return;
    }
    entries.push(obj as SyncHistoryEntry);
  });
  return { header: parsedHeader, entries, errors };
}

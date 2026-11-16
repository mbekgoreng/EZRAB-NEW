/**
 * MASTER PRICING §8 — AHSP VERSION HISTORY (pure writer + interim JSONL trail).
 * ==========================================================================
 *
 * Every AHSP version transition is recorded here — never edited, never
 * deleted. This module mirrors `src/engine/pricing/admin/masterPriceHistory.ts`
 * (§4.4): the same append-only discipline, the same deterministic
 * FNV-1a content-hash ids, the same three-layer story:
 *
 *   1. LOCAL (this module): entries are frozen objects; the only write
 *      operation is `appendVersionHistoryEntry` (returns a NEW array,
 *      refuses duplicate ids). There is NO update/delete function in
 *      this module — the test suite pins the exported API surface.
 *   2. INTERIM TRAIL: append-only JSONL at
 *      data/ahsp2026/versions/ahsp_version_history.jsonl — one entry per
 *      line, written by scripts/ahsp2026/buildAhspVersionSnapshots.ts.
 *      This is an honest TEMPORARY audit trail, NOT a replacement for
 *      the server-side registry (table `ahsp_database_versions` in
 *      supabase/migrations/20261116_master_price_governance.sql,
 *      NOT APPLIED).
 *   3. SERVER (future): the `ahsp_database_versions` table + RLS.
 *      Real enforcement waits for that (see §2.4.7 — BLOCKED).
 *
 * Identity honesty: `adminIdentity` is the authenticated admin's
 * auth.users id, or NULL when there is no authentication. This module
 * takes the identity as INPUT and never verifies it.
 *
 * Impact honesty: `impactStatus` is 'NOT_COMPUTED' whenever the §9
 * impact calculator has not run. A NOT_COMPUTED entry is an honest
 * record that impact was unknown at confirmation time — never a claim
 * of zero impact. See `ImpactProvider` in ahspVersioning.ts.
 */

/** Schema version of one history entry (bumped only with a migration). */
export const AHSP_VERSION_HISTORY_SCHEMA_VERSION = 1 as const;

export type AhspVersionHistoryOperation =
  | 'BASELINE' // marker: the §8 starting state (v2026.1 as-is, no content change)
  | 'CLONE' // Mode B: a DRAFT copy of an existing version was created
  | 'DRAFT_UPDATE' // Mode B: the content of an unpublished DRAFT was revised
  | 'PUBLISH' // a DRAFT became ACTIVE (the active pointer moved)
  | 'DIRECT_EDIT' // Mode A: checkpoint → impact → confirm → regenerate → new ACTIVE version
  | 'ROLLBACK'; // a NEW version was created holding an older version's content

export type AhspVersionHistoryPublicationStatus =
  | 'BASELINE'
  | 'DRAFT'
  | 'PUBLISHED'
  | 'SUPERSEDED';

/** Impact status as recorded on a history entry (string union, no import cycle). */
export type AhspVersionHistoryImpactStatus = 'NOT_COMPUTED' | 'COMPUTED';

/** Diff summary as recorded on a history entry (counts only — the full diff lives in the caller). */
export interface AhspVersionHistoryDiffSummary {
  added: number;
  removed: number;
  revised: number;
  unchanged: number;
}

/** One immutable version-transition record. */
export interface AhspVersionHistoryEntry {
  /** Deterministic content-hash id: `AVH-<16 hex>` — same input, same id (idempotent re-writes). */
  id: string;
  schemaVersion: typeof AHSP_VERSION_HISTORY_SCHEMA_VERSION;
  /** AHSP family (CIPTA_KARYA / BINA_MARGA / SUMBER_DAYA_AIR / SMKK). */
  family: string;
  /** Version this entry is about (the version created, published, or rolled back to). */
  versionId: string;
  operation: AhspVersionHistoryOperation;
  /** Active version BEFORE this transition (null for BASELINE). */
  previousVersionId: string | null;
  /** Version this version was created from (null for the 2026.1 baseline). */
  baseVersionId: string | null;
  /** Content checksum of `versionId` AFTER this transition (null when unknown). */
  contentChecksum: string | null;
  /** Content checksum of `previousVersionId` (null when unknown / no previous). */
  previousContentChecksum: string | null;
  /** Authenticated admin id, or NULL (honest no-auth). Never fabricated. */
  adminIdentity: string | null;
  /** ISO timestamp of the transition. */
  changedAt: string;
  /** Required reason for the change (>= 10 chars, mirrors §4.4 / price_assumptions). */
  reason: string;
  /** Impact status at confirmation time (null for BASELINE / CLONE — no impact question arises). */
  impactStatus: AhspVersionHistoryImpactStatus | null;
  /** Human-readable impact note (present whenever impactStatus is set). */
  impactNote: string | null;
  /** Diff summary vs the previous active version (null when no diff was computed). */
  diffSummary: AhspVersionHistoryDiffSummary | null;
  publicationStatus: AhspVersionHistoryPublicationStatus;
}

export type AhspVersionHistoryInput = Omit<AhspVersionHistoryEntry, 'id' | 'schemaVersion'>;

// ---------------------------------------------------------------------------
// Deterministic id (FNV-1a 64-bit, hex) — pure, no dependency.
// Same algorithm as masterPriceHistory.ts (shared deterministic-hash
// primitive, duplicated deliberately: this module must not import from
// src/engine (layering — nationalCostDatabase is below engine).
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

function entryIdFor(input: AhspVersionHistoryInput): string {
  const canonical = JSON.stringify([
    input.operation,
    input.family,
    input.versionId,
    input.previousVersionId,
    input.baseVersionId,
    input.contentChecksum,
    input.changedAt,
    input.reason,
  ]);
  return `AVH-${fnv1aHex(canonical)}`;
}

// ---------------------------------------------------------------------------
// Builder (validates; freezes the entry so it cannot be rewritten in memory)
// ---------------------------------------------------------------------------

export function buildVersionHistoryEntry(
  input: AhspVersionHistoryInput,
  reasonMinLength = 10,
): AhspVersionHistoryEntry {
  if (typeof input.reason !== 'string' || input.reason.trim().length < reasonMinLength) {
    throw new Error(
      `Version history reason is required (at least ${reasonMinLength} characters)`,
    );
  }
  if (typeof input.changedAt !== 'string' || Number.isNaN(Date.parse(input.changedAt))) {
    throw new Error(`changedAt must be a valid ISO timestamp, got ${JSON.stringify(input.changedAt)}`);
  }
  if (typeof input.family !== 'string' || input.family.trim() === '') {
    throw new Error('family is required');
  }
  if (typeof input.versionId !== 'string' || input.versionId.trim() === '') {
    throw new Error('versionId is required');
  }
  if (input.impactStatus !== null && input.impactNote === null) {
    throw new Error('impactNote is required whenever impactStatus is set');
  }
  const entry: AhspVersionHistoryEntry = Object.freeze({
    ...input,
    id: entryIdFor(input),
    schemaVersion: AHSP_VERSION_HISTORY_SCHEMA_VERSION,
    diffSummary: input.diffSummary ? Object.freeze({ ...input.diffSummary }) : null,
  });
  return entry;
}

/**
 * Append-only write: returns a NEW (frozen) array with the entry
 * appended. Refuses a duplicate id (idempotency: re-appending the
 * same entry is an error, not a silent second row). Never mutates the
 * input array. There is intentionally no update or delete operation.
 */
export function appendVersionHistoryEntry(
  entries: readonly AhspVersionHistoryEntry[],
  entry: AhspVersionHistoryEntry,
): readonly AhspVersionHistoryEntry[] {
  if (entries.some((e) => e.id === entry.id)) {
    throw new Error(`Duplicate version history entry id ${entry.id} — history is append-only, re-append refused`);
  }
  return Object.freeze([...entries, entry]);
}

/** Validate a history chain: unique ids, required fields, sane timestamps. */
export function validateVersionHistoryEntries(
  entries: readonly AhspVersionHistoryEntry[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const where = `entry[${i}]${e.id ? ` ${e.id}` : ''}`;
    if (!e.id) errors.push(`${where}: missing id`);
    else if (seen.has(e.id)) errors.push(`${where}: duplicate id`);
    else seen.add(e.id);
    if (e.schemaVersion !== AHSP_VERSION_HISTORY_SCHEMA_VERSION) {
      errors.push(`${where}: unexpected schemaVersion ${String(e.schemaVersion)}`);
    }
    if (typeof e.reason !== 'string' || e.reason.trim().length < 10) {
      errors.push(`${where}: reason too short or missing`);
    }
    if (typeof e.changedAt !== 'string' || Number.isNaN(Date.parse(e.changedAt))) {
      errors.push(`${where}: changedAt is not a valid ISO timestamp`);
    }
    if (typeof e.family !== 'string' || e.family.trim() === '') {
      errors.push(`${where}: family missing`);
    }
    if (typeof e.versionId !== 'string' || e.versionId.trim() === '') {
      errors.push(`${where}: versionId missing`);
    }
    if (e.impactStatus !== null && e.impactNote === null) {
      errors.push(`${where}: impactStatus set without impactNote`);
    }
  });
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Interim JSONL trail (data/ahsp2026/versions/ahsp_version_history.jsonl)
// ---------------------------------------------------------------------------

export interface AhspVersionHistoryJsonlHeader {
  kind: 'HEADER';
  schemaVersion: typeof AHSP_VERSION_HISTORY_SCHEMA_VERSION;
  generatedAt: string;
  /** Active AHSP database version per family at the time the trail was created. */
  activeVersions: Record<string, string>;
  /** Honest scope statement — this file is an interim trail, not the server history. */
  note: string;
}

export const AHSP_VERSION_HISTORY_JSONL_NOTE =
  'INTERIM AUDIT TRAIL (Master Pricing §8): append-only JSONL written by ' +
  'scripts/ahsp2026/buildAhspVersionSnapshots.ts. This is a temporary, honest audit trail — NOT a ' +
  'replacement for the server-side ahsp_database_versions table ' +
  '(supabase/migrations/20261116_master_price_governance.sql, NOT APPLIED). ' +
  'Entries are never edited or deleted; corrections are new entries. ' +
  'Rollback is a NEW version holding old content, never a resurrection.';

/** Build the header line for a fresh trail file. */
export function buildVersionHistoryJsonlHeader(
  generatedAt: string,
  activeVersions: Record<string, string>,
): AhspVersionHistoryJsonlHeader {
  return {
    kind: 'HEADER',
    schemaVersion: AHSP_VERSION_HISTORY_SCHEMA_VERSION,
    generatedAt,
    activeVersions: { ...activeVersions },
    note: AHSP_VERSION_HISTORY_JSONL_NOTE,
  };
}

/** Serialize one entry as a single JSONL line. */
export function serializeVersionHistoryEntryJsonl(entry: AhspVersionHistoryEntry): string {
  return JSON.stringify(entry);
}

/** Serialize the header as a single JSONL line. */
export function serializeVersionHistoryHeaderJsonl(header: AhspVersionHistoryJsonlHeader): string {
  return JSON.stringify(header);
}

export interface ParsedVersionHistoryJsonl {
  header: AhspVersionHistoryJsonlHeader | null;
  entries: AhspVersionHistoryEntry[];
  /** Line-level parse errors (line numbers are 1-based). Never silently skipped. */
  errors: string[];
}

/** Parse a JSONL trail file. Malformed lines are reported, never silently dropped. */
export function parseVersionHistoryJsonl(text: string): ParsedVersionHistoryJsonl {
  let parsedHeader: AhspVersionHistoryJsonlHeader | null = null;
  const entries: AhspVersionHistoryEntry[] = [];
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
      else parsedHeader = obj as AhspVersionHistoryJsonlHeader;
      return;
    }
    if (typeof rec.id !== 'string' || typeof rec.operation !== 'string') {
      errors.push(`line ${lineNo}: history entry without id/operation`);
      return;
    }
    entries.push(obj as AhspVersionHistoryEntry);
  });
  return { header: parsedHeader, entries, errors };
}

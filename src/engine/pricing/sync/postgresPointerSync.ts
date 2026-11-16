/**
 * MASTER PRICING §13 — Postgres AHSP version pointer sync (pure SQL builder).
 * ==========================================================================
 *
 * §8 §12.3: the `ahsp_database_versions` table in Postgres mirrors the
 * local version registry (one row per version, the ACTIVE row per family
 * is the pointer). This module builds the upsert SQL that syncs the
 * local registry INTO Postgres. It is DEFINITION + LOGIC ONLY: the SQL
 * is written to a file by the CLI
 * (`scripts/ahsp2026/syncAhspVersionPointers.ts`) and is NEVER executed
 * by this program — the migration is NOT APPLIED, there is no live
 * connection here, and applying it is an owner/DBA action after review.
 *
 * MAPPINGS (pinned by tests):
 * - Family: the table's CHECK is
 *   `('CIPTA_KARYA','BINA_MARGA','SDA','SMKK','OTHER')` — the engine
 *   family `SUMBER_DAYA_AIR` maps to `'SDA'`; the others map as-is.
 * - Row id: `${family}:${versionId}` (engine family, e.g.
 *   `CIPTA_KARYA:2026.1`) — deterministic, so re-running the sync is
 *   an upsert, never a duplicate row.
 * - `version_label` = versionId; `name` = `${family} ${versionId}`.
 * - `base_version_id` = `${family}:${createdFrom}` when the version
 *   was created from another version, else NULL.
 * - `content_checksum` = the snapshot's verified FNV-1a checksum
 *   (§13 adds the column to the migration).
 * - `created_by` / `published_by` are uuid columns: emitted only
 *   when the record's value parses as a UUID, else NULL (the honest
 *   no-auth state is null; a non-UUID id would make the SQL fail, so
 *   the builder THROWS rather than emit broken SQL).
 * - String literals are escaped by doubling single quotes.
 *
 * The upsert is `on conflict (id) do update` over the mutable
 * columns only (status, content_checksum, published_at,
 * published_by, note). `created_at` is never overwritten (the
 * version's creation time is history, not sync state).
 */
import {
  AHSP_FAMILIES,
  listVersions,
  type AhspFamily,
  type AhspVersionRegistryState,
} from '../../../data/nationalCostDatabase/ahspVersioning';

/** The Postgres family value for an engine family (the table's CHECK has no SUMBER_DAYA_AIR). */
export function postgresFamilyFor(family: AhspFamily): 'CIPTA_KARYA' | 'BINA_MARGA' | 'SDA' | 'SMKK' {
  if (family === 'SUMBER_DAYA_AIR') return 'SDA';
  return family;
}

/** The deterministic row id for a version (`${family}:${versionId}`). */
export function postgresVersionRowId(family: AhspFamily, versionId: string): string {
  return `${family}:${versionId}`;
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableString(value: string | null): string {
  return value === null ? 'NULL' : sqlQuote(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sqlNullableUuid(value: string | null, field: string, rowId: string): string {
  if (value === null) return 'NULL';
  if (!UUID_RE.test(value)) {
    throw new Error(
      `Cannot build pointer-sync SQL for ${rowId}: ${field} ${JSON.stringify(value)} is not a UUID ` +
        '(the column is uuid-typed; a non-UUID value would make the SQL fail)',
    );
  }
  return sqlQuote(value);
}

export interface PostgresPointerSyncSql {
  /** The full SQL file content (header comment + one upsert per version). */
  sql: string;
  /** Row ids written, in file order. */
  rowIds: readonly string[];
  /** The active version per family (the pointers the sync publishes). */
  activeVersions: Readonly<Record<AhspFamily, string>>;
}

export function buildPostgresPointerSyncSql(
  state: AhspVersionRegistryState,
  generatedAt: string,
): PostgresPointerSyncSql {
  const rowIds: string[] = [];
  const statements: string[] = [];
  for (const family of AHSP_FAMILIES) {
    for (const rec of listVersions(state, family)) {
      const rowId = postgresVersionRowId(family, rec.versionId);
      rowIds.push(rowId);
      const baseVersionId =
        rec.createdFrom === null ? 'NULL' : sqlQuote(postgresVersionRowId(family, rec.createdFrom));
      statements.push(
        `insert into public.ahsp_database_versions ` +
          `(id, family, name, version_label, base_version_id, status, source_document, snapshot_path, created_by, created_at, published_by, published_at, note, content_checksum)\n` +
          `values (${sqlQuote(rowId)}, ${sqlQuote(postgresFamilyFor(family))}, ${sqlQuote(`${family} ${rec.versionId}`)}, ${sqlQuote(rec.versionId)}, ${baseVersionId}, ${sqlQuote(rec.status)}, NULL, ${sqlQuote(rec.snapshotPath)}, ${sqlNullableUuid(rec.createdBy, 'created_by', rowId)}, ${sqlQuote(rec.createdAt)}, ${sqlNullableUuid(rec.publishedBy, 'published_by', rowId)}, ${sqlNullableString(rec.publishedAt)}, ${sqlQuote(rec.reason)}, ${sqlQuote(rec.contentChecksum)})\n` +
          `on conflict (id) do update set status = excluded.status, content_checksum = excluded.content_checksum, published_at = excluded.published_at, published_by = excluded.published_by, note = excluded.note;`,
      );
    }
  }
  const header = [
    '-- MASTER PRICING §13 — AHSP version pointer sync (GENERATED, review before running).',
    `-- Generated at ${generatedAt} by scripts/ahsp2026/syncAhspVersionPointers.ts.`,
    '-- This file is DEFINITION + LOGIC ONLY: nothing in this program executes it.',
    '-- The migration supabase/migrations/20261116_master_price_governance.sql',
    '-- (which adds the content_checksum column) must be applied BEFORE this file.',
    '-- Each row id is `${family}:${versionId}`, so re-running the sync upserts',
    '-- the same rows — it never creates duplicates.',
    '',
  ].join('\n');
  return {
    sql: `${header}${statements.join('\n\n')}\n`,
    rowIds,
    activeVersions: { ...state.active },
  };
}

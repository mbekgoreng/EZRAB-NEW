/**
 * MASTER PRICING §13 — AHSP version pointer sync CLI.
 * ====================================================
 *
 * Verifies the local §8 version registry (snapshots load, checksums
 * recompute, exactly one ACTIVE version per family, active pointers
 * agree with the registry) and GENERATES the Postgres pointer-sync
 * SQL (`data/ahsp2026/versions/postgres-pointer-sync.sql`).
 *
 * The SQL is DEFINITION + LOGIC ONLY — this CLI never executes it
 * (no live connection exists here; the migration is NOT APPLIED).
 * Applying it is an owner/DBA action after review.
 *
 * Usage:
 *   npm run ahsp:sync-pointers [-- --dir <versionsDir>] [--out <sqlPath>] [--dry-run]
 *
 * --dry-run prints the SQL and the summary and writes NOTHING
 * (no SQL file, no sync-history line).
 *
 * On a live run the CLI also appends one AHSP_VERSION_SYNC entry
 * to the §13.4 interim trail
 * (`data/price2026/reports/sync_history.jsonl`). Any verification
 * failure aborts BEFORE any write (exit 1).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AHSP_FAMILIES,
  AHSP_VERSIONS_DIR,
  buildRegistryState,
} from '../../src/data/nationalCostDatabase/ahspVersioning';
import { buildPostgresPointerSyncSql } from '../../src/engine/pricing/sync/postgresPointerSync';
import {
  buildSyncHistoryEntry,
  buildSyncHistoryJsonlHeader,
  serializeSyncHistoryEntryJsonl,
  serializeSyncHistoryHeaderJsonl,
  SYNC_HISTORY_JSONL_PATH,
  type SyncHistoryEntry,
} from '../../src/engine/pricing/sync/syncHistory';
import {
  loadAhspVersionSnapshots,
  readActiveVersionRecords,
} from './loadAhspVersionSnapshots';

const DEFAULT_SQL_OUT = path.join(AHSP_VERSIONS_DIR, 'postgres-pointer-sync.sql');

interface CliOptions {
  dir: string;
  out: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dir: path.join(process.cwd(), AHSP_VERSIONS_DIR),
    out: path.join(process.cwd(), DEFAULT_SQL_OUT),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') opts.dir = path.resolve(argv[++i]);
    else if (arg === '--out') opts.out = path.resolve(argv[++i]);
    else if (arg === '--dry-run') opts.dryRun = true;
    else throw new Error(`Unknown argument: ${arg} (expected --dir, --out, --dry-run)`);
  }
  return opts;
}

function appendSyncHistoryEntryToTrail(entry: SyncHistoryEntry): void {
  const trailPath = path.join(process.cwd(), SYNC_HISTORY_JSONL_PATH);
  fs.mkdirSync(path.dirname(trailPath), { recursive: true });
  if (!fs.existsSync(trailPath)) {
    fs.writeFileSync(
      trailPath,
      `${serializeSyncHistoryHeaderJsonl(buildSyncHistoryJsonlHeader(entry.completedAt))}\n`,
    );
  }
  fs.appendFileSync(trailPath, `${serializeSyncHistoryEntryJsonl(entry)}\n`);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const now = new Date().toISOString();
  const tag = '[ahsp:sync-pointers]';

  // 1. Load + verify every snapshot (checksums recompute; registry
  //    claims agree with file meta).
  const loaded = loadAhspVersionSnapshots(opts.dir);
  const records = readActiveVersionRecords(opts.dir);
  const errors = [...loaded.loaderErrors, ...loaded.result.errors, ...records.errors];
  if (errors.length > 0) {
    console.error(`${tag} verification FAILED — refusing to generate pointer-sync SQL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  if (loaded.activeVersions === null) {
    console.error(`${tag} verification FAILED — no active pointers in the registry.`);
    process.exit(1);
  }

  // 2. Build the registry state (throws unless exactly one ACTIVE
  //    version per family).
  const state = buildRegistryState(records.records);

  // 3. Cross-checks: every registry record has loaded content, and
  //    the registry's active pointers agree with the ACTIVE records.
  const loadedKeys = new Set(
    loaded.result.records.map((r) => `${r.family}|${r.versionId}`),
  );
  const missingContent = records.records.filter(
    (r) => !loadedKeys.has(`${r.family}|${r.versionId}`),
  );
  if (missingContent.length > 0) {
    console.error(
      `${tag} verification FAILED — no loaded snapshot content for: ` +
        missingContent.map((r) => `${r.family} ${r.versionId}`).join(', '),
    );
    process.exit(1);
  }
  const pointerDisagreements = AHSP_FAMILIES.filter(
    (f) => state.active[f] !== loaded.activeVersions?.[f],
  );
  if (pointerDisagreements.length > 0) {
    console.error(
      `${tag} verification FAILED — active pointer disagrees with the ACTIVE record for: ` +
        pointerDisagreements.join(', '),
    );
    process.exit(1);
  }

  // 4. Generate the SQL (pure builder — definition + logic only).
  const { sql, rowIds, activeVersions } = buildPostgresPointerSyncSql(state, now);
  console.log(
    `${tag} verified ${loaded.result.loadedCount} snapshot(s) (${loaded.result.records
      .map((r) => `${r.family} ${r.versionId} ${r.itemCount} items ${r.contentChecksum}`)
      .join('; ')})`,
  );
  console.log(
    `${tag} active pointers: ${AHSP_FAMILIES.map((f) => `${f}=${activeVersions[f]}`).join(', ')}`,
  );

  if (opts.dryRun) {
    console.log(`${tag} DRY RUN — no files written. SQL that WOULD be generated:\n`);
    console.log(sql);
    return;
  }

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, sql);
  console.log(`${tag} wrote ${rowIds.length} upsert(s) to ${path.relative(process.cwd(), opts.out)}`);

  const entry = buildSyncHistoryEntry({
    operationType: 'AHSP_VERSION_SYNC',
    initiatedBy: null,
    sourceEntity: 'ahsp-versions:postgres-pointer-sync',
    previousValue: null,
    newValue: null,
    affectedAhspFamilies: [...AHSP_FAMILIES],
    affectedComponents: [],
    affectedProjects: [],
    successfulOperations: rowIds.length,
    failedOperations: 0,
    unresolvedConflicts: [],
    completedAt: now,
    recoveryStatus: 'NOT_NEEDED',
  });
  appendSyncHistoryEntryToTrail(entry);
  console.log(`${tag} recorded sync operation ${entry.operationId} in ${SYNC_HISTORY_JSONL_PATH}`);
}

main();

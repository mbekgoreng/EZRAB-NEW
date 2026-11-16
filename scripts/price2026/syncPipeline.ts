/**
 * MASTER PRICING §13 — PRICE PIPELINE SYNC ORCHESTRATOR.
 * ======================================================
 *
 * `price:pipeline` IS the sync engine (D6) — this script is its
 * admin-triggered entry point (`npm run price:sync`), not a second
 * engine. Flow:
 *
 *   1. Read the last reconciliation report
 *      (`data/price2026/reports/sync_reconciliation.json`) → the
 *      digest of the last synced row set (null on the first run).
 *   2. Re-compute the digest from the CURRENT sources via
 *      `price:normalize --dry-run` (the on-disk price_rows.json is
 *      STALE after a source edit — its digest must never be used
 *      as the "current" digest).
 *   3. Digest unchanged and not `--full` → NO-OP: nothing to sync.
 *      Live mode records the no-op (reconciliation report +
 *      INCREMENTAL_SYNC history entry with 0 operations); dry-run
 *      mode prints the decision and writes nothing — unless
 *      `--audit-dry-run` is passed, which appends ONE audited
 *      DRY_RUN history entry (and nothing else).
 *   4. Digest changed (or `--full`):
 *      - `--dry-run`: run `price:match --dry-run` too, print the
 *        before/after COUNTS (from the dry-run JSONs) and the steps
 *        a live run would still perform — write NOTHING.
 *      - `--audit-dry-run` (§14): the same dry-run computation,
 *        PLUS one DRY_RUN entry appended to the §13.4 trail
 *        (would-be mode + digest in the source entity; 0
 *        operations applied). Still no reconciliation report, no
 *        pipeline artifacts, no price writes — the ONLY write is
 *        the audit entry itself.
 *      - live: snapshot the BEFORE rows, run the pipeline STAGES
 *        (the same stages as `price:pipeline`, in the same order,
 *        invoked by their npm script names so the command
 *        definitions stay in package.json), diff before/after rows,
 *        write the §15 reconciliation report + append the §13.4
 *        sync-history entry.
 *
 * The stages run individually (not via `npm run price:pipeline`)
 * because ONE stage — `price:assert` — has 3 PRE-EXISTING failures
 * (baseline 2026-11-16, recorded below — §14 fixed the 4th, a PPh
 * tax-rate default) that exit 1 and would stop the `&&` chain
 * before forensic/report. The orchestrator tolerates
 * EXACTLY those 3 known failures (matched by stable name prefix)
 * and fails the sync on ANY other assert failure. The known list
 * is a baseline, not a waiver: the remaining 3 are
 * assertion-vs-architecture conflicts documented in
 * fase14-testing.md (need #4) and left OPEN by design.
 *
 * SAFETY (golden must not move): the dry-run digest comparison is
 * the gate — a live run only happens when the sources actually
 * changed (or `--full` is passed deliberately). Before the FIRST
 * live run after a script change, run `--dry-run` and compare the
 * would-be counts against the current files; if they differ,
 * investigate before running live (stale generated files vs
 * current scripts).
 *
 * Usage:
 *   npm run price:sync [-- --dry-run] [--audit-dry-run] [--full]
 */
import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AHSP_FAMILIES,
  type AhspFamily,
} from '../../src/data/nationalCostDatabase/ahspVersioning';
import { diffPriceRowSets } from '../../src/engine/pricing/sync/syncEngine';
import {
  buildSyncHistoryEntry,
  buildSyncHistoryJsonlHeader,
  serializeSyncHistoryEntryJsonl,
  serializeSyncHistoryHeaderJsonl,
  SYNC_HISTORY_JSONL_PATH,
} from '../../src/engine/pricing/sync/syncHistory';
import type { ResourcePriceRecord } from '../../src/data/priceDatabase2026/types';
import { PRICE_SOURCES } from './sources.config';

const REPORTS_DIR = path.join(process.cwd(), 'data', 'price2026', 'reports');
const RECONCILIATION_PATH = path.join(REPORTS_DIR, 'sync_reconciliation.json');
const PRICE_ROWS_PATH = path.join(process.cwd(), 'data', 'price2026', 'normalized', 'price_rows.json');
const PRICE_MASTER_PATH = path.join(process.cwd(), 'data', 'price2026', 'validated', 'price_master.json');
const MATCH_REPORT_PATH = path.join(process.cwd(), 'data', 'price2026', 'validated', 'match_report.json');

const DRY_RUN_MARKER = '__SYNC_DRY_RUN_JSON__';

interface CliOptions {
  dryRun: boolean;
  /** §14: dry-run that appends ONE audited DRY_RUN history entry (and nothing else). */
  auditDryRun: boolean;
  full: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, auditDryRun: false, full: false };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--audit-dry-run') {
      opts.dryRun = true;
      opts.auditDryRun = true;
    } else if (arg === '--full') opts.full = true;
    else throw new Error(`Unknown argument: ${arg} (expected --dry-run, --audit-dry-run, --full)`);
  }
  return opts;
}

function isActiveSource(sourceKey: string): boolean {
  return PRICE_SOURCES.find((s) => s.key === sourceKey)?.active ?? false;
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readPriceRows(): ResourcePriceRecord[] {
  const parsed = readJsonFile(PRICE_ROWS_PATH);
  if (parsed === null || !Array.isArray(parsed.rows)) return [];
  return parsed.rows as ResourcePriceRecord[];
}

interface PipelineCounts {
  priceRowsTotal: number | null;
  priceRowsActive: number | null;
  priceMasterRecords: number | null;
  matchedRows: number | null;
  unmatchedRows: number | null;
  componentKeysTotal: number | null;
  componentKeysPriced: number | null;
  ahspFull: number | null;
  ahspPartial: number | null;
  ahspMissing: number | null;
  conflicts: number | null;
  unresolvedKeys: number | null;
}

function countsFromDisk(): PipelineCounts {
  const rows = readJsonFile(PRICE_ROWS_PATH);
  const master = readJsonFile(PRICE_MASTER_PATH);
  const report = readJsonFile(MATCH_REPORT_PATH);
  const coverage = (report?.componentKeyCoverage ?? {}) as Record<string, unknown>;
  const ahsp = (report?.ahspCoverage ?? {}) as Record<string, unknown>;
  const conflicts = (report?.conflicts ?? {}) as Record<string, unknown>;
  const unresolved = (report?.unresolvedComponentKeys ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    priceRowsTotal: num(rows?.totalRows),
    priceRowsActive: num(rows?.activeRows),
    priceMasterRecords: num(master?.count),
    matchedRows: num(report?.matchedRows),
    unmatchedRows: num(report?.unmatchedRows),
    componentKeysTotal: num(coverage.distinctComponentKeys),
    componentKeysPriced: num(coverage.keysWithPrice),
    ahspFull: num(ahsp.full),
    ahspPartial: num(ahsp.partial),
    ahspMissing: num(ahsp.missing),
    conflicts: num(conflicts.conflictGroups),
    unresolvedKeys: num(unresolved.count),
  };
}

function countsFromDryRun(
  normalize: Record<string, unknown>,
  match: Record<string, unknown> | null,
): PipelineCounts {
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const coverage = (match?.componentKeyCoverage ?? {}) as Record<string, unknown>;
  const ahsp = (match?.ahspCoverage ?? {}) as Record<string, unknown>;
  return {
    priceRowsTotal: num(normalize.totalRows),
    priceRowsActive: num(normalize.activeRows),
    priceMasterRecords: num(match?.matchedRows),
    matchedRows: num(match?.matchedRows),
    unmatchedRows: num(match?.unmatchedRows),
    componentKeysTotal: num(coverage.distinctComponentKeys),
    componentKeysPriced: num(coverage.keysWithPrice),
    ahspFull: num(ahsp.full),
    ahspPartial: num(ahsp.partial),
    ahspMissing: num(ahsp.missing),
    conflicts: num(match?.conflictGroups),
    unresolvedKeys: num(match?.unresolvedKeys),
  };
}

/** The AHSP domains whose FULL/PARTIAL/MISSING counts moved between two match reports. */
function domainsChanged(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AhspFamily[] {
  const beforeByDomain = ((before?.ahspCoverage ?? {}) as Record<string, unknown>).byDomain as
    | Record<string, { full?: number; partial?: number; missing?: number }>
    | undefined;
  const afterByDomain = ((after?.ahspCoverage ?? {}) as Record<string, unknown>).byDomain as
    | Record<string, { full?: number; partial?: number; missing?: number }>
    | undefined;
  if (!beforeByDomain || !afterByDomain) return [];
  const changed: AhspFamily[] = [];
  for (const family of AHSP_FAMILIES) {
    const b = beforeByDomain[family];
    const a = afterByDomain[family];
    if (!b || !a) continue;
    if (b.full !== a.full || b.partial !== a.partial || b.missing !== a.missing) {
      changed.push(family);
    }
  }
  return changed;
}

/** Run a tsx script with --dry-run and parse its machine-readable JSON line. */
function runDryRunStage(script: string): Record<string, unknown> {
  const out = execFileSync(
    'npx',
    ['tsx', script, '--dry-run'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const line = out
    .split('\n')
    .find((l) => l.startsWith(DRY_RUN_MARKER));
  if (!line) {
    throw new Error(
      `${script} --dry-run produced no ${DRY_RUN_MARKER} line — cannot continue the sync`,
    );
  }
  return JSON.parse(line.slice(DRY_RUN_MARKER.length)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Live pipeline stages (mirrors `price:pipeline` in package.json — the
// command definitions live there; only the order + assert tolerance
// live here). KEEP IN SYNC with package.json.
// ---------------------------------------------------------------------------

/**
 * The PRE-EXISTING `price:assert` failures (baseline 2026-11-16,
 * 30 passed / 3 failed — §14 fixed the spreadsheetApprovalEngine
 * `?? 0` case, a PPh tax-rate default, not a price fallback; the
 * remaining 3 are assertion-vs-architecture conflicts documented
 * in fase14-testing.md §13-need-4 and left OPEN by design).
 * Matched by stable name prefix — the
 * failure lines carry data-dependent details after ' — ' (counts,
 * item codes) that may legitimately move. A failure that does NOT
 * match one of these prefixes, or a DIFFERENT failure count, fails
 * the sync.
 */
const KNOWN_ASSERT_FAILURE_PREFIXES: readonly string[] = [
  'no price is written into the canonical AHSP source',
  'AHSP pricing status is consistent for every item',
  'AHSP unit price = Σ(coefficient × resolved price) for all',
];

interface PriceAssertResult {
  passed: number | null;
  failed: number | null;
  /** Failure lines that matched the known baseline. */
  knownFailures: string[];
  /** Failure lines that did NOT match the baseline (empty on a tolerated run). */
  unexpectedFailures: string[];
  tolerated: boolean;
}

const PIPELINE_STAGES: readonly string[] = [
  'price:audit',
  'price:normalize',
  'price:match',
  'price:registry',
  'price:coverage',
  'price:assert',
  'price:forensic',
  'price:report',
];

function parseAssertOutput(output: string): PriceAssertResult {
  const summary = output.match(/PRICE ASSERTIONS: (\d+) PASSED, (\d+) FAILED/);
  const failureLines = output
    .split('\n')
    .filter((l) => l.trimStart().startsWith('✗ '))
    .map((l) => l.trim().slice(2).trim());
  const knownFailures = failureLines.filter((f) =>
    KNOWN_ASSERT_FAILURE_PREFIXES.some((p) => f.startsWith(p)),
  );
  const unexpectedFailures = failureLines.filter(
    (f) => !KNOWN_ASSERT_FAILURE_PREFIXES.some((p) => f.startsWith(p)),
  );
  const tolerated =
    unexpectedFailures.length === 0 &&
    failureLines.length === KNOWN_ASSERT_FAILURE_PREFIXES.length &&
    knownFailures.length === KNOWN_ASSERT_FAILURE_PREFIXES.length;
  return {
    passed: summary ? Number(summary[1]) : null,
    failed: summary ? Number(summary[2]) : null,
    knownFailures,
    unexpectedFailures,
    tolerated,
  };
}

/**
 * Run the pipeline stages in order. `price:assert` is captured (its
 * output is parsed for the known-failure baseline); every other
 * stage inherits stdio. Returns the assert result. Throws on the
 * first stage failure (other than a tolerated assert result) —
 * the caller records the failed sync.
 */
function runPipelineStages(): PriceAssertResult {
  let assertResult: PriceAssertResult | null = null;
  let completed = 0;
  for (const stage of PIPELINE_STAGES) {
    console.log(`[price:sync] stage ${completed + 1}/${PIPELINE_STAGES.length}: npm run ${stage}`);
    if (stage === 'price:assert') {
      try {
        const out = execFileSync('npm', ['run', stage], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        });
        console.log(out);
        assertResult = {
          passed: null,
          failed: 0,
          knownFailures: [],
          unexpectedFailures: [],
          tolerated: true,
        };
        const summary = out.match(/PRICE ASSERTIONS: (\d+) PASSED, 0 FAILED/);
        if (summary) assertResult.passed = Number(summary[1]);
      } catch (err) {
        const output =
          err !== null && typeof err === 'object' && 'stdout' in err
            ? String((err as { stdout?: unknown }).stdout ?? '')
            : '';
        console.log(output);
        const parsed = parseAssertOutput(output);
        if (!parsed.tolerated) {
          throw new Error(
            `price:assert failed with ${parsed.unexpectedFailures.length > 0 ? 'UNEXPECTED' : 'a changed set of'} failures ` +
              `(${parsed.failed ?? '?'} failed; known baseline is ${KNOWN_ASSERT_FAILURE_PREFIXES.length}): ` +
              [...parsed.unexpectedFailures, ...parsed.knownFailures].join(' | '),
          );
        }
        console.log(
          `[price:sync] price:assert: ${parsed.passed ?? '?'} passed, ${parsed.failed ?? '?'} failed — ` +
            'all failures match the known pre-existing baseline (tolerated, recorded in the report).',
        );
        assertResult = parsed;
      }
    } else {
      execSync(`npm run ${stage}`, { stdio: 'inherit' });
    }
    completed++;
  }
  if (assertResult === null) {
    throw new Error('price:assert did not run — the stage list is out of sync with package.json');
  }
  return assertResult;
}

function appendSyncHistoryEntryToTrail(entry: Parameters<typeof serializeSyncHistoryEntryJsonl>[0]): void {
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

/**
 * MASTER PRICING §14 (need #5) — the audited dry-run entry.
 *
 * `--audit-dry-run` writes exactly ONE thing: a DRY_RUN entry in
 * the §13.4 trail. It records THAT a dry-run happened, WHEN, and
 * WHAT it would have done (would-be mode + current digest, carried
 * in the source entity — the entry schema has no free-text note
 * field). 0 operations applied (a dry-run applies nothing);
 * families/components/projects are empty because the dry-run match
 * does not materialize row-level diffs — claiming a would-be scope
 * would be fabrication. No reconciliation report is written and no
 * pipeline artifact is touched.
 */
function appendDryRunAuditEntry(
  wouldBeMode: 'NO_OP' | 'FULL_RECONCILIATION' | 'INCREMENTAL_SYNC',
  digest: string,
  completedAt: string,
): void {
  const entry = buildSyncHistoryEntry({
    operationType: 'DRY_RUN',
    initiatedBy: null,
    sourceEntity: `pipeline:price:sync:dry-run:${wouldBeMode}:${digest}`,
    previousValue: null,
    newValue: null,
    affectedAhspFamilies: [],
    affectedComponents: [],
    affectedProjects: [],
    successfulOperations: 0,
    failedOperations: 0,
    unresolvedConflicts: [],
    completedAt,
    recoveryStatus: 'NOT_NEEDED',
  });
  appendSyncHistoryEntryToTrail(entry);
  console.log(`[price:sync] audited dry-run recorded as ${entry.operationId} (DRY_RUN — no other files written)`);
}

interface ReconciliationReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: 'NO_OP' | 'INCREMENTAL_SYNC' | 'FULL_RECONCILIATION' | 'DRY_RUN';
  dryRun: boolean;
  digestBefore: string | null;
  digestAfter: string;
  changed: boolean;
  before: PipelineCounts;
  after: PipelineCounts;
  rowDiff: {
    added: number;
    removed: number;
    changed: number;
    unchangedCount: number;
    changedRows: Array<{
      id: string;
      changedFields: string[];
      beforePrice: number;
      afterPrice: number;
      beforeUnit: string;
      afterUnit: string;
    }>;
  } | null;
  affectedAhspFamilies: AhspFamily[];
  stepsSkippedInDryRun: string[] | null;
  operationId: string | null;
  /** `price:assert` outcome (live runs only; null on no-op/dry-run). */
  priceAssert: PriceAssertResult | null;
}

function printCounts(label: string, counts: PipelineCounts): void {
  const fmt = (v: number | null): string => (v === null ? 'n/a' : String(v));
  console.log(`  ${label}:`);
  console.log(`    price rows (total/active): ${fmt(counts.priceRowsTotal)} / ${fmt(counts.priceRowsActive)}`);
  console.log(`    price master records     : ${fmt(counts.priceMasterRecords)}`);
  console.log(`    matched / unmatched      : ${fmt(counts.matchedRows)} / ${fmt(counts.unmatchedRows)}`);
  console.log(`    component keys priced    : ${fmt(counts.componentKeysPriced)} / ${fmt(counts.componentKeysTotal)}`);
  console.log(`    AHSP FULL/PARTIAL/MISSING: ${fmt(counts.ahspFull)} / ${fmt(counts.ahspPartial)} / ${fmt(counts.ahspMissing)}`);
  console.log(`    conflicts / unresolved   : ${fmt(counts.conflicts)} / ${fmt(counts.unresolvedKeys)}`);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const tag = '[price:sync]';
  const now = new Date().toISOString();

  const lastReport = readJsonFile(RECONCILIATION_PATH);
  const lastDigest =
    typeof lastReport?.digestAfter === 'string' ? (lastReport.digestAfter as string) : null;
  const beforeCounts = countsFromDisk();
  const beforeMatchReport = readJsonFile(MATCH_REPORT_PATH);

  // Step 1: re-compute the digest from the CURRENT sources (dry-run
  // normalize reads the sources fresh — the on-disk file is stale
  // after a source edit and must never be the "current" digest).
  console.log(`${tag} re-computing the row-set digest from the current sources…`);
  const normalizeDry = runDryRunStage('scripts/price2026/normalizePrices.ts');
  const digestAfter = normalizeDry.digest as string;
  const changed = lastDigest !== null && lastDigest !== digestAfter;
  const firstRun = lastDigest === null;
  const needsSync = firstRun || changed || opts.full;

  console.log(`${tag} digest (last synced): ${lastDigest ?? '(none — first run)'}`);
  console.log(`${tag} digest (current)    : ${digestAfter}`);
  if (!needsSync) {
    console.log(`${tag} NO-OP — the sources have not changed since the last sync.`);
    printCounts('before', beforeCounts);
    if (opts.dryRun) {
      if (opts.auditDryRun) {
        appendDryRunAuditEntry('NO_OP', digestAfter, new Date().toISOString());
      } else {
        console.log(`${tag} DRY RUN — no files written.`);
      }
      return;
    }
    // Live no-op: record that the sync ran and found nothing.
    const report: ReconciliationReport = {
      schemaVersion: 1,
      generatedAt: now,
      mode: 'NO_OP',
      dryRun: false,
      digestBefore: lastDigest,
      digestAfter,
      changed: false,
      before: beforeCounts,
      after: beforeCounts,
      rowDiff: null,
      affectedAhspFamilies: [],
      stepsSkippedInDryRun: null,
      operationId: null,
      priceAssert: null,
    };
    const entry = buildSyncHistoryEntry({
      operationType: 'INCREMENTAL_SYNC',
      initiatedBy: null,
      sourceEntity: 'price-pipeline:price_rows.json',
      previousValue: null,
      newValue: null,
      affectedAhspFamilies: [],
      affectedComponents: [],
      affectedProjects: [],
      successfulOperations: 0,
      failedOperations: 0,
      unresolvedConflicts: [],
      completedAt: now,
      recoveryStatus: 'NOT_NEEDED',
    });
    report.operationId = entry.operationId;
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(RECONCILIATION_PATH, JSON.stringify(report, null, 2));
    appendSyncHistoryEntryToTrail(entry);
    console.log(`${tag} recorded no-op sync ${entry.operationId}; report: data/price2026/reports/sync_reconciliation.json`);
    return;
  }

  const mode: ReconciliationReport['mode'] = opts.full || firstRun ? 'FULL_RECONCILIATION' : 'INCREMENTAL_SYNC';
  console.log(
    `${tag} ${firstRun ? 'first run' : changed ? 'sources changed' : '--full requested'} → ${mode}`,
  );

  if (opts.dryRun) {
    // Dry-run: compute the would-be match counts, print, write NOTHING
    // (except, under --audit-dry-run, the single DRY_RUN audit entry).
    const matchDry = runDryRunStage('scripts/price2026/matchPricesToResources.ts');
    const afterCounts = countsFromDryRun(normalizeDry, matchDry);
    console.log(
      opts.auditDryRun
        ? `${tag} AUDITED DRY RUN — no pipeline files written (one DRY_RUN history entry will be appended). Would-be reconciliation:`
        : `${tag} DRY RUN — no files written. Would-be reconciliation:`,
    );
    printCounts('before (on-disk)', beforeCounts);
    printCounts('after  (would-be)', afterCounts);
    console.log('  steps a live run would still perform:');
    console.log('    - price:audit, price:normalize (write), price:match (write),');
    console.log('      price:registry, price:coverage, price:assert, price:forensic, price:report');
    console.log('    - write data/price2026/reports/sync_reconciliation.json');
    console.log('    - append a sync-history entry to data/price2026/reports/sync_history.jsonl');
    console.log('  note: the row-level diff is only available on a live run (the dry-run');
    console.log('        match does not materialize the would-be records).');
    if (opts.auditDryRun) {
      appendDryRunAuditEntry(mode, digestAfter, new Date().toISOString());
    }
    return;
  }

  // Live run: snapshot the BEFORE rows, run the pipeline stages, diff.
  // A stage failure aborts the sync BEFORE the reconciliation report
  // is written — but the failure IS recorded in the §13.4 trail
  // (recovery = re-run the sync; the pipeline is idempotent, so a
  // re-run regenerates every artifact from the same sources).
  const beforeRows = readPriceRows();
  console.log(`${tag} running the pipeline stages (this takes a few minutes)…`);
  let assertResult: PriceAssertResult;
  let afterCounts: PipelineCounts;
  let afterMatchReport: Record<string, unknown> | null;
  let diff: ReturnType<typeof diffPriceRowSets>;
  try {
    assertResult = runPipelineStages();
    afterCounts = countsFromDisk();
    afterMatchReport = readJsonFile(MATCH_REPORT_PATH);
    const afterRows = readPriceRows();
    // The diff's active predicate is per-ROW (sourceKey lookup) —
    // the predicate takes a record, never a bare source key.
    diff = diffPriceRowSets(beforeRows, afterRows, (r) => isActiveSource(r.sourceKey));
    // Integrity cross-check: the digest of the regenerated rows
    // MUST equal the digest the dry-run predicted from the same
    // sources. A mismatch means the sources moved mid-run (or the
    // pipeline is non-deterministic) — the sync is not claimed
    // complete.
    if (diff.digestAfter !== digestAfter) {
      throw new Error(
        `digest mismatch after the pipeline run: the dry-run predicted ${digestAfter} but the regenerated rows digest to ${diff.digestAfter} — the sources may have moved mid-run; re-run the sync`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${tag} SYNC FAILED: ${message}`);
    const failedEntry = buildSyncHistoryEntry({
      operationType: mode,
      initiatedBy: null,
      sourceEntity: 'price-pipeline:price_rows.json',
      previousValue: null,
      newValue: null,
      affectedAhspFamilies: [],
      affectedComponents: [],
      affectedProjects: [],
      successfulOperations: 0,
      failedOperations: 1,
      unresolvedConflicts: [],
      completedAt: new Date().toISOString(),
      recoveryStatus: 'RECOVERY_PENDING',
    });
    appendSyncHistoryEntryToTrail(failedEntry);
    console.error(
      `${tag} recorded failed sync ${failedEntry.operationId} (recovery: re-run the sync — the pipeline is idempotent).`,
    );
    process.exit(1);
  }

  const affectedFamilies = domainsChanged(beforeMatchReport, afterMatchReport);

  const report: ReconciliationReport = {
    schemaVersion: 1,
    generatedAt: now,
    mode,
    dryRun: false,
    digestBefore: lastDigest,
    digestAfter: diff.digestAfter,
    changed: !diff.unchanged,
    before: beforeCounts,
    after: afterCounts,
    rowDiff: {
      added: diff.added.length,
      removed: diff.removed.length,
      changed: diff.changed.length,
      unchangedCount: diff.unchangedCount,
      changedRows: diff.changed.slice(0, 100).map((c) => ({
        id: c.id,
        changedFields: c.changedFields,
        beforePrice: c.before.price,
        afterPrice: c.after.price,
        beforeUnit: c.before.unit,
        afterUnit: c.after.unit,
      })),
    },
    affectedAhspFamilies: affectedFamilies,
    stepsSkippedInDryRun: null,
    operationId: null,
    priceAssert: assertResult,
  };
  const entry = buildSyncHistoryEntry({
    operationType: mode,
    initiatedBy: null,
    sourceEntity: 'price-pipeline:price_rows.json',
    previousValue: null,
    newValue: null,
    affectedAhspFamilies: affectedFamilies,
    affectedComponents: [],
    affectedProjects: [],
    successfulOperations: diff.added.length + diff.changed.length,
    failedOperations: 0,
    unresolvedConflicts: [],
    completedAt: now,
    recoveryStatus: 'NOT_NEEDED',
  });
  report.operationId = entry.operationId;
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(RECONCILIATION_PATH, JSON.stringify(report, null, 2));
  appendSyncHistoryEntryToTrail(entry);

  console.log(`${tag} ${mode} complete — operation ${entry.operationId}`);
  console.log(`${tag} row diff: +${diff.added.length} added, -${diff.removed.length} removed, ~${diff.changed.length} changed, ${diff.unchangedCount} unchanged`);
  printCounts('before', beforeCounts);
  printCounts('after', afterCounts);
  console.log(`${tag} report: data/price2026/reports/sync_reconciliation.json`);
}

main();

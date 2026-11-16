/**
 * MASTER PRICING §8 — AHSP VERSION SNAPSHOT BUILDER + OPERATOR CLI.
 * =================================================================
 *
 * Builds the versioned AHSP snapshots (D4) from the runtime catalog
 * and operates the version registry. The runtime catalog
 * (`ALL_OFFICIAL_AHSP_ITEMS` from masterRegistry) is the extraction
 * source — the same data the resolver, AI, and UI read — so a snapshot
 * is by construction comparable with the live catalog.
 *
 * Modes:
 *
 *   (default)  Baseline extract: write/verify the v2026.1 as-is
 *              snapshots for all four families + the active pointer +
 *              the version history trail. IDEMPOTENT: re-running with
 *              an unchanged catalog rewrites byte-identical snapshot
 *              files. If the live catalog DRIFTED from a frozen
 *              version file, the script FAILS (it never silently
 *              rewrites a frozen version — create a new version
 *              instead).
 *
 *   --check    Verify only: recompute the checksums of the live
 *              catalog and compare them with the stored snapshot
 *              files + pointer. Exit 0 = as-is proven, 1 = drift.
 *
 *   --clone <family> <fromVersion> <toVersion> --reason "..."
 *              Mode B, file step: copy a version file to a new
 *              version id (same content checksum, provenance
 *              CLONE_AS_IS) + add the DRAFT record via the engine.
 *              The active pointer does NOT move.
 *
 *   --new-version <family> <versionId> --from <baseVersion>
 *     --reason "..." --provenance PIPELINE_REGENERATED|OVERLAY
 *              Mode A, content step: extract the CURRENT catalog
 *              (after the operator edited the validated JSON and ran
 *              ahsp:pipeline) as a new DRAFT version + add the DRAFT
 *              record via the engine. The pointer does NOT move —
 *              publish it explicitly (see --publish). Refuses
 *              PIPELINE_REGENERATED for BM/SMKK (R-2) and OVERLAY
 *              for CK/SDA.
 *
 *   --publish <family> <versionId> --reason "..."
 *              Publish a DRAFT version: the pointer moves, the
 *              previous ACTIVE version becomes SUPERSEDED, and the
 *              history trail gains a PUBLISH entry. All transitions
 *              go through the engine (ahspVersioning.ts) — this
 *              script never edits the registry by hand.
 *
 *   --dir <path>     Versions directory (default:
 *                    data/ahsp2026/versions). Tests run the script
 *                    against a temp copy via this flag.
 *   --ts-out <path>  Generated pointer module path (default:
 *                    src/data/nationalCostDatabase/ahspVersionPointer.generated.ts).
 *
 * Usage:
 *   npm run ahsp:versions                 (baseline extract)
 *   npm run ahsp:versions -- --check       (as-is gate)
 *
 * NOTE (§8 scope): §8 runs ONLY the baseline extract + --check. No
 * real clone / new version / publish is performed — there is no
 * approved data edit yet (L.05/L.06, M293, … await owner approval,
 * §15). The --clone / --new-version / --publish modes are the
 * operational loop for §15, exercised in tests against temp dirs.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  AHSP_BASELINE_VERSION_ID,
  AHSP_FAMILIES,
  AHSP_VERSIONS_DIR,
  buildRegistryState,
  buildVersionSnapshot,
  canonicalizeAhspItems,
  cloneAhspItems,
  cloneVersion,
  computeAhspContentChecksum,
  getVersionRecord,
  isValidVersionId,
  publishVersion,
  reviseDraftContent,
  snapshotPathFor,
  validateSnapshotContent,
  type AhspFamily,
  type AhspVersionContentProvenance,
  type AhspVersionRecord,
  type AhspVersionRegistryState,
  type AhspVersionSnapshot,
} from '../../src/data/nationalCostDatabase/ahspVersioning';
import {
  buildVersionHistoryEntry,
  buildVersionHistoryJsonlHeader,
  parseVersionHistoryJsonl,
  serializeVersionHistoryEntryJsonl,
  serializeVersionHistoryHeaderJsonl,
  type AhspVersionHistoryEntry,
} from '../../src/data/nationalCostDatabase/ahspVersionHistory';
import { AHSP_DATABASE_VERSION } from '../../src/data/nationalCostDatabase/types';

const ROOT = process.cwd();
const DEFAULT_VERSIONS_DIR = path.join(ROOT, AHSP_VERSIONS_DIR);
const DEFAULT_TS_OUT = path.join(
  ROOT,
  'src',
  'data',
  'nationalCostDatabase',
  'ahspVersionPointer.generated.ts',
);

const BASELINE_REASON =
  'Baseline as-is v2026.1: the runtime AHSP catalog as generated 2026-10-20, frozen without content change (Master Pricing §8).';
const BASELINE_SOURCE_DESCRIPTION =
  'Runtime catalog ALL_OFFICIAL_AHSP_ITEMS (masterRegistry): canonical AHSP 2026 generated 2026-10-20 + Bina Marga 2026 master + official SMKK 190.';

interface CliOptions {
  mode: 'baseline' | 'check' | 'clone' | 'new-version' | 'publish';
  dir: string;
  tsOut: string;
  family?: AhspFamily;
  fromVersion?: string;
  toVersion?: string;
  versionId?: string;
  reason?: string;
  provenance?: AhspVersionContentProvenance;
  actor?: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { mode: 'baseline', dir: DEFAULT_VERSIONS_DIR, tsOut: DEFAULT_TS_OUT };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') opts.mode = 'check';
    else if (arg === '--clone') opts.mode = 'clone';
    else if (arg === '--new-version') opts.mode = 'new-version';
    else if (arg === '--publish') opts.mode = 'publish';
    else if (arg === '--dir') opts.dir = path.resolve(argv[++i]);
    else if (arg === '--ts-out') opts.tsOut = path.resolve(argv[++i]);
    else if (arg === '--reason') opts.reason = argv[++i];
    else if (arg === '--from') opts.fromVersion = argv[++i];
    else if (arg === '--provenance') opts.provenance = argv[++i] as AhspVersionContentProvenance;
    else if (arg === '--actor') opts.actor = argv[++i];
    else if (arg.startsWith('--')) throw new Error(`Unknown flag ${arg}`);
    else positional.push(arg);
  }
  if (opts.mode === 'clone') {
    const [family, fromVersion, toVersion] = positional;
    if (!family || !fromVersion || !toVersion) {
      throw new Error('Usage: --clone <family> <fromVersion> <toVersion> --reason "..."');
    }
    opts.family = family as AhspFamily;
    opts.fromVersion = fromVersion;
    opts.toVersion = toVersion;
  } else if (opts.mode === 'new-version') {
    const [family, versionId] = positional;
    if (!family || !versionId) {
      throw new Error('Usage: --new-version <family> <versionId> --from <base> --reason "..." --provenance <PIPELINE_REGENERATED|OVERLAY>');
    }
    opts.family = family as AhspFamily;
    opts.versionId = versionId;
  } else if (opts.mode === 'publish') {
    const [family, versionId] = positional;
    if (!family || !versionId) {
      throw new Error('Usage: --publish <family> <versionId> --reason "..."');
    }
    opts.family = family as AhspFamily;
    opts.versionId = versionId;
  }
  if (opts.mode === 'new-version' && !opts.fromVersion) {
    throw new Error('--new-version requires --from <baseVersion>');
  }
  return opts;
}

function assertFamily(family: unknown): AhspFamily {
  if (typeof family !== 'string' || !(AHSP_FAMILIES as readonly string[]).includes(family)) {
    throw new Error(`Unknown AHSP family ${JSON.stringify(family)} (expected one of ${AHSP_FAMILIES.join(', ')})`);
  }
  return family as AhspFamily;
}

// --- File layout -----------------------------------------------------------

function snapshotFile(dir: string, family: AhspFamily, versionId: string): string {
  return path.join(dir, family, `${versionId}.json`);
}
function pointerFile(dir: string): string {
  return path.join(dir, 'active-versions.json');
}
function historyFile(dir: string): string {
  return path.join(dir, 'ahsp_version_history.jsonl');
}

interface PointerFileContent {
  schemaVersion: number;
  generatedAt: string;
  generatedBy: string;
  active: Record<string, string>;
  records: AhspVersionRecord[];
}

// --- Registry persistence (engine is the only transition authority) --------

function readHistory(dir: string): AhspVersionHistoryEntry[] {
  const file = historyFile(dir);
  if (!fs.existsSync(file)) return [];
  const parsed = parseVersionHistoryJsonl(fs.readFileSync(file, 'utf8'));
  if (parsed.errors.length > 0) {
    throw new Error(`History trail ${file} has parse errors: ${parsed.errors.slice(0, 3).join('; ')}`);
  }
  return parsed.entries;
}

function loadRegistryState(dir: string): AhspVersionRegistryState {
  const file = pointerFile(dir);
  if (!fs.existsSync(file)) {
    throw new Error(`No registry pointer found at ${file} — run the baseline extract first`);
  }
  const pointer = JSON.parse(fs.readFileSync(file, 'utf8')) as PointerFileContent;
  const history = readHistory(dir);
  return buildRegistryState(pointer.records, history);
}

function writePointerAndTs(
  dir: string,
  tsOut: string,
  state: AhspVersionRegistryState,
  now: string,
): void {
  const records: AhspVersionRecord[] = [];
  for (const family of AHSP_FAMILIES) {
    for (const rec of Object.values(state.versions[family])) records.push(rec);
  }
  records.sort((a, b) => {
    if (a.family < b.family) return -1;
    if (a.family > b.family) return 1;
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return a.versionId < b.versionId ? -1 : 1;
  });
  const pointer: PointerFileContent = {
    schemaVersion: 1,
    generatedAt: now,
    generatedBy: 'scripts/ahsp2026/buildAhspVersionSnapshots.ts',
    active: { ...state.active },
    records,
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pointerFile(dir), `${JSON.stringify(pointer, null, 2)}\n`, 'utf8');
  const ts = `/**
 * AHSP VERSION POINTER — AUTO-GENERATED (Master Pricing §8).
 * DO NOT EDIT BY HAND — regenerate with:
 *   npm run ahsp:versions
 * Source: data/ahsp2026/versions/active-versions.json
 *
 * The active version per family + the registry records for all known
 * versions. The runtime builds its registry state from this module
 * (see buildRegistryState in ahspVersioning.ts). The pointer moves
 * ONLY via publish (Mode B) or a validated direct-edit apply (Mode A).
 */
import type {
  AhspFamily,
  AhspVersionRecord,
} from './ahspVersioning';

export const AHSP_VERSION_POINTER_GENERATED_AT = ${JSON.stringify(now)};

export const ACTIVE_AHSP_VERSIONS: Readonly<Record<AhspFamily, string>> = ${JSON.stringify(pointer.active, null, 2)} as const;

export const AHSP_VERSION_RECORDS: readonly AhspVersionRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.mkdirSync(path.dirname(tsOut), { recursive: true });
  fs.writeFileSync(tsOut, ts, 'utf8');
}

function appendHistory(dir: string, entry: AhspVersionHistoryEntry): void {
  const file = historyFile(dir);
  if (!fs.existsSync(file)) {
    throw new Error(`History trail ${file} does not exist — run the baseline extract first`);
  }
  const existing = readHistory(dir);
  if (existing.some((e) => e.id === entry.id)) {
    throw new Error(`History entry ${entry.id} already exists in ${file} — refusing duplicate append`);
  }
  fs.appendFileSync(file, `${serializeVersionHistoryEntryJsonl(entry)}\n`, 'utf8');
}

// --- Snapshot serialization (canonical: sorted keys via the engine) --------

function serializeSnapshot(snapshot: AhspVersionSnapshot): string {
  // Items are serialized in the engine's canonical form (sorted by id,
  // deep-sorted keys) so re-runs are byte-identical; the meta header
  // keeps its declared field order. Compact JSON (no indent) — this is
  // a machine artifact (~16 MB total across families).
  const out = {
    schemaVersion: snapshot.schemaVersion,
    meta: snapshot.meta,
    items: canonicalizeAhspItems(snapshot.items),
  };
  return `${JSON.stringify(out)}\n`;
}

function readSnapshot(file: string): AhspVersionSnapshot {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as AhspVersionSnapshot;
}

// --- Catalog extraction (lazy import — clone/publish/check-of-files stay fast) ---

async function loadCatalogByFamily(): Promise<Record<AhspFamily, import('../../src/data/nationalCostDatabase/types').NationalAHSPItem[]>> {
  const { ALL_OFFICIAL_AHSP_ITEMS } = await import(
    '../../src/data/nationalCostDatabase/masterRegistry'
  );
  const byFamily: Record<AhspFamily, import('../../src/data/nationalCostDatabase/types').NationalAHSPItem[]> = {
    CIPTA_KARYA: [],
    BINA_MARGA: [],
    SUMBER_DAYA_AIR: [],
    SMKK: [],
  };
  for (const item of ALL_OFFICIAL_AHSP_ITEMS) {
    if (!(AHSP_FAMILIES as readonly string[]).includes(item.domain)) {
      throw new Error(`Catalog item ${item.id} has unexpected domain ${JSON.stringify(item.domain)} — cannot version it`);
    }
    byFamily[item.domain as AhspFamily].push(item);
  }
  return byFamily;
}

// --- Modes -----------------------------------------------------------------

async function runBaseline(opts: CliOptions): Promise<void> {
  const now = new Date().toISOString();
  if (AHSP_DATABASE_VERSION !== AHSP_BASELINE_VERSION_ID) {
    throw new Error(
      `AHSP_DATABASE_VERSION (${AHSP_DATABASE_VERSION}) != baseline ${AHSP_BASELINE_VERSION_ID} — refusing to extract a baseline against a moved constant`,
    );
  }
  console.log(`[ahsp:versions] extracting v${AHSP_BASELINE_VERSION_ID} baseline from the runtime catalog…`);
  const byFamily = await loadCatalogByFamily();
  const records: AhspVersionRecord[] = [];
  let total = 0;
  for (const family of AHSP_FAMILIES) {
    const items = byFamily[family];
    const validation = validateSnapshotContent(family, items);
    if (!validation.valid) {
      throw new Error(`Catalog validation failed for ${family}: ${validation.errors.slice(0, 5).join('; ')}`);
    }
    const checksum = computeAhspContentChecksum(items);
    const file = snapshotFile(opts.dir, family, AHSP_BASELINE_VERSION_ID);
    let createdAt = now;
    if (fs.existsSync(file)) {
      const existing = readSnapshot(file);
      const existingChecksum = computeAhspContentChecksum(existing.items);
      if (existingChecksum !== checksum) {
        throw new Error(
          `FROZEN VERSION DRIFT: live catalog checksum for ${family} (${checksum}) ` +
            `does not match stored v${AHSP_BASELINE_VERSION_ID} (${existingChecksum}). ` +
            `The frozen baseline must never be silently rewritten — create a new version instead.`,
        );
      }
      // Idempotent re-run: keep the original meta (createdAt/reason).
      createdAt = existing.meta.createdAt;
      console.log(`  ${family}: v${AHSP_BASELINE_VERSION_ID} unchanged (${items.length} items, checksum ${checksum})`);
    } else {
      console.log(`  ${family}: v${AHSP_BASELINE_VERSION_ID} NEW (${items.length} items, checksum ${checksum})`);
    }
    const snapshot = buildVersionSnapshot({
      family,
      versionId: AHSP_BASELINE_VERSION_ID,
      createdFrom: null,
      createdBy: null,
      createdAt,
      reason: BASELINE_REASON,
      contentProvenance: 'CANONICAL_BASELINE',
      sourceDescription: BASELINE_SOURCE_DESCRIPTION,
      items,
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, serializeSnapshot(snapshot), 'utf8');
    total += items.length;
    records.push({
      family,
      versionId: AHSP_BASELINE_VERSION_ID,
      status: 'ACTIVE',
      createdFrom: null,
      createdBy: null,
      createdAt,
      reason: BASELINE_REASON,
      contentChecksum: checksum,
      contentProvenance: 'CANONICAL_BASELINE',
      snapshotPath: snapshotPathFor(family, AHSP_BASELINE_VERSION_ID),
      itemCount: items.length,
      publishedAt: createdAt,
      publishedBy: null,
    });
  }
  // History trail: create once (HEADER + 4 BASELINE entries); never rewrite.
  const hfile = historyFile(opts.dir);
  let history: AhspVersionHistoryEntry[] = [];
  if (!fs.existsSync(hfile)) {
    const header = buildVersionHistoryJsonlHeader(now, {
      CIPTA_KARYA: AHSP_BASELINE_VERSION_ID,
      BINA_MARGA: AHSP_BASELINE_VERSION_ID,
      SUMBER_DAYA_AIR: AHSP_BASELINE_VERSION_ID,
      SMKK: AHSP_BASELINE_VERSION_ID,
    });
    const lines = [serializeVersionHistoryHeaderJsonl(header)];
    for (const rec of records) {
      const entry = buildVersionHistoryEntry({
        family: rec.family,
        versionId: rec.versionId,
        operation: 'BASELINE',
        previousVersionId: null,
        baseVersionId: null,
        contentChecksum: rec.contentChecksum,
        previousContentChecksum: null,
        adminIdentity: null,
        changedAt: rec.createdAt,
        reason: BASELINE_REASON,
        impactStatus: null,
        impactNote: null,
        diffSummary: null,
        publicationStatus: 'BASELINE',
      });
      history.push(entry);
      lines.push(serializeVersionHistoryEntryJsonl(entry));
    }
    fs.mkdirSync(opts.dir, { recursive: true });
    fs.writeFileSync(hfile, `${lines.join('\n')}\n`, 'utf8');
    console.log(`  history trail created (${history.length} BASELINE entries)`);
  } else {
    history = readHistory(opts.dir);
    for (const family of AHSP_FAMILIES) {
      const found = history.some(
        (e) => e.family === family && e.versionId === AHSP_BASELINE_VERSION_ID && e.operation === 'BASELINE',
      );
      if (!found) {
        throw new Error(`History trail ${hfile} is missing the BASELINE entry for ${family} — refusing to proceed`);
      }
    }
    console.log(`  history trail present (${history.length} entries, untouched)`);
  }
  const state = buildRegistryState(records, history);
  writePointerAndTs(opts.dir, opts.tsOut, state, now);
  console.log(`[ahsp:versions] baseline complete: ${total} items across 4 families; pointer = ${AHSP_BASELINE_VERSION_ID} everywhere.`);
}

async function runCheck(opts: CliOptions): Promise<void> {
  console.log('[ahsp:versions] --check: verifying stored snapshots against the live catalog…');
  const byFamily = await loadCatalogByFamily();
  const failures: string[] = [];
  let total = 0;
  for (const family of AHSP_FAMILIES) {
    const items = byFamily[family];
    total += items.length;
    const liveChecksum = computeAhspContentChecksum(items);
    const file = snapshotFile(opts.dir, family, AHSP_BASELINE_VERSION_ID);
    if (!fs.existsSync(file)) {
      failures.push(`${family}: snapshot file missing (${file})`);
      continue;
    }
    const stored = readSnapshot(file);
    if (stored.meta.versionId !== AHSP_BASELINE_VERSION_ID || stored.meta.family !== family) {
      failures.push(`${family}: snapshot meta mismatch (family=${stored.meta.family}, version=${stored.meta.versionId})`);
      continue;
    }
    if (stored.meta.itemCount !== stored.items.length) {
      failures.push(`${family}: meta.itemCount ${stored.meta.itemCount} != items.length ${stored.items.length}`);
    }
    const storedChecksum = computeAhspContentChecksum(stored.items);
    if (storedChecksum !== stored.meta.contentChecksum) {
      failures.push(`${family}: stored checksum ${stored.meta.contentChecksum} != recomputed ${storedChecksum} (file internally inconsistent)`);
    }
    if (storedChecksum !== liveChecksum) {
      failures.push(`${family}: stored v${AHSP_BASELINE_VERSION_ID} checksum ${storedChecksum} != live catalog ${liveChecksum} (DRIFT)`);
    } else {
      console.log(`  ${family}: OK (${items.length} items, checksum ${liveChecksum})`);
    }
    const validation = validateSnapshotContent(family, stored.items);
    if (!validation.valid) {
      failures.push(`${family}: stored content invalid: ${validation.errors.slice(0, 3).join('; ')}`);
    }
  }
  // Pointer agreement.
  const pointer = JSON.parse(fs.readFileSync(pointerFile(opts.dir), 'utf8')) as PointerFileContent;
  for (const family of AHSP_FAMILIES) {
    if (pointer.active[family] !== AHSP_BASELINE_VERSION_ID) {
      failures.push(`${family}: pointer is ${pointer.active[family]}, expected ${AHSP_BASELINE_VERSION_ID}`);
    }
  }
  if (failures.length > 0) {
    console.error(`[ahsp:versions] --check FAILED (${failures.length}):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[ahsp:versions] --check PASSED: ${total} items as-is across 4 families.`);
}

function runClone(opts: CliOptions): void {
  const family = assertFamily(opts.family);
  const now = new Date().toISOString();
  if (!opts.reason) throw new Error('--clone requires --reason "..."');
  if (!opts.fromVersion || !opts.toVersion) throw new Error('--clone requires <fromVersion> <toVersion>');
  if (!isValidVersionId(opts.toVersion)) throw new Error(`toVersion must match YYYY.minor, got ${opts.toVersion}`);
  const sourceFile = snapshotFile(opts.dir, family, opts.fromVersion);
  if (!fs.existsSync(sourceFile)) throw new Error(`Source snapshot not found: ${sourceFile}`);
  const targetFile = snapshotFile(opts.dir, family, opts.toVersion);
  if (fs.existsSync(targetFile)) throw new Error(`Target snapshot already exists: ${targetFile} — refusing to overwrite`);
  const state = loadRegistryState(opts.dir);
  const { state: next, record, historyEntry } = cloneVersion(state, {
    family,
    sourceVersionId: opts.fromVersion,
    newVersionId: opts.toVersion,
    reason: opts.reason,
    actor: opts.actor ?? null,
    now,
  });
  const source = readSnapshot(sourceFile);
  const cloned: AhspVersionSnapshot = {
    schemaVersion: source.schemaVersion,
    meta: {
      ...source.meta,
      versionId: opts.toVersion,
      createdFrom: opts.fromVersion,
      createdBy: opts.actor ?? null,
      createdAt: now,
      reason: opts.reason,
      contentProvenance: 'CLONE_AS_IS',
    },
    items: cloneAhspItems(source.items),
  };
  if (computeAhspContentChecksum(cloned.items) !== source.meta.contentChecksum) {
    throw new Error('Clone content checksum mismatch — refusing to write a corrupt clone');
  }
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, serializeSnapshot(cloned), 'utf8');
  writePointerAndTs(opts.dir, opts.tsOut, next, now);
  appendHistory(opts.dir, historyEntry);
  console.log(`[ahsp:versions] cloned ${family} ${opts.fromVersion} → ${opts.toVersion} (DRAFT, checksum ${record.contentChecksum}); pointer unchanged (${next.active[family]}).`);
}

async function runNewVersion(opts: CliOptions): Promise<void> {
  const family = assertFamily(opts.family);
  const now = new Date().toISOString();
  if (!opts.reason) throw new Error('--new-version requires --reason "..."');
  if (!opts.versionId || !opts.fromVersion) throw new Error('--new-version requires <versionId> and --from <baseVersion>');
  if (!opts.provenance) throw new Error('--new-version requires --provenance PIPELINE_REGENERATED|OVERLAY');
  if (opts.provenance !== 'PIPELINE_REGENERATED' && opts.provenance !== 'OVERLAY') {
    throw new Error(`--provenance must be PIPELINE_REGENERATED or OVERLAY, got ${opts.provenance}`);
  }
  const targetFile = snapshotFile(opts.dir, family, opts.versionId);
  if (fs.existsSync(targetFile)) throw new Error(`Snapshot already exists: ${targetFile} — refusing to overwrite`);
  const state = loadRegistryState(opts.dir);
  const base = getVersionRecord(state, family, opts.fromVersion);
  if (!base) throw new Error(`Base version ${opts.fromVersion} not found for family ${family}`);
  const byFamily = await loadCatalogByFamily();
  const items = byFamily[family];
  const snapshot = buildVersionSnapshot({
    family,
    versionId: opts.versionId,
    createdFrom: opts.fromVersion,
    createdBy: opts.actor ?? null,
    createdAt: now,
    reason: opts.reason,
    contentProvenance: opts.provenance,
    sourceDescription: `Re-extracted from the runtime catalog after ahsp:pipeline regeneration (base ${opts.fromVersion}).`,
    items,
  });
  if (snapshot.meta.contentChecksum === base.contentChecksum) {
    throw new Error(
      `Regenerated content for ${family} is IDENTICAL to base ${opts.fromVersion} (checksum ${base.contentChecksum}) — ` +
        `no catalog change detected. A new version with unchanged content is pointless; ` +
        `edit the validated JSON and re-run ahsp:pipeline first.`,
    );
  }
  // Record the new version as a DRAFT via the engine (clone the record
  // shape, then revise its content — the engine's Mode B path — so the
  // registry transition is engine-authored, not hand-edited).
  const { state: cloned, historyEntry: cloneEntry } = cloneVersion(state, {
    family,
    sourceVersionId: opts.fromVersion,
    newVersionId: opts.versionId,
    reason: opts.reason,
    actor: opts.actor ?? null,
    now,
  });
  // The clone step already wrote its history entry to `cloned` state;
  // revise the draft's content to the regenerated items.
  const { state: next, historyEntry: reviseEntry } = reviseDraftContent(cloned, {
    family,
    versionId: opts.versionId,
    items,
    contentProvenance: opts.provenance,
    reason: opts.reason,
    actor: opts.actor ?? null,
    now,
  });
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, serializeSnapshot(snapshot), 'utf8');
  writePointerAndTs(opts.dir, opts.tsOut, next, now);
  appendHistory(opts.dir, cloneEntry);
  appendHistory(opts.dir, reviseEntry);
  console.log(
    `[ahsp:versions] new DRAFT ${family} ${opts.versionId} from base ${opts.fromVersion} ` +
      `(${items.length} items, checksum ${snapshot.meta.contentChecksum}); pointer unchanged (${next.active[family]}). Publish explicitly with --publish.`,
  );
}

function runPublish(opts: CliOptions): void {
  const family = assertFamily(opts.family);
  const now = new Date().toISOString();
  if (!opts.reason) throw new Error('--publish requires --reason "..."');
  if (!opts.versionId) throw new Error('--publish requires <versionId>');
  const state = loadRegistryState(opts.dir);
  const { state: next, historyEntry, published } = publishVersion(state, {
    family,
    versionId: opts.versionId,
    reason: opts.reason,
    actor: opts.actor ?? null,
    now,
  });
  if (!published || !historyEntry) {
    console.log(`[ahsp:versions] ${family} ${opts.versionId} is already ACTIVE — no change.`);
    return;
  }
  writePointerAndTs(opts.dir, opts.tsOut, next, now);
  appendHistory(opts.dir, historyEntry);
  console.log(`[ahsp:versions] published ${family} ${opts.versionId} (pointer moved; previous version SUPERSEDED).`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mode === 'baseline') await runBaseline(opts);
  else if (opts.mode === 'check') await runCheck(opts);
  else if (opts.mode === 'clone') runClone(opts);
  else if (opts.mode === 'new-version') await runNewVersion(opts);
  else if (opts.mode === 'publish') runPublish(opts);
}

main().catch((err: unknown) => {
  console.error(`[ahsp:versions] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

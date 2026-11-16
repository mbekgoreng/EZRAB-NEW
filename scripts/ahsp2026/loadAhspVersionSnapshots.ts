/**
 * MASTER PRICING §13 — AHSP version snapshot loader (filesystem).
 * ================================================================
 *
 * Reads the §8 snapshot files from disk (`data/ahsp2026/versions/`)
 * and validates them through the pure builder in
 * `src/engine/pricing/sync/snapshotContents.ts`. The registry file
 * `active-versions.json` is the source of truth for WHICH snapshots
 * exist (its `records` list carries family, versionId, snapshotPath
 * and the registry's checksum claim); each snapshot file is then
 * verified against its own meta checksum AND against the registry
 * claim — a mismatch in either direction is reported, never
 * silently resolved.
 *
 * NO TOP-LEVEL SIDE EFFECTS: this module only exports functions,
 * so vitest can import it (the §13 suite loads the REAL versions
 * directory read-only and a temp-dir fixture for error paths).
 * The CLI that consumes it is `syncAhspVersionPointers.ts`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AHSP_FAMILIES,
  AHSP_VERSIONS_DIR,
  type AhspFamily,
  type AhspVersionRecord,
} from '../../src/data/nationalCostDatabase/ahspVersioning';
import {
  asAhspVersionSnapshot,
  buildVersionedContents,
  type VersionedContentsResult,
} from '../../src/engine/pricing/sync/snapshotContents';

export interface LoadedAhspVersionSnapshots {
  /** The validated contents map (§10) + per-snapshot records/errors. */
  result: VersionedContentsResult;
  /** The active pointer per family (from active-versions.json), or null when the registry file is missing/invalid. */
  activeVersions: Readonly<Record<AhspFamily, string>> | null;
  /** Loader-level errors (missing/unparseable files, registry/file checksum disagreement). */
  loaderErrors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAhspFamily(value: unknown): value is AhspFamily {
  return typeof value === 'string' && (AHSP_FAMILIES as readonly string[]).includes(value);
}

/** Parse `active-versions.json`. Returns the active map + records, or null + an error. */
function parseActiveVersions(
  versionsDir: string,
): {
  activeVersions: Readonly<Record<AhspFamily, string>> | null;
  records: Array<{
    family: AhspFamily;
    versionId: string;
    snapshotPath: string;
    contentChecksum: string;
  }>;
  error: string | null;
} {
  const registryPath = path.join(versionsDir, 'active-versions.json');
  let raw: string;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch {
    return {
      activeVersions: null,
      records: [],
      error: `${registryPath}: cannot be read (missing or unreadable)`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    return {
      activeVersions: null,
      records: [],
      error: `${registryPath}: invalid JSON (${err instanceof Error ? err.message : String(err)})`,
    };
  }
  if (!isRecord(parsed)) {
    return { activeVersions: null, records: [], error: `${registryPath}: not a JSON object` };
  }
  const activeVersions: Partial<Record<AhspFamily, string>> = {};
  if (isRecord(parsed.active)) {
    for (const family of AHSP_FAMILIES) {
      const v = parsed.active[family];
      if (typeof v === 'string' && v.trim() !== '') activeVersions[family] = v;
    }
  }
  const missing = AHSP_FAMILIES.filter((f) => activeVersions[f] === undefined);
  const records: Array<{
    family: AhspFamily;
    versionId: string;
    snapshotPath: string;
    contentChecksum: string;
  }> = [];
  if (Array.isArray(parsed.records)) {
    for (const rec of parsed.records as unknown[]) {
      if (!isRecord(rec)) continue;
      if (!isAhspFamily(rec.family)) continue;
      if (typeof rec.versionId !== 'string' || rec.versionId.trim() === '') continue;
      if (typeof rec.snapshotPath !== 'string' || rec.snapshotPath.trim() === '') continue;
      if (typeof rec.contentChecksum !== 'string') continue;
      records.push({
        family: rec.family,
        versionId: rec.versionId,
        snapshotPath: rec.snapshotPath,
        contentChecksum: rec.contentChecksum,
      });
    }
  }
  if (missing.length > 0) {
    return {
      activeVersions: null,
      records,
      error: `${registryPath}: active pointer missing for ${missing.join(', ')}`,
    };
  }
  return {
    activeVersions: activeVersions as Readonly<Record<AhspFamily, string>>,
    records,
    error: null,
  };
}

/**
 * Read the registry's FULL version records (for `buildRegistryState`
 * — the pointer-sync CLI's gate). Validates the record shape; a
 * malformed record is an ERROR (returned, not thrown), because a
 * corrupt registry must never produce pointer-sync SQL.
 */
export function readActiveVersionRecords(
  versionsDir: string = path.join(process.cwd(), AHSP_VERSIONS_DIR),
): { records: AhspVersionRecord[]; errors: string[] } {
  const registryPath = path.join(versionsDir, 'active-versions.json');
  let raw: string;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch {
    return { records: [], errors: [`${registryPath}: cannot be read (missing or unreadable)`] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    return {
      records: [],
      errors: [`${registryPath}: invalid JSON (${err instanceof Error ? err.message : String(err)})`],
    };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.records)) {
    return { records: [], errors: [`${registryPath}: no "records" array`] };
  }
  const records: AhspVersionRecord[] = [];
  const errors: string[] = [];
  const statuses = ['DRAFT', 'ACTIVE', 'SUPERSEDED'] as const;
  const provenances = [
    'CANONICAL_BASELINE',
    'PIPELINE_REGENERATED',
    'OVERLAY',
    'CLONE_AS_IS',
    'ROLLBACK_COPY',
  ] as const;
  (parsed.records as unknown[]).forEach((rec, i) => {
    const where = `${registryPath} records[${i}]`;
    if (!isRecord(rec)) {
      errors.push(`${where}: not an object`);
      return;
    }
    const problems: string[] = [];
    if (!isAhspFamily(rec.family)) problems.push('family is not a known AHSP family');
    if (typeof rec.versionId !== 'string' || rec.versionId.trim() === '') {
      problems.push('versionId is missing or empty');
    }
    if (typeof rec.status !== 'string' || !(statuses as readonly string[]).includes(rec.status)) {
      problems.push(`status ${JSON.stringify(rec.status)} is not DRAFT/ACTIVE/SUPERSEDED`);
    }
    if (rec.createdFrom !== null && typeof rec.createdFrom !== 'string') {
      problems.push('createdFrom must be a string or null');
    }
    if (rec.createdBy !== null && typeof rec.createdBy !== 'string') {
      problems.push('createdBy must be a string or null');
    }
    if (typeof rec.createdAt !== 'string' || Number.isNaN(Date.parse(rec.createdAt))) {
      problems.push('createdAt must be a valid ISO timestamp');
    }
    if (typeof rec.reason !== 'string' || rec.reason.trim() === '') {
      problems.push('reason is missing or empty');
    }
    if (typeof rec.contentChecksum !== 'string' || rec.contentChecksum === '') {
      problems.push('contentChecksum is missing or empty');
    }
    if (
      typeof rec.contentProvenance !== 'string' ||
      !(provenances as readonly string[]).includes(rec.contentProvenance)
    ) {
      problems.push(`contentProvenance ${JSON.stringify(rec.contentProvenance)} is not a known provenance`);
    }
    if (typeof rec.snapshotPath !== 'string' || rec.snapshotPath.trim() === '') {
      problems.push('snapshotPath is missing or empty');
    }
    if (typeof rec.itemCount !== 'number' || !Number.isInteger(rec.itemCount) || rec.itemCount < 0) {
      problems.push('itemCount must be a non-negative integer');
    }
    if (rec.publishedAt !== null && (typeof rec.publishedAt !== 'string' || Number.isNaN(Date.parse(rec.publishedAt)))) {
      problems.push('publishedAt must be a valid ISO timestamp or null');
    }
    if (rec.publishedBy !== null && typeof rec.publishedBy !== 'string') {
      problems.push('publishedBy must be a string or null');
    }
    if (problems.length > 0) {
      errors.push(`${where}: ${problems.join('; ')}`);
      return;
    }
    records.push(rec as unknown as AhspVersionRecord);
  });
  return { records, errors };
}

/**
 * Load every snapshot listed in the registry, validate each through
 * the pure builder, and cross-check the registry's checksum claim
 * against the file's meta checksum.
 *
 * `versionsDir` defaults to `<cwd>/data/ahsp2026/versions`
 * (the repo-root-relative §8 directory). `snapshotPath` values in
 * the registry are repo-root-relative; they are resolved against
 * the PARENT of the versions dir's parent (i.e. the repo root when
 * the default layout is used) — and fall back to the versions dir
 * itself when the resolved path does not exist (temp-dir fixtures).
 */
export function loadAhspVersionSnapshots(
  versionsDir: string = path.join(process.cwd(), AHSP_VERSIONS_DIR),
): LoadedAhspVersionSnapshots {
  const registry = parseActiveVersions(versionsDir);
  const loaderErrors: string[] = [];
  if (registry.error !== null) loaderErrors.push(registry.error);

  // The registry's snapshotPath values are repo-root-relative
  // (data/ahsp2026/versions/<FAMILY>/<version>.json). The repo root
  // is two levels above the versions dir in the standard layout.
  const repoRoot = path.resolve(versionsDir, '..', '..');
  const snapshots: Array<{ label: string; parsed: unknown }> = [];
  const registryChecksums = new Map<string, string>();

  for (const rec of registry.records) {
    const key = `${rec.family}|${rec.versionId}`;
    registryChecksums.set(key, rec.contentChecksum);
    const candidates = [
      path.join(repoRoot, rec.snapshotPath),
      path.join(versionsDir, rec.family, `${rec.versionId}.json`),
    ];
    const filePath = candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch {
      loaderErrors.push(`${rec.snapshotPath}: cannot be read (missing or unreadable)`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (err) {
      loaderErrors.push(
        `${rec.snapshotPath}: invalid JSON (${err instanceof Error ? err.message : String(err)})`,
      );
      continue;
    }
    snapshots.push({ label: rec.snapshotPath, parsed });
    // Registry-claim cross-check (the builder separately verifies
    // the file's meta checksum against the recomputed checksum).
    const typed = asAhspVersionSnapshot(parsed);
    if (typed !== null && typed.meta.contentChecksum !== rec.contentChecksum) {
      loaderErrors.push(
        `${rec.snapshotPath}: registry claims checksum ${rec.contentChecksum} but the file's meta declares ${typed.meta.contentChecksum} — the registry and the file disagree`,
      );
    }
  }

  const result = buildVersionedContents(snapshots);
  return { result, activeVersions: registry.activeVersions, loaderErrors };
}

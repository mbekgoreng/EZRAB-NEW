/**
 * MASTER PRICING §13 — VERSION SNAPSHOT LOADING (pure builder).
 * ================================================================
 *
 * §10 defined `VersionedAhspCatalogSource.contents` — the injected
 * map of versioned snapshot content — but nothing LOADED it: a
 * project pinned to an old version got an honest "content
 * unavailable" error, and §10/§11 compare/adoption of old versions
 * was blocked on it. This module closes that gap: it validates
 * parsed snapshot JSON (§8 format) and builds the contents map the
 * §10 source consumes.
 *
 * PURE (no fs): the filesystem loader is
 * `scripts/ahsp2026/loadAhspVersionSnapshots.ts`, which reads the
 * files and calls this builder. Vitest CAN import the fs loader
 * too (precedent: `masterPricingCanonicalModel.test.ts` imports
 * from scripts/), and the §13 suite does both.
 *
 * VALIDATION (fail-closed per snapshot, partial success across
 * snapshots): a snapshot loads only when its schema version is 1,
 * its family is a known AHSP family, its itemCount matches the
 * item array, its content checksum RECOMPUTES to the meta value
 * (a tampered or truncated file is refused — the checksum is the
 * integrity proof), its provenance is valid for the family, and
 * its content passes §8 structural validation. A snapshot that
 * fails any check is REPORTED in `errors` (never silently dropped)
 * and its content is NOT served; the other snapshots still load.
 * A caller that needs all-or-nothing (the pointer-sync CLI) must
 * refuse to proceed when `errors` is non-empty.
 *
 * KEYING: the contents map is keyed by the §10 `versionContentKey`
 * (`${family}|${versionId}`) — imported, never re-derived here.
 */
import {
  AHSP_FAMILIES,
  AHSP_VERSION_SNAPSHOT_SCHEMA_VERSION,
  computeAhspContentChecksum,
  validateContentProvenance,
  validateSnapshotContent,
  type AhspFamily,
  type AhspVersionSnapshot,
  type AhspVersionContentProvenance,
} from '../../../data/nationalCostDatabase/ahspVersioning';
import type { NationalAHSPItem } from '../../../data/nationalCostDatabase/types';
import { versionContentKey } from '../projectPriceModes';

export interface VersionedSnapshotRecord {
  family: AhspFamily;
  versionId: string;
  itemCount: number;
  /** The meta checksum (which the loader verified against the recomputed checksum). */
  contentChecksum: string;
  contentProvenance: AhspVersionContentProvenance;
}

export interface VersionedContentsResult {
  /** Keyed `${family}|${versionId}` — pass directly as `contents` to `createVersionedCatalogSource`. */
  contents: Readonly<Record<string, readonly NationalAHSPItem[]>>;
  /** One record per snapshot that LOADED (in input order). */
  records: readonly VersionedSnapshotRecord[];
  /** One message per snapshot that FAILED (in input order, prefixed with its source label). */
  errors: readonly string[];
  loadedCount: number;
  failedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAhspFamily(value: unknown): value is AhspFamily {
  return typeof value === 'string' && (AHSP_FAMILIES as readonly string[]).includes(value);
}

const PROVENANCE_VALUES: readonly string[] = [
  'CANONICAL_BASELINE',
  'PIPELINE_REGENERATED',
  'OVERLAY',
  'CLONE_AS_IS',
  'ROLLBACK_COPY',
];

function isProvenance(value: unknown): value is AhspVersionContentProvenance {
  return typeof value === 'string' && PROVENANCE_VALUES.includes(value);
}

/**
 * Validate parsed snapshot JSON and build the §10 contents map.
 * `snapshots` are `{ label, parsed }` pairs — the label is the
 * source path (or test name) used in error messages.
 */
export function buildVersionedContents(
  snapshots: readonly { label: string; parsed: unknown }[],
): VersionedContentsResult {
  const contents: Record<string, readonly NationalAHSPItem[]> = {};
  const records: VersionedSnapshotRecord[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();

  for (const { label, parsed } of snapshots) {
    const fail = (message: string): void => {
      errors.push(`${label}: ${message}`);
    };
    if (!isRecord(parsed)) {
      fail('snapshot is not a JSON object');
      continue;
    }
    if (parsed.schemaVersion !== AHSP_VERSION_SNAPSHOT_SCHEMA_VERSION) {
      fail(
        `schemaVersion ${JSON.stringify(parsed.schemaVersion)} is not supported ` +
          `(expected ${AHSP_VERSION_SNAPSHOT_SCHEMA_VERSION})`,
      );
      continue;
    }
    if (!isRecord(parsed.meta)) {
      fail('meta is missing or not an object');
      continue;
    }
    const { meta } = parsed;
    if (!isAhspFamily(meta.family)) {
      fail(`meta.family ${JSON.stringify(meta.family)} is not a known AHSP family`);
      continue;
    }
    if (typeof meta.versionId !== 'string' || meta.versionId.trim() === '') {
      fail('meta.versionId is missing or empty');
      continue;
    }
    if (!Array.isArray(parsed.items)) {
      fail('items is missing or not an array');
      continue;
    }
    const items = parsed.items as NationalAHSPItem[];
    if (meta.itemCount !== items.length) {
      fail(`meta.itemCount ${JSON.stringify(meta.itemCount)} does not match items.length ${items.length}`);
      continue;
    }
    if (typeof meta.contentChecksum !== 'string' || meta.contentChecksum === '') {
      fail('meta.contentChecksum is missing or empty');
      continue;
    }
    if (!isProvenance(meta.contentProvenance)) {
      fail(`meta.contentProvenance ${JSON.stringify(meta.contentProvenance)} is not a known provenance`);
      continue;
    }
    const key = versionContentKey(meta.family, meta.versionId);
    if (seenKeys.has(key)) {
      fail(`duplicate snapshot for ${meta.family} ${meta.versionId} (the first one wins)`);
      continue;
    }
    const content = validateSnapshotContent(meta.family, items);
    if (!content.valid) {
      fail(`invalid content: ${content.errors.slice(0, 5).join('; ')}`);
      continue;
    }
    const provenance = validateContentProvenance(meta.family, meta.contentProvenance);
    if (!provenance.valid) {
      fail(`invalid provenance: ${provenance.errors.join('; ')}`);
      continue;
    }
    const recomputed = computeAhspContentChecksum(items);
    if (recomputed !== meta.contentChecksum) {
      fail(
        `content checksum mismatch: meta declares ${meta.contentChecksum} but the items recompute to ${recomputed} — ` +
          'the file is tampered with, truncated, or was written by a different canonicalization',
      );
      continue;
    }
    seenKeys.add(key);
    contents[key] = Object.freeze([...items]);
    records.push({
      family: meta.family,
      versionId: meta.versionId,
      itemCount: items.length,
      contentChecksum: meta.contentChecksum,
      contentProvenance: meta.contentProvenance,
    });
  }

  return Object.freeze({
    contents: Object.freeze(contents),
    records: Object.freeze(records),
    errors: Object.freeze(errors),
    loadedCount: records.length,
    failedCount: errors.length,
  });
}

/**
 * Type-guard a parsed snapshot WITHOUT loading it (for callers that
 * need the typed snapshot, e.g. the pointer-sync CLI's meta read).
 * Returns the typed snapshot only when the SHAPE is right — checksum
 * and content validation still belong to `buildVersionedContents`.
 */
export function asAhspVersionSnapshot(parsed: unknown): AhspVersionSnapshot | null {
  if (!isRecord(parsed)) return null;
  if (parsed.schemaVersion !== AHSP_VERSION_SNAPSHOT_SCHEMA_VERSION) return null;
  if (!isRecord(parsed.meta)) return null;
  if (!isAhspFamily(parsed.meta.family)) return null;
  if (typeof parsed.meta.versionId !== 'string' || parsed.meta.versionId.trim() === '') return null;
  if (!Array.isArray(parsed.items)) return null;
  return parsed as unknown as AhspVersionSnapshot;
}

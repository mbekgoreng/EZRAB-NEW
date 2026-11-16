/**
 * MASTER PRICING §8 — AHSP DATABASE VERSIONING (D4).
 * ==================================================
 *
 * Implements Master Prompt §8 (Decision B: direct edit + clone) on top of
 * the audit design D4 (§2.4.6): a versioned AHSP database is a versioned
 * JSON snapshot + a registry record + an active-version pointer.
 *
 * WHAT A VERSION IS
 * -----------------
 * One version = one immutable JSON file per AHSP family:
 *
 *   data/ahsp2026/versions/<FAMILY>/<versionId>.json
 *
 * Each file is an `AhspVersionSnapshot`: a metadata header (`meta`) plus
 * the FULL item content (`items`, in the runtime `NationalAHSPItem`
 * shape — the same shape masterRegistry serves, so a snapshot can be
 * diffed against the live catalog and against any other version).
 * Content identity is the FNV-1a 64-bit checksum of the canonicalized
 * item array (deep-sorted keys, items sorted by id). Two versions with
 * the same checksum hold byte-equivalent content.
 *
 * WHY FULL-CONTENT SNAPSHOTS (and not the existing snapshot patterns)
 * ------------------------------------------------------------------
 * The repo already has per-PROJECT snapshots (`AHSPProjectSnapshot`,
 * `estimateVersioning`) — but those freeze RAB VALUES for one project
 * in localStorage; they cannot version the CATALOG, they are not
 * files, and they carry no checksum or registry. A "reference"
 * snapshot (metadata + pointer to the live canonical modules) was
 * also considered and REJECTED: the live modules are regenerable, so
 * a reference snapshot would silently change content when the
 * pipeline re-runs — violating the immutability rule (§8 (f)).
 * Full-content files are the only honest form, and D4 prices them
 * at ~13 MB per version — cheap for an immutable audit artifact.
 *
 * The first version of every family is `2026.1` "as-is": byte-equivalent
 * to the runtime catalog as generated 2026-10-20 (proven by checksum,
 * not by claim — see the test suite + buildAhspVersionSnapshots --check).
 *
 * FAMILIES
 * --------
 * CK and SDA regenerate through the canonical pipeline (`ahsp:pipeline`).
 * Bina Marga and SMKK are FROZEN for regeneration (R-2: their generators
 * + inputs are missing from the repo) — their content can only change
 * via the existing overlays (Bina Marga adapter / registry corrections).
 * The engine enforces this: `assertRegenerable` throws for BM/SMKK, and
 * `validateContentProvenance` refuses a PIPELINE_REGENERATED claim for
 * them (such a claim would be false — there is no pipeline to run).
 *
 * MODES (§8.2 / §8.3)
 * -------------------
 * Mode A — direct edit of the active database:
 *   checkpoint → impact → confirm → regenerate → version record.
 *   `createCheckpoint` pins the active version (immutable file — no copy
 *   is needed, the file IS the checkpoint). `confirmDirectEdit` requires
 *   a fresh checkpoint + an impact assessment + a reason (>= 10 chars).
 *   `applyDirectEdit` re-validates everything, creates the new ACTIVE
 *   version record, supersedes the previous one, and moves the pointer.
 *   On ANY validation failure the state is returned unchanged — the
 *   pointer never moves on a failed edit.
 *   The REGENERATE step itself (edit the validated JSON → run
 *   `ahsp:pipeline` → re-extract the snapshot) is an OPERATIONAL step
 *   performed by scripts/ahsp2026/buildAhspVersionSnapshots.ts; this
 *   engine validates and records the regenerated content, it does not
 *   run subprocesses. No data edit is performed by §8 itself — the
 *   L.05/L.06, M293 and other data fixes await owner approval (§15).
 *
 * Mode B — clone:
 *   `cloneVersion` copies the record (same content checksum) as a DRAFT
 *   under a new version id. The draft does NOT affect the active pointer
 *   or any resolution until `publishVersion` moves the pointer.
 *   `reviseDraftContent` lets a DRAFT's content evolve (drafts are work
 *   in progress, not published versions); it REFUSES published versions.
 *   A clone never modifies its source.
 *
 * ROLLBACK
 * --------
 * Rollback is a NEW version holding an old version's content
 * (provenance ROLLBACK_COPY, checksum == the target's checksum), created
 * as a DRAFT and published explicitly. There is no "resurrect" and no
 * delete — a SUPERSEDED version stays in the registry forever.
 *
 * IMPACT SEAM (§9 — REAL PROVIDER WIRED)
 * -------------------------------------
 * The real impact calculator is §9
 * (`src/engine/pricing/impact/masterPriceImpactPreview.ts`) and it is
 * the DEFAULT provider for the Mode A flow here
 * (`defaultImpactProvider` = `masterPriceImpactProvider`):
 * `assessDirectEditImpact` / `assessRollbackImpact` build the rich
 * change description (family + base version + new content + the §8
 * diff + collected workspace projects) and delegate to it. The
 * provider computes the actual impact (per-item deltas, affected
 * components, per-project RAB deltas via `recalculateCostSummary`)
 * and returns COMPUTED with a freshness fingerprint — or NOT_COMPUTED
 * when the input is incomplete, never a fabricated number.
 * `notComputedImpactProvider` remains as the explicit "do not
 * compute" choice (and for the §8 tests). A STALE preview — the state
 * moved after it was computed — is REFUSED by `confirmDirectEdit`,
 * and `applyDirectEdit` re-checks that the content being applied is
 * exactly the content the preview was computed for (§9 (d)).
 *
 * PROJECT PIN (§8 (e) / §10)
 * --------------------------
 * `resolveProjectAhspVersion` answers "which AHSP version does this
 * project use?" — SNAPSHOT/OVERRIDE projects use their pinned version
 * (legacy snapshots without a pin read as the pre-§3 baseline `2026.1`,
 * per §3 I-11); LIVE projects follow the active pointer. This module
 * does NOT change any project pricing behaviour — §10 owns that.
 *
 * PURITY
 * ------
 * Every function here is pure: state transitions take a registry state
 * and return a NEW frozen state (+ the history entry to append). There
 * is no localStorage, no network, no subprocess, no hidden singleton.
 * The initial state is built from the generated pointer module
 * (ahspVersionPointer.generated.ts) via `buildRegistryState`.
 */
import type {
  AHSPDomain,
  AHSPVersionDiff,
  AhspItemFieldChange,
  AhspItemFieldDiff,
  NationalAHSPItem,
} from './types';
import { AHSP_DATABASE_VERSION } from './types';
import { MASTER_PRICE_VERSION, type ProjectPricingMode } from '../priceDatabase2026/types';
import { masterPriceImpactProvider } from '../../engine/pricing/impact/masterPriceImpactPreview';
import type {
  ImpactPreviewFingerprint,
  MasterPriceImpactPreview,
  ProjectImpactInput,
} from '../../engine/pricing/impact/masterPriceImpactPreview';
import {
  appendVersionHistoryEntry,
  buildVersionHistoryEntry,
  type AhspVersionHistoryEntry,
} from './ahspVersionHistory';

// ---------------------------------------------------------------------------
// Families, ids, paths
// ---------------------------------------------------------------------------

/** The four AHSP-bearing families of SE DJBK No. 47/SE/Dk/2026. */
export type AhspFamily = 'CIPTA_KARYA' | 'BINA_MARGA' | 'SUMBER_DAYA_AIR' | 'SMKK';

export const AHSP_FAMILIES: readonly AhspFamily[] = [
  'CIPTA_KARYA',
  'BINA_MARGA',
  'SUMBER_DAYA_AIR',
  'SMKK',
] as const;

/** Family → runtime domain (identical strings today, mapped explicitly so a rename cannot drift). */
export const AHSP_FAMILY_DOMAINS: Readonly<Record<AhspFamily, AHSPDomain>> = {
  CIPTA_KARYA: 'CIPTA_KARYA',
  BINA_MARGA: 'BINA_MARGA',
  SUMBER_DAYA_AIR: 'SUMBER_DAYA_AIR',
  SMKK: 'SMKK',
} as const;

/** The first versioned baseline of every family (== AHSP_DATABASE_VERSION, §3 I-11). */
export const AHSP_BASELINE_VERSION_ID = '2026.1' as const;

/** Schema version of the versioned snapshot JSON format (bumped only with a migration). */
export const AHSP_VERSION_SNAPSHOT_SCHEMA_VERSION = 1 as const;

/** Minimum reason length for every version transition (mirrors §4.4 / price_assumptions). */
export const AHSP_VERSION_REASON_MIN_LENGTH = 10 as const;

/** Directory holding versioned snapshots + pointer + history trail (repo-relative). */
export const AHSP_VERSIONS_DIR = 'data/ahsp2026/versions' as const;

/** Version ids follow the `YYYY.minor` scheme (2026.1, 2026.2, …). */
const VERSION_ID_PATTERN = /^\d{4}\.\d+$/;

export function isValidVersionId(versionId: unknown): versionId is string {
  return typeof versionId === 'string' && VERSION_ID_PATTERN.test(versionId);
}

/** Deterministic snapshot file path for a family version. */
export function snapshotPathFor(family: AhspFamily, versionId: string): string {
  return `${AHSP_VERSIONS_DIR}/${family}/${versionId}.json`;
}

/** Families whose content CANNOT be regenerated (R-2: generator + input missing from the repo). */
export const FROZEN_REGENERATION_FAMILIES: readonly AhspFamily[] = ['BINA_MARGA', 'SMKK'] as const;

/**
 * Throws for Bina Marga / SMKK: their generators are missing (R-2), so no
 * regeneration is possible; their content changes only via the existing
 * overlays (Bina Marga adapter / registry corrections). CK/SDA pass.
 */
export function assertRegenerable(family: AhspFamily): void {
  if ((FROZEN_REGENERATION_FAMILIES as readonly string[]).includes(family)) {
    throw new Error(
      `AHSP family ${family} cannot be regenerated: its generator is missing from the repo ` +
        `(audit R-2 — Bina Marga: input JSON exists but the generator script is gone; ` +
        `SMKK: neither input nor generator exists). Content changes only via the existing ` +
        `overlays (Bina Marga adapter / registry corrections).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Snapshot format (§8 (a))
// ---------------------------------------------------------------------------

/**
 * How a version's content was produced. This is a provenance claim the
 * engine VALIDATES against the family (see validateContentProvenance):
 * a PIPELINE_REGENERATED claim for BM/SMKK is false (no pipeline
 * exists) and is refused; an OVERLAY claim for CK/SDA is refused
 * (CK/SDA edits go through the canonical pipeline, not overlays).
 */
export type AhspVersionContentProvenance =
  | 'CANONICAL_BASELINE' // v2026.1: the runtime catalog as-is, frozen
  | 'PIPELINE_REGENERATED' // CK/SDA: edited validated JSON + ahsp:pipeline + re-extract
  | 'OVERLAY' // BM/SMKK: adapter / registry overlay applied to the frozen base
  | 'CLONE_AS_IS' // Mode B clone: content identical to the source version
  | 'ROLLBACK_COPY'; // rollback: content identical to an older version

export interface AhspVersionSnapshotMeta {
  family: AhspFamily;
  versionId: string;
  /** Version this version was created from (null for the 2026.1 baseline). */
  createdFrom: string | null;
  /** Authenticated admin id, or NULL (honest no-auth). Never fabricated. */
  createdBy: string | null;
  /** ISO timestamp the snapshot file was written. */
  createdAt: string;
  /** Required reason for the version (>= 10 chars). */
  reason: string;
  /** FNV-1a 64-bit hex checksum of the canonicalized item array. */
  contentChecksum: string;
  contentProvenance: AhspVersionContentProvenance;
  /** Item count (must equal items.length). */
  itemCount: number;
  /** Human-readable source description (which catalog / pipeline run produced this). */
  sourceDescription: string;
}

/** The versioned snapshot JSON format: metadata header + full item content. */
export interface AhspVersionSnapshot {
  schemaVersion: typeof AHSP_VERSION_SNAPSHOT_SCHEMA_VERSION;
  meta: AhspVersionSnapshotMeta;
  items: NationalAHSPItem[];
}

// ---------------------------------------------------------------------------
// Canonicalization + content checksum (deterministic, shared by the
// extractor script and the test suite — single source of truth)
// ---------------------------------------------------------------------------

/** Deep-sort object keys (arrays keep order — component order is meaningful). */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Canonical form of an item array: items sorted by stable id, every
 * object deep-key-sorted. The checksum is computed over this form, so
 * item order and key order in the source file cannot change it.
 */
export function canonicalizeAhspItems(items: readonly NationalAHSPItem[]): unknown {
  const sorted = [...items].sort((a, b) => {
    const ka = itemIdentityKey(a);
    const kb = itemIdentityKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
  return sorted.map((item) => sortKeysDeep(item));
}

/**
 * Stable item identity for sorting/matching: the item id when present,
 * else a composite of code+name+unit (all runtime items carry ids; the
 * fallback only guards malformed input).
 */
export function itemIdentityKey(item: NationalAHSPItem): string {
  if (typeof item.id === 'string' && item.id !== '') return item.id;
  return `code:${item.code ?? ''}|name:${item.name ?? ''}|unit:${item.unit ?? ''}`;
}

/** FNV-1a 64-bit hex — same deterministic-hash primitive as §4.4 (see ahspVersionHistory.ts). */
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

/** Content checksum of an item array (canonical form → FNV-1a 64 hex). */
export function computeAhspContentChecksum(items: readonly NationalAHSPItem[]): string {
  return fnv1aHex(JSON.stringify(canonicalizeAhspItems(items)));
}

/** Deep-clone via JSON (plain data only — same clone strategy as estimateVersioning). */
export function cloneAhspItems<T>(items: readonly T[]): T[] {
  return JSON.parse(JSON.stringify(items)) as T[];
}

// ---------------------------------------------------------------------------
// Snapshot validation
// ---------------------------------------------------------------------------

function isFiniteNonNegativeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Structural validation of snapshot content. This is SHAPE + IDENTITY
 * validation, not content purity: empty names/codes are source defects
 * flagged elsewhere (the canonical catalog contains them), so they are
 * allowed here. What is rejected: missing/duplicate ids, wrong-domain
 * items, non-array component lists, non-finite coefficients, and
 * negative or non-finite baked prices (the baseline contains none —
 * verified by probe 2026-11-16: 0 negative unitPrice in any module).
 */
export function validateSnapshotContent(
  family: AhspFamily,
  items: readonly NationalAHSPItem[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(items)) {
    return { valid: false, errors: ['items must be an array'] };
  }
  if (items.length === 0) {
    errors.push(`family ${family}: a version must contain at least one item`);
  }
  const expectedDomain = AHSP_FAMILY_DOMAINS[family];
  const seenIds = new Set<string>();
  items.forEach((item, i) => {
    const where = `item[${i}]`;
    if (item === null || typeof item !== 'object') {
      errors.push(`${where}: not an object`);
      return;
    }
    if (typeof item.id !== 'string' || item.id === '') {
      errors.push(`${where}: missing id`);
    } else if (seenIds.has(item.id)) {
      errors.push(`${where}: duplicate id ${item.id}`);
    } else {
      seenIds.add(item.id);
    }
    if (item.domain !== expectedDomain) {
      errors.push(`${where} ${item.id ?? ''}: domain ${String(item.domain)} does not match family ${family}`);
    }
    for (const field of ['code', 'name', 'unit'] as const) {
      if (typeof item[field] !== 'string') {
        errors.push(`${where} ${item.id ?? ''}: ${field} must be a string`);
      }
    }
    if (item.unitPrice !== null && !isFiniteNonNegativeNumber(item.unitPrice)) {
      errors.push(`${where} ${item.id ?? ''}: unitPrice must be null or a finite number >= 0`);
    }
    for (const arr of ['laborComponents', 'materialComponents', 'equipmentComponents'] as const) {
      const comps = (item as unknown as Record<string, unknown>)[arr];
      if (!Array.isArray(comps)) {
        errors.push(`${where} ${item.id ?? ''}: ${arr} must be an array`);
        continue;
      }
      comps.forEach((c, j) => {
        const cwhere = `${where} ${item.id ?? ''} ${arr}[${j}]`;
        if (c === null || typeof c !== 'object') {
          errors.push(`${cwhere}: not an object`);
          return;
        }
        const comp = c as Record<string, unknown>;
        for (const field of ['code', 'name', 'unit'] as const) {
          if (typeof comp[field] !== 'string') {
            errors.push(`${cwhere}: ${field} must be a string`);
          }
        }
        if (comp.coefficient !== null && !(typeof comp.coefficient === 'number' && Number.isFinite(comp.coefficient))) {
          errors.push(`${cwhere}: coefficient must be null or a finite number`);
        }
        if (comp.unitPrice !== null && !isFiniteNonNegativeNumber(comp.unitPrice)) {
          errors.push(`${cwhere}: unitPrice must be null or a finite number >= 0`);
        }
        for (const totalField of ['total', 'amount'] as const) {
          const v = comp[totalField];
          if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isFinite(v))) {
            errors.push(`${cwhere}: ${totalField} must be null or a finite number`);
          }
        }
      });
    }
  });
  return { valid: errors.length === 0, errors };
}

/**
 * Provenance validation (encodes R-2): BM/SMKK can never claim
 * PIPELINE_REGENERATED (no generator exists); CK/SDA can never claim
 * OVERLAY (their edits go through the canonical pipeline).
 */
export function validateContentProvenance(
  family: AhspFamily,
  provenance: AhspVersionContentProvenance,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const frozen = (FROZEN_REGENERATION_FAMILIES as readonly string[]).includes(family);
  if (frozen && provenance === 'PIPELINE_REGENERATED') {
    errors.push(
      `family ${family}: contentProvenance PIPELINE_REGENERATED is impossible — ` +
        `no generator exists for this family (audit R-2); use OVERLAY`,
    );
  }
  if (!frozen && provenance === 'OVERLAY') {
    errors.push(
      `family ${family}: contentProvenance OVERLAY is not the edit path for this family — ` +
        `CK/SDA edits go through the canonical pipeline (PIPELINE_REGENERATED)`,
    );
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Build a frozen version snapshot from items + metadata. Validates the
 * content and the provenance, deep-clones the items (the caller's array
 * is never frozen — the runtime catalog must stay mutable), computes
 * the content checksum, and freezes the result.
 */
export function buildVersionSnapshot(input: {
  family: AhspFamily;
  versionId: string;
  createdFrom: string | null;
  createdBy?: string | null;
  createdAt: string;
  reason: string;
  contentProvenance: AhspVersionContentProvenance;
  sourceDescription: string;
  items: readonly NationalAHSPItem[];
}): AhspVersionSnapshot {
  const { family } = input;
  if (!isValidVersionId(input.versionId)) {
    throw new Error(`versionId must match YYYY.minor (e.g. 2026.1), got ${JSON.stringify(input.versionId)}`);
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < AHSP_VERSION_REASON_MIN_LENGTH) {
    throw new Error(
      `Version reason is required (at least ${AHSP_VERSION_REASON_MIN_LENGTH} characters)`,
    );
  }
  if (typeof input.createdAt !== 'string' || Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error(`createdAt must be a valid ISO timestamp, got ${JSON.stringify(input.createdAt)}`);
  }
  const content = validateSnapshotContent(family, input.items);
  if (!content.valid) {
    throw new Error(`Invalid snapshot content for ${family} ${input.versionId}: ${content.errors.slice(0, 5).join('; ')}`);
  }
  const prov = validateContentProvenance(family, input.contentProvenance);
  if (!prov.valid) {
    throw new Error(prov.errors.join('; '));
  }
  const cloned = cloneAhspItems(input.items);
  const checksum = computeAhspContentChecksum(cloned);
  const snapshot: AhspVersionSnapshot = {
    schemaVersion: AHSP_VERSION_SNAPSHOT_SCHEMA_VERSION,
    meta: {
      family,
      versionId: input.versionId,
      createdFrom: input.createdFrom,
      createdBy: input.createdBy ?? null,
      createdAt: input.createdAt,
      reason: input.reason,
      contentChecksum: checksum,
      contentProvenance: input.contentProvenance,
      itemCount: cloned.length,
      sourceDescription: input.sourceDescription,
    },
    items: cloned,
  };
  Object.freeze(snapshot.meta);
  Object.freeze(snapshot.items);
  Object.freeze(snapshot);
  return snapshot;
}

// ---------------------------------------------------------------------------
// Real version diff (§8 (b)) — replaces the masterRegistry stub
// ---------------------------------------------------------------------------

const ITEM_SCALAR_FIELDS = [
  'code',
  'codeNormalized',
  'standardCode',
  'name',
  'unit',
  'unitRaw',
  'unitDisplay',
  'category',
  'subCategory',
  'version',
  'year',
  'normativeStatus',
  'method',
  'sourceDocument',
  'status',
  'unitPrice',
  'totalLabor',
  'totalMaterial',
  'totalEquipment',
  'dataQualityScore',
  'division',
  'subdivision',
  'coefficientReadability',
] as const;

const ITEM_JSON_FIELDS = [
  'provenance',
  'validationStatus',
  'validationIssues',
  'validationFlags',
  'notes',
] as const;

const COMPONENT_FIELDS = [
  'code',
  'name',
  'unit',
  'coefficient',
  'unitPrice',
  'total',
  'amount',
  'resourceId',
  'resourceType',
  'coefficientRaw',
  'rawLine',
] as const;

const COMPONENT_ARRAYS = ['laborComponents', 'materialComponents', 'equipmentComponents'] as const;

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined && b === null) return false;
  if (a === null && b === undefined) return false;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  // Canonical (key-sorted) comparison: object key order is NOT content.
  // Snapshot files store canonicalized items (sorted keys); the live
  // catalog carries generator key order — a raw JSON.stringify compare
  // would report every item "revised" with no content change.
  return canonicalJson(a) === canonicalJson(b);
}

/** Canonical JSON string of a value (deep-sorted keys) — the same form the checksum uses. */
function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(sortKeysDeep(value));
}

/** Diff one matched component pair; `pathBase` is e.g. `laborComponents[2]` (source-side index). */
function diffComponentPair(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  pathBase: string,
  changes: AhspItemFieldChange[],
): void {
  for (const field of COMPONENT_FIELDS) {
    const oldValue = source[field];
    const newValue = target[field];
    if (oldValue === undefined && newValue === undefined) continue;
    if (!valuesEqual(oldValue, newValue)) {
      changes.push({
        path: `${pathBase}.${field}`,
        field,
        oldValue: oldValue === undefined ? null : oldValue,
        newValue: newValue === undefined ? null : newValue,
      });
    }
  }
}

function componentSummary(comp: Record<string, unknown>): string {
  const code = typeof comp.code === 'string' && comp.code !== '' ? comp.code : '(no code)';
  const name = typeof comp.name === 'string' ? comp.name : '';
  const unit = typeof comp.unit === 'string' ? comp.unit : '';
  const coeff = typeof comp.coefficient === 'number' ? comp.coefficient : null;
  return `${code} ${name} ${unit} x${coeff}`.replace(/\s+/g, ' ').trim();
}

/**
 * Match components of one array between source and target.
 * Canonical + SMKK components carry stable ids (`<itemId>-L001`);
 * Bina Marga mapped components carry NO id — those match by position
 * within the array. A component that matches by id keeps its id key;
 * the rest pair up in array order. Unmatched remainders are
 * added/removed. Deterministic.
 */
function matchComponents(
  source: readonly Record<string, unknown>[],
  target: readonly Record<string, unknown>[],
): {
  pairs: { sourceIndex: number; targetIndex: number }[];
  removedIndices: number[];
  addedIndices: number[];
} {
  const pairs: { sourceIndex: number; targetIndex: number }[] = [];
  const usedTarget = new Set<number>();
  const usedSource = new Set<number>();
  const targetById = new Map<string, number>();
  target.forEach((c, j) => {
    if (typeof c.id === 'string' && c.id !== '' && !targetById.has(c.id)) {
      targetById.set(c.id, j);
    }
  });
  source.forEach((c, i) => {
    if (typeof c.id === 'string' && c.id !== '') {
      const j = targetById.get(c.id);
      if (j !== undefined && !usedTarget.has(j)) {
        pairs.push({ sourceIndex: i, targetIndex: j });
        usedTarget.add(j);
        usedSource.add(i);
      }
    }
  });
  // Position-based pairing for the rest (id-less components, e.g. BM).
  const freeSource = source.map((_, i) => i).filter((i) => !usedSource.has(i));
  const freeTarget = target.map((_, j) => j).filter((j) => !usedTarget.has(j));
  const paired = Math.min(freeSource.length, freeTarget.length);
  for (let k = 0; k < paired; k++) {
    pairs.push({ sourceIndex: freeSource[k], targetIndex: freeTarget[k] });
  }
  pairs.sort((a, b) => a.sourceIndex - b.sourceIndex);
  const removedIndices = freeSource.slice(paired);
  const addedIndices = freeTarget.slice(paired);
  return { pairs, removedIndices, addedIndices };
}

/** Diff one matched item pair → field changes (empty array when identical). */
function diffItemPair(source: NationalAHSPItem, target: NationalAHSPItem): AhspItemFieldChange[] {
  const changes: AhspItemFieldChange[] = [];
  const s = source as unknown as Record<string, unknown>;
  const t = target as unknown as Record<string, unknown>;
  for (const field of ITEM_SCALAR_FIELDS) {
    const oldValue = s[field];
    const newValue = t[field];
    if (oldValue === undefined && newValue === undefined) continue;
    if (!valuesEqual(oldValue, newValue)) {
      changes.push({
        path: field,
        field,
        oldValue: oldValue === undefined ? null : oldValue,
        newValue: newValue === undefined ? null : newValue,
      });
    }
  }
  for (const field of ITEM_JSON_FIELDS) {
    const oldValue = s[field];
    const newValue = t[field];
    if (oldValue === undefined && newValue === undefined) continue;
    if (canonicalJson(oldValue) !== canonicalJson(newValue)) {
      changes.push({
        path: field,
        field,
        oldValue: oldValue === undefined ? null : oldValue,
        newValue: newValue === undefined ? null : newValue,
      });
    }
  }
  // NOTE: `lastUpdated` is deliberately NOT diffed — it is a generation
  // stamp, not content; a pipeline re-run would otherwise mark every
  // item "revised" with no content change.
  for (const arr of COMPONENT_ARRAYS) {
    const sComps = (Array.isArray(s[arr]) ? (s[arr] as Record<string, unknown>[]) : []) as Record<string, unknown>[];
    const tComps = (Array.isArray(t[arr]) ? (t[arr] as Record<string, unknown>[]) : []) as Record<string, unknown>[];
    const { pairs, removedIndices, addedIndices } = matchComponents(sComps, tComps);
    for (const { sourceIndex, targetIndex } of pairs) {
      diffComponentPair(sComps[sourceIndex], tComps[targetIndex], `${arr}[${sourceIndex}]`, changes);
    }
    for (const i of removedIndices) {
      changes.push({
        path: `${arr}[${i}]`,
        field: 'component',
        oldValue: componentSummary(sComps[i]),
        newValue: null,
      });
    }
    for (const j of addedIndices) {
      changes.push({
        path: `${arr}[${j}]`,
        field: 'component',
        oldValue: null,
        newValue: componentSummary(tComps[j]),
      });
    }
  }
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return changes;
}

function byCodeThenId(a: { code: string; id?: string }, b: { code: string; id?: string }): number {
  if (a.code < b.code) return -1;
  if (a.code > b.code) return 1;
  const ai = a.id ?? '';
  const bi = b.id ?? '';
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}

/**
 * Real diff between two AHSP item sets (the §8 replacement for the
 * masterRegistry stub, which always returned empty removed/revised
 * arrays). Items match by stable id; components match by stable id
 * when present, else by position. Deterministic: identical inputs
 * produce identical output regardless of input order.
 */
export function compareAhspSnapshots(
  source: { versionId: string; items: readonly NationalAHSPItem[] },
  target: { versionId: string; items: readonly NationalAHSPItem[] },
  domain: AHSPDomain,
): AHSPVersionDiff {
  const sourceItems = source.items.filter((i) => i.domain === domain);
  const targetItems = target.items.filter((i) => i.domain === domain);
  const sourceByKey = new Map<string, NationalAHSPItem>();
  for (const item of sourceItems) {
    const key = itemIdentityKey(item);
    if (!sourceByKey.has(key)) sourceByKey.set(key, item);
  }
  const targetByKey = new Map<string, NationalAHSPItem>();
  for (const item of targetItems) {
    const key = itemIdentityKey(item);
    if (!targetByKey.has(key)) targetByKey.set(key, item);
  }

  const addedCodes: NationalAHSPItem[] = [];
  const removedCodes: { code: string; name: string; reason: string }[] = [];
  const revisedCodes: AHSPVersionDiff['revisedCodes'] = [];
  const fieldDiffs: AhspItemFieldDiff[] = [];
  let unchanged = 0;
  let fieldChanges = 0;
  let componentChanges = 0;

  for (const [key, tItem] of [...targetByKey.entries()].sort((a, b) => byCodeThenId(a[1], b[1]))) {
    if (!sourceByKey.has(key)) {
      addedCodes.push(tItem);
    }
  }
  for (const [key, sItem] of [...sourceByKey.entries()].sort((a, b) => byCodeThenId(a[1], b[1]))) {
    if (!targetByKey.has(key)) {
      removedCodes.push({
        code: sItem.code,
        name: sItem.name,
        reason: `Removed in ${target.versionId} (was present in ${source.versionId})`,
      });
    }
  }
  for (const [key, sItem] of [...sourceByKey.entries()].sort((a, b) => byCodeThenId(a[1], b[1]))) {
    const tItem = targetByKey.get(key);
    if (!tItem) continue;
    const changes = diffItemPair(sItem, tItem);
    if (changes.length === 0) {
      unchanged++;
      continue;
    }
    fieldChanges += changes.length;
    componentChanges += changes.filter(
      (c) => c.path.startsWith('laborComponents[') || c.path.startsWith('materialComponents[') || c.path.startsWith('equipmentComponents['),
    ).length;
    fieldDiffs.push({ id: sItem.id, code: sItem.code, name: sItem.name, changes });
    const shown = changes.slice(0, 3).map((c) => c.path).join(', ');
    const more = changes.length > 3 ? ` +${changes.length - 3} more` : '';
    revisedCodes.push({
      code: sItem.code,
      name: sItem.name,
      oldPrice: sItem.unitPrice ?? null,
      newPrice: tItem.unitPrice ?? null,
      diffNote: `${changes.length} field change(s): ${shown}${more}`,
    });
  }

  addedCodes.sort(byCodeThenId);
  removedCodes.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  revisedCodes.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  fieldDiffs.sort((a, b) => byCodeThenId(a, b));

  return {
    sourceVersion: source.versionId,
    targetVersion: target.versionId,
    domain,
    addedCodes,
    removedCodes,
    revisedCodes,
    fieldDiffs,
    summary: {
      added: addedCodes.length,
      removed: removedCodes.length,
      revised: revisedCodes.length,
      unchanged,
      totalSource: sourceByKey.size,
      totalTarget: targetByKey.size,
      fieldChanges,
      componentChanges,
    },
  };
}

// ---------------------------------------------------------------------------
// Registry state + version records (§8 (a) pointer, §8 (f) integrity)
// ---------------------------------------------------------------------------

export type AhspVersionStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';

/** Registry metadata for one version (content lives in its snapshot file). */
export interface AhspVersionRecord {
  family: AhspFamily;
  versionId: string;
  status: AhspVersionStatus;
  createdFrom: string | null;
  createdBy: string | null;
  createdAt: string;
  reason: string;
  contentChecksum: string;
  contentProvenance: AhspVersionContentProvenance;
  snapshotPath: string;
  itemCount: number;
  publishedAt: string | null;
  publishedBy: string | null;
}

/** The whole version registry: records per family + the active pointer per family + history. */
export interface AhspVersionRegistryState {
  versions: Readonly<Record<AhspFamily, Readonly<Record<string, AhspVersionRecord>>>>;
  active: Readonly<Record<AhspFamily, string>>;
  history: readonly AhspVersionHistoryEntry[];
}

function emptyVersionsMap(): Record<AhspFamily, Record<string, AhspVersionRecord>> {
  return {
    CIPTA_KARYA: {},
    BINA_MARGA: {},
    SUMBER_DAYA_AIR: {},
    SMKK: {},
  };
}

function freezeState(state: AhspVersionRegistryState): AhspVersionRegistryState {
  const versions = {} as Record<AhspFamily, Readonly<Record<string, AhspVersionRecord>>>;
  for (const family of AHSP_FAMILIES) {
    const recs = {} as Record<string, AhspVersionRecord>;
    for (const [id, rec] of Object.entries(state.versions[family])) {
      recs[id] = Object.freeze({ ...rec });
    }
    versions[family] = Object.freeze(recs);
  }
  return Object.freeze({
    versions: Object.freeze(versions),
    active: Object.freeze({ ...state.active }),
    history: Object.freeze([...state.history]),
  });
}

/**
 * Build the initial registry state from baseline records (one ACTIVE
 * record per family, as produced by the generated pointer module).
 * Validates: every family has exactly one ACTIVE record; version ids
 * are valid; the active pointer agrees with the ACTIVE record.
 */
export function buildRegistryState(
  records: readonly AhspVersionRecord[],
  history: readonly AhspVersionHistoryEntry[] = [],
): AhspVersionRegistryState {
  const versions = emptyVersionsMap();
  const active = {} as Record<AhspFamily, string>;
  for (const rec of records) {
    if (!AHSP_FAMILIES.includes(rec.family)) {
      throw new Error(`Unknown AHSP family ${JSON.stringify(rec.family)}`);
    }
    if (!isValidVersionId(rec.versionId)) {
      throw new Error(`Invalid versionId ${JSON.stringify(rec.versionId)} for ${rec.family}`);
    }
    if (versions[rec.family][rec.versionId]) {
      throw new Error(`Duplicate version record ${rec.family} ${rec.versionId}`);
    }
    versions[rec.family][rec.versionId] = { ...rec };
  }
  for (const family of AHSP_FAMILIES) {
    const actives = Object.values(versions[family]).filter((r) => r.status === 'ACTIVE');
    if (actives.length !== 1) {
      throw new Error(
        `Family ${family} must have exactly one ACTIVE version, found ${actives.length}`,
      );
    }
    active[family] = actives[0].versionId;
  }
  return freezeState({ versions, active, history: [...history] });
}

/** Read the active version id for a family (the pointer — the ONLY read path; there is no setter). */
export function getActiveVersion(
  state: AhspVersionRegistryState,
  family: AhspFamily,
): string {
  return state.active[family];
}

/** Read one version record (null when absent). */
export function getVersionRecord(
  state: AhspVersionRegistryState,
  family: AhspFamily,
  versionId: string,
): AhspVersionRecord | null {
  return state.versions[family][versionId] ?? null;
}

/** List a family's versions, oldest first (createdAt, then versionId). */
export function listVersions(
  state: AhspVersionRegistryState,
  family: AhspFamily,
): AhspVersionRecord[] {
  return Object.values(state.versions[family]).sort((a, b) => {
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    if (a.versionId < b.versionId) return -1;
    if (a.versionId > b.versionId) return 1;
    return 0;
  });
}

function requireReason(reason: unknown): string {
  if (typeof reason !== 'string' || reason.trim().length < AHSP_VERSION_REASON_MIN_LENGTH) {
    throw new Error(
      `Reason is required (at least ${AHSP_VERSION_REASON_MIN_LENGTH} characters)`,
    );
  }
  return reason;
}

function requireTimestamp(ts: unknown, field: string): string {
  if (typeof ts !== 'string' || Number.isNaN(Date.parse(ts))) {
    throw new Error(`${field} must be a valid ISO timestamp, got ${JSON.stringify(ts)}`);
  }
  return ts;
}

function cloneState(state: AhspVersionRegistryState): {
  versions: Record<AhspFamily, Record<string, AhspVersionRecord>>;
  active: Record<AhspFamily, string>;
  history: AhspVersionHistoryEntry[];
} {
  const versions = emptyVersionsMap();
  for (const family of AHSP_FAMILIES) {
    for (const [id, rec] of Object.entries(state.versions[family])) {
      versions[family][id] = { ...rec };
    }
  }
  return { versions, active: { ...state.active }, history: [...state.history] };
}

export interface VersionTransitionResult {
  state: AhspVersionRegistryState;
  record: AhspVersionRecord;
  historyEntry: AhspVersionHistoryEntry;
}

// ---------------------------------------------------------------------------
// Mode B — clone (§8 (d))
// ---------------------------------------------------------------------------

/**
 * Clone an existing version into a new DRAFT version (Mode B).
 * The clone's content is IDENTICAL to the source (same checksum) — the
 * content file copy is the operator script's job; the record references
 * the new version's snapshot path. The active pointer does NOT move and
 * the source record is untouched. Publish is a separate, explicit step.
 */
export function cloneVersion(
  state: AhspVersionRegistryState,
  input: {
    family: AhspFamily;
    sourceVersionId: string;
    newVersionId: string;
    reason: string;
    actor?: string | null;
    now?: string;
  },
): VersionTransitionResult {
  const reason = requireReason(input.reason);
  const now = requireTimestamp(input.now ?? new Date().toISOString(), 'now');
  if (!isValidVersionId(input.newVersionId)) {
    throw new Error(`newVersionId must match YYYY.minor (e.g. 2026.2), got ${JSON.stringify(input.newVersionId)}`);
  }
  const source = getVersionRecord(state, input.family, input.sourceVersionId);
  if (!source) {
    throw new Error(`Cannot clone: no version ${input.sourceVersionId} for family ${input.family}`);
  }
  if (getVersionRecord(state, input.family, input.newVersionId)) {
    throw new Error(`Cannot clone: version ${input.newVersionId} already exists for family ${input.family}`);
  }
  const record: AhspVersionRecord = {
    family: input.family,
    versionId: input.newVersionId,
    status: 'DRAFT',
    createdFrom: input.sourceVersionId,
    createdBy: input.actor ?? null,
    createdAt: now,
    reason,
    contentChecksum: source.contentChecksum,
    contentProvenance: 'CLONE_AS_IS',
    snapshotPath: snapshotPathFor(input.family, input.newVersionId),
    itemCount: source.itemCount,
    publishedAt: null,
    publishedBy: null,
  };
  const next = cloneState(state);
  next.versions[input.family][input.newVersionId] = { ...record };
  const historyEntry = buildVersionHistoryEntry({
    family: input.family,
    versionId: input.newVersionId,
    operation: 'CLONE',
    previousVersionId: state.active[input.family],
    baseVersionId: input.sourceVersionId,
    contentChecksum: record.contentChecksum,
    previousContentChecksum: getVersionRecord(state, input.family, state.active[input.family])?.contentChecksum ?? null,
    adminIdentity: input.actor ?? null,
    changedAt: now,
    reason,
    impactStatus: null,
    impactNote: null,
    diffSummary: null,
    publicationStatus: 'DRAFT',
  });
  next.history = [...appendVersionHistoryEntry(next.history, historyEntry)];
  return { state: freezeState(next), record: Object.freeze({ ...record }), historyEntry };
}

/**
 * Revise the content of an UNPUBLISHED DRAFT (Mode B independent editing).
 * This is the ONLY content-mutating operation, and it refuses published
 * versions: ACTIVE / SUPERSEDED records are immutable. The new content
 * is validated like any version content (structure + provenance).
 */
export function reviseDraftContent(
  state: AhspVersionRegistryState,
  input: {
    family: AhspFamily;
    versionId: string;
    items: readonly NationalAHSPItem[];
    contentProvenance: AhspVersionContentProvenance;
    reason: string;
    actor?: string | null;
    now?: string;
  },
): VersionTransitionResult {
  const reason = requireReason(input.reason);
  const now = requireTimestamp(input.now ?? new Date().toISOString(), 'now');
  const record = getVersionRecord(state, input.family, input.versionId);
  if (!record) {
    throw new Error(`Cannot revise draft: no version ${input.versionId} for family ${input.family}`);
  }
  if (record.status !== 'DRAFT') {
    throw new Error(
      `Cannot revise ${input.family} ${input.versionId}: only DRAFT versions can be revised ` +
        `(status is ${record.status} — published versions are immutable; create a new version instead)`,
    );
  }
  const content = validateSnapshotContent(input.family, input.items);
  if (!content.valid) {
    throw new Error(`Invalid draft content for ${input.family} ${input.versionId}: ${content.errors.slice(0, 5).join('; ')}`);
  }
  const prov = validateContentProvenance(input.family, input.contentProvenance);
  if (!prov.valid) {
    throw new Error(prov.errors.join('; '));
  }
  const checksum = computeAhspContentChecksum(input.items);
  const next = cloneState(state);
  const updated: AhspVersionRecord = {
    ...record,
    contentChecksum: checksum,
    contentProvenance: input.contentProvenance,
    itemCount: input.items.length,
  };
  next.versions[input.family][input.versionId] = updated;
  const historyEntry = buildVersionHistoryEntry({
    family: input.family,
    versionId: input.versionId,
    operation: 'DRAFT_UPDATE',
    previousVersionId: state.active[input.family],
    baseVersionId: record.createdFrom,
    contentChecksum: checksum,
    previousContentChecksum: record.contentChecksum,
    adminIdentity: input.actor ?? null,
    changedAt: now,
    reason,
    impactStatus: null,
    impactNote: null,
    diffSummary: null,
    publicationStatus: 'DRAFT',
  });
  next.history = [...appendVersionHistoryEntry(next.history, historyEntry)];
  return { state: freezeState(next), record: Object.freeze({ ...updated }), historyEntry };
}

// ---------------------------------------------------------------------------
// Publication (§8.4) — the ONLY way the active pointer moves (besides Mode A apply)
// ---------------------------------------------------------------------------

export interface PublishResult {
  state: AhspVersionRegistryState;
  record: AhspVersionRecord;
  /** Null when the version was already ACTIVE (idempotent no-op — no duplicate history). */
  historyEntry: AhspVersionHistoryEntry | null;
  /** False when the version was already ACTIVE (no state change). */
  published: boolean;
}

/**
 * Publish a DRAFT version: it becomes ACTIVE, the previous ACTIVE version
 * becomes SUPERSEDED, and the active pointer moves. Explicit only — no
 * automatic switching. Re-publishing the already-ACTIVE version is an
 * idempotent no-op (state unchanged, no duplicate history entry).
 */
export function publishVersion(
  state: AhspVersionRegistryState,
  input: {
    family: AhspFamily;
    versionId: string;
    reason: string;
    actor?: string | null;
    now?: string;
  },
): PublishResult {
  const reason = requireReason(input.reason);
  const now = requireTimestamp(input.now ?? new Date().toISOString(), 'now');
  const record = getVersionRecord(state, input.family, input.versionId);
  if (!record) {
    throw new Error(`Cannot publish: no version ${input.versionId} for family ${input.family}`);
  }
  if (record.status === 'ACTIVE') {
    return { state, record, historyEntry: null, published: false };
  }
  if (record.status !== 'DRAFT') {
    throw new Error(
      `Cannot publish ${input.family} ${input.versionId}: only DRAFT versions can be published ` +
        `(status is ${record.status} — a SUPERSEDED version is never re-activated; roll back via a NEW version)`,
    );
  }
  const previousId = state.active[input.family];
  const previous = getVersionRecord(state, input.family, previousId);
  const next = cloneState(state);
  if (previous) {
    next.versions[input.family][previousId] = { ...previous, status: 'SUPERSEDED' };
  }
  const published: AhspVersionRecord = {
    ...record,
    status: 'ACTIVE',
    publishedAt: now,
    publishedBy: input.actor ?? null,
  };
  next.versions[input.family][input.versionId] = published;
  next.active[input.family] = input.versionId;
  const historyEntry = buildVersionHistoryEntry({
    family: input.family,
    versionId: input.versionId,
    operation: 'PUBLISH',
    previousVersionId: previousId,
    baseVersionId: record.createdFrom,
    contentChecksum: record.contentChecksum,
    previousContentChecksum: previous?.contentChecksum ?? null,
    adminIdentity: input.actor ?? null,
    changedAt: now,
    reason,
    impactStatus: null,
    impactNote: null,
    diffSummary: null,
    publicationStatus: 'PUBLISHED',
  });
  next.history = [...appendVersionHistoryEntry(next.history, historyEntry)];
  return { state: freezeState(next), record: Object.freeze({ ...published }), historyEntry, published: true };
}

// ---------------------------------------------------------------------------
// Mode A — direct edit (§8 (c)): checkpoint → impact → confirm → apply
// ---------------------------------------------------------------------------

/** An immutable checkpoint of the active version before a direct edit. */
export interface AhspVersionCheckpoint {
  family: AhspFamily;
  /** Active version id at checkpoint time. */
  versionId: string;
  /** Content checksum at checkpoint time (the file IS the checkpoint — versions are immutable). */
  contentChecksum: string;
  snapshotPath: string;
  createdAt: string;
  reason: string;
  actor: string | null;
}

/** Create a checkpoint of the currently ACTIVE version (Mode A step 1). */
export function createCheckpoint(
  state: AhspVersionRegistryState,
  input: {
    family: AhspFamily;
    reason: string;
    actor?: string | null;
    now?: string;
  },
): AhspVersionCheckpoint {
  const reason = requireReason(input.reason);
  const now = requireTimestamp(input.now ?? new Date().toISOString(), 'now');
  const activeId = state.active[input.family];
  const active = getVersionRecord(state, input.family, activeId);
  if (!active) {
    throw new Error(`Cannot checkpoint: no active version for family ${input.family}`);
  }
  return Object.freeze({
    family: input.family,
    versionId: active.versionId,
    contentChecksum: active.contentChecksum,
    snapshotPath: active.snapshotPath,
    createdAt: now,
    reason,
    actor: input.actor ?? null,
  });
}

// --- Impact seam (§9) ---

/**
 * Impact assessment status. NOT_COMPUTED = unknown (never a claim of
 * zero impact). COMPUTED = the §9 calculator produced real numbers.
 * STALE = the preview WAS computed, but the state moved afterwards —
 * a STALE impact is refused by `confirmDirectEdit`, never used.
 */
export type AhspVersionImpactStatus = 'NOT_COMPUTED' | 'COMPUTED' | 'STALE';

/** Impact assessment for a proposed version change (§8.2 steps 2–8, §9). */
export interface AhspVersionImpact {
  status: AhspVersionImpactStatus;
  /** Populated only when status is COMPUTED (§9 fills these from real relationships). */
  affectedAhspCodes?: string[];
  affectedComponentReferences?: number;
  affectedLiveProjects?: string[];
  lockedSnapshotsUnchanged?: number;
  computedAt?: string;
  /** Human-readable note — always present, even for NOT_COMPUTED. */
  note: string;
  /** Freshness fingerprint (§9 (d)) — present on §9-computed impacts; `confirmDirectEdit` validates it. */
  fingerprint?: ImpactPreviewFingerprint;
  /** The full §9 preview (complete auditable numbers) — present on §9-computed impacts. */
  preview?: MasterPriceImpactPreview;
}

/**
 * What the impact calculator needs to assess a proposed change.
 *
 * The four base fields (family + versions + diff counts) are the §8
 * minimal description — enough to NAME a change, not enough to compute
 * its impact. The §9 rich fields below are what the real provider
 * needs; when any of them is absent, `masterPriceImpactProvider`
 * returns NOT_COMPUTED (an honest "unknown", never a number computed
 * from counts alone). `assessDirectEditImpact` /
 * `assessRollbackImpact` fill all of them from the registry state +
 * the supplied content + the collected workspace projects.
 */
export interface AhspVersionChangeDescription {
  family: AhspFamily;
  sourceVersionId: string;
  targetVersionId: string;
  diffSummary: {
    added: number;
    removed: number;
    revised: number;
    unchanged: number;
  };
  /** §9 rich inputs (all optional in the type, all required for a COMPUTED impact). */
  kind?: 'AHSP_VERSION_CHANGE' | 'ROLLBACK';
  sourceItems?: readonly NationalAHSPItem[];
  targetItems?: readonly NationalAHSPItem[];
  diff?: AHSPVersionDiff;
  sourceContentChecksum?: string;
  targetContentChecksum?: string;
  /** Active pointer value at compute time (for staleness detection). */
  activeVersionIdAtCompute?: string | null;
  masterPriceVersion?: string;
  /** Collected workspace projects (possibly empty — absent means unknown, not zero). */
  projects?: readonly ProjectImpactInput[];
  /** Timestamp the preview is computed at (defaults to now; injectable for determinism in tests). */
  computedAt?: string;
}

/**
 * The §9 seam: an impact provider computes the real impact of a proposed
 * change. §8 defines the interface and ships ONE honest implementation
 * (below) that reports NOT_COMPUTED. No implementation may fabricate
 * numbers — a provider that cannot compute MUST return NOT_COMPUTED.
 */
export interface ImpactProvider {
  computeImpact(change: AhspVersionChangeDescription): AhspVersionImpact;
}

export const NOT_COMPUTED_IMPACT_NOTE =
  'Impact not computed: the §9 impact calculator does not exist yet. ' +
  'This is NOT a claim of zero impact — affected AHSP codes, component ' +
  'references, live projects, and locked snapshots are all unknown. ' +
  'Proceed only with explicit owner acknowledgement.';

export const NOT_COMPUTED_IMPACT: AhspVersionImpact = Object.freeze({
  status: 'NOT_COMPUTED' as const,
  note: NOT_COMPUTED_IMPACT_NOTE,
});

/** The honest default provider: impact is unknown until §9 computes it. */
export const notComputedImpactProvider: ImpactProvider = {
  computeImpact: () => NOT_COMPUTED_IMPACT,
};

/**
 * The REAL provider (§9): the default for the Mode A flow. It computes
 * the actual impact from the rich change description (family + base
 * version + new content + §8 diff + workspace projects) and returns
 * COMPUTED with a freshness fingerprint — or NOT_COMPUTED when the
 * description lacks the rich inputs. `notComputedImpactProvider`
 * remains the explicit "do not compute" choice.
 */
export const defaultImpactProvider: ImpactProvider = masterPriceImpactProvider;

// --- Assess helpers (§9 wiring): build the rich description and delegate ---

function assessVersionChangeImpact(
  state: AhspVersionRegistryState,
  input: {
    kind: 'AHSP_VERSION_CHANGE' | 'ROLLBACK';
    family: AhspFamily;
    sourceVersionId: string;
    sourceItems: readonly NationalAHSPItem[];
    targetVersionId: string;
    newItems: readonly NationalAHSPItem[];
    projects?: readonly ProjectImpactInput[];
    provider?: ImpactProvider;
    now?: string;
  },
): AhspVersionImpact {
  const domain = AHSP_FAMILY_DOMAINS[input.family];
  const diff = compareAhspSnapshots(
    { versionId: input.sourceVersionId, items: input.sourceItems },
    { versionId: input.targetVersionId, items: input.newItems },
    domain,
  );
  const provider = input.provider ?? defaultImpactProvider;
  return provider.computeImpact({
    family: input.family,
    sourceVersionId: input.sourceVersionId,
    targetVersionId: input.targetVersionId,
    diffSummary: {
      added: diff.summary.added,
      removed: diff.summary.removed,
      revised: diff.summary.revised,
      unchanged: diff.summary.unchanged,
    },
    kind: input.kind,
    sourceItems: input.sourceItems,
    targetItems: input.newItems,
    diff,
    sourceContentChecksum: computeAhspContentChecksum(input.sourceItems),
    targetContentChecksum: computeAhspContentChecksum(input.newItems),
    activeVersionIdAtCompute: state.active[input.family],
    masterPriceVersion: MASTER_PRICE_VERSION,
    projects: input.projects,
    computedAt: input.now,
  });
}

/**
 * Assess the impact of a proposed direct edit (Mode A step 2): diff the
 * checkpointed content against the proposed content and compute the
 * real impact with the default (§9) provider — or the injected provider
 * (tests / explicit opt-out). `projects` are the collected workspace
 * projects (see `workspaceProjectCollector`); when omitted the provider
 * honestly returns NOT_COMPUTED for the project dimension (an absent
 * list is unknown, not zero). This function is pure: it reads the
 * state, it never mutates it.
 */
export function assessDirectEditImpact(
  state: AhspVersionRegistryState,
  input: {
    family: AhspFamily;
    sourceVersionId: string;
    sourceItems: readonly NationalAHSPItem[];
    targetVersionId: string;
    newItems: readonly NationalAHSPItem[];
    projects?: readonly ProjectImpactInput[];
    provider?: ImpactProvider;
    now?: string;
  },
): AhspVersionImpact {
  return assessVersionChangeImpact(state, { ...input, kind: 'AHSP_VERSION_CHANGE' });
}

/**
 * Assess the impact of a rollback (publishing an older version's
 * content as a new version): the same computation as a version change,
 * with kind ROLLBACK — the deltas run in the opposite direction of the
 * forward change (see §9 (e)). `sourceItems` is the CURRENT active
 * content, `newItems` is the rollback target's content.
 */
export function assessRollbackImpact(
  state: AhspVersionRegistryState,
  input: {
    family: AhspFamily;
    sourceVersionId: string;
    sourceItems: readonly NationalAHSPItem[];
    targetVersionId: string;
    newItems: readonly NationalAHSPItem[];
    projects?: readonly ProjectImpactInput[];
    provider?: ImpactProvider;
    now?: string;
  },
): AhspVersionImpact {
  return assessVersionChangeImpact(state, { ...input, kind: 'ROLLBACK' });
}

// --- Confirm + apply ---

/** Explicit confirmation of a direct edit (Mode A step 9). */
export interface DirectEditConfirmation {
  family: AhspFamily;
  checkpoint: AhspVersionCheckpoint;
  impact: AhspVersionImpact;
  reason: string;
  confirmedAt: string;
  confirmedBy: string | null;
}

function assertCheckpointFresh(state: AhspVersionRegistryState, checkpoint: AhspVersionCheckpoint): void {
  const activeId = state.active[checkpoint.family];
  if (activeId !== checkpoint.versionId) {
    throw new Error(
      `Stale checkpoint: family ${checkpoint.family} active version moved ` +
        `from ${checkpoint.versionId} to ${activeId} since the checkpoint was taken — ` +
        `take a fresh checkpoint and re-confirm`,
    );
  }
  const active = getVersionRecord(state, checkpoint.family, activeId);
  if (!active || active.contentChecksum !== checkpoint.contentChecksum) {
    throw new Error(
      `Stale checkpoint: family ${checkpoint.family} active version ${activeId} content changed ` +
        `since the checkpoint was taken — take a fresh checkpoint and re-confirm`,
    );
  }
}

/**
 * §9 (d): when the impact carries a fingerprint, it must describe THIS
 * checkpoint (same family, same base version + checksum) against the
 * CURRENT state (pointer unmoved since compute, master price version
 * unchanged). A NOT_COMPUTED impact carries no fingerprint and is
 * accepted as before (§8 contract — unknown impact, explicit owner
 * acknowledgement). A COMPUTED impact without a fingerprint is accepted
 * on the provider's word (it cannot be proven stale); the §9 provider
 * always attaches one.
 */
function assertImpactFingerprintFresh(
  state: AhspVersionRegistryState,
  checkpoint: AhspVersionCheckpoint,
  impact: AhspVersionImpact,
): void {
  const fp = impact.fingerprint;
  if (!fp) return;
  const stale = (detail: string): Error =>
    new Error(`Stale impact preview — ${detail}; recompute a fresh preview before confirming`);
  if (fp.kind !== 'AHSP_VERSION_CHANGE' && fp.kind !== 'ROLLBACK') {
    throw stale(`the preview is for a ${fp.kind} change, not an AHSP version change`);
  }
  if (fp.family !== null && fp.family !== checkpoint.family) {
    throw stale(`the preview is for family ${fp.family}, not ${checkpoint.family}`);
  }
  if (fp.sourceVersionId !== null && fp.sourceVersionId !== checkpoint.versionId) {
    throw stale(
      `the preview was computed against base version ${fp.sourceVersionId}, not the checkpointed ${checkpoint.versionId}`,
    );
  }
  if (fp.baseContentChecksum !== null && fp.baseContentChecksum !== checkpoint.contentChecksum) {
    throw stale('the preview base content differs from the checkpointed content');
  }
  if (fp.activeVersionIdAtCompute !== null && state.active[checkpoint.family] !== fp.activeVersionIdAtCompute) {
    throw stale(
      `the active ${checkpoint.family} version moved ${fp.activeVersionIdAtCompute} → ${state.active[checkpoint.family]} since the preview was computed (a publish happened)`,
    );
  }
  if (fp.masterPriceVersion !== MASTER_PRICE_VERSION) {
    throw stale(
      `the master price version moved ${fp.masterPriceVersion} → ${MASTER_PRICE_VERSION} since the preview was computed`,
    );
  }
}

/**
 * Confirm a direct edit (Mode A step 9): requires a FRESH checkpoint
 * (the pointer must not have moved since), an impact assessment (which
 * may honestly be NOT_COMPUTED), and a reason (>= 10 chars). A STALE
 * impact is REFUSED (§9 (d)) — the owner must recompute a fresh
 * preview; a fingerprinted impact must match this checkpoint and the
 * current state.
 */
export function confirmDirectEdit(
  state: AhspVersionRegistryState,
  input: {
    checkpoint: AhspVersionCheckpoint;
    impact: AhspVersionImpact;
    reason: string;
    actor?: string | null;
    now?: string;
  },
): DirectEditConfirmation {
  const reason = requireReason(input.reason);
  const now = requireTimestamp(input.now ?? new Date().toISOString(), 'now');
  if (!input.impact || typeof input.impact !== 'object' || typeof input.impact.note !== 'string') {
    throw new Error('An impact assessment is required to confirm a direct edit (NOT_COMPUTED is acceptable — a missing assessment is not)');
  }
  if (input.impact.status === 'STALE') {
    throw new Error(
      'Cannot confirm a direct edit on a STALE impact preview — the state moved since the preview was computed; recompute a fresh preview first',
    );
  }
  assertImpactFingerprintFresh(state, input.checkpoint, input.impact);
  assertCheckpointFresh(state, input.checkpoint);
  return Object.freeze({
    family: input.checkpoint.family,
    checkpoint: input.checkpoint,
    impact: Object.freeze({ ...input.impact }),
    reason,
    confirmedAt: now,
    confirmedBy: input.actor ?? null,
  });
}

/**
 * Apply a confirmed direct edit (Mode A steps 10–12): validate the
 * regenerated content, create the NEW ACTIVE version record, supersede
 * the previous active version, and move the pointer. The checkpoint is
 * re-validated (a concurrent publish between confirm and apply fails
 * the apply — no silent apply against changed state). On ANY failure
 * the input state is returned untouched: the pointer never moves on a
 * failed edit.
 *
 * The `newItems` are the REGENERATED content (CK/SDA: edited validated
 * JSON + ahsp:pipeline + re-extract; BM/SMKK: overlay-produced content
 * with provenance OVERLAY). This engine validates and records the
 * content; running the pipeline is the operator script's job.
 */
export function applyDirectEdit(
  state: AhspVersionRegistryState,
  input: {
    confirmation: DirectEditConfirmation;
    newVersionId: string;
    newItems: readonly NationalAHSPItem[];
    contentProvenance: AhspVersionContentProvenance;
    /** Diff summary vs the checkpointed version, for the history entry (null when not computed). */
    diffSummary?: { added: number; removed: number; revised: number; unchanged: number } | null;
    now?: string;
  },
): VersionTransitionResult {
  const { confirmation } = input;
  const family = confirmation.family;
  const now = requireTimestamp(input.now ?? new Date().toISOString(), 'now');
  // 1. Checkpoint must still be fresh (no concurrent publish).
  assertCheckpointFresh(state, confirmation.checkpoint);
  // 1a. §9 (d) gate fix 2026-11-16: a STALE impact preview can never be
  // applied — confirmDirectEdit rejects stale previews, so reaching here
  // with one is a flow violation. Fail closed (this also narrows the
  // impact status to NOT_COMPUTED | COMPUTED for the history entry below).
  if (confirmation.impact.status === 'STALE') {
    throw new Error('Cannot apply a direct edit with a STALE impact preview — recompute the impact first.');
  }
  // 1b. §9 (d): when the confirmation's impact carries a new-content
  // checksum, the content being applied must be EXACTLY the content
  // the preview was computed for — a regeneration after the preview
  // invalidates the numbers the owner confirmed.
  const previewChecksum = confirmation.impact.fingerprint?.newContentChecksum ?? null;
  if (previewChecksum !== null) {
    const applyingChecksum = computeAhspContentChecksum(input.newItems);
    if (applyingChecksum !== previewChecksum) {
      throw new Error(
        `Stale impact preview: the content to apply (checksum ${applyingChecksum}) differs from the content the preview was computed for (${previewChecksum}) — recompute the preview against the current content before applying`,
      );
    }
  }
  // 2. New version id must be fresh + well-formed.
  if (!isValidVersionId(input.newVersionId)) {
    throw new Error(`newVersionId must match YYYY.minor (e.g. 2026.2), got ${JSON.stringify(input.newVersionId)}`);
  }
  if (getVersionRecord(state, family, input.newVersionId)) {
    throw new Error(`Cannot apply direct edit: version ${input.newVersionId} already exists for family ${family}`);
  }
  // 3. Content must validate (structure + provenance incl. the R-2 frozen-family rule).
  const content = validateSnapshotContent(family, input.newItems);
  if (!content.valid) {
    throw new Error(`Invalid regenerated content for ${family} ${input.newVersionId}: ${content.errors.slice(0, 5).join('; ')}`);
  }
  const prov = validateContentProvenance(family, input.contentProvenance);
  if (!prov.valid) {
    throw new Error(prov.errors.join('; '));
  }
  // 4. All validations passed — commit: new ACTIVE record, previous SUPERSEDED, pointer moves.
  const checksum = computeAhspContentChecksum(input.newItems);
  const previousId = state.active[family];
  const previous = getVersionRecord(state, family, previousId);
  const record: AhspVersionRecord = {
    family,
    versionId: input.newVersionId,
    status: 'ACTIVE',
    createdFrom: previousId,
    createdBy: confirmation.confirmedBy,
    createdAt: now,
    reason: confirmation.reason,
    contentChecksum: checksum,
    contentProvenance: input.contentProvenance,
    snapshotPath: snapshotPathFor(family, input.newVersionId),
    itemCount: input.newItems.length,
    publishedAt: now,
    publishedBy: confirmation.confirmedBy,
  };
  const next = cloneState(state);
  if (previous) {
    next.versions[family][previousId] = { ...previous, status: 'SUPERSEDED' };
  }
  next.versions[family][input.newVersionId] = { ...record };
  next.active[family] = input.newVersionId;
  const historyEntry = buildVersionHistoryEntry({
    family,
    versionId: input.newVersionId,
    operation: 'DIRECT_EDIT',
    previousVersionId: previousId,
    baseVersionId: previousId,
    contentChecksum: checksum,
    previousContentChecksum: previous?.contentChecksum ?? null,
    adminIdentity: confirmation.confirmedBy,
    changedAt: now,
    reason: confirmation.reason,
    impactStatus: confirmation.impact.status,
    impactNote: confirmation.impact.note,
    diffSummary: input.diffSummary ?? null,
    publicationStatus: 'PUBLISHED',
  });
  next.history = [...appendVersionHistoryEntry(next.history, historyEntry)];
  return { state: freezeState(next), record: Object.freeze({ ...record }), historyEntry };
}

// ---------------------------------------------------------------------------
// Rollback (§8 (f)) — a NEW version holding old content
// ---------------------------------------------------------------------------

/**
 * Roll back to an older version's content: creates a NEW DRAFT version
 * whose content checksum EQUALS the target's (provenance ROLLBACK_COPY).
 * The draft must be published explicitly to become active. No version
 * is ever resurrected, edited, or deleted — the target stays
 * SUPERSEDED and the new version is a fresh record.
 */
export function rollbackVersion(
  state: AhspVersionRegistryState,
  input: {
    family: AhspFamily;
    targetVersionId: string;
    newVersionId: string;
    reason: string;
    actor?: string | null;
    now?: string;
  },
): VersionTransitionResult {
  const reason = requireReason(input.reason);
  const now = requireTimestamp(input.now ?? new Date().toISOString(), 'now');
  if (!isValidVersionId(input.newVersionId)) {
    throw new Error(`newVersionId must match YYYY.minor (e.g. 2026.2), got ${JSON.stringify(input.newVersionId)}`);
  }
  const target = getVersionRecord(state, input.family, input.targetVersionId);
  if (!target) {
    throw new Error(`Cannot roll back: no version ${input.targetVersionId} for family ${input.family}`);
  }
  if (getVersionRecord(state, input.family, input.newVersionId)) {
    throw new Error(`Cannot roll back: version ${input.newVersionId} already exists for family ${input.family}`);
  }
  const record: AhspVersionRecord = {
    family: input.family,
    versionId: input.newVersionId,
    status: 'DRAFT',
    createdFrom: input.targetVersionId,
    createdBy: input.actor ?? null,
    createdAt: now,
    reason,
    contentChecksum: target.contentChecksum,
    contentProvenance: 'ROLLBACK_COPY',
    snapshotPath: snapshotPathFor(input.family, input.newVersionId),
    itemCount: target.itemCount,
    publishedAt: null,
    publishedBy: null,
  };
  const next = cloneState(state);
  next.versions[input.family][input.newVersionId] = { ...record };
  const historyEntry = buildVersionHistoryEntry({
    family: input.family,
    versionId: input.newVersionId,
    operation: 'ROLLBACK',
    previousVersionId: state.active[input.family],
    baseVersionId: input.targetVersionId,
    contentChecksum: target.contentChecksum,
    previousContentChecksum: getVersionRecord(state, input.family, state.active[input.family])?.contentChecksum ?? null,
    adminIdentity: input.actor ?? null,
    changedAt: now,
    reason,
    impactStatus: null,
    impactNote: null,
    diffSummary: null,
    publicationStatus: 'DRAFT',
  });
  next.history = [...appendVersionHistoryEntry(next.history, historyEntry)];
  return { state: freezeState(next), record: Object.freeze({ ...record }), historyEntry };
}

// ---------------------------------------------------------------------------
// Project version pin (§8 (e)) — read-only; no pricing behaviour changes
// ---------------------------------------------------------------------------

/**
 * Which AHSP version does a project use for one family?
 *
 * - LIVE_MASTER_PRICE → the active pointer (the project follows new publications).
 * - SNAPSHOT_PRICE / PROJECT_OVERRIDE → the version pinned on the
 *   project's snapshot. A snapshot WITHOUT a pin (written before §3)
 *   reads as the pre-§3 baseline `2026.1` (Decision D — historical
 *   projects are never silently re-pointed).
 * - No pricing mode recorded (legacy project) → SNAPSHOT semantics
 *   (Decision D: existing projects default to snapshot, never live).
 *
 * An explicitly invalid mode string throws (fail-closed).
 */
export function resolveProjectAhspVersion(input: {
  pricingMode?: ProjectPricingMode | null;
  pinnedAhspDatabaseVersion?: string | null;
  family: AhspFamily;
  activeVersions: Readonly<Record<AhspFamily, string>>;
}): string {
  const mode = input.pricingMode ?? null;
  if (mode === null) {
    return input.pinnedAhspDatabaseVersion ?? AHSP_DATABASE_VERSION;
  }
  if (mode === 'LIVE_MASTER_PRICE') {
    return input.activeVersions[input.family];
  }
  if (mode === 'SNAPSHOT_PRICE' || mode === 'PROJECT_OVERRIDE') {
    return input.pinnedAhspDatabaseVersion ?? AHSP_DATABASE_VERSION;
  }
  throw new Error(`Unknown project pricing mode ${JSON.stringify(mode)} — refusing to guess a version`);
}

/**
 * The AHSP database version a project snapshot was frozen against.
 * Legacy snapshots without the field read as the pre-§3 baseline
 * `2026.1` (§3 I-11).
 */
export function getSnapshotAhspVersion(snapshot: {
  ahspDatabaseVersion?: string | null;
}): string {
  return snapshot.ahspDatabaseVersion ?? AHSP_DATABASE_VERSION;
}

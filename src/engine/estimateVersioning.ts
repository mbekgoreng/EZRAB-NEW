/**
 * D-43 (Batch A, 2026-11-14) — Estimate versioning engine (PURE, no React,
 * no localStorage). Single source of truth for revision identity.
 *
 * ROOT CAUSE (audit D-43): the baseline was virtual (never persisted) and
 * revision numbers came from the stored-list LENGTH, so the first real
 * revision became v1.0 and destroyed the baseline record (description,
 * timestamp, and the fact that a baseline ever existed).
 *
 * INVARIANTS this engine enforces:
 * 1. The baseline is a REAL, persisted version (v1.0, isBaseline: true).
 *    It is materialised the first time a revision is created for a project
 *    with no stored versions — never a mutable label on one record.
 * 2. Revision numbers come from the MAXIMUM existing version number, never
 *    from list length. A revision is never numbered v1.0 and never flagged
 *    isBaseline.
 * 3. Versions are IMMUTABLE once created: this engine never mutates an
 *    existing version object or the input arrays (it always returns new
 *    arrays with deep-copied snapshots). Editing revision *notes* remains a
 *    separate, deliberate annotation path in ProjectContext.
 * 4. Activation (restore) is ATOMIC + IDEMPOTENT: it validates everything
 *    before changing anything, returns the input state untouched on
 *    failure, creates a backup snapshot of the pre-restore state on
 *    success, and re-activating the already-active version is a no-op
 *    success (no duplicate backup, no state change).
 * 5. STALE activation is rejected: a caller may pass the active version id
 *    it last observed; if the active pointer moved since, activation fails
 *    instead of silently applying against a changed state.
 *
 * ProjectContext wraps these pure functions with React state + persistence;
 * all behaviour is testable here without rendering (see
 * src/test/d43EstimateVersioning.test.ts).
 */
import type { EstimateVersion, RabItem } from '../types';

/** Canonical baseline identity — the same text the old virtual baseline showed. */
export const BASELINE_VERSION_NUMBER = 'v1.0';
export const BASELINE_DESCRIPTION = 'Baseline Master Anggaran Proyek Hasil QTO & AHSP Standar';
// D-41 (Batch F, sisa): baseline adalah artefak OTOMATIS — penulisnya
// sistem, bukan manusia, dan tidak ada verifikasi manual yang terjadi.
// Label lama (penulis manusia fiktif + klaim "terverifikasi") menyajikan
// baseline sintetis sebagai artefak manusia terverifikasi.
// Konstanta penulis yang sama juga dipakai sebagai default revisi
// (tidak ada pemanggil yang meneruskan identitas manusia), jadi nilai
// jujur ini berlaku untuk keduanya.
export const BASELINE_REVISION_NOTES =
  'Baseline otomatis dari item RAB saat ini.';
export const BASELINE_AUTHOR = 'EZRAB (otomatis)';

export const RESTORE_BACKUP_LABEL = 'Backup Otomatis Sebelum Restore';
export const RESTORE_BACKUP_NOTES = 'Dibuat otomatis oleh EZRAB Safety Recovery Engine.';

/** Deterministic baseline id — identical to the old virtual baseline id, so the
 *  transition from "virtual" to "persisted" baseline keeps React keys and any
 *  id-based lookup stable. */
export function baselineVersionId(projectId: string): string {
  return `ver-${projectId}-baseline`;
}

/** Parse "v2.0" / "v2" / "V10.3" → major number (2 / 2 / 10). Null when unparseable. */
export function parseVersionNumber(versionNumber: string | null | undefined): number | null {
  if (!versionNumber) return null;
  const m = /^v(\d+)(?:\.\d+)?$/i.exec(versionNumber.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Next version number from the MAXIMUM existing number — never list length. */
export function nextVersionNumber(versions: readonly EstimateVersion[]): string {
  let max = 0;
  for (const v of versions) {
    const n = parseVersionNumber(v.versionNumber);
    if (n !== null && n > max) max = n;
  }
  return `v${max + 1}.0`;
}

/** Direct-cost total of a snapshot — same formula ProjectContext has always used. */
export function totalOfItems(items: readonly RabItem[]): number {
  return items.reduce(
    (acc, i) => acc + (i.amount ?? i.totalPrice ?? i.volume * (i.unitPrice ?? 0)),
    0
  );
}

/** Deep copy of a snapshot (plain JSON data — same clone strategy as ProjectContext). */
export function cloneItems<T>(items: readonly T[]): T[] {
  return JSON.parse(JSON.stringify(items)) as T[];
}

export interface VersioningOpts {
  /** ISO timestamp for the created record(s). Default: now. */
  now?: string;
  author?: string;
  /** Id generator (injectable for deterministic tests). */
  idGenerator?: () => string;
}

const defaultId = () => `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

function resolveNow(opts?: VersioningOpts): string {
  return opts?.now ?? new Date().toISOString();
}

function resolveId(opts?: VersioningOpts): string {
  return opts?.idGenerator ? opts.idGenerator() : defaultId();
}

/** Build the immutable baseline record (v1.0) for a project. */
export function buildBaselineVersion(
  projectId: string,
  items: readonly RabItem[],
  opts?: VersioningOpts & { baselineTimestamp?: string }
): EstimateVersion {
  const total = totalOfItems(items);
  return {
    id: baselineVersionId(projectId),
    projectId,
    versionNumber: BASELINE_VERSION_NUMBER,
    label: 'v1.0 - Baseline Awal',
    // D-41: the baseline timestamp is the project's real creation time when
    // known — never the old hardcoded 2026-09-01 stamp.
    timestamp: opts?.baselineTimestamp ?? resolveNow(opts),
    author: opts?.author ?? BASELINE_AUTHOR,
    description: BASELINE_DESCRIPTION,
    revisionNotes: BASELINE_REVISION_NOTES,
    costBefore: total,
    costAfter: total,
    difference: 0,
    percentageDiff: 0,
    rabItemsSnapshot: cloneItems(items),
    itemsCount: items.length,
    isBaseline: true,
  };
}

/**
 * Ensure a real baseline exists in a project's version list. Only acts when
 * the stored list is EMPTY — a project that already has versions keeps its
 * history exactly as it is (legacy lists are never rewritten, even if their
 * first entry is a revision that was mis-flagged as baseline before this fix).
 */
export function ensureBaselineVersion(
  versions: readonly EstimateVersion[],
  projectId: string,
  items: readonly RabItem[],
  opts?: VersioningOpts & { baselineTimestamp?: string }
): { versions: EstimateVersion[]; baseline: EstimateVersion | null } {
  if (versions.length > 0) {
    return { versions: [...versions], baseline: null };
  }
  const baseline = buildBaselineVersion(projectId, items, opts);
  return { versions: [baseline], baseline };
}

export interface CreateRevisionInput {
  label: string;
  description: string;
  revisionNotes?: string;
}

export interface CreateRevisionResult {
  /** Full new project version list: [baseline?, ...previous, created]. */
  versions: EstimateVersion[];
  created: EstimateVersion;
  /** The baseline that was materialised by this call, if the list was empty. */
  baselineCreated: EstimateVersion | null;
}

/**
 * Create a NEW immutable revision. Never overwrites, renumbers, or mutates
 * any existing version. The created revision is always numbered from the
 * maximum existing number and is never the baseline.
 */
export function createRevision(
  versions: readonly EstimateVersion[],
  projectId: string,
  items: readonly RabItem[],
  input: CreateRevisionInput,
  opts?: VersioningOpts & { baselineTimestamp?: string }
): CreateRevisionResult {
  const ensured = ensureBaselineVersion(versions, projectId, items, opts);
  const prev = ensured.versions[ensured.versions.length - 1];
  const currentCost = totalOfItems(items);
  const prevCost = prev ? prev.costAfter : currentCost;
  const diff = currentCost - prevCost;
  const pct = prevCost > 0 ? (diff / prevCost) * 100 : 0;

  const verNum = nextVersionNumber(ensured.versions);
  const assignedMajor = parseVersionNumber(verNum) ?? 0;
  const rawLabel = (input.label || '').trim();
  // The user-typed label is preserved, but it must never masquerade as the
  // version identity: only keep it verbatim when it IS the assigned number.
  // A typed "v5.0" on an assigned v2.0 becomes "v2.0 - v5.0" (input kept,
  // identity honest). Plain labels keep the old "vN.0 - label" shape.
  const parsedLabel = parseVersionNumber(rawLabel);
  const label =
    parsedLabel !== null && parsedLabel === assignedMajor
      ? rawLabel
      : `${verNum} - ${rawLabel}`;

  const created: EstimateVersion = {
    id: resolveId(opts),
    projectId,
    versionNumber: verNum,
    label,
    timestamp: resolveNow(opts),
    author: opts?.author ?? BASELINE_AUTHOR,
    description: input.description || `Revisi Estimasi Anggaran ${verNum}`,
    revisionNotes: input.revisionNotes || '',
    costBefore: prevCost,
    costAfter: currentCost,
    difference: diff,
    percentageDiff: parseFloat(pct.toFixed(2)),
    rabItemsSnapshot: cloneItems(items),
    itemsCount: items.length,
    isBaseline: false,
  };

  return {
    versions: [...ensured.versions, created],
    created,
    baselineCreated: ensured.baseline,
  };
}

/** A snapshot is restorable when it is an array of objects with string ids. */
export function validateVersionSnapshot(version: EstimateVersion): {
  ok: boolean;
  reason?: string;
} {
  const snap = (version as EstimateVersion | null | undefined)?.rabItemsSnapshot;
  if (!Array.isArray(snap)) {
    return { ok: false, reason: `Snapshot versi ${version?.versionNumber ?? '?'} rusak (bukan daftar item).` };
  }
  for (let i = 0; i < snap.length; i++) {
    const item = snap[i] as RabItem | null | undefined;
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id === '') {
      return {
        ok: false,
        reason: `Snapshot versi ${version.versionNumber} rusak (item ke-${i + 1} tanpa id).`,
      };
    }
  }
  return { ok: true };
}

export interface ActivationInput {
  /** The project's full version list (chronological, oldest first). */
  versions: readonly EstimateVersion[];
  /** The project's CURRENT live RAB items (pre-restore state). */
  currentItems: readonly RabItem[];
  /** Effective active version id (see resolveEffectiveActiveVersionId). */
  activeVersionId: string | null;
}

export type ActivationResult =
  | {
      success: true;
      alreadyActive: boolean;
      versions: EstimateVersion[];
      items: RabItem[];
      activeVersionId: string;
      /** Backup snapshot of the pre-restore state (null when already active). */
      backup: EstimateVersion | null;
      message: string;
    }
  | {
      success: false;
      reason: 'NOT_FOUND' | 'STALE' | 'INVALID_SNAPSHOT';
      /** Input state, returned UNCHANGED — a failed activation preserves the previous active version. */
      versions: EstimateVersion[];
      items: RabItem[];
      activeVersionId: string | null;
      message: string;
    };

/**
 * Activate (restore) a version. Atomic: every failure path returns the input
 * state untouched. Idempotent: activating the already-active version succeeds
 * without creating a backup or touching state. On success a backup version
 * snapshots the pre-restore state first, then the live items become a deep
 * copy of the target snapshot and the active pointer moves to the target.
 * History is never destroyed: the backup is appended, nothing is removed.
 */
export function activateVersion(
  input: ActivationInput,
  targetId: string,
  opts?: VersioningOpts & { expectedActiveVersionId?: string }
): ActivationResult {
  const { versions, currentItems, activeVersionId } = input;
  const fail = (
    reason: 'NOT_FOUND' | 'STALE' | 'INVALID_SNAPSHOT',
    message: string
  ): ActivationResult => ({
    success: false,
    reason,
    versions: [...versions],
    items: [...currentItems],
    activeVersionId,
    message,
  });

  const target = versions.find((v) => v.id === targetId);
  if (!target) {
    return fail('NOT_FOUND', 'Versi estimasi tidak ditemukan');
  }

  // Stale / concurrent activation: the caller observed a different active
  // version than the one currently active — refuse rather than apply
  // against a state the caller has not seen.
  if (
    opts?.expectedActiveVersionId !== undefined &&
    opts.expectedActiveVersionId !== activeVersionId
  ) {
    return fail(
      'STALE',
      'Versi aktif berubah sejak dialog dibuka — muat ulang daftar versi dan coba lagi.'
    );
  }

  // Idempotent: re-activating the active version is a no-op success.
  if (targetId === activeVersionId) {
    return {
      success: true,
      alreadyActive: true,
      versions: [...versions],
      items: [...currentItems],
      activeVersionId: targetId,
      backup: null,
      message: `Versi ${target.versionNumber} sudah aktif.`,
    };
  }

  const validation = validateVersionSnapshot(target);
  if (!validation.ok) {
    return fail('INVALID_SNAPSHOT', validation.reason ?? 'Snapshot versi tidak valid.');
  }

  // 1. Backup the pre-restore state as a new immutable version.
  const backupResult = createRevision(
    versions,
    target.projectId,
    currentItems,
    {
      label: RESTORE_BACKUP_LABEL,
      description: `Backup otomatis sebelum pemulihan ke versi ${target.versionNumber} (${target.label})`,
      revisionNotes: RESTORE_BACKUP_NOTES,
    },
    opts
  );

  // 2. Live items become a deep copy of the target snapshot.
  const restoredItems = cloneItems(target.rabItemsSnapshot).map((item) => ({
    ...item,
    projectId: target.projectId,
  }));

  return {
    success: true,
    alreadyActive: false,
    versions: backupResult.versions,
    items: restoredItems,
    activeVersionId: targetId,
    backup: backupResult.created,
    message: `Berhasil memulihkan estimasi ke versi ${target.versionNumber} (${target.label})`,
  };
}

/** Latest version = LAST in chronological order (single "latest = last" rule). */
export function getLatestVersion(
  versions: readonly EstimateVersion[]
): EstimateVersion | null {
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

export function getActiveVersion(
  versions: readonly EstimateVersion[],
  activeVersionId: string | null
): EstimateVersion | null {
  if (!activeVersionId) return null;
  return versions.find((v) => v.id === activeVersionId) ?? null;
}

/**
 * Effective active version id for display + activation guards.
 * - A stored pointer wins when it still names an existing version.
 * - Otherwise (legacy project, never set) the LATEST version is active.
 * - With no stored versions at all, `emptyFallbackId` applies (the virtual
 *   baseline id the UI synthesises for display).
 */
export function resolveEffectiveActiveVersionId(
  versions: readonly EstimateVersion[],
  storedActiveId: string | null | undefined,
  emptyFallbackId?: string | null
): string | null {
  if (storedActiveId && versions.some((v) => v.id === storedActiveId)) {
    return storedActiveId;
  }
  if (versions.length > 0) {
    return versions[versions.length - 1].id;
  }
  return emptyFallbackId ?? null;
}

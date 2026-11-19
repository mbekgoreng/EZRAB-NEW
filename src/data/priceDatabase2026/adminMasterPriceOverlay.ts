/**
 * MASTER PRICING §12/§13 (P10) — ADMIN-APPLIED MASTER PRICE OVERLAY (client-side).
 * =================================================================================
 *
 * WHAT THIS IS: a browser-local layer of admin-applied master prices over the
 * generated master (`priceMaster.generated.ts`). When a global admin applies a
 * price change through `masterPriceApply.ts`, the new price is written HERE
 * (in memory + localStorage) — the generated master is NEVER rewritten — and
 * `priceResolver2026` consults this overlay before the live index, so the
 * applied price becomes the effective LIVE_MASTER_PRICE for its key in this
 * browser. Snapshot / override projects are untouched: the resolver answers
 * those from their stored context BEFORE it ever reaches the overlay, and
 * adoption stays opt-in per project (§10/§12).
 *
 * WHAT THIS IS NOT (honesty scope — read before extending):
 *   - NOT the server master. Server-side enforcement is BLOCKED (§4.1):
 *     there is no auth, no `master_price_history` table, no price endpoint.
 *     An overlay entry lives in ONE browser (localStorage) and is invisible
 *     to every other user, every other device, and the next deploy's fresh
 *     profile. Clearing site data removes it. `scope` is pinned to
 *     'LOCAL_BROWSER' on every entry so no consumer can mistake it for a
 *     published global price.
 *   - NOT a price invention. The price comes from the admin's dialog input
 *     (via `masterPriceApply.ts`, which reuses the §4 gate + validation);
 *     this module stores it verbatim and never computes one.
 *   - NOT a provenance change. Each entry carries the overlaid record's own
 *     sourceKey / sourceTier / sourcePriority / sourceName / document /
 *     verificationStatus, so the tier ladder
 *     OFFICIAL→MARKET→ASSUMPTION→UNRESOLVED is preserved — an admin edit
 *     never promotes a MARKET price to OFFICIAL.
 *   - NOT a unit conversion. The resolver matches an entry ONLY on an
 *     exact (normalized) unit match; a query in another unit never sees
 *     the overlay price (no silent multiply, no conversion).
 *
 * LAYERING: this module lives in the DATA layer and imports ONLY types —
 * the resolver (`resolver.ts`) imports it, and the resolver must never
 * import engine modules (see `ResourcePriceQuery.pricingContext` docs).
 * The engine-side apply service (`src/engine/pricing/admin/
 * masterPriceApply.ts`) is the ONLY writer; it also owns the §4.4 history
 * and §13 feed records for each apply.
 *
 * PERSISTENCE: localStorage key `ezrab.adminMasterPriceOverlay.v1`
 * (ProjectPriceEngine pattern: guarded when `window`/`localStorage` is
 * absent, e.g. vitest node env — then memory-only). Malformed stored
 * entries are dropped with a warning recorded in `loadWarnings`
 * (see `getAdminOverlayLoadWarnings`) — never silently trusted.
 */

import type {
  PriceSourceTier,
  PriceVerificationStatus,
  ResourcePriceRecord,
  ResourceType,
} from './types';

/** localStorage key for the overlay (versioned; bump on schema change). */
export const ADMIN_MASTER_PRICE_OVERLAY_STORAGE_KEY = 'ezrab.adminMasterPriceOverlay.v1' as const;

/** The only scope an overlay entry can carry: this browser, until the server exists. */
export const ADMIN_MASTER_PRICE_OVERLAY_SCOPE = 'LOCAL_BROWSER' as const;

/**
 * One admin-applied master price. Frozen at write time; the only mutation
 * is a later apply superseding it (same `priceRecordId`, newer
 * `changedAt`). `previousPrice` is the EFFECTIVE price (resolver answer)
 * before the apply — not necessarily the overlaid record's own price,
 * because the record may not have been the winning record for its key.
 */
export interface AdminMasterPriceOverlayEntry {
  /** The generated-master record this apply targets. */
  priceRecordId: string;
  /** Canonical entity (RES-xxx) when the record carries one. */
  resourceId: string | null;
  /** Resource code as printed ('' for codeless records, e.g. Paku asbes). */
  resourceCode: string;
  resourceName: string;
  resourceType: ResourceType;
  /** Unit the price applies to — matched EXACTLY, never converted. */
  unit: string;
  /** The admin-applied price (IDR), verbatim from the dialog input. */
  price: number;
  /** Effective price before the apply (null = was unpriced). */
  previousPrice: number | null;
  // --- provenance snapshot, copied verbatim from the overlaid record ---
  sourceKey: string;
  sourceTier: PriceSourceTier;
  sourcePriority: number;
  sourceName: string;
  sourceDocument: string | null;
  sourceUrl: string | null;
  supplier: string | null;
  verificationStatus: PriceVerificationStatus;
  /** Admin's reason (≥ 10 chars, mirrors §4.4). */
  reason: string;
  /** ISO timestamp of the apply. */
  changedAt: string;
  /** Authenticated admin id, or NULL (honest no-auth). Never fabricated. */
  adminIdentity: string | null;
  /** The §4.4 history entry id for this apply (audit link). */
  historyEntryId: string;
  scope: typeof ADMIN_MASTER_PRICE_OVERLAY_SCOPE;
}

// ---------------------------------------------------------------------------
// Storage (guarded; memory-only when localStorage is unavailable)
// ---------------------------------------------------------------------------

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidOverlayEntry(value: unknown): value is AdminMasterPriceOverlayEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.priceRecordId === 'string' &&
    e.priceRecordId !== '' &&
    (e.resourceId === null || typeof e.resourceId === 'string') &&
    typeof e.resourceCode === 'string' &&
    typeof e.resourceName === 'string' &&
    e.resourceName !== '' &&
    typeof e.resourceType === 'string' &&
    typeof e.unit === 'string' &&
    e.unit !== '' &&
    typeof e.price === 'number' &&
    Number.isFinite(e.price) &&
    e.price >= 0 &&
    (e.previousPrice === null ||
      (typeof e.previousPrice === 'number' &&
        Number.isFinite(e.previousPrice) &&
        e.previousPrice >= 0)) &&
    typeof e.sourceKey === 'string' &&
    typeof e.sourceTier === 'string' &&
    typeof e.sourcePriority === 'number' &&
    typeof e.sourceName === 'string' &&
    (e.sourceDocument === null || typeof e.sourceDocument === 'string') &&
    (e.sourceUrl === null || typeof e.sourceUrl === 'string') &&
    (e.supplier === null || typeof e.supplier === 'string') &&
    typeof e.verificationStatus === 'string' &&
    typeof e.reason === 'string' &&
    typeof e.changedAt === 'string' &&
    !Number.isNaN(Date.parse(e.changedAt)) &&
    (e.adminIdentity === null || typeof e.adminIdentity === 'string') &&
    typeof e.historyEntryId === 'string' &&
    e.historyEntryId !== '' &&
    e.scope === ADMIN_MASTER_PRICE_OVERLAY_SCOPE
  );
}

let cache: Map<string, AdminMasterPriceOverlayEntry> | null = null;
let loadWarnings: string[] = [];

function ensureCache(): Map<string, AdminMasterPriceOverlayEntry> {
  if (cache !== null) return cache;
  cache = new Map();
  loadWarnings = [];
  const storage = getStorage();
  if (storage === null) return cache;
  let raw: string | null = null;
  try {
    raw = storage.getItem(ADMIN_MASTER_PRICE_OVERLAY_STORAGE_KEY);
  } catch {
    loadWarnings.push('localStorage read failed for the admin price overlay; starting empty.');
    return cache;
  }
  if (raw === null || raw === '') return cache;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    loadWarnings.push('Stored admin price overlay is not valid JSON; starting empty.');
    return cache;
  }
  if (!Array.isArray(parsed)) {
    loadWarnings.push('Stored admin price overlay is not an array; starting empty.');
    return cache;
  }
  for (const item of parsed) {
    if (isValidOverlayEntry(item)) {
      cache.set(item.priceRecordId, Object.freeze({ ...item }));
    } else {
      loadWarnings.push('Dropped a malformed stored admin price overlay entry (failed validation).');
    }
  }
  return cache;
}

/** Warnings from the last load of stored entries (empty when nothing was dropped). */
export function getAdminOverlayLoadWarnings(): readonly string[] {
  ensureCache();
  return [...loadWarnings];
}

function persist(): boolean {
  const storage = getStorage();
  if (storage === null) return false;
  try {
    storage.setItem(
      ADMIN_MASTER_PRICE_OVERLAY_STORAGE_KEY,
      JSON.stringify([...ensureCache().values()]),
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reads (the resolver + the view)
// ---------------------------------------------------------------------------

/** All overlay entries, in apply order (oldest first). */
export function listAdminMasterPriceOverlayEntries(): readonly AdminMasterPriceOverlayEntry[] {
  return [...ensureCache().values()];
}

/** The overlay entry for one generated-master record id, or null. */
export function getAdminMasterPriceOverlayEntry(
  priceRecordId: string,
): AdminMasterPriceOverlayEntry | null {
  return ensureCache().get(priceRecordId) ?? null;
}

/**
 * Apply the overlay to a record list for DISPLAY (MasterDatabaseView):
 * returns copies with `price` replaced by the applied price where an
 * overlay exists. The input records are never mutated. Callers that need
 * to know WHICH records are overlaid use `getAdminMasterPriceOverlayEntry`.
 */
export function applyAdminOverlayToRecords(
  records: readonly ResourcePriceRecord[],
): ResourcePriceRecord[] {
  const overlay = ensureCache();
  if (overlay.size === 0) return [...records];
  return records.map((r) => {
    const entry = overlay.get(r.id);
    return entry ? { ...r, price: entry.price } : r;
  });
}

// ---------------------------------------------------------------------------
// Writes (ONLY via masterPriceApply.ts — the gated apply service)
// ---------------------------------------------------------------------------

/**
 * Upsert one overlay entry (keyed by `priceRecordId`; a later apply for
 * the same record supersedes the earlier one). Returns whether the
 * entry was persisted to localStorage (false = memory-only: no
 * localStorage in this environment, or the write failed — the caller
 * reports that as a persistence warning, never as success).
 */
export function setAdminMasterPriceOverlayEntry(entry: AdminMasterPriceOverlayEntry): {
  persisted: boolean;
} {
  ensureCache().set(entry.priceRecordId, Object.freeze({ ...entry }));
  return { persisted: persist() };
}

/** Remove one overlay entry (rollback / maintenance). Returns whether one existed. */
export function removeAdminMasterPriceOverlayEntry(priceRecordId: string): {
  removed: boolean;
  persisted: boolean;
} {
  const removed = ensureCache().delete(priceRecordId);
  return { removed, persisted: persist() };
}

/**
 * Clear the whole overlay (tests + maintenance). After this, the
 * resolver answers from the generated master again — the overlay leaves
 * no trace in resolution (the §4.4 history is a SEPARATE store and is
 * NOT cleared by this; use `clearLocalMasterPriceApplyStores` for that).
 */
export function clearAdminMasterPriceOverlay(): void {
  ensureCache().clear();
  const storage = getStorage();
  try {
    storage?.removeItem(ADMIN_MASTER_PRICE_OVERLAY_STORAGE_KEY);
  } catch {
    // Memory is already cleared; a storage-removal failure only means a
    // stale copy may reload on the next page load — reported by the
    // caller through the apply store warnings, not thrown here.
  }
}

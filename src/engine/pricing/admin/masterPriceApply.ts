/**
 * MASTER PRICING §12/§13 (P10) — ADMIN MASTER PRICE APPLY (client-side).
 * =======================================================================
 *
 * The REAL apply behind the MasterDatabaseView confirmation dialog
 * (previously a stub: "this is where the admin apply call goes (§12/§13)").
 * `applyMasterPriceChange` is the ONLY writer of admin-applied master
 * prices. One call does, in order:
 *
 *   1. GATE — `authorizeMasterPriceOperation(identity, 'EDIT_MASTER_PRICE')`
 *      (§4.1). Denied ⇒ NOTHING is written (fail-closed). The identity is
 *      INPUT, never constructed here: in this environment
 *      `currentLocalIdentity()` is anonymous, so the gate denies and the
 *      dialog's confirm button stays disabled — the apply path is fully
 *      built and tested, and becomes live the moment a server-verified
 *      global admin identity exists. No local "login as admin" toggle
 *      exists anywhere, by design.
 *   2. RE-RESOLVE the live effective price (the resolver answer for the
 *      key — which already includes any earlier overlay). The audit's
 *      `previousAmount` is THIS value, never the record's own price:
 *      the record may not be the winning record for its key (§9 model).
 *   3. VALIDATE the new price with the same `validateProposedPrice` the
 *      simulate step uses (finite, ≥ 0, ≠ current effective) and the
 *      reason (≥ 10 chars, §4.4). The price comes ONLY from the admin's
 *      dialog input — never from a model, a guess, or a default.
 *   4. AUDIT — build + append a §4.4 `MasterPriceHistoryEntry`
 *      (operation UPDATE, publicationStatus DRAFT — see below) to the
 *      local history store. Append-only; a duplicate id (same inputs +
 *      same `changedAt`) is REFUSED and the apply aborts with no writes.
 *   5. OVERLAY — write the admin-applied price to the client-side
 *      overlay store (`adminMasterPriceOverlay.ts`), which the resolver
 *      consults before the live index. Unit is the record's unit —
 *      unchanged by this flow; a unit change is a different operation.
 *   6. FEED — build a §13 `PriceChangeFeedEntry` (sourceKind
 *      MASTER_PRICE_HISTORY, linked to the history entry) so the §10
 *      adoption machinery can consume the change via
 *      `readPriceChangesSince` / `feedEntriesToChangeInputs`. SKIPPED
 *      honestly for codeless records (a feed entry REQUIRES a
 *      resourceCode — Paku asbes has none): the history entry is still
 *      recorded, and the skip reason is returned, never hidden.
 *   7. INVALIDATE the resolver's AHSP cache so the next
 *      `resolveAhspUnitPrice` recomputes from the applied price.
 *
 * HONESTY SCOPE (frontend-only phase):
 *   - The apply is BROWSER-LOCAL (localStorage). It does not change the
 *     generated master, does not reach other users/devices, and does not
 *     survive a site-data clear or a fresh profile. `publicationStatus`
 *     is DRAFT for exactly this reason: the change is live in this
 *     browser but NOT published to the global master. The server-backed
 *     version needs: a verified admin identity (auth), a
 *     `master_price_history` table (migration NOT APPLIED), a price
 *     endpoint (none exists; Vercel function quota is 12/12), and a
 *     publish step that regenerates `priceMaster.generated.ts`.
 *   - NO silent writes to historical projects: SNAPSHOT / OVERRIDE
 *     projects keep their stored prices (the resolver answers them
 *     before the overlay); only LIVE_MASTER_PRICE projects see the new
 *     price, and SNAPSHOT adoption stays explicit opt-in (§10/§12).
 *   - Provenance is PRESERVED from the overlaid record (sourceKey /
 *     tier / priority / name / document) — an admin edit never promotes
 *     a MARKET price to OFFICIAL, and a missing price stays null.
 *   - Persistence failures are REPORTED (`persistenceWarnings`), never
 *     claimed as success: in an environment without localStorage (e.g.
 *     vitest node env) the apply still works in memory for the session.
 *
 * The function NEVER throws to its caller: every failure mode is a
 * typed `{ ok: false }` result. Partial writes are avoided by ordering
 * (history first — a duplicate aborts before the overlay is touched;
 * the overlay write itself cannot throw).
 */

import { MASTER_PRICE_VERSION } from '../../../data/priceDatabase2026/types';
import type { ResourcePriceRecord } from '../../../data/priceDatabase2026/types';
import { priceResolver2026 } from '../../../data/priceDatabase2026/resolver';
import {
  clearAdminMasterPriceOverlay,
  setAdminMasterPriceOverlayEntry,
  type AdminMasterPriceOverlayEntry,
} from '../../../data/priceDatabase2026/adminMasterPriceOverlay';
import {
  authorizeMasterPriceOperation,
  type AuthorizationDenialCode,
} from './masterPriceAuthorization';
import {
  appendHistoryEntry,
  buildHistoryEntry,
  type MasterPriceHistoryEntry,
} from './masterPriceHistory';
import { MASTER_PRICE_REASON_MIN_LENGTH } from './masterPriceRecord';
import { validateProposedPrice } from './masterPricingUiLogic';
import {
  appendPriceChangeFeedEntry,
  buildPriceChangeFeedEntry,
  type PriceChangeFeedEntry,
} from '../sync/priceChangeFeed';

/** localStorage keys for the local audit stores (versioned; bump on schema change). */
export const MASTER_PRICE_LOCAL_HISTORY_STORAGE_KEY = 'ezrab.masterPriceHistory.v1' as const;
export const MASTER_PRICE_LOCAL_FEED_STORAGE_KEY = 'ezrab.priceChangeFeed.v1' as const;

export interface MasterPriceApplyInput {
  /** A VERIFIED identity (server-side when it exists). Never constructed from client claims. */
  identity: unknown;
  /** The generated-master record being edited (the ORIGINAL record, not an overlaid copy). */
  record: ResourcePriceRecord;
  /** The new price (IDR), verbatim from the admin's dialog input. */
  newPrice: number;
  /** Admin's reason (≥ 10 chars) — recorded in the §4.4 audit trail. */
  reason: string;
  /** ISO timestamp of the apply (default: now). Overridable for deterministic tests. */
  changedAt?: string;
  /** §9-computed impact inputs for the audit entry (from the preview dialog). */
  affectedAhspReferences?: readonly string[];
  affectedLivePriceProjects?: readonly string[];
}

export type MasterPriceApplyFailureCode =
  | 'DENIED'
  | 'INVALID_PRICE'
  | 'INVALID_REASON'
  | 'INVALID_TIMESTAMP'
  | 'DUPLICATE_HISTORY'
  | 'STORE_ERROR';

export type MasterPriceApplyResult =
  | {
      ok: true;
      /** The overlay entry now in effect for this record's key. */
      overlayEntry: AdminMasterPriceOverlayEntry;
      /** The §4.4 audit entry for this apply. */
      historyEntry: MasterPriceHistoryEntry;
      /** The §13 feed entry, or null when skipped (see `feedSkippedReason`). */
      feedEntry: PriceChangeFeedEntry | null;
      feedSkippedReason: string | null;
      /** Effective price before the apply (resolver answer; null = was unpriced). */
      previousAmount: number | null;
      newAmount: number;
      /** Non-fatal durability problems (e.g. localStorage unavailable) — the apply still holds in memory. */
      persistenceWarnings: string[];
    }
  | {
      ok: false;
      code: MasterPriceApplyFailureCode;
      /** Indonesian, UI-facing reason. */
      reason: string;
      /** The §4 denial code, when the failure is a gate denial. */
      denialCode?: AuthorizationDenialCode;
    };

// ---------------------------------------------------------------------------
// Local stores: §4.4 history + §13 feed (in-memory + localStorage)
// ---------------------------------------------------------------------------

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidHistoryEntry(value: unknown): value is MasterPriceHistoryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  const amountOk = (v: unknown): boolean =>
    v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return (
    typeof e.id === 'string' &&
    e.id !== '' &&
    typeof e.operation === 'string' &&
    typeof e.changedAt === 'string' &&
    !Number.isNaN(Date.parse(e.changedAt)) &&
    typeof e.reason === 'string' &&
    e.reason.trim().length >= MASTER_PRICE_REASON_MIN_LENGTH &&
    amountOk(e.previousAmount) &&
    amountOk(e.newAmount) &&
    Array.isArray(e.affectedAhspReferences) &&
    Array.isArray(e.affectedLivePriceProjects)
  );
}

function isValidFeedEntry(value: unknown): value is PriceChangeFeedEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  const amountOk = (v: unknown): boolean =>
    v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return (
    typeof e.id === 'string' &&
    e.id !== '' &&
    typeof e.resourceCode === 'string' &&
    e.resourceCode.trim() !== '' &&
    typeof e.unit === 'string' &&
    e.unit !== '' &&
    typeof e.changedAt === 'string' &&
    !Number.isNaN(Date.parse(e.changedAt)) &&
    typeof e.reason === 'string' &&
    e.reason.trim().length >= MASTER_PRICE_REASON_MIN_LENGTH &&
    amountOk(e.oldPrice) &&
    amountOk(e.newPrice)
  );
}

let historyCache: readonly MasterPriceHistoryEntry[] | null = null;
let feedCache: readonly PriceChangeFeedEntry[] | null = null;
let storeWarnings: string[] = [];

function loadStoredList<T>(key: string, isValid: (v: unknown) => v is T, label: string): readonly T[] {
  const storage = getStorage();
  if (storage === null) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    storeWarnings.push(`Gagal membaca ${label} dari localStorage; mulai dari kosong.`);
    return [];
  }
  if (raw === null || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storeWarnings.push(`${label} tersimpan bukan JSON yang valid; mulai dari kosong.`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    storeWarnings.push(`${label} tersimpan bukan array; mulai dari kosong.`);
    return [];
  }
  const kept: T[] = [];
  for (const item of parsed) {
    if (isValid(item)) kept.push(Object.freeze(item) as T);
    else storeWarnings.push(`Satu entri ${label} tersimpan tidak valid dan diabaikan.`);
  }
  return Object.freeze(kept);
}

function persistList(key: string, entries: readonly unknown[], label: string): boolean {
  const storage = getStorage();
  if (storage === null) return false;
  try {
    storage.setItem(key, JSON.stringify(entries));
    return true;
  } catch {
    storeWarnings.push(`Gagal menyimpan ${label} ke localStorage (kuota penuh / tidak tersedia).`);
    return false;
  }
}

/** Local §4.4 history entries (this browser), oldest first. */
export function loadLocalMasterPriceHistory(): readonly MasterPriceHistoryEntry[] {
  if (historyCache === null) {
    historyCache = loadStoredList(
      MASTER_PRICE_LOCAL_HISTORY_STORAGE_KEY,
      isValidHistoryEntry,
      'riwayat harga master (§4.4)',
    );
  }
  return historyCache;
}

/** Local §13 price-change feed entries (this browser), oldest first. */
export function loadLocalPriceChangeFeed(): readonly PriceChangeFeedEntry[] {
  if (feedCache === null) {
    feedCache = loadStoredList(
      MASTER_PRICE_LOCAL_FEED_STORAGE_KEY,
      isValidFeedEntry,
      'feed perubahan harga (§13)',
    );
  }
  return feedCache;
}

/** Warnings accumulated by the local stores (load drops, persist failures). */
export function getLocalMasterPriceStoreWarnings(): readonly string[] {
  return [...storeWarnings];
}

/**
 * Clear ALL local apply stores (history + feed + overlay) — tests and
 * maintenance only. After this, the resolver answers from the generated
 * master again. There is intentionally no per-entry delete: history is
 * append-only, and clearing is a whole-store maintenance act, not an
 * edit of the audit trail.
 */
export function clearLocalMasterPriceApplyStores(): void {
  historyCache = Object.freeze([]);
  feedCache = Object.freeze([]);
  storeWarnings = [];
  clearAdminMasterPriceOverlay();
  const storage = getStorage();
  try {
    storage?.removeItem(MASTER_PRICE_LOCAL_HISTORY_STORAGE_KEY);
    storage?.removeItem(MASTER_PRICE_LOCAL_FEED_STORAGE_KEY);
  } catch {
    // Memory is already cleared; a storage-removal failure only means a
    // stale copy may reload on the next page load.
  }
}

// ---------------------------------------------------------------------------
// The apply
// ---------------------------------------------------------------------------

export function applyMasterPriceChange(input: MasterPriceApplyInput): MasterPriceApplyResult {
  // 1. GATE — the §4 authorization module is the ONLY gate. Denied means
  //    denied: no write of any kind happens below.
  const decision = authorizeMasterPriceOperation(input.identity, 'EDIT_MASTER_PRICE');
  if (!decision.allowed) {
    return {
      ok: false,
      code: 'DENIED',
      reason:
        'Tidak diizinkan: mengubah harga master membutuhkan global admin terverifikasi. ' +
        'Penegakan server belum aktif (belum ada identitas terverifikasi).',
      // decision.code masih bertipe 'ALLOWED' | AuthorizationDenialCode
      // (AuthorizationDecision bukan discriminated union) — di cabang
      // ditolak ini kodenya adalah denial code; 'ALLOWED' yang
      // kontradiktif dipetakan ke undefined (tanpa kode penolakan).
      denialCode: decision.code === 'ALLOWED' ? undefined : decision.code,
    };
  }

  const changedAt = input.changedAt ?? new Date().toISOString();
  if (typeof changedAt !== 'string' || Number.isNaN(Date.parse(changedAt))) {
    return { ok: false, code: 'INVALID_TIMESTAMP', reason: 'Waktu perubahan tidak valid.' };
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < MASTER_PRICE_REASON_MIN_LENGTH) {
    return {
      ok: false,
      code: 'INVALID_REASON',
      reason: `Alasan wajib diisi (minimal ${MASTER_PRICE_REASON_MIN_LENGTH} karakter) — dicatat di jejak audit §4.4.`,
    };
  }

  const { record } = input;
  const adminIdentity =
    typeof input.identity === 'object' &&
    input.identity !== null &&
    (input.identity as { kind?: unknown }).kind === 'authenticated' &&
    typeof (input.identity as { userId?: unknown }).userId === 'string'
      ? (input.identity as { userId: string }).userId
      : null;

  try {
    // 2. RE-RESOLVE the live effective price at apply time (the §9 model:
    //    the baseline is the resolver answer, which already includes any
    //    earlier overlay — never the record's own price).
    const resolution = priceResolver2026.resolveResourcePrice({
      resourceCode: record.resourceCode,
      resourceName: record.resourceName,
      resourceType: record.resourceType,
      unit: record.unit,
    });
    const previousAmount = resolution.status === 'RESOLVED' ? resolution.price : null;

    // 3. VALIDATE the new price (same rule as the simulate step).
    const check = validateProposedPrice(input.newPrice, previousAmount);
    if (!check.valid) {
      return { ok: false, code: 'INVALID_PRICE', reason: check.error ?? 'Harga baru tidak valid.' };
    }
    const newPrice = input.newPrice;

    // 4. AUDIT — §4.4 history entry FIRST: a duplicate id aborts the
    //    apply before the overlay is touched (no partial writes).
    //    publicationStatus DRAFT: live in this browser, NOT published to
    //    the global master (no server publish step exists yet).
    const historyEntry = buildHistoryEntry({
      priceRecordId: record.id,
      resourceId: record.resourceId,
      operation: 'UPDATE',
      previousAmount,
      newAmount: newPrice,
      previousUnit: record.unit,
      newUnit: record.unit,
      previousRegion: record.location,
      newRegion: record.location,
      sourceKey: record.sourceKey,
      sourceTier: record.sourceTier,
      sourceDocument: record.sourceDocument ?? null,
      verificationStatus: record.verificationStatus,
      adminIdentity,
      changedAt,
      reason,
      affectedAhspReferences: [...(input.affectedAhspReferences ?? [])],
      affectedLivePriceProjects: [...(input.affectedLivePriceProjects ?? [])],
      publicationStatus: 'DRAFT',
      previousVersion: record.version ?? null,
      newVersion: record.version != null ? record.version + 1 : null,
      masterPriceVersion: MASTER_PRICE_VERSION,
    });
    let nextHistory: readonly MasterPriceHistoryEntry[];
    try {
      nextHistory = appendHistoryEntry(loadLocalMasterPriceHistory(), historyEntry);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Duplicate history entry id')) {
        return {
          ok: false,
          code: 'DUPLICATE_HISTORY',
          reason:
            'Perubahan yang sama sudah tercatat di jejak audit (riwayat bersifat append-only; ' +
            'entri duplikat ditolak).',
        };
      }
      throw e;
    }
    historyCache = nextHistory;
    const persistenceWarnings: string[] = [];
    if (
      !persistList(
        MASTER_PRICE_LOCAL_HISTORY_STORAGE_KEY,
        nextHistory,
        'riwayat harga master (§4.4)',
      )
    ) {
      persistenceWarnings.push(
        'Jejak audit tersimpan di memori sesi ini saja (localStorage tidak tersedia) — ' +
          'riwayat akan hilang saat refresh.',
      );
    }

    // 5. OVERLAY — the price itself. Provenance is copied verbatim from
    //    the overlaid record (never promoted, never invented).
    const overlayEntry: AdminMasterPriceOverlayEntry = Object.freeze({
      priceRecordId: record.id,
      resourceId: record.resourceId,
      resourceCode: record.resourceCode,
      resourceName: record.resourceName,
      resourceType: record.resourceType,
      unit: record.unit,
      price: newPrice,
      previousPrice: previousAmount,
      sourceKey: record.sourceKey,
      sourceTier: record.sourceTier,
      sourcePriority: record.sourcePriority,
      sourceName: record.sourceName,
      sourceDocument: record.sourceDocument ?? null,
      sourceUrl: record.sourceUrl ?? null,
      supplier: record.supplier ?? null,
      verificationStatus: record.verificationStatus,
      reason,
      changedAt,
      adminIdentity,
      historyEntryId: historyEntry.id,
      scope: 'LOCAL_BROWSER' as const,
    });
    const overlayPersisted = setAdminMasterPriceOverlayEntry(overlayEntry);
    if (!overlayPersisted.persisted) {
      persistenceWarnings.push(
        'Harga diterapkan di memori sesi ini saja (localStorage tidak tersedia) — ' +
          'harga akan kembali ke harga master hasil generate saat refresh.',
      );
    }

    // 6. FEED — §13 change feed for §10 adoption. Requires a resource
    //    code; codeless records (e.g. Paku asbes) skip honestly — the
    //    history entry above is still the audit record.
    let feedEntry: PriceChangeFeedEntry | null = null;
    let feedSkippedReason: string | null = null;
    if (typeof record.resourceCode !== 'string' || record.resourceCode.trim() === '') {
      feedSkippedReason =
        'Record tanpa kode resource tidak dapat masuk feed perubahan harga §13 ' +
        '(feed entry wajib berkode agar dapat menggerakkan adopsi §10). ' +
        'Riwayat §4.4 tetap tercatat.';
    } else {
      try {
        const built = buildPriceChangeFeedEntry({
          resourceCode: record.resourceCode,
          resourceId: record.resourceId,
          resourceName: record.resourceName,
          category:
            record.resourceType === 'labor'
              ? 'LABOR'
              : record.resourceType === 'equipment'
                ? 'EQUIPMENT'
                : record.resourceType === 'material'
                  ? 'MATERIAL'
                  : null,
          unit: record.unit,
          oldPrice: previousAmount,
          newPrice,
          region: record.location.provinceName ?? null,
          source: record.sourceKey,
          changedAt,
          changedBy: adminIdentity,
          reason,
          masterPriceVersion: MASTER_PRICE_VERSION,
          historyEntryId: historyEntry.id,
          sourceKind: 'MASTER_PRICE_HISTORY',
        });
        const nextFeed = appendPriceChangeFeedEntry(loadLocalPriceChangeFeed(), built);
        feedCache = nextFeed;
        feedEntry = built;
        if (!persistList(MASTER_PRICE_LOCAL_FEED_STORAGE_KEY, nextFeed, 'feed perubahan harga (§13)')) {
          persistenceWarnings.push(
            'Feed perubahan harga tersimpan di memori sesi ini saja (localStorage tidak tersedia).',
          );
        }
      } catch (e) {
        // The feed is secondary to the apply itself (history + overlay
        // are already written): a feed failure is reported, never a
        // rollback of a completed apply.
        feedSkippedReason = `Feed §13 tidak tercatat: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    // 7. INVALIDATE the resolver's AHSP cache so compositions recompute
    //    from the applied price.
    priceResolver2026.invalidateAhspCache();

    return {
      ok: true,
      overlayEntry,
      historyEntry,
      feedEntry,
      feedSkippedReason,
      previousAmount,
      newAmount: newPrice,
      persistenceWarnings,
    };
  } catch (e) {
    return {
      ok: false,
      code: 'STORE_ERROR',
      reason: `Gagal menerapkan perubahan harga: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

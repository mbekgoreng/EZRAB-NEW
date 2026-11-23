/**
 * I8a — Page-level vision cache for the DED drawing-vision layer.
 *
 * Why a cache (PLAN.md §6 risk 4): the gateway allows ONE image per
 * request with a 2.6 MB cap and no streaming with media, so every vision
 * call is expensive. A page re-read (mode switch, re-run, review revisit)
 * must not re-pay for a detection the model already produced.
 *
 * Design:
 * - In-memory Map is AUTHORITATIVE. An optional injected storage
 *   (get/set/remove, string-based, sessionStorage-shaped) is a
 *   write-through mirror used to restore entries in a fresh instance.
 *   This module NEVER touches sessionStorage/localStorage directly, so
 *   tsx tests stay DOM-free; I8b passes the browser storage in.
 * - Keys are stable, documented strings. A different ROI, prompt version,
 *   or model version MUST produce a different key — no stale reuse across
 *   prompt changes. Prompt-version sensitivity is ALSO the cross-session
 *   invalidation mechanism: entries written under an old prompt version
 *   are simply never read again (the storage interface has no key
 *   enumeration, so page/doc invalidation only reaches keys the live Map
 *   knows — see invalidatePage/invalidateDoc).
 * - TTL: expired entries are misses (default 1 hour, configurable).
 * - LRU-ish cap: default 50 entries; the least-recently-USED entry is
 *   evicted first (a `get` hit refreshes recency).
 * - `get` returns a hit flag so callers can show "from cache" honestly.
 * - Cached results carry `source: 'vision'` — the provenance marker.
 */

export interface VisionCacheKeyInput {
  /** Stable hash/id of the source document (e.g. sha256 of the PDF bytes). */
  docHash: string;
  /** 1-based page number. */
  page: number;
  /** ROI id from roi.ts (`roiIdFor`), or undefined for the full page. */
  roiId?: string;
  /** Prompt version (VISION_PROMPT_VERSION in visionClient.ts). */
  promptVersion: string;
  /** Model version label (VISION_MODEL_VERSION in visionClient.ts). */
  modelVersion: string;
}

/** Cache key prefix — bump the `v1` segment only if the key FORMAT changes. */
export const VISION_CACHE_KEY_PREFIX = 'ded-vision/v1';

/**
 * Pure, stable key builder. Every segment is URI-encoded so a separator
 * character inside a docHash/roiId can never create a collision with a
 * different (docHash, page, roiId, promptVersion, modelVersion) tuple.
 * Format: `ded-vision/v1/<docHash>/<page>/<roiId|full>/<promptVersion>/<modelVersion>`.
 */
export function visionCacheKey(input: VisionCacheKeyInput): string {
  const segments = [
    VISION_CACHE_KEY_PREFIX,
    encodeURIComponent(String(input.docHash)),
    String(input.page),
    encodeURIComponent(input.roiId ?? 'full'),
    encodeURIComponent(String(input.promptVersion)),
    encodeURIComponent(String(input.modelVersion)),
  ];
  return segments.join('/');
}

export interface VisionCacheEntry<T> {
  result: T;
  /** Epoch ms (from the injected clock) when the entry was stored. */
  cachedAt: number;
  /** The key this entry was stored under (for debugging / audits). */
  key: string;
  /** Provenance marker — always 'vision' for this cache. */
  source: 'vision';
}

export type VisionCacheGetResult<T> =
  | { hit: true; entry: VisionCacheEntry<T> }
  | { hit: false };

/**
 * Minimal string storage interface — shaped like the sessionStorage subset
 * this cache needs. Tests inject a fake; I8b can pass sessionStorage
 * (or a wrapper) in the browser.
 */
export interface VisionCacheStorage {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface VisionCacheOptions {
  /** Max in-memory entries (LRU-ish eviction). Default 50. */
  maxEntries?: number;
  /** Time-to-live in ms. Default 3_600_000 (1 hour). */
  ttlMs?: number;
  /** Optional write-through storage mirror. */
  storage?: VisionCacheStorage;
  /** Clock injection (tests control time). Default: () => Date.now(). */
  now?: () => number;
}

export const DEFAULT_VISION_CACHE_MAX_ENTRIES = 50;
export const DEFAULT_VISION_CACHE_TTL_MS = 3_600_000;

export class VisionCache<T> {
  private readonly map = new Map<string, VisionCacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly storage?: VisionCacheStorage;
  private readonly now: () => number;

  constructor(options: VisionCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_VISION_CACHE_MAX_ENTRIES;
    if (!Number.isFinite(this.maxEntries) || this.maxEntries <= 0) {
      throw new RangeError('VisionCache: maxEntries must be a positive finite number.');
    }
    this.ttlMs = options.ttlMs ?? DEFAULT_VISION_CACHE_TTL_MS;
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new RangeError('VisionCache: ttlMs must be a positive finite number.');
    }
    this.storage = options.storage;
    this.now = options.now ?? (() => Date.now());
  }

  /** Number of live (unexpired) entries currently held in memory. */
  get size(): number {
    this.purgeExpired();
    return this.map.size;
  }

  private isExpired(entry: VisionCacheEntry<T>, at: number): boolean {
    return at - entry.cachedAt >= this.ttlMs;
  }

  private purgeExpired(): void {
    const at = this.now();
    for (const [key, entry] of this.map) {
      if (this.isExpired(entry, at)) {
        this.map.delete(key);
        this.storage?.remove(key);
      }
    }
  }

  /**
   * Look up a key. A hit refreshes recency (LRU). An expired entry is a
   * MISS (and is removed). On a memory miss with storage configured, the
   * storage mirror is consulted and a fresh entry is rehydrated into
   * memory (and counted toward the cap).
   */
  get(key: string): VisionCacheGetResult<T> {
    const at = this.now();
    const live = this.map.get(key);
    if (live !== undefined) {
      if (this.isExpired(live, at)) {
        this.map.delete(key);
        this.storage?.remove(key);
        return { hit: false };
      }
      // Refresh recency: re-insert at the end (Map preserves insertion order).
      this.map.delete(key);
      this.map.set(key, live);
      return { hit: true, entry: live };
    }
    if (this.storage) {
      const raw = this.storage.get(key);
      if (typeof raw === 'string' && raw.length > 0) {
        try {
          const entry = JSON.parse(raw) as VisionCacheEntry<T>;
          if (entry && entry.key === key && typeof entry.cachedAt === 'number' && 'result' in entry) {
            if (!this.isExpired(entry, at)) {
              this.storeInMemory(key, entry);
              return { hit: true, entry };
            }
            this.storage.remove(key);
          }
        } catch {
          // Corrupt mirror entry: drop it, report a miss. Never crash a read.
          this.storage.remove(key);
        }
      }
    }
    return { hit: false };
  }

  /** True only when the key is present AND unexpired. Does not refresh recency. */
  has(key: string): boolean {
    const at = this.now();
    const live = this.map.get(key);
    if (live !== undefined) {
      if (this.isExpired(live, at)) {
        this.map.delete(key);
        this.storage?.remove(key);
        return false;
      }
      return true;
    }
    if (this.storage) {
      const raw = this.storage.get(key);
      if (typeof raw === 'string' && raw.length > 0) {
        try {
          const entry = JSON.parse(raw) as VisionCacheEntry<T>;
          if (entry && entry.key === key && typeof entry.cachedAt === 'number' && 'result' in entry) {
            if (!this.isExpired(entry, at)) return true;
            this.storage.remove(key);
          }
        } catch {
          this.storage.remove(key);
        }
      }
    }
    return false;
  }

  /** Store a result. Evicts the least-recently-used entry when over the cap. */
  set(key: string, result: T): void {
    const entry: VisionCacheEntry<T> = { result, cachedAt: this.now(), key, source: 'vision' };
    this.storeInMemory(key, entry);
    if (this.storage) {
      try {
        this.storage.set(key, JSON.stringify(entry));
      } catch {
        // Mirror failure must never break the in-memory cache.
      }
    }
  }

  private storeInMemory(key: string, entry: VisionCacheEntry<T>): void {
    this.map.delete(key);
    this.map.set(key, entry);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
      this.storage?.remove(oldest);
    }
  }

  /** Remove every entry (memory + the storage keys this instance knows). */
  clear(): void {
    for (const key of this.map.keys()) this.storage?.remove(key);
    this.map.clear();
  }

  /**
   * Invalidate every cached entry for one page of one document.
   * LIMITATION (documented, by design): only keys the live Map knows are
   * removed from storage — the storage interface has no enumeration, so a
   * previous session's entries for this page survive in storage until
   * their TTL lapses. They are harmless: a prompt-version bump (the
   * normal reason to invalidate) already makes them unreachable, because
   * the new key differs.
   */
  invalidatePage(docHash: string, page: number): number {
    const prefix = [
      VISION_CACHE_KEY_PREFIX,
      encodeURIComponent(String(docHash)),
      String(page),
      '',
    ].join('/');
    return this.invalidateByPrefix(prefix);
  }

  /** Invalidate every cached entry for one document (same limitation as invalidatePage). */
  invalidateDoc(docHash: string): number {
    const prefix = [VISION_CACHE_KEY_PREFIX, encodeURIComponent(String(docHash)), ''].join('/');
    return this.invalidateByPrefix(prefix);
  }

  private invalidateByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
        this.storage?.remove(key);
        removed += 1;
      }
    }
    return removed;
  }
}

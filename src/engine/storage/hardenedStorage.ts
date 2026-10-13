/**
 * EZRAB Hardened Local Storage
 * ==============================
 * Schema-versioned, failure-aware wrapper around localStorage.
 *
 * Guarantees:
 * - Data lama tetap terbaca (migrasi deterministik, idempotent)
 * - Kegagalan save tidak disamarkan sebagai sukses
 * - Konflik antar-tab terdeteksi (bukan last-write-wins diam-diam)
 * - Field optional baru (provenance) tidak merusak data lama
 */

export const STORAGE_SCHEMA_VERSION = 2;

/** v1 → v2: provenance fields added (optional, no data change needed) */
type MigrationFn = (data: unknown) => unknown;

const MIGRATIONS: Record<number, MigrationFn> = {
  // v1 → v2: no transformation needed; provenance fields are optional.
  // This entry documents that v1 data is forward-compatible.
  1: (data: unknown) => data,
};

export interface VersionedEnvelope<T> {
  /** Schema version of the payload */
  v: number;
  /** ISO timestamp of last write */
  savedAt: string;
  /** Random ID per write — used for cross-tab conflict detection */
  writeId: string;
  data: T;
}

export type SaveResult =
  | { ok: true; writeId: string }
  | { ok: false; error: 'QUOTA_EXCEEDED' | 'NOT_SUPPORTED' | 'SERIALIZE_ERROR' | 'UNKNOWN'; message: string };

export type LoadResult<T> =
  | { ok: true; data: T; migrated: boolean; fromVersion: number | null }
  | { ok: false; error: 'NOT_FOUND' | 'CORRUPT' | 'MIGRATION_FAILED'; raw?: string };

function newWriteId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function isQuotaError(e: unknown): boolean {
  if (e instanceof DOMException) {
    return e.name === 'QuotaExceededError' || e.code === 22;
  }
  const msg = String((e as Error)?.message || '').toLowerCase();
  return msg.includes('quota') || msg.includes('exceeded');
}

/**
 * Migrate data from oldVersion → current. Deterministic and idempotent.
 * Never recalculates prices or modifies provenance.
 */
export function migrate<T>(data: unknown, fromVersion: number): T {
  let current = data;
  let v = fromVersion;
  while (v < STORAGE_SCHEMA_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) {
      throw new Error(`No migration from schema v${v}`);
    }
    current = fn(current);
    v++;
  }
  return current as T;
}

export function saveVersioned<T>(key: string, data: T): SaveResult {
  const envelope: VersionedEnvelope<T> = {
    v: STORAGE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    writeId: newWriteId(),
    data,
  };
  let json: string;
  try {
    json = JSON.stringify(envelope);
  } catch (e) {
    return { ok: false, error: 'SERIALIZE_ERROR', message: String((e as Error)?.message || e) };
  }
  try {
    localStorage.setItem(key, json);
    return { ok: true, writeId: envelope.writeId };
  } catch (e) {
    if (isQuotaError(e)) {
      return {
        ok: false,
        error: 'QUOTA_EXCEEDED',
        message: 'Penyimpanan penuh. Hapus data lama atau ekspor backup terlebih dahulu.',
      };
    }
    if (e instanceof DOMException && e.name === 'SecurityError') {
      return { ok: false, error: 'NOT_SUPPORTED', message: 'localStorage tidak tersedia.' };
    }
    return { ok: false, error: 'UNKNOWN', message: String((e as Error)?.message || e) };
  }
}

/**
 * Load with backward compatibility:
 * - Versioned envelope → migrate if needed
 * - Raw array (legacy v1, no envelope) → wrap as v1 and migrate
 * - Corrupt JSON → { ok: false, error: 'CORRUPT' } (caller decides fallback)
 */
export function loadVersioned<T>(key: string): LoadResult<T> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { ok: false, error: 'NOT_FOUND' };
  }
  if (raw == null) return { ok: false, error: 'NOT_FOUND' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'CORRUPT', raw };
  }

  // Versioned envelope?
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'v' in (parsed as object) &&
    'data' in (parsed as object)
  ) {
    const env = parsed as VersionedEnvelope<T>;
    const fromVersion = typeof env.v === 'number' ? env.v : 1;
    if (fromVersion > STORAGE_SCHEMA_VERSION) {
      return { ok: false, error: 'CORRUPT', raw };
    }
    try {
      const data = migrate<T>(env.data, fromVersion);
      return { ok: true, data, migrated: fromVersion !== STORAGE_SCHEMA_VERSION, fromVersion };
    } catch {
      return { ok: false, error: 'MIGRATION_FAILED', raw };
    }
  }

  // Legacy: raw array/object without envelope → treat as v1
  try {
    const data = migrate<T>(parsed, 1);
    return { ok: true, data, migrated: true, fromVersion: 1 };
  } catch {
    return { ok: false, error: 'MIGRATION_FAILED', raw };
  }
}

// ---------------------------------------------------------------------------
// Cross-tab conflict detection
// ---------------------------------------------------------------------------

export interface StorageChangeEvent {
  key: string;
  /** writeId of the external change (null if removed) */
  externalWriteId: string | null;
}

type ChangeListener = (ev: StorageChangeEvent) => void;
const listeners = new Set<ChangeListener>();
let listening = false;

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', (e: StorageEvent) => {
    if (!e.key) return;
    let externalWriteId: string | null = null;
    if (e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as Partial<VersionedEnvelope<unknown>>;
        if (parsed && typeof parsed.writeId === 'string') {
          externalWriteId = parsed.writeId;
        }
      } catch {
        // legacy format without writeId
      }
    }
    for (const fn of listeners) {
      try {
        fn({ key: e.key, externalWriteId });
      } catch {
        // never break other listeners
      }
    }
  });
}

/**
 * Subscribe to external (other-tab) changes for EZRAB keys.
 * The app should prompt the user instead of silently overwriting.
 */
export function onExternalStorageChange(fn: ChangeListener): () => void {
  ensureListening();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Read only the envelope metadata without parsing the full payload. */
export function peekEnvelope(key: string): { v: number; savedAt: string; writeId: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VersionedEnvelope<unknown>>;
    if (parsed && typeof parsed.v === 'number' && typeof parsed.writeId === 'string') {
      return { v: parsed.v, savedAt: String(parsed.savedAt || ''), writeId: parsed.writeId };
    }
    return null;
  } catch {
    return null;
  }
}

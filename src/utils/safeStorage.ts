/**
 * Safe localStorage wrapper (src/utils/safeStorage.ts)
 *
 * FASE 5C TASK 6: Handle QuotaExceededError and serialization failures safely.
 * - Never auto-deletes old data to free space.
 * - Never claims success when the write failed.
 * - Returns a result object so callers can notify the user honestly.
 */

export interface StorageResult {
  ok: boolean;
  /** Machine-readable reason when ok=false */
  reason?: 'QUOTA_EXCEEDED' | 'SERIALIZE_ERROR' | 'UNAVAILABLE' | 'UNKNOWN';
  /** User-facing message (Indonesian) when ok=false */
  message?: string;
}

const MESSAGES: Record<string, string> = {
  QUOTA_EXCEEDED:
    'Penyimpanan browser penuh. Data tidak tersimpan — hapus data lama yang tidak diperlukan, lalu coba lagi.',
  SERIALIZE_ERROR: 'Data gagal disiapkan untuk penyimpanan. Perubahan tidak tersimpan.',
  UNAVAILABLE: 'Penyimpanan browser tidak tersedia. Perubahan hanya berlaku sementara.',
  UNKNOWN: 'Penyimpanan gagal. Perubahan tidak tersimpan.',
};

function classifyError(err: unknown): NonNullable<StorageResult['reason']> {
  const name = (err as { name?: string })?.name || '';
  const msg = String((err as { message?: string })?.message || '');
  if (name === 'QuotaExceededError' || /quota/i.test(msg)) return 'QUOTA_EXCEEDED';
  return 'UNKNOWN';
}

export function safeSetItem(key: string, value: string): StorageResult {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: false, reason: 'UNAVAILABLE', message: MESSAGES.UNAVAILABLE };
    }
    window.localStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const reason = classifyError(err);
    // Never delete data to free space; report honestly.
    return { ok: false, reason, message: MESSAGES[reason] };
  }
}

export function safeSetJSON(key: string, data: unknown): StorageResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return { ok: false, reason: 'SERIALIZE_ERROR', message: MESSAGES.SERIALIZE_ERROR };
  }
  return safeSetItem(key, serialized);
}

export function safeGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Conversation-persist failure diagnostics (NEW-02, Batch E).
 *
 * `persistMessage` used to swallow every persistence failure silently
 * (catch-all returning null, no log, no UI) — a failed persist looked
 * exactly like success, which is the most plausible mechanism behind
 * D-51 (the "Review draft" message vanishing after navigation).
 *
 * These helpers make a failed persist OBSERVABLE in both places that
 * matter:
 * 1. A structured console warning (diagnostics for the D-51 live repro).
 * 2. A user-facing message the view shows as a visible, dismissible
 *    banner — never a silent success.
 *
 * Two failure channels, because the store swallows them differently:
 * - thrown errors (e.g. ProjectIsolationError from a stale convIdRef
 *   after a project switch) surface via `reportPersistFailure`;
 * - storage-write failures (quota / unavailable) never throw — the
 *   store records them in `getLastSaveResult()` — surface via
 *   `reportPersistSaveFailure`.
 */

export interface PersistFailureContext {
  role: 'user' | 'assistant';
  conversationId: string | null;
  projectId: string;
  operation: string;
}

export type PersistFailureKind = 'isolation' | 'quota' | 'unknown';

/** Classify a thrown persist error so the user message names the real cause. */
export function describePersistError(err: unknown): PersistFailureKind {
  const name = (err as { name?: string } | null)?.name ?? '';
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/isolation/i.test(name) || /PROJECT_ISOLATION_ERROR/.test(message)) return 'isolation';
  if (/quota/i.test(name) || /quota/i.test(message)) return 'quota';
  return 'unknown';
}

function warnPersistFailure(
  channel: 'throw' | 'save',
  kind: PersistFailureKind,
  detail: string,
  ctx: PersistFailureContext,
): void {
  try {
    console.warn(
      '[ezrab-ai] persistMessage gagal',
      JSON.stringify({
        channel,
        kind,
        role: ctx.role,
        conversationId: ctx.conversationId,
        projectId: ctx.projectId,
        operation: ctx.operation,
        detail,
      }),
    );
  } catch {
    /* logging tidak boleh menggagalkan chat */
  }
}

/**
 * Log a THROWN persist error and return the user-facing message.
 * The caller shows the returned text as a visible banner.
 */
export function reportPersistFailure(err: unknown, ctx: PersistFailureContext): string {
  const kind = describePersistError(err);
  const detail = err instanceof Error ? err.message : String(err ?? 'unknown error');
  warnPersistFailure('throw', kind, detail, ctx);
  if (kind === 'isolation') {
    return 'Pesan tidak tersimpan: percakapan ini milik proyek lain (isolasi proyek). Muat ulang chat untuk menyinkronkan percakapan aktif.';
  }
  if (kind === 'quota') {
    return 'Pesan tidak tersimpan: penyimpanan browser penuh. Hapus data lama yang tidak diperlukan, lalu kirim ulang pesan Anda.';
  }
  return 'Pesan tidak tersimpan ke riwayat — pesan ini hanya tampil sementara dan akan hilang setelah navigasi. Coba Muat Ulang chat.';
}

/**
 * Log a STORAGE-WRITE failure (from the store's last-save result) and
 * return the user-facing message. Prefers the safe-storage layer's own
 * Indonesian message when one is present.
 */
export function reportPersistSaveFailure(
  result: { reason?: string; message?: string },
  ctx: PersistFailureContext,
): string {
  const kind: PersistFailureKind = result.reason === 'QUOTA_EXCEEDED' ? 'quota' : 'unknown';
  warnPersistFailure('save', kind, result.reason ?? 'UNKNOWN', ctx);
  if (result.message) return result.message;
  return 'Pesan tidak tersimpan ke riwayat — pesan ini hanya tampil sementara dan akan hilang setelah navigasi. Coba Muat Ulang chat.';
}

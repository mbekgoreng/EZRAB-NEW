/**
 * MAGIC-AI-FIX (2026-11-13) — batas waktu murni untuk janji tanpa timeout.
 *
 * Dua titik gantung terbukti di kode (investigasi-kode.md §4.2) membuat
 * tombol "Analisis dengan AI" di spreadsheet tampak diam total:
 *  (1) `aiGatewayAuthHeaders()` di-await SEBELUM fetch, di luar jangkauan
 *      AbortController — `getSession()`/`signInAnonymously()` yang
 *      menggantung membuat spinner berputar selamanya tanpa banner;
 *  (2) dynamic import chunk providerClient tanpa timeout.
 *
 * Modul ini NOL dependensi (tanpa Supabase, tanpa registry) supaya bisa
 * diimpor statis oleh modal tanpa membatalkan lazy-load providerClient.
 */

/** Error yang dilempar `withTimeout` bila janji tidak settle tepat waktu. */
export class AiTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number, message: string) {
    super(message);
    this.name = 'AiTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function isAiTimeoutError(err: unknown): err is AiTimeoutError {
  return (
    err instanceof AiTimeoutError ||
    (err instanceof Error && err.name === 'AiTimeoutError')
  );
}

/**
 * Kembalikan nilai janji bila settle sebelum `timeoutMs`; selain itu tolak
 * dengan `AiTimeoutError` berisi `message`. Timer selalu dibersihkan saat
 * janji settle (sukses/gagal) supaya tidak ada timer menggantung.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = globalThis.setTimeout(() => {
      reject(new AiTimeoutError(timeoutMs, message));
    }, timeoutMs);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        globalThis.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Batas resolusi auth pra-fetch di jalur browser providerClient. */
export const AI_GATEWAY_AUTH_TIMEOUT_MS = 10_000;
/** Pesan banner bila resolusi auth pra-fetch melewati batas (MODEL_TIMEOUT). */
export const AI_GATEWAY_AUTH_TIMEOUT_MESSAGE =
  'Verifikasi sesi AI terlalu lama (lebih dari 10 detik). Periksa koneksi Anda, lalu coba lagi.';

/** Batas dynamic import chunk providerClient di modal spreadsheet. */
export const AI_PROVIDER_IMPORT_TIMEOUT_MS = 15_000;
/** Pesan banner bila dynamic import chunk providerClient melewati batas. */
export const AI_PROVIDER_IMPORT_TIMEOUT_MESSAGE =
  'Memuat modul AI terlalu lama (lebih dari 15 detik). Periksa koneksi Anda, lalu coba lagi.';

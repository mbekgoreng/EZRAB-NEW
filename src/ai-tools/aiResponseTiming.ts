/**
 * aiResponseTiming — kebijakan timing TERPUSAT untuk Chat AI & Assistant AI
 * EZRAB (spesifikasi "UNIFIED AI RESPONSE TIMING & INTERACTION" 2026-10-27).
 *
 * Satu-satunya tempat yang menentukan durasi minimum pemrosesan. Chat AI
 * utama (view.tsx), Assistant AI (coAssistantService + chatbox/full view),
 * dan layanan DED/dokumen memakai fungsi yang SAMA — bukan timer terpisah
 * di tiap komponen.
 *
 * Aturan:
 * - Simple  → minimum 1 detik (teks singkat, satu pertanyaan/tindakan).
 * - Medium  → minimum 2 detik (beberapa detail / >1 instruksi).
 * - Complex → minimum 3 detik (prompt panjang, pembacaan DED, analisis
 *   dokumen, multi-langkah).
 * - RAB     → minimum 5–10 detik, tergantung banyak/tidaknya hasil
 *   (perintah owner 2026-10-27): hasil pendek ≈ 5 detik, hasil besar
 *   (tabel RAB panjang) ≈ 10 detik, di antaranya diskalakan dari
 *   panjang teks hasil. RAB menggantikan complex 3 detik — bukan
 *   ditambahkan di atasnya.
 * - Durasi adalah MINIMUM pengalaman pemrosesan, bukan maksimum: timer
 *   dihitung SEJAK permintaan dikirim dan berjalan PARALEL dengan provider.
 *   Provider 5 detik → hasil tampil pada 5 detik (bukan 6–8). Provider
 *   300 ms → hasil tampil setelah sisa minimum (1–3 detik).
 * - Navigasi menu biasa, kalkulasi deterministik non-AI, dan transfer data
 *   (push ke spreadsheet) TIDAK memakai kebijakan ini — hanya permintaan
 *   yang benar-benar lewat Chat AI / Assistant AI.
 * - Klasifikasi deterministik dari teks + aktivitas (tanpa AI tambahan).
 */

export type AiRequestComplexity = 'simple' | 'medium' | 'complex';
export type AiActivity = 'chat' | 'rab' | 'ded' | 'document';

export const AI_MIN_DELAY_MS: Record<AiRequestComplexity, number> = {
  simple: 1000,
  medium: 2000,
  complex: 3000,
};

/** Pola intent generatif/analitis: "buatkan RAB …", "analisis DED …". */
const GENERATION_RE =
  /\b(buatkan|buatin|bikin|buat|buatlah|generate|hitung|susun)\b.*\b(rab|anggaran|ded|dokumen|desain)\b/i;
const ANALYSIS_RE =
  /\b(analisis|analisa|baca|periksa|evaluasi|telaah)\b.*\b(ded|dokumen|gambar|desain)\b/i;

/**
 * Klasifikasi kompleksitas. Aktivitas DED/dokumen/RAB selalu complex
 * (spesifikasi menyebut ketiganya sebagai contoh complex); chat
 * diklasifikasikan dari panjang teks, jumlah penanda instruksi
 * (bullet/numbering), dan jumlah kata.
 */
export function classifyRequest(text: string, activity: AiActivity = 'chat'): AiRequestComplexity {
  const t = (text || '').trim();
  if (activity === 'ded' || activity === 'document' || activity === 'rab') return 'complex';
  if (GENERATION_RE.test(t) || ANALYSIS_RE.test(t)) return 'complex';
  const len = t.length;
  const markers = (t.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length;
  const words = t.split(/\s+/).filter(Boolean).length;
  if (len > 300 || markers >= 3) return 'complex';
  if (len > 120 || markers >= 2 || words > 25) return 'medium';
  return 'simple';
}

export function minDelayFor(complexity: AiRequestComplexity): number {
  return AI_MIN_DELAY_MS[complexity];
}

/**
 * Rentang timing RAB (owner 2026-10-27): 5 detik untuk hasil pendek,
 * 10 detik untuk hasil besar. Skala dari panjang teks hasil agar
 * "tergantung hasil nanti banyak atau tidak" benar-benar terukur,
 * bukan tebakan dari panjang prompt (prompt pendek bisa menghasilkan
 * tabel RAB 25 baris).
 *
 * Ambang: ≤1.500 karakter → 5.000 ms; ≥8.000 karakter → 10.000 ms;
 * di antaranya linear, dibulatkan ke kelipatan 500 ms.
 */
export const AI_RAB_DELAY_MS = { min: 5000, max: 10000 } as const;

export function rabMinDelayMs(resultText: string): number {
  const len = (resultText || '').length;
  if (len <= 1500) return AI_RAB_DELAY_MS.min;
  if (len >= 8000) return AI_RAB_DELAY_MS.max;
  const ratio = (len - 1500) / (8000 - 1500);
  const ms = AI_RAB_DELAY_MS.min + ratio * (AI_RAB_DELAY_MS.max - AI_RAB_DELAY_MS.min);
  return Math.round(ms / 500) * 500;
}

/** Varian berbasis jumlah item (pemanggil yang sudah tahu itemCount). */
export function rabMinDelayMsForItems(itemCount: number): number {
  if (itemCount <= 5) return AI_RAB_DELAY_MS.min;
  if (itemCount >= 30) return AI_RAB_DELAY_MS.max;
  const ratio = (itemCount - 5) / (30 - 5);
  const ms = AI_RAB_DELAY_MS.min + ratio * (AI_RAB_DELAY_MS.max - AI_RAB_DELAY_MS.min);
  return Math.round(ms / 500) * 500;
}

/**
 * Aktivitas dari teks (untuk status yang sesuai aktivitas sebenarnya):
 * RAB generatif → 'rab', DED/dokumen → 'ded'/'document', sisanya 'chat'.
 * Dipakai jalur co-assistant yang tidak punya intent hasil routing.
 */
export function activityForRequest(text: string): AiActivity {
  const t = (text || '').trim();
  if (GENERATION_RE.test(t)) return 'rab';
  if (ANALYSIS_RE.test(t)) return 'document';
  if (/\bded\b/i.test(t)) return 'ded';
  return 'chat';
}

/** Teks status pemrosesan sesuai aktivitas (spesifikasi §5). */
export function statusTextFor(complexity: AiRequestComplexity, activity: AiActivity = 'chat'): string {
  if (activity === 'rab') return 'EZRAB sedang menyiapkan RAB…';
  if (activity === 'ded' || activity === 'document') return 'EZRAB sedang membaca dokumen…';
  if (complexity === 'complex') return 'EZRAB sedang menganalisis permintaan…';
  return 'EZRAB sedang berpikir…';
}

/** Error pembatalan timing (unmount / permintaan dibatalkan). */
export class AbortedTimingError extends Error {
  constructor() {
    super('Permintaan dibatalkan sebelum hasil ditampilkan.');
    this.name = 'AbortedTiming';
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof Error && (e.name === 'AbortedTiming' || e.name === 'AbortError')) ||
    (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortedTiming')
  );
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedTimingError());
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new AbortedTimingError());
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Menunggu sampai BOTH: hasil provider selesai DAN waktu minimum sejak
 * `startedAt` terpenuhi. Timer TIDAK berjalan berurutan setelah provider:
 * bila provider lebih lambat dari minimum, tidak ada penundaan tambahan;
 * bila lebih cepat, hanya sisa waktunya yang ditunggu.
 *
 * Bila signal dibatalkan selama menunggu, promise ini menolak dengan
 * AbortedTimingError dan hasil provider yang datang belakangan TIDAK
 * pernah disampaikan (pencegah respons basi). Penolakan provider yang
 * datang selama menunggu sudah ditandai handled agar tidak menjadi
 * unhandled rejection sebelum pemanggil sempat mengawait hasilnya.
 */
export async function waitForMinimum<T>(
  startedAt: number,
  minDelayMs: number,
  result: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  // Tandai handled sejak awal: bila provider menolak saat timer masih
  // berjalan, penolakan itu sudah punya handler (cabang noop ini) dan
  // tetap diteruskan ke pemanggil lewat `return result` di bawah.
  result.then(undefined, () => {});
  const remaining = minDelayMs - (Date.now() - startedAt);
  if (remaining <= 0) return result;
  await delay(remaining, signal);
  return result;
}

/**
 * Varian RAB dari waitForMinimum: minimum TIDAK bisa ditentukan di awal
 * karena bergantung pada besarnya hasil. Alurnya: tunggu hasil provider
 * dulu (paralel dengan timer sejak kirim), hitung minimum dari teks
 * hasil lewat `rabMinDelayMs`, lalu tunggu hanya sisanya. Provider
 * lebih lambat dari minimum → tidak ada delay tambahan, sama seperti
 * waitForMinimum. Provider menolak → error diteruskan setelah sisa
 * minimum RAB terpendek (5 detik), konsisten dengan gerbang error
 * sebelumnya; abort selama menunggu → AbortedTimingError segera.
 */
export async function waitForRabMinimum<T>(
  startedAt: number,
  result: Promise<T>,
  signal?: AbortSignal,
  textOf?: (value: T) => string
): Promise<T> {
  result.then(undefined, () => {});
  if (signal?.aborted) throw new AbortedTimingError();
  let value: T;
  try {
    value = await new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new AbortedTimingError());
      signal?.addEventListener('abort', onAbort, { once: true });
      result.then(
        (v) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(v);
        },
        (e) => {
          signal?.removeEventListener('abort', onAbort);
          reject(e);
        }
      );
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    // Error provider: tetap lewat gerbang minimum terpendek, lalu
    // diteruskan apa adanya (bukan dibungkus jadi sukses).
    const remaining = AI_RAB_DELAY_MS.min - (Date.now() - startedAt);
    if (remaining > 0) await delay(remaining, signal);
    throw e;
  }
  const minDelayMs = rabMinDelayMs(textOf ? textOf(value) : '');
  const remaining = minDelayMs - (Date.now() - startedAt);
  if (remaining > 0) await delay(remaining, signal);
  return value;
}

/**
 * Penjaga request terbaru (anti race condition / respons basi): setiap
 * pengiriman mengambil id baru; hasil hanya boleh diterapkan bila id-nya
 * masih yang terbaru. Dipakai berdampingan dengan guard `busy` di chat
 * (yang mencegah double-submit) untuk menutup celah retry/injeksi.
 */
export function createRequestCoordinator(): {
  next: () => number;
  isLatest: (id: number) => boolean;
} {
  let latest = 0;
  return {
    next(): number {
      latest += 1;
      return latest;
    },
    isLatest(id: number): boolean {
      return id === latest;
    },
  };
}

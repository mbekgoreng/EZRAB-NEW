/**
 * KONTRAK NAVIGASI AI TERPUSAT — 2026-10-16
 *
 * Seluruh entry point AI di EZRAB memakai tiga tujuan kanonis:
 * - `chat_agent`  → Chat Agent (menu `ezrab-ai`, `EzrabAiView`)
 * - `ded_rab_ai`  → DED → RAB AI (menu `ded-ai`, `DedAiEstimateView`)
 * - `document_ai` → Dokumen AI (menu `dokumen-ai`, `DokumenAiView`)
 *
 * Menggunakan route dan komponen yang sudah ada (`src/routing/routes.ts`).
 * Konteks opsional (projectId, rabId, qtoId, documentId, sourceMenu,
 * initialPrompt) diteruskan lewat entry transient sekali-pakai yang
 * dikonsumsi view tujuan saat mount — tidak menduplikasi state percakapan
 * dan tidak menaruh prompt panjang di URL.
 */
import { navigateTo, routeForMenu } from '../routing/routes';

export type AiDestination = 'chat_agent' | 'ded_rab_ai' | 'document_ai';

export interface AiEntryContext {
  projectId?: string | null;
  rabId?: string;
  qtoId?: string;
  documentId?: string;
  /** Menu asal tombol ditekan (mis. 'rab-estimasi', 'proyek'). */
  sourceMenu?: string;
  /** Label konteks yang ramah dibaca (mis. nama item RAB). */
  contextLabel?: string;
  /** Prompt awal — untuk chat_agent: 'prefill' (default) mengisi kotak input
   *  agar pengguna meninjau sebelum mengirim; 'autosend' langsung mengirim.
   *  Untuk ded_rab_ai dipakai sebagai deskripsi awal sesi (selalu prefill). */
  initialPrompt?: string;
  /**
   * 'prefill' (default): prompt dimasukkan ke kotak input, TIDAK dikirim otomatis.
   * 'autosend': prompt langsung dikirim — hanya untuk entry point yang secara
   * eksplisit menyatakan analisis langsung dijalankan dan tidak bermutasi
   * tanpa konfirmasi (terdokumentasi di pemanggil).
   */
  sendMode?: 'prefill' | 'autosend';
}

const DESTINATION_MENU: Record<AiDestination, 'ezrab-ai' | 'ded-ai' | 'dokumen-ai'> = {
  chat_agent: 'ezrab-ai',
  ded_rab_ai: 'ded-ai',
  document_ai: 'dokumen-ai',
};

/** Menu workspace untuk sebuah tujuan AI. */
export function aiMenuFor(dest: AiDestination): 'ezrab-ai' | 'ded-ai' | 'dokumen-ai' {
  return DESTINATION_MENU[dest];
}

/** Route (URL) untuk sebuah tujuan AI — memakai route yang sudah ada. */
export function aiRouteFor(dest: AiDestination, projectId?: string | null): string {
  return routeForMenu(DESTINATION_MENU[dest], projectId ?? null);
}

interface PendingAiEntry {
  dest: AiDestination;
  ctx: AiEntryContext;
  createdAt: number;
}

/** Entry transient sekali-pakai; dibersihkan saat dikonsumsi. */
let pendingEntry: PendingAiEntry | null = null;

/**
 * Daftarkan entry AI. Dipanggil SEBELUM navigasi oleh tombol entry point.
 * Tidak melakukan navigasi sendiri — gunakan `goToAi` untuk paket lengkap.
 * Menyiarkan 'ezrab:ai-entry' agar view tujuan yang SUDAH ter-mount
 * (tanpa navigasi ulang) juga dapat mengonsumsi entry.
 */
export function requestAiEntry(dest: AiDestination, ctx: AiEntryContext = {}): void {
  pendingEntry = { dest, ctx, createdAt: Date.now() };
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('ezrab:ai-entry'));
    }
  } catch {
    /* non-DOM environment (tes) — abaikan */
  }
}

/**
 * Ambil dan hapus entry yang tertunda untuk tujuan ini.
 * Mengembalikan null bila tidak ada entry atau entry untuk tujuan lain.
 * Entry kedaluwarsa setelah 60 detik agar prompt basi tidak terkirim diam-diam.
 */
export function consumePendingAiEntry(dest: AiDestination): AiEntryContext | null {
  if (!pendingEntry || pendingEntry.dest !== dest) return null;
  if (Date.now() - pendingEntry.createdAt > 60_000) {
    pendingEntry = null;
    return null;
  }
  const ctx = pendingEntry.ctx;
  pendingEntry = null;
  return ctx;
}

/**
 * Navigasi ke tujuan AI kanonis dengan konteks opsional.
 * Menggantikan pola lama `setActiveMenu('magic-ai')` / `navigateTo(...magic-ai)`.
 */
export function goToAi(dest: AiDestination, ctx: AiEntryContext = {}): void {
  requestAiEntry(dest, ctx);
  navigateTo(aiRouteFor(dest, ctx.projectId ?? null));
}

/** Untuk tes: intip entry tanpa mengonsumsinya. */
export function peekPendingAiEntry(): PendingAiEntry | null {
  return pendingEntry;
}

/** Untuk tes: reset state modul. */
export function clearPendingAiEntry(): void {
  pendingEntry = null;
}

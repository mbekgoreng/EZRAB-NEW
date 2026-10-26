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

export type AiDestination = 'chat_agent' | 'ded_rab_ai' | 'document_ai' | 'design_workspace';

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

const DESTINATION_MENU: Record<AiDestination, 'ezrab-ai' | 'ded-ai' | 'dokumen-ai' | 'desain-rab'> = {
  chat_agent: 'ezrab-ai',
  ded_rab_ai: 'ded-ai',
  document_ai: 'dokumen-ai',
  // Chat-to-RAB Workspace (Fase 3): halaman penuh desain → QTO → RAB.
  design_workspace: 'desain-rab',
};

/** Menu workspace untuk sebuah tujuan AI. */
export function aiMenuFor(dest: AiDestination): 'ezrab-ai' | 'ded-ai' | 'dokumen-ai' | 'desain-rab' {
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
 *
 * Celah transient (perbaikan final): bila `clearOnMismatch` true (dipakai
 * jalur MOUNT view tujuan — bukan jalur event view yang sudah ter-mount),
 * entry untuk tujuan lain ikut dibersihkan beserta entry mode pasangannya
 * (keduanya dititipkan bersama oleh openEzrabAI untuk mode chat). Tanpa ini,
 * prefill basi bisa muncul kembali saat pengguna kembali ke chat <60 detik
 * setelah pindah ke permukaan AI lain. Jalur event WAJIB memakai default
 * false: view yang sudah ter-mount tidak boleh menghapus entry permukaan
 * lain (mis. listener chat tidak boleh menghapus entry ded dari switcher
 * sebelum DedAiEstimateView ter-mount).
 */
export function consumePendingAiEntry(
  dest: AiDestination,
  opts?: { clearOnMismatch?: boolean },
): AiEntryContext | null {
  if (!pendingEntry) return null;
  if (pendingEntry.dest !== dest) {
    if (opts?.clearOnMismatch) {
      pendingEntry = null;
      pendingEzrabAiEntry = null;
    }
    return null;
  }
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

/* =========================================================================
 * FASE 1 — UNIFIKASI AI (2026-10-26): satu resolver untuk semua pintu
 * masuk AI. API lama di atas tetap utuh; blok ini hanya menambah.
 *
 * Mode kanonis (permukaan yang dilihat pengguna):
 * - 'chat'          → Ezrab Chat AI (menu ezrab-ai)
 * - 'rab-generator' → Generator RAB — BUKAN panel baru: draf RAB langsung
 *   di chat (universal direct RAB) dengan banner + prefill prompt.
 * - 'ded'           → Analisis DED (menu ded-ai, DedAiEstimateView)
 * - 'document'      → Dokumen AI (menu dokumen-ai, DokumenAiView)
 *
 * Dua permukaan DED TIDAK digabung di fase ini: route lama /app/magic-ai
 * dan /app/ai tetap merender MagicAiSuperView seperti sekarang (lihat
 * routes.ts); resolver ini mengarahkan pintu 'ded' ke ded-ai.
 *
 * Konteks TIDAK disimpan utuh di URL — hanya entry transient sekali-pakai
 * (pola yang sama dengan requestAiEntry) + event 'ezrab:ai-entry'.
 * ========================================================================= */

export type EzrabAiMode = 'chat' | 'rab-generator' | 'ded' | 'document';

export type EzrabAiEntrySource =
  | 'dashboard'
  | 'estimator'
  | 'inspector'
  | 'create-project'
  | 'copilot'
  | 'mobile'
  | 'sidebar'
  | 'other';

/** Konteks entry unifikasi — hanya penanda ringan, bukan objek utuh. */
export interface EzrabAiEntryContext {
  mode: EzrabAiMode;
  projectId?: string | null;
  projectName?: string;
  /** Prompt awal (prefill, bukan autosend — kecuali pemanggil lama yang
   *  eksplisit memakai sendMode autosend lewat API lama). */
  prompt?: string;
  /** Id item RAB yang sedang diaudit dari inspector (bukan objek item). */
  rabItemId?: string;
  documentId?: string;
  /** Referensi DED (mis. nama file/label) untuk mode 'ded'. */
  dedRef?: string;
  source?: EzrabAiEntrySource;
}

/** Tujuan klasik untuk setiap mode unifikasi. */
export const EZRAB_AI_MODE_DESTINATION: Record<EzrabAiMode, AiDestination> = {
  chat: 'chat_agent',
  'rab-generator': 'chat_agent',
  ded: 'ded_rab_ai',
  document: 'document_ai',
};

/** Menu workspace untuk setiap mode unifikasi. */
export const EZRAB_AI_MODE_MENU: Record<EzrabAiMode, 'ezrab-ai' | 'ded-ai' | 'dokumen-ai'> = {
  chat: 'ezrab-ai',
  'rab-generator': 'ezrab-ai',
  ded: 'ded-ai',
  document: 'dokumen-ai',
};

export function ezrabAiDestinationFor(mode: EzrabAiMode): AiDestination {
  return EZRAB_AI_MODE_DESTINATION[mode];
}

export function ezrabAiMenuFor(mode: EzrabAiMode): 'ezrab-ai' | 'ded-ai' | 'dokumen-ai' {
  return EZRAB_AI_MODE_MENU[mode];
}

interface PendingEzrabAiEntry {
  mode: EzrabAiMode;
  ctx: EzrabAiEntryContext;
  createdAt: number;
}

/**
 * Entry mode khusus permukaan chat (chat / rab-generator), dikonsumsi
 * EzrabAiView untuk switcher + banner konteks. Mode ded/document tidak
 * menitipkan entry ini — konteksnya dibawa entry klasik (ded_rab_ai /
 * document_ai) agar tidak tertukar dengan chat.
 */
let pendingEzrabAiEntry: PendingEzrabAiEntry | null = null;

export function consumePendingEzrabAiEntry(): EzrabAiEntryContext | null {
  if (!pendingEzrabAiEntry) return null;
  if (Date.now() - pendingEzrabAiEntry.createdAt > 60_000) {
    pendingEzrabAiEntry = null;
    return null;
  }
  const ctx = pendingEzrabAiEntry.ctx;
  pendingEzrabAiEntry = null;
  return ctx;
}

/**
 * Sisa TTL (ms) entry mode dari createdAt-nya — dipakai banner chat agar
 * konteks yang ditampilkan ikut hilang saat entry kedaluwarsa, bukan
 * menempel selamanya di view yang sudah ter-mount.
 */
export function ezrabAiEntryRemainingMs(createdAt: number, nowMs?: number): number {
  return Math.max(0, 60_000 - ((nowMs ?? Date.now()) - createdAt));
}

/** Untuk tes: intip entry mode tanpa mengonsumsinya. */
export function peekPendingEzrabAiEntry(): PendingEzrabAiEntry | null {
  return pendingEzrabAiEntry;
}

/** Untuk tes: reset state entry mode. */
export function clearPendingEzrabAiEntry(): void {
  pendingEzrabAiEntry = null;
}

/**
 * RESOLVER TUNGGAL pintu masuk AI (Fase 1).
 * Memetakan mode → tujuan + menu, menitipkan konteks transient, lalu
 * bernavigasi lewat route yang sudah ada. Resolver ini memanggil helper
 * requestAiEntry/navigateTo — bukan dirinya sendiri (tidak ada loop).
 * Prompt selalu prefill: pengiriman otomatis hanya lewat API lama yang
 * eksplisit (sendMode autosend), bukan lewat resolver ini.
 */
export function openEzrabAI(ctx: EzrabAiEntryContext): void {
  const dest = ezrabAiDestinationFor(ctx.mode);
  const classic: AiEntryContext = {
    projectId: ctx.projectId ?? null,
    // rabItemId (inspector) dipetakan ke rabId klasik agar konteks item
    // tidak hilang saat pindah permukaan (mis. switcher chat → ded).
    rabId: ctx.rabItemId,
    documentId: ctx.documentId,
    initialPrompt: ctx.prompt,
    sourceMenu: ctx.source,
    contextLabel: ctx.projectName ?? ctx.dedRef,
  };
  // Titipkan entry mode SEBELUM event disiarkan, agar view chat yang
  // SUDAH ter-mount mengonsumsi mode + konteks dalam event yang sama.
  if (ctx.mode === 'chat' || ctx.mode === 'rab-generator') {
    pendingEzrabAiEntry = { mode: ctx.mode, ctx, createdAt: Date.now() };
  }
  requestAiEntry(dest, classic);
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

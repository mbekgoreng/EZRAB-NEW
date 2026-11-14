/**
 * spreadsheetHandoff — P0 FULL REPAIR (2026-11-13).
 *
 * Menyambungkan wizard spreadsheet ("Rancang Pekerjaan via Magic AI") ke
 * pipeline estimasi KANONIS Chat AI — kuesioner → structuredSpec →
 * specChain → buildUniversalDraft → pratinjau → transfer (G1) — lewat
 * pola handoff yang SUDAH ADA (`openEzrabAI`, mode 'rab-generator',
 * entry transient sekali-pakai TTL 60 dtk di `aiNavigation.ts`).
 *
 * NOL duplikasi logika: modul ini HANYA membangun + memvalidasi payload
 * handoff dan memetakannya ke entry kanonis. Tidak ada pipeline AI
 * kedua, tidak ada engine finansial/QTO kedua, tidak ada exporter baru.
 *
 * Mengapa handoff (bukan panggilan LLM mentah di modal)? Audit
 * Autonomous Estimation membuktikan modal adalah satu panggilan LLM
 * mentah untuk SATU item yang melewatkan semua modul deterministik —
 * termasuk gerbang resolver harga (konflik B-05: harga model verbatim
 * dilabeli PRICE_RESOLVED tanpa priceSourceKind/ahspCode). Handoff
 * mengembalikan estimasi ke jalur yang memakai resolver itu.
 *
 * Identitas yang dipertahankan (bukan dibuat baru):
 * - projectId — divalidasi cocok dengan proyek aktif; lintas-proyek
 *   DITOLAK (CROSS_PROJECT). Tanpa proyek aktif (null == null) handoff
 *   tetap jalan ke percakapan global Chat AI, tanpa konteks/draft.
 * - conversationId — percakapan AKTIF proyek (dibaca read-only lewat
 *   `getActiveConversationId`, tanpa membuat percakapan baru). Chat AI
 *   memulihkan percakapan aktif proyek yang sama saat mount
 *   (`getOrCreateActiveConversation(storeProjectId)` di view.tsx),
 *   sehingga handoff TIDAK PERNAH memulai percakapan bersaing; id di
 *   payload adalah bukti/verifikasi, bukan instruksi pembuatan.
 * - draft — identitas draft tersimpan proyek (draftId + baseVersion +
 *   updatedAt, dibaca read-only lewat `peekPersistedDraft`). Chat AI
 *   melanjutkan draft yang SAMA (restore per proyek di view.tsx).
 *   BUKAN approval: binding G1 (`TransferApprovalBinding`) sengaja
 *   TIDAK dibawa — binding dibuat segar di pratinjau Chat AI
 *   berikutnya, sesuai desain G1 (approval tidak boleh ditempa lintas
 *   permukaan; binding hidup di memori sesi view.tsx saja).
 * - spesifikasi + item proyek — prompt mentah user (prefill di Chat AI,
 *   dikirim hanya sesudah user meninjau) + ringkasan konteks G3
 *   (maks 8 item, maks 2.000 karakter, pemotongan berpenanda) sebagai
 *   data terpisah. Pipeline kanonis membangun konteksnya sendiri dari
 *   store proyek (projectSnapshot + projectRabItems); ringkasan di
 *   payload adalah bukti konteks, BUKAN pengganti grounding itu.
 *
 * Semua helper di sini MURNI (input diinjeksikan pemanggil) agar dapat
 * diuji tanpa store/browser; satu-satunya efek samping adalah
 * `executeSpreadsheetHandoff` (mendaftarkan entry + navigasi).
 */
import { openEzrabAI, type EzrabAiEntryContext } from '../aiNavigation';

/* =========================================================================
 * Batas konteks — CERMIN batas G3 di SmartAddWorkItemModal.tsx.
 * Cermin (bukan import) agar modul ini tidak mengimpor komponen React
 * (menghindari siklus import modal ↔ handoff). Kesetaraan dengan
 * konstanta G3 dijaga tes drift di p0SpreadsheetHandoff.test.ts —
 * bila G3 berubah, tes itu gagal dan cermin ini wajib ikut berubah.
 * ========================================================================= */

/** Maks item relevan di ringkasan konteks (cermin G3). */
export const SPREADSHEET_HANDOFF_MAX_RELEVANT_ITEMS = 8;
/** Maks total karakter ringkasan konteks (cermin G3). */
export const SPREADSHEET_HANDOFF_MAX_CHARS = 2000;
/** Penanda pemotongan (cermin G3). */
export const SPREADSHEET_HANDOFF_TRUNCATION_MARKER =
  '…[dipotong demi batas konteks — isi lengkap tetap tersimpan di aplikasi]';

/** Jendela dedupe klaim handoff: klik ganda dalam 5 detik = satu handoff. */
export const SPREADSHEET_HANDOFF_GUARD_TTL_MS = 5_000;

/** Referensi draft tersimpan proyek — identitas saja, bukan isi draft. */
export interface SpreadsheetHandoffDraftRef {
  draftId: string;
  projectId: string;
  /** PersistedDraftRecord.baseVersion saat handoff dibuat. */
  version: number;
  updatedAt: string;
  /** Percakapan pemilik draft (bisa berbeda dari percakapan aktif). */
  conversationId: string | null;
}

/** Payload handoff spreadsheet → Chat AI (JSON murni, sekali-pakai). */
export interface SpreadsheetHandoffPayload {
  source: 'spreadsheet';
  mode: 'rab-generator';
  projectId: string | null;
  projectName: string | null;
  /** Percakapan aktif proyek saat handoff (null = belum ada). */
  conversationId: string | null;
  /** Permintaan mentah user — prefill di Chat AI, bukan autosend. */
  prompt: string;
  /** Ringkasan konteks G3 (terbatas + pemotongan berpenanda). */
  projectContext: string | null;
  projectItemCount: number;
  draft: SpreadsheetHandoffDraftRef | null;
  createdAt: number;
}

export interface BuildSpreadsheetHandoffInput {
  prompt: string;
  /** Proyek yang hendak di-handoff (dari prop modal). */
  projectId: string | null;
  /** Proyek aktif saat ini (target validasi — harus sama). */
  activeProjectId: string | null;
  projectName?: string | null;
  conversationId?: string | null;
  /** Ringkasan konteks yang SUDAH dibangun builder G3 (terbatas). */
  projectContext?: string | null;
  projectItemCount: number;
  draft?: SpreadsheetHandoffDraftRef | null;
  now?: number;
}

export type BuildSpreadsheetHandoffResult =
  | { ok: true; payload: SpreadsheetHandoffPayload }
  | {
      ok: false;
      reason: 'EMPTY_PROMPT' | 'CROSS_PROJECT';
      message: string;
    };

/**
 * Potong ringkasan konteks ke batas G3 dengan penanda (pertahanan
 * berlapis — builder G3 sudah membatasi; pemotongan di sini hanya
 * berjalan bila pemanggil memasok konteks dari jalur lain).
 */
export function boundSpreadsheetHandoffContext(context: string | null): string | null {
  if (!context) return context;
  if (context.length <= SPREADSHEET_HANDOFF_MAX_CHARS) return context;
  return `${context.slice(0, SPREADSHEET_HANDOFF_MAX_CHARS)}\n${SPREADSHEET_HANDOFF_TRUNCATION_MARKER}`;
}

/**
 * Bangun payload handoff tervalidasi. Urutan cek: prompt kosong →
 * lintas-proyek (termasuk draft dari proyek lain). Murni: tidak
 * membaca store, tidak menulis apa pun.
 */
export function buildSpreadsheetHandoffPayload(
  input: BuildSpreadsheetHandoffInput,
): BuildSpreadsheetHandoffResult {
  const prompt = (input.prompt ?? '').trim();
  if (!prompt) {
    return {
      ok: false,
      reason: 'EMPTY_PROMPT',
      message: 'Tuliskan kebutuhan pekerjaan yang ingin diestimasi AI.',
    };
  }
  const projectId = input.projectId ?? null;
  const activeProjectId = input.activeProjectId ?? null;
  if (projectId !== activeProjectId) {
    return {
      ok: false,
      reason: 'CROSS_PROJECT',
      message:
        'Proyek aktif sudah berganti sejak modal dibuka — handoff DIBATALKAN agar estimasi tidak masuk ke proyek yang salah. Tutup modal dan coba lagi dari proyek yang benar.',
    };
  }
  const draft = input.draft ?? null;
  if (draft && draft.projectId !== projectId) {
    return {
      ok: false,
      reason: 'CROSS_PROJECT',
      message:
        'Draft yang akan dilanjutkan berasal dari proyek lain — handoff DIBATALKAN agar draft tidak tercampur antar proyek.',
    };
  }
  return {
    ok: true,
    payload: {
      source: 'spreadsheet',
      mode: 'rab-generator',
      projectId,
      projectName: (input.projectName ?? null) || null,
      conversationId: input.conversationId ?? null,
      prompt,
      projectContext: boundSpreadsheetHandoffContext(input.projectContext ?? null),
      projectItemCount: input.projectItemCount ?? 0,
      draft,
      createdAt: input.now ?? Date.now(),
    },
  };
}

/* =========================================================================
 * Penjaga eksekusi tunggal — satu klik = satu handoff.
 * Klaim berbasis kunci (projectId::prompt) + TTL: klik ganda dalam
 * jendela TTL ditolak; klaim kedaluwarsa otomatis sehingga handoff
 * sah berikutnya (mis. sesudah kembali dari Chat AI) tidak terblokir.
 * `release` dipakai jalur gagal (validasi/navigasi gagal) agar
 * percobaan ulang langsung dimungkinkan tanpa menunggu TTL.
 * ========================================================================= */

export interface SpreadsheetHandoffGuard {
  claim: (key: string, now?: number) => boolean;
  release: (key: string) => void;
}

export function createSpreadsheetHandoffGuard(
  ttlMs: number = SPREADSHEET_HANDOFF_GUARD_TTL_MS,
): SpreadsheetHandoffGuard {
  const claimed = new Map<string, number>();
  return {
    claim(key: string, now: number = Date.now()): boolean {
      const prev = claimed.get(key);
      if (prev !== undefined && now - prev < ttlMs) return false;
      claimed.set(key, now);
      return true;
    },
    release(key: string): void {
      claimed.delete(key);
    },
  };
}

/** Kunci dedupe handoff: proyek + permintaan (normalisasi spasi). */
export function spreadsheetHandoffKey(projectId: string | null, prompt: string): string {
  return `${projectId ?? ''}::${prompt.trim().replace(/\s+/g, ' ')}`;
}

/**
 * Jalankan handoff: petakan payload ke entry kanonis `openEzrabAI`
 * (mode 'rab-generator' → Chat AI, prompt prefill — TIDAK autosend,
 * agar tidak ada request berbayar tanpa tinjauan user). `openFn`
 * diinjeksikan untuk tes; default-nya resolver asli.
 */
export function executeSpreadsheetHandoff(
  payload: SpreadsheetHandoffPayload,
  openFn: (ctx: EzrabAiEntryContext) => void = openEzrabAI,
): void {
  openFn({
    mode: 'rab-generator',
    projectId: payload.projectId,
    projectName: payload.projectName ?? undefined,
    prompt: payload.prompt,
    source: 'estimator',
    conversationId: payload.conversationId,
    projectContext: payload.projectContext,
    projectItemCount: payload.projectItemCount,
    draftId: payload.draft?.draftId ?? null,
    draftVersion: payload.draft?.version ?? null,
    draftUpdatedAt: payload.draft?.updatedAt ?? null,
    handoffSource: 'spreadsheet',
  });
}

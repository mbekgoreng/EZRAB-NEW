/**
 * B5-3 (Release Readiness Tahap 2, keputusan owner 2026-11-23 / D-11):
 * proyek SEMENTARA otomatis untuk draft RAB jalur chat.
 *
 * Aturan owner: pengguna boleh mulai membuat RAB tanpa proyek aktif
 * (tanpa jalan buntu). Saat draft RAB PERTAMA berhasil dibuat lewat
 * jalur chat-draft, EZRAB otomatis membuat proyek sementara, menjadikannya
 * aktif, dan mengaitkan draft ke sana. TIDAK ada proyek yang dibuat hanya
 * karena pengguna membuka halaman. Proyek sementara adalah record Project
 * biasa (dibuat lewat createProject yang sama) — dapat diberi nama +
 * dilengkapi kemudian lewat alur proyek biasa (EditProjectModal /
 * updateProject, tanpa pengecualian), lalu menjadi proyek biasa.
 *
 * Mekanisme (pemisahan yang disengaja):
 * - Registry (actionRegistry.universalResultFor — corong commit draft
 *   universal jalur chat; directRabTableResult — corong commit draft
 *   direct, hook kedua per keputusan owner 2026-11-23 "Cakup juga jalur
 *   direct-RAB"; dan toolRegistry.executeTool — corong commit draft
 *   tool-registry, hook F-ISO-4 per keputusan owner 2026-11-23)
 *   memanggil ensurer yang terdaftar di sini SAAT draft berhasil
 *   dibangun tanpa projectId. Registry tidak tahu cara membuat proyek —
 *   ia hanya meminta.
 * - View chat (view.tsx) mendaftarkan ensurer yang memanggil
 *   createProject konteks + mem-persist draft + menyiapkan migrasi
 *   percakapan. Tanpa view yang mendaftarkan (tes, jalur lain), tidak
 *   ada yang terjadi — draft berperilaku seperti sebelumnya.
 *
 * BUKAN jalur DED: auto-create DED (ded-ai-estimate/view.tsx,
 * creationMethod 'ai-ded') adalah jalur berbeda dan tidak disentuh.
 */
import type { UniversalDraft } from './universalRab';

/**
 * Penanda nama sementara. Nama proyek sementara SELALU membawa "(Sementara)"
 * agar terlihat jelas di Daftar Proyek; hilang sendiri saat pengguna
 * mengganti nama lewat alur biasa.
 */
export const TEMP_PROJECT_NAME_SUFFIX = '(Sementara)';

/** Nama fallback bila draft tidak punya judul yang bermakna. */
export const TEMP_PROJECT_FALLBACK_NAME = 'Proyek RAB (Sementara)';

/**
 * creationMethod proyek sementara. Sejajar dengan 'ai-ded' jalur DED
 * (ded-ai-estimate/view.tsx) — dicatat sebagai provenance, BUKAN sebagai
 * status: tidak ada perilaku yang membedakan proyek ini dari proyek biasa
 * berdasarkan field ini.
 */
export const TEMP_PROJECT_CREATION_METHOD = 'chat-ai';

/**
 * Nama default proyek sementara dari judul draft.
 * Judul draft adalah label cakupan ("Jalan & Perkerasan", "Gudang") —
 * contoh hasil: "RAB Jalan & Perkerasan (Sementara)".
 */
export function tempProjectNameForDraft(draftTitle: string | null | undefined): string {
  const title = (draftTitle ?? '').trim();
  if (!title) return TEMP_PROJECT_FALLBACK_NAME;
  return `RAB ${title} ${TEMP_PROJECT_NAME_SUFFIX}`;
}

/** Deskripsi proyek sementara — transparan soal asal-usulnya. */
export function tempProjectDescriptionForDraft(draftTitle: string | null | undefined): string {
  const title = (draftTitle ?? '').trim();
  return title
    ? `Dibuat otomatis dari Chat AI saat draft RAB "${title}" pertama dibuat — beri nama dan lengkapi datanya lewat menu Proyek.`
    : 'Dibuat otomatis dari Chat AI saat draft RAB pertama dibuat — beri nama dan lengkapi datanya lewat menu Proyek.';
}

/** Hasil ensurer: proyek yang kini mengikat draft. */
export interface EnsuredDraftProject {
  id: string;
  name: string;
  /**
   * true = proyek BARU dibuat untuk draft ini (pesan draft boleh
   * memberitahu pengguna); false = proyek yang SUDAH aktif dipakai
   * (mis. pengguna membuat proyek di tengah intake — tanpa pembuatan
   * baru, tanpa pemberitahuan).
   */
  created: boolean;
}

/**
 * Input minimal ensurer: hanya judul draft yang dibutuhkan untuk
 * penamaan proyek sementara. Draft universal (UniversalDraft) membawa
 * judul + record yang dapat dipersistenkan; draft direct hanya membawa
 * judul tampilan (DirectRabResult.displayLabel, mis. "Rumah Type 36") —
 * tidak ada record UniversalDraft untuk disimpan (draft direct hidup di
 * lastDirectRab in-memory; riwayat chatnya dipersistenkan lewat
 * persistMessage + migrasi percakapan seperti biasa).
 */
export interface DraftProjectRequest {
  title: string | null | undefined;
}

/**
 * Penjaga tipe: hanya UniversalDraft yang punya record saveDraft.
 * DraftProjectRequest (jalur direct) hanya membawa judul.
 */
export function isUniversalDraft(draft: UniversalDraft | DraftProjectRequest): draft is UniversalDraft {
  return 'parts' in draft && 'id' in draft;
}

/**
 * Ensurer proyek-draft: dipanggil registry saat draft universal ATAU
 * direct berhasil dibuat tanpa proyek. Implementasi (view) mengembalikan
 * proyek aktif yang sudah ada bila ada, atau membuat proyek sementara
 * baru. Mengembalikan null bila proyek tidak dapat dipastikan (kegagalan
 * pembuatan TIDAK PERNAH menggagalkan draft — draft tetap tampil tanpa
 * ikatan proyek, seperti perilaku sebelum B5-3).
 *
 * S3-C (F4, 2026-11-23) — `preferredProjectId`: petunjuk scope opsional
 * dari registry (projectId request yang membangun draft). Bila diisi,
 * ensurer WAJIB mengikat ke proyek itu (bila masih ada) — BUKAN ke
 * proyek live, yang bisa sudah berganti selama await provider (S7:
 * draft dari konteks A diikat ke B). Bila proyek petunjuk sudah tidak
 * ada → null (fail-closed). Tanpa petunjuk → perilaku B5-3 persis
 * (live, atau buat sementara). Pemanggil registry yang tidak memberi
 * petunjuk (corong chat/direct sinkron — tidak ada await di antara
 * kirim dan commit) tidak berubah perilakunya.
 */
export type DraftProjectEnsurer = (
  draft: UniversalDraft | DraftProjectRequest,
  preferredProjectId?: string | null,
) => EnsuredDraftProject | null;

let draftProjectEnsurer: DraftProjectEnsurer | null = null;

/** Daftarkan ensurer (view chat saat mount) atau lepas (null, saat unmount). */
export function setDraftProjectEnsurer(ensurer: DraftProjectEnsurer | null): void {
  draftProjectEnsurer = ensurer;
}

/** Baca ensurer terdaftar (registry). */
export function getDraftProjectEnsurer(): DraftProjectEnsurer | null {
  return draftProjectEnsurer;
}

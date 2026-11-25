/**
 * B5-3 (Release Readiness Tahap 2, keputusan owner 2026-11-23 / D-11)
 * + §4.5 (direktif owner 2026-11-24, P1 — MENGGANTIKAN SEBAGIAN B5-3):
 * pengikatan draft RAB jalur chat ke proyek YANG SUDAH ADA.
 *
 * Aturan owner (§4.5): pengguna boleh mulai membuat RAB tanpa proyek
 * aktif (tanpa jalan buntu) — draft BUKAN proyek. Saat draft RAB
 * berhasil dibuat lewat jalur chat-draft TANPA proyek aktif, draft
 * tetap TAK TERIKAT; TIDAK ADA proyek yang dibuat secara implisit.
 * Pembuatan proyek hanya terjadi lewat konfirmasi eksplisit user
 * (aliran push/finalize §6: pratinjau transfer tak-terikat → tombol
 * "Buat proyek & konfirmasi transfer") atau pembuatan manual. Proyek
 * yang dibuat lewat konfirmasi itu adalah record Project biasa
 * (dibuat lewat createProject yang sama, creationMethod 'chat-ai') —
 * dapat diberi nama + dilengkapi kemudian lewat alur proyek biasa
 * (EditProjectModal / updateProject, tanpa pengecualian), lalu menjadi
 * proyek biasa.
 *
 * Mekanisme (pemisahan yang disengaja):
 * - Registry (actionRegistry.universalResultFor — corong commit draft
 *   universal jalur chat; directRabTableResult — corong commit draft
 *   direct, hook kedua per keputusan owner 2026-11-23 "Cakup juga jalur
 *   direct-RAB"; dan toolRegistry.executeTool — corong commit draft
 *   tool-registry, hook F-ISO-4 per keputusan owner 2026-11-23)
 *   memanggil ensurer yang terdaftar di sini SAAT draft berhasil
 *   dibangun tanpa projectId. Registry tidak tahu cara membuat proyek —
 *   ia hanya meminta pengikatan ke proyek yang SUDAH ADA.
 * - View chat (view.tsx) mendaftarkan ensurer yang mengembalikan
 *   proyek aktif yang sudah ada (bila ada) + mem-persist draft ke
 *   proyek itu. Tanpa proyek aktif → null (draft tak terikat).
 *   Tanpa view yang mendaftarkan (tes, jalur lain), tidak ada yang
 *   terjadi — draft berperilaku seperti sebelumnya.
 *
 * BUKAN jalur DED: auto-create DED (ded-ai-estimate/view.tsx,
 * creationMethod 'ai-ded') adalah jalur berbeda dan tidak disentuh —
 * klik Finalisasi DED SENDIRI adalah konfirmasi eksplisitnya.
 */
import type { UniversalDraft } from './universalRab';

/**
 * Penanda nama sementara. Nama proyek yang dibuat lewat konfirmasi
 * push/finalize §4.5 SELALU membawa "(Sementara)" agar terlihat jelas
 * di Daftar Proyek; hilang sendiri saat pengguna mengganti nama lewat
 * alur biasa.
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
    ? `Dibuat dari Chat AI saat draft RAB "${title}" ditransfer — beri nama dan lengkapi datanya lewat menu Proyek.`
    : 'Dibuat dari Chat AI saat draft RAB pertama ditransfer — beri nama dan lengkapi datanya lewat menu Proyek.';
}

/** Hasil ensurer: proyek yang kini mengikat draft. */
export interface EnsuredDraftProject {
  id: string;
  name: string;
  /**
   * §4.5: SELALU false — ensurer tidak pernah membuat proyek.
   * Field dipertahankan untuk kompatibilitas pemanggil (registry
   * membaca `ensured.id` saja; `created` tidak lagi dipakai untuk
   * pesan "proyek dibuat otomatis").
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
 * direct berhasil dibuat tanpa proyek. Implementasi (view)
 * mengembalikan proyek aktif yang sudah ada bila ada — DAN TIDAK
 * PERNAH MEMBUAT PROYEK (§4.5, direktif owner 2026-11-24).
 * Mengembalikan null bila tidak ada proyek aktif (draft tetap tak
 * terikat — kegagalan pengikatan TIDAK PERNAH menggagalkan draft,
 * draft tetap tampil tanpa ikatan proyek).
 *
 * S3-C (F4, 2026-11-23) — `preferredProjectId`: petunjuk scope opsional
 * dari registry (projectId request yang membangun draft). Bila diisi,
 * ensurer WAJIB mengikat ke proyek itu (bila masih ada) — BUKAN ke
 * proyek live, yang bisa sudah berganti selama await provider (S7:
 * draft dari konteks A diikat ke B). Bila proyek petunjuk sudah tidak
 * ada → null (fail-closed). Tanpa petunjuk → proyek live (bila ada),
 * atau null. Pemanggil registry yang tidak memberi petunjuk (corong
 * chat/direct sinkron — tidak ada await di antara kirim dan commit)
 * tidak berubah perilakunya.
 */
export type DraftProjectEnsurer = (
  draft: UniversalDraft | DraftProjectRequest,
  preferredProjectId?: string | null,
) => EnsuredDraftProject | null;

let draftProjectEnsurer: DraftProjectEnsurer | null = null;

/**
 * Daftarkan ensurer (view chat saat mount) atau lepas (null, saat unmount).
 *
 * Fast Track §3(g) — PENJAGA LEVEL-REGISTRY (§4.5, direktif owner
 * 2026-11-24): ensurer yang didaftarkan DIBUNGKUS — bila ia
 * mengembalikan `created: true`, hasilnya DIBUANG (null) dan draft
 * tetap TAK TERIKAT. Ensurer yang membuat proyek MELANGGAR kontrak
 * §4.5; mengikat draft ke proyek yang baru saja dibuatnya secara
 * implisit akan mencuci pelanggaran itu (fail-closed: draft tanpa
 * proyek aktif tetap tak terikat sampai user mengonfirmasi pembuatan
 * proyek di aliran push §6 atau membuat manual). Memaksa
 * `created: false` sambil tetap mengikat TIDAK cukup — ikatan ke
 * proyek implisit itulah yang dilarang, bukan hanya flag-nya.
 *
 * BATAS PENJAGA (jujur): pembungkus ini mengendalikan apa yang
 * dilihat registry — ia TIDAK BISA membatalkan efek samping pembuatan
 * yang sudah dilakukan ensurer nakal di dalam store-nya sendiri
 * sebelum mengembalikan nilai. Ensurer produksi (view.tsx) tidak
 * pernah membuat proyek, jadi penjaga ini adalah pertahanan
 * berlapis terhadap ensurer masa depan yang salah implementasi,
 * bukan pengganti kontrak view.
 */
export function setDraftProjectEnsurer(ensurer: DraftProjectEnsurer | null): void {
  if (!ensurer) {
    draftProjectEnsurer = null;
    return;
  }
  draftProjectEnsurer = (draft, preferredProjectId) => {
    const ensured = ensurer(draft, preferredProjectId);
    if (!ensured) return null;
    if (ensured.created) return null;
    return ensured;
  };
}

/** Baca ensurer terdaftar (registry). */
export function getDraftProjectEnsurer(): DraftProjectEnsurer | null {
  return draftProjectEnsurer;
}

/**
 * ============================================================================
 *  Kotak Saran & Pengaduan — logika murni (UI-first, TANPA backend)
 * ============================================================================
 *  Hasil preflight audit (2026-10-29) yang mendasari modul ini:
 *  - Pusat Bantuan EZRAB = tab 'help' di UnifiedSettingsView (FAQ + Tutorial).
 *  - TIDAK ADA endpoint API saran/pengaduan (api/ hanya: access, ai, credits,
 *    invitations, market) dan TIDAK ADA tabel feedback/support di Supabase.
 *  - TIDAK ADA kanal kontak terverifikasi di aplikasi (tidak ada mailto /
 *    WhatsApp link di src) — kanal bantuan yang tersedia saat ini hanyalah
 *    FAQ & Tutorial di Pusat Bantuan itu sendiri.
 *  - Identitas pengguna berasal dari AuthContext (Supabase, env-gated) atau
 *    RoleContext (sesi peran demo). Modul ini TIDAK mengarang identitas.
 *
 *  Konsekuensi yang ditegakkan secara struktural di sini:
 *  - `attemptSubmit` TIDAK PERNAH mengembalikan status sukses — tipe
 *    `SubmitOutcome` bahkan tidak memiliki varian "terkirim". Selama backend
 *    terverifikasi belum ada, satu-satunya hasil pengiriman adalah
 *    'unavailable' dengan pesan jujur.
 *  - Tidak ada nomor tiket, tidak ada riwayat laporan.
 *  - Modul ini tidak menyentuh penyimpanan web apa pun (storage/cookie)
 *    maupun analytics; draf laporan hanya hidup di state halaman
 *    (di komponen React).
 * ============================================================================
 */

/** Kategori laporan — persis tujuh pilihan pada spesifikasi fitur. */
export const REPORT_CATEGORIES = [
  'Saran Fitur',
  'Kendala Aplikasi',
  'Kesalahan Data AHSP atau Harga',
  'Kesalahan Perhitungan RAB atau Volume',
  'Masalah Akun atau Login',
  'Masalah Langganan atau Pembayaran',
  'Lainnya',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** Prioritas yang dirasakan pengguna (opsional). */
export const REPORT_PRIORITIES = ['Rendah', 'Normal', 'Tinggi'] as const;

export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

/** Batas panjang sisi-klien, konsisten dengan konvensi formulir pengaturan. */
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 2000;

/** Konteks halaman asal fitur ini — label statis, bukan data pengguna. */
export const PAGE_CONTEXT_LABEL = 'Pusat Bantuan — Pengaturan';

/**
 * Pesan jujur saat pengiriman dicoba tanpa backend terverifikasi.
 * Menyebutkan secara eksplisit bahwa data BELUM dikirim dan BELUM disimpan,
 * dan menunjuk ke kanal bantuan yang benar-benar ada di aplikasi
 * (FAQ & Tutorial di Pusat Bantuan yang sama) — tanpa mengarang kontak.
 */
export const SUBMISSION_UNAVAILABLE_MESSAGE =
  'Formulir sudah siap, tetapi pengiriman laporan belum tersedia. ' +
  'Data Anda belum dikirim atau disimpan. Silakan gunakan kanal bantuan ' +
  'yang saat ini tersedia di Pusat Bantuan ini (FAQ dan Tutorial di bawah).';

/**
 * Bendera kemampuan backend. Selama tidak ada endpoint/tabel laporan yang
 * terverifikasi, nilai ini HARUS tetap false. Mengubahnya ke true tanpa
 * backend nyata akan membuat UI berbohong — jangan.
 */
export const SUBMISSION_BACKEND_AVAILABLE = false;

/** Draf laporan — hanya hidup di state halaman, tidak pernah dipersistkan. */
export interface ReportDraft {
  title: string;
  category: string;
  description: string;
  priority: ReportPriority;
  includePageContext: boolean;
}

export const EMPTY_REPORT_DRAFT: ReportDraft = {
  title: '',
  category: '',
  description: '',
  priority: 'Normal',
  includePageContext: false,
};

export type ReportFieldErrors = Partial<
  Record<'title' | 'category' | 'description' | 'priority', string>
>;

export interface ReportValidation {
  valid: boolean;
  errors: ReportFieldErrors;
}

/** Validasi sisi-klien murni. Tidak mengubah draf yang diberikan. */
export function validateReportDraft(draft: ReportDraft): ReportValidation {
  const errors: ReportFieldErrors = {};

  const title = draft.title.trim();
  if (!title) {
    errors.title = 'Judul laporan wajib diisi.';
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = `Judul terlalu panjang (maksimal ${TITLE_MAX_LENGTH} karakter).`;
  }

  if (!draft.category) {
    errors.category = 'Kategori wajib dipilih.';
  } else if (!(REPORT_CATEGORIES as readonly string[]).includes(draft.category)) {
    errors.category = 'Kategori tidak dikenal. Pilih salah satu kategori yang tersedia.';
  }

  const description = draft.description.trim();
  if (!description) {
    errors.description = 'Deskripsi wajib diisi.';
  } else if (description.length < DESCRIPTION_MIN_LENGTH) {
    errors.description = `Deskripsi terlalu singkat (minimal ${DESCRIPTION_MIN_LENGTH} karakter). Jelaskan masalah atau saran Anda sedikit lebih rinci.`;
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Deskripsi terlalu panjang (maksimal ${DESCRIPTION_MAX_LENGTH} karakter).`;
  }

  if (!(REPORT_PRIORITIES as readonly string[]).includes(draft.priority)) {
    errors.priority = 'Prioritas tidak dikenal.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Identitas pelapor dari sesi yang sudah ada — aplikasi tidak pernah meminta
 * pengguna mengetik ulang email yang sudah diketahuinya, dan tidak ada
 * identitas yang di-hardcode.
 *  - 'account'   : sesi Supabase terverifikasi (email akun).
 *  - 'demo-role' : sesi peran demo EZRAB (nama peran aktif).
 *  - 'none'      : tidak ada sesi — formulir tidak dapat digunakan dan
 *                  pengguna diarahkan ke alur masuk yang sudah ada.
 */
export type ReporterIdentity =
  | { kind: 'account'; label: string }
  | { kind: 'demo-role'; label: string }
  | { kind: 'none' };

export function resolveReporterIdentity(input: {
  accountEmail?: string | null;
  roleName?: string | null;
}): ReporterIdentity {
  const email = (input.accountEmail ?? '').trim();
  if (email) return { kind: 'account', label: email };
  const role = (input.roleName ?? '').trim();
  if (role) return { kind: 'demo-role', label: role };
  return { kind: 'none' };
}

/**
 * Hasil percobaan pengiriman. SENGAJA tidak ada varian sukses: selama
 * SUBMISSION_BACKEND_AVAILABLE false, fungsi ini hanya dapat menghasilkan
 * 'validation-error' atau 'unavailable'.
 */
export type SubmitOutcome =
  | { status: 'validation-error'; errors: ReportFieldErrors }
  | { status: 'unavailable'; message: string };

/**
 * Percobaan pengiriman (lokal, tanpa jaringan, tanpa penyimpanan).
 * Mengembalikan draf apa adanya — pemanggil mempertahankannya di state
 * halaman agar pengguna tidak kehilangan tulisannya.
 */
export function attemptSubmit(draft: ReportDraft): SubmitOutcome {
  const validation = validateReportDraft(draft);
  if (!validation.valid) {
    return { status: 'validation-error', errors: validation.errors };
  }
  if (!SUBMISSION_BACKEND_AVAILABLE) {
    return { status: 'unavailable', message: SUBMISSION_UNAVAILABLE_MESSAGE };
  }
  // Jalur backend hanya boleh diaktifkan bersama endpoint terverifikasi.
  // Selama flag di atas false, cabang ini tidak terjangkau; ia dipertahankan
  // sebagai 'unavailable' agar tidak ada jalur kode yang mengklaim sukses.
  return { status: 'unavailable', message: SUBMISSION_UNAVAILABLE_MESSAGE };
}

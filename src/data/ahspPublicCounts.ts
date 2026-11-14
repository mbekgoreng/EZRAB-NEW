/**
 * Jumlah item AHSP 2026 untuk halaman publik (Batch G1, D-31).
 *
 * Halaman publik (/fitur, /keunggulan, landing) TIDAK BOLEH mengimpor
 * `officialAhspRepository` — modul itu menarik dataset kanonis 16 MB ke
 * dalam chunk halaman publik. Sebagai gantinya, jumlah aktif dipin di
 * sini sebagai konstanta dan DIKUNCI oleh tes
 * `src/test/d31AhspPublicCount.test.ts`, yang membandingkannya dengan
 * `officialAhspRepository.getActiveOfficialAhsp().length` pada setiap
 * jalan. Bila dataset berubah, tes gagal dan konstanta ini wajib
 * diperbarui — jangan ubah angkanya tanpa menjalankan tes itu.
 *
 * Angka kanonis (2026-11-14, dipin juga di
 * `ahspCategoryGroups.test.ts`): backing 5.742, karantina 17,
 * AKTIF 5.725 (CK 2.849, BM 1.130, SDA 1.556, SMKK 190).
 * Halaman publik memakai jumlah AKTIF — angka yang sama dengan yang
 * ditampilkan modal Audit AHSP di dalam aplikasi
 * ("Aktif ditampilkan: 5.725 item").
 */

/** Jumlah item AHSP aktif yang ditampilkan aplikasi (5.725). */
export const AHSP_ACTIVE_ITEM_COUNT = 5725;

/** Jumlah aktif diformat id-ID ("5.725") untuk teks publik. */
export const AHSP_ACTIVE_ITEM_COUNT_FORMATTED =
  AHSP_ACTIVE_ITEM_COUNT.toLocaleString('id-ID');

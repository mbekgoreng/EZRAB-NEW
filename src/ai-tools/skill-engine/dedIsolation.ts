/**
 * EZRAB AI — Skill Engine: batas isolasi DED / FULL AI (BARU, Phase 2 W3).
 *
 * SATU-SATUNYA sumber kebenaran gerbang isolasi adalah
 * `ded-full-ai/dataSourcePolicy.ts` (dataSourceAccessFor + predikat §4 B di
 * ded-ai-estimate/dedMode.ts). Modul ini HANYA cermin untuk validasi
 * definisi skill: bila cermin ini dan dataSourcePolicy tidak sepakat,
 * dataSourcePolicy yang menang dan cermin ini harus diperbarui.
 *
 * Batas yang dipin (C3, diverifikasi 2026-11-19 terhadap dataSourcePolicy.ts
 * + resolveFullAiItemPrice di ded-full-ai/service.ts):
 * - TERTUTUP di FULL_AI: katalog AHSP kanonis + resolusi harga kanonis
 *   (D1/D2 beserta hilir I1–I5/J1–J5), konfirmasi kode kanonis (D3),
 *   referensi harga pasar terkurasi EZRAB (D4/D6/D8), tabel harga Jakarta
 *   + harga inline di prompt (D10).
 * - TERBUKA di FULL_AI (bukan katalog harga): layanan kuantitas bersama
 *   (D5/D9), validasi satuan via registry, pita kewajaran (D7, ambang
 *   angka), taksonomi WBS, parser dokumen, pemetaan kosakata harga (D11).
 * - Di EZRAB_AI semua sumber terbuka seperti hari ini.
 * - Penegakan runtime hidup di resolveFullAiItemPrice (adapter kanonis
 *   TIDAK dipanggil sama sekali di mode FULL_AI) — modul service secara
 *   statis masih mengimpor adapter; batasnya adalah gerbang runtime,
 *   bukan batas modul (lihat MIGRATION-PLAN.md §Phase 4, catatan hardening).
 */
import type { DedDataSourceFamily, DedMode } from './types';

/** Keluarga sumber data yang TERTUTUP untuk mode FULL_AI. */
export const FULL_AI_CLOSED_FAMILIES: readonly DedDataSourceFamily[] = [
  'canonical-ahsp-catalog',
  'canonical-pricing',
  'external-price-references',
  'jakarta-price-table',
];

/** Keluarga sumber data yang TERBUKA untuk mode FULL_AI (bukan katalog harga). */
export const FULL_AI_OPEN_FAMILIES: readonly DedDataSourceFamily[] = [
  'quantity-services',
  'unit-registry',
  'sanity-band',
  'wbs-classification',
  'document-parser',
  'price-source-vocabulary',
];

/** Semua keluarga sumber data yang dikenal. */
export const ALL_DED_DATA_SOURCE_FAMILIES: readonly DedDataSourceFamily[] = [
  ...FULL_AI_CLOSED_FAMILIES,
  ...FULL_AI_OPEN_FAMILIES,
];

/**
 * Periksa deklarasi sumber data satu skill terhadap batas isolasi modenya.
 * Mengembalikan daftar pelanggaran; kosong = patuh.
 */
export function checkDedIsolation(
  dedMode: DedMode | undefined,
  dataSources: DedDataSourceFamily[] | undefined,
): string[] {
  const errors: string[] = [];
  if (!dedMode) {
    if (dataSources && dataSources.length > 0) {
      errors.push('dataSources dideklarasikan tanpa dedMode — isi dedMode dulu');
    }
    return errors;
  }
  const declared = dataSources ?? [];
  for (const family of declared) {
    if (!ALL_DED_DATA_SOURCE_FAMILIES.includes(family)) {
      errors.push(`keluarga sumber data tidak dikenal: ${family}`);
    }
  }
  if (dedMode === 'FULL_AI') {
    for (const family of declared) {
      if (FULL_AI_CLOSED_FAMILIES.includes(family)) {
        errors.push(
          `pelanggaran isolasi FULL_AI: skill mode FULL_AI tidak boleh mengakses '${family}' ` +
            `(tertutup per dataSourcePolicy C3)`,
        );
      }
    }
  }
  return errors;
}

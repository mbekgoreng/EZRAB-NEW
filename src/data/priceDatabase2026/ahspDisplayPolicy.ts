/**
 * AHSP display/finalization policy (keputusan sementara EZRAB).
 *
 * - Biaya Umum & Keuntungan (overhead/profit, "E") DINONAKTIFKAN: tidak
 *   dihitung, tidak ditampilkan, tidak ditambahkan ke total.
 * - Total kerja AHSP = Biaya Langsung (D = A + B + C).
 * - AHSP parsial (pricingStatus !== 'FULL') TIDAK boleh disimpan sebagai
 *   AHSP lengkap dan TIDAK boleh masuk RAB sebagai harga final.
 * - Harga null TIDAK PERNAH diubah menjadi 0 di fungsi mana pun di sini.
 *
 * Pure functions — diuji di src/test/ahspDisplayPolicy.test.ts dan dipakai
 * oleh AhspExplorerView (modal detail, tambah-ke-RAB, simpan-ke-proyek).
 */
/** Kebijakan tampilan/finalisasi AHSP — lihat komentar modul. */

/**
 * Bentuk minimal yang dibutuhkan kebijakan. Disengaja minimal agar komposisi
 * augmented (overlay pasar) maupun komposisi resmi sama-sama diterima.
 */
export interface FinalizableComposition {
  pricingStatus: string;
  totalComponents: number;
  missingComponents: number;
  unitPrice: number | null;
  officialDhspPrice?: number | null;
}

/**
 * Biaya Langsung (D) untuk dipakai sebagai harga kerja.
 * - Item berkomponen: D = unitPrice resolver (jumlah subtotal A+B+C yang resolved).
 * - Item tanpa komponen tapi ber-DHSP resmi: pakai harga resmi sebagai referensi.
 * - Selain itu: null (harga belum tersedia).
 */
export function getAhspDirectPrice(
  comp: FinalizableComposition | null | undefined
): number | null {
  if (!comp) return null;
  if (comp.totalComponents > 0) return comp.unitPrice;
  return comp.officialDhspPrice ?? null;
}

/**
 * Apakah komposisi AHSP boleh difinalisasi (masuk RAB / disimpan ke proyek
 * sebagai harga final)? Hanya pricingStatus FULL yang lolos.
 */
export function canFinalizeAhsp(
  comp: FinalizableComposition | null | undefined
): { ok: boolean; reason: string } {
  if (!comp) {
    return { ok: false, reason: 'Komposisi AHSP tidak tersedia.' };
  }
  if (comp.pricingStatus !== 'FULL') {
    return {
      ok: false,
      reason: `Belum lengkap — ${comp.missingComponents} dari ${comp.totalComponents} komponen belum memiliki harga. AHSP parsial tidak dapat difinalisasi.`,
    };
  }
  const d = getAhspDirectPrice(comp);
  if (d === null || d <= 0) {
    return { ok: false, reason: 'Biaya langsung belum tersedia.' };
  }
  return { ok: true, reason: '' };
}

/**
 * Label status untuk baris total di modal detail.
 */
export function ahspCompletenessNote(
  comp: FinalizableComposition | null | undefined
): string | null {
  if (!comp || comp.pricingStatus !== 'PARTIAL') return null;
  return (
    `Belum lengkap — ${comp.missingComponents} dari ${comp.totalComponents} ` +
    `komponen belum memiliki harga. Subtotal di atas hanya mencakup komponen ` +
    `yang sudah berharga (parsial), bukan total biaya langsung yang lengkap.`
  );
}

/**
 * Label tampilan untuk harga perkiraan AI (perintah user 2026-10-18).
 * Aturan: label "Harga Estimasi" SELALU menyertai angka — tidak ada
 * tampilan harga perkiraan AI tanpa label ini.
 */
export const AI_ESTIMATE_LABEL = 'Harga Estimasi';

export function formatAiEstimatedPrice(price: number | null | undefined): string | null {
  if (price === null || price === undefined || !(price > 0)) return null;
  return `Rp ${Math.round(price).toLocaleString('id-ID')} ${AI_ESTIMATE_LABEL}`;
}

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
 * Apakah identitas item AHSP cukup aman untuk dipilih ke RAB?
 * Menolak: kode kosong, nama kosong/sangat pendek, fragmen parsing,
 * dan artefak kode berupa angka (mis. "1.000").
 * Menggunakan mekanisme gate yang sudah ada (bukan status baru).
 */
export function checkAhspIdentitySafety(
  item: { code?: string | null; name?: string | null } | null | undefined
): { safe: boolean; reason: string } {
  if (!item) return { safe: false, reason: 'Data item AHSP tidak tersedia.' };
  const code = String(item.code || '').trim();
  const name = String(item.name || '').trim();
  if (!code) return { safe: false, reason: 'Kode AHSP kosong — identitas tidak aman.' };
  // Artefak parsing: kode berupa angka desimal (mis. "1.000", "1.250")
  if (/^\d{1,3}(\.\d{3})+$/.test(code)) {
    return { safe: false, reason: `Kode "${code}" terindikasi artefak parsing, bukan kode AHSP valid.` };
  }
  if (!name) return { safe: false, reason: `Item ${code}: nama kosong — identitas tidak aman.` };
  if (name.length < 8) {
    return { safe: false, reason: `Item ${code}: nama terlalu pendek ("${name}") — kemungkinan fragmen parsing.` };
  }
  if (/^\(?(no name|satu|dua|tiga)\)?$/i.test(name)) {
    return { safe: false, reason: `Item ${code}: nama "${name}" terindikasi fragmen parsing.` };
  }
  if (/\)\.\s*$/.test(name)) {
    return { safe: false, reason: `Item ${code}: nama terpotong ("${name.slice(0, 40)}…") — fragmen parsing.` };
  }
  return { safe: true, reason: '' };
}

/**
 * Apakah komposisi AHSP boleh difinalisasi (masuk RAB / disimpan ke proyek
 * sebagai harga final)? Hanya pricingStatus FULL yang lolos, DAN identitas
 * item harus aman (bila item disediakan).
 */
export function canFinalizeAhsp(
  comp: FinalizableComposition | null | undefined,
  item?: { code?: string | null; name?: string | null } | null
): { ok: boolean; reason: string } {
  if (!comp) {
    return { ok: false, reason: 'Komposisi AHSP tidak tersedia.' };
  }
  if (item) {
    const idCheck = checkAhspIdentitySafety(item);
    if (!idCheck.safe) {
      return { ok: false, reason: idCheck.reason + ' Item diblokir dari RAB.' };
    }
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

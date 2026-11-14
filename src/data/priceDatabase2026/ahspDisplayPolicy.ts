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

import { officialAhspRepository } from '../nationalCostDatabase/officialAhspRepository';

/**
 * Apakah kode AHSP benar-benar ADA di katalog AHSP kanonis 2026?
 *
 * Sumber kebenaran TUNGGAL: `officialAhspRepository.hasOfficialAhsp` — gerbang
 * §14 yang sama dengan yang dipakai gerbang harga kanonis DED
 * (canonicalDedPricing). Alias kode diselesaikan dan item karantina
 * dikecualikan di dalam repository; fungsi ini tidak menduplikasi katalog.
 *
 * `checkAhspIdentitySafety` di bawah SENGAJA tidak diubah: ia hanya menilai
 * keamanan parsing (artefak/fragmen). Keberadaan kanonis adalah sumbu
 * terpisah dan ditegakkan di boundary tulis (rabItemFactory) lewat fungsi ini.
 */
export function canonicalAhspCodeExists(code: string | null | undefined): boolean {
  const c = String(code || '').trim();
  if (!c) return false;
  return officialAhspRepository.hasOfficialAhsp(c);
}

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
 * - Item berkomponen yang TIDAK ADA komponennya berharga (unitPrice null):
 *   D = harga DHSP resmi bila ada (D-57, Batch B — OD-16 opsi (a)). DHSP
 *   adalah harga satuan resmi yang diterbitkan (Daftar Harga Satuan
 *   Pekerjaan); menyembunyikannya membuat badge "Harga lengkap" berbohong
 *   (badge FULL via DHSP, harga tampil null, finalisasi diblokir).
 *   Basisnya DITANDAI lewat `getAhspDirectPriceBasis` — pemakai wajib
 *   menampilkan label "DHSP resmi" bila basisnya DHSP.
 * - Item tanpa komponen: DHSP resmi dulu, lalu unitPrice baked item.
 * - Selain itu: null (harga belum tersedia).
 *
 * INVARIAN (diuji di d57DhspDirectPrice): item ber-badge FULL selalu punya
 * harga tampil non-null — badge, harga kartu, dialog, dan `canFinalizeAhsp`
 * memakai kriteria "ada harga" yang sama.
 */
export function getAhspDirectPrice(
  comp: FinalizableComposition | null | undefined
): number | null {
  if (!comp) return null;
  if (comp.totalComponents === 0) {
    // Item tanpa komponen: DHSP resmi adalah otoritas pertama; harga baked
    // item (yang sudah masuk ke comp.unitPrice lewat resolver) adalah
    // fallback — sebelumnya item seperti ini menampilkan null meski harga
    // baked-nya ada (cabang lain dari D-57 yang sama).
    if (comp.officialDhspPrice !== null && comp.officialDhspPrice !== undefined && comp.officialDhspPrice > 0) {
      return comp.officialDhspPrice;
    }
    return comp.unitPrice !== null && comp.unitPrice !== undefined && comp.unitPrice > 0 ? comp.unitPrice : null;
  }
  if (comp.unitPrice !== null && comp.unitPrice !== undefined && comp.unitPrice > 0) {
    return comp.unitPrice;
  }
  // Tidak ada harga komponen sama sekali — DHSP resmi adalah satu-satunya
  // harga resmi yang tersedia. Untuk item PARSIAL (unitPrice > 0) cabang
  // ini tidak tercapai: D parsial tetap jumlah komponen ter-resolve.
  if (comp.officialDhspPrice !== null && comp.officialDhspPrice !== undefined && comp.officialDhspPrice > 0) {
    return comp.officialDhspPrice;
  }
  return null;
}

/**
 * Basis harga yang dikembalikan `getAhspDirectPrice` — untuk label tampilan.
 * 'COMPONENTS' = jumlah subtotal komponen ter-resolve (atau harga baked item
 * untuk item tanpa komponen); 'DHSP' = Daftar Harga Satuan Pekerjaan resmi;
 * null = tidak ada harga. Pemakai yang menampilkan harga DARI FUNGSI INI
 * wajib menampilkan label basisnya bila DHSP ("DHSP resmi").
 */
export function getAhspDirectPriceBasis(
  comp: FinalizableComposition | null | undefined
): 'COMPONENTS' | 'DHSP' | null {
  if (!comp) return null;
  if (comp.totalComponents === 0) {
    if (comp.officialDhspPrice !== null && comp.officialDhspPrice !== undefined && comp.officialDhspPrice > 0) {
      return 'DHSP';
    }
    return comp.unitPrice !== null && comp.unitPrice !== undefined && comp.unitPrice > 0 ? 'COMPONENTS' : null;
  }
  if (comp.unitPrice !== null && comp.unitPrice !== undefined && comp.unitPrice > 0) {
    return 'COMPONENTS';
  }
  if (comp.officialDhspPrice !== null && comp.officialDhspPrice !== undefined && comp.officialDhspPrice > 0) {
    return 'DHSP';
  }
  return null;
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

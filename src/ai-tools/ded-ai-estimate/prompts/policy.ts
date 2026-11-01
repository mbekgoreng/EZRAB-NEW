/**
 * DED-to-RAB — Bagian kebijakan harga prompt (shared, tanpa data harga).
 *
 * Dipakai oleh ketiga builder prompt DED (fast.ts, detail.ts, prompts.ts
 * mesin Full AI) agar aturan mode tidak ditulis tiga kali dengan kata-kata
 * yang bisa bertentangan. File ini HANYA teks instruksi — tidak mengimpor
 * matcher AHSP, resolver harga, atau database apa pun, sehingga mesin
 * standar tetap terisolasi dari data kanonis (lihat header service.ts).
 *
 * Dua kebijakan (DedEstimationPolicy, nilai sama di kedua mesin):
 * - 'FULL_AI': estimasi murni AI. AI BOLEH mengestimasi harga satuan,
 *   subtotal usulan, dan total usulan. Semuanya berlabel Estimasi AI,
 *   bukan data resmi AHSP. Aplikasi menghitung ulang secara deterministik
 *   dan menyimpan usulan AI terpisah untuk perbandingan.
 * - 'DATABASE': harga resmi HANYA dari database AHSP kanonis EZRAB yang
 *   divalidasi aplikasi. AI DILARANG menulis kode AHSP, koefisien resmi,
 *   atau harga resmi apa pun. AI tetap memberi bahan pencocokan (deskripsi
 *   teknis, dimensi, spesifikasi, dasar hitung, asumsi, info hilang).
 *   Per keputusan owner 2026-10-27 malam, dikonfirmasi 2026-10-27 23:33:
 *   estimatedUnitPrice AI tetap diminta sebagai FALLBACK berlabel
 *   "Estimasi AI" — dipakai aplikasi HANYA bila item tidak ditemukan di
 *   database, dan harga kanonis selalu menang bila cocok. Fallback ini
 *   bukan harga database dan tidak pernah menyamar sebagai harga resmi.
 *   Bila fallback hilang/tidak wajar, harga tetap UNRESOLVED (null).
 *
 * Default bila policy tidak diisi: 'FULL_AI' (perilaku lama konsumen
 * yang belum mengirim policy — service selalu mengirim policy eksplisit).
 *
 * Sprint 1 (Workstream A): teks dirapatkan (aturan & frasa kunci tidak
 * berubah) agar prompt sistem rakitan muat dalam anggaran gateway; lihat
 * wbsContext.ts.
 */

export type DedPromptPricingPolicy = 'FULL_AI' | 'DATABASE';

export function normalizePromptPolicy(
  policy: DedPromptPricingPolicy | undefined
): DedPromptPricingPolicy {
  return policy === 'DATABASE' ? 'DATABASE' : 'FULL_AI';
}

/**
 * Bagian kebijakan untuk prompt mesin standar (fast/detail). Schema JSON
 * kedua mode SAMA kecuali: mode FULL_AI menambah field opsional
 * proposedSubtotal per item + proposedGrandTotal tingkat atas; mode
 * DATABASE tidak meminta keduanya (total resmi dihitung aplikasi dari
 * data tervalidasi, bukan dari usulan AI).
 */
export function standardPricingPolicySection(
  policy: DedPromptPricingPolicy | undefined
): string {
  if (normalizePromptPolicy(policy) === 'DATABASE') {
    return `KEBIJAKAN HARGA — DATABASE EZRAB (wajib dipatuhi):
- Harga resmi HANYA dari database AHSP kanonis EZRAB tervalidasi aplikasi. DILARANG menulis kode AHSP, koefisien resmi, harga material resmi, harga upah resmi, harga alat resmi, atau harga satuan resmi — jangan mengarang/menebak/menyajikannya sebagai harga database.
- Beri aplikasi bahan pencocokan selengkap mungkin: deskripsi teknis (material, mutu, campuran, ukuran), dimensi bersatuan, spesifikasi, satuan konsisten, dasar hitung (quantityFormula), asumsi, info hilang (di specification, awali "DATA HILANG: ...").
- estimatedUnitPrice BUKAN harga database — hanya fallback berlabel "Estimasi AI", dipakai HANYA bila item tak ditemukan di database; bila cocok, harga kanonis selalu menang. Jangan menyebutnya harga AHSP/resmi. Subtotal/total resmi dihitung aplikasi; item tanpa harga kanonis valid tetap null, tidak pernah Rp0.`;
  }
  return `KEBIJAKAN HARGA — FULL AI (estimasi murni AI, wajib dipatuhi):
- Semua harga yang kamu tulis adalah ESTIMASI AI, bukan data resmi AHSP EZRAB. Jangan mengklaimnya sebagai data resmi AHSP; jangan menulis kode AHSP kecuali tertulis eksplisit di DED (ragu → kosongkan).
- Hitung proposedSubtotal = quantity × estimatedUnitPrice per item (null bila salah satu null) dan proposedGrandTotal = jumlah semua proposedSubtotal.
- Total usulanmu DISIMPAN terpisah untuk perbandingan: aplikasi menghitung ulang total secara deterministik dan menandai selisihnya; total aplikasi yang dipakai, bukan totalmu.`;
}

/**
 * Bagian kebijakan untuk prompt mesin Full AI (prompts.ts). Schema JSON
 * sama di kedua mode kecuali: mode FULL_AI menambah proposedSubtotal per
 * item + proposedGrandTotal; mode DATABASE tidak meminta keduanya.
 */
export function fullAiPricingPolicySection(
  policy: DedPromptPricingPolicy | undefined
): string {
  if (normalizePromptPolicy(policy) === 'DATABASE') {
    return `KEBIJAKAN HARGA — DATABASE EZRAB (wajib dipatuhi):
- Harga resmi HANYA dari database AHSP kanonis EZRAB tervalidasi aplikasi. DILARANG menulis kode AHSP, koefisien resmi, harga material resmi, harga upah/alat/satuan resmi — jangan mengarang/menebak/menyajikannya sebagai harga database.
- Beri aplikasi bahan pencocokan selengkap mungkin: deskripsi teknis detail, dimensi, spesifikasi (mutu, campuran, ukuran, material), satuan konsisten, dasar hitung kuantitas (formula), asumsi, info hilang (tulis di assumptions).
- Field price BUKAN harga database — hanya fallback berlabel "Estimasi AI", dipakai HANYA bila item tak ditemukan di database; bila cocok, harga kanonis selalu menang. Jangan menyebutnya harga AHSP/resmi. Subtotal/total resmi dihitung aplikasi; item tanpa harga kanonis valid tetap null, tidak pernah Rp0.`;
  }
  return `KEBIJAKAN HARGA — FULL AI (estimasi murni AI, wajib dipatuhi):
- Semua harga yang kamu tulis adalah ESTIMASI AI, bukan data resmi AHSP EZRAB — jangan mengklaimnya sebagai data resmi; jangan menulis kode AHSP kecuali tertulis eksplisit di DED (ragu → kosongkan).
- Bila relevan, uraikan singkat kebutuhan material, tenaga kerja, dan peralatan per item (estimasi AI, bukan komposisi AHSP resmi).
- Hitung proposedSubtotal = qty × price per item (null bila salah satu null) dan proposedGrandTotal = jumlah semua proposedSubtotal.
- Total usulanmu DISIMPAN terpisah: aplikasi menghitung ulang subtotal/total secara deterministik dan menandai selisihnya; total aplikasi yang dipakai.`;
}

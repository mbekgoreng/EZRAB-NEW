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
    return `KEBIJAKAN HARGA — DATABASE EZRAB (wajib dipatuhi; bagian harga di bawah dibangun kondisional untuk mode ini, sehingga tidak ada instruksi harga umum yang bertentangan):
- Harga resmi HANYA berasal dari database AHSP kanonis EZRAB yang divalidasi aplikasi. Kamu DILARANG menulis kode AHSP, koefisien resmi, harga material resmi, harga upah resmi, harga alat resmi, atau harga satuan resmi — jangan mengarang, jangan menebak, jangan menyajikannya sebagai harga database.
- Tugasmu adalah memberi aplikasi bahan pencocokan selengkap mungkin: deskripsi teknis detail (material, mutu, campuran, ukuran, metode), dimensi lengkap dengan satuan, spesifikasi, satuan yang konsisten dengan pekerjaannya, dasar hitung kuantitas (quantityFormula), asumsi, dan informasi yang hilang (tulis di specification diawali "DATA HILANG: ...").
- Field estimatedUnitPrice yang kamu isi BUKAN harga database: itu hanya perkiraan fallback berlabel "Estimasi AI", yang dipakai aplikasi HANYA bila item ini tidak ditemukan di database AHSP. Bila item cocok dengan database, harga kanonis selalu menang dan perkiraanmu diabaikan. Jangan pernah menyebut perkiraanmu sebagai harga AHSP/resmi.
- JANGAN menghitung subtotal atau total resmi — aplikasi menghitungnya dari data tervalidasi. Item tanpa harga kanonis yang valid tetap berstatus belum ada harga (null), tidak pernah Rp0.`;
  }
  return `KEBIJAKAN HARGA — FULL AI (estimasi murni AI, wajib dipatuhi):
- Semua harga yang kamu tulis adalah ESTIMASI AI, bukan data resmi AHSP EZRAB. Jangan pernah mengklaim harga, koefisien, atau analisismu sebagai data resmi AHSP, dan jangan menulis kode AHSP kecuali kode itu tertulis eksplisit di DED (bila ragu, kosongkan).
- Untuk setiap item, hitung juga proposedSubtotal = quantity × estimatedUnitPrice bila keduanya ada (bila salah satunya null, proposedSubtotal = null). Di akhir keluaran, tulis proposedGrandTotal = jumlah semua proposedSubtotal.
- Total usulanmu DISIMPAN terpisah untuk perbandingan: aplikasi menghitung ulang total secara deterministik dari kuantitas × harga yang lolos validasi, dan menandai selisih bila berbeda. Total aplikasi yang dipakai sebagai hasil, bukan totalmu — tapi usulanmu tidak dibuang diam-diam.`;
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
    return `KEBIJAKAN HARGA — DATABASE EZRAB (wajib dipatuhi; bagian harga di bawah dibangun kondisional untuk mode ini, sehingga tidak ada instruksi harga umum yang bertentangan):
- Harga resmi HANYA berasal dari database AHSP kanonis EZRAB yang divalidasi aplikasi. Kamu DILARANG menulis kode AHSP, koefisien resmi, harga material resmi, harga upah resmi, harga alat resmi, atau harga satuan resmi — jangan mengarang, jangan menebak, jangan menyajikannya sebagai harga database.
- Tugasmu adalah memberi aplikasi bahan pencocokan selengkap mungkin: deskripsi teknis detail, dimensi, spesifikasi (mutu, campuran, ukuran, material), satuan yang konsisten, dasar hitung kuantitas (formula), asumsi, dan informasi yang hilang (tulis di assumptions).
- Field price yang kamu isi BUKAN harga database: itu hanya perkiraan fallback berlabel "Estimasi AI", yang dipakai aplikasi HANYA bila item ini tidak ditemukan di database AHSP. Bila item cocok dengan database, harga kanonis selalu menang. Jangan pernah menyebut perkiraanmu sebagai harga AHSP/resmi, dan jangan menghitung subtotal/total resmi — aplikasi menghitungnya dari data tervalidasi. Item tanpa harga kanonis yang valid tetap berstatus belum ada harga (null), tidak pernah Rp0.`;
  }
  return `KEBIJAKAN HARGA — FULL AI (estimasi murni AI, wajib dipatuhi):
- Semua harga yang kamu tulis adalah ESTIMASI AI, bukan data resmi AHSP EZRAB. Jangan pernah mengklaim harga, koefisien, atau analisismu sebagai data resmi AHSP, dan jangan menulis kode AHSP kecuali kode itu tertulis eksplisit di DED (bila ragu, kosongkan).
- Bila relevan, uraikan singkat kebutuhan material, tenaga kerja, dan peralatan per item (tetap sebagai estimasi AI, bukan komposisi AHSP resmi).
- Untuk setiap item, hitung juga proposedSubtotal = qty × price bila keduanya ada (bila salah satunya null, proposedSubtotal = null). Di akhir keluaran, tulis proposedGrandTotal = jumlah semua proposedSubtotal.
- Total usulanmu DISIMPAN terpisah untuk perbandingan: aplikasi menghitung ulang subtotal dan total secara deterministik dari kuantitas × harga yang lolos validasi, dan menandai selisih bila berbeda. Total aplikasi yang dipakai sebagai hasil, bukan totalmu — tapi usulanmu tidak dibuang diam-diam.`;
}

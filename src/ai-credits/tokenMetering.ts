/**
 * TOKEN METERING — basis pemotongan kredit AI (Amendemen Spec Billing v1.1)
 * ============================================================================
 * Keputusan owner 2026-11-06: pemotongan kredit dihitung dari token
 * INPUT + OUTPUT aktual, BUKAN per kata jawaban dan BUKAN flat per
 * generasi, pada tingkat konversi 5×:
 *
 *     1 kredit = 200 token terbobot
 *     token terbobot = tokenIn × 1 + tokenOut × OUTPUT_TOKEN_WEIGHT
 *     kredit = max(1, ceil(token terbobot / 200))
 *
 * OUTPUT_TOKEN_WEIGHT = 3 adalah konstanta kalibrasi simulasi yang
 * menggantikan sementara rasio harga provider per model dari tabel
 * `ai_provider_rates` (Spec §14) — rasio itulah yang kelak mengisinya
 * per model saat metering backend aktif. Nilai 3 mereproduksi ilustrasi
 * kalibrasi yang disetujui owner (2.000 token masuk + 1.000 token keluar
 * = 5.000 token terbobot = 25 kredit; DED menengah ±150.000 token
 * terbobot = ±750 kredit).
 *
 * KETERBATASAN JUJUR (simulasi frontend): jumlah token provider TIDAK
 * pernah mencapai klien — gateway menghitung usage di server lalu
 * membuangnya (usage meter belum tersambung). Selama backend belum
 * aktif, token di sini DIESTIMASI dari teks yang terlihat klien
 * (percakapan yang dikirim + teks jawaban) memakai SIM_CHARS_PER_TOKEN.
 * Angka ini estimasi simulasi dan selalu dilabeli sebagai estimasi —
 * bukan angka usage provider. Saat metering backend aktif, fungsi yang
 * sama menerima token aktual dari server tanpa perubahan rumus.
 */

/** Token terbobot per 1 kredit (Amendemen v1.1 — tingkat 5×). */
export const WEIGHTED_TOKENS_PER_CREDIT = 200;

/** Bobot token output terhadap input (pengganti sementara rasio ai_provider_rates). */
export const OUTPUT_TOKEN_WEIGHT = 3;

/** Heuristik estimasi token dari teks pada simulasi klien (±4 karakter/token). */
export const SIM_CHARS_PER_TOKEN = 4;

/** Tunjangan token keluar untuk estimasi reservation sebelum jawaban ada. */
export const RESERVATION_OUTPUT_ALLOWANCE_TOKENS = 1_000;

export interface TokenMeterResult {
  tokensIn: number;
  tokensOut: number;
  weightedTokens: number;
  credits: number;
}

/** Estimasi jumlah token dari teks (simulasi klien). Teks kosong = 0. */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / SIM_CHARS_PER_TOKEN);
}

/** Token terbobot dari pasangan input/output. */
export function weightedTokensFor(tokensIn: number, tokensOut: number): number {
  return Math.max(0, Math.round(tokensIn)) + Math.max(0, Math.round(tokensOut)) * OUTPUT_TOKEN_WEIGHT;
}

/** Kredit untuk pasangan token: ceil(terbobot / 200), minimum 1 bila ada pemakaian. */
export function creditsForTokens(tokensIn: number, tokensOut: number): number {
  const weighted = weightedTokensFor(tokensIn, tokensOut);
  if (weighted <= 0) return 0;
  return Math.max(1, Math.ceil(weighted / WEIGHTED_TOKENS_PER_CREDIT));
}

/** Metering lengkap dari jumlah token. */
export function meterTokens(tokensIn: number, tokensOut: number): TokenMeterResult {
  const weightedTokens = weightedTokensFor(tokensIn, tokensOut);
  return {
    tokensIn: Math.max(0, Math.round(tokensIn)),
    tokensOut: Math.max(0, Math.round(tokensOut)),
    weightedTokens,
    credits: creditsForTokens(tokensIn, tokensOut),
  };
}

/** Metering dari teks mentah (estimasi simulasi klien). */
export function meterTexts(inputText: string, outputText: string): TokenMeterResult {
  return meterTokens(estimateTokensFromText(inputText), estimateTokensFromText(outputText));
}

/**
 * Estimasi reservation sebelum proses berjalan: token input yang sudah
 * diketahui + tunjangan token keluar standar. Dipakai gerbang saldo dan
 * dialog konfirmasi (settlement tetap memakai token aktual sesudahnya).
 */
export function estimateReservationCredits(inputText: string): number {
  const tokensIn = estimateTokensFromText(inputText);
  return Math.max(1, creditsForTokens(tokensIn, RESERVATION_OUTPUT_ALLOWANCE_TOKENS));
}

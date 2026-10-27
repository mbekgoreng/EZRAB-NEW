/**
 * DED AI ESTIMATE — Pricing (src/ai-tools/ded-ai-estimate/pricing.ts)
 * Price estimation for DED AI Estimate. Prices are ALWAYS `AI_ESTIMATE` and NEVER
 * come from AHSP matcher / price resolver / HSD database / masterRegistry / official
 * price database / project price engine. When no price basis exists, unitPrice = null.
 */

import type { DedEstimationPolicy } from './types';

export function isSaneEstimate(value: number | null | undefined): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value <= 0) return false;
  if (value < 100) return false; // sub-100 IDR unit price is nonsense
  if (value > 50_000_000_000) return false; // > Rp 50 M per unit is absurd
  return true;
}

export function applyAiEstimatePrice(
  rawPrice: number | null | undefined,
  note?: string
): { unitPrice: number | null; priceSource: 'AI_ESTIMATE' | 'UNRESOLVED'; note?: string } {
  if (rawPrice === null || rawPrice === undefined || rawPrice <= 0) {
    return { unitPrice: null, priceSource: 'UNRESOLVED', note: 'Harga tidak tersedia dari AI' };
  }
  if (!isSaneEstimate(rawPrice)) {
    return { unitPrice: null, priceSource: 'UNRESOLVED', note: `Estimasi harga tidak wajar (${rawPrice}), ditolak` };
  }
  return { unitPrice: Math.round(rawPrice), priceSource: 'AI_ESTIMATE', note: note || 'Estimasi AI' };
}

/**
 * Gerbang kebijakan harga DED-to-RAB (service layer, bukan instruksi UI).
 * Keputusan owner 2026-10-27 malam (menggantikan aturan lama yang
 * menolak estimasi di mode Database — aturan lama itulah yang membuat
 * analisis Database gagal total NO_CALCULABLE_ITEMS bila tidak ada satu
 * pun item yang cocok kanonis persis):
 * - FULL_AI: murni AI — estimasi AI diterima bila lolos isSaneEstimate,
 *   dilabel AI_ESTIMATE; bila tidak wajar/hilang → UNRESOLVED.
 * - DATABASE: AI tetap mengidentifikasi pekerjaan + volume seperti
 *   FULL_AI; harga diutamakan dari database AHSP kanonis (diputuskan
 *   adapter, bukan gerbang ini). Estimasi AI di sini HANYA fallback
 *   bila kanonis gagal — adapter yang memakainya, selalu berlabel
 *   AI_ESTIMATE (perkiraan, bukan harga database). Estimasi yang tidak
 *   wajar/hilang tetap UNRESOLVED. USER_INPUT tidak pernah disentuh
 *   gerbang ini (edit pengguna pasca analisis).
 * Fungsi ini murni dan menjadi satu-satunya tempat keputusan harga AI
 * di mesin standar (dipakai convertAiItem di service.ts).
 */
export function resolveDedPriceForPolicy(
  policy: DedEstimationPolicy | undefined,
  rawPrice: number | null | undefined,
  note?: string
): { unitPrice: number | null; priceSource: 'AI_ESTIMATE' | 'UNRESOLVED'; note?: string } {
  const effective: DedEstimationPolicy = policy ?? 'FULL_AI';
  if (effective === 'DATABASE') {
    // Fallback saja: adapter memakai estimasi ini HANYA bila harga
    // kanonis gagal (tidak ada di database). Estimasi tak wajar tetap
    // UNRESOLVED lewat applyAiEstimatePrice (isSaneEstimate).
    return applyAiEstimatePrice(rawPrice, note || 'Estimasi AI — fallback bila tidak ada di database AHSP');
  }
  return applyAiEstimatePrice(rawPrice, note);
}

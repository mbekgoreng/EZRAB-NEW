/**
 * DED AI ESTIMATE — Pricing (src/ai-tools/ded-ai-estimate/pricing.ts)
 * Price estimation for DED AI Estimate. Prices are ALWAYS `AI_ESTIMATE` and NEVER
 * come from AHSP matcher / price resolver / HSD database / masterRegistry / official
 * price database / project price engine. When no price basis exists, unitPrice = null.
 */

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

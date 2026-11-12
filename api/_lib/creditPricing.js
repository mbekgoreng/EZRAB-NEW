/**
 * api/_lib/creditPricing.js — Pricing Engine (Phase 3)
 * ============================================================================
 * Memisahkan DUA konsep yang tidak boleh dicampur:
 *
 * A. BIAYA PROVIDER — dihitung dari usage metadata aktual + tarif provider
 *    berversi. Jika salah satu tidak tersedia → UNDETERMINED (jujur).
 *
 * B. HARGA KREDIT EZRAB — tarif per fitur dari konfigurasi draft Phase 1
 *    (belum dikalibrasi ke biaya aktual; BUKAN tarif produksi).
 *
 * Aturan:
 * - Jangan menyamakan biaya provider dengan harga kredit pengguna.
 * - Estimasi memakai tarif draft; aktual memakai kebijakan yang disetujui.
 * - Tidak pernah melebihi max_credits yang disetujui pengguna.
 * - SETTLE (K7, Gelombang 2): tagihan final SELALU token-metered v1.1
 *   dari usage aktual (pricingPolicy: 1 kredit = 200 token terbobot).
 *   Flat 500/650/800 HANYA plafon reservasi — bukan dasar settle.
 *   Tanpa usage aktual, TIDAK ADA tagihan (ke review, bukan flat).
 */
import { computeProviderCost, TARIFF_VERSION } from './providerTariffs.js';
import { creditsForTokenUsage } from './pricingPolicy.js';

/** Tarif draft Phase 1 — rancangan bisnis, BELUM dikalibrasi. */
export const EZRAB_DRAFT_TARIFFS = {
  version: 'phase1-draft-2026-10-18',
  isCalibratedDraft: true,
  tariffs: {
    'chat-ai/fast': { min: 5, max: 20 },
    'chat-ai/advanced': { min: 20, max: 50 },
    'ai-document/simple': { min: 50, max: 100 },
    'ai-document/complex': { min: 100, max: 250 },
    'ded-ai/simple': { target: 500 },
    'ded-ai/medium': { target: 650 },
    'ded-ai/complex': { target: 800 },
    'ded-ai/revision': { min: 100, max: 300 },
  },
};

export function getDraftTariff(featureKey) {
  return EZRAB_DRAFT_TARIFFS.tariffs[featureKey] || null;
}

/**
 * Estimasi kredit SEBELUM proses — dari informasi yang tersedia.
 * Untuk chat: pakai max (konservatif). Untuk DED: pakai target kategori.
 */
export function estimateCredits(featureKey) {
  const t = getDraftTariff(featureKey);
  if (!t) return { ok: false, error: 'UNKNOWN_FEATURE' };
  const estimate = t.target ?? t.max ?? t.min ?? 0;
  const max = t.target ?? t.max ?? t.min ?? 0;
  return {
    ok: true,
    feature: featureKey,
    estimate,
    max,
    min: t.min ?? estimate,
    tariffVersion: EZRAB_DRAFT_TARIFFS.version,
    isCalibratedDraft: true,
    label: 'Estimasi',
  };
}

/**
 * Hitung kredit akhir SETELAH proses — SETTLE TOKEN-METERED (K7).
 *
 * - Usage token aktual tersedia → kredit dari metering v1.1
 *   (pricingPolicy.creditsForTokenUsage: 1 kredit = 200 token terbobot),
 *   DIBATASI plafon reservasi = min(estimasi flat kategori, approvedMax).
 *   Flat 500/650/800 adalah PLAFON RESERVASI, bukan dasar settle:
 *   DED yang memakai sedikit token ditagih sedikit, bukan 500/650/800.
 * - Metered melebihi plafon → tagih plafon saja + requiresReview true
 *   dengan overageCredits tercatat (overage ke review manual — TIDAK
 *   pernah auto-debit di atas yang disetujui pengguna).
 * - Usage TIDAK tersedia → { ok:false, error:'USAGE_UNAVAILABLE',
 *   requiresReview:true } — TIDAK PERNAH menagih flat atas usage yang
 *   tidak diketahui. Kebijakan lama `estimate_based_draft` (menagih
 *   plafon penuh tanpa usage) DICABUT oleh K7.
 */
export function finalizeCredits(featureKey, usage, providerCost, approvedMax) {
  const est = estimateCredits(featureKey);
  if (!est.ok) return est;

  // Batas keras: tidak pernah melebihi yang disetujui pengguna (dan
  // tidak pernah melebihi plafon reservasi kategori).
  const cap = Math.min(est.max, approvedMax ?? est.max);
  const providerCostShape =
    providerCost && providerCost.status === 'ACTUAL'
      ? { status: 'ACTUAL', costUsd: providerCost.costUsd }
      : { status: providerCost?.status, reason: providerCost?.reason };

  const hasUsage = usage && usage.inputTokens != null && usage.outputTokens != null;
  if (!hasUsage) {
    return {
      ok: false,
      error: 'USAGE_UNAVAILABLE',
      requiresReview: true,
      feature: featureKey,
      creditsCharged: null,
      approvedMax: cap,
      policy: 'token-metered-v1.1',
      providerCost: providerCostShape,
      usage: { status: 'USAGE_UNAVAILABLE' },
      label: 'Menunggu review — usage tidak tersedia, tidak ada tagihan',
      tariffVersion: EZRAB_DRAFT_TARIFFS.version,
      providerTariffVersion: TARIFF_VERSION,
    };
  }

  const metered = creditsForTokenUsage({
    tokensIn: usage.inputTokens,
    tokensOut: usage.outputTokens,
    tokensCached: usage.cachedTokens != null ? usage.cachedTokens : 0,
  });
  if (!metered.ok) {
    return {
      ok: false,
      error: metered.error,
      requiresReview: true,
      feature: featureKey,
      creditsCharged: null,
      approvedMax: cap,
      policy: 'token-metered-v1.1',
      providerCost: providerCostShape,
      usage: { status: 'USAGE_UNAVAILABLE' },
      label: 'Menunggu review — usage tidak dapat dimetering, tidak ada tagihan',
      tariffVersion: EZRAB_DRAFT_TARIFFS.version,
      providerTariffVersion: TARIFF_VERSION,
    };
  }

  const overageCredits = Math.max(0, metered.credits - cap);
  return {
    ok: true,
    feature: featureKey,
    creditsCharged: Math.min(metered.credits, cap),
    approvedMax: cap,
    policy: 'token-metered-v1.1',
    policyVersion: metered.policyVersion,
    weightedTokens: metered.weightedTokens,
    meteredCredits: metered.credits,
    requiresReview: overageCredits > 0,
    overageCredits,
    providerCost: providerCostShape,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      status: 'actual',
    },
    label:
      overageCredits > 0
        ? 'Aktual terverifikasi — melebihi plafon, overage menunggu review'
        : 'Aktual terverifikasi (token-metered v1.1)',
    tariffVersion: EZRAB_DRAFT_TARIFFS.version,
    providerTariffVersion: TARIFF_VERSION,
  };
}

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
 */
import { computeProviderCost, TARIFF_VERSION } from './providerTariffs.js';

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
 * Hitung kredit akhir SETELAH proses.
 * Kebijakan saat ini (draft): tagih sesuai estimasi maksimum yang disetujui,
 * karena biaya provider aktual belum dapat dihitung (tarif belum dikonfigurasi).
 * Ketika tarif provider tersedia, kebijakan dapat beralih ke usage-based
 * dengan persetujuan pemilik produk — TIDAK otomatis.
 */
export function finalizeCredits(featureKey, usage, providerCost, approvedMax) {
  const est = estimateCredits(featureKey);
  if (!est.ok) return est;

  // Batas keras: tidak pernah melebihi yang disetujui pengguna.
  const cap = Math.min(est.max, approvedMax ?? est.max);

  // Jika biaya provider aktual tersedia DAN kebijakan usage-based disetujui,
  // hitung dari biaya. Saat ini: kebijakan = pakai estimasi (draft).
  const policy = 'estimate_based_draft';

  return {
    ok: true,
    feature: featureKey,
    creditsCharged: cap,
    approvedMax: cap,
    policy,
    providerCost: providerCost.status === 'ACTUAL'
      ? { status: 'ACTUAL', costUsd: providerCost.costUsd }
      : { status: providerCost.status, reason: providerCost.reason },
    usage: usage && usage.inputTokens != null
      ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, status: 'actual' }
      : { status: 'USAGE_UNAVAILABLE' },
    label: 'Aktual terverifikasi (kebijakan draft)',
    tariffVersion: EZRAB_DRAFT_TARIFFS.version,
    providerTariffVersion: TARIFF_VERSION,
  };
}

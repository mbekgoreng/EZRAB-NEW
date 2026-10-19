/**
 * api/_lib/providerTariffs.js — Tarif provider AI (Phase 3)
 * ============================================================================
 * ATURAN KERAS: jangan mengarang harga API. Tarif yang belum diverifikasi
 * dari sumber resmi provider BERNILAI NULL → biaya berstatus UNDETERMINED.
 *
 * Struktur berversi: perubahan tarif = versi baru, bukan overwrite.
 * Frontend TIDAK membaca file ini — hanya via endpoint backend.
 *
 * Mata uang: USD per 1 juta token (konvensi industri).
 * Konversi ke IDR memakai kurs tercatat (fx_rate_idr + timestamp + sumber).
 */

export const TARIFF_VERSION = '2026-10-18.1';

/**
 * Tarif per model. null = BELUM DIKONFIGURASI (jangan diisi asal).
 * Sumber resmi harus dicantumkan saat mengisi.
 */
export const PROVIDER_TARIFFS = {
  version: TARIFF_VERSION,
  models: {
    // Gemini 3.5 Flash Lite — tarif resmi BELUM dimasukkan.
    'gemini-3.5-flash-lite': {
      provider: 'gemini',
      inputPer1M: null,
      outputPer1M: null,
      cachedInputPer1M: null,
      currency: 'USD',
      source: null,
      configured: false,
    },
    // geminiflash-3.8 (via ZyRouter) — tarif resmi BELUM dimasukkan.
    'geminiflash-3.8': {
      provider: 'zyrouter',
      inputPer1M: null,
      outputPer1M: null,
      cachedInputPer1M: null,
      currency: 'USD',
      source: null,
      configured: false,
    },
    // Atria-Dawn-Preview — tarif resmi BELUM dimasukkan.
    'Atria-Dawn-Preview': {
      provider: 'atria',
      inputPer1M: null,
      outputPer1M: null,
      cachedInputPer1M: null,
      currency: 'USD',
      source: null,
      configured: false,
    },
  },
};

/** Kurs default — diganti dengan kurs tercatat saat rekonsiliasi. */
export const DEFAULT_FX = {
  usdToIdr: null, // BELUM DIKONFIGURASI — isi dari sumber kurs resmi
  source: null,
  at: null,
};

export function getModelTariff(model) {
  const t = PROVIDER_TARIFFS.models[model];
  if (!t) return { configured: false, reason: 'MODEL_UNKNOWN' };
  return t;
}

/**
 * Hitung biaya provider dari usage metadata.
 * Mengembalikan { status: 'ACTUAL'|'UNDETERMINED'|'USAGE_UNAVAILABLE', ... }.
 * TIDAK PERNAH menebak token atau tarif.
 */
export function computeProviderCost(usage, model, fx = DEFAULT_FX) {
  if (!usage || usage.inputTokens == null || usage.outputTokens == null) {
    return { status: 'USAGE_UNAVAILABLE', costUsd: null, reason: 'Provider tidak mengembalikan usage metadata' };
  }
  const tariff = getModelTariff(model);
  if (!tariff.configured || tariff.inputPer1M == null || tariff.outputPer1M == null) {
    return {
      status: 'UNDETERMINED',
      costUsd: null,
      reason: `Tarif provider untuk model "${model}" belum dikonfigurasi (versi ${TARIFF_VERSION})`,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    };
  }
  // Cached tokens sudah termasuk dalam inputTokens (hindari double counting).
  const costUsd =
    (usage.inputTokens / 1e6) * tariff.inputPer1M +
    (usage.outputTokens / 1e6) * tariff.outputPer1M;
  const result = {
    status: 'ACTUAL',
    costUsd,
    currency: 'USD',
    tariffVersion: TARIFF_VERSION,
    tariffSource: tariff.source,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens ?? null,
    },
  };
  if (fx.usdToIdr != null) {
    result.costIdr = costUsd * fx.usdToIdr;
    result.fx = { usdToIdr: fx.usdToIdr, source: fx.source, at: fx.at };
  }
  return result;
}

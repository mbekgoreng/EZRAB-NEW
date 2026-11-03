/**
 * api/_lib/tariffRegistry.js — Registri tarif provider berversi (Phase 5)
 * ============================================================================
 * ATURAN KERAS (sama seperti providerTariffs.js): JANGAN mengarang harga API.
 * Tarif yang belum diverifikasi dari sumber resmi provider bernilai null dan
 * berstatus UNKNOWN/UNVERIFIED → biaya operasi TIDAK bisa diklaim terverifikasi
 * dan margin/profitabilitas TIDAK boleh dihitung darinya.
 *
 * Perbedaan dengan providerTariffs.js (Phase 3, tidak diubah): file ini adalah
 * registri berbentuk instance (createTariffRegistry) yang bisa diisi record
 * berversi dan di-query per (provider, model, waktu), dipakai oleh ledger
 * Phase 5 untuk memvalidasi versi tarif saat settlement. providerTariffs.js
 * tetap menjadi sumber tarif statis gateway yang lama.
 *
 * Usage mentah provider selalu dipertahankan di samping usage ternormalisasi
 * (normalizeProviderUsage mengembalikan `raw` apa adanya) — normalisasi tidak
 * boleh menghancurkan bukti.
 */

/** Versi registri seed Phase 5. */
export const TARIFF_REGISTRY_VERSION = '2026-11-02.1';

/**
 * Record tarif:
 * { providerId, modelId, inputPer1M, outputPer1M, cachedInputPer1M,
 *   currency, effectiveFrom, effectiveTo, version, source,
 *   verificationStatus: 'VERIFIED'|'UNVERIFIED'|'UNKNOWN' }
 * Harga dalam satuan mata uang per 1 juta token; null = belum diketahui.
 */
function seedRecords() {
  const base = {
    inputPer1M: null,
    outputPer1M: null,
    cachedInputPer1M: null,
    currency: 'USD',
    effectiveFrom: null,
    effectiveTo: null,
    version: TARIFF_REGISTRY_VERSION,
    source: null,
    verificationStatus: 'UNKNOWN',
  };
  return [
    { ...base, providerId: 'gemini', modelId: 'gemini-3.5-flash-lite' },
    { ...base, providerId: 'zyrouter', modelId: 'geminiflash-3.8' },
    { ...base, providerId: 'atria', modelId: 'Atria-Dawn-Preview' },
  ];
}

function isPriced(t) {
  return t && t.inputPer1M != null && t.outputPer1M != null;
}

export function createTariffRegistry(records) {
  const list = (records || seedRecords()).map((r) => ({ ...r }));

  function register(record) {
    list.push({ ...record });
    return { ...record };
  }

  function all() {
    return list.map((r) => ({ ...r }));
  }

  /** Versi tarif dikenal registri ini? (dipakai ledger saat settlement) */
  function hasVersion(version) {
    if (version == null) return false;
    return list.some((r) => r.version === version);
  }

  /**
   * Tarif yang berlaku untuk (providerId, modelId) pada waktu `at` (ms epoch;
   * default sekarang). Record dengan effectiveFrom/effectiveTo null dianggap
   * berlaku tak terbatas di sisi itu. Bila beberapa record cocok, yang
   * effectiveFrom-nya paling akhir yang menang. null bila tidak ada.
   */
  function getTariff(providerId, modelId, at) {
    const when = at == null ? Date.now() : at;
    const matches = list.filter((r) => {
      if (r.providerId !== providerId || r.modelId !== modelId) return false;
      if (r.effectiveFrom != null && r.effectiveFrom > when) return false;
      if (r.effectiveTo != null && when >= r.effectiveTo) return false;
      return true;
    });
    if (matches.length === 0) return null;
    matches.sort((a, b) => (a.effectiveFrom || 0) - (b.effectiveFrom || 0));
    return { ...matches[matches.length - 1] };
  }

  return { register, all, hasVersion, getTariff };
}

/** Registri default (seed UNKNOWN) — dipakai ledger bila tidak diberi registri lain. */
export const defaultTariffRegistry = createTariffRegistry();

/**
 * Hitung biaya moneter dari usage ternormalisasi + record tarif.
 * usage: { tokensIn, tokensOut, tokensCached } (tokensIn TERMASUK cached,
 * konvensi Gemini). Floating point DIPERBOLEHKAN di sini — ini uang tampilan/
 * rekonsiliasi, BUKAN saldo kredit (saldo kredit selalu integer, lihat
 * creditLedger.js). Bila tarif tidak ada/belum berharga → UNDETERMINED,
 * tidak pernah angka tebakan.
 */
export function computeUsageCost(usage, tariff) {
  if (!usage || usage.tokensIn == null || usage.tokensOut == null) {
    return { status: 'USAGE_UNAVAILABLE', cost: null, currency: null, tariffVersion: null };
  }
  if (!isPriced(tariff)) {
    return {
      status: 'UNDETERMINED',
      cost: null,
      currency: tariff ? tariff.currency : null,
      tariffVersion: tariff ? tariff.version : null,
      reason: 'Tarif provider belum dikonfigurasi/diverifikasi — biaya tidak dapat diklaim.',
    };
  }
  const cached = usage.tokensCached || 0;
  const freshIn = Math.max(0, usage.tokensIn - cached);
  const cachedRate = tariff.cachedInputPer1M != null ? tariff.cachedInputPer1M : tariff.inputPer1M;
  const cost =
    (freshIn / 1e6) * tariff.inputPer1M +
    (cached / 1e6) * cachedRate +
    (usage.tokensOut / 1e6) * tariff.outputPer1M;
  return {
    status: 'ACTUAL',
    cost,
    currency: tariff.currency,
    tariffVersion: tariff.version,
    verificationStatus: tariff.verificationStatus,
    breakdown: { freshInputTokens: freshIn, cachedTokens: cached, outputTokens: usage.tokensOut },
  };
}

/**
 * Konversi usage token → kredit aktual menurut tarif berversi.
 * rate = { creditsPer1kIn, creditsPer1kOut, creditsPer1kCached? } — kebijakan
 * konversi kredit per 1.000 token, dikelola terpisah dari harga uang provider.
 * rate null/belum lengkap → { status:'UNKNOWN_TARIFF' } (jujur, tidak menebak).
 * Hasil kredit selalu INTEGER (dibulatkan ke atas — pecahan token tidak boleh
 * menghasilkan pecahan kredit; saldo ledger hanya mengenal integer).
 */
export function creditsFromTokens(usage, tariff, rate) {
  if (!usage || usage.tokensIn == null || usage.tokensOut == null) {
    return { status: 'USAGE_UNAVAILABLE', credits: null };
  }
  if (!tariff) return { status: 'UNKNOWN_TARIFF', credits: null };
  if (!rate || rate.creditsPer1kIn == null || rate.creditsPer1kOut == null) {
    return { status: 'UNKNOWN_TARIFF', credits: null, tariffVersion: tariff.version };
  }
  const cached = usage.tokensCached || 0;
  const freshIn = Math.max(0, usage.tokensIn - cached);
  const cachedRate = rate.creditsPer1kCached != null ? rate.creditsPer1kCached : rate.creditsPer1kIn;
  const raw =
    (freshIn * rate.creditsPer1kIn + cached * cachedRate + usage.tokensOut * rate.creditsPer1kOut) / 1000;
  return { status: 'OK', credits: Math.ceil(raw), tariffVersion: tariff.version };
}

/**
 * Adapter normalisasi usage per provider. Mengembalikan
 * { tokensIn, tokensOut, tokensCached, raw } — `raw` adalah objek usage
 * provider APA ADANYA (bukti dipertahankan, tidak ditimpa normalisasi).
 * Field yang tidak disediakan provider → null (terdeteksi sebagai tidak
 * terverifikasi oleh pemanggil), tidak pernah diisi tebakan.
 */
export function normalizeProviderUsage(providerId, rawUsage) {
  const raw = rawUsage == null ? null : rawUsage;
  if (raw == null) return { tokensIn: null, tokensOut: null, tokensCached: null, raw: null };
  if (providerId === 'gemini') {
    const um = raw.usageMetadata || raw;
    return {
      tokensIn: um.promptTokenCount != null ? um.promptTokenCount : null,
      tokensOut: um.candidatesTokenCount != null ? um.candidatesTokenCount : null,
      tokensCached: um.cachedContentTokenCount != null ? um.cachedContentTokenCount : 0,
      raw,
    };
  }
  if (providerId === 'generic') {
    const cached =
      raw.prompt_tokens_details && raw.prompt_tokens_details.cached_tokens != null
        ? raw.prompt_tokens_details.cached_tokens
        : 0;
    return {
      tokensIn: raw.prompt_tokens != null ? raw.prompt_tokens : null,
      tokensOut: raw.completion_tokens != null ? raw.completion_tokens : null,
      tokensCached: cached,
      raw,
    };
  }
  // Provider tanpa adapter eksplisit: tidak menebak field apa pun.
  return { tokensIn: null, tokensOut: null, tokensCached: null, raw };
}

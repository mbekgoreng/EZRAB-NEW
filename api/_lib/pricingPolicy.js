/**
 * api/_lib/pricingPolicy.js — Registri kebijakan harga BERVERSI (Unified Credits)
 * ============================================================================
 * DORMANT: file ini TIDAK diimpor oleh handler/UI mana pun. Ia adalah fondasi
 * konfigurasi PricingEngine untuk Fase Unified AI Credits — bukan jalur
 * penagihan aktif.
 *
 * Dua kebijakan yang hidup berdampingan dan TIDAK boleh dicampur:
 *
 * A. 'v1.1-token-metering' (LOCKED_OWNER) — metering Amendemen Spec Billing
 *    v1.1 (keputusan owner 2026-11-06), sama dengan konstanta di
 *    src/ai-credits/tokenMetering.ts:
 *      1 kredit = 200 token terbobot; input ×1; cached ×1;
 *      output ×OUTPUT_WEIGHT; kredit = max(1, ceil(terbobot / 200)).
 *    Bobot output RESMI adalah rasio harga provider per model
 *    (PROVIDER_PRICE_RATIO). Rasio nyata BELUM terverifikasi — tarif seed
 *    di tariffRegistry.js semuanya NULL/UNKNOWN — jadi nilai yang dipakai
 *    adalah interimValue 3 dengan penanda interim: true. Angka interim
 *    BUKAN harga provider dan tidak boleh diklaim sebagai rasio final.
 *
 * B. 'margin-formula-proposal' (PENDING_OWNER_DECISION) — usulan formula
 *    margin: revenue = biaya × multiplier / (1 − margin). SELURUH parameter
 *    komersialnya (nilai kredit dalam IDR, multiplier biaya, margin target,
 *    kurs) BELUM diputuskan owner → null + status PENDING eksplisit.
 *    DILARANG mengisi nilai tebakan di sini; selama parameter belum lengkap
 *    evaluateMarginPrice menjawab PENDING_CONFIGURATION secara jujur.
 *
 * Aritmetika kredit/uang: INTEGER saja (BigInt untuk perkalian formula
 * margin). Jumlah kredit float/negatif/NaN ditolak.
 */

export const PRICING_POLICY_VERSION_V11 = 'v1.1-token-metering';
export const PRICING_POLICY_VERSION_MARGIN = 'margin-formula-proposal';

/** Parameter formula margin yang wajib diputuskan owner (urutan stabil). */
export const MARGIN_PARAM_NAMES = [
  'creditValueIdr',
  'costMultiplierMilli',
  'targetGrossMarginBps',
  'fxIdrPerUsd',
];

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

/**
 * Registri kebijakan. Entri dibekukan; pemanggil menerima salinan lewat
 * getPricingPolicy agar tidak bisa mengubah registri secara diam-diam.
 */
export const PRICING_POLICIES = deepFreeze([
  {
    version: PRICING_POLICY_VERSION_V11,
    status: 'LOCKED_OWNER',
    basis: 'TOKEN_METERING',
    // Metering Amendemen v1.1 yang terkunci.
    weightedTokensPerCredit: 200,
    inputWeight: 1,
    cachedInputWeight: 1,
    outputWeight: {
      mode: 'PROVIDER_PRICE_RATIO',
      // Interim: rasio provider nyata belum terverifikasi (tarif seed
      // semua NULL) — nilai 3 mereproduksi kalibrasi yang disetujui owner.
      interimValue: 3,
      interim: true,
    },
    minCreditsPerAiOperation: 1,
  },
  {
    version: PRICING_POLICY_VERSION_MARGIN,
    status: 'PENDING_OWNER_DECISION',
    basis: 'MARGIN_FORMULA',
    // SEMUA null: belum ada keputusan owner untuk nilai kredit IDR,
    // multiplier, margin final, maupun kurs. Jangan diisi tebakan.
    params: {
      creditValueIdr: null,
      costMultiplierMilli: null,
      targetGrossMarginBps: null,
      fxIdrPerUsd: null,
    },
  },
]);

const POLICY_BY_VERSION = new Map(PRICING_POLICIES.map((p) => [p.version, p]));

/**
 * Ambil kebijakan berdasarkan versi; tanpa argumen → kebijakan metering
 * terkunci v1.1. Versi tak dikenal → null (tidak pernah menebak).
 * Mengembalikan salinan (bukan referensi registri).
 */
export function getPricingPolicy(version) {
  const key = version == null ? PRICING_POLICY_VERSION_V11 : version;
  const found = POLICY_BY_VERSION.get(key);
  return found ? clone(found) : null;
}

/** Normalisasi argumen kebijakan: terima objek kebijakan, string versi, atau kosong (default v1.1). */
function resolvePolicy(policyOrVersion) {
  if (policyOrVersion == null) return getPricingPolicy();
  if (typeof policyOrVersion === 'string') return getPricingPolicy(policyOrVersion);
  if (typeof policyOrVersion === 'object') return policyOrVersion;
  return null;
}

function isNonNegativeInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function isTokenMeteringPolicy(policy) {
  return Boolean(
    policy &&
      policy.basis === 'TOKEN_METERING' &&
      Number.isInteger(policy.weightedTokensPerCredit) &&
      policy.weightedTokensPerCredit > 0 &&
      Number.isInteger(policy.inputWeight) &&
      Number.isInteger(policy.cachedInputWeight) &&
      policy.outputWeight &&
      typeof policy.outputWeight.interimValue === 'number' &&
      policy.outputWeight.interimValue > 0,
  );
}

/**
 * Token terbobot dari usage ternormalisasi.
 * usage: { tokensIn, tokensOut, tokensCached } — tokensIn TERMASUK cached
 * (konvensi yang sama dengan tariffRegistry.js / tokenMetering.ts);
 * tokensCached boleh kosong (dianggap 0), selain itu wajib integer ≥ 0.
 *
 * tokensIn/tokensOut null / bukan integer ≥ 0 → null (USAGE tak tersedia;
 * pemanggil memutuskan error-nya — di sini tidak ada angka tebakan).
 *
 * Rumus: freshIn = max(0, in − cached);
 *        terbobot = freshIn × inputWeight + cached × cachedInputWeight
 *                   + out × outputWeightUsed.
 * outputWeightUsed: bobot output TERVERIFIKASI dari pemanggil (angka > 0)
 * bila diberikan; selain itu interimValue kebijakan dengan interim: true.
 */
export function weightedTokensForUsage(usage, policy, options) {
  if (!usage || !isNonNegativeInt(usage.tokensIn) || !isNonNegativeInt(usage.tokensOut)) {
    return null;
  }
  const cachedRaw = usage.tokensCached == null ? 0 : usage.tokensCached;
  if (!isNonNegativeInt(cachedRaw)) return null;

  const resolved = resolvePolicy(policy);
  if (!isTokenMeteringPolicy(resolved)) return null;

  const opts = options || {};
  let outputWeightUsed;
  let interim;
  if (opts.outputWeight != null) {
    if (typeof opts.outputWeight !== 'number' || !Number.isFinite(opts.outputWeight) || opts.outputWeight <= 0) {
      return null;
    }
    outputWeightUsed = opts.outputWeight;
    interim = false;
  } else {
    outputWeightUsed = resolved.outputWeight.interimValue;
    interim = resolved.outputWeight.interim === true;
  }

  const cached = cachedRaw;
  const freshIn = Math.max(0, usage.tokensIn - cached);
  const weightedTokens =
    freshIn * resolved.inputWeight + cached * resolved.cachedInputWeight + usage.tokensOut * outputWeightUsed;
  return { weightedTokens, outputWeightUsed, interim };
}

/**
 * Konversi usage token → kredit menurut kebijakan metering.
 * opts: { policy | policyVersion | version, outputWeight }.
 * Hasil: { ok:true, credits, weightedTokens, policyVersion, interim } dengan
 * credits = max(minCreditsPerAiOperation, ceil(weighted / perCredit))
 * (selalu INTEGER), atau { ok:false, error:'USAGE_UNAVAILABLE' |
 * 'UNKNOWN_POLICY' }.
 */
export function creditsForTokenUsage(usage, opts) {
  const options = opts || {};
  const policyArg =
    options.policy != null ? options.policy : options.policyVersion != null ? options.policyVersion : options.version;
  const policy = resolvePolicy(policyArg);
  if (!policy) return { ok: false, error: 'UNKNOWN_POLICY' };
  if (!isTokenMeteringPolicy(policy)) return { ok: false, error: 'UNKNOWN_POLICY' };

  const weighted = weightedTokensForUsage(usage, policy, { outputWeight: options.outputWeight });
  if (!weighted) return { ok: false, error: 'USAGE_UNAVAILABLE' };

  const min = Number.isInteger(policy.minCreditsPerAiOperation) ? policy.minCreditsPerAiOperation : 1;
  const credits = Math.max(min, Math.ceil(weighted.weightedTokens / policy.weightedTokensPerCredit));
  return {
    ok: true,
    credits,
    weightedTokens: weighted.weightedTokens,
    policyVersion: policy.version,
    interim: weighted.interim,
  };
}

/**
 * Turunkan rate { creditsPer1kIn, creditsPer1kOut } yang EKIVALEN untuk
 * tariffRegistry.creditsFromTokens(usage, tariff, rate).
 *
 * Ekuivalensi (untuk kebijakan v1.1): creditsFromTokens menghitung
 *   ceil((freshIn × rateIn + cached × rateCached + out × rateOut) / 1000)
 * sedangkan metering v1.1 menghitung ceil(terbobot / 200) dengan terbobot
 * memakai bobot 1 / 1 / 3. Karena 1000 / 200 = 5:
 *   rateIn = 5 × inputWeight = 5, rateCached = 5 × cachedInputWeight = 5,
 *   rateOut = 5 × outputWeightUsed = 15 (interim).
 * Kedua jalur menghasilkan kredit yang sama untuk usage yang sama, kecuali
 * usage nol: creditsFromTokens memberi 0, metering memberi minimum 1 —
 * minimum per-operasi adalah kebijakan ledger, bukan tarif.
 * Kebijakan tak dikenal / bukan TOKEN_METERING → null.
 */
export function deriveTokenRate(policy, options) {
  const resolved = resolvePolicy(policy);
  if (!isTokenMeteringPolicy(resolved)) return null;
  const opts = options || {};
  let outputWeightUsed;
  let interim;
  if (opts.outputWeight != null) {
    if (typeof opts.outputWeight !== 'number' || !Number.isFinite(opts.outputWeight) || opts.outputWeight <= 0) {
      return null;
    }
    outputWeightUsed = opts.outputWeight;
    interim = false;
  } else {
    outputWeightUsed = resolved.outputWeight.interimValue;
    interim = resolved.outputWeight.interim === true;
  }
  const per1k = 1000 / resolved.weightedTokensPerCredit;
  return {
    creditsPer1kIn: per1k * resolved.inputWeight,
    creditsPer1kOut: per1k * outputWeightUsed,
    creditsPer1kCached: per1k * resolved.cachedInputWeight,
    interim,
    policyVersion: resolved.version,
  };
}

/** Ambil objek params dari kebijakan formula margin (objek suntikan boleh membawa params atau field datar). */
function marginParamsOf(policy) {
  if (!policy || typeof policy !== 'object') return null;
  if (policy.params && typeof policy.params === 'object') return policy.params;
  // Objek suntikan datar (dipakai tes): { creditValueIdr, costMultiplierMilli, ... }
  if (MARGIN_PARAM_NAMES.some((name) => name in policy)) return policy;
  return null;
}

/**
 * Harga kredit dari formula margin (kebijakan 'margin-formula-proposal').
 * policyOrVersion: string versi, objek kebijakan, atau kosong (= proposal
 * margin bawaan yang masih PENDING — default fungsi INI adalah kebijakan
 * margin, bukan kebijakan metering v1.1).
 *
 * - Parameter belum lengkap → { ok:false, error:'PENDING_CONFIGURATION',
 *   missingParams:[...] } — TIDAK ada nilai pengganti yang dikarang.
 * - Parameter lengkap tapi tidak valid (bukan integer; marginBps di luar
 *   0..9999; parameter lain tidak positif) → INVALID_POLICY.
 * - Biaya tidak valid (bukan integer ≥ 0) → INVALID_COST.
 *
 * Matematika INTEGER (BigInt):
 *   targetRevenueIdr = ceil(cost × costMultiplierMilli × 10000
 *                            / (1000 × (10000 − targetGrossMarginBps)))
 *   credits          = ceil(targetRevenueIdr / creditValueIdr)
 * fxIdrPerUsd wajib ada sebagai parameter keputusan owner (biaya provider
 * berdenominasi USD), walau input fungsi ini sudah dalam IDR sehingga kurs
 * tidak ikut dihitung di sini.
 */
export function evaluateMarginPrice(input, policyOrVersion) {
  const policy =
    policyOrVersion == null ? getPricingPolicy(PRICING_POLICY_VERSION_MARGIN) : resolvePolicy(policyOrVersion);
  if (!policy) return { ok: false, error: 'INVALID_POLICY' };
  const params = marginParamsOf(policy);
  if (!params) return { ok: false, error: 'INVALID_POLICY' };

  const missingParams = MARGIN_PARAM_NAMES.filter((name) => params[name] == null);
  if (missingParams.length > 0) {
    return { ok: false, error: 'PENDING_CONFIGURATION', missingParams };
  }

  const { creditValueIdr, costMultiplierMilli, targetGrossMarginBps, fxIdrPerUsd } = params;
  if (
    !Number.isInteger(creditValueIdr) ||
    creditValueIdr <= 0 ||
    !Number.isInteger(costMultiplierMilli) ||
    costMultiplierMilli <= 0 ||
    !Number.isInteger(fxIdrPerUsd) ||
    fxIdrPerUsd <= 0 ||
    !Number.isInteger(targetGrossMarginBps) ||
    targetGrossMarginBps < 0 ||
    targetGrossMarginBps > 9999
  ) {
    return { ok: false, error: 'INVALID_POLICY' };
  }

  const providerCostIdr = input ? input.providerCostIdr : null;
  if (!isNonNegativeInt(providerCostIdr)) return { ok: false, error: 'INVALID_COST' };

  const numerator = BigInt(providerCostIdr) * BigInt(costMultiplierMilli) * 10000n;
  const denominator = 1000n * BigInt(10000 - targetGrossMarginBps);
  const targetRevenueIdr = Number((numerator + denominator - 1n) / denominator);
  const credits = Number(
    (BigInt(targetRevenueIdr) + BigInt(creditValueIdr) - 1n) / BigInt(creditValueIdr),
  );
  return {
    ok: true,
    targetRevenueIdr,
    credits,
    policyVersion: typeof policyOrVersion === 'string' ? policyOrVersion : policy.version || PRICING_POLICY_VERSION_MARGIN,
  };
}

/**
 * api/_lib/aiMetering.js — Batas metering AI BERSAMA (Unified Credits Sprint 3)
 * ============================================================================
 * DORMANT: file BARU. TIDAK diimpor oleh handler/gateway/UI mana pun dan
 * TIDAK mengubah perilaku live apa pun. Modul ini adalah SATU batas
 * server-side yang membungkus ledger Gen-2 yang SUDAH ADA
 * (api/_lib/creditLedger.js — diimpor & dipakai apa adanya, tidak
 * diduplikasi model datanya) dengan lifecycle:
 *
 *   createOperation → reserveCredits → executeProvider
 *     → recordUsageEvidence → settleCredits ATAU releaseCredits
 *
 * GERBANG (fail-closed): modul hanya aktif bila env AI_METERING_ENABLED
 * bernilai persis 'true'. DEFAULT MATI. Saat mati, operasi BERBAYAR
 * ditolak { error:'AI_METERING_DISABLED' } — TIDAK ada fallback ke
 * simulasi localStorage, TIDAK ada operasi/reservasi/entri ledger yang
 * dibuat. Operasi DETERMINISTIC_FREE tidak pernah masuk lifecycle ini
 * dalam keadaan gerbang apa pun (lihat Tugas 4).
 *
 * KEAMANAN KONTRAK:
 * - featureKey/provider/model/tarif ditentukan SERVER dari registri
 *   (featureBillingMatrix + pricingPolicy + registri tambahan di file
 *   ini). Payload klien TIDAK boleh membawa field billing (accountId,
 *   credits, token, tariffVersion, provider, model, harga) — kehadiran
 *   field itu ditolak eksplisit CLIENT_BILLING_FIELDS_FORBIDDEN, bukan
 *   dibuang diam-diam.
 * - accountId/workspaceId/userId HANYA dari parameter konteks
 *   terautentikasi abstrak (argumen `context`); modul ini TIDAK
 *   terhubung ke auth nyata (AUTH_ENABLED tetap false; penyambungan
 *   konteks = pekerjaan aktivasi terpisah).
 * - approvedMaxCredits: kontrak Phase 2 R-4. Bila batas yang disetujui
 *   diberikan, estimasi yang MELEBIHI batas ditolak eksplisit
 *   ESTIMATE_EXCEEDS_APPROVED_MAX sebelum operasi dibuat — nilainya
 *   tidak pernah dibuang/di-clamp diam-diam seperti di jalur lama.
 * - Bukti usage = parameter TERSTRUKTUR dari hasil eksekusi provider
 *   server-side. Bukti hilang/tidak lengkap → REQUIRES_REVIEW (reservasi
 *   tetap tertahan, TANPA tagihan karangan, TANPA debit parsial).
 * - Tarif tak dikenal → REQUIRES_REVIEW, tanpa harga final karangan.
 * - Kegagalan provider/internal → release PENUH reservasi.
 * - Feature key tak dikenal → fail-closed UNKNOWN_FEATURE.
 * - idempotencyKey divalidasi format dan ter-scope per akun (kunci
 *   wrapper `${accountId}::${key}`; ledger men-scope dengan cara sama).
 *
 * PERBAIKAN KONTRAK PHASE 2 (di tingkat registri dorman, bukan aktivasi):
 * - R-3: gateway lama memetakan DED_AI_* → 'ded-ai' dan DOKUMEN_AI →
 *   'ai-document', padahal kedua kunci itu TIDAK ada di creditPricing.js
 *   → meter UNKNOWN_FEATURE. GATEWAY_PRODUCT_FEATURE_MAP di bawah
 *   memetakan productId ke kunci KANONIS yang benar-benar ada di matriks
 *   + tarif draft; kunci bare 'ded-ai'/'ai-document' ditolak eksplisit
 *   LEGACY_AMBIGUOUS_FEATURE_KEY.
 * - Fitur yang ditemukan Phase 2 tapi belum ada di matriks (SmartAdd,
 *   document review/scope, pipeline ded-rab) didaftarkan di
 *   EXTENDED_FEATURE_REGISTRY di sini — featureBillingMatrix.js TIDAK
 *   diubah sprint ini.
 * - Receipt scan: endpoint /api/ai/receipt/scan TIDAK ADA di api/ →
 *   entrinya ditandai transportStatus MISSING_ENDPOINT dan operasi
 *   ditolak TRANSPORT_UNAVAILABLE (tidak dimetering lewat transport
 *   hantu).
 */
import { classifyFeature, chargeDecision } from './featureBillingMatrix.js';
import {
  creditsForTokenUsage,
  getPricingPolicy,
  PRICING_POLICY_VERSION_V11,
} from './pricingPolicy.js';
import { getDraftTariff, EZRAB_DRAFT_TARIFFS } from './creditPricing.js';
import { TARIFF_REGISTRY_VERSION } from './tariffRegistry.js';
import {
  createMeteringRecord,
  transitionRecord,
  isTerminalStatus,
} from './aiMeteringLifecycle.js';

export const AI_METERING_ENV_FLAG = 'AI_METERING_ENABLED';

/** Cadangan token output untuk estimasi reservasi fitur TOKEN (mirror tokenMetering.ts simulasi). */
export const RESERVATION_OUTPUT_ALLOWANCE_TOKENS = 1000;

// ---------------------------------------------------------------------------
// Registri tambahan (dorman) — melengkapi featureBillingMatrix TANPA mengubahnya
// ---------------------------------------------------------------------------

function extAiMetered(note, extra) {
  return Object.freeze({
    billingClass: 'AI_METERED',
    metering: 'TOKEN',
    integrationStatus: 'NOT_WIRED',
    note,
    ...(extra || {}),
  });
}

function extFree(note) {
  return Object.freeze({
    billingClass: 'DETERMINISTIC_FREE',
    metering: 'NONE',
    integrationStatus: 'NOT_APPLICABLE',
    note,
  });
}

export const EXTENDED_FEATURE_REGISTRY = Object.freeze({
  // Ditemukan audit Phase 2, belum ada di matriks:
  'smart-add/work-item': extAiMetered('SmartAdd work-item generation (Phase 2 row 22) — belum terdaftar di matriks; didaftarkan di sini agar fail-closed berubah menjadi terkendali.'),
  'ai-document/review': extAiMetered('AI Document REVIEW_DOCUMENT (Phase 2 row 17) — berbeda dari review lokal deterministik.'),
  'ai-document/extract-scope': extAiMetered('AI Document EXTRACT_CONSTRUCTION_SCOPE (Phase 2 row 18).'),
  'ded-rab/pipeline': extAiMetered('Pipeline ded-rab v2/v3 via multi-provider (Phase 2 rows 8–9) — transport kedua di luar gateway browser.'),
  // Transport hilang: endpoint tidak ada → tidak boleh dimetering.
  'ai-receipt/scan': extAiMetered('Receipt scan — endpoint /api/ai/receipt/scan TIDAK ADA di api/ (Phase 2 row 19).', {
    transportStatus: 'MISSING_ENDPOINT',
  }),
  // Deterministik tambahan (Tugas 4) — selalu gratis:
  'qto-calculation': extFree('QTO / hitung kuantitas deterministik lokal (di dalam pipeline DED maupun kalkulator).'),
  'unit-conversion': extFree('Konversi satuan murni lokal.'),
  'local-validation': extFree('Validasi lokal berbasis aturan (tanpa provider).'),
  'document-parsing': extFree('Parsing dokumen & ekstraksi teks polos deterministik lokal.'),
  'master-price-matching': extFree('Pencocokan harga master lokal sesudah OCR.'),
  'rab-review-local': extFree('RAB review SEBAGAIMANA DIKIRIM hari ini: rule-based lokal (Phase 2 R-1). Kunci matriks ai-rab-review tetap direncanakan-AI dan tidak membuat review lokal hari ini tertagih.'),
});

/** Kunci gateway lama yang ambigu — ditolak eksplisit, bukan ditebak. */
export const LEGACY_AMBIGUOUS_FEATURE_KEYS = Object.freeze(['ded-ai', 'ai-document']);

/**
 * Peta productId gateway → featureKey KANONIS (perbaikan R-3).
 * DED wajib membawa kompleksitas server (simple|medium|complex);
 * dokumen wajib membawa kategori server (simple|complex) untuk kunci
 * harga draft-nya. Tanpa parameter itu → fail-closed, bukan tebakan.
 */
export const GATEWAY_PRODUCT_FEATURE_MAP = Object.freeze({
  EZRAB_AI: Object.freeze({ kind: 'CHAT' }),
  DED_AI_FAST: Object.freeze({ kind: 'DED' }),
  DED_AI_DETAIL: Object.freeze({ kind: 'DED' }),
  DOKUMEN_AI: Object.freeze({ kind: 'DOCUMENT' }),
});

const DED_COMPLEXITIES = ['simple', 'medium', 'complex'];
const DOCUMENT_CATEGORIES = ['simple', 'complex'];

/**
 * Resolusi featureKey server dari productId gateway.
 * Mengembalikan { ok:true, featureKey, pricingFeatureKey } atau
 * { ok:false, error }. pricingFeatureKey adalah kunci yang BENAR-BENAR
 * ada di EZRAB_DRAFT_TARIFFS (bukti perbaikan R-3, dites).
 */
export function resolveGatewayFeature(productId, serverParams) {
  const params = serverParams || {};
  const entry = GATEWAY_PRODUCT_FEATURE_MAP[productId];
  if (!entry) return { ok: false, error: 'UNKNOWN_FEATURE' };
  if (entry.kind === 'CHAT') {
    return {
      ok: true,
      featureKey: params.mode === 'advanced' ? 'chat-ai/advanced' : 'chat-ai/fast',
      pricingFeatureKey: params.mode === 'advanced' ? 'chat-ai/advanced' : 'chat-ai/fast',
    };
  }
  if (entry.kind === 'DED') {
    if (!DED_COMPLEXITIES.includes(params.complexity)) {
      return { ok: false, error: 'DED_COMPLEXITY_REQUIRED' };
    }
    const key = `ded-ai/${params.complexity}`;
    return { ok: true, featureKey: key, pricingFeatureKey: key };
  }
  // DOCUMENT
  if (!DOCUMENT_CATEGORIES.includes(params.category)) {
    return { ok: false, error: 'DOCUMENT_CATEGORY_REQUIRED' };
  }
  return {
    ok: true,
    featureKey: 'ai-document/analysis',
    pricingFeatureKey: `ai-document/${params.category}`,
  };
}

/** Klasifikasi gabungan: matriks dulu, lalu registri tambahan file ini. */
export function classifyMeteringFeature(key) {
  if (typeof key !== 'string') return null;
  if (LEGACY_AMBIGUOUS_FEATURE_KEYS.includes(key)) return null;
  const fromMatrix = classifyFeature(key);
  const ext = EXTENDED_FEATURE_REGISTRY[key];
  if (fromMatrix) {
    // Overlay fakta registri tambahan (mis. transportStatus receipt
    // scan) TANPA mengubah klasifikasi matriks.
    return ext && ext.transportStatus
      ? { ...fromMatrix, transportStatus: ext.transportStatus }
      : fromMatrix;
  }
  if (!ext) return null;
  return { key, ...ext };
}

// ---------------------------------------------------------------------------
// Gerbang & validasi
// ---------------------------------------------------------------------------

/** Gerbang aktif HANYA bila flag bernilai persis 'true'. Default mati. */
export function isAiMeteringEnabled(env) {
  const source = env || (typeof process !== 'undefined' ? process.env : {});
  return source && source[AI_METERING_ENV_FLAG] === 'true';
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function isValidIdempotencyKey(key) {
  return typeof key === 'string' && IDEMPOTENCY_KEY_RE.test(key);
}

/** Field billing yang TIDAK boleh datang dari payload klien. */
export const CLIENT_BILLING_FIELDS = Object.freeze([
  'accountId',
  'workspaceId',
  'userId',
  'credits',
  'actualCredits',
  'estimatedCredits',
  'settledCredits',
  'tokensIn',
  'tokensOut',
  'tokensCached',
  'tariffVersion',
  'provider',
  'model',
  'price',
  'cost',
]);

function findClientBillingFields(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return CLIENT_BILLING_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(payload, f));
}

function isNonNegativeInt(v) {
  return Number.isSafeInteger(v) && v >= 0;
}

function isPositiveInt(v) {
  return Number.isSafeInteger(v) && v > 0;
}

function validContext(context) {
  return Boolean(
    context &&
      typeof context.accountId === 'string' && context.accountId.length > 0 &&
      typeof context.workspaceId === 'string' && context.workspaceId.length > 0 &&
      typeof context.userId === 'string' && context.userId.length > 0,
  );
}

/**
 * Estimasi reservasi SERVER untuk satu fitur:
 * - TOKEN: dari estimasi token server (serverEstimate {tokensIn,
 *   tokensOutAllowance?}) via pricingPolicy v1.1. Tanpa estimasi server
 *   → ESTIMATE_UNAVAILABLE (fail-closed, bukan tebakan).
 * - FLAT_DRAFT: target tarif draft creditPricing (DED 500/650/800 dst).
 *   Untuk kunci kanonis tanpa entri draft langsung (ai-document/analysis)
 *   kunci harga disuplai server lewat pricingFeatureKey.
 */
export function estimateReservationCredits(featureKey, opts) {
  const options = opts || {};
  const classified = classifyMeteringFeature(featureKey);
  if (!classified) return { ok: false, error: 'UNKNOWN_FEATURE' };
  if (classified.billingClass === 'DETERMINISTIC_FREE') {
    return { ok: false, error: 'DETERMINISTIC_FREE_NOT_METERABLE' };
  }
  if (classified.metering === 'FLAT_DRAFT') {
    const pricingKey = options.pricingFeatureKey || featureKey;
    const tariff = getDraftTariff(pricingKey);
    if (!tariff) return { ok: false, error: 'ESTIMATE_UNAVAILABLE' };
    const estimate = tariff.target != null ? tariff.target : tariff.max;
    if (!isPositiveInt(estimate)) return { ok: false, error: 'ESTIMATE_UNAVAILABLE' };
    return {
      ok: true,
      estimatedCredits: estimate,
      tariffVersion: EZRAB_DRAFT_TARIFFS.version,
      estimateBasis: 'FLAT_DRAFT_MAXIMUM',
    };
  }
  // TOKEN
  const se = options.serverEstimate;
  if (!se || !isNonNegativeInt(se.tokensIn)) return { ok: false, error: 'ESTIMATE_UNAVAILABLE' };
  const tokensOut = se.tokensOutAllowance == null ? RESERVATION_OUTPUT_ALLOWANCE_TOKENS : se.tokensOutAllowance;
  if (!isNonNegativeInt(tokensOut)) return { ok: false, error: 'ESTIMATE_UNAVAILABLE' };
  const metered = creditsForTokenUsage(
    { tokensIn: se.tokensIn, tokensOut, tokensCached: se.tokensCached == null ? 0 : se.tokensCached },
    { policyVersion: options.pricingPolicyVersion || PRICING_POLICY_VERSION_V11 },
  );
  if (!metered.ok) return { ok: false, error: metered.error };
  return {
    ok: true,
    estimatedCredits: metered.credits,
    tariffVersion: TARIFF_REGISTRY_VERSION,
    estimateBasis: 'TOKEN_ESTIMATE_V11',
  };
}

// ---------------------------------------------------------------------------
// Boundary
// ---------------------------------------------------------------------------

/**
 * Buat batas metering bersama di atas ledger Gen-2 yang sudah ada.
 * deps: { ledger (createCreditLedger hasil), env?, now? (fn→ms epoch),
 *         pricingPolicyVersion? }
 * Ledger TIDAK dibuat/diduplikasi di sini — pemanggil menyuntikkannya.
 */
export function createAiMeteringBoundary(deps) {
  const d = deps || {};
  const ledger = d.ledger;
  if (!ledger) throw new Error('createAiMeteringBoundary: ledger Gen-2 wajib disuntikkan');
  const nowFn = typeof d.now === 'function' ? d.now : () => Date.now();
  const pricingPolicyVersion = d.pricingPolicyVersion || PRICING_POLICY_VERSION_V11;
  const enabled = () => isAiMeteringEnabled(d.env);

  /** Record wrapper per (akun, kunci idempotensi). */
  const records = new Map();
  const recordKey = (accountId, key) => `${accountId}::${key}`;
  const byOperationId = new Map();

  function storeRecord(record) {
    records.set(recordKey(record.accountId, record.idempotencyKey), record);
    if (record.operationId) byOperationId.set(record.operationId, record);
    return record;
  }

  function publicRecord(record) {
    return record ? JSON.parse(JSON.stringify(record)) : null;
  }

  function gatePaid() {
    return enabled() ? null : { ok: false, error: 'AI_METERING_DISABLED', failClosed: true };
  }

  /**
   * Klasifikasi TANPA efek samping. Deterministik → { chargeable:false }
   * dalam keadaan gerbang apa pun; tak dikenal → UNKNOWN_FEATURE.
   */
  function classify(key) {
    if (LEGACY_AMBIGUOUS_FEATURE_KEYS.includes(key)) {
      return { ok: false, error: 'LEGACY_AMBIGUOUS_FEATURE_KEY', key };
    }
    const classified = classifyMeteringFeature(key);
    if (!classified) return { ok: false, error: 'UNKNOWN_FEATURE', key };
    if (classified.billingClass === 'DETERMINISTIC_FREE') {
      return { ok: true, chargeable: false, credits: 0, billingClass: classified.billingClass, key };
    }
    return {
      ok: true,
      chargeable: true,
      billingClass: classified.billingClass,
      metering: classified.metering,
      integrationStatus: classified.integrationStatus,
      transportStatus: classified.transportStatus || 'AVAILABLE',
      key,
    };
  }

  /**
   * Langkah 1–2: createOperation + reserveCredits di ledger.
   * context: konteks terautentikasi abstrak { accountId, workspaceId, userId }.
   * request: { featureKey } ATAU { productId, serverParams } + opsi server
   *   { serverEstimate?, pricingFeatureKey?, approvedMaxCredits? }.
   * Payload klien tidak diterima sebagai argumen terpisah sama sekali;
   * bila request membawa field billing klien → ditolak eksplisit.
   */
  function beginOperation(context, request) {
    const gate = gatePaid();
    if (gate) return gate;
    if (!validContext(context)) return { ok: false, error: 'AUTH_CONTEXT_REQUIRED' };
    const req = request || {};
    const forbidden = findClientBillingFields(req);
    if (forbidden.length > 0) {
      return { ok: false, error: 'CLIENT_BILLING_FIELDS_FORBIDDEN', fields: forbidden };
    }
    if (!isValidIdempotencyKey(req.idempotencyKey)) {
      return { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' };
    }

    // Replay idempoten: kunci sama per akun → record yang sama, tanpa
    // operasi/reservasi kedua.
    const existing = records.get(recordKey(context.accountId, req.idempotencyKey));
    if (existing) {
      return { ok: true, duplicate: true, record: publicRecord(existing) };
    }

    // Feature key ditentukan SERVER.
    let featureKey = req.featureKey || null;
    let pricingFeatureKey = req.pricingFeatureKey || null;
    if (req.productId) {
      const resolved = resolveGatewayFeature(req.productId, req.serverParams || {});
      if (!resolved.ok) return { ok: false, error: resolved.error };
      featureKey = resolved.featureKey;
      pricingFeatureKey = resolved.pricingFeatureKey;
    }
    const cls = classify(featureKey);
    if (!cls.ok) return { ok: false, error: cls.error, featureKey };
    if (!cls.chargeable) {
      // Deterministik TIDAK pernah membuat operasi (Tugas 4 ditegakkan
      // di batas ini, bukan hanya di tes).
      return { ok: false, error: 'DETERMINISTIC_FREE_NOT_METERABLE', featureKey };
    }
    if (cls.transportStatus === 'MISSING_ENDPOINT') {
      return { ok: false, error: 'TRANSPORT_UNAVAILABLE', featureKey };
    }

    const estimate = estimateReservationCredits(featureKey, {
      serverEstimate: req.serverEstimate,
      pricingFeatureKey,
      pricingPolicyVersion,
    });
    if (!estimate.ok) return { ok: false, error: estimate.error, featureKey };

    // Kontrak approvedMaxCredits (R-4): tolak EKSPLISIT bila estimasi
    // melebihi batas yang disetujui. Nilai tidak dibuang/di-clamp.
    if (req.approvedMaxCredits != null) {
      if (!isPositiveInt(req.approvedMaxCredits)) {
        return { ok: false, error: 'INVALID_APPROVED_MAX' };
      }
      if (estimate.estimatedCredits > req.approvedMaxCredits) {
        return {
          ok: false,
          error: 'ESTIMATE_EXCEEDS_APPROVED_MAX',
          estimatedCredits: estimate.estimatedCredits,
          approvedMaxCredits: req.approvedMaxCredits,
          featureKey,
        };
      }
    }

    const now = nowFn();
    const created = ledger.createOperation({
      accountId: context.accountId,
      feature: featureKey,
      estimatedCredits: estimate.estimatedCredits,
      idempotencyKey: req.idempotencyKey,
      actor: context.userId,
      now,
    });
    if (!created.ok) return { ok: false, error: created.error, featureKey };

    const record = createMeteringRecord({
      operationId: created.operation.id,
      accountId: context.accountId,
      workspaceId: context.workspaceId,
      userId: context.userId,
      featureKey,
      tariffVersion: TARIFF_REGISTRY_VERSION,
      pricingPolicyVersion,
      idempotencyKey: req.idempotencyKey,
      estimatedCredits: estimate.estimatedCredits,
      now,
    });
    storeRecord(record);

    // Reservasi: EKSEKUSI TIDAK PERNAH mendahului reservasi berhasil.
    const reserved = ledger.reserve(created.operation.id, {
      accountId: context.accountId,
      idempotencyKey: `${req.idempotencyKey}:reserve`,
      actor: context.userId,
      now,
    });
    if (!reserved.ok) {
      transitionRecord(record, 'FAILED', nowFn());
      record.failureReason = reserved.error;
      return { ok: false, error: reserved.error, record: publicRecord(record) };
    }
    transitionRecord(record, 'RESERVED', nowFn());
    return { ok: true, record: publicRecord(record) };
  }

  function getRecord(operationId) {
    return byOperationId.get(operationId) || null;
  }

  function mustRecord(operationId) {
    const record = getRecord(operationId);
    if (!record) return { error: { ok: false, error: 'OPERATION_NOT_FOUND' } };
    return { record };
  }

  /** Langkah 3a: RESERVED → EXECUTING. Eksekusi sebelum reservasi ditolak oleh state machine. */
  function markExecuting(operationId) {
    const gate = gatePaid();
    if (gate) return gate;
    const { record, error } = mustRecord(operationId);
    if (error) return error;
    const t = transitionRecord(record, 'EXECUTING', nowFn());
    if (!t.ok) return t;
    return { ok: true, record: publicRecord(record) };
  }

  /**
   * Langkah 4: catat bukti usage TERSTRUKTUR dari satu panggilan provider
   * (multi-panggilan diakumulasi). Boleh dipanggil saat EXECUTING atau
   * SUCCEEDED. Bukti tidak lengkap TIDAK dilempar — ditandai
   * evidenceComplete:false agar settle mengarah ke REQUIRES_REVIEW.
   * ev: { provider, model, usage: { tokensIn, tokensOut, tokensCached } | null }
   */
  function recordUsageEvidence(operationId, ev) {
    const gate = gatePaid();
    if (gate) return gate;
    const { record, error } = mustRecord(operationId);
    if (error) return error;
    if (record.status !== 'EXECUTING' && record.status !== 'SUCCEEDED') {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: record.status, to: 'RECORD_EVIDENCE' };
    }
    const evidence = record.usageEvidence || {
      calls: [],
      tokensIn: 0,
      tokensOut: 0,
      tokensCached: 0,
      evidenceComplete: true,
    };
    const usage = ev && ev.usage ? ev.usage : null;
    const complete = Boolean(
      ev &&
        typeof ev.provider === 'string' && ev.provider.length > 0 &&
        typeof ev.model === 'string' && ev.model.length > 0 &&
        usage && isNonNegativeInt(usage.tokensIn) && isNonNegativeInt(usage.tokensOut) &&
        (usage.tokensCached == null || isNonNegativeInt(usage.tokensCached)),
    );
    evidence.calls.push({
      provider: ev && ev.provider ? ev.provider : null,
      model: ev && ev.model ? ev.model : null,
      tokensIn: usage && isNonNegativeInt(usage.tokensIn) ? usage.tokensIn : null,
      tokensOut: usage && isNonNegativeInt(usage.tokensOut) ? usage.tokensOut : null,
      tokensCached: usage && isNonNegativeInt(usage.tokensCached) ? usage.tokensCached : 0,
      complete,
    });
    if (complete) {
      evidence.tokensIn += usage.tokensIn;
      evidence.tokensOut += usage.tokensOut;
      evidence.tokensCached += usage.tokensCached == null ? 0 : usage.tokensCached;
      if (!record.provider) {
        record.provider = ev.provider;
        record.model = ev.model;
      }
    } else {
      evidence.evidenceComplete = false;
    }
    record.usageEvidence = evidence;
    record.timestamps.updatedAt = nowFn();
    return { ok: true, record: publicRecord(record) };
  }

  /** Langkah 3b: EXECUTING → SUCCEEDED (hasil provider dapat dipakai). */
  function markSucceeded(operationId) {
    const gate = gatePaid();
    if (gate) return gate;
    const { record, error } = mustRecord(operationId);
    if (error) return error;
    const t = transitionRecord(record, 'SUCCEEDED', nowFn());
    if (!t.ok) return t;
    return { ok: true, record: publicRecord(record) };
  }

  /**
   * Parkir operasi ke REQUIRES_REVIEW di tingkat wrapper: reservasi
   * ledger tetap tertahan, TIDAK ada settle/release otomatis, TANPA
   * tagihan karangan. Resolusi hanya via ledger.resolveReview.
   */
  function flagForReview(operationId, reason) {
    const gate = gatePaid();
    if (gate) return gate;
    const { record, error } = mustRecord(operationId);
    if (error) return error;
    const t = transitionRecord(record, 'REQUIRES_REVIEW', nowFn());
    if (!t.ok) return t;
    record.reviewReason = reason || 'USAGE_UNDETERMINED';
    return { ok: true, status: 'REQUIRES_REVIEW', record: publicRecord(record) };
  }

  /**
   * Langkah 5a: settle dari bukti yang tercatat (pricingPolicy v1.1).
   * Hanya dari SUCCEEDED. Bukti hilang/tidak lengkap atau tarif tak
   * dikenal → REQUIRES_REVIEW. Aktual > reservasi → ledger membuka
   * review (tanpa debit otomatis) dan wrapper mencerminkannya.
   */
  function settleCredits(operationId) {
    const gate = gatePaid();
    if (gate) return gate;
    const { record, error } = mustRecord(operationId);
    if (error) return error;
    if (record.status !== 'SUCCEEDED') {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: record.status, to: 'SETTLED' };
    }
    const evidence = record.usageEvidence;
    if (!evidence || evidence.calls.length === 0 || evidence.evidenceComplete === false) {
      flagForReview(operationId, 'USAGE_MISSING_OR_INCOMPLETE');
      return { ok: true, status: 'REQUIRES_REVIEW', record: publicRecord(record) };
    }
    const policy = getPricingPolicy(pricingPolicyVersion);
    if (!policy) {
      flagForReview(operationId, 'UNKNOWN_TARIFF');
      return { ok: true, status: 'REQUIRES_REVIEW', record: publicRecord(record) };
    }
    const metered = creditsForTokenUsage(
      { tokensIn: evidence.tokensIn, tokensOut: evidence.tokensOut, tokensCached: evidence.tokensCached },
      { policyVersion: pricingPolicyVersion },
    );
    if (!metered.ok) {
      flagForReview(operationId, metered.error);
      return { ok: true, status: 'REQUIRES_REVIEW', record: publicRecord(record) };
    }
    const settled = ledger.settle(operationId, {
      accountId: record.accountId,
      actualCredits: metered.credits,
      usageEvidence: {
        tokensIn: evidence.tokensIn,
        tokensOut: evidence.tokensOut,
        tokensCached: evidence.tokensCached,
        provider: record.provider,
        model: record.model,
        calls: evidence.calls.length,
      },
      tariffVersion: TARIFF_REGISTRY_VERSION,
      idempotencyKey: `${record.idempotencyKey}:settle`,
      actor: record.userId,
      now: nowFn(),
    });
    if (!settled.ok) {
      // Ledger menolak (mis. UNKNOWN_TARIFF versi registri) → review, bukan tebakan.
      flagForReview(operationId, settled.error);
      return { ok: true, status: 'REQUIRES_REVIEW', ledgerError: settled.error, record: publicRecord(record) };
    }
    if (settled.status === 'REQUIRES_REVIEW') {
      transitionRecord(record, 'REQUIRES_REVIEW', nowFn());
      record.reviewReason = 'ACTUAL_EXCEEDS_RESERVATION';
      record.overageCredits = settled.overageCredits != null ? settled.overageCredits : null;
      return { ok: true, status: 'REQUIRES_REVIEW', overageCredits: record.overageCredits, record: publicRecord(record) };
    }
    transitionRecord(record, 'SETTLED', nowFn());
    record.settledCredits = settled.settledCredits;
    record.releasedCredits = settled.releasedCredits;
    return {
      ok: true,
      status: 'SETTLED',
      settledCredits: settled.settledCredits,
      releasedCredits: settled.releasedCredits,
      record: publicRecord(record),
    };
  }

  /** Langkah 5b: release PENUH reservasi ke batch asal (kegagalan provider/internal). */
  function releaseCredits(operationId, reason) {
    const gate = gatePaid();
    if (gate) return gate;
    const { record, error } = mustRecord(operationId);
    if (error) return error;
    if (record.status !== 'RESERVED' && record.status !== 'EXECUTING' && record.status !== 'SUCCEEDED') {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: record.status, to: 'RELEASED' };
    }
    const released = ledger.release(operationId, {
      accountId: record.accountId,
      idempotencyKey: `${record.idempotencyKey}:release`,
      actor: record.userId,
      now: nowFn(),
    });
    if (!released.ok) return { ok: false, error: released.error, record: publicRecord(record) };
    transitionRecord(record, 'RELEASED', nowFn());
    record.releasedCredits = released.releasedCredits;
    record.failureReason = reason || record.failureReason;
    return { ok: true, status: 'RELEASED', releasedCredits: released.releasedCredits, record: publicRecord(record) };
  }

  /**
   * Wrapper satu-panggilan untuk fitur representatif:
   * begin → executing → executor → evidence → succeeded → settle.
   * Kegagalan executor → release penuh. Replay kunci terminal → hasil
   * tercatat, executor TIDAK dipanggil ulang.
   * executor: async (ctx) => { provider, model, usage, result }
   */
  async function runMeteredOperation(context, request, executor) {
    const begun = beginOperation(context, request);
    if (!begun.ok) return begun;
    const record = getRecord(begun.record.operationId);
    if (begun.duplicate && isTerminalStatus(record.status)) {
      return { ok: true, duplicate: true, status: record.status, record: publicRecord(record) };
    }
    if (begun.duplicate) return { ok: false, error: 'OPERATION_IN_PROGRESS', record: publicRecord(record) };

    markExecuting(record.operationId);
    let outcome;
    try {
      outcome = await executor({ operationId: record.operationId, featureKey: record.featureKey });
    } catch (e) {
      const rel = releaseCredits(record.operationId, (e && e.code) || 'PROVIDER_FAILURE');
      return { ok: false, error: (e && e.code) || 'PROVIDER_FAILURE', status: 'RELEASED', released: rel, record: publicRecord(record) };
    }
    recordUsageEvidence(record.operationId, outcome || {});
    markSucceeded(record.operationId);
    const settled = settleCredits(record.operationId);
    return { ...settled, result: outcome ? outcome.result : undefined };
  }

  /**
   * Jalur deterministik: jalankan fungsi lokal TANPA menyentuh ledger.
   * Inilah satu-satunya jalur sah operasi DETERMINISTIC_FREE di batas
   * ini — ia secara struktural tidak dapat membuat operasi/reservasi.
   */
  function runDeterministic(context, request, localFn) {
    const req = request || {};
    const cls = classify(req.featureKey);
    if (!cls.ok) return { ok: false, error: cls.error, featureKey: req.featureKey };
    if (cls.chargeable) return { ok: false, error: 'NOT_DETERMINISTIC_FREE', featureKey: req.featureKey };
    const result = typeof localFn === 'function' ? localFn() : undefined;
    return { ok: true, chargeable: false, credits: 0, featureKey: req.featureKey, result };
  }

  function getOperationRecord(operationId) {
    const record = getRecord(operationId);
    return record ? { ok: true, record: publicRecord(record) } : { ok: false, error: 'OPERATION_NOT_FOUND' };
  }

  function findByIdempotencyKey(accountId, key) {
    const record = records.get(recordKey(accountId, key));
    return record ? publicRecord(record) : null;
  }

  return {
    enabled,
    classify,
    beginOperation,
    markExecuting,
    recordUsageEvidence,
    markSucceeded,
    settleCredits,
    releaseCredits,
    flagForReview,
    runMeteredOperation,
    runDeterministic,
    getOperationRecord,
    findByIdempotencyKey,
    // Diekspos untuk tes batas: jumlah record wrapper yang hidup.
    _recordCount: () => records.size,
  };
}

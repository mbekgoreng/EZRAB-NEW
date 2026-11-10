/**
 * api/_lib/aiMeteringLifecycle.js — State machine lifecycle metering AI
 * ============================================================================
 * DORMANT: file BARU Sprint 3 (Unified Credits). TIDAK diimpor oleh handler,
 * gateway, atau UI mana pun. Ia hanya dipakai oleh aiMetering.js (modul
 * metering bersama) dan tesnya.
 *
 * State machine operasi berbayar (satu operasi = satu workflow pengguna):
 *
 *   CREATED ──► RESERVED ──► EXECUTING ──► SUCCEEDED ──► SETTLED
 *      │           │            │             │
 *      │           │            │             └──► REQUIRES_REVIEW
 *      │           │            └──────────────► RELEASED (gagal → lepas penuh)
 *      │           └───────────────────────────► RELEASED
 *      └──► FAILED (reservasi gagal sebelum dana tertahan, mis.
 *               INSUFFICIENT_BALANCE — tidak ada yang perlu dilepas)
 *
 * Status terminal: SETTLED, RELEASED, REQUIRES_REVIEW, FAILED.
 * REQUIRES_REVIEW adalah terminal UNTUK OTOMASI: operasi yang masuk review
 * TIDAK boleh di-settle/di-release lewat jalur otomatis (bypass review
 * ditolak) — resolusinya hanya lewat creditLedger.resolveReview oleh
 * reviewer berwenang (billingAuthorization), di luar modul ini.
 *
 * Pemetaan ke status ledger Gen-2 (credit_usage_operations):
 * - CREATED/RESERVED/SETTLED/RELEASED/REQUIRES_REVIEW/FAILED ada di ledger.
 * - EXECUTING dan SUCCEEDED adalah status TRANSIENT milik wrapper metering
 *   (ledger tetap RESERVED selama keduanya) — eksekusi provider dan
 *   keberhasilannya adalah fakta transport, bukan fakta ledger.
 */

export const METERING_STATUSES = Object.freeze([
  'CREATED',
  'RESERVED',
  'EXECUTING',
  'SUCCEEDED',
  'SETTLED',
  'RELEASED',
  'REQUIRES_REVIEW',
  'FAILED',
]);

export const TERMINAL_STATUSES = Object.freeze([
  'SETTLED',
  'RELEASED',
  'REQUIRES_REVIEW',
  'FAILED',
]);

/** Transisi yang SAH. Semua pasangan lain ditolak ILLEGAL_TRANSITION. */
export const METERING_TRANSITIONS = Object.freeze({
  CREATED: Object.freeze(['RESERVED', 'FAILED']),
  RESERVED: Object.freeze(['EXECUTING', 'RELEASED', 'REQUIRES_REVIEW', 'FAILED']),
  EXECUTING: Object.freeze(['SUCCEEDED', 'RELEASED', 'REQUIRES_REVIEW']),
  SUCCEEDED: Object.freeze(['SETTLED', 'RELEASED', 'REQUIRES_REVIEW']),
  SETTLED: Object.freeze([]),
  RELEASED: Object.freeze([]),
  REQUIRES_REVIEW: Object.freeze([]),
  FAILED: Object.freeze([]),
});

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from, to) {
  const allowed = METERING_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * Buat record wrapper operasi metering. Semua identitas billing berasal
 * dari konteks terautentikasi (parameter konteks abstrak) + registri
 * server — record ini TIDAK pernah diisi dari payload klien.
 */
export function createMeteringRecord(fields) {
  const now = fields.now;
  return {
    operationId: fields.operationId || null,
    // reservationId: Gen-2 tidak menerbitkan id reservasi terpisah —
    // reservasi hidup DI DALAM operasi (allocations). reservationId di
    // sini adalah handle yang sama dengan operationId ledger, dicatat
    // eksplisit agar kontrak lifecycle terbaca utuh.
    reservationId: fields.operationId || null,
    accountId: fields.accountId,
    workspaceId: fields.workspaceId,
    userId: fields.userId,
    featureKey: fields.featureKey,
    provider: null,
    model: null,
    tariffVersion: fields.tariffVersion || null,
    pricingPolicyVersion: fields.pricingPolicyVersion || null,
    idempotencyKey: fields.idempotencyKey,
    status: 'CREATED',
    usageEvidence: null,
    estimatedCredits: fields.estimatedCredits,
    settledCredits: null,
    releasedCredits: null,
    overageCredits: null,
    failureReason: null,
    reviewReason: null,
    timestamps: {
      createdAt: now,
      reservedAt: null,
      executingAt: null,
      succeededAt: null,
      settledAt: null,
      releasedAt: null,
      reviewAt: null,
      failedAt: null,
      updatedAt: now,
    },
  };
}

const TIMESTAMP_BY_STATUS = {
  RESERVED: 'reservedAt',
  EXECUTING: 'executingAt',
  SUCCEEDED: 'succeededAt',
  SETTLED: 'settledAt',
  RELEASED: 'releasedAt',
  REQUIRES_REVIEW: 'reviewAt',
  FAILED: 'failedAt',
};

/**
 * Terapkan transisi ke record. Transisi ilegal → { ok:false,
 * error:'ILLEGAL_TRANSITION', from, to } dan record TIDAK berubah.
 */
export function transitionRecord(record, to, now) {
  if (!record || !canTransition(record.status, to)) {
    return {
      ok: false,
      error: 'ILLEGAL_TRANSITION',
      from: record ? record.status : null,
      to,
    };
  }
  record.status = to;
  const tsKey = TIMESTAMP_BY_STATUS[to];
  if (tsKey) record.timestamps[tsKey] = now;
  record.timestamps.updatedAt = now;
  return { ok: true, status: to };
}

/**
 * api/_lib/creditLedger.js — Ledger batch kredit Phase 5 (fondasi)
 * ============================================================================
 * Ledger kredit berbasis BATCH yang bisa diaudit, menggantikan model bucket
 * agregat engine lama (api/_lib/creditEngine.js — TIDAK diubah oleh fase ini;
 * engine lama tetap dormant dengan cacat reserve/settle yang terdokumentasi
 * di audit billing 2026-11-02 §2.4; file ini adalah fondasi penggantinya).
 *
 * Keputusan owner yang dikunci di sini:
 * - Free: ONCE — grant 100 kredit satu kali per akun billing workspace,
 *   idempotent di level store (bukan instance, bukan browser), dan TIDAK
 *   PERNAH kedaluwarsa: expiresAt selalu NULL (Keputusan final Phase 5.1
 *   C3, ditegaskan Phase 5.3 — menggantikan default 90 hari dari Phase 5;
 *   lihat grantFreeOnce dan recordFreeOncePolicyCorrection).
 * - Bonus: BATCH — setiap grant bonus adalah batch sendiri dengan identitas
 *   sumber (campaignRef) dan kebijakan kedaluwarsanya; TIDAK PERNAH diam-diam
 *   diklasifikasikan sebagai top-up berbayar.
 * - Rollover langganan: PERIOD_END_30 — expiresAt = periodEnd + 30 hari persis
 *   (dari akhir periode, BUKAN dari timestamp grant).
 * - Settlement AI: USAGE — yang ditagih hanya usage aktual terverifikasi;
 *   estimasi/reservasi/aktual/settle selalu terpisah dan tercatat. Estimasi
 *   TIDAK PERNAH ditagih sebagai aktual.
 * - Penutupan akun & refund: PENDING_LEGAL_REVIEW — TIDAK ada implementasi
 *   forfeiture/transfer/refund/penghapusan saldo di file ini, secara sengaja.
 * - Kepemilikan billing: WORKSPACE (Phase 5.3). `accountId` di seluruh API
 *   file ini adalah id AKUN BILLING milik satu workspace (pemetaan 1:1
 *   workspace ↔ akun billing diformalkan tabel `billing_accounts` pada
 *   migration Phase 5.3 — file saja, belum dieksekusi). BUKAN user id:
 *   jangan pernah meneruskan id user sebagai accountId.
 * - Overage: REQUIRES_REVIEW dengan resolusi MANUAL (Phase 5.3 Workstream
 *   D) — lihat resolveReview. Tidak ada debit otomatis untuk kelebihan
 *   usage; hanya reviewer berwenang (otorisasi di
 *   api/_lib/billingAuthorization.js) yang boleh menyelesaikan review.
 * - PERINGATAN STORE: store bawaan adalah Map in-memory SATU PROSES —
 *   khusus development/test. Ia BUKAN persistence production: state hilang
 *   saat cold start serverless dan idempotency tidak lintas-instance.
 *   Production wajib memakai adapter DB dengan constraint UNIQUE +
 *   transaksi atomik (spesifikasi di migration Phase 5.3).
 *
 * Invarian per batch (selalu, setiap saat):
 *   grantedAmount = remainingAmount + reservedAmount + consumedAmount
 *                   + expiredAmount
 * Semua jumlah kredit INTEGER (Number.isInteger); floating point dilarang
 * dalam matematika ledger. Saldo tidak pernah negatif.
 *
 * Konvensi tanda `amount` pada entri ledger (perubahan remainingAmount batch,
 * kecuali dinyatakan lain):
 *   GRANT +n · RESERVE −n · RESERVE_RELEASE +n · EXPIRATION −n ·
 *   CONSUME −n (magnitudo final yang dikonsumsi dari dana yang sedang
 *   di-reserve; offset-nya adalah entri RESERVE sebelumnya).
 * Entri bersifat append-only dan dibekukan (Object.freeze); koreksi hanya
 * boleh berupa transaksi kompensasi baru (kind REVERSAL disediakan untuk
 * fase berikutnya), tidak pernah rewrite sejarah.
 *
 * Store adalah interface (Map/array in-memory di implementasi bawaan) yang
 * dirancang agar adapter DB (Supabase) di fase berikutnya bisa mengimplementasikan
 * interface yang sama. TIDAK ada koneksi DB di file ini.
 */
import { resolveAllocationOrder } from './creditAllocation.js';
import { defaultTariffRegistry } from './tariffRegistry.js';
import { canResolveBillingReview } from './billingAuthorization.js';

/** Rollover langganan: 30 hari setelah periodEnd (Keputusan PERIOD_END_30). */
export const SUBSCRIPTION_ROLLOVER_MS = 30 * 24 * 60 * 60 * 1000;

/** Jumlah grant Free ONCE (keputusan owner: 100 kredit, satu kali). */
export const FREE_ONCE_AMOUNT = 100;

/**
 * FREE_ONCE TIDAK PERNAH kedaluwarsa (Keputusan final Phase 5.1 C3,
 * ditegaskan Phase 5.3): expiresAt batch FREE_ONCE selalu NULL dan tidak
 * ada konstanta/default kedaluwarsa untuk tipe ini. Default 90 hari dari
 * implementasi Phase 5 (`FREE_ONCE_EXPIRY_MS`) DENGAN SENGAJA dihapus —
 * jangan ditambahkan kembali. Batch historis yang terlanjur finite tidak
 * ditulis ulang diam-diam; koreksinya lewat recordFreeOncePolicyCorrection
 * (event kompensasi yang teraudit).
 */
export const FREE_ONCE_NEVER_EXPIRES = true;

/** expiresAt batch langganan dari akhir periode penagihan (ms epoch). */
export function subscriptionExpiresAt(periodEnd) {
  return periodEnd + SUBSCRIPTION_ROLLOVER_MS;
}

const BATCH_TYPES = ['SUBSCRIPTION', 'TOP_UP', 'BONUS', 'FREE_ONCE'];
const WALLET_BY_TYPE = {
  SUBSCRIPTION: 'SUBSCRIPTION_CREDITS',
  // BONUS & FREE_ONCE dikelompokkan ke TOPUP_CREDITS HANYA untuk pengelompokan
  // tampilan wallet; identitas tipe batch mereka tetap terpisah dan tidak
  // pernah digabung/dikonversi menjadi kredit berbayar.
  TOP_UP: 'TOPUP_CREDITS',
  BONUS: 'TOPUP_CREDITS',
  FREE_ONCE: 'TOPUP_CREDITS',
};

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function isAccountId(v) {
  return typeof v === 'string' && v.length > 0;
}

function isNonNegativeInt(v) {
  // Phase 2 hardening: SAFE integer wajib — Number.isInteger menerima
  // nilai ≥ 2^53 yang tidak bisa direpresentasikan persis, sehingga
  // penjumlahan saldo kehilangan presisi secara diam-diam (terbukti:
  // grant 2^53 lalu +1 menghasilkan total yang salah tanpa error).
  return Number.isSafeInteger(v) && v >= 0;
}

function isPositiveInt(v) {
  return Number.isSafeInteger(v) && v > 0;
}

/**
 * Store in-memory (DEVELOPMENT/TEST SAJA — bukan persistence production).
 * Interface yang harus dipenuhi adapter DB di masa depan:
 * { batches: Map<id, batch>, ledger: Array<entry>, operations: Map<id, op>,
 *   reviews: Array<review>, idempotency: Map<`${accountId}::${key}`, result>,
 *   seq: number }
 */
export function createMemoryLedgerStore() {
  return {
    batches: new Map(),
    ledger: [],
    operations: new Map(),
    reviews: [],
    idempotency: new Map(),
    seq: 0,
  };
}

function nextId(store, prefix) {
  store.seq += 1;
  return `${prefix}_${store.seq}`;
}

function refreshStatus(batch, now) {
  if (batch.status === 'FROZEN') return;
  if (batch.expiresAt != null && batch.expiresAt <= now) {
    batch.status = 'EXPIRED';
  } else if (batch.remainingAmount === 0 && batch.reservedAmount === 0) {
    batch.status = 'EXHAUSTED';
  } else {
    batch.status = 'ACTIVE';
  }
}

export function createCreditLedger(store, options) {
  const db = store || createMemoryLedgerStore();
  const tariffs = (options && options.tariffs) || defaultTariffRegistry;

  // Sprint 3 (Tugas 1): replay idempotensi kini membandingkan payload
  // finansial. Kunci yang sama + payload yang SAMA → replay tercatat
  // (duplicate:true). Kunci yang sama + payload finansial BERBEDA →
  // konflik eksplisit IDEMPOTENCY_CONFLICT (ok:false) — bukan lagi
  // diam-diam mengembalikan hasil lama seolah permintaan baru sah.
  // `matches` (opsional) menerima hasil tercatat dan mengembalikan true
  // bila payload permintaan saat ini setara secara finansial.
  function idemGet(accountId, key, matches) {
    if (key == null) return null;
    const hit = db.idempotency.get(`${accountId}::${key}`);
    if (!hit) return null;
    if (typeof matches === 'function' && !matches(clone(hit))) {
      return { ok: false, error: 'IDEMPOTENCY_CONFLICT', conflict: true, idempotencyConflict: true };
    }
    return { ...clone(hit), duplicate: true };
  }

  function idemPut(accountId, key, result) {
    if (key == null) return;
    db.idempotency.set(`${accountId}::${key}`, clone(result));
  }

  function appendEntry(fields) {
    const entry = Object.freeze({
      id: nextId(db, 'le'),
      accountId: fields.accountId,
      kind: fields.kind,
      batchId: fields.batchId || null,
      operationId: fields.operationId || null,
      amount: fields.amount,
      idempotencyKey: fields.idempotencyKey || null,
      actor: fields.actor || null,
      reason: fields.reason || null,
      createdAt: fields.now,
    });
    db.ledger.push(entry);
    return entry;
  }

  function accountBatches(accountId) {
    const out = [];
    for (const b of db.batches.values()) if (b.accountId === accountId) out.push(b);
    return out;
  }

  function ownedOperation(operationId, accountId) {
    const op = db.operations.get(operationId);
    if (!op) return { error: 'NOT_FOUND' };
    if (op.accountId !== accountId) return { error: 'FORBIDDEN' };
    return { op };
  }

  function makeBatch(fields) {
    const batch = {
      id: nextId(db, 'batch'),
      accountId: fields.accountId,
      type: fields.type,
      wallet: WALLET_BY_TYPE[fields.type],
      grantedAmount: fields.amount,
      remainingAmount: fields.amount,
      reservedAmount: 0,
      consumedAmount: 0,
      expiredAmount: 0,
      grantedAt: fields.now,
      expiresAt: fields.expiresAt,
      periodRef: fields.periodRef || null,
      sourceRef: fields.sourceRef || null,
      status: 'ACTIVE',
      createdAt: fields.now,
      updatedAt: fields.now,
    };
    db.batches.set(batch.id, batch);
    return batch;
  }

  function grantCommon(args, type, extra) {
    const now = args.now == null ? Date.now() : args.now;
    if (!isAccountId(args.accountId)) return { ok: false, error: 'INVALID_ACCOUNT' };
    if (!isPositiveInt(args.amount)) return { ok: false, error: 'INVALID_AMOUNT' };
    const replay = idemGet(args.accountId, args.idempotencyKey, (hit) => {
      const b = hit && hit.batch;
      if (!b) return false;
      const periodOk = JSON.stringify(b.periodRef || null) === JSON.stringify(extra.periodRef || null);
      return b.type === type
        && b.grantedAmount === args.amount
        && (b.expiresAt ?? null) === (extra.expiresAt ?? null)
        && (b.sourceRef ?? null) === (extra.sourceRef ?? null)
        && periodOk;
    });
    if (replay) return replay;
    const batch = makeBatch({
      accountId: args.accountId,
      type,
      amount: args.amount,
      expiresAt: extra.expiresAt,
      periodRef: extra.periodRef || null,
      sourceRef: extra.sourceRef || null,
      now,
    });
    appendEntry({
      accountId: args.accountId, kind: 'GRANT', batchId: batch.id,
      amount: args.amount, idempotencyKey: args.idempotencyKey || null,
      actor: args.actor || null, reason: extra.reason || null, now,
    });
    const result = { ok: true, batch: clone(batch) };
    idemPut(args.accountId, args.idempotencyKey, result);
    return clone(result);
  }

  /** Grant batch langganan; expiresAt = periodEnd + 30 hari (PERIOD_END_30). */
  function grantSubscription(args) {
    if (!isNonNegativeInt(args.periodEnd) || !isNonNegativeInt(args.periodStart)) {
      return { ok: false, error: 'INVALID_PERIOD' };
    }
    return grantCommon(args, 'SUBSCRIPTION', {
      expiresAt: subscriptionExpiresAt(args.periodEnd),
      periodRef: { periodStart: args.periodStart, periodEnd: args.periodEnd },
      sourceRef: args.sourceRef,
      reason: 'subscription_grant',
    });
  }

  /** Grant top-up berbayar; tidak pernah kedaluwarsa. Identitas pembayaran dipertahankan. */
  function grantTopUp(args) {
    return grantCommon(
      { ...args, actor: args.actor || 'payment' },
      'TOP_UP',
      { expiresAt: null, sourceRef: args.paymentRef, reason: 'topup_grant' }
    );
  }

  /** Grant bonus promosi: batch sendiri, sumber campaign + atribusi pemberi tercatat. */
  function grantBonus(args) {
    // Phase 2 hardening: expiresAt bonus datang dari pemanggil — tolak
    // nilai malformed (NaN/string/negatif) sebelum batch tercipta, karena
    // expiresAt rusak akan terbaca sebagai "tidak pernah kedaluwarsa".
    if (args.expiresAt != null && !(Number.isSafeInteger(args.expiresAt) && args.expiresAt >= 0)) {
      return { ok: false, error: 'INVALID_EXPIRY' };
    }
    return grantCommon(
      { ...args, actor: args.grantedBy || args.actor },
      'BONUS',
      {
        expiresAt: args.expiresAt == null ? null : args.expiresAt,
        sourceRef: args.campaignRef,
        reason: 'bonus_grant',
      }
    );
  }

  /**
   * Grant Free ONCE: 100 kredit, satu kali per akun billing WORKSPACE.
   * Kunci idempotency diturunkan dari identitas akun workspace
   * (`free-once:<accountId>`) di level STORE — permintaan berulang, retry
   * jaringan, inisialisasi ulang, onboarding berulang, bahkan instance
   * engine baru di atas store yang sama TIDAK bisa menggandakannya.
   * Kelayakan otoritatif adalah store server-side ini, bukan localStorage.
   * (Adapter DB production menegakkan hal yang sama via UNIQUE INDEX
   * parsial per akun untuk tipe FREE_ONCE — lihat migration Phase 5.3.)
   *
   * expiresAt SELALU null: FREE_ONCE tidak pernah kedaluwarsa (Phase 5.1
   * C3 / Phase 5.3). Tidak ada timestamp kedaluwarsa dari default mana pun,
   * dan applyExpirations melewati tipe ini secara eksplisit.
   */
  function grantFreeOnce(args) {
    const key = `free-once:${args.accountId}`;
    return grantCommon(
      {
        accountId: args.accountId,
        amount: FREE_ONCE_AMOUNT,
        idempotencyKey: key,
        actor: args.actor || 'system',
        now: args.now,
      },
      'FREE_ONCE',
      {
        expiresAt: null,
        sourceRef: 'free-once-grant',
        reason: 'free_once_grant',
      }
    );
  }

  /**
   * Saldo diturunkan HANYA dari batch (tidak ada angka tersimpan terpisah).
   * Batch yang sudah kedaluwarsa pada `now` tidak menyumbang available,
   * tetapi reserved-nya tetap dihitung (milik reservasi yang masih hidup).
   */
  function getBalance(accountId, now) {
    const at = now == null ? Date.now() : now;
    const bal = {
      accountId,
      subscriptionAvailable: 0,
      topupAvailable: 0,
      bonusAvailable: 0,
      freeOnceAvailable: 0,
      reserved: 0,
      total: 0,
    };
    for (const b of accountBatches(accountId)) {
      bal.reserved += b.reservedAmount;
      const expired = b.expiresAt != null && b.expiresAt <= at;
      if (expired) continue;
      if (b.type === 'SUBSCRIPTION') bal.subscriptionAvailable += b.remainingAmount;
      else if (b.type === 'TOP_UP') bal.topupAvailable += b.remainingAmount;
      else if (b.type === 'BONUS') bal.bonusAvailable += b.remainingAmount;
      else if (b.type === 'FREE_ONCE') bal.freeOnceAvailable += b.remainingAmount;
    }
    bal.total =
      bal.subscriptionAvailable + bal.topupAvailable + bal.bonusAvailable + bal.freeOnceAvailable;
    return bal;
  }

  /**
   * Buat operasi usage. Estimasi dicatat sebagai ESTIMASI — bukan konsumsi.
   * Lifecycle: CREATED → RESERVED → SETTLED | RELEASED | REQUIRES_REVIEW.
   */
  function createOperation(args) {
    const now = args.now == null ? Date.now() : args.now;
    if (!isAccountId(args.accountId)) return { ok: false, error: 'INVALID_ACCOUNT' };
    if (!isNonNegativeInt(args.estimatedCredits)) return { ok: false, error: 'INVALID_AMOUNT' };
    const replay = idemGet(args.accountId, args.idempotencyKey, (hit) => {
      const o = hit && hit.operation;
      return !!o && o.estimatedCredits === args.estimatedCredits && (o.feature ?? null) === (args.feature || null);
    });
    if (replay) return replay;
    const op = {
      id: nextId(db, 'op'),
      accountId: args.accountId,
      feature: args.feature || null,
      status: 'CREATED',
      estimatedCredits: args.estimatedCredits,
      reservedCredits: 0,
      actualCredits: null,
      settledCredits: null,
      releasedCredits: null,
      overageCredits: null,
      estimateDelta: null,
      tariffVersion: null,
      usageEvidence: null,
      allocations: [],
      actor: args.actor || null,
      createdAt: now,
      updatedAt: now,
    };
    db.operations.set(op.id, op);
    const result = { ok: true, operation: clone(op) };
    idemPut(args.accountId, args.idempotencyKey, result);
    return clone(result);
  }

  /**
   * Reserve: alokasikan estimasi ke batch menurut kebijakan alokasi dan catat
   * alokasi persis per batch. Reservasi BUKAN konsumsi. Bila total batch yang
   * layak < estimasi → INSUFFICIENT_BALANCE dan TIDAK ada alokasi parsial
   * yang tersimpan (semua-atau-tidak-sama-sekali).
   */
  function reserve(operationId, args) {
    const now = args.now == null ? Date.now() : args.now;
    if (!isAccountId(args.accountId)) return { ok: false, error: 'INVALID_ACCOUNT' };
    const replay = idemGet(args.accountId, args.idempotencyKey, (hit) => {
      const o = hit && hit.operation;
      return !!o && o.id === operationId;
    });
    if (replay) return replay;
    const found = ownedOperation(operationId, args.accountId);
    if (found.error) return { ok: false, error: found.error };
    const op = found.op;
    if (op.status !== 'CREATED') return { ok: false, error: 'INVALID_STATE' };

    const amount = op.estimatedCredits;
    const ordered = resolveAllocationOrder(accountBatches(args.accountId), now);
    const eligibleTotal = ordered.reduce((s, b) => s + b.remainingAmount, 0);
    if (eligibleTotal < amount) return { ok: false, error: 'INSUFFICIENT_BALANCE' };

    let need = amount;
    const allocations = [];
    for (const batch of ordered) {
      if (need <= 0) break;
      const take = Math.min(batch.remainingAmount, need);
      if (take <= 0) continue;
      batch.remainingAmount -= take;
      batch.reservedAmount += take;
      batch.updatedAt = now;
      refreshStatus(batch, now);
      allocations.push({ batchId: batch.id, amount: take });
      appendEntry({
        accountId: args.accountId, kind: 'RESERVE', batchId: batch.id,
        operationId: op.id, amount: -take,
        idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}#${batch.id}` : null,
        actor: args.actor || op.actor, reason: 'reserve', now,
      });
      need -= take;
    }
    op.allocations = allocations;
    op.reservedCredits = amount;
    op.status = 'RESERVED';
    op.updatedAt = now;
    const result = { ok: true, operation: clone(op), allocations: clone(allocations) };
    idemPut(args.accountId, args.idempotencyKey, result);
    return clone(result);
  }

  /** Lepaskan sisa reservasi ke batch asal; batch yang sudah kedaluwarsa pada
   *  saat pelepasan menerima write-off EXPIRATION, bukan pengembalian sisa. */
  function releaseAllocations(op, args, now, keyPrefix) {
    let released = 0;
    let expiredOff = 0;
    for (const alloc of op.allocations) {
      const batch = db.batches.get(alloc.batchId);
      if (!batch) continue;
      batch.reservedAmount -= alloc.amount;
      const batchExpired = batch.expiresAt != null && batch.expiresAt <= now;
      if (batchExpired) {
        batch.expiredAmount += alloc.amount;
        expiredOff += alloc.amount;
        appendEntry({
          accountId: args.accountId, kind: 'EXPIRATION', batchId: batch.id,
          operationId: op.id, amount: -alloc.amount,
          idempotencyKey: keyPrefix ? `${keyPrefix}#exp#${batch.id}` : `expire-rel:${op.id}:${batch.id}`,
          actor: args.actor || 'system', reason: 'release_after_batch_expiry', now,
        });
      } else {
        batch.remainingAmount += alloc.amount;
        released += alloc.amount;
        appendEntry({
          accountId: args.accountId, kind: 'RESERVE_RELEASE', batchId: batch.id,
          operationId: op.id, amount: alloc.amount,
          idempotencyKey: keyPrefix ? `${keyPrefix}#${batch.id}` : null,
          actor: args.actor || op.actor, reason: 'release', now,
        });
      }
      batch.updatedAt = now;
      refreshStatus(batch, now);
    }
    return { released, expiredOff };
  }

  /**
   * Buka record review manual untuk operasi yang masuk REQUIRES_REVIEW
   * (Phase 5.3 Workstream D). Record mempertahankan SELURUH bukti:
   * reserved/aktual/overage, versi tarif, usageEvidence, feature, actor
   * peminta. Status awal PENDING — selama pending, reservasi dan bukti
   * TIDAK berubah dan TIDAK ada settlement/release otomatis.
   */
  function openReview(op, now) {
    const review = {
      id: nextId(db, 'review'),
      operationId: op.id,
      accountId: op.accountId,
      status: 'PENDING',
      feature: op.feature,
      reservedCredits: op.reservedCredits,
      actualCredits: op.actualCredits,
      overageCredits: op.overageCredits,
      tariffVersion: op.tariffVersion,
      usageEvidence: clone(op.usageEvidence),
      requestedBy: op.actor,
      createdAt: now,
      reviewerId: null,
      reviewerRole: null,
      resolutionReason: null,
      resolvedAt: null,
    };
    db.reviews.push(review);
    return review;
  }

  function reviewForOperation(operationId) {
    return db.reviews.find((r) => r.operationId === operationId) || null;
  }

  /**
   * Settle dengan usage AKTUAL (Keputusan USAGE):
   * - actualCredits wajib integer ≥ 0 (selain itu INVALID_USAGE, state utuh).
   * - usageEvidence wajib ada (selain itu USAGE_MISSING, state utuh) —
   *   usage tidak pernah dikarang dan estimasi tidak pernah di-settle.
   * - tariffVersion wajib dikenal registri tarif (selain itu UNKNOWN_TARIFF,
   *   state utuh).
   * - actual ≤ reserved: konsumsi persis actual dari alokasi tercatat, sisa
   *   reservasi dilepas ke batch yang sama (atau di-write-off EXPIRATION bila
   *   batch sudah kedaluwarsa saat settle). Contoh kanonis: reserve 800,
   *   actual 500 → konsumsi 500, lepas 300, saldo tersedia turun tepat 500.
   * - actual > reserved: operasi → REQUIRES_REVIEW dan record review manual
   *   dibuka (openReview), bukti usage dipertahankan, TIDAK ada debit
   *   parsial, TIDAK ada saldo negatif. Resolusi hanya lewat resolveReview
   *   oleh reviewer berwenang (keputusan owner Phase 5.3: MANUAL REVIEW).
   * Idempotent: settle ulang (kunci sama atau operasi sudah SETTLED) mengembalikan
   * hasil tercatat tanpa efek kedua.
   */
  function settle(operationId, args) {
    const now = args.now == null ? Date.now() : args.now;
    if (!isAccountId(args.accountId)) return { ok: false, error: 'INVALID_ACCOUNT' };
    const replay = idemGet(args.accountId, args.idempotencyKey, (hit) => {
      const o = hit && hit.operation;
      return !!o && o.id === operationId && o.actualCredits === args.actualCredits;
    });
    if (replay) return replay;
    const found = ownedOperation(operationId, args.accountId);
    if (found.error) return { ok: false, error: found.error };
    const op = found.op;
    if (op.status === 'SETTLED') {
      return {
        ok: true, duplicate: true, operation: clone(op),
        settledCredits: op.settledCredits, releasedCredits: op.releasedCredits,
      };
    }
    if (op.status === 'REQUIRES_REVIEW') return { ok: false, error: 'REQUIRES_REVIEW', operation: clone(op) };
    if (op.status !== 'RESERVED') return { ok: false, error: 'INVALID_STATE' };

    if (!isNonNegativeInt(args.actualCredits)) return { ok: false, error: 'INVALID_USAGE' };
    if (args.usageEvidence == null) return { ok: false, error: 'USAGE_MISSING' };
    if (!args.tariffVersion || !tariffs.hasVersion(args.tariffVersion)) {
      return { ok: false, error: 'UNKNOWN_TARIFF' };
    }

    const actual = args.actualCredits;
    op.actualCredits = actual;
    op.tariffVersion = args.tariffVersion;
    op.usageEvidence = clone(args.usageEvidence);

    if (actual > op.reservedCredits) {
      op.status = 'REQUIRES_REVIEW';
      op.overageCredits = actual - op.reservedCredits;
      op.updatedAt = now;
      const review = openReview(op, now);
      const result = {
        ok: true, status: 'REQUIRES_REVIEW', operation: clone(op),
        overageCredits: op.overageCredits, reviewId: review.id,
      };
      idemPut(args.accountId, args.idempotencyKey, result);
      return clone(result);
    }

    let toConsume = actual;
    let releasedTotal = 0;
    for (const alloc of op.allocations) {
      const batch = db.batches.get(alloc.batchId);
      if (!batch) continue;
      const consumeHere = Math.min(alloc.amount, toConsume);
      const remainder = alloc.amount - consumeHere;
      toConsume -= consumeHere;
      batch.reservedAmount -= alloc.amount;
      if (consumeHere > 0) {
        batch.consumedAmount += consumeHere;
        appendEntry({
          accountId: args.accountId, kind: 'CONSUME', batchId: batch.id,
          operationId: op.id, amount: -consumeHere,
          idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}#consume#${batch.id}` : null,
          actor: args.actor || op.actor, reason: 'settle_actual_usage', now,
        });
      }
      if (remainder > 0) {
        const batchExpired = batch.expiresAt != null && batch.expiresAt <= now;
        if (batchExpired) {
          batch.expiredAmount += remainder;
          appendEntry({
            accountId: args.accountId, kind: 'EXPIRATION', batchId: batch.id,
            operationId: op.id, amount: -remainder,
            idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}#exp#${batch.id}` : `expire-settle:${op.id}:${batch.id}`,
            actor: 'system', reason: 'settle_remainder_after_batch_expiry', now,
          });
        } else {
          batch.remainingAmount += remainder;
          releasedTotal += remainder;
          appendEntry({
            accountId: args.accountId, kind: 'RESERVE_RELEASE', batchId: batch.id,
            operationId: op.id, amount: remainder,
            idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}#release#${batch.id}` : null,
            actor: args.actor || op.actor, reason: 'settle_release_unused', now,
          });
        }
      }
      batch.updatedAt = now;
      refreshStatus(batch, now);
    }
    op.status = 'SETTLED';
    op.settledCredits = actual;
    op.releasedCredits = releasedTotal;
    op.estimateDelta = op.estimatedCredits - actual;
    op.updatedAt = now;
    const result = {
      ok: true, operation: clone(op),
      settledCredits: actual, releasedCredits: releasedTotal,
    };
    idemPut(args.accountId, args.idempotencyKey, result);
    return clone(result);
  }

  /** Release penuh reservasi ke batch asal (aturan kedaluwarsa sama seperti settle). Idempotent. */
  function release(operationId, args) {
    const now = args.now == null ? Date.now() : args.now;
    if (!isAccountId(args.accountId)) return { ok: false, error: 'INVALID_ACCOUNT' };
    const replay = idemGet(args.accountId, args.idempotencyKey, (hit) => {
      const o = hit && hit.operation;
      return !!o && o.id === operationId;
    });
    if (replay) return replay;
    const found = ownedOperation(operationId, args.accountId);
    if (found.error) return { ok: false, error: found.error };
    const op = found.op;
    if (op.status === 'RELEASED') {
      return { ok: true, duplicate: true, operation: clone(op), releasedCredits: op.releasedCredits };
    }
    if (op.status !== 'RESERVED') return { ok: false, error: 'INVALID_STATE' };
    const keyPrefix = args.idempotencyKey ? `${args.idempotencyKey}#rel` : null;
    const { released, expiredOff } = releaseAllocations(op, args, now, keyPrefix);
    op.status = 'RELEASED';
    op.releasedCredits = released;
    op.updatedAt = now;
    const result = { ok: true, operation: clone(op), releasedCredits: released, expiredCredits: expiredOff };
    idemPut(args.accountId, args.idempotencyKey, result);
    return clone(result);
  }

  /**
   * Sapu kedaluwarsa: batch ACTIVE dengan expiresAt ≤ now dan sisa > 0 →
   * entri EXPIRATION (kunci `expire:<batchId>`), sisa dipindah ke
   * expiredAmount, status EXPIRED. Dana yang sedang di-reserve TIDAK disentuh
   * (milik reservasi yang hidup). Idempotent — jalan ulang tidak berakibat apa pun.
   */
  function applyExpirations(args) {
    const opts = args || {};
    const now = opts.now == null ? Date.now() : opts.now;
    const expiredBatchIds = [];
    let totalExpired = 0;
    for (const batch of db.batches.values()) {
      if (opts.accountId && batch.accountId !== opts.accountId) continue;
      if (batch.status === 'FROZEN') continue;
      // FREE_ONCE tidak pernah kedaluwarsa (Phase 5.1 C3): lewati secara
      // EKSPLISIT — bahkan batch historis yang masih membawa expiresAt
      // finite tidak boleh disapu sebelum dikoreksi lewat
      // recordFreeOncePolicyCorrection.
      if (batch.type === 'FREE_ONCE') continue;
      if (batch.expiresAt == null || batch.expiresAt > now) continue;
      if (batch.remainingAmount > 0) {
        const key = `expire:${batch.id}`;
        if (!db.idempotency.has(`${batch.accountId}::${key}`)) {
          appendEntry({
            accountId: batch.accountId, kind: 'EXPIRATION', batchId: batch.id,
            amount: -batch.remainingAmount, idempotencyKey: key,
            actor: 'system', reason: 'batch_expiry_sweep', now,
          });
          idemPut(batch.accountId, key, { ok: true, batchId: batch.id });
        }
        totalExpired += batch.remainingAmount;
        batch.expiredAmount += batch.remainingAmount;
        batch.remainingAmount = 0;
        expiredBatchIds.push(batch.id);
      }
      batch.status = 'EXPIRED';
      batch.updatedAt = now;
    }
    return { ok: true, expiredBatchIds, totalExpired };
  }

  /**
   * Resolusi MANUAL atas operasi REQUIRES_REVIEW (Phase 5.3 Workstream D).
   *
   * args.reviewer adalah record keanggotaan reviewer yang SUDAH
   * diverifikasi server-side (bentuk normalizeMembership dari
   * billingAuthorization.js: { userId, role, status, billingAdmin }).
   * Otorisasi diputuskan oleh canResolveBillingReview — Owner workspace
   * (SUPER_ADMIN) atau pemegang grant billingAdmin eksplisit; selain itu
   * FORBIDDEN_REVIEW dan TIDAK ada perubahan state.
   *
   * - APPROVED: bukti & versi tarif diverifikasi ULANG; kelebihan
   *   (actual − reserved) hanya didebit bila saldo tersedia workspace
   *   mencukupi (selain itu INSUFFICIENT_BALANCE dan review TETAP PENDING).
   *   Settlement bersifat atomik di level operasi ini: konsumsi alokasi
   *   reservasi + debit kelebihan dari batch tersedia menurut urutan
   *   alokasi, lalu operasi SETTLED dengan settledCredits = actual.
   * - REJECTED: kelebihan TIDAK didebit; reservasi dilepas ke batch asal
   *   (write-off EXPIRATION bila batch sudah kedaluwarsa — aturan release
   *   biasa); operasi RELEASED; bukti & alasan penolakan dipertahankan.
   * - Idempotent: kunci yang sama memutar ulang hasil tercatat; resolusi
   *   kedua dengan kunci berbeda → ALREADY_RESOLVED tanpa efek.
   * - Jumlah final TIDAK PERNAH diambil dari input client: aktual berasal
   *   dari usageEvidence yang tercatat di operasi saat settle.
   */
  function resolveReview(operationId, args) {
    const now = args.now == null ? Date.now() : args.now;
    if (!isAccountId(args.accountId)) return { ok: false, error: 'INVALID_ACCOUNT' };
    const replay = idemGet(args.accountId, args.idempotencyKey, (hit) => {
      const o = hit && hit.operation;
      return !!o && o.id === operationId && hit.status === args.decision;
    });
    if (replay) return replay;
    const found = ownedOperation(operationId, args.accountId);
    if (found.error) return { ok: false, error: found.error };
    const op = found.op;
    const review = reviewForOperation(operationId);
    if (!review) return { ok: false, error: 'REVIEW_NOT_FOUND' };
    if (review.status !== 'PENDING') {
      return { ok: false, error: 'ALREADY_RESOLVED', review: clone(review), operation: clone(op) };
    }
    if (op.status !== 'REQUIRES_REVIEW') return { ok: false, error: 'INVALID_STATE' };
    if (!canResolveBillingReview(args.reviewer)) {
      return { ok: false, error: 'FORBIDDEN_REVIEW' };
    }
    const decision = args.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return { ok: false, error: 'INVALID_DECISION' };
    }
    if (typeof args.reason !== 'string' || !args.reason.trim()) {
      return { ok: false, error: 'REASON_REQUIRED' };
    }
    const reviewerId = args.reviewer.userId;
    const keyPrefix = args.idempotencyKey ? `${args.idempotencyKey}` : null;

    if (decision === 'APPROVED') {
      // Verifikasi ulang bukti & tarif — jangan percaya keadaan saat
      // review dibuka; jangan pernah mengarang hasil settlement.
      if (op.usageEvidence == null || op.actualCredits == null) {
        return { ok: false, error: 'USAGE_MISSING', review: clone(review), operation: clone(op) };
      }
      if (!op.tariffVersion || !tariffs.hasVersion(op.tariffVersion)) {
        return { ok: false, error: 'UNKNOWN_TARIFF', review: clone(review), operation: clone(op) };
      }
      const overage = op.actualCredits - op.reservedCredits;
      // Kelebihan hanya boleh didebit dari saldo TERSEDIA workspace ini.
      // Periksa utuh lebih dulu: bila kurang, review tetap PENDING dan
      // tidak ada mutasi apa pun.
      const eligible = resolveAllocationOrder(accountBatches(args.accountId), now);
      const available = eligible.reduce((s, b) => s + b.remainingAmount, 0);
      if (available < overage) {
        return { ok: false, error: 'INSUFFICIENT_BALANCE', review: clone(review), operation: clone(op) };
      }
      // Sprint 3: snapshot pra-mutasi untuk assertion pasca-loop (padanan
      // F-10 di SQL). Bila debit overage ternyata tidak terpenuhi penuh,
      // seluruh cabang APPROVED dipulihkan — nol persetujuan parsial.
      const batchSnapshot = new Map();
      for (const b of accountBatches(args.accountId)) batchSnapshot.set(b.id, clone(b));
      const ledgerLengthBefore = db.ledger.length;
      // 1) Konsumsi seluruh alokasi reservasi (actual > reserved, jadi
      //    tidak ada sisa reservasi yang dilepas).
      for (const alloc of op.allocations) {
        const batch = db.batches.get(alloc.batchId);
        if (!batch) continue;
        batch.reservedAmount -= alloc.amount;
        batch.consumedAmount += alloc.amount;
        batch.updatedAt = now;
        refreshStatus(batch, now);
        appendEntry({
          accountId: args.accountId, kind: 'CONSUME', batchId: batch.id,
          operationId: op.id, amount: -alloc.amount,
          idempotencyKey: keyPrefix ? `${keyPrefix}#consume#${batch.id}` : null,
          actor: reviewerId, reason: 'review_approved_settle', now,
        });
      }
      // 2) Debit kelebihan dari batch tersedia menurut urutan alokasi.
      let need = overage;
      for (const batch of eligible) {
        if (need <= 0) break;
        const take = Math.min(batch.remainingAmount, need);
        if (take <= 0) continue;
        batch.remainingAmount -= take;
        batch.consumedAmount += take;
        batch.updatedAt = now;
        refreshStatus(batch, now);
        appendEntry({
          accountId: args.accountId, kind: 'CONSUME', batchId: batch.id,
          operationId: op.id, amount: -take,
          idempotencyKey: keyPrefix ? `${keyPrefix}#overage#${batch.id}` : null,
          actor: reviewerId, reason: 'review_approved_overage', now,
        });
        need -= take;
      }
      if (need !== 0) {
        // Assertion gagal: pulihkan batch + jurnal ke keadaan pra-mutasi.
        for (const [id, snap] of batchSnapshot.entries()) {
          const cur = db.batches.get(id);
          if (cur) Object.assign(cur, clone(snap));
        }
        db.ledger.length = ledgerLengthBefore;
        return { ok: false, error: 'INSUFFICIENT_BALANCE', review: clone(review), operation: clone(op) };
      }
      op.status = 'SETTLED';
      op.settledCredits = op.actualCredits;
      op.releasedCredits = 0;
      op.estimateDelta = op.estimatedCredits - op.actualCredits;
      op.updatedAt = now;
    } else {
      // REJECTED: kelebihan tidak didebit; reservasi dilepas menurut
      // lifecycle aktual (releaseAllocations menangani write-off
      // EXPIRATION untuk batch yang sudah kedaluwarsa).
      const relArgs = { accountId: args.accountId, actor: reviewerId };
      const { released } = releaseAllocations(op, relArgs, now, keyPrefix ? `${keyPrefix}#rel` : null);
      op.status = 'RELEASED';
      op.releasedCredits = released;
      op.updatedAt = now;
    }

    review.status = decision;
    review.reviewerId = reviewerId;
    review.reviewerRole = args.reviewer.role || null;
    review.resolutionReason = args.reason;
    review.resolvedAt = now;
    appendEntry({
      accountId: args.accountId, kind: 'REVIEW_DECISION', batchId: null,
      operationId: op.id, amount: 0,
      idempotencyKey: keyPrefix ? `${keyPrefix}#decision` : null,
      actor: reviewerId,
      reason: `review_${decision.toLowerCase()}: ${args.reason}`,
      now,
    });
    const result = { ok: true, status: decision, review: clone(review), operation: clone(op) };
    idemPut(args.accountId, args.idempotencyKey, result);
    return clone(result);
  }

  /**
   * Koreksi TERAUDIT untuk batch FREE_ONCE historis yang terlanjur terbit
   * dengan expiresAt finite (kebijakan 90 hari Phase 5 — kini superseded
   * oleh Phase 5.1 C3). Prinsip: sejarah TIDAK ditulis ulang.
   * - Entri GRANT asli dan entri EXPIRATION apa pun yang sudah terjadi
   *   tetap utuh di ledger (append-only).
   * - Koreksi dicatat sebagai entri kompensasi baru (kind REVERSAL) yang
   *   memuat actor, alasan, dan nilai sebelum/sesudah di alasannya, plus
   *   anotasi `policyCorrection` pada batch.
   * - Bila sweep sudah memindahkan sisa ke expiredAmount, sisa itu
   *   dikembalikan ke remainingAmount: saldo efektif tidak boleh berkurang
   *   hanya karena cap waktu lama terlewati.
   * - Idempotent per batch (kunci default `free-once-correction:<batchId>`).
   * CATATAN: fungsi ini bekerja pada store yang diberikan. Di repo saat ini
   * TIDAK ada store persisten (adapter DB belum ada), jadi belum ada record
   * historis production yang bisa dikoreksi dari sini — rekonsiliasi DB
   * adalah langkah terpisah berpersetujuan owner (migration Phase 5.3).
   */
  function recordFreeOncePolicyCorrection(args) {
    const now = args.now == null ? Date.now() : args.now;
    if (!isAccountId(args.accountId)) return { ok: false, error: 'INVALID_ACCOUNT' };
    const key = args.idempotencyKey || `free-once-correction:${args.batchId}`;
    const replay = idemGet(args.accountId, key, (hit) => {
      const b = hit && hit.batch;
      return !!b && b.id === args.batchId;
    });
    if (replay) return replay;
    const batch = db.batches.get(args.batchId);
    if (!batch) return { ok: false, error: 'NOT_FOUND' };
    if (batch.accountId !== args.accountId) return { ok: false, error: 'FORBIDDEN' };
    if (batch.type !== 'FREE_ONCE') return { ok: false, error: 'NOT_FREE_ONCE' };
    if (typeof args.reason !== 'string' || !args.reason.trim()) {
      return { ok: false, error: 'REASON_REQUIRED' };
    }
    if (batch.expiresAt == null && !batch.policyCorrection) {
      const result = { ok: true, alreadyNonExpiring: true, batch: clone(batch), restoredAmount: 0 };
      idemPut(args.accountId, key, result);
      return clone(result);
    }
    const previousExpiresAt = batch.expiresAt;
    const restored = batch.expiredAmount;
    if (restored > 0) {
      batch.remainingAmount += restored;
      batch.expiredAmount = 0;
    }
    batch.expiresAt = null;
    batch.policyCorrection = {
      correctedAt: now,
      actor: args.actor || null,
      reason: args.reason,
      previousExpiresAt,
      restoredAmount: restored,
    };
    batch.updatedAt = now;
    refreshStatus(batch, now);
    appendEntry({
      accountId: args.accountId, kind: 'REVERSAL', batchId: batch.id,
      amount: restored,
      idempotencyKey: key,
      actor: args.actor || null,
      reason: `free_once_policy_correction: expiresAt ${previousExpiresAt} -> null; restored ${restored}; ${args.reason}`,
      now,
    });
    const result = { ok: true, batch: clone(batch), restoredAmount: restored, previousExpiresAt };
    idemPut(args.accountId, key, result);
    return clone(result);
  }

  function listReviews(accountId, status) {
    return db.reviews
      .filter((r) => r.accountId === accountId && (status == null || r.status === status))
      .map((r) => clone(r));
  }

  function getReview(operationId, args) {
    const review = reviewForOperation(operationId);
    if (!review) return { ok: false, error: 'NOT_FOUND' };
    if (!args || review.accountId !== args.accountId) return { ok: false, error: 'FORBIDDEN' };
    return { ok: true, review: clone(review) };
  }

  // ---- Inspeksi (semua memeriksa kepemilikan; hasil selalu salinan) ----
  function getBatch(batchId, args) {
    const batch = db.batches.get(batchId);
    if (!batch) return { ok: false, error: 'NOT_FOUND' };
    if (!args || batch.accountId !== args.accountId) return { ok: false, error: 'FORBIDDEN' };
    return { ok: true, batch: clone(batch) };
  }

  function listBatches(accountId) {
    return accountBatches(accountId).map((b) => clone(b));
  }

  function listLedger(accountId) {
    return db.ledger.filter((e) => e.accountId === accountId).map((e) => ({ ...e }));
  }

  function getOperation(operationId, args) {
    const found = ownedOperation(operationId, args && args.accountId);
    if (found.error) return { ok: false, error: found.error };
    return { ok: true, operation: clone(found.op) };
  }

  return {
    grantSubscription,
    grantTopUp,
    grantBonus,
    grantFreeOnce,
    recordFreeOncePolicyCorrection,
    getBalance,
    createOperation,
    reserve,
    settle,
    release,
    resolveReview,
    listReviews,
    getReview,
    applyExpirations,
    getBatch,
    listBatches,
    listLedger,
    getOperation,
    store: db,
  };
}

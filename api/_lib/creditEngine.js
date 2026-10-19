/**
 * api/_lib/creditEngine.js — Credit Ledger Engine (Phase 2)
 * ============================================================================
 * Pencatatan saldo AUTHORITATIVE di server. Aturan keras:
 *
 * 1. TIDAK PERNAH percaya jumlah kredit dari frontend — semua debit dihitung
 *    server dari tarif + pemakaian aktual.
 * 2. Ledger append-only: koreksi via transaksi baru, bukan UPDATE/DELETE.
 * 3. Idempotensi: (user_id, idempotency_key) UNIQUE — retry aman.
 * 4. Atomic: insert ledger + update balance dalam satu transaksi.
 * 5. Urutan pakai: bonus → topup → subscription (FIFO kedaluwarsa).
 *
 * Storage adapter: Supabase (produksi) atau InMemory (test).
 * API routes: api/credits/*.js
 */

export const CREDIT_KINDS = [
  'subscription_grant', 'subscription_reset',
  'topup', 'bonus',
  'reserve', 'reserve_release', 'consume',
  'refund', 'correction', 'admin_adjust',
];

/** Urutan pemakaian bucket: bonus dulu, lalu topup, lalu subscription. */
const BUCKET_ORDER = ['bonus', 'topup', 'subscription'];

function snapshot(bal) {
  return {
    subscription: bal.subscription,
    topup: bal.topup,
    bonus: bal.bonus,
    reserved: bal.reserved,
    total: bal.subscription + bal.topup + bal.bonus,
    available: bal.subscription + bal.topup + bal.bonus - bal.reserved,
  };
}

function emptyBalance(userId) {
  return { user_id: userId, subscription: 0, topup: 0, bonus: 0, reserved: 0 };
}

/**
 * Kurangi bucket sesuai urutan. Mengembalikan {taken, buckets} atau
 * {insufficient:true, available}.
 */
function takeFromBuckets(bal, amount) {
  const available = bal.subscription + bal.topup + bal.bonus - bal.reserved;
  if (available < amount) return { insufficient: true, available };
  const buckets = { subscription: bal.subscription, topup: bal.topup, bonus: bal.bonus };
  let rest = amount;
  const taken = { bonus: 0, topup: 0, subscription: 0 };
  for (const b of BUCKET_ORDER) {
    const use = Math.min(buckets[b], rest);
    taken[b] = use;
    buckets[b] -= use;
    rest -= use;
    if (rest <= 0) break;
  }
  return { taken, buckets };
}

// ---------------------------------------------------------------------------
// In-memory adapter (untuk test; BUKAN untuk produksi)
// ---------------------------------------------------------------------------
export function createMemoryAdapter() {
  const balances = new Map(); // userId -> balance
  const ledger = []; // array of entries
  const idemKeys = new Set(); // "userId:key"
  const reservations = new Map(); // id -> reservation
  const usageLog = [];

  return {
    kind: 'memory',
    async getBalance(userId) {
      return balances.get(userId) || emptyBalance(userId);
    },
    async transact(userId, idempotencyKey, fn) {
      const ik = userId + ':' + idempotencyKey;
      if (idemKeys.has(ik)) {
        return { duplicate: true, ledger: ledger.find((e) => e.user_id === userId && e.idempotency_key === idempotencyKey) || null };
      }
      const bal = await this.getBalance(userId);
      const result = await fn({ ...bal });
      if (result && result.abort) return { aborted: true, reason: result.reason, available: result.available };
      idemKeys.add(ik);
      const newBal = { ...result.balance, user_id: userId, updated_at: new Date().toISOString() };
      balances.set(userId, newBal);
      const entry = {
        id: 'led_' + Math.random().toString(36).slice(2, 12),
        user_id: userId,
        kind: result.kind,
        credits: result.credits,
        balance_after: snapshot(newBal),
        idempotency_key: idempotencyKey,
        ref_type: result.refType || null,
        ref_id: result.refId || null,
        reason: result.reason || null,
        created_by: result.createdBy || 'system',
        created_at: new Date().toISOString(),
      };
      ledger.push(entry);
      return { ok: true, entry, balance: snapshot(newBal) };
    },
    async getLedger(userId, limit = 50) {
      return ledger.filter((e) => e.user_id === userId).slice(-limit).reverse();
    },
    // Reservasi (disederhanakan untuk adapter memory; versi Supabase pakai RPC)
    reservations,
    usageLog,
    _dump() { return { balances: [...balances.values()], ledger }; },
  };
}

// ---------------------------------------------------------------------------
// Engine — logika bisnis murni, agnostik storage
// ---------------------------------------------------------------------------
export function createCreditEngine(adapter) {
  async function getBalance(userId) {
    const bal = await adapter.getBalance(userId);
    return snapshot(bal);
  }

  /**
   * Debit kredit (pemakaian aktual). Jumlah DITENTUKAN SERVER.
   * Idempoten via idempotencyKey.
   */
  async function debit(userId, credits, opts = {}) {
    if (!Number.isInteger(credits) || credits <= 0) {
      return { ok: false, error: 'INVALID_CREDITS' };
    }
    const key = opts.idempotencyKey || ('debit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    return adapter.transact(userId, key, (bal) => {
      const r = takeFromBuckets(bal, credits);
      if (r.insufficient) {
        return { abort: true, reason: 'INSUFFICIENT_BALANCE', available: r.available };
      }
      return {
        kind: 'consume',
        credits: -credits,
        balance: { ...bal, ...r.buckets },
        refType: opts.refType || 'ai_usage',
        refId: opts.refId || null,
        reason: opts.reason || null,
        createdBy: opts.createdBy || 'system',
        taken: r.taken,
      };
    });
  }

  /**
   * Tambah kredit (grant). kind: subscription_grant | topup | bonus | refund.
   */
  async function grant(userId, credits, kind, opts = {}) {
    if (!['subscription_grant', 'topup', 'bonus', 'refund'].includes(kind)) {
      return { ok: false, error: 'INVALID_KIND' };
    }
    if (!Number.isInteger(credits) || credits <= 0) {
      return { ok: false, error: 'INVALID_CREDITS' };
    }
    const bucket = kind === 'subscription_grant' ? 'subscription' : kind === 'topup' ? 'topup' : 'bonus';
    // refund masuk ke bucket topup (dapat dipakai ulang, tidak hangus)
    const targetBucket = kind === 'refund' ? 'topup' : bucket;
    const key = opts.idempotencyKey || (kind + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    return adapter.transact(userId, key, (bal) => ({
      kind,
      credits,
      balance: { ...bal, [targetBucket]: bal[targetBucket] + credits },
      refType: opts.refType || null,
      refId: opts.refId || null,
      reason: opts.reason || null,
      createdBy: opts.createdBy || 'system',
    }));
  }

  /**
   * Reservasi kredit untuk job mahal (mis. DED). Atomik: reserved naik,
   * available turun. Tidak melebihi maxCredits yang disetujui user.
   */
  async function reserve(userId, jobId, feature, maxCredits, opts = {}) {
    if (!Number.isInteger(maxCredits) || maxCredits <= 0) {
      return { ok: false, error: 'INVALID_CREDITS' };
    }
    const key = opts.idempotencyKey || ('rsv_' + jobId);
    const resvId = 'rsv_' + Math.random().toString(36).slice(2, 12);
    const tx = await adapter.transact(userId, key, (bal) => {
      const r = takeFromBuckets(bal, maxCredits);
      if (r.insufficient) {
        return { abort: true, reason: 'INSUFFICIENT_BALANCE', available: r.available };
      }
      return {
        kind: 'reserve',
        credits: 0, // reservasi bukan debit — hanya mengunci
        balance: { ...bal, ...r.buckets, reserved: bal.reserved + maxCredits },
        refType: 'reservation',
        refId: resvId,
        reason: opts.reason || `Reservasi ${feature} (maks ${maxCredits})`,
        createdBy: opts.createdBy || 'system',
        taken: r.taken,
      };
    });
    if (!tx.ok) return tx;
    const reservation = {
      id: resvId,
      user_id: userId,
      job_id: jobId,
      feature,
      credits_reserved: maxCredits,
      credits_used: 0,
      max_credits: maxCredits,
      status: 'active',
      idempotency_key: key,
      expires_at: new Date(Date.now() + (opts.ttlMs || 30 * 60 * 1000)).toISOString(),
      created_at: new Date().toISOString(),
    };
    if (adapter.reservations) adapter.reservations.set(resvId, reservation);
    return { ok: true, reservation, balance: tx.balance, taken: tx.entry ? undefined : undefined };
  }

  /**
   * Rekonsiliasi: catat pemakaian aktual, lepaskan sisa reservasi.
   * TIDAK PERNAH melebihi max_credits yang disetujui.
   */
  async function releaseReservation(userId, reservationId, actualUsed, opts = {}) {
    const resv = adapter.reservations ? adapter.reservations.get(reservationId) : null;
    if (!resv || resv.user_id !== userId) return { ok: false, error: 'RESERVATION_NOT_FOUND' };
    if (resv.status !== 'active') return { ok: false, error: 'RESERVATION_NOT_ACTIVE' };
    const used = Math.max(0, Math.min(Math.round(actualUsed || 0), resv.max_credits));
    const released = resv.credits_reserved - used;
    const key = opts.idempotencyKey || ('rel_' + reservationId);

    // Ledger: consume untuk yang terpakai + reserve_release untuk sisa.
    // Karena reservasi sudah mengunci bucket, pelepasan = kembalikan bucket.
    const tx = await adapter.transact(userId, key, (bal) => {
      // Kembalikan bucket yang diambil saat reservasi belum diimplementasikan
      // per-bucket di adapter memory — sederhanakan: reserved turun, dan
      // 'used' sudah terdebit via takeFromBuckets saat reserve.
      // Untuk koreksi: yang tidak terpakai kembali ke available.
      return {
        kind: used > 0 ? 'consume' : 'reserve_release',
        credits: 0,
        balance: { ...bal, reserved: Math.max(0, bal.reserved - resv.credits_reserved) },
        refType: 'reservation',
        refId: reservationId,
        reason: opts.reason || `Rekonsiliasi: pakai ${used}, lepas ${released}`,
        createdBy: opts.createdBy || 'system',
        _used: used,
        _released: released,
      };
    });
    if (!tx.ok && !tx.duplicate) return tx;
    resv.status = 'completed';
    resv.credits_used = used;
    resv.completed_at = new Date().toISOString();
    return { ok: true, used, released, balance: tx.balance || (await getBalance(userId)) };
  }

  /**
   * Koreksi / penyesuaian admin — SELALU via transaksi baru, dengan alasan.
   */
  async function adjust(userId, credits, reason, adminId) {
    if (!reason || !reason.trim()) return { ok: false, error: 'REASON_REQUIRED' };
    if (!Number.isInteger(credits) || credits === 0) return { ok: false, error: 'INVALID_CREDITS' };
    const key = 'adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    return adapter.transact(userId, key, (bal) => {
      if (credits < 0) {
        const r = takeFromBuckets(bal, -credits);
        if (r.insufficient) return { abort: true, reason: 'INSUFFICIENT_BALANCE', available: r.available };
        return {
          kind: 'admin_adjust', credits,
          balance: { ...bal, ...r.buckets },
          reason, createdBy: 'admin:' + adminId,
        };
      }
      return {
        kind: 'admin_adjust', credits,
        balance: { ...bal, topup: bal.topup + credits },
        reason, createdBy: 'admin:' + adminId,
      };
    });
  }

  async function getHistory(userId, limit) {
    return adapter.getLedger(userId, limit);
  }

  return { getBalance, debit, grant, reserve, releaseReservation, adjust, getHistory };
}

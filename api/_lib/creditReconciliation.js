/**
 * api/_lib/creditReconciliation.js — Rekonsiliasi ledger kredit (Unified Credits)
 * ============================================================================
 * DORMANT: file ini TIDAK diimpor oleh handler/UI mana pun dan TIDAK
 * memperbaiki apa pun — ia hanya MELAPORKAN ketidakcocokan antara kolom
 * batch, jurnal ledger, operasi, dan order pembayaran, agar drift tidak
 * lolos diam-diam.
 *
 * Data yang diperiksa adalah BENTUK DOMAIN creditLedger.js:
 * - batch: { id, type, grantedAmount, remainingAmount, reservedAmount,
 *   consumedAmount, expiredAmount, status, expiresAt }
 * - entri: { batchId, kind, amount, idempotencyKey, operationId }
 * - operasi: { id, status, createdAt }
 * - order: { orderId, status, grantedAt }
 *
 * Konvensi tanda amount (dari header creditLedger.js — perubahan
 * remainingAmount kecuali dinyatakan lain):
 *   GRANT +n · RESERVE −n · RESERVE_RELEASE +n · EXPIRATION −n · CONSUME −n
 * Agregat ledger yang diturunkan per batch:
 *   granted  = Σ GRANT
 *   consumed = −Σ CONSUME
 *   expired  = −Σ EXPIRATION
 *   reserved = −Σ RESERVE − Σ RESERVE_RELEASE + Σ CONSUME-dari-reservasi
 *              + Σ EXPIRATION-dari-reservasi
 * Penjelasan reserved: reservasi menaikkan reserved (entri RESERVE −n);
 * pelepasan (RESERVE_RELEASE +n), konsumsi saat settle (CONSUME dengan
 * reason 'settle_actual_usage' / 'review_approved_settle'), dan write-off
 * kedaluwarsa atas porsi ter-reserve (EXPIRATION dengan reason
 * 'release_after_batch_expiry' / 'settle_remainder_after_batch_expiry')
 * menurunkannya lagi. CONSUME overage hasil review (reason
 * 'review_approved_overage') adalah debit langsung dari remaining, BUKAN
 * dari reservasi, jadi tidak mengoffset reserved. EXPIRATION sapuan sisa
 * (reason 'batch_expiry_sweep') mengoffset expired/remaining, bukan
 * reserved. Entri REVERSAL / REVIEW_DECISION tidak menggerakkan keempat
 * kolom ini secara langsung dan tidak ikut agregat.
 */

/** TTL default reservasi yang dianggap macet: 30 menit (sama semangatnya dengan gerbang reservasi simulasi). */
export const DEFAULT_STUCK_TTL_MS = 30 * 60 * 1000;

const EXPIRATION_RESERVED_REASONS = new Set([
  'release_after_batch_expiry',
  'settle_remainder_after_batch_expiry',
]);

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Inti murni rekonsiliasi satu akun.
 * data: { batches, ledgerEntries, operations, orders? } (bentuk domain di atas).
 * opts: { now, stuckTtlMs } — now dalam ms epoch (default Date.now()).
 *
 * Pemeriksaan:
 * (1) BATCH_INVARIANT_BROKEN — granted ≠ remaining+reserved+consumed+expired.
 * (2) LEDGER_BATCH_MISMATCH — agregat entri per batch tidak cocok kolom batch.
 * (3) DUPLICATE_GRANT_KEY — dua entri GRANT dengan idempotencyKey sama.
 * (4) PAID_ORDER_WITHOUT_GRANT — order PAID / sudah grantedAt tanpa entri
 *     GRANT berkunci persis orderId. Kunci pendamping '<orderId>:bonus'
 *     adalah grant bonus top-up yang sah, tetapi BUKAN pengganti kunci
 *     dasar — order tetap dilaporkan bila hanya kunci bonus yang ada.
 * (5) STUCK_RESERVATION — operasi RESERVED lebih tua dari stuckTtlMs
 *     (masuk discrepancies DAN daftar stuckReservations).
 * (6) Operasi REQUIRES_REVIEW → daftar pendingReviews (BUKAN discrepancy:
 *     review manual adalah keadaan sah yang menunggu manusia).
 *
 * healthy = tanpa discrepancy dan tanpa reservasi macet. pendingReviews
 * tidak memengaruhi healthy.
 */
export function reconcileAccountData(data, opts) {
  const options = opts || {};
  const now = isFiniteNumber(options.now) ? options.now : Date.now();
  const stuckTtlMs = isFiniteNumber(options.stuckTtlMs) ? options.stuckTtlMs : DEFAULT_STUCK_TTL_MS;

  const batches = (data && data.batches) || [];
  const ledgerEntries = (data && data.ledgerEntries) || [];
  const operations = (data && data.operations) || [];
  const orders = (data && data.orders) || [];

  const discrepancies = [];
  const stuckReservations = [];
  const pendingReviews = [];

  // --- Agregat ledger per batch -------------------------------------------
  const aggByBatch = new Map();
  function aggFor(batchId) {
    if (!aggByBatch.has(batchId)) {
      aggByBatch.set(batchId, {
        grant: 0,
        consume: 0,
        expiration: 0,
        reserve: 0,
        release: 0,
        consumeFromReservation: 0,
        expirationFromReservation: 0,
        entries: 0,
      });
    }
    return aggByBatch.get(batchId);
  }
  for (const entry of ledgerEntries) {
    if (!entry || entry.batchId == null) continue;
    const agg = aggFor(entry.batchId);
    agg.entries += 1;
    const amount = isFiniteNumber(entry.amount) ? entry.amount : 0;
    if (entry.kind === 'GRANT') agg.grant += amount;
    else if (entry.kind === 'CONSUME') {
      agg.consume += amount;
      if (entry.reason !== 'review_approved_overage') agg.consumeFromReservation += amount;
    } else if (entry.kind === 'EXPIRATION') {
      agg.expiration += amount;
      if (EXPIRATION_RESERVED_REASONS.has(entry.reason)) agg.expirationFromReservation += amount;
    } else if (entry.kind === 'RESERVE') agg.reserve += amount;
    else if (entry.kind === 'RESERVE_RELEASE') agg.release += amount;
    // REVERSAL / REVIEW_DECISION / kind lain: tidak ikut agregat kolom.
  }

  // --- (1) Invarian batch + (2) kecocokan ledger ---------------------------
  for (const batch of batches) {
    if (!batch) continue;
    const parts =
      (batch.remainingAmount || 0) +
      (batch.reservedAmount || 0) +
      (batch.consumedAmount || 0) +
      (batch.expiredAmount || 0);
    if (batch.grantedAmount !== parts) {
      discrepancies.push({
        kind: 'BATCH_INVARIANT_BROKEN',
        ref: batch.id,
        detail: `grantedAmount=${batch.grantedAmount} tetapi remaining+reserved+consumed+expired=${parts}`,
      });
    }

    const agg = aggFor(batch.id);
    const derived = {
      grantedAmount: agg.grant,
      consumedAmount: -agg.consume,
      expiredAmount: -agg.expiration,
      reservedAmount: -agg.reserve - agg.release + agg.consumeFromReservation + agg.expirationFromReservation,
    };
    for (const field of ['grantedAmount', 'consumedAmount', 'expiredAmount', 'reservedAmount']) {
      if (derived[field] !== batch[field]) {
        discrepancies.push({
          kind: 'LEDGER_BATCH_MISMATCH',
          ref: batch.id,
          detail: `${field}: ledger=${derived[field]} batch=${batch[field]}`,
        });
      }
    }
  }

  // --- (3) Kunci grant duplikat ---------------------------------------------
  const grantKeyCounts = new Map();
  for (const entry of ledgerEntries) {
    if (!entry || entry.kind !== 'GRANT' || !entry.idempotencyKey) continue;
    grantKeyCounts.set(entry.idempotencyKey, (grantKeyCounts.get(entry.idempotencyKey) || 0) + 1);
  }
  for (const [key, count] of grantKeyCounts) {
    if (count > 1) {
      discrepancies.push({
        kind: 'DUPLICATE_GRANT_KEY',
        ref: key,
        detail: `${count} entri GRANT memakai idempotencyKey yang sama`,
      });
    }
  }

  // --- (4) Order berbayar tanpa grant ----------------------------------------
  const grantKeys = new Set(grantKeyCounts.keys());
  for (const order of orders) {
    if (!order || !order.orderId) continue;
    const looksGranted = order.status === 'PAID' || order.grantedAt != null;
    if (!looksGranted) continue;
    if (!grantKeys.has(order.orderId)) {
      discrepancies.push({
        kind: 'PAID_ORDER_WITHOUT_GRANT',
        ref: order.orderId,
        detail: grantKeys.has(`${order.orderId}:bonus`)
          ? 'hanya ada GRANT pendamping ":bonus"; grant dasar berkunci orderId tidak ditemukan'
          : 'tidak ada entri GRANT berkunci orderId untuk order PAID/ter-grant ini',
      });
    }
  }

  // --- (5) Reservasi macet + (6) review tertunda ------------------------------
  for (const op of operations) {
    if (!op) continue;
    if (op.status === 'RESERVED' && isFiniteNumber(op.createdAt) && now - op.createdAt > stuckTtlMs) {
      const item = {
        kind: 'STUCK_RESERVATION',
        ref: op.id,
        detail: `operasi RESERVED berumur ${now - op.createdAt} ms > TTL ${stuckTtlMs} ms`,
      };
      stuckReservations.push(item);
      discrepancies.push({ ...item });
    }
    if (op.status === 'REQUIRES_REVIEW') {
      pendingReviews.push({
        kind: 'REQUIRES_REVIEW',
        ref: op.id,
        detail: 'operasi menunggu resolusi review manual (bukan discrepancy)',
      });
    }
  }

  return {
    checkedAt: now,
    healthy: discrepancies.length === 0 && stuckReservations.length === 0,
    discrepancies,
    stuckReservations,
    pendingReviews,
    counts: {
      batches: batches.length,
      entries: ledgerEntries.length,
      operations: operations.length,
      orders: orders.length,
    },
  };
}

/**
 * Pembungkus async: ambil snapshot ledger satu akun billing dari repository
 * billing (billingStore.js) lalu jalankan inti murni di atasnya.
 *
 * Pemetaan snapshot → data inti (yang benar-benar didukung kode nyata):
 * - loadLedgerSnapshot(repo, accountId, ctx) mengembalikan { store } dengan
 *   store berbentuk store domain creditLedger (Map batches, array ledger,
 *   Map operations — lihat buildStoreFromRows di billingStore.js).
 * - batches & ledgerEntries diambil dari store itu (nilainya sudah bentuk
 *   domain hasil batchRowToDomain/entryRowToDomain); operations diambil
 *   dari store.operations karena ledger domain TIDAK menyediakan
 *   listOperations — hanya getOperation per id. Inilah batas pemetaan:
 *   pembungkus ini bergantung pada bentuk store snapshot, bukan pada API
 *   publik ledger.
 * - orders TIDAK disimpan di snapshot ledger; pemanggil meneruskannya
 *   lewat opts.orders bila ingin pemeriksaan (4) ikut berjalan.
 *
 * billingStore diimpor secara dinamis agar inti murni di atas tetap bisa
 * diimpor/dites tanpa memuat klien Supabase.
 */
export async function reconcileAccount(repo, accountId, ctx, opts) {
  const options = opts || {};
  const { loadLedgerSnapshot } = await import('./billingStore.js');
  const snapshot = await loadLedgerSnapshot(repo, accountId, ctx);
  const store = snapshot.store;
  const inAccount = (row) => row && row.accountId === accountId;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const data = {
    batches: [...store.batches.values()].filter(inAccount).map(clone),
    ledgerEntries: store.ledger.filter(inAccount).map(clone),
    operations: [...store.operations.values()].filter(inAccount).map(clone),
    orders: options.orders || [],
  };
  return reconcileAccountData(data, options);
}

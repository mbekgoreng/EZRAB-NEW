/**
 * api/_lib/billingStore.js — Adapter persistensi billing (repository + ledger).
 * ============================================================================
 * Mengikuti pola yang SUDAH dipakai repo ini untuk undangan
 * (api/_lib/invitations/repository.js):
 * - Jalur produksi: Supabase service-role (SUPABASE_URL +
 *   SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY) — service key TIDAK
 *   PERNAH ke browser.
 * - Kembaran InMemory dengan interface yang sama untuk tes lokal.
 * - Factory mengembalikan null bila belum terkonfigurasi → pemanggil
 *   menjawab 503 secara jujur (fail-closed).
 *
 * Dua lapis di file ini:
 * 1) REPOSITORY (async, baris DB snake_case): akun billing, keanggotaan,
 *    order pembayaran, langganan, jurnal peristiwa webhook, dan baris-baris
 *    mentah ledger (batches/entries/operations/allocations/reviews).
 * 2) LEDGER ADAPTER: memetakan baris DB ↔ store domain creditLedger.js
 *    (loadLedgerSnapshot / flushLedgerSnapshot / withLedger). Domain ledger
 *    bekerja SINkron di atas store berbentuk memori; adapter menghidrasi
 *    store dari DB, menjalankan operasi domain, lalu men-flush perbedaannya.
 *
 * KEJUJURAN BATAS (dibaca sebelum mengklaim production-ready):
 * - Migration Phase 5.3 §5 menspesifikasikan RPC transaksional sebagai
 *   jalur production. Adapter ini memakai operasi tabel PostgREST dan
 *   menambal atomisitas dengan constraint UNIQUE yang memang sudah ada di
 *   migration (credit_batch_ledger (account_id, idempotency_key),
 *   UNIQUE parsial FREE_ONCE, billing_orders.order_id) + penanda
 *   granted_at/last_order_id sebagai pagar idempotensi order. RPC tetap
 *   merupakan langkah pengerasan sebelum uang nyata berskala besar.
 * - SPRINT 3 (Tugas 1, 2026-11-10): withLedger kini diserialisasi PER AKUN
 *   di dalam satu proses (rantai promise per accountId: load → domain →
 *   flush berjalan utuh sebelum pemanggil berikutnya untuk akun yang sama
 *   memuat snapshot), flush divalidasi SEBELUM menulis (invarian batch +
 *   konflik kunci idempotensi + tabrakan FREE_ONCE terhadap baris yang
 *   terpersisten di luar snapshot), dan kegagalan di tengah flush memicu
 *   KOMPENSASI best-effort (hapus sisipan + pulihkan baris yang diubah).
 *   Ini membuktikan atomisitas IN-PROCESS untuk adapter ini — BUKAN
 *   konkurensi terdistribusi: dua instance serverless terpisah TIDAK
 *   berbagi rantai ini, dan kompensasi PostgREST bukan transaksi DB.
 *   Kontrak otoritatif lintas-instance tetap RPC SQL transaksional
 *   (migration 20261110, F-6/F-10 diperbaiki Sprint 3, NOT RUNTIME
 *   VERIFIED sampai diuji di PostgreSQL disposable).
 * - Hasil idempotency NON-grant (reserve/settle) tidak direkonstruksi dari
 *   DB saat hidrasi — yang direkonstruksi hanya hasil GRANT (dari entri
 *   ledger GRANT + batch-nya) dan penanda EXPIRATION sweep, karena hanya
 *   grant yang dipakai jalur pembayaran. Operasi usage tetap dilayani
 *   domain di atas store terhidrasi; kunci idempotency operasi tersimpan
 *   di baris operasinya sendiri.
 * - Kolom owner_user_id pada tabel ledger 20261102 adalah NOT NULL;
 *   adapter mengisinya dari konteks aktor (pembuat order / principal) yang
 *   diteruskan pemanggil lewat ctx — bukan dari input klien bebas.
 */

import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceConfig } from './invitations/repository.js';
import { createCreditLedger } from './creditLedger.js';

export { getSupabaseServiceConfig };

// ---------------------------------------------------------------------------
// Pemetaan waktu & baris ↔ domain (ledger)
// ---------------------------------------------------------------------------

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const toMs = (t) => (t == null ? null : Date.parse(t));
const num = (v) => (v == null ? 0 : Number(v));

export function batchRowToDomain(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type,
    wallet: row.wallet,
    grantedAmount: num(row.granted_amount),
    remainingAmount: num(row.remaining_amount),
    reservedAmount: num(row.reserved_amount),
    consumedAmount: num(row.consumed_amount),
    expiredAmount: num(row.expired_amount),
    grantedAt: toMs(row.granted_at),
    expiresAt: toMs(row.expires_at),
    periodRef: row.period_start != null || row.period_end != null
      ? { periodStart: toMs(row.period_start), periodEnd: toMs(row.period_end) }
      : null,
    sourceRef: row.source_ref ?? null,
    status: row.status,
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

export function batchDomainToRow(batch, ctx) {
  return {
    account_id: batch.accountId,
    owner_user_id: ctx.ownerUserId,
    workspace_id: ctx.workspaceId ?? null,
    type: batch.type,
    wallet: batch.wallet,
    granted_amount: batch.grantedAmount,
    remaining_amount: batch.remainingAmount,
    reserved_amount: batch.reservedAmount,
    consumed_amount: batch.consumedAmount,
    expired_amount: batch.expiredAmount,
    granted_at: iso(batch.grantedAt),
    expires_at: iso(batch.expiresAt),
    period_start: batch.periodRef ? iso(batch.periodRef.periodStart) : null,
    period_end: batch.periodRef ? iso(batch.periodRef.periodEnd) : null,
    source_ref: batch.sourceRef ?? null,
    status: batch.status,
  };
}

export function entryRowToDomain(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    batchId: row.batch_id ?? null,
    operationId: row.operation_id ?? null,
    amount: num(row.amount),
    idempotencyKey: row.idempotency_key ?? null,
    actor: row.actor ?? null,
    reason: row.reason ?? null,
    createdAt: toMs(row.created_at),
  };
}

export function entryDomainToRow(entry, ctx) {
  return {
    account_id: entry.accountId,
    owner_user_id: ctx.ownerUserId,
    batch_id: entry.batchId ?? null,
    operation_id: entry.operationId ?? null,
    kind: entry.kind,
    amount: entry.amount,
    idempotency_key: entry.idempotencyKey ?? null,
    actor: entry.actor ?? null,
    reason: entry.reason ?? null,
    created_at: iso(entry.createdAt),
  };
}

export function operationRowToDomain(row, allocations) {
  return {
    id: row.id,
    accountId: row.account_id,
    feature: row.feature ?? null,
    status: row.status,
    estimatedCredits: num(row.estimated_credits),
    reservedCredits: num(row.reserved_credits),
    actualCredits: row.actual_credits == null ? null : num(row.actual_credits),
    settledCredits: row.settled_credits == null ? null : num(row.settled_credits),
    releasedCredits: row.released_credits == null ? null : num(row.released_credits),
    overageCredits: row.overage_credits == null ? null : num(row.overage_credits),
    estimateDelta: null,
    tariffVersion: row.tariff_version ?? null,
    usageEvidence: row.usage_evidence ?? null,
    allocations: (allocations || []).map((a) => ({ batchId: a.batch_id, amount: num(a.amount) })),
    actor: row.actor_user_id ?? null,
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

export function operationDomainToRow(op, ctx, idempotencyKey) {
  return {
    account_id: op.accountId,
    owner_user_id: ctx.ownerUserId,
    actor_user_id: null,
    feature: op.feature ?? null,
    status: op.status,
    estimated_credits: op.estimatedCredits,
    reserved_credits: op.reservedCredits,
    actual_credits: op.actualCredits,
    settled_credits: op.settledCredits,
    released_credits: op.releasedCredits,
    overage_credits: op.overageCredits,
    tariff_version: op.tariffVersion ?? null,
    usage_evidence: op.usageEvidence ?? null,
    idempotency_key: idempotencyKey,
  };
}

export function reviewRowToDomain(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    accountId: row.account_id,
    status: row.status,
    feature: row.feature ?? null,
    reservedCredits: num(row.reserved_credits),
    actualCredits: num(row.actual_credits),
    overageCredits: num(row.overage_credits),
    tariffVersion: row.tariff_version ?? null,
    usageEvidence: row.usage_evidence ?? null,
    requestedBy: row.requested_by ?? null,
    createdAt: toMs(row.created_at),
    reviewerId: row.reviewer_user_id ?? null,
    reviewerRole: row.reviewer_role ?? null,
    resolutionReason: row.resolution_reason ?? null,
    resolvedAt: toMs(row.resolved_at),
  };
}

export function reviewDomainToRow(review, ctx, idempotencyKey) {
  return {
    workspace_id: ctx.workspaceId,
    account_id: review.accountId,
    operation_id: review.operationId,
    status: review.status,
    feature: review.feature ?? null,
    reserved_credits: review.reservedCredits,
    actual_credits: review.actualCredits,
    overage_credits: review.overageCredits,
    tariff_version: review.tariffVersion ?? null,
    usage_evidence: review.usageEvidence ?? null,
    requested_by: review.requestedBy ?? null,
    reviewer_user_id: review.reviewerId ?? null,
    reviewer_role: review.reviewerRole ?? null,
    resolution_reason: review.resolutionReason ?? null,
    idempotency_key: idempotencyKey,
    resolved_at: iso(review.resolvedAt),
  };
}

// ---------------------------------------------------------------------------
// Hidrasi store domain dari baris DB + rekonstruksi hasil idempotency GRANT
// ---------------------------------------------------------------------------

function buildStoreFromRows(rows) {
  const store = {
    batches: new Map(),
    ledger: [],
    operations: new Map(),
    reviews: [],
    idempotency: new Map(),
    seq: 0,
  };
  for (const r of rows.batchRows) {
    const b = batchRowToDomain(r);
    store.batches.set(b.id, b);
  }
  const allocByOp = new Map();
  for (const a of rows.allocationRows) {
    if (!allocByOp.has(a.operation_id)) allocByOp.set(a.operation_id, []);
    allocByOp.get(a.operation_id).push(a);
  }
  for (const r of rows.operationRows) {
    const op = operationRowToDomain(r, allocByOp.get(r.id) || []);
    store.operations.set(op.id, op);
  }
  for (const r of rows.entryRows) {
    store.ledger.push(Object.freeze(entryRowToDomain(r)));
  }
  for (const r of rows.reviewRows) {
    store.reviews.push(reviewRowToDomain(r));
  }
  // Rekonstruksi hasil idempotency yang dapat dibuktikan dari jurnal:
  // entri GRANT membawa kunci + batch hasil grant; entri EXPIRATION sweep
  // membawa kunci `expire:<batchId>`.
  for (const e of store.ledger) {
    if (!e.idempotencyKey) continue;
    if (e.kind === 'GRANT' && e.batchId && store.batches.has(e.batchId)) {
      const batch = store.batches.get(e.batchId);
      store.idempotency.set(`${e.accountId}::${e.idempotencyKey}`, {
        ok: true,
        batch: JSON.parse(JSON.stringify(batch)),
      });
    } else if (e.kind === 'EXPIRATION' && e.idempotencyKey.startsWith('expire:')) {
      store.idempotency.set(`${e.accountId}::${e.idempotencyKey}`, { ok: true, batchId: e.batchId });
    }
  }
  return store;
}

/**
 * Muat snapshot ledger satu akun billing dari repository.
 * ctx: { ownerUserId, workspaceId } — konteks aktor untuk baris baru.
 */
export async function loadLedgerSnapshot(repo, accountId, ctx) {
  const rows = await repo.loadLedgerRows(accountId);
  const store = buildStoreFromRows(rows);
  const originals = new Map();
  for (const b of store.batches.values()) originals.set(`batch:${b.id}`, JSON.stringify(b));
  for (const o of store.operations.values()) originals.set(`op:${o.id}`, JSON.stringify(o));
  for (const r of store.reviews) originals.set(`review:${r.id}`, JSON.stringify(r));
  return {
    store,
    ctx: { ownerUserId: ctx?.ownerUserId ?? null, workspaceId: ctx?.workspaceId ?? null },
    persistedBatchIds: new Set(store.batches.keys()),
    persistedEntryIds: new Set(store.ledger.map((e) => e.id)),
    persistedOperationIds: new Set(store.operations.keys()),
    persistedReviewIds: new Set(store.reviews.map((r) => r.id)),
    originals,
  };
}

function findIdempotencyKeyFor(store, predicate) {
  for (const [fullKey, result] of store.idempotency.entries()) {
    if (result && predicate(result)) {
      const idx = fullKey.indexOf('::');
      return idx >= 0 ? fullKey.slice(idx + 2) : fullKey;
    }
  }
  return null;
}

function ledgerError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Sprint 3 — validasi pra-flush + deteksi konflik terhadap keadaan
 * terpersisten TERKINI (bukan hanya snapshot). Berjalan SEBELUM satu pun
 * penulisan, sehingga konflik yang dapat diprediksi tidak pernah
 * meninggalkan keadaan parsial:
 * - setiap batch memenuhi invarian granted = remaining+reserved+consumed
 *   +expired dengan seluruh kolom integer aman non-negatif;
 * - tidak ada dua entri BARU yang memakai kunci idempotensi yang sama;
 * - tidak ada entri BARU yang kuncinya sudah terpersisten di luar snapshot
 *   (penulis lain / snapshot basi) → UNIQUE_VIOLATION sebelum menulis;
 * - tidak ada batch FREE_ONCE BARU bila akun sudah punya batch FREE_ONCE
 *   terpersisten di luar snapshot → UNIQUE_VIOLATION sebelum menulis.
 */
async function preflightFlush(repo, snapshot) {
  const { store } = snapshot;
  for (const batch of store.batches.values()) {
    const parts = [batch.grantedAmount, batch.remainingAmount, batch.reservedAmount, batch.consumedAmount, batch.expiredAmount];
    if (!parts.every((v) => Number.isSafeInteger(v) && v >= 0)
      || batch.grantedAmount !== batch.remainingAmount + batch.reservedAmount + batch.consumedAmount + batch.expiredAmount) {
      throw ledgerError('LEDGER_INVARIANT_VIOLATION', `batch invariant violated: ${batch.id}`);
    }
  }
  const newEntries = store.ledger.filter((e) => !snapshot.persistedEntryIds.has(e.id));
  const seenKeys = new Set();
  for (const e of newEntries) {
    if (e.idempotencyKey == null) continue;
    const k = `${e.accountId}::${e.idempotencyKey}`;
    if (seenKeys.has(k)) throw ledgerError('UNIQUE_VIOLATION', `duplicate ledger key within flush: ${e.idempotencyKey}`);
    seenKeys.add(k);
  }
  if (typeof repo.loadLedgerRows !== 'function') return;
  const accountIds = new Set([
    ...[...store.batches.values()].map((b) => b.accountId),
    ...[...store.operations.values()].map((o) => o.accountId),
    ...[...store.reviews].map((r) => r.accountId),
    ...newEntries.map((e) => e.accountId),
  ]);
  // CAS berbasis konten (optimistic concurrency tanpa kolom versi):
  // entitas PERSISTED yang akan DIUBAH flush ini harus masih persis sama
  // dengan keadaan saat snapshot dimuat. Bila penulis lain mengubahnya
  // lebih dulu, snapshot ini basi → batalkan SEBELUM menulis
  // (LEDGER_CONFLICT), jangan timpa hasil penulis lain secara buta.
  const sortAllocs = (op) => {
    const c = JSON.parse(JSON.stringify(op));
    if (Array.isArray(c.allocations)) c.allocations.sort((x, y) => String(x.batchId).localeCompare(String(y.batchId)));
    return JSON.stringify(c);
  };
  const changedBatches = [...store.batches.values()].filter(
    (b) => snapshot.persistedBatchIds.has(b.id)
      && snapshot.originals.get(`batch:${b.id}`) !== JSON.stringify(b)
  );
  const changedOps = [...store.operations.values()].filter(
    (o) => snapshot.persistedOperationIds.has(o.id)
      && snapshot.originals.get(`op:${o.id}`) !== JSON.stringify(o)
  );
  const changedReviews = store.reviews.filter(
    (r) => snapshot.persistedReviewIds.has(r.id)
      && snapshot.originals.get(`review:${r.id}`) !== JSON.stringify(r)
  );
  for (const accountId of accountIds) {
    const rows = await repo.loadLedgerRows(accountId);
    if (changedBatches.length || changedOps.length || changedReviews.length) {
      const curBatches = new Map((rows.batchRows || []).map((r) => {
        const d = batchRowToDomain(r);
        return [d.id, JSON.stringify(d)];
      }));
      const allocByOp = new Map();
      for (const a of rows.allocationRows || []) {
        if (!allocByOp.has(a.operation_id)) allocByOp.set(a.operation_id, []);
        allocByOp.get(a.operation_id).push(a);
      }
      const curOps = new Map((rows.operationRows || []).map((r) => {
        const d = operationRowToDomain(r, allocByOp.get(r.id) || []);
        return [d.id, sortAllocs(d)];
      }));
      const curReviews = new Map((rows.reviewRows || []).map((r) => {
        const d = reviewRowToDomain(r);
        return [d.id, JSON.stringify(d)];
      }));
      for (const b of changedBatches) {
        if (b.accountId !== accountId) continue;
        if (curBatches.get(b.id) !== snapshot.originals.get(`batch:${b.id}`)) {
          throw ledgerError('LEDGER_CONFLICT', `stale snapshot: batch changed since load: ${b.id}`);
        }
      }
      for (const o of changedOps) {
        if (o.accountId !== accountId) continue;
        const original = snapshot.originals.get(`op:${o.id}`);
        if (curOps.get(o.id) !== sortAllocs(JSON.parse(original))) {
          throw ledgerError('LEDGER_CONFLICT', `stale snapshot: operation changed since load: ${o.id}`);
        }
      }
      for (const r of changedReviews) {
        if (r.accountId !== accountId) continue;
        if (curReviews.get(r.id) !== snapshot.originals.get(`review:${r.id}`)) {
          throw ledgerError('LEDGER_CONFLICT', `stale snapshot: review changed since load: ${r.id}`);
        }
      }
    }
    const persistedEntryKeys = new Set(
      (rows.entryRows || [])
        .filter((r) => r.idempotency_key != null && !snapshot.persistedEntryIds.has(r.id))
        .map((r) => `${r.account_id}::${r.idempotency_key}`)
    );
    for (const e of newEntries) {
      if (e.accountId !== accountId || e.idempotencyKey == null) continue;
      if (persistedEntryKeys.has(`${e.accountId}::${e.idempotencyKey}`)) {
        throw ledgerError('UNIQUE_VIOLATION', `ledger key already persisted outside snapshot: ${e.idempotencyKey}`);
      }
    }
    const persistedFreeOnce = (rows.batchRows || []).some(
      (r) => r.type === 'FREE_ONCE' && !snapshot.persistedBatchIds.has(r.id)
    );
    if (persistedFreeOnce) {
      const newFreeOnce = [...store.batches.values()].some(
        (b) => b.accountId === accountId && b.type === 'FREE_ONCE' && !snapshot.persistedBatchIds.has(b.id)
      );
      if (newFreeOnce) {
        throw ledgerError('UNIQUE_VIOLATION', 'FREE_ONCE already persisted outside snapshot');
      }
    }
  }
}

/**
 * Flush perbedaan store ke repository. Mengembalikan idMap untuk id batch
 * yang baru dibuat (id domain sementara → id DB), agar pemanggil dapat
 * memperbaiki referensi pada hasil operasi.
 *
 * Sprint 3: flush berjalan dalam dua fase — (1) preflight (tanpa menulis),
 * (2) penulisan terkompensasi: setiap sisipan/pembaruan dicatat; bila satu
 * langkah gagal, sisipan dihapus dan pembaruan dipulihkan best-effort
 * (bila repository menyediakan metode hapus), lalu error asli dilempar
 * ulang. Kompensasi BUKAN transaksi DB — lihat header file.
 */
export async function flushLedgerSnapshot(repo, snapshot) {
  await preflightFlush(repo, snapshot);
  const { store, ctx } = snapshot;
  const idMap = new Map();
  const remap = (id) => (id != null && idMap.has(id) ? idMap.get(id) : id);
  const insertedBatchIds = [];
  const updatedBatchRows = []; // { id, row } keadaan sebelum (bentuk row)
  const insertedOperationIds = [];
  const updatedOperationRows = [];
  const insertedAllocationIds = [];
  const insertedEntryIds = [];
  const insertedReviewIds = [];
  const updatedReviewRows = [];
  try {

  // 1) Batch: sisipkan yang baru, perbarui yang berubah.
  for (const batch of store.batches.values()) {
    const row = batchDomainToRow(batch, ctx);
    if (!snapshot.persistedBatchIds.has(batch.id)) {
      const inserted = await repo.insertBatchRow(row);
      idMap.set(batch.id, inserted.id);
      snapshot.persistedBatchIds.add(inserted.id);
      insertedBatchIds.push(inserted.id);
    } else if (snapshot.originals.get(`batch:${batch.id}`) !== JSON.stringify(batch)) {
      updatedBatchRows.push({ id: batch.id, row: batchDomainToRow(JSON.parse(snapshot.originals.get(`batch:${batch.id}`)), ctx) });
      await repo.updateBatchRow(batch.id, row);
    }
  }
  // Terapkan idMap ke store agar referensi internal konsisten.
  if (idMap.size > 0) {
    for (const [oldId, newId] of idMap.entries()) {
      const b = store.batches.get(oldId);
      if (b) {
        store.batches.delete(oldId);
        b.id = newId;
        store.batches.set(newId, b);
      }
    }
    for (const op of store.operations.values()) {
      op.allocations = (op.allocations || []).map((a) => ({ ...a, batchId: remap(a.batchId) }));
    }
  }

  // 2) Operasi: sisipkan yang baru (+ alokasinya), perbarui yang berubah.
  //    Iterasi di atas salinan: penyisipan mengganti id operasi di Map.
  for (const op of [...store.operations.values()]) {
    const isNew = !snapshot.persistedOperationIds.has(op.id);
    const changed = snapshot.originals.get(`op:${op.id}`) !== JSON.stringify(op);
    if (!isNew && !changed) continue;
    const key = findIdempotencyKeyFor(store, (r) => r.operation && r.operation.id === op.id) || `op:${op.id}`;
    const row = operationDomainToRow(op, ctx, key);
    if (isNew) {
      const inserted = await repo.insertOperationRow(row);
      const oldId = op.id;
      op.id = inserted.id;
      idMap.set(oldId, inserted.id);
      insertedOperationIds.push(inserted.id);
      store.operations.delete(oldId);
      store.operations.set(op.id, op);
      for (const alloc of op.allocations || []) {
        const allocInserted = await repo.insertAllocationRow({
          operation_id: op.id,
          batch_id: remap(alloc.batchId),
          account_id: op.accountId,
          amount: alloc.amount,
        });
        if (allocInserted && allocInserted.id) insertedAllocationIds.push(allocInserted.id);
      }
      snapshot.persistedOperationIds.add(op.id);
    } else {
      updatedOperationRows.push({ id: op.id, row: operationDomainToRow(JSON.parse(snapshot.originals.get(`op:${op.id}`)), ctx, key) });
      await repo.updateOperationRow(op.id, row);
    }
  }

  // 3) Entri ledger: hanya sisipkan yang baru (append-only).
  for (const entry of store.ledger) {
    if (snapshot.persistedEntryIds.has(entry.id)) continue;
    const row = entryDomainToRow(
      { ...entry, batchId: remap(entry.batchId), operationId: remap(entry.operationId) },
      ctx
    );
    const inserted = await repo.insertEntryRow(row);
    snapshot.persistedEntryIds.add(inserted.id);
    insertedEntryIds.push(inserted.id);
  }

  // 4) Review: sisipkan yang baru, perbarui yang berubah.
  for (const review of store.reviews) {
    const isNew = !snapshot.persistedReviewIds.has(review.id);
    const changed = snapshot.originals.get(`review:${review.id}`) !== JSON.stringify(review);
    if (!isNew && !changed) continue;
    const key = findIdempotencyKeyFor(store, (r) => r.review && r.review.id === review.id) ||
      findIdempotencyKeyFor(store, (r) => r.reviewId === review.id) ||
      `review:${review.operationId}`;
    const row = reviewDomainToRow(
      { ...review, operationId: remap(review.operationId) },
      ctx,
      key
    );
    if (isNew) {
      const inserted = await repo.insertReviewRow(row);
      review.id = inserted.id;
      snapshot.persistedReviewIds.add(review.id);
      insertedReviewIds.push(inserted.id);
    } else {
      updatedReviewRows.push({ id: review.id, row: reviewDomainToRow(JSON.parse(snapshot.originals.get(`review:${review.id}`)), ctx, key) });
      await repo.updateReviewRow(review.id, row);
    }
  }

  return idMap;
  } catch (err) {
    // Kompensasi best-effort (urutan terbalik dari penulisan). Kegagalan
    // kompensasi ditelan agar error ASLI yang sampai ke pemanggil; keadaan
    // sesudah kegagalan ganda adalah wilayah rekonsiliasi / RPC DB.
    const attempt = async (fn) => { try { await fn(); } catch { /* best-effort */ } };
    for (const id of [...insertedReviewIds].reverse()) {
      if (typeof repo.deleteReviewRow === 'function') await attempt(() => repo.deleteReviewRow(id));
      snapshot.persistedReviewIds.delete(id);
    }
    for (const u of [...updatedReviewRows].reverse()) await attempt(() => repo.updateReviewRow(u.id, u.row));
    for (const id of [...insertedEntryIds].reverse()) {
      if (typeof repo.deleteEntryRow === 'function') await attempt(() => repo.deleteEntryRow(id));
      snapshot.persistedEntryIds.delete(id);
    }
    for (const id of [...insertedAllocationIds].reverse()) {
      if (typeof repo.deleteAllocationRow === 'function') await attempt(() => repo.deleteAllocationRow(id));
    }
    for (const id of [...insertedOperationIds].reverse()) {
      if (typeof repo.deleteOperationRow === 'function') await attempt(() => repo.deleteOperationRow(id));
      snapshot.persistedOperationIds.delete(id);
    }
    for (const u of [...updatedOperationRows].reverse()) await attempt(() => repo.updateOperationRow(u.id, u.row));
    for (const u of [...updatedBatchRows].reverse()) await attempt(() => repo.updateBatchRow(u.id, u.row));
    for (const id of [...insertedBatchIds].reverse()) {
      if (typeof repo.deleteBatchRow === 'function') await attempt(() => repo.deleteBatchRow(id));
      snapshot.persistedBatchIds.delete(id);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Sprint 3 — serialisasi per-akun IN-PROCESS untuk withLedger.
// Rantai promise per accountId: pendaftar berikutnya menunggu pemegang
// sebelumnya selesai (load + domain + flush) sebelum memuat snapshotnya
// sendiri, sehingga snapshot tidak pernah basi di dalam satu proses.
// Akuisisi berjalan sinkron pada saat withLedger dipanggil (sebelum await
// pertama), jadi urutan antrean = urutan pemanggilan — deterministik.
// BATAS JUJUR: kunci ini TIDAK re-entrant (fn domain sinkron dan tidak
// boleh memanggil withLedger akun yang sama) dan TIDAK lintas proses /
// lintas instance serverless — lihat header file.
// ---------------------------------------------------------------------------
const ledgerAccountChains = new Map();

function acquireLedgerAccount(accountId) {
  const key = String(accountId);
  const previous = ledgerAccountChains.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  ledgerAccountChains.set(key, chain);
  return {
    ready: previous,
    release() {
      release();
      if (ledgerAccountChains.get(key) === chain) ledgerAccountChains.delete(key);
    },
  };
}

/**
 * Jalankan fungsi domain ledger di atas store terhidrasi lalu flush.
 * Mengembalikan hasil fungsi domain (dengan id batch hasil grant sudah
 * diperbaiki mengikuti idMap).
 * Sprint 3: seluruh siklus dibungkus serialisasi per-akun (di atas).
 */
export async function withLedger(repo, accountId, ctx, fn) {
  const lock = acquireLedgerAccount(accountId);
  await lock.ready;
  try {
    const snapshot = await loadLedgerSnapshot(repo, accountId, ctx);
    const ledger = createCreditLedger(snapshot.store);
    const result = fn(ledger);
    const idMap = await flushLedgerSnapshot(repo, snapshot);
    if (result && typeof result === 'object' && idMap.size > 0) {
      if (result.batch && idMap.has(result.batch.id)) result.batch.id = idMap.get(result.batch.id);
      if (result.batchId && idMap.has(result.batchId)) result.batchId = idMap.get(result.batchId);
    }
    return result;
  } finally {
    lock.release();
  }
}

// ---------------------------------------------------------------------------
// Repository — implementasi Supabase (jalur produksi)
// ---------------------------------------------------------------------------

export class SupabaseBillingRepository {
  constructor(env = process.env) {
    const cfg = getSupabaseServiceConfig(env);
    if (!cfg) throw new Error('supabase_service_not_configured');
    this.client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getBillingAccountByWorkspace(workspaceId) {
    const { data, error } = await this.client
      .from('billing_accounts').select('*').eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw new Error('billing_account_lookup_failed');
    return data || null;
  }

  async createBillingAccount({ workspaceId, createdBy }) {
    const { data, error } = await this.client
      .from('billing_accounts')
      .insert({ workspace_id: workspaceId, created_by: createdBy || null })
      .select('*').single();
    if (error) throw new Error('billing_account_create_failed');
    return data;
  }

  async getMembership(workspaceId, userId) {
    const { data, error } = await this.client
      .from('workspace_members')
      .select('workspace_id, user_id, role, status, billing_admin')
      .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
    if (error) throw new Error('membership_lookup_failed');
    return data || null;
  }

  async listMembershipsForUser(userId) {
    const { data, error } = await this.client
      .from('workspace_members')
      .select('workspace_id, user_id, role, status, billing_admin')
      .eq('user_id', userId);
    if (error) throw new Error('membership_list_failed');
    return data || [];
  }

  async insertOrder(row) {
    const { data, error } = await this.client
      .from('billing_orders').insert(row).select('*').single();
    if (error) {
      if (String(error.code) === '23505') {
        const dup = new Error('duplicate_order_id');
        dup.code = 'DUPLICATE_ORDER';
        throw dup;
      }
      throw new Error('order_insert_failed');
    }
    return data;
  }

  async getOrderByOrderId(orderId) {
    const { data, error } = await this.client
      .from('billing_orders').select('*').eq('order_id', orderId).maybeSingle();
    if (error) throw new Error('order_lookup_failed');
    return data || null;
  }

  async updateOrderByOrderId(orderId, patch) {
    const { data, error } = await this.client
      .from('billing_orders')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('order_id', orderId).select('*').single();
    if (error) throw new Error('order_update_failed');
    return data;
  }

  async listOrdersByAccount(accountId, limit = 50) {
    const { data, error } = await this.client
      .from('billing_orders').select('*').eq('account_id', accountId)
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error('order_list_failed');
    return data || [];
  }

  async getSubscriptionByAccount(accountId) {
    const { data, error } = await this.client
      .from('billing_subscriptions').select('*').eq('account_id', accountId).maybeSingle();
    if (error) throw new Error('subscription_lookup_failed');
    return data || null;
  }

  async insertSubscription(row) {
    const { data, error } = await this.client
      .from('billing_subscriptions').insert(row).select('*').single();
    if (error) throw new Error('subscription_insert_failed');
    return data;
  }

  async updateSubscription(id, patch) {
    const { data, error } = await this.client
      .from('billing_subscriptions')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single();
    if (error) throw new Error('subscription_update_failed');
    return data;
  }

  async appendPaymentEvent(row) {
    const { data, error } = await this.client
      .from('billing_payment_events').insert(row).select('*').single();
    if (error) throw new Error('payment_event_insert_failed');
    return data;
  }

  async listPaymentEventsByOrder(orderId) {
    const { data, error } = await this.client
      .from('billing_payment_events').select('*').eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) throw new Error('payment_event_list_failed');
    return data || [];
  }

  async loadLedgerRows(accountId) {
    const [batches, entries, operations, allocations, reviews] = await Promise.all([
      this.client.from('credit_batches').select('*').eq('account_id', accountId),
      this.client.from('credit_batch_ledger').select('*').eq('account_id', accountId)
        .order('created_at', { ascending: true }),
      this.client.from('credit_usage_operations').select('*').eq('account_id', accountId),
      this.client.from('credit_reservation_allocations').select('*').eq('account_id', accountId),
      this.client.from('credit_settlement_reviews').select('*').eq('account_id', accountId),
    ]);
    for (const r of [batches, entries, operations, allocations, reviews]) {
      if (r.error) throw new Error('ledger_load_failed');
    }
    return {
      batchRows: batches.data || [],
      entryRows: entries.data || [],
      operationRows: operations.data || [],
      allocationRows: allocations.data || [],
      reviewRows: reviews.data || [],
    };
  }

  async insertBatchRow(row) {
    const { data, error } = await this.client
      .from('credit_batches').insert(row).select('*').single();
    if (error) throw new Error('batch_insert_failed');
    return data;
  }

  async updateBatchRow(id, row) {
    const { data, error } = await this.client
      .from('credit_batches')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single();
    if (error) throw new Error('batch_update_failed');
    return data;
  }

  async insertEntryRow(row) {
    const { data, error } = await this.client
      .from('credit_batch_ledger').insert(row).select('*').single();
    if (error) {
      if (String(error.code) === '23505') {
        const dup = new Error('duplicate_ledger_entry');
        dup.code = 'UNIQUE_VIOLATION';
        throw dup;
      }
      throw new Error('entry_insert_failed');
    }
    return data;
  }

  async insertOperationRow(row) {
    const { data, error } = await this.client
      .from('credit_usage_operations').insert(row).select('*').single();
    if (error) throw new Error('operation_insert_failed');
    return data;
  }

  async updateOperationRow(id, row) {
    const { data, error } = await this.client
      .from('credit_usage_operations')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').single();
    if (error) throw new Error('operation_update_failed');
    return data;
  }

  async insertAllocationRow(row) {
    const { data, error } = await this.client
      .from('credit_reservation_allocations').insert(row).select('*').single();
    if (error) throw new Error('allocation_insert_failed');
    return data;
  }

  async insertReviewRow(row) {
    const { data, error } = await this.client
      .from('credit_settlement_reviews').insert(row).select('*').single();
    if (error) throw new Error('review_insert_failed');
    return data;
  }

  async updateReviewRow(id, row) {
    const { data, error } = await this.client
      .from('credit_settlement_reviews').update(row).eq('id', id).select('*').single();
    if (error) throw new Error('review_update_failed');
    return data;
  }

  // Sprint 3: metode hapus HANYA untuk kompensasi flush yang gagal
  // (menghapus baris yang baru saja disisipkan flush yang sama) — bukan
  // API penghapusan ledger umum; jurnal tetap append-only secara desain.
  async deleteBatchRow(id) {
    const { error } = await this.client.from('credit_batches').delete().eq('id', id);
    if (error) throw new Error('batch_delete_failed');
  }

  async deleteEntryRow(id) {
    const { error } = await this.client.from('credit_batch_ledger').delete().eq('id', id);
    if (error) throw new Error('entry_delete_failed');
  }

  async deleteOperationRow(id) {
    const { error } = await this.client.from('credit_usage_operations').delete().eq('id', id);
    if (error) throw new Error('operation_delete_failed');
  }

  async deleteAllocationRow(id) {
    const { error } = await this.client.from('credit_reservation_allocations').delete().eq('id', id);
    if (error) throw new Error('allocation_delete_failed');
  }

  async deleteReviewRow(id) {
    const { error } = await this.client.from('credit_settlement_reviews').delete().eq('id', id);
    if (error) throw new Error('review_delete_failed');
  }
}

// ---------------------------------------------------------------------------
// Repository — implementasi InMemory (tes lokal; BUKAN persistensi produksi)
// Baris disimpan dalam bentuk DB (snake_case) agar lapisan pemetaan di atas
// teruji persis seperti jalur Supabase.
// ---------------------------------------------------------------------------

let memSeq = 0;
function memId(prefix) {
  memSeq += 1;
  return `${prefix}-mem-${memSeq}`;
}
const nowIso = () => new Date().toISOString();

export class InMemoryBillingRepository {
  constructor() {
    this.accounts = new Map(); // id -> row
    this.memberships = new Map(); // `${workspaceId}:${userId}` -> row
    this.orders = new Map(); // order_id -> row
    this.subscriptions = new Map(); // account_id -> row
    this.events = [];
    this.batchRows = new Map();
    this.entryRows = [];
    this.operationRows = new Map();
    this.allocationRows = [];
    this.reviewRows = new Map();
  }

  // --- fixture helpers (tes) ---
  seedAccount(workspaceId, createdBy = null) {
    const row = { id: memId('acct'), workspace_id: workspaceId, created_by: createdBy, created_at: nowIso(), updated_at: nowIso() };
    this.accounts.set(row.id, row);
    return row;
  }
  seedMembership(workspaceId, userId, role, extra = {}) {
    const row = { workspace_id: workspaceId, user_id: userId, role, status: 'ACTIVE', billing_admin: false, ...extra };
    this.memberships.set(`${workspaceId}:${userId}`, row);
    return row;
  }

  async getBillingAccountByWorkspace(workspaceId) {
    for (const a of this.accounts.values()) if (a.workspace_id === workspaceId) return a;
    return null;
  }

  async createBillingAccount({ workspaceId, createdBy }) {
    return this.seedAccount(workspaceId, createdBy);
  }

  async getMembership(workspaceId, userId) {
    return this.memberships.get(`${workspaceId}:${userId}`) || null;
  }

  async listMembershipsForUser(userId) {
    return [...this.memberships.values()].filter((m) => m.user_id === userId);
  }

  async insertOrder(row) {
    if (this.orders.has(row.order_id)) {
      const dup = new Error('duplicate_order_id');
      dup.code = 'DUPLICATE_ORDER';
      throw dup;
    }
    const full = { id: memId('ord'), created_at: nowIso(), updated_at: nowIso(), granted_at: null, paid_at: null, ...row };
    this.orders.set(full.order_id, full);
    return full;
  }

  async getOrderByOrderId(orderId) {
    return this.orders.get(orderId) || null;
  }

  async updateOrderByOrderId(orderId, patch) {
    const cur = this.orders.get(orderId);
    if (!cur) throw new Error('order_not_found');
    const next = { ...cur, ...patch, updated_at: nowIso() };
    this.orders.set(orderId, next);
    return next;
  }

  async listOrdersByAccount(accountId, limit = 50) {
    return [...this.orders.values()]
      .filter((o) => o.account_id === accountId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit);
  }

  async getSubscriptionByAccount(accountId) {
    return this.subscriptions.get(accountId) || null;
  }

  async insertSubscription(row) {
    const full = { id: memId('sub'), created_at: nowIso(), updated_at: nowIso(), ...row };
    this.subscriptions.set(full.account_id, full);
    return full;
  }

  async updateSubscription(id, patch) {
    for (const [accountId, sub] of this.subscriptions.entries()) {
      if (sub.id === id) {
        const next = { ...sub, ...patch, updated_at: nowIso() };
        this.subscriptions.set(accountId, next);
        return next;
      }
    }
    throw new Error('subscription_not_found');
  }

  async appendPaymentEvent(row) {
    const full = { id: memId('evt'), created_at: nowIso(), ...row };
    this.events.push(full);
    return full;
  }

  async listPaymentEventsByOrder(orderId) {
    return this.events.filter((e) => e.order_id === orderId);
  }

  async loadLedgerRows(accountId) {
    return {
      batchRows: [...this.batchRows.values()].filter((r) => r.account_id === accountId),
      entryRows: this.entryRows.filter((r) => r.account_id === accountId),
      operationRows: [...this.operationRows.values()].filter((r) => r.account_id === accountId),
      allocationRows: this.allocationRows.filter((r) => r.account_id === accountId),
      reviewRows: [...this.reviewRows.values()].filter((r) => r.account_id === accountId),
    };
  }

  async insertBatchRow(row) {
    const full = { id: memId('batch'), created_at: nowIso(), updated_at: nowIso(), ...row };
    this.batchRows.set(full.id, full);
    return full;
  }

  async updateBatchRow(id, row) {
    const cur = this.batchRows.get(id);
    if (!cur) throw new Error('batch_not_found');
    const next = { ...cur, ...row, id, updated_at: nowIso() };
    this.batchRows.set(id, next);
    return next;
  }

  async insertEntryRow(row) {
    if (row.idempotency_key != null) {
      const clash = this.entryRows.find(
        (e) => e.account_id === row.account_id && e.idempotency_key === row.idempotency_key
      );
      if (clash) {
        const dup = new Error('duplicate_ledger_entry');
        dup.code = 'UNIQUE_VIOLATION';
        throw dup;
      }
    }
    const full = { id: memId('entry'), created_at: row.created_at || nowIso(), ...row };
    this.entryRows.push(full);
    return full;
  }

  async insertOperationRow(row) {
    const full = { id: memId('op'), created_at: nowIso(), updated_at: nowIso(), ...row };
    this.operationRows.set(full.id, full);
    return full;
  }

  async updateOperationRow(id, row) {
    const cur = this.operationRows.get(id);
    if (!cur) throw new Error('operation_not_found');
    const next = { ...cur, ...row, id, updated_at: nowIso() };
    this.operationRows.set(id, next);
    return next;
  }

  async insertAllocationRow(row) {
    const full = { id: memId('alloc'), created_at: nowIso(), ...row };
    this.allocationRows.push(full);
    return full;
  }

  async insertReviewRow(row) {
    const full = { id: memId('review'), created_at: nowIso(), ...row };
    this.reviewRows.set(full.id, full);
    return full;
  }

  async updateReviewRow(id, row) {
    const cur = this.reviewRows.get(id);
    if (!cur) throw new Error('review_not_found');
    const next = { ...cur, ...row, id };
    this.reviewRows.set(id, next);
    return next;
  }

  // Sprint 3: pasangan hapus untuk kompensasi flush (lihat Supabase repo).
  async deleteBatchRow(id) {
    this.batchRows.delete(id);
  }

  async deleteEntryRow(id) {
    this.entryRows = this.entryRows.filter((e) => e.id !== id);
  }

  async deleteOperationRow(id) {
    this.operationRows.delete(id);
  }

  async deleteAllocationRow(id) {
    this.allocationRows = this.allocationRows.filter((a) => a.id !== id);
  }

  async deleteReviewRow(id) {
    this.reviewRows.delete(id);
  }
}

/** Factory jalur produksi: null bila backend Supabase server-side belum dikonfigurasi. */
export function getBillingRepository(env = process.env) {
  if (!getSupabaseServiceConfig(env)) return null;
  return new SupabaseBillingRepository(env);
}

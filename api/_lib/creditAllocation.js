/**
 * api/_lib/creditAllocation.js — Kebijakan alokasi batch kredit (Phase 5)
 * ============================================================================
 * Menentukan urutan deterministik batch yang dipakai saat reservasi.
 *
 * STATUS KEBIJAKAN — BACA SEBELUM MENGUBAH:
 * - SELURUH urutan di file ini adalah keputusan owner FINAL (Phase 5.1
 *   Policy Lock, 2026-11-02; lihat ALLOCATION_POLICY_STATUS):
 *   1. SUBSCRIPTION — kedaluwarsa paling awal lebih dulu.
 *   2. BONUS + FREE_ONCE — finite-expiry lebih dulu (paling awal lebih
 *      dulu), seri → FIFO grantedAt → id batch; batch tanpa kedaluwarsa
 *      (termasuk FREE_ONCE yang menurut kebijakan final TIDAK PERNAH
 *      kedaluwarsa) terakhir di grup ini. Urutan finite untuk FREE_ONCE
 *      hanya relevan bagi batch historis pra-Phase 5.3 yang belum
 *      direkonsiliasi.
 *   3. TOP_UP — terakhir, FIFO grantedAt.
 * - Mengubah urutan ini berarti mengubah kebijakan owner: jangan lakukan
 *   tanpa keputusan owner baru yang eksplisit.
 * - Identitas sumber batch TIDAK PERNAH dilebur: fungsi ini hanya mengurutkan;
 *   ia tidak menggabungkan, mengonversi, atau mengklasifikasi ulang batch.
 *   Bonus dan free-once tetap batch terpisah dengan tipe mereka sendiri,
 *   dan TIDAK PERNAH diperlakukan sebagai top-up berbayar.
 *
 * Aritmetika: hanya perbandingan integer (epoch ms + jumlah kredit integer).
 * Tidak ada floating point di file ini.
 */

/**
 * 'CONFIRMED_OWNER_PHASE_5_1' — seluruh urutan alokasi (subscription →
 * bonus/free-once → top-up, beserta aturan seri di dalam grup) dikonfirmasi
 * owner pada Phase 5.1 Policy Lock (2026-11-02) dan ditegaskan Phase 5.3.
 * Nilai lama 'DEFAULT_UNCONFIRMED' sudah tidak berlaku.
 */
export const ALLOCATION_POLICY_STATUS = 'CONFIRMED_OWNER_PHASE_5_1';

/** Grup urutan: 0 = SUBSCRIPTION, 1 = BONUS/FREE_ONCE, 2 = TOP_UP. */
const TYPE_GROUP = {
  SUBSCRIPTION: 0,
  BONUS: 1,
  FREE_ONCE: 1,
  TOP_UP: 2,
};

function groupOf(batch) {
  const g = TYPE_GROUP[batch.type];
  return g === undefined ? 3 : g;
}

/** Kedaluwarsa: null (tidak pernah kedaluwarsa) selalu paling akhir di grupnya. */
function expiryKey(batch) {
  return batch.expiresAt == null ? Number.POSITIVE_INFINITY : batch.expiresAt;
}

function cmpInt(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpStr(a, b) {
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Batch layak pakai pada waktu `now` (ms epoch):
 * - punya sisa tersedia (remainingAmount > 0),
 * - belum kedaluwarsa (expiresAt null atau > now),
 * - tidak dibekukan (status FROZEN dikeluarkan; status lain yang tidak
 *   dikenal diperlakukan sebagai tidak layak — fail closed).
 */
export function isBatchEligible(batch, now) {
  if (!batch) return false;
  if (batch.status === 'FROZEN' || batch.status === 'EXPIRED') return false;
  if (batch.status !== undefined && batch.status !== 'ACTIVE' && batch.status !== 'EXHAUSTED') {
    return false;
  }
  if (!Number.isInteger(batch.remainingAmount) || batch.remainingAmount <= 0) return false;
  if (batch.expiresAt != null && batch.expiresAt <= now) return false;
  return true;
}

/**
 * resolveAllocationOrder(batches, now) → array batch yang layak, terurut
 * deterministik menurut kebijakan di header file ini:
 *   1. SUBSCRIPTION — expiresAt menaik (paling awal kedaluwarsa dulu).
 *   2. BONUS & FREE_ONCE — expiresAt menaik, yang tanpa kedaluwarsa terakhir.
 *   3. TOP_UP — grantedAt menaik (FIFO; top-up tidak pernah kedaluwarsa,
 *      jadi urutan terbit adalah satu-satunya kunci deterministik).
 * Tie-breaker di semua grup: grantedAt menaik, lalu id (string) — hasil untuk
 * input yang sama selalu identik.
 *
 * Fungsi murni: tidak mengubah batch input.
 */
export function resolveAllocationOrder(batches, now) {
  const eligible = (batches || []).filter((b) => isBatchEligible(b, now));
  eligible.sort((a, b) => {
    const g = cmpInt(groupOf(a), groupOf(b));
    if (g !== 0) return g;
    const grp = groupOf(a);
    if (grp === 2) {
      // TOP_UP: FIFO murni berdasarkan waktu terbit.
      const t = cmpInt(a.grantedAt || 0, b.grantedAt || 0);
      if (t !== 0) return t;
    } else {
      const e = cmpInt(expiryKey(a), expiryKey(b));
      if (e !== 0) return e;
      const t = cmpInt(a.grantedAt || 0, b.grantedAt || 0);
      if (t !== 0) return t;
    }
    return cmpStr(a.id, b.id);
  });
  return eligible;
}

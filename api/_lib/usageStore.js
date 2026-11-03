/**
 * api/_lib/usageStore.js — Adapter penyimpanan usage meter (Phase 5)
 * ============================================================================
 * Adapter in-memory untuk api/_lib/usageMeter.js (file itu TIDAK diubah).
 * Interface yang diharapkan usageMeter dari adapter:
 *   - saveUsage(entry)  → dipanggil meter untuk menyimpan satu record
 *   - getUsage(userId, limit) → dibaca meter untuk riwayat per user
 *   - usageLog (array)  → fallback bila saveUsage tidak ada (tidak dipakai
 *     di sini karena saveUsage tersedia; tetap dipertahankan untuk kompat)
 *
 * Berbeda dengan adapter null yang dipakai gateway saat ini (record dihitung
 * lalu DIBUANG — audit §2.5), adapter ini MENYIMPAN setiap record dan bisa
 * di-query: getByIdempotencyKey / listByUser. Ini membuktikan di level
 * adapter/domain bahwa metering tidak harus membuang data; penyambungan ke
 * gateway + persistensi DB adalah langkah integrasi terpisah (butuh DB
 * terverifikasi — di luar fase ini).
 *
 * Deduplikasi: saveUsage menolak record kedua dengan idempotency_key yang
 * sama (lapisan kedua setelah Set in-process milik meter, yang hilang saat
 * cold start; adapter DB masa depan menegakkan ini via UNIQUE constraint).
 */
export function createMemoryUsageStore() {
  const usageLog = [];
  const byKey = new Map();

  async function saveUsage(entry) {
    const key = entry && entry.idempotency_key;
    if (key && byKey.has(key)) return { ok: true, duplicate: true };
    usageLog.push(entry);
    if (key) byKey.set(key, entry);
    return { ok: true };
  }

  async function getUsage(userId, limit = 50) {
    return usageLog.filter((u) => u.user_id === userId).slice(-limit).reverse();
  }

  function getByIdempotencyKey(key) {
    return byKey.get(key) || null;
  }

  function listByUser(userId) {
    return usageLog.filter((u) => u.user_id === userId);
  }

  return {
    usageLog,
    saveUsage,
    // alias: meter lama memanggil saveUsage; `record` disediakan agar adapter
    // ini juga bisa dipakai langsung dengan gaya record(entry).
    record: saveUsage,
    getUsage,
    getByIdempotencyKey,
    listByUser,
  };
}

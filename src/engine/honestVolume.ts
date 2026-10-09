/**
 * Fase 4A — validasi volume jujur.
 *
 * Jangan pernah mengubah volume/quantity kosong (null/undefined/NaN/tidak valid)
 * menjadi 1 secara diam-diam. Nilai 1 yang difabrikasi ikut masuk ke total
 * (volume 1 × harga = jumlah fiktif). Kembalikan 0 agar tidak menciptakan
 * biaya dari ketiadaan data; pemanggil wajib menampilkan kesalahan yang jelas
 * atau meminta pengguna mengisi nilai yang benar.
 */
export function honestVolume(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * True jika nilai volume valid untuk perhitungan (angka finite >= 0).
 * Gunakan untuk validasi eksplisit sebelum menyimpan.
 */
export function isValidVolume(value: unknown): boolean {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0;
}

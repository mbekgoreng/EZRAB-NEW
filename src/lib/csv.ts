/**
 * Ekspor CSV yang aman (audit keamanan 2026-10-31, F-5.2).
 *
 * Dua kewajiban setiap sel:
 * 1. Kutip selalu + gandakan kutip di dalam nilai (CSV standar).
 * 2. Netralisasi injeksi formula: sel TEKS yang (sesudah spasi awal)
 *    diawali `=`, `+`, `-`, `@` — atau diawali tab/CR — dapat dieksekusi
 *    Excel/Sheets sebagai formula saat berkas dibuka (nama item hasil
 *    ekstraksi AI dari PDF unggahan adalah konten yang bisa diatur
 *    pembuat gambar). Awalan apostrof memaksa perlakuan teks.
 *    Nilai bertipe number tidak disentuh (angka murni bukan formula).
 */
export function csvCell(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  let s = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r]/.test(s)) {
    s = "'" + s;
  }
  return '"' + s.replace(/"/g, '""') + '"';
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

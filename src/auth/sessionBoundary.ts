/**
 * Penanda batas sesi logout (R2) — module-level, BUKAN React state dan
 * BUKAN localStorage.
 *
 * Alasan: saat logout, navigasi ke landing meng-unmount ProjectProvider,
 * yang flush-on-unmount-nya akan menulis kembali seluruh state proyek
 * dari memori ke localStorage — termasuk kunci transien yang baru saja
 * dibersihkan logoutAll. Penanda ini membuat flush tersebut dilewati.
 *
 * Siklus hidup: beginLogout() dipanggil PERTAMA oleh logoutAll (sebelum
 * pekerjaan async apa pun); ProjectContext menghapus penanda saat mount
 * (sesi workspace baru dimulai) dan memeriksa penanda saat flush.
 * Penanda ini hanya pernah MENGHAPUS perilaku (melewati penulisan),
 * tidak pernah MEMBERI hak apa pun, jadi tidak ada yang bisa dipalsukan
 * darinya menjadi privilege.
 */

let logoutInProgress = false;
let logoutGeneration = 0;

/** Tandai logout dimulai. Mengembalikan nomor generasi logout ini. */
export function beginLogout(): number {
  logoutInProgress = true;
  logoutGeneration += 1;
  return logoutGeneration;
}

/** True sejak beginLogout() sampai sesi workspace baru dimulai. */
export function isLogoutInProgress(): boolean {
  return logoutInProgress;
}

/** Hapus penanda — dipanggil saat sesi workspace baru dimulai. */
export function clearLogoutInProgress(): void {
  logoutInProgress = false;
}

/** Nomor generasi logout terakhir (diagnostik / pengujian). */
export function getLogoutGeneration(): number {
  return logoutGeneration;
}

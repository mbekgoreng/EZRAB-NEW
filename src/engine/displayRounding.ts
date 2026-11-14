/**
 * displayRounding — pembulatan tampilan yang JUMLAHNYA KONSISTEN.
 *
 * D-54 (Batch G2, 2026-11-14; aturan tampilan OD-03 opsi (a)
 * largest-remainder): komponen yang dibulatkan satu-per-satu ke rupiah
 * utuh jumlahnya bisa meleset ±Rp1 dari total yang dibulatkan sekali
 * (Σ round(setiap) vs round(Σ)). Terverifikasi 242 dari 1.037 kartu
 * Bina Marga berkomponen meleset — mis. B.5 tampil 895.936 vs HSP
 * 895.935. Ini HANYA soal tampilan: nilai mentah & total tidak diubah;
 * yang disesuaikan adalah pembulatan tiap komponen yang ditampilkan
 * agar jumlah tampilannya persis sama dengan total tampilannya.
 *
 * Aturan largest-remainder (apportionment):
 *   1. Bulatkan setiap nilai ke bawah (floor).
 *   2. Selisih (total bulat − Σ floor) dibagikan Rp1 per Rp1 ke nilai
 *      dengan sisa pecahan terbesar (seri: urutan tampil pertama).
 * Hasil: setiap nilai tampil berbeda ≤Rp1 dari pembulatan biasanya,
 * dan Σ nilai tampil === total tampil — selalu.
 *
 * Batasan jujur: helper ini TIDAK boleh dipakai untuk mengubah nilai
 * keuangan tersimpan atau total — hanya angka yang dirender berdampingan
 * dengan totalnya di satu tampilan. Pemanggil wajib menjaga guard:
 * apportion hanya bila total memang jumlah dari nilai-nilai itu
 * (bukan DHSP / harga independen).
 */

/**
 * Bagi `total` (rupiah utuh) ke `values` dengan largest-remainder.
 * Mengembalikan array bilangan bulat dengan panjang yang sama dan
 * jumlah yang persis sama dengan `Math.round(total)` — untuk SEMUA
 * input (distribusi dihitung aritmetik, tanpa loop per-rupiah,
 * sehingga tidak ada batas selisih maupun risiko gantung).
 *
 * Kasus tepi (tanpa throw): array kosong → []; total non-finite atau
 * negatif → nilai-nilai dibulatkan biasa; nilai non-finite diperlakukan
 * sebagai 0.
 */
export function largestRemainderRound(values: readonly number[], total: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const clean = values.map((v) => (Number.isFinite(v) ? v : 0));
  const roundedTotal = Math.round(total);
  if (!Number.isFinite(total) || roundedTotal < 0) {
    return clean.map((v) => Math.round(v));
  }
  const floors = clean.map((v) => Math.floor(v));
  const remainders = clean.map((v, i) => v - floors[i]);
  const floorSum = floors.reduce((a, b) => a + b, 0);
  const result = [...floors];
  // Urutan penerima: sisa pecahan terbesar dulu; seri → indeks terkecil.
  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r - a.r) || (a.i - b.i))
    .map((x) => x.i);
  // Distribusi ARITMETIK (bukan loop per-Rp1): selisih dibagi rata ke
  // semua nilai, sisanya ke pecahan terbesar. Normalnya selisih ≤ n
  // (setiap floor kehilangan < Rp1) sehingga bagi-rata = 0 dan perilaku
  // identik dengan largest-remainder klasik; untuk input patologis
  // (total jauh dari Σ nilai) jumlah tetap persis tanpa loop panjang.
  const deficit = roundedTotal - floorSum;
  if (deficit > 0) {
    const per = Math.floor(deficit / n);
    const extra = deficit % n;
    for (let i = 0; i < n; i++) result[i] += per;
    for (let k = 0; k < extra; k++) result[order[k]] += 1;
  } else if (deficit < 0) {
    // Total lebih kecil dari Σ floor (hanya bila nilai negatif tercampur
    // atau total bukan jumlah nilai): kurangi dari pecahan TERKECIL dulu.
    const surplus = -deficit;
    const per = Math.floor(surplus / n);
    const extra = surplus % n;
    for (let i = 0; i < n; i++) result[i] -= per;
    for (let k = 0; k < extra; k++) result[order[n - 1 - k]] -= 1;
  }
  return result;
}

/**
 * Guard pemakaian: true bila `total` memang jumlah dari `values`
 * (setelah pembulatan ke rupiah utuh). Pemanggil hanya boleh memakai
 * hasil apportion bila guard ini true — bila false, totalnya berasal
 * dari sumber lain (mis. DHSP resmi) dan komponen TIDAK BOLEH
 * dipaksa menjumlah ke total itu.
 */
export function isApportionableTotal(values: readonly number[], total: number): boolean {
  if (values.length === 0) return false;
  if (!Number.isFinite(total)) return false;
  // Nilai non-finite = data rusak — jangan pernah di-apportion
  // (memperlakukannya sebagai 0 akan "memaksa" komponen rusak
  // menjumlah ke total yang sah).
  if (!values.every((v) => Number.isFinite(v))) return false;
  const sum = values.reduce((a, v) => a + v, 0);
  return Math.round(sum) === Math.round(total);
}

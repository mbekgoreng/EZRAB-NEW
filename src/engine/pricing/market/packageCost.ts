/**
 * EZRAB Market Price — Biaya Kemasan vs Biaya Ekuivalen (Fase 3)
 * =============================================================
 * Dua konsep yang disimpan dan ditampilkan terpisah:
 *
 * A. BIAYA EKUIVALEN: harga per satuan dasar AHSP × koefisien.
 *    Contoh: paku 0,5 kg, toko jual 1 kg Rp60.000 → ekuivalen Rp30.000.
 *    Dipakai untuk perhitungan AHSP deterministik.
 *
 * B. BIAYA KEMASAN UTUH: harga satu kemasan utuh.
 *    Contoh: tetap Rp60.000 (1 kg).
 *    Dipakai bila pengguna menghitung kebutuhan belanja aktual.
 *
 * Keduanya diturunkan dari data yang sama; tidak ada tebakan.
 */

export interface PackageCostBreakdown {
  /** Harga tertera per kemasan */
  listedPrice: number;
  /** Satuan penjualan (mis. 'kg', 'dus', 'sak') */
  saleUnit: string;
  /** Isi kemasan */
  packageQuantity: number | null;
  /** Satuan isi kemasan */
  packageContentUnit: string | null;
  /** Satuan dasar AHSP */
  baseUnit: string;
  /** Koefisien kebutuhan AHSP (dalam satuan dasar) */
  ahspCoefficient: number;
  /** A. Biaya ekuivalen = normalizedPrice × koefisien */
  equivalentCost: number | null;
  /** B. Biaya kemasan utuh = listedPrice × ceil(kebutuhan / isi) */
  packageCost: number | null;
  /** Jumlah kemasan utuh yang dibutuhkan (pembulatan ke atas) */
  packagesNeeded: number | null;
  /** Rumus yang dipakai (untuk audit) */
  formula: string;
  /** Alasan jika salah satu null */
  reason: string | null;
}

import { normalizeUnitPrice } from './unitConversion';

/**
 * Hitung breakdown biaya kemasan vs ekuivalen.
 * @returns null bila konversi tidak valid (fail-closed).
 */
export function computePackageCost(
  listedPrice: number,
  saleUnit: string,
  packageQuantity: number | null,
  packageContentUnit: string | null,
  baseUnit: string,
  ahspCoefficient: number
): PackageCostBreakdown | null {
  const norm = normalizeUnitPrice(listedPrice, saleUnit, packageQuantity, baseUnit);
  if (norm.price === null) {
    return null; // konversi tidak valid — fail closed
  }
  const normalized = norm.price;

  // A. Biaya ekuivalen
  const equivalentCost = normalized * ahspCoefficient;

  // B. Biaya kemasan utuh
  // Kebutuhan dalam satuan penjualan = koefisien (dlm satuan dasar) / isi per kemasan (dlm satuan dasar)
  let packagesNeeded: number | null = null;
  let packageCost: number | null = null;

  if (packageQuantity && packageQuantity > 0) {
    // Asumsi: saleUnit adalah kemasan, packageQuantity = isi dalam satuan dasar
    // Ini disederhanakan; kasus kompleks (dus isi pcs) butuh packageContentUnit
    packagesNeeded = Math.ceil(ahspCoefficient / packageQuantity);
    if (packagesNeeded < 1) packagesNeeded = 1;
    packageCost = listedPrice * packagesNeeded;
  } else {
    // Tanpa info kemasan: satu satuan penjualan = satu pembelian
    packagesNeeded = 1;
    packageCost = listedPrice;
  }

  const formula =
    `Ekuivalen: Rp${normalized.toLocaleString('id-ID')}/${baseUnit} × ${ahspCoefficient} ${baseUnit} = Rp${equivalentCost.toLocaleString('id-ID')}; ` +
    `Kemasan: ${packagesNeeded} × Rp${listedPrice.toLocaleString('id-ID')} = Rp${(packageCost ?? 0).toLocaleString('id-ID')}`;

  return {
    listedPrice,
    saleUnit,
    packageQuantity,
    packageContentUnit,
    baseUnit,
    ahspCoefficient,
    equivalentCost,
    packageCost,
    packagesNeeded,
    formula,
    reason: null,
  };
}

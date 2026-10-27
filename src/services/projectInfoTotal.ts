/**
 * projectInfoTotal — total proyek untuk kartu "Total Nilai RAB (terhitung)"
 * di tab Data Proyek Pengaturan Terpadu.
 *
 * SATU rumus dengan Rekapitulasi (dan, bila komponen pra-pajak tambahan
 * mesin = 0, dengan UnifiedProjectEngine.recalculateCostSummary):
 * - biaya langsung = jumlah amount item (atau volume × harga bila amount
 *   kosong);
 * - overhead = direct × overheadPercent proyek;
 * - PPN/PPh HANYA bila flag-nya aktif (owner 2026-10-27, default mati);
 *   persen dari proyek; PPh default 0 (tidak ada tarif karangan);
 * - item yang sudah termasuk pajak itu TIDAK kena pajak itu lagi, beserta
 *   overhead proporsionalnya (anti hitung ganda, sama seperti Rekap).
 *
 * Dipisahkan dari komponen agar bisa diuji tanpa me-mount React, dan agar
 * kartu Informasi Proyek, Rekapitulasi, dan mesin tidak lagi punya tiga
 * salinan rumus yang bisa drift diam-diam.
 *
 * Nilai sumber TIDAK PERNAH diubah; fungsi ini murni menghitung tampilan
 * dari item + flag yang diberikan.
 */

export interface ProjectInfoItemInput {
  amount?: number | null;
  volume?: number | null;
  unitPrice?: number | null;
  /** Dari centang input manual: harga sudah termasuk PPN. */
  taxIncludedPpn?: boolean;
  /** Dari centang input manual: harga sudah termasuk PPh. */
  taxIncludedPph?: boolean;
}

export interface ProjectInfoTaxInput {
  overheadPercent?: number | null;
  ppnEnabled?: boolean;
  ppnPercent?: number | null;
  pphEnabled?: boolean;
  pphPercent?: number | null;
}

export interface ProjectInfoTotal {
  itemCount: number;
  direct: number;
  overheadPercent: number;
  overhead: number;
  ppn: number;
  pph: number;
  total: number;
}

function itemAmount(it: ProjectInfoItemInput): number {
  return it.amount || (it.volume || 0) * (it.unitPrice || 0);
}

/**
 * @returns null bila tidak ada item — pemanggil HARUS menampilkan
 * "Belum ada item RAB", bukan Rp0. Proyek kosong bukan proyek Rp0.
 */
export function computeProjectInfoTotal(
  items: ProjectInfoItemInput[],
  project: ProjectInfoTaxInput | null | undefined
): ProjectInfoTotal | null {
  if (items.length === 0) return null;
  const direct = items.reduce((a, it) => a + itemAmount(it), 0);
  const directPpn = items
    .filter((it) => it.taxIncludedPpn !== true)
    .reduce((a, it) => a + itemAmount(it), 0);
  const directPph = items
    .filter((it) => it.taxIncludedPph !== true)
    .reduce((a, it) => a + itemAmount(it), 0);
  const overheadPercent = Number(project?.overheadPercent ?? 10);
  const overhead = (direct * overheadPercent) / 100;
  const overheadPpn = direct > 0 ? (overhead * directPpn) / direct : 0;
  const overheadPph = direct > 0 ? (overhead * directPph) / direct : 0;
  const ppn =
    project?.ppnEnabled === true
      ? ((directPpn + overheadPpn) * Number(project?.ppnPercent ?? 11)) / 100
      : 0;
  const pph =
    project?.pphEnabled === true
      ? ((directPph + overheadPph) * Number(project?.pphPercent ?? 0)) / 100
      : 0;
  return {
    itemCount: items.length,
    direct,
    overheadPercent,
    overhead,
    ppn,
    pph,
    total: direct + overhead + ppn + pph,
  };
}

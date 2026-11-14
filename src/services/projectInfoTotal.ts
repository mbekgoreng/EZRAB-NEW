/**
 * projectInfoTotal — total proyek untuk kartu "Total Nilai RAB (terhitung)"
 * di tab Data Proyek Pengaturan Terpadu.
 *
 * D-24 (Batch C, 2026-11-14): fungsi ini dulu menghitung tangga uang
 * SENDIRI (`direct + overhead + ppn + pph`) TANPA suku profit sama sekali,
 * sehingga kartu menampilkan Rp1.040.339.744 sementara Rekapitulasi
 * menampilkan Rp1.089.879.733 untuk proyek demo yang sama (selisih
 * Rp49.539.989 — seluruh profit tidak terlihat). Bug yang sama sudah
 * diperbaiki di Rekapitulasi pada Batch 4, tetapi fungsi ini tertinggal.
 *
 * Kini fungsi ini HANYA mendelegasikan ke mesin kanonis
 * (`UnifiedProjectEngine.recalculateCostSummary`) — tidak ada lagi tangga
 * kedua. Konfigurasi diselesaikan lewat resolver kanonis
 * (`resolveProjectCostConfig`: field proyek → costSummary → default).
 * Hasilnya SELALU sama dengan Rekapitulasi untuk item + proyek yang sama.
 *
 * Normalisasi input (BUKAN rumus kedua): item tanpa `amount` tersimpan
 * memakai aturan factory (`volume × unitPrice` dibulatkan) — sama seperti
 * pengelompokan Rekap — agar item lama tanpa amount tetap terhitung.
 * Item `PRICE_UNRESOLVED` dikecualikan, selaras mesin.
 *
 * Nilai sumber TIDAK PERNAH diubah; fungsi ini murni menghitung tampilan
 * dari item + proyek yang diberikan.
 */
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import {
  resolveProjectCostConfig,
  canonicalItemAmount,
  type ProjectCostConfigInput,
} from '../engine/projectCostConfig';
import type { RabItem } from '../types';

export interface ProjectInfoItemInput {
  amount?: number | null;
  volume?: number | null;
  unitPrice?: number | null;
  /** Dari centang input manual: harga sudah termasuk PPN. */
  taxIncludedPpn?: boolean;
  /** Dari centang input manual: harga sudah termasuk PPh. */
  taxIncludedPph?: boolean;
  /** Item tanpa harga sah dikecualikan dari total (aturan mesin kanonis). */
  priceStatus?: string | null;
  /** Basis biaya harga satuan (§17.1): item 'HSP' dibebaskan dari O&P. */
  priceCostBasis?: 'HSP' | 'DIRECT_COST' | string | null;
}

/** Konfigurasi proyek untuk kartu — bentuk yang sama dengan resolver
 *  kanonis (field proyek + costSummary). `ppnPercent` adalah nama field
 *  proyek untuk tarif PPN (`taxPercent` di costSummary). */
export type ProjectInfoTaxInput = ProjectCostConfigInput;

export interface ProjectInfoTotal {
  itemCount: number;
  direct: number;
  overheadPercent: number;
  overhead: number;
  /** D-24: suku profit yang dulu hilang — kini dari mesin kanonis. */
  profitPercent: number;
  profit: number;
  ppn: number;
  pph: number;
  total: number;
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
  const config = resolveProjectCostConfig(project);
  // Bentuk item menjadi RabItem minimal untuk mesin kanonis: amount lewat
  // aturan kanonis (UNRESOLVED → 0, tanpa amount → aturan factory),
  // flag pajak + basis harga diteruskan agar pengecualian mesin berlaku.
  const engineItems = items.map(
    (it) =>
      ({
        amount: canonicalItemAmount(it),
        priceStatus: it.priceStatus ?? undefined,
        taxIncludedPpn: it.taxIncludedPpn,
        taxIncludedPph: it.taxIncludedPph,
        priceCostBasis: it.priceCostBasis ?? undefined,
      }) as unknown as RabItem
  );
  const s = UnifiedProjectEngine.recalculateCostSummary(engineItems, config);
  return {
    itemCount: items.length,
    direct: s.directCost,
    overheadPercent: s.overheadPercent,
    overhead: s.overheadAmount,
    profitPercent: s.profitPercent,
    profit: s.profitAmount,
    ppn: s.taxAmount,
    pph: s.pphAmount ?? 0,
    total: s.grandTotal,
  };
}

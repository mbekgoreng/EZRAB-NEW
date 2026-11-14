/**
 * rekapSummary — perhitungan Rekapitulasi RAB sebagai fungsi murni.
 *
 * Diekstrak VERBATIM dari useMemo EstimatorRekapitulasiView (mengikuti pola
 * mobileV3Utils: fungsi murni dipindah ke modul sendiri agar bisa dipakai
 * ulang presentasi lain — di sini presentasi native mobile MobileRekapRab)
 * TANPA mengubah satu pun rumus/aturan: pengelompokan per sectionName ||
 * category, tangga uang dari mesin kanonis recalculateCostSummary, dan
 * resolusi konfigurasi proyek yang sama persis.
 */
import type { Project, RabItem } from "../../types";
import { recalculateCostSummary } from "../../engine/unifiedProjectEngine";
import { resolveProjectCostConfig } from "../../engine/projectCostConfig";

export interface RekapCategoryRow {
  no: number;
  name: string;
  total: number;
  count: number;
  weight: number;
}

export interface RekapSummary {
  categoryList: RekapCategoryRow[];
  directCost: number;
  overheadNominal: number;
  profitNominal: number;
  profitPct: number;
  ppnNominal: number;
  pphNominal: number;
  grandTotal: number;
  overheadPct: number;
  ppnPct: number;
  pphPct: number;
  ppnEnabled: boolean;
  pphEnabled: boolean;
  ppnExcludedCount: number;
  pphExcludedCount: number;
  unresolvedCount: number;
}

export function computeRekapSummary(items: RabItem[], currentProject: Project | null): RekapSummary {
  const map = new Map<string, { name: string; total: number; count: number }>();
  let direct = 0;
  let ppnExcluded = 0;
  let pphExcluded = 0;

  items.forEach((item) => {
    // F1a: kunci pengelompokan sama dengan spreadsheet (sectionName || category).
    const cat = item.sectionName || item.category || "Pekerjaan Persiapan & Umum";
    const amt = item.amount || (item.volume || 0) * (item.unitPrice || 0);
    direct += amt;
    if ((item as any)?.taxIncludedPpn === true) ppnExcluded += 1;
    if ((item as any)?.taxIncludedPph === true) pphExcluded += 1;

    const existing = map.get(cat);
    if (existing) {
      existing.total += amt;
      existing.count += 1;
    } else {
      map.set(cat, { name: cat, total: amt, count: 1 });
    }
  });

  const categories = Array.from(map.values()).map((c, idx) => ({
    no: idx + 1,
    name: c.name,
    total: c.total,
    count: c.count,
    weight: direct > 0 ? (c.total / direct) * 100 : 0,
  }));

  // Batch 4 (P0 — total Rekapitulasi menyimpang dari semua permukaan lain):
  // tangga uang diambil dari mesin kanonis yang sama dengan kartu proyek,
  // Laporan, ekspor, dan konteks AI (recalculateCostSummary). View ini
  // sebelumnya menghitung tangga sendiri dan TIDAK PERNAH membaca
  // profitPercent, sehingga totalnya lebih kecil dari total kanonis untuk
  // proyek yang sama (terverifikasi pada proyek demo premium:
  // Rp1.040.339.744 di sini vs Rp1.089.879.733 kanonis).
  // Batch C (D-77): resolusi konfigurasi memakai SATU resolver kanonis
  // (field proyek → costSummary → default mesin) — aturan yang sama persis
  // dengan inline lama di sini, kini dibagi dengan kartu Info Proyek,
  // Settings, skenario, dan rekonsiliasi agar tidak bisa drift lagi.
  const config = resolveProjectCostConfig(currentProject);
  const ppnEnabled = config.ppnEnabled;
  const pphEnabled = config.pphEnabled;
  const summary = recalculateCostSummary(items as never, config as never);

  return {
    categoryList: categories,
    directCost: summary.directCost,
    overheadNominal: summary.overheadAmount,
    profitNominal: summary.profitAmount,
    profitPct: summary.profitPercent,
    ppnNominal: summary.taxAmount,
    pphNominal: summary.pphAmount ?? 0,
    grandTotal: summary.grandTotal,
    overheadPct: summary.overheadPercent,
    ppnPct: summary.taxPercent,
    pphPct: summary.pphPercent ?? 0,
    ppnEnabled,
    pphEnabled,
    ppnExcludedCount: ppnExcluded,
    pphExcludedCount: pphExcluded,
    unresolvedCount: summary.unresolvedItems ?? 0,
  };
}

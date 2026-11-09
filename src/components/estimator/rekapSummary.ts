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
  // Rp1.040.339.744 di sini vs Rp1.089.879.733 kanonis). Resolusi konfigurasi
  // meniru projectContext: overhead dari field proyek, profit dari field
  // proyek lalu costSummary, pajak dari field proyek/costSummary; pajak
  // hanya bila flag proyek aktif (opt-in).
  const proj: any = currentProject as any;
  const cs: any = proj?.costSummary ?? {};
  const ppnEnabled = proj?.ppnEnabled === true;
  const pphEnabled = proj?.pphEnabled === true;
  const summary = recalculateCostSummary(items as never, {
    overheadPercent:
      typeof proj?.overheadPercent === "number" ? proj.overheadPercent : typeof cs.overheadPercent === "number" ? cs.overheadPercent : undefined,
    profitPercent:
      typeof proj?.profitPercent === "number" ? proj.profitPercent : typeof cs.profitPercent === "number" ? cs.profitPercent : undefined,
    taxPercent:
      typeof proj?.ppnPercent === "number" ? proj.ppnPercent : typeof cs.taxPercent === "number" ? cs.taxPercent : undefined,
    contingencyPercent: typeof cs.contingencyPercent === "number" ? cs.contingencyPercent : undefined,
    directorMarkupPercent: typeof cs.directorMarkupPercent === "number" ? cs.directorMarkupPercent : undefined,
    ppnEnabled,
    pphEnabled,
    pphPercent:
      typeof proj?.pphPercent === "number" ? proj.pphPercent : typeof cs.pphPercent === "number" ? cs.pphPercent : 0,
  } as never);

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

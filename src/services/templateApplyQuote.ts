/**
 * templateApplyQuote — kuotasi penerapan template yang SAMA PERSIS dengan
 * proyek yang dibuat (D-29).
 *
 * Defek D-29: konfigurator mengutip total termasuk waste 5% (dan markup
 * majemuk), tetapi confirm tidak meneruskan penyesuaian apa pun dan tangga
 * kanonis tidak punya suku waste — Rp273.315.000 "menguap" antara kuotasi
 * dan proyek yang dibuat (5.739.615.000 vs 5.466.300.000).
 *
 * Perbaikan (carry-through, OD-06 opsi (a) — TANPA mengubah tangga
 * kanonis):
 * - Waste dibakar ke VOLUME item non-HSP. Factory (rabItemFactory)
 *   menghitung ulang amount dari volume × harga, jadi waste yang dibakar
 *   ke amount akan dibuang bulkAdd; waste yang dibakar ke volume
 *   bertahan. Penanda dicatat di `description` ("(termasuk waste 5%)") —
 *   satu-satunya field teks yang selamat dari factory (notes dibuang).
 * - Overhead/profit/PPN dibawa sebagai KONFIGURASI proyek baru (bukan
 *   markup di kuotasi): proyek baru dibuat dengan angka-angka itu, dan
 *   kuotasi dihitung lewat MESIN KANONIS dengan konfigurasi yang sama —
 *   sehingga kuotasi == grand total proyek yang dibuat, demi rupiah.
 * - Proyek yang sudah ada TIDAK PERNAH diubah konfigurasinya: kuotasi
 *   memakai konfigurasi proyek tujuan (waste tetap dibakar ke item,
 *   karena waste adalah perubahan kuantitas, bukan konfigurasi).
 * - Item HSP (priceCostBasis 'HSP') dikecualikan dari waste — doktrin
 *   anti-markup-ganda yang sama dengan kode lama — dan dari basis O&P
 *   oleh mesin kanonis (§17.1). Satu-satunya kriteria HSP adalah
 *   `priceCostBasis` (aturan mesin); priceSourceKind TIDAK dipakai.
 *
 * Modul ini murni (tanpa React/state) agar kuotasi konfigurator,
 * penerapan WorkspaceView, dan tes round-trip memakai SATU implementasi.
 */
import { RabItem, ProjectCostSummary } from '../types';
import {
  UnifiedProjectEngine,
  isHspPricedItem,
  type PriceCostBasisLike,
} from '../engine/unifiedProjectEngine';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import {
  canonicalItemAmount,
  type ResolvedProjectCostConfig,
} from '../engine/projectCostConfig';

/**
 * Subset penyesuaian yang memengaruhi kuotasi. GlobalEstimationSettings
 * (GlobalEstimationSettingsModal) kompatibel secara struktural — diteruskan
 * apa adanya oleh pemanggil.
 */
export interface TemplateQuoteAdjustments {
  wastePercent: number;
  overheadPercent: number;
  profitPercent: number;
  taxPercent: number;
  taxEnabled?: boolean;
}

/** Awalan penanda waste di description — dipakai untuk idempotensi. */
export const WASTE_MARKER_PREFIX = '(termasuk waste ';

export function wasteMarker(wastePercent: number): string {
  return ` (termasuk waste ${wastePercent}%)`;
}

/**
 * Konfigurasi proyek BARU yang dibuat dari penyesuaian. Dipakai oleh
 * kuotasi (buildTemplateApplicationQuote, target null) DAN oleh
 * WorkspaceView saat createProject — satu sumber, tidak boleh menyimpang.
 */
export function adjustmentsToNewProjectConfig(
  adjustments: TemplateQuoteAdjustments
): ResolvedProjectCostConfig {
  return {
    overheadPercent: adjustments.overheadPercent ?? 0,
    profitPercent: adjustments.profitPercent ?? 0,
    taxPercent: adjustments.taxPercent ?? 11,
    contingencyPercent: 0,
    directorMarkupPercent: 0,
    ppnEnabled: adjustments.taxEnabled === true,
    pphEnabled: false,
    pphPercent: 0,
  };
}

/**
 * Membakar waste ke volume item non-HSP. Mengembalikan item BARU (item
 * asli tidak diubah) + total rupiah waste (Σ selisih amount).
 *
 * Dilewati: item HSP, item tanpa harga, item bervolume 0. Volume baru
 * dibulatkan ke 4 desimal agar noise float tidak tersimpan; amount dihitung
 * ulang dengan aturan factory yang sama (safeMultiply(..., 0)) sehingga
 * jumlah kuotasi == jumlah yang disimpan bulkAdd.
 */
export function applyWasteToItems(
  items: RabItem[],
  wastePercent: number
): { items: RabItem[]; wasteAmount: number } {
  if (!Number.isFinite(wastePercent) || wastePercent <= 0) {
    return { items, wasteAmount: 0 };
  }
  const factor = 1 + wastePercent / 100;
  let wasteAmount = 0;
  const baked = items.map((item) => {
    if (
      isHspPricedItem(item as unknown as PriceCostBasisLike) ||
      item.unitPrice == null ||
      !(Number(item.volume) > 0)
    ) {
      return item;
    }
    const oldAmount = canonicalItemAmount(item);
    const newVolume = Math.round(Number(item.volume) * factor * 10000) / 10000;
    const newAmount = SafeDecimalEngine.safeMultiply(newVolume, Number(item.unitPrice), 0);
    wasteAmount += newAmount - oldAmount;
    const description = item.description.includes(WASTE_MARKER_PREFIX)
      ? item.description
      : `${item.description}${wasteMarker(wastePercent)}`;
    return { ...item, volume: newVolume, amount: newAmount, totalPrice: newAmount, description };
  });
  return { items: baked, wasteAmount };
}

export interface TemplateApplicationQuote {
  /** Item hasil bakar waste — item PERSIS yang harus di-bulkAdd. */
  items: RabItem[];
  /** Total rupiah waste (Σ selisih amount akibat pembakaran volume). */
  wasteAmount: number;
  /** Σ amount item HSP (basis, tanpa waste). */
  officialSubtotal: number;
  /** Σ amount item non-HSP SEBELUM waste. */
  nonOfficialSubtotal: number;
  /** Σ semua amount sebelum waste (== totalEstimate generator). */
  baseTotal: number;
  /** Ringkasan kanonis item hasil bakar dengan konfigurasi efektif. */
  summary: ProjectCostSummary;
  /** == summary.grandTotal — total yang dikutip ke pengguna. */
  adjustedTotal: number;
  /** Konfigurasi yang dipakai mesin (target, atau penyesuaian bila baru). */
  effectiveConfig: ResolvedProjectCostConfig;
}

/**
 * Membangun kuotasi penerapan template.
 *
 * @param baseItems item hasil generateRabFromTemplate (harga dasar).
 * @param adjustments penyesuaian estimasi global pengguna.
 * @param targetConfig konfigurasi proyek tujuan (resolveProjectCostConfig)
 *   bila target adalah proyek yang sudah ada; null bila proyek BARU —
 *   dalam hal ini penyesuaian MENJADI konfigurasi proyek baru.
 */
export function buildTemplateApplicationQuote(
  baseItems: RabItem[],
  adjustments: TemplateQuoteAdjustments,
  targetConfig: ResolvedProjectCostConfig | null
): TemplateApplicationQuote {
  const effectiveConfig = targetConfig ?? adjustmentsToNewProjectConfig(adjustments);
  let officialSubtotal = 0;
  let nonOfficialSubtotal = 0;
  for (const item of baseItems) {
    const amt = canonicalItemAmount(item);
    if (isHspPricedItem(item as unknown as PriceCostBasisLike)) {
      officialSubtotal += amt;
    } else {
      nonOfficialSubtotal += amt;
    }
  }
  const { items, wasteAmount } = applyWasteToItems(baseItems, adjustments.wastePercent);
  const summary = UnifiedProjectEngine.recalculateCostSummary(items, effectiveConfig);
  return {
    items,
    wasteAmount,
    officialSubtotal,
    nonOfficialSubtotal,
    baseTotal: officialSubtotal + nonOfficialSubtotal,
    summary,
    adjustedTotal: summary.grandTotal,
    effectiveConfig,
  };
}

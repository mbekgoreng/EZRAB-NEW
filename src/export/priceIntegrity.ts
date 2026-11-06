/**
 * priceIntegrity — gerbang validitas harga SATU-SATUNYA untuk jalur ekspor
 * (Excel, PDF, dan rekap yang diekspor), P0 2026-10-26.
 *
 * Kontrak yang dipertahankan (JANGAN diubah):
 * - Kontrak sentinel lama rabItemFactory: PRICE_UNRESOLVED disimpan sebagai
 *   unitPrice 0 (dan amount 0). Nilai 0 TIDAK PERNAH dipakai untuk
 *   memutuskan "ada harga" — keputusan selalu dari priceStatus.
 * - Harga 0 eksplisit dengan status teresolusi (PRICE_RESOLVED /
 *   PRICE_MANUAL / legacy tanpa status) adalah harga VALID dan tetap
 *   dihitung (0 sah, bukan "belum tersedia").
 * - MARKET_REFERENCE = referensi pasar TERSIMPAN dari katalog, bukan harga
 *   live dan bukan harga resmi. Helper ini TIDAK mengarang nama/tanggal/
 *   wilayah sumber — bila sumber tidak menyediakannya, field itu tetap
 *   tidak ada (bukan diisi karangan).
 *
 * Aturan gerbang ekspor (berbeda dari isPriceValidForTotal di universalRab
 * yang memakai volume × unitPrice): jalur ekspor bekerja pada record yang
 * sudah tersimpan, yang total barisnya (amount/totalPrice) bisa berbeda
 * dari volume × unitPrice (override manual, komponen AHSP) dan bisa basi
 * (totalPrice nonzero pada item yang statusnya UNRESOLVED, mis. dari impor
 * atau jalur tulis non-factory). Karena itu:
 * - PRICE_UNRESOLVED → TIDAK VALID apa pun nilai totalPrice/amount-nya
 *   (total basi ikut dibuang, bukan hanya sentinel 0).
 * - Selain itu, item valid bila ada SATU angka finite di antara
 *   unitPrice/totalPrice/amount; amount/totalPrice tersimpan menang atas
 *   volume × unitPrice (mempertahankan override).
 * - Item legacy tanpa priceStatus diperlakukan teresolusi (kompatibilitas
 *   ke belakang, sama seperti UnifiedProjectEngine.recalculateCostSummary).
 *
 * Helper ini MURNI dan tanpa dependensi repo, agar bisa diimpor engine
 * ekspor, UnifiedProjectEngine, dan kurvaS tanpa siklus impor.
 */

/** Bentuk minimal item yang dibutuhkan gerbang ekspor (RABItem/RabItem kompatibel). */
export interface ExportPriceItem {
  volume?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  amount?: number | null;
  priceStatus?: string | null;
  priceSourceKind?: string | null;
  /**
   * ONE-PASS Task B: flag parsial EKSPLISIT dari item (rincian komponennya
   * belum lengkap walau item sendiri berharga). Ringkasan WAJIB
   * menghormatinya — item seperti ini tidak boleh terwakili sebagai lengkap.
   */
  isPartial?: boolean | null;
  /** Jumlah komponen item yang belum berharga (dari rincian kalkulator). */
  unresolvedComponentCount?: number | null;
}

export interface ExportItemSummary {
  pricedCount: number;
  unpricedCount: number;
  pricedTotal: number;
  officialTotal: number;
  marketTotal: number;
  manualTotal: number;
  /** Item berharga yang bukan resmi/pasar/manual (legacy teresolusi, asumsi). */
  otherTotal: number;
  /**
   * true bila total PARSIAL: ada item tanpa harga, ATAU ada item berharga
   * yang membawa flag parsial eksplisit / komponen unresolved.
   */
  isPartial: boolean;
  /** Jumlah item berharga yang ditandai parsial secara eksplisit. */
  partialItemCount: number;
  /** Total komponen belum berharga dari item-item berflag parsial. */
  unresolvedComponentTotal: number;
  /** true bila total berharga mencampur sumber (bukan total resmi murni). */
  isMixed: boolean;
}

export interface ExportSectionSummary extends ExportItemSummary {
  sectionCode: string;
  sectionName: string;
}

export interface ExportSectionsSummary extends ExportItemSummary {
  sections: ExportSectionSummary[];
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Gerbang status: UNRESOLVED tidak pernah valid, apa pun nilainya. */
export function isExportPriceValid(it: ExportPriceItem): boolean {
  if (it.priceStatus === 'PRICE_UNRESOLVED') return false;
  return isFiniteNumber(it.unitPrice) || isFiniteNumber(it.totalPrice) || isFiniteNumber(it.amount);
}

/**
 * Jumlah baris untuk ekspor, atau null bila harga belum dapat dihitung.
 * Total tersimpan (amount, lalu totalPrice) menang atas volume × unitPrice.
 */
export function exportItemAmount(it: ExportPriceItem): number | null {
  if (!isExportPriceValid(it)) return null;
  if (isFiniteNumber(it.amount)) return it.amount as number;
  if (isFiniteNumber(it.totalPrice)) return it.totalPrice as number;
  if (isFiniteNumber(it.volume) && isFiniteNumber(it.unitPrice)) {
    return (it.volume as number) * (it.unitPrice as number);
  }
  return null;
}

function bucketOf(it: ExportPriceItem): 'official' | 'market' | 'manual' | 'other' {
  if (it.priceStatus === 'PRICE_MANUAL') return 'manual';
  if (it.priceSourceKind === 'OFFICIAL_AHSP') return 'official';
  if (it.priceSourceKind === 'MARKET_REFERENCE') return 'market';
  return 'other';
}

/** Item ditandai parsial secara eksplisit (flag atau komponen unresolved > 0). */
function isFlaggedPartial(it: ExportPriceItem): boolean {
  if (it.isPartial === true) return true;
  return typeof it.unresolvedComponentCount === 'number' && it.unresolvedComponentCount > 0;
}

export function summarizeExportItems(items: ExportPriceItem[]): ExportItemSummary {
  let pricedCount = 0;
  let unpricedCount = 0;
  let pricedTotal = 0;
  let officialTotal = 0;
  let marketTotal = 0;
  let manualTotal = 0;
  let otherTotal = 0;
  let partialItemCount = 0;
  let unresolvedComponentTotal = 0;
  for (const it of items) {
    // Flag parsial dihitung dari SEMUA item (berharga maupun tidak) agar
    // hitungan komponen unresolved tetap akurat; jumlah rupiahnya sendiri
    // tetap digerbangi exportItemAmount di bawah (UNRESOLVED dibuang).
    if (isFlaggedPartial(it)) {
      partialItemCount++;
      if (typeof it.unresolvedComponentCount === 'number' && it.unresolvedComponentCount > 0) {
        unresolvedComponentTotal += it.unresolvedComponentCount;
      }
    }
    const amt = exportItemAmount(it);
    if (amt == null) {
      unpricedCount++;
      continue;
    }
    pricedCount++;
    pricedTotal += amt;
    const b = bucketOf(it);
    if (b === 'official') officialTotal += amt;
    else if (b === 'market') marketTotal += amt;
    else if (b === 'manual') manualTotal += amt;
    else otherTotal += amt;
  }
  const isMixed = officialTotal > 0
    ? (marketTotal > 0 || manualTotal > 0 || otherTotal > 0)
    : (marketTotal > 0 && manualTotal > 0) ||
      (marketTotal > 0 && otherTotal > 0) ||
      (manualTotal > 0 && otherTotal > 0);
  return {
    pricedCount,
    unpricedCount,
    pricedTotal,
    officialTotal,
    marketTotal,
    manualTotal,
    otherTotal,
    // ONE-PASS Task B: item berflag parsial membuat total PARSIAL walau
    // semua item berharga — flag tidak lagi diabaikan ringkasan.
    isPartial: unpricedCount > 0 || partialItemCount > 0,
    partialItemCount,
    unresolvedComponentTotal,
    isMixed,
  };
}

export function summarizeExportSections(
  sections: Array<{ code: string; name: string; items: ExportPriceItem[] }>
): ExportSectionsSummary {
  const per: ExportSectionSummary[] = [];
  let pricedCount = 0;
  let unpricedCount = 0;
  let pricedTotal = 0;
  let officialTotal = 0;
  let marketTotal = 0;
  let manualTotal = 0;
  let otherTotal = 0;
  let partialItemCount = 0;
  let unresolvedComponentTotal = 0;
  for (const sec of sections) {
    const s = summarizeExportItems(sec.items || []);
    per.push({
      sectionCode: sec.code,
      sectionName: sec.name,
      ...s,
    });
    pricedCount += s.pricedCount;
    unpricedCount += s.unpricedCount;
    pricedTotal += s.pricedTotal;
    officialTotal += s.officialTotal;
    marketTotal += s.marketTotal;
    manualTotal += s.manualTotal;
    otherTotal += s.otherTotal;
    partialItemCount += s.partialItemCount;
    unresolvedComponentTotal += s.unresolvedComponentTotal;
  }
  const isMixed = officialTotal > 0
    ? (marketTotal > 0 || manualTotal > 0 || otherTotal > 0)
    : (marketTotal > 0 && manualTotal > 0) ||
      (marketTotal > 0 && otherTotal > 0) ||
      (manualTotal > 0 && otherTotal > 0);
  return {
    sections: per,
    pricedCount,
    unpricedCount,
    pricedTotal,
    officialTotal,
    marketTotal,
    manualTotal,
    otherTotal,
    isPartial: unpricedCount > 0 || partialItemCount > 0,
    partialItemCount,
    unresolvedComponentTotal,
    isMixed,
  };
}

/** Label penjelas total ekspor: parsial bila ada item tanpa harga ATAU berflag parsial. */
export function exportTotalNote(summary: ExportItemSummary): string {
  if (summary.isPartial) {
    if (summary.unpricedCount > 0) {
      return `TOTAL PARSIAL — ${summary.unpricedCount} item belum memiliki harga dan tidak termasuk dalam total`;
    }
    return `TOTAL PARSIAL — ${summary.partialItemCount} item memiliki rincian komponen yang belum lengkap (${summary.unresolvedComponentTotal} komponen belum berharga)`;
  }
  if (summary.isMixed) {
    return 'Total campuran sumber harga (resmi/pasar/manual/lainnya) — bukan total resmi murni';
  }
  return '';
}

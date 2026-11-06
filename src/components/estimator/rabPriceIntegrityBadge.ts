/**
 * ONE-PASS Task A — logika tampilan peringatan integritas harga di editor
 * RAB (EstimatorSpreadsheetTable). Diekstrak sebagai fungsi murni agar
 * dapat diuji unit tanpa React.
 *
 * Sumbernya adalah field yang SUDAH tersimpan pada item (dari sinkronisasi
 * QTO / gate integritas): isPartial, unresolvedComponentCount,
 * priceValidationWarnings. Helper ini tidak menghitung ulang harga dan
 * tidak mengubah item — ia hanya memutuskan apa yang perlu DILIHAT
 * pengguna di editor: indikator ringkas + detail yang bisa diperluas.
 */
import type { RabItem } from '../../types';

export interface RabItemIntegrityNotice {
  /** Item ditandai parsial (flag eksplisit atau komponen unresolved > 0). */
  isPartial: boolean;
  unresolvedComponentCount: number;
  /** Peringatan tersimpan yang valid (string non-kosong). */
  warnings: string[];
  /** Label ringkas untuk badge di editor. */
  badgeLabel: string;
  /** true bila ada detail peringatan yang bisa diperluas. */
  hasDetail: boolean;
}

export function getRabItemIntegrityNotice(
  item: Pick<RabItem, 'isPartial' | 'unresolvedComponentCount' | 'priceValidationWarnings'>
): RabItemIntegrityNotice | null {
  const warnings = (item.priceValidationWarnings ?? []).filter(
    (w) => typeof w === 'string' && w.trim().length > 0
  );
  const count =
    typeof item.unresolvedComponentCount === 'number' && item.unresolvedComponentCount > 0
      ? item.unresolvedComponentCount
      : 0;
  const isPartial = item.isPartial === true || count > 0;
  if (!isPartial && warnings.length === 0) return null;
  return {
    isPartial,
    unresolvedComponentCount: count,
    warnings,
    badgeLabel: isPartial
      ? `Harga parsial${count > 0 ? ` — ${count} komponen belum berharga` : ''}`
      : 'Peringatan harga',
    hasDetail: warnings.length > 0,
  };
}

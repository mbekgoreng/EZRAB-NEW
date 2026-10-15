/**
 * Logika murni untuk in-cell editing RAB (dipakai RabEstimasiView).
 *
 * Diekstrak dari handler komponen agar dapat diuji unit tanpa React.
 * Aturan integritas sumber harga (2026-10-15):
 * - Edit harga manual → PRICE_MANUAL + label jujur; riwayat provenance
 *   dipertahankan dengan cara APPEND (tidak dioverwrite).
 * - Harga dikosongkan → PRICE_UNRESOLVED (bukan Rp0).
 * - Nilai harga tidak berubah → identitas sumber TIDAK disentuh.
 * - Edit kolom non-harga (deskripsi/kuantitas/satuan) → identitas sumber
 *   harga TIDAK berubah.
 */
import type { RabItem, VolumeSourceType } from '../../types';

type EditableItem = Pick<
  RabItem,
  | 'description'
  | 'volume'
  | 'unit'
  | 'unitPrice'
  | 'priceStatus'
  | 'priceSourceKind'
  | 'priceSourceLabel'
  | 'priceSourceExplanation'
  | 'volumeSource'
>;

/**
 * Hitung updates untuk edit harga manual.
 * Mengembalikan object updates (bisa hanya { unitPrice } bila nilai
 * tidak berubah — identitas sumber dipertahankan).
 */
export function computeManualPriceEdit(
  targetItem: Pick<RabItem, 'unitPrice' | 'priceSourceExplanation'>,
  editValue: string
): Partial<RabItem> {
  const raw = editValue.replace(/[^0-9.]/g, '').trim();
  const newPrice = raw === '' ? null : Math.max(0, parseFloat(raw) || 0);
  // Nilai tidak berubah → jangan sentuh identitas sumber.
  if (newPrice === targetItem.unitPrice) return { unitPrice: newPrice };
  if (newPrice == null) {
    return {
      unitPrice: null,
      priceStatus: 'PRICE_UNRESOLVED',
      priceSourceLabel: 'Harga dikosongkan pengguna — belum diisi',
    };
  }
  const prevExpl = targetItem.priceSourceExplanation;
  const prevPriceText =
    targetItem.unitPrice == null
      ? 'belum ada'
      : `Rp${Number(targetItem.unitPrice).toLocaleString('id-ID')}`;
  const note = `Diubah manual oleh pengguna (sebelumnya ${prevPriceText})`;
  return {
    unitPrice: newPrice,
    priceStatus: 'PRICE_MANUAL',
    priceSourceLabel: 'Harga input manual',
    priceSourceExplanation: prevExpl ? `${prevExpl} | ${note}` : note,
  };
}

/**
 * Bangun object updates untuk commit edit satu sel, termasuk hitung ulang
 * amount/totalPrice. Harga null → amount null (tidak pernah 0).
 */
export function buildRabCellUpdates(
  targetItem: EditableItem,
  column: string,
  editValue: string
): Partial<RabItem> {
  const updates: Partial<RabItem> = {} as any;
  if (column === 'code') (updates as any).code = editValue.trim();
  if (column === 'description')
    (updates as any).description = editValue.trim() || targetItem.description;
  if (column === 'volume')
    (updates as any).volume = Math.max(0, parseFloat(editValue.replace(',', '.')) || 0);
  if (column === 'unit') (updates as any).unit = editValue.trim() || targetItem.unit;
  if (column === 'unitPrice') Object.assign(updates, computeManualPriceEdit(targetItem, editValue));
  if (column === 'volumeSource') (updates as any).volumeSource = editValue as VolumeSourceType;

  // Recalculate amount — null price stays null (never 0).
  const finalVol = updates.volume !== undefined ? updates.volume : targetItem.volume;
  const finalPrice =
    (updates as any).unitPrice !== undefined
      ? (updates as any).unitPrice
      : (targetItem as any).unitPrice;
  (updates as any).amount = finalPrice == null ? null : Math.round(finalVol * finalPrice);
  (updates as any).totalPrice = (updates as any).amount;
  return updates;
}

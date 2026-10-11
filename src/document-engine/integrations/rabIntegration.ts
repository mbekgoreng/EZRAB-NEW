import type { RABItem, RabItem } from '../../types';

export const mapRabRows = (items: Array<RABItem | RabItem> = []) =>
  items.map((x, i) => {
    const raw = x as any;
    // Phase 2H P1-3 fix: never coerce null price to 0. Preserve null and
    // priceStatus so exporters can mark "HARGA BELUM TERSEDIA" explicitly.
    const unitPrice = raw.unitPrice ?? raw.price ?? null;
    const priceStatus =
      raw.priceStatus ?? (unitPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED');
    const quantity = raw.volume ?? raw.quantity ?? raw.qty ?? 1;
    return {
      no: i + 1,
      workItem: raw.code || raw.itemNumber || raw.description || `PEK-${i + 1}`,
      description: raw.description || raw.item || '',
      specification: raw.specification || raw.spec || '',
      unit: raw.unit || 'LS',
      quantity,
      unitPrice,
      priceStatus,
      amount:
        raw.totalPrice ?? raw.amount ?? (unitPrice != null ? quantity * unitPrice : null),
    };
  });
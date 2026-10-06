import type { RABItem, RabItem } from '../../types';

export const mapBoqRows = (items: Array<RABItem | RabItem> = []) =>
  items.map((x, i) => {
    const raw = x as any;
    return {
      no: i + 1,
      code: raw.code || raw.itemNumber || `ITEM-${i + 1}`,
      item: raw.description || raw.item || '',
      description: raw.description || raw.item || '',
      specification: raw.specification || raw.spec || '',
      unit: raw.unit || 'LS',
      quantity: raw.volume ?? raw.quantity ?? raw.qty ?? 1,
      unitPrice: raw.unitPrice ?? raw.price ?? 0,
      total: raw.totalPrice ?? raw.amount ?? (raw.volume ?? 1) * (raw.unitPrice ?? 0),
    };
  });
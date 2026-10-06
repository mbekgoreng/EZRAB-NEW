import type { RABItem, RabItem } from '../../types';

export const mapRabRows = (items: Array<RABItem | RabItem> = []) =>
  items.map((x, i) => {
    const raw = x as any;
    return {
      no: i + 1,
      workItem: raw.code || raw.itemNumber || raw.description || `PEK-${i + 1}`,
      description: raw.description || raw.item || '',
      specification: raw.specification || raw.spec || '',
      unit: raw.unit || 'LS',
      quantity: raw.volume ?? raw.quantity ?? raw.qty ?? 1,
      unitPrice: raw.unitPrice ?? raw.price ?? 0,
      amount: raw.totalPrice ?? raw.amount ?? (raw.volume ?? 1) * (raw.unitPrice ?? 0),
    };
  });
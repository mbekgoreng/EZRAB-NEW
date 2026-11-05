import type { RABItem, RabItem } from '../../types';

export const mapBoqRows = (items: Array<RABItem | RabItem> = []) =>
  items.map((x, i) => {
    const raw = x as any;
    // Batch 4 fix (same doctrine as the Phase 2H P1-3 fix in rabIntegration):
    // a missing price must NEVER be coerced to 0 here. This mapper feeds the
    // document engine's BOQ/commercial documents; coercing null -> 0 destroyed
    // the unresolved signal, so the explicit "HARGA BELUM TERSEDIA" markers in
    // xlsxGenerator could never fire and BOQ documents silently showed Rp0.
    // Preserve null and carry priceStatus through, exactly like mapRabRows.
    const unitPrice = raw.unitPrice ?? raw.price ?? null;
    const priceStatus =
      raw.priceStatus ?? (unitPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED');
    const quantity = raw.volume ?? raw.quantity ?? raw.qty ?? 1;
    return {
      no: i + 1,
      code: raw.code || raw.itemNumber || `ITEM-${i + 1}`,
      item: raw.description || raw.item || '',
      description: raw.description || raw.item || '',
      specification: raw.specification || raw.spec || '',
      unit: raw.unit || 'LS',
      quantity,
      unitPrice,
      priceStatus,
      total:
        raw.totalPrice ?? raw.amount ?? (unitPrice != null ? quantity * unitPrice : null),
    };
  });

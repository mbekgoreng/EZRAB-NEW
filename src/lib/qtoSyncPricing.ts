/**
 * P1 PRICE-1 — pure price/code resolution for QTO -> RAB sync.
 *
 * RULE: never invent a fallback price. When the caller does not supply a
 * price, the item is PRICE_UNRESOLVED (amount 0, NEEDS_VERIFICATION) — the
 * user must fill the real unit price. Previously this silently used
 * Rp125.000 + fake code 'AHSP.2026.01'.
 */
import type { PriceStatus, VerificationStatus } from '../types';

export interface QtoSyncPriceResolution {
  unitPrice: number;
  priceStatus: PriceStatus;
  verificationStatus: VerificationStatus;
  notes?: string;
}

export function resolveQtoSyncPrice(customUnitPrice?: number): QtoSyncPriceResolution {
  const hasPrice = customUnitPrice !== undefined && Number.isFinite(customUnitPrice);
  if (hasPrice) {
    return {
      unitPrice: customUnitPrice as number,
      priceStatus: 'PRICE_RESOLVED',
      verificationStatus: 'VERIFIED',
    };
  }
  return {
    unitPrice: 0,
    priceStatus: 'PRICE_UNRESOLVED',
    verificationStatus: 'NEEDS_VERIFICATION',
    notes: 'Harga belum diisi — sinkronisasi QTO tidak mengarang harga. Isi harga satuan nyata.',
  };
}

/** Never fabricate an AHSP code. Empty string = honest "no code". */
export function resolveQtoSyncCode(ahspCode?: string, qtoKode?: string): string {
  return (ahspCode || qtoKode || '').trim();
}

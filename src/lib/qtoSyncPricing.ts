/**
 * P1 PRICE-1 — pure price/code resolution for QTO -> RAB sync.
 *
 * RULE: never invent a fallback price. When the caller does not supply a
 * price, the item is PRICE_UNRESOLVED (amount 0, NEEDS_VERIFICATION) — the
 * user must fill the real unit price. Previously this silently used
 * Rp125.000 + fake code 'AHSP.2026.01'.
 *
 * ONE-PASS Task E — BATASAN KLASIFIKASI HARGA MANUAL (terdokumentasi,
 * disengaja, menunggu keputusan owner):
 * Harga yang disediakan pemanggil di jalur ini diklasifikasikan
 * PRICE_RESOLVED + VERIFIED, BUKAN PRICE_MANUAL. Normalisasi ke
 * PRICE_MANUAL TIDAK dilakukan karena:
 * (1) kontrak P1 PRICE-1 di atas menetapkan PRICE_RESOLVED untuk harga
 *     pemanggil dan diuji persis demikian (p1QtoSyncPricing.test.ts) —
 *     mengubahnya adalah perubahan kebijakan, bukan perbaikan kompatibilitas;
 * (2) laporan Price Integrity Gate §10 butir 6 mencatat penyelarasan ini
 *     sebagai KEPUTUSAN OWNER yang belum diambil;
 * (3) saat ini TIDAK ADA pemanggil UI yang meneruskan customUnitPrice ke
 *     syncQtoToRabSpreadsheet (kedua titik panggil di QtoRekapVolumeView
 *     hanya meneruskan id), jadi cabang berharga dari helper ini tidak
 *     terjangkau dari UI — dampak praktis batasan ini nol hari ini.
 * Harga resmi AHSP dan referensi pasar TIDAK PERNAH mengalir lewat helper
 * ini, jadi tidak ada harga resmi/pasar yang berisiko terlabeli manual
 * oleh jalur ini. Bila owner memutuskan penyelarasan, ubah di sini +
 * sesuaikan kontrak tes P1 secara eksplisit.
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

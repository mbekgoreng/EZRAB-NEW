/**
 * directRabPush — pemetaan hasil RAB langsung (directRab) ke payload
 * Spreadsheet. Modul MURNI (tanpa React) agar bisa dites langsung.
 *
 * Aturan kejujuran harga (perbaikan 2026-10-27, keluhan "push = Rp0"):
 * payload lama tidak membawa harga sama sekali + memaksa status
 * PRICE_UNRESOLVED, sehingga factory meng-nol-kan semua item — termasuk
 * yang di tabel chat sudah berharga resmi (mis. 3.7.4). Di sini harga
 * diambil dari calc.items (sumber yang sama dengan tabel chat,
 * dicocokkan nama+wbsCode seperti formatter) dengan status jujur:
 * - OFFICIAL + harga > 0  → PRICE_RESOLVED (harga resmi, dipertahankan)
 * - BENCHMARK / fabricated + harga > 0 → PRICE_ESTIMATED +
 *   NEEDS_VERIFICATION (tampil "Perlu verifikasi", BUKAN harga resmi)
 * - tanpa harga (UNAVAILABLE/MISMATCH/UNRESOLVED/harga 0) →
 *   PRICE_UNRESOLVED (tetap Rp0 + "Harga belum diisi")
 * Tidak ada harga yang dikarang di sini — hanya yang sudah dihitung
 * mesin parametrik.
 */
import type { DirectRabResult } from './directRab';

export type DirectRabPushPriceStatus = 'PRICE_RESOLVED' | 'PRICE_ESTIMATED' | 'PRICE_UNRESOLVED';

export interface DirectRabPushItem {
  description: string;
  volume: number;
  unit: string;
  code: string;
  category?: string;
  unitPrice?: number;
  priceStatus: DirectRabPushPriceStatus;
  verificationStatus?: 'NEEDS_VERIFICATION' | 'VERIFIED';
  volumeSource: 'AI_GENERATED';
  ahspCode?: string;
}

export function mapDirectRabPushItems(r: DirectRabResult): DirectRabPushItem[] {
  const calcByKey = new Map(
    r.calc.items.map((it) => [`${it.name}|${it.wbsCode ?? ''}`, it])
  );
  return r.generation.workItems
    .filter((w) => Number.isFinite(w.quantity) && w.quantity > 0)
    .map((wi) => {
      const w: any = wi as any;
      const calc =
        calcByKey.get(`${w.name}|${w.wbsCode ?? ''}`) ??
        r.calc.items.find((it) => it.name === w.name);
      const price =
        calc && typeof calc.unitPrice === 'number' && Number.isFinite(calc.unitPrice) && calc.unitPrice > 0
          ? calc.unitPrice
          : null;
      const estimated =
        price != null &&
        (calc?.priceStatus === 'BENCHMARK' || Boolean(w.isPriceFabricated));
      const priceStatus: DirectRabPushPriceStatus =
        price == null ? 'PRICE_UNRESOLVED' : estimated ? 'PRICE_ESTIMATED' : 'PRICE_RESOLVED';
      return {
        description: `[Chat AI] ${w.name}`,
        volume: w.quantity,
        unit: w.unit,
        code: w.ahspCode ?? w.workItemId,
        category: w.category,
        ...(price != null ? { unitPrice: price } : {}),
        priceStatus,
        ...(priceStatus === 'PRICE_ESTIMATED' ? { verificationStatus: 'NEEDS_VERIFICATION' as const } : {}),
        volumeSource: 'AI_GENERATED' as const,
        ...(w.ahspCode ? { ahspCode: w.ahspCode } : {}),
      };
    });
}

export function countPushPriceStatuses(items: Array<{ priceStatus: DirectRabPushPriceStatus }>): {
  resolved: number;
  estimated: number;
  unresolved: number;
} {
  return {
    resolved: items.filter((i) => i.priceStatus === 'PRICE_RESOLVED').length,
    estimated: items.filter((i) => i.priceStatus === 'PRICE_ESTIMATED').length,
    unresolved: items.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').length,
  };
}

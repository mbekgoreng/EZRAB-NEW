/**
 * EZRAB AI Design → QTO/RAB Bridge
 *
 * Menghubungkan HouseSpec ke engine RAB EZRAB.
 * Menggunakan rabItemFactory + AHSP resolver yang sudah ada.
 * TIDAK mengirim ke proyek tanpa persetujuan eksplisit pengguna.
 */

import type { HouseSpec } from './specEngine';
import type { SpreadsheetRow } from './DesignSpreadsheet';

export interface DesignWorkItem {
  // Identitas (untuk QTO/RAB)
  code: string;           // kode internal desain, mis. "DSN-W-001"
  description: string;
  category: string;
  /** Kelompok WBS asal di spreadsheet desain (mis. '01 Persiapan'). */
  group?: string;
  unit: string;
  volume: number;
  // Provenance
  source: 'AI_DESIGN_GEOMETRY';
  sourceDetail: string;   // mis. "Dinding bata perimeter: 2×(6+15)×0.15×3.2"
  designRowId: string;    // referensi ke spreadsheet row
  // Status harga (selalu null di tahap ini — bukan 0)
  unitPrice: null;
  priceStatus: 'PRICE_UNRESOLVED';
  // Review
  needsReview: boolean;
  reviewReason: string;
}

/**
 * Konversi baris spreadsheet kategori PEKERJAAN → DesignWorkItem.
 * Hanya baris PEKERJAAN yang menjadi item kerja; RUANG/PROYEK adalah info.
 */
export function spreadsheetToWorkItems(rows: SpreadsheetRow[]): DesignWorkItem[] {
  return rows
    .filter(r => r.kategori === 'PEKERJAAN')
    .map(r => ({
      code: `DSN-${r.kode}`,
      description: r.uraian,
      category: 'AI_DESIGN',
      group: r.kelompok,
      unit: r.satuan,
      volume: r.volume,
      source: 'AI_DESIGN_GEOMETRY' as const,
      sourceDetail: `${r.uraian}: ${r.panjang}×${r.lebar}${r.tinggi ? `×${r.tinggi}` : ''} ${r.satuan}`,
      designRowId: r.id,
      unitPrice: null,
      priceStatus: 'PRICE_UNRESOLVED' as const,
      needsReview: r.status === 'PERLU_REVIEW',
      reviewReason: r.status === 'PERLU_REVIEW'
        ? 'Volume dari geometri konsep — perlu verifikasi sebelum jadi RAB final'
        : '',
    }));
}

/**
 * Validasi item sebelum dikirim ke RAB.
 * Mengembalikan item yang lolos dan yang ditolak (dengan alasan).
 */
export function validateWorkItemsForRab(items: DesignWorkItem[]): {
  valid: DesignWorkItem[];
  rejected: Array<{ item: DesignWorkItem; reason: string }>;
} {
  const valid: DesignWorkItem[] = [];
  const rejected: Array<{ item: DesignWorkItem; reason: string }> = [];

  for (const item of items) {
    if (!item.description || item.description.trim().length < 3) {
      rejected.push({ item, reason: 'Deskripsi terlalu pendek' });
      continue;
    }
    if (!Number.isFinite(item.volume) || item.volume <= 0) {
      rejected.push({ item, reason: `Volume tidak valid: ${item.volume}` });
      continue;
    }
    if (!item.unit || !item.unit.trim()) {
      rejected.push({ item, reason: 'Satuan kosong' });
      continue;
    }
    valid.push(item);
  }

  return { valid, rejected };
}

/**
 * Ringkasan untuk persetujuan pengguna.
 */
export function buildApprovalSummary(spec: HouseSpec, items: DesignWorkItem[]): {
  totalItems: number;
  totalVolume: number;
  needsReviewCount: number;
  unresolvedPriceCount: number;
  lines: string[];
} {
  const lines = [
    `Desain: ${spec.buildingType} ${spec.buildingWidthM}×${spec.buildingLengthM} m (${spec.buildingAreaM2.toFixed(1)} m²)`,
    `Ruang: ${spec.rooms.length} (${spec.totalRoomAreaM2.toFixed(1)} m²)`,
    `Item pekerjaan: ${items.length}`,
    `Harga: ${items.length} item BELUM ADA HARGA (null, bukan Rp0) — perlu AHSP/manual setelah disetujui`,
  ];
  if (spec.assumptions.length > 0) {
    lines.push(`Asumsi: ${spec.assumptions.length} (dapat diedit)`);
  }
  if (spec.warnings.length > 0) {
    lines.push(`⚠ Peringatan: ${spec.warnings.length} — periksa sebelum lanjut`);
  }

  return {
    totalItems: items.length,
    totalVolume: items.reduce((s, i) => s + i.volume, 0),
    needsReviewCount: items.filter(i => i.needsReview).length,
    unresolvedPriceCount: items.length, // semua unresolved di tahap desain
    lines,
  };
}

/**
 * Rincian komponen input manual (R2, perintah user 2026-10-27): pekerjaan
 * manual tidak lagi hanya harga satuan lump-sum — user bisa menyusunnya
 * dari komponen upah / material / alat, masing-masing dengan koefisien ×
 * harga satuan, persis seperti analisis AHSP.
 *
 * Aturan kejujuran (mengikuti pola modal ini):
 * - Baris LENGKAP = nama terisi + koefisien > 0 + harga ≥ 0 (harga 0 = gratis,
 *   sah). Hanya baris lengkap yang dihitung.
 * - Baris BELUM LENGKAP tidak diam-diam diabaikan: penyimpanan diblokir
 *   sampai dilengkapi atau dihapus (lihat incompleteCount).
 * - Bila ≥ 1 baris lengkap ada, Harga Satuan = total komponen (upah +
 *   material + alat) dan input lump-sum dinonaktifkan — satu sumber harga,
 *   bukan dua angka yang bisa bertentangan.
 * - Total per jenis dipetakan ke field RabItem yang sudah ada:
 *   upah → laborPrice, material → materialPrice, alat → equipmentPrice.
 *   Detail baris (nama/koefisien per komponen) tidak disimpan di RabItem
 *   — yang tersimpan adalah total per jenis, sama seperti AHSP.
 */

export type ManualComponentKind = 'upah' | 'material' | 'alat';

export interface ManualComponentRow {
  id: string;
  kind: ManualComponentKind;
  /** Uraian komponen, mis. "Tukang batu", "Semen PC 50 kg", "Concrete mixer". */
  name: string;
  /** Koefisien per 1 satuan pekerjaan (mis. 0,15 OH per m²). Null = belum diisi. */
  coef: number | null;
  /** Satuan komponen (OH, kg, m², jam, ls, ...). */
  unit: string;
  /** Harga satuan komponen (Rp). Null = belum diisi. */
  price: number | null;
}

export interface ManualComponentSummary {
  labor: number;
  material: number;
  equipment: number;
  /** labor + material + equipment. */
  total: number;
  /** Jumlah baris lengkap (yang dihitung). */
  completeCount: number;
  /** Jumlah baris belum lengkap (menghalangi simpan). */
  incompleteCount: number;
}

export const MANUAL_COMPONENT_KINDS: Array<{ kind: ManualComponentKind; label: string }> = [
  { kind: 'upah', label: 'Upah' },
  { kind: 'material', label: 'Material' },
  { kind: 'alat', label: 'Alat' },
];

/** Subtotal satu baris, atau null bila baris belum lengkap. */
export function manualComponentSubtotal(row: ManualComponentRow): number | null {
  if (row.name.trim() === '') return null;
  if (row.coef == null || !Number.isFinite(row.coef) || row.coef <= 0) return null;
  if (row.price == null || !Number.isFinite(row.price) || row.price < 0) return null;
  return row.coef * row.price;
}

export function sumManualComponents(rows: ManualComponentRow[]): ManualComponentSummary {
  let labor = 0;
  let material = 0;
  let equipment = 0;
  let completeCount = 0;
  let incompleteCount = 0;
  for (const row of rows) {
    const sub = manualComponentSubtotal(row);
    if (sub == null) {
      incompleteCount++;
      continue;
    }
    completeCount++;
    if (row.kind === 'upah') labor += sub;
    else if (row.kind === 'material') material += sub;
    else equipment += sub;
  }
  return {
    labor,
    material,
    equipment,
    total: labor + material + equipment,
    completeCount,
    incompleteCount,
  };
}

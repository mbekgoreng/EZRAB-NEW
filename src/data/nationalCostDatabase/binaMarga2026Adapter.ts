/**
 * BINA MARGA 2026 — COMPATIBILITY ADAPTER
 * =======================================
 * Provides the legacy export names (OFFICIAL_BM_2026_*) derived from the new
 * MASTER_AHSP_BINA_MARGA_2026, so existing consumers (price resolver, hooks)
 * work without rewrite.
 *
 * Source: binaMarga2026Master.generated.ts (not the old price files).
 */

import { BINA_MARGA_2026_MASTER } from './binaMarga2026Master.generated';
import { isQuarantined } from './ahspQuarantine';

export interface BinaMargaPriceEntry {
  code: string;
  name: string;
  unit: string;
  price: number;
  category: 'labor' | 'material' | 'equipment';
  sourceSheet: string;
  sourceRow: number;
}

function toEntry(
  code: string, name: string, unit: string,
  price: number | null, category: 'labor' | 'material' | 'equipment',
): BinaMargaPriceEntry | null {
  if (price == null) return null;
  return { code, name, unit, price, category, sourceSheet: 'MASTER_AHSP_BINA_MARGA_2026', sourceRow: 0 };
}

const labor: BinaMargaPriceEntry[] = [];
const material: BinaMargaPriceEntry[] = [];
const equipment: BinaMargaPriceEntry[] = [];

/**
 * P0 (2026-10-26): item karantina TIDAK BOLEH menyumbang record harga resource
 * maupun entri DHSP. Tanpa filter ini, komponen sentinel baris korup (mis. E.2–E.8:
 * unitPrice = 2) masuk ke indeks resolver dan dapat memenangi seleksi harga
 * untuk item sehat yang memakai kode resource sama (kasus terbukti: E13/E19 di E.1).
 * Daftar katalog lengkap (BINA_MARGA_AHSP_2026_OFFICIAL di bawah) sengaja TIDAK
 * difilter — repository-lah yang menutup akses UI ke item karantina; yang
 * ditutup di sini hanyalah jalur pembentukan harga.
 */
const PRICING_MASTER = BINA_MARGA_2026_MASTER.filter((item) => !isQuarantined(item.code));

for (const item of PRICING_MASTER) {
  for (const c of item.laborComponents) {
    const e = toEntry(c.resourceCode, c.description, c.unit, c.unitPrice, 'labor');
    if (e) labor.push(e);
  }
  for (const c of item.materialComponents) {
    const e = toEntry(c.resourceCode, c.description, c.unit, c.unitPrice, 'material');
    if (e) material.push(e);
  }
  for (const c of item.equipmentComponents) {
    const e = toEntry(c.resourceCode, c.description, c.unit, c.unitPrice, 'equipment');
    if (e) equipment.push(e);
  }
}

// Deduplicate by code+name, keep first
function dedupe(arr: BinaMargaPriceEntry[]): BinaMargaPriceEntry[] {
  const seen = new Set<string>();
  return arr.filter((e) => {
    const k = `${e.code}|${e.name}|${e.unit}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const OFFICIAL_BM_2026_LABOR = dedupe(labor);
export const OFFICIAL_BM_2026_MATERIALS = dedupe(material);
export const OFFICIAL_BM_2026_EQUIPMENT = dedupe(equipment);

/** DHSP map: code -> unit price (null prices excluded; quarantined items excluded — see PRICING_MASTER). */
export const OFFICIAL_BM_2026_DHSP_MAP = new Map<string, number>();
for (const item of PRICING_MASTER) {
  if (item.unitPrice != null) {
    OFFICIAL_BM_2026_DHSP_MAP.set(item.code, item.unitPrice);
    if (item.codeNormalized && item.codeNormalized !== item.code) {
      OFFICIAL_BM_2026_DHSP_MAP.set(item.codeNormalized, item.unitPrice);
    }
  }
}

/** Canonical item list (replaces BINA_MARGA_AHSP_2026_OFFICIAL). */
export const BINA_MARGA_AHSP_2026_OFFICIAL = BINA_MARGA_2026_MASTER.map((item) => ({
  ...item,
  // Map to OfficialAHSPItem-compatible shape
  title: item.name,
  standardCode: item.standardCode,
} as unknown as import('./binaMargaOfficialTypes').OfficialAHSPItem));

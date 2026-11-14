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
import type { BinaMarga2026Component } from './binaMarga2026Master.generated';
import { isQuarantined } from './ahspQuarantine';
import {
  BINA_MARGA_2026_SOURCE_METADATA,
  type CoefficientReadability,
  type ItemReadability,
  type OfficialAHSPComponent,
  type OfficialAHSPItem,
} from './binaMargaOfficialTypes';
import type { AHSPVerificationStatus } from './types';

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

/**
 * D-62 (Batch B, 2026-11-14) — component field mapping.
 * Raw master components are `{ no, category, resourceCode, description, unit,
 * coefficient, unitPrice, amount, validationStatus }`; `OfficialAHSPComponent`
 * expects `{ id, code, name, unit, coefficient, unitPrice, total,
 * resourceType, index, componentType, readability, raw }`. The previous code
 * spread the raw items and blind-cast them, so every adapted component had
 * `code`/`name` === undefined: the price resolver got no code/name to resolve
 * (all 38 weir components PRICE_MISSING) and the warning path embedded the
 * literal string "undefined" into the UI ("undefined (labor)").
 *
 * Mapping (deterministic, no value invented):
 *   resourceCode → code · description → name · category → componentType
 *   (LABOR→TENAGA, MATERIAL→BAHAN, EQUIPMENT→PERALATAN) · amount → total.
 * A component with no code/name in the source is impossible in this master
 * (verified 2026-11-14: 0 empty resourceCode/description in 6.835 rows), but
 * the mapping still falls back to an explicit "Komponen tanpa nama" label
 * rather than ever emitting undefined.
 *
 * Readability follows the `CoefficientReadability` definition: a zero
 * coefficient is LOST_COEF only when its amount is > 0 ("printed as 0 but
 * total > 0"). A true zero row (coef 0, amount 0 — e.g. "M3 Paku" in the
 * concrete items, genuinely unused in that mix) is OK. Only 4 rows in the
 * master are genuinely lost (G.222–G.225, E23 Water Tank Truck, amount
 * Rp21,12 with coef 0) — those 4 items are UNREADABLE and the definition
 * adapter rejects them, as designed.
 */
function componentReadability(c: BinaMarga2026Component): CoefficientReadability {
  const coef = c.coefficient;
  const amount = c.amount ?? 0;
  if (coef == null || coef === 0) return amount > 0 ? 'LOST_COEF' : 'OK';
  if (!Number.isFinite(coef)) return 'LOST_COEF';
  if (Math.abs(coef) < 0.001) return 'TINY_COEF';
  return 'OK';
}

const COMPONENT_TYPE_MAP = {
  LABOR: 'TENAGA',
  MATERIAL: 'BAHAN',
  EQUIPMENT: 'PERALATAN',
} as const;

function toOfficialComponent(
  itemCode: string,
  sourcePage: number | null,
  c: BinaMarga2026Component,
  index: number,
  kind: 'LABOR' | 'MATERIAL' | 'EQUIPMENT'
): OfficialAHSPComponent {
  const code = (c.resourceCode || '').trim();
  const name = (c.description || '').trim();
  return {
    id: `BM-${itemCode}-C${c.no}`,
    code: code || `TANPA-KODE-${c.no}`,
    name: name || 'Komponen tanpa nama (data tidak lengkap)',
    unit: c.unit || '',
    coefficient: c.coefficient ?? 0,
    unitPrice: c.unitPrice,
    total: c.amount,
    resourceType: kind,
    index,
    componentType: COMPONENT_TYPE_MAP[kind],
    readability: componentReadability(c),
    raw: `${c.no} ${name || '(tanpa nama)'} (${code || 'tanpa kode'}) ${c.unit || ''} ${c.coefficient ?? '—'}`,
    rawLine: `${c.no} ${name || '(tanpa nama)'} (${code || 'tanpa kode'}) ${c.unit || ''} ${c.coefficient ?? '—'}`,
    sourcePage: sourcePage ?? undefined,
  };
}

function toOfficialItem(item: (typeof BINA_MARGA_2026_MASTER)[number]): OfficialAHSPItem {
  const labor = item.laborComponents.map((c, i) => toOfficialComponent(item.code, item.sourcePdfPage, c, i + 1, 'LABOR'));
  const material = item.materialComponents.map((c, i) => toOfficialComponent(item.code, item.sourcePdfPage, c, i + 1, 'MATERIAL'));
  const equipment = item.equipmentComponents.map((c, i) => toOfficialComponent(item.code, item.sourcePdfPage, c, i + 1, 'EQUIPMENT'));

  const all = [...labor, ...material, ...equipment];
  const readability: ItemReadability = all.some((c) => c.readability === 'LOST_COEF')
    ? 'UNREADABLE'
    : all.some((c) => c.readability === 'TINY_COEF')
      ? 'DEGRADED'
      : 'OK';

  const status: AHSPVerificationStatus =
    item.validationStatus === 'VERIFIED' ? 'VERIFIED'
      : item.validationStatus === 'NEEDS_REVIEW' ? 'REVIEW'
        : 'UNVERIFIED';

  const division = /^(\d+)/.exec(item.standardCode || '')?.[1];
  const warnings: string[] = [];
  if (item.validationStatus !== 'VERIFIED') {
    warnings.push(`Validasi master: ${item.validationStatus}; ${item.priceValidation}`);
  }
  if (readability === 'UNREADABLE') {
    warnings.push('Satu atau lebih koefisien hilang (koefisien 0 tetapi jumlah > 0) — item tidak dapat dipakai untuk perhitungan otomatis.');
  }

  return {
    ...item,
    // D-55 narrowing (2026-11-14): TIDAK ADA override satuan di sini.
    // Adapter adalah dataset MESIN (tanpa konsumen tampilan — hanya
    // engine + tes) dan `unit` harus tetap verbatim master ("Meter
    // Kubik", "Meter Panjang") — dipin costPolicyEngine.test.ts dan
    // menjadi perilaku resolusi harga pra-G2 (s2: G.166 UNRESOLVED).
    // Override resolver di sini adalah regresi (laporan 08 §8). Satuan
    // tampil yang diperbaiki tersedia sebagai `unitDisplay` pada item
    // registry nasional (masterRegistry) untuk lapisan tampilan;
    // adapter tidak membutuhkannya.
    // Map to OfficialAHSPItem-compatible shape
    id: `BM-2026-${item.code}`,
    title: item.name,
    standardCode: item.standardCode,
    domain: 'BINA_MARGA',
    category: division ? `Divisi ${division}` : 'Bina Marga',
    version: BINA_MARGA_2026_SOURCE_METADATA.version,
    year: BINA_MARGA_2026_SOURCE_METADATA.documentYear,
    normativeStatus: 'UNSPECIFIED',
    method: 'UNSPECIFIED',
    sourceDocument: 'Lampiran V SE DJBK No. 47/SE/Dk/2026',
    headerPage: item.sourcePdfPage ?? 0,
    analisaPage: all.length > 0 ? (item.sourcePdfPage ?? null) : null,
    numberFormat: null,
    status,
    laborComponents: labor,
    materialComponents: material,
    equipmentComponents: equipment,
    totalLabor: null,
    totalMaterial: null,
    totalEquipment: null,
    totalABC: null,
    overheadProfitPercent: null,
    overheadProfitAmount: null,
    readability,
    warnings,
    // The master carries no per-item update date; use the dataset's
    // effective date (source metadata) rather than inventing one.
    lastUpdated: BINA_MARGA_2026_SOURCE_METADATA.effectiveDate,
    dataQualityScore: item.validationStatus === 'VERIFIED' ? 100 : 50,
  } as unknown as OfficialAHSPItem;
}

/** Canonical item list (replaces BINA_MARGA_AHSP_2026_OFFICIAL). */
export const BINA_MARGA_AHSP_2026_OFFICIAL: OfficialAHSPItem[] =
  BINA_MARGA_2026_MASTER.map(toOfficialItem);

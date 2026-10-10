/**
 * DED AI ESTIMATE — Calculator / Finalizer (src/ai-tools/ded-ai-estimate/calculator.ts)
 * Deterministic finalization: subtotals and grand totals computed in CODE.
 * NEVER `Rp0 + SUCCESS`. Coverage is honest.
 */

import { DedAiItem, DedAiCategorySummary, DedAiOutput } from './types';
import { isSaneEstimate } from './pricing';
import { shapeForUnit } from './quantity';

/**
 * FASE DED-FIX TASK 3 — validasi kuantitas sebelum masuk RAB.
 * Batas absolut sebagai perlindungan tambahan; bukan satu-satunya validasi.
 * Volume besar bisa valid untuk infrastruktur — batas ini hanya memblokir
 * nilai yang secara fisik tidak masuk akal untuk satu item pekerjaan.
 */
const ABSOLUTE_QUANTITY_CAP: Record<string, number> = {
  VOLUME: 1_000_000, // 1 juta m³ per item — di atas ini pasti salah input/satuan
  AREA: 10_000_000, // 10 juta m²
  LENGTH: 1_000_000, // 1 juta m
  COUNT: 10_000_000,
};

export type QuantityVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Elemen struktural yang WAJIB dihitung sebagai VOLUME (m³), bukan panjang/luas.
 * Jika AI mengembalikan satuan panjang untuk elemen ini, itu adalah kesalahan fatal.
 */
const VOLUME_REQUIRED_KEYWORDS = [
  'kolom', 'column',
  'pondasi', 'footing',
  'sloof', 'ringbalk', 'ring balk', 'balok', 'beam',
  'pelat', 'slab', 'dak',
  'pile cap', 'pilecap',
];

/**
 * Elemen yang WAJIB dihitung sebagai LUAS (m²).
 */
const AREA_REQUIRED_KEYWORDS = [
  'dinding', 'wall', 'pasangan bata',
  'plester', 'aci', 'plaster',
  'lantai', 'floor', 'keramik',
  'atap', 'roof', 'genteng',
  'plafon', 'ceiling',
  'cat', 'paint',
];

/**
 * Cek apakah nama item menunjukkan elemen yang butuh satuan volume.
 */
export function requiresVolumeUnit(name: string): boolean {
  const lower = name.toLowerCase();
  return VOLUME_REQUIRED_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Cek apakah nama item menunjukkan elemen yang butuh satuan luas.
 */
export function requiresAreaUnit(name: string): boolean {
  const lower = name.toLowerCase();
  return AREA_REQUIRED_KEYWORDS.some((kw) => lower.includes(kw));
}

export function validateQuantity(
  item: Pick<DedAiItem, 'quantity' | 'units' | 'quantitySource'> & { name?: string }
): QuantityVerdict {
  const q = item.quantity;
  if (q === null || q === undefined) return { ok: false, reason: 'Kuantitas belum terhitung.' };
  if (!Number.isFinite(q)) return { ok: false, reason: 'Kuantitas tidak valid (non-finite).' };
  if (q <= 0) return { ok: false, reason: 'Kuantitas harus lebih dari nol.' };
  // FASE DED-FIX: AI_INFERENCE/ASSUMPTION BOLEH lolos dengan badge "Perlu Ditinjau"
  // di UI (bukan ditolak total) — mode Cepat memang bekerja dari estimasi model.
  // Yang ditolak: UNRESOLVED (tidak ada dasar sama sekali).
  if (item.quantitySource === 'UNRESOLVED') {
    return { ok: false, reason: 'Kuantitas unresolved; perlu verifikasi.' };
  }
  const shape = shapeForUnit(item.units);

  // REGRESSION FIX Type 36: elemen struktural dengan satuan salah → TOLAK
  // Contoh: "Kolom Praktis" dengan 0.15 m' (seharusnya 0.81 m³)
  if (item.name) {
    if (requiresVolumeUnit(item.name) && shape !== 'VOLUME') {
      return {
        ok: false,
        reason: `"${item.name}" adalah elemen volume tetapi satuannya "${item.units}" (${shape}). ` +
          `Seharusnya dalam m³. Data ini tidak valid dan tidak masuk total.`,
      };
    }
    if (requiresAreaUnit(item.name) && shape !== 'AREA') {
      return {
        ok: false,
        reason: `"${item.name}" adalah elemen luas tetapi satuannya "${item.units}" (${shape}). ` +
          `Seharusnya dalam m². Data ini tidak valid dan tidak masuk total.`,
      };
    }
  }

  const cap = ABSOLUTE_QUANTITY_CAP[shape] ?? 1_000_000;
  if (q > cap) {
    return { ok: false, reason: `Kuantitas ${q} melebihi batas wajar (${cap}) untuk satuan ${item.units}; kemungkinan salah satuan.` };
  }
  return { ok: true };
}

export class DedAiCalculator {
  public static finalizeItems(items: DedAiItem[]): DedAiItem[] {
    return items.map((it) => {
      const q = it.quantity;
      const p = it.unitPrice;
      const verdict = validateQuantity(it);
      // FASE DED-FIX: kuantitas ditolak -> subtotal null, stage REJECTED, tidak disamarkan jadi Rp0.
      if (!verdict.ok) {
        return {
          ...it,
          subtotal: null,
          stage: 'REJECTED' as const,
          quantityNote: it.quantityNote || verdict.reason,
        };
      }
      if (q !== null && p !== null && isSaneEstimate(p) && q > 0) {
        return { ...it, subtotal: Math.round(q * p), stage: 'CALCULATED' as const };
      }
      return { ...it, subtotal: null, stage: 'PARSE' as const };
    });
  }

  public static buildCategorySummaries(items: DedAiItem[]): DedAiCategorySummary[] {
    const map = new Map<string, DedAiCategorySummary>();
    for (const it of items) {
      const key = it.category || 'Lain-lain';
      const cur = map.get(key) || { category: key, subtotal: 0, itemCount: 0, resolvedCount: 0, unresolvedCount: 0 };
      cur.itemCount += 1;
      const resolved = it.quantity !== null && it.unitPrice !== null && it.subtotal !== null;
      if (resolved) {
        cur.subtotal += it.subtotal!;
        cur.resolvedCount += 1;
      } else {
        cur.unresolvedCount += 1;
      }
      map.set(key, cur);
    }
    return Array.from(map.values());
  }

  public static buildOutput(base: {
    jobId: string;
    projectType: string;
    mode: 'FAST' | 'DETAIL';
    projectName: string;
    fileName?: string;
    pageCount: number;
    items: DedAiItem[];
  }): DedAiOutput {
    const finalized = this.finalizeItems(base.items);
    const categorySummaries = this.buildCategorySummaries(finalized);
    const grandTotal = categorySummaries.reduce((acc, c) => acc + c.subtotal, 0);
    const itemsWithQuantity = finalized.filter((i) => i.quantity !== null && i.quantity > 0).length;
    const itemsWithPrice = finalized.filter((i) => i.unitPrice !== null && i.unitPrice! > 0).length;
    const fully = finalized.filter((i) => i.subtotal !== null && i.subtotal > 0).length;
    return {
      success: true,
      jobId: base.jobId,
      projectType: base.projectType,
      mode: base.mode,
      projectName: base.projectName,
      fileName: base.fileName,
      pageCount: base.pageCount,
      items: finalized,
      grandTotal,
      categorySummaries,
      coverage: {
        totalItems: finalized.length,
        itemsWithQuantity,
        itemsWithPrice,
        itemsFullyResolved: fully,
        itemsUnresolved: finalized.length - fully,
      },
    };
  }
}

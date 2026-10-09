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

export function validateQuantity(item: Pick<DedAiItem, 'quantity' | 'units' | 'quantitySource'>): QuantityVerdict {
  const q = item.quantity;
  if (q === null || q === undefined) return { ok: false, reason: 'Kuantitas belum terhitung.' };
  if (!Number.isFinite(q)) return { ok: false, reason: 'Kuantitas tidak valid (non-finite).' };
  if (q <= 0) return { ok: false, reason: 'Kuantitas harus lebih dari nol.' };
  // Kuantitas dari inferensi/asumsi AI tidak boleh dianggap terverifikasi.
  if (item.quantitySource === 'AI_INFERENCE' || item.quantitySource === 'ASSUMPTION') {
    return { ok: false, reason: 'Kuantitas dari inferensi/asumsi AI; perlu ditinjau.' };
  }
  if (item.quantitySource === 'UNRESOLVED') {
    return { ok: false, reason: 'Kuantitas unresolved; perlu verifikasi.' };
  }
  const shape = shapeForUnit(item.units);
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

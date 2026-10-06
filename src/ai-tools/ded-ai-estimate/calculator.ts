/**
 * DED AI ESTIMATE — Calculator / Finalizer (src/ai-tools/ded-ai-estimate/calculator.ts)
 * Deterministic finalization: subtotals and grand totals computed in CODE.
 * NEVER `Rp0 + SUCCESS`. Coverage is honest.
 */

import { DedAiItem, DedAiCategorySummary, DedAiOutput } from './types';
import { isSaneEstimate } from './pricing';

export class DedAiCalculator {
  public static finalizeItems(items: DedAiItem[]): DedAiItem[] {
    return items.map((it) => {
      const q = it.quantity;
      const p = it.unitPrice;
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

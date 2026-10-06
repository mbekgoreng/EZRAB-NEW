/**
 * EZRAB AI ESTIMATE ONLY — Deterministic Calculator
 * 
 * Code handles ALL math. AI provides estimates, code calculates.
 * subtotal = quantity × estimatedUnitPrice
 * total = SUM(all valid subtotals)
 * 
 * AI = estimator
 * Code = calculator
 */

import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import {
  AiEstimateWorkItem,
  AiEstimateSummary,
  AiEstimateCategoryBreakdown,
  ConfidenceLevel,
} from './types';

export class AiEstimateCalculator {
  /**
   * Calculate subtotal for a single work item.
   * Returns null if quantity is blocked, or if quantity or price is missing.
   * DETERMINISTIC: acceptedQuantity × price, no AI involved.
   */
  public static calculateSubtotal(item: AiEstimateWorkItem): number | null {
    // 1. Strictly block items flagged as BLOCKED_FROM_TOTAL or BLOCKED
    if (item.status === 'BLOCKED' || item.quantityStatus === 'BLOCKED_FROM_TOTAL') return null;

    // 2. Missing quantity yields null (not 0)
    const effectiveQty = item.acceptedQuantity ?? item.quantity;
    if (effectiveQty === null || isNaN(effectiveQty) || effectiveQty <= 0) return null;

    // 3. Unresolved price yields null (not Rp0)
    if (item.priceStatus === 'PRICE_UNRESOLVED' || item.priceSource === 'UNRESOLVED') return null;
    const effectivePrice = item.unitPrice ?? item.estimatedUnitPrice ?? null;
    if (effectivePrice === null || isNaN(effectivePrice) || effectivePrice <= 0) return null;

    return SafeDecimalEngine.safeMultiply(effectiveQty, effectivePrice, 0);
  }

  /**
   * Calculate subtotals for all items.
   * Mutates items in place with deterministic calculation.
   */
  public static calculateAllSubtotals(items: AiEstimateWorkItem[]): void {
    for (const item of items) {
      const subtotal = this.calculateSubtotal(item);
      item.subtotal = subtotal;
      item.estimatedSubtotal = subtotal;
      if (item.unitPrice === undefined || item.unitPrice === null) {
        item.unitPrice = item.estimatedUnitPrice ?? null;
      }
      if (item.estimatedUnitPrice === undefined || item.estimatedUnitPrice === null) {
        item.estimatedUnitPrice = item.unitPrice ?? null;
      }

      // Update provenance
      if (item.provenance) {
        item.provenance.subtotalSource = subtotal !== null
          ? 'DETERMINISTIC_CALCULATION'
          : 'UNRESOLVED';
      }
    }
  }

  /**
   * Calculate grand total from all valid subtotals.
   * DETERMINISTIC: SUM of all non-null subtotals from ACCEPTED items.
   */
  public static calculateGrandTotal(items: AiEstimateWorkItem[]): number {
    let total = 0;
    for (const item of items) {
      // Exclude blocked items that cannot contribute to grand total
      if (item.status === 'BLOCKED' || item.quantityStatus === 'BLOCKED_FROM_TOTAL') continue;
      const sub = item.subtotal ?? item.estimatedSubtotal ?? null;
      if (sub !== null && sub > 0) {
        total = SafeDecimalEngine.safeAdd(total, sub);
      }
    }
    return total;
  }

  /**
   * Calculate range estimates based on confidence levels.
   * Low confidence = wider range, high confidence = narrower range.
   */
  public static calculateRange(
    total: number,
    items: AiEstimateWorkItem[]
  ): { low: number; high: number } {
    const overallConfidence = this.determineOverallConfidence(items);

    // Range multipliers based on confidence
    const rangeMap: Record<ConfidenceLevel, { low: number; high: number }> = {
      HIGH: { low: 0.90, high: 1.10 },
      MEDIUM: { low: 0.80, high: 1.25 },
      LOW: { low: 0.65, high: 1.50 },
    };

    const range = rangeMap[overallConfidence];
    return {
      low: Math.round(total * range.low),
      high: Math.round(total * range.high),
    };
  }

  /**
   * Determine overall confidence from item-level confidences.
   */
  public static determineOverallConfidence(items: AiEstimateWorkItem[]): ConfidenceLevel {
    if (items.length === 0) return 'LOW';

    const resolvedItems = items.filter(i => i.estimatedSubtotal !== null);
    if (resolvedItems.length === 0) return 'LOW';

    const highCount = resolvedItems.filter(i => i.confidence === 'HIGH').length;
    const mediumCount = resolvedItems.filter(i => i.confidence === 'MEDIUM').length;
    const lowCount = resolvedItems.filter(i => i.confidence === 'LOW').length;

    const highRatio = highCount / resolvedItems.length;
    const lowRatio = lowCount / resolvedItems.length;

    if (highRatio >= 0.6 && lowRatio <= 0.1) return 'HIGH';
    if (lowRatio >= 0.4) return 'LOW';
    return 'MEDIUM';
  }

  /**
   * Build summary from calculated items.
   */
  public static buildSummary(items: AiEstimateWorkItem[]): AiEstimateSummary {
    const total = this.calculateGrandTotal(items);
    const range = this.calculateRange(total, items);
    const confidence = this.determineOverallConfidence(items);

    return {
      estimatedTotal: total,
      rangeLow: range.low,
      rangeHigh: range.high,
      confidence,
      status: 'PRELIMINARY',
    };
  }

  /**
   * Build category breakdown for the summary view.
   */
  public static buildCategoryBreakdown(items: AiEstimateWorkItem[]): AiEstimateCategoryBreakdown[] {
    const catMap = new Map<string, AiEstimateWorkItem[]>();

    for (const item of items) {
      if (!catMap.has(item.category)) {
        catMap.set(item.category, []);
      }
      catMap.get(item.category)!.push(item);
    }

    const breakdown: AiEstimateCategoryBreakdown[] = [];
    for (const [category, catItems] of catMap) {
      const resolved = catItems.filter(i => typeof i.estimatedSubtotal === 'number' && i.estimatedSubtotal > 0);
      const unresolved = catItems.filter(i => typeof i.estimatedSubtotal !== 'number' || i.estimatedSubtotal <= 0);

      let subtotal = 0;
      for (const item of resolved) {
        subtotal = SafeDecimalEngine.safeAdd(subtotal, item.estimatedSubtotal!);
      }

      breakdown.push({
        category,
        subtotal,
        itemCount: catItems.length,
        resolvedCount: resolved.length,
        unresolvedCount: unresolved.length,
      });
    }

    return breakdown;
  }

  /**
   * Build output statistics.
   */
  public static buildStats(items: AiEstimateWorkItem[]) {
    return {
      totalItems: items.length,
      detectedItems: items.filter(i => i.detectionStatus === 'DETECTED').length,
      inferredItems: items.filter(i => i.detectionStatus === 'INFERRED').length,
      assumedItems: items.filter(i => i.detectionStatus === 'ASSUMED').length,
      unresolvedItems: items.filter(i =>
        i.detectionStatus === 'UNRESOLVED' || i.quantity === null || i.estimatedUnitPrice === null || i.quantityStatus === 'UNRESOLVED'
      ).length,
      acceptedItems: items.filter(i => i.quantityStatus === 'ACCEPTED' && i.quantity !== null).length,
      blockedItems: items.filter(i => i.quantityStatus === 'BLOCKED_FROM_TOTAL').length,
      warningCount: items.reduce((sum, i) => sum + i.warnings.length, 0),
      highConfidenceCount: items.filter(i => i.confidence === 'HIGH' && i.quantityStatus !== 'BLOCKED_FROM_TOTAL').length,
      mediumConfidenceCount: items.filter(i => i.confidence === 'MEDIUM').length,
      lowConfidenceCount: items.filter(i => i.confidence === 'LOW' || i.quantityStatus === 'BLOCKED_FROM_TOTAL').length,
    };
  }
}

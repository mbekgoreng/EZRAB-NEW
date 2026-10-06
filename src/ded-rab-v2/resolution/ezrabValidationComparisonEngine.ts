/**
 * EZRAB — Database Validation Comparison Engine
 *
 * Implements "🏗️ Validasi dengan Database EZRAB" (Section 30 & 31):
 * - Compares autonomous AI RAB output against strict EZRAB Standard Database
 * - Calculates grand total and item-level differences (+/- IDR)
 * - NEVER overwrites AI RAB: stores side-by-side comparison for informed user decision
 */

import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';

export interface ItemComparisonResult {
  itemId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  aiEstimateUnitPrice: number;
  aiEstimateTotal: number;
  aiProvenance: string;
  ezrabStandardUnitPrice: number | null;
  ezrabStandardTotal: number | null;
  ezrabAhspCode: string | null;
  status: 'EXACT_MATCH' | 'PRICE_DIFFERENCE' | 'UNRESOLVED_IN_STANDARD';
  differenceAmount: number | null; // (ezrabStandard - aiEstimate)
  differencePercent: number | null;
}

export interface RabValidationComparisonReport {
  aiRabGrandTotal: number;
  ezrabStandardGrandTotal: number;
  differenceAmount: number;
  differencePercent: number;
  totalItems: number;
  exactMatchCount: number;
  adjustedCount: number;
  unresolvedCount: number;
  items: ItemComparisonResult[];
}

export class EzrabValidationComparisonEngine {
  private static instance: EzrabValidationComparisonEngine;

  private constructor() {}

  public static getInstance(): EzrabValidationComparisonEngine {
    if (!EzrabValidationComparisonEngine.instance) {
      EzrabValidationComparisonEngine.instance = new EzrabValidationComparisonEngine();
    }
    return EzrabValidationComparisonEngine.instance;
  }

  public compareAiWithEzrabStandard(aiWorkItems: any[]): RabValidationComparisonReport {
    let aiTotal = 0;
    let standardTotal = 0;
    let exactCount = 0;
    let adjustedCount = 0;
    let unresolvedCount = 0;

    const comparedItems: ItemComparisonResult[] = aiWorkItems.map((item) => {
      const qty = item.quantity || 1;
      const aiUnitPrice = item.unitPrice || item.price?.unitPrice || 0;
      const aiSubtotal = item.totalPrice || SafeDecimalEngine.safeMultiply(aiUnitPrice, qty, 2);
      aiTotal = SafeDecimalEngine.safeAdd(aiTotal, aiSubtotal);

      // Check strict EZRAB database match
      let stdUnitPrice: number | null = null;
      let stdAhspCode: string | null = null;

      const cleanCode = item.ahspMatch?.code || item.ahspCode || '';
      if (cleanCode && cleanCode !== 'AI-ESTIMATE') {
        const official = officialAhspRepository.getOfficialAhsp(cleanCode);
        if (official) {
          stdAhspCode = official.code;
          const comp = priceResolver2026.resolveAhspUnitPrice(official);
          if (comp.unitPrice && comp.unitPrice > 0) {
            stdUnitPrice = comp.unitPrice;
          }
        }
      }

      if (stdUnitPrice !== null && stdUnitPrice > 0) {
        const stdSubtotal = SafeDecimalEngine.safeMultiply(stdUnitPrice, qty, 2);
        standardTotal = SafeDecimalEngine.safeAdd(standardTotal, stdSubtotal);
        const diff = SafeDecimalEngine.safeSubtract(stdSubtotal, aiSubtotal);
        const diffPct = aiSubtotal > 0 ? SafeDecimalEngine.safeRound((diff / aiSubtotal) * 100, 1) : 0;

        if (Math.abs(diff) < 1) {
          exactCount++;
          return {
            itemId: item.id,
            name: item.name,
            category: item.category,
            quantity: qty,
            unit: item.unit,
            aiEstimateUnitPrice: aiUnitPrice,
            aiEstimateTotal: aiSubtotal,
            aiProvenance: item.provenanceDetail?.overallProvenance || item.price?.priceSource || 'AI_ASSISTED',
            ezrabStandardUnitPrice: stdUnitPrice,
            ezrabStandardTotal: stdSubtotal,
            ezrabAhspCode: stdAhspCode,
            status: 'EXACT_MATCH',
            differenceAmount: 0,
            differencePercent: 0,
          };
        }

        adjustedCount++;
        return {
          itemId: item.id,
          name: item.name,
          category: item.category,
          quantity: qty,
          unit: item.unit,
          aiEstimateUnitPrice: aiUnitPrice,
          aiEstimateTotal: aiSubtotal,
          aiProvenance: item.provenanceDetail?.overallProvenance || item.price?.priceSource || 'AI_ASSISTED',
          ezrabStandardUnitPrice: stdUnitPrice,
          ezrabStandardTotal: stdSubtotal,
          ezrabAhspCode: stdAhspCode,
          status: 'PRICE_DIFFERENCE',
          differenceAmount: diff,
          differencePercent: diffPct,
        };
      }

      // Unresolved in strict standard database
      unresolvedCount++;
      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        quantity: qty,
        unit: item.unit,
        aiEstimateUnitPrice: aiUnitPrice,
        aiEstimateTotal: aiSubtotal,
        aiProvenance: item.provenanceDetail?.overallProvenance || item.price?.priceSource || 'AI_ESTIMATED',
        ezrabStandardUnitPrice: null,
        ezrabStandardTotal: null,
        ezrabAhspCode: null,
        status: 'UNRESOLVED_IN_STANDARD',
        differenceAmount: null,
        differencePercent: null,
      };
    });

    const netDifference = SafeDecimalEngine.safeSubtract(standardTotal, aiTotal);
    const netDifferencePct = aiTotal > 0 ? SafeDecimalEngine.safeRound((netDifference / aiTotal) * 100, 1) : 0;

    return {
      aiRabGrandTotal: aiTotal,
      ezrabStandardGrandTotal: standardTotal,
      differenceAmount: netDifference,
      differencePercent: netDifferencePct,
      totalItems: aiWorkItems.length,
      exactMatchCount: exactCount,
      adjustedCount,
      unresolvedCount,
      items: comparedItems,
    };
  }
}

export const ezrabValidationComparisonEngine = EzrabValidationComparisonEngine.getInstance();

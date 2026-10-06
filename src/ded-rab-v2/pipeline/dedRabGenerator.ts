/**
 * EZRAB DED -> RAB V2: RAB Generator
 *
 * STEP 10: RAB GENERATION
 *
 * Core Principles:
 * - RAB contains: READY ITEMS + NEEDS REVIEW ITEMS.
 * - ONLY READY items contribute to Grand Total.
 * - NEEDS REVIEW / MISSING_QTY items remain clearly visible with null amount.
 * - Never fabricate total amount = 0 if quantity or price is unverified.
 */

import {
  DedInventoryItem,
  DedQuantityEvidence,
  DedAhspMatch,
  DedPriceResult,
  DedWorkItem,
} from '../types';
import { GateValidationResult } from '../validation/dedRabValidationGate';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';

export interface DedRabDraftItem {
  id: string;
  name: string;
  category: string;
  specification?: string;
  volume: number | null;
  unit: string;
  ahspCode?: string;
  ahspName?: string;
  unitPrice: number | null;
  totalAmount: number | null;
  status: 'READY' | 'MISSING_QTY' | 'REVIEW';
  statusReason?: string;
  formula?: string;
  sourcePages: number[];
}

export interface DedRabDraftResult {
  items: DedRabDraftItem[];
  readyItems: DedRabDraftItem[];
  reviewItems: DedRabDraftItem[];
  grandTotal: number;
  totalWorkItems: number;
  readyCount: number;
  reviewCount: number;
  missingQtyCount: number;
}

export class DedRabGenerator {
  private static instance: DedRabGenerator;

  private constructor() {}

  public static getInstance(): DedRabGenerator {
    if (!DedRabGenerator.instance) {
      DedRabGenerator.instance = new DedRabGenerator();
    }
    return DedRabGenerator.instance;
  }

  /**
   * Generates the comprehensive RAB draft from inventory, quantities, AHSP, and prices.
   */
  public generateRab(params: {
    inventory: DedInventoryItem[];
    quantities: Map<string, DedQuantityEvidence>;
    ahspMatches: Map<string, DedAhspMatch>;
    prices: Map<string, DedPriceResult>;
    validations: Map<string, GateValidationResult>;
  }): DedRabDraftResult {
    const { inventory, quantities, ahspMatches, prices, validations } = params;

    const items: DedRabDraftItem[] = [];
    const readyItems: DedRabDraftItem[] = [];
    const reviewItems: DedRabDraftItem[] = [];

    let grandTotal = 0;
    let readyCount = 0;
    let reviewCount = 0;
    let missingQtyCount = 0;

    for (const inv of inventory) {
      const q = quantities.get(inv.id);
      const ahsp = ahspMatches.get(inv.id);
      const pr = prices.get(inv.id);
      const val = validations.get(inv.id);

      const hasValidQty = q && q.status === 'RESOLVED' && typeof q.value === 'number' && q.value > 0;
      const hasValidAhsp = ahsp && ahsp.matchType !== 'NOT_FOUND' && ahsp.matchType !== 'AI_CUSTOM';
      const hasValidPrice = pr && typeof pr.unitPrice === 'number' && pr.unitPrice > 0;
      const isGateReady = val?.isValid && val?.status === 'READY';

      let status: 'READY' | 'MISSING_QTY' | 'REVIEW' = 'REVIEW';
      let statusReason = val?.errors[0] || 'Perlu review';
      let totalAmount: number | null = null;

      if (!hasValidQty) {
        status = 'MISSING_QTY';
        statusReason = 'Kuantitas belum dapat ditentukan dari gambar DED (MISSING_QTY)';
        missingQtyCount++;
        reviewCount++;
      } else if (!hasValidAhsp) {
        status = 'REVIEW';
        statusReason = 'Analisa harga satuan pekerjaan resmi belum cocok';
        reviewCount++;
      } else if (!hasValidPrice) {
        status = 'REVIEW';
        statusReason = 'Harga satuan belum tersedia dalam database resmi';
        reviewCount++;
      } else if (isGateReady || (hasValidQty && hasValidAhsp && hasValidPrice)) {
        status = 'READY';
        statusReason = 'Siap masuk RAB resmi';
        totalAmount = SafeDecimalEngine.safeMultiply(q.value as number, pr.unitPrice as number, 2);
        grandTotal = SafeDecimalEngine.safeAdd(grandTotal, totalAmount, 2);
        readyCount++;
      }

      const draftItem: DedRabDraftItem = {
        id: inv.id,
        name: inv.name,
        category: inv.category,
        specification: inv.specification,
        volume: hasValidQty ? (q.value as number) : null,
        unit: q?.unit || inv.specification || 'unit',
        ahspCode: ahsp?.code,
        ahspName: ahsp?.name,
        unitPrice: pr?.unitPrice ?? null,
        totalAmount,
        status,
        statusReason,
        formula: q?.formula,
        sourcePages: inv.sourcePages,
      };

      items.push(draftItem);

      if (status === 'READY') {
        readyItems.push(draftItem);
      } else {
        reviewItems.push(draftItem);
      }
    }

    return {
      items,
      readyItems,
      reviewItems,
      grandTotal,
      totalWorkItems: inventory.length,
      readyCount,
      reviewCount,
      missingQtyCount,
    };
  }
}

export const dedRabGenerator = DedRabGenerator.getInstance();

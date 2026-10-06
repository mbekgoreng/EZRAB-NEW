/**
 * Automatic RAB Draft Engine (Phase 6)
 *
 * Combines QTO calculation items with authoritative PUPR AHSP data and regional pricing.
 * Formulates structured WBS draft items, highlights unmapped AHSP items, and verifies prices.
 */

import { GeneratedQtoItem } from './automaticQtoEngine';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import { NationalAHSPItem } from '../../src/data/nationalCostDatabase/types';
import { SafeDecimalEngine } from '../../src/engine/safeDecimalEngine';
// PHASE 1 (audit §16): record every fabricated price. Recording only — no value is changed.
import { recordFabricatedTotal } from '../../src/engine/pricing/telemetry/fabricatedPriceTelemetry';

export interface RabDraftItem {
  itemId: string;
  wbsCategory: string;
  itemNumber: string;
  ahspCode: string;
  description: string;
  volume: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  sourceType: 'AHSP_DATABASE' | 'PRICE_DATABASE' | 'AI_ESTIMATE' | 'UNMAPPED';
  verificationStatus: 'VERIFIED' | 'NEEDS_VERIFICATION' | 'ESTIMATED';
  confidence: number;
  qtoReference?: string;
  notes?: string;
}

export interface RabDraftSummary {
  projectId: string;
  totalItems: number;
  subtotal: number;
  ppnAmount: number;
  grandTotal: number;
  unmappedAhspCount: number;
  itemsRequiringPriceVerification: number;
  items: RabDraftItem[];
  generatedAt: string;
}

export class AutomaticRabDraftEngine {
  private static instance: AutomaticRabDraftEngine;

  private constructor() {}

  public static getInstance(): AutomaticRabDraftEngine {
    if (!AutomaticRabDraftEngine.instance) {
      AutomaticRabDraftEngine.instance = new AutomaticRabDraftEngine();
    }
    return AutomaticRabDraftEngine.instance;
  }

  /**
   * Search official AHSP database for best match
   */
  public findBestAhspMatch(itemDescription: string, category: string, suggestedCode?: string): NationalAHSPItem | undefined {
    if (suggestedCode) {
      const exact = ALL_OFFICIAL_AHSP_ITEMS.find(a => a.code === suggestedCode);
      if (exact) return exact;
    }

    const descLower = itemDescription.toLowerCase();

    // Specific keyword rules
    if (descLower.includes('bowplank') || descLower.includes('pengukuran')) {
      return ALL_OFFICIAL_AHSP_ITEMS.find(a => a.name.toLowerCase().includes('bowplank') || a.name.toLowerCase().includes('pengukuran'));
    }
    if (descLower.includes('galian')) {
      return ALL_OFFICIAL_AHSP_ITEMS.find(a => a.name.toLowerCase().includes('galian') && a.name.toLowerCase().includes('tanah'));
    }
    if (descLower.includes('sloof') && descLower.includes('beton')) {
      return ALL_OFFICIAL_AHSP_ITEMS.find(a => a.name.toLowerCase().includes('sloof') || (a.name.toLowerCase().includes('beton') && a.code.startsWith('A.4.1.1')));
    }
    if (descLower.includes('kolom') && descLower.includes('beton')) {
      return ALL_OFFICIAL_AHSP_ITEMS.find(a => a.name.toLowerCase().includes('kolom') || (a.name.toLowerCase().includes('beton') && a.code.startsWith('A.4.1.1')));
    }
    if (descLower.includes('bata') || descLower.includes('dinding')) {
      return ALL_OFFICIAL_AHSP_ITEMS.find(a => a.name.toLowerCase().includes('bata merah') || a.name.toLowerCase().includes('dinding'));
    }
    if (descLower.includes('lantai') || descLower.includes('keramik') || descLower.includes('tile')) {
      return ALL_OFFICIAL_AHSP_ITEMS.find(a => a.name.toLowerCase().includes('keramik') || a.name.toLowerCase().includes('ubin') || a.name.toLowerCase().includes('granit'));
    }

    // Generic match
    return ALL_OFFICIAL_AHSP_ITEMS.find(a => descLower.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(descLower));
  }

  /**
   * Convert QTO items into verified RAB Draft items with deterministic math
   */
  public generateRabDraft(params: {
    projectId: string;
    qtoItems: GeneratedQtoItem[];
    taxPercent?: number;
  }): RabDraftSummary {
    const { projectId, qtoItems, taxPercent = 11 } = params;

    const items: RabDraftItem[] = [];
    let unmappedCount = 0;
    let priceVerificationCount = 0;
    let subtotal = 0;

    qtoItems.forEach((qto, index) => {
      const match = this.findBestAhspMatch(qto.description, qto.category, qto.ahspMatchCode);
      const itemNumber = `${index + 1}.0`;
      const itemId = `rab_draft_${qto.itemCode}_${index + 1}`;

      if (match) {
        const unitPrice = match.unitPrice;
        const lineTotal = SafeDecimalEngine.safeMultiply(qto.volume, unitPrice);
        subtotal = SafeDecimalEngine.safeAdd(subtotal, lineTotal);

        items.push({
          itemId,
          wbsCategory: qto.category,
          itemNumber,
          ahspCode: match.code,
          description: match.name || qto.description,
          volume: qto.volume,
          unit: match.unit || qto.unit,
          unitPrice,
          totalPrice: lineTotal,
          sourceType: 'AHSP_DATABASE',
          verificationStatus: 'VERIFIED',
          confidence: Math.min(qto.confidence, 0.95),
          qtoReference: qto.itemCode,
          notes: `Dicocokkan dengan standar PUPR (${match.code})`
        });
      } else {
        unmappedCount++;
        priceVerificationCount++;
        const defaultEstimatedPrice = 150000;
        // PHASE 1 telemetry: AHSP unmapped → a flat Rp 150.000/m3 borongan price is applied.
        recordFabricatedTotal('rabdraft.borongan.default', SafeDecimalEngine.safeMultiply(qto.volume, defaultEstimatedPrice), {
          constant: defaultEstimatedPrice,
          quantity: qto.volume,
          unit: qto.unit,
          itemName: qto.description,
          calculatorId: qto.itemCode,
        });
        const lineTotal = SafeDecimalEngine.safeMultiply(qto.volume, defaultEstimatedPrice);
        subtotal = SafeDecimalEngine.safeAdd(subtotal, lineTotal);

        items.push({
          itemId,
          wbsCategory: qto.category,
          itemNumber,
          ahspCode: '',
          description: qto.description,
          volume: qto.volume,
          unit: qto.unit,
          unitPrice: defaultEstimatedPrice,
          totalPrice: lineTotal,
          sourceType: 'UNMAPPED',
          verificationStatus: 'NEEDS_VERIFICATION',
          confidence: 0.60,
          qtoReference: qto.itemCode,
          notes: 'Analisa AHSP belum terpetakan otomatis, mohon verifikasi harga satuan.'
        });
      }
    });

    const ppnAmount = SafeDecimalEngine.safeMultiply(subtotal, taxPercent / 100);
    const grandTotal = SafeDecimalEngine.safeAdd(subtotal, ppnAmount);

    return {
      projectId,
      totalItems: items.length,
      subtotal,
      ppnAmount,
      grandTotal,
      unmappedAhspCount: unmappedCount,
      itemsRequiringPriceVerification: priceVerificationCount,
      items,
      generatedAt: new Date().toISOString()
    };
  }
}

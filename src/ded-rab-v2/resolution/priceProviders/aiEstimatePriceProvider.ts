/**
 * Priority 5: AI Price Estimation Provider
 * Generates structured, evidence-based AI price estimates when authoritative and market sources are absent:
 * - Resource-level estimation if AHSP recipe components exist
 * - Work-item level estimation with plausibility bounds {low, central, high}
 * - Explicit assumptions list and confidence ratings
 * - NEVER pretends to be an official database price
 */

import { PriceProvider, PriceSearchInput, PriceCandidate } from '../providerContracts';
import { aiPriceEstimationEngine } from '../../pricing/aiPriceEstimationEngine';
import { SafeDecimalEngine } from '../../../engine/safeDecimalEngine';

export class AiEstimatePriceProvider implements PriceProvider {
  public readonly name = 'AI_ESTIMATED';
  public readonly priority = 5;

  public async search(input: PriceSearchInput): Promise<PriceCandidate | null> {
    const { workItemName, specification, category, unit, quantity = 1, location } = input;
    const qty = quantity !== null && quantity !== undefined && quantity > 0 ? quantity : 1;

    try {
      const mockItem: any = {
        name: workItemName,
        materialSpec: specification,
        category,
        unit,
        quantity: qty,
      };

      const { priceResult, estimationRecord } = aiPriceEstimationEngine.estimateWorkItemPrice(mockItem, {
        region: location ? `${location.city}, ${location.province}` : undefined,
      });

      if (priceResult.unitPrice && priceResult.unitPrice > 0) {
        const unitPrice = priceResult.unitPrice;
        const totalPrice = SafeDecimalEngine.safeMultiply(unitPrice, qty, 2);

        const confidenceNum = typeof estimationRecord.confidence === 'number'
          ? estimationRecord.confidence
          : estimationRecord.confidence === 'HIGH' ? 0.85 : estimationRecord.confidence === 'MEDIUM' ? 0.75 : 0.65;

        const basisList = Array.isArray(estimationRecord.basis)
          ? estimationRecord.basis
          : [String(estimationRecord.basis || 'Estimasi berbasis referensi harga konstruksi serumpun.')];

        return {
          unitPrice,
          totalPrice,
          priceSource: 'AI_ESTIMATED',
          priceStatus: 'PRICE_AI_ESTIMATE',
          sourceName: '🤖 AI Construction Estimation Engine',
          location: location ? `${location.city}, ${location.province}` : 'Estimasi Acuan Nasional',
          materialPrice: priceResult.materialPrice,
          laborPrice: priceResult.laborPrice,
          equipmentPrice: priceResult.equipmentPrice,
          confidence: confidenceNum,
          confidenceRating: confidenceNum >= 0.75 ? 'MEDIUM' : 'LOW',
          assumptions: [
            ...basisList,
            `Rentang estimasi wajar: Rp ${estimationRecord.range.low.toLocaleString('id-ID')} - Rp ${estimationRecord.range.high.toLocaleString('id-ID')} / ${unit}.`,
            'Estimasi otomatis oleh AI dengan prinsip transparansi.',
          ],
        };
      }
    } catch {
      // AI estimate fallback logic
    }

    return null;
  }
}

export const aiEstimatePriceProvider = new AiEstimatePriceProvider();

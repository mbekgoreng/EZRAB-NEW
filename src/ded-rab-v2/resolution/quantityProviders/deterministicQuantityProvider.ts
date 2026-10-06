/**
 * Deterministic Quantity Provider
 * Computes exact physical quantities when dimensions (length, width, height, area, count) are explicitly available.
 */

import { QuantityProvider, QuantityResolutionInput, QuantityCandidate } from '../providerContracts';
import { dedQuantityEngine } from '../../qto/dedQuantityEngine';
import { SafeDecimalEngine } from '../../../engine/safeDecimalEngine';

export class DeterministicQuantityProvider implements QuantityProvider {
  public readonly name = 'DETERMINISTIC_QTO';

  public async resolveQuantity(input: QuantityResolutionInput): Promise<QuantityCandidate | null> {
    const { item, memory, buildingModel } = input;
    const res = dedQuantityEngine.resolveQuantity(item, memory, buildingModel);

    if (res.quantity !== null && res.quantity !== undefined && res.quantity > 0) {
      return {
        quantity: res.quantity,
        unit: res.unit,
        formula: res.formula,
        source: 'DETERMINISTIC_ENGINE',
        confidence: 0.95,
        confidenceRating: 'HIGH',
        assumptions: ['Dihitung secara deterministik dari dimensi gambar kerja menggunakan SafeDecimalEngine.'],
        inputs: res.inputs,
        calculationBreakdown: res.calculation_method,
      };
    }

    return null;
  }
}

export const deterministicQuantityProvider = new DeterministicQuantityProvider();

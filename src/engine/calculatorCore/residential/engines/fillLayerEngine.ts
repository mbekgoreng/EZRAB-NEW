/**
 * EZRAB RESIDENTIAL PACK — FILL LAYER & BLINDING ENGINE
 * Deterministic quantity calculation for Sand Bedding, Gravel, Broken Stone, and Lean Concrete (Lantai Kerja).
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export type FillMaterialType = 'sand' | 'gravel' | 'stone' | 'lean_concrete';

export interface FillLayerInput {
  area?: number;
  length?: number;
  width?: number;
  thickness: number;
  quantity?: number;
  materialType?: FillMaterialType;
}

export interface FillLayerOutput {
  area: number;
  thickness: number;
  volume: number;
  materialType: FillMaterialType;
}

export class FillLayerEngine {
  /**
   * Calculate bedding or blinding layer volume ($A \times t$).
   */
  public static calculate(input: FillLayerInput): FillLayerOutput {
    let areaDec: Decimal;

    if (input.area !== undefined && input.area > 0) {
      areaDec = new Decimal(input.area);
    } else {
      const l = new Decimal(input.length || 0);
      const w = new Decimal(input.width || 0);
      areaDec = l.times(w);
    }

    const t = new Decimal(input.thickness || 0);
    const qty = new Decimal(input.quantity || 1);
    const volume = areaDec.times(t).times(qty);

    return {
      area: PrecisionEngine.applyPolicy(areaDec.times(qty).toNumber(), 'DECIMAL_2'),
      thickness: PrecisionEngine.applyPolicy(t.toNumber(), 'DECIMAL_4'),
      volume: PrecisionEngine.applyPolicy(volume.toNumber(), 'DECIMAL_2'),
      materialType: input.materialType || 'sand',
    };
  }
}

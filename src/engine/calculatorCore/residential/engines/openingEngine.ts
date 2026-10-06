/**
 * EZRAB RESIDENTIAL PACK — OPENING ENGINE
 * Deterministic schedule calculation for doors, windows, vents, and wall openings.
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export interface OpeningScheduleItem {
  id?: string;
  type: 'door' | 'window' | 'vent' | 'custom';
  name?: string;
  widthM: number;
  heightM: number;
  quantity: number;
}

export interface OpeningScheduleInput {
  openings: OpeningScheduleItem[];
}

export interface EvaluatedOpeningItem {
  type: string;
  name: string;
  widthM: number;
  heightM: number;
  quantity: number;
  areaPerUnitM2: number;
  totalAreaM2: number;
  perimeterPerUnitM: number;
  totalPerimeterM: number;
}

export interface OpeningScheduleOutput {
  totalCount: number;
  totalOpeningAreaM2: number;
  totalFramePerimeterM: number;
  items: EvaluatedOpeningItem[];
}

export class OpeningEngine {
  public static calculate(input: OpeningScheduleInput): OpeningScheduleOutput {
    let totalCount = 0;
    let totalAreaDec = new Decimal(0);
    let totalPerimeterDec = new Decimal(0);
    const items: EvaluatedOpeningItem[] = [];

    for (const op of input.openings || []) {
      const w = new Decimal(op.widthM || 0);
      const h = new Decimal(op.heightM || 0);
      const qty = new Decimal(op.quantity || 0);

      const areaPerUnit = w.times(h);
      const totalArea = areaPerUnit.times(qty);

      const perimPerUnit = w.plus(h).times(2);
      const totalPerim = perimPerUnit.times(qty);

      totalCount += qty.toNumber();
      totalAreaDec = totalAreaDec.plus(totalArea);
      totalPerimeterDec = totalPerimeterDec.plus(totalPerim);

      items.push({
        type: op.type,
        name: op.name || `${op.type.toUpperCase()} (${op.widthM}x${op.heightM}m)`,
        widthM: PrecisionEngine.applyPolicy(w.toNumber(), 'DECIMAL_2'),
        heightM: PrecisionEngine.applyPolicy(h.toNumber(), 'DECIMAL_2'),
        quantity: qty.toNumber(),
        areaPerUnitM2: PrecisionEngine.applyPolicy(areaPerUnit.toNumber(), 'DECIMAL_4'),
        totalAreaM2: PrecisionEngine.applyPolicy(totalArea.toNumber(), 'DECIMAL_2'),
        perimeterPerUnitM: PrecisionEngine.applyPolicy(perimPerUnit.toNumber(), 'DECIMAL_2'),
        totalPerimeterM: PrecisionEngine.applyPolicy(totalPerim.toNumber(), 'DECIMAL_2'),
      });
    }

    return {
      totalCount,
      totalOpeningAreaM2: PrecisionEngine.applyPolicy(totalAreaDec.toNumber(), 'DECIMAL_2'),
      totalFramePerimeterM: PrecisionEngine.applyPolicy(totalPerimeterDec.toNumber(), 'DECIMAL_2'),
      items,
    };
  }
}

/**
 * EZRAB RESIDENTIAL PACK — REINFORCEMENT SCHEDULE ENGINE
 * Deterministic calculation of rebar cut lengths, weights, and schedules.
 * Unit weight standard: w = (d^2) / 162.198 kg/m based on steel density 7850 kg/m³.
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export interface BarScheduleItem {
  barMark?: string;
  diameterMm: number;
  cutLengthM: number;
  quantity: number;
  customUnitWeightKgPerM?: number;
}

export interface ReinforcementScheduleInput {
  bars: BarScheduleItem[];
  wastePercentage?: number; // explicit waste if supplied
}

export interface EvaluatedBarItem {
  barMark?: string;
  diameterMm: number;
  cutLengthM: number;
  quantity: number;
  totalLengthM: number;
  unitWeightKgPerM: number;
  totalWeightKg: number;
}

export interface ReinforcementScheduleOutput {
  totalLengthM: number;
  totalWeightKg: number;
  totalWeightTon: number;
  barDetails: EvaluatedBarItem[];
  weightByDiameter: Record<number, number>;
}

export class ReinforcementQuantityEngine {
  /**
   * Theoretical steel rebar unit weight in kg/m:
   * w = (pi * (d/2000)^2 * 7850) = (d^2) / 162.198 kg/m
   */
  public static getUnitWeightKgPerM(diameterMm: number): number {
    const d = new Decimal(diameterMm);
    // Area = pi * (d/2)^2 in mm2 = (pi/4) * d^2
    // Weight per meter (m) = Area(m2) * 1m * 7850 kg/m3 = (pi/4) * (d/1000)^2 * 7850 = d^2 * 0.00616537...
    const weight = d.pow(2).times(Math.PI).times(7850).dividedBy(4 * 1000000);
    return PrecisionEngine.applyPolicy(weight.toNumber(), 'DECIMAL_4');
  }

  public static calculate(input: ReinforcementScheduleInput): ReinforcementScheduleOutput {
    let totalLengthDec = new Decimal(0);
    let totalWeightDec = new Decimal(0);
    const evaluatedBars: EvaluatedBarItem[] = [];
    const weightByDia: Record<number, number> = {};

    for (const b of input.bars) {
      const d = b.diameterMm || 0;
      const cutL = new Decimal(b.cutLengthM || 0);
      const qty = new Decimal(b.quantity || 0);
      const itemTotalLen = cutL.times(qty);

      const unitWeight = b.customUnitWeightKgPerM !== undefined && b.customUnitWeightKgPerM > 0
        ? b.customUnitWeightKgPerM
        : ReinforcementQuantityEngine.getUnitWeightKgPerM(d);

      const itemTotalWt = itemTotalLen.times(unitWeight);

      totalLengthDec = totalLengthDec.plus(itemTotalLen);
      totalWeightDec = totalWeightDec.plus(itemTotalWt);

      evaluatedBars.push({
        barMark: b.barMark,
        diameterMm: d,
        cutLengthM: PrecisionEngine.applyPolicy(cutL.toNumber(), 'DECIMAL_4'),
        quantity: qty.toNumber(),
        totalLengthM: PrecisionEngine.applyPolicy(itemTotalLen.toNumber(), 'DECIMAL_2'),
        unitWeightKgPerM: unitWeight,
        totalWeightKg: PrecisionEngine.applyPolicy(itemTotalWt.toNumber(), 'DECIMAL_2'),
      });

      weightByDia[d] = (weightByDia[d] || 0) + PrecisionEngine.applyPolicy(itemTotalWt.toNumber(), 'DECIMAL_2');
    }

    if (input.wastePercentage && input.wastePercentage > 0) {
      const wasteMultiplier = new Decimal(1).plus(new Decimal(input.wastePercentage).dividedBy(100));
      totalWeightDec = totalWeightDec.times(wasteMultiplier);
    }

    const totalWeightKg = PrecisionEngine.applyPolicy(totalWeightDec.toNumber(), 'DECIMAL_2');
    const totalWeightTon = PrecisionEngine.applyPolicy(totalWeightDec.dividedBy(1000).toNumber(), 'DECIMAL_4');

    return {
      totalLengthM: PrecisionEngine.applyPolicy(totalLengthDec.toNumber(), 'DECIMAL_2'),
      totalWeightKg,
      totalWeightTon,
      barDetails: evaluatedBars,
      weightByDiameter: weightByDia,
    };
  }
}

/**
 * EZRAB RESIDENTIAL PACK — EARTHWORK ENGINE
 * Deterministic quantity calculation for Cut & Fill, Trench/Pit Excavation, and Backfill.
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export interface CutAndFillInput {
  length: number;
  width: number;
  existingLevel: number;
  proposedLevel: number;
  swellFactor?: number; // Optional compaction/swell multiplier if authoritative
}

export interface CutAndFillOutput {
  area: number;
  depthDifference: number;
  cutVolume: number;
  fillVolume: number;
  netVolume: number; // positive = net fill, negative = net cut
}

export interface ExcavationSectionInput {
  length: number;
  depth: number;
  topWidth: number;
  bottomWidth?: number; // if omitted, assumes rectangular trench (bottomWidth = topWidth)
  quantity?: number;
}

export interface ExcavationOutput {
  sectionArea: number;
  volumePerUnit: number;
  totalVolume: number;
}

export interface BackfillInput {
  area: number;
  thickness: number;
  quantity?: number;
}

export interface BackfillOutput {
  area: number;
  thickness: number;
  totalVolume: number;
}

export class EarthworkEngine {
  /**
   * 01. Cut & Fill Calculation
   */
  public static calculateCutAndFill(input: CutAndFillInput): CutAndFillOutput {
    const l = new Decimal(input.length || 0);
    const w = new Decimal(input.width || 0);
    const ex = new Decimal(input.existingLevel || 0);
    const prop = new Decimal(input.proposedLevel || 0);

    const area = l.times(w);
    const diff = prop.minus(ex); // proposed - existing

    let cut = new Decimal(0);
    let fill = new Decimal(0);

    if (diff.isNegative()) {
      // Proposed is lower than existing -> Cut
      cut = area.times(diff.abs());
    } else if (diff.isPositive()) {
      // Proposed is higher than existing -> Fill
      fill = area.times(diff);
    }

    return {
      area: PrecisionEngine.applyPolicy(area.toNumber(), 'DECIMAL_2'),
      depthDifference: PrecisionEngine.applyPolicy(diff.toNumber(), 'DECIMAL_4'),
      cutVolume: PrecisionEngine.applyPolicy(cut.toNumber(), 'DECIMAL_2'),
      fillVolume: PrecisionEngine.applyPolicy(fill.toNumber(), 'DECIMAL_2'),
      netVolume: PrecisionEngine.applyPolicy(fill.minus(cut).toNumber(), 'DECIMAL_2'),
    };
  }

  /**
   * 02. Excavation Calculation (Rectangular / Trapezoidal Trench or Pit)
   */
  public static calculateExcavation(input: ExcavationSectionInput): ExcavationOutput {
    const l = new Decimal(input.length || 0);
    const d = new Decimal(input.depth || 0);
    const topW = new Decimal(input.topWidth || 0);
    const botW = input.bottomWidth !== undefined ? new Decimal(input.bottomWidth) : topW;
    const qty = new Decimal(input.quantity || 1);

    // Section Area = ((topWidth + bottomWidth) / 2) * depth
    const sectionArea = topW.plus(botW).times(0.5).times(d);
    const volPerUnit = sectionArea.times(l);
    const totalVolume = volPerUnit.times(qty);

    return {
      sectionArea: PrecisionEngine.applyPolicy(sectionArea.toNumber(), 'DECIMAL_4'),
      volumePerUnit: PrecisionEngine.applyPolicy(volPerUnit.toNumber(), 'DECIMAL_4'),
      totalVolume: PrecisionEngine.applyPolicy(totalVolume.toNumber(), 'DECIMAL_2'),
    };
  }

  /**
   * 03. Backfill / Soil Filling
   */
  public static calculateBackfill(input: BackfillInput): BackfillOutput {
    const a = new Decimal(input.area || 0);
    const t = new Decimal(input.thickness || 0);
    const qty = new Decimal(input.quantity || 1);

    const totalVolume = a.times(t).times(qty);

    return {
      area: PrecisionEngine.applyPolicy(a.toNumber(), 'DECIMAL_2'),
      thickness: PrecisionEngine.applyPolicy(t.toNumber(), 'DECIMAL_4'),
      totalVolume: PrecisionEngine.applyPolicy(totalVolume.toNumber(), 'DECIMAL_2'),
    };
  }
}

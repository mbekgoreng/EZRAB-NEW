/**
 * EZRAB RESIDENTIAL PACK — GENERIC CONCRETE QUANTITY ENGINE
 * Geometric concrete volume calculation for Slabs, Beams, Columns, Footings, and Stairs.
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export interface PrismConcreteInput {
  length: number;
  width: number;
  height: number;
  quantity?: number;
}

export interface SlabConcreteInput {
  grossArea?: number;
  length?: number;
  width?: number;
  thickness: number;
  voidArea?: number;
  quantity?: number;
}

export interface TrapezoidalFoundationInput {
  topWidth: number;
  bottomWidth: number;
  height: number;
  length: number;
  quantity?: number;
}

export interface SteppedFootingInput {
  pedestalWidth: number;
  pedestalLength: number;
  pedestalHeight: number;
  padWidth: number;
  padLength: number;
  padThickness: number;
  slopedHeight?: number;
  quantity?: number;
}

export interface ConcreteStairInput {
  stairWidth: number;
  waistThickness: number;
  riserHeight: number;
  treadDepth: number;
  stepCount: number;
  landingLength?: number;
  landingWidth?: number;
  landingThickness?: number;
}

export interface ConcreteVolumeOutput {
  volumePerUnit: number;
  totalVolume: number;
  details?: Record<string, number>;
}

export class ConcreteQuantityEngine {
  /**
   * Generic Rectangular Prism (Beams, Columns, Footing Pads, Sloof)
   */
  public static calculatePrism(input: PrismConcreteInput): ConcreteVolumeOutput {
    const l = new Decimal(input.length || 0);
    const w = new Decimal(input.width || 0);
    const h = new Decimal(input.height || 0);
    const qty = new Decimal(input.quantity || 1);

    const volPerUnit = l.times(w).times(h);
    const totalVol = volPerUnit.times(qty);

    return {
      volumePerUnit: PrecisionEngine.applyPolicy(volPerUnit.toNumber(), 'DECIMAL_4'),
      totalVolume: PrecisionEngine.applyPolicy(totalVol.toNumber(), 'DECIMAL_2'),
    };
  }

  /**
   * Concrete Slab with Void/Opening Deductions
   */
  public static calculateSlab(input: SlabConcreteInput): ConcreteVolumeOutput {
    let grossAreaDec: Decimal;
    if (input.grossArea !== undefined && input.grossArea > 0) {
      grossAreaDec = new Decimal(input.grossArea);
    } else {
      const l = new Decimal(input.length || 0);
      const w = new Decimal(input.width || 0);
      grossAreaDec = l.times(w);
    }

    const voidAreaDec = new Decimal(input.voidArea || 0);
    const netAreaDec = Decimal.max(0, grossAreaDec.minus(voidAreaDec));
    const t = new Decimal(input.thickness || 0);
    const qty = new Decimal(input.quantity || 1);

    const volPerUnit = netAreaDec.times(t);
    const totalVol = volPerUnit.times(qty);

    return {
      volumePerUnit: PrecisionEngine.applyPolicy(volPerUnit.toNumber(), 'DECIMAL_4'),
      totalVolume: PrecisionEngine.applyPolicy(totalVol.toNumber(), 'DECIMAL_2'),
      details: {
        grossArea: PrecisionEngine.applyPolicy(grossAreaDec.toNumber(), 'DECIMAL_2'),
        voidArea: PrecisionEngine.applyPolicy(voidAreaDec.toNumber(), 'DECIMAL_2'),
        netArea: PrecisionEngine.applyPolicy(netAreaDec.toNumber(), 'DECIMAL_2'),
      },
    };
  }

  /**
   * Trapezoidal Section Foundation (Pondasi Batu Kali / Trapezoid Strip)
   */
  public static calculateTrapezoidStrip(input: TrapezoidalFoundationInput): ConcreteVolumeOutput {
    const topW = new Decimal(input.topWidth || 0);
    const botW = new Decimal(input.bottomWidth || 0);
    const h = new Decimal(input.height || 0);
    const l = new Decimal(input.length || 0);
    const qty = new Decimal(input.quantity || 1);

    const sectionArea = topW.plus(botW).times(0.5).times(h);
    const volPerUnit = sectionArea.times(l);
    const totalVol = volPerUnit.times(qty);

    return {
      volumePerUnit: PrecisionEngine.applyPolicy(volPerUnit.toNumber(), 'DECIMAL_4'),
      totalVolume: PrecisionEngine.applyPolicy(totalVol.toNumber(), 'DECIMAL_2'),
      details: {
        sectionArea: PrecisionEngine.applyPolicy(sectionArea.toNumber(), 'DECIMAL_4'),
      },
    };
  }

  /**
   * Stepped / Sloped Footing (Foot Plate)
   */
  public static calculateFooting(input: SteppedFootingInput): ConcreteVolumeOutput {
    const a1 = new Decimal(input.pedestalWidth || 0);
    const a2 = new Decimal(input.pedestalLength || 0);
    const h1 = new Decimal(input.pedestalHeight || 0);

    const b1 = new Decimal(input.padWidth || 0);
    const b2 = new Decimal(input.padLength || 0);
    const h3 = new Decimal(input.padThickness || 0);
    const h2 = new Decimal(input.slopedHeight || 0);
    const qty = new Decimal(input.quantity || 1);

    const volPedestal = a1.times(a2).times(h1);
    const volPadBase = b1.times(b2).times(h3);
    const volPadSlope = b1.times(b2).times(h2).times(0.5);

    const volPerUnit = volPedestal.plus(volPadBase).plus(volPadSlope);
    const totalVol = volPerUnit.times(qty);

    return {
      volumePerUnit: PrecisionEngine.applyPolicy(volPerUnit.toNumber(), 'DECIMAL_4'),
      totalVolume: PrecisionEngine.applyPolicy(totalVol.toNumber(), 'DECIMAL_2'),
      details: {
        volPedestal: PrecisionEngine.applyPolicy(volPedestal.toNumber(), 'DECIMAL_4'),
        volPad: PrecisionEngine.applyPolicy(volPadBase.plus(volPadSlope).toNumber(), 'DECIMAL_4'),
      },
    };
  }

  /**
   * Concrete Stair with Waist Slab, Step Wedges, and Optional Landing
   */
  public static calculateStair(input: ConcreteStairInput): ConcreteVolumeOutput {
    const w = new Decimal(input.stairWidth || 0);
    const t = new Decimal(input.waistThickness || 0);
    const r = new Decimal(input.riserHeight || 0);
    const g = new Decimal(input.treadDepth || 0);
    const n = new Decimal(input.stepCount || 0);

    // 1. Step Wedges Volume: n * (0.5 * riser * tread * width)
    const volSteps = n.times(new Decimal(0.5).times(r).times(g).times(w));

    // 2. Waist Slab Volume: slopedLength * waistThickness * width
    // Sloped flight length = sqrt((n * r)^2 + (n * g)^2)
    const totalRise = n.times(r);
    const totalGoing = n.times(g);
    const slopedFlightLength = totalRise.pow(2).plus(totalGoing.pow(2)).sqrt();
    const volWaist = slopedFlightLength.times(t).times(w);

    // 3. Optional Landing Volume
    let volLanding = new Decimal(0);
    if (input.landingLength && input.landingWidth && input.landingThickness) {
      const lL = new Decimal(input.landingLength);
      const lW = new Decimal(input.landingWidth);
      const lT = new Decimal(input.landingThickness);
      volLanding = lL.times(lW).times(lT);
    }

    const totalVol = volSteps.plus(volWaist).plus(volLanding);

    return {
      volumePerUnit: PrecisionEngine.applyPolicy(totalVol.toNumber(), 'DECIMAL_4'),
      totalVolume: PrecisionEngine.applyPolicy(totalVol.toNumber(), 'DECIMAL_2'),
      details: {
        volSteps: PrecisionEngine.applyPolicy(volSteps.toNumber(), 'DECIMAL_4'),
        volWaist: PrecisionEngine.applyPolicy(volWaist.toNumber(), 'DECIMAL_4'),
        volLanding: PrecisionEngine.applyPolicy(volLanding.toNumber(), 'DECIMAL_4'),
        flightLength: PrecisionEngine.applyPolicy(slopedFlightLength.toNumber(), 'DECIMAL_2'),
      },
    };
  }
}

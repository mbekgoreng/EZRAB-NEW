/**
 * EZRAB RESIDENTIAL PACK — ROOF GEOMETRY ENGINE
 * Deterministic calculation of 3D roof sloped area, ridge runs, eaves, gutters, and fascia boards.
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export interface RoofGeometryInput {
  buildingLengthM: number;
  buildingWidthM: number;
  overhangM?: number; // default 0.80 m
  pitchAngleDegrees?: number; // e.g. 30 degrees
  roofType?: 'gable' | 'hip' | 'shed' | 'pyramid';
  effectiveCoverPieceAreaM2?: number; // e.g. 0.30 m2 per tile
}

export interface RoofGeometryOutput {
  footprintAreaM2: number;
  overhangLengthM: number;
  overhangWidthM: number;
  halfSpanM: number;
  riseM: number;
  slopeLengthM: number;
  totalSlopedRoofAreaM2: number;
  ridgeLengthM: number;
  eaveLengthM: number;
  fasciaBoardLengthM: number; // Lisplank
  gutterLengthM: number;
  estimatedCoverPieceCount?: number;
}

export class RoofGeometryEngine {
  /**
   * True 3D Sloped Roof Geometry
   */
  public static calculate(input: RoofGeometryInput): RoofGeometryOutput {
    const bL = new Decimal(input.buildingLengthM || 0);
    const bW = new Decimal(input.buildingWidthM || 0);
    const ov = new Decimal(input.overhangM !== undefined ? input.overhangM : 0.80);
    const angleDeg = input.pitchAngleDegrees !== undefined ? input.pitchAngleDegrees : 30;

    const rad = (angleDeg * Math.PI) / 180;
    const cosAngle = new Decimal(Math.cos(rad));
    const tanAngle = new Decimal(Math.tan(rad));

    // Effective footprint with overhang
    const totalPlanL = bL.plus(ov.times(2));
    const totalPlanW = bW.plus(ov.times(2));
    const footprintArea = totalPlanL.times(totalPlanW);

    // Half span and slope length
    const halfSpan = totalPlanW.times(0.5);
    const rise = halfSpan.times(tanAngle);
    const slopeLength = halfSpan.dividedBy(cosAngle);

    // Total 3D Sloped Area = footprintArea / cos(angle)
    const slopedRoofArea = footprintArea.dividedBy(cosAngle);

    // Linear runs
    const ridgeLength = totalPlanL;
    const eaveLength = totalPlanL.times(2);
    const fasciaBoardLength = totalPlanL.plus(totalPlanW).times(2); // perimeter
    const gutterLength = totalPlanL.times(2); // along the 2 eaves

    let coverCount: number | undefined = undefined;
    if (input.effectiveCoverPieceAreaM2 && input.effectiveCoverPieceAreaM2 > 0) {
      coverCount = Math.ceil(slopedRoofArea.dividedBy(new Decimal(input.effectiveCoverPieceAreaM2)).toNumber());
    }

    return {
      footprintAreaM2: PrecisionEngine.applyPolicy(footprintArea.toNumber(), 'DECIMAL_2'),
      overhangLengthM: PrecisionEngine.applyPolicy(totalPlanL.toNumber(), 'DECIMAL_2'),
      overhangWidthM: PrecisionEngine.applyPolicy(totalPlanW.toNumber(), 'DECIMAL_2'),
      halfSpanM: PrecisionEngine.applyPolicy(halfSpan.toNumber(), 'DECIMAL_2'),
      riseM: PrecisionEngine.applyPolicy(rise.toNumber(), 'DECIMAL_2'),
      slopeLengthM: PrecisionEngine.applyPolicy(slopeLength.toNumber(), 'DECIMAL_2'),
      totalSlopedRoofAreaM2: PrecisionEngine.applyPolicy(slopedRoofArea.toNumber(), 'DECIMAL_2'),
      ridgeLengthM: PrecisionEngine.applyPolicy(ridgeLength.toNumber(), 'DECIMAL_2'),
      eaveLengthM: PrecisionEngine.applyPolicy(eaveLength.toNumber(), 'DECIMAL_2'),
      fasciaBoardLengthM: PrecisionEngine.applyPolicy(fasciaBoardLength.toNumber(), 'DECIMAL_2'),
      gutterLengthM: PrecisionEngine.applyPolicy(gutterLength.toNumber(), 'DECIMAL_2'),
      estimatedCoverPieceCount: coverCount,
    };
  }
}

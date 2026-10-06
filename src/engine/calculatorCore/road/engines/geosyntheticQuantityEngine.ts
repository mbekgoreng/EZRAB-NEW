/**
 * Geosynthetic Generic Engine (Geotextile & Geogrid)
 * Deterministic calculation of net installed area and gross procurement area with explicit overlap.
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface GeosyntheticInput {
  materialType: 'GEOTEXTILE_WOVEN' | 'GEOTEXTILE_NON_WOVEN' | 'GEOGRID_BIAXIAL' | 'GEOGRID_UNIAXIAL';
  lengthMeters: number;
  widthMeters: number;
  overlapPercent?: number; // e.g. 10% (0.10)
  overlapSeamWidthMeters?: number; // e.g. 0.30m or 0.50m
  rollWidthMeters?: number; // e.g. 4.0m
  rollLengthMeters?: number; // e.g. 100.0m
}

export interface GeosyntheticResult {
  materialType: string;
  lengthMeters: number;
  widthMeters: number;
  netInstalledAreaM2: number;
  grossAreaM2: number;
  overlapAreaM2: number;
  overlapFactorUsed: number;
  rollsCount?: number;
  isOverlapSourced: boolean;
  warnings: string[];
}

export class GeosyntheticQuantityEngine {
  public static calculate(inputs: GeosyntheticInput): GeosyntheticResult {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.lengthMeters, 0));
    const width = Math.max(0, SafeDecimalEngine.sanitize(inputs.widthMeters, 0));
    const netArea = SafeDecimalEngine.safeMultiply(length, width, 3);
    const warnings: string[] = [];

    let overlapFactor = 0;
    let isOverlapSourced = false;

    if (inputs.overlapPercent !== undefined && inputs.overlapPercent >= 0) {
      overlapFactor = SafeDecimalEngine.sanitize(inputs.overlapPercent, 0) / 100;
      isOverlapSourced = true;
    } else if (inputs.overlapSeamWidthMeters !== undefined && inputs.overlapSeamWidthMeters > 0 && inputs.rollWidthMeters && inputs.rollWidthMeters > 0) {
      const seamW = inputs.overlapSeamWidthMeters;
      const rollW = inputs.rollWidthMeters;
      overlapFactor = SafeDecimalEngine.safeDivide(seamW, rollW, 4);
      isOverlapSourced = true;
    } else {
      warnings.push(
        'NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE: Faktor tumpang tindih (overlap seam) harus ditentukan dari spesifikasi geotekstil/geogrid.'
      );
    }

    const overlapArea = SafeDecimalEngine.safeMultiply(netArea, overlapFactor, 3);
    const grossArea = SafeDecimalEngine.safeAdd(netArea, overlapArea);

    let rollsCount: number | undefined = undefined;
    if (inputs.rollWidthMeters && inputs.rollLengthMeters) {
      const rollArea = SafeDecimalEngine.safeMultiply(inputs.rollWidthMeters, inputs.rollLengthMeters, 2);
      if (rollArea > 0) {
        rollsCount = Math.ceil(grossArea / rollArea);
      }
    }

    return {
      materialType: inputs.materialType,
      lengthMeters: length,
      widthMeters: width,
      netInstalledAreaM2: netArea,
      grossAreaM2: grossArea,
      overlapAreaM2: overlapArea,
      overlapFactorUsed: overlapFactor,
      rollsCount,
      isOverlapSourced,
      warnings,
    };
  }
}

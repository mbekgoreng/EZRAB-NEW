/**
 * Road Surface Treatment Generic Engine
 * Deterministic calculation for Prime Coat (Lapis Resap Pengikat) and Tack Coat (Lapis Perekat).
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface SurfaceTreatmentInput {
  treatmentType: 'PRIME_COAT' | 'TACK_COAT';
  lengthMeters: number;
  widthMeters: number;
  applicationRateLiterM2?: number; // e.g. 0.8 L/m2 for prime coat, 0.35 L/m2 for tack coat
  emulsionDensityKgLiter?: number; // e.g. 1.0 kg/L
}

export interface SurfaceTreatmentResult {
  treatmentType: 'PRIME_COAT' | 'TACK_COAT';
  lengthMeters: number;
  widthMeters: number;
  surfaceAreaM2: number;
  applicationRateLiterM2?: number;
  totalVolumeLiters?: number;
  totalMassKg?: number;
  isRateSourced: boolean;
  warnings: string[];
}

export class RoadSurfaceTreatmentEngine {
  public static calculate(inputs: SurfaceTreatmentInput): SurfaceTreatmentResult {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.lengthMeters, 0));
    const width = Math.max(0, SafeDecimalEngine.sanitize(inputs.widthMeters, 0));
    const area = SafeDecimalEngine.safeMultiply(length, width, 3);
    const warnings: string[] = [];

    let totalLiters: number | undefined = undefined;
    let totalKg: number | undefined = undefined;
    let isRateSourced = false;

    if (inputs.applicationRateLiterM2 !== undefined && inputs.applicationRateLiterM2 > 0) {
      const rate = SafeDecimalEngine.sanitize(inputs.applicationRateLiterM2, 0);
      totalLiters = SafeDecimalEngine.safeMultiply(area, rate, 2);
      isRateSourced = true;

      const density = inputs.emulsionDensityKgLiter || 1.0;
      totalKg = SafeDecimalEngine.safeMultiply(totalLiters, density, 2);
    } else {
      warnings.push(
        'NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE: Tingkat pemakaian (application rate liter/m²) harus ditentukan dari spesifikasi lapangan.'
      );
    }

    return {
      treatmentType: inputs.treatmentType,
      lengthMeters: length,
      widthMeters: width,
      surfaceAreaM2: area,
      applicationRateLiterM2: inputs.applicationRateLiterM2,
      totalVolumeLiters: totalLiters,
      totalMassKg: totalKg,
      isRateSourced,
      warnings,
    };
  }
}

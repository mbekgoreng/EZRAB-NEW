/**
 * Road Material Hauling Generic Engine
 * Deterministic physical takeoff of volume-distance (m3-km or ton-km).
 * Strictly excludes truck productivity, cycle times, wages, and unit cost.
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface MaterialHaulingInput {
  materialName: string;
  volumeM3: number;
  haulDistanceKm: number;
  densityTonM3?: number; // Optional mass conversion if sourced
}

export interface MaterialHaulingResult {
  materialName: string;
  volumeM3: number;
  haulDistanceKm: number;
  volumeDistanceM3Km: number; // Volume * Distance in m3-km
  massTons?: number;
  massDistanceTonKm?: number; // Mass * Distance in ton-km
  warnings: string[];
}

export class RoadHaulingEngine {
  public static calculate(inputs: MaterialHaulingInput): MaterialHaulingResult {
    const vol = Math.max(0, SafeDecimalEngine.sanitize(inputs.volumeM3, 0));
    const dist = Math.max(0, SafeDecimalEngine.sanitize(inputs.haulDistanceKm, 0));
    const volDist = SafeDecimalEngine.safeMultiply(vol, dist, 3);
    const warnings: string[] = [];

    let mass: number | undefined = undefined;
    let massDist: number | undefined = undefined;

    if (inputs.densityTonM3 !== undefined && inputs.densityTonM3 > 0) {
      mass = SafeDecimalEngine.safeMultiply(vol, inputs.densityTonM3, 3);
      massDist = SafeDecimalEngine.safeMultiply(mass, dist, 3);
    }

    if (dist <= 0) {
      warnings.push('NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE: Jarak angkut material (haul distance) harus ditentukan.');
    }

    return {
      materialName: inputs.materialName,
      volumeM3: vol,
      haulDistanceKm: dist,
      volumeDistanceM3Km: volDist,
      massTons: mass,
      massDistanceTonKm: massDist,
      warnings,
    };
  }
}

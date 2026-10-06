/**
 * Road Pavement Layer Generic Engine
 * Multi-layer pavement stack quantity takeoff for Subgrade, Granular Subbase,
 * Aggregate Base, CTB, Lean Concrete, Rigid Pavement, Asphalt Base/Binder/Wearing.
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface PavementLayerInput {
  layerId: string;
  layerName: string;
  lengthMeters: number;
  widthMeters: number;
  thicknessMeters: number; // e.g. 0.05 for 5cm AC-WC, 0.20 for 20cm Base A
  lanesCount?: number;
  laneWidthMeters?: number;
  leftShoulderWidthMeters?: number;
  rightShoulderWidthMeters?: number;
  includeShoulders?: boolean;
  densityTonM3?: number; // e.g. 2.32 for Asphalt, 2.20 for Base A (OPTIONAL)
  wastePercent?: number; // e.g. 2.0% (OPTIONAL)
}

export interface PavementLayerResult {
  layerId: string;
  layerName: string;
  lengthMeters: number;
  widthMeters: number;
  thicknessMeters: number;
  areaM2: number;
  volumeM3: number;
  massTons?: number;
  densityUsed?: number;
  hasSourcedDensity: boolean;
  warnings: string[];
}

export class RoadPavementLayerEngine {
  /**
   * Calculate Physical Area, Volume, and Mass (if density is sourced)
   */
  public static calculateLayer(inputs: PavementLayerInput): PavementLayerResult {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.lengthMeters, 0));
    
    // Resolve width: explicit width or derived from lanes + shoulders
    let width = Math.max(0, SafeDecimalEngine.sanitize(inputs.widthMeters, 0));
    if (width <= 0 && inputs.lanesCount && inputs.laneWidthMeters) {
      const roadCarriageway = SafeDecimalEngine.safeMultiply(inputs.lanesCount, inputs.laneWidthMeters, 3);
      let shoulderWidth = 0;
      if (inputs.includeShoulders) {
        shoulderWidth = SafeDecimalEngine.safeAdd(
          inputs.leftShoulderWidthMeters || 0,
          inputs.rightShoulderWidthMeters || 0
        );
      }
      width = SafeDecimalEngine.safeAdd(roadCarriageway, shoulderWidth);
    }
    if (width <= 0) width = 7.0; // Default standard 2-lane road

    const thickness = Math.max(0, SafeDecimalEngine.sanitize(inputs.thicknessMeters, 0));
    const area = SafeDecimalEngine.safeMultiply(length, width, 3);
    const volume = SafeDecimalEngine.safeMultiply(area, thickness, 3);

    const warnings: string[] = [];
    let massTons: number | undefined = undefined;
    let hasDensity = false;

    if (inputs.densityTonM3 !== undefined && inputs.densityTonM3 > 0) {
      const density = SafeDecimalEngine.sanitize(inputs.densityTonM3, 0);
      massTons = SafeDecimalEngine.safeMultiply(volume, density, 3);
      hasDensity = true;
    } else {
      warnings.push('Massa / Tonase membutuhkan input densitas JMF (Job Mix Formula) otoritatif.');
    }

    if (thickness <= 0) {
      warnings.push('NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE (Ketebalan layer belum didefinisikan).');
    }

    return {
      layerId: inputs.layerId,
      layerName: inputs.layerName,
      lengthMeters: length,
      widthMeters: width,
      thicknessMeters: thickness,
      areaM2: area,
      volumeM3: volume,
      massTons,
      densityUsed: inputs.densityTonM3,
      hasSourcedDensity: hasDensity,
      warnings,
    };
  }
}

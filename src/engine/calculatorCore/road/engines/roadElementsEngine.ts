/**
 * Road Elements Generic Engine
 * Handles Shoulders, Medians, Kerbs, Side Ditches, and Road Drainage.
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface ShoulderInput {
  lengthMeters: number;
  widthMeters: number;
  thicknessMeters: number;
  sidesCount?: number; // 1 or 2 (left & right)
  materialType?: string; // e.g. "Agregat Kelas S", "Beton", "Paving"
}

export interface MedianInput {
  lengthMeters: number;
  widthMeters: number;
  heightMeters?: number;
  soilFillDepthMeters?: number;
}

export interface KerbInput {
  lengthMeters: number;
  sidesCount?: number; // 1 or 2
  kerbWidthMeters?: number; // e.g. 0.15m
  kerbHeightMeters?: number; // e.g. 0.30m
  moduleLengthMeters?: number; // e.g. 0.40m per precast block
  beddingThicknessMeters?: number; // e.g. 0.10m concrete base
}

export interface SideDitchInput {
  lengthMeters: number;
  sidesCount?: number; // 1 or 2
  sectionType: 'TRAPEZOIDAL' | 'RECTANGULAR' | 'PRECAST_U';
  bottomWidthMeters: number;
  topWidthMeters?: number;
  depthMeters: number;
  sideSlope?: number; // H:V for trapezoid
  liningThicknessMeters?: number; // e.g. 0.08m masonry/concrete
}

export class RoadElementsEngine {
  /**
   * Shoulder Takeoff
   */
  public static calculateShoulder(inputs: ShoulderInput) {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.lengthMeters, 0));
    const width = Math.max(0, SafeDecimalEngine.sanitize(inputs.widthMeters, 1.5));
    const thickness = Math.max(0, SafeDecimalEngine.sanitize(inputs.thicknessMeters, 0.15));
    const sides = Math.max(1, SafeDecimalEngine.sanitize(inputs.sidesCount || 2, 2));

    const totalWidth = SafeDecimalEngine.safeMultiply(width, sides, 3);
    const area = SafeDecimalEngine.safeMultiply(length, totalWidth, 3);
    const volume = SafeDecimalEngine.safeMultiply(area, thickness, 3);

    return {
      lengthMeters: length,
      widthPerSideMeters: width,
      sidesCount: sides,
      totalWidthMeters: totalWidth,
      thicknessMeters: thickness,
      surfaceAreaM2: area,
      volumeM3: volume,
    };
  }

  /**
   * Median Takeoff
   */
  public static calculateMedian(inputs: MedianInput) {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.lengthMeters, 0));
    const width = Math.max(0, SafeDecimalEngine.sanitize(inputs.widthMeters, 1.0));
    const height = Math.max(0, SafeDecimalEngine.sanitize(inputs.heightMeters || 0.20, 0.20));
    const soilDepth = Math.max(0, SafeDecimalEngine.sanitize(inputs.soilFillDepthMeters || 0, 0));

    const area = SafeDecimalEngine.safeMultiply(length, width, 3);
    const structureVolume = SafeDecimalEngine.safeMultiply(area, height, 3);
    const soilFillVolume = soilDepth > 0 ? SafeDecimalEngine.safeMultiply(area, soilDepth, 3) : 0;

    return {
      lengthMeters: length,
      widthMeters: width,
      heightMeters: height,
      areaM2: area,
      structureVolumeM3: structureVolume,
      soilFillVolumeM3: soilFillVolume,
    };
  }

  /**
   * Kerb Takeoff
   */
  public static calculateKerb(inputs: KerbInput) {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.lengthMeters, 0));
    const sides = Math.max(1, SafeDecimalEngine.sanitize(inputs.sidesCount || 1, 1));
    const totalLength = SafeDecimalEngine.safeMultiply(length, sides, 3);

    const b = Math.max(0, SafeDecimalEngine.sanitize(inputs.kerbWidthMeters || 0.15, 0.15));
    const h = Math.max(0, SafeDecimalEngine.sanitize(inputs.kerbHeightMeters || 0.30, 0.30));
    const sectionArea = SafeDecimalEngine.safeMultiply(b, h, 4);
    const kerbVolume = SafeDecimalEngine.safeMultiply(sectionArea, totalLength, 3);

    const moduleLen = inputs.moduleLengthMeters || 0.40;
    const piecesCount = moduleLen > 0 ? Math.ceil(totalLength / moduleLen) : undefined;

    const beddingT = Math.max(0, SafeDecimalEngine.sanitize(inputs.beddingThicknessMeters || 0.05, 0.05));
    const beddingWidth = SafeDecimalEngine.safeAdd(b, 0.10);
    const beddingVolume = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(beddingWidth, beddingT, 4), totalLength, 3);

    return {
      totalLengthMeters: totalLength,
      crossSectionAreaM2: sectionArea,
      kerbVolumeM3: kerbVolume,
      piecesCount,
      beddingConcreteVolumeM3: beddingVolume,
    };
  }

  /**
   * Side Ditch & Road Drainage Takeoff
   */
  public static calculateSideDitch(inputs: SideDitchInput) {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.lengthMeters, 0));
    const sides = Math.max(1, SafeDecimalEngine.sanitize(inputs.sidesCount || 1, 1));
    const totalLength = SafeDecimalEngine.safeMultiply(length, sides, 3);

    const b = Math.max(0, SafeDecimalEngine.sanitize(inputs.bottomWidthMeters, 0.40));
    const d = Math.max(0, SafeDecimalEngine.sanitize(inputs.depthMeters, 0.50));
    const slope = Math.max(0, SafeDecimalEngine.sanitize(inputs.sideSlope || (inputs.sectionType === 'TRAPEZOIDAL' ? 1.0 : 0), 0));
    
    // Top width: b + 2 * slope * d
    const topW = inputs.topWidthMeters !== undefined ? inputs.topWidthMeters : SafeDecimalEngine.safeAdd(b, 2 * slope * d);

    // Excavation cross-section area: (topW + b)/2 * d
    const meanWidth = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(topW, b), 2, 4);
    const excavationSectionArea = SafeDecimalEngine.safeMultiply(meanWidth, d, 4);
    const totalExcavationVolume = SafeDecimalEngine.safeMultiply(excavationSectionArea, totalLength, 3);

    // Lining perimeter: b + 2 * sqrt(d^2 + (slope*d)^2)
    const slopeLength = Math.sqrt(Math.pow(d, 2) + Math.pow(slope * d, 2));
    const wetPerimeter = SafeDecimalEngine.safeAdd(b, 2 * slopeLength);
    const liningArea = SafeDecimalEngine.safeMultiply(wetPerimeter, totalLength, 3);

    const liningT = Math.max(0, SafeDecimalEngine.sanitize(inputs.liningThicknessMeters || 0.08, 0.08));
    const liningVolume = SafeDecimalEngine.safeMultiply(liningArea, liningT, 3);

    return {
      totalLengthMeters: totalLength,
      sidesCount: sides,
      bottomWidthMeters: b,
      topWidthMeters: topW,
      depthMeters: d,
      excavationSectionAreaM2: excavationSectionArea,
      totalExcavationVolumeM3: totalExcavationVolume,
      liningSurfaceAreaM2: liningArea,
      liningVolumeM3: liningVolume,
      liningThicknessMeters: liningT,
    };
  }

  /**
   * Calculate Multi-lane Cross-Section Geometry
   */
  public static calculateCrossSectionArea(inputs: {
    laneWidth: number;
    numberOfLanes: number;
    leftShoulderWidth?: number;
    rightShoulderWidth?: number;
    medianWidth?: number;
  }) {
    const laneW = Math.max(0, SafeDecimalEngine.sanitize(inputs.laneWidth, 3.5));
    const lanes = Math.max(1, SafeDecimalEngine.sanitize(inputs.numberOfLanes, 2));
    const leftS = Math.max(0, SafeDecimalEngine.sanitize(inputs.leftShoulderWidth || 0, 0));
    const rightS = Math.max(0, SafeDecimalEngine.sanitize(inputs.rightShoulderWidth || 0, 0));
    const medianW = Math.max(0, SafeDecimalEngine.sanitize(inputs.medianWidth || 0, 0));

    const carriageway = SafeDecimalEngine.safeMultiply(laneW, lanes, 3);
    const totalShoulder = SafeDecimalEngine.safeAdd(leftS, rightS);
    const formation = SafeDecimalEngine.safeAdd(carriageway, totalShoulder, medianW);

    return {
      carriagewayWidth: carriageway,
      totalShoulderWidth: totalShoulder,
      medianWidth: medianW,
      formationWidth: formation,
    };
  }
}

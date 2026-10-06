/**
 * Road Earthwork & Cross-Section Generic Engine
 * Deterministic calculation of Road Cut, Fill, Embankment, Excavation,
 * Borrow Material, and Disposal using Average End Area method and geometric cross-sections.
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface CrossSectionStation {
  station: string;
  chainageMeters: number;
  cutAreaM2: number;
  fillAreaM2: number;
}

export interface RoadEarthworkInput {
  lengthMeters?: number;
  formationWidthMeters?: number; // Roadbed width (e.g. 7.0m or 10.0m)
  averageCutDepthMeters?: number;
  averageFillHeightMeters?: number;
  cutSideSlope?: number; // H:V (e.g. 1:1 = 1.0)
  fillSideSlope?: number; // H:V (e.g. 1.5:1 = 1.5)
  area1CutM2?: number; // Station 1 cut area
  area2CutM2?: number; // Station 2 cut area
  area1FillM2?: number; // Station 1 fill area
  area2FillM2?: number; // Station 2 fill area
  stations?: CrossSectionStation[];
  strippingDepthMeters?: number; // Topsoil stripping
  borrowSourceDistanceKm?: number;
  disposalDistanceKm?: number;
}

export interface RoadEarthworkResult {
  totalCutVolumeM3: number;
  totalFillVolumeM3: number;
  netVolumeM3: number; // positive = net cut (surplus), negative = net fill (deficit)
  embankmentVolumeM3: number; // Volume of compacted fill body
  excavationVolumeM3: number; // Total cut excavation
  borrowVolumeRequiredM3: number; // Deficit fill required from borrow pit
  surplusDisposalVolumeM3: number; // Surplus cut needing disposal
  topsoilStrippingVolumeM3: number;
  averageCutAreaM2: number;
  averageFillAreaM2: number;
  lengthMeters: number;
  stationSegmentsCount: number;
  method: 'AVERAGE_END_AREA' | 'GEOMETRIC_PRISM';
  warnings: string[];
}

export interface EndAreaStationItem {
  station: string;
  cutArea: number;
  fillArea: number;
  distanceToNext: number;
}

export interface AverageEndAreaStationResult {
  totalCutVolume: number;
  totalFillVolume: number;
  netBalance: number;
  disposalSurplus: number;
  borrowDeficit: number;
}

export class RoadEarthworkEngine {
  /**
   * Average End Area calculation:
   * Supports either:
   * 1. 2 stations: (a1, a2, length) -> number
   * 2. Station array: (stations: EndAreaStationItem[]) -> AverageEndAreaStationResult
   */
  public static calculateAverageEndArea(a1OrStations: number | EndAreaStationItem[], a2?: number, length?: number): any {
    if (Array.isArray(a1OrStations)) {
      let totalCut = 0;
      let totalFill = 0;
      for (let i = 0; i < a1OrStations.length - 1; i++) {
        const s1 = a1OrStations[i];
        const s2 = a1OrStations[i + 1];
        const dist = s1.distanceToNext > 0 ? s1.distanceToNext : 0;
        const meanCut = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(s1.cutArea, s2.cutArea), 2, 4);
        const meanFill = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(s1.fillArea, s2.fillArea), 2, 4);
        totalCut = SafeDecimalEngine.safeAdd(totalCut, SafeDecimalEngine.safeMultiply(meanCut, dist, 3));
        totalFill = SafeDecimalEngine.safeAdd(totalFill, SafeDecimalEngine.safeMultiply(meanFill, dist, 3));
      }
      const net = SafeDecimalEngine.safeSubtract(totalCut, totalFill);
      const disposal = net > 0 ? net : 0;
      const borrow = net < 0 ? Math.abs(net) : 0;
      return {
        totalCutVolume: totalCut,
        totalFillVolume: totalFill,
        netBalance: net,
        disposalSurplus: disposal,
        borrowDeficit: borrow,
      };
    }

    const validA1 = Math.max(0, SafeDecimalEngine.sanitize(a1OrStations, 0));
    const validA2 = Math.max(0, SafeDecimalEngine.sanitize(a2 || 0, 0));
    const validL = Math.max(0, SafeDecimalEngine.sanitize(length || 0, 0));
    const meanArea = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(validA1, validA2), 2, 4);
    return SafeDecimalEngine.safeMultiply(meanArea, validL, 3);
  }

  /**
   * Calculate Trapezoidal Cross-Section Area: A = b * h + z * h^2
   * where b = formation width, h = cut/fill height, z = side slope (H:V)
   */
  public static calculateTrapezoidSectionArea(width: number, height: number, sideSlope: number): number {
    const b = Math.max(0, SafeDecimalEngine.sanitize(width, 0));
    const h = Math.max(0, SafeDecimalEngine.sanitize(height, 0));
    const z = Math.max(0, SafeDecimalEngine.sanitize(sideSlope, 1.0));
    if (h === 0) return 0;
    // A = b*h + z*h^2
    const baseTerm = SafeDecimalEngine.safeMultiply(b, h, 4);
    const slopeTerm = SafeDecimalEngine.safeMultiply(z, Math.pow(h, 2), 4);
    return SafeDecimalEngine.safeAdd(baseTerm, slopeTerm);
  }

  /**
   * Comprehensive Road Earthwork Calculation
   */
  public static calculate(inputs: RoadEarthworkInput): RoadEarthworkResult {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.lengthMeters || 100, 100));
    const formationW = Math.max(0, SafeDecimalEngine.sanitize(inputs.formationWidthMeters || 7.0, 7.0));
    const cutSlope = Math.max(0, SafeDecimalEngine.sanitize(inputs.cutSideSlope || 1.0, 1.0));
    const fillSlope = Math.max(0, SafeDecimalEngine.sanitize(inputs.fillSideSlope || 1.5, 1.5));
    const warnings: string[] = [];

    let totalCut = 0;
    let totalFill = 0;
    let avgCutArea = 0;
    let avgFillArea = 0;
    let segmentsCount = 1;
    let calcMethod: 'AVERAGE_END_AREA' | 'GEOMETRIC_PRISM' = 'AVERAGE_END_AREA';

    // 1. If explicit station array supplied:
    if (inputs.stations && inputs.stations.length >= 2) {
      calcMethod = 'AVERAGE_END_AREA';
      segmentsCount = inputs.stations.length - 1;
      for (let i = 0; i < inputs.stations.length - 1; i++) {
        const s1 = inputs.stations[i];
        const s2 = inputs.stations[i + 1];
        const segLen = Math.max(0, SafeDecimalEngine.safeSubtract(s2.chainageMeters, s1.chainageMeters));
        const segCut = this.calculateAverageEndArea(s1.cutAreaM2, s2.cutAreaM2, segLen);
        const segFill = this.calculateAverageEndArea(s1.fillAreaM2, s2.fillAreaM2, segLen);
        totalCut = SafeDecimalEngine.safeAdd(totalCut, segCut);
        totalFill = SafeDecimalEngine.safeAdd(totalFill, segFill);
      }
      avgCutArea = length > 0 ? SafeDecimalEngine.safeDivide(totalCut, length, 3) : 0;
      avgFillArea = length > 0 ? SafeDecimalEngine.safeDivide(totalFill, length, 3) : 0;
    }
    // 2. If Station A1/A2 areas explicitly supplied:
    else if (inputs.area1CutM2 !== undefined || inputs.area2CutM2 !== undefined || inputs.area1FillM2 !== undefined || inputs.area2FillM2 !== undefined) {
      calcMethod = 'AVERAGE_END_AREA';
      const a1Cut = inputs.area1CutM2 || 0;
      const a2Cut = inputs.area2CutM2 !== undefined ? inputs.area2CutM2 : a1Cut;
      const a1Fill = inputs.area1FillM2 || 0;
      const a2Fill = inputs.area2FillM2 !== undefined ? inputs.area2FillM2 : a1Fill;

      totalCut = this.calculateAverageEndArea(a1Cut, a2Cut, length);
      totalFill = this.calculateAverageEndArea(a1Fill, a2Fill, length);
      avgCutArea = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(a1Cut, a2Cut), 2, 3);
      avgFillArea = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(a1Fill, a2Fill), 2, 3);
    }
    // 3. Otherwise calculate from geometric cut/fill depths:
    else {
      calcMethod = 'GEOMETRIC_PRISM';
      const cutDepth = SafeDecimalEngine.sanitize(inputs.averageCutDepthMeters || 0, 0);
      const fillHeight = SafeDecimalEngine.sanitize(inputs.averageFillHeightMeters || 0, 0);

      const cutSection = this.calculateTrapezoidSectionArea(formationW, cutDepth, cutSlope);
      const fillSection = this.calculateTrapezoidSectionArea(formationW, fillHeight, fillSlope);

      totalCut = SafeDecimalEngine.safeMultiply(cutSection, length, 3);
      totalFill = SafeDecimalEngine.safeMultiply(fillSection, length, 3);
      avgCutArea = cutSection;
      avgFillArea = fillSection;
    }

    // Topsoil stripping
    const strippingDepth = Math.max(0, SafeDecimalEngine.sanitize(inputs.strippingDepthMeters || 0, 0));
    const strippingVol = strippingDepth > 0 ? SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(formationW, length, 3), strippingDepth, 3) : 0;

    // Balance & Mass Distribution
    // Net volume: positive = surplus (excess cut), negative = deficit (excess fill required)
    const netVol = SafeDecimalEngine.safeSubtract(totalCut, totalFill);
    const borrowRequired = netVol < 0 ? Math.abs(netVol) : 0;
    const surplusDisposal = netVol > 0 ? netVol : 0;

    if (totalCut > 0 && totalFill === 0) {
      warnings.push('Pure Cut Section: Seluruh galian menjadi surplus kecuali dialokasikan ke segmen lain.');
    } else if (totalFill > 0 && totalCut === 0) {
      warnings.push('Pure Fill Section: Seluruh timbunan membutuhkan material dari borrow pit.');
    }

    return {
      totalCutVolumeM3: totalCut,
      totalFillVolumeM3: totalFill,
      netVolumeM3: netVol,
      embankmentVolumeM3: totalFill,
      excavationVolumeM3: totalCut,
      borrowVolumeRequiredM3: borrowRequired,
      surplusDisposalVolumeM3: surplusDisposal,
      topsoilStrippingVolumeM3: strippingVol,
      averageCutAreaM2: avgCutArea,
      averageFillAreaM2: avgFillArea,
      lengthMeters: length,
      stationSegmentsCount: segmentsCount,
      method: calcMethod,
      warnings,
    };
  }
}

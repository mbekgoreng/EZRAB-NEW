/**
 * Road Alignment & Stationing Generic Engine
 * Handles road alignment length, chainage parsing/formatting (e.g. STA 0+000),
 * station intervals, and segment breakdown.
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface StationPoint {
  stationId: string; // e.g. "STA 0+000"
  chainageMeters: number; // e.g. 0.0
  elevationExisting?: number;
  elevationDesign?: number;
  cutArea?: number;
  fillArea?: number;
}

export interface RoadAlignmentInput {
  lengthMeters?: number;
  length?: number;
  startChainage?: number | string; // 0 or "0+000"
  endChainage?: number | string; // 1000 or "1+000"
  startStation?: number | string;
  endStation?: number | string;
  pavementWidthMeters?: number;
  pavementWidth?: number;
  stationIntervalMeters?: number; // e.g. 25 or 50
  tangentLength?: number;
  curveLength?: number;
  stations?: StationPoint[];
}

export interface RoadAlignmentResult {
  totalLengthMeters: number;
  totalLength: number;
  startChainageMeters: number;
  endChainageMeters: number;
  startStationId: string;
  endStationId: string;
  stationIntervalMeters: number;
  totalStationsCount: number;
  stationPoints: StationPoint[];
  tangentLengthMeters: number;
  curveLengthMeters: number;
  surfaceArea: number;
  surfaceAreaM2: number;
}

export class RoadAlignmentEngine {
  /**
   * Parse chainage / station string or number into meters.
   * e.g. "STA 0+250" -> 250, "1+250" -> 1250, "0+025.50" -> 25.50, 500 -> 500
   */
  public static parseChainage(val: string | number | undefined, defaultVal = 0): number {
    if (val === undefined || val === null) return defaultVal;
    if (typeof val === 'number') return SafeDecimalEngine.sanitize(val, defaultVal);

    const str = String(val).trim().replace(/^STA\s*/i, '');
    if (!str) return defaultVal;

    if (str.includes('+')) {
      const parts = str.split('+');
      const km = parseFloat(parts[0].replace(/[^\d.-]/g, '')) || 0;
      const m = parseFloat(parts[1].replace(/[^\d.-]/g, '')) || 0;
      return SafeDecimalEngine.safeAdd(km * 1000, m);
    }

    const num = parseFloat(str);
    return isNaN(num) ? defaultVal : num;
  }

  public static parseStation(val: string | number | undefined, defaultVal = 0): number {
    return this.parseChainage(val, defaultVal);
  }

  /**
   * Format chainage meters into standard road notation: STA KM+MMM or STA KM+MMM.mm
   * e.g. 0 -> "STA 0+000", 25 -> "STA 0+025", 1250.5 -> "STA 1+250.5"
   */
  public static formatStation(meters: number): string {
    const total = Math.max(0, SafeDecimalEngine.sanitize(meters, 0));
    const km = Math.floor(total / 1000);
    const m = SafeDecimalEngine.safeRound(total % 1000, 3);
    if (Number.isInteger(m)) {
      return `STA ${km}+${String(m).padStart(3, '0')}`;
    }
    const decParts = String(m).split('.');
    const intPart = decParts[0].padStart(3, '0');
    const fracPart = decParts[1] || '';
    return `STA ${km}+${intPart}.${fracPart}`;
  }

  /**
   * Generate explicit station interval list
   */
  public static generateStationIntervals(startM: number, endM: number, intervalM: number): Array<{ stationLabel: string; chainageMeters: number }> {
    const start = Math.min(startM, endM);
    const end = Math.max(startM, endM);
    const step = Math.max(1, intervalM);
    const result: Array<{ stationLabel: string; chainageMeters: number }> = [];

    for (let c = start; c <= end; c += step) {
      result.push({
        stationLabel: this.formatStation(c),
        chainageMeters: c,
      });
    }

    if (result.length === 0 || result[result.length - 1].chainageMeters < end) {
      result.push({
        stationLabel: this.formatStation(end),
        chainageMeters: end,
      });
    }

    return result;
  }

  /**
   * Calculate Alignment Geometry & Station Breakdown
   */
  public static calculateAlignment(inputs: RoadAlignmentInput): RoadAlignmentResult {
    let startM = this.parseChainage(inputs.startChainage !== undefined ? inputs.startChainage : inputs.startStation, 0);
    let endM = this.parseChainage(inputs.endChainage !== undefined ? inputs.endChainage : inputs.endStation, 0);
    let lengthM = SafeDecimalEngine.sanitize(inputs.lengthMeters !== undefined ? inputs.lengthMeters : (inputs.length || 0), 0);

    if (lengthM <= 0 && endM > startM) {
      lengthM = SafeDecimalEngine.safeSubtract(endM, startM);
    } else if (lengthM > 0 && endM <= startM) {
      endM = SafeDecimalEngine.safeAdd(startM, lengthM);
    } else if (lengthM <= 0 && endM <= startM) {
      lengthM = 1000; // default 1 km
      startM = 0;
      endM = 1000;
    }

    const interval = Math.max(1, SafeDecimalEngine.sanitize(inputs.stationIntervalMeters || 25, 25));
    const tangentL = inputs.tangentLength !== undefined ? SafeDecimalEngine.sanitize(inputs.tangentLength, lengthM) : lengthM;
    const curveL = inputs.curveLength !== undefined ? SafeDecimalEngine.sanitize(inputs.curveLength, 0) : 0;
    const width = SafeDecimalEngine.sanitize(inputs.pavementWidthMeters !== undefined ? inputs.pavementWidthMeters : (inputs.pavementWidth || 7.0), 7.0);
    const surfaceArea = SafeDecimalEngine.safeMultiply(lengthM, width, 3);

    // Build station grid
    const stationCount = Math.floor(lengthM / interval) + 1;
    const points: StationPoint[] = [];

    for (let i = 0; i < stationCount; i++) {
      const curM = SafeDecimalEngine.safeAdd(startM, i * interval);
      points.push({
        stationId: this.formatStation(curM),
        chainageMeters: curM,
      });
    }

    // Add exact end station if not aligning exactly on interval
    if (points[points.length - 1].chainageMeters < endM) {
      points.push({
        stationId: this.formatStation(endM),
        chainageMeters: endM,
      });
    }

    return {
      totalLengthMeters: lengthM,
      totalLength: lengthM,
      startChainageMeters: startM,
      endChainageMeters: endM,
      startStationId: this.formatStation(startM),
      endStationId: this.formatStation(endM),
      stationIntervalMeters: interval,
      totalStationsCount: points.length,
      stationPoints: points,
      tangentLengthMeters: tangentL,
      curveLengthMeters: curveL,
      surfaceArea: surfaceArea,
      surfaceAreaM2: surfaceArea,
    };
  }
}

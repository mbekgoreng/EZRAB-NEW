/**
 * Road Safety Accessories Generic Engine
 * Handles Road Markings, Guardrails, Traffic Barriers, Delineators, and Sign Foundations.
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface RoadMarkingInput {
  markingType: 'SOLID_LINE' | 'BROKEN_LINE' | 'CHEVRON' | 'PEDESTRIAN_ZEBRA' | 'ARROW';
  lineLengthMeters?: number;
  lineWidthMeters?: number; // e.g. 0.12m or 0.15m
  markingsCount?: number;
  stripeLengthMeters?: number; // e.g. 3.0m
  gapLengthMeters?: number; // e.g. 5.0m
  customAreaM2?: number;
}

export interface GuardrailInput {
  routeLengthMeters: number;
  postSpacingMeters?: number; // e.g. 2.0m or 4.0m (DO NOT infer if missing)
  terminalEndsCount?: number; // e.g. 2
  reflectorCountPerPost?: number; // e.g. 1
}

export interface TrafficBarrierInput {
  routeLengthMeters: number;
  barrierType: 'JERSEY_PRECAST' | 'JERSEY_CAST_IN_PLACE' | 'PARAPET';
  moduleLengthMeters?: number; // e.g. 2.0m per block
  crossSectionAreaM2?: number; // e.g. 0.25 m2
}

export interface SignFoundationInput {
  signsCount: number;
  foundationLengthMeters: number;
  foundationWidthMeters: number;
  foundationDepthMeters: number;
}

export class RoadSafetyAccessoriesEngine {
  /**
   * Road Marking Takeoff (Paint Area in m2)
   */
  public static calculateMarking(inputs: RoadMarkingInput) {
    const lineWidth = Math.max(0, SafeDecimalEngine.sanitize(inputs.lineWidthMeters || 0.12, 0.12));
    const warnings: string[] = [];
    let paintArea = 0;
    let effectiveLength = 0;

    if (inputs.customAreaM2 !== undefined && inputs.customAreaM2 > 0) {
      paintArea = SafeDecimalEngine.sanitize(inputs.customAreaM2, 0);
    } else if (inputs.markingType === 'SOLID_LINE') {
      const len = Math.max(0, SafeDecimalEngine.sanitize(inputs.lineLengthMeters || 0, 0));
      const count = Math.max(1, SafeDecimalEngine.sanitize(inputs.markingsCount || 1, 1));
      effectiveLength = SafeDecimalEngine.safeMultiply(len, count, 2);
      paintArea = SafeDecimalEngine.safeMultiply(effectiveLength, lineWidth, 3);
    } else if (inputs.markingType === 'BROKEN_LINE') {
      const len = Math.max(0, SafeDecimalEngine.sanitize(inputs.lineLengthMeters || 0, 0));
      const stripe = Math.max(0.1, SafeDecimalEngine.sanitize(inputs.stripeLengthMeters || 3.0, 3.0));
      const gap = Math.max(0.1, SafeDecimalEngine.sanitize(inputs.gapLengthMeters || 5.0, 5.0));
      const cycle = SafeDecimalEngine.safeAdd(stripe, gap);
      const ratio = SafeDecimalEngine.safeDivide(stripe, cycle, 4);
      effectiveLength = SafeDecimalEngine.safeMultiply(len, ratio, 2);
      paintArea = SafeDecimalEngine.safeMultiply(effectiveLength, lineWidth, 3);
    } else if (inputs.markingType === 'ARROW' || inputs.markingType === 'PEDESTRIAN_ZEBRA' || inputs.markingType === 'CHEVRON') {
      const len = Math.max(0, SafeDecimalEngine.sanitize(inputs.lineLengthMeters || 0, 0));
      const count = Math.max(1, SafeDecimalEngine.sanitize(inputs.markingsCount || 1, 1));
      effectiveLength = SafeDecimalEngine.safeMultiply(len, count, 2);
      paintArea = SafeDecimalEngine.safeMultiply(effectiveLength, lineWidth, 3);
    }

    return {
      markingType: inputs.markingType,
      lineWidthMeters: lineWidth,
      effectiveLengthMeters: effectiveLength,
      paintAreaM2: paintArea,
      warnings,
    };
  }

  /**
   * Guardrail Takeoff
   */
  public static calculateGuardrail(inputs: GuardrailInput) {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.routeLengthMeters, 0));
    const warnings: string[] = [];

    let postsCount: number | undefined = undefined;
    if (inputs.postSpacingMeters !== undefined && inputs.postSpacingMeters > 0) {
      postsCount = Math.floor(length / inputs.postSpacingMeters) + 1;
    } else {
      warnings.push('NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE: Jarak antar tiang (post spacing) harus ditentukan.');
    }

    const terminals = Math.max(0, SafeDecimalEngine.sanitize(inputs.terminalEndsCount || 2, 2));
    const reflectors = postsCount !== undefined ? postsCount * (inputs.reflectorCountPerPost || 1) : undefined;

    return {
      beamLengthMeters: length,
      postsCount,
      terminalEndsCount: terminals,
      reflectorsCount: reflectors,
      warnings,
    };
  }

  /**
   * Traffic Barrier Takeoff
   */
  public static calculateBarrier(inputs: TrafficBarrierInput) {
    const length = Math.max(0, SafeDecimalEngine.sanitize(inputs.routeLengthMeters, 0));
    const sectionArea = Math.max(0, SafeDecimalEngine.sanitize(inputs.crossSectionAreaM2 || 0.25, 0.25));
    const concreteVolume = SafeDecimalEngine.safeMultiply(sectionArea, length, 3);

    const moduleLen = inputs.moduleLengthMeters || 2.0;
    const piecesCount = moduleLen > 0 ? Math.ceil(length / moduleLen) : undefined;

    return {
      routeLengthMeters: length,
      crossSectionAreaM2: sectionArea,
      concreteVolumeM3: concreteVolume,
      piecesCount,
    };
  }

  /**
   * Road Delineator Takeoff (Count)
   */
  public static calculateDelineator(count: number, lengthMeters?: number) {
    const validCount = Math.max(0, Math.floor(SafeDecimalEngine.sanitize(count, 0)));
    return {
      delineatorCount: validCount,
      routeLengthMeters: lengthMeters || 0,
    };
  }

  /**
   * Road Sign Foundation Takeoff
   */
  public static calculateSignFoundation(inputs: SignFoundationInput) {
    const count = Math.max(1, Math.floor(SafeDecimalEngine.sanitize(inputs.signsCount || 1, 1)));
    const l = Math.max(0, SafeDecimalEngine.sanitize(inputs.foundationLengthMeters || 0.60, 0.60));
    const w = Math.max(0, SafeDecimalEngine.sanitize(inputs.foundationWidthMeters || 0.60, 0.60));
    const d = Math.max(0, SafeDecimalEngine.sanitize(inputs.foundationDepthMeters || 0.80, 0.80));

    const unitVolume = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(l, w, 4), d, 4);
    const totalConcreteVolume = SafeDecimalEngine.safeMultiply(unitVolume, count, 3);
    const totalExcavationVolume = totalConcreteVolume; // In-situ foundation hole
    const formworkAreaPerUnit = SafeDecimalEngine.safeMultiply(2 * (l + w), d, 3);
    const totalFormworkArea = SafeDecimalEngine.safeMultiply(formworkAreaPerUnit, count, 2);

    return {
      signsCount: count,
      dimensions: { lengthM: l, widthM: w, depthM: d },
      unitConcreteVolumeM3: unitVolume,
      totalConcreteVolumeM3: totalConcreteVolume,
      totalExcavationVolumeM3: totalExcavationVolume,
      totalFormworkAreaM2: totalFormworkArea,
    };
  }
}

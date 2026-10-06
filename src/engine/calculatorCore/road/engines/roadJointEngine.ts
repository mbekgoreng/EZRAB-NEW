/**
 * Road Joint Generic Engine (Rigid Pavement Joints & Expansion Joints)
 * Deterministic calculation of joint lengths, dowels, tie bars, and joint sealant.
 */

import { SafeDecimalEngine } from '../../../safeDecimalEngine';

export interface PavementJointInput {
  pavementLengthMeters: number;
  pavementWidthMeters: number;
  transverseJointSpacingMeters?: number; // e.g. 5.0m (DO NOT infer if missing)
  lanesCount?: number; // e.g. 2 lanes -> 1 longitudinal joint
  dowelDiameterMm?: number; // e.g. 25mm or 32mm
  dowelLengthMeters?: number; // e.g. 0.45m
  dowelSpacingMeters?: number; // e.g. 0.30m
  tieBarDiameterMm?: number; // e.g. 16mm
  tieBarLengthMeters?: number; // e.g. 0.60m
  tieBarSpacingMeters?: number; // e.g. 0.75m
  sealantWidthMeters?: number; // e.g. 0.006m (6mm)
  sealantDepthMeters?: number; // e.g. 0.025m (25mm)
}

export interface ExpansionJointInput {
  jointLengthMeters: number;
  jointWidthMeters?: number; // e.g. 0.02m (20mm expansion gap)
  pavementThicknessMeters?: number; // e.g. 0.25m
  fillerMaterialAreaM2?: number;
}

export class RoadJointEngine {
  /**
   * Rigid Pavement Joint System Takeoff
   */
  public static calculatePavementJoints(inputs: PavementJointInput) {
    const roadLen = Math.max(0, SafeDecimalEngine.sanitize(inputs.pavementLengthMeters, 0));
    const roadW = Math.max(0, SafeDecimalEngine.sanitize(inputs.pavementWidthMeters, 0));
    const lanes = Math.max(1, SafeDecimalEngine.sanitize(inputs.lanesCount || 2, 2));
    const warnings: string[] = [];

    // Longitudinal joint length: (lanes - 1) * roadLen
    const longJointLines = Math.max(0, lanes - 1);
    const totalLongitudinalJointM = SafeDecimalEngine.safeMultiply(longJointLines, roadLen, 2);

    // Transverse joint length:
    let transJointCount = 0;
    let totalTransverseJointM = 0;

    if (inputs.transverseJointSpacingMeters !== undefined && inputs.transverseJointSpacingMeters > 0) {
      const spacing = inputs.transverseJointSpacingMeters;
      transJointCount = Math.floor(roadLen / spacing);
      totalTransverseJointM = SafeDecimalEngine.safeMultiply(transJointCount, roadW, 2);
    } else {
      warnings.push('NOT VERIFIED — REQUIRES AUTHORITATIVE SOURCE: Jarak sambungan susut (transverse joint spacing) harus ditentukan.');
    }

    const totalJointLengthM = SafeDecimalEngine.safeAdd(totalLongitudinalJointM, totalTransverseJointM);

    // Dowel Bars (Transverse Joints)
    let totalDowelsCount = 0;
    let totalDowelWeightKg = 0;
    if (transJointCount > 0 && inputs.dowelSpacingMeters && inputs.dowelSpacingMeters > 0) {
      const dowelsPerJoint = Math.floor(roadW / inputs.dowelSpacingMeters) + 1;
      totalDowelsCount = transJointCount * dowelsPerJoint;
      const d = inputs.dowelDiameterMm || 25;
      const len = inputs.dowelLengthMeters || 0.45;
      // Unit weight: d^2 * 0.006165 kg/m
      const unitWeight = SafeDecimalEngine.safeMultiply(Math.pow(d, 2), 0.006165, 4);
      const weightPerBar = SafeDecimalEngine.safeMultiply(len, unitWeight, 4);
      totalDowelWeightKg = SafeDecimalEngine.safeMultiply(totalDowelsCount, weightPerBar, 2);
    }

    // Tie Bars (Longitudinal Joints)
    let totalTieBarsCount = 0;
    let totalTieBarWeightKg = 0;
    if (totalLongitudinalJointM > 0 && inputs.tieBarSpacingMeters && inputs.tieBarSpacingMeters > 0) {
      totalTieBarsCount = Math.floor(totalLongitudinalJointM / inputs.tieBarSpacingMeters) + 1;
      const d = inputs.tieBarDiameterMm || 16;
      const len = inputs.tieBarLengthMeters || 0.60;
      const unitWeight = SafeDecimalEngine.safeMultiply(Math.pow(d, 2), 0.006165, 4);
      const weightPerBar = SafeDecimalEngine.safeMultiply(len, unitWeight, 4);
      totalTieBarWeightKg = SafeDecimalEngine.safeMultiply(totalTieBarsCount, weightPerBar, 2);
    }

    // Joint Sealant Volume: Total joint length * width * depth
    const sw = inputs.sealantWidthMeters || 0.006;
    const sd = inputs.sealantDepthMeters || 0.025;
    const sealantSectionM2 = SafeDecimalEngine.safeMultiply(sw, sd, 6);
    const sealantVolumeM3 = SafeDecimalEngine.safeMultiply(totalJointLengthM, sealantSectionM2, 4);

    return {
      totalJointLengthMeters: totalJointLengthM,
      longitudinalJointLengthMeters: totalLongitudinalJointM,
      transverseJointLengthMeters: totalTransverseJointM,
      transverseJointsCount: transJointCount,
      dowelsCount: totalDowelsCount,
      dowelWeightKg: totalDowelWeightKg,
      tieBarsCount: totalTieBarsCount,
      tieBarWeightKg: totalTieBarWeightKg,
      sealantVolumeM3,
      warnings,
    };
  }

  /**
   * Expansion Joint Takeoff
   */
  public static calculateExpansionJoint(inputs: ExpansionJointInput) {
    const len = Math.max(0, SafeDecimalEngine.sanitize(inputs.jointLengthMeters, 0));
    const gapW = Math.max(0, SafeDecimalEngine.sanitize(inputs.jointWidthMeters || 0.02, 0.02));
    const t = Math.max(0, SafeDecimalEngine.sanitize(inputs.pavementThicknessMeters || 0.25, 0.25));

    const fillerArea = SafeDecimalEngine.safeMultiply(len, t, 3);
    const fillerVolume = SafeDecimalEngine.safeMultiply(fillerArea, gapW, 4);

    return {
      jointLengthMeters: len,
      gapWidthMeters: gapW,
      pavementThicknessMeters: t,
      fillerMaterialAreaM2: fillerArea,
      fillerMaterialVolumeM3: fillerVolume,
    };
  }
}

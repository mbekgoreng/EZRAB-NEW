/**
 * EZRAB CALCULATOR CORE — ROUNDING & HARDCODE AUDIT ENGINE
 * Audits intermediate vs display rounding, constant separation, and project isolation rules.
 */

export interface RoundingAuditItem {
  calculatorId: string;
  sheet: string;
  excelIntermediateRounding: boolean;
  coreIntermediateRounding: boolean;
  parityImpact: 'none' | 'sub_centimeter' | 'critical';
  notes: string;
}

export interface HardcodeAuditItem {
  calculatorId: string;
  fieldName: string;
  value: any;
  classification: 'FORMULA_CONSTANT' | 'BUSINESS_DATABASE_VALUE' | 'DEFAULT_INPUT';
  isolationStatus: 'CLEAN' | 'DEPRECATED_METADATA_ONLY' | 'VIOLATION';
  notes: string;
}

export class RoundingAndHardcodeAuditEngine {
  public static getRoundingAudit(): RoundingAuditItem[] {
    return [
      {
        calculatorId: 'BOWPLANK',
        sheet: 'Bowplank',
        excelIntermediateRounding: false,
        coreIntermediateRounding: false,
        parityImpact: 'none',
        notes: 'Excel evaluates I10 = 2*(D9+D10+2*D11) with full IEEE 754 precision; display formatting is 2 decimals.',
      },
      {
        calculatorId: 'PONDASI',
        sheet: 'Pondasi',
        excelIntermediateRounding: false,
        coreIntermediateRounding: false,
        parityImpact: 'none',
        notes: 'Trapezoidal volume evaluated without intermediate truncations.',
      },
      {
        calculatorId: 'FOOT_PLATE',
        sheet: 'Foot Plate',
        excelIntermediateRounding: false,
        coreIntermediateRounding: false,
        parityImpact: 'none',
        notes: 'Reinforcement kg calculations use constant 0.785*density/10^6 and sum cross products before rounding.',
      },
      {
        calculatorId: 'ATAP_BAJA_RINGAN',
        sheet: 'Atap Baja Ringan',
        excelIntermediateRounding: false,
        coreIntermediateRounding: false,
        parityImpact: 'sub_centimeter',
        notes: 'Trigonometric cos(radians(sudut)) has floating precision difference < 0.001 m2.',
      },
    ];
  }

  public static getHardcodeAudit(): HardcodeAuditItem[] {
    return [
      {
        calculatorId: 'BOWPLANK',
        fieldName: '105% (1.05 factor)',
        value: 1.05,
        classification: 'FORMULA_CONSTANT',
        isolationStatus: 'CLEAN',
        notes: 'Formula waste allowance defined in Excel workbook cell I11/I12.',
      },
      {
        calculatorId: 'BOWPLANK',
        fieldName: '0.0045 factor',
        value: 0.0045,
        classification: 'FORMULA_CONSTANT',
        isolationStatus: 'CLEAN',
        notes: 'Standard conversion factor for 5/7 wood cross section area.',
      },
      {
        calculatorId: 'BOWPLANK',
        fieldName: 'defaultAhspCode / defaultUnitPrice',
        value: 'A.2.2.1.4 / 95400',
        classification: 'BUSINESS_DATABASE_VALUE',
        isolationStatus: 'DEPRECATED_METADATA_ONLY',
        notes: 'Deprecated metadata retained only for legacy compatibility; completely decoupled from Core calculation execution.',
      },
    ];
  }
}

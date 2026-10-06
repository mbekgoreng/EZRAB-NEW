/**
 * EZRAB UNIT DIMENSIONAL VALIDATOR
 *
 * Enforces strict physical dimensionality checks across:
 * - AHSP unit
 * - Resource unit
 * - Quantity unit
 * - Price unit
 *
 * Strict Rule: Cross-dimensional conversions (e.g. mass to volume, area to volume, labor to mass)
 * are categorically forbidden and return BLOCKED.
 */

export type UnitDimension = 'MASS' | 'VOLUME' | 'AREA' | 'LENGTH' | 'TIME_LABOR' | 'DISCRETE' | 'UNKNOWN';

export interface UnitValidationReport {
  unit: string;
  dimension: UnitDimension;
  isValid: boolean;
  standardBaseUnit?: string;
  errorMessage?: string;
}

export interface DimensionalConversionCheck {
  allowed: boolean;
  fromUnit: string;
  toUnit: string;
  fromDimension: UnitDimension;
  toDimension: UnitDimension;
  conversionFactor?: number;
  reason: string;
}

export class UnitDimensionalValidator {
  private static readonly DIMENSION_MAP: Record<string, UnitDimension> = {
    // Mass
    kg: 'MASS',
    kilogram: 'MASS',
    ton: 'MASS',
    t: 'MASS',
    gram: 'MASS',
    gr: 'MASS',

    // Volume
    m3: 'VOLUME',
    'm³': 'VOLUME',
    liter: 'VOLUME',
    ltr: 'VOLUME',
    l: 'VOLUME',
    dm3: 'VOLUME',

    // Area
    m2: 'AREA',
    'm²': 'AREA',
    cm2: 'AREA',
    'cm²': 'AREA',
    mm2: 'AREA',
    'mm²': 'AREA',

    // Length
    m: 'LENGTH',
    'm\'': 'LENGTH',
    meter: 'LENGTH',
    cm: 'LENGTH',
    mm: 'LENGTH',
    km: 'LENGTH',

    // Time / Labor
    oh: 'TIME_LABOR',
    jam: 'TIME_LABOR',
    hari: 'TIME_LABOR',
    bulan: 'TIME_LABOR',

    // Discrete / Items
    unit: 'DISCRETE',
    buah: 'DISCRETE',
    bh: 'DISCRETE',
    btg: 'DISCRETE',
    batang: 'DISCRETE',
    lbr: 'DISCRETE',
    lembar: 'DISCRETE',
    sak: 'DISCRETE',
    zak: 'DISCRETE',
    roll: 'DISCRETE',
    ls: 'DISCRETE',
    lump_sum: 'DISCRETE',
  };

  public static getDimension(unit: string): UnitDimension {
    if (!unit) return 'UNKNOWN';
    const norm = unit.toLowerCase().trim();
    return this.DIMENSION_MAP[norm] || 'UNKNOWN';
  }

  /**
   * Validate that two units are physically compatible for conversion.
   * If physically incommensurable (e.g. kg vs m3, m2 vs m3, OH vs kg), conversion is BLOCKED.
   */
  public static canConvert(fromUnit: string, toUnit: string): DimensionalConversionCheck {
    const fromDim = this.getDimension(fromUnit);
    const toDim = this.getDimension(toUnit);

    const normFrom = fromUnit.toLowerCase().trim();
    const normTo = toUnit.toLowerCase().trim();

    // Same unit
    if (normFrom === normTo) {
      return {
        allowed: true,
        fromUnit,
        toUnit,
        fromDimension: fromDim,
        toDimension: toDim,
        conversionFactor: 1.0,
        reason: 'Identical unit',
      };
    }

    if (fromDim === 'UNKNOWN' || toDim === 'UNKNOWN') {
      return {
        allowed: false,
        fromUnit,
        toUnit,
        fromDimension: fromDim,
        toDimension: toDim,
        reason: `Cannot convert unverified dimension: "${fromUnit}" (${fromDim}) to "${toUnit}" (${toDim})`,
      };
    }

    // Cross-dimensional check: MUST be same physical dimension
    if (fromDim !== toDim) {
      return {
        allowed: false,
        fromUnit,
        toUnit,
        fromDimension: fromDim,
        toDimension: toDim,
        reason: `DIMENSIONAL_CONVERSION_BLOCKED: Incompatible physical dimensions. Cannot convert ${fromDim} (${fromUnit}) to ${toDim} (${toUnit}).`,
      };
    }

    // Intra-dimensional conversion factors
    let factor = 1.0;

    // Mass
    if (fromDim === 'MASS') {
      if ((normFrom === 'ton' || normFrom === 't') && normTo === 'kg') factor = 1000;
      else if (normFrom === 'kg' && (normTo === 'ton' || normTo === 't')) factor = 0.001;
      else if (normFrom === 'gram' && normTo === 'kg') factor = 0.001;
      else if (normFrom === 'kg' && normTo === 'gram') factor = 1000;
    }

    // Volume
    else if (fromDim === 'VOLUME') {
      if ((normFrom === 'm3' || normFrom === 'm³') && (normTo === 'liter' || normTo === 'l')) factor = 1000;
      else if ((normFrom === 'liter' || normFrom === 'l') && (normTo === 'm3' || normTo === 'm³')) factor = 0.001;
    }

    // Length
    else if (fromDim === 'LENGTH') {
      if (normFrom === 'm' && normTo === 'cm') factor = 100;
      else if (normFrom === 'cm' && normTo === 'm') factor = 0.01;
      else if (normFrom === 'm' && normTo === 'mm') factor = 1000;
      else if (normFrom === 'mm' && normTo === 'm') factor = 0.001;
    }

    // Area
    else if (fromDim === 'AREA') {
      if ((normFrom === 'm2' || normFrom === 'm²') && (normTo === 'cm2' || normTo === 'cm²')) factor = 10000;
      else if ((normFrom === 'cm2' || normFrom === 'cm²') && (normTo === 'm2' || normTo === 'm²')) factor = 0.0001;
    }

    // Time / Labor: 1 OH (Orang Hari) = 7 Jam kerja standar SNI/PUPR
    else if (fromDim === 'TIME_LABOR') {
      if (normFrom === 'oh' && normTo === 'jam') factor = 7;
      else if (normFrom === 'jam' && normTo === 'oh') factor = 1 / 7;
    }

    return {
      allowed: true,
      fromUnit,
      toUnit,
      fromDimension: fromDim,
      toDimension: toDim,
      conversionFactor: factor,
      reason: `Valid intra-dimensional conversion (${fromDim}): 1 ${fromUnit} = ${factor} ${toUnit}`,
    };
  }

  /**
   * Validate the 4-part unit chain of a construction cost calculation:
   * quantityUnit -> ahspUnit -> resourceUnit -> priceUnit
   */
  public static validateUnitChain(
    quantityUnit: string,
    ahspUnit: string,
    resourceUnit: string,
    priceUnit: string
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Quantity vs AHSP
    const checkQtyAhsp = this.canConvert(quantityUnit, ahspUnit);
    if (!checkQtyAhsp.allowed) {
      errors.push(`Takeoff quantity unit "${quantityUnit}" incompatible with AHSP unit "${ahspUnit}": ${checkQtyAhsp.reason}`);
    }

    // 2. Resource vs Price
    const checkResPrice = this.canConvert(resourceUnit, priceUnit);
    if (!checkResPrice.allowed) {
      errors.push(`AHSP component resource unit "${resourceUnit}" incompatible with price unit "${priceUnit}": ${checkResPrice.reason}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

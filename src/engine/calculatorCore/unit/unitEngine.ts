/**
 * EZRAB CALCULATOR CORE — UNIT ENGINE
 * Deterministic, dimensional unit conversion and normalization.
 */

import { UnitDefinition } from '../contracts/types';
import { Decimal } from 'decimal.js';

export class UnitConversionError extends Error {
  public readonly fromUnit: string;
  public readonly toUnit: string;

  constructor(message: string, fromUnit: string, toUnit: string) {
    super(message);
    this.name = 'UnitConversionError';
    this.fromUnit = fromUnit;
    this.toUnit = toUnit;
  }
}

export class UnitEngine {
  private static units: Map<string, UnitDefinition> = new Map();
  private static aliasMap: Map<string, string> = new Map();

  static {
    UnitEngine.initializeDefaultUnits();
  }

  private static initializeDefaultUnits() {
    const definitions: UnitDefinition[] = [
      // 1. Length (Base: m)
      {
        code: 'm',
        name: 'Meter',
        category: 'length',
        symbol: 'm',
        baseUnit: 'm',
        conversionToBase: 1,
        aliases: ['meter', 'm\'', 'm1', 'ml', 'mtr'],
      },
      {
        code: 'cm',
        name: 'Centimeter',
        category: 'length',
        symbol: 'cm',
        baseUnit: 'm',
        conversionToBase: 0.01,
        aliases: ['centimeter', 'centi'],
      },
      {
        code: 'mm',
        name: 'Millimeter',
        category: 'length',
        symbol: 'mm',
        baseUnit: 'm',
        conversionToBase: 0.001,
        aliases: ['millimeter', 'mili'],
      },

      // 2. Area (Base: m2)
      {
        code: 'm2',
        name: 'Meter Persegi',
        category: 'area',
        symbol: 'm²',
        baseUnit: 'm2',
        conversionToBase: 1,
        aliases: ['m²', 'm^2', 'meter persegi', 'sqm'],
      },
      {
        code: 'cm2',
        name: 'Centimeter Persegi',
        category: 'area',
        symbol: 'cm²',
        baseUnit: 'm2',
        conversionToBase: 0.0001,
        aliases: ['cm²', 'cm^2', 'centimeter persegi'],
      },
      {
        code: 'mm2',
        name: 'Millimeter Persegi',
        category: 'area',
        symbol: 'mm²',
        baseUnit: 'm2',
        conversionToBase: 0.000001,
        aliases: ['mm²', 'mm^2', 'millimeter persegi'],
      },

      // 3. Volume (Base: m3)
      {
        code: 'm3',
        name: 'Meter Kubik',
        category: 'volume',
        symbol: 'm³',
        baseUnit: 'm3',
        conversionToBase: 1,
        aliases: ['m³', 'm^3', 'meter kubik', 'cbm', 'cum'],
      },
      {
        code: 'liter',
        name: 'Liter',
        category: 'volume',
        symbol: 'L',
        baseUnit: 'm3',
        conversionToBase: 0.001,
        aliases: ['l', 'ltr', 'litre'],
      },
      {
        code: 'cm3',
        name: 'Centimeter Kubik',
        category: 'volume',
        symbol: 'cm³',
        baseUnit: 'm3',
        conversionToBase: 0.000001,
        aliases: ['cm³', 'cm^3', 'cc'],
      },
      {
        code: 'mm3',
        name: 'Millimeter Kubik',
        category: 'volume',
        symbol: 'mm³',
        baseUnit: 'm3',
        conversionToBase: 0.000000001,
        aliases: ['mm³', 'mm^3'],
      },

      // 4. Mass (Base: kg)
      {
        code: 'kg',
        name: 'Kilogram',
        category: 'mass',
        symbol: 'kg',
        baseUnit: 'kg',
        conversionToBase: 1,
        aliases: ['kilogram', 'kilo'],
      },
      {
        code: 'ton',
        name: 'Ton',
        category: 'mass',
        symbol: 'ton',
        baseUnit: 'kg',
        conversionToBase: 1000,
        aliases: ['t', 'tonne', 'metrik ton'],
      },
      {
        code: 'g',
        name: 'Gram',
        category: 'mass',
        symbol: 'g',
        baseUnit: 'kg',
        conversionToBase: 0.001,
        aliases: ['gram', 'gr'],
      },

      // 5. Count / Discreet Units (Base: count)
      {
        code: 'bh',
        name: 'Buah',
        category: 'count',
        symbol: 'bh',
        baseUnit: 'bh',
        conversionToBase: 1,
        aliases: ['buah', 'pcs', 'piece', 'biji'],
      },
      {
        code: 'unit',
        name: 'Unit',
        category: 'count',
        symbol: 'unit',
        baseUnit: 'bh',
        conversionToBase: 1,
        aliases: ['unt'],
      },
      {
        code: 'set',
        name: 'Set',
        category: 'count',
        symbol: 'set',
        baseUnit: 'bh',
        conversionToBase: 1,
        aliases: ['pasang'],
      },
      {
        code: 'batang',
        name: 'Batang',
        category: 'count',
        symbol: 'btg',
        baseUnit: 'bh',
        conversionToBase: 1,
        aliases: ['btg', 'lonjor'],
      },
      {
        code: 'sak',
        name: 'Sak / Zak',
        category: 'count',
        symbol: 'sak',
        baseUnit: 'bh',
        conversionToBase: 1,
        aliases: ['zak', 'bag'],
      },
      {
        code: 'titik',
        name: 'Titik',
        category: 'count',
        symbol: 'titik',
        baseUnit: 'bh',
        conversionToBase: 1,
        aliases: ['ttk', 'point'],
      },
      {
        code: 'lembar',
        name: 'Lembar',
        category: 'count',
        symbol: 'lbr',
        baseUnit: 'bh',
        conversionToBase: 1,
        aliases: ['lbr', 'sheet'],
      },
      {
        code: 'roll',
        name: 'Roll',
        category: 'count',
        symbol: 'roll',
        baseUnit: 'bh',
        conversionToBase: 1,
        aliases: ['rol'],
      },

      // 6. Labor / Work Units
      {
        code: 'OH',
        name: 'Orang Hari',
        category: 'time',
        symbol: 'OH',
        baseUnit: 'OH',
        conversionToBase: 1,
        aliases: ['oh', 'harian', 'hari-orang', 'mandays'],
      },
      {
        code: 'jam',
        name: 'Jam Kerja',
        category: 'time',
        symbol: 'jam',
        baseUnit: 'jam',
        conversionToBase: 1,
        aliases: ['hour', 'hrs'],
      },
      {
        code: 'sewa-hari',
        name: 'Sewa Hari',
        category: 'time',
        symbol: 'hari',
        baseUnit: 'sewa-hari',
        conversionToBase: 1,
        aliases: ['hari-sewa'],
      },
    ];

    for (const def of definitions) {
      UnitEngine.registerUnit(def);
    }
  }

  public static registerUnit(def: UnitDefinition): void {
    UnitEngine.units.set(def.code.toLowerCase(), def);
    UnitEngine.aliasMap.set(def.code.toLowerCase(), def.code.toLowerCase());
    for (const alias of def.aliases) {
      UnitEngine.aliasMap.set(alias.toLowerCase(), def.code.toLowerCase());
    }
  }

  public static normalizeUnit(unitStr: string): string {
    if (!unitStr) return '';
    const cleaned = unitStr.trim().toLowerCase();
    const canonical = UnitEngine.aliasMap.get(cleaned);
    return canonical || cleaned;
  }

  public static getUnit(unitStr: string): UnitDefinition | undefined {
    const canonical = UnitEngine.normalizeUnit(unitStr);
    return UnitEngine.units.get(canonical);
  }

  public static areCompatible(unitA: string, unitB: string): boolean {
    const normA = UnitEngine.normalizeUnit(unitA);
    const normB = UnitEngine.normalizeUnit(unitB);
    if (normA === normB) return true;

    const defA = UnitEngine.units.get(normA);
    const defB = UnitEngine.units.get(normB);
    if (!defA || !defB) return false;

    return defA.category === defB.category && defA.baseUnit === defB.baseUnit;
  }

  public static convert(value: number, fromUnit: string, toUnit: string): number {
    const normFrom = UnitEngine.normalizeUnit(fromUnit);
    const normTo = UnitEngine.normalizeUnit(toUnit);

    if (normFrom === normTo) {
      return value;
    }

    const defFrom = UnitEngine.units.get(normFrom);
    const defTo = UnitEngine.units.get(normTo);

    if (!defFrom) {
      throw new UnitConversionError(`Unknown source unit: "${fromUnit}"`, fromUnit, toUnit);
    }
    if (!defTo) {
      throw new UnitConversionError(`Unknown target unit: "${toUnit}"`, fromUnit, toUnit);
    }

    if (defFrom.category !== defTo.category || defFrom.baseUnit !== defTo.baseUnit) {
      throw new UnitConversionError(
        `Incompatible unit dimensions: cannot convert from "${fromUnit}" (${defFrom.category}) to "${toUnit}" (${defTo.category})`,
        fromUnit,
        toUnit
      );
    }

    // High precision conversion via decimal.js
    const decVal = new Decimal(value);
    const decFromFactor = new Decimal(defFrom.conversionToBase);
    const decToFactor = new Decimal(defTo.conversionToBase);

    // Value in base = value * fromFactor
    // Value in target = valueInBase / toFactor
    const valueInBase = decVal.times(decFromFactor);
    const targetValue = valueInBase.dividedBy(decToFactor);

    return targetValue.toNumber();
  }
}

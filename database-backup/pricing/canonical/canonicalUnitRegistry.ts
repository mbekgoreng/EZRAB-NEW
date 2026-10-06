/**
 * EZRAB — CANONICAL UNIT REGISTRY & DIMENSIONAL COMPATIBILITY ENGINE
 * =================================================================
 * Phase 4: Enforces strict canonical engineering units and prevents
 * catastrophic dimensional conversions (e.g., kg -> unit, m3 -> unit).
 */

export type UnitDimension =
  | 'MASS'
  | 'VOLUME'
  | 'AREA'
  | 'LENGTH'
  | 'COUNT'
  | 'LABOR_TIME'
  | 'EQUIPMENT_TIME'
  | 'PACKAGING'
  | 'LUMP_SUM'
  | 'UNKNOWN';

export interface CanonicalUnitDefinition {
  canonicalSymbol: string;
  dimension: UnitDimension;
  aliases: string[];
  description: string;
}

export const CANONICAL_UNITS: Record<string, CanonicalUnitDefinition> = {
  // Mass
  kg: {
    canonicalSymbol: 'kg',
    dimension: 'MASS',
    aliases: ['kg', 'kilogram', 'kilo', 'kgm'],
    description: 'Kilogram (Massa material)',
  },
  ton: {
    canonicalSymbol: 'ton',
    dimension: 'MASS',
    aliases: ['ton', 'tonne', 't'],
    description: 'Ton (1000 kg)',
  },

  // Volume
  m3: {
    canonicalSymbol: 'm3',
    dimension: 'VOLUME',
    aliases: ['m3', 'm³', 'meterkubik', 'meter3', 'kubik'],
    description: 'Meter Kubik (Volume beton, tanah, pasir, batu)',
  },
  liter: {
    canonicalSymbol: 'liter',
    dimension: 'VOLUME',
    aliases: ['liter', 'ltr', 'litre', 'l'],
    description: 'Liter (Volume zat cair, cat, aditif)',
  },

  // Area
  m2: {
    canonicalSymbol: 'm2',
    dimension: 'AREA',
    aliases: ['m2', 'm²', 'meterpersegi', 'meter2'],
    description: 'Meter Persegi (Luas lantai, dinding, plafon, atap, cat)',
  },

  // Length
  m: {
    canonicalSymbol: 'm',
    dimension: 'LENGTH',
    aliases: ['m', 'm1', "m'", 'meter', 'metre', 'mtr'],
    description: 'Meter Panjang (Panjang pipa, lis, profil, kabel)',
  },
  cm: {
    canonicalSymbol: 'cm',
    dimension: 'LENGTH',
    aliases: ['cm', 'centimeter'],
    description: 'Sentimeter',
  },
  mm: {
    canonicalSymbol: 'mm',
    dimension: 'LENGTH',
    aliases: ['mm', 'milimeter'],
    description: 'Milimeter',
  },

  // Count / Discrete
  buah: {
    canonicalSymbol: 'buah',
    dimension: 'COUNT',
    aliases: ['buah', 'bh', 'pcs', 'pc'],
    description: 'Buah (Item diskrit, bata, sanitair, lampu)',
  },
  unit: {
    canonicalSymbol: 'unit',
    dimension: 'COUNT',
    aliases: ['unit'],
    description: 'Unit (Komponen terpasang, AC, panel, pompa)',
  },
  set: {
    canonicalSymbol: 'set',
    dimension: 'COUNT',
    aliases: ['set'],
    description: 'Set (Perangkat lengkap, kunci + handel, sanitair)',
  },
  titik: {
    canonicalSymbol: 'titik',
    dimension: 'COUNT',
    aliases: ['titik', 'ttk'],
    description: 'Titik (Instalasi listrik, stop kontak, saklar)',
  },
  batang: {
    canonicalSymbol: 'batang',
    dimension: 'COUNT',
    aliases: ['batang', 'btg'],
    description: 'Batang (Kayu, pipa, besi utuh per 12m)',
  },
  lembar: {
    canonicalSymbol: 'lembar',
    dimension: 'COUNT',
    aliases: ['lembar', 'lbr'],
    description: 'Lembar (Papan triplek, gypsum, seng, spandek)',
  },

  // Packaging
  sak: {
    canonicalSymbol: 'sak',
    dimension: 'PACKAGING',
    aliases: ['sak', 'zak', 'bag'],
    description: 'Sak (Semen 40kg/50kg, mortar instan)',
  },
  roll: {
    canonicalSymbol: 'roll',
    dimension: 'PACKAGING',
    aliases: ['roll', 'rol'],
    description: 'Roll (Kawat, membran, isolasi)',
  },

  // Labor Time
  OH: {
    canonicalSymbol: 'OH',
    dimension: 'LABOR_TIME',
    aliases: ['OH', 'oh', 'org/hari', 'oranghari', 'orang-hari'],
    description: 'Orang-Hari (Standar hari kerja tenaga kerja PUPR/SNI)',
  },
  OJ: {
    canonicalSymbol: 'OJ',
    dimension: 'LABOR_TIME',
    aliases: ['OJ', 'oj', 'org/jam', 'orangjam', 'orang-jam', 'manhour'],
    description: 'Orang-Jam (Standar jam kerja tenaga kerja)',
  },

  // Equipment Time
  jam: {
    canonicalSymbol: 'jam',
    dimension: 'EQUIPMENT_TIME',
    aliases: ['jam', 'hour', 'hrs', 'hr'],
    description: 'Jam Sewa / Operasi Alat Berat & Mesin',
  },
  hari: {
    canonicalSymbol: 'hari',
    dimension: 'EQUIPMENT_TIME',
    aliases: ['hari', 'day', 'days'],
    description: 'Hari Sewa Alat',
  },
  bulan: {
    canonicalSymbol: 'bulan',
    dimension: 'EQUIPMENT_TIME',
    aliases: ['bulan', 'bln'],
    description: 'Bulan Sewa Alat',
  },

  // Lump Sum
  ls: {
    canonicalSymbol: 'ls',
    dimension: 'LUMP_SUM',
    aliases: ['ls', 'lumpsum', 'lump sum'],
    description: 'Lump Sum (Pekerjaan borongan tak terukur langsung)',
  },
};

export class CanonicalUnitRegistry {
  private static instance: CanonicalUnitRegistry;
  private aliasToCanonical: Map<string, string> = new Map();

  private constructor() {
    for (const [key, def] of Object.entries(CANONICAL_UNITS)) {
      this.aliasToCanonical.set(key.toLowerCase(), def.canonicalSymbol);
      for (const alias of def.aliases) {
        this.aliasToCanonical.set(alias.toLowerCase(), def.canonicalSymbol);
      }
    }
  }

  public static getInstance(): CanonicalUnitRegistry {
    if (!CanonicalUnitRegistry.instance) {
      CanonicalUnitRegistry.instance = new CanonicalUnitRegistry();
    }
    return CanonicalUnitRegistry.instance;
  }

  /**
   * Normalizes any input unit string to its canonical symbol.
   */
  public normalize(unitStr: string | null | undefined): string {
    if (!unitStr) return '';
    const clean = String(unitStr).trim().toLowerCase().replace(/\s+/g, '');
    if (this.aliasToCanonical.has(clean)) {
      return this.aliasToCanonical.get(clean)!;
    }
    // Try stripping trailing punctuation e.g. "m3."
    const stripped = clean.replace(/[.)\]]+$/, '');
    if (this.aliasToCanonical.has(stripped)) {
      return this.aliasToCanonical.get(stripped)!;
    }
    return clean;
  }

  /**
   * Returns the physical engineering dimension of a given unit.
   */
  public getDimension(unitStr: string): UnitDimension {
    const norm = this.normalize(unitStr);
    const def = CANONICAL_UNITS[norm];
    if (def) return def.dimension;
    return 'UNKNOWN';
  }

  /**
   * Strict compatibility check.
   * Returns FALSE if units belong to conflicting physical dimensions
   * (e.g. mass 'kg' cannot be equated to count 'unit' or volume 'm3').
   */
  public areDimensionallyCompatible(unitA: string, unitB: string): boolean {
    const normA = this.normalize(unitA);
    const normB = this.normalize(unitB);

    if (!normA || !normB) return true; // benefit of the doubt if one is unspecified
    if (normA === normB) return true;

    const dimA = this.getDimension(normA);
    const dimB = this.getDimension(normB);

    if (dimA === 'UNKNOWN' || dimB === 'UNKNOWN') {
      return normA === normB;
    }

    // Identical dimension (e.g. kg and ton, or m and cm) is dimensionally compatible
    if (dimA === dimB) return true;

    // Strict dimensional incompatibility (BANNED cross-dimensional coercions)
    return false;
  }

  /**
   * Validates that a work item has an expected engineering unit for its trade.
   */
  public validateTradeUnit(
    itemName: string,
    unit: string,
    category?: string
  ): { isValid: boolean; expectedUnit: string; reason?: string } {
    const lowerName = itemName.toLowerCase();
    const normUnit = this.normalize(unit);
    const dim = this.getDimension(normUnit);

    // 1. Rebar / Steel reinforcement MUST be MASS (kg / ton)
    if (
      lowerName.includes('pembesian') ||
      lowerName.includes('baja tulangan') ||
      lowerName.includes('besi beton') ||
      lowerName.includes('tulangan utama') ||
      lowerName.includes('begel') ||
      lowerName.includes('sengkang')
    ) {
      if (dim !== 'MASS') {
        return {
          isValid: false,
          expectedUnit: 'kg',
          reason: `Pekerjaan pembesian "${itemName}" wajib menggunakan satuan massa (kg), tidak boleh "${unit}".`,
        };
      }
      return { isValid: true, expectedUnit: 'kg' };
    }

    // 2. Concrete (Beton) MUST be VOLUME (m3)
    if (
      (lowerName.includes('beton') || lowerName.includes('cor ')) &&
      !lowerName.includes('pipa') &&
      !lowerName.includes('genteng') &&
      !lowerName.includes('batu') &&
      !lowerName.includes('bekisting')
    ) {
      if (dim !== 'VOLUME') {
        return {
          isValid: false,
          expectedUnit: 'm3',
          reason: `Pekerjaan pengecoran/beton "${itemName}" wajib menggunakan satuan volume (m3), tidak boleh "${unit}".`,
        };
      }
      return { isValid: true, expectedUnit: 'm3' };
    }

    // 3. Sand / Earth Fill (Pasir / Tanah Urug) MUST be VOLUME (m3)
    if (
      lowerName.includes('pasir urug') ||
      lowerName.includes('tanah urug') ||
      lowerName.includes('urugan pasir') ||
      lowerName.includes('urugan tanah') ||
      lowerName.includes('galian')
    ) {
      if (dim !== 'VOLUME') {
        return {
          isValid: false,
          expectedUnit: 'm3',
          reason: `Pekerjaan urugan/galian "${itemName}" wajib menggunakan satuan volume (m3), tidak boleh "${unit}".`,
        };
      }
      return { isValid: true, expectedUnit: 'm3' };
    }

    // 4. Tiles / Ceiling / Roofing Sheet / Wall Finishes MUST be AREA (m2)
    if (
      lowerName.includes('keramik') ||
      lowerName.includes('homogenous') ||
      lowerName.includes('granit') ||
      lowerName.includes('plafon') ||
      lowerName.includes('gypsum') ||
      lowerName.includes('spandek') ||
      lowerName.includes('plesteran') ||
      lowerName.includes('acian') ||
      lowerName.includes('pengecatan') ||
      lowerName.includes('cat ')
    ) {
      if (lowerName.includes('plint') || lowerName.includes('list')) {
        // Plint / list can be linear meter 'm'
        if (dim !== 'LENGTH' && dim !== 'AREA') {
          return {
            isValid: false,
            expectedUnit: 'm',
            reason: `Pekerjaan lis/plint "${itemName}" menggunakan satuan panjang (m).`,
          };
        }
      } else if (dim !== 'AREA') {
        return {
          isValid: false,
          expectedUnit: 'm2',
          reason: `Pekerjaan finishing "${itemName}" wajib menggunakan satuan luas (m2), tidak boleh "${unit}".`,
        };
      }
      return { isValid: true, expectedUnit: 'm2' };
    }

    // 5. Door / Window Frames (Kusen)
    if (lowerName.includes('kusen')) {
      if (dim !== 'LENGTH' && dim !== 'COUNT') {
        return {
          isValid: false,
          expectedUnit: 'm',
          reason: `Pekerjaan kusen "${itemName}" wajib menggunakan satuan panjang (m) atau count (unit/set).`,
        };
      }
    }

    // Default valid
    return { isValid: true, expectedUnit: normUnit };
  }
}

export const canonicalUnitRegistry = CanonicalUnitRegistry.getInstance();

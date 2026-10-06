/**
 * EZRAB REAL-WORLD COST CALIBRATION & REFERENCE RANGE ENGINE
 *
 * Implements calibrated cost ranges (NOT fixed single prices) based on:
 * - Work Type & Category
 * - Unit
 * - Region (Jawa, Luar Jawa, etc.)
 * - Year (e.g. 2026)
 * - Domain (SDA, Bina Marga, Cipta Karya)
 *
 * Price Anomaly V2 replaces universal rules with contextual bounds:
 * Output: NORMAL | LOW | HIGH | EXTREME | UNKNOWN
 * Strictly WARN or BLOCK — NEVER automatically alter prices.
 */

export type AnomalySeverityV2 = 'NORMAL' | 'LOW' | 'HIGH' | 'EXTREME' | 'UNKNOWN';

export interface ReferenceCostRange {
  id: string;
  category: string;
  workTypeOrResource: string;
  unit: string;
  region: string;
  year: number;
  domain?: string;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  sourceDocument: string;
}

export interface AnomalyEvaluationResult {
  severity: AnomalySeverityV2;
  action: 'PROCEED' | 'WARN' | 'BLOCK';
  inputPrice: number;
  unit: string;
  referenceRange?: {
    min: number;
    max: number;
    median: number;
    region: string;
    year: number;
  };
  deviationPercent?: number;
  message: string;
}

export const CALIBRATED_REFERENCE_RANGES: ReferenceCostRange[] = [
  // -------------------------------------------------------------------------
  // WORK ITEM RANGES (JAWA / NASIONAL 2026)
  // -------------------------------------------------------------------------
  {
    id: 'RANGE_BETON_K250_JAWA_2026',
    category: 'WORK_ITEM',
    workTypeOrResource: 'CONCRETE_STRUCTURE_K250',
    unit: 'm3',
    region: 'Jawa Timur',
    year: 2026,
    domain: 'SDA',
    minPrice: 950000,
    maxPrice: 1450000,
    medianPrice: 1180000,
    sourceDocument: 'SHST Jatim 2026 & Analisis Pasar Cor',
  },
  {
    id: 'RANGE_BETON_K300_JAWA_2026',
    category: 'WORK_ITEM',
    workTypeOrResource: 'CONCRETE_STRUCTURE_K300',
    unit: 'm3',
    region: 'Jawa Timur',
    year: 2026,
    domain: 'Bina Marga',
    minPrice: 1050000,
    maxPrice: 1580000,
    medianPrice: 1290000,
    sourceDocument: 'Lampiran V SE DJBK 2026',
  },
  {
    id: 'RANGE_EARTHWORK_EXCAVATION_2026',
    category: 'WORK_ITEM',
    workTypeOrResource: 'EARTHWORK_EXCAVATION',
    unit: 'm3',
    region: 'Nasional',
    year: 2026,
    domain: 'Bina Marga',
    minPrice: 40000,
    maxPrice: 110000,
    medianPrice: 75000,
    sourceDocument: 'Analisis Galian Mekanis SE 12/2026',
  },
  {
    id: 'RANGE_STONE_MASONRY_2026',
    category: 'WORK_ITEM',
    workTypeOrResource: 'STONE_MASONRY_1_4',
    unit: 'm3',
    region: 'Nasional',
    year: 2026,
    domain: 'SDA',
    minPrice: 750000,
    maxPrice: 1250000,
    medianPrice: 960000,
    sourceDocument: 'Pedoman KP-02 Pasangan Batu',
  },
  {
    id: 'RANGE_REBAR_INSTALLED_2026',
    category: 'WORK_ITEM',
    workTypeOrResource: 'REBAR_INSTALLATION',
    unit: 'kg',
    region: 'Nasional',
    year: 2026,
    domain: 'Bina Marga',
    minPrice: 14000,
    maxPrice: 23000,
    medianPrice: 18000,
    sourceDocument: 'Bina Marga Divisi 3 Struktur 2026',
  },
  {
    id: 'RANGE_FORMWORK_2026',
    category: 'WORK_ITEM',
    workTypeOrResource: 'FORMWORK_CONCRETE',
    unit: 'm2',
    region: 'Nasional',
    year: 2026,
    domain: 'Cipta Karya',
    minPrice: 110000,
    maxPrice: 250000,
    medianPrice: 175000,
    sourceDocument: 'SNI Acuan Bekisting 2026',
  },

  // -------------------------------------------------------------------------
  // RESOURCE PRICE RANGES
  // -------------------------------------------------------------------------
  {
    id: 'RANGE_RES_SEMEN_2026',
    category: 'RESOURCE',
    workTypeOrResource: 'CEMENT_PORTLAND',
    unit: 'kg',
    region: 'Nasional',
    year: 2026,
    minPrice: 1300,
    maxPrice: 2300,
    medianPrice: 1650,
    sourceDocument: 'Katalog HSD 2026 (SE 12/SE/Db/2026)',
  },
  {
    id: 'RANGE_RES_PASIR_BETON_2026',
    category: 'RESOURCE',
    workTypeOrResource: 'SAND_CONCRETE',
    unit: 'm3',
    region: 'Nasional',
    year: 2026,
    minPrice: 180000,
    maxPrice: 380000,
    medianPrice: 275000,
    sourceDocument: 'Katalog HSD 2026 Pasir Cor',
  },
  {
    id: 'RANGE_RES_BATU_BELAH_2026',
    category: 'RESOURCE',
    workTypeOrResource: 'BOULDER_STONE',
    unit: 'm3',
    region: 'Nasional',
    year: 2026,
    minPrice: 200000,
    maxPrice: 390000,
    medianPrice: 295000,
    sourceDocument: 'Katalog HSD 2026 Batu Belah',
  },
  {
    id: 'RANGE_RES_PEKERJA_2026',
    category: 'RESOURCE',
    workTypeOrResource: 'LABOR_WORKER',
    unit: 'OH',
    region: 'Nasional',
    year: 2026,
    minPrice: 85000,
    maxPrice: 155000,
    medianPrice: 115000,
    sourceDocument: 'Standar Upah Minimum Sektoral PUPR 2026',
  },
  {
    id: 'RANGE_RES_TUKANG_2026',
    category: 'RESOURCE',
    workTypeOrResource: 'LABOR_MASON',
    unit: 'OH',
    region: 'Nasional',
    year: 2026,
    minPrice: 115000,
    maxPrice: 185000,
    medianPrice: 145000,
    sourceDocument: 'Standar Upah Tukang Konstruksi 2026',
  },
];

export class ReferenceCostRangeEngine {
  private static ranges: ReferenceCostRange[] = [...CALIBRATED_REFERENCE_RANGES];

  /**
   * Find matching reference range by resource/work item, unit, region, and year
   */
  public static findRange(
    itemKey: string,
    unit: string,
    region?: string,
    year?: number
  ): ReferenceCostRange | null {
    const normKey = itemKey.toUpperCase().trim();
    const normUnit = unit.toLowerCase().trim();
    const normRegion = (region || '').toLowerCase().trim();
    const targetYear = year || 2026;

    // 1. Exact match on key, unit, region, year
    const exact = this.ranges.find((r) => {
      const keyMatch = r.workTypeOrResource.toUpperCase() === normKey;
      const unitMatch = r.unit.toLowerCase() === normUnit;
      const yearMatch = r.year === targetYear;
      const regMatch = normRegion ? r.region.toLowerCase().includes(normRegion) : true;
      return keyMatch && unitMatch && yearMatch && regMatch;
    });
    if (exact) return exact;

    // 2. Fallback to National for the same key and unit
    const national = this.ranges.find((r) => {
      const keyMatch = r.workTypeOrResource.toUpperCase() === normKey;
      const unitMatch = r.unit.toLowerCase() === normUnit;
      return keyMatch && unitMatch && (r.region === 'Nasional' || !region);
    });
    if (national) return national;

    // 3. Substring key match
    const subMatch = this.ranges.find((r) => {
      const keyMatch = normKey.includes(r.workTypeOrResource.toUpperCase()) || r.workTypeOrResource.toUpperCase().includes(normKey);
      const unitMatch = r.unit.toLowerCase() === normUnit;
      return keyMatch && unitMatch;
    });

    return subMatch || null;
  }

  /**
   * Evaluate price anomaly V2 contextually against reference range.
   * If reference data is not available, status is UNKNOWN (NEVER guessed).
   */
  public static evaluateAnomaly(
    price: number | null,
    unit: string,
    itemKey: string,
    region?: string,
    year?: number
  ): AnomalyEvaluationResult {
    // Missing or zero/negative
    if (price === null || price === undefined) {
      return {
        severity: 'EXTREME',
        action: 'BLOCK',
        inputPrice: 0,
        unit,
        message: 'Harga kosong / belum ditentukan (MISSING).',
      };
    }

    if (price < 0) {
      return {
        severity: 'EXTREME',
        action: 'BLOCK',
        inputPrice: price,
        unit,
        message: `Harga negatif tidak diizinkan: Rp ${price}.`,
      };
    }

    const ref = this.findRange(itemKey, unit, region, year);

    if (!ref) {
      return {
        severity: 'UNKNOWN',
        action: 'PROCEED',
        inputPrice: price,
        unit,
        message: `Data referensi harga untuk "${itemKey}" (${unit}) belum tersedia di database kalibrasi. Status: UNKNOWN.`,
      };
    }

    const deviation = ((price - ref.medianPrice) / ref.medianPrice) * 100;
    const ratio = price / ref.medianPrice;

    // Evaluate bounds
    if (ratio < 0.25) {
      return {
        severity: 'EXTREME',
        action: 'BLOCK',
        inputPrice: price,
        unit,
        referenceRange: {
          min: ref.minPrice,
          max: ref.maxPrice,
          median: ref.medianPrice,
          region: ref.region,
          year: ref.year,
        },
        deviationPercent: deviation,
        message: `Harga terindikasi EXTREME LOW: Rp ${price.toLocaleString('id-ID')} (${Math.round(ratio * 100)}% dari median pasar Rp ${ref.medianPrice.toLocaleString('id-ID')}).`,
      };
    }

    if (ratio < 0.65) {
      return {
        severity: 'LOW',
        action: 'WARN',
        inputPrice: price,
        unit,
        referenceRange: {
          min: ref.minPrice,
          max: ref.maxPrice,
          median: ref.medianPrice,
          region: ref.region,
          year: ref.year,
        },
        deviationPercent: deviation,
        message: `Harga terindikasi LOW: Rp ${price.toLocaleString('id-ID')} berada di bawah batas wajar minimum Rp ${ref.minPrice.toLocaleString('id-ID')}.`,
      };
    }

    if (ratio > 2.5) {
      return {
        severity: 'EXTREME',
        action: 'BLOCK',
        inputPrice: price,
        unit,
        referenceRange: {
          min: ref.minPrice,
          max: ref.maxPrice,
          median: ref.medianPrice,
          region: ref.region,
          year: ref.year,
        },
        deviationPercent: deviation,
        message: `Harga terindikasi EXTREME HIGH: Rp ${price.toLocaleString('id-ID')} (${Math.round(ratio * 100)}% dari median pasar Rp ${ref.medianPrice.toLocaleString('id-ID')}).`,
      };
    }

    if (ratio > 1.4) {
      return {
        severity: 'HIGH',
        action: 'WARN',
        inputPrice: price,
        unit,
        referenceRange: {
          min: ref.minPrice,
          max: ref.maxPrice,
          median: ref.medianPrice,
          region: ref.region,
          year: ref.year,
        },
        deviationPercent: deviation,
        message: `Harga terindikasi HIGH: Rp ${price.toLocaleString('id-ID')} melampaui batas wajar maksimum Rp ${ref.maxPrice.toLocaleString('id-ID')}.`,
      };
    }

    return {
      severity: 'NORMAL',
      action: 'PROCEED',
      inputPrice: price,
      unit,
      referenceRange: {
        min: ref.minPrice,
        max: ref.maxPrice,
        median: ref.medianPrice,
        region: ref.region,
        year: ref.year,
      },
      deviationPercent: deviation,
      message: `Harga dalam rentang wajar (NORMAL): Rp ${price.toLocaleString('id-ID')}/${unit} (Median: Rp ${ref.medianPrice.toLocaleString('id-ID')}).`,
    };
  }
}

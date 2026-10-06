/**
 * EZRAB — PRICE & COEFFICIENT SANITY VALIDATOR
 * ============================================
 * Phase 6 & Phase 8: Prevents absurd unit prices (e.g. steel rebar @ Rp 3.8M/kg,
 * concrete beam @ Rp 280M/unit, or sand @ Rp 782k/unit) from entering official RAB.
 *
 * Enforces strict fail-closed rejection:
 * If an incoming price is outside physical/engineering bounds, it returns
 * status 'PRICE_INVALID' with full forensic diagnostics.
 */

import { canonicalUnitRegistry } from './canonicalUnitRegistry';

export type SanityStatus = 'VALID' | 'SUSPICIOUS' | 'PRICE_INVALID';

export interface PriceSanityResult {
  status: SanityStatus;
  isValid: boolean;
  price: number;
  unit: string;
  expectedRange?: { min: number; max: number };
  rejectionReason?: string;
  category?: string;
}

export interface CoefficientSanityResult {
  isValid: boolean;
  coefficient: number;
  unit: string;
  status: 'VALID' | 'ZERO_UNVERIFIED' | 'MISSING' | 'NEGATIVE_INVALID';
  rejectionReason?: string;
}

interface TradePriceBenchmark {
  tradeRegex: RegExp;
  requiredDimension: string;
  minPrice: number;
  maxPrice: number;
  description: string;
}

const TRADE_BENCHMARKS: TradePriceBenchmark[] = [
  // 1. Rebar / Steel Reinforcement (kg)
  {
    tradeRegex: /\b(pembesian|baja tulangan|besi beton|tulangan|begel|sengkang)\b/i,
    requiredDimension: 'MASS',
    minPrice: 6_000,
    maxPrice: 45_000,
    description: 'Baja Tulangan Beton (Besi Polos / Ulir)',
  },

  // 2. Concrete (Beton) (m3)
  {
    tradeRegex: /\b(beton|cor lantai|cor balok|cor kolom|cor sloof|ready mix|site mix)\b/i,
    requiredDimension: 'VOLUME',
    minPrice: 400_000,
    maxPrice: 3_500_000,
    description: 'Beton Struktur / Non-Struktur',
  },

  // 3. Pasir Urug / Tanah Urug (m3)
  {
    tradeRegex: /\b(pasir urug|tanah urug|urugan pasir|urugan tanah)\b/i,
    requiredDimension: 'VOLUME',
    minPrice: 40_000,
    maxPrice: 500_000,
    description: 'Urugan Pasir / Tanah',
  },

  // 4. Pasir Pasang / Pasir Beton (m3)
  {
    tradeRegex: /\b(pasir pasang|pasir beton)\b/i,
    requiredDimension: 'VOLUME',
    minPrice: 150_000,
    maxPrice: 650_000,
    description: 'Pasir Pasang / Pasir Beton',
  },

  // 5. Pondasi Batu Belah / Batu Kali / Batu Gunung (m3)
  {
    tradeRegex: /\b(pondasi batu|batu belah|batu kali|batu gunung|aanstamping)\b/i,
    requiredDimension: 'VOLUME',
    minPrice: 350_000,
    maxPrice: 2_500_000,
    description: 'Pondasi Batu Belah / Kosong',
  },

  // 6. Dinding Bata Merah / Hebel (m2)
  {
    tradeRegex: /\b(pasangan bata|bata merah|bata ringan|hebel|dinding bata)\b/i,
    requiredDimension: 'AREA',
    minPrice: 50_000,
    maxPrice: 400_000,
    description: 'Pasangan Dinding Bata / Hebel',
  },

  // 7. Plesteran & Acian (m2)
  {
    tradeRegex: /\b(plesteran|acian)\b/i,
    requiredDimension: 'AREA',
    minPrice: 15_000,
    maxPrice: 150_000,
    description: 'Plesteran dan Acian Dinding',
  },

  // 8. Keramik / Granite Tiles (m2)
  {
    tradeRegex: /\b(keramik|homogenous|granit|ubin)\b/i,
    requiredDimension: 'AREA',
    minPrice: 45_000,
    maxPrice: 900_000,
    description: 'Finishing Lantai / Dinding Keramik & Granit',
  },

  // 9. Plafon Gypsum (m2)
  {
    tradeRegex: /\b(plafon|plafond|gypsum|grc)\b/i,
    requiredDimension: 'AREA',
    minPrice: 25_000,
    maxPrice: 350_000,
    description: 'Plafon Gypsum / GRC',
  },

  // 10. Rangka Atap Baja Ringan (m2)
  {
    tradeRegex: /\b(kuda-kuda baja ringan|rangka atap baja ringan|kuda-kuda|truss)\b/i,
    requiredDimension: 'AREA',
    minPrice: 80_000,
    maxPrice: 450_000,
    description: 'Rangka Atap Baja Ringan',
  },

  // 11. Penutup Atap Metal / Spandek (m2)
  {
    tradeRegex: /\b(atap metal|spandek|genteng metal|seng gelombang)\b/i,
    requiredDimension: 'AREA',
    minPrice: 35_000,
    maxPrice: 350_000,
    description: 'Penutup Atap Spandek / Metal',
  },

  // 12. Kusen Aluminium (m)
  {
    tradeRegex: /\b(kusen aluminium|kusen alumunium)\b/i,
    requiredDimension: 'LENGTH',
    minPrice: 45_000,
    maxPrice: 400_000,
    description: 'Kusen Aluminium per Meter',
  },

  // 13. Kaca Bening 5mm (m2)
  {
    tradeRegex: /\b(kaca bening|kaca 5 mm|kaca 5mm)\b/i,
    requiredDimension: 'AREA',
    minPrice: 60_000,
    maxPrice: 500_000,
    description: 'Kaca Bening 5mm',
  },

  // 14. Tenaga Kerja (OH)
  {
    tradeRegex: /\b(pekerja|tukang|kepala tukang|mandor)\b/i,
    requiredDimension: 'LABOR_TIME',
    minPrice: 60_000,
    maxPrice: 450_000,
    description: 'Upah Tenaga Kerja Harian (OH)',
  },
];

export class PriceSanityValidator {
  private static instance: PriceSanityValidator;

  private constructor() {}

  public static getInstance(): PriceSanityValidator {
    if (!PriceSanityValidator.instance) {
      PriceSanityValidator.instance = new PriceSanityValidator();
    }
    return PriceSanityValidator.instance;
  }

  /**
   * Validates an incoming price against physical units and engineering sanity benchmarks.
   */
  public validatePrice(
    itemName: string,
    price: number,
    unit: string,
    context?: { category?: string; domain?: string }
  ): PriceSanityResult {
    // 1. Basic numeric validity
    if (price === null || price === undefined || isNaN(price) || price < 0) {
      return {
        status: 'PRICE_INVALID',
        isValid: false,
        price: price || 0,
        unit,
        rejectionReason: 'Harga bernilai null, NaN, atau negatif.',
      };
    }

    if (price === 0) {
      return {
        status: 'SUSPICIOUS',
        isValid: false,
        price: 0,
        unit,
        rejectionReason: 'Harga bernilai Rp 0 (belum terisi / unpriced).',
      };
    }

    const normUnit = canonicalUnitRegistry.normalize(unit);
    const unitDim = canonicalUnitRegistry.getDimension(normUnit);

    // 2. Test against trade-specific engineering bounds
    const lowerName = itemName.toLowerCase();
    for (const benchmark of TRADE_BENCHMARKS) {
      if (benchmark.tradeRegex.test(lowerName)) {
        // A. Unit dimension check: If trade specifies a dimension and unit does not match
        if (unitDim !== 'UNKNOWN' && unitDim !== benchmark.requiredDimension) {
          // If the item specifically has a linear meter unit for plint or similar, handle gracefully
          const isPlintException = (lowerName.includes('plint') || lowerName.includes('list')) && unitDim === 'LENGTH';
          if (!isPlintException) {
            return {
              status: 'PRICE_INVALID',
              isValid: false,
              price,
              unit,
              rejectionReason: `Unit "${unit}" tidak sesuai dengan standar teknis untuk ${benchmark.description} (diharapkan dimensi ${benchmark.requiredDimension}).`,
            };
          }
        }

        // B. Magnitude bounds check
        if (price > benchmark.maxPrice) {
          return {
            status: 'PRICE_INVALID',
            isValid: false,
            price,
            unit,
            expectedRange: { min: benchmark.minPrice, max: benchmark.maxPrice },
            rejectionReason: `Harga Rp ${price.toLocaleString('id-ID')}/${unit} melampaui batas wajar maksimum Rp ${benchmark.maxPrice.toLocaleString('id-ID')}/${unit} untuk ${benchmark.description}.`,
          };
        }

        if (price < benchmark.minPrice) {
          return {
            status: 'PRICE_INVALID',
            isValid: false,
            price,
            unit,
            expectedRange: { min: benchmark.minPrice, max: benchmark.maxPrice },
            rejectionReason: `Harga Rp ${price.toLocaleString('id-ID')}/${unit} di bawah batas wajar minimum Rp ${benchmark.minPrice.toLocaleString('id-ID')}/${unit} untuk ${benchmark.description}.`,
          };
        }

        // Passed trade check
        return {
          status: 'VALID',
          isValid: true,
          price,
          unit,
          expectedRange: { min: benchmark.minPrice, max: benchmark.maxPrice },
        };
      }
    }

    // 3. Global sanity bounds for unclassified items
    // (A single unit item in residential construction shouldn't exceed Rp 150.000.000 unless heavy infrastructure)
    if (price > 150_000_000) {
      return {
        status: 'PRICE_INVALID',
        isValid: false,
        price,
        unit,
        expectedRange: { min: 1_000, max: 150_000_000 },
        rejectionReason: `Harga Rp ${price.toLocaleString('id-ID')}/${unit} melampaui batas maksimal wajar untuk item konstruksi gedung/perumahan.`,
      };
    }

    return {
      status: 'VALID',
      isValid: true,
      price,
      unit,
    };
  }

  /**
   * Phase 8: Coefficient validation.
   */
  public validateCoefficient(
    coef: number | null | undefined,
    unit: string,
    componentName: string
  ): CoefficientSanityResult {
    if (coef === null || coef === undefined || isNaN(coef)) {
      return {
        isValid: false,
        coefficient: 0,
        unit,
        status: 'MISSING',
        rejectionReason: `Koefisien untuk komponen "${componentName}" bernilai null atau tidak terdefinisi.`,
      };
    }

    if (coef < 0) {
      return {
        isValid: false,
        coefficient: coef,
        unit,
        status: 'NEGATIVE_INVALID',
        rejectionReason: `Koefisien untuk komponen "${componentName}" negatif (${coef}).`,
      };
    }

    if (coef === 0) {
      return {
        isValid: false,
        coefficient: 0,
        unit,
        status: 'ZERO_UNVERIFIED',
        rejectionReason: `Koefisien untuk komponen "${componentName}" adalah 0 (perlu konfirmasi).`,
      };
    }

    return {
      isValid: true,
      coefficient: coef,
      unit,
      status: 'VALID',
    };
  }
}

export const priceSanityValidator = PriceSanityValidator.getInstance();

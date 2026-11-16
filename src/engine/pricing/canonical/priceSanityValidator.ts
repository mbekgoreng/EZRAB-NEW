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
import { UnitEngine } from '../../calculatorCore/unit/unitEngine';

export type SanityStatus = 'VALID' | 'SUSPICIOUS' | 'PRICE_INVALID';

export interface PriceSanityResult {
  status: SanityStatus;
  isValid: boolean;
  price: number;
  unit: string;
  expectedRange?: { min: number; max: number };
  rejectionReason?: string;
  category?: string;
  /**
   * MASTER PRICING §13 (#2): when the magnitude check converted the
   * price to the benchmark's base unit before comparing (e.g.
   * Rp 15.000.000/ton → Rp 15.000/kg for the rebar benchmark), the
   * converted price + unit are reported here so the comparison is
   * auditable. Absent when no conversion applied (same unit). When
   * the units are not convertible, the trade range is skipped
   * (see validatePrice step B) and no converted price is reported.
   */
  convertedPrice?: { price: number; unit: string };
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
  /**
   * Optional carve-out: names matching this pattern are NOT governed by this
   * trade even though tradeRegex matches them. The item then falls through to
   * the next benchmark / global bounds — it is never left unchecked.
   * Used only where an official source proves the trade's dimension/price
   * bounds do not fit the item class (never a blanket loosening).
   */
  excludeRegex?: RegExp;
  requiredDimension: string;
  /**
   * Optional extra accepted dimensions for this trade (in addition to
   * requiredDimension). Used only where an official source proves the
   * trade legitimately uses a second dimension — e.g. BM 2026 pays
   * labor per hour (EQUIPMENT_TIME `jam`) as well as per day
   * (LABOR_TIME `OH`). The name gate still applies, so no other item
   * class is affected.
   */
  allowedDimensions?: string[];
  minPrice: number;
  maxPrice: number;
  description: string;
  /**
   * MASTER PRICING §13 (#2): the unit the min/max range is denominated
   * in. The magnitude check converts the incoming price to this unit
   * (via UnitEngine — same-dimension conversions only, no invented
   * factors) BEFORE comparing, so a legitimate per-ton price is not
   * rejected against a per-kg range. When the units are not
   * convertible, the trade range does not apply and the check falls
   * through to the next benchmark / global bounds — comparing a price
   * against a range denominated in an inconvertible unit would be a
   * category error (e.g. a per-hour wage against a per-day range).
   */
  baseUnit: string;
}

const TRADE_BENCHMARKS: TradePriceBenchmark[] = [
  // 1. Rebar / Steel Reinforcement (kg)
  {
    tradeRegex: /\b(pembesian|baja tulangan|besi beton|tulangan|begel|sengkang)\b/i,
    requiredDimension: 'MASS',
    minPrice: 6_000,
    maxPrice: 45_000,
    description: 'Baja Tulangan Beton (Besi Polos / Ulir)',
    baseUnit: 'kg',
  },

  // 2. Concrete (Beton) (m3) — BULK cast-in-place concrete only.
  // Carve-out (bukti resmi SE DJBK No. 47/SE/Dk/2026 Lampiran V, 2026-10-27):
  // produk beton per BUAH Divisi 9 yang namanya mengandung "beton" tetapi
  // satuannya resmi Buah — patok (9.2.(11a) I.95 p.1957, 9.2.(13a) I.101
  // p.1976, 9.2.(13b) I.102 p.1979), beton berpola/stamp (9.3.(27) I.242
  // p.2350), bangku/kursi beton (9.3.(32c) I.250 p.2371). Aturan VOLUME +
  // lantai Rp 400 ribu untuk beton curah tidak berlaku bagi produk satuan
  // ini; mereka tetap diperiksa batas global (langkah 3). Tanpa carve-out,
  // kelimanya ditolak INVALID secara keliru (I.95: Buah vs VOLUME).
  // Carve-out kawat (bukti resmi SE DJBK 2026 master BM, investigasi d63
  // 2026-11-16): "Kawat Beton" (M14) adalah kawat pengikat tulangan
  // Rp25.000/kg — bukan beton curah — tetapi namanya mengandung "beton"
  // sehingga VOLUME menolak kg-nya secara keliru. Kawat tetap diperiksa
  // batas global (langkah 3).
  {
    tradeRegex: /\b(beton|cor lantai|cor balok|cor kolom|cor sloof|ready mix|site mix)\b/i,
    excludeRegex: /\b(patok|bangku|kursi|berpola|stamp|kawat)\b/i,
    requiredDimension: 'VOLUME',
    minPrice: 400_000,
    maxPrice: 3_500_000,
    description: 'Beton Struktur / Non-Struktur',
    baseUnit: 'm3',
  },

  // 3. Pasir Urug / Tanah Urug (m3)
  {
    tradeRegex: /\b(pasir urug|tanah urug|urugan pasir|urugan tanah)\b/i,
    requiredDimension: 'VOLUME',
    minPrice: 40_000,
    maxPrice: 500_000,
    description: 'Urugan Pasir / Tanah',
    baseUnit: 'm3',
  },

  // 4. Pasir Pasang / Pasir Beton (m3)
  {
    tradeRegex: /\b(pasir pasang|pasir beton)\b/i,
    requiredDimension: 'VOLUME',
    minPrice: 150_000,
    maxPrice: 650_000,
    description: 'Pasir Pasang / Pasir Beton',
    baseUnit: 'm3',
  },

  // 5. Pondasi Batu Belah / Batu Kali / Batu Gunung (m3)
  {
    tradeRegex: /\b(pondasi batu|batu belah|batu kali|batu gunung|aanstamping)\b/i,
    requiredDimension: 'VOLUME',
    minPrice: 350_000,
    maxPrice: 2_500_000,
    description: 'Pondasi Batu Belah / Kosong',
    baseUnit: 'm3',
  },

  // 6. Dinding Bata Merah / Hebel (m2)
  {
    tradeRegex: /\b(pasangan bata|bata merah|bata ringan|hebel|dinding bata)\b/i,
    requiredDimension: 'AREA',
    minPrice: 50_000,
    maxPrice: 400_000,
    description: 'Pasangan Dinding Bata / Hebel',
    baseUnit: 'm2',
  },

  // 7. Plesteran & Acian (m2)
  {
    tradeRegex: /\b(plesteran|acian)\b/i,
    requiredDimension: 'AREA',
    minPrice: 15_000,
    maxPrice: 150_000,
    description: 'Plesteran dan Acian Dinding',
    baseUnit: 'm2',
  },

  // 8. Keramik / Granite Tiles (m2)
  {
    tradeRegex: /\b(keramik|homogenous|granit|ubin)\b/i,
    requiredDimension: 'AREA',
    minPrice: 45_000,
    maxPrice: 900_000,
    description: 'Finishing Lantai / Dinding Keramik & Granit',
    baseUnit: 'm2',
  },

  // 9. Plafon Gypsum (m2)
  {
    tradeRegex: /\b(plafon|plafond|gypsum|grc)\b/i,
    requiredDimension: 'AREA',
    minPrice: 25_000,
    maxPrice: 350_000,
    description: 'Plafon Gypsum / GRC',
    baseUnit: 'm2',
  },

  // 10. Rangka Atap Baja Ringan (m2)
  {
    tradeRegex: /\b(kuda-kuda baja ringan|rangka atap baja ringan|kuda-kuda|truss)\b/i,
    requiredDimension: 'AREA',
    minPrice: 80_000,
    maxPrice: 450_000,
    description: 'Rangka Atap Baja Ringan',
    baseUnit: 'm2',
  },

  // 11. Penutup Atap Metal / Spandek (m2)
  {
    tradeRegex: /\b(atap metal|spandek|genteng metal|seng gelombang)\b/i,
    requiredDimension: 'AREA',
    minPrice: 35_000,
    maxPrice: 350_000,
    description: 'Penutup Atap Spandek / Metal',
    baseUnit: 'm2',
  },

  // 12. Kusen Aluminium (m)
  {
    tradeRegex: /\b(kusen aluminium|kusen alumunium)\b/i,
    requiredDimension: 'LENGTH',
    minPrice: 45_000,
    maxPrice: 400_000,
    description: 'Kusen Aluminium per Meter',
    baseUnit: 'm',
  },

  // 13. Kaca Bening 5mm (m2)
  {
    tradeRegex: /\b(kaca bening|kaca 5 mm|kaca 5mm)\b/i,
    requiredDimension: 'AREA',
    minPrice: 60_000,
    maxPrice: 500_000,
    description: 'Kaca Bening 5mm',
    baseUnit: 'm2',
  },

  // 14. Tenaga Kerja (OH) — plus upah per jam BM 2026.
  // BM 2026 secara sah memakai upah per jam (seluruh komponen L01/L02/L03
  // di master BM bersatuan jam; bukti: investigasi d63 2026-11-16) — jam
  // berdimensi EQUIPMENT_TIME di registry, jadi diterima di sini sebagai
  // dimensi kedua. Rentang Rp60–450 ribu tetap berdenominasi OH dan hanya
  // berlaku bila harga dapat dikonversi ke OH (lihat langkah B: bila tidak
  // dapat dikonversi, cek rentang dilewati — harga per-jam tidak pernah
  // dibandingkan mentah dengan rentang per-hari).
  {
    tradeRegex: /\b(pekerja|tukang|kepala tukang|mandor)\b/i,
    requiredDimension: 'LABOR_TIME',
    allowedDimensions: ['LABOR_TIME', 'EQUIPMENT_TIME'],
    minPrice: 60_000,
    maxPrice: 450_000,
    description: 'Upah Tenaga Kerja Harian (OH)',
    baseUnit: 'OH',
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
      if (benchmark.tradeRegex.test(lowerName) && !(benchmark.excludeRegex?.test(lowerName))) {
        // A. Unit dimension check: If trade specifies a dimension and unit does not match
        const allowedDims = benchmark.allowedDimensions ?? [benchmark.requiredDimension];
        if (unitDim !== 'UNKNOWN' && !allowedDims.includes(unitDim)) {
          // If the item specifically has a linear meter unit for plint or similar, handle gracefully
          const isPlintException = (lowerName.includes('plint') || lowerName.includes('list')) && unitDim === 'LENGTH';
          if (!isPlintException) {
            return {
              status: 'PRICE_INVALID',
              isValid: false,
              price,
              unit,
              rejectionReason: `Unit "${unit}" tidak sesuai dengan standar teknis untuk ${benchmark.description} (diharapkan dimensi ${allowedDims.join(' atau ')}).`,
            };
          }
        }

        // B. Magnitude bounds check — MASTER PRICING §13 (#2): convert
        // the price to the benchmark's base unit BEFORE comparing
        // (same-dimension conversions only, via UnitEngine — no
        // invented factors). A legitimate per-ton price (Besi Beton
        // Rp 15.000.000/ton = Rp 15.000/kg) must not be rejected
        // against a per-kg range. When the units are not convertible
        // (or the conversion fails), the trade range DOES NOT APPLY:
        // the check falls through to the next benchmark / global
        // bounds — comparing a price against a range denominated in
        // an inconvertible unit would be a category error (e.g. a
        // per-hour wage Rp27.643,54/jam against a per-day OH range
        // Rp60.000–450.000 — investigasi d63 2026-11-16). Never a
        // guessed conversion. OJ/OH stay factor-1 (no new homonym
        // semantics).
        let priceForRange = price;
        let converted: { price: number; unit: string } | undefined;
        let conversionFailed = false;
        if (UnitEngine.normalizeUnit(normUnit) !== UnitEngine.normalizeUnit(benchmark.baseUnit)) {
          try {
            const factor = UnitEngine.convert(1, benchmark.baseUnit, normUnit);
            if (Number.isFinite(factor) && factor > 0) {
              priceForRange = price * factor;
              converted = { price: priceForRange, unit: benchmark.baseUnit };
            } else {
              conversionFailed = true;
            }
          } catch {
            conversionFailed = true;
          }
        }
        if (conversionFailed) {
          // Range inapplicable — fall through (never left unchecked:
          // global bounds in step 3 still apply).
          continue;
        }
        const rangeLabel =
          converted !== undefined
            ? `Rp ${priceForRange.toLocaleString('id-ID')}/${benchmark.baseUnit} (dari Rp ${price.toLocaleString('id-ID')}/${unit})`
            : `Rp ${price.toLocaleString('id-ID')}/${unit}`;
        if (priceForRange > benchmark.maxPrice) {
          return {
            status: 'PRICE_INVALID',
            isValid: false,
            price,
            unit,
            expectedRange: { min: benchmark.minPrice, max: benchmark.maxPrice },
            rejectionReason: `Harga ${rangeLabel} melampaui batas wajar maksimum Rp ${benchmark.maxPrice.toLocaleString('id-ID')}/${benchmark.baseUnit} untuk ${benchmark.description}.`,
            ...(converted !== undefined ? { convertedPrice: converted } : {}),
          };
        }

        if (priceForRange < benchmark.minPrice) {
          return {
            status: 'PRICE_INVALID',
            isValid: false,
            price,
            unit,
            expectedRange: { min: benchmark.minPrice, max: benchmark.maxPrice },
            rejectionReason: `Harga ${rangeLabel} di bawah batas wajar minimum Rp ${benchmark.minPrice.toLocaleString('id-ID')}/${benchmark.baseUnit} untuk ${benchmark.description}.`,
            ...(converted !== undefined ? { convertedPrice: converted } : {}),
          };
        }

        // Passed trade check
        return {
          status: 'VALID',
          isValid: true,
          price,
          unit,
          expectedRange: { min: benchmark.minPrice, max: benchmark.maxPrice },
          ...(converted !== undefined ? { convertedPrice: converted } : {}),
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

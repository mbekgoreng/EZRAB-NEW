/**
 * EZRAB AI ESTIMATE ONLY — Sanity Check Engine
 *
 * Engineering sanity checks for AI estimates.
 * NOT AHSP validation. This is AI ESTIMATE SANITY CHECK.
 *
 * Checks:
 * - Unit mismatch (beton should be m3, not kg)
 * - Extreme prices (baja Rp3.864.000/kg is absurd)
 * - Extreme quantities (ringbalk Rp191M is suspicious)
 * - Duplicate work items
 * - Identical prices across different work types
 * - Low confidence items
 * - Missing data
 */

import {
  AiEstimateWorkItem,
  AiEstimateWarning,
  EXPECTED_UNIT_MAP,
  WarningLevel,
  WarningType,
} from './types';

export class AiEstimateSanityCheck {

  /**
   * Run all sanity checks on work items.
   * Returns warnings — does NOT auto-correct values.
   */
  public static runAllChecks(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];

    warnings.push(...this.checkUnitMismatches(items));
    warnings.push(...this.checkExtremePrices(items));
    warnings.push(...this.checkExtremeQuantities(items));
    warnings.push(...this.checkExtremeSubtotals(items));
    warnings.push(...this.checkDuplicateWork(items));
    warnings.push(...this.checkIdenticalPrices(items));
    warnings.push(...this.checkLowConfidence(items));
    warnings.push(...this.checkMissingData(items));

    // Assign warnings to their respective items
    for (const warning of warnings) {
      if (warning.itemId) {
        const item = items.find(i => i.id === warning.itemId);
        if (item && !item.warnings.some(w => w.type === warning.type && w.message === warning.message)) {
          item.warnings.push(warning);
        }
      }
    }

    return warnings;
  }

  /**
   * Check if units match expected construction conventions.
   */
  public static checkUnitMismatches(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];

    for (const item of items) {
      if (!item.unit) continue;

      const workNameLower = item.workName.toLowerCase();
      const unitLower = item.unit.toLowerCase();

      for (const [keyword, expectedUnits] of Object.entries(EXPECTED_UNIT_MAP)) {
        if (workNameLower.includes(keyword)) {
          const normalizedExpected = expectedUnits.map(u => u.toLowerCase());
          if (!normalizedExpected.includes(unitLower)) {
            warnings.push({
              type: 'UNIT_MISMATCH',
              level: 'WARNING',
              message: `"${item.workName}" menggunakan satuan "${item.unit}" tetapi pekerjaan "${keyword}" biasanya menggunakan satuan ${expectedUnits.join(' atau ')}. Periksa kembali.`,
              itemId: item.id,
              itemName: item.workName,
              suggestedAction: `Pertimbangkan mengubah satuan ke ${expectedUnits[0]}`,
            });
          }
          break; // Only check first matching keyword
        }
      }
    }

    return warnings;
  }

  /**
   * Check for extreme/absurd prices.
   */
  public static checkExtremePrices(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];

    // Price range expectations per unit type (rough sanity bounds, not AHSP)
    const priceRanges: Record<string, { min: number; max: number; label: string }> = {
      'm3': { min: 200_000, max: 20_000_000, label: 'pekerjaan kubik' },
      'm2': { min: 15_000, max: 2_000_000, label: 'pekerjaan persegi' },
      'kg': { min: 5_000, max: 50_000, label: 'pekerjaan berat' },
      "m'": { min: 10_000, max: 1_500_000, label: 'pekerjaan panjang' },
      'm': { min: 10_000, max: 1_500_000, label: 'pekerjaan panjang' },
      'unit': { min: 50_000, max: 50_000_000, label: 'pekerjaan unit' },
      'bh': { min: 50_000, max: 50_000_000, label: 'pekerjaan buah' },
      'titik': { min: 100_000, max: 5_000_000, label: 'pekerjaan titik' },
      'ls': { min: 500_000, max: 100_000_000, label: 'pekerjaan lump sum' },
      'set': { min: 100_000, max: 50_000_000, label: 'pekerjaan set' },
    };

    for (const item of items) {
      if (typeof item.estimatedUnitPrice !== 'number' || item.estimatedUnitPrice <= 0) continue;

      const unitLower = item.unit.toLowerCase();
      const range = priceRanges[unitLower];

      if (range) {
        if (item.estimatedUnitPrice < range.min) {
          warnings.push({
            type: 'EXTREME_PRICE',
            level: 'WARNING',
            message: `"${item.workName}" memiliki harga estimasi Rp${item.estimatedUnitPrice.toLocaleString('id-ID')}/${item.unit}. Nilai ini terlalu rendah untuk ${range.label} dan perlu review.`,
            itemId: item.id,
            itemName: item.workName,
          });
        }
        if (item.estimatedUnitPrice > range.max) {
          warnings.push({
            type: 'EXTREME_PRICE',
            level: 'CRITICAL',
            message: `"${item.workName}" memiliki harga estimasi Rp${item.estimatedUnitPrice.toLocaleString('id-ID')}/${item.unit}. Nilai ini berada di luar rentang kewajaran estimasi untuk ${range.label} dan perlu review.`,
            itemId: item.id,
            itemName: item.workName,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Check for extreme quantities.
   */
  public static checkExtremeQuantities(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];

    for (const item of items) {
      if (item.quantity === null) continue;

      const unitLower = item.unit.toLowerCase();

      // Extremely small quantities that look like parsing errors
      if (item.quantity > 0 && item.quantity < 0.1 && !['ls', 'set', 'unit', 'bh'].includes(unitLower)) {
        warnings.push({
          type: 'EXTREME_QUANTITY',
          level: 'WARNING',
          message: `"${item.workName}" memiliki volume ${item.quantity} ${item.unit}. Nilai ini sangat kecil dan mungkin merupakan kesalahan parsing.`,
          itemId: item.id,
          itemName: item.workName,
        });
      }

      // Extremely large quantities
      if (unitLower === 'm3' && item.quantity > 500) {
        warnings.push({
          type: 'EXTREME_QUANTITY',
          level: 'WARNING',
          message: `"${item.workName}" memiliki volume ${item.quantity} m3. Untuk rumah tinggal 1 lantai, volume ini sangat besar dan perlu verifikasi.`,
          itemId: item.id,
          itemName: item.workName,
        });
      }

      if (unitLower === 'kg' && item.quantity > 10_000) {
        warnings.push({
          type: 'EXTREME_QUANTITY',
          level: 'WARNING',
          message: `"${item.workName}" memiliki berat ${item.quantity} kg. Periksa kembali.`,
          itemId: item.id,
          itemName: item.workName,
        });
      }
    }

    return warnings;
  }

  /**
   * Check for extreme subtotals.
   */
  public static checkExtremeSubtotals(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];

    for (const item of items) {
      if (typeof item.estimatedSubtotal !== 'number') continue;

      // Single item > Rp500 million for residential is suspicious
      if (item.estimatedSubtotal > 500_000_000) {
        warnings.push({
          type: 'EXTREME_SUBTOTAL',
          level: 'CRITICAL',
          message: `"${item.workName}" memiliki subtotal Rp${item.estimatedSubtotal.toLocaleString('id-ID')}. Ini sangat tinggi untuk satu item pekerjaan dan perlu review.`,
          itemId: item.id,
          itemName: item.workName,
        });
      }
    }

    return warnings;
  }

  /**
   * Check for duplicate work items.
   */
  public static checkDuplicateWork(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];
    const nameMap = new Map<string, AiEstimateWorkItem[]>();

    for (const item of items) {
      const key = item.workName.toLowerCase().trim();
      if (!nameMap.has(key)) {
        nameMap.set(key, []);
      }
      nameMap.get(key)!.push(item);
    }

    for (const [name, duplicates] of nameMap) {
      if (duplicates.length > 1) {
        for (const dup of duplicates) {
          warnings.push({
            type: 'DUPLICATE_WORK',
            level: 'WARNING',
            message: `"${dup.workName}" muncul ${duplicates.length} kali dalam daftar pekerjaan. Periksa apakah ini merupakan duplikasi.`,
            itemId: dup.id,
            itemName: dup.workName,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Check for suspiciously identical prices across different work types.
   */
  public static checkIdenticalPrices(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];
    const priceMap = new Map<number, AiEstimateWorkItem[]>();

    const pricedItems = items.filter((i): i is AiEstimateWorkItem & { estimatedUnitPrice: number } => typeof i.estimatedUnitPrice === 'number' && i.estimatedUnitPrice > 0);

    for (const item of pricedItems) {
      const price = item.estimatedUnitPrice!;
      if (!priceMap.has(price)) {
        priceMap.set(price, []);
      }
      priceMap.get(price)!.push(item);
    }

    for (const [price, samePrice] of priceMap) {
      // Only flag if 3+ different work types share exact same price
      if (samePrice.length >= 3) {
        const uniqueCategories = new Set(samePrice.map(i => i.category));
        const uniqueUnits = new Set(samePrice.map(i => i.unit));
        if (uniqueCategories.size >= 2 || uniqueUnits.size >= 2) {
          warnings.push({
            type: 'IDENTICAL_PRICES',
            level: 'WARNING',
            message: `${samePrice.length} pekerjaan berbeda memiliki harga estimasi identik Rp${price.toLocaleString('id-ID')}. Ini mungkin menunjukkan estimasi yang kurang teliti. Pekerjaan: ${samePrice.map(i => i.workName).join(', ')}.`,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Flag items with low confidence.
   */
  public static checkLowConfidence(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];

    for (const item of items) {
      if (item.confidence === 'LOW') {
        warnings.push({
          type: 'LOW_CONFIDENCE',
          level: 'INFO',
          message: `"${item.workName}" memiliki tingkat keyakinan rendah. Estimasi ini perlu diverifikasi.`,
          itemId: item.id,
          itemName: item.workName,
        });
      }
    }

    return warnings;
  }

  /**
   * Flag items with missing quantity or price.
   */
  public static checkMissingData(items: AiEstimateWorkItem[]): AiEstimateWarning[] {
    const warnings: AiEstimateWarning[] = [];

    for (const item of items) {
      if (item.quantity === null) {
        warnings.push({
          type: 'MISSING_QUANTITY',
          level: 'WARNING',
          message: `"${item.workName}" tidak memiliki volume/quantity. Status: UNRESOLVED.`,
          itemId: item.id,
          itemName: item.workName,
        });
      }
      if (typeof item.estimatedUnitPrice !== 'number' || item.estimatedUnitPrice <= 0) {
        warnings.push({
          type: 'MISSING_PRICE',
          level: 'WARNING',
          message: `"${item.workName}" tidak memiliki estimasi harga satuan.`,
          itemId: item.id,
          itemName: item.workName,
        });
      }
    }

    return warnings;
  }
}

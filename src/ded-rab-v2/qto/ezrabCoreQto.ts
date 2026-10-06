/**
 * EZRAB Core QTO Calculator (EZRAB DED -> RAB V2)
 *
 * Strict Principles:
 * - The Core is the ONLY quantity calculator.
 * - AI supplies: geometry, dimensions, parameters.
 * - Core performs: area, volume, length, count, etc.
 * - If required parameters are missing: DO NOT calculate! Return status: MISSING_DATA and quantity: null.
 * - No guessing, no default fallback percentages, never return 0 or 1 for missing data.
 * - High precision deterministic calculation powered by SafeDecimalEngine.
 */

import { DedWorkItem, DedQtoResult } from '../types';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';

export class EzrabCoreQto {
  private static instance: EzrabCoreQto;

  private constructor() {}

  public static getInstance(): EzrabCoreQto {
    if (!EzrabCoreQto.instance) {
      EzrabCoreQto.instance = new EzrabCoreQto();
    }
    return EzrabCoreQto.instance;
  }

  /**
   * Calculates deterministic quantity for a DedWorkItem.
   */
  public calculateQuantity(item: DedWorkItem): DedQtoResult {
    const inputs = item.calculationInputs || {};
    const shape = item.geometry?.shape || 'RECTANGULAR';

    // 1. COUNT
    if (shape === 'COUNT' || item.unit === 'unit' || item.unit === 'titik' || item.unit === 'buah' || item.unit === 'set') {
      const count = inputs.count ?? item.dimensions.count?.value ?? null;
      if (count === null || count === undefined || count <= 0) {
        return {
          formula: 'Jumlah = MISSING_DATA',
          quantity: null,
          unit: item.unit || 'unit',
          status: 'MISSING_DATA',
          missingParameters: ['count'],
        };
      }
      return {
        formula: `${count} ${item.unit || 'unit'}`,
        quantity: count,
        unit: item.unit || 'unit',
        status: 'CALCULATED',
      };
    }

    // 2. LINEAR (Length)
    if (shape === 'LINEAR' || item.unit === 'm' || item.unit === "m'") {
      let length = inputs.length ?? item.dimensions.length?.value ?? null;
      const count = inputs.count ?? item.dimensions.count?.value ?? null;
      const height = inputs.height ?? item.dimensions.height?.value ?? null;

      if ((length === null || length <= 0) && count !== null && count > 0 && height !== null && height > 0) {
        const totalLen = SafeDecimalEngine.safeMultiply(count, height, 4);
        return {
          formula: `${count} titik × ${height.toFixed(2)} m = ${totalLen.toFixed(2)} m'`,
          quantity: SafeDecimalEngine.safeRound(totalLen, 2),
          unit: "m'",
          status: 'CALCULATED',
        };
      }

      if (length === null || length === undefined || length <= 0) {
        return {
          formula: 'Panjang = MISSING_DATA',
          quantity: null,
          unit: item.unit || "m'",
          status: 'MISSING_DATA',
          missingParameters: ['length'],
        };
      }
      const safeLen = SafeDecimalEngine.safeRound(length, 3);
      return {
        formula: `${safeLen.toFixed(2)} m`,
        quantity: safeLen,
        unit: item.unit || "m'",
        status: 'CALCULATED',
      };
    }

    // 3. 2D AREA (Area = Length × Width or direct stated Area)
    if (item.unit === 'm²' || item.unit === 'm2') {
      // Check if explicit area is already provided (e.g. room area or derived scope)
      const explicitArea = inputs.area ?? item.dimensions.area?.value ?? null;
      if (explicitArea !== null && explicitArea > 0) {
        const safeArea = SafeDecimalEngine.safeRound(explicitArea, 3);
        return {
          formula: `Luas = ${safeArea.toFixed(2)} m²`,
          quantity: safeArea,
          unit: 'm²',
          status: 'CALCULATED',
        };
      }

      // Check if Door/Window or element with count and width/height dimensions
      const count = inputs.count ?? item.dimensions.count?.value ?? null;
      const w = inputs.width ?? item.dimensions.width?.value ?? null;
      const h = inputs.height ?? item.dimensions.height?.value ?? null;
      if (count !== null && count > 0 && w !== null && w > 0 && h !== null && h > 0) {
        const singleArea = SafeDecimalEngine.safeMultiply(w, h, 4);
        const totalArea = SafeDecimalEngine.safeMultiply(singleArea, count, 4);
        const safeArea = SafeDecimalEngine.safeRound(totalArea, 3);
        return {
          formula: `${count} unit × (${w.toFixed(2)} m × ${h.toFixed(2)} m) = ${safeArea.toFixed(2)} m²`,
          quantity: safeArea,
          unit: 'm²',
          status: 'CALCULATED',
        };
      }

      const length = inputs.length ?? item.dimensions.length?.value ?? null;
      const width = inputs.width ?? item.dimensions.width?.value ?? inputs.height ?? item.dimensions.height?.value ?? null;

      if (length === null || width === null || length <= 0 || width <= 0) {
        const missing: string[] = [];
        if (length === null || length <= 0) missing.push('length');
        if (width === null || width <= 0) missing.push('width/height');

        return {
          formula: `${length ?? '?'} m × ${width ?? '?'} m = MISSING_DATA`,
          quantity: null,
          unit: 'm²',
          status: 'MISSING_DATA',
          missingParameters: missing,
        };
      }

      const area = SafeDecimalEngine.safeMultiply(length, width, 4);
      return {
        formula: `${length.toFixed(2)} m × ${width.toFixed(2)} m = ${area.toFixed(2)} m²`,
        quantity: area,
        unit: 'm²',
        status: 'CALCULATED',
      };
    }

    // 4. WEIGHT (kg) - e.g. Besi Beton / Wiremesh
    if (item.unit === 'kg') {
      const weight = inputs.weight ?? item.dimensions.count?.value ?? null;
      if (weight !== null && weight > 0) {
        const safeWeight = SafeDecimalEngine.safeRound(weight, 2);
        return {
          formula: `Berat = ${safeWeight.toFixed(2)} kg`,
          quantity: safeWeight,
          unit: 'kg',
          status: 'CALCULATED',
        };
      }
      return {
        formula: 'Berat = MISSING_DATA',
        quantity: null,
        unit: 'kg',
        status: 'MISSING_DATA',
        missingParameters: ['weight'],
      };
    }

    // 5. 3D VOLUME (Volume = Length × Width × Height or Area × Length)
    if (item.unit === 'm³' || item.unit === 'm3') {
      // Trapezoidal Foundation check
      if (shape === 'TRAPEZOIDAL') {
        const topWidth = inputs.topWidth ?? item.dimensions.width?.value ?? null;
        const bottomWidth = inputs.bottomWidth ?? inputs.width ?? null;
        const height = inputs.height ?? item.dimensions.height?.value ?? null;
        const length = inputs.length ?? item.dimensions.length?.value ?? null;

        if (topWidth === null || height === null || length === null || topWidth <= 0 || height <= 0 || length <= 0) {
          return {
            formula: 'Penampang Trapesium = MISSING_DATA',
            quantity: null,
            unit: 'm³',
            status: 'MISSING_DATA',
            missingParameters: ['topWidth', 'height', 'length'].filter(p => (inputs as any)[p] === null || (inputs as any)[p] <= 0),
          };
        }

        const bWidth = bottomWidth !== null && bottomWidth > 0 ? bottomWidth : topWidth;
        const avgWidth = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(topWidth, bWidth), 2, 4);
        const crossSection = SafeDecimalEngine.safeMultiply(avgWidth, height, 4);
        const volume = SafeDecimalEngine.safeMultiply(crossSection, length, 4);

        return {
          formula: `((${topWidth} m + ${bWidth} m) / 2) × ${height} m × ${length} m = ${volume.toFixed(3)} m³`,
          quantity: volume,
          unit: 'm³',
          status: 'CALCULATED',
        };
      }

      // Column volume: Width × Length × Height × Count
      if (item.category === 'STRUCTURE_COLUMN') {
        const width = inputs.width ?? item.dimensions.width?.value ?? null;
        const length = inputs.length ?? item.dimensions.length?.value ?? width;
        const height = inputs.height ?? item.dimensions.height?.value ?? null;
        const count = inputs.count ?? item.dimensions.count?.value ?? 1;

        if (width === null || height === null || length === null || width <= 0 || height <= 0 || length <= 0) {
          const missing: string[] = [];
          if (width === null || width <= 0) missing.push('width');
          if (height === null || height <= 0) missing.push('height');

          return {
            formula: 'Dimensi Kolom = MISSING_DATA',
            quantity: null,
            unit: 'm³',
            status: 'MISSING_DATA',
            missingParameters: missing,
          };
        }

        const singleVol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(width, length, 6), height, 6);
        const volume = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(singleVol, count, 6), 3);
        return {
          formula: `${count} titik × (${width.toFixed(2)} m × ${length.toFixed(2)} m × ${height.toFixed(2)} m) = ${volume.toFixed(3)} m³`,
          quantity: volume,
          unit: 'm³',
          status: 'CALCULATED',
        };
      }

      // Standard Rectangular Volume: Length × Width × Height (× Count if present)
      const length = inputs.length ?? item.dimensions.length?.value ?? null;
      const width = inputs.width ?? item.dimensions.width?.value ?? null;
      const height = inputs.height ?? item.dimensions.height?.value ?? null;
      const count = inputs.count ?? item.dimensions.count?.value ?? 1;

      if (length === null || width === null || height === null || length <= 0 || width <= 0 || height <= 0) {
        const missing: string[] = [];
        if (length === null || length <= 0) missing.push('length');
        if (width === null || width <= 0) missing.push('width');
        if (height === null || height <= 0) missing.push('height');

        return {
          formula: `${length ?? '?'} m × ${width ?? '?'} m × ${height ?? '?'} m = MISSING_DATA`,
          quantity: null,
          unit: 'm³',
          status: 'MISSING_DATA',
          missingParameters: missing,
        };
      }

      const baseArea = SafeDecimalEngine.safeMultiply(length, width, 4);
      const singleVol = SafeDecimalEngine.safeMultiply(baseArea, height, 4);
      const volume = SafeDecimalEngine.safeMultiply(singleVol, count, 4);
      const countPrefix = count > 1 ? `${count} × ` : '';
      return {
        formula: `${countPrefix}${length.toFixed(2)} m × ${width.toFixed(2)} m × ${height.toFixed(2)} m = ${volume.toFixed(3)} m³`,
        quantity: volume,
        unit: 'm³',
        status: 'CALCULATED',
      };
    }

    // Default Fallback
    return {
      formula: 'Rumus tidak diketahui',
      quantity: null,
      unit: item.unit || 'unit',
      status: 'MISSING_DATA',
      missingParameters: ['formula'],
    };
  }
}

export const ezrabCoreQto = EzrabCoreQto.getInstance();

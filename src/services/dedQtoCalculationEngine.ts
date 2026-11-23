/**
 * EZRAB Deterministic QTO Calculation Engine (Section 6, 23 & 24)
 *
 * Core Calculation Authority:
 * AI extracts raw dimensions, but EZRAB Core deterministically computes formulas.
 *
 * Pre-QTO Validation Rules:
 * 1. Every input must have verifiable evidence.
 * 2. All units are normalized (e.g., cm -> m).
 * 3. Required dimensions must exist. If missing -> DO NOT calculate, return MISSING_DATA.
 * 4. Conflicting dimensions (status === 'CONFLICT') abort calculation.
 * 5. Uses PrecisionEngine / Safe Decimal Math.
 */

import { DEDWorkItem, DeterministicCalculationResult, SupportedUnit } from '../domain/ded/dedPipelineTypes';
import { PrecisionEngine } from '../engine/calculatorCore/precision/precisionEngine';

export interface QtoCalculationValidation {
  isValid: boolean;
  errorState?: 'DIMENSION_NOT_FOUND' | 'QUANTITY_NOT_FOUND' | 'CONFLICT' | 'EVIDENCE_REQUIRED';
  reason?: string;
}

export class DedQtoCalculationEngine {
  private static instance: DedQtoCalculationEngine;

  private constructor() {}

  public static getInstance(): DedQtoCalculationEngine {
    if (!DedQtoCalculationEngine.instance) {
      DedQtoCalculationEngine.instance = new DedQtoCalculationEngine();
    }
    return DedQtoCalculationEngine.instance;
  }

  /**
   * Pre-calculation validation gate (Section 23)
   */
  public validateForCalculation(item: DEDWorkItem): QtoCalculationValidation {
    // 1. Check for conflicts
    if (item.status === 'CONFLICT' || item.conflictDetails) {
      return {
        isValid: false,
        errorState: 'CONFLICT',
        reason: 'Item memiliki dimensi atau data yang saling bertentangan.',
      };
    }

    // 2. Check evidence presence
    if (!item.evidence || item.evidence.length === 0) {
      return {
        isValid: false,
        errorState: 'EVIDENCE_REQUIRED',
        reason: 'Item tidak memiliki bukti (evidence) pendukung dari dokumen DED.',
      };
    }

    // 3. Check dimension availability
    const dims = item.dimensions;
    if (!dims) {
      return {
        isValid: false,
        errorState: 'DIMENSION_NOT_FOUND',
        reason: 'Item tidak memiliki parameter dimensi untuk dihitung.',
      };
    }

    // Explicit count check (for units/buah/set)
    if (item.unit === 'unit' || item.unit === 'buah' || item.unit === 'set' || item.unit === 'titik') {
      if (dims.count !== undefined && dims.count > 0) {
        return { isValid: true };
      }
      return {
        isValid: false,
        errorState: 'QUANTITY_NOT_FOUND',
        reason: 'Kuantitas/jumlah unit tidak ditemukan pada dokumen DED.',
      };
    }

    // Check 3D volume requirements (Length × Width × Height/Depth)
    const category = item.category;
    if (category === 'CONCRETE' || category === 'MASONRY' || category === 'EARTHWORK') {
      if (dims.length === undefined) {
        return {
          isValid: false,
          errorState: 'DIMENSION_NOT_FOUND',
          reason: 'Panjang (length) belum ditemukan pada gambar atau tabel DED.',
        };
      }
      if (dims.width === undefined && dims.height === undefined) {
        return {
          isValid: false,
          errorState: 'DIMENSION_NOT_FOUND',
          reason: 'Dimensi penampang (lebar/tinggi) belum lengkap.',
        };
      }
    }

    // Check 2D area requirements (Length × Width)
    if (category === 'FINISH' || category === 'ROOF') {
      if (dims.length === undefined || dims.width === undefined) {
        return {
          isValid: false,
          errorState: 'DIMENSION_NOT_FOUND',
          reason: 'Panjang atau lebar ruangan/bidang belum lengkap.',
        };
      }
    }

    return { isValid: true };
  }

  /**
   * W7 (§7/S3-4, 2026-11-22) — normalisasi satu dimensi ke meter dari
   * satuan EKSPLISIT provenance (`dimensions.provenance.<dim>.unit`).
   * Menggantikan heuristik lama `nilai > 10 ? nilai/100 : nilai` yang
   * mengubah lebar 12 m yang sah menjadi 0,12 m. Tanpa satuan
   * eksplisit, nilai dianggap meter (kontrak pipeline:
   * dedToRabPipelineService sudah menormalisasi mm→m sebelum mengisi
   * dimensions). Satuan eksplisit yang tak dikenal → null (pemanggil
   * MENOLAK, seperti quantity.ts yang menolak bila satuan tidak jelas
   * — tidak pernah ditebak).
   */
  private dimensionToMeters(value: number, provenanceUnit?: string | null): number | null {
    const u = (provenanceUnit ?? '').trim().toLowerCase();
    if (u === '' || u === 'm' || u === 'meter' || u === 'meters') return value;
    if (u === 'cm') return value / 100;
    if (u === 'mm') return value / 1000;
    return null;
  }

  /**
   * W7 (§7/S3-4) — catatan konversi untuk formula, agar konversi
   * satuan transparan di hasil (pola quantity.ts).
   */
  private conversionNote(units: Array<string | null | undefined>): string {
    const converted = [...new Set(
      units.map((u) => (u ?? '').trim().toLowerCase()).filter((u) => u === 'cm' || u === 'mm')
    )];
    return converted.length > 0 ? ` [konversi ${converted.join('/')}→m]` : '';
  }

  /**
   * Performs deterministic arithmetic calculation using EZRAB Core
   */
  public calculateQuantity(item: DEDWorkItem): {
    success: boolean;
    quantity?: number;
    unit?: SupportedUnit;
    calculation?: DeterministicCalculationResult;
    errorState?: string;
    reason?: string;
  } {
    const validation = this.validateForCalculation(item);
    if (!validation.isValid) {
      return {
        success: false,
        errorState: validation.errorState,
        reason: validation.reason,
      };
    }

    const dims = item.dimensions!;

    // 1. Discrete Counts
    if (dims.count !== undefined && dims.count > 0) {
      return {
        success: true,
        quantity: dims.count,
        unit: 'unit',
        calculation: {
          formula: `${dims.count} unit (Jumlah terhitung langsung)`,
          computedValue: dims.count,
          unit: 'unit',
          calculationType: 'COUNT',
        },
      };
    }

    // 2. 3D Volume: Length × Width × Height (e.g. 42.50m × 0.60m × 0.30m = 7.65 m³)
    if (dims.length !== undefined && dims.width !== undefined && dims.height !== undefined) {
      // W7 (S3-4): satuan eksplisit dari provenance; tanpa satuan =
      // meter (BUKAN heuristik >10 → /100). Satuan tak dikenal → tolak.
      const l = this.dimensionToMeters(dims.length, dims.provenance?.length?.unit);
      const w = this.dimensionToMeters(dims.width, dims.provenance?.width?.unit);
      const h = this.dimensionToMeters(dims.height, dims.provenance?.height?.unit);
      if (l === null || w === null || h === null) {
        const bad = l === null
          ? `panjang ("${dims.provenance?.length?.unit}")`
          : w === null
            ? `lebar ("${dims.provenance?.width?.unit}")`
            : `tinggi ("${dims.provenance?.height?.unit}")`;
        return {
          success: false,
          errorState: 'AMBIGUOUS_UNIT',
          reason: `Satuan dimensi ${bad} tidak dikenal — kuantitas tidak dapat dihitung tanpa satuan panjang yang jelas (m/cm/mm).`,
        };
      }
      const note = this.conversionNote([
        dims.provenance?.length?.unit,
        dims.provenance?.width?.unit,
        dims.provenance?.height?.unit,
      ]);

      const rawVol = l * w * h;
      const vol = Number(rawVol.toFixed(3));

      return {
        success: true,
        quantity: vol,
        unit: 'm³',
        calculation: {
          formula: `${l.toFixed(2)} m × ${w.toFixed(2)} m × ${h.toFixed(2)} m = ${vol} m³${note}`,
          computedValue: vol,
          unit: 'm³',
          calculationType: 'VOLUME_3D',
        },
      };
    }

    // 3. 2D Area: Length × Width (e.g. 4.00m × 5.00m = 20.00 m²)
    if (dims.length !== undefined && dims.width !== undefined) {
      const l = this.dimensionToMeters(dims.length, dims.provenance?.length?.unit);
      const w = this.dimensionToMeters(dims.width, dims.provenance?.width?.unit);
      if (l === null || w === null) {
        const bad = l === null
          ? `panjang ("${dims.provenance?.length?.unit}")`
          : `lebar ("${dims.provenance?.width?.unit}")`;
        return {
          success: false,
          errorState: 'AMBIGUOUS_UNIT',
          reason: `Satuan dimensi ${bad} tidak dikenal — kuantitas tidak dapat dihitung tanpa satuan panjang yang jelas (m/cm/mm).`,
        };
      }
      const note = this.conversionNote([
        dims.provenance?.length?.unit,
        dims.provenance?.width?.unit,
      ]);
      const rawArea = l * w;
      const area = Number(rawArea.toFixed(2));

      return {
        success: true,
        quantity: area,
        unit: 'm²',
        calculation: {
          formula: `${l.toFixed(2)} m × ${w.toFixed(2)} m = ${area} m²${note}`,
          computedValue: area,
          unit: 'm²',
          calculationType: 'AREA_2D',
        },
      };
    }

    // 4. 1D Perimeter / Linear Length
    if (dims.length !== undefined) {
      const l = this.dimensionToMeters(dims.length, dims.provenance?.length?.unit);
      if (l === null) {
        return {
          success: false,
          errorState: 'AMBIGUOUS_UNIT',
          reason: `Satuan dimensi panjang ("${dims.provenance?.length?.unit}") tidak dikenal — kuantitas tidak dapat dihitung tanpa satuan panjang yang jelas (m/cm/mm).`,
        };
      }
      const note = this.conversionNote([dims.provenance?.length?.unit]);
      return {
        success: true,
        quantity: l,
        unit: 'm',
        calculation: {
          formula: `${l.toFixed(2)} m (Panjang linier)${note}`,
          computedValue: l,
          unit: 'm',
          calculationType: 'PERIMETER_1D',
        },
      };
    }

    return {
      success: false,
      errorState: 'QUANTITY_NOT_FOUND',
      reason: 'Tidak dapat menghitung kuantitas dari dimensi yang ada.',
    };
  }
}

export const dedQtoCalculationEngine = DedQtoCalculationEngine.getInstance();

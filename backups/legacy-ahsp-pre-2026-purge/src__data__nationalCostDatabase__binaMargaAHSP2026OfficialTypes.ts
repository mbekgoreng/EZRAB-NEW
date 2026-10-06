/**
 * BINA MARGA AHSP 2026 — OFFICIAL TYPES
 * ======================================
 *
 * Types for the official extraction from Lampiran II SE DJBK No. 47/SE/Dk/2026.
 * Kept in a separate file so that the data array (binaMargaAHSP2026Official.ts)
 * can import types without creating a cyclic dependency.
 */

import { AHSPComponent } from '../../types';
import type { AHSPDomain, AHSPNormativeStatus, AHSPMethod, AHSPVerificationStatus } from './types';

/** Readability of a coefficient extracted from the PDF. */
export type CoefficientReadability =
  | 'OK'              // Coefficient printed with enough digits; usable.
  | 'TINY_COEF'       // < 0.001 — too few significant digits to be reliable.
  | 'LOST_COEF';      // Printed as 0 (or truncated) but total > 0 — unreadable.

/** Readability of an entire item. */
export type ItemReadability =
  | 'OK'              // All components OK.
  | 'DEGRADED'        // Some components TINY_COEF; item usable with caution.
  | 'UNREADABLE';     // One or more components LOST_COEF; do NOT use for automatic calculation.

export interface OfficialAHSPComponent extends AHSPComponent {
  /** Index within its section (1, 2, 3 …). */
  index: number;
  /** Component type from the document. */
  componentType: 'TENAGA' | 'BAHAN' | 'PERALATAN';
  /** Readability of the coefficient extracted from the PDF. */
  readability: CoefficientReadability;
  /** Raw text line from the PDF (for audit). */
  raw: string;
}

export interface OfficialAHSPItem {
  id: string;
  code: string;
  codeNormalized: string;
  name: string;
  unit: string;
  domain: AHSPDomain;
  category: string;
  version: string;
  year: number;
  normativeStatus: AHSPNormativeStatus;
  method: AHSPMethod;
  sourceDocument: string;
  /** PDF page where the item header (name + code) appears. */
  headerPage: number;
  /** PDF page where the analisa table appears; null if header-only. */
  analisaPage: number | null;
  /** Number format used in the analisa table: ID (1.234,56) or US (1,234.56). */
  numberFormat: 'ID' | 'US' | null;
  status: AHSPVerificationStatus;
  laborComponents: OfficialAHSPComponent[];
  materialComponents: OfficialAHSPComponent[];
  equipmentComponents: OfficialAHSPComponent[];
  totalLabor: number | null;
  totalMaterial: number | null;
  totalEquipment: number | null;
  /** D = A + B + C (direct cost before overhead). */
  totalABC: number | null;
  /** Overhead & profit percentage printed in the document. */
  overheadProfitPercent: number | null;
  /** Overhead & profit amount printed in the document. */
  overheadProfitAmount: number | null;
  /** F = D + E (final unit price from the document). Reference only. */
  unitPrice: number | null;
  /** Overall readability of the item. */
  readability: ItemReadability;
  /** Parser warnings (non-empty = extraction uncertainty). */
  warnings: string[];
  lastUpdated: string;
  dataQualityScore: number;
}

/** Source metadata for this extraction. */
export const BINA_MARGA_2026_SOURCE_METADATA = {
  sourceId: 'SE-DJBK-47-2026-LAMPIRAN-II',
  institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
  directorate: 'Direktorat Jenderal Bina Marga',
  documentName: 'Analisa Harga Satuan Pekerjaan (AHSP) Bidang Bina Marga',
  documentNumber: 'SE DJBK No. 47/SE/Dk/2026',
  documentYear: 2026,
  version: '2026.0',
  effectiveDate: '2026-02-20',
  status: 'VERIFIED' as AHSPVerificationStatus,
  sourceUrl: 'https://binakonstruksi.pu.go.id',
  description:
    'Lampiran II SE DJBK No. 47/SE/Dk/2026 — Analisa Harga Satuan Pekerjaan Bidang Bina Marga. ' +
    'Extracted programmatically from the official PDF (3,125 pages). ' +
    'Coefficients are preserved as printed; prices are reference-year examples only.',
};

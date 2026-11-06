import { CalculationRun } from '../../types';

export interface CalculatorParamDef {
  id: string; // e.g. 'P', 'L', 'C', 'H', 'R'
  label: string; // e.g. 'Panjang Lahan (P)'
  description: string;
  unit: string; // 'm', 'cm', 'mm', 'm²', 'm³', 'buah', 'titik', 'kg', 'sak'
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  category?: 'dimensi' | 'spesifikasi' | 'parameter';
  options?: Array<{ label: string; value: number | string }>;
}

/**
 * Identitas sumber daya kanonis (Fase 1 Master Repair, 2026-11-06).
 * Nama bebas BUKAN lagi identitas finansial: komponen boleh membawa
 * `resourceCode` kanonis (lihat canonicalResources.ts) dan resolver harga
 * memutuskan berdasarkan kode + kategori + satuan, bukan kemiripan nama.
 * Semua field bersifat opsional (kompatibel mundur) — komponen tanpa kode
 * tetap tampil dan berstatus eksplisit, tidak pernah dihargai diam-diam.
 */
export type ResourceCategory = 'MATERIAL' | 'LABOR' | 'EQUIPMENT';

export type PriceResolutionPolicy =
  | 'OFFICIAL_FIRST'      // resmi AHSP 2026 dulu, lalu referensi pasar berlabel
  | 'MARKET_REFERENCE'    // hanya referensi pasar berlabel (bukan resmi)
  | 'ESTIMATE_ALLOWED'    // estimasi kalkulator boleh dipakai (berlabel)
  | 'MANUAL_ONLY';        // hanya harga manual pengguna yang boleh mengisi

export interface MaterialBreakdownItem {
  name: string;
  quantity: number;
  unit: string;
  coefficient?: number;
  ahspCategory?: string;
  unitPriceEstimate?: number;
  /** Kode identitas kanonis (canonicalResources.ts), mis. CEMENT_PCC_50KG. */
  resourceCode?: string;
  /** Kategori sumber daya kanonis. */
  resourceCategory?: ResourceCategory;
  /** Deskripsi/spesifikasi kanonis bila berbeda dari nama tampilan. */
  resourceDescription?: string;
  /** Kebijakan resolusi harga untuk komponen ini. */
  priceResolutionPolicy?: PriceResolutionPolicy;
}

export interface LaborBreakdownItem {
  role: string;
  hoursOrDays: number;
  unit: string;
  coefficient?: number;
  rateEstimate?: number;
  /** Kode identitas kanonis peran upah, mis. LABOR_TUKANG. */
  resourceCode?: string;
  /** Kategori sumber daya kanonis (selalu LABOR untuk item ini). */
  resourceCategory?: ResourceCategory;
  /** Deskripsi/spesifikasi kanonis bila berbeda dari nama tampilan. */
  resourceDescription?: string;
  /** Kebijakan resolusi harga untuk komponen ini. */
  priceResolutionPolicy?: PriceResolutionPolicy;
}

export interface CalculatorFormulaStep {
  stepNumber: number;
  code: string;
  description: string;
  formulaText: string;
  calculatedValue: number;
  unit: string;
}

export interface CalculationResult {
  primaryQuantity: number;
  primaryUnit: string;
  primaryLabel: string;
  breakdown: Record<string, number>;
  formulaSteps: CalculatorFormulaStep[];
  materials: MaterialBreakdownItem[];
  labor: LaborBreakdownItem[];
  equipment?: MaterialBreakdownItem[];
  ahspSuggestions?: Array<{
    code: string;
    name: string;
    unit: string;
    coefficient: number;
  }>;
  technicalNotes?: string[];
}

export interface ConstructionCalculatorSpec {
  id: string; // e.g. 'BOWPLANK'
  category: 'persiapan' | 'struktur' | 'arsitektur' | 'mep' | 'finishing' | 'infrastruktur';
  title: string;
  shortName: string;
  codePrefix: string; // e.g. 'QTO.01.BOW'
  version: string;
  excelSheetName: string;
  description: string;
  primaryUnit: string;
  primaryQuantityLabel: string;
  /** @deprecated Pricing belongs to the AHSP/pricing adapter, not quantity Core. */
  defaultAhspCode?: string;
  /** @deprecated Pricing belongs to the AHSP/pricing adapter, not quantity Core. */
  defaultAhspName?: string;
  parameters: CalculatorParamDef[];
  calculate: (inputs: Record<string, number>) => CalculationResult;
  diagramComponentKey: string; // e.g. 'BowplankDiagram'
}

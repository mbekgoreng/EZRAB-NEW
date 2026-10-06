/**
 * AHSP 2026 MASTER DATASET — canonical types.
 *
 * These types implement the schema required by the master prompt §8, §9, §10.
 * They are deliberately PRICE-FREE (§13): the master dataset carries coefficients
 * and resource references only. Active prices belong to the EZRAB Price Engine.
 */

export type AHSPField = 'SMKK' | 'SDA' | 'BINA_MARGA' | 'CIPTA_KARYA' | 'UMUM';

export type ResourceType = 'material' | 'labor' | 'equipment';

export type ValidationStatus = 'VERIFIED' | 'NEEDS_REVIEW' | 'INVALID';

export type DuplicateStatus = 'unique' | 'exact_duplicate' | 'possible_duplicate' | 'conflict';

/** A single resource line inside an AHSP analysis table. */
export interface AHSPComponent {
  resource_code: string;
  resource_name: string;
  resource_type: ResourceType;
  unit: string;
  /** Numeric coefficient after normalization. null when unreadable. */
  coefficient: number | null;
  /** Coefficient exactly as printed in the source, e.g. "0,150". */
  coefficient_raw: string;
  /** PDF page the component row was read from. */
  source_page: number;
  /** Raw reconstructed text line (audit trail). */
  raw: string;
}

export interface AHSPSourceRef {
  regulation: string;
  attachment: string;
  page: number;
  source_file: string;
}

export interface AHSPValidation {
  code_verified: boolean;
  description_verified: boolean;
  unit_verified: boolean;
  components_verified: boolean;
  coefficients_verified: boolean;
  source_verified: boolean;
  duplicate_checked: boolean;
  status: ValidationStatus;
  issues: string[];
}

export interface AHSPItem {
  id: string;
  code: string;
  version: string;
  field: AHSPField;
  division: string;
  subdivision: string;
  category: string;
  subcategory: string;
  description: string;
  unit: string;
  source: AHSPSourceRef;
  components: {
    materials: AHSPComponent[];
    labor: AHSPComponent[];
    equipment: AHSPComponent[];
  };
  calculation: {
    material_cost_formula: string;
    labor_cost_formula: string;
    equipment_cost_formula: string;
    unit_price_formula: string;
  };
  validation: AHSPValidation;
  /** Document-level note, e.g. an O&P percentage or an analysis method remark. */
  notes?: string[];
  /** Reference-year figures printed in the source — NEVER used as active price (§13). */
  source_reference?: {
    total_abc?: number | null;
    overhead_profit_percent?: number | null;
    unit_price_printed?: number | null;
  };
}

export interface ResourceMasterEntry {
  resource_id: string;
  code: string;
  name: string;
  type: ResourceType;
  unit: string;
  category: string;
  source_ahsp_codes: string[];
  duplicate_status: DuplicateStatus;
}

export const CALCULATION_TEMPLATE = {
  material_cost_formula: 'SUM(material_coefficient * active_material_price)',
  labor_cost_formula: 'SUM(labor_coefficient * active_labor_price)',
  equipment_cost_formula: 'SUM(equipment_coefficient * active_equipment_price)',
  unit_price_formula: 'material_cost + labor_cost + equipment_cost',
} as const;

export const REGULATION = 'SE DJBK No. 47/SE/Dk/2026';

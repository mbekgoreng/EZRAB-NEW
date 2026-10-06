/**
 * EZRAB — Universal Construction Template & Estimation Engine Types
 * 
 * Defines schemas for:
 * - Multi-sector construction categories (Rumah, Jalan, Perkerasan, SDA, Gedung, Hotel, dll)
 * - 3-Tier Detail Level Engine (STANDARD, PROFESSIONAL, COMPREHENSIVE)
 * - Dynamic parameter definitions (NUMBER, TEXT, BOOLEAN, SELECT, MULTI_SELECT)
 * - Program Ruang (Space templates for architectural works)
 * - Work components, deterministic calculation rules, conditional rules & optional works
 * - Material Ecosystem (Decoupled Material from Price, Project Specifications, Coverage/Packaging)
 * - Traceable AHSP mappings & price resolver
 * - Template lifecycle, versioning, and user overrides
 */

import { RabItem } from './index';

export type TemplateCategory =
  | 'RUMAH_TINGGAL'
  | 'CUSTOM'
  | 'JALAN_TRANSPORTASI'
  | 'PERKERASAN'
  | 'SDA_IRIGASI'
  | 'GEDUNG'
  | 'BANGUNAN_TINGGI'
  | 'HOTEL_HOSPITALITY'
  | 'KESEHATAN'
  | 'PENDIDIKAN'
  | 'INDUSTRI'
  | 'UTILITAS'
  | 'LANDSCAPE_SITE'
  | 'MEP_SYSTEM'
  | 'RENOVASI_MAINTENANCE'
  | 'TEMPLATE_SAYA';

export interface WorkPackage {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  componentIds?: string[];
  order?: number;
}

export type DetailLevel =
  | 'STANDARD'
  | 'PROFESSIONAL'
  | 'COMPREHENSIVE';

export type TemplateSource =
  | 'EZRAB_OFFICIAL'
  | 'USER_TEMPLATE'
  | 'USER'
  | 'PROJECT_CUSTOM';

export type ParameterInputType =
  | 'NUMBER'
  | 'TEXT'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT';

export interface ParameterOption {
  label: string;
  value: string | number | boolean;
}

export interface TemplateParameter {
  id: string;
  key: string;
  label: string;
  type: ParameterInputType;
  unit?: string;
  required: boolean;
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: ParameterOption[];
  description?: string;
  group?: 'dimensions' | 'specifications' | 'general' | 'finishing' | 'mep' | 'scope';
}

export interface SpaceTemplate {
  id: string;
  name: string;
  category: string;
  quantityRule: string; // formula or number e.g. "3" or "num_bedrooms"
  targetArea?: number; // m2 per space
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
  components?: string[]; // component IDs associated with this space
  description?: string;
}

/**
 * Material Ecosystem Models
 * Core Rule: Material !== Price
 */
export interface MaterialItem {
  id: string;
  category: string; // e.g. "KERAMIK", "GRANIT", "CAT", "SEMEN", "BESI", "BAJA_RINGAN", "GENTENG", "PAVING", "BETON", "PIPA", "SANITARY", "ELEKTRIKAL", "PLAFON"
  name: string;
  brand?: string;
  product?: string;
  series?: string;
  specification: string;
  size?: string;
  unit: string; // e.g. "m2", "kg", "liter", "sak", "batang", "unit"
  supplier?: string;
  sku?: string;
  image?: string;
  documents?: string[];
  coveragePerUnit?: number; // e.g. 10 m2 / liter for paint
  defaultWastePercent?: number; // e.g. 5% or 10%
  packagingOptions?: string[]; // e.g. ['1 L', '2.5 L', '5 L', '20 L'] or ['50 kg/sak']
}

export interface MaterialPriceReference {
  id: string;
  materialId: string;
  unitPrice: number;
  supplier: string;
  location: string;
  effectiveDate: string;
}

export interface ProjectMaterialSpecification {
  projectId?: string;
  categoryDefaults: Record<string, string>; // category -> materialId
  itemOverrides: Record<string, {
    materialId: string;
    customWastePercent?: number;
    notes?: string;
  }>;
}

export interface UserOverrideRecord {
  field: string;
  originalValue: any;
  userValue: any;
  source: 'USER_OVERRIDE' | 'TEMPLATE_DEFAULT' | 'PROJECT_SPEC';
  updatedBy: string;
  updatedAt: string;
  reason?: string;
}

export interface ConstructionComponentTemplate {
  id: string;
  name: string;
  category: string; // e.g. "02. PEKERJAAN STRUKTUR", "04. PEKERJAAN DINDING", etc.
  subcategory?: string;
  wbsCode?: string;
  unit: string;
  detailLevel?: DetailLevel; // STANDARD | PROFESSIONAL | COMPREHENSIVE (default: PROFESSIONAL)
  calculationRule: string; // formula expression e.g. "length * width", "building_area * 1.05", "count * coefficient"
  variables: string[];
  ahspCode?: string;
  ahspName?: string;
  unitPrice?: number;
  priceSource?: 'OFFICIAL_AHSP' | 'REFERENCE_PRICE' | 'AI_CUSTOM';
  description?: string;
  isOptional?: boolean; // Toggable optional work item (e.g. AC, Water heater, Canopy, Pagar)
  condition?: string; // Conditional formula e.g. "num_floors >= 2", "electricity_source === 'PLN_BARU'", "paving_thickness >= 8"
  materialCategory?: string; // Link to Material Category (e.g. "KERAMIK", "CAT", "PAVING")
  defaultMaterialId?: string; // Default material link
  dependencies?: string[];
  overrides?: UserOverrideRecord[];
}

export interface CalculationRule {
  targetComponentId: string;
  formula: string;
  unit: string;
  variables: string[];
  description?: string;
}

export interface AhspMapping {
  componentId: string;
  ahspCode: string;
  ahspName: string;
  unit: string;
  basePrice: number;
  source: 'PUPR_2026' | 'BINA_MARGA' | 'SDA' | 'CUSTOM';
}

export interface TemplateMetadata {
  source: TemplateSource;
  version: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  isArchived?: boolean;
}

export interface RabTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  subcategory?: string;
  description: string;
  badge?: string;
  icon?: string;
  supportedDetailLevels?: DetailLevel[];
  defaultDetailLevel?: DetailLevel;
  parameters: TemplateParameter[];
  spaces?: SpaceTemplate[];
  workPackages?: WorkPackage[];
  components: ConstructionComponentTemplate[];
  calculationRules?: CalculationRule[];
  ahspMappings?: AhspMapping[];
  metadata: TemplateMetadata;
  // Optional built-in generator function if available in code
  generateRabItems?: (params: Record<string, any>, detailLevel?: DetailLevel, optionalItemIds?: string[]) => RabItem[];
}

export interface TraceabilityRecord {
  itemId: string;
  itemNo: number;
  wbsCode: string;
  description: string;
  volume: number;
  unit: string;
  calculationTrace: string;
  ahspCode?: string;
  materialName?: string;
  unitPrice: number;
  amount: number;
  priceSource: string;
}

export interface GeneratedTemplateRabResult {
  templateId: string;
  templateName: string;
  templateVersion: string;
  detailLevel: DetailLevel;
  evaluatedParameters: Record<string, any>;
  selectedOptionalItemIds: string[];
  items: RabItem[];
  totalEstimate: number;
  itemCount: number;
  categorySummaries: Record<string, number>;
  materialSpecifications?: Record<string, string>;
  traceability?: TraceabilityRecord[];
  generatedAt: string;
}

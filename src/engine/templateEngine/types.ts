/**
 * EZRAB — TEMPLATE AUTOMATION ENGINE TYPES & SCHEMAS
 * Phase 1 Foundation & Phase 2 Construction Library
 */

export type ProjectCategory = 'BUILDING' | 'INFRASTRUCTURE';

export type TemplateSource = 'SYSTEM' | 'CUSTOM' | 'SNAPSHOT';

export type ParameterType = 'NUMBER' | 'STRING' | 'SELECT' | 'BOOLEAN';

export type ParameterSource =
  | 'user_input'
  | 'ded'
  | 'template'
  | 'assumption'
  | 'ai_extraction'
  | 'database';

export type QuantitySource =
  | 'user_supplied'
  | 'ded_extracted'
  | 'calculated'
  | 'template_estimate'
  | 'ai_estimate';

export type PriceSource =
  | 'verified_database'
  | 'ai_estimate';

export type AhspStatus =
  | 'verified'
  | 'needs_verification';

export type ParameterValidationStatus = 'verified' | 'needs_verification' | 'invalid';

export interface ParameterOption {
  label: string;
  value: string | number | boolean;
}

export interface ParameterDefinition {
  id: string;
  name: string;
  description?: string;
  type: ParameterType;
  required: boolean;
  defaultValue?: any;
  unit?: string;
  min?: number;
  max?: number;
  options?: ParameterOption[];
  group?: 'general' | 'dimensions' | 'specifications' | 'location' | 'finishing';
}

export interface ParameterValue {
  value: any;
  unit?: string;
  source: ParameterSource;
  validationStatus: ParameterValidationStatus;
  confidence?: number;
  extractedFrom?: string;
  reasoning?: string;
}

export interface WbsNode {
  code: string; // e.g. "01", "01.01", "01.01.01"
  title: string;
  level: 1 | 2 | 3;
  unit?: string;
  category?: string;
  description?: string;
  isOptional?: boolean;
  conditionalRule?: {
    parameterId: string;
    operator: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'contains';
    value: any;
  };
  children?: WbsNode[];
  ahspCode?: string;
  defaultMultiplier?: number;
}

export interface QuantityCalculationRule {
  wbsCode: string;
  formula: string; // mathematical/logical expression evaluated with parameters, e.g. "building_area * 1.05"
  unit: string;
  variables: string[];
  description?: string;
}

export interface CalculatedQuantityItem {
  wbsCode: string;
  quantity: number;
  unit: string;
  source: QuantitySource;
  formulaUsed?: string;
  reasoning?: string;
}

export interface GeneratedRabItem {
  id: string;
  code: string;
  name: string;
  category: string;
  level: 1 | 2 | 3;
  volume: number;
  unit: string;
  quantitySource: QuantitySource;
  ahspCode?: string;
  ahspStatus: AhspStatus;
  unitPrice: number;
  priceSource: PriceSource;
  totalPrice: number;
  validationStatus: 'verified' | 'needs_verification';
  isOptional?: boolean;
}

export interface AssumptionRule {
  parameterId: string;
  condition?: {
    parameterId: string;
    operator: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in';
    value: any;
  };
  assumedValue: any;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  industryStandardReference?: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  expression: string; // e.g. "building_area <= land_area"
  errorMessage: string;
}

export interface ConstructionProjectTemplate {
  id: string;
  name: string;
  code: string;
  category: ProjectCategory;
  type: string; // e.g. "residential", "hotel", "road"
  variant?: string; // e.g. "asphalt", "concrete", "drainage", "irrigation-channel"
  version: string; // semantic versioning e.g. "1.0.0"
  description: string;
  aliases: string[];
  keywords: string[];
  parameters: ParameterDefinition[];
  wbsHierarchy: WbsNode[];
  optionalWbsNodes?: WbsNode[];
  quantityRules?: QuantityCalculationRule[];
  assumptionRules?: AssumptionRule[];
  validationRules?: ValidationRule[];
  documentRequirements?: string[];
  created_at: string;
  updated_at: string;
}

export interface ClassificationMatch {
  templateId: string;
  templateName: string;
  category: ProjectCategory;
  type: string;
  variant?: string;
  confidence: number; // 0.0 to 1.0
  matchedKeywords: string[];
  reasoning: string;
}

export interface ClassificationResult {
  topMatch: ClassificationMatch | null;
  alternatives: ClassificationMatch[];
  isLowConfidence: boolean; // confidence < 0.65
  category: ProjectCategory | 'UNKNOWN';
  projectType: string;
  variant?: string;
  extractedParameters: Record<string, ParameterValue>;
  missingRequiredParameters: string[];
  assumptionsApplied: Record<string, ParameterValue>;
}

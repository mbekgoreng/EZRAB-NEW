/**
 * EZRAB CALCULATOR CORE CONTRACTS & TYPE SYSTEM
 * Phase 2 Core Calculator Engine
 * 
 * Strict, deterministic, type-safe calculation contracts.
 */

export type ReadinessStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'MISMATCH'
  | 'UNVERIFIED'
  | 'BLOCKED'
  | 'NOT_APPLICABLE';

export type FormulaSourceType =
  | 'excel_reference'
  | 'verified_reference'
  | 'external_source'
  | 'implementation_only';

export type PrecisionPolicy =
  | 'EXACT_DECIMAL'     // Internal high-precision decimal.js
  | 'DECIMAL_4'         // 4 decimal places
  | 'DECIMAL_2'         // 2 decimal places (standard QTO)
  | 'INTEGER_ROUND'     // Nearest whole integer
  | 'INTEGER_CEIL';     // Ceiling integer (discrete units like pieces/sacks)

export type QuantityOwnership = 'produced' | 'derived' | 'consumed';

export type QuantityPolicy =
  | 'USE_GROSS'
  | 'USE_NET'
  | 'USE_SOURCE_RESULT'
  | 'INDEPENDENT';

export type DependencyStatus = 'candidate' | 'verified' | 'active';

export interface SourceContext {
  type: string;
  referenceId?: string;
  sourceSheet?: string;
  sourceCell?: string;
  sourceHash?: string;
}

export interface CalculationContext {
  projectId: string;
  workspaceId?: string;
  userId?: string;
  calculatorVersion?: string;
  precisionPolicy?: PrecisionPolicy;
  source?: SourceContext;
  dependencyResults?: Record<string, CalculationOutput>;
  allowUnverifiedFormulas?: boolean;
}

export type CalculationInput = Record<string, number | string | boolean | null | undefined>;

export interface CalculationBreakdownLine {
  code: string;
  label: string;
  formulaText: string;
  value: number;
  unit: string;
  ownership?: QuantityOwnership;
  notes?: string;
}

export interface CalculationBreakdown {
  [key: string]: number | CalculationBreakdownLine;
}

export interface CalculationWarning {
  code: string;
  message: string;
  field?: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface CalculationError {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}

export interface FormulaProvenance {
  calculatorId: string;
  calculatorVersion: string;
  formulaId: string;
  mathematicalExpression: string;
  sourceType: FormulaSourceType;
  workbook?: string;
  sheet?: string;
  cell?: string;
  sourceHash?: string;
  testVectorIds?: string[];
  status: ReadinessStatus;
  notes?: string;
}

export interface ExecutionTraceStep {
  stepNumber: number;
  code: string;
  description: string;
  formulaText: string;
  evaluatedExpression: string;
  calculatedValue: number;
  unit: string;
}

export interface ExecutionTrace {
  calculatorId: string;
  version: string;
  timestamp: string;
  inputs: Record<string, unknown>;
  formulaSteps: ExecutionTraceStep[];
  primaryResult: {
    quantity: number;
    unit: string;
    label: string;
  };
  narrativeExplanation: string;
}

export interface CalculationDependency {
  sourceCalculatorId: string;
  targetParameter: string;
  sourceOutputField: string;
  status: DependencyStatus;
  policy: QuantityPolicy;
  conversionFactor?: number;
  description?: string;
}

export interface UnitDefinition {
  code: string;
  name: string;
  category: 'length' | 'area' | 'volume' | 'mass' | 'count' | 'time' | 'dimensionless';
  symbol: string;
  baseUnit: string;
  conversionToBase: number; // multiply by this to get baseUnit
  aliases: string[];
}

export interface ParameterValidationRule {
  id: string;
  label: string;
  unit: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  integerOnly?: boolean;
  allowZero?: boolean;
  defaultValue?: number | string | boolean;
  options?: Array<{ label: string; value: number | string }>;
  description?: string;
  category?: 'dimensi' | 'spesifikasi' | 'parameter' | 'koefisien';
}

export interface ValidationSummary {
  isValid: boolean;
  errors: CalculationError[];
  warnings: CalculationWarning[];
  sanitizedInputs: Record<string, any>;
}

export interface MaterialBreakdown {
  name: string;
  quantity: number;
  unit: string;
  coefficient?: number;
  notes?: string;
  unitPriceEstimate?: number;
}

export interface LaborBreakdown {
  role: string;
  hoursOrDays: number;
  unit: string;
  coefficient?: number;
}

export interface EquipmentBreakdown {
  name: string;
  quantity: number;
  unit: string;
  coefficient?: number;
}

export interface CalculationOutput {
  calculatorId: string;
  version: string;
  primaryQuantity: number;
  primaryUnit: string;
  primaryLabel: string;
  breakdown: Record<string, number>;
  detailedBreakdown: CalculationBreakdownLine[];
  materials: MaterialBreakdown[];
  labor: LaborBreakdown[];
  equipment: EquipmentBreakdown[];
  warnings: CalculationWarning[];
  provenance: FormulaProvenance[];
  trace?: ExecutionTrace;
  status: ReadinessStatus;
  validation: ValidationSummary;
  timestamp: string;
}

export interface CalculatorDefinition {
  id: string;
  name: string;
  shortName: string;
  category: string;
  pack: string;
  version: string;
  description: string;
  primaryUnit: string;
  primaryQuantityLabel: string;
  parameters: ParameterValidationRule[];
  formulaSource: FormulaProvenance;
  dependencies: CalculationDependency[];
  status: ReadinessStatus;
  diagramComponentKey?: string;
  calculate: (inputs: CalculationInput, ctx?: CalculationContext) => CalculationOutput;
}

export interface CalculatorPack {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  status: ReadinessStatus;
  calculatorIds: string[];
  tags: string[];
}

import {
  CalculationInput,
  CalculationOutput,
  CalculationWarning,
  FormulaProvenance,
  FormulaSourceType,
  ParameterValidationRule,
} from '../contracts/types';
import { SafeDecimalEngine } from '../../safeDecimalEngine';

export interface CivilOutputConfig {
  calculatorId: string;
  version: string;
  primaryQuantity: number;
  primaryUnit: string;
  primaryLabel: string;
  breakdown?: Record<string, number>;
  materials?: Array<{ name: string; quantity: number; unit: string; coefficient?: number; notes?: string; unitPriceEstimate?: number }>;
  formulaSource: {
    calculatorId: string;
    calculatorVersion: string;
    formulaId: string;
    mathematicalExpression: string;
    sourceType?: FormulaSourceType;
    referenceName?: string;
    sectionOrClause?: string;
    notes?: string;
  };
  warnings?: CalculationWarning[];
  parameters?: ParameterValidationRule[];
  inputs?: CalculationInput;
}

export function toNum(val: unknown, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  const parsed = Number(val);
  return isNaN(parsed) ? fallback : parsed;
}

export function createCivilOutput(config: CivilOutputConfig): CalculationOutput {
  const warnings: CalculationWarning[] = [...(config.warnings || [])];

  const provenance: FormulaProvenance[] = [
    {
      calculatorId: config.formulaSource.calculatorId,
      calculatorVersion: config.formulaSource.calculatorVersion,
      formulaId: config.formulaSource.formulaId,
      mathematicalExpression: config.formulaSource.mathematicalExpression,
      sourceType: config.formulaSource.sourceType || 'verified_reference',
      workbook: config.formulaSource.referenceName || 'STANDAR_INFRASTRUKTUR_SIPIL',
      sheet: config.formulaSource.sectionOrClause || 'Quantity_Takeoff',
      status: 'PARTIALLY_VERIFIED',
      notes: config.formulaSource.notes || 'Perhitungan kuantitas fisik murni. Tidak mencakup analisis hidraulik atau desain struktur.',
    },
  ];

  return {
    calculatorId: config.calculatorId,
    version: config.version,
    primaryQuantity: SafeDecimalEngine.safeRound(config.primaryQuantity, 3),
    primaryUnit: config.primaryUnit,
    primaryLabel: config.primaryLabel,
    breakdown: config.breakdown || { primary: SafeDecimalEngine.safeRound(config.primaryQuantity, 3) },
    detailedBreakdown: Object.entries(config.breakdown || {}).map(([key, value]) => ({
      code: key,
      label: key,
      formulaText: 'computed',
      value: SafeDecimalEngine.safeRound(value, 3),
      unit: config.primaryUnit,
    })),
    materials: config.materials || [],
    labor: [],
    equipment: [],
    warnings,
    provenance,
    status: 'PARTIALLY_VERIFIED',
    validation: {
      isValid: true,
      errors: [],
      warnings,
      sanitizedInputs: (config.inputs as Record<string, any>) || {},
    },
    timestamp: new Date().toISOString(),
  };
}

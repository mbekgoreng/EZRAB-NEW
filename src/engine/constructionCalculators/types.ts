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

export interface MaterialBreakdownItem {
  name: string;
  quantity: number;
  unit: string;
  coefficient?: number;
  ahspCategory?: string;
  unitPriceEstimate?: number;
}

export interface LaborBreakdownItem {
  role: string;
  hoursOrDays: number;
  unit: string;
  coefficient?: number;
  rateEstimate?: number;
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
  /** @deprecated Do not use for production pricing. */
  defaultUnitPrice?: number;
  parameters: CalculatorParamDef[];
  calculate: (inputs: Record<string, number>) => CalculationResult;
  diagramComponentKey: string; // e.g. 'BowplankDiagram'
}

/**
 * EZRAB COST COMPOSITION DOMAIN — CONTRACTS & TYPES
 * Strongly typed definitions for direct cost decomposition (Labor, Material, Equipment).
 */

import { AHSPDefinition } from '../../ahsp/contracts/types';
import { PriceContext } from '../../pricing/contracts/types';
import { FormulaProvenance, ExecutionTraceStep } from '../../calculatorCore/contracts/types';

export type CostComponentType = 'labor' | 'material' | 'equipment';

export type CostCompositionStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'PRICE_MISSING'
  | 'INVALID_INPUT'
  | 'PROJECT_INVALID';

export interface CostComponentDetail {
  id: string;
  type: CostComponentType;
  itemCode: string;
  itemName: string;
  unit: string;
  coefficient: number;
  unitPrice: number;
  subtotalPerUnit: number;  // coefficient * unitPrice
  totalQuantity: number;    // coefficient * baseQuantity
  totalSubtotal: number;    // coefficient * baseQuantity * unitPrice
  priceSource?: string;
  priceStatus: 'RESOLVED' | 'UNRESOLVED' | 'OVERRIDDEN';
  provenance?: FormulaProvenance;
}

export interface CostCategoryBreakdown {
  type: CostComponentType;
  components: CostComponentDetail[];
  subtotalPerUnit: number;
  totalSubtotal: number;
}

export interface CostCompositionInput {
  quantity: number;
  quantityUnit: string;
  ahspDefinition: AHSPDefinition;
  priceContext: PriceContext;
}

export interface CostCompositionResult {
  status: CostCompositionStatus;
  projectId: string;
  quantity: number;
  unit: string;
  ahspCode: string;
  ahspName: string;
  labor: CostCategoryBreakdown;
  material: CostCategoryBreakdown;
  equipment: CostCategoryBreakdown;
  unitCost: number;        // Direct cost per unit (labor + material + equipment)
  directCost: number;      // Total direct cost (quantity * unitCost)
  warnings: string[];
  errors: string[];
  provenance: FormulaProvenance[];
  executionTrace: ExecutionTraceStep[];
}

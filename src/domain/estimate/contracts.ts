import { CalculationPolicy } from './calculationPolicy';
import { PolicyAdditionTotals } from './policyTotals';

export interface EstimateLineItemInput {
  readonly id: string;
  readonly sectionId?: string;
  readonly subsectionId?: string;
  readonly code?: string;
  readonly description: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPrice: number;
  readonly ahspSnapshotId?: string;
}

export interface CalculatedEstimateLineItem extends EstimateLineItemInput {
  readonly amount: number;
  readonly weightPercent: number;
}

export interface EstimateSubsectionInput {
  readonly id: string;
  readonly name: string;
  readonly items: readonly EstimateLineItemInput[];
}

export interface EstimateSectionInput {
  readonly id: string;
  readonly name: string;
  readonly items: readonly EstimateLineItemInput[];
  readonly subsections?: readonly EstimateSubsectionInput[];
}

export interface EstimateSectionSnapshot {
  readonly sectionId: string;
  readonly subsectionId?: string;
  readonly name: string;
  readonly total: number;
  readonly itemIds: readonly string[];
}

export interface EstimateWarning {
  readonly code: string;
  readonly message: string;
  readonly itemId?: string;
}

export interface EstimateSnapshot {
  readonly projectId: string;
  readonly calculatedItems: readonly CalculatedEstimateLineItem[];
  readonly sectionTotals: readonly EstimateSectionSnapshot[];
  readonly subsectionTotals: readonly EstimateSectionSnapshot[];
  readonly directCost: number;
  readonly overhead: number;
  readonly profit: number;
  readonly contingency: number;
  readonly markup: number;
  readonly ppn: number;
  readonly pph: number;
  readonly grandTotal: number;
  readonly itemWeights: Readonly<Record<string, number>>;
  readonly calculationPolicy: CalculationPolicy;
  readonly calculationPolicyVersion: string;
  readonly warnings: readonly EstimateWarning[];
  readonly calculatedAt: string;
}

export interface AhspCalculationInput {
  readonly ahspSnapshotId: string;
  readonly quantity: number;
}

export interface AhspCalculationResult {
  readonly ahspSnapshotId: string;
  readonly unitPrice: number;
  readonly amount: number;
}

/** Future canonical boundary. No existing caller is migrated in Phase 1. */
export interface CanonicalEstimateCalculator {
  calculateLineItem(
    input: EstimateLineItemInput,
    policy: CalculationPolicy,
  ): CalculatedEstimateLineItem;
  calculateEstimate(
    input: {
      readonly projectId: string;
      readonly sections: readonly EstimateSectionInput[];
    },
    policy: CalculationPolicy,
  ): EstimateSnapshot;
  calculateAhsp(
    input: AhspCalculationInput,
    policy: CalculationPolicy,
  ): AhspCalculationResult;
}

/** Retains the explicit project-level addition breakdown used by snapshots. */
export type EstimatePolicyAdditions = PolicyAdditionTotals;

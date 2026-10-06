/**
 * EZRAB COST COMPOSITION DOMAIN — VALIDATION
 */

import { CostCompositionResult } from '../contracts/types';

export interface CostValidationIssue {
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface CostValidationResult {
  valid: boolean;
  issues: CostValidationIssue[];
}

export class CostValidationEngine {
  public static validateResult(result: CostCompositionResult): CostValidationResult {
    const issues: CostValidationIssue[] = [];

    if (!result.projectId) {
      issues.push({ field: 'projectId', message: 'Missing projectId in cost composition result', severity: 'ERROR' });
    }

    if (result.directCost < 0 || isNaN(result.directCost) || !Number.isFinite(result.directCost)) {
      issues.push({ field: 'directCost', message: `Invalid direct cost: ${result.directCost}`, severity: 'ERROR' });
    }

    if (result.unitCost < 0 || isNaN(result.unitCost) || !Number.isFinite(result.unitCost)) {
      issues.push({ field: 'unitCost', message: `Invalid unit cost: ${result.unitCost}`, severity: 'ERROR' });
    }

    const hasErrors = issues.some((i) => i.severity === 'ERROR');

    return {
      valid: !hasErrors,
      issues,
    };
  }
}

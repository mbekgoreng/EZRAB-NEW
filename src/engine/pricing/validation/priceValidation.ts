/**
 * EZRAB PRICING DOMAIN — VALIDATION
 */

import { PriceDefinition } from '../contracts/types';

export interface PriceValidationIssue {
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface PriceValidationResult {
  valid: boolean;
  issues: PriceValidationIssue[];
}

export class PriceValidationEngine {
  public static validatePrice(price: PriceDefinition): PriceValidationResult {
    const issues: PriceValidationIssue[] = [];

    if (!price.code || price.code.trim() === '') {
      issues.push({ field: 'code', message: 'Price code is required', severity: 'ERROR' });
    }

    if (!price.name || price.name.trim() === '') {
      issues.push({ field: 'name', message: 'Price item name is required', severity: 'ERROR' });
    }

    if (price.price === undefined || price.price === null || isNaN(price.price) || !Number.isFinite(price.price)) {
      issues.push({ field: 'price', message: `Invalid price amount: ${price.price}`, severity: 'ERROR' });
    } else if (price.price < 0) {
      issues.push({ field: 'price', message: `Negative price not permitted: ${price.price}`, severity: 'ERROR' });
    }

    if (!price.unit || price.unit.trim() === '') {
      issues.push({ field: 'unit', message: 'Price unit is required', severity: 'ERROR' });
    }

    const hasErrors = issues.some((i) => i.severity === 'ERROR');

    return {
      valid: !hasErrors,
      issues,
    };
  }
}

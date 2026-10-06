/**
 * EZRAB CALCULATOR CORE — VALIDATION ENGINE
 * Schema-driven, typed parameter validation for construction calculators.
 */

import {
  ParameterValidationRule,
  ValidationSummary,
  CalculationError,
  CalculationWarning,
  CalculationInput,
} from '../contracts/types';
import { UnitEngine } from '../unit/unitEngine';

export class ValidationEngine {
  /**
   * Validate a full input dictionary against an array of parameter rules.
   */
  public static validate(
    inputs: CalculationInput,
    rules: ParameterValidationRule[]
  ): ValidationSummary {
    const errors: CalculationError[] = [];
    const warnings: CalculationWarning[] = [];
    const sanitizedInputs: Record<string, any> = {};

    for (const rule of rules) {
      const rawVal = inputs[rule.id];
      const isMissing = rawVal === null || rawVal === undefined || rawVal === '';

      // 1. Requiredness Check
      if (isMissing) {
        if (rule.required) {
          errors.push({
            code: 'ERR_REQUIRED_FIELD_MISSING',
            message: `Parameter "${rule.label}" (${rule.id}) is required and cannot be empty.`,
            field: rule.id,
          });
          continue;
        } else {
          // Use default value if provided
          if (rule.defaultValue !== undefined) {
            sanitizedInputs[rule.id] = rule.defaultValue;
          }
          continue;
        }
      }

      // 2. Type & Numeric Check
      if (typeof rule.defaultValue === 'number' || rule.min !== undefined || rule.max !== undefined) {
        const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);

        if (isNaN(num)) {
          errors.push({
            code: 'ERR_INVALID_NUMBER',
            message: `Parameter "${rule.label}" (${rule.id}) must be a valid number. Received "${rawVal}".`,
            field: rule.id,
            details: { rawValue: rawVal },
          });
          continue;
        }

        if (!isFinite(num)) {
          errors.push({
            code: 'ERR_INFINITE_NUMBER',
            message: `Parameter "${rule.label}" (${rule.id}) cannot be infinite.`,
            field: rule.id,
          });
          continue;
        }

        // 3. Integer Only Check
        if (rule.integerOnly && !Number.isInteger(num)) {
          errors.push({
            code: 'ERR_INTEGER_REQUIRED',
            message: `Parameter "${rule.label}" (${rule.id}) must be a whole integer. Received ${num}.`,
            field: rule.id,
          });
          continue;
        }

        // 4. Zero Allowance Check
        if (rule.allowZero === false && num === 0) {
          errors.push({
            code: 'ERR_ZERO_NOT_ALLOWED',
            message: `Parameter "${rule.label}" (${rule.id}) must be greater than zero. Received 0.`,
            field: rule.id,
          });
          continue;
        }

        // 5. Negative Value Check (domain default non-negative unless configured otherwise)
        if (num < 0 && (rule.min === undefined || rule.min >= 0)) {
          errors.push({
            code: 'ERR_NEGATIVE_NOT_ALLOWED',
            message: `Parameter "${rule.label}" (${rule.id}) cannot be negative. Received ${num}.`,
            field: rule.id,
          });
          continue;
        }

        // 6. Range Constraints (Min / Max)
        if (rule.min !== undefined && num < rule.min) {
          errors.push({
            code: 'ERR_VALUE_BELOW_MIN',
            message: `Parameter "${rule.label}" (${rule.id}) must be at least ${rule.min} ${rule.unit}. Received ${num}.`,
            field: rule.id,
            details: { min: rule.min, received: num },
          });
        }

        if (rule.max !== undefined && num > rule.max) {
          errors.push({
            code: 'ERR_VALUE_ABOVE_MAX',
            message: `Parameter "${rule.label}" (${rule.id}) cannot exceed ${rule.max} ${rule.unit}. Received ${num}.`,
            field: rule.id,
            details: { max: rule.max, received: num },
          });
        }

        // 7. Allowed Options Check
        if (rule.options && rule.options.length > 0) {
          const match = rule.options.some((opt) => opt.value === num);
          if (!match) {
            warnings.push({
              code: 'WARN_VALUE_NOT_IN_STANDARD_OPTIONS',
              message: `Parameter "${rule.label}" (${rule.id}) value ${num} is outside standard options.`,
              field: rule.id,
              severity: 'warning',
            });
          }
        }

        sanitizedInputs[rule.id] = num;
      } else {
        // String / Boolean / Other
        sanitizedInputs[rule.id] = rawVal;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedInputs,
    };
  }

  /**
   * Validate unit consistency between parameter rule and context unit
   */
  public static validateUnit(declaredUnit: string, expectedUnit: string): boolean {
    return UnitEngine.areCompatible(declaredUnit, expectedUnit);
  }
}

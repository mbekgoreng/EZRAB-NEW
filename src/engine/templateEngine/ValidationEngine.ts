import { ConstructionProjectTemplate, ParameterValue, ValidationRule } from './types';

export interface ValidationIssue {
  ruleId?: string;
  field?: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

export class ValidationEngine {
  public static validate(
    template: ConstructionProjectTemplate,
    parameters: Record<string, ParameterValue>
  ): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const info: ValidationIssue[] = [];

    // 1. Check required parameters
    for (const def of template.parameters) {
      const p = parameters[def.id];
      if (def.required && (!p || p.value === undefined || p.value === null || p.value === '')) {
        errors.push({
          field: def.id,
          severity: 'ERROR',
          message: `Parameter wajib "${def.name}" belum diisi.`
        });
      }

      // Check min/max if numeric
      if (p && typeof p.value === 'number') {
        if (def.min !== undefined && p.value < def.min) {
          errors.push({
            field: def.id,
            severity: 'ERROR',
            message: `Nilai "${def.name}" (${p.value}) kurang dari batas minimum (${def.min} ${def.unit || ''}).`
          });
        }
        if (def.max !== undefined && p.value > def.max) {
          warnings.push({
            field: def.id,
            severity: 'WARNING',
            message: `Nilai "${def.name}" (${p.value}) melebihi batas standar lazim (${def.max} ${def.unit || ''}).`
          });
        }
      }

      // Check assumptions requiring verification
      if (p && p.validationStatus === 'needs_verification') {
        info.push({
          field: def.id,
          severity: 'INFO',
          message: `Parameter "${def.name}" menggunakan nilai asumsi (${p.value}): ${p.reasoning || 'Mohon verifikasi sebelum finalisasi.'}`
        });
      }
    }

    // 2. Evaluate template-specific validation rules
    if (template.validationRules) {
      for (const rule of template.validationRules) {
        const passed = this.evaluateRule(rule, parameters);
        if (!passed) {
          const issue: ValidationIssue = {
            ruleId: rule.id,
            severity: rule.severity,
            message: rule.errorMessage
          };
          if (rule.severity === 'ERROR') {
            errors.push(issue);
          } else if (rule.severity === 'WARNING') {
            warnings.push(issue);
          } else {
            info.push(issue);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info
    };
  }

  private static evaluateRule(rule: ValidationRule, parameters: Record<string, ParameterValue>): boolean {
    try {
      // Basic expression evaluator for expressions like "building_area > 0", "land_area >= building_area / num_floors"
      const building_area = Number(parameters['building_area']?.value || 0);
      const land_area = Number(parameters['land_area']?.value || 0);
      const num_floors = Number(parameters['num_floors']?.value || 1);

      if (rule.expression === 'building_area > 0') {
        return building_area > 0;
      }
      if (rule.expression.includes('land_area >= building_area / num_floors')) {
        return land_area >= (building_area / Math.max(1, num_floors));
      }
      return true;
    } catch {
      return true;
    }
  }
}

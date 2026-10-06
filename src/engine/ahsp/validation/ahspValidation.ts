/**
 * EZRAB AHSP DOMAIN — VALIDATION
 * Integrity checks for AHSP definitions and components.
 */

import { AHSPDefinition, AHSPComponentDefinition } from '../contracts/types';

export interface AHSPValidationIssue {
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface AHSPValidationResult {
  valid: boolean;
  issues: AHSPValidationIssue[];
}

export class AHSPValidationEngine {
  public static validateDefinition(definition: AHSPDefinition): AHSPValidationResult {
    const issues: AHSPValidationIssue[] = [];

    if (!definition.code || definition.code.trim() === '') {
      issues.push({ field: 'code', message: 'AHSP code is required', severity: 'ERROR' });
    }

    if (!definition.name || definition.name.trim() === '') {
      issues.push({ field: 'name', message: 'AHSP name is required', severity: 'ERROR' });
    }

    if (!definition.unit || definition.unit.trim() === '') {
      issues.push({ field: 'unit', message: 'AHSP unit is required', severity: 'ERROR' });
    }

    // Validate component arrays
    const allComponents: AHSPComponentDefinition[] = [
      ...(definition.laborComponents || []),
      ...(definition.materialComponents || []),
      ...(definition.equipmentComponents || []),
    ];

    if (allComponents.length === 0) {
      issues.push({ field: 'components', message: 'AHSP definition contains no labor, material, or equipment components', severity: 'WARNING' });
    }

    for (const c of allComponents) {
      if (c.coefficient === undefined || c.coefficient === null || isNaN(c.coefficient)) {
        issues.push({ field: `component.${c.itemCode || c.id}`, message: `Component "${c.itemName}" has invalid coefficient (NaN/null)`, severity: 'ERROR' });
      } else if (c.coefficient < 0) {
        issues.push({ field: `component.${c.itemCode || c.id}`, message: `Component "${c.itemName}" has negative coefficient: ${c.coefficient}`, severity: 'ERROR' });
      }

      if (!c.itemName && !c.itemCode) {
        issues.push({ field: `component.${c.id}`, message: 'Component missing both itemName and itemCode', severity: 'ERROR' });
      }
    }

    const hasErrors = issues.some((i) => i.severity === 'ERROR');

    return {
      valid: !hasErrors,
      issues,
    };
  }
}

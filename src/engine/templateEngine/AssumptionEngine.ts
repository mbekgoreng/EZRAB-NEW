import { AssumptionRule, ParameterValue } from './types';

export class AssumptionEngine {
  /**
   * Applies assumption rules for any missing or unverified parameters.
   */
  public static applyAssumptions(
    rules: AssumptionRule[] | undefined,
    currentParams: Record<string, ParameterValue>
  ): { updatedParams: Record<string, ParameterValue>; assumptionsMade: Record<string, ParameterValue> } {
    const updated = { ...currentParams };
    const assumptionsMade: Record<string, ParameterValue> = {};

    if (!rules || rules.length === 0) {
      return { updatedParams: updated, assumptionsMade };
    }

    for (const rule of rules) {
      const existing = updated[rule.parameterId];

      // Only apply assumption if parameter is missing, or if it came from template default rather than user input
      const shouldApply = !existing || existing.source === 'template' || existing.source === 'assumption';

      if (shouldApply) {
        // Check condition if present
        let conditionMet = true;
        if (rule.condition) {
          const condParam = updated[rule.condition.parameterId];
          const val = condParam ? condParam.value : undefined;

          switch (rule.condition.operator) {
            case '>':
              conditionMet = Number(val) > Number(rule.condition.value);
              break;
            case '>=':
              conditionMet = Number(val) >= Number(rule.condition.value);
              break;
            case '<':
              conditionMet = Number(val) < Number(rule.condition.value);
              break;
            case '<=':
              conditionMet = Number(val) <= Number(rule.condition.value);
              break;
            case '==':
              conditionMet = val === rule.condition.value;
              break;
            case '!=':
              conditionMet = val !== rule.condition.value;
              break;
            default:
              conditionMet = true;
          }
        }

        if (conditionMet) {
          let calculatedVal = rule.assumedValue;

          // If formula expression like "building_area * 1.4"
          if (typeof rule.assumedValue === 'string' && rule.assumedValue.includes('*')) {
            const parts = rule.assumedValue.split('*').map(p => p.trim());
            const baseParamName = parts[0];
            const multiplier = parseFloat(parts[1]);
            if (updated[baseParamName] && typeof updated[baseParamName].value === 'number') {
              calculatedVal = Math.round(updated[baseParamName].value * multiplier);
            }
          }

          const assumptionValue: ParameterValue = {
            value: calculatedVal,
            source: 'assumption',
            validationStatus: 'needs_verification', // Per requirement: assumptions flagged as needs_verification
            confidence: rule.confidence,
            reasoning: rule.reasoning + (rule.industryStandardReference ? ` (Ref: ${rule.industryStandardReference})` : '')
          };

          updated[rule.parameterId] = assumptionValue;
          assumptionsMade[rule.parameterId] = assumptionValue;
        }
      }
    }

    return { updatedParams: updated, assumptionsMade };
  }
}

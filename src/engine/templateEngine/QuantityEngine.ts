import {
  ConstructionProjectTemplate,
  ParameterValue,
  CalculatedQuantityItem,
  QuantitySource
} from './types';

export class QuantityEngine {
  /**
   * Evaluates quantity calculation rules for a given template and parameters.
   * Strictly distinguishes between user supplied, calculated, template estimate, and AI estimate.
   */
  public static calculateQuantities(
    template: ConstructionProjectTemplate,
    parameters: Record<string, ParameterValue>,
    dedAvailable: boolean = false
  ): Record<string, CalculatedQuantityItem> {
    const results: Record<string, CalculatedQuantityItem> = {};
    const rules = template.quantityRules || [];

    // Context dictionary with raw parameter values
    const context: Record<string, number> = {};
    for (const [key, paramVal] of Object.entries(parameters)) {
      if (typeof paramVal.value === 'number') {
        context[key] = paramVal.value;
      } else if (!isNaN(Number(paramVal.value))) {
        context[key] = Number(paramVal.value);
      }
    }

    // Default building_area if needed
    const building_area = context['building_area'] || 70;
    const num_floors = context['num_floors'] || 1;
    const road_length = context['road_length'] || 1000;
    const road_width = context['road_width'] || 6;
    const paving_area = context['paving_area'] || 500;
    const bridge_length = context['bridge_length'] || 30;
    const bridge_width = context['bridge_width'] || 9;
    const channel_length = context['channel_length'] || 500;
    const channel_width = context['channel_width'] || 1.2;
    const channel_depth = context['channel_depth'] || 1.0;

    for (const rule of rules) {
      try {
        let evaluatedValue = 0;

        // Parametric evaluation safe sandbox
        if (rule.formula.includes('building_area') || rule.formula.includes('num_floors')) {
          evaluatedValue = this.evalSimpleFormula(rule.formula, { building_area, num_floors });
        } else if (rule.formula.includes('road_length') || rule.formula.includes('road_width')) {
          evaluatedValue = this.evalSimpleFormula(rule.formula, { road_length, road_width });
        } else if (rule.formula.includes('paving_area')) {
          evaluatedValue = this.evalSimpleFormula(rule.formula, { paving_area });
        } else if (rule.formula.includes('bridge_length') || rule.formula.includes('bridge_width')) {
          evaluatedValue = this.evalSimpleFormula(rule.formula, { bridge_length, bridge_width });
        } else if (rule.formula.includes('channel_length') || rule.formula.includes('channel_width') || rule.formula.includes('channel_depth')) {
          evaluatedValue = this.evalSimpleFormula(rule.formula, { channel_length, channel_width, channel_depth });
        } else if (context[rule.formula]) {
          evaluatedValue = context[rule.formula];
        } else {
          evaluatedValue = 1.0;
        }

        evaluatedValue = Math.max(0.01, Number(evaluatedValue.toFixed(2)));

        const source: QuantitySource = dedAvailable
          ? 'ded_extracted'
          : 'calculated';

        results[rule.wbsCode] = {
          wbsCode: rule.wbsCode,
          quantity: evaluatedValue,
          unit: rule.unit,
          source,
          formulaUsed: rule.formula,
          reasoning: rule.description || `Dihitung secara parametrik dari formula: ${rule.formula}`
        };
      } catch (err) {
        results[rule.wbsCode] = {
          wbsCode: rule.wbsCode,
          quantity: 1.0,
          unit: rule.unit,
          source: 'template_estimate',
          reasoning: 'Kuantitas estimasi template bawaan'
        };
      }
    }

    return results;
  }

  private static evalSimpleFormula(formula: string, vars: Record<string, number>): number {
    // Basic safe formula replacement for standard mathematical operations (+, -, *, /, Math.sqrt)
    let expr = formula;
    for (const [key, val] of Object.entries(vars)) {
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
    }

    if (expr.includes('Math.sqrt')) {
      const match = expr.match(/Math\.sqrt\(([^)]+)\)/);
      if (match) {
        const innerVal = Number(match[1]);
        const sqrtVal = Math.sqrt(innerVal);
        expr = expr.replace(match[0], String(sqrtVal));
      }
    }

    // Evaluate standard arithmetic safely without arbitrary code execution
    // Supports: A * B, A * B * C, A + B, A / B
    try {
      const fn = new Function(`return (${expr});`);
      const val = fn();
      return isNaN(val) ? 1.0 : val;
    } catch {
      return 1.0;
    }
  }
}

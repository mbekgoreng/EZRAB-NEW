/**
 * EZRAB CALCULATOR CORE — LEGACY CALCULATOR ADAPTER
 * Bridges existing 19 ConstructionCalculatorSpec definitions into full Core CalculatorDefinition contracts
 * without altering any existing formulas.
 */

import { ConstructionCalculatorSpec, CalculatorParamDef } from '../../constructionCalculators/types';
import {
  CalculatorDefinition,
  CalculationContext,
  CalculationInput,
  CalculationOutput,
  ParameterValidationRule,
  CalculationBreakdownLine,
  FormulaProvenance,
} from '../contracts/types';
import { ProvenanceEngine } from '../provenance/provenanceEngine';
import { ValidationEngine } from '../validation/validationEngine';
import { ExecutionTraceBuilder } from '../trace/executionTrace';

export class LegacyCalculatorAdapter {
  /**
   * Adapt a legacy ConstructionCalculatorSpec into a Core CalculatorDefinition.
   */
  public static adapt(spec: ConstructionCalculatorSpec): CalculatorDefinition {
    // 1. Map parameters to validation rules
    const parameters: ParameterValidationRule[] = spec.parameters.map((p: CalculatorParamDef) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      unit: p.unit,
      required: p.defaultValue === undefined,
      defaultValue: p.defaultValue,
      min: p.min,
      max: p.max,
      step: p.step,
      category: p.category || 'dimensi',
      options: p.options,
    }));

    // 2. Create formula provenance
    const formulaSource: FormulaProvenance = ProvenanceEngine.createExcelProvenance({
      calculatorId: spec.id,
      calculatorVersion: spec.version || '1.0',
      formulaId: spec.codePrefix || spec.id,
      mathematicalExpression: `Excel Sheet: ${spec.excelSheetName || spec.id}`,
      sheet: spec.excelSheetName || spec.title,
      status: 'PARTIALLY_VERIFIED',
      notes: `Adapted from legacy engine spec ${spec.id}. Formula logic preserved verbatim from master workbook.`,
    });

    // 3. Construct CalculatorDefinition
    const definition: CalculatorDefinition = {
      id: spec.id,
      name: spec.title,
      shortName: spec.shortName,
      category: spec.category,
      pack: 'building',
      version: spec.version || '1.0',
      description: spec.description,
      primaryUnit: spec.primaryUnit,
      primaryQuantityLabel: spec.primaryQuantityLabel,
      parameters,
      formulaSource,
      dependencies: [],
      status: 'PARTIALLY_VERIFIED',
      diagramComponentKey: spec.diagramComponentKey,
      calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
        // Validate inputs
        const valSummary = ValidationEngine.validate(inputs, parameters);
        if (!valSummary.isValid) {
          const errList = valSummary.errors.map((e) => e.message).join('; ');
          throw new Error(`Input validation failed for ${spec.title}: ${errList}`);
        }

        // Convert sanitized inputs to Record<string, number> for legacy calculation execution
        const numericInputs: Record<string, number> = {};
        for (const p of spec.parameters) {
          const val = valSummary.sanitizedInputs[p.id];
          numericInputs[p.id] = typeof val === 'number' ? val : p.defaultValue;
        }

        // Execute original legacy formula (exact verbatim preservation)
        const legacyResult = spec.calculate(numericInputs);

        // Build execution trace
        const traceBuilder = new ExecutionTraceBuilder(spec.id, spec.version || '1.0')
          .setInputs(numericInputs);

        const detailedBreakdown: CalculationBreakdownLine[] = [];

        if (legacyResult.formulaSteps && legacyResult.formulaSteps.length > 0) {
          for (const step of legacyResult.formulaSteps) {
            traceBuilder.addStep({
              code: step.code,
              description: step.description,
              formulaText: step.formulaText,
              evaluatedExpression: step.formulaText,
              calculatedValue: step.calculatedValue,
              unit: step.unit,
            });

            detailedBreakdown.push({
              code: step.code,
              label: step.description,
              formulaText: step.formulaText,
              value: step.calculatedValue,
              unit: step.unit,
              ownership: 'produced',
            });
          }
        }

        traceBuilder.setPrimaryResult(
          legacyResult.primaryQuantity,
          legacyResult.primaryUnit,
          legacyResult.primaryLabel
        );

        const trace = traceBuilder.build();

        return {
          calculatorId: spec.id,
          version: spec.version || '1.0',
          primaryQuantity: legacyResult.primaryQuantity,
          primaryUnit: legacyResult.primaryUnit,
          primaryLabel: legacyResult.primaryLabel,
          breakdown: legacyResult.breakdown || {},
          detailedBreakdown,
          materials: (legacyResult.materials || []).map((m: { name: string; quantity: number; unit: string; coefficient?: number }) => ({
            name: m.name,
            quantity: m.quantity,
            unit: m.unit,
            coefficient: m.coefficient,
          })),
          labor: (legacyResult.labor || []).map((l: { role: string; hoursOrDays: number; unit: string; coefficient?: number }) => ({
            role: l.role,
            hoursOrDays: l.hoursOrDays,
            unit: l.unit,
            coefficient: l.coefficient,
          })),
          equipment: (legacyResult.equipment || []).map((e: { name: string; quantity: number; unit: string; coefficient?: number }) => ({
            name: e.name,
            quantity: e.quantity,
            unit: e.unit,
            coefficient: e.coefficient,
          })),
          warnings: valSummary.warnings,
          provenance: [formulaSource],
          trace,
          status: 'PARTIALLY_VERIFIED',
          validation: valSummary,
          timestamp: new Date().toISOString(),
        };
      },
    };

    return definition;
  }
}

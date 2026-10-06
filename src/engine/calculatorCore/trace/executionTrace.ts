/**
 * EZRAB CALCULATOR CORE — EXECUTION TRACE
 * Generates auditable, step-by-step calculation trace for UI and AI explanation.
 */

import { ExecutionTrace, ExecutionTraceStep } from '../contracts/types';

export class ExecutionTraceBuilder {
  private calculatorId: string;
  private version: string;
  private inputs: Record<string, unknown> = {};
  private steps: ExecutionTraceStep[] = [];
  private primaryQuantity = 0;
  private primaryUnit = '';
  private primaryLabel = '';
  private customNarrative?: string;

  constructor(calculatorId: string, version: string) {
    this.calculatorId = calculatorId;
    this.version = version;
  }

  public setInputs(inputs: Record<string, unknown>): this {
    this.inputs = { ...inputs };
    return this;
  }

  public addStep(step: {
    code: string;
    description: string;
    formulaText: string;
    evaluatedExpression: string;
    calculatedValue: number;
    unit: string;
  }): this {
    this.steps.push({
      stepNumber: this.steps.length + 1,
      ...step,
    });
    return this;
  }

  public setPrimaryResult(quantity: number, unit: string, label: string): this {
    this.primaryQuantity = quantity;
    this.primaryUnit = unit;
    this.primaryLabel = label;
    return this;
  }

  public setNarrative(narrative: string): this {
    this.customNarrative = narrative;
    return this;
  }

  public build(): ExecutionTrace {
    let narrative = this.customNarrative;
    if (!narrative) {
      const stepSummaries = this.steps
        .map((s) => `${s.stepNumber}. ${s.description}: ${s.formulaText} = ${s.calculatedValue} ${s.unit}`)
        .join('\n');
      narrative = `Kalkulasi "${this.primaryLabel}" menghasilkan ${this.primaryQuantity} ${this.primaryUnit} melalui ${this.steps.length} langkah matematis:\n${stepSummaries}`;
    }

    return {
      calculatorId: this.calculatorId,
      version: this.version,
      timestamp: new Date().toISOString(),
      inputs: this.inputs,
      formulaSteps: this.steps,
      primaryResult: {
        quantity: this.primaryQuantity,
        unit: this.primaryUnit,
        label: this.primaryLabel,
      },
      narrativeExplanation: narrative,
    };
  }
}

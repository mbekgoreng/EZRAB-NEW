/**
 * EZRAB CALCULATOR CORE — EXCEL PARITY RUNNER
 * Automated comparison between EZRAB Calculators, Excel Golden Vectors, and Independent Reference.
 */

import { GOLDEN_TEST_VECTORS, GoldenTestVector } from './goldenVectors';
import { IndependentReferenceEvaluator, ReferenceEvaluationResult } from './independentReferenceEvaluator';
import { CoreCalculatorRegistry } from '../registry/calculatorRegistry';
import { CalculationContext, ReadinessStatus } from '../contracts/types';
import { Decimal } from 'decimal.js';

export type ParityComparisonStatus =
  | 'EXACT_MATCH'
  | 'TOLERANCE_MATCH'
  | 'MISMATCH'
  | 'BLOCKED'
  | 'NOT_IN_REFERENCE_WORKBOOK';

export interface VectorParityResult {
  vectorId: string;
  calculatorId: string;
  legacyId: string;
  sheet: string;
  expectedValue: number;
  actualValue: number;
  referenceValue?: number;
  unit: string;
  delta: number;
  status: ParityComparisonStatus;
  readinessStatus: ReadinessStatus;
  notes?: string;
}

export interface CalculatorParitySummary {
  calculatorId: string;
  legacyId: string;
  sheet: string;
  totalVectors: number;
  exactPass: number;
  tolerancePass: number;
  mismatch: number;
  blocked: number;
  status: ReadinessStatus;
}

export interface ParityRunReport {
  timestamp: string;
  workbookHash: string;
  totalVectors: number;
  exactPassCount: number;
  tolerancePassCount: number;
  mismatchCount: number;
  blockedCount: number;
  overallStatus: ReadinessStatus;
  vectorResults: VectorParityResult[];
  calculatorSummaries: CalculatorParitySummary[];
}

export class ParityRunner {
  private static defaultTolerance = 0.01;

  public static runVector(vector: GoldenTestVector, tolerance = ParityRunner.defaultTolerance): VectorParityResult {
    const mockContext: CalculationContext = {
      projectId: 'PRJ-PARITY-TEST',
      workspaceId: 'WS-PARITY',
      precisionPolicy: 'DECIMAL_2',
    };

    try {
      // 1. Production Calculator Execution
      const actualOutput = CoreCalculatorRegistry.calculate(vector.legacyId, vector.inputs, mockContext);
      const actualValue = actualOutput.primaryQuantity;

      // 2. Independent Reference Evaluation
      const refEval = ParityRunner.evaluateReference(vector.legacyId, vector.inputs);
      const referenceValue = refEval?.primaryQuantity;

      // 3. Difference Calculation
      const delta = Math.abs(new Decimal(actualValue).minus(new Decimal(vector.expectedPrimaryQuantity)).toNumber());

      let status: ParityComparisonStatus = 'MISMATCH';
      let readinessStatus: ReadinessStatus = 'MISMATCH';

      if (delta === 0) {
        status = 'EXACT_MATCH';
        readinessStatus = 'PARTIALLY_VERIFIED';
      } else if (delta <= tolerance) {
        status = 'TOLERANCE_MATCH';
        readinessStatus = 'PARTIALLY_VERIFIED';
      } else {
        status = 'MISMATCH';
        readinessStatus = 'MISMATCH';
      }

      return {
        vectorId: vector.vectorId,
        calculatorId: vector.calculatorId,
        legacyId: vector.legacyId,
        sheet: vector.sheet,
        expectedValue: vector.expectedPrimaryQuantity,
        actualValue,
        referenceValue,
        unit: vector.primaryUnit,
        delta,
        status,
        readinessStatus,
        notes: vector.notes,
      };
    } catch (err: any) {
      return {
        vectorId: vector.vectorId,
        calculatorId: vector.calculatorId,
        legacyId: vector.legacyId,
        sheet: vector.sheet,
        expectedValue: vector.expectedPrimaryQuantity,
        actualValue: NaN,
        unit: vector.primaryUnit,
        delta: Infinity,
        status: 'BLOCKED',
        readinessStatus: 'BLOCKED',
        notes: `Execution error: ${err.message}`,
      };
    }
  }

  public static runAll(tolerance = ParityRunner.defaultTolerance): ParityRunReport {
    const vectorResults: VectorParityResult[] = [];
    const calcMap = new Map<string, CalculatorParitySummary>();

    for (const vector of GOLDEN_TEST_VECTORS) {
      const result = ParityRunner.runVector(vector, tolerance);
      vectorResults.push(result);

      let summary = calcMap.get(vector.legacyId);
      if (!summary) {
        summary = {
          calculatorId: vector.calculatorId,
          legacyId: vector.legacyId,
          sheet: vector.sheet,
          totalVectors: 0,
          exactPass: 0,
          tolerancePass: 0,
          mismatch: 0,
          blocked: 0,
          status: 'PARTIALLY_VERIFIED',
        };
        calcMap.set(vector.legacyId, summary);
      }

      summary.totalVectors++;
      if (result.status === 'EXACT_MATCH') summary.exactPass++;
      else if (result.status === 'TOLERANCE_MATCH') summary.tolerancePass++;
      else if (result.status === 'MISMATCH') summary.mismatch++;
      else if (result.status === 'BLOCKED') summary.blocked++;

      if (summary.mismatch > 0) summary.status = 'MISMATCH';
      else if (summary.blocked > 0) summary.status = 'BLOCKED';
    }

    const calculatorSummaries = Array.from(calcMap.values());
    const exactPassCount = vectorResults.filter((r) => r.status === 'EXACT_MATCH').length;
    const tolerancePassCount = vectorResults.filter((r) => r.status === 'TOLERANCE_MATCH').length;
    const mismatchCount = vectorResults.filter((r) => r.status === 'MISMATCH').length;
    const blockedCount = vectorResults.filter((r) => r.status === 'BLOCKED').length;

    let overallStatus: ReadinessStatus = 'PARTIALLY_VERIFIED';
    if (mismatchCount > 0) overallStatus = 'MISMATCH';
    else if (blockedCount > 0) overallStatus = 'BLOCKED';

    return {
      timestamp: new Date().toISOString(),
      workbookHash: GOLDEN_TEST_VECTORS[0]?.workbookHash || '',
      totalVectors: vectorResults.length,
      exactPassCount,
      tolerancePassCount,
      mismatchCount,
      blockedCount,
      overallStatus,
      vectorResults,
      calculatorSummaries,
    };
  }

  private static evaluateReference(legacyId: string, inputs: Record<string, number>): ReferenceEvaluationResult | undefined {
    switch (legacyId.toUpperCase()) {
      case 'BOWPLANK':
        return IndependentReferenceEvaluator.evaluateBowplank(inputs);
      case 'PONDASI':
      case 'PONDASI_BATU_KALI':
        return IndependentReferenceEvaluator.evaluatePondasi(inputs);
      case 'FOOT_PLATE':
        return IndependentReferenceEvaluator.evaluateFootPlate(inputs);
      case 'SLOOF':
        return IndependentReferenceEvaluator.evaluateSloof(inputs);
      case 'KOLOM':
        return IndependentReferenceEvaluator.evaluateKolom(inputs);
      case 'BALOK':
        return IndependentReferenceEvaluator.evaluateBalok(inputs);
      case 'BATA_RINGAN':
        return IndependentReferenceEvaluator.evaluateBataRingan(inputs);
      case 'BATA_MERAH':
        return IndependentReferenceEvaluator.evaluateBataMerah(inputs);
      case 'BATAKO':
        return IndependentReferenceEvaluator.evaluateBatako(inputs);
      case 'PINTU_JENDELA':
        return IndependentReferenceEvaluator.evaluatePintuJendela(inputs);
      case 'ATAP_BAJA_RINGAN':
        return IndependentReferenceEvaluator.evaluateAtapBajaRingan(inputs);
      case 'PLESTERAN_ACIAN':
        return IndependentReferenceEvaluator.evaluatePlesteranAcian(inputs);
      case 'PENUTUP_LANTAI':
        return IndependentReferenceEvaluator.evaluatePenutupLantai(inputs);
      case 'PENUTUP_DINDING':
        return IndependentReferenceEvaluator.evaluatePenutupDinding(inputs);
      case 'PLAFON':
        return IndependentReferenceEvaluator.evaluatePlafon(inputs);
      case 'PENGECATAN':
        return IndependentReferenceEvaluator.evaluatePengecatan(inputs);
      case 'KELISTRIKAN':
        return IndependentReferenceEvaluator.evaluateKelistrikan(inputs);
      case 'AIR_BERSIH':
      case 'INSTALASI_AIR':
        return IndependentReferenceEvaluator.evaluateInstalasiAir(inputs);
      case 'SANITAIR':
        return IndependentReferenceEvaluator.evaluateSanitair(inputs);
      default:
        return undefined;
    }
  }
}

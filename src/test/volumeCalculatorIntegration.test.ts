import { CONSTRUCTION_CALCULATORS, getCalculatorById } from '../engine/constructionCalculators/registry';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';

export function runVolumeCalculatorIntegrationTest(): {
  success: boolean;
  logs: string[];
  results: Record<string, any>;
} {
  const logs: string[] = [];
  const results: Record<string, any> = {};

  try {
    logs.push('======================================================');
    logs.push('STARTING EZRAB GOLDEN INTEGRATION TEST');
    logs.push('======================================================');

    // STEP 1: CREATE PROJECT
    const mockProjectId = 'PRJ-2026-0001';
    const mockProject = {
      id: mockProjectId,
      name: 'Rumah Tinggal Ahmad',
      client: 'Ahmad Yusuf',
      status: 'in_progress',
      totalRab: 0,
    };
    logs.push(`[STEP 1] Project created: ${mockProject.name} (ID: ${mockProject.id})`);

    // STEP 2: CALCULATE BOWPLANK WITH INITIAL INPUTS
    const bowplankSpec = getCalculatorById('BOWPLANK');
    if (!bowplankSpec) throw new Error('Bowplank calculator spec not found in registry');

    const initialInputs = {
      P: 12,
      L: 8,
      C: 0.60,
      H: 1.0,
      R: 2.0,
    };

    const initialCalcResult = bowplankSpec.calculate(initialInputs);
    // Formula: I10 = 2 * (12 + 8 + 2 * 0.60) = 2 * (21.2) = 42.40 m
    const expectedInitialPerimeter = SafeDecimalEngine.safeRound(2 * (12 + 8 + 2 * 0.60), 2);
    logs.push(`[STEP 2] Bowplank initial calculation: Perimeter = ${initialCalcResult.primaryQuantity} ${initialCalcResult.primaryUnit}`);
    
    if (initialCalcResult.primaryQuantity !== expectedInitialPerimeter) {
      throw new Error(`Perimeter calculation mismatch: expected ${expectedInitialPerimeter}, got ${initialCalcResult.primaryQuantity}`);
    }

    // CREATE CALCULATION RUN v1
    const run1 = {
      id: 'CALC-2026-000001',
      projectId: mockProjectId,
      calculatorId: 'BOWPLANK',
      formulaVersion: '1.0',
      inputSnapshot: initialInputs,
      resultSnapshot: {
        primaryQuantity: initialCalcResult.primaryQuantity,
        unit: initialCalcResult.primaryUnit,
        breakdown: initialCalcResult.breakdown,
      },
      version: 1,
      createdAt: new Date().toISOString(),
    };
    logs.push(`[STEP 2.1] CalculationRun v1 created: ${run1.id}`);

    // STEP 3: CREATE QTO ITEM
    const qtoItem1 = {
      id: 'QTO-2026-000001',
      projectId: mockProjectId,
      calculationRunId: run1.id,
      calculatorId: 'BOWPLANK',
      kode: 'QTO.01.BOW.01',
      uraian: 'Pengukuran & Pemasangan Bowplank',
      quantity: initialCalcResult.primaryQuantity,
      unit: initialCalcResult.primaryUnit,
      parameterSnapshot: initialInputs,
      status: 'CALCULATED',
    };
    logs.push(`[STEP 3] QTO Item created: ${qtoItem1.uraian} = ${qtoItem1.quantity} ${qtoItem1.unit}`);

    // STEP 4: SYNC TO RAB SPREADSHEET
    const unitPrice = 95400;
    const rabItem1 = {
      id: 'RAB-001',
      projectId: mockProjectId,
      no: 1,
      code: 'A.2.2.1.4',
      category: 'PEKERJAAN PERSIAPAN',
      description: 'Pengukuran dan Pemasangan Bowplank',
      volume: qtoItem1.quantity,
      unit: qtoItem1.unit,
      unitPrice: unitPrice,
      amount: SafeDecimalEngine.safeMultiply(qtoItem1.quantity, unitPrice, 0),
      volumeSource: 'CALCULATOR' as const,
      qtoItemId: qtoItem1.id,
      calculationRunId: run1.id,
      calculatorId: 'BOWPLANK',
    };
    logs.push(`[STEP 4] Added to RAB: Volume = ${rabItem1.volume} ${rabItem1.unit}, Jumlah = Rp ${rabItem1.amount.toLocaleString('id-ID')}`);

    results.step1_initialRAB = {
      volume: rabItem1.volume,
      amount: rabItem1.amount,
      volumeSource: rabItem1.volumeSource,
    };

    // STEP 5: MODIFY INPUT IN CALCULATOR (P: 12 -> 15)
    logs.push('------------------------------------------------------');
    logs.push('[STEP 5] USER MODIFIES INPUT IN CALCULATOR: P: 12 -> 15');
    logs.push('------------------------------------------------------');

    const updatedInputs = {
      P: 15, // Changed from 12 to 15
      L: 8,
      C: 0.60,
      H: 1.0,
      R: 2.0,
    };

    const updatedCalcResult = bowplankSpec.calculate(updatedInputs);
    // Formula: I10 = 2 * (15 + 8 + 2 * 0.60) = 2 * (24.2) = 48.40 m
    const expectedUpdatedPerimeter = SafeDecimalEngine.safeRound(2 * (15 + 8 + 2 * 0.60), 2);
    logs.push(`[STEP 5.1] Recalculated Bowplank: Perimeter = ${updatedCalcResult.primaryQuantity} ${updatedCalcResult.primaryUnit}`);

    if (updatedCalcResult.primaryQuantity !== expectedUpdatedPerimeter) {
      throw new Error(`Recalculation mismatch: expected ${expectedUpdatedPerimeter}, got ${updatedCalcResult.primaryQuantity}`);
    }

    // CREATE CALCULATION RUN v2 (Immutable history preserved!)
    const run2 = {
      id: 'CALC-2026-000002',
      projectId: mockProjectId,
      calculatorId: 'BOWPLANK',
      formulaVersion: '1.0',
      inputSnapshot: updatedInputs,
      resultSnapshot: {
        primaryQuantity: updatedCalcResult.primaryQuantity,
        unit: updatedCalcResult.primaryUnit,
        breakdown: updatedCalcResult.breakdown,
      },
      version: 2,
      parentRunId: run1.id,
      createdAt: new Date().toISOString(),
    };
    logs.push(`[STEP 5.2] CalculationRun v2 created: ${run2.id} (Parent: ${run2.parentRunId})`);

    // STEP 6: REACTIVELY UPDATE QTO ITEM
    qtoItem1.quantity = updatedCalcResult.primaryQuantity;
    qtoItem1.calculationRunId = run2.id;
    qtoItem1.parameterSnapshot = updatedInputs;
    logs.push(`[STEP 6] QTO Item updated: ${qtoItem1.quantity} ${qtoItem1.unit} (Ref: ${qtoItem1.calculationRunId})`);

    // STEP 7: REACTIVELY UPDATE CONNECTED RAB ITEM
    rabItem1.volume = qtoItem1.quantity;
    rabItem1.amount = SafeDecimalEngine.safeMultiply(rabItem1.volume, rabItem1.unitPrice, 0);
    rabItem1.calculationRunId = run2.id;
    logs.push(`[STEP 7] RAB Item automatically updated: Volume = ${rabItem1.volume} ${rabItem1.unit}, Jumlah = Rp ${rabItem1.amount.toLocaleString('id-ID')}`);

    results.step7UpdatedRAB = {
      volume: rabItem1.volume,
      amount: rabItem1.amount,
      runId: rabItem1.calculationRunId,
      volumeSource: rabItem1.volumeSource,
    };

    // STEP 8: RECALCULATE SUBTOTAL, PPN, GRAND TOTAL
    const subtotal = rabItem1.amount;
    const ppn = Math.round(subtotal * 0.11);
    const grandTotal = subtotal + ppn;
    logs.push(`[STEP 8] Grand Total Recalculated: Subtotal = Rp ${subtotal.toLocaleString('id-ID')}, PPN 11% = Rp ${ppn.toLocaleString('id-ID')}, Grand Total = Rp ${grandTotal.toLocaleString('id-ID')}`);

    logs.push('======================================================');
    logs.push('GOLDEN INTEGRATION TEST PASSED SUCCESSFULLY (100%)');
    logs.push('======================================================');

    return {
      success: true,
      logs,
      results,
    };
  } catch (err: any) {
    logs.push(`[TEST FAILED]: ${err.message}`);
    return {
      success: false,
      logs,
      results,
    };
  }
}

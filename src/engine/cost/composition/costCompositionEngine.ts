/**
 * EZRAB COST COMPOSITION DOMAIN — ENGINE
 * Deterministic cost decomposition calculating Labor, Material, and Equipment subtotals and Direct Cost.
 */

import Decimal from 'decimal.js';
import {
  CostCompositionInput,
  CostCompositionResult,
  CostComponentDetail,
  CostCategoryBreakdown,
  CostComponentType,
} from '../contracts/types';
import { AHSPComponentDefinition } from '../../ahsp/contracts/types';
import { PriceResolver } from '../../pricing/resolver/priceResolver';
import { PriceContext } from '../../pricing/contracts/types';
import { PriceProvenanceEngine } from '../../pricing/provenance/priceProvenance';
import { AHSPProvenanceEngine } from '../../ahsp/provenance/ahspProvenance';
import { UnitEngine } from '../../calculatorCore/unit/unitEngine';
import { PrecisionEngine } from '../../calculatorCore/precision/precisionEngine';
import { FormulaProvenance, ExecutionTraceStep } from '../../calculatorCore/contracts/types';

export class CostCompositionEngine {
  private priceResolver: PriceResolver;

  constructor(priceResolver: PriceResolver = new PriceResolver()) {
    this.priceResolver = priceResolver;
  }

  /**
   * Compose direct cost from an AHSP definition and physical quantity.
   */
  public compose(input: CostCompositionInput): CostCompositionResult {
    const traceSteps: ExecutionTraceStep[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const provenanceList: FormulaProvenance[] = [];
    let stepCounter = 1;

    // 1. Project Context Check (Fail closed)
    const projectId = input.priceContext?.projectId;
    if (!projectId || projectId.trim() === '') {
      return {
        status: 'PROJECT_INVALID',
        projectId: '',
        quantity: input.quantity,
        unit: input.quantityUnit,
        ahspCode: input.ahspDefinition?.code || '',
        ahspName: input.ahspDefinition?.name || '',
        labor: this.createEmptyCategory('labor'),
        material: this.createEmptyCategory('material'),
        equipment: this.createEmptyCategory('equipment'),
        unitCost: 0,
        directCost: 0,
        warnings,
        errors: ['PROJECT_CONTEXT_REQUIRED: Cannot perform cost composition without authoritative projectId.'],
        provenance: [],
        executionTrace: [],
      };
    }

    // 2. Input Validation
    if (input.quantity < 0 || isNaN(input.quantity) || !Number.isFinite(input.quantity)) {
      errors.push(`INVALID_QUANTITY: Quantity must be a non-negative finite number. Received: ${input.quantity}`);
    }

    if (!input.ahspDefinition) {
      errors.push('INVALID_AHSP: AHSP definition is required for cost composition.');
    }

    if (errors.length > 0) {
      return {
        status: 'INVALID_INPUT',
        projectId,
        quantity: input.quantity,
        unit: input.quantityUnit,
        ahspCode: input.ahspDefinition?.code || '',
        ahspName: input.ahspDefinition?.name || '',
        labor: this.createEmptyCategory('labor'),
        material: this.createEmptyCategory('material'),
        equipment: this.createEmptyCategory('equipment'),
        unitCost: 0,
        directCost: 0,
        warnings,
        errors,
        provenance: [],
        executionTrace: [],
      };
    }

    // 3. Unit Normalization & Compatibility Check
    const normQuantityUnit = UnitEngine.normalizeUnit(input.quantityUnit);
    const normAhspUnit = UnitEngine.normalizeUnit(input.ahspDefinition.unit);

    if (normQuantityUnit && normAhspUnit && normQuantityUnit !== normAhspUnit) {
      try {
        const isCompatible = UnitEngine.areCompatible(normQuantityUnit, normAhspUnit);
        if (!isCompatible) {
          warnings.push(`Unit mismatch between quantity (${normQuantityUnit}) and AHSP (${normAhspUnit}). Incompatible dimensions.`);
        }
      } catch {
        warnings.push(`Unit check inconclusive between ${normQuantityUnit} and ${normAhspUnit}.`);
      }
    }

    // Attach AHSP Provenance
    const ahspProv = AHSPProvenanceEngine.createProvenance(input.ahspDefinition);
    provenanceList.push(ahspProv);

    // 4. Compose Component Categories
    const baseQty = new Decimal(input.quantity);

    const laborBreakdown = this.processComponents(
      input.ahspDefinition.laborComponents || [],
      'labor',
      baseQty,
      input.priceContext,
      traceSteps,
      stepCounter,
      warnings,
      provenanceList
    );
    stepCounter += laborBreakdown.components.length;

    const materialBreakdown = this.processComponents(
      input.ahspDefinition.materialComponents || [],
      'material',
      baseQty,
      input.priceContext,
      traceSteps,
      stepCounter,
      warnings,
      provenanceList
    );
    stepCounter += materialBreakdown.components.length;

    const equipmentBreakdown = this.processComponents(
      input.ahspDefinition.equipmentComponents || [],
      'equipment',
      baseQty,
      input.priceContext,
      traceSteps,
      stepCounter,
      warnings,
      provenanceList
    );
    stepCounter += equipmentBreakdown.components.length;

    // 5. Aggregate Subtotals
    const unitCostDec = new Decimal(laborBreakdown.subtotalPerUnit)
      .plus(new Decimal(materialBreakdown.subtotalPerUnit))
      .plus(new Decimal(equipmentBreakdown.subtotalPerUnit));

    const directCostDec = new Decimal(laborBreakdown.totalSubtotal)
      .plus(new Decimal(materialBreakdown.totalSubtotal))
      .plus(new Decimal(equipmentBreakdown.totalSubtotal));

    const unitCost = PrecisionEngine.applyPolicy(unitCostDec.toNumber(), 'DECIMAL_2');
    const directCost = PrecisionEngine.applyPolicy(directCostDec.toNumber(), 'INTEGER_ROUND');

    traceSteps.push({
      stepNumber: stepCounter++,
      code: 'DIRECT_COST_AGGREGATED',
      description: 'Completed direct cost composition',
      formulaText: 'Labor + Material + Equipment',
      evaluatedExpression: `Rp ${laborBreakdown.totalSubtotal} + Rp ${materialBreakdown.totalSubtotal} + Rp ${equipmentBreakdown.totalSubtotal}`,
      calculatedValue: directCost,
      unit: 'IDR',
    });

    const hasMissingPrice = warnings.some((w) => w.includes('Price not found'));
    const status = hasMissingPrice ? 'PRICE_MISSING' : 'COMPLETE';

    return {
      status,
      projectId,
      quantity: input.quantity,
      unit: input.quantityUnit,
      ahspCode: input.ahspDefinition.code,
      ahspName: input.ahspDefinition.name,
      labor: laborBreakdown,
      material: materialBreakdown,
      equipment: equipmentBreakdown,
      unitCost,
      directCost,
      warnings,
      errors: [],
      provenance: provenanceList,
      executionTrace: traceSteps,
    };
  }

  private processComponents(
    components: AHSPComponentDefinition[],
    type: CostComponentType,
    baseQuantity: Decimal,
    context: PriceContext,
    traceSteps: ExecutionTraceStep[],
    startStepNumber: number,
    warnings: string[],
    provenanceList: FormulaProvenance[]
  ): CostCategoryBreakdown {
    const details: CostComponentDetail[] = [];
    let subtotalPerUnitDec = new Decimal(0);
    let totalSubtotalDec = new Decimal(0);
    let stepNum = startStepNumber;

    for (const c of components) {
      const coefDec = new Decimal(c.coefficient || 0);
      const totalQtyDec = coefDec.times(baseQuantity);

      // Price Resolution
      const priceRes = this.priceResolver.resolve(
        {
          code: c.itemCode,
          name: c.itemName,
          category: type === 'labor' ? 'LABOR' : type === 'material' ? 'MATERIAL' : 'EQUIPMENT',
          unit: c.unit,
        },
        context
      );

      let unitPrice = 0;
      let priceSource: string | undefined = undefined;
      let priceStatus: 'RESOLVED' | 'UNRESOLVED' | 'OVERRIDDEN' = 'UNRESOLVED';
      let prov: FormulaProvenance | undefined = undefined;

      if (priceRes.status === 'EXACT_MATCH' || priceRes.status === 'NORMALIZED_MATCH') {
        unitPrice = priceRes.resolvedPrice?.price || 0;
        priceSource = priceRes.resolvedPrice?.priceSource;
        priceStatus = priceRes.resolvedPrice?.location?.includes('Project') ? 'OVERRIDDEN' : 'RESOLVED';
        if (priceRes.resolvedPrice) {
          prov = PriceProvenanceEngine.createProvenance(priceRes.resolvedPrice);
          provenanceList.push(prov);
        }
      } else {
        warnings.push(`Price not found for ${type} component "${c.itemName}" (${c.itemCode || 'no code'}). Zero price assigned.`);
      }

      const upDec = new Decimal(unitPrice);
      const compSubtotalPerUnitDec = coefDec.times(upDec);
      const compTotalSubtotalDec = totalQtyDec.times(upDec);

      subtotalPerUnitDec = subtotalPerUnitDec.plus(compSubtotalPerUnitDec);
      totalSubtotalDec = totalSubtotalDec.plus(compTotalSubtotalDec);

      details.push({
        id: c.id,
        type,
        itemCode: c.itemCode,
        itemName: c.itemName,
        unit: c.unit,
        coefficient: c.coefficient,
        unitPrice,
        subtotalPerUnit: PrecisionEngine.applyPolicy(compSubtotalPerUnitDec.toNumber(), 'DECIMAL_2'),
        totalQuantity: PrecisionEngine.applyPolicy(totalQtyDec.toNumber(), 'DECIMAL_4'),
        totalSubtotal: PrecisionEngine.applyPolicy(compTotalSubtotalDec.toNumber(), 'DECIMAL_2'),
        priceSource,
        priceStatus,
        provenance: prov,
      });

      traceSteps.push({
        stepNumber: stepNum++,
        code: `${type.toUpperCase()}_COMPONENT`,
        description: `Evaluated ${type} component: ${c.itemName}`,
        formulaText: `${c.coefficient} × ${baseQuantity} × ${unitPrice}`,
        evaluatedExpression: `${totalQtyDec.toString()} ${c.unit} @ Rp ${unitPrice.toLocaleString('id-ID')}`,
        calculatedValue: compTotalSubtotalDec.toNumber(),
        unit: 'IDR',
      });
    }

    return {
      type,
      components: details,
      subtotalPerUnit: PrecisionEngine.applyPolicy(subtotalPerUnitDec.toNumber(), 'DECIMAL_2'),
      totalSubtotal: PrecisionEngine.applyPolicy(totalSubtotalDec.toNumber(), 'DECIMAL_2'),
    };
  }

  private createEmptyCategory(type: CostComponentType): CostCategoryBreakdown {
    return {
      type,
      components: [],
      subtotalPerUnit: 0,
      totalSubtotal: 0,
    };
  }
}

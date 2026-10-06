/**
 * EZRAB COST COMPOSITION DOMAIN — PROVENANCE
 */

import { CostCompositionResult } from '../contracts/types';
import { ProvenanceEngine } from '../../calculatorCore/provenance/provenanceEngine';
import { FormulaProvenance } from '../../calculatorCore/contracts/types';

export class CostProvenanceEngine {
  public static createCostProvenance(result: CostCompositionResult): FormulaProvenance {
    return ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: `cost.${result.ahspCode}`,
      calculatorVersion: '2026',
      formulaId: 'DIRECT_COST_COMPOSITION',
      mathematicalExpression: `Direct Cost = (Labor + Material + Equip) * Qty = (Rp ${result.labor.subtotalPerUnit} + Rp ${result.material.subtotalPerUnit} + Rp ${result.equipment.subtotalPerUnit}) * ${result.quantity} = Rp ${result.directCost}`,
      referenceName: 'EZRAB Cost Composition Engine',
      sectionOrClause: result.ahspCode,
      status: 'VERIFIED',
      notes: `Total Direct Cost: Rp ${result.directCost.toLocaleString('id-ID')} for ${result.quantity} ${result.unit}`,
    });
  }
}

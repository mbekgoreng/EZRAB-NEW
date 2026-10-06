/**
 * EZRAB PRICING DOMAIN — PROVENANCE
 */

import { PriceDefinition } from '../contracts/types';
import { ProvenanceEngine } from '../../calculatorCore/provenance/provenanceEngine';
import { FormulaProvenance } from '../../calculatorCore/contracts/types';

export class PriceProvenanceEngine {
  public static createProvenance(price: PriceDefinition): FormulaProvenance {
    return ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: `price.${price.codeNormalized || price.code}`,
      calculatorVersion: price.periodVersion || '2026-Q1',
      formulaId: 'UNIT_PRICE_LOOKUP',
      mathematicalExpression: `Price = Rp ${price.price.toLocaleString('id-ID')} / ${price.unit}`,
      referenceName: price.priceSource || 'HSD 2026',
      sectionOrClause: price.code,
      status: 'VERIFIED',
      notes: `Location: ${price.location}, Effective: ${price.effectiveDate}`,
    });
  }
}

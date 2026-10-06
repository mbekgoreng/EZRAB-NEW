/**
 * EZRAB AHSP DOMAIN — PROVENANCE
 * Attaches source document, legal regulation, version, and verification metadata to AHSP operations.
 */

import { AHSPDefinition } from '../contracts/types';
import { ProvenanceEngine } from '../../calculatorCore/provenance/provenanceEngine';
import { FormulaProvenance } from '../../calculatorCore/contracts/types';

export class AHSPProvenanceEngine {
  public static createProvenance(definition: AHSPDefinition): FormulaProvenance {
    return ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: `ahsp.${definition.codeNormalized || definition.code}`,
      calculatorVersion: definition.version || '2026',
      formulaId: 'AHSP_COEFFICIENT_COMPOSITION',
      mathematicalExpression: `Σ(labor: ${definition.totalLaborCoefficient}) + Σ(material: ${definition.totalMaterialCoefficient}) + Σ(equipment: ${definition.totalEquipmentCoefficient})`,
      referenceName: definition.sourceDocument || 'Permen PUPR No. 1/PRT/M/2022',
      sectionOrClause: definition.code,
      status: 'VERIFIED',
      notes: `Official AHSP ${definition.code} - ${definition.name}`,
    });
  }
}

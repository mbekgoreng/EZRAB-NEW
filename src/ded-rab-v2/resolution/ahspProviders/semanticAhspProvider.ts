/**
 * Priority 2: Semantic AHSP Provider
 * Matches work items against official AHSP database using semantic taxonomy and construction normalization.
 */

import { AhspProvider, AhspSearchInput, AhspCandidate } from '../providerContracts';
import { ahspMatcher } from '../../ahsp/ahspMatcher';
import { specificationValidator } from '../../../ded-rab-v3/validation/specificationValidator';

export class SemanticAhspProvider implements AhspProvider {
  public readonly name = 'SEMANTIC_AHSP';
  public readonly priority = 2;

  public async findAhsp(input: AhspSearchInput): Promise<AhspCandidate | null> {
    const { workItemName, category, specification, unit, companyCatalog } = input;

    const mockItem: any = {
      name: workItemName,
      category,
      materialSpec: specification,
      unit,
    };

    const match = ahspMatcher.matchWorkItem(mockItem, companyCatalog, { allowAiSynthesis: false });

    if (
      match &&
      match.matchType !== 'NOT_FOUND' &&
      match.matchType !== 'AI_CUSTOM' &&
      match.matchType !== 'AMBIGUOUS' &&
      match.code
    ) {
      // Validate specification compatibility to prevent bogus matches (e.g. Aluminium vs Kayu)
      const specValidation = specificationValidator.validate(
        workItemName,
        specification || workItemName,
        match.name,
        match.unit || unit
      );

      if (!specValidation.isCompatible && !specValidation.materialMatch) {
        return null; // Reject incompatible match
      }

      return {
        code: match.code,
        name: match.name,
        unit: match.unit || unit,
        source: match.source || 'PUPR 2026',
        matchType: 'SEMANTIC_MATCH',
        provenance: 'EZRAB_DATABASE',
        confidence: match.confidence || 0.90,
        confidenceRating: (match.confidence || 0.9) >= 0.9 ? 'HIGH' : 'MEDIUM',
        notes: `Pencocokan semantik AHSP resmi PUPR 2026: ${match.name}.`,
      };
    }

    return null;
  }
}

export const semanticAhspProvider = new SemanticAhspProvider();

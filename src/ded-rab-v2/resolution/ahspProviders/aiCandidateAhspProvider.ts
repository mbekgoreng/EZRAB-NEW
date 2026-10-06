/**
 * Priority 5 & 6: AI-Assisted Candidate & AI Estimated Work Item Provider
 * Synthesizes a practical work item specification when no official or reference AHSP exists:
 * - Assigns code 'AI-ESTIMATE' or 'AI-ASSISTED'
 * - Clear provenance: AI_ASSISTED or AI_ESTIMATED
 * - NEVER claims to be official master AHSP PUPR
 */

import { AhspProvider, AhspSearchInput, AhspCandidate } from '../providerContracts';
import { ahspMatcher } from '../../ahsp/ahspMatcher';

export class AiCandidateAhspProvider implements AhspProvider {
  public readonly name = 'AI_CANDIDATE_AHSP';
  public readonly priority = 5;

  public async findAhsp(input: AhspSearchInput): Promise<AhspCandidate | null> {
    const { workItemName, category, specification, unit } = input;

    const mockItem: any = {
      name: workItemName,
      category,
      materialSpec: specification,
      unit,
    };

    const synthesized = ahspMatcher.synthesizeIntelligentAhsp(mockItem);

    if (synthesized) {
      return {
        code: synthesized.code || 'AI-ESTIMATE',
        name: synthesized.name || workItemName,
        unit: synthesized.unit || unit,
        source: 'Spesifikasi Teknis Konstruksi AI',
        matchType: 'AI_ASSISTED',
        provenance: 'AI_ASSISTED',
        confidence: 0.78,
        confidenceRating: 'MEDIUM',
        notes: `Pekerjaan disusun berdasarkan spesifikasi DED: ${specification || workItemName}.`,
        coefficientSummary: synthesized.coefficientSummary,
      };
    }

    return {
      code: 'AI-ESTIMATE',
      name: workItemName,
      unit: unit || 'unit',
      source: 'Estimasi Mandiri AI',
      matchType: 'AI_ESTIMATED',
      provenance: 'AI_ESTIMATED',
      confidence: 0.70,
      confidenceRating: 'LOW',
      notes: 'Item diestimasi secara mandiri dengan spesifikasi teknik dari gambar DED.',
    };
  }
}

export const aiCandidateAhspProvider = new AiCandidateAhspProvider();

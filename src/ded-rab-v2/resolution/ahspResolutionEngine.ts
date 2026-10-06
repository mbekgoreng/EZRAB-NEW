/**
 * EZRAB — Central AHSP Resolution Engine
 *
 * Implements the 6-Tier AHSP Matching Hierarchy:
 * 1. Exact AHSP EZRAB (Exact code matching)
 * 2. Semantic AHSP EZRAB (Construction normalizer & semantic classification)
 * 3. Related AHSP EZRAB (Closest matching category in database)
 * 4. AHSP/Reference yang tersedia (National reference catalogue)
 * 5. AI-Assisted Candidate (Synthesized technical recipe from DED spec)
 * 6. AI Estimated Work Item (Stand-alone estimated item)
 */

import { AhspProvider, AhspSearchInput, AhspCandidate } from './providerContracts';
import { ezrabAhspProvider } from './ahspProviders/ezrabAhspProvider';
import { semanticAhspProvider } from './ahspProviders/semanticAhspProvider';
import { referenceAhspProvider } from './ahspProviders/referenceAhspProvider';
import { aiCandidateAhspProvider } from './ahspProviders/aiCandidateAhspProvider';

export class AhspResolutionEngine {
  private static instance: AhspResolutionEngine;
  private providers: AhspProvider[];

  private constructor() {
    this.providers = [
      ezrabAhspProvider,
      semanticAhspProvider,
      referenceAhspProvider,
      aiCandidateAhspProvider,
    ].sort((a, b) => a.priority - b.priority);
  }

  public static getInstance(): AhspResolutionEngine {
    if (!AhspResolutionEngine.instance) {
      AhspResolutionEngine.instance = new AhspResolutionEngine();
    }
    return AhspResolutionEngine.instance;
  }

  public async resolveAhsp(input: AhspSearchInput): Promise<AhspCandidate> {
    for (const provider of this.providers) {
      try {
        const candidate = await provider.findAhsp(input);
        if (candidate) {
          return candidate;
        }
      } catch (err) {
        console.warn(`[AhspResolutionEngine] Provider ${provider.name} failed:`, err);
      }
    }

    return {
      code: 'AI-ESTIMATE',
      name: input.workItemName,
      unit: input.unit || 'unit',
      source: 'AI Autonomous Synthesis',
      matchType: 'AI_ESTIMATED',
      provenance: 'AI_ESTIMATED',
      confidence: 0.70,
      confidenceRating: 'LOW',
      notes: 'Pekerjaan disintesis secara mandiri oleh AI Estimator.',
    };
  }
}

export const ahspResolutionEngine = AhspResolutionEngine.getInstance();

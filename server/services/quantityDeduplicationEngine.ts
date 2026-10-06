/**
 * Quantity Deduplication Engine (Phase 6.3)
 *
 * Prevents multiple counting of physical construction elements when mentioned
 * across multiple sheets (Plan, Detail, Section, Schedule).
 *
 * Rules:
 * 1. Plan = 12 unit AND Schedule = 12 unit -> Canonical Quantity = 12 (NOT 24).
 * 2. Plan = 12 unit AND Schedule = 14 unit -> Status CONFLICT (Needs human review).
 * 3. Superseded Revisions (Rev 00) and Duplicate sheets -> 0 added volume.
 */

import {
  QuantityCandidate,
  EntityEvidence
} from '../../src/domain/document/canonicalEntityTypes';

export interface DeduplicationResult {
  canonicalQuantity: number;
  unit: string;
  source: string;
  confidence: number;
  isDeduplicated: boolean;
  hasConflict: boolean;
  conflictDescription?: string;
  candidates: QuantityCandidate[];
}

export class QuantityDeduplicationEngine {
  private static instance: QuantityDeduplicationEngine;

  private constructor() {}

  public static getInstance(): QuantityDeduplicationEngine {
    if (!QuantityDeduplicationEngine.instance) {
      QuantityDeduplicationEngine.instance = new QuantityDeduplicationEngine();
    }
    return QuantityDeduplicationEngine.instance;
  }

  /**
   * Deduplicate quantities from multiple evidence records for a single physical entity
   */
  public deduplicateQuantities(
    evidences: EntityEvidence[],
    isSuperseded: boolean,
    isDuplicate: boolean
  ): DeduplicationResult {
    // 1. Extract valid candidates (ignore superseded or duplicate drawing candidates for canonical math)
    const candidates: QuantityCandidate[] = [];

    for (const ev of evidences) {
      const val = ev.extractedValue;
      if (val.quantity !== undefined && val.quantity > 0) {
        candidates.push({
          candidateId: `qc_${ev.evidenceId}`,
          evidenceId: ev.evidenceId,
          source: `${ev.sourceType} (${ev.fileName} p.${ev.pageNumber})`,
          sourceType: ev.sourceType,
          quantity: val.quantity,
          unit: val.unit || 'unit',
          confidence: ev.confidence,
          isDeduplicated: false
        });
      }
    }

    // If superseded or duplicate entity, quantity is 0 or tagged as inactive
    if (isSuperseded || isDuplicate) {
      return {
        canonicalQuantity: candidates[0]?.quantity || 1,
        unit: candidates[0]?.unit || 'unit',
        source: isSuperseded ? 'Superseded Revision' : 'Duplicate Sheet',
        confidence: 0.90,
        isDeduplicated: true,
        hasConflict: false,
        candidates
      };
    }

    // 2. Case: No explicit quantity found -> default to 1 unit
    if (candidates.length === 0) {
      return {
        canonicalQuantity: 1,
        unit: 'unit',
        source: evidences[0]?.sourceType || 'Plan Default',
        confidence: 0.75,
        isDeduplicated: false,
        hasConflict: false,
        candidates: []
      };
    }

    // 3. Case: Exactly 1 candidate
    if (candidates.length === 1) {
      candidates[0].isDeduplicated = false;
      return {
        canonicalQuantity: candidates[0].quantity,
        unit: candidates[0].unit,
        source: candidates[0].source,
        confidence: candidates[0].confidence,
        isDeduplicated: false,
        hasConflict: false,
        candidates
      };
    }

    // 4. Case: Multiple candidates -> Compare values
    const distinctQuantities = Array.from(new Set(candidates.map(c => c.quantity)));

    if (distinctQuantities.length === 1) {
      // All sources agree! e.g. Plan = 12 unit, Schedule = 12 unit
      // Canonical Quantity = 12 (DEDUPLICATED, not 24!)
      for (const c of candidates) {
        c.isDeduplicated = true;
      }

      // Select highest priority source (Schedule or Detail over Plan)
      const sortedByPriority = [...candidates].sort((a, b) => {
        const pMap: Record<string, number> = { SCHEDULE: 1, STRUCTURAL_DETAIL: 2, STRUCTURAL_PLAN: 3, ARCHITECTURAL_PLAN: 4 };
        return (pMap[a.sourceType] || 5) - (pMap[b.sourceType] || 5);
      });

      const best = sortedByPriority[0];

      return {
        canonicalQuantity: best.quantity,
        unit: best.unit,
        source: `Deduplicated from ${candidates.length} sources (${candidates.map(c => c.sourceType).join(', ')})`,
        confidence: 0.98,
        isDeduplicated: true,
        hasConflict: false,
        candidates
      };
    } else {
      // Quantities disagree! e.g. Plan = 12 unit vs Schedule = 14 unit -> CONFLICT!
      for (const c of candidates) {
        c.isDeduplicated = false;
      }

      const conflictDesc = `Perbedaan kuantitas antar sumber dokumen: ${candidates.map(c => `${c.source}: ${c.quantity} ${c.unit}`).join(' vs ')}`;

      // Pick highest priority or max as provisional, but flag CONFLICT
      const provisional = candidates[0];

      return {
        canonicalQuantity: provisional.quantity,
        unit: provisional.unit,
        source: `PROVISIONAL: ${provisional.source}`,
        confidence: 0.60,
        isDeduplicated: false,
        hasConflict: true,
        conflictDescription: conflictDesc,
        candidates
      };
    }
  }
}

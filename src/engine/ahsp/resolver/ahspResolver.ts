/**
 * EZRAB AHSP DOMAIN — RESOLVER
 * Deterministic resolution pipeline for AHSP items with multi-tier matching and ambiguity reporting.
 */

import {
  AHSPDefinition,
  AHSPQuery,
  AHSPResolutionResult,
  AHSPResolutionCandidate,
} from '../contracts/types';
import { AHSPNormalizationEngine } from '../normalization/ahspNormalization';
import { AHSPRepository } from '../repository/ahspRepository';

export class AHSPResolver {
  private repository: AHSPRepository;

  constructor(repository: AHSPRepository = AHSPRepository.getInstance()) {
    this.repository = repository;
  }

  /**
   * Resolve an AHSP query deterministically.
   * Priority:
   * 1. Exact normalized code match
   * 2. Exact normalized name match
   * 3. Controlled alias match
   * 4. Structured category/keyword search (if unique or ambiguous)
   */
  public resolve(query: AHSPQuery | string, projectId?: string): AHSPResolutionResult {
    const qObj: AHSPQuery = typeof query === 'string' ? { code: query, name: query } : query;
    const rawQueryStr = qObj.code || qObj.name || '';

    if (!rawQueryStr.trim()) {
      return {
        status: 'AHSP_NOT_CONFIGURED',
        query: rawQueryStr,
        error: 'Empty AHSP query provided.',
      };
    }

    // 1. Exact code match
    if (qObj.code) {
      const normCode = AHSPNormalizationEngine.normalizeCode(qObj.code);
      const exactMatch = this.repository.getByCode(normCode, projectId);
      if (exactMatch) {
        return {
          status: 'EXACT_MATCH',
          query: rawQueryStr,
          resolvedAHSP: exactMatch,
        };
      }
    }

    // 2. Exact normalized name match or alias match
    const allDefs = this.repository.getAllMasterDefinitions();
    const normalizedNameQuery = AHSPNormalizationEngine.normalizeText(qObj.name || qObj.code || '');

    if (!normalizedNameQuery) {
      return {
        status: 'AHSP_NOT_FOUND',
        query: rawQueryStr,
        error: `AHSP with code "${qObj.code}" not found.`,
      };
    }

    const exactNameMatches: AHSPDefinition[] = [];
    const aliasMatches: AHSPDefinition[] = [];
    const partialCandidates: AHSPResolutionCandidate[] = [];

    for (const def of allDefs) {
      // Domain filter check
      if (qObj.domain && def.domain !== qObj.domain) continue;
      // Version filter check
      if (qObj.version && def.version !== qObj.version) continue;

      const normDefName = AHSPNormalizationEngine.normalizeText(def.name);

      // Check exact name
      if (normDefName === normalizedNameQuery) {
        exactNameMatches.push(def);
        continue;
      }

      // Check aliases
      if (def.aliases && def.aliases.some((a) => AHSPNormalizationEngine.normalizeText(a) === normalizedNameQuery)) {
        aliasMatches.push(def);
        continue;
      }

      // Score partial matches
      let score = 0;
      let reason = '';

      if (normDefName.includes(normalizedNameQuery)) {
        score = 80;
        reason = 'Name substring match';
      } else {
        const queryWords = normalizedNameQuery.split(' ').filter((w) => w.length > 2);
        const matchCount = queryWords.filter((w) => normDefName.includes(w)).length;
        if (queryWords.length > 0 && matchCount >= Math.ceil(queryWords.length * 0.6)) {
          score = 50 + (matchCount / queryWords.length) * 30;
          reason = `Matched ${matchCount}/${queryWords.length} keyword terms`;
        }
      }

      if (score >= 50) {
        partialCandidates.push({
          ahsp: def,
          matchScore: score,
          matchReason: reason,
        });
      }
    }

    // Evaluate exact name matches
    if (exactNameMatches.length === 1) {
      return {
        status: 'NORMALIZED_MATCH',
        query: rawQueryStr,
        resolvedAHSP: exactNameMatches[0],
      };
    }
    if (exactNameMatches.length > 1) {
      return {
        status: 'AMBIGUOUS_AHSP',
        query: rawQueryStr,
        candidates: exactNameMatches.map((d) => ({
          ahsp: d,
          matchScore: 100,
          matchReason: 'Identical normalized name across multiple versions/domains',
        })),
        warnings: ['Multiple AHSP items share this exact name. Explicit selection required.'],
      };
    }

    // Evaluate alias matches
    if (aliasMatches.length === 1) {
      return {
        status: 'ALIAS_MATCH',
        query: rawQueryStr,
        resolvedAHSP: aliasMatches[0],
      };
    }
    if (aliasMatches.length > 1) {
      return {
        status: 'AMBIGUOUS_AHSP',
        query: rawQueryStr,
        candidates: aliasMatches.map((d) => ({
          ahsp: d,
          matchScore: 90,
          matchReason: 'Alias match',
        })),
        warnings: ['Multiple AHSP items share this alias.'],
      };
    }

    // Evaluate partial candidates
    if (partialCandidates.length === 1 && partialCandidates[0].matchScore >= 75) {
      return {
        status: 'NORMALIZED_MATCH',
        query: rawQueryStr,
        resolvedAHSP: partialCandidates[0].ahsp,
      };
    }

    if (partialCandidates.length > 0) {
      partialCandidates.sort((a, b) => b.matchScore - a.matchScore);
      return {
        status: 'AMBIGUOUS_AHSP',
        query: rawQueryStr,
        candidates: partialCandidates.slice(0, 10),
        warnings: [`Found ${partialCandidates.length} potential matches for query "${rawQueryStr}". Explicit selection required.`],
      };
    }

    return {
      status: 'AHSP_NOT_FOUND',
      query: rawQueryStr,
      error: `No AHSP item found matching query "${rawQueryStr}".`,
    };
  }
}

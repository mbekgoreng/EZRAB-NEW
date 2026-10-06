/**
 * EZRAB AHSP Matching & Pricing Engine (Section 11, 12, 13, 14 & 24)
 *
 * Implements strict AHSP matching and price resolution:
 * 1. Authority Hierarchy: Official AHSP -> Project AHSP -> Company AHSP -> Reference -> AI_CUSTOM.
 * 2. Match Types: EXACT, SEMANTIC, NOT_FOUND, AI_CUSTOM.
 * 3. Never invent AHSP codes or prices.
 * 4. Missing price fallback: PRICE_NOT_FOUND.
 * 5. Unmatched items become AI_CUSTOM with clear human review warning.
 */

import {
  DEDWorkItem,
  AHSPMappingCandidate,
  PriceSourceResolution,
  AICustomItem,
  AHSPSourceType,
  AHSPMatchClassification,
  ValueSourceType,
} from '../domain/ded/dedPipelineTypes';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/officialAhspRepository';

export interface AhspMatchingInput {
  workItem: DEDWorkItem;
  companyAhspItems?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>;
  projectAhspItems?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>;
}

export interface AhspMatchingResult {
  matchStatus: AHSPMatchClassification | 'AI_CUSTOM';
  ahspCode?: string;
  ahspName?: string;
  unit?: string;
  sourceType: AHSPSourceType;
  priceResolution: PriceSourceResolution;
  isCustomItem: boolean;
  customItemDetails?: AICustomItem;
  candidates: AHSPMappingCandidate[];
  reason: string;
}

export class DedAhspMatchingEngine {
  private static instance: DedAhspMatchingEngine;

  private constructor() {}

  public static getInstance(): DedAhspMatchingEngine {
    if (!DedAhspMatchingEngine.instance) {
      DedAhspMatchingEngine.instance = new DedAhspMatchingEngine();
    }
    return DedAhspMatchingEngine.instance;
  }

  /**
   * Normalizes work item names and search queries
   */
  public normalizeSearch(text: string): string {
    return text
      .toLowerCase()
      .replace(/pekerjaan|pemasangan|pengadaan|pasangan|pembuatan|cor/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Matches a DEDWorkItem against configured AHSP datasets
   */
  public matchAhsp(input: AhspMatchingInput): AhspMatchingResult {
    const item = input.workItem;
    const query = this.normalizeSearch(item.name);
    const spec = item.specification ? item.specification.toLowerCase() : '';

    const candidates: AHSPMappingCandidate[] = [];

    // 1. Search in Project AHSP
    if (input.projectAhspItems) {
      for (const p of input.projectAhspItems) {
        const norm = this.normalizeSearch(p.name);
        if (norm && (query.includes(norm) || norm.includes(query))) {
          candidates.push({
            ahspCode: p.code,
            name: p.name,
            unit: p.unit,
            baseUnitPrice: p.unitPrice,
            matchScore: 0.95,
            reason: 'Cocok dengan katalog AHSP Proyek',
            specificationMatch: true,
            isRecommended: true,
            matchClassification: 'EXACT_MATCH',
            sourceType: 'PROJECT_AHSP',
          });
        }
      }
    }

    // 2. Search in Company AHSP
    if (input.companyAhspItems && candidates.length === 0) {
      for (const c of input.companyAhspItems) {
        const norm = this.normalizeSearch(c.name);
        if (norm && (query.includes(norm) || norm.includes(query))) {
          candidates.push({
            ahspCode: c.code,
            name: c.name,
            unit: c.unit,
            baseUnitPrice: c.unitPrice,
            matchScore: 0.90,
            reason: 'Cocok dengan database AHSP Perusahaan',
            specificationMatch: true,
            isRecommended: true,
            matchClassification: 'EXACT_MATCH',
            sourceType: 'COMPANY_AHSP',
          });
        }
      }
    }

    // 3. Search the OFFICIAL AHSP registry — ONE source of truth (§2/§4/§14).
    //    Previously this concatenated getAHSPDatabase() (legacy view) with the official
    //    array, so a legacy-only code could be surfaced as an official candidate. Candidates
    //    now come exclusively from ALL_OFFICIAL_AHSP_ITEMS.
    if (candidates.length === 0) {
      const allOfficial = [...(officialAhspRepository.getAllOfficialAhsp() || [])];
      const queryWords = query.split(' ').filter((w) => w.length > 2);

      for (const off of allOfficial) {
        const itemText = `${off.code} ${(off as any).title || off.name}`.toLowerCase();
        let matchScore = 0;
        let matchedCount = 0;

        for (const w of queryWords) {
          if (itemText.includes(w)) {
            matchedCount++;
          }
        }

        if (queryWords.length > 0 && matchedCount > 0) {
          matchScore = (matchedCount / queryWords.length) * 60;
        }

        const specMatch = spec ? itemText.includes(spec) : false;
        if (specMatch) {
          matchScore += 40;
        }

        if (matchScore >= 40) {
          candidates.push({
            ahspCode: off.code,
            name: off.name,
            unit: off.unit,
            baseUnitPrice: (off as any).unitPrice || (off as any).price || 0,
            matchScore: Math.round(matchScore),
            reason: specMatch
              ? `Spesifikasi '${spec}' cocok dengan standar resmi AHSP.`
              : `Kesesuaian deskripsi (${Math.round(matchScore)}% kemiripan).`,
            specificationMatch: specMatch,
            isRecommended: matchScore >= 70,
            matchClassification: matchScore >= 70 ? 'EXACT_MATCH' : 'SEMANTIC_MATCH',
            sourceType: 'OFFICIAL_AHSP',
          });
        }
      }
    }

    // 4. If matching candidates found
    if (candidates.length > 0) {
      // Sort by score & specification match
      candidates.sort((a, b) => b.matchScore - a.matchScore);
      const topMatch = candidates[0];

      const priceResolution: PriceSourceResolution = {
        unitPrice: topMatch.baseUnitPrice && topMatch.baseUnitPrice > 0 ? topMatch.baseUnitPrice : undefined,
        priceSource: topMatch.baseUnitPrice && topMatch.baseUnitPrice > 0
          ? (topMatch.sourceType === 'PROJECT_AHSP' ? 'PROJECT_PRICE' : 'CONFIGURED_PRICE_DB')
          : 'PRICE_NOT_FOUND',
        sourceDetail: `Katalog ${topMatch.sourceType} [${topMatch.ahspCode}]`,
        currency: 'IDR',
        isOfficial: topMatch.sourceType === 'OFFICIAL_AHSP',
        valueSourceType: topMatch.sourceType as any,
      };

      return {
        matchStatus: topMatch.matchClassification || 'SEMANTIC_MATCH',
        ahspCode: topMatch.ahspCode,
        ahspName: topMatch.name,
        unit: topMatch.unit,
        sourceType: topMatch.sourceType || 'OFFICIAL_AHSP',
        priceResolution,
        isCustomItem: false,
        candidates,
        reason: topMatch.reason,
      };
    }

    // 5. Fallback to AI_CUSTOM (Section 13)
    const customCode = `CUST-${Date.now().toString().slice(-4)}`;
    const customItemDetails: AICustomItem = {
      code: customCode,
      name: item.name,
      unit: item.unit || 'ls',
      reason: 'Item pekerjaan teridentifikasi pada DED namun tidak ditemukan padanan resmi di AHSP.',
      sourceEvidence: item.evidence || [],
      generatedBy: 'AI',
      requiresUserConfirmation: true,
      baseUnitPrice: undefined,
    };

    return {
      matchStatus: 'AI_CUSTOM',
      ahspCode: customCode,
      ahspName: `[CUSTOM / NOT FOUND IN AHSP] ${item.name}`,
      unit: item.unit || 'ls',
      sourceType: 'AI_CUSTOM',
      priceResolution: {
        unitPrice: undefined,
        priceSource: 'PRICE_NOT_FOUND',
        sourceDetail: 'CUSTOM / NOT FOUND IN AHSP',
        currency: 'IDR',
        isOfficial: false,
        valueSourceType: 'AI_ESTIMATE',
      },
      isCustomItem: true,
      customItemDetails,
      candidates: [],
      reason: 'Tidak ditemukan di AHSP resmi. Memerlukan tinjauan manual (Review Required).',
    };
  }
}

export const dedAhspMatchingEngine = DedAhspMatchingEngine.getInstance();

/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * AI Resolution Engine: Multi-Tier Deep Investigation for Unresolved Items
 *
 * Mandatory Engine: Section 10
 * If first-pass pipeline fails to resolve AHSP, specification, quantity, dimension,
 * or price source, AI Resolution executes a multi-step recovery loop:
 * 1. Re-read / search related candidate DED sheets
 * 2. Cross-reference drawing details & schedules
 * 3. Re-match semantic AHSP candidates with relaxed queries & specification validation
 * 4. Perform deterministic recalculation
 * 5. Re-run unit and engineering validation
 * 6. Set provenance to 'AI_ASSISTED' or 'NEEDS_REVIEW' (NEVER blindly fake)
 */

import {
  DedContextMemory,
  FullAiWorkItem,
} from '../types';
import { dedMissingInformationLoop } from '../reasoning/dedMissingInformationLoop';
import { dedQuantityReasoningEngine } from '../reasoning/dedQuantityReasoningEngine';
import { dedAhspReasoningEngine } from '../ahsp/dedAhspReasoningEngine';
import { dedPriceResolutionEngine } from '../pricing/dedPriceResolutionEngine';
import { DocumentSynthesisSummary } from '../reading/dedDocumentSynthesizer';
import { specificationValidator } from '../validation/specificationValidator';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';

export interface AiResolutionReport {
  totalItemsInvestigated: number;
  successfullyResolved: number;
  stillUnresolved: number;
  resolutionDetails: Array<{
    itemId: string;
    itemName: string;
    originalStatus: string;
    resolvedStatus: string;
    resolutionAction: string;
    evidenceNotes?: string;
  }>;
}

export class DedAiResolutionEngine {
  private static instance: DedAiResolutionEngine;

  private constructor() {}

  public static getInstance(): DedAiResolutionEngine {
    if (!DedAiResolutionEngine.instance) {
      DedAiResolutionEngine.instance = new DedAiResolutionEngine();
    }
    return DedAiResolutionEngine.instance;
  }

  /**
   * Executes AI Resolution loop on all non-READY items before final self-review.
   */
  public async resolveUnresolvedItems(
    items: FullAiWorkItem[],
    context: DedContextMemory,
    synthesis: DocumentSynthesisSummary,
    projectId?: string,
    region: string = 'DKI Jakarta / Nasional'
  ): Promise<AiResolutionReport> {
    const unresolvedItems = items.filter(i => i.status !== 'READY');
    const resolutionDetails: AiResolutionReport['resolutionDetails'] = [];
    let successfullyResolved = 0;

    for (const item of unresolvedItems) {
      const origStatus = item.status;
      let actionTaken = '';
      let evidenceNote = '';

      // TIER 1: RESOLVE MISSING QUANTITY / DIMENSIONS
      if (item.status === 'MISSING_QUANTITY' || item.quantity === null) {
        actionTaken = 'Menyisir lembar DED terkait untuk menemukan parameter dimensi...';
        const missingRes = await dedMissingInformationLoop.resolveMissingInformation(item, context);

        if (missingRes.found && missingRes.discoveredDimensions) {
          // Deterministic recalculation with newly discovered parameters
          dedQuantityReasoningEngine.resolveQuantities([item], context, synthesis);

          if (item.quantity !== null && item.quantity > 0) {
            actionTaken += ' Dimensi ditemukan, kuantitas dihitung ulang deterministik.';
            evidenceNote = missingRes.discoveredEvidence || 'Dimensi ditemukan pada lembar detail DED.';
            item.provenance = {
              quantitySource: 'DETERMINISTIC_ENGINE',
              ahspSource: item.ahsp ? 'DATABASE' : 'NEEDS_REVIEW',
              priceSource: item.price ? 'DATABASE' : 'NEEDS_REVIEW',
              overallStatus: 'AI_ASSISTED',
            };
          }
        }
      }

      // TIER 2: RESOLVE UNMATCHED AHSP
      if (!item.ahsp || item.status === 'AHSP_UNRESOLVED') {
        actionTaken += ' Mencari kandidat AHSP alternatif dengan evaluasi spesifikasi mendalam...';
        // Try fallback search queries
        const broadQueries = this.buildBroadQueries(item);
        for (const q of broadQueries) {
          const candidates = officialAhspRepository.searchOfficialAhsp(q, { limit: 10 });
          for (const cand of candidates) {
            const ahspItem = cand.item;
            const specCheck = specificationValidator.validate(item.name, item.specification, ahspItem.name, ahspItem.unit);
            if (specCheck.isCompatible) {
              item.ahsp = {
                code: ahspItem.code,
                name: ahspItem.name,
                unit: ahspItem.unit,
                source: 'CIPTA_KARYA_2026',
                category: ahspItem.category,
                domain: ahspItem.domain,
                confidence: 'MEDIUM',
                compatibilitySummary: `AI Resolution mencocokkan spesifikasi resmi (${ahspItem.code} - ${ahspItem.name})`,
                candidatesEvaluated: [],
              };
              item.ahspConfidence = 'MEDIUM';
              actionTaken += ` AHSP cocok ditemukan: ${ahspItem.code}.`;
              break;
            }
          }
          if (item.ahsp) break;
        }
      }

      // TIER 3: RESOLVE PRICE
      if (item.ahsp && (!item.price || item.price.unitPrice <= 0 || item.status === 'PRICE_UNRESOLVED')) {
        dedPriceResolutionEngine.resolvePrices([item], context, projectId, region);
        if (item.price && item.price.unitPrice > 0) {
          actionTaken += ' Harga satuan berhasil diverifikasi dari database.';
        }
      }

      // Update final item status
      if (item.quantity !== null && item.quantity > 0 && item.ahsp && item.price && item.price.unitPrice > 0) {
        item.status = 'READY';
        successfullyResolved++;
      } else {
        item.status = 'NEEDS_REVIEW';
        if (!item.unresolvedReason) {
          item.unresolvedReason = `Memerlukan review pengguna: ${!item.quantity ? 'Volume belum teridentifikasi' : !item.ahsp ? 'AHSP belum cocok' : 'Harga belum tersedia'}.`;
        }
      }

      resolutionDetails.push({
        itemId: item.id,
        itemName: item.name,
        originalStatus: origStatus,
        resolvedStatus: item.status,
        resolutionAction: actionTaken,
        evidenceNotes: evidenceNote,
      });
    }

    return {
      totalItemsInvestigated: unresolvedItems.length,
      successfullyResolved,
      stillUnresolved: unresolvedItems.length - successfullyResolved,
      resolutionDetails,
    };
  }

  private buildBroadQueries(item: FullAiWorkItem): string[] {
    const name = item.name.toLowerCase();
    const words = name.split(/\s+/).filter(w => w.length > 2);
    const queries: string[] = [];

    // Core keyword query
    if (words.length >= 2) {
      queries.push(words.slice(0, 2).join(' '));
    }
    if (words.length >= 1) {
      queries.push(words[0]);
    }

    // Category-specific fallback keywords
    const cat = item.category.toLowerCase();
    if (cat.includes('struktur')) queries.push('beton bertulang', 'besi');
    if (cat.includes('arsitektur')) queries.push('pasangan', 'plesteran', 'penutup');
    if (cat.includes('kusen')) queries.push('pintu', 'jendela', 'kusen');
    if (cat.includes('mep') || cat.includes('listrik')) queries.push('titik lampu', 'saklar');

    return queries;
  }
}

export const dedAiResolutionEngine = DedAiResolutionEngine.getInstance();

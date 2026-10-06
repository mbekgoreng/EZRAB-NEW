/**
 * EZRAB DED -> RAB V2: DED Completeness Auditor
 *
 * STEP 7: DED COMPLETENESS AUDIT & REPORT GENERATION
 *
 * Core Principles:
 * - Runs BEFORE AHSP matching.
 * - Missing data is acceptable; MISSING DATA MUST NOT BECOME FAKE DATA.
 * - Audits: Pages processed, work items inventory count, quantity resolved vs missing, evidence trace.
 * - Emits official DedCompletenessReport.
 */

import {
  DedCompletenessReport,
  DedInventoryItem,
  DedQuantityEvidence,
  PageReadingProgress,
} from '../types';

export class DedCompletenessAuditor {
  private static instance: DedCompletenessAuditor;

  private constructor() {}

  public static getInstance(): DedCompletenessAuditor {
    if (!DedCompletenessAuditor.instance) {
      DedCompletenessAuditor.instance = new DedCompletenessAuditor();
    }
    return DedCompletenessAuditor.instance;
  }

  /**
   * Generates comprehensive DED audit report.
   */
  public audit(params: {
    pageProgress: PageReadingProgress;
    inventory: DedInventoryItem[];
    quantities: Map<string, DedQuantityEvidence>;
    ahspMatchedCount?: number;
    ahspReviewCount?: number;
    priceResolvedCount?: number;
    readyCount?: number;
  }): DedCompletenessReport {
    const {
      pageProgress,
      inventory,
      quantities,
      ahspMatchedCount = 0,
      ahspReviewCount = 0,
      priceResolvedCount = 0,
      readyCount = 0,
    } = params;

    let quantityResolved = 0;
    let quantityMissing = 0;
    let evidenceTraced = 0;

    for (const item of inventory) {
      const q = quantities.get(item.id);
      if (q && q.status === 'RESOLVED' && q.value !== null && q.value > 0) {
        quantityResolved++;
      } else {
        quantityMissing++;
      }

      if (item.evidence && item.evidence.length > 0) {
        evidenceTraced++;
      }
    }

    let status = 'DED EXTRACTION COMPLETE';
    if (quantityMissing > 0) {
      status = `DED EXTRACTION COMPLETE WITH ${quantityMissing} QUANTITY ITEMS REQUIRING REVIEW`;
    } else if (pageProgress.pagesProcessed < pageProgress.pagesExpected) {
      status = `DED EXTRACTION PARTIAL (${pageProgress.pagesProcessed}/${pageProgress.pagesExpected} PAGES PROCESSED)`;
    }

    return {
      pagesExpected: pageProgress.pagesExpected,
      pagesProcessed: pageProgress.pagesProcessed,
      pagesFailed: pageProgress.pagesFailed,
      workItemsTotal: inventory.length,
      quantityResolved,
      quantityMissing,
      evidenceTraced,
      ahspMatched: ahspMatchedCount,
      ahspReview: ahspReviewCount,
      priceResolved: priceResolvedCount,
      readyItemsCount: readyCount,
      status,
    };
  }
}

export const dedCompletenessAuditor = DedCompletenessAuditor.getInstance();

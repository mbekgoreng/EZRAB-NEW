/**
 * Duplicate Page & Revision Variant Detector (Phase 6.1)
 *
 * Detects duplicate sheets, duplicate references, revision progressions, and unique drawings.
 */

import { DocumentPageInventoryItem, DuplicateStatusType } from '../../src/domain/document/documentSetTypes';

export class DuplicatePageDetector {
  private static instance: DuplicatePageDetector;

  private constructor() {}

  public static getInstance(): DuplicatePageDetector {
    if (!DuplicatePageDetector.instance) {
      DuplicatePageDetector.instance = new DuplicatePageDetector();
    }
    return DuplicatePageDetector.instance;
  }

  /**
   * Compute text similarity (Levenshtein-based token overlap)
   */
  public computeTextSimilarity(textA: string, textB: string): number {
    if (!textA && !textB) return 1.0;
    if (!textA || !textB) return 0.0;

    const tokensA = new Set(textA.toLowerCase().split(/\s+/).filter(t => t.length > 2));
    const tokensB = new Set(textB.toLowerCase().split(/\s+/).filter(t => t.length > 2));

    if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
    if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

    let common = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) common++;
    }

    const similarity = (2.0 * common) / (tokensA.size + tokensB.size);
    return Math.min(1.0, similarity);
  }

  /**
   * Evaluate duplicate status across all pages in the document set
   */
  public evaluateDuplicateStatuses(pages: DocumentPageInventoryItem[]): DocumentPageInventoryItem[] {
    for (let i = 0; i < pages.length; i++) {
      const pageA = pages[i];
      let isDuplicate = false;

      // 1. Check for EXACT duplicate (Same Drawing Number & Revision, or Identical Title/Content)
      for (let j = 0; j < i; j++) {
        const pageB = pages[j];

        if (
          pageA.metadata.drawingNumber &&
          pageB.metadata.drawingNumber &&
          pageA.metadata.drawingNumber === pageB.metadata.drawingNumber &&
          pageA.metadata.revision === pageB.metadata.revision
        ) {
          pageA.duplicateStatus = 'POSSIBLE_DUPLICATE';
          pageA.duplicateOfPageId = pageB.pageId;
          isDuplicate = true;
          break;
        }

        if (
          pageA.metadata.title &&
          pageB.metadata.title &&
          pageA.metadata.title.toLowerCase() === pageB.metadata.title.toLowerCase()
        ) {
          const sim = this.computeTextSimilarity(pageA.extractedText, pageB.extractedText);
          if (sim > 0.85) {
            pageA.duplicateStatus = 'POSSIBLE_DUPLICATE';
            pageA.duplicateOfPageId = pageB.pageId;
            isDuplicate = true;
            break;
          }
        }

        const contentSim = this.computeTextSimilarity(pageA.extractedText, pageB.extractedText);
        if (contentSim > 0.95 && pageA.extractedText.length > 50) {
          pageA.duplicateStatus = 'DUPLICATE_REFERENCE';
          pageA.duplicateOfPageId = pageB.pageId;
          isDuplicate = true;
          break;
        }
      }

      // 2. Check for Revision Variant
      if (!isDuplicate) {
        for (let j = 0; j < i; j++) {
          const pageB = pages[j];
          if (
            pageA.metadata.drawingNumber &&
            pageB.metadata.drawingNumber &&
            pageA.metadata.drawingNumber === pageB.metadata.drawingNumber &&
            pageA.metadata.revision !== pageB.metadata.revision
          ) {
            pageA.duplicateStatus = 'REVISION_VARIANT';
            pageA.duplicateOfPageId = pageB.pageId;
            isDuplicate = true;
            break;
          }
        }
      }

      if (!isDuplicate && !pageA.duplicateStatus) {
        pageA.duplicateStatus = 'UNIQUE';
      }
    }

    return pages;
  }
}

export const duplicatePageDetector = DuplicatePageDetector.getInstance();

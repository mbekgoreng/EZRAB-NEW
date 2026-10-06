/**
 * EZRAB — Duplicate Detection Engine
 *
 * Prevents double-counting across multi-page DED blueprints:
 * - Detects when an element appears on both floor plan and detail/schedule sheets (e.g. P1 count in floor plan vs P1 detail drawing)
 * - Merges duplicate items while accumulating source pages and evidences
 * - Preserves unique identity using canonicalWorkId or element tag
 */

export class DuplicateDetectionEngine {
  private static instance: DuplicateDetectionEngine;

  private constructor() {}

  public static getInstance(): DuplicateDetectionEngine {
    if (!DuplicateDetectionEngine.instance) {
      DuplicateDetectionEngine.instance = new DuplicateDetectionEngine();
    }
    return DuplicateDetectionEngine.instance;
  }

  public deduplicateWorkItems<T extends {
    id?: string;
    name: string;
    category?: string;
    unit?: string;
    sourcePages?: number[];
    evidenceIds?: string[];
    [key: string]: any;
  }>(items: T[]): { deduplicated: T[]; removedCount: number } {
    const seen = new Map<string, T>();
    let removedCount = 0;

    for (const item of items) {
      const tagMatch = item.name.match(/\b([pjbv][\d]+|[b][v][\d]+)\b/i);
      const tag = tagMatch ? tagMatch[1].toUpperCase() : null;

      // Identity key based on tag or normalized name + category
      const normName = item.name.toLowerCase().replace(/^(pekerjaan|pemasangan|pengadaan)\s+/i, '').trim();
      const key = tag ? `TAG_${tag}_${item.category || ''}` : `NAME_${normName}_${item.unit || ''}`;

      if (seen.has(key)) {
        // Merge evidence and pages into existing item
        const existing = seen.get(key)!;
        const mergedPages = Array.from(new Set([...(existing.sourcePages || []), ...(item.sourcePages || [])])).sort((a, b) => a - b);
        const mergedEvidences = Array.from(new Set([...(existing.evidenceIds || []), ...(item.evidenceIds || [])]));

        existing.sourcePages = mergedPages;
        existing.evidenceIds = mergedEvidences;
        removedCount++;
      } else {
        seen.set(key, { ...item });
      }
    }

    return {
      deduplicated: Array.from(seen.values()),
      removedCount,
    };
  }
}

export const duplicateDetectionEngine = DuplicateDetectionEngine.getInstance();

import { FullAiWorkItem } from '../types';

export interface DuplicateMergeAction {
  keptItemId: string;
  mergedItemId: string;
  reason: string;
}

export interface DeduplicationResult {
  items: FullAiWorkItem[];
  mergeActions: DuplicateMergeAction[];
  duplicatesRemoved: number;
}

export class DuplicateDetector {
  private static instance: DuplicateDetector;

  private constructor() {}

  public static getInstance(): DuplicateDetector {
    if (!DuplicateDetector.instance) {
      DuplicateDetector.instance = new DuplicateDetector();
    }
    return DuplicateDetector.instance;
  }

  private normalizeName(name: string): string {
    if (!name) return '';
    
    let normalized = name.toLowerCase().trim();
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Strip common prefixes
    const prefixes = ['pekerjaan', 'pemasangan', 'pembuatan', 'pasangan', 'instalasi'];
    const words = normalized.split(' ');
    
    while (words.length > 0 && prefixes.includes(words[0])) {
      words.shift();
    }
    
    normalized = words.join(' ');
    
    // Match specific synonyms
    normalized = normalized.replace(/bata merah/g, 'bata');
    normalized = normalized.replace(/dinding bata/g, 'bata');
    
    return normalized.trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = this.normalizeName(str1);
    const s2 = this.normalizeName(str2);
    
    if (s1 === s2) return 1.0;
    
    const words1 = s1.split(' ');
    const words2 = s2.split(' ');
    
    let matches = 0;
    for (const w1 of words1) {
      if (words2.includes(w1)) {
        matches++;
      }
    }
    
    const maxLen = Math.max(words1.length, words2.length);
    if (maxLen === 0) return 0;
    
    return matches / maxLen;
  }

  public deduplicate(items: FullAiWorkItem[]): DeduplicationResult {
    const result: FullAiWorkItem[] = [];
    const mergeActions: DuplicateMergeAction[] = [];
    let duplicatesRemoved = 0;
    
    if (!items || items.length === 0) {
      return { items: result, mergeActions, duplicatesRemoved };
    }

    const processed = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const currentItem = items[i];
      if (processed.has(currentItem.id)) continue;

      let keptItem = { ...currentItem };
      const duplicatesToMerge: FullAiWorkItem[] = [];

      for (let j = i + 1; j < items.length; j++) {
        const potentialDuplicate = items[j];
        if (processed.has(potentialDuplicate.id)) continue;

        // Check if categories match
        if (keptItem.category !== potentialDuplicate.category) continue;

        // Check similarity
        const similarity = this.calculateSimilarity(keptItem.name, potentialDuplicate.name);
        
        // Check overlapping source pages
        const pages1 = keptItem.sourcePages ? keptItem.sourcePages : [];
        const pages2 = potentialDuplicate.sourcePages ? potentialDuplicate.sourcePages : [];
        const hasOverlappingPage = pages1.some(p => pages2.includes(p));

        if (similarity >= 0.6 || (similarity >= 0.5 && hasOverlappingPage)) {
          duplicatesToMerge.push(potentialDuplicate);
          processed.add(potentialDuplicate.id);
        }
      }

      for (const dup of duplicatesToMerge) {
        const keptEvidenceCount = keptItem.sourceEvidence ? keptItem.sourceEvidence.length : 0;
        const dupEvidenceCount = dup.sourceEvidence ? dup.sourceEvidence.length : 0;
        
        if (dupEvidenceCount > keptEvidenceCount) {
          mergeActions.push({
            keptItemId: dup.id,
            mergedItemId: keptItem.id,
            reason: `Duplicate detected. Kept ${dup.name} over ${keptItem.name} due to more evidence.`
          });
          
          keptItem.id = dup.id;
          keptItem.name = dup.name;
        } else {
          mergeActions.push({
            keptItemId: keptItem.id,
            mergedItemId: dup.id,
            reason: `Duplicate detected. Kept ${keptItem.name} over ${dup.name} due to more/equal evidence.`
          });
        }

        // Combine source pages
        if (dup.sourcePages) {
          keptItem.sourcePages = Array.from(new Set([...(keptItem.sourcePages ? keptItem.sourcePages : []), ...dup.sourcePages]));
        }
        
        // Combine evidence
        if (dup.sourceEvidence) {
          keptItem.sourceEvidence = [...(keptItem.sourceEvidence ? keptItem.sourceEvidence : []), ...dup.sourceEvidence];
        }
        
        duplicatesRemoved++;
      }

      processed.add(currentItem.id);
      result.push(keptItem);
    }

    return {
      items: result,
      mergeActions,
      duplicatesRemoved
    };
  }
}

export const duplicateDetector = DuplicateDetector.getInstance();

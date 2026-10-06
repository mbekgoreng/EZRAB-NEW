import { autoAnswerEngine, AutoAnswerSearchResult } from './autoAnswerEngine';
import { vocabularyEngine } from './vocabularyEngine';
import { messageNormalizer } from './messageNormalizer';

export interface RagRetrievalQuery {
  query: string;
  intent?: string;
  workspaceId?: string;
  projectId?: string;
  userRole?: string;
  limit?: number;
}

export interface RagContextItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  confidence: number;
  sourceType: string;
  matchType: string;
}

export interface RagRetrievalResult {
  items: RagContextItem[];
  topConfidence: number;
  retrievalMode: 'HIGH_CONFIDENCE' | 'QUALIFIED' | 'FALLBACK';
  formattedContextMarkdown: string;
}

export class HybridRagEngine {
  public async retrieve(queryOptions: RagRetrievalQuery): Promise<RagRetrievalResult> {
    const rawQuery = queryOptions.query;
    const limit = queryOptions.limit || 3;

    // 1. Normalize Query & Resolve Typos / Vocabulary
    const typoCorrected = vocabularyEngine.normalizeTypos(rawQuery);
    const normalized = messageNormalizer.normalize(typoCorrected);

    // 2. Search Auto Answer Engine
    const searchResults: AutoAnswerSearchResult[] = autoAnswerEngine.search(normalized.normalized, limit);

    const items: RagContextItem[] = searchResults.map(r => ({
      id: r.entry.id,
      category: r.entry.category,
      question: r.entry.question,
      answer: r.entry.answer,
      confidence: r.confidence,
      sourceType: r.entry.source || 'knowledge_base',
      matchType: r.matchType
    }));

    const topConfidence = items.length > 0 ? items[0].confidence : 0;

    let retrievalMode: 'HIGH_CONFIDENCE' | 'QUALIFIED' | 'FALLBACK' = 'FALLBACK';
    if (topConfidence >= 0.85) {
      retrievalMode = 'HIGH_CONFIDENCE';
    } else if (topConfidence >= 0.65) {
      retrievalMode = 'QUALIFIED';
    }

    // 3. Format Context Markdown
    let formattedContextMarkdown = '';
    if (items.length > 0) {
      formattedContextMarkdown = '### REFERENSI KNOWLEDGE REPOSITORY RESMI:\n' +
        items.map((it, idx) => `[Sumber ${idx + 1}] (${it.category}) Q: ${it.question}\nA: ${it.answer}`).join('\n\n');
    }

    return {
      items,
      topConfidence,
      retrievalMode,
      formattedContextMarkdown
    };
  }
}

export const hybridRagEngine = new HybridRagEngine();

/**
 * EZRAB CORE AI — RAG ENGINE (RETRIEVAL-AUGMENTED GENERATION)
 * 
 * Semantic retrieval of construction engineering methodology, guidelines,
 * technical specifications, and terminology explanations.
 * 
 * Strict Principle:
 * - RAG provides narrative explanations, engineering reasons, and guidelines.
 * - RAG is STRICTLY FORBIDDEN from being the source of truth for AHSP codes,
 *   coefficients, material prices, or RAB totals.
 */

import { knowledgeRepository, KnowledgeItem } from './knowledgeRepository';
import { constructionVocabulary } from './constructionVocabulary';

export interface RagRetrievalResult {
  query: string;
  normalizedQuery: string;
  snippets: Array<{
    title: string;
    content: string;
    tier: string;
    category: string;
    sourceDocument?: string;
  }>;
  disclaimer: string;
}

export class RagEngine {
  private static instance: RagEngine | null = null;

  private constructor() {}

  public static getInstance(): RagEngine {
    if (!RagEngine.instance) {
      RagEngine.instance = new RagEngine();
    }
    return RagEngine.instance;
  }

  /**
   * Retrieves engineering methodology and narrative explanations for a query.
   */
  public retrieveEngineeringContext(query: string, projectId?: string): RagRetrievalResult {
    const normalized = constructionVocabulary.normalizeTerm(query);
    const items: KnowledgeItem[] = knowledgeRepository.queryKnowledge({
      query: normalized,
      limit: 3,
    });

    const snippets = items.map((it) => ({
      title: it.title,
      content: it.content,
      tier: it.tier,
      category: it.category,
      sourceDocument: it.sourceDocument,
    }));

    return {
      query,
      normalizedQuery: normalized,
      snippets,
      disclaimer: 'Informasi RAG ini bersifat pedoman teknis/metodologi. Nilai harga dan koefisien resmi ditarik langsung dari database PUPR 2026.',
    };
  }
}

export const ragEngine = RagEngine.getInstance();

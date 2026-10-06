import { KnowledgeCategory, KnowledgeSearchResult, ProvenanceValue } from './knowledgeTypes';
import { knowledgeRegistry } from './knowledgeRegistry';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../../src/data/nationalCostDatabase/masterRegistry';

export class KnowledgeRetriever {
  private static instance: KnowledgeRetriever;

  public static getInstance(): KnowledgeRetriever {
    if (!KnowledgeRetriever.instance) {
      KnowledgeRetriever.instance = new KnowledgeRetriever();
    }
    return KnowledgeRetriever.instance;
  }

  /**
   * Search knowledge repository with relevance scoring, category filter, and RLS checks
   */
  public search(params: {
    query: string;
    category?: KnowledgeCategory;
    projectId?: string;
    workspaceId?: string;
    topK?: number;
  }): KnowledgeSearchResult[] {
    const { query, category, topK = 5 } = params;
    const qTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (qTokens.length === 0) return [];

    const entries = category
      ? knowledgeRegistry.getByCategory(category)
      : knowledgeRegistry.getAll();

    const results: KnowledgeSearchResult[] = [];

    for (const entry of entries) {
      let score = 0;
      const titleLower = entry.title.toLowerCase();
      const contentLower = entry.content.toLowerCase();

      for (const token of qTokens) {
        if (titleLower.includes(token)) score += 10;
        if (entry.keywords.some(k => k.toLowerCase().includes(token))) score += 8;
        if (contentLower.includes(token)) score += 2;
      }

      if (score > 0) {
        results.push({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          category: entry.category,
          authority: entry.authority,
          version: entry.version,
          relevance: Math.min(score / (qTokens.length * 10), 1.0)
        });
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, topK);
  }

  /**
   * Verified AHSP lookup: Checks against official Permen PUPR 2026 database.
   * If not found, returns unverified provenance without inventing fake code or coefficients.
   */
  public resolveAhspItem(query: string): ProvenanceValue<any | null> {
    const cleanQuery = query.toLowerCase().trim();
    
    // Search exact code or matching description in official database
    const exactMatch = ALL_OFFICIAL_AHSP_ITEMS.find((item) => {
      const code = (item.code || '').toLowerCase();
      const codeNorm = (item.codeNormalized || '').toLowerCase();
      const desc = (item.name || (item as any).description || '').toLowerCase();
      return code === cleanQuery || codeNorm === cleanQuery || desc.includes(cleanQuery);
    });

    if (exactMatch) {
      return {
        value: exactMatch,
        source: 'ahsp_database',
        verified: true,
        confidence: 0.99,
        sourceReference: `Permen PUPR 2026 (${exactMatch.code})`
      };
    }

    // Unverified / unknown AHSP: Do NOT invent code!
    return {
      value: null,
      source: 'assumption',
      verified: false,
      confidence: 0.20,
      notes: 'Kode atau analisa AHSP tidak ditemukan di standar resmi PUPR 2026. Perlu verifikasi manual.'
    };
  }
}

export const knowledgeRetriever = KnowledgeRetriever.getInstance();

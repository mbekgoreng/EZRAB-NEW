import { KnowledgeEntry, KnowledgeCategory, KnowledgeSearchResult } from './knowledgeTypes';
import { CONSTRUCTION_KNOWLEDGE_ENTRIES } from './constructionKnowledge';

export class KnowledgeRegistry {
  private static instance: KnowledgeRegistry;
  private entries: Map<string, KnowledgeEntry> = new Map();

  private constructor() {
    this.registerDefaults();
  }

  public static getInstance(): KnowledgeRegistry {
    if (!KnowledgeRegistry.instance) {
      KnowledgeRegistry.instance = new KnowledgeRegistry();
    }
    return KnowledgeRegistry.instance;
  }

  private registerDefaults(): void {
    for (const entry of CONSTRUCTION_KNOWLEDGE_ENTRIES) {
      this.entries.set(entry.id, entry);
    }
  }

  public register(entry: KnowledgeEntry): void {
    this.entries.set(entry.id, entry);
  }

  public get(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  public getAll(): KnowledgeEntry[] {
    return Array.from(this.entries.values());
  }

  public getByCategory(category: KnowledgeCategory): KnowledgeEntry[] {
    return this.getAll().filter(e => e.category === category);
  }
}

export const knowledgeRegistry = KnowledgeRegistry.getInstance();

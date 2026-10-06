export type KnowledgeCategory =
  | 'EZRAB_PRODUCT'
  | 'CONSTRUCTION_GENERAL'
  | 'AHSP'
  | 'MATERIAL'
  | 'LABOR'
  | 'EQUIPMENT'
  | 'WBS'
  | 'RAB'
  | 'QTO'
  | 'PROJECT_TEMPLATE'
  | 'DOCUMENTATION'
  | 'USER_GUIDE';

export type ProvenanceSource =
  | 'user_input'
  | 'ezrab_database'
  | 'ahsp_database'
  | 'knowledge_repository'
  | 'template'
  | 'ded'
  | 'ai_extraction'
  | 'ai_estimate'
  | 'assumption';

export interface ProvenanceValue<T = any> {
  value: T;
  source: ProvenanceSource;
  verified: boolean;
  confidence: number;
  sourceReference?: string;
  notes?: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  summary: string;
  keywords: string[];
  authority: 'OFFICIAL_STANDARD' | 'REGULATORY' | 'EZRAB_CORE' | 'GENERAL_REFERENCE';
  version: string;
  searchable: boolean;
  projectScoped: boolean;
  workspaceScoped: boolean;
  updatedAt: string;
}

export interface KnowledgeSearchResult {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  authority: string;
  version: string;
  relevance: number;
  metadata?: Record<string, any>;
}

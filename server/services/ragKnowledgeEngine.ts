/**
 * RAG Knowledge Base Engine for EZRAB AI CoAssistant (Priority 2)
 *
 * Provides access-controlled document retrieval with citation tracking,
 * effective dates, versioning, and strict isolation across workspaces.
 * Strictly non-authoritative for calculation figures.
 */

export type DocumentSourceType =
  | 'SYSTEM_DOC'
  | 'FAQ'
  | 'GUIDE'
  | 'TEMPLATE_DOC'
  | 'AHSP_DOC'
  | 'SOP'
  | 'PROJECT_DOC'
  | 'PRICE_DB'
  | 'SUBSCRIPTION_POLICY';

export type AccessScope = 'GLOBAL' | 'WORKSPACE' | 'PROJECT';

export interface RagDocument {
  documentId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  sourceType: DocumentSourceType;
  title: string;
  version: string;
  page?: number;
  section?: string;
  effectiveDate: string;
  accessScope: AccessScope;
  checksum: string;
  content: string;
  keywords: string[];
}

export interface RagQueryResult {
  documentId: string;
  title: string;
  sourceType: DocumentSourceType;
  version: string;
  page?: number;
  section?: string;
  effectiveDate: string;
  snippet: string;
  relevanceScore: number;
  citation: string;
  isLatest: boolean;
}

export class RagKnowledgeEngine {
  private static instance: RagKnowledgeEngine;
  private documents: RagDocument[] = [];

  private constructor() {
    this.seedDefaultKnowledge();
  }

  public static getInstance(): RagKnowledgeEngine {
    if (!RagKnowledgeEngine.instance) {
      RagKnowledgeEngine.instance = new RagKnowledgeEngine();
    }
    return RagKnowledgeEngine.instance;
  }

  /**
   * Seed standard global documentation & AHSP standards
   */
  private seedDefaultKnowledge(): void {
    this.documents.push({
      documentId: 'doc_ahsp_pupr_2026',
      workspaceId: null,
      projectId: null,
      sourceType: 'AHSP_DOC',
      title: 'Pedoman Analisis Harga Satuan Pekerjaan Bidang PUPR 2026',
      version: '2026.1',
      page: 14,
      section: 'Pekerjaan Struktur Beton Bertulang',
      effectiveDate: '2026-01-01',
      accessScope: 'GLOBAL',
      checksum: 'sha256_pupr2026_std',
      content: 'Standar koefisien upah, bahan, dan peralatan untuk pekerjaan beton mutu f’c = 19.3 MPa (K-225), sloof, kolom praktis, dan balok struktur mengacu pada SNI terbaru.',
      keywords: ['ahsp', 'pupr', 'beton', 'k225', 'sloof', 'kolom', 'balok', 'sni']
    });

    this.documents.push({
      documentId: 'doc_faq_qris_payment',
      workspaceId: null,
      projectId: null,
      sourceType: 'SUBSCRIPTION_POLICY',
      title: 'Kebijakan Pembayaran Langganan QRIS & Kuota AI',
      version: '2.0',
      page: 1,
      section: 'Payment & Billing',
      effectiveDate: '2026-02-01',
      accessScope: 'GLOBAL',
      checksum: 'sha256_qris_sub_v2',
      content: 'Paket langganan EZRAB Pro aktif secara instan setelah pembayaran QRIS diverifikasi oleh payment gateway. Kuota credit AI direset setiap awal siklus tagihan.',
      keywords: ['qris', 'langganan', 'pro', 'credit', 'pembayaran', 'invoice']
    });

    this.documents.push({
      documentId: 'doc_template_house_guide',
      workspaceId: null,
      projectId: null,
      sourceType: 'TEMPLATE_DOC',
      title: 'Petunjuk Teknis Template Rumah Tinggal Type 36 s/d Type 300',
      version: '2.4',
      page: 5,
      section: 'Parameter & Batasan Desain',
      effectiveDate: '2026-03-01',
      accessScope: 'GLOBAL',
      checksum: 'sha256_house_tmpl_v24',
      content: 'Template Type 36, Type 45, dan Type 70 telah terverifikasi secara parametrik. Tipe 54 hingga 300 berstatus Coming Soon / Memerlukan Verifikasi Engineering.',
      keywords: ['template', 'rumah', 'type 36', 'type 45', 'type 70', 'type 120', 'type 300']
    });
  }

  /**
   * Ingest workspace or project specific document with access control
   */
  public ingestDocument(doc: RagDocument): void {
    if (doc.accessScope === 'WORKSPACE' && !doc.workspaceId) {
      throw new Error('Workspace document must have a valid workspaceId.');
    }
    if (doc.accessScope === 'PROJECT' && (!doc.workspaceId || !doc.projectId)) {
      throw new Error('Project document must have both workspaceId and projectId.');
    }
    this.documents.push(doc);
  }

  /**
   * Search knowledge base with strict tenant isolation and citation tracking
   */
  public queryKnowledge(input: {
    query: string;
    workspaceId: string;
    projectId?: string;
    sourceTypes?: DocumentSourceType[];
    limit?: number;
  }): RagQueryResult[] {
    const { query, workspaceId, projectId, sourceTypes, limit = 5 } = input;
    const qTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    // 1. Strict Tenant Access Filter (Only GLOBAL or matching workspace/project)
    const accessibleDocs = this.documents.filter(doc => {
      if (doc.accessScope === 'GLOBAL') return true;
      if (doc.accessScope === 'WORKSPACE') return doc.workspaceId === workspaceId;
      if (doc.accessScope === 'PROJECT') return doc.workspaceId === workspaceId && doc.projectId === projectId;
      return false;
    });

    // 2. Source type filter if specified
    const filteredBySource = sourceTypes && sourceTypes.length > 0
      ? accessibleDocs.filter(d => sourceTypes.includes(d.sourceType))
      : accessibleDocs;

    // 3. Score matching documents
    const scoredResults: RagQueryResult[] = [];

    for (const doc of filteredBySource) {
      const textToSearch = `${doc.title} ${doc.content} ${doc.keywords.join(' ')}`.toLowerCase();
      let matchCount = 0;

      for (const token of qTokens) {
        if (textToSearch.includes(token)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const relevanceScore = Math.min(1, (matchCount / Math.max(1, qTokens.length)) * 0.9 + 0.1);
        const citation = `[Dokumen: ${doc.title} v${doc.version}, Halaman ${doc.page || 1}, Bagian: ${doc.section || 'Umum'}]`;

        scoredResults.push({
          documentId: doc.documentId,
          title: doc.title,
          sourceType: doc.sourceType,
          version: doc.version,
          page: doc.page,
          section: doc.section,
          effectiveDate: doc.effectiveDate,
          snippet: doc.content.substring(0, 300) + '...',
          relevanceScore,
          citation,
          isLatest: true
        });
      }
    }

    // Sort by relevance score descending
    return scoredResults
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  public getAllDocumentsForWorkspace(workspaceId: string): RagDocument[] {
    return this.documents.filter(d => d.accessScope === 'GLOBAL' || d.workspaceId === workspaceId);
  }
}

export const ragKnowledgeEngine = RagKnowledgeEngine.getInstance();

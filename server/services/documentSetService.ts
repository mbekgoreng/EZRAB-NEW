/**
 * Whole Document Set Service (Phase 6.1)
 *
 * Coordinates multi-document packages as ONE unified DocumentSet before QTO/RAB analysis.
 * Pipeline: USER -> PROJECT -> DOCUMENT SET -> INGESTION -> PAGE INVENTORY -> CLASSIFICATION -> DOCUMENT MAP.
 */

import {
  DocumentSet,
  DocumentSetDocument,
  DocumentPageInventoryItem
} from '../../src/domain/document/documentSetTypes';
import { DocumentSecurityGuard } from '../security/documentSecurityGuard';
import { PageRoleClassifier } from './pageRoleClassifier';
import { DrawingMetadataExtractor } from './drawingMetadataExtractor';
import { DuplicatePageDetector } from './duplicatePageDetector';
import { DocumentMapBuilder } from './documentMapBuilder';

export interface DocumentUploadInput {
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string;
  rawText?: string;
  pageCount?: number;
  pagesText?: string[];
  revision?: string;
}

export interface IngestDocumentSetRequest {
  projectId: string;
  workspaceId: string;
  userId: string;
  documentSetName: string;
  files: DocumentUploadInput[];
}

export class DocumentSetService {
  private static instance: DocumentSetService;
  // Key: `${workspaceId}:${projectId}:${documentSetId}`
  private documentSets: Map<string, DocumentSet> = new Map();

  private readonly securityGuard = DocumentSecurityGuard.getInstance();
  private readonly classifier = PageRoleClassifier.getInstance();
  private readonly metadataExtractor = DrawingMetadataExtractor.getInstance();
  private readonly duplicateDetector = DuplicatePageDetector.getInstance();
  private readonly mapBuilder = DocumentMapBuilder.getInstance();

  private constructor() {}

  public static getInstance(): DocumentSetService {
    if (!DocumentSetService.instance) {
      DocumentSetService.instance = new DocumentSetService();
    }
    return DocumentSetService.instance;
  }

  private getKey(workspaceId: string, projectId: string, documentSetId: string): string {
    return `${workspaceId}:${projectId}:${documentSetId}`;
  }

  /**
   * Process and ingest an entire package of construction documents into a unified DocumentSet
   */
  public async ingestDocumentSet(req: IngestDocumentSetRequest): Promise<DocumentSet> {
    const { projectId, workspaceId, userId, documentSetName, files } = req;

    // 1. Validate tenant access
    const authCheck = this.securityGuard.validateTenantAccess({
      projectId,
      workspaceId,
      userId,
      targetProjectId: projectId
    });
    if (!authCheck.allowed) {
      throw new Error(`Unauthorized tenant access: ${authCheck.reason}`);
    }

    const documentSetId = `docset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const documents: DocumentSetDocument[] = [];
    let allPages: DocumentPageInventoryItem[] = [];

    // 2. Ingest and extract pages from each file
    for (const file of files) {
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const rawContent = file.rawText || '';

      // Security sanitization on document content
      const scanRes = this.securityGuard.scanAndSanitizeText(rawContent);
      const checksum = scanRes.checksumSha256;
      const cleanRawContent = scanRes.sanitizedContent || rawContent;

      // Determine file format
      const ext = file.fileName.toLowerCase().split('.').pop() || 'pdf';
      let fileType: any = 'PDF';
      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) fileType = 'IMAGE';
      else if (['xlsx', 'xls', 'csv'].includes(ext)) fileType = 'EXCEL';
      else if (['docx', 'doc'].includes(ext)) fileType = 'WORD';

      // Determine pages count & content
      const pageTexts = file.pagesText && file.pagesText.length > 0
        ? file.pagesText.map(t => this.securityGuard.scanAndSanitizeText(t).sanitizedContent || t)
        : cleanRawContent.split(/--- PAGE [0-9]+ ---|\n\n(?=Denah|Detail|Tampak|Potongan|Halaman)/i).filter(Boolean);

      const actualPageCount = Math.max(1, pageTexts.length);

      const docObj: DocumentSetDocument = {
        documentId: docId,
        documentSetId,
        projectId,
        fileName: file.fileName,
        fileType,
        mimeType: file.mimeType || 'application/pdf',
        fileSizeBytes: file.fileSizeBytes,
        pageCount: actualPageCount,
        version: '1.0',
        revision: file.revision || 'REV 00',
        checksumSha256: checksum,
        status: 'PARSED',
        source: 'UPLOAD',
        createdAt: new Date().toISOString()
      };
      documents.push(docObj);

      // Create page inventory items
      for (let p = 0; p < actualPageCount; p++) {
        const pageNum = p + 1;
        const pText = pageTexts[p] || cleanRawContent || file.fileName;
        const pageId = `page_${docId}_p${pageNum}`;

        // Extract metadata
        const metadata = this.metadataExtractor.extractMetadata(pText, file.fileName, pageNum);
        if (file.revision) {
          metadata.revision = file.revision;
        }

        // Classify page role
        const classification = this.classifier.classifyPage({
          pageNumber: pageNum,
          totalPages: actualPageCount,
          fileName: file.fileName,
          pageTitle: metadata.title || undefined,
          drawingNumber: metadata.drawingNumber || undefined,
          extractedText: pText
        });

        allPages.push({
          pageId,
          documentId: docId,
          documentSetId,
          projectId,
          pageNumber: pageNum,
          fileName: file.fileName,
          extractedText: pText,
          classification,
          metadata,
          duplicateStatus: 'UNIQUE',
          isSuperseded: false,
          isLatestRevision: true,
          status: 'CLASSIFIED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }

    // 3. Evaluate Duplicate Pages & Revision Variants
    allPages = this.duplicateDetector.evaluateDuplicateStatuses(allPages);

    // 4. Evaluate Revision Hierarchy & Mark Superseded Pages
    allPages = this.metadataExtractor.evaluateRevisionHierarchy(allPages);

    // 5. Build Whole Document Map
    const documentMap = this.mapBuilder.buildDocumentMap({
      documentSetId,
      projectId,
      projectName: documentSetName,
      pages: allPages
    });

    const documentSet: DocumentSet = {
      documentSetId,
      projectId,
      workspaceId,
      name: documentSetName,
      documents,
      pages: allPages,
      documentMap,
      totalPages: allPages.length,
      totalClassified: allPages.filter(p => p.classification.pageRole !== 'UNKNOWN').length,
      status: 'MAPPED',
      version: '1.0',
      securityClean: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const key = this.getKey(workspaceId, projectId, documentSetId);
    this.documentSets.set(key, documentSet);

    return documentSet;
  }

  /**
   * Get DocumentSet by ID validating tenant boundary
   */
  public getDocumentSet(params: {
    workspaceId: string;
    projectId: string;
    documentSetId: string;
  }): DocumentSet | undefined {
    const key = this.getKey(params.workspaceId, params.projectId, params.documentSetId);
    return this.documentSets.get(key);
  }

  /**
   * List all DocumentSets for a project
   */
  public listDocumentSets(params: {
    workspaceId: string;
    projectId: string;
  }): DocumentSet[] {
    const prefix = `${params.workspaceId}:${params.projectId}:`;
    const results: DocumentSet[] = [];
    for (const [k, v] of this.documentSets.entries()) {
      if (k.startsWith(prefix)) {
        results.push(v);
      }
    }
    return results;
  }

  /**
   * Clear store for tests
   */
  public clearStore(): void {
    this.documentSets.clear();
  }
}

export const documentSetService = DocumentSetService.getInstance();

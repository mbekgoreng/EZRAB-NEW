/**
 * Project Document Context Manager (Phase 6)
 *
 * Scopes, stores, deduplicates, and manages document collections strictly isolated per project and workspace.
 */

import { ProjectDocument, DocumentVersion, DocumentLifecycleStatus } from '../../src/domain/document/types';
import { DocumentSecurityGuard } from '../security/documentSecurityGuard';

export class ProjectDocumentContext {
  private static instance: ProjectDocumentContext;

  // Key: `${workspaceId}:${projectId}` -> Map<documentId, ProjectDocument>
  private projectContexts: Map<string, Map<string, ProjectDocument>> = new Map();

  private constructor() {}

  public static getInstance(): ProjectDocumentContext {
    if (!ProjectDocumentContext.instance) {
      ProjectDocumentContext.instance = new ProjectDocumentContext();
    }
    return ProjectDocumentContext.instance;
  }

  private getContextKey(workspaceId: string, projectId: string): string {
    return `${workspaceId}:${projectId}`;
  }

  /**
   * Register or update a document within project scope
   */
  public registerDocument(params: {
    workspaceId: string;
    projectId: string;
    document: ProjectDocument;
  }): ProjectDocument {
    const { workspaceId, projectId, document } = params;
    const key = this.getContextKey(workspaceId, projectId);

    if (!this.projectContexts.has(key)) {
      this.projectContexts.set(key, new Map());
    }

    const docMap = this.projectContexts.get(key)!;

    // Check for deduplication by Checksum
    for (const [existingId, existingDoc] of docMap.entries()) {
      if (existingDoc.checksumSha256 === document.checksumSha256 && existingDoc.fileName === document.fileName) {
        // Return existing deduplicated document
        return existingDoc;
      }
    }

    docMap.set(document.documentId, document);
    return document;
  }

  /**
   * Add a new version revision to an existing document
   */
  public addDocumentRevision(params: {
    workspaceId: string;
    projectId: string;
    documentId: string;
    version: DocumentVersion;
  }): ProjectDocument {
    const { workspaceId, projectId, documentId, version } = params;
    const doc = this.getDocument({ workspaceId, projectId, documentId });

    if (!doc) {
      throw new Error(`Dokumen ${documentId} tidak ditemukan pada proyek ${projectId}.`);
    }

    doc.versionHistory.push(version);
    doc.currentVersion = version.versionLabel;
    doc.checksumSha256 = version.checksumSha256;
    doc.fileSizeBytes = version.fileSizeBytes;
    doc.lifecycleStatus = version.status;
    doc.updatedAt = new Date().toISOString();

    return doc;
  }

  /**
   * Get a document strictly validating tenant scope
   */
  public getDocument(params: {
    workspaceId: string;
    projectId: string;
    documentId: string;
  }): ProjectDocument | undefined {
    const { workspaceId, projectId, documentId } = params;
    const key = this.getContextKey(workspaceId, projectId);
    const docMap = this.projectContexts.get(key);
    return docMap?.get(documentId);
  }

  /**
   * List all documents for a project
   */
  public listDocuments(params: {
    workspaceId: string;
    projectId: string;
  }): ProjectDocument[] {
    const { workspaceId, projectId } = params;
    const key = this.getContextKey(workspaceId, projectId);
    const docMap = this.projectContexts.get(key);
    return docMap ? Array.from(docMap.values()) : [];
  }

  /**
   * Update lifecycle status of a document
   */
  public updateStatus(params: {
    workspaceId: string;
    projectId: string;
    documentId: string;
    status: DocumentLifecycleStatus;
  }): ProjectDocument {
    const doc = this.getDocument(params);
    if (!doc) {
      throw new Error(`Dokumen ${params.documentId} tidak ditemukan.`);
    }
    doc.lifecycleStatus = params.status;
    doc.updatedAt = new Date().toISOString();
    return doc;
  }

  /**
   * Delete a document within project scope
   */
  public deleteDocument(params: {
    workspaceId: string;
    projectId: string;
    documentId: string;
  }): boolean {
    const { workspaceId, projectId, documentId } = params;
    const key = this.getContextKey(workspaceId, projectId);
    const docMap = this.projectContexts.get(key);
    if (!docMap) return false;
    return docMap.delete(documentId);
  }

  /**
   * Clear all documents for a project (useful for testing or project reset)
   */
  public clearProject(workspaceId: string, projectId: string): void {
    const key = this.getContextKey(workspaceId, projectId);
    this.projectContexts.delete(key);
  }
}

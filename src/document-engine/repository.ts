import type { DocumentRecord, ExportHistoryRecord } from './types';

export interface DocumentRepository {
  getProjectDocuments(projectId?: string): DocumentRecord[];
  getActiveDocuments(projectId?: string): DocumentRecord[];
  getDocument(definitionId: string): DocumentRecord | undefined;
  saveDocument(record: DocumentRecord): void;
  deleteDocument(definitionId: string): void;
  createRevision(record: DocumentRecord, description: string): DocumentRecord;
  getRevisionHistory(documentId: string): DocumentRecord[];
  saveExportHistory(item: ExportHistoryRecord): void;
  getExportHistory(documentId?: string): ExportHistoryRecord[];
  clearAll?(): void;
}

export class LocalDocumentRepository implements DocumentRepository {
  private records: DocumentRecord[] = [];
  private history: Record<string, DocumentRecord[]> = {};
  private exports: ExportHistoryRecord[] = [];

  constructor(private readonly projectId?: string) {
    this.loadFromStorage();
  }

  clearAll(): void {
    this.records = [];
    this.history = {};
    this.exports = [];
    if (typeof localStorage !== 'undefined' && this.projectId) {
      try {
        localStorage.removeItem(this.getStorageKey('documents'));
        localStorage.removeItem(this.getStorageKey('revisions'));
        localStorage.removeItem(this.getStorageKey('exports'));
      } catch {
        // ignore
      }
    }
  }

  private getStorageKey(type: 'documents' | 'revisions' | 'exports'): string {
    const id = this.projectId || 'global';
    return `ezrab:project:${id}:${type}`;
  }

  private loadFromStorage() {
    if (typeof localStorage !== 'undefined' && this.projectId) {
      try {
        const docsRaw = localStorage.getItem(this.getStorageKey('documents'));
        const revsRaw = localStorage.getItem(this.getStorageKey('revisions'));
        const expsRaw = localStorage.getItem(this.getStorageKey('exports'));

        this.records = docsRaw ? JSON.parse(docsRaw) : [];
        this.history = revsRaw ? JSON.parse(revsRaw) : {};
        this.exports = expsRaw ? JSON.parse(expsRaw) : [];
      } catch {
        this.records = [];
        this.history = {};
        this.exports = [];
      }
    }
  }

  private persist() {
    if (typeof localStorage !== 'undefined' && this.projectId) {
      try {
        localStorage.setItem(this.getStorageKey('documents'), JSON.stringify(this.records));
        localStorage.setItem(this.getStorageKey('revisions'), JSON.stringify(this.history));
        localStorage.setItem(this.getStorageKey('exports'), JSON.stringify(this.exports));
      } catch (err) {
        console.warn('[LocalDocumentRepository] Failed to persist to localStorage:', err);
      }
    }
  }

  getProjectDocuments(projectId?: string): DocumentRecord[] {
    const targetId = projectId || this.projectId;
    return targetId ? this.records.filter((r) => r.projectId === targetId) : this.records;
  }

  getActiveDocuments(projectId?: string): DocumentRecord[] {
    return this.getProjectDocuments(projectId).filter((r) => r.status !== 'NOT_STARTED');
  }

  deleteDocument(definitionId: string): void {
    this.records = this.records.filter(
      (r) => !(r.definitionId === definitionId && (!this.projectId || r.projectId === this.projectId))
    );
    this.persist();
  }

  getDocument(definitionId: string): DocumentRecord | undefined {
    return this.records.find(
      (r) => r.definitionId === definitionId && (!this.projectId || r.projectId === this.projectId)
    );
  }

  saveDocument(record: DocumentRecord): void {
    const scopedRecord = {
      ...record,
      projectId: record.projectId || this.projectId,
      updatedAt: new Date().toISOString(),
    };

    this.records = this.records.filter(
      (r) => !(r.definitionId === scopedRecord.definitionId && r.projectId === scopedRecord.projectId)
    );
    this.records.push(scopedRecord);
    this.persist();
  }

  createRevision(record: DocumentRecord, description: string): DocumentRecord {
    // 1. Snapshot the current revision as strictly read-only
    const readOnlyOldRevision: DocumentRecord = {
      ...JSON.parse(JSON.stringify(record)),
      isReadOnly: true,
      updatedAt: new Date().toISOString(),
    };

    const docId = record.definitionId;
    if (!this.history[docId]) {
      this.history[docId] = [];
    }
    this.history[docId].push(readOnlyOldRevision);

    // 2. Create the next active revision
    const nextRevisionNum = record.revision + 1;
    const nextRecord: DocumentRecord = {
      ...JSON.parse(JSON.stringify(record)),
      id: `${record.definitionId}-REV-${String(nextRevisionNum).padStart(2, '0')}`,
      revision: nextRevisionNum,
      revisionDescription: description,
      isReadOnly: false,
      status: 'DRAFT',
      updatedAt: new Date().toISOString(),
      values: {
        ...record.values,
        revisionDescription: description,
      },
    };

    this.saveDocument(nextRecord);
    return nextRecord;
  }

  getRevisionHistory(documentId: string): DocumentRecord[] {
    const historical = this.history[documentId] || [];
    const current = this.getDocument(documentId);
    if (!current) return historical;

    // Check if current is already in history to prevent duplicates
    const all = [...historical];
    if (!all.some((r) => r.revision === current.revision)) {
      all.push(current);
    }

    return all.sort((a, b) => b.revision - a.revision);
  }

  getRevisions(documentId: string): DocumentRecord[] {
    return this.getRevisionHistory(documentId);
  }

  saveExportHistory(item: ExportHistoryRecord): void {
    const scopedItem: ExportHistoryRecord = {
      ...item,
      projectId: item.projectId || this.projectId,
      createdAt: item.createdAt || new Date().toISOString(),
    };
    this.exports.push(scopedItem);
    this.persist();
  }

  getExportHistory(documentId?: string): ExportHistoryRecord[] {
    const list = documentId ? this.exports.filter((x) => x.documentId === documentId) : this.exports;
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export const getActiveDocuments = (projectId: string, repo?: DocumentRepository): DocumentRecord[] => {
  const targetRepo = repo || new LocalDocumentRepository(projectId);
  return targetRepo.getActiveDocuments ? targetRepo.getActiveDocuments(projectId) : targetRepo.getProjectDocuments(projectId).filter((r) => r.status !== 'NOT_STARTED');
};
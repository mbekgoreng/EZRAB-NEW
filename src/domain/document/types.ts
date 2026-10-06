/**
 * Document Intelligence Domain Types for EZRAB Construction AI (Phase 6)
 */

export type DocumentDiscipline = 
  | 'ARCHITECTURE' 
  | 'STRUCTURE' 
  | 'MEP' 
  | 'CIVIL' 
  | 'SPECIFICATION' 
  | 'BOQ' 
  | 'GENERAL';

export type DocumentType = 
  | 'DED_DRAWING' 
  | 'SITE_PLAN' 
  | 'FLOOR_PLAN' 
  | 'ELEVATION_SECTION' 
  | 'STRUCTURAL_DETAIL' 
  | 'MEP_SCHEMATIC' 
  | 'BOQ_EXCEL' 
  | 'SPEC_DOC' 
  | 'SITE_PHOTO' 
  | 'OTHER';

export type DocumentLifecycleStatus = 
  | 'UPLOADED' 
  | 'VALIDATED' 
  | 'CLASSIFIED' 
  | 'EXTRACTING' 
  | 'PARSED' 
  | 'ANALYZING' 
  | 'READY_FOR_REVIEW' 
  | 'APPROVED' 
  | 'PROCESSED' 
  | 'REJECTED' 
  | 'ERROR';

export type DocumentFileType = 'PDF' | 'EXCEL' | 'WORD' | 'IMAGE' | 'SCAN' | 'TEXT' | 'DWG';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentChunk {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  discipline: DocumentDiscipline;
  content: string;
  tablesDetected: number;
  entitiesExtracted: number;
  confidence: number;
  boundingBox?: BoundingBox;
}

export interface DocumentVersion {
  versionId: string;
  versionLabel: string; // 'REV 00', 'REV 01', 'REV 02'
  checksumSha256: string;
  uploadedAt: string;
  uploadedBy: string;
  fileSizeBytes: number;
  status: DocumentLifecycleStatus;
  changeSummary?: string;
}

export interface ProjectDocument {
  documentId: string;
  projectId: string;
  workspaceId: string;
  fileName: string;
  fileType: DocumentFileType;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  discipline: DocumentDiscipline;
  docType: DocumentType;
  lifecycleStatus: DocumentLifecycleStatus;
  currentVersion: string;
  versionHistory: DocumentVersion[];
  pageCount: number;
  parsedChunks: DocumentChunk[];
  metadata: {
    title?: string;
    scale?: string;
    projectName?: string;
    drawnBy?: string;
    checkedBy?: string;
    sheetNumber?: string;
    date?: string;
    customFields?: Record<string, any>;
  };
  securityStatus: {
    scanned: boolean;
    isClean: boolean;
    sanitized: boolean;
    scanTimestamp: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DocumentIngestRequest {
  projectId: string;
  workspaceId: string;
  userId: string;
  fileName: string;
  fileType?: DocumentFileType;
  fileSizeBytes: number;
  mimeType?: string;
  rawText?: string;
  rawBufferBase64?: string;
  versionLabel?: string;
  metadata?: Record<string, any>;
}

export interface DocumentIngestResult {
  document: ProjectDocument;
  extractedEntityCount: number;
  disciplinesDetected: DocumentDiscipline[];
  isReadyForQto: boolean;
  warnings: string[];
}

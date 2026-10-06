/**
 * Whole Document Intelligence & Document Set Domain Types (Phase 6.1)
 *
 * Models a multi-document package as ONE unified DocumentSet before QTO/RAB analysis.
 * Principles: PAGES != PROJECTS, PAGES != WORK ITEMS, PAGES != RAB.
 */

import { DocumentDiscipline, DocumentFileType, BoundingBox } from './types';

export type PageRoleType = 
  | 'COVER'
  | 'INDEX'
  | 'SITE_PLAN'
  | 'FLOOR_PLAN'
  | 'ROOF_PLAN'
  | 'ELEVATION'
  | 'SECTION'
  | 'STRUCTURAL_PLAN'
  | 'STRUCTURAL_DETAIL'
  | 'MEP_PLAN'
  | 'MEP_DETAIL'
  | 'DOOR_SCHEDULE'
  | 'WINDOW_SCHEDULE'
  | 'MATERIAL_SCHEDULE'
  | 'SPECIFICATION'
  | 'DETAIL'
  | 'CALCULATION'
  | 'REFERENCE'
  | 'DUPLICATE_REFERENCE'
  | 'UNKNOWN';

export type DuplicateStatusType = 
  | 'UNIQUE' 
  | 'POSSIBLE_DUPLICATE' 
  | 'DUPLICATE_REFERENCE' 
  | 'REVISION_VARIANT' 
  | 'UNKNOWN';

export type DocumentSetStatus = 
  | 'CREATED' 
  | 'INGESTING' 
  | 'INVENTORIED' 
  | 'CLASSIFYING' 
  | 'MAPPED' 
  | 'READY_FOR_EXTRACTION' 
  | 'ERROR';

export interface DrawingMetadata {
  drawingNumber: string | null;
  sheetNumber: string | null;
  title: string | null;
  revision: string | null;
  revisionDate: string | null;
  discipline: DocumentDiscipline | null;
  building: string | null;
  floor: string | null;
  zone: string | null;
  scale: string | null;
  author: string | null;
  checkedBy: string | null;
  date: string | null;
  rawTitleBlockText?: string;
}

export interface PageClassificationResult {
  pageRole: PageRoleType;
  confidence: number; // 0.0 - 1.0
  reason: string;
  evidence: string[];
}

export interface DocumentPageInventoryItem {
  pageId: string;
  documentId: string;
  documentSetId: string;
  projectId: string;
  pageNumber: number;
  fileName: string;
  imageReference?: string;
  textReference?: string;
  extractedText: string;
  classification: PageClassificationResult;
  metadata: DrawingMetadata;
  duplicateStatus: DuplicateStatusType;
  duplicateOfPageId?: string;
  supersededByPageId?: string;
  isSuperseded: boolean;
  isLatestRevision: boolean;
  status: 'PENDING' | 'EXTRACTED' | 'CLASSIFIED' | 'MAPPED' | 'ERROR';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSetDocument {
  documentId: string;
  documentSetId: string;
  projectId: string;
  fileName: string;
  fileType: DocumentFileType;
  mimeType: string;
  fileSizeBytes: number;
  pageCount: number;
  version: string;
  revision: string;
  checksumSha256: string;
  status: 'UPLOADED' | 'PARSED' | 'CLASSIFIED' | 'ERROR';
  source: 'UPLOAD' | 'INTEGRATION' | 'MANUAL';
  createdAt: string;
}

export interface PageRelationship {
  sourcePageId: string;
  targetPageId: string;
  relationshipType: 'DETAILS_OF_PLAN' | 'SECTION_OF_PLAN' | 'SCHEDULE_OF_PLAN' | 'SUPERSEDES_REVISION' | 'CROSS_REFERENCE';
  description: string;
  confidence: number;
}

export interface DisciplineGroup {
  discipline: DocumentDiscipline;
  pageCount: number;
  pages: DocumentPageInventoryItem[];
}

export interface FloorNode {
  floorId: string;
  floorName: string; // e.g., "Lantai 1", "Lantai 2", "Roof"
  elevation?: number; // meters e.g. +0.00, +4.00
  disciplines: Record<DocumentDiscipline, DisciplineGroup>;
}

export interface BuildingNode {
  buildingId: string;
  buildingName: string; // e.g. "Gedung Utama", "Pos Jaga", "Site"
  floors: FloorNode[];
}

export interface DocumentMap {
  documentSetId: string;
  projectId: string;
  projectName: string;
  totalBuildings: number;
  totalFloors: number;
  totalClassifiedPages: number;
  buildings: BuildingNode[];
  relationships: PageRelationship[];
  unassignedPages: DocumentPageInventoryItem[];
  generatedAt: string;
}

export interface DocumentSet {
  documentSetId: string;
  projectId: string;
  workspaceId: string;
  name: string;
  documents: DocumentSetDocument[];
  pages: DocumentPageInventoryItem[];
  documentMap?: DocumentMap;
  totalPages: number;
  totalClassified: number;
  status: DocumentSetStatus;
  version: string;
  securityClean: boolean;
  createdAt: string;
  updatedAt: string;
}

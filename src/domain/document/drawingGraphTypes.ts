/**
 * Phase 6.2: EZRAB DED -> RAB: Page & Drawing Intelligence Domain Types
 *
 * Models the Drawing Relationship Graph, Cross-References, Floor Awareness,
 * and Conflict Detection across multi-document packages.
 *
 * Core Principle: Page != Entity | Page != Work Item | Page != RAB
 */

export type DrawingDisciplineType =
  | 'ARCHITECTURAL'
  | 'STRUCTURAL'
  | 'MECHANICAL'
  | 'ELECTRICAL'
  | 'PLUMBING'
  | 'FIRE'
  | 'LANDSCAPE'
  | 'CIVIL'
  | 'ROAD'
  | 'BRIDGE'
  | 'WATER'
  | 'OTHER';

export type DrawingRelationshipType =
  | 'PRIMARY'
  | 'DETAIL_OF'
  | 'SECTION_OF'
  | 'ELEVATION_OF'
  | 'SCHEDULE_OF'
  | 'SPECIFICATION_OF'
  | 'REFERENCE_OF'
  | 'CALCULATION_OF'
  | 'RELATED_TO'
  | 'SUPERSEDES'
  | 'DUPLICATES';

export type ConflictStatusType =
  | 'CONSISTENT'
  | 'CONFLICT'
  | 'REVISION_RESOLVED'
  | 'NEEDS_REVIEW';

export type CrossReferenceCategory =
  | 'COLUMN'
  | 'BEAM'
  | 'SLAB'
  | 'FOUNDATION'
  | 'DOOR'
  | 'WINDOW'
  | 'WALL'
  | 'ROOM'
  | 'FIXTURE'
  | 'REBAR'
  | 'OTHER';

export interface CrossReferenceEvidence {
  referenceId: string;
  identifier: string; // e.g. "K1", "K2", "S1", "B1", "P1", "D1"
  category: CrossReferenceCategory;
  building: string;
  floor: string; // e.g. "Floor 1", "Floor 2" (Floor awareness)
  zone: string | null;
  sourceDrawingId: string;
  sourcePageId: string;
  targetDrawingId?: string;
  targetPageId?: string;
  contextSnippet: string; // snippet from OCR / text
  parameters?: Record<string, any>; // e.g. { dimension: "25x25", rebar: "8 D16" }
  confidence: number;
}

export interface DrawingRelationship {
  relationshipId: string;
  sourceDrawingId: string;
  targetDrawingId: string;
  type: DrawingRelationshipType;
  description: string;
  confidence: number;
  evidenceSnippets?: string[];
  createdAt: string;
}

export interface DrawingConflictCandidate {
  conflictId: string;
  status: ConflictStatusType;
  entityIdentifier: string; // e.g. "K1", "Balok B1", "Pintu D1"
  building: string;
  floor: string;
  discipline: DrawingDisciplineType;
  sourceDrawingId: string;
  sourceDescription: string; // e.g. "Denah Lantai 2: Kolom K1 25x25 cm"
  conflictingDrawingId: string;
  conflictingDescription: string; // e.g. "Detail Kolom: Kolom K1 30x30 cm"
  discrepancyType: 'DIMENSION' | 'MATERIAL' | 'REINFORCEMENT' | 'SCHEDULE' | 'REVISION_MISMATCH';
  suggestedResolution?: string;
  humanAuditNotes?: string;
  detectedAt: string;
}

export interface DrawingEntity {
  drawingId: string;
  drawingNumber: string; // e.g. "A-101", "S-201", "MEP-01"
  title: string; // e.g. "Denah Lantai 2", "Detail Pondasi Poer & Sloof"
  discipline: DrawingDisciplineType;
  building: string;
  floor: string; // e.g. "Basement", "Ground Floor", "Floor 1", "Floor 2", "Roof"
  zone: string | null;
  revision: string; // e.g. "REV 00", "REV 01", "REV A"
  scale: string | null;
  pageIds: string[]; // 1 drawing can span 1 or multiple page IDs
  relationshipIds: string[];
  primaryDrawingId?: string; // links to parent primary drawing if this is a detail/section/schedule
  crossReferences: CrossReferenceEvidence[];
  isSuperseded: boolean;
  supersededByDrawingId?: string;
  isDuplicate: boolean;
  duplicateOfDrawingId?: string;
  status: 'VALIDATED' | 'CONFLICT' | 'NEEDS_REVIEW' | 'SUPERSEDED' | 'DUPLICATE';
  createdAt: string;
  updatedAt: string;
}

export interface DrawingSetNode {
  drawingSetId: string;
  name: string; // e.g. "Architectural Set Rev 01", "Structural Set"
  discipline: DrawingDisciplineType;
  drawings: DrawingEntity[];
}

export interface ZoneNode {
  zoneId: string;
  zoneName: string;
  disciplines: Record<string, DrawingSetNode>;
}

export interface FloorAwarenessNode {
  floorId: string;
  floorName: string; // "Basement", "Ground Floor", "Floor 1", "Floor 2", "Floor 3", "Roof", "Rooftop"
  elevation?: number; // e.g. +0.00, +4.00, +8.00
  zones: Record<string, ZoneNode>;
  disciplines: Record<string, DrawingSetNode>;
}

export interface BuildingAwarenessNode {
  buildingId: string;
  buildingName: string;
  floors: Record<string, FloorAwarenessNode>;
}

export interface DrawingGraph {
  graphId: string;
  projectId: string;
  workspaceId: string;
  documentSetId: string;
  totalBuildings: number;
  totalFloors: number;
  totalDrawings: number;
  totalRelationships: number;
  totalCrossReferences: number;
  totalConflicts: number;
  buildings: Record<string, BuildingAwarenessNode>;
  drawings: Record<string, DrawingEntity>;
  relationships: Record<string, DrawingRelationship>;
  crossReferences: CrossReferenceEvidence[];
  conflicts: DrawingConflictCandidate[];
  duplicateCandidates: { drawingId: string; duplicateOfDrawingId: string; reason: string }[];
  status: 'PROCESSED' | 'HAS_CONFLICTS' | 'ERROR';
  generatedAt: string;
}

export interface MultiDocumentContext {
  projectId: string;
  workspaceId: string;
  documentSetId: string;
  documentTypesPresent: {
    architectural: boolean;
    structural: boolean;
    mep: boolean;
    specifications: boolean;
    boq: boolean;
  };
  totalFiles: number;
  fileSummaries: {
    fileName: string;
    discipline: DrawingDisciplineType;
    pageCount: number;
    revision: string;
  }[];
  drawingGraph: DrawingGraph;
}

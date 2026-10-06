/**
 * Phase 6.3: EZRAB DED -> RAB: Canonical Entity & Anti-Duplicate Domain Types
 *
 * Core Invariants:
 * RAW EXTRACTION != PHYSICAL ENTITY
 * Evidence != Entity
 * Page != Entity
 * Entity != Work Item
 * Work Item != RAB Item
 */

import { BoundingBox } from './types';
import { DrawingDisciplineType } from './drawingGraphTypes';

export type EntityResolutionStatus =
  | 'SAME_ENTITY'
  | 'RELATED_ENTITY'
  | 'DIFFERENT_ENTITY'
  | 'POTENTIAL_DUPLICATE'
  | 'CONFLICT'
  | 'UNRESOLVED';

export type EvidenceSourceType =
  | 'STRUCTURAL_DETAIL'
  | 'SECTION'
  | 'STRUCTURAL_PLAN'
  | 'ARCHITECTURAL_PLAN'
  | 'SCHEDULE'
  | 'SPECIFICATION'
  | 'TEXT_NOTE'
  | 'BOQ_REFERENCE'
  | 'AI_INFERENCE';

export interface EntityEvidence {
  evidenceId: string;
  entityId?: string;
  pageId: string;
  drawingId: string;
  pageNumber: number;
  fileName: string;
  sourceType: EvidenceSourceType;
  sourcePriority: number; // 1 (Highest: Structural Detail) -> 6 (Lowest: AI Inference)
  sourceText: string;
  boundingBox?: BoundingBox;
  imageReference?: string;
  extractedValue: {
    identifier: string;
    dimensions?: string;
    quantity?: number;
    unit?: string;
    material?: string;
    rebar?: string;
    thickness?: string;
    grid?: string;
  };
  confidence: number;
  createdAt: string;
}

export interface QuantityCandidate {
  candidateId: string;
  evidenceId: string;
  source: string; // e.g. "Plan Sheet S-101", "Door Schedule A-501"
  sourceType: EvidenceSourceType;
  quantity: number;
  unit: string;
  confidence: number;
  isDeduplicated: boolean;
}

export interface CanonicalEntity {
  entityId: string;
  projectId: string;
  buildingId: string;
  floorId: string; // Floor awareness
  zoneId: string | null;
  discipline: DrawingDisciplineType;
  elementType: string; // 'COLUMN' | 'BEAM' | 'SLAB' | 'FOUNDATION' | 'DOOR' | 'WINDOW' | 'WALL' | 'ROOM' | etc.
  name: string;
  identifier: string; // e.g. "K1", "B1", "PJ1", "P1"
  drawingReferences: string[];
  evidenceIds: string[];
  evidences: EntityEvidence[];
  location: {
    grid?: string;
    coordinates?: string;
    floor: string;
    building: string;
    zone?: string | null;
    description?: string;
  };
  geometry?: {
    shape?: string;
    length?: number;
    width?: number;
    height?: number;
    thickness?: number;
    area?: number;
    volume?: number;
  };
  dimensions?: string;
  material?: string;
  rebar?: string;
  quantityCandidates: QuantityCandidate[];
  canonicalQuantity: {
    quantity: number;
    unit: string;
    source: string;
    confidence: number;
    isDeduplicated: boolean;
  };
  identityConfidence: number;
  resolutionStatus: EntityResolutionStatus;
  isDuplicate: boolean;
  duplicateOfEntityId?: string;
  isSuperseded: boolean;
  supersededByEntityId?: string;
  conflictDescription?: string;
  provenance: {
    sourceDrawings: string[];
    sourcePages: string[];
    detectedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CanonicalWorkItem {
  workItemId: string;
  projectId: string;
  entityId: string;
  wbsCategory: string; // e.g. "PEKERJAAN_STRUKTUR_BETON_BERTULANG"
  itemCode: string;
  itemDescription: string;
  canonicalQuantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  ahspCode?: string;
  confidence: number;
  provenanceEvidenceIds: string[];
  createdAt: string;
}

export interface EntityResolutionSummary {
  projectId: string;
  totalRawEvidence: number;
  totalCanonicalEntities: number;
  totalDeduplicatedQuantityItems: number;
  totalConflicts: number;
  totalDuplicatesNeutralized: number;
  totalSupersededNeutralized: number;
  entities: CanonicalEntity[];
  workItems: CanonicalWorkItem[];
  resolutionLog: {
    entityId: string;
    action: string;
    status: EntityResolutionStatus;
    reason: string;
  }[];
  generatedAt: string;
}

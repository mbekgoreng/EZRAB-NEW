/**
 * Construction Entity Domain Types for EZRAB Construction AI (Phase 6)
 */

import { DocumentDiscipline, BoundingBox } from './types';

export type ConstructionEntityType = 
  | 'ROOM'
  | 'BUILDING_DIMENSION'
  | 'WALL'
  | 'COLUMN'
  | 'BEAM'
  | 'SLAB'
  | 'FOOTING'
  | 'SLOOF'
  | 'DOOR_WINDOW'
  | 'ROOF_STRUCTURE'
  | 'PLUMBING_FIXTURE'
  | 'ELECTRICAL_POINT'
  | 'DRAINAGE_CHANNEL'
  | 'ROAD_PAVEMENT'
  | 'FINISHING_FLOOR'
  | 'FINISHING_WALL'
  | 'FINISHING_CEILING'
  | 'CUSTOM_ELEMENT';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type EntityProvenance = 
  | 'DOCUMENT' 
  | 'USER_INPUT' 
  | 'TEMPLATE' 
  | 'AHSP_DATABASE' 
  | 'PRICE_DATABASE' 
  | 'AI_EXTRACTION' 
  | 'AI_ESTIMATE' 
  | 'ASSUMPTION';

export interface EntityParameter {
  key: string;
  name: string;
  value: number | string | boolean;
  unit?: string;
  rawExpression?: string;
  confidence: number;
  provenance: EntityProvenance;
  sourceText?: string;
}

export interface ConstructionEntity {
  entityId: string;
  projectId: string;
  discipline: DocumentDiscipline;
  entityType: ConstructionEntityType;
  name: string;
  tag?: string; // e.g. "K1", "B1", "P1", "Ruang Tidur 1"
  quantity: number;
  unit: string;
  parameters: Record<string, EntityParameter>;
  confidence: number; // 0.0 to 1.0
  confidenceLevel: ConfidenceLevel;
  provenance: EntityProvenance;
  sourceDocumentId?: string;
  sourcePageNumber?: number;
  sourceBoundingBox?: BoundingBox;
  sourceSnippet?: string;
  status: 'DRAFT' | 'VERIFIED' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';
  conflictDetected: boolean;
  conflictId?: string;
  notes?: string[];
  createdAt: string;
  updatedAt: string;
}

export type ConflictPrecedenceRule = 
  | 'USER_OVERRIDE_DOCUMENT' 
  | 'DOCUMENT_OVERRIDE_ESTIMATE' 
  | 'DETAIL_OVERRIDE_GENERAL' 
  | 'LATEST_REV_OVERRIDE_OLD' 
  | 'REQUIRES_USER_CHOICE';

export interface ConflictRecord {
  conflictId: string;
  projectId: string;
  entityId: string;
  entityName: string;
  parameterKey: string;
  parameterName: string;
  conflictingSources: Array<{
    sourceType: EntityProvenance;
    sourceId: string;
    sourceName: string;
    pageNumber?: number;
    value: number | string;
    unit?: string;
    confidence: number;
    timestamp: string;
  }>;
  differenceDescription: string;
  recommendedValue: number | string;
  recommendedRule: ConflictPrecedenceRule;
  resolutionStatus: 'UNRESOLVED' | 'RESOLVED_AUTO' | 'RESOLVED_BY_USER' | 'DISMISSED';
  resolvedValue?: number | string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionRationale?: string;
}

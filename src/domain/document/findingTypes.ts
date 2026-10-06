/**
 * Construction Review Finding Domain Types for EZRAB AI Construction Review (Phase 6)
 */

export type FindingSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type FindingCategory = 
  | 'MISSING_WORK' 
  | 'QUANTITY_DEVIATION' 
  | 'DUPLICATE_ITEM' 
  | 'UNIT_MISMATCH' 
  | 'UNMAPPED_AHSP' 
  | 'MISSING_PRICE' 
  | 'SPEC_DISCREPANCY' 
  | 'REGULATORY_SAFETY';

export interface ConstructionReviewFinding {
  findingId: string;
  projectId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  impactAnalysis: string;
  suggestedAction: string;
  affectedItems: Array<{
    targetType: 'RAB_ITEM' | 'QTO_ITEM' | 'ENTITY' | 'DOCUMENT';
    targetId: string;
    targetName: string;
    currentValue?: number | string;
    expectedValue?: number | string;
    unit?: string;
  }>;
  sourceReferences: Array<{
    documentId: string;
    documentName: string;
    pageNumber?: number;
    discipline?: string;
    snippet?: string;
  }>;
  status: 'OPEN' | 'ACCEPTED' | 'DISMISSED' | 'APPLIED';
  appliedResolution?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewWorkspaceState {
  projectId: string;
  totalDocuments: number;
  totalEntities: number;
  totalQtoDraftItems: number;
  totalRabDraftItems: number;
  openFindingsCount: number;
  highSeverityFindingsCount: number;
  isReadyToCommit: boolean;
  lastAuditedAt: string;
}

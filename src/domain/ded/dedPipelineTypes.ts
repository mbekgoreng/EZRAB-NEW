/**
 * EZRAB DED -> RAB Production Pipeline Types (Phase 10)
 *
 * Implements strict source-first data models:
 * - Document classification
 * - Source inventory with SHA-256 provenance
 * - Drawing element detection
 * - Work item candidate data model
 * - Deterministic QTO dimensions & calculations
 * - AHSP mapping candidate & rationale
 * - Price source attribution
 * - Evidence linkage for every field
 * - Confidence & conflict system
 * - User override preservation
 * - Draft RAB row & summary
 */

import { AIEvidence, EvidenceStatus } from '../../services/aiEvidenceService';
import { ProviderExecutionClassification } from '../../services/aiSourceReadingService';

export type DocumentClassification =
  | 'ARCHITECTURAL_DRAWING'
  | 'STRUCTURAL_DRAWING'
  | 'MEP_DRAWING'
  | 'BOQ'
  | 'SPECIFICATION'
  | 'RAB'
  | 'AHSP'
  | 'SCHEDULE'
  | 'OTHER'
  | 'UNKNOWN';

export type DEDEvidenceType =
  | 'TEXT'
  | 'DIMENSION'
  | 'TABLE'
  | 'SYMBOL'
  | 'DRAWING'
  | 'NOTE';

export interface DEDEvidence {
  id: string;
  sourceFileId: string;
  sourceFileName?: string;
  pageNumber: number;
  type: DEDEvidenceType;
  rawText?: string;
  value?: number;
  unit?: string;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  extractionMethod?: 'OCR' | 'PDF_TEXT' | 'VISION_MODEL' | 'MANUAL';
  createdAt?: string;
}

export type DEDWorkItemCategory =
  | 'EARTHWORK'
  | 'CONCRETE'
  | 'REBAR'
  | 'MASONRY'
  | 'STEEL'
  | 'ROOF'
  | 'FINISH'
  | 'DOOR_WINDOW'
  | 'MEP'
  | 'OTHER';

export type DEDWorkItemStatus =
  | 'CONFIRMED'
  | 'PARTIAL'
  | 'MISSING_DATA'
  | 'AMBIGUOUS'
  | 'CONFLICT';

export type WorkItemStatus =
  | 'CONFIRMED'
  | 'PARTIAL'
  | 'MISSING_DATA'
  | 'AMBIGUOUS'
  | 'CONFLICT'
  | 'VERIFIED'
  | 'DERIVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'NOT_FOUND'
  | 'NEEDS_REVIEW'
  | 'USER_OVERRIDDEN';

export type WorkItemConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type SupportedUnit =
  | 'm'
  | 'm²'
  | 'm³'
  | 'kg'
  | 'unit'
  | 'buah'
  | 'set'
  | 'ls'
  | 'titik'
  | 'batang'
  | 'UNIT_NOT_FOUND';

export type DEDPipelineErrorState =
  | 'QUANTITY_NOT_FOUND'
  | 'DIMENSION_NOT_FOUND'
  | 'AHSP_NOT_FOUND'
  | 'PRICE_NOT_FOUND'
  | 'CONFLICT'
  | 'AMBIGUOUS'
  | 'UNREADABLE'
  | 'SCALE_UNVERIFIED'
  | 'EVIDENCE_REQUIRED'
  | 'CUSTOM_ITEM_REVIEW_REQUIRED';

export interface DimensionProvenance {
  value?: number;
  unit?: string;
  sourceEvidenceId?: string;
  sourcePage?: number;
  extractionMethod?: string;
  confidence?: number;
  status?: 'CONFIRMED' | 'MISSING_DATA' | 'AMBIGUOUS' | 'CONFLICT';
}

export interface DEDStructuredDimensions {
  length?: DimensionProvenance;
  width?: DimensionProvenance;
  height?: DimensionProvenance;
  depth?: DimensionProvenance;
  thickness?: DimensionProvenance;
  diameter?: DimensionProvenance;
  area?: DimensionProvenance;
  volume?: DimensionProvenance;
  count?: DimensionProvenance;
}

export interface DEDSourceInventoryItem {
  sourceId: string; // SHA-256 hash
  fileHash: string; // SHA-256 hash
  sourceType: 'pdf' | 'image' | 'drawing' | 'document' | 'spreadsheet';
  sourceName: string;
  pageCount: number;
  fileSizeBytes: number;
  status: 'VERIFIED' | 'UNREADABLE' | 'UNVERIFIED' | 'ERROR';
  classification: DocumentClassification;
  scale?: string;
  scaleVerified: boolean;
  uploadedAt: string;
  rawText?: string;
  fileBuffer?: ArrayBuffer | Uint8Array | string;
}

export interface DrawingElementDetection {
  id: string;
  category: 'Wall' | 'Door' | 'Window' | 'Column' | 'Beam' | 'Slab' | 'Foundation' | 'Room' | 'Stair' | 'Roof' | string;
  description: string;
  sourceId: string;
  sourceName: string;
  page: number;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: WorkItemConfidence;
  evidence: AIEvidence;
}

export interface DimensionExtraction {
  length?: number;
  width?: number;
  height?: number;
  thickness?: number;
  count?: number;
  diameter?: number;
  unit: SupportedUnit;
  rawSnippets: string[];
  scaleVerified: boolean;
  notes?: string;
  provenance?: DEDStructuredDimensions;
}

export interface DeterministicCalculationResult {
  formula: string;
  computedValue: number;
  unit: SupportedUnit;
  calculationType: 'VOLUME_3D' | 'AREA_2D' | 'PERIMETER_1D' | 'COUNT';
}

export type AHSPSourceType =
  | 'OFFICIAL_AHSP'
  | 'PROJECT_AHSP'
  | 'COMPANY_AHSP'
  | 'REFERENCE'
  | 'AI_CUSTOM';

export type AHSPMatchClassification =
  | 'EXACT_MATCH'
  | 'SEMANTIC_MATCH'
  | 'NOT_FOUND';

export type ValueSourceType =
  | 'OFFICIAL_AHSP'
  | 'PROJECT_PRICE'
  | 'COMPANY_PRICE'
  | 'REFERENCE'
  | 'AI_ESTIMATE'
  | 'USER_INPUT';

export interface AICustomItem {
  code: string;
  name: string;
  unit: string;
  reason: string;
  sourceEvidence: AIEvidence[];
  generatedBy: 'AI';
  requiresUserConfirmation: boolean;
  baseUnitPrice?: number;
  components?: Array<{
    name: string;
    coefficient: number;
    unit: string;
    unitPrice?: number;
    sourceType: ValueSourceType;
  }>;
}

export interface AIWarning {
  code: string;
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  sourceReference?: string;
}

export interface AIUnresolvedItem {
  itemDescription: string;
  reason: string;
  missingField: 'QUANTITY' | 'AHSP' | 'PRICE' | 'SCALE' | 'SPECIFICATION';
}

export interface AIWorkItem {
  id: string;
  category: string;
  workName: string;
  elementType?: string;
  material?: string;
  specification?: string;
  dimensions?: {
    length?: number;
    width?: number;
    depth?: number;
    height?: number;
    diameter?: number;
    thickness?: number;
    count?: number;
  };
  explicitQuantity?: number;
  unit?: string;
  calculationIntent?: string;
  sourceReferences: string[];
  evidenceIds: string[];
  confidence: number;
  ahspResolution?: {
    status: AHSPMatchClassification;
    ahspId?: string;
    matchReason?: string;
    version?: string;
    effectiveDate?: string;
    sourceType?: AHSPSourceType;
  };
  customItem?: {
    required: boolean;
    reason?: string;
    code?: string;
    provenance?: Record<string, ValueSourceType>;
  };
}

export interface AIConstructionInterpretation {
  sourceId: string;
  documentType: string;
  projectContext?: {
    projectName?: string;
    projectNumber?: string;
    location?: string;
  };
  workItems: AIWorkItem[];
  evidence: AIEvidence[];
  warnings: AIWarning[];
  unresolvedItems: AIUnresolvedItem[];
  analysisStatus: 'COMPLETE' | 'PARTIAL' | 'NEEDS_REVIEW';
}

export interface AHSPMappingCandidate {
  ahspCode: string;
  name: string;
  unit: string;
  baseUnitPrice?: number;
  matchScore: number;
  reason: string;
  specificationMatch: boolean;
  isRecommended: boolean;
  matchClassification?: AHSPMatchClassification;
  sourceType?: AHSPSourceType;
  version?: string;
  effectiveDate?: string;
  sourceReference?: string;
}

export interface PriceSourceResolution {
  unitPrice?: number;
  priceSource: 'PROJECT_PRICE' | 'COMPANY_PRICE' | 'CONFIGURED_PRICE_DB' | 'REFERENCE_PRICE' | 'PRICE_NOT_FOUND';
  sourceDetail?: string;
  currency: string;
  isOfficial: boolean;
  valueSourceType?: ValueSourceType;
}

export interface DEDWorkItem {
  id: string;
  projectId: string;
  name: string;
  category: string;
  specification?: string;
  quantity?: number;
  unit?: SupportedUnit | string;
  sourceIds: string[];
  evidence: AIEvidence[];
  confidence: WorkItemConfidence;
  status: WorkItemStatus;

  // Extracted geometric dimensions & count
  dimensions?: DimensionExtraction;

  // EZRAB Deterministic calculation result
  calculation?: DeterministicCalculationResult;

  // AHSP mapping
  ahspCode?: string;
  ahspName?: string;
  ahspMappingReason?: string;
  ahspCandidates?: AHSPMappingCandidate[];
  ahspSourceType?: AHSPSourceType;
  ahspMatchStatus?: AHSPMatchClassification;

  // Phase 11 AI Custom Item Fallback
  isCustomItem?: boolean;
  customItemDetails?: AICustomItem;

  // Price resolution
  unitPrice?: number;
  totalPrice?: number;
  priceSource?: PriceSourceResolution;
  priceProvenance?: ValueSourceType;

  // User override tracking (Section 21)
  isUserOverridden?: boolean;
  originalAiValue?: {
    name?: string;
    description?: string;
    quantity?: number;
    volume?: number;
    unit?: string;
    ahspCode?: string;
    unitPrice?: number;
    specification?: string;
  };

  // Conflict details if multiple sources disagree
  conflictDetails?: {
    sourceA: { name: string; value: string | number; page?: number };
    sourceB: { name: string; value: string | number; page?: number };
    description: string;
    actionRequired: string;
  };
}

export interface DEDRabDraftRow {
  no: number;
  id: string;
  workItemId: string;
  category: string;
  description: string;
  volume: number;
  unit: string;
  ahspCode?: string;
  ahspName?: string;
  unitPrice?: number;
  amount: number;
  priceSourceText?: string;
  evidence: AIEvidence;
  confidence: WorkItemConfidence;
  status: WorkItemStatus;
  isUserOverridden?: boolean;
  originalAiValue?: {
    name?: string;
    description?: string;
    quantity?: number;
    volume?: number;
    unit?: string;
    ahspCode?: string;
    unitPrice?: number;
    specification?: string;
  };
  conflictDetails?: {
    sourceA: { name: string; value: string | number; page?: number };
    sourceB: { name: string; value: string | number; page?: number };
    description: string;
    actionRequired: string;
  };
  calculationDetails?: {
    dimensions: string;
    formula: string;
    result: number;
    unit: string;
  };
  classification?: ProviderExecutionClassification;

  // Phase 11 additions
  ahspSourceType?: AHSPSourceType;
  ahspMatchStatus?: AHSPMatchClassification;
  isCustomItem?: boolean;
  customItemCode?: string;
  priceProvenance?: ValueSourceType;
  customItemReason?: string;
}

export interface MissingDataSummary {
  missingAhspCount: number;
  missingPriceCount: number;
  missingQuantityCount: number;
  conflictCount: number;
  unreadableCount: number;
  customItemCount?: number;
  items: Array<{
    workItemId: string;
    name: string;
    missingFields: string[];
    conflictNotice?: string;
    isCustomCandidate?: boolean;
  }>;
}

export interface DEDRabDraftSummary {
  draftId: string;
  projectId: string;
  projectName: string;
  sourceInventory: DEDSourceInventoryItem[];
  detectedWorkItems: DEDWorkItem[];
  rows: DEDRabDraftRow[];
  totalItems: number;
  verifiedCount: number;
  needsReviewCount: number;
  missingCount: number;
  conflictCount: number;
  subtotal: number;
  ppnPercent: number;
  ppnAmount: number;
  grandTotal: number;
  missingDataSummary: MissingDataSummary;
  analysisStatus?: 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'NO_ITEMS_FOUND';
  jobId?: string;
  diagnostic?: DedProcessingJob['diagnostic'];
  createdAt: string;
}

export interface RabMutationDiff {
  projectId: string;
  existingItemsCount: number;
  draftItemsCount: number;
  newItemsCount: number;
  existingTotal: number;
  newTotal: number;
  deltaTotal: number;
  newItems: Array<{
    no: number;
    description: string;
    volume: number;
    unit: string;
    unitPrice: number;
    amount: number;
    ahspCode?: string;
  }>;
}

// =============================================================================
// SPREADSHEET WORKSPACE 9-SHEET MODELS
// =============================================================================

export interface SheetProjectRow {
  field: string;
  value: string;
  lastUpdated: string;
}

export interface SheetDedSourceRow {
  sourceId: string;
  fileName: string;
  fileHash: string;
  type: string;
  pageCount: number;
  scale: string;
  status: string;
  uploadedAt: string;
}

export interface SheetDedItemRow {
  no: number;
  id: string;
  item: string;
  category: string;
  unit: string;
  sourcePage: string;
  evidence: string;
  status: string;
  confidence: string;
}

export interface SheetQtoRow {
  no: number;
  itemId: string;
  item: string;
  formula: string;
  inputs: string;
  quantity: number;
  unit: string;
  evidenceIds: string;
  calculationStatus: string;
}

export interface SheetAhspRow {
  no: number;
  dedItemId: string;
  dedItem: string;
  ahspCode: string;
  ahspName: string;
  matchType: string;
  unit: string;
  priceSource: string;
  price: number;
  status: string;
}

export interface SheetRabRow {
  no: number;
  id: string;
  item: string;
  ahsp: string;
  volume: number;
  unit: string;
  unitPrice: number;
  total: number;
  status: string;
}

export interface SheetCustomItemRow {
  no: number;
  id: string;
  item: string;
  reason: string;
  evidence: string;
  suggestedUnit: string;
  price: number | string;
  status: string;
  reviewRequired: boolean;
}

export interface SheetReviewRow {
  metric: string;
  count: number;
  notes: string;
}

export interface SheetEvidenceRow {
  evidenceId: string;
  page: number;
  type: string;
  rawText: string;
  value: string | number;
  unit: string;
  boundingBox: string;
  confidence: number;
}

export interface SpreadsheetWorkspaceSync {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  lastSyncAt: string;
  sourceRevision: number;
  syncStatus: 'SYNC_TO_SHEETS' | 'REFRESH_FROM_EZRAB' | 'CONFLICT_DETECTED';
  conflictMessage?: string;
  sheets: {
    sheet01_project: SheetProjectRow[];
    sheet02_ded_source: SheetDedSourceRow[];
    sheet03_ded_items: SheetDedItemRow[];
    sheet04_qto: SheetQtoRow[];
    sheet05_ahsp: SheetAhspRow[];
    sheet06_rab: SheetRabRow[];
    sheet07_custom_items: SheetCustomItemRow[];
    sheet08_review: SheetReviewRow[];
    sheet09_evidence: SheetEvidenceRow[];
  };
}

export type DedJobStatus =
  | 'QUEUED'
  | 'READING_DOCUMENT'
  | 'RENDERING_PAGES'
  | 'ANALYZING_PAGES'
  | 'EXTRACTING_EVIDENCE'
  | 'INTERPRETING_DED'
  | 'CALCULATING_QTO'
  | 'MATCHING_AHSP'
  | 'PREPARING_REVIEW'
  | 'SYNCING_SPREADSHEET'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIAL';

export interface DedProcessingJob {
  id: string;
  projectId: string;
  sourceFileId: string;
  status: DedJobStatus;
  currentPage?: number;
  totalPages?: number;
  pagesAnalyzed: number;
  evidenceCount: number;
  workItemCount: number;
  calculatedItemCount: number;
  ahspMatchedCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  diagnostic?: {
    modelUsed?: string;
    providerUsed?: string;
    stageDetails?: string;
    latencyMs?: number;
    rawTokensUsed?: number;
  };
}

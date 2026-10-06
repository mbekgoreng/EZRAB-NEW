/**
 * EZRAB DED -> RAB V2 Canonical Pipeline Types
 *
 * Strict Principles:
 * - Real visual reading of rendered PDF / image pages.
 * - Evidence-first: NO value exists without an explicit Evidence record.
 * - AI never guesses: missing values are flagged as MISSING_DATA.
 * - Core is the ONLY calculator: AI provides geometry/parameters, EZRAB Core calculates.
 * - Official AHSP matching: custom items marked AI_CUSTOM, never fabricated as official.
 * - Prices from authorized sources only; otherwise PRICE_NOT_FOUND.
 * - Google Sheets is a synchronized workspace; EZRAB is single source of truth.
 */

export type DocumentStatus =
  | 'UPLOADED'
  | 'INGESTING'
  | 'SOURCE_VERIFIED'
  | 'FAILED'
  | 'UNREADABLE';

export type PageStatus =
  | 'PENDING'
  | 'RENDERED'
  | 'ANALYZED'
  | 'FAILED';

export type DrawingType =
  | 'COVER'
  | 'SITE_PLAN'
  | 'FLOOR_PLAN'
  | 'ROOF_PLAN'
  | 'ELEVATION'
  | 'SECTION'
  | 'DETAIL'
  | 'STRUCTURAL_PLAN'
  | 'STRUCTURAL_DETAIL'
  | 'DOOR_WINDOW_SCHEDULE'
  | 'FINISH_SCHEDULE'
  | 'SPECIFICATION'
  | 'TABLE'
  | 'OTHER';

export interface DocumentPage {
  id: string;
  documentId: string;
  pageNumber: number; // 1-indexed
  width: number;
  height: number;
  imageDataUrl: string; // Base64 data URI (image/png or image/jpeg)
  imageMimeType?: string;
  renderScale?: number;
  renderDurationMs?: number;
  imageByteSize?: number;
  base64Length?: number;
  nonEmptyPixelCheck?: boolean;
  nativeText?: string;
  drawingType: DrawingType;
  drawingTitle?: string;
  scale?: string;
  scaleVerified: boolean;
  status: PageStatus;
  detectedElements?: string[];
  notes?: string[];
  gridLines?: string[];
  dimensionsFound?: number;
}

export interface SourceDocument {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  pageCount: number;
  createdAt: string;
  status: DocumentStatus;
  pages: DocumentPage[];
  error?: string;
}

export type EvidenceType =
  | 'DIMENSION'
  | 'NOTE'
  | 'SPECIFICATION'
  | 'SCHEDULE_ROW'
  | 'TITLE_BLOCK'
  | 'MATERIAL'
  | 'COUNT'
  | 'GRID'
  | 'SYMBOL';

export interface BoundingBox {
  x: number; // 0..1 normalized or px
  y: number;
  width: number;
  height: number;
}

export interface EvidenceRecord {
  id: string; // e.g. "EV-001"
  sourceDocumentId: string;
  sourceFileName: string;
  pageNumber: number;
  type: EvidenceType;
  content: string;
  unit?: string;
  confidence: number;
  boundingBox?: BoundingBox;
  cropImageDataUrl?: string;
  references?: string[]; // Cross-page tags e.g. ["F1", "K1", "S-01"]
  rawContext?: string;
}

export type WorkItemStatus =
  | 'CONFIRMED'
  | 'PARTIAL'
  | 'MISSING_DATA'
  | 'AMBIGUOUS'
  | 'CONFLICT'
  | 'UNSUPPORTED'
  | 'UNRESOLVED'
  | 'EZRAB_STANDARD'
  | 'NEEDS_DIMENSION'
  | 'NEEDS_AHSP'
  | 'NEEDS_PRICE';

// =========================================================================
// SEMANTIC ENTITY & FACT CLASSIFICATION TYPES (ROOT-CAUSE HOTFIX)
// =========================================================================

export type CanonicalObjectType =
  | 'ROOM_LABEL'
  | 'TITLE'
  | 'HEADER'
  | 'NOTE'
  | 'DIMENSION'
  | 'ELEVATION'
  | 'GRID'
  | 'AXIS'
  | 'LEGEND'
  | 'DETAIL_REFERENCE'
  | 'STRUCTURAL_REFERENCE'
  | 'DOOR_REFERENCE'
  | 'WINDOW_REFERENCE'
  | 'MATERIAL_REFERENCE'
  | 'CONSTRUCTION_WORK'
  | 'UNKNOWN';

export type DedEntityType =
  | 'CONSTRUCTION_WORK'
  | 'ROOM_LABEL'
  | 'STRUCTURAL_LABEL'
  | 'MATERIAL_LABEL'
  | 'DIMENSION'
  | 'ELEVATION'
  | 'DETAIL_REFERENCE'
  | 'DRAWING_ANNOTATION'
  | 'SYMBOL'
  | 'GRID_AXIS'
  | 'TITLE_HEADER'
  | 'LEGEND'
  | 'NOTE'
  | 'UNKNOWN'
  | CanonicalObjectType;

export type CanonicalWorkCategory =
  | 'PRELIMINARY'
  | 'EARTHWORK'
  | 'FOUNDATION'
  | 'STRUCTURE'
  | 'WALL'
  | 'DOOR_WINDOW'
  | 'FLOOR'
  | 'CEILING'
  | 'ROOF'
  | 'PAINTING'
  | 'ELECTRICAL'
  | 'PLUMBING'
  | 'SANITARY'
  | 'EXTERNAL'
  | 'OTHER';

export type QuantitySource =
  | 'EXTRACTED'
  | 'CALCULATED'
  | 'USER_INPUT'
  | 'SCHEDULE'
  | 'MEASURED'
  | 'INFERRED'
  | 'DED_DIMENSION'
  | 'DERIVED_RULE';

export interface DedFactModel {
  id: string;
  document_id: string;
  page: number;
  region?: string;
  raw_text: string;
  normalized_text: string;
  fact_type: CanonicalObjectType | DedEntityType;
  value?: number | string | null;
  unit?: string;
  source: string;
  confidence: number;
}

export interface DedObjectModel {
  id?: string;
  objectId?: string;
  ded_fact_id?: string;
  canonicalType?: CanonicalObjectType;
  object_type?: CanonicalObjectType;
  name?: string;
  label?: string;
  reference_code?: string;
  specification?: string;
  dimensions?: Record<string, number | null>;
  context?: Record<string, any>;
  location?: string;
  evidenceId?: string;
  pageNumber?: number;
  source_page?: number;
  source_region?: string;
  confidence?: number;
}

export interface ConstructionWorkModel {
  id?: string;
  workId?: string;
  objectId?: string;
  ded_object_id?: string;
  wbsCategory?: CanonicalWorkCategory;
  work_category?: CanonicalWorkCategory;
  workPackage?: string;
  work_package?: string;
  workItem?: string;
  work_item?: string;
  description?: string;
  specification?: string;
  unit?: string;
  quantity?: number | null;
  quantitySource?: QuantitySource;
  quantity_source?: QuantitySource;
  rab_eligible?: boolean;
  status?: ValidationStatus;
  canonicalWorkId?: string;
  isDerived?: boolean;
}

export interface DedFact {
  id?: string;
  sourcePage?: number;
  pageNumber?: number;
  sourceRegion?: string;
  rawText?: string;
  normalizedText?: string;
  entityType?: DedEntityType;
  rabEligible?: boolean;
  confidence?: number;
  evidenceId?: string;
  boundingRegion?: any;
  context?: {
    room?: string;
    level?: string;
    grid?: string;
    tag?: string;
  };
}

export type ValidationStatus =
  | 'READY'
  | 'MISSING_QTY'
  | 'NO_AHSP'
  | 'NO_PRICE'
  | 'AMBIGUOUS'
  | 'CONFLICT'
  | 'SPECIFICATION_MISMATCH'
  | 'UNIT_MISMATCH'
  | 'AHSP_VERSION_MISMATCH'
  | 'COMPONENT_MISSING'
  | 'RESOURCE_MISSING'
  | 'SOURCE_TRACE_MISSING'
  | 'NEEDS_REVIEW'
  | 'INVALID'
  | 'EXTRACTED'
  | 'CLASSIFIED'
  | 'MATCHED'
  | 'VERIFIED'
  | 'MISSING_QUANTITY'
  | 'MISSING_AHSP'
  | 'MISSING_PRICE'
  | 'BLOCKED'
  | 'UNRESOLVED';

export interface AhspProvenance {
  workDescription: string;
  matchedAhspCode: string;
  matchedAhspName: string;
  ahspVersion: string;
  field: string;
  officialUnit: string;
  specificationMatch: {
    dedSpec: string;
    ahspSpec: string;
    isCompatible: boolean;
  };
  unitMatch: {
    dedUnit: string;
    ahspUnit: string;
    isCompatible: boolean;
  };
  matchReasons: string[];
  sourceDocumentTrace: {
    fileName: string;
    pageNumber: number;
    evidenceId: string;
  };
  priceVerification: {
    source: string;
    verified: boolean;
    unitPrice: number | null;
  };
  databaseVerified?: boolean;
  priceSource?: string;
}

export type WorkItemSourceType =
  | 'DED_VERIFIED'
  | 'DED_DERIVED'
  | 'CONSTRUCTION_RULE'
  | 'USER_ADDED';

export type MissingDataCategory =
  | 'MISSING_DIMENSION'
  | 'MISSING_QUANTITY'
  | 'MISSING_MATERIAL'
  | 'MISSING_SPECIFICATION'
  | 'MISSING_REFERENCE'
  | 'MISSING_AHSP'
  | 'MISSING_PRICE';

export type ResolutionMethod =
  | 'DIRECT_ANNOTATION'
  | 'CROSS_PAGE_CORRELATION'
  | 'SCHEDULE_LOOKUP'
  | 'GEOMETRIC_RELATION'
  | 'USER_RESOLVED';

export interface ResolvedDimension {
  value: number;
  unit: string;
  sourcePage: number;
  evidenceId: string;
  resolutionMethod: ResolutionMethod;
  confidence: number;
  notes?: string;
}

export type ElementCategory =
  | 'FOUNDATION'
  | 'STRUCTURE_COLUMN'
  | 'STRUCTURE_BEAM'
  | 'STRUCTURE_SLAB'
  | 'WALL'
  | 'DOOR_WINDOW'
  | 'ROOF'
  | 'FLOOR_FINISH'
  | 'CEILING'
  | 'PAINTING'
  | 'PLASTER'
  | 'SANITARY'
  | 'MEP'
  | 'SITEWORK'
  | 'OTHER';

export interface DimensionValue {
  value: number | null;
  unit: string;
  evidenceId?: string;
  isMissing?: boolean;
}

export interface DedWorkItemDimensions {
  length?: DimensionValue;
  width?: DimensionValue;
  height?: DimensionValue;
  thickness?: DimensionValue;
  count?: DimensionValue;
  area?: DimensionValue;
  diameter?: DimensionValue;
  slope?: DimensionValue;
}

export interface DedWorkItemGeometry {
  shape: 'RECTANGULAR' | 'TRAPEZOIDAL' | 'CYLINDRICAL' | 'POLYGONAL' | 'LINEAR' | 'COUNT';
  formulaKey?: string;
  notes?: string;
}

export type QtoStatus = 'CALCULATED' | 'MISSING_DATA' | 'AMBIGUOUS' | 'FAILED';

export interface DedQtoResult {
  formula: string;
  quantity: number | null;
  unit: string;
  status: QtoStatus;
  missingParameters?: string[];
  calculationBreakdown?: string;
}

export type SupportedUnit = 'm' | 'm2' | 'm3' | 'kg' | 'ton' | 'bh' | 'unit' | 'ttk' | 'ls' | 'set' | 'm1' | string;

export type AhspMatchType = 'EXACT_MATCH' | 'SEMANTIC_MATCH' | 'AMBIGUOUS' | 'AI_CUSTOM' | 'NOT_FOUND';

export interface DedAhspMatch {
  code: string;
  name: string;
  unit: string;
  matchType: AhspMatchType;
  source: string; // e.g. "PUPR 2026", "Bina Marga 2026", "AI_CUSTOM"
  confidence: number;
  coefficientSummary?: string;
  /**
   * Present when `matchType === 'AMBIGUOUS'`: several official AHSP items are equally
   * compatible and the estimator must choose. `code` is '' in that case — an AMBIGUOUS
   * result NEVER carries a selected code, so it can never masquerade as a MATCHED one.
   */
  candidates?: Array<{ code: string; name: string; unit: string }>;
}

export type PriceSourceType =
  | 'OFFICIAL_AHSP'
  | 'OFFICIAL_DATABASE'
  | 'PROJECT_PRICE'
  | 'COMPANY_PRICE'
  | 'REFERENCE_PRICE'
  | 'EXTERNAL_DISCOVERY'
  | 'AI_ESTIMATE'
  | 'MIXED'
  | 'PRICE_NOT_FOUND'
  | 'PRICE_UNRESOLVED';

export type PriceStatusCode =
  | 'PRICE_INTERNAL'
  | 'PRICE_EXTERNAL'
  | 'PRICE_AI_ESTIMATE'
  | 'PRICE_MIXED'
  | 'PRICE_REVIEW_REQUIRED'
  | 'PRICE_UNRESOLVED'
  | 'RESOLVED'
  | 'REFERENCE'
  | 'MANUAL'
  | 'NOT_FOUND';

export interface AiPriceEstimationRecord {
  estimated_price: number;
  unit: string;
  source_type: 'AI_ESTIMATE';
  price_source_type?: 'AI_ESTIMATE';
  status: 'ESTIMATED';
  confidence: number | 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  basis: string[] | string;
  inputs: {
    region?: string;
    period?: string;
    specification?: string;
    related_prices?: any[];
    [key: string]: any;
  } | string[];
  calculation_method: string;
  range: {
    low: number;
    central: number;
    high: number;
  };
  model_used: string;
  complexity_factors?: string[];
  comparable_references?: Array<{
    name: string;
    code?: string;
    price: number;
    unit: string;
    source: string;
  }>;
  self_check?: {
    is_unit_correct: boolean;
    is_spec_understood: boolean;
    is_region_known: boolean;
    is_period_known: boolean;
    comparable_prices_available: boolean;
    comparable_prices_valid: boolean;
    is_conversion_applied: boolean;
    is_plausible: boolean;
    is_confidence_appropriate: boolean;
    no_fabricated_source: boolean;
    passed: boolean;
  };
  created_at: string;
}

export interface DedPriceComponent {
  type: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  code?: string;
  name: string;
  unit: string;
  coefficient: number;
  unitPrice: number;
  totalPrice: number;
  priceSource?: PriceSourceType;
  priceStatus?: PriceStatusCode;
  isEstimated?: boolean;
  estimationRecord?: AiPriceEstimationRecord;
}

export interface DedPriceResult {
  unitPrice: number | null;
  totalPrice: number | null;
  priceSource: PriceSourceType;
  priceStatus?: PriceStatusCode;
  isOfficial: boolean;
  currency: string;
  sourceDetail?: string;
  materialPrice?: number | null;
  laborPrice?: number | null;
  equipmentPrice?: number | null;
  subtotalMaterial?: number | null;
  subtotalLabor?: number | null;
  subtotalEquipment?: number | null;
  components?: DedPriceComponent[];
  estimationRecord?: AiPriceEstimationRecord;
  range?: {
    low: number;
    central: number;
    high: number;
  };
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceRating?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DedWorkItem {
  id: string; // e.g. "DED-001"
  /** Stable identity shared by every OCR occurrence of one physical work. */
  canonicalWorkId?: string;
  projectId: string;
  sourceDocumentId: string;
  name: string;
  category: ElementCategory;
  status: WorkItemStatus;
  sourceType?: WorkItemSourceType;
  source?: 'DED' | 'CALCULATED' | 'USER' | 'DATABASE' | 'AI_SUGGESTION';
  quantity?: number | null;
  quantityStatus?: 'CONFIRMED' | 'MISSING_DATA' | 'AMBIGUOUS' | 'CONFLICT';
  evidenceIds: string[];
  sourcePages: number[];
  dimensions: DedWorkItemDimensions;
  geometry: DedWorkItemGeometry;
  unit: string;
  calculationInputs: Record<string, number | null>;
  confidence: number;
  assumptions: string[];
  warnings: string[];
  materialSpec?: string;
  qto?: DedQtoResult;
  ahspCode?: string;
  ahspMatch?: DedAhspMatch;
  ahspStatus?: 'MATCHED' | 'CANDIDATE' | 'AMBIGUOUS' | 'AI_CUSTOM' | 'NOT_FOUND';
  price?: DedPriceResult;
  priceStatus?: PriceStatusCode;
  priceEstimation?: AiPriceEstimationRecord;
  resolvedEstimatedResources?: Array<{ name: string; type: string; price: number; estimationRecord: AiPriceEstimationRecord }>;
  userApproved?: boolean;
  missingDataCategories?: MissingDataCategory[];
  resolvedDimensions?: Record<string, ResolvedDimension>;
  entityType?: DedEntityType;
  rabEligible?: boolean;
  validationStatus?: ValidationStatus;
  validationErrors?: string[];
  roomContext?: string;
  provenanceDetail?: AhspProvenance;
  candidateAhspList?: DedAhspMatch[];
  isUserCustomItem?: boolean;
  dedFact?: DedFact;
  workCategory?: CanonicalWorkCategory;
  workPackage?: string;
  workItem?: string;
  quantitySource?: QuantitySource;
  dedObject?: DedObjectModel;
  constructionWork?: ConstructionWorkModel;
  missingResources?: Array<{ code?: string; name: string; type: string }>;
  priceSearchScopes?: { project: boolean; workspace: boolean; regional: boolean; hsd2026: boolean; custom: boolean };
  lineage?: DedAiWorkItemLineage;
  aiWorkItem?: DedAiWorkItem;
  fieldProvenance?: any;
  provenance?: any;
  granularConfidence?: any;
  confidenceScore?: any;
  executionMode?: 'AI_RAB' | 'EZRAB_STANDARD';
  totalAmount?: number;
}

export type CanonicalQuantityStatus =
  | 'FOUND_DIRECT'
  | 'CALCULATED'
  | 'CROSS_PAGE_CALCULATED'
  | 'PARTIAL'
  | 'MISSING_QTY'
  | 'CONFLICT'
  | 'NOT_APPLICABLE';

export interface DedAiWorkItemLineage {
  dedDocumentId?: string;
  rabRowIndex?: number;
  workItemName: string;
  quantityEvidence: string[];
  sourcePages: number[];
  ahspCode?: string;
  ahspName?: string;
  ahspComponents?: any[];
  priceSource: string;
  priceStatus: string;
}

export interface DedAiWorkItem {
  id: string;
  workName: string;
  category: ElementCategory;
  description: string;
  specification: string;
  location?: string;
  sourcePages: number[];
  sourceEvidence: string[];
  dimensions: {
    length?: number | null;
    width?: number | null;
    height?: number | null;
    thickness?: number | null;
    diameter?: number | null;
    count?: number | null;
    area?: number | null;
  };
  quantity: {
    value: number | null;
    unit: string;
    formula: string;
    source: string;
    confidence: number;
    status: CanonicalQuantityStatus;
  };
  materials: string[];
  constructionMethod?: string;
  candidateAhsp?: DedAhspMatch[];
  selectedAhsp?: DedAhspMatch | null;
  price?: number | null;
  priceSource: PriceSourceType;
  status: WorkItemStatus;
  lineage?: DedAiWorkItemLineage;
}

export type DedRabItem = DedWorkItem;

// =========================================================================
// INTERMEDIATE REPRESENTATION LAYER (DED BUILDING MODEL)
// =========================================================================

export interface DedLevel {
  id: string; // e.g. "LVL-1"
  name: string; // "Lantai 1", "Lantai 2", "Lantai Atap"
  elevationMeters: number; // e.g. 0.0, 3.5, 7.0
  heightMeters?: number;
  sourcePages: number[];
  evidenceIds: string[];
}

export interface DedSpace {
  id: string; // e.g. "SP-001"
  name: string; // "Kamar Tidur Utama", "Kamar Mandi 1", "Dapur", "Carport", "Ruang Tamu"
  level: string; // "Lantai 1"
  dimensions?: { length?: number; width?: number; height?: number };
  area?: number;
  perimeter?: number;
  evidenceIds: string[];
  sourcePages: number[];
  confidence: number;
  notes?: string;
}

export interface DedConstructionElement {
  id: string; // e.g. "EL-001"
  type: string; // "WALL", "COLUMN", "BEAM", "SLAB", "FOUNDATION", "DOOR", "WINDOW", "ROOF", "SANITARY"
  tag?: string; // "K1", "B1", "P1", "J1", "Pondasi P1"
  category: ElementCategory;
  name: string;
  level?: string;
  spaceId?: string;
  material?: string;
  specification?: string;
  dimensions: Record<string, number | null>;
  count?: number;
  sourcePages: number[];
  evidenceIds: string[];
  isDerived?: boolean;
}

export interface DedMaterialSpecification {
  category: ElementCategory;
  name: string;
  specification: string;
  thicknessMm?: number;
  gradeOrType?: string;
  sourcePage: number;
  evidenceId: string;
}

export interface CrossPageReference {
  tag: string; // e.g. "K1", "P1", "As 1-4"
  drawingSource: string; // e.g. "Denah Lantai 1"
  detailSource?: string; // e.g. "Detail Kolom & Balok"
  sourcePages: number[];
}

export interface DedBuildingModel {
  projectId: string;
  buildingInfo: {
    type?: string;
    totalEstimatedArea?: number;
    levelsCount?: number;
    orientation?: string;
    foundationType?: string;
    structureType?: string;
  };
  levels: DedLevel[];
  spaces: DedSpace[];
  dimensions: ResolvedDimension[];
  elements: DedConstructionElement[];
  materials: DedMaterialSpecification[];
  specifications: string[];
  references: CrossPageReference[];
  evidences: EvidenceRecord[];
  createdAt: string;
}

export interface RabCoverageReport {
  dedCoverage: number;       // % items with explicit verified DED evidence (0..100)
  qtoCoverage: number;       // % items with calculated quantity (0..100)
  ahspCoverage: number;      // % items with matched official/standard AHSP (0..100)
  priceCoverage: number;     // % items with resolved unit price (0..100)
  completenessScore: number; // overall weighted coverage (0..100)
}

export type PipelineStage =
  | 'QUEUED'
  | 'INGESTING'
  | 'RENDERING'
  | 'ANALYZING'
  | 'EXTRACTING_EVIDENCE'
  | 'BUILDING_ITEMS'
  | 'CALCULATING_QTO'
  | 'MATCHING_AHSP'
  | 'RESOLVING_PRICES'
  | 'READY_FOR_REVIEW'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED';

export type PipelineErrorCode =
  | 'AI_PROVIDER_ERROR'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_JSON'
  | 'AI_EMPTY_RESPONSE'
  | 'PDF_RENDER_ERROR'
  | 'IMAGE_ENCODE_ERROR'
  | 'NO_EVIDENCE'
  | 'NO_DED_ITEMS'
  | 'AHSP_NOT_FOUND'
  | 'PRICE_NOT_FOUND'
  | 'SHEETS_SYNC_ERROR'
  | 'MODEL_NOT_AVAILABLE';

export interface StructuredPipelineError {
  code: PipelineErrorCode;
  requestId?: string;
  pageNumber?: number;
  stage: PipelineStage;
  message: string;
  cause?: string;
}

export interface RawAiTelemetryRecord {
  requestId: string;
  pageNumber: number;
  pass: number;
  model: string;
  httpStatus: number;
  durationMs: number;
  inputImageBytes: number;
  outputChars: number;
  parsed: boolean;
  error?: string;
  rawContent: string;
}

export type DedProcessingMode = 'FAST' | 'ADVANCED' | 'STANDARD' | 'DETAIL';

export type DedPipelineEventType =
  | 'DED_INGEST_STARTED'
  | 'DED_INGEST_COMPLETED'
  | 'PAGE_RENDER_STARTED'
  | 'PAGE_RENDER_COMPLETED'
  | 'AI_ANALYSIS_STARTED'
  | 'AI_PAGE_COMPLETED'
  | 'EVIDENCE_CREATED'
  | 'DED_ITEM_CREATED'
  | 'QTO_STARTED'
  | 'QTO_COMPLETED'
  | 'AHSP_STARTED'
  | 'AHSP_COMPLETED'
  | 'PRICE_STARTED'
  | 'PRICE_COMPLETED'
  | 'VALIDATION_STARTED'
  | 'VALIDATION_COMPLETED'
  | 'REVIEW_READY'
  | 'JOB_FAILED';

export interface PipelineProgressEvent {
  jobId: string;
  projectId: string;
  stage: PipelineStage;
  eventType?: DedPipelineEventType;
  mode?: DedProcessingMode;
  provider?: string;
  reasoningLevel?: 'low' | 'medium' | 'high';
  currentPage: number;
  totalPages: number;
  pagesAnalyzed: number;
  completedPageIndex?: number;
  renderedPages?: number;
  nonEmptyPages?: number;
  pagesSentToAi?: number;
  evidenceCount: number;
  dedItemCount: number;
  qtoCount: number;
  ahspCount: number;
  priceCount: number;
  priceResolvedCount?: number;
  priceReferenceCount?: number;
  aiModel: string;
  aiRequests: number;
  aiSuccessful: number;
  aiFailed: number;
  cacheHits?: number;
  cacheMisses?: number;
  visionRequests?: number;
  textRequests?: number;
  batchRequests?: number;
  fastPreviewMode?: boolean;
  stageDetails: string;
  error?: string;
  durationMs: number;
  fallbackCount?: number;
  rawResponses?: RawAiTelemetryRecord[];
  latestItem?: DedWorkItem;
  latestFindings?: Array<{ name: string; status: string; pageNumber: number }>;
}

export interface ReviewSummary {
  totalItemsFound: number;
  confirmedCount: number;
  partialCount: number;
  missingDataCount: number;
  ambiguousCount: number;
  conflictCount: number;
  unsupportedCount: number;
  totalEstimatedRab: number;
  currency: string;
  // Granular Missing Data Metrics
  missingDimensionCount?: number;
  missingQuantityCount?: number;
  missingMaterialCount?: number;
  missingSpecificationCount?: number;
  missingReferenceCount?: number;
  missingAhspCount?: number;
  missingPriceCount?: number;
  // Source Type Breakdown
  dedVerifiedCount?: number;
  constructionDerivedCount?: number;
  userAddedCount?: number;
  // Master Autonomous AI Estimation Metrics
  ezrabDatabaseCount?: number;
  marketReferenceCount?: number;
  aiAssistedCount?: number;
  aiEstimatedCount?: number;
  userInputCount?: number;
  highConfidenceCount?: number;
  mediumConfidenceCount?: number;
  lowConfidenceCount?: number;
  executionMode?: 'AI_RAB' | 'EZRAB_STANDARD';
  projectLocation?: {
    province: string;
    city: string;
    district?: string;
    year: number;
  };
  // Formal Coverage Breakdown
  coverage?: RabCoverageReport;
}

export interface RawPageAnalysisPass1 {
  pageNumber: number;
  drawingType: DrawingType;
  drawingTitle: string;
  scale: string;
  scaleVerified: boolean;
  confidence: number;
  notes: string[];
  gridLines: string[];
  constructionElementsFound: string[];
}

export interface RawPageAnalysisPass2 {
  pageNumber: number;
  evidences: Array<{
    id: string;
    type: EvidenceType;
    content: string;
    unit?: string;
    confidence: number;
    bbox?: BoundingBox;
    references?: string[];
  }>;
  candidateItems: Array<{
    tempId: string;
    name: string;
    category: ElementCategory;
    materialSpec?: string;
    evidenceIds: string[];
    dimensions: Record<string, { value: number | null; unit: string; evidenceId?: string }>;
    shape: 'RECTANGULAR' | 'TRAPEZOIDAL' | 'CYLINDRICAL' | 'POLYGONAL' | 'LINEAR' | 'COUNT';
    unit: string;
    status: WorkItemStatus;
    notes?: string;
  }>;
}

/** Shared page-level extraction contract emitted identically in FAST/ADVANCED. */
export interface DedVisionOutputContract {
  pageNumber: number;
  evidences: RawPageAnalysisPass2['evidences'];
  candidateItems: Array<RawPageAnalysisPass2['candidateItems'][number] & {
    canonicalWorkId?: string;
    classification: 'CONSTRUCTION_WORK' | 'REFERENCE' | 'UNKNOWN';
    specifications: string[];
    quantityEvidence: Record<string, { value: number | null; unit: string; evidenceId?: string }>;
    confidence: { extraction: number; classification: number };
  }>;
}

export interface GoogleSheetsSyncResult {
  success: boolean;
  spreadsheetId?: string;
  syncedSheets: string[];
  sheets: Array<{ sheetName: string; rowCount: number }>;
  rowCount: number;
  syncTimestamp: string;
  status: 'SYNCED' | 'FAILED' | 'OFFLINE_READY';
  error?: string;
}

// =========================================================================
// V2.0 FIRST-PRINCIPLES PIPELINE TYPES (DOCUMENT UNDERSTANDING ENGINE)
// =========================================================================

export type DedStepName =
  | 'DOCUMENT_INGESTION'
  | 'PAGE_BY_PAGE_VISUAL_READING'
  | 'DOCUMENT_UNDERSTANDING'
  | 'RAW_DED_EXTRACTION'
  | 'DED_INVENTORY'
  | 'QUANTITY_RESOLUTION'
  | 'DED_COMPLETENESS_AUDIT'
  | 'AHSP_MATCHING'
  | 'PRICE_RESOLUTION'
  | 'RAB_GENERATION'
  | 'FINAL_VALIDATION'
  | 'SPREADSHEET_SYNC';

export interface PageReadingProgress {
  pagesExpected: number;
  pagesProcessed: number;
  pagesFailed: number;
  pagesSkipped: number;
  isComplete: boolean;
}

export interface PageObservationModel {
  pageId: string;
  pageNumber: number;
  drawingTitle?: string;
  drawingNumber?: string;
  drawingType: DrawingType;
  observations: Array<{
    id: string;
    type: string;
    description: string;
    confidence: number;
    sourceRegion?: string;
    evidenceText: string;
  }>;
  dimensions: Array<{
    name: string;
    value: number | null;
    unit: string;
    confidence: number;
    rawText?: string;
  }>;
  constructionElements: Array<{
    name: string;
    category: string;
    specification?: string;
    material?: string;
    dimensions?: Record<string, number | null>;
    confidence: number;
  }>;
  materials: Array<{
    name: string;
    spec: string;
    confidence: number;
  }>;
  notes: string[];
  referencesToOtherPages: Array<{
    targetDrawing: string;
    targetSheet?: string;
    tag: string;
    relationship: string;
  }>;
  rawEvidence: EvidenceRecord[];
}

export interface DedInventoryItem {
  id: string; // e.g. "DED-W-001"
  name: string;
  category: string;
  constructionType?: string;
  specification?: string;
  material?: string;
  sourcePages: number[];
  evidence: Array<{
    sourcePage: number;
    sourceRegion?: string;
    evidenceText: string;
    confidence: number;
  }>;
  references: string[];
}

export interface DedQuantityEvidence {
  value: number | null;
  unit: string;
  formula: string;
  status: 'RESOLVED' | 'MISSING';
  inputs: Array<{
    name: string;
    value: number | null;
    unit: string;
    sourcePage?: number;
    evidenceId?: string;
  }>;
  sourcePages: number[];
  evidence: EvidenceRecord[];
}

export interface DedCompletenessReport {
  pagesExpected: number;
  pagesProcessed: number;
  pagesFailed: number;
  workItemsTotal: number;
  quantityResolved: number;
  quantityMissing: number;
  evidenceTraced: number;
  ahspMatched: number;
  ahspReview: number;
  priceResolved: number;
  readyItemsCount: number;
  status: string; // e.g. "DED EXTRACTION COMPLETE WITH 6 QUANTITY ITEMS REQUIRING REVIEW"
}

export interface Ded12StepProgress {
  currentStep: DedStepName;
  stepNumber: number; // 1 to 12
  message: string;
  pageProgress?: PageReadingProgress;
  completenessReport?: DedCompletenessReport;
}

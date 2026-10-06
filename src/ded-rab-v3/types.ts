/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * Core Domain Types & Structured Document Memory (DED_CONTEXT)
 */

import { NationalAHSPItem } from '../data/nationalCostDatabase/types';

// ============================================================================
// 1. PAGE & DRAWING REPRESENTATION
// ============================================================================

export type DrawingClassification =
  | 'SITE_PLAN'
  | 'FLOOR_PLAN'
  | 'ELEVATION'
  | 'SECTION'
  | 'STRUCTURAL_PLAN'
  | 'STRUCTURAL_DETAIL'
  | 'DOOR_WINDOW_SCHEDULE'
  | 'ROOF_PLAN'
  | 'MEP_PLUMBING'
  | 'MEP_ELECTRICAL'
  | 'ARCHITECTURAL_DETAIL'
  | 'GENERAL_NOTES'
  | 'SPECIFICATION_SHEET'
  | 'UNKNOWN';

export interface DedPageInfo {
  pageNumber: number;
  drawingTitle: string;
  drawingType: DrawingClassification;
  scale?: string;
  scaleVerified: boolean;
  nativeText: string;
  imageDataBase64?: string;
  width: number;
  height: number;
  readStatus: 'PENDING' | 'READ' | 'DEEP_INSPECTED' | 'FAILED';
  readTimestamp?: number;
}

export interface DrawingElement {
  id: string;
  pageNumber: number;
  category: 'STRUCTURAL' | 'ARCHITECTURAL' | 'MEP' | 'SITEWORK' | 'FINISH';
  tagOrLabel: string; // e.g. "SL1", "K1", "P1", "PJ1", "Kusen P1", "Septic Tank"
  description: string;
  dimensionsRaw?: string;
  materialSpecification?: string;
  notes?: string;
}

export interface RoomDefinition {
  id: string;
  name: string; // e.g. "Ruang Tamu", "Kamar Tidur 1", "Kamar Mandi / WC"
  pageNumber: number;
  lengthM: number;
  widthM: number;
  areaM2: number;
  perimeterM: number;
  elevationM?: number; // e.g. +0.00, -0.05
  floorFinish?: string; // e.g. "Keramik 40x40", "Keramik Unpolished 25x25"
  ceilingHeightM?: number; // e.g. 3.20 m
}

export interface DimensionConstraint {
  id: string;
  pageNumber: number;
  drawingTitle: string;
  elementRef: string; // e.g. "Sloof SL1", "Pondasi Batu Kali", "Dinding Bata"
  dimensionType: 'LENGTH' | 'WIDTH' | 'HEIGHT' | 'DEPTH' | 'THICKNESS' | 'AREA' | 'SLOPE' | 'COUNT';
  value: number;
  unit: string;
  rawText: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ScheduleItem {
  id: string;
  scheduleType: 'DOOR' | 'WINDOW' | 'DOOR_WINDOW_COMBO' | 'REBAR' | 'ROOM_FINISH';
  mark: string; // e.g. "P1", "P2", "J1", "J2", "PJ1"
  count: number;
  widthM: number;
  heightM: number;
  totalOpeningAreaM2: number;
  material: string; // e.g. "Kusen Aluminium 4 inch, Daun Pintu Panel Kayu"
  sourcePage: number;
  notes?: string;
}

export interface CrossReference {
  fromPage: number;
  toPage: number;
  elementTag: string; // e.g. "Detail Pondasi A", "Potongan A-A"
  relationship: 'DETAILS' | 'SECTION_OF' | 'ELEVATION_OF' | 'SCHEDULE_FOR' | 'STRUCTURAL_SUPPORT_FOR';
  notes: string;
}

// ============================================================================
// 2. WORK ITEM (COMPLETE CONSTRUCTION INVENTORY)
// ============================================================================

export type WorkItemStatus =
  | 'READY'               // Full quantity with formula & evidence, AHSP matched & compatible, unit price resolved
  | 'NEEDS_REVIEW'        // Unresolved dimensions, low confidence formula, or user action required
  | 'MISSING_QUANTITY'    // Work exists in DED, but dimensions cannot be resolved even after cross-page search
  | 'AHSP_UNRESOLVED'     // Work exists and quantity resolved, but no compatible AHSP in official database
  | 'PRICE_UNRESOLVED'    // AHSP matched, but price not available in active databases
  | 'CONFLICT';           // Contradictory dimensions or notes between sheets

export interface QuantityTakeoffResult {
  value: number | null;
  unit: string;
  formula: string;
  parameters: Record<string, number | string>;
  semantics: 'AREA' | 'VOLUME' | 'LENGTH' | 'COUNT' | 'WEIGHT' | 'LUMP_SUM' | 'DEDUCTION';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';
  crossPageSources: Array<{ pageNumber: number; evidence: string }>;
  unresolvedReason?: string;
}

export interface AhspCandidateReview {
  candidateCode: string;
  candidateName: string;
  candidateUnit: string;
  compatibilityScore: number; // 0 - 100
  isCompatible: boolean;
  compatibilityChecks: {
    workTypeMatch: boolean;
    constructionMethodMatch: boolean;
    materialMatch: boolean;
    dimensionsMatch: boolean;
    specificationMatch: boolean;
    unitMatch: boolean;
  };
  rejectionReason?: string;
}

export interface AhspMatchResult {
  code: string;
  name: string;
  unit: string;
  source: 'CIPTA_KARYA_2026' | 'BINA_MARGA_2026' | 'SMKK_2026' | 'OFFICIAL_HSD_2026';
  category?: string;
  domain?: string;
  confidence: 'EXACT' | 'HIGH' | 'MEDIUM' | 'UNRESOLVED';
  compatibilitySummary: string;
  candidatesEvaluated: AhspCandidateReview[];
}

export interface WorkItemPriceResult {
  unitPrice: number;
  totalPrice: number | null;
  currency: 'IDR';
  source: 'PROJECT' | 'USER' | 'REGIONAL' | 'OFFICIAL' | 'EXTERNAL' | 'PRICE_NOT_FOUND';
  providerOrLocation?: string;
  effectiveDate?: string;
  url?: string;
  breakdown?: {
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    overheadCost: number;
  };
}

export interface FullAiWorkItem {
  id: string;
  itemNumber: number;
  name: string;
  category: string; // e.g. "I. Pekerjaan Pondasi & Tanah", "II. Pekerjaan Struktur"
  specification: string;
  dimensions: {
    lengthM?: number;
    widthM?: number;
    heightM?: number;
    depthM?: number;
    thicknessM?: number;
    areaM2?: number;
    volumeM3?: number;
    count?: number;
    unit?: string;
  };
  sourcePages: number[];
  sourceEvidence: string[];
  quantity: number | null;
  quantityFormula: string;
  quantityUnit: string;
  quantityConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';
  ahsp: AhspMatchResult | null;
  ahspConfidence: 'EXACT' | 'HIGH' | 'MEDIUM' | 'UNRESOLVED';
  price: WorkItemPriceResult | null;
  priceSource: WorkItemPriceResult['source'];
  status: WorkItemStatus;
  unresolvedReason?: string;
  aiNotes?: string;
  provenance?: ItemProvenance;
}

export type ItemProvenanceSource = 'DATABASE' | 'PROJECT_PRICE' | 'USER_INPUT' | 'AI_ASSISTED' | 'NEEDS_REVIEW' | 'BLOCKED';

export interface ItemProvenance {
  quantitySource: 'DETERMINISTIC_ENGINE' | 'USER_INPUT' | 'NEEDS_REVIEW';
  ahspSource: 'DATABASE' | 'AI_ASSISTED' | 'NEEDS_REVIEW';
  priceSource: 'DATABASE' | 'PROJECT_PRICE' | 'USER_INPUT' | 'AI_ASSISTED' | 'NEEDS_REVIEW';
  overallStatus: ItemProvenanceSource;
}

// ============================================================================
// 3. STRUCTURED DOCUMENT MEMORY (DED_CONTEXT)
// ============================================================================

export interface DedContextMemory {
  projectId: string;
  projectName: string;
  totalPages: number;
  pages: Map<number, DedPageInfo>;
  drawings: DrawingElement[];
  dimensions: DimensionConstraint[];
  rooms: RoomDefinition[];
  structural_elements: DrawingElement[];
  architectural_elements: DrawingElement[];
  materials: Array<{ materialName: string; sourcePages: number[]; specification: string }>;
  specifications: Array<{ title: string; text: string; sourcePages: number[] }>;
  schedules: ScheduleItem[];
  notes: Array<{ text: string; pageNumber: number }>;
  cross_references: CrossReference[];
  work_items: Map<string, FullAiWorkItem>;
  quantity_evidence: Map<string, QuantityTakeoffResult>;
  ahsp_evidence: Map<string, AhspMatchResult>;
  missing_information_queries: Array<{
    workItemId?: string;
    question: string;
    searchedPages: number[];
    resolved: boolean;
    resolution?: string;
  }>;
}

// ============================================================================
// 4. AI SELF-REVIEW & COMPLETENESS AUDIT
// ============================================================================

export interface AiSelfReviewQuestion {
  questionNumber: number;
  question: string;
  passed: boolean;
  scorePercent: number;
  findings: string[];
  correctiveActionsTaken?: string[];
}

export interface AiSelfReviewReport {
  timestamp: number;
  iteration: number;
  overallPassed: boolean;
  questions: AiSelfReviewQuestion[];
  correctionsExecuted: string[];
  unresolvedCount: number;
  readyCount: number;
}

export interface EngineDiagnosticMetrics {
  pageCoverage: number;       // % pages read and synthesized
  workItemCoverage: number;   // count of discovered work items
  quantityCoverage: number;   // % work items with non-null justified quantity
  ahspCoverage: number;       // % work items with official verified AHSP
  priceCoverage: number;      // % work items with non-zero authoritative price
  evidenceCoverage: number;   // % work items with documented cross-page evidence
}

// ============================================================================
// 5. FINAL PIPELINE OUTPUT & EVENTS
// ============================================================================

export type EngineWorkflowStage =
  | 'INITIALIZING'
  | 'READING_PAGES'
  | 'SYNTHESIZING_DOCUMENT'
  | 'INVENTORY_DISCOVERY'
  | 'MISSING_INFO_SEARCH'
  | 'QUANTITY_REASONING'
  | 'AHSP_MATCHING'
  | 'PRICE_RESOLUTION'
  | 'SELF_REVIEW'
  | 'FINAL_VALIDATION'
  | 'RAB_READY'
  | 'FAILED';

export interface EngineProgressEvent {
  stage: EngineWorkflowStage;
  stageNameId: string; // Indonesian clean text: "EZRAB sedang membaca DED...", etc.
  percent: number;
  message: string;
  pagesRead: number;
  totalPages: number;
  itemsDiscovered: number;
  quantitiesResolved: number;
  ahspMatched: number;
  pricesResolved: number;
  reviewIteration: number;
}

export interface FullAiDedRabOutput {
  success: boolean;
  jobId: string;
  projectId: string;
  projectName: string;
  executionDurationSec: number;
  context: DedContextMemory;
  workItems: FullAiWorkItem[];
  readyWorkItems: FullAiWorkItem[];
  unresolvedWorkItems: FullAiWorkItem[];
  grandTotalRab: number;
  diagnostics: EngineDiagnosticMetrics;
  selfReviewReport: AiSelfReviewReport;
  error?: string;
}

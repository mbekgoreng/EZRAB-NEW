/**
 * EZRAB AI ESTIMATE ONLY — Core Types
 * 
 * Independent type system for AI-driven cost estimation.
 * No dependency on AHSP, database, or EZRAB cost engine types.
 */

// ============================================================================
// 1. SOURCE & CONFIDENCE TYPES (Section 6 Compliant)
// ============================================================================

/** How the quantity was determined (Section 6) */
export type AiEstimateQuantitySource =
  | 'DED_EXPLICIT'     // Explicitly read from drawing callout / note
  | 'DED_GEOMETRIC'    // Reconstructed from drawing geometry (L × W × H)
  | 'AI_INFERENCE'     // Inferred from architectural / structural context
  | 'ASSUMPTION'       // Standard construction assumption
  | 'UNRESOLVED';      // Could not be determined

/** Legacy compatibility type alias */
export type QuantitySourceType = AiEstimateQuantitySource | string;

/** How the price was determined (Section 6) */
export type AiEstimatePriceSource =
  | 'AI_ESTIMATE'      // Estimated by AI construction reasoning
  | 'UNRESOLVED';      // Price unavailable / missing (NOT Rp0)

/** Legacy compatibility type alias */
export type PriceSourceType = AiEstimatePriceSource | string;

/** Item Status (Section 6) */
export type AiEstimateItemStatus =
  | 'VALID'            // Sanity verified, clean and included in totals
  | 'WARNING'          // Minor ambiguity or assumption, included with warning
  | 'BLOCKED'          // Physical absurdity or extreme quantity, excluded from total
  | 'UNRESOLVED';      // Missing quantity or price

/** How the subtotal/total was calculated */
export type CalculationSourceType =
  | 'DETERMINISTIC_CALCULATION'  // Code calculated: qty × price
  | 'UNRESOLVED';               // Cannot calculate (missing qty or price)

/** Detection confidence */
export type SourceDetectionType =
  | 'DRAWING_CONFIRMED'   // Clearly visible in DED
  | 'DRAWING_INFERRED'    // Inferred from DED but not explicit
  | 'AI_ASSUMPTION'       // AI assumed based on knowledge
  | 'UNKNOWN';            // Cannot determine source

/** Confidence level (Section 10) */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/** Item detection status */
export type DetectionStatus =
  | 'DETECTED'       // Found in DED
  | 'INFERRED'       // Inferred from context
  | 'ASSUMED'        // Assumed by AI
  | 'NOT_DETECTED'   // Not found in DED
  | 'AMBIGUOUS'      // Unclear in DED
  | 'UNRESOLVED';    // Cannot determine

// ============================================================================
// 2. WORK CATEGORIES
// ============================================================================

export const AI_ESTIMATE_CATEGORIES = [
  'Persiapan',
  'Pekerjaan Tanah',
  'Pondasi',
  'Struktur',
  'Dinding',
  'Atap',
  'Plafon',
  'Lantai',
  'Pintu & Jendela',
  'Pengecatan & Finishing',
  'MEP',
  'Pekerjaan Luar',
] as const;

export type AiEstimateCategory = (typeof AI_ESTIMATE_CATEGORIES)[number] | string;

// ============================================================================
// 3. UNIT VALIDATION MAP
// ============================================================================

/** Expected units for common construction work types */
export const EXPECTED_UNIT_MAP: Record<string, string[]> = {
  'beton': ['m3'],
  'pembesian': ['kg'],
  'bekisting': ['m2'],
  'dinding': ['m2'],
  'plesteran': ['m2'],
  'plester': ['m2'],
  'acian': ['m2'],
  'keramik': ['m2'],
  'lantai': ['m2'],
  'pipa': ["m'", 'm'],
  'pintu': ['unit', 'bh'],
  'jendela': ['unit', 'bh'],
  'kloset': ['unit', 'bh'],
  'wastafel': ['unit', 'bh'],
  'saklar': ['titik', 'unit', 'bh'],
  'stop_kontak': ['titik', 'unit', 'bh'],
  'lampu': ['titik', 'unit', 'bh'],
  'pondasi': ['m3', "m'"],
  'galian': ['m3'],
  'urugan': ['m3'],
  'cat': ['m2'],
  'pengecatan': ['m2'],
  'plafon': ['m2'],
  'atap': ['m2'],
  'genteng': ['m2'],
  'kuda_kuda': ['unit', 'bh', 'set'],
  'sloof': ['m3', "m'"],
  'kolom': ['m3', "m'"],
  'ringbalk': ['m3', "m'"],
  'balok': ['m3', "m'"],
};

// ============================================================================
// 4. QUANTITY SANITY & STATUS TYPES
// ============================================================================

export type QuantitySanityStatus =
  | 'ACCEPTED'             // Passed sanity check, allowed in calculations
  | 'BLOCKED_FROM_TOTAL'   // Clearly extreme/absurd, strictly excluded from total
  | 'SUSPICIOUS'           // Borderline value, flagged for user review
  | 'UNRESOLVED';          // Missing or could not be determined

export type PriceStatus =
  | 'PRICE_ESTIMATED'      // AI estimated unit price
  | 'PRICE_UNRESOLVED'     // Price missing/unresolved (must not default to Rp0)
  | 'USER_INPUT';          // User specified price

export interface QuantityTrace {
  raw: string;             // Raw extracted numeric/dimension data from drawing
  normalized: string;      // Normalized numeric data (m, m2, m3)
  formula: string;         // Geometric calculation formula
  result: string;          // Final computed quantity with unit
}

// ============================================================================
// 5. AI ESTIMATE WORK ITEM (Section 6 Strict Contract)
// ============================================================================

export interface AiEstimateWorkItem {
  id: string;
  category: AiEstimateCategory;
  /** Section 6: item name */
  item?: string;
  /** Backward compatibility alias for item */
  workName: string;
  /** Section 6: technical specification */
  specification?: string;
  description?: string;

  /** Accepted quantity after sanity check (null if BLOCKED) */
  quantity: number | null;
  unit: string;

  /** Section 6: Estimated unit price in IDR (null if unresolved) */
  unitPrice?: number | null;
  /** Section 6: Deterministic subtotal = quantity × unitPrice (null if blocked or unresolved) */
  subtotal?: number | null;

  /** Section 6: quantity source classification */
  quantitySource: AiEstimateQuantitySource;
  /** Section 6: price source classification */
  priceSource: AiEstimatePriceSource;

  /** Section 10: confidence tier */
  confidence: ConfidenceLevel;

  /** Section 6: DED sheet numbers */
  sourcePages: number[];
  /** Section 6: Drawing callout, detail code, or reference note */
  sourceEvidence?: string;

  /** Section 6: Physical dimensions (e.g. "40m x 0.15m x 0.20m") */
  dimensions?: string;
  /** Section 6: Mathematical calculation formula */
  formula?: string;

  /** Section 6: AI assumptions */
  assumptions: string[];
  /** Section 6: Warnings array */
  warnings: any[];

  /** Section 6: Item status */
  status?: AiEstimateItemStatus;

  // --- Internal Audit & Sanity Gate Fields ---
  rawQuantity?: number | null;
  acceptedQuantity?: number | null;
  quantityStatus?: QuantitySanityStatus;
  blockingReason?: string;
  quantityTrace?: QuantityTrace;
  priceStatus?: PriceStatus;
  estimatedUnitPrice?: number | null;
  estimatedSubtotal?: number | null;

  detectionType?: SourceDetectionType;
  detectionStatus?: DetectionStatus;
  provenance?: AiEstimateProvenance;
}

/** Full provenance for each calculated field */
export interface AiEstimateProvenance {
  quantitySource: QuantitySourceType;
  priceSource: PriceSourceType;
  subtotalSource: CalculationSourceType;
  totalSource: CalculationSourceType;
}

// ============================================================================
// 5. SANITY CHECK & WARNINGS
// ============================================================================

export type WarningLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export type WarningType =
  | 'UNIT_MISMATCH'         // Unit doesn't match expected for this work type
  | 'EXTREME_PRICE'         // Price is abnormally high or low
  | 'EXTREME_QUANTITY'      // Quantity seems unreasonable
  | 'EXTREME_SUBTOTAL'      // Subtotal is abnormally high
  | 'EXTREME_TOTAL'         // Total is abnormally high for project size
  | 'DUPLICATE_WORK'        // Same work appears multiple times
  | 'IDENTICAL_PRICES'      // Multiple different items have identical prices
  | 'LOW_CONFIDENCE'        // Item has low confidence
  | 'MISSING_QUANTITY'      // Quantity is null / unresolved
  | 'MISSING_PRICE';        // Price is null / unresolved

export interface AiEstimateWarning {
  type: WarningType;
  level: WarningLevel;
  message: string;
  itemId?: string;
  itemName?: string;
  suggestedAction?: string;
}

// ============================================================================
// 6. AI ESTIMATE OUTPUT
// ============================================================================

export interface AiEstimateSummary {
  /** Total estimated project cost */
  estimatedTotal: number;
  /** Low range estimate */
  rangeLow: number;
  /** High range estimate */
  rangeHigh: number;
  /** Overall confidence */
  confidence: ConfidenceLevel;
  /** Status label */
  status: 'PRELIMINARY';
}

export interface AiEstimateCategoryBreakdown {
  category: string;
  subtotal: number;
  itemCount: number;
  resolvedCount: number;
  unresolvedCount: number;
}

export interface AiEstimateOutput {
  success: boolean;
  jobId: string;
  projectId: string;
  projectName: string;
  analysisMode: 'FAST' | 'DETAIL';
  executionDurationSec: number;

  /** All work items with estimates */
  workItems: AiEstimateWorkItem[];

  /** Summary totals */
  summary: AiEstimateSummary;

  /** Breakdown by category */
  categoryBreakdown: AiEstimateCategoryBreakdown[];

  /** All sanity warnings */
  warnings: AiEstimateWarning[];

  /** Statistics */
  stats: {
    totalItems: number;
    detectedItems: number;
    inferredItems: number;
    assumedItems: number;
    unresolvedItems: number;
    acceptedItems: number;
    blockedItems: number;
    warningCount: number;
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
  };

  /** Pages read from DED */
  totalPagesRead: number;

  /** Error message if failed */
  error?: string;
}

// ============================================================================
// 7. PIPELINE PROGRESS
// ============================================================================

export type AiEstimatePipelineStage =
  | 'INITIALIZING'
  | 'READING_PAGES'
  | 'UNDERSTANDING_DED'
  | 'WORK_BREAKDOWN'
  | 'QUANTITY_ESTIMATION'
  | 'PRICE_ESTIMATION'
  | 'SANITY_CHECK'
  | 'CALCULATING_TOTALS'
  | 'COMPLETE'
  | 'FAILED';

export interface AiEstimateProgressEvent {
  stage: AiEstimatePipelineStage;
  stageLabel: string;
  percent: number;
  message: string;
  pagesRead: number;
  totalPages: number;
  itemsFound: number;
}

/**
 * EZRAB — Autonomous AI Construction Estimator Resolution Contracts
 *
 * Provides standardized interfaces for:
 * 1. Price Providers (Project -> EZRAB Database -> Regional -> External Market -> AI Estimate)
 * 2. AHSP Providers (Exact -> Semantic -> Related -> Reference -> AI Assisted -> AI Estimated)
 * 3. Quantity Providers (Deterministic -> Cross-Page Schedule -> AI Deduced)
 *
 * Strict Principles:
 * - Deterministic decimal math via SafeDecimalEngine
 * - Clean field-level provenance tracking
 * - Explicit confidence ratings (HIGH: >=0.90, MEDIUM: 0.75-0.89, LOW: <0.75)
 * - Master databases remain isolated (never mutated by project-level estimates)
 */

export type ExecutionMode = 'AI_RAB' | 'EZRAB_STANDARD';

export interface ProjectLocation {
  province: string;
  city: string;
  district?: string;
  year: number;
}

export type ProvenanceSource =
  | 'EZRAB_DATABASE'
  | 'PROJECT_PRICE'
  | 'REGIONAL_PRICE'
  | 'MARKET_REFERENCE'
  | 'AI_ASSISTED'
  | 'AI_ESTIMATED'
  | 'USER_INPUT';

export type ConfidenceRating = 'HIGH' | 'MEDIUM' | 'LOW';

export interface FieldLevelProvenance {
  quantitySource: 'DED_EXACT' | 'DED_DIMENSION' | 'DED_DERIVED' | 'DED_SCHEDULE' | 'AI_INFERRED' | 'AI_DEDUCED' | 'AI_ESTIMATED' | 'DETERMINISTIC_ENGINE' | 'USER_INPUT';
  ahspSource: 'EZRAB_DATABASE' | 'EZRAB_SEMANTIC' | 'SEMANTIC_MATCH' | 'REFERENCE_AHSP' | 'MARKET_REFERENCE' | 'AI_ASSISTED' | 'AI_ESTIMATED' | 'USER_INPUT';
  materialSource: 'EZRAB_DATABASE' | 'PROJECT_PRICE' | 'REGIONAL_PRICE' | 'MARKET_REFERENCE' | 'AI_ESTIMATED' | 'USER_INPUT';
  laborSource: 'EZRAB_DATABASE' | 'PROJECT_PRICE' | 'REGIONAL_PRICE' | 'MARKET_REFERENCE' | 'AI_ESTIMATED' | 'USER_INPUT';
  priceSource: 'PROJECT_PRICE' | 'EZRAB_DATABASE' | 'REGIONAL_PRICE' | 'MARKET_REFERENCE' | 'AI_ESTIMATED' | 'USER_INPUT';
  calculationSource: 'SAFE_DECIMAL_ENGINE';
  overallProvenance: 'EZRAB_DATABASE' | 'REGIONAL_PRICE' | 'MARKET_REFERENCE' | 'MIXED' | 'AI_ASSISTED' | 'AI_ESTIMATED' | 'USER_INPUT';
}

export interface GranularConfidenceScore {
  objectConfidence: number;
  quantityConfidence: number;
  specificationConfidence: number;
  ahspConfidence: number;
  materialConfidence: number;
  priceConfidence: number;
  overallConfidence: number;
  confidenceRating: ConfidenceRating;
}

export interface PriceSearchInput {
  workItemName: string;
  category?: string;
  specification?: string;
  unit: string;
  quantity?: number | null;
  ahspCode?: string;
  location?: ProjectLocation;
  projectId?: string;
  existingProjectItems?: any[];
  companyCatalog?: any[];
}

export interface PriceCandidate {
  unitPrice: number;
  totalPrice: number;
  priceSource: 'PROJECT_PRICE' | 'EZRAB_DATABASE' | 'REGIONAL_PRICE' | 'MARKET_REFERENCE' | 'AI_ESTIMATED';
  priceStatus: 'PRICE_INTERNAL' | 'PRICE_EXTERNAL' | 'PRICE_AI_ESTIMATE' | 'PRICE_MIXED' | 'RESOLVED';
  sourceName: string;
  sourceUrl?: string;
  observedDate?: string;
  location?: string;
  materialPrice?: number | null;
  laborPrice?: number | null;
  equipmentPrice?: number | null;
  confidence: number;
  confidenceRating: ConfidenceRating;
  assumptions: string[];
  components?: any[];
}

export interface PriceProvider {
  readonly name: string;
  readonly priority: number;
  search(input: PriceSearchInput): Promise<PriceCandidate | null>;
}

export interface AhspSearchInput {
  workItemName: string;
  category: string;
  specification?: string;
  unit: string;
  ahspCode?: string;
  projectId?: string;
  companyCatalog?: any[];
}

export interface AhspCandidate {
  code: string;
  name: string;
  unit: string;
  source: string;
  matchType: 'EXACT_MATCH' | 'SEMANTIC_MATCH' | 'RELATED_MATCH' | 'AI_ASSISTED' | 'AI_ESTIMATED';
  provenance: 'EZRAB_DATABASE' | 'SEMANTIC_MATCH' | 'MARKET_REFERENCE' | 'AI_ASSISTED' | 'AI_ESTIMATED';
  confidence: number;
  confidenceRating: ConfidenceRating;
  notes?: string;
  coefficientSummary?: string;
  candidates?: Array<{ code: string; name: string; unit: string }>;
}

export interface AhspProvider {
  readonly name: string;
  readonly priority: number;
  findAhsp(input: AhspSearchInput): Promise<AhspCandidate | null>;
}

export interface QuantityResolutionInput {
  item: any;
  memory?: any;
  buildingModel?: any;
  context?: any;
  sourcePages?: number[];
  floorPlanRooms?: Array<{ name: string; area: number; perimeter: number; length?: number; width?: number }>;
  openingsSchedule?: Array<{ tag: string; count: number; width?: number; height?: number; area?: number }>;
}

export interface QuantityCandidate {
  quantity: number;
  unit: string;
  formula: string;
  source: 'DED_DIMENSION' | 'DED_SCHEDULE' | 'AI_DEDUCED' | 'DETERMINISTIC_ENGINE';
  confidence: number;
  confidenceRating: ConfidenceRating;
  assumptions: string[];
  inputs: Record<string, number | null>;
  calculationBreakdown?: string;
}

export interface QuantityProvider {
  readonly name: string;
  resolveQuantity(input: QuantityResolutionInput): Promise<QuantityCandidate | null>;
}

export function computeConfidenceRating(score: number): ConfidenceRating {
  if (score >= 0.9) return 'HIGH';
  if (score >= 0.75) return 'MEDIUM';
  return 'LOW';
}

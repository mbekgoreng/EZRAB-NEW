/**
 * EZRAB PRICING DOMAIN — CONTRACTS & TYPES
 * Strongly typed definitions for versioned unit pricing, HSD, and price context.
 */

export type PriceCategory = 'LABOR' | 'MATERIAL' | 'EQUIPMENT' | 'SMKK' | 'OTHER';

export interface PriceProvenanceMetadata {
  sourceName: string;
  sourceDocument?: string;
  location: string;
  periodVersion: string;
  effectiveDate: string;
  supplier?: string;
  confidenceScore: number;
  sourceUrl?: string;
  notes?: string;
}

export interface PriceDefinition {
  id: string;
  code: string;
  codeNormalized: string;
  name: string;
  category: PriceCategory;
  subcategory?: string;
  unit: string;
  price: number;
  minPrice?: number;
  maxPrice?: number;
  location: string;
  periodVersion: string;
  effectiveDate: string;
  priceSource: string;
  brand?: string;
  specification?: string;
  projectId?: string;
  provenance: PriceProvenanceMetadata;
}

export interface PriceContext {
  projectId?: string;
  location?: string;
  effectiveDate?: string;
  periodVersion?: string;
  priceSource?: string;
  allowUnverified?: boolean;
  revisionId?: string;
}

export type PriceResolutionStatus =
  | 'EXACT_MATCH'
  | 'CONTEXTUAL_MATCH'
  | 'NORMALIZED_MATCH'
  | 'AMBIGUOUS'
  | 'PRICE_NOT_FOUND'
  | 'PRICE_NOT_CONFIGURED';

export type PriceSource =
  | 'USER'
  | 'PROJECT'
  | 'VENDOR'
  | 'EZRAB_DATABASE'
  | 'PROJECT_HISTORY'
  | 'REGIONAL'
  | 'AHSP'
  | 'HSPK'
  | 'HSBU'
  | 'WEB_REFERENCE'
  | 'CALCULATED'
  | 'SIMILAR_ITEM'
  | 'MANUAL';

export type PriceStatus =
  | 'VERIFIED'
  | 'DATABASE'
  | 'REFERENCE'
  | 'ESTIMATED'
  | 'USER_INPUT'
  | 'EXPIRED'
  | 'MISSING';

export interface PriceCandidate {
  id: string;
  price: number;
  unit: string;
  source: PriceSource;
  sourceName: string;
  sourceUrl?: string;
  observedDate: string;
  region?: string;
  specification?: string;
  brand?: string;
  confidence: number;
  matchType: 'EXACT' | 'SEMANTIC' | 'HISTORICAL' | 'REGIONAL' | 'WEB' | 'SIMILAR' | 'MANUAL';
  notes?: string;
  isConfirmed?: boolean;
  rawPayload?: any;
}

export interface PriceSearchInput {
  material: string;
  specification?: string;
  brand?: string;
  unit?: string;
  region?: string;
  country?: string;
  year?: number;
  category?: string;
}

export interface PriceSearchResult {
  status: 'FOUND' | 'NO_RESULT' | 'SEARCH_FAILED' | 'RATE_LIMITED';
  query: PriceSearchInput;
  candidates: PriceCandidate[];
  priceRange?: {
    min: number;
    max: number;
    median: number;
    currency: string;
  };
  cached?: boolean;
  error?: string;
  observedDate: string;
}

export interface GlobalPriceSettings {
  region: string;
  year: number;
  currency: string;
  taxPercent: number;
  primarySource: PriceSource;
  fallbackSource: PriceSource;
  priceValidityDays: number;
  roundingPolicy: 'NEAREST_100' | 'NEAREST_1000' | 'EXACT';
}

export interface PriceResolutionCandidate {
  price: PriceDefinition;
  matchScore: number;
  matchReason: string;
}

export interface PriceItemQuery {
  code?: string;
  name?: string;
  category?: PriceCategory;
  unit?: string;
  location?: string;
  periodVersion?: string;
  specification?: string;
  brand?: string;
  projectId?: string;
  year?: number;
  quantity?: number;
  manualPrice?: number;
}

export interface PriceResolutionResult {
  status: PriceResolutionStatus;
  query: PriceItemQuery;
  resolvedPrice?: PriceDefinition;
  candidates?: PriceResolutionCandidate[];
  priceCandidates?: PriceCandidate[];
  selectedCandidate?: PriceCandidate;
  priceRange?: { min: number; max: number; median: number };
  explanation?: string;
  confidence?: number;
  error?: string;
  warnings?: string[];
}

// ============================================================================
// PROJECT PRICE & OVERRIDE DOMAIN TYPES
// ============================================================================

export type ResolvedPriceStatus =
  | 'REFERENCE'
  | 'PROJECT_PRICE'
  | 'OVERRIDE'
  | 'LOCKED'
  | 'EXPIRED'
  | 'NOT_FOUND';

export type ResolvedPriceSource =
  | 'PROJECT_OVERRIDE'
  | 'PROJECT_PRICE'
  | 'HISTORICAL'
  | 'EZRAB_REFERENCE'
  | 'REGIONAL_REFERENCE'
  | 'AHSP'
  | 'EXTERNAL_REFERENCE'
  | 'MANUAL'
  | 'PRICE_NOT_FOUND';

export interface ResolvedPrice {
  materialId: string;
  materialCode?: string;
  materialName?: string;
  projectId?: string;

  price: number;
  unit: string;

  source: ResolvedPriceSource;
  status: ResolvedPriceStatus;

  sourceName?: string;
  supplier?: string;
  region?: string;
  validFrom?: string;
  validUntil?: string;

  isFinal: boolean;
  isLocked?: boolean;
  revisionId?: string;

  confidence?: number;

  referencePrice?: number;
  projectPrice?: number;
  overridePrice?: number;
  varianceAmount?: number;
  variancePercent?: number;

  explanation?: string;

  provenance?: {
    referenceId?: string;
    sourceUrl?: string;
    createdBy?: string;
    createdAt?: string;
    notes?: string;
  };
}

export type ProjectPriceSourceType =
  | 'SUPPLIER'
  | 'PURCHASE'
  | 'QUOTATION'
  | 'CONTRACT'
  | 'USER';

export interface ProjectMaterialPrice {
  id: string;

  projectId: string;
  materialId: string;
  materialCode?: string;
  materialName?: string;
  category?: string;

  price: number;
  unit: string;

  supplierId?: string;
  supplierName?: string;

  region?: string;

  effectiveDate?: string;
  validUntil?: string;

  source: ProjectPriceSourceType;
  referenceNumber?: string;
  notes?: string;
  status?: string;

  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPriceOverride {
  id: string;

  projectId: string;
  materialId: string;
  materialCode?: string;
  materialName?: string;
  category?: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | string;

  price: number;
  unit: string;

  reason: string;

  createdBy?: string;
  createdAt: string;

  active: boolean;
  previousPrice?: number;
  masterPrice?: number;
}

export interface PriceAuditRecord {
  id: string;
  projectId: string;
  materialId: string;
  materialCode?: string;
  materialName?: string;
  action:
    | 'CREATE_PROJECT_PRICE'
    | 'UPDATE_PROJECT_PRICE'
    | 'SET_PROJECT_PRICE'
    | 'ENABLE_OVERRIDE'
    | 'DISABLE_OVERRIDE'
    | 'ACTIVATE_OVERRIDE'
    | 'LOCK_PRICE'
    | 'BULK_UPDATE'
    | 'RESET_PRICE';
  oldPrice?: number;
  newPrice: number;
  unit: string;
  reason?: string;
  userId: string;
  userName: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface PriceLockRecord {
  id: string;
  projectId: string;
  revisionId: string;
  revisionTitle?: string;
  lockedAt: string;
  lockedBy: string;
  items: Array<{
    materialId: string;
    materialCode?: string;
    materialName?: string;
    price: number;
    unit: string;
    source: ResolvedPriceSource;
    status: ResolvedPriceStatus;
  }>;
}

export interface PriceComparison {
  referencePrice: number;
  projectPrice?: number;
  overridePrice?: number;
  finalPrice: number;
  varianceAmount: number;
  variancePercent: number;
  status: ResolvedPriceStatus;
  isOverride: boolean;
}



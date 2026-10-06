/**
 * EZRAB — PRICE DATABASE 2026 (SEPARATE LAYER)
 * ============================================
 *
 * This layer is DELIBERATELY SEPARATE from the canonical AHSP source of truth.
 * The canonical AHSP (5.801 items) carries codes, descriptions, units, resources
 * and coefficients — and NO prices. Prices live here.
 *
 *   OFFICIAL AHSP 2026  ──resource code──▶  RESOURCE MASTER
 *                                                 │
 *                                                 ▼
 *                                          PRICE DATABASE  (this module)
 *                                                 │
 *                                                 ▼
 *                                         PRICE RESOLVER
 *                                                 │
 *                                                 ▼
 *                                        AHSP UNIT PRICE → RAB
 *
 * Two rules are load-bearing:
 *   1. `price` is `number | null`. A missing price is NULL, never 0.
 *   2. Every price record carries provenance (source, location, period).
 */

// ============================================================================
// 1. RESOURCE CLASSIFICATION
// ============================================================================

/** Canonical AHSP resource type. `UNKNOWN` must be routed to NEEDS_REVIEW. */
export type ResourceType = 'material' | 'labor' | 'equipment' | 'unknown';

/** Result of auditing a canonical resource master row. */
export type ResourceClassification =
  | 'MATERIAL'
  | 'LABOR'
  | 'EQUIPMENT'
  | 'UNKNOWN';

/**
 * Quality of a canonical resource row. The canonical resource master is derived
 * from the source PDF and some rows are demonstrably polluted (fragment names,
 * summary lines absorbed into the name, missing code). Those are marked
 * `DEFECTIVE` and are never given a price.
 */
export type ResourceRowQuality = 'CLEAN' | 'SUSPECT' | 'DEFECTIVE';

// ============================================================================
// 2. SOURCE REGISTRY
// ============================================================================

/**
 * PHASE 27 — source priority. Lower rank = higher authority.
 * Rank is CONFIGURATION, not a hidden constant: it is emitted into the audit.
 */
export type PriceSourceTier =
  | 'OFFICIAL_GOVERNMENT' // 1
  | 'OFFICIAL_PROJECT' // 2
  | 'VERIFIED_REGIONAL' // 3
  | 'USER_IMPORTED_VERIFIED' // 4
  | 'PROJECT_INTERNAL_MASTER' // 4b — project-provided master, not externally verified
  | 'COMMERCIAL_REFERENCE' // 5
  | 'LEGACY_SUPERSEDED'; // excluded from the active database

export const PRICE_SOURCE_PRIORITY: Record<PriceSourceTier, number> = {
  OFFICIAL_GOVERNMENT: 1,
  OFFICIAL_PROJECT: 2,
  VERIFIED_REGIONAL: 3,
  USER_IMPORTED_VERIFIED: 4,
  PROJECT_INTERNAL_MASTER: 5,
  COMMERCIAL_REFERENCE: 6,
  LEGACY_SUPERSEDED: 99,
};

// ============================================================================
// 3. VERIFICATION STATUS
// ============================================================================

export type PriceVerificationStatus =
  | 'VERIFIED' // backed by a named official/authoritative document
  | 'SOURCE_REPORTED' // a named source reports it; not externally audited
  | 'NEEDS_REVIEW'; // provenance incomplete, or matched only by name

// ============================================================================
// 4. LOCATION & PERIOD
// ============================================================================

export type LocationLevel = 'NATIONAL' | 'PROVINCE' | 'REGENCY' | 'CITY';

export interface PriceLocation {
  level: LocationLevel;
  /** ISO-ish code when known, e.g. `ID-JI`. */
  provinceCode?: string | null;
  provinceName?: string | null;
  regencyCode?: string | null;
  regencyName?: string | null;
  cityName?: string | null;
}

export interface PricePeriod {
  year: number;
  /** 1-12, or null when the source only states a year/quarter. */
  month: number | null;
  /** e.g. `2026-Q1`, `2026-09`. Free-form label retained from the source. */
  label: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // null = open-ended
}

// ============================================================================
// 5. PRICE RECORD (the price database row)
// ============================================================================

/**
 * PHASE 4 — price identity is NOT the name. It is:
 *   (resourceId, unit, location, period, sourceKey)
 * The `id` is derived deterministically from exactly those components.
 */
export interface ResourcePriceRecord {
  /** Deterministic identity: `PRC-<sourceKey>-<resourceId>-<unit>-<locationKey>-<periodLabel>` */
  id: string;

  // --- matched canonical resource (null when unmatched) ---
  resourceId: string | null;
  resourceCode: string;
  resourceName: string;
  resourceType: ResourceType;

  // --- unit ---
  unit: string; // normalized
  unitRaw: string; // exactly as the source printed it
  unitConversionFactor?: number | null; // only when a documented factor applies

  // --- value ---
  price: number;
  currency: 'IDR';

  // --- context ---
  location: PriceLocation;
  period: PricePeriod;

  // --- provenance (PHASE 7) ---
  sourceKey: string;
  sourceTier: PriceSourceTier;
  sourcePriority: number;
  sourceName: string;
  sourceType: string;
  sourceDocument?: string | null;
  sourceUrl?: string | null;
  supplier?: string | null;
  retrievedAt: string;
  verificationStatus: PriceVerificationStatus;

  // --- how this row was bound to the canonical resource (PHASE 12) ---
  matchMethod: PriceMatchMethod;
  matchConfidence: number; // 0..1
  notes: string[];
}

/** PHASE 12 — matching priority, most→least trustworthy. */
export type PriceMatchMethod =
  | 'EXACT_CODE' // 1. canonical code == source code, name compatible
  | 'EXACT_SOURCE_ID' // 2. explicit source identifier
  | 'NORMALIZED_CODE_UNIT' // 3. dot/case-insensitive code + same unit
  | 'ALIAS' // 4. explicit, auditable alias entry
  | 'NAME_UNIT' // 5. normalized name + unit — CANDIDATE ONLY → NEEDS_REVIEW
  | 'UNMATCHED'; // never bound

/** Methods that may produce a VERIFIED row. */
export const TRUSTED_MATCH_METHODS: PriceMatchMethod[] = [
  'EXACT_CODE',
  'EXACT_SOURCE_ID',
  'NORMALIZED_CODE_UNIT',
  'ALIAS',
];

// ============================================================================
// 6. RESOLUTION
// ============================================================================

export type PricingStatus = 'FULL' | 'PARTIAL' | 'MISSING';

export type PriceFallbackKind =
  | 'NONE'
  | 'PROVINCE' // regency requested, province price used
  | 'NATIONAL' // province requested, national price used
  | 'PREVIOUS_PERIOD'
  | 'NEXT_PERIOD';

export interface ResourcePriceQuery {
  resourceId?: string | null;
  resourceCode?: string;
  resourceName?: string;
  resourceType?: ResourceType;
  unit?: string;
  domain?: string;
  location?: {
    provinceName?: string | null;
    regencyName?: string | null;
    cityName?: string | null;
  };
  period?: {
    year: number;
    month?: number | null;
  };
  /** Explicit opt-in for location/period fallback (PHASE 15/16). */
  allowLocationFallback?: boolean;
  allowPeriodFallback?: boolean;
}

export interface ResourcePriceResolution {
  /** NULL when nothing could be resolved. Never 0-as-a-substitute-for-null. */
  price: number | null;
  currency: 'IDR' | null;
  unit: string | null;

  resourceId: string | null;
  resourceCode: string;
  resourceName: string;
  resourceType: ResourceType;

  status: 'RESOLVED' | 'NOT_FOUND';

  // --- auditability of every fallback (PHASE 15/16) ---
  requestedLocation: PriceLocation | null;
  resolvedLocation: PriceLocation | null;
  locationFallback: PriceFallbackKind;

  requestedPeriod: { year: number; month: number | null } | null;
  resolvedPeriod: PricePeriod | null;
  periodFallback: PriceFallbackKind;

  source: {
    key: string;
    tier: PriceSourceTier;
    priority: number;
    name: string;
    document?: string | null;
    url?: string | null;
    supplier?: string | null;
  } | null;
  verificationStatus: PriceVerificationStatus | null;
  matchMethod: PriceMatchMethod | null;
  confidence: number;

  alternatives: Array<{ price: number; unit: string; sourceName: string; locationLevel: LocationLevel }>;
  explanation: string;
}

// ============================================================================
// 7. AHSP UNIT PRICE COMPOSITION
// ============================================================================

export interface AhspComponentPricing {
  componentId: string;
  type: 'labor' | 'material' | 'equipment';
  itemCode: string;
  itemName: string;
  unit: string;
  coefficient: number;
  /** NULL when unresolved. */
  unitPrice: number | null;
  /** coefficient × unitPrice — NULL when unitPrice is null. */
  subtotalPerUnit: number | null;
  resolved: boolean;
  sourceName?: string | null;
  verificationStatus?: PriceVerificationStatus | null;
  matchMethod?: PriceMatchMethod | null;
}

export interface AhspCategoryPricing {
  type: 'labor' | 'material' | 'equipment';
  components: AhspComponentPricing[];
  /** Sum over RESOLVED components only. */
  subtotalPerUnit: number;
  resolvedCount: number;
  missingCount: number;
  /** false when ANY component is unresolved — the subtotal is then incomplete. */
  complete: boolean;
}

export interface AhspUnitPriceComposition {
  ahspCode: string;
  ahspName: string;
  unit: string;
  labor: AhspCategoryPricing;
  material: AhspCategoryPricing;
  equipment: AhspCategoryPricing;
  /** Sum over resolved components. NULL when NOTHING resolved. */
  unitPrice: number | null;
  /** Official SE 47/2026 HSP price (including overhead/profit where applicable) */
  hspPrice?: number | null;
  /** Overhead & profit amount where documented */
  overheadAmount?: number | null;
  /** Official DHSP catalog reference price */
  officialDhspPrice?: number | null;
  /** Provenance source document / sheet */
  provenanceSource?: string | null;
  /** How many components resolved. */
  resolvedComponents: number;
  totalComponents: number;
  missingComponents: number;
  /** PHASE 20 — the authoritative status. */
  pricingStatus: PricingStatus;
  /** Component names that could not be priced (PHASE 19 — never hidden). */
  missing: Array<{ type: string; code: string; name: string; unit: string }>;
  warnings: string[];
}

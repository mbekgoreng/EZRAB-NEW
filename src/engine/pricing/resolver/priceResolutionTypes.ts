/**
 * EZRAB PRICING — SHARED PRICE-RESOLUTION TYPES
 * ======================================================================
 *
 * MASTER PRICING §12 (D3/M-12): these types were defined inside
 * `advancedPriceResolutionEngine.ts`, whose CLASS is now archived
 * (`_archive/advancedPriceResolutionEngine.ts` — dead code, no runtime
 * consumer). The types are still imported by live modules (weir cost
 * service + forensic calibration + deterministic cost engine +
 * calculator migration contract), so they moved here VERBATIM — same
 * names, same shapes, no semantic change. New code should prefer the
 * canonical resolver's types (`CanonicalPriceResult`,
 * `ResourcePriceResolution`) and treat these as the legacy
 * price-resolution vocabulary for the modules that still speak it.
 */

export type ResolutionStatus =
  | 'VERIFIED'
  | 'VALID'
  | 'PARTIAL'
  | 'MISSING'
  | 'EXPIRED'
  | 'CONFLICT'
  | 'INVALID';

export type PriceResolutionTier =
  | 'PROJECT_SPECIFIC'
  | 'CITY_REGENCY'
  | 'PROVINCE'
  | 'NATIONAL'
  | 'NO_PRICE';

export interface PriceRecord {
  id: string;
  resourceId: string;
  resourceName: string;
  price: number;
  unit: string;
  tier: PriceResolutionTier;
  projectId?: string;
  provinceId?: string;
  cityId?: string;
  source: string;
  sourceDocument: string;
  year: number;
  month?: number;
  effectiveDate: string;
  validUntil?: string;
  confidence: number;
}

export interface PriceResolutionQuery {
  resourceId: string;
  resourceName?: string;
  targetUnit?: string;
  projectId?: string;
  provinceId?: string;
  cityId?: string;
  year: number;
  month?: number;
  priceSource?: string;
}

export interface PriceProvenance {
  price: number;
  unit: string;
  source: string;
  sourceDocument: string;
  region: string;
  year: number;
  effectiveDate: string;
  confidence: number;
  tier: PriceResolutionTier;
  resolutionReason: string;
}

export interface PriceAnomaly {
  code: 'PRICE_TOO_LOW' | 'PRICE_TOO_HIGH' | 'NEGATIVE_PRICE' | 'UNIT_MISMATCH' | 'YEAR_MISMATCH' | 'EXPIRED_PRICE';
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export interface PriceResolutionOutput {
  status: ResolutionStatus;
  price: number | null;
  unit: string | null;
  provenance: PriceProvenance | null;
  anomalies: PriceAnomaly[];
  explanation: string;
}

export interface PriceSnapshot {
  snapshotId: string;
  createdAt: string;
  projectId?: string;
  items: Map<string, PriceResolutionOutput>;
}

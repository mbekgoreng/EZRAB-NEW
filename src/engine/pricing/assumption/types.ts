/**
 * EZRAB Price Fallback & Assumption Layer — Types
 * ================================================
 *
 * Separate layer for prices outside official AHSP. An assumption NEVER
 * becomes an official price; it is always labeled and requires approval
 * before use in final totals.
 *
 * Four source kinds (per spec):
 *   OFFICIAL_AHSP    — official price/analysis from valid source
 *   MARKET_REFERENCE — traceable market survey/supplier/document price
 *   EZRAB_ASSUMPTION — temporary assumption via EZRAB approval procedure
 *   UNRESOLVED       — no valid or approved price
 */

export type PriceSourceKind =
  | 'OFFICIAL_AHSP'
  | 'MARKET_REFERENCE'
  | 'EZRAB_ASSUMPTION'
  | 'UNRESOLVED';

export type AssumptionStatus =
  | 'DRAFT'      // created, not yet submitted
  | 'PENDING'    // submitted, awaiting approval
  | 'APPROVED'   // approved and within validity period
  | 'EXPIRED'    // past validUntil
  | 'REJECTED'   // rejected by approver
  | 'DISABLED';  // manually disabled

export type AssumptionResourceType = 'material' | 'labor' | 'equipment';

export interface PriceAssumption {
  /** Unique ID: ASM-<timestamp>-<random> */
  id: string;

  // --- resource identity ---
  resourceCode: string;
  resourceName: string;
  resourceType: AssumptionResourceType;
  /** Canonical resource ID when matched, null otherwise */
  canonicalResourceId: string | null;

  // --- price ---
  price: number;
  unit: string;
  currency: 'IDR';

  // --- context ---
  region: string | null;       // e.g. "Jabodetabek", "Jawa Barat"
  validFrom: string;           // YYYY-MM-DD
  validUntil: string | null;   // null = open-ended

  // --- provenance ---
  sourceNote: string;          // basis/reason for the price
  referenceDocument: string | null;
  referenceDate: string | null;

  // --- workflow ---
  status: AssumptionStatus;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;

  // --- audit ---
  version: number;
  history: AssumptionHistoryEntry[];

  notes: string | null;
}

export interface AssumptionHistoryEntry {
  at: string;
  by: string;
  action: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'DISABLED' | 'REENABLED' | 'UPDATED' | 'EXPIRED';
  note: string | null;
  previousStatus: AssumptionStatus | null;
  newStatus: AssumptionStatus;
}

/** Input for creating a new assumption (status starts as DRAFT). */
export interface CreateAssumptionInput {
  resourceCode: string;
  resourceName: string;
  resourceType: AssumptionResourceType;
  canonicalResourceId?: string | null;
  price: number;
  unit: string;
  region?: string | null;
  validFrom: string;
  validUntil?: string | null;
  sourceNote: string;
  referenceDocument?: string | null;
  referenceDate?: string | null;
  notes?: string | null;
}

/** Result of resolving a price through the 4-tier fallback. */
export interface FallbackPriceResolution {
  price: number | null;
  unit: string | null;
  sourceKind: PriceSourceKind;
  /** Human-readable label for UI: "RESMI AHSP", "REFERENSI PASAR", etc. */
  sourceLabel: string;
  sourceName: string | null;
  assumptionId: string | null;
  assumptionStatus: AssumptionStatus | null;
  region: string | null;
  validFrom: string | null;
  validUntil: string | null;
  approvedBy: string | null;
  /** True when this price may be used in final totals. */
  usableInFinal: boolean;
  explanation: string;
}

export const PRICE_SOURCE_LABELS: Record<PriceSourceKind, string> = {
  OFFICIAL_AHSP: 'RESMI AHSP',
  MARKET_REFERENCE: 'REFERENSI PASAR',
  EZRAB_ASSUMPTION: 'ASUMSI — PERLU VERIFIKASI',
  UNRESOLVED: 'HARGA BELUM TERSEDIA',
};

/** Assumption is usable in final totals only when APPROVED and not expired. */
export function isAssumptionUsable(a: PriceAssumption, now: Date = new Date()): boolean {
  if (a.status !== 'APPROVED') return false;
  if (a.validUntil) {
    const until = new Date(a.validUntil + 'T23:59:59');
    if (now > until) return false;
  }
  const from = new Date(a.validFrom + 'T00:00:00');
  if (now < from) return false;
  return true;
}

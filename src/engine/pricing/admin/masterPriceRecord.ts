/**
 * MASTER PRICING §4.2 — PRICE RECORD MODEL (pure accessors + write validation).
 * ==========================================================================
 *
 * The §4.2 field mapping lives on ResourcePriceRecord (see
 * src/data/priceDatabase2026/types.ts): region → `location`, effective
 * date → `period`, recorded date → `retrievedAt`, source document →
 * `sourceDocument`/`sourceUrl`, verification → `verificationStatus`,
 * version/status → §3.3 fields. This module is the pure reader for that
 * mapping, plus the admin WRITE input model.
 *
 * Two honest nulls, by design:
 *  1. `priceType` / `specContext` / `createdBy` / `updatedBy` are null
 *     when the source (or the environment) does not supply them. A
 *     priceType is never guessed from a name; an admin identity is never
 *     fabricated (without auth, createdBy/updatedBy are null).
 *  2. A missing price is null / absent — never Rp0. The runtime price
 *     master contains only priced records; absence of a record IS the
 *     unresolved state (the resolver returns null). The admin write path
 *     accepts an explicit null price (MasterPriceWriteInput) for a record
 *     shell that is explicitly unresolved; such a shell never enters the
 *     resolver index.
 */
import type {
  MasterPriceType,
  PriceLocation,
  ResourcePriceRecord,
} from '../../../data/priceDatabase2026/types';

/**
 * The §4.2 price-type vocabulary (observed in the current price master).
 * RETAIL was added by Master Pricing §6 (decision j): the material
 * service emits `RETAIL` on 3 verified-retailer rows (Depo Bangunan,
 * sourceType VERIFIED_RETAILER) — a genuine acquisition channel,
 * distinct from wholesale MARKET_REFERENCE and from SUPPLIER /
 * DISTRIBUTOR. The 3 rows are unmatched, so 0/452 priceMaster records
 * carry RETAIL today; the value is stamped on price_rows by the
 * pipeline guard below and becomes live if such a row ever matches.
 */
export const MASTER_PRICE_TYPE_VALUES: readonly MasterPriceType[] = [
  'PROJECT',
  'SUPPLIER',
  'DISTRIBUTOR',
  'GOVERNMENT_REFERENCE',
  'MARKET_REFERENCE',
  'RETAIL',
];

/** Minimum length of a change reason — mirrors price_assumptions.source_note (>= 10). */
export const MASTER_PRICE_REASON_MIN_LENGTH = 10;

// ---------------------------------------------------------------------------
// §4.2 mapped-field readers (region / effective date / recorded date / source)
// ---------------------------------------------------------------------------

/** §4.2 "region" — the record's location (level + province + regency + city). */
export function getPriceRegion(record: ResourcePriceRecord): PriceLocation {
  return record.location;
}

/** §4.2 "effective date" — the start of the record's effective period. */
export function getEffectiveDate(record: ResourcePriceRecord): string {
  return record.period.effectiveFrom;
}

/** §4.2 effective-period end; null = open-ended. */
export function getEffectiveTo(record: ResourcePriceRecord): string | null {
  return record.period.effectiveTo ?? null;
}

/** §4.2 "recorded date" — when the source was retrieved. */
export function getRecordedDate(record: ResourcePriceRecord): string {
  return record.retrievedAt;
}

/** §4.2 "source document / reference". */
export function getSourceReference(record: ResourcePriceRecord): {
  document: string | null;
  url: string | null;
} {
  return { document: record.sourceDocument ?? null, url: record.sourceUrl ?? null };
}

/** §4.2 "created by" / "updated by" — null is the honest value without auth. */
export function getCreatedBy(record: ResourcePriceRecord): string | null {
  return record.createdBy ?? null;
}

export function getUpdatedBy(record: ResourcePriceRecord): string | null {
  return record.updatedBy ?? null;
}

/**
 * §4.3 — the original AHSP source price, preserved independently from
 * the current master price (`price`). Never overwritten by the master
 * price, never used as the live price. Null when no AHSP source price
 * is attached to the record.
 */
export function getOriginalAhspSourcePrice(record: ResourcePriceRecord): number | null {
  return record.originalAhspSourcePrice ?? null;
}

/** The price difference §6.3 needs: master price minus original AHSP source price (null when no source price). */
export function getMasterMinusSourcePriceDifference(record: ResourcePriceRecord): number | null {
  const source = getOriginalAhspSourcePrice(record);
  if (source === null) return null;
  return record.price - source;
}

// ---------------------------------------------------------------------------
// §4.2 price type — field first, then the `priceType=` note the reader stamps
// ---------------------------------------------------------------------------

const PRICE_TYPE_NOTE_PATTERN = /^priceType=(.+)$/;

export function isMasterPriceType(value: string): value is MasterPriceType {
  return (MASTER_PRICE_TYPE_VALUES as readonly string[]).includes(value);
}

/**
 * §4.2 "price type". Prefers the stamped `priceType` field; falls back
 * to the `priceType=` note the material-master reader already stamps on
 * 310/452 current records (data recovery from the record itself — the
 * value is IN the record, not invented). Returns null when neither
 * exists or when the noted value is outside the known vocabulary (a
 * pipeline-drift signal, never silently coerced into a known type).
 */
export function derivePriceType(record: ResourcePriceRecord): MasterPriceType | null {
  if (record.priceType !== undefined && record.priceType !== null) {
    return isMasterPriceType(record.priceType) ? record.priceType : null;
  }
  for (const note of record.notes ?? []) {
    const m = PRICE_TYPE_NOTE_PATTERN.exec(note);
    if (m) return isMasterPriceType(m[1]) ? (m[1] as MasterPriceType) : null;
  }
  return null;
}

/**
 * §4.2 "spec context" — the specification this price applies to.
 * Null when the source carries no specification for this price row.
 * Never derived from the resource name.
 */
export function getSpecContext(record: ResourcePriceRecord): string | null {
  return record.specContext ?? null;
}

// ---------------------------------------------------------------------------
// §4.2 admin WRITE input — explicit-null price stays null, never Rp0
// ---------------------------------------------------------------------------

/**
 * Input for creating/updating ONE global master price record through
 * the (future) admin API. `price: null` means "explicitly unresolved":
 * the record shell exists (identity + context known) but no source
 * price exists. It must never be stored as 0 and never enter the
 * resolver index. `price: 0` is a DIFFERENT, explicit statement — "the
 * actual price is zero" (same rule as resolvePriceStatus) — and is
 * accepted as a resolved zero.
 */
export interface MasterPriceWriteInput {
  resourceId: string;
  price: number | null;
  unit: string;
  location: PriceLocation;
  period: { year: number; month: number | null; label: string; effectiveFrom: string; effectiveTo?: string | null };
  sourceKey: string;
  priceType?: MasterPriceType | null;
  specContext?: string | null;
  sourceDocument?: string | null;
  /** Required: every global price change carries its reason (§4.4). */
  reason: string;
}

export type MasterPriceWriteValidation =
  | { valid: true }
  | { valid: false; errors: string[] };

/** True when the write states "no price" — explicitly unresolved, not Rp0. */
export function isExplicitlyUnresolvedPrice(input: MasterPriceWriteInput): boolean {
  return input.price === null;
}

export function validateMasterPriceWrite(input: MasterPriceWriteInput): MasterPriceWriteValidation {
  const errors: string[] = [];
  if (typeof input.resourceId !== 'string' || input.resourceId.trim() === '') {
    errors.push('resourceId is required');
  }
  if (input.price !== null) {
    if (typeof input.price !== 'number' || !Number.isFinite(input.price)) {
      errors.push('price must be a finite number or null (explicitly unresolved)');
    } else if (input.price < 0) {
      errors.push('price must not be negative');
    }
  }
  if (typeof input.unit !== 'string' || input.unit.trim() === '') {
    errors.push('unit is required');
  }
  // NOTE: PriceLocation.level is typed LocationLevel (a non-empty string
  // union), so `=== ''` cannot type-check; the falsy check rejects a
  // missing/null/empty level from malformed input all the same.
  if (!input.location || !input.location.level) {
    errors.push('location.level is required');
  }
  if (!input.period || typeof input.period.label !== 'string' || input.period.label === '') {
    errors.push('period.label is required');
  }
  if (typeof input.sourceKey !== 'string' || input.sourceKey.trim() === '') {
    errors.push('sourceKey is required');
  }
  if (input.priceType !== undefined && input.priceType !== null && !isMasterPriceType(input.priceType)) {
    errors.push(`priceType '${input.priceType}' is outside the known vocabulary`);
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < MASTER_PRICE_REASON_MIN_LENGTH) {
    errors.push(`reason is required (at least ${MASTER_PRICE_REASON_MIN_LENGTH} characters)`);
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

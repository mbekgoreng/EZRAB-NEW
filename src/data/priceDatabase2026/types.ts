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
 * MASTER PRICING §3.3 — lifecycle status of one price record.
 * A price record is never deleted: it is superseded (a newer version of the
 * same identity takes over) or expired (its effective period ended).
 * Only ACTIVE records participate in resolution.
 */
export type PriceRecordStatus = 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED';

/**
 * MASTER PRICING §4.2 — price type vocabulary. These are the values
 * observed in the current price master + price rows: 310/452 records carry
 * a `priceType=` note stamped by the material-master reader
 * (MARKET_REFERENCE 264, GOVERNMENT_REFERENCE 41, PROJECT 1, SUPPLIER 2,
 * DISTRIBUTOR 2 — counted 2026-11-16 from
 * data/price2026/validated/price_master.json). RETAIL was added by
 * Master Pricing §6 (decision j): the material service emits `RETAIL`
 * on 3 verified-retailer rows (Depo Bangunan, sourceType
 * VERIFIED_RETAILER) — a genuine acquisition channel, distinct from
 * wholesale MARKET_REFERENCE and from SUPPLIER/DISTRIBUTOR. The 3 rows
 * are unmatched, so 0/452 priceMaster records carry RETAIL today; the
 * value is stamped on price_rows and becomes live if such a row ever
 * matches. Do not extend this union without a source that actually emits
 * the value.
 */
export type MasterPriceType =
  | 'PROJECT'
  | 'SUPPLIER'
  | 'DISTRIBUTOR'
  | 'GOVERNMENT_REFERENCE'
  | 'MARKET_REFERENCE'
  | 'RETAIL';

/**
 * PHASE 4 — price identity is NOT the name. It is:
 *   (resourceId, unit, location, period, sourceKey)
 * The `id` is derived deterministically from exactly those components.
 *
 * MASTER PRICING §4.2 — field mapping (no parallel schema):
 *   §4.2 "region"            → `location` (PriceLocation: level + province + regency + city)
 *   §4.2 "effective date"    → `period.effectiveFrom` / `period.effectiveTo`
 *   §4.2 "recorded date"     → `retrievedAt` (ISO date the source was retrieved)
 *   §4.2 "source document"   → `sourceDocument` (+ `sourceUrl` when present)
 *   §4.2 "verification"      → `verificationStatus`
 *   §4.2 "version"/"status"  → `version` / `status` (§3.3)
 *   §4.2 "price type"        → `priceType` (new, §4)
 *   §4.2 "spec context"      → `specContext` (new, §4)
 *   §4.2 "created/updated by"→ `createdBy` / `updatedBy` (new, §4; null without auth)
 *
 * Missing price: a price record with no source price DOES NOT EXIST as a
 * runtime record — absence of a record IS the unresolved state (the
 * resolver returns null, never 0). The admin write path accepts an
 * explicit null price (see MasterPriceWriteInput in
 * src/engine/pricing/admin/masterPriceRecord.ts) for a record shell that
 * is explicitly unresolved; such a shell never enters the resolver index.
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

  // --- MASTER PRICING §3 (§3.2 source identity + §3.3 price identity) ---
  /**
   * The source dataset's OWN stable record identifier, when the source has
   * one (HSD-2026-nnn, MAT-xxxx, LAB-xxx, EQP-xxx, KP-xxx). Null when the
   * source carries no stable record id (e.g. CK/BM workbook rows, which are
   * identified by code+unit only). Never invented: null is the honest value.
   */
  sourceRecordId?: string | null;
  /**
   * Version of this price record within its price identity
   * (resourceId+unit+location+period+sourceKey). Starts at 1. A newer
   * version of the same identity supersedes — never overwrites — v1.
   */
  version?: number;
  /** Lifecycle status (§3.3). Defaults to ACTIVE; see PriceRecordStatus. */
  status?: PriceRecordStatus;

  // --- MASTER PRICING §4.2 (global master price management) ---
  /**
   * §4.2 price type — HOW this price was obtained (project price, supplier
   * quote, distributor price, government reference, market reference).
   * Null when the source does not state one (142/452 current records).
   * Stamped directly by the pipeline (§5, scripts/price2026/
   * normalizePrices.ts) from the source price row, vocabulary-guarded
   * (an out-of-vocabulary source value stamps null, never a coercion).
   * `derivePriceType` (src/engine/pricing/admin/masterPriceRecord.ts)
   * still recovers the legacy `priceType=` note as a fallback for rows
   * produced before §5.
   */
  priceType?: MasterPriceType | null;
  /**
   * §4.2 specification context — the technical specification this price
   * applies to (grade, strength, dimension, capacity). Null when the
   * source carries no specification for this price row. Never guessed
   * from the resource name: a price without a stated spec is a price
   * without a spec context. Stamped by the pipeline (§5,
   * scripts/price2026/normalizePrices.ts) from the source material's
   * `specification` field (material master, HSD, commercial, material
   * library); labor/equipment/legacy rows carry no specification field
   * and stamp null.
   */
  specContext?: string | null;
  /**
   * §4.2 audit identity — the authenticated admin (auth.users id) who
   * created / last updated this record. NULL is the honest value in an
   * environment without authentication (AUTH_ENABLED=false): no admin
   * identity is ever fabricated. Populated only by the server-side admin
   * API once §4.1 enforcement exists.
   */
  createdBy?: string | null;
  updatedBy?: string | null;
  /**
   * §4.3 — the ORIGINAL AHSP source price for this component, preserved
   * independently from the current EZRAB master price (`price`).
   * Populated by §6 resolution from the component's baked unitPrice /
   * DHSP value. NEVER overwritten by the master price and NEVER used as
   * the live price: it exists so the UI and audit can show "master vs
   * source" side by side. Null when no AHSP source price is attached.
   */
  originalAhspSourcePrice?: number | null;
}

/** PHASE 12 — matching priority, most→least trustworthy. */
export type PriceMatchMethod =
  | 'EXACT_CODE' // 1. canonical code == source code, name compatible
  | 'EXACT_SOURCE_ID' // 2. explicit source identifier
  | 'NORMALIZED_CODE_UNIT' // 3. dot/case-insensitive code + same unit
  | 'ALIAS' // 4. explicit, auditable alias entry
  | 'NAME_UNIT' // 5. normalized name + unit — CANDIDATE ONLY → NEEDS_REVIEW
  | 'NAME_KEY' // 6. exact normalized name + unit, code-less canonical component (MARKET_2026 only) — CANDIDATE ONLY → NEEDS_REVIEW
  | 'COMPONENT_REF' // 7. standalone component reference price for mixed-item decomposition (MARKET_2026 kind=COMPONENT only) — CANDIDATE ONLY → NEEDS_REVIEW
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
  /**
   * MASTER PRICING §6.3 — the ORIGINAL AHSP source price for this
   * component (its baked `unitPrice` / DHSP value), supplied by the caller
   * so the resolution can report it alongside the master price and compute
   * `priceDifference`. Never used as the live price. `resolveAhspUnitPrice`
   * passes the component's baked price here automatically.
   */
  originalAhspSourcePrice?: number | null;
  /**
   * MASTER PRICING §6.1 step 4 + §10 — project pricing context. Absent =
   * LIVE_MASTER_PRICE (current master prices, the historical behaviour).
   * SNAPSHOT reads frozen values from `snapshotRef`; OVERRIDE reads
   * project-specific prices from `overrideRef` (populated by the caller
   * from ProjectPriceEngine — the lower resolver never calls the engine
   * itself, so no engine→data import cycle is created).
   */
  pricingContext?: ProjectPricingContext | null;
  /**
   * MASTER PRICING §6 (c) — the query unit BEFORE type-aware
   * normalization (the component's raw unit as stored). Needed ONLY to
   * disambiguate the OJ homonym for OH→OJ conversion: a query OJ that
   * came from raw `jam` is hourly-sense (divide by workHoursPerDay);
   * a native-OJ query is daily-sense (§5 §8) and never divides. Absent
   * = unknown sense = OH→OJ fails closed (no conversion). The OJ→OH
   * direction never needs this field.
   */
  rawUnit?: string | null;
  /**
   * MASTER PRICING §15 (#8) — record-exclusion seam for staged
   * re-preview (price REMOVAL preview): the ids of price records the
   * resolver must pretend do not exist for THIS query. The resolution
   * then falls to the next-best candidate (next ACTIVE record, then
   * baked AHSP fallback, then unpriced) — exactly the post-removal
   * state a removal preview must measure. Opt-in and additive: absent
   * (or empty), resolution is byte-identical to the historical path.
   * Excluded ids never appear in `alternatives`, and the explanation
   * names the exclusion count. Context prices (SNAPSHOT / OVERRIDE)
   * are NOT affected — an explicit stored price is not a record in
   * the live index. Record ids are the `id` of `ResourcePriceRecord`
   * (see `recordId` on the resolution); the caller discovers the
   * winning record's id from a first, unexcluded resolve.
   */
  excludeRecordIds?: ReadonlySet<string>;
}

/**
 * MASTER PRICING §6.1 step 4 + §10 — project pricing context, carried
 * through the resolution path as an OPTIONAL parameter. Old callers that
 * pass nothing keep the historical behaviour (LIVE_MASTER_PRICE).
 */
export interface ProjectPricingContext {
  /** Defaults to 'LIVE_MASTER_PRICE' when absent. */
  pricingMode?: ProjectPricingMode;
  /** Frozen per-component prices for SNAPSHOT_PRICE mode. */
  snapshotRef?: ComponentPriceMapRef | null;
  /** Project-specific override prices for PROJECT_OVERRIDE mode. */
  overrideRef?: ComponentPriceMapRef | null;
}

/**
 * MASTER PRICING §6 — a lookup of per-component prices, keyed by component
 * key. Keys are tried in order: loose-code key (`LOOSECODE|normalizedUnit`,
 * e.g. `M57A|kg`) first, then normalized-name key (`normalized name|unit`,
 * e.g. `besi beton|kg`) for components that carry no code. A map may carry
 * either or both kinds of keys. Values are unit prices in IDR; a missing
 * key means "this context has no price for the component" (the resolver
 * then falls back to live resolution and records the fallback — it never
 * invents a price for a missing key).
 */
export interface ComponentPriceMapRef {
  pricesByComponentKey: Readonly<Record<string, number>>;
  /** Human-readable label for provenance (snapshot id, override record id). */
  label?: string | null;
  /** Database versions the frozen values were taken against (§3 I-11). */
  masterPriceVersion?: string | null;
  ahspDatabaseVersion?: string | null;
}

/**
 * MASTER PRICING §13 (#4) — the per-component price snapshot of ONE
 * estimate version, captured at pin/adoption time. `EstimateVersion`
 * stores per-ITEM frozen totals (`rabItemsSnapshot`), which CANNOT be
 * decomposed into per-component prices — so the component map must
 * be CAPTURED when the version is pinned (adoption approval), never
 * derived afterwards. Capture is implemented (§14 need #2:
 * `buildAdoptionSnapshotMap` + `approveAdoption` step 11, QTO wired
 * via `buildSnapshotRefFromProject`). Until a version carries this
 * map, QTO SNAPSHOT mode falls through to live resolution with a
 * labelled note (§12) — the absence is honest, not a silent
 * substitution.
 */
export interface ProjectPriceSnapshotMap {
  /** The estimate version this map was captured from. */
  estimateVersionId: string;
  /** Per-component frozen prices, keyed exactly like ComponentPriceMapRef (`LOOSECODE|unit` and/or normalized-name keys). */
  pricesByComponentKey: Readonly<Record<string, number>>;
  /** Database versions the frozen values were taken against (§3 I-11). */
  masterPriceVersion: string | null;
  ahspDatabaseVersion: string | null;
  /** ISO timestamp the map was captured. */
  capturedAt: string;
}

/**
 * MASTER PRICING §6 (h) — a NEEDS_REVIEW flag carried on a resolution.
 * The price is still returned (the flag marks it, it does not block it);
 * the flag names the open §5 decision and lists the alternatives so the
 * resolution is never silent about its ambiguity.
 */
export interface NeedsReviewFlag {
  /** Which §5 register the flag comes from. */
  kind: 'AMBIGUITY' | 'CONFLICT';
  /** The component key the flag is attached to (`LOOSECODE|unit`). */
  componentKey: string;
  /** The §5 reason/evidence, verbatim from fase5-decisions.json. */
  reason: string;
  /** Competing component keys (ambiguity) or source price spread (conflict). */
  alternatives: string[];
}

/**
 * MASTER PRICING §6 (i) — an underspecified-key marker. `action` REFUSE
 * means the resolver declined to bind this key to a single price (the
 * resolution is NOT_FOUND and the explanation + alternatives name the
 * spread); FLAG means the price was returned but the key is known to
 * conflate several specifications (the flag + alternatives make the
 * ambiguity explicit instead of silent).
 */
export interface UnderspecifiedKeyFlag {
  componentKey: string;
  action: 'REFUSE' | 'FLAG';
  reason: string;
  /** The candidate prices that prove the key is underspecified. */
  alternatives: string[];
}

/**
 * MASTER PRICING §6.1 step 8 + §7 — a unit conversion applied during
 * resolution. Present only when the returned price was converted from a
 * record in another unit; the factor and its documented basis are always
 * recorded (never a silent conversion).
 */
export interface UnitConversionApplied {
  /** Unit the source record was priced in. */
  fromUnit: string;
  /** Unit the query asked for. */
  toUnit: string;
  /** Multiplicative price factor (price per `toUnit` = record price × factor). */
  factor: number;
  /** Where the factor comes from: dimensional whitelist or documented work-hours basis. */
  basis: string;
}

/**
 * MASTER PRICING §7 — the documented basis of an OJ (Orang-Jam) value.
 * OJ is a HOMONYM (§5 §8): the same label denotes a DAY in canonical
 * AHSP components and in the HSD source, and an HOUR in the LABOR
 * source (OJ = OH / workHoursPerDay) and in the BM OJ twins (hourly
 * rates relabelled OJ). A basis is only ever claimed on DOCUMENTED
 * evidence; anything else is OJ_UNDOCUMENTED — never guessed.
 */
export type OjBasis = 'OJ_DAY' | 'OJ_HOUR' | 'OJ_UNDOCUMENTED';

/**
 * MASTER PRICING §7 — the OJ-basis flag carried on a resolution (and,
 * via `resolveAhspUnitPrice`, on the component pricing). The flag MARKS
 * a binding, it never blocks it: same-unit OJ bindings are unchanged
 * by §7 — but a daily query bound to an hourly record is now visible
 * instead of silent (`basisMismatch`), so the known underprice
 * exposure (BM twins, LABOR OJ) is auditable per resolution.
 */
export interface OjBasisFlag {
  /** Basis of the query's OJ (from the query's raw unit, §5 §8). Null when the query is not OJ. */
  queryBasis: OjBasis | null;
  /** Basis of the winning record's OJ (from the record's source/notes). Null when the winner is not an OJ record. */
  recordBasis: OjBasis | null;
  /** True when a daily-basis side bound an hourly-basis side (or vice versa) — a known under/overprice risk. */
  basisMismatch: boolean;
  /** Short documented evidence for both sides. */
  evidence: string;
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

  // --- MASTER PRICING §6.3 (central resolution metadata) ---
  /**
   * Canonical entity id (RES-xxx) the price is bound to — the
   * `resourceId` of the winning record, null when the price comes from a
   * direct CK/BM source with no canonical entity binding. Same value as
   * `resourceId` by construction; exposed under the §6.3 field name so
   * callers need not guess which field carries the canonical identity.
   */
  canonicalEntityId?: string | null;
  /**
   * MASTER PRICING §15 (#8) — the `id` of the winning price record
   * (`ResourcePriceRecord.id`), so a caller can name "record X" for a
   * staged re-preview exclusion (`query.excludeRecordIds`). Null when
   * no record won: NOT_FOUND resolutions, and context answers
   * (SNAPSHOT / OVERRIDE), which carry a stored price, not a record.
   * Undefined on resolutions built before this field existed (the
   * `notFound` base) — callers must treat undefined as "no record".
   */
  recordId?: string | null;
  /**
   * The original AHSP source price for this component (echo of
   * `query.originalAhspSourcePrice`), preserved independently from the
   * resolved master price. Null when the caller attached no source price.
   */
  originalAhspSourcePrice?: number | null;
  /**
   * Resolved master price minus original AHSP source price (master kini −
   * sumber AHSP asli). Null when either side is missing. A negative value
   * means the master price is LOWER than the AHSP source price.
   */
  priceDifference?: number | null;
  /** §6 (h) — NEEDS_REVIEW flag, when the queried key is in the §5 register. */
  needsReview?: NeedsReviewFlag | null;
  /** §6 (i) — underspecified-key marker, when the queried key is underspecified. */
  underspecified?: UnderspecifiedKeyFlag | null;
  /** §6.1 step 8 + §7 — conversion applied, when the price was converted across units. */
  unitConversion?: UnitConversionApplied | null;
  /** §6.1 step 4 + §10 — pricing mode the resolution was served under. */
  pricingMode?: ProjectPricingMode;
  /** §7 — OJ-basis flag, when the query or the winning record is OJ. Null otherwise. */
  ojBasis?: OjBasisFlag | null;
  /**
   * §7 — UNIT_MISSING: the query carried NO unit (empty after
   * normalization). The price outcome is UNCHANGED (the resolver still
   * answers by name/code when it can) — but the missing unit is now
   * flagged instead of silent. Never assume a unit.
   */
  unitMissing?: boolean;
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
  /** Batch 4: WHY this component could not be priced (e.g. UNIT_MISMATCH),
   *  carried from the resource resolution explanation. Null when resolved. */
  unresolvedReason?: string | null;
  // --- MASTER PRICING §6.3 (carried from the component's resolution) ---
  /** Canonical entity id (RES-xxx) the component price is bound to; null when unbound. */
  canonicalEntityId?: string | null;
  /** The component's own baked AHSP source price (`unitPrice` on the component), if any. */
  originalAhspSourcePrice?: number | null;
  /** Resolved master price minus original AHSP source price; null when either side is missing. */
  priceDifference?: number | null;
  /** §6 (h) — NEEDS_REVIEW flag for this component's key, when registered. */
  needsReview?: NeedsReviewFlag | null;
  /** §6 (i) — underspecified-key marker for this component's key, when registered. */
  underspecified?: UnderspecifiedKeyFlag | null;
  /** §6.1 step 8 + §7 — conversion applied to this component's price, when any. */
  unitConversion?: UnitConversionApplied | null;
  /** §6.1 step 4 + §10 — pricing mode this component was priced under. */
  pricingMode?: ProjectPricingMode;
  /** §7 — OJ-basis flag for this component's resolution, when the query or winner is OJ. */
  ojBasis?: OjBasisFlag | null;
  /** §7 — UNIT_MISSING: the component carried no unit. Price outcome unchanged; the gap is flagged. */
  unitMissing?: boolean;
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
  /** Component names that could not be priced (PHASE 19 — never hidden).
   *  Batch 4: `reason` carries the resolution explanation (e.g. UNIT_MISMATCH). */
  missing: Array<{ type: string; code: string; name: string; unit: string; reason?: string }>;
  warnings: string[];
  /**
   * MASTER PRICING §6.1 step 4 + §10 — pricing mode this composition was
   * priced under. LIVE_MASTER_PRICE when no context was supplied (the
   * historical behaviour). SNAPSHOT_PRICE / PROJECT_OVERRIDE when the
   * caller supplied a pricing context with that mode.
   */
  pricingMode?: ProjectPricingMode;
}

// ============================================================================
// 8. MASTER PRICING §3 — CANONICAL MODEL VERSIONS, PRICING MODES, SOURCE IDENTITY
// ============================================================================

/**
 * Version of the EZRAB master price database (priceMaster + the direct
 * CK/BM sources the resolver reads). `2026.1` is the FIRST versioned
 * baseline, established by Master Pricing §3 (2026-11-16) for the price
 * database as regenerated by the §3 pipeline — it is a label for the
 * current dataset state, not a claim about an external versioning scheme.
 * The label `2026.1` is already the de-facto version string in the repo
 * (data/price2026/aliases.json `version`, WorkItemInspectorDrawer snapshot
 * `version`). §8 (AHSP versioning) governs how this value advances.
 */
export const MASTER_PRICE_VERSION = '2026.1';

/**
 * Project pricing mode (§10, D5). `SNAPSHOT_PRICE` is the safe default for
 * every existing project and every snapshot (Decision D: historical projects
 * are never silently rewritten by a master price update); NEW projects
 * default to `LIVE_MASTER_PRICE` (`DEFAULT_NEW_PROJECT_PRICING_MODE`).
 * Behaviour lives in `src/engine/pricing/projectPriceModes.ts` (§10).
 */
export type ProjectPricingMode =
  | 'LIVE_MASTER_PRICE'
  | 'SNAPSHOT_PRICE'
  | 'PROJECT_OVERRIDE';

/** Safe default pricing mode for snapshots and existing projects (§10/D). */
export const DEFAULT_SNAPSHOT_PRICING_MODE: ProjectPricingMode = 'SNAPSHOT_PRICE';

/** Default pricing mode for NEW projects (§10 (a) / D5): a new project follows live master prices. */
export const DEFAULT_NEW_PROJECT_PRICING_MODE: ProjectPricingMode = 'LIVE_MASTER_PRICE';

/** The three valid pricing-mode values (§10 (a)). */
export const PROJECT_PRICING_MODES: readonly ProjectPricingMode[] = [
  'LIVE_MASTER_PRICE',
  'SNAPSHOT_PRICE',
  'PROJECT_OVERRIDE',
];

/**
 * MASTER PRICING §10 (a) — the single mode validator. An unrecognised
 * mode string is NEVER coerced (fail-closed, Decision D): callers throw
 * on `false` rather than guessing a mode.
 */
export function isValidProjectPricingMode(value: unknown): value is ProjectPricingMode {
  return value === 'LIVE_MASTER_PRICE' || value === 'SNAPSHOT_PRICE' || value === 'PROJECT_OVERRIDE';
}

/**
 * §3.2 — ONE binding in the source identity registry: one canonical entity
 * (RES-xxx) may have MANY source references. A binding is an IDENTITY link,
 * not a price: it says "this source record refers to this canonical
 * entity". Prices stay on ResourcePriceRecord (§3.3).
 *
 * Only VERIFIED bindings enter the registry. A candidate that is not proven
 * does not enter at all — or enters with verificationStatus NEEDS_REVIEW
 * and an explicit verificationNote. Nothing here is ever name-guessed.
 */
export interface SourceIdentityBinding {
  /** Canonical entity id (RES-xxx). Always a real entity, never RES-KEY-*. */
  resourceId: string;
  /** Source type label carried from the price record (GOVERNMENT_REFERENCE, EZRAB_DATABASE, MARKET_REFERENCE, …). */
  sourceType: string;
  /** Source dataset key: HSD_2026, LABOR_2026, EQUIPMENT_2026, MATERIAL_MASTER_2026, MATERIAL_LIBRARY, COMMERCIAL_2026, CK_HSD_2026, BM_HSD_2026. */
  sourceDataset: string;
  /** The source's own stable record id (HSD-2026-nnn, MAT-xxxx, …). Null when the source has none. */
  sourceRecordId: string | null;
  /** Code as printed by the source (M-022, L.01, E.11, MAT-0001, …). */
  sourceCode: string;
  /** Description EXACTLY as the source printed it (pre-match — the matcher overwrites resourceName with the component-key name). */
  originalDescription: string;
  /** Unit EXACTLY as the source printed it. */
  originalUnit: string;
  /** AHSP component code this binding resolves through (e.g. M03, L01), when applicable. */
  ahspComponentCode: string | null;
  /** Source document (SE 12/SE/Db/2026, SE DJBK 47/2026 Lampiran V/VI, …). */
  sourceDocument: string | null;
  /** How this binding was established (same vocabulary as the pipeline). */
  matchMethod: PriceMatchMethod;
  matchConfidence: number; // 0..1
  verificationStatus: PriceVerificationStatus;
  /** Explicit reason when verificationStatus is NEEDS_REVIEW; null otherwise. */
  verificationNote: string | null;
  /** Back-link to the price record this binding was derived from (priceMaster only; null for direct CK/BM bindings, which carry no price record). */
  priceRecordId: string | null;
  /** Registry generation timestamp (ISO). */
  createdAt: string;
}

/** A source row that could NOT be bound to a canonical entity — recorded with its reason, never silently dropped. */
export interface UnboundSourceReference {
  sourceDataset: string;
  sourceRecordId: string | null;
  sourceCode: string;
  originalDescription: string;
  originalUnit: string;
  reason: 'NO_COMPONENT_KEY' | 'NO_CANONICAL_ENTITY' | 'NAME_GATE_REJECTED' | 'TYPE_MISMATCH' | 'QUARANTINED_KEY';
  detail: string;
}

/** The validated registry file (data/price2026/validated/source_identity_registry.json). */
export interface SourceIdentityRegistryFile {
  generatedAt: string;
  version: string;
  counts: {
    bindings: number;
    entities: number;
    byDataset: Record<string, number>;
    byVerificationStatus: Record<string, number>;
    unbound: number;
  };
  /** Build diagnostics (rows scanned, duplicates collapsed, gate rejections). Informational only. */
  stats?: Record<string, number>;
  bindings: SourceIdentityBinding[];
  unbound: UnboundSourceReference[];
}

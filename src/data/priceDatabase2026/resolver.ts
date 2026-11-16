/**
 * EZRAB PRICE DATABASE 2026 — RUNTIME PRICE RESOLVER
 * ==================================================
 *
 * THE single entry point through which every price in EZRAB must pass: AHSP unit
 * prices, RAB rows, the price-detail UI and Magic AI all call THIS resolver. There is
 * no second path and no fallback constant.
 *
 * Load-bearing rules (see EZRAB_PRICE_ZERO_ROOT_CAUSE.md):
 *
 *   1. A missing price is `null`. It is NEVER converted to 0. `Rp 0` in the UI can
 *      therefore only ever mean "the computation genuinely produced zero", never
 *      "we do not know".
 *   2. Every resolved price carries its provenance: source, tier, priority, document,
 *      location, period and the method by which it was bound to the resource.
 *   3. Location and period fallbacks happen ONLY when explicitly opted in, and every
 *      fallback is recorded in the result (`locationFallback` / `periodFallback`).
 *   4. Conflicts between sources are resolved by the audited priority ladder and the
 *      losing candidates are returned in `alternatives` — never silently dropped.
 *
 * MASTER PRICING §6 (central resolution, design D3) extends this resolver in
 * place — there is still no second resolver:
 *
 *   5. NAME GATE on loose-code candidates: a code match whose names are
 *      incompatible (similarity < 0.34) is rejected and falls through to
 *      the name path (CK L.10 `Sopir` no longer prices the BM key
 *      `Akhli Madya Lingkungan`). Exception codes M05/E41/E07/E11 and
 *      the `belum tersedia` label follow the BM adapter ladder rules.
 *   6. PROJECT PRICING CONTEXT (optional): LIVE_MASTER_PRICE (default),
 *      SNAPSHOT_PRICE and PROJECT_OVERRIDE. Context prices are explicit
 *      stored values, never binding guesses.
 *   7. DOCUMENTED UNIT CONVERSION: an explicit dimensional whitelist
 *      (ton↔kg, m↔cm, m³↔liter) via CanonicalUnitRegistry +
 *      UnitEngine.convert, plus OJ↔OH on a record's own documented
 *      `workHoursPerDay`. The OJ↔OH conversion is ASYMMETRIC: OJ→OH
 *      always applies on a documented basis, but OH→OJ applies only
 *      when the query OJ is hourly-sense (the component's raw unit was
 *      `jam`) — a native-OJ query is a day (§5 §8), and dividing a
 *      daily price by 7 would be a 7× underprice. Anything else stays
 *      UNIT_MISMATCH.
 *   8. NEEDS_REVIEW flags (§5 open decisions) and underspecified-key
 *      markers ride on every resolution; REFUSE keys (M241|m, EI734|kg,
 *      EI374|kg, generic `beton`) are declined a single price.
 *   9. DHSP is read only through `dhspMapReader` (uniform reader, I-9);
 *      the AHSP composition cache is version-keyed and invalidated by
 *      `invalidateAhspCache()` (§13.3).
 *
 * MASTER PRICING §15 (#8) adds the record-exclusion seam for staged
 * re-preview (price REMOVAL preview):
 *
 *  10. `query.excludeRecordIds` (opt-in): the resolver pretends the
 *      listed record ids do not exist for this query and falls to the
 *      next-best candidate — the post-removal state. Exclusion applies
 *      to the code/name pools AND the conversion pools, never to
 *      context prices (SNAPSHOT / OVERRIDE), and exclusion compositions
 *      never touch the default AHSP cache. Absent, behaviour is
 *      byte-identical to the historical path. The winning record's id
 *      is exposed as `recordId` on RESOLVED results so a caller can
 *      name "record X" for exclusion.
 */

import { RESOURCE_PRICE_RECORDS } from './priceMaster.generated';
import {
  OFFICIAL_CK_2026_MATERIALS,
  OFFICIAL_CK_2026_LABOR,
  OFFICIAL_CK_2026_EQUIPMENT,
} from '../nationalCostDatabase/officialCiptaKaryaPrices2026';
import {
  OFFICIAL_BM_2026_MATERIALS,
  OFFICIAL_BM_2026_LABOR,
  OFFICIAL_BM_2026_EQUIPMENT,
} from '../nationalCostDatabase/binaMarga2026Adapter';
// MASTER PRICING §6 (g): DHSP is read ONLY through the uniform reader
// (I-9 seam from §3) — the resolver no longer touches the two raw maps.
import { getDhspEntry } from '../nationalCostDatabase/dhspMapReader';
// MASTER PRICING §6: central-resolution rules (name gate, unit
// conversion, pricing context) + the §5 NEEDS_REVIEW / underspecified
// registries. The resolver orchestrates; the rules live in those modules.
import {
  codeNameGate,
  conversionForRecord,
  convertibleUnitsFor,
  lookupContextPrice,
  ojBasisFlagFor,
  resolvePricingMode,
  stripUnitAnnotation,
  validateLocationPeriod,
} from './centralResolution';
import {
  componentKeyFor,
  getNeedsReviewFlag,
  getUnderspecifiedRule,
} from './needsReviewRegistry';
import type {
  AhspCategoryPricing,
  AhspComponentPricing,
  AhspUnitPriceComposition,
  LocationLevel,
  PriceFallbackKind,
  PriceLocation,
  PricingStatus,
  ResourcePriceQuery,
  ResourcePriceRecord,
  ResourcePriceResolution,
  ResourceType,
  UnitConversionApplied,
} from './types';
import { componentTypeFromCode, looseCode, normalizeUnit, normalizeUnitForType } from './normalize';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normLoc(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * How well a record's location satisfies the request. 0 = best.
 * Only called when the request actually names a location.
 */
function locationTier(rec: PriceLocation, q: NonNullable<ResourcePriceQuery['location']>): number {
  const qProv = normLoc(q.provinceName);
  const qReg = normLoc(q.regencyName || q.cityName);

  if (qReg) {
    const rReg = normLoc(rec.regencyName || rec.cityName);
    if (rReg && rReg === qReg) return 0;
    if (qProv && normLoc(rec.provinceName) === qProv) return 1;
    if (rec.level === 'NATIONAL') return 2;
    return 4;
  }
  if (qProv) {
    if (rec.level === 'PROVINCE' && normLoc(rec.provinceName) === qProv) return 0;
    if (rec.level === 'CITY' && normLoc(rec.provinceName) === qProv) return 1;
    if (rec.level === 'NATIONAL') return 2;
    return 4;
  }
  return rec.level === 'NATIONAL' ? 0 : 1;
}

/** How well a record's period satisfies the request. 0 = best. */
function periodTier(rec: ResourcePriceRecord, p: NonNullable<ResourcePriceQuery['period']>): number {
  if (rec.period.year !== p.year) return 2;
  const m = p.month ?? null;
  if (m == null) return 0;
  if (rec.period.month === m || rec.period.month == null) return 0;
  return 1;
}

function fallbackKindForLocation(hasRequest: boolean, tier: number): PriceFallbackKind {
  if (!hasRequest || tier === 0) return 'NONE';
  return tier === 1 ? 'PROVINCE' : 'NATIONAL';
}

function fallbackKindForPeriod(
  hasRequest: boolean,
  tier: number,
  rec: ResourcePriceRecord,
  p: NonNullable<ResourcePriceQuery['period']>
): PriceFallbackKind {
  if (!hasRequest || tier === 0) return 'NONE';
  const m = p.month ?? 12;
  const recKey = rec.period.year * 100 + (rec.period.month ?? 12);
  const reqKey = p.year * 100 + m;
  return recKey <= reqKey ? 'PREVIOUS_PERIOD' : 'NEXT_PERIOD';
}

function normResourceName(s: string): string {
  // MASTER PRICING §7: strip parenthetical unit annotations FIRST
  // (`Air (m3)` → `Air`) — the token is redundant with the unit field
  // and must not break exact-name matching on either side (index keys
  // and query keys both flow through here). See stripUnitAnnotation.
  return stripUnitAnnotation(s)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One candidate with its policy tiers (extracted from the inline scorer
 *  so the normal path and the conversion paths score identically). */
interface ScoredCandidate {
  r: ResourcePriceRecord;
  locTier: number;
  perTier: number;
  domainTier: number;
}

/** A converted winner: the best convertible record, its conversion spec,
 *  and the pool it was picked from (for alternatives / refusal lists). */
interface ConvertedWinner {
  best: ScoredCandidate;
  conversion: UnitConversionApplied;
  pool: ResourcePriceRecord[];
}

/**
 * MASTER PRICING §15 (#8) — record-exclusion filter, shared by the
 * main candidate pools and the conversion pools. Returns the pool
 * unchanged (same reference) when no exclusion is active, so legacy
 * queries pay nothing and behave byte-identically. When active, drops
 * every record whose id is listed and records the removed ids into
 * `counter` — a SET, because one record can surface in several pools
 * (code pool, name fallback pool, conversion pool) and the
 * explanation note must count DISTINCT records removed, not pool
 * entries (a first version counted pool entries and reported 10
 * removals for 5 excluded ids — the probe caught it).
 */
function filterExcluded(
  pool: ResourcePriceRecord[],
  excluded: ReadonlySet<string> | undefined,
  counter?: { removed: Set<string> },
): ResourcePriceRecord[] {
  if (!excluded || excluded.size === 0) return pool;
  const kept = pool.filter((r) => {
    if (!excluded.has(r.id)) return true;
    counter?.removed.add(r.id);
    return false;
  });
  return kept;
}

// ---------------------------------------------------------------------------
// resolver
// ---------------------------------------------------------------------------

export class PriceResolver2026 {
  private static instance: PriceResolver2026 | null = null;

  public static getInstance(): PriceResolver2026 {
    if (!PriceResolver2026.instance) PriceResolver2026.instance = new PriceResolver2026();
    return PriceResolver2026.instance;
  }

  private readonly records: ResourcePriceRecord[] = RESOURCE_PRICE_RECORDS;
  private readonly byResourceId = new Map<string, ResourcePriceRecord[]>();
  private readonly byLooseCodeUnit = new Map<string, ResourcePriceRecord[]>();
  private readonly byNameUnit = new Map<string, ResourcePriceRecord[]>();
  private readonly byName = new Map<string, ResourcePriceRecord[]>();
  private readonly ahspDefaultCache = new Map<string, AhspUnitPriceComposition>();
  /** MASTER PRICING §6 (f): every distinct record id ever indexed
   *  (priceMaster + CK + BM adapter + OJ twins) — the TRUE index size. */
  private readonly indexedIds = new Set<string>();
  /** MASTER PRICING §6 (d) + §13.3: cache generation. Bumped by
   *  `invalidateAhspCache()`; cache keys carry it, so entries computed
   *  under an older generation can never be served again. */
  private cacheVersion = 0;
  private indexed = false;

  private ensureIndex(): void {
    if (this.indexed) return;

    const indexRecord = (r: ResourcePriceRecord) => {
      this.indexedIds.add(r.id);
      if (r.resourceId) {
        const k = r.resourceId;
        if (!this.byResourceId.has(k)) this.byResourceId.set(k, []);
        this.byResourceId.get(k)!.push(r);
      }
      if (r.resourceCode) {
        const k2 = `${looseCode(r.resourceCode)}|${r.unit}`;
        if (!this.byLooseCodeUnit.has(k2)) this.byLooseCodeUnit.set(k2, []);
        this.byLooseCodeUnit.get(k2)!.push(r);
      }
      if (r.resourceName) {
        const n = normResourceName(r.resourceName);
        const k3 = `${n}|${r.unit}`;
        if (!this.byNameUnit.has(k3)) this.byNameUnit.set(k3, []);
        this.byNameUnit.get(k3)!.push(r);

        if (!this.byName.has(n)) this.byName.set(n, []);
        this.byName.get(n)!.push(r);
      }
    };

    for (const r of this.records) {
      indexRecord(r);
    }

    // Ingest Cipta Karya Official Price Master (SE DJBK No. 47/SE/Dk/2026)
    OFFICIAL_CK_2026_LABOR.forEach((l, idx) => {
      const u = normalizeUnit(l.unit);
      indexRecord({
        id: `PRC-CK2026-L-${idx}`,
        resourceId: null,
        resourceCode: l.code || '',
        resourceName: l.name,
        resourceType: 'labor',
        unit: u,
        unitRaw: l.unit,
        price: l.price,
        currency: 'IDR',
        location: { level: 'NATIONAL' },
        period: { year: 2026, month: null, label: '2026', effectiveFrom: '2026-01-01' },
        sourceKey: 'CK_HSD_2026',
        sourceTier: 'OFFICIAL_GOVERNMENT',
        sourcePriority: 1,
        sourceName: 'Standar Upah Cipta Karya SE 47/2026',
        sourceType: 'GOVERNMENT_REFERENCE',
        sourceDocument: 'SE DJBK No. 47/SE/Dk/2026 Lampiran VI',
        retrievedAt: '2026-09-28',
        verificationStatus: 'VERIFIED',
        matchMethod: l.code ? 'EXACT_CODE' : 'EXACT_SOURCE_ID',
        matchConfidence: 1.0,
        notes: ['Official Cipta Karya 2026 labor rate'],
      });
    });

    OFFICIAL_CK_2026_MATERIALS.forEach((m, idx) => {
      const u = normalizeUnit(m.unit);
      indexRecord({
        id: `PRC-CK2026-M-${idx}`,
        resourceId: null,
        resourceCode: m.code || '',
        resourceName: m.name,
        resourceType: 'material',
        unit: u,
        unitRaw: m.unit,
        price: m.price,
        currency: 'IDR',
        location: { level: 'NATIONAL' },
        period: { year: 2026, month: null, label: '2026', effectiveFrom: '2026-01-01' },
        sourceKey: 'CK_HSD_2026',
        sourceTier: 'OFFICIAL_GOVERNMENT',
        sourcePriority: 1,
        sourceName: 'Standar Bahan Cipta Karya SE 47/2026',
        sourceType: 'GOVERNMENT_REFERENCE',
        sourceDocument: 'SE DJBK No. 47/SE/Dk/2026 Lampiran VI',
        retrievedAt: '2026-09-28',
        verificationStatus: 'VERIFIED',
        matchMethod: m.code ? 'EXACT_CODE' : 'EXACT_SOURCE_ID',
        matchConfidence: 1.0,
        notes: ['Official Cipta Karya 2026 material price'],
      });
    });

    OFFICIAL_CK_2026_EQUIPMENT.forEach((e, idx) => {
      const u = normalizeUnit(e.unit);
      indexRecord({
        id: `PRC-CK2026-E-${idx}`,
        resourceId: null,
        resourceCode: e.code || '',
        resourceName: e.name,
        resourceType: 'equipment',
        unit: u,
        unitRaw: e.unit,
        price: e.price,
        currency: 'IDR',
        location: { level: 'NATIONAL' },
        period: { year: 2026, month: null, label: '2026', effectiveFrom: '2026-01-01' },
        sourceKey: 'CK_HSD_2026',
        sourceTier: 'OFFICIAL_GOVERNMENT',
        sourcePriority: 1,
        sourceName: 'Standar Sewa Alat Cipta Karya SE 47/2026',
        sourceType: 'GOVERNMENT_REFERENCE',
        sourceDocument: 'SE DJBK No. 47/SE/Dk/2026 Lampiran VI',
        retrievedAt: '2026-09-28',
        verificationStatus: 'VERIFIED',
        matchMethod: e.code ? 'EXACT_CODE' : 'EXACT_SOURCE_ID',
        matchConfidence: 1.0,
        notes: ['Official Cipta Karya 2026 equipment rental rate'],
      });
    });

    // Ingest Bina Marga Official Price Master (SE DJBK No. 47/SE/Dk/2026 Lampiran V)
    OFFICIAL_BM_2026_LABOR.forEach((l, idx) => {
      const u = normalizeUnit(l.unit);
      const entry: ResourcePriceRecord = {
        id: `PRC-BM2026-L-${idx}`,
        resourceId: null,
        resourceCode: l.code || '',
        resourceName: l.name,
        resourceType: 'labor',
        unit: u,
        unitRaw: l.unit,
        price: l.price,
        currency: 'IDR',
        location: { level: 'NATIONAL' },
        period: { year: 2026, month: null, label: '2026', effectiveFrom: '2026-01-01' },
        sourceKey: 'BM_HSD_2026',
        sourceTier: 'OFFICIAL_GOVERNMENT',
        sourcePriority: 1,
        sourceName: 'Standar Upah Bina Marga SE 47/2026',
        sourceType: 'GOVERNMENT_REFERENCE',
        sourceDocument: 'SE DJBK No. 47/SE/Dk/2026 Lampiran V',
        retrievedAt: '2026-09-28',
        verificationStatus: 'VERIFIED',
        matchMethod: l.code ? 'EXACT_CODE' : 'EXACT_SOURCE_ID',
        matchConfidence: 1.0,
        notes: ['Official Bina Marga 2026 labor rate', `Sheet: ${l.sourceSheet}, Row: ${l.sourceRow}`],
      };
      indexRecord(entry);
      if (u === 'jam') {
        indexRecord({
          ...entry,
          id: `PRC-BM2026-L-${idx}-oj`,
          unit: 'OJ',
        });
      }
    });

    OFFICIAL_BM_2026_MATERIALS.forEach((m, idx) => {
      const u = normalizeUnit(m.unit);
      indexRecord({
        id: `PRC-BM2026-M-${idx}`,
        resourceId: null,
        resourceCode: m.code || '',
        resourceName: m.name,
        resourceType: 'material',
        unit: u,
        unitRaw: m.unit,
        price: m.price,
        currency: 'IDR',
        location: { level: 'NATIONAL' },
        period: { year: 2026, month: null, label: '2026', effectiveFrom: '2026-01-01' },
        sourceKey: 'BM_HSD_2026',
        sourceTier: 'OFFICIAL_GOVERNMENT',
        sourcePriority: 1,
        sourceName: 'Standar Bahan Bina Marga SE 47/2026',
        sourceType: 'GOVERNMENT_REFERENCE',
        sourceDocument: 'SE DJBK No. 47/SE/Dk/2026 Lampiran V',
        retrievedAt: '2026-09-28',
        verificationStatus: 'VERIFIED',
        matchMethod: m.code ? 'EXACT_CODE' : 'EXACT_SOURCE_ID',
        matchConfidence: 1.0,
        notes: ['Official Bina Marga 2026 material price', `Sheet: ${m.sourceSheet}, Row: ${m.sourceRow}`],
      });
    });

    OFFICIAL_BM_2026_EQUIPMENT.forEach((e, idx) => {
      const u = normalizeUnit(e.unit);
      indexRecord({
        id: `PRC-BM2026-E-${idx}`,
        resourceId: null,
        resourceCode: e.code || '',
        resourceName: e.name,
        resourceType: 'equipment',
        unit: u,
        unitRaw: e.unit,
        price: e.price,
        currency: 'IDR',
        location: { level: 'NATIONAL' },
        period: { year: 2026, month: null, label: '2026', effectiveFrom: '2026-01-01' },
        sourceKey: 'BM_HSD_2026',
        sourceTier: 'OFFICIAL_GOVERNMENT',
        sourcePriority: 1,
        sourceName: 'Standar Sewa Alat Bina Marga SE 47/2026',
        sourceType: 'GOVERNMENT_REFERENCE',
        sourceDocument: 'SE DJBK No. 47/SE/Dk/2026 Lampiran V',
        retrievedAt: '2026-09-28',
        verificationStatus: 'VERIFIED',
        matchMethod: e.code ? 'EXACT_CODE' : 'EXACT_SOURCE_ID',
        matchConfidence: 1.0,
        notes: ['Official Bina Marga 2026 equipment rental rate', `Sheet: ${e.sourceSheet}, Row: ${e.sourceRow}`],
      });
    });

    this.indexed = true;
  }

  /**
   * Total number of price records available to the resolver.
   * MASTER PRICING §6 (f): this is the ACTUAL runtime index size
   * (priceMaster 452 + CK 3.323 + BM adapter 694 + 20 OJ twins = 4.489),
   * not just the priceMaster count (452) it used to report.
   */
  public get recordCount(): number {
    this.ensureIndex();
    return this.indexedIds.size;
  }

  /**
   * MASTER PRICING §6 (d) + §13.3 — invalidate every cached AHSP
   * composition. Call after a master price change (admin update,
   * pipeline regeneration, snapshot adoption) so the next
   * `resolveAhspUnitPrice` recomputes from current data instead of
   * serving a stale composition. Bumps the cache generation AND clears
   * the map; the version key makes stale entries unservable even if a
   * future path forgets to clear.
   */
  public invalidateAhspCache(): void {
    this.cacheVersion++;
    this.ahspDefaultCache.clear();
  }

  /** Current cache generation (diagnostics / tests). */
  public getCacheVersion(): number {
    return this.cacheVersion;
  }

  // -------------------------------------------------------------------------
  // PHASE 14 — resolve a single resource price
  // -------------------------------------------------------------------------

  public resolveResourcePrice(query: ResourcePriceQuery): ResourcePriceResolution {
    this.ensureIndex();

    // MASTER PRICING §7 — location/period are structured objects or
    // absent. A string used to be silently dropped (location) or to
    // silently break resolution (period); both now throw here, before
    // anything is read from them. No production caller passes strings.
    validateLocationPeriod(query);

    const unit = query.unit ? normalizeUnit(query.unit) : '';
    const requestedLocation: PriceLocation | null = query.location
      ? {
          level: 'NATIONAL',
          provinceName: query.location.provinceName ?? null,
          regencyName: query.location.regencyName ?? null,
          cityName: query.location.cityName ?? null,
        }
      : null;
    const requestedPeriod = query.period ? { year: query.period.year, month: query.period.month ?? null } : null;

    const base = this.notFound(query, unit, requestedLocation, requestedPeriod);

    // --- MASTER PRICING §6 (h)+(i): flags for this component key.
    //     Attached to EVERY return below, resolved or not, so an open
    //     §5 decision is never silent. ---
    const componentKey = componentKeyFor(query.resourceCode, unit);
    const needsReview = getNeedsReviewFlag(componentKey);
    const underspecified = getUnderspecifiedRule(componentKey, query.resourceName);
    const pricingMode = resolvePricingMode(query.pricingContext);
    let contextMissed = false;
    // MASTER PRICING §7 — UNIT_MISSING: the query carried no unit
    // (empty after normalization). Attached to EVERY return below,
    // resolved or not; the price outcome is unchanged (the resolver
    // still answers by name/code when it can) — the gap is flagged,
    // never silently assumed.
    const unitMissing = unit === '';
    // MASTER PRICING §15 (#8) — record-exclusion state. `indexConsulted`
    // turns true only when the live index is actually read (a context
    // answer returns before that, so the exclusion note never claims
    // an exclusion on a path that never consulted the index).
    // `exclusionRemoved` collects the DISTINCT record ids dropped by
    // the filter across ALL pools consulted (code/name + conversion);
    // the note reports its size, so a staged re-preview can audit
    // exactly which records the removal took out.
    let indexConsulted = false;
    const exclusionRemoved = { removed: new Set<string>() };
    const withMeta = (r: ResourcePriceResolution): ResourcePriceResolution => ({
      ...r,
      canonicalEntityId: r.resourceId ?? null,
      originalAhspSourcePrice: query.originalAhspSourcePrice ?? null,
      priceDifference:
        r.price !== null && query.originalAhspSourcePrice != null
          ? Math.round((r.price - query.originalAhspSourcePrice) * 100) / 100
          : null,
      needsReview: needsReview ?? null,
      underspecified: underspecified ?? null,
      pricingMode,
      // MASTER PRICING §7 — the OJ-basis flag (null when neither side
      // is OJ) + the UNIT_MISSING flag. Both mark, never block.
      ojBasis: ojBasisFlagFor(query, r),
      unitMissing,
      explanation:
        (indexConsulted && query.excludeRecordIds && query.excludeRecordIds.size > 0
          ? `EXCLUSION: ${query.excludeRecordIds.size} record id(s) listed; ${exclusionRemoved.removed.size} candidate(s) removed. `
          : '') +
        (contextMissed && pricingMode !== 'LIVE_MASTER_PRICE'
          ? `${r.explanation} [${pricingMode}: no stored price for this component — live master price used.]`
          : r.explanation),
    });

    // --- MASTER PRICING §6 (b): project pricing context FIRST. An
    //     explicit stored price (snapshot / override) is not a binding
    //     guess, so the underspecified refusal below never applies to
    //     it, and the live index is not consulted when the map answers.
    //     When the map has no price for the component, resolution falls
    //     through to live (flagged in the explanation by `withMeta`). ---
    if (pricingMode !== 'LIVE_MASTER_PRICE') {
      const ref =
        pricingMode === 'SNAPSHOT_PRICE'
          ? query.pricingContext?.snapshotRef
          : query.pricingContext?.overrideRef;
      const contextPrice = lookupContextPrice(ref, query.resourceCode, query.resourceName, unit);
      if (contextPrice !== null) {
        return withMeta({
          price: contextPrice,
          currency: 'IDR',
          unit: unit || null,
          resourceId: query.resourceId ?? null,
          // MASTER PRICING §15 (#8): a context answer carries a stored
          // price, not a record — there is no record id to exclude.
          recordId: null,
          resourceCode: query.resourceCode || '',
          resourceName: query.resourceName || '',
          resourceType: query.resourceType || 'unknown',
          status: 'RESOLVED',
          requestedLocation,
          resolvedLocation: null,
          locationFallback: 'NONE',
          requestedPeriod,
          resolvedPeriod: null,
          periodFallback: 'NONE',
          source: {
            // No PROJECT tier exists in PriceSourceTier; OFFICIAL_PROJECT
            // is reused with priority 0 (explicit project prices outrank
            // the master) and an unambiguous name. This is a stored
            // project value, never a master price.
            key: pricingMode === 'SNAPSHOT_PRICE' ? 'SNAPSHOT_PRICE' : 'PROJECT_OVERRIDE',
            tier: 'OFFICIAL_PROJECT',
            priority: 0,
            name: pricingMode === 'SNAPSHOT_PRICE' ? 'Snapshot Harga Proyek' : 'Override Harga Proyek',
            document: ref?.label ?? null,
            url: null,
            supplier: null,
          },
          verificationStatus: null,
          matchMethod: null,
          confidence: 1,
          alternatives: [],
          explanation:
            `${query.resourceCode || query.resourceName || '?'} @ ${unit || '?'} = Rp ${contextPrice.toLocaleString('id-ID')} ` +
            `from ${pricingMode === 'SNAPSHOT_PRICE' ? 'project snapshot' : 'project override'}` +
            `${ref?.label ? ` (${ref.label})` : ''} — master price NOT consulted under ${pricingMode}.`,
        });
      }
      contextMissed = true;
    }

    // --- candidate pool: resourceId first, then looseCode+unit, then name+unit, then name --------------
    // MASTER PRICING §6 (a): the loose-code pool passes through the NAME
    // GATE — a code match whose names share nothing is a false positive
    // (CK L.10 `Sopir` vs the BM key `Akhli Madya Lingkungan`, sim 0.00).
    // The resourceId path is NOT gated (an explicit RES-xxx join is
    // verified identity, §5.3 level 1); name paths are name-based by
    // construction. When the gate rejects EVERY code candidate, the code
    // path yields nothing and the name path below may still bind
    // (ladder fall-through, same as the pipeline).
    // MASTER PRICING §15 (#8): the exclusion filter runs AFTER the name
    // gate (the gate note stays truthful about the gate alone) and
    // BEFORE the name-path check — an excluded code pool falls through
    // to name binding, exactly as a post-removal state would.
    indexConsulted = true;
    let candidates: ResourcePriceRecord[] = [];
    let gateNote = '';
    if (query.resourceId && this.byResourceId.has(query.resourceId)) {
      candidates = [...this.byResourceId.get(query.resourceId)!];
    } else if (query.resourceCode) {
      const raw = this.byLooseCodeUnit.get(`${looseCode(query.resourceCode)}|${unit}`) || [];
      const rejections: string[] = [];
      candidates = raw.filter((r) => {
        const d = codeNameGate(query.resourceCode, query.resourceName, r.resourceName);
        if (!d.allowed) {
          rejections.push(`'${r.resourceName}' (${d.reason}, sim=${d.similarity.toFixed(2)})`);
        }
        return d.allowed;
      });
      if (raw.length > 0 && candidates.length === 0) {
        gateNote =
          `NAME_GATE: code ${query.resourceCode}@${unit} candidates rejected — ${rejections.join('; ')}. `;
      } else if (rejections.length > 0) {
        // Partial rejection: the gate changed the winner pool even
        // though candidates survived. Record it — a silent winner
        // change (e.g. E23 500906.19 → 500906) is exactly what the
        // explanation is for. The note is prepended to every
        // resolution explanation below (resolved or not).
        gateNote =
          `NAME_GATE: code ${query.resourceCode}@${unit}: ${rejections.length}/${raw.length} candidate(s) rejected — ${rejections.join('; ')}. `;
      }
    }
    candidates = filterExcluded(candidates, query.excludeRecordIds, exclusionRemoved);

    if (candidates.length === 0 && query.resourceName) {
      const n = normResourceName(query.resourceName);
      if (unit && this.byNameUnit.has(`${n}|${unit}`)) {
        candidates = [...this.byNameUnit.get(`${n}|${unit}`)!];
      } else if (this.byName.has(n)) {
        candidates = [...this.byName.get(n)!];
      }
      candidates = filterExcluded(candidates, query.excludeRecordIds, exclusionRemoved);
    }

    // --- MASTER PRICING §6 (c): no same-unit candidate anywhere — try a
    //     DOCUMENTED unit conversion (dimensional whitelist / OJ↔OH
    //     work-hours basis) before declaring the resource unpriced. ---
    let convertedWinner: ConvertedWinner | null = null;
    if (candidates.length === 0) {
      convertedWinner = this.tryConversionPools(query, unit, exclusionRemoved);
      if (!convertedWinner) {
        return withMeta({ ...base, explanation: `${gateNote}${base.explanation}` });
      }
    }

    if (unit && !convertedWinner) {
      const unitFiltered = candidates.filter((r) => r.unit === unit);
      if (unitFiltered.length > 0) {
        candidates = unitFiltered;
      } else {
        // MASTER PRICING §6 (c): no same-unit candidate in the pool — try
        // a DOCUMENTED conversion of one of these records before
        // declaring a mismatch. Only whitelisted dimensional pairs and
        // documented OJ↔OH convert; anything else still falls through
        // to the UNIT GATE below.
        convertedWinner = this.tryConvertPool(candidates, query, unit, exclusionRemoved);
        if (!convertedWinner) {
          // UNIT GATE (F-016, 2026-10-20): kandidat DITEMUKAN tetapi TIDAK ADA yang
          // satuannya cocok dengan satuan komponen AHSP. Memakai record beda satuan
          // secara diam-diam menghasilkan harga satuan yang salah dimensi
          // (kasus terbukti: koefisien 1009 kg x harga Rp 352.300/m3 batu split
          // -> Rp 356 jt/m3 beton). Perlakukan sebagai TIDAK DITEMUKAN agar
          // komponen masuk daftar missing dan komposisi berstatus PARTIAL,
          // BUKAN dikalikan dengan harga satuan yang tidak kompatibel.
          const availableUnits = [...new Set(candidates.map((r) => r.unit))].join(', ');
          return withMeta({
            ...base,
            explanation:
              `${gateNote}${base.explanation} UNIT_MISMATCH: candidates exist in unit(s) [${availableUnits}] ` +
              `but the component requires [${unit}]; refusing to price across incompatible units.`,
          });
        }
      }
    }
    if (!convertedWinner && query.resourceType && query.resourceType !== 'unknown') {
      const typeFiltered = candidates.filter((r) => r.resourceType === query.resourceType || r.resourceType === 'unknown');
      if (typeFiltered.length > 0) candidates = typeFiltered;
    }
    if (!convertedWinner && candidates.length === 0) {
      return withMeta({ ...base, explanation: `${gateNote}${base.explanation}` });
    }

    const hasLocRequest = !!(query.location && (query.location.provinceName || query.location.regencyName || query.location.cityName));
    const hasPeriodRequest = !!query.period;

    // --- pick the winner (normal path) or take the converted winner ---
    let best: ScoredCandidate;
    let altPool: ResourcePriceRecord[];
    let conversion: UnitConversionApplied | null = null;
    if (convertedWinner) {
      best = convertedWinner.best;
      altPool = convertedWinner.pool;
      conversion = convertedWinner.conversion;
    } else {
      const scored = this.scoreCandidates(candidates, query, hasLocRequest, hasPeriodRequest);
      if (scored.length === 0) {
        // Everything was rejected by the (opt-in) fallback policy — surface why.
        return withMeta({
          ...base,
          explanation:
            `${gateNote}${base.explanation} Candidates existed but none satisfied the strict location/period policy ` +
            `(fallback not allowed).`,
        });
      }
      best = scored[0];
      altPool = candidates;
    }

    // --- MASTER PRICING §6 (i): underspecified REFUSE. This key conflates
    //     several specifications with materially different prices (§5) —
    //     decline to bind it to a single one, and name the spread that
    //     proves it. The alternatives below are what WOULD have bound. ---
    if (underspecified?.action === 'REFUSE') {
      const alternatives = this.alternativesFrom(altPool);
      return withMeta({
        ...base,
        alternatives,
        explanation:
          `${gateNote}${base.explanation} UNDERSPECIFIED_KEY: ${underspecified.reason} ` +
          `Candidates that would have bound: ${alternatives.map((a) => `${a.sourceName} Rp${a.price.toLocaleString('id-ID')}/${a.unit}`).join('; ') || 'none'}. ` +
          `No single price was chosen.`,
      });
    }

    const r = best.r;
    const alternatives = this.alternativesFrom(altPool);
    const price =
      conversion !== null ? Math.round(r.price * conversion.factor * 100) / 100 : r.price;

    const locationFallback = fallbackKindForLocation(hasLocRequest, best.locTier);
    const periodFallback =
      hasPeriodRequest && query.period ? fallbackKindForPeriod(true, best.perTier, r, query.period) : 'NONE';

    return withMeta({
      price,
      currency: 'IDR',
      unit: conversion !== null ? unit : r.unit,
      resourceId: r.resourceId,
      // MASTER PRICING §15 (#8): the winning record's id — the handle
      // a staged re-preview excludes to measure the post-removal state.
      recordId: r.id,
      resourceCode: r.resourceCode,
      resourceName: r.resourceName,
      resourceType: r.resourceType,
      status: 'RESOLVED',
      requestedLocation,
      resolvedLocation: r.location,
      locationFallback,
      requestedPeriod,
      resolvedPeriod: r.period,
      periodFallback,
      source: {
        key: r.sourceKey,
        tier: r.sourceTier,
        priority: r.sourcePriority,
        name: r.sourceName,
        document: r.sourceDocument ?? null,
        url: r.sourceUrl ?? null,
        supplier: r.supplier ?? null,
      },
      verificationStatus: r.verificationStatus,
      matchMethod: r.matchMethod,
      confidence: r.matchConfidence,
      alternatives,
      unitConversion: conversion,
      explanation:
        `${gateNote}${r.resourceCode} ${r.resourceName} @ ${r.unit} = Rp ${r.price.toLocaleString('id-ID')} ` +
        `from ${r.sourceName} (${r.period.label}, ${r.location.level}` +
        `${r.location.provinceName ? ` / ${r.location.provinceName}` : ''}` +
        `${r.location.regencyName ? ` / ${r.location.regencyName}` : ''}), ` +
        `bound by ${r.matchMethod}, status ${r.verificationStatus}` +
        (conversion !== null
          ? `, CONVERTED to ${unit} (×${conversion.factor}; ${conversion.basis}) = Rp ${price.toLocaleString('id-ID')}/${unit}`
          : '') +
        `${locationFallback !== 'NONE' ? `, location fallback: ${locationFallback}` : ''}` +
        `${periodFallback !== 'NONE' ? `, period fallback: ${periodFallback}` : ''}.`,
    });
  }

  /**
   * The audited candidate ordering (domain → location → period →
   * source priority → confidence → id), extracted verbatim from the
   * inline scorer so the normal path and the §6 conversion paths rank
   * candidates identically. The opt-in fallback policy is enforced
   * here: candidates beyond the allowed tiers are dropped, never
   * silently used.
   */
  private scoreCandidates(
    candidates: ResourcePriceRecord[],
    query: ResourcePriceQuery,
    hasLocRequest: boolean,
    hasPeriodRequest: boolean
  ): ScoredCandidate[] {
    const locAllowed = query.allowLocationFallback ? 4 : 0;
    const perAllowed = query.allowPeriodFallback ? 2 : 0;
    const targetDomain = query.domain;
    return candidates
      .map((r) => {
        const locTier = hasLocRequest && query.location ? locationTier(r.location, query.location) : 0;
        const perTier = hasPeriodRequest && query.period ? periodTier(r, query.period) : 0;
        let domainTier = 0;
        if (targetDomain === 'BINA_MARGA') {
          domainTier = r.sourceKey === 'BM_HSD_2026' ? 0 : 1;
        } else if (targetDomain === 'CIPTA_KARYA') {
          domainTier = r.sourceKey === 'CK_HSD_2026' ? 0 : 1;
        }
        return { r, locTier, perTier, domainTier };
      })
      .filter((s) => s.locTier <= locAllowed && s.perTier <= perAllowed)
      .sort(
        (a, b) =>
          a.domainTier - b.domainTier ||
          a.locTier - b.locTier ||
          a.perTier - b.perTier ||
          a.r.sourcePriority - b.r.sourcePriority ||
          b.r.matchConfidence - a.r.matchConfidence ||
          (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0)
      );
  }

  /** Losing candidates, best-first, capped at 8 (the historical shape). */
  private alternativesFrom(
    pool: ResourcePriceRecord[]
  ): Array<{ price: number; unit: string; sourceName: string; locationLevel: LocationLevel }> {
    return [...pool]
      .sort((a, b) => a.sourcePriority - b.sourcePriority || (a.id < b.id ? -1 : 1))
      .slice(0, 8)
      .map((c) => ({ price: c.price, unit: c.unit, sourceName: c.sourceName, locationLevel: c.location.level as LocationLevel }));
  }

  /** The type rule shared by the normal path and the conversion paths:
   *  keep the query type (or `unknown`) when any record survives. */
  private typeFilter(pool: ResourcePriceRecord[], query: ResourcePriceQuery): ResourcePriceRecord[] {
    if (query.resourceType && query.resourceType !== 'unknown') {
      const filtered = pool.filter((r) => r.resourceType === query.resourceType || r.resourceType === 'unknown');
      if (filtered.length > 0) return filtered;
    }
    return pool;
  }

  /**
   * MASTER PRICING §6 (c) — convert one record from an EXISTING pool
   * (the unit gate found candidates, but none in the query unit).
   * Returns the best convertible record with its conversion spec, or
   * null when nothing in the pool converts. The type rule and the
   * audited scoring apply exactly as on the normal path.
   */
  private tryConvertPool(
    pool: ResourcePriceRecord[],
    query: ResourcePriceQuery,
    unit: string,
    exclusionCounter?: { removed: Set<string> }
  ): ConvertedWinner | null {
    // MASTER PRICING §15 (#8): the conversion pool is filtered the
    // same way as the main pools — an excluded record must not win
    // through conversion either (a staged re-preview that left the
    // converted fallback in place would understate the removal).
    const livePool = filterExcluded(pool, query.excludeRecordIds, exclusionCounter);
    const typed = this.typeFilter(livePool, query);
    const convertible = typed
      .map((r) => ({ r, conversion: conversionForRecord(r, unit, query.rawUnit) }))
      .filter((x): x is { r: ResourcePriceRecord; conversion: UnitConversionApplied & { recordUnit: string } } => x.conversion !== null);
    if (convertible.length === 0) return null;
    const hasLocRequest = !!(query.location && (query.location.provinceName || query.location.regencyName || query.location.cityName));
    const hasPeriodRequest = !!query.period;
    const scored = this.scoreCandidates(
      convertible.map((x) => x.r),
      query,
      hasLocRequest,
      hasPeriodRequest
    );
    if (scored.length === 0) return null;
    const best = scored[0];
    const conversion = convertible.find((x) => x.r.id === best.r.id)!.conversion;
    const { recordUnit: _recordUnit, ...spec } = conversion;
    return { best, conversion: spec, pool: convertible.map((x) => x.r) };
  }

  /**
   * MASTER PRICING §6 (c) — conversion fallback pools, used only when
   * NO same-unit candidate exists at all (code path empty or fully
   * gate-rejected, name path empty). Looks the query code / name up in
   * each convertible unit (whitelist + OJ↔OH), gates code-pool
   * candidates by name exactly like the same-unit code path, then
   * scores everything together and converts the winner. Name-pool
   * candidates need no gate (exact-name matches by construction).
   */
  private tryConversionPools(
    query: ResourcePriceQuery,
    unit: string,
    exclusionCounter?: { removed: Set<string> }
  ): ConvertedWinner | null {
    if (!unit) return null;
    const fromUnits = convertibleUnitsFor(unit, query.rawUnit);
    if (fromUnits.length === 0) return null;

    const gathered: ResourcePriceRecord[] = [];
    for (const fromUnit of fromUnits) {
      if (query.resourceCode) {
        const codePool = this.byLooseCodeUnit.get(`${looseCode(query.resourceCode)}|${fromUnit}`) || [];
        for (const r of codePool) {
          if (codeNameGate(query.resourceCode, query.resourceName, r.resourceName).allowed) {
            gathered.push(r);
          }
        }
      }
      if (query.resourceName) {
        const n = normResourceName(query.resourceName);
        const namePool = this.byNameUnit.get(`${n}|${fromUnit}`) || [];
        gathered.push(...namePool);
      }
    }
    if (gathered.length === 0) return null;

    // De-duplicate (a record can arrive via both the code and the name pool).
    const seen = new Set<string>();
    const unique = gathered.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    // MASTER PRICING §15 (#8): exclusion is applied inside
    // tryConvertPool (the single conversion choke point), with the
    // counter threaded through so the explanation counts it.
    return this.tryConvertPool(unique, query, unit, exclusionCounter);
  }

  private notFound(
    query: ResourcePriceQuery,
    unit: string,
    requestedLocation: PriceLocation | null,
    requestedPeriod: { year: number; month: number | null } | null
  ): ResourcePriceResolution {
    return {
      price: null,
      currency: null,
      unit: unit || null,
      resourceId: query.resourceId ?? null,
      resourceCode: query.resourceCode || '',
      resourceName: query.resourceName || '',
      resourceType: query.resourceType || 'unknown',
      status: 'NOT_FOUND',
      requestedLocation,
      resolvedLocation: null,
      locationFallback: 'NONE',
      requestedPeriod,
      resolvedPeriod: null,
      periodFallback: 'NONE',
      source: null,
      verificationStatus: null,
      matchMethod: null,
      confidence: 0,
      alternatives: [],
      explanation:
        `No price record for ${query.resourceCode || query.resourceName || query.resourceId || '?'}` +
        `${unit ? ` @ ${unit}` : ''}. The resource is NOT priced — this is NOT Rp 0.`,
    };
  }

  // -------------------------------------------------------------------------
  // PHASE 18/19/20 — compose an AHSP item's unit price from its components
  // -------------------------------------------------------------------------

  /**
   * AHSP unit price = Σ (coefficient × resolved resource unit price), per category.
   *
   * A component that cannot be priced contributes NOTHING and is reported in
   * `missing`. The composition is `FULL` only when every component resolved.
   */
  public resolveAhspUnitPrice(
    item: {
      code: string;
      name: string;
      unit: string;
      domain?: string;
      laborComponents?: any[];
      materialComponents?: any[];
      equipmentComponents?: any[];
    },
    opts?: {
      location?: ResourcePriceQuery['location'];
      period?: ResourcePriceQuery['period'];
      allowLocationFallback?: boolean;
      allowPeriodFallback?: boolean;
      domain?: string;
      /** MASTER PRICING §6 (b) + §10 — project pricing context. Absent =
       *  LIVE_MASTER_PRICE (the historical behaviour). */
      pricingContext?: ResourcePriceQuery['pricingContext'];
      /**
       * MASTER PRICING §15 (#8) — record-exclusion seam, passed through
       * to every component's `resolveResourcePrice` call. An exclusion
       * composition NEVER uses the default cache (it must neither read
       * a live composition nor poison the cache with post-removal
       * values) — see `isDefaultQuery` below.
       */
      excludeRecordIds?: ReadonlySet<string>;
    }
  ): AhspUnitPriceComposition {
    const itemDomain = opts?.domain || item.domain || ((item.code && (item.code.startsWith('1.') || item.code.startsWith('2.') || item.code.startsWith('3.') || item.code.startsWith('4.') || item.code.startsWith('5.') || item.code.startsWith('6.') || item.code.startsWith('7.') || item.code.startsWith('8.') || item.code.startsWith('9.') || item.code.startsWith('10.'))) ? 'BINA_MARGA' : undefined);
    // MASTER PRICING §6 (d): context-bearing queries NEVER use the
    // default cache — a SNAPSHOT composition must never be served for a
    // LIVE query (or vice versa). Default entries are keyed by cache
    // generation, so `invalidateAhspCache()` makes them unservable.
    // MASTER PRICING §15 (#8): the same rule covers exclusion queries
    // — a post-removal composition must never be served for a live
    // query, and a live composition must never mask a removal.
    const isDefaultQuery =
      !opts?.location &&
      !opts?.period &&
      !opts?.domain &&
      !opts?.pricingContext &&
      !(opts?.excludeRecordIds && opts.excludeRecordIds.size > 0);
    const cacheKey = `${this.cacheVersion}:${item.code}`;
    if (isDefaultQuery && this.ahspDefaultCache.has(cacheKey)) {
      return this.ahspDefaultCache.get(cacheKey)!;
    }

    const warnings: string[] = [];
    const missing: AhspUnitPriceComposition['missing'] = [];

    const build = (
      arrayType: 'labor' | 'material' | 'equipment',
      comps: any[]
    ): AhspCategoryPricing => {
      const out: AhspComponentPricing[] = [];
      let subtotal = 0;
      let resolvedCount = 0;

      comps.forEach((c: any, i: number) => {
        const code = String(c?.code || '').trim();
        const effectiveType = (componentTypeFromCode(code) || arrayType) as
          | 'material'
          | 'labor'
          | 'equipment';
        const unit = normalizeUnitForType(String(c?.unit || ''), effectiveType, itemDomain);

        let coef = Number(c?.coefficient);
        if (!Number.isFinite(coef)) {
          warnings.push(`${arrayType}[${i}] ${code || '(no code)'}: coefficient missing → treated as 0`);
          coef = 0;
        }

        const name = String(c?.name || '').trim();

        let unitPrice: number | null = null;
        let sourceName: string | null = null;
        let verificationStatus: AhspComponentPricing['verificationStatus'] = null;
        let matchMethod: AhspComponentPricing['matchMethod'] = null;

        // MASTER PRICING §6.3 — the component's own baked AHSP source
        // price (SMKK Lampiran III et al.), carried into the resolution
        // so the result can report master-vs-source side by side. It is
        // NEVER used as the live price while a master price resolves.
        const bakedSourcePrice =
          typeof c?.unitPrice === 'number' && c.unitPrice > 0 ? c.unitPrice : null;

        const res = this.resolveResourcePrice({
          resourceCode: code,
          resourceName: name,
          resourceType: effectiveType as ResourceType,
          unit,
          rawUnit: c?.unit ?? null,
          domain: itemDomain,
          location: opts?.location,
          period: opts?.period,
          allowLocationFallback: opts?.allowLocationFallback,
          allowPeriodFallback: opts?.allowPeriodFallback,
          originalAhspSourcePrice: bakedSourcePrice,
          pricingContext: opts?.pricingContext ?? null,
          // MASTER PRICING §15 (#8): exclusion threads through to every
          // component (absent = the historical path, unchanged).
          excludeRecordIds: opts?.excludeRecordIds,
        });
        unitPrice = res.price;
        sourceName = res.source?.name ?? null;
        verificationStatus = res.verificationStatus;
        matchMethod = res.matchMethod;

        // Fallback to component's own unitPrice (e.g. from official SMKK dataset Lampiran III SE 47/2026)
        if ((unitPrice === null || unitPrice === 0) && bakedSourcePrice !== null) {
          unitPrice = bakedSourcePrice;
          sourceName = (item as any).sourceDocument || 'Lampiran III SE DJBK No. 47/SE/Dk/2026';
          verificationStatus = 'VERIFIED';
          matchMethod = 'EXACT_CODE';
        }

        let subtotalPerUnit = unitPrice === null ? null : (Math.round(coef * unitPrice * 100) / 100);
        if ((subtotalPerUnit === null || subtotalPerUnit === 0) && typeof c?.total === 'number' && c.total > 0) {
          subtotalPerUnit = c.total;
        }

        if (subtotalPerUnit === null) {
          // Batch 4: keep WHY it failed (UNIT_MISMATCH / NOT_FOUND / policy),
          // not just WHAT failed — the explanation was previously discarded.
          missing.push({ type: effectiveType, code, name, unit, reason: res.explanation || undefined });
        } else {
          subtotal += subtotalPerUnit;
          resolvedCount++;
        }

        // MASTER PRICING §6.3 — master kini minus sumber AHSP asli
        // (under SNAPSHOT/OVERRIDE the resolved side is the context
        // price; the field definition stays "resolved minus source").
        const priceDifference =
          unitPrice !== null && bakedSourcePrice !== null
            ? Math.round((unitPrice - bakedSourcePrice) * 100) / 100
            : null;

        out.push({
          componentId: `${item.code}::${arrayType}::${i}`,
          type: effectiveType,
          itemCode: code,
          itemName: name,
          unit,
          coefficient: coef,
          unitPrice,
          subtotalPerUnit,
          resolved: unitPrice !== null,
          sourceName,
          verificationStatus,
          matchMethod,
          unresolvedReason: subtotalPerUnit === null ? res.explanation || null : null,
          canonicalEntityId: res.canonicalEntityId ?? null,
          originalAhspSourcePrice: bakedSourcePrice,
          priceDifference,
          needsReview: res.needsReview ?? null,
          underspecified: res.underspecified ?? null,
          unitConversion: res.unitConversion ?? null,
          pricingMode: res.pricingMode,
          ojBasis: res.ojBasis ?? null,
          unitMissing: res.unitMissing ?? false,
        });
      });

      return {
        type: arrayType,
        components: out,
        subtotalPerUnit: subtotal,
        resolvedCount,
        missingCount: out.length - resolvedCount,
        complete: out.length > 0 && out.length - resolvedCount === 0,
      };
    };

    const labor = build('labor', item.laborComponents || []);
    const material = build('material', item.materialComponents || []);
    const equipment = build('equipment', item.equipmentComponents || []);

    const totalComponents = labor.components.length + material.components.length + equipment.components.length;
    const resolvedComponents = labor.resolvedCount + material.resolvedCount + equipment.resolvedCount;
    const missingComponents = totalComponents - resolvedComponents;

    let unitPrice = resolvedComponents > 0
      ? Math.round(labor.subtotalPerUnit + material.subtotalPerUnit + equipment.subtotalPerUnit)
      : null;
    if ((unitPrice === null || unitPrice === 0) && typeof (item as any).unitPrice === 'number' && (item as any).unitPrice > 0) {
      unitPrice = (item as any).unitPrice;
    }

    // MASTER PRICING §6 (g) — DHSP read through the uniform reader
    // (I-9 seam). Behavior-preserving by construction: the reader mirrors
    // the resolver's old inline lookup exactly, including its `||`
    // semantics (a falsy BM value falls through to CK) and the BM-number
    // vs CK-object asymmetry (P0 2026-10-26). The golden suites guard it.
    const dhspEntry = getDhspEntry(item.code, itemDomain, (item as any).codeNormalized);

    const officialDhspPrice = dhspEntry?.unitPrice ?? null;
    const hspPrice = officialDhspPrice ?? (unitPrice !== null ? unitPrice : (typeof (item as any).unitPrice === 'number' && (item as any).unitPrice > 0 ? (item as any).unitPrice : null));
    const overheadAmount = dhspEntry?.overheadAmount ?? (
      (officialDhspPrice !== null && unitPrice !== null && officialDhspPrice >= unitPrice)
        ? Math.round(officialDhspPrice - unitPrice)
        : null
    );
    const provenanceSource =
      dhspEntry?.provenanceSource ??
      (item.domain === 'SMKK' || (item as any).domain === 'SMKK'
        ? ((item as any).sourceDocument || 'Lampiran III SE DJBK No. 47/SE/Dk/2026 (SMKK K3)')
        : null);

    let pricingStatus: PricingStatus;
    if (totalComponents === 0) {
      if (hspPrice !== null) {
        pricingStatus = 'FULL';
      } else {
        pricingStatus = 'MISSING';
        warnings.push('AHSP item has no components — nothing to price.');
      }
    } else if (missingComponents === 0) {
      pricingStatus = 'FULL';
    } else if (resolvedComponents > 0) {
      pricingStatus = (item.domain === 'SMKK' || (item as any).domain === 'SMKK') ? 'FULL' : 'PARTIAL';
    } else if (hspPrice !== null && hspPrice > 0) {
      pricingStatus = 'FULL';
    } else {
      pricingStatus = 'MISSING';
    }

    const result: AhspUnitPriceComposition = {
      ahspCode: item.code,
      ahspName: item.name,
      unit: item.unit,
      labor,
      material,
      equipment,
      unitPrice,
      hspPrice,
      overheadAmount,
      officialDhspPrice,
      provenanceSource,
      resolvedComponents,
      totalComponents,
      missingComponents,
      pricingStatus,
      missing,
      warnings,
      pricingMode: resolvePricingMode(opts?.pricingContext),
    };

    if (isDefaultQuery) {
      this.ahspDefaultCache.set(cacheKey, result);
    }

    return result;
  }
}

/** Shared singleton — the one and only price resolver. */
export const priceResolver2026 = PriceResolver2026.getInstance();

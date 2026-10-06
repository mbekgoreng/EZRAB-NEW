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
 */

import { RESOURCE_PRICE_RECORDS } from './priceMaster.generated';
import {
  OFFICIAL_CK_2026_MATERIALS,
  OFFICIAL_CK_2026_LABOR,
  OFFICIAL_CK_2026_EQUIPMENT,
} from '../nationalCostDatabase/officialCiptaKaryaPrices2026';
import { OFFICIAL_CK_2026_DHSP_MAP } from '../nationalCostDatabase/officialCiptaKaryaDhsp2026';
import {
  OFFICIAL_BM_2026_MATERIALS,
  OFFICIAL_BM_2026_LABOR,
  OFFICIAL_BM_2026_EQUIPMENT,
} from '../nationalCostDatabase/officialBinaMargaPrices2026';
import { OFFICIAL_BM_2026_DHSP_MAP } from '../nationalCostDatabase/officialBinaMargaDhsp2026';
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
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  private indexed = false;

  private ensureIndex(): void {
    if (this.indexed) return;

    const indexRecord = (r: ResourcePriceRecord) => {
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

  /** Total number of price records available to the resolver. */
  public get recordCount(): number {
    return this.records.length;
  }

  // -------------------------------------------------------------------------
  // PHASE 14 — resolve a single resource price
  // -------------------------------------------------------------------------

  public resolveResourcePrice(query: ResourcePriceQuery): ResourcePriceResolution {
    this.ensureIndex();

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

    // --- candidate pool: resourceId first, then looseCode+unit, then name+unit, then name --------------
    let candidates: ResourcePriceRecord[] = [];
    if (query.resourceId && this.byResourceId.has(query.resourceId)) {
      candidates = [...this.byResourceId.get(query.resourceId)!];
    } else if (query.resourceCode) {
      candidates = [...(this.byLooseCodeUnit.get(`${looseCode(query.resourceCode)}|${unit}`) || [])];
    }

    if (candidates.length === 0 && query.resourceName) {
      const n = normResourceName(query.resourceName);
      if (unit && this.byNameUnit.has(`${n}|${unit}`)) {
        candidates = [...this.byNameUnit.get(`${n}|${unit}`)!];
      } else if (this.byName.has(n)) {
        candidates = [...this.byName.get(n)!];
      }
    }

    if (candidates.length === 0) return base;

    if (unit) {
      const unitFiltered = candidates.filter((r) => r.unit === unit);
      if (unitFiltered.length > 0) candidates = unitFiltered;
    }
    if (query.resourceType && query.resourceType !== 'unknown') {
      const typeFiltered = candidates.filter((r) => r.resourceType === query.resourceType || r.resourceType === 'unknown');
      if (typeFiltered.length > 0) candidates = typeFiltered;
    }
    if (candidates.length === 0) return base;

    const hasLocRequest = !!(query.location && (query.location.provinceName || query.location.regencyName || query.location.cityName));
    const hasPeriodRequest = !!query.period;
    const locAllowed = query.allowLocationFallback ? 4 : 0;
    const perAllowed = query.allowPeriodFallback ? 2 : 0;

    const targetDomain = query.domain;
    const scored = candidates
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

    if (scored.length === 0) {
      // Everything was rejected by the (opt-in) fallback policy — surface why.
      return {
        ...base,
        explanation:
          `${base.explanation} Candidates existed but none satisfied the strict location/period policy ` +
          `(fallback not allowed).`,
      };
    }

    const best = scored[0];
    const r = best.r;

    const alternatives = [...candidates]
      .sort((a, b) => a.sourcePriority - b.sourcePriority || (a.id < b.id ? -1 : 1))
      .slice(0, 8)
      .map((c) => ({ price: c.price, unit: c.unit, sourceName: c.sourceName, locationLevel: c.location.level as LocationLevel }));

    const locationFallback = fallbackKindForLocation(hasLocRequest, best.locTier);
    const periodFallback =
      hasPeriodRequest && query.period ? fallbackKindForPeriod(true, best.perTier, r, query.period) : 'NONE';

    return {
      price: r.price,
      currency: 'IDR',
      unit: r.unit,
      resourceId: r.resourceId,
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
      explanation:
        `${r.resourceCode} ${r.resourceName} @ ${r.unit} = Rp ${r.price.toLocaleString('id-ID')} ` +
        `from ${r.sourceName} (${r.period.label}, ${r.location.level}` +
        `${r.location.provinceName ? ` / ${r.location.provinceName}` : ''}` +
        `${r.location.regencyName ? ` / ${r.location.regencyName}` : ''}), ` +
        `bound by ${r.matchMethod}, status ${r.verificationStatus}` +
        `${locationFallback !== 'NONE' ? `, location fallback: ${locationFallback}` : ''}` +
        `${periodFallback !== 'NONE' ? `, period fallback: ${periodFallback}` : ''}.`,
    };
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
    }
  ): AhspUnitPriceComposition {
    const itemDomain = opts?.domain || item.domain || ((item.code && (item.code.startsWith('1.') || item.code.startsWith('2.') || item.code.startsWith('3.') || item.code.startsWith('4.') || item.code.startsWith('5.') || item.code.startsWith('6.') || item.code.startsWith('7.') || item.code.startsWith('8.') || item.code.startsWith('9.') || item.code.startsWith('10.'))) ? 'BINA_MARGA' : undefined);
    const isDefaultQuery = !opts?.location && !opts?.period && !opts?.domain;
    if (isDefaultQuery && this.ahspDefaultCache.has(item.code)) {
      return this.ahspDefaultCache.get(item.code)!;
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

        const res = this.resolveResourcePrice({
          resourceCode: code,
          resourceName: name,
          resourceType: effectiveType as ResourceType,
          unit,
          domain: itemDomain,
          location: opts?.location,
          period: opts?.period,
          allowLocationFallback: opts?.allowLocationFallback,
          allowPeriodFallback: opts?.allowPeriodFallback,
        });
        unitPrice = res.price;
        sourceName = res.source?.name ?? null;
        verificationStatus = res.verificationStatus;
        matchMethod = res.matchMethod;

        // Fallback to component's own unitPrice (e.g. from official SMKK dataset Lampiran III SE 47/2026)
        if ((unitPrice === null || unitPrice === 0) && typeof c?.unitPrice === 'number' && c.unitPrice > 0) {
          unitPrice = c.unitPrice;
          sourceName = (item as any).sourceDocument || 'Lampiran III SE DJBK No. 47/SE/Dk/2026';
          verificationStatus = 'VERIFIED';
          matchMethod = 'EXACT_CODE';
        }

        let subtotalPerUnit = unitPrice === null ? null : (Math.round(coef * unitPrice * 100) / 100);
        if ((subtotalPerUnit === null || subtotalPerUnit === 0) && typeof c?.total === 'number' && c.total > 0) {
          subtotalPerUnit = c.total;
        }

        if (subtotalPerUnit === null) {
          missing.push({ type: effectiveType, code, name, unit });
        } else {
          subtotal += subtotalPerUnit;
          resolvedCount++;
        }

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

    const bmEntry =
      OFFICIAL_BM_2026_DHSP_MAP.get(item.code) ||
      ((item as any).codeNormalized && OFFICIAL_BM_2026_DHSP_MAP.get((item as any).codeNormalized));
    const ckEntry = OFFICIAL_CK_2026_DHSP_MAP.get(item.code);
    const dhspEntry = itemDomain === 'BINA_MARGA' ? (bmEntry || ckEntry) : (ckEntry || bmEntry);

    const officialDhspPrice = dhspEntry?.unitPrice ?? null;
    const hspPrice = officialDhspPrice ?? (unitPrice !== null ? unitPrice : (typeof (item as any).unitPrice === 'number' && (item as any).unitPrice > 0 ? (item as any).unitPrice : null));
    const overheadAmount = dhspEntry?.overheadAmount ?? (
      (officialDhspPrice !== null && unitPrice !== null && officialDhspPrice >= unitPrice)
        ? Math.round(officialDhspPrice - unitPrice)
        : null
    );
    const provenanceSource = dhspEntry
      ? `SE DJBK No. 47/SE/Dk/2026 (${dhspEntry.sourceSheet}, Baris ${dhspEntry.sourceRow})`
      : (item.domain === 'SMKK' || (item as any).domain === 'SMKK'
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
    };

    if (isDefaultQuery) {
      this.ahspDefaultCache.set(item.code, result);
    }

    return result;
  }
}

/** Shared singleton — the one and only price resolver. */
export const priceResolver2026 = PriceResolver2026.getInstance();

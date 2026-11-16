/**
 * MASTER PRICING §12 — CANONICAL RESOLVER ADAPTER
 * =================================================
 * Translates the canonical pricing service (`canonicalPriceResolver`,
 * §6 — itself backed by `priceResolver2026`) into the two result shapes
 * the legacy engine `PriceResolver` used to return:
 *
 *   - `PriceResolutionResult`  (`.resolve()`)   — cost composition, drawers
 *   - `ResolvedPrice`          (`.resolvePrice()`) — provenance modal, AI tools
 *
 * WHY AN ADAPTER (D3/M-12): the engine `PriceResolver` resolves against
 * the `PriceRepository` master index FIRST — a parallel price universe
 * that can disagree with the canonical master (priceMaster + CK + BM +
 * HSD via `priceResolver2026`). §12's hard rule forbids any application
 * path from silently using those stale embedded prices when a valid
 * canonical master price exists. Redirecting every consumer to call the
 * canonical resolver directly would force each one to re-implement the
 * shape mapping (and the LOCKED/EXPIRED semantics the engine carried);
 * the adapter does the mapping ONCE, in one tested place.
 *
 * WHAT THE ADAPTER PRESERVES (from the engine resolver, by design):
 *   - LOCKED revisions: a price frozen on a locked revision still wins
 *     (read from `projectPriceEngine`, never from the live master).
 *   - EXPIRED project quotes: an expired quote is reported EXPIRED with
 *     a live-master fallback, never silently served as current.
 *   - The OVERRIDDEN signal: canonical override/quote answers carry a
 *     `Project <id>` location so the composition engine's existing
 *     `location.includes('Project')` check keeps working.
 *   - The provenance tier: `sourceTier` (OFFICIAL/MARKET) flows from
 *     the canonical result into the synthetic PriceDefinition, so the
 *     composition engine's MARKET_REFERENCE vs OFFICIAL_AHSP labelling
 *     is unchanged.
 *   - UNIT SAFETY (P5, proven 2026-11-16): the legacy contract promises
 *     a price FOR the queried unit — the old engine returned
 *     PRICE_NOT_FOUND with a UNIT_MISMATCH explanation when the item
 *     existed only in another unit. The canonical service's Steps 3/5
 *     match by NAME and return the RECORD's unit (a 'Semen Portland'
 *     @ton query resolves to Rp1.600/kg, labelled kg), and the
 *     composition engine consumes `resolvedPrice.price` as the
 *     component's unit price without re-checking the unit — so the
 *     adapter gates every canonical answer through `gateCanonicalUnit`
 *     (same unit → pass; convertible → convert INTO the query unit;
 *     incompatible → fail-closed UNIT_MISMATCH). LOCKED / MANUAL /
 *     expired-quote answers keep the old engine's semantics: they are
 *     per-material stored facts returned as-is.
 *
 * WHAT THE ADAPTER DELIBERATELY DOES NOT PRESERVE:
 *   - The engine's substring/keyword fallback tiers (Tier 3): a name
 *     that only partially matches now FAILS CLOSED through the canonical
 *     resolver instead of landing on a look-alike material.
 *   - The engine's AMBIGUOUS multi-variant branch: the canonical
 *     resolver refuses ambiguous codes at its own steps.
 *   - Variant-ID (`qObj.id`) disambiguation: the canonical resolver has
 *     no variant-id concept; an id-bearing query is resolved by code +
 *     name like any other query.
 *
 * The synthetic `PriceDefinition` built here is a READ projection: it
 * carries the canonical price + provenance for display/composition. It
 * is never written back to any repository.
 */

import {
  canonicalPriceResolver,
  type CanonicalPriceQuery,
  type CanonicalPriceResult,
} from './canonicalPriceResolver';
import { projectPriceEngine } from '../projectPriceEngine';
import { PriceNormalizationEngine } from '../normalization/priceNormalization';
import { UnitEngine } from '../../calculatorCore/unit/unitEngine';
import type {
  PriceCategory,
  PriceContext,
  PriceDefinition,
  PriceItemQuery,
  PriceResolutionResult,
  ResolvedPrice,
  ResolvedPriceSource,
} from '../contracts/types';

/**
 * Structural seam for price lookup injection (CostCompositionEngine /
 * CostPolicyEngine constructor). The legacy `PriceResolver` class
 * satisfies it, and so does `CanonicalPriceResolverAdapter` — so
 * existing tests that inject a real or stub engine resolver keep
 * compiling, while the DEFAULT is now canonical.
 */
export interface PriceResolverLike {
  resolve(query: PriceItemQuery | string, context?: PriceContext): PriceResolutionResult;
}

/** Result category → PriceDefinition category (AHSP has no PriceCategory). */
function resultCategoryToPriceCategory(
  category: CanonicalPriceResult['category'],
  fallback: PriceCategory | undefined,
): PriceCategory {
  if (category === 'MATERIAL' || category === 'LABOR' || category === 'EQUIPMENT') {
    return category;
  }
  return fallback ?? 'MATERIAL';
}

function toCanonicalQuery(
  query: PriceItemQuery | string,
  context?: PriceContext,
): { canonical: CanonicalPriceQuery; qObj: PriceItemQuery } {
  const qObj: PriceItemQuery = typeof query === 'string' ? { code: query, name: query } : query;
  const canonical: CanonicalPriceQuery = {
    code: qObj.code || undefined,
    name: qObj.name || qObj.code || '',
    unit: qObj.unit || undefined,
    category: qObj.category || undefined,
    projectId: qObj.projectId || context?.projectId,
    region: qObj.location || context?.location,
  };
  return { canonical, qObj };
}

/**
 * MASTER PRICING §12 (P5) — unit gate for canonical answers. The
 * canonical service's Steps 3/5 match by name and return the RECORD's
 * unit; the legacy contract promises a price FOR the queried unit.
 *   - no query unit (or no result unit) → pass through (no unit claim);
 *   - same normalized unit → pass through;
 *   - convertible unit (same dimension family) → price converted INTO
 *     the query unit (price per target unit = price per source unit ×
 *     how many source units fit one target unit);
 *   - incompatible unit, unknown unit, or conversion failure → null
 *     (fail-closed; the caller reports UNIT_MISMATCH).
 * Exported for the other direct canonical call sites (§12 P5):
 * Magic AI findPrice, DED v2 Priority 5 + provider step 3, DED v3
 * resolveItemPrice — all four must gate the same way.
 */
export function gateCanonicalUnit(
  result: CanonicalPriceResult,
  queryUnit: string | undefined,
): { price: number; unit: string; convertedFrom: string | null } | null {
  if (result.price === null) return null;
  const resultUnit = result.unit ?? '';
  if (!queryUnit || !resultUnit) {
    return { price: result.price, unit: resultUnit, convertedFrom: null };
  }
  if (UnitEngine.normalizeUnit(resultUnit) === UnitEngine.normalizeUnit(queryUnit)) {
    return { price: result.price, unit: resultUnit, convertedFrom: null };
  }
  if (!UnitEngine.areCompatible(resultUnit, queryUnit)) return null;
  try {
    const sourceUnitsPerTargetUnit = UnitEngine.convert(1, queryUnit, resultUnit);
    if (!Number.isFinite(sourceUnitsPerTargetUnit) || sourceUnitsPerTargetUnit <= 0) {
      return null;
    }
    return {
      price: Math.round(result.price * sourceUnitsPerTargetUnit),
      unit: queryUnit,
      convertedFrom: resultUnit,
    };
  } catch {
    return null;
  }
}

function buildSyntheticDefinition(
  result: CanonicalPriceResult,
  qObj: PriceItemQuery,
  projectId: string | undefined,
): PriceDefinition | undefined {
  if (result.status !== 'RESOLVED' || result.price === null) return undefined;
  const isProjectAnswer =
    result.source === 'PROJECT_OVERRIDE' || result.source === 'PROJECT_PRICE_QUOTE';
  const location = isProjectAnswer
    ? `Project ${projectId || ''}`.trim()
    : result.region || 'Nasional';
  const code = qObj.code || '';
  const name = qObj.name || qObj.code || 'Item';
  const priceSource = result.sourceDocument || result.source;
  return {
    id: `CANONICAL:${code || name}`,
    code,
    codeNormalized:
      code ? PriceNormalizationEngine.normalizeCode(code) : PriceNormalizationEngine.normalizeText(name),
    name,
    category: resultCategoryToPriceCategory(result.category, qObj.category),
    unit: result.unit,
    price: result.price,
    location,
    periodVersion: result.period || '2026',
    effectiveDate: '2026-01-01',
    priceSource,
    provenance: {
      sourceName: priceSource,
      location,
      periodVersion: result.period || '2026',
      effectiveDate: '2026-01-01',
      confidenceScore: result.confidence,
    },
    sourceTier: result.sourceTier,
  };
}

/**
 * `.resolve()` shape over the canonical resolver. RESOLVED →
 * EXACT_MATCH with a synthetic PriceDefinition; anything else →
 * PRICE_NOT_FOUND (fail-closed, never a look-alike price).
 */
export function resolveCanonicalPriceAsResolutionResult(
  query: PriceItemQuery | string,
  context?: PriceContext,
): PriceResolutionResult {
  const { canonical, qObj } = toCanonicalQuery(query, context);
  const projectId = canonical.projectId;

  if (!qObj.code && !qObj.name) {
    return {
      status: 'PRICE_NOT_CONFIGURED',
      query: qObj,
      error: 'Empty price query provided.',
      confidence: 0,
      explanation: 'Kueri harga kosong.',
    };
  }

  const result = canonicalPriceResolver.resolve(canonical);
  if (result.status === 'RESOLVED' && result.price !== null) {
    // MASTER PRICING §12 (P5): the canonical answer must be usable
    // FOR the queried unit — a per-kg price is never served as a
    // per-ton/per-m³ price.
    const gated = gateCanonicalUnit(result, qObj.unit);
    if (!gated) {
      return {
        status: 'PRICE_NOT_FOUND',
        query: qObj,
        error: `UNIT_MISMATCH: "${qObj.name || qObj.code}" tersedia hanya dalam satuan ${result.unit || 'lain'} — bukan ${qObj.unit}.`,
        confidence: 0,
        priceCandidates: [],
        explanation: `Harga "${qObj.name || qObj.code}" tidak diresolve: item tersedia hanya dalam satuan berbeda dari "${qObj.unit}" (UNIT_MISMATCH). Tidak dialihkan ke item lain.`,
      };
    }
    const gatedResult: CanonicalPriceResult = {
      ...result,
      price: gated.price,
      unit: gated.unit,
    };
    const conversionNote = gated.convertedFrom
      ? ` (dikonversi ${gated.convertedFrom} → ${gated.unit})`
      : '';
    const def = buildSyntheticDefinition(gatedResult, qObj, projectId);
    if (!def) {
      return {
        status: 'PRICE_NOT_FOUND',
        query: qObj,
        error: 'Canonical resolution returned no price definition.',
        confidence: 0,
        explanation: 'Harga kanonis tidak menghasilkan definisi harga.',
      };
    }
    const candidate = {
      id: def.id,
      price: def.price,
      unit: def.unit,
      source: 'EZRAB_DATABASE' as const,
      sourceName: def.priceSource,
      observedDate: '2026-01-01',
      region: result.region,
      confidence: result.confidence,
      matchType: 'EXACT' as const,
      isConfirmed: true,
      notes: `Harga kanonis via ${result.source} (${result.resolutionPath.join(' → ')})${conversionNote}`,
    };
    return {
      status: 'EXACT_MATCH',
      query: qObj,
      resolvedPrice: def,
      selectedCandidate: candidate,
      priceCandidates: [candidate],
      confidence: result.confidence,
      explanation: `Harga kanonis: [${def.code || def.name}] ${def.name} Rp ${def.price.toLocaleString('id-ID')}/${def.unit} via ${result.source}${conversionNote}`,
    };
  }

  return {
    status: 'PRICE_NOT_FOUND',
    query: qObj,
    error:
      result.rejectionReason ||
      `No canonical price found for "${qObj.name || qObj.code}".`,
    confidence: 0,
    priceCandidates: [],
    explanation: 'Harga satuan tidak ditemukan di resolver harga kanonis.',
  };
}

/** Live-master reference price for variance computation (no project). Gated to the query unit (§12 P5): a live-master price in another unit is not a reference for this query. */
function resolveLiveReferencePrice(
  canonical: CanonicalPriceQuery,
): number | undefined {
  const ref = canonicalPriceResolver.resolve({ ...canonical, projectId: undefined });
  if (ref.status !== 'RESOLVED' || ref.price === null) return undefined;
  const gated = gateCanonicalUnit(ref, canonical.unit);
  return gated ? gated.price : undefined;
}

function varianceOf(price: number, refPrice: number | undefined): { amount: number; percent: number } {
  if (refPrice === undefined) return { amount: 0, percent: 0 };
  const amount = price - refPrice;
  return { amount, percent: refPrice ? Number(((amount / refPrice) * 100).toFixed(2)) : 0 };
}

/** The expired project quote for this material, if one exists (engine parity). */
function findExpiredProjectPrice(
  projectId: string | undefined,
  keys: string[],
): ReturnType<typeof projectPriceEngine.getProjectPrice> {
  if (!projectId) return undefined;
  for (const k of keys) {
    const projPrice = projectPriceEngine.getProjectPrice(projectId, k);
    if (projPrice && projectPriceEngine.isPriceExpired(projPrice.validUntil)) {
      return projPrice;
    }
  }
  return undefined;
}

/**
 * `.resolvePrice()` shape over the canonical resolver, preserving the
 * engine resolver's LOCKED / OVERRIDE / PROJECT_PRICE / EXPIRED /
 * REFERENCE / NOT_FOUND semantics. The REFERENCE tier is now the
 * canonical master (not the PriceRepository index); the variance is
 * measured against the live master price.
 */
export function resolveCanonicalPriceAsResolvedPrice(
  query: PriceItemQuery | string,
  context?: PriceContext,
): ResolvedPrice {
  const { canonical, qObj } = toCanonicalQuery(query, context);
  const projectId = canonical.projectId;
  const location = canonical.region;
  const revisionId = context?.revisionId;
  const normCode = qObj.code ? PriceNormalizationEngine.normalizeCode(qObj.code) : '';
  const normName = qObj.name ? PriceNormalizationEngine.normalizeText(qObj.name) : '';
  const itemName = qObj.name || qObj.code || 'Item';
  const itemCode = qObj.code || normCode;

  // STEP B (engine parity): a price frozen on a LOCKED revision wins
  // over everything — it is a contract record, not a live price.
  if (projectId && revisionId) {
    const lockedRev = projectPriceEngine.getLockedRevision(projectId, revisionId);
    if (lockedRev) {
      const lockedItem = lockedRev.items.find(
        (i) =>
          (normCode && PriceNormalizationEngine.normalizeCode(i.materialId) === normCode) ||
          (normCode && i.materialCode && PriceNormalizationEngine.normalizeCode(i.materialCode) === normCode) ||
          (normName && i.materialName && PriceNormalizationEngine.normalizeText(i.materialName) === normName),
      );
      if (lockedItem) {
        const refPrice = resolveLiveReferencePrice(canonical);
        const { amount, percent } = varianceOf(lockedItem.price, refPrice);
        return {
          materialId: lockedItem.materialId,
          materialCode: lockedItem.materialCode || itemCode,
          materialName: lockedItem.materialName || itemName,
          projectId,
          price: lockedItem.price,
          unit: lockedItem.unit,
          source: lockedItem.source,
          status: 'LOCKED',
          sourceName: `Revisi Terkunci (${lockedRev.revisionTitle || lockedRev.revisionId})`,
          isFinal: true,
          isLocked: true,
          revisionId,
          confidence: 1.0,
          referencePrice: refPrice,
          varianceAmount: amount,
          variancePercent: percent,
          explanation: `Harga terkunci pada revisi ${revisionId} oleh ${lockedRev.lockedBy} pada ${lockedRev.lockedAt}.`,
          provenance: {
            referenceId: lockedRev.revisionId,
            createdBy: lockedRev.lockedBy,
            createdAt: lockedRev.lockedAt,
            notes: 'Harga terkunci tidak berubah saat harga proyek atau acuan diperbarui.',
          },
        };
      }
    }
  }

  const result = canonicalPriceResolver.resolve(canonical);
  // MASTER PRICING §12 (P5): gate the canonical answer to the queried
  // unit. A gated-out answer falls through to the EXPIRED / MANUAL /
  // NOT_FOUND handling below, with the UNIT_MISMATCH reason carried.
  const gated =
    result.status === 'RESOLVED' && result.price !== null
      ? gateCanonicalUnit(result, qObj.unit)
      : null;
  const unitMismatch =
    result.status === 'RESOLVED' && result.price !== null && gated === null;

  if (gated) {
    const refPrice = resolveLiveReferencePrice(canonical);
    const finalPrice = gated.price;
    const finalUnit = gated.unit;
    const conversionNote = gated.convertedFrom
      ? ` (dikonversi ${gated.convertedFrom} → ${gated.unit})`
      : '';
    const { amount, percent } = varianceOf(finalPrice, refPrice);

    if (result.source === 'PROJECT_OVERRIDE') {
      return {
        materialId: qObj.code || itemCode,
        materialCode: itemCode,
        materialName: itemName,
        projectId,
        price: finalPrice,
        unit: finalUnit,
        source: 'PROJECT_OVERRIDE',
        status: 'OVERRIDE',
        sourceName: result.sourceDocument || 'Project Price Override (Estimator)',
        isFinal: true,
        confidence: 1.0,
        referencePrice: refPrice,
        overridePrice: finalPrice,
        varianceAmount: amount,
        variancePercent: percent,
        explanation: `Harga override aktif untuk proyek ${projectId}: Rp ${finalPrice.toLocaleString('id-ID')}/${finalUnit}.${conversionNote}`,
        provenance: {
          referenceId: result.sourceDocument,
          notes: result.resolutionPath.join(' → '),
        },
      };
    }

    if (result.source === 'PROJECT_PRICE_QUOTE') {
      const projPrice = projectId
        ? projectPriceEngine.getProjectPrice(projectId, normCode || normName)
        : undefined;
      return {
        materialId: qObj.code || itemCode,
        materialCode: itemCode,
        materialName: itemName,
        projectId,
        price: finalPrice,
        unit: finalUnit,
        source: 'PROJECT_PRICE',
        status: 'PROJECT_PRICE',
        sourceName: result.sourceDocument || `Harga Penawaran Proyek (${projectId})`,
        supplier: projPrice?.supplierName,
        region: projPrice?.region || location,
        validFrom: projPrice?.effectiveDate,
        validUntil: projPrice?.validUntil,
        isFinal: true,
        confidence: 1.0,
        referencePrice: refPrice,
        projectPrice: finalPrice,
        varianceAmount: amount,
        variancePercent: percent,
        explanation: `Harga penawaran proyek aktif: Rp ${finalPrice.toLocaleString('id-ID')}/${finalUnit} dari ${projPrice?.supplierName || 'Supplier Proyek'}.${conversionNote}`,
        provenance: {
          referenceId: projPrice?.referenceNumber || projPrice?.id,
          createdBy: projPrice?.createdBy,
          createdAt: projPrice?.createdAt,
          notes: projPrice?.notes,
        },
      };
    }

    // EXPIRED (engine parity): the canonical resolver falls THROUGH an
    // expired quote silently, so an expired quote + a live master would
    // otherwise surface as a plain REFERENCE and the estimator would
    // lose the "your quote expired" signal. The expired quote is
    // reported EXPIRED with the live-master price as fallback — the
    // same ordering the old engine had (project price before reference).
    // An ACTIVE override/quote above already returned, so this branch
    // only fires for genuinely expired quotes.
    const expiredQuote = findExpiredProjectPrice(projectId, [normCode, normName].filter(Boolean));
    if (expiredQuote) {
      return {
        materialId: expiredQuote.materialId,
        materialCode: itemCode,
        materialName: itemName,
        projectId,
        price: finalPrice,
        unit: finalUnit,
        source: 'EZRAB_REFERENCE',
        status: 'EXPIRED',
        sourceName: 'Database Referensi Kanonis EZRAB (Fallback)',
        supplier: expiredQuote.supplierName,
        validUntil: expiredQuote.validUntil,
        isFinal: true,
        confidence: 0.95,
        referencePrice: finalPrice,
        projectPrice: expiredQuote.price,
        varianceAmount: 0,
        variancePercent: 0,
        explanation: `Peringatan: Penawaran harga proyek (Rp ${expiredQuote.price.toLocaleString('id-ID')}) telah kedaluwarsa pada ${expiredQuote.validUntil}. Menggunakan harga acuan kanonis.`,
        provenance: {
          referenceId: expiredQuote.id,
          notes: `Kedaluwarsa pada ${expiredQuote.validUntil}. Fallback ke acuan kanonis.`,
        },
      };
    }

    // REFERENCE tier: the canonical master price. The source vocabulary
    // distinguishes AHSP compositions from regional/reference records.
    const refSource: ResolvedPriceSource =
      result.category === 'AHSP'
        ? 'AHSP'
        : result.source === 'REGIONAL_STANDARDS'
          ? 'REGIONAL_REFERENCE'
          : 'EZRAB_REFERENCE';
    return {
      materialId: qObj.code || itemCode,
      materialCode: itemCode,
      materialName: itemName,
      projectId,
      price: finalPrice,
      unit: finalUnit,
      source: refSource,
      status: 'REFERENCE',
      sourceName:
        result.sourceDocument ||
        (refSource === 'AHSP'
          ? 'Standar Harga Resmi AHSP 2026'
          : refSource === 'REGIONAL_REFERENCE'
            ? 'Standar Harga Regional'
            : 'Database Referensi Nasional EZRAB'),
      region: result.region,
      isFinal: true,
      confidence: result.confidence,
      referencePrice: finalPrice,
      varianceAmount: 0,
      variancePercent: 0,
      explanation: `Menggunakan harga acuan kanonis: Rp ${finalPrice.toLocaleString('id-ID')}/${finalUnit} via ${result.source}${conversionNote}`,
      provenance: {
        referenceId: result.source,
        notes: result.resolutionPath.join(' → '),
      },
    };
  }

  // EXPIRED without a canonical answer: no live-master price resolved,
  // so the fallback is the live reference (when one exists for the
  // query unit) or the expired price itself at low confidence.
  if (projectId) {
    const expiredQuote = findExpiredProjectPrice(projectId, [normCode, normName].filter(Boolean));
    if (expiredQuote) {
      const refPrice = resolveLiveReferencePrice(canonical);
      if (refPrice !== undefined) {
        return {
          materialId: expiredQuote.materialId,
          materialCode: itemCode,
          materialName: itemName,
          projectId,
          price: refPrice,
          // The fallback price is unit-gated to the QUERY unit
          // (resolveLiveReferencePrice converts when convertible),
          // so the unit shown is the query unit (§12 P5).
          unit: qObj.unit || result.unit,
          source: 'EZRAB_REFERENCE',
          status: 'EXPIRED',
          sourceName: 'Database Referensi Kanonis EZRAB (Fallback)',
          supplier: expiredQuote.supplierName,
          validUntil: expiredQuote.validUntil,
          isFinal: true,
          confidence: 0.95,
          referencePrice: refPrice,
          projectPrice: expiredQuote.price,
          varianceAmount: 0,
          variancePercent: 0,
          explanation: `Peringatan: Penawaran harga proyek (Rp ${expiredQuote.price.toLocaleString('id-ID')}) telah kedaluwarsa pada ${expiredQuote.validUntil}. Menggunakan harga acuan kanonis.`,
          provenance: {
            referenceId: expiredQuote.id,
            notes: `Kedaluwarsa pada ${expiredQuote.validUntil}. Fallback ke acuan kanonis.`,
          },
        };
      }
      return {
        materialId: expiredQuote.materialId,
        materialCode: itemCode,
        materialName: itemName,
        projectId,
        price: expiredQuote.price,
        unit: expiredQuote.unit,
        source: 'PROJECT_PRICE',
        status: 'EXPIRED',
        sourceName: expiredQuote.supplierName || 'Penawaran Kedaluwarsa',
        validUntil: expiredQuote.validUntil,
        isFinal: true,
        confidence: 0.5,
        projectPrice: expiredQuote.price,
        varianceAmount: 0,
        variancePercent: 0,
        explanation: `Peringatan: Penawaran harga proyek kedaluwarsa pada ${expiredQuote.validUntil}.`,
      };
    }
  }

  // MANUAL (engine parity): an explicit manual price is a labelled
  // estimator input, never a resolved master price.
  if (qObj.manualPrice && qObj.manualPrice > 0) {
    return {
      materialId: qObj.code || `MANUAL-${Date.now()}`,
      materialCode: qObj.code,
      materialName: qObj.name,
      projectId,
      price: qObj.manualPrice,
      unit: qObj.unit || 'unit',
      source: 'MANUAL',
      status: 'REFERENCE',
      sourceName: 'Harga Input Manual Estimator',
      isFinal: true,
      confidence: 0.8,
      explanation: 'Harga diinput secara manual tanpa referensi database.',
    };
  }

  // Fail-closed.
  return {
    materialId: qObj.code || `NOTFOUND-${Date.now()}`,
    materialCode: qObj.code,
    materialName: qObj.name || qObj.code || 'Item Tidak Dikenal',
    projectId,
    price: 0,
    unit: qObj.unit || 'unit',
    source: 'PRICE_NOT_FOUND',
    status: 'NOT_FOUND',
    sourceName: 'Harga Tidak Ditemukan',
    isFinal: false,
    confidence: 0,
    explanation: unitMismatch
      ? `Harga "${qObj.name || qObj.code}" tidak diresolve: item tersedia hanya dalam satuan berbeda dari "${qObj.unit}" (UNIT_MISMATCH). Tidak dialihkan ke item lain.`
      : result.rejectionReason ||
        `Harga untuk "${qObj.name || qObj.code}" tidak ditemukan dalam database referensi kanonis maupun harga proyek.`,
  };
}

/**
 * Drop-in replacement for `new PriceResolver()` at the DI seams
 * (CostCompositionEngine / CostPolicyEngine constructors). The class
 * exists so call sites keep constructing a resolver; the behaviour is
 * entirely the two pure functions above.
 */
export class CanonicalPriceResolverAdapter implements PriceResolverLike {
  public resolve(
    query: PriceItemQuery | string,
    context?: PriceContext,
  ): PriceResolutionResult {
    return resolveCanonicalPriceAsResolutionResult(query, context);
  }

  public resolvePrice(
    query: PriceItemQuery | string,
    context?: PriceContext,
  ): ResolvedPrice {
    return resolveCanonicalPriceAsResolvedPrice(query, context);
  }
}

export const canonicalPriceResolverAdapter = new CanonicalPriceResolverAdapter();

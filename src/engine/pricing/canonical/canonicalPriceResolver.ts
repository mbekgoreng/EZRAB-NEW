/**
 * EZRAB — CANONICAL PRICE RESOLVER
 * =================================
 * Phase 11 & Phase 14: Single Source of Truth for Price Resolution.
 *
 * All modules (DED RAB, Template Engine, Spreadsheet commit, Price Explorer)
 * MUST call this canonical resolver.
 *
 * Strict Resolution Hierarchy:
 *   1. PROJECT PRICE (active project override / project quote)
 *   2. EXACT OFFICIAL PRICE (SE DJBK No. 47/2026 official AHSP / DHSP)
 *   3. REGION MATCH (Regional SSH / provincial index)
 *   4. PERIOD MATCH (2026 period alignment)
 *   5. REFERENCE PRICE (National benchmark reference)
 *   6. MISSING (Strict fail-closed: price = null, NO synthetic numbers)
 *
 * Anti-Absurd Price Gate:
 *   - Enforces Unit Check BEFORE price acceptance.
 *   - Enforces Engineering Magnitude Bounds via PriceSanityValidator.
 *   - Any absurd price (e.g. rebar @ 3.8M/kg, girder @ 280M for residential)
 *     is rejected as 'INVALID'.
 *
 * MASTER PRICING §6 (b) + §10 — project pricing modes (this wrapper is
 * the mode dispatch for DED/project queries; the lower resolver only
 * carries the context parameter):
 *   - LIVE_MASTER_PRICE (default): the historical flow below, unchanged.
 *   - SNAPSHOT_PRICE: the query is answered from the supplied snapshot
 *     map first (Step 0); a miss falls through to the live flow with a
 *     path note, and the snapshot context is passed down so AHSP
 *     compositions price their components from the snapshot. Project
 *     overrides (Step 1) do NOT run under SNAPSHOT — a snapshot is a
 *     frozen record, not a live project state.
 *   - PROJECT_OVERRIDE: Step 1 (ProjectPriceEngine) as before, with the
 *     mode recorded on the result. Without a projectId there is no
 *     override to consult, so the flow falls through to live (noted).
 */

import { canonicalUnitRegistry } from './canonicalUnitRegistry';
import { priceSanityValidator, PriceSanityResult } from './priceSanityValidator';
import { sourceGovernanceRegistry } from './sourceRegistry';
import { projectPriceEngine } from '../projectPriceEngine';
import { officialAhspRepository } from '../../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../../data/priceDatabase2026/resolver';
import { lookupContextPrice, resolvePricingMode } from '../../../data/priceDatabase2026/centralResolution';
import type {
  ComponentPriceMapRef,
  PriceSourceTier,
  ProjectPricingMode,
  ResourceType,
} from '../../../data/priceDatabase2026/types';
import type { PriceCategory } from '../contracts/types';
import { PriceRepository } from '../repository/priceRepository';
import { PriceNormalizationEngine } from '../normalization/priceNormalization';

export type ResolutionStatus = 'RESOLVED' | 'MISSING' | 'INVALID';

export interface CanonicalPriceQuery {
  code?: string;
  name: string;
  unit?: string;
  category?: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'AHSP' | 'WORK_ITEM' | string;
  projectId?: string;
  region?: string;
  period?: string; // e.g. '2026'
  itemType?: 'RESOURCE' | 'AHSP' | 'AUTO';
  /** MASTER PRICING §6 (b) + §10 — project pricing mode. Absent = LIVE. */
  pricingMode?: ProjectPricingMode;
  /** SNAPSHOT_PRICE only: the frozen price map to answer from. */
  snapshotRef?: ComponentPriceMapRef;
  /**
   * MASTER PRICING §15 (#8) — record-exclusion seam for staged
   * re-preview (price REMOVAL preview), threaded to the Step-2 lower
   * resolver calls (AHSP composition + resource resolution). Absent =
   * the historical path, unchanged. LIMITATION (documented, not
   * hidden): Steps 3/5 (regional / national benchmarks) read
   * `PriceRepository`, whose records carry different ids than the
   * lower resolver's index, so they are NOT exclusion-aware — a
   * removal preview over a benchmark-resolved component still needs a
   * PriceRepository-side exclusion (out of scope for this seam; the
   * §9 repricer, the actual staged re-preview consumer, works on
   * lower-resolver compositions, where the seam is complete).
   */
  excludeRecordIds?: ReadonlySet<string>;
}

export interface CanonicalPriceResult {
  status: ResolutionStatus;
  price: number | null;
  unit: string;
  source: string;
  sourceDocument?: string;
  region: string;
  period: string;
  confidence: number;
  resolutionPath: string[];
  rejectionReason?: string;
  anomalyReason?: string;
  /** MASTER PRICING §6 (b) — the mode this query ran under. */
  pricingMode?: ProjectPricingMode;
  /**
   * MASTER PRICING §12 — provenance tier of the winning record, in the
   * PriceDefinition vocabulary ('OFFICIAL' | 'MARKET' | 'LEGACY').
   * Lets downstream consumers (cost composition provenance, DED) tell a
   * market reference from an official price WITHOUT re-reading the
   * repository. Undefined for project/snapshot answers (not master
   * records) and for MISSING/INVALID results.
   */
  sourceTier?: 'OFFICIAL' | 'MARKET' | 'LEGACY';
  /**
   * MASTER PRICING §12 — category of what resolved. AHSP items report
   * 'AHSP'; resource hits report the winning record's category.
   * Undefined when the winning path carries no category (project
   * override/quote without a category on the query, MISSING/INVALID).
   */
  category?: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'AHSP';
  componentBreakdown?: {
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    overheadProfitCost: number;
  };
}

/**
 * MASTER PRICING §12 — map a priceDatabase2026 source tier to the
 * PriceDefinition tier vocabulary. Government/regional official tiers
 * are OFFICIAL; commercial and user/project-provided tiers are MARKET
 * (verified but not official — labelling them RESMI AHSP would be the
 * exact mislabelling the provenance tier exists to prevent); superseded
 * records are LEGACY (they never resolve, but the mapping is total).
 */
function mapSourceTierToPriceTier(
  tier: PriceSourceTier | undefined | null,
): 'OFFICIAL' | 'MARKET' | 'LEGACY' | undefined {
  if (!tier) return undefined;
  if (tier === 'OFFICIAL_GOVERNMENT' || tier === 'OFFICIAL_PROJECT' || tier === 'VERIFIED_REGIONAL') {
    return 'OFFICIAL';
  }
  if (tier === 'LEGACY_SUPERSEDED') return 'LEGACY';
  return 'MARKET';
}

/** MASTER PRICING §12 — winning-record resource type → result category. */
function mapResourceTypeToCategory(
  resourceType: ResourceType | undefined | null,
): 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | undefined {
  if (resourceType === 'material') return 'MATERIAL';
  if (resourceType === 'labor') return 'LABOR';
  if (resourceType === 'equipment') return 'EQUIPMENT';
  return undefined;
}

/**
 * MASTER PRICING §12 — PriceDefinition category → result category.
 * SMKK/OTHER have no result-category equivalent and map to undefined
 * (the caller falls back to its own derivation).
 */
function mapPriceCategoryToResultCategory(
  category: PriceCategory | undefined | null,
): 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | undefined {
  if (category === 'MATERIAL' || category === 'LABOR' || category === 'EQUIPMENT') {
    return category;
  }
  return undefined;
}

/**
 * MASTER PRICING §12 — the query's own category, when it names one of
 * the four result categories. Used for project/snapshot answers, where
 * the winning path carries no record category of its own.
 */
function mapQueryCategoryToResultCategory(
  category: string | undefined,
): 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'AHSP' | undefined {
  if (
    category === 'MATERIAL' ||
    category === 'LABOR' ||
    category === 'EQUIPMENT' ||
    category === 'AHSP'
  ) {
    return category;
  }
  return undefined;
}

export class CanonicalPriceResolver {
  private static instance: CanonicalPriceResolver;
  private priceRepo: PriceRepository;

  private constructor() {
    this.priceRepo = PriceRepository.getInstance();
  }

  public static getInstance(): CanonicalPriceResolver {
    if (!CanonicalPriceResolver.instance) {
      CanonicalPriceResolver.instance = new CanonicalPriceResolver();
    }
    return CanonicalPriceResolver.instance;
  }

  /**
   * Resolves an authoritative, sanity-checked unit price following the canonical 6-stage flow.
   */
  public resolve(query: CanonicalPriceQuery): CanonicalPriceResult {
    const rawName = (query.name || query.code || '').trim();
    const rawCode = (query.code || '').trim();
    const rawUnit = (query.unit || '').trim();
    const projectId = query.projectId;
    const region = query.region || 'NATIONAL';
    const period = query.period || '2026';
    const resolutionPath: string[] = [];
    // MASTER PRICING §6 (b) + §10 — the requested mode, recorded on
    // every result. Absent = LIVE_MASTER_PRICE (historical behaviour).
    const pricingMode = resolvePricingMode({ pricingMode: query.pricingMode });
    // Context passed DOWN to the lower resolver (AHSP compositions +
    // resource resolution). Only SNAPSHOT carries a map; PROJECT_OVERRIDE
    // is served by ProjectPriceEngine at Step 1, not by a map.
    const pricingContext =
      pricingMode === 'SNAPSHOT_PRICE'
        ? { pricingMode, snapshotRef: query.snapshotRef ?? null }
        : null;

    if (!rawName && !rawCode) {
      return {
        status: 'MISSING',
        price: null,
        unit: rawUnit || 'unit',
        source: 'NONE',
        region,
        period,
        confidence: 0,
        resolutionPath: ['EMPTY_QUERY_REJECTED'],
        rejectionReason: 'Kueri kode atau nama kosong.',
        pricingMode,
      };
    }

    const normCode = rawCode ? PriceNormalizationEngine.normalizeCode(rawCode) : '';
    const normName = rawName ? PriceNormalizationEngine.normalizeText(rawName) : '';
    const lookupKey = normCode || normName;

    // =========================================================================
    // STEP 0: SNAPSHOT PRICE (MASTER PRICING §6 (b) + §10)
    // A frozen project snapshot answers first. A miss falls through to the
    // live flow with a path note (and the snapshot context still travels
    // down, so an AHSP composition prices its components from the
    // snapshot). Snapshot prices pass the same sanity gate as overrides.
    // =========================================================================
    if (pricingMode === 'SNAPSHOT_PRICE') {
      const snapshotPrice = lookupContextPrice(query.snapshotRef, rawCode, rawName, rawUnit);
      if (snapshotPrice !== null) {
        const effectiveUnit = rawUnit || 'unit';
        const sanity = priceSanityValidator.validatePrice(rawName, snapshotPrice, effectiveUnit);
        if (sanity.status === 'PRICE_INVALID') {
          resolutionPath.push(`PRICE_SANITY_REJECTED_ON_SNAPSHOT: ${sanity.rejectionReason}`);
          return {
            status: 'INVALID',
            price: null,
            unit: effectiveUnit,
            source: 'SNAPSHOT_PRICE',
            sourceDocument: query.snapshotRef?.label || 'Project Snapshot',
            region,
            period,
            confidence: 0,
            resolutionPath,
            pricingMode,
            rejectionReason: sanity.rejectionReason,
            anomalyReason: `Harga snapshot Rp ${snapshotPrice.toLocaleString('id-ID')}/${effectiveUnit} tidak wajar secara engineering.`,
          };
        }
        resolutionPath.push(`SNAPSHOT_PRICE_RESOLVED: Rp ${snapshotPrice}/${effectiveUnit}`);
        return {
          status: 'RESOLVED',
          price: snapshotPrice,
          unit: effectiveUnit,
          source: 'SNAPSHOT_PRICE',
          sourceDocument: query.snapshotRef?.label || 'Project Snapshot',
          region,
          period,
          confidence: 1.0,
          resolutionPath,
          pricingMode,
          category: mapQueryCategoryToResultCategory(query.category),
        };
      }
      resolutionPath.push(`SNAPSHOT_MISS_FALL_THROUGH_TO_LIVE: ${lookupKey}@${rawUnit || '?'}`);
    }

    // =========================================================================
    // STEP 1: PROJECT PRICE (Active Project Override / Project Quote)
    // Skipped under SNAPSHOT_PRICE (a frozen record, not live state).
    // =========================================================================
    if (pricingMode === 'PROJECT_OVERRIDE' && !projectId) {
      resolutionPath.push('PROJECT_OVERRIDE_NO_PROJECT_ID_FALL_THROUGH_TO_LIVE');
    }
    if (projectId && pricingMode !== 'SNAPSHOT_PRICE') {
      // 1A. Check Active Override First
      const override = projectPriceEngine.getProjectOverride(projectId, lookupKey);
      if (override && override.active) {
        resolutionPath.push(`PROJECT_OVERRIDE_FOUND: ${override.id} for project ${projectId}`);
        const effectiveUnit = override.unit || rawUnit || 'unit';

        // Anti-Absurd Gate on Override
        const sanity = priceSanityValidator.validatePrice(rawName, override.price, effectiveUnit);
        if (sanity.status === 'PRICE_INVALID') {
          resolutionPath.push(`PRICE_SANITY_REJECTED_ON_OVERRIDE: ${sanity.rejectionReason}`);
          return {
            status: 'INVALID',
            price: null,
            unit: effectiveUnit,
            source: `PROJECT_OVERRIDE_${projectId}`,
            sourceDocument: `Project Override Record ${override.id}`,
            region,
            period,
            confidence: 0,
            resolutionPath,
            pricingMode,
            rejectionReason: sanity.rejectionReason,
            anomalyReason: `Harga override Rp ${override.price.toLocaleString('id-ID')}/${effectiveUnit} tidak wajar secara engineering.`,
          };
        }

        resolutionPath.push(`PROJECT_OVERRIDE_RESOLVED: Rp ${override.price}/${effectiveUnit}`);
        return {
          status: 'RESOLVED',
          price: override.price,
          unit: effectiveUnit,
          source: 'PROJECT_OVERRIDE',
          sourceDocument: `Project Override ${override.id} (${override.reason || 'Manual Approval'})`,
          region,
          period,
          confidence: 1.0,
          resolutionPath,
          pricingMode,
          category: mapQueryCategoryToResultCategory(query.category),
        };
      }

      // 1B. Check Project Material Price Quote (if not expired)
      const projPrice = projectPriceEngine.getProjectPrice(projectId, lookupKey);
      if (projPrice && !projectPriceEngine.isPriceExpired(projPrice.validUntil)) {
        resolutionPath.push(`PROJECT_PRICE_QUOTE_FOUND: ${projPrice.id} from supplier ${projPrice.supplierName || 'Unknown'}`);
        const effectiveUnit = projPrice.unit || rawUnit || 'unit';

        const sanity = priceSanityValidator.validatePrice(rawName, projPrice.price, effectiveUnit);
        if (sanity.status === 'PRICE_INVALID') {
          resolutionPath.push(`PRICE_SANITY_REJECTED_ON_PROJECT_PRICE: ${sanity.rejectionReason}`);
          return {
            status: 'INVALID',
            price: null,
            unit: effectiveUnit,
            source: 'PROJECT_PRICE_QUOTE',
            region: projPrice.region || region,
            period,
            confidence: 0,
            resolutionPath,
            pricingMode,
            rejectionReason: sanity.rejectionReason,
          };
        }

        resolutionPath.push(`PROJECT_PRICE_QUOTE_RESOLVED: Rp ${projPrice.price}/${effectiveUnit}`);
        return {
          status: 'RESOLVED',
          price: projPrice.price,
          unit: effectiveUnit,
          source: 'PROJECT_PRICE_QUOTE',
          sourceDocument: projPrice.supplierName || `Supplier Quote for Project ${projectId}`,
          region: projPrice.region || region,
          period,
          confidence: 0.98,
          resolutionPath,
          pricingMode,
          category: mapQueryCategoryToResultCategory(query.category),
        };
      }
    }

    // =========================================================================
    // STEP 2: EXACT OFFICIAL PRICE (AHSP / DHSP 2026 SE DJBK No. 47/2026)
    // =========================================================================
    // Check if query targets an AHSP item
    const isAhspQuery =
      query.itemType === 'AHSP' ||
      (query.itemType !== 'RESOURCE' &&
        (rawCode.includes('.') ||
          normName.includes('pemasangan') ||
          normName.includes('pembuatan') ||
          normName.includes('pekerjaan') ||
          normName.includes('penulangan')));

    if (isAhspQuery && (normCode || normName)) {
      let officialAhsp = normCode ? officialAhspRepository.getOfficialAhsp(normCode) : undefined;
      if (!officialAhsp && normCode) {
        // Try searching without leading zeros or punctuation
        officialAhsp = officialAhspRepository.getOfficialAhsp(rawCode);
      }

      if (officialAhsp) {
        resolutionPath.push(`OFFICIAL_AHSP_EXACT_CODE: ${officialAhsp.code} (${officialAhsp.name})`);
        // MASTER PRICING §6 (b): under SNAPSHOT the composition prices
        // its components from the snapshot map (context travels down);
        // under LIVE/OVERRIDE pricingContext is null (default behaviour).
        // MASTER PRICING §15 (#8): the exclusion seam threads through
        // to the composition (absent = the historical call, unchanged).
        const priceComp = priceResolver2026.resolveAhspUnitPrice(officialAhsp, {
          pricingContext,
          excludeRecordIds: query.excludeRecordIds,
        });
        // Keputusan owner 2026-10-27: jalur transfer DED → RAB memakai BIAYA
        // LANGSUNG (priceComp.unitPrice = jumlah komponen), BUKAN total DHSP
        // (priceComp.hspPrice / officialDhspPrice). Total DHSP sudah mengandung
        // markup sehingga memakainya sebagai harga dasar menyebabkan markup
        // ganda saat rekap menambahkan overhead + profit + PPN. DHSP tetap
        // tersedia sebagai REFERENSI lewat komposisi resolver, bukan harga
        // transfer. Bila biaya langsung null, alur jatuh ke langkah berikut
        // (harga resource / PRICE_NOT_FOUND) — tidak pernah menebak harga.
        const resolvedPrice = priceComp.unitPrice;

        if (resolvedPrice !== null && resolvedPrice > 0) {
          const effectiveUnit = officialAhsp.unit || rawUnit || 'unit';
          const sanity = priceSanityValidator.validatePrice(officialAhsp.name, resolvedPrice, effectiveUnit);

          if (sanity.status === 'PRICE_INVALID') {
            resolutionPath.push(`PRICE_SANITY_REJECTED_ON_AHSP: ${sanity.rejectionReason}`);
            return {
              status: 'INVALID',
              price: null,
              unit: effectiveUnit,
              source: `OFFICIAL_${officialAhsp.domain}_2026`,
              sourceDocument: 'SE DJBK No. 47/SE/Dk/2026',
              region,
              period: '2026',
              confidence: 0,
              resolutionPath,
              pricingMode,
              rejectionReason: sanity.rejectionReason,
              anomalyReason: `AHSP ${officialAhsp.code} menghasilkan harga Rp ${resolvedPrice.toLocaleString('id-ID')}/${effectiveUnit} di luar batas engineering.`,
            };
          }

          resolutionPath.push(`OFFICIAL_AHSP_RESOLVED: Rp ${resolvedPrice}/${effectiveUnit}`);
          return {
            status: 'RESOLVED',
            price: resolvedPrice,
            unit: effectiveUnit,
            source: `OFFICIAL_${officialAhsp.domain}_2026`,
            sourceDocument: 'SE DJBK No. 47/SE/Dk/2026',
            region,
            period: '2026',
            confidence: 0.95,
            resolutionPath,
            pricingMode,
            sourceTier: 'OFFICIAL',
            category: 'AHSP',
            componentBreakdown: {
              materialCost: priceComp.material?.subtotalPerUnit || 0,
              laborCost: priceComp.labor?.subtotalPerUnit || 0,
              equipmentCost: priceComp.equipment?.subtotalPerUnit || 0,
              overheadProfitCost: priceComp.overheadAmount || 0,
            },
          };
        }
      }
    }

    // Check exact official resource price (Material, Labor, Equipment)
    const resourceRes = priceResolver2026.resolveResourcePrice({
      resourceCode: rawCode || undefined,
      resourceName: rawName,
      unit: rawUnit || undefined,
      location: region !== 'NATIONAL' ? { provinceName: region } : undefined,
      period: { year: 2026 },
      // MASTER PRICING §6 (b): under SNAPSHOT the lower resolver answers
      // from the snapshot map; under LIVE/OVERRIDE this is null.
      pricingContext,
      // MASTER PRICING §15 (#8): the exclusion seam threads through
      // (absent = the historical call, unchanged).
      excludeRecordIds: query.excludeRecordIds,
    });

    if (resourceRes && resourceRes.price !== null && resourceRes.price > 0) {
      const sourceTier = resourceRes.source?.tier || 'OFFICIAL_GOVERNMENT';
      const sourceDoc = resourceRes.source?.document || 'SE DJBK No. 47/SE/Dk/2026';
      resolutionPath.push(`OFFICIAL_RESOURCE_RESOLVED: ${resourceRes.resourceCode || rawName} via ${sourceTier}`);
      const effectiveUnit = resourceRes.unit || rawUnit || 'unit';

      const sanity = priceSanityValidator.validatePrice(rawName, resourceRes.price, effectiveUnit);
      if (sanity.status === 'PRICE_INVALID') {
        resolutionPath.push(`PRICE_SANITY_REJECTED_ON_RESOURCE: ${sanity.rejectionReason}`);
        return {
          status: 'INVALID',
          price: null,
          unit: effectiveUnit,
          source: sourceTier,
          sourceDocument: sourceDoc,
          region,
          period: '2026',
          confidence: 0,
          resolutionPath,
          pricingMode,
          rejectionReason: sanity.rejectionReason,
        };
      }

      return {
        status: 'RESOLVED',
        price: resourceRes.price,
        unit: effectiveUnit,
        source: sourceTier,
        sourceDocument: sourceDoc,
        region: resourceRes.resolvedLocation?.provinceName || region,
        period: '2026',
        confidence: sourceTier === 'OFFICIAL_GOVERNMENT' ? 0.95 : 0.85,
        resolutionPath,
        pricingMode,
        sourceTier: mapSourceTierToPriceTier(resourceRes.source?.tier),
        category: mapResourceTypeToCategory(resourceRes.resourceType),
      };
    }

    // =========================================================================
    // STEP 3: REGION MATCH (Regional SSH / provincial database)
    // =========================================================================
    if (region && region !== 'NATIONAL') {
      const allMaster = this.priceRepo.getAllMasterPrices();
      const normRegion = region.toLowerCase();
      const regionalMatch = allMaster.find((p) => {
        const pLoc = (p.location || '').toLowerCase();
        const pNormName = PriceNormalizationEngine.normalizeText(p.name);
        return pLoc.includes(normRegion) && (pNormName === normName || (p.code && p.code === rawCode));
      });

      if (regionalMatch && regionalMatch.price > 0) {
        resolutionPath.push(`REGIONAL_PRICE_MATCH: ${regionalMatch.name} in ${regionalMatch.location}`);
        const effectiveUnit = regionalMatch.unit || rawUnit || 'unit';

        const sanity = priceSanityValidator.validatePrice(rawName, regionalMatch.price, effectiveUnit);
        if (sanity.status === 'PRICE_INVALID') {
          resolutionPath.push(`PRICE_SANITY_REJECTED_ON_REGIONAL: ${sanity.rejectionReason}`);
          return {
            status: 'INVALID',
            price: null,
            unit: effectiveUnit,
            source: 'REGIONAL_STANDARDS',
            region: regionalMatch.location,
            period,
            confidence: 0,
            resolutionPath,
            pricingMode,
            rejectionReason: sanity.rejectionReason,
          };
        }

        return {
          status: 'RESOLVED',
          price: regionalMatch.price,
          unit: effectiveUnit,
          source: 'REGIONAL_STANDARDS',
          sourceDocument: `Standar Harga Satuan Regional ${regionalMatch.location}`,
          region: regionalMatch.location,
          period,
          confidence: 0.90,
          resolutionPath,
          pricingMode,
          sourceTier: regionalMatch.sourceTier,
          category: mapPriceCategoryToResultCategory(regionalMatch.category),
        };
      }
    }

    // =========================================================================
    // STEP 4: PERIOD MATCH (Period 2026 National Reference)
    // =========================================================================
    resolutionPath.push(`PERIOD_ALIGNMENT_CHECK: Target period ${period}`);

    // =========================================================================
    // STEP 5: REFERENCE PRICE (Master Repository National Benchmark)
    // =========================================================================
    // Phase 3D: Do not silently use last-registered price for ambiguous codes.
    // If code is ambiguous, skip code lookup and only use name fallback with warning.
    let masterHit: import('../contracts/types').PriceDefinition | undefined = undefined;
    if (this.priceRepo.isCodeAmbiguous(normCode)) {
      resolutionPath.push(`AMBIGUOUS_CODE_SKIPPED: "${normCode}" matches multiple variants; code lookup skipped for benchmark.`);
      // Fall through to name-based lookup only (with warning below)
    } else {
      masterHit = this.priceRepo.getByCode(normCode, undefined) || undefined;
    }
    if (!masterHit) {
      const nameHit = this.priceRepo.getAllMasterPrices().find((p) => {
        const pNormName = PriceNormalizationEngine.normalizeText(p.name);
        return pNormName === normName;
      });
      if (nameHit) {
        // Phase 3D: Warn if name fallback returns a different code than queried
        const nameHitCode = PriceNormalizationEngine.normalizeCode(nameHit.codeNormalized || nameHit.code);
        if (normCode && nameHitCode !== normCode) {
          resolutionPath.push(`NAME_FALLBACK_CODE_MISMATCH: queried "${normCode}" but name matched "${nameHitCode}". Using name match with warning.`);
        }
        masterHit = nameHit;
      }
    }

    if (masterHit && masterHit.price > 0) {
      resolutionPath.push(`NATIONAL_REFERENCE_MATCH: ${masterHit.code || masterHit.name}`);
      const effectiveUnit = masterHit.unit || rawUnit || 'unit';

      const sanity = priceSanityValidator.validatePrice(rawName, masterHit.price, effectiveUnit);
      if (sanity.status === 'PRICE_INVALID') {
        resolutionPath.push(`PRICE_SANITY_REJECTED_ON_MASTER: ${sanity.rejectionReason}`);
        return {
          status: 'INVALID',
          price: null,
          unit: effectiveUnit,
          source: 'EZRAB_REFERENCE',
          region: 'NATIONAL',
          period,
          confidence: 0,
          resolutionPath,
          pricingMode,
          rejectionReason: sanity.rejectionReason,
        };
      }

      return {
        status: 'RESOLVED',
        price: masterHit.price,
        unit: effectiveUnit,
        source: 'EZRAB_REFERENCE',
        sourceDocument: 'Database Referensi Nasional EZRAB 2026',
        region: 'NATIONAL',
        period,
        confidence: 0.85,
        resolutionPath,
        pricingMode,
        sourceTier: masterHit.sourceTier,
        category: mapPriceCategoryToResultCategory(masterHit.category),
      };
    }

    // =========================================================================
    // STEP 6: MISSING (Fail-Closed, Anti-Hallucination)
    // =========================================================================
    resolutionPath.push('PRICE_NOT_FOUND_FAIL_CLOSED');
    return {
      status: 'MISSING',
      price: null,
      unit: rawUnit || 'unit',
      source: 'NONE',
      region,
      period,
      confidence: 0,
      resolutionPath,
      pricingMode,
      rejectionReason: `Harga tidak ditemukan dalam database resmi, regional, maupun referensi untuk "${rawName}".`,
    };
  }
}

export const canonicalPriceResolver = CanonicalPriceResolver.getInstance();

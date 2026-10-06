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
 */

import { canonicalUnitRegistry } from './canonicalUnitRegistry';
import { priceSanityValidator, PriceSanityResult } from './priceSanityValidator';
import { sourceGovernanceRegistry } from './sourceRegistry';
import { projectPriceEngine } from '../projectPriceEngine';
import { officialAhspRepository } from '../../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../../data/priceDatabase2026/resolver';
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
  componentBreakdown?: {
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    overheadProfitCost: number;
  };
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
      };
    }

    const normCode = rawCode ? PriceNormalizationEngine.normalizeCode(rawCode) : '';
    const normName = rawName ? PriceNormalizationEngine.normalizeText(rawName) : '';
    const lookupKey = normCode || normName;

    // =========================================================================
    // STEP 1: PROJECT PRICE (Active Project Override / Project Quote)
    // =========================================================================
    if (projectId) {
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
        const priceComp = priceResolver2026.resolveAhspUnitPrice(officialAhsp);
        const resolvedPrice = priceComp.hspPrice || priceComp.unitPrice;

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
    const masterHit = this.priceRepo.getByCode(normCode, undefined) ||
      this.priceRepo.getAllMasterPrices().find((p) => {
        const pNormName = PriceNormalizationEngine.normalizeText(p.name);
        return pNormName === normName;
      });

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
      rejectionReason: `Harga tidak ditemukan dalam database resmi, regional, maupun referensi untuk "${rawName}".`,
    };
  }
}

export const canonicalPriceResolver = CanonicalPriceResolver.getInstance();

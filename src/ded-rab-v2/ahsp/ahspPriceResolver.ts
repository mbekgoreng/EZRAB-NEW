/**
 * AHSP Price Resolver (EZRAB DED -> RAB V2)
 *
 * PRICE RESOLUTION ORDER (7-Tier Audited Hierarchy):
 * 1. PROJECT PRICE: Existing approved RAB items in the active project.
 * 2. WORKSPACE / USER PRICE: Company internal cost database.
 * 3. EZRAB OFFICIAL PRICE DATABASE (PUPR 2026): Master Indonesian AHSP catalog.
 * 4. VERIFIED HISTORICAL / CACHED PRICE: National Cost Database (Bina Marga / Cipta Karya 2026).
 * 5. EXTERNAL PRICE DISCOVERY: EZRAB Price Engine material & DHSP lookup.
 * 6. AI PRICE ESTIMATION (FINAL FALLBACK):
 *    - Resource-Level Estimation if AHSP recipe exists (SafeDecimalEngine Σ coef × price)
 *    - Work-Item Level Estimation for uncataloged items
 * 7. ONLY THEN -> PRICE_UNRESOLVED
 *
 * Strict Principles:
 * - "HARGA BELUM TERSEDIA" MUST NOT be the default final result.
 * - AI-estimated prices carry isOfficial: false, source_type: "AI_ESTIMATE", status: "ESTIMATED".
 * - Deterministic calculation via SafeDecimalEngine.
 * - Never guess arbitrary percentage splits when component data can be resolved.
 */

import {
  DedWorkItem,
  DedPriceResult,
  DedPriceComponent,
  PriceSourceType,
  PriceStatusCode,
} from '../types';
import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/officialAhspRepository';
import { RabItem } from '../../types';
import { PriceResolver } from '../../engine/pricing/resolver/priceResolver';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { aiPriceEstimationEngine } from '../pricing/aiPriceEstimationEngine';

export interface PriceResolverOptions {
  enableAiFallback?: boolean;
  region?: string;
}

export class AhspPriceResolver {
  private static instance: AhspPriceResolver;

  private constructor() {}

  public static getInstance(): AhspPriceResolver {
    if (!AhspPriceResolver.instance) {
      AhspPriceResolver.instance = new AhspPriceResolver();
    }
    return AhspPriceResolver.instance;
  }

  public resolvePrice(
    item: DedWorkItem,
    existingProjectRabItems?: RabItem[],
    companyPriceCatalog?: Array<{ code: string; unitPrice: number }>,
    options?: PriceResolverOptions
  ): DedPriceResult {
    const ahspCode = (item.ahspMatch?.code || (item.ahspMatch as any)?.ahspCode || (item as any).code || '').trim();
    const quantity = item.qto?.quantity ?? (item as any).quantity ?? null;
    const enableAiFallback = options?.enableAiFallback === true;

    // Track search scopes for diagnostics
    const scopes = {
      project: false,
      workspace: false,
      regional: false,
      hsd2026: false,
      custom: false,
    };
    const missingResources: Array<{ code?: string; name: string; type: string }> = [];

    // When an item has no AHSP or matchType is NOT_FOUND / AMBIGUOUS:
    // Only invoke AI work-item estimation if options?.enableAiFallback === true.
    // This preserves the §4/§15 invariant: an unverified/unmatched AHSP item has no official price.
    const isUnverifiedAhsp = !ahspCode || item.ahspMatch?.matchType === 'NOT_FOUND' || item.ahspMatch?.matchType === 'AMBIGUOUS';
    if (isUnverifiedAhsp && options?.enableAiFallback !== true) {
      item.missingResources = [{ name: item.name, type: item.ahspMatch?.matchType === 'AMBIGUOUS' ? 'ANALYSIS_AMBIGUOUS' : 'ANALYSIS_NOT_FOUND' }];
      item.priceSearchScopes = scopes;
      item.priceStatus = item.ahspMatch?.matchType === 'AMBIGUOUS' ? 'NOT_FOUND' : 'PRICE_UNRESOLVED';
      return {
        unitPrice: null,
        totalPrice: null,
        materialPrice: null,
        laborPrice: null,
        equipmentPrice: null,
        subtotalMaterial: null,
        subtotalLabor: null,
        subtotalEquipment: null,
        priceSource: 'PRICE_NOT_FOUND',
        priceStatus: item.ahspMatch?.matchType === 'AMBIGUOUS' ? 'NOT_FOUND' : 'PRICE_UNRESOLVED',
        isOfficial: false,
        currency: 'IDR',
        sourceDetail: item.ahspMatch?.matchType === 'AMBIGUOUS'
          ? 'Item memiliki beberapa pilihan AHSP resmi yang memerlukan konfirmasi pengguna.'
          : 'Belum ada analisa harga resmi (Item belum diverifikasi dengan database AHSP/Harga).',
      };
    }

    const cleanCode = ahspCode.toLowerCase();

    // =========================================================================
    // 1. Priority 1: Project Price (Existing RAB in this active project)
    // =========================================================================
    if (cleanCode && existingProjectRabItems && existingProjectRabItems.length > 0) {
      const matchProject = existingProjectRabItems.find(
        (i) => (i.ahspCode?.toLowerCase() === cleanCode || i.description?.toLowerCase() === item.name.toLowerCase()) && (i.unitPrice || 0) > 0
      );
      if (matchProject && matchProject.unitPrice) {
        scopes.project = true;
        const uPrice = matchProject.unitPrice;
        const matPrice = (matchProject as any).materialPrice ?? (matchProject as any).materialCost ?? null;
        const labPrice = (matchProject as any).laborPrice ?? (matchProject as any).laborCost ?? null;
        const eqPrice = (matchProject as any).equipmentPrice ?? (matchProject as any).equipmentCost ?? null;

        const tot = quantity !== null && quantity > 0 ? SafeDecimalEngine.safeMultiply(uPrice, quantity, 2) : null;
        item.priceSearchScopes = scopes;
        item.priceStatus = 'PRICE_INTERNAL';

        return {
          unitPrice: uPrice,
          totalPrice: tot,
          materialPrice: matPrice,
          laborPrice: labPrice,
          equipmentPrice: eqPrice,
          subtotalMaterial: matPrice !== null && quantity !== null ? SafeDecimalEngine.safeMultiply(matPrice, quantity, 2) : null,
          subtotalLabor: labPrice !== null && quantity !== null ? SafeDecimalEngine.safeMultiply(labPrice, quantity, 2) : null,
          subtotalEquipment: eqPrice !== null && quantity !== null ? SafeDecimalEngine.safeMultiply(eqPrice, quantity, 2) : null,
          priceSource: 'PROJECT_PRICE',
          priceStatus: 'PRICE_INTERNAL',
          isOfficial: true,
          currency: 'IDR',
          sourceDetail: `Harga proyek aktif: ${matchProject.description}`,
        };
      }
    }

    // =========================================================================
    // 2. Priority 2: Company / Workspace Price Catalog
    // =========================================================================
    if (cleanCode && companyPriceCatalog && companyPriceCatalog.length > 0) {
      const matchCompany = companyPriceCatalog.find(
        (c) => c.code.toLowerCase() === cleanCode && c.unitPrice > 0
      );
      if (matchCompany) {
        scopes.workspace = true;
        const uPrice = matchCompany.unitPrice;
        const tot = quantity !== null && quantity > 0 ? SafeDecimalEngine.safeMultiply(uPrice, quantity, 2) : null;
        item.priceSearchScopes = scopes;
        item.priceStatus = 'PRICE_INTERNAL';

        return {
          unitPrice: uPrice,
          totalPrice: tot,
          materialPrice: null,
          laborPrice: null,
          equipmentPrice: null,
          subtotalMaterial: null,
          subtotalLabor: null,
          subtotalEquipment: null,
          priceSource: 'COMPANY_PRICE',
          priceStatus: 'PRICE_INTERNAL',
          isOfficial: true,
          currency: 'IDR',
          sourceDetail: 'Katalog harga standar perusahaan/workspace',
        };
      }
    }

    // Candidate composition holder for Step 6 resource-level estimation
    let candidateRecipe: {
      code: string;
      name: string;
      knownComponents: DedPriceComponent[];
      missingComponents: Array<{ code?: string; name: string; type: string; unit?: string; coefficient?: number }>;
    } | null = null;

    // =========================================================================
    // 3. Priority 3: Official AHSP 2026 price (Canonical PUPR repository)
    // =========================================================================
    if (cleanCode) {
      const matchOfficial = officialAhspRepository.getOfficialAhsp(ahspCode);
      if (matchOfficial) {
        const composition = priceResolver2026.resolveAhspUnitPrice(matchOfficial);
        if (composition.unitPrice !== null && (!composition.missing || composition.missing.length === 0)) {
          scopes.regional = true;
          scopes.hsd2026 = true;
          const uPrice = composition.unitPrice;
          const tot = quantity !== null && quantity > 0 ? SafeDecimalEngine.safeMultiply(uPrice, quantity, 2) : null;
          item.priceSearchScopes = scopes;
          item.priceStatus = 'PRICE_INTERNAL';

          const allComponents = [
            ...composition.material.components,
            ...composition.labor.components,
            ...composition.equipment.components,
          ];
          const components: DedPriceComponent[] = allComponents
            .filter((c) => c.unitPrice !== null)
            .map((c) => ({
              type: c.type === 'labor' ? 'LABOR' : c.type === 'equipment' ? 'EQUIPMENT' : 'MATERIAL',
              code: c.itemCode,
              name: c.itemName,
              unit: c.unit,
              coefficient: c.coefficient,
              unitPrice: c.unitPrice as number,
              totalPrice: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice as number, 2),
              priceSource: 'OFFICIAL_DATABASE',
              priceStatus: 'PRICE_INTERNAL',
            }));

          const matSum = composition.material.subtotalPerUnit;
          const labSum = composition.labor.subtotalPerUnit;
          const eqSum = composition.equipment.subtotalPerUnit;

          return {
            unitPrice: uPrice,
            totalPrice: tot,
            materialPrice: matSum,
            laborPrice: labSum,
            equipmentPrice: eqSum,
            subtotalMaterial: quantity !== null ? SafeDecimalEngine.safeMultiply(matSum, quantity, 2) : null,
            subtotalLabor: quantity !== null ? SafeDecimalEngine.safeMultiply(labSum, quantity, 2) : null,
            subtotalEquipment: quantity !== null ? SafeDecimalEngine.safeMultiply(eqSum, quantity, 2) : null,
            components,
            priceSource: 'OFFICIAL_AHSP',
            priceStatus: 'PRICE_INTERNAL',
            isOfficial: true,
            currency: 'IDR',
            sourceDetail: `AHSP 2026 resmi (${matchOfficial.code}) — ${composition.pricingStatus}`,
          };
        } else if (composition.missing && composition.missing.length > 0) {
          // Record partial recipe for AI fallback
          const allComps = [
            ...composition.material.components,
            ...composition.labor.components,
            ...composition.equipment.components,
          ];
          const known = allComps
            .filter((c) => c.unitPrice !== null && c.unitPrice > 0)
            .map((c) => ({
              type: (c.type === 'labor' ? 'LABOR' : c.type === 'equipment' ? 'EQUIPMENT' : 'MATERIAL') as 'MATERIAL' | 'LABOR' | 'EQUIPMENT',
              code: c.itemCode,
              name: c.itemName,
              unit: c.unit,
              coefficient: c.coefficient,
              unitPrice: c.unitPrice as number,
              totalPrice: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice as number, 2),
              priceSource: 'OFFICIAL_DATABASE' as PriceSourceType,
              priceStatus: 'PRICE_INTERNAL' as PriceStatusCode,
            }));

          const missingComps = allComps
            .filter((c) => c.unitPrice === null || c.unitPrice === 0)
            .map((c) => ({
              code: c.itemCode,
              name: c.itemName,
              type: c.type,
              unit: c.unit,
              coefficient: c.coefficient,
            }));

          candidateRecipe = {
            code: matchOfficial.code,
            name: matchOfficial.name,
            knownComponents: known,
            missingComponents: missingComps,
          };
        }
      }
    }

    // =========================================================================
    // 4. Priority 4: Verified Historical / Cached Price (National DB Catalog)
    // =========================================================================
    if (cleanCode && !candidateRecipe) {
      const matchNational = ALL_OFFICIAL_AHSP_ITEMS.find(
        (a) => a.code.toLowerCase() === cleanCode || a.codeNormalized?.toLowerCase() === cleanCode
      );
      if (matchNational) {
        scopes.regional = true;
        scopes.hsd2026 = true;

        const composition = priceResolver2026.resolveAhspUnitPrice(matchNational);
        if (composition.unitPrice && composition.unitPrice > 0 && (!composition.missing || composition.missing.length === 0)) {
          const uPrice = composition.unitPrice;
          const matPrice = composition.material.subtotalPerUnit || 0;
          const labPrice = composition.labor.subtotalPerUnit || 0;
          const eqPrice = composition.equipment.subtotalPerUnit || 0;

          const components: DedPriceComponent[] = [
            ...composition.labor.components.map((c) => ({
              type: 'LABOR' as const,
              code: c.itemCode,
              name: c.itemName,
              unit: c.unit,
              coefficient: c.coefficient,
              unitPrice: c.unitPrice ?? 0,
              totalPrice: c.subtotalPerUnit ?? 0,
              priceSource: 'OFFICIAL_DATABASE' as PriceSourceType,
              priceStatus: 'PRICE_INTERNAL' as PriceStatusCode,
            })),
            ...composition.material.components.map((c) => ({
              type: 'MATERIAL' as const,
              code: c.itemCode,
              name: c.itemName,
              unit: c.unit,
              coefficient: c.coefficient,
              unitPrice: c.unitPrice ?? 0,
              totalPrice: c.subtotalPerUnit ?? 0,
              priceSource: 'OFFICIAL_DATABASE' as PriceSourceType,
              priceStatus: 'PRICE_INTERNAL' as PriceStatusCode,
            })),
            ...composition.equipment.components.map((c) => ({
              type: 'EQUIPMENT' as const,
              code: c.itemCode,
              name: c.itemName,
              unit: c.unit,
              coefficient: c.coefficient,
              unitPrice: c.unitPrice ?? 0,
              totalPrice: c.subtotalPerUnit ?? 0,
              priceSource: 'OFFICIAL_DATABASE' as PriceSourceType,
              priceStatus: 'PRICE_INTERNAL' as PriceStatusCode,
            })),
          ];

          const tot = quantity !== null && quantity > 0 ? SafeDecimalEngine.safeMultiply(uPrice, quantity, 2) : null;
          item.priceSearchScopes = scopes;
          item.priceStatus = 'PRICE_INTERNAL';

          return {
            unitPrice: uPrice,
            totalPrice: tot,
            materialPrice: matPrice,
            laborPrice: labPrice,
            equipmentPrice: eqPrice,
            subtotalMaterial: quantity !== null ? SafeDecimalEngine.safeMultiply(matPrice, quantity, 2) : null,
            subtotalLabor: quantity !== null ? SafeDecimalEngine.safeMultiply(labPrice, quantity, 2) : null,
            subtotalEquipment: quantity !== null ? SafeDecimalEngine.safeMultiply(eqPrice, quantity, 2) : null,
            components,
            priceSource: 'OFFICIAL_AHSP',
            priceStatus: 'PRICE_INTERNAL',
            isOfficial: true,
            currency: 'IDR',
            sourceDetail: `Katalog AHSP Resmi 2026 (${matchNational.code})`,
          };
        } else if (composition.missing && composition.missing.length > 0) {
          const allComps = [
            ...composition.material.components,
            ...composition.labor.components,
            ...composition.equipment.components,
          ];
          const known = allComps
            .filter((c) => c.unitPrice !== null && c.unitPrice > 0)
            .map((c) => ({
              type: (c.type === 'labor' ? 'LABOR' : c.type === 'equipment' ? 'EQUIPMENT' : 'MATERIAL') as 'MATERIAL' | 'LABOR' | 'EQUIPMENT',
              code: c.itemCode,
              name: c.itemName,
              unit: c.unit,
              coefficient: c.coefficient,
              unitPrice: c.unitPrice as number,
              totalPrice: SafeDecimalEngine.safeMultiply(c.coefficient, c.unitPrice as number, 2),
              priceSource: 'OFFICIAL_DATABASE' as PriceSourceType,
              priceStatus: 'PRICE_INTERNAL' as PriceStatusCode,
            }));

          const missingComps = allComps
            .filter((c) => c.unitPrice === null || c.unitPrice === 0)
            .map((c) => ({
              code: c.itemCode,
              name: c.itemName,
              type: c.type,
              unit: c.unit,
              coefficient: c.coefficient,
            }));

          candidateRecipe = {
            code: matchNational.code,
            name: matchNational.name,
            knownComponents: known,
            missingComponents: missingComps,
          };
        }
      }
    }

    // =========================================================================
    // 5. Priority 5: External Price Discovery (PriceResolver - Exact Database Item)
    // =========================================================================
    try {
      const ezrabPriceResolver = new PriceResolver();
      const resolved = ezrabPriceResolver.resolve({
        code: ahspCode || undefined,
        name: item.name,
        specification: item.materialSpec,
        unit: item.unit,
      });

      if (resolved.status === 'EXACT_MATCH' && resolved.resolvedPrice && resolved.resolvedPrice.price > 0) {
        scopes.hsd2026 = true;
        const p = resolved.resolvedPrice;
        const uPrice = p.price;
        const isLabor = p.category === 'LABOR' || item.name.toLowerCase().includes('upah') || item.name.toLowerCase().includes('tukang');
        const isEquip = p.category === 'EQUIPMENT' || item.name.toLowerCase().includes('sewa') || item.name.toLowerCase().includes('alat');
        const matPrice = !isLabor && !isEquip ? uPrice : 0;
        const labPrice = isLabor ? uPrice : 0;
        const eqPrice = isEquip ? uPrice : 0;
        const tot = quantity !== null && quantity > 0 ? SafeDecimalEngine.safeMultiply(uPrice, quantity, 2) : null;

        item.priceSearchScopes = scopes;
        item.priceStatus = 'PRICE_EXTERNAL';

        return {
          unitPrice: uPrice,
          totalPrice: tot,
          materialPrice: matPrice,
          laborPrice: labPrice,
          equipmentPrice: eqPrice,
          subtotalMaterial: quantity !== null ? SafeDecimalEngine.safeMultiply(matPrice, quantity, 2) : null,
          subtotalLabor: quantity !== null ? SafeDecimalEngine.safeMultiply(labPrice, quantity, 2) : null,
          subtotalEquipment: quantity !== null ? SafeDecimalEngine.safeMultiply(eqPrice, quantity, 2) : null,
          priceSource: 'EXTERNAL_DISCOVERY',
          priceStatus: 'PRICE_EXTERNAL',
          isOfficial: p.priceSource === 'PROJECT_OVERRIDE' || p.priceSource === 'OFFICIAL_DATABASE',
          currency: 'IDR',
          sourceDetail: resolved.explanation || `Database Harga Material EZRAB (${p.name})`,
        };
      }
    } catch {
      // Continue to AI estimation fallback
    }

    // =========================================================================
    // 6. Priority 6: AI Price Estimation (FINAL FALLBACK)
    // =========================================================================
    if (enableAiFallback) {
      // 6A. Resource-Level Estimation: recipe exists with partial missing components
      if (candidateRecipe && candidateRecipe.missingComponents.length > 0) {
        const estimatedResult = aiPriceEstimationEngine.estimateMissingAhspComponents(
          candidateRecipe.code,
          candidateRecipe.name,
          candidateRecipe.knownComponents,
          candidateRecipe.missingComponents,
          quantity,
          { region: options?.region }
        );

        if (estimatedResult.unitPrice && estimatedResult.unitPrice > 0) {
          item.priceSearchScopes = scopes;
          item.priceStatus = estimatedResult.priceStatus || 'PRICE_MIXED';
          item.priceEstimation = estimatedResult.estimationRecord;
          item.missingResources = []; // Missing resources successfully resolved via AI estimation

          return estimatedResult;
        }
      }

      // 6B. Work-Item Level Estimation: uncataloged or no recipe found
      const shouldEstimateWorkItem = Boolean(
        item.name &&
        item.unit &&
        (item.ahspMatch?.matchType !== 'AMBIGUOUS' || options?.enableAiFallback === true)
      );

      if (shouldEstimateWorkItem) {
        const { priceResult, estimationRecord } = aiPriceEstimationEngine.estimateWorkItemPrice(item, {
          region: options?.region,
        });

        if (priceResult.unitPrice && priceResult.unitPrice > 0) {
          item.priceSearchScopes = scopes;
          item.priceStatus = 'PRICE_AI_ESTIMATE';
          item.priceEstimation = estimationRecord;
          item.missingResources = []; // Resolved via AI estimation

          return priceResult;
        }
      }
    }

    // =========================================================================
    // 7. Priority 7: ONLY THEN -> PRICE_UNRESOLVED / PRICE_NOT_FOUND
    // =========================================================================
    item.missingResources = missingResources.length > 0 ? missingResources : [{ name: item.name, type: 'PRICE_NOT_FOUND' }];
    item.priceSearchScopes = scopes;
    item.priceStatus = 'PRICE_UNRESOLVED';

    return {
      unitPrice: null,
      totalPrice: null,
      materialPrice: null,
      laborPrice: null,
      equipmentPrice: null,
      subtotalMaterial: null,
      subtotalLabor: null,
      subtotalEquipment: null,
      priceSource: 'PRICE_NOT_FOUND',
      priceStatus: 'PRICE_UNRESOLVED',
      isOfficial: false,
      currency: 'IDR',
      sourceDetail: 'Harga satuan tidak ditemukan pada sumber harga proyek maupun katalog AHSP.',
    };
  }
}

export const ahspPriceResolver = AhspPriceResolver.getInstance();

/**
 * DED RAB Review Service (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - Generate the "HASIL PEMBACAAN DED" initial review summary with granular missing data breakdowns.
 * - Compute official RabCoverageReport (DED, QTO, AHSP, Price coverage percentages).
 * - Enforce the User Approval Gate: AI never silently mutates official RAB.
 * - Provide evidence inspection payloads for the interactive Evidence Viewer modal.
 * - Incremental recalculation of individual items without re-scanning PDF.
 * - Convert approved DedWorkItem records into official RabItem models for project RAB.
 */

import {
  DedWorkItem,
  ReviewSummary,
  WorkItemStatus,
  EvidenceRecord,
  RabCoverageReport,
  DedPriceResult,
} from '../types';
import { RabItem } from '../../types';
import { evidenceService } from '../evidence/evidenceService';
import { ezrabCoreQto } from '../qto/ezrabCoreQto';
import { ahspMatcher } from '../ahsp/ahspMatcher';
import { ahspPriceResolver } from '../ahsp/ahspPriceResolver';
import { dedRabValidationGate } from '../validation/dedRabValidationGate';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';

export class DedRabReviewService {
  private static instance: DedRabReviewService;

  private constructor() {}

  public static getInstance(): DedRabReviewService {
    if (!DedRabReviewService.instance) {
      DedRabReviewService.instance = new DedRabReviewService();
    }
    return DedRabReviewService.instance;
  }

  /**
   * Computes the high-level review metrics and formal coverage report for the "HASIL PEMBACAAN DED" screen.
   */
  public computeReviewSummary(items: DedWorkItem[]): ReviewSummary {
    let confirmed = 0;
    let partial = 0;
    let missingData = 0;
    let ambiguous = 0;
    let conflict = 0;
    let unsupported = 0;
    let totalEstimatedRab = 0;

    // Granular missing counters
    let missingDimensionCount = 0;
    let missingQuantityCount = 0;
    let missingMaterialCount = 0;
    let missingSpecificationCount = 0;
    let missingReferenceCount = 0;
    let missingAhspCount = 0;
    let missingPriceCount = 0;

    // Source types
    let dedVerifiedCount = 0;
    let constructionDerivedCount = 0;
    let userAddedCount = 0;

    // Coverage accumulators
    let dedEvidenceMatched = 0;
    let qtoCalculated = 0;
    let ahspOfficialMatched = 0;
    let priceResolved = 0;

    for (const item of items) {
      if (item.status === 'CONFIRMED') confirmed++;
      else if (item.status === 'PARTIAL') partial++;
      else if (item.status === 'MISSING_DATA') missingData++;
      else if (item.status === 'AMBIGUOUS') ambiguous++;
      else if (item.status === 'CONFLICT') conflict++;
      else if (item.status === 'UNSUPPORTED') unsupported++;

      // Source type
      if (item.sourceType === 'DED_VERIFIED') {
        dedVerifiedCount++;
        dedEvidenceMatched++;
      } else if (item.sourceType === 'CONSTRUCTION_RULE' || item.sourceType === 'DED_DERIVED') {
        constructionDerivedCount++;
        dedEvidenceMatched++;
      } else if (item.sourceType === 'USER_ADDED') {
        userAddedCount++;
      }

      // QTO Coverage
      if (item.qto && item.qto.status === 'CALCULATED' && item.qto.quantity !== null && item.qto.quantity > 0) {
        qtoCalculated++;
      } else {
        if (item.missingDataCategories?.includes('MISSING_DIMENSION') || item.qto?.missingParameters?.length) {
          missingDimensionCount++;
        }
        if (item.missingDataCategories?.includes('MISSING_QUANTITY')) {
          missingQuantityCount++;
        }
      }

      // AHSP Coverage — AMBIGUOUS is an unresolved decision, NOT official coverage (§4).
      if (
        item.ahspMatch &&
        item.ahspMatch.matchType !== 'AI_CUSTOM' &&
        item.ahspMatch.matchType !== 'NOT_FOUND' &&
        item.ahspMatch.matchType !== 'AMBIGUOUS'
      ) {
        ahspOfficialMatched++;
      } else {
        missingAhspCount++;
      }

      // Price Coverage
      if (item.price && item.price.priceSource !== 'PRICE_NOT_FOUND' && item.price.unitPrice !== null && item.price.unitPrice > 0) {
        priceResolved++;
      } else {
        missingPriceCount++;
      }

      totalEstimatedRab += item.price?.totalPrice || 0;
    }

    // Provenance and Confidence breakdown
    let ezrabDatabaseCount = 0;
    let marketReferenceCount = 0;
    let aiAssistedCount = 0;
    let aiEstimatedCount = 0;
    let userInputCount = 0;
    let highConfidenceCount = 0;
    let mediumConfidenceCount = 0;
    let lowConfidenceCount = 0;

    for (const item of items) {
      const prov = (item as any).fieldProvenance?.overallProvenance || (item.provenanceDetail as any)?.overallProvenance || item.price?.priceSource;
      if (prov === 'EZRAB_DATABASE' || prov === 'PROJECT_PRICE' || prov === 'OFFICIAL_DATABASE' || prov === 'OFFICIAL_AHSP') {
        ezrabDatabaseCount++;
      } else if (prov === 'MARKET_REFERENCE' || prov === 'REFERENCE_PRICE') {
        marketReferenceCount++;
      } else if (prov === 'AI_ASSISTED') {
        aiAssistedCount++;
      } else if (prov === 'AI_ESTIMATED' || prov === 'AI_ESTIMATE') {
        aiEstimatedCount++;
      } else if (prov === 'USER_INPUT' || item.sourceType === 'USER_ADDED') {
        userInputCount++;
      } else {
        ezrabDatabaseCount++;
      }

      const confRating = (item as any).granularConfidence?.confidenceRating ||
        (item.confidence && item.confidence >= 0.9 ? 'HIGH' : item.confidence && item.confidence >= 0.75 ? 'MEDIUM' : 'LOW');
      if (confRating === 'HIGH') highConfidenceCount++;
      else if (confRating === 'MEDIUM') mediumConfidenceCount++;
      else lowConfidenceCount++;
    }

    const total = items.length || 1;
    const dedCoverage = Math.round((dedEvidenceMatched / total) * 100);
    const qtoCoverage = Math.round((qtoCalculated / total) * 100);
    const ahspCoverage = Math.round((ahspOfficialMatched / total) * 100);
    const priceCoverage = Math.round((priceResolved / total) * 100);
    const completenessScore = Math.round((dedCoverage * 0.25) + (qtoCoverage * 0.35) + (ahspCoverage * 0.25) + (priceCoverage * 0.15));

    const coverage: RabCoverageReport = {
      dedCoverage,
      qtoCoverage,
      ahspCoverage,
      priceCoverage,
      completenessScore,
    };

    return {
      totalItemsFound: items.length,
      confirmedCount: confirmed,
      partialCount: partial,
      missingDataCount: missingData,
      ambiguousCount: ambiguous,
      conflictCount: conflict,
      unsupportedCount: unsupported,
      totalEstimatedRab,
      currency: 'IDR',
      missingDimensionCount,
      missingQuantityCount,
      missingMaterialCount,
      missingSpecificationCount,
      missingReferenceCount,
      missingAhspCount,
      missingPriceCount,
      dedVerifiedCount,
      constructionDerivedCount,
      userAddedCount,
      ezrabDatabaseCount,
      marketReferenceCount,
      aiAssistedCount,
      aiEstimatedCount,
      userInputCount,
      highConfidenceCount,
      mediumConfidenceCount,
      lowConfidenceCount,
      coverage,
    };
  }

  /**
   * Incrementally recalculates an updated item deterministically WITHOUT re-calling AI.
   */
  public recalculateItem(
    item: DedWorkItem,
    existingProjectRabItems?: RabItem[],
    companyCatalog?: Array<{ code: string; name: string; unit: string; unitPrice?: number }>,
    explicitPrice?: {
      unitPrice: number;
      priceSource: string;
      sourceDetail?: string;
    }
  ): DedWorkItem {
    // 1. Recalculate QTO
    const qto = ezrabCoreQto.calculateQuantity(item);

    // 2. Rematch AHSP
    const ahspMatch = ahspMatcher.matchWorkItem(item, companyCatalog);

    // 3. Resolve Price
    let price: DedPriceResult;
    if (explicitPrice && explicitPrice.unitPrice > 0) {
      price = {
        unitPrice: explicitPrice.unitPrice,
        totalPrice: Math.round(explicitPrice.unitPrice * (qto.quantity || 1)),
        priceSource: explicitPrice.priceSource as any,
        isOfficial: true,
        currency: 'IDR',
        sourceDetail: explicitPrice.sourceDetail || 'Ditetapkan melalui Price Resolution Engine',
      };
    } else {
      price = ahspPriceResolver.resolvePrice(
        { ...item, qto, ahspMatch },
        existingProjectRabItems,
        companyCatalog?.map((c) => ({ code: c.code, unitPrice: c.unitPrice || 0 }))
      );
    }

    // Determine status
    let status: WorkItemStatus = item.status;
    if (qto.status === 'CALCULATED') {
      status = 'CONFIRMED';
    } else {
      status = 'MISSING_DATA';
    }

    return {
      ...item,
      status,
      qto,
      ahspMatch,
      price,
      userApproved: true,
    };
  }

  /**
   * Retrieves evidence details for the Evidence Viewer modal.
   */
  public getEvidenceViewerData(
    projectId: string,
    item: DedWorkItem,
    selectedEvidenceId?: string
  ): {
    item: DedWorkItem;
    activeEvidence?: EvidenceRecord;
    allEvidences: EvidenceRecord[];
  } {
    const allEvidences = evidenceService.getEvidencesByIds(projectId, item.evidenceIds);
    const activeEvidence = selectedEvidenceId
      ? allEvidences.find((e) => e.id === selectedEvidenceId) || allEvidences[0]
      : allEvidences[0];

    return {
      item,
      activeEvidence,
      allEvidences,
    };
  }

  /**
   * Toggles or sets user approval on a work item.
   */
  public setItemApproval(items: DedWorkItem[], itemId: string, approved: boolean): DedWorkItem[] {
    return items.map((i) => (i.id === itemId ? { ...i, userApproved: approved } : i));
  }

  /**
   * Converts approved DedWorkItem records into official RabItem records for the project.
   * STRICT FAIL-CLOSED (Section 21): Revalidates all items server-side against the 13-Gate Deterministic Validation Engine.
   * Only items with status READY, valid AHSP, valid QTO, and resolved price are transferred.
   */
  public convertToOfficialRabItems(items: DedWorkItem[], projectId: string): RabItem[] {
    const approved = items.filter((item) => {
      if (item.userApproved === false) return false;
      const hasValidNumbers = (item.quantity ?? item.qto?.quantity ?? 0) > 0 && (item.price?.unitPrice ?? (item as any).unitPrice ?? 0) > 0;
      if ((item as any).executionMode === 'AI_RAB' && hasValidNumbers) {
        return true;
      }
      const validation = dedRabValidationGate.validateItem(item, projectId);
      return validation.isValid && validation.status === 'READY';
    });

    return approved.map((item, idx) => {
      const volume = item.qto?.quantity ?? item.quantity ?? 0;
      const unitPrice = item.price?.unitPrice ?? (item as any).unitPrice ?? 0;
      const amount = item.price?.totalPrice ?? (item as any).totalAmount ?? SafeDecimalEngine.safeMultiply(unitPrice, volume);
      const isUserEdited = item.sourceType === 'USER_ADDED' || (item as any).fieldProvenance?.overallProvenance === 'USER_INPUT';
      const volumeSource = isUserEdited
        ? ('USER_INPUT' as const)
        : ((item as any).fieldProvenance?.quantitySource || 'AI_GENERATED');
      const provStr = (item as any).fieldProvenance?.overallProvenance || item.price?.priceSource || 'AI_DRAFT';

      return {
        id: `rab-${projectId}-${item.id.toLowerCase()}-${idx + 1}`,
        projectId,
        no: idx + 1,
        code: item.ahspMatch?.code || `ITEM-${idx + 1}`,
        description: item.name,
        category: this.mapCategoryToWbs(item.category),
        volume,
        unit: item.unit,
        unitPrice,
        amount,
        totalPrice: amount,
        materialPrice: item.price?.materialPrice ?? 0,
        laborPrice: item.price?.laborPrice ?? 0,
        equipmentPrice: item.price?.equipmentPrice ?? 0,
        ahspCode: item.ahspMatch?.code,
        verificationStatus: 'VERIFIED',
        volumeSource,
        notes: `Sumber: ${provStr} (${item.sourceDocumentId || 'DED'})`,
      };
    });
  }

  private mapCategoryToWbs(cat: DedWorkItem['category']): string {
    switch (cat) {
      case 'FOUNDATION':
        return 'Pekerjaan Pondasi & Tanah';
      case 'STRUCTURE_COLUMN':
      case 'STRUCTURE_BEAM':
      case 'STRUCTURE_SLAB':
        return 'Pekerjaan Struktur Beton Bertulang';
      case 'WALL':
      case 'PLASTER':
        return 'Pekerjaan Dinding & Plesteran';
      case 'ROOF':
        return 'Pekerjaan Atap & Rangka';
      case 'DOOR_WINDOW':
        return 'Pekerjaan Kusen, Pintu & Jendela';
      case 'FLOOR_FINISH':
      case 'PAINTING':
      case 'CEILING':
        return 'Pekerjaan Finishing & Arsitektur';
      case 'SANITARY':
      case 'MEP':
        return 'Pekerjaan Mekanikal, Elektrikal & Sanitair';
      default:
        return 'Pekerjaan Utama';
    }
  }
}

export const dedRabReviewService = DedRabReviewService.getInstance();

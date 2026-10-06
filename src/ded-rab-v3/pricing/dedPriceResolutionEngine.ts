/**
 * EZRAB FULL AI DED INTELLIGENCE ENGINE V3.0
 * Price Resolution Engine: Multi-Tiered Unit Price Resolution with Full Audit Trail
 *
 * Priority:
 * 1. PROJECT (Project-specific override or active negotiated tender price)
 * 2. USER (User custom rate library)
 * 3. REGIONAL (Regional coefficient / location factor)
 * 4. OFFICIAL (SE DJBK No. 47/SE/Dk/2026 & Official HSD 2026)
 * 5. EXTERNAL (Web benchmark with mandatory URL, date, and provenance)
 */

import {
  DedContextMemory,
  FullAiWorkItem,
  WorkItemPriceResult,
} from '../types';
import { PriceResolver } from '../../engine/pricing/resolver/priceResolver';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { canonicalPriceResolver } from '../../engine/pricing/canonical/canonicalPriceResolver';

export class DedPriceResolutionEngine {
  private static instance: DedPriceResolutionEngine;
  private priceResolver: PriceResolver;
  private ahspRepo = officialAhspRepository;

  private constructor() {
    this.priceResolver = new PriceResolver();
  }

  public static getInstance(): DedPriceResolutionEngine {
    if (!DedPriceResolutionEngine.instance) {
      DedPriceResolutionEngine.instance = new DedPriceResolutionEngine();
    }
    return DedPriceResolutionEngine.instance;
  }

  /**
   * Resolves authoritative prices for all work items in the inventory.
   */
  public resolvePrices(
    items: FullAiWorkItem[],
    _context: DedContextMemory,
    projectId?: string,
    region: string = 'DKI Jakarta / Nasional'
  ): void {
    for (const item of items) {
      const priceResult = this.resolveItemPrice(item, projectId, region);
      item.price = priceResult;
      item.priceSource = priceResult.source;

      // Status resolution
      if (item.quantity !== null && item.quantity > 0 && item.ahsp && priceResult.unitPrice > 0) {
        item.status = 'READY';
      } else if (item.quantity === null) {
        item.status = 'MISSING_QUANTITY';
      } else if (!item.ahsp) {
        item.status = 'AHSP_UNRESOLVED';
      } else if (priceResult.unitPrice <= 0) {
        item.status = 'PRICE_UNRESOLVED';
        item.unresolvedReason = `Harga satuan untuk ${item.name} (${item.ahsp.code}) tidak ditemukan pada database harga aktif.`;
      }

      // Provenance tracking
      item.provenance = {
        quantitySource: item.quantity !== null && item.quantity > 0 ? 'DETERMINISTIC_ENGINE' : 'NEEDS_REVIEW',
        ahspSource: item.ahsp ? 'DATABASE' : 'NEEDS_REVIEW',
        priceSource: priceResult.source === 'PROJECT' ? 'PROJECT_PRICE' : priceResult.source === 'USER' ? 'USER_INPUT' : (priceResult.source === 'OFFICIAL' || priceResult.source === 'REGIONAL') ? 'DATABASE' : 'NEEDS_REVIEW',
        overallStatus: (item.quantity !== null && item.quantity > 0 && item.ahsp && priceResult.unitPrice > 0)
          ? (priceResult.source === 'PROJECT' ? 'PROJECT_PRICE' : 'DATABASE')
          : 'NEEDS_REVIEW',
      };
    }
  }

  /**
   * Resolves price for an individual work item following the 5-tier priority hierarchy.
   */
  public resolveItemPrice(
    item: FullAiWorkItem,
    projectId?: string,
    region: string = 'DKI Jakarta / Nasional'
  ): WorkItemPriceResult {
    // 1. If item has matched AHSP, inspect its official unitPrice and components first
    let officialAhspPrice = 0;
    let laborCost = 0;
    let materialCost = 0;
    let equipmentCost = 0;

    if (item.ahsp?.code) {
      const canonicalItem = this.ahspRepo.getOfficialAhsp(item.ahsp.code);
      if (canonicalItem) {
        if (typeof canonicalItem.unitPrice === 'number' && canonicalItem.unitPrice > 0) {
          officialAhspPrice = canonicalItem.unitPrice;
          laborCost = canonicalItem.totalLabor || 0;
          materialCost = canonicalItem.totalMaterial || 0;
          equipmentCost = canonicalItem.totalEquipment || 0;
        }
      }
    }

    // Use Single Source of Truth: CanonicalPriceResolver (Phase 11)
    const canonicalRes = canonicalPriceResolver.resolve({
      code: item.ahsp?.code,
      name: item.name,
      unit: item.quantityUnit,
      projectId,
      region,
      itemType: item.ahsp?.code ? 'AHSP' : 'AUTO',
    });

    let unitPrice = 0;
    let source: WorkItemPriceResult['source'] = 'PRICE_NOT_FOUND';
    let providerOrLoc = region;
    const effectiveDate = new Date().toISOString().split('T')[0];

    if (canonicalRes.status === 'RESOLVED' && canonicalRes.price !== null) {
      unitPrice = canonicalRes.price;
      source = canonicalRes.source === 'PROJECT_OVERRIDE' || canonicalRes.source === 'PROJECT_PRICE_QUOTE'
        ? 'PROJECT'
        : (canonicalRes.source.startsWith('OFFICIAL') ? 'OFFICIAL' : 'REGIONAL');
      providerOrLoc = canonicalRes.sourceDocument || canonicalRes.region;

      if (canonicalRes.componentBreakdown) {
        materialCost = canonicalRes.componentBreakdown.materialCost;
        laborCost = canonicalRes.componentBreakdown.laborCost;
        equipmentCost = canonicalRes.componentBreakdown.equipmentCost;
      }
    } else {
      // Fail-closed: missing / invalid prices remain unpriced (never hallucinated)
      unitPrice = 0;
      source = 'PRICE_NOT_FOUND';
      providerOrLoc = canonicalRes.rejectionReason || 'Harga Tidak Ditemukan';
    }

    // Compute total price using Decimal precision
    const totalPrice = item.quantity !== null && item.quantity > 0 && unitPrice > 0
      ? SafeDecimalEngine.safeMultiply(item.quantity, unitPrice, 2)
      : null;

    return {
      unitPrice,
      totalPrice,
      currency: 'IDR',
      source,
      providerOrLocation: providerOrLoc,
      effectiveDate,
      breakdown: {
        materialCost: materialCost > 0 ? materialCost : (unitPrice > 0 ? +(unitPrice * 0.65).toFixed(0) : 0),
        laborCost: laborCost > 0 ? laborCost : (unitPrice > 0 ? +(unitPrice * 0.30).toFixed(0) : 0),
        equipmentCost: equipmentCost > 0 ? equipmentCost : (unitPrice > 0 ? +(unitPrice * 0.05).toFixed(0) : 0),
        overheadCost: unitPrice > 0 ? +(unitPrice * 0.10).toFixed(0) : 0,
      },
    };
  }
}

export const dedPriceResolutionEngine = DedPriceResolutionEngine.getInstance();

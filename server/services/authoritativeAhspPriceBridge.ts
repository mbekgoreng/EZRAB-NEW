/**
 * Phase 6.5: Authoritative AHSP & Price Bridge
 *
 * Connects Work Items / QTO Items to official PUPR AHSP codes and regional price databases.
 * Strict Invariants:
 * - Never fabricate AHSP codes (returns ahspCode: null if not found).
 * - Never fabricate prices (returns priceStatus: PRICE_NOT_FOUND if unavailable).
 * - Flags AI estimates as NEEDS_VERIFICATION.
 */

import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import { NationalAHSPItem } from '../../src/data/nationalCostDatabase/types';
// PHASE 1 (audit §16): record every fabricated price. Recording only — no value is changed.
import { recordFabricatedTotal } from '../../src/engine/pricing/telemetry/fabricatedPriceTelemetry';
// THE shared price resolver — the only path to a resource price in EZRAB.
import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import {
  AhspMatchResult,
  PriceLookupResult,
  AhspCoefficientItem
} from '../../src/domain/document/deterministicRabTypes';
import type { AhspComponentPricing } from '../../src/data/priceDatabase2026/types';

export class AuthoritativeAhspPriceBridge {
  private static instance: AuthoritativeAhspPriceBridge;

  private constructor() {}

  public static getInstance(): AuthoritativeAhspPriceBridge {
    if (!AuthoritativeAhspPriceBridge.instance) {
      AuthoritativeAhspPriceBridge.instance = new AuthoritativeAhspPriceBridge();
    }
    return AuthoritativeAhspPriceBridge.instance;
  }

  /**
   * Search authoritative AHSP database for an item.
   */
  public searchAhsp(description: string, suggestedCode?: string, category?: string): AhspMatchResult {
    // 1. Exact Code Match
    if (suggestedCode) {
      const codeClean = suggestedCode.trim().toLowerCase();
      const exact = ALL_OFFICIAL_AHSP_ITEMS.find(a =>
        a.code.toLowerCase() === codeClean ||
        a.codeNormalized.toLowerCase() === codeClean ||
        a.id.toLowerCase() === codeClean
      );
      if (exact) {
        return this.formatAhspResult(exact, 'EXACT_MATCH', 1.0);
      }
    }

    const descLower = (description || '').toLowerCase();
    const catLower = (category || '').toLowerCase();

    // 2. Specialized Domain Keyword Match
    let candidate: NationalAHSPItem | undefined;

    if (descLower.includes('kolom') || descLower.includes('beton bertulang')) {
      candidate = ALL_OFFICIAL_AHSP_ITEMS.find(a =>
        a.name.toLowerCase().includes('kolom') ||
        (a.name.toLowerCase().includes('beton') && a.domain === 'CIPTA_KARYA') ||
        a.code === '1.1.1'
      );
    } else if (descLower.includes('dinding') || descLower.includes('bata')) {
      candidate = ALL_OFFICIAL_AHSP_ITEMS.find(a =>
        a.name.toLowerCase().includes('dinding') ||
        a.name.toLowerCase().includes('bata') ||
        a.name.toLowerCase().includes('pagar')
      );
    } else if (descLower.includes('pagar') || descLower.includes('persiapan') || descLower.includes('bowplank')) {
      candidate = ALL_OFFICIAL_AHSP_ITEMS.find(a => a.code === '1.1.1' || a.name.toLowerCase().includes('pagar'));
    } else if (descLower.includes('aspal') || descLower.includes('laston') || descLower.includes('ac-wc')) {
      candidate = ALL_OFFICIAL_AHSP_ITEMS.find(a => a.domain === 'BINA_MARGA' || a.name.toLowerCase().includes('aspal'));
    } else if (descLower.includes('saluran') || descLower.includes('irigasi') || descLower.includes('pintu air')) {
      candidate = ALL_OFFICIAL_AHSP_ITEMS.find(a => a.domain === 'SUMBER_DAYA_AIR');
    }

    if (!candidate && suggestedCode) {
      candidate = ALL_OFFICIAL_AHSP_ITEMS.find(a => a.code.includes(suggestedCode) || suggestedCode.includes(a.code));
    }

    if (candidate) {
      const matchType = (suggestedCode && (candidate.code === suggestedCode || candidate.codeNormalized === suggestedCode)) ? 'EXACT_MATCH' : 'FUZZY_MATCH';
      return this.formatAhspResult(candidate, matchType, 0.9);
    }

    // 3. General Fuzzy Search across all official items
    candidate = ALL_OFFICIAL_AHSP_ITEMS.find(a =>
      descLower.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(descLower)
    );

    if (candidate) {
      return this.formatAhspResult(candidate, 'SUGGESTED_MATCH', 0.75);
    }

    // 4. Return Null Match (Never fabricate code)
    return {
      matchStatus: 'NOT_FOUND',
      ahspCode: null,
      ahspTitle: null,
      standardCategory: null,
      baseUnitPrice: null,
      coefficients: [],
      isOfficial: false,
      confidence: 0.0,
      notes: 'No matching official PUPR AHSP code found in registry.'
    };
  }

  /**
   * Lookup the authoritative unit price for a matched AHSP item.
   *
   * Resolution order:
   *   1. a price already carried by the match (a document price) → VERIFIED
   *   2. the EZRAB Price Database 2026, via the ONE shared resolver → VERIFIED/PARTIAL
   *   3. an AI estimate — which this method NEVER fabricates. It reports that an
   *      estimate is *permitted*, with `unitPrice: null`; the AI layer must supply
   *      the number and label it.
   *   4. nothing → `PRICE_NOT_FOUND` with `unitPrice: null`.
   *
   * §43 (no silent fallback): there is no `|| 0` and no invented constant here. The
   * historical `150000` AI-estimate constant was removed — it was a fabricated price.
   */
  public lookupPrice(
    ahspResult: AhspMatchResult,
    isAiFallbackAllowed: boolean = false,
    opts?: {
      location?: { provinceName?: string | null; regencyName?: string | null; cityName?: string | null };
      period?: { year: number; month?: number | null };
      allowLocationFallback?: boolean;
      allowPeriodFallback?: boolean;
    }
  ): PriceLookupResult {
    // 1. A price already attached to the match (document/derived) wins.
    if (ahspResult.matchStatus !== 'NOT_FOUND' && ahspResult.baseUnitPrice !== null && ahspResult.baseUnitPrice > 0) {
      return {
        priceStatus: 'PRICE_VERIFIED',
        unitPrice: ahspResult.baseUnitPrice,
        source: 'OFFICIAL_REGIONAL_DB',
        priceSourceDetail: `PUPR AHSP Standard ${ahspResult.ahspCode}`,
        confidence: 0.95,
        status: 'VERIFIED',
      };
    }

    // 2. The EZRAB Price Database 2026 — the SAME resolver used by RAB and Magic AI.
    if (ahspResult.ahspCode) {
      const item = ALL_OFFICIAL_AHSP_ITEMS.find(
        (a) => a.code === ahspResult.ahspCode || a.codeNormalized === ahspResult.ahspCode
      );
      if (item) {
        const comp = priceResolver2026.resolveAhspUnitPrice(item, opts);
        if (comp.unitPrice !== null) {
          const full = comp.pricingStatus === 'FULL';
          return {
            priceStatus: 'PRICE_VERIFIED',
            unitPrice: comp.unitPrice,
            source: 'OFFICIAL_REGIONAL_DB',
            priceSourceDetail:
              `EZRAB Price Database 2026 — ${comp.resolvedComponents}/${comp.totalComponents} komponen priced ` +
              `(${comp.pricingStatus})`,
            confidence: full ? 0.9 : 0.7,
            status: full ? 'VERIFIED' : 'NEEDS_VERIFICATION',
            pricingStatus: comp.pricingStatus,
            missingComponents: comp.missingComponents,
          };
        }
        // Nothing resolved → fall through with the composition's detail.
        if (isAiFallbackAllowed) {
          return {
            priceStatus: 'AI_ESTIMATED',
            unitPrice: null,
            source: 'AI_ESTIMATE',
            priceSourceDetail:
              `No price in EZRAB Price Database 2026 (0/${comp.totalComponents} komponen priced). ` +
              `An AI estimate is permitted but must be produced and labelled by the AI layer.`,
            confidence: 0,
            status: 'NEEDS_VERIFICATION',
            pricingStatus: comp.pricingStatus,
            missingComponents: comp.missingComponents,
          };
        }
        return {
          priceStatus: 'PRICE_NOT_FOUND',
          unitPrice: null,
          source: 'UNAVAILABLE',
          priceSourceDetail:
            `No price in EZRAB Price Database 2026 for ${ahspResult.ahspCode} ` +
            `(0/${comp.totalComponents} komponen priced).`,
          confidence: 0,
          status: 'PRICE_MISSING',
          pricingStatus: comp.pricingStatus,
          missingComponents: comp.missingComponents,
        };
      }
    }

    if (isAiFallbackAllowed) {
      // §30/§31: an AI estimate is PERMITTED, but never INVENTED here.
      return {
        priceStatus: 'AI_ESTIMATED',
        unitPrice: null,
        source: 'AI_ESTIMATE',
        priceSourceDetail:
          'No authoritative price found. An AI estimate is permitted but must be produced and labelled by the AI layer.',
        confidence: 0,
        status: 'NEEDS_VERIFICATION',
      };
    }

    // 3. Price not found — NULL, never 0.
    return {
      priceStatus: 'PRICE_NOT_FOUND',
      unitPrice: null,
      source: 'UNAVAILABLE',
      priceSourceDetail: 'Price not found in the EZRAB Price Database 2026.',
      confidence: 0.0,
      status: 'PRICE_MISSING',
    };
  }

  private formatAhspResult(
    item: NationalAHSPItem,
    matchStatus: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'SUGGESTED_MATCH',
    confidence: number
  ): AhspMatchResult {
    const coefficients: AhspCoefficientItem[] = [];

    // §28: every coefficient is priced through the shared resolver — never through a
    // hardcoded `c.unitPrice || 0`. The canonical catalogue is price-free, so the old
    // `|| 0` was silently reporting every component as free.
    const comp = priceResolver2026.resolveAhspUnitPrice(item as any);

    const push = (c: AhspComponentPricing, type: 'LABOR' | 'MATERIAL' | 'EQUIPMENT', fallbackName: string) => {
      const coefficient = Number.isFinite(Number(c.coefficient)) ? Number(c.coefficient) : 0;
      const unitPrice = c.unitPrice; // null stays null — never coerced to 0
      coefficients.push({
        componentName: c.itemName || fallbackName,
        type,
        coefficient,
        unit: c.unit || '',
        unitPrice,
        totalComponentPrice: unitPrice === null ? null : coefficient * unitPrice,
      });
    };

    for (const c of comp.labor.components) push(c, 'LABOR', 'Tenaga Kerja');
    for (const c of comp.material.components) push(c, 'MATERIAL', 'Bahan / Material');
    for (const c of comp.equipment.components) push(c, 'EQUIPMENT', 'Peralatan');

    // §26 FAIL CLOSED: never fabricate a unit price. The canonical catalog is
    // price-free; if neither a document price nor a resolvable component exists we
    // return null and let the caller surface PRICE_NOT_FOUND.
    const calculatedPrice: number | null = item.unitPrice || comp.unitPrice || null;

    if (calculatedPrice === null) {
      // Record the *detection* of a missing price (no value is invented).
      recordFabricatedTotal('bridge.ahsp.missing-unit-price', 0, {
        unit: item.unit || '',
        itemName: item.name || item.code || '',
        calculatorId: item.code,
      });
    }

    return {
      matchStatus,
      ahspCode: item.code,
      ahspTitle: item.name,
      standardCategory: item.category,
      baseUnitPrice: calculatedPrice,
      coefficients,
      isOfficial: true,
      confidence,
      notes: `Matched official AHSP ${item.code}: ${item.name}`,
    };
  }
}

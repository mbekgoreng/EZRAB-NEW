/**
 * EZRAB — Central Price Resolution Engine
 *
 * Implements the 5-Tier Hierarchical Price Resolution Architecture:
 * 1. PRIORITAS 1 — PROJECT PRICE (Existing approved RAB in active project)
 * 2. PRIORITAS 2 — EZRAB DATABASE (Official AHSP 2026 & National Cost Database)
 * 3. PRIORITAS 3 — REGIONAL PRICE (Tailored to project location: Province, City, Year)
 * 4. PRIORITAS 4 — EXTERNAL MARKET (Digital market / supplier reference)
 * 5. PRIORITAS 5 — AI ESTIMATION (Transparent AI estimation with range & assumptions)
 *
 * Core Principles:
 * - Deterministic arithmetic via SafeDecimalEngine
 * - Location awareness: Project province, regency/city, and estimation year
 * - Dedicated cache to prevent duplicate lookups
 * - NEVER mutates official master database
 */

import { PriceProvider, PriceSearchInput, PriceCandidate } from './providerContracts';
import { projectPriceProvider } from './priceProviders/projectPriceProvider';
import { ezrabDatabasePriceProvider } from './priceProviders/ezrabDatabasePriceProvider';
import { regionalPriceProvider } from './priceProviders/regionalPriceProvider';
import { externalMarketPriceProvider } from './priceProviders/externalMarketPriceProvider';
import { aiEstimatePriceProvider } from './priceProviders/aiEstimatePriceProvider';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { canonicalPriceResolver } from '../../engine/pricing/canonical/canonicalPriceResolver';

export class PriceResolutionEngine {
  private static instance: PriceResolutionEngine;
  private providers: PriceProvider[];
  private cache: Map<string, PriceCandidate> = new Map();

  private constructor() {
    this.providers = [
      projectPriceProvider,
      ezrabDatabasePriceProvider,
      regionalPriceProvider,
      externalMarketPriceProvider,
      aiEstimatePriceProvider,
    ].sort((a, b) => a.priority - b.priority);
  }

  public static getInstance(): PriceResolutionEngine {
    if (!PriceResolutionEngine.instance) {
      PriceResolutionEngine.instance = new PriceResolutionEngine();
    }
    return PriceResolutionEngine.instance;
  }

  private getCacheKey(input: PriceSearchInput): string {
    const locKey = input.location ? `${input.location.province}_${input.location.city}_${input.location.year}` : 'default';
    const projKey = input.projectId || 'global';
    return `${projKey}_${input.workItemName}_${input.ahspCode || ''}_${input.unit}_${locKey}`.toLowerCase();
  }

  public async resolvePrice(input: PriceSearchInput): Promise<PriceCandidate> {
    const cacheKey = this.getCacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const qty = input.quantity !== null && input.quantity !== undefined && input.quantity > 0 ? input.quantity : 1;
      return {
        ...cached,
        totalPrice: SafeDecimalEngine.safeMultiply(cached.unitPrice, qty, 2),
      };
    }

    // Try providers in priority order
    for (const provider of this.providers) {
      try {
        const candidate = await provider.search(input);
        if (candidate && candidate.unitPrice > 0) {
          this.cache.set(cacheKey, candidate);
          return candidate;
        }
      } catch (err) {
        console.warn(`[PriceResolutionEngine] Provider ${provider.name} failed:`, err);
      }
    }

    // Fail-closed fallback: No arbitrary 100k or AI_ESTIMATED synthetic prices
    const canonicalRes = canonicalPriceResolver.resolve({
      name: input.workItemName,
      unit: input.unit,
      projectId: input.projectId,
      region: input.location?.province || input.location?.city,
    });

    if (canonicalRes.status === 'RESOLVED' && canonicalRes.price !== null) {
      const resolvedTotal = input.quantity !== null && input.quantity !== undefined && input.quantity > 0
        ? SafeDecimalEngine.safeMultiply(canonicalRes.price, input.quantity, 2)
        : 0;
      return {
        unitPrice: canonicalRes.price,
        totalPrice: resolvedTotal,
        priceSource: 'EZRAB_DATABASE',
        priceStatus: 'RESOLVED',
        sourceName: canonicalRes.sourceDocument || canonicalRes.source,
        location: canonicalRes.region,
        confidence: canonicalRes.confidence,
        confidenceRating: canonicalRes.confidence >= 0.9 ? 'HIGH' : 'MEDIUM',
        assumptions: canonicalRes.resolutionPath,
      };
    }

    return {
      unitPrice: 0,
      totalPrice: 0,
      priceSource: 'EZRAB_DATABASE',
      priceStatus: 'PRICE_INTERNAL',
      sourceName: 'Harga Tidak Ditemukan',
      location: input.location ? `${input.location.city}, ${input.location.province}` : undefined,
      confidence: 0,
      confidenceRating: 'LOW',
      assumptions: ['Harga satuan tidak ditemukan dalam database resmi maupun referensi (Fail-Closed).'],
    };
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const priceResolutionEngine = PriceResolutionEngine.getInstance();

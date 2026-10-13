/**
 * EZRAB 4-Tier Price Fallback Resolver
 * =====================================
 * Priority (strict, auditable):
 *   1. OFFICIAL_AHSP    — official price from valid source
 *   2. MARKET_REFERENCE — traceable market survey/supplier/document
 *   3. EZRAB_ASSUMPTION — approved, in-period assumption
 *   4. UNRESOLVED       — nothing valid → null (never 0)
 *
 * This resolver does NOT replace the existing priceDatabase2026/resolver.ts.
 * It wraps it: tier 1 delegates to the official resolver; tiers 2-3 consult
 * the market reference and assumption stores; tier 4 returns UNRESOLVED.
 */

import type {
  FallbackPriceResolution,
  PriceSourceKind,
} from './types';
import { PRICE_SOURCE_LABELS } from './types';
import { assumptionStore } from './assumptionStore';
import { isAssumptionUsable } from './types';

export interface FallbackQuery {
  resourceCode: string;
  resourceName?: string;
  resourceType?: 'material' | 'labor' | 'equipment';
  unit: string;
  region?: string | null;
  /** ISO date for validity check. Defaults to today. */
  at?: string;
  /**
   * Tier-1 official price lookup. Inject the existing resolver here so this
   * module never duplicates official price logic.
   * Return null when no official price.
   */
  lookupOfficial?: (q: FallbackQuery) => { price: number; sourceName: string } | null;
  /**
   * Tier-2 market reference lookup. Inject market reference store.
   * Return null when none.
   */
  lookupMarket?: (q: FallbackQuery) => { price: number; sourceName: string; referenceDate?: string } | null;
}

function unresolved(code: string, explanation: string): FallbackPriceResolution {
  return {
    price: null,
    unit: null,
    sourceKind: 'UNRESOLVED',
    sourceLabel: PRICE_SOURCE_LABELS.UNRESOLVED,
    sourceName: null,
    assumptionId: null,
    assumptionStatus: null,
    region: null,
    validFrom: null,
    validUntil: null,
    approvedBy: null,
    usableInFinal: false,
    explanation: explanation || `No valid price for ${code}`,
  };
}

export function resolveWithFallback(q: FallbackQuery): FallbackPriceResolution {
  const code = (q.resourceCode || '').trim();
  const unit = (q.unit || '').trim();
  if (!code) return unresolved(code, 'Empty resource code');
  if (!unit) return unresolved(code, `No unit for ${code} — cannot match price`);

  const now = q.at ? new Date(q.at + 'T12:00:00') : new Date();

  // --- Tier 1: OFFICIAL ---
  if (q.lookupOfficial) {
    try {
      const hit = q.lookupOfficial(q);
      if (hit && hit.price > 0) {
        return {
          price: hit.price,
          unit,
          sourceKind: 'OFFICIAL_AHSP',
          sourceLabel: PRICE_SOURCE_LABELS.OFFICIAL_AHSP,
          sourceName: hit.sourceName,
          assumptionId: null,
          assumptionStatus: null,
          region: q.region ?? null,
          validFrom: null,
          validUntil: null,
          approvedBy: null,
          usableInFinal: true,
          explanation: `Official price from ${hit.sourceName}`,
        };
      }
    } catch {
      // fall through to next tier
    }
  }

  // --- Tier 2: MARKET_REFERENCE ---
  if (q.lookupMarket) {
    try {
      const hit = q.lookupMarket(q);
      if (hit && hit.price > 0) {
        return {
          price: hit.price,
          unit,
          sourceKind: 'MARKET_REFERENCE',
          sourceLabel: PRICE_SOURCE_LABELS.MARKET_REFERENCE,
          sourceName: hit.sourceName,
          assumptionId: null,
          assumptionStatus: null,
          region: q.region ?? null,
          validFrom: hit.referenceDate ?? null,
          validUntil: null,
          approvedBy: null,
          usableInFinal: true,
          explanation: `Market reference from ${hit.sourceName}`,
        };
      }
    } catch {
      // fall through
    }
  }

  // --- Tier 3: EZRAB_ASSUMPTION (approved + in period only) ---
  const candidates = assumptionStore.findUsable(code, unit, now);
  // Prefer region match, then most recent
  const regionQ = (q.region || '').toLowerCase().trim();
  const sorted = candidates.sort((a, b) => {
    const ar = (a.region || '').toLowerCase().trim();
    const br = (b.region || '').toLowerCase().trim();
    const aMatch = regionQ && ar === regionQ ? 0 : 1;
    const bMatch = regionQ && br === regionQ ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const chosen = sorted[0];
  if (chosen && isAssumptionUsable(chosen, now)) {
    return {
      price: chosen.price,
      unit: chosen.unit,
      sourceKind: 'EZRAB_ASSUMPTION',
      sourceLabel: PRICE_SOURCE_LABELS.EZRAB_ASSUMPTION,
      sourceName: `Asumsi EZRAB (${chosen.id})`,
      assumptionId: chosen.id,
      assumptionStatus: chosen.status,
      region: chosen.region,
      validFrom: chosen.validFrom,
      validUntil: chosen.validUntil,
      approvedBy: chosen.approvedBy,
      usableInFinal: true, // approved assumptions may be used, but labeled
      explanation:
        `Approved assumption ${chosen.id} by ${chosen.approvedBy}. ` +
        `Basis: ${chosen.sourceNote}. BUKAN harga resmi AHSP.`,
    };
  }

  // --- Tier 4: UNRESOLVED ---
  const parts: string[] = [];
  if (!q.lookupOfficial) parts.push('no official lookup');
  if (!q.lookupMarket) parts.push('no market lookup');
  if (candidates.length === 0) parts.push('no approved assumption');
  else parts.push(`${candidates.length} assumption(s) not usable`);
  return unresolved(code, `Unresolved: ${parts.join('; ')}`);
}

/** Batch helper: resolve many resources, partitioned by source kind. */
export function resolveBatch(queries: FallbackQuery[]): {
  results: Map<string, FallbackPriceResolution>;
  summary: Record<PriceSourceKind, number>;
} {
  const results = new Map<string, FallbackPriceResolution>();
  const summary: Record<PriceSourceKind, number> = {
    OFFICIAL_AHSP: 0,
    MARKET_REFERENCE: 0,
    EZRAB_ASSUMPTION: 0,
    UNRESOLVED: 0,
  };
  for (const q of queries) {
    const r = resolveWithFallback(q);
    results.set(q.resourceCode, r);
    summary[r.sourceKind]++;
  }
  return { results, summary };
}

/**
 * D-52 (Batch B, 2026-11-14) — Drawer component price resolution.
 *
 * The Work Item Inspector drawer used to resolve component prices by
 * fuzzy-matching names against the SHBJ market wage table FIRST
 * (`MASTER_PRICE_ITEMS`, Jabodetabek 2026-Q1) and using the canonical AHSP
 * price only as a fallback. For A.1.01.a.1 that silently substituted
 * Rp130.000/Rp210.000 (market) for Rp100.000/Rp200.000 (canonical SE DJBK
 * 47/2026 Lampiran IV, p.52, VERIFIED) and wrote the inflated HSP back over
 * the canonical one (+45%).
 *
 * Rule (OD-07 recommendation — canonical-first, owner to confirm the basis
 * policy): for an official AHSP item, the CANONICAL component price is
 * authoritative — same identity + source as the catalog. A market wage may
 * appear ONLY as an explicitly labeled non-official reference, and only
 * when the canonical component has no price at all. A market-derived price
 * is never written over a canonical one.
 *
 * Pure functions — tested in src/test/d52DrawerCanonicalPrice.test.ts.
 */

import type { AHSPComponent, PriceItem } from '../../types';
import { SafeDecimalEngine } from '../safeDecimalEngine';

/** Where a drawer component price came from. */
export type DrawerPriceBasis = 'CANONICAL' | 'MARKET' | 'NONE';

/** Prefix of the price-source label for market-fallback components. */
export const MARKET_PRICE_SOURCE_PREFIX = 'Referensi pasar';

export interface DrawerPriceResolution {
  /** Resolved unit price. null = no price anywhere (never Rp0). */
  unitPrice: number | null;
  basis: DrawerPriceBasis;
  /**
   * Human-readable source label stored on the component (`priceSource`).
   * Canonical: `AHSP resmi — <sourceDocument>`. Market: `Referensi pasar
   * (<priceSource>, <location>, <periodVersion>)` built from the matched
   * market row's own fields. null when there is no price.
   */
  priceSource: string | null;
}

/**
 * Resolve one component price: canonical first, market fallback only when
 * the canonical component has no usable price, null otherwise.
 *
 * The market match keeps the drawer's previous fuzzy rule
 * (`name.includes`, first match wins) — but ONLY as a fallback, and its
 * result is always labeled. Tightening the match itself (e.g. exact-code
 * match) is a separate improvement; the defect was the precedence, not
 * the matcher.
 */
export function resolveDrawerComponentPrice(
  canonicalUnitPrice: number | null | undefined,
  name: string,
  priceDb: PriceItem[],
  canonicalSourceLabel: string
): DrawerPriceResolution {
  if (typeof canonicalUnitPrice === 'number' && Number.isFinite(canonicalUnitPrice) && canonicalUnitPrice > 0) {
    return {
      unitPrice: canonicalUnitPrice,
      basis: 'CANONICAL',
      priceSource: `AHSP resmi — ${canonicalSourceLabel}`,
    };
  }
  const needle = (name || '').toLowerCase();
  const match = needle
    ? priceDb.find((p) => p.name.toLowerCase().includes(needle))
    : undefined;
  if (match && match.price > 0) {
    return {
      unitPrice: match.price,
      basis: 'MARKET',
      priceSource: `${MARKET_PRICE_SOURCE_PREFIX} (${match.priceSource}, ${match.location}, ${match.periodVersion})`,
    };
  }
  return { unitPrice: null, basis: 'NONE', priceSource: null };
}

/** True iff the component's price came from the market fallback. */
export function isMarketDrawerPrice(priceSource: string | null | undefined): boolean {
  return typeof priceSource === 'string' && priceSource.startsWith(MARKET_PRICE_SOURCE_PREFIX);
}

/** Minimal shape the drawer needs from a canonical component. */
export interface CanonicalDrawerComponentInput {
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  coefficient?: number | null;
  unitPrice?: number | null;
}

export type DrawerComponentKind = 'MATERIAL' | 'LABOR' | 'EQUIPMENT';

const KIND_DEFAULTS: Record<
  DrawerComponentKind,
  { prefix: string; fallbackName: string; fallbackUnit: string }
> = {
  MATERIAL: { prefix: 'MAT', fallbackName: 'Bahan', fallbackUnit: 'satuan' },
  LABOR: { prefix: 'LAB', fallbackName: 'Tenaga', fallbackUnit: 'OH' },
  EQUIPMENT: { prefix: 'EQP', fallbackName: 'Alat', fallbackUnit: 'jam' },
};

/**
 * Build drawer components from a canonical item's components, resolving
 * each price canonical-first. `total` is null (not 0) when the price is
 * unresolved — matching the drawer's own null convention.
 */
export function buildDrawerComponents(
  components: CanonicalDrawerComponentInput[] | undefined | null,
  kind: DrawerComponentKind,
  priceDb: PriceItem[],
  canonicalSourceLabel: string
): AHSPComponent[] {
  const defaults = KIND_DEFAULTS[kind];
  const stamp = Date.now();
  return (components || []).map((c, i) => {
    const name = c.name || defaults.fallbackName;
    const coefficient = c.coefficient || 1;
    const resolved = resolveDrawerComponentPrice(c.unitPrice, name, priceDb, canonicalSourceLabel);
    return {
      id: `${defaults.prefix.toLowerCase()}-${stamp}-${i}`,
      code: c.code || `${defaults.prefix}-${i + 1}`,
      name,
      unit: c.unit || defaults.fallbackUnit,
      coefficient,
      unitPrice: resolved.unitPrice,
      total:
        resolved.unitPrice === null
          ? null
          : SafeDecimalEngine.safeMultiply(coefficient, resolved.unitPrice, 2),
      resourceType: kind,
      priceSource: resolved.priceSource ?? undefined,
    } as AHSPComponent;
  });
}

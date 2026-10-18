/**
 * Overlay harga pasar terverifikasi ke komposisi AHSP (view-layer).
 * ============================================================================
 * - TIDAK mengubah resolver resmi / data kanonis.
 * - Untuk komponen yang harga resminya null: cari referensi MARKET_VERIFIED
 *   yang sebanding (spesifikasi + satuan cocok) lalu tempel sebagai harga
 *   komponen berlabel pasar.
 * - Hasil: komposisi augmented dengan `hasMarketPrices`, D dihitung ulang,
 *   pricingStatus FULL bila semua komponen terisi (resmi/pasar).
 * - Referensi yang belum terverifikasi TIDAK PERNAH masuk kalkulasi.
 */
import type {
  AhspComponentPricing,
  AhspUnitPriceComposition,
} from '../../../data/priceDatabase2026/types';
import { marketReviewStore } from './reviewStore';
import { extractSpec } from './specProfiles';
import { matchCandidate, type MatchNeed } from './matchingEngine';
import type { MarketPriceReference } from './types';

export interface AugmentedComponent extends AhspComponentPricing {
  /** Harga pasar per satuan komponen (null bila tidak ada/tidak cocok). */
  marketUnitPrice: number | null;
  marketSourceName: string | null;
  marketReferenceId: string | null;
  /** true bila harga komponen ini berasal dari referensi pasar terverifikasi */
  isMarketPriced: boolean;
}

export interface AugmentedCategory {
  type: 'labor' | 'material' | 'equipment';
  components: AugmentedComponent[];
  /** Sum over RESOLVED components only (resmi + pasar terverifikasi). */
  subtotalPerUnit: number;
  resolvedCount: number;
  missingCount: number;
  complete: boolean;
}

export interface AugmentedComposition
  extends Omit<AhspUnitPriceComposition, 'labor' | 'material' | 'equipment'> {
  hasMarketPrices: boolean;
  marketPricedCount: number;
  labor: AugmentedCategory;
  material: AugmentedCategory;
  equipment: AugmentedCategory;
}

function effectivePrice(c: AugmentedComponent): number | null {
  return c.unitPrice ?? c.marketUnitPrice;
}

/** Cari referensi pasar terverifikasi terbaik untuk satu komponen. */
export function findBestMarketReference(
  componentName: string,
  componentUnit: string
): MarketPriceReference | null {
  const spec = extractSpec(componentName);
  if (!spec) return null;
  const need: MatchNeed = {
    canonicalName: componentName,
    spec,
    normalizedUnit: componentUnit,
  };
  const candidates = marketReviewStore
    .list('MARKET_VERIFIED')
    .filter((r) => r.normalizedUnit === componentUnit && r.normalizedUnitPrice !== null)
    .map((r) => ({ ref: r, m: matchCandidate(need, r) }))
    .filter((x) => x.m.comparable)
    .sort((a, b) => b.m.matchConfidence - a.m.matchConfidence || (a.ref.normalizedUnitPrice! - b.ref.normalizedUnitPrice!));
  return candidates.length > 0 ? candidates[0].ref : null;
}

function augmentCategory(
  cat: AhspUnitPriceComposition['labor']
): AugmentedCategory {
  let subtotal = 0;
  let resolved = 0;
  const components: AugmentedComponent[] = cat.components.map((c) => {
    if (c.unitPrice !== null) {
      const aug: AugmentedComponent = {
        ...c, marketUnitPrice: null, marketSourceName: null,
        marketReferenceId: null, isMarketPriced: false,
      };
      subtotal += c.subtotalPerUnit ?? 0;
      resolved++;
      return aug;
    }
    const ref = findBestMarketReference(c.itemName, c.unit);
    if (ref && ref.normalizedUnitPrice !== null) {
      const sub = Math.round(c.coefficient * ref.normalizedUnitPrice * 100) / 100;
      subtotal += sub;
      resolved++;
      const aug: AugmentedComponent = {
        ...c,
        unitPrice: null, // tetap null: harga resmi memang tidak ada
        subtotalPerUnit: sub,
        resolved: true,
        marketUnitPrice: ref.normalizedUnitPrice,
        marketSourceName: ref.sourceName,
        marketReferenceId: ref.id,
        isMarketPriced: true,
        sourceName: `Pasar: ${ref.sourceName}`,
      };
      return aug;
    }
    const aug: AugmentedComponent = {
      ...c, marketUnitPrice: null, marketSourceName: null,
      marketReferenceId: null, isMarketPriced: false,
    };
    return aug;
  });
  const total = cat.components.length;
  return {
    ...cat,
    components,
    subtotalPerUnit: subtotal,
    resolvedCount: resolved,
    missingCount: total - resolved,
    complete: total > 0 && resolved === total,
  };
}

/**
 * Terapkan overlay ke komposisi resmi. Murni & deterministik.
 */
export function applyMarketOverlay(comp: AhspUnitPriceComposition): AugmentedComposition {
  const labor = augmentCategory(comp.labor);
  const material = augmentCategory(comp.material);
  const equipment = augmentCategory(comp.equipment);

  const totalComponents = comp.totalComponents;
  const resolvedComponents = labor.resolvedCount + material.resolvedCount + equipment.resolvedCount;
  const missingComponents = totalComponents - resolvedComponents;
  const marketPricedCount =
    labor.components.filter((c) => c.isMarketPriced).length +
    material.components.filter((c) => c.isMarketPriced).length +
    equipment.components.filter((c) => c.isMarketPriced).length;

  const unitPrice =
    resolvedComponents > 0
      ? Math.round(labor.subtotalPerUnit + material.subtotalPerUnit + equipment.subtotalPerUnit)
      : null;

  // Kumpulkan yang masih hilang (resmi maupun pasar tidak ada)
  const missing = comp.missing.filter((m) => {
    const all = [...labor.components, ...material.components, ...equipment.components];
    const found = all.find((c) => c.itemCode === m.code && c.itemName === m.name);
    return !found || (!found.isMarketPriced && found.unitPrice === null);
  });

  let pricingStatus: AhspUnitPriceComposition['pricingStatus'];
  if (totalComponents === 0) {
    pricingStatus = comp.pricingStatus;
  } else if (missingComponents === 0) {
    pricingStatus = 'FULL';
  } else if (resolvedComponents > 0) {
    pricingStatus = 'PARTIAL';
  } else {
    pricingStatus = 'MISSING';
  }

  return {
    ...comp,
    labor, material, equipment,
    unitPrice,
    resolvedComponents,
    missingComponents,
    missing,
    pricingStatus,
    hasMarketPrices: marketPricedCount > 0,
    marketPricedCount,
  };
}

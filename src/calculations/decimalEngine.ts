import Decimal from 'decimal.js';
import { RabItem, AhspResource } from '../types';

// Configure Decimal.js precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Deterministic calculation engine for construction economics.
 * Prevents IEEE 754 floating point arithmetic inaccuracies.
 */
export const calculateItemAmount = (volume: number | string, unitPrice: number | string): number => {
  try {
    const v = new Decimal(volume || 0);
    const p = new Decimal(unitPrice || 0);
    return v.mul(p).toDecimalPlaces(2).toNumber();
  } catch {
    return 0;
  }
};

/**
 * AHSP unit price = Σ (coefficient × resource unit price).
 *
 * Returns `null` when NOTHING could be priced, and `resolvedCount`/`missingCount` so a
 * partial total is never mistaken for a complete one.
 *
 * The old implementation used `res.unitPrice || 0`, which silently priced every
 * unpriced resource at Rp 0 — the defect behind "Rp 0" in the UI. For the full,
 * provenance-carrying composition (per-category subtotals, source per component) use
 * `priceResolver2026.resolveAhspUnitPrice()` in `src/data/priceDatabase2026/resolver.ts`.
 */
export const calculateAhspUnitPriceDetailed = (
  resources: AhspResource[]
): {
  unitPrice: number | null;
  resolvedCount: number;
  missingCount: number;
  missing: Array<{ name: string; unit: string }>;
} => {
  const missing: Array<{ name: string; unit: string }> = [];
  let resolvedCount = 0;
  const sum = resources.reduce((acc, res) => {
    const raw = res.unitPrice;
    if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) {
      missing.push({ name: String((res as any).name || ''), unit: String((res as any).unit || '') });
      return acc;
    }
    resolvedCount++;
    const coeff = new Decimal(res.coefficient || 0);
    return acc.plus(coeff.mul(new Decimal(raw as number)));
  }, new Decimal(0));

  return {
    unitPrice: resolvedCount > 0 ? sum.toDecimalPlaces(2).toNumber() : null,
    resolvedCount,
    missingCount: resources.length - resolvedCount,
    missing,
  };
};

/**
 * @deprecated Prefer `calculateAhspUnitPriceDetailed` (or the shared price resolver),
 * which distinguishes "unpriced" from "zero". This wrapper returns 0 only when there is
 * genuinely nothing to sum; callers that need to detect an incomplete price must use the
 * detailed variant.
 */
export const calculateAhspUnitPrice = (resources: AhspResource[]): number => {
  const d = calculateAhspUnitPriceDetailed(resources);
  return d.unitPrice === null ? 0 : d.unitPrice;
};

export const calculateRabTotals = (items: RabItem[]) => {
  try {
    const subtotal = items.reduce((acc, item) => {
      return acc.plus(new Decimal(item.amount || 0));
    }, new Decimal(0));

    // Standard Indonesian Construction Tax & Overhead
    const ppnRate = new Decimal(0.11); // PPN 11%
    const overheadRate = new Decimal(0.05); // Overhead & Profit 5%

    const overhead = subtotal.mul(overheadRate).toDecimalPlaces(0);
    const subtotalWithOverhead = subtotal.plus(overhead);
    const ppn = subtotalWithOverhead.mul(ppnRate).toDecimalPlaces(0);
    const grandTotal = subtotalWithOverhead.plus(ppn);

    return {
      subtotal: subtotal.toNumber(),
      overhead: overhead.toNumber(),
      ppn: ppn.toNumber(),
      grandTotal: grandTotal.toNumber(),
    };
  } catch {
    return {
      subtotal: 0,
      overhead: 0,
      ppn: 0,
      grandTotal: 0,
    };
  }
};

/**
 * Format an IDR amount.
 *
 * `null` / `undefined` means "no price could be resolved" and renders as an em dash —
 * NEVER as `Rp 0`. This is what stops a missing price from being indistinguishable
 * from a genuinely zero amount in the UI (see `EZRAB_PRICE_ZERO_ROOT_CAUSE.md`).
 */
export const formatCurrencyIDR = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value;
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
};

export const formatNumberID = (value: number | string, decimals: number = 2): string => {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

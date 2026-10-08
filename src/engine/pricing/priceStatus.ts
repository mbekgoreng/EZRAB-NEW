/**
 * Phase 2 hardening — pure price-status resolution for RAB write paths.
 *
 * RULE: a missing, null, undefined, NaN, or non-numeric unit price is
 * PRICE_UNRESOLVED — it must never silently become Rp0, and the item must
 * never be labeled VERIFIED. An explicit 0 IS a resolved price
 * ("zero strictly if the actual price is zero, never on missing data").
 */
import type { PriceStatus } from '../../types';

export function resolvePriceStatus(unitPrice: unknown): PriceStatus {
  if (unitPrice === null || unitPrice === undefined) return 'PRICE_UNRESOLVED';
  if (typeof unitPrice === 'string' && unitPrice.trim() === '') return 'PRICE_UNRESOLVED';
  const n = typeof unitPrice === 'number' ? unitPrice : Number(unitPrice);
  if (!Number.isFinite(n)) return 'PRICE_UNRESOLVED';
  return 'PRICE_RESOLVED';
}

export function isPriceUnresolved(status: PriceStatus | null | undefined): boolean {
  return status === 'PRICE_UNRESOLVED';
}

/** Numeric value safe for DISPLAY ONLY. Never use for totals. */
export function displayUnitPrice(unitPrice: number | null | undefined): number {
  const n = typeof unitPrice === 'number' ? unitPrice : Number(unitPrice);
  return Number.isFinite(n) ? n : 0;
}

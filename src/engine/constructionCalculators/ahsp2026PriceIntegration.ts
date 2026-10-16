/**
 * AHSP 2026 → RAB Price Integration
 * ==================================
 * Bridges the official AHSP 2026 canonical registry into RAB line items.
 *
 * Integrity rules (non-negotiable):
 * - A mapped item whose official price cannot be confirmed resolves to
 *   PRICE_UNRESOLVED (null price) — never Rp0, never an invented figure.
 * - PRICE_INCOMPLETE (e.g. unit-incompatible component) without a usable
 *   price is surfaced as PRICE_UNRESOLVED, never as a resolved fact.
 * - The official-resolve path always writes fresh official identity; it
 *   never produces PRICE_MANUAL (manual edits are a separate, labeled path).
 */
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import type { PriceStatus } from '../../types';

/**
 * Map an engine-side price state onto the RAB line-item PriceStatus.
 *
 * - 'PRICE_INCOMPLETE' + no usable price → 'PRICE_UNRESOLVED' (a partial
 *   calculation is not a price fact).
 * - Unknown/absent state → resolved only when a price is actually present.
 */
export function toRabPriceStatus(
  status: string | undefined,
  hasPrice: boolean
): PriceStatus {
  if (status === 'PRICE_INCOMPLETE') {
    return hasPrice ? 'PRICE_RESOLVED' : 'PRICE_UNRESOLVED';
  }
  if (
    status === 'PRICE_RESOLVED' ||
    status === 'PRICE_MANUAL' ||
    status === 'PRICE_UNRESOLVED'
  ) {
    return status;
  }
  // Unknown or absent state: never invent a resolved fact — a price only
  // counts when one is present.
  return hasPrice ? 'PRICE_RESOLVED' : 'PRICE_UNRESOLVED';
}

export interface OfficialPriceResolution {
  status: 'PRICE_RESOLVED' | 'PRICE_UNRESOLVED';
  priceSource: 'OFFICIAL_AHSP_2026' | 'PRICE_NOT_FOUND';
  code: string;
  domain: string;
  name?: string;
  unit?: string;
  unitPrice: number | null;
  explanation: string;
}

/**
 * Resolve the official AHSP 2026 price for a mapped item code + domain.
 * Reads ONLY the canonical official registry (data is read-only here).
 * Unknown code or missing price → PRICE_UNRESOLVED with null price.
 */
export function resolveOfficialPriceForMappedItem(
  code: string,
  domain: string
): OfficialPriceResolution {
  const cleanCode = (code || '').trim();
  const normCode = cleanCode.toLowerCase();
  const normDomain = (domain || '').trim().toUpperCase();

  const hit = ALL_OFFICIAL_AHSP_ITEMS.find(
    (i) =>
      (i.codeNormalized || i.code || '').toLowerCase() === normCode &&
      (!normDomain || String(i.domain).toUpperCase() === normDomain)
  );

  if (!hit) {
    return {
      status: 'PRICE_UNRESOLVED',
      priceSource: 'PRICE_NOT_FOUND',
      code: cleanCode,
      domain,
      unitPrice: null,
      explanation: `Kode "${cleanCode}" tidak ditemukan pada AHSP resmi 2026 (domain:${domain || '-'}) — harga tidak diisi, bukan Rp0.`,
    };
  }

  const price = (hit as { unitPrice?: unknown }).unitPrice;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    return {
      status: 'PRICE_UNRESOLVED',
      priceSource: 'PRICE_NOT_FOUND',
      code: hit.code,
      domain: String(hit.domain),
      name: hit.name,
      unit: hit.unit,
      unitPrice: null,
      explanation: `Item [${hit.code}] ${hit.name} terdaftar pada AHSP resmi 2026 tetapi tidak memiliki harga resmi — harga tidak diisi, bukan Rp0.`,
    };
  }

  return {
    status: 'PRICE_RESOLVED',
    priceSource: 'OFFICIAL_AHSP_2026',
    code: hit.code,
    domain: String(hit.domain),
    name: hit.name,
    unit: hit.unit,
    unitPrice: price,
    explanation:
      `Harga resmi AHSP 2026: [${hit.code}] ${hit.name} — ` +
      `Rp ${price.toLocaleString('id-ID')}/${hit.unit} ` +
      `(domain:${hit.domain}, sumber:${hit.sourceDocument || hit.sourceId}).`,
  };
}

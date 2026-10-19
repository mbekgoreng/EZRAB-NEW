/**
 * EZRAB Market Price Auto-Enrichment Engine — Orchestrator
 * ========================================================
 * Mengorkestrasi: pencarian → normalisasi → matching → penilaian.
 * TIDAK mengubah canonical AHSP. Menggunakan API existing yang sudah benar.
 */

import type { MaterialSpec, MarketPriceCandidate, MarketPriceReference } from './types';
import { marketSearchRegistry, type MarketSearchQuery, type RawMarketCandidate } from './searchProvider';
import { normalizeUnitPrice } from './unitConversion';
import { matchCandidate, type MatchNeed } from './matchingEngine';
import { marketReviewStore } from './reviewStore';

/** Status harga terpadu (Fase 5). */
export type EnrichedPriceStatus =
  | 'OFFICIAL_AHSP'
  | 'MARKET_VERIFIED'
  | 'MARKET_PROVISIONAL'
  | 'EZRAB_ASSUMPTION'
  | 'PRICE_MANUAL'
  | 'PRICE_UNRESOLVED';

/** Kandidat yang sudah dinilai. */
export interface ScoredCandidate {
  raw: RawMarketCandidate;
  normalizedPrice: number;
  normalizedUnit: string;
  confidence: number;
  formula: string;
}

/** Hasil enrichment untuk satu material. */
export interface EnrichmentResult {
  materialName: string;
  baseUnit: string;
  accepted: ScoredCandidate[];
  rejected: { raw: RawMarketCandidate; reason: string }[];
  stats: { min: number; median: number; max: number; count: number } | null;
  suggestedStatus: EnrichedPriceStatus;
  wasLiveSearch: boolean;
  limitations?: string;
  /** Kode error terkategorikan (AUTH_ERROR, RATE_LIMIT, TIMEOUT, ...) */
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Enrich satu material: cari → normalisasi → matching → nilai.
 */
export async function enrichMaterialPrice(
  materialName: string,
  spec: MaterialSpec,
  baseUnit: string,
  region?: string
): Promise<EnrichmentResult> {
  const provider = marketSearchRegistry.get();
  const query: MarketSearchQuery = { materialName, spec, baseUnit, region, limit: 20 };
  const searchResult = await provider.search(query);

  const need: MatchNeed = { canonicalName: materialName, spec, normalizedUnit: baseUnit };

  const accepted: ScoredCandidate[] = [];
  const rejected: { raw: RawMarketCandidate; reason: string }[] = [];

  for (const raw of searchResult.candidates) {
    // Bangun spec kandidat dari atribut produk (bukan dari need)
    const candidateSpec: MaterialSpec = {
      category: spec.category, // kategori diasumsikan sama; atribut kunci dari produk
      keyAttributes: { ...spec.keyAttributes, ...(raw.specAttributes || {}) },
    };
    // Jika produk menyebutkan atribut kunci yang berbeda, timpa dengan nilai produk
    // (agar hard gate menolak bila tidak cocok)
    if (raw.specAttributes) {
      for (const [k, v] of Object.entries(raw.specAttributes)) {
        candidateSpec.keyAttributes[k] = v;
      }
    }

    const candidate: MarketPriceCandidate = {
      canonicalName: materialName,
      spec: candidateSpec,
      sourceName: raw.sellerName,
      sourceType: 'marketplace',
      productUrl: raw.productUrl,
      brand: raw.brand ?? null,
      productTitle: raw.productName,
      listedPrice: raw.listedPrice,
      packageQuantity: raw.packageQuantity ?? null,
      packageUnit: raw.saleUnit,
      region: raw.region ?? null,
    };

    const match = matchCandidate(need, candidate);
    if (!match.comparable || match.normalizedUnitPrice === null) {
      rejected.push({
        raw,
        reason: match.blockers.join('; ') || 'Tidak sebanding',
      });
      continue;
    }

    const norm = normalizeUnitPrice(
      raw.listedPrice,
      raw.saleUnit,
      raw.packageQuantity ?? null,
      baseUnit
    );
    const formula =
      `Rp${raw.listedPrice.toLocaleString('id-ID')}/${raw.saleUnit}` +
      (raw.packageQuantity ? ` (isi ${raw.packageQuantity} ${raw.packageContentUnit || ''})` : '') +
      ` → Rp${match.normalizedUnitPrice.toLocaleString('id-ID')}/${baseUnit}`;

    accepted.push({
      raw,
      normalizedPrice: match.normalizedUnitPrice,
      normalizedUnit: baseUnit,
      confidence: match.matchConfidence,
      formula,
    });
  }

  // Dedup: URL sama = satu sumber
  const seenUrls = new Set<string>();
  const deduped = accepted.filter((c) => {
    const url = c.raw.productUrl;
    if (url && seenUrls.has(url)) return false;
    if (url) seenUrls.add(url);
    return true;
  });

  let stats: EnrichmentResult['stats'] = null;
  if (deduped.length > 0) {
    const prices = deduped.map((c) => c.normalizedPrice).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    stats = {
      min: prices[0],
      median: prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2,
      max: prices[prices.length - 1],
      count: prices.length,
    };
  }

  const suggestedStatus: EnrichedPriceStatus =
    deduped.length > 0 ? 'MARKET_PROVISIONAL' : 'PRICE_UNRESOLVED';

  return {
    materialName,
    baseUnit,
    accepted: deduped,
    rejected,
    stats,
    suggestedStatus,
    wasLiveSearch: searchResult.isLive,
    limitations: searchResult.limitations,
    errorCode: searchResult.error ? searchResult.error.split(':')[0] : undefined,
    errorMessage: searchResult.error,
  };
}

/**
 * Simpan kandidat yang diterima user sebagai referensi via store.ingest().
 * Status awal SELALU NEEDS_REVIEW — verifikasi manusia menaikkan ke VERIFIED.
 */
export function acceptCandidateAsReference(
  scored: ScoredCandidate,
  need: MatchNeed,
  createdBy: string
): void {
  const candidate: MarketPriceCandidate = {
    canonicalName: scored.raw.productName,
    spec: { category: 'unknown', keyAttributes: {} },
    sourceName: scored.raw.sellerName,
    sourceType: 'marketplace',
    productUrl: scored.raw.productUrl,
    brand: scored.raw.brand ?? null,
    productTitle: scored.raw.productName,
    listedPrice: scored.raw.listedPrice,
    packageQuantity: scored.raw.packageQuantity ?? null,
    packageUnit: scored.raw.saleUnit,
    region: scored.raw.region ?? null,
  };
  marketReviewStore.ingest(need, [candidate], createdBy);
}

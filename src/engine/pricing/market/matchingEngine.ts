/**
 * Matching engine referensi harga pasar.
 * ============================================================================
 * - Kriteria keras (hard gate): kategori & atribut kunci harus cocok, satuan
 *   harus dapat dinormalisasi. Gagal → tidak sebanding, masuk NEEDS_REVIEW.
 * - Skor keyakinan: 0.5 dasar + bonus (URL bukti, merek cocok, penjual dikenal).
 * - Dedup: (sourceName, productUrl|sourceProductId) sama → satu referensi.
 * - Statistik: hanya atas referensi MARKET_VERIFIED yang sebanding
 *   (satuan dasar sama + atribut kunci cocok): min, median, max, count.
 */
import type {
  MarketPriceCandidate,
  MarketPriceReference,
  MarketPriceStats,
  MatchResult,
  MaterialSpec,
} from './types';
import { compareKeyAttributes } from './specProfiles';
import { normalizeUnitPrice } from './unitConversion';

/** Penjual/toko yang dianggap terverifikasi keberadaannya (bukan verifikasi harga). */
const KNOWN_SELLERS = new Set([
  'mitra10', 'depo bangunan', 'depobangunan', 'ace hardware', 'informa',
]);

export interface MatchNeed {
  canonicalName: string;
  spec: MaterialSpec;
  normalizedUnit: string; // satuan dasar kebutuhan AHSP, mis. 'kg'
}

export function matchCandidate(need: MatchNeed, candidate: MarketPriceCandidate): MatchResult {
  const blockers: string[] = [];

  // Gate 1: spesifikasi
  const specCheck = compareKeyAttributes(need.spec, candidate.spec);
  if (!specCheck.compatible) blockers.push(...specCheck.blockers.map((b) => `spesifikasi: ${b}`));

  // Gate 2: satuan dapat dinormalisasi ke satuan kebutuhan
  const norm = normalizeUnitPrice(
    candidate.listedPrice,
    candidate.packageUnit ?? null,
    candidate.packageQuantity ?? null,
    need.normalizedUnit
  );
  if (norm.price === null) blockers.push(`satuan: ${norm.reason}`);

  // Gate 3: harga & ketersediaan waras
  if (!(candidate.listedPrice > 0)) blockers.push('harga: tidak valid');
  if (candidate.availability === 'habis') blockers.push('stok habis');

  const comparable = blockers.length === 0;
  let confidence = comparable ? 0.5 : 0.2;
  if (candidate.productUrl) confidence += 0.15; // ada bukti
  if (candidate.brand && need.spec.extraAttributes?.['merek'] &&
      String(candidate.brand).toLowerCase().includes(String(need.spec.extraAttributes['merek']).toLowerCase())) {
    confidence += 0.1;
  }
  if (candidate.sellerName && KNOWN_SELLERS.has(candidate.sellerName.toLowerCase())) confidence += 0.1;
  if (candidate.sourceType === 'ai_suggested') confidence = Math.min(confidence, 0.45); // saran AI: tidak pernah tinggi
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    candidate,
    comparable,
    matchConfidence: comparable ? confidence : Math.min(confidence, 0.4),
    blockers,
    normalizedUnitPrice: norm.price,
    normalizedUnit: norm.price !== null ? need.normalizedUnit : null,
  };
}

/** Kunci dedup: sumber + identitas produk. */
export function dedupKey(c: MarketPriceCandidate | MarketPriceReference): string {
  const src = (c.sourceName || '').trim().toLowerCase();
  const pid = ('sourceProductId' in c && c.sourceProductId ? String(c.sourceProductId) : '').trim().toLowerCase();
  const url = ('productUrl' in c && c.productUrl ? String(c.productUrl) : '').trim().toLowerCase();
  return `${src}::${pid || url}`;
}

/** Buang duplikat: kandidat dengan kunci sama → simpan satu (prioritas URL bukti). */
export function dedupCandidates<T extends MarketPriceCandidate | MarketPriceReference>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const it of items) {
    const k = dedupKey(it);
    const prev = seen.get(k);
    if (!prev) { seen.set(k, it); continue; }
    const prevUrl = 'productUrl' in prev && prev.productUrl ? 1 : 0;
    const curUrl = 'productUrl' in it && it.productUrl ? 1 : 0;
    if (curUrl > prevUrl) seen.set(k, it);
  }
  return [...seen.values()];
}

function median(sorted: number[]): number {
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

/**
 * Statistik harga pasar. Hanya dari referensi:
 * - verificationStatus === 'MARKET_VERIFIED'
 * - normalizedUnit sama & normalizedUnitPrice valid
 * - availability !== 'habis', priceType normal (promo/grosir dikecualikan dari
 *   statistik agar tidak menyesatkan; tetap tampil sebagai referensi individual)
 */
export function summarizeMarketPrices(
  refs: MarketPriceReference[],
  unit: string,
  minSamples = 3
): MarketPriceStats {
  const eligible = refs.filter(
    (r) =>
      r.verificationStatus === 'MARKET_VERIFIED' &&
      r.normalizedUnit === unit &&
      r.normalizedUnitPrice !== null &&
      r.normalizedUnitPrice > 0 &&
      r.availability !== 'habis' &&
      r.priceType === 'normal'
  );
  const prices = eligible.map((r) => r.normalizedUnitPrice as number).sort((a, b) => a - b);
  if (prices.length < minSamples) {
    return {
      count: refs.length,
      comparableCount: prices.length,
      min: null, median: null, max: null, unit,
      insufficientData: true,
      insufficientReason: `hanya ${prices.length} referensi terverifikasi & sebanding (butuh ≥ ${minSamples}); tidak dibentuk rata-rata`,
    };
  }
  return {
    count: refs.length,
    comparableCount: prices.length,
    min: prices[0],
    median: median(prices),
    max: prices[prices.length - 1],
    unit,
    insufficientData: false,
    insufficientReason: null,
  };
}

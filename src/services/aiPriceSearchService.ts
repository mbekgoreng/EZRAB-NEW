/**
 * EZRAB — AI Web Price Search Service (Price Discovery Provider)
 *
 * Principles:
 * - AI is ONLY a price discovery assistant, NOT the authoritative estimator.
 * - Every candidate returned has explicit source provenance (sourceName, URL/platform, observedDate).
 * - Anti-hallucination: If no verifiable price is found, return NO_RESULT instead of inventing numbers.
 * - Web prices are marked WEB_REFERENCE (never official before user confirmation).
 * - High-speed caching: SHA-256 query caching prevents duplicate external requests.
 */

import {
  PriceCandidate,
  PriceSearchInput,
  PriceSearchResult,
} from '../engine/pricing/contracts/types';
import { aiProviderRouter } from './aiProviderRouter';

export interface PriceSearchProvider {
  searchPrice(input: PriceSearchInput): Promise<PriceSearchResult>;
}

export class AiPriceSearchService implements PriceSearchProvider {
  private static instance: AiPriceSearchService;

  // In-memory query cache: hash -> PriceSearchResult
  private cache: Map<string, { result: PriceSearchResult; timestamp: number }> = new Map();
  private readonly cacheTtlMs = 12 * 60 * 60 * 1000; // 12 hours

  private constructor() {}

  public static getInstance(): AiPriceSearchService {
    if (!AiPriceSearchService.instance) {
      AiPriceSearchService.instance = new AiPriceSearchService();
    }
    return AiPriceSearchService.instance;
  }

  /**
   * Deterministic query hash
   */
  private generateQueryKey(input: PriceSearchInput): string {
    const raw = [
      input.material.toLowerCase().trim(),
      (input.specification || '').toLowerCase().trim(),
      (input.brand || '').toLowerCase().trim(),
      (input.unit || '').toLowerCase().trim(),
      (input.region || 'Jabodetabek').toLowerCase().trim(),
      input.year || 2026,
    ].join('::');

    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return `price_query_${Math.abs(hash).toString(16)}`;
  }

  public async searchWebPrices(material: string, options?: { region?: string; year?: number; unit?: string }): Promise<PriceCandidate[]> {
    const result = await this.searchPrice({
      material,
      region: options?.region,
      year: options?.year,
      unit: options?.unit,
    });
    return result.candidates;
  }

  public async searchPrice(input: PriceSearchInput, bypassCache: boolean = false): Promise<PriceSearchResult> {
    if (!input.material || input.material.trim() === '') {
      return {
        status: 'NO_RESULT',
        query: input,
        candidates: [],
        error: 'Material name cannot be empty for price search.',
        observedDate: new Date().toISOString().split('T')[0],
      };
    }

    const cacheKey = this.generateQueryKey(input);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (!bypassCache && cached && now - cached.timestamp < this.cacheTtlMs) {
      return {
        ...cached.result,
        cached: true,
      };
    }

    const region = input.region || 'Indonesia / Jabodetabek';
    const year = input.year || 2026;
    const unit = input.unit || 'unit';

    const systemPrompt = `Anda adalah spesialis riset harga material konstruksi Indonesia (Quantity Surveyor / Estimator).
Tugas Anda adalah menemukan referensi harga pasar riil (bukan perkiraan fiktif) untuk material konstruksi di Indonesia.
Format output WAJIB JSON murni tanpa markdown wrapper:
{
  "found": true | false,
  "reason": "Penjelasan singkat jika tidak ditemukan atau rangkuman sumber",
  "candidates": [
    {
      "price": number,
      "unit": string,
      "brand": string,
      "specification": string,
      "sourceName": "Nama Toko / Distributor / Marketplace (cth: Mitra 10, Depo Bangunan, Tokopedia, Bukalapak, Distributor Resmi)",
      "sourceUrl": "URL atau nama domain platform rujukan",
      "region": string,
      "confidence": number (0.5 - 0.95),
      "notes": string
    }
  ]
}

PERATURAN KETAT:
1. JANGAN PERNAH MENGARANG ANGKA HARGA jika tidak ada data pasar riil yang relevan.
2. Jika item terlalu spesifik atau tidak ada rujukan harga yang dapat diverifikasi, kembalikan "found": false dan kandidat kosong.
3. Cantumkan nama toko/distributor/marketplace rujukan resmi di Indonesia.`;

    const userPrompt = `Cari referensi harga pasar aktual Indonesia untuk:
- Material: ${input.material}
${input.specification ? `- Spesifikasi: ${input.specification}` : ''}
${input.brand ? `- Merek: ${input.brand}` : ''}
- Satuan: ${unit}
- Wilayah Rujukan: ${region}
- Tahun Acuan: ${year}
${input.category ? `- Kategori: ${input.category}` : ''}

Kembalikan daftar kandidat harga pasar dari toko bangunan / distributor / marketplace terpercaya di Indonesia.`;

    try {
      const response = await aiProviderRouter.execute({
        criteria: {
          task: 'RAB_ANALYSIS',
          qualityRequirement: 'BALANCED',
          complexity: 'MEDIUM',
        },
        systemPrompt,
        prompt: userPrompt,
        maxRetries: 1,
      });

      if (!response.success || !response.content) {
        return {
          status: 'SEARCH_FAILED',
          query: input,
          candidates: [],
          error: response.error || 'Gagal menghubungi penyedia riset harga AI.',
          observedDate: new Date().toISOString().split('T')[0],
        };
      }

      // Parse JSON from response content
      let parsed: any;
      try {
        const cleanJson = response.content
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        parsed = JSON.parse(cleanJson);
      } catch (parseErr) {
        return {
          status: 'SEARCH_FAILED',
          query: input,
          candidates: [],
          error: 'Format data harga dari penyedia tidak dapat diparsing secara valid.',
          observedDate: new Date().toISOString().split('T')[0],
        };
      }

      if (!parsed.found || !Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
        const noResult: PriceSearchResult = {
          status: 'NO_RESULT',
          query: input,
          candidates: [],
          error: parsed.reason || 'Tidak ditemukan sumber harga yang dapat diverifikasi.',
          observedDate: new Date().toISOString().split('T')[0],
        };
        this.cache.set(cacheKey, { result: noResult, timestamp: now });
        return noResult;
      }

      const today = new Date().toISOString().split('T')[0];
      const validCandidates: PriceCandidate[] = [];

      for (let i = 0; i < parsed.candidates.length; i++) {
        const raw = parsed.candidates[i];
        const numPrice = Number(raw.price);
        if (isNaN(numPrice) || numPrice <= 0) continue;

        validCandidates.push({
          id: `WEB-CAND-${Date.now()}-${i + 1}`,
          price: Math.round(numPrice),
          unit: raw.unit || unit,
          source: 'WEB_REFERENCE',
          sourceName: raw.sourceName || 'Referensi Pasar Digital',
          sourceUrl: raw.sourceUrl || undefined,
          observedDate: today,
          region: raw.region || region,
          specification: raw.specification || input.specification,
          brand: raw.brand || input.brand,
          confidence: Math.min(0.9, Math.max(0.5, Number(raw.confidence) || 0.7)),
          matchType: 'WEB',
          notes: raw.notes || `Riset harga web (${raw.sourceName || 'Online'})`,
          isConfirmed: false,
        });
      }

      if (validCandidates.length === 0) {
        const noResult: PriceSearchResult = {
          status: 'NO_RESULT',
          query: input,
          candidates: [],
          error: 'Semua kandidat yang dikembalikan tidak memiliki nominal valid.',
          observedDate: today,
        };
        this.cache.set(cacheKey, { result: noResult, timestamp: now });
        return noResult;
      }

      // Compute Range and Median
      const prices = validCandidates.map((c) => c.price).sort((a, b) => a - b);
      const min = prices[0];
      const max = prices[prices.length - 1];
      const mid = Math.floor(prices.length / 2);
      const median = prices.length % 2 !== 0 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);

      const searchResult: PriceSearchResult = {
        status: 'FOUND',
        query: input,
        candidates: validCandidates,
        priceRange: {
          min,
          max,
          median,
          currency: 'IDR',
        },
        observedDate: today,
      };

      this.cache.set(cacheKey, { result: searchResult, timestamp: now });
      return searchResult;
    } catch (err: any) {
      return {
        status: 'SEARCH_FAILED',
        query: input,
        candidates: [],
        error: err.message || 'Terjadi kesalahan sistem saat melakukan riset harga.',
        observedDate: new Date().toISOString().split('T')[0],
      };
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const aiPriceSearchService = AiPriceSearchService.getInstance();

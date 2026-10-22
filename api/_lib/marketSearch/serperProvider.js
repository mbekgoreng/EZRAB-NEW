/**
 * EZRAB Market Search — Serper API Adapter (server-side)
 * ======================================================
 * Adapter MarketSearchProvider menggunakan Serper (Google SERP API).
 *
 * - Kredensial HANYA via env `SERPER_API_KEY` (server-side, tidak di bundle).
 * - Tanpa key → UnavailableSearchProvider (jujur, bukan mock).
 * - Hasil: kandidat produk dengan URL bukti; harga diekstrak dari snippet
 *   bila tersedia, selebihnya NEEDS_REVIEW untuk verifikasi halaman produk.
 *
 * Batasan jujur:
 * - Snippet SERP bukan harga terverifikasi; selalu butuh buka halaman produk.
 * - Rate limit: 2.500 query gratis, lalu $1/1.000 (Serper, per 2026).
 * - Jangan mengklaim real-time; catat waktu pencarian.
 *
 * Catatan format modul: file ini JavaScript ESM murni (konsisten dengan
 * seluruh api/ lain). Kontrak tipenya (MarketSearchProvider dkk.) hidup di
 * src/engine/pricing/market/searchProvider.ts — anotasi tipe tidak dipakai
 * di sini agar modul dapat diimpor loader ESM Node/tsx tanpa transpiler TS.
 */

import { UnavailableSearchProvider } from '../../../src/engine/pricing/market/searchProvider.ts';

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const TIMEOUT_MS = 15000;

/** Ekstrak harga Rp dari teks snippet (best-effort, tidak dijamin). */
function extractIdrPrice(text) {
  const m = text.replace(/\u00a0/g, ' ').match(/Rp\s?([\d.,]+)/i);
  if (!m) return null;
  const num = m[1].replace(/\./g, '').replace(/,(\d{2})$/, '.$1');
  const v = parseFloat(num);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export class SerperSearchProvider {
  capabilities = {
    name: 'serper',
    supportsLiveSearch: true,
    regions: ['ID'],
    sourceTypes: ['web_search'],
    limitations: [
      'Hasil dari Google SERP via Serper; snippet bukan harga terverifikasi.',
      'Harga final wajib diverifikasi dengan membuka halaman produk.',
      '2.500 query gratis/bulan, selebihnya $1 per 1.000 query.',
    ],
  };

  constructor(apiKey) {
    if (!apiKey) throw new Error('SERPER_API_KEY tidak dikonfigurasi.');
    this.apiKey = apiKey;
  }

  async search(query) {
    const q = `${query.materialName} harga ${query.region || 'Indonesia'} beli`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(SERPER_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q,
          gl: 'id',
          hl: 'id',
          num: Math.min(query.limit || 10, 20),
        }),
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        return {
          candidates: [], isLive: false, searchedAt: new Date().toISOString(),
          error: 'AUTH_ERROR: API key Serper tidak valid atau ditolak.',
        };
      }
      if (res.status === 429) {
        return {
          candidates: [], isLive: false, searchedAt: new Date().toISOString(),
          error: 'RATE_LIMIT: kuota Serper habis. Coba lagi nanti.',
        };
      }
      if (!res.ok) {
        return {
          candidates: [], isLive: false, searchedAt: new Date().toISOString(),
          error: `PROVIDER_ERROR: Serper HTTP ${res.status}.`,
        };
      }

      const data = await res.json();
      const organic = data.organic || [];
      const candidates = [];

      for (const r of organic) {
        const title = r.title || '';
        const link = r.link || '';
        const snippet = r.snippet || '';
        // Filter: hanya halaman produk/toko (bukan artikel/blog)
        const isProductLike = /tokopedia\.com|shopee\.co\.id|bukalapak\.com|blibli\.com|mitra10|depobangunan|acehardware\.co\.id/i.test(link);
        if (!isProductLike) continue;

        const price = extractIdrPrice(snippet + ' ' + title);
        candidates.push({
          productName: title.slice(0, 120),
          sellerName: new URL(link).hostname.replace(/^www\./, ''),
          productUrl: link,
          listedPrice: price ?? 0, // 0 = tidak terdeteksi di snippet → NEEDS_REVIEW
          saleUnit: query.baseUnit, // satuan pasti hanya setelah buka halaman produk
          observedAt: new Date().toISOString(),
          region: query.region || 'ID',
          availability: 'unknown',
          specAttributes: {},
        });
      }

      return {
        candidates,
        isLive: true,
        searchedAt: new Date().toISOString(),
        limitations: candidates.some((c) => c.listedPrice === 0)
          ? 'Sebagian harga tidak terdeteksi di snippet; buka halaman produk untuk verifikasi.'
          : undefined,
      };
    } catch (e) {
      const isTimeout = e?.name === 'AbortError';
      return {
        candidates: [], isLive: false, searchedAt: new Date().toISOString(),
        error: isTimeout ? 'TIMEOUT: Serper tidak merespons dalam 15 detik.' : `NETWORK_ERROR: ${e?.message}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Factory: kembalikan Serper bila key ada, selain itu Unavailable. */
export function createMarketSearchProvider() {
  const key = process.env.SERPER_API_KEY;
  if (key) return new SerperSearchProvider(key);
  return new UnavailableSearchProvider();
}

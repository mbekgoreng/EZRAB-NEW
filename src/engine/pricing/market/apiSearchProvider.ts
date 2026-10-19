/**
 * Frontend adapter: memanggil /api/market/search (server-side).
 * Kredensial tetap di server; browser hanya menerima kandidat.
 */
import type {
  MarketSearchProvider,
  MarketSearchQuery,
  MarketSearchResult,
  ProviderCapabilities,
} from './searchProvider';

export class ApiMarketSearchProvider implements MarketSearchProvider {
  readonly capabilities: ProviderCapabilities = {
    name: 'api-proxy',
    supportsLiveSearch: true, // aktual tergantung konfigurasi server
    regions: ['ID'],
    sourceTypes: ['web_search'],
    limitations: [
      'Melalui /api/market/search server-side.',
      'Jika server belum dikonfigurasi SERPER_API_KEY, hasil kosong dengan pesan jujur.',
    ],
  };

  async search(query: MarketSearchQuery): Promise<MarketSearchResult> {
    try {
      const res = await fetch('/api/market/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      });
      if (!res.ok) {
        return {
          candidates: [], isLive: false, searchedAt: new Date().toISOString(),
          error: `API_ERROR: /api/market/search HTTP ${res.status}.`,
        };
      }
      const data = await res.json();
      return {
        candidates: data.candidates || [],
        isLive: !!data.isLive,
        searchedAt: data.searchedAt || new Date().toISOString(),
        limitations: data.limitations,
        error: data.errorMessage || undefined,
      };
    } catch (e: any) {
      return {
        candidates: [], isLive: false, searchedAt: new Date().toISOString(),
        error: `NETWORK_ERROR: ${e?.message}`,
      };
    }
  }
}

/**
 * EZRAB Market Price Auto-Enrichment — Search Provider Interface (Fase 2)
 * ========================================================================
 *
 * Interface untuk provider pencarian harga pasar. Implementasi nyata
 * (marketplace API, toko bangunan, katalog publik) belum tersedia dalam
 * runtime — interface ini mendefinisikan kontrak yang jujur tentang
 * kemampuan dan keterbatasan setiap provider.
 *
 * PRINSIP:
 * - Jangan mengklaim real-time jika tidak dapat diverifikasi.
 * - Jangan membuat data tiruan untuk mensimulasikan koneksi nyata.
 * - Setiap hasil pencarian membawa bukti (URL, tanggal, spesifikasi).
 */

import type { MaterialSpec } from './types';

/** Kueri pencarian harga pasar. */
export interface MarketSearchQuery {
  /** Nama material/sumber daya AHSP */
  materialName: string;
  /** Spesifikasi teknis (kategori + atribut kunci) */
  spec: MaterialSpec;
  /** Satuan dasar kebutuhan AHSP, mis. 'kg' */
  baseUnit: string;
  /** Wilayah harga (opsional) */
  region?: string;
  /** Batas jumlah kandidat */
  limit?: number;
}

/** Satu kandidat mentah dari provider (belum dinilai). */
export interface RawMarketCandidate {
  /** Nama produk sebagaimana tercantum di sumber */
  productName: string;
  /** Nama toko/penjual */
  sellerName: string;
  /** URL halaman produk (bukti) */
  productUrl: string;
  /** Harga tertera */
  listedPrice: number;
  /** Satuan penjualan (mis. 'kg', 'dus', 'sak') */
  saleUnit: string;
  /** Isi kemasan: jumlah */
  packageQuantity?: number | null;
  /** Isi kemasan: satuan isi (mis. 'kg', 'pcs') */
  packageContentUnit?: string | null;
  /** Merek (jika tercantum) */
  brand?: string;
  /** Spesifikasi tambahan dari halaman produk */
  specAttributes?: Record<string, string | number>;
  /** Tanggal harga diambil/dilihat */
  observedAt: string; // ISO date
  /** Lokasi/region harga */
  region?: string;
  /** Ketersediaan (in_stock / out_of_stock / unknown) */
  availability?: 'in_stock' | 'out_of_stock' | 'unknown';
}

/** Hasil pencarian dari provider. */
export interface MarketSearchResult {
  /** Kandidat mentah yang ditemukan */
  candidates: RawMarketCandidate[];
  /** Apakah provider benar-benar mengakses sumber live */
  isLive: boolean;
  /** Waktu pencarian */
  searchedAt: string;
  /** Catatan keterbatasan (mis. "hasil dari cache 7 hari") */
  limitations?: string;
  /** Error jika pencarian gagal */
  error?: string;
}

/** Kemampuan provider (untuk transparansi). */
export interface ProviderCapabilities {
  /** Nama provider */
  name: string;
  /** Apakah mengakses sumber live saat ini */
  supportsLiveSearch: boolean;
  /** Wilayah yang dicakup */
  regions: string[];
  /** Jenis sumber (toko/marketplace/katalog) */
  sourceTypes: string[];
  /** Keterbatasan yang diketahui */
  limitations: string[];
}

/**
 * Interface provider pencarian harga pasar.
 * Implementasi nyata harus mengembalikan isLive=true hanya jika
 * benar-benar mengakses sumber live yang dapat diverifikasi.
 */
export interface MarketSearchProvider {
  readonly capabilities: ProviderCapabilities;
  search(query: MarketSearchQuery): Promise<MarketSearchResult>;
}

/**
 * Provider "tidak tersedia" — mengembalikan hasil kosong dengan jujur,
 * bukan data tiruan. Digunakan hingga provider nyata terhubung dan teruji.
 */
export class UnavailableSearchProvider implements MarketSearchProvider {
  readonly capabilities: ProviderCapabilities = {
    name: 'unavailable',
    supportsLiveSearch: false,
    regions: [],
    sourceTypes: [],
    limitations: [
      'Tidak ada provider pencarian pasar yang terhubung.',
      'Kandidat harga masuk via input manual ber-URL atau saran AI.',
      'Jangan mengklaim pencarian live sebelum provider nyata diuji.',
    ],
  };

  async search(_query: MarketSearchQuery): Promise<MarketSearchResult> {
    return {
      candidates: [],
      isLive: false,
      searchedAt: new Date().toISOString(),
      limitations: 'Provider pencarian belum tersedia. Gunakan input manual atau saran AI.',
    };
  }
}

/** Registry provider (untuk injeksi implementasi nyata di masa depan). */
class ProviderRegistry {
  private provider: MarketSearchProvider = new UnavailableSearchProvider();

  register(p: MarketSearchProvider): void {
    this.provider = p;
  }

  get(): MarketSearchProvider {
    return this.provider;
  }

  isLiveAvailable(): boolean {
    return this.provider.capabilities.supportsLiveSearch;
  }
}

export const marketSearchRegistry = new ProviderRegistry();

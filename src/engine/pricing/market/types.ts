/**
 * EZRAB Market Price Intelligence — Tahap 1 (Tahap 1: audit & pencarian terkontrol)
 * ============================================================================
 * Model data referensi harga pasar material konstruksi.
 *
 * PRINSIP KEJUJURAN:
 * - Referensi pasar TIDAK PERNAH menjadi harga resmi AHSP/HSD.
 * - MARKET_VERIFIED = spesifikasi+satuan+sumber terverifikasi MANUSIA, tetap
 *   berlabel harga pasar, bukan harga resmi.
 * - Tidak ada integrasi marketplace otomatis di tahap ini. Kandidat masuk via
 *   input manual ber-URL bukti atau saran AI yang SELALU berstatus
 *   MARKET_REFERENCE/NEEDS_REVIEW (tidak pernah otomatis VERIFIED).
 * - Harga null tidak pernah menjadi 0; kegagalan pencarian tidak menghapus
 *   referensi tersimpan yang valid.
 */

export type MarketReferenceStatus =
  | 'MARKET_REFERENCE' // ditemukan, belum cukup diverifikasi
  | 'NEEDS_REVIEW' // spesifikasi/satuan belum meyakinkan
  | 'MARKET_VERIFIED' // diverifikasi estimator manusia (tetap: harga PASAR)
  | 'REJECTED'; // ditolak estimator (duplikat/tidak sebanding/palsu)

export type MarketPriceType = 'normal' | 'promo' | 'grosir' | 'member';

export type MarketSourceType =
  | 'toko_bangunan' // Mitra10, Depo Bangunan, toko resmi
  | 'marketplace' // Shopee, Tokopedia, dll (via input terverifikasi)
  | 'distributor' // distributor/supplier terverifikasi
  | 'ai_suggested' // saran AI — SELALU butuh verifikasi manusia
  | 'manual'; // input manual estimator ber-URL bukti

/** Atribut spesifikasi kanonis per kategori material. */
export interface MaterialSpec {
  /** Kategori kanonis: paku | semen | besi_beton | pasir | multipleks | cat | pipa | ... */
  category: string;
  /** Atribut kunci yang WAJIB cocok agar sebanding, mis. { panjang_cm: 5 } */
  keyAttributes: Record<string, string | number>;
  /** Atribut tambahan informatif (merek, tipe, mutu, ...) */
  extraAttributes?: Record<string, string | number>;
}

/** Satu referensi harga pasar: identitas + riwayat sendiri. */
export interface MarketPriceReference {
  id: string;
  /** Identitas material */
  materialId: string | null; // tautan ke resource kanonis bila diketahui
  canonicalName: string;
  aliases: string[];
  spec: MaterialSpec;
  /**
   * Spec KEBUTUHAN saat referensi didaftarkan (untuk re-validasi saat
   * approve — referensi harus cocok dengan kebutuhan, bukan dengan dirinya).
   */
  needSpec: MaterialSpec;
  /** Sumber */
  sourceName: string;
  sourceType: MarketSourceType;
  sourceProductId: string | null;
  productUrl: string | null; // bukti wajib untuk MARKET_VERIFIED
  sellerName: string | null;
  brand: string | null;
  productTitle: string;
  /** Harga & satuan */
  listedPrice: number; // harga tertera (selalu > 0)
  currency: 'IDR';
  packageQuantity: number | null; // isi kemasan, mis. 1
  packageUnit: string | null; // satuan kemasan, mis. 'dus'
  normalizedUnit: string; // satuan dasar hasil normalisasi, mis. 'kg'
  normalizedUnitPrice: number | null; // harga per satuan dasar; null bila tak dapat dinormalisasi
  priceType: MarketPriceType;
  region: string | null;
  availability: 'tersedia' | 'habis' | 'tidak_diketahui';
  /** Verifikasi */
  verificationStatus: MarketReferenceStatus;
  matchConfidence: number; // 0..1
  reviewNotes: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  /** Audit */
  capturedAt: string; // ISO
  lastVerifiedAt: string | null;
  createdBy: string;
  version: number;
}

/** Entri riwayat: perubahan harga / status tidak pernah menghapus versi lama. */
export interface MarketPriceHistoryEntry {
  id: string;
  referenceId: string;
  changedAt: string;
  changedBy: string;
  changeKind: 'created' | 'price_updated' | 'status_changed' | 'spec_corrected';
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
}

/** Kandidat mentah sebelum masuk sebagai referensi. */
export interface MarketPriceCandidate {
  canonicalName: string;
  spec: MaterialSpec;
  sourceName: string;
  sourceType: MarketSourceType;
  sourceProductId?: string | null;
  productUrl?: string | null;
  sellerName?: string | null;
  brand?: string | null;
  productTitle: string;
  listedPrice: number;
  packageQuantity?: number | null;
  packageUnit?: string | null;
  priceType?: MarketPriceType;
  region?: string | null;
  availability?: MarketPriceReference['availability'];
}

/** Hasil pencocokan kandidat terhadap kebutuhan AHSP. */
export interface MatchResult {
  candidate: MarketPriceCandidate | MarketPriceReference;
  /** true bila atribut kunci cocok & satuan dapat dinormalisasi */
  comparable: boolean;
  matchConfidence: number; // 0..1
  blockers: string[]; // alasan tidak sebanding (mis. "panjang paku 7cm ≠ 5cm")
  normalizedUnitPrice: number | null;
  normalizedUnit: string | null;
}

/** Statistik atas referensi yang sebanding & terverifikasi. */
export interface MarketPriceStats {
  count: number;
  comparableCount: number;
  min: number | null;
  median: number | null;
  max: number | null;
  unit: string | null;
  /** true bila data belum cukup untuk statistik layak */
  insufficientData: boolean;
  insufficientReason: string | null;
}

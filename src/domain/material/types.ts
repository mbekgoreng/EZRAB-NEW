/**
 * EZRAB — MATERIAL & HARGA DATABASE INDONESIA 2026
 * Master Domain Contracts & Type Definitions
 * 
 * Centralized Construction Material Price Knowledge Base for:
 * - RAB, BOQ, AHSP, Volume Calculator, Template RAB
 * - Price Resolution Engine, DED -> RAB, Project Finance, Chatbox
 */

// ============================================================================
// 1. SECTORS (10 Sektor Konstruksi Nasional Sesuai Spesifikasi Master)
// ============================================================================
export type ConstructionSector =
  | 'BANGUNAN'        // Gedung, Perumahan, Komersial, Fasilitas Publik
  | 'JALAN'            // Perkerasan Lentur (Hotmix), Kaku (Rigid), Tanah Dasar, Perlengkapan Jalan
  | 'DRAINASE'         // U-Ditch, Box Culvert, Gorong-gorong, Manhole
  | 'JEMBATAN'         // Girder Pracetak (PCI), Baja Struktural, Elastomeric Bearing Pad
  | 'IRIGASI'          // Saluran Primer/Sekunder, Pintu Air Sorong/Otomatis, Lining Beton/Geomembrane
  | 'SUNGAI'           // Tanggul, Bronjong (Gabion), Sheet Pile (Turap Baja/Beton), Riprap
  | 'BENDUNG'          // Mercu Bendung, Kolam Olak, Pintu Penguras, Stoplog
  | 'EMBUNG'           // Kolam Retensi, Geomembrane Liner, Struktur Pelimpah/Inlet/Outlet
  | 'BENDUNGAN'        // Urugan Batu/Tanah, Inti Kedap Air, Riprap Pelindung Lereng, Spillway
  | 'BANGUNAN_AIR';    // IPA (WTP), Intake, Reservoir, Rumah Pompa, Waterstop Dilatasi

export interface SectorMetadata {
  id: ConstructionSector;
  name: string;
  icon: string;
  description: string;
  typicalCategories: string[];
}

// ============================================================================
// 2. PRICE TYPES, TIERS & STATUSES
// ============================================================================
export type PriceType =
  | 'RETAIL'
  | 'WHOLESALE'
  | 'PROJECT'
  | 'SUPPLIER'
  | 'DISTRIBUTOR'
  | 'MARKET_REFERENCE'
  | 'GOVERNMENT_REFERENCE'
  | 'USER_DEFINED';

export type PriceTier =
  | 'ECONOMY'
  | 'STANDARD'
  | 'PROFESSIONAL'
  | 'PREMIUM'
  | 'LUXURY';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'EXPIRED';

export type PriceFreshness =
  | 'CURRENT'         // 0 - 30 hari
  | 'AGING'           // 31 - 90 hari
  | 'EXPIRED'         // > 90 hari
  | 'UNKNOWN';

export type PriceSourceType =
  | 'MANUFACTURER'
  | 'OFFICIAL_MANUFACTURER'
  | 'DISTRIBUTOR'
  | 'OFFICIAL_DISTRIBUTOR'
  | 'AUTHORIZED_SUPPLIER'
  | 'GOVERNMENT_PUPR'
  | 'GOVERNMENT_REFERENCE'
  | 'MARKETPLACE'
  | 'VERIFIED_RETAILER'
  | 'PROJECT_SUPPLIER'
  | 'PROJECT_PRICE'
  | 'HISTORICAL_EZRAB'
  | 'USER_INPUT'
  | 'USER_PRICE'
  | 'EZRAB_DATABASE'
  | 'MARKET_REFERENCE'
  | 'WEB_REFERENCE';

export type BrandCoverageStatus = 'VERIFIED' | 'PARTIAL' | 'NOT_YET_COVERED';

// ============================================================================
// 3. REGION & GEOGRAPHY HIERARCHY
// ============================================================================
export interface RegionHierarchy {
  country: 'Indonesia';
  province: string;
  regency?: string;     // Kabupaten
  city?: string;        // Kota
  district?: string;    // Kecamatan
}

export interface RegionMaster {
  id: string;
  code: string;         // e.g. 'ID-JI-SBY'
  name: string;
  province: string;
  regencyOrCity: string;
  type: 'KOTA' | 'KABUPATEN' | 'PROVINSI';
  costIndexVsJakarta: number; // 1.00 = DKI Jakarta
  description?: string;
  provincesOrCities: string[];
}

// ============================================================================
// 4. SUPPLIER ENTITY
// ============================================================================
export interface SupplierMaster {
  id: string;
  name: string;
  type: 'MANUFACTURER' | 'DISTRIBUTOR' | 'AUTHORIZED_SUPPLIER' | 'PROJECT_SUPPLIER' | 'RETAILER';
  province: string;
  regency?: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  rating?: number;
  verified: boolean;
  lastVerifiedAt?: string;
}

// ============================================================================
// 5. BRAND HIERARCHY
// ============================================================================
export interface BrandMaster {
  id: string;
  name: string;
  canonicalBrand: string;
  aliases: string[];
  countryOfOrigin?: string;
  coverageStatus: BrandCoverageStatus;
  productLines: string[];
  website?: string;
  notes?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  specification: string;
  grade?: string;
  unit: string;
}

export interface ProductMaster {
  id: string;
  brandId: string;
  brandName: string;
  name: string;
  productLine?: string;
  category: string;
  sector: ConstructionSector;
  variants: ProductVariant[];
  standards?: string[]; // SNI, ASTM, JIS, ISO
}

// ============================================================================
// 6. MATERIAL MASTER & SPECIFICATIONS
// ============================================================================
export interface MaterialMaster {
  id: string;
  materialCode: string;   // Deterministic e.g. MAT-BLD-CEM-0001
  name: string;
  category: string;
  subcategory?: string;
  sector: ConstructionSector;
  description?: string;
  unit: string;
  baseUnit?: string;
  salesUnit?: string;
  conversionFactor?: number; // e.g. 1 batang = 4 meter -> conversionFactor = 4
  brand?: string;
  product?: string;
  variant?: string;
  specification: string;
  grade?: string;
  standard?: string;      // SNI, ASTM, PUPR
  origin?: string;
  priceTier?: PriceTier;
  coveragePerUnit?: number;
  defaultWastePercent?: number;
  active: boolean;
  aliases?: string[];
  substitutes?: string[]; // IDs of alternative materials
  coverageStatus?: BrandCoverageStatus;
}

// ============================================================================
// 7. MATERIAL PRICE RECORD
// ============================================================================
export interface MaterialPrice {
  id: string;
  materialId: string;
  materialCode: string;
  materialName?: string;

  brandId?: string;
  brandName?: string;
  brand?: string;
  productId?: string;
  productName?: string;

  specificationId?: string;
  specification?: string;

  regionId: string;
  region: RegionHierarchy;

  supplierId?: string;
  supplierName?: string;

  price: number;
  currency: 'IDR';
  unit: string;

  priceType: PriceType;
  priceTier: PriceTier;

  taxIncluded: boolean;
  taxRate?: number;
  taxAmount?: number;

  deliveryIncluded: boolean;
  deliveryCost?: number;
  deliveryDistanceKm?: number;

  sourceType: PriceSourceType;
  sourceName: string;
  sourceUrl?: string;

  priceDate: string;
  sourceDate?: string;
  validFrom?: string;
  validUntil?: string;

  confidence: ConfidenceLevel;
  confidenceReasons?: string[];

  verificationStatus: VerificationStatus;
  freshness?: PriceFreshness;
  freshnessStatus?: PriceFreshness;
  lastVerifiedAt?: string;
  lastUpdatedAt?: string;
  nextReviewAt?: string;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 8. PRICE HISTORY & SUBSTITUTE
// ============================================================================
export interface MaterialPriceHistoryRecord {
  id: string;
  materialId: string;
  price: number;
  currency: 'IDR';
  unit: string;
  priceDate: string;
  region: string;
  sourceType: PriceSourceType;
  sourceName: string;
  changePercent?: number;
}

export interface MaterialSubstitute {
  id: string;
  primaryMaterialId?: string;
  sourceMaterialId?: string;
  substituteMaterialId?: string;
  targetMaterialId?: string;
  substituteMaterialName?: string;
  targetMaterialName?: string;
  compatibilityScore: number; // 0 - 100 or 0.0 - 1.0
  notes?: string;
  reason?: string;
  differenceSummary?: string;
  priceDifferencePercent?: number;
}

// ============================================================================
// 9. PRICE RESOLUTION ENGINE CONTRACTS
// ============================================================================
export interface PriceResolutionQuery {
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  name?: string;
  sector?: ConstructionSector;
  brand?: string;
  specification?: string;
  unit?: string;
  projectId?: string;
  regionName?: string;
  region?: {
    province?: string;
    regency?: string;
    city?: string;
  };
  priceDate?: string;
  preferredPriceType?: PriceType;
  preferredTier?: PriceTier;
  allowRegionalFallback?: boolean;
}

export interface PriceResolutionOutput {
  status: 'RESOLVED' | 'PRICE_NOT_FOUND' | 'PARTIAL_MATCH' | 'REGIONAL_FALLBACK';
  resolvedPrice?: MaterialPrice;
  price?: number;
  currency?: 'IDR';
  unit?: string;
  materialId?: string;
  materialName?: string;
  brand?: string;
  specification?: string;
  source?: {
    type: PriceSourceType | string;
    name: string;
    date: string;
    url?: string;
    supplier?: string;
  };
  regionMatch?: 'EXACT_CITY' | 'EXACT' | 'PROVINCE' | 'NEAREST_REGION' | 'NEAREST' | 'NATIONAL' | 'NONE';
  specificationMatch?: 'EXACT' | 'VARIANT' | 'CATEGORY_AVERAGE' | 'NONE';
  regionalFallback?: boolean;
  fallbackReason?: string;
  fallbackMessage?: string;
  confidence?: ConfidenceLevel;
  confidenceReasons?: string[];
  resolvedAtTier?: number;
  taxIncluded?: boolean;
  deliveryIncluded?: boolean;
  error?: string;
  explanation?: string;
  alternatives?: MaterialPrice[];
  priceRange?: {
    min: number;
    max: number;
    median: number;
  };
}

// ============================================================================
// 10. IMMUTABLE SNAPSHOT & ALERTS
// ============================================================================
export interface PriceSnapshot {
  id?: string;
  snapshotId?: string;
  rabId?: string;
  projectId?: string;
  capturedAt: string;
  databaseVersion: string;
  items: Array<{
    materialId: string;
    materialCode?: string;
    materialName: string;
    price: number;
    unit: string;
    sourceType?: string;
    sourceName?: string;
    priceDate?: string;
    regionName?: string;
  }>;
}

export interface PriceAlert {
  id: string;
  materialId: string;
  materialName: string;
  oldPrice?: number;
  previousPrice?: number;
  newPrice?: number;
  currentPrice?: number;
  percentageChange?: number;
  changePercent?: number;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  alertType?: 'PRICE_SPIKE' | 'PRICE_DROP' | 'EXPIRED' | 'UNVERIFIED';
  detectedAt: string;
  message: string;
}

// ============================================================================
// 11. DATABASE VERSION & KPI METRICS
// ============================================================================
export interface SectorCoverageReport {
  sector: ConstructionSector;
  totalMaterials: number;
  indexedMaterials: number;
  verifiedMaterials: number;
  coveragePercent: number;
}

export interface DataQualityReport {
  totalMaterials?: number;
  totalBrands?: number;
  totalSuppliers?: number;
  totalPriceRecords?: number;
  materialCompletenessPercent?: number;
  brandCompletenessPercent?: number;
  specificationCompletenessPercent?: number;
  regionCoveragePercent?: number;
  priceFreshnessPercent?: number;
  verifiedPricesCount?: number;
  currentPricesCount?: number;
  agingPricesCount?: number;
  expiredPricesCount?: number;
  sectorCoverage: SectorCoverageReport[];
  lastAuditDate?: string;
}

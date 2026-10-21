/**
 * EZRAB — Universal Construction Template & Estimation Engine Types
 * 
 * Defines schemas for:
 * - Multi-sector construction categories (Rumah, Jalan, Perkerasan, SDA, Gedung, Hotel, dll)
 * - 3-Tier Detail Level Engine (STANDARD, PROFESSIONAL, COMPREHENSIVE)
 * - Dynamic parameter definitions (NUMBER, TEXT, BOOLEAN, SELECT, MULTI_SELECT)
 * - Program Ruang (Space templates for architectural works)
 * - Work components, deterministic calculation rules, conditional rules & optional works
 * - Material Ecosystem (Decoupled Material from Price, Project Specifications, Coverage/Packaging)
 * - Traceable AHSP mappings & price resolver
 * - Template lifecycle, versioning, and user overrides
 */

import { RabItem } from './index';

export type TemplateCategory =
  | 'RUMAH_TINGGAL'
  | 'CUSTOM'
  | 'JALAN_TRANSPORTASI'
  | 'PERKERASAN'
  | 'SDA_IRIGASI'
  | 'GEDUNG'
  | 'BANGUNAN_TINGGI'
  | 'HOTEL_HOSPITALITY'
  | 'KESEHATAN'
  | 'PENDIDIKAN'
  | 'INDUSTRI'
  | 'UTILITAS'
  | 'LANDSCAPE_SITE'
  | 'MEP_SYSTEM'
  | 'RENOVASI_MAINTENANCE'
  | 'TEMPLATE_SAYA'
  // --- Katalog 180 (Fase B): kategori sektor baru, ditambahkan secara aditif ---
  | 'PONDASI_GEOTEKNIK'
  | 'JEMBATAN_STRUKTUR'
  | 'DRAINASE_SANITASI'
  | 'PEKERJAAN_TANAH'
  | 'STRUKTUR_BETON_BAJA'
  | 'FINISHING_INTERIOR'
  | 'ATAP_WATERPROOFING'
  | 'PERTANIAN_PERKEBUNAN'
  | 'PELABUHAN_PESISIR'
  | 'FASILITAS_OLAHRAGA'
  | 'DEMOLISI_REKONSTRUKSI';

/**
 * Status pemetaan AHSP sebuah komponen terhadap katalog AHSP 2026 kanonis
 * (officialAhspRepository). Dihitung pada saat generate — bukan klaim statis:
 * - VERIFIED        : kode ada di katalog kanonis, satuan lolos unit-gate, dan
 *                     resolver resmi menghasilkan komposisi FULL.
 * - MAPPED_UNPRICED : kode ada di katalog kanonis tetapi harga resmi belum
 *                     dapat dikomposisi penuh (PARTIAL/MISSING).
 * - UNIT_MISMATCH   : kode ada tetapi satuan komponen tidak kompatibel dengan
 *                     satuan resmi (fail-safe: harga resmi TIDAK dipakai).
 * - NEEDS_MAPPING   : kode tidak ditemukan di katalog kanonis AHSP 2026.
 * - NOT_APPLICABLE  : komponen memang tidak membawa kode AHSP.
 */
export type AhspMappingStatus =
  | 'VERIFIED'
  | 'MAPPED_UNPRICED'
  | 'UNIT_MISMATCH'
  | 'NEEDS_MAPPING'
  | 'NOT_APPLICABLE';

/** Ringkasan kejujuran harga satu hasil generate (Fase F.8). */
export interface TemplatePriceSummary {
  totalItems: number;
  /** Item berharga dari resolver resmi AHSP 2026 (komposisi FULL + unit-gate lolos). */
  officialCount: number;
  /** Item berharga referensi (seed template / material) — BUKAN harga resmi. */
  referenceCount: number;
  /** Item berharga dari template kustom pengguna. */
  manualCount: number;
  /** Item tanpa harga (unitPrice null — tidak pernah Rp0 karangan). */
  unpricedCount: number;
  /** Item berkode AHSP yang gagal gerbang resmi (NEEDS_MAPPING / UNIT_MISMATCH / MAPPED_UNPRICED). */
  mappingFailedCount: number;
  /** COMPLETE bila semua item berharga; PARTIAL bila ada item tanpa harga. */
  totalStatus: 'COMPLETE' | 'PARTIAL';
}

/** Kesiapan pemetaan AHSP satu template (dihitung dari katalog kanonis, tanpa komposisi harga). */
export interface TemplateMappingReadiness {
  totalComponents: number;
  verifiedCodeCount: number;
  needsMappingCount: number;
  noCodeCount: number;
  /** Persentase komponen yang kodenya terverifikasi kanonis + satuan kompatibel. */
  readinessPercent: number;
}

export interface TemplateValidationRule {
  id: string;
  description: string;
  /** Ekspresi kondisi sederhana atas parameter, mis. "road_width >= 3". */
  expression?: string;
  severity: 'ERROR' | 'WARNING';
}

export interface WorkPackage {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  componentIds?: string[];
  order?: number;
}

export type DetailLevel =
  | 'STANDARD'
  | 'PROFESSIONAL'
  | 'COMPREHENSIVE';

export type TemplateSource =
  | 'EZRAB_OFFICIAL'
  | 'USER_TEMPLATE'
  | 'USER'
  | 'PROJECT_CUSTOM';

export type ParameterInputType =
  | 'NUMBER'
  | 'TEXT'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT';

export interface ParameterOption {
  label: string;
  value: string | number | boolean;
}

export interface TemplateParameter {
  id: string;
  key: string;
  label: string;
  type: ParameterInputType;
  unit?: string;
  required: boolean;
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  options?: ParameterOption[];
  description?: string;
  group?: 'dimensions' | 'specifications' | 'general' | 'finishing' | 'mep' | 'scope';
}

export interface SpaceTemplate {
  id: string;
  name: string;
  category: string;
  quantityRule: string; // formula or number e.g. "3" or "num_bedrooms"
  targetArea?: number; // m2 per space
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
  components?: string[]; // component IDs associated with this space
  description?: string;
}

/**
 * Material Ecosystem Models
 * Core Rule: Material !== Price
 */
export interface MaterialItem {
  id: string;
  category: string; // e.g. "KERAMIK", "GRANIT", "CAT", "SEMEN", "BESI", "BAJA_RINGAN", "GENTENG", "PAVING", "BETON", "PIPA", "SANITARY", "ELEKTRIKAL", "PLAFON"
  name: string;
  brand?: string;
  product?: string;
  series?: string;
  specification: string;
  size?: string;
  unit: string; // e.g. "m2", "kg", "liter", "sak", "batang", "unit"
  supplier?: string;
  sku?: string;
  image?: string;
  documents?: string[];
  coveragePerUnit?: number; // e.g. 10 m2 / liter for paint
  defaultWastePercent?: number; // e.g. 5% or 10%
  packagingOptions?: string[]; // e.g. ['1 L', '2.5 L', '5 L', '20 L'] or ['50 kg/sak']
}

export interface MaterialPriceReference {
  id: string;
  materialId: string;
  unitPrice: number;
  supplier: string;
  location: string;
  effectiveDate: string;
}

export interface ProjectMaterialSpecification {
  projectId?: string;
  categoryDefaults: Record<string, string>; // category -> materialId
  itemOverrides: Record<string, {
    materialId: string;
    customWastePercent?: number;
    notes?: string;
  }>;
}

export interface UserOverrideRecord {
  field: string;
  originalValue: any;
  userValue: any;
  source: 'USER_OVERRIDE' | 'TEMPLATE_DEFAULT' | 'PROJECT_SPEC';
  updatedBy: string;
  updatedAt: string;
  reason?: string;
}

export interface ConstructionComponentTemplate {
  id: string;
  name: string;
  category: string; // e.g. "02. PEKERJAAN STRUKTUR", "04. PEKERJAAN DINDING", etc.
  subcategory?: string;
  wbsCode?: string;
  unit: string;
  detailLevel?: DetailLevel; // STANDARD | PROFESSIONAL | COMPREHENSIVE (default: PROFESSIONAL)
  calculationRule: string; // formula expression e.g. "length * width", "building_area * 1.05", "count * coefficient"
  variables: string[];
  ahspCode?: string;
  ahspName?: string;
  unitPrice?: number;
  priceSource?: 'OFFICIAL_AHSP' | 'REFERENCE_PRICE' | 'AI_CUSTOM';
  description?: string;
  isOptional?: boolean; // Toggable optional work item (e.g. AC, Water heater, Canopy, Pagar)
  condition?: string; // Conditional formula e.g. "num_floors >= 2", "electricity_source === 'PLN_BARU'", "paving_thickness >= 8"
  materialCategory?: string; // Link to Material Category (e.g. "KERAMIK", "CAT", "PAVING")
  defaultMaterialId?: string; // Default material link
  dependencies?: string[];
  overrides?: UserOverrideRecord[];
  /**
   * Katalog 180 (Fase D/F): status pemetaan yang DIDEKLARASIKAN saat authoring.
   * Status otoritatif selalu dihitung ulang saat generate terhadap katalog
   * kanonis; deklarasi ini hanya dokumentasi maksud author.
   */
  mappingStatus?: AhspMappingStatus;
  /** Catatan asal harga referensi (wajib jujur bila unitPrice bukan harga resmi). */
  priceNote?: string;
}

export interface CalculationRule {
  targetComponentId: string;
  formula: string;
  unit: string;
  variables: string[];
  description?: string;
}

export interface AhspMapping {
  componentId: string;
  ahspCode: string;
  ahspName: string;
  unit: string;
  basePrice: number;
  source: 'PUPR_2026' | 'BINA_MARGA' | 'SDA' | 'CUSTOM';
}

export interface TemplateMetadata {
  source: TemplateSource;
  version: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  isArchived?: boolean;
}

export interface RabTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  subcategory?: string;
  description: string;
  badge?: string;
  icon?: string;
  supportedDetailLevels?: DetailLevel[];
  defaultDetailLevel?: DetailLevel;
  parameters: TemplateParameter[];
  spaces?: SpaceTemplate[];
  workPackages?: WorkPackage[];
  components: ConstructionComponentTemplate[];
  calculationRules?: CalculationRule[];
  ahspMappings?: AhspMapping[];
  metadata: TemplateMetadata;
  // --- Katalog 180 (Fase D): skema komprehensif, semuanya opsional/aditif ---
  /** Asumsi yang melekat pada template (default parameter adalah asumsi, bukan fakta). */
  assumptions?: string[];
  /** Pekerjaan yang secara eksplisit TIDAK termasuk dalam lingkup template. */
  exclusions?: string[];
  /** Aturan validasi parameter/lingkup yang didokumentasikan untuk template ini. */
  validationRules?: TemplateValidationRule[];
  /** Versi skema formula perhitungan (terpisah dari metadata.version konten). */
  formulaVersion?: string;
  // Optional built-in generator function if available in code
  generateRabItems?: (params: Record<string, any>, detailLevel?: DetailLevel, optionalItemIds?: string[]) => RabItem[];
}

export interface TraceabilityRecord {
  itemId: string;
  itemNo: number;
  wbsCode: string;
  description: string;
  volume: number;
  unit: string;
  calculationTrace: string;
  ahspCode?: string;
  materialName?: string;
  // (Phase 2J: null = harga belum tersedia, bukan Rp0 — audit trail jujur.)
  unitPrice: number | null;
  amount: number | null;
  priceSource: string;
  /** Katalog 180 (Fase E/F): status pemetaan AHSP hasil gerbang resmi saat generate. */
  mappingStatus?: AhspMappingStatus;
  /** Katalog 180 (Fase E): status validasi volume (INVALID bila formula menghasilkan nilai tak hingga/negatif). */
  validationStatus?: 'VALID' | 'INVALID';
  /** Katalog 180 (Fase F): nama/dokumen sumber harga resmi bila OFFICIAL_AHSP. */
  priceSourceName?: string | null;
}

export interface GeneratedTemplateRabResult {
  templateId: string;
  templateName: string;
  templateVersion: string;
  detailLevel: DetailLevel;
  evaluatedParameters: Record<string, any>;
  selectedOptionalItemIds: string[];
  items: RabItem[];
  totalEstimate: number;
  itemCount: number;
  categorySummaries: Record<string, number>;
  materialSpecifications?: Record<string, string>;
  traceability?: TraceabilityRecord[];
  generatedAt: string;
  /** Katalog 180 (Fase F.8): ringkasan sumber harga hasil generate. */
  priceSummary?: TemplatePriceSummary;
  /** Katalog 180 (Fase E): INCOMPLETE_MISSING_PARAMS bila parameter wajib tanpa nilai & tanpa default. */
  generationStatus?: 'COMPLETE' | 'INCOMPLETE_MISSING_PARAMS';
  /** Katalog 180 (Fase E): kunci parameter wajib yang hilang (tanpa nilai pengguna & tanpa default). */
  missingRequiredParams?: string[];
}

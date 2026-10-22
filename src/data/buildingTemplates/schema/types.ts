/**
 * EZRAB AI Core — Building Template & Parametric Volume Engine Schema
 * Strict TypeScript Definitions & Quality Assurance Contracts
 */

export type BuildingCategory =
  | 'residential'
  | 'villa'
  | 'commercial'
  | 'public'
  | 'infrastructure'
  | 'drainage'
  | 'road'
  | 'bridge';

export type TemplateStatus = 'draft' | 'reviewed' | 'verified' | 'deprecated';

export type ParameterType =
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'string'
  | 'dimension'
  | 'area'
  | 'length'
  | 'height'
  | 'count';

export type WorkItemValidationStatus =
  | 'calculated'
  | 'assumed'
  | 'user_input_required'
  | 'needs_review'
  | 'blocked'
  | 'verified';

/**
 * REMEDIASI INTEGRITAS (S1–S4 + Fase 8): status harga per item yang dapat
 * ditelusur sampai ke sumbernya. Pemetaan ke kosakata audit:
 * - OFFICIAL         = VALIDATED — harga dari katalog AHSP resmi, satuan cocok.
 * - BENCHMARK        = NEEDS_REVIEW — harga tabel benchmark internal engine
 *                      (indikatif, wajib ditandai (est.), BUKAN harga resmi).
 * - UNIT_MISMATCH    = satuan kuantitas item tidak cocok dengan satuan tarif;
 *                      harga TIDAK diterapkan (tidak boleh dikalikan).
 * - AHSP_UNRESOLVED  = kode ditemukan di katalog resmi tetapi harga resminya
 *                      belum tersedia / kode ambigu antar-varian.
 * - PRICE_UNAVAILABLE= kode tidak terpetakan ke sumber harga valid mana pun;
 *                      harga null (di permukaan hasil: 0 + status ini), item
 *                      dikeluarkan dari total.
 */
export type ItemPriceStatus =
  | 'OFFICIAL'
  | 'BENCHMARK'
  | 'UNIT_MISMATCH'
  | 'AHSP_UNRESOLVED'
  | 'PRICE_UNAVAILABLE';

/** Item yang tidak dapat dihargai secara sah pada hasil generate. */
export interface UnpricedItemInfo {
  workItemId: string;
  wbsCode: string;
  name: string;
  ahspCode?: string;
  priceStatus: ItemPriceStatus;
  reason: string;
}

export type WorkItemCategoryGroup =
  | '01_PERSIAPAN'
  | '02_TANAH'
  | '03_PONDASI'
  | '04_STRUKTUR_BETON'
  | '05_DINDING'
  | '06_PLESTERAN_ACIAN'
  | '07_LANTAI'
  | '08_PLAFON'
  | '09_ATAP'
  | '10_KUSEN_PINTU_JENDELA'
  | '11_PENGECATAN'
  | '12_SANITASI'
  | '13_INSTALASI_AIR'
  | '14_INSTALASI_LISTRIK'
  | '15_INFRASTRUKTUR_JALAN'
  | '16_DRAINASE'
  | '17_PEKERJAAN_LUAR';

export interface TemplateParameter {
  name: string;
  label: string;
  type: ParameterType;
  unit?: string;
  required: boolean;
  defaultValue: any;
  min?: number;
  max?: number;
  allowedValues?: Array<string | number | boolean>;
  description: string;
  source: 'user_input' | 'template_default' | 'inferred';
  confidence: number;
  validationRule?: (val: any) => { valid: boolean; message?: string };
}

export interface TemplateAssumption {
  assumptionId: string;
  label: string;
  value: number | string | boolean;
  unit?: string;
  rationale: string;
  source: 'SNI' | 'PUPR' | 'BEST_PRACTICE' | 'EMPIRICAL_ESTIMATOR';
  confidence: number;
  editable: boolean;
  requiresConfirmation: boolean;
}

export interface TemplateSpace {
  id: string;
  name: string;
  defaultLength: number;
  defaultWidth: number;
  defaultArea: number;
  isWetArea?: boolean;
  ceilingHeight?: number;
}

export interface CalculationTrace {
  step: string;
  formulaString: string;
  substitutedValues: Record<string, any>;
  result: number;
  unit: string;
  notes?: string;
}


export interface VolumeCalculationResult {
  quantity: number;
  unit: string;
  formula: string;
  formulaInputs: Record<string, any>;
  dimensions?: Record<string, number>;
  assumptionsUsed: string[];
  status: WorkItemValidationStatus;
  confidence: number;
  requiresReview: boolean;
  warnings: string[];
  errors: string[];
  calculationTrace: CalculationTrace[];
}

export interface AHSPCandidate {
  ahspCode: string;
  name: string;
  source: 'CIPTA_KARYA_2026' | 'BINA_MARGA_2026' | 'SDA_2026' | 'CUSTOM';
  unit: string;
  matchScore: number;
  matchRationale: string;
  isRecommended: boolean;
  unitPriceEstimate?: number;
}

export interface TemplateWorkItem {
  stableId: string;
  wbsCode: string;
  name: string;
  category: WorkItemCategoryGroup;
  unit: string;
  quantityRule: (
    params: Record<string, any>,
    assumptions: Record<string, TemplateAssumption>,
    spaces: TemplateSpace[]
  ) => VolumeCalculationResult;
  requiredInputs: string[];
  optionalInputs?: string[];
  defaultAhspCode?: string;
  ahspCandidates: AHSPCandidate[];
  validationRules?: Array<(result: VolumeCalculationResult) => { valid: boolean; warning?: string }>;
}

export interface MasterBuildingTemplate {
  id: string;
  code: string;
  name: string;
  category: BuildingCategory;
  version: string;
  status: TemplateStatus;
  description: string;
  applicableProjectTypes: string[];
  units: {
    length: string;
    area: string;
    volume: string;
  };
  parameters: Record<string, TemplateParameter>;
  assumptions: Record<string, TemplateAssumption>;
  spaces: TemplateSpace[];
  structuralSystem: {
    foundation: string;
    superstructure: string;
    roofStructure: string;
  };
  materialSystem: {
    wall: string;
    floor: string;
    ceiling: string;
    roofCover: string;
  };
  workItems: TemplateWorkItem[];
  limitations: string[];
  sourceMetadata: {
    standardReference: string;
    lastUpdated: string;
    author: string;
  };
  reviewStatus: {
    isReviewed: boolean;
    reviewedBy?: string;
    reviewedDate?: string;
  };
}

export interface GeneratedWorkItemResult {
  workItemId: string;
  wbsCode: string;
  name: string;
  category: WorkItemCategoryGroup;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  ahspCode?: string;
  ahspName?: string;
  ahspSource?: string;
  /** Phase 3F: true if price is from benchmark/fallback, not official AHSP */
  isPriceFabricated?: boolean;
  /** Phase 3F: true if AHSP code was ambiguous */
  isPriceAmbiguous?: boolean;
  /**
   * REMEDIASI: status harga tertelusur per item. Bila status bukan OFFICIAL /
   * BENCHMARK, item tidak berharga: unitPrice/totalPrice tampil 0 di
   * permukaan hasil tetapi TIDAK PERNAH dihitung sebagai harga Rp0 yang sah —
   * aritmetika engine memperlakukannya sebagai null (tidak masuk total).
   */
  priceStatus?: ItemPriceStatus;
  /** Satuan tarif yang teresolusi (mis. 'm3'), null bila harga tak tersedia. */
  priceUnit?: string | null;
  formula: string;
  formulaInputs: Record<string, any>;
  dimensions?: Record<string, number>;
  assumptionsUsed: string[];
  status: WorkItemValidationStatus;
  confidence: number;
  requiresReview: boolean;
  warnings: string[];
  errors: string[];
  calculationTrace: CalculationTrace[];
}

export interface TemplateGenerationResult {
  templateId: string;
  templateCode: string;
  templateName: string;
  category: BuildingCategory;
  projectType: string;
  location: string;
  parametersUsed: Record<string, any>;
  assumptionsUsed: Record<string, TemplateAssumption>;
  workItems: GeneratedWorkItemResult[];
  categorySubtotals: Record<WorkItemCategoryGroup, number>;
  totalDirectCost: number;
  /** Phase 3F: Verified-only direct cost (excludes fabricated prices) */
  verifiedDirectCost?: number;
  /** Phase 3F: Fabricated direct cost (benchmark/fallback) */
  fabricatedDirectCost?: number;
  /** Phase 3F: Count of ambiguous items */
  ambiguousItemCount?: number;
  /** Phase 3G: VERIFIED | INDICATIVE | INCOMPLETE */
  totalStatus?: 'VERIFIED' | 'INDICATIVE' | 'INCOMPLETE';
  /** Phase 3G: Verified-only totals (only when totalStatus is VERIFIED) */
  verifiedOverheadAmount?: number;
  verifiedProfitAmount?: number;
  verifiedTaxAmount?: number;
  verifiedTotalRabCost?: number;
  overheadPercentage: number;
  overheadAmount: number;
  profitPercentage: number;
  profitAmount: number;
  taxPercentage: number;
  taxAmount: number;
  totalRabCost: number;
  costPerM2: number;
  confidenceScore: number;
  warnings: string[];
  errors: string[];
  isReadyForSpreadsheet: boolean;
  calculationTimestamp: string;
  /**
   * REMEDIASI (Fase 8): daftar item yang tidak berharga secara sah.
   * Bila tidak kosong, totalDirectCost/totalRabCost adalah TOTAL PARSIAL
   * dan totalStatus wajib 'INCOMPLETE'.
   */
  unpricedItems?: UnpricedItemInfo[];
  unpricedItemCount?: number;
  /**
   * REMEDIASI (Fase 5/S5): keterbatasan cakupan — dari template.limitations
   * ditambah catatan cakupan yang diturunkan engine (mis. kategori wajib
   * rumah tinggal yang tidak dimuat template sumber).
   */
  limitations?: string[];
}

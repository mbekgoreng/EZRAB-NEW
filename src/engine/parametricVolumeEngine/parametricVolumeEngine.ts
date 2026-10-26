import {
  MasterBuildingTemplate,
  TemplateGenerationResult,
  GeneratedWorkItemResult,
  WorkItemCategoryGroup,
  TemplateAssumption,
  WorkItemValidationStatus,
  ItemPriceStatus,
  UnpricedItemInfo,
} from '../../data/buildingTemplates/schema/types';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { isQuarantined } from '../../data/nationalCostDatabase/ahspQuarantine';
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';

export interface RegionalIndex {
  province: string;
  multiplier: number;
}

/**
 * REMEDIASI: hasil resolusi harga tertelusur. `unitPrice` null berarti harga
 * TIDAK tersedia dari sumber valid — null tidak pernah boleh diperlakukan
 * sebagai Rp0 yang sah di aritmetika mana pun.
 */
export interface UnitPriceResolution {
  unitPrice: number | null;
  ahspName: string | null;
  source: string | null;
  /** Satuan tarif (mis. 'm3', 'm2', 'm', 'unit', 'titik'); null bila tak ada tarif. */
  priceUnit: string | null;
  resolution: 'OFFICIAL' | 'BENCHMARK' | 'PRICE_UNAVAILABLE' | 'AHSP_UNRESOLVED';
  /** true bila harga berasal dari tabel benchmark internal (indikatif). */
  isFabricated: boolean;
  /** true bila kode resmi ambigu antar-varian. */
  isAmbiguous: boolean;
}

/**
 * REMEDIASI S1: normalisasi satuan untuk gerbang dimensional.
 * Mengembalikan kunci kanonik: 'm' (meter lari: m, m', m1), 'm2', 'm3',
 * 'kg', 'unit' (unit/buah), 'titik', 'set', 'ls', atau string mentah
 * ter-lowercase untuk satuan di luar keluarga yang dikenal.
 */
export function normalizeUnitForGate(raw: string | null | undefined): string {
  const u = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (u === 'm²' || u === 'm2') return 'm2';
  if (u === 'm³' || u === 'm3') return 'm3';
  if (u === 'm' || u === "m'" || u === 'm1' || u === 'm¹') return 'm';
  if (u === 'unit' || u === 'buah' || u === 'bh') return 'unit';
  if (u === 'titik') return 'titik';
  if (u === 'kg') return 'kg';
  if (u === 'set') return 'set';
  if (u === 'ls') return 'ls';
  return u;
}

/**
 * Keluarga satuan yang dimensinya dapat dibandingkan secara pasti.
 * Satuan di luar himpunan ini (termasuk 'ls' — lump sum memang dapat
 * mencakup satuan apa pun) TIDAK digerbang: ketidakcocokan tidak dapat
 * dibuktikan, jadi harga tidak diblokir atas dasar tebakan.
 */
const GATE_COMPARABLE_UNITS: ReadonlySet<string> = new Set(['m', 'm2', 'm3', 'kg', 'unit', 'titik', 'set']);

export const REGIONAL_PRICE_INDICES: Record<string, number> = {
  'DKI Jakarta': 1.00,
  'Jawa Barat': 0.95,
  'Banten': 0.96,
  'Jawa Tengah': 0.88,
  'DI Yogyakarta': 0.89,
  'Jawa Timur': 0.92,
  'Bali': 1.05,
  'Nusa Tenggara Barat': 1.08,
  'Nusa Tenggara Timur': 1.20,
  'Sumatera Utara': 1.02,
  'Sumatera Barat': 0.98,
  'Riau': 1.05,
  'Kepulauan Riau': 1.12,
  'Jambi': 0.98,
  'Sumatera Selatan': 0.97,
  'Bangka Belitung': 1.08,
  'Bengkulu': 0.98,
  'Lampung': 0.95,
  'Kalimantan Barat': 1.08,
  'Kalimantan Tengah': 1.10,
  'Kalimantan Selatan': 1.05,
  'Kalimantan Timur': 1.15,
  'Kalimantan Utara': 1.22,
  'IKN Nusantara': 1.18,
  'Sulawesi Utara': 1.10,
  'Sulawesi Tengah': 1.08,
  'Sulawesi Selatan': 1.02,
  'Sulawesi Tenggara': 1.12,
  'Gorontalo': 1.08,
  'Sulawesi Barat': 1.05,
  'Maluku': 1.25,
  'Maluku Utara': 1.28,
  'Papua': 1.45,
  'Papua Barat': 1.40,
  'Papua Selatan': 1.42,
  'Papua Tengah': 1.48,
  'Papua Pegunungan': 1.60,
  'Papua Barat Daya': 1.38,
};

export interface GenerateRabOptions {
  templateId: string;
  parameters?: Record<string, any>;
  assumptionOverrides?: Record<string, Partial<TemplateAssumption>>;
  region?: string;
  overheadPercentage?: number; // e.g. 5 for 5%
  profitPercentage?: number;   // e.g. 5 for 5%
  taxPercentage?: number;      // e.g. 11 for 11% PPN
  projectType?: string;
  location?: string;
}

export interface ValidationResult {
  valid: boolean;
  sanitizedParameters: Record<string, any>;
  errors: string[];
  warnings: string[];
}

export class ParametricVolumeEngine {
  /**
   * Validasi parameter input terhadap skema template
   */
  public validateParameters(
    template: MasterBuildingTemplate,
    inputParams: Record<string, any> = {}
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedParameters: Record<string, any> = {};

    for (const [paramName, paramDef] of Object.entries(template.parameters)) {
      let val = inputParams[paramName];

      if (val === undefined || val === null || val === '') {
        if (paramDef.required) {
          if (paramDef.defaultValue !== undefined) {
            val = paramDef.defaultValue;
            warnings.push(`Parameter '${paramDef.label}' tidak diisi, menggunakan default: ${paramDef.defaultValue}`);
          } else {
            errors.push(`Parameter wajib '${paramDef.label}' (${paramName}) belum diisi.`);
            continue;
          }
        } else {
          val = paramDef.defaultValue;
        }
      }

      // Type checks & sanitization
      if (['number', 'dimension', 'area', 'length', 'height'].includes(paramDef.type)) {
        const numVal = Number(val);
        if (isNaN(numVal) || !isFinite(numVal)) {
          errors.push(`Parameter '${paramDef.label}' harus berupa angka valid.`);
          continue;
        }
        if (numVal <= 0 && paramDef.required) {
          errors.push(`Parameter '${paramDef.label}' harus lebih besar dari 0 (nilai: ${numVal}).`);
          continue;
        }
        if (paramDef.min !== undefined && numVal < paramDef.min) {
          warnings.push(`Parameter '${paramDef.label}' (${numVal}) di bawah batas minimum yang disarankan (${paramDef.min}).`);
        }
        if (paramDef.max !== undefined && numVal > paramDef.max) {
          warnings.push(`Parameter '${paramDef.label}' (${numVal}) di atas batas maksimum yang disarankan (${paramDef.max}).`);
        }
        val = numVal;
      } else if (paramDef.type === 'integer' || paramDef.type === 'count') {
        const intVal = parseInt(val, 10);
        if (isNaN(intVal) || !isFinite(intVal)) {
          errors.push(`Parameter '${paramDef.label}' harus berupa bilangan bulat.`);
          continue;
        }
        if (intVal < 0) {
          errors.push(`Parameter '${paramDef.label}' tidak boleh bernilai negatif.`);
          continue;
        }
        if (paramDef.min !== undefined && intVal < paramDef.min) {
          warnings.push(`Parameter '${paramDef.label}' (${intVal}) di bawah minimum (${paramDef.min}).`);
        }
        if (paramDef.max !== undefined && intVal > paramDef.max) {
          warnings.push(`Parameter '${paramDef.label}' (${intVal}) di atas maksimum (${paramDef.max}).`);
        }
        val = intVal;
      } else if (paramDef.type === 'boolean') {
        val = Boolean(val);
      } else if (paramDef.type === 'enum') {
        if (paramDef.allowedValues && !paramDef.allowedValues.includes(val)) {
          errors.push(
            `Nilai '${val}' untuk '${paramDef.label}' tidak valid. Pilihan: ${paramDef.allowedValues.join(', ')}`
          );
          continue;
        }
      }

      // Custom validation rule if defined
      if (paramDef.validationRule) {
        const customRes = paramDef.validationRule(val);
        if (!customRes.valid) {
          errors.push(customRes.message || `Validasi gagal untuk parameter ${paramDef.label}`);
        }
      }

      sanitizedParameters[paramName] = val;
    }

    return {
      valid: errors.length === 0,
      sanitizedParameters,
      errors,
      warnings,
    };
  }

  /**
   * Resolve unit price for an AHSP code or candidate item
   *
   * Phase 3E: Ambiguous codes (multiple variants sharing one code) are NOT
   * silently resolved to the first match. If the input matches an ID exactly,
   * that specific variant is used. If the input is a code matching multiple
   * variants, the lookup falls through to benchmark rather than picking a
   * potentially wrong variant's price.
   *
   * Phase 3F: Returns price status indicators. Benchmark prices are marked
   * isFabricated=true and must NOT be presented as verified official prices.
   *
   * REMEDIASI S2 (menghapus fallback buta-satuan): TIDAK ADA lagi harga
   * bawaan Rp150.000 untuk kode tak dikenal. Kode yang tidak terpetakan ke
   * katalog resmi maupun tabel benchmark menghasilkan unitPrice = null
   * dengan resolution 'PRICE_UNAVAILABLE' — pemanggil wajib menandainya
   * PRICE_UNAVAILABLE dan mengeluarkannya dari total. Kode yang ditemukan
   * di katalog resmi tetapi harga resminya belum tersedia menghasilkan
   * 'AHSP_UNRESOLVED' (null), BUKAN diam-diam diganti benchmark.
   */
  public resolveUnitPrice(ahspCode: string, region: string = 'DKI Jakarta'): UnitPriceResolution {
    const multiplier = REGIONAL_PRICE_INDICES[region] || 1.0;
    const domainSource = (domain: string) =>
      domain === 'CIPTA_KARYA' ? 'CIPTA_KARYA_2026' : domain === 'BINA_MARGA' ? 'BINA_MARGA_2026' : 'SDA_2026';

    // Search official AHSP item
    // Phase 3E: First check for exact ID match (IDs are unique)
    // P0.1: item karantina tidak boleh menjadi harga OFFICIAL.
    const idMatch = ALL_OFFICIAL_AHSP_ITEMS.find((it) => it.id === ahspCode && !isQuarantined(it.code));
    if (idMatch) {
      if (idMatch.unitPrice && idMatch.unitPrice > 0) {
        return {
          unitPrice: Math.round(idMatch.unitPrice * multiplier),
          ahspName: idMatch.name,
          source: domainSource(idMatch.domain),
          priceUnit: idMatch.unit,
          resolution: 'OFFICIAL',
          isFabricated: false,
          isAmbiguous: false,
        };
      }
      // Item resmi ditemukan tetapi harga resminya belum tersedia (null).
      // Null di katalog resmi berarti PRICE_MISSING — bukan 0, bukan diganti.
      return {
        unitPrice: null,
        ahspName: idMatch.name,
        source: domainSource(idMatch.domain),
        priceUnit: idMatch.unit,
        resolution: 'AHSP_UNRESOLVED',
        isFabricated: false,
        isAmbiguous: false,
      };
    }

    // Phase 3E: For code lookup, check for ambiguity
    const codeMatches = ALL_OFFICIAL_AHSP_ITEMS.filter((it) => it.code === ahspCode && !isQuarantined(it.code));
    if (codeMatches.length === 1) {
      const officialItem = codeMatches[0];
      if (officialItem.unitPrice && officialItem.unitPrice > 0) {
        return {
          unitPrice: Math.round(officialItem.unitPrice * multiplier),
          ahspName: officialItem.name,
          source: domainSource(officialItem.domain),
          priceUnit: officialItem.unit,
          resolution: 'OFFICIAL',
          isFabricated: false,
          isAmbiguous: false,
        };
      }
      return {
        unitPrice: null,
        ahspName: officialItem.name,
        source: domainSource(officialItem.domain),
        priceUnit: officialItem.unit,
        resolution: 'AHSP_UNRESOLVED',
        isFabricated: false,
        isAmbiguous: false,
      };
    }
    // codeMatches.length > 1: ambiguous — do NOT pick first silently; fall
    // through to benchmark below with isAmbiguous=true (Phase 3E preserved).
    // codeMatches.length === 0: fall through to benchmark / unavailable.


    // Heuristic benchmark fallback price table based on official PUPR 2026 standards
    // REMEDIASI: setiap entri kini membawa `unit` tarif secara eksplisit
    // (diambil persis dari awalan nama item itu sendiri: '1 m3', '1 m2',
    // '1 m', '1 Unit', '1 Titik', '1 kg', '1 Set', '1 m1'). Field ini dipakai
    // gerbang satuan (UNIT_MISMATCH) — tarif tidak boleh dikalikan ke
    // kuantitas yang satuannya berbeda. Nilai harga TIDAK diubah.
    const AHSP_BENCHMARK_RATES: Record<string, { price: number; name: string; source: string; unit: string }> = {
      'A.2.2.1.1': { price: 28500, name: '1 m Pengukuran dan pemasangan bowplank', source: 'CIPTA_KARYA_2026', unit: 'm' },
      'A.2.2.1.9': { price: 8500, name: '1 m2 Membersihkan lapangan dan perataan', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.2.3.1.1': { price: 86500, name: '1 m3 Galian tanah biasa sedalam 1 m', source: 'CIPTA_KARYA_2026', unit: 'm3' },
      'A.2.3.1.9': { price: 29000, name: '1 m3 Pengurugan kembali galian tanah', source: 'CIPTA_KARYA_2026', unit: 'm3' },
      'A.2.3.1.11': { price: 245000, name: '1 m3 Pengurugan pasir urug padat', source: 'CIPTA_KARYA_2026', unit: 'm3' },
      'A.3.2.1.2': { price: 920000, name: '1 m3 Pasangan pondasi batu belah 1SP : 5PP', source: 'CIPTA_KARYA_2026', unit: 'm3' },
      'A.3.2.1.9': { price: 620000, name: '1 m3 Pasangan batu kosong (aanstamping)', source: 'CIPTA_KARYA_2026', unit: 'm3' },
      'A.4.1.1.1': { price: 890000, name: '1 m3 Membuat beton mutu f\'c = 7,4 MPa (K 100 / Bo)', source: 'CIPTA_KARYA_2026', unit: 'm3' },
      'A.4.1.1.4': { price: 1250000, name: '1 m3 Membuat beton mutu f\'c = 19.3 MPa (K 225)', source: 'CIPTA_KARYA_2026', unit: 'm3' },
      'A.4.1.1.5': { price: 1320000, name: '1 m3 Membuat beton mutu f\'c = 21.7 MPa (K 250)', source: 'CIPTA_KARYA_2026', unit: 'm3' },
      'A.4.1.1.17': { price: 16500, name: '1 kg Pembesian besi beton ulir / polos', source: 'CIPTA_KARYA_2026', unit: 'kg' },
      'A.4.1.1.20': { price: 195000, name: '1 m2 Pasang bekisting untuk sloof / kolom', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      // KOMPOSIT PASAR (perintah user 2026-10-27 — BUKAN harga resmi AHSP
      // 2026; mesin menandainya BENCHMARK/isFabricated → picker menampilkan
      // "(est.)" + PRICE_ESTIMATED). Sloof/kolom/ring balok tidak punya kode
      // tunggal resmi (harus dirakit beton+bekisting+pembesian), jadi tarif
      // per m3 dirakit dari komponen pasar saat ini: beton K-225
      // ~Rp1.050.000/m3 + bekisting ~Rp105.000/m2 + besi ~Rp14.000/kg.
      // Sloof 15/20: bekisting 2 sisi 13,33 m2 + besi ~112 kg per m3
      // ≈ Rp4.018.000 → dibulatkan Rp4.000.000. Kolom praktis & ring balok
      // 15/15: bekisting 13,33 m2 + besi ~149 kg per m3 ≈ Rp4.540.000 →
      // dibulatkan Rp4.500.000. Ketiganya di dalam rentang komposit pasar
      // yang teramati (Rp3,2–6,2 jt/m3). Source MARKET_ESTIMATE_2026
      // sengaja BEDA dari CIPTA_KARYA_2026 agar tak terbaca sebagai resmi.
      'A.4.1.1.28': { price: 4000000, name: '1 m3 Pembuatan sloof beton bertulang 15/20 K-225 (komposit)', source: 'MARKET_ESTIMATE_2026', unit: 'm3' },
      'A.4.1.1.35': { price: 4500000, name: '1 m3 Pembuatan kolom praktis beton bertulang 15/15 K-225 (komposit)', source: 'MARKET_ESTIMATE_2026', unit: 'm3' },
      'A.4.1.1.36': { price: 4500000, name: '1 m3 Pembuatan ring balok beton bertulang 15/15 K-225 (komposit)', source: 'MARKET_ESTIMATE_2026', unit: 'm3' },
      'A.4.4.1.1': { price: 142000, name: '1 m2 Pasang dinding bata ringan hebel t=10cm mortar instan', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.4.1.9': { price: 165000, name: '1 m2 Pasang dinding bata merah tebal 1/2 bata 1:5', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.4.2.2': { price: 48500, name: '1 m2 Plesteran 1:5 tebal 15 mm', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.4.2.27': { price: 34500, name: '1 m2 Acian semen / mortar instan', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.4.3.3': { price: 195000, name: '1 m2 Pasang lantai keramik 40x40 / 50x50 cm', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.4.3.4': { price: 265000, name: '1 m2 Pasang lantai homogeneous tile granit 60x60 cm', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.5.1.7': { price: 115000, name: '1 m2 Langit-langit gypsum board 9mm rangka hollow', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.5.2.3': { price: 185000, name: '1 m2 Rangka atap baja ringan profil C75/0.75', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.5.2.11': { price: 105000, name: '1 m2 Penutup atap genteng metal warna pasir', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.6.1.1': { price: 185000, name: '1 m Kusen pintu dan jendela aluminium 4 inch', source: 'CIPTA_KARYA_2026', unit: 'm' },
      'A.4.6.1.2': { price: 950000, name: '1 Unit Daun pintu panel kayu kamper / HPL solid', source: 'CIPTA_KARYA_2026', unit: 'unit' },
      'A.4.6.1.5': { price: 420000, name: '1 Unit Daun jendela kaca aluminium 5mm', source: 'CIPTA_KARYA_2026', unit: 'unit' },
      'A.4.7.1.10': { price: 32500, name: '1 m2 Pengecatan tembok interior 3 lapis', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.7.1.11': { price: 46000, name: '1 m2 Pengecatan tembok eksterior weathershield', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.4.7.1.1': { price: 28500, name: '1 m2 Pengecatan plafon gypsum', source: 'CIPTA_KARYA_2026', unit: 'm2' },
      'A.5.1.1.1': { price: 850000, name: '1 Unit Pasang kloset duduk porselen monoblok', source: 'CIPTA_KARYA_2026', unit: 'unit' },
      'A.5.1.1.19': { price: 38500, name: '1 m Pipa PVC tipe AW diameter 3/4 inch', source: 'CIPTA_KARYA_2026', unit: 'm' },
      'A.5.1.1.25': { price: 78500, name: '1 m Pipa PVC tipe D diameter 3 inch / 4 inch', source: 'CIPTA_KARYA_2026', unit: 'm' },
      'A.5.1.1.30': { price: 3200000, name: '1 Unit Bio Septic Tank 1000 Liter + Resapan', source: 'CIPTA_KARYA_2026', unit: 'unit' },
      'A.6.1.1.1': { price: 165000, name: '1 Titik Instalasi titik lampu & saklar kabel NYM 3x1.5', source: 'CIPTA_KARYA_2026', unit: 'titik' },
      'A.6.1.1.2': { price: 185000, name: '1 Titik Instalasi stop kontak kabel NYM 3x2.5', source: 'CIPTA_KARYA_2026', unit: 'titik' },
      'A.6.1.1.10': { price: 750000, name: '1 Set Panel MCB Box 4 Group + Pengaman', source: 'CIPTA_KARYA_2026', unit: 'set' },
      'BM.05.01': { price: 1450000, name: '1 m3 Lapis Pondasi Semen Tanah / Lean Concrete', source: 'BINA_MARGA_2026', unit: 'm3' },
      'BM.05.02': { price: 1850000, name: '1 m3 Perkerasan Beton Semen (Rigid Pavement)', source: 'BINA_MARGA_2026', unit: 'm3' },
      'SDA.01.01': { price: 485000, name: 'Pemasangan 1 m1 Saluran U-Ditch Pracetak', source: 'SDA_2026', unit: 'm' },
      'SDA.01.02': { price: 215000, name: 'Pemasangan 1 m1 Tutup / Cover U-Ditch Beton Pracetak', source: 'SDA_2026', unit: 'm' },
    };

    const benchmark = AHSP_BENCHMARK_RATES[ahspCode];
    if (benchmark) {
      return {
        unitPrice: Math.round(benchmark.price * multiplier),
        ahspName: benchmark.name,
        source: benchmark.source,
        priceUnit: benchmark.unit,
        resolution: 'BENCHMARK',
        // Phase 3F: Benchmark is an indicative estimate, not official AHSP price
        isFabricated: true,
        isAmbiguous: codeMatches.length > 1,
      };
    }

    // REMEDIASI S2: TIDAK ADA fallback harga bawaan. Konstanta generik
    // Rp150.000 ('parametric.borongan.default') DIHAPUS sebagai sumber harga
    // karena buta-satuan dan tidak tertelusur ke item mana pun. Kode yang
    // tidak terpetakan = harga belum tersedia (null).
    return {
      unitPrice: null,
      ahspName: null,
      source: null,
      priceUnit: null,
      resolution: 'PRICE_UNAVAILABLE',
      isFabricated: false,
      isAmbiguous: codeMatches.length > 1,
    };
  }

  /**
   * Main Generator Method: Generates complete RAB draft with calculation trace
   */
  public generateRABFromTemplate(options: GenerateRabOptions): TemplateGenerationResult {
    const {
      templateId,
      parameters = {},
      assumptionOverrides = {},
      region = 'DKI Jakarta',
      overheadPercentage = 5.0,
      profitPercentage = 5.0,
      taxPercentage = 11.0,
      projectType,
      location = region,
    } = options;

    const template = masterBuildingTemplateRegistry.getTemplateById(templateId);
    if (!template) {
      throw new Error(`Master Building Template with ID '${templateId}' not found.`);
    }

    // 1. Parameter Validation
    const valResult = this.validateParameters(template, parameters);
    if (!valResult.valid) {
      throw new Error(`Parameter validation failed:\n- ${valResult.errors.join('\n- ')}`);
    }

    const sanitizedParams = valResult.sanitizedParameters;

    // 2. Merged Assumptions
    const mergedAssumptions: Record<string, TemplateAssumption> = {};
    for (const [key, defaultAssump] of Object.entries(template.assumptions)) {
      if (assumptionOverrides[key]) {
        mergedAssumptions[key] = {
          ...defaultAssump,
          ...assumptionOverrides[key],
          source: 'EMPIRICAL_ESTIMATOR',
          confidence: 0.95,
        };
      } else {
        mergedAssumptions[key] = { ...defaultAssump };
      }
    }

    // 3. Work Item Generation & Deterministic Volume Calculation
    const generatedWorkItems: GeneratedWorkItemResult[] = [];
    const categorySubtotals: Record<WorkItemCategoryGroup, number> = {
      '01_PERSIAPAN': 0,
      '02_TANAH': 0,
      '03_PONDASI': 0,
      '04_STRUKTUR_BETON': 0,
      '05_DINDING': 0,
      '06_PLESTERAN_ACIAN': 0,
      '07_LANTAI': 0,
      '08_PLAFON': 0,
      '09_ATAP': 0,
      '10_KUSEN_PINTU_JENDELA': 0,
      '11_PENGECATAN': 0,
      '12_SANITASI': 0,
      '13_INSTALASI_AIR': 0,
      '14_INSTALASI_LISTRIK': 0,
      '15_INFRASTRUKTUR_JALAN': 0,
      '16_DRAINASE': 0,
      '17_PEKERJAAN_LUAR': 0,
    };

    let totalDirectCost = 0;
    // Phase 3F: Track verified vs fabricated costs separately.
    // Fabricated = benchmark fallback or Rp150.000 default (not official AHSP).
    let verifiedDirectCost = 0;
    let fabricatedDirectCost = 0;
    let ambiguousItemCount = 0;
    // REMEDIASI Fase 8: item yang tidak dapat dihargai secara sah.
    const unpricedItems: UnpricedItemInfo[] = [];
    const allWarnings: string[] = [...valResult.warnings];
    const allErrors: string[] = [];

    for (const item of template.workItems) {
      // Execute deterministic quantity rule
      let volRes;
      try {
        volRes = item.quantityRule(sanitizedParams, mergedAssumptions, template.spaces);
      } catch (err: any) {
        volRes = {
          quantity: 0,
          unit: item.unit,
          formula: 'ERROR_IN_CALCULATION',
          formulaInputs: {},
          assumptionsUsed: [],
          status: 'blocked' as WorkItemValidationStatus,
          confidence: 0,
          requiresReview: true,
          warnings: [],
          errors: [`Error calculating volume: ${err?.message || String(err)}`],
          calculationTrace: [],
        };
      }

      // Safety checks: No NaN, Infinity, negative volumes
      let quantity = volRes.quantity;
      if (isNaN(quantity) || !isFinite(quantity) || quantity < 0) {
        allErrors.push(`Work item '${item.name}' produced invalid quantity: ${quantity}`);
        volRes.errors.push(`Invalid quantity: ${quantity}`);
        volRes.status = 'blocked';
        quantity = 0;
      }

      // Resolve AHSP and Unit Price
      const defaultAhsp = item.defaultAhspCode || (item.ahspCandidates[0]?.ahspCode ?? 'CUSTOM.01');
      const resolution = this.resolveUnitPrice(defaultAhsp, region);
      const { ahspName, source: ahspSource, isFabricated, isAmbiguous } = resolution;

      // REMEDIASI S1 — GERBANG SATUAN (UNIT_MISMATCH): tarif hanya boleh
      // dikalikan ke kuantitas bila satuan tarif dan satuan kuantitas berada
      // dalam keluarga dimensional yang sama. Ketidakcocokan yang terbukti
      // (mis. kuantitas m² x tarif Rp/m³) membuat harga TIDAK diterapkan —
      // item menjadi UNIT_MISMATCH dan dikeluarkan dari total. Gerbang hanya
      // memblokir bila kedua satuan dikenal pasti (lihat GATE_COMPARABLE_UNITS).
      const quantityUnitKey = normalizeUnitForGate(volRes.unit || item.unit);
      const priceUnitKey = resolution.priceUnit ? normalizeUnitForGate(resolution.priceUnit) : null;
      const unitMismatch =
        resolution.unitPrice !== null &&
        priceUnitKey !== null &&
        GATE_COMPARABLE_UNITS.has(quantityUnitKey) &&
        GATE_COMPARABLE_UNITS.has(priceUnitKey) &&
        quantityUnitKey !== priceUnitKey;

      const priceStatus: ItemPriceStatus = unitMismatch
        ? 'UNIT_MISMATCH'
        : resolution.resolution === 'OFFICIAL'
          ? 'OFFICIAL'
          : resolution.resolution === 'BENCHMARK'
            ? 'BENCHMARK'
            : resolution.resolution === 'AHSP_UNRESOLVED'
              ? 'AHSP_UNRESOLVED'
              : 'PRICE_UNAVAILABLE';

      // Harga efektif: null (tak berharga) diperlakukan sebagai TIDAK ADA
      // harga di seluruh aritmetika — bukan Rp0 yang sah. Di permukaan hasil
      // item tampil unitPrice/totalPrice 0 + priceStatus eksplisit, sesuai
      // konvensi konsumen existing (`unitPrice > 0` = berharga).
      const effectiveUnitPrice: number | null = unitMismatch ? null : resolution.unitPrice;
      const totalPrice = effectiveUnitPrice !== null ? Math.round(quantity * effectiveUnitPrice) : 0;

      if (categorySubtotals[item.category] !== undefined) {
        categorySubtotals[item.category] += totalPrice;
      } else {
        categorySubtotals[item.category] = totalPrice;
      }

      totalDirectCost += totalPrice;

      // Phase 3F: Separate verified vs fabricated costs.
      // Fabricated prices must NOT be presented as verified official totals.
      if (priceStatus === 'BENCHMARK') {
        fabricatedDirectCost += totalPrice;
        allWarnings.push(
          `FABRICATED_PRICE: "${item.name}" menggunakan harga ${isAmbiguous ? 'ambigu' : 'asumsi'} (${ahspSource}), bukan harga AHSP resmi terverifikasi.`
        );
      } else if (priceStatus === 'OFFICIAL') {
        verifiedDirectCost += totalPrice;
      }
      if (isAmbiguous) {
        ambiguousItemCount++;
      }

      // REMEDIASI Fase 8: item tak berharga tercatat eksplisit agar pemanggil
      // dapat membedakan total parsial dari total final.
      if (priceStatus === 'PRICE_UNAVAILABLE' || priceStatus === 'UNIT_MISMATCH' || priceStatus === 'AHSP_UNRESOLVED') {
        const reason =
          priceStatus === 'UNIT_MISMATCH'
            ? `Satuan kuantitas ${volRes.unit || item.unit} tidak cocok dengan satuan tarif ${resolution.priceUnit} untuk kode ${defaultAhsp}; harga tidak diterapkan.`
            : priceStatus === 'AHSP_UNRESOLVED'
              ? `Kode ${defaultAhsp} ditemukan di katalog resmi tetapi harga resminya belum tersedia.`
              : `Kode ${defaultAhsp} tidak terpetakan ke katalog AHSP resmi maupun tabel benchmark engine; harga belum tersedia.`;
        unpricedItems.push({
          workItemId: item.stableId,
          wbsCode: item.wbsCode,
          name: item.name,
          ahspCode: defaultAhsp,
          priceStatus,
          reason,
        });
        allWarnings.push(`${priceStatus}: "${item.name}" — ${reason} Item TIDAK dihitung ke total.`);
      }

      if (volRes.warnings && volRes.warnings.length > 0) {
        allWarnings.push(...volRes.warnings);
      }
      if (volRes.errors && volRes.errors.length > 0) {
        allErrors.push(...volRes.errors);
      }

      generatedWorkItems.push({
        workItemId: item.stableId,
        wbsCode: item.wbsCode,
        name: item.name,
        category: item.category,
        unit: item.unit,
        quantity,
        unitPrice: effectiveUnitPrice ?? 0,
        totalPrice,
        ahspCode: defaultAhsp,
        ahspName: ahspName ?? undefined,
        ahspSource: ahspSource ?? undefined,
        // Phase 3F: Price provenance per item
        isPriceFabricated: isFabricated,
        isPriceAmbiguous: isAmbiguous,
        // REMEDIASI: status harga tertelusur + satuan tarif teresolusi
        priceStatus,
        priceUnit: resolution.priceUnit,
        formula: volRes.formula,
        formulaInputs: volRes.formulaInputs,
        dimensions: volRes.dimensions,
        assumptionsUsed: volRes.assumptionsUsed,
        status: volRes.status,
        confidence: volRes.confidence,
        requiresReview:
          volRes.requiresReview ||
          priceStatus === 'PRICE_UNAVAILABLE' ||
          priceStatus === 'UNIT_MISMATCH' ||
          priceStatus === 'AHSP_UNRESOLVED',
        warnings: volRes.warnings,
        errors: volRes.errors,
        calculationTrace: volRes.calculationTrace,
      });
    }

    // 4. Financial Sums (Overhead, Profit, Tax)
    const overheadAmount = Math.round((totalDirectCost * overheadPercentage) / 100);
    const profitAmount = Math.round((totalDirectCost * profitPercentage) / 100);
    const subtotalWithOverheadProfit = totalDirectCost + overheadAmount + profitAmount;
    const taxAmount = Math.round((subtotalWithOverheadProfit * taxPercentage) / 100);
    const totalRabCost = subtotalWithOverheadProfit + taxAmount;

    // Building area or unit calculation for cost per unit
    const areaParam = sanitizedParams.buildingArea || sanitizedParams.pavementLength || sanitizedParams.drainageLength || 1;
    const costPerM2 = Math.round(totalRabCost / Number(areaParam));

    // Overall confidence calculation
    const avgConfidence =
      generatedWorkItems.length > 0
        ? generatedWorkItems.reduce((sum, item) => sum + item.confidence, 0) / generatedWorkItems.length
        : 1.0;

    // REMEDIASI Fase 8: total hanya boleh tampil final (VERIFIED/INDICATIVE)
    // bila SEMUA item berharga sah. Satu item tak berharga saja membuat
    // total menjadi PARSIAL -> 'INCOMPLETE', dengan daftarnya di unpricedItems.
    const hasBlockedOrError = generatedWorkItems.some(
      (w) => w.status === 'blocked' || (w.errors && w.errors.length > 0)
    );
    const hasUnresolvedTotal = hasBlockedOrError || ambiguousItemCount > 0 || unpricedItems.length > 0;
    const totalStatus: 'VERIFIED' | 'INDICATIVE' | 'INCOMPLETE' = hasUnresolvedTotal
      ? 'INCOMPLETE'
      : fabricatedDirectCost > 0
        ? 'INDICATIVE'
        : 'VERIFIED';
    const isVerifiedTotal = totalStatus === 'VERIFIED';
    // Phase 3G: verified-only overhead/profit/tax — only when VERIFIED.
    const vOverhead = Math.round((verifiedDirectCost * overheadPercentage) / 100);
    const vProfit = Math.round((verifiedDirectCost * profitPercentage) / 100);
    const vSubtotal = verifiedDirectCost + vOverhead + vProfit;
    const vTax = Math.round((vSubtotal * taxPercentage) / 100);

    // REMEDIASI Fase 5 (S5 — cakupan instalasi air): keterbatasan dari
    // template diteruskan apa adanya, ditambah catatan cakupan yang
    // diturunkan dari isi template. Untuk template rumah tinggal, kategori
    // 13_INSTALASI_AIR yang kosong dinyatakan sebagai keterbatasan cakupan —
    // item instalasi air TIDAK dikarang hanya agar terlihat lengkap.
    const limitations: string[] = [...(template.limitations ?? [])];
    if (
      template.category === 'residential' &&
      !template.workItems.some((i) => i.category === '13_INSTALASI_AIR')
    ) {
      const coverageNote =
        'Cakupan: instalasi air bersih dan air kotor (kategori 13_INSTALASI_AIR) BELUM termasuk dalam estimasi ini — template sumber belum memuat item instalasi air dengan formula dan pemetaan AHSP yang terverifikasi.';
      limitations.push(coverageNote);
      allWarnings.unshift(`KETERBATASAN CAKUPAN: ${coverageNote}`);
    }

    return {
      templateId: template.id,
      templateCode: template.code,
      templateName: template.name,
      category: template.category,
      projectType: projectType || template.applicableProjectTypes[0] || 'Konstruksi',
      location,
      parametersUsed: sanitizedParams,
      assumptionsUsed: mergedAssumptions,
      workItems: generatedWorkItems,
      categorySubtotals,
      totalDirectCost,
      // Phase 3F: Separate verified vs fabricated costs.
      // totalDirectCost includes both for backward compat, but consumers
      // MUST check verifiedDirectCost for verified official totals.
      verifiedDirectCost,
      fabricatedDirectCost,
      ambiguousItemCount,
      // Phase 3G: Explicit total status contract.
      // VERIFIED: all items have verified official prices, no ambiguity, no unresolved.
      // INDICATIVE: contains benchmark/assumption prices explicitly allowed as indicative estimate.
      // INCOMPLETE: has unresolved/ambiguous/unpriced items, total does not cover all required costs.
      totalStatus,
      // Phase 3G: Verified-only totals. Only populated when totalStatus is VERIFIED.
      // This ensures overhead/profit/tax inherit validity from base costs.
      // When not VERIFIED, these are undefined - consumers must not use
      // totalRabCost as a verified total.
      ...(isVerifiedTotal
        ? {
            verifiedOverheadAmount: vOverhead,
            verifiedProfitAmount: vProfit,
            verifiedTaxAmount: vTax,
            verifiedTotalRabCost: vSubtotal + vTax,
          }
        : {
            verifiedOverheadAmount: undefined as number | undefined,
            verifiedProfitAmount: undefined as number | undefined,
            verifiedTaxAmount: undefined as number | undefined,
            verifiedTotalRabCost: undefined as number | undefined,
          }),
      overheadPercentage,
      overheadAmount,
      profitPercentage,
      profitAmount,
      taxPercentage,
      taxAmount,
      totalRabCost,
      costPerM2,
      confidenceScore: Math.round(avgConfidence * 100) / 100,
      warnings: Array.from(new Set(allWarnings)),
      errors: Array.from(new Set(allErrors)),
      // REMEDIASI Fase 8: hasil parsial (ada item tak berharga) tidak boleh
      // dinyatakan siap final untuk spreadsheet.
      isReadyForSpreadsheet: allErrors.length === 0 && unpricedItems.length === 0,
      calculationTimestamp: new Date().toISOString(),
      // REMEDIASI Fase 8: daftar item tak berharga + hitungannya.
      unpricedItems,
      unpricedItemCount: unpricedItems.length,
      // REMEDIASI Fase 5: keterbatasan cakupan (template + turunan engine).
      limitations,
    };
  }

  /**
   * Universal Calculate interface for AI Engines and API
   */
  public calculate(options: {
    templateId: string;
    parameters?: Record<string, any>;
    province?: string;
    region?: string;
  }): {
    templateId: string;
    templateName: string;
    totalDirectCost: number;
    totalRabCost: number;
    items: Array<{
      name: string;
      volume: number;
      unit: string;
      unitPrice: number;
      totalPrice: number;
      ahspCode?: string;
      category?: string;
      wbsCode?: string;
      /** REMEDIASI: status harga tertelusur (unitPrice 0 + status non-OFFICIAL/BENCHMARK = belum ada harga). */
      priceStatus?: ItemPriceStatus;
    }>;
    categoryGroups: Array<{
      categoryName: string;
      items: Array<{
        name: string;
        volume: number;
        unit: string;
        unitPrice: number;
        totalPrice: number;
      }>;
    }>;
    generationResult: TemplateGenerationResult;
  } {
    const region = options.province || options.region || 'DKI Jakarta';
    const result = this.generateRABFromTemplate({
      templateId: options.templateId,
      parameters: options.parameters || {},
      region,
    });

    const categoryMap: Record<string, any[]> = {};
    const items = result.workItems.map((wi) => {
      const item = {
        name: wi.name,
        volume: wi.quantity,
        unit: wi.unit,
        unitPrice: wi.unitPrice,
        totalPrice: wi.totalPrice,
        ahspCode: wi.ahspCode,
        category: wi.category,
        wbsCode: wi.wbsCode,
        priceStatus: wi.priceStatus,
      };
      if (!categoryMap[wi.category]) {
        categoryMap[wi.category] = [];
      }
      categoryMap[wi.category].push(item);
      return item;
    });

    const categoryGroups = Object.entries(categoryMap).map(([cat, list]) => ({
      categoryName: cat,
      items: list,
    }));

    return {
      templateId: result.templateId,
      templateName: result.templateName,
      totalDirectCost: result.totalDirectCost,
      totalRabCost: result.totalRabCost,
      items,
      categoryGroups,
      generationResult: result,
    };
  }

  /**
   * Format result into standard EZRAB spreadsheet items (compatible with ProjectContext & EstimatorSpreadsheet)
   */
  public toRabItems(result: TemplateGenerationResult): any[] {
    return result.workItems.map((wi, index) => {
      // REMEDIASI Fase 8: spreadsheet tidak boleh menerima harga palsu.
      // Item tak berharga diteruskan dengan harga null (bukan 0 yang dapat
      // terbaca sebagai harga sah) + priceStatus agar lapisan spreadsheet
      // menandainya PRICE_UNRESOLVED sebagaimana mestinya.
      const isPriced = wi.priceStatus === 'OFFICIAL' || wi.priceStatus === 'BENCHMARK';
      return {
        id: `rab-${wi.workItemId}-${Date.now()}-${index}`,
        wbsCode: wi.wbsCode,
        name: wi.name,
        category: wi.category,
        unit: wi.unit,
        volume: wi.quantity,
        unitPrice: isPriced ? wi.unitPrice : null,
        totalPrice: isPriced ? wi.totalPrice : null,
        priceStatus: wi.priceStatus,
        ahspCode: wi.ahspCode,
        ahspName: wi.ahspName,
        formula: wi.formula,
        confidence: wi.confidence,
        requiresReview: wi.requiresReview,
        assumptionsUsed: wi.assumptionsUsed,
        calculationTrace: wi.calculationTrace,
      };
    });
  }
}

export const parametricVolumeEngine = new ParametricVolumeEngine();


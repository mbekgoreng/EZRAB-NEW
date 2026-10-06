import {
  MasterBuildingTemplate,
  TemplateGenerationResult,
  GeneratedWorkItemResult,
  WorkItemCategoryGroup,
  TemplateAssumption,
  WorkItemValidationStatus,
} from '../../data/buildingTemplates/schema/types';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { MASTER_PRICE_ITEMS } from '../../data/indonesianPrices';
// PHASE 1 (audit §16): record every fabricated price. Recording only — no value is changed.
import { recordFabricatedTotal } from '../pricing/telemetry/fabricatedPriceTelemetry';

export interface RegionalIndex {
  province: string;
  multiplier: number;
}

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
   */
  public resolveUnitPrice(ahspCode: string, region: string = 'DKI Jakarta'): { unitPrice: number; ahspName: string; source: string } {
    const multiplier = REGIONAL_PRICE_INDICES[region] || 1.0;

    // Search official AHSP item
    const officialItem = ALL_OFFICIAL_AHSP_ITEMS.find((it) => it.code === ahspCode || it.id === ahspCode);
    if (officialItem && officialItem.unitPrice && officialItem.unitPrice > 0) {
      return {
        unitPrice: Math.round(officialItem.unitPrice * multiplier),
        ahspName: officialItem.name,
        source: officialItem.domain === 'CIPTA_KARYA' ? 'CIPTA_KARYA_2026' : officialItem.domain === 'BINA_MARGA' ? 'BINA_MARGA_2026' : 'SDA_2026',
      };
    }


    // Heuristic benchmark fallback price table based on official PUPR 2026 standards
    const AHSP_BENCHMARK_RATES: Record<string, { price: number; name: string; source: string }> = {
      'A.2.2.1.1': { price: 28500, name: '1 m Pengukuran dan pemasangan bowplank', source: 'CIPTA_KARYA_2026' },
      'A.2.2.1.9': { price: 8500, name: '1 m2 Membersihkan lapangan dan perataan', source: 'CIPTA_KARYA_2026' },
      'A.2.3.1.1': { price: 86500, name: '1 m3 Galian tanah biasa sedalam 1 m', source: 'CIPTA_KARYA_2026' },
      'A.2.3.1.9': { price: 29000, name: '1 m3 Pengurugan kembali galian tanah', source: 'CIPTA_KARYA_2026' },
      'A.2.3.1.11': { price: 245000, name: '1 m3 Pengurugan pasir urug padat', source: 'CIPTA_KARYA_2026' },
      'A.3.2.1.2': { price: 920000, name: '1 m3 Pasangan pondasi batu belah 1SP : 5PP', source: 'CIPTA_KARYA_2026' },
      'A.3.2.1.9': { price: 620000, name: '1 m3 Pasangan batu kosong (aanstamping)', source: 'CIPTA_KARYA_2026' },
      'A.4.1.1.1': { price: 890000, name: '1 m3 Membuat beton mutu f\'c = 7,4 MPa (K 100 / Bo)', source: 'CIPTA_KARYA_2026' },
      'A.4.1.1.4': { price: 1250000, name: '1 m3 Membuat beton mutu f\'c = 19.3 MPa (K 225)', source: 'CIPTA_KARYA_2026' },
      'A.4.1.1.5': { price: 1320000, name: '1 m3 Membuat beton mutu f\'c = 21.7 MPa (K 250)', source: 'CIPTA_KARYA_2026' },
      'A.4.1.1.17': { price: 16500, name: '1 kg Pembesian besi beton ulir / polos', source: 'CIPTA_KARYA_2026' },
      'A.4.1.1.20': { price: 195000, name: '1 m2 Pasang bekisting untuk sloof / kolom', source: 'CIPTA_KARYA_2026' },
      'A.4.4.1.1': { price: 142000, name: '1 m2 Pasang dinding bata ringan hebel t=10cm mortar instan', source: 'CIPTA_KARYA_2026' },
      'A.4.4.1.9': { price: 165000, name: '1 m2 Pasang dinding bata merah tebal 1/2 bata 1:5', source: 'CIPTA_KARYA_2026' },
      'A.4.4.2.2': { price: 48500, name: '1 m2 Plesteran 1:5 tebal 15 mm', source: 'CIPTA_KARYA_2026' },
      'A.4.4.2.27': { price: 34500, name: '1 m2 Acian semen / mortar instan', source: 'CIPTA_KARYA_2026' },
      'A.4.4.3.3': { price: 195000, name: '1 m2 Pasang lantai keramik 40x40 / 50x50 cm', source: 'CIPTA_KARYA_2026' },
      'A.4.4.3.4': { price: 265000, name: '1 m2 Pasang lantai homogeneous tile granit 60x60 cm', source: 'CIPTA_KARYA_2026' },
      'A.4.5.1.7': { price: 115000, name: '1 m2 Langit-langit gypsum board 9mm rangka hollow', source: 'CIPTA_KARYA_2026' },
      'A.4.5.2.3': { price: 185000, name: '1 m2 Rangka atap baja ringan profil C75/0.75', source: 'CIPTA_KARYA_2026' },
      'A.4.5.2.11': { price: 105000, name: '1 m2 Penutup atap genteng metal warna pasir', source: 'CIPTA_KARYA_2026' },
      'A.4.6.1.1': { price: 185000, name: '1 m Kusen pintu dan jendela aluminium 4 inch', source: 'CIPTA_KARYA_2026' },
      'A.4.6.1.2': { price: 950000, name: '1 Unit Daun pintu panel kayu kamper / HPL solid', source: 'CIPTA_KARYA_2026' },
      'A.4.6.1.5': { price: 420000, name: '1 Unit Daun jendela kaca aluminium 5mm', source: 'CIPTA_KARYA_2026' },
      'A.4.7.1.10': { price: 32500, name: '1 m2 Pengecatan tembok interior 3 lapis', source: 'CIPTA_KARYA_2026' },
      'A.4.7.1.11': { price: 46000, name: '1 m2 Pengecatan tembok eksterior weathershield', source: 'CIPTA_KARYA_2026' },
      'A.4.7.1.1': { price: 28500, name: '1 m2 Pengecatan plafon gypsum', source: 'CIPTA_KARYA_2026' },
      'A.5.1.1.1': { price: 850000, name: '1 Unit Pasang kloset duduk porselen monoblok', source: 'CIPTA_KARYA_2026' },
      'A.5.1.1.19': { price: 38500, name: '1 m Pipa PVC tipe AW diameter 3/4 inch', source: 'CIPTA_KARYA_2026' },
      'A.5.1.1.25': { price: 78500, name: '1 m Pipa PVC tipe D diameter 3 inch / 4 inch', source: 'CIPTA_KARYA_2026' },
      'A.5.1.1.30': { price: 3200000, name: '1 Unit Bio Septic Tank 1000 Liter + Resapan', source: 'CIPTA_KARYA_2026' },
      'A.6.1.1.1': { price: 165000, name: '1 Titik Instalasi titik lampu & saklar kabel NYM 3x1.5', source: 'CIPTA_KARYA_2026' },
      'A.6.1.1.2': { price: 185000, name: '1 Titik Instalasi stop kontak kabel NYM 3x2.5', source: 'CIPTA_KARYA_2026' },
      'A.6.1.1.10': { price: 750000, name: '1 Set Panel MCB Box 4 Group + Pengaman', source: 'CIPTA_KARYA_2026' },
      'BM.05.01': { price: 1450000, name: '1 m3 Lapis Pondasi Semen Tanah / Lean Concrete', source: 'BINA_MARGA_2026' },
      'BM.05.02': { price: 1850000, name: '1 m3 Perkerasan Beton Semen (Rigid Pavement)', source: 'BINA_MARGA_2026' },
      'SDA.01.01': { price: 485000, name: 'Pemasangan 1 m1 Saluran U-Ditch Pracetak', source: 'SDA_2026' },
      'SDA.01.02': { price: 215000, name: 'Pemasangan 1 m1 Tutup / Cover U-Ditch Beton Pracetak', source: 'SDA_2026' },
    };

    const benchmark = AHSP_BENCHMARK_RATES[ahspCode];
    if (benchmark) {
      return {
        unitPrice: Math.round(benchmark.price * multiplier),
        ahspName: benchmark.name,
        source: benchmark.source,
      };
    }

    // Default fallback
    // PHASE 1 telemetry: unknown AHSP code → flat Rp 150.000/m3 × regional multiplier.
    recordFabricatedTotal('parametric.borongan.default', Math.round(150000 * multiplier), {
      constant: 150000,
      unit: ahspCode,
      itemName: `Analisa Satuan Pekerjaan (${ahspCode})`,
      calculatorId: ahspCode,
    });
    return {
      unitPrice: Math.round(150000 * multiplier),
      ahspName: `Analisa Satuan Pekerjaan (${ahspCode})`,
      source: 'CUSTOM',
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
      const { unitPrice, ahspName, source: ahspSource } = this.resolveUnitPrice(defaultAhsp, region);
      const totalPrice = Math.round(quantity * unitPrice);

      if (categorySubtotals[item.category] !== undefined) {
        categorySubtotals[item.category] += totalPrice;
      } else {
        categorySubtotals[item.category] = totalPrice;
      }

      totalDirectCost += totalPrice;

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
        unitPrice,
        totalPrice,
        ahspCode: defaultAhsp,
        ahspName,
        ahspSource,
        formula: volRes.formula,
        formulaInputs: volRes.formulaInputs,
        dimensions: volRes.dimensions,
        assumptionsUsed: volRes.assumptionsUsed,
        status: volRes.status,
        confidence: volRes.confidence,
        requiresReview: volRes.requiresReview,
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
      isReadyForSpreadsheet: allErrors.length === 0,
      calculationTimestamp: new Date().toISOString(),
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
    return result.workItems.map((wi, index) => ({
      id: `rab-${wi.workItemId}-${Date.now()}-${index}`,
      wbsCode: wi.wbsCode,
      name: wi.name,
      category: wi.category,
      unit: wi.unit,
      volume: wi.quantity,
      unitPrice: wi.unitPrice,
      totalPrice: wi.totalPrice,
      ahspCode: wi.ahspCode,
      ahspName: wi.ahspName,
      formula: wi.formula,
      confidence: wi.confidence,
      requiresReview: wi.requiresReview,
      assumptionsUsed: wi.assumptionsUsed,
      calculationTrace: wi.calculationTrace,
    }));
  }
}

export const parametricVolumeEngine = new ParametricVolumeEngine();


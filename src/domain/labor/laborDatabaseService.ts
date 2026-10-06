/**
 * EZRAB — LABOR & UPAH DATABASE INDONESIA 2026
 * Master Construction Workforce Intelligence & Rates Database
 * 
 * Complies with:
 * - Permen PUPR No. 1 Tahun 2022 & Standar DJBK 2026
 * - UU Ketenagakerjaan & Standar Jam Kerja Konstruksi (7 Jam/Hari = 1 OH)
 * - 38 Indonesian Provinces with Regional Wage Index (UMR/UMK 2026)
 * - SKK Konstruksi (Jenjang 1 - Jenjang 9) & BNSP / Kemnaker Standards
 * - ISO/TR 14107 & Standardized Construction Labor Classifications
 * - 49 Construction & Engineering Workforce Categories
 */

import { MASTER_LABOR_ROSTER_49 } from './laborMasterData49';

export type LaborSkillLevel =
  | 'NON_SKILLED'      // Pekerja / Buruh Tak Terlatih
  | 'SEMI_SKILLED'     // Pembantu Tukang / Kernet / Helper
  | 'SKILLED'          // Tukang Terampil (Batu, Kayu, Besi, Cat, Pipa, Las, Listrik)
  | 'SPECIALIST'       // Welder 6G, Operator Alat Berat, Juru Ukur / Surveyor, Teknisi Khusus
  | 'SUPERVISOR'       // Kepala Tukang, Mandor Proyek, Safety Officer (HSE), Pengawas Lapangan
  | 'ENGINEER'         // Site Engineer, Structural Engineer, QA/QC, QS, Geoteknik, Tambang
  | 'MANAGEMENT';      // Project Manager, Construction Manager, Project Director

export type LaborPriceSourceStatus =
  | 'VERIFIED'
  | 'MARKET_REFERENCE'
  | 'VENDOR_QUOTE'
  | 'USER_INPUT'
  | 'ESTIMATE'
  | 'UNVERIFIED';

export interface LaborAhspMapping {
  ahspCode: string;
  ahspRole: string;
  coefficient: number;
  productivityRate?: number; // Output satuan pekerjaan per OH
  unit: string;              // e.g. 'OH/m³', 'OH/m²', 'OH/m'
}

export interface LaborProductivityProfile {
  standardRate: number;      // e.g. 8 (m2/OH)
  unit: string;              // e.g. 'm2/OH', 'm3/OH', 'kg/OH', 'titik/OH'
  description: string;
  factors?: Record<string, number>; // e.g. { 'tingkat_kesulitan_tinggi': 0.75, 'lembur': 0.85 }
}

export interface LaborRateRecord {
  id: string;
  code: string;                      // e.g. 'L.01', 'L.MAN-01', 'L.ENG-01'
  name: string;                      // e.g. 'Tukang Batu (Bricklayer / Mason)'
  aliases: string[];                 // e.g. ['Mason', 'Stone Mason', 'Tukang Pasang Bata', 'Tukang Plester']
  englishName?: string;              // e.g. 'Bricklayer / Mason'
  category: string;                  // Main domain e.g. 'Konstruksi Gedung', 'Infrastruktur Jalan', 'MEP'
  subcategory: string;               // e.g. 'Dinding & Plesteran', 'Pondasi', 'Struktur Beton'
  specialization?: string;           // e.g. 'Pasangan Bata Hebel Presisi', 'Plesteran Kedap Air'
  roleCategory: string;              // Legacy/Backwards compatibility e.g. 'Arsitektur & Dinding'
  skillLevel: LaborSkillLevel;
  workerType?: 'DIRECT_LABOR' | 'INDIRECT_LABOR' | 'STAFF' | 'SUBCONTRACTOR';
  skkLevel?: string;                 // e.g. 'SKK Jenjang 2 (Tukang Pasang Bata)'
  unit: 'OH' | 'OJ' | 'Bulan' | 'Hari' | 'Shift'; // OH = Orang Hari (7 Jam), OJ = Orang Jam
  basePriceOH: number;               // Standar Acuan Nasional / DKI Jakarta (Rp/OH)
  basePriceOJ: number;               // Standar per Orang Jam (Rp/OJ)
  minWage?: number;                  // Batas bawah upah pasar
  maxWage?: number;                  // Batas atas upah pasar
  wageUnit?: string;                 // 'Rp/OH'
  workHoursPerDay: number;           // Default 7 jam/hari untuk pekerja lapangan, 8 jam untuk staf
  overtimeHourlyRate: number;        // Tarif lembur (1.5x - 2.0x)
  regionalFactor: number;            // Multiplier for active region (default 1.0)
  region?: string;                   // 'DKI Jakarta / Nasional'
  province?: string;                 // 'DKI Jakarta'
  effectiveDate: string;             // '2026-01-15'
  regulationSource: string;          // 'SE DJBK No. 12/SE/Db/2026 & Permen PUPR 1/2022'
  sourceStatus: LaborPriceSourceStatus;
  status: 'VERIFIED' | 'REVIEWED' | 'UNVERIFIED' | 'ARCHIVED';
  duties: string[];
  competencies?: string[];
  certifications?: string[];
  relatedWorkItems?: string[];
  projectTypes?: string[];
  equipmentOperated?: string[];
  safetyRequirements: string[];
  ahspMappings?: LaborAhspMapping[];
  productivity?: LaborProductivityProfile;
}

export const MASTER_LABOR_ROSTER: LaborRateRecord[] = MASTER_LABOR_ROSTER_49;

export class LaborDatabaseService {
  private static instance: LaborDatabaseService;
  private laborList: LaborRateRecord[] = [];

  private constructor() {
    this.laborList = [...MASTER_LABOR_ROSTER];
  }

  public static getInstance(): LaborDatabaseService {
    if (!LaborDatabaseService.instance) {
      LaborDatabaseService.instance = new LaborDatabaseService();
    }
    return LaborDatabaseService.instance;
  }

  public getAllLabor(): LaborRateRecord[] {
    return [...this.laborList];
  }

  public getLaborById(idOrCode: string): LaborRateRecord | undefined {
    const clean = idOrCode.toLowerCase().trim();
    return this.laborList.find(
      (l) => l.id.toLowerCase() === clean || l.code.toLowerCase() === clean
    );
  }

  /**
   * Search labor roles supporting canonical names, aliases, category, subcategory, duties, and SKK levels.
   */
  public searchLabor(query: string, filters?: {
    category?: string;
    subcategory?: string;
    skillLevel?: LaborSkillLevel | 'ALL';
    workerType?: string;
    status?: string;
  }): LaborRateRecord[] {
    let result = [...this.laborList];

    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.code.toLowerCase().includes(q) ||
          (l.englishName && l.englishName.toLowerCase().includes(q)) ||
          l.category.toLowerCase().includes(q) ||
          l.subcategory.toLowerCase().includes(q) ||
          (l.specialization && l.specialization.toLowerCase().includes(q)) ||
          l.roleCategory.toLowerCase().includes(q) ||
          l.skillLevel.toLowerCase().includes(q) ||
          (l.aliases && l.aliases.some((a) => a.toLowerCase().includes(q))) ||
          (l.competencies && l.competencies.some((c) => c.toLowerCase().includes(q))) ||
          (l.certifications && l.certifications.some((cert) => cert.toLowerCase().includes(q))) ||
          l.duties.some((d) => d.toLowerCase().includes(q))
      );
    }

    if (filters) {
      if (filters.category && filters.category !== 'ALL') {
        result = result.filter((l) => l.category === filters.category);
      }
      if (filters.subcategory && filters.subcategory !== 'ALL') {
        result = result.filter((l) => l.subcategory === filters.subcategory);
      }
      if (filters.skillLevel && filters.skillLevel !== 'ALL') {
        result = result.filter((l) => l.skillLevel === filters.skillLevel);
      }
      if (filters.workerType && filters.workerType !== 'ALL') {
        result = result.filter((l) => l.workerType === filters.workerType);
      }
      if (filters.status && filters.status !== 'ALL') {
        result = result.filter((l) => l.status === filters.status);
      }
    }

    return result;
  }

  /**
   * Returns unique categories present in the labor database.
   */
  public getCategories(): string[] {
    const set = new Set<string>();
    this.laborList.forEach((l) => set.add(l.category));
    return Array.from(set).sort();
  }

  /**
   * Returns subcategories for a given category.
   */
  public getSubcategories(category?: string): string[] {
    const set = new Set<string>();
    this.laborList.forEach((l) => {
      if (!category || category === 'ALL' || l.category === category) {
        set.add(l.subcategory);
      }
    });
    return Array.from(set).sort();
  }

  /**
   * Calculates regional adjusted wages based on 38 Indonesian provinces index.
   */
  public getAdjustedRate(codeOrId: string, provinceName?: string): {
    priceOH: number;
    priceOJ: number;
    factor: number;
    province: string;
    standardHours: number;
    overtimeRate: number;
  } {
    const item = this.getLaborById(codeOrId);
    if (!item) {
      return {
        priceOH: 0,
        priceOJ: 0,
        factor: 1.0,
        province: provinceName || 'Nasional',
        standardHours: 7,
        overtimeRate: 0,
      };
    }

    const factorMap: Record<string, number> = {
      'DKI Jakarta': 1.0,
      'Jawa Barat': 0.96,
      'Jawa Tengah': 0.91,
      'DI Yogyakarta': 0.92,
      'Jawa Timur': 0.94,
      'Banten': 0.97,
      'Bali': 1.02,
      'Nusa Tenggara Barat': 0.95,
      'Nusa Tenggara Timur': 0.93,
      'Kalimantan Barat': 1.04,
      'Kalimantan Tengah': 1.08,
      'Kalimantan Selatan': 1.05,
      'Kalimantan Timur': 1.22,
      'Kalimantan Utara': 1.25,
      'Nusantara (IKN)': 1.25,
      'Papua': 1.48,
      'Papua Barat': 1.42,
      'Papua Tengah': 1.50,
      'Papua Pegunungan': 1.55,
      'Papua Selatan': 1.45,
      'Papua Barat Daya': 1.42,
      'Sumatera Utara': 0.98,
      'Sumatera Barat': 0.96,
      'Riau': 1.08,
      'Kepulauan Riau': 1.15,
      'Jambi': 0.97,
      'Sumatera Selatan': 0.99,
      'Bangka Belitung': 1.12,
      'Bengkulu': 0.94,
      'Lampung': 0.93,
      'Sulawesi Utara': 1.06,
      'Gorontalo': 0.94,
      'Sulawesi Tengah': 1.02,
      'Sulawesi Barat': 0.95,
      'Sulawesi Selatan': 0.99,
      'Sulawesi Tenggara': 1.01,
      'Maluku': 1.18,
      'Maluku Utara': 1.20,
      'Aceh': 0.98,
    };

    const factor = provinceName && factorMap[provinceName] ? factorMap[provinceName] : 1.0;
    const adjustedOH = Math.round((item.basePriceOH * factor) / 500) * 500;
    const adjustedOJ = Math.round((adjustedOH / item.workHoursPerDay) / 100) * 100;
    const overtimeRate = Math.round(adjustedOJ * 1.5);

    return {
      priceOH: adjustedOH,
      priceOJ: adjustedOJ,
      factor,
      province: provinceName || 'DKI Jakarta / Acuan Standar',
      standardHours: item.workHoursPerDay,
      overtimeRate,
    };
  }

  /**
   * Adds a new labor role with duplicate prevention on normalized canonical name and code.
   */
  public addLabor(record: Omit<LaborRateRecord, 'id'>): { success: boolean; data?: LaborRateRecord; error?: string } {
    const cleanName = record.name.trim().toLowerCase();
    const cleanCode = record.code.trim().toUpperCase();

    // Check duplicate code or canonical name
    const existing = this.laborList.find(
      (l) => l.code.toUpperCase() === cleanCode || l.name.toLowerCase().trim() === cleanName
    );

    if (existing) {
      return {
        success: false,
        error: `Tenaga kerja dengan kode "${record.code}" atau nama "${record.name}" sudah ada dalam database.`,
      };
    }

    const newRecord: LaborRateRecord = {
      ...record,
      id: `LAB-CUSTOM-${Date.now()}`,
      aliases: record.aliases || [],
      category: record.category || 'Tenaga Umum Konstruksi',
      subcategory: record.subcategory || 'Umum',
      roleCategory: record.roleCategory || record.category || 'Tenaga Umum Konstruksi',
      sourceStatus: record.sourceStatus || 'USER_INPUT',
      status: record.status || 'UNVERIFIED',
      duties: record.duties || [],
      safetyRequirements: record.safetyRequirements || ['Helm K3', 'Rompi Safety', 'Safety Shoes'],
    };

    this.laborList.unshift(newRecord);
    return { success: true, data: newRecord };
  }

  /**
   * Updates an existing labor record.
   */
  public updateLabor(id: string, updates: Partial<LaborRateRecord>): { success: boolean; data?: LaborRateRecord; error?: string } {
    const index = this.laborList.findIndex((l) => l.id === id || l.code === id);
    if (index === -1) {
      return { success: false, error: 'Tenaga kerja tidak ditemukan.' };
    }

    const updated = {
      ...this.laborList[index],
      ...updates,
      id: this.laborList[index].id, // preserve immutable ID
    };

    this.laborList[index] = updated;
    return { success: true, data: updated };
  }

  /**
   * Archives a labor record.
   */
  public archiveLabor(id: string): boolean {
    const item = this.getLaborById(id);
    if (!item) return false;
    item.status = 'ARCHIVED';
    return true;
  }

  /**
   * Exports labor dataset as JSON string or formatted CSV.
   */
  public exportData(format: 'JSON' | 'CSV' = 'JSON'): string {
    if (format === 'JSON') {
      return JSON.stringify(this.laborList, null, 2);
    }

    // CSV format
    const headers = [
      'Kode',
      'Nama',
      'Kategori',
      'Subkategori',
      'Level Kualifikasi',
      'Satuan',
      'Upah Harian (OH)',
      'Upah Per Jam (OJ)',
      'SKK Level',
      'Sumber Regulasi',
      'Status Verifikasi',
    ];

    const rows = this.laborList.map((l) => [
      `"${l.code}"`,
      `"${l.name.replace(/"/g, '""')}"`,
      `"${l.category}"`,
      `"${l.subcategory}"`,
      `"${l.skillLevel}"`,
      `"${l.unit}"`,
      l.basePriceOH,
      l.basePriceOJ,
      `"${l.skkLevel || ''}"`,
      `"${l.regulationSource}"`,
      `"${l.sourceStatus}"`,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export const laborDatabaseService = LaborDatabaseService.getInstance();

/**
 * EZRAB PRICING DOMAIN — REPOSITORY
 * In-memory registry for versioned HSD and material/labor/equipment unit prices.
 */

import { PriceDefinition } from '../contracts/types';
import { PriceNormalizationEngine } from '../normalization/priceNormalization';
import { projectPriceEngine, ProjectPriceEngine } from '../projectPriceEngine';
import { OFFICIAL_HSD_2026_ITEMS } from '../../../data/nationalCostDatabase/officialHSD2026';
import { MASTER_PRICE_ITEMS } from '../../../data/indonesianPrices';
import { MASTER_AHSP_DATABASE } from '../../../data/indonesianAHSP';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../../data/nationalCostDatabase/masterRegistry';
import { MaterialLibraryService } from '../../../services/materialLibraryService';
import { MaterialDatabaseService } from '../../../domain/material/materialDatabaseService';
import { LaborDatabaseService } from '../../../domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../../../domain/equipment/equipmentDatabaseService';

export class PriceRepository {
  private static instance: PriceRepository;

  private masterPricesByCode: Map<string, PriceDefinition> = new Map();
  private masterPriceList: PriceDefinition[] = [];
  // Project-scoped price overrides: projectId -> (normalizedCode -> PriceDefinition)
  private projectScopedOverrides: Map<string, Map<string, PriceDefinition>> = new Map();

  private constructor() {
    this.initializePriceDatasets();
  }

  public static getInstance(): PriceRepository {
    if (!PriceRepository.instance) {
      PriceRepository.instance = new PriceRepository();
    }
    return PriceRepository.instance;
  }

  public static resetInstance(): void {
    PriceRepository.instance = new PriceRepository();
    ProjectPriceEngine.resetInstance();
  }

  private initializePriceDatasets(): void {
    this.masterPricesByCode.clear();
    this.masterPriceList = [];

    // 1. Ingest Official HSD 2026 Items
    for (const item of OFFICIAL_HSD_2026_ITEMS) {
      const normCode = PriceNormalizationEngine.normalizeCode(item.code);
      if (!normCode) continue;

      const def: PriceDefinition = {
        id: item.id || `PRC-HSD-${normCode}`,
        code: item.code,
        codeNormalized: normCode,
        name: item.name,
        category: (item.category as any) || 'MATERIAL',
        unit: PriceNormalizationEngine.normalizeUnit(item.unit),
        price: item.price,
        location: item.location || 'Nasional / Acuan 2026',
        periodVersion: item.periodVersion || '2026-Q1',
        effectiveDate: item.lastUpdated || '2026-01-15',
        priceSource: item.priceSource || 'SE 12/SE/Db/2026',
        specification: item.specification,
        provenance: {
          sourceName: item.priceSource || 'Katalog Acuan HSD 2026',
          sourceDocument: item.specification,
          location: item.location || 'Nasional',
          periodVersion: item.periodVersion || '2026-Q1',
          effectiveDate: item.lastUpdated || '2026-01-15',
          supplier: item.supplier,
          confidenceScore: 0.95,
        },
      };

      this.masterPricesByCode.set(normCode, def);
      this.masterPriceList.push(def);
    }

    // 2. Ingest Master Commercial Price Items
    for (const item of MASTER_PRICE_ITEMS) {
      const normCode = PriceNormalizationEngine.normalizeCode(item.code);
      if (!normCode) continue;

      if (this.masterPricesByCode.has(normCode)) continue;

      const def: PriceDefinition = {
        id: item.id || `PRC-COM-${normCode}`,
        code: item.code,
        codeNormalized: normCode,
        name: item.name,
        category: (item.category as any) || 'MATERIAL',
        subcategory: (item as any).subcategory,
        unit: PriceNormalizationEngine.normalizeUnit(item.unit),
        price: item.price,
        minPrice: item.minPrice,
        maxPrice: item.maxPrice,
        location: item.location || 'Jabodetabek',
        periodVersion: item.periodVersion || '2026-Q1',
        effectiveDate: item.lastUpdated || '2026-01-01',
        priceSource: item.priceSource || 'EZRAB Master Database 2026',
        brand: (item as any).brand,
        specification: item.specification,
        provenance: {
          sourceName: item.priceSource || 'EZRAB Master Database 2026',
          location: item.location || 'Jabodetabek',
          periodVersion: item.periodVersion || '2026-Q1',
          effectiveDate: item.lastUpdated || '2026-01-01',
          supplier: item.supplier,
          confidenceScore: 0.90,
        },
      };

      this.masterPricesByCode.set(normCode, def);
      this.masterPriceList.push(def);
    }

    // 3. Ingest Component Prices from Indonesian AHSP Master Database (Labor, Materials, Equip)
    for (const ahsp of MASTER_AHSP_DATABASE) {
      const allComps = [
        ...(ahsp.laborComponents || []).map((c) => ({ ...c, cat: 'LABOR' as const })),
        ...(ahsp.materialComponents || []).map((c) => ({ ...c, cat: 'MATERIAL' as const })),
        ...(ahsp.equipmentComponents || []).map((c) => ({ ...c, cat: 'EQUIPMENT' as const })),
      ];

      for (const comp of allComps) {
        if (!comp.code || comp.unitPrice === undefined || comp.unitPrice <= 0) continue;
        const normCode = PriceNormalizationEngine.normalizeCode(comp.code);
        if (this.masterPricesByCode.has(normCode)) continue;

        const def: PriceDefinition = {
          id: `PRC-AHSP-${normCode}`,
          code: comp.code,
          codeNormalized: normCode,
          name: comp.name,
          category: comp.cat,
          unit: PriceNormalizationEngine.normalizeUnit(comp.unit),
          price: comp.unitPrice,
          location: 'Nasional / Permen PUPR No. 1/2022',
          periodVersion: '2022-Q1',
          effectiveDate: '2022-01-01',
          priceSource: ahsp.regulationSource || 'Permen PUPR No. 1/PRT/M/2022',
          provenance: {
            sourceName: ahsp.regulationSource || 'Permen PUPR No. 1/PRT/M/2022',
            location: 'Nasional',
            periodVersion: '2022-Q1',
            effectiveDate: '2022-01-01',
            confidenceScore: 0.95,
          },
        };

        this.masterPricesByCode.set(normCode, def);
        this.masterPriceList.push(def);
      }
    }

    // 4. Ingest Component Prices from National AHSP items
    for (const ahsp of ALL_OFFICIAL_AHSP_ITEMS) {
      const allComps = [
        ...(ahsp.laborComponents || []).map((c) => ({ ...c, cat: 'LABOR' as const })),
        ...(ahsp.materialComponents || []).map((c) => ({ ...c, cat: 'MATERIAL' as const })),
        ...(ahsp.equipmentComponents || []).map((c) => ({ ...c, cat: 'EQUIPMENT' as const })),
      ];

      for (const comp of allComps) {
        if (!comp.code || (comp as any).unitPrice === undefined || (comp as any).unitPrice <= 0) continue;
        const normCode = PriceNormalizationEngine.normalizeCode(comp.code);
        if (this.masterPricesByCode.has(normCode)) continue;

        const def: PriceDefinition = {
          id: `PRC-NAT-${normCode}`,
          code: comp.code,
          codeNormalized: normCode,
          name: comp.name,
          category: comp.cat,
          unit: PriceNormalizationEngine.normalizeUnit(comp.unit),
          price: (comp as any).unitPrice,
          location: 'Nasional / SE DJBK 2026',
          periodVersion: '2026-Q1',
          effectiveDate: '2026-01-01',
          priceSource: ahsp.sourceDocument || 'SE DJBK 2026',
          provenance: {
            sourceName: ahsp.sourceDocument || 'SE DJBK 2026',
            location: 'Nasional',
            periodVersion: '2026-Q1',
            effectiveDate: '2026-01-01',
            confidenceScore: 0.95,
          },
        };

        this.masterPricesByCode.set(normCode, def);
        this.masterPriceList.push(def);
      }
    }
    // 5. Ingest from MaterialLibraryService default items if not already present
    try {
      const matLib = MaterialLibraryService.getInstance();
      const mats = matLib.getAllMaterials();
      for (const m of mats) {
        const normCode = PriceNormalizationEngine.normalizeCode(m.id);
        if (!this.masterPricesByCode.has(normCode)) {
          const priceInfo = matLib.getMaterialPrice(m.id);
          const def: PriceDefinition = {
            id: m.id,
            code: m.id,
            codeNormalized: normCode,
            name: m.name,
            category: 'MATERIAL',
            subcategory: m.category,
            unit: PriceNormalizationEngine.normalizeUnit(m.unit),
            price: priceInfo.unitPrice,
            location: 'Jabodetabek',
            periodVersion: '2026-Q1',
            effectiveDate: priceInfo.effectiveDate || '2026-03-01',
            priceSource: priceInfo.source || 'EZRAB Material Ecosystem',
            brand: m.brand,
            specification: m.specification,
            provenance: {
              sourceName: priceInfo.supplier || 'EZRAB Material Library',
              location: 'Jabodetabek',
              periodVersion: '2026-Q1',
              effectiveDate: priceInfo.effectiveDate || '2026-03-01',
              supplier: priceInfo.supplier,
              confidenceScore: 0.95,
            },
          };
          this.masterPricesByCode.set(normCode, def);
          this.masterPriceList.push(def);
        }
      }
    } catch {
      // In non-node or circular test situations, continue safely
    }

    // 6. Ingest Multi-Sector items from unified MaterialDatabaseService (Building, Road, Drainage, Bridge, Irrigation, River, Weir, Dam, Water Structures)
    try {
      const matDb = MaterialDatabaseService.getInstance();
      const allMats = matDb.getAllMaterials();
      for (const m of allMats) {
        const normCode = PriceNormalizationEngine.normalizeCode(m.materialCode || m.id);
        if (!normCode) continue;

        if (!this.masterPricesByCode.has(normCode)) {
          const prices = matDb.getPricesByMaterialId(m.id);
          const p = prices[0];
          if (p && p.price > 0) {
            const def: PriceDefinition = {
              id: p.id,
              code: m.materialCode || m.id,
              codeNormalized: normCode,
              name: m.name,
              category: 'MATERIAL',
              subcategory: m.subcategory || m.category,
              unit: PriceNormalizationEngine.normalizeUnit(m.unit),
              price: p.price,
              location: p.region.city ? `${p.region.city}, ${p.region.province}` : (p.region.province || 'Nasional'),
              periodVersion: '2026-Q1',
              effectiveDate: p.priceDate || '2026-03-01',
              priceSource: p.sourceName || 'EZRAB Material 2026',
              brand: m.brand,
              specification: m.specification,
              provenance: {
                sourceName: p.sourceName,
                location: p.region.city || p.region.province,
                periodVersion: '2026-Q1',
                effectiveDate: p.priceDate,
                supplier: p.supplierName,
                confidenceScore: p.confidence === 'HIGH' ? 0.95 : 0.85,
              },
            };
            this.masterPricesByCode.set(normCode, def);
            this.masterPriceList.push(def);
          }
        }
      }
    } catch {
      // safe fallback
    }

    // 7. Ingest Comprehensive Labor Items from LaborDatabaseService
    try {
      const laborDb = LaborDatabaseService.getInstance();
      const allLabor = laborDb.getAllLabor();
      for (const lab of allLabor) {
        const normCode = PriceNormalizationEngine.normalizeCode(lab.code || lab.id);
        if (!normCode) continue;

        if (!this.masterPricesByCode.has(normCode)) {
          const def: PriceDefinition = {
            id: lab.id,
            code: lab.code,
            codeNormalized: normCode,
            name: lab.name,
            category: 'LABOR',
            subcategory: lab.roleCategory || lab.category,
            unit: lab.unit,
            price: lab.basePriceOH,
            location: 'Nasional / Acuan 2026',
            periodVersion: '2026-Q1',
            effectiveDate: lab.effectiveDate,
            priceSource: lab.regulationSource,
            specification: `${lab.skillLevel} — ${lab.skkLevel || 'Standar Mandor'} (7 Jam Kerja/Hari)`,
            provenance: {
              sourceName: lab.regulationSource,
              location: 'Nasional',
              periodVersion: '2026-Q1',
              effectiveDate: lab.effectiveDate,
              confidenceScore: 0.98,
            },
          };
          this.masterPricesByCode.set(normCode, def);
          this.masterPriceList.push(def);
        }
      }
    } catch {
      // safe fallback
    }

    // 8. Ingest Comprehensive Equipment Items from EquipmentDatabaseService
    try {
      const equipDb = EquipmentDatabaseService.getInstance();
      const allEquip = equipDb.getAllEquipment();
      for (const eq of allEquip) {
        const normCode = PriceNormalizationEngine.normalizeCode(eq.code || eq.id);
        if (!normCode) continue;

        if (!this.masterPricesByCode.has(normCode)) {
          const def: PriceDefinition = {
            id: eq.id,
            code: eq.code,
            codeNormalized: normCode,
            name: eq.name,
            category: 'EQUIPMENT',
            subcategory: eq.category,
            unit: eq.unit,
            price: eq.unit === 'jam' ? eq.rentalPricePerHour : eq.rentalPricePerDay,
            location: 'Nasional / Acuan 2026',
            periodVersion: '2026-Q1',
            effectiveDate: eq.provenance.effectiveDate,
            priceSource: eq.provenance.sourceName,
            specification: `${eq.capacity} — ${eq.specification} (BBM: ${eq.fuelConsumptionLiterPerHour} L/jam)`,
            provenance: {
              sourceName: eq.provenance.sourceName,
              location: 'Nasional',
              periodVersion: '2026-Q1',
              effectiveDate: eq.provenance.effectiveDate,
              confidenceScore: eq.provenance.confidenceScore,
            },
          };
          this.masterPricesByCode.set(normCode, def);
          this.masterPriceList.push(def);
        }
      }
    } catch {
      // safe fallback
    }
  }

  public getByCode(code: string, projectId?: string): PriceDefinition | undefined {
    const normCode = PriceNormalizationEngine.normalizeCode(code);
    if (!normCode) return undefined;

    // Check project override first
    if (projectId) {
      const projectMap = this.projectScopedOverrides.get(projectId);
      if (projectMap && projectMap.has(normCode)) {
        return projectMap.get(normCode);
      }
    }

    return this.masterPricesByCode.get(normCode);
  }

  public getAllMasterPrices(): PriceDefinition[] {
    return [...this.masterPriceList];
  }

  public getAll(): PriceDefinition[] {
    return [...this.masterPriceList];
  }

  public getProjectPrices(projectId: string): PriceDefinition[] {
    const projectMap = this.projectScopedOverrides.get(projectId);
    const existing = projectMap ? Array.from(projectMap.values()) : [];

    // Include active project overrides registered in ProjectPriceEngine
    const engineOverrides = projectPriceEngine.getProjectOverrides(projectId);
    for (const ov of engineOverrides) {
      if (!ov.active) continue;
      const norm = PriceNormalizationEngine.normalizeCode(ov.materialCode || ov.materialId);
      const idx = existing.findIndex((p) => p.codeNormalized === norm);
      const master = this.masterPricesByCode.get(norm);
      const def: PriceDefinition = {
        id: ov.id,
        code: ov.materialCode || ov.materialId,
        codeNormalized: norm,
        name: ov.materialName || master?.name || ov.materialId,
        category: (ov.category as any) || master?.category || 'MATERIAL',
        unit: ov.unit,
        price: ov.price,
        minPrice: ov.masterPrice ?? master?.price,
        location: 'Proyek',
        periodVersion: '2026-Q1',
        effectiveDate: ov.createdAt ? ov.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
        priceSource: 'PROJECT_OVERRIDE',
        projectId,
        provenance: {
          sourceName: ov.reason || `Project Override (${projectId})`,
          location: 'Proyek',
          periodVersion: '2026-Q1',
          effectiveDate: ov.createdAt ? ov.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
          confidenceScore: 1.0,
          notes: ov.reason,
        },
      };

      if (idx >= 0) {
        existing[idx] = def;
      } else {
        existing.push(def);
      }
    }

    // Also include any project prices registered in ProjectPriceEngine
    const enginePrices = projectPriceEngine.getProjectPrices(projectId);
    for (const ep of enginePrices) {
      const norm = PriceNormalizationEngine.normalizeCode(ep.materialCode || ep.materialId);
      if (!existing.some((p) => p.codeNormalized === norm)) {
        const master = this.masterPricesByCode.get(norm);
        existing.push({
          id: ep.id,
          code: ep.materialCode || ep.materialId,
          codeNormalized: norm,
          name: ep.materialName || master?.name || ep.materialId,
          category: (ep.category as any) || master?.category || 'MATERIAL',
          unit: ep.unit,
          price: ep.price,
          location: ep.region || 'Proyek',
          periodVersion: '2026-Q1',
          effectiveDate: ep.effectiveDate || new Date().toISOString().split('T')[0],
          priceSource: ep.source || 'PROJECT_PRICE',
          projectId,
          provenance: {
            sourceName: ep.supplierName ? `${ep.supplierName} (${ep.source})` : `Harga Proyek (${projectId})`,
            location: ep.region || 'Proyek',
            periodVersion: '2026-Q1',
            effectiveDate: ep.effectiveDate || new Date().toISOString().split('T')[0],
            supplier: ep.supplierName,
            confidenceScore: 1.0,
          },
        });
      }
    }

    return existing;
  }

  public setProjectPriceOverride(
    projectId: string,
    priceOrTarget: PriceDefinition | string,
    newPrice?: number,
    notes?: string
  ): PriceDefinition {
    if (!projectId || projectId.trim() === '') {
      throw new Error('PROJECT_CONTEXT_REQUIRED: Cannot set project price override without valid projectId');
    }

    let targetDef: PriceDefinition;
    if (typeof priceOrTarget === 'string') {
      const found = this.masterPriceList.find(
        (p) =>
          p.id === priceOrTarget ||
          p.code === priceOrTarget ||
          p.codeNormalized === PriceNormalizationEngine.normalizeCode(priceOrTarget)
      );
      if (!found) {
        throw new Error(`PRICE_ITEM_NOT_FOUND: Item ${priceOrTarget} does not exist`);
      }
      targetDef = {
        ...found,
        price: newPrice !== undefined ? newPrice : found.price,
        priceSource: 'PROJECT_OVERRIDE',
        provenance: {
          ...found.provenance,
          sourceName: notes || `Project Override (${projectId})`,
          confidenceScore: 1.0,
        },
      };
    } else {
      targetDef = {
        ...priceOrTarget,
        price: newPrice !== undefined ? newPrice : priceOrTarget.price,
        priceSource: 'PROJECT_OVERRIDE',
      };
    }

    const normCode = PriceNormalizationEngine.normalizeCode(targetDef.codeNormalized || targetDef.code);
    if (!normCode) {
      throw new Error('INVALID_PRICE_CODE: Price code cannot be empty');
    }

    let projectMap = this.projectScopedOverrides.get(projectId);
    if (!projectMap) {
      projectMap = new Map();
      this.projectScopedOverrides.set(projectId, projectMap);
    }

    const saved: PriceDefinition = {
      ...targetDef,
      codeNormalized: normCode,
      projectId,
    };
    projectMap.set(normCode, saved);

    // Sync with projectPriceEngine
    projectPriceEngine.setProjectOverride(
      {
        projectId,
        materialId: targetDef.id || normCode,
        materialCode: targetDef.code,
        materialName: targetDef.name,
        price: targetDef.price,
        unit: targetDef.unit,
        reason: notes || 'Project Override via PriceRepository',
        active: true,
        previousPrice: typeof priceOrTarget === 'object' ? priceOrTarget.price : undefined,
      },
      { id: 'USR-REPOS', name: 'PriceRepository Synchronizer' }
    );

    return saved;
  }

  public removeProjectPriceOverride(projectId: string, code: string): boolean {
    const normCode = PriceNormalizationEngine.normalizeCode(code);
    projectPriceEngine.removeProjectOverride(projectId, normCode);
    const projectMap = this.projectScopedOverrides.get(projectId);
    if (!projectMap || !normCode) return true;
    return projectMap.delete(normCode);
  }

  /**
   * Find potential duplicate item to avoid cluttering database
   */
  public findDuplicate(name: string, specOrUnit?: string, brand?: string, unit?: string): PriceDefinition | undefined {
    const isUnit =
      specOrUnit &&
      ['kg', 'm', 'm2', 'm3', 'bh', 'unit', 'pcs', 'btg', 'zak', 'ls', 'hr', 'liter', 'kg/m'].includes(
        specOrUnit.toLowerCase().trim()
      );
    const actualUnit = isUnit ? specOrUnit : unit;
    const actualSpec = isUnit ? undefined : specOrUnit;

    const normName = PriceNormalizationEngine.normalizeText(name);
    const normSpec = actualSpec ? PriceNormalizationEngine.normalizeText(actualSpec) : '';
    const normBrand = brand ? PriceNormalizationEngine.normalizeText(brand) : '';
    const normUnit = actualUnit ? PriceNormalizationEngine.normalizeUnit(actualUnit) : '';

    return this.masterPriceList.find((p) => {
      const pName = PriceNormalizationEngine.normalizeText(p.name);
      const pUnit = PriceNormalizationEngine.normalizeUnit(p.unit);
      if (pName !== normName) return false;
      if (normUnit && pUnit !== normUnit) return false;
      if (normBrand && p.brand && PriceNormalizationEngine.normalizeText(p.brand) !== normBrand) return false;
      if (normSpec && p.specification && PriceNormalizationEngine.normalizeText(p.specification) !== normSpec) return false;
      return true;
    });
  }

  /**
   * Add a new custom material/price definition to the database
   */
  public addCustomPrice(item: {
    code?: string;
    name: string;
    category?: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'SMKK' | 'OTHER';
    subcategory?: string;
    specification?: string;
    brand?: string;
    unit: string;
    price: number;
    location?: string;
    priceSource?: string;
    supplier?: string;
    effectiveDate?: string;
    periodVersion?: string;
    notes?: string;
  }): PriceDefinition {
    const code = item.code?.trim() || `CUSTOM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const normCode = PriceNormalizationEngine.normalizeCode(code);
    const def: PriceDefinition = {
      id: code,
      code,
      codeNormalized: normCode,
      name: item.name.trim(),
      category: item.category || 'MATERIAL',
      subcategory: item.subcategory,
      specification: item.specification,
      brand: item.brand,
      unit: PriceNormalizationEngine.normalizeUnit(item.unit),
      price: Math.max(0, item.price),
      location: item.location || 'Nasional',
      periodVersion: item.periodVersion || '2026-Q1',
      effectiveDate: item.effectiveDate || new Date().toISOString().split('T')[0],
      priceSource: item.priceSource || 'USER_INPUT',
      provenance: {
        sourceName: item.priceSource || 'User Added Price',
        location: item.location || 'Nasional',
        periodVersion: item.periodVersion || '2026-Q1',
        effectiveDate: item.effectiveDate || new Date().toISOString().split('T')[0],
        supplier: item.supplier,
        confidenceScore: 1.0,
      },
    };

    this.masterPricesByCode.set(normCode, def);
    this.masterPriceList.unshift(def);
    return def;
  }

  public updatePrice(id: string, updates: Partial<PriceDefinition>): boolean {
    const idx = this.masterPriceList.findIndex((p) => p.id === id || p.code === id);
    if (idx === -1) return false;

    const existing = this.masterPriceList[idx];
    const updated: PriceDefinition = {
      ...existing,
      ...updates,
      id: existing.id,
      code: existing.code,
      codeNormalized: existing.codeNormalized,
    };

    this.masterPriceList[idx] = updated;
    this.masterPricesByCode.set(existing.codeNormalized, updated);
    return true;
  }

  public deletePrice(id: string): boolean {
    const idx = this.masterPriceList.findIndex((p) => p.id === id || p.code === id);
    if (idx === -1) return false;

    const removed = this.masterPriceList.splice(idx, 1)[0];
    this.masterPricesByCode.delete(removed.codeNormalized);
    return true;
  }

  /**
   * Filter and query database
   */
  public queryPrices(params: {
    search?: string;
    category?: string;
    subcategory?: string;
    location?: string;
    source?: string;
  }): PriceDefinition[] {
    let result = this.masterPriceList;

    if (params.category && params.category !== 'Semua') {
      result = result.filter((p) => p.category.toUpperCase() === params.category!.toUpperCase());
    }

    if (params.subcategory && params.subcategory !== 'Semua Subkategori' && params.subcategory !== 'Semua Kategori') {
      result = result.filter((p) => p.subcategory?.toLowerCase() === params.subcategory!.toLowerCase());
    }

    if (params.location && params.location !== 'Semua Wilayah') {
      result = result.filter((p) => p.location.toLowerCase().includes(params.location!.toLowerCase()));
    }

    if (params.source && params.source !== 'Semua') {
      result = result.filter((p) => p.priceSource.toLowerCase().includes(params.source!.toLowerCase()));
    }

    if (params.search && params.search.trim()) {
      const q = params.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.specification && p.specification.toLowerCase().includes(q))
      );
    }

    return result;
  }

  /**
   * Export all or filtered items to CSV string
   */
  public exportToCsv(items?: PriceDefinition[]): string {
    const target = items || this.masterPriceList;
    const header = ['Kode', 'Nama Material', 'Kategori', 'Subkategori', 'Spesifikasi', 'Brand', 'Unit', 'Harga', 'Wilayah', 'Sumber', 'Tanggal'];
    const rows = target.map((p) => [
      `"${p.code}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${p.category || ''}"`,
      `"${(p.subcategory || '').replace(/"/g, '""')}"`,
      `"${(p.specification || '').replace(/"/g, '""')}"`,
      `"${(p.brand || '').replace(/"/g, '""')}"`,
      `"${p.unit || ''}"`,
      p.price || 0,
      `"${(p.location || '').replace(/"/g, '""')}"`,
      `"${(p.priceSource || '').replace(/"/g, '""')}"`,
      `"${p.effectiveDate || ''}"`,
    ]);
    return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  public count(): number {
    return this.masterPriceList.length;
  }
}


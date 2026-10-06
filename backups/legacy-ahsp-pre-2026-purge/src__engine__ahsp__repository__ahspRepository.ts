/**
 * EZRAB AHSP DOMAIN — REPOSITORY
 * In-memory authoritative AHSP registry supporting national datasets, versioning, and project isolation.
 */

import { AHSPDefinition, AHSPComponentDefinition, AHSPDomain } from '../contracts/types';
import { AHSPNormalizationEngine } from '../normalization/ahspNormalization';
import { MASTER_AHSP_DATABASE } from '../../../data/indonesianAHSP';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../../data/nationalCostDatabase/masterRegistry';

export class AHSPRepository {
  private static instance: AHSPRepository;

  // Master definitions indexed by normalized code
  private masterDefinitionsByCode: Map<string, AHSPDefinition> = new Map();
  // Master definitions list
  private masterList: AHSPDefinition[] = [];
  // Project-scoped custom definitions: projectId -> (normalizedCode -> AHSPDefinition)
  private projectScopedDefinitions: Map<string, Map<string, AHSPDefinition>> = new Map();

  private constructor() {
    this.initializeAuthoritativeDatasets();
  }

  public static getInstance(): AHSPRepository {
    if (!AHSPRepository.instance) {
      AHSPRepository.instance = new AHSPRepository();
    }
    return AHSPRepository.instance;
  }

  /**
   * Reset repository instance (useful for testing)
   */
  public static resetInstance(): void {
    AHSPRepository.instance = new AHSPRepository();
  }

  /**
   * Ingest all authoritative datasets from repository sources
   */
  private initializeAuthoritativeDatasets(): void {
    this.masterDefinitionsByCode.clear();
    this.masterList = [];

    // 1. Ingest from National Cost Database (Cipta Karya, Bina Marga, SDA, SMKK)
    for (const item of ALL_OFFICIAL_AHSP_ITEMS) {
      const normCode = AHSPNormalizationEngine.normalizeCode(item.codeNormalized || item.code);
      if (!normCode) continue;

      const labor: AHSPComponentDefinition[] = (item.laborComponents || []).map((c, idx) => ({
        id: c.id || `L-${normCode}-${idx}`,
        type: 'labor',
        itemCode: c.code || '',
        itemName: c.name || '',
        unit: AHSPNormalizationEngine.normalizeUnit(c.unit || 'OH'),
        coefficient: c.coefficient || 0,
        specification: (c as any).specification,
      }));

      const material: AHSPComponentDefinition[] = (item.materialComponents || []).map((c, idx) => ({
        id: c.id || `M-${normCode}-${idx}`,
        type: 'material',
        itemCode: c.code || '',
        itemName: c.name || '',
        unit: AHSPNormalizationEngine.normalizeUnit(c.unit || ''),
        coefficient: c.coefficient || 0,
        specification: (c as any).specification,
      }));

      const equipment: AHSPComponentDefinition[] = (item.equipmentComponents || []).map((c, idx) => ({
        id: c.id || `E-${normCode}-${idx}`,
        type: 'equipment',
        itemCode: c.code || '',
        itemName: c.name || '',
        unit: AHSPNormalizationEngine.normalizeUnit(c.unit || ''),
        coefficient: c.coefficient || 0,
        specification: (c as any).specification,
      }));

      const def: AHSPDefinition = {
        id: item.id || `AHSP-NAT-${normCode}`,
        code: item.code,
        codeNormalized: normCode,
        name: item.name,
        unit: AHSPNormalizationEngine.normalizeUnit(item.unit),
        domain: item.domain || 'CIPTA_KARYA',
        category: item.category || 'UMUM',
        subCategory: item.subCategory,
        version: item.version || '2026',
        year: item.year || 2026,
        sourceDocument: item.sourceDocument || 'Lampiran SE DJBK 2026',
        laborComponents: labor,
        materialComponents: material,
        equipmentComponents: equipment,
        totalLaborCoefficient: AHSPNormalizationEngine.sumCoefficients(labor),
        totalMaterialCoefficient: AHSPNormalizationEngine.sumCoefficients(material),
        totalEquipmentCoefficient: AHSPNormalizationEngine.sumCoefficients(equipment),
        provenance: {
          sourceDocument: item.sourceDocument || 'SE DJBK 2026',
          documentNumber: (item as any).documentNumber,
          documentYear: item.year || 2026,
          version: item.version || '2026',
          sourcePage: item.sourcePage,
          institution: 'Kementerian PUPR',
          effectiveDate: item.lastUpdated || '2026-01-01',
          verificationStatus: (item.status as any) || 'VERIFIED',
        },
      };

      this.masterDefinitionsByCode.set(normCode, def);
      this.masterList.push(def);
    }

    // 2. Ingest from Indonesian AHSP Master Database (PUPR Permen No 1/2022 baseline)
    for (const item of MASTER_AHSP_DATABASE) {
      const normCode = AHSPNormalizationEngine.normalizeCode(item.code);
      if (!normCode) continue;

      // If already present from national 2026, don't overwrite unless newer/supplementary
      if (this.masterDefinitionsByCode.has(normCode)) continue;

      const labor: AHSPComponentDefinition[] = (item.laborComponents || []).map((c, idx) => ({
        id: c.id || `L-${normCode}-${idx}`,
        type: 'labor',
        itemCode: c.code || '',
        itemName: c.name || '',
        unit: AHSPNormalizationEngine.normalizeUnit(c.unit || 'OH'),
        coefficient: c.coefficient || 0,
      }));

      const material: AHSPComponentDefinition[] = (item.materialComponents || []).map((c, idx) => ({
        id: c.id || `M-${normCode}-${idx}`,
        type: 'material',
        itemCode: c.code || '',
        itemName: c.name || '',
        unit: AHSPNormalizationEngine.normalizeUnit(c.unit || ''),
        coefficient: c.coefficient || 0,
      }));

      const equipment: AHSPComponentDefinition[] = (item.equipmentComponents || []).map((c, idx) => ({
        id: c.id || `E-${normCode}-${idx}`,
        type: 'equipment',
        itemCode: c.code || '',
        itemName: c.name || '',
        unit: AHSPNormalizationEngine.normalizeUnit(c.unit || ''),
        coefficient: c.coefficient || 0,
      }));

      const def: AHSPDefinition = {
        id: item.id || `AHSP-PUPR-${normCode}`,
        code: item.code,
        codeNormalized: normCode,
        name: item.name,
        unit: AHSPNormalizationEngine.normalizeUnit(item.unit),
        domain: 'CIPTA_KARYA',
        category: item.category || 'UMUM',
        version: '2022',
        year: 2022,
        sourceDocument: item.regulationSource || 'Permen PUPR No. 1/PRT/M/2022',
        laborComponents: labor,
        materialComponents: material,
        equipmentComponents: equipment,
        totalLaborCoefficient: AHSPNormalizationEngine.sumCoefficients(labor),
        totalMaterialCoefficient: AHSPNormalizationEngine.sumCoefficients(material),
        totalEquipmentCoefficient: AHSPNormalizationEngine.sumCoefficients(equipment),
        provenance: {
          sourceDocument: item.regulationSource || 'Permen PUPR No. 1/PRT/M/2022',
          documentNumber: '1/PRT/M/2022',
          documentYear: 2022,
          version: '2022',
          institution: 'Kementerian PUPR',
          effectiveDate: item.lastUpdated || '2022-01-01',
          verificationStatus: 'VERIFIED',
        },
      };

      this.masterDefinitionsByCode.set(normCode, def);
      this.masterList.push(def);
    }
  }

  /**
   * Get AHSP by exact normalized code, with project override support if projectId provided.
   */
  public getByCode(code: string, projectId?: string): AHSPDefinition | undefined {
    const normCode = AHSPNormalizationEngine.normalizeCode(code);
    if (!normCode) return undefined;

    // 1. Check project-scoped override first
    if (projectId) {
      const projectMap = this.projectScopedDefinitions.get(projectId);
      if (projectMap && projectMap.has(normCode)) {
        return projectMap.get(normCode);
      }
    }

    // 2. Fall back to master definitions
    return this.masterDefinitionsByCode.get(normCode);
  }

  /**
   * Get all registered master definitions
   */
  public getAllMasterDefinitions(): AHSPDefinition[] {
    return [...this.masterList];
  }

  /**
   * Register a custom project-scoped AHSP definition (isolated strictly to projectId)
   */
  public registerProjectAHSP(projectId: string, definition: AHSPDefinition): void {
    if (!projectId || projectId.trim() === '') {
      throw new Error('PROJECT_CONTEXT_REQUIRED: Cannot register project AHSP without valid projectId');
    }
    const normCode = AHSPNormalizationEngine.normalizeCode(definition.codeNormalized || definition.code);
    if (!normCode) {
      throw new Error('INVALID_AHSP_CODE: Cannot register AHSP with empty code');
    }

    let projectMap = this.projectScopedDefinitions.get(projectId);
    if (!projectMap) {
      projectMap = new Map();
      this.projectScopedDefinitions.set(projectId, projectMap);
    }

    const scopedDef: AHSPDefinition = {
      ...definition,
      codeNormalized: normCode,
    };

    projectMap.set(normCode, scopedDef);
  }

  /**
   * Total count of available definitions
   */
  public count(projectId?: string): number {
    let count = this.masterList.length;
    if (projectId) {
      const pMap = this.projectScopedDefinitions.get(projectId);
      if (pMap) count += pMap.size;
    }
    return count;
  }
}

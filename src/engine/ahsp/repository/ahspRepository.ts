/**
 * EZRAB AHSP DOMAIN — REPOSITORY
 * In-memory authoritative AHSP registry supporting the verified 2026 canonical
 * catalog, versioning, and project isolation.
 *
 * PURGE NOTE (AHSP 2026):
 *   - The repository ingests ONLY the verified canonical catalog
 *     (`ALL_OFFICIAL_AHSP_ITEMS` -> AHSP_2026_CANONICAL, 5801 items).
 *   - The legacy Permen PUPR No. 1/PRT/M/2022 baseline is NO LONGER merged in
 *     (§27 — legacy may be archived but never merged into production 2026).
 *   - There is no 'UMUM' fallback category; a missing category is left empty
 *     rather than silently labelled "UMUM" (§3 / §10).
 */

import { AHSPDefinition, AHSPComponentDefinition, AHSPDomain } from '../contracts/types';
import { AHSPNormalizationEngine } from '../normalization/ahspNormalization';
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
   * Ingest the authoritative canonical 2026 catalog.
   */
  private initializeAuthoritativeDatasets(): void {
    this.masterDefinitionsByCode.clear();
    this.masterList = [];

    for (const item of ALL_OFFICIAL_AHSP_ITEMS) {
      const normCode = AHSPNormalizationEngine.normalizeCode(item.codeNormalized || item.code);
      // §25: a record whose source prints no code keeps an empty code and must
      // not be given an invented one. Such records are addressable by id only.
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
        domain: (item.domain as AHSPDomain) || 'CIPTA_KARYA',
        category: item.category || '',
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
          verificationStatus: item.status,
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
